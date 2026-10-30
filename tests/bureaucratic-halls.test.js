/**
 * G139 Bureaucratic Halls (js/features/bureaucratic-halls-feature.js): the
 * doors on Gregarious Grange, Chego Chase (Andra) and Baeli Bray (Muufo)
 * open the remake's one Bureaucratic Hall, with its bureaucrats selling the
 * documents and glass doors back to the street.
 * Run: node --test tests/bureaucratic-halls.test.js
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HALL_DOORS,
  HALL_ENTER_VERB,
  HALL_LEAVE_VERB,
  bureaucraticHallsFeature,
  hallSceneTsid,
} from '../public/js/features/bureaucratic-halls-feature.js?v=a24ad4d1';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=890ec8c4';
import { LEGALIZE_HALL_TSID } from '../public/js/legalize-it.js?v=d569fd0e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));

function fakeEngine(over = {}) {
  const calls = { scenes: [], registered: [], entered: [], toasts: [] };
  const sprite = () => ({ anchor: { set() {} }, position: { set() {} }, scale: { set() {} } });
  class Sprite {
    constructor() {
      Object.assign(this, sprite());
    }
  }
  const engine = {
    streetTsid: 'GA5I10NJDL52TKD',
    player: { x: 900, y: 830 },
    interactables: [],
    entityLayer: { addChild() {} },
    transientInstance: () => false,
    travelGate: () => ({ ok: true }),
    bureaucraticHall: () => ({ layer: { platformsScreen: [{ id: 'floor' }] }, clerk: () => new Sprite(), sprite: () => new Sprite() }),
    enterScene: (scene) => calls.scenes.push(scene),
    register: (t) => {
      calls.registered.push(t);
      return t;
    },
    enter: async (tsid, opts) => calls.entered.push({ tsid, ...opts }),
    playSound() {},
    toast: (t) => calls.toasts.push(t),
    setData() {},
    param: () => null,
    ...over,
  };
  return { engine, calls };
}

describe('hall doors', () => {
  beforeEach(() => bureaucraticHallsFeature._reset());

  it('match the street doors and their hub 69 connects', () => {
    for (const [doorId, def] of Object.entries(HALL_DOORS)) {
      const s = street(def.street);
      assert.equal(s.label, def.streetLabel);
      const door = s.doors.find((d) => d.id === doorId);
      assert.ok(door, doorId);
      assert.equal(door.sprite, 'door_asset_bureaucratic_hall_ext');
      assert.equal(door.connect.tsid, def.tsid);
      assert.equal(door.connect.label, def.label);
      assert.equal(door.connect.hub_id, '69');
      assert.equal(door.connect.street, null, 'the hall itself is lost');
    }
  });

  it('the hall scenes never reuse Legalize It\'s scene id', () => {
    for (const def of Object.values(HALL_DOORS)) assert.notEqual(hallSceneTsid(def.tsid), LEGALIZE_HALL_TSID);
  });

  it('Enter opens the hall: scene, glass doors, four bureaucrats running the hall visit', () => {
    const { engine, calls } = fakeEngine();
    const door = { id: 'door_1321408650118', x: 939, y: 830 };
    const target = { classId: 'street_door', door };
    const [verb] = bureaucraticHallsFeature.verbOverride(target);
    assert.equal(verb.id, HALL_ENTER_VERB);
    assert.equal(bureaucraticHallsFeature.verbOverride({ classId: 'street_door', door: { id: 'other' } }), null);
    assert.equal(bureaucraticHallsFeature.runVerbOverride(target, HALL_ENTER_VERB, engine), true);
    const scene = calls.scenes[0];
    assert.equal(scene.tsid, 'HALL_LDOCV86VHCD245F');
    assert.equal(scene.label, 'Andra Bureaucratic Hall');
    assert.deepEqual(scene.returnTo, { tsid: 'GA5I10NJDL52TKD', x: 939, y: 830 });
    const exit = calls.registered.find((t) => t.classId === 'bureaucratic_hall_exit');
    assert.ok(exit);
    const clerks = calls.registered.filter((t) => t.classId === 'npc_bureaucrat');
    assert.equal(clerks.length, 4);
    assert.ok(clerks.every((c) => c.featureId === 'bureaucratic-halls'));
    // Arrival at the door connect's (-857, -153) on the backdrop.
    assert.deepEqual(scene.spawn, { x: 249, y: 547 });
    assert.equal(scene.groundY, 572);
    // Talk to only once a bureaucrat helps you (npc_bureaucrat.js verbs.talk_to conditions).
    const [talk] = bureaucraticHallsFeature.verbsFor(clerks[0], engine);
    assert.equal(talk.id, 'talk_to');
    assert.equal(talk.enabled, false);
    assert.equal(talk.reason, 'Please approach the counter for assistance.');
    assert.ok(bureaucraticHallsFeature._state().flow, 'the visit runs');
    assert.equal(bureaucraticHallsFeature._state().hall.tsid, 'LDOCV86VHCD245F');
  });

  it('the supply feature\'s street clerk (QA) still sells the documents', () => {
    const verbs = supplyFeature.verbsFor({ classId: 'npc_bureaucrat' }, { learnedSkills: [], unlockedAchievements: [], pc: { currants: 100 } });
    assert.deepEqual(verbs.map((v) => v.id), ['buy:card_carrying_qualification', 'buy:your_papers', 'buy:general_building_permit']);
    assert.equal(verbs[0].enabled, true);
  });

  it('the glass doors lead back out to the street door', async () => {
    const { engine, calls } = fakeEngine({ streetTsid: 'GA91JUQT2G82GUL' });
    bureaucraticHallsFeature.runVerbOverride({ classId: 'street_door', door: { id: 'door_1312484975748', x: 1115, y: 821 } }, HALL_ENTER_VERB, engine);
    const exit = calls.registered.find((t) => t.classId === 'bureaucratic_hall_exit');
    assert.equal(bureaucraticHallsFeature.verbsFor(exit)[0].id, HALL_LEAVE_VERB);
    assert.equal(bureaucraticHallsFeature.runVerb(exit, HALL_LEAVE_VERB, engine), true);
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.entered[0].tsid, 'GA91JUQT2G82GUL');
    assert.equal(calls.entered[0].spawnX, 1115);
    assert.equal(bureaucraticHallsFeature._state().hall, null);
    assert.equal(bureaucraticHallsFeature._state().flow, null, 'leaving ends the visit');
  });

  it('stays shut inside an instance and behind a travel gate', () => {
    const inst = fakeEngine({ transientInstance: () => true });
    bureaucraticHallsFeature.runVerbOverride({ classId: 'street_door', door: { id: 'door_1300484753304' } }, HALL_ENTER_VERB, inst.engine);
    assert.equal(inst.calls.scenes.length, 0);
    const gated = fakeEngine({ travelGate: () => ({ ok: false, msg: 'Too pooped.' }) });
    bureaucraticHallsFeature.runVerbOverride({ classId: 'street_door', door: { id: 'door_1300484753304' } }, HALL_ENTER_VERB, gated.engine);
    assert.equal(gated.calls.scenes.length, 0);
    assert.deepEqual(gated.calls.toasts, ['Too pooped.']);
  });
});
