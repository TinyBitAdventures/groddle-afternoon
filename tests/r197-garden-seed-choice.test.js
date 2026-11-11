/**
 * Report #197: choosing which seeds to plant. A clean plot with more than one kind of seed for its
 * bed asks "What would you like to plant?" (InteractionMenuController.as startGardenPlotMenu
 * 1531-1556, GardenView.as onPlotClick 498-504) and plants the one chosen (include/garden.js
 * 339-342 plants args.seed); a seed dragged onto a clean plot plants that seed (GardenPlotView.as
 * dragOver 166-176, handleDrop 211-215). Solo beds and the shared street gardens alike.
 * Run: node --test tests/r197-garden-seed-choice.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLANT_PICK_TITLE,
  chosenSeedRefusal,
  createGarden,
  plantPlot,
  plantSeedChoices,
  seedDropCheck,
} from '../public/js/garden.js?v=788f2dbb';
import { getVerbsFor, runVerb } from '../public/content.js?v=5719e569';
import { plotDragClass, seedOver } from '../public/js/features/garden-guano-feature.js?v=210913f2';
import { sharedGardensFeature } from '../public/js/features/shared-gardens-feature.js?v=c026607a';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const COMMUNITY = 'GCR101NQ4BU1SKS';
const PC = () => ({ energy: 500, mood: 50, imaginationUpgrades: [] });

function plotTarget(gardenType = 'default', state = 'clean') {
  const garden = createGarden({ cols: 2, rows: 1, gardenType });
  Object.assign(garden.plots['1-1'], { state, seed: state === 'clean' ? null : 'seed_spinach' });
  return { classId: 'garden_plot', label: 'Plot 1-1', state: { garden, plotKey: '1-1', plot: garden.plots['1-1'], gardenEntity: {} } };
}
const plantVerb = (t, inv, pc = PC()) => getVerbsFor(t, { inv, pc }).find((v) => v.id === 'plant');

describe('#197 the Plant verb asks which seed', () => {
  it('two kinds for the bed: Plant opens the seed choice; one kind plants at once, as before', () => {
    const two = plantVerb(plotTarget(), { seed_spinach: 2, seed_onion: 1 });
    assert.equal(two.picker, 'plant');
    assert.equal(two.enabled, true);
    const one = plantVerb(plotTarget(), { seed_spinach: 2 });
    assert.equal(one.picker, undefined);
    assert.equal(one.tooltip, 'Plant Spinach Seed');
    // Herb seeds do not count for a crop bed, nor crop seeds for an herb bed.
    assert.equal(plantVerb(plotTarget(), { seed_spinach: 1, herb_seed_rubeweed: 3 }).picker, undefined);
    assert.equal(plantVerb(plotTarget('herb'), { seed_spinach: 1, herb_seed_rubeweed: 3 }).picker, undefined);
    assert.equal(plantVerb(plotTarget('herb'), { herb_seed_rookswort: 1, herb_seed_rubeweed: 3 }).picker, 'plant');
  });

  it('the choices are the bed\'s seeds in the pack, by name, with counts', () => {
    const inv = { seed_spinach: 2, seed_onion: 1, seed_corn: 4, herb_seed_rubeweed: 3 };
    assert.deepEqual(plantSeedChoices(inv, 'default'), [
      { classTsid: 'seed_corn', label: 'Corn Seed', have: 4 },
      { classTsid: 'seed_onion', label: 'Onion Seed', have: 1 },
      { classTsid: 'seed_spinach', label: 'Spinach Seed', have: 2 },
    ]);
    assert.deepEqual(plantSeedChoices(inv, 'herb').map((c) => c.classTsid), ['herb_seed_rubeweed']);
    assert.equal(PLANT_PICK_TITLE, 'What would you like to plant?');
  });

  it('plant:<seed> plants that seed, never another', () => {
    const t = plotTarget();
    const inv = { seed_spinach: 2, seed_onion: 1 };
    const r = runVerb(t, 'plant:seed_onion', { inv, pc: PC() });
    assert.equal(r.ok, true);
    assert.equal(t.state.garden.plots['1-1'].seed, 'seed_onion');
    assert.equal(inv.seed_onion ?? 0, 0);
    assert.equal(inv.seed_spinach, 2, 'the first seed in the catalogue stays in the pack');
    assert.equal(r.gardenPlot.verb, 'plant', 'the counters see a plant');
    assert.equal(r.gardenPlot.seedId, 'seed_onion');
    assert.equal(r.anim, 'plant');
  });

  it('a chosen seed gone from the pack, or of the wrong kind, refuses and plants nothing', () => {
    const t = plotTarget();
    const inv = { seed_spinach: 2 };
    const gone = runVerb(t, 'plant:seed_onion', { inv, pc: PC() });
    assert.equal(gone.ok, false);
    assert.deepEqual(gone.msgs, ["You don't have any Onion Seeds."]);
    const herb = runVerb(t, 'plant:herb_seed_rubeweed', { inv: { herb_seed_rubeweed: 1 }, pc: PC() });
    assert.equal(herb.ok, false);
    assert.deepEqual(herb.msgs, ['Only crop seeds go in a crop garden.']);
    assert.equal(t.state.garden.plots['1-1'].state, 'clean');
    assert.equal(inv.seed_spinach, 2);
    assert.equal(chosenSeedRefusal({ herb_seed_rubeweed: 1 }, 'herb_seed_rubeweed', 'herb'), null);
    assert.equal(chosenSeedRefusal({ seed_onion: 1 }, 'seed_onion', 'herb').reason, 'wrong_garden');
  });

  it('plain plant (one kind held) still plants the first seed, and plantPlot falls back without exactSeed', () => {
    const t = plotTarget();
    const inv = { seed_onion: 1 };
    assert.equal(runVerb(t, 'plant', { inv, pc: PC() }).ok, true);
    assert.equal(t.state.garden.plots['1-1'].seed, 'seed_onion');
    const g = createGarden({ cols: 1, rows: 1 });
    const inv2 = { seed_spinach: 1 };
    assert.equal(plantPlot(g, '1-1', inv2, PC(), 'seed_onion').ok, true, 'an old caller\'s preference stays a preference');
  });

  it('game.js: Plant\'s second level is the seed pictures and the pick runs plant:<seed>', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(verbId === 'plant' && target\?\.classId === 'garden_plot'\) \{\s*return plantSeedChoices\(inv, target\.state\?\.garden\?\.gardenType \|\| 'default'\);/);
    assert.match(game, /plant: PLANT_PICK_TITLE/);
    assert.match(game, /requestVerb\(target, \{ \.\.\.verb, id: `plant:\$\{seed\.classTsid\}`, picker: undefined \}/);
    // The plot's quest and skill-package event stays garden_plot:plant (drops-feature packageForEvent).
    assert.match(game, /const verbEvent = `\$\{target\.classId\}:\$\{target\.classId === 'garden_plot' \? baseVerb : verbId\}`;/);
  });
});

describe('#197 dragging a seed onto a plot', () => {
  it('a seed of the bed\'s kind on a clean plot plants it; the original\'s tips otherwise', () => {
    assert.deepEqual(seedDropCheck({ state: 'clean' }, 'seed_onion', 'default'), { ok: true, tip: 'Plant Onion Seeds' });
    assert.deepEqual(seedDropCheck({ state: 'seeds' }, 'seed_onion', 'default'), { ok: false, tip: 'Clear the plot first!' });
    assert.deepEqual(seedDropCheck({ state: 'clean' }, 'herb_seed_rubeweed', 'default'), { ok: false, tip: "This can't be planted here" });
    assert.deepEqual(seedDropCheck({ state: 'clean' }, 'seed_onion', 'herb'), { ok: false, tip: "This can't be planted here" });
    assert.equal(seedDropCheck({ state: 'clean' }, 'herb_seed_rubeweed', 'herb').ok, true);
  });

  it('the drop runs the plot\'s own Plant with the dragged seed', () => {
    const t = plotTarget();
    const inv = { seed_spinach: 2, seed_onion: 1 };
    const over = seedOver(t, 'seed_onion', getVerbsFor(t, { inv, pc: PC() }));
    assert.equal(over.tip, 'Plant Onion Seeds');
    assert.equal(over.verb.id, 'plant:seed_onion');
    assert.equal(over.verb.picker, undefined, 'no seed question after a drop');
    assert.equal(runVerb(t, over.verb.id, { inv, pc: PC() }).ok, true);
    assert.equal(t.state.garden.plots['1-1'].seed, 'seed_onion');
    // An herb bed takes an herb seed the same way.
    const h = plotTarget('herb');
    const hInv = { herb_seed_rubeweed: 1, herb_seed_rookswort: 1 };
    assert.equal(seedOver(h, 'herb_seed_rookswort', getVerbsFor(h, { inv: hInv, pc: PC() })).verb.id, 'plant:herb_seed_rookswort');
  });

  it('refuses with a reason: wrong kind, a busy plot, too tired, or no Plant (a visit without a key)', () => {
    const t = plotTarget();
    const inv = { seed_onion: 1, herb_seed_rubeweed: 1 };
    assert.equal(seedOver(t, 'herb_seed_rubeweed', getVerbsFor(t, { inv, pc: PC() })).verb, null);
    const busy = plotTarget('default', 'seeds');
    assert.deepEqual(seedOver(busy, 'seed_onion', getVerbsFor(busy, { inv, pc: PC() })), { verb: null, tip: 'Clear the plot first!' });
    const tired = seedOver(t, 'seed_onion', getVerbsFor(t, { inv, pc: { energy: 0, mood: 50 } }));
    assert.equal(tired.verb, null);
    assert.match(tired.tip, /energy/);
    assert.equal(seedOver(t, 'seed_onion', []).verb, null);
  });

  it('only Guano and seeds start a plot drag', () => {
    assert.equal(plotDragClass('guano'), 'guano');
    assert.equal(plotDragClass('seed_onion'), 'seed_onion');
    assert.equal(plotDragClass('herb_seed_rubeweed'), 'herb_seed_rubeweed');
    assert.equal(plotDragClass('apple'), '');
    assert.equal(plotDragClass(undefined), '');
  });
});

/** A fake multiplayer engine on Community Gardens (as tests/shared-gardens.test.js), running content.js. */
function rig(inv) {
  const sent = [];
  const listeners = new Map();
  const client = {
    state: 'online',
    street: COMMUNITY,
    me: { id: 7 },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    send(kind, payload = {}) {
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const world = { [COMMUNITY]: { gardens: { default: createGarden({ cols: 4, rows: 2 }) } } };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: COMMUNITY,
    inv,
    pc: PC(),
    learnedSkills: [],
    toolState: null,
    interactables: [],
    data: {},
    toasts: [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    refreshGarden() {},
    refreshPack() {},
    save() {},
    visitedStreets: () => Object.keys(world),
    streetWorld: (tsid) => world[tsid] || (world[tsid] = { gardens: {} }),
    query(hook) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') return true;
      return null;
    },
    ran: [],
    executeVerb(target, verbId) {
      // game.js executeVerb: the override first, then content.js runVerb with the granted draws.
      if (sharedGardensFeature.runVerbOverride(target, verbId, engine) === true) return;
      const grant = sharedGardensFeature.sharedVerbGrant(target, verbId);
      const rolls = [...(grant?.rolls || [])];
      engine.ran.push(runVerb(target, verbId, { inv: engine.inv, pc: engine.pc, learned: [], sharedGarden: Boolean(grant?.garden), rng: () => (rolls.length ? rolls.shift() : 0.99) }));
    },
  };
  sharedGardensFeature._reset();
  sharedGardensFeature.restore(undefined, engine);
  sharedGardensFeature.onTick(16, 0, engine);
  const bed = sharedGardensFeature.sharedGardenFor('default', { cols: 4, rows: 2 }, engine);
  const bedT = { classId: 'garden_new', state: { garden: bed, plotTargets: [] } };
  for (const key of Object.keys(bed.plots)) {
    bedT.state.plotTargets.push({ classId: 'garden_plot', state: { garden: bed, plotKey: key, plot: bed.plots[key], gardenEntity: bedT } });
  }
  engine.interactables = [bedT, ...bedT.state.plotTargets];
  const plot = (key) => {
    const t = bedT.state.plotTargets.find((p) => p.state.plotKey === key);
    t.state.plot = t.state.garden.plots[key];
    return t;
  };
  client.emit('msg:gardens', { t: 'gardens', street: COMMUNITY, snap: true, now: Date.now(), lock: 60000, plots: {} });
  return { engine, client, sent, bed, plot };
}

describe('#197 a shared street garden plants the chosen seed', () => {
  it('plant:<seed> asks the server for that seed and plants it on the go-ahead', async () => {
    const r = rig({ seed_spinach: 2, seed_onion: 1 });
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'plant:seed_onion', r.engine), true);
    await new Promise((res) => setTimeout(res, 0));
    const ask = r.sent.at(-1);
    assert.equal(ask.t, 'garden_act');
    assert.equal(ask.verb, 'plant', 'the server hears plant');
    assert.equal(ask.seed, 'seed_onion');
    assert.equal(ask.id, 'default:1-1');
    r.client.emit('msg:garden_ok', { req: ask.req, id: 'default:1-1', verb: 'plant', now: Date.now(), before: { 'default:1-1': { state: 'clean' } }, plots: { 'default:1-1': { state: 'seeds', seed: 'seed_onion', stageAt: Date.now() } } });
    assert.equal(r.engine.ran.at(-1)?.ok, true);
    assert.equal(r.engine.inv.seed_onion ?? 0, 0, 'the onion seed was planted');
    assert.equal(r.engine.inv.seed_spinach, 2);
    assert.equal(r.bed.plots['1-1'].seed, 'seed_onion');
  });

  it('a chosen seed not in the pack is refused here and nothing is sent', () => {
    const r = rig({ seed_spinach: 2 });
    const before = r.sent.length;
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'plant:seed_onion', r.engine), true);
    assert.equal(r.sent.length, before);
    assert.equal(r.engine.ran.at(-1)?.ok, false);
    assert.equal(r.engine.inv.seed_spinach, 2);
    assert.equal(r.bed.plots['1-1'].state, 'clean');
  });

  it('other verbs with a suffix are not the server\'s', () => {
    const r = rig({ seed_spinach: 2 });
    assert.equal(sharedGardensFeature.runVerbOverride(r.plot('1-1'), 'water:x', r.engine), null);
  });
});
