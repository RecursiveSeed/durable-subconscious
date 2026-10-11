// SPDX-License-Identifier: AGPL-3.0-only
import { loadInventory } from './storage.mjs';

export function listItems() {
  const route = '/api/items';
  return { route, items: loadInventory() };
}
