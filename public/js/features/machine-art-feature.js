/**
 * Machine art states (register row G193), QA side, as a feature module (see
 * js/feature-host.js). The states themselves live in js/machine-art.js; the
 * room machines draw them in machine-rooms-feature.js and the pack machines
 * in game.js's Make panel (progress stage and result).
 *
 * QA:
 *   &machineartstate=<state> shows every machine in one state (assembled,
 *     loadOpen, loadOpenHold, loadClose, active, ready, collectOpen,
 *     collectOpenHold, collectClose), looping it, in a room and in the Make
 *     panel. Rooms: see machine-rooms-feature.js (doordemo routes).
 *   &machineartdemo=fuelmaker|blockmaker|woodworker|metalmaker puts that
 *     machine in your pack (its skill, a tank of &machineartfuel=N, default
 *     200, and one batch's ingredients) and opens its Make panel from the pack;
 *     &machineartautoplay=1 picks the recipe and makes one (=2 makes two).
 *     With &machineartfuel=11 the Make leaves the tank at 10 or less and the
 *     machine says it is low on fuel.
 * Canvas data: machineArtState (the frozen state or ''), machineArtDemo.
 */

import { addItem, countItem } from '../inventory.js?v=85d4faba';
import { ensureToolCondition } from '../tools.js?v=9a2e7ef4';
import { MACHINE_SKILLS } from '../machine-rooms.js?v=dd347926';
import { freezeMachineState, isMachineArt } from '../machine-art.js?v=2ce23a81';

export const MACHINE_ART_FEATURE_ID = 'machine-art';

/** One recipe per machine and its inputs (catalog_recipes.js), as machine-rooms-feature's demo uses. */
const DEMO_RECIPES = Object.freeze({
  fuelmaker: { recipe: 'Fuel Cell', items: { jellisac_clump: 12, peat: 8, white_gas: 2 } },
  blockmaker: { recipe: 'Urth Block', items: { earth: 5, loam: 2, heavy_gas: 1 } },
  woodworker: { recipe: 'Board', items: { plank: 4 } },
  metalmaker: { recipe: 'Metal Rod', items: { tin: 1, plain_metal: 1 } },
});

let demoDone = false;
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

function packDemo(engine, machine) {
  const demo = DEMO_RECIPES[machine];
  if (!demo || !isMachineArt(machine)) return;
  demoDone = true;
  const qty = Math.max(1, Math.min(5, Number(engine.param?.('machineartautoplay')) || 1));
  if (!(engine.learnedSkills || []).includes(MACHINE_SKILLS[machine])) engine.grantSkill?.(MACHINE_SKILLS[machine]);
  if (countItem(engine.inv, machine) < 1) addItem(engine.inv, machine, 1);
  const row = ensureToolCondition(engine.toolState, machine);
  const raw = engine.param?.('machineartfuel');
  const fuel = raw == null || raw === '' ? NaN : Number(raw);
  if (row) {
    row.remaining = Number.isFinite(fuel) && fuel >= 0 ? Math.min(200, fuel) : 200;
    row.broken = row.remaining <= 0;
  }
  for (const [id, n] of Object.entries(demo.items)) {
    const short = n * qty - countItem(engine.inv, id);
    if (short > 0) addItem(engine.inv, id, short);
  }
  if (engine.pc && engine.pc.energy < 100) engine.pc.energy = 100;
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.setData?.('machineArtDemo', machine);
  // The pack card's Make button, as a player opens it.
  later(() => {
    document.querySelector(`.pack-slot[data-tsid="${machine}"]`)?.click();
    later(() => {
      document.querySelector('[data-pack-make]')?.click();
      if (!engine.param?.('machineartautoplay')) return;
      later(() => {
        const tile = [...document.querySelectorAll('#make-list .make-tile')].find((t) => t.querySelector('.tile-label')?.textContent === demo.recipe);
        tile?.click();
        later(() => {
          for (let i = 1; i < qty; i++) document.querySelector('#make-detail [data-mq="+"]')?.click();
          document.querySelector('#make-detail [data-make-go]')?.click();
        }, 400);
      }, 500);
    }, 400);
  }, 1400);
}

export const machineArtFeature = {
  id: MACHINE_ART_FEATURE_ID,

  init(engine) {
    const state = freezeMachineState(engine.param?.('machineartstate') || '');
    engine.setData?.('machineArtState', state);
  },

  onStreetEnter(street, engine) {
    const machine = engine.param?.('machineartdemo');
    if (machine && !demoDone) packDemo(engine, machine);
  },

  onStreetClear() {
    for (const id of timers) clearTimeout(id);
    timers = [];
  },

  /** QA / tests. */
  _reset() {
    demoDone = false;
    freezeMachineState('');
  },
};
