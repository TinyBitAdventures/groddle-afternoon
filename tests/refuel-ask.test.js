/**
 * Report #557: Fuel Cells went into an empty machine room machine when the player never chose Refuel.
 * At an empty tank Use is off, so the menu's lit row (the first one that can be done) was Refuel, a
 * one-press spend: Enter held past the keyboard's repeat delay opened the menu and its repeat pressed
 * that row (a held digit pressed its row again and again), the phone's Act chooses the lit row, and
 * "Refuel with N cells" spent them all on one press. machine_base refuel (metalmaker.js 502-620) was
 * never a one-press spend: requires_target_item, the Fuel Cell picked first. Now Refuel asks how many
 * (one to start) and spends nothing until OK (the held key: tests/held-key-menu.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REFUEL_COUNT_TITLE, machineTank, refuelCount, roomMachineVerbs } from '../public/js/machine-rooms.js?v=4b6ade29';
import { normalizeMachine, placedMachineVerbs } from '../public/js/home-machines.js?v=1fc98bd9';
import { refuelMachine } from '../public/js/machines.js?v=93a736f2';
import { createInventory, countItem } from '../public/js/inventory.js?v=3be7988a';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js?v=4156bba8';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=396a928f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const empty = (cls) => machineTank({ condition: { [cls]: { remaining: 0 } } }, cls);
const lit = (verbs) => verbs.find((v) => v.enabled !== false);

describe('#557: Refuel asks how many before a Fuel Cell goes in', () => {
  it('an empty room machine lights Refuel, which only opens How many? (no one-press fill row)', () => {
    const verbs = roomMachineVerbs('metalmaker', empty('metalmaker'), { learned: ['metalwork_1'], fuelCells: 3 });
    assert.equal(verbs.find((v) => v.id === 'use').enabled, false);
    const first = lit(verbs);
    assert.equal(first.id, 'refuel');
    assert.deepEqual(first.count, { max: 3, start: 1, title: REFUEL_COUNT_TITLE, verb: 'Refuel' });
    assert.ok(!verbs.some((v) => v.id === 'refuel_all' || /Refuel with/.test(v.label)), 'no row spends cells on one press');
    // Even one cell asks (the step is the safety, as Glitch's target-item step was).
    const one = roomMachineVerbs('metalmaker', empty('metalmaker'), { learned: ['metalwork_1'], fuelCells: 1 });
    assert.equal(lit(one).count.max, 1);
    // A refused Refuel asks nothing.
    assert.equal(roomMachineVerbs('metalmaker', empty('metalmaker'), { fuelCells: 0 }).find((v) => v.id === 'refuel').count, undefined);
  });

  it('a placed machine in a Community Machine Room asks the same', () => {
    const m = normalizeMachine({ id: 'hm-00000000000000ab', class: 'metalmaker', rx: 300, fuel: 0, music: true, job: null, waiting: [] });
    const verbs = placedMachineVerbs(m, { me: '9', mayTake: false, learned: ['metalwork_1'], fuelCells: 3, now: 5000 });
    assert.equal(lit(verbs).id, 'refuel');
    assert.equal(lit(verbs).count.max, 3);
    assert.deepEqual(verbs.map((v) => v.id).sort(), ['refuel', 'use']);
  });

  it('OK runs refuel:<n>; n cells go in, cut to what fits and what you carry', () => {
    assert.deepEqual(['refuel', 'refuel:2', 'refuel:0', 'refuel_all', 'use'].map(refuelCount), [1, 2, 1, 0, 0]);
    const inv = createInventory({ fuel_cell: 3 });
    const tools = createToolConditionState({ condition: { metalmaker: { remaining: 0 } } });
    assert.equal(refuelMachine(inv, tools, 'metalmaker', { count: 2 }).cells, 2);
    assert.equal(getToolCondition(tools, 'metalmaker').remaining, 100);
    assert.equal(countItem(inv, 'fuel_cell'), 1);
    assert.equal(refuelMachine(inv, tools, 'metalmaker', { count: 9 }).cells, 1);
    assert.equal(refuelMachine(inv, tools, 'metalmaker').reason, 'cells');
  });

  it("a machine in the pack asks too (the pack's How many, not cut to the one machine)", () => {
    supplyFeature._reset();
    const engine = { inv: createInventory({ woodworker: 1, fuel_cell: 3 }), pc: { energy: 100 }, toolState: createToolConditionState({ condition: { woodworker: { remaining: 0 } } }), learnedSkills: [], param: () => null };
    const verbs = supplyFeature.packVerbs('woodworker', engine);
    const refuel = verbs.find((v) => v.id === 'refuel');
    assert.deepEqual(refuel.count, { max: 3, verb: 'Refuel', plural: 'Fuel Cells', idPrefix: 'refuel', ofStack: false });
    assert.ok(!refuel.primary && !verbs.some((v) => v.id === 'refuel:all'));
    assert.equal(supplyFeature.runPackVerb('woodworker', 'refuel:2', engine), true);
    assert.equal(countItem(engine.inv, 'fuel_cell'), 1);
    assert.equal(getToolCondition(engine.toolState, 'woodworker').remaining, 100);
  });

  it('game.js opens the count for a verb row with count, and the pack counts a machine\'s cells', () => {
    const game = read('game.js');
    assert.match(game, /else if \(asks\) openVerbCount\(target, v\);/);
    assert.match(game, /function openVerbCount\(target, verb\) \{[\s\S]*?requestVerb\(target, \{ \.\.\.verb, id: `\$\{verb\.id\}:\$\{n\}`/);
    assert.match(game, /countVerb\.count\.ofStack === false \? Infinity : stackCount/);
    for (const f of ['features/machine-rooms-feature.js', 'features/home-machines-feature.js']) {
      const src = read(`js/${f}`);
      assert.match(src, /refuelCount\(verbId\)/, f);
      assert.ok(!src.includes("'refuel_all'"), f);
    }
  });
});
