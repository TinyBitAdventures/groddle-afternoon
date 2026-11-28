/**
 * Every rock, quoin and Ice Nubbin a street lays out is in a new player's reach, on every street.
 *
 * The planner counts a floor as reached when any jump lands on it, a triple jump too (the catalog's
 * unreachedFloors, G529), but a triple jump is an imagination upgrade (js/movement.js
 * TRIPLE_JUMP_UPGRADES) a new player lacks. The sweep of every street on 2026-11-28 found 6 planned rocks and
 * 94 planned quoins on 42 streets standing on (or hung over) floors only a triple jump lands on. Glitch set its
 * rocks and quoins by hand where players reach them (rock_*.js, quoin.js obey_physics false), so the
 * planner now keeps them off those floors (street-ecology.js NEW_PLAYER_REACH_GROUPS, the catalog's
 * plainUnreachedFloors from tools/ecology/build-unreached-floors.mjs: the same reach graph with a plain
 * jump alone, the game's jump height, run-up and slopes).
 *
 * Reach, with the game's own movement (js/builder/reach-graph.js, the frame game.js physics runs):
 * - the standing spots are the stand points a plain jump, walking, dropping and ladders reach from
 *   the street's arrivals (every signpost arm and door leading to it, tools/builder/calibrate.mjs);
 * - a quoin is taken when the player box touches it (js/quoins.js quoinTouches, items/quoin.js
 *   onPlayerCollision 156) standing there or on any frame of a plain jump from there, straight up or
 *   running either way (reach-graph.js jumpArc, the shared stepper, ceilings and walls included);
 * - a rock or an Ice Nubbin is taken with Enter when the avatar's hit box touches its art (js/reach.js
 *   avatarHitBox, the client's rule) standing or on a jump's frame, and by a click from that spot
 *   inside the verb's range (js/walk-over.js verbRange: mine 150, scrape 300) with no floor between.
 *
 * What runs:
 * - always, on every street (a few seconds): no planned rock or quoin stands on a floor run a plain jump
 *   does not reach (the catalog's runs, the shared layouts' own plan), and the catalog lists those runs;
 * - always, with the stepper: the streets the sweep found things out of reach on, and Nottis's and
 *   Drifa's 32 streets (v0.79.0 re-placed them, G1323, #725), every rock, quoin and Ice Nubbin;
 * - GRODDLE_REACH_FULL=1: the stepper on every street (about 8 minutes). Out of reach then are only
 *   things at Glitch's own spots (measured on the 2012 snaps; Glitch had quoins only an upgrade or a
 *   trick reaches) and things on the few streets the model finds no standing arrival on.
 *   GRODDLE_REACH_HUBS=58,64 takes those hubs' streets instead.
 * Run: node --test tests/new-player-reach.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { avatarHitBox, behindFloor, boxesTouch } from '../public/js/reach.js?v=456da8a8';
import { verbRange } from '../public/js/walk-over.js?v=277ab977';
import { jumpArc, reachStreet, streetBuff, streetWorld } from '../public/js/builder/reach-graph.js?v=687006d3';
import { QUOIN_REACH_MOVES, measuredStreetQuoins, quoinTouches } from '../public/js/quoins.js?v=4d75aec0';
import { rockShapeSheet } from '../public/js/mining.js?v=7ecaa572';
import { getResourceNodeDef } from '../public/js/resource-nodes.js?v=c2eb46b1';
import {
  NEW_PLAYER_REACH_GROUPS,
  ecologyForStreet,
  inUnreachedRun,
  planStreetPlacements,
  plainUnreachedFloorsFor,
  populationForStreet,
  rockSpawnPlan,
  setStreetEcologyCatalog,
  streetReservedSpots,
  unreachedFloorsFor,
} from '../public/js/street-ecology.js?v=1c840641';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=6ec0d8c0';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { streetObjectLayout } from '../tools/build-realtime-objects.mjs';
import { placementRequests, streetEcology, streetQuoinLayout } from '../tools/build-realtime-quoins.mjs';
import { shippedArrivals } from '../tools/builder/calibrate.mjs';
import { shippedStreetFiles } from '../tools/builder/validator-context.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const ecology = read('public/assets/content/street-ecology.json');
const index = read('public/assets/streets/index.json').streets;
setStreetEcologyCatalog(ecology);

const FULL = process.env.GRODDLE_REACH_FULL === '1';
const HUBS = (process.env.GRODDLE_REACH_HUBS || '').split(',').map((s) => s.trim()).filter(Boolean);
/** How far across a standing spot is looked for (a running jump carries about 250 px before it lands). */
const NEAR_X = 280;

/**
 * The sweep of 2026-11-28 found planned rocks or quoins out of a new player's reach (on floors only a
 * triple jump lands on) on 42 streets: these, every street with a rock among them and the ones with
 * the most quoins, are walked with the stepper on every run (the full sweep walks them all).
 */
const FOUND_OUT_OF_REACH = Object.freeze([
  'GA5S22147DH2QGH', // Abesh Litcha: a Metal Rock on a ledge 270 px over the path, and a quoin
  'GA98LV0U3BO2FA0', // Amlou Amoo: a Dullite Rock and a quoin
  'GA9S90EJ0G8241N', // Shoga Links: a Metal Rock on a roof 750 px over the path, and a quoin
  'GHFKT1LK83D2BAF', // Ajiboo Hood: 2 rocks and 3 quoins on the ledges over its east end
  'GIF85V4ON6E2UVV', // Ramfeon Cima: a Dullite Rock
  'GA5D59PVEL13KNQ', // Memento Sana: 15 quoins
  'GA9TCL1H7LD37DC', // Bilicious Blues: 9 quoins
  'GA9UCEFP7LD3523', // Organish Chute: 7 quoins
  'GIF10P7CR622E3R', // Poro Nella: 6 quoins
  'GA524M0OMOE2OGT', // Mada Tamaha: 4 quoins
]);

/** Nottis (137) and Drifa (141): the streets whose files name Ice Nubbins (v0.79.0 hung them on the walls). */
const NUBBIN_HUBS = ['137', '141'];
const nubbinStreet = (tsid) => NUBBIN_HUBS.includes(String(index[tsid]?.hubId)) && ecology.streets[tsid]?.counts?.ice_knob > 0;

/** The streets walked with the stepper. */
const STEPPED = Object.keys(index).filter((tsid) => {
  if (FULL) return true;
  if (HUBS.length) return HUBS.includes('all') || HUBS.includes(String(index[tsid]?.hubId));
  return FOUND_OUT_OF_REACH.includes(tsid) || nubbinStreet(tsid);
}).sort();

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
  for (const tsid of STEPPED) {
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
    const plan = new Map(rockSpawnPlan(pop, [], tsid).map((r) => [r.index, r]));
    for (const [i, cls, x, y] of layout.rocks) {
      const how = reach.thing(rockBox(cls, x, y, plan.get(i)?.shape), verbRange(cls, 'mine'));
      items.push({ kind: 'rock', id: `${cls} ${i}`, x, y, how, glitch: plan.get(i)?.measured === true });
    }
    // Ice Nubbins: wall-mounted, the node's spot (data/objects.json less its 2 px).
    const variants = new Map(resourceSpawnPlan(pop, () => []).map((r) => [r.key, r.variant]));
    for (const [key, cls, x, y2] of layout.nodes) {
      if (cls !== 'ice_knob') continue;
      const y = y2 - 2;
      items.push({ kind: 'nubbin', id: key, x, y, how: reach.thing(nubbinBox(x, y, variants.get(key)), verbRange('ice_knob', 'scrape')) });
    }
    // Quoins: the shared layout's (the realtime server's data/quoins.json and a solo page alike); a
    // measured one (G271) hangs where the 2012 snaps show it.
    const measured = measuredStreetQuoins(tsid) || [];
    const glitchAt = (x, y) => measured.some((m) => Math.abs(m.x - x) < 0.06 && Math.abs(m.y - y) < 0.06);
    streetQuoinLayout(street).forEach(([x, y, type], i) => {
      items.push({ kind: 'quoin', id: `${i} ${type}`, x, y, how: reach.quoin({ x, y }), glitch: glitchAt(x, y) });
    });
    results.push({ tsid, label: street.label, items, reach });
  }
});

/** The things out of reach: `planned` (ours, the planner's or moved by hand) or at Glitch's own spots. */
const misses = (kind, { glitch = false } = {}) => results.flatMap((s) => s.items
  .filter((it) => it.kind === kind && !it.how && Boolean(it.glitch) === glitch && s.reach.stands > 0)
  .map((it) => `${s.label} (${s.tsid}) ${kind} ${it.id} at ${Math.round(it.x)},${Math.round(it.y)}`));

/** The line a planner spot stands on: its candidate's id is `${line id}:${sample}` (buildPlatformCandidates). */
const lineOf = (point) => ({ id: String(point.id).slice(0, String(point.id).lastIndexOf(':')) });

describe('a new player reaches every planned rock and quoin, on every street (the planner\'s rule)', () => {
  it('the catalog lists the floor runs a plain jump misses, and every run no jump reaches is among them', () => {
    const plain = ecology.plainUnreachedFloors;
    assert.ok(plain && Object.keys(plain).length > 250, 'plainUnreachedFloors: run node tools/ecology/build-unreached-floors.mjs');
    for (const tsid of Object.keys(ecology.unreachedFloors)) {
      const all = unreachedFloorsFor(tsid);
      const p = plainUnreachedFloorsFor(tsid);
      for (const [line, runs] of Object.entries(all)) {
        for (const [lo, hi] of runs) assert.ok(p?.[line]?.some(([a, b]) => a <= lo && b >= hi), `${tsid} ${line} ${lo}-${hi}: a plain jump misses it too`);
      }
    }
    // Ajiboo Hood: the ledges its rocks and quoins stood on before (3137 and 3722 across, 230-250 px down).
    const ajiboo = plainUnreachedFloorsFor('GHFKT1LK83D2BAF');
    assert.ok(inUnreachedRun(ajiboo, { id: 'plat_1317350489083' }, 3137.5), 'a plain jump misses the ledge');
    assert.equal(unreachedFloorsFor('GHFKT1LK83D2BAF')?.plat_1317350489083, undefined, 'a triple jump lands on it');
  });

  it('no planned rock or quoin stands on a floor only a triple jump lands on (every street, the shared layout\'s plan)', () => {
    assert.deepEqual([...NEW_PLAYER_REACH_GROUPS], ['rocks', 'quoins']);
    const bad = [];
    let planned = 0;
    let moved = 0;
    for (const tsid of Object.keys(index).filter((t) => !isZoneTsid(t)).sort()) {
      const runs = plainUnreachedFloorsFor(tsid);
      if (!runs || !index[tsid].file) continue;
      const street = read(`public/${index[tsid].file}`);
      const pop = populationForStreet(tsid, streetEcology(tsid));
      const plan = planStreetPlacements(platformsScreen(street), placementRequests(pop), {
        worldW: streetWidth(street), seed: tsid, reserved: streetReservedSpots(street),
      });
      moved += plan.intoReach.length;
      for (const key of NEW_PLAYER_REACH_GROUPS) {
        for (const p of plan.groups[key] || []) {
          if (p.fixed) continue;
          planned += 1;
          if (inUnreachedRun(runs, lineOf(p), p.x)) bad.push(`${street.label} (${tsid}) ${key} ${Math.round(p.x)},${Math.round(p.y)}`);
        }
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(planned > 2000, `${planned} planned rocks and quoins on the streets with such floors`);
    // 2026-11-28: 6 rocks and 94 quoins found out of reach, and 4 more (2 quoins and 2 rocks a jump
    // from below touched, though no plain jump lands on their floors), plus the planned quoins a measured
    // street's snaps replace (they move too, unseen).
    assert.ok(moved >= 100, `${moved} moved into reach`);
  });

  it('a thing moved into reach leaves the groups after it where they were, but where they would crowd a moved rock (Ajiboo Hood)', () => {
    const tsid = 'GHFKT1LK83D2BAF';
    const street = read(`public/${index[tsid].file}`);
    const pop = populationForStreet(tsid, streetEcology(tsid));
    const opts = { worldW: streetWidth(street), seed: tsid, reserved: streetReservedSpots(street) };
    const before = planStreetPlacements(platformsScreen(street), placementRequests(pop), { ...opts, plainUnreached: null });
    const after = planStreetPlacements(platformsScreen(street), placementRequests(pop), opts);
    const moved = new Set(after.intoReach.map((m) => `${m.key}:${m.index}`));
    assert.deepEqual([...moved].sort(), ['quoins:2', 'quoins:3', 'quoins:4', 'rocks:0', 'rocks:2']);
    for (const [key, pts] of Object.entries(before.groups)) {
      pts.forEach((p, i) => {
        if (moved.has(`${key}:${i}`)) return;
        assert.deepEqual([after.groups[key][i].x, after.groups[key][i].y], [p.x, p.y], `${key}:${i} stays`);
      });
    }
    // Each moved one is the nearest spot down on the path under its ledge (screen px; the street is 4000 wide).
    for (const m of after.intoReach) {
      const p = after.groups[m.key][m.index];
      assert.ok(Math.abs(p.x - m.from.x) < 120 && p.y > m.from.y + 500, `${m.key}:${m.index} ${Math.round(m.from.x)},${Math.round(m.from.y)} -> ${Math.round(p.x)},${Math.round(p.y)}`);
    }
  });
});

describe('a new player reaches every rock, quoin and Ice Nubbin, walked with the game\'s stepper', () => {
  it('walks the streets the sweep found things out of reach on, and Nottis\'s and Drifa\'s, a standing spot on each', () => {
    if (!FULL && !HUBS.length) {
      assert.equal(results.filter((s) => nubbinStreet(s.tsid)).length, 32);
      for (const tsid of FOUND_OUT_OF_REACH) assert.ok(results.some((s) => s.tsid === tsid && !s.skipped), `${tsid} walked`);
      assert.deepEqual(results.filter((s) => s.skipped).map((s) => s.label), [], 'none left out');
      for (const s of results) assert.ok(s.reach.stands > 100, `${s.label}: ${s.reach.stands} stand points reached`);
    }
  });

  it('every planned rock (Sparkly ones too) is touched from a standing spot and in the mine\'s range', () => {
    const sparkly = results.flatMap((s) => s.items.filter((it) => it.kind === 'rock' && /sparkly/.test(it.id)));
    if (!FULL && !HUBS.length) assert.ok(sparkly.length >= 4, `${sparkly.length} Sparkly Rocks`);
    assert.deepEqual(misses('rock'), []);
  });

  it('every planned quoin is touched standing or with a plain jump from a standing spot', () => {
    const total = results.reduce((n, s) => n + s.items.filter((it) => it.kind === 'quoin').length, 0);
    if (!FULL && !HUBS.length) assert.ok(total >= 256 + 70, `${total} quoins`);
    assert.deepEqual(misses('quoin'), []);
  });

  it('every Ice Nubbin is touched standing or at a plain jump (some only with the jump), and in the scrape\'s range', () => {
    const nubbins = results.flatMap((s) => s.items.filter((it) => it.kind === 'nubbin'));
    if (!FULL && !HUBS.length) assert.equal(nubbins.length, 310);
    assert.deepEqual(misses('nubbin'), []);
    // Austin's ruling (#725): some high enough to jump for, none out of reach.
    if (nubbins.length) assert.ok(nubbins.some((it) => it.how === 'jump'), 'some need a jump');
  });

  it('out of reach on a full sweep: only Glitch\'s own spots (measured on the 2012 snaps) and streets with no standing arrival', { skip: !FULL && 'GRODDLE_REACH_FULL=1' }, () => {
    const glitch = [...misses('rock', { glitch: true }), ...misses('quoin', { glitch: true })];
    const noStand = results.filter((s) => !s.skipped && s.reach.stands === 0).map((s) => s.label).sort();
    // 2026-11-28: 6 measured rocks and 223 measured quoins on 87 streets; Double Rainbow, Pitchen
    // Lilliputt, Winter Wingding, Orangian, Piryan and Blooian arrive at no point the model stands on.
    console.log(`Glitch's own spots out of reach: ${glitch.length}\n${glitch.join('\n')}\nno standing arrival: ${noStand.join(', ')}`);
    assert.ok(glitch.length <= 229, `${glitch.length} at Glitch's spots`);
    assert.ok(noStand.length <= 6, noStand.join(', '));
  });

  it('the quoins moved into reach by hand (quoins.js QUOIN_REACH_MOVES) each replace a spot the planner still gives, in the shared layout', () => {
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
