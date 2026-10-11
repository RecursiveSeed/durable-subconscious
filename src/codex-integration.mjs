// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureAgentGuide, initializeProject } from './initialize.mjs';
import { DEFAULT_STATE_DIRECTORY, loadProject } from './subconscious-lib.mjs';

export const CODEX_BLOCK_START = '<!-- durable-subconscious:codex:start -->';
export const CODEX_BLOCK_END = '<!-- durable-subconscious:codex:end -->';

export const CODEX_MANAGED_BLOCK = `${CODEX_BLOCK_START}
## Durable Subconscious (managed Codex integration)

These instructions supplement existing project authority and more-specific
AGENTS.md files. They do not replace project rules.

For relevant development work:

1. At session start, read \`.durable-subconscious/agent-guide.md\`,
   \`.durable-subconscious/config.json\`, and the relevant configured maps.
2. Before a material change, run
   \`npx --no-install durable-subconscious impact <file-or-node-or-capability> --project .\`.
3. Treat unknown targets, missing ownership, and traversal frontiers as audit
   requirements. Inspect project evidence; never invent relationships.
4. After verified changes, update affected graph nodes, edges, coverage, typed
   gaps, and maps. Preserve historical evidence, uncertainty, privacy, and
   project-specific authority.
5. Run affected project tests, then
   \`npx --no-install durable-subconscious check --project . --strict-coverage\`,
   and repeat the relevant impact query.
6. A passing structural check is not proof that an unrecorded capability does not
   exist. Keep the configured capability inventory synchronized with verified
   source changes.

Do not disable validation rules to obtain a passing result. See
\`node_modules/durable-subconscious/docs/SCHEMA.md\` for the schema.
${CODEX_BLOCK_END}`;

const INTEGRATION_DIRECTORY = `${DEFAULT_STATE_DIRECTORY}/integrations/codex`;
const MANIFEST_NAME = 'manifest.json';
const BACKUP_NAME = 'AGENTS.md.before-integration';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function count(text, token) {
  return text.split(token).length - 1;
}

function managedRange(text, { allowAbsent = false } = {}) {
  const starts = count(text, CODEX_BLOCK_START);
  const ends = count(text, CODEX_BLOCK_END);
  if (starts === 0 && ends === 0 && allowAbsent) return null;
  if (starts !== 1 || ends !== 1) throw new Error('AGENTS.md has malformed or duplicate Durable Subconscious markers; refusing to overwrite it');
  const start = text.indexOf(CODEX_BLOCK_START);
  const end = text.indexOf(CODEX_BLOCK_END, start);
  if (end < start) throw new Error('AGENTS.md has out-of-order Durable Subconscious markers; refusing to overwrite it');
  return { start, end: end + CODEX_BLOCK_END.length };
}

function renderWithManagedBlock(original) {
  if (!original) return `${CODEX_MANAGED_BLOCK}\n`;
  const separator = original.endsWith('\n') ? '\n' : '\n\n';
  return `${original}${separator}${CODEX_MANAGED_BLOCK}\n`;
}

function atomicWrite(file, content) {
  const temporary = `${file}.durable-subconscious-${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function integrationPaths(root) {
  const projectRoot = path.resolve(root);
  const directory = path.join(projectRoot, INTEGRATION_DIRECTORY);
  return {
    projectRoot,
    agents: path.join(projectRoot, 'AGENTS.md'),
    directory,
    manifest: path.join(directory, MANIFEST_NAME),
    backup: path.join(directory, BACKUP_NAME),
  };
}

function readManifest(paths) {
  if (!fs.existsSync(paths.manifest)) return null;
  return JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
}

function originalFromManifest(paths, manifest) {
  if (!manifest) return null;
  if (!manifest.original_existed) return '';
  if (!fs.existsSync(paths.backup)) throw new Error('Codex integration backup is missing; refusing recovery');
  const original = fs.readFileSync(paths.backup, 'utf8');
  if (sha256(original) !== manifest.original_sha256) throw new Error('Codex integration backup hash mismatch; refusing recovery');
  return original;
}

function writeInitialRecovery(paths, original, originalExisted) {
  fs.mkdirSync(paths.directory, { recursive: true });
  if (fs.existsSync(paths.manifest)) return readManifest(paths);
  if (originalExisted) {
    if (fs.existsSync(paths.backup)) {
      if (fs.readFileSync(paths.backup, 'utf8') !== original) {
        throw new Error('A partial Codex integration backup does not match AGENTS.md; refusing to overwrite it');
      }
    } else {
      fs.writeFileSync(paths.backup, original, { encoding: 'utf8', flag: 'wx' });
    }
  }
  const manifest = {
    schema_version: 1,
    integration: 'codex',
    agents_path: 'AGENTS.md',
    original_existed: originalExisted,
    original_sha256: sha256(original),
    managed_block_sha256: sha256(CODEX_MANAGED_BLOCK),
  };
  atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function installCodexIntegration(root) {
  const paths = integrationPaths(root);
  loadProject({ root: paths.projectRoot });
  const originalExisted = fs.existsSync(paths.agents);
  const current = originalExisted ? fs.readFileSync(paths.agents, 'utf8') : '';
  const range = managedRange(current, { allowAbsent: true });
  ensureAgentGuide(paths.projectRoot);
  const next = range
    ? `${current.slice(0, range.start)}${CODEX_MANAGED_BLOCK}${current.slice(range.end)}`
    : renderWithManagedBlock(current);
  writeInitialRecovery(paths, current, originalExisted);
  if (next === current) return { status: 'unchanged', agentsPath: paths.agents, integrationDirectory: paths.directory };
  atomicWrite(paths.agents, next);
  return { status: range ? 'updated' : 'installed', agentsPath: paths.agents, integrationDirectory: paths.directory };
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

export function removeCodexIntegration(root) {
  const paths = integrationPaths(root);
  const manifest = readManifest(paths);
  if (!fs.existsSync(paths.agents)) return { status: 'unchanged', agentsPath: paths.agents };
  const current = fs.readFileSync(paths.agents, 'utf8');
  const range = managedRange(current, { allowAbsent: true });
  if (!range) return { status: 'unchanged', agentsPath: paths.agents };
  const original = originalFromManifest(paths, manifest);
  const next = original !== null && current === renderWithManagedBlock(original)
    ? original
    : removeRange(current, range);
  if (!next && manifest?.original_existed === false) fs.unlinkSync(paths.agents);
  else atomicWrite(paths.agents, next);
  return { status: 'removed', agentsPath: paths.agents };
}

export function restoreCodexIntegration(root) {
  const paths = integrationPaths(root);
  const manifest = readManifest(paths);
  if (!manifest) throw new Error('No Codex integration recovery manifest exists');
  const original = originalFromManifest(paths, manifest);
  const currentExists = fs.existsSync(paths.agents);
  const current = currentExists ? fs.readFileSync(paths.agents, 'utf8') : '';
  const installed = renderWithManagedBlock(original);
  if (currentExists && current !== installed && current !== original) {
    throw new Error('AGENTS.md changed outside the managed block; refusing to overwrite later project instructions');
  }
  if (original) atomicWrite(paths.agents, original);
  else if (currentExists) fs.unlinkSync(paths.agents);
  return { status: current === original ? 'unchanged' : 'restored', agentsPath: paths.agents };
}

export function setupCodex(root, { projectName = path.basename(path.resolve(root)) } = {}) {
  const projectRoot = path.resolve(root);
  const stateDirectory = path.join(projectRoot, DEFAULT_STATE_DIRECTORY);
  const initialized = !fs.existsSync(stateDirectory);
  try {
    if (initialized) initializeProject(projectRoot, { projectName });
    else loadProject({ root: projectRoot });
    const integration = installCodexIntegration(projectRoot);
    return { root: projectRoot, initialized, integration };
  } catch (error) {
    if (initialized && fs.existsSync(stateDirectory)) fs.rmSync(stateDirectory, { recursive: true, force: true });
    throw error;
  }
}
