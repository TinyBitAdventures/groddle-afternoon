/**
 * #749 (idea, ours): day/night skies. The whole street was tinted by the game clock, but its own sky
 * gradient was the same at every hour: at night Baqala's plains showed their daytime blue-to-yellow
 * sky under a grey wash. Now an outdoor street's own gradient follows the clock (sunset tones at
 * dawn and dusk, dark blue with stars at night, the street's own sky by day), the far parallax
 * layers take a tint by depth, at most once a game minute; indoor and special places keep their sky.
 * Glitch drew every location's one gradient at every hour (DrawUtil.drawVerticalGradientBG).
 * Run: node --test tests/sky-clock-749.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStreetView } from '../public/js/street-render.js?v=c463d2c6';
import {
  NO_SKY_HUBS,
  farLayerTint,
  gradientColourAt,
  ownSkyReason,
  skyFollowsClock,
  skyLook,
  skyPhaseWeights,
  starField,
} from '../public/js/sky-clock.js?v=dbd21266';
import { ecologyForStreet, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=da5177b2';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const BAQALA = 'GA514DNTMC42534'; // Range Rd 6, Baqala (the decision mockups' plains)
const HECHEY = 'GLI2V0UN7RD1T2J'; // Hechey Track, Groddle Forest
const NIGHT = 23.5;
const DAWN = 6.5;
const DUSK = 19.5;
const DAY = 12.5;
const luma = (c) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
const hex = (s) => parseInt(s, 16);

/** The bits of Pixi buildStreetView touches with no deco art; the gradient canvas records its stops. */
function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, width: 0, height: 0, visible: true, alpha: 1, tint: 0xffffff });
      this.scale = { x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } };
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent?.removeChild(kid);
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    addChildAt(kid, i) {
      kid.parent?.removeChild(kid);
      kid.parent = this;
      this.children.splice(i, 0, kid);
      return kid;
    }
    removeChild(kid) {
      const i = this.children.indexOf(kid);
      if (i >= 0) this.children.splice(i, 1);
      kid.parent = null;
      return kid;
    }
    once(name, fn) { (this.listeners[name] ||= []).push(fn); }
    destroy() { this.destroyed = true; }
  }
  class Graphics extends Container {
    constructor() { super(); this.circles = 0; }
    circle() { this.circles += 1; return this; }
    clear() { this.circles = 0; return this; }
  }
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke']) {
    Graphics.prototype[verb] = function chain() { return this; };
  }
  class Sprite extends Container {
    constructor(texture) { super(); this.texture = texture; }
  }
  const Texture = { WHITE: { white: true }, from: (canvas) => ({ canvas, source: { updates: 0, update() { this.updates += 1; } } }) };
  class ColorMatrixFilter {}
  class Filter { constructor(o) { Object.assign(this, o); } }
  class UniformGroup { constructor(u) { this.uniforms = {}; for (const k in u) this.uniforms[k] = u[k].value; } update() {} }
  const GlProgram = { from: (o) => o };
  const GpuProgram = { from: (o) => o };
  return { Container, Graphics, Sprite, Texture, ColorMatrixFilter, Filter, UniformGroup, GlProgram, GpuProgram };
}

/** A document whose canvases keep the stops last painted into them. */
function withDocument(fn) {
  const had = 'document' in globalThis;
  const was = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const canvas = { painted: [] };
      canvas.getContext = () => ({
        createLinearGradient: () => {
          const stops = [];
          canvas.painted.push(stops);
          return { addColorStop: (at, c) => stops.push([at, c]) };
        },
        fillRect() {},
      });
      return canvas;
    },
  };
  try {
    return fn();
  } finally {
    if (had) globalThis.document = was;
    else delete globalThis.document;
  }
}

function buildView(tsid) {
  const s = street(tsid);
  const PIXI = fakePixi();
  const root = withDocument(() => buildStreetView({ ...s, signposts: [] }, PIXI, { available: new Set() }));
  root.updateParallax(0, 0, 1000, 600, 732);
  return { s, root };
}

const gradientOf = (root) => root.skyView.children.find((c) => c.texture?.canvas);
const lastPaint = (root) => gradientOf(root).texture.canvas.painted.at(-1);

describe('#749: an outdoor street\'s own sky follows the clock', () => {
  it('Baqala at night paints a different, darker gradient than by day, with stars', () => {
    const { s, root } = buildView(BAQALA);
    assert.ok(skyFollowsClock(s), ownSkyReason(s));
    const day = lastPaint(root).map((stop) => stop.join(' '));
    assert.deepEqual(day, [`0 #${s.gradient.top}`, `1 #${s.gradient.bottom}`], 'built with its own two colours');
    assert.equal(typeof root.setSkyLook, 'function', 'the street view can take the clock\'s sky');
    assert.equal(root.setSkyLook(skyLook(s.gradient.top, s.gradient.bottom, NIGHT)), true);
    const night = lastPaint(root);
    assert.notDeepEqual(night.map((stop) => stop.join(' ')), day, 'the night gradient is not the day one');
    assert.equal(night.length, 3);
    for (const [, c] of night) assert.ok(luma(hex(c.slice(1))) < 110, `${c} is a night colour`);
    assert.ok(luma(hex(night[0][1].slice(1))) < 40, 'a dark top');
    assert.ok(gradientOf(root).texture.source.updates >= 1, 'the texture uploads again');
    const [base, cap] = root.skyView.children;
    assert.equal(cap.tint, hex(night[0][1].slice(1)), 'the cap above the layer carries the night top');
    assert.equal(base.tint, hex(night[2][1].slice(1)), 'the base carries the night bottom');
    const stars = root.skyView.children.find((c) => c.label === 'sky-stars');
    assert.ok(stars?.visible && stars.alpha === 1 && stars.circles > 50, 'stars at night');
    assert.ok(root.skyView.children.indexOf(stars) > root.skyView.children.indexOf(gradientOf(root)), 'over the gradient');
    // The stage band over a short street follows the shifted sky, not the daytime one.
    root.updateParallax(0, 0, 1000, 600, 732);
    assert.ok(luma(root.viewSkyTop) < 60);
  });

  it('by day the street\'s own sky comes back exactly, stars hidden, layers untinted', () => {
    const { s, root } = buildView(BAQALA);
    const own = lastPaint(root).map((stop) => stop.join(' '));
    const [base, cap] = root.skyView.children;
    const before = { base: base.tint, cap: cap.tint };
    root.setSkyLook(skyLook(s.gradient.top, s.gradient.bottom, NIGHT));
    assert.equal(root.setSkyLook(skyLook(s.gradient.top, s.gradient.bottom, DAY)), true);
    assert.deepEqual(lastPaint(root).map((stop) => stop.join(' ')), own);
    assert.deepEqual({ base: base.tint, cap: cap.tint }, before);
    assert.equal(root.skyView.children.find((c) => c.label === 'sky-stars').visible, false);
    for (const lc of root.layerContainers) assert.equal(lc.tint, 0xffffff, lc.label);
    assert.equal(root.skyLookNow(), null);
  });

  it('the far layers take the tint by depth on Hechey Track (the furthest the most), the front ones none', () => {
    const { s, root } = buildView(HECHEY);
    root.setSkyLook(skyLook(s.gradient.top, s.gradient.bottom, NIGHT));
    const far = root.layerContainers.filter((lc) => lc.zIndex < 0).sort((a, b) => a.zIndex - b.zIndex);
    assert.ok(far.length >= 2, 'Hechey Track has layers behind the middleground');
    const lumas = far.map((lc) => luma(lc.tint));
    assert.ok(lumas[0] < lumas.at(-1), `the furthest is darkest: ${lumas.map(Math.round)}`);
    assert.ok(lumas.every((l) => l < 255));
    for (const lc of root.layerContainers.filter((c) => c.zIndex >= 0)) assert.equal(lc.tint, 0xffffff, lc.label);
  });

  it('an unchanged look does nothing (once a game minute: the look is taken at the whole minute)', () => {
    const { s, root } = buildView(BAQALA);
    const a = skyLook(s.gradient.top, s.gradient.bottom, 19 + 31 / 60 + 0.1 / 60);
    const b = skyLook(s.gradient.top, s.gradient.bottom, 19 + 31 / 60 + 0.9 / 60);
    assert.equal(a.key, b.key, 'the same game minute is the same sky');
    assert.equal(root.setSkyLook(a), true);
    const paints = gradientOf(root).texture.canvas.painted.length;
    assert.equal(root.setSkyLook(b), false);
    assert.equal(gradientOf(root).texture.canvas.painted.length, paints, 'no repaint');
    assert.notEqual(skyLook(s.gradient.top, s.gradient.bottom, 18.5).key, a.key, 'an hour earlier is another sky');
  });

  it('the looks: dawn and dusk warm, night dark blue with stars, day the street\'s own; the world tint halves at dawn and dusk', () => {
    const top = '678EB8';
    const bottom = 'FFCF54';
    const day = skyLook(top, bottom, DAY);
    assert.equal(day.day, true);
    assert.equal(day.stars, 0);
    assert.equal(day.worldTint, 1);
    assert.deepEqual([day.stops[0], day.stops[2]], [hex(top), hex(bottom)]);
    const dawn = skyLook(top, bottom, DAWN);
    const dusk = skyLook(top, bottom, DUSK);
    const night = skyLook(top, bottom, NIGHT);
    for (const warm of [dawn, dusk]) {
      assert.equal(warm.day, false);
      const mid = warm.stops[1];
      assert.ok(((mid >> 16) & 255) > (mid & 255), 'a warm middle (red over blue)');
      assert.equal(warm.worldTint, 0.5);
    }
    assert.equal(night.stars, 1);
    assert.equal(night.worldTint, 1);
    for (const c of night.stops.slice(0, 2)) assert.ok((c & 255) > ((c >> 16) & 255), 'night is blue overhead');
    assert.ok(luma(night.stops[0]) < 30);
    // Blends between keys, the weights always whole.
    for (let h = 0; h < 24; h += 0.25) {
      const w = skyPhaseWeights(h);
      assert.ok(Math.abs(w.day + w.dawn + w.dusk + w.night - 1) < 1e-9, `${h}`);
    }
    assert.equal(skyPhaseWeights(5.375).night, 0.5);
    assert.equal(skyPhaseWeights(5.375).dawn, 0.5);
    assert.equal(gradientColourAt([0, 0x808080, 0xffffff], 0.5, 0.5), 0x808080);
    assert.equal(farLayerTint(0x000000, 1), 0x000000);
    assert.equal(farLayerTint(0xffffff, 0), 0xffffff);
    assert.deepEqual(starField(300, 300, 7), starField(300, 300, 7), 'the same stars every night');
  });
});

describe('#749: indoor and special places keep their own sky', () => {
  const catalog = JSON.parse(read('public/assets/content/street-ecology.json'));
  setStreetEcologyCatalog(catalog);
  const keeps = (s, interior = false) => assert.equal(skyFollowsClock(s, { interior }), false, `${s.label}: ${ownSkyReason(s, { interior })}`);

  it('the outdoor mockup streets follow it', () => {
    for (const tsid of [BAQALA, HECHEY]) {
      const s = street(tsid);
      assert.equal(ownSkyReason(s, { interior: ecologyForStreet(tsid)?.interior === true }), null, s.label);
    }
  });

  it('a house, a scene (quest room, party, Bureaucratic Hall, races) and a hubless street keep theirs', () => {
    keeps({ tsid: 'home', hubId: 'home', gradient: { top: '8EB8D8', bottom: 'FFFFFF' } });
    keeps({ tsid: 'q', hubId: 'scene', gradient: { top: '8EB8D8', bottom: 'FFFFFF' } });
    keeps(street('GHFFV931FRF3TMS')); // Game of Crowns, a quest street with no hub
    keeps(street('GHFQOLEIHN63P27')); // Radial Heights, a Paradise level
  });

  it('caves, Naraka, quest, party and Vortex hubs keep theirs', () => {
    for (const [tsid, hub] of [
      ['GHH101L162117H2', '50'], // The Entrance, Ilmenskie Caverns
      ['GA9ENT2CRE22NFB', '78'], // Amant Kudos, Ilmenskie Deeps
      ['GIF102FDNU11314', '51'], // Ilmenskie, Uralia
      ['GA5REO5I9OE2KLS', '40'], // Dhuma Maya, Naraka
      ['GDOGBH4BG1E2BM0', '108'], // Double Rainbow, a party space
      ['GA9RM4IT05F3B4M', '143'], // Savanna Sunset, the Vortex of Random
    ]) {
      const s = street(tsid);
      assert.equal(String(s.hubId), hub);
      assert.ok(NO_SKY_HUBS[hub]);
      keeps(s);
    }
  });

  it('an indoor street in an outdoor hub, a place with its own light and a dark sky of its own keep theirs', () => {
    assert.ok(Object.values(catalog.streets).some((row) => row.interior === true), 'the catalog marks indoor streets');
    const indoor = { hubId: '58', gradient: { top: 'B5F8FF', bottom: 'B5FAFF' } };
    assert.equal(skyFollowsClock(indoor, { interior: true }), false);
    keeps({ hubId: '58', ownLight: true, gradient: { top: 'B5F8FF', bottom: 'B5FAFF' } });
    keeps(street('GA5FPUNAI7P2NVF')); // Hell Bar: ownLight
    keeps({ hubId: '133', label: 'Kloro', gradient: { top: '090A04', bottom: '376B4C' } }); // Kloro's dark sky
    // The setting: Night tint off is the 2012 sky at every hour.
    assert.equal(skyFollowsClock(street(BAQALA), { on: false }), false);
  });
});

describe('#749: the game asks for the sky at most once a game minute and from a street\'s first frame', () => {
  const src = read('public/game.js');
  it('updateDametimeChrome applies it and scales the world tint by its share', () => {
    const body = src.slice(src.indexOf('function updateDametimeChrome('), src.indexOf('const ATMOSPHERE_EASE_MS'));
    assert.ok(body.includes('const skyShare = applySkyClock(light);'));
    assert.ok(body.includes('* skyShare);'));
    const apply = src.slice(src.indexOf('function applySkyClock('), src.indexOf('function applySkyClock(') + 1200);
    assert.ok(apply.includes('skyClock.minute === minute'), 'an unchanged game minute returns early');
    assert.ok(apply.includes('nightTintOn() && skyFollowsClock('), 'Night tint off keeps the sky');
  });
  it('a street built applies it before its first frame', () => {
    const at = src.indexOf('bgLayer = buildStreetView(data, PIXI, {');
    assert.ok(at > 0);
    assert.ok(src.slice(at, at + 3000).includes('applySkyClock();'));
  });
});
