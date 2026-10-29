/**
 * The economy table the site's ledger checks multiplayer saves against
 * (groddle-afternoon-site data/economy.json, read by src/Economy.php): for
 * every tradeable class (tools/build-realtime-trade.mjs) its unit value, its
 * names, a tool's points capacity and its gate; the transforms a write's
 * losses may explain; and the rewards the ledger credits exactly once per
 * character. G335; the design is research/coverage/g335-economy.md.
 *
 * Rules:
 *  - Unit value v = round(0.9 * base_cost): the best haggled vendor price
 *    (Beginner Haggler ... Harry the Haggler take up to 10% off, inc_stores.js
 *    storeAdjust, js/vendor.js vendorBuyUnitPrice), so buying from a vendor
 *    never reads as a gain; a vendor pays at most 0.75 * 1.10 * base_cost
 *    (inc_stores.js storeSell, js/vendor.js vendorSellValue), so selling
 *    always reads as a loss. base_cost is store-catalog.js ITEM_BASE_COSTS
 *    (items/<id>.js base_cost).
 *  - A class with no base_cost (artifacts, emblems, icons, most cubimals)
 *    takes FALLBACK_VALUE (ours): rare, and never free to conjure.
 *  - Gate g "credit": the class is named nowhere in the game's code or
 *    content outside the item catalogs, so nothing in the remake grants it;
 *    it can only arrive through an exact credit (a trade receipt). Names
 *    built at run time would slip past this test, so it only ever tightens
 *    classes the game cannot name.
 *  - Gate g "capped" with cap n (slice 2): no ordinary source gives the class
 *    (tools/job-obtainable.mjs: vendors, the kit's tools, harvests, recipes,
 *    transforms; nor a quest reward, an imagination card, a Cubimal box or
 *    an artifact assembly below), only the drop tables
 *    (items/catalog_drop_tables.js, js/drop-tables-data.js). A write may
 *    gain at most cap of it a day (and only within the budget): cap =
 *    CAPPED_ROLLS a day (ours) times the most one roll of any table gives.
 *  - transforms: what a write's losses may turn into outside the budget:
 *    every recipe (assets/content/recipes.json, catalog_recipes.js; the
 *    Spellbound Spindle's String for Thread, spindle.js:425), a Cubimal box
 *    into any figure of its series (items/cubimal_package*.js, js/cubimals.js
 *    CUBIMAL_SERIES; r: a roll, so a figure worth more than the box charges
 *    the difference to the budget), and the artifacts and necklaces
 *    assembled from their pieces and beads (players/inc_artifacts.js
 *    artifact_map, artifact_necklaces; js/artifacts.js).
 *  - credits: rewards the source pays for a marker the save carries, credited
 *    once per character: quests the remake can complete (assets/content/
 *    quests.json rewards: currants, tradeable items; not street jobs or the
 *    quests js/quest-offers.js leaves out, but the multiplayer quests
 *    js/quests-mp.js makes completable online, G329), badges (achievements.json rewards.currants;
 *    the remake pays no badge items), level-ups (players/inc_stats.js via
 *    js/progression.js: the final level's currants) and imagination cards
 *    that hand out an item (inc_imagination.js reward type 8, js/imagination
 *    -data.js). Multipliers are clamped to what the data allows: the best
 *    reward buff (Gift of Gab 1.2, js/buffs.js) plus the owned Fit for a
 *    King / Overachiever tier (inc_quests.js:844, inc_achievements.js:331),
 *    then round_to_5 (common.js), x level/4 for a Completist badge past
 *    level 4.
 *
 * Run from the game repo root:
 *   node tools/build-economy.mjs           writes the site repo's data/economy.json
 *   node tools/build-economy.mjs --check   exits 1 when it is stale
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSite, sitePath } from './repos.mjs';
import { tradeTable } from './build-realtime-trade.mjs';
import { ITEM_BASE_COSTS } from '../public/js/store-catalog.js';
import { obtainableItems } from './job-obtainable.mjs';
import { DROP_TABLES } from '../public/js/drop-tables-data.js';
import { CUBIMAL_PACKAGE_IDS, CUBIMAL_SERIES } from '../public/js/cubimals.js';
import { ARTIFACT_MAP, ARTIFACT_NECKLACES } from '../public/js/artifacts.js';
import { XP_FOR_LEVEL, currantRewardForLevel } from '../public/js/progression.js';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js';
import { SPINDLE_TOOLS } from '../public/js/making.js';
import { creditedMultiplayerQuests } from '../public/js/quests-mp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = sitePath('data', 'economy.json');

/** Ours: the unit value of a tradeable class with no base_cost. */
export const FALLBACK_VALUE = 1000;
/** inc_stores.js storeAdjust: the most a haggler takes off (Harry the Haggler, 10%). */
export const BEST_HAGGLE = 0.9;
/** Ours: the rolls a day a capped class's cap allows (times the most one roll gives). */
export const CAPPED_ROLLS = 5;
/** js/buffs.js syncPcBuffFlags: the best reward buff (Gift of Gab, 20%; Silvertongue is 5%). */
export const BEST_REWARD_BUFF = 1.2;
/** inc_quests.js:844 / inc_achievements.js:331 (js/imagination-effects.js): Fit for a King and Overachiever I-V. */
const BONUS_TIERS = [0.02, 0.04, 0.06, 0.08, 0.1];

/** Catalog files that list every class (so naming a class there grants nothing). */
const CATALOGS = new Set([
  'public/js/inventory.js',
  'public/js/icon-hires.js',
  'public/js/deco-hires-list.js',
  'public/js/sprite-hires.js',
  // G152: stackmax and bag-kind sets for every takeable class (tools/build-pack-slots.mjs).
  'public/js/pack-slots-data.js',
  // ITEMBANDS: the item holder of every class (tools/build-item-bands.mjs).
  'public/js/item-bands-data.js',
  'public/assets/content/trade-items.json',
  // The content keys of every asset URL (tools/data-versions/build.mjs): a 3x icon file names its
  // class without granting it (G446: rube_potato@3x.png lifted Rube Shaped Potato's credit gate).
  'public/js/data-versions.js',
]);

export function unitValue(classTsid) {
  const base = Number(ITEM_BASE_COSTS[classTsid]) || 0;
  return base > 0 ? Math.max(1, Math.round(base * BEST_HAGGLE)) : FALLBACK_VALUE;
}

/** The game's code and content, without the catalogs (store-catalog.js keeps its offers, loses its base-cost table). */
function gameText() {
  const list = [
    ...readdirSync(join(root, 'public/js')).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
    ...readdirSync(join(root, 'public/js/features')).filter((f) => f.endsWith('.js')).map((f) => `public/js/features/${f}`),
    'public/game.js',
    'public/content.js',
    ...readdirSync(join(root, 'public/assets/content')).filter((f) => f.endsWith('.json')).map((f) => `public/assets/content/${f}`),
  ];
  let text = '';
  for (const f of list) {
    if (CATALOGS.has(f)) continue;
    let body = readFileSync(join(root, f), 'utf8');
    if (f === 'public/js/store-catalog.js') body = body.replace(/export const (ITEM_BASE_COSTS|NO_VENDOR_ITEMS) = [^\n]*\n/g, '');
    text += body + '\n';
  }
  return text;
}

const content = (name) => JSON.parse(readFileSync(join(root, 'public/assets/content', name), 'utf8'));
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/** Every item a drop table row names, with the most one roll gives. */
function dropCounts() {
  const most = {};
  for (const table of Object.values(DROP_TABLES)) {
    for (const [, entries] of table.rows) {
      for (const e of entries) if (e.item) most[e.item] = Math.max(most[e.item] || 0, Math.floor(Number(e.count) || 1));
    }
  }
  return most;
}

/** What a write's losses may turn into (tradeable inputs and outputs only), in a stable order. */
export function economyTransforms(tradeable) {
  const out = [];
  const add = (s, i, o, r = false) => {
    if (!Object.keys(i).length || !Object.keys(o).length) return;
    if (![...Object.keys(i), ...Object.keys(o)].every((c) => tradeable.has(c))) return;
    out.push({ s, i: sortKeys(i), o: sortKeys(o), ...(r ? { r: 1 } : {}) });
  };
  const counts = (rows) => {
    const m = {};
    for (const row of rows || []) m[row.classTsid] = (m[row.classTsid] || 0) + Math.max(1, Math.floor(Number(row.qty) || 1));
    return m;
  };
  const recipes = content('recipes.json');
  for (const key of Object.keys(recipes).sort()) {
    const r = recipes[key];
    const i = counts(r.inputs);
    const o = counts(r.outputs);
    add(`recipe:${key}`, i, o);
    // spindle.js:425 Spellbound Spindle: the whole spin comes out as String.
    if (SPINDLE_TOOLS.includes(r.tool) && o.thread) {
      const swapped = { ...o, string: (o.string || 0) + o.thread };
      delete swapped.thread;
      add(`recipe:${key}:string`, i, swapped);
    }
  }
  for (const [series, box] of Object.entries(CUBIMAL_PACKAGE_IDS)) {
    for (const fig of CUBIMAL_SERIES[series] || []) add(`open:${box}:${fig.classTsid}`, { [box]: 1 }, { [fig.classTsid]: 1 }, true);
  }
  for (const [id, a] of Object.entries(ARTIFACT_MAP)) {
    add(`artifact:${id}`, Object.fromEntries(a.pieces.map((p) => [p, 1])), { [a.artifact]: 1 });
  }
  for (const [bead, n] of Object.entries(ARTIFACT_NECKLACES)) add(`necklace:${n.produces}`, { [bead]: n.required }, { [n.produces]: 1 });
  return out;
}

/** Rewards credited once per character (see the header), tradeable items only. */
export function economyCredits(tradeable) {
  const rewardItems = (bucket) => {
    const m = {};
    for (const row of Object.values(bucket || {})) {
      const c = String(row?.class_tsid || row?.classTsid || row?.class_id || '');
      if (c && tradeable.has(c)) m[c] = (m[c] || 0) + Math.max(1, Math.floor(Number(row?.count) || 1));
    }
    return m;
  };
  const quests = {};
  const onlineQuests = new Set(creditedMultiplayerQuests());
  const questDefs = content('quests.json');
  for (const id of Object.keys(questDefs).sort()) {
    const def = questDefs[id];
    // js/quest-offers.js questOfferIndex: street jobs (paid by the Job Board, and in multiplayer
    // through the ledger's project route) and quests the remake leaves out are never completed
    // through the quest log, so a save that lists one has nothing to be paid for.
    // G329: the quests multiplayer makes completable (js/quests-mp.js) are credited too; a
    // solo save never lists them, as solo never offers them.
    const online = onlineQuests.has(id);
    if (!online && (def.solo === false || (def.solo === undefined && (def.isJob || def.isMultiplayer)))) continue;
    const r = def.rewards || {};
    const c = Math.max(0, Math.floor(Number(r.currants) || 0));
    const i = rewardItems(r.items);
    if (c || Object.keys(i).length) quests[id] = { ...(c ? { c } : {}), ...(Object.keys(i).length ? { i: sortKeys(i) } : {}) };
  }
  const badges = {};
  const badgeDefs = content('achievements.json');
  for (const id of Object.keys(badgeDefs).sort()) {
    const def = badgeDefs[id];
    const c = Math.max(0, Math.floor(Number(def.rewards?.currants) || 0));
    // js/achievements.js unlockAchievement: Completist badges pay x level/4 past level 4.
    if (c) badges[id] = { c, ...(/completist/i.test(String(def.name || def.title || '')) ? { x: 1 } : {}) };
  }
  const levels = {};
  for (let level = 2; level <= XP_FOR_LEVEL.length + 1; level += 1) {
    const c = currantRewardForLevel(level);
    if (c) levels[level] = c;
  }
  const cards = {};
  for (const id of Object.keys(IMAGINATION_UPGRADES).sort()) {
    const u = IMAGINATION_UPGRADES[id];
    const give = (u.rewards || []).find((r) => r.type === 8);
    const c = String(give?.data?.class_id || '');
    if (c && tradeable.has(c)) cards[id] = { c, n: Math.max(1, Math.floor(Number(give.data.num) || 1)), ...(u.max_uses ? {} : { k: 1 }) };
  }
  const tiers = (prefix) => Object.fromEntries(BONUS_TIERS.map((v, i) => [`${prefix}${i + 1}`, v]));
  return {
    buff: BEST_REWARD_BUFF,
    questBonus: tiers('quest_reward_bonus_'),
    badgeBonus: tiers('achievement_reward_bonus_'),
    xp: [...XP_FOR_LEVEL],
    levels,
    quests,
    badges,
    cards,
  };
}

export async function economyTable() {
  const trade = tradeTable();
  const text = gameText();
  const tradeable = new Set(Object.keys(trade.items));
  const transforms = economyTransforms(tradeable);
  const credits = economyCredits(tradeable);
  // Ordinary sources: everything job-obtainable, plus what a credit or a transform can make.
  const { items: ordinary } = await obtainableItems();
  for (const q of Object.values(credits.quests)) for (const c of Object.keys(q.i || {})) ordinary.add(c);
  for (const card of Object.values(credits.cards)) ordinary.add(card.c);
  for (const t of transforms) for (const c of Object.keys(t.o)) ordinary.add(c);
  const drops = dropCounts();
  const items = {};
  for (const [c, row] of Object.entries(trade.items)) {
    const out = { v: unitValue(c), n: row.name, p: row.plural };
    if (row.pts) out.pts = row.pts;
    if (!new RegExp(`[^a-z0-9_]${c}[^a-z0-9_]`).test(text)) out.g = 'credit';
    else if (!ordinary.has(c) && drops[c]) {
      out.g = 'capped';
      out.cap = CAPPED_ROLLS * drops[c];
    }
    items[c] = out;
  }
  return {
    _doc: 'Generated by tools/build-economy.mjs (do not edit). items: tradeable class -> v unit value (round(0.9 * base_cost), else fallback), n/p names, pts a tool\'s points capacity, g "credit" when nothing in the remake grants it, g "capped" with cap a day when only drop tables do. transforms: s source, i inputs, o outputs, r a roll. credits: rewards credited once per character. G335.',
    fallback: FALLBACK_VALUE,
    items,
    transforms,
    credits,
  };
}

export async function economyJson() {
  const t = await economyTable();
  const items = JSON.stringify(t.items).replace(/,"(?=[a-z0-9_]+":\{"v")/g, ',\n"');
  const transforms = t.transforms.map((x) => JSON.stringify(x)).join(',\n');
  const c = t.credits;
  const lines = (o) => Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  const credits = [
    `"buff":${JSON.stringify(c.buff)}`,
    `"questBonus":${JSON.stringify(c.questBonus)}`,
    `"badgeBonus":${JSON.stringify(c.badgeBonus)}`,
    `"xp":${JSON.stringify(c.xp)}`,
    `"levels":${JSON.stringify(c.levels)}`,
    `"quests":{\n${lines(c.quests)}}`,
    `"badges":{\n${lines(c.badges)}}`,
    `"cards":{\n${lines(c.cards)}}`,
  ].join(',\n');
  return `{"_doc":${JSON.stringify(t._doc)},"fallback":${t.fallback},"items":${items},\n"transforms":[\n${transforms}],\n"credits":{\n${credits}}}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  requireSite();
  const text = await economyJson();
  if (process.argv.includes('--check')) {
    let have = '';
    try { have = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
    if (have !== text) {
      console.error(`${OUT} is stale: run node tools/build-economy.mjs`);
      process.exit(1);
    }
    process.exit(0);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  const t = await economyTable();
  const gate = (g) => Object.values(t.items).filter((r) => r.g === g).length;
  console.log(`economy table: ${Object.keys(t.items).length} tradeable classes, ${gate('credit')} credit-gated, ${gate('capped')} capped; ${t.transforms.length} transforms; credits for ${Object.keys(t.credits.quests).length} quests, ${Object.keys(t.credits.badges).length} badges, ${Object.keys(t.credits.levels).length} levels, ${Object.keys(t.credits.cards).length} cards`);
}
