/**
 * Report #545 (2026-11-19): a Fruit Tree looked the same with 0 Cherries and with 286; paper and
 * wood trees showed how much they held. Glitch drew every trant with fruit_amt (f_num / f_cap) of
 * its fruit (updateTrantDisplay in glitch-items trant_*.as: cherry_N up to floor(fruit_amt * slots),
 * bean_N, bubble_N, egg_N's egg, flask_N, fruit_N up to ceil). Each fruiting stage now also comes
 * bare (_f0) and half (_f1), rendered from those SWFs (tools/vector-sprites/trant-fruit-levels.mjs),
 * and street and patch trees draw the one for the fruit they hold.
 * Run: node --test tests/trant-fruit-art-545.test.js
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { TRANT_FRUIT_ART_STAGES, TRANT_META, setTrantTables, trantFrameKey, trantFruitArt } from '../public/js/trants.js?v=864ea9ff';
import { treeFrameUrl } from '../public/js/features/patches-feature.js?v=725990dd';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js?v=e96be5f1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
setTrantTables(JSON.parse(read('public/assets/content/trants.json')));
const SPECIES = Object.keys(TRANT_META);
const frame = (key) => `assets/sprites/trants/frames/${key}.webp`;

describe('#545 trants show the fruit they hold', () => {
  it('bare at none, half under three quarters, full from there; a tree too young has no fruit art', () => {
    const tree = (fruitCount, fruitCapacity = 40) => ({ classTsid: 'trant_fruit', maturity: 10, health: 10, fruitCount, fruitCapacity });
    assert.equal(trantFruitArt(tree(0)), 'f0');
    assert.equal(trantFruitArt(tree(1)), 'f1');
    assert.equal(trantFruitArt(tree(29)), 'f1');
    assert.equal(trantFruitArt(tree(30)), '');
    assert.equal(trantFruitArt(tree(40)), '');
    assert.equal(trantFruitArt(tree(0, 0)), '', 'no capacity: the plain stage art');
    // The report's tree: extra large, 0 Cherries, then 286 of 288.
    assert.equal(trantFruitArt(tree(0, 288)), 'f0');
    assert.equal(trantFruitArt(tree(286, 288)), '');
  });

  it('only the fruiting stages take a fruit suffix', () => {
    assert.deepEqual([...TRANT_FRUIT_ART_STAGES], [5, 7, 10]);
    assert.equal(trantFrameKey('trant_fruit', 10, 'f0'), 'trant_fruit_m10_f0');
    assert.equal(trantFrameKey('trant_fruit', 10, ''), 'trant_fruit_m10');
    assert.equal(trantFrameKey('trant_fruit', 3, 'f0'), 'trant_fruit_m3');
  });

  it('every species and fruiting stage ships bare and half art, 1x and 3x, the size of its full frame', () => {
    const size = (rel) => {
      const b = readFileSync(join(root, 'public', rel));
      // Lossless WebP (VP8L): 14-bit width and height after the signature byte.
      assert.equal(b.toString('ascii', 12, 16), 'VP8L', rel);
      const bits = b.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    };
    for (const sp of SPECIES) {
      for (const stage of TRANT_FRUIT_ART_STAGES) {
        const full = frame(`${sp}_m${stage}`);
        for (const art of ['f0', 'f1']) {
          const rel = frame(trantFrameKey(sp, stage, art));
          assert.ok(existsSync(join(root, 'public', rel)), rel);
          assert.deepEqual(size(rel), size(full), `${rel} matches ${full}`);
          const hi = HIRES_SPRITES.get(rel);
          assert.ok(hi && existsSync(join(root, 'public', hi)), `${rel} has its 3x file`);
        }
      }
    }
  });

  it('patch trees load the frame for their fruit', () => {
    assert.match(treeFrameUrl('trant_fruit', 10, { maturity: 10, health: 10, fruitCount: 0, fruitCapacity: 40 }), /trant_fruit_m10_f0\.webp/);
    assert.match(treeFrameUrl('trant_fruit', 10, { maturity: 10, health: 10, fruitCount: 40, fruitCapacity: 40 }), /trant_fruit_m10\.webp/);
    assert.match(treeFrameUrl('trant_bean', 6), /trant_bean_m5\.webp/, 'without a state: the full frame, as before');
  });

  it('street trees draw from their state and follow it as it changes', () => {
    const game = read('public/game.js');
    assert.match(game, /textureForTrant\(classId, trantState\.maturity, trantState\)/, 'a street tree spawns with its fruit');
    assert.match(game, /textureForTrant\(target\.classId, target\.state\.maturity, target\.state\)/, 'refreshTreeVisual follows the fruit');
    assert.match(game, /run\('trant fruit art', syncTrantFruitArt\)/, 'the ticker checks each trant\'s fruit');
  });
});
