/**
 * G437: the sixteen recipes the original's quests teach, and who keeps them from before the gate
 * (js/recipe-memory.js, features/recipe-memory-feature.js, Austin 2026-11-07).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BEAKER_BADGES, TAUGHT_FOODS, TAUGHT_POWDERS, normalizeKeptRecipes, stampKeptRecipes } from '../public/js/recipe-memory.js?v=3c72d749';
import { RECIPE_MEMORY_FEATURE_ID, recipeMemoryFeature, recipesLearnedFrom } from '../public/js/features/recipe-memory-feature.js?v=b88942c4';
import { RECIPE_CATALOG, canCraft, recipeKnown, searchRecipes } from '../public/js/making.js?v=b0053dac';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=9c00cbd7';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipes = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
const read = (path) => readFileSync(join(root, path), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');

const FOODS = Object.keys(TAUGHT_FOODS);
const POWDERS = Object.keys(TAUGHT_POWDERS);
const ALL = [...FOODS, ...POWDERS];
const sorted = (list) => [...list].sort();
const achievements = (over = {}) => ({ progress: {}, unlocked: [], groups: {}, ...over });
const save = (systems) => ({ systems });

describe('which recipes the quests teach', () => {
  it('are sixteen, and recipes.json names the teaching quest of each', () => {
    assert.equal(ALL.length, 16);
    for (const [id, row] of Object.entries({ ...TAUGHT_FOODS, ...TAUGHT_POWDERS })) {
      const recipe = recipes[row.key];
      assert.ok(recipe, row.key);
      assert.equal(recipe.id, id, row.key);
      assert.equal(recipe.taughtBy, row.quest, row.key);
      assert.equal(recipe.learnt, 2, row.key);
      assert.deepEqual(recipe.skills, [], row.key);
      assert.deepEqual(recipe.outputs.map((o) => o.classTsid), [row.key]);
    }
    assert.deepEqual(sorted(Object.entries(recipes).filter(([, r]) => r.taughtBy && r.id !== '305').map(([, r]) => r.id)), sorted(ALL));
  });

  it('match the quests\' own onComplete', { skip: !existsSync(gsjs) }, () => {
    for (const [id, row] of Object.entries({ ...TAUGHT_FOODS, ...TAUGHT_POWDERS })) {
      const text = readFileSync(join(gsjs, `quests/${row.quest}.js`), 'utf8');
      assert.ok(text.includes(`pc.making_try_learn_recipe(${id});`), `${row.quest} teaches ${id}`);
    }
  });

  it('foods are cooking tools, whose outputs making_food records, and powders the Beaker', () => {
    const cooking = new Set(['knife_and_board', 'frying_pan', 'blender', 'cocktail_shaker', 'mike_tyson_grill']);
    for (const row of Object.values(TAUGHT_FOODS)) assert.ok(cooking.has(recipes[row.key].tool), row.key);
    for (const row of Object.values(TAUGHT_POWDERS)) assert.equal(recipes[row.key].tool, 'beaker', row.key);
  });

  it('names every badge that counts Beaker use', () => {
    const raw = JSON.parse(read('public/assets/content/achievements.json'));
    const catalog = raw.achievements || raw;
    const counting = Object.entries(catalog)
      .filter(([, def]) => (def.conditions || []).some((c) => c.group === 'making_tool' && c.name === 'beaker'))
      .map(([id]) => id);
    assert.deepEqual(sorted(counting), sorted(BEAKER_BADGES));
  });
});

describe('the stamp', () => {
  it('keeps nothing for a new player with no save', () => {
    assert.deepEqual(stampKeptRecipes(null), []);
    assert.deepEqual(stampKeptRecipes(''), []);
  });

  it('keeps the foods making_food lists, and only those', () => {
    const kept = stampKeptRecipes(save({ achievements: achievements({ groups: { making_food: ['hash', 'berry_bowl', 'fried_egg'] } }) }));
    assert.deepEqual(sorted(kept), sorted(['5', '98']));
  });

  it('keeps all eight powders for anyone who has used a Beaker, in progress or unlocked', () => {
    const inProgress = stampKeptRecipes(save({ achievements: achievements({ progress: { entrylevel_admixificator: { progress: { beaker: 1 } } } }) }));
    assert.deepEqual(sorted(inProgress), sorted(POWDERS));
    const unlocked = stampKeptRecipes(save({ achievements: achievements({ unlocked: ['senior_admixificator'] }) }));
    assert.deepEqual(sorted(unlocked), sorted(POWDERS));
    const never = stampKeptRecipes(save({ achievements: achievements({ progress: { entrylevel_admixificator: { progress: { beaker: 0 } } } }) }));
    assert.deepEqual(never, []);
  });

  it('keeps all sixteen for a Craftybot owner, not for one still waiting on the box', () => {
    const owner = stampKeptRecipes(save({ achievements: achievements(), features: { craftybot: { owned: true } } }));
    assert.deepEqual(sorted(owner), sorted(ALL));
    assert.deepEqual(stampKeptRecipes(save({ achievements: achievements(), features: { craftybot: { owned: false } } })), []);
  });

  it('fails open on a save with no achievement data to read', () => {
    for (const raw of [save({}), {}, save({ achievements: null }), save({ achievements: [] }), save({ achievements: { unlocked: [], progress: {} } }), 'not json']) {
      assert.deepEqual(sorted(stampKeptRecipes(raw)), sorted(ALL), JSON.stringify(raw));
    }
  });

  it('reads a save as stored, a string', () => {
    assert.deepEqual(stampKeptRecipes(JSON.stringify(save({ achievements: achievements({ groups: { making_food: ['hash'] } }) }))), ['5']);
  });

  it('keeps only taught ids from a stored slice', () => {
    assert.deepEqual(normalizeKeptRecipes(['5', 5, '99999', null]), ['5']);
    assert.deepEqual(normalizeKeptRecipes('5'), []);
  });
});

describe('a locked recipe', () => {
  before(() => {
    Object.assign(RECIPE_CATALOG, recipes);
  });
  const hash = () => recipes.hash;

  it('is known after its quest, from the stamp, or when the caller asks about no quests', () => {
    assert.equal(recipeKnown(hash(), [], []), false);
    assert.equal(recipeKnown(hash(), []), false);
    assert.equal(recipeKnown(hash(), ['cheffery_make_level1_recipes'], []), true);
    assert.equal(recipeKnown(hash(), [], ['5']), true);
    assert.equal(recipeKnown(hash()), true, 'no quest list: nothing is gated');
    assert.equal(recipeKnown(recipes.fried_egg ?? { id: '17' }, [], []), true, 'not quest-taught');
  });

  it('refuses to be made, and explains itself as the client did', () => {
    const inv = { frying_pan: 1, meat: 1, potato: 2, corn: 2 };
    assert.equal(canCraft(inv, hash(), { completedQuests: [], keptRecipes: [] }).reason, 'quest');
    assert.notEqual(canCraft(inv, hash(), { completedQuests: [], keptRecipes: ['5'] }).reason, 'quest');
    assert.notEqual(canCraft(inv, hash(), { completedQuests: ['cheffery_make_level1_recipes'], keptRecipes: [] }).reason, 'quest');
  });

  it('stays out of the Make list until known', () => {
    const has = (opts) => searchRecipes('hash', { tool: 'all', ...opts }).some((r) => r.id === '5');
    assert.equal(has({ completedQuests: [], keptRecipes: [] }), false);
    assert.equal(has({ completedQuests: [], keptRecipes: ['5'] }), true);
    assert.equal(has({ completedQuests: ['cheffery_make_level1_recipes'], keptRecipes: [] }), true);
  });

  it('reaches Craftybot, the pack and the Make panel through the kept list', () => {
    const bot = read('public/js/features/craftybot-feature.js');
    assert.match(bot, /recipeKnown\(r, done, engine\.query\?\.\('keptRecipes'\)\)/);
    const game = read('public/game.js');
    assert.match(game, /const relatedRecipes = listRecipes\(\)\.filter\(\(recipe\) =>\n[^\n]*recipeKnownNow\(recipe\)/, '"Used in N" leaves out locked recipes');
    assert.match(game, /listRecipesForTool\(classTsid\)\.filter\(recipeKnownNow\)/);
    assert.equal(game.split("keptRecipes: features.query('keptRecipes')").length - 1, 2, 'craftOpts and the Make list');
  });
});

describe('the stamp in a save', () => {
  const quests = (completed = []) => ({ completed });
  const engine = (questState = quests()) => {
    const lines = [];
    return { questState, lines, data: {}, setData(k, v) { this.data[k] = v; }, pushActivity: (line) => lines.push(line) };
  };

  it('is one for a new game, and stands after that whatever the save later holds', () => {
    recipeMemoryFeature.restore(undefined);
    const e = engine();
    recipeMemoryFeature.stampOnce(null, e);
    assert.deepEqual(recipeMemoryFeature.keptRecipes(), []);
    assert.equal(e.data.recipesStamped, '1');
    assert.deepEqual(recipeMemoryFeature.save(), { stamped: true, kept: [] });
    // The next boot: the player has since got a Craftybot. Buying one unlocks nothing.
    recipeMemoryFeature.restore(recipeMemoryFeature.save());
    recipeMemoryFeature.stampOnce(JSON.stringify(save({ achievements: achievements(), features: { craftybot: { owned: true } } })), e);
    assert.deepEqual(recipeMemoryFeature.keptRecipes(), []);
  });

  it('is taken from an old save once, and keeps what it found', () => {
    recipeMemoryFeature.restore(undefined);
    recipeMemoryFeature.stampOnce(save({ achievements: achievements({ groups: { making_food: ['hash'] } }) }), engine());
    assert.deepEqual(recipeMemoryFeature.keptRecipes(), ['5']);
    recipeMemoryFeature.restore(recipeMemoryFeature.save());
    recipeMemoryFeature.stampOnce(save({ achievements: achievements() }), engine());
    assert.deepEqual(recipeMemoryFeature.keptRecipes(), ['5'], 'a later save with less on it takes nothing back');
  });

  it('survives the save format, solo and online alike', () => {
    recipeMemoryFeature.restore({ stamped: true, kept: ['5', '162'] });
    const snapshot = createPlayerSave({ inventory: {}, player: {}, systems: { features: { [RECIPE_MEMORY_FEATURE_ID]: recipeMemoryFeature.save() } }, savedAt: 5 });
    const back = parsePlayerSave(serializePlayerSave(snapshot));
    assert.deepEqual(back.systems.features[RECIPE_MEMORY_FEATURE_ID], { stamped: true, kept: ['5', '162'] });
  });

  it('a save without the slice is stamped; a broken slice is too', () => {
    recipeMemoryFeature.restore({ kept: ['5'] });
    assert.equal(recipeMemoryFeature.save().stamped, false);
    assert.deepEqual(recipeMemoryFeature.keptRecipes(), []);
  });
});

describe('You learned how to make X!', () => {
  const makeEngine = (completed) => {
    const lines = [];
    return { questState: { completed }, lines, setData() {}, pushActivity: (line) => lines.push(line) };
  };

  it('names what a quest teaches, less what the save already kept', () => {
    const catalog = recipes;
    const names = (ids) => recipesLearnedFrom('cheffery_make_level1_recipes', catalog, ids).map((r) => r.name).sort();
    assert.deepEqual(names([]), ['Best Bean Dip', "Gamma's Pancakes", 'Hash']);
    assert.deepEqual(names(['5']), ['Best Bean Dip', "Gamma's Pancakes"]);
    assert.deepEqual(recipesLearnedFrom('some_other_quest', catalog, []), []);
  });

  it('is said once as the quest finishes, never for a quest the save already held', () => {
    Object.assign(RECIPE_CATALOG, { hash: recipes.hash, best_bean_dip: recipes.best_bean_dip, gammas_pancakes: recipes.gammas_pancakes, berry_bowl: recipes.berry_bowl });
    recipeMemoryFeature.restore({ stamped: true, kept: ['20'] });
    const completed = ['ezcooking_make_level1_recipes'];
    const e = makeEngine(completed);
    recipeMemoryFeature.onTick(16, 0, e);
    recipeMemoryFeature.onTick(16, 0, e);
    assert.deepEqual(e.lines, [], 'a quest finished before this load says nothing');
    completed.push('cheffery_make_level1_recipes');
    recipeMemoryFeature.onTick(16, 0, e);
    assert.deepEqual(e.lines.slice().sort(), ['You learned how to make Best Bean Dip!', 'You learned how to make Hash!']);
    recipeMemoryFeature.onTick(16, 0, e);
    assert.equal(e.lines.length, 2);
    assert.ok(!e.lines.join(' ').includes('—'));
  });
});
