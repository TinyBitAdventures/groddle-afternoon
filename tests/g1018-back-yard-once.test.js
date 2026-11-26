/**
 * G1018 with yardk (R5): a back yard draws each thing once. For a viewer who may act in it (the
 * owner's key holder or a visitor let in: the site's answer says `inside`, normalizeHomeView's
 * backYardLive), its rocks, nodes and Patches are yard-verbs-mp-feature's, drawn to use from the
 * site's back-yard view, and the house scene (homes-feature drawVisitorYard) leaves out its stills
 * of them; gardens, pod art and worn-out protos stay the scene's. For anyone who could only look,
 * the scene draws the stills and nothing is drawn to use.
 * Run: node --test tests/g1018-back-yard-once.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Display, FakeEl, fakePixi } from './fake-scene.js';

globalThis.document ??= { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
class FakeTexture extends Display {
  constructor(opts = {}) {
    super();
    this.source = opts.source;
    this.height = 210;
  }
}
FakeTexture.EMPTY = new Display();
FakeTexture.from = (src) => new FakeTexture({ source: src });
class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
const pixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, AnimatedSprite: Display, Text: Display, TilingSprite: Display, ImageSource: Display, Texture: FakeTexture, Rectangle }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});
globalThis.PIXI = pixi;
globalThis.Image ??= class { set src(_) {} };

const { visitorHomeScene } = await import('../public/js/features/homes-feature.js?v=6243f555');
const { normalizeHomeView, visitSceneTsid } = await import('../public/js/neighbours-mp.js?v=f43b50c8');

const item = (id, protoClass, endClass, rx) => ({ id, protoClass, endClass, rx, wear: 0, lifeSteps: 0, placedAt: Date.now() - 60_000 });
/** A back yard with one of each: a rock, a Dirt Pile (a node), a Patch, and a garden. */
const ITEMS = [item(1, 'proto_beryl_rock', 'rock_beryl_1', -900), item(2, 'proto_dirt_pile', 'dirt_pile', -650), item(3, 'proto_patch', 'patch', -420), item(4, 'proto_crop_garden_small', 'garden_new', -200)];

function scene(answerInside) {
  const layer = new Display();
  const gardens = [];
  const base = { PIXI: pixi, entityLayer: layer, fxLayer: new Display(), spawnGarden: (o) => { gardens.push(o); return { id: o.label }; } };
  const engine = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : new Display()) });
  const answer = { owner: { id: 7, name: 'Ada' }, home: { owned: true, style: 'meadow' }, homes: { cult: { items: [] }, backYard: { items: ITEMS } } };
  if (answerInside !== undefined) answer.inside = answerInside;
  const view = normalizeHomeView(answer);
  const drawn = [];
  visitorHomeScene(engine, view, 'interior', { drawn }).populate(engine);
  return { drawn: drawn.map((d) => d.part), gardens };
}

describe('the house scene draws the back yard\'s stills only for a viewer who cannot act in it', () => {
  it('let in (the site says inside): no stills of rocks, nodes or Patches; the garden is drawn', () => {
    const { drawn, gardens } = scene(true);
    assert.deepEqual(drawn.filter((p) => p === 'rock' || p === 'node' || p === 'patch'), []);
    assert.deepEqual(drawn, ['garden']);
    assert.equal(gardens.length, 1);
  });
  it('looking only (a site from before G1018, no `inside`): each thing as a still, once', () => {
    const { drawn } = scene(undefined);
    assert.deepEqual([...drawn].sort(), ['garden', 'node', 'patch', 'rock']);
  });
});

describe('an allowed visitor: each back-yard thing is drawn exactly once, the rock, node and Patch to use', () => {
  it('the scene plus yard-verbs-mp-feature', async () => {
    const realFetch = globalThis.fetch;
    const back = {
      owner: 7,
      name: 'Ada',
      place: 'yard',
      cult: { items: ITEMS },
      rocks: [{ id: 'b:rock:0', classId: 'rock_beryl_1', rx: -900, rock: { chunksRemaining: 30, depleted: false, respawnAt: 0 } }],
      nodes: [{ id: 'b:node:dirt_pile:0', classTsid: 'dirt_pile', rx: -650, dy: 0, node: { units: 3, regrowAt: 0, totalHarvests: 0 } }],
      patches: [{ key: 'b:patch:0', rx: -420, plot: { stage: 'dirty', since: 0, dueAt: 0 } }],
      animals: [],
      mine: {},
    };
    globalThis.fetch = async (url) => {
      const body = /homes\/7\/yard\?place=yard/.test(String(url)) ? back : /homes\/yard/.test(String(url)) ? { acts: [] } : {};
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(body)), text: async () => '' };
    };
    const client = { state: 'online', me: { id: 9 }, on() {}, send() {} };
    const registered = [];
    const slots = { features: {} };
    const base = {
      mode: 'multiplayer',
      started: true,
      streetTsid: visitSceneTsid(7, 'interior'),
      PIXI: pixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      register(t) { registered.push(t); return t; },
      unregister() {},
      query: (k) => (k === 'realtimeClient' ? client : null),
      homeContext: () => ({ inHome: false }),
      streetSlot: (id) => (slots.features[id] ||= {}),
      param: () => null,
      inv: {},
      pc: { energy: 100 },
      learnedSkills: [],
      worldW: 3000,
    };
    const engine = new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : () => undefined) });
    try {
      const { yardVerbsMpFeature } = await import('../public/js/features/yard-verbs-mp-feature.js?v=8d116143');
      yardVerbsMpFeature.onTick(16, 1, engine);
      for (let i = 0; i < 40 && !globalThis.groddleYard?.visit; i += 1) await new Promise((r) => setTimeout(r, 5));
      const visit = globalThis.groddleYard?.visit;
      assert.ok(visit, 'the back yard is drawn to use');
      const live = { rock: [...visit.rocks.keys()], node: [...visit.nodes.keys()], patch: [...visit.plots.keys(), ...visit.trees.keys()] };
      assert.deepEqual(live, { rock: ['rock:0'], node: ['node:dirt_pile:0'], patch: ['patch:0'] });
      assert.equal(registered.filter((t) => t.yardVisit?.kind === 'rock').length, 1, 'one rock target');
      assert.equal(registered.filter((t) => t.yardVisit?.kind === 'plot').length, 1, 'one Patch target');
      const stills = scene(true).drawn;
      for (const part of ['rock', 'node', 'patch']) assert.equal(stills.filter((p) => p === part).length + live[part].length, 1, `${part}: drawn once in all`);
      assert.equal(stills.filter((p) => p === 'garden').length, 1, 'the garden once, the scene\'s');
    } finally {
      delete globalThis.groddleYard;
      globalThis.fetch = realFetch;
    }
  });
});
