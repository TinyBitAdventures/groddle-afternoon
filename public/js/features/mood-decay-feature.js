/**
 * Idle mood loss (players/player.js onTimePlaying): every minute of real play
 * time, mood drops a little, fastest from a high. Rules live in
 * js/mood-decay.js; this feature counts the minutes and reads the world
 * state the source skips on.
 *
 * Minutes count only while the game runs and the tab is visible (the frame
 * ticker stops in a hidden tab and its delta is capped, so time away never
 * piles up). Nothing new is saved: a reload starts a fresh minute.
 *
 * Skips, as in source:
 *   house deco mode   Decorate or Cultivate open (the client sent
 *                     no_energy_mode for decorator, chassis and cult modes)
 *   Paradise          PARADISE_* courses and the Beam Me Down scene
 *   newxp locations   tutorial scenes, Gentle Island, and the home while the
 *                     tutorial runs (homes_set_newxp)
 *   transcendental meditation  while radiating (player.js:2361), which happens
 *                     between real players in multiplayer only (G330)
 * engine.metabolicGate('mood', 'loss') also stops it while dead in Naraka.
 *
 * QA: ?autostart=1&fresh=1&mooddemo=90&moodtick=1500 starts mood at 90% and
 * runs a minute every 1.5 s; &moodcard=1|2|3 counts that Steady On, Mood
 * Loser card as owned for the loss (not granted, not saved). Canvas data:
 * data-mood-decay-last (whole loss of the last minute), -band, -skip,
 * -ticks, -mood, -rate.
 */
import {
  MOOD_DECAY_TICK_MS,
  createMoodDecayClock,
  moodDecaySkip,
  moodWarningFor,
  periodicMoodLoss,
} from '../mood-decay.js?v=mood-decay-1';
import { loseMood, moodMax } from '../metabolics.js';
import { GENTLE_ISLAND_TSIDS, isNewxpSceneTsid } from '../newxp.js?v=g449-1';
import { homesFeature } from './homes-feature.js?v=g448-4';
import { newxpFeature } from './newxp-feature.js?v=g452-1';
import { meditationFeature } from './meditation-feature.js?v=g448-2';

export const MOOD_DECAY_FEATURE_ID = 'mood-decay';
const BEAM_ME_DOWN_TSID = 'PUZZLESCENE_BEAM_ME_DOWN';
const MIN_QA_TICK_MS = 250;

let clock = createMoodDecayClock(MOOD_DECAY_TICK_MS);
let demoMood = null;
let demoApplied = false;
let demoCard = '';
let ticks = 0;

function introActive() {
  return newxpFeature.save?.()?.status === 'active';
}

/** The world state onTimePlaying checks, read from the engine. */
export function moodDecayContext(engine) {
  const tsid = String(engine.streetTsid || '');
  const homeMode = homesFeature._state?.()?.mode || null;
  const inHome = Boolean(engine.homeContext?.()?.inHome);
  return {
    decoMode: homeMode === 'decorate' || homeMode === 'cultivate',
    paradise: tsid.startsWith('PARADISE_') || tsid === BEAM_ME_DOWN_TSID,
    transcendental: meditationFeature._session?.()?.kind === 'transcendental',
    newxpLocation: isNewxpSceneTsid(tsid) || GENTLE_ISLAND_TSIDS.includes(tsid) || (inHome && introActive()),
  };
}

/** One onTimePlaying minute. Returns what happened (tests and QA data). */
export function runMoodDecayMinute(engine) {
  const pc = engine.pc;
  if (!pc) return { skip: 'nopc', loss: 0 };
  const skip = moodDecaySkip(moodDecayContext(engine)) || (engine.metabolicGate?.('mood', 'loss')?.ok === false ? 'gate' : null);
  if (skip) return { skip, loss: 0 };
  const top = moodMax(pc);
  const owned = [...(pc.imaginationUpgrades || [])];
  if (demoCard) owned.push(demoCard);
  const before = Number(pc.mood) || 0;
  const res = periodicMoodLoss({
    mood: before,
    moodMax: top,
    owned,
    rookswort: engine.hasBuff?.('rookswort') === true,
    introDone: !introActive(),
  });
  if (res.loss > 0) {
    // player.js 829: metabolics_lose_mood(mood_loss, 1), quiet (G300).
    loseMood(pc, res.loss, { quiet: true });
    const warning = moodWarningFor(res.percent, (pc.mood / top) * 100);
    if (warning) engine.pushActivity?.(warning);
    engine.updateHud?.();
  }
  return { skip: null, ...res };
}

function publish(engine, out) {
  engine.setData('moodDecayTicks', ticks);
  engine.setData('moodDecaySkip', out.skip || '');
  engine.setData('moodDecayLast', out.loss || 0);
  engine.setData('moodDecayBand', out.band || '');
  engine.setData('moodDecayRate', out.rate != null ? out.rate : '');
  engine.setData('moodDecayMood', Math.round(Number(engine.pc?.mood) || 0));
}

export const moodDecayFeature = {
  id: MOOD_DECAY_FEATURE_ID,

  init(engine) {
    const tick = Number(engine.param('moodtick'));
    clock = createMoodDecayClock(tick > 0 ? Math.max(MIN_QA_TICK_MS, tick) : MOOD_DECAY_TICK_MS);
    const pct = Number(engine.param('mooddemo'));
    demoMood = engine.param('mooddemo') !== null && Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    demoApplied = false;
    const card = Number(engine.param('moodcard'));
    demoCard = [1, 2, 3].includes(card) ? `periodic_mood_loss_reduced_${card}` : '';
    ticks = 0;
  },

  onTick(dtMs, now, engine) {
    if (!engine.started || !engine.pc) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (demoMood != null && !demoApplied) {
      demoApplied = true;
      engine.pc.mood = Math.round((moodMax(engine.pc) * demoMood) / 100);
      engine.updateHud?.();
      engine.setData('moodDecayTick', clock.period);
      publish(engine, { skip: '', loss: 0 });
    }
    const minutes = clock.advance(dtMs);
    for (let i = 0; i < minutes; i++) {
      ticks += 1;
      publish(engine, runMoodDecayMinute(engine));
    }
  },

  /** Tests. */
  _reset() {
    clock = createMoodDecayClock(MOOD_DECAY_TICK_MS);
    demoMood = null;
    demoApplied = false;
    demoCard = '';
    ticks = 0;
  },
};
