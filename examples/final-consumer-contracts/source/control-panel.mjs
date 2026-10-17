// SPDX-License-Identifier: AGPL-3.0-only
import { readBeacon } from './beacon-source.mjs';

export function renderControlPanel() {
  const beacon = readBeacon();
  const badge = process.env.SIGNAL_HARBOR_PANEL_REGRESSION === '1'
    ? beacon.state
    : beacon.state.toUpperCase();
  return {
    beaconId: beacon.id,
    badge,
    accessibleLabel: `Beacon ${badge}`,
  };
}
