// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureAgentGuide, initializeProject } from './initialize.mjs';
import { DEFAULT_STATE_DIRECTORY, loadProject } from './subconscious-lib.mjs';

export const MANAGED_BLOCK_START = '<!-- durable-subconscious:integration:start -->';
export const MANAGED_BLOCK_END = '<!-- durable-subconscious:integration:end -->';
export const LEGACY_CODEX_BLOCK_START = '<!-- durable-subconscious:codex:start -->';
export const LEGACY_CODEX_BLOCK_END = '<!-- durable-subconscious:codex:end -->';

const SHARED_GUIDANCE = `## Durable Subconscious (managed integration)

At the start of every development session, before changing project files, read
and follow \`.durable-subconscious/agent-guide.md\`. It is the canonical Durable
Subconscious workflow for every supported AI environment. It supplements existing
project instructions and authority; it does not replace them.`;

const ADAPTERS = {
  agents: {
    id: 'agents',
    instructionPath: 'AGENTS.md',
    agents: ['codex', 'cursor', 'opencode'],
    documentationStatus: 'documented',
  },
  claude: {
    id: 'claude',
    instructionPath: 'CLAUDE.md',
    agents: ['claude'],
    documentationStatus: 'documented',
    prefix: '@.durable-subconscious/agent-guide.md\n\n',
  },
  copilot: {
    id: 'copilot',
    instructionPath: '.github/copilot-instructions.md',
    agents: ['copilot'],
    documentationStatus: 'documented',
  },
  gemini: {
    id: 'gemini',
    instructionPath: 'GEMINI.md',
    agents: ['gemini'],
    documentationStatus: 'documented',
    prefix: '@./.durable-subconscious/agent-guide.md\n\n',
  },
};

export const SUPPORTED_AGENTS = Object.freeze({
  codex: { adapter: 'agents', label: 'OpenAI Codex', verified: true },
  claude: { adapter: 'claude', label: 'Claude Code', verified: false },
  cursor: { adapter: 'agents', label: 'Cursor', verified: false },
  copilot: { adapter: 'copilot', label: 'GitHub Copilot', verified: false },
  gemini: { adapter: 'gemini', label: 'Gemini CLI', verified: false },
  opencode: { adapter: 'agents', label: 'OpenCode', verified: false },
});

const ALIASES = new Map([
  ['claude-code', 'claude'],
  ['github-copilot', 'copilot'],
  ['gemini-cli', 'gemini'],
  ['open-code', 'opencode'],
]);

function normalizeAgent(agent) {
  const normalized = String(agent || '').trim().toLowerCase();
  return ALIASES.get(normalized) || normalized;
}

export function detectAgent(env = process.env) {
  const has = name => Object.prototype.hasOwnProperty.call(env, name);
  const detected = [];
  if (has('CODEX_SESSION_ID') || has('CODEX_THREAD_ID') || has('CODEX_CI')) detected.push('codex');
  if (has('CLAUDECODE') || has('CLAUDE_CODE_SESSION_ID')) detected.push('claude');
  if (has('CURSOR_AGENT') || has('CURSOR_TRACE_ID')) detected.push('cursor');
  if (has('GITHUB_COPILOT_AGENT') || has('COPILOT_AGENT')) detected.push('copilot');
  if (has('GEMINI_CLI') || has('GEMINI_SESSION_ID')) detected.push('gemini');
  if (has('OPENCODE') || has('OPENCODE_SESSION_ID')) detected.push('opencode');
  return detected.length === 1 ? detected[0] : null;
}

export function resolveAgent(agent, env = process.env) {
  const requested = normalizeAgent(agent || 'auto');
  const resolved = requested === 'auto' ? detectAgent(env) : requested;
  if (!resolved) {
    throw new Error(`Unable to identify one AI environment automatically; choose --agent ${Object.keys(SUPPORTED_AGENTS).join('|')}`);
  }
  if (!SUPPORTED_AGENTS[resolved]) {
    throw new Error(`Unsupported AI environment: ${requested}. Choose ${Object.keys(SUPPORTED_AGENTS).join(', ')}`);
  }
  return resolved;
}

export function listAgentCompatibility() {
  return Object.entries(SUPPORTED_AGENTS).map(([id, agent]) => {
    const adapter = ADAPTERS[agent.adapter];
    return {
      id,
      label: agent.label,
      instruction_path: adapter.instructionPath,
      automatic_instruction_loading: adapter.documentationStatus === 'documented',
      independently_verified: agent.verified,
    };
  });
}

function blockFor(adapter) {
  return `${MANAGED_BLOCK_START}\n${adapter.prefix || ''}${SHARED_GUIDANCE}\n${MANAGED_BLOCK_END}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function count(text, token) {
  return text.split(token).length - 1;
}

function pairRange(text, startToken, endToken, label, { allowAbsent = false } = {}) {
  const starts = count(text, startToken);
  const ends = count(text, endToken);
  if (starts === 0 && ends === 0 && allowAbsent) return null;
  if (starts !== 1 || ends !== 1) throw new Error(`${label} has malformed or duplicate Durable Subconscious markers; refusing to overwrite it`);
  const start = text.indexOf(startToken);
  const end = text.indexOf(endToken, start);
  if (end < start) throw new Error(`${label} has out-of-order Durable Subconscious markers; refusing to overwrite it`);
  return { start, end: end + endToken.length };
}

function managedRange(text, adapter, { allowAbsent = false } = {}) {
  const current = pairRange(text, MANAGED_BLOCK_START, MANAGED_BLOCK_END, adapter.instructionPath, { allowAbsent: true });
  const legacy = adapter.id === 'agents'
    ? pairRange(text, LEGACY_CODEX_BLOCK_START, LEGACY_CODEX_BLOCK_END, adapter.instructionPath, { allowAbsent: true })
    : null;
  if (current && legacy) throw new Error(`${adapter.instructionPath} contains both current and legacy Durable Subconscious blocks; refusing to overwrite it`);
  if (current) return { ...current, legacy: false };
  if (legacy) return { ...legacy, legacy: true };
  if (allowAbsent) return null;
  return pairRange(text, MANAGED_BLOCK_START, MANAGED_BLOCK_END, adapter.instructionPath);
}

function renderWithManagedBlock(original, block) {
  if (!original) return `${block}\n`;
  const separator = original.endsWith('\n') ? '\n' : '\n\n';
  return `${original}${separator}${block}\n`;
}

function removeRange(current, range) {
  let before = current.slice(0, range.start);
  let after = current.slice(range.end);
  if (after.startsWith('\r\n')) after = after.slice(2);
  else if (after.startsWith('\n')) after = after.slice(1);
  if (before.endsWith('\r\n\r\n')) before = before.slice(0, -2);
  else if (before.endsWith('\n\n')) before = before.slice(0, -1);
  return `${before}${after}`;
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.durable-subconscious-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function integrationPaths(root, adapter) {
  const projectRoot = path.resolve(root);
  const directory = path.join(projectRoot, DEFAULT_STATE_DIRECTORY, 'integrations', adapter.id);
  return {
    projectRoot,
    target: path.join(projectRoot, ...adapter.instructionPath.split('/')),
    directory,
    manifest: path.join(directory, 'manifest.json'),
    backup: path.join(directory, 'instruction.before-integration'),
  };
}

function readManifest(paths) {
  if (!fs.existsSync(paths.manifest)) return null;
  return JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
}

function originalFromManifest(paths, manifest) {
  if (!manifest) return null;
  if (!manifest.original_existed) return '';
  if (!fs.existsSync(paths.backup)) throw new Error('Agent integration backup is missing; refusing recovery');
  const original = fs.readFileSync(paths.backup, 'utf8');
  if (sha256(original) !== manifest.original_sha256) throw new Error('Agent integration backup hash mismatch; refusing recovery');
  return original;
}

function legacyCodexOriginalExisted(projectRoot) {
  const directory = path.join(projectRoot, DEFAULT_STATE_DIRECTORY, 'integrations', 'codex');
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.integration !== 'codex' || manifest.agents_path !== 'AGENTS.md') {
    throw new Error('Legacy Codex recovery manifest is invalid; refusing migration');
  }
  if (manifest.original_existed) {
    const backupPath = path.join(directory, 'AGENTS.md.before-integration');
    if (!fs.existsSync(backupPath)) throw new Error('Legacy Codex integration backup is missing; refusing migration');
    const original = fs.readFileSync(backupPath, 'utf8');
    if (sha256(original) !== manifest.original_sha256) throw new Error('Legacy Codex integration backup hash mismatch; refusing migration');
  }
  return Boolean(manifest.original_existed);
}

function writeInitialRecovery(paths, adapter, original, originalExisted, block) {
  fs.mkdirSync(paths.directory, { recursive: true });
  if (fs.existsSync(paths.manifest)) {
    const existing = readManifest(paths);
    if (existing.instruction_path !== adapter.instructionPath) throw new Error('Agent integration manifest targets a different instruction file; refusing to overwrite it');
    return existing;
  }
  if (originalExisted) {
    if (fs.existsSync(paths.backup)) {
      if (fs.readFileSync(paths.backup, 'utf8') !== original) throw new Error('A partial agent integration backup does not match the instruction file; refusing to overwrite it');
    } else {
      fs.writeFileSync(paths.backup, original, { encoding: 'utf8', flag: 'wx' });
    }
  }
  const manifest = {
    schema_version: 1,
    integration: adapter.id,
    instruction_path: adapter.instructionPath,
    original_existed: originalExisted,
    original_sha256: sha256(original),
    managed_block_sha256: sha256(block),
  };
  atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function adapterFor(agent, env) {
  const resolvedAgent = resolveAgent(agent, env);
  return { resolvedAgent, adapter: ADAPTERS[SUPPORTED_AGENTS[resolvedAgent].adapter] };
}

export function installAgentIntegration(root, agent, { env = process.env } = {}) {
  const { resolvedAgent, adapter } = adapterFor(agent, env);
  const paths = integrationPaths(root, adapter);
  loadProject({ root: paths.projectRoot });
  const targetExisted = fs.existsSync(paths.target);
  const current = targetExisted ? fs.readFileSync(paths.target, 'utf8') : '';
  const range = managedRange(current, adapter, { allowAbsent: true });
  const block = blockFor(adapter);
  ensureAgentGuide(paths.projectRoot);
  const baseline = range ? removeRange(current, range) : current;
  const legacyOriginalExisted = range?.legacy ? legacyCodexOriginalExisted(paths.projectRoot) : null;
  const originalExisted = range?.legacy
    ? Boolean(baseline) || (legacyOriginalExisted ?? targetExisted)
    : targetExisted;
  const next = range
    ? `${current.slice(0, range.start)}${block}${current.slice(range.end)}`
    : renderWithManagedBlock(current, block);
  writeInitialRecovery(paths, adapter, baseline, originalExisted, block);
  if (next === current) return { status: 'unchanged', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target, integrationDirectory: paths.directory };
  atomicWrite(paths.target, next);
  return { status: range ? 'updated' : 'installed', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target, integrationDirectory: paths.directory };
}

export function removeAgentIntegration(root, agent, { env = process.env } = {}) {
  const { resolvedAgent, adapter } = adapterFor(agent, env);
  const paths = integrationPaths(root, adapter);
  const manifest = readManifest(paths);
  if (!fs.existsSync(paths.target)) return { status: 'unchanged', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target };
  const current = fs.readFileSync(paths.target, 'utf8');
  const range = managedRange(current, adapter, { allowAbsent: true });
  if (!range) return { status: 'unchanged', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target };
  const original = originalFromManifest(paths, manifest);
  const block = blockFor(adapter);
  const next = original !== null && current === renderWithManagedBlock(original, block)
    ? original
    : removeRange(current, range);
  if (!next && manifest?.original_existed === false) fs.unlinkSync(paths.target);
  else atomicWrite(paths.target, next);
  return { status: 'removed', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target };
}

export function restoreAgentIntegration(root, agent, { env = process.env } = {}) {
  const { resolvedAgent, adapter } = adapterFor(agent, env);
  const paths = integrationPaths(root, adapter);
  const manifest = readManifest(paths);
  if (!manifest) throw new Error(`No ${adapter.id} integration recovery manifest exists`);
  const original = originalFromManifest(paths, manifest);
  const currentExists = fs.existsSync(paths.target);
  const current = currentExists ? fs.readFileSync(paths.target, 'utf8') : '';
  const installed = renderWithManagedBlock(original, blockFor(adapter));
  if (currentExists && current !== installed && current !== original) {
    throw new Error(`${adapter.instructionPath} changed outside the managed block; refusing to overwrite later project instructions`);
  }
  if (original) atomicWrite(paths.target, original);
  else if (currentExists) fs.unlinkSync(paths.target);
  return { status: current === original ? 'unchanged' : 'restored', agent: resolvedAgent, adapter: adapter.id, instructionPath: paths.target };
}

export function setupAgent(root, agent, { projectName = path.basename(path.resolve(root)), env = process.env } = {}) {
  const projectRoot = path.resolve(root);
  const resolvedAgent = resolveAgent(agent, env);
  const stateDirectory = path.join(projectRoot, DEFAULT_STATE_DIRECTORY);
  const initialized = !fs.existsSync(stateDirectory);
  try {
    if (initialized) initializeProject(projectRoot, { projectName });
    else loadProject({ root: projectRoot });
    const integration = installAgentIntegration(projectRoot, resolvedAgent, { env });
    return { root: projectRoot, initialized, integration };
  } catch (error) {
    if (initialized && fs.existsSync(stateDirectory)) fs.rmSync(stateDirectory, { recursive: true, force: true });
    throw error;
  }
}
