/**
 * G953 (#436): every Super Harvest shows its bonus on its own line, "Super Harvest! +N <items>",
 * while the verb's own line counts the ordinary yield, so the float, the notice and the log add up
 * to what reached the pack. Glitch granted the bonus apart, with that line (createItemFromOffsetDelayed,
 * players/inc_items.js 379-452): include/garden.js 486-498, include/trants.js 281-290,
 * npc_piggy.js 1590-1601, jellisac.js 182-193.
 * Run: node --test tests/g953-super-harvest-lines.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVerb, ordinaryItems } from '../public/content.js?v=68a61ef7';
import { createGarden, getPlot } from '../public/js/garden.js?v=fefa7bcd';
import { createTrantState } from '../public/js/trants.js?v=cf0fe1a3';
import { superHarvestWords } from '../public/js/words.js?v=274023af';

const here = dirname(fileURLToPath(import.meta.url));
const pc = (seed = {}) => ({ energy: 300, mood: 40, imagination: 0, xp: 0, ...seed });
const itemsIn = (line) => [...String(line).matchAll(/\+(\d+) ([A-Z][\w ]+)/g)].map((m) => Number(m[1]));

describe('Super Harvest lines (G953)', () => {
  it('words: the bonus only, the plural past one, no period, no multiplier', () => {
    assert.equal(superHarvestWords(6, 'Sprig of Silvertongue', 'Sprigs of Silvertongue'), 'Super Harvest! +6 Sprigs of Silvertongue');
    assert.equal(superHarvestWords(1, 'Cherry', 'Cherries'), 'Super Harvest! +1 Cherry');
  });

  it('ordinaryItems leaves out the bonus share', () => {
    assert.deepEqual(ordinaryItems({ items: { meat: 8, guano: 1 }, superItems: { meat: 6 } }), { meat: 2, guano: 1 });
    assert.deepEqual(ordinaryItems({ items: { meat: 6 }, superItems: { meat: 6 } }), {});
    assert.deepEqual(ordinaryItems({ items: { meat: 2 } }), { meat: 2 });
  });

  it('an herb plot: the pick line counts the pick, the super line the bonus (#436)', () => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0, gardenType: 'herb' });
    garden.gardenType = 'herb';
    Object.assign(getPlot(garden, '1-1'), { state: 'crop', seed: 'herb_seed_silvertongue' });
    const target = { classId: 'garden_plot', state: { garden, plotKey: '1-1', plot: getPlot(garden, '1-1') } };
    const inv = {};
    const r = runVerb(target, 'harvest', { pc: pc({ imaginationUpgrades: ['herbalism_super_harvest_2'] }), inv, skills: { learned: ['herbalism_1', 'herbalism_2', 'herbalism_3'] }, sharedGarden: true, rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.gardenPlot.superHarvest, true, 'a Super Harvest');
    const { baseCount, count } = r.gardenPlot;
    const bonus = count - baseCount;
    assert.equal(inv.silvertongue, count, 'the pack has the whole pick');
    assert.deepEqual(itemsIn(r.effects.activityLine), [baseCount], 'the notice counts the pick');
    assert.equal(r.effects.superLine, `Super Harvest! +${bonus} Sprigs of Silvertongue`);
    assert.equal(r.msgs.at(-1), r.effects.superLine, 'the super line floats after the pick');
    assert.equal(r.msgs.filter((m) => /Super Harvest/.test(m)).length, 1, 'said once');
  });

  it('a fruit tree: "Harvested N" and the bonus line add up to the pack', () => {
    const target = { classId: 'trant_fruit', state: createTrantState('trant_fruit', { fruitCount: 20 }) };
    const inv = {};
    const r = runVerb(target, 'harvest', { pc: pc(), inv, skills: { learned: ['arborology_1'] }, imaginationUpgrades: ['gardening_tree_super_harvest_1'], rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.harvest.superHarvest, true);
    const { baseAmount, superAmount, amount } = r.harvest;
    assert.equal(inv.cherry, amount);
    assert.ok(r.msgs.includes(`Harvested ${baseAmount} Cherries.`), r.msgs.join(' | '));
    assert.deepEqual(itemsIn(r.effects.activityLine), [baseAmount]);
    assert.equal(r.effects.superLine, superHarvestWords(superAmount, 'Cherry', 'Cherries'));
    assert.doesNotMatch(r.msgs.join(' '), /×|SUPER harvest/);
  });

  it('a Piggy nibble: the ordinary Meat in the line, the bonus Meat on its own', () => {
    const target = { classId: 'npc_piggy', state: {} };
    const inv = {};
    const player = pc();
    const skills = { learned: ['animalkinship_1', 'animalkinship_2', 'animalkinship_3', 'animalkinship_4'] };
    assert.equal(runVerb(target, 'pet', { pc: player, inv, skills, rng: () => 0.5 }).ok, true);
    const r = runVerb(target, 'nibble', { pc: player, inv, skills, rng: () => 0 });
    assert.equal(r.ok, true);
    assert.equal(r.animalKinship.superHarvest, true);
    const bonus = r.animalKinship.superBonus;
    assert.ok(bonus > 0);
    assert.equal(inv.meat, r.animalKinship.itemCount);
    assert.deepEqual(itemsIn(r.effects.activityLine), [r.animalKinship.itemCount - bonus]);
    assert.equal(r.effects.superLine, superHarvestWords(bonus, 'Meat', 'Meats'));
  });

  it('game.js logs the super line and floats only the ordinary items', () => {
    const src = readFileSync(join(here, '../public/game.js'), 'utf8');
    assert.match(src, /result\.effects\?\.superLine\) logGain\(result\.effects\.superLine\)/);
    assert.match(src, /Object\.entries\(ordinaryItems\(result\.effects\)\)/);
  });
});
