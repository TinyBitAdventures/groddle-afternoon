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
 *    (a shrine's emblems are ordinary: the donation that fills a Giant's favor gives one)
 *    (tools/job-obtainable.mjs: vendors, the kit's tools, harvests, recipes,
 *    transforms; nor a quest reward, an imagination card, a Cubimal box or
 *    an artifact assembly below), only the drop tables
 *    (items/catalog_drop_tables.js, js/drop-tables-data.js). A write may
 *    gain at most cap of it a day (and only within the budget): cap =
 *    CAPPED_ROLLS a day (ours) times the most one roll of any table gives.
 *  - d 1 (G905): a rare find a drop table gives, though an ordinary source
 *    gives it too (a quest's Musicblock, a mined gem): worth RARE_VALUE or
 *    more, and not an emblem (the site credits those from the save's shrine
 *    record, G895). The site's ledger lets a gain of it wait in the save while
 *    the earning budget is short (LedgerMath::reconcile held), as it does a
 *    capped class, instead of taking it back. The Gameshow Ticket, which a
 *    shrine donation also gives (credited by G895), carries dcap: a capped
 *    class's day (CAPPED_ROLLS times the most one roll gives) for the ones a
 *    drop table gives (#438: one from a Metal Rock was taken back).
 *  - own (#670): why a player keeps the class their own on shared ground (js/drops-mp.js
 *    KEPT_OWN: a note's writing, a Still that works there), the one list the game's
 *    shareReason and the site's house-floor move (src/HouseFloors.php stays) both read.
 *  - transforms: what a write's losses may turn into outside the budget:
 *    every recipe (assets/content/recipes.json, catalog_recipes.js; the
 *    Spellbound Spindle's String for Thread, spindle.js:425), a Cubimal box
 *    into any figure of its series (items/cubimal_package*.js, js/cubimals.js
 *    CUBIMAL_SERIES; r: a roll, so a figure worth more than the box charges
 *    the difference to the budget), and the artifacts and necklaces
 *    assembled from their pieces and beads (players/inc_artifacts.js
 *    artifact_map, artifact_necklaces; js/artifacts.js).
 *  - w 1 (G905): a timed transform, whose output comes in a later save write
 *    than the one that spent its inputs: a machine's recipe (the four machines
 *    of js/machines.js MACHINE_IDS: a Community Machine Room's machine takes
 *    the ingredients when the job starts and hands the output over on Collect,
 *    js/features/machine-rooms-feature.js startJob / collect; players/
 *    inc_making.js 306-308, fuelmaker.js setContents 1533-1544) and a garden
 *    seed's crop (garden:<seed>, the seed planted then the crop picked: the
 *    most one plot gives, a Super Harvest, js/garden.js SEED_CATALOG produces
 *    times the best bonus_multiplier of the garden's harvest packages,
 *    js/skill-packages-data.js, include/garden.js 486-497; an ordinary pick
 *    gives less, so one seed may stand for up to that many).
 *    The site's ledger keeps a write's spent inputs of these a while and lets
 *    a later write's output stand against them (LedgerMath pool).
 *  - credits: rewards the source pays for a marker the save carries, credited
 *    once per character: quests the remake can complete (assets/content/
 *    quests.json rewards: currants, tradeable items; not street jobs or the
 *    quests js/quest-offers.js leaves out, but the multiplayer quests
 *    js/quests-mp.js makes completable online, G329; p: the quest's prereqQuests,
 *    which the site's ledger asks the save to show done too, G739 ("<quest>/<skill>"
 *    when the learned skill counts instead, prereqProxy), except for the
 *    quests the game itself starts without them, QUESTS_STARTED_WITHOUT_PREREQS), badges (achievements.json rewards.currants;
 *    the remake pays no badge items), level-ups (players/inc_stats.js via
 *    js/progression.js: the final level's currants) and imagination cards
 *    that hand out an item (inc_imagination.js reward type 8, js/imagination
 *    -data.js). Multipliers are clamped to what the data allows: the best
 *    reward buff (Gift of Gab 1.2, js/buffs.js) plus the owned Fit for a
 *    King / Overachiever tier (inc_quests.js:844, inc_achievements.js:331),
 *    then round_to_5 (common.js), x level/4 for a Completist badge past
 *    level 4. homeKit: the house's starter furniture (players/inc_furniture.js
 *    furniture_populate 73-113, js/homes-catalog.js FURNITURE_STARTER_KIT),
 *    which the game hands over on the first visit inside
 *    (js/home-decor.js grantStarterKit).
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
import { POT_LUCK_ITEMS } from '../public/js/pot-luck.js?v=e704c060';
import { ITEM_BASE_COSTS } from '../public/js/store-catalog.js?v=c6ebb2bd';
import { STUFFING, STUFFING_ITEM } from '../public/js/pot-luck-feast.js?v=971888be';
import { obtainableItems } from './job-obtainable.mjs';
import { DROP_TABLES } from '../public/js/drop-tables-data.js?v=c51a6400';
import { CUBIMAL_PACKAGE_IDS, CUBIMAL_SERIES } from '../public/js/cubimals.js?v=b83d6145';
import { ARTIFACT_MAP, ARTIFACT_NECKLACES } from '../public/js/artifacts.js?v=fc419ecf';
import { XP_FOR_LEVEL, currantRewardForLevel } from '../public/js/progression.js?v=05ff0260';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js?v=4a85e7fe';
import { SPINDLE_TOOLS } from '../public/js/making.js?v=d3571803';
import { MACHINE_IDS } from '../public/js/machines.js?v=93a736f2';
import { GARDEN_SKILL_PACKAGES, SEED_CATALOG } from '../public/js/garden.js?v=fefa7bcd';
import { SKILL_PACKAGES } from '../public/js/skill-packages-data.js?v=cb4e9ab3';
import { creditedMultiplayerQuests } from '../public/js/quests-mp.js?v=e697cec3';
import { FURNITURE_STARTER_KIT } from '../public/js/homes-catalog.js?v=0367f90f';
import { GIANTS } from '../public/js/shrines.js?v=be0b0a16';
import { FOUR_LETTER_QUEST_ID } from '../public/js/four-letter-quest.js?v=9540cc6f';
import { LEGALIZE_QUEST_ID } from '../public/js/legalize-it.js?v=64654863';
import { GREEDY_STREET_SPIRIT_QUEST_ID, GREEDY_STREET_SPIRIT_REPEAT_ID } from '../public/js/greedy-street-spirit.js?v=b0ce2437';
import { WINTER_WALK_QUEST_ID, WINTER_WALK_REPEAT_QUEST_ID } from '../public/js/winter-walk.js?v=faad1d46';
import { SUMMERS_DAY_QUEST_ID, SUMMERS_DAY_REPEAT_QUEST_ID } from '../public/js/summers-day.js?v=5ffa5056';
import { ROOK_QUEST_ID } from '../public/js/rook-woods.js?v=73edf194';
import { ROOK_HALL_QUEST_ID, ROOK_HALL_START_QUEST_ID } from '../public/js/rook-museum.js?v=cc091e1c';
import { DE_EMBIGGENIFY_QUEST_ID, DE_EMBIGGENIFY_PART2_QUEST_ID } from '../public/js/de-embiggenify.js?v=e4e87b16';
import { PHANTOM_QUEST_ID, REMEMBER_QUEST_ID } from '../public/js/ghost-quest.js?v=5f3cc133';
import { HOG_HAUL_QUEST_ID } from '../public/js/hog-haul.js?v=50d2e072';
import { ILMENSKIE_QUEST_ID } from '../public/js/ilmenskie-quest.js?v=433ca65b';
// G979: Buy a Bag starts with the first skill learned, without its prerequisites (learn_first_skill.js 74-76).
import { FIRST_SKILL_QUEST_ID } from '../public/js/quest-offers.js?v=36e610b5';
import { CAMERA_OFFER } from '../public/js/snaps.js?v=b5be8bff';
// #670: the classes a player keeps their own on shared ground (a note, a Still), which the site's house-floor move reads.
import { KEPT_OWN } from '../public/js/drops-mp.js?v=351593a6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = sitePath('data', 'economy.json');

/** Ours: the unit value of a tradeable class with no base_cost. */
export const FALLBACK_VALUE = 1000;
/** inc_stores.js storeAdjust: the most a haggler takes off (Harry the Haggler, 10%). */
export const BEST_HAGGLE = 0.9;
/** Ours (G905): the least unit value of a rare find that waits (d): a Musicblock is 360, the smallest gem 180. */
export const RARE_VALUE = 100;
/** Ours: the rolls a day a capped class's cap allows (times the most one roll gives). */
export const CAPPED_ROLLS = 5;
/** js/buffs.js syncPcBuffFlags: the best reward buff (Gift of Gab, 20%; Silvertongue is 5%). */
export const BEST_REWARD_BUFF = 1.2;

/**
 * G739: quests game.js starts with assignQuest(..., { ignorePrereq }) (its scripted quest rooms,
 * their repeats and the quest demos): a save may finish one without its prereqQuests, so the ledger
 * never asks for them. tests/ledger-explained-mp.test.js keeps this list in step with game.js.
 */
export const STARTS_WITHOUT_PREREQS = Object.freeze({
  FOUR_LETTER_QUEST_ID, LEGALIZE_QUEST_ID, GREEDY_STREET_SPIRIT_QUEST_ID, GREEDY_STREET_SPIRIT_REPEAT_ID, WINTER_WALK_QUEST_ID, WINTER_WALK_REPEAT_QUEST_ID,
  SUMMERS_DAY_QUEST_ID, SUMMERS_DAY_REPEAT_QUEST_ID, ROOK_QUEST_ID, ROOK_HALL_QUEST_ID, ROOK_HALL_START_QUEST_ID,
  DE_EMBIGGENIFY_QUEST_ID, DE_EMBIGGENIFY_PART2_QUEST_ID, PHANTOM_QUEST_ID, REMEMBER_QUEST_ID, HOG_HAUL_QUEST_ID, ILMENSKIE_QUEST_ID, FIRST_SKILL_QUEST_ID,
});
export const QUESTS_STARTED_WITHOUT_PREREQS = Object.freeze(Object.values(STARTS_WITHOUT_PREREQS).sort());
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
  // The art a put-down stack shows, for every droppable class (tools/world-art/render.py): art, not a grant.
  'public/js/world-art-list.js',
  // What the Pick up chooser calls each class (js/world-items.js pickupCountTitle): words, not a grant.
  'public/js/item-plurals-data.js',
  // The classes a shrine refuses (GSJS no_donate tags, js/shrines.js isNoDonate): a tag list, not a grant.
  'public/js/shrine-no-donate-data.js',
  // R12 G490: the measured foot of every sprite cut (tools/sprite-feet/build.mjs): art, not a grant.
  'public/js/sprite-feet-data.js',
]);

export function unitValue(classTsid) {
  // G982: a designed item (no GSJS file) has its base cost in its own table (js/pot-luck.js, js/pot-luck-feast.js).
  const base = Number(ITEM_BASE_COSTS[classTsid] ?? POT_LUCK_ITEMS[classTsid]?.baseCost ?? (classTsid === STUFFING ? STUFFING_ITEM.baseCost : 0)) || 0;
  return base > 0 ? Math.max(1, Math.round(base * BEST_HAGGLE)) : FALLBACK_VALUE;
}

/**
 * Every .js file under a public/ folder, its subfolders too, in a stable order. G948 (G942 gap A20):
 * the scan read public/js and public/js/features only, so a class named only in js/quest-rooms (the
 * Extremely Rare Items Vendor's Rube Shaped Potato, quest-rooms/penalty.js RARE_STORE) read as
 * granted by nothing and went "credit": a buyer lost 500,000 currants and the potato.
 */
export function gameFiles(dir = 'public/js') {
  const out = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...gameFiles(`${dir}/${e.name}`));
    else if (e.name.endsWith('.js')) out.push(`${dir}/${e.name}`);
  }
  return out;
}

/** The game's code and content, without the catalogs (store-catalog.js keeps its offers, loses its base-cost table). */
export function gameText() {
  const list = [
    ...gameFiles('public/js'),
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
  const add = (s, i, o, r = false, w = false) => {
    if (!Object.keys(i).length || !Object.keys(o).length) return;
    if (![...Object.keys(i), ...Object.keys(o)].every((c) => tradeable.has(c))) return;
    out.push({ s, i: sortKeys(i), o: sortKeys(o), ...(r ? { r: 1 } : {}), ...(w ? { w: 1 } : {}) });
  };
  const counts = (rows) => {
    const m = {};
    for (const row of rows || []) m[row.classTsid] = (m[row.classTsid] || 0) + Math.max(1, Math.floor(Number(row.qty) || 1));
    return m;
  };
  const recipes = content('recipes.json');
  for (const key of Object.keys(recipes).sort()) {
    const r = recipes[key];
    // #219: a full Firefly Jar the Crystalmalizing Chamber empties stays in the pack (input.full).
    const i = counts((r.inputs || []).filter((row) => !(row.full > 0)));
    const o = counts(r.outputs);
    add(`recipe:${key}`, i, o, false, MACHINE_IDS.includes(r.tool));
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
  for (const id of Object.keys(SEED_CATALOG).sort()) {
    const seed = SEED_CATALOG[id];
    const n = Math.max(1, Math.floor(Number(seed.produces) || 1));
    add(`garden:${id}`, { [id]: 1 }, { [seed.cropId]: n * superHarvest(seed.gardenType) }, false, true);
  }
  return out;
}

/** G905: the best Super Harvest multiplier a garden type's harvest packages give (its own and the Master Garden's). */
export function superHarvest(gardenType) {
  const pkg = (GARDEN_SKILL_PACKAGES[gardenType] || GARDEN_SKILL_PACKAGES.default).harvest;
  let most = 1;
  const walk = (o) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (k === 'bonus_multiplier') most = Math.max(most, Number(v) || 1);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(SKILL_PACKAGES[pkg]);
  walk(SKILL_PACKAGES[`mg_${pkg}`]);
  return most;
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
    // G739: the quests a save must show done before this one's reward is credited (quests.js assignQuest).
    // A prereq the game also counts as done for a learned skill (js/quest-offers.js questDone, its
    // prereqProxy, ticket 28) is written "<quest>/<skill>": either one in the save will do.
    const proxied = (q) => (questDefs[q]?.prereqProxy?.skill ? `${q}/${questDefs[q].prereqProxy.skill}` : q);
    const p = QUESTS_STARTED_WITHOUT_PREREQS.includes(id) ? [] : [...new Set((def.prereqQuests || []).filter((q) => typeof q === 'string' && q).map(proxied))].sort();
    if (c || Object.keys(i).length) quests[id] = { ...(c ? { c } : {}), ...(Object.keys(i).length ? { i: sortKeys(i) } : {}), ...(p.length ? { p } : {}) };
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
  const homeKit = {};
  for (const [c, n] of Object.entries(FURNITURE_STARTER_KIT).sort(([a], [b]) => a.localeCompare(b))) {
    if (tradeable.has(c)) homeKit[c] = n;
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
    homeKit,
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
  for (const c of Object.keys(credits.homeKit)) ordinary.add(c);
  for (const t of transforms) for (const c of Object.keys(t.o)) ordinary.add(c);
  // The shrines give every Giant's emblem (js/shrines.js claimShrineEmblem builds `emblem_<giant>` at
  // run time, so job-obtainable never sees it; items/include/shrines.js give_emblem 78-166): an
  // ordinary class, not a drop capped at 5 a day. The site's ledger credits it from the save's shrine
  // record, every one the record gained with no daily count (G895, G1299, LedgerMath::earned), since
  // donated goods no longer refill the budget (G742).
  for (const id of Object.keys(GIANTS)) ordinary.add(`emblem_${id}`);
  // G948 (G942 gap A21): the Toy Vendor sells the Camera online (js/snaps.js withCamera adds CAMERA_OFFER
  // to its stock at run time, so job-obtainable never sees it): an ordinary class, not a drop capped at
  // 5 a day (a 6th bought in a day was taken back).
  ordinary.add(CAMERA_OFFER.classTsid);
  const drops = dropCounts();
  const items = {};
  for (const [c, row] of Object.entries(trade.items)) {
    const out = { v: unitValue(c), n: row.name, p: row.plural };
    if (row.pts) out.pts = row.pts;
    if (row.tag) out.tag = row.tag;
    if (Object.hasOwn(KEPT_OWN, c)) out.own = KEPT_OWN[c];
    if (!new RegExp(`[^a-z0-9_]${c}[^a-z0-9_]`).test(text)) out.g = 'credit';
    else if (!ordinary.has(c) && drops[c]) {
      out.g = 'capped';
      out.cap = CAPPED_ROLLS * drops[c];
    } else if (drops[c] && out.v >= RARE_VALUE && !/^emblem_/.test(c)) {
      out.d = 1;
      // The Gameshow Ticket a mining, harvest or squeeze table gives (#438): the site credits a donation's from the
      // shrine record (G895), so a drop's waits within a capped class's day (dcap) and a forged pile does not.
      if (c === 'gameshow_ticket') out.dcap = CAPPED_ROLLS * drops[c];
    }
    items[c] = out;
  }
  return {
    _doc: 'Generated by tools/build-economy.mjs (do not edit). items: tradeable class -> v unit value (round(0.9 * base_cost), else fallback), n/p names, pts a tool\'s points capacity, tag the kind of words a copy carries (tags: the rules for each, js/copy-tags.js), own why a player keeps it their own on shared ground (js/drops-mp.js KEPT_OWN: a note, a Still that works there), g "credit" when nothing in the remake grants it, g "capped" with cap a day when only drop tables do, d 1 a rare find a drop table gives as well as an ordinary source (dcap its day, the Gameshow Ticket). transforms: s source, i inputs, o outputs, r a roll, w timed (the output comes in a later write). credits: rewards credited once per character. G335.',
    fallback: FALLBACK_VALUE,
    tags: trade.tags,
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
    `"homeKit":${JSON.stringify(c.homeKit)}`,
  ].join(',\n');
  return `{"_doc":${JSON.stringify(t._doc)},"fallback":${t.fallback},"tags":${JSON.stringify(t.tags)},"items":${items},\n"transforms":[\n${transforms}],\n"credits":{\n${credits}}}\n`;
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
