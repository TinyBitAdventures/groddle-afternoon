/**
 * G62: Better Learning I to V, the 2011 skills, back without the 2011 skill
 * limit (public/js/better-learning.js). Learn order, the quoted learn times,
 * the discounts and how they stack, the quests learning them offers, and the
 * street project work they gate.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSkillCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import {
  BETTER_LEARNING_BASE_SECONDS,
  BETTER_LEARNING_DISCOUNTS,
  BETTER_LEARNING_SKILL_IDS,
  betterLearningDiscount,
  betterLearningRank,
} from '../public/js/better-learning.js?v=044ff9ff';
import { canLearnSkill, createSkillState, grantSkill, startSkillStudy, tickSkillStudy } from '../public/js/skills.js?v=4542bdf9';
import { skillTimeFactor } from '../public/js/imagination-effects.js?v=70169933';
import { learnTimeReductions } from '../public/js/imagination.js?v=b4f0eaf6';
import { emblemUnlockSkillFor, skillRemakeNote, skillTitle, skillTreeEntry, spendEmblemForSkill } from '../public/js/skill-tree.js?v=cf7bc81f';
import { acceptOffer, pendingQuestOffers } from '../public/js/quest-offers.js?v=dbfa83c4';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import { normalizeStreetJobState, phaseRequirements, workCheck } from '../public/js/street-jobs.js?v=3c8a3e97';
import { skillArtFor } from '../public/js/familiar.js?v=2089ac54';
import { CARD_ART_LAYERS } from '../public/js/imagination-data.js?v=4a85e7fe';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

/** The time factor the imagination feature hands startSkillStudy, for a player under capacity. */
const ctxFor = (state, extra = {}) => ({
  ...extra,
  timeFactor: (def) => skillTimeFactor({
    count: state.learned.length,
    brainCapacity: 20,
    categoryId: def.categoryId,
    reductions: extra.reductions || {},
    discount: betterLearningDiscount(state.learned),
  }),
});

describe('G62 Better Learning in the skill catalog', () => {
  it('adds the five ranks after the mined skills, in order, Intellectual, Lem primary', () => {
    const catalog = getSkillCatalog();
    const ids = Object.keys(catalog);
    assert.deepEqual(ids.slice(-5), BETTER_LEARNING_SKILL_IDS);
    BETTER_LEARNING_SKILL_IDS.forEach((id, i) => {
      const def = catalog[id];
      assert.equal(def.level, i + 1);
      assert.equal(def.categoryId, 19);
      assert.deepEqual(def.giants, { lem: { primary: 1 } });
      assert.deepEqual(def.reqSkills, i ? [`betterlearning_${i}`] : []);
      assert.equal(skillTitle(def), `Better Learning ${['I', 'II', 'III', 'IV', 'V'][i]}`);
      assert.doesNotMatch(`${def.description} ${def.learned}`, /—/, 'no em-dashes in player copy');
    });
    assert.deepEqual(catalog.betterlearning_3.reqAchievements, ['emblem_skill_unlock_lem_1']);
    // inc_data_skills.js:3938-3940 skills_get_quest_map
    assert.equal(catalog.betterlearning_1.questId, 'betterlearning_get_favor_at_shrines');
    assert.equal(catalog.betterlearning_3.questId, 'betterlearning_spend_favor_with_primary_giant');
    assert.equal(catalog.betterlearning_5.questId, 'betterlearning_spend_huge_favor');
    assert.equal(skillRemakeNote('betterlearning_4').status, 'live');
  });

  it('keeps Teleportation III as the skill a Lem emblem names (emblem_lem.js getUnlockSkill)', () => {
    assert.equal(emblemUnlockSkillFor('lem').classTsid, 'teleportation_3');
  });

  it('is learned in order, and III needs an Emblem of Lem spent', () => {
    const state = createSkillState();
    assert.equal(canLearnSkill(state, 'betterlearning_1').ok, true);
    assert.deepEqual(
      { ok: canLearnSkill(state, 'betterlearning_2').ok, need: canLearnSkill(state, 'betterlearning_2').need },
      { ok: false, need: 'betterlearning_1' }
    );
    grantSkill(state, 'betterlearning_1');
    grantSkill(state, 'betterlearning_2');
    const noEmblem = canLearnSkill(state, 'betterlearning_3', { unlockedAchievements: [] });
    assert.equal(noEmblem.reason, 'req_achievement');
    assert.equal(noEmblem.need, 'emblem_skill_unlock_lem_1');
    const inv = { emblem_lem: 1 };
    const spent = spendEmblemForSkill(inv, [], 'betterlearning_3');
    assert.equal(spent.ok, true);
    assert.equal(inv.emblem_lem, undefined);
    assert.equal(canLearnSkill(state, 'betterlearning_3', { unlockedAchievements: [spent.achievement] }).ok, true);
    assert.equal(canLearnSkill(state, 'betterlearning_4').need, 'betterlearning_3');
  });
});

describe('G62 learn times and discounts', () => {
  it('ranks replace each other: 2, 5, 8, 12, 20% off, only for ranks held in a row', () => {
    assert.deepEqual(BETTER_LEARNING_DISCOUNTS, { 1: 0.02, 2: 0.05, 3: 0.08, 4: 0.12, 5: 0.2 });
    const learned = [];
    assert.equal(betterLearningDiscount(learned), 0);
    for (let n = 1; n <= 5; n += 1) {
      learned.push(`betterlearning_${n}`);
      assert.equal(betterLearningRank(learned), n);
      assert.equal(betterLearningDiscount(learned), BETTER_LEARNING_DISCOUNTS[n]);
    }
    assert.equal(betterLearningDiscount(['betterlearning_2', 'betterlearning_3']), 0, 'a gap holds no rank');
  });

  it('learning each rank after the one before takes a tenth of the 2011 time, the late game\'s 10x study rate (Austin 2026-10-27)', () => {
    // 2011 (Ziggyny 2011-10-05): 10 min, 176.4 min, 11.4 h, 33.12 h, 4.4 days; now a tenth of each
    const quoted = [600, 176.4 * 60, 11.4 * 3600, 33.12 * 3600, 4.4 * 86400].map((s) => Math.round(s / 10));
    const state = createSkillState();
    // Ten other skills known: well under the brain capacity of 20.
    for (const id of ['mining_1', 'refining_1', 'tinkering_1', 'ezcooking_1', 'gardening_1', 'animalkinship_1', 'soil_appreciation_1', 'light_green_thumb_1', 'meditativearts_1', 'teleportation_1']) grantSkill(state, id, true);
    const badges = ['emblem_skill_unlock_lem_1'];
    let now = 1_000_000;
    BETTER_LEARNING_SKILL_IDS.forEach((id, i) => {
      const run = startSkillStudy(state, id, ctxFor(state, { unlockedAchievements: badges }), now);
      assert.equal(run.ok, true, `${id} ${run.reason}`);
      assert.equal(run.durationSeconds, quoted[i], id);
      assert.equal(run.durationSeconds, Math.round((BETTER_LEARNING_BASE_SECONDS[i + 1] / 10) * (1 - (BETTER_LEARNING_DISCOUNTS[i] || 0))));
      now += run.durationSeconds * 1000;
      assert.deepEqual(tickSkillStudy(state, now).completed.map((row) => row.classTsid), [id]);
    });
  });

  it('cuts every later skill, in the panel too (skills_get_all total_time, inc_skills.js:273)', () => {
    const state = createSkillState();
    // One skill known (the very first study takes 15%, inc_skills.js:1796).
    grantSkill(state, 'mining_1', true);
    const base = getSkillCatalog().mining_4.pointCost / 10;
    assert.equal(skillTreeEntry(state, 'mining_4', ctxFor(state, { level: 99 })).seconds, base);
    for (const id of BETTER_LEARNING_SKILL_IDS) grantSkill(state, id, true);
    // Six known, so under capacity: only the 20% cut.
    assert.equal(skillTreeEntry(state, 'mining_4', ctxFor(state, { level: 99 })).seconds, Math.round(base * 0.8));
    // No time factor in the context: the catalog time, as before.
    assert.equal(skillTreeEntry(state, 'mining_4', { level: 99 }).seconds, base);
  });

  it('multiplies with the Learning Speed cards and the brain capacity modifier', () => {
    const reductions = learnTimeReductions(['learntime_wellness_5']);
    assert.equal(reductions[19], 20);
    const intellectual = skillTimeFactor({ count: 10, brainCapacity: 20, categoryId: 19, reductions, discount: 0.2 });
    assert.ok(Math.abs(intellectual - 0.64) < 1e-12, String(intellectual));
    const otherCategory = skillTimeFactor({ count: 10, brainCapacity: 20, categoryId: 11, reductions, discount: 0.2 });
    assert.ok(Math.abs(otherCategory - 0.8) < 1e-12, String(otherCategory));
    const overCapacity = skillTimeFactor({ count: 22, brainCapacity: 20, categoryId: 11, reductions: {}, discount: 0.12 });
    assert.ok(Math.abs(overCapacity - 1.05 ** 2 * 0.88) < 1e-12, String(overCapacity));
    assert.equal(skillTimeFactor({ count: 10, brainCapacity: 20 }), 1, 'no discount, no change');
  });

  it('is wired into the study time factor the imagination feature answers', () => {
    const src = readFileSync(join(pub, 'js/features/imagination-feature.js'), 'utf8');
    assert.match(src, /discount: betterLearningDiscount\(learned\)/);
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /timeFactor: \(def\) => features\.query\('skillTimeFactor', def, engine\)/);
  });

  it('shows the Brain Capacity card art, as no Better Learning art survives', () => {
    assert.equal(CARD_ART_LAYERS.includes('art_skill_betterlearning'), false);
    assert.equal(skillArtFor('betterlearning_3', CARD_ART_LAYERS), 'assets/imagination/cards/art_brain.svg');
  });
});

describe('G62 Better Learning quests and street work', () => {
  const offered = (state, skills) => pendingQuestOffers(state, null, { skills, level: 30 })
    .map((row) => row.classTsid)
    .filter((id) => id.startsWith('betterlearning_'));

  it('learning I, III and V offers their quests (players/inc_quests.js:974-980)', () => {
    const state = createQuestState();
    assert.deepEqual(offered(state, []), []);
    assert.deepEqual(offered(state, ['betterlearning_1']), ['betterlearning_get_favor_at_shrines']);
    assert.deepEqual(offered(state, ['betterlearning_1', 'betterlearning_2']), ['betterlearning_get_favor_at_shrines']);
    assert.deepEqual(
      offered(state, ['betterlearning_1', 'betterlearning_2', 'betterlearning_3']).sort(),
      ['betterlearning_get_favor_at_shrines', 'betterlearning_spend_favor_with_primary_giant']
    );
    const all = offered(state, BETTER_LEARNING_SKILL_IDS);
    assert.ok(all.includes('betterlearning_spend_huge_favor'));
  });

  it('the favor series follows Spreading the Love', () => {
    const state = createQuestState();
    assert.equal(acceptOffer(state, 'betterlearning_get_favor_at_shrines', {}).ok, true);
    state.completed.push('betterlearning_get_favor_at_shrines');
    delete state.active.betterlearning_get_favor_at_shrines;
    assert.deepEqual(
      offered(state, ['betterlearning_1']).sort(),
      ['betterlearning_collect_favor_points', 'betterlearning_donate_to_shrines', 'betterlearning_get_giant_emblem']
    );
  });

  it('the street work that asks for Better Learning III or V can be done by a player who learned it', () => {
    const jobs = JSON.parse(readFileSync(join(pub, 'assets/content/street-jobs.json'), 'utf8'));
    const gated = {
      job_street_ph1_03: 'betterlearning_5',
      job_street_ph3_08: 'betterlearning_3',
      job_street_ph4_06: 'betterlearning_5',
      job_street_ph4_06b: 'betterlearning_5',
    };
    for (const [cls, skill] of Object.entries(gated)) {
      const def = jobs.classes[cls];
      const req = def.requirements.find((r) => r.skill === skill);
      assert.ok(req, `${cls} asks for ${skill}`);
      assert.deepEqual(def.blockers, [], `${cls} has no item blockers`);
      // A street job that uses the phase, its earlier groups already done.
      const [jobId, job] = Object.entries(jobs.jobs).find(([, j]) => j.kind === 'street' && j.phases.some((p) => p.classTsid === cls));
      const phase = job.phases.findIndex((p) => p.classTsid === cls);
      const state = normalizeStreetJobState({ jobs: { [jobId]: { phase } } });
      const got = {};
      for (const r of phaseRequirements(state, jobs, jobId)) {
        if (r.bucket === req.bucket && r.group < req.group) got[r.id] = r.need;
      }
      state.jobs[jobId].got = got;
      const ctx = (learned) => ({ inv: { [req.classId]: 1 }, energy: 100, learned });
      const without = workCheck(state, jobs, jobId, req.id, ctx([]));
      assert.equal(without.ok, false, `${cls} without the skill`);
      assert.equal(without.canHire, true);
      assert.match(without.msg, /skill/);
      assert.equal(workCheck(state, jobs, jobId, req.id, ctx([skill])).ok, true, `${cls} with ${skill}`);
    }
    // The group hall phase stays multiplayer (a group claims the hall).
    const hall = jobs.halls.classes.job_group_ph4_06;
    assert.match(hall.excluded, /group hall/);
    assert.ok(hall.requirements.some((r) => r.skill === 'betterlearning_5'));
  });
});
