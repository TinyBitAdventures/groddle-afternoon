/**
 * Report #735 (follow-up to #545): a trant showed 5 maturity looks (stills 1, 3, 5, 7, 10, the
 * nearest chosen in game.js and again in features/patches-feature.js), so a maturity-4 Fruit Tree
 * holding 40 Cherries drew the cherry-less maturity-3 still, and fruit came in 3 levels on 3 stages.
 * Glitch drew one clip per maturity 1-10 (glitch-items trant_fruit.as 3-14, 25) holding fruit_amt
 * of the fruit slots its health allows (54-74, 94-121: floor(fruit_amt * cherryTop[health - 1])
 * cherries, 0-30 at maturity 10 and health 10; the other trants ceil of their getFruitingPos /
 * fruitPosArray slots). Now every maturity and every fruit count has its picture
 * (js/trant-looks.js, one chooser for street and patch trees; art from
 * tools/vector-sprites/trant-fruit-levels.mjs).
 *
 * Out of scope (Austin, 2026-11-27): health on the leaves (Glitch's fol_N gotoAndStop(health +/-
 * jitter)) is a later lane. The report's health check is narrowed to what this lane draws: health
 * capping how many fruit show.
 * Run: node --test tests/trant-looks-735.test.js
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { TRANT_META, setTrantTables } from '../public/js/trants.js?v=cf0fe1a3';
import { TRANT_STAGES, trantFruitShown, trantLook, trantLookFiles, trantStage } from '../public/js/trant-looks.js?v=a46ab4b1';
import { TRANT_FRUIT_PIECES } from '../public/js/trant-fruit-pieces.js?v=b1fbc950';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js?v=6a4569c4';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
setTrantTables(JSON.parse(read('public/assets/content/trants.json')));
const SPECIES = Object.keys(TRANT_META);
const file = (url) => join(root, 'public', String(url).split('?')[0]);
// What a street fruit tree draws (game.js textureForTrant and patches-feature.js both ask trantLook).
const keyFor = (s) => trantLook('trant_fruit', s.maturity, { classTsid: 'trant_fruit', ...s }).key;

/** Width and height of a lossless WebP (VP8L). */
function webpSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 12, 16), 'VP8L', path);
  const bits = b.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
}

describe('#735 trant looks vs Glitch', () => {
  it('health caps the fruit that shows: a full health-4 tree draws 2 cherries, a full health-10 one 30 (leaves: a later lane)', () => {
    const a = keyFor({ maturity: 10, health: 4, fruitCount: 40, fruitCapacity: 40 });
    const b = keyFor({ maturity: 10, health: 10, fruitCount: 40, fruitCapacity: 40 });
    assert.notEqual(a, b, `both draw ${a}`);
    assert.equal(trantFruitShown('trant_fruit', { maturity: 10, health: 4, fruitCount: 40, fruitCapacity: 40 }), 2);
    assert.equal(trantFruitShown('trant_fruit', { maturity: 10, health: 10, fruitCount: 40, fruitCapacity: 40 }), 30);
  });

  it('each of the 10 maturities has its own look', () => {
    const keys = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => keyFor({ maturity: m, health: 10, fruitCount: 0, fruitCapacity: 0 })));
    assert.equal(keys.size, 10, `only ${keys.size}: ${[...keys]}`);
    assert.deepEqual([...TRANT_STAGES], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(trantStage(0), 1, 'a hole draws the sprout');
    assert.equal(trantStage(4.6), 4);
    assert.equal(trantStage(12), 10);
  });

  it('a maturity-4 fruit tree holding cherries draws cherries (Glitch: maturity > 3)', () => {
    const k = keyFor({ maturity: 4, health: 10, fruitCount: 40, fruitCapacity: 40 });
    assert.notEqual(k, 'trant_fruit_m3', 'draws the cherry-less m3 still');
    assert.equal(k, 'trant_fruit_m4');
    assert.equal(trantFruitShown('trant_fruit', { maturity: 4, health: 10, fruitCount: 40, fruitCapacity: 40 }), 4);
  });

  it('fruit at m10 h10 has 31 looks in Glitch (floor(fruit_amt * 30) cherries)', () => {
    const keys = new Set();
    for (let n = 0; n <= 288; n++) keys.add(keyFor({ maturity: 10, health: 10, fruitCount: n, fruitCapacity: 288 }));
    assert.equal(keys.size, 31, `only ${keys.size}: ${[...keys]}`);
    // The report's tree: 286 of 288 is floor(29.79) = 29 cherries, not the full 30.
    assert.equal(keyFor({ maturity: 10, health: 10, fruitCount: 286, fruitCapacity: 288 }), 'trant_fruit_m10_n29');
    assert.equal(keyFor({ maturity: 10, health: 10, fruitCount: 0, fruitCapacity: 288 }), 'trant_fruit_m10_f0');
  });

  it('the other trants round up: a bean tree holding 1 of 100 shows 1 bean', () => {
    // trant_bean.as: f_amt = Math.ceil(fruit_amt * slots), slots = getFruitingPos(health - 1).
    assert.equal(trantFruitShown('trant_bean', { maturity: 10, health: 10, fruitCount: 1, fruitCapacity: 100 }), 1);
    assert.equal(trantFruitShown('trant_bean', { maturity: 10, health: 10, fruitCount: 100, fruitCapacity: 100 }), 46);
    assert.equal(trantFruitShown('trant_bean', { maturity: 10, health: 8, fruitCount: 100, fruitCapacity: 100 }), 32, 'fruitPos[7]');
    assert.equal(trantFruitShown('trant_bean', { maturity: 3, health: 10, fruitCount: 5, fruitCapacity: 5 }), 0, 'no beans before maturity 4');
  });

  it('Glitch\'s slot tables are carried over (fruitPosArray, getFruitingPos)', () => {
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_fruit.slots[9], [0, 0, 0, 2, 3, 5, 10, 15, 20, 30]);
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_bubble.slots[9], [0, 0, 0, 8, 8, 24, 24, 34, 34, 48]);
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_spice.slots[3], [0, 0, 0, 0, 0, 1, 3, 5, 7, 9]);
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_gas.slots[6], [0, 0, 0, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_bean.slots[9], [0, 0, 0, 3, 6, 16, 24, 32, 39, 46]);
    assert.deepEqual(TRANT_FRUIT_PIECES.trant_egg.slots[9], [0, 0, 0, 1, 4, 5, 8, 8, 10, 10]);
    for (const sp of SPECIES) {
      assert.equal(TRANT_FRUIT_PIECES[sp].rounding, sp === 'trant_fruit' ? 'floor' : 'ceil', sp);
      for (const m of [1, 2, 3]) assert.equal(TRANT_FRUIT_PIECES[sp].stages[m], undefined, `${sp} m${m} bears no fruit`);
    }
  });

  it('every species, maturity and fruit count has its art, 1x and 3x, the size of its still', () => {
    for (const sp of SPECIES) {
      const cell = webpSize(file(trantLook(sp, 10).url));
      for (const m of TRANT_STAGES) {
        const full = trantLook(sp, m);
        assert.ok(existsSync(file(full.url)), full.url);
        assert.deepEqual(webpSize(file(full.url)), cell, full.url);
        assert.ok(existsSync(file(full.url).replace(/\.webp$/, '@3x.webp')), `${full.url}: its 3x`);
        const st = TRANT_FRUIT_PIECES[sp].stages[m];
        if (!st) continue;
        assert.equal(st.pieces.length, st.ids.length, `${sp} m${m}: one piece per fruit`);
        const atlas = webpSize(file(full.atlas));
        const atlas3 = webpSize(file(full.atlas).replace(/\.webp$/, '@3x.webp'));
        assert.deepEqual(atlas3, [atlas[0] * 3, atlas[1] * 3], `${full.atlas}: its 3x`);
        for (const p of st.pieces) {
          if (!p) continue;
          const [ax, ay, w, h, x, y] = p;
          assert.ok(ax + w <= atlas[0] && ay + h <= atlas[1], `${sp} m${m} piece in its atlas`);
          assert.ok(x >= 0 && y >= 0 && x + w <= cell[0] && y + h <= cell[1], `${sp} m${m} piece in the cell`);
        }
        const shown = new Set();
        for (let n = 0; n <= 1000; n++) {
          const look = trantLook(sp, m, { maturity: m, health: 10, fruitCount: n, fruitCapacity: 1000 });
          if (shown.has(look.shown)) continue;
          shown.add(look.shown);
          for (const url of trantLookFiles(look)) {
            assert.ok(existsSync(file(url)), url);
            assert.deepEqual(webpSize(file(url)), url === look.atlas ? atlas : cell, url);
          }
        }
        assert.equal(shown.size, st.ids.length + 1, `${sp} m${m}: every count from bare to full`);
        const bare = trantLook(sp, m, { maturity: m, health: 10, fruitCount: 0, fruitCapacity: 10 }).url;
        const hi = HIRES_SPRITES.get(bare.split('?')[0]);
        assert.ok(hi && existsSync(file(hi)), `${bare}: its 3x`);
      }
    }
  });

  it('one chooser: street and patch trees both ask js/trant-looks.js, and neither keeps its own stage list', () => {
    const game = read('public/game.js');
    const patches = read('public/js/features/patches-feature.js');
    assert.doesNotMatch(game, /nearestTrantMatStage|TRANT_MAT_STAGES/);
    assert.doesNotMatch(patches, /trantFrameStage|TRANT_MAT_STAGES/);
    assert.match(game, /const look = trantLook\(classTsid, maturity \?\? 7, state\);/);
    assert.match(patches, /return trantLook\(tree\.classId, tree\.state\.maturity, tree\.state\);/);
  });
});
