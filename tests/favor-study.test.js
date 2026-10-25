/**
 * G53: spending Giant favor (shrine Learn Faster?) and emblems with nothing
 * left to unlock to speed up skill study.
 * Sources: players/inc_skills.js get_skill_info:1852-1886 and
 * skills_get_max_acceleration:924-941; items/include/shrines.js
 * check_favor/spend_points:21-75; items/emblem_*.js spend verb + doSpend;
 * client ShrineDialog.as / EmblemSpendDialog.as / StringUtil.formatTime.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';
import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js';
import {
  createSkillState,
  getStudyStatus,
  grantSkill,
  maxStudyAcceleration,
  startSkillStudy,
  accelerateActiveStudy,
} from '../public/js/skills.js';
import {
  EMBLEM_SPEND_FAVOR,
  FAVOR_SPENT_EVENTS,
  FAVOR_SPEND_COPY,
  FAVOR_STUDY_SECONDS,
  createShrineState,
  emblemRelationNote,
  favorRelationNote,
  formatSpeedUpTime,
  giantRelationFor,
  quoteEmblemSpend,
  quoteFavorSpend,
  skillSpeedInfo,
  spendEmblemOnStudy,
  spendFavorOnStudy,
} from '../public/js/shrines.js';
import { emblemUnlockSkillFor } from '../public/js/skill-tree.js';
import { studyGiantsLine } from '../public/js/skills-panel.js';
import { EMITTED_EVENTS, routeQuestEvent, acceptOffer, requirementRoute } from '../public/js/quest-offers.js';
import { createQuestState } from '../public/js/quests.js';
import { getQuestCatalog } from '../public/js/content-catalogs.js';
import { normalizeShrineState } from '../public/js/shrines.js?v=spinning-wheel-test-2';

const root = join(import.meta.dirname, '..', 'public');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

/** animalkinship_2: Humbaba primary; Friendly and Mab secondary. `remaining` seconds left at t=0. */
function studying(remaining = 600) {
  const state = createSkillState();
  grantSkill(state, 'animalkinship_1', true);
  startSkillStudy(state, 'animalkinship_2', { level: 99 }, 0);
  state.queue.animalkinship_2.endsAt = remaining * 1000;
  return state;
}

describe('get_skill_info rates and caps', () => {
  it('buys 10 / 7 / 5 seconds a point by the Giant\'s place on the skill', () => {
    assert.deepEqual({ ...FAVOR_STUDY_SECONDS }, { p: 10, s: 7, u: 5 });
    const def = { giants: { humbaba: { primary: 1 }, mab: { primary: 0 } } };
    assert.equal(giantRelationFor(def, 'humbaba'), 'p');
    assert.equal(giantRelationFor(def, 'mab'), 's');
    assert.equal(giantRelationFor(def, 'lem'), 'u');
    assert.equal(skillSpeedInfo(def, 'humbaba', 20, 10_000).speedUp, 200);
    assert.equal(skillSpeedInfo(def, 'mab', 20, 10_000).speedUp, 140);
    assert.equal(skillSpeedInfo(def, 'lem', 20, 10_000).speedUp, 100);
  });

  it('never spends more favor than the half-remaining cap can use', () => {
    const def = { giants: { mab: { primary: 0 } } };
    const info = skillSpeedInfo(def, 'mab', 100, 300);
    assert.equal(info.rawSpendPoints, 300 / 7);
    assert.equal(info.spendPoints, 42, 'the client shows (and the server takes) whole points');
    assert.equal(info.speedUp, 300);
  });

  it('caps at half the remaining time, like time quoins', () => {
    const skills = studying(600);
    assert.equal(maxStudyAcceleration(skills, 0), 300);
    accelerateActiveStudy(skills, 100, 0);
    // Accelerated: the gap between the new end (500 s) and the acceleration end (100 s), halved.
    assert.equal(maxStudyAcceleration(skills, 0), 200);
    accelerateActiveStudy(skills, 1000, 0);
    assert.equal(maxStudyAcceleration(skills, 0), 0);
  });
});

describe('spending favor at a shrine (spend_points)', () => {
  it('speeds the study up, removes the favor and leaves the daily cap alone', () => {
    const skills = studying(600);
    const shrine = createShrineState({ favor: { mab: 30 }, dailyFavor: { mab: 30 } });
    const quote = quoteFavorSpend(shrine, 'mab', skills, { now: 0 });
    assert.equal(quote.ok, true);
    assert.equal(quote.giantRel, 's');
    assert.equal(quote.spendPoints, 30);
    assert.equal(quote.speedUp, 210);
    const result = spendFavorOnStudy(shrine, 'mab', skills, { now: 0 });
    assert.equal(result.applied, 210);
    assert.equal(shrine.favor.mab, 0);
    assert.equal(shrine.dailyFavor.mab, 30);
    assert.equal(getStudyStatus(skills, 'animalkinship_2', 0).remainingSeconds, 390);
    assert.equal(getStudyStatus(skills, 'animalkinship_2', 0).isAccelerated, true);
    assert.deepEqual(result.events, []);
  });

  it('keeps the favor the cap could not use', () => {
    const skills = studying(600);
    const shrine = createShrineState({ favor: { lem: 500 } });
    const result = spendFavorOnStudy(shrine, 'lem', skills, { now: 0 });
    assert.equal(result.giantRel, 'u');
    assert.equal(result.spent, 60);
    assert.equal(result.applied, 300);
    assert.equal(shrine.favor.lem, 440);
    const again = quoteFavorSpend(shrine, 'lem', skills, { now: 0 });
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'max_acceleration');
    assert.equal(again.text, "You're already learning as fast as you can!");
  });

  it('Yellow Crumb lengthens the speed-up x1.05 (still under the cap)', () => {
    const skills = studying(600);
    const shrine = createShrineState({ favor: { humbaba: 20 } });
    assert.equal(quoteFavorSpend(shrine, 'humbaba', skills, { now: 0 }).speedUp, 200);
    const result = spendFavorOnStudy(shrine, 'humbaba', skills, { now: 0, yellowCrumb: true });
    assert.equal(result.speedUp, 210);
    assert.equal(result.applied, 210);
    assert.equal(result.spent, 20);
  });

  it('gives the client\'s states when nothing can be spent', () => {
    const idle = createSkillState();
    const shrine = createShrineState({ favor: { mab: 50 } });
    const notLearning = quoteFavorSpend(shrine, 'mab', idle, { now: 0 });
    assert.equal(notLearning.reason, 'not_learning');
    assert.equal(notLearning.text, 'If you were learning a new skill, you could use your favor points to learn it faster.');
    const empty = quoteFavorSpend(createShrineState(), 'mab', studying(), { now: 0 });
    assert.equal(empty.reason, 'no_favor');
    assert.match(empty.text, /^No favor points\?! Did you know that the giants will help you learn faster/);
    assert.equal(spendFavorOnStudy(shrine, 'mab', idle, { now: 0 }).ok, false);
    assert.equal(shrine.favor.mab, 50);
  });

  it('sets primary_giant_spend_mad_favor at 997+ with the primary Giant only', () => {
    const shrine = createShrineState({ favor: { humbaba: 997, mab: 999 } });
    assert.deepEqual(spendFavorOnStudy(shrine, 'mab', studying(100_000), { now: 0 }).events, []);
    const result = spendFavorOnStudy(shrine, 'humbaba', studying(100_000), { now: 0 });
    assert.deepEqual(result.events, [FAVOR_SPENT_EVENTS.primaryLarge]);
    assert.equal(result.spent, 997);
    assert.equal(result.applied, 9970);
  });

  it('sets spend_enormous_favor at 1,511+ with any Giant, from the favor held', () => {
    const shrine = createShrineState({ favor: { lem: 1511, humbaba: 1600 }, emblems: { lem: 6, humbaba: 6 } });
    // The flags test the favor held, as the source does, even when the cap spends less.
    const small = spendFavorOnStudy(shrine, 'lem', studying(600), { now: 0 });
    assert.deepEqual(small.events, [FAVOR_SPENT_EVENTS.huge]);
    assert.equal(small.spent, 60);
    const both = spendFavorOnStudy(shrine, 'humbaba', studying(100_000), { now: 0 });
    assert.deepEqual(both.events, [FAVOR_SPENT_EVENTS.primaryLarge, FAVOR_SPENT_EVENTS.huge]);
  });

  it('persists through the shrine save normalizer', () => {
    const shrine = createShrineState({ favor: { mab: 30 } });
    spendFavorOnStudy(shrine, 'mab', studying(), { now: 0 });
    assert.equal(normalizeShrineState(JSON.parse(JSON.stringify(shrine))).favor.mab, 0);
  });
});

describe('spending an emblem (emblem_base spend)', () => {
  it('first unlocks the Giant\'s skill', () => {
    assert.equal(emblemUnlockSkillFor('humbaba').classTsid, 'animalkinship_6');
    assert.equal(emblemUnlockSkillFor('zille').classTsid, 'mining_3');
    const quote = quoteEmblemSpend('humbaba', studying(), { now: 0, unlockedAchievements: [] });
    assert.equal(quote.mode, 'unlock');
    assert.equal(quote.giant.name, 'Humbaba');
    const inv = { emblem_humbaba: 1 };
    assert.equal(spendEmblemOnStudy(inv, 'humbaba', studying(), { now: 0 }).ok, false);
    assert.equal(inv.emblem_humbaba, 1);
  });

  it('with nothing left to unlock, spends as 1,000 favor and is destroyed', () => {
    assert.equal(EMBLEM_SPEND_FAVOR, 1000);
    const skills = studying(100_000);
    const inv = { emblem_mab: 2 };
    const opts = { now: 0, unlockedAchievements: ['emblem_skill_unlock_mab_1'] };
    const quote = quoteEmblemSpend('mab', skills, opts);
    assert.equal(quote.ok, true);
    assert.equal(quote.speedUp, 7000);
    assert.equal(quote.isPrimary, false);
    assert.equal(quote.isSecondary, true);
    const result = spendEmblemOnStudy(inv, 'mab', skills, opts);
    assert.equal(result.applied, 7000);
    assert.equal(inv.emblem_mab, 1);
    assert.equal(getStudyStatus(skills, 'animalkinship_2', 0).remainingSeconds, 93_000);
  });

  it('is capped, takes Yellow Crumb, and refuses when maxed or idle', () => {
    const skills = studying(600);
    const opts = { now: 0, unlockedAchievements: ['emblem_skill_unlock_humbaba_1'] };
    assert.equal(quoteEmblemSpend('humbaba', skills, opts).speedUp, 300);
    const crumb = quoteEmblemSpend('humbaba', studying(100_000), { ...opts, yellowCrumb: true });
    assert.equal(crumb.speedUp, 10_500);
    const inv = { emblem_humbaba: 2 };
    assert.equal(spendEmblemOnStudy(inv, 'humbaba', skills, opts).applied, 300);
    const maxed = quoteEmblemSpend('humbaba', skills, opts);
    assert.equal(maxed.ok, false);
    assert.equal(maxed.text, "Your learning is already accelerated to the max. More emblems won't help!");
    const idle = quoteEmblemSpend('humbaba', createSkillState(), opts);
    assert.equal(idle.text, 'You are not learning a skill.');
    assert.equal(spendEmblemOnStudy({}, 'humbaba', studying(), opts).reason, 'no_emblem');
  });

  it('never sets a Better Learning flag', () => {
    const result = spendEmblemOnStudy({ emblem_humbaba: 1 }, 'humbaba', studying(100_000), {
      now: 0,
      unlockedAchievements: ['emblem_skill_unlock_humbaba_1'],
    });
    assert.equal(result.events, undefined);
  });
});

describe('source copy', () => {
  it('matches the client dialogs', () => {
    assert.equal(FAVOR_SPEND_COPY.title, 'Learn Faster?');
    assert.equal(FAVOR_SPEND_COPY.confirm, 'Are you sure you want to spend those favor points?');
    assert.equal(FAVOR_SPEND_COPY.spent, "You've done it! You spent that favor!");
    assert.equal(favorRelationNote('Humbaba', 'p'), 'Humbaba is the best giant for learning this skill!');
    assert.equal(favorRelationNote('Mab', 's'), 'Mab is the secondary giant for learning this skill.');
    assert.equal(favorRelationNote('Lem', 'u'), "Lem is not associated with this skill, but he'll help you learn it anyway.");
    assert.equal(favorRelationNote('Tii', 'u'), "Tii is not associated with this skill, but they'll help you learn it anyway.");
    assert.equal(favorRelationNote('Zille', 'u'), "Zille is not associated with this skill, but she'll help you learn it anyway.");
    assert.match(emblemRelationNote('Mab', 's'), /^Mab is affiliated with this skill \(but not as closely as another giant\)/);
  });

  it('formats speed-ups like StringUtil.formatTime', () => {
    assert.equal(formatSpeedUpTime(300), '5 mins');
    assert.equal(formatSpeedUpTime(61), '1 min 1 sec');
    assert.equal(formatSpeedUpTime(9970), '2 hours 46 mins 10 secs');
    assert.equal(formatSpeedUpTime(90_000), '1 day 1 hour');
  });

  it('names the study\'s Giants in the Skills panel', () => {
    const line = studyGiantsLine({ giants: { friendly: { primary: 0 }, humbaba: { primary: 1 }, mab: { primary: 0 } } }, {
      giantName: (id) => id[0].toUpperCase() + id.slice(1),
    });
    assert.equal(line, 'Primary Giant: Humbaba · also Friendly, Mab. Spend favor at a shrine to learn faster.');
  });
});

describe('Better Learning quests', () => {
  it('route the two spend events to their flags and complete', () => {
    for (const event of Object.values(FAVOR_SPENT_EVENTS)) {
      assert.ok(EMITTED_EVENTS.some((row) => row.event === event), `${event} is listed as emitted`);
    }
    const catalog = getQuestCatalog();
    const mad = catalog.betterlearning_spend_favor_with_primary_giant.requirements[0];
    const huge = catalog.betterlearning_spend_huge_favor.requirements[0];
    assert.equal(mad.name, 'primary_giant_spend_mad_favor');
    assert.equal(huge.name, 'spend_enormous_favor');
    assert.equal(requirementRoute(mad).emitted, true);
    assert.equal(requirementRoute(huge).emitted, true);

    const state = createQuestState();
    acceptOffer(state, 'betterlearning_spend_favor_with_primary_giant', {});
    acceptOffer(state, 'betterlearning_spend_huge_favor', {});
    const first = routeQuestEvent(state, FAVOR_SPENT_EVENTS.primaryLarge, 1);
    assert.deepEqual(first.completable.map((row) => row.classTsid ?? row), ['betterlearning_spend_favor_with_primary_giant']);
    const second = routeQuestEvent(state, FAVOR_SPENT_EVENTS.huge, 1);
    assert.deepEqual(second.completable.map((row) => row.classTsid ?? row), ['betterlearning_spend_huge_favor']);
  });
});
