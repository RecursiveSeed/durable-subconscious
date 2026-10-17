// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createArchiveRecord } from '../source/archive-feed.mjs';

test('archive feed preserves identity and its lowercase machine contract', () => {
  assert.deepEqual(createArchiveRecord(), {
    beaconId: 'beacon-17',
    state: 'ready',
    record: 'beacon-17:ready',
  });
});
