/**
 * Unlearning skills (the Unlearning Ability imagination card).
 *
 * Source (Tiny Speck GameServerJS, CC0), players/inc_skills.js:
 *   skills_can_unlearn     a learned or queued skill none of whose post_skills
 *                          is learned or queued
 *   skills_unlearning_time point_cost / skill_points_per_second (10), rounded,
 *                          then x0.75 (Speedy Unlearning) or x0.5 (Speedier);
 *                          better-learning factors never apply
 *   skills_unlearn         needs unlearning_ability; one unlearning at a time;
 *                          pauses the active study first; a partly learned
 *                          (queued) skill takes the points already studied
 *   skills_train           refuses to start a study while unlearning
 *   skills_complete_unlearning / skills_remove / skills_remove_notify
 *                          the skill (or its queued progress) is removed, its
 *                          in-progress skill quest dropped (players/
 *                          inc_quests.js quests_unlearnt_skill with
 *                          inc_data_skills.js skills_get_quest_map), counter
 *                          skills_unlearned:<skill>, "You unlearned X."
 *   skills_cancel_unlearning  "You are no longer unlearning X."
 * Nothing is refunded: study time spent on the skill is simply gone.
 */

import { getSkillCatalog } from './content-catalogs.js';
import { SKILL_POINTS_PER_SECOND, pauseSkillStudy, listStudyQueue } from './skills.js';

export const UNLEARN_CARD = 'unlearning_ability';

/** inc_data_skills.js skills_get_quest_map: the skill quest an unlearned skill drops. */
export const SKILL_QUEST_MAP = Object.freeze({
  soil_appreciation_1: "soilappreciation_dig_earth",
  soil_appreciation_2: "soilappreciation_help_digging",
  soil_appreciation_3: "soilappreciation_collect_loam",
  soil_appreciation_4: "soilappreciation_plant_beans_in_hubs",
  soil_appreciation_5: "soilappreciation_get_all_back_yard_trees_to_level10",
  light_green_thumb_1: "lightgreenthumb_water_trees",
  light_green_thumb_2: "lightgreenthumb_get_tree_to_level10",
  light_green_thumb_3: "lightgreenthumb_break_watering_can",
  gardening_1: "gardening_harvest_trees",
  gardening_2: "gardening_harvest_all_trees_in_time_period",
  gardening_3: "gardening_harvest_last_egg_plant",
  gardening_4: "gardening_plant_beans_make_sure_become_trees",
  gardening_5: "gardening_max_harvest_from_all_trees",
  croppery_1: "croppery_plant_and_harvest",
  botany_1: "botany_make_tree_beans",
  intermediateadmixing_1: "intermediateadmixing_make_powder",
  fruitchanging_1: "fruitchanging_transform_fruit",
  bubbletuning_1: "bubbletuning_transform_bubbles",
  spicemilling_1: "spicemilling_transform_spices",
  gasmogrification_1: "gasmogrification_transform_gasses",
  herdkeeping_1: "herdkeeping_capture_piggies",
  remoteherdkeeping_1: "remoteherdkeeping_fill_up_meat_collector_and_milker",
  animalkinship_1: "animalkinship_pet_piggies",
  animalkinship_2: "animalkinship_massage_butterflies",
  animalkinship_3: "animalkinship_nibble_meat",
  animalkinship_4: "animalkinship_milk_butterflies",
  animalkinship_5: "animalkinship_name_animals",
  animalkinship_6: "animalkinship_squeeze_chicken_for_drop",
  animalkinship_7: "animalkinship_max_nibble_milk_squeeze",
  animalhusbandry_1: "animalhusbandry_make_three_eggs",
  croppery_2: "croppery_harvest_and_sell_at_auction",
  croppery_3: "croppery_harvest_all_crops",
  ezcooking_1: "ezcooking_make_level1_recipes",
  cheffery_1: "cheffery_make_level1_recipes",
  cheffery_2: "cheffery_make_level2_recipes",
  saucery_1: "saucery_make_level1_recipes",
  grilling_1: "grilling_make_level1_recipes",
  grilling_2: "grilling_make_level2_recipes",
  blending_1: "blending_make_level1_recipes",
  cocktailcrafting_1: "cocktailcrafting_make_level1_recipes",
  cocktailcrafting_2: "cocktailcrafting_make_level2_recipes",
  masterchef_1: "masterchef_make_level1_recipes",
  elementhandling_1: "elementhandling_buy_elemental_pouch",
  alchemy_1: "alchemy_make_compounds",
  mining_1: "mining_mine_rocks",
  mining_2: "mining_mine_in_time_period",
  refining_1: "refining_grind_ore_to_elements",
  meditativearts_1: "meditativearts_meditate_for_time_period",
  betterlearning_1: "betterlearning_get_favor_at_shrines",
  betterlearning_3: "betterlearning_spend_favor_with_primary_giant",
  betterlearning_5: "betterlearning_spend_huge_favor",
  focused_meditation_1: "focusedmeditation_get_mood_or_energy",
  transcendental_radiation_1: "transcendentalradiation_radiate_to_five_people",
  meditativearts_2: "meditativearts_maintain_energy_in_wintry_place",
  meditativearts_3: "meditativearts_get_max_relax",
  refining_2: "refining_refine_ore_in_time_period",
  ezcooking_2: "ezcooking_make_level2_recipes",
  blending_2: "blending_make_level2_recipes",
  saucery_2: "saucery_make_level2_recipes",
  cheffery_3: "cheffery_make_level3_recipes",
  mining_3: "mining_deplete_rocks_in_time_period",
  mining_4: "mining_break_fancy_pick",
  tinkering_1: "tinkering_repair_for_time_period",
  tinkering_2: "tinkering_repair_tools",
  tinkering_3: "tinkering_repair_tinkertool",
  tinkering_4: "tinkering_craft_simple_tools",
  tinkering_5: "tinkering_craft_medium_tools",
  teleportation_1: "teleportation_teleport_to_region",
  smelting_1: "smelting_smelt_metal_rock_to_plain_metal",
  alchemy_2: "alchemy_make_metal_ingots",
  bogspecialization_1: "bogspecialization_harvest_full_peat_bog_in_time_period",
  jellisac_hands_1: "jellisachands_donate_jellisacs",
  fuelmaking_1: "fuelmaking_refuel_robot",
  blockmaking_1: "block_party",
  teleportation_2: "teleportation_teleport_in_time_period",
  teleportation_3: "teleportation_teleport_with_followers",
  teleportation_4: "teleportation_rescue_pig",
  teleportation_5: "teleportation_make_and_hand_out_tp_scripts",
  herbalism_1: "herbalism_harvest_shuck_and_plant_herbs",
  herbalism_2: "herbalism_get_super_harvest",
  piety_1: "rook_hall_start",
  martial_imagination_1: "rook_hall_start",
  eyeballery_1: "eyeballery_identify_object",
  distilling_1: "distilling_make_and_distribute_hooch",
  potionmaking_1: "potionmaking_make_potions",
  potionmaking_2: "potionmaking_make_different_potions_in_a_time_period",
  tincturing_1: "tincturing_make_tinctures",
  herbalism_3: "herbalism_plant_seeds_in_someones_garden",
});

const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));

export function createUnlearnState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const a = s.active && typeof s.active === 'object' ? s.active : null;
  return {
    active: a && a.classTsid
      ? { classTsid: String(a.classTsid), startedAt: Number(a.startedAt) || 0, endsAt: Number(a.endsAt) || 0, seconds: Number(a.seconds) || 0, partial: a.partial === true }
      : null,
    unlearned: Array.isArray(s.unlearned) ? s.unlearned.map(String).slice(-200) : [],
  };
}

/** skills_unlearning_time for a number of study points. */
export function unlearnSeconds(points, upgrades = []) {
  let duration = Math.round(Math.max(0, Number(points) || 0) / SKILL_POINTS_PER_SECOND);
  const owned = asSet(upgrades);
  if (owned.has('unlearning_time_2')) duration *= 0.5;
  else if (owned.has('unlearning_time_1')) duration *= 0.75;
  return duration;
}

function skillName(def, id) {
  if (!def) return id;
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return def.level ? `${def.name} ${roman[def.level] || def.level}` : def.name;
}

export function unlearnSkillName(id, catalog = getSkillCatalog()) {
  return skillName(catalog[id], id);
}

/** skills_can_unlearn. */
export function canUnlearnSkill(skillState, id, catalog = getSkillCatalog()) {
  const def = catalog[id];
  if (!def) return false;
  const learned = asSet(skillState?.learned);
  const queued = skillState?.queue || {};
  if (!learned.has(id) && !queued[id]) return false;
  for (const post of def.postSkills || []) {
    if (learned.has(post) || queued[post]) return false;
  }
  return true;
}

/** Study points an unlearning of this skill would take back. */
export function unlearnPoints(skillState, id, catalog = getSkillCatalog(), now = Date.now()) {
  const def = catalog[id];
  if (!def) return 0;
  const row = skillState?.queue?.[id];
  if (row && !asSet(skillState.learned).has(id)) {
    // An active study's remaining points come from its end time (pause math).
    const remaining = row.isPaused
      ? row.pointsRemaining || 0
      : Math.max(1, Math.ceil((Math.max(0, (row.endsAt - now) / 1000) * SKILL_POINTS_PER_SECOND) / (row.timeFactor || 1)));
    const done = (def.pointCost || 0) - remaining;
    return done > 0 ? done : def.pointCost || 0;
  }
  return def.pointCost || 0;
}

/** Can this skill be unlearned right now? { ok, msg, seconds }. */
export function unlearnCheck(unlearnState, skillState, id, ctx = {}, now = Date.now()) {
  const catalog = ctx.catalog || getSkillCatalog();
  if (!asSet(ctx.upgrades).has(UNLEARN_CARD)) return { ok: false, msg: "You don't know how to unlearn." };
  const def = catalog[id];
  if (!def) return { ok: false, msg: `Invalid skill: ${id}` };
  const learned = asSet(skillState?.learned);
  if (!learned.has(id) && !skillState?.queue?.[id]) return { ok: false, msg: `You don't have skill ${id}.` };
  if (!canUnlearnSkill(skillState, id, catalog)) return { ok: false, msg: "You can't unlearn a skill that is required for your other skills." };
  if (unlearnState.active) return { ok: false, busy: true, msg: `You are already unlearning ${unlearnSkillName(unlearnState.active.classTsid, catalog)}.` };
  const seconds = unlearnSeconds(unlearnPoints(skillState, id, catalog, now), ctx.upgrades);
  return { ok: true, seconds, def, quest: questRemovedBy(id, ctx.questState) };
}

/** quests_get_quest_for_unlearnt_skill: the in-progress (or failed) skill quest that will go. */
export function questRemovedBy(id, questState) {
  const quest = SKILL_QUEST_MAP[id];
  if (!quest || !questState) return null;
  if (questState.active?.[quest]) return quest;
  return null;
}

/** skills_unlearn: pause any active study, then start the unlearning clock. */
export function startUnlearning(unlearnState, skillState, id, ctx = {}, now = Date.now()) {
  const check = unlearnCheck(unlearnState, skillState, id, ctx, now);
  if (!check.ok) return check;
  const paused = [];
  for (const row of listStudyQueue(skillState, now)) {
    if (!row.isPaused && pauseSkillStudy(skillState, row.classTsid, now).ok) paused.push(row.classTsid);
  }
  const seconds = Number.isFinite(ctx.secondsOverride) ? ctx.secondsOverride : check.seconds;
  unlearnState.active = {
    classTsid: id,
    startedAt: now,
    endsAt: now + seconds * 1000,
    seconds,
    partial: !asSet(skillState.learned).has(id),
  };
  return {
    ok: true,
    seconds,
    paused,
    quest: check.quest,
    msg: `You started unlearning ${unlearnSkillName(id, ctx.catalog)}.`,
  };
}

export function cancelUnlearning(unlearnState, ctx = {}) {
  const a = unlearnState.active;
  if (!a) return { ok: false, msg: 'Not unlearning!' };
  unlearnState.active = null;
  return { ok: true, classTsid: a.classTsid, msg: `You are no longer unlearning ${unlearnSkillName(a.classTsid, ctx.catalog)}.` };
}

/** Status of the unlearning in progress (for the Skills panel). */
export function unlearnStatus(unlearnState, now = Date.now()) {
  const a = unlearnState.active;
  if (!a) return null;
  const total = Math.max(0.001, a.seconds);
  const remaining = Math.max(0, (a.endsAt - now) / 1000);
  return { ...a, remainingSeconds: Math.ceil(remaining), progress: Math.max(0, Math.min(1, 1 - remaining / total)) };
}

/**
 * skills_complete_unlearning: when due, remove the skill (or its queued
 * progress) and drop its in-progress skill quest. Offline time counts.
 */
export function tickUnlearning(unlearnState, skillState, ctx = {}, now = Date.now()) {
  const a = unlearnState.active;
  if (!a || a.endsAt > now) return null;
  const id = a.classTsid;
  unlearnState.active = null;
  const i = skillState.learned.indexOf(id);
  const wasLearned = i !== -1;
  if (wasLearned) skillState.learned.splice(i, 1);
  else if (skillState.queue?.[id]) delete skillState.queue[id];
  let quest = null;
  if (wasLearned) {
    quest = questRemovedBy(id, ctx.questState);
    if (quest) delete ctx.questState.active[quest];
  }
  unlearnState.unlearned.push(id);
  return {
    classTsid: id,
    wasLearned,
    quest,
    counter: `skills_unlearned:${id}`,
    msg: `You unlearned ${unlearnSkillName(id, ctx.catalog)}.`,
  };
}

/** skills_train: no studying while unlearning. */
export function studyGate(unlearnState, ctx = {}) {
  if (!unlearnState.active) return null;
  return { ok: false, msg: `You can't learn a skill while you are unlearning ${unlearnSkillName(unlearnState.active.classTsid, ctx.catalog)}.` };
}
