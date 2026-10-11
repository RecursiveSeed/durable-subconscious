// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { listItems } from '../source/catalog.mjs';

test('synthetic catalog reads its inventory', () => {
  const result = listItems();
  assert.equal(result.route, '/api/items');
  assert.deepEqual(result.items, [{ id: 'synthetic-widget', quantity: 3 }]);
});
