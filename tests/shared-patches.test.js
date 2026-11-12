/**
 * G564: shared street Patches online (js/shared-patches.js,
 * js/features/shared-patches-feature.js, the hook in patches-feature.js; the
 * realtime server's patches.go). Dark: off unless the release switch or this
 * browser's QA flag turns it on. Solo, homes and every street the server
 * doesn't share keep their own plots: tests/patches.test.js,
 * tests/patches-feature.test.js and tests/tree-death.test.js are untouched and
 * still pass, and the hooks here answer null everywhere else.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import { createPlot, performPlotVerb } from '../public/js/patches.js?v=61abc5fe';
import {
  BUSY_LINE,
  COPY,
  REFUSAL_LINES,
  SHARED_PATCHES_ON,
  SHARED_PATCHES_QA_KEY,
  applyPatchPlot,
  isSharedKey,
  keyClass,
  localPatchPlot,
  mayAskStreet,
  plainWords,
  plantGrowLevel,
  refusalLine,
  CLEARED_FIRST_LINE,
  refusedBeforeBar,
  replayRng,
  sharedPatchesOn,
  soilRolls,
  stripSharedPlots,
} from '../public/js/shared-patches.js?v=ac409c57';
import { sharedPatchesFeature } from '../public/js/features/shared-patches-feature.js?v=a213c7e5';
import { patchesFeature, soilSpawnPlan } from '../public/js/features/patches-feature.js?v=d405f1a4';
import { FEATURES } from '../public/js/features/index.js?v=0816f9aa';
import { getStreetEcologyCatalog, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=26dabe26';
import { HAS_SERVER, serverPath } from '../tools/repos.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const OLD_MAIN = 'GM4103L52ID23';
const OTHER = 'GA5101HF7F429V5';
const settle = () => new Promise((res) => setTimeout(res, 2700));
const tick = () => new Promise((res) => setTimeout(res, 15));

describe('the switch and the streets', () => {
  it('is on since the release switch flipped (v0.24.0); with the switch off only the QA flag turns it on', () => {
    assert.equal(SHARED_PATCHES_ON, true, 'game v0.24.0 turned shared street Patches on');
    assert.equal(SHARED_PATCHES_QA_KEY, 'groddle.qa.sharedPatches');
    assert.equal(sharedPatchesOn(null), true, 'the release switch');
    assert.equal(sharedPatchesOn(null, false), false);
    assert.equal(sharedPatchesOn({ getItem: () => null }, false), false);
    assert.equal(sharedPatchesOn({ getItem: (k) => (k === SHARED_PATCHES_QA_KEY ? '1' : null) }, false), true);
    assert.equal(sharedPatchesOn({ getItem: () => { throw new Error('blocked'); } }, false), false, 'blocked storage stays off');
    assert.equal(sharedPatchesOn({ getItem: (k) => (k === SHARED_PATCHES_QA_KEY ? '0' : null) }), false, "the QA flag '0' keeps them off with the switch on");
    assert.equal(sharedPatchesOn({ getItem: () => { throw new Error('blocked'); } }), true, 'blocked storage follows the switch');
  });

  it('asks only about public streets: never a home, a room, a party or any private place', () => {
    assert.ok(mayAskStreet(OLD_MAIN));
    assert.ok(mayAskStreet('GLI2V0UN7RD1T2J'));
    for (const t of ['HOME_7', 'HOUSE_7', 'PARTY_3', 'GA5_1', 'NB_dorrit', '', null]) assert.ok(!mayAskStreet(t), String(t));
  });

  it('plot ids are the page\'s own keys; demo plots are never shared', () => {
    for (const k of ['patch:0', 'patch_dark:1', 'trant_spice_dead:0', 'tree:12']) assert.ok(isSharedKey(k), k);
    for (const k of ['demo:1', 'demo:tree', 'patch', 'tree:x', 'seed:1']) assert.ok(!isSharedKey(k), k);
    assert.equal(keyClass('patch_dark:2'), 'patch_dark');
    assert.equal(keyClass('trant_egg_dead:0'), 'trant_egg_dead');
    assert.equal(keyClass('tree:3'), null);
  });
});

describe('a server plot on the page', () => {
  const now = 1_000_000;

  it('a plot the server didn\'t name is fresh: weeds, or the layout\'s dead tree', () => {
    const weeds = localPatchPlot('patch:0', null, 0, now);
    assert.equal(weeds.stage, 'dirty');
    assert.equal(weeds.kind, 'patch');
    const dark = localPatchPlot('patch_dark:0', null, 0, now);
    assert.equal(dark.kind, 'patch_dark');
    const dead = localPatchPlot('trant_spice_dead:0', null, 0, now);
    assert.equal(dead.stage, 'dead');
    assert.equal(dead.deadClass, 'trant_spice_dead');
    assert.equal(dead.classTsid, 'trant_spice_dead');
  });

  it('a Seedling on the page\'s own clock, with the planter and the grow level', () => {
    const p = localPatchPlot('patch:1', { class: 'patch', kind: 'patch', stage: 'seedling', since: 5000, seedling: { tree: 'trant_spice', bean: 'bean_spice', plantedAt: 5000, minAt: 305000, maxAt: 14405000, petted: 2, planter: 7, grow: 3, thirdAt: 0 } }, 2000, now);
    assert.equal(p.stage, 'seedling');
    assert.equal(p.since, 3000);
    assert.equal(p.seedling.minAt, 303000);
    assert.equal(p.seedling.petted, 2);
    assert.equal(p.seedling.upgradeGrowLevel, 3);
    assert.equal(p.seedling.growLevel, 0, 'until the third petting');
    assert.equal(p.planter, 7);
  });

  it('a tree keeps its state object (targets hold it) while the server\'s numbers land in it', () => {
    const plot = localPatchPlot('patch:0', { stage: 'tree', tree: { class: 'trant_spice', maturity: 3, health: 7, fruit: 0, cap: 6, petted: false } }, 0, now);
    const state = plot.tree.state;
    state.harvestsToday = 1;
    applyPatchPlot(plot, 'patch:0', { stage: 'tree', tree: { class: 'trant_spice', maturity: 4, health: 8, fruit: 9, cap: 12, petted: true, watered: true } }, 0, now);
    assert.equal(plot.tree.state, state, 'same object');
    assert.equal(state.maturity, 4);
    assert.equal(state.fruitCount, 9);
    assert.equal(state.petted, true);
    assert.equal(state.harvestsToday, 1, 'this player\'s own harvests stay the page\'s');
    const wood = localPatchPlot('patch:2', { stage: 'tree', tree: { class: 'wood_tree', maturity: 5, count: 1 } }, 0, now);
    assert.equal(wood.tree.classId, 'wood_tree');
    assert.equal(wood.tree.state.maturity, 5);
    assert.equal(wood.tree.state.harvestCount, 1);
    const poisoned = localPatchPlot('patch:3', { stage: 'tree', tree: { class: 'trant_bean', maturity: 2, poison: 90000, by: 9 } }, 0, now);
    assert.equal(poisoned.poisonUntil, now + 90000);
    assert.equal(poisoned.poisonBy, 9);
  });

  it('dead trees, a cleared Dead Egg Plant\'s Dark Patch, someone tending, someone digging', () => {
    const dead = localPatchPlot('tree:4', { class: 'trant_bean_dead', kind: 'patch', stage: 'dead', dead: 'trant_bean_dead', x: 400, y: 900 }, 0, now);
    assert.equal(dead.stage, 'dead');
    assert.equal(dead.classTsid, 'trant_bean_dead');
    const dark = localPatchPlot('trant_egg_dead:0', { class: 'patch_dark', kind: 'patch_dark', stage: 'dirty' }, 0, now);
    assert.equal(dark.stage, 'dirty');
    assert.equal(dark.kind, 'patch_dark');
    const tended = localPatchPlot('patch:0', { stage: 'dirty', tender: 9, lockLeft: 8000, diggers: [11] }, 0, now);
    assert.equal(tended.tender, 9);
    assert.equal(tended.lockUntil, now + 8000);
    assert.deepEqual(tended.diggers, [11]);
    applyPatchPlot(tended, 'patch:0', { stage: 'clean', due: now + 90000 }, 0, now);
    assert.equal(tended.stage, 'clean');
    assert.ok(!('tender' in tended) && !('diggers' in tended), 'the lock goes with the server\'s word');
  });

  it('another player\'s work refuses tend and dig before the bar, with the original\'s line', () => {
    const plot = { stage: 'dirty', tender: 9, lockUntil: now + 5000 };
    assert.equal(BUSY_LINE, 'Someone else is already working on this patch.');
    assert.equal(refusedBeforeBar(plot, 'tend', 7, now), BUSY_LINE);
    assert.equal(refusedBeforeBar(plot, 'dig', 7, now), BUSY_LINE);
    assert.equal(refusedBeforeBar(plot, 'tend', 9, now), null, 'your own lock');
    assert.equal(refusedBeforeBar(plot, 'tend', 7, now + 6000), null, 'a lapsed lock');
    assert.equal(refusedBeforeBar({ stage: 'dirty', diggers: [9] }, 'tend', 7, now), BUSY_LINE, 'nobody tends while someone digs');
    assert.equal(refusedBeforeBar({ stage: 'dirty', diggers: [9] }, 'dig', 7, now), null, 'several may dig');
    assert.equal(refusedBeforeBar(null, 'tend', 7, now), null);
  });

  it('refusals read in plain player words, with no dashes for punctuation', () => {
    assert.equal(refusalLine('busy', ''), BUSY_LINE);
    assert.equal(refusalLine('planted', '', 'dig'), 'A seedling is growing - why would you dig it out?');
    assert.equal(refusalLine('planted', '', 'plant:bean_spice'), "There's already a seedling here.");
    assert.equal(refusalLine('enough', ''), "That's enough, thnx.");
    assert.equal(refusalLine('nothing', "There's nothing here to clear.", 'clear'), CLEARED_FIRST_LINE, 'the first clear won');
    assert.equal(refusalLine('nothing', ''), "There's nothing here to clear.");
    assert.equal(refusalLine('weeds', 'You should probably tend to the weeds first.'), 'You should probably tend to the weeds first.');
    assert.equal(refusalLine('whatever', ''), 'Not now.');
    assert.equal(plainWords('One \u2014 two \u2013 three'), 'One, two, three');
    assert.equal(refusalLine('far', 'Closer \u2014 please'), 'Closer, please');
    for (const line of [...Object.values(REFUSAL_LINES), ...Object.values(COPY)]) assert.ok(!/[\u2014\u2013]/.test(line), line);
    assert.ok(!/[\u2014\u2013]/.test(read('public/js/shared-patches.js').replace(/\\u201[34]/g, '')), 'no em or en dash in the module');
    assert.ok(!/[\u2014\u2013]/.test(read('public/js/features/shared-patches-feature.js')), 'no em or en dash in the feature');
  });
});

describe('the page\'s own rolls replay the same way (js/patches.js performPlotVerb)', () => {
  const ctx = (extra = {}) => ({ inv: { hoe: 1, shovel: 1 }, pc: { energy: 100, mood: 50 }, skills: [], upgrades: [], buffs: [], toolState: null, hubId: 27, now: 5000, ...extra });

  it('tend: the 90% success roll without Soil Appreciation', () => {
    const fail = soilRolls('tend', {}, () => 0.95);
    assert.deepEqual(fail.rolls, [0.95]);
    assert.equal(fail.success, false);
    const plot = createPlot('patch', { now: 0 });
    const r = performPlotVerb(plot, 'tend', ctx({ rng: replayRng(fail.rolls, () => 0.5) }));
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'roll');
    assert.equal(plot.stage, 'dirty');
    const pass = soilRolls('tend', {}, () => 0.2);
    assert.equal(pass.success, true);
    assert.equal(pass.skill, '');
    const ok = performPlotVerb(plot, 'tend', ctx({ rng: replayRng(pass.rolls, () => 0.99) }));
    assert.equal(ok.ok, true);
    assert.equal(plot.stage, 'clean');
    // With Soil Appreciation I there is no roll (100%), and the skill goes to the server.
    const ranked = soilRolls('tend', { skills: ['soil_appreciation_1'] }, () => 0.99);
    assert.deepEqual(ranked.rolls, []);
    assert.equal(ranked.success, true);
    assert.equal(ranked.skill, 'soil_appreciation_1');
  });

  it('dig: the Loam roll, and a drop means no Earth receipt', () => {
    const skills = ['soil_appreciation_1', 'soil_appreciation_2'];
    const drop = soilRolls('dig', { skills }, () => 0.01);
    assert.equal(drop.drop, true);
    assert.equal(drop.skill, 'soil_appreciation_2');
    const plotA = createPlot('patch', { now: 0 });
    const a = performPlotVerb(plotA, 'dig', ctx({ skills, rng: replayRng(drop.rolls, () => 0.5) }));
    assert.deepEqual(a.outputs.map((o) => o.classTsid), ['loam']);
    const earth = soilRolls('dig', { skills }, () => 0.99);
    assert.equal(earth.drop, false);
    const plotB = createPlot('patch', { now: 0 });
    const b = performPlotVerb(plotB, 'dig', ctx({ skills, rng: replayRng(earth.rolls, () => 0.5) }));
    assert.deepEqual(b.outputs, [{ classTsid: 'earth', qty: 3 }]);
    assert.deepEqual(soilRolls('dig', {}, () => 0.01), { rolls: [], success: true, drop: false, skill: '' }, 'no skill: no Loam roll');
    assert.equal(soilRolls('dig', { skills, buffs: ['max_luck'] }, () => 0.99).drop, true, 'Max Luck always drops');
  });

  it('the planter\'s grow card level', () => {
    assert.equal(plantGrowLevel([]), 0);
    assert.equal(plantGrowLevel(['soil_appreciation_bean_grow_1']), 3);
    assert.equal(plantGrowLevel(['soil_appreciation_bean_grow_2']), 4);
  });

  it('the save\'s old plots for a shared street go; demo plots stay', () => {
    const slot = { plots: { 'patch:0': {}, 'trant_spice_dead:0': {}, 'tree:4': {}, 'demo:1': {} }, adopted: { 'tree:4': { x: 1, y: 2 } } };
    assert.equal(stripSharedPlots(slot), 3);
    assert.deepEqual(Object.keys(slot.plots), ['demo:1']);
    assert.deepEqual(slot.adopted, {});
    assert.equal(stripSharedPlots(null), 0);
  });
});

describe('the server\'s layout agrees with the page', { skip: !HAS_SERVER || !existsSync(serverPath('data', 'patches.json')) ? 'no server data/patches.json' : false }, () => {
  it('every street is shared (no pilot list), and Old Main Street\'s plot keys are the ones this page plans', () => {
    const data = JSON.parse(readFileSync(serverPath('data', 'patches.json'), 'utf8'));
    assert.equal(data.pilot, null, 'slice 3: every street at once (Austin 2026-11-08)');
    const street = data.streets[OLD_MAIN];
    const keys = street.plots.map((p) => p[0]).sort();
    assert.deepEqual(keys, ['patch:0', 'patch:1', 'patch:2', 'patch:3', 'trant_spice_dead:0']);
    for (const [, s] of Object.entries(data.streets)) for (const p of s.plots) assert.ok(isSharedKey(p[0]), p[0]);
    // The page's own plan for the street names the same keys from the same counts.
    const plan = soilSpawnPlan({ patch: 4, trant_spice_dead: 1 }, (key) => (key === 'soil:patch' ? [1, 2, 3, 4] : [5]).map((x) => ({ x, y: 0 })));
    assert.deepEqual(plan.map((p) => p.key).sort(), keys);
  });

  it('the builder\'s --check passes when the game has it (tools/build-realtime-patches.mjs)', { skip: !existsSync(new URL('../tools/build-realtime-patches.mjs', import.meta.url)) ? 'builder not landed' : false }, () => {
    const out = spawnSync(process.execPath, ['tools/build-realtime-patches.mjs', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr || out.stdout);
  });
});

// ---------------------------------------------------------------------------
// The feature, with patches-feature, on a fake page
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

function rig({ flag = true, street = OLD_MAIN, mode = 'multiplayer', savePlots = null } = {}) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    street,
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
  const world = {
    [OLD_MAIN]: { features: { patches: { plots: savePlots || { 'patch:0': { classTsid: 'patch', kind: 'patch', stage: 'tree', tree: { classId: 'trant_bean', state: { maturity: 9 } } }, 'demo:1': { classTsid: 'patch', stage: 'dirty' } } } } },
    [OTHER]: { features: { patches: { plots: { 'patch:0': { classTsid: 'patch', kind: 'patch', stage: 'clean' } } } } },
  };
  const receipts = [];
  const log = { toasts: [], activity: [], achievements: [], sounds: [] };
  const interactables = [];
  const engine = {
    mode,
    started: true,
    PIXI,
    streetTsid: street,
    street: { tsid: street, hubId: '27' },
    inv: { hoe: 1, shovel: 1, hatchet: 1, bean_spice: 2 },
    pc: { energy: 90, mood: 50, imaginationUpgrades: [] },
    learnedSkills: [],
    toolState: null,
    player: { x: 600, y: 970 },
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
    achievement(c, n) { log.achievements.push(`${c}:${n}`); },
    refreshPack() {},
    save() {},
    param: () => null,
    activeBuffIds: () => [],
    placement: (key) => (key === 'soil:patch' ? [660, 1752, 2654, 5102].map((x) => ({ x, y: 970 })) : key === 'soil:trant_spice_dead' ? [{ x: 3726, y: 950 }] : []),
    streetSlot: (id) => {
      const s = (world[engine.streetTsid] ||= {});
      s.features ||= {};
      return (s.features[id] ||= {});
    },
    streetWorld: (tsid) => world[tsid],
    register(t) { interactables.push(t); return t; },
    unregister(t) { const i = interactables.indexOf(t); if (i >= 0) interactables.splice(i, 1); },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return mode === 'multiplayer' ? client : null;
      if (hook === 'ledgerReceipt') { receipts.push(args[0]); return true; }
      if (hook === 'sharedPatchPlots') return sharedPatchesFeature.sharedPatchPlots(...args);
      if (hook === 'sharedPatchVerb') return sharedPatchesFeature.sharedPatchVerb(...args);
      return null;
    },
  };
  return { engine, client, sent, world, receipts, log, interactables };
}

/** Boot the two features as game.js does, enter the street, and let the views build. */
async function boot(r, { flag = true } = {}) {
  const prevPixi = globalThis.PIXI;
  globalThis.PIXI = PIXI;
  const store = new Map([[SHARED_PATCHES_QA_KEY, flag ? '1' : '0']]);
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null } };
  sharedPatchesFeature._reset();
  sharedPatchesFeature.restore(undefined, r.engine);
  sharedPatchesFeature.init(r.engine);
  patchesFeature.onStreetClear();
  patchesFeature.onStreetEnter(r.engine.street, r.engine);
  sharedPatchesFeature.onTick(16, 0, r.engine);
  await tick();
  await tick();
  return () => { globalThis.PIXI = prevPixi; delete globalThis.window; };
}

const target = (r, key) => patchesFeature.entityByKey(key)?.target;
const stage = (key) => patchesFeature.entityByKey(key)?.plot?.stage;
const snapshot = (r, plots = {}, extra = {}) => r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, snap: true, now: Date.now(), timers: { clean: 90000 }, plots, ...extra });
const lastAct = (r) => r.sent.filter((m) => m.t === 'patch_act').at(-1);

describe('the feature', () => {
  let ecology;
  let restore = () => {};
  before(() => {
    ecology = getStreetEcologyCatalog();
    setStreetEcologyCatalog({ ...(ecology || {}), soil: { [OLD_MAIN]: { patch: 4, trant_spice_dead: 1 }, [OTHER]: { patch: 1 } } });
  });
  after(() => {
    setStreetEcologyCatalog(ecology);
    restore();
  });

  it('sits before street-objects, once, and asks game.js and patches-feature only through hooks', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.equal(ids.filter((id) => id === 'shared-patches').length, 1);
    assert.ok(ids.indexOf('shared-patches') < ids.indexOf('street-objects'));
    assert.ok(ids.indexOf('shared-patches') > ids.indexOf('patches'));
    const src = read('public/js/features/patches-feature.js');
    assert.match(src, /engine\.query\?\.\('sharedPatchPlots', engine\.streetTsid, engine\)/);
    assert.match(src, /engine\.query\?\.\('sharedPatchVerb', near\.target, `plant:\$\{classTsid\}`, engine\) === true/);
    assert.match(src, /if \(lastSoilCounts \|\| engine\?\.mode !== 'multiplayer'\) return null;/, 'homes and solo never ask');
  });

  it('dark (no QA flag): every hook answers null, nothing is asked, the save\'s own plots show', async () => {
    const r = rig();
    restore = await boot(r, { flag: false });
    assert.equal(r.sent.length, 0);
    assert.equal(sharedPatchesFeature.sharedPatchPlots(OLD_MAIN, r.engine), null);
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'tend', r.engine), null);
    assert.equal(stage('patch:0'), 'tree', 'the save\'s own tree');
    assert.ok(!target(r, 'patch:0').sharedPatch);
    assert.equal(r.engine.data.sharedPatches, `${OLD_MAIN}:off`);
    assert.equal(sharedPatchesFeature.save(), undefined);
    restore();
  });

  it('solo: never shared, even with the flag', async () => {
    const r = rig({ mode: 'solo' });
    restore = await boot(r);
    assert.equal(sharedPatchesFeature.sharedPatchPlots(OLD_MAIN, r.engine), null);
    assert.equal(stage('patch:0'), 'tree');
    assert.equal(r.sent.length, 0);
    restore();
  });

  it('with the flag: asks on join, holds verbs until the snapshot, then draws the server\'s plots and drops the old copies', async () => {
    const r = rig();
    restore = await boot(r);
    assert.deepEqual(r.sent.map((m) => m.t), ['patch_sync']);
    // Before the snapshot: the plots are this feature's (fresh), never the save's tree.
    assert.equal(stage('patch:0'), 'dirty');
    assert.equal(stage('trant_spice_dead:0'), 'dead');
    assert.equal(target(r, 'patch:0').sharedPatch, 'patch:0');
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'tend', r.engine), true);
    assert.equal(r.log.toasts.at(-1), COPY.connecting);
    assert.ok(r.world[OLD_MAIN].features.patches.plots['patch:0'], 'not dropped before the server says it shares the street');
    snapshot(r, {
      'patch:1': { class: 'patch', kind: 'patch', stage: 'seedling', since: Date.now(), seedling: { tree: 'trant_spice', bean: 'bean_spice', plantedAt: Date.now(), minAt: Date.now() + 300000, maxAt: Date.now() + 1e7, petted: 1, planter: 9, grow: 0 } },
      'patch:2': { class: 'patch', kind: 'patch', stage: 'tree', tree: { class: 'trant_spice', maturity: 4, health: 7, fruit: 3, cap: 9 } },
      'tree:6': { class: 'trant_bean_dead', kind: 'patch', stage: 'dead', dead: 'trant_bean_dead', x: 1200, y: 960 },
    });
    await tick();
    assert.equal(r.engine.data.sharedPatches, `${OLD_MAIN}:snap`);
    assert.equal(stage('patch:1'), 'seedling');
    assert.equal(stage('patch:2'), 'tree');
    assert.equal(target(r, 'patch:2').grownFromBean, true, 'a server tree is an ordinary tree target');
    assert.equal(target(r, 'patch:2').sharedPatch, 'patch:2');
    assert.equal(target(r, 'patch:2').state.maturity, 4);
    assert.equal(stage('tree:6'), 'dead', 'a dead street tree\'s plot comes from the server, with its spot');
    assert.equal(patchesFeature.entityByKey('tree:6').x, 1200);
    // The old copies on this street went; demo plots and other streets kept theirs.
    assert.deepEqual(Object.keys(r.world[OLD_MAIN].features.patches.plots), ['demo:1']);
    assert.ok(r.world[OTHER].features.patches.plots['patch:0']);
    assert.equal(r.engine.data.sharedPatchesStripped, `${OLD_MAIN}:1`);
    // A change from someone else: the Seedling grew. The tree draws, and the save holds none of it.
    r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, now: Date.now(), plots: { 'patch:1': { class: 'patch', kind: 'patch', stage: 'tree', tree: { class: 'trant_spice', maturity: 1, health: 7, fruit: 0, cap: 0 } } } });
    await tick();
    assert.equal(stage('patch:1'), 'tree');
    assert.ok(r.log.activity.includes('A Seedling grew into a Spice Plant!'));
    assert.deepEqual(Object.keys(r.world[OLD_MAIN].features.patches.plots), ['demo:1']);
    // The server grows shared plots; patches-feature's tick never does.
    const e = patchesFeature.entityByKey('patch:0');
    e.plot.stage = 'clean';
    e.plot.dueAt = Date.now() - 1;
    patchesFeature.onTick(16, Date.now() + 1000, r.engine);
    assert.equal(e.plot.stage, 'clean', 'no local regrowth on a shared plot');
    restore();
  });

  it('"none": the save\'s own plots, kept, and nothing asked of the server for them', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {}, { none: true });
    await tick();
    assert.equal(r.engine.data.sharedPatches, `${OLD_MAIN}:none`);
    assert.equal(stage('patch:0'), 'tree', 'the save\'s own tree again');
    assert.ok(!target(r, 'patch:0').sharedPatch);
    assert.ok(r.world[OLD_MAIN].features.patches.plots['patch:0'], 'not dropped');
    assert.equal(sharedPatchesFeature.sharedPatchPlots(OLD_MAIN, r.engine), null);
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'tend', r.engine), null);
    restore();
  });

  it('a server without patches.go (bad_frame): back to the save\'s own plots', async () => {
    const r = rig();
    restore = await boot(r);
    r.client.emit('error', { code: 'bad_frame', message: 'unknown kind' });
    await tick();
    assert.equal(r.engine.data.sharedPatches, `${OLD_MAIN}:local`);
    assert.equal(stage('patch:0'), 'tree');
    assert.equal(sharedPatchesFeature.sharedPatchPlots(OLD_MAIN, r.engine), null);
    restore();
  });

  it('tend: the bar takes the lock, the landing asks first and applies only on the answer', async (t) => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    const tend = target(r, 'patch:0');
    // Another player holds the lock: refused before the bar.
    r.client.emit('msg:patch_ev', { t: 'patch_ev', street: OLD_MAIN, by: 9, id: 'patch:0', verb: 'tend', do: 'start' });
    assert.equal(sharedPatchesFeature.verbRefusedNow(tend, 'tend', r.engine), BUSY_LINE);
    r.client.emit('msg:patch_ev', { t: 'patch_ev', street: OLD_MAIN, by: 9, id: 'patch:0', verb: 'tend', do: 'stop' });
    assert.equal(sharedPatchesFeature.verbRefusedNow(tend, 'tend', r.engine), null);
    // The bar begins: the lock is asked for.
    sharedPatchesFeature.verbStarted(tend, { id: 'tend' }, r.engine);
    assert.deepEqual(lastAct(r), { t: 'patch_act', req: lastAct(r).req, id: 'patch:0', verb: 'tend', do: 'start' });
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: lastAct(r).req, id: 'patch:0', verb: 'tend', do: 'start', lock: 10000, now: Date.now(), plot: { stage: 'dirty', tender: 7, lockLeft: 10000 } });
    // It lands with a roll that passes: the server is asked, nothing changes yet.
    t.mock.method(Math, 'random', () => 0.2);
    const energy = r.engine.pc.energy;
    assert.equal(sharedPatchesFeature.runVerbOverride(tend, 'tend', r.engine), true);
    const asked = lastAct(r);
    assert.equal(asked.verb, 'tend');
    assert.equal(asked.do, undefined);
    assert.equal(asked.skill, undefined, 'no Soil Appreciation');
    assert.equal(stage('patch:0'), 'dirty');
    assert.equal(r.engine.pc.energy, energy);
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'tend', now: Date.now(), before: { stage: 'dirty', tender: 7, lockLeft: 9000 }, plot: { stage: 'clean', since: Date.now(), due: Date.now() + 90000 } });
    await tick();
    assert.equal(stage('patch:0'), 'clean');
    assert.equal(r.engine.pc.energy, energy - 5, 'the page\'s energy, once');
    assert.ok(r.log.achievements.includes('patches:tended:1'));
    assert.equal(r.engine.data.sharedPatchesLast, 'patch:0:tend:ok');
    // A refusal: the line, the failure sound, and the server's plot.
    sharedPatchesFeature.verbStarted(target(r, 'patch:3'), { id: 'tend' }, r.engine);
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:3'), 'tend', r.engine), true);
    const second = lastAct(r);
    r.client.emit('msg:patch_no', { t: 'patch_no', req: second.req, id: 'patch:3', verb: 'tend', code: 'not_messy', message: 'Nope, no tending needed.', now: Date.now(), plot: { stage: 'dug', since: Date.now(), due: Date.now() + 600000 } });
    await tick();
    assert.equal(stage('patch:3'), 'dug');
    assert.equal(r.log.toasts.at(-1), 'Nope, no tending needed.');
    assert.equal(r.log.sounds.at(-1), 'CLICK_FAILURE');
    assert.equal(r.engine.pc.energy, energy - 5, 'a refusal costs nothing');
    restore();
  });

  it('tend: a failed roll runs here alone, gives the lock back and asks nothing', async (t) => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    t.mock.method(Math, 'random', () => 0.95);
    const n = r.sent.length;
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'tend', r.engine), true);
    assert.deepEqual(r.sent.slice(n).map((m) => `${m.t}:${m.verb}:${m.do}`), ['patch_act:tend:stop']);
    assert.equal(stage('patch:0'), 'dirty');
    assert.equal(r.log.toasts.at(-1), "Oops! That didn't work. Try again?");
    restore();
  });

  it('a verb the page refuses (no hoe) never reaches the server', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    delete r.engine.inv.hoe;
    const n = r.sent.filter((m) => m.t === 'patch_act' && !m.do).length;
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'tend', r.engine), true);
    assert.equal(r.sent.filter((m) => m.t === 'patch_act' && !m.do).length, n);
    assert.equal(r.log.toasts.at(-1), 'You need a working hoe.');
    restore();
  });

  it('dig: the skill and the Loam roll go up; the Earth grant lands once, then the ack after the save', async (t) => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    r.engine.learnedSkills = ['soil_appreciation_1', 'soil_appreciation_2'];
    t.mock.method(Math, 'random', () => 0.99);
    sharedPatchesFeature.verbStarted(target(r, 'patch:1'), { id: 'dig' }, r.engine);
    assert.equal(lastAct(r).do, 'start');
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:1'), 'dig', r.engine), true);
    const asked = lastAct(r);
    assert.equal(asked.skill, 'soil_appreciation_2');
    assert.equal(asked.drop, undefined, 'no Loam this time');
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:1', verb: 'dig', now: Date.now(), before: { stage: 'dirty' }, plot: { stage: 'dug', due: Date.now() + 600000 }, grant: { id: 'pg-dig-1', c: 'earth', n: 3 } });
    await tick();
    assert.equal(stage('patch:1'), 'dug');
    assert.equal(r.engine.inv.earth, 3, 'the dig\'s Earth once, not again for the grant');
    assert.ok(!r.sent.some((m) => m.t === 'patch_ack'), 'the ack waits for the save');
    await settle();
    assert.deepEqual(r.sent.filter((m) => m.t === 'patch_ack').map((m) => m.id), ['pg-dig-1']);
    // The same grant resent on connect: acknowledged again, never added twice.
    r.client.emit('msg:patch_grant', { t: 'patch_grant', id: 'pg-dig-1', c: 'earth', n: 3 });
    await tick();
    assert.equal(r.engine.inv.earth, 3);
    // A grant this page never saw (a lost answer): its items, once.
    r.client.emit('msg:patch_grant', { t: 'patch_grant', id: 'pg-clear-9', c: 'plank', n: 25 });
    r.client.emit('msg:patch_grant', { t: 'patch_grant', id: 'pg-clear-9', c: 'plank', n: 25 });
    await tick();
    assert.equal(r.engine.inv.plank, 25);
    r.client.emit('msg:patch_grant', { t: 'patch_grant', id: 'pg-odd-1', c: 'gem_diamond', n: 3 });
    await tick();
    assert.ok(!r.engine.inv.gem_diamond, 'only Earth, Planks and fruit come as grants');
    assert.deepEqual(sharedPatchesFeature.save().applied, ['pg-dig-1', 'pg-clear-9']);
    // A Loam roll that drops tells the server there is no Earth receipt.
    t.mock.method(Math, 'random', () => 0.01);
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:2'), 'dig', r.engine), true);
    assert.equal(lastAct(r).drop, true);
    restore();
  });

  it('plant: the save first, the bean and the planter\'s grow level up, the ledger\'s take once', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, { 'patch:0': { stage: 'clean', since: Date.now(), due: Date.now() + 90000 } });
    await tick();
    r.engine.pc.imaginationUpgrades = ['soil_appreciation_bean_grow_1'];
    const plant = target(r, 'patch:0');
    assert.equal(sharedPatchesFeature.runVerbOverride(plant, 'plant:bean_spice', r.engine), true);
    assert.equal(r.engine.inv.bean_spice, 2, 'nothing leaves the pack before the answer');
    await tick();
    const asked = lastAct(r);
    assert.deepEqual({ verb: asked.verb, bean: asked.bean, grow: asked.grow }, { verb: 'plant', bean: 'bean_spice', grow: 3 });
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'patch:0', verb: 'plant', now: Date.now(), before: { stage: 'clean' }, use: { spent: true, n: 1, op: 'use-bean-1' }, plot: { stage: 'seedling', seedling: { tree: 'trant_spice', bean: 'bean_spice', plantedAt: Date.now(), minAt: Date.now() + 180000, maxAt: Date.now() + 1e7, petted: 0, planter: 7, grow: 3 } } });
    await tick();
    assert.equal(stage('patch:0'), 'seedling');
    assert.equal(r.engine.inv.bean_spice, 1, 'one bean, once');
    assert.deepEqual(r.receipts, ['use-bean-1']);
    assert.ok(r.log.achievements.includes('patches:planted:1'));
    // From the pack: the same path.
    r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, now: Date.now(), plots: { 'patch:3': { stage: 'clean', due: Date.now() + 90000 } } });
    r.engine.player.x = 5050;
    const n = r.sent.length;
    assert.equal(patchesFeature.runPackVerb('bean_spice', 'plant', r.engine), true);
    await tick();
    assert.deepEqual(r.sent.slice(n).map((m) => `${m.t}:${m.id}:${m.verb}`), ['patch_act:patch:3:plant']);
    assert.equal(r.engine.inv.bean_spice, 1, 'still waiting for the answer');
    restore();
  });

  it('pet a Seedling: the server counts the pettings and says whose quest counts', async () => {
    const r = rig();
    const seedling = (petted, extra = {}) => ({ stage: 'seedling', seedling: { tree: 'trant_spice', bean: 'bean_spice', plantedAt: Date.now() - 400000, minAt: Date.now() - 100000, maxAt: Date.now() + 1e7, petted, planter: 7, grow: 0, ...extra } });
    restore = await boot(r);
    snapshot(r, { 'patch:0': seedling(1) });
    await tick();
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'pet', r.engine), true);
    const first = lastAct(r);
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: first.req, id: 'patch:0', verb: 'pet', now: Date.now(), petted: 2, first: true, before: seedling(1), plot: seedling(2) });
    await tick();
    assert.ok(r.log.achievements.includes('patch_seedling:pet:1'), 'this player\'s first petting of it');
    assert.equal(patchesFeature.entityByKey('patch:0').plot.seedling.petted, 2);
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:0'), 'pet', r.engine), true);
    const third = lastAct(r);
    const grown = { stage: 'tree', tree: { class: 'trant_spice', maturity: 1, health: 7, fruit: 0, cap: 0 } };
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: third.req, id: 'patch:0', verb: 'pet', now: Date.now(), petted: 3, third: true, owner: true, grew: true, before: seedling(2), plot: grown });
    await tick();
    assert.equal(r.log.achievements.filter((a) => a === 'patch_seedling:pet:1').length, 1, 'not again: not this player\'s first');
    assert.ok(r.log.achievements.includes('patch_seedling:grown:1'), 'the planter\'s third');
    assert.equal(stage('patch:0'), 'tree');
    // The fourth: refused with the original's line.
    snapshot(r, { 'patch:1': seedling(3, { planter: 9, thirdAt: Date.now() }) });
    await tick();
    r.engine.pc.energy = 90;
    patchesFeature.entityByKey('patch:1').plot.seedling.petted = 2; // the page thinks one more is fine
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:1'), 'pet', r.engine), true);
    const fourth = lastAct(r);
    r.client.emit('msg:patch_no', { t: 'patch_no', req: fourth.req, id: 'patch:1', verb: 'pet', code: 'enough', message: "That's enough, thnx.", now: Date.now(), plot: seedling(3, { planter: 9, thirdAt: Date.now() }) });
    await tick();
    assert.equal(r.log.toasts.at(-1), "That's enough, thnx.");
    assert.equal(patchesFeature.entityByKey('patch:1').plot.seedling.petted, 3);
    restore();
  });

  it('clear the dead tree: the first clear wins its Planks, once', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'trant_spice_dead:0'), 'clear', r.engine), true);
    const asked = lastAct(r);
    assert.equal(asked.id, 'trant_spice_dead:0');
    r.client.emit('msg:patch_ok', { t: 'patch_ok', req: asked.req, id: 'trant_spice_dead:0', verb: 'clear', now: Date.now(), before: { class: 'trant_spice_dead', stage: 'dead', dead: 'trant_spice_dead' }, plot: { class: 'patch', kind: 'patch', stage: 'dirty' }, grant: { id: 'pg-clear-1', c: 'plank', n: 25 } });
    await tick();
    assert.equal(stage('trant_spice_dead:0'), 'dirty');
    assert.equal(r.engine.inv.plank, 25);
    assert.ok(r.log.achievements.includes('dead_trants_cleared:trant_spice_dead:1'));
    restore();
  });

  it('a clear another player landed first reads "Someone else cleared it first." (Ours, slice 3)', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'trant_spice_dead:0'), 'clear', r.engine), true);
    const asked = lastAct(r);
    r.client.emit('msg:patch_no', { t: 'patch_no', req: asked.req, id: 'trant_spice_dead:0', verb: 'clear', code: 'nothing', message: "There's nothing here to clear.", now: Date.now(), plot: { class: 'trant_spice_dead', kind: 'patch', stage: 'dirty' } });
    await tick();
    assert.ok(r.log.activity.includes(CLEARED_FIRST_LINE), r.log.activity.join(' | '));
    assert.equal(r.engine.inv.plank || 0, 0, 'no Planks for the second clear');
    assert.equal(stage('trant_spice_dead:0'), 'dirty', 'the plot as it stands');
    restore();
  });

  it('a clear cut short because another player\'s clear landed reads the same line; a plain cancel says nothing', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, {});
    await tick();
    const t = target(r, 'trant_spice_dead:0');
    sharedPatchesFeature.verbCancelled(t, 'clear', r.engine);
    assert.ok(!r.log.activity.includes(CLEARED_FIRST_LINE), 'still dead: an ordinary cancel');
    r.client.emit('msg:patches', { t: 'patches', street: OLD_MAIN, now: Date.now(), plots: { 'trant_spice_dead:0': { class: 'trant_spice_dead', kind: 'patch', stage: 'dirty' } } });
    await tick();
    sharedPatchesFeature.verbCancelled(t, 'clear', r.engine);
    assert.ok(r.log.activity.includes(CLEARED_FIRST_LINE));
    restore();
  });

  it('a timeout or a dropped connection says so, and a reconnect keeps the plots drawn', async () => {
    const r = rig();
    restore = await boot(r);
    snapshot(r, { 'patch:2': { stage: 'clean', due: Date.now() + 90000 } });
    await tick();
    sharedPatchesFeature.runVerbOverride(target(r, 'trant_spice_dead:0'), 'clear', r.engine);
    r.client.state = 'connecting';
    r.client.emit('state', { state: 'connecting' });
    assert.equal(r.log.toasts.at(-1), COPY.timeout);
    assert.equal(stage('patch:2'), 'clean', 'still drawn as the server had it');
    assert.equal(sharedPatchesFeature.runVerbOverride(target(r, 'patch:2'), 'dig', r.engine), true);
    assert.equal(r.log.toasts.at(-1), COPY.connecting);
    // Signed out: the save's own plots.
    r.client.state = 'signed-out';
    r.client.emit('state', { state: 'signed-out' });
    await tick();
    assert.equal(stage('patch:2'), 'dirty', 'the save has no plot there (it was dropped when the street was shared)');
    assert.ok(!target(r, 'patch:2').sharedPatch);
    restore();
  });
});
