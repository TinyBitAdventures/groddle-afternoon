/**
 * Ticket 99: your released, hatched and grown Piggies, Chickens and Butterflies each walk on their
 * own (js/yard-wander.js), in your yard and on a visit (animal-husbandry-feature extras,
 * yard-verbs-mp-feature copies), and the site sends a visitor each animal's spot and the placed
 * Magic Sticks (groddle-afternoon-site src/HomeYard.php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  STICK_ANIMAL,
  YARD_CATCH_UP,
  YARD_LINGER_MS,
  YARD_MIN_STEP,
  YARD_SPAWN_GAP,
  followYardPath,
  freeYardSpot,
  stickForClass,
  yardPathTime,
  yardPlan,
  yardWanderAt,
  yardWindow,
} from '../public/js/yard-wander.js?v=cc666db9';
import { normalizeYardView } from '../public/js/yard-verbs-mp.js?v=fdcc0143';
import { normalizeHusbandrySlot } from '../public/js/features/animal-husbandry-feature.js?v=710200a8';
import { MAGIC_STICKS, STICK_DISTANCE } from '../public/js/animal-husbandry.js?v=4fd2fae5';
import { GAME_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const read = (rel) => readFileSync(join(GAME_DIR, rel), 'utf8');
const WORLD_W = 3000;
const PIG_STICK = { classTsid: 'magic_pig_stick', x: 1500, distance: STICK_DISTANCE };
const BUTTERFLY_STICK = { classTsid: 'magic_butterfly_stick', x: 1500, distance: STICK_DISTANCE };

function animal(id, classId, extra = {}) {
  return { id, classId, homeX: 1400, stick: null, worldW: WORLD_W, ...extra };
}

/** Each animal's x every 250 ms over `minutes` of path time. */
function track(animals, minutes = 10, t0 = 5_000_000_000) {
  const out = animals.map(() => []);
  for (let t = t0; t < t0 + minutes * 60_000; t += 250) {
    animals.forEach((a, i) => out[i].push(yardWanderAt(a, t)));
  }
  return out;
}

/** How often two tracks are within `px` of each other (0..1). */
function together(a, b, px = 12, lift = false) {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) {
    const near = Math.abs(a[i].x - b[i].x) < px && (!lift || Math.abs((a[i].lift - a[i].bob) - (b[i].lift - b[i].bob)) < px);
    if (near) n += 1;
  }
  return n / a.length;
}

function sprite(x, y = 500) {
  return { x, y, baseScale: 0.97, scale: { x: 0.97, y: 0.97 }, loop: true };
}

describe('Each yard animal walks on its own (ticket 99)', () => {
  it('three Piggies released on one spot never share a path', () => {
    const pigs = ['a1', 'a2', 'a3'].map((id) => animal(id, 'npc_piggy'));
    const tracks = track(pigs);
    for (let i = 0; i < pigs.length; i += 1) {
      for (let j = i + 1; j < pigs.length; j += 1) {
        assert.ok(together(tracks[i], tracks[j]) < 0.2, `${pigs[i].id} and ${pigs[j].id} walk apart`);
      }
    }
    const plans = pigs.map((p) => yardPlan({ id: p.id, classId: p.classId, ...yardWindow(p) }));
    assert.equal(new Set(plans.map((p) => p.speed.toFixed(5))).size, 3, 'each its own speed');
    for (const p of plans) {
      assert.ok(p.speed * 1000 >= 30 && p.speed * 1000 <= 55, 'npc_piggy.js 1442 randInt(30, 55) px/s');
    }
  });

  it('with a Pig Stick placed they stay by it, each on its own walk (the report: "it looked like one piggy")', () => {
    const pigs = ['a1', 'a2', 'a3'].map((id, i) => animal(id, 'npc_piggy', { homeX: 300 + i * 2000, stick: PIG_STICK }));
    const tracks = track(pigs);
    for (const tr of tracks) {
      for (const at of tr) assert.ok(at.x >= PIG_STICK.x - PIG_STICK.distance && at.x <= PIG_STICK.x + PIG_STICK.distance);
    }
    for (let i = 0; i < pigs.length; i += 1) {
      for (let j = i + 1; j < pigs.length; j += 1) assert.ok(together(tracks[i], tracks[j]) < 0.15);
    }
  });

  it('five Butterflies by a Butterfly Stick fly apart, at their own heights', () => {
    const flies = ['a4', 'a5', 'a6', 'a7', 'a8'].map((id) => animal(id, 'npc_butterfly', { stick: BUTTERFLY_STICK }));
    const tracks = track(flies);
    for (let i = 0; i < flies.length; i += 1) {
      for (let j = i + 1; j < flies.length; j += 1) assert.ok(together(tracks[i], tracks[j], 12, true) < 0.1, `${flies[i].id} and ${flies[j].id}`);
    }
    const lifts = new Set(tracks.map((tr) => Math.round(tr[0].lift)));
    assert.ok(lifts.size >= 4, 'their own heights');
  });

  it('Chickens too, and walks pause the way the source does', () => {
    const hens = ['a1', 'a2'].map((id) => animal(id, 'npc_chicken'));
    const tracks = track(hens);
    assert.ok(together(tracks[0], tracks[1]) < 0.2);
    const pig = yardPlan({ id: 'a1', classId: 'npc_piggy', left: 100, right: 600 });
    for (const g of pig.segs.filter((s) => s.pose === 'stand')) assert.ok([3000, 5000].includes(g.ms), 'onRooting: sniff 3 s or look 5 s');
    const hen = yardPlan({ id: 'a2', classId: 'npc_chicken', left: 100, right: 600 });
    for (const g of hen.segs.filter((s) => s.pose === 'stand')) assert.ok(g.ms >= 2000 && g.ms <= 4000, 'onPause: 2-4 s');
    for (const g of pig.segs.slice(0, -1).filter((s) => s.pose === 'walk')) assert.ok(Math.abs(g.tx - g.x) >= YARD_MIN_STEP - 0.001, 'each leg at least 25 px on');
  });

  it('is the same walk on every page and after a reload (seeded by id and class)', () => {
    const a = animal('a3', 'npc_piggy', { stick: PIG_STICK });
    const t = 7_777_777_777;
    assert.deepEqual(yardWanderAt({ ...a }, t), yardWanderAt({ ...a }, t));
    assert.notDeepEqual(yardWanderAt(a, t), yardWanderAt({ ...a, id: 'a4' }, t));
    assert.equal(yardPathTime(1_238_562_000_000 + 5), 5);
  });

  it('a window meeting the street\'s end shifts inside it, not shrinking', () => {
    const w = yardWindow({ id: 'a1', classId: 'npc_piggy', stick: { classTsid: 'magic_pig_stick', x: 100, distance: 250 }, worldW: WORLD_W });
    assert.equal(w.left, 30);
    assert.equal(w.right - w.left, 500);
  });
});

describe('Drawing the walk (followYardPath)', () => {
  it('a player at one animal holds that one only', () => {
    const pigs = ['a1', 'a2', 'a3'].map((id) => ({ a: animal(id, 'npc_piggy', { stick: PIG_STICK }), spr: null, drive: { holdUntil: 0 } }));
    let now = 6_000_000_000;
    for (const p of pigs) {
      p.spr = sprite(yardWanderAt(p.a, yardPathTime(now)).x);
    }
    // Petting a2 for 3 s.
    const heldX = pigs[1].spr.x;
    for (let f = 0; f < 180; f += 1) {
      now += 16.67;
      for (const [i, p] of pigs.entries()) followYardPath(p.spr, p.drive, { animal: p.a, nowMs: now, dtMs: 16.67, held: i === 1, groundAt: () => 500 });
    }
    assert.equal(pigs[1].spr.x, heldX, 'the petted one stands');
    for (const i of [0, 2]) {
      assert.ok(Math.abs(pigs[i].spr.x - yardWanderAt(pigs[i].a, yardPathTime(now)).x) < 1, 'the others walk their own paths');
    }
    // Let go: it stands the source's 5 s more, then walks back onto its path at a calm pace.
    for (let f = 0; f < Math.floor(YARD_LINGER_MS.npc_piggy / 16.67) - 2; f += 1) {
      now += 16.67;
      followYardPath(pigs[1].spr, pigs[1].drive, { animal: pigs[1].a, nowMs: now, dtMs: 16.67, groundAt: () => 500 });
    }
    assert.equal(pigs[1].spr.x, heldX, 'still standing just after');
    let last = pigs[1].spr.x;
    const speed = yardPlan({ id: 'a2', classId: 'npc_piggy', ...yardWindow(pigs[1].a) }).speed;
    for (let f = 0; f < 60 * 40; f += 1) {
      now += 16.67;
      followYardPath(pigs[1].spr, pigs[1].drive, { animal: pigs[1].a, nowMs: now, dtMs: 16.67, groundAt: () => 500 });
      assert.ok(Math.abs(pigs[1].spr.x - last) <= speed * 16.67 * YARD_CATCH_UP + 0.6, 'no jump');
      last = pigs[1].spr.x;
    }
    assert.ok(Math.abs(pigs[1].spr.x - yardWanderAt(pigs[1].a, yardPathTime(now)).x) < 1, 'back on its own path');
  });

  it('a Butterfly a player is at stops too ("interacting with them doesn\'t make them pause")', () => {
    const a = animal('a5', 'npc_butterfly', { stick: BUTTERFLY_STICK });
    const spr = sprite(1500, 400);
    const drive = { holdUntil: 0 };
    let now = 6_100_000_000;
    followYardPath(spr, drive, { animal: a, nowMs: now, dtMs: 16.67, groundAt: () => 500 });
    const x = spr.x;
    const y = spr.y;
    for (let f = 0; f < 120; f += 1) {
      now += 16.67;
      followYardPath(spr, drive, { animal: a, nowMs: now, dtMs: 16.67, held: true, groundAt: () => 500 });
    }
    assert.equal(spr.x, x);
    assert.equal(spr.y, y);
  });

  it('a stacked yard from an old save spreads out calmly on load', () => {
    const stacked = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ a: animal(id, 'npc_butterfly', { homeX: 1200, stick: BUTTERFLY_STICK }), spr: sprite(1200, 410), drive: { holdUntil: 0 } }));
    let now = 6_200_000_000;
    for (let f = 0; f < 60 * 30; f += 1) {
      now += 16.67;
      for (const p of stacked) {
        const before = p.spr.x;
        followYardPath(p.spr, p.drive, { animal: p.a, nowMs: now, dtMs: 16.67, groundAt: () => 500 });
        assert.ok(Math.abs(p.spr.x - before) < 2, 'about a pixel a frame: no jump');
      }
    }
    for (const p of stacked) {
      assert.ok(Math.abs(p.spr.x - yardWanderAt(p.a, yardPathTime(now)).x) < 1, `${p.a.id} is on its own path`);
    }
    // From then on no two are glued: over 20 s, any two share a spot (6 px) less than a fifth of the time.
    const near = new Map();
    for (let f = 0; f < 60 * 20; f += 1) {
      now += 16.67;
      for (const p of stacked) followYardPath(p.spr, p.drive, { animal: p.a, nowMs: now, dtMs: 16.67, groundAt: () => 500 });
      for (let i = 0; i < stacked.length; i += 1) {
        for (let j = i + 1; j < stacked.length; j += 1) {
          const [a, b] = [stacked[i].spr, stacked[j].spr];
          if (Math.abs(a.x - b.x) < 6 && Math.abs(a.y - b.y) < 6) near.set(`${i}:${j}`, (near.get(`${i}:${j}`) || 0) + 1);
        }
      }
    }
    for (const [pair, n] of near) assert.ok(n < 60 * 4, `pair ${pair} together ${n} frames`);
  });

  it('a new animal arrives at its own spot near where it was released', () => {
    assert.equal(freeYardSpot(500, []), 500);
    const second = freeYardSpot(500, [500]);
    assert.ok(Math.abs(second - 500) >= YARD_SPAWN_GAP && Math.abs(second - 500) <= 100);
    const third = freeYardSpot(500, [500, second]);
    assert.ok([500, second].every((x) => Math.abs(third - x) >= YARD_SPAWN_GAP));
    assert.ok(freeYardSpot(60, [60], { min: 60 }) >= 60 + YARD_SPAWN_GAP);
  });

  it('the stick map matches the game\'s Magic Sticks', () => {
    for (const [cls, def] of Object.entries(MAGIC_STICKS)) assert.equal(STICK_ANIMAL[cls], def.animal);
    assert.equal(stickForClass([PIG_STICK, BUTTERFLY_STICK], 'npc_butterfly'), BUTTERFLY_STICK);
    assert.equal(stickForClass([PIG_STICK], 'npc_chicken'), null);
  });
});

describe('Saves, visits and both renderers', () => {
  it('an old save\'s animals get their spot from where they stood; new ones keep theirs', () => {
    const s = normalizeHusbandrySlot({ animals: [{ id: 'a1', classId: 'npc_piggy', x: 812 }, { id: 'a2', classId: 'npc_piggy', x: 812, homeX: 640 }] });
    assert.equal(s.animals[0].homeX, 812);
    assert.equal(s.animals[1].homeX, 640);
  });

  it('a visitor reads each animal\'s spot and the owner\'s sticks', () => {
    const v = normalizeYardView({ owner: 7, animals: [{ id: 'a1', classId: 'npc_piggy', x: 300, homeX: 280, state: {} }, { id: 'a2', classId: 'npc_chicken', x: 90, state: {} }], sticks: [{ classTsid: 'magic_pig_stick', x: 1500, distance: 120 }, { classTsid: 'magic_rook_stick', x: 1 }] });
    assert.equal(v.animals[0].homeX, 280);
    assert.equal(v.animals[1].homeX, 90, 'an older save: its x');
    assert.deepEqual(v.sticks, [{ classTsid: 'magic_pig_stick', x: 1500, distance: 120 }]);
    assert.deepEqual(normalizeYardView({ owner: 7 }).sticks, []);
  });

  it('both renderers draw the one walk and no longer key it by the length of the id', () => {
    const own = read('public/js/features/animal-husbandry-feature.js');
    const visit = read('public/js/features/yard-verbs-mp-feature.js');
    for (const src of [own, visit]) {
      assert.match(src, /followYardPath\(/);
      assert.doesNotMatch(src, /row\.id\.length/);
      assert.match(src, /actingOn\?\.\(/, 'a player at it holds it');
    }
    assert.match(own, /freeYardSpot\(/);
    assert.match(visit, /stickForClass\(visit\.view\.sticks/);
  });

  it('the site sends a visitor each animal\'s spot and the placed sticks', { skip: skipWithoutSite }, () => {
    const php = readFileSync(sitePath('src', 'HomeYard.php'), 'utf8');
    assert.match(php, /'homeX' => \$homeX/);
    assert.match(php, /'sticks' => self::stickRows\(\$state\)/);
    for (const cls of Object.keys(MAGIC_STICKS)) assert.ok(php.includes(`'${cls}'`), cls);
  });
});
