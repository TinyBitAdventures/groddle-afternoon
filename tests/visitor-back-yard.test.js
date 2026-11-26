/**
 * A visitor sees the owner's back yard as the owner does (Austin, live, 2026-11-25: a friend's
 * Dirt Pile was missing from their back yard on a visit, their garden was not). The visitor's
 * drawing (homes-feature drawVisitorYard) kept its own list of what to draw: rocks, gardens and
 * things with pod art, so a Dirt Pile and a Peat Bog (resource nodes with no art of their own),
 * a pod's barnacle or jellisac, a hive's Fireflies and every Patch were left off (root R5: the
 * owner's cultivations drawn by separate visitor code).
 *
 * Now both yards draw from one list (yardDrawParts): the owner's through the live features, the
 * visitor's as stills through the same drawing (resource-nodes-feature resourceNodeStill,
 * patches-feature plotStill). This sweeps the cultivation catalog: each class placed in a back
 * yard, live and worn out, is drawn for a visitor, one display for each part the owner's yard draws.
 * Run: node --test tests/visitor-back-yard.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Display, FakeEl, fakePixi } from './fake-scene.js';

globalThis.document ??= { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
// js/textures.js keeps its load state on the source: a source and Texture that hold it, and images that never arrive.
class FakeTexture extends Display {
  constructor(opts = {}) {
    super();
    this.source = opts.source;
  }
}
FakeTexture.EMPTY = new Display();
FakeTexture.from = (src) => new FakeTexture({ source: src });
const pixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, Text: Display, TilingSprite: Display, ImageSource: Display, Texture: FakeTexture }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});
globalThis.PIXI = pixi;
globalThis.Image ??= class { set src(_) {} };

const { visitorHomeScene, visitorHomeState, yardDrawParts } = await import('../public/js/features/homes-feature.js?v=d77aa5b7');
const { CULTIVATION_CLASSES } = await import('../public/js/homes-catalog.js?v=0367f90f');
const { homeStreetLayout } = await import('../public/js/home-cultivation.js?v=b2868d29');

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A visit to an owner whose back yard holds `items`: what the visitor's scene adds for the yard (after its room), and where. */
function visitBackYard(items, room = roomShare()) {
  const layer = new Display();
  const gardens = [];
  const base = { PIXI: pixi, entityLayer: layer, fxLayer: new Display(), spawnGarden: (o) => { gardens.push(o); return { id: o.label }; } };
  const engine = new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : new Display()),
  });
  const view = { home: { style: 'meadow' }, homes: { cult: { items: [] }, backYard: { items } } };
  const st = visitorHomeState(view).backCult;
  const scene = visitorHomeScene(engine, view, 'interior');
  const before = layer.children.length;
  scene.populate(engine);
  return { st, houseX: homeStreetLayout(st).houseX, added: layer.children.slice(before + room), gardens };
}

/** What the scene draws with an empty back yard (the room's furniture layers and door, drawn before the yard). */
let roomCount = null;
function roomShare() {
  if (roomCount == null) roomCount = visitBackYard([], 0).added.length;
  return roomCount;
}

const item = (id, protoClass, endClass, rx, extra = {}) => ({ id, protoClass, endClass, rx, wear: 0, lifeSteps: 0, placedAt: Date.now() - 60_000, ...extra });

describe('a visitor sees every cultivation in the owner\'s back yard (R5)', () => {
  it('the repro: a garden, a Dirt Pile, a Peat Bog and a Barnacle Pod are all drawn where the owner has them', () => {
    const { st, houseX, added, gardens } = visitBackYard([
      item(1, 'proto_crop_garden_small', 'garden_new', -150),
      item(2, 'proto_dirt_pile', 'dirt_pile', -400),
      item(3, 'proto_peat', 'peat_1', -620),
      item(4, 'proto_barnacle_pod', 'mortar_barnacle', -720),
    ]);
    const at = (protoClass) => houseX + st.items.find((r) => r.protoClass === protoClass).rx;
    assert.deepEqual(gardens.map((g) => g.x), [at('proto_crop_garden_small')]);
    const xs = added.map((d) => d.x);
    for (const protoClass of ['proto_dirt_pile', 'proto_peat']) {
      const def = CULTIVATION_CLASSES[protoClass];
      for (const node of def.nodes) assert.ok(xs.includes(at(protoClass) + node.dx), `${protoClass}: its node is drawn`);
    }
    // The pod's art and its barnacle on it.
    const pod = at('proto_barnacle_pod');
    const want = [pod, ...CULTIVATION_CLASSES.proto_barnacle_pod.nodes.map((n) => pod + n.dx)];
    for (const x of new Set(want)) assert.ok(xs.filter((v) => v === x).length >= want.filter((v) => v === x).length, `the pod's art and barnacles at ${x}`);
  });

  it('every class in the catalog, live and worn out: one display for each part the owner\'s yard draws', () => {
    const classes = Object.values(CULTIVATION_CLASSES);
    assert.ok(classes.length >= 16, 'the catalog is read');
    const kinds = new Set();
    for (const def of classes) {
      for (const endClass of def.endItems) {
        for (const depleted of [false, true]) {
          const row = item(1, def.protoClass, endClass, -500, depleted ? { depleted: true } : {});
          const { st, houseX, added, gardens } = visitBackYard([row]);
          assert.equal(st.items.length, 1, `${def.protoClass}: placed`);
          const parts = yardDrawParts(st.items);
          assert.ok(parts.length > 0, `${def.protoClass}/${endClass}: the owner's yard draws it`);
          const x = houseX + st.items[0].rx;
          const notGarden = parts.filter((p) => p.part !== 'garden');
          assert.equal(added.length, notGarden.length, `${def.protoClass}/${endClass}${depleted ? ' (worn out)' : ''}: ${parts.map((p) => p.part).join(',')}`);
          assert.equal(gardens.length, parts.length - notGarden.length, `${def.protoClass}: its garden`);
          for (const p of parts) {
            kinds.add(p.part);
            if (p.part === 'node') assert.ok(added.some((d) => d.x === x + p.node.dx), `${def.protoClass}: ${p.node.classTsid} at its spot`);
          }
        }
      }
    }
    // Every kind of part the catalog has is covered by the sweep.
    for (const part of ['proto', 'rock', 'garden', 'patch', 'art', 'node']) assert.ok(kinds.has(part), part);
  });

  it('both yards draw from the one list, and the visitor\'s drawing handles every part it can name', () => {
    const src = read('public/js/features/homes-feature.js');
    const owner = src.slice(src.indexOf('function spawnCultivations('), src.indexOf('function drawCultivationMarkers('));
    assert.match(owner, /yardDrawParts\(st\.items, now\)/, 'the owner\'s yard');
    const visitor = src.slice(src.indexOf('function drawVisitorYard('), src.indexOf('export function visitorHomeScene('));
    assert.match(visitor, /for \(const p of yardDrawParts\(st\.items, now\)\)/, 'the visitor\'s yard');
    assert.doesNotMatch(visitor, /def\.kind ===/, 'no list of its own');
    const from = src.indexOf('export function yardDrawParts(');
    const enumSrc = src.slice(from, src.indexOf('\n/**', from));
    const named = new Set([...enumSrc.matchAll(/part: '(\w+)'/g)].map((m) => m[1]));
    for (const kind of ['rock', 'garden', 'patch']) named.add(kind);
    for (const part of named) assert.match(visitor, new RegExp(`p\\.part === '${part}'`), `drawVisitorYard draws '${part}'`);
  });

  it('a visitor\'s stills carry no target (looking only: visiting verbs in the back yard are their own call)', () => {
    const registered = [];
    const layer = new Display();
    const engine = new Proxy({ PIXI: pixi, entityLayer: layer, register: (t) => { registered.push(t); return t; }, spawnGarden: () => null }, {
      get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : new Display()),
    });
    const view = { home: { style: 'meadow' }, homes: { cult: { items: [] }, backYard: { items: [item(1, 'proto_dirt_pile', 'dirt_pile', -400), item(2, 'proto_patch', 'patch', -700)] } } };
    visitorHomeScene(engine, view, 'interior').populate(engine);
    assert.deepEqual(registered, []);
  });
});
