import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOOD_DECAY_MAX_CAP,
  MOOD_DECAY_TEXT,
  MOOD_DECAY_TICK_MS,
  createMoodDecayClock,
  highBandRate,
  moodDecayBand,
  moodDecaySkip,
  moodWarningFor,
  periodicMoodLoss,
} from '../public/js/mood-decay.js?v=mood-decay-1';
import { isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js';
import { IMAGINATION_UPGRADES } from '../public/js/imagination.js';
// The feature imports these with their browser cache tags; load the same module instances.
import { moodDecayContext, moodDecayFeature, runMoodDecayMinute } from '../public/js/features/mood-decay-feature.js';
import { __newxpTest } from '../public/js/features/newxp-feature.js?v=g276-1';
import { GENTLE_ISLAND_TSIDS } from '../public/js/newxp.js?v=newxp-2';

const CARD = (n) => `periodic_mood_loss_reduced_${n}`;

describe('periodicMoodLoss (player.js onTimePlaying)', () => {
  it('bands at >80, 50-80 and <50 percent', () => {
    assert.equal(moodDecayBand(81), 'high');
    assert.equal(moodDecayBand(80), 'mid');
    assert.equal(moodDecayBand(50), 'mid');
    assert.equal(moodDecayBand(49.9), 'low');
    assert.equal(moodDecayBand(0), 'low');
  });

  it('uses the source minimums at a 100 max (4 / 2 / 1)', () => {
    assert.equal(periodicMoodLoss({ mood: 100, moodMax: 100 }).loss, 4, 'max(1.5, 4)');
    assert.equal(periodicMoodLoss({ mood: 70, moodMax: 100 }).loss, 2, 'max(0.5, 2)');
    assert.equal(periodicMoodLoss({ mood: 30, moodMax: 100 }).loss, 1, 'max(0.25, 1)');
  });

  it('scales with the max: 1.5% / 0.5% / 0.25%, whole numbers floored', () => {
    assert.equal(periodicMoodLoss({ mood: 1000, moodMax: 1000 }).loss, 15);
    assert.equal(periodicMoodLoss({ mood: 600, moodMax: 1000 }).loss, 5);
    assert.equal(periodicMoodLoss({ mood: 400, moodMax: 1000 }).loss, 2, '2.5 floors to 2 (Property.dec)');
    const r = periodicMoodLoss({ mood: 500, moodMax: 600 });
    assert.equal(r.band, 'high');
    assert.equal(r.raw, 9);
    assert.equal(r.loss, 9);
  });

  it('caps the max used for the loss at 2000, but not the percentage', () => {
    assert.equal(MOOD_DECAY_MAX_CAP, 2000);
    const r = periodicMoodLoss({ mood: 2900, moodMax: 3000 });
    assert.equal(r.band, 'high');
    assert.equal(r.loss, 30, '2000 * 0.015');
    assert.equal(periodicMoodLoss({ mood: 1400, moodMax: 3000 }).band, 'low', '46.7% of the real max');
    assert.equal(periodicMoodLoss({ mood: 1400, moodMax: 3000 }).loss, 5, '2000 * 0.0025');
  });

  it('Steady On, Mood Loser I / II / III slow only the >80% band, best card wins', () => {
    assert.equal(highBandRate([]), 0.015);
    assert.equal(highBandRate([CARD(1)]), 0.0125);
    assert.equal(highBandRate([CARD(1), CARD(2)]), 0.01);
    assert.equal(highBandRate(new Set([CARD(1), CARD(2), CARD(3)])), 0.0075);
    assert.equal(periodicMoodLoss({ mood: 2000, moodMax: 2000, owned: [CARD(1)] }).loss, 25);
    assert.equal(periodicMoodLoss({ mood: 2000, moodMax: 2000, owned: [CARD(2)] }).loss, 20);
    assert.equal(periodicMoodLoss({ mood: 2000, moodMax: 2000, owned: [CARD(3)] }).loss, 15);
    assert.equal(periodicMoodLoss({ mood: 100, moodMax: 100, owned: [CARD(3)] }).loss, 4, 'minimum 4 still');
    assert.equal(periodicMoodLoss({ mood: 1200, moodMax: 2000, owned: [CARD(3)] }).loss, 10, 'mid band unchanged');
  });

  it('Rookswort halves the rate and keeps the minimums', () => {
    assert.equal(periodicMoodLoss({ mood: 2000, moodMax: 2000, rookswort: true }).loss, 15);
    assert.equal(periodicMoodLoss({ mood: 2000, moodMax: 2000, rookswort: true, owned: [CARD(3)] }).loss, 7, '7.5 floors');
    assert.equal(periodicMoodLoss({ mood: 1200, moodMax: 2000, rookswort: true }).loss, 5);
    assert.equal(periodicMoodLoss({ mood: 100, moodMax: 100, rookswort: true }).loss, 4);
  });

  it('before the intro is done there is no loss at or below 50%', () => {
    assert.equal(periodicMoodLoss({ mood: 50, moodMax: 100, introDone: false }).loss, 0);
    assert.equal(periodicMoodLoss({ mood: 20, moodMax: 100, introDone: false }).loss, 0);
    assert.equal(periodicMoodLoss({ mood: 51, moodMax: 100, introDone: false }).loss, 2);
    assert.equal(periodicMoodLoss({ mood: 50, moodMax: 100, introDone: true }).loss, 2);
  });

  it('never drops below zero', () => {
    assert.equal(periodicMoodLoss({ mood: 0, moodMax: 100 }).loss, 0);
    assert.equal(periodicMoodLoss({ mood: 0.6, moodMax: 100 }).loss, 0.6);
  });
});

describe('skips and warnings', () => {
  it('skips in source order: deco, Paradise, meditation, newxp', () => {
    assert.equal(moodDecaySkip({}), null);
    assert.equal(moodDecaySkip({ decoMode: true, paradise: true }), 'deco');
    assert.equal(moodDecaySkip({ paradise: true, newxpLocation: true }), 'paradise');
    assert.equal(moodDecaySkip({ transcendental: true }), 'meditation');
    assert.equal(moodDecaySkip({ newxpLocation: true }), 'newxp');
  });

  it('warns once on crossing 50% and 20% with the source lines', () => {
    assert.equal(moodWarningFor(52, 50), MOOD_DECAY_TEXT.low);
    assert.equal(moodWarningFor(50, 49), null, 'already under: no repeat');
    assert.equal(moodWarningFor(21, 20), MOOD_DECAY_TEXT.veryLow);
    assert.equal(moodWarningFor(60, 10), MOOD_DECAY_TEXT.veryLow);
    assert.equal(moodWarningFor(90, 86), null);
  });
});

describe('createMoodDecayClock', () => {
  it('counts whole minutes of fed play time and carries the remainder', () => {
    assert.equal(MOOD_DECAY_TICK_MS, 60000);
    const clock = createMoodDecayClock();
    assert.equal(clock.advance(59999), 0);
    assert.equal(clock.advance(1), 1);
    assert.equal(clock.advance(-5), 0);
    assert.equal(clock.advance(NaN), 0);
    assert.equal(clock.advance(125000), 2);
    assert.equal(clock.elapsed, 5000);
  });
});

describe('mood decay feature', () => {
  function fakeEngine(extra = {}) {
    const data = {};
    const activity = [];
    const engine = {
      started: true,
      streetTsid: 'GLI2V0UN7RD1T2J',
      pc: { mood: 100, energyMax: 100, imaginationUpgrades: [] },
      buffs: [],
      params: {},
      data,
      activity,
      hasBuff: (id) => engine.buffs.includes(id),
      homeContext: () => ({ inHome: false }),
      metabolicGate: () => ({ ok: true }),
      pushActivity: (m) => activity.push(m),
      updateHud() {},
      setData: (k, v) => { data[k] = String(v); },
      param: (k) => (k in engine.params ? engine.params[k] : null),
      ...extra,
    };
    return engine;
  }

  it('ticks a minute of play time and publishes the QA data', () => {
    __newxpTest.save = { status: 'off' };
    const engine = fakeEngine();
    moodDecayFeature._reset();
    moodDecayFeature.init(engine);
    moodDecayFeature.onTick(59000, 0, engine);
    assert.equal(engine.pc.mood, 100);
    moodDecayFeature.onTick(1000, 0, engine);
    assert.equal(engine.pc.mood, 96);
    assert.equal(engine.data.moodDecayLast, '4');
    assert.equal(engine.data.moodDecayBand, 'high');
    assert.equal(engine.data.moodDecayTicks, '1');
    assert.equal(engine.data.moodDecayMood, '96');
  });

  it('honours mooddemo, moodtick and moodcard', () => {
    const engine = fakeEngine({ pc: { mood: 10, energyMax: 2000, imaginationUpgrades: [] } });
    engine.params = { mooddemo: '90', moodtick: '1000', moodcard: '3' };
    moodDecayFeature._reset();
    moodDecayFeature.init(engine);
    moodDecayFeature.onTick(1000, 0, engine);
    assert.equal(engine.data.moodDecayTick, '1000');
    assert.equal(engine.data.moodDecayLast, '15', '2000 * 0.0075 from 1800');
    assert.equal(engine.pc.mood, 1785);
    assert.deepEqual(engine.pc.imaginationUpgrades, [], 'the QA card is not granted');
  });

  it('does not tick before the game starts', () => {
    const engine = fakeEngine({ started: false });
    moodDecayFeature._reset();
    moodDecayFeature.init(engine);
    moodDecayFeature.onTick(120000, 0, engine);
    assert.equal(engine.pc.mood, 100);
  });

  it('skips Paradise, Beam Me Down, newxp streets, the tutorial home, and death', () => {
    __newxpTest.save = { status: 'off' };
    const cases = [
      [{ streetTsid: 'PARADISE_CLOUD_RINGS' }, 'paradise'],
      [{ streetTsid: 'PUZZLESCENE_BEAM_ME_DOWN' }, 'paradise'],
      [{ streetTsid: GENTLE_ISLAND_TSIDS[0] }, 'newxp'],
      [{ metabolicGate: () => ({ ok: false }) }, 'gate'],
    ];
    for (const [extra, skip] of cases) {
      const engine = fakeEngine(extra);
      const out = runMoodDecayMinute(engine);
      assert.equal(out.skip, skip, JSON.stringify(extra));
      assert.equal(engine.pc.mood, 100);
    }
    const home = fakeEngine({ homeContext: () => ({ inHome: true }) });
    assert.equal(moodDecayContext(home).newxpLocation, false, 'a home after the tutorial decays');
    __newxpTest.save = { status: 'active', stage: 'island' };
    assert.equal(moodDecayContext(home).newxpLocation, true, 'homes_set_newxp while the tutorial runs');
    __newxpTest.save = { status: 'off' };
  });

  it('mid-tutorial off the island: no loss at or below 50%', () => {
    __newxpTest.save = { status: 'active', stage: 'island' };
    const engine = fakeEngine({ pc: { mood: 50, energyMax: 100 } });
    assert.equal(runMoodDecayMinute(engine).loss, 0);
    engine.pc.mood = 60;
    assert.equal(runMoodDecayMinute(engine).loss, 2);
    __newxpTest.save = { status: 'off' };
  });

  it('Rookswort halves it and warnings fire on crossing 50%', () => {
    __newxpTest.save = { status: 'off' };
    const engine = fakeEngine({ pc: { mood: 1001, energyMax: 2000 } });
    engine.buffs = ['rookswort'];
    const out = runMoodDecayMinute(engine);
    assert.equal(out.loss, 5, '2000 * 0.005 * 0.5');
    assert.equal(engine.pc.mood, 996);
    assert.deepEqual(engine.activity, [MOOD_DECAY_TEXT.low]);
  });
});

describe('Steady On, Mood Loser cards are dealt', () => {
  it('marks periodic_mood_loss_reduced_1..3 live', () => {
    for (const n of [1, 2, 3]) {
      assert.ok(IMAGINATION_UPGRADES[CARD(n)], CARD(n));
      assert.equal(remakeStatus(CARD(n)).status, 'live');
      assert.equal(isOfferedInRemake(CARD(n)), true);
    }
  });
});
