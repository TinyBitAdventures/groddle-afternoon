#!/usr/bin/env node
/**
 * LEVEL BUILDER publishing (spec 11, phase P6): the published zones' edits[] on shipped streets, the
 * arms that lead into a zone. Every arm into a zone (a GZ tsid) is taken off a shipped street first
 * and each zone's edits put back in order, with `arrive` worked out again where the zone street's
 * post leading back stands, so a second run changes nothing and an unpublished zone's arms go.
 * build-street-navigation.mjs keeps such an arm but drops its `arrive` (it has no source for it,
 * public/js/location-navigation.js), so it runs this step itself after its own; publishing never
 * changes a shipped street in any other way (spec 15, Q3).
 *
 *   node tools/builder/apply-zone-edits.mjs           write
 *   node tools/builder/apply-zone-edits.mjs --check   exit 1 when a shipped street is stale
 */
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { applyZoneEdits, zoneToolMain } from './zones.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(zoneToolMain('apply-zone-edits.mjs', (fs, zones) => applyZoneEdits(fs, zones), { root: GAME_DIR }));
}
