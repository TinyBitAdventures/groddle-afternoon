/** G279: chicken butter up and butterfly sing to, as GSJS has them. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUTTER_UP,
  SING_TO,
  BUTTERFLY_WISDOM,
  butterUpVerbState,
  butterUpChicken,
  singToVerbState,
  singToButterfly,
  singReward,
  singLifeFor,
  wisdomPool,
} from '../public/js/animal-flattery.js';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import { getVerbsFor, runVerb } from '../public/content.js?v=g412-1';
import { getGameDayKey } from '../public/js/game-day.js';

const here = dirname(fileURLToPath(import.meta.url));
const gs = (p) => readFileSync(join(here, '../../glitch-GameServerJS', p), 'utf8');
const chickenSrc = gs('items/npc_chicken.js');
const butterflySrc = gs('items/npc_butterfly.js');
const BADGE = ['butterfly_whisperer'];
const DAY = 'd1';

afterEach(() => setMetabolicGainGate(null));

describe('the copy is verbatim from GSJS', () => {
  it('butter up (npc_chicken.js 163-236)', () => {
    for (const text of [BUTTER_UP.tooltip, BUTTER_UP.incubatingReason, BUTTER_UP.bubble]) {
      assert.ok(chickenSrc.includes(`"${text}"`), text);
    }
    assert.match(chickenSrc, /pc\.metabolics_lose_energy\(4\);\s*var mood = pc\.metabolics_add_mood\(10\);\s*var img = pc\.stats_add_xp\(4\);/);
    assert.match(chickenSrc, /this\.sendBubble\("That's the nicest thing I've ever heard! Thank you!", 2\*1000, pc, slugs\);/);
    assert.match(chickenSrc, /buildVerbMessage\(msg\.count, 'butter up', 'buttered up'/);
    // No once-a-day rule in the source's conditions.
    const verb = chickenSrc.slice(chickenSrc.indexOf('verbs.butter_up'), chickenSrc.indexOf('verbs.give_cubimal'));
    assert.doesNotMatch(verb, /SkillPackage|today/i);
  });

  it('sing to (npc_butterfly.js 543-693)', () => {
    for (const text of [SING_TO.tooltip, SING_TO.limitReason, SING_TO.lowEnergyReason, SING_TO.lackEnergyLine, SING_TO.agitatedLine]) {
      assert.ok(butterflySrc.includes(`"${text}"`), text);
    }
    for (const [chance, min, max, text] of BUTTERFLY_WISDOM) {
      assert.ok(butterflySrc.includes(`[${chance},\t${min},\t${max},\t"${text}"]`), text);
    }
    assert.equal(BUTTERFLY_WISDOM.length, 13);
    assert.match(butterflySrc, /var boost = Math\.ceil\(0\.5 \/ \( wisdom\[0\] \/ 10 \)\);\s*var xp = Math\.ceil\(0\.05 \* pc\.metabolics\.energy\.top\) \* boost;\s*var energy_cost = xp \* 2;/);
    assert.match(butterflySrc, /var limit = 1;\s*if \(pc\.checkSkillPackageOverLimit\('sing_to', limit, this\)\)/);
    assert.match(butterflySrc, /this\.sendBubble\(wisdom\[1\], 5000, pc, slugs\);/);
    const verb = butterflySrc.slice(butterflySrc.indexOf('verbs.sing_to'), butterflySrc.indexOf('verbs.milk'));
    assert.doesNotMatch(verb, /metabolics_add_mood/);
  });
});

describe('butter up', () => {
  it('costs 4 energy, gives 10 mood and 4 iMG (with the mood bonus), and has no daily limit', () => {
    const s = {};
    const pc = { energy: 50, mood: 60, xp: 0, imagination: 0 };
    const xps = [];
    for (let i = 0; i < 3; i += 1) {
      assert.deepEqual(butterUpVerbState(s), { enabled: true, reason: '' });
      const r = butterUpChicken(s, pc);
      assert.equal(r.ok, true);
      assert.equal(r.bubble, "That's the nicest thing I've ever heard! Thank you!");
      assert.equal(r.bubbleMs, 2000);
      assert.equal(r.effects.energy, -4);
      assert.equal(r.effects.mood, 10);
      xps.push(r.effects.xp);
    }
    // stats_add_xp(4) after the mood lands: 70% x1, 80% x1.1, 90% x1.2 (inc_stats.js 270-272).
    assert.deepEqual(xps, [4, 4, 5]);
    assert.equal(pc.energy, 38);
    assert.equal(pc.mood, 90);
    assert.equal(pc.imagination, 13);
    assert.equal(s.butteredUp, 3);
  });

  it('has no energy check: it spends you down to 0', () => {
    const pc = { energy: 2, mood: 20, xp: 0, imagination: 0 };
    const r = butterUpChicken({}, pc);
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 0);
    assert.equal(r.effects.energy, -2);
  });

  it('caps mood at the tank and refuses mood through the metabolic gate', () => {
    const pc = { energy: 50, mood: 95, xp: 0, imagination: 0 };
    assert.equal(butterUpChicken({}, pc).effects.mood, 5);
    setMetabolicGainGate((stat) => (stat === 'mood' ? { ok: false } : { ok: true }));
    const dead = { energy: 50, mood: 10, xp: 0, imagination: 0 };
    const r = butterUpChicken({}, dead);
    assert.equal(r.ok, true);
    assert.equal(r.effects.mood, 0);
    assert.equal(dead.mood, 10);
    assert.equal(dead.imagination > 0, true, 'iMG still lands (stats_add_xp is not gated)');
  });

  it('is off while incubating and hidden on an announcement chicken', () => {
    assert.deepEqual(butterUpVerbState({ incubatingEgg: 'egg_plain' }), {
      enabled: false,
      reason: 'This chicken is focused on the miracle of life! No butter!',
    });
    assert.equal(butterUpVerbState({ isAnnouncement: true }), null);
    assert.equal(butterUpChicken({ incubatingEgg: 'egg_plain' }, { energy: 50 }).ok, false);
  });

  it('content.js lists it with the source tooltip and returns the thank-you bubble', () => {
    const target = { classId: 'npc_chicken', state: {} };
    const pc = { energy: 50, mood: 60, xp: 0, imagination: 0 };
    const verb = getVerbsFor(target, { pc, inv: {} }).find((v) => v.id === 'butter_up');
    assert.equal(verb.enabled, true);
    assert.equal(verb.tooltip, 'Tell this chicken how wonderful it is');
    for (let i = 0; i < 2; i += 1) {
      const r = runVerb(target, 'butter_up', { pc, inv: {} });
      assert.equal(r.ok, true);
      assert.equal(r.speech.text, "That's the nicest thing I've ever heard! Thank you!");
      assert.equal(r.speech.durationMs, 2000);
      assert.match(r.msgs[0], /^You buttered up a Chicken\./);
      assert.equal(r.effects.img, 4);
    }
    assert.equal(getVerbsFor(target, { pc, inv: {} }).find((v) => v.id === 'butter_up').enabled, true);
  });
});

describe('sing to', () => {
  it('is hidden without the Butterfly Whisperer badge', () => {
    assert.equal(singToVerbState({}, { achievements: [], energy: 50, dayKey: DAY }), null);
    const verbs = getVerbsFor({ classId: 'npc_butterfly', state: {} }, { pc: { energy: 50 }, inv: {} });
    assert.equal(verbs.some((v) => v.id === 'sing_to'), false);
    const r = singToButterfly({}, { energy: 50 }, { achievements: [], dayKey: DAY });
    assert.equal(r.ok, false);
    assert.equal(r.msg, 'You tried to sing to a Butterfly. The butterfly is agitated by your decidedly un-dulcet tones. It flies away.');
  });

  it('gives iMG worth 5% of the tank for twice that in energy, and no mood', () => {
    const s = {};
    const pc = { energy: 50, mood: 70, xp: 0, imagination: 0 };
    const r = singToButterfly(s, pc, { achievements: BADGE, level: 1, dayKey: DAY, rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.wisdom, "If a plant isn't hungry, don't feed it, silly.");
    assert.equal(r.bubbleMs, 5000);
    assert.deepEqual(r.effects, { energy: -10, mood: 0, xp: 5 });
    assert.equal(pc.energy, 40);
    assert.equal(pc.mood, 70);
    // A bigger tank pays more: 200 → 10 iMG for 20 energy.
    assert.deepEqual(singReward(200, 10), { boost: 1, xp: 10, energyCost: 20 });
    // The chance-3 Cosma line doubles it; chance 5 does not.
    assert.deepEqual(singReward(100, 3), { boost: 2, xp: 10, energyCost: 20 });
    assert.deepEqual(singReward(100, 5), { boost: 1, xp: 5, energyCost: 10 });
  });

  it('is once per butterfly per game day', () => {
    const s = {};
    const pc = { energy: 80, mood: 20, xp: 0, imagination: 0 };
    assert.equal(singToButterfly(s, pc, { achievements: BADGE, dayKey: DAY, rng: () => 0 }).ok, true);
    assert.deepEqual(singToVerbState(s, { achievements: BADGE, energy: 80, dayKey: DAY }), {
      enabled: false,
      reason: 'You already sang to this Butterfly enough today.',
    });
    const again = singToButterfly(s, pc, { achievements: BADGE, dayKey: DAY, rng: () => 0 });
    assert.equal(again.ok, false);
    assert.equal(again.msg, 'You already sang to this Butterfly enough today.');
    // Another butterfly, or tomorrow, is fine.
    assert.equal(singToVerbState({}, { achievements: BADGE, energy: 80, dayKey: DAY }).enabled, true);
    assert.equal(singToVerbState(s, { achievements: BADGE, energy: 80, dayKey: 'd2' }).enabled, true);
  });

  it('needs more than 2 energy to offer, and refuses a song it cannot pay for without counting it', () => {
    assert.deepEqual(singToVerbState({}, { achievements: BADGE, energy: 2, dayKey: DAY }), {
      enabled: false,
      reason: "You don't have enough energy to do that.",
    });
    const s = {};
    const pc = { energy: 9, mood: 20, xp: 0, imagination: 0 };
    assert.equal(singToVerbState(s, { achievements: BADGE, energy: 9, dayKey: DAY }).enabled, true);
    const r = singToButterfly(s, pc, { achievements: BADGE, dayKey: DAY, rng: () => 0 });
    assert.equal(r.ok, false);
    assert.equal(r.msg, 'You lack sufficient energy to kick out the jams. Maybe you should eat something?');
    assert.equal(pc.energy, 9);
    assert.equal(pc.imagination, 0);
    assert.equal(singToVerbState(s, { achievements: BADGE, energy: 9, dayKey: DAY }).enabled, true);
  });

  it('picks wisdom by level and weight', () => {
    // Level 1: every line but the Bean Seasoner one (3-10).
    const low = wisdomPool(1);
    assert.equal(low.length, 103);
    assert.equal(low.some(([, t]) => t.includes('Bean Seasoner')), false);
    // Level 8: only the 999 lines and the Bean Seasoner one.
    const mid = new Set(wisdomPool(8).map(([, t]) => t));
    assert.equal(mid.has("If you want to choose what kinds of beans to plant, you're going to need a Bean Seasoner."), true);
    assert.equal(mid.has('Cherries are the root of all fruits'), false);
    // Level 20: the seven lines with no top level.
    assert.equal(new Set(wisdomPool(20).map(([, t]) => t)).size, 7);
    assert.equal(wisdomPool(20).filter(([c]) => c === 3).length, 3);
  });

  it('adds butterfly life by Animal Kinship rank, up to 400', () => {
    assert.deepEqual([0, 2, 3, 5, 6, 7].map(singLifeFor), [1, 1, 2, 2, 3, 3]);
    const s = { lifePoints: 300 };
    const r = singToButterfly(s, { energy: 50, xp: 0, imagination: 0 }, { achievements: BADGE, akRank: 6, dayKey: DAY, rng: () => 0 });
    assert.equal(r.life, 3);
    assert.equal(s.lifePoints, 303);
    assert.equal(s.timesSungTo, 1);
    const full = {};
    assert.equal(singToButterfly(full, { energy: 50, xp: 0, imagination: 0 }, { achievements: BADGE, dayKey: DAY, rng: () => 0 }).life, 0);
    assert.equal(full.lifePoints, 400);
    assert.equal(full.timesSungTo, undefined, 'not counted when it added nothing');
  });

  it('content.js offers it with the badge and returns the wisdom bubble', () => {
    const target = { classId: 'npc_butterfly', state: {} };
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const ctx = { pc, inv: {}, achievements: BADGE, rng: () => 0.999 };
    const verb = getVerbsFor(target, ctx).find((v) => v.id === 'sing_to');
    assert.equal(verb.enabled, true);
    assert.equal(verb.tooltip, 'Sing, and get wisdom');
    const r = runVerb(target, 'sing_to', ctx);
    assert.equal(r.ok, true);
    assert.equal(r.speech.text, 'Cherries are the root of all fruits');
    assert.equal(r.speech.durationMs, 5000);
    assert.match(r.msgs[0], /^You sang to a Butterfly\./);
    assert.equal(r.effects.mood, 0);
    assert.equal(r.effects.energy, -10);
    assert.equal(target.state.singToDay, getGameDayKey());
    assert.equal(getVerbsFor(target, ctx).find((v) => v.id === 'sing_to').enabled, false);
  });
});
