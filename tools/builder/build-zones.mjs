#!/usr/bin/env node
/**
 * LEVEL BUILDER publishing (spec 11, phase P6): everything the game reads about the published zones,
 * from public/assets/zones/*.json (tools/builder/zones.mjs buildZones): each zone street's file, its
 * index and ecology rows, a new hub's map, the ways in on shipped streets, and the new art's
 * provenance (tools/provenance/new-art.json, js/deco-new-list.js). `publish --write` runs it; run it
 * again after any of Tiny Speck's street builders if one ever drops something (they should not:
 * build-street-names, build-street-ecology and build-street-navigation merge the zones themselves).
 *
 *   node tools/builder/build-zones.mjs           write
 *   node tools/builder/build-zones.mjs --check   exit 1 when anything is stale (tests/zones.test.js)
 */
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { buildZones, zoneToolMain } from './zones.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(zoneToolMain('build-zones.mjs', (fs) => buildZones(fs), { root: GAME_DIR }));
}
