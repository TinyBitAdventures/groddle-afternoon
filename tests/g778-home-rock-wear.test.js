/**
 * G778 (#360): a home rock wears once each time it is mined out, as in Glitch (include/mining.js
 * 388-389: addWear only when chunks_remaining reaches 0), not once a swing; a sparkly rock lasts 40
 * mine-outs (rock_sparkly_1.js cultivation_max_wear 40). And a cultivation that just wore out gets
 * its restoration on the realtime server at once: the owner's page stores the save that holds it and
 * asks the site for its token (HomeStreet.php restores), so putting things in no longer says "There
 * is no such project here" (projects.go) until the next load.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyStockAct } from '../public/js/yard-stock-mp.js?v=7cd51cb1';
import { RESTORE_RETRIES, RESTORE_RETRY_MS, missingRestoreWires, restoreWireId } from '../public/js/home-street-mp.js?v=96e52985';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const ITEMS = [{ id: 6, protoClass: 'proto_sparkly_rock', endClass: 'rock_sparkly_1', rx: -1800, wear: 0 }];

describe('G778: a home rock wears per mine-out', () => {
  it('a visitor\'s swings wear the rock only on the one that mines it out', () => {
    const rocks = [{ classId: 'rock_sparkly_1', rock: { classTsid: 'rock_sparkly_1', chunksRemaining: 20, chunksMax: 50, depleted: false, respawnAt: 0 } }];
    const swing = (took, at) => applyStockAct({ rocks, nodes: {}, items: ITEMS }, { kind: 'rock', target: 'rock:0', verb: 'mine', took, at }, at);
    const outs = [swing(7, 1000), swing(7, 2000), swing(7, 3000), swing(7, 4000)].map((r) => r.minedOut);
    assert.deepEqual(outs, [false, false, true, false], 'the third swing clears 20 chunks; the fourth hits a mined-out rock');
  });

  it('the owner\'s game and the visitor path both wear on a mine-out only', () => {
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /if \(\/\^rocks_depleted:rock_\[a-z\]\+_\\d\+\$\/\.test\(counter\)\) kinds = \['rock'\];/);
    assert.doesNotMatch(homes, /\^rock_\[a-z\]\+_\\d\+:mine\$/);
    // game.js emits rocks_depleted:<class> only when the swing left the rock depleted.
    assert.match(read('public/game.js'), /ROCK_CATALOG\[target\.classId\] && verbId === 'mine' && target\.state\?\.rock\?\.depleted\) \{\n\s+emitGameEvent\(`rocks_depleted:\$\{target\.classId\}`\);/);
    assert.match(read('public/js/features/yard-verbs-mp-feature.js'), /changed\.kind === 'rock' && changed\.minedOut && changed\.wearItem != null/);
  });
});

describe('G778: a fresh worn-out cultivation gets its restoration token at once', () => {
  it('names my depleted items the realtime server has no token for', () => {
    const homes = {
      cult: { items: [{ id: 6, depleted: true, cycle: 2 }, { id: 7, depleted: false }] },
      backCult: { items: [{ id: 3, depleted: true }] },
    };
    const front = restoreWireId(7, { id: 6, cycle: 2 }, 'street');
    const back = restoreWireId(7, { id: 3 }, 'back');
    assert.deepEqual(missingRestoreWires(homes, 7, new Map()), [front, back]);
    assert.deepEqual(missingRestoreWires(homes, 7, new Map([[front, 1]])), [back]);
    assert.deepEqual(missingRestoreWires(homes, 7, new Set([front, back])), []);
    assert.deepEqual(missingRestoreWires(null, 7, new Map()), []);
    assert.ok(RESTORE_RETRY_MS >= 1000 && RESTORE_RETRIES >= 2);
  });

  it('stores the save, then reloads the site\'s tokens, on my street or in my house', () => {
    const src = read('public/js/features/home-street-mp-feature.js');
    assert.match(src, /flush\(engine\)\.catch\(\(\) => false\)\.finally\(\(\) => loadOwn\(\{ force: true \}\)\);/);
    assert.match(src, /if \(w === 'street' \|\| w === 'house'\) ensureRestoreTokens\(now\);/);
  });
});
