// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discover } from '../src/discover.mjs';
import { AGENT_GUIDE, initializeProject } from '../src/initialize.mjs';
import {
  detectAgent,
  installAgentIntegration,
  listAgentCompatibility,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  removeAgentIntegration,
  restoreAgentIntegration,
  setupAgent,
} from '../src/agent-integration.mjs';
import {
  CODEX_BLOCK_END,
  CODEX_BLOCK_START,
  installCodexIntegration,
  removeCodexIntegration,
  restoreCodexIntegration,
  setupCodex,
} from '../src/codex-integration.mjs';
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

test('impact retrieves owners, persistence, cache, privacy, capability, tests, and golden journeys', () => {
  const result = projectImpact(exampleProject(), ['inventory.state']);
  assert.deepEqual(result.unknown, []);
  const ids = new Set(result.reached.map(node => node.id));
  for (const id of ['inventory.state', 'module.catalog', 'inventory.cache', 'privacy.tenant', 'CAP-001', 'test.catalog', 'journey.list-items', 'inventory.owner']) assert.ok(ids.has(id), id);
  assert.deepEqual(result.journeys.map(node => node.id), ['journey.list-items']);
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

test('Codex setup preserves existing instructions and is idempotent and removable', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'codex-integration-'));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const agents = path.join(project, 'AGENTS.md');
  const original = '# Existing project instructions\n\nPreserve this line.\n';
  fs.writeFileSync(agents, original);
  try {
    const first = setupCodex(project, { projectName: 'Codex Integration Test' });
    assert.equal(first.initialized, true);
    assert.equal(first.integration.status, 'installed');
    const installed = fs.readFileSync(agents, 'utf8');
    assert.ok(installed.startsWith(original));
    assert.equal(installed.split(CODEX_BLOCK_START).length - 1, 1);
    assert.equal(installed.split(CODEX_BLOCK_END).length - 1, 1);
    assert.ok(fs.existsSync(path.join(project, '.durable-subconscious', 'agent-guide.md')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, '.durable-subconscious', 'config.json'))).graph_rules.capability_coverage_required, true);

    const second = setupCodex(project, { projectName: 'Ignored On Repeat' });
    assert.equal(second.initialized, false);
    assert.equal(second.integration.status, 'unchanged');
    assert.equal(fs.readFileSync(agents, 'utf8'), installed);

    const removed = removeCodexIntegration(project);
    assert.equal(removed.status, 'removed');
    assert.equal(fs.readFileSync(agents, 'utf8'), original);
    assert.ok(fs.existsSync(path.join(project, '.durable-subconscious', 'graph.json')));

    installCodexIntegration(project);
    const restored = restoreCodexIntegration(project);
    assert.equal(restored.status, 'restored');
    assert.equal(fs.readFileSync(agents, 'utf8'), original);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Codex integration preserves later external edits and recovery fails closed', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'codex-external-edit-'));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const agents = path.join(project, 'AGENTS.md');
  const original = '# Existing\n';
  fs.writeFileSync(agents, original);
  try {
    setupCodex(project);
    fs.appendFileSync(agents, '\n# Later project instruction\n');
    assert.throws(() => restoreCodexIntegration(project), /refusing to overwrite later project instructions/);
    removeCodexIntegration(project);
    const afterRemoval = fs.readFileSync(agents, 'utf8');
    assert.ok(afterRemoval.includes('# Existing'));
    assert.ok(afterRemoval.includes('# Later project instruction'));
    assert.doesNotMatch(afterRemoval, /durable-subconscious:integration/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Codex integration safely resumes after a partial recovery-backup write', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'codex-partial-recovery-'));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const agents = path.join(project, 'AGENTS.md');
  const original = '# Existing\n';
  fs.writeFileSync(agents, original);
  try {
    initializeProject(project);
    const integrationDirectory = path.join(project, '.durable-subconscious', 'integrations', 'agents');
    fs.mkdirSync(integrationDirectory, { recursive: true });
    fs.writeFileSync(path.join(integrationDirectory, 'instruction.before-integration'), original);
    const installed = installCodexIntegration(project);
    assert.equal(installed.status, 'installed');
    assert.ok(fs.existsSync(path.join(integrationDirectory, 'manifest.json')));
    assert.ok(fs.readFileSync(agents, 'utf8').includes(CODEX_BLOCK_START));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Codex setup removes newly created state after malformed instruction failure', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'codex-recovery-'));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  const agents = path.join(project, 'AGENTS.md');
  const malformed = `# Existing\n${CODEX_BLOCK_START}\nmissing end\n`;
  fs.writeFileSync(agents, malformed);
  try {
    assert.throws(() => setupCodex(project), /malformed or duplicate/);
    assert.equal(fs.readFileSync(agents, 'utf8'), malformed);
    assert.equal(fs.existsSync(path.join(project, '.durable-subconscious')), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Codex setup and removal work through the project-local CLI contract', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'codex-cli-'));
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  try {
    const setup = run(['setup', project, '--agent', 'codex', '--name', 'CLI Project']);
    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(JSON.parse(setup.stdout).initialized, true);
    const repeated = run(['setup', project, '--agent', 'codex']);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).integration.status, 'unchanged');
    const remove = run(['integrate', 'codex', '--project', project, '--remove']);
    assert.equal(remove.status, 0, remove.stderr);
    assert.equal(fs.existsSync(path.join(project, 'AGENTS.md')), false);
    assert.ok(fs.existsSync(path.join(project, '.durable-subconscious', 'graph.json')));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('all documented agent adapters preserve instructions, reinstall idempotently, and recover', () => {
  const cases = [
    ['codex', 'AGENTS.md'],
    ['claude', 'CLAUDE.md'],
    ['cursor', 'AGENTS.md'],
    ['copilot', '.github/copilot-instructions.md'],
    ['gemini', 'GEMINI.md'],
    ['opencode', 'AGENTS.md'],
  ];
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'agent-adapters-'));
  try {
    for (const [agent, instructionPath] of cases) {
      const project = path.join(temporary, agent);
      const instruction = path.join(project, ...instructionPath.split('/'));
      fs.mkdirSync(path.dirname(instruction), { recursive: true });
      const original = `# Existing ${agent} instructions\n`;
      fs.writeFileSync(instruction, original);
      const first = setupAgent(project, agent, { projectName: `${agent} fixture` });
      assert.equal(first.integration.agent, agent);
      assert.equal(first.integration.status, 'installed');
      const installed = fs.readFileSync(instruction, 'utf8');
      assert.ok(installed.startsWith(original), agent);
      assert.equal(installed.split(MANAGED_BLOCK_START).length - 1, 1, agent);
      assert.equal(installed.split(MANAGED_BLOCK_END).length - 1, 1, agent);
      assert.match(installed, /\.durable-subconscious\/agent-guide\.md/, agent);
      assert.doesNotMatch(installed, /strict-coverage|impact <file/, agent);
      assert.equal(installAgentIntegration(project, agent).status, 'unchanged', agent);
      assert.equal(removeAgentIntegration(project, agent).status, 'removed', agent);
      assert.equal(fs.readFileSync(instruction, 'utf8'), original, agent);
      installAgentIntegration(project, agent);
      assert.equal(restoreAgentIntegration(project, agent).status, 'restored', agent);
      assert.equal(fs.readFileSync(instruction, 'utf8'), original, agent);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('agents sharing AGENTS.md use one canonical managed block', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'shared-agents-'));
  try {
    setupAgent(temporary, 'codex');
    const before = fs.readFileSync(path.join(temporary, 'AGENTS.md'), 'utf8');
    const cursor = installAgentIntegration(temporary, 'cursor');
    const opencode = installAgentIntegration(temporary, 'opencode');
    const after = fs.readFileSync(path.join(temporary, 'AGENTS.md'), 'utf8');
    assert.equal(cursor.status, 'unchanged');
    assert.equal(opencode.status, 'unchanged');
    assert.equal(after, before);
    assert.equal(after.split(MANAGED_BLOCK_START).length - 1, 1);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('v0.2 Codex blocks migrate without losing existing project instructions', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'legacy-codex-'));
  const original = '# Existing\n';
  try {
    initializeProject(temporary);
    fs.writeFileSync(path.join(temporary, 'AGENTS.md'), `${original}\n<!-- durable-subconscious:codex:start -->\nlegacy body\n<!-- durable-subconscious:codex:end -->\n`);
    const result = installAgentIntegration(temporary, 'codex');
    assert.equal(result.status, 'updated');
    const migrated = fs.readFileSync(path.join(temporary, 'AGENTS.md'), 'utf8');
    assert.ok(migrated.startsWith(original));
    assert.doesNotMatch(migrated, /durable-subconscious:codex/);
    assert.equal(migrated.split(MANAGED_BLOCK_START).length - 1, 1);
    removeAgentIntegration(temporary, 'codex');
    assert.equal(fs.readFileSync(path.join(temporary, 'AGENTS.md'), 'utf8'), original);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('v0.2 Codex migration preserves whether AGENTS.md originally existed', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'legacy-codex-absence-'));
  try {
    initializeProject(temporary);
    const instruction = path.join(temporary, 'AGENTS.md');
    fs.writeFileSync(instruction, '<!-- durable-subconscious:codex:start -->\nlegacy body\n<!-- durable-subconscious:codex:end -->\n');
    const legacyDirectory = path.join(temporary, '.durable-subconscious', 'integrations', 'codex');
    fs.mkdirSync(legacyDirectory, { recursive: true });
    fs.writeFileSync(path.join(legacyDirectory, 'manifest.json'), `${JSON.stringify({
      schema_version: 1,
      integration: 'codex',
      agents_path: 'AGENTS.md',
      original_existed: false,
      original_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    }, null, 2)}\n`);
    installAgentIntegration(temporary, 'codex');
    removeAgentIntegration(temporary, 'codex');
    assert.equal(fs.existsSync(instruction), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('agent auto-detection is bounded and compatibility reporting is explicit', () => {
  assert.equal(detectAgent({ CODEX_SESSION_ID: 'one' }), 'codex');
  assert.equal(detectAgent({ CLAUDECODE: '1' }), 'claude');
  assert.equal(detectAgent({ CODEX_SESSION_ID: 'one', GEMINI_CLI: '1' }), null);
  assert.equal(detectAgent({}), null);
  const matrix = listAgentCompatibility();
  assert.deepEqual(matrix.map(entry => entry.id), ['codex', 'claude', 'cursor', 'copilot', 'gemini', 'opencode']);
  assert.equal(matrix.find(entry => entry.id === 'codex').independently_verified, true);
  assert.ok(matrix.filter(entry => entry.id !== 'codex').every(entry => entry.independently_verified === false));
});

test('ambiguous auto-detection fails before creating project state', () => {
  const testTemporaryRoot = path.join(REPOSITORY, 'test', 'tmp');
  fs.mkdirSync(testTemporaryRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(testTemporaryRoot, 'ambiguous-agent-'));
  try {
    assert.throws(
      () => setupAgent(temporary, 'auto', { env: { CODEX_SESSION_ID: 'one', GEMINI_CLI: 'one' } }),
      /Unable to identify one AI environment/,
    );
    assert.equal(fs.existsSync(path.join(temporary, '.durable-subconscious')), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('CLI exposes every supported adapter and rejects unknown environments', () => {
  const listed = run(['agents']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).length, 6);
  const unsupported = run(['setup', '.', '--agent', 'unknown-agent']);
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /Unsupported AI environment/);
});

test('shipped runtime is standalone and contains no host-project or machine path dependency', () => {
  const runtimeFiles = [
    'src/subconscious-lib.mjs',
    'src/discover.mjs',
    'src/initialize.mjs',
    'src/agent-integration.mjs',
    'src/codex-integration.mjs',
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

test('canonical agent guide requires a post-change impact query before completion', () => {
  assert.match(AGENT_GUIDE, /Do not finish the change until the\s+post-change impact query has been executed/);
});

test('package metadata declares AGPL-3.0-only and no dependencies', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'package.json')));
  assert.equal(packageJson.license, 'AGPL-3.0-only');
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);
  assert.ok(packageJson.files.includes('docs'));
  assert.ok(packageJson.files.includes('examples'));
});
