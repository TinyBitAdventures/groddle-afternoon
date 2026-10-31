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
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js?v=f7ea0bd5';
import { HELL_SPRITES } from '../public/js/hell.js?v=454c9f42';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const vs = join(root, 'tools/vector-sprites');
const results = JSON.parse(readFileSync(join(vs, 'results.json'), 'utf8'));
const stills = JSON.parse(readFileSync(join(vs, 'stills.json'), 'utf8'));

/** World art the game draws at scale 1 (or more) that was 1x before this sweep. */
const SWEPT = [
  'assets/sprites/races/race_ticket_dispenser.png',
  'assets/sprites/animals/meat_collector.png',
  'assets/sprites/animals/butterfly_milker.png',
  'assets/sprites/animals/piggy_feeder.png',
  'assets/sprites/animals/plop.png',
  'assets/sprites/street-jobs/pile_of_currants.png',
  'assets/sprites/cultivation/firefly_hive.png',
  'assets/sprites/hell/wine_of_the_dead-world.png',
  'assets/sprites/hell/drink_ticket-world.png',
  'assets/sprites/races/pig_bait__x1_1_x1_2_x1_3_x1_4_png_1354830335.png',
  'assets/sprites/puzzles/light_beam.png',
  'assets/sprites/quests/rook-woods/rook-egg-states.png',
];

describe('sharp world stills at Original zoom', () => {
  it('the Race Ticket Dispenser and the other swept stills draw a matched 3x render on first draw', () => {
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

  it('every graveside marker renders its own giant from the named sprite in graveside_marker.swf', () => {
    // The emblem is a few dozen 1x pixels, so the score barely tells giants apart: the SWF's
    // own symbol names (DefineSprite N giantAlph ...) pick the sprite.
    const named = { zille: 8, tii: 11, spriggan: 14, pot: 17, mab: 20, lem: 23, humbaba: 26, grendaline: 29, friendly: 32, cosma: 35, alph: 38, generic: 41 };
    const { graveside } = HELL_SPRITES;
    assert.deepEqual([...graveside.giants].sort(), Object.keys(named).sort());
    for (const giant of graveside.giants) {
      const path = graveside.urlPattern.replace('<giant>', giant);
      const job = stills.jobs.find((j) => j.sheets.some((s) => s.path === path));
      assert.ok(job, path);
      assert.equal(job.swf, 'misc/graveside_marker/graveside_marker.swf');
      assert.equal(job.sprite, named[giant], giant);
      assert.equal(results[path]?.status, 'ok', path);
      assert.equal(results[path].cells, 3, path);
      assert.ok(FIRST_DRAW_SPRITES.has(path), path);
    }
  });
});
