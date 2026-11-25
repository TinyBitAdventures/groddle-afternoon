/**
 * Pot Luck Day, part B (G982): the Harvest Table's rules, the quest Pot's Empty Table, Harvest
 * Stuffing, Pot's Cornucopia and the five badges (js/pot-luck-feast.js,
 * js/features/pot-luck-feast-feature.js; the shared table is the server's harvest_table.go).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISHES_NEEDED,
  FEAST_BADGES,
  HARVEST_DISHES,
  KEEPSAKE,
  LAID_COUNTER,
  QUEST,
  QUEST_COUNTER,
  STUFFING,
  STUFFING_ITEM,
  STUFFING_RECIPE,
  TABLE_LINES,
  TABLE_AT,
  TABLE_RULES,
  TABLE_STREET,
  DISH_BOX,
  dishSpots,
  createQuestState,
  createTableState,
  dishClasses,
  layCheck,
  layQuestNote,
  layOffering,
  layableKind,
  cropClasses,
  packAway,
  questComplete,
  questEvent,
  shownRows,
  tableCountLabel,
} from '../public/js/pot-luck-feast.js?v=971888be';
import { SEED_CATALOG } from '../public/js/garden.js?v=9c4cc027';
import { canCraft, setSeasonalRecipeCheck } from '../public/js/making.js?v=1ec1075e';
import { TROPHY_DECOR, isTrophyDecor, trophyOfBadge } from '../public/js/home-trophies.js?v=649b111e';
import { takesNoSlot } from '../public/js/pack-slots.js?v=38e4aea5';
import { dropFor } from '../public/js/world-drop.js?v=a8956ae5';
import { createAchievementState, applyAchievementProgress } from '../public/js/achievements.js?v=4add7f73';
import { setContentCatalogs } from '../public/js/content-catalogs.js?v=2b7048b9';
import { harvestTableData } from '../tools/build-realtime-harvest-table.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

after(() => setSeasonalRecipeCheck(null));

describe('the Harvest Table (pot-luck-feast.js)', () => {
  it('stands on Groddle Forest Junction and takes dishes and crops only', () => {
    assert.equal(TABLE_STREET, 'GLI3272LOTD1B1F');
    const street = readJson('public/assets/streets/GLI3272LOTD1B1F.json');
    assert.equal(street.label, 'Groddle Forest Junction');
    const recipes = readJson('public/assets/content/recipes.json');
    const dishes = dishClasses(recipes);
    const crops = cropClasses(SEED_CATALOG);
    for (const d of HARVEST_DISHES) assert.equal(layableKind(d, crops, dishes), 'dish', d);
    assert.equal(layableKind(STUFFING, crops, dishes), 'dish');
    assert.equal(layableKind('simple_slaw', crops, dishes), 'dish', 'a Knife & Board dish');
    assert.equal(layableKind('onion', crops, dishes), 'crop');
    assert.equal(layableKind('pick', crops, dishes), null);
    assert.equal(layableKind('cherry', crops, dishes), null, 'a fruit is food, not a crop');
    assert.equal(layableKind('bean_bean', crops, dishes), null, 'a seasoner output is no dish');
  });

  it('gives the server the same dishes and crops (G1015b, R4: the server took any food)', { skip: skipWithoutServer }, () => {
    const want = `${JSON.stringify(harvestTableData())}\n`;
    assert.equal(readFileSync(serverPath('data', 'harvest-table.json'), 'utf8'), want, 'run node tools/build-realtime-harvest-table.mjs');
    const d = harvestTableData();
    const recipes = readJson('public/assets/content/recipes.json');
    const taken = new Set([...d.dishes, ...d.crops]);
    const dishes = dishClasses(recipes);
    const crops = cropClasses(SEED_CATALOG);
    for (const c of taken) assert.ok(layableKind(c, crops, dishes), c);
    for (const c of [...dishes, ...crops]) assert.ok(taken.has(c), c);
    assert.ok(taken.has('pumpkin') && taken.has('pumpkin_pie') && taken.has(STUFFING));
    assert.equal(taken.has('cherry'), false);
  });

  it('takes every crop Glitch had: is_crop = 1 in GSJS, Pumpkin and the herbs too (the tag check missed 8)', () => {
    const gs = join(root, '../glitch-GameServerJS/items'); // beside the game, as other tests read it
    const crops = cropClasses(SEED_CATALOG);
    if (existsSync(gs)) {
      const gsjs = readdirSync(gs).filter((f) => f.endsWith('.js') && /this\.is_crop = 1;/.test(readFileSync(join(gs, f), 'utf8'))).map((f) => f.slice(0, -3)).sort();
      assert.deepEqual([...crops].sort(), gsjs, 'what a garden seed grows is what GSJS calls a crop');
    }
    assert.equal(crops.size, 20);
    const missed = ['pumpkin', 'purple_flower', 'rubeweed', 'rookswort', 'hairball_flower', 'silvertongue', 'gandlevery', 'yellow_crumb_flower'];
    const items = readJson('public/assets/content/making-items.json');
    for (const c of missed) {
      assert.ok(!(items[c]?.tags || []).includes('crop'), `${c} has no crop tag`);
      assert.equal(layableKind(c, crops, new Set()), 'crop', c);
    }
  });

  it('refuses in the order the server does: season, dish, pack', () => {
    assert.deepEqual(layCheck({ season: false, kind: 'dish', have: 1 }), { ok: false, code: 'no_season', msg: TABLE_LINES.noSeason });
    assert.equal(layCheck({ season: true, kind: null, have: 1 }).code, 'not_dish');
    assert.equal(layCheck({ season: true, kind: 'dish', have: 0, label: 'Potcorn' }).msg, 'You have no Potcorn.');
    assert.equal(layCheck({ season: true, kind: 'crop', have: 2 }).ok, true);
    // The server's lines are the same words (harvest_table.go feastTextNoSeason, feastTextNotDish).
    const go = readFileSync(join(root, '../groddle-afternoon-server/harvest_table.go'), 'utf8');
    assert.ok(go.includes(TABLE_LINES.noSeason) && go.includes(TABLE_LINES.notDish));
  });

  it('pays the day’s first offering once a game day per player, and keeps the newest', () => {
    const t = createTableState({}, 'pot_luck_day:2026');
    assert.equal(layOffering(t, { c: 'pumpkin_pie', who: 'a', day: 'd1' }).first, true);
    assert.equal(layOffering(t, { c: 'corn', who: 'a', day: 'd1' }).first, false);
    assert.equal(layOffering(t, { c: 'corn', who: 'b', day: 'd1' }).first, true);
    assert.equal(layOffering(t, { c: 'potcorn', who: 'a', day: 'd2' }).first, true);
    assert.deepEqual(shownRows(t, 2).map((r) => r.c), ['potcorn', 'corn']);
    for (let i = 0; i < TABLE_RULES.keep + 3; i += 1) layOffering(t, { c: 'corn', who: 'a', day: 'd2' });
    assert.equal(t.rows.length, TABLE_RULES.keep);
    assert.equal(t.total, TABLE_RULES.keep + 7);
    assert.equal(tableCountLabel(1000), '999+');
    assert.equal(tableCountLabel(12), '12');
  });

  it('draws the newest twelve in one row on three boards, none over another (2026-11-18)', () => {
    assert.equal(TABLE_RULES.shown, 12);
    assert.equal(TABLE_AT.pieces, 3);
    const spots = dishSpots(TABLE_RULES.shown);
    assert.equal(spots.length, 12);
    assert.equal(dishSpots(40).length, 12, 'never more than the table shows');
    assert.deepEqual(dishSpots(3), spots.slice(0, 3), 'fixed slots from the left: a short table does not spread out');
    const step = TABLE_AT.piece.w - TABLE_AT.overlap;
    const edge = ((TABLE_AT.pieces - 1) * step) / 2 + TABLE_AT.top / 2;
    for (let i = 0; i < spots.length; i += 1) {
      assert.ok(Math.abs(spots[i].x) + DISH_BOX / 2 <= edge, `dish ${i} on the board`);
      assert.equal(spots[i].y, spots[0].y, 'one row');
      // A 40 px icon fitted to the 34 px box draws its food in about 30 px: slots this far apart never cover each other.
      if (i) assert.ok(spots[i].x - spots[i - 1].x >= 30, `dish ${i} clear of dish ${i - 1}`);
    }
    // The table's middle stays right of the hub signpost (signpost_2 at x -291), its left end clear of the post.
    const leftEnd = TABLE_AT.x - ((TABLE_AT.pieces - 1) * step) / 2 - TABLE_AT.piece.w / 2;
    assert.ok(leftEnd > -291 + 40, `left end ${leftEnd}`);
  });

  it('is packed away when the season is over or a new year begins', () => {
    const t = createTableState({ key: 'pot_luck_day:2025', rows: [{ c: 'corn' }], total: 4, daily: { me: 'x' } }, 'pot_luck_day:2026');
    assert.deepEqual([t.key, t.rows.length, t.total, Object.keys(t.daily).length], ['pot_luck_day:2026', 0, 0, 0]);
    const off = packAway(createTableState({ key: 'pot_luck_day:2026', rows: [{ c: 'corn' }], total: 1 }), '');
    assert.deepEqual([off.key, off.total, off.rows.length], ['', 0, 0]);
  });
});

describe('Pot’s Empty Table', () => {
  it('counts three harvest dishes, one dressed Chicken and three harvest dishes laid', () => {
    const q = createQuestState({ status: 'active' }, 'pot_luck_day:2026');
    q.status = 'active';
    assert.equal(questEvent(q, 'making_recipe:simple_slaw').step, null, 'not a harvest dish');
    questEvent(q, 'making_recipe:pumpkin_pie');
    questEvent(q, 'making_recipe:potcorn');
    assert.equal(questEvent(q, 'making_recipe:hot_potatoes').step, 'dishes');
    assert.equal(questEvent(q, 'making_recipe:wavy_gravy').step, null, 'a fourth counts nothing');
    assert.equal(questEvent(q, 'chicken_dressed:turkey_tailfan').step, 'dressed');
    questEvent(q, 'harvest_table:laid', { cls: 'corn' });
    assert.equal(q.laid, 0, 'a crop is no harvest dish');
    questEvent(q, 'harvest_table:laid', { cls: 'pumpkin_pie' });
    questEvent(q, 'harvest_table:laid', { cls: 'potcorn' });
    const last = questEvent(q, 'harvest_table:laid', { cls: 'hot_potatoes' });
    assert.deepEqual(last, { step: 'laid', done: true });
    assert.ok(questComplete(q));
    assert.equal(q.dishes, DISHES_NEEDED);
  });

  it('counts nothing before it is accepted, and starts over in another year unless finished', () => {
    const q = createQuestState({}, 'pot_luck_day:2026');
    questEvent(q, 'making_recipe:pumpkin_pie');
    assert.equal(q.dishes, 0);
    const old = createQuestState({ key: 'pot_luck_day:2025', status: 'active', dishes: 2 }, 'pot_luck_day:2026');
    assert.deepEqual([old.status, old.dishes], ['', 0]);
    const done = createQuestState({ key: 'pot_luck_day:2025', status: 'done', dishes: 3, dressed: 1, laid: 3 }, 'pot_luck_day:2026');
    assert.equal(done.status, 'done');
  });

  it('says that only dishes cooked after accepting count, in the offer and on the step', () => {
    // Live 2026-11-22: players holding dishes cooked before the quest saw 0/3; the step now says when cooking counts.
    const step = QUEST.steps.find((s) => s.id === 'dishes');
    assert.match(step.desc, /^Cook harvest dishes after accepting \(/);
    assert.match(QUEST.offer[1].text, /any three you like, cooked from now on\./);
  });

  it('says the Chicken to dress is one out on the streets, in the offer, the step and the log line', () => {
    // Live 2026-11-22: a player with a costume looked for the Dress row on her own Chickens; only a street Chicken dresses up.
    const step = QUEST.steps.find((s) => s.id === 'dressed');
    assert.equal(step.desc, 'Dress a Chicken out on the streets for the feast');
    assert.match(QUEST.offer[1].text, /Dress up a Chicken out on the streets for the occasion\./);
    assert.match(QUEST.accepted, /dress a Chicken out on the streets,/);
  });

  it('says on each lay whether it counted: the count, or that only the five dishes do (#610)', () => {
    // #610: the table took any dish or crop and never said whether it counted toward the quest.
    const q = createQuestState({ status: 'active' }, 'pot_luck_day:2026');
    q.status = 'active';
    const lay = (cls) => {
      const note = layQuestNote(q, cls);
      questEvent(q, 'harvest_table:laid', { cls });
      return note;
    };
    const other = lay('corn');
    assert.match(other, /^It doesn’t count for Pot’s Empty Table: only /);
    const items = readJson('public/assets/content/making-items.json').items;
    for (const cls of HARVEST_DISHES) assert.ok(other.includes(items[cls].label), `${cls} named (${items[cls].label})`);
    assert.equal(lay('pumpkin_pie'), '1 of 3 harvest dishes laid for Pot’s Empty Table.');
    assert.equal(lay('simple_slaw'), other, 'a dish that is not one of the five');
    assert.equal(lay('potcorn'), '2 of 3 harvest dishes laid for Pot’s Empty Table.');
    assert.equal(lay('hot_potatoes'), '', 'the third: the step\'s own line says it is done');
    assert.equal(lay('corn'), '', 'nothing once the dishes are laid');
    assert.equal(layQuestNote(createQuestState({}, 'pot_luck_day:2026'), 'corn'), '', 'nothing before the quest is taken');
    for (const t of [QUEST.layNotCounted, QUEST.layCounted(2)]) assert.doesNotMatch(t, /—/);
  });

  it('the feature says the note in the lay line itself', () => {
    const src = readFileSync(join(pub, 'js/features/pot-luck-feast-feature.js'), 'utf8');
    const laid = src.slice(src.indexOf('function laid('), src.indexOf('/* ---------------------------------------------------------------- quest */'));
    assert.ok(laid.indexOf('layQuestNote(quest, cls)') > 0 && laid.indexOf('layQuestNote(quest, cls)') < laid.indexOf("questStep(engine, 'harvest_table:laid'"), 'read before the quest counts the lay');
  });

  it('is offered by the Magic Rock in four steps and pays favor with Pot', () => {
    assert.equal(QUEST.kicker, 'Magic Rock');
    // Step 1 is the offer (Pot wants a feast); the log counts the other three.
    assert.equal(1 + QUEST.steps.length, 4);
    assert.equal(QUEST.rewards.favor.giant, 'pot');
    for (const text of [...QUEST.offer.map((b) => b.text), QUEST.completion]) assert.doesNotMatch(text, /—/);
  });
});

describe('Harvest Stuffing and Pot’s Cornucopia', () => {
  it('cooks in the Awesome Pot from existing ingredients, only during Pot Luck Day', () => {
    const items = readJson('public/assets/content/making-items.json').items;
    for (const i of STUFFING_RECIPE.inputs) assert.ok(items[i.classTsid], i.classTsid);
    assert.equal(STUFFING_RECIPE.tool, 'awesome_pot');
    assert.equal(STUFFING_ITEM.baseCost, 72);
    setSeasonalRecipeCheck((season) => season !== 'pot_luck_day');
    const off = canCraft({}, STUFFING_RECIPE, { requireTool: false, requireSkill: false });
    assert.deepEqual([off.ok, off.reason], [false, 'season']);
    assert.match(off.msg, /Pot Luck Day/);
    setSeasonalRecipeCheck(() => true);
    assert.notEqual(canCraft({}, STUFFING_RECIPE, { requireTool: false, requireSkill: false }).reason, 'season');
  });

  it('has its own icon at 1x and 3x', () => {
    for (const f of ['harvest_stuffing.webp', 'harvest_stuffing@3x.webp']) assert.ok(existsSync(join(pub, 'assets/sprites/icons', f)), f);
  });

  it('gives a keepsake that waits with the furniture and goes on show at home', () => {
    assert.equal(trophyOfBadge('pld_feast_bringer'), KEEPSAKE);
    assert.ok(isTrophyDecor(KEEPSAKE));
    assert.ok(takesNoSlot(KEEPSAKE));
    const art = TROPHY_DECOR[KEEPSAKE].art;
    assert.ok(existsSync(join(pub, art.path)), art.path);
    assert.deepEqual([art.w, art.h], [95, 81], "#652: cornucopia_crops at its own size");
  });

  it('can be dropped on the table from the pack', () => {
    const table = 'pot_luck_harvest_table';
    const verbs = [{ id: 'lay', enabled: true }];
    assert.equal(dropFor(table, 'pumpkin_pie', verbs, { feastTakes: () => true })?.rule.id, 'lay_feast');
    assert.equal(dropFor(table, 'pick', verbs, { feastTakes: () => false }), null);
  });
});

describe('the five badges', () => {
  const catalog = readJson('public/assets/content/achievements.json');
  setContentCatalogs({ quests: {}, achievements: catalog, skills: {}, buffs: {} });

  it('are in the catalog, seasonal, with Austin’s counts', () => {
    for (const [id, row] of Object.entries(FEAST_BADGES)) assert.deepEqual(catalog[id], JSON.parse(JSON.stringify(row)), id);
    assert.deepEqual(['pld_plume_fluffer_1', 'pld_plume_fluffer_2', 'pld_plume_fluffer_3', 'pld_good_neighbor'].map((id) => catalog[id].conditions[0].num), [5, 23, 61, 11]);
    for (const id of Object.keys(FEAST_BADGES)) assert.equal(catalog[id].category, 'seasonal');
  });

  it('Feast Bringer names its quest and who gives it (#610)', () => {
    assert.match(catalog.pld_feast_bringer.desc, new RegExp(QUEST.title));
    assert.match(catalog.pld_feast_bringer.desc, new RegExp(QUEST.kicker));
  });

  it('unlock from the game’s counters: the quest, each costume dressed, each offering laid', () => {
    const s = createAchievementState();
    applyAchievementProgress(s, QUEST_COUNTER, 1);
    assert.ok(s.unlocked.includes('pld_feast_bringer'));
    for (let i = 0; i < 4; i += 1) applyAchievementProgress(s, 'chicken_dressed:turkey_tailfan', 1);
    assert.ok(!s.unlocked.includes('pld_plume_fluffer_1'));
    applyAchievementProgress(s, 'chicken_dressed:rooster_plume', 1);
    assert.ok(s.unlocked.includes('pld_plume_fluffer_1'), 'both costumes count');
    for (let i = 0; i < 18; i += 1) applyAchievementProgress(s, 'chicken_dressed:rooster_plume', 1);
    assert.ok(s.unlocked.includes('pld_plume_fluffer_2'));
    assert.ok(!s.unlocked.includes('pld_plume_fluffer_3'));
    for (let i = 0; i < 10; i += 1) applyAchievementProgress(s, LAID_COUNTER, 1);
    assert.ok(!s.unlocked.includes('pld_good_neighbor'));
    applyAchievementProgress(s, LAID_COUNTER, 1);
    assert.ok(s.unlocked.includes('pld_good_neighbor'));
  });

  it('wear the approved art (generate-badges.mjs --check)', () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/badge-art/generate-badges.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /badge art current/);
    const specs = readJson('tools/badge-art/badge-specs.json').badges;
    assert.deepEqual(['pld_feast_bringer', 'pld_plume_fluffer_1', 'pld_plume_fluffer_2', 'pld_plume_fluffer_3', 'pld_good_neighbor'].map((id) => `${specs[id].disc}/${specs[id].rim}/${specs[id].number}`),
      ['yellow/wood/', 'orange/white/5', 'red/sage/23', 'purple/slate/61', 'green/wood/11']);
    for (const id of Object.keys(FEAST_BADGES)) assert.ok(existsSync(join(pub, specs[id].picture.replace(/^public\//, ''))), id);
  });
});
