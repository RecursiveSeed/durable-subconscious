// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAgentIntegration } from './agent-integration.mjs';
import { ensureConceptIndex } from './concept-index.mjs';
import { verifyProjectFreshness } from './freshness.mjs';
import { ensureAgentGuide } from './initialize.mjs';
import { checkGraph, DEFAULT_STATE_DIRECTORY, loadProject, projectCheckOptions } from './subconscious-lib.mjs';
import { INSTALLATION_SCHEMA_VERSION, PACKAGE_VERSION, UPDATE_COMPATIBILITY, UPDATE_TRANSACTION_SCHEMA_VERSION } from './version.mjs';

const ADAPTER_AGENT = Object.freeze({ agents: 'codex', claude: 'claude', copilot: 'copilot', gemini: 'gemini' });
const ADAPTER_INSTRUCTION = Object.freeze({
  agents: 'AGENTS.md',
  claude: 'CLAUDE.md',
  copilot: '.github/copilot-instructions.md',
  gemini: 'GEMINI.md',
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.new`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, file);
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || '').trim());
  if (!match) throw new Error(`Expected a stable semantic version, got: ${value}`);
  if (match[4]) throw new Error(`Prerelease versions are not selected by the stable updater: ${value}`);
  return { value: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`, parts: match.slice(1, 4).map(Number) };
}

function compareVersions(a, b) {
  const left = parseVersion(a).parts;
  const right = parseVersion(b).parts;
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}

function installationPath(root) {
  return path.join(root, DEFAULT_STATE_DIRECTORY, 'installation.json');
}

function transactionRoot(root) {
  return path.join(root, DEFAULT_STATE_DIRECTORY, 'update-transactions');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function installedPackage(root) {
  const file = path.join(root, 'node_modules', 'durable-subconscious', 'package.json');
  if (!fs.existsSync(file)) throw new Error('Project-local node_modules/durable-subconscious is missing; use the supported project-local npm installation');
  return { file, metadata: readJson(file) };
}

function projectPackage(root) {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) throw new Error('Project package.json is missing; the supported updater requires a project-local npm installation');
  return { file, metadata: readJson(file) };
}

function packageSpec(metadata) {
  return metadata.devDependencies?.['durable-subconscious'] || metadata.dependencies?.['durable-subconscious'] || null;
}

function installedAdapters(root) {
  const integrationRoot = path.join(root, DEFAULT_STATE_DIRECTORY, 'integrations');
  if (!fs.existsSync(integrationRoot)) return [];
  return fs.readdirSync(integrationRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && ADAPTER_AGENT[entry.name] && fs.existsSync(path.join(integrationRoot, entry.name, 'manifest.json')))
    .map(entry => entry.name)
    .sort();
}

function sourceSpecFor(root, currentSpec, targetVersion, explicitSource) {
  if (explicitSource) {
    if (/^(?:\.|\/|[A-Za-z]:[\\/])/.test(explicitSource)) return path.resolve(root, explicitSource);
    return explicitSource;
  }
  if (!currentSpec) throw new Error('Durable Subconscious is not recorded in project dependencies');
  if (/^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)/.test(currentSpec)) {
    return `${currentSpec.replace(/#.*$/, '')}#v${targetVersion}`;
  }
  if (/^(?:file:|link:|\.|\/|[A-Za-z]:[\\/])/.test(currentSpec)) {
    throw new Error('A local/path installation needs --source <package-path-or-spec> for a versioned update');
  }
  return `durable-subconscious@${targetVersion}`;
}

function latestGitHubVersion(currentSpec) {
  const repository = currentSpec?.match(/github:([^#]+)/)?.[1] || 'RecursiveSeed/durable-subconscious';
  const remote = `https://github.com/${repository.replace(/\.git$/, '')}.git`;
  const result = spawnSync('git', ['ls-remote', '--tags', '--refs', remote, 'v*'], { encoding: 'utf8', windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
  if ((result.status ?? 1) !== 0) throw new Error(`Unable to identify the latest stable GitHub release: ${(result.stderr || result.error?.message || '').trim()}`);
  const versions = (result.stdout || '').split(/\r?\n/)
    .map(line => line.match(/refs\/tags\/v(\d+\.\d+\.\d+)$/)?.[1])
    .filter(Boolean)
    .map(value => parseVersion(value).value)
    .sort(compareVersions);
  if (!versions.length) throw new Error('No stable vMAJOR.MINOR.PATCH GitHub tags were found; select --to explicitly');
  return versions.at(-1);
}

function resolveTargetVersion(requested, currentSpec) {
  return requested === 'latest' ? latestGitHubVersion(currentSpec) : parseVersion(requested).value;
}

function protectedKnowledge(root) {
  const state = path.join(root, DEFAULT_STATE_DIRECTORY);
  const records = [];
  const skipTop = new Set(['agent-guide.md', 'concept-index.json', 'installation.json', 'update-transactions', 'freshness-reconciliation.lock']);
  const visit = (directory, topLevel = false) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (topLevel && skipTop.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) throw new Error(`Project knowledge contains an unsupported symbolic link: ${relative}`);
      if (entry.isDirectory()) visit(full, false);
      else if (entry.isFile()) {
        const content = fs.readFileSync(full);
        records.push({ path: relative, sha256: sha256(content), size: content.length });
      }
    }
  };
  visit(state, true);
  return records;
}

function sameProtectedKnowledge(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function mutableFiles(adapters) {
  return [...new Set([
    'package.json',
    'package-lock.json',
    'node_modules/.package-lock.json',
    'node_modules/.bin/durable-subconscious',
    'node_modules/.bin/durable-subconscious.cmd',
    'node_modules/.bin/durable-subconscious.ps1',
    `${DEFAULT_STATE_DIRECTORY}/agent-guide.md`,
    `${DEFAULT_STATE_DIRECTORY}/installation.json`,
    ...adapters.map(adapter => ADAPTER_INSTRUCTION[adapter]),
  ])].filter(Boolean).sort();
}

function incompleteTransactions(root) {
  const directory = transactionRoot(root);
  if (!fs.existsSync(directory)) return [];
  const pending = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runtime = path.join(directory, entry.name, 'runtime.json');
    if (!fs.existsSync(runtime)) continue;
    const status = readJson(runtime).status;
    if (!['complete', 'rolled_back', 'failed_preflight'].includes(status)) pending.push({ id: entry.name, status });
  }
  return pending.sort((a, b) => a.id.localeCompare(b.id));
}

export function inspectInstallation(root) {
  const projectRoot = path.resolve(root);
  const project = projectPackage(projectRoot);
  const installed = installedPackage(projectRoot);
  const manifestFile = installationPath(projectRoot);
  const manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : null;
  return {
    project_root: projectRoot,
    dependency_spec: packageSpec(project.metadata),
    package_version: installed.metadata.version,
    installation: manifest,
    adapters: installedAdapters(projectRoot),
    incomplete_transactions: incompleteTransactions(projectRoot),
  };
}

export function planUpdate(root, {
  to = 'latest',
  source = null,
  bootstrapFrom = null,
  agent = null,
} = {}) {
  const inspection = inspectInstallation(root);
  if (inspection.incomplete_transactions.length) {
    const item = inspection.incomplete_transactions.at(-1);
    throw new Error(`Update transaction ${item.id} is ${item.status}; recover it with update --rollback ${item.id}`);
  }
  let currentVersion;
  let targetVersion;
  let bootstrap = false;
  if (bootstrapFrom) {
    currentVersion = parseVersion(bootstrapFrom).value;
    targetVersion = parseVersion(inspection.package_version).value;
    bootstrap = true;
    if (inspection.installation) throw new Error('Installation metadata already exists; bootstrap is only for pre-v0.5 installations');
    if (!['0.3', '0.4'].includes(currentVersion.split('.').slice(0, 2).join('.'))) throw new Error('The one-time bootstrap supports v0.3.x and v0.4.x only');
  } else {
    if (!inspection.installation) throw new Error('This pre-v0.5 installation needs the documented one-time --bootstrap-from 0.3.0 or 0.4.0 workflow');
    if (inspection.installation.schema_version !== INSTALLATION_SCHEMA_VERSION) throw new Error('Unsupported installation metadata schema');
    currentVersion = parseVersion(inspection.installation.installed_version).value;
    if (currentVersion !== parseVersion(inspection.package_version).value) throw new Error('Installed package and project installation metadata disagree; recover or bootstrap explicitly');
    targetVersion = resolveTargetVersion(to, inspection.dependency_spec);
  }
  const adapters = [...new Set([
    ...inspection.adapters,
    ...(agent ? [agent === 'codex' || agent === 'cursor' || agent === 'opencode' ? 'agents' : agent] : []),
  ])].sort();
  for (const adapter of adapters) if (!ADAPTER_AGENT[adapter]) throw new Error(`Unsupported integration adapter in update plan: ${adapter}`);
  const comparison = compareVersions(targetVersion, currentVersion);
  if (!bootstrap && comparison < 0) throw new Error(`Downgrades are not supported: ${currentVersion} to ${targetVersion}`);
  const status = !bootstrap && comparison === 0 ? 'current' : 'ready';
  const sourceSpec = bootstrap || status === 'current' ? null : sourceSpecFor(inspection.project_root, inspection.dependency_spec, targetVersion, source);
  return {
    schema_version: UPDATE_TRANSACTION_SCHEMA_VERSION,
    transaction_id: `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`,
    project_root: inspection.project_root,
    package_directory: 'node_modules/durable-subconscious',
    current_version: currentVersion,
    target_version: targetVersion,
    dependency_spec: inspection.dependency_spec,
    source_spec: sourceSpec,
    bootstrap,
    status,
    adapters,
    mutable_files: mutableFiles(adapters),
    protected_knowledge: protectedKnowledge(inspection.project_root),
    proposed_changes: status === 'current' ? [] : [
      ...(bootstrap ? [] : [`Install durable-subconscious ${targetVersion} from ${sourceSpec}`]),
      'Refresh the canonical managed agent guide',
      ...(adapters.length ? [`Refresh managed adapters: ${adapters.join(', ')}`] : []),
      'Build the derived concept navigation index',
      'Verify graph structure, freshness status, and unchanged project knowledge',
      'Record version-aware installation metadata',
    ],
    preserved: ['graph knowledge', 'maps', 'freshness baseline and history', 'evidence history', 'unresolved gaps', 'content outside managed instruction blocks'],
  };
}

function helperSource() {
  return fileURLToPath(new URL('./update-helper.mjs', import.meta.url));
}

function executeHelper(transaction, mode = 'apply') {
  const helper = path.join(path.dirname(transaction), 'update-helper.mjs');
  if (!fs.existsSync(helper)) fs.copyFileSync(helperSource(), helper, fs.constants.COPYFILE_EXCL);
  const result = spawnSync(process.execPath, [helper, transaction, mode], {
    cwd: path.dirname(transaction),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  const resultFile = path.join(path.dirname(transaction), 'helper-result.json');
  const report = fs.existsSync(resultFile) ? readJson(resultFile) : null;
  if ((result.status ?? 1) !== 0) throw new Error(report?.error || result.stderr.trim() || 'Update helper failed');
  return report;
}

export function applyUpdate(plan) {
  if (plan.status === 'current') return { status: 'unchanged', current_version: plan.current_version };
  const root = transactionRoot(plan.project_root);
  fs.mkdirSync(root, { recursive: true });
  const directory = path.join(root, plan.transaction_id);
  fs.mkdirSync(directory, { recursive: false });
  const transaction = path.join(directory, 'transaction.json');
  atomicJson(transaction, { ...plan, created_at: new Date().toISOString() });
  fs.copyFileSync(helperSource(), path.join(directory, 'update-helper.mjs'), fs.constants.COPYFILE_EXCL);
  return executeHelper(transaction);
}

export function rollbackUpdate(root, id = 'latest') {
  const directory = transactionRoot(path.resolve(root));
  if (!fs.existsSync(directory)) throw new Error('No update transactions exist');
  const ids = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const selected = id === 'latest' ? ids.at(-1) : id;
  if (!selected || !ids.includes(selected)) throw new Error(`Update transaction not found: ${id}`);
  return executeHelper(path.join(directory, selected, 'transaction.json'), 'rollback');
}

export function finalizeUpdate(transactionFile, { expectedRoot = null } = {}) {
  const plan = readJson(path.resolve(transactionFile));
  if (plan.schema_version !== UPDATE_TRANSACTION_SCHEMA_VERSION) throw new Error('Unsupported update transaction schema');
  if (plan.target_version !== PACKAGE_VERSION) throw new Error(`Installed finalizer ${PACKAGE_VERSION} does not match target ${plan.target_version}`);
  const root = path.resolve(plan.project_root);
  if (expectedRoot && root !== path.resolve(expectedRoot)) throw new Error('Update transaction targets a different project root');
  if (!sameProtectedKnowledge(plan.protected_knowledge, protectedKnowledge(root))) {
    throw new Error('Project knowledge changed during the package update; refusing to finalize');
  }
  if (process.env.DURABLE_SUBCONSCIOUS_UPDATE_FAIL_AFTER_INSTALL === '1') throw new Error('Injected post-install verification failure');
  const guide = ensureAgentGuide(root);
  const integrations = plan.adapters.map(adapter => installAgentIntegration(root, ADAPTER_AGENT[adapter]));
  const project = loadProject({ root });
  const structural = checkGraph(project.graph, projectCheckOptions(project));
  if (structural.errors.length) throw new Error(`Updated installation has ${structural.errors.length} structural graph error(s)`);
  const freshness = verifyProjectFreshness(project);
  const concept = ensureConceptIndex(project, { rebuild: true });
  if (!sameProtectedKnowledge(plan.protected_knowledge, protectedKnowledge(root))) {
    throw new Error('Project knowledge changed while refreshing managed update files; refusing to finalize');
  }
  const manifest = {
    schema_version: INSTALLATION_SCHEMA_VERSION,
    installed_version: PACKAGE_VERSION,
    state_schema: UPDATE_COMPATIBILITY.state_schema,
    graph_schema: UPDATE_COMPATIBILITY.graph_schema,
    freshness_schema: UPDATE_COMPATIBILITY.freshness_schema,
    package_spec: plan.source_spec || plan.dependency_spec,
    integration_adapters: plan.adapters,
    previous_version: plan.current_version,
    last_transaction: plan.transaction_id,
  };
  atomicJson(installationPath(root), manifest);
  const result = {
    status: 'updated',
    from: plan.current_version,
    to: PACKAGE_VERSION,
    bootstrap: plan.bootstrap,
    guide,
    integrations,
    concept_index: { status: concept.status, candidates: concept.index.entries.length, authority: concept.index.authority },
    structural: structural.summary,
    freshness: {
      status: freshness.status,
      baseline: freshness.baseline,
      stale: freshness.stale || [],
      unknown: freshness.unknown || [],
      disclaimer: freshness.disclaimer,
    },
    protected_knowledge_files: plan.protected_knowledge.length,
    reconciliation_performed: false,
  };
  atomicJson(path.join(path.dirname(path.resolve(transactionFile)), 'finalize-result.json'), result);
  return result;
}
