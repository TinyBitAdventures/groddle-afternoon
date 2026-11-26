/**
 * #476 (R3): online, a shared tree's menu offered Water (or Pet) again after the first one, until
 * the server's answer set the tree's mark, and a menu already open was not drawn again when the
 * answer landed. Glitch built each menu on the server (trant_fruit.js verbs.water conditions read
 * the tree's own waterings), so the menu never ran ahead of the tree. Now an object with a verb
 * waiting on the server's answer shows the verbs the server decides greyed with the busy line
 * (js/street-objects.js greyWaitingVerbs, street-objects-feature decorateVerbs), for every shared
 * kind, and the open menu is drawn again when the answer lands (game.js refreshVerbMenu).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COPY, greyWaitingVerbs, waitingIds } from '../public/js/street-objects.js?v=eaf5d836';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=8a016230';
import { createTrantState } from '../public/js/trants.js?v=864ea9ff';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const ROWS = () => [
  { id: 'pet', label: 'pet', enabled: true },
  { id: 'water', label: 'water', enabled: true },
  { id: 'harvest', label: 'harvest', enabled: true },
  { id: 'talk_to', label: 'talk to', enabled: true },
];

describe('#476 pure helpers', () => {
  it('waitingIds names the objects with an answer pending, not silent words', () => {
    const ids = waitingIds([{ id: 'tree:0' }, { id: 'pig:1', silent: true }, { id: 'rock:2' }, null, {}]);
    assert.deepEqual([...ids].sort(), ['rock:2', 'tree:0']);
    assert.equal(waitingIds(null).size, 0);
  });

  it('greyWaitingVerbs greys the shared rows with the busy line and leaves the rest', () => {
    const out = greyWaitingVerbs(ROWS(), (v) => v.id !== 'talk_to');
    assert.deepEqual(out.map((v) => [v.id, v.enabled, v.reason || '']), [
      ['pet', false, COPY.busy],
      ['water', false, COPY.busy],
      ['harvest', false, COPY.busy],
      ['talk_to', true, ''],
    ]);
  });

  it('a row already refused keeps its own reason; no change is null', () => {
    const rows = [{ id: 'water', enabled: false, reason: 'You need a working Watering Can.' }, { id: 'talk_to', enabled: true }];
    assert.equal(greyWaitingVerbs(rows, (v) => v.id === 'water'), null);
    assert.equal(greyWaitingVerbs(ROWS(), () => false), null);
    assert.equal(greyWaitingVerbs(null, () => true), null);
  });
});

function rig({ mode = 'multiplayer' } = {}) {
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
  const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
  const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', state: tree, treeIndex: 0 };
  const refreshed = [];
  const engine = {
    mode,
    started: true,
    streetTsid: 'GSTREET',
    inv: { watering_can: 1 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: [],
    toolState: null,
    interactables: [treeT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    refreshVerbMenu(t) { refreshed.push(t); },
    query(hook) {
      if (hook === 'realtimeClient') return client;
      return null;
    },
    executeVerb(target, verbId) {
      assert.equal(streetObjectsFeature.runVerbOverride(target, verbId, engine), null);
      if (verbId === 'water') tree.watered = true;
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, tree, treeT, refreshed };
}

const BEFORE = { id: 'tree:0', fruit: 50, cap: 98, health: 7, maturity: 10, petted: false, watered: false };

describe('#476 a shared tree waiting on the street', () => {
  it('nothing waiting: the menu is left alone', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.decorateVerbs(r.treeT, ROWS(), r.engine), null);
  });

  it('while Water is asked about, its verbs show greyed; the open menu is drawn again when the answer lands', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), true);
    assert.ok(r.refreshed.includes(r.treeT), 'asked: an open menu shows it waiting');
    const waiting = streetObjectsFeature.decorateVerbs(r.treeT, ROWS(), r.engine);
    assert.deepEqual(waiting.map((v) => [v.id, v.enabled]), [['pet', false], ['water', false], ['harvest', false], ['talk_to', true]]);
    assert.equal(waiting[1].reason, COPY.busy);
    r.refreshed.length = 0;
    const req = r.sent.at(-1).req;
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req, id: 'tree:0', verb: 'water', before: BEFORE, obj: { ...BEFORE, watered: true }, roll: 0.1, success: true });
    assert.ok(r.refreshed.includes(r.treeT), 'the answer redraws the open menu');
    assert.equal(r.tree.watered, true);
    assert.equal(streetObjectsFeature.decorateVerbs(r.treeT, ROWS(), r.engine), null, 'answered: the local rules (watered) speak again');
  });

  it('a refusal or a timeout also draws the menu again, ungreyed', () => {
    const r = rig();
    streetObjectsFeature.runVerbOverride(r.treeT, 'pet', r.engine);
    r.refreshed.length = 0;
    r.client.emit('msg:obj_no', { t: 'obj_no', req: r.sent.at(-1).req, id: 'tree:0', verb: 'pet', code: 'not_wanted', message: 'This tree was already petted today.' });
    assert.ok(r.refreshed.includes(r.treeT));
    assert.equal(streetObjectsFeature.decorateVerbs(r.treeT, ROWS(), r.engine), null);
  });

  it('solo is left to the local rules', () => {
    const r = rig({ mode: 'solo' });
    assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), null);
    assert.equal(streetObjectsFeature.decorateVerbs(r.treeT, ROWS(), r.engine), null);
  });

  it('game.js draws the open menu again from menuVerbsFor and gives features refreshVerbMenu', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function refreshVerbMenu('), game.indexOf('function renderVerbMenu('));
    assert.match(fn, /menuTarget !== target/);
    assert.match(fn, /menu\.dataset\.vmLevel/, 'a picker level is left alone');
    assert.match(fn, /const verbs = menuVerbsFor\(target\);/);
    assert.match(fn, /if \(menu\._vmSig === verbMenuSig\(target, verbs\)\) return false;/, 'drawn again only when it changed');
    assert.match(fn, /renderVerbMenu\(target, verbs\);/);
    assert.match(game, /menu\._vmSig = level \? '' : verbMenuSig\(target, verbs\);/);
    assert.match(game, /refreshVerbMenu: \(target\) => refreshVerbMenu\(target\)/);
  });
});
