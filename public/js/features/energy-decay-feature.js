/**
 * Periodic energy loss (G258; players/player.js onPeriodicEnergyLoss
 * 2358-2380): every 90 s of play, energy drops by round(max x 0.008), 1 on
 * a 100 tank. Rules live in js/energy-decay.js; this feature counts the
 * 90 s and reads the world state the source skips on. It replaces the
 * remake's old walking drain and standing top-up (game.js physics), which
 * the source never had: energy now only comes back from food, drink and
 * the other real sources, so Pooped stays until you eat (any gain that
 * takes you over 5%) and Super Pooped until the new game day.
 *
 * The timer counts only while the game runs and the tab is visible (the
 * frame ticker stops in a hidden tab and its delta is capped), the remake's
 * isOnline(). Nothing is saved: the source re-armed the 90 s timer on every
 * login (player.js 189-190), and a reload starts a fresh 90 s here.
 *
 * Skips, as in source:
 *   house deco mode   Decorate or Cultivate open (as the mood decay feature)
 *   Paradise          PARADISE_* courses and the Beam Me Down scene
 *   transcendental meditation never runs in the remake (Transcendental
 *                     Radiation needs other players), so it never fires
 *   before the intro  loss only above 50% and never in the three tutorial
 *                     scenes (newxp_intro / training1 / training2)
 * engine.metabolicGate('energy', 'loss') also stops it while dead in Naraka
 * and in the tutorial's first two scenes (metabolics_lose_energy 108-121).
 * No AFK skip: the source has none.
 *
 * QA: ?autostart=1&fresh=1&energytick=1500 runs a 90 s tick every 1.5 s.
 * With &resetgame=1&helldemo=pooped (or superpooped) the next tick brings the
 * Pooped (Super Pooped) prompt, and standing still no longer clears it.
 * Canvas data: data-energy-loss-tick (period ms), -ticks, -last (energy lost
 * on the last tick), -skip, -energy.
 */
import { createEnergyLossClock, ENERGY_LOSS_TICK_MS, energyLossSkip, periodicEnergyLoss } from '../energy-decay.js?v=g258-1';
import { energyMax } from '../metabolics.js';
import { isNewxpSceneTsid } from '../newxp.js?v=newxp-2';
import { homesFeature } from './homes-feature.js?v=homes-24';
import { meditationFeature } from './meditation-feature.js?v=g289-1';
import { newxpFeature } from './newxp-feature.js?v=g296-1';

export const ENERGY_DECAY_FEATURE_ID = 'energy-decay';
const BEAM_ME_DOWN_TSID = 'PUZZLESCENE_BEAM_ME_DOWN';
const MIN_QA_TICK_MS = 250;

let clock = createEnergyLossClock(ENERGY_LOSS_TICK_MS);
let ticks = 0;

function introDone() {
  return newxpFeature.save?.()?.status !== 'active';
}

/** The world state onPeriodicEnergyLoss checks, read from the engine. */
export function energyDecayContext(engine) {
  const tsid = String(engine.streetTsid || '');
  const homeMode = homesFeature._state?.()?.mode || null;
  return {
    decoMode: homeMode === 'decorate' || homeMode === 'cultivate',
    paradise: tsid.startsWith('PARADISE_') || tsid === BEAM_ME_DOWN_TSID,
    transcendental: meditationFeature._session?.()?.kind === 'transcendental',
    newxpInstance: isNewxpSceneTsid(tsid),
  };
}

/** One onPeriodicEnergyLoss tick. Returns what happened (tests and QA data). */
export function runEnergyLossTick(engine) {
  const pc = engine.pc;
  if (!pc) return { skip: 'nopc', loss: 0 };
  const ctx = energyDecayContext(engine);
  const skip = energyLossSkip(ctx);
  if (skip) return { skip, loss: 0 };
  const before = Math.max(0, Number(pc.energy) || 0);
  const res = periodicEnergyLoss({ energy: before, energyMax: energyMax(pc), introDone: introDone(), newxpInstance: ctx.newxpInstance });
  if (!res.loss) return { skip: null, ...res };
  // metabolics_lose_energy: refused while dead, and in the intro and training1.
  if (engine.metabolicGate?.('energy', 'loss')?.ok === false) return { skip: 'gate', ...res, loss: 0 };
  pc.energy = Math.max(0, before - res.loss);
  engine.updateHud?.();
  return { skip: null, ...res };
}

function publish(engine, out) {
  engine.setData('energyLossTick', clock.period);
  engine.setData('energyLossTicks', ticks);
  engine.setData('energyLossSkip', out.skip || '');
  engine.setData('energyLossLast', out.loss || 0);
  engine.setData('energyLossEnergy', Math.round(Number(engine.pc?.energy) || 0));
}

export const energyDecayFeature = {
  id: ENERGY_DECAY_FEATURE_ID,

  init(engine) {
    const tick = Number(engine.param('energytick'));
    clock = createEnergyLossClock(tick > 0 ? Math.max(MIN_QA_TICK_MS, tick) : ENERGY_LOSS_TICK_MS);
    ticks = 0;
    engine.setData('energyLossTick', clock.period);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started || !engine.pc) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const due = clock.advance(dtMs);
    for (let i = 0; i < due; i++) {
      ticks += 1;
      publish(engine, runEnergyLossTick(engine));
    }
  },

  /** Tests. */
  _reset() {
    clock = createEnergyLossClock(ENERGY_LOSS_TICK_MS);
    ticks = 0;
  },
};
