/**
 * #555 (R2): on Iable Var the Race Ticket Dispenser was drawn in a fruit tree. Neither has a position
 * in the archive (the location file names its objrefs only), so both are planned, and the planner's
 * clearance (scaledDistance against clearance 70 + 135) let the dispenser take a ledge 140 px over
 * the tree's foot, inside its crown. The dispenser now keeps out of planned trees' canopies
 * (street-ecology.js TREE_CANOPY) by its own art (UNDER_CANOPY_HEIGHTS, UNDER_CANOPY_WIDTHS), as the
 * resource nodes and the Visiting Stone do (report #256). This lays out every dispenser street as
 * game.js does (the realtime builder's creatureRequests, which other tests hold to game.js) and checks
 * the dispenser's drawn box against every tree's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  TREE_CANOPY,
  UNDER_CANOPY_HEIGHTS,
  UNDER_CANOPY_WIDTHS,
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=1d97eefe';
import { RACE_DISPENSER_STREETS } from '../public/js/races.js?v=ab22a079';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));

/** The dispenser as drawn on its feet: races/race_ticket_dispenser.webp, 58 x 94 at 1:1. */
const DISPENSER = { w: 58, h: 94 };

describe('#555: the Race Ticket Dispenser stands clear of the trees', () => {
  it('keeps out of a canopy by its own art', () => {
    assert.equal(UNDER_CANOPY_WIDTHS.raceDispenser, DISPENSER.w);
    assert.equal(UNDER_CANOPY_HEIGHTS.raceDispenser, DISPENSER.h);
  });

  it('on all 11 dispenser streets, no tree is drawn over it', () => {
    setStreetEcologyCatalog(catalog);
    setCreatureEcology(catalog);
    const bad = [];
    for (const [tsid, row] of Object.entries(RACE_DISPENSER_STREETS)) {
      const data = street(tsid);
      const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
      const requests = creatureRequests(pop, data, catalog);
      assert.ok(requests.some((r) => r.key === 'raceDispenser'), `${row.label} plans a dispenser`);
      const plan = planStreetPlacements(platformsScreen(data), requests, { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
      const d = plan.groups.raceDispenser?.[0];
      assert.ok(d, `${row.label}: a dispenser spot`);
      for (const [i, t] of (plan.groups.trees || []).entries()) {
        const overlaps = d.x - DISPENSER.w / 2 < t.x + TREE_CANOPY.w / 2 && t.x - TREE_CANOPY.w / 2 < d.x + DISPENSER.w / 2
          && d.y - DISPENSER.h < t.y && t.y - TREE_CANOPY.h < d.y;
        if (overlaps) bad.push(`${row.label} (${tsid}): dispenser ${Math.round(d.x)},${Math.round(d.y)} in tree ${i} at ${Math.round(t.x)},${Math.round(t.y)}`);
      }
      assert.deepEqual(plan.blocked.filter((b) => b.key === 'raceDispenser'), [], `${row.label}: not on a doorstep or in a crown for want of room`);
    }
    assert.deepEqual(bad, []);
  });
});
