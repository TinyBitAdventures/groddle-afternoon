/**
 * #214 (live, Lowland Slough): a Peat Bog harvested once, then Enter pressed again as the first
 * harvest ended, played the whole harvest again and only then said "You can't harvest this peat
 * more than once per game day." Online, the day's use lands with the server's answer, so a verb
 * chosen while that answer was on its way (or from a menu opened before it landed) swung for
 * nothing. Glitch ran a verb's conditions before its handler (peat_1.js harvest conditions 139-168),
 * so the refusal came first. street-objects-feature verbRefusedNow (asked by game.js
 * beginVerbAction before the swing): one verb per object while the server is asked, and the
 * player's own refusal (a used daily limit) before the swing, with its line.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COPY } from '../public/js/street-objects.js?v=066b9bad';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=bd383dbc';
import { createResourceNode, harvestResourceNode, resourceNodeVerbs } from '../public/js/resource-nodes.js?v=3a26727e';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ONCE = "You can't harvest this peat more than once per game day.";

function rig() {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted: 'GSTREET',
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
  const peat = createResourceNode('peat_1');
  const peatT = { classId: 'peat_1', featureId: 'resource-nodes', resourceKey: 'peat_1:0' };
  const ctx = { now: Date.now(), dayKey: 'D1', rng: () => 0.5 };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: { shovel: 1 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: [],
    interactables: [],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    query(hook) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') {
        // resource-nodes-feature's row: the player's own side on a full bog (stock is the server's).
        const own = (verbId) => resourceNodeVerbs({ ...peat, units: 4, depleted: false }, engine.inv, engine.pc, ctx).find((v) => v.id === verbId);
        return [{
          key: 'peat_1:0',
          classTsid: 'peat_1',
          node: peat,
          target: peatT,
          refresh() {},
          ready: (verbId) => own(verbId)?.enabled === true,
          reason: (verbId) => (own(verbId)?.enabled ? '' : String(own(verbId)?.message || '')),
        }];
      }
      return null;
    },
    executeVerb(target, verbId) {
      assert.equal(streetObjectsFeature.runVerbOverride(target, verbId, engine), null);
      harvestResourceNode(peat, engine.inv, engine.pc, ctx);
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, peat, peatT };
}

describe('#214 a harvest chosen again is refused before the swing', () => {
  it('a fresh bog may start', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.verbRefusedNow(r.peatT, 'harvest', r.engine), null);
  });

  it('while the first harvest is asked about, a second does not start', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.runVerbOverride(r.peatT, 'harvest', r.engine), true, 'the first swing ended: asked');
    assert.equal(streetObjectsFeature.verbRefusedNow(r.peatT, 'harvest', r.engine), COPY.busy);
  });

  it('once the day\'s harvest landed, a stale menu choice is refused with the once-a-day line', () => {
    const r = rig();
    streetObjectsFeature.runVerbOverride(r.peatT, 'harvest', r.engine);
    const req = r.sent.at(-1).req;
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req, id: 'node:peat_1:0', verb: 'harvest', before: { id: 'node:peat_1:0', units: 4, in: 0 }, obj: { id: 'node:peat_1:0', units: 3, in: 120000 } });
    assert.equal(r.engine.inv.peat, 3, 'the first harvest landed');
    assert.equal(streetObjectsFeature.verbRefusedNow(r.peatT, 'harvest', r.engine), ONCE);
  });

  it('solo and local rooms are left to the local rules', () => {
    const r = rig();
    r.engine.mode = 'solo';
    assert.equal(streetObjectsFeature.verbRefusedNow(r.peatT, 'harvest', r.engine), null);
  });

  it('game.js asks before the swing; resource nodes give the reason', () => {
    const game = read('public/game.js');
    const begin = game.slice(game.indexOf('function beginVerbAction('), game.indexOf('function cancelCurrentAction('));
    assert.ok(begin.indexOf("'verbRefusedNow'") > 0 && begin.indexOf("'verbRefusedNow'") < begin.indexOf('createTimedAction'));
    assert.match(read('public/js/features/resource-nodes-feature.js'), /reason\(verbId\) \{\n\s+const verb = ownSide\(engine, entity, verbId\);/);
  });
});
