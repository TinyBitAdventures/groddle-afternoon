/**
 * G435: street decos play where the original played them. The client stops a placed deco on its
 * first frame unless the placement is flagged animated (DecoRenderer.as 301-305), then runs the
 * deco's timeline at the stage's 30 fps (TSEngineConstants.TARGET_FRAMERATE). The flag comes from
 * the location XML (build-street-layers.mjs), the frame strips from the bundle SWFs
 * (tools/deco-pipeline/animate.py), and js/street-render.js plays them (js/deco-anim.js).
 * Run: node --test tests/deco-anim.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ANIM_DECOS } from '../public/js/deco-anim-list.js?v=g435-1';
import { ANIM_FPS, clockFrame, isAnimatedDeco, pickStrip, stripFrames, timelineTextures } from '../public/js/deco-anim.js?v=g443-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const python = '/opt/homebrew/bin/python3.11';
const xmlRoot = join(root, '../streets/mnt/stos/location_data');
const locations = join(homedir(), 'Documents/glitch-audit/research/audio-hunt/raw/glitch-locations');
const clientRoot = join(root, '../glitch-client/com/tinyspeck/engine');
const streetsDir = join(root, 'public/assets/streets');
const plan = JSON.parse(read('tools/deco-pipeline/animated.json'));
const rows = Object.fromEntries(plan.decos.map((r) => [r.name, r]));
const anim = (n) => JSON.parse(read(`public/assets/decos/animated/${n}.json`));

/** Width and height from a WebP header (VP8, VP8L or VP8X). */
function webpSize(path) {
  const b = readFileSync(path);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

function animatedPlacements() {
  const out = new Map();
  for (const f of readdirSync(streetsDir)) {
    if (!/^[GL][A-Z0-9]+\.json$/.test(f)) continue;
    const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    for (const l of s.layers || []) for (const d of l.decos || []) if (d.animated) out.set(d.sprite, (out.get(d.sprite) || 0) + 1);
  }
  return out;
}

describe('animated flags from the location XML (G435)', () => {
  it('the client plays a placement only when it is flagged animated, at 30 fps', { skip: !existsSync(clientRoot) && 'needs ../glitch-client' }, () => {
    const renderer = readFileSync(join(clientRoot, 'view/renderer/DecoRenderer.as'), 'utf8');
    assert.match(renderer, /if \(_deco\.animated\) \{\s*MCUtil\.recursivePlay\(decoAsset\);\s*\} else \{\s*MCUtil\.recursiveGotoAndStop\(decoAsset, 0\);/);
    assert.match(readFileSync(join(clientRoot, 'model/TSEngineConstants.as'), 'utf8'), /TARGET_FRAMERATE:int = 30;/);
    assert.equal(ANIM_FPS, 30);
  });

  it('carries every animated placement into the street JSON (908 on 100 streets)', () => {
    const placed = animatedPlacements();
    const total = [...placed.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, 908);
    assert.equal(placed.get('Glints_3'), 50);
    assert.equal(placed.get('bubble_test'), 6);
    assert.equal(placed.get('stars_fade'), 8);
    // Only the flag: the street builder writes `animated: true` or nothing.
    const s = JSON.parse(read('public/assets/streets/GUVVASOS2FC3J3Q.json'));
    const stars = s.layers.flatMap((l) => l.decos || []).filter((d) => d.sprite === 'stars_fade');
    assert.deepEqual(stars.map((d) => d.animated ?? false), Array(8).fill(true));
  });

  it('build-street-layers.mjs --check: the JSON matches the XML', { skip: !existsSync(xmlRoot) && 'needs ../streets (locations-xml.zip)' }, () => {
    const out = execFileSync('node', [join(root, 'build-street-layers.mjs'), '--check'], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.match(out, / 908 animated decos/);
  });
});

describe('frame strips (tools/deco-pipeline/animate.py)', () => {
  it('lists every animated deco that has more than one frame, and why the rest stay still', () => {
    const placed = animatedPlacements();
    for (const [n, count] of placed) {
      const r = rows[n];
      assert.ok(r, `${n} in animated.json`);
      assert.equal(r.placements, count, n);
      if (r.skip) assert.ok(!ANIM_DECOS.has(n), `${n} skipped (${r.skip}) but listed`);
      else assert.ok(ANIM_DECOS.has(n), `${n} not in js/deco-anim-list.js`);
    }
    // One-frame timelines with nothing nested: Umbra's 454 sky tiles and one grass.
    assert.match(rows.k02_sky_2000x500.skip, /^static/);
    assert.match(rows.grass_solid.skip, /^static/);
    assert.ok(ANIM_DECOS.size >= 50, `${ANIM_DECOS.size}`);
  });

  it('loops match the SWF timelines', () => {
    // Root timelines.
    assert.equal(rows.WindCurl.frames, 27);
    assert.equal(rows.grass_transparent_4.frames, 80);
    assert.equal(rows.bubble_test.frames, 270);
    // A one-frame root whose nested clip plays: the clip's loop.
    assert.equal(rows.stars_fade.root, 1);
    assert.equal(rows.stars_fade.frames, 30);
    assert.equal(rows.floating_steam01.frames, 261);
    // Nested clips that do not divide the root: both loops, while within 600 frames.
    assert.equal(rows.Glints_3.frames, 600);
    assert.equal(rows.subway_interior_floor_light.frames, 120);
    // hell_yelling_head_v2's frame 350 script: gotoAndPlay("half blink").
    assert.ok(rows.hell_yelling_head_v2.loop_from > 0);
    for (const [n, [frames, loopFrom]] of ANIM_DECOS) {
      assert.equal(frames, rows[n].frames, n);
      assert.equal(loopFrom, rows[n].loop_from, n);
    }
  });

  it('every strip holds its sequence: frame counts, rects, WebP sizes', () => {
    for (const [n, [frames, loopFrom, three]] of ANIM_DECOS) {
      const d = anim(n);
      assert.equal(d.fps, 30, n);
      assert.equal(d.frames, frames, n);
      assert.equal(d.seq.length, frames, `${n}: sequence covers the loop`);
      assert.equal(d.loopFrom, loopFrom, n);
      assert.equal(d.strips.length, three ? 2 : 1, n);
      const unique = Math.max(...d.seq) + 1;
      assert.equal(new Set(d.seq).size, unique, `${n}: every stored frame is used`);
      for (const s of d.strips) {
        assert.equal(s.rects.length, unique, `${n} ${s.file}`);
        const path = join(root, 'public/assets/decos/animated', s.file);
        assert.ok(existsSync(path), s.file);
        assert.deepEqual(webpSize(path), [s.w, s.h], s.file);
        assert.ok(s.w <= 4096 && s.h <= 4096, s.file);
        for (const [x, y, w, h, ox, oy] of s.rects) {
          assert.ok(x + w <= s.w && y + h <= s.h, `${s.file}: rect inside the atlas`);
          assert.ok(ox + w <= Math.round(d.size[0] * s.res) + 1 && oy + h <= Math.round(d.size[1] * s.res) + 1, `${s.file}: trim inside the frame`);
        }
      }
      // The 2x strip has the still's logical size (the still and the loop swap in place).
      if (existsSync(join(root, `public/assets/decos/groddle/${n}.webp`))) {
        assert.deepEqual(webpSize(join(root, `public/assets/decos/groddle/${n}.webp`)), d.size, `${n}: still and strip size`);
      }
    }
  });

  it('keeps the art within budget', () => {
    const s = plan.summary;
    assert.ok(s.webp_bytes < 32 * 1024 * 1024, `${s.webp_bytes} bytes of WebP`);
    for (const r of plan.decos.filter((x) => x.strips)) for (const st of r.strips) assert.ok(st.decoded <= 24 << 20, `${r.name} ${st.file}`);
  });

  it('animate.py --check: strips, JSON, plan and list current', { skip: (!existsSync(python) && 'needs python3.11') || (!existsSync(locations) && 'needs glitch-locations') }, () => {
    const out = execFileSync(python, ['-I', join(root, 'tools/deco-pipeline/animate.py'), '--check'], { encoding: 'utf8', timeout: 600000 });
    assert.match(out, / 0 problems$/m);
  });
});

describe('the loop clock and strip choice (js/deco-anim.js)', () => {
  it('counts 30 frames a second, then loops from the loop start', () => {
    assert.equal(clockFrame(0, 0, 10), 0);
    assert.equal(clockFrame(1000 / 30 + 0.1, 0, 10), 1);
    assert.equal(clockFrame(1000, 0, 10), 0); // frame 30 of a 10-frame loop
    assert.equal(clockFrame(1000, 0, 100), 30);
    // 350 frames, loop from 200: frame 360 is 200 + 10.
    assert.equal(clockFrame(12000, 0, 350, 200), 210);
  });

  it('picks the 3x strip only where the still would be 3x', () => {
    const json = { strips: [{ density: 1, file: 'a.webp' }, { density: 1.5, file: 'a@1.5x.webp' }] };
    assert.equal(pickStrip(json, { resolution: 1 }).density, 1);
    assert.equal(pickStrip(json, { resolution: 3.3 }).density, 1.5);
    assert.equal(pickStrip(json, { resolution: 3.3, far: true }).density, 1);
    assert.equal(pickStrip(json, { resolution: 3.3, blur: 4 }).density, 1);
    assert.equal(pickStrip({ strips: [json.strips[0]] }, { resolution: 3.3 }).density, 1);
  });

  it('cuts trimmed frames with the deco\'s full size as their orig', () => {
    const PIXI = { Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }, Texture: class { constructor(o) { Object.assign(this, o); } } };
    const strip = { res: 0.5, rects: [[0, 0, 10, 20, 4, 6], [12, 0, 0, 0, 0, 0]] };
    const frames = stripFrames(PIXI, { uid: 1 }, strip, [100, 80]);
    assert.deepEqual([frames[0].frame.x, frames[0].frame.width, frames[0].frame.height], [0, 20, 40]);
    assert.deepEqual([frames[0].trim.x, frames[0].trim.y], [8, 12]);
    assert.deepEqual([frames[0].orig.width, frames[0].orig.height], [100, 80]);
    assert.deepEqual([frames[1].frame.width, frames[1].orig.width], [2, 100]);
    assert.deepEqual(timelineTextures(frames, [0, 0, 1, 0]).map((t) => frames.indexOf(t)), [0, 0, 1, 0]);
  });

  it('plays only flagged placements of listed decos', () => {
    assert.equal(isAnimatedDeco({ sprite: 'WindCurl', animated: true }), true);
    assert.equal(isAnimatedDeco({ sprite: 'WindCurl' }), false);
    assert.equal(isAnimatedDeco({ sprite: 'k02_sky_2000x500', animated: true }), false);
  });
});

/** Pixi pieces buildStreetView touches, with an AnimatedSprite; images load on the next tick. */
function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, visible: true, culled: false, zIndex: 0 });
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
    once(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    destroy() {
      this.destroyed = true;
      for (const fn of this.listeners.destroyed || []) fn();
    }
  }
  class Graphics extends Container {}
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke', 'circle']) Graphics.prototype[verb] = function chain() { return this; };
  class Sprite extends Container {
    constructor(texture) {
      super();
      this.texture = texture;
    }
    set width(v) { this.scale.x = v / (this.texture?.orig?.width || 1); }
    get width() { return Math.abs(this.scale.x) * (this.texture?.orig?.width || 1); }
    set height(v) { this.scale.y = v / (this.texture?.orig?.height || 1); }
    get height() { return Math.abs(this.scale.y) * (this.texture?.orig?.height || 1); }
  }
  class AnimatedSprite extends Sprite {
    constructor(textures) {
      super(textures[0]);
      this._textures = textures;
      this.playing = false;
      this.currentFrame = 0;
    }
    get textures() { return this._textures; }
    set textures(v) {
      this._textures = v;
      this.gotoAndStop(0);
    }
    gotoAndStop(f) {
      this.currentFrame = f;
      this.texture = this._textures[f];
      this.playing = false;
    }
    gotoAndPlay(f) {
      this.currentFrame = f;
      this.texture = this._textures[f];
      this.playing = true;
    }
    stop() { this.playing = false; }
  }
  let uid = 0;
  class ImageSource {
    constructor(o) {
      Object.assign(this, o, { width: 1, height: 1, handlers: {}, uid: ++uid });
    }
    on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
    once(name, fn) { return this.on(name, fn); }
    off() { return this; }
    emit(name, ...args) { for (const fn of this.handlers[name] || []) fn(...args); }
    resize(w, h) { Object.assign(this, { width: w, height: h }); return true; }
    update() {}
  }
  class Texture {
    constructor(o) {
      Object.assign(this, o);
      if (!this.orig) this.orig = { get width() { return o.source?.width || 1; }, get height() { return o.source?.height || 1; } };
    }
  }
  class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
  return { Container, Graphics, Sprite, AnimatedSprite, ImageSource, Texture, ColorMatrixFilter: class {}, Rectangle };
}

describe('street-render plays flagged decos and pauses them off screen', () => {
  it('Abhiman Himan: flagged decos are AnimatedSprites on their loop, the rest stay still', async () => {
    globalThis.PIXI = fakePixi();
    globalThis.Image = class {
      set src(v) {
        this._src = v;
        this.naturalWidth = 64;
        this.naturalHeight = 64;
        setTimeout(() => this.onload?.(), 0);
      }
    };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const m = /assets\/decos\/animated\/([^/?]+)\.json/.exec(String(url));
      if (!m) return { ok: false };
      return { ok: true, json: async () => anim(m[1]) };
    };
    try {
      const { buildStreetView } = await import('../public/js/street-render.js?v=g443-1');
      const manifest = new Set(JSON.parse(read('public/assets/decos/manifest.json')));
      const s = { ...JSON.parse(read('public/assets/streets/GUVBP2STKQJ24PT.json')), gradient: null, signposts: [] };
      // The fake has no colour filters: drop the layers' filters so nothing bakes.
      s.layers = s.layers.map((l) => ({ ...l, filters: null }));
      const renderer = { resolution: 1, gl: { getParameter: () => 8192 }, generateTexture: () => null, on() {}, off() {} };
      const view = buildStreetView(s, globalThis.PIXI, { available: manifest, renderer });
      const kids = [...view.children, ...view.frontView.children].filter((c) => c.children).flatMap((lc) => lc.children);
      const flagged = s.layers.flatMap((l) => (l.decos || []).filter((d) => d.animated && manifest.has(d.sprite)));
      const playing = kids.filter((c) => c.decoAnim);
      assert.equal(playing.length, flagged.length);
      assert.ok(playing.length >= 20, `${playing.length}`);
      // Unflagged placements of a deco that plays elsewhere stay plain sprites.
      assert.ok(kids.every((c) => !c.decoAnim || c instanceof globalThis.PIXI.AnimatedSprite));
      assert.ok(kids.filter((c) => !c.decoAnim).every((c) => !(c instanceof globalThis.PIXI.AnimatedSprite)));
      // Strips load: every flagged deco runs its loop from the street's clock.
      for (let i = 0; i < 50 && view.animStats().ready < flagged.length; i++) await new Promise((r) => setTimeout(r, 10));
      const stats = view.animStats();
      assert.equal(stats.ready, flagged.length);
      assert.equal(stats.playing, flagged.length);
      const glint = playing.find((c) => c.decoAnim.name === 'Glints_3');
      assert.equal(glint.textures.length, 600);
      assert.equal(glint.animationSpeed, 0.5);
      // Sized as the placement, from the strip's full-size frames.
      const deco = flagged.find((d) => d.sprite === 'Glints_3');
      const spr = playing.find((c) => c.decoAnim.name === 'Glints_3' && c.x === deco.x && c.y === deco.y);
      assert.ok(Math.abs(spr.width - deco.w) < 1e-6 && Math.abs(spr.height - deco.h) < 1e-6);
      // Culled off screen: stopped. Back on screen: playing again.
      view.cullDecos(-100000, -100000, 960, 540, true);
      assert.equal(view.animStats().playing, 0);
      assert.equal(view.animStats().stopped, flagged.length);
      view.cullDecos(0, 0, 1e6, 1e6, true);
      assert.equal(view.animStats().playing, flagged.length);
      view.destroy();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
