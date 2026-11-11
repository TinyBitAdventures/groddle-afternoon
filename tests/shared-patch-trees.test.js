/**
 * G564 lane 3 (slice 1): a tree grown in a shared street Patch answers to the
 * realtime server (patches.go) for pet, water and harvest
 * (features/shared-patches-feature.js), and for Tree Poison and its Antidote
 * (features/tree-death-feature.js through sharedPatchTreeVerb). Slice 2: the
 * Rook (the server strips Patch trees itself; the page reads their p keys),
 * Fertilidust (street-objects-feature sharedFertilize, obj_dust) and
 * Trantsformation Fluid (patch_act "trantsform", potions-feature) reach them
 * through the server too.
 *
 * Every `grownFromBean` branch keeps its solo behaviour (a tree in your own
 * Patch, at home or on a street the server doesn't share carries no
 * `sharedPatch`), pinned here in solo and shared.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import {
  POUR_WIRE,
  REFUSAL_LINES,
  SHARED_PATCHES_QA_KEY,
  TREE_VERBS,
  localPatchPlot,
  prepareGrantedTree,
  sharedTreeKey,
  sharedTreeReady,
  sharedTreeSkill,
  TRANTSFORM_VERB,
} from '../public/js/shared-patches.js?v=32cb1eb0';
import { sharedPatchesFeature } from '../public/js/features/shared-patches-feature.js?v=1d87d4ca';
import { patchesFeature } from '../public/js/features/patches-feature.js?v=57265519';
import { treeDeathFeature, decorateTreeVerbs } from '../public/js/features/tree-death-feature.js?v=a007a6b0';
import { potionsFeature } from '../public/js/features/potions-feature.js?v=7e6e19fe';
import { powdersFeature, runPowder } from '../public/js/features/powders-feature.js?v=a3a12af8';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=a723bdba';
import { rookKeyFor } from '../public/js/rook-attack.js?v=c12e825f';
import { rookedFromServer, syncKeys } from '../public/js/rook-mp.js?v=0b9056b1';
import { runVerb } from '../public/content.js?v=50ca835b';
import { isPoisoned, POISON_DURATION_MS, TREE_ANTIDOTE, TREE_POISON } from '../public/js/tree-poison.js?v=5ceea244';
import { getStreetEcologyCatalog, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=08076876';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const OLD_MAIN = 'GM4103L52ID23';
const tick = () => new Promise((res) => setTimeout(res, 15));
const settle = () => new Promise((res) => setTimeout(res, 2700));

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe('a tree in a shared Patch: the page\'s rules', () => {
  const tree = (extra = {}) => ({ classId: 'trant_spice', grownFromBean: true, state: { maturity: 5 }, sprite: {}, ...extra });

  it('only a tree grown in a Patch the server shares is the server\'s; solo and home trees are not', () => {
    assert.equal(sharedTreeKey(tree({ sharedPatch: 'patch:0' })), 'patch:0');
    assert.equal(sharedTreeKey(tree()), '', 'a tree in your own Patch (solo, home, an unshared street)');
    assert.equal(sharedTreeKey({ ...tree({ sharedPatch: 'patch:0' }), grownFromBean: false }), '', 'a street tree is street-objects\'');
    assert.equal(sharedTreeKey(tree({ sharedPatch: 'patch:0', featureId: 'patches' })), '', 'soil plots are lane 2\'s');
    assert.equal(sharedTreeKey(tree({ sharedPatch: 'demo:tree' })), '', 'demo plots are never shared');
    assert.deepEqual(TREE_VERBS, ['pet', 'water', 'harvest']);
    assert.deepEqual(POUR_WIRE, { 'treepoison:poison': 'poison', 'treepoison:antidote': 'antidote', [TRANTSFORM_VERB]: 'trantsform' });
  });

  it('slice 2: no "later" any more; the rooked and weak refusals read in plain words', () => {
    assert.equal(REFUSAL_LINES.later, undefined);
    assert.equal(REFUSAL_LINES.rooked, "It's rooked. Revive it first.");
    assert.equal(REFUSAL_LINES.weak, 'This tree is too weak to be trantsformed');
    for (const line of Object.values(REFUSAL_LINES)) assert.doesNotMatch(line, /[—–]/);
  });

  it('the server\'s poison clock lands in the tree state as tree-death-feature reads it, and anyone\'s cure clears it', () => {
    const now = 1_000_000_000;
    const base = { class: 'patch', kind: 'patch', stage: 'tree', tree: { class: 'trant_spice', maturity: 5, health: 7, fruit: 3, cap: 9 } };
    const p1 = localPatchPlot('patch:0', base, 0, now);
    assert.equal(isPoisoned(p1.tree.state), false);
    const p2 = localPatchPlot('patch:0', { ...base, tree: { ...base.tree, poison: 120000, by: 9 } }, 0, now, p1);
    assert.equal(p2.tree.state, p1.tree.state, 'the target\'s state object is kept');
    assert.equal(p2.tree.state.poisonEndsAt, now + 120000);
    assert.equal(p2.tree.state.poisonedAt, now + 120000 - POISON_DURATION_MS, 'the cries count from the pour');
    assert.equal(p2.poisonBy, 9);
    // The pourer's page set its own clock a moment earlier: kept, with its bubbles.
    p2.tree.state.poisonBubble = 2;
    const p3 = localPatchPlot('patch:0', { ...base, tree: { ...base.tree, poison: 119500, by: 9 } }, 0, now + 1000, p2);
    assert.equal(p3.tree.state.poisonEndsAt, now + 120000);
    assert.equal(p3.tree.state.poisonBubble, 2);
    const p4 = localPatchPlot('patch:0', base, 0, now + 2000, p3);
    assert.equal(isPoisoned(p4.tree.state), false, 'cured');
    assert.equal(p4.tree.state.poisonBubble, undefined);
  });

  it('the player\'s own side refuses here, as in solo; the tree\'s flags, fruit and daily count are the server\'s', () => {
    const ctx = { inv: { watering_can: 1 }, pc: { energy: 90 }, learned: [] };
    const state = { classTsid: 'trant_spice', maturity: 5, health: 7, fruitCount: 0, fruitCapacity: 9, petted: true, watered: true, harvestsToday: 5 };
    assert.equal(sharedTreeReady(state, 'trant_spice', 'pet', ctx), true, 'petted here, maybe not on the server');
    assert.equal(sharedTreeReady(state, 'trant_spice', 'water', ctx), true);
    assert.equal(sharedTreeReady(state, 'trant_spice', 'harvest', ctx), true, 'no fruit and five harvests here: the server decides');
    assert.equal(sharedTreeReady(state, 'trant_spice', 'water', { ...ctx, inv: {} }), false, 'no watering can');
    assert.equal(sharedTreeReady(state, 'trant_spice', 'pet', { ...ctx, pc: { energy: 1 } }), false, 'too tired');
    assert.equal(sharedTreeReady({ ...state, maturity: 2 }, 'trant_spice', 'harvest', ctx), false, 'too small');
    assert.equal(sharedTreeReady(state, 'trant_spice', 'talk_to', ctx), false);
    const wood = { maturity: 4, harvestCount: 0, harvestedToday: true };
    assert.equal(sharedTreeReady(wood, 'wood_tree', 'harvest', { ...ctx, inv: { hatchet: 1 } }), true, 'harvested today is the server\'s word');
    assert.equal(sharedTreeReady(wood, 'wood_tree', 'harvest', ctx), false, 'no Hatchet');
    assert.equal(wood.harvestedToday, true, 'the check changes nothing');
  });

  it('the skill row each verb sends, and the daily count the granted run starts from', () => {
    assert.equal(sharedTreeSkill('trant_spice', 'pet', []), '');
    assert.equal(sharedTreeSkill('trant_spice', 'water', ['light_green_thumb_1', 'light_green_thumb_2']), 'light_green_thumb_2');
    assert.equal(sharedTreeSkill('trant_spice', 'harvest', ['gardening_1', 'gardening_2', 'gardening_3']), 'gardening_3');
    assert.equal(sharedTreeSkill('wood_tree', 'harvest', ['gardening_3']), '');
    assert.equal(sharedTreeSkill('wood_tree', 'pet', ['light_green_thumb_1']), 'light_green_thumb_1');
    const s = { harvestsToday: 0 };
    prepareGrantedTree(s, 'trant_spice', 'harvest', { harvests: 2 });
    assert.equal(s.harvestsToday, 1, 'the run here counts the second');
    const w = { harvestedToday: true };
    prepareGrantedTree(w, 'wood_tree', 'harvest', {});
    assert.equal(w.harvestedToday, false);
    const p = { petted: false };
    prepareGrantedTree(p, 'trant_spice', 'pet', {});
    assert.deepEqual(p, { petted: false });
  });

  it('the Rook keys a shared Patch tree by its plot, never sends it, reads the server\'s rooked Patch trees, and leaves solo Patch trees\' keys alone', () => {
    assert.equal(rookKeyFor(tree({ sharedPatch: 'patch:0' })), 'trant_spice:ppatch:0');
    assert.equal(rookKeyFor(tree({ sharedPatch: 'trant_spice_dead:0', classId: 'trant_bean' })), 'trant_bean:ptrant_spice_dead:0');
    assert.equal(rookKeyFor(tree({ sharedPatch: 'tree:3', classId: 'wood_tree', state: { maturity: 4 } })), 'wood_tree:ptree:3');
    assert.equal(rookKeyFor(tree()), '', 'solo: the feature keys it from 100 as before');
    assert.deepEqual(syncKeys([{ key: 'trant_spice:ppatch:0' }, { key: 'trant_spice:3' }]), ['trant_spice:3'], 'the server learns Patch trees from its own patches module');
    const rooked = rookedFromServer({
      'trant_spice:ppatch:0': { class: 'trant_spice', doses: 1, by: [9] },
      'wood_tree:ptree:3': { class: 'wood_tree' },
      'trant_spice:3': { class: 'trant_spice' },
      'trant_spice:pnot_a_plot': { class: 'trant_spice' },
      'npc_piggy:pfoo:1': { class: 'npc_piggy' },
    });
    assert.deepEqual(Object.keys(rooked).sort(), ['trant_spice:3', 'trant_spice:ppatch:0', 'wood_tree:ptree:3']);
    assert.deepEqual(rooked['trant_spice:ppatch:0'].by, [9]);
  });
});

// ---------------------------------------------------------------------------
// On a fake page: patches-feature, shared-patches-feature, tree-death-feature
// ---------------------------------------------------------------------------

class Obj {
  constructor(texture) {
    this.texture = texture;
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.alpha = 1;
    this.destroyed = false;
    this.children = [];
    this.anchor = { set() {} };
    const scale = { x: 1, y: 1, set(a, b = a) { scale.x = a; scale.y = b; } };
    this.scale = scale;
  }
  addChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  destroy() { this.destroyed = true; }
}
class Gfx extends Obj {
  ellipse() { return this; }
  circle() { return this; }
  fill() { return this; }
  stroke() { return this; }
  poly() { return this; }
  clear() { return this; }
}
const PIXI = {
  Sprite: Obj,
  Container: Obj,
  Graphics: Gfx,
  AnimatedSprite: Obj,
  Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } },
  ImageSource: class { on() {} emit() {} },
  Texture: Object.assign(class { constructor(o) { Object.assign(this, o); } }, { EMPTY: { height: 0 } }),
};

/** The features game.js asks first for a verb, in FEATURES order (tree-death before shared-patches). */
const OVERRIDES = [treeDeathFeature, sharedPatchesFeature];

function rig({ mode = 'multiplayer', learned = [] } = {}) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    street: OLD_MAIN,
    me: { id: 7 },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    send(kind, payload = {}) {
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const world = { [OLD_MAIN]: { features: { patches: { plots: {} } } } };
  const receipts = [];
  const runs = [];
  const log = { toasts: [], activity: [], achievements: [], sounds: [], buffs: [] };
  const interactables = [];
  const engine = {
    mode,
    started: true,
    PIXI,
    streetTsid: OLD_MAIN,
    street: { tsid: OLD_MAIN, hubId: '27' },
    inv: { hoe: 1, shovel: 1, hatchet: 1, watering_can: 1, [TREE_POISON]: 1, [TREE_ANTIDOTE]: 1, fertilidust: 1, fertilidust_lite: 1, potion_trantsformation_fluid: 1 },
    pc: { energy: 90, mood: 90, energyMax: 100, imaginationUpgrades: [] },
    learnedSkills: ['botany_1', ...learned],
    toolState: null,
    player: { x: 640, y: 970 },
    worldW: 6000,
    entityLayer: new Obj(),
    fxLayer: new Obj(),
    data: {},
    get interactables() { return interactables; },
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { log.toasts.push(line); },
    pushActivity(line) { log.activity.push(line); },
    playSound(key) { log.sounds.push(key); },
    floatText() {},
    say() {},
    achievement(c, n) { log.achievements.push(`${c}:${n}`); },
    applyBuff(id) { log.buffs.push(id); },
    removeBuff() {},
    hasBuff: () => false,
    buffRow: () => null,
    homeContext: () => ({ inHome: false }),
    refreshPack() {},
    refreshTreeVisual() {},
    updateHud() {},
    save() {},
    param: () => null,
    activeBuffIds: () => [],
    placement: (key) => (key === 'soil:patch' ? [660, 1752, 2654, 5102].map((x) => ({ x, y: 970 })) : key === 'soil:trant_spice_dead' ? [{ x: 3726, y: 950 }] : []),
    streetSlot: (id) => {
      const s = (world[engine.streetTsid] ||= {});
      s.features ||= {};
      return (s.features[id] ||= {});
    },
    streetWorld: (tsid) => world[tsid || engine.streetTsid],
    register(t) { interactables.push(t); return t; },
    unregister(t) { const i = interactables.indexOf(t); if (i >= 0) interactables.splice(i, 1); },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return mode === 'multiplayer' ? client : null;
      if (hook === 'ledgerReceipt') { receipts.push(args[0]); return true; }
      if (hook === 'sharedPatchPlots') return sharedPatchesFeature.sharedPatchPlots(...args);
      if (hook === 'sharedPatchVerb') return sharedPatchesFeature.sharedPatchVerb(...args);
      if (hook === 'sharedPatchTreeVerb') return sharedPatchesFeature.sharedPatchTreeVerb(...args);
      if (hook === 'sharedPatchTree') return sharedPatchesFeature.sharedPatchTree(...args);
      if (hook === 'sharedVerbGrant') return sharedPatchesFeature.sharedVerbGrant(...args);
      if (hook === 'sharedPatchTrantsform') return sharedPatchesFeature.sharedPatchTrantsform(...args);
      if (hook === 'trantsformGranted') return potionsFeature.trantsformGranted(...args);
      if (hook === 'sharedFertilize') return streetObjectsFeature.sharedFertilize(...args);
      if (hook === 'powderUseGranted') return powdersFeature.powderUseGranted(...args);
      // street-objects never answers for a Patch tree (it has no treeIndex).
      if (hook === 'sharedObjectVerb' || hook === 'sharedTree') return null;
      return null;
    },
    /** What game.js executeVerb does: the features' overrides first, then content.js with the grant's roll as the first draw. */
    executeVerb(target, verbId) {
      for (const f of OVERRIDES) if (f.runVerbOverride?.(target, verbId, engine) === true) return;
      const grant = sharedPatchesFeature.sharedVerbGrant(target, verbId);
      let roll = Number.isFinite(grant?.roll) ? grant.roll : null;
      const result = runVerb(target, verbId, {
        pc: engine.pc,
        inv: engine.inv,
        tools: engine.toolState,
        learned: engine.learnedSkills,
        imaginationUpgrades: [],
        rng: () => {
          if (roll != null) { const r = roll; roll = null; return r; }
          return 0.99;
        },
      });
      runs.push({ verbId, ok: result.ok, roll: grant?.roll });
    },
  };
  return { engine, client, sent, world, receipts, log, runs, interactables };
}

async function boot(r, { flag = true } = {}) {
  const prevPixi = globalThis.PIXI;
  globalThis.PIXI = PIXI;
  const store = new Map([[SHARED_PATCHES_QA_KEY, flag ? '1' : '0']]);
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null } };
  sharedPatchesFeature._reset();
  treeDeathFeature._reset();
  streetObjectsFeature._reset();
  powdersFeature._reset();
  potionsFeature._reset();
  sharedPatchesFeature.restore(undefined, r.engine);
  sharedPatchesFeature.init(r.engine);
  treeDeathFeature.init(r.engine);
  patchesFeature.onStreetClear();
  patchesFeature.onStreetEnter(r.engine.street, r.engine);
  sharedPatchesFeature.onTick(16, 0, r.engine);
  await tick();
  await tick();
  return () => { globalThis.PIXI = prevPixi; delete globalThis.window; };
}

const now = () => Date.now();
const spiceTree = (extra = {}) => ({ class: 'patch', kind: 'patch', stage: 'tree', since: now(), tree: { class: 'trant_spice', maturity: 5, health: 7, fruit: 6, cap: 15, petted: false, watered: false, ...extra } });
const woodTree = (extra = {}) => ({ class: 'patch', kind: 'patch', stage: 'tree', since: now(), tree: { class: 'wood_tree', maturity: 4, count: 0, petted: false, watered: false, ...extra } });
const snapshot = (r, plots = {}) => r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, snap: true, now: now(), timers: {}, plots });
const change = (r, plots) => r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, now: now(), plots });
const target = (key) => patchesFeature.entityByKey(key)?.target;
const lastAct = (r) => r.sent.filter((m) => m.t === 'patch_act').at(-1);
const acts = (r) => r.sent.filter((m) => m.t === 'patch_act' || m.t === 'obj_act');

describe('a tree in a shared Patch on the page', () => {
  let ecology;
  let restore = () => {};
  before(() => {
    ecology = getStreetEcologyCatalog();
    setStreetEcologyCatalog({ ...(ecology || {}), soil: { [OLD_MAIN]: { patch: 4, trant_spice_dead: 1 } } });
  });
  after(() => {
    setStreetEcologyCatalog(ecology);
    restore();
  });

  async function shared(plots, opts = {}) {
    const r = rig(opts);
    restore = await boot(r);
    snapshot(r, plots);
    await tick();
    r.sent.length = 0;
    return r;
  }

  it('pet: asked first with the skill row; the go-ahead runs here once, with the server\'s roll, then its tree lands', async () => {
    const r = await shared({ 'patch:0': spiceTree() }, { learned: ['light_green_thumb_1'] });
    const t = target('patch:0');
    assert.equal(t.sharedPatch, 'patch:0');
    const energy = r.engine.pc.energy;
    r.engine.executeVerb(t, 'pet');
    assert.deepEqual(lastAct(r), { t: 'patch_act', req: lastAct(r).req, id: 'patch:0', verb: 'pet', skill: 'light_green_thumb_1' });
    assert.equal(r.runs.length, 0, 'nothing runs before the answer');
    assert.equal(r.engine.pc.energy, energy);
    // A second try while asking waits.
    r.engine.executeVerb(t, 'water');
    assert.equal(r.log.toasts.at(-1), 'Hold on, still asking the patch.');
    assert.equal(acts(r).length, 1);
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: lastAct(r).req, id: 'patch:0', verb: 'pet', now: now(), roll: 0.31, success: true, grew: 0, before: spiceTree(), plot: spiceTree({ petted: true }) });
    await tick();
    assert.deepEqual(r.runs, [{ verbId: 'pet', ok: true, roll: 0.31 }]);
    assert.ok(r.engine.pc.energy < energy, 'the page\'s energy, once');
    assert.equal(target('patch:0').state.petted, true);
    assert.equal(sharedPatchesFeature.sharedVerbGrant(t, 'pet'), null, 'the grant is spent');
    assert.equal(r.engine.data.sharedPatchesLast, 'patch:0:pet:ok');
  });

  it('a refusal (petted today by someone else) shows the server\'s line, runs nothing and costs nothing', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    const t = target('patch:0');
    const energy = r.engine.pc.energy;
    r.engine.executeVerb(t, 'pet');
    r.client.emit('msg:patch_no', { t: 'patch_no', req: lastAct(r).req, id: 'patch:0', verb: 'pet', code: 'not_wanted', message: 'This tree was already petted today.', now: now(), plot: spiceTree({ petted: true }) });
    await tick();
    assert.equal(r.runs.length, 0);
    assert.equal(r.engine.pc.energy, energy);
    assert.equal(r.log.toasts.at(-1), 'This tree was already petted today.');
    assert.equal(r.log.sounds.at(-1), 'CLICK_FAILURE');
    assert.equal(target('patch:0').state.petted, true, 'the tree as the server has it');
  });

  it('the player\'s own refusal (no watering can) runs here alone and never reaches the server', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    delete r.engine.inv.watering_can;
    const t = target('patch:0');
    assert.equal(sharedPatchesFeature.runVerbOverride(t, 'water', r.engine), null);
    r.engine.executeVerb(t, 'water');
    assert.equal(acts(r).length, 0);
    assert.deepEqual(r.runs.map((x) => x.ok), [false], 'refused here as in solo');
  });

  it('Dametime midnight: this player\'s harvests of a shared Patch tree start over, so the menu offers Harvest again', async () => {
    const r = await shared({ 'patch:0': spiceTree(), 'patch:1': woodTree() });
    const trant = target('patch:0');
    const wood = target('patch:1');
    trant.state.harvestsToday = 1;
    wood.state.harvestedToday = true;
    sharedPatchesFeature.onNewDay(now(), r.engine);
    assert.equal(trant.state.harvestsToday, 0);
    assert.equal(wood.state.harvestedToday, false);
    assert.equal(trant.state.petted, false, 'the tending flags stay the server\'s');
  });

  it('harvest: the fruit is the server\'s grant, added once, saved, then acknowledged; the daily count is the server\'s', async () => {
    const r = await shared({ 'patch:0': spiceTree({ fruit: 6 }) });
    const t = target('patch:0');
    t.state.harvestsToday = 4; // a stale count from another day: the server keeps the real one
    r.engine.executeVerb(t, 'harvest');
    const asked = lastAct(r);
    assert.equal(asked.verb, 'harvest');
    assert.equal(asked.skill, undefined, 'no Arborology');
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'harvest', now: now(), take: 3, harvests: 1, limit: 1, grant: { id: 'pg-abc-1', c: 'all_spice', n: 3 }, before: spiceTree({ fruit: 6 }), plot: spiceTree({ fruit: 3 }) });
    await tick();
    assert.deepEqual(r.runs.map((x) => [x.verbId, x.ok]), [['harvest', true]]);
    assert.equal(r.engine.inv.all_spice, 3, 'the take, once (the run here added it; the grant adds no more)');
    assert.equal(target('patch:0').state.fruitCount, 3);
    assert.equal(target('patch:0').state.harvestsToday, 1, 'the server\'s count');
    assert.equal(r.sent.some((m) => m.t === 'patch_ack'), false, 'acknowledged only after the save');
    await settle();
    assert.deepEqual(r.sent.filter((m) => m.t === 'patch_ack'), [{ t: 'patch_ack', id: 'pg-abc-1' }]);
    // Resent on a reconnect: applied already, so only acknowledged again.
    r.client.emit('msg:patch_grant', { t: 'patch_grant', id: 'pg-abc-1', c: 'all_spice', n: 3 });
    await tick();
    assert.equal(r.engine.inv.all_spice, 3);
    // Over the limit: the server's line.
    r.engine.executeVerb(target('patch:0'), 'harvest');
    r.client.emit('msg:patch_no', { t: 'patch_no', req: lastAct(r).req, id: 'patch:0', verb: 'harvest', code: 'daily_limit', message: 'You can only harvest from each tree 1 time per game day.', now: now(), plot: spiceTree({ fruit: 3 }) });
    await tick();
    assert.equal(r.log.toasts.at(-1), 'You can only harvest from each tree 1 time per game day.');
    assert.equal(r.runs.length, 1);
  });

  it('a Wood Tree\'s Planks are the server\'s grant', async () => {
    const r = await shared({ 'patch:1': woodTree({ maturity: 4 }) });
    r.engine.player.x = 1752;
    const t = target('patch:1');
    assert.equal(t.classId, 'wood_tree');
    t.state.harvestedToday = true; // yesterday's, here
    r.engine.executeVerb(t, 'harvest');
    const asked = lastAct(r);
    assert.deepEqual({ verb: asked.verb, skill: asked.skill }, { verb: 'harvest', skill: undefined });
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:1', verb: 'harvest', now: now(), grant: { id: 'pg-abc-2', c: 'plank', n: 60 }, before: woodTree({ maturity: 4 }), plot: woodTree({ maturity: 4, count: 1 }) });
    await tick();
    assert.deepEqual(r.runs.map((x) => [x.verbId, x.ok]), [['harvest', true]]);
    assert.equal(r.engine.inv.plank, 60);
  });

  it('poison: the pour asks the server (patch_act, not obj_act); the go-ahead uses the ledger\'s bottle, the guilt is the pourer\'s, and the clock is the server\'s', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    const t = target('patch:0');
    treeDeathFeature._completePour(r.engine, 'poison', t);
    const asked = lastAct(r);
    assert.deepEqual({ verb: asked.verb, id: asked.id }, { verb: 'poison', id: 'patch:0' });
    assert.equal(r.sent.some((m) => m.t === 'obj_act'), false);
    assert.equal(isPoisoned(t.state), false, 'nothing until the answer');
    assert.deepEqual(r.log.buffs, []);
    const use = { op: 'use-00000000000000b1', c: TREE_POISON, left: 4, spent: false };
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'poison', now: now(), poison: 180000, use, before: spiceTree(), plot: spiceTree({ poison: 180000, by: 7 }) });
    await tick();
    assert.equal(isPoisoned(target('patch:0').state), true);
    assert.ok(r.log.buffs.length, 'Poisoner\'s Guilt, the pourer\'s own');
    assert.ok(r.log.achievements.some((a) => /poison/.test(a)), 'its counters, once, on the go-ahead');
    // The clock runs out here: the page waits for the server's word, never kills it itself.
    target('patch:0').state.poisonEndsAt = now() - 1;
    treeDeathFeature.onTick(16, now() + 1000, r.engine);
    assert.equal(patchesFeature.entityByKey('patch:0').plot.stage, 'tree', 'not on this page\'s clock');
    assert.equal(treeDeathFeature._killTree(r.engine, target('patch:0')), null, 'a shared Patch tree dies only by the server');
    // The server says it died: its dead class, for everyone.
    change(r, { 'patch:0': { class: 'patch', kind: 'patch', stage: 'dead', since: now(), dead: 'trant_spice_dead' } });
    await tick();
    assert.equal(patchesFeature.entityByKey('patch:0').plot.stage, 'dead');
    assert.equal(target('patch:0').classId, 'trant_spice_dead');
    assert.equal(target('patch:0').sharedPatch, 'patch:0', 'its clear is the server\'s too (first clear wins)');
    assert.equal(r.engine.inv.plank || 0, 0, 'a dead trant drops no Planks here');
  });

  it('someone else\'s poison shows here (the antidote verb, harvest hidden), and this page\'s antidote asks the server', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    change(r, { 'patch:0': spiceTree({ poison: 150000, by: 9 }) });
    await tick();
    const t = target('patch:0');
    assert.equal(isPoisoned(t.state), true);
    const rows = decorateTreeVerbs([{ id: 'harvest', sort: 10 }, { id: 'pet', sort: 20 }], t.state, { inv: r.engine.inv, pc: r.engine.pc, learned: r.engine.learnedSkills, mood: 90, maxMood: 100, guilt: {}, owner: false });
    assert.deepEqual(rows.map((v) => v.id), ['treepoison:antidote']);
    treeDeathFeature._completePour(r.engine, 'antidote', t);
    const asked = lastAct(r);
    assert.equal(asked.verb, 'antidote');
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'antidote', now: now(), use: { op: 'use-00000000000000b2', c: TREE_ANTIDOTE, left: 4, spent: false }, before: spiceTree({ poison: 140000, by: 9 }), plot: spiceTree() });
    await tick();
    assert.equal(isPoisoned(target('patch:0').state), false, 'cured for everyone');
  });

  it('Fertilidust on a street with shared Patch trees asks the server (obj_dust) even with no shared street trees; the go-ahead uses the jar but grows and revives nothing here', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    assert.equal(r.interactables.filter((t) => t.sharedPatch && (t.grownFromBean || /_dead$/.test(t.classId))).length, 2, 'the Spice Plant and the Dead Spice Plant');
    assert.equal(runPowder(r.engine, 'fertilidust'), 'fertilidust:asked');
    const asked = r.sent.filter((m) => m.t === 'obj_dust').at(-1);
    assert.ok(asked && asked.id === undefined, 'the full jar names no tree');
    assert.equal(acts(r).length, 0, 'not a patch_act');
    assert.equal(r.engine.inv.fertilidust, 1, 'nothing used until the go-ahead');
    // The server's go-ahead (the dead Spice Plant came back for everyone as the jar was used).
    r.client.emit('msg:obj_dust_used', { t: 'obj_dust_used', req: asked.req, c: 'fertilidust', revived: ['trant_spice_dead:0'] });
    await tick();
    assert.match(powdersFeature._state().last, /^fertilidust:trees:1:revived:1:granted$/, 'counted as the street\'s own: one tree grown, one revived (its 25 iMG)');
    assert.ok(r.log.activity.some((line) => /Fertilidust|airborne/i.test(line)), 'its line');
    assert.equal(target('patch:0').state.maturity, 5, 'the page never grows a shared Patch tree itself');
    assert.equal(r.world[OLD_MAIN].features.patches.plots['trant_spice_dead:0']?.fertilidustAt, undefined, 'nor revives a shared dead one');
    // The server's word lands as patches, for everyone.
    change(r, { 'patch:0': spiceTree({ maturity: 6, health: 10, fruit: 12 }), 'trant_spice_dead:0': { class: 'trant_spice_dead', kind: 'patch', stage: 'tree', since: now(), tree: { class: 'trant_spice', maturity: 4, health: 5, fruit: 0, cap: 10 } } });
    await tick();
    assert.equal(target('patch:0').state.maturity, 6);
    assert.equal(target('trant_spice_dead:0').classId, 'trant_spice');
  });

  it('Fertilidust Lite on a shared Patch tree names it by its plot key; still connecting, nothing is used', async () => {
    const r = await shared({ 'patch:0': spiceTree() });
    assert.equal(runPowder(r.engine, 'fertilidust_lite'), 'fertilidust_lite:asked');
    const asked = r.sent.filter((m) => m.t === 'obj_dust').at(-1);
    assert.equal(asked.id, 'patch:0');
    r.client.emit('msg:obj_dust_used', { t: 'obj_dust_used', req: asked.req, c: 'fertilidust_lite' });
    await tick();
    assert.match(powdersFeature._state().last, /^fertilidust_lite:tree:trant_spice:granted$/);
    assert.equal(target('patch:0').state.maturity, 5, 'grown by the server, not here');
    // Connecting: the jar is not used and nothing is asked.
    r.client.state = 'connecting';
    r.sent.length = 0;
    const before = powdersFeature._state().charges;
    assert.equal(runPowder(r.engine, 'fertilidust_lite'), 'fertilidust_lite:shared-patch-wait');
    assert.equal(r.sent.length, 0);
    assert.deepEqual(powdersFeature._state().charges, before);
    r.client.state = 'online';
  });

  it('Trantsformation Fluid on a shared Patch tree asks the server (patch_act trantsform); its go-ahead spends the bottle, the new tree is the server\'s', async () => {
    const r = await shared({ 'patch:0': spiceTree({ maturity: 7, health: 8 }) });
    const rows = potionsFeature.packVerbs('potion_trantsformation_fluid', r.engine);
    assert.equal(rows[0].enabled, true, 'no refusal on a shared Patch tree any more');
    potionsFeature.runPackVerb('potion_trantsformation_fluid', 'pour', r.engine);
    potionsFeature._complete(r.engine);
    const asked = lastAct(r);
    assert.deepEqual({ verb: asked.verb, id: asked.id }, { verb: 'trantsform', id: 'patch:0' });
    assert.equal(potionsFeature._state().last, 'potion_trantsformation_fluid:asked');
    assert.equal(r.engine.inv.potion_trantsformation_fluid, 1, 'nothing used yet');
    assert.equal(target('patch:0').classId, 'trant_spice', 'nothing changed here yet');
    const use = { op: 'use-00000000000000c1', c: 'potion_trantsformation_fluid', left: 0, spent: true };
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'trantsform', now: now(), from: 'trant_spice', to: 'trant_fruit', use, before: spiceTree({ maturity: 7, health: 8 }), plot: { class: 'patch', kind: 'patch', stage: 'tree', since: now(), tree: { class: 'trant_fruit', maturity: 4, health: 4, fruit: 0, cap: 8 } } });
    await tick();
    assert.equal(target('patch:0').classId, 'trant_fruit', 'the server\'s new tree');
    assert.equal(target('patch:0').state.maturity, 4);
    assert.deepEqual(r.receipts, ['use-00000000000000c1'], 'the emptied bottle, once, through the ledger');
    assert.equal(r.engine.inv.potion_trantsformation_fluid || 0, 0, 'the ledger\'s last pour empties it here too');
    assert.ok(r.log.toasts.some((line) => /The Spice Plant is now a Fruit Tree\./.test(line)), r.log.toasts.join(' | '));
    assert.ok(r.log.achievements.includes('potions_used:potion_trantsformation_fluid:1'));
  });

  it('a refused trantsform (rooked, too weak) shows the server\'s line and uses nothing', async () => {
    const r = await shared({ 'patch:0': spiceTree({ maturity: 7, health: 8 }) });
    potionsFeature.runPackVerb('potion_trantsformation_fluid', 'pour', r.engine);
    potionsFeature._complete(r.engine);
    const asked = lastAct(r);
    r.client.emit('msg:patch_no', { t: 'patch_no', req: asked.req, id: 'patch:0', verb: 'trantsform', code: 'rooked', message: "It's rooked. Revive it first.", now: now(), plot: spiceTree({ maturity: 7, health: 8 }) });
    await tick();
    assert.equal(r.log.toasts.at(-1), "It's rooked. Revive it first.");
    assert.equal(r.engine.inv.potion_trantsformation_fluid, 1);
    assert.equal(target('patch:0').classId, 'trant_spice');
  });

  it('dark or solo: the same tree is the page\'s own, every hook answers null', async () => {
    for (const opts of [{ mode: 'solo' }, { mode: 'multiplayer', dark: true }]) {
      const r = rig(opts);
      r.world[OLD_MAIN].features.patches.plots = { 'patch:0': { classTsid: 'patch', kind: 'patch', stage: 'tree', tree: { classId: 'trant_spice', state: { maturity: 5, health: 7, fruitCount: 6 } } } };
      restore = await boot(r, { flag: !opts.dark });
      const t = target('patch:0');
      assert.equal(t.grownFromBean, true);
      assert.equal(t.sharedPatch, undefined);
      assert.equal(sharedPatchesFeature.runVerbOverride(t, 'pet', r.engine), null);
      assert.equal(sharedPatchesFeature.sharedPatchTreeVerb(t, 'treepoison:poison', r.engine), null);
      assert.equal(sharedPatchesFeature.sharedPatchTree(t, r.engine), null);
      assert.equal(rookKeyFor(t), '');
      r.engine.executeVerb(t, 'pet');
      assert.equal(acts(r).length, 0);
      assert.equal(r.runs.length, 1, 'pet runs here at once, as before');
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Every grownFromBean branch (plan section 15), solo and shared
// ---------------------------------------------------------------------------

describe('every grownFromBean branch keeps its solo path and takes the shared one only for a shared Patch tree', () => {
  const src = (p) => read(`public/${p}`);

  it('street-objects-feature: Patch trees are never street objects (lines 293, 598, 692)', () => {
    const s = src('js/features/street-objects-feature.js');
    assert.match(s, /t\.classId === 'wood_tree' && !t\.grownFromBean && t\.state\)/);
    assert.match(s, /Number\.isInteger\(target\.treeIndex\) && !target\.grownFromBean/);
    assert.match(s, /target\.classId === 'wood_tree' && !target\.grownFromBean && target\.state\) \{/);
    const solo = { classId: 'trant_spice', grownFromBean: true, state: { maturity: 5 }, sprite: {} };
    const sharedTree = { ...solo, sharedPatch: 'patch:0' };
    const engine = { mode: 'multiplayer', query: () => null };
    assert.equal(streetObjectsFeature.sharedTree(solo, engine), null);
    assert.equal(streetObjectsFeature.sharedTree(sharedTree, engine), null, 'shared-patches-feature\'s, not street-objects\'');
  });

  it('tree-death-feature: solo Patch trees die here and on the page\'s clock; shared ones only by the server (lines 328, 412, 442, 719)', () => {
    const s = src('js/features/tree-death-feature.js');
    assert.match(s, /function sharedPatchTree\(engine, target\) \{\n  if \(engine\?\.mode !== 'multiplayer' \|\| !target\?\.grownFromBean \|\| !target\.sharedPatch\) return false;/);
    assert.match(s, /if \(engine\?\.mode !== 'multiplayer' \|\| !engine\.query\?\.\('realtimeClient'\) \|\| target\?\.grownFromBean\) return false;/, 'street trees: unchanged');
    assert.match(s, /if \(sharedPatchTree\(engine, target\)\) return null;\n  if \(target\.grownFromBean\) \{\n    cureTreePoison\(target\.state\);\n    result = patchesFeature\.killTree\(engine, target\);/);
    assert.match(s, /if \(!isTreeTarget\(target\) \|\| target\.grownFromBean\) continue;/, 'hideReplacedTrees: unchanged');
    assert.match(s, /if \(engine\?\.mode !== 'multiplayer' \|\| !isTreeTarget\(target\) \|\| target\.grownFromBean\) return null;/, 'sharedTreeDied: unchanged');
    assert.match(s, /const hook = target\.grownFromBean \? 'sharedPatchTreeVerb' : 'sharedObjectVerb';/);
  });

  it('potions-feature: a solo Patch tree trantsforms in its plot; a shared one asks the server', () => {
    const s = src('js/features/potions-feature.js');
    assert.match(s, /      return \{ ok: true, asked: true \};\n    \}\n    if \(target\.grownFromBean\) \{\n      const plots = engine\.streetSlot\('patches'\)\?\.plots \|\| \{\};\n      const plot = Object\.values\(plots\)\.find\(\(row\) => row\?\.tree\?\.state === target\.state\);\n      if \(!plot\) return \{ ok: false \};\n      trantsformPlotTree\(plot, out, now\(\)\);/);
    assert.doesNotMatch(s, /LATER_LINE/);
    assert.match(s, /case 'potion_trantsformation_fluid': \{\n      const target = closestTree\(engine\);\n      return \{ \.\.\.trantsformCheck\(target\), target \};/, 'canPour as before, shared or not');
  });

  it('game.js refreshTreeVisual: Patch trees redraw themselves, shared or not (lines 12086-12088, unchanged)', () => {
    const s = src('game.js');
    assert.match(s, /if \(target\?\.classId === 'wood_tree' && !target\.grownFromBean\) return refreshWoodTreeVisual\(target\);/);
    assert.match(s, /if \(!meta \|\| !target\.sprite \|\| !target\.state \|\| target\.grownFromBean\) return;/);
  });

  it('powders-feature: solo Patch trees still take Fertilidust here; only sharedPatch ones are left to the server', () => {
    const s = src('js/features/powders-feature.js');
    assert.match(s, /function inSharedPatch\(t\) \{\n  return Boolean\(t\?\.sharedPatch\);\n\}/);
    assert.match(s, /function ownTrees\(targets\) \{\n  return targets\.filter\(\(t\) => !inSharedPatch\(t\)\);\n\}/);
    assert.match(s, /const dead = reviveDeadTrees\(engine, ownTrees\(deadTargets\)\)/);
    assert.match(s, /if \(own\.length\) later\(3000, \(\) => fertilize\(engine, own\)\);/);
    assert.match(s, /if \(!shared\) later\(3000, \(\) => fertilize\(engine, \[out\.tree\.target\]\)\);/);
    assert.doesNotMatch(s, /LATER_LINE/);
  });

  it('rook-attack-feature: a wing beat strips this page\'s copy of a tree, but never a shared Patch tree\'s (the server\'s "patches" carry it)', () => {
    const s = src('js/features/rook-attack-feature.js');
    assert.match(s, /hits\.has\(e\.key\) && TRANT_META\[e\.classId\] && e\.target\.state && !e\.target\.sharedPatch\) rookTrantState/);
    assert.match(s, /if \(entry && TRANT_META\[entry\.classId\] && entry\.target\.state\) rookTrantState\(entry\.target\.state\);/, 'solo: unchanged');
  });

  it('street-objects-feature: Fertilidust asks for shared Patch trees, never for solo ones', () => {
    const solo = { classId: 'trant_spice', grownFromBean: true, state: { maturity: 5 }, sprite: {} };
    assert.equal(streetObjectsFeature.sharedFertilize([solo], false, { mode: 'multiplayer', query: () => null }), null);
    assert.equal(streetObjectsFeature.sharedFertilize([{ ...solo, sharedPatch: 'patch:0' }], false, { mode: 'solo', query: () => null }), null);
  });
});
