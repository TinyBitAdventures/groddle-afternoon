/**
 * 3x world harvestables from the vector SWFs (tools/vector-sprites/
 * harvestables.json: trants, dead trants, soil, the paper tree, resource
 * nodes, mining rocks) and the SWF state freezer they rely on.
 * Run: node --test tests/vector-sprites-harvestables.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES, hiresSpriteUrl } from '../public/js/sprite-hires.js?v=g417-1';
import { fruitState } from '../tools/vector-sprites/trant-states.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/results.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'tools/vector-sprites/harvestables.json'), 'utf8'));
const sheets = manifest.jobs.flatMap((job) => job.sheets.map((sheet) => ({ job, sheet })));

/** Sheets that must stay sharp (the 1x art they replace is in every world). */
const SHARP = [
  ...['bean', 'bubble', 'egg', 'fruit', 'gas', 'spice'].flatMap((s) => [1, 3, 5, 7, 10].map((m) => `assets/sprites/trants/frames/trant_${s}_m${m}.png`)),
  ...['bean', 'bubble', 'egg', 'fruit', 'gas', 'spice'].map((s) => `assets/sprites/soil/trant-${s}-dead.png`),
  ...['patch', 'patch-dark'].flatMap((k) => ['dirty', 'clean', 'dug'].map((s) => `assets/sprites/soil/${k}-${s}.png`)),
  'assets/sprites/soil/patch-seedling.png',
  ...['false-water-false', 'true-water-false', 'false-water-true', 'true-water-true'].map((s) => `assets/sprites/resources/paper-tree-pet-${s}.png`),
  'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.png',
  ...['metal', 'dullite', 'beryl', 'sparkly'].map((r) => `assets/sprites/mining/rock_${r}.png`),
];

describe('3x harvestables', () => {
  it('every manifest sheet has a pipeline result, built or rejected with a reason', () => {
    for (const { sheet } of sheets) {
      const r = results[sheet.path];
      assert.ok(r, sheet.path);
      if (r.status !== 'ok') assert.match(r.reason, /\S/, sheet.path);
    }
  });

  it('the trees, soil, paper tree, wood tree and rocks are sharp', () => {
    for (const path of SHARP) {
      assert.equal(results[path]?.status, 'ok', path);
      assert.ok(HIRES_SPRITES.has(path), path);
      assert.match(hiresSpriteUrl(`${path}?v=1`), /@3x\.(png|webp)\?v=1$/, path);
    }
  });

  it('built sheets meet the 0.9 bar and swap on first draw (only drawn trees pay for 3x)', () => {
    assert.equal(manifest.minScore, 0.9);
    for (const { sheet } of sheets) {
      const r = results[sheet.path];
      if (r?.status !== 'ok') continue;
      assert.ok(r.score >= 0.9, `${sheet.path} ${r.score}`);
      assert.ok(FIRST_DRAW_SPRITES.has(sheet.path), sheet.path);
    }
  });

  it('trant stills are one cell each, pinned to the health-10 frame of their maturity clip', () => {
    const trants = manifest.jobs.filter((j) => /^trant-\w+-m\d+$/.test(j.name));
    assert.equal(trants.length, 30);
    for (const job of trants) {
      const [sheet] = job.sheets;
      assert.equal(sheet.frames, 1, job.name);
      assert.equal(sheet.mirror, false, job.name);
      assert.ok(existsSync(join(root, 'public', sheet.path)), sheet.path);
      const species = job.name.split('-')[1];
      // bean/egg/bubble stop on frame `health`; spice/gas on 11 - health.
      assert.equal(sheet.swfStart, ['bean', 'egg', 'bubble'].includes(species) ? 10 : 1, job.name);
    }
  });

  it('fruit trees: leaves in bloom or at health 9 as the stills show, cherries by the client rule', () => {
    const kids = [
      { name: 'fol_1', frames: 20 }, { name: 'fol_2', frames: 20 },
      ...Array.from({ length: 31 }, (_, i) => ({ name: `cherry_${i + 1}`, frames: 10 })),
    ];
    const set = fruitState(kids, 10);
    assert.equal(set.fol_1, 20);
    assert.equal(fruitState(kids, 1).fol_2, 9);
    assert.equal(fruitState(kids, 3).fol_1, 9);
    assert.equal(set.cherry_1, 2); // id % 3 + 1
    assert.equal(set.cherry_3, 1);
    assert.equal(set.cherry_30, 1);
    assert.equal('cherry_31' in set, false); // maxcherry 30 at maturity 10
    // Maturity 4 at health 10 shows 4 cherries; maturity 1-3 has none.
    const m4 = fruitState(kids, 4);
    assert.equal(m4.cherry_4, 2);
    assert.equal(Object.keys(fruitState(kids, 3)).filter((k) => k.startsWith('cherry')).length, 0);
  });
});
