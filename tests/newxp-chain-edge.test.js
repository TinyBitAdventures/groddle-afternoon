/**
 * G596 "Left": a faint 1 px vertical line about 6 world px left of the tutorial chain's handle.
 * The handle's bolt runs into its cell's right edge in many frames of chain_hang and chain_pull
 * (1x and 3x), and smooth sampling at the next cell's left edge read that column: the line showed
 * on the frames after them (found 2026-11-09: hang frames after 0-9 and 52-54). Each chain frame
 * now leaves its own first column off (kit.sheetFrames insetLeft, drawn as empty through Pixi's
 * trim), so the frame keeps its size, anchor and hit area and the line goes.
 * Run: node --test tests/newxp-chain-edge.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleConsts } from './sheet-sources.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const FEATURE = 'js/features/newxp-feature.js';
const src = readFileSync(join(pub, FEATURE), 'utf8');
const kitSrc = readFileSync(join(pub, 'js/quest-rooms/kit.js'), 'utf8');

/** RGBA pixels of a WebP through ffmpeg, or null without it. */
function rgba(file) {
  try {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const [width, height] = probe.trim().split(',').map(Number);
    const data = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 });
    return { width, height, data };
  } catch {
    return null;
  }
}

/** Max alpha in column `dx` of each cell, by frame. */
function columnAlpha(img, cols, rows, count, dx) {
  const cw = img.width / cols;
  const ch = img.height / rows;
  const out = [];
  for (let f = 0; f < count; f++) {
    const x = (f % cols) * cw + dx(cw);
    const y0 = Math.floor(f / cols) * ch;
    let max = 0;
    for (let y = y0; y < y0 + ch; y++) max = Math.max(max, img.data[(y * img.width + x) * 4 + 3]);
    out.push(max);
  }
  return out;
}

describe('tutorial chain: no line left of the handle', () => {
  const art = moduleConsts(FEATURE).get('CHAIN_ART');
  const inset = moduleConsts(FEATURE).get('CHAIN_INSET_LEFT');
  const sheets = [];
  before(() => {
    for (const key of ['hang', 'pull']) {
      for (const scale of ['', '@3x']) {
        const sheet = art[key];
        const file = join(pub, sheet.url.replace(/\.webp$/, `${scale}.webp`));
        sheets.push({ name: `${key}${scale}`, sheet, res: scale ? 3 : 1, img: rgba(file) });
      }
    }
  });

  it('the cause: the handle reaches the right edge of a cell in every sheet', (t) => {
    if (!sheets[0].img) return t.skip('needs ffmpeg');
    for (const { name, sheet, img } of sheets) {
      const right = columnAlpha(img, sheet.cols, sheet.rows, sheet.count, (cw) => cw - 1);
      assert.ok(right.some((a) => a > 200), `${name}: art in a cell's last column`);
    }
  });

  it('the columns each frame leaves off are empty in every frame (1x and 3x), so no art is lost', (t) => {
    if (!sheets[0].img) return t.skip('needs ffmpeg');
    assert.equal(inset, 1);
    for (const { name, sheet, res, img } of sheets) {
      for (let dx = 0; dx < inset * res; dx++) {
        const left = columnAlpha(img, sheet.cols, sheet.rows, sheet.count, () => dx);
        assert.deepEqual(left.filter((a) => a > 0), [], `${name}: column ${dx} empty`);
      }
    }
  });

  it('the hanging chain and both pull sheets are cut with the inset', () => {
    assert.match(src, /kit\.animated\(PIXI, CHAIN_ART\.hang\.url,[^\n]*insetLeft: CHAIN_INSET_LEFT \}\)/);
    const pulls = src.match(/kit\.sheetFrames\([^\n]*CHAIN_ART\.pull\.count[^\n]*/g) || [];
    assert.equal(pulls.length, 2);
    for (const line of pulls) assert.match(line, /\{ insetLeft: CHAIN_INSET_LEFT \}\)/);
  });

  it('an inset frame keeps its cell size and placement (orig and trim)', async () => {
    assert.match(kitSrc, /new PIXI\.Rectangle\(cx \+ inset, cy, fw - inset, fh\), \{ orig: new PIXI\.Rectangle\(0, 0, fw, fh\), trim: new PIXI\.Rectangle\(inset, 0, fw - inset, fh\) \}/);
    assert.match(kitSrc, /sheetFrames\(PIXI, url, cols, rows, opts\.count, \{ insetLeft: opts\.insetLeft \}\)/);
    // frameTexture hands orig and trim to Pixi's Texture.
    const made = [];
    const saved = globalThis.PIXI;
    globalThis.PIXI = { Texture: class { constructor(o) { made.push(o); } } };
    try {
      const { frameTexture } = await import('../public/js/textures.js?fresh=chain-edge');
      const source = { width: 870, height: 2020 };
      frameTexture(source, { x: 59, y: 0, width: 57, height: 505 }, { orig: { x: 0, y: 0, width: 58, height: 505 }, trim: { x: 1, y: 0, width: 57, height: 505 } });
      frameTexture(source, { x: 58, y: 0, width: 58, height: 505 });
    } finally {
      globalThis.PIXI = saved;
    }
    assert.deepEqual(made[0].orig, { x: 0, y: 0, width: 58, height: 505 });
    assert.deepEqual(made[0].trim, { x: 1, y: 0, width: 57, height: 505 });
    assert.equal('orig' in made[1] || 'trim' in made[1], false);
  });
});
