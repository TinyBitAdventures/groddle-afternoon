/**
 * Which quest uses which rebuilt instance room, which rooms are built, and the
 * offer-source substitutions the remake needs. Pure data: read by
 * build-quests.mjs (classification + quests.json) and by the quest-instances
 * feature at runtime.
 *
 * Source: the 32 quests build-quests.mjs once excluded as `instance_unbuilt`
 * (GSJS quests/*.js `locations` + onStarted questInstanceLocation /
 * instances_create_delayed). Two templates survive as instantiated copies in
 * the locations dump (`instance_of`): Le Miserable LIFMMN6E7A73R0T ->
 * GIFM4BD43383DKV and the Institute of Ocular Testing LNVUCOIA1MJ2M54 ->
 * GNV1T7PCUM53T25; Carry That Weight's twenty clue streets are ordinary
 * streets with their `juju_dig` boxes. Every other room is a reconstruction.
 */

/** quest class_tsid -> room id (js/quest-rooms/<room id with - for _>.js). */
export const QUEST_ROOMS = Object.freeze({
  numismatic_hustle: 'rainbow_run',
  high_jump: 'top_of_tree',
  help_juju_bandits: 'juju_camp',
  help_juju_bandits_2: 'juju_camp',
  eyeballery_identify_object: 'vision_quest',
  le_miserable: 'le_miserable',
  le_miserable_part_2: 'le_miserable',
  le_miserable_reminisce: 'le_miserable',
  letter_block_1: 'kids_room',
  letter_block_3: 'kids_room',
  an_autumn_day: 'an_autumn_day',
  an_autumn_day_part2: 'an_autumn_day',
  last_pilgrimage_of_esquibeth: 'esquibeth',
  last_pilgrimage_of_esquibeth_reminisce: 'esquibeth',
  stale_but_necessary: 'being_watched',
  fuelmaking_refuel_robot: 'back_alley',
  rube_spy: 'rube_yard',
  mental_block: 'mental_block',
  mental_block_2: 'mental_block',
  mental_block_rem: 'mental_block',
  puzzle_level_color_blockage: 'color_unblocking',
  puzzle_level_color_blockage_rem: 'color_unblocking',
  puzzle_level_light_perspective: 'light_perspective',
  puzzle_level_light_perspective_rem: 'light_perspective',
  radiant_glare: 'radiant_glare',
  radiant_glare_rem: 'radiant_glare',
  picto_pattern: 'picto_pattern',
  btc_room_3: 'tile_puzzle',
  btc_room_3_reminisce: 'tile_puzzle',
  join_club: 'clubhouse',
  join_club_reminisce: 'clubhouse',
  where_the_blue_grew: 'operation_grow',
  // Gwendolyn's Task (onStarted instances_create_delayed: tower_quest_desert
  // LCR8MP0IJI1299U, tower_quest_headspace LCR8MQ9JJI12IIK, tower_quest_crystine
  // LCR8MRAKJI12UOP; none survive in the locations dump).
  tower_quest: 'gwendolyn',
  tower_quest_part2: 'gwendolyn',
  tower_quest_part3: 'gwendolyn',
  tower_quest_part3repeat: 'gwendolyn',
  // Smuggle the Smuggler (onStarted instance `penalty`; the template is lost).
  smuggle_the_smuggler_part1: 'penalty',
  smuggle_the_smuggler_part2: 'penalty',
  smuggle_the_smuggler_part3: 'penalty',
  // Firefly Whistle (onStarted instances_create_delayed firefly_whistle from
  // LM113UBSS8P18ET, the Fireflex 3000 Lab; not in the dump).
  firefly_whistle: 'firefly_whistle',
});

/** Rooms that exist and pass QA. A quest is solo-offerable once its room is here. */
export const BUILT_ROOMS = Object.freeze([
  'rainbow_run',
  'top_of_tree',
  'color_unblocking',
  'vision_quest',
  'kids_room',
  'rube_yard',
  'le_miserable',
  'juju_camp',
  'picto_pattern',
  'radiant_glare',
  'an_autumn_day',
  'being_watched',
  'back_alley',
  'clubhouse',
  'light_perspective',
  'tile_puzzle',
  'operation_grow',
  'gwendolyn',
  'mental_block',
  'penalty',
  'esquibeth',
  'firefly_whistle',
]);

/**
 * Offer sources the remake cannot reproduce as written, replaced with the
 * nearest familiar trigger (the Magic Rock delivers them). Each row says why.
 * `prerequisites` custom_code values are answered by the quest-instances
 * feature (questCustomPrereq).
 */
export const OFFER_OVERRIDES = Object.freeze({
  // npc_juju_bandit.js giveQuest offers it (setAvailableQuests): the bandit a Savanna Dust Trap
  // brings while the quest is 'none' (features/juju-bandits-feature.js). onAccepted picks the
  // clue hub from where you stand.
  help_juju_bandits: {
    offerTriggers: [{ type: 'npc', npc: 'npc_juju_bandit' }],
    why: 'npc_juju_bandit offers it: a Dust Trap in Baqala, Zhambu, Xalanga or Choru brings one half the time while the quest is new (dust_trap.js, juju_bandit_curse)',
  },
  // The Bag Butler hands out the invitation (players/inc_stats.js 313-322, xp 30128).
  join_club: {
    offerTriggers: [{ type: 'xp', xp: 30128 }, { type: 'npc', npc: 'bag_butler' }],
    prerequisites: [{ condition: 'custom_code', value: 'no_butler' }],
    why: 'inc_stats.js gives it to the Butler at 30128 iMG, which offers it in its far hit box (features/butler-feature.js answers the no_butler gate for itself); without a Butler the Magic Rock offers it at the same xp',
  },
  join_club_reminisce: {
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:join_club', not: 0 }],
    why: 'canOffer: admins only (pc.is_god) in the source; opened to players through the Play Cube an hour after Join the Club and an hour after the last try',
  },
  // Street spirits gave it after A Summer's Day; their talk menu offers no quests.
  an_autumn_day: {
    offerTriggers: [{ type: 'quest', quest: 'blue_and_white_part1' }],
    why: 'street spirit giver; offered once A Summer’s Day is done',
  },
  an_autumn_day_part2: {
    offerTriggers: [{ type: 'quest', quest: 'an_autumn_day' }],
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:an_autumn_day', not: 0 }],
    why: 'street spirit giver; canOffer: an hour after part 1 and after the last repeat',
  },
  // Source: firefly_whistle done 10+ days earlier (le_miserable.js 17-23). Austin 2026-10-24: one day.
  le_miserable: {
    offerTriggers: [{ type: 'quest', quest: 'firefly_whistle' }],
    prereqQuests: ['firefly_whistle'],
    prerequisites: [
      { condition: 'custom_code', value: 'hours_after:24:firefly_whistle', not: 0 },
      { condition: 'custom_code', value: 'hour_after:le_miserable', not: 0 },
    ],
    why: 'a day after Firefly Whistle (source: ten days); canOffer: an hour after a fail',
  },
  le_miserable_reminisce: {
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:le_miserable_part_2', not: 0 }],
    why: 'canOffer: an hour after part 2 and after the last repeat',
  },
  // Donating at a shrine 30 minutes after Giant devotion.
  last_pilgrimage_of_esquibeth: {
    offerTriggers: [{ type: 'quest', quest: 'donate_to_all_shrines', delaySec: 1800 }],
    why: 'shrine_donation event trigger; offered after donate_to_all_shrines',
  },
  last_pilgrimage_of_esquibeth_reminisce: {
    prerequisites: [{ condition: 'custom_code', value: 'hours_after:4:last_pilgrimage_of_esquibeth', not: 0 }],
    why: 'canOffer: a game day (4 hours) after part 1 and after the last repeat or fail; offered by the Conch Reminisce verb',
  },
  // Drinking a Cup of Water from a Bureaucratic Hall's Water Cooler (cup_of_water.js drink:
  // quests_offer('stale_but_necessary', true)): features/bureaucratic-halls-feature.js offers it then.
  stale_but_necessary: {
    offerTriggers: [{ type: 'event', event: 'item_use', item: 'cup_of_water' }],
    why: 'item_use cup_of_water trigger: drinking a Cup of Water from a Bureaucratic Hall Water Cooler',
  },
  // The Rube visiting your home; the remake's Rube trades on streets.
  rube_spy: {
    offerTriggers: [{ type: 'prerequisites' }],
    prerequisites: [{ condition: 'custom_code', value: 'rube_traded', not: 0 }],
    why: 'rube_visited_home event; offered once you have traded with The Rube',
  },
  // canOffer gates from the source (imagination upgrades).
  mental_block: {
    prerequisites: [{ condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 }],
    why: 'canOffer: walk_speed_3 and jump_2',
  },
  mental_block_rem: {
    prerequisites: [
      { condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 },
      { condition: 'custom_code', value: 'hour_after:mental_block', not: 0 },
    ],
    why: 'canOffer: walk_speed_3 and jump_2; an hour after part 1 and after the last repeat or fail',
  },
  puzzle_level_light_perspective: {
    prerequisites: [{ condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 }],
    why: 'canOffer: walk_speed_3 and jump_2',
  },
  puzzle_level_light_perspective_rem: {
    prerequisites: [
      { condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 },
      { condition: 'custom_code', value: 'hour_after:puzzle_level_light_perspective', not: 0 },
    ],
    why: 'canOffer: walk_speed_3 and jump_2; an hour after part 1, after the last repeat and after a fail',
  },
  // npc_gwendolyn.js offers it (setAvailableQuests + offerQuests on collision)
  // in Room 23, the tower_quest instance behind Corridor Five's locked
  // Red-Green Triangle Key door (js/gwendolyn-room-23.js,
  // features/gwendolyn-room-23-feature.js). Greeterbot Sentry G-42 turns
  // anyone under level 12 away before they reach her (npc_widget.js).
  tower_quest: {
    offerTriggers: [{ type: 'npc', npc: 'npc_gwendolyn' }],
    prerequisites: [{ condition: 'over_level', value: 12, not: 0 }],
    why: "The Ghost of Gwendolyn offers it in Room 23 (behind Corridor Five's key 5 door); Greeterbot Sentry G-42's level 12 gate stands before her",
  },
  smuggle_the_smuggler_part1: {
    offerTriggers: [{ type: 'npc', npc: 'npc_smuggler' }],
    why: 'no offer trigger survives; the give Smuggler offers it after a delivery (smuggling-feature.js checks the shovel/ace_of_spades onStarted gate)',
  },
  // Live report 2026-10-30 #7: the Play Cube offered it again at once (puzzle_level_color_blockage_rem.js canOffer 70-82).
  puzzle_level_color_blockage_rem: {
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:puzzle_level_color_blockage', not: 0 }],
    why: 'canOffer: an hour after part 1 and after the last repeat or fail',
  },
  btc_room_3_reminisce: {
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:btc_room_3', not: 0 }],
    why: 'canOffer: an hour after part 1 and after the last repeat or fail',
  },
  // Offered by the familiar when any of four Firebog completist badges is
  // earned; its has_achievement shimla_mirch_completist gate is never checked
  // by quests_offer, so it would wrongly limit the offer to Shimla Mirch.
  where_the_blue_grew: {
    prerequisites: [],
    replacePrerequisites: true,
    why: 'quests_offer ignores prerequisites: any of the four Firebog completist badges offers it',
  },
  // npc_firefly.js wandering_onMsg: bumping into a Firefly while the quest is new shows "What ho! ..."
  // "... Fireflies!" and its done_payload makes the familiar offer it (main.js quests_offer(.., true)).
  // The remake's Fireflies do that (features/resource-nodes-feature.js); questGiver stays the Magic Rock.
  firefly_whistle: {
    offerTriggers: [{ type: 'npc', npc: 'npc_firefly' }],
    why: 'npc_firefly.js offers it on collision while the quest is new; the familiar delivers it (features/resource-nodes-feature.js)',
  },
  radiant_glare: {
    prerequisites: [{ condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 }],
    why: 'canOffer: walk_speed_3 and jump_2',
  },
  radiant_glare_rem: {
    prerequisites: [
      { condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 },
      { condition: 'custom_code', value: 'hour_after:radiant_glare', not: 0 },
    ],
    why: 'canOffer: walk_speed_3 and jump_2; an hour after part 1 and after the last repeat or fail',
  },
});

/**
 * Items the rooms hand out or ask for, registered in the pack catalog at boot
 * (inventory.js ensureItem) so they read correctly after a reload. Icons live
 * at assets/sprites/icons/<class>.png (recovered OGA iconic art).
 */
export const ROOM_ITEMS = Object.freeze({
  // items/play_cube.js: Color Unblocking's first-run reward; tags no_rube, no_trade, no_auction, toys.
  play_cube: {
    label: 'Play Cube',
    desc: "Play Cubes are famous the world over. Re-live some of your favorite quest memories with one simple click. Don't waste another minute, play with your cube now!",
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'toys'],
  },
  // items/conch.js: The Last Pilgrimage of Esquibeth's memento; Play and Blow live in quest-rooms/esquibeth.js.
  conch: {
    label: 'Conch',
    desc: 'A Conch!',
    stackMax: 1,
    baseCost: 700,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_donate', 'no_auction', 'no_mail', 'no_trade'],
  },
  // items/random_kindness.js: Gwendolyn's Task III's reward; its bestow verb needs another player.
  random_kindness: {
    label: 'Random Kindness',
    namePlural: 'Random Kindnesses',
    desc: 'This priceless item dispenses random kindness.',
    stackMax: 1,
    baseCost: 0,
    isTool: true,
    sellable: false,
    tags: ['tool', 'no_auction', 'toys'],
  },
  // items/juju_trowel.js, note_hint.js, juju_paperweight.js (Carry That Weight).
  juju_trowel: {
    label: 'Juju Trowel',
    namePlural: 'Juju Trowels',
    desc: 'A rustic trowel fashioned by Juju Bandits for delicate digging in the dense savanna dirt.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'no_discovery_dialog', 'quest-item'],
  },
  note_hint: {
    label: 'Secret Juju Hint',
    namePlural: 'Secret Juju Hints',
    desc: 'If you can decipher this clue, it might lead you somewhere interesting.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'no_discovery_dialog', 'quest-item', 'bureaucracy'],
  },
  juju_paperweight: {
    label: 'Ancestral Paperweight',
    namePlural: 'Ancestral Paperweight',
    desc: 'An ancient decorative weight of uncanny beauty and density, this relic is used by the Juju Bandits to secure the bounty of their traditional paper hunts.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'quest-item'],
  },
});

/** Pack items that offer a room's reminisce quests (npc triggers on an item class). */
export const REMINISCE_ITEMS = Object.freeze({
  play_cube: 'play_cube',
  conch: 'conch',
});

/**
 * Labels of the NPCs and pack items that hand out quest-room quests (GSJS items/<class>.js
 * `var label`), so a retry names whoever offered the quest (G99).
 */
export const GIVER_LABELS = Object.freeze({
  bag_butler: 'Butler',
  npc_gwendolyn: 'Ghost of Gwendolyn',
  npc_squid: 'Zzybzfrx',
  npc_widget: 'Greeterbot Sentry G-42',
  npc_juju_bandit: 'Juju Bandit',
  npc_juju_grandma: 'Juju Grandma',
  npc_smuggler: 'Smuggler',
  npc_rare_item_vendor: 'Extremely Rare Items Vendor',
  npc_maintenance_bot: 'MaintenanceBot M-64',
  play_cube: 'Play Cube',
  conch: 'Conch',
});
export const MAGIC_ROCK_GIVER = Object.freeze({ npc: 'magic_rock', label: 'Magic Rock' });

/**
 * custom_code gates that, when they pass, mean the Magic Rock offered the quest instead of its
 * NPC (OFFER_OVERRIDES: join_club comes from the Magic Rock only when there is no Butler).
 */
export const FAMILIAR_GATES = Object.freeze({ join_club: 'no_butler' });

/**
 * Who offers a quest: its first NPC or pack-item offer trigger with a known giver, else the
 * Magic Rock (quests offered on level, xp, quest or other familiar triggers).
 * @param {object} def quest catalog row (offerTriggers)
 * @param {{ familiar?: boolean }} opts familiar: the FAMILIAR_GATES gate passed
 * @returns {{ npc: string, label: string }}
 */
export function questGiver(def, { familiar = false } = {}) {
  const triggers = def?.offerTriggers || [];
  const npc = triggers.find((t) => t.npc && GIVER_LABELS[t.npc]);
  if (!npc) return MAGIC_ROCK_GIVER;
  if (familiar && triggers.some((t) => !t.npc && t.type !== 'npc')) return MAGIC_ROCK_GIVER;
  return { npc: npc.npc, label: GIVER_LABELS[npc.npc] };
}

export function roomForQuest(questId) {
  return QUEST_ROOMS[questId] || null;
}

export function isBuiltRoom(roomId) {
  return BUILT_ROOMS.includes(roomId);
}

/** Quests whose rooms are built. */
export function builtInstanceQuests() {
  return Object.keys(QUEST_ROOMS).filter((id) => isBuiltRoom(QUEST_ROOMS[id]));
}

/** Module path for a room (room ids use _, files use -). */
export function roomModulePath(roomId) {
  return `./${String(roomId).replace(/_/g, '-')}.js`;
}
