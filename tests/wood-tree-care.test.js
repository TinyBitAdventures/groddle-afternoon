/**
 * Wood Tree care on Glitch's clocks (rules-a audit #14): each player pets and waters a Wood Tree
 * once every 5 minutes, not once a game day, and the care counts where it lands, on a street, in a
 * Patch or in a hollow, and online on the server for everyone.
 *
 * Source: items/wood_tree.js canPet / canWater 614-640 (5*60 s per player), onTendComplete 955-1010
 * (petted_count / watered_count, onNeedsReset 10 minutes on, maturityMap 889-896 checked at
 * 1005-1007), plusMaturity 1091-1095, refusals 525 / 564.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { performTrantCare, quoteTrantCare } from '../public/js/trant-care.js?v=6ee0b0f5';
import {
  WOOD_TREE_CARE,
  adoptPlotWoodCounts,
  ensureWoodTreeState,
  noteWoodCare,
  resetWoodTreeDay,
  woodCareWait,
} from '../public/js/woodcutting.js?v=ee35a30a';
import { createToolConditionState } from '../public/js/tools.js?v=48542c24';
import { applyWoodState } from '../public/js/street-objects.js?v=42cbd49f';
import { applyYardAct, treeActs, treeSnapshot, visitorTreeState } from '../public/js/yard-verbs-mp.js?v=1a8d6060';
import { fertilizeTree } from '../public/js/powders.js?v=6f3d6671';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** One care attempt the way content.js runs it, with a fixed roll and clock. */
function tend(state, kind, at, roll = 0, extra = {}) {
  const pc = { energy: 100, mood: 50, moodMax: 100, xp: 0 };
  return performTrantCare(state, 'wood_tree', kind, {
    pc,
    inv: { watering_can: 1 },
    tools: createToolConditionState({ watering_can: 1 }),
    learned: [],
    rng: () => roll,
    now: at,
    ...extra,
  });
}

describe('Wood Tree care clocks (wood_tree.js canPet / canWater 614-640)', () => {
  it('lets the same player pet and water again after 5 minutes, not after a game day', () => {
    assert.equal(WOOD_TREE_CARE.intervalMs, 300000);
    assert.equal(WOOD_TREE_CARE.needsResetMs, 600000);
    const s = { maturity: 3 };
    assert.equal(tend(s, 'pet', 1000).ok, true);
    const again = tend(s, 'pet', 1000 + 299999);
    assert.deepEqual([again.ok, again.msg], [false, "I don't want to be petted right now!"]);
    assert.equal(woodCareWait(s, 'pet', 1000 + 299999), 1);
    assert.equal(tend(s, 'pet', 1000 + 300000).ok, true);
    assert.equal(tend(s, 'water', 2000).ok, true);
    assert.equal(tend(s, 'water', 3000).msg, "I don't want to be watered right now!");
  });

  it('a failed roll spends nothing, counts nothing and starts no clock', () => {
    const s = { maturity: 2 };
    const r = tend(s, 'pet', 1000, 0.85); // no skill: 80%
    assert.equal(r.reason, 'failed');
    assert.deepEqual([s.carePets || 0, s.petAt || 0], [0, 0]);
    assert.equal(tend(s, 'pet', 1001).ok, true);
  });

  it('grows a fresh Wood Tree from maturity 1 to 6 in 20 rounds of care, about 95 minutes, not 20 game days', () => {
    const s = { maturity: 1 };
    const grewAt = [];
    for (let k = 0; k < 20; k += 1) {
      tend(s, 'pet', k * 300000);
      if (tend(s, 'water', k * 300000 + 1).woodCare === 'grew') grewAt.push(k);
    }
    assert.equal(s.maturity, 6);
    assert.deepEqual(grewAt, [1, 4, 8, 13, 19]);
  });

  it('Fertilidust grows it through plusMaturity, which starts the counts over (wood_tree.js 870-874, 1091-1095)', () => {
    const s = { maturity: 3, harvestCount: 1, carePets: 2, careWaters: 3 };
    assert.equal(fertilizeTree('wood_tree', s), true);
    assert.deepEqual([s.maturity, s.harvestCount, s.carePets, s.careWaters], [4, 0, 0, 0]);
  });

  it('a new game day resets only the harvest', () => {
    const s = ensureWoodTreeState({ maturity: 4, harvestedToday: true, petAt: 5000, carePets: 2, petted: true });
    resetWoodTreeDay(s);
    assert.deepEqual([s.harvestedToday, s.petAt, s.carePets, s.petted], [false, 5000, 2, true]);
  });

  it('online the server counts: a granted verb keeps only this player\'s clock', () => {
    const s = { maturity: 1, carePets: 1, careWaters: 1, petted: true, watered: true, needsResetAt: 9e12 };
    const r = tend(s, 'pet', 5000, 0, { woodCareShared: true });
    assert.equal(r.ok, true);
    assert.equal(r.woodCare, null);
    assert.deepEqual([s.maturity, s.carePets, s.petAt], [1, 1, 5000]);
    // The server's state lands on top and keeps the clock.
    applyWoodState(s, { maturity: 2, count: 0, pets: 0, waters: 0, petted: true, watered: true });
    assert.deepEqual([s.maturity, s.carePets, s.petAt], [2, 0, 5000]);
  });
});

describe('saves from the daily model migrate without blocking', () => {
  it('old daily marks never refuse a pet or water, and keep the tree\'s maturity', () => {
    const s = ensureWoodTreeState({ maturity: 4, petted: true, watered: true, harvestedToday: true });
    assert.equal(s.maturity, 4);
    assert.deepEqual([s.petted, s.watered, s.petAt, s.waterAt], [false, false, 0, 0]);
    assert.equal(quoteTrantCare(s, 'wood_tree', 'pet', { pc: { energy: 50 }, now: 1 }).ok, true);
    // One mark alone waits for the other, as been_petted did.
    const half = ensureWoodTreeState({ maturity: 4, petted: true });
    assert.equal(half.petted, true);
    assert.equal(quoteTrantCare(half, 'wood_tree', 'pet', { pc: { energy: 50 }, now: 1 }).ok, true);
  });

  it('a Patch or hollow record\'s counts move onto the state', () => {
    const rec = adoptPlotWoodCounts({ woodPetted: 3, woodWatered: 1, seenPetted: true, seenHarvests: 2, state: { maturity: 3 } });
    assert.deepEqual([rec.state.carePets, rec.state.careWaters], [3, 1]);
    assert.deepEqual(Object.keys(rec), ['state']);
  });

  it('a growth step counts as it lands, with heal_trant and maxed for every home', () => {
    const game = read('public/game.js');
    assert.match(game, /woodCareShared: Boolean\(sharedGrant\) && target\.classId === 'wood_tree'/);
    assert.match(game, /result\.trantCare\?\.woodCare === 'grew' \|\| sharedMatured/);
    assert.doesNotMatch(game, /GAME_MODE !== 'multiplayer'\s*&& noteWoodCare/);
    assert.doesNotMatch(read('public/js/patches.js'), /export function noteWoodTreeCare/);
    assert.doesNotMatch(read('public/js/features/enchanted-forest-feature.js'), /noteWoodTreeCare|wood_tree:maxed/);
    assert.doesNotMatch(read('public/js/features/patches-feature.js'), /wood_tree:maxed/);
  });

  it('a street Wood Tree\'s pet and water ask the server online', () => {
    const feature = read('public/js/features/street-objects-feature.js');
    assert.match(feature, /verbId !== 'pet' && verbId !== 'water'\) return null;\n\s+\/\/ A street Wood Tree's care counts on the server/);
    assert.match(feature, /matured: msg\.matured === true/);
    assert.match(read('public/js/features/shared-patches-feature.js'), /out\.matured = treeGrant\.matured/);
  });
});

describe('a visitor\'s care on a home Wood Tree (yard-verbs-mp)', () => {
  it('each pet every 5 minutes is an act, and it counts on the owner\'s tree without the owner\'s clock', () => {
    const owner = { plots: { 'patch:1': { stage: 'tree', tree: { classId: 'wood_tree', resetAt: 0, state: { maturity: 1, petAt: 77 } } } } };
    const copy = visitorTreeState(owner.plots['patch:1'], 'patch:1', {}, 1000);
    assert.equal(copy.petAt, 0, 'the owner\'s clock is not the visitor\'s');
    const before = treeSnapshot(copy);
    tend(copy, 'pet', 1000);
    const mid = treeSnapshot(copy);
    assert.deepEqual(treeActs(before, mid), ['pet']);
    tend(copy, 'pet', 301000);
    assert.deepEqual(treeActs(mid, treeSnapshot(copy)), ['pet'], 'a second pet five minutes on is an act too');
    const act = (n, verb, at) => ({ id: `yd-00000000000000c${n}`, from: { id: 9, name: 'Bo' }, kind: 'tree', target: 'patch:1', verb, took: 0, at });
    applyYardAct(owner, act(1, 'pet', 1000));
    applyYardAct(owner, act(2, 'water', 1001));
    applyYardAct(owner, act(3, 'pet', 301000));
    applyYardAct(owner, act(4, 'water', 301001));
    const s = owner.plots['patch:1'].tree.state;
    assert.deepEqual([s.maturity, s.carePets, s.petAt], [2, 0, 77]);
  });
});

describe('the server counts Wood Tree care as the game does (testdata/wood-care.json)', { skip: skipWithoutServer }, () => {
  it('replays every case through performTrantCare with each player\'s own clock', () => {
    const cases = JSON.parse(readFileSync(serverPath('testdata', 'wood-care.json'), 'utf8'));
    assert.ok(cases.length >= 5);
    const base = 1_800_000_000_000;
    for (const c of cases) {
      const state = ensureWoodTreeState({ maturity: c.maturity });
      const clocks = new Map();
      c.steps.forEach((s, i) => {
        const mine = clocks.get(s.who) || { petAt: 0, waterAt: 0 };
        state.petAt = mine.petAt;
        state.waterAt = mine.waterAt;
        const r = tend(state, s.verb, base + s.at, s.roll);
        const got = r.ok ? (r.woodCare === 'grew' ? 'grew' : 'ok') : r.reason === 'failed' ? 'failed' : r.reason === 'cooldown' ? 'not_wanted' : r.reason;
        assert.equal(got, s.expect, `${c.name}: step ${i} (${s.verb} by ${s.who} at ${s.at})`);
        clocks.set(s.who, { petAt: state.petAt, waterAt: state.waterAt });
      });
      assert.deepEqual(
        { maturity: state.maturity, pets: state.carePets, waters: state.careWaters, petted: state.petted, watered: state.watered },
        c.end,
        c.name,
      );
    }
  });

  it('the server data carries the Wood Tree care rates and maturityMap', () => {
    const rules = JSON.parse(readFileSync(serverPath('data', 'objects.json'), 'utf8')).rules;
    assert.deepEqual(rules.woodMap, [2, 3, 4, 5, 6, 0]);
    assert.deepEqual([rules.woodCare.pet.no_skill, rules.woodCare.water.no_skill], [80, 90]);
  });
});
