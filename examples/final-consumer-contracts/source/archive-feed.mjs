// SPDX-License-Identifier: AGPL-3.0-only
import { readBeacon } from './beacon-source.mjs';

export function createArchiveRecord() {
  const beacon = readBeacon();
  return {
    beaconId: beacon.id,
    state: beacon.state,
    record: `${beacon.id}:${beacon.state}`,
  };
}
