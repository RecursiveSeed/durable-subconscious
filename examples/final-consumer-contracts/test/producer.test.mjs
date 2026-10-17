// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBeacon } from '../source/beacon-source.mjs';

test('shared producer returns the fictional beacon', () => {
  assert.deepEqual(readBeacon(), { id: 'beacon-17', state: 'ready', channel: 'north' });
});
