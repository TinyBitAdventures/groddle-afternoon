/**
 * The tutorial's pull chain is sharp when the view is magnified: chain_hang and chain_pull have 3x
 * twins rendered from Tiny Speck's newxp_chain.swf (glitch-items misc/newxp_chain, CC0) through
 * tools/vector-sprites (newxp-chain.json), frame for frame and placed like the x1 OGA sheets, so the
 * chain's spot, hit area and pull timing are unchanged.
 * Run: node --test tests/newxp-chain-sharp.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleConsts } from './sheet-sources.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const FEATURE = 'js/features/newxp-feature.js';

/** Lossless WebP (VP8L) or extended (VP8X) canvas size. */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.subarray(8, 12).toString(), 'WEBP');
  const chunk = b.subarray(12, 16).toString();
  if (chunk === 'VP8L') {
    return {
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  assert.equal(chunk, 'VP8X');
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}

describe('tutorial pull chain 3x', () => {
  const art = moduleConsts(FEATURE).get('CHAIN_ART');
  const manifest = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/newxp-chain.json'), 'utf8'));
  const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
  const sheets = manifest.jobs.flatMap((job) => job.sheets.map((sheet) => ({ job, sheet })));

  it('keeps the x1 sheets the feature slices: 58 x 505 cells, 60 hang and 45 pull frames', () => {
    assert.deepEqual(art.hang, { url: 'assets/sprites/newxp/chain_hang.webp', cols: 15, rows: 4, count: 60 });
    assert.deepEqual(art.pull, { url: 'assets/sprites/newxp/chain_pull.webp', cols: 16, rows: 3, count: 45 });
    for (const k of ['hang', 'pull']) {
      assert.deepEqual(webpSize(join(pub, art[k].url)), { width: 58 * art[k].cols, height: 505 * art[k].rows }, k);
    }
  });

  it('renders both from newxp_chain.swf sprite 17, label for label, on first draw', () => {
    assert.equal(manifest.firstDraw, true);
    assert.equal(manifest.jobs.length, 1);
    assert.equal(manifest.jobs[0].swf, 'misc/newxp_chain/newxp_chain.swf');
    assert.equal(manifest.jobs[0].sprite, 17);
    for (const k of ['hang', 'pull']) {
      const row = sheets.find(({ sheet }) => sheet.path === art[k].url);
      assert.ok(row, k);
      assert.deepEqual([row.sheet.label, row.sheet.fw, row.sheet.fh, row.sheet.cols, row.sheet.frames], [k, 58, 505, art[k].cols, art[k].count], k);
    }
  });

  it('matches the x1 frames: same frames, same placement, scored', () => {
    const hang = results[art.hang.url];
    const pull = results[art.pull.url];
    for (const [k, r] of [['hang', hang], ['pull', pull]]) {
      assert.equal(r?.status, 'ok', k);
      assert.equal(r.mirror, false, k);
      assert.equal(r.shift, 0, k);
      assert.deepEqual(r.drift, [], k);
      assert.equal(r.cells, art[k].count, k);
      // Thin chain links score lower on antialiasing than solid art; every frame is well over the 0.8 bar.
      assert.ok(r.score >= 0.93, `${k} score ${r.score}`);
      assert.ok(r.minFrame >= 0.9, `${k} min frame ${r.minFrame}`);
    }
    // hang is SWF frames 1-60; pull is 61-105 (the label's 46th frame, 106, is not in the x1 sheet).
    assert.deepEqual(hang.swfFrames, [1, 60]);
    assert.deepEqual(pull.swfFrames, [61, 105]);
    // One placement for both, so the chain does not jump when the pull starts.
    assert.deepEqual(hang.offset3x, pull.offset3x);
  });

  it('ships each 3x twin at exactly 3x its x1 sheet, routed by js/sprite-hires.js', async () => {
    const { HIRES_SPRITES, FIRST_DRAW_SPRITES, SPLIT_SPRITES } = await import('../public/js/sprite-hires.js?v=68150c4c');
    for (const k of ['hang', 'pull']) {
      const hi = art[k].url.replace(/\.webp$/, '@3x.webp');
      assert.equal(HIRES_SPRITES.get(art[k].url), hi, k);
      assert.ok(FIRST_DRAW_SPRITES.has(art[k].url), k);
      assert.equal(SPLIT_SPRITES.has(art[k].url), false, k);
      assert.deepEqual(webpSize(join(pub, hi)), { width: 3 * 58 * art[k].cols, height: 3 * 505 * art[k].rows }, hi);
    }
  });

  it('keeps the chain where it was, its hit area and its timing, and warms the pull sheet before the click', () => {
    const src = readFileSync(join(pub, FEATURE), 'utf8');
    assert.match(src, /kit\.animated\(PIXI, CHAIN_ART\.hang\.url, CHAIN_ART\.hang\.cols, CHAIN_ART\.hang\.rows, \{ count: CHAIN_ART\.hang\.count, ax: 0\.5, ay: 0, speed: 0\.4, insetLeft: CHAIN_INSET_LEFT \}\)/);
    assert.match(src, /chain\.hitArea = new PIXI\.Rectangle\(-29, 230, 58, 250\);/);
    assert.match(src, /const pull = kit\.sheetFrames\(PIXI, CHAIN_ART\.pull\.url, [^\n]*\);\n\s*upgradeSource\(pull\.base, CHAIN_ART\.pull\.url, whenLoaded\);/);
    assert.match(src, /run\.views = \{ root, chain, pull, arrow, lit, phrases \};/);
    assert.match(src, /const pull = run\.views\.pull \|\| kit\.sheetFrames\(engine\.PIXI, CHAIN_ART\.pull\.url/);
    assert.match(src, /import \{ upgradeSource \} from '\.\.\/sprite-hires\.js(\?v=[0-9a-f]{8})?';/);
  });
});
