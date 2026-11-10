// A broken tool is never stuck (Austin 2026-11-02, a broken Pick with too little energy to mend):
// the original repaired as far as the energy went (tinkertool.js onTick 405-445, endRepair 337-372),
// and any vendor or shrine took a tool at its worn worth (tool_base.js getBaseCost 548-556,
// inc_stores.js storeSell, include/shrines.js 397).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindToolInventory,
  createToolConditionState,
  getToolCondition,
  mostWornToolCopy,
  quoteToolRepair,
  repairToolCondition,
  setToolRemaining,
  takeToolCopy,
  toolRepairPlan,
  toolWornBaseCost,
} from '../public/js/tools.js?v=5f482998';
import { addItem, countItem, createInventory, ensureItem } from '../public/js/inventory.js?v=60dfc9ca';
import { createVendorSellQuote, listSellOffers, vendorSell } from '../public/js/vendor.js?v=595411dd';
import { createShrineState, donateToShrine, listShrineDonationOptions, quoteShrineDonation } from '../public/js/shrines.js?v=aa00a504';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, 'public', p), 'utf8');

/** Two Picks, the second broken; a Tinkertool; bound like the game binds them. */
function kit() {
  ensureItem('pick', { isTool: true, baseCost: 500 });
  ensureItem('tinkertool', { isTool: true, baseCost: 500 });
  const inv = createInventory({});
  for (const k of Object.keys(inv)) delete inv[k];
  addItem(inv, 'pick', 2);
  addItem(inv, 'tinkertool', 1);
  addItem(inv, 'cherry', 3);
  const state = createToolConditionState();
  bindToolInventory(state, inv);
  setToolRemaining(state, 'pick', 100, { copy: 0 });
  setToolRemaining(state, 'pick', 0, { copy: 1 });
  return { inv, state };
}

/** The source's tick loop, written out on its own, to hold toolRepairPlan to it. */
function sourceRepair(missing, perTick, cost, energy) {
  let e = energy;
  let points = 0;
  let spent = 0;
  let ticks = 0;
  for (let t = 1; t < 10000; t += 1) {
    let remaining;
    if (e > cost) {
      points = Math.min(missing, points + perTick);
      remaining = missing - points;
      ticks += 1;
    }
    if (t % 2 === 1) {
      if (e <= cost) break;
      e -= cost;
      spent += cost;
    }
    if (remaining === 0) break;
    if (e <= cost) break;
  }
  return { points, spent, ticks };
}

describe('repairing as far as the energy goes (tinkertool.js onTick)', () => {
  it('matches the source tick for tick at every energy level', () => {
    const { state } = kit();
    const quote = quoteToolRepair(state, 'pick', ['tinkering_1'], { copy: 1 });
    assert.equal(quote.ok, true);
    for (let energy = 0; energy <= 200; energy += 1) {
      const plan = toolRepairPlan(quote, energy);
      if (energy <= quote.energyPerTwoTicks + 1) {
        assert.equal(plan.ok, false, `refused at ${energy}`);
        continue;
      }
      const src = sourceRepair(quote.missing, quote.tinkering.repairPerSecond, quote.energyPerTwoTicks, energy);
      assert.deepEqual([plan.points, plan.energy, plan.ticks], [src.points, src.spent, src.ticks], `energy ${energy}`);
      assert.equal(plan.full, src.points >= quote.missing);
    }
  });

  it('a short repair keeps what it fixed, says how far it got, and counts for no badge', () => {
    const { state } = kit();
    const pc = { energy: 30 };
    const r = repairToolCondition(state, 'pick', pc, { learned: ['tinkering_1'], hasTinkertool: true, copy: 1 });
    assert.equal(r.ok, true);
    assert.equal(r.full, false);
    assert.equal(getToolCondition(state, 'pick', { copy: 1 }).remaining, r.plan.points);
    assert.ok(r.plan.points > 0 && r.plan.points < 100);
    assert.equal(pc.energy, 30 - r.plan.energy);
    assert.ok(pc.energy <= r.quote.energyPerTwoTicks, 'it stops once energy is at or under a tick pair');
    assert.equal(r.msg, `You repaired the Pick to ${r.plan.points} percent. You spent ${r.plan.energy} energy.`);
    assert.equal(state.totalRepairs || 0, 0, 'endRepair counts tools_repaired only for a finished repair');
    assert.equal(getToolCondition(state, 'tinkertool').remaining, 200 - r.plan.ticks, 'the Tinkertool wears by the ticks run');
  });

  it('a repair with energy to spare finishes as before', () => {
    const { state } = kit();
    const pc = { energy: 500 };
    const r = repairToolCondition(state, 'pick', pc, { learned: ['tinkering_1'], hasTinkertool: true, copy: 1 });
    assert.equal(r.full, true);
    assert.match(r.msg, /^You fixed the Pick up just perfect\. You spent \d+ energy\.$/);
    assert.equal(getToolCondition(state, 'pick', { copy: 1 }).remaining, 100);
    assert.equal(state.totalRepairs, 1);
  });

  it('too little energy to start is refused with the reason', () => {
    const { state } = kit();
    const pc = { energy: 5 };
    const r = repairToolCondition(state, 'pick', pc, { learned: ['tinkering_1'], hasTinkertool: true, copy: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'energy');
    assert.equal(pc.energy, 5);
    assert.equal(getToolCondition(state, 'pick', { copy: 1 }).remaining, 0);
  });

  it('the game counts badges and quests on a finished repair only, and the 15-second flag on any', () => {
    const game = read('game.js');
    assert.match(game, /if \(result\.full\) emitGameEvent\(`tool_repaired:\$\{classTsid\}`\);/);
    assert.match(game, /const plan = toolRepairPlan\(quote, pc\.energy\);/);
  });
});

describe('a tool\'s worth (tool_base.js getBaseCost)', () => {
  it('is 20% of its base cost plus 80% by the wear left', () => {
    const { state } = kit();
    assert.equal(toolWornBaseCost(state, 'pick', { copy: 0 }), 500);
    assert.equal(toolWornBaseCost(state, 'pick', { copy: 1 }), 100);
    setToolRemaining(state, 'pick', 50, { copy: 1 });
    assert.equal(toolWornBaseCost(state, 'pick', { copy: 1 }), 300);
  });

  it('a machine (fuel, no points capacity) and an untracked class defer to the catalog', () => {
    const state = createToolConditionState();
    assert.equal(toolWornBaseCost(state, 'metalmaker'), null);
    assert.equal(toolWornBaseCost(state, 'cherry'), null);
  });

  it('a sale or a donation takes the most worn copy', () => {
    const { state } = kit();
    assert.equal(mostWornToolCopy(state, 'pick'), 1);
  });
});

describe('vendors buy tools (inc_stores.js storeSell)', () => {
  const worth = (state) => (cls) => toolWornBaseCost(state, cls, { copy: mostWornToolCopy(state, cls) });

  it('lists a tool once at its worn price, and leaves tools out without a price', () => {
    const { inv, state } = kit();
    const row = listSellOffers(inv, [], [], { toolBaseCost: worth(state) }).find((r) => r.classTsid === 'pick');
    assert.deepEqual([row.price, row.maxQty, row.tool], [66, 1, true], 'a broken Pick: 100 x 0.66');
    assert.ok(!listSellOffers(inv, [], [], {}).some((r) => r.classTsid === 'pick'));
    const quote = createVendorSellQuote(inv, [], 'pick', 2, [], { toolBaseCost: worth(state) });
    assert.deepEqual([quote.ok, quote.qty, quote.maxQty, quote.unitPrice], [true, 1, 1, 66]);
  });

  it('a tool drags onto an open vendor, the dragged copy staged; it still never drags onto a player (ticket 43)', () => {
    const game = read('game.js');
    assert.match(game, /const toolSlot = Boolean\(s\.isTool \|\| opts\.toolRow\);\n\s*const canDragToVendor = true;/);
    assert.match(game, /if \(!toolSlot && !s\.bag && features\.query\('packDragStart', s\.classTsid, event, engine\)\) return;/);
    assert.match(game, /vendorDragCopy = toolSlot && s\.copy != null \? s\.copy : null;/);
    assert.match(game, /if \(classTsid\) stageVendorSell\(classTsid, copy, place\);/);
  });

  it('sells one copy, the worn one, through the caller\'s last step', () => {
    const { inv, state } = kit();
    const pc = { currants: 0 };
    assert.equal(vendorSell(pc, inv, [], 'pick', 2, { toolBaseCost: worth(state) }).ok, false, 'one at a time');
    assert.equal(vendorSell(pc, inv, [], 'pick', 1, {}).ok, false, 'no price, no sale');
    const copy = mostWornToolCopy(state, 'pick');
    const r = vendorSell(pc, inv, [], 'pick', 1, { toolBaseCost: worth(state), beforeRemove: () => takeToolCopy(state, 'pick', { copy }) });
    assert.equal(r.ok, true);
    assert.equal(pc.currants, 66);
    assert.equal(countItem(inv, 'pick'), 1);
    assert.equal(getToolCondition(state, 'pick', { copy: 0 }).remaining, 100, 'the working Pick stays');
  });
});

describe('shrines take tools (include/shrines.js 397)', () => {
  const worth = (state) => (cls) => toolWornBaseCost(state, cls, { copy: mostWornToolCopy(state, cls) });

  it('values a tool by its wear, one at a time, listed after the goods', () => {
    const { inv, state } = kit();
    const shrine = createShrineState();
    const rows = listShrineDonationOptions(shrine, 'zille', inv, { xp: 1000, toolBaseCost: worth(state) });
    const pick = rows.find((r) => r.classTsid === 'pick');
    assert.deepEqual([pick.baseCost, pick.qty, pick.maxQty, pick.tool], [100, 1, 1, true]);
    assert.ok(rows.findIndex((r) => r.tool) > rows.findIndex((r) => r.classTsid === 'cherry'), 'goods first, so a tool is never picked for you');
    assert.equal(quoteShrineDonation(shrine, 'zille', inv, 'pick', 2, { xp: 1000 }).ok, false, 'no price, not offered');
    assert.ok(!listShrineDonationOptions(shrine, 'zille', inv, { xp: 1000 }).some((r) => r.classTsid === 'pick'));
  });

  it('a tool worth nothing (a machine, base_cost 0) is not offered', () => {
    const inv = createInventory({});
    for (const k of Object.keys(inv)) delete inv[k];
    ensureItem('metalmaker', { isTool: true, baseCost: 0 });
    addItem(inv, 'metalmaker', 1);
    const shrine = createShrineState();
    assert.equal(quoteShrineDonation(shrine, 'zille', inv, 'metalmaker', 1, { xp: 1000, toolBaseCost: () => null }).ok, false);
  });

  it('a donated tool leaves through the caller\'s last step', () => {
    const { inv, state } = kit();
    const shrine = createShrineState();
    const copy = mostWornToolCopy(state, 'pick');
    const r = donateToShrine(shrine, 'zille', inv, { xp: 1000, mood: 50, energy: 50 }, 'pick', 1, {
      toolBaseCost: worth(state),
      beforeRemove: () => takeToolCopy(state, 'pick', { copy }),
      rng: () => 0.5,
    });
    assert.equal(r.ok, true);
    assert.equal(r.baseCost, 100);
    assert.equal(countItem(inv, 'pick'), 1);
    assert.equal(getToolCondition(state, 'pick', { copy: 0 }).remaining, 100);
  });

  it('the shrine panel no longer says tools are kept back', () => {
    assert.ok(!read('game.js').includes('Tools and emblems are kept safe.'));
  });
});
