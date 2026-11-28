/**
 * #770 (a later message, v0.79.0): a tutorial player away from Gentle Island (on Hechey Track) was
 * sent back to the island after the update and "deposited on a path below street level". The island
 * stage's way back (newxp-feature runIsland: not on Gentle Island and not exited) enters Surveyor's
 * Stroll at ISLAND_ARRIVAL, which stood at y 1100: 64 px under the street's walkway at x 198 (its only
 * floor there, plat_1351278694426, screen y 1036), so the avatar fell to the bottom of the street.
 * Glitch's point (inc_skillquest.js 7-8, -2302, -77) also sits under that line; the street's location
 * XML has no entry point of its own. The arrival now stands on the walkway at that x.
 * Run: node --test tests/newxp-island-arrival-770.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { GENTLE_ISLAND, ISLAND_ARRIVAL } from '../public/js/newxp.js?v=abbf0ed6';
import { loadStreetDataFromFs } from '../public/js/street-loader.js?v=10376267';
import { isStandable, platformYAt, platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where an avatar set down at (x, y) comes to rest: the first standable floor at or under its feet. */
const restsOn = (plats, x, y) => {
  let best = null;
  for (const p of plats) {
    if (!isStandable(p) || Math.abs(p.x2 - p.x1) < 1) continue;
    const py = platformYAt(p, x, 0);
    if (py == null || py < y - 2) continue;
    if (best == null || py < best.y) best = { y: py, id: p.id };
  }
  return best;
};

describe('#770 back to Gentle Island lands on the walkway, not under it', () => {
  it('the island arrival is on Surveyor\'s Stroll', () => {
    assert.equal(ISLAND_ARRIVAL.tsid, GENTLE_ISLAND.surveyors_stroll);
  });

  it('set down at the arrival, the avatar stands on the street\'s walkway at that x', async () => {
    const street = await loadStreetDataFromFs(ISLAND_ARRIVAL.tsid, join(root, 'public/assets/streets'));
    const plats = platformsScreen(street);
    const floors = plats.filter((p) => isStandable(p) && platformYAt(p, ISLAND_ARRIVAL.x, 0) != null);
    assert.equal(floors.length, 1, 'one floor spans the arrival x: the walkway');
    const walk = platformYAt(floors[0], ISLAND_ARRIVAL.x, 0);
    const rest = restsOn(plats, ISLAND_ARRIVAL.x, ISLAND_ARRIVAL.y);
    assert.ok(rest, `a floor under the arrival's feet (y ${ISLAND_ARRIVAL.y}, walkway ${walk.toFixed(1)})`);
    assert.equal(rest.id, floors[0].id);
    assert.ok(Math.abs(ISLAND_ARRIVAL.y - walk) <= 2, `on the line, not dropped from high above (y ${ISLAND_ARRIVAL.y}, walkway ${walk.toFixed(1)})`);
  });

  it('the way back from Ur uses it (runIsland)', () => {
    const src = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');
    assert.match(src, /engine\.enter\(ISLAND_ARRIVAL\.tsid, \{ spawnX: ISLAND_ARRIVAL\.x, spawnY: ISLAND_ARRIVAL\.y/);
  });
});
