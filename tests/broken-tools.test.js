/**
 * Ticket 63 (Friendly, 2026-11-03): a broken pick still played the mining swing before
 * "Your pick has become broken", and its pack icon stayed whole. In the original a broken
 * tool is no tool: the rock's mine verb is disabled with "You'll need a pick first."
 * (rock_beryl_1.js verbs.mine conditions 193-214, it.is_pick && it.isWorking()), a garden
 * with only a broken can or hoe answers at once with its talkback (include/garden.js
 * 125-130, 217-228, 234-237, 310-327), and the pack draws the tool's broken_iconic state
 * (ItemstackAnimation.as 178-186).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVerbsFor, runVerb } from '../public/content.js?v=bb13a931';
import { createInventory } from '../public/js/inventory.js?v=60dfc9ca';
import { createMineRock, findWorkingPick, miningToolWear } from '../public/js/mining.js?v=674ed39b';
import { clearPlot, createGarden, gardenActionProfile, getPlot, waterPlot } from '../public/js/garden.js?v=1e8a887d';
import { BROKEN_TOOL_ICONS, TOOL_CONDITION_CATALOG, brokenToolIcon, createToolConditionState, setToolRemaining } from '../public/js/tools.js?v=5f482998';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=165dbd6e';

const root = join(import.meta.dirname, '..');
const icons = join(root, 'public/assets/sprites/icons');
const pc = { energy: 500, mood: 100 };
const learned = ['mining_1', 'croppery_1', 'herbalism_1', 'light_green_thumb_1'];
const verb = (target, inv, tools, id) => getVerbsFor(target, { pc, inv, tools, learned, skills: { learned } }).find((v) => v.id === id);
const broken = (...classes) => {
  const tools = createToolConditionState();
  for (const c of classes) setToolRemaining(tools, c, 0);
  return tools;
};

describe('ticket 63: a broken tool is no tool', () => {
  it('a rock\'s mine verb is off with only a broken pick, so the swing never starts', () => {
    const rock = { classId: 'rock_beryl_1', state: { rock: createMineRock('rock_beryl_1') } };
    const inv = createInventory({ pick: 1 });
    const off = verb(rock, inv, broken('pick'), 'mine');
    assert.equal(off.enabled, false);
    assert.equal(off.reason, "You'll need a pick first.");
    assert.equal(verb(rock, inv, createToolConditionState(), 'mine').enabled, true, 'a working pick mines');
    // A working Fancy Pick beside the broken Pick still mines.
    assert.equal(verb(rock, createInventory({ pick: 1, fancy_pick: 1 }), broken('pick'), 'mine').enabled, true);
  });

  it('a garden plot with only a broken can or hoe answers at once (no swing to watch)', () => {
    const garden = createGarden();
    const [key] = Object.keys(garden.plots);
    const plot = garden.plots[key];
    const target = { classId: 'garden_plot', state: { garden, plot, plotKey: key } };
    plot.state = 'seeds';
    plot.wet = false;
    const inv = createInventory({ watering_can: 1, hoe: 1 });
    assert.equal(verb(target, inv, broken('watering_can'), 'water').durationMs, 0);
    assert.notEqual(verb(target, inv, createToolConditionState(), 'water').durationMs, 0);
    plot.state = 'dirty';
    assert.equal(verb(target, inv, broken('hoe'), 'clear').durationMs, 0);
    assert.notEqual(verb(target, inv, createToolConditionState(), 'clear').durationMs, 0);
    const all = { classId: 'garden_new', state: { garden } };
    assert.equal(verb(all, inv, broken('watering_can'), 'water_all').durationMs, 0);
  });

  it('every tool with a broken state has its broken pack icon, 1x and 3x, and the pack uses it', () => {
    for (const cls of BROKEN_TOOL_ICONS) {
      assert.ok(TOOL_CONDITION_CATALOG[cls], `${cls} wears`);
      assert.ok(existsSync(join(icons, `${cls}_broken.webp`)), `${cls}_broken.webp`);
      assert.ok(existsSync(join(icons, `${cls}_broken@3x.webp`)) && HIRES_ICONS.has(`${cls}_broken`), `${cls}_broken@3x.webp`);
    }
    for (const cls of Object.keys(TOOL_CONDITION_CATALOG)) {
      if (existsSync(join(icons, `${cls}_broken.webp`))) assert.ok(BROKEN_TOOL_ICONS.has(cls), `${cls} has art but is not listed`);
    }
    for (const cls of ['pick', 'fancy_pick', 'hoe', 'high_class_hoe', 'smelter', 'ore_grinder', 'grand_ol_grinder']) assert.ok(BROKEN_TOOL_ICONS.has(cls), cls);
    assert.equal(brokenToolIcon('pick'), 'assets/sprites/icons/pick_broken.webp');
    assert.equal(brokenToolIcon('butterfly_lotion'), null);
    assert.match(readFileSync(join(root, 'public/game.js'), 'utf8'), /img\.src = \(toolCondition\?\.broken && brokenToolIcon\(s\.classTsid\)\)\n\s+\|\| \(s\.classTsid === EMOTIONAL_BEAR_ID[^\n]+\n\s+\|\| s\.icon;/);
  });
});

/**
 * Report 121 (Friendly, 2026-11-06): a Hoe at 2/50 played the "clear" word, then the plot said
 * "That's one broken down hoe" and stayed dirty. Aggressive Hoeing multiplies the wear
 * (include/garden.js 238-253, wear x 1.5/3/4/5), and inc_skill_packages.js 169 refuses before the
 * overlay and the energy with error_tool_broken; the plot answers broken_hoe (include/garden.js 311).
 * The refusal is the original's. The word bar and the bare "broken" were not.
 */
describe('report 121: an action the plot will refuse never plays', () => {
  const CARD = 'hoeing_more_img_more_wear';
  const plotAt = (state, wet = false, gardenType = 'default') => {
    const garden = createGarden({ cols: 1, rows: 1, now: 0, gardenType });
    const plot = getPlot(garden, '1-1');
    plot.state = state;
    plot.wet = wet;
    return { classId: 'garden_plot', state: { garden, plot, plotKey: '1-1' } };
  };
  const worn = (cls, left) => {
    const tools = createToolConditionState();
    setToolRemaining(tools, cls, left);
    return tools;
  };
  const ctx = (tools, known, upgrades = [], energy = 500) => ({ pc: { energy, mood: 100 }, inv: createInventory({ hoe: 1, watering_can: 1, seed_carrot: 1 }), tools, learned: known, skills: { learned: known }, imaginationUpgrades: upgrades });
  const clearVerb = (tools, known, upgrades) => getVerbsFor(plotAt('dirty'), ctx(tools, known, upgrades)).find((v) => v.id === 'clear');

  it('a Hoe at 2/50 with the card takes no time to refuse, by Croppery rank', () => {
    for (const known of [[], ['croppery_1'], ['croppery_1', 'croppery_2'], ['croppery_1', 'croppery_2', 'croppery_3']]) {
      const need = gardenActionProfile('default', 'clear', known, [CARD]).toolWear;
      assert.ok(need > 2, `wear ${need}`);
      assert.equal(clearVerb(worn('hoe', 2), known, [CARD]).durationMs, 0, known.join());
      assert.notEqual(clearVerb(worn('hoe', need), known, [CARD]).durationMs, 0, `enough at ${need}`);
    }
  });

  it('without the card the same Hoe still clears: wear is 2 at most, as isWorking(2) lets 2/50 through', () => {
    assert.equal(gardenActionProfile('default', 'clear', [], []).toolWear, 2);
    assert.equal(gardenActionProfile('default', 'clear', ['croppery_1'], []).toolWear, 1);
    assert.notEqual(clearVerb(worn('hoe', 2), [], []).durationMs, 0);
    const c = ctx(worn('hoe', 2), []);
    const t = plotAt('dirty');
    assert.equal(runVerb(t, 'clear', c).ok, true);
    assert.equal(t.state.plot.state, 'clean');
  });

  it('a High-Class Hoe that can take the wear goes first, so the worn Hoe does not refuse', () => {
    const tools = worn('hoe', 2);
    const c = { ...ctx(tools, ['croppery_1'], [CARD]), inv: createInventory({ hoe: 1, high_class_hoe: 1 }) };
    assert.notEqual(getVerbsFor(plotAt('dirty'), c).find((v) => v.id === 'clear').durationMs, 0);
  });

  it('the refusal keeps the talkback, says why plainly, and changes nothing', () => {
    const t = plotAt('dirty');
    const c = ctx(worn('hoe', 2), ['croppery_1'], [CARD]);
    const r = runVerb(t, 'clear', c);
    assert.equal(r.ok, false);
    assert.equal(t.state.plot.state, 'dirty');
    assert.equal(c.pc.energy, 500, 'the package never started');
    assert.equal(r.speech.failed, true);
    assert.match(r.speech.text, /hoe/i, 'broken_hoe talkback');
    assert.equal(r.msgs[0], 'This Hoe needs 3 condition for that and only has 2. Repair it with a Tinkertool.');
    assert.equal(r.toastWithSpeech, true);
    assert.ok(!r.anim && !r.gardenChanged, 'no success feedback');
  });

  it('a really broken tool keeps the source\'s line, with the talkback alone', () => {
    const r = runVerb(plotAt('dirty'), 'clear', ctx(worn('hoe', 0), ['croppery_1']));
    assert.equal(r.ok, false);
    assert.match(r.msgs[0], /has become broken, and must be repaired/);
    assert.ok(!r.toastWithSpeech);
  });

  it('Water can\'t hit this: every rank wears one point, so a can that refuses is really empty', () => {
    for (const type of ['default', 'herb']) {
      for (const known of [[], ['croppery_1', 'herbalism_1'], ['croppery_1', 'croppery_2', 'croppery_3', 'herbalism_1', 'herbalism_2', 'herbalism_3']]) {
        assert.equal(gardenActionProfile(type, 'water', known, [CARD]).toolWear, 1, `${type} ${known.join()}`);
      }
    }
    assert.notEqual(getVerbsFor(plotAt('seeds'), ctx(worn('watering_can', 1), [])).find((v) => v.id === 'water').durationMs, 0);
  });

  it('energy not above the cost refuses at once too, with the source\'s line (include/garden.js 263-266)', () => {
    const cases = [['clear', 'dirty'], ['water', 'seeds'], ['harvest', 'crop'], ['plant', 'clean']];
    for (const [id, state] of cases) {
      const profile = gardenActionProfile('default', id, []);
      const at = (energy) => getVerbsFor(plotAt(state), ctx(createToolConditionState(), [], [], energy)).find((v) => v.id === id);
      assert.equal(at(profile.energy).enabled, true, id);
      assert.equal(at(profile.energy).durationMs, 0, id);
      assert.notEqual(at(profile.energy + 1).durationMs, 0, id);
    }
    const garden = createGarden({ cols: 1, rows: 1, now: 0 });
    getPlot(garden, '1-1').state = 'dirty';
    const r = clearPlot(garden, '1-1', { energy: 2 }, { inv: createInventory({ hoe: 1 }), toolState: createToolConditionState(), learned: [], upgrades: [] });
    assert.deepEqual([r.ok, r.msgs[0]], [false, "You're too tired to do that."]);
    const dry = createGarden({ cols: 1, rows: 1, now: 0 });
    getPlot(dry, '1-1').state = 'seeds';
    assert.equal(waterPlot(dry, '1-1', { energy: 2 }, { inv: createInventory({ watering_can: 1 }), toolState: createToolConditionState(), learned: [], upgrades: [] }).msgs[0], "You're too tired to do that.");
  });

  it('the game shows the worn tool\'s line beside the talkback', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const showLine = \(!spoke \|\| result\.toastWithSpeech\) && toastLine !== reactionText;/);
  });
});

describe('G553: the rock menu uses the real wear of a swing', () => {
  const ranks = { mining_1: 2, mining_2: 2, mining_3: 1, mining_4: 1 };
  const rockTarget = () => ({ classId: 'rock_beryl_1', state: { rock: createMineRock('rock_beryl_1') } });
  const worn = (cls, left) => {
    const tools = createToolConditionState();
    setToolRemaining(tools, cls, left);
    return tools;
  };
  const mineVerb = (inv, tools, known) => getVerbsFor(rockTarget(), { pc, inv, tools, learned: known, skills: { learned: known } }).find((v) => v.id === 'mine');
  const swingOf = (inv, tools, known) => runVerb(rockTarget(), 'mine', { pc: { energy: 500, mood: 100 }, inv, tools, learned: known, skills: { learned: known }, rng: () => 0.5 });

  for (const [rank, wear] of Object.entries(ranks)) {
    it(`${rank} wears ${wear}: a Pick at condition ${wear} swings, and it costs ${wear}`, () => {
      assert.equal(miningToolWear([rank]), wear);
      const inv = createInventory({ pick: 1 });
      const tools = worn('pick', wear);
      const on = mineVerb(inv, tools, [rank]);
      assert.equal(on.enabled, true);
      assert.ok(on.durationMs > 0, 'a real swing');
      const done = swingOf(inv, tools, [rank]);
      assert.equal(done.ok, true);
    });
  }

  it('Mining III and IV: a Pick at condition 1 is not refused (the reported case)', () => {
    for (const rank of ['mining_3', 'mining_4']) {
      const inv = createInventory({ pick: 1 });
      assert.equal(mineVerb(inv, worn('pick', 1), [rank]).reason, '');
      assert.equal(findWorkingPick(inv, worn('pick', 1), miningToolWear([rank])), 'pick');
    }
  });

  it('Mining I and II: a Pick at condition 1 refuses at once with the source\'s line, no swing to watch', () => {
    for (const rank of ['mining_1', 'mining_2']) {
      const inv = createInventory({ pick: 1 });
      const tools = worn('pick', 1);
      const v = mineVerb(inv, tools, [rank]);
      assert.equal(v.enabled, true);
      assert.equal(v.durationMs, 0);
      const r = swingOf(inv, tools, [rank]);
      assert.equal(r.ok, false);
      assert.deepEqual(r.msgs, ['Your pick does not have enough uses left.']);
    }
  });

  it('a Fancy Pick too worn beside a Pick that can take it: the Pick swings', () => {
    const tools = worn('fancy_pick', 1);
    const inv = createInventory({ pick: 1, fancy_pick: 1 });
    assert.equal(findWorkingPick(inv, tools, miningToolWear(['mining_1'])), 'pick');
    assert.ok(mineVerb(inv, tools, ['mining_1']).durationMs > 0);
  });

  it('a broken Pick is still no pick at every rank', () => {
    for (const rank of Object.keys(ranks)) {
      const v = mineVerb(createInventory({ pick: 1 }), worn('pick', 0), [rank]);
      assert.equal(v.enabled, false);
      assert.equal(v.reason, "You'll need a pick first.");
    }
  });
});
