/**
 * G1305 (report #695, Austin 2026-11-25): every plot opened a verb menu on a click or a tap, so each
 * plot was two taps. Glitch ran the plot's best action on one click and asked only what to plant:
 * glitch-client view/ui/garden/GardenView.as onPlotClick 454-538, and Enter while tending did the same
 * (onKeyDown 657-660). Ours: js/garden.js plotClickAction picks the action in Glitch's order and
 * game.js clickGardenPlot runs it through the verb path (a shared bed asks the realtime server), for a
 * click on the street, a tap on a phone, Enter and E while tending and Act's lift while tending.
 * Run: node --test tests/garden-plot-click.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GARDEN_HOUR_MS,
  GARDEN_WATER_MS,
  PLOT_CLICK_LINES,
  createEmptyPlot,
  plotClickAction,
  sowPlot,
  wetPlot,
} from '../public/js/garden.js?v=a7c6f521';
import { createInventory } from '../public/js/inventory.js?v=6414dbdc';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

const NOW = 1_800_000_000_000;
const plot = (state, { wet = false, wetAgoMs = 0, fertilized = false } = {}) => {
  const p = createEmptyPlot(NOW - 1000);
  if (state === 'seeds' || state === 'shoots' || state === 'crop') {
    sowPlot(p, 'seed_spinach', NOW - 1000);
    p.state = state;
  } else p.state = state;
  if (wet) wetPlot(p, NOW - wetAgoMs);
  if (fertilized) p.fertilized = true;
  return p;
};
const pick = (p, inv, opts = {}) => plotClickAction(p, inv, { now: NOW, ...opts }).action;
const line = (p, inv, opts = {}) => plotClickAction(p, inv, { now: NOW, ...opts }).line;
const all = () => createInventory({ watering_can: 1, hoe: 1, seed_spinach: 2, guano: 1 });
const none = () => createInventory({});

describe('G1305: a plot click\'s best action, in GardenView.as onPlotClick\'s order (476-528)', () => {
  it('a ripe plot is picked, with or without tools (476-488)', () => {
    assert.equal(pick(plot('crop'), all()), 'harvest');
    assert.equal(pick(plot('crop'), none()), 'harvest');
  });

  it('a dirty plot is hoed when a Hoe is in the pack, else nothing and the plot card\'s red tip (490-492)', () => {
    assert.equal(pick(plot('dirty'), all()), 'clear');
    assert.equal(pick(plot('dirty'), createInventory({ high_class_hoe: 1 })), 'clear', 'HOE_TOOLS: a High Class Hoe too');
    assert.equal(pick(plot('dirty'), none()), null);
    assert.equal(line(plot('dirty'), none()), PLOT_CLICK_LINES.noHoe);
    assert.equal(PLOT_CLICK_LINES.noHoe, 'You need a Hoe!', 'GardenPlotDetails.as 127-129');
  });

  it('a depleted garden\'s empty plot does nothing (494-497)', () => {
    assert.equal(pick(plot('clean', { wet: true }), all(), { garden: { depleted: true } }), null);
    assert.equal(pick(plot('clean'), all(), { garden: { depleted: true } }), null);
    assert.equal(pick(plot('crop'), all(), { garden: { depleted: true } }), 'harvest');
  });

  it('an empty wet plot asks what to plant, only with seeds of the bed\'s kind (498-513)', () => {
    assert.equal(pick(plot('clean', { wet: true }), all()), 'plant');
    assert.equal(pick(plot('clean', { wet: true }), createInventory({ seed_spinach: 1 })), 'plant', 'no tools needed to plant');
    assert.equal(pick(plot('clean', { wet: true }), createInventory({ watering_can: 1 })), null);
    assert.equal(line(plot('clean', { wet: true }), createInventory({ watering_can: 1 })), "You don't have any seeds to plant!");
    // An herb bed takes herb seeds (getItemTsidsByTags(type+'_seed')): crop seeds there are no seeds.
    assert.equal(pick(plot('clean', { wet: true }), all(), { gardenType: 'herb' }), null);
    assert.equal(line(plot('clean', { wet: true }), all(), { gardenType: 'herb' }), PLOT_CLICK_LINES.noSeeds);
    assert.equal(pick(plot('clean', { wet: true }), createInventory({ herb_seed_rubeweed: 1 }), { gardenType: 'herb' }), 'plant');
    // A wetting that has run out is a dry plot (water_time 0): it takes water first.
    assert.equal(pick(plot('clean', { wet: true, wetAgoMs: GARDEN_WATER_MS + 1 }), all()), 'water');
  });

  it('an empty dry plot, or a dry or thirsty growing one, takes water when a Watering Can is in the pack (517-520)', () => {
    assert.equal(pick(plot('clean'), all()), 'water', 'water_time 0 falls through to doesPlotNeedWater');
    assert.equal(pick(plot('seeds'), all()), 'water');
    assert.equal(pick(plot('shoots'), all()), 'water');
    assert.equal(pick(plot('seeds'), createInventory({ irrigator_9000: 1 })), 'water', 'WATER_TOOLS: an Irrigator 9000 too');
    // doesPlotNeedWater 540-543: water again once it has lost the threshold (an hour) of its watering.
    assert.equal(pick(plot('seeds', { wet: true, wetAgoMs: GARDEN_HOUR_MS + 1000 }), createInventory({ watering_can: 1 })), 'water');
    assert.equal(pick(plot('seeds', { wet: true, wetAgoMs: 1000 }), createInventory({ watering_can: 1 })), null);
    assert.equal(pick(plot('clean'), createInventory({ seed_spinach: 1 })), null, 'a dry plot is not planted on a click');
    assert.equal(line(plot('seeds'), none()), 'Get a Watering Can!', 'GardenPlotDetails.as 166-168');
  });

  it('a shared bed waters dry plots only (the realtime server\'s rule)', () => {
    const thirsty = plot('seeds', { wet: true, wetAgoMs: 2 * GARDEN_HOUR_MS });
    assert.equal(pick(thirsty, all(), { garden: { shared: true } }), 'fertilize', 'wet: Guano next, not water');
    assert.equal(pick(plot('seeds'), all(), { garden: { shared: true } }), 'water');
  });

  it('a watered seed or shoot takes Guano once 80% watered and not fertilized (521-528)', () => {
    const guano = createInventory({ guano: 1 });
    assert.equal(pick(plot('seeds', { wet: true, wetAgoMs: 1000 }), guano), 'fertilize');
    assert.equal(pick(plot('shoots', { wet: true, wetAgoMs: 1000 }), guano), 'fertilize');
    assert.equal(pick(plot('shoots', { wet: true, wetAgoMs: 1000, fertilized: true }), guano), null);
    assert.equal(pick(plot('seeds', { wet: true, wetAgoMs: 1000 }), none()), null, 'no Guano: nothing to do');
    // Water comes first: a thirsty plot with Guano and a can is watered.
    assert.equal(pick(plot('seeds', { wet: true, wetAgoMs: GARDEN_HOUR_MS + 1000 }), all()), 'water');
  });

  it('nothing to do is nothing (530-535: CLICK_FAILURE, no line)', () => {
    assert.deepEqual(plotClickAction(plot('seeds', { wet: true, wetAgoMs: 1000 }), none(), { now: NOW }), { action: null, line: '' });
    assert.deepEqual(plotClickAction(null, all(), { now: NOW }), { action: null, line: '' });
  });
});

describe('G1305: game.js runs a plot\'s best action on a click, a tap, Enter and Act while tending', () => {
  const fn = game.slice(game.indexOf('function clickGardenPlot(target)'), game.indexOf('/** #695: the stick\'s arrows stepping plots'));

  it('a click or a tap on a plot goes to clickGardenPlot, not the menu (worldPress)', () => {
    assert.match(game, /\/\/ G1305[^\n]*\n\s+if \(best\.classId === 'garden_plot' && !features\.query\('homeEditMode', engine\)\) \{\n\s+clickGardenPlot\(best\);\n\s+return;\n\s+\}\n\s+const one = /);
  });

  it('Enter, E and Act\'s lift while tending act on the lit plot as its click (GardenView.as 657-660)', () => {
    assert.match(game, /if \(action === 'tend'\) \{\n[^\n]*\n\s+const plot = gardenTendPlot\(\);\n\s+if \(plot && !currentAction\) clickGardenPlot\(plot\);/);
    assert.match(game, /choose\(\) \{\n\s+const plot = gardenTendPlot\(\);\n\s+if \(plot && !currentAction\) clickGardenPlot\(plot\);/);
    assert.doesNotMatch(game, /if \(plot && !currentAction\) openVerbMenu\(plot\);/, 'no tending path opens the plot menu');
  });

  it('clickGardenPlot: the choice, then the verb path (requestVerb), the seed menu for planting, the failure sound', () => {
    assert.ok(fn.length > 200, 'clickGardenPlot is there');
    assert.match(fn, /plotClickAction\(getPlot\(garden, target\.state\?\.plotKey\), inv, \{ garden \}\)/);
    assert.match(fn, /menuVerbsFor\(target\)\.find\(\(v\) => v\?\.id === pick\.action\)/);
    assert.match(fn, /if \(!verb\) return openVerbMenu\(target\);/);
    assert.match(fn, /if \(verb\.enabled === false\) return fail\(verb\.reason \|\| pick\.line\);/);
    assert.match(fn, /if \(pick\.action !== 'plant'\) return requestVerb\(target, verb\);/);
    assert.match(fn, /openVerbPickLevel\(target, \{ \.\.\.verb, picker: 'plant' \}, null\)/, 'the seed menu even for one kind of seed');
    assert.match(fn, /playSound\('CLICK_FAILURE'/);
  });

  it('a right-click still opens the plot\'s full menu (RIGHTCLICK)', () => {
    const rc = game.slice(game.indexOf('function worldRightClick(e)'), game.indexOf('function worldRightClick(e)') + 3000);
    assert.doesNotMatch(rc, /clickGardenPlot/);
  });
});
