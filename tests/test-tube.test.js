/**
 * Audit rules-a #15 (Austin's go 2026-11-12): the Test Tube's sixteen compounds start unknown and are
 * found by Experimenting (js/test-tube.js, js/test-tube-panel.js, features/compound-discovery-feature.js).
 * Saves from before the rule keep all sixteen.
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPOUND_RECIPE_IDS,
  DESTROYED_LINE,
  EXPERIMENT_ELEMENTS,
  EXPERIMENT_SLOTS,
  EXPERIMENT_WAIT_MS,
  NOTHING_LINE,
  RETURNED_LINE,
  addToSlots,
  compoundRecipes,
  experimentBlockedLine,
  experimentTooltip,
  findBestMatch,
  inputsMatch,
  normalizeKnownCompounds,
  runExperiment,
  setSlotCount,
  slotsToInputs,
  stampKnownCompounds,
} from '../public/js/test-tube.js?v=2537c05b';
import { COMPOUND_DISCOVERY_FEATURE_ID, compoundDiscoveryFeature } from '../public/js/features/compound-discovery-feature.js?v=32037700';
import { RECIPE_CATALOG, TOOL_CATALOG, canCraft, compoundKnown, ensureMakingItems, loadRecipeCatalogFromFile, recipeBlockedLine, recipeKnown, searchRecipes } from '../public/js/making.js?v=eddcceac';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=477fdb26';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');
const client = join(root, '../glitch-client/com/tinyspeck/engine');
const RED = 'element_red';
const GREEN = 'element_green';
const BLUE = 'element_blue';
const SHINY = 'element_shiny';
const tube = (extra = {}) => ({ test_tube: 1, ...extra });
const pc = () => ({ energy: 100, imagination: 0, xp: 0 });
const ids = (list) => list.map((r) => String(r.id));

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));
  ensureMakingItems();
});
beforeEach(() => compoundDiscoveryFeature.restore(undefined));

describe('the rules come from the source', () => {
  it('are the Test Tube experiment verb: four slots, five seconds, recipes 146-161', { skip: !existsSync(gsjs) }, () => {
    const src = readFileSync(join(gsjs, 'items/test_tube.js'), 'utf8');
    assert.match(src, /verbs\.experiment = \{/);
    assert.match(src, /slots\s*: 4,/);
    assert.match(src, /try_wait\s*: 5,/);
    assert.match(src, /recipes\s*: \[146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161\]/);
    assert.match(src, /can_discover\s*: true/);
    assert.match(src, /"tooltip"\s*: "Make compounds\. You have discovered \$recipes_known compounds"/);
    assert.equal(EXPERIMENT_SLOTS, 4);
    assert.equal(EXPERIMENT_WAIT_MS, 5000);
    const making = readFileSync(join(gsjs, 'players/inc_making.js'), 'utf8');
    assert.ok(making.includes(`That recipe didn\\'t make anything!`));
    assert.ok(making.includes(RETURNED_LINE));
    assert.ok(making.includes(DESTROYED_LINE));
    assert.ok(making.includes('var bonus_xp = this.stats_add_xp(50, false, context);'));
  });

  it('take the four elements the client allowed', { skip: !existsSync(client) }, () => {
    const src = readFileSync(join(client, 'view/ui/making/MakingTryUI.as'), 'utf8');
    assert.match(src, /ALLOWED_ITEMS:Array = new Array\('element_red', 'element_green', 'element_blue', 'element_shiny'\)/);
    assert.deepEqual([...EXPERIMENT_ELEMENTS], [RED, GREEN, BLUE, SHINY]);
    assert.match(src, /label: 'Try it!'/);
  });

  it('cover exactly the sixteen learnt-0 recipes, all Test Tube ones', () => {
    assert.deepEqual(ids(compoundRecipes().map((r) => r.recipe)), [...COMPOUND_RECIPE_IDS]);
    const discoverable = Object.values(RECIPE_CATALOG).filter((r) => r.discoverable);
    assert.deepEqual(ids(discoverable).sort(), [...COMPOUND_RECIPE_IDS].sort());
    assert.ok(discoverable.every((r) => r.tool === 'test_tube' && r.learnt === 0));
  });

  it('the Make window asks to experiment, and the verb tooltip counts what is known', () => {
    assert.equal(TOOL_CATALOG.test_tube.action, 'experiment');
    assert.equal(experimentTooltip(3), 'Make compounds. You have discovered 3 compounds');
  });
});

describe('matching a mix (makingInputsMatch, makingFindBestMatch)', () => {
  const groddlene = { inputs: [{ classTsid: RED, qty: 6 }, { classTsid: GREEN, qty: 3 }] }; // recipe 146

  it('needs every ingredient at its count; extra counts score', () => {
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 6], [GREEN, 3]]), 0);
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 8], [GREEN, 3]]), 2);
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 5], [GREEN, 3]]), null);
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 6]]), null);
  });

  it('allows one other kind on top, never two', () => {
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 6], [GREEN, 3], [BLUE, 2]]), 2);
    assert.equal(inputsMatch(groddlene.inputs, [[RED, 6], [GREEN, 3], [BLUE, 1], [SHINY, 1]]), null);
  });

  it('picks the lowest score among compounds not yet known', () => {
    // 1 red, 1 green, 1 blue fits Diabolic Acid exactly (161).
    assert.equal(findBestMatch([[RED, 1], [GREEN, 1], [BLUE, 1]]), 'diabolic_acid');
    // 2 red + 1 blue is Tiite (153) exactly; Diabolic Acid would need a green.
    assert.equal(findBestMatch([[RED, 2], [BLUE, 1]]), 'tiite');
    // 2 red, 1 green, 1 blue: Tiite scores 1 (the green), Diabolic Acid 1 (a red over); a tie goes to the first.
    assert.equal(findBestMatch([[RED, 2], [GREEN, 1], [BLUE, 1]]), 'tiite');
    // Known compounds are never discovered again.
    assert.equal(findBestMatch([[RED, 1], [GREEN, 1], [BLUE, 1]], { known: ['161'] }), null);
    assert.equal(findBestMatch([[RED, 2], [BLUE, 1]], { known: ['153'] }), null);
  });
});

describe('an experiment (finishMakingUnknown)', () => {
  it('discovers, takes the recipe, destroys the extras, and gives the 50 iMG bonus', () => {
    const inv = tube({ [RED]: 5, [GREEN]: 5, [BLUE]: 5 });
    const p = pc();
    const out = runExperiment(inv, p, [[RED, 1], [GREEN, 1], [BLUE, 3]], { known: [] });
    assert.equal(out.ok, true);
    assert.equal(out.key, 'diabolic_acid');
    assert.deepEqual([inv[RED], inv[GREEN], inv[BLUE], inv.diabolic_acid], [4, 4, 2, 1]);
    assert.deepEqual(out.destroyed, [[BLUE, 2]]);
    assert.equal(out.extraLine, 'Your extra 2 Blue Elements was destroyed in the process.');
    assert.equal(out.xp, 50);
    assert.equal(p.imagination, 50);
    assert.equal(out.activityLine, 'You discovered how to make recipe Diabolic Acid! 0 energy, +50iMG');
  });

  it('half the time gives everything back', () => {
    const inv = tube({ [RED]: 5, [SHINY]: 5 });
    const p = pc();
    const out = runExperiment(inv, p, [[RED, 2], [SHINY, 2]], { known: [], rng: () => 0.2 });
    assert.equal(out.ok, false);
    assert.equal(out.returned, true);
    assert.deepEqual(out.lines, [NOTHING_LINE, RETURNED_LINE]);
    assert.deepEqual([inv[RED], inv[SHINY], p.imagination], [5, 5, 0]);
  });

  it('otherwise destroys the mix for 75% of its base cost as iMG', () => {
    const inv = tube({ [RED]: 20, [SHINY]: 5 });
    const p = pc();
    // 10 red at 0.2 + 3 shiny at 1 = 5; 75% = 3.75 -> 4.
    const out = runExperiment(inv, p, [[RED, 10], [SHINY, 3]], { known: [], rng: () => 0.9 });
    assert.equal(out.returned, false);
    assert.equal(out.xp, 4);
    assert.deepEqual([inv[RED], inv[SHINY], p.imagination], [10, 2, 4]);
    assert.deepEqual(out.lines, [NOTHING_LINE, DESTROYED_LINE, 'That was a learning experience: +4 iMG.']);
  });

  it('a known compound mixed again makes nothing (only learnt 0, not yet known)', () => {
    const inv = tube({ [RED]: 1, [GREEN]: 1, [BLUE]: 1 });
    const out = runExperiment(inv, pc(), [[RED, 1], [GREEN, 1], [BLUE, 1]], { known: ['161'], rng: () => 0.1 });
    assert.equal(out.reason, 'nothing');
  });

  it('refuses a mix the pack no longer holds', () => {
    const out = runExperiment(tube({ [RED]: 1 }), pc(), [[RED, 2]], { known: [] });
    assert.deepEqual([out.ok, out.reason, out.lines[0]], [false, 'ingredients', 'Not enough ingredients?']);
  });

  it('needs a Test Tube and Alchemy I', () => {
    assert.equal(experimentBlockedLine({}, ['alchemy_1']), 'You need a Test Tube to make this');
    assert.equal(experimentBlockedLine(tube(), []), 'You need to know Alchemy I to use this.');
    assert.equal(experimentBlockedLine(tube(), ['alchemy_1']), '');
  });
});

describe('the four slots (MakingTryUI)', () => {
  it('stack one element per slot, up to what the pack holds, four kinds at most', () => {
    const inv = { [RED]: 2, [GREEN]: 9, [BLUE]: 9, [SHINY]: 9, metal_rock: 9 };
    let slots = [];
    slots = addToSlots(slots, RED, inv);
    slots = addToSlots(slots, RED, inv);
    assert.deepEqual(slots, [{ cls: RED, n: 2 }]);
    assert.equal(addToSlots(slots, RED, inv), slots, 'no third red');
    assert.equal(addToSlots(slots, 'metal_rock', inv), slots, 'elements only');
    for (const cls of [GREEN, BLUE, SHINY]) slots = addToSlots(slots, cls, inv);
    assert.equal(slots.length, 4);
    slots = setSlotCount(slots, 1, 50, inv);
    assert.equal(slots[1].n, 9);
    slots = setSlotCount(slots, 0, 0, inv);
    assert.deepEqual(slotsToInputs(slots), [[GREEN, 9], [BLUE, 1], [SHINY, 1]]);
  });
});

describe('who knows which compounds', () => {
  it('a save from before the rule keeps all sixteen; a new character has none', () => {
    assert.deepEqual(stampKnownCompounds('{"v":1}'), [...COMPOUND_RECIPE_IDS]);
    assert.deepEqual(stampKnownCompounds({ systems: {} }), [...COMPOUND_RECIPE_IDS]);
    assert.deepEqual(stampKnownCompounds(null), []);
    assert.deepEqual(normalizeKnownCompounds(['161', 146, 'nope', '161']), ['146', '161']);
  });

  it('the feature stamps an old save (no slice) with all sixteen, once', () => {
    compoundDiscoveryFeature.restore(undefined);
    compoundDiscoveryFeature.stampOnce('{"old":true}');
    assert.equal(compoundDiscoveryFeature.knownCompounds().length, 16);
    assert.ok(recipeKnown(RECIPE_CATALOG.groddlene));
    assert.equal(searchRecipes('', { tool: 'test_tube' }).length, 16);
  });

  it('a new character sees no compounds until it discovers one', () => {
    compoundDiscoveryFeature.restore(undefined);
    compoundDiscoveryFeature.stampOnce(null);
    assert.deepEqual(compoundDiscoveryFeature.knownCompounds(), []);
    assert.equal(searchRecipes('', { tool: 'test_tube' }).length, 0);
    assert.equal(recipeKnown(RECIPE_CATALOG.groddlene), false);
    const inv = tube({ [RED]: 6, [GREEN]: 3 });
    const check = canCraft(inv, RECIPE_CATALOG.groddlene, { learned: ['alchemy_1'] });
    assert.deepEqual([check.ok, check.reason], [false, 'undiscovered']);
    assert.equal(recipeBlockedLine(RECIPE_CATALOG.groddlene, check), "You don't know how to make this");
    compoundDiscoveryFeature.learnCompound('146');
    assert.deepEqual(ids(searchRecipes('', { tool: 'test_tube' })), ['146']);
    assert.ok(canCraft(inv, RECIPE_CATALOG.groddlene, { learned: ['alchemy_1'] }).ok);
    // Other tools are untouched.
    assert.ok(compoundKnown(RECIPE_CATALOG.berry_bowl ?? { id: '1' }));
  });

  it('a stamped slice stands: a later stamp changes nothing, and it survives a save', () => {
    compoundDiscoveryFeature.restore({ stamped: true, known: ['153', '146'] });
    compoundDiscoveryFeature.stampOnce('{"any":"save"}');
    assert.deepEqual(compoundDiscoveryFeature.knownCompounds(), ['146', '153']);
    const snapshot = createPlayerSave({ inventory: {}, player: {}, systems: { features: { [COMPOUND_DISCOVERY_FEATURE_ID]: compoundDiscoveryFeature.save() } }, savedAt: 5 });
    const back = parsePlayerSave(serializePlayerSave(snapshot));
    assert.deepEqual(back.systems.features[COMPOUND_DISCOVERY_FEATURE_ID], { stamped: true, known: ['146', '153'] });
  });

  it('before any stamp every compound counts as known (tools, tests, boot)', () => {
    compoundDiscoveryFeature.restore(undefined);
    assert.equal(compoundDiscoveryFeature.knownCompounds(), null);
    assert.ok(recipeKnown(RECIPE_CATALOG.groddlene));
  });
});

describe('game wiring', () => {
  const game = read('public/game.js');
  it('stamps beside the quest-recipe stamp, from the stored save or null', () => {
    assert.match(game, /features\.get\('compound-discovery'\)\?\.stampOnce\(savedPlayerState \? storedPlayerSave : null, engine\)/);
    assert.match(read('public/js/features/index.js'), /FEATURES\.push\(compoundDiscoveryFeature\)/);
  });
  it('the Test Tube offers Experiment in the pack and "Try to make something new" in Make', () => {
    assert.match(game, /classTsid === EXPERIMENT_TOOL \? 'Experiment'/);
    assert.match(game, /makeTryTile\(\)/);
    assert.match(game, /testTubePanel\.tick\(deltaMs\)/);
  });
});
