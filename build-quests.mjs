#!/usr/bin/env node
/**
 * Rebuild assets/content/quests.json from Tiny Speck's glitch-GameServerJS
 * (CC0) with the fields the quest-offer engine needs.
 *
 *   node build-quests.mjs            (from ~/Documents/glitch-audit/spike)
 *
 * Supersedes the quest half of ../scripts/extract-gsjs-content.mjs: if that
 * script is re-run, run this one afterwards. Every field the older extractor
 * produced is kept with the same meaning (classTsid, title, desc, offer,
 * completion, requirements[{id,type,name,num,classId,desc}], rewards,
 * prereqQuests, isJob, autoComplete), so requirement `name` keys used as
 * progress keys in saves and game.js stay identical.
 *
 * Added per quest:
 *   isRepeatable, isEmergency, isMultiplayer, hideQuestlog, familiarTurnin,
 *   silentComplete, showAlert, acceptLabel, declineLabel,
 *   prerequisites[{condition,value,not}]  (GSJS npc_quests.js gate list)
 *   endNpcs[], locations[], instanced, needsStart (has onStarted),
 *   timer {buff, durationSec}  (onStarted buffs_apply time limit)
 *   giveItems[{classTsid,count}]  (doProvided: createItemFromFamiliar on accept)
 *   chainOffers[]  (quests offered from this quest's completion code)
 *   offerTriggers[] (where the original offered it; see TRIGGER TYPES below)
 *   solo, soloReason, custom, prereqProxy
 *   requirements[].recipeId/outputClass/tool/recipeName/remove/conditional
 *
 * TRIGGER TYPES (offerTriggers[].type):
 *   level        quests_level_map (inc_quests.js quests_give_level_do)
 *   xp           xp threshold in inc_stats.js stats_add_xp
 *   skill        skills_get_quest_map + inc_skills.js intro quests
 *   quest        quests_offer() from another quest's completion code
 *   npc          setAvailableQuests() on an NPC (talk-to offer, getAvailableQuests)
 *   achievement  quests_offer() in an achievement's onComplete / quests_login
 *   region       entering a region (savanna.js)
 *   event        named special hook (death, shrine_donation, emblems, streets_visited, item_use, ...)
 *   prerequisites  no giver survives in the dump; the quest's own `prerequisites`
 *                  list is the gate, delivered by the familiar (inferred: true)
 *   inferred     hand-assigned gate for an unsourced quest (inferred: true)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { QUEST_ROOMS, OFFER_OVERRIDES, isBuiltRoom } from './public/js/quest-rooms/catalog.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GS = join(ROOT, '../glitch-GameServerJS');
const CONTENT = join(ROOT, 'public/assets/content');

const read = (p) => readFileSync(join(GS, p), 'utf8');
const stripLineComments = (src) =>
  src.split('\n').filter((line) => !/^\s*\/\//.test(line)).map((line) => line.replace(/\s\/\/.*$/, '')).join('\n');

/* ------------------------------------------------------------------ */
/* Recipes (GSJS catalog_recipes.js, cross-checked with remake recipes) */
/* ------------------------------------------------------------------ */
function loadGsjsRecipes() {
  const ctx = { recipes: {} };
  vm.runInNewContext(read('items/catalog_recipes.js'), ctx, { timeout: 5000 });
  for (const [key, fn] of Object.entries(ctx)) {
    if (typeof fn === 'function' && key.startsWith('set_catalog_recipes')) fn.call(ctx);
  }
  return ctx.recipes;
}
const GSJS_RECIPES = loadGsjsRecipes();
const REMAKE_RECIPES = JSON.parse(readFileSync(join(CONTENT, 'recipes.json'), 'utf8'));
const REMAKE_RECIPE_BY_ID = new Map(
  Object.entries(REMAKE_RECIPES).map(([key, r]) => [String(r.id), { key, ...r }])
);

/* ------------------------------------------------------------------ */
/* Offer sources                                                        */
/* ------------------------------------------------------------------ */
const triggers = new Map(); // quest -> trigger[]
const addTrigger = (quest, trigger) => {
  if (!quest) return;
  if (!triggers.has(quest)) triggers.set(quest, []);
  const list = triggers.get(quest);
  const sig = JSON.stringify(trigger);
  if (!list.some((t) => JSON.stringify(t) === sig)) list.push(trigger);
};

// quests_level_map (players/inc_quests.js). The original loop only scanned
// levels 2..30, so the level-40 entry never fired; it is kept, flagged.
{
  const src = read('players/inc_quests.js');
  const body = src.slice(src.indexOf('function quests_level_map'), src.indexOf('function quests_give_level_do'));
  for (const m of stripLineComments(body).matchAll(/(\d+)\s*:\s*'([a-z0-9_]+)'/g)) {
    const level = Number(m[1]);
    addTrigger(m[2], level > 30 ? { type: 'level', level, note: 'source loop stops at level 30' } : { type: 'level', level });
  }
  // quests_login achievement offers
  for (const m of src.matchAll(/achievements_has\('([a-z0-9_]+)'\)\) this\.quests_offer\('([a-z0-9_]+)'\)/g)) {
    addTrigger(m[2], { type: 'achievement', achievement: m[1] });
  }
  if (/locations_count >= 302[\s\S]{0,60}phantom_glitch/.test(src)) {
    addTrigger('phantom_glitch', { type: 'event', event: 'streets_visited', count: 302 });
  }
}
// xp thresholds (players/inc_stats.js)
{
  const src = read('players/inc_stats.js');
  for (const m of src.matchAll(/this\.stats\.xp >= (\d+) && this\.getQuestStatus\('([a-z0-9_]+)'\) == 'none'\) \{\s*this\.quests_offer/g)) {
    addTrigger(m[2], { type: 'xp', xp: Number(m[1]) });
  }
  if (/join_club/.test(src)) addTrigger('join_club', { type: 'npc', npc: 'bag_butler', xp: 30128 });
}
// skill map + intro skill quests
{
  const src = read('inc_data_skills.js');
  const fnSrc = src.slice(src.indexOf('function skills_get_quest_map'));
  const map = vm.runInNewContext(`(${fnSrc.slice(0, fnSrc.indexOf('\n}') + 2)})()`, {});
  for (const [skill, quest] of Object.entries(map)) addTrigger(quest, { type: 'skill', skill });
  const skills = read('players/inc_skills.js');
  for (const m of skills.matchAll(/id == '([a-z0-9_]+)'\)\{\s*this\.quests_offer\('([a-z0-9_]+)', true\)/g)) {
    addTrigger(m[2], { type: 'skill', skill: m[1], force: true });
  }
}
// NPC quest givers
const NPC_GIVERS = {};
for (const file of readdirSync(join(GS, 'items'))) {
  if (!file.endsWith('.js')) continue;
  const src = stripLineComments(readFileSync(join(GS, 'items', file), 'utf8'));
  const npc = file.replace(/\.js$/, '');
  const lists = [
    ...src.matchAll(/setAvailableQuests\(\[([^\]]*)\]/g),
    ...src.matchAll(/var available_quests = \[([^\]]*)\]/g),
  ];
  for (const m of lists) {
    for (const q of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
      addTrigger(q[1], { type: 'npc', npc });
      (NPC_GIVERS[npc] ||= new Set()).add(q[1]);
    }
  }
}
// Achievement completion offers
for (const file of readdirSync(join(GS, 'achievements'))) {
  if (!file.endsWith('.js')) continue;
  const src = stripLineComments(readFileSync(join(GS, 'achievements', file), 'utf8'));
  for (const m of src.matchAll(/quests_offer\('([a-z0-9_]+)'/g)) {
    addTrigger(m[1], { type: 'achievement', achievement: file.replace(/\.js$/, '') });
  }
}
// Named special hooks found by reading the call sites (see header).
const SPECIAL_TRIGGERS = {
  hell_hole: [{ type: 'event', event: 'death', where: 'hell_one' }],
  hell_quest: [{ type: 'event', event: 'death', where: 'purgatory' }],
  baqala_nostalgia: [{ type: 'region', region: 'Savanna' }],
  buy_two_bags: [{ type: 'event', event: 'newxp_island' }],
  leave_gentle_island: [{ type: 'event', event: 'newxp_home' }],
  rube_spy: [{ type: 'event', event: 'rube_visited_home' }],
  card_carrying_qualification: [{ type: 'event', event: 'subway_gate' }],
  stale_but_necessary: [{ type: 'event', event: 'item_use', item: 'cup_of_water' }],
  treasure_map_1: [{ type: 'event', event: 'item_use', item: 'treasure_map_1' }],
  create_giant_icon: [{ type: 'event', event: 'emblems', count: 4 }],
  donate_to_all_shrines: [{ type: 'event', event: 'shrine_donation' }],
  last_pilgrimage_of_esquibeth: [{ type: 'event', event: 'shrine_donation', afterQuest: 'donate_to_all_shrines', delaySec: 1800 }],
  zero_mood: [{ type: 'event', event: 'mood_zero', adminOnly: true }],
  smuggling_basic: [{ type: 'npc', npc: 'npc_smuggler' }],
  high_jump: [{ type: 'quest', quest: 'de_embiggenify_part2', delaySec: 60 }],
};
for (const [q, list] of Object.entries(SPECIAL_TRIGGERS)) for (const t of list) addTrigger(q, t);

// Hand-assigned gates for quests whose giver is lost from the dump. Each is a
// judgment call from the quest text; `inferred: true` marks them in the data.
// Requirements the remake implements as the quest text describes, where the
// source only checked a looser counter. Each row says why.
const REQUIREMENT_OVERRIDES = {
  // Source: any 60 s meditation counted; the text asks for the same street on 11 game days, gaps of 6 at most
  // (js/meditation-station.js).
  meditativearts_meditation_station: [{ id: 'r470', type: 'counter', name: 'meditation_station_days', num: 11, classId: 'focusing_orb', desc: 'Meditate on the same street on 11 game days' }],
  // Source: one "Do it all!" flag on its newxp practice street (LHFS40864GB396O, skillquest_sa.js), whose
  // geometry is lost; the quest text asks to "tend patches and dig dirt piles", so one of each anywhere.
  soilappreciation_1: [
    { id: 'r370a', type: 'counter', name: 'patches_tended', num: 1, classId: 'patch', desc: 'Tend a Patch' },
    { id: 'r370b', type: 'counter', name: 'dig_dirt', num: 1, classId: 'shovel', desc: 'Dig a Dirt Pile or a Patch' },
  ],
};

const INFERRED_GATES = {
  meditativearts_meditation_station: { quests: ['meditativearts_get_max_relax'], why: 'Meditative Arts series; no giver survives (familiar turn-in)' },
  master_milker: { quests: ['animalkinship_milk_butterflies'], why: 'milking quest after the Animal Kinship milking quest' },
  rannacramble: { quests: ['master_milker'], region: 'Aranna', why: '"Take a hike through Aranna"' },
  doody_inspector: { quests: ['animalkinship_pet_piggies'], why: 'piggy plops follow piggy care' },
  buy_bag: { level: 2, why: 'early pack-space quest (source: emergency, newxp era)' },
  spice_must_flow: { npc: 'street_spirit_groddle', why: 'end_npcs: street_spirit_groddle' },
  // Meet the Merchants (G121): part 1's offer is the pet rock talking ("I'm your pet rock"), so the
  // Magic Rock gives it; its end NPC, the Gardening Tools Vendor, then offers parts 2-4 (their offer text
  // is the scarecrow: "buy these items from me"), each once the last one is turned in.
  vendor_ping_pong_part1: { level: 2, why: 'offer is the pet rock speaking; end_npcs npc_gardening_vendor' },
  vendor_ping_pong_part2: { npc: 'npc_gardening_vendor', quests: ['vendor_ping_pong_part1'], why: 'offer is the Gardening Tools Vendor speaking' },
  vendor_ping_pong_part3: { npc: 'npc_gardening_vendor', quests: ['vendor_ping_pong_part2'], why: 'offer is the Gardening Tools Vendor speaking' },
  vendor_ping_pong_part4: { npc: 'npc_gardening_vendor', quests: ['vendor_ping_pong_part3'], why: 'offer is the Gardening Tools Vendor speaking' },
  manor_mystery: { street: 'Hauki Seeks', why: '"the Manor on Hauki Seeks"' },
  jump_in_hole: { level: 5, why: 'exploration quest; no gate in source' },
  ultimate_smoothie_1: { skills: ['blending_1'], why: 'smoothie ingredients; Blending' },
  rising_moon: { level: 5, why: 'emotional bear + moon, both sold by street spirits' },
  betterlearning_collect_favor_points: { quests: ['betterlearning_get_favor_at_shrines'], why: 'Better Learning favor series' },
  betterlearning_donate_to_shrines: { quests: ['betterlearning_get_favor_at_shrines'], why: 'Better Learning favor series' },
  betterlearning_get_giant_emblem: { quests: ['betterlearning_get_favor_at_shrines'], why: 'Better Learning favor series' },
  engineering_assemble_machine: { skills: ['engineering_1'], why: 'Engineering intro quest' },
  teleportation_teleport_between_zones: { skills: ['teleportation_1'], why: 'Teleportation series' },
  soilappreciation_tend_patches: { skills: ['soil_appreciation_1'], why: 'Soil Appreciation series' },
  soilappreciation_pet_seedlings_to_trees: { skills: ['soil_appreciation_2'], why: 'Soil Appreciation series' },
  soilappreciation_tend_patch_get_drop: { skills: ['soil_appreciation_3'], why: 'Soil Appreciation series' },
  soilappreciation_plant_beans_in_back_yard_patches: { skills: ['soil_appreciation_4'], why: 'Soil Appreciation series' },
  mini_me_mini_you: { level: 10, why: 'Cubimal giving; no gate in source' },
};

/* ------------------------------------------------------------------ */
/* Solo classification                                                  */
/* ------------------------------------------------------------------ */
// Quests the remake already runs through a dedicated module in game.js.
const CUSTOM = new Set([
  // newxp-feature.js (Gentle Island tutorial) drives these; the Magic Rock never offers them.
  'animalkinship_1', 'ezcooking_1', 'lightgreenthumb_1', 'buy_two_bags', 'leave_gentle_island',
  'blue_and_white_part1', 'blue_and_white_part2', // summers-day.js
  'winter_walk', 'winter_walk_part2', // winter-walk.js
  'greedy_street_spirit', 'greedy_street_spirit_reminisce', // greedy-street-spirit.js
  'de_embiggenify', 'de_embiggenify_part2', // de-embiggenify.js
  'card_carrying_qualification', // legalize-it.js
  'phantom_glitch', 'remember_ghosts_1', // ghost-quest.js
  'teleportation_rescue_pig', // ilmenskie-quest.js
  'rook_egg_smash', // rook-woods.js
  'rook_hall_start', 'rook_hall', // rook-museum.js
  'letter_block_2', // four-letter-quest.js
  'hogtie_piggy', // hog-haul.js (solo rival stand-in)
]);
// Tutorial quests that the original hands out finished (magic_rock.js
// quests_give_finished) or runs in newxp instances. Prereqs on them are
// satisfied by the skill they introduce.
const PREREQ_PROXY = {
  animalkinship_1: { skill: 'animalkinship_1' },
  ezcooking_1: { skill: 'ezcooking_1' },
  lightgreenthumb_1: { skill: 'light_green_thumb_1' },
  soilappreciation_1: { skill: 'soil_appreciation_1' },
};
const EXCLUDE = {
  // The 2011 Magic Rock tutorial chain: nothing in the final source starts learn_first_skill, and only it
  // starts tutorial_reinforcement (Gentle Island's own quests are CUSTOM above).
  learn_first_skill: 'removed_feature', tutorial_reinforcement: 'removed_feature',
  // A firefly offers it (npc_firefly.js); its room, the Fireflex 3000 Lab (LM113UBSS8P18ET, hub 61), is not built.
  firefly_whistle: 'instance_unbuilt',
  // test / placeholder / seasonal
  cal_test_1: 'removed_or_test', jason_test_quest: 'removed_or_test', chris_test: 'removed_or_test',
  missing: 'removed_or_test', glitchmas2010: 'removed_or_test', get_first_tool: 'removed_or_test',
  potionmaking_make_and_use_essence_of_hole_potion: 'removed_or_test',
  // snapshot camera chain (feature removed before shutdown; no requirements left)
  say_cheese: 'removed_feature', questswhere_the_heart_isjs: 'removed_feature', snappy_explorer: 'removed_feature',
  animal_qrazy: 'removed_feature', omg_bacon: 'removed_feature', wierd_n_wild: 'removed_feature', dead_head: 'removed_feature',
  // no requirements in the dump, so nothing can ever complete them
  animal_friend: 'incomplete_in_source', daily_mechanics: 'incomplete_in_source', homelier_sweet_home: 'incomplete_in_source',
  slice_of_pie: 'incomplete_in_source',
  // counter never incremented anywhere in GSJS
  gardening_plant_5_seed_types: 'broken_in_source',
  // gates that cannot be met
  pied_pepper: 'unreachable_in_source', zero_mood: 'unreachable_in_source', you_croaked: 'unreachable_in_source',
  // Manor Mystery was never finished (lane juju): nothing calls quests_offer('manor_mystery') or names it
  // in setAvailableQuests, and the Manor's events only set pc.mmquest_flag1/2 (LA9H1V6OGRU2FSB.xml
  // check_req, set_flag); nothing archived sets mmquest_flag3, so the Basement's `complete` event
  // (LA9EBPF8M2031HB.xml) never runs, and even then it sets the plain property pc.quest_manor_mystery_done
  // rather than quests_set_flag (inc_quests.js:149), the only way the r468 flag requirement fills
  // (quest.js set_flag 615-627). The end NPC, npc_juju_black, has no talk_to (debug and give_cubimal only),
  // and no archived street holds one. Its upper floors (LDOBRJIEU2V2Q2G, LDOBRKREU2V2F9B, LHF9DOUO7K03OUA)
  // were never archived. The inferred Hauki Seeks offer below stays for a phase 2 build.
  manor_mystery: 'unreachable_in_source',
  // needs real other players (no local-companion stand-in exists)
  kindly_randomness: 'needs_other_players', grub_giver: 'needs_other_players', neighbor_gifts: 'needs_other_players',
  // help_mine (I Me Mine) left this list with G207: the local companions work rocks you can help
  // (features/help-mine-feature.js).
  butler_zombies: 'needs_other_players', good_neighbor: 'needs_other_players',
  water_neighbor_garden: 'needs_other_players', herbalism_plant_seeds_in_someones_garden: 'needs_other_players',
  transcendentalradiation_radiate_to_five_people: 'needs_other_players', teleportation_teleport_with_followers: 'needs_other_players',
  teleportation_make_and_hand_out_tp_scripts: 'needs_other_players', distilling_make_and_distribute_hooch: 'needs_other_players',
  croppery_harvest_and_sell_at_auction: 'needs_other_players', soilappreciation_help_digging: 'needs_other_players',
  play_musicblocks: 'needs_other_players', watering_time: 'needs_other_players',
  // bespoke instanced locations the remake has not built
  an_autumn_day: 'instance_unbuilt', an_autumn_day_part2: 'instance_unbuilt', btc_room_3: 'instance_unbuilt',
  btc_room_3_reminisce: 'instance_unbuilt', eyeballery_identify_object: 'instance_unbuilt', fuelmaking_refuel_robot: 'instance_unbuilt',
  help_juju_bandits: 'instance_unbuilt', help_juju_bandits_2: 'instance_unbuilt', high_jump: 'instance_unbuilt',
  join_club: 'instance_unbuilt', join_club_reminisce: 'instance_unbuilt', last_pilgrimage_of_esquibeth: 'instance_unbuilt',
  last_pilgrimage_of_esquibeth_reminisce: 'instance_unbuilt', le_miserable: 'instance_unbuilt', le_miserable_part_2: 'instance_unbuilt',
  le_miserable_reminisce: 'instance_unbuilt', letter_block_1: 'instance_unbuilt', letter_block_3: 'instance_unbuilt',
  mental_block: 'instance_unbuilt', mental_block_2: 'instance_unbuilt', mental_block_rem: 'instance_unbuilt',
  picto_pattern: 'instance_unbuilt', puzzle_level_color_blockage: 'instance_unbuilt', puzzle_level_color_blockage_rem: 'instance_unbuilt',
  puzzle_level_light_perspective: 'instance_unbuilt', puzzle_level_light_perspective_rem: 'instance_unbuilt',
  radiant_glare: 'instance_unbuilt', radiant_glare_rem: 'instance_unbuilt', rube_spy: 'instance_unbuilt',
  stale_but_necessary: 'instance_unbuilt', where_the_blue_grew: 'instance_unbuilt', numismatic_hustle: 'instance_unbuilt',
  // features or givers the remake does not have
};

/* ------------------------------------------------------------------ */
/* Per-quest extraction                                                 */
/* ------------------------------------------------------------------ */
function normalizeRewards(rewards) {
  if (!rewards || typeof rewards !== 'object') return {};
  const out = {};
  if (rewards.xp != null) out.xp = Number(rewards.xp) || 0;
  if (rewards.currants != null) out.currants = Number(rewards.currants) || 0;
  if (rewards.energy != null) out.energy = Number(rewards.energy) || 0;
  if (rewards.mood != null) out.mood = Number(rewards.mood) || 0;
  if (rewards.favor) out.favor = rewards.favor;
  if (rewards.recipes) out.recipes = rewards.recipes;
  if (rewards.items) out.items = rewards.items;
  return out;
}

function normalizeRequirement(id, r) {
  const row = {
    id,
    type: r.type || 'counter',
    name: r.name || r.label || id,
    num: Number(r.num ?? r.value ?? 1) || 1,
    classId: r.class_id || r.classId || undefined,
    group: r.group || undefined,
    desc: r.desc || r.label || r.name || id,
  };
  if (r.remove) row.remove = true;
  if (typeof r.apply_test === 'function') row.conditional = true;
  if (row.type === 'make') {
    row.recipeId = String(r.recipe_id);
    const gs = GSJS_RECIPES[row.recipeId];
    const remake = REMAKE_RECIPE_BY_ID.get(row.recipeId);
    if (gs) {
      row.recipeName = gs.name;
      row.tool = gs.tool || undefined;
      row.outputClass = gs.outputs?.[0]?.[0] || undefined;
    }
    if (remake) row.recipeKey = remake.key;
  }
  return row;
}

function fnSource(ctx, name) {
  return typeof ctx[name] === 'function' ? String(ctx[name]) : '';
}

function extractQuest(classTsid, ctx, buffs) {
  const isJob = !!ctx.is_job || ctx.performance_rewards !== undefined;
  const reqs = Object.entries(ctx.requirements || {}).map(([id, r]) => normalizeRequirement(id, r));
  const started = fnSource(ctx, 'onStarted');
  const timerBuff = started.match(/buffs_apply\('([a-z0-9_]+)'\)/)?.[1];
  const timer = timerBuff && buffs[timerBuff]?.isTimer
    ? { buff: timerBuff, durationSec: Number(buffs[timerBuff].duration) || 0 }
    : undefined;
  const provided = fnSource(ctx, 'doProvided');
  const giveItems = [...provided.matchAll(/createItemFromFamiliar\('([a-z0-9_]+)',\s*(\d+)\)/g)]
    .map((m) => ({ classTsid: m[1], count: Number(m[2]) }));
  const completeSrc = stripLineComments(fnSource(ctx, 'onComplete_custom') + '\n' + fnSource(ctx, 'onComplete'));
  const chainOffers = [
    ...completeSrc.matchAll(/quests_offer\('([a-z0-9_]+)'/g),
    ...completeSrc.matchAll(/apiSetTimerX\('quests_offer',\s*[^,]+,\s*'([a-z0-9_]+)'\)/g),
  ].map((m) => m[1]);
  const prerequisites = (ctx.prerequisites || []).map((p) => ({
    condition: p.condition,
    value: typeof p.value === 'function' ? 'custom' : p.value,
    not: Number(p.not) ? 1 : 0,
  }));
  const locations = Object.keys(ctx.locations || {});
  return {
    classTsid,
    title: String(ctx.title || classTsid),
    desc: String(ctx.desc || ''),
    offer: String(ctx.offer || ''),
    completion: String(ctx.completion || ''),
    requirements: reqs,
    rewards: normalizeRewards(ctx.rewards),
    prereqQuests: Array.isArray(ctx.prereq_quests) ? ctx.prereq_quests : [],
    isJob,
    autoComplete: !!ctx.auto_complete,
    isRepeatable: !!ctx.is_repeatable,
    isEmergency: !!ctx.is_emergency,
    isMultiplayer: !!ctx.is_multiplayer,
    hideQuestlog: !!ctx.hide_questlog,
    familiarTurnin: !!ctx.familiar_turnin,
    silentComplete: !!ctx.silent_complete,
    showAlert: !!ctx.show_alert,
    acceptLabel: ctx.button_accept && ctx.button_accept !== "Ok, I'll do it!" ? String(ctx.button_accept) : undefined,
    declineLabel: ctx.button_decline && ctx.button_decline !== 'Not right now' ? String(ctx.button_decline) : undefined,
    prerequisites,
    endNpcs: Array.isArray(ctx.end_npcs) ? ctx.end_npcs : [],
    locations,
    instanced: locations.length > 0,
    needsStart: !!started,
    hasCanOffer: typeof ctx.canOffer === 'function',
    timer,
    giveItems: giveItems.length ? giveItems : undefined,
    chainOffers: chainOffers.length ? [...new Set(chainOffers)] : undefined,
  };
}

const buffs = JSON.parse(readFileSync(join(CONTENT, 'buffs.json'), 'utf8'));
const catalog = {};
const skips = [];
const files = readdirSync(join(GS, 'quests')).filter((f) => f.endsWith('.js') && f !== 'quest.js' && f !== 'quest_scripting.js');
for (const file of files) {
  const classTsid = file.replace(/\.js$/, '');
  const ctx = {};
  try {
    vm.runInNewContext(readFileSync(join(GS, 'quests', file), 'utf8'), ctx, { timeout: 2000 });
  } catch (e) {
    skips.push({ file, reason: String(e.message || e) });
    continue;
  }
  if (!ctx.title) {
    skips.push({ file, reason: 'no_title' });
    continue;
  }
  catalog[classTsid] = extractQuest(classTsid, ctx, buffs);
  if (REQUIREMENT_OVERRIDES[classTsid]) catalog[classTsid].requirements = REQUIREMENT_OVERRIDES[classTsid].map((r) => ({ ...r }));
}

// chain triggers from completion code
for (const def of Object.values(catalog)) {
  for (const next of def.chainOffers || []) addTrigger(next, { type: 'quest', quest: def.classTsid });
}

for (const def of Object.values(catalog)) {
  const id = def.classTsid;
  let list = triggers.get(id) ? [...triggers.get(id)] : [];
  if (!list.length && INFERRED_GATES[id]) {
    const { why, ...gate } = INFERRED_GATES[id];
    list = [{ type: 'inferred', inferred: true, ...gate, why }];
  }
  if (!list.length && def.prerequisites.length && !def.isJob) {
    list = [{ type: 'prerequisites', inferred: true }];
  }
  // A follow-up whose giver is lost: offer it once its prereq quest is done.
  if (!list.length && def.prereqQuests.length && !def.isJob) {
    list = def.prereqQuests.map((quest) => ({ type: 'quest', quest, inferred: true }));
  }
  def.offerTriggers = list;
  if (PREREQ_PROXY[id]) def.prereqProxy = PREREQ_PROXY[id];
  // Rebuilt instance rooms (public/js/quest-rooms/catalog.js): solo once built,
  // with offer sources the remake cannot reproduce swapped for familiar ones.
  const room = QUEST_ROOMS[id];
  const builtRoom = room && isBuiltRoom(room);
  if (builtRoom) {
    def.instanceRoom = room;
    const o = OFFER_OVERRIDES[id];
    if (o?.offerTriggers) def.offerTriggers = list = o.offerTriggers.map((t) => ({ ...t, override: true }));
    if (o?.prereqQuests) def.prereqQuests = [...o.prereqQuests];
    // Overrides replace custom_code gates; replacePrerequisites drops every
    // source gate (quests_offer never checks prerequisites for trigger offers).
    if (o?.prerequisites) {
      const kept = o.replacePrerequisites ? [] : def.prerequisites.filter((p) => p.condition !== 'custom_code');
      def.prerequisites = [...kept, ...o.prerequisites];
    }
    if (o?.why) def.offerNote = o.why;
    for (const req of def.requirements) if (req.type === 'flag' || req.type === 'counter') req.route = 'quest-instances';
  }

  let reason = null;
  if (def.isJob) reason = 'job';
  else if (CUSTOM.has(id)) reason = null;
  else if (builtRoom) reason = null;
  else if (EXCLUDE[id]) reason = EXCLUDE[id];
  else if (def.isMultiplayer) reason = 'multiplayer';
  else if (!list.length) reason = 'no_offer_source';
  def.solo = reason === null;
  def.soloReason = reason || undefined;
  if (CUSTOM.has(id)) def.custom = true;
}

writeFileSync(join(CONTENT, 'quests.json'), JSON.stringify(catalog, null, 1) + '\n');

const metaPath = join(CONTENT, 'meta.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
meta.counts.quests = { input: files.length, output: Object.keys(catalog).length, skips: skips.length };
meta.skips.quests = skips;
meta.questsBuiltBy = 'spike/build-quests.mjs';
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

const tally = {};
for (const d of Object.values(catalog)) {
  const k = d.solo ? (d.custom ? 'solo:custom' : 'solo') : `excluded:${d.soloReason}`;
  tally[k] = (tally[k] || 0) + 1;
}
console.log(`quests.json: ${Object.keys(catalog).length} quests (${skips.length} skipped)`);
console.log(tally);
