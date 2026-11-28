/**
 * Report #705: Tunes for Crabs completed, but the award card listed only "+300 iMG · +100 mood" and
 * the Vine Radio was nowhere (it never goes in the pack: owning it is the quest done, and it stands
 * on the home street only after Cultivate > Put out Vine Radio). Ours: Glitch had no ownable radio.
 *
 * 1. The award card lists the Vine Radio, with the radio's art, saying it waits in Cultivate.
 * 2. Turning in adds an Activity line saying where the radio waits.
 * 3. The quest log's reward chips name it too.
 * 4. Nothing goes in the pack, and the radio is not put out by itself.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CRAB_TUNES_COUNTER, RADIO_ART, RADIO_QUEST, RADIO_QUEST_ID, RADIO_QUEST_TUNES, radioOwned } from '../public/js/vine-radio.js?v=5436aa09';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=b0f96eae';
import { createQuestState, questUnlockNotices, questUnlockRows } from '../public/js/quests.js?v=4c8f3a10';
import { acceptOffer, routeQuestEvent, turnInQuest } from '../public/js/quest-offers.js?v=dfecc1b4';
import { rewardChips } from '../public/js/ui/moment-card.js?v=b383144f';
import { questRewardChips } from '../public/js/ui/quest-sheet.js?v=7409d5d8';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function finishRadioQuest() {
  const qs = createQuestState();
  const inv = {};
  acceptOffer(qs, RADIO_QUEST_ID, { level: 3 });
  for (let i = 0; i < RADIO_QUEST_TUNES; i += 1) routeQuestEvent(qs, CRAB_TUNES_COUNTER, 1, {});
  const pc = { xp: 0, mood: 10, energy: 10, currants: 0, giantFavor: {} };
  const done = turnInQuest(qs, RADIO_QUEST_ID, pc, { inv });
  return { qs, inv, done };
}

describe('#705 Tunes for Crabs names the Vine Radio it gives', () => {
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(ROOT, 'public/assets/content'));
  });

  it('1. the award card lists the Vine Radio with its art and where it waits', () => {
    const { qs, done } = finishRadioQuest();
    assert.equal(done.ok, true);
    assert.equal(radioOwned(qs), true);
    const row = done.award.rewards.find((r) => /vine radio/i.test(r.text));
    assert.ok(row, `award card lists the Vine Radio (got ${JSON.stringify(done.award.rewards.map((r) => r.text))})`);
    assert.equal(row.kind, 'unlock');
    assert.match(row.text, /Cultivate on your home street/);
    assert.ok(!/—/.test(row.text), 'no em dash');
    const chip = rewardChips(done.award.rewards).find((c) => c.kind === 'unlock');
    assert.equal(chip.icon, RADIO_ART.url, 'the chip shows the radio art');
    // iMG and mood keep their chips.
    assert.deepEqual(done.award.rewards.map((r) => r.kind), ['img', 'mood', 'unlock']);
  });

  it('2. turning in adds an Activity line saying where the radio waits', () => {
    const { done } = finishRadioQuest();
    assert.deepEqual(questUnlockNotices(done.rewards), ['Your Vine Radio is waiting in Cultivate on your home street.']);
    // The turn-ins that push "Quest complete" also push the unlock lines.
    for (const rel of ['public/js/features/quest-offers-feature.js', 'public/js/features/vendor-npcs-feature.js']) {
      assert.match(read(rel), /Quest complete: [^\n]*\n\s*for \(const line of questUnlockNotices\(done\.rewards\)\) engine\.pushActivity\(line\);/, rel);
    }
  });

  it('3. the quest log reward chips name it', () => {
    assert.deepEqual(questRewardChips(RADIO_QUEST.rewards), ['+300 iMG', '+100 mood', 'Vine Radio']);
  });

  it('4. nothing goes in the pack, and the radio is not put out by itself', () => {
    const { inv } = finishRadioQuest();
    assert.deepEqual(inv, {});
    assert.ok(!/radioOut|putOut/i.test(read('public/js/quests.js')), 'quest rewards never place the radio');
  });

  it('questUnlockRows takes one unlock or a list, and skips ones with no name', () => {
    assert.deepEqual(questUnlockRows({ label: 'Thing' }), [{ label: 'Thing', icon: '', text: 'Thing', notice: 'You got the Thing.' }]);
    assert.equal(questUnlockRows([{ label: 'A', where: 'B' }, { where: 'C' }]).length, 1);
    assert.deepEqual(questUnlockRows(undefined), []);
  });
});
