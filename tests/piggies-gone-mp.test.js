/**
 * G605, Piggies between players slice 2 (Austin 2026-11-09): online a street Piggy captured
 * (npc_piggy.js verbs.capture 361-541) or poured with a Potion of Animal Youth (verbs.apply_youth
 * 321-359, potion_animal_youth.js onPour 547-569) is gone for everyone until the next game day
 * (ours, as G82), and a fed Piggy's Plops lie on the ground for everyone with their seeds as their
 * words (feed 685-729, doPlop 1315-1350; copy tag kind "plop"). The realtime server decides
 * (groddle-afternoon-server objects_pigs_gone.go, objects_pigs_plops.go, drops.go place); this
 * checks the page's side: js/street-objects.js, street-objects-feature, animal-husbandry-feature,
 * potions-feature, drops-mp-feature and js/copy-tags.js. Solo is checked to stay as it was.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { actMessage, applyPigState } from '../public/js/street-objects.js?fresh=piggies-gone';
import { COPY_TAG_CLASSES, COPY_TAG_RULES, cleanCopyTagOf } from '../public/js/copy-tags.js?fresh=piggies-gone';
import { PIGGY_CROP_SEEDS, husbandryPack, normalizeHusbandryPack } from '../public/js/animal-husbandry.js?v=9e918309';
import { copyTagKind } from '../public/js/tools.js?v=62b37c51';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?fresh=piggies-gone';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const PIG = { id: 'pig:1', mood: 1, hunger: 0, petted: false, daily: true, croak: false, in: 1000 };

describe('a street Piggy gone for everyone', () => {
  it('the server\'s "gone" is the page\'s sharedGone, and its return clears it', () => {
    const st = {};
    applyPigState(st, { ...PIG, gone: true }, 1000);
    assert.equal(st.sharedGone, true);
    applyPigState(st, PIG, 2000);
    assert.equal(st.sharedGone, undefined);
  });

  it('a youth pour names its bottle (k), only for youth', () => {
    assert.deepEqual(actMessage({ req: 1, id: 'pig:1', verb: 'youth', k: 2 }), { req: 1, id: 'pig:1', verb: 'youth', k: 2 });
    assert.equal(actMessage({ req: 1, id: 'pig:1', verb: 'pet', k: 2 }).k, undefined);
    assert.equal(actMessage({ req: 1, id: 'pig:1', verb: 'youth', k: -1 }).k, undefined);
  });
});

function rig({ learned = ['herdkeeping_1'] } = {}) {
  const listeners = new Map();
  const sent = [];
  const client = {
    state: 'online',
    wanted: 'GSTREET',
    street: 'GSTREET',
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
  const pigT = { classId: 'npc_piggy', label: 'Piggy', animalKey: 'GSTREET:npc_piggy:1', state: { mood: 1, hunger: 0 }, sprite: { x: 300, y: 900 } };
  const calls = { gone: [], youth: [], seen: [], replays: [], receipts: [], activity: [] };
  const hidden = new Set();
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: { pig_bait: 1 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: learned,
    interactables: [pigT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity(line) { calls.activity.push(line); },
    playSound() {},
    say() {},
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') return [];
      if (hook === 'sharedPigGone') {
        // As animal-husbandry-feature does: a gone Piggy leaves interactables, and comes back.
        calls.gone.push([args[0], args[1]]);
        const at = engine.interactables.indexOf(args[0]);
        if (args[1] && at >= 0) { engine.interactables.splice(at, 1); hidden.add(args[0]); }
        if (!args[1] && hidden.has(args[0])) { hidden.delete(args[0]); engine.interactables.push(args[0]); }
        return true;
      }
      if (hook === 'sharedGonePiggies') return hidden.size ? [...hidden] : null;
      if (hook === 'youthGranted') { calls.youth.push([args[0], args[1]]); return true; }
      if (hook === 'sharedYouthSeen') { calls.seen.push(args[1]); return true; }
      if (hook === 'ledgerReceipt') { calls.receipts.push(args[0]); return true; }
      return null;
    },
    executeVerb(target, verbId) {
      calls.replays.push([verbId, streetObjectsFeature.sharedVerbGrant(target, verbId)]);
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [PIG] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, pigT, calls };
}

describe('street objects feature: capture, youth and Plops (G605)', () => {
  it('a capture asks with Herdkeeping; the go-ahead replays it with the server\'s roll and applies the bait once', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.runVerbOverride(r.pigT, 'capture', r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'capture', perks: ['herd'] });
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'pig:1', verb: 'capture', roll: 0.5, success: true, use: { op: 'use-0000000000000001', c: 'pig_bait', n: 1, left: 0, spent: true }, obj: { ...PIG, gone: true } });
    assert.deepEqual(r.calls.receipts, ['use-0000000000000001']);
    assert.equal(r.calls.replays.length, 1);
    assert.equal(r.calls.replays[0][0], 'capture');
    assert.equal(r.calls.replays[0][1].roll, 0.5);
    assert.equal(r.pigT.state.sharedGone, true);
    assert.deepEqual(r.calls.gone.at(-1), [r.pigT, true]);
  });

  it('a capture without the skill goes without the perk (the server refuses it in the source\'s words)', () => {
    const r = rig({ learned: [] });
    streetObjectsFeature.runVerbOverride(r.pigT, 'capture', r.engine);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'capture' });
  });

  it('a youth pour asks with its bottle; the go-ahead lands in potions-feature; another\'s pour shows its poof', () => {
    const r = rig();
    assert.equal(streetObjectsFeature.sharedPigYouth(r.pigT, 1, r.engine), true);
    assert.deepEqual(r.sent.at(-1), { t: 'obj_act', req: 1, id: 'pig:1', verb: 'youth', k: 1 });
    r.client.emit('msg:obj_ok', { t: 'obj_ok', req: 1, id: 'pig:1', verb: 'youth', x: 310, y: 900, placed: true, use: { op: 'use-2', c: 'potion_animal_youth', left: 2, spent: false }, obj: { ...PIG, gone: true } });
    assert.equal(r.calls.youth.length, 1);
    assert.equal(r.calls.youth[0][1].x, 310);
    assert.equal(r.calls.replays.length, 0, 'a pour replays no verb');
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'pig:1', ev: 'youth', by: 9, x: 310, y: 900 });
    assert.equal(r.calls.seen.length, 1);
  });

  it('the server\'s return brings the Piggy back; a Plop for this player is its activity line', () => {
    const r = rig();
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [{ ...PIG, gone: true }] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', objs: [PIG] });
    streetObjectsFeature.onTick(16, 0, r.engine);
    assert.deepEqual(r.calls.gone.slice(-2).map(([, g]) => g), [true, false]);
    assert.ok(r.engine.interactables.includes(r.pigT), 'the hidden Piggy hears its return and is back');
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'pig:1', ev: 'plop', by: 7, seed: 'seed_potato', n: 3 });
    r.client.emit('msg:obj_ev', { t: 'obj_ev', street: 'GSTREET', id: 'pig:1', ev: 'plop', by: 9, seed: 'seed_potato', n: 2 });
    assert.deepEqual(r.calls.activity, ['The Piggy plopped on the ground!']);
  });

  it('solo: nothing is asked', () => {
    const r = rig();
    r.engine.mode = 'solo';
    assert.equal(streetObjectsFeature.runVerbOverride(r.pigT, 'capture', r.engine), null);
    assert.equal(streetObjectsFeature.sharedPigYouth(r.pigT, 0, r.engine), null);
  });
});

describe('a Plop\'s seeds travel as its words (copy tag kind "plop")', () => {
  it('the Plop keeps words though it is no tool; its seeds are the crop seed classes', () => {
    assert.equal(COPY_TAG_CLASSES.plop, 'plop');
    assert.equal(copyTagKind('plop'), 'plop');
    assert.deepEqual([...COPY_TAG_RULES.plop.seeds].sort(), [...new Set(Object.values(PIGGY_CROP_SEEDS))].sort());
    assert.equal(COPY_TAG_RULES.plop.max, 7);
    assert.deepEqual(cleanCopyTagOf('plop', { seed: 'seed_potato', n: 3 }), { seed: 'seed_potato', n: 3 });
    assert.equal(cleanCopyTagOf('plop', { seed: 'apple', n: 3 }), null);
  });

  it('a Plop picked up takes its seeds into the pack\'s Plop table, and one dropped takes the first down', async () => {
    const { animalHusbandryFeature } = await import('../public/js/features/animal-husbandry-feature.js?fresh=piggies-gone');
    normalizeHusbandryPack({ plops: [{ seedClass: 'seed_corn', seedCount: 4 }] });
    const engine = { inv: { plop: 2 }, save() {} };
    // drops-mp-feature added the picked-up Plop to the pack first (the count is 2 now).
    assert.equal(animalHusbandryFeature.plopSeedsIn({ seed: 'seed_carrot', n: 6 }, engine), true);
    assert.deepEqual(husbandryPack().plops, [{ seedClass: 'seed_corn', seedCount: 4 }, { seedClass: 'seed_carrot', seedCount: 6 }]);
    assert.deepEqual(animalHusbandryFeature.plopSeedsOut(engine), { seed: 'seed_corn', n: 4 });
  });

  it('drops-mp-feature hands a Plop\'s words over both ways', () => {
    const src = read('public/js/features/drops-mp-feature.js');
    assert.match(src, /side === 'took' && item\.c === 'plop' && item\.n === 1 && item\.t\) engine\.query\?\.\('plopSeedsIn'/);
    assert.match(src, /if \(c === 'plop' && n === 1\) \{\s*const t = engine\.query\?\.\('plopSeedsOut', engine\);/);
  });
});

describe('the pages leave the Piggy\'s Plops and leaving to the server online', () => {
  it('animal-husbandry-feature: no local Plops for a shared Piggy; a capture asks first and replays with the grant', () => {
    const src = read('public/js/features/animal-husbandry-feature.js');
    assert.match(src, /engine\.mode === 'multiplayer' && engine\.query\?\.\('sharedPiggy', plop\.target, engine\) === true\) continue;/);
    assert.match(src, /engine\.query\?\.\('sharedObjectVerb', target, 'capture', engine\)/);
    assert.match(src, /engine\.query\?\.\('sharedVerbGrant', target, 'capture'\)/);
    assert.match(src, /if \(engine\.mode === 'multiplayer'\) break;/, 'online the street-enter hide loop leaves captured Piggies to the server');
  });

  it('potions-feature: a youth pour on a street Piggy online asks the server', () => {
    const src = read('public/js/features/potions-feature.js');
    assert.match(src, /engine\.query\?\.\('sharedPigYouth', target, copy != null && copy >= 0 \? copy : null, engine\)/);
    assert.match(src, /youthGranted\(target, msg, engine\) \{/);
  });
});

describe('the site places a stack the street makes (LedgerDrop::put)', () => {
  it('records it under the player, with no trade, once per op', { skip: process.env.GRODDLE_SITE_DIR ? false : 'no site checkout' }, () => {
    const src = readFileSync(join(process.env.GRODDLE_SITE_DIR, 'src/LedgerDrop.php'), 'utf8');
    assert.match(src, /public const PLACE = '\/groddle\/v1\/ledger\/drop\/place';/);
    const put = src.slice(src.indexOf('public static function put('), src.indexOf('public static function give('));
    assert.doesNotMatch(put, /Ledger::TRADES/, 'no ledger gives a placed stack up');
    assert.match(put, /'place'/);
    const use = readFileSync(join(process.env.GRODDLE_SITE_DIR, 'src/LedgerUse.php'), 'utf8');
    assert.match(use, /'potion_animal_youth' => \[3, 'potions', 'uses'\],/);
  });
});
