/**
 * G943 (Austin 2026-11-17): no outdoor street lays out loose Apples any more.
 *
 * The remake put four ambient Apples on every non-exact outdoor street (about 4,984 on 1,246
 * streets), one set per player, back each game day. Glitch placed none: no street file in the
 * archive holds an apple stack (G941 audit M2). An Apple stays a real item from its Glitch
 * sources: the stores (items/catalog_stores.js), the Generic Small Drop table
 * (items/catalog_drop_tables.js), the Fruit-Changing Machine, quests and trades.
 *
 * Layouts stay put: the four apple spots stay in the planner (game.js enterStreet, the realtime
 * server's builders, the level builder's validator), empty, as G938 kept the Musicblock's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { populationForStreet } from '../public/js/street-ecology.js?v=f1c11a2d';
import { normalizeWorldSnapshot } from '../public/js/player-save.js?v=89e19e82';
import { getVerbsFor } from '../public/content.js?v=dd5c5cb5';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=3be7988a';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const KEPT_SPOT = /\{ key: 'apples', count: (currentStreetPopulation|population|pop)\.apples, clearance: 30 \},\n\s+\{ key: 'musicblocks'/;

describe('G943: no ambient Apples on streets', () => {
  it('game.js draws no street Apple and keeps no Apple state', () => {
    const game = read('public/game.js');
    assert.doesNotMatch(game, /spawnApples|collectedApples|appleIcon/);
    assert.doesNotMatch(game, /classId: 'apple'/, 'nothing registers a loose Apple to click');
    assert.doesNotMatch(game, /placement\('apples'\)/, 'the kept spots are never read');
  });

  it('a loose Apple has no pick up verb, though the Apple item stays', () => {
    assert.ok(ITEM_CATALOG.apple, 'the item itself stays');
    assert.ok(!getVerbsFor({ classId: 'apple', state: {} }, { pc: { energy: 80, mood: 70 }, inv: {} }).some((v) => v.id === 'pickup'));
    assert.doesNotMatch(read('public/content.js'), /classId === 'apple'/);
  });

  it('every planner keeps the four apple spots, empty, so no layout moves', () => {
    const pop = populationForStreet('GIF15OTSM102353', { counts: { trant_fruit: 1 } });
    assert.equal(pop.apples, 4, 'four kept spots on an outdoor street');
    for (const rel of ['public/game.js', 'tools/build-realtime-objects.mjs', 'tools/build-realtime-quoins.mjs', 'public/js/builder/validate.js']) {
      assert.match(read(rel), KEPT_SPOT, rel);
    }
  });

  it('an older save with street Apples loads cleanly and drops them', () => {
    const world = normalizeWorldSnapshot({ streets: { LA5: { collectedApples: [0, 1, 3], collectedQuoins: [2] } } });
    assert.equal(world.streets.LA5.collectedApples, undefined);
    assert.deepEqual(world.streets.LA5.collectedQuoins, [2]);
  });
});
