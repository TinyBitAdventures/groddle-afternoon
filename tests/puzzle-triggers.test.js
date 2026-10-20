import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_PHYSICS,
  completionReward,
  normalizePuzzleData,
  normalizePuzzleSave,
  normalizeTrigger,
  quoinsInReach,
  respawnPoint,
  rewardBits,
  stepTriggers,
  triggerHit,
} from '../public/js/puzzle-triggers.js';
import {
  createEventRuntime,
  dueEventTimers,
  eventPlatformIds,
  runLocationEvent,
} from '../public/js/location-events.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(root, 'public/assets/content/puzzle-triggers.json'), 'utf8'));
const data = normalizePuzzleData(raw);
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));

describe('puzzle trigger rules', () => {
  test('feet boxes use the bottom-centre convention; body boxes count the avatar height', () => {
    const t = normalizeTrigger({ id: 'a', x: 100, y: 200, w: 40, h: 30 });
    assert.equal(triggerHit(t, 100, 200), true);
    assert.equal(triggerHit(t, 121, 200), false);
    assert.equal(triggerHit(t, 100, 160), false);
    const ceiling = normalizeTrigger({ id: 'c', x: 100, y: 120, w: 40, h: 40, body: true });
    assert.equal(triggerHit(ceiling, 100, 150, 0), false);
    assert.equal(triggerHit(ceiling, 100, 150, 40), true, 'head at 110 is inside 80-124');
  });

  test('enter/exit edges fire once per crossing and once-only triggers stay spent', () => {
    const triggers = [
      normalizeTrigger({ id: 'a', x: 0, y: 0, w: 20, h: 20, onEnter: 'one,two', onExit: ['bye'] }),
      normalizeTrigger({ id: 'b', x: 100, y: 0, w: 20, h: 20, onEnter: ['go'], once: true }),
    ];
    const inside = new Set();
    const spent = new Set();
    assert.deepEqual(stepTriggers(triggers, inside, spent, 0, 0).map((e) => e.events), [['one', 'two']]);
    assert.deepEqual(stepTriggers(triggers, inside, spent, 0, 0), []);
    assert.deepEqual(stepTriggers(triggers, inside, spent, 50, 0).map((e) => e.events), [['bye']]);
    assert.equal(stepTriggers(triggers, inside, spent, 100, 0).length, 1);
    stepTriggers(triggers, inside, spent, 50, 0);
    assert.equal(stepTriggers(triggers, inside, spent, 100, 0).length, 0, 'once trigger stays spent');
  });

  test('respawn returns to the furthest checkpoint passed, else the start', () => {
    const def = { start: { x: 10, y: 5 }, checkpoints: [{ x: 500, y: 1 }, { x: 1000, y: 2 }] };
    assert.deepEqual(respawnPoint(def, 400), { x: 10, y: 5 });
    assert.deepEqual(respawnPoint(def, 700), { x: 500, y: 1 });
    assert.deepEqual(respawnPoint(def, 5000), { x: 1000, y: 2 });
  });

  test('quoins in reach skip taken ones; rewards only on the first finish', () => {
    const q = [{ id: 'q1', x: 0, y: 0 }, { id: 'q2', x: 0, y: 5 }];
    assert.deepEqual(quoinsInReach(q, new Set(['q2']), 10, 20).map((x) => x.id), ['q1']);
    const def = { reward: { xp: 250, energy: 100, favor: [{ giant: 'ti', points: 50 }] } };
    assert.ok(completionReward(def, { completed: {} }, 'G1'));
    assert.equal(completionReward(def, { completed: { G1: 1 } }, 'G1'), null);
    assert.deepEqual(rewardBits(def.reward), ['+250 iMG', '+100 energy', '+50 Ti favor']);
    assert.deepEqual(normalizePuzzleSave({ completed: { GABC: 2, bad: 3 }, returnTo: { tsid: 'GX', x: 1 } }), {
      completed: { GABC: 2 },
      best: {},
      returnTo: { tsid: 'GX', x: 1, y: 0 },
    });
  });

  test('source-faithful movement puts the remake arc back on the client curve', () => {
    // Normal jump distance/apex with the remake integrator and the factors.
    let x = 0;
    let y = 0;
    let vy = -9.6;
    let apex = 0;
    for (let t = 0; t < 200; t += 1) {
      vy += 0.42 * SOURCE_PHYSICS.gravity;
      x += 4.4 * SOURCE_PHYSICS.speed;
      y += vy;
      apex = Math.min(apex, y);
      if (y >= 0 && t > 2) break;
    }
    assert.ok(Math.abs(x - 318) < 15, `distance ${x} vs client 318`);
    assert.ok(Math.abs(-apex - 134) < 6, `apex ${-apex} vs client 134`);
  });
});

describe('puzzle trigger data', () => {
  for (const [tsid, def] of Object.entries(data)) {
    test(`${def.name}: every trigger fires recovered (or repaired) events and sits on the street`, () => {
      const s = street(tsid);
      const events = { ...(s.events || {}), ...(def.events || {}) };
      const W = s.bounds.r - s.bounds.l;
      const H = s.bounds.b - s.bounds.t;
      assert.ok(def.triggers.length > 0 || def.quoins.length > 0);
      for (const t of def.triggers) {
        for (const name of [...t.onEnter, ...t.onExit]) assert.ok(events[name], `${t.id}: missing event ${name}`);
        assert.ok(t.x >= 0 && t.x <= W && t.y >= 0 && t.y <= H + 80, `${t.id} out of bounds`);
        assert.ok(String(t.why || '').length > 20, `${t.id} needs a derivation note`);
      }
      for (const q of def.quoins) assert.ok(q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H, `quoin out of bounds ${q.x},${q.y}`);
      if (def.start) assert.ok(def.start.x >= 0 && def.start.x <= W);
      const ids = new Set(def.triggers.map((t) => t.id));
      assert.equal(ids.size, def.triggers.length, 'trigger ids are unique');
    });
  }

  test('Griinolyza: the bridge-1 trigger shows the boards and runs one gap B1→B5→B1 every 850 ms', () => {
    const s = street('GHVOD0F3T403694');
    const events = s.events;
    const rt = createEventRuntime();
    const boards = ['plat_1336587953557', 'plat_1336587953558', 'plat_1336587953559', 'plat_1336587953560', 'plat_1336587953561'];
    const solid = new Map(boards.map((b) => [b, false]));
    const apply = (fx) => {
      for (const e of fx) if (e.type === 'plat' && solid.has(e.id)) solid.set(e.id, Number(e.pc_perm) !== 0);
    };
    apply(runLocationEvent(rt, events, 'first_player_enter', { now: 0 }));
    assert.equal([...solid.values()].filter(Boolean).length, 0, 'bridge hidden on arrival');
    const trigger = data.GHVOD0F3T403694.triggers.find((t) => t.id === 'bridge1');
    for (const name of trigger.onEnter) apply(runLocationEvent(rt, events, name, { now: 0, target: true }));
    const gaps = [];
    let now = 0;
    for (let step = 0; step < 9; step += 1) {
      gaps.push(boards.findIndex((b) => !solid.get(b)));
      assert.equal([...solid.values()].filter((v) => !v).length, 1, `exactly one gap at step ${step}`);
      now += 850;
      for (const timer of dueEventTimers(rt, now)) apply(runLocationEvent(rt, events, timer.event, { now, target: timer.target }));
    }
    assert.deepEqual(gaps, [0, 1, 2, 3, 4, 3, 2, 1, 0]);
  });

  test('Amberlyza: a sink trigger lowers its island 120 px in six steps and pops it back', () => {
    const s = street('GHVDKQ2O6S23LVJ');
    const rt = createEventRuntime();
    const ys = new Map(s.platforms.map((p) => [p.id, p.y1 - s.bounds.t]));
    const on = new Set(s.platforms.filter((p) => Number(p.pc_perm) !== 0 || !eventPlatformIds(s.events).has(p.id)).map((p) => p.id));
    const apply = (fx) => {
      for (const e of fx) if (e.type === 'plat') (Number(e.pc_perm) === 0 ? on.delete(e.id) : on.add(e.id));
    };
    apply(runLocationEvent(rt, s.events, 'first_player_enter', { now: 0 }));
    const sink = ['plat_1340391589182', 'plat_1340391589184', 'plat_1340391589185', 'plat_1340391589186', 'plat_1340391589187', 'plat_1340391589188', 'plat_1340407775215'];
    const top = () => sink.filter((id) => on.has(id)).map((id) => Math.round(ys.get(id)));
    assert.deepEqual(top(), [330]);
    apply(runLocationEvent(rt, s.events, 'sink1_a', { now: 0, target: true }));
    let now = 0;
    const seen = [top()[0]];
    while (now < 4000) {
      now += 100;
      for (const timer of dueEventTimers(rt, now)) apply(runLocationEvent(rt, s.events, timer.event, { now }));
      const y = top()[0];
      if (y !== seen[seen.length - 1]) seen.push(y);
    }
    assert.deepEqual(seen, [350, 370, 390, 410, 430, 450, 330], 'six 20 px steps, then back to the top');
  });
});

describe('location-events trigger API', () => {
  const fakeEngine = (street) => {
    const data = {};
    return {
      street,
      streetTsid: street.tsid,
      platforms: street.platforms.map((p) => ({ ...p })),
      decoViews: new Map(),
      started: true,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      setData: (k, v) => { data[k] = v; },
      param: () => null,
      data,
    };
  };
  const make = () => ({
    tsid: 'GTESTPUZZLE0001',
    platforms: [
      { id: 'plat_a', x1: 0, y1: 0, x2: 10, y2: 0, pc_perm: -1 },
      { id: 'plat_b', x1: 20, y1: 0, x2: 30, y2: 0, pc_perm: 0 },
    ],
    events: {
      player_enter: [],
      open: [{ type: 'plat', plat: 'plat_b', pc_perm: -1 }],
      close: [{ type: 'plat', plat: 'plat_b', pc_perm: 0 }, { type: 'plat', plat: 'plat_a', pc_perm: 0 }],
    },
  });

  test('without a strict hook, a platform only lost boxes switch back stays walkable', async () => {
    const { locationEventsFeature, locationEventsApi } = await import('../public/js/features/location-events-feature.js?v=api-test-1');
    const street = make();
    const engine = fakeEngine(street);
    locationEventsFeature.onStreetEnter(street, engine);
    assert.equal(locationEventsApi.strict(), false);
    assert.ok(locationEventsApi.fire(engine, 'close'));
    assert.ok(engine.platforms.some((p) => p.id === 'plat_a'), 'fallback kept plat_a solid');
  });

  test('a strict hook runs the scripts as written and restart re-applies them', async () => {
    const { locationEventsFeature, locationEventsApi } = await import('../public/js/features/location-events-feature.js?v=api-test-2');
    let strict = false;
    locationEventsApi.register({ strict: (s) => strict && s.tsid === 'GTESTPUZZLE0001' });
    const street = make();
    const engine = fakeEngine(street);
    locationEventsFeature.onStreetEnter(street, engine);
    assert.ok(engine.platforms.some((p) => p.id === 'plat_b'), 'non-strict: source pc_perm 0 plat stays solid');
    strict = true;
    assert.ok(locationEventsApi.restart(engine));
    assert.equal(locationEventsApi.strict(), true);
    assert.ok(!engine.platforms.some((p) => p.id === 'plat_b'), 'strict: plat_b starts in its source state');
    locationEventsApi.fire(engine, 'open');
    assert.ok(engine.platforms.some((p) => p.id === 'plat_b'));
    locationEventsApi.fire(engine, 'close');
    assert.ok(!engine.platforms.some((p) => p.id === 'plat_a'), 'strict: plat_a really switches off');
    assert.equal(locationEventsApi.has('open'), true);
    assert.equal(locationEventsApi.active(), 'GTESTPUZZLE0001');
  });
});
