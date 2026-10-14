// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ensureConceptIndex, queryConcept, searchConceptIndex } from '../src/concept-index.mjs';
import { applyFreshnessToImpact, reconcileProject, verifyImpactFreshness } from '../src/freshness.mjs';
import { loadProject, projectImpact } from '../src/subconscious-lib.mjs';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPOSITORY, 'bin', 'durable-subconscious.mjs');
const EXAMPLE = path.join(REPOSITORY, 'examples', 'synthetic-project');
const TEST_TEMPORARY_ROOT = path.join(REPOSITORY, 'test', 'tmp');

function run(command, args, { cwd = REPOSITORY, env = process.env } = {}) {
  return spawnSync(command, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
}

function runCli(cli, args, options = {}) {
  return run(process.execPath, [cli, ...args], options);
}

function npmRun(args, cwd) {
  const command = process.platform === 'win32' ? process.execPath : 'npm';
  if (process.platform === 'win32') args.unshift(path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  return run(command, args, { cwd });
}

function npmInstall(root, source) {
  const result = npmRun(['install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', source], root);
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
}

function packPackage(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const result = npmRun(['pack', source, '--pack-destination', destination, '--ignore-scripts'], destination);
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const name = result.stdout.trim().split(/\r?\n/).at(-1);
  const tarball = path.join(destination, name);
  assert.ok(fs.existsSync(tarball), tarball);
  return tarball;
}

function shaFile(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stripManagedGuideBlock(content, name) {
  const expression = new RegExp(`\\n?<!-- durable-subconscious:${name}-guide:start -->[\\s\\S]*?<!-- durable-subconscious:${name}-guide:end -->\\n?`, 'g');
  return content.replace(expression, '\n');
}

function installedCli(root) {
  return path.join(root, 'node_modules', 'durable-subconscious', 'bin', 'durable-subconscious.mjs');
}

function createLegacyFixture(parent, version) {
  const root = path.join(parent, `signal-lab-${version.replaceAll('.', '-')}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: `signal-lab-${version.replaceAll('.', '-')}`, version: '1.0.0', private: true }, null, 2)}\n`);
  npmInstall(root, packPackage(REPOSITORY, path.join(parent, 'packages')));
  const cli = installedCli(root);
  const setup = runCli(cli, ['setup', root, '--agent', 'codex', '--name', 'Fictional Signal Lab'], { cwd: root });
  assert.equal(setup.status, 0, setup.stderr);
  for (const [agent, relative] of [
    ['claude', 'CLAUDE.md'],
    ['copilot', '.github/copilot-instructions.md'],
    ['gemini', 'GEMINI.md'],
  ]) {
    const instruction = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(instruction), { recursive: true });
    fs.writeFileSync(instruction, `# ${agent} maintainer rule\nPreserve this fictional instruction.\n`);
    const integrated = runCli(cli, ['integrate', agent, '--project', root], { cwd: root });
    assert.equal(integrated.status, 0, integrated.stderr);
  }
  const installation = path.join(root, '.durable-subconscious', 'installation.json');
  fs.rmSync(installation, { force: true });
  const guide = path.join(root, '.durable-subconscious', 'agent-guide.md');
  let guideContent = fs.readFileSync(guide, 'utf8');
  guideContent = stripManagedGuideBlock(guideContent, 'concept');
  guideContent = stripManagedGuideBlock(guideContent, 'update');
  if (version.startsWith('0.3.')) guideContent = stripManagedGuideBlock(guideContent, 'freshness');
  fs.writeFileSync(guide, `${guideContent.trimEnd()}\n\n# Maintainer note\nKeep the observatory calibration rule.\n`);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'beacon.mjs'), "export const beacon = 'north';\n");
  const graphFile = path.join(root, '.durable-subconscious', 'graph.json');
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
  graph.nodes.push({
    id: 'module.beacon',
    type: 'module',
    label: 'Beacon signal catalog',
    aliases: ['signal lookup owner', 'observatory beacon'],
    path: 'src/beacon.mjs',
    owner: 'project.maintainer',
    gaps: [{
      code: 'BEACON_ROUTE_UNKNOWN',
      reason: 'The fictional radio route has not been mapped',
      evidence: '.durable-subconscious/maps/ripples.md',
    }],
  });
  fs.writeFileSync(graphFile, `${JSON.stringify(graph, null, 2)}\n`);
  if (version.startsWith('0.4.')) {
    const reconciled = runCli(cli, ['reconcile', '--project', root, '--accept-current-evidence', '--json'], { cwd: root });
    assert.equal(reconciled.status, 0, reconciled.stderr);
    fs.appendFileSync(path.join(root, 'src', 'beacon.mjs'), "export const changedOutsideMemory = true;\n");
  }
  return { root, cli, graphFile, guide };
}

function copyTargetPackage(destination, version) {
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of [
    'bin', 'docs', 'examples', 'src',
    'CONTRIBUTING.md', 'INSTALL.md', 'LICENSE', 'README.md', 'RELEASE_NOTES.md',
    'SECURITY.md', 'package.json', 'package-lock.json',
  ]) {
    fs.cpSync(path.join(REPOSITORY, relative), path.join(destination, relative), { recursive: true });
  }
  const packageFile = path.join(destination, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  packageJson.version = version;
  fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
  const lockFile = path.join(destination, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.version = version;
  lock.packages[''].version = version;
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  const versionFile = path.join(destination, 'src', 'version.mjs');
  fs.writeFileSync(versionFile, fs.readFileSync(versionFile, 'utf8').replace("PACKAGE_VERSION = '0.5.0'", `PACKAGE_VERSION = '${version}'`));
  return packPackage(destination, path.join(path.dirname(destination), 'packages'));
}

test('concept index resolves known and natural-language owners through authoritative freshness', () => {
  fs.mkdirSync(TEST_TEMPORARY_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEST_TEMPORARY_ROOT, 'durable-concept-'));
  try {
    fs.cpSync(EXAMPLE, root, { recursive: true });
    const project = loadProject({ root, configPath: 'subconscious/config.json' });
    const started = performance.now();
    const known = queryConcept(project, 'module.storage', { maxDepth: 1 });
    const elapsed = performance.now() - started;
    assert.equal(known.selected, 'module.storage');
    assert.equal(known.resolution.freshness.status, 'current');
    assert.ok(known.resolution.reached.some(node => node.id === 'inventory.state'));
    assert.ok(elapsed < 10_000, `end-to-end query took ${elapsed}ms`);

    const natural = queryConcept(project, 'inventory storage reader', { maxDepth: 2, limit: 3 });
    assert.equal(natural.selected, 'module.storage');
    assert.equal(natural.candidates[0].authoritative_location, 'source/storage.mjs');
    assert.ok(natural.candidates.length <= 3);
    assert.ok(natural.resolution.reached.some(node => node.id === 'module.catalog'));

    const historical = queryConcept(project, 'catalog contract test', { maxDepth: 1 });
    assert.equal(historical.selected, 'test.catalog');
    assert.equal(historical.candidates[0].authoritative_location, 'test/catalog.test.mjs');

    fs.rmSync(path.join(root, 'source', 'storage.mjs'));
    const missing = queryConcept(loadProject({ root, configPath: 'subconscious/config.json' }), 'module.storage');
    assert.equal(missing.resolution.freshness.status, 'stale');
    assert.ok(missing.resolution.freshness.stale.includes('source/storage.mjs'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('concept index exposes ambiguity and rebuilds after graph changes or cache corruption', () => {
  fs.mkdirSync(TEST_TEMPORARY_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEST_TEMPORARY_ROOT, 'durable-concept-rebuild-'));
  try {
    fs.cpSync(EXAMPLE, root, { recursive: true });
    let project = loadProject({ root, configPath: 'subconscious/config.json' });
    project.graph.nodes.find(node => node.id === 'module.catalog').aliases = ['signal owner'];
    project.graph.nodes.find(node => node.id === 'module.storage').aliases = ['signal owner'];
    fs.writeFileSync(project.graphPath, `${JSON.stringify(project.graph, null, 2)}\n`);
    project = loadProject({ root, configPath: 'subconscious/config.json' });
    reconcileProject(project, { acceptCurrentEvidence: true });
    const cached = ensureConceptIndex(project, { rebuild: true });
    const ambiguous = searchConceptIndex(cached.index, 'signal owner');
    assert.equal(ambiguous.ambiguous, true);
    assert.equal(queryConcept(project, 'signal owner').selection_required, true);
    const selected = queryConcept(project, 'signal owner', { selectId: 'module.storage' });
    assert.equal(selected.selected, 'module.storage');
    assert.equal(selected.resolution.freshness.status, 'current');

    const before = cached.index.graph_sha256;
    project.graph.nodes.find(node => node.id === 'module.storage').aliases.push('durable vault reader');
    fs.writeFileSync(project.graphPath, `${JSON.stringify(project.graph, null, 2)}\n`);
    project = loadProject({ root, configPath: 'subconscious/config.json' });
    const rebuilt = queryConcept(project, 'durable vault reader');
    assert.equal(rebuilt.selected, 'module.storage');
    assert.notEqual(rebuilt.index.graph_sha256, before);
    assert.equal(rebuilt.resolution.freshness.status, 'stale');

    fs.writeFileSync(path.join(root, 'subconscious', 'concept-index.json'), '{broken');
    assert.equal(queryConcept(project, 'durable vault reader').selected, 'module.storage');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('concept retrieval stays bounded and under ten seconds on a 10,000-node fictional graph', t => {
  fs.mkdirSync(TEST_TEMPORARY_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEST_TEMPORARY_ROOT, 'durable-concept-scale-'));
  try {
    const state = path.join(root, '.durable-subconscious');
    fs.mkdirSync(state);
    const nodes = Array.from({ length: 10_000 }, (_, index) => ({
      id: index === 7777 ? 'module.stellar' : `authority.component-${index}`,
      type: index === 7777 ? 'module' : 'authority',
      label: index === 7777 ? 'Stellar route coordinator' : `Fictional component ${index}`,
      ...(index === 7777 ? { aliases: ['deep space message routing'] } : {}),
    }));
    fs.writeFileSync(path.join(state, 'graph.json'), `${JSON.stringify({ schema_version: 1, project: 'Synthetic Scale', nodes, edges: [] })}\n`);
    fs.writeFileSync(path.join(state, 'config.json'), `${JSON.stringify({
      schema_version: 1,
      project_name: 'Synthetic Scale',
      graph: '.durable-subconscious/graph.json',
      freshness: '.durable-subconscious/freshness.json',
      concept_index: '.durable-subconscious/concept-index.json',
      memory_files: [],
      forbidden_path_segments: ['.git', 'node_modules', '.env', 'secrets', 'credentials'],
      graph_rules: { capability_coverage_required: false, expected_capability_count: null, required_capability_ids: [] },
    }, null, 2)}\n`);
    let project = loadProject({ root });
    reconcileProject(project, { acceptCurrentEvidence: true });
    project = loadProject({ root });
    const baselineNaturalStarted = performance.now();
    const baselineNaturalRemembered = projectImpact(project, ['deep space message routing'], { maxDepth: 1 });
    const baselineNatural = applyFreshnessToImpact(baselineNaturalRemembered, verifyImpactFreshness(project, baselineNaturalRemembered));
    const baselineNaturalElapsed = performance.now() - baselineNaturalStarted;
    assert.deepEqual(baselineNatural.unknown, ['deep space message routing']);
    const baselineExactStarted = performance.now();
    const baselineExactRemembered = projectImpact(project, ['module.stellar'], { maxDepth: 1 });
    const baselineExact = applyFreshnessToImpact(baselineExactRemembered, verifyImpactFreshness(project, baselineExactRemembered));
    const baselineExactElapsed = performance.now() - baselineExactStarted;
    assert.deepEqual(baselineExact.targets, ['module.stellar']);
    assert.equal(baselineExact.freshness.status, 'current');
    const started = performance.now();
    const result = queryConcept(project, 'deep space message routing', { maxDepth: 1, limit: 5 });
    const elapsed = performance.now() - started;
    assert.equal(result.selected, 'module.stellar');
    assert.equal(result.resolution.freshness.status, 'current');
    assert.ok(result.candidates.length <= 5);
    assert.ok(result.resolution.reached.length <= 5);
    assert.ok(elapsed < 10_000, `end-to-end large graph query took ${elapsed}ms`);
    const warmStarted = performance.now();
    const warm = queryConcept(project, 'deep space message routing', { maxDepth: 1, limit: 5 });
    const warmElapsed = performance.now() - warmStarted;
    assert.equal(warm.selected, 'module.stellar');
    t.diagnostic(`10k v0.4-exact=${baselineExactElapsed.toFixed(2)}ms v0.4-concept-unknown=${baselineNaturalElapsed.toFixed(2)}ms v0.5-build-query=${elapsed.toFixed(2)}ms v0.5-warm-query=${warmElapsed.toFixed(2)}ms graph=${fs.statSync(path.join(state, 'graph.json')).size} bytes index=${fs.statSync(path.join(state, 'concept-index.json')).size} bytes`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('v0.3 and v0.4 bootstrap upgrades preserve fictional knowledge, gaps, freshness, and authored instructions', () => {
  fs.mkdirSync(TEST_TEMPORARY_ROOT, { recursive: true });
  const parent = fs.mkdtempSync(path.join(TEST_TEMPORARY_ROOT, 'durable-bootstrap-'));
  try {
    for (const version of ['0.3.0', '0.4.0']) {
      const fixture = createLegacyFixture(parent, version);
      const graphHash = shaFile(fixture.graphFile);
      const maps = fs.readdirSync(path.join(fixture.root, '.durable-subconscious', 'maps'))
        .map(file => [file, shaFile(path.join(fixture.root, '.durable-subconscious', 'maps', file))]);
      const freshnessFile = path.join(fixture.root, '.durable-subconscious', 'freshness.json');
      const freshnessHash = fs.existsSync(freshnessFile) ? shaFile(freshnessFile) : null;
      const planned = runCli(fixture.cli, ['update', '--project', fixture.root, '--bootstrap-from', version, '--agent', 'codex'], { cwd: fixture.root });
      assert.equal(planned.status, 0, planned.stderr);
      assert.equal(JSON.parse(planned.stdout).mode, 'plan');
      assert.equal(shaFile(fixture.graphFile), graphHash);

      const applied = runCli(fixture.cli, ['update', '--project', fixture.root, '--bootstrap-from', version, '--agent', 'codex', '--apply'], { cwd: fixture.root });
      assert.equal(applied.status, 0, applied.stderr || applied.stdout);
      const report = JSON.parse(applied.stdout).result.result;
      assert.equal(report.to, '0.5.0');
      assert.equal(report.reconciliation_performed, false);
      assert.equal(report.freshness.status, version.startsWith('0.4.') ? 'stale' : 'unknown');
      assert.equal(shaFile(fixture.graphFile), graphHash);
      for (const [file, hash] of maps) assert.equal(shaFile(path.join(fixture.root, '.durable-subconscious', 'maps', file)), hash);
      if (freshnessHash) assert.equal(shaFile(freshnessFile), freshnessHash);
      const graph = JSON.parse(fs.readFileSync(fixture.graphFile, 'utf8'));
      assert.ok(graph.nodes.find(node => node.id === 'module.beacon').gaps.some(gap => gap.code === 'BEACON_ROUTE_UNKNOWN'));
      assert.match(fs.readFileSync(fixture.guide, 'utf8'), /Keep the observatory calibration rule/);
      assert.match(fs.readFileSync(path.join(fixture.root, 'AGENTS.md'), 'utf8'), /Durable Subconscious/);
      for (const relative of ['CLAUDE.md', '.github/copilot-instructions.md', 'GEMINI.md']) {
        const content = fs.readFileSync(path.join(fixture.root, ...relative.split('/')), 'utf8');
        assert.match(content, /Preserve this fictional instruction/);
        assert.equal(content.split('<!-- durable-subconscious:integration:start -->').length - 1, 1);
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, '.durable-subconscious', 'installation.json'))).installed_version, '0.5.0');

      const query = runCli(fixture.cli, ['query', 'observatory', 'beacon', '--project', fixture.root, '--json'], { cwd: fixture.root });
      assert.equal(query.status, version.startsWith('0.4.') ? 3 : 3, query.stderr);
      assert.equal(JSON.parse(query.stdout).selected, 'module.beacon');
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('future update is idempotent and interrupted or failed updates recover without knowledge loss', () => {
  fs.mkdirSync(TEST_TEMPORARY_ROOT, { recursive: true });
  const parent = fs.mkdtempSync(path.join(TEST_TEMPORARY_ROOT, 'durable-future-update-'));
  try {
    const fixture = createLegacyFixture(parent, '0.4.0');
    let result = runCli(fixture.cli, ['update', '--project', fixture.root, '--bootstrap-from', '0.4.0', '--agent', 'codex', '--apply'], { cwd: fixture.root });
    assert.equal(result.status, 0, result.stderr);
    const package051 = path.join(parent, 'package-0.5.1');
    const package051Source = copyTargetPackage(package051, '0.5.1');
    const graphHash = shaFile(fixture.graphFile);
    const guideBefore = fs.readFileSync(fixture.guide, 'utf8');

    result = runCli(fixture.cli, ['update', '--project', fixture.root, '--to', '0.5.1', '--source', package051Source], { cwd: fixture.root });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).plan.status, 'ready');
    result = runCli(fixture.cli, ['update', '--project', fixture.root, '--to', '0.5.1', '--source', package051Source, '--apply'], { cwd: fixture.root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'node_modules', 'durable-subconscious', 'package.json'))).version, '0.5.1');
    assert.equal(shaFile(fixture.graphFile), graphHash);
    assert.equal(fs.readFileSync(fixture.guide, 'utf8'), guideBefore);

    const cli051 = installedCli(fixture.root);
    const packageJsonAfter051 = fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8');
    const lockAfter051 = fs.readFileSync(path.join(fixture.root, 'package-lock.json'), 'utf8');
    result = runCli(cli051, ['update', '--project', fixture.root, '--to', '0.5.1', '--apply'], { cwd: fixture.root });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).result.status, 'unchanged');
    assert.equal(fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8'), packageJsonAfter051);

    const package052 = path.join(parent, 'package-0.5.2');
    const package052Source = copyTargetPackage(package052, '0.5.2');
    result = runCli(cli051, ['update', '--project', fixture.root, '--to', '0.5.2', '--source', package052Source, '--apply'], {
      cwd: fixture.root,
      env: { ...process.env, DURABLE_SUBCONSCIOUS_UPDATE_INTERRUPT_AFTER_INSTALL: '1' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'node_modules', 'durable-subconscious', 'package.json'))).version, '0.5.2');
    const blocked = runCli(installedCli(fixture.root), ['update', '--project', fixture.root, '--to', '0.5.2', '--source', package052Source], { cwd: fixture.root });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /recover it with update --rollback/);
    const recovered = runCli(installedCli(fixture.root), ['update', '--project', fixture.root, '--rollback', 'latest'], { cwd: fixture.root });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'node_modules', 'durable-subconscious', 'package.json'))).version, '0.5.1');
    assert.equal(fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8'), packageJsonAfter051);
    assert.equal(fs.readFileSync(path.join(fixture.root, 'package-lock.json'), 'utf8'), lockAfter051);
    assert.equal(shaFile(fixture.graphFile), graphHash);

    result = runCli(installedCli(fixture.root), ['update', '--project', fixture.root, '--to', '0.5.2', '--source', package052Source, '--apply'], {
      cwd: fixture.root,
      env: { ...process.env, DURABLE_SUBCONSCIOUS_UPDATE_FAIL_AFTER_INSTALL: '1' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.root, 'node_modules', 'durable-subconscious', 'package.json'))).version, '0.5.1');
    assert.equal(fs.readFileSync(path.join(fixture.root, 'package.json'), 'utf8'), packageJsonAfter051);
    assert.equal(fs.readFileSync(path.join(fixture.root, 'package-lock.json'), 'utf8'), lockAfter051);
    assert.equal(shaFile(fixture.graphFile), graphHash);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
