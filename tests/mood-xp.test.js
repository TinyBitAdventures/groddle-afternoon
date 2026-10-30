import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  MOOD_XP_BANDS,
  MOOD_XP_SOURCES,
  NO_NO_POWDER_XP_FACTOR,
  PLEASANT_EQUILIBRIUM_FLOOR,
  grantMoodXp,
  moodPercent,
  moodScaledXp,
  moodXpMultiplier,
  moodXpMultiplierFor,
  setMoodXpEnv,
} from '../public/js/mood-xp.js?v=958e7680';
import { collectQuoin, createQuoinState } from '../public/js/quoins.js?v=d4f4772b';
import { applyVerbReward, getVerbReward } from '../public/js/verb-rewards.js?v=d3ce41d5';
import { applyDropResult } from '../public/js/drop-tables.js?v=0f922478';
import { quoteShrineDonation } from '../public/js/shrines.js?v=01b185bc';
import { applyRewards } from '../public/js/quests.js?v=282e1621';
import { bemoanSnoCone, eatSnoCone } from '../public/js/sno-cones.js?v=2d23307e';

const GSJS = join(import.meta.dirname, '../../glitch-GameServerJS');
const gsjs = (rel) => readFileSync(join(GSJS, rel), 'utf8');

afterEach(() => setMoodXpEnv());

describe('players/inc_stats.js mood bonus (G148)', () => {
  it('copies stats_get_xp_mood_bonus bands, the Pleasant Equilibrium floor and the No-No nerf', () => {
    const src = gsjs('players/inc_stats.js');
    const body = src.slice(src.indexOf('function stats_get_xp_mood_bonus'), src.indexOf('function stats_add_xp('));
    const bands = [...body.matchAll(/mood < (\d+)\)\{\s*return ([\d.]+);/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const last = Number(body.match(/else\{\s*return ([\d.]+);/)[1]);
    assert.deepEqual(MOOD_XP_BANDS.map((row) => [...row]), [...bands, [Infinity, last]]);
    assert.match(body, new RegExp(`mood < 50 && this\\.buffs_has\\('pleasant_equilibrium'\\)\\)\\{\\s*mood = ${PLEASANT_EQUILIBRIUM_FLOOR};`));
    const apply = src.slice(src.indexOf('function stats_xp_apply_bonus'), src.indexOf('function stats_get()'));
    assert.match(apply, /xp = Math\.round\(xp \* multiplier\);/);
    assert.match(apply, new RegExp(`buffs_has\\('no_no_powder'\\)\\)\\{\\s*xp = Math\\.round\\(xp \\* ${NO_NO_POWDER_XP_FACTOR}\\);`));
    // stats_add_xp skips the bonus for no_bonus callers and the dead.
    assert.match(src, /if \(!no_bonus && !this\.is_dead\)\{\s*xp = this\.stats_xp_apply_bonus\(xp\);/);
    // Pleasant Equilibrium is the Exotic Juice buff the remake applies.
    assert.match(gsjs('items/catalog_buffs.js'), /"pleasant_equilibrium" : \{\s*name\s*: "Pleasant Equilibrium"/);
  });

  it('pays x0 under 10%, x0.5, x0.75, x0.9, x1, x1.1 and x1.2 at 90% and up', () => {
    const at = (pct) => moodXpMultiplier(pct);
    assert.deepEqual([0, 9.99, 10, 19.9, 20, 49.9, 50, 69.9, 70, 79.9, 80, 89.9, 90, 100].map(at),
      [0, 0, 0.5, 0.5, 0.75, 0.75, 0.9, 0.9, 1, 1, 1.1, 1.1, 1.2, 1.2]);
  });

  it('reads mood against the tank (metabolics_get_percentage)', () => {
    assert.equal(moodPercent({ mood: 150, energyMax: 300 }), 50);
    assert.equal(moodXpMultiplierFor({ mood: 150, energyMax: 300 }), 0.9);
    assert.equal(moodPercent({ energy: 10 }), null);
    assert.equal(moodScaledXp({ xp: 0 }, 50), 50, 'a pc with no mood is not scaled');
  });

  it('Pleasant Equilibrium holds the multiplier at x0.75 and does nothing from 50% up', () => {
    assert.equal(moodXpMultiplier(3, { pleasantEquilibrium: true }), 0.75);
    assert.equal(moodXpMultiplier(15, { pleasantEquilibrium: true }), 0.75);
    assert.equal(moodXpMultiplier(60, { pleasantEquilibrium: true }), 0.9);
    assert.equal(moodXpMultiplier(95, { pleasantEquilibrium: true }), 1.2);
    assert.equal(moodScaledXp({ mood: 5, activeBuffs: ['pleasant_equilibrium'] }, 100), 75);
    assert.equal(moodScaledXp({ mood: 5 }, 100), 0);
  });

  it('No-No Powder keeps a fifth after the mood bonus, each step rounded', () => {
    assert.equal(moodScaledXp({ mood: 75, activeBuffs: ['no_no_powder'] }, 100), 20);
    assert.equal(moodScaledXp({ mood: 95, activeBuffs: ['no_no_powder'] }, 13), 3); // round(round(15.6) * 0.2)
  });

  it('the installed env decides buffs and death (stats_add_xp skips the dead)', () => {
    const pc = { mood: 5, activeBuffs: [] };
    setMoodXpEnv({ hasBuff: (id) => id === 'pleasant_equilibrium' });
    assert.equal(moodScaledXp(pc, 100), 75);
    setMoodXpEnv({ isDead: () => true });
    assert.equal(moodScaledXp(pc, 100), 100);
  });

  it('grantMoodXp adds the landed amount to iMG and lifetime XP', () => {
    const pc = { mood: 30, imagination: 10, xp: 1000 };
    assert.equal(grantMoodXp(pc, 50), 38);
    assert.deepEqual([pc.imagination, pc.xp], [48, 1038]);
    assert.equal(grantMoodXp({ mood: 5, imagination: 0, xp: 0 }, 50), 0);
  });
});

describe('which awards take the mood bonus (GSJS no_bonus flag)', () => {
  it('quests and badges pass no_bonus; jobs, quoins and skill packages do not', () => {
    const calls = (dir) => readdirSync(join(GSJS, dir)).filter((f) => f.endsWith('.js'))
      .flatMap((f) => [...gsjs(`${dir}/${f}`).matchAll(/stats_add_xp\(([^;]*)\);/g)].map((m) => m[1]));
    const quests = calls('quests');
    const questComplete = quests.filter((c) => c.includes("type: 'quest_complete'"));
    const jobs = quests.filter((c) => /type: 'job_complete/.test(c));
    assert.ok(questComplete.length > 150 && questComplete.every((c) => /, true, \{type: 'quest_complete'/.test(c)));
    assert.ok(jobs.length > 250 && jobs.every((c) => /, false, \{type: 'job_complete/.test(c)));
    const badges = calls('achievements');
    assert.ok(badges.length > 600 && badges.every((c) => /, true$/.test(c)));
    assert.match(gsjs('items/quoin.js'), /stats_add_xp\(amount, false, \{type: 'quoin'/);
    assert.match(gsjs('players/inc_skill_packages.js'), /actuals\['xp_bonus'\] = this\.stats_add_xp\(details\.xp_bonus, false, context\);/);
    assert.match(gsjs('items/include/food.js'), /stats_add_xp\(bonus, true, \{'verb':'eat'/);
    assert.match(gsjs('players/inc_eleven_secrets.js'), /stats_add_xp\(100, true\);\t\/\/ no adjustment for mood bonus/);
    assert.match(gsjs('items/include/shrines.js'), /Math\.round\(base_cost \* 0\.2 \* powder_bonus\) \* pc\.stats_get_xp_mood_bonus\(\)/);
    assert.ok(Object.keys(MOOD_XP_SOURCES.scaled).includes('job'));
    assert.ok(Object.keys(MOOD_XP_SOURCES.flat).includes('quest'));
  });

  it('a quoin at low mood lands less, the popup amount with it; Qurazy too', () => {
    const low = { mood: 15, imagination: 0, xp: 0, level: 1 };
    const out = collectQuoin(createQuoinState(), 'xp', low, { amount: 10 });
    assert.deepEqual([out.amount, out.actual, low.imagination, low.xp], [10, 5, 5, 5]);
    const glum = { mood: 5, imagination: 0, xp: 0, level: 1 };
    assert.equal(collectQuoin(createQuoinState(), 'qurazy', glum).actual, 0);
    const happy = { mood: 95, imagination: 0, xp: 0, level: 1 };
    assert.equal(collectQuoin(createQuoinState(), 'xp', happy, { amount: 10 }).actual, 12);
    const balanced = { mood: 15, imagination: 0, xp: 0, level: 1, activeBuffs: ['pleasant_equilibrium'] };
    assert.equal(collectQuoin(createQuoinState(), 'xp', balanced, { amount: 10 }).actual, 8);
  });

  it('skill-package verbs, drops and sno cones scale', () => {
    const pc = { energy: 50, mood: 40, imagination: 0, xp: 0 };
    const pet = applyVerbReward(pc, { ...getVerbReward('npc_piggy', 'pet'), xpGain: 8, moodGain: 0 });
    assert.equal(pet.xp, 6);
    const drop = applyDropResult({ items: [], favor: [], xp: 8 }, { pc: { mood: 15, imagination: 0, xp: 0 }, inv: {} });
    assert.deepEqual([drop.landed.xp, drop.lines[0]], [4, 'You got 4 iMG!']);
    const cone = { level: 20, mood: 15, imagination: 0, xp: 0 };
    assert.equal(eatSnoCone('sno_cone_blue', cone, { eatenToday: 0 }).xp, 19); // 37 x0.5
    assert.equal(bemoanSnoCone('sno_cone_blue', cone).xp, 10); // 19 x0.5
  });

  it('shrine donations fold the multiplier in before the daily cap', () => {
    const shrine = { favor: {}, dailyFavor: {}, emblems: {}, dailyXp: 0 };
    const inv = { plank: 100 };
    const flat = quoteShrineDonation(shrine, 'alph', inv, 'plank', 100, { xp: 100000 });
    const glum = quoteShrineDonation(shrine, 'alph', inv, 'plank', 100, { xp: 100000, moodMultiplier: 0.75 });
    assert.ok(flat.ok && glum.ok);
    assert.equal(glum.rawXp, Math.round(flat.rawXp * 0.75));
    const nono = quoteShrineDonation(shrine, 'alph', inv, 'plank', 100, { xp: 100000, moodMultiplier: 0.75, noNo: true });
    assert.equal(nono.rawXp, Math.round(Math.round(flat.rawXp * 0.75) * 0.2));
  });

  it('quest rewards stay flat at any mood (quest_complete passes no_bonus)', () => {
    const pc = { mood: 5, energy: 50, imagination: 0, xp: 0 };
    applyRewards(pc, { xp: 100 });
    assert.equal(pc.xp, 100);
  });
});

describe('every remake award path was routed through js/mood-xp.js', () => {
  const pub = join(import.meta.dirname, '../public');
  const read = (rel) => readFileSync(join(pub, rel), 'utf8');
  it('scaled paths call grantMoodXp (or moodScaledXp) and flat ones do not', () => {
    const scaled = [
      'js/quoins.js', 'js/verb-rewards.js', 'js/buffs.js', 'js/animal-husbandry.js', 'js/musicblocks.js',
      'js/sno-cones.js', 'js/making.js', 'js/trant-care.js', 'js/item-verbs.js', 'js/animal-kinship.js',
      'js/shrines.js', 'js/garden.js', 'js/heli-kitties.js', 'js/foxes.js', 'js/drop-tables.js', 'js/mining.js',
      'js/master-garden.js', 'js/resource-nodes.js', 'js/patches.js', 'js/quest-rooms/esquibeth.js',
      'js/features/meditation-feature.js', 'js/features/newxp-feature.js', 'js/features/smuggling-feature.js',
      'js/features/powders-feature.js', 'js/features/giant-icons-feature.js', 'js/features/craftybot-feature.js',
      'js/features/puzzle-scenes-feature.js', 'js/features/races-feature.js', 'js/features/crowns-feature.js',
      'js/features/animal-husbandry-feature.js', 'js/features/street-jobs-feature.js', 'js/features/rook-attack-feature.js',
      'content.js', 'game.js',
    ];
    for (const rel of scaled) assert.match(read(rel), /grantMoodXp|moodScaledXp/, rel);
    const flat = ['js/quests.js', 'js/cubimals.js', 'js/features/secret-spots-feature.js', 'js/features/seasons-feature.js'];
    for (const rel of flat) assert.doesNotMatch(read(rel), /mood-xp\.js/, rel);
    // One module instance: nobody imports mood-xp.js with a ?v= query.
    const game = read('game.js');
    assert.match(game, /from '\.\/js\/mood-xp\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /setMoodXpEnv\(\{/);
  });
});
