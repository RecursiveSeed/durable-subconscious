// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discover } from '../src/discover.mjs';
import { initializeProject } from '../src/initialize.mjs';
import {
  checkGraph,
  EDGE_TYPES,
  impact,
  loadProject,
  NODE_TYPES,
  projectCheckOptions,
  projectImpact,
  safeProjectPath,
  SOURCES,
  writeGraphAtomic,
} from '../src/subconscious-lib.mjs';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(REPOSITORY, 'examples', 'synthetic-project');
const CLI = path.join(REPOSITORY, 'bin', 'durable-subconscious.mjs');

function exampleProject() {
  return loadProject({ root: EXAMPLE, configPath: 'subconscious/config.json' });
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });
}

test('controlled vocabularies preserve the original typed model', () => {
  for (const type of ['system', 'module', 'authority', 'state', 'storage', 'cache', 'worker', 'route', 'provider', 'surface', 'capability', 'test', 'journey', 'privacy', 'issue']) assert.ok(NODE_TYPES.has(type));
  for (const type of ['OWNS', 'READS', 'WRITES', 'PROJECTS', 'TRANSFORMS', 'PERSISTS', 'HYDRATES', 'CACHES', 'INVALIDATES', 'SCHEDULES', 'CONSUMES', 'FALLS_BACK_TO', 'RECOVERS_WITH', 'MUST_NOT_ACCESS', 'MUST_NOT_CHANGE', 'DISPLAYED_BY', 'IMPLEMENTS_CAPABILITY', 'PROTECTED_BY_TEST']) assert.ok(EDGE_TYPES.has(type));
  for (const source of ['CODE_DISCOVERED', 'CANONICAL_CONTRACT', 'HUMAN_APPROVED', 'AUDIT_DISCOVERED', 'INFERRED_PENDING_REVIEW']) assert.ok(SOURCES.has(source));
});

test('synthetic project validates with its own configured capability contract', () => {
  const project = exampleProject();
  const result = checkGraph(project.graph, projectCheckOptions(project));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.summary.capabilities, 1);
});

test('validator catches ownership, lifecycle, cache, privacy, evidence, and graph errors', () => {
  const project = exampleProject();
  const validate = graph => checkGraph(graph, { ...projectCheckOptions(project), exists: () => true }).errors.map(error => error.code);
  const mutate = callback => { const graph = structuredClone(project.graph); callback(graph); return validate(graph); };
  assert.ok(mutate(graph => { delete graph.nodes.find(node => node.type === 'system').owner; }).includes('SYSTEM_OWNER_MISSING'));
  assert.ok(mutate(graph => { delete graph.nodes.find(node => node.persistent).hydration_owner; }).includes('HYDRATION_MISSING'));
  assert.ok(mutate(graph => { delete graph.nodes.find(node => node.type === 'cache').invalidation_rule; }).includes('INVALIDATION_MISSING'));
  assert.ok(mutate(graph => { delete graph.nodes.find(node => node.private).privacy_boundary; }).includes('PRIVACY_MISSING'));
  assert.ok(mutate(graph => { graph.edges[0].evidence = []; }).includes('EVIDENCE_MISSING'));
  assert.ok(mutate(graph => { graph.edges[0].to = 'missing'; }).includes('DANGLING_NODE'));
  assert.ok(mutate(graph => { graph.edges[0].source = 'GUESSED'; }).includes('PROVENANCE'));
});

test('accepted capabilities require implementation, executable protection, and configured coverage', () => {
  const project = exampleProject();
  const codes = graph => checkGraph(graph, { ...projectCheckOptions(project), exists: () => true }).errors.map(error => error.code);
  const withoutImplementation = structuredClone(project.graph);
  withoutImplementation.edges = withoutImplementation.edges.filter(edge => edge.type !== 'IMPLEMENTS_CAPABILITY');
  assert.ok(codes(withoutImplementation).includes('IMPLEMENTATION_MISSING'));
  const withoutProtection = structuredClone(project.graph);
  withoutProtection.edges = withoutProtection.edges.filter(edge => edge.type !== 'PROTECTED_BY_TEST');
  assert.ok(codes(withoutProtection).includes('REGRESSION_MISSING'));
  const withoutCoverage = structuredClone(project.graph);
  delete withoutCoverage.nodes.find(node => node.type === 'capability').coverage;
  assert.ok(codes(withoutCoverage).includes('COVERAGE_MISSING'));
});

test('safe paths reject traversal, absolute paths, and project-configured sensitive segments', () => {
  const options = { forbiddenPathSegments: ['.env', 'secrets', 'credentials'] };
  for (const candidate of ['../outside', 'C:/outside', '/outside', '.env', 'nested/.env.local', 'secrets/key.txt', 'CREDENTIALS.json']) {
    assert.equal(safeProjectPath(EXAMPLE, candidate, options), null, candidate);
  }
  assert.ok(safeProjectPath(EXAMPLE, 'source/catalog.mjs', options));
});

test('impact retrieves owners, persistence, cache, privacy, capability, and test protection', () => {
  const result = projectImpact(exampleProject(), ['inventory.state']);
  assert.deepEqual(result.unknown, []);
  const ids = new Set(result.reached.map(node => node.id));
  for (const id of ['inventory.state', 'module.catalog', 'inventory.cache', 'privacy.tenant', 'CAP-001', 'test.catalog', 'inventory.owner']) assert.ok(ids.has(id), id);
  assert.ok(result.maps.includes('subconscious/maps/overview.md'));
});

test('impact reports unknown targets and bounded traversal frontiers', () => {
  const project = exampleProject();
  assert.deepEqual(projectImpact(project, ['not-present']).unknown, ['not-present']);
  assert.ok(impact(project.graph, ['inventory.state'], { root: project.root, maxDepth: 1 }).frontiers.length > 0);
});

test('lexical discovery is read-only and reports literal import and API evidence', () => {
  const project = exampleProject();
  const result = discover(['source/catalog.mjs'], { root: project.root, forbiddenPathSegments: project.config.forbidden_path_segments });
  assert.ok(result.imports.some(item => item.target === 'source/storage.mjs' && item.line > 0));
  assert.ok(result.apiStrings.some(item => item.route === '/api/items'));
  assert.deepEqual(result.unresolved, []);
});

test('CLI check, impact, discovery, and unknown-target exits are stable', () => {
  const common = ['--project', EXAMPLE, '--config', 'subconscious/config.json'];
  const check = run(['check', ...common, '--json']);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).summary.errors, 0);
  const impactRun = run(['impact', 'inventory.state', ...common, '--json']);
  assert.equal(impactRun.status, 0, impactRun.stderr);
  assert.ok(JSON.parse(impactRun.stdout).capabilities.some(node => node.id === 'CAP-001'));
  const discovery = run(['discover', ...common]);
  assert.equal(discovery.status, 0, discovery.stderr);
  assert.ok(JSON.parse(discovery.stdout).imports.length > 0);
  const unknown = run(['impact', 'not-present', ...common, '--json']);
  assert.equal(unknown.status, 2);
});

test('unfamiliar projects initialize, persist across processes, and remain isolated', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'durable-subconscious-'));
  const projectA = path.join(temporary, 'project-a');
  const projectB = path.join(temporary, 'project-b');
  fs.mkdirSync(projectA); fs.mkdirSync(projectB);
  try {
    const initializedA = initializeProject(projectA, { projectName: 'Project A' });
    const initializedB = initializeProject(projectB, { projectName: 'Project B' });
    assert.ok(fs.existsSync(initializedA.configPath));
    assert.ok(fs.existsSync(initializedB.configPath));
    assert.throws(() => initializeProject(projectA), /never overwrites/);

    fs.mkdirSync(path.join(projectA, 'src'));
    fs.writeFileSync(path.join(projectA, 'src', 'feature.mjs'), 'export const feature = true;\n');
    const loadedA = loadProject({ root: projectA });
    loadedA.graph.nodes.push({ id: 'feature.a', type: 'module', label: 'Project A feature', path: 'src/feature.mjs', owner: 'project.maintainer' });
    loadedA.graph.edges.push({
      id: 'project-a-feature',
      from: 'project',
      type: 'PROJECTS',
      to: 'feature.a',
      source: 'CODE_DISCOVERED',
      impact: 'forward',
      evidence: [{ path: 'src/feature.mjs' }],
    });
    writeGraphAtomic(loadedA.graph, loadedA.graphPath, { root: projectA });

    const restartCheck = run(['check', '--project', projectA, '--json']);
    assert.equal(restartCheck.status, 0, restartCheck.stderr);
    assert.equal(JSON.parse(restartCheck.stdout).summary.nodes, 3);
    const restartedImpact = run(['impact', 'feature.a', '--project', projectA, '--json']);
    assert.equal(restartedImpact.status, 0, restartedImpact.stderr);
    assert.ok(JSON.parse(restartedImpact.stdout).targets.includes('feature.a'));
    const isolatedImpact = run(['impact', 'feature.a', '--project', projectB, '--json']);
    assert.equal(isolatedImpact.status, 2);
    assert.deepEqual(JSON.parse(isolatedImpact.stdout).unknown, ['feature.a']);
    assert.equal(loadProject({ root: projectB }).graph.nodes.some(node => node.id === 'feature.a'), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('shipped runtime is standalone and contains no host-project or machine path dependency', () => {
  const runtimeFiles = [
    'src/subconscious-lib.mjs',
    'src/discover.mjs',
    'src/initialize.mjs',
    'bin/durable-subconscious.mjs',
  ];
  for (const relative of runtimeFiles) {
    const source = fs.readFileSync(path.join(REPOSITORY, relative), 'utf8');
    assert.doesNotMatch(source, /[A-Z]:\\Users\\|ApiKey\.txt/);
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `${relative}: ${match[1]}`);
    }
  }
});

test('package metadata declares AGPL-3.0-only and no dependencies', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json')));
  assert.equal(packageJson.license, 'AGPL-3.0-only');
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);
});
