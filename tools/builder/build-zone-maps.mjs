#!/usr/bin/env node
/**
 * LEVEL BUILDER publishing (spec 11, phase P6): a published zone's new hub map,
 * public/assets/maps/hubs/hub-<id>.json, shaped as Tiny Speck's, and its row in
 * public/assets/maps/index.json. The row carries `zone`, so the map's hub picker leaves it out
 * (js/map-graph.js listHubsFromIndex): zones stay off the world map (spec 15, Q5), and their map
 * opens from their own streets only. Hub maps of zones no longer published are removed.
 * build-hub-maps.mjs (hub-maps-data.js, the Completist badges) never sees a zone.
 *
 *   node tools/builder/build-zone-maps.mjs           write
 *   node tools/builder/build-zone-maps.mjs --check   exit 1 when a hub map or its row is stale
 */
import { fileURLToPath } from 'node:url';
import { GAME_DIR } from '../repos.mjs';
import { buildZoneMaps, zoneToolMain } from './zones.mjs';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(zoneToolMain('build-zone-maps.mjs', (fs, zones) => buildZoneMaps(fs, zones), { root: GAME_DIR }));
}
