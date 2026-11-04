/**
 * Street Piggies and Chickens walk on (lane PIGSTUCK, Austin 2026-11-01, live v0.9.0, Groddle
 * Forest Junction): "found a pig stuck in the tree. He walked in from the left and just got stuck",
 * then two at the same Bean Tree, one over the other; "while I was harvesting, the pig would pause
 * then start" (and on Northwest Passage while digging); Chickens "hop, like they're restarting their
 * animation from the other side".
 *
 * Causes: a hungry Piggy sent to a tree (a harvest, water or pet with fruit on it; the server's food
 * tick online) walked to the trunk's x, ate, and then patrolled round the trunk for good, every
 * Piggy that went there on the same spot; it froze whenever the player ran any verb anywhere
 * (engine.acting); a shared Chicken stopped only on the screen of the player at its menu while its
 * path ran on, so it jumped when the menu closed. Now a Piggy stops beside the tree's foot, never
 * two on one spot, walks home after its pause and waits only for a player at it (npc.js
 * onInteractionStarting 2191-2200, npc_animal onWaitStart 2048-2054); the street plans every
 * walker's walk clear of trees, rocks and stalls (street-ecology.js walkInScenery); a player at a
 * shared Chicken holds it for everyone (street-objects-feature waitAtCreature, the server's
 * waitCreature).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAnimalState } from '../public/js/animals.js?v=761b9fa7';
import { PIGGY_ROOTING, animalMoodFeature, piggyRootDelayMs } from '../public/js/features/animal-mood-feature.js?v=d1247320';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=505d8990';
import {
  ANIMAL_BODY,
  PLACEMENT_FOOTPRINTS,
  TREE_FOOTPRINT,
  WALK_FLOOR_DY,
  animalPatrolRange,
  ecologyForStreet,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
  walkInScenery,
} from '../public/js/street-ecology.js?v=d41e5e97';
import { walkerAt } from '../public/js/street-creatures.js?v=af1311cd';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=33d2b8bc';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8')));
setZoneStreetsShown(false);
applyStreetIndex(index);

const TSID = 'GLI3272LOTD1B1F'; // Groddle Forest Junction
const BEAN = 3310; // its Bean Tree at 3310, 1112 (the realtime data's tree:1)
const SCENERY = ['trees', 'gardens', 'vendor', 'shrine', 'rocks'];

function street({ mode = 'solo', hunger = 6, root = 'off', xs = [2962, 2700] } = {}) {
  const walk = [{ walk: true }];
  const sprite = (x, i) => ({
    x, y: 1083, vx: (i % 2 ? -1 : 1) * 0.45, baseX: x, range: 90, home: { x, range: 90 }, baseScale: 1,
    scale: { x: 1, y: 1 }, visible: true, destroyed: false, textures: walk, loop: true, playing: true, animationSpeed: 0.14,
    gotoAndPlay() { this.playing = true; }, gotoAndStop() { this.playing = false; }, play() { this.playing = true; },
  });
  const pigs = xs.map((x, i) => ({
    classId: 'npc_piggy', label: 'Piggy', classIndex: i, animalKey: `${TSID}:npc_piggy:${i}`,
    state: createAnimalState('npc_piggy', { hunger, mood: 1, hungerAt: Date.now() + 3_600_000 }), sprite: sprite(x, i),
  }));
  const tree = { classId: 'trant_bean', state: { fruitCount: 9 }, sprite: { x: BEAN, y: 1114, visible: true, destroyed: false, scale: { x: 1 } } };
  let at = null;
  const engine = {
    started: true, mode, streetTsid: TSID, street: { tsid: TSID, hubId: '58', hubName: 'Groddle Forest' },
    interactables: [...pigs, tree], droppedItems: { streets: {} }, textures: { piggyWalk: { frames: walk } },
    platforms: [], groundY: 1110, player: { x: 3250, y: 1110 }, pc: {}, inv: {}, camera: { x: 0, y: 0, w: 1280 },
    inScene: () => false, transientInstance: () => false, homeContext: () => ({ inHome: false }), busy: () => false,
    // pigroot=off: these walks are timed without the rooting pauses (they have their own tests below).
    acting: () => Boolean(at), actingOn: (t) => Boolean(at) && at === t, param: (k) => (k === 'pigroot' && root ? root : null), setData() {}, say() {}, save() {},
    droppedItemsChanged() {}, streetSlot: () => ({}),
    query: (k) => (mode === 'multiplayer' && (k === 'sharedPiggy' || k === 'sharedPiggyAte') ? true : null),
  };
  // The feature's clock is Date.now (its eat pause, its scans): the test's own clock.
  let t = Date.now();
  Date.now = () => t;
  const tick = (ms = 1000 / 60) => {
    t += ms;
    animalMoodFeature.onTick(ms, t, engine);
    for (const p of pigs) {
      // game.js patrol (a verb on it or its menu holds it there).
      if (at === p) continue;
      const s = p.sprite;
      s.x += s.vx * (ms / (1000 / 60));
      if (s.x > s.baseX + s.range) { s.x = s.baseX + s.range; s.vx *= -1; }
      if (s.x < s.baseX - s.range) { s.x = s.baseX - s.range; s.vx *= -1; }
    }
  };
  const run = (s, each = null) => { for (let i = 0; i < s * 60; i += 1) { each?.(i); tick(); } };
  return { engine, pigs, tree, tick, run, setAt: (x) => { at = x; } };
}

describe('a tree you work does not send the server\'s Piggies (ticket 40)', () => {
  it('online, a harvest leaves the street Piggies on their walks: only the server\'s ate events move them', () => {
    animalMoodFeature.onStreetClear();
    const { engine, pigs, run } = street({ mode: 'multiplayer' });
    run(1.2);
    const homes = pigs.map((p) => p.sprite.home.x);
    animalMoodFeature.onEvent('trant_bean:harvest', 1, engine);
    run(20);
    pigs.forEach((p, i) => {
      assert.equal(p.sprite.baseX, homes[i], 'still on its own walk');
      assert.ok(Math.abs(p.sprite.x - homes[i]) <= 90.01, `wandered to ${p.sprite.x}`);
    });
  });
});

describe('a hungry Piggy sent to a tree', () => {
  for (const mode of ['solo', 'multiplayer']) {
    it(`stops beside the tree's foot, not in it, never two on one spot, then walks home (${mode})`, () => {
      animalMoodFeature.onStreetClear();
      const { engine, pigs, tree, run } = street({ mode });
      run(1.2);
      if (mode === 'solo') animalMoodFeature.onEvent('trant_bean:harvest', 1, engine);
      else for (const p of pigs) animalMoodFeature.sharedAnimalEvent(p, { ev: 'ate', on: tree }, engine);
      const stops = new Map();
      run(45, () => {
        for (const p of pigs) {
          // Where each stood still beside the tree (its eat pause).
          if (Math.abs(p.sprite.x - BEAN) < 400 && Math.abs(p.sprite.vx) < 0.01 && p.sprite.range < 10) stops.set(p, Math.round(p.sprite.x));
        }
      });
      assert.equal(stops.size, 2, 'both walked to the tree and stopped there');
      const xs = [...stops.values()];
      for (const x of xs) assert.ok(Math.abs(x - BEAN) >= TREE_FOOTPRINT / 2 + ANIMAL_BODY.piggies / 2 - 7, `a Piggy stopped in the tree at ${x}`);
      assert.ok(Math.abs(xs[0] - xs[1]) >= ANIMAL_BODY.piggies - 7, `two Piggies on one spot: ${xs}`);
      // Fed (solo: one fruit each from the tree; online the server took it), each back on its own walk.
      if (mode === 'solo') assert.equal(tree.state.fruitCount, 7);
      for (const p of pigs) {
        assert.equal(p.sprite.baseX, p.sprite.home.x, 'its walk is its own again');
        assert.equal(p.sprite.range, 90);
        assert.ok(Math.abs(p.sprite.vx) >= 0.4, 'and it walks');
        assert.ok(Math.abs(p.sprite.x - p.sprite.home.x) <= 90.01);
      }
    });
  }

  it('walks on while the player harvests or digs elsewhere; waits only for a player at it', () => {
    animalMoodFeature.onStreetClear();
    const { engine, pigs, tree, run, setAt } = street();
    run(1.2);
    animalMoodFeature.onEvent('trant_bean:harvest', 1, engine);
    // The player swings at a rock somewhere (any verb that is not on this Piggy).
    setAt({ classId: 'rock_beryl_1' });
    const x0 = pigs[0].sprite.x;
    run(2);
    assert.ok(pigs[0].sprite.x > x0 + 40, `it kept walking to the tree: ${x0} -> ${pigs[0].sprite.x}`);
    // A player opens this Piggy's menu: it stands for them (npc_animal onWaitStart).
    setAt(pigs[0]);
    const x1 = pigs[0].sprite.x;
    run(2);
    assert.equal(pigs[0].sprite.x, x1);
    setAt(null);
    run(2);
    assert.ok(pigs[0].sprite.x > x1 + 40);
    assert.ok(tree.state.fruitCount <= 9);
  });

  it('never stands for good: a Piggy left holding still with nothing holding it walks again', () => {
    animalMoodFeature.onStreetClear();
    const { pigs, run } = street({ hunger: 0 });
    run(1.2);
    // Some hold that forgot to let go (a crowd sulk saved the food walk's 2 px hold, say).
    Object.assign(pigs[1].sprite, { x: 3150, baseX: 3150, range: 2, vx: 1e-6 });
    run(16);
    const s = pigs[1].sprite;
    assert.equal(s.range, 90);
    assert.equal(s.baseX, s.home.x);
    assert.ok(Math.abs(s.x - s.home.x) <= 90.01, `it walked home: ${s.x}`);
    assert.ok(Math.abs(s.vx) >= 0.4);
  });
});

describe('every street\'s walking animals', () => {
  const streets = Object.keys(index.streets).filter((tsid) => !/^GZ/.test(tsid)).sort();

  it('stand clear of trees, rocks and stalls, and every walk moves', async () => {
    let walkers = 0;
    let turnsIn = 0;
    const bad = [];
    for (const tsid of streets) {
      let data;
      try { data = await loadStreetDataFromFs(tsid, streetsDir); } catch { continue; }
      const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
      const plan = planStreetPlacements(platformsScreen(data), placementRequests(pop), { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
      const scenery = SCENERY.flatMap((key) => (plan.groups[key] || []).map((p) => ({ ...p, key })));
      for (const key of ['piggies', 'chickens']) {
        const spots = plan.groups[key] || [];
        spots.forEach((p, i) => {
          walkers += 1;
          const range = animalPatrolRange(key, p.room);
          const inside = scenery.find((o) => Math.abs(o.y - p.y) <= WALK_FLOOR_DY && Math.abs(o.x - p.x) < PLACEMENT_FOOTPRINTS[o.key] / 2 + ANIMAL_BODY[key] / 2);
          if (inside) bad.push(`${tsid} ${key}:${i} at ${Math.round(p.x)},${Math.round(p.y)} in ${inside.key} at ${Math.round(inside.x)}`);
          if (walkInScenery(p, key, scenery) === 1) turnsIn += 1;
          // A walk that never moves again: too short to read as walking, or a path that stands.
          if (range < 40) bad.push(`${tsid} ${key}:${i} walks ${range} px`);
          if (key === 'chickens') {
            const a = walkerAt({ baseX: p.x, range }, 0).x;
            const b = walkerAt({ baseX: p.x, range }, 2000).x;
            if (Math.abs(a - b) < 30) bad.push(`${tsid} chicken:${i} path stands`);
          }
          spots.slice(0, i).forEach((q, j) => {
            if (Math.abs(q.y - p.y) <= WALK_FLOOR_DY && Math.abs(q.x - p.x) < ANIMAL_BODY[key]) bad.push(`${tsid} ${key}:${i} on ${key}:${j}`);
          });
        });
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(walkers >= 2500, String(walkers));
    // Before: 4 planted inside scenery, 2 on another Piggy, 303 walks turning inside scenery. On the
    // crowded streets 64 walks still reach a tree, rock or stall (no clear floor left, and the
    // arrival point kept clear first); they walk past it, as the original's did. 69 -> 73 when ticket 64's
    // unreached floors were rebuilt for the full jump (2026-11-04): the planner's spots shifted on 67 streets.
    assert.ok(turnsIn <= 73, `walks reaching into scenery: ${turnsIn}`);
  });
});

describe('Piggies root as they walk (Austin 2026-11-01; npc_piggy.js onRooting 1131-1160)', () => {
  const realRandom = Math.random;
  /** Each stop on its walk: when it began (s into the walk), how long, and which way it went before and after. */
  function stopsOf(pig, run, seconds) {
    const out = [];
    let cur = null;
    let lastDir = Math.sign(pig.sprite.vx);
    let t = 0;
    run(seconds, () => {
      t += 1 / 60;
      const s = pig.sprite;
      const still = s.range < 10;
      if (still && !cur) cur = { at: t, x: s.x, before: lastDir };
      if (!still && cur) {
        out.push({ ...cur, ms: Math.round((t - cur.at) * 1000), after: Math.sign(s.vx) });
        cur = null;
      }
      if (!still) lastDir = Math.sign(s.vx);
    });
    return out;
  }

  it('waits randInt(3, 10) s on its walk (startMoving 1243)', () => {
    assert.deepEqual([PIGGY_ROOTING.minS, PIGGY_ROOTING.maxS, PIGGY_ROOTING.lookChance], [3, 10, 0.3]);
    assert.equal(piggyRootDelayMs(() => 0), 3000);
    assert.equal(piggyRootDelayMs(() => 0.999), 10000);
    assert.equal(piggyRootDelayMs(() => 0.5), 7000);
  });

  for (const mode of ['solo', 'multiplayer']) {
    it(`looks at you for 5 s and walks on the same way, or sniffs for 3 s and turns round (${mode})`, () => {
      try {
        // 0: a 3 s wait and a look (0 < 0.3); 0.5: a 7 s wait and a sniff.
        const rolls = [0, 0, 0.5, 0.5];
        Math.random = () => (rolls.length ? rolls.shift() : 0.99);
        animalMoodFeature.onStreetClear();
        const { pigs, run } = street({ mode, hunger: 0, root: '', xs: [1500] });
        const pig = pigs[0];
        const stops = stopsOf(pig, run, 20);
        assert.ok(stops.length >= 2, JSON.stringify(stops));
        const [look, sniff] = stops;
        assert.ok(Math.abs(look.at - 4) < 1.3, `first stop about 3 s after the first scan: ${look.at}`);
        assert.ok(Math.abs(look.ms - PIGGY_ROOTING.lookMs) < 1200, `a look lasts 5 s: ${look.ms}`);
        assert.equal(look.after, look.before, 'after a look it walks on the same way');
        assert.ok(Math.abs(sniff.ms - PIGGY_ROOTING.sniffMs) < 1200, `a sniff lasts 3 s: ${sniff.ms}`);
        assert.equal(sniff.after, -sniff.before, 'after a sniff it turns round (stopSniffing turnAround)');
        assert.ok(Math.abs(pig.sprite.x - pig.sprite.home.x) <= 90.01, 'always on its own walk');
      } finally {
        Math.random = realRandom;
      }
    });
  }

  it('with rooting on, a Piggy never stands in the tree, both still eat beside it and walk home', () => {
    try {
      let seed = 7;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      animalMoodFeature.onStreetClear();
      const { engine, pigs, tree, run } = street({ root: '' });
      run(1.2);
      animalMoodFeature.onEvent('trant_bean:harvest', 1, engine);
      const trunk = TREE_FOOTPRINT / 2 + ANIMAL_BODY.piggies / 2;
      run(60, () => {
        for (const p of pigs) {
          const s = p.sprite;
          // Standing still by the trunk is only its eat pause: beside the foot, never in it.
          if (s.range < 10 && Math.abs(s.x - BEAN) < trunk - 7) assert.fail(`a Piggy stood in the tree at ${s.x}`);
        }
      });
      assert.equal(tree.state.fruitCount, 7, 'both walked to the tree and ate');
      // Let any rooting stop end, then each walks its own walk.
      run(6);
      for (const p of pigs) {
        assert.ok(Math.abs(p.sprite.x - p.sprite.home.x) <= 90.01, `back on its walk: ${p.sprite.x}`);
        if (p.sprite.range >= 10) assert.equal(p.sprite.baseX, p.sprite.home.x);
      }
    } finally {
      Math.random = realRandom;
    }
  });

  it('a Piggy you stand at roots no more until you leave it; a rooked or sulking one never roots', () => {
    const src = readFileSync(join(root, 'public/js/features/animal-mood-feature.js'), 'utf8');
    assert.match(src, /r\.mode === 'idle' && !isExtra\(target\) && !crowdHeld && !waiting && Number\(target\.sprite\.range\) >= HELD_RANGE_PX\n\s*&& rootingMode\(engine\) !== 'off' && !isRooked\(target, engine\) && !isCrowdSad\(target\.state, time\)/);
    assert.match(src, /if \(time >= r\.rootUntil && !waiting && !crowdHeld\) endRoot\(engine, r\);/);
    assert.match(src, /\(r\.mode === 'seek' \|\| r\.mode === 'eat' \|\| r\.mode === 'root'\) && isRooked\(target, engine\)/);
    assert.match(src, /lookScreen: Object\.freeze\(\{ path: 'assets\/sprites\/npc_piggy__x1_look_screen_png_1354829434\.png', fw: 88, fh: 62, cols: 10, frames: 48 \}\)/);
  });
});
