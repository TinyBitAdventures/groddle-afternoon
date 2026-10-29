/**
 * Sharp world still items (lane SPRITES, 2026-10-29): the Visiting Stone,
 * notes, gift boxes, notice boards, the left mailbox, the home furniture base
 * pieces, the sign stake, the Party ATM and the Rook Hall speaker at 3x
 * (tools/vector-sprites/stills.json, js/sprite-hires.js first-draw swap) and
 * the Stoot doll at 5x (dense-stills.json, js/sprite-dense.js), each from its
 * own CC0 SWF in glitch-items.
 * Run: node --test tests/sprite-stills.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=g446-4';
import { DENSE_SPRITES, denseSprite } from '../public/js/sprite-dense.js?v=g430-1';
import { MAILBOX_SHEETS, STONE_ART, NOTE_ART, BOARD_ART } from '../public/js/street-furniture.js?v=g442-6';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const json = (f) => JSON.parse(readFileSync(join(vs, f), 'utf8'));
const results = json('results.json');
const dense = json('results-dense.json');
const stills = json('stills.json');

describe('sharp world still items', () => {
  it('build.mjs --check passes for the stills manifests', () => {
    for (const m of ['stills.json', 'dense-stills.json']) {
      const out = execFileSync(process.execPath, [join(vs, 'build.mjs'), '--manifest', join(vs, m), '--check'], { encoding: 'utf8' });
      assert.match(out, /: ok$/m, `${m}\n${out}`);
    }
  });

  it('every still in the manifest matched its SWF and swaps to 3x on first draw', () => {
    let n = 0;
    for (const job of stills.jobs) {
      for (const sheet of job.sheets) {
        const r = results[sheet.path];
        assert.equal(r?.status, 'ok', `${sheet.path}: ${r?.reason}`);
        assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${sheet.path} ${r.score}`);
        assert.equal(r.cells, sheet.frames, sheet.path);
        assert.equal(HIRES_SPRITES.get(sheet.path), r.hires, sheet.path);
        assert.ok(FIRST_DRAW_SPRITES.has(sheet.path), sheet.path);
        n++;
      }
    }
    assert.ok(n >= 65, `${n} stills`);
  });

  it('covers the Visiting Stone, notes, notice boards and every mailbox clip the street draws', () => {
    for (const p of [STONE_ART.path, NOTE_ART.path, ...Array.from({ length: 11 }, (_, i) => BOARD_ART.path(i)), ...Object.values(MAILBOX_SHEETS).map((s) => s.path)]) {
      assert.ok(HIRES_SPRITES.has(p), p);
    }
    for (const s of Object.values(MAILBOX_SHEETS)) assert.equal(results[s.path].cells, s.frames, s.path);
  });

  it('covers every home furniture base piece with a CC0 base SWF (not the door, fireplace or house)', () => {
    const left = ['furniture_door', 'furniture_fireplace'];
    for (const [cls, def] of Object.entries(FURNITURE_CATALOG)) {
      if (!def?.art?.path || left.includes(cls)) continue;
      assert.ok(HIRES_SPRITES.has(def.art.path), `${cls} ${def.art.path}`);
    }
  });

  it('the Stoot doll draws its 5x render where it is shown at 1.18 and 1.55', () => {
    const path = 'assets/sprites/spinning-wheel/stoot-doll.png';
    assert.equal(dense[path]?.status, 'ok', dense[path]?.reason);
    assert.equal(DENSE_SPRITES.get(path).density, 5);
    assert.equal(denseSprite(path, 1.18), null);
    assert.ok(denseSprite(path, 1.18 * 2));
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /from '\.\/js\/sprite-dense\.js\?v=g\d+-\d+'/);
    assert.equal((game.match(/new PIXI\.Sprite\(stootDollTexture\(\)\)/g) || []).length, 2);
    assert.doesNotMatch(game, /textureFromUrl\('assets\/sprites\/spinning-wheel\/stoot-doll\.png'\)/);
  });
});
