/**
 * G979 (Austin 2026-11-17): Buy a Bag starts with the first skill (learn_first_skill.js 74-76:
 * startQuest('buy_bag', false, true) when the first-skill quest completes; its learn_skill flag is
 * set when a skill starts training, inc_skills.js 893), not as a level 2 offer.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { createQuestState, assignQuest } from '../public/js/quests.js?v=f68437db';
import { FIRST_SKILL_QUEST_ID, claimFirstSkillQuest, markOffered, declineOffer, pendingQuestOffers, questStatus } from '../public/js/quest-offers.js?v=7e00498b';
import { GATE_DEVIATIONS, SPECIAL_TRIGGERS, STAND_INS } from '../tools/quest-gates/table.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'public/assets/content');

describe('G979: Buy a Bag starts with the first skill', () => {
  before(async () => { await loadContentCatalogsFromDir(CONTENT); });

  it('no skill yet: nothing; the first skill started or learned: once', () => {
    const qs = createQuestState();
    assert.equal(FIRST_SKILL_QUEST_ID, 'buy_bag');
    assert.equal(claimFirstSkillQuest(qs, { skills: 0, learning: false }), false);
    assert.equal(qs.story.gates?.firstSkill, undefined, 'nothing recorded before a skill');
    assert.equal(claimFirstSkillQuest(qs, { skills: 0, learning: true }), true, 'a study under way counts (onAccepted 68-71)');
    assert.equal(qs.story.gates.firstSkill, true);
    assert.equal(claimFirstSkillQuest(qs, { skills: 2 }), false, 'never twice');
    const fresh = createQuestState();
    assert.equal(claimFirstSkillQuest(fresh, { skills: 1 }), true, 'a save past it gets it on load');
  });

  it('a player who already had it is left as is, and it is not started later', () => {
    for (const had of ['active', 'done', 'offered', 'declined']) {
      const qs = createQuestState();
      if (had === 'active') assignQuest(qs, 'buy_bag', { ignorePrereq: true });
      if (had === 'done') qs.completed.push('buy_bag');
      if (had === 'offered') markOffered(qs, 'buy_bag', 1);
      if (had === 'declined') { markOffered(qs, 'buy_bag', 1); declineOffer(qs, 'buy_bag'); }
      const before = questStatus(qs, 'buy_bag');
      assert.equal(claimFirstSkillQuest(qs, { skills: 3 }), false, had);
      assert.equal(questStatus(qs, 'buy_bag'), before, had);
      assert.equal(qs.story.gates.firstSkill, true, had);
    }
  });

  it('the familiar no longer offers it at level 2', () => {
    const qs = createQuestState();
    const ids = pendingQuestOffers(qs, { energy: 50, mood: 50, xp: 0, giantFavor: {} }, { level: 2, skills: ['alchemy_1'] }).map((r) => r.classTsid);
    assert.ok(!ids.includes('buy_bag'));
  });

  it('the gate table: buy_bag is a start trigger with Austin\'s ruling; Build a Tower and Join the Club reminisce kept', () => {
    assert.equal(STAND_INS.buy_bag, undefined);
    assert.deepEqual(SPECIAL_TRIGGERS.buy_bag.triggers, [{ type: 'event', event: 'first_skill', start: true }]);
    assert.match(GATE_DEVIATIONS.buy_bag.ruling, /^Austin 2026-11-17 G979/);
    assert.equal(GATE_DEVIATIONS.build_a_tower.ruling, 'Austin 2026-11-17 G979: keep');
    assert.equal(GATE_DEVIATIONS.join_club_reminisce.ruling, 'Austin 2026-11-17 G979: keep');
  });

  it('game.js starts it on the first skill started, on a skill learned and on load', () => {
    const src = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const fn = src.slice(src.indexOf('function startFirstSkillQuest()'), src.indexOf('function startFirstSkillQuest()') + 900);
    assert.match(fn, /claimFirstSkillQuest\(questState, \{ skills: skillsLearnedCount\(\), learning \}\)/);
    assert.match(fn, /acceptOffer\(questState, FIRST_SKILL_QUEST_ID, /);
    const completions = src.slice(src.indexOf('function handleSkillCompletions('), src.indexOf('function updateSkillChrome('));
    assert.match(completions, /startFirstSkillQuest\(\);/);
    const study = src.slice(src.indexOf('function runSkillStudyAction('), src.indexOf('function confirmAcceleratedStudyPause('));
    assert.match(study, /result\.reason === 'started'[\s\S]*startFirstSkillQuest\(\);/);
  });
});
