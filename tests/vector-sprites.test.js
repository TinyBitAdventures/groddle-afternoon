/**
 * 3x animal sheets from the vector SWFs (tools/vector-sprites, js/sprite-hires.js).
 * Run: node --test tests/vector-sprites.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIRES_SPRITES, hiresSpriteUrl, installHiresSprites, upgradeBaseTexture } from '../public/js/sprite-hires.js';

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
    assert.equal(hiresSpriteUrl('assets/sprites/npc_piggy__x1_chew_png_1354829433.png'), null);
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
    assert.deepEqual(ok.map(([p]) => p).sort(), [...HIRES_SPRITES.keys()].sort());
    // Each pipeline sheet has exactly its listed 3x file beside it (no stale
    // .png next to a .webp, nothing left behind by a rejected sheet).
    for (const [path, r] of Object.entries(results)) {
      const stem = path.replace(/\.(png|webp)$/, '');
      const found = ['png', 'webp'].map((ext) => `${stem}@3x.${ext}`).filter((f) => existsSync(join(pub, f)));
      assert.deepEqual(found, r.status === 'ok' ? [r.hires] : [], path);
      if (r.status === 'ok') assert.equal(HIRES_SPRITES.get(path), r.hires, path);
    }
  });

  it('every listed sheet matched its OGA frames after the 3:1 downscale', () => {
    for (const [path, r] of Object.entries(results)) {
      if (r.status !== 'ok') continue;
      assert.ok(r.score >= 0.9, `${path} score ${r.score}`);
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

  it('routes Texture.from to the 3x file once on dense screens, passing other sources through', () => {
    const calls = [];
    const lowDensity = { Texture: { from: (src) => src } };
    const lowFrom = lowDensity.Texture.from;
    installHiresSprites(lowDensity, { dpr: 1, viewWidth: 1200 });
    assert.equal(lowDensity.Texture.from, lowFrom);
    assert.equal(hiresSpriteUrl('assets/sprites/npc_piggy__x1_walk_png_1354829432.png'), null);
    const PIXI = { Texture: { from: (src) => (calls.push(src), src) } };
    installHiresSprites(PIXI, { dpr: 2, viewWidth: 1280 });
    installHiresSprites(PIXI, { dpr: 2, viewWidth: 1280 });
    const walkUrl = 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png';
    PIXI.Texture.from(walkUrl);
    PIXI.Texture.from('assets/sprites/icons/apple.png');
    const canvas = {};
    PIXI.Texture.from(canvas);
    assert.deepEqual(calls, [HIRES_SPRITES.get(walkUrl), 'assets/sprites/icons/apple.png', canvas]);
  });

  it('upgrades a loaded 1x BaseTexture in place, once, keeping its logical size', async () => {
    const realFetch = globalThis.fetch;
    const realBitmap = globalThis.createImageBitmap;
    const fetched = [];
    globalThis.fetch = async (url) => (fetched.push(url), { ok: true, blob: async () => ({ url }) });
    globalThis.createImageBitmap = async () => ({ width: 2112, height: 558, close() {} });
    try {
      class ImageBitmapResource {
        constructor(bitmap) { this.source = bitmap; }
      }
      const PIXI = { ImageBitmapResource };
      const old = { unbound: false, destroyed: false, unbind() { this.unbound = true; }, destroy() { this.destroyed = true; } };
      const base = {
        resource: old, resolution: 1, width: 704, height: 186, updates: 0,
        setResource(r) { this.resource = r; this.width = r.source.width / this.resolution; this.height = r.source.height / this.resolution; },
        update() { this.updates += 1; },
      };
      const url = 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png';
      const a = upgradeBaseTexture(PIXI, base, url);
      const b = upgradeBaseTexture(PIXI, base, url);
      assert.equal(a, b);
      assert.equal(await a, true);
      assert.deepEqual(fetched, [HIRES_SPRITES.get(url)]);
      assert.equal(base.resolution, 3);
      assert.deepEqual([base.width, base.height], [704, 186]);
      assert.ok(base.resource instanceof ImageBitmapResource);
      assert.equal(base.resource.src, HIRES_SPRITES.get(url));
      assert.ok(old.unbound && old.destroyed);
      assert.equal(base.updates, 1);
      assert.equal(await upgradeBaseTexture(PIXI, { resource: old }, 'assets/sprites/icons/apple.png'), false);
    } finally {
      globalThis.fetch = realFetch;
      globalThis.createImageBitmap = realBitmap;
    }
  });
});
