/**
 * 3x animal sheets from the vector SWFs (tools/vector-sprites, js/sprite-hires.js).
 * Run: node --test tests/vector-sprites.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_SPRITES, SPLIT_SPRITES, hiresSpriteUrl, installHiresSprites, upgradeSource } from '../public/js/sprite-hires.js?v=e2867181';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/animals.json'), 'utf8'));

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

describe('3x vector sprite sheets', () => {
  it('maps listed sheet URLs (query kept) and leaves others alone', () => {
    const walkUrl = 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png';
    assert.ok(HIRES_SPRITES.has(walkUrl));
    assert.match(hiresSpriteUrl(walkUrl), /@3x\.(png|webp)$/);
    assert.match(hiresSpriteUrl(`./${walkUrl}?v=2`), /@3x\.(png|webp)\?v=2$/);
    assert.equal(hiresSpriteUrl('assets/sprites/npc_piggy__x1_look_screen_png_1354829434.png'), null);
    assert.equal(hiresSpriteUrl(hiresSpriteUrl(walkUrl)), null);
  });

  it('every 3x sheet exists and is exactly three times its 1x sheet', () => {
    assert.ok(HIRES_SPRITES.size >= 30);
    for (const [one, three] of HIRES_SPRITES) {
      assert.match(three, /@3x\.(png|webp)$/, three);
      assert.ok(existsSync(join(pub, one)) && existsSync(join(pub, three)), one);
      const a = imageSize(join(pub, one));
      const b = imageSize(join(pub, three));
      assert.deepEqual(b, { w: a.w * 3, h: a.h * 3 }, three);
    }
  });

  it('the list matches the @3x sheets on disk and the pipeline results', () => {
    const ok = Object.entries(results).filter(([, r]) => r.status === 'ok');
    assert.deepEqual(ok.filter(([, r]) => !r.parts).map(([p]) => p).sort(), [...HIRES_SPRITES.keys()].sort());
    assert.deepEqual(ok.filter(([, r]) => r.parts).map(([p]) => p).sort(), [...SPLIT_SPRITES.keys()].sort());
    // Each pipeline sheet has exactly its listed 3x file (or parts) beside it
    // (no stale .png next to a .webp, nothing left by a rejected sheet).
    for (const [path, r] of Object.entries(results)) {
      const stem = path.replace(/\.(png|webp)$/, '');
      const dir = dirname(join(pub, path));
      const base = stem.split('/').pop();
      const found = readdirSync(dir)
        .filter((f) => f === `${base}@3x.png` || f === `${base}@3x.webp` || (f.startsWith(`${base}.p`) && /^\d+@3x\.(png|webp)$/.test(f.slice(base.length + 2))))
        .map((f) => `${dirname(path)}/${f}`)
        .sort();
      const want = r.status !== 'ok' ? [] : r.parts ? r.parts.map((p) => p.hires).sort() : [r.hires];
      assert.deepEqual(found, want, path);
      if (r.status === 'ok' && !r.parts) assert.equal(HIRES_SPRITES.get(path), r.hires, path);
    }
  });

  it('every listed sheet matched its OGA frames after the 3:1 downscale', () => {
    for (const [path, r] of Object.entries(results)) {
      if (r.status !== 'ok') continue;
      // A job's own bar (harvestables.json ice knobs, G448, with its minScoreWhy) is never under 0.88.
      assert.ok(r.minScore === undefined || r.minScore >= 0.88, path);
      assert.ok(r.score >= (r.minScore ?? 0.9), `${path} score ${r.score}`);
      assert.ok(r.minFrame >= 0.8, `${path} worst frame ${r.minFrame}`);
      assert.equal(r.drift.length, 0, `${path} frames prefer another offset`);
      assert.equal(r.frameScores.length, r.cells, path);
    }
  });

  it('every manifest sheet was built', () => {
    for (const job of manifest.jobs) {
      for (const sheet of job.sheets) assert.equal(results[sheet.path]?.status, 'ok', sheet.path);
    }
  });

  it('routes sheet URLs to the 3x file on dense screens, leaving other URLs alone', () => {
    const routes = new Map();
    const textures = { addUrlRoute: (name, fn) => routes.set(name, fn) };
    installHiresSprites(textures, { dpr: 1, viewWidth: 1200 });
    assert.equal(routes.size, 0);
    assert.equal(hiresSpriteUrl('assets/sprites/npc_piggy__x1_walk_png_1354829432.png'), null);
    installHiresSprites(textures, { dpr: 2, viewWidth: 1280 });
    installHiresSprites(textures, { dpr: 2, viewWidth: 1280 });
    assert.equal(routes.size, 1);
    const route = routes.get('hires-sprites');
    const walkUrl = 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png';
    assert.equal(route(walkUrl), HIRES_SPRITES.get(walkUrl));
    assert.equal(route('assets/sprites/icons/apple.png'), null);
  });

  it('upgrades a loaded 1x TextureSource in place, once, keeping its logical size', async () => {
    const realFetch = globalThis.fetch;
    const realBitmap = globalThis.createImageBitmap;
    const fetched = [];
    globalThis.fetch = async (url) => (fetched.push(url), { ok: true, blob: async () => ({ url }) });
    globalThis.createImageBitmap = async () => ({ width: 2112, height: 558, close() {} });
    try {
      const old = { closed: false, close() { this.closed = true; } };
      const source = {
        resource: old, resolution: 1, width: 704, height: 186, pixelWidth: 704, pixelHeight: 186, updates: 0,
        resize(w, h, res) {
          Object.assign(this, { width: w, height: h, resolution: res, pixelWidth: w * res, pixelHeight: h * res });
          return true;
        },
        update() { this.updates += 1; },
      };
      const url = 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png';
      const waited = [];
      const whenLoaded = (s) => (waited.push(s), Promise.resolve(s));
      const a = upgradeSource(source, url, whenLoaded);
      const b = upgradeSource(source, url, whenLoaded);
      assert.equal(a, b);
      assert.equal(await a, true);
      assert.deepEqual(waited, [source]);
      assert.deepEqual(fetched, [HIRES_SPRITES.get(url)]);
      assert.equal(source.resolution, 3);
      assert.deepEqual([source.width, source.height, source.pixelWidth], [704, 186, 2112]);
      assert.equal(source.resource.width, 2112);
      assert.equal(source.hiresSrc, HIRES_SPRITES.get(url));
      assert.ok(old.closed);
      assert.equal(await upgradeSource({ resource: old }, 'assets/sprites/icons/apple.png'), false);
    } finally {
      globalThis.fetch = realFetch;
      globalThis.createImageBitmap = realBitmap;
    }
  });
});
