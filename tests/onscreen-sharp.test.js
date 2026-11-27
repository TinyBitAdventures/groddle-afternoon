/**
 * G961: the Scion of Purple drawn sharp (js/onscreen-sharp.js, js/sprite-onscreen.js,
 * js/features/purple-journey-feature.js). Its 3x frames load only while a Scion plays them, one
 * state ahead, and are destroyed once it fades; phones, low-memory devices, GPUs with a small
 * texture limit or no compressed format keep the 1x sheets and load nothing new.
 * Run: node --test tests/onscreen-sharp.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPRESSED_FORMATS,
  KTX_TRANSCODER,
  LOW_MEMORY_GB,
  createOnscreenSharp,
  largestAtlasSide,
  rendererCompressedFormats,
  sharpAllowed,
  textureBytes,
} from '../public/js/onscreen-sharp.js?v=75b8a30d';
import { ONSCREEN_SPRITES } from '../public/js/sprite-onscreen.js?v=cdeffc77';
import { POTION_ART } from '../public/js/potion-art.js?v=9d731b38';
import { scionHeldLabels, scionHoldChange, scionNextState } from '../public/js/features/purple-journey-feature.js?v=84d03380';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const SCION = POTION_ART.scion_of_purple.url;
const FADE = POTION_ART.scion_of_purple_fade.url;
const DESKTOP = { device: 'computer', resolution: 3, deviceMemory: 8, maxTextureSize: 16384, formats: ['rgba8unorm', 'bc7-rgba-unorm'] };

/** A Pixi stand-in: Rectangles, Textures that remember their layout, destroyable sources. */
function fakePixi() {
  class Rectangle {
    constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
  }
  class Texture {
    constructor(opts) { Object.assign(this, opts); this.destroyed = false; }
    destroy() { this.destroyed = true; }
  }
  return { Rectangle, Texture };
}

/** A loader whose loads finish when the test says (resolveAll), counting what it made. */
function fakeLoader() {
  const pending = [];
  const made = [];
  const load = (url, density) => new Promise((resolve) => {
    pending.push(() => {
      const source = { url, density, format: 'bc7-rgba-unorm', pixelWidth: 4096, pixelHeight: 1024, destroyed: false, destroy() { this.destroyed = true; } };
      made.push(source);
      resolve(source);
    });
  });
  const resolveAll = async () => {
    while (pending.length) pending.shift()();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { load, made, pending, resolveAll, urls: () => made.map((s) => s.url) };
}

describe('G961: who draws the Scion sharp', () => {
  it('a computer drawing at 1.5+ device px with a compressed format and room for the atlases', () => {
    assert.deepEqual(sharpAllowed(DESKTOP), { ok: true, reason: '' });
    assert.equal(sharpAllowed({ ...DESKTOP, deviceMemory: null }).ok, true, 'Safari and Firefox report no deviceMemory');
  });

  it('never a phone, a low-memory device, a small texture limit, no compressed format, or ?onscreensharp=off', () => {
    assert.equal(sharpAllowed({ ...DESKTOP, device: 'phone' }).reason, 'phone');
    assert.equal(sharpAllowed({ ...DESKTOP, resolution: 1 }).reason, 'resolution');
    assert.equal(sharpAllowed({ ...DESKTOP, deviceMemory: LOW_MEMORY_GB - 1 }).reason, 'low memory');
    assert.equal(sharpAllowed({ ...DESKTOP, maxTextureSize: 2048 }).reason, 'max texture size');
    assert.equal(sharpAllowed({ ...DESKTOP, formats: ['rgba8unorm'] }).reason, 'no compressed format');
    assert.equal(sharpAllowed({ ...DESKTOP, off: true }).reason, 'off');
  });

  it('the phone path loads nothing: hold() refuses and the loader is never called', async () => {
    const loader = fakeLoader();
    const sharp = createOnscreenSharp({ PIXI: fakePixi(), load: loader.load, allowed: sharpAllowed({ ...DESKTOP, device: 'phone' }) });
    for (const label of ['fadeIn', 'fadeOut']) assert.equal(sharp.hold(FADE, label), false);
    for (const label of ['talk', 'idle0', 'idle1', 'idle2']) assert.equal(sharp.hold(SCION, label), false);
    await loader.resolveAll();
    assert.equal(loader.made.length, 0);
    assert.equal(sharp.frames(SCION, 'talk'), null);
    assert.deepEqual(sharp.stats().held, []);
  });

  it('formats come from the game\'s own renderer (its WebGL 2 extensions or WebGPU features), not a side context', () => {
    const gl = (exts) => ({ getSupportedExtensions: () => exts, getExtension: (n) => (exts.includes(n) ? {} : null) });
    assert.deepEqual(rendererCompressedFormats({ gl: gl(['WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_astc']) }), ['astc-4x4-unorm', 'bc3-rgba-unorm']);
    assert.deepEqual(rendererCompressedFormats({ gl: gl(['EXT_texture_compression_bptc']) }), ['bc7-rgba-unorm']);
    assert.deepEqual(rendererCompressedFormats({ gl: gl([]) }), []);
    assert.equal(sharpAllowed({ ...DESKTOP, formats: rendererCompressedFormats({ gl: gl([]) }) }).ok, false);
    assert.deepEqual(rendererCompressedFormats({ gpu: { device: { features: new Set(['texture-compression-bc']) } } }), ['bc7-rgba-unorm', 'bc3-rgba-unorm']);
  });

  it('the feature asks with the phone gate\'s device, the drawn density, deviceMemory, the texture limit and the formats', () => {
    const src = readFileSync(join(pub, 'js/features/purple-journey-feature.js'), 'utf8');
    for (const bit of ['globalThis.GRODDLE_DEVICE', 'renderer.resolution', 'navigator?.deviceMemory', 'maxTextureSizeOf(renderer)', 'rendererCompressedFormats(renderer)', "param?.('onscreensharp') === 'off'"]) {
      assert.ok(src.includes(bit), bit);
    }
  });
});

describe('G961: load while on screen, release after', () => {
  it('a Scion holds the state it plays and the next: fadeIn, talk, idle0, idle1 or idle2, fadeOut', () => {
    assert.deepEqual(scionHeldLabels('fadeIn', 'idle2'), ['fadeIn', 'talk']);
    assert.deepEqual(scionHeldLabels('talk', 'idle2'), ['talk', 'idle0']);
    assert.deepEqual(scionHeldLabels('idle0', 'idle2'), ['idle0', 'idle2']);
    assert.deepEqual(scionHeldLabels('idle2', 'idle2'), ['idle2', 'fadeOut']);
    assert.deepEqual(scionHeldLabels('fadeOut', 'idle2'), ['fadeOut']);
    assert.equal(scionNextState('fadeOut', 'idle1'), null);
  });

  it('a Scion\'s whole life: each label fetched once, the one it never plays never fetched, all destroyed when it fades', async () => {
    const loader = fakeLoader();
    const sharp = createOnscreenSharp({ PIXI: fakePixi(), load: loader.load, allowed: sharpAllowed(DESKTOP) });
    const path = (label) => (label.startsWith('fade') ? FADE : SCION);
    const held = new Set();
    const step = async (state, gone = false) => {
      const { release, hold } = scionHoldChange(held, state, 'idle1', gone);
      for (const l of release) { sharp.release(path(l), l); held.delete(l); }
      for (const l of hold) if (sharp.hold(path(l), l)) held.add(l);
      await loader.resolveAll();
      return [...held].sort();
    };
    assert.deepEqual(await step('fadeIn'), ['fadeIn', 'talk']);
    assert.ok(sharp.frames(FADE, 'fadeIn').size > 0);
    assert.deepEqual(await step('talk'), ['idle0', 'talk']);
    const fadeInSources = loader.made.filter((s) => s.url.includes('.fadeIn.'));
    assert.ok(fadeInSources.length && fadeInSources.every((s) => s.destroyed), 'fadeIn destroyed once the Scion talks');
    assert.equal(sharp.frames(FADE, 'fadeIn'), null);
    assert.deepEqual(await step('idle0'), ['idle0', 'idle1']);
    assert.deepEqual(await step('idle1'), ['fadeOut', 'idle1']);
    assert.deepEqual(await step('fadeOut'), ['fadeOut']);
    assert.deepEqual(await step('fadeOut', true), []);
    assert.ok(loader.made.every((s) => s.destroyed), 'nothing outlives the Scion');
    assert.ok(!loader.urls().some((u) => u.includes('.idle2.')), 'idle2 was never played, never fetched');
    const atlases = (p, l) => ONSCREEN_SPRITES.get(p).groups[l].length;
    assert.equal(loader.made.length, ['fadeIn', 'fadeOut'].reduce((a, l) => a + atlases(FADE, l), 0) + ['talk', 'idle0', 'idle1'].reduce((a, l) => a + atlases(SCION, l), 0));
    assert.deepEqual(sharp.stats().held, []);
  });

  it('two Scions share a label; it goes only when both let go', async () => {
    const loader = fakeLoader();
    const sharp = createOnscreenSharp({ PIXI: fakePixi(), load: loader.load, allowed: sharpAllowed(DESKTOP) });
    sharp.hold(SCION, 'talk');
    sharp.hold(SCION, 'talk');
    await loader.resolveAll();
    sharp.release(SCION, 'talk');
    assert.ok(sharp.frames(SCION, 'talk'));
    assert.ok(loader.made.every((s) => !s.destroyed));
    sharp.release(SCION, 'talk');
    assert.equal(sharp.frames(SCION, 'talk'), null);
    assert.ok(loader.made.every((s) => s.destroyed));
  });

  it('a label let go before it arrived is destroyed on arrival, never drawn', async () => {
    const loader = fakeLoader();
    const ready = [];
    const sharp = createOnscreenSharp({ PIXI: fakePixi(), load: loader.load, allowed: sharpAllowed(DESKTOP), onReady: (p, l) => ready.push(l) });
    sharp.hold(SCION, 'idle2');
    sharp.release(SCION, 'idle2');
    await loader.resolveAll();
    assert.ok(loader.made.length > 0 && loader.made.every((s) => s.destroyed));
    assert.deepEqual(ready, []);
  });

  it('frames keep the 1x cell (orig) and sit where the 3x frame sits in it (trim), in 1x units', async () => {
    const loader = fakeLoader();
    const sharp = createOnscreenSharp({ PIXI: fakePixi(), load: loader.load, allowed: sharpAllowed(DESKTOP) });
    sharp.hold(SCION, 'talk');
    await loader.resolveAll();
    const art = ONSCREEN_SPRITES.get(SCION);
    const [cell, x, y, w, h, cx, cy] = art.groups.talk[0][3][0];
    const t = sharp.frames(SCION, 'talk').get(cell);
    assert.deepEqual([t.orig.width, t.orig.height], [POTION_ART.scion_of_purple.cellW, POTION_ART.scion_of_purple.cellH]);
    assert.deepEqual([t.frame.x, t.frame.y, t.frame.width, t.frame.height], [x / 3, y / 3, w / 3, h / 3]);
    assert.deepEqual([t.trim.x, t.trim.y], [cx / 3, cy / 3]);
    sharp.releaseAll();
    assert.ok(t.destroyed);
  });

  it('a compressed atlas counts a byte a texel in the GPU figures, RGBA four', () => {
    assert.equal(textureBytes({ pixelWidth: 100, pixelHeight: 10, format: 'bc7-rgba-unorm' }), 1000);
    assert.equal(textureBytes({ pixelWidth: 100, pixelHeight: 10, format: 'astc-4x4-unorm' }), 1000);
    assert.equal(textureBytes({ pixelWidth: 100, pixelHeight: 10, format: 'rgba8unorm' }), 4000);
    assert.equal(textureBytes({ pixelWidth: 100, pixelHeight: 10 }), 4000);
  });
});

describe('G961: the Scion\'s 3x atlases', () => {
  const ktx2 = (file) => {
    const b = readFileSync(join(pub, file));
    assert.equal(b.toString('latin1', 1, 7), 'KTX 20', file);
    return { w: b.readUInt32LE(20), h: b.readUInt32LE(24), supercompression: b.readUInt32LE(44) };
  };

  it('both Scion sheets, every label the feature plays, every non-blank cell', () => {
    for (const name of ['scion_of_purple', 'scion_of_purple_fade']) {
      const art = POTION_ART[name];
      const entry = ONSCREEN_SPRITES.get(art.url);
      assert.ok(entry, name);
      assert.deepEqual([entry.density, entry.fw, entry.fh], [3, art.cellW, art.cellH]);
      assert.deepEqual(Object.keys(entry.groups).sort(), Object.keys(art.labels).sort());
      for (const [label, [start, count]] of Object.entries(art.labels)) {
        const cells = entry.groups[label].flatMap(([, , , frames]) => frames.map((f) => f[0])).sort((a, b) => a - b);
        assert.ok(cells.every((c) => c >= start && c < start + count), `${name} ${label}`);
        // The fade's last cell is blank (tests/sheet-blank-cells.test.js); it keeps its 1x frame.
        assert.ok(cells.length >= count - 1, `${name} ${label}: ${cells.length} of ${count}`);
      }
    }
  });

  it('each atlas is a Basis KTX2 of its listed size, on the 4 px block grid, within 4096; boxes inside it and their cell', () => {
    for (const entry of ONSCREEN_SPRITES.values()) {
      for (const atlases of Object.values(entry.groups)) {
        for (const [file, w, h, frames] of atlases) {
          assert.ok(existsSync(join(pub, file)), file);
          const k = ktx2(file);
          assert.deepEqual([k.w, k.h], [w, h], file);
          assert.equal(k.supercompression, 1, `${file}: BasisLZ (ETC1S)`);
          assert.ok(w % 4 === 0 && h % 4 === 0 && w <= 4096 && h <= 4096, file);
          for (const [cell, x, y, fw, fh, cx, cy] of frames) {
            assert.ok(x % 4 === 0 && y % 4 === 0, `${file} cell ${cell}: off the block grid`);
            assert.ok(x + fw <= w && y + fh <= h, `${file} cell ${cell}: outside the atlas`);
            assert.ok(cx >= 0 && cy >= 0 && cx + fw <= entry.fw * 3 && cy + fh <= entry.fh * 3, `${file} cell ${cell}: outside its cell`);
          }
        }
      }
    }
    assert.ok(largestAtlasSide() <= 4096);
  });

  it('frame-matched to the 1x cells, provenance in tools/vector-sprites/results.json', () => {
    const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
    for (const path of ONSCREEN_SPRITES.keys()) {
      const r = results[path];
      assert.equal(r.status, 'ok', path);
      assert.match(r.swf, /inhabitants\/scion_of_purple\/purple_apparition\.swf$/);
      assert.ok(r.score >= 0.95 && r.minFrame >= 0.9, `${path}: ${r.score} / ${r.minFrame}`);
      assert.deepEqual(r.onScreen.groups, Object.fromEntries(Object.entries(ONSCREEN_SPRITES.get(path).groups).map(([l, a]) => [l, a.map(([file, w, h, frames]) => ({ file, w, h, bytes: r.onScreen.groups[l].find((x) => x.file === file).bytes, frames }))])));
    }
  });

  it('the transcoder is served from vendor/pixi with its licence, not a CDN', () => {
    for (const u of Object.values(KTX_TRANSCODER)) {
      assert.ok(!/^https?:/.test(u), u);
      assert.ok(existsSync(join(pub, u)), u);
    }
    assert.match(readFileSync(join(pub, 'vendor/pixi/transcoders-8.23.0/LICENSE'), 'utf8'), /Apache License[\s\S]*Version 2\.0/);
    assert.ok(COMPRESSED_FORMATS.includes('bc7-rgba-unorm') && COMPRESSED_FORMATS.includes('astc-4x4-unorm'));
  });
});
