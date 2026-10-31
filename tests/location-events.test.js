import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NORMAL_PHYSICS,
  applyPhysicsAdjustments,
  arrivalEvents,
  createEventRuntime,
  dueEventTimers,
  eventPhysicsAdjustments,
  inEventBox,
  inferEventBoxes,
  orderedActionKeys,
  parseEventCode,
  parseLocationEvents,
  parseStreetPhysics,
  physicsMultipliers,
  reachableEvents,
  runLocationEvent,
  streetOwner,
} from '../public/js/location-events.js?v=61e0c5d3';
import { createFeatureHost } from '../public/js/feature-host.js?v=e4f648b1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const allStreets = () =>
  readdirSync(streetsDir)
    .filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(streetsDir, f), 'utf8')));

describe('street physics', () => {
  test('parses a G*.xml physics block and fills missing fields from normal', () => {
    const xml = `<object id="dynamic"><object id="physics">
      <int id="gravity">362</int><int id="vy_jump">-713</int><int id="vy_max">447</int>
      <int id="vx_max">223</int><int id="jetpack">1</int><dbl id="friction_air">0.745</dbl>
      <dbl id="pc_and_item_scale">0.5</dbl></object><null id="gradient"/></object>`;
    const p = parseStreetPhysics(xml);
    assert.equal(p.gravity, 362);
    assert.equal(p.jetpack, 1);
    assert.equal(p.pc_scale, 0.5);
    assert.equal(p.friction_floor, NORMAL_PHYSICS.friction_floor);
    assert.equal(parseStreetPhysics('<null id="physics"/>'), null);
  });

  test('underwater Jal street: slower, floatier, capped, swimming', () => {
    const m = physicsMultipliers(street('GUV10AGQOOA3MOE').physics.setting);
    assert.ok(Math.abs(m.speed - 223 / 335) < 1e-9);
    assert.ok(Math.abs(m.gravity - 362 / 1190) < 1e-9);
    // vy_max 447 also bounds the -713 launch (boundAvatarVelocities)
    assert.ok(Math.abs(m.jump - 447 / 570) < 1e-9);
    assert.ok(Math.abs(m.vyMax - 447 / 670) < 1e-9);
    assert.equal(m.jetpack, true);
    assert.equal(m.airDrag, 0.745);
  });

  test('normal physics is neutral', () => {
    const m = physicsMultipliers(NORMAL_PHYSICS);
    for (const key of ['speed', 'jump', 'gravity', 'vyMax', 'accel', 'airAccel', 'friction', 'tripleJump', 'scale']) {
      assert.ok(Math.abs(m[key] - 1) < 1e-9, key);
    }
    assert.equal(m.jetpack, false);
    assert.equal(m.airDrag, 0);
  });

  test('event adjustments multiply into the setting, booleans only switch on', () => {
    const s = applyPhysicsAdjustments(NORMAL_PHYSICS, { gravity: -7.5, jetpack: 1, vy_max: 1.5 });
    assert.equal(s.gravity, 1190 * -7.5);
    assert.equal(s.vy_max, 670 * 1.5);
    assert.equal(s.jetpack, 1);
    assert.equal(applyPhysicsAdjustments({ ...NORMAL_PHYSICS, jetpack: 1 }, { jetpack: 0 }).jetpack, 1);
  });

  test('103 archived streets carry physics; 91 differ from normal', () => {
    const rows = allStreets().filter((s) => s.physics);
    assert.equal(rows.length, 103);
    assert.equal(rows.filter((s) => Object.keys(s.physics.delta).length).length, 91);
    assert.equal(rows.filter((s) => s.physics.setting.jetpack === 1).length, 49);
  });

  test('host aggregates street extras only when a feature sets them', () => {
    const host = createFeatureHost([
      { id: 'a', physics: () => ({ speed: 2, vyMax: 0.8, jetpack: true, airDrag: 0.5 }) },
      { id: 'b', physics: () => ({ speed: 0.5, vyMax: 0.6, tripleJump: 0 }) },
    ]);
    assert.deepEqual(host.physics({}), { speed: 1, jump: 1, gravity: 1, vyMax: 0.6, jetpack: true, airDrag: 0.5, tripleJump: 0 });
    assert.deepEqual(createFeatureHost([{ id: 'c', physics: () => ({ gravity: 0.5 }) }]).physics({}), { speed: 1, jump: 1, gravity: 0.5 });
  });
});

describe('location events', () => {
  test('actions run in document order, as GSJS for-in walked them', () => {
    // Document order (GSJS for-in), not key names: p1_red_1_on gates before it lights.
    assert.deepEqual(orderedActionKeys(['a3', 'a2', 'a1', 'a4']), ['a3', 'a2', 'a1', 'a4']);
    const xml = `<object id="events"><object id="hit"><object id="actions">
      <object id="2"><str id="type">physics</str><str id="param">gravity</str><str id="value">-7.5</str><int id="duration">400</int></object>
      <object id="11"><str id="type">deco_hide</str><str id="deco_id">d1</str><int id="fade">500</int></object>
      <object id="1"><str id="type">flag_set</str><str id="flag">b</str></object>
    </object></object></object>`;
    const events = parseLocationEvents(xml);
    assert.deepEqual(events.hit.map((a) => a.type), ['physics', 'deco_hide', 'flag_set']);
    assert.deepEqual(events.hit[0], { type: 'physics', param: 'gravity', value: -7.5, duration: 400, all: false });
  });

  test('code actions: teleports and activity run, god-only and puzzles do not', () => {
    assert.deepEqual(parseEventCode("pc.teleportToLocation(\"LDOU1UON87E3K2T\", -1335, -655);"), {
      type: 'teleport', tsid: 'LDOU1UON87E3K2T', x: -1335, y: -655,
    });
    assert.deepEqual(parseEventCode(" delete pc.startedAT;\n   pc.teleportToLocation('LA9BT2I0ILD340S', 2273, -1000); "), {
      type: 'teleport', tsid: 'LA9BT2I0ILD340S', x: 2273, y: -1000,
    });
    assert.equal(parseEventCode("if(pc.is_god)\n{\n pc.teleportToLocation('LA931BPTNLD3E35', -1163, -2432);\n}").reason, 'god-only');
    assert.equal(parseEventCode(' pc.addCTPCPhysics({\n gravity:-1\n });').reason, 'inverted-gravity');
    assert.equal(parseEventCode('loc.st1=true;').reason, 'stateful-script');
    assert.deepEqual(parseEventCode('pc.sendActivity("*yawn*", null, true, false);'), { type: 'activity', text: '*yawn*' });
  });

  test('runtime: flags exit early, delayed events wait, physics expires', () => {
    const events = {
      player_enter: [
        { type: 'flag_has_exit', flag: 'seen' },
        { type: 'flag_set', flag: 'seen' },
        { type: 'deco_show', deco: 'sign', fade: 0 },
        { type: 'event', event: 'later', delay: 1000 },
      ],
      later: [{ type: 'physics', param: 'gravity', value: 0.5, duration: 300, all: true }],
    };
    const rt = createEventRuntime();
    const first = runLocationEvent(rt, events, 'player_enter', { now: 0, target: true });
    assert.deepEqual(first, [{ type: 'deco', id: 'sign', visible: true, fade: 0 }]);
    assert.deepEqual(runLocationEvent(rt, events, 'player_enter', { now: 10, target: true }), []);
    assert.equal(dueEventTimers(rt, 500).length, 0);
    const due = dueEventTimers(rt, 1000);
    assert.equal(due.length, 1);
    runLocationEvent(rt, events, due[0].event, { now: 1000, target: due[0].target });
    assert.deepEqual(eventPhysicsAdjustments(rt, 1100), { gravity: 0.5 });
    assert.deepEqual(eventPhysicsAdjustments(rt, 1301), {});
  });

  test('untargeted physics (no target_pc, not all_players) skips the player', () => {
    const rt = createEventRuntime();
    runLocationEvent(rt, { e: [{ type: 'physics', param: 'gravity', value: 2, duration: 0, all: false }] }, 'e', { now: 0 });
    assert.deepEqual(eventPhysicsAdjustments(rt, 1), {});
  });

  test('arrival order: instance_created, first_player_enter, player_enter', () => {
    const events = { player_enter: [], instance_created: [], first_player_enter: [], other: [] };
    assert.deepEqual(arrivalEvents(events), [
      { name: 'instance_created', target: false },
      { name: 'first_player_enter', target: false },
      { name: 'player_enter', target: true },
    ]);
    assert.deepEqual([...reachableEvents({ a: [{ type: 'event', event: 'b' }], b: [], c: [] }, ['a'])], ['a', 'b']);
  });

  test('fungal wall shrooms carry the bounce boxes on all 40 streets', () => {
    const rows = allStreets().filter((s) => s.events?.bounce && s.tsid.startsWith('GIF'));
    assert.equal(rows.length, 40);
    let boxes = 0;
    for (const s of rows) {
      assert.ok(s.eventBoxes?.length, s.tsid);
      const shrooms = s.layers.flatMap((l) => l.decos).filter((d) => d.sprite === 'tree_int_wall_sroom_1').length;
      assert.equal(s.eventBoxes.length, shrooms, s.tsid);
      boxes += s.eventBoxes.length;
    }
    assert.equal(boxes, 345);
    const s = street('GIF2K0TOOK434L9');
    assert.equal(s.eventBoxes[0].onEnter[0], 'bounce');
    assert.ok(inEventBox(s.eventBoxes[0], s.eventBoxes[0].x, s.eventBoxes[0].y - 60));
    assert.equal(inferEventBoxes(s, s.events, 3).length, 0, 'a count mismatch infers nothing');
  });

  test('every recorded teleport resolves to an imported street', () => {
    let teleports = 0;
    for (const s of allStreets()) {
      for (const actions of Object.values(s.events || {})) {
        for (const act of actions) {
          const steps = act.code?.type === 'steps' ? act.code.steps : act.code ? [act.code] : [];
          for (const step of steps.filter((x) => x.type === 'teleport')) {
            teleports += 1;
            assert.ok(step.street, `${s.tsid} -> ${step.tsid}`);
          }
        }
      }
    }
    assert.equal(teleports, 15);
  });

  test('streets other systems own are skipped', () => {
    assert.equal(streetOwner('LUVU11R1HP9341R'), 'party');
    assert.equal(streetOwner('GNVV9IM8PL4301V'), 'summers-day');
    assert.equal(streetOwner('GIF2K0TOOK434L9'), null);
  });
});

describe('walkable fallback', () => {
  test('only platforms the arrival chain re-enables may be switched off', async () => {
    const { recoverableToggles } = await import('../public/js/location-events.js?v=61e0c5d3');
    const events = {
      player_enter: [{ type: 'plat', plat: 'p1', pc_perm: 0 }, { type: 'event', event: 'cycle', delay: 2000 }],
      cycle: [{ type: 'plat', plat: 'p1', pc_perm: -1 }, { type: 'wall', wall: 'w1', pc_perm: 0 }],
      box_only: [{ type: 'plat', plat: 'p2', pc_perm: -1 }],
    };
    const guard = recoverableToggles(events);
    assert.deepEqual([...guard.platOn], ['p1']);
    assert.deepEqual([...guard.wallOpen], ['w1']);
    const amber = street('GHVDKQ2O6S23LVJ');
    // Amberlyza's arrival reset turns 100 platforms off and only 17 back on.
    assert.equal(recoverableToggles(amber.events).platOn.size, 17);
  });
});
