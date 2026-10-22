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
]);

/**
 * Offer sources the remake cannot reproduce as written, replaced with the
 * nearest familiar trigger (the Magic Rock delivers them). Each row says why.
 * `prerequisites` custom_code values are answered by the quest-instances
 * feature (questCustomPrereq).
 */
export const OFFER_OVERRIDES = Object.freeze({
  // npc_juju_bandit roamed the four Kajuu hubs; onAccepted picks the clue hub from where you stand.
  help_juju_bandits: {
    offerTriggers: [
      { type: 'region', region: '86' },
      { type: 'region', region: '91' },
      { type: 'region', region: '95' },
      { type: 'region', region: '90' },
    ],
    why: 'npc_juju_bandit is not in the remake; offered in its four Kajuu hubs (Baqala, Zhambu, Xalanga, Choru)',
  },
  // The Bag Butler handed out the invitation (xp 30128); there is no butler.
  join_club: {
    offerTriggers: [{ type: 'xp', xp: 30128 }],
    why: 'bag_butler is not in the remake; same xp threshold through the Magic Rock',
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
  // firefly_whistle (the Alphite-age newxp lab) +10 days; the remake has no newxp lab.
  le_miserable: {
    offerTriggers: [{ type: 'level', level: 10 }],
    prereqQuests: [],
    prerequisites: [{ condition: 'custom_code', value: 'hour_after:le_miserable', not: 0 }],
    why: 'firefly_whistle newxp prereq replaced by level 10; canOffer: an hour after a fail',
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
  // Drinking a Cup of Water after getting your papers; the remake has no tainted cup.
  stale_but_necessary: {
    offerTriggers: [{ type: 'quest', quest: 'card_carrying_qualification' }],
    why: 'item_use cup_of_water trigger; offered after Legalize It',
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
  mental_block_2: {
    prerequisites: [{ condition: 'custom_code', value: 'upgrades:walk_speed_3,jump_2', not: 0 }],
    why: 'canOffer: walk_speed_3 and jump_2',
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
