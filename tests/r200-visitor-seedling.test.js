/**
 * Report #200: on someone else's home street a visitor's third pet of a
 * Seedling grew it into a tree on their copy, but the copy kept the bare
 * Patch art, the "Spice Plant" label and the Seedling's (now empty) verbs.
 * A Seedling petted three times is a tree once its least time is up
 * (patch_seedling.js onPetted / onMinTimePassed growUp; js/patches.js
 * tickPlot): the visitor's copy draws it as the tree it drew on arrival, a
 * refresh rebuilds a Patch that became a tree, the site (src/HomeYard.php
 * plotNow) grows it too so its tree takes a visitor's pet and water before
 * the owner's game comes back, and the owner's game grows it before applying
 * a tree act (js/yard-verbs-mp.js applyYardAct). A fourth pet is the
 * source's disabled verb with its reason (patch_seedling.js onStatus 262-266).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GROWN_TREE_LABELS, SOIL_TIMERS, performPlotVerb, plotVerbs } from '../public/js/patches.js?v=61abc5fe';
import { allowedVerbs, applyYardAct, growIfReady, visitorTreeState } from '../public/js/yard-verbs-mp.js?v=3dd5a476';
import { GAME_DIR, HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const gsjs = join(GAME_DIR, '..', 'glitch-GameServerJS');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(classes, body) {
  const code = `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const MIN = 60000;

function seedling(now, over = {}) {
  return {
    classTsid: 'patch',
    kind: 'patch',
    stage: 'seedling',
    since: now - 20 * MIN,
    dueAt: 0,
    seedling: { trantClass: 'trant_spice', beanClass: 'bean_spice', plantedAt: now - 20 * MIN, minAt: now - 15 * MIN, maxAt: now + 200 * MIN, upgradeGrowLevel: 0, petted: 2, petters: 1, growLevel: 0, thirdPetAt: 0, ...over },
  };
}

describe('a petted Seedling grows when its least time is up (growIfReady)', () => {
  const now = Date.now();
  it('three pets and the least time past: the tree tickPlot grows, at that moment', () => {
    const plot = seedling(now, { petted: 3, thirdPetAt: now - 5 * MIN });
    assert.equal(growIfReady(plot, now), true);
    assert.equal(plot.stage, 'tree');
    assert.equal(plot.tree.classId, 'trant_spice');
    assert.equal(plot.tree.grownAt, now - 5 * MIN, 'max(minAt, thirdPetAt)');
    assert.equal(plot.tree.state.fruitCount, 0, 'no fruit until tended (growUp)');
  });
  it('not before its least time, not with fewer than three pets, not past its most time', () => {
    assert.equal(growIfReady(seedling(now, { petted: 3, minAt: now + MIN }), now), false);
    assert.equal(growIfReady(seedling(now, { petted: 2 }), now), false);
    assert.equal(growIfReady(seedling(now, { petted: 3, thirdPetAt: now - MIN, maxAt: now - 2 * MIN }), now), false);
    assert.equal(growIfReady(seedling(now, { petted: 3, minAt: undefined }), now), false, 'no least time known: left as it is');
  });
});

describe('the visitor\'s third pet (report #200)', () => {
  const now = Date.now();
  it('grows the copy into a tree whose copy has the tree\'s verbs, not the empty Seedling ones', () => {
    const plot = seedling(now);
    const r = performPlotVerb(plot, 'pet', { pc: { energy: 100 }, now, owner: false, rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(r.grew, true);
    assert.equal(plot.stage, 'tree');
    assert.deepEqual(plotVerbs(plot, {}), [], 'a tree has no plot verbs: it must be drawn as a tree target');
    const state = visitorTreeState(plot, 'patch:0', {}, now);
    assert.equal(state.maturity, 1);
    assert.equal(state.petted, false);
    assert.deepEqual(allowedVerbs('tree', 'trant_spice').filter((v) => ['pet', 'water', 'harvest'].includes(v)), ['pet', 'water', 'harvest']);
  });
  it('a fourth pet is the source\'s disabled verb, its reason shown', () => {
    const rows = plotVerbs(seedling(now, { petted: 3, minAt: now + MIN }), { pc: { energy: 100 } });
    assert.deepEqual(rows.map((r) => [r.id, r.enabled, r.reason]), [['pet', false, "That's enough, thnx."]]);
  });
  it('the reason is patch_seedling.js\'s own (onStatus verb_states.pet)', { skip: !existsSync(join(gsjs, 'items', 'patch_seedling.js')) && 'no GameServerJS' }, () => {
    const src = readFileSync(join(gsjs, 'items', 'patch_seedling.js'), 'utf8');
    assert.ok(src.includes('disabled_reason: (this.petted >= 3) ? "That\'s enough, thnx." : ""'));
    assert.ok(!/verbs\.pet = [\s\S]{0,400}pols_is_owner/.test(src), 'no owner check on pet: a visitor may pet');
  });
});

describe('the owner\'s game gets the tree', () => {
  const now = Date.now();
  it('the visitor\'s third pet sets the third-pet time; tickPlot grows it then', () => {
    const plots = { 'patch:0': seedling(now) };
    const changed = applyYardAct({ plots }, { kind: 'plot', target: 'patch:0', verb: 'pet', at: now - MIN });
    assert.equal(changed.kind, 'plot');
    assert.equal(plots['patch:0'].seedling.thirdPetAt, now - MIN);
    assert.equal(growIfReady(plots['patch:0'], now), true);
    assert.equal(plots['patch:0'].tree.grownAt, now - MIN, 'the moment the visitor saw it grow');
  });
  it('a visitor\'s pet on the grown tree lands even before the owner\'s tick grew it', () => {
    const plots = { 'patch:0': seedling(now, { petted: 3, thirdPetAt: now - 2 * MIN }) };
    const changed = applyYardAct({ plots }, { kind: 'tree', target: 'patch:0', verb: 'pet', at: now - MIN });
    assert.equal(changed.kind, 'tree');
    assert.equal(changed.grew, true);
    assert.equal(plots['patch:0'].stage, 'tree');
    assert.equal(plots['patch:0'].tree.state.petted, true);
  });
});

describe('a site tree grown from a Seedling is filled in on the visitor\'s copy', () => {
  it('a Spice Plant\'s fruit room and class, a Wood Tree\'s counters', () => {
    const now = Date.now();
    const spice = visitorTreeState({ stage: 'tree', tree: { classId: 'trant_spice', resetAt: now, state: { classTsid: 'trant_spice', maturity: 1, health: 7, fruitCount: 0, harvestsToday: 0, petted: false, watered: false } } }, 'patch:0', {}, now);
    assert.equal(spice.classTsid, 'trant_spice');
    assert.ok(Number.isFinite(spice.fruitCapacity));
    const wood = visitorTreeState({ stage: 'tree', tree: { classId: 'wood_tree', resetAt: now, state: { maturity: 1 } } }, 'patch:1', {}, now);
    assert.deepEqual([wood.maturity, wood.harvestCount, wood.totalHarvests, wood.petted, wood.harvestedToday], [1, 0, 0, false, false]);
  });
});

// —— The visit itself (features/yard-verbs-mp-feature.js) with a stand-in engine ——

function fakePixi() {
  class Base {
    constructor() {
      this.destroyed = false;
      this.scale = { set() {} };
      this.anchor = { set() {} };
      this.children = [];
    }
    destroy() { this.destroyed = true; }
    on() { return this; }
    once() { return this; }
    off() { return this; }
    emit() { return true; }
    addChild(c) { this.children.push(c); return c; }
  }
  class Texture extends Base {
    constructor(o = {}) { super(); this.source = o.source; this.height = 210; }
  }
  Texture.EMPTY = new Texture();
  class ImageSource extends Base { resize() { return true; } update() {} }
  class Sprite extends Base { constructor(tex) { super(); this.texture = tex; this.x = 0; this.y = 0; } }
  class AnimatedSprite extends Sprite { play() {} gotoAndPlay() {} gotoAndStop() {} }
  class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
  return { Texture, ImageSource, Sprite, AnimatedSprite, Container: Base, Rectangle };
}

describe('a visit draws the tree a pet grows, and a refresh rebuilds one', () => {
  it('pet, grow, refresh', async () => {
    const now = Date.now();
    globalThis.PIXI = fakePixi();
    globalThis.Image = class { set src(v) { this._src = v; } };
    const realDoc = globalThis.document;
    const realFetch = globalThis.fetch;
    globalThis.document = { baseURI: 'http://groddle.test/', createElement: () => ({ getContext() {} }) };
    let yard = {
      owner: 7,
      name: 'Sunny',
      patches: [
        { key: 'patch:0', rx: 100, plot: seedling(now) },
        { key: 'patch:1', rx: 300, plot: seedling(now, { petted: 3, thirdPetAt: now - MIN, minAt: now + 10 * MIN }) },
      ],
      animals: [],
      mine: {},
    };
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = /homes\/7\/yard/.test(u) ? yard : /homes\/yard/.test(u) ? { acts: [] } : {};
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(body)), text: async () => '' };
    };
    const sent = [];
    const handlers = {};
    const client = { state: 'online', me: { id: 9 }, on: (ev, fn) => { handlers[ev] = fn; }, send: (t, m) => sent.push({ t, ...m }) };
    const registered = new Set();
    const engine = {
      mode: 'multiplayer',
      started: true,
      streetTsid: 'MPH_7',
      PIXI: globalThis.PIXI,
      entityLayer: { addChild() {} },
      register(t) { registered.add(t); return t; },
      unregister(t) { registered.delete(t); },
      query: (k) => (k === 'realtimeClient' ? client : null),
      setData() {},
      toast() {},
      pushActivity() {},
      floatText() {},
      playSound() {},
      refreshPack() {},
      achievement() {},
      save() {},
      homeContext: () => ({ inHome: false }),
      inv: {},
      pc: { energy: 100 },
      learnedSkills: [],
      worldW: 3000,
    };
    try {
      const { yardVerbsMpFeature } = await import('../public/js/features/yard-verbs-mp-feature.js?v=315ca5b7');
      yardVerbsMpFeature.onTick(16, 1, engine);
      for (let i = 0; i < 20 && !globalThis.groddleYard?.visit; i += 1) await new Promise((r) => setTimeout(r, 5));
      const yardSession = globalThis.groddleYard;
      const visit = yardSession.visit;
      assert.ok(visit, 'the visit is drawn');
      assert.deepEqual(yardSession.state().plots, { 'patch:0': 'seedling', 'patch:1': 'seedling' });

      // The other Seedling has had its three pets: Pet is off, with the source's reason.
      const other = visit.plots.get('patch:1');
      assert.deepEqual(yardVerbsMpFeature.verbsFor(other.target).map((v) => [v.id, v.enabled, v.reason]), [['pet', false, "That's enough, thnx."]]);

      // The third pet grows patch:0: the Patch art and target go, the tree comes, as on arrival.
      const before = visit.plots.get('patch:0');
      assert.equal(yardVerbsMpFeature.runVerb(before.target, 'pet'), true);
      assert.equal(before.sprite.destroyed, true, 'the bare Patch sprite is gone');
      assert.equal(registered.has(before.target), false, 'the Seedling target is gone');
      const tree = visit.trees.get('patch:0');
      assert.ok(tree, 'drawn as a tree');
      assert.equal(visit.plots.has('patch:0'), false);
      assert.equal(tree.target.classId, 'trant_spice');
      assert.equal(tree.target.label, GROWN_TREE_LABELS.trant_spice);
      assert.equal(tree.target.yardVisit.kind, 'tree');
      assert.equal(registered.has(tree.target), true);
      assert.equal(tree.x, before.x, 'where the Patch was');
      assert.deepEqual(yardVerbsMpFeature.decorateVerbs(tree.target, [{ id: 'pet' }, { id: 'water' }, { id: 'poison' }]).map((v) => v.id), ['pet', 'water']);
      assert.deepEqual(sent.filter((m) => m.t === 'home_yard').map((m) => `${m.kind}:${m.id}:${m.verb}`), ['plot:patch:0:pet']);

      // A refresh: the site says patch:1 grew (a tree it grew itself) and patch:0 is still the Seedling with three pets.
      yard = {
        ...yard,
        patches: [
          { key: 'patch:0', rx: 100, plot: seedling(now, { petted: 3, thirdPetAt: now - 1000 }) },
          { key: 'patch:1', rx: 300, plot: { stage: 'tree', since: now, dueAt: 0, seedling: null, tree: { classId: 'trant_spice', grownAt: now, lastCycleAt: now, resetAt: now, state: { classTsid: 'trant_spice', maturity: 1, health: 7, fruitCount: 0, harvestsToday: 0, petted: false, watered: false } } } },
        ],
      };
      const was = visit.plots.get('patch:1');
      await yardSession.refresh();
      assert.equal(was.sprite.destroyed, true);
      assert.deepEqual(Object.keys(yardSession.state().trees).sort(), ['patch:0', 'patch:1']);
      assert.deepEqual(yardSession.state().plots, {});
      assert.ok(Number.isFinite(visit.trees.get('patch:1').state.fruitCapacity), 'the site\'s tree is filled in');
      assert.equal(visit.trees.get('patch:0').plot.stage, 'tree', 'still the tree I grew');
    } finally {
      resetSession();
      globalThis.fetch = realFetch;
      if (realDoc === undefined) delete globalThis.document;
      else globalThis.document = realDoc;
    }
  });
});

function resetSession() {
  delete globalThis.groddleYard;
}

describe('the site grows it too (src/HomeYard.php plotNow)', { skip: skipSite }, () => {
  const now = Date.now();
  const stateWith = (plot) => ({
    systems: { home: { owned: true }, features: { homes: { cult: { items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx: 470 }] } } } },
    world: { streets: { RH_HOME_EXT: { features: { patches: { plots: { 'patch:0': plot } } } } } },
  });
  const judge = (state, waiting, kind, verb) => php(['HomePool', 'HomeYard'],
    `use Groddle\\Minn\\HomeYard as Y; $s = json_decode(${JSON.stringify(JSON.stringify(state))}); echo json_encode(Y::judge(Y::rules(), $s, json_decode(${JSON.stringify(JSON.stringify(waiting))}, true), [], [], ${JSON.stringify(kind)}, 'patch:0', ${JSON.stringify(verb)}, ${now}));`);
  const plotNow = (plot, waiting) => php(['HomePool', 'HomeYard'],
    `use Groddle\\Minn\\HomeYard as Y; echo json_encode(Y::plotNow(json_decode(${JSON.stringify(JSON.stringify(plot))}), 'patch:0', json_decode(${JSON.stringify(JSON.stringify(waiting))}, true), ${now}, Y::rules()));`);
  const pet = (n, at, kind = 'plot', verb = 'pet') => ({ id: `yd-00000000000000${String(n).padStart(2, '0')}`, kind, target: 'patch:0', verb, took: 0, what: '', at_ms: at });

  it('a stored Seedling with three pets past its least time is a tree: its pet and water open, a fourth Seedling pet gone', () => {
    const state = stateWith(seedling(now, { petted: 3, thirdPetAt: now - 5 * MIN }));
    assert.deepEqual(judge(state, [], 'tree', 'pet'), { pool: 'trant:pet' });
    assert.deepEqual(judge(state, [], 'tree', 'water'), { pool: 'trant:water' });
    assert.equal(judge(state, [], 'plot', 'pet').why, 'gone');
    const grown = plotNow(seedling(now, { petted: 3, thirdPetAt: now - 5 * MIN }), []);
    assert.equal(grown.stage, 'tree');
    assert.deepEqual([grown.tree.classId, grown.tree.resetAt, grown.tree.state.maturity, grown.tree.state.fruitCount], ['trant_spice', now - 5 * MIN, 1, 0]);
  });
  it('a waiting third pet grows it; a waiting pet on the tree after is folded in', () => {
    const plot = seedling(now);
    const grown = plotNow(plot, [pet(1, now - 3 * MIN), pet(2, now - 2 * MIN, 'tree', 'pet')]);
    assert.equal(grown.stage, 'tree');
    assert.equal(grown.tree.resetAt, now - 3 * MIN);
    assert.equal(grown.tree.state.petted, true);
    assert.equal(judge(stateWith(plot), [pet(1, now - 3 * MIN), pet(2, now - 2 * MIN, 'tree', 'pet')], 'tree', 'pet').text, "I don't want to be petted!");
  });
  it('before its least time it stays a Seedling, and a fourth pet is the source\'s refusal', () => {
    const plot = seedling(now, { minAt: now + 5 * MIN });
    const still = plotNow(plot, [pet(1, now - MIN)]);
    assert.equal(still.stage, 'seedling');
    assert.equal(still.seedling.petted, SOIL_TIMERS.seedlingPets);
    assert.equal(judge(stateWith(plot), [pet(1, now - MIN)], 'plot', 'pet').text, "You don't need to pet this seedling any more. Just wait a few minutes.");
  });
  it('a visitor\'s waiting bean has its least time from the planter\'s card', () => {
    const clean = { classTsid: 'patch', kind: 'patch', stage: 'clean', since: now - 2 * MIN, dueAt: now + MIN };
    const sown = { ...pet(1, now - 30 * MIN, 'plot', 'plant'), what: 'bean_spice:soil_appreciation_bean_grow_2' };
    const waiting = [sown, pet(2, now - 29 * MIN), pet(3, now - 29 * MIN), pet(4, now - 29 * MIN)];
    const t = plotNow({ ...clean, dueAt: now + 60 * MIN }, waiting);
    assert.equal(t.stage, 'tree');
    assert.equal(t.tree.resetAt, now - 29 * MIN, 'grow card 2: one minute, so at the third pet');
    assert.equal(t.tree.state.maturity, 4, 'grow card 2: grow level 4');
  });
});
