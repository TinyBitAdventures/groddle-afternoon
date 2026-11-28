/**
 * Report #545 (2026-11-19): a Fruit Tree looked the same with 0 Cherries and with 286; paper and
 * wood trees showed how much they held. Glitch drew every trant with fruit_amt (f_num / f_cap) of
 * its fruit (updateTrantDisplay in glitch-items trant_*.as: cherry_N up to floor(fruit_amt * slots),
 * bean_N, bubble_N, egg_N's egg, flask_N, fruit_N up to ceil). Each fruiting stage now also comes
 * bare (_f0), rendered from those SWFs (tools/vector-sprites/trant-fruit-levels.mjs), and since
 * #735 every count between is the bare still with fruit pieces (js/trant-looks.js); street and
 * patch trees draw the one for the fruit they hold.
 * Run: node --test tests/trant-fruit-art-545.test.js
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { TRANT_META, setTrantTables } from '../public/js/trants.js?v=cf0fe1a3';
import { trantLook } from '../public/js/trant-looks.js?v=c6507fcd';
import { treeFrameUrl } from '../public/js/features/patches-feature.js?v=47114517';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js?v=6a4569c4';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
setTrantTables(JSON.parse(read('public/assets/content/trants.json')));
const SPECIES = Object.keys(TRANT_META);

describe('#545 trants show the fruit they hold', () => {
  it('bare at none, every count between (#735), full when it holds all; a tree too young has no fruit art', () => {
    const tree = (fruitCount, fruitCapacity = 40) => trantLook('trant_fruit', 10, { maturity: 10, health: 10, fruitCount, fruitCapacity }).key;
    assert.equal(tree(0), 'trant_fruit_m10_f0');
    assert.equal(tree(1), 'trant_fruit_m10_f0', 'floor(1 / 40 * 30) = 0 cherries');
    assert.equal(tree(2), 'trant_fruit_m10_n1');
    assert.equal(tree(29), 'trant_fruit_m10_n21');
    assert.equal(tree(40), 'trant_fruit_m10');
    assert.equal(tree(0, 0), 'trant_fruit_m10_f0', 'no capacity: no fruit (Glitch: fruit_amt 0 / 0 shows none)');
    // The report's tree: extra large, 0 Cherries, then 286 of 288.
    assert.equal(tree(0, 288), 'trant_fruit_m10_f0');
    assert.equal(tree(286, 288), 'trant_fruit_m10_n29');
    assert.equal(trantLook('trant_fruit', 3, { maturity: 3, health: 10, fruitCount: 0, fruitCapacity: 0 }).key, 'trant_fruit_m3', 'no fruit before maturity 4');
  });

  it('every species and fruiting stage ships its bare still, 1x and 3x, the size of its full one', () => {
    const size = (rel) => {
      const b = readFileSync(join(root, 'public', rel));
      // Lossless WebP (VP8L): 14-bit width and height after the signature byte.
      assert.equal(b.toString('ascii', 12, 16), 'VP8L', rel);
      const bits = b.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    };
    for (const sp of SPECIES) {
      for (let stage = 4; stage <= 10; stage++) {
        const full = trantLook(sp, stage).url.split('?')[0];
        const rel = trantLook(sp, stage, { maturity: stage, health: 10, fruitCount: 0, fruitCapacity: 10 }).url.split('?')[0];
        assert.match(rel, /_f0\.webp$/, rel);
        assert.ok(existsSync(join(root, 'public', rel)), rel);
        assert.deepEqual(size(rel), size(full), `${rel} matches ${full}`);
        const hi = HIRES_SPRITES.get(rel);
        assert.ok(hi && existsSync(join(root, 'public', hi)), `${rel} has its 3x file`);
      }
    }
  });

  it('patch trees draw the look for their fruit', () => {
    const patches = read('public/js/features/patches-feature.js');
    assert.match(patches, /return loadTrantLook\(treeLook\(tree\)\);/);
    assert.match(treeFrameUrl('trant_bean', 6), /trant_bean_m6\.webp/, 'without a state: the full still of its own maturity (#735)');
  });

  it('street trees draw from their state and follow it as it changes', () => {
    const game = read('public/game.js');
    assert.match(game, /textureForTrant\(classId, trantState\.maturity, trantState\)/, 'a street tree spawns with its fruit');
    assert.match(game, /textureForTrant\(target\.classId, target\.state\.maturity, target\.state\)/, 'refreshTreeVisual follows the fruit');
    assert.match(game, /run\('trant fruit art', syncTrantFruitArt\)/, 'the ticker checks each trant\'s fruit');
  });
});
