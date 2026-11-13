/**
 * Shared count and article words (js/words.js) and the messages audit's plural rows (2026-11-12):
 * "held the crown for 1 seconds", "opens in 1 minutes", "planted a Egg Plant", "You picked up 3 Fruity Juice".
 * Run: node --test tests/plural-words.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countWords, pluralize, withArticle } from '../public/js/words.js?v=ee4e72f8';
import { YARD_TEXT } from '../public/js/yard-verbs-mp.js?v=6ed713c6';
import { pluralize as butlerPluralize } from '../public/js/butler.js?v=a660e585';
import { ensureMakingItems } from '../public/js/making.js?v=bc0ec9c8';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=f49c8998';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('plural and article words', () => {
  it('pluralize, withArticle and countWords', () => {
    assert.equal(pluralize(1, 'second'), '1 second');
    assert.equal(pluralize(4, 'second'), '4 seconds');
    assert.equal(pluralize(2, 'Pinch of Salt', 'Pinches of Salt'), '2 Pinches of Salt');
    assert.equal(withArticle('Egg Plant'), 'an Egg Plant');
    assert.equal(withArticle('Bean Tree'), 'a Bean Tree');
    assert.equal(countWords(1, 'Spicy Grog', 'Spicy Grogs'), 'a Spicy Grog');
    assert.equal(countWords(3, 'Fruity Juice', 'Fruity Juices'), '3 Fruity Juices');
    assert.equal(butlerPluralize, pluralize, 'the Butler shares the one helper');
  });

  it('the yard owner reads "an Egg Plant"', () => {
    assert.equal(YARD_TEXT.planted('Ada', 'Egg Plant'), 'Ada planted an Egg Plant in your Patch.');
  });

  it('the crown time and the street project waits use pluralize', () => {
    const crowns = read('public/js/features/crowns-feature.js');
    assert.equal((crowns.match(/held the crown for \$\{pluralize\(/g) || []).length, 2);
    assert.doesNotMatch(crowns, /\} seconds\.`/);
    const jobs = read('public/js/features/street-jobs-feature.js');
    assert.doesNotMatch(jobs, /\} minutes\./);
    assert.equal((jobs.match(/It opens in \$\{pluralize\(mins, 'minute'\)\}\./g) || []).length, 2, 'a delay text also says when');
  });

  it('the tutorial counts its drinks with their own plurals (fruity_juice.js 6, spicy_grog.js 6)', () => {
    ensureMakingItems();
    assert.equal(ITEM_CATALOG.fruity_juice?.namePlural, 'Fruity Juices');
    assert.match(read('public/js/features/newxp-feature.js'), /You picked up \$\{countWords\(row\.count, ITEM_LABEL\(row\.classTsid\), ITEM_CATALOG\[row\.classTsid\]\?\.namePlural/);
  });
});
