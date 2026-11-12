/**
 * Report 119 (Friendly, 2026-11-06): a Saucepan recipe he couldn't make (no Saucery I) kept Make
 * lit and gave no reason, and the Make panel's title always showed a Tinkertool. The client said
 * why (MakingDetailsUI.as, MakingComponentUI.as) and titled the panel with the tool in use, its
 * broken_iconic when no copy works (MakingDialog.as setTitle 299, 305).
 * Run: node --test tests/make-why.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPE_CATALOG, TOOL_CATALOG, canCraft, ensureMakingItems, listMakingTools, loadRecipeCatalogFromFile, makeEmptyLine, makePanelIcon, recipeBlockedLine } from '../public/js/making.js?v=39f79aaa';
import { createInventory } from '../public/js/inventory.js?v=5be47371';
import { createToolConditionState, setToolRemaining } from '../public/js/tools.js?v=5f482998';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const client = join(root, '../glitch-client/com/tinyspeck/engine');
await loadRecipeCatalogFromFile(join(root, 'public/assets/content/recipes.json'));
ensureMakingItems();
const sauce = RECIPE_CATALOG.stock_sauce;
const full = { meat: 1, flour: 1, milk_butterfly: 1 };
const why = (recipe, invSeed, opts = {}, ctx = {}) => {
  const inv = createInventory(invSeed);
  return recipeBlockedLine(recipe, canCraft(inv, recipe, { requireSkill: true, requireTool: true, ...opts }), { inv, energyOk: true, skillName: (id) => ({ saucery_1: 'Saucery I' })[id] || id, achievementName: () => 'Able Chopper', ...ctx });
};

describe('report 119: a recipe that can\'t be made says why', () => {
  it('no skill: the case he hit, with the ingredients in his pack', () => {
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: [] }), 'You need Saucery I to make this');
  });

  it('it can be made: no line', () => {
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: ['saucery_1'] }), '');
  });

  it('energy is asked for last, when all else is fine', () => {
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: ['saucery_1'] }, { energyOk: false }), 'You need more energy!');
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: [] }, { energyOk: false }), 'You need Saucery I to make this');
  });

  it('ingredients: one, some, all (MakingDetailsUI.as 170-178)', () => {
    const opts = { learned: ['saucery_1'] };
    assert.equal(why(sauce, { saucepan: 1, meat: 1, flour: 1 }, opts), "You're missing an ingredient!");
    assert.equal(why(sauce, { saucepan: 1, meat: 1 }, opts), "You're missing 2 ingredients!");
    assert.equal(why(sauce, { saucepan: 1 }, opts), "You're missing all of the ingredients!");
    assert.equal(why({ ...sauce, inputs: [{ classTsid: 'meat', qty: 1 }] }, { saucepan: 1 }, opts), "You're missing an ingredient!");
  });

  it('the tool: none, broken, worn, out of fuel', () => {
    assert.equal(why(sauce, full, { learned: ['saucery_1'] }), 'You need a Saucepan to make this');
    const tools = createToolConditionState();
    setToolRemaining(tools, 'saucepan', 0);
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: ['saucery_1'], toolState: tools }), 'You need a working Saucepan to make this');
    const worn = createToolConditionState();
    setToolRemaining(worn, 'saucepan', 1);
    assert.equal(why(sauce, { saucepan: 1, ...full }, { learned: ['saucery_1'], toolState: worn, toolWear: 3 }), "That tool doesn't have enough wear left.");
    const machine = Object.values(RECIPE_CATALOG).find((r) => r.tool === 'metalmaker');
    const empty = createToolConditionState();
    setToolRemaining(empty, 'metalmaker', 0);
    assert.equal(why(machine, { metalmaker: 1 }, { learned: ['metalwork_1'], toolState: empty }), 'You need more fuel to make this');
    assert.equal(recipeBlockedLine(sauce, { ok: false, reason: 'tool', need: 'Awesome Pot' }), 'You need an Awesome Pot to make this');
  });

  it('every reason canCraft gives has words', () => {
    for (const reason of ['season', 'tool', 'broken_tool', 'skill', 'quest', 'achievement', 'ingredients', 'unknown']) {
      const line = recipeBlockedLine(sauce, { ok: false, reason, msg: 'Only on Pi Day.', need: 'Saucepan', skill: 'saucery_1', achievement: 'x', tool: 'saucepan' }, { inv: {} });
      assert.ok(line.length > 8, reason);
      assert.doesNotMatch(line, /—/);
    }
    assert.equal(recipeBlockedLine(sauce, { ok: false, reason: 'achievement', achievement: 'x' }, { achievementName: () => 'Able Chopper' }), 'You need to get the Able Chopper achievement.');
  });

  it('the panel: a blocked recipe offers none, shows the line and disables Make', () => {
    assert.match(game, /if \(!check\.ok\) return 0;/);
    assert.match(game, /class="make-why" data-make-why/);
    assert.match(game, /data-make-go \$\{maxMake < 1 \? `disabled title="\$\{escapeHtml\(blockedLine\)\}"` : ''\}/);
    assert.match(game, /toast\(makeBlockedLine\(recipe, check\)\);/);
    assert.doesNotMatch(game, /Not enough resources/);
  });

  it('the client\'s own words', () => {
    if (!existsSync(client)) return;
    const details = readFileSync(join(client, 'view/ui/making/MakingDetailsUI.as'), 'utf8');
    const component = readFileSync(join(client, 'view/ui/making/MakingComponentUI.as'), 'utf8');
    for (const s of ['You need more energy!', 'You need more fuel to make this', "You're missing all of the ingredients!", "You're missing \"+(missing_count == 1 ? 'an ingredient'", "'You need a working '+"]) assert.ok(details.includes(s), s);
    for (const s of ['to make this', "You don\\'t know how to make this"]) assert.ok(component.includes(s), s);
  });
});

describe('report 119: the Make title shows the tab\'s tool', () => {
  it('the tool of the tab, broken when no copy works, whole when you have none', () => {
    const inv = createInventory({ saucepan: 1 });
    const tools = createToolConditionState();
    assert.deepEqual(makePanelIcon('saucepan', inv, tools), { tool: 'saucepan', src: TOOL_CATALOG.saucepan.icon, broken: false });
    setToolRemaining(tools, 'saucepan', 0);
    assert.deepEqual(makePanelIcon('saucepan', inv, tools), { tool: 'saucepan', src: 'assets/sprites/icons/saucepan_broken.webp', broken: true });
    assert.equal(makePanelIcon('saucepan', createInventory({}), tools).broken, false);
    assert.equal(makePanelIcon('saucepan', inv, tools, true).broken, false, 'a machine standing in the world is not the pack\'s copy');
  });

  it('no tab (a search) is the panel\'s own icon', () => {
    assert.equal(makePanelIcon('', {}).tool, 'tinkertool');
    assert.equal(makePanelIcon('no_such_tool', {}).tool, 'tinkertool');
  });

  it('every tab has its picture', () => {
    for (const t of listMakingTools()) {
      const src = makePanelIcon(t.classTsid, {}).src.split('?')[0];
      assert.ok(existsSync(join(root, 'public', src)), `${t.classTsid}: ${src}`);
    }
  });

  it('the panel keeps the title in step with the open tool or the recipe', () => {
    // Report #175: the tools screen and a search over every tool keep the panel's own icon.
    assert.match(game, /const tool = selected \|\| \(makeView === 'tool' \? makeToolFilter : ''\);/);
    assert.ok(game.indexOf('syncMakePanelIcon();') > game.indexOf('function renderMakePanel()'));
  });
});

describe('G554: a recipe opened from far down the list opens at its top', () => {
  const body = game.slice(game.indexOf('function renderMakePanel()'), game.indexOf('function openMakePanel('));
  it('the tile keeps the list\'s place, then scrolls the recipe to its top, with Back in view', () => {
    const tile = body.slice(body.indexOf("tile.addEventListener('click'"));
    assert.ok(tile.indexOf('makeListScroll = makeScroller()?.scrollTop') < tile.indexOf('renderMakePanel()'), 'read before the list goes');
    assert.ok(tile.indexOf('setMakeScroll(0)') > tile.indexOf('renderMakePanel()'), 'set after the recipe is in');
  });
  it('Back returns to that place, after the list is back', () => {
    const back = game.slice(game.indexOf('function makeNavBack('), game.indexOf('function makeGridKey('));
    assert.ok(back.indexOf('setMakeScroll(makeListScroll)') > back.indexOf('renderMakePanel()'));
  });
  it('a recipe redrawn while open keeps its scroll: only the tile resets it', () => {
    assert.equal(body.split('setMakeScroll(0)').length - 1, 1);
  });
  it('both skins scroll the same element', () => {
    const page = readFileSync(join(root, 'public/play/index.html'), 'utf8');
    assert.match(game, /const makeScroller = \(\) => document\.querySelector\('#make-panel \.ui-sheet-body'\);/);
    assert.match(page, /class="[^"]*\bui-sheet-body\b[^"]*"[^>]*>\s*<div id="make-list"/);
  });
});

describe('report 129: Make says why "Can make now" is empty', () => {
  const skill = (id, need) => ({ id, name: id, tool: 'frying_pan', inputs: [{ classTsid: 'cherry', qty: need }] });

  it('counts the recipes the player knows and names the ingredients', () => {
    const recipes = [skill('a', 2), skill('b', 3)];
    assert.equal(makeEmptyLine({}, recipes, { requireSkill: false }), "You know 2 recipes here but don't have the ingredients.");
    assert.equal(makeEmptyLine({}, recipes.slice(0, 1), { requireSkill: false }), "You know 1 recipe here but don't have the ingredients.");
  });

  it('does not blame the ingredients when they are there (a tool or energy stops it)', () => {
    assert.equal(makeEmptyLine({ cherry: 9 }, [skill('a', 2)], { requireSkill: false }), "You know 1 recipe here but can't make any right now.");
  });

  it('has a button that turns the filter off', () => {
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(game, /makeEmptyLine\(inv, everyRecipe, opts\)/);
    assert.match(game, /data-make-show-all>Show them<\/button>/);
    assert.match(game, /\[data-make-show-all\]'\)\?\.addEventListener\('click', \(\) => \{\s*makeCanMakeOnly = false;/);
    assert.match(game, /let makeCanMakeOnly = true;/);
  });
});
