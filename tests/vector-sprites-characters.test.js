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
  SPLIT_SPRITES,
  hiresSpriteUrl,
  installHiresFirstDraw,
  installHiresSprites,
  pointAtPart,
  sourceSheet,
  upgradeSource,
} from '../public/js/sprite-hires.js?v=f7ea0bd5';
import { packParts } from '../tools/vector-sprites/build.mjs';

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
  // rooked-butterfly left (G316): its only SWF is a Wayback copy in no CC0 release, so it stays 1x.
  'sad-kitty', 'gwendolyn', 'cactus', 'crab', 'myopic-frog', 'maintenance-bot',
  'fox-ranger', 'fox-bait',
  // The street vendors (js/vendor-npcs.js VENDOR_NPC_ART: cropped 8-column strips, idle loop + talk).
  'gardening-vendor', 'meal-vendor', 'tool-vendor', 'uncle-friendly', 'helga', 'sno-cone-vending-machine',
  'factory-defect-chick', // G407's chick, race and broken still
  'juju-red', 'juju-green', 'juju-yellow',
  ...['red', 'green', 'yellow'].flatMap((v) => ['blue', 'black', 'red'].map((b) => `juju-bandit-${v}-${b}`)),
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

  it('every built sheet is exactly 3x (one file or parts), within budget, matched frame for frame, and swaps on first draw', () => {
    const { maxSide, maxMB } = manifest.budget;
    const within = (b, file) => {
      assert.ok(Math.max(b.w, b.h) <= maxSide, `${file} ${b.w}x${b.h}`);
      assert.ok((b.w * b.h * 4) / 2 ** 20 <= maxMB, `${file} over ${maxMB} MB`);
    };
    let built = 0;
    let split = 0;
    for (const paths of groups.values()) {
      for (const path of paths) {
        const r = results[path];
        if (r.status !== 'ok') continue;
        built += 1;
        assert.ok(FIRST_DRAW_SPRITES.has(path), `${path} is not first-draw`);
        const a = imageSize(join(pub, path));
        if (r.parts) {
          split += 1;
          // Too big for one texture: the cells in frame order, in parts that each fit.
          assert.ok(overBudget(a), `${path} fits as one file but was split`);
          assert.equal(HIRES_SPRITES.has(path), false, path);
          const entry = SPLIT_SPRITES.get(path);
          assert.deepEqual(entry, { fw: r.fw, fh: r.fh, cols: r.cols, parts: r.parts.map((p) => [p.hires, p.from, p.count, p.cols]) }, path);
          assert.equal(r.cols, Math.floor(a.w / r.fw), path);
          let next = r.parts[0].from;
          for (const p of r.parts) {
            assert.equal(p.from, next, `${path} parts out of order`);
            next += p.count;
            const b = imageSize(join(pub, p.hires));
            assert.deepEqual(b, { w: p.cols * r.fw * 3, h: Math.ceil(p.count / p.cols) * r.fh * 3 }, p.hires);
            within(b, p.hires);
          }
          assert.equal(next - r.parts[0].from, r.cells, `${path} parts hold every cell`);
        } else {
          assert.equal(HIRES_SPRITES.get(path), r.hires, path);
          const b = imageSize(join(pub, r.hires));
          assert.deepEqual(b, { w: a.w * 3, h: a.h * 3 }, r.hires);
          within(b, r.hires);
        }
        assert.ok(r.score >= 0.9, `${path} score ${r.score}`);
        assert.ok(r.minFrame >= 0.8, `${path} worst frame ${r.minFrame}`);
        assert.equal(r.drift.length, 0, `${path} frames prefer another offset`);
        assert.equal(r.frameScores.length, r.cells, path);
      }
    }
    assert.ok(built >= SHARP.length);
    assert.ok(split > 0);
  });

  it('only a character with one cell over budget stays 1x for size', () => {
    const { maxSide, maxMB } = manifest.budget;
    for (const job of manifest.jobs) {
      for (const sheet of job.sheets) {
        const r = results[sheet.path];
        const cellOver = sheet.fw * 3 > maxSide || sheet.fh * 3 > maxSide || (sheet.fw * sheet.fh * 36) / 2 ** 20 > maxMB;
        if (!cellOver) assert.doesNotMatch(r.reason || '', /over budget/, sheet.path);
      }
    }
  });

  it('packs an oversized sheet into the fewest squarer parts within budget', () => {
    const budget = manifest.budget;
    // Deimaginator idle1: 135 cells of 251 x 186 (11295 x 5022 at 3x as one strip).
    const parts = packParts(135, 251, 186, budget);
    assert.equal(parts.length, 4);
    assert.deepEqual(parts.map((p) => p.from), [0, 34, 68, 102]);
    assert.equal(parts.reduce((n, p) => n + p.count, 0), 135);
    for (const p of parts) {
      const W = p.cols * 251 * 3;
      const H = Math.ceil(p.count / p.cols) * 186 * 3;
      assert.ok(Math.max(W, H) <= budget.maxSide && (W * H * 4) / 2 ** 20 <= budget.maxMB, `${W}x${H}`);
    }
    assert.deepEqual(packParts(4, 10, 10, budget), [{ from: 0, count: 4, cols: 2 }]);
    assert.equal(packParts(1, 3000, 10, budget), null);
  });
});

/** Would this 1x sheet's 3x break the manifest budget as one file? */
function overBudget({ w, h }) {
  const { maxSide, maxMB } = manifest.budget;
  return Math.max(w, h) * 3 > maxSide || (w * h * 36) / 2 ** 20 > maxMB;
}

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

  it('moves the frames of a split sheet to its 3x parts on first draw, frame rects in 1x units', async () => {
    const [path, split] = [...SPLIT_SPRITES][0];
    assert.ok(path && split.parts.length >= 1);
    const realFetch = globalThis.fetch;
    const realBitmap = globalThis.createImageBitmap;
    const fetched = [];
    globalThis.fetch = async (url) => (fetched.push(url), { ok: true, blob: async () => ({ url }) });
    globalThis.createImageBitmap = async (blob) => ({ url: blob.url, width: 30, height: 30, close() {} });
    try {
      // A js/textures.js stand-in that tracks frames like frameTexture does.
      const sets = new Map();
      let tracker = null;
      const textures = {
        ...fakeTextures(),
        trackFrameTextures(t) { tracker = t; },
        framesOf: (source) => [...(sets.get(source) || [])],
      };
      installHiresSprites(textures, { dpr: 2, viewWidth: 1280 });
      assert.ok(tracker.match(path) && !tracker.match('assets/sprites/icons/apple.png'));
      assert.equal(hiresSpriteUrl(path), null, 'split sheets are never URL-routed');
      class Source {
        constructor(opts = {}) { Object.assign(this, opts); }
      }
      const base = new Source({ label: path, width: split.fw * split.cols, height: 1000, alphaMode: 'premultiply-alpha-on-upload', scaleMode: 'linear' });
      const frame = (cell, dx = 0) => {
        const t = {
          source: base,
          updates: 0,
          frame: { x: (cell % split.cols) * split.fw + dx, y: Math.floor(cell / split.cols) * split.fh, width: split.fw - dx, height: split.fh },
          update() { this.updates += 1; },
        };
        if (!sets.has(base)) sets.set(base, new Set());
        sets.get(base).add(t);
        tracker.added?.(base, t);
        return t;
      };
      const [, from0, count0] = split.parts[0];
      const [, fromN, countN] = split.parts.at(-1);
      const cells = [from0, from0 + count0 - 1, fromN + countN - 1];
      const frames = cells.map((c) => frame(c, 0));
      const inset = frame(cells[1], 2);
      const inits = [];
      const renderer = { texture: { _initSource(source) { inits.push(source); return 'gl'; } } };
      installHiresFirstDraw(renderer, (src) => Promise.resolve(src));
      renderer.texture._initSource(base);
      assert.equal(await base.hiresUpgrade, true);
      assert.deepEqual(fetched, split.parts.map(([url]) => url));
      assert.equal(base.hiresParts.length, split.parts.length);
      for (const [i, t] of frames.entries()) {
        const cell = cells[i];
        const part = base.hiresParts.find((p) => cell >= p.from && cell < p.from + p.count);
        assert.equal(t.source, part.source, `cell ${cell}`);
        assert.equal(part.source.resolution, 3);
        assert.equal(part.source.alphaMode, base.alphaMode);
        const j = cell - part.from;
        assert.deepEqual([t.frame.x, t.frame.y, t.frame.width, t.frame.height], [(j % part.cols) * split.fw, Math.floor(j / part.cols) * split.fh, split.fw, split.fh]);
        assert.equal(t.updates, 1);
      }
      assert.equal(inset.frame.x % split.fw, 2, 'an inset frame keeps its offset in the cell');
      // A frame cut after the parts arrived moves at once.
      const late = frame(cells[2]);
      assert.notEqual(late.source, base);
      // The renderer re-uploading the 1x sheet does not refetch.
      renderer.texture._initSource(base);
      assert.equal(fetched.length, split.parts.length);
      assert.equal(await upgradeSource(base, path), true);
      assert.equal(pointAtPart(base, { source: base, frame: { x: 0, y: 0, width: split.fw * 2, height: split.fh }, update() {} }), false, 'a frame spanning cells stays 1x');
    } finally {
      globalThis.fetch = realFetch;
      globalThis.createImageBitmap = realBitmap;
      installHiresSprites(fakeTextures(), { dpr: 2, viewWidth: 1280 });
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
