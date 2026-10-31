/**
 * QUESTFIX (register G436-G470): each quest counter advances from the event
 * the game actually sends, the way GSJS counted it. Every block names the
 * register row and the GSJS line it follows.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import {
  acceptOffer,
  routeQuestEvent,
  questRoutingReport,
  worldVerbQuestEvents,
  makingUnitQuestEvents,
  toolBreakEvents,
  shrineDonationQuestEvents,
  homeTreesGrown,
  wintryPlaceLeave,
  restartTimedQuest,
  normalizeQuestOfferState,
  SEAM_STREETS,
  GENERIC_BAG_CLASSES,
  PURPLE_JOURNEY_STREETS,
  COLD_COMFORT,
  COLD_COMFORT_LEAVE_TEXT,
} from '../public/js/quest-offers.js?v=dbfa83c4';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js?v=3d618d6a';
import { createPlot, performPlotVerb } from '../public/js/patches.js?v=3996c344';
import { createToolConditionState } from '../public/js/tools.js?v=9a2e7ef4';
import { performEmotionalBearAction, createEmotionalBearState } from '../public/js/emotional-bear.js?v=1dd276f7';
import {
  questVerbsFeature,
  slatherVerb,
  SLATHER_VERB,
  SLATHER_COPY,
} from '../public/js/features/quest-verbs-feature.js?v=b6b7c200';
import { onOwnYard } from '../public/js/features/quest-offers-feature.js?v=863bf36d';
import {
  giveCubimalVerb,
  GIVE_CUBIMAL_VERB,
  CUBIMAL_GIFT_RESPONSES,
} from '../public/js/features/quest-verbs-feature.js?v=b6b7c200';
import { createFeatureHost } from '../public/js/feature-host.js?v=e4f648b1';

const here = dirname(fileURLToPath(import.meta.url));
const PUB = join(here, '../public');
const CONTENT = join(PUB, 'assets/content');
const read = (rel) => readFileSync(join(PUB, rel), 'utf8');
const RECIPES = JSON.parse(read('assets/content/recipes.json'));
const recipe = (key) => (RECIPES.recipes || RECIPES)[key];

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

/** A save with these quests accepted through the offer system (managed, timers started). */
function accepted(...ids) {
  const qs = createQuestState();
  for (const id of ids) assert.equal(acceptOffer(qs, id, { inv: {}, now: 1_000 }).ok, true, id);
  return qs;
}
/** quest-offers-feature onEvent: managed quests only. */
const route = (qs, event, amount = 1, ctx = {}) => routeQuestEvent(qs, event, amount, { managedOnly: true, now: 2_000, ...ctx });
const progress = (qs, id, name) => qs.active[id]?.progress?.[name] ?? 0;
const send = (qs, rows, ctx) => rows.forEach((row) => route(qs, row.event ?? row.counter, row.amount ?? 1, ctx));

describe('G456 Go Jump in a Hole', () => {
  it('the arrival game.js sends for "The Great Hole to Ix" sets find_ix_hole (location.js 524-526)', () => {
    const label = JSON.parse(read('assets/streets/GLI2VDR4JRD1AEG.json')).label;
    // game.js street enter: street_entered:<label slug>.
    assert.match(read('game.js'), /emitGameEvent\(`street_entered:\$\{String\(data\.label \|\| ''\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\+\/g, '_'\)\}`\)/);
    const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    assert.equal(slug, 'the_great_hole_to_ix');
    const qs = accepted('jump_in_hole');
    route(qs, `street_entered:${slug}`);
    assert.equal(progress(qs, 'jump_in_hole', 'find_ix_hole'), 1);
    const byTsid = accepted('jump_in_hole');
    route(byTsid, 'street_entered_tsid:GLI2VDR4JRD1AEG');
    assert.equal(progress(byTsid, 'jump_in_hole', 'find_ix_hole'), 1);
  });

  it('accepting it while in the Hole sets the flag (jump_in_hole.js onAccepted 61-65)', () => {
    const qs = createQuestState();
    acceptOffer(qs, 'jump_in_hole', { inv: {}, now: 1, streetTsid: 'GLI2VDR4JRD1AEG' });
    assert.equal(progress(qs, 'jump_in_hole', 'find_ix_hole'), 1);
    const elsewhere = createQuestState();
    acceptOffer(elsewhere, 'jump_in_hole', { inv: {}, now: 1, streetTsid: 'GA5101HF7F429V5' });
    assert.equal(progress(elsewhere, 'jump_in_hole', 'find_ix_hole'), 0);
  });
});

describe('G461 Explore The Seams', () => {
  it('every entry to a seam counts it once per run, known streets too (explore_the_seams.js 66-76)', () => {
    assert.match(read('js/features/quest-offers-feature.js'), /this\.onEvent\(`street_entered_tsid:\$\{tsid\}`, 1, engine\)/);
    const qs = accepted('explore_the_seams');
    route(qs, `street_entered_tsid:${SEAM_STREETS[0]}`);
    route(qs, `street_entered_tsid:${SEAM_STREETS[0]}`);
    route(qs, 'street_entered_tsid:GA5101HF7F429V5');
    assert.equal(progress(qs, 'explore_the_seams', 'visit_seam_street'), 1);
    route(qs, `street_entered_tsid:${SEAM_STREETS[1]}`);
    assert.equal(progress(qs, 'explore_the_seams', 'visit_seam_street'), 2);
    // A save keeps the run's list (normalizeQuestOfferState).
    qs.offers = normalizeQuestOfferState(JSON.parse(JSON.stringify(qs.offers)));
    route(qs, `street_entered_tsid:${SEAM_STREETS[1]}`);
    assert.equal(progress(qs, 'explore_the_seams', 'visit_seam_street'), 2);
  });
});

describe('G460 Enlarge Yer Slots', () => {
  it('a colored bag bought counts (inc_stores.js 99, 224-225)', () => {
    assert.equal(GENERIC_BAG_CLASSES.length, 10);
    for (const bag of ['bag_generic_pink', 'bag_bigger_blue', 'bag_generic']) {
      const qs = accepted('buy_bag');
      route(qs, `vendor_bought:${bag}`, 1);
      assert.equal(progress(qs, 'buy_bag', 'generic_bag_purchased'), 1, bag);
    }
    const qs = accepted('buy_bag');
    route(qs, 'vendor_bought:bag_furniture_cabinet', 1);
    assert.equal(progress(qs, 'buy_bag', 'generic_bag_purchased'), 0);
  });
});

describe('trees (G439 G449 G450 G452 G469)', () => {
  it('a Wood Tree watering counts trees_watered once (wood_tree.js 984)', () => {
    const qs = accepted('lightgreenthumb_water_trees');
    // game.js executeVerb: `${target.classId}:${verbId}` (no badge event for a Wood Tree), then worldVerbQuestEvents.
    route(qs, 'wood_tree:water');
    send(qs, worldVerbQuestEvents({ classId: 'wood_tree' }, 'water', { ok: true }));
    assert.equal(progress(qs, 'lightgreenthumb_water_trees', 'trees_watered'), 1);
    assert.match(read('game.js'), /const verbEvent = `\$\{target\.classId\}:\$\{verbId\}`;/);
  });

  it('Wood Tree and Paper Tree harvests count for One, Two, Tree (wood_tree.js 779, paper_tree.js 475)', () => {
    const qs = accepted('gardening_harvest_all_trees_in_time_period');
    send(qs, worldVerbQuestEvents({ classId: 'wood_tree' }, 'harvest', { ok: true, woodHarvest: { maturityBefore: 3 } }));
    assert.equal(progress(qs, 'gardening_harvest_all_trees_in_time_period', 'trant_harvest_wood_tree'), 1);
    const node = createResourceNode('paper_tree');
    const r = harvestResourceNode(node, {}, { energy: 10, imagination: 0 }, { now: 1, dayKey: 'd', rng: () => 0.5, verbId: 'harvest' });
    assert.equal(r.ok, true);
    send(qs, r.achievementCounters);
    assert.equal(progress(qs, 'gardening_harvest_all_trees_in_time_period', 'trant_harvest_paper_tree'), 1);
  });

  it('a living Super Harvest and a maturity-6 Wood Tree count (include/trants.js 295, wood_tree.js 739-741)', () => {
    const qs = accepted('gardening_max_harvest_from_all_trees');
    send(qs, worldVerbQuestEvents({ classId: 'trant_bean' }, 'harvest', { ok: true, harvest: { superHarvest: true, remainingOnTree: 4 } }));
    send(qs, worldVerbQuestEvents({ classId: 'trant_fruit' }, 'harvest', { ok: true, harvest: { superHarvest: false, remainingOnTree: 4 } }));
    send(qs, worldVerbQuestEvents({ classId: 'wood_tree' }, 'harvest', { ok: true, woodHarvest: { maturityBefore: 5 } }));
    const id = 'gardening_max_harvest_from_all_trees';
    assert.equal(progress(qs, id, 'harvest_bonus_trant_bean'), 1);
    assert.equal(progress(qs, id, 'harvest_bonus_trant_fruit'), 0);
    assert.equal(progress(qs, id, 'harvest_max_wood_tree'), 0);
    send(qs, worldVerbQuestEvents({ classId: 'wood_tree' }, 'harvest', { ok: true, woodHarvest: { maturityBefore: 6 } }));
    assert.equal(progress(qs, id, 'harvest_max_wood_tree'), 1);
  });

  it('the last egg off an Egg Plant sets the flag (include/trants.js 368-369)', () => {
    const qs = accepted('gardening_harvest_last_egg_plant');
    send(qs, worldVerbQuestEvents({ classId: 'trant_egg' }, 'harvest', { ok: true, harvest: { remainingOnTree: 2 } }));
    assert.equal(progress(qs, 'gardening_harvest_last_egg_plant', 'gardening_harvest_last_egg_plant'), 0);
    send(qs, worldVerbQuestEvents({ classId: 'trant_egg' }, 'harvest', { ok: true, harvest: { remainingOnTree: 0 } }));
    assert.equal(progress(qs, 'gardening_harvest_last_egg_plant', 'gardening_harvest_last_egg_plant'), 1);
  });

  it('a tend that lands with both pet and water counts heal_trant (include/trants.js 670-676)', () => {
    const qs = accepted('lightgreenthumb_get_tree_to_level10');
    const tree = { classId: 'trant_spice', state: { petted: true, watered: false } };
    send(qs, worldVerbQuestEvents(tree, 'pet', { ok: true, trantCare: { ok: true } }));
    assert.equal(progress(qs, 'lightgreenthumb_get_tree_to_level10', 'heal_trant'), 0);
    tree.state.watered = true;
    send(qs, worldVerbQuestEvents(tree, 'water', { ok: true, trantCare: { ok: true } }));
    assert.equal(progress(qs, 'lightgreenthumb_get_tree_to_level10', 'heal_trant'), 1);
  });

  it('game.js sends these from the verb result', () => {
    assert.match(read('game.js'), /for \(const row of worldVerbQuestEvents\(target, verbId, result\)\) emitGameEvent\(row\.event, row\.amount, verbDetail\);/);
  });
});

describe('making (G441 G442)', () => {
  it('a crush counts ore_crushed and refined_<element>, never barnacle (ore_grinder.js 604-611)', () => {
    const qs = accepted('refining_grind_ore_to_elements', 'refining_refine_ore_in_time_period');
    send(qs, makingUnitQuestEvents({ recipe: recipe('crush_beryl'), made: 1 }));
    assert.equal(progress(qs, 'refining_refine_ore_in_time_period', 'ore_crushed'), 1);
    assert.equal(progress(qs, 'refining_grind_ore_to_elements', 'refined_element_red'), 20);
    assert.equal(progress(qs, 'refining_grind_ore_to_elements', 'refined_element_blue'), 4);
    send(qs, makingUnitQuestEvents({ recipe: recipe('crush_barnacle'), made: 1 }));
    assert.equal(progress(qs, 'refining_refine_ore_in_time_period', 'ore_crushed'), 1);
  });

  it('only one smelt of 20 ingots sets 100_metal_smelted (smelter.js 563-571)', () => {
    const qs = accepted('smelting_smelt_metal_rock_to_plain_metal');
    const id = 'smelting_smelt_metal_rock_to_plain_metal';
    for (let made = 1; made <= 19; made += 1) send(qs, makingUnitQuestEvents({ recipe: recipe('plain_metal'), made }));
    assert.equal(progress(qs, id, '100_metal_smelted'), 0);
    send(qs, makingUnitQuestEvents({ recipe: recipe('plain_metal'), made: 20 }));
    assert.equal(progress(qs, id, '100_metal_smelted'), 1);
    assert.match(read('game.js'), /for \(const row of makingUnitQuestEvents\(record\)\) emitGameEvent\(row\.event, row\.amount\);/);
  });
});

describe('G443 Machine Shop Pit Stop', () => {
  it('assembled, then taken apart, in the same run (engineering_assemble_machine.js 65-89)', () => {
    const id = 'engineering_assemble_machine';
    const qs = accepted(id);
    route(qs, 'machines_disassembled:fuelmaker');
    assert.equal(progress(qs, id, 'machine_shop_pit_stop_complete'), 0);
    route(qs, 'machines_assembled:fuelmaker');
    route(qs, 'machines_disassembled:fuelmaker');
    assert.equal(progress(qs, id, 'machine_shop_pit_stop_complete'), 1);
    // A fresh run (Try again) forgets the assembly.
    const again = accepted(id);
    route(again, 'machines_assembled:fuelmaker');
    restartTimedQuest(again, id, 5_000);
    route(again, 'machines_disassembled:fuelmaker');
    assert.equal(progress(again, id, 'machine_shop_pit_stop_complete'), 0);
    const src = read('js/features/supply-feature.js');
    assert.match(src, /engine\.achievement\?\.\(`machines_assembled:\$\{done\.machine\}`, 1\)/);
    assert.match(src, /engine\.achievement\?\.\(`machines_disassembled:\$\{done\.machine\}`, 1\)/);
  });
});

describe('herbs (G444 G448)', () => {
  it('Shucks To Be You: seeds first, then plant 6, then harvest (gandlevery.js 372, include/garden.js 390-392, 537-541)', () => {
    const id = 'herbalism_harvest_shuck_and_plant_herbs';
    const qs = accepted(id);
    route(qs, 'herb_seed_planted:herb_seed_gandlevery');
    route(qs, 'herb_harvest:gandlevery', 3);
    assert.equal(progress(qs, id, 'herb_seeds_planted_shucks'), 0);
    assert.equal(progress(qs, id, 'harvest_herb_shucks'), 0);
    route(qs, 'herb_seeds_extracted:herb_seed_gandlevery', 6);
    assert.equal(progress(qs, id, 'seeds_extracted'), 6);
    for (let i = 0; i < 5; i += 1) route(qs, 'herb_seed_planted:herb_seed_gandlevery');
    route(qs, 'herb_harvest:gandlevery', 3);
    assert.equal(progress(qs, id, 'harvest_herb_shucks'), 0);
    route(qs, 'herb_seed_planted:herb_seed_gandlevery');
    assert.equal(progress(qs, id, 'herb_seeds_planted_shucks'), 6);
    route(qs, 'herb_harvest:gandlevery', 3);
    assert.equal(progress(qs, id, 'harvest_herb_shucks'), 1, 'one harvest adds 1, not its crop count');
    assert.match(read('game.js'), /emitGameEvent\(`herb_seed_planted:\$\{r\.seedId\}`\)/);
    assert.match(read('js/features/supply-feature.js'), /engine\.achievement\?\.\(`herb_seeds_extracted:\$\{res\.out\}`, res\.got\)/);
  });

  it('an herb Super Harvest counts (include/garden.js 502-504)', () => {
    const qs = accepted('herbalism_get_super_harvest');
    route(qs, 'herb_super_harvest:silvertongue');
    assert.equal(progress(qs, 'herbalism_get_super_harvest', 'super_harvest_herb'), 1);
    assert.match(read('game.js'), /emitGameEvent\(`herb_super_harvest:\$\{r\.cropId\}`\)/);
  });
});

describe('tools (G440 G445)', () => {
  it('a break counts tool_broke_<tool>, an Irrigator also the can (watering_can.js 410-415)', () => {
    const state = createToolConditionState();
    state.condition = { watering_can: { remaining: 1, broken: false }, fancy_pick: { remaining: 3, broken: false } };
    const first = toolBreakEvents(null, state);
    assert.deepEqual(first.events, []);
    state.condition.watering_can = { remaining: 0, broken: true };
    const next = toolBreakEvents(first.broken, state);
    assert.deepEqual(next.events, ['tool_broke:watering_can']);
    assert.deepEqual(toolBreakEvents(next.broken, state).events, [], 'once');
    state.condition.irrigator_9000 = { remaining: 0, broken: true };
    assert.deepEqual(toolBreakEvents({ ...next.broken, irrigator_9000: false }, state).events, ['tool_broke:irrigator_9000', 'tool_broke:watering_can']);
    const qs = accepted('lightgreenthumb_break_watering_can', 'mining_break_fancy_pick');
    route(qs, 'tool_broke:watering_can');
    route(qs, 'tool_broke:fancy_pick');
    assert.equal(progress(qs, 'lightgreenthumb_break_watering_can', 'tool_broke_watering_can'), 1);
    assert.equal(progress(qs, 'mining_break_fancy_pick', 'tool_broke_fancy_pick'), 1);
  });

  it('a repair of 15 seconds or more sets tinkertool_15s_repair (tinkertool.js 370-371)', () => {
    const qs = accepted('tinkering_repair_for_time_period');
    route(qs, 'tool_repaired:pick');
    assert.equal(progress(qs, 'tinkering_repair_for_time_period', 'tinkertool_15s_repair'), 0);
    route(qs, 'tool_repaired_long:pick');
    assert.equal(progress(qs, 'tinkering_repair_for_time_period', 'tinkertool_15s_repair'), 1);
    assert.match(read('game.js'), /if \(quote\.durationSeconds >= 15\) emitGameEvent\(`tool_repaired_long:\$\{classTsid\}`\);/);
  });
});

describe('shrines (G436 G453 G454 G455)', () => {
  it('Spreading the Love counts a Giant the first time 23 favor has landed with it (inc_quests.js 1354-1377)', () => {
    const id = 'betterlearning_get_favor_at_shrines';
    const qs = accepted(id);
    const give = (giant, dailyFavor) => send(qs, shrineDonationQuestEvents(giant, { ok: true, favor: dailyFavor, dailyFavor, rawFavor: dailyFavor, classTsid: 'cherry', qty: 1 }));
    give('alph', 20);
    assert.equal(progress(qs, id, 'favor_unique_shrines'), 0);
    give('alph', 5);
    give('alph', 30);
    assert.equal(progress(qs, id, 'favor_unique_shrines'), 1);
    for (const giant of ['cosma', 'friendly', 'grendaline', 'humbaba']) give(giant, 23);
    assert.equal(progress(qs, id, 'favor_unique_shrines'), 5);
  });

  it('Whole Lotta Love adds the uncapped 10 percent; Favor Curry the favor that landed (shrines.js 569-603)', () => {
    const qs = accepted('donate_1000_favor_every_giant_one_day', 'betterlearning_collect_favor_points');
    send(qs, shrineDonationQuestEvents('lem', { ok: true, favor: 0, dailyFavor: 0, rawFavor: 40, classTsid: 'cherry', qty: 1 }));
    send(qs, shrineDonationQuestEvents('lem', { ok: true, favor: 12, dailyFavor: 12, rawFavor: 12, classTsid: 'cherry', qty: 1 }));
    assert.equal(progress(qs, 'donate_1000_favor_every_giant_one_day', 'earned_favor_lem'), 52);
    assert.equal(progress(qs, 'betterlearning_collect_favor_points', 'favor_points'), 12);
    const src = read('game.js');
    assert.match(src, /for \(const row of shrineDonationQuestEvents\(giantId, result\)\) emitGameEvent\(row\.event, row\.amount\);/);
    assert.match(src, /applyQuestProgress\(questState, 'favor_points', result\.favor, pc, \{ skipManaged: routesCounter\('favor_points'\) \}\)/);
  });

  it('Lemburgers to Lem, a Shaker to Friendly and a Pot to Pot count (shrines.js 608-609, 626-629)', () => {
    const qs = accepted('grilling_make_level2_recipes', 'tinkering_craft_medium_tools');
    send(qs, shrineDonationQuestEvents('pot', { ok: true, classTsid: 'lemburger', qty: 3 }));
    assert.equal(progress(qs, 'grilling_make_level2_recipes', 'lemburgers_donated'), 0, 'only Lem');
    send(qs, shrineDonationQuestEvents('lem', { ok: true, classTsid: 'lemburger', qty: 3 }));
    assert.equal(progress(qs, 'grilling_make_level2_recipes', 'lemburgers_donated'), 3);
    send(qs, shrineDonationQuestEvents('friendly', { ok: true, classTsid: 'cocktail_shaker', qty: 1 }));
    send(qs, shrineDonationQuestEvents('pot', { ok: true, classTsid: 'awesome_pot', qty: 1 }));
    assert.equal(progress(qs, 'tinkering_craft_medium_tools', 'cocktail_shaker_donated'), 1);
    assert.equal(progress(qs, 'tinkering_craft_medium_tools', 'awesome_pot_donated'), 1);
  });

  it('a Jellisac Super Harvest opens Slather on a Grendaline shrine (jellisac.js 198, npc_shrine_grendaline.js 496-529)', () => {
    const id = 'jellisachands_donate_jellisacs';
    const qs = accepted(id);
    const shrine = { classId: 'npc_shrine_grendaline', state: { giantId: 'grendaline' } };
    assert.equal(slatherVerb(shrine, qs), null, 'hidden before the super harvest');
    const node = createResourceNode('jellisac');
    const r = harvestResourceNode(node, { watering_can: 1 }, { energy: 50, imagination: 0 }, { now: 1, dayKey: 'd', rng: () => 0.01, skills: ['jellisac_hands_1'] });
    assert.ok(r.superHarvest);
    send(qs, r.achievementCounters);
    assert.equal(progress(qs, id, 'super_harvest_jellisac'), 1);
    assert.equal(slatherVerb({ classId: 'npc_shrine_lem', state: { giantId: 'lem' } }, qs), null);
    assert.equal(slatherVerb(shrine, qs).label, 'slather');
    const inv = { jellisac_clump: 6 };
    const lines = [];
    const engine = {
      questState: qs, inv,
      achievement: (counter, amount) => route(qs, counter, amount),
      pushActivity: (line) => lines.push(line), toast() {}, setData() {}, refreshPack() {}, updateHud() {}, save() {},
    };
    assert.equal(questVerbsFeature.runVerbOverride(shrine, SLATHER_VERB, engine), true);
    assert.equal(inv.jellisac_clump, 2);
    assert.equal(progress(qs, id, 'jellisacs_slathered'), 1);
    assert.deepEqual(lines, [SLATHER_COPY.done]);
    assert.equal(questVerbsFeature.runVerbOverride(shrine, 'donate', engine), null);
  });
});

describe('G457 A Purple Journey North', () => {
  it('a munch in Aranna sets the flag as the buff ends (purple_flower.js 296-298, catalog_buffs.js 1942)', () => {
    const id = 'purple_journey_north';
    const qs = accepted(id);
    route(qs, 'purple_flower:use', 1, { streetTsid: 'GA5101HF7F429V5' });
    route(qs, 'buff_expired:purple_flower');
    assert.equal(progress(qs, id, 'purple_journey_munch'), 0, 'not in Aranna');
    route(qs, 'purple_flower:use', 1, { streetTsid: PURPLE_JOURNEY_STREETS.find((t) => t.startsWith('G')) });
    assert.equal(progress(qs, id, 'purple_journey_munch'), 0, 'not until the buff ends');
    route(qs, 'buff_expired:purple_flower');
    assert.equal(progress(qs, id, 'purple_journey_munch'), 1);
    assert.match(read('game.js'), /features\.event\(`buff_\$\{event\.type\}:\$\{event\.classTsid\}`, 1, engine\);/);
  });
});

describe('soil (G446 G458 G462-G466)', () => {
  const darkCtx = () => ({
    inv: { hoe: 1, shovel: 1, bean_egg: 1 }, pc: { energy: 100, mood: 50, xp: 0, imagination: 0, currants: 0 },
    skills: [], upgrades: [], buffs: [], toolState: createToolConditionState(), hubId: 56, now: 1_000_000, rng: () => 0,
  });

  it('a Dark Patch tend and an Egg Plant Bean planted in one count (patch_dark.js 712, 760)', () => {
    const plot = createPlot('patch_dark');
    const c = darkCtx();
    const tend = performPlotVerb(plot, 'tend', c);
    assert.equal(tend.ok, true);
    const plant = performPlotVerb(plot, 'plant:bean_egg', c);
    assert.equal(plant.ok, true, plant.msg);
    const qs = accepted('soilappreciation_tend_patches', 'gardening_plant_beans_make_sure_become_trees');
    send(qs, tend.counters);
    send(qs, plant.counters);
    assert.equal(progress(qs, 'soilappreciation_tend_patches', 'patches_tended'), 1);
    assert.equal(progress(qs, 'gardening_plant_beans_make_sure_become_trees', 'beans_planted'), 1);
  });

  it('a Music Block from a Dark Patch counts (patch_dark.js 435)', () => {
    const qs = accepted('soilappreciation_tend_patch_get_drop');
    route(qs, 'skill_package_drop:patch_dark');
    assert.equal(progress(qs, 'soilappreciation_tend_patch_get_drop', 'patch_music_block'), 1);
  });

  it('Earth and Loam from a Dirt Pile count (dirt_pile.js 393, 414, 432)', () => {
    const qs = accepted('soilappreciation_dig_earth', 'soilappreciation_collect_loam');
    const node = createResourceNode('dirt_pile', { seed: 'x' });
    const inv = { shovel: 1 };
    const pc = { energy: 100, imagination: 0 };
    const earth = harvestResourceNode(node, inv, pc, { now: 1, dayKey: 'd', rng: () => 0.5 });
    send(qs, earth.achievementCounters);
    assert.equal(progress(qs, 'soilappreciation_dig_earth', 'dig_dirt'), 2);
    const loam = harvestResourceNode(node, inv, pc, { now: 1, dayKey: 'd', rng: (() => { const v = [0.05, 0.5]; let i = 0; return () => v[Math.min(i++, 1)]; })(), skills: ['soil_appreciation_4'] });
    assert.deepEqual(loam.outputs, [{ classTsid: 'loam', qty: 4 }]);
    send(qs, loam.achievementCounters);
    assert.equal(progress(qs, 'soilappreciation_collect_loam', 'dig_loam'), 4);
    assert.equal(progress(qs, 'soilappreciation_dig_earth', 'dig_dirt'), 2);
  });

  it('a bean planted in your own yard counts pol_beans_planted (patch.js 781-782)', () => {
    const qs = accepted('soilappreciation_plant_beans_in_back_yard_patches');
    route(qs, 'patch:plant_home');
    assert.equal(progress(qs, 'soilappreciation_plant_beans_in_back_yard_patches', 'pol_beans_planted'), 1);
    assert.equal(onOwnYard({ homeContext: () => ({ inHome: true, owned: true, room: 'street' }) }), true);
    assert.equal(onOwnYard({ homeContext: () => ({ inHome: true, owned: true, room: 'interior' }) }), false);
    assert.equal(onOwnYard({ homeContext: () => ({ inHome: false, owned: true, room: 'street' }) }), false);
  });

  it('a yard tree reaching full growth counts once (include/trants.js 792-799, wood_tree.js 1097-1104)', () => {
    const tree = (classId, maturity) => ({ stage: 'tree', tree: { classId, state: { maturity } } });
    const first = homeTreesGrown(null, { 'patch:0': tree('trant_bean', 9), 'patch:1': tree('wood_tree', 5) });
    assert.deepEqual(first.grown, []);
    const next = homeTreesGrown(first.maturity, { 'patch:0': tree('trant_bean', 10), 'patch:1': tree('wood_tree', 6), 'patch:2': tree('trant_egg', 10) });
    assert.deepEqual(next.grown, ['patch_0', 'patch_1'], 'a tree already grown before the look does not count');
    const qs = accepted('soilappreciation_get_all_back_yard_trees_to_level10');
    for (const label of [...next.grown, 'patch_0']) route(qs, `home_trant_grown:${label}`);
    assert.equal(progress(qs, 'soilappreciation_get_all_back_yard_trees_to_level10', 'pol_trants_fully_grown'), 2);
  });
});

describe('G459 Spread the Garlic Love', () => {
  it('a garlic kiss of a companion costs 5 energy, gives 5 mood and counts each once (emotional_bear.js 234-262)', () => {
    const bear = createEmotionalBearState({ upgrades: ['kiss'] });
    const pc = { energy: 50, mood: 50 };
    const r = performEmotionalBearAction(bear, pc, 'kiss', 'Amp', { garlic: true });
    assert.equal(r.ok, true);
    assert.equal(r.garlic, true);
    assert.equal(pc.energy, 45);
    assert.equal(pc.mood, 55);
    assert.equal(r.targetEffects.mood, -3);
    assert.match(r.message, /Hopefully they don't notice your garlic breath\. -5 energy, \+5 mood/);
    const plain = performEmotionalBearAction(bear, { energy: 50, mood: 50 }, 'kiss', 'Amp');
    assert.equal(plain.garlic, false);
    assert.equal(plain.effects.energy, -10);
    assert.equal(performEmotionalBearAction(bear, { energy: 5, mood: 50 }, 'kiss', 'Amp', { garlic: true }).reason, 'energy');
    const qs = accepted('spread_garlic_love');
    for (const who of ['Amp', 'Amp', 'Lily_Linguistic']) route(qs, `companion_garlic_kissed:${who}`);
    assert.equal(progress(qs, 'spread_garlic_love', 'players_garlic_kissed'), 2);
    assert.match(read('game.js'), /emitGameEvent\(`companion_garlic_kissed:\$\{String\(target\)\.replace/);
  });
});

describe('G470 Cold Comfort', () => {
  it('leaving Wintry Place with seconds counted starts the minute over (location.js 796-806)', () => {
    const qs = accepted(COLD_COMFORT);
    route(qs, 'meditation_seconds_wintry', 25);
    assert.equal(progress(qs, COLD_COMFORT, 'wintry_place_meditation'), 25);
    assert.equal(wintryPlaceLeave(qs, 'GA5101HF7F429V5'), false, 'not a Wintry Place street');
    assert.equal(wintryPlaceLeave(qs, 'GM413ATO8PR54'), true);
    assert.equal(progress(qs, COLD_COMFORT, 'wintry_place_meditation'), 0);
    assert.equal(wintryPlaceLeave(qs, 'GM413ATO8PR54'), false, 'nothing to clear');
    assert.match(COLD_COMFORT_LEAVE_TEXT, /^Too cold for ya, eh\? <split butt_txt=/);
    assert.ok(!/—/.test(COLD_COMFORT_LEAVE_TEXT));
  });
});

describe('routing report', () => {
  it('lists none of the fixed counters as waiting on an event', () => {
    const { unemitted } = questRoutingReport();
    const waiting = new Set(Object.values(unemitted).flat().map((row) => row.requirement));
    for (const name of [
      'favor_unique_shrines', 'earned_favor_alph', 'trant_harvest_wood_tree', 'trant_harvest_paper_tree', 'tool_broke_watering_can',
      'ore_crushed', 'refined_element_red', '100_metal_smelted', 'machine_shop_pit_stop_complete', 'seeds_extracted',
      'herb_seeds_planted_shucks', 'tinkertool_15s_repair', 'pol_trants_fully_grown', 'super_harvest_herb', 'heal_trant',
      'harvest_bonus_trant_bean', 'harvest_max_wood_tree', 'gardening_harvest_last_egg_plant', 'super_harvest_jellisac',
      'jellisacs_slathered', 'lemburgers_donated', 'cocktail_shaker_donated', 'awesome_pot_donated', 'find_ix_hole',
      'purple_journey_munch', 'pol_beans_planted', 'players_garlic_kissed', 'generic_bag_purchased', 'visit_seam_street',
      'patch_music_block', 'dig_dirt', 'dig_loam', 'beans_planted', 'patches_tended', 'trees_watered', 'wintry_place_meditation',
    ]) {
      for (const type of ['counter', 'flag']) assert.ok(!waiting.has(`${type}:${name}`), `${type}:${name}`);
    }
  });
});

describe('G447 Mini Me, Mini You', () => {
  it('Give a cubimal to shows only while the quest is open, once per cubimal (street_spirit.js 132-215)', () => {
    const qs = createQuestState();
    const fox = { classId: 'npc_fox', label: 'Fox' };
    assert.equal(giveCubimalVerb(fox, qs, { npc_cubimal_fox: 1 }, []), null, 'no quest, no verb');
    acceptOffer(qs, 'mini_me_mini_you', { inv: {}, now: 1 });
    assert.equal(giveCubimalVerb(fox, qs, {}, []).reason, "You don't have a cubimal of Fox");
    assert.equal(giveCubimalVerb(fox, qs, { npc_cubimal_fox: 1 }, []).enabled, true);
    assert.equal(giveCubimalVerb(fox, qs, { npc_cubimal_fox: 1 }, ['npc_cubimal_fox']).reason, 'You already gave away a Fox cubimal');
    assert.equal(giveCubimalVerb({ classId: 'npc_chicken', label: 'Chicken' }, qs, { npc_cubimal_chick: 1 }, []), null, 'no likeness in the map');
  });

  it('a gift uses the cubimal up, the character answers and the counter moves; the host adds it to feature NPCs', () => {
    const qs = createQuestState();
    acceptOffer(qs, 'mini_me_mini_you', { inv: {}, now: 1 });
    const inv = { npc_cubimal_fox: 1, npc_cubimal_piggy: 1 };
    const said = [];
    const engine = {
      questState: qs, inv,
      achievement: (counter, amount) => route(qs, counter, amount),
      say: (target, text) => said.push(text), pushActivity() {}, toast() {}, setData() {}, refreshPack() {}, updateHud() {}, save() {},
    };
    questVerbsFeature.restore({});
    const foxFeature = { id: 'foxes', verbsFor: () => [{ id: 'pet', label: 'pet' }] };
    const host = createFeatureHost([foxFeature, questVerbsFeature]);
    const fox = { classId: 'npc_fox', label: 'Fox', featureId: 'foxes' };
    const verbs = host.verbsFor(fox, engine);
    assert.deepEqual(verbs.map((v) => v.id), ['pet', GIVE_CUBIMAL_VERB]);
    assert.equal(questVerbsFeature.runVerbOverride(fox, GIVE_CUBIMAL_VERB, engine), true);
    assert.equal(inv.npc_cubimal_fox || 0, 0);
    assert.ok(CUBIMAL_GIFT_RESPONSES.includes(said[0]));
    assert.equal(progress(qs, 'mini_me_mini_you', 'npcs_given_cubimals'), 1);
    assert.equal(host.verbsFor(fox, engine).find((v) => v.id === GIVE_CUBIMAL_VERB).enabled, false);
    const piggy = { classId: 'npc_piggy', label: 'Piggy' };
    const menu = questVerbsFeature.decorateVerbs(piggy, [{ id: 'pet', sort: 10 }], engine);
    assert.ok(menu.some((v) => v.id === GIVE_CUBIMAL_VERB));
    questVerbsFeature.runVerbOverride(piggy, GIVE_CUBIMAL_VERB, engine);
    assert.equal(progress(qs, 'mini_me_mini_you', 'npcs_given_cubimals'), 2);
    assert.deepEqual(questVerbsFeature.save(), { given: ['npc_cubimal_fox', 'npc_cubimal_piggy'] });
    questVerbsFeature.restore({});
  });
});
