/**
 * The Bureaucratic Hall Water Cooler and its Cup of Water (pure rules: no
 * Pixi, no DOM). features/bureaucratic-halls-feature.js stands the cooler in
 * every hall and runs the verbs.
 *
 * Source (glitch-GameServerJS, CC0):
 *  - items/water_cooler.js: "Water Cooler", tag no_trade, verb get_water
 *    "get water from" (tooltip "Obtain a tiny conical cup of generic office
 *    water"), disabled with "Your bag is full!" when a cup would not fit
 *    (conditions 40-44); the handler (64-96) gives one cup_of_water, says "A
 *    cup of water cooler water is duly dispensed." and loses 2 energy. Asset
 *    box 96 x 172 (getAssetInfo).
 *  - items/cup_of_water.js: "Cup of Water" / "Cups of Water", base_cost 1,
 *    stackmax 1, tag drink. drink (pack, default verb, tooltip "Imbibe the
 *    plain water from this generic cone-cup", 128-170): loses 5 mood, says
 *    "Ewww. That water tastes really … bureaucratic-y.", then
 *    quests_offer('stale_but_necessary', true) and the cup is gone.
 *    onContainerChanged 192-198: a cup set down in a location turns
 *    unselectable and is destroyed 5 minutes later; its own pickup verb
 *    (29-75) never calls takeable_pickup.
 *  - players/inc_quests.js quests_offer 578-606: force_now skips the
 *    prereq_quests and canOffer checks; quests/stale_but_necessary.js is
 *    is_emergency, not repeatable (status 'done' returns, 610-615).
 *  - Where the coolers stood: the Glitch Forever wiki's Water Cooler page
 *    ("can be found in Bureaucratic Halls, located in Chego Chase in Andra,
 *    in Gregarious Grange in Groddle Meadow and in Baeli Bray in Muufo") and
 *    the community's update log ("Being Watched quest added. Drink a Cup of
 *    Water from a Bureaucratic Hall Water Cooler"). The halls' geometry is
 *    lost, so where the cooler stands inside is ours.
 */

export const WATER_COOLER_CLASS = 'water_cooler';
export const CUP_CLASS = 'cup_of_water';
export const CUP_QUEST = 'stale_but_necessary';

/** items/water_cooler.js. */
export const WATER_COOLER = Object.freeze({
  classTsid: WATER_COOLER_CLASS,
  label: 'Water Cooler',
  desc: 'Water dispensing devices do not get more generic than this. It is as plain as could be. Were it possible for water to be beige, beige this water would be.',
  /** getAssetInfo position box. */
  w: 96,
  h: 172,
  verb: Object.freeze({ id: 'get_water', label: 'Get water from', tooltip: 'Obtain a tiny conical cup of generic office water' }),
  energy: 2,
  dispensed: 'A cup of water cooler water is duly dispensed.',
  full: 'Your bag is full!',
});

/** items/cup_of_water.js. */
export const CUP_OF_WATER = Object.freeze({
  classTsid: CUP_CLASS,
  label: 'Cup of Water',
  namePlural: 'Cups of Water',
  desc: 'This water is so plain, it has no Brownian motion, but Beigien motion instead. Drink at own risk.',
  baseCost: 1,
  stackMax: 1,
  tags: Object.freeze(['drink']),
  verb: Object.freeze({ id: 'drink', label: 'Drink', tooltip: 'Imbibe the plain water from this generic cone-cup' }),
  mood: 5,
  drank: 'Ewww. That water tastes really … bureaucratic-y.',
});

/**
 * get_water conditions: enabled unless a cup would not fit (`room` is how
 * many cups fit, null when the pack has no limit to ask).
 */
export function getWaterState({ room = null } = {}) {
  if (room != null && Number(room) < 1) return { enabled: false, reason: WATER_COOLER.full };
  return { enabled: true, reason: '' };
}

/**
 * get_water handler: one cup into the pack, 2 energy lost through `loseEnergy`
 * (metabolics_lose_energy). Returns { ok, msg, energy }.
 */
export function getWater(inv, { room = null, addItem, loseEnergy = () => 0 } = {}) {
  const state = getWaterState({ room });
  if (!state.enabled) return { ok: false, msg: state.reason, energy: 0 };
  addItem(inv, CUP_CLASS, 1);
  const energy = Number(loseEnergy(WATER_COOLER.energy)) || 0;
  return { ok: true, msg: WATER_COOLER.dispensed, energy };
}

/**
 * Whether drinking offers Being Watched now: quests_offer returns for a quest
 * that is done (not repeatable) or already in the log or offered (status not
 * 'none'). `status` is quest-offers.js questStatus.
 */
export function cupOffersQuest(status) {
  return status === 'none' || status === 'declined';
}

/**
 * drink handler: the cup is used up and 5 mood lost through `loseMood`.
 * Returns { ok, msg, mood, offer } (offer: the quest to put to the player, or '').
 */
export function drinkCup(inv, { removeItem, countItem, loseMood = () => 0, questStatus = 'none' } = {}) {
  if ((Number(countItem(inv, CUP_CLASS)) || 0) < 1) return { ok: false, msg: '', mood: 0, offer: '' };
  removeItem(inv, CUP_CLASS, 1);
  const mood = Number(loseMood(CUP_OF_WATER.mood)) || 0;
  return { ok: true, msg: CUP_OF_WATER.drank, mood, offer: cupOffersQuest(questStatus) ? CUP_QUEST : '' };
}
