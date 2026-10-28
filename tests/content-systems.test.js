/**
 * Mined GSJS content catalogs + runners.
 * Run: node --test tests/content-systems.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadContentCatalogsFromDir,
  getQuestCatalog,
  getAchievementCatalog,
  getSkillCatalog,
  getBuffCatalog,
  getContentMeta,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js?v=g403-1';
import {
  createQuestState,
  assignQuest,
  applyQuestProgress,
  getQuestProgress,
  listQuestLog,
  listQuests,
} from '../public/js/quests.js';
import {
  createAchievementState,
  applyAchievementProgress,
  unlockAchievement,
  listAchievementLog,
  browseAchievementLog,
  achievementCategories,
  getAchievementProgress,
} from '../public/js/achievements.js?v=g403-1';
import {
  createSkillState,
  canLearnSkill,
  startSkillStudy,
  tickSkillStudy,
  accelerateActiveStudy,
  getStudyStatus,
  grantSkill,
  listSkills,
  hasSkill,
} from '../public/js/skills.js';
import {
  createBuffState,
  applyBuff,
  removeBuff,
  listActiveBuffs,
  hasBuff,
  listBuffCatalog,
} from '../public/js/buffs.js?v=g403-1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(__dirname, '../public/assets/content');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

describe('mined catalogs from GSJS', () => {
  it('catalog files exist and match meta counts', () => {
    for (const f of ['quests.json', 'achievements.json', 'skills.json', 'buffs.json', 'meta.json']) {
      assert.ok(existsSync(join(CONTENT, f)), f);
    }
    const meta = getContentMeta();
    assert.ok(meta?.counts);
    assert.equal(Object.keys(getQuestCatalog()).length, meta.counts.quests.output);
    assert.equal(Object.keys(getAchievementCatalog()).length, meta.counts.achievements.output);
    // Better Learning I to V are added to the mined skills (better-learning.js, G62).
    assert.equal(Object.values(getSkillCatalog()).filter((s) => !s.remake).length, meta.counts.skills.output);
    assert.equal(Object.keys(getBuffCatalog()).length, meta.counts.buffs.output);
  });

  it('includes known sample ids from extractability report', () => {
    assert.ok(getQuestCatalog().animalkinship_pet_piggies);
    assert.match(getQuestCatalog().animalkinship_pet_piggies.title, /Porcine/i);
    assert.ok(getAchievementCatalog().able_chopper);
    assert.match(getAchievementCatalog().able_chopper.name, /Able Chopper/i);
    assert.ok(getSkillCatalog().alchemy_1);
    assert.ok(getSkillCatalog().animalkinship_1);
    assert.ok(getBuffCatalog().gift_of_gab);
    assert.match(getBuffCatalog().gift_of_gab.name, /Gift of Gab/i);
  });

  it('catalog sizes are near full GSJS extract', () => {
    assert.ok(Object.keys(getQuestCatalog()).length >= 400);
    assert.ok(Object.keys(getAchievementCatalog()).length >= 600);
    assert.ok(Object.keys(getSkillCatalog()).length >= 90);
    assert.ok(Object.keys(getBuffCatalog()).length >= 100);
  });
});

describe('quest runner on mined catalog', () => {
  it('assign → progress → complete applies rewards', () => {
    const state = createQuestState();
    const pc = { energy: 50, mood: 50, imagination: 0, currants: 0, xp: 0 };
    const r = assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    assert.equal(r.ok, true);
    for (let i = 0; i < 6; i++) {
      applyQuestProgress(state, 'pet_piggy', 1, pc);
    }
    assert.ok(state.completed.includes('animalkinship_pet_piggies'));
    assert.ok(pc.currants >= 50);
    assert.ok(pc.imagination >= 200 || pc.xp >= 200);
    const p = getQuestProgress(state, 'animalkinship_pet_piggies');
    assert.equal(p.completed, true);
    const log = listQuestLog(state);
    assert.ok(log.some((row) => row.def.classTsid === 'animalkinship_pet_piggies'));
  });

  it('listQuests returns large catalog', () => {
    assert.ok(listQuests().length >= 400);
  });
});

describe('achievement runner on mined catalog', () => {
  it('progress unlocks able_chopper and grants rewards', () => {
    const state = createAchievementState();
    const pc = { energy: 50, mood: 50, imagination: 0, currants: 0, xp: 0 };
    const def = getAchievementCatalog().able_chopper;
    assert.ok(def.conditions?.length);
    const need = def.conditions[0].num;
    const name = def.conditions[0].name;
    for (let i = 0; i < need; i++) {
      applyAchievementProgress(state, name, 1, pc);
    }
    assert.ok(state.unlocked.includes('able_chopper'));
    assert.ok((pc.xp || 0) + (pc.imagination || 0) >= 50);
    const log = listAchievementLog(state, 20);
    assert.ok(log.some((r) => r.unlocked && r.def.classTsid === 'able_chopper'));
  });

  it('unlockAchievement is listable', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, currants: 0 };
    unlockAchievement(state, 'able_chopper', pc);
    assert.equal(getAchievementProgress(state, 'able_chopper').unlocked, true);
  });

  it('aggregates named events into GSJS group-sum achievements', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, currants: 0 };
    applyAchievementProgress(state, 'shrines_donated:spriggan', 1049, pc);
    assert.ok(state.unlocked.includes('shriner_fortyniner'));
  });

  it('keeps namespaced Giant counters isolated across achievement groups', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, currants: 0 };
    applyAchievementProgress(state, 'shrines_donated:spriggan', 1, pc);
    assert.equal(state.progress.first_spriggan_emblem, undefined);
    assert.equal(state.unlocked.includes('first_spriggan_emblem'), false);

    applyAchievementProgress(state, 'emblems_acquired:spriggan', 1, pc);
    assert.ok(state.unlocked.includes('first_spriggan_emblem'));
  });

  it('browses all 663 badges by status, category, and human-readable search', () => {
    const state = createAchievementState();
    state.unlocked.push('able_chopper');
    state.progress.collection_musicblocks_dg = {
      progress: { musicblock_d_green_01: 1 },
    };
    const all = browseAchievementLog(state);
    assert.equal(all.length, Object.keys(getAchievementCatalog()).length);
    assert.equal(all[0].status, 'unlocked');
    assert.ok(
      browseAchievementLog(state, { status: 'progress' })
        .every((row) => row.status === 'progress')
    );
    assert.ok(
      browseAchievementLog(state, { category: 'cooking' })
        .every((row) => row.def.category === 'cooking')
    );
    assert.equal(
      browseAchievementLog(state, { query: 'Musicblock DG' })[0]?.def.classTsid,
      'collection_musicblocks_dg'
    );
    assert.ok(achievementCategories().includes('player ability'));
  });

  it('does not reveal locked secret badge names through search', () => {
    const state = createAchievementState();
    assert.equal(
      browseAchievementLog(state, { query: 'Hypersupermagic Clareangel' }).length,
      0
    );
    const secrets = browseAchievementLog(state, { query: 'secret achievement' });
    assert.ok(secrets.length >= 20);
    assert.ok(secrets.every((row) => row.redacted));
    state.unlocked.push('ascended_level101');
    const revealed = browseAchievementLog(state, { query: 'Hypersupermagic Clareangel' });
    assert.equal(revealed.length, 1);
    assert.equal(revealed[0].redacted, false);
    assert.equal(revealed[0].status, 'unlocked');
  });
});

describe('skills + buffs on mined catalogs', () => {
  it('lists skills with prereqs; learn fails then succeeds', () => {
    const skills = listSkills();
    assert.ok(skills.length >= 90);
    const alchemy2 = getSkillCatalog().alchemy_2;
    assert.ok(alchemy2.reqSkills.includes('alchemy_1'));

    const state = createSkillState();
    const pc = { imagination: 100000, level: 20 };
    const fail = startSkillStudy(state, 'alchemy_2', { level: pc.level }, 1000);
    assert.equal(fail.ok, false);
    assert.equal(fail.reason, 'req_skill');

    grantSkill(state, 'alchemy_1', true);
    if (alchemy2.reqSkills.includes('smelting_1')) {
      grantSkill(state, 'smelting_1', true);
    }
    const ctx = {
      completedQuests: alchemy2.reqQuests || [],
      unlockedAchievements: alchemy2.reqAchievements || [],
    };
    const ok = startSkillStudy(state, 'alchemy_2', { ...ctx, level: pc.level }, 1000);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(hasSkill(state, 'alchemy_2'), false);
    assert.equal(pc.imagination, 100000, 'point_cost is study work, not spendable iMG');
    const completed = tickSkillStudy(state, 1000 + ok.durationSeconds * 1000);
    assert.equal(completed.completed[0].classTsid, 'alchemy_2');
    assert.ok(hasSkill(state, 'alchemy_2'));
  });

  it('canLearnSkill blocks without prereq', () => {
    const state = createSkillState();
    const check = canLearnSkill(state, 'alchemy_2', { level: 99 });
    assert.equal(check.ok, false);
  });

  it('uses time quoins to accelerate active study without spending iMG', () => {
    const state = createSkillState();
    const def = getSkillCatalog().animalkinship_1;
    const started = startSkillStudy(state, 'animalkinship_1', { level: 99 }, 1000);
    assert.equal(started.ok, true);
    const before = getStudyStatus(state, def.classTsid, 1000).remainingSeconds;
    const result = accelerateActiveStudy(state, 5, 1000);
    assert.equal(result.ok, true);
    assert.equal(result.applied, 5);
    assert.equal(getStudyStatus(state, def.classTsid, 1000).remainingSeconds, before - 5);
  });

  it('apply/list/remove buff from catalog', () => {
    assert.ok(listBuffCatalog().length >= 100);
    const state = createBuffState();
    const pc = { rewardMultiplier: 1 };
    const r = applyBuff(state, 'gift_of_gab', pc);
    assert.equal(r.ok, true);
    assert.ok(hasBuff(state, 'gift_of_gab'));
    assert.ok(listActiveBuffs(state).some((b) => b.classTsid === 'gift_of_gab'));
    assert.equal(pc.rewardMultiplier, 1.2);
    removeBuff(state, 'gift_of_gab', pc);
    assert.equal(hasBuff(state, 'gift_of_gab'), false);
    assert.equal(pc.rewardMultiplier, 1);
  });
});

describe('client wiring artifacts', () => {
  it('index.html has panels and buttons for all four systems', () => {
    const html = readFileSync(join(__dirname, '../public/play/index.html'), 'utf8');
    for (const id of [
      'quest-panel',
      'achieve-panel',
      'skills-panel',
      'buffs-panel',
      'quest-btn',
      'achieve-btn',
      'skills-btn',
      'buffs-btn',
    ]) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('loadContentCatalogs'));
    assert.ok(game.includes('openAchievePanel'));
    assert.ok(game.includes('openSkillsPanel'));
    assert.ok(game.includes('openBuffsPanel'));
    assert.ok(game.includes('assignQuest'));
    assert.ok(game.includes('startSkillStudy'));
    assert.ok(game.includes('activateBuffItem'));
  });
});
