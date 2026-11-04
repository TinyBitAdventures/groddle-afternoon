/**
 * Every quoin on every street can be touched by the avatar's box from a spot it can stand on, inside
 * the street's walk bounds (player report 32, 2026-11-01, Safari: "the iMG quoin all the way on the
 * left of Mallos Means, Bortola is ungrabbable", with the avatar stopped at the street's left end).
 *
 * The avatar walks between EDGE_MARGIN and the street's width less EDGE_MARGIN (js/avatar-step.js
 * stepAvatar) and stands on the lines isStandable allows. A natural quoin floats 58, 92 or 126 px over
 * a planner spot (game.js spawnWorldQuoin, by its index), and the planner's spots are
 * buildPlatformCandidates' (js/street-ecology.js): where a quoin lands depends on the arrival in solo
 * (the saved-arrival keep-clear), so the sweep takes every spot the planner could pick at all three
 * heights, which covers solo and the realtime server's layout (tools/build-realtime-quoins.mjs) alike.
 * A touch is js/quoins.js quoinTouches, the source's player box over the drawn coin (quoin.js
 * onPlayerCollision 156). Since player report 37 the coin's own box counts, not a 60 px one: the 58 and
 * 92 px rows are taken walking, the 126 px row (just over the head) with a hop of at most HOP px.
 *
 * Mallos Means' left quoin sits at x 38.6, 15 px inside the avatar's bound at 24: in reach. In a solo
 * layout it can float 92 or 126 px up, which the old 44 px circle 28 px over the feet missed without a
 * jump (fixed by quoinTouches, 8e0286fe1, not yet live when the report came in).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=33d2b8bc';
import { isStandable, platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=505d8990';
import { buildPlatformCandidates, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=d41e5e97';
import { EDGE_MARGIN } from '../public/js/avatar-step.js?v=537aa4b7';
import { quoinTouches } from '../public/js/quoins.js?v=dfe1ff0a';
import { streetQuoinLayout } from '../tools/build-realtime-quoins.mjs';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const LIFTS = [58, 92, 126];
/** A hop: feet this far up at most (a full jump rises about 142 px, js/avatar-step.js JUMP_SPEED and GRAVITY). */
const HOP = 40;
/** Walking takes the rows up to head height; the one over the head takes a hop. */
const rise = (lift) => (lift > 112 ? HOP : 0);
const MALLOS_MEANS = 'GHV1L41MCD32O4A';

/** The standing spots (feet x, y) within the walk bounds that touch quoin q, or the first one. */
function touchFrom(q, lines, w, { first = true, hop = 0 } = {}) {
  const lo = Math.max(EDGE_MARGIN, Math.floor(q.x - 60));
  const hi = Math.min(w - EDGE_MARGIN, Math.ceil(q.x + 60));
  const found = [];
  for (let x = lo; x <= hi; x += 2) {
    for (const p of lines) {
      const y = platformYAt(p, x, 0);
      if (y == null) continue;
      let touched = false;
      for (let h = 0; h <= hop && !touched; h += 2) touched = quoinTouches(q, x, y - h);
      if (!touched) continue;
      found.push({ x, y });
      if (first) return found;
      break;
    }
  }
  return found;
}

let streets = [];
before(async () => {
  setZoneStreetsShown(false);
  const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
  applyStreetIndex(index);
  setStreetEcologyCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
  for (const tsid of Object.keys(index.streets).filter((t) => !isZoneTsid(t)).sort()) {
    try {
      streets.push(await loadStreetDataFromFs(tsid, streetsDir));
    } catch {
      // A street the index names without a file is skipped, as the quoin builder skips it.
    }
  }
});

describe('32: every quoin is in the avatar\'s reach', () => {
  it('every spot the planner can give a quoin, at all three heights, touches from a standable spot inside the walk bounds (a hop for the top row)', () => {
    assert.ok(streets.length > 1000, `${streets.length} streets`);
    const misses = [];
    let spots = 0;
    for (const data of streets) {
      const lines = platformsScreen(data);
      const w = streetWidth(data);
      const stand = lines.filter(isStandable);
      for (const c of buildPlatformCandidates(lines, { worldW: w, seed: data.tsid })) {
        if (c.item === false) continue; // the planner never puts an item there
        for (const lift of LIFTS) {
          spots += 1;
          const q = { x: c.x, y: c.y - lift };
          if (!touchFrom(q, stand, w, { hop: rise(lift) }).length) misses.push(`${data.tsid} ${data.label}: (${Math.round(q.x)}, ${Math.round(q.y)}) ${lift} px up`);
        }
      }
    }
    assert.ok(spots > 100000, `${spots} spots`);
    assert.deepEqual(misses.slice(0, 20), [], `${misses.length} quoin spots out of reach`);
  });

  it('every shared quoin the realtime server lays out touches too', () => {
    const misses = [];
    let total = 0;
    for (const data of streets) {
      const lines = platformsScreen(data).filter(isStandable);
      const w = streetWidth(data);
      for (const [x, y, type] of streetQuoinLayout(data)) {
        total += 1;
        if (!touchFrom({ x, y }, lines, w, { hop: HOP }).length) misses.push(`${data.tsid} ${data.label}: ${type} at (${x}, ${y})`);
      }
    }
    assert.ok(total > 10000, `${total} quoins`);
    assert.deepEqual(misses, []);
  });

  it('Mallos Means: the left iMG quoin is taken at the left end, at every height (a hop for the top row)', () => {
    const data = streets.find((s) => s.tsid === MALLOS_MEANS);
    assert.ok(data, 'Mallos Means');
    const lines = platformsScreen(data).filter(isStandable);
    const w = streetWidth(data);
    const left = streetQuoinLayout(data).reduce((a, b) => (b[0] < a[0] ? b : a));
    assert.equal(left[2], 'xp');
    assert.ok(left[0] < 60 && left[0] > EDGE_MARGIN, `x ${left[0]}`);
    const floorY = left[1] + 58; // the shared layout floats it 58 px up (its index 3)
    for (const lift of LIFTS) {
      const q = { x: left[0], y: floorY - lift };
      const at = touchFrom(q, lines, w, { first: false, hop: rise(lift) });
      assert.ok(at.some((s) => s.x === EDGE_MARGIN), `${lift} px up: touched at the bound`);
    }
  });
});
