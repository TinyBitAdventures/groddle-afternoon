/**
 * G1151 (chat 11-23): after Baqala's projects finished, the Map still drew Parsin's Trail SW and Injeba
 * Wedge as under construction. The Map reads the live state (the server's built rows: project_world on
 * every sync, project_built as it happens, js/street-jobs-mp.js applyWorld), not a static list, but it
 * read it once, when it drew: a road built while it stood open stayed striped until it was opened again.
 * Now it checks once a second while open and draws again when the closed roads change.
 * Run: node --test tests/map-built-live-1151.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closedStreets, normalizeStreetJobState, roadClosure } from '../public/js/street-jobs.js?v=e175c7e5';
import { applyWorld } from '../public/js/street-jobs-mp.js?v=ed23d5b4';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const catalog = JSON.parse(read('public/assets/content/street-jobs.json'));
const opts = { exemptFrom: ['GLI2V0UN7RD1T2J'], sharedWorld: true };

describe('G1151 the Map follows the world\'s built roads', () => {
  it('the server\'s built rows open Parsin\'s Trail SW (335) and Injeba Wedge (508) for everyone', () => {
    const state = normalizeStreetJobState({ initialized: true });
    for (const [job, street] of [['335', 'GA51450HIC42Q4I'], ['508', 'GIF14OKTU8722CQ']]) {
      assert.equal(catalog.jobs[job].street, street);
      assert.ok(roadClosure(state, catalog, street, [street], opts), `${street} closed before`);
    }
    // project_world (a sync) and project_built (live) both go through applyWorld.
    applyWorld(state, catalog, { built: { 335: { at: 1000, option: '' } } }, 0);
    applyWorld(state, catalog, { built: { 508: { at: 2000, option: '' } } }, 0);
    const closed = new Set(closedStreets(state, catalog, opts));
    assert.ok(!closed.has('GA51450HIC42Q4I') && !closed.has('GIF14OKTU8722CQ'));
    assert.equal(roadClosure(state, catalog, 'LA51450HIC42Q4I', ['LA51450HIC42Q4I'], opts), null, 'the hub map\'s L tsid too');
  });

  it('an open region map draws again when the closed roads change', () => {
    const game = read('public/game.js');
    assert.match(game, /followMapYou\(\);\n  followMapRoads\(\);\n\}/, 'checked from the frame tick');
    assert.match(game, /mapDrawnRoads = mapRoadsKey\(\);\n  if \(app\?\.canvas\) \{\n    app\.canvas\.dataset\.mapHub = targetHub;/, 'the key of the roads it drew with');
    assert.match(game, /const mapRoadsKey = \(\) => \(features\.query\('closedRoads', engine\) \|\| \[\]\)/);
    assert.match(game, /function followMapRoads\(now = performance\.now\(\)\) \{\n  if \(mapPanelView !== 'hub' \|\| !isMapOpen\(\) \|\| now - mapRoadsCheckedAt < 1000\) return;[\s\S]*?if \(mapCtxMenu\?\.isOpen\(\)\) return;\n  const key = mapRoadsKey\(\);\n  if \(key === mapDrawnRoads\) return;[\s\S]*?mapDrawnRoads = key;\n  openMap\(\);\n\}/);
  });
});
