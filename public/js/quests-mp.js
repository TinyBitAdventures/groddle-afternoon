/**
 * Quests that need other players, offered and completed between real
 * players in multiplayer (register G329). Pure data and helpers: no DOM, no
 * socket. js/quest-offers.js reads MULTIPLAYER_QUESTS when its ctx says
 * multiplayer (features/quest-offers-feature.js questContext); the world side
 * is features/quests-mp-feature.js. Solo never reads any of this: there
 * these quests stay left out (quests.json solo:false) exactly as before.
 *
 * Each quest was judged against its GSJS quest file and the code that
 * offers it and counts it:
 *
 * Offered by its source trigger (quests.json offerTriggers, mined from GSJS):
 *  - distilling_make_and_distribute_hooch: Distilling I's quest
 *    (inc_data_skills.js:1049, 3973). make_hooch is still.js giveHooch 453
 *    (features/supply-feature.js counts a collect in multiplayer);
 *    bootleg_hooch is hooch.js onSell 144-147 (vendor_sold:hooch), onTrade
 *    149-152 (a settled trade, the server's trade_done) and onGive 135-137
 *    (a Give to a player, once G332 has one) and onAuctionSold 131-133 (a
 *    sale the site settled, G333 features/auctions-feature.js). onMail
 *    139-142 has no multiplayer path yet.
 *  - teleportation_make_and_hand_out_tp_scripts: Teleportation V's quest
 *    (inc_data_skills.js:3491, 3967). make_teleportation_script is the
 *    script written (js/teleportation.js making_recipe:teleportation_script);
 *    give_teleportation_script is teleportation_script.js onGive 277-286,
 *    once per player given one. Only the pack's Give counts (not a trade), so
 *    it waits for a Give to a player (needs: give).
 *  - kindly_randomness: the level 10 quest (inc_quests.js quests_level_map
 *    1025). give_player_level1 is takeable.js takeable_give 283-289: once per
 *    player of level 3 to 5 given anything. Needs a Give whose receiver's
 *    level the site or server vouches for (needs: give).
 *  - croppery_harvest_and_sell_at_auction (Tater 'n' Mater): Croppery II's
 *    quest (inc_data_skills.js:938, 3920). auctions_sold_potato and
 *    auctions_sold_tomato are inc_auctions.js:526, the seller's count of a
 *    sale; G333's Auction House counts it once per sale the site settled
 *    (features/auctions-feature.js), so it waits for the auctions (needs:
 *    auctions). The harvest counters are the garden's, as in solo.
 *  - herbalism_plant_seeds_in_someones_garden: Herbalism III's quest
 *    (inc_data_skills.js:1937, 3977). herb_seeds_planted_for_others is
 *    include/garden.js 394-396, counted by features/neighbours-mp-feature.js
 *    when a key-holder's planting in a friend's herb garden is taken by the
 *    site (HomeTending.php).
 *  - transcendentalradiation_radiate_to_five_people: Transcendental Radiation
 *    I's quest (inc_data_skills.js:3750, 3942). transcendence_5players is
 *    focusing_orb.js 1298-1300 (6+ players on the street when it ends),
 *    decided by the server (G330 radiance.go) and set by meditation-feature.
 *  - teleportation_teleport_with_followers (Three's a Cloud): Teleportation
 *    III's quest (inc_data_skills.js:3417, 3965). teleportation_self_withfollowers_3
 *    is inc_teleportation.js teleport_complete 1048-1057: 3 or more still
 *    following 3 s after the teleport. The server counts the followers
 *    (follow.go follow_teleported) and features/follow-mp-feature.js sets
 *    the flag; offered once following another player works (needs: follow).
 *  - soilappreciation_help_digging (It Takes Two): Soil Appreciation II's
 *    quest (inc_data_skills.js:3158, 3891). helped_dig is dirt_pile.js
 *    onDigComplete 481-483: a dig that had helpers (others who started
 *    digging the same Dirt Pile while it ran, addDigger 153-166). The
 *    realtime server keeps the dig crews (objects.go obj_dig, digHelp) and
 *    features/help-mine-feature.js counts a dig its answer says was helped.
 *  - meditative_arts_with_friends (is_multiplayer): offered by its own
 *    conditions (the quest file's prerequisites has_skill meditativearts_1
 *    and its two prereq_quests; quests.json 'prerequisites' trigger), as the
 *    familiar offers any such quest. GSJS never sets meditate_10players, so
 *    the count is ours: a meditation during which 10 other players were
 *    meditating on the street at once (the server counts them, G330
 *    radiance.go meditate_together; meditation-feature's meditated_together
 *    carries the peak).
 *
 * Offered by a trigger of ours (nothing in GSJS offers them: no file names
 * them, and their counters are never incremented there; the neighbours
 * slice counts them, neighbours-mp.js NEIGHBOUR_COUNTERS). The familiar
 * offers each once the act it asks for first becomes possible:
 *  - good_neighbor ("visit their home streets, and tend 11 of their
 *    resources", end_npcs magic_rock: the Magic Rock is the familiar) and
 *    water_neighbor_garden ("Water 5 gardens that belong to any neighbor"):
 *    once you stand on a friend's home street holding their key (tending
 *    needs one in the remake: garden_new.js tend conditions).
 *  - neighbor_gifts ("pop on over to 5 different neighbors and leave a gift
 *    with their butler"): once you have stood on another player's home
 *    street, where their Butler takes a package.
 *
 * Logged by a race challenge (offer: 'challenge'): amazing_race, canyon_run,
 * crystal_climb, grab_em_good, lava_leap, space_race, star_sprint,
 * time_warp. These are the quest races (is_multiplayer, familiar_turnin,
 * repeatable, no rewards): accepting one was the challenge (quest.js
 * onAccept 74-76 -> onRestart 106-140 quests_multiplayer_invite). The final
 * game raced by ticket (inc_games.js), which the remake runs (races.go); the
 * ticket's challenge now also puts the course's quest in the challenger's
 * log, started. Nobody coming fails it (quests_multiplayer_invite_timeout
 * inc_quests.js 1099-1125 failQuest; a repeatable quest leaves the log,
 * failQuest 456-465); the winner gets multiplayer_quest_win (inc_race.js
 * 386); the owner who did not win fails it (inc_race.js 183-189);
 * race_leave is set on entering a street that is no race (location.js
 * 533-538), which completes a won race's quest. Only the challenger holds
 * the quest (inc_race.js quest_owner), as in the source.
 *
 * Left out (MULTIPLAYER_QUESTS_LEFT_OUT says what each would need).
 */

/** The quest races' courses (js/races-mp.js MP_RACE_COURSES): each course id is its quest's class. */
export const MP_RACE_QUESTS = Object.freeze([
  'amazing_race', 'canyon_run', 'crystal_climb', 'grab_em_good', 'lava_leap', 'space_race', 'star_sprint', 'time_warp',
]);

/** The source's counter and flag names these quests use. */
export const MP_QUEST_COUNTERS = Object.freeze({
  makeHooch: 'make_hooch',
  bootlegHooch: 'bootleg_hooch',
  giveScript: 'give_teleportation_script',
  giveLowLevel: 'give_player_level1',
  meditateTen: 'meditate_10players',
  meditatedTogether: 'meditated_together',
  raceWin: 'multiplayer_quest_win',
  raceLeave: 'race_leave',
});

/** Facts the ours-triggers test (features/quests-mp-feature.js keeps them in its save slice). */
export const MP_FACTS = Object.freeze({
  /** Stood on a friend's home street holding their house key. */
  tendNeighbour: 'tend_neighbour',
  /** Stood on another player's home street. */
  visitNeighbour: 'visit_neighbour',
});

const ours = (fact) => Object.freeze([Object.freeze({ type: 'mp', fact })]);

/**
 * The quests multiplayer offers or logs. offer: 'source' (the quest's own
 * quests.json offerTriggers), 'ours' (offerTriggers here), 'challenge' (a
 * race challenge logs it; never offered by the familiar). needs: what must
 * be live first (ctx.mpReady[name]).
 */
export const MULTIPLAYER_QUESTS = Object.freeze({
  distilling_make_and_distribute_hooch: Object.freeze({ offer: 'source', source: 'inc_data_skills.js:1049, 3973' }),
  teleportation_make_and_hand_out_tp_scripts: Object.freeze({ offer: 'source', needs: Object.freeze(['give']), source: 'inc_data_skills.js:3491, 3967' }),
  kindly_randomness: Object.freeze({ offer: 'source', needs: Object.freeze(['give']), source: 'inc_quests.js:1025' }),
  herbalism_plant_seeds_in_someones_garden: Object.freeze({ offer: 'source', source: 'inc_data_skills.js:1937, 3977' }),
  // G333: Croppery II's quest (inc_data_skills.js:938, 3920); auctions_sold_<class> is the seller's,
  // counted when the site settled the sale (inc_auctions.js:526; features/auctions-feature.js).
  croppery_harvest_and_sell_at_auction: Object.freeze({ offer: 'source', needs: Object.freeze(['auctions']), source: 'inc_data_skills.js:938, 3920' }),
  transcendentalradiation_radiate_to_five_people: Object.freeze({ offer: 'source', source: 'inc_data_skills.js:3750, 3942' }),
  // G334 follow: Teleportation III's quest; the flag is the server's count at teleport_complete (follow.go).
  teleportation_teleport_with_followers: Object.freeze({ offer: 'source', needs: Object.freeze(['follow']), source: 'inc_data_skills.js:3417, 3965' }),
  meditative_arts_with_friends: Object.freeze({ offer: 'source', source: 'quests/meditative_arts_with_friends.js prerequisites, prereq_quests' }),
  // G329 help digging: the server's Dirt Pile dig crews (objects.go digHelp); helped_dig from its answer.
  soilappreciation_help_digging: Object.freeze({ offer: 'source', source: 'inc_data_skills.js:3158, 3891' }),
  good_neighbor: Object.freeze({ offer: 'ours', offerTriggers: ours(MP_FACTS.tendNeighbour) }),
  water_neighbor_garden: Object.freeze({ offer: 'ours', offerTriggers: ours(MP_FACTS.tendNeighbour) }),
  neighbor_gifts: Object.freeze({ offer: 'ours', offerTriggers: ours(MP_FACTS.visitNeighbour) }),
  ...Object.fromEntries(MP_RACE_QUESTS.map((id) => [id, Object.freeze({ offer: 'challenge', source: 'quest.js:74-76, 106-140' })])),
});

/** The quests G329 judged and left out, with what each needs (or why it stays out). */
export const MULTIPLAYER_QUESTS_LEFT_OUT = Object.freeze({
  play_musicblocks: 'Nothing in GSJS offers it, and it needs Play for on another player (musicblock_*.js 239-242).',
  watering_time: 'Nothing in GSJS offers it (watering_can.js 320-325 only counts it), and it needs watering another player.',
  grub_giver: 'Nothing in GSJS offers or names it, and its requirements are only cooking.',
  butler_zombies: 'Nothing in GSJS offers it, and butlers_zombied is only ever reset there (player.js:1018-1021; telling a Butler "zombie" keeps another tally, butler_data.js 1349-1365).',
  tower_defense: 'Nothing survives of it: no requirements, and nothing offers it.',
  multiplayer_races: 'Development only: its course is in config_dev.js:169, not config_prod.js.',
});

/** The multiplayer row for a quest, or null. */
export function multiplayerQuest(classTsid) {
  return Object.hasOwn(MULTIPLAYER_QUESTS, String(classTsid || '')) ? MULTIPLAYER_QUESTS[classTsid] : null;
}

/**
 * The row when the familiar may offer this quest in this ctx: multiplayer,
 * not a challenge-logged race quest, and every need live. Otherwise null.
 */
export function offerableMultiplayerQuest(classTsid, ctx = {}) {
  if (ctx?.multiplayer !== true) return null;
  const row = multiplayerQuest(classTsid);
  if (!row || row.offer === 'challenge') return null;
  if ((row.needs || []).some((need) => ctx.mpReady?.[need] !== true)) return null;
  return row;
}

/** Quests completable online whose rewards the ledger credits once (tools/build-economy.mjs). */
export function creditedMultiplayerQuests() {
  return Object.keys(MULTIPLAYER_QUESTS).sort();
}

const positiveInt = (v) => {
  const n = Math.floor(Number(v));
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * What one confirmed Give to a player counts (the GIVER's side):
 * `{ classTsid, count, to, toLevel }`. Returns [{ counter, amount, label? }];
 * a label means once per label (the quest's distinct receivers).
 *  - bootleg_hooch: hooch.js onGive 135-137, the count given.
 *  - give_teleportation_script: teleportation_script.js onGive 277-286, once per receiver
 *    (imbued scripts too: teleportation_script_imbued.js onGive 282-291).
 *  - give_player_level1: takeable.js 283-289, once per receiver of level 3 to 5.
 */
export function giveCounters({ classTsid, count = 1, to = 0, toLevel = null } = {}) {
  const cls = String(classTsid || '');
  const n = Math.max(1, positiveInt(count) || 1);
  const target = positiveInt(to);
  const out = [];
  if (!cls || !target) return out;
  if (cls === 'hooch') out.push({ counter: MP_QUEST_COUNTERS.bootlegHooch, amount: n });
  if (cls === 'teleportation_script' || cls === 'teleportation_script_imbued') {
    out.push({ counter: MP_QUEST_COUNTERS.giveScript, amount: 1, label: String(target) });
  }
  const level = Number(toLevel);
  if (Number.isFinite(level) && level >= 3 && level <= 5) {
    out.push({ counter: MP_QUEST_COUNTERS.giveLowLevel, amount: 1, label: String(target) });
  }
  return out;
}

/** Hooch traded away in a settled trade (hooch.js onTrade 149-152: the trader's count). */
export function tradeHoochCount(gave) {
  let n = 0;
  for (const row of Array.isArray(gave?.items) ? gave.items : []) {
    const c = String(row?.c ?? row?.class ?? row?.classTsid ?? '');
    if (c === 'hooch') n += positiveInt(row?.n ?? row?.count);
  }
  return n;
}

/** Is this street id a race instance (the server's RACE_<id>, js/races-mp.js)? */
export function isRaceStreet(tsid) {
  return /^RACE_/.test(String(tsid || ''));
}

/**
 * The save slice, cleaned: { facts: { name: at }, trades: [trade id counted for hooch],
 * scriptsGiven: [receiver id] } (teleportation_script.js onGive 285-289 kept that list for good).
 */
export function normalizeQuestsMpSlice(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const facts = {};
  for (const name of Object.values(MP_FACTS)) {
    const at = Math.floor(Number(s.facts?.[name]) || 0);
    if (at > 0) facts[name] = at;
  }
  const trades = (Array.isArray(s.trades) ? s.trades : [])
    .map((id) => String(id || ''))
    .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))
    .slice(-50);
  const scriptsGiven = [...new Set((Array.isArray(s.scriptsGiven) ? s.scriptsGiven : [])
    .map((id) => String(positiveInt(id) || ''))
    .filter(Boolean))]
    .slice(-200);
  return { facts, trades, scriptsGiven };
}
