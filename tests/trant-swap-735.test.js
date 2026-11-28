/**
 * #735 review (2026-11-27): after each harvest a street trant flashed a stand-in for about half a
 * second: the nearest preloaded full still (a maturity-10 Fruit Tree drew all 30 cherries, then
 * dropped to 8; a maturity-8 one swapped to the smaller maturity-7 tree and back). The fruit count
 * changed the look, the new look had not loaded or been drawn yet, and game.js textureForTrant gave
 * the nearest preloaded maturity meanwhile; trees update about twice a second (syncTrantFruitArt).
 * Patch trees wait for their look and never flickered. Now a street tree keeps the picture it shows
 * until its new look is ready (js/trant-looks.js trantShownTexture), swaps the moment it is, and its
 * maturity's stills and pieces are warmed when it is drawn (warmTrantLook).
 * Run: node --test tests/trant-swap-735.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { setTrantTables } from '../public/js/trants.js?v=cf0fe1a3';
import { trantLook, trantShownTexture, warmTrantLook } from '../public/js/trant-looks.js?v=a46ab4b1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
setTrantTables(JSON.parse(read('public/assets/content/trants.json')));

describe('#735 review: a street trant keeps its own picture while its new look loads', () => {
  it('after a harvest it shows its current look, never another maturity or fruit count, until the new one is ready', () => {
    const before = trantLook('trant_fruit', 10, { maturity: 10, health: 10, fruitCount: 70, fruitCapacity: 210 });
    const after = trantLook('trant_fruit', 10, { maturity: 10, health: 10, fruitCount: 58, fruitCapacity: 210 });
    assert.equal(before.key, 'trant_fruit_m10_n10');
    assert.equal(after.key, 'trant_fruit_m10_n8');
    const shown = { label: before.key };
    const standIns = [];
    // In Node the new look can never load or be drawn: the worst case of the swap.
    const tex = trantShownTexture(after, shown, () => {
      standIns.push('trant_fruit_m10');
      return { label: 'trant_fruit_m10' };
    });
    assert.equal(tex, shown, `drew ${tex?.label} while ${after.key} loads`);
    assert.deepEqual(standIns, [], 'no stand-in asked for');
    // A maturity-8 tree does not borrow the maturity-7 still either.
    const m8 = trantLook('trant_fruit', 8, { maturity: 8, health: 10, fruitCount: 44, fruitCapacity: 200 });
    const cur8 = { label: 'trant_fruit_m8_n6' };
    assert.equal(trantShownTexture(m8, cur8, () => ({ label: 'trant_fruit_m7' })), cur8);
  });

  it('only a tree with no picture yet takes a stand-in', () => {
    const look = trantLook('trant_bean', 6, { maturity: 6, health: 10, fruitCount: 3, fruitCapacity: 20 });
    assert.deepEqual(trantShownTexture(look, null, () => ({ label: 'trant_bean_m5' })), { label: 'trant_bean_m5' });
    assert.doesNotThrow(() => warmTrantLook(look), 'warming without Pixi or fetch is a no-op');
  });

  it('game.js: refreshTreeVisual keeps the shown texture, swaps when the look is ready, and warms each tree', () => {
    const game = read('public/game.js');
    const refresh = game.slice(game.indexOf('  refreshTreeVisual(target) {'), game.indexOf('  /** Grant a condition-less badge outright'));
    assert.match(refresh, /trantShownTexture\(look, target\.sprite\.texture, \(\) => textureForTrant\(/, 'the stand-in only when it shows nothing');
    assert.doesNotMatch(refresh, /const tex = textureForTrant\(/, 'no stand-in over a tree that has its picture');
    assert.match(refresh, /loadTrantLook\(look\)\.then\(/, 'swaps the moment its look is ready');
    assert.match(refresh, /warmTrantLook\(look\)/);
    assert.match(game, /warmTrantLook\(trantLook\(classId, trantState\.maturity, trantState\)\)/, 'warmed when the street spawns it');
  });
});
