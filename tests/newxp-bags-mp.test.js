/**
 * The Gentle Island bag gate (Austin's report, 2026-10-27: a new multiplayer
 * character with one bag was held at Progress Way's exit). The counter was
 * right (one bag bought, quests/buy_two_bags.js needs two: requirements r365
 * generic_bag_purchased num 2) and a character who skipped a practice street
 * (EZ Cooking's is lost) has exactly the rock's 978 currants, one bag's worth
 * at 500. What was missing was the original client's progress line after each
 * step (glitch-client QuestQueue.as handleNextThingInQueue 152-158, fed by
 * GSJS quests/quest.js announceStateChange 798-829): "Enlarge Yer Slots" and
 * "Purchase a Generic Bag (1/2)". newxp-feature shows it after each bag and,
 * a departure, again after the gate's "You haven't bought your bags" line.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BAGS_NEEDED, CHEAP_BAG_PRICE, ISLAND_CURRANTS, questQueueLine, street4Check } from '../public/js/newxp.js?v=g449-1';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('the bag quest says how many bags it still wants', () => {
  it('the original client\'s line: title, then the requirement with (got/need) when it needs more than one', () => {
    assert.deepEqual(questQueueLine('Enlarge Yer Slots', 'Purchase a Generic Bag', 1, 2), { title: 'Enlarge Yer Slots', line: 'Purchase a Generic Bag (1/2)' });
    assert.deepEqual(questQueueLine('Enlarge Yer Slots', 'Purchase a Generic Bag', 2, 2), { title: 'Enlarge Yer Slots', line: 'Purchase a Generic Bag (2/2)' });
    assert.equal(questQueueLine('Enlarge Yer Slots', 'Purchase a Generic Bag', 5, 2).line, 'Purchase a Generic Bag (2/2)', 'never past the need');
    assert.equal(questQueueLine('A quest', 'Do the thing', 1, 1).line, 'Do the thing', 'a single step shows no count');
    assert.equal(questQueueLine('', 'x', 0, 1).title, 'Quest Update', 'the client\'s fallback title');
  });

  it('the source\'s numbers: 978 currants buy one 500-currant bag, so a character with none of its own needs 22 more', () => {
    assert.equal(ISLAND_CURRANTS, 978);
    assert.equal(CHEAP_BAG_PRICE * BAGS_NEEDED - ISLAND_CURRANTS, 22);
    assert.equal(Math.floor(ISLAND_CURRANTS / CHEAP_BAG_PRICE), 1);
    assert.equal(street4Check('quest_given', false), 'noBags', 'one bag is not the quest done: the gate still holds');
  });

  it('the quest catalog\'s own words feed it (quests/buy_two_bags.js)', () => {
    const q = JSON.parse(read('public/assets/content/quests.json')).buy_two_bags;
    assert.equal(q.title, 'Enlarge Yer Slots');
    assert.deepEqual(q.requirements.map((r) => [r.name, r.num, r.desc]), [['generic_bag_purchased', 2, 'Purchase a Generic Bag']]);
  });

  it('newxp-feature shows it after each bag bought on the island, and after the gate\'s source line', () => {
    const src = read('public/js/features/newxp-feature.js');
    assert.match(src, /if \(\/\^vendor_bought:bag_\(generic\|bigger\)\$\/\.test\(String\(counter\)\) && save\.stage === 'island'\) \{\n\s*setTimeout\(\(\) => bagProgress\(engine\), 1500\);/);
    assert.match(src, /vog\(token, LINES\.noBagsYet\)\.then\(\(\) => bagProgress\(engine, \{ sound: false \}\)\)/, 'the source line first, unchanged, then the count');
    assert.match(src, /engine\.toast\(`\$\{q\.title\}: \$\{q\.line\}`, 4000\);/, 'four seconds, as MAX_STAY_TIME');
    assert.match(src, /engine\.playSound\('COMPLETE_QUEST_REQUIREMENT'/);
    assert.match(src, /engine\.pushActivity\(`Quest Progress: \$\{q\.title\}\. \$\{q\.line\}`\);/, 'the client\'s "Quest Progress:" log line');
    assert.ok(read('public/js/newxp.js').includes("noBagsYet: 'You haven\\'t bought your bags from the vendor yet. You really need to do that …',"), 'the source words stay');
  });
});
