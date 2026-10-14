// SPDX-License-Identifier: AGPL-3.0-only
export const PACKAGE_VERSION = '0.5.0';
export const INSTALLATION_SCHEMA_VERSION = 1;
export const UPDATE_TRANSACTION_SCHEMA_VERSION = 1;

export const UPDATE_COMPATIBILITY = Object.freeze({
  state_schema: 1,
  graph_schema: 1,
  freshness_schema: 1,
  supported_upgrade_from: ['0.3.x', '0.4.x', '0.5.x'],
});
