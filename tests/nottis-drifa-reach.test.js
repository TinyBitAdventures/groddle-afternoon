/**
 * v0.79.0 hung Nottis's and Drifa's Ice Nubbins on their icy walls (G1323, #725) and so re-placed the
 * planned trees, rocks and quoins on those 32 streets. The review after it found things that might
 * now be out of a player's reach. This walks each street as a new player would and checks every
 * placed rock, quoin and Ice Nubbin has a standing spot it is reached from.
 *
 * Reach, with the game's own movement (js/builder/reach-graph.js, the frame game.js physics runs):
 * - the standing spots are the stand points a plain jump, walking, dropping and ladders reach from
 *   the street's arrivals (every signpost arm and door leading to it, tools/builder/calibrate.mjs).
 *   A plain jump only: a triple jump is an imagination upgrade (js/movement.js TRIPLE_JUMP_UPGRADES),
 *   so a new player has none (the planner's unreachedFloors counts triple jumps, G529, so a floor
 *   only a triple jump lands on can still hold a planned thing: this is what that misses);
 * - a quoin is taken when the player box touches it (js/quoins.js quoinTouches, items/quoin.js
 *   onPlayerCollision 156) standing there or on any frame of a plain jump from there, straight up or
 *   running either way (reach-graph.js jumpArc, the shared stepper, ceilings and walls included);
 * - a rock or an Ice Nubbin is taken with Enter when the avatar's hit box touches its art (js/reach.js
 *   avatarHitBox, the client's rule) standing or on a jump's frame, and by a click from that spot
 *   inside the verb's range (js/walk-over.js verbRange: mine 150, scrape 300) with no floor between.
 *
 * The streets are the hubs in REACH_HUBS (Nottis 137 and Drifa 141 by default) whose files name Ice
 * Nubbins. To sweep other hubs later: GRODDLE_REACH_HUBS=58,64 node --test tests/nottis-drifa-reach.test.js
 * (GRODDLE_REACH_HUBS=all takes every hub, and then every street, nubbins or not).
 * Run: node --test tests/nottis-drifa-reach.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { avatarHitBox, behindFloor, boxesTouch } from '../public/js/reach.js?v=456da8a8';
import { verbRange } from '../public/js/walk-over.js?v=277ab977';
import { jumpArc, reachStreet, streetBuff, streetWorld } from '../public/js/builder/reach-graph.js?v=687006d3';
import { QUOIN_REACH_MOVES, quoinTouches } from '../public/js/quoins.js?v=f9187edb';
import { rockShapeSheet } from '../public/js/mining.js?v=7ecaa572';
import { getResourceNodeDef } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { ecologyForStreet, planStreetPlacements, populationForStreet, rockSpawnPlan, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=da5177b2';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=f2e32ec0';
import { streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { placementRequests, streetEcology, streetQuoinLayout } from '../tools/build-realtime-quoins.mjs';
import { shippedArrivals } from '../tools/builder/calibrate.mjs';
import { shippedStreetFiles } from '../tools/builder/validator-context.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const ecology = read('public/assets/content/street-ecology.json');
const index = read('public/assets/streets/index.json').streets;
setStreetEcologyCatalog(ecology);

const REACH_HUBS = (process.env.GRODDLE_REACH_HUBS || '137,141').split(',').map((s) => s.trim()).filter(Boolean);
const ALL = REACH_HUBS.includes('all');
/** How far across a standing spot is looked for (a running jump carries about 250 px before it lands). */
const NEAR_X = 280;

/** The streets swept: the hubs' streets whose files name Ice Nubbins (every street with `all`). */
const TSIDS = Object.entries(index)
  .filter(([tsid, row]) => (ALL || (REACH_HUBS.includes(String(row?.hubId)) && ecology.streets[tsid]?.counts?.ice_knob > 0)))
  .map(([tsid]) => tsid)
  .sort();

/** Why the stepper is only approximate on a street (a swim street, or events that change physics): left out. */
function approximate(street) {
  if (streetBuff(street).approximate) return true;
  return Object.values(street.events || {}).flat().some((a) => a?.type === 'physics');
}

/**
 * One street's reach: the stand points reached from its arrivals, and checks for a quoin
 * ({ x, y } its centre) and for a thing's art box ({ left, right, top, bottom }) with its verb range.
 * Each answers 'stand', 'jump' or null.
 */
function streetReach(street, arrivals) {
  const r = reachStreet(street, arrivals);
  const world = streetWorld(street);
  const plats = platformsScreen(street);
  const stands = [];
  for (const run of r.surfaces) {
    if (!run.reached) continue;
    const n = Math.max(1, Math.round(Math.abs(run.x2 - run.x1) / 8));
    for (let k = 0; k <= n; k += 1) stands.push({ x: run.x1 + ((run.x2 - run.x1) * k) / n, y: run.y1 + ((run.y2 - run.y1) * k) / n });
  }
  const arcs = new Map();
  const arcsFrom = (p) => {
    const key = `${p.x},${p.y}`;
    if (!arcs.has(key)) arcs.set(key, [0, -1, 1].map((dir) => jumpArc(world, p, { dir, run: dir !== 0, record: true }).points));
    return arcs.get(key);
  };
  /** The stand points near (x, top..bottom): beside it, or under it within a jump and a fall. */
  const near = (x, top, bottom) => stands.filter((p) => Math.abs(p.x - x) <= NEAR_X && p.y >= top - 60 && p.y <= bottom + 400);
  return {
    stands: stands.length,
    standsNear: (x, y) => stands.some((p) => Math.abs(p.x - x) <= NEAR_X && Math.abs(p.y - y) <= 400),
    quoin(q) {
      const pool = near(q.x, q.y, q.y);
      if (pool.some((p) => quoinTouches(q, p.x, p.y))) return 'stand';
      for (const p of pool) for (const pts of arcsFrom(p)) if (pts.some((a) => quoinTouches(q, a.x, a.y))) return 'jump';
      return null;
    },
    thing(box, range) {
      const cx = (box.left + box.right) / 2;
      const pool = near(cx, box.top, box.bottom);
      // The click from the spot: inside the verb's range of the art's edge, no floor between.
      const clicks = (p) => {
        const dx = p.x < box.left ? box.left - p.x : p.x > box.right ? p.x - box.right : 0;
        const hitBox = avatarHitBox(p.x, p.y);
        return range == null || (dx <= range && !behindFloor(plats, { x: p.x, y: p.y - 56 }, box, null, { feetY: p.y, hitBox }));
      };
      if (pool.some((p) => boxesTouch(avatarHitBox(p.x, p.y), box) && clicks(p))) return 'stand';
      for (const p of pool) {
        if (!clicks(p)) continue;
        for (const pts of arcsFrom(p)) if (pts.some((a) => boxesTouch(avatarHitBox(a.x, a.y), box))) return 'jump';
      }
      return null;
    },
  };
}

/** A rock's art box: its shape's frame, bottom centre on its spot (game.js spawnMineRock). */
function rockBox(cls, x, y, shape) {
  const sheet = rockShapeSheet(cls, shape || 1);
  return { left: x - sheet.frameWidth / 2, right: x + sheet.frameWidth / 2, top: y - sheet.frameHeight, bottom: y };
}

/** An Ice Nubbin's art box: its variant's frame, bottom centre on its spot (resource-nodes-feature). */
function nubbinBox(x, y, variant) {
  const sheet = getResourceNodeDef('ice_knob').sprite.sheets[variant] || getResourceNodeDef('ice_knob').sprite.sheets.knob3;
  return { left: x - sheet.frameWidth / 2, right: x + sheet.frameWidth / 2, top: y - sheet.frameHeight, bottom: y };
}

const results = [];
before(() => {
  const { byStreet } = shippedArrivals(shippedStreetFiles());
  for (const tsid of TSIDS) {
    let street;
    try {
      street = read(`public/${index[tsid].file}`);
    } catch {
      continue; // named in the index with no file
    }
    const arrivals = byStreet.get(tsid.slice(1)) || [];
    if (!arrivals.length || approximate(street)) {
      results.push({ tsid, label: street.label, skipped: true, items: [] });
      continue;
    }
    const reach = streetReach(street, arrivals);
    const pop = populationForStreet(tsid, ecologyForStreet(tsid));
    const layout = streetObjectLayout(street);
    const items = [];
    // Rocks (Sparkly and the rest): the shared layout's spots, each in its planned or measured shape.
    const shapes = new Map(rockSpawnPlan(pop, [], tsid).map((r) => [r.index, r.shape]));
    for (const [i, cls, x, y] of layout.rocks) {
      items.push({ kind: 'rock', id: `${cls} ${i}`, x, y, how: reach.thing(rockBox(cls, x, y, shapes.get(i)), verbRange(cls, 'mine')) });
    }
    // Ice Nubbins: wall-mounted, the node's spot (data/objects.json less its 2 px).
    const variants = new Map(resourceSpawnPlan(pop, () => []).map((r) => [r.key, r.variant]));
    for (const [key, cls, x, y2] of layout.nodes) {
      if (cls !== 'ice_knob') continue;
      const y = y2 - 2;
      items.push({ kind: 'nubbin', id: key, x, y, how: reach.thing(nubbinBox(x, y, variants.get(key)), verbRange('ice_knob', 'scrape')) });
    }
    // Quoins: the shared layout's (the realtime server's data/quoins.json and a solo page alike).
    streetQuoinLayout(street).forEach(([x, y, type], i) => {
      items.push({ kind: 'quoin', id: `${i} ${type}`, x, y, how: reach.quoin({ x, y }) });
    });
    results.push({ tsid, label: street.label, items, reach });
  }
});

const misses = (kind) => results.flatMap((s) => s.items.filter((it) => it.kind === kind && !it.how)
  .map((it) => `${s.label} (${s.tsid}) ${kind} ${it.id} at ${Math.round(it.x)},${Math.round(it.y)}`));

describe('Nottis and Drifa: every placed rock, quoin and Ice Nubbin is in a player\'s reach', () => {
  it('sweeps the 32 streets v0.79.0 re-placed, every one modelled, a standing spot on each', () => {
    if (!process.env.GRODDLE_REACH_HUBS) assert.equal(results.length, 32);
    const skipped = results.filter((s) => s.skipped).map((s) => s.label);
    if (!process.env.GRODDLE_REACH_HUBS) assert.deepEqual(skipped, [], 'no Nottis or Drifa street left out');
    for (const s of results) if (!s.skipped) assert.ok(s.reach.stands > 100, `${s.label}: ${s.reach.stands} stand points reached`);
  });

  it('every Sparkly Rock (and every other rock) is touched from a standing spot and in the mine\'s range', () => {
    const sparkly = results.flatMap((s) => s.items.filter((it) => it.kind === 'rock' && /sparkly/.test(it.id)));
    if (!process.env.GRODDLE_REACH_HUBS) assert.ok(sparkly.length >= 4, `${sparkly.length} Sparkly Rocks`);
    assert.deepEqual(misses('rock'), []);
  });

  it('every quoin is touched standing or with a plain jump from a standing spot', () => {
    const total = results.reduce((n, s) => n + s.items.filter((it) => it.kind === 'quoin').length, 0);
    if (!process.env.GRODDLE_REACH_HUBS) assert.equal(total, 256);
    assert.deepEqual(misses('quoin'), []);
  });

  it('every Ice Nubbin is touched standing or at a plain jump (some only with the jump), and in the scrape\'s range', () => {
    const nubbins = results.flatMap((s) => s.items.filter((it) => it.kind === 'nubbin'));
    if (!process.env.GRODDLE_REACH_HUBS) assert.equal(nubbins.length, 310);
    assert.deepEqual(misses('nubbin'), []);
    // Austin's ruling (#725): some high enough to jump for, none out of reach.
    if (nubbins.length) assert.ok(nubbins.some((it) => it.how === 'jump'), 'some need a jump');
  });

  it('the quoins moved into reach (quoins.js QUOIN_REACH_MOVES) each replace a spot the planner still gives, in the shared layout', () => {
    for (const [tsid, moves] of Object.entries(QUOIN_REACH_MOVES)) {
      const street = read(`public/${index[tsid].file}`);
      const pop = populationForStreet(tsid, streetEcology(tsid));
      const planned = planStreetPlacements(platformsScreen(street), placementRequests(pop), {
        worldW: streetWidth(street), seed: tsid, reserved: streetReservedSpots(street),
      }).groups.quoins || [];
      const layout = streetQuoinLayout(street);
      for (const [fx, fy, tx, ty] of moves) {
        assert.ok(planned.some((p) => Math.abs(p.x - fx) < 0.1 && Math.abs(p.y - fy) < 0.1), `${street.label}: the planner no longer gives ${fx},${fy}`);
        assert.ok(layout.some(([x, y]) => x === tx && y === ty), `${street.label}: ${tx},${ty} in the layout`);
      }
    }
  });
});
