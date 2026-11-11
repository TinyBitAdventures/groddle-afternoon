/**
 * Story quests in the quest log wait for what offered them in Glitch (Austin 2026-11-11, after
 * report 192): Ilmenskie Jones at Teleportation IV, Notice the Unnoticeable at 302 locations,
 * Four Letter Words at level 7, Legalize It once a subway gate has turned you away for want of
 * papers. The Museum of the Rook stays open (its Piety and Martial Imagination are rare).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const quests = JSON.parse(readFileSync(new URL('../public/assets/content/quests.json', import.meta.url), 'utf8'));
const catalog = quests.quests || quests;
const gsjs = (p) => {
  try {
    return readFileSync(new URL(`../../glitch-GameServerJS/${p}`, import.meta.url), 'utf8');
  } catch {
    return null;
  }
};
const offerFn = game.slice(game.indexOf('function canOfferStoryQuest('), game.indexOf('function appendStoryQuestOffers('));

test('the numbers are the source\'s', (t) => {
  assert.deepEqual(catalog.letter_block_2.offerTriggers, [{ type: 'level', level: 7 }]);
  assert.match(game, /const FOUR_LETTER_OFFER_LEVEL = 7;/);
  assert.match(game, /const PHANTOM_OFFER_LOCATIONS = 302;/);
  const inc = gsjs('players/inc_quests.js');
  if (!inc) return t.skip('glitch-GameServerJS not beside the game');
  assert.match(inc, /if\(locations_count >= 302\) \{\s*this\.quests_offer\('phantom_glitch'\);/);
  assert.match(gsjs('items/subway_gate.js'), /pc\.quests_offer\('card_carrying_qualification', true\)/);
});

test('canOfferStoryQuest holds each one back until then; the Rook museum is not gated here', () => {
  assert.match(offerFn, /classTsid === PHANTOM_QUEST_ID && groupLabelCount\(achieveState, 'locations_visited'\) < PHANTOM_OFFER_LOCATIONS\) return false;/);
  assert.match(offerFn, /classTsid === FOUR_LETTER_QUEST_ID && \(Number\(pc\.level\) \|\| 0\) < FOUR_LETTER_OFFER_LEVEL\) return false;/);
  assert.match(offerFn, /classTsid === LEGALIZE_QUEST_ID && !questState\.story\?\.gates\?\.legalize\) return false;/);
  assert.doesNotMatch(offerFn, /ROOK_HALL_START_QUEST_ID && .*level/);
});

test('a subway gate that refuses for papers offers Legalize It and remembers it; the save keeps that', () => {
  const fn = game.slice(game.indexOf('function offerLegalizeAtGate('), game.indexOf('function legalizeStageProgress('));
  assert.match(fn, /questState\.story\.gates = \{ \.\.\.\(questState\.story\.gates \|\| \{\}\), legalize: true \};/);
  assert.match(fn, /openQuestDialogue\(LEGALIZE_QUEST_ID/);
  assert.match(game, /if \(!legalizeOnRoute\(\)\) return offerLegalizeAtGate\(\);/);
  const save = readFileSync(new URL('../public/js/player-save.js', import.meta.url), 'utf8');
  assert.match(save, /story\.gates = cleanScalarRecord\(seed\.story\.gates\);/);
});
