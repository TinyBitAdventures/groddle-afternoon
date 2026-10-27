/**
 * Who applies which buff (pure rules, no Pixi or DOM). G124: the buffs whose
 * GameServerJS trigger the remake already has. js/features/buff-triggers-feature.js
 * binds them to the game; js/buffs.js holds each buff's on_apply / on_tick /
 * on_remove numbers.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - Drinks and foods: items/<class>.js verbs.drink / verbs.eat call
 *   pc.buffs_apply(<buff>) once the parent drink/eat succeeds (line 121 of
 *   every drink, 120 of the hearty foods, apple.js:252, garlic.js:130).
 *   buffs_apply restarts a running buff (players/inc_buffs.js:136).
 * - Gandlevery: items/gandlevery.js verbs.munch (herb_base): mood 5 needed,
 *   refused while the buff runs, herb_buff 'gandlevery'.
 * - Timed quests: quests/<id>.js onStarted buffs_apply(<timer buff>), whose
 *   on_remove fails the quest (quest-offers.js tickQuestTimers does the
 *   failing here; the buff is the timer the player sees).
 * - Flaming Grinder (items/ore_grinder.js:454-475) and Smelt It, Dealt It
 *   (items/smelter.js:446-478): free units from the buff's remaining seconds,
 *   written as the package's energy_cost override for that batch.
 * - Kukubee winter (locations/location.js:335): the three winter streets
 *   apply A Cold Place unless A Hearty Feeling runs; its on_tick removes it
 *   anywhere else.
 * - Nekkid (players/inc_avatar.js:747 avatar_is_nekkid).
 */

export const BUFF_TRIGGER_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/catalog_buffs.js, players/inc_buffs.js and the item files named per row';

/**
 * Consume events (game.js emits `<class>:<verb>` after a successful eat or
 * drink) and the buff each one applies.
 * @type {ReadonlyArray<{ event: string, buff: string, source: string }>}
 */
export const CONSUME_BUFFS = Object.freeze([
  { event: 'coffee:drink', buff: 'caffeine_buzz', source: 'items/coffee.js:121' },
  { event: 'mabbish_coffee:drink', buff: 'caffeine_buzz', source: 'items/mabbish_coffee.js:121' },
  { event: 'carrot_margarita:drink', buff: 'carrot_zing', source: 'items/carrot_margarita.js:121' },
  { event: 'gurly_drink:drink', buff: 'easy_animalia', source: 'items/gurly_drink.js:121' },
  { event: 'tooberry_shake:drink', buff: 'emberried_hiccups', source: 'items/tooberry_shake.js:121' },
  { event: 'flaming_humbaba:drink', buff: 'flaming_grinder', source: 'items/flaming_humbaba.js:121' },
  { event: 'cloudberry_daiquiri:drink', buff: 'floating_on_a_cloud', source: 'items/cloudberry_daiquiri.js:121' },
  { event: 'earthshaker:drink', buff: 'impervious_miner', source: 'items/earthshaker.js:121' },
  { event: 'pumpkin_ale:drink', buff: 'moonwalk', source: 'items/pumpkin_ale.js:121' },
  { event: 'exotic_juice:drink', buff: 'pleasant_equilibrium', source: 'items/exotic_juice.js:121' },
  { event: 'savory_smoothie:drink', buff: 'savoring_experience', source: 'items/savory_smoothie.js:121' },
  { event: 'cloud_11_smoothie:drink', buff: 'sky_cruisin', source: 'items/cloud_11_smoothie.js:121' },
  { event: 'slow_gin_fizz:drink', buff: 'slow_gin', source: 'items/slow_gin_fizz.js:121' },
  { event: 'pungent_sunrise:drink', buff: 'small_enlightenment', source: 'items/pungent_sunrise.js:128' },
  { event: 'face_smelter:drink', buff: 'smelt_it_dealt_it', source: 'items/face_smelter.js:121' },
  { event: 'cosmapolitan:drink', buff: 'sophisticated_feeling', source: 'items/cosmapolitan.js:121' },
  { event: 'bubble_tea:drink', buff: 'bubble_enhanced_meditation', source: 'items/bubble_tea.js:121' },
  { event: 'hooch:drink', buff: 'buff_smashed', source: 'items/hooch.js:115' },
  { event: 'hearty_groddle_sammich:eat', buff: 'kukubee_winter_positive', source: 'items/hearty_groddle_sammich.js:120' },
  { event: 'hearty_omelet:eat', buff: 'kukubee_winter_positive', source: 'items/hearty_omelet.js:120' },
  { event: 'apple:eat', buff: 'well_fed_energy', source: 'items/apple.js:252' },
  { event: 'garlic:eat', buff: 'buff_garlic_breath', source: 'items/garlic.js:130' },
]);

const CONSUME_BY_EVENT = new Map(CONSUME_BUFFS.map((row) => [row.event, row]));

/** The buff a consume event applies, or null. */
export function consumeBuffFor(event) {
  return CONSUME_BY_EVENT.get(String(event || '')) || null;
}

/** garlic.js:126: a second garlic while the breath lasts only warns. */
export const GARLIC_AGAIN = 'People have been warned about your garlicky breath. It does not affect them.';

/**
 * Timed quests and their timer buffs (quests/<id>.js onStarted; the same
 * pairs as quests.json `timer`). play_musicblocks (Blocks That Rock) is
 * offered only in multiplayer (player verbs, js/quests-mp.js); zero_mood (Tickle Me
 * Emo) is left out: the source offered it to staff alone.
 * @type {ReadonlyArray<{ quest: string, buff: string }>}
 */
export const QUEST_TIMER_BUFFS = Object.freeze([
  { quest: 'animalkinship_milk_butterflies', buff: 'go_moloko_loco' },
  { quest: 'animalkinship_nibble_meat', buff: 'get_a_rasher' },
  { quest: 'bogspecialization_harvest_full_peat_bog_in_time_period', buff: 'bogspecialization_harvest_full_peat_bog_in_time_period' },
  { quest: 'donate_1000_favor_every_giant_one_day', buff: 'donate_1000_favor_every_giant_one_day' },
  { quest: 'engineering_assemble_machine', buff: 'machine_shop_pit_stop_in_time_period' },
  { quest: 'gardening_harvest_all_trees_in_time_period', buff: 'gardening_harvest_all_trees_in_time_period' },
  { quest: 'mining_deplete_rocks_in_time_period', buff: 'mining_deplete_rocks_in_time_period' },
  { quest: 'mining_mine_in_time_period', buff: 'mining_mine_in_time_period' },
  { quest: 'play_musicblocks', buff: 'play_musicblocks' },
  { quest: 'potionmaking_make_different_potions_in_a_time_period', buff: 'make_different_potions' },
  { quest: 'refining_refine_ore_in_time_period', buff: 'the_daily_grind' },
  { quest: 'soilappreciation_collect_loam', buff: 'soil_appreciation_loam_in_time_period' },
  { quest: 'teleportation_teleport_in_time_period', buff: 'teleportation_teleport_in_time_period' },
]);

/**
 * The timer buffs that should be running for the open quest timers
 * (questState.offers.timers: { [quest]: { startedAt, endsAt } }).
 * @returns {Record<string, number>} buff -> endsAt
 */
export function questTimerBuffs(timers = {}, now = Date.now()) {
  const out = {};
  for (const row of QUEST_TIMER_BUFFS) {
    const timer = timers?.[row.quest];
    const endsAt = Number(timer?.endsAt) || 0;
    if (endsAt > now) out[row.buff] = Math.max(out[row.buff] || 0, endsAt);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Package overrides                                                    */
/* ------------------------------------------------------------------ */

/** catalog_buffs.js on_apply addSkillPackageOverride rows that are fixed. */
export const BUFF_PACKAGE_OVERRIDES = Object.freeze({
  // impervious_miner: mining and mining_fancypick cost no energy.
  impervious_miner: Object.freeze({ mining: { energy_cost: 0 }, mining_fancypick: { energy_cost: 0 } }),
  // easy_animalia: every domestic animal verb but singing is free.
  easy_animalia: Object.freeze({
    ak_butterfly_massage: { energy_cost: 0 },
    ak_butterfly_milk: { energy_cost: 0 },
    ak_chicken_squeeze: { energy_cost: 0 },
    ak_piggy_nibble: { energy_cost: 0 },
    ak_piggy_pet: { energy_cost: 0 },
  }),
});

/** bubble_enhanced_meditation doubles these packages' bonus_amount. */
export const BUBBLE_MEDITATION_PACKAGES = Object.freeze(['meditative_arts', 'focused_meditation', 'transcendental_radiation']);

/** The packages a buff's on_remove clears (removeSkillPackageOverride). */
export const BUFF_PACKAGE_CLEARS = Object.freeze({
  impervious_miner: Object.freeze(['mining', 'mining_fancypick']),
  easy_animalia: Object.freeze(Object.keys(BUFF_PACKAGE_OVERRIDES.easy_animalia)),
  bubble_enhanced_meditation: BUBBLE_MEDITATION_PACKAGES,
  flaming_grinder: Object.freeze(['refining']),
  smelt_it_dealt_it: Object.freeze(['smelting']),
});

/**
 * ore_grinder.js:454-475 energy_free_crushes: Refined Speed II/I stretch the
 * remaining time by 60/80%; 5 free crushes a second for the first 2 s
 * (at most 10), then 10 a second.
 */
export function flamingGrinderFreeCrushes(remainingSec, upgrades = []) {
  let r = Math.max(0, Number(remainingSec) || 0);
  const owned = new Set(upgrades || []);
  if (owned.has('refining_time_2')) r += r * 0.6;
  else if (owned.has('refining_time_1')) r += r * 0.8;
  let free = Math.min(r * 5, 10);
  if (r > 2) free += (r - 2) * 10;
  return free;
}

/**
 * smelter.js:446-470 energy_free_smelts: 1, +1 at 8 s, +1 at 9 s, +1 at 10 s
 * left, then 2.5 ingots a second over 10 s.
 */
export function smeltItDealtItFreeSmelts(remainingSec) {
  const r = Math.max(0, Number(remainingSec) || 0);
  let free = 1;
  if (r >= 8) free += 1;
  if (r >= 9) free += 1;
  if (r >= 10) free += 1;
  if (r > 10) free += (r - 10) * 2.5;
  return free;
}

/**
 * The per-unit energy_cost override for a batch: energy =
 * max((units - free) * cost, 0), spread over the batch.
 */
export function freeBatchEnergyCost(units, free, cost) {
  const n = Math.max(1, Math.floor(Number(units) || 1));
  const energy = Math.max((n - Math.max(0, Number(free) || 0)) * (Number(cost) || 0), 0);
  return energy / n;
}

/**
 * pungent_sunrise.js:121-128 + small_enlightenment on_apply: a fresh buff
 * speeds study for 90 s (ignoring the half-remaining cap); drinking again
 * while it runs restarts it and adds 90 minus the seconds that were left.
 */
export function smallEnlightenmentSeconds(previousRemainingSec = 0) {
  const prev = Number(previousRemainingSec) || 0;
  return prev > 0 && prev < 90 ? 90 - prev : 90;
}

/* ------------------------------------------------------------------ */
/* Kukubee winter                                                       */
/* ------------------------------------------------------------------ */

/**
 * location.js:335 / catalog_buffs.js kukubee_winter_*: LM413ATO8PR54,
 * LLI11ITO8SBS6, LM11E7ODKHO1QJE (Wintry Place is GM11E7ODKHO1QJE here).
 */
export const KUKUBEE_WINTER_TSIDS = Object.freeze([
  'LM413ATO8PR54',
  'LLI11ITO8SBS6',
  'LM11E7ODKHO1QJE',
  'GM413ATO8PR54',
  'GLI11ITO8SBS6',
  'GM11E7ODKHO1QJE',
]);

export const isKukubeeWinter = (tsid) => KUKUBEE_WINTER_TSIDS.includes(String(tsid || ''));

/**
 * kukubee_winter_negative on_tick messages. The 10th-tick line tests
 * `this.args.ticks_elapses` (a typo, never a number), so it never shows;
 * only every 5th tick's hint does.
 */
export function coldPlaceMessage(ticks) {
  const n = Math.floor(Number(ticks) || 0);
  return n > 0 && n % 5 === 0 ? 'Eating something hearty will protect you from the cold.' : '';
}

/* ------------------------------------------------------------------ */
/* Messages                                                             */
/* ------------------------------------------------------------------ */

/** catalog_buffs.js sendActivity lines on each tick. */
export const BUFF_TICK_MESSAGES = Object.freeze({
  buff_smashed: 'You feel completely smashed.',
  buff_hungover: 'Your head really hurts from your hangover',
  buff_garlic_breath: 'The power of garlic lives on in your mouth.',
});

/** catalog_buffs.js sendActivity lines on removal. */
export const BUFF_END_MESSAGES = Object.freeze({
  buff_smashed: "You don't feel as smashed anymore.",
  buff_hungover: 'That hangover is gone! You feel so much better.',
  buff_garlic_breath: 'You no longer have the taste of garlic in your mouth.',
});

/* ------------------------------------------------------------------ */
/* Gandlevery munch                                                     */
/* ------------------------------------------------------------------ */

/** items/gandlevery.js classProps and herb_base verbs.munch. */
export const GANDLEVERY_MUNCH = Object.freeze({
  classTsid: 'gandlevery',
  buff: 'gandlevery',
  verb: 'munch',
  label: 'Munch',
  tooltip: 'The effects of Gandlevery keep you wide awake.',
  moodRequired: 5,
  energyRequired: 0,
  message: 'You feel bright eyed and bushy tailed.',
  deadReason: "Your pitiful ghost-teeth can't masticate the tough fibres of the herb. Try being less dead.",
  tiredReason: 'You are too tired to masticate the tough fibres of the herb.',
  moodReason: 'Loss of appetite is a common side-effect of depression.',
  activeReason: 'The effects of eating too much of this herb could be serious!',
});

/** herb_base verbs.munch conditions, in order. */
export function gandleveryMunchButton(ctx = {}) {
  const g = GANDLEVERY_MUNCH;
  let reason = '';
  if (ctx.dead) reason = g.deadReason;
  else if ((Number(ctx.energy) || 0) < g.energyRequired) reason = g.tiredReason;
  else if ((Number(ctx.mood) || 0) < g.moodRequired) reason = g.moodReason;
  else if (ctx.active) reason = g.activeReason;
  return { id: g.verb, label: g.label, tooltip: g.tooltip, enabled: !reason, reason };
}

/* ------------------------------------------------------------------ */
/* Nekkid                                                               */
/* ------------------------------------------------------------------ */

/**
 * inc_avatar.js avatar_is_nekkid: no coat, shirt, pants, dress or skirt.
 * (The source also lets three plain shirts and two dresses count as bare by
 * their numeric article ids; the remake's articles are named, so only empty
 * slots count.)
 * @param {(type: string) => string} worn article name per type, 'none' when empty
 */
export function isNekkid(worn) {
  if (typeof worn !== 'function') return false;
  return ['coat', 'shirt', 'pants', 'dress', 'skirt'].every((type) => {
    const name = worn(type);
    return !name || name === 'none';
  });
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

/**
 * The buff tray shows the buff's item_class iconic. These item classes are
 * NPCs or quest markers whose iconic does not survive in the CC0 dump, so the
 * tray uses Tiny Speck art from the same thing: the quest's own requirement
 * item, the bog's Peat, Alph's emblem, the Cactus's Cubimal, the potion that
 * gives the buff, the Bureaucrat's Cubimal. js/buffs.js applyBuff reads this
 * table, so the stand-in is there from the first frame.
 */
export const BUFF_ICONS = Object.freeze({
  get_a_rasher: 'meat', // npc_piggy; animalkinship_nibble_meat asks for meat
  go_moloko_loco: 'milk_butterfly', // npc_butterfly; the milk it asks for
  bogspecialization_harvest_full_peat_bog_in_time_period: 'peat', // peat_2
  donate_1000_favor_every_giant_one_day: 'emblem_alph', // npc_shrine_alph
  teleportation_teleport_in_time_period: 'teleportation_script', // quest_req_icon_teleport
  its_so_hot: 'npc_cubimal_cactus', // npc_cactus
  its_so_hot2: 'npc_cubimal_cactus', // npc_cactus
  // G277: once potions-feature's own table, which swapped them in a tick after the buff was applied.
  crazy_coin_collector: 'potion_elixir_of_avarice', // quoin; the Elixir of Avarice gives it
  feeling_called_love: 'potion_amorous_philtre', // no item_class; the Amorous Philtre gives it
  please_wait: 'npc_cubimal_bureaucrat', // npc_bureaucrat; the Bureaucrat's own Cubimal
});
