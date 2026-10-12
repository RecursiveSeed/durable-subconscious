// SPDX-License-Identifier: AGPL-3.0-only
import {
  installAgentIntegration,
  LEGACY_CODEX_BLOCK_END,
  LEGACY_CODEX_BLOCK_START,
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  removeAgentIntegration,
  restoreAgentIntegration,
  setupAgent,
} from './agent-integration.mjs';

export const CODEX_BLOCK_START = MANAGED_BLOCK_START;
export const CODEX_BLOCK_END = MANAGED_BLOCK_END;
export { LEGACY_CODEX_BLOCK_END, LEGACY_CODEX_BLOCK_START };

export function installCodexIntegration(root) {
  return installAgentIntegration(root, 'codex');
}

export function removeCodexIntegration(root) {
  return removeAgentIntegration(root, 'codex');
}

export function restoreCodexIntegration(root) {
  return restoreAgentIntegration(root, 'codex');
}

export function setupCodex(root, options = {}) {
  return setupAgent(root, 'codex', options);
}
