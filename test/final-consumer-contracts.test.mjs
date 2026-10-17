// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyFreshnessToImpact, reconcileProject, verifyImpactFreshness } from '../src/freshness.mjs';
import { AGENT_GUIDE } from '../src/initialize.mjs';
import {
  checkGraph,
  formatImpact,
  loadProject,
  projectCheckOptions,
  projectImpact,
  summarizeContractVerification,
} from '../src/subconscious-lib.mjs';

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPOSITORY, 'examples', 'final-consumer-contracts');
const V050_FIXTURE = path.join(REPOSITORY, 'examples', 'synthetic-project');
const TEMPORARY_ROOT = path.join(REPOSITORY, 'test', 'tmp');
const CLI = path.join(REPOSITORY, 'bin', 'durable-subconscious.mjs');

function fixtureProject() {
  return loadProject({ root: FIXTURE, configPath: 'subconscious/config.json' });
}

function runFixtureTest(relative, env = process.env) {
  const childEnv = { ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', path.join(FIXTURE, relative)], {
    cwd: REPOSITORY,
    env: childEnv,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function contract(result, id) {
  return result.contract_verification.find(item => item.capability_id === id);
}

test('synthetic final-consumer graph validates and distinguishes executed proof from observation', () => {
  const project = fixtureProject();
  const checked = checkGraph(project.graph, projectCheckOptions(project));
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.gaps.map(item => item.code), ['HUMAN_ACCEPTANCE_UNKNOWN']);

  const result = projectImpact(project, ['module.beacon-source']);
  assert.deepEqual(result.unknown, []);
  assert.equal(result.capabilities.length, 4);
  assert.equal(contract(result, 'CAP-SHARED-IDENTITY').status, 'passed');
  assert.deepEqual(contract(result, 'CAP-SHARED-IDENTITY').satisfying_evidence.sort(), [
    'test.archive-final',
    'test.control-panel-final',
  ]);
  assert.equal(contract(result, 'CAP-PANEL-PRESENTATION').status, 'passed');
  assert.equal(contract(result, 'CAP-ARCHIVE-FORMAT').status, 'passed');
  assert.equal(contract(result, 'CAP-PANEL-HUMAN').status, 'unknown');
  assert.match(formatImpact(result), /VERIFICATION BOUNDARIES — UNKNOWN/);
  assert.match(formatImpact(result), /DECLARED COVERAGE ONLY/);
});

test('every named proof is required before a multi-consumer shared contract passes', () => {
  const graph = structuredClone(fixtureProject().graph);
  delete graph.nodes.find(node => node.id === 'test.archive-final').verification;
  const checked = checkGraph(graph, { ...projectCheckOptions(fixtureProject()), exists: () => true });
  assert.deepEqual(checked.errors, []);
  const summary = summarizeContractVerification(graph);
  assert.equal(contract({ contract_verification: summary }, 'CAP-SHARED-IDENTITY').status, 'unknown');
  assert.equal(contract({ contract_verification: summary }, 'CAP-ARCHIVE-FORMAT').status, 'unknown');

  graph.nodes.find(node => node.id === 'test.archive-final').verification = {
    level: 'executed', scope: 'final_consumer', status: 'failed', source: 'AUDIT_DISCOVERED',
    evidence: [{ path: 'evidence/archive-final-consumer.json' }],
  };
  const failed = summarizeContractVerification(graph);
  assert.equal(contract({ contract_verification: failed }, 'CAP-SHARED-IDENTITY').status, 'failed');
  assert.equal(contract({ contract_verification: failed }, 'CAP-ARCHIVE-FORMAT').status, 'failed');
});

test('ordinary CLI impact retrieval returns focused final-consumer obligations and evidence', () => {
  const result = spawnSync(process.execPath, [
    CLI, 'impact', 'source/beacon-source.mjs', '--project', FIXTURE,
    '--config', 'subconscious/config.json', '--json',
  ], { cwd: REPOSITORY, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.freshness.status, 'current');
  assert.equal(contract(output, 'CAP-SHARED-IDENTITY').trusted_status, 'passed');
  assert.equal(contract(output, 'CAP-PANEL-HUMAN').trusted_status, 'unknown');
  assert.ok(output.contract_verification.every(item => item.verification_nodes.length <= 3));
});

test('observed final-surface proof is separate from executed final-consumer proof', () => {
  const graph = structuredClone(fixtureProject().graph);
  graph.nodes.find(node => node.id === 'journey.panel-visible').verification = {
    level: 'observed', scope: 'final_consumer', status: 'passed', source: 'HUMAN_APPROVED',
    evidence: [{ path: 'evidence/panel-human-observation.md' }],
  };
  const summary = summarizeContractVerification(graph);
  assert.equal(contract({ contract_verification: summary }, 'CAP-PANEL-HUMAN').status, 'passed');
  assert.equal(contract({ contract_verification: summary }, 'CAP-PANEL-PRESENTATION').status, 'passed');
});

test('validator rejects malformed or unlinked behavioral verification claims', () => {
  const project = fixtureProject();
  const codes = graph => checkGraph(graph, { ...projectCheckOptions(project), exists: () => true }).errors.map(item => item.code);

  const wrongLevel = structuredClone(project.graph);
  wrongLevel.nodes.find(node => node.id === 'test.control-panel-final').verification.level = 'observed';
  assert.ok(codes(wrongLevel).includes('VERIFICATION_LEVEL'));

  const missingEvidence = structuredClone(project.graph);
  missingEvidence.nodes.find(node => node.id === 'test.control-panel-final').verification.evidence = [];
  assert.ok(codes(missingEvidence).includes('VERIFICATION_EVIDENCE_MISSING'));

  const unlinked = structuredClone(project.graph);
  unlinked.nodes.find(node => node.id === 'CAP-PANEL-PRESENTATION').contract.required_verification.evidence_nodes = ['test.archive-final'];
  assert.ok(codes(unlinked).includes('VERIFICATION_REQUIREMENT_LINK'));

  const incompatibleProof = structuredClone(project.graph);
  incompatibleProof.nodes.find(node => node.id === 'CAP-PANEL-HUMAN').contract.required_verification.evidence_nodes = ['test.control-panel-final'];
  assert.ok(codes(incompatibleProof).includes('VERIFICATION_REQUIREMENT_TYPE'));
});

test('a shallow producer pass does not hide a final-consumer regression', () => {
  const env = { ...process.env, SIGNAL_HARBOR_PANEL_REGRESSION: '1' };
  const shallow = runFixtureTest('test/producer.test.mjs', env);
  assert.equal(shallow.status, 0, shallow.stderr || shallow.stdout);
  const panel = runFixtureTest('test/control-panel.test.mjs', env);
  assert.notEqual(panel.status, 0, 'the deliberately regressed final consumer should fail');
  assert.match(`${panel.stdout}\n${panel.stderr}`, /uppercase presentation|expected/i);
  const archive = runFixtureTest('test/archive-feed.test.mjs', env);
  assert.equal(archive.status, 0, archive.stderr || archive.stdout);
});

test('normal synthetic final consumers pass their distinct contracts', () => {
  for (const relative of ['test/producer.test.mjs', 'test/control-panel.test.mjs', 'test/archive-feed.test.mjs']) {
    const result = runFixtureTest(relative);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test('verification evidence participates in freshness and stale proof is not trusted', () => {
  fs.mkdirSync(TEMPORARY_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(TEMPORARY_ROOT, 'final-consumer-freshness-'));
  try {
    fs.cpSync(FIXTURE, root, { recursive: true });
    let project = loadProject({ root, configPath: 'subconscious/config.json' });
    reconcileProject(project, { acceptCurrentEvidence: true });
    project = loadProject({ root, configPath: 'subconscious/config.json' });
    let remembered = projectImpact(project, ['module.beacon-source']);
    let verified = verifyImpactFreshness(project, remembered);
    assert.equal(verified.status, 'current');
    let current = applyFreshnessToImpact(remembered, verified);
    assert.equal(contract(current, 'CAP-SHARED-IDENTITY').trusted_status, 'passed');

    fs.appendFileSync(path.join(root, 'evidence', 'panel-final-consumer.json'), '\n');
    project = loadProject({ root, configPath: 'subconscious/config.json' });
    remembered = projectImpact(project, ['module.beacon-source']);
    verified = verifyImpactFreshness(project, remembered);
    assert.equal(verified.status, 'stale');
    const stale = applyFreshnessToImpact(remembered, verified);
    assert.equal(contract(stale, 'CAP-SHARED-IDENTITY').recorded_status, 'passed');
    assert.equal(contract(stale, 'CAP-SHARED-IDENTITY').trusted_status, 'unknown');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a focused impact remains bounded in a twelve-system synthetic topology', () => {
  const count = 12;
  const nodes = [{ id: 'owner.scale', type: 'authority', label: 'Synthetic scale owner' }];
  const edges = [];
  const sharedEvidence = [];
  for (let index = 0; index < count; index += 1) {
    const system = `system.${index}`;
    const proof = `test.consumer-${index}`;
    const journey = `journey.consumer-${index}`;
    const capability = `CAP-CONSUMER-${index}`;
    sharedEvidence.push(proof);
    nodes.push(
      { id: system, type: 'system', label: `Synthetic connected system ${index}`, owner: 'owner.scale' },
      {
        id: proof, type: 'test', label: `Synthetic final-consumer proof ${index}`, path: `test/consumer-${index}.test.mjs`, implemented: true,
        verification: { level: 'executed', scope: 'final_consumer', status: 'passed', source: 'AUDIT_DISCOVERED', evidence: [{ path: `evidence/consumer-${index}.json` }] },
      },
      { id: journey, type: 'journey', label: `Synthetic consumer journey ${index}` },
      {
        id: capability, type: 'capability', label: `Synthetic consumer contract ${index}`, accepted: true,
        contract: { kind: 'consumer_specific', required_verification: { level: 'executed', scope: 'final_consumer', evidence_nodes: [proof] } },
        coverage: { human_task: `Exercise synthetic consumer ${index}`, golden: [journey] },
      },
    );
    edges.push(
      { id: `implements-${index}`, from: system, type: 'IMPLEMENTS_CAPABILITY', to: capability, source: 'CANONICAL_CONTRACT', impact: 'forward', evidence: [{ path: 'maps/scale.md' }] },
      { id: `protects-${index}`, from: capability, type: 'PROTECTED_BY_TEST', to: proof, source: 'AUDIT_DISCOVERED', impact: 'forward', evidence: [{ path: `test/consumer-${index}.test.mjs` }] },
    );
    if (index + 1 < count) {
      edges.push({ id: `system-link-${index}`, from: system, type: 'TRANSFORMS', to: `system.${index + 1}`, source: 'CODE_DISCOVERED', impact: 'forward', evidence: [{ path: 'maps/scale.md' }] });
    }
  }
  nodes.push({
    id: 'CAP-SHARED-SCALE', type: 'capability', label: 'Synthetic shared invariant across every connected system', accepted: true,
    contract: { kind: 'shared_invariant', required_verification: { level: 'executed', scope: 'final_consumer', evidence_nodes: sharedEvidence } },
    coverage: { human_task: 'Exercise every synthetic final consumer', golden: ['journey.consumer-0'] },
  });
  for (let index = 0; index < count; index += 1) {
    edges.push(
      { id: `shared-implementation-${index}`, from: `system.${index}`, type: 'IMPLEMENTS_CAPABILITY', to: 'CAP-SHARED-SCALE', source: 'CANONICAL_CONTRACT', impact: 'forward', evidence: [{ path: 'maps/scale.md' }] },
      { id: `shared-proof-${index}`, from: 'CAP-SHARED-SCALE', type: 'PROTECTED_BY_TEST', to: `test.consumer-${index}`, source: 'AUDIT_DISCOVERED', impact: 'forward', evidence: [{ path: `test/consumer-${index}.test.mjs` }] },
    );
  }
  const graph = { schema_version: 1, nodes, edges };
  assert.deepEqual(checkGraph(graph, { exists: () => true }).errors, []);
  const full = summarizeContractVerification(graph);
  assert.equal(contract({ contract_verification: full }, 'CAP-SHARED-SCALE').status, 'passed');

  delete nodes.find(node => node.id === 'test.consumer-11').verification;
  const incomplete = summarizeContractVerification(graph);
  assert.equal(contract({ contract_verification: incomplete }, 'CAP-SHARED-SCALE').status, 'unknown');

  const focused = projectImpact({ graph, root: REPOSITORY, config: { project_name: 'Synthetic Scale', memory_files: [] } }, ['system.5'], { maxDepth: 3 });
  assert.ok(focused.frontiers.length > 0);
  assert.ok(focused.reached.length < nodes.length);
  assert.ok(focused.capabilities.some(item => item.id === 'CAP-SHARED-SCALE'));
});

test('managed agent guidance preserves final-consumer boundaries without mandating broad audits', () => {
  assert.match(AGENT_GUIDE, /passing component test does not\s+prove final-consumer behavior/);
  assert.match(AGENT_GUIDE, /Preserve missing final-consumer proof as\s+UNKNOWN/);
  assert.match(AGENT_GUIDE, /do not expand a\s+localized change into an unrelated full-project audit/);
});

test('existing v0.5.0 graphs remain valid without behavioral verification metadata', () => {
  const project = loadProject({ root: V050_FIXTURE, configPath: 'subconscious/config.json' });
  assert.deepEqual(checkGraph(project.graph, projectCheckOptions(project)).errors, []);
  const result = projectImpact(project, ['inventory.state']);
  assert.ok(result.contract_verification.length > 0);
  assert.ok(result.contract_verification.every(item => item.status === 'not_declared'));
  assert.match(formatImpact(result), /required=not declared/);
});
