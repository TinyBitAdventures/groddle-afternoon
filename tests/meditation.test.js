/**
 * Focusing Orb meditation rules (items/focusing_orb.js, catalog_skill_packages.js).
 * Run: node --test tests/meditation.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FOCUSED_MEDITATION_PACKAGE,
  LEVITATION_PACKAGE,
  MEDITATION_MUSIC,
  MEDITATION_TEXT,
  MEDITATIVE_ARTS_PACKAGE,
  ORB_ITEM,
  ORB_TOOL_SHEET,
  createMeditationState,
  dailyEnergyLimit,
  endLevitation,
  finishMeditation,
  focusedCooldownSeconds,
  hasZen,
  levitationMinEnergy,
  listOrbVerbs,
  meditationChatter,
  perSecondGain,
  randInt,
  skillMultiplier,
  standingCooldownSeconds,
  startLevitation,
  startMeditation,
  tankMultiplier,
} from '../public/js/meditation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MA1 = ['meditativearts_1'];
const ALL = ['meditativearts_1', 'meditativearts_2', 'meditativearts_3', 'focused_meditation_1', 'levitation_1'];
const fixed = (v) => () => v;

describe('source tables', () => {
  it('keeps the exact skill package timings', () => {
    assert.deepEqual(
      Object.values(MEDITATIVE_ARTS_PACKAGE).map((p) => [p.duration, p.durationMax, p.bonusAmount]),
      [[4000, 16000, 4], [8000, 20000, 7], [10000, 30000, 10]]
    );
    assert.deepEqual(
      Object.values(FOCUSED_MEDITATION_PACKAGE).map((p) => [p.duration, p.durationMax, p.bonusAmount]),
      [[2000, 11000, 4], [5000, 17000, 7], [8000, 25000, 10]]
    );
    assert.equal(LEVITATION_PACKAGE.durationMs, 5000);
    assert.equal(LEVITATION_PACKAGE.energyCost, 20);
    assert.equal(LEVITATION_PACKAGE.physics.gravity, 0.85);
    assert.equal(ORB_ITEM.baseCost, 1200);
  });

  it('interpolates the tank multiplier like getTankMultiplier', () => {
    assert.equal(tankMultiplier(100), 0.0075);
    assert.ok(Math.abs(tankMultiplier(150) - 0.00675) < 1e-12);
    assert.ok(Math.abs(tankMultiplier(750) - 0.004) < 1e-12);
    assert.equal(tankMultiplier(20000), 0.0009);
  });

  it('scales by Meditative Arts rank and doubles for focused meditation', () => {
    assert.equal(skillMultiplier(MA1), 1);
    assert.equal(skillMultiplier(['meditativearts_2']), 1.25);
    assert.equal(skillMultiplier(['meditativearts_3']), 1.5);
    assert.equal(perSecondGain('standing', MA1, 100), 0.75);
    assert.equal(perSecondGain('focused', MA1, 100), 1.5);
  });

  it('uses the source cooldowns, daily top and levitation energy floor', () => {
    assert.equal(standingCooldownSeconds(100), 20);
    assert.equal(standingCooldownSeconds(2000), 40);
    assert.equal(focusedCooldownSeconds(100), 30);
    assert.equal(dailyEnergyLimit(100), 100);
    assert.equal(dailyEnergyLimit(100, ['meditative_arts_daily_limit_2']), 150);
    assert.equal(levitationMinEnergy(100), 21);
  });

  it('ships the measured orb overlay sheet and music stand-ins', () => {
    assert.equal(ORB_TOOL_SHEET.frames, 31);
    assert.equal(ORB_TOOL_SHEET.cols * ORB_TOOL_SHEET.frameW, 640);
    assert.ok(existsSync(join(root, ORB_TOOL_SHEET.url)));
    for (const url of Object.values(MEDITATION_MUSIC)) assert.ok(existsSync(join(root, url)), url);
  });

  it('randInt is inclusive', () => {
    assert.equal(randInt(4, 16, fixed(0)), 4);
    assert.equal(randInt(4, 16, fixed(0.9999)), 16);
  });
});

describe('orb verbs', () => {
  it('shows only meditate without skills, disabled with the source reason', () => {
    const verbs = listOrbVerbs(createMeditationState(), { learned: [], energy: 80 });
    assert.deepEqual(verbs.map((v) => v.id), ['meditate']);
    assert.equal(verbs[0].enabled, false);
    assert.equal(verbs[0].reason, MEDITATION_TEXT.needSkill);
  });

  it('lists every learned verb in source sort order', () => {
    const verbs = listOrbVerbs(createMeditationState(), { learned: ALL, energy: 80 });
    assert.deepEqual(verbs.map((v) => v.id), ['levitate', 'focus_energy', 'focus_mood', 'meditate']);
    assert.ok(verbs.every((v) => v.enabled));
  });

  it('blocks during the cooldown and while levitation energy is short', () => {
    const now = 1_000_000;
    const cooling = listOrbVerbs({ cooldownUntil: now + 5000 }, { learned: ALL, energy: 80, now });
    assert.equal(cooling.find((v) => v.id === 'meditate').reason, MEDITATION_TEXT.scattered);
    assert.equal(cooling.find((v) => v.id === 'levitate').reason, MEDITATION_TEXT.scatteredLevitate);
    const tired = listOrbVerbs({}, { learned: ALL, energy: 21, now });
    assert.equal(tired.find((v) => v.id === 'levitate').reason, MEDITATION_TEXT.levitateEnergy);
  });

  it('radiate needs someone nearby', () => {
    const verbs = listOrbVerbs({}, { learned: ['meditativearts_2', 'transcendental_radiation_1'], energy: 80 });
    assert.equal(verbs.find((v) => v.id === 'radiate').reason, MEDITATION_TEXT.radiateAlone);
  });
});

describe('standing meditation', () => {
  it('rolls a duration between duration and duration_max seconds', () => {
    const lo = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0) });
    const hi = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0.9999) });
    assert.equal(lo.session.durationMs, 4000);
    assert.equal(hi.session.durationMs, 16000);
    assert.ok(MEDITATION_TEXT.start.includes(lo.line));
  });

  it('pays 0.75/s mood and energy plus the 4% full-effect bonus at rank 1', () => {
    const start = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0.9999), now: 0 });
    const out = finishMeditation({}, start.session, {
      learned: MA1, now: 16000, energy: 10, mood: 10, dayKey: 'd1', rng: fixed(0),
    });
    // 0.75 x 16 = 12; +4% = 12.48 -> 12; iMG = 0.48 -> 0
    assert.equal(out.seconds, 16);
    assert.equal(out.full, true);
    assert.equal(out.maxRelax, true);
    assert.equal(out.energy, 12);
    assert.equal(out.mood, 12);
    assert.equal(out.sound, 'MEDITATION_SUCCESS');
    assert.equal(out.state.cooldownUntil, 16000 + 20000);
    assert.match(out.message, /^Darn\. Got distracted\. That was relaxing\. \+12 mood, \+12 energy, \+0 iMG$/);
  });

  it('pays only elapsed seconds and the horrible sound when interrupted', () => {
    const start = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0.9999), now: 0 });
    const out = finishMeditation({}, start.session, { learned: MA1, now: 3200, energy: 10, mood: 10 });
    assert.equal(out.seconds, 4);
    assert.equal(out.full, false);
    assert.equal(out.energy, 3);
    assert.equal(out.sound, 'HORRIBLE_SOUND');
  });

  it('emits whole badge minutes and quest seconds, plus the Wintry Place counter', () => {
    const start = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0.9999), now: 0 });
    const out = finishMeditation({ totalSeconds: 50 }, start.session, {
      learned: MA1, now: 16000, streetTsid: 'GM11E7ODKHO1QJE',
    });
    assert.deepEqual(out.events, [
      { counter: 'meditation_seconds', amount: 16 },
      { counter: 'focusing_orb:meditation_time', amount: 1 },
      { counter: 'meditation_seconds_wintry', amount: 16 },
    ]);
  });
});

describe('focused meditation and zen', () => {
  it('focus energy pays 1.5/s energy only and flags 24+', () => {
    const start = startMeditation({}, 'focus_energy', { learned: ['meditativearts_3', 'focused_meditation_1'], rng: fixed(0.9999), now: 0 });
    assert.equal(start.session.durationMs, 25000);
    const out = finishMeditation({}, start.session, {
      learned: ['meditativearts_3', 'focused_meditation_1'], now: 25000, energy: 0, mood: 0, dayKey: 'd',
    });
    // 1.5 x 25 = 37.5; +10% = 41.25 -> 41 energy; iMG 3.75 -> 4
    assert.equal(out.energy, 41);
    assert.equal(out.mood, 0);
    assert.equal(out.img, 4);
    assert.equal(out.state.cooldownUntil, 25000 + 30000);
    assert.ok(out.events.some((e) => e.counter === 'meditation_gain_24'));
  });

  it('counts meditation energy toward the daily top, then zen blocks focus energy', () => {
    const learned = ['meditativearts_3', 'focused_meditation_1'];
    const start = startMeditation({}, 'focus_energy', { learned, rng: fixed(0.9999), now: 0 });
    const out = finishMeditation({ dayKey: 'd', energyToday: 80 }, start.session, {
      learned, now: 25000, energy: 0, dayKey: 'd',
    });
    assert.equal(out.energy, 20);
    assert.equal(out.reachedZen, true);
    assert.equal(hasZen(out.state, 'd'), true);
    const verbs = listOrbVerbs(out.state, { learned, energy: 50, now: 60000, dayKey: 'd' });
    assert.equal(verbs.find((v) => v.id === 'focus_energy').reason, MEDITATION_TEXT.zen);
    assert.equal(hasZen(out.state, 'next-day'), false);
  });

  it('zen still lets standing meditation restore mood', () => {
    const start = startMeditation({}, 'meditate', { learned: MA1, rng: fixed(0.9999), now: 0 });
    const out = finishMeditation({ dayKey: 'd', energyToday: 100 }, start.session, {
      learned: MA1, now: 16000, dayKey: 'd',
    });
    assert.equal(out.energy, 0);
    assert.equal(out.mood, 12);
  });

  it('chatters at ticks 2, 5 and 11 only', () => {
    assert.equal(meditationChatter(1), null);
    assert.ok(MEDITATION_TEXT.tick2.includes(meditationChatter(2, fixed(0))));
    assert.ok(MEDITATION_TEXT.tick5.includes(meditationChatter(5, fixed(0))));
    assert.ok(MEDITATION_TEXT.tick11.includes(meditationChatter(11, fixed(0))));
  });
});

describe('levitation', () => {
  it('costs 20 energy for 5 s and leaves a 20 s cooldown', () => {
    const out = startLevitation({}, { learned: ALL, energy: 80, now: 0 });
    assert.equal(out.ok, true);
    assert.equal(out.energyCost, 20);
    assert.equal(out.until, 5000);
    const ended = endLevitation(out.state, 5000);
    assert.equal(ended.levitateUntil, 0);
    assert.equal(ended.cooldownUntil, 25000);
  });

  it('refuses in unfair places and without the skill', () => {
    assert.equal(startLevitation({}, { learned: ALL, energy: 80, unfairPlace: true }).error, MEDITATION_TEXT.levitateUnfair);
    assert.equal(startLevitation({}, { learned: MA1, energy: 80 }).ok, false);
  });
});
