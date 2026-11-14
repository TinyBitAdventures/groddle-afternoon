/**
 * Heli Kitties and Crabs in the same place for everyone online (slice 2 of
 * research/plans/street-animals-shared.md): each walks one path from the server's spot and clock
 * (js/street-creatures.js walkerSpan, kittyWalkAt, crabWalkAt), with the source's pauses rolled from
 * a seed every page shares; the server (groddle-afternoon-server objects_creatures.go) keeps only
 * lag and hold. A Crab's memory of the tunes it heard stays each player's own.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  CRAB_PLAN_MOVES,
  KITTY_PLAN_PAUSES,
  WALKER_REACH,
  chickenSeed,
  crabPlan,
  crabWalkAt,
  creatureOf,
  kittyPlan,
  kittyWalkAt,
  pathTime,
  walkerSpan,
} from '../public/js/street-creatures.js?v=817c9754';
import { KITTY_MOTION, KITTY_PAUSE_CHOICES, KITTY_PET } from '../public/js/heli-kitties.js?v=addb573f';
import { CRAB_WALK } from '../public/js/crabs.js?v=cd5dd7a6';
import { GAME_EPOCH_MS } from '../public/js/game-day.js?v=cf9afac0';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=0c242a7c';
import { heliKittiesFeature } from '../public/js/features/heli-kitties-feature.js?v=4d860a50';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

// A floor from 0 to 1600 at y 800, a gap, then another from 1700 to 3000.
const platforms = [
  { x1: 0, y1: 800, x2: 1600, y2: 800, pc_perm: -1, item_perm: -1 },
  { x1: 1700, y1: 800, x2: 3000, y2: 800, pc_perm: -1, item_perm: -1 },
];

describe('a walker\'s run of floor', () => {
  it('follows the floor from its spot until it ends, never nearer the street\'s ends than the source lets it', () => {
    const span = walkerSpan(platforms, 900, 800, { worldW: 3000, ...WALKER_REACH.kitty });
    assert.equal(span.l, 100, 'startMovingLimited: geo.l + 100');
    assert.ok(span.r >= 1598 && span.r <= 1600, `the floor ends at 1600 (onStuck): ${span.r}`);
    const far = walkerSpan(platforms, 2000, 800, { worldW: 3000, ...WALKER_REACH.crab });
    assert.ok(far.l >= 1700 && far.l <= 1702 && far.r === 2900, JSON.stringify(far));
    // Nowhere to stand: it stays on its spot.
    assert.deepEqual(walkerSpan(platforms, 1650, 800, { worldW: 3000, ...WALKER_REACH.kitty }), { l: 1650, r: 1650 });
  });
});

describe('a shared Heli Kitty', () => {
  const home = { l: 100, r: 1600, x0: 900, dir: -1 };
  it('walks edge to edge at 50 to 55 px/s with the source\'s pauses, the same round on every page', () => {
    const seed = chickenSeed(0, 900);
    const plan = kittyPlan(home, seed);
    assert.ok(plan.speed >= KITTY_MOTION.walkSpeedMin && plan.speed <= KITTY_MOTION.walkSpeedMax);
    const pauses = plan.segs.filter((g) => g.pose !== 'walk');
    assert.equal(pauses.length, KITTY_PLAN_PAUSES);
    const clips = new Set(KITTY_PAUSE_CHOICES.map((c) => c[1]));
    for (const g of pauses) assert.ok(clips.has(g.pose), g.pose);
    // npc_kitty_chicken.js: the first stop 3 to 11 s in, then every 6 to 14 s of walking.
    const walks = plan.segs.filter((g) => g.pose === 'walk');
    assert.ok(walks[0].ms >= 3000 && walks[0].ms <= 11000);
    for (const g of walks.slice(1, -1)) assert.ok(g.ms >= 6000 && g.ms <= 14000, g.ms);
    // It sets off from its spot, stays on its floor, and its round joins up.
    assert.equal(kittyWalkAt(home, 0, seed).x, 900);
    for (let t = 0; t < plan.ms; t += 250) {
      const p = kittyWalkAt(home, t, seed);
      assert.ok(p.x >= 100 - 1e-6 && p.x <= 1600 + 1e-6, `${t}: ${p.x}`);
    }
    assert.ok(Math.abs(kittyWalkAt(home, plan.ms - 1, seed).x - kittyWalkAt(home, plan.ms, seed).x) < 0.2);
    assert.deepEqual(kittyWalkAt(home, 123456, seed), kittyWalkAt({ ...home }, 123456, seed));
  });
});

describe('a shared Crab', () => {
  const home = { l: 100, r: 1600, x0: 900 };
  it('roams 250 or 400 px, stands 10 s after each, turns where its floor ends, and comes back round', () => {
    const seed = chickenSeed(0, 900);
    const plan = crabPlan(home, seed);
    const walks = plan.segs.filter((g) => g.pose === 'walk');
    assert.ok(walks.length >= CRAB_PLAN_MOVES - 3);
    for (const g of walks.slice(0, -1)) {
      const d = Math.abs(g.to - g.x);
      assert.ok(d === 250 || d === 400 || g.to === 100 || g.to === 1600, `a roam of ${d} px`);
    }
    for (const g of plan.segs.filter((s) => s.pose !== 'walk')) assert.ok(['idle1', 'idle2'].includes(g.pose));
    assert.ok(plan.segs.some((g) => g.pose !== 'walk' && g.ms === CRAB_WALK.arriveWaitMs));
    assert.equal(plan.segs[0].ms, 1500, 'parent_onCreate: it stands 1.5 s first');
    for (let t = 0; t < plan.ms; t += 500) {
      const p = crabWalkAt(home, t, seed);
      assert.ok(p.x >= 100 && p.x <= 1600, `${t}: ${p.x}`);
    }
    assert.ok(Math.abs(crabWalkAt(home, plan.ms - 1, seed).x - 900) < 1, 'back at its spot');
    // A short floor: it turns at the ends instead of walking off.
    const short = crabPlan({ l: 850, r: 950, x0: 900 }, seed);
    for (const g of short.segs) assert.ok(g.to >= 850 && g.to <= 950);
  });

  it('is a street animal by its spawn index; a demo crab or another feature\'s is not', () => {
    assert.deepEqual(creatureOf({ classId: 'npc_crab', featureId: 'crabs', crabKey: 'crab:0' }), { id: 'crab:0', kind: 'crab', index: 0 });
    assert.deepEqual(creatureOf({ classId: 'npc_kitty_chicken', featureId: 'heli-kitties', kittyKey: 'kitty:2' }), { id: 'kitty:2', kind: 'kitty', index: 2 });
    assert.equal(creatureOf({ classId: 'npc_kitty_chicken', featureId: 'heli-kitties', kittyKey: 'kitty:99x' }), null);
    assert.equal(creatureOf({ classId: 'npc_crab', featureId: 'color-unblocking', crabKey: 'crab:0' }), null);
  });
});

describe('Heli Kitties and Crabs on the server', () => {
  it('data/objects.json lays them out with the holds the game uses', { skip: skipWithoutServer }, () => {
    const data = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8'));
    assert.equal(data.rules.holds.kittyPet, KITTY_PET.totalMs);
    assert.equal(data.rules.holds.crabVerb, CRAB_WALK.menuWaitMs);
    const total = (key) => Object.values(data.streets).reduce((n, s) => n + (s[key]?.length || 0), 0);
    assert.equal(total('crabs'), 8, 'one crab on each of the eight archived crab streets');
    assert.ok(total('kitties') >= 80 && total('kitties') <= 99, `${total('kitties')} Heli Kitties`);
    assert.deepEqual(data.streets.GLI2V0UN7RD1T2J.crabs.map((r) => r[0]), [0], 'Hechey Track\'s crab');
  });
});

// A street with one Heli Kitty and one Crab, on a server that shares them.
function rig() {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted: 'GSTREET',
    me: { id: 7 },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {};
    },
    send(kind, payload = {}) {
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const seen = [];
  const kitty = { classId: 'npc_kitty_chicken', featureId: 'heli-kitties', kittyKey: 'kitty:0', state: {}, sprite: { x: 500, y: 800, scale: { x: 1, y: 1 }, destroyed: false } };
  const crab = { classId: 'npc_crab', featureId: 'crabs', crabKey: 'crab:0', state: {}, sprite: { x: 2000, y: 800, scale: { x: 1, y: 1 }, destroyed: false } };
  let at = null;
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    worldW: 3000,
    platforms,
    interactables: [kitty, crab],
    data: {},
    interactionTarget: () => at,
    placement: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast() {},
    pushActivity() {},
    query(hook, t, verb) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'walkerVerbSeen') { seen.push([t.classId, verb]); return true; }
      return null;
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  return { engine, client, sent, kitty, crab, seen, setAt: (t) => { at = t; } };
}

describe('Heli Kitties and Crabs: the feature', () => {
  it('walks each from the server\'s spot on the shared clock, held while someone is at it', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
    const r = rig();
    const now = Date.now();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, creatures: true, animals: ['crab:0', 'kitty:0'], spots: { 'kitty:0': [900, 800], 'crab:0': [2200, 800] }, now, objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(typeof r.kitty.sprite._walkerPath, 'function');
    assert.equal(typeof r.crab.sprite._walkerPath, 'function');
    const tp = now - GAME_EPOCH_MS;
    const kHome = { ...walkerSpan(platforms, 900, 800, { worldW: 3000, ...WALKER_REACH.kitty }), x0: 900, dir: -1 };
    assert.equal(r.kitty.sprite._walkerPath().x, kittyWalkAt(kHome, tp, chickenSeed(0, 900)).x);
    const cHome = { ...walkerSpan(platforms, 2200, 800, { worldW: 3000, ...WALKER_REACH.crab }), x0: 2200 };
    assert.equal(r.crab.sprite._walkerPath().x, crabWalkAt(cHome, tp, chickenSeed(0, 2200)).x);
    assert.equal(r.kitty.sprite._walkerPath().held, false);
    // A player at the kitty: waits for everyone, from where this screen stopped it.
    r.setAt(r.kitty);
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(r.sent.filter((m) => m.verb === 'wait').map((m) => m.id), ['kitty:0']);
    // A crab listening to a tune here holds too (crabs-feature sets sharedHold).
    r.setAt(null);
    r.crab.sharedHold = true;
    t.mock.timers.tick(800);
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(r.sent.filter((m) => m.verb === 'wait').map((m) => m.id), ['kitty:0', 'crab:0']);
    // A pet here tells the server; someone else's is seen here.
    assert.equal(streetObjectsFeature.sharedWalkerVerb(r.kitty, 'pet', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: r.sent.at(-1).req, id: 'kitty:0', verb: 'pet' });
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'crab:0', ev: 'hug', by: 9 });
    assert.deepEqual(r.seen, [['npc_crab', 'hug']]);
    // Its held state comes with the server's hold.
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', now: Date.now(), objs: [{ id: 'kitty:0', lag: 2810, hold: 2810 }] });
    streetObjectsFeature.onTick(300, 0, r.engine);
    assert.equal(r.kitty.sprite._walkerPath().held, true);
    assert.equal(pathTime(r.kitty.sharedPath, Date.now(), 0) <= tp + 800, true);
  });

  it('an older server, or solo: they keep their own walk', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, creatures: true, animals: ['batterfly:0'], now: Date.now(), objs: [] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.equal(r.kitty.sprite._walkerPath, undefined);
    assert.equal(streetObjectsFeature.sharedWalkerVerb(r.kitty, 'pet', r.engine), null);
    assert.equal(heliKittiesFeature.walkerVerbSeen({ classId: 'x' }, 'pet'), null);
  });
});
