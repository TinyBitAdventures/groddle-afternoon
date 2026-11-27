/**
 * G852: soil patches hung off ledge ends (33 of 188 planned with less than their art's width of floor
 * under them, the spawn audit 2026-11-16). patches-feature.js soilPlacementGroups now asks for
 * SOIL_FOOTPRINT px of level floor with both ends over it (street-ecology.js SOIL_STEADY_FLOOR), and
 * never leaves a plot out (its key is its saved state).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';
import { SOIL_FOOTPRINT, SOIL_STEADY_FLOOR, footOverAir, planStreetPlacements, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=dde3c62d';
import { soilCountsForStreet, soilPlacementGroups } from '../public/js/features/patches-feature.js?v=6d2e5d31';
import { soilSpawnClasses } from '../public/js/patches.js?v=54430bb9';
import { streetPatchLayout } from '../tools/build-realtime-patches.mjs';
import { setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const floor = (id, x1, x2, y) => ({ id, x1, y1: y, x2, y2: y, pcPerm: -1, itemPerm: -1 });
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

describe('soil patches on level floor', () => {
  it('ask for their footprint and a steady floor that never leaves one out', () => {
    const groups = soilPlacementGroups({ patch: 3, trant_bean_dead: 1 });
    assert.equal(groups.length, 2);
    for (const g of groups) {
      assert.equal(g.footprint, SOIL_FOOTPRINT);
      assert.equal(g.steady, SOIL_STEADY_FLOOR);
    }
    assert.ok(SOIL_FOOTPRINT >= 113, 'the dug patch art is 113 px wide');
    assert.equal(SOIL_STEADY_FLOOR.keep, true);
  });

  it('keep off a ledge end while level floor is left', () => {
    // A long floor and a 300 px ledge over it: a plot never stands with an end past the ledge's lip.
    const platforms = [floor('ground', 0, 2400, 900), floor('ledge', 1000, 1300, 600)];
    for (const seed of ['a', 'b', 'c', 'd']) {
      const plan = planStreetPlacements(platforms, soilPlacementGroups({ patch: 6 }), { worldW: 2400, seed, unreached: null });
      assert.equal(plan.groups['soil:patch'].length, 6);
      for (const p of plan.groups['soil:patch']) assert.ok(footOverAir(platforms, p, SOIL_FOOTPRINT / 2) <= 12, `${seed}: plot at ${p.x},${p.y}`);
    }
  });

  it('every shared plot has both ends over its floor, and every street keeps its plots', async () => {
    let plots = 0;
    for (const tsid of Object.keys(catalog.soil || {}).map((t) => `G${t.slice(1)}`)) {
      if (!index.streets[tsid] || /^GZ/.test(tsid)) continue;
      const data = await loadStreetDataFromFs(tsid, streetsDir);
      const layout = streetPatchLayout(data, catalog);
      if (!layout) continue;
      const want = soilSpawnClasses(soilCountsForStreet(tsid)).filter((c) => c !== 'patch_seedling').length;
      assert.equal(layout.plots.length, want, `${data.label}: plots`);
      const platforms = platformsScreen(data);
      for (const [key, , x, y] of layout.plots) {
        assert.ok(footOverAir(platforms, { x, y }, SOIL_FOOTPRINT / 2) <= 12, `${data.label} ${key} at ${x},${y}`);
        plots += 1;
      }
    }
    assert.ok(plots >= 180, `${plots} plots`);
  });
});
