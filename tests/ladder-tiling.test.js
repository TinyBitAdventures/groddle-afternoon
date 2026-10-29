/**
 * Tiled ladders (Austin 2026-10-28: Guillermo Gamera Way's ladder at x 2304 had a climb prompt over
 * empty air). The client draws a ladder's `tiling` (LadderView → SurfaceView.tile(): cap_0 on top,
 * centers one every cap_1.h, cap_1 at the foot) above the middleground decos; only 9 ladders in the
 * location XML have one, and the first import kept just the first center's name.
 * Run: node --test tests/ladder-tiling.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LADDER_TILE_Z, ladderTilePieces } from '../public/js/ladder-tiling.js?v=g415-1';
import { extractLocationNavigation } from '../public/js/location-navigation.js?v=g442-6';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const manifest = new Set(JSON.parse(read('public/assets/decos/manifest.json')));
const clientRoot = join(here, '../../glitch-client/com/tinyspeck/engine');
const xmlRoot = join(here, '../../streets/mnt/stos/location_data');
const bundles = join(homedir(), 'Documents/glitch-audit/research/audio-hunt/raw/glitch-locations/glitch-location-swfs');
const python = '/opt/homebrew/bin/python3.11';

/** The 9 tiled ladders: street, x, y (foot), h. */
const TILED = [
  ['GLI11B92BD71UJA', -2228, -99, 650],
  ['GM4115NJ46G8M', 960, -79, 2900],
  ['GM410TMR0S2S1', 169, -1881, 300],
  ['GM410TMR0S2S1', -1153, -1371, 250],
  ['GTJ1KOM8N2O1EFS', -546, -530, 300],
  ['GM410QQ0CHARO', 1115, -388, 500],
  ['GM410QQ0CHARO', 1796, -903, 500],
  ['GM4109NI2R640', 2304, -1332, 250],
  ['GM4103L52ID23', -768, -58, 200],
];

let DECO_TWINS = {};
const hasArt = (name) => manifest.has(name) || manifest.has(DECO_TWINS[name]);

/** Pixi pieces buildStreetView touches; images "load" on the next tick. */
function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, visible: true });
      this.anchor = { x: 0, y: 0, set: (x, y = x) => Object.assign(this.anchor, { x, y }) };
      this.scale = { x: 1, y: 1, set: (x, y = x) => Object.assign(this.scale, { x, y }) };
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    removeChild(kid) {
      const i = this.children.indexOf(kid);
      if (i >= 0) this.children.splice(i, 1);
      return kid;
    }
    once(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Graphics extends Container {}
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke', 'circle']) {
    Graphics.prototype[verb] = function chain() {
      return this;
    };
  }
  class Sprite extends Container {
    constructor(texture) {
      super();
      this.texture = texture;
    }
  }
  class ImageSource {
    constructor(o) {
      Object.assign(this, o, { width: 1, height: 1, handlers: {} });
    }
    on(name, fn) {
      (this.handlers[name] ||= []).push(fn);
      return this;
    }
    once(name, fn) {
      return this.on(name, fn);
    }
    off() {
      return this;
    }
    emit(name, ...args) {
      for (const fn of this.handlers[name] || []) fn(...args);
    }
    resize(w, h) {
      Object.assign(this, { width: w, height: h });
      return true;
    }
    update() {}
  }
  class Texture {
    constructor(o) {
      Object.assign(this, o);
    }
  }
  class ColorMatrixFilter {}
  return { Container, Graphics, Sprite, ImageSource, Texture, ColorMatrixFilter, Rectangle: class {} };
}

before(async () => {
  ({ DECO_TWINS } = await import('../public/js/street-render.js?v=g449-1'));
});

describe('ladder tiling rule (SurfaceView.tile, vertical)', () => {
  it('matches the client source', { skip: !existsSync(clientRoot) && 'needs ../glitch-client' }, () => {
    const surface = readFileSync(join(clientRoot, 'view/geo/SurfaceView.as'), 'utf8');
    assert.match(surface, /_cap_0\.y = _getVerticalMin\(\);/);
    assert.match(surface, /_cap_1\.y = _getVerticalMax\(\)-deco\.h;/);
    assert.match(surface, /center_tile_l = \(_orient == 'horiz'\) \? deco\.w : deco\.h;/);
    assert.match(surface, /_center\.y = _getVerticalMin\(\)\+surface\.tiling\.cap_0\.h;/);
    assert.match(surface, /i<Math\.floor\(\(_length-\(2\*center_tile_l\)\)\/center_tile_l\)/);
    assert.match(surface, /tiling\.addChild\(_cap_0\);\s*tiling\.addChild\(_center\);\s*tiling\.addChild\(_cap_1\);/);
    const ladder = readFileSync(join(clientRoot, 'view/geo/LadderView.as'), 'utf8');
    assert.match(ladder, /return -\(ladder\.h\);/);
    const mg = readFileSync(join(clientRoot, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    assert.match(mg, /public function addLadderView\(ladderView:LadderView, ladder:Ladder\):void \{\s*addGeo\(ladderView as LadderView\);/);
    // Decos go under the DECO marker (LayerRenderer.setupEndShapes); GEO comes after, then items and avatars.
    assert.match(readFileSync(join(clientRoot, 'view/renderer/LayerRenderer.as'), 'utf8'), /addChild\(DECO\);/);
    assert.ok(mg.indexOf('addChild(GEO)') < mg.indexOf('addChild(NRM_ITEM)'));
    assert.ok(mg.indexOf('addChild(GEO)') < mg.indexOf('addChild(YOUR_AVATAR)'));
  });

  it('tiles Guillermo Gamera Way’s ladder over its full height', () => {
    const ladder = street('GM4109NI2R640').ladders.find((l) => l.x === 2304);
    assert.equal(ladder.h, 250);
    const pieces = ladderTilePieces(ladder, hasArt);
    assert.deepEqual(pieces.map((p) => p.part), ['cap_0', 'center', 'center', 'center', 'cap_1']);
    for (const p of pieces) {
      assert.equal(p.sprite, 'ladder_tile_center_01_spine');
      assert.equal(p.x, -16);
      assert.deepEqual([p.w, p.h], [31, 50]);
    }
    // Top to foot, edge to edge: -250 .. 0.
    const spans = pieces.map((p) => [p.y, p.y + p.h]).sort((a, b) => a[0] - b[0]);
    assert.equal(spans[0][0], -ladder.h);
    assert.equal(spans.at(-1)[1], 0);
    for (let i = 1; i < spans.length; i++) assert.equal(spans[i][0], spans[i - 1][1]);
  });

  it('uses the pattern, falls back to the first center with art, and needs both caps', () => {
    const piece = (sprite) => ({ sprite, w: 70, h: 50 });
    const ladder = { h: 350, tiling: { cap_0: piece('a'), cap_1: piece('b'), centers: [piece('c0'), piece('c1')], pattern: [1, 0, 5] } };
    assert.deepEqual(ladderTilePieces(ladder).filter((p) => p.part === 'center').map((p) => p.sprite), ['c1', 'c0', 'c0', 'c1', 'c0']);
    assert.deepEqual(ladderTilePieces(ladder, (s) => s !== 'c1').filter((p) => p.part === 'center').map((p) => p.sprite), ['c0', 'c0', 'c0', 'c0', 'c0']);
    assert.deepEqual(ladderTilePieces(ladder, (s) => s !== 'b'), []);
    assert.deepEqual(ladderTilePieces(ladder, (s) => !/^c/.test(s)), []);
    assert.deepEqual(ladderTilePieces({ h: 200 }), []);
    // A ladder of exactly two caps has no centers.
    assert.deepEqual(ladderTilePieces({ ...ladder, h: 100 }).map((p) => p.part), ['cap_0', 'cap_1']);
  });
});

describe('street data (build-street-navigation.mjs, js/location-navigation.js readTiling)', () => {
  it('keeps both caps, every center and the pattern for all 9 tiled ladders', () => {
    for (const [tsid, x, y, h] of TILED) {
      const l = street(tsid).ladders.find((r) => r.x === x && r.y === y);
      assert.ok(l, `${tsid} ${x}`);
      assert.equal(l.h, h);
      const t = l.tiling;
      assert.ok(t.cap_0?.sprite && t.cap_1?.sprite && t.centers?.length, `${tsid} ${x}`);
      assert.equal(t.pattern.length, Math.floor((h - 2 * t.cap_1.h) / t.cap_1.h), `${tsid} ${x} pattern`);
    }
    const snool = street('GTJ1KOM8N2O1EFS').ladders.find((l) => l.tiling).tiling;
    assert.deepEqual(snool.centers.map((c) => c.sprite), ['ladder_tile_center_01_stone', 'ladder_tile_center_02_stone', 'ladder_tile_center_03_stone']);
    assert.deepEqual(snool.pattern, [0, 2, 2, 1]);
    const lapulapu = street('GLI11B92BD71UJA').ladders.find((l) => l.tiling).tiling;
    assert.equal(lapulapu.cap_1.sprite, 'ladder_tile_cap_1_basicWood');
  });

  it('no other imported ladder has a tiling', () => {
    const index = JSON.parse(read('public/assets/streets/index.json')).streets;
    let tiled = 0;
    for (const meta of Object.values(index)) {
      const path = join(here, '..', 'public', meta.file);
      if (!existsSync(path)) continue;
      for (const l of JSON.parse(readFileSync(path, 'utf8')).ladders || []) if (l.tiling) tiled += 1;
    }
    assert.equal(tiled, TILED.length);
  });

  it('reads the tiling from the location XML', { skip: !existsSync(xmlRoot) && 'needs ../streets' }, () => {
    const nav = extractLocationNavigation(readFileSync(join(xmlRoot, 'GTJ1KOM8N2O1EFS.xml'), 'utf8'));
    const t = nav.ladders.find((l) => l.tiling).tiling;
    assert.deepEqual(t.cap_1, { sprite: 'ladder_tile_center_01_stone', w: 71, h: 50 });
    assert.deepEqual(t.centers.map((c) => c.w), [71, 73, 73]);
    assert.deepEqual(t.pattern, [0, 2, 2, 1]);
  });

  it('has art for the tiles the street bundles carry; Snool’s stone tiling stays undrawn', () => {
    for (const n of ['ladder_tile_center_01_spine', 'groddle_ladder_tile_center_00_basicWood', 'groddle_ladder_tile_cap_1_basicWood']) {
      assert.ok(manifest.has(n), n);
      assert.ok(existsSync(join(here, '..', 'public/assets/decos/groddle', `${n}.webp`)), n);
    }
    const drawn = TILED.map(([tsid, x, y]) => ladderTilePieces(street(tsid).ladders.find((r) => r.x === x && r.y === y), hasArt).length);
    // Lapulapu 13, Groddle Ladder 58, Ruta 6 and 5, Snool 0 (its own decos draw it), Flipside 10 x2, Guillermo 5, Old Main 4.
    assert.deepEqual(drawn, [13, 58, 6, 5, 0, 10, 10, 5, 4]);
    // Tiny Speck re-laid Snool's ladder as arbito_ tile decos.
    const snoolDecos = street('GTJ1KOM8N2O1EFS').layers.find((l) => l.id === 'middleground').decos.filter((d) => /^arbito_ladder_tile/.test(d.sprite) && Math.abs(d.x + 546) < 5);
    assert.equal(snoolDecos.length, 5);
  });
});

describe('tile art (tools/build-ladder-tiles.py)', () => {
  it('--check: every tiling class its street bundle carries is a shipped deco', { skip: !(existsSync(bundles) && existsSync(python)) && 'needs the glitch-locations bundles and python3.11' }, () => {
    const out = execFileSync(python, ['-I', join(here, '../tools/build-ladder-tiles.py'), '--check'], { encoding: 'utf8' });
    assert.match(out, /3 tiling classes, 5 pieces with no class \(left undrawn\); 0 problems/);
  });
});

describe('buildStreetView draws the tiles', () => {
  it('adds them to the middleground above its decos, at the ladder', async () => {
    globalThis.PIXI = fakePixi();
    globalThis.Image = class {
      set src(v) {
        this._src = v;
        this.naturalWidth = 63;
        this.naturalHeight = 100;
        setTimeout(() => this.onload?.(), 0);
      }
    };
    const { buildStreetView } = await import('../public/js/street-render.js?v=g449-1');
    const { worldToScreen } = await import('../public/js/street-model.js?v=g442-6');
    const s = { ...street('GM4109NI2R640'), gradient: null, signposts: [] };
    const root = buildStreetView(s, globalThis.PIXI, { available: new Set(['ladder_tile_center_01_spine']) });
    assert.equal(root.ladderTiles, 5);
    const mg = root.children.find((c) => c.label === 'middleground');
    const tiles = mg.children.filter((c) => c.glitchLadderId);
    assert.equal(tiles.length, 5);
    const foot = worldToScreen(s, 2304, -1332);
    assert.deepEqual(tiles.map((t) => t.y - foot.y), [-250, -200, -150, -100, -50]);
    for (const t of tiles) {
      assert.equal(t.x, foot.x - 16);
      assert.equal(t.zIndex, LADDER_TILE_Z);
      assert.match(t.texture.label, /ladder_tile_center_01_spine/);
    }
    const decoZ = s.layers.find((l) => l.id === 'middleground').decos.map((d) => d.z || 0);
    assert.ok(Math.max(...decoZ) < LADDER_TILE_Z);
    await new Promise((r) => setTimeout(r, 20));
    for (const t of tiles) assert.deepEqual([t.width, t.height], [31, 50]);
    // Snool's stone tiling has no art under its own names: nothing drawn.
    const snool = buildStreetView({ ...street('GTJ1KOM8N2O1EFS'), gradient: null, signposts: [] }, globalThis.PIXI, { available: manifest });
    assert.equal(snool.ladderTiles, 0);
  });
});
