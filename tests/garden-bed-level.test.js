// #602: Hechey Track's herb bed (the remake's own: the street had no garden in Glitch) was planned
// on a slope whose floor rises 58 px under its right end into the dirt mound by the big pine, so the
// flat bed sank into the mound. A planned bed now stands where the floor under its whole width is
// level (street-ecology.js LEVEL_FLOOR_GROUPS); beds measured on snaps stay where the snaps show them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVEL_FLOOR_GROUPS,
  PLACEMENT_FOOTPRINTS,
  ecologyForStreet,
  floorUnevenUnder,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=dde3c62d';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { streetGardenBeds } from '../public/js/garden.js?v=fefa7bcd';
import { gardenBedWidth } from '../public/js/garden-beds.js?v=2ac6a12c';
import { placementRequests } from '../tools/build-realtime-objects.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
setStreetEcologyCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
const street = (tsid) => JSON.parse(readFileSync(join(root, `public/assets/streets/${tsid}.json`), 'utf8'));
const HECHEY = 'GLI2V0UN7RD1T2J';

function hecheyBeds() {
  const data = street(HECHEY);
  const lines = platformsScreen(data);
  const population = populationForStreet(HECHEY, ecologyForStreet(HECHEY), { starter: true });
  const plan = planStreetPlacements(lines, placementRequests(population), { worldW: streetWidth(data), seed: HECHEY, reserved: streetReservedSpots(data) });
  return { lines, beds: streetGardenBeds(HECHEY, plan.groups.gardens || [], population) };
}

describe('planned garden beds stand on level floor (#602)', () => {
  it('Hechey Track: both beds on level floor, the herb bed clear of the mound', () => {
    const { lines, beds } = hecheyBeds();
    assert.deepEqual(beds.map((b) => b.bed), ['default', 'herb']);
    for (const b of beds) {
      const half = gardenBedWidth({ cols: b.cols, rows: b.rows }) / 2;
      // Planned beds stand 2 px under their spot (garden.js streetGardenBeds).
      const uneven = floorUnevenUnder(lines, { x: b.x, y: b.y - 2 }, half);
      assert.ok(uneven <= LEVEL_FLOOR_GROUPS.gardens.maxRise, `${b.bed} at ${b.x}: floor ${uneven} px off level`);
    }
    // The dirt mound (mound_dirt_2 and the hump of floor under the pine): 3015 to 3230 here.
    const herb = beds.find((b) => b.bed === 'herb');
    const half = gardenBedWidth({ cols: herb.cols, rows: herb.rows }) / 2;
    assert.ok(herb.x - half > 3230 || herb.x + half < 2890, `herb bed at ${herb.x}`);
  });

  it('measures rise and fall under a footprint', () => {
    const flat = [{ x1: 0, y1: 500, x2: 1000, y2: 500, pcPerm: -1, itemPerm: -1 }];
    assert.equal(floorUnevenUnder(flat, { x: 500, y: 500 }, PLACEMENT_FOOTPRINTS.gardens / 2), 0);
    const ramp = [{ x1: 0, y1: 500, x2: 1000, y2: 400, pcPerm: -1, itemPerm: -1 }];
    assert.ok(floorUnevenUnder(ramp, { x: 500, y: 450 }, 140) > 12);
    assert.equal(floorUnevenUnder(flat, { x: 50, y: 500 }, 140), Infinity, 'an end over the air');
  });
});
