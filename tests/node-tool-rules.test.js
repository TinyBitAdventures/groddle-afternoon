/**
 * Rocks, nodes and their tools as Glitch ruled them (rules-b audit, 2026-11-12): the tool a drag or
 * a pack verb names is the one that works and wears, a worn tool's own line, the order of a node's
 * checks, the Pick's, Shovel's and Scraper's pack verbs, Rubeweed, Party Scraping, the Jellisac's
 * Super Harvest, the crews the realtime server keeps.
 * Source: glitch-GameServerJS items/rock_metal_1.js, rock_beryl_1.js, include/mining.js, pick.js,
 * shovel.js, scraper.js, peat_1.js, dirt_pile.js, mortar_barnacle.js, ice_knob.js, jellisac.js,
 * include/scraping.js, players/inc_skill_packages.js.
 * Run: node --test tests/node-tool-rules.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=3a26727e';
import { bindToolInventory, createToolConditionState, setToolRemaining, toolCopies } from '../public/js/tools.js?v=48542c24';
import { WORLD_DROP_RULES, dropFor } from '../public/js/world-drop.js?v=d152b2bb';
import { CHOICE_MS, chooseTool, clearToolChoice, peekToolChoice, takeToolChoice } from '../public/js/tool-choice.js?v=e0dcb60e';
import { PACK_TOOL_TEXT, nodesFor, packToolButtons, packToolCondition, planPackToolVerb } from '../public/js/pack-tool-verbs.js?v=479afbd9';
import { packToolOrder } from '../public/js/features/resource-nodes-feature.js?v=bb9e20cb';
import { CREW_NODES, CREW_VERBS, HELP_SCRAPE_LABEL, helpScrapeMessage } from '../public/js/help-dig.js?v=93d6358d';
import { nodePerks } from '../public/js/street-objects.js?v=f847ee0d';

const NOW = 1_700_000_000_000;
const ctx = (extra = {}) => ({ now: NOW, dayKey: 'd1', rng: () => 0.5, ...extra });
const kit = (inv) => {
  const tools = bindToolInventory(createToolConditionState(), inv);
  return { inv, tools };
};

afterEach(() => clearToolChoice());

describe('a tool the player names (js/tool-choice.js)', () => {
  it('waits for one verb on one target, then is gone', () => {
    const rock = {};
    chooseTool(rock, 'pick', { copy: 1, now: 0 });
    assert.equal(peekToolChoice({}, 1), null, 'another target never takes it');
    assert.equal(takeToolChoice(rock, 2).copy, 1);
    assert.equal(takeToolChoice(rock, 3), null, 'used once');
    chooseTool(rock, 'pick', { now: 0 });
    assert.equal(peekToolChoice(rock, CHOICE_MS + 1), null, 'it lapses');
  });
});

describe('drag a tool onto a node (drop_ok_code)', () => {
  const rule = (id) => WORLD_DROP_RULES.find((r) => r.id === id);
  it('a Metal Rock takes only a working Fancy Pick; the other rocks either pick', () => {
    const verbs = [{ id: 'mine', enabled: true }];
    assert.equal(dropFor('rock_metal_1', 'pick', verbs), null);
    assert.equal(dropFor('rock_metal_1', 'fancy_pick', verbs).rule.id, 'mine_metal');
    assert.equal(dropFor('rock_beryl_1', 'pick', verbs).rule.id, 'mine');
    assert.equal(dropFor('rock_beryl_1', 'pick', verbs, { working: () => false }), null, 'a broken pick is no drop');
  });
  it('Dirt Piles take a Shovel or an Ace of Spades, barnacles and ice a Scraper; Peat a Shovel only', () => {
    assert.equal(dropFor('dirt_pile', 'ace_of_spades', [{ id: 'dig' }]).rule.id, 'dig_dirt');
    assert.equal(dropFor('mortar_barnacle', 'super_scraper', [{ id: 'scrape' }]).rule.id, 'scrape');
    assert.equal(dropFor('ice_knob', 'scraper', [{ id: 'scrape' }]).rule.id, 'scrape_ice');
    assert.equal(dropFor('peat_1', 'ace_of_spades', [{ id: 'harvest' }]), null);
    for (const id of ['mine', 'mine_metal', 'dig_dirt', 'scrape', 'scrape_ice', 'peat']) assert.equal(rule(id).tool, true, id);
  });
});

describe('a node finds its tool as the source handlers did', () => {
  it('the named copy scrapes and wears (startScraping, msg.target_itemstack_tsid)', () => {
    const { inv, tools } = kit({ scraper: 2 });
    const node = createResourceNode('mortar_barnacle');
    const r = harvestResourceNode(node, inv, { energy: 50 }, ctx({ toolState: tools, tool: 'scraper', toolCopy: 1 }));
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(toolCopies(tools, 'scraper').map((c) => c.remaining), [50, 49]);
  });

  it('Shovel or Ace of Spades: the first working one in pack order (peat_1.js 345-351)', () => {
    const { inv, tools } = kit({ shovel: 1, ace_of_spades: 1 });
    const node = createResourceNode('peat_1');
    const order = [{ cls: 'shovel', copy: 0 }, { cls: 'ace_of_spades', copy: 0 }];
    const r = harvestResourceNode(node, inv, { energy: 50 }, ctx({ toolState: tools, toolOrder: order }));
    assert.equal(r.toolUsed, 'shovel');
  });

  it('a worn shovel says its own line; a broken one is no shovel', () => {
    const { inv, tools } = kit({ shovel: 1 });
    setToolRemaining(tools, 'shovel', 1);
    const peat = harvestResourceNode(createResourceNode('peat_1'), inv, { energy: 50 }, ctx({ toolState: tools }));
    assert.equal(peat.message, 'Your Shovel is too worn out. Try repairing it or replacing it.');
    const dirt = harvestResourceNode(createResourceNode('dirt_pile'), inv, { energy: 50 }, ctx({ toolState: tools }));
    assert.equal(dirt.message, "Your shovel doesn't have enough wear remaining.");
    setToolRemaining(tools, 'shovel', 0);
    const broken = harvestResourceNode(createResourceNode('peat_1'), inv, { energy: 50 }, ctx({ toolState: tools }));
    assert.equal(broken.message, "You'll need a working shovel first.");
  });

  it('a worn scraper at an Ice Nubbin (ice_knob.js 378-379, no dash)', () => {
    const { inv, tools } = kit({ scraper: 1 });
    setToolRemaining(tools, 'scraper', 1);
    const r = harvestResourceNode(createResourceNode('ice_knob'), inv, { energy: 50 }, ctx({ toolState: tools }));
    assert.equal(r.message, "Nope! You need to fix your scraper up first. It's almost busted!");
  });

  it('a Dirt Pile asks for the shovel before the dirt (dirt_pile.js 103-114)', () => {
    const node = createResourceNode('dirt_pile');
    node.units = 1;
    const r = harvestResourceNode(node, {}, { energy: 50 }, ctx({ toolState: createToolConditionState() }));
    assert.equal(r.message, 'You need a working shovel.');
  });

  it('too tired: the package line (inc_skill_packages.js 177-179)', () => {
    const { inv, tools } = kit({ scraper: 1 });
    const r = harvestResourceNode(createResourceNode('mortar_barnacle'), inv, { energy: 2 }, ctx({ toolState: tools }));
    assert.equal(r.message, "You're too tired to do that.");
  });

  it('a Jellisac gives no Super Harvest on a scoop that brought a drop (jellisac.js 182)', () => {
    const scoop = (gotDrop) => harvestResourceNode(createResourceNode('jellisac'), {}, { energy: 50 },
      ctx({ skills: ['jellisac_hands_1'], rng: () => 0, rollDrop: () => gotDrop }));
    assert.ok(scoop(false).superHarvest);
    assert.equal(scoop(true).superHarvest, undefined);
  });

  it('Party Scraping marks the scrape as run with no imagination upgrades (no drop card)', () => {
    const { inv, tools } = kit({ scraper: 1 });
    const r = harvestResourceNode(createResourceNode('mortar_barnacle'), inv, { energy: 50, partyScraping: true }, ctx({ toolState: tools }));
    assert.equal(r.noImgUpgrades, true);
  });

  it('Rubeweed raises the Dirt Pile\'s Loam chance by a quarter (inc_skill_packages.js 538-541)', () => {
    // Soil Appreciation I: 3% Loam. A 3.5% roll misses, and lands with Rubeweed (3.75%).
    const dig = (rubeweed) => harvestResourceNode(createResourceNode('dirt_pile'), { shovel: 1 }, { energy: 50 },
      ctx({ skills: ['soil_appreciation_1'], rng: () => 0.035, rubeweed })).loam;
    assert.equal(dig(false), false);
    assert.equal(dig(true), true);
    assert.deepEqual(nodePerks('dirt_pile', 'dig', { buffs: ['rubeweed'] }), ['rube']);
  });
});

describe('pack order (findFirst)', () => {
  it('walks the pack slots and the bags where they sit', () => {
    const layout = {
      pack: { slots: [{ kind: 'stack', cls: 'ace_of_spades', count: 1 }, { kind: 'bag', key: 'b1' }, { kind: 'stack', cls: 'shovel', count: 1 }] },
      bags: { b1: { slots: [{ kind: 'stack', cls: 'shovel', count: 1 }] } },
    };
    assert.deepEqual(packToolOrder(layout), [{ cls: 'ace_of_spades', copy: 0 }, { cls: 'shovel', copy: 0 }, { cls: 'shovel', copy: 1 }]);
    assert.equal(packToolOrder(null), null);
  });
});

describe('the Pick, Shovel and Scraper pack verbs (pick.js, shovel.js, scraper.js)', () => {
  const at = (x) => ({ x, y: 600, destroyed: false });
  const rock = (cls, chunks = 50) => ({ classId: cls, sprite: at(60), state: { rock: { chunksRemaining: chunks } } });
  const find = (list) => (pred, reach) => list.filter(pred).find((t) => Math.abs(t.sprite.x) <= reach) || null;

  it('Use: Mining I, then the pick; a plain Pick on a Metal Rock is too brittle', () => {
    assert.equal(packToolCondition('use', { knowsMining: false }).reason, PACK_TOOL_TEXT.noMining);
    assert.equal(packToolCondition('use', { knowsMining: true, working: false }).reason, 'This pick has become broken, and must be repaired.');
    const metal = rock('rock_metal_1');
    const nodes = nodesFor('use', { find: find([metal]), verbsOf: () => [{ id: 'mine', enabled: true }] });
    const plan = planPackToolVerb('use', { tool: 'pick', knowsMining: true, nodes, rockType: () => 'metal_rock' });
    assert.deepEqual(plan.lines, [PACK_TOOL_TEXT.brittle]);
    const beryl = rock('rock_beryl_1');
    const run = planPackToolVerb('use', { tool: 'pick', knowsMining: true, nodes: nodesFor('use', { find: find([beryl]), verbsOf: () => [{ id: 'mine', enabled: true }] }), rockType: () => 'beryl' });
    assert.deepEqual(run.run.choose, { cls: 'pick', force: true });
    assert.deepEqual(planPackToolVerb('use', { tool: 'fancy_pick', knowsMining: true, nodes: [] }).lines, ["But there's nothing to mine!"]);
    assert.equal(nodesFor('use', { find: find([rock('rock_beryl_1', 0)]), verbsOf: () => [] }).length, 0, 'a mined-out rock is not useable');
  });

  it('dig and harvest: the node\'s own state, else nothing to dig', () => {
    const pile = { classId: 'dirt_pile', sprite: at(40) };
    const nodes = nodesFor('dig', { find: find([pile]), verbsOf: () => [{ id: 'dig', enabled: false, reason: "There isn't enough dirt left to dig." }] });
    assert.equal(packToolCondition('dig', { tool: 'shovel', nodes }).reason, "There isn't enough dirt left to dig.");
    assert.equal(packToolCondition('dig', { tool: 'shovel', nodes: [] }).reason, "There's nothing to dig!");
    assert.equal(packToolCondition('harvest', { tool: 'ace_of_spades', nodes: [] }).reason, "There's nothing to harvest!");
    assert.equal(packToolCondition('dig', { tool: 'ace_of_spades', working: false }).reason, 'This Ace of Spades has become broken, and must be repaired.');
    const buttons = packToolButtons('shovel', { dig: { state: 'enabled' }, harvest: { state: 'disabled', reason: 'x' } });
    assert.deepEqual(buttons.map((b) => `${b.id}:${b.enabled}`), ['dig:true', 'harvest:false']);
  });

  it('scrape reaches a barnacle within 200, and with none it is disabled', () => {
    const barnacle = { classId: 'mortar_barnacle', sprite: at(180) };
    const nodes = nodesFor('scrape', { find: find([barnacle]), verbsOf: () => [{ id: 'scrape', enabled: true }] });
    assert.equal(nodes.length, 1);
    assert.equal(packToolCondition('scrape', { tool: 'scraper', nodes }).state, 'enabled');
    assert.equal(packToolCondition('scrape', { tool: 'scraper', nodes: [] }).state, 'disabled');
  });
});

describe('crews on the realtime server (objects.go crewNodes)', () => {
  it('every timed node use is heard; ice scrapers help each other', () => {
    assert.deepEqual([...CREW_NODES].sort(), ['dirt_pile', 'ice_knob', 'jellisac', 'mortar_barnacle', 'peat_1']);
    assert.equal(CREW_VERBS.ice_knob, 'scrape');
    assert.equal(HELP_SCRAPE_LABEL, 'Help scrape');
    assert.equal(helpScrapeMessage(2, ['Bo', 'Cy']), 'You got more ice with the help you received from Bo, and Cy. +2 Ice');
  });
});
