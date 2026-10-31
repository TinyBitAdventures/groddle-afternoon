/**
 * Street layers above the middleground draw in front of the avatars (G410, Austin 2026-10-28:
 * Flipside's green pipe, Guillermo Gamera Way's shrubs and Baby Steppes' trunks drew behind the
 * player). The client sorts a location's layers by z and adds one renderer per layer in that
 * order; avatars, NPCs and items sit inside the middleground's renderer above all of its decos,
 * so each layer with a higher z covers them. Hidden layers never draw (Location.as 541-542).
 * Run: node --test tests/street-front-layers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStreetView, layerDrawsInFront, layerIsDrawn } from '../public/js/street-render.js?v=3f8384af';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const clientRoot = join(here, '../../glitch-client/com/tinyspeck/engine');
/** A street's layers without the parts that need a DOM (sky gradient canvas, signpost art). */
const bare = (tsid) => ({ ...street(tsid), gradient: null, signposts: [] });

/** The bits of Pixi buildStreetView touches when no deco art is available. */
function fakePixi() {
  class Container {
    constructor() {
      this.children = [];
      this.parent = null;
      this.destroyed = false;
      this.listeners = {};
      this.x = 0;
      this.y = 0;
      this.visible = true;
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent?.removeChild(kid);
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    removeChild(kid) {
      const i = this.children.indexOf(kid);
      if (i >= 0) this.children.splice(i, 1);
      kid.parent = null;
      return kid;
    }
    once(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    destroy(opts) {
      if (this.destroyed) return;
      this.destroyed = true;
      this.parent?.removeChild(this);
      if (opts?.children) for (const kid of [...this.children]) kid.destroy?.(opts);
      for (const fn of this.listeners.destroyed || []) fn();
    }
  }
  class Graphics extends Container {}
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke', 'circle']) {
    Graphics.prototype[verb] = function chain() {
      return this;
    };
  }
  class ColorMatrixFilter {}
  return { Container, Graphics, ColorMatrixFilter };
}

describe('which layers draw in front (client layer order)', () => {
  it('puts layers with a z above the middleground in front, the rest behind', () => {
    assert.equal(layerDrawsInFront({ id: 'middleplus', z: 1 }, 3, 0), true);
    assert.equal(layerDrawsInFront({ id: 'foreground', z: 2 }, 4, 0), true);
    assert.equal(layerDrawsInFront({ id: 'bg_1', z: -1 }, 0, 0), false);
    assert.equal(layerDrawsInFront({ id: 'middleground', z: 0 }, 1, 0), false);
    // No z: the list index stands in, as street-render's zIndex does.
    assert.equal(layerDrawsInFront({ id: 'T_1' }, 2, 1), true);
    assert.equal(layerDrawsInFront({ id: 'T_1' }, 0, 1), false);
    // A scene without a middleground keeps everything behind.
    assert.equal(layerDrawsInFront({ id: 'foreground', z: 5 }, 0, null), false);
  });

  it('drops hidden layers but never the middleground', () => {
    assert.equal(layerIsDrawn({ id: 'foreground', z: 2, hidden: true }), false);
    assert.equal(layerIsDrawn({ id: 'foreground', z: 2 }), true);
    assert.equal(layerIsDrawn({ id: 'middleground', z: 0, hidden: true }), true);
  });

  it('matches the client: layers sorted by z, avatars above every middleground deco', { skip: !existsSync(clientRoot) && 'needs ../glitch-client' }, () => {
    const builder = readFileSync(join(clientRoot, 'view/renderer/LocationViewBuilder.as'), 'utf8');
    assert.match(builder, /layers\.sort\(SortTools\.layerZSort\);[\s\S]*?locationRenderer\.addChild\(DisplayObject\(layerRenderer\)\);/);
    const sort = readFileSync(join(clientRoot, 'util/SortTools.as'), 'utf8');
    assert.match(sort, /function layerZSort\(layerA:Layer, layerB:Layer\):int \{\s*if\(layerA\.z > layerB\.z\)\{\s*return 1;/);
    const layerRenderer = readFileSync(join(clientRoot, 'view/renderer/LayerRenderer.as'), 'utf8');
    assert.match(layerRenderer, /addUnder\(decoRenderer, DECO\);/);
    const mg = readFileSync(join(clientRoot, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    const order = ['super.setupEndShapes()', 'addChild(NRM_ITEM)', 'addChild(OTHER_AV)', 'addChild(YOUR_AVATAR)'].map((s) => mg.indexOf(s));
    assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `holder order ${order}`);
    const location = readFileSync(join(clientRoot, 'data/location/Location.as'), 'utf8');
    assert.match(location, /layer\.is_hidden && \(layer != location\.mg\)\) \{\s*layers\.splice\(k, 1\);/);
  });
});

describe('the reported streets', () => {
  it('Flipside: the swiss pipe and pods have their back halves in the middleground and front halves in middleplus', () => {
    const s = street('GM410QQ0CHARO');
    assert.equal(s.label, 'Flipside');
    const mg = s.layers.find((l) => l.id === 'middleground');
    const plus = s.layers.find((l) => l.id === 'middleplus');
    assert.ok(mg.decos.some((d) => d.sprite === 'cl2_swissPipe_01_back'));
    assert.ok(plus.decos.some((d) => d.sprite === 'cl2_swissPipe_01_front'));
    assert.ok(plus.decos.some((d) => d.sprite === 'cl2_pod_01_front'));
    assert.equal(layerDrawsInFront(plus, s.layers.indexOf(plus), mg.z), true);
  });

  it('Guillermo Gamera Way and Baby Steppes: shrubs and trunks sit in front layers', () => {
    const gg = street('GM4109NI2R640');
    const ggPlus = gg.layers.find((l) => l.id === 'middleplus');
    assert.ok(ggPlus.decos.some((d) => /^shrub_/.test(d.sprite)));
    assert.equal(layerDrawsInFront(ggPlus, 0, 0), true);
    const bs = street('GM416LNIKVLM1');
    const fg = bs.layers.find((l) => l.id === 'foreground');
    assert.ok(fg.decos.every((d) => d.sprite === 'tree_front_02'));
    assert.equal(layerDrawsInFront(fg, 0, 0), true);
  });

  it('flags the editors’ hidden layers in the street data (build-street-layers.mjs)', () => {
    const bhaga = street('GUVNHLCRGEA3VAS');
    assert.deepEqual(bhaga.layers.filter((l) => l.hidden).map((l) => l.id).sort(), ['T_1347477099064', 'T_1348526992576']);
    const garama = street('GA9HU5KR4MN235O');
    assert.equal(garama.layers.find((l) => l.id === 'T_1328036410237').hidden, true);
    assert.ok(!street('GM410QQ0CHARO').layers.some((l) => l.hidden));
  });
});

describe('buildStreetView splits the layers', () => {
  it('puts front layers in root.frontView with their parallax, the rest in the root', () => {
    const PIXI = fakePixi();
    const s = street('GM410QQ0CHARO');
    const root = buildStreetView({ ...s, gradient: null, signposts: [] }, PIXI, { available: new Set() });
    const labels = (c) => c.children.map((k) => k.label).filter(Boolean);
    assert.deepEqual(labels(root.frontView).sort(), ['foreground', 'middleplus']);
    assert.deepEqual(root.frontLayers.sort(), ['foreground', 'middleplus']);
    for (const id of ['sky', 'bg_1', 'bg_2', 'middleground']) assert.ok(labels(root).includes(id), id);
    assert.ok(!labels(root).includes('middleplus'));
    // Front layers keep their parallax canvas.
    assert.ok(root.parallaxLayers.some((lc) => lc.label === 'middleplus'));
    root.updateParallax(1000, 400, 960, 408);
    const plus = root.frontView.children.find((k) => k.label === 'middleplus');
    assert.ok(Number.isFinite(plus.x) && Number.isFinite(plus.y));
    // The front container goes with the street view.
    const host = new PIXI.Container();
    host.addChild(root.frontView);
    const front = root.frontView;
    root.destroy({ children: true });
    assert.equal(front.destroyed, true);
    assert.equal(host.children.length, 0);
  });

  it('skips hidden layers', () => {
    const PIXI = fakePixi();
    const root = buildStreetView(bare('GUVNHLCRGEA3VAS'), PIXI, { available: new Set() });
    const all = [...root.children, ...root.frontView.children].map((k) => k.label);
    assert.ok(!all.includes('T_1347477099064') && !all.includes('T_1348526992576'));
  });
});

describe('game wiring', () => {
  const game = read('public/game.js');
  it('stacks the street front between the entities and the speech/FX layer', () => {
    assert.match(game, /world\.addChild\(bgLayer, entityLayer, streetFrontLayer, atmosphere, fxLayer\);/);
  });
  it('follows every scene swap: on street entry and every frame', () => {
    assert.match(game, /world\.addChildAt\(bgLayer, 0\);\n\s*syncStreetFront\(\);/);
    assert.match(game, /app\.ticker\.add\(\(ticker\) => \{\n\s*syncStreetFront\(\);/);
    assert.match(game, /syncStreetFront\(\);\n\s*bgLayer\?\.updateParallax\?\./);
  });
});
