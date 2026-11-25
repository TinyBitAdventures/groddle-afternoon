/**
 * A full place's drop refusal names the place (drops.go refuses "full" at 60 shared stacks, its text
 * saying "street" everywhere): a house with its back yard says house, a Tower floor says Tower floor,
 * a public or home street keeps street. Other refusals keep the server's own words.
 * Run: node --test tests/drop-full-wording.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DROP_TEXT, dropRefusalText, fullPlaceName } from '../public/js/drops-mp.js?v=ca287793';

describe('the full refusal names the place', () => {
  it('house, Tower floor, street', () => {
    assert.equal(fullPlaceName('HOUSE_42'), 'house');
    assert.equal(fullPlaceName('TOWER_42_3'), 'Tower floor');
    assert.equal(fullPlaceName('HOME_42'), 'street');
    assert.equal(fullPlaceName('LIF102FDNU11314'), 'street');
    assert.equal(fullPlaceName(''), 'street');
  });

  it('a full refusal reads as the place; others keep the server\'s words', () => {
    const full = { status: 'refused', why: 'full', text: "This street can't hold any more dropped things." };
    assert.equal(dropRefusalText(full, 'HOUSE_7'), "This house can't hold any more dropped things.");
    assert.equal(dropRefusalText(full, 'TOWER_7_0'), "This Tower floor can't hold any more dropped things.");
    assert.equal(dropRefusalText(full, 'HOME_7'), "This street can't hold any more dropped things.");
    assert.equal(dropRefusalText({ why: 'full', street: 'TOWER_9_1' }), DROP_TEXT.full('Tower floor'), 'the message\'s street when none is given');
    assert.equal(dropRefusalText({ why: 'busy', text: 'Wait a moment, you are still dropping something.' }, 'HOUSE_7'), 'Wait a moment, you are still dropping something.');
    assert.equal(dropRefusalText({}, 'HOUSE_7'), "That didn't work.");
    for (const p of ['house', 'Tower floor', 'street']) assert.doesNotMatch(DROP_TEXT.full(p), /—/);
  });

  it('the drop answer uses it with the street the player is on', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'features', 'drops-mp-feature.js'), 'utf8');
    assert.match(src, /else tell\(dropRefusalText\(msg, client\.street \|\| street, d \? /); // #691: with the drop's names
    assert.doesNotMatch(src, /tell\(String\(msg\.text \|\| "That didn't work\."\)\)/);
  });
});
