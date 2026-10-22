/**
 * 3x character, NPC and shrine sheets from the vector SWFs
 * (tools/vector-sprites/characters.json, js/sprite-hires.js first-draw swap).
 * Run: node --test tests/vector-sprites-characters.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIRST_DRAW_SPRITES,
  HIRES_SPRITES,
  hiresSpriteUrl,
  installHiresFirstDraw,
  installHiresSprites,
  sourceSheet,
} from '../public/js/sprite-hires.js';

/** A js/textures.js stand-in: records the URL routes it is given. */
function fakeTextures() {
  const routes = new Map();
  return {
    routes,
    addUrlRoute(name, fn) { routes.set(name, fn); },
    route(url) {
      let out = url;
      for (const fn of routes.values()) out = fn(out) || out;
      return out;
    },
  };
}

/** A Pixi 8 TextureSource stand-in (logical size, resolution, resource). */
function fakeSource(label, width = 10, height = 10) {
  return {
    label, width, height, resolution: 1, pixelWidth: width, pixelHeight: height, updates: 0,
    resource: { close() { this.closed = true; } },
    resize(w, h, res) {
      const pw = Math.round(w * res);
      const ph = Math.round(h * res);
      const changed = pw !== this.pixelWidth || ph !== this.pixelHeight;
      Object.assign(this, { width: w, height: h, resolution: res, pixelWidth: pw, pixelHeight: ph });
      return changed;
    },
    update() { this.updates += 1; },
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/characters.json'), 'utf8'));

/** Characters that must stay sharp (every sheet built, nothing held back). */
const SHARP = [
  'bureaucrat-0', 'bureaucrat-1', 'bureaucrat-2', 'bureaucrat-3', 'letter-blocks', 'mr-block',
  'dustbunny', 'ilmenskie-jones', 'forehorseman', 'rook-head', 'rooked-piggy', 'rooked-chicken',
  'sad-kitty', 'rooked-butterfly', 'gwendolyn', 'cactus', 'crab', 'myopic-frog', 'maintenance-bot',
  'fox-ranger', 'fox-bait',
  ...['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'].map((g) => `shrine-${g}`),
];

/** Pixel size from a PNG or WebP (VP8L / VP8 / VP8X) header. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`unknown image ${file}`);
}

const characterOf = (job) => job.character || job.name;
const groups = new Map();
for (const job of manifest.jobs) {
  for (const sheet of job.sheets) {
    if (!groups.has(characterOf(job))) groups.set(characterOf(job), []);
    groups.get(characterOf(job)).push(sheet.path);
  }
}

describe('3x character sheets', () => {
  it('every manifest sheet has a pipeline result, built or rejected with a reason', () => {
    for (const paths of groups.values()) {
      for (const path of paths) {
        const r = results[path];
        assert.ok(r, `${path} was never built`);
        assert.ok(['ok', 'rejected'].includes(r.status), path);
        if (r.status === 'rejected') assert.ok(r.reason, path);
      }
    }
  });

  it('the sharp characters are fully built', () => {
    for (const name of SHARP) {
      assert.ok(groups.has(name), name);
      for (const path of groups.get(name)) assert.equal(results[path].status, 'ok', `${name}: ${path} ${results[path].reason || ''}`);
    }
  });

  it('a character is all 3x or all 1x, never mixed', () => {
    for (const [name, paths] of groups) {
      const ok = paths.filter((p) => results[p]?.status === 'ok');
      assert.ok(ok.length === 0 || ok.length === paths.length, `${name}: ${ok.length}/${paths.length} sheets at 3x`);
    }
  });

  it('every built sheet is exactly 3x, within budget, matched frame for frame, and swaps on first draw', () => {
    const { maxSide, maxMB } = manifest.budget;
    let built = 0;
    for (const paths of groups.values()) {
      for (const path of paths) {
        const r = results[path];
        if (r.status !== 'ok') continue;
        built += 1;
        assert.equal(HIRES_SPRITES.get(path), r.hires, path);
        assert.ok(FIRST_DRAW_SPRITES.has(path), `${path} is not first-draw`);
        const a = imageSize(join(pub, path));
        const b = imageSize(join(pub, r.hires));
        assert.deepEqual(b, { w: a.w * 3, h: a.h * 3 }, r.hires);
        assert.ok(Math.max(b.w, b.h) <= maxSide, `${r.hires} ${b.w}x${b.h}`);
        assert.ok((b.w * b.h * 4) / 2 ** 20 <= maxMB, `${r.hires} over ${maxMB} MB`);
        assert.ok(r.score >= 0.9, `${path} score ${r.score}`);
        assert.ok(r.minFrame >= 0.8, `${path} worst frame ${r.minFrame}`);
        assert.equal(r.drift.length, 0, `${path} frames prefer another offset`);
        assert.equal(r.frameScores.length, r.cells, path);
      }
    }
    assert.ok(built >= SHARP.length);
  });

  it('over-budget characters were never rendered', () => {
    const { maxSide, maxMB } = manifest.budget;
    for (const [name, paths] of groups) {
      const big = paths.find((p) => {
        const { w, h } = imageSize(join(pub, p));
        return Math.max(w, h) * 3 > maxSide || (w * h * 36) / 2 ** 20 > maxMB;
      });
      if (!big) continue;
      for (const p of paths) {
        assert.equal(results[p].status, 'rejected', `${name}: ${p}`);
        assert.match(results[p].reason, /over budget/, p);
        assert.ok(!existsSync(join(pub, p.replace(/\.(png|webp)$/, '@3x.png'))), p);
        assert.ok(!existsSync(join(pub, p.replace(/\.(png|webp)$/, '@3x.webp'))), p);
      }
    }
  });
});

describe('first-draw 3x swap', () => {
  const sheet = [...FIRST_DRAW_SPRITES][0];
  const eager = [...HIRES_SPRITES.keys()].find((p) => !FIRST_DRAW_SPRITES.has(p));

  it('the URL route keeps first-draw sheets at 1x and still routes the animals', () => {
    assert.ok(sheet && eager);
    const textures = fakeTextures();
    installHiresSprites(textures, { dpr: 2, viewWidth: 1280 });
    assert.equal(textures.route(sheet), sheet);
    assert.equal(textures.route(eager), HIRES_SPRITES.get(eager));
    assert.equal(textures.route('assets/sprites/icons/apple.png'), 'assets/sprites/icons/apple.png');
  });

  it('finds the sheet a TextureSource came from (label, absolute URL, query)', () => {
    assert.equal(sourceSheet({ label: sheet }), sheet);
    assert.equal(sourceSheet({ label: `./${sheet}?v=2` }), sheet);
    assert.equal(sourceSheet({ label: `https://groddle.localhost/${sheet}` }), sheet);
    assert.equal(sourceSheet({ label: HIRES_SPRITES.get(sheet) }), null);
    assert.equal(sourceSheet({ label: 'assets/sprites/icons/apple.png' }), null);
    assert.equal(sourceSheet({}), null);
  });

  it('swaps a sheet to 3x once, when the renderer first uploads it', async () => {
    const realFetch = globalThis.fetch;
    const realBitmap = globalThis.createImageBitmap;
    const fetched = [];
    globalThis.fetch = async (url) => (fetched.push(url), { ok: true, blob: async () => ({ url }) });
    globalThis.createImageBitmap = async () => ({ width: 30, height: 30, close() {} });
    try {
      installHiresSprites(fakeTextures(), { dpr: 2, viewWidth: 1280 });
      const inits = [];
      const renderer = { texture: { _initSource(source) { inits.push(source); return { gl: inits.length }; } } };
      const loaded = [];
      const whenLoaded = (source) => (loaded.push(source), Promise.resolve(source));
      installHiresFirstDraw(renderer, whenLoaded);
      installHiresFirstDraw(renderer, whenLoaded);
      const source = fakeSource(sheet);
      assert.deepEqual(renderer.texture._initSource(source), { gl: 1 });
      assert.equal(await source.hiresUpgrade, true);
      renderer.texture._initSource(source); // texture GC re-upload: no second fetch
      renderer.texture._initSource(fakeSource('assets/sprites/icons/apple.png'));
      assert.deepEqual(fetched, [HIRES_SPRITES.get(sheet)]);
      assert.deepEqual(loaded, [source]);
      assert.equal(inits.length, 3);
      assert.equal(source.resolution, 3);
      assert.deepEqual([source.width, source.height, source.pixelWidth], [10, 10, 30]);
      assert.equal(source.hiresSrc, HIRES_SPRITES.get(sheet));
      assert.equal(hiresSpriteUrl(source.hiresSrc), null);
    } finally {
      globalThis.fetch = realFetch;
      globalThis.createImageBitmap = realBitmap;
    }
  });

  it('does nothing below 1.5 device pixels per art pixel', () => {
    installHiresSprites(fakeTextures(), { dpr: 1, viewWidth: 1200 });
    const init = () => 'gl';
    const renderer = { texture: { _initSource: init } };
    installHiresFirstDraw(renderer);
    assert.equal(renderer.texture._initSource, init);
    installHiresSprites(fakeTextures(), { dpr: 2, viewWidth: 1280 });
  });
});
