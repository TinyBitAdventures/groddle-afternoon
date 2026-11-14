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

import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { isStandable, platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { buildPlatformCandidates, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=0a7d05eb';
import { EDGE_MARGIN, JUMP_SPEED, NORMAL_BUFF, WALK_MAX, avatarFall } from '../public/js/avatar-step.js?v=43b1182e';
import { QUOIN_TOUCH, measuredStreetQuoins, quoinTouches } from '../public/js/quoins.js?v=61be601c';
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

  it('every shared quoin the realtime server lays out touches too (a planned one with a hop)', () => {
    const misses = [];
    let total = 0;
    for (const data of streets) {
      const lines = platformsScreen(data).filter(isStandable);
      const w = streetWidth(data);
      const exact = new Set((measuredStreetQuoins(data.tsid) || []).map((s) => `${s.x},${s.y}`));
      for (const [x, y, type] of streetQuoinLayout(data)) {
        if (exact.has(`${x},${y}`)) continue; // G271: measured, checked below
        total += 1;
        if (!touchFrom({ x, y }, lines, w, { hop: HOP }).length) misses.push(`${data.tsid} ${data.label}: ${type} at (${x}, ${y})`);
      }
    }
    assert.ok(total > 8000, `${total} quoins`);
    assert.deepEqual(misses, []);
  });

  it('G271: a quoin where the 2012 snaps show it is in a running jump\'s reach off some floor (all but a few)', () => {
    // Tiny Speck hung quoins along jump arcs off ledges and over gaps, so a measured one is held to
    // a running jump (WALK_MAX across, the street jump's rise and fall), not a standing hop. The
    // arc ignores walls, and air control is not modelled, so this is a bound, not a proof. The few
    // it misses (205 of 4,277 when measured, 2026-11-12: Bliss's own physics, quoins over a rock
    // face the street file has no floor near) are left where the snaps put them.
    const body = { vx: 0, vy: JUMP_SPEED, onGround: false };
    const rise = [0];
    for (let t = 1, y = 0; t < 600; t += 1) {
      avatarFall(body, NORMAL_BUFF, 1);
      y += body.vy;
      rise.push(-y);
    }
    const apex = Math.max(...rise);
    const lastFrameOver = (h) => {
      for (let t = rise.length - 1; t >= 0; t -= 1) if (rise[t] >= h) return t;
      return -1;
    };
    const halfW = (QUOIN_TOUCH.coinW + QUOIN_TOUCH.playerW) / 2;
    const halfH = (QUOIN_TOUCH.coinH + QUOIN_TOUCH.playerH) / 2;
    const misses = [];
    let total = 0;
    for (const data of streets) {
      const spots = measuredStreetQuoins(data.tsid);
      if (!spots) continue;
      const lines = platformsScreen(data).filter(isStandable);
      const w = streetWidth(data);
      for (const q of spots) {
        total += 1;
        let reach = false;
        for (const p of lines) {
          const lo = Math.max(Math.min(p.x1, p.x2), EDGE_MARGIN, q.x - 2000);
          const hi = Math.min(Math.max(p.x1, p.x2), w - EDGE_MARGIN, q.x + 2000);
          for (let x0 = lo; x0 <= hi && !reach; x0 += 6) {
            const y0 = platformYAt(p, x0, 0);
            if (y0 == null) continue;
            const need = y0 - QUOIN_TOUCH.playerH / 2 - q.y - halfH;
            if (apex < need) continue;
            reach = WALK_MAX * lastFrameOver(need) + halfW >= Math.abs(q.x - x0);
          }
          if (reach) break;
        }
        if (!reach) misses.push(`${data.tsid} ${data.label}: (${q.x}, ${q.y})`);
      }
    }
    assert.ok(total > 4000, `${total} measured quoins`);
    assert.ok(misses.length / total < 0.06, `${misses.length} of ${total} out of a running jump's reach: ${misses.slice(0, 10).join('; ')}`);
  });

  it('Mallos Means: the left iMG quoin is taken at the left end, at every height (a hop for the top row)', () => {
    const data = streets.find((s) => s.tsid === MALLOS_MEANS);
    assert.ok(data, 'Mallos Means');
    const lines = platformsScreen(data).filter(isStandable);
    const w = streetWidth(data);
    // Where the plan put that quoin until every floor height was planned (the placements audit,
    // 2026-11-12: now the planner spreads them over the upper floors too, and the sweep above covers
    // those): a coin by the street's left bound is still taken there.
    const left = [38.6, 1042.4, 'xp'];
    assert.ok(left[0] < 60 && left[0] > EDGE_MARGIN, `x ${left[0]}`);
    const floorY = left[1] + 58; // the shared layout floats it 58 px up (its index 3)
    for (const lift of LIFTS) {
      const q = { x: left[0], y: floorY - lift };
      const at = touchFrom(q, lines, w, { first: false, hop: rise(lift) });
      assert.ok(at.some((s) => s.x === EDGE_MARGIN), `${lift} px up: touched at the bound`);
    }
  });
});
