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
import { getVerbsFor } from '../public/content.js?v=b49a6da6';
import { createInventory } from '../public/js/inventory.js?v=d82f3b00';
import { createMineRock } from '../public/js/mining.js?v=83421428';
import { createGarden } from '../public/js/garden.js?v=9c151062';
import { BROKEN_TOOL_ICONS, TOOL_CONDITION_CATALOG, brokenToolIcon, createToolConditionState, setToolRemaining } from '../public/js/tools.js?v=6684b484';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=5b68aeaa';

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
      assert.ok(existsSync(join(icons, `${cls}_broken.png`)), `${cls}_broken.png`);
      assert.ok(existsSync(join(icons, `${cls}_broken@3x.png`)) && HIRES_ICONS.has(`${cls}_broken`), `${cls}_broken@3x.png`);
    }
    for (const cls of Object.keys(TOOL_CONDITION_CATALOG)) {
      if (existsSync(join(icons, `${cls}_broken.png`))) assert.ok(BROKEN_TOOL_ICONS.has(cls), `${cls} has art but is not listed`);
    }
    for (const cls of ['pick', 'fancy_pick', 'hoe', 'high_class_hoe', 'smelter', 'ore_grinder', 'grand_ol_grinder']) assert.ok(BROKEN_TOOL_ICONS.has(cls), cls);
    assert.equal(brokenToolIcon('pick'), 'assets/sprites/icons/pick_broken.png');
    assert.equal(brokenToolIcon('butterfly_lotion'), null);
    assert.match(readFileSync(join(root, 'public/game.js'), 'utf8'), /img\.src = \(toolCondition\?\.broken && brokenToolIcon\(s\.classTsid\)\)\n\s+\|\| \(s\.classTsid === EMOTIONAL_BEAR_ID[^\n]+\n\s+\|\| s\.icon;/);
  });
});
