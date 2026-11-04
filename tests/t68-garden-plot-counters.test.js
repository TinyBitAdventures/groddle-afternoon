/**
 * Ticket 68 (mr granberry, 2026-11-03): Shucks To Be You and Tater 'n' Mater never saw the
 * plots planted and picked by hand. The plot menus (content.js garden_plot) sent only
 * `garden_plot:<verb>`; the crop and herb counters were sent by a garden panel nothing opens.
 * Now a plot verb carries its result (gardenPlot) and game.js sends what include/garden.js
 * counted, at home or on a street, solo or online.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=2ce7b3cb';
import { acceptOffer, routeQuestEvent, gardenPlotEvents } from '../public/js/quest-offers.js?v=c6b0ab10';
import { createGarden, listPlotKeys } from '../public/js/garden.js?v=dd021ecc';
import { runVerb } from '../public/content.js?v=2e6bc3fd';

const here = dirname(fileURLToPath(import.meta.url));
const PUB = join(here, '../public');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUB, 'assets/content'));
});

function accepted(...ids) {
  const qs = createQuestState();
  for (const id of ids) assert.equal(acceptOffer(qs, id, { inv: {}, now: 1_000 }).ok, true, id);
  return qs;
}
const route = (qs, event, amount = 1) => routeQuestEvent(qs, event, amount, { managedOnly: true, now: 2_000 });
const progress = (qs, id, name) => qs.active[id]?.progress?.[name] ?? 0;

/** A plot target the way game.js spawnGarden registers one (detached: a home cultivation). */
function plotTarget(gardenType, plot, { detached = false } = {}) {
  const garden = createGarden({ cols: 3, rows: 2, gardenType });
  const key = listPlotKeys(garden)[0];
  Object.assign(garden.plots[key], plot);
  const gardenEntity = { classId: 'garden_new', state: { garden, plotTargets: [], detached } };
  return { classId: 'garden_plot', label: `Plot ${key}`, state: { garden, plotKey: key, plot: garden.plots[key], gardenEntity } };
}
const ctxFor = (inv) => ({
  pc: { energy: 500, mood: 500, xp: 0, level: 20 },
  inv,
  skills: { learned: ['croppery_1', 'herbalism_1'] },
  tools: { condition: {} },
  rng: () => 0.99,
});

describe('a plot verb done by hand counts like include/garden.js (ticket 68)', () => {
  it('picking potatoes and tomatoes counts Tater \'n\' Mater (garden.js 532)', () => {
    const id = 'croppery_harvest_and_sell_at_auction';
    const qs = accepted(id, 'croppery_harvest_all_crops');
    for (const seed of ['seed_potato', 'seed_tomato']) {
      const target = plotTarget('default', { state: 'crop', seed });
      const res = runVerb(target, 'harvest', ctxFor({ hoe: 1, watering_can: 1 }));
      assert.equal(res.ok, true, res.msgs?.join(' '));
      assert.equal(res.gardenPlot.verb, 'harvest');
      assert.equal(res.gardenPlot.home, false);
      const rows = gardenPlotEvents(res.gardenPlot, 'LSTREET');
      const crop = seed.replace('seed_', '');
      assert.deepEqual(rows.map((r) => r.event), [`garden_harvest:${crop}`, 'garden_plots_picked:LSTREET_default']);
      assert.equal(rows[0].amount, res.gardenPlot.count);
      assert.ok(res.gardenPlot.count >= 1);
      for (const row of rows) route(qs, row.event, row.amount);
      assert.equal(progress(qs, id, `garden_harvest_${crop}`), res.gardenPlot.count);
      assert.equal(progress(qs, 'croppery_harvest_all_crops', `garden_harvest_${crop}`), 1);
    }
  });

  it('a home garden counts the same (the plots on your home street, online or solo)', () => {
    const id = 'croppery_harvest_and_sell_at_auction';
    const qs = accepted(id);
    const res = runVerb(plotTarget('default', { state: 'crop', seed: 'seed_tomato' }, { detached: true }), 'harvest', ctxFor({}));
    assert.equal(res.gardenPlot.home, true);
    for (const row of gardenPlotEvents(res.gardenPlot, 'RH_HOME_EXT')) route(qs, row.event, row.amount);
    assert.equal(progress(qs, id, 'garden_harvest_tomato'), res.gardenPlot.count);
  });

  it('Shucks To Be You: planting and picking herbs by hand, after the 6 seeds (garden.js 388-392, 535-541)', () => {
    const id = 'herbalism_harvest_shuck_and_plant_herbs';
    const qs = accepted(id);
    route(qs, 'herb_seeds_extracted:herb_seed_gandlevery', 6);
    const inv = { herb_seed_gandlevery: 6 };
    for (let i = 0; i < 6; i += 1) {
      const res = runVerb(plotTarget('herb', { state: 'clean' }, { detached: true }), 'plant', ctxFor(inv));
      assert.equal(res.ok, true, res.msgs?.join(' '));
      assert.equal(res.gardenPlot.seedId, 'herb_seed_gandlevery');
      const rows = gardenPlotEvents(res.gardenPlot, 'RH_HOME_EXT');
      // Your own garden: no herb_seeds_planted_for_others (garden.js 394: a POL you own).
      assert.deepEqual(rows.map((r) => r.event), ['garden_herb_plots_planted:RH_HOME_EXT_herb', 'herb_seed_planted:herb_seed_gandlevery']);
      for (const row of rows) route(qs, row.event, row.amount);
    }
    assert.equal(progress(qs, id, 'herb_seeds_planted_shucks'), 6);
    const pick = runVerb(plotTarget('herb', { state: 'crop', seed: 'herb_seed_gandlevery' }, { detached: true }), 'harvest', ctxFor({}));
    assert.equal(pick.ok, true, pick.msgs?.join(' '));
    for (const row of gardenPlotEvents(pick.gardenPlot, 'RH_HOME_EXT')) route(qs, row.event, row.amount);
    assert.equal(progress(qs, id, 'harvest_herb_shucks'), 1);
  });

  it('an herb planted in a street garden counts for The Philantherbist (garden.js 394-396)', () => {
    const id = 'herbalism_plant_seeds_in_someones_garden';
    const qs = accepted(id);
    const res = runVerb(plotTarget('herb', { state: 'clean' }), 'plant', ctxFor({ herb_seed_rubeweed: 1 }));
    const rows = gardenPlotEvents(res.gardenPlot, 'GA97L62229522GS');
    assert.ok(rows.some((r) => r.event === 'herb_seeds_planted_for_others'));
    for (const row of rows) route(qs, row.event, row.amount);
    assert.equal(progress(qs, id, 'herb_seeds_planted_for_others'), 1);
  });

  it('watering and clearing count the garden badges, a failed verb nothing', () => {
    assert.deepEqual(gardenPlotEvents({ verb: 'water', gardenType: 'default' }, 'S'), [{ event: 'garden_plots_watered:S_default', amount: 1 }]);
    assert.deepEqual(gardenPlotEvents({ verb: 'clear', gardenType: 'herb' }, 'S'), [{ event: 'garden_plots_hoed:S_herb', amount: 1 }]);
    assert.deepEqual(gardenPlotEvents({ verb: 'harvest', gardenType: 'herb', cropId: 'rubeweed', count: 4, superHarvest: true }, 'S').map((r) => r.event),
      ['herb_harvest:rubeweed', 'garden_plots_picked:S_herb', 'herb_super_harvest:rubeweed']);
    const res = runVerb(plotTarget('default', { state: 'clean' }), 'harvest', ctxFor({}));
    assert.equal(res.ok, false);
    assert.equal(res.gardenPlot, undefined);
  });

  it('game.js sends a plot verb\'s counters through the badge path, and the garden panel uses the same list', () => {
    const game = read('game.js');
    assert.match(game, /if \(result\.gardenPlot\) \{\n\s+for \(const row of gardenPlotEvents\(result\.gardenPlot, currentStreet\?\.tsid \|\| 'street'\)\) \{\n\s+announceAchievementUpdates\(applyAchievementProgress\(achieveState, row\.event, row\.amount, pc\)\);/);
    assert.match(game, /const plotEvents = gardenPlotEvents\(\{ verb: action,/);
    assert.doesNotMatch(game, /emitGameEvent\(`herb_seed_planted:/);
    assert.match(game, /state: \{ garden, plotTargets: \[\], detached: Boolean\(opts\.detached\) \}/);
  });
});
