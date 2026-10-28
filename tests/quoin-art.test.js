/**
 * Sharp 3x quoin sheet from hand-traced vectors (tools/quoin-art).
 * Run: node --test tests/quoin-art.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUOIN_SHEET, QUOIN_TYPES } from '../public/js/quoins.js';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES, hiresSpriteUrl } from '../public/js/sprite-hires.js?v=g405-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const art = join(root, 'tools/quoin-art');
const frames = JSON.parse(readFileSync(join(art, 'frames.json'), 'utf8'));
const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));

/** Pixel size from a PNG or lossless WebP header. */
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
  throw new Error(`unexpected image ${file}`);
}

describe('3x quoin sheet', () => {
  it('exists beside the 1x sheet at exactly three times its size', () => {
    const three = HIRES_SPRITES.get(QUOIN_SHEET.url);
    assert.match(three, /^assets\/sprites\/quoin__x1_.*_1354829599@3x\.(png|webp)$/);
    const one = imageSize(join(pub, QUOIN_SHEET.url));
    assert.deepEqual(one, { w: QUOIN_SHEET.frameWidth * QUOIN_SHEET.columns, h: QUOIN_SHEET.frameHeight * QUOIN_SHEET.rows });
    assert.deepEqual(imageSize(join(pub, three)), { w: one.w * 3, h: one.h * 3 });
  });

  it('is listed with the other 3x sheets and loads eagerly wherever the 1x URL is used', () => {
    assert.equal(hiresSpriteUrl(QUOIN_SHEET.url), HIRES_SPRITES.get(QUOIN_SHEET.url));
    assert.equal(hiresSpriteUrl(`./${QUOIN_SHEET.url}?v=2`), `${HIRES_SPRITES.get(QUOIN_SHEET.url)}?v=2`);
    assert.equal(FIRST_DRAW_SPRITES.has(QUOIN_SHEET.url), false);
    const r = results[QUOIN_SHEET.url];
    assert.equal(r.status, 'ok');
    assert.equal(r.source, 'tools/quoin-art');
    assert.equal(r.hires, HIRES_SPRITES.get(QUOIN_SHEET.url));
    assert.equal(r.cells, QUOIN_SHEET.columns * QUOIN_SHEET.rows);
    assert.equal(r.frameScores.length, r.cells);
  });

  it('replays a measured animation for every sheet row', () => {
    assert.equal(frames.source, `public/${QUOIN_SHEET.url}`);
    for (const def of Object.values(QUOIN_TYPES)) {
      const t = frames.types[def.id];
      assert.equal(t.row, def.row, def.id);
      assert.ok(existsSync(join(art, 'svg', `${def.id}.svg`)), def.id);
      if (def.id === 'qurazy') {
        assert.equal(t.body.matrix.length, QUOIN_SHEET.columns);
        for (const colours of Object.values(t.spots)) {
          assert.equal(colours.length, QUOIN_SHEET.columns);
          for (const c of colours) assert.match(c, /^#[0-9a-f]{6}$/);
        }
        continue;
      }
      // The 1x bodies move by whole pixels; the propeller spins between -1 and 1.
      assert.equal(t.body.dy.length, QUOIN_SHEET.columns, def.id);
      for (const dy of t.body.dy) assert.ok(Number.isInteger(dy), def.id);
      assert.equal(t.propeller.spin.length, QUOIN_SHEET.columns, def.id);
      for (const a of t.propeller.spin) assert.ok(Math.abs(a) <= 1 && a !== 0, def.id);
    }
    assert.ok(existsSync(join(art, 'svg', 'propeller.svg')));
  });

  it('says the art is a hand trace of the 1x sheet', () => {
    assert.match(readFileSync(join(art, 'build.mjs'), 'utf8'), /hand trace of that\s+\* 1x sheet/);
    for (const def of Object.values(QUOIN_TYPES)) {
      assert.match(readFileSync(join(art, 'svg', `${def.id}.svg`), 'utf8'), /Hand-traced from Tiny Speck's 1x quoin sheet \(CC0\)/, def.id);
    }
  });
});
