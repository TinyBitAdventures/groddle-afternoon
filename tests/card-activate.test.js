/**
 * The Card-Carrying Qualification activates from the pack wherever it came
 * from (items/card_carrying_qualification.js 95-141: in_pack, enabled for
 * anyone without the badge, "You already have this." once held; the handler
 * grants the badge, deletes one card and sets ccq_completed). Legalize It is
 * not needed, and when it is active the activation completes it.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { assignQuest, createQuestState } from '../public/js/quests.js?v=40c71a37';
import { createAchievementState } from '../public/js/achievements.js?v=e4e5edd0';
import { addItem, countItem, createInventory } from '../public/js/inventory.js?v=f49c8998';
import { buyDocument } from '../public/js/bureaucracy.js?v=b71fdd01';
import {
  LEGALIZE_ALREADY_HAVE,
  LEGALIZE_CARD_ID,
  LEGALIZE_QUEST_ID,
  activateCardFromPack,
  createLegalizeState,
  ensureLegalizeState,
  legalizeOnAccepted,
  qualificationVerb,
} from '../public/js/legalize-it.js?v=d27094df';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(path.join(root, 'public/assets/content'));
});

const newPc = () => ({ energy: 50, mood: 50, imagination: 0, currants: 200, xp: 0, level: 3 });

/** Cards bought from a regular Bureaucratic Hall clerk (js/bureaucracy.js, store 17), not in the Legalize It hall. */
function hallCard(count = 1) {
  const pc = newPc();
  const inv = createInventory();
  for (let i = 0; i < count; i += 1) assert.equal(buyDocument(pc, inv, LEGALIZE_CARD_ID, [], []).ok, true);
  return { pc, inv, questState: createQuestState(), achieveState: createAchievementState() };
}

describe('Card-Carrying Qualification: activate from the pack', () => {
  it('a card from a regular hall activates with no quest at all', () => {
    const run = hallCard();
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 1);
    assert.deepEqual(qualificationVerb({ hasBadge: false }), { usable: true, reason: '' });
    const result = activateCardFromPack({ ...run, now: 1000 });
    assert.equal(result.ok, true);
    assert.equal(result.badge.ok, true);
    assert.ok(run.achieveState.unlocked.includes(LEGALIZE_CARD_ID));
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 0);
    assert.equal(result.questCompleted, false);
    assert.deepEqual(result.updates, []);
    // No application is invented, so the quest is not marked done behind the player's back.
    assert.equal(run.questState.story?.legalize, undefined);
    assert.equal(run.questState.completed.includes(LEGALIZE_QUEST_ID), false);
  });

  it('with Legalize It active, activating a hall card completes the quest, mid-route or not', () => {
    const run = hallCard();
    assert.equal(assignQuest(run.questState, LEGALIZE_QUEST_ID, { ignorePrereq: true }).ok, true);
    // The route was only at the Back Alley: the card never came from the quest's hall (cardOwned false).
    const legalize = ensureLegalizeState(run.questState, { tsid: 'LA5101HF7F429V3', x: 10, y: 20 });
    legalize.stage = 'back_alley';
    assert.equal(legalize.cardOwned, false);
    const xp = run.pc.xp;
    const result = activateCardFromPack({ ...run, now: 2000 });
    assert.equal(result.ok, true);
    assert.equal(result.questCompleted, true);
    assert.equal(run.questState.active[LEGALIZE_QUEST_ID], undefined);
    assert.ok(run.questState.completed.includes(LEGALIZE_QUEST_ID));
    const done = result.updates.find((u) => u.classTsid === LEGALIZE_QUEST_ID);
    assert.equal(done.completed, true);
    assert.equal(done.rewards.xp, 100);
    assert.ok(run.pc.xp > xp);
    // The application reads activated and complete, so it is never offered or resumed.
    assert.equal(legalize.activated, true);
    assert.equal(legalize.stage, 'complete');
    assert.equal(legalize.completedAt, 2000);
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 0);
  });

  it('the badge disables Activate with the source reason', () => {
    const run = hallCard();
    run.achieveState.unlocked.push(LEGALIZE_CARD_ID);
    assert.equal(LEGALIZE_ALREADY_HAVE, 'You already have this.');
    assert.deepEqual(qualificationVerb({ hasBadge: true }), { usable: false, reason: 'You already have this.' });
    const result = activateCardFromPack({ ...run });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'already_activated');
    assert.equal(result.msg, 'You already have this.');
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 1);
  });

  it('activating uses one card and leaves the extras (they are tradeable)', () => {
    const run = hallCard();
    addItem(run.inv, LEGALIZE_CARD_ID, 1);
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 2);
    assert.equal(activateCardFromPack({ ...run }).ok, true);
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 1);
    // The second card stays, its Activate disabled now the badge is held.
    assert.equal(activateCardFromPack({ ...run }).reason, 'already_activated');
    assert.equal(countItem(run.inv, LEGALIZE_CARD_ID), 1);
  });

  it('with no card in the pack it refuses', () => {
    const run = { pc: newPc(), inv: createInventory(), questState: createQuestState(), achieveState: createAchievementState() };
    const result = activateCardFromPack(run);
    assert.equal(result.reason, 'card_missing');
    assert.equal(run.achieveState.unlocked.includes(LEGALIZE_CARD_ID), false);
  });

  it('taking Legalize It with the badge already earned completes it at once (onAccepted 65-74)', () => {
    const run = hallCard(0);
    run.achieveState.unlocked.push(LEGALIZE_CARD_ID);
    assignQuest(run.questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
    const accepted = legalizeOnAccepted({ ...run, now: 5000 });
    assert.equal(accepted.completed, true);
    assert.ok(run.questState.completed.includes(LEGALIZE_QUEST_ID));
    assert.equal(run.questState.story.legalize.stage, 'complete');
    assert.equal(run.questState.story.legalize.activated, true);
  });

  it('taking Legalize It while holding a card counts it as got, and the route carries on', () => {
    const run = hallCard();
    assignQuest(run.questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
    const accepted = legalizeOnAccepted({ ...run });
    assert.equal(accepted.completed, false);
    assert.equal(run.questState.active[LEGALIZE_QUEST_ID].progress.acquired_card_carrying_qualification, 1);
    assert.equal(run.questState.active[LEGALIZE_QUEST_ID].progress.ccq_completed, 0);
    assert.equal(createLegalizeState().activated, false);
  });

  it('the client wires the pack verb and the activation to these rules', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    assert.doesNotMatch(game, /There is no active application to attach this qualification to/);
    assert.match(game, /qualificationVerb\(\{ hasBadge: achieveState\.unlocked\.includes\(LEGALIZE_CARD_ID\) \}\)/);
    // Once the badge is held the pack still shows Activate, greyed with the reason.
    assert.match(game, /showDisabled: true,/);
    assert.match(game, /\(useInfo\.paradise \|\| useInfo\.buff \|\| useInfo\.showDisabled\) && !useInfo\.usable/);
    assert.match(game, /activateCardFromPack\(\{ questState, inv, achieveState, pc, now: Date\.now\(\) \}\)/);
    // Back where you came from only from inside the quest's instanced places.
    assert.match(game, /inInstance && \(update\.classTsid \|\| update\.def\?\.classTsid\) === LEGALIZE_QUEST_ID/);
    assert.match(game, /legalizeOnAccepted\(\{ questState, inv, achieveState, pc, now: Date\.now\(\) \}\)/);
  });
});
