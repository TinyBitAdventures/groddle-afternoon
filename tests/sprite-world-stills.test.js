/**
 * Sharp world stills, Original zoom sweep (lane SHARP3, 2026-10-30): since v0.6.0 the street is
 * drawn at about 2.9 backing px per world px on a 1440 px Retina window, so a 1x still at scale 1
 * is magnified 2.9x. These world items now swap to a 3x render of their own CC0 SWF on first draw
 * (tools/vector-sprites/stills.json, js/sprite-hires.js).
 * Run: node --test tests/sprite-world-stills.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=e2867181';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const results = JSON.parse(readFileSync(join(vs, 'results.json'), 'utf8'));

/** World art the game draws at scale 1 (or more) that was 1x before this sweep. */
const SWEPT = [
  'assets/sprites/races/race_ticket_dispenser.png',
];

describe('sharp world stills at Original zoom', () => {
  it('the Race Ticket Dispenser draws a matched 3x render on first draw', () => {
    for (const path of SWEPT) {
      const r = results[path];
      assert.equal(r?.status, 'ok', `${path}: ${r?.reason}`);
      assert.ok(r.score >= 0.9 && r.minFrame >= 0.8 && r.drift.length === 0, `${path} ${r.score}`);
      assert.equal(HIRES_SPRITES.get(path), r.hires, path);
      assert.ok(FIRST_DRAW_SPRITES.has(path), path);
      assert.ok(existsSync(join(pub, r.hires)), r.hires);
    }
  });

  it('the dispenser is the street sprite races-feature draws', () => {
    const src = readFileSync(join(pub, 'js/features/races-feature.js'), 'utf8');
    assert.match(src, /textureFromUrl\(`\$\{RACE_ICON_DIR\}race_ticket_dispenser\.png`\)/);
    assert.match(src, /const RACE_ICON_DIR = 'assets\/sprites\/races\/'/);
  });

});
