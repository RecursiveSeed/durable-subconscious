// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderControlPanel } from '../source/control-panel.mjs';

test('control panel preserves identity and presents the required final behavior', () => {
  assert.deepEqual(renderControlPanel(), {
    beaconId: 'beacon-17',
    badge: 'READY',
    accessibleLabel: 'Beacon READY',
  });
});
