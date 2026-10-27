/**
 * G124 buffs (js/buff-triggers.js, js/features/buff-triggers-feature.js,
 * js/buffs.js): each buff whose GameServerJS trigger the remake has is
 * applied by that trigger, does its catalog_buffs.js effect, and ends.
 * Run: node --test tests/buff-triggers.test.js
 */
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUFF_ICONS,
  CONSUME_BUFFS,
  QUEST_TIMER_BUFFS,
  coldPlaceMessage,
  consumeBuffFor,
  flamingGrinderFreeCrushes,
  freeBatchEnergyCost,
  gandleveryMunchButton,
  isNekkid,
  questTimerBuffs,
  smallEnlightenmentSeconds,
  smeltItDealtItFreeSmelts,
} from '../public/js/buff-triggers.js?v=g370-1';
import { MIRRORED_BUFFS, buffTriggersFeature } from '../public/js/features/buff-triggers-feature.js';
import { meditationFeature } from '../public/js/features/meditation-feature.js?v=radiate-8';
import { teleportationFeature } from '../public/js/features/teleportation-feature.js?v=teleport-13';
import { rookAttackFeature } from '../public/js/features/rook-attack-feature.js?v=g334-1';
import { rubeFeature } from '../public/js/features/rube-feature.js?v=rube-12';
import { smugglingFeature } from '../public/js/features/smuggling-feature.js?v=card-18';
import { normalizeHusbandryPack } from '../public/js/animal-husbandry.js';
import {
  activateBuffItem,
  applyBuff,
  buffPhysics,
  createBuffState,
  hasBuff,
  removeBuff,
  tickBuffs,
} from '../public/js/buffs.js?v=g370-1';
import { getSkillPackageOverride, skillPackageDetails } from '../public/js/skill-packages.js';
import { miningProfile } from '../public/js/mining.js?v=g330-1';
import { resolveAnimalKinshipPackage } from '../public/js/animal-kinship.js?v=g296-1';
import { makingSkillAdjustments } from '../public/js/making.js?v=g300-2';
import { sessionPackage } from '../public/js/meditation.js';
import { accelerateActiveStudy, createSkillState, startSkillStudy } from '../public/js/skills.js';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../public');
const T0 = 1_800_000_000_000;

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

/**
 * The parts of game.js's engine the feature touches, over a real buff
 * state; buff events reach the feature the way handleBuffEvents sends them.
 */
function makeEngine(over = {}) {
  const state = createBuffState();
  const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100, imagination: 0, xp: 0, imaginationUpgrades: [] };
  const log = { activity: [], toasts: [], sounds: [], achievements: [], accel: [] };
  const send = (events) => {
    for (const e of events) buffTriggersFeature.onEvent(`buff_${e.type}:${e.classTsid}`, 1, engine);
  };
  const engine = {
    started: true,
    inv: {},
    pc,
    player: { x: 100, y: 100, vx: 0, facing: 'right' },
    streetTsid: 'GA5101HF7F429V5',
    learnedSkills: [],
    questState: { active: {}, completed: [] },
    hasBuff: (id) => hasBuff(state, id, Date.now()),
    applyBuff(id, { durationSec = 0 } = {}) {
      const res = applyBuff(state, id, pc, Date.now());
      if (res.ok && durationSec > 0) res.buff.expiresAt = res.buff.appliedAt + durationSec * 1000;
      if (res.ok) send([{ type: 'activated', classTsid: id }]);
      return res;
    },
    removeBuff: (id) => removeBuff(state, id, pc, Date.now()),
    buffRow: (id) => (hasBuff(state, id, Date.now()) ? state.active[id] : null),
    pushActivity: (m) => log.activity.push(typeof m === 'string' ? m : m.base),
    toast: (m) => log.toasts.push(m),
    playSound: (k) => log.sounds.push(k),
    achievement: (counter, amount = 1) => log.achievements.push(`${counter}:${amount}`),
    accelerateStudy: (s, o) => log.accel.push([s, o?.ignoreMax === true]),
    metabolicGate: () => ({ ok: true }),
    setData() {},
    param: () => null,
    refreshPack() {},
    updateHud() {},
    save() {},
    busy: () => false,
    ...over,
  };
  /** Advance the clock and run the buff ticks the way game.js's loop does. */
  engine.advance = (ms) => {
    mock.timers.tick(ms);
    send(tickBuffs(state, pc, Date.now()));
  };
  // onTick syncs at most every 250 ms of its own clock.
  let syncAt = 0;
  engine.sync = () => buffTriggersFeature.onTick(16, (syncAt += 1000), engine);
  engine.state = state;
  engine.log = log;
  return engine;
}

beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: T0 });
  buffTriggersFeature._reset();
});

after(() => {
  mock.timers.reset();
  buffTriggersFeature._reset();
});

/* ------------------------------------------------------------------ */

describe('drinks and foods apply their buff (catalog_buffs.js numbers)', () => {
  /** [event, buff, seconds, tick seconds, per-tick { energy, mood, xp }] */
  const TICKERS = [
    ['coffee:drink', 'caffeine_buzz', 50, 10, { mood: 2 }],
    ['mabbish_coffee:drink', 'caffeine_buzz', 50, 10, { mood: 2 }],
    ['carrot_margarita:drink', 'carrot_zing', 12, 4, { mood: 7, energy: 7 }],
    ['tooberry_shake:drink', 'emberried_hiccups', 50, 10, { mood: 5, energy: 5 }],
    ['cloudberry_daiquiri:drink', 'floating_on_a_cloud', 75, 5, { mood: 3, xp: 1 }],
    ['cloud_11_smoothie:drink', 'sky_cruisin', 80, 10, { mood: 5 }],
    ['slow_gin_fizz:drink', 'slow_gin', 100, 10, { mood: 5 }],
    ['cosmapolitan:drink', 'sophisticated_feeling', 180, 60, { mood: 20 }],
    ['apple:eat', 'well_fed_energy', 30, 30, { energy: 5 }],
  ];
  for (const [event, buff, seconds, tickSec, per] of TICKERS) {
    it(`${event} -> ${buff}: one tick, then it ends at ${seconds} s`, () => {
      const engine = makeEngine();
      engine.pc.mood = 10;
      engine.pc.energy = 10;
      buffTriggersFeature.onEvent(event, 1, engine);
      assert.ok(engine.hasBuff(buff), 'applied');
      engine.advance(tickSec * 1000);
      assert.equal(engine.pc.mood, 10 + (per.mood || 0), 'mood per tick');
      assert.equal(engine.pc.energy, 10 + (per.energy || 0), 'energy per tick');
      assert.equal(engine.pc.imagination, per.xp || 0, 'iMG per tick');
      engine.advance((seconds - tickSec) * 1000 + 1);
      assert.equal(engine.hasBuff(buff), false, 'expired');
    });
  }

  it('every consume row names a catalog buff and an item that eats or drinks', () => {
    const items = JSON.parse(readFileSync(join(root, 'assets/content/making-items.json'), 'utf8'));
    const all = items.items || items;
    const buffs = JSON.parse(readFileSync(join(root, 'assets/content/buffs.json'), 'utf8'));
    for (const row of CONSUME_BUFFS) {
      const [cls, verb] = row.event.split(':');
      assert.ok(buffs[row.buff], row.buff);
      assert.equal(String(all[cls]?.use?.verb || '').toLowerCase(), verb, row.event);
      assert.equal(consumeBuffFor(row.event), row);
    }
  });

  it('drinking again restarts the buff (inc_buffs.js:136)', () => {
    const engine = makeEngine();
    buffTriggersFeature.onEvent('coffee:drink', 1, engine);
    engine.advance(30_000);
    buffTriggersFeature.onEvent('coffee:drink', 1, engine);
    assert.equal(engine.buffRow('caffeine_buzz').expiresAt, Date.now() + 50_000);
  });

  it('Savoring Experience adds 5% of the current mood every 10 s', () => {
    const engine = makeEngine();
    engine.pc.mood = 60;
    buffTriggersFeature.onEvent('savory_smoothie:drink', 1, engine);
    engine.advance(10_000);
    assert.equal(engine.pc.mood, 63);
    engine.advance(70_001);
    assert.equal(engine.hasBuff('savoring_experience'), false);
  });

  it('Hooch: Smashed a minute at a time, then Hungover, then its +10/+10 on removal', () => {
    const engine = makeEngine();
    engine.pc.mood = 20;
    engine.pc.energy = 50;
    buffTriggersFeature.onEvent('hooch:drink', 1, engine);
    engine.advance(60_000);
    assert.equal(engine.pc.mood, 23);
    assert.equal(engine.pc.energy, 47);
    assert.ok(engine.log.activity.includes('You feel completely smashed.'));
    engine.advance(180_000);
    assert.equal(engine.hasBuff('buff_smashed'), false);
    assert.ok(engine.hasBuff('buff_hungover'), 'on_remove applies Hungover');
    assert.ok(engine.log.activity.includes("You don't feel as smashed anymore."));
    const moodBefore = engine.pc.mood;
    engine.advance(60_000);
    assert.equal(engine.pc.mood, moodBefore - 2);
    // +3 iMG under 50% mood: x0.75 rounds to 2 (G148, stats_xp_apply_bonus).
    assert.equal(engine.pc.imagination, 2);
    engine.advance(240_000);
    assert.equal(engine.hasBuff('buff_hungover'), false);
    assert.ok(engine.log.activity.includes('That hangover is gone! You feel so much better.'));
  });

  it('Garlic Breath: +3 mood a minute, +5 iMG when it fades; a second garlic only warns', () => {
    const engine = makeEngine();
    engine.pc.mood = 10;
    buffTriggersFeature.onEvent('garlic:eat', 1, engine);
    buffTriggersFeature.onEvent('garlic:eat', 1, engine);
    assert.ok(engine.log.activity.some((m) => /garlicky breath/.test(m)));
    engine.advance(60_000);
    assert.equal(engine.pc.mood, 13);
    engine.advance(240_001);
    assert.equal(engine.hasBuff('buff_garlic_breath'), false);
    // +5 iMG under 50% mood: x0.75 rounds to 4 (G148).
    assert.equal(engine.pc.imagination, 4);
    assert.ok(engine.log.activity.includes('You no longer have the taste of garlic in your mouth.'));
  });

  it('Moonwalk: slower and floatier for 11 s, MOONWALK plays', () => {
    const engine = makeEngine();
    buffTriggersFeature.onEvent('pumpkin_ale:drink', 1, engine);
    const p = buffPhysics(engine.state, Date.now());
    assert.equal(p.speed, 0.7);
    assert.equal(p.gravity, 0.5);
    assert.deepEqual(engine.log.sounds, ['MOONWALK']);
    engine.advance(11_001);
    assert.equal(engine.hasBuff('moonwalk'), false);
  });

  it('Pleasant Equilibrium runs 5 minutes (exotic juice)', () => {
    const engine = makeEngine();
    buffTriggersFeature.onEvent('exotic_juice:drink', 1, engine);
    assert.equal(engine.buffRow('pleasant_equilibrium').expiresAt - Date.now(), 300_000);
  });
});

describe('Small Enlightenment (pungent_sunrise.js:121-128)', () => {
  it('speeds the study 90 s ignoring the half cap; again while running adds 90 minus what was left', () => {
    const engine = makeEngine();
    buffTriggersFeature.onEvent('pungent_sunrise:drink', 1, engine);
    engine.advance(30_000);
    buffTriggersFeature.onEvent('pungent_sunrise:drink', 1, engine);
    assert.deepEqual(engine.log.accel, [[90, true], [30, true]]);
    assert.equal(smallEnlightenmentSeconds(0), 90);
    assert.equal(smallEnlightenmentSeconds(95), 90);
  });

  it('accelerateActiveStudy ignoreMax caps at the time left, not half of it', () => {
    const state = createSkillState({ learned: [] });
    const started = startSkillStudy(state, 'mining_1', { level: 60 }, Date.now());
    assert.ok(started.ok, started.reason);
    const capped = accelerateActiveStudy(state, 100_000, Date.now());
    const s2 = createSkillState({ learned: [] });
    startSkillStudy(s2, 'mining_1', { level: 60 }, Date.now());
    const free = accelerateActiveStudy(s2, 100_000, Date.now(), { ignoreMax: true });
    assert.ok(free.applied > capped.applied);
  });
});

describe('package overrides', () => {
  it('Impervious Miner: mining costs no energy while it runs, then the override goes', () => {
    const engine = makeEngine();
    const before = miningProfile(['mining_1']).energy;
    assert.ok(before > 0);
    buffTriggersFeature.onEvent('earthshaker:drink', 1, engine);
    assert.equal(miningProfile(['mining_1']).energy, 0);
    assert.equal(miningProfile(['mining_1'], 'fancy_pick').energy, 0);
    engine.advance(180_001);
    engine.sync();
    assert.equal(miningProfile(['mining_1']).energy, before);
  });

  it('Easy Animalia: the five animal verbs are free; singing is not in the list', () => {
    const engine = makeEngine();
    const before = resolveAnimalKinshipPackage('npc_piggy', 'nibble', []).energyCost;
    assert.ok(before > 0);
    buffTriggersFeature.onEvent('gurly_drink:drink', 1, engine);
    for (const [cls, verb] of [['npc_piggy', 'pet'], ['npc_piggy', 'nibble'], ['npc_chicken', 'squeeze'], ['npc_butterfly', 'massage'], ['npc_butterfly', 'milk']]) {
      assert.equal(resolveAnimalKinshipPackage(cls, verb, []).energyCost, 0, `${cls}:${verb}`);
    }
    engine.advance(300_001);
    engine.sync();
    assert.equal(resolveAnimalKinshipPackage('npc_piggy', 'nibble', []).energyCost, before);
  });

  it('Overrides come back from the running buff after a reload', () => {
    const engine = makeEngine();
    buffTriggersFeature.onEvent('earthshaker:drink', 1, engine);
    buffTriggersFeature._reset();
    assert.equal(getSkillPackageOverride('mining'), null);
    applyBuff(engine.state, 'impervious_miner', engine.pc, Date.now());
    engine.sync();
    assert.equal(miningProfile(['mining_1']).energy, 0);
  });

  it('Bubble-Enhanced Meditation doubles the session bonus for 2 minutes', () => {
    const engine = makeEngine({ learnedSkills: ['meditativearts_1'] });
    const before = sessionPackage('standing', ['meditativearts_1']).bonusAmount;
    buffTriggersFeature.onEvent('bubble_tea:drink', 1, engine);
    assert.equal(sessionPackage('standing', ['meditativearts_1']).bonusAmount, before * 2);
    engine.advance(120_001);
    engine.sync();
    assert.equal(sessionPackage('standing', ['meditativearts_1']).bonusAmount, before);
  });

  it('Flaming Grinder: free crushes from the time left (ore_grinder.js:454-475)', () => {
    assert.equal(flamingGrinderFreeCrushes(1), 5);
    assert.equal(flamingGrinderFreeCrushes(2), 10);
    assert.equal(flamingGrinderFreeCrushes(30), 290);
    assert.equal(flamingGrinderFreeCrushes(10, ['refining_time_1']), 10 + 16 * 10);
    const engine = makeEngine({ learnedSkills: ['refining_1'] });
    const recipe = JSON.parse(readFileSync(join(root, 'assets/content/recipes.json'), 'utf8'));
    const crush = (recipe.recipes || recipe).crush_beryl;
    const cost = makingSkillAdjustments(crush, ['refining_1']).energyCost;
    assert.ok(cost > 0);
    buffTriggersFeature.onEvent('flaming_humbaba:drink', 1, engine);
    engine.advance(29_000);
    // 1 s left: 5 free of a 10-crush batch.
    buffTriggersFeature.onEvent('making_batch:ore_grinder', 10, engine);
    assert.equal(makingSkillAdjustments(crush, ['refining_1']).energyCost, freeBatchEnergyCost(10, 5, cost));
    engine.advance(1_001);
    engine.sync();
    assert.equal(makingSkillAdjustments(crush, ['refining_1']).energyCost, cost);
  });

  it('Smelt It, Dealt It: free ingots, over the Green Smelt cards too (smelter.js:446-478)', () => {
    assert.equal(smeltItDealtItFreeSmelts(5), 1);
    assert.equal(smeltItDealtItFreeSmelts(10), 4);
    assert.equal(smeltItDealtItFreeSmelts(30), 54);
    const engine = makeEngine({ learnedSkills: ['smelting_1'] });
    const recipes = JSON.parse(readFileSync(join(root, 'assets/content/recipes.json'), 'utf8'));
    const smelt = (recipes.recipes || recipes).plain_metal;
    buffTriggersFeature.onEvent('face_smelter:drink', 1, engine);
    buffTriggersFeature.onEvent('making_batch:smelter', 20, engine);
    assert.equal(makingSkillAdjustments(smelt, ['smelting_1']).energyCost, 0);
    assert.equal(makingSkillAdjustments(smelt, ['smelting_1'], ['smelting_energy_1', 'smelting_energy_2']).energyCost, 0);
    engine.advance(30_001);
    engine.sync();
    assert.ok(makingSkillAdjustments(smelt, ['smelting_1']).energyCost > 0);
  });
});

describe('essences and herbs', () => {
  it('Essence of Gandlevery: -10 mood +30 energy now and every 15 s for 2 minutes', () => {
    const state = createBuffState();
    const pc = { energy: 10, mood: 90, energyMax: 300, moodMax: 100 };
    const inv = { essence_of_gandlevery: 1 };
    const r = activateBuffItem(state, inv, pc, 'essence_of_gandlevery', Date.now());
    assert.ok(r.ok);
    assert.match(r.msgs[0], /Gandlevery stomach/);
    assert.equal(pc.energy, 40);
    assert.equal(pc.mood, 80);
    tickBuffs(state, pc, Date.now() + 15_000);
    assert.equal(pc.energy, 70);
    assert.equal(pc.mood, 70);
    tickBuffs(state, pc, Date.now() + 120_001);
    assert.equal(hasBuff(state, 'gandlevery_charge', Date.now() + 120_001), false);
  });

  it('Essence of Silvertongue: Gift of Gab ends Silvertongue and pays 20% more', () => {
    const state = createBuffState();
    const pc = { energy: 50, mood: 50 };
    applyBuff(state, 'silvertongue', pc, Date.now());
    const r = activateBuffItem(state, { essence_of_silvertongue: 1 }, pc, 'essence_of_silvertongue', Date.now());
    assert.ok(r.ok);
    assert.equal(hasBuff(state, 'silvertongue'), false);
    assert.equal(pc.rewardMultiplier, 1.2);
  });

  it('Gandlevery Munch: needs 5 mood, -5 mood now, +3 energy every 15 s', () => {
    const engine = makeEngine();
    engine.inv.gandlevery = 2;
    engine.pc.mood = 4;
    assert.equal(buffTriggersFeature.packVerbs('gandlevery', engine)[0].enabled, false);
    assert.equal(gandleveryMunchButton({ mood: 4 }).reason, 'Loss of appetite is a common side-effect of depression.');
    engine.pc.mood = 40;
    engine.pc.energy = 10;
    assert.equal(buffTriggersFeature.runPackVerb('gandlevery', 'munch', engine), true);
    assert.equal(engine.inv.gandlevery, 1);
    assert.equal(engine.pc.mood, 35);
    assert.ok(engine.log.achievements.includes('gandlevery:munch:1'));
    assert.equal(buffTriggersFeature.packVerbs('gandlevery', engine)[0].reason, 'The effects of eating too much of this herb could be serious!');
    engine.advance(15_000);
    assert.equal(engine.pc.energy, 13);
    engine.advance(105_001);
    assert.equal(engine.hasBuff('gandlevery'), false);
  });
});

describe('Kukubee winter (location.js:335)', () => {
  it('A Cold Place on the winter street: -1 energy a second, the 5th-tick hint, gone elsewhere', () => {
    const engine = makeEngine({ streetTsid: 'GM11E7ODKHO1QJE' });
    engine.pc.energy = 50;
    buffTriggersFeature.onStreetEnter({}, engine);
    assert.ok(engine.hasBuff('kukubee_winter_negative'));
    for (let i = 0; i < 5; i += 1) engine.advance(1000);
    assert.equal(engine.pc.energy, 45);
    assert.equal(engine.log.activity.filter((m) => /hearty/.test(m)).length, 1);
    assert.equal(coldPlaceMessage(10), coldPlaceMessage(5), 'the 10th-tick line never shows (source typo)');
    engine.streetTsid = 'GA5101HF7F429V5';
    buffTriggersFeature.onStreetEnter({}, engine);
    assert.equal(engine.hasBuff('kukubee_winter_negative'), false);
  });

  it('A Hearty Feeling ends the cold for a minute, then it comes back on that street', () => {
    const engine = makeEngine({ streetTsid: 'GM11E7ODKHO1QJE' });
    buffTriggersFeature.onStreetEnter({}, engine);
    buffTriggersFeature.onEvent('hearty_omelet:eat', 1, engine);
    assert.equal(engine.hasBuff('kukubee_winter_negative'), false);
    assert.ok(engine.hasBuff('kukubee_winter_positive'));
    engine.advance(60_001);
    assert.ok(engine.hasBuff('kukubee_winter_negative'));
  });
});

describe('systems with their own timer show the source buff', () => {
  it('Meditation: Levitating, then Meditation Cooldown, each with the system end time', () => {
    const engine = makeEngine();
    const t = Date.now();
    meditationFeature.restore({ levitateUntil: t + 5000, cooldownUntil: t + 25_000 });
    engine.sync();
    assert.equal(engine.buffRow('levitation_by_meditation').expiresAt, t + 5000);
    assert.equal(engine.hasBuff('meditation_cooldown'), false);
    mock.timers.tick(6000);
    meditationFeature.restore({ levitateUntil: 0, cooldownUntil: t + 25_000 });
    engine.sync();
    assert.equal(engine.hasBuff('levitation_by_meditation'), false);
    assert.equal(engine.buffRow('meditation_cooldown').expiresAt, t + 25_000);
    meditationFeature.restore({ cooldownUntil: 0 });
    engine.sync();
    assert.equal(engine.hasBuff('meditation_cooldown'), false);
  });

  it('Teleportation Cooldown, Rook Armor, Rube Lure, Piggy Capture Cooldown', () => {
    const engine = makeEngine();
    const t = Date.now();
    teleportationFeature.restore({ cooldownUntil: t + 4000 });
    rookAttackFeature.restore({ armorUntil: t + 300_000 });
    rubeFeature.restore({ lureActive: true });
    normalizeHusbandryPack({ captureCooldownUntil: t + 600_000 });
    engine.sync();
    assert.equal(engine.buffRow('teleportation_cooldown').expiresAt, t + 4000);
    assert.equal(engine.buffRow('rook_armor').expiresAt, t + 300_000);
    assert.equal(engine.buffRow('rube_lure').expiresAt, null);
    assert.equal(engine.buffRow('piggy_capture_cooldown').expiresAt, t + 600_000);
    teleportationFeature.restore({});
    rookAttackFeature.restore({});
    rubeFeature.restore({});
    normalizeHusbandryPack({});
    engine.sync();
    for (const id of ['teleportation_cooldown', 'rook_armor', 'rube_lure', 'piggy_capture_cooldown']) assert.equal(engine.hasBuff(id), false, id);
  });

  it("Don't Get Caught! while a run carries the package; Hog-Tied Escape Alert while a piggy is tied up", () => {
    const engine = makeEngine();
    smugglingFeature._state().state.run = { from: 'x' };
    engine.inv.contraband = 1;
    engine.inv.hogtied_piggy = 1;
    engine.sync();
    assert.ok(engine.hasBuff('dont_get_caught'));
    assert.ok(engine.hasBuff('hog_tie'));
    engine.inv.contraband = 0;
    engine.inv.hogtied_piggy = 0;
    engine.sync();
    assert.equal(engine.hasBuff('dont_get_caught'), false);
    assert.equal(engine.hasBuff('hog_tie'), false);
    smugglingFeature._state().state.run = null;
  });

  it('Timed quests: the timer buff ends with the quest timer', () => {
    const engine = makeEngine();
    const t = Date.now();
    engine.questState.offers = { timers: { mining_mine_in_time_period: { startedAt: t, endsAt: t + 300_000 } } };
    engine.sync();
    assert.equal(engine.buffRow('mining_mine_in_time_period').expiresAt, t + 300_000);
    engine.questState.offers.timers = {};
    engine.sync();
    assert.equal(engine.hasBuff('mining_mine_in_time_period'), false);
    assert.deepEqual(questTimerBuffs({ zero_mood: { endsAt: t + 1 } }, t), {}, 'multiplayer timers are not in the table');
  });

  it('the quest timer table matches quests.json for every solo or multiplayer quest', async () => {
    const quests = JSON.parse(readFileSync(join(root, 'assets/content/quests.json'), 'utf8'));
    const all = quests.quests || quests;
    // Player verbs: Blocks That Rock is offered in multiplayer (js/quests-mp.js), so its timer buff runs there.
    const { MULTIPLAYER_QUESTS } = await import('../public/js/quests-mp.js');
    const solo = Object.entries(all).filter(([id, q]) => q.timer?.buff && (q.solo || MULTIPLAYER_QUESTS[id])).map(([id, q]) => `${id}>${q.timer.buff}`).sort();
    assert.deepEqual(QUEST_TIMER_BUFFS.map((r) => `${r.quest}>${r.buff}`).sort(), solo);
  });

  it('Nekkid! with no coat, shirt, pants, dress or skirt', () => {
    const outfit = { coat: 'none', shirt: 'none', pants: 'none', dress: 'none', skirt: 'none', hat: 'tophat' };
    assert.equal(isNekkid((t) => outfit[t] || 'none'), true);
    outfit.pants = 'jeans';
    assert.equal(isNekkid((t) => outfit[t] || 'none'), false);
    const engine = makeEngine({ wornArticle: () => 'none' });
    engine.sync();
    assert.ok(engine.hasBuff('nekkid'));
  });
});

describe('wiring', () => {
  it('the feature imports the same module tags index.js registers', () => {
    const index = readFileSync(join(root, 'js/features/index.js'), 'utf8');
    const src = readFileSync(join(root, 'js/features/buff-triggers-feature.js'), 'utf8');
    for (const m of src.matchAll(/from '\.\/([a-z-]+-feature\.js\?v=[^']+)'/g)) {
      assert.ok(index.includes(`'./${m[1]}'`), m[1]);
    }
    assert.match(index, /buff-triggers-feature\.js\?v=radiate-12'; FEATURES\.push\(buffTriggersFeature\)/);
  });

  it('game.js applies Stuffed at the daily limit and announces each making batch', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /foodResult\.fullness\?\.stuffed\) engine\.applyBuff\('stuffed'/);
    assert.match(game, /features\.event\(`making_batch:\$\{recipe\.tool\}`, n, engine\)/);
    assert.match(game, /accelerateStudy\(seconds, \{ ignoreMax = false \} = \{\}\)/);
    assert.match(game, /const moon = hasBuff\(buffState, 'moonwalk', Date\.now\(\)\) \? -1 : 1;/);
  });

  it("the Gwendolyn room's heat is the It's So Hot! buff", () => {
    const src = readFileSync(join(root, 'js/quest-rooms/gwendolyn.js'), 'utf8');
    assert.match(src, /function heatBuff\(ctx, id\)/);
    assert.match(src, /onLeave\(ctx, outcome\) \{\n    stopMusic\(ctx\);\n    clearScreen\(\);\n    heatBuff\(ctx, null\);/);
  });

  it('every buff this lane applies has a tray icon (its item_class iconic, else BUFF_ICONS)', () => {
    const buffs = JSON.parse(readFileSync(join(root, 'assets/content/buffs.json'), 'utf8'));
    const ids = new Set([
      ...CONSUME_BUFFS.map((r) => r.buff),
      ...QUEST_TIMER_BUFFS.map((r) => r.buff),
      ...MIRRORED_BUFFS,
      'gandlevery', 'gandlevery_charge', 'gift_of_gab', 'buff_hungover', 'kukubee_winter_negative', 'stuffed', 'its_so_hot', 'its_so_hot2',
    ]);
    for (const id of ids) {
      const icon = BUFF_ICONS[id] || buffs[id].itemClass;
      if (!icon) continue; // item_class null: the tray's generic icon
      assert.ok(existsSync(join(root, 'assets/sprites/icons', `${icon}.png`)), `${id}: ${icon}`);
    }
  });

  it('the tray icon swap reaches a running timer buff', () => {
    const engine = makeEngine();
    engine.questState.offers = { timers: { animalkinship_nibble_meat: { startedAt: Date.now(), endsAt: Date.now() + 60_000 } } };
    engine.sync();
    assert.equal(engine.buffRow('get_a_rasher').sourceItem, 'meat');
  });

  it('skill package overrides are written last, like getSkillPackageDetails', () => {
    const base = skillPackageDetails('mining', ['mining_1']);
    assert.equal(getSkillPackageOverride('mining'), null);
    assert.ok(base.energy_cost > 0);
  });
});
