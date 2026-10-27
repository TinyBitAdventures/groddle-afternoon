/**
 * Ancestral Nostalgia: the limited visit to the Ancestral Lands (the Savanna
 * hubs Baqala, Choru, Zhambu and Xalanga). Pure rules and copy, no Pixi and
 * no DOM; features/juju-bandits-feature.js runs them on the Ancestral Lands
 * clock (baqala_times, js/juju-bandits.js), which the Juju Bandits' theft
 * chance reads too.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 *  - locations/savanna.js savanna_on_enter (1-36): coming into the Savanna
 *    from another region, or logging in there, runs start_baqala_buff and
 *    offers Baqalic Caesura; walking between Savanna streets with the buff
 *    gone runs check_baqala_boot; with Overwhelmed by Ancestral Nostalgia on
 *    you, entering shows the "Overwhelmed!" prompt (6-17) and its OK sends
 *    you away (prompt_callback do_baqala_boot). savanna_on_exit (42-63): the
 *    first time you leave overwhelmed, the second "Overwhelmed!" prompt
 *    (48-59); otherwise leave_savanna.
 *  - players/inc_special_locations.js start_baqala_buff (15-72): apply
 *    ancestral_nostalgia (25), the activity line (27), then shorten the buff
 *    by the time already spent (buffs_alter_time, 46-54: 12 min with
 *    Prepared II, 11 with Prepared I, else the catalog 10). leave_savanna
 *    (88-112) removes the buff and forgets potion_used. give_baqala_time
 *    (128-149): lengthen the buff (never past its full length) and take the
 *    same off the clock. check_baqala_boot (151-168): in the Savanna with the
 *    buff gone, apply too_much_nostalgia (160) and do_baqala_boot (170-240):
 *    reset_baqala_times, then teleport to one of 26 streets (199-226) at a
 *    random incoming signpost or door (geo_links_get_incoming, 228-239).
 *  - items/catalog_buffs.js ancestral_nostalgia (21-44): "Overwhelming
 *    Ancestral Nostalgia", 600 s, a timer, not offline; on_apply +120 s with
 *    Prepared II, +60 s with Prepared I; on_remove check_baqala_boot.
 *    too_much_nostalgia (2758-2775): "Overwhelmed by Ancestral Nostalgia",
 *    1800 s, a timer, offline, a debuff; on_remove reset_baqala_times.
 *  - players/inc_imagination.js 175-176: buying either Prepared card while
 *    the buff runs adds 60 s to it.
 *  - inc_data_imagination.js 188-243: the two cards (see imagination-data.js).
 *  - items/potion_ancestral_spirits.js canQuaff / onQuaff (512-521): only
 *    under the buff, once per visit, give_baqala_time(300).
 *  - items/dust_trap.js doDrop (51-74): the remnants give 10 / 20 / 40 / 60 s.
 *
 * The buff's time left is always (its full length) - (the clock): entering
 * shortens it by the clock, the cards lengthen both together, and
 * give_baqala_time moves both by the same amount, so the remake derives the
 * buff from the clock instead of keeping a second timer (see buffLeftSeconds).
 */

export const NOSTALGIA_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 players/inc_special_locations.js, locations/savanna.js, items/catalog_buffs.js, players/inc_imagination.js, items/potion_ancestral_spirits.js';

export const NOSTALGIA_BUFF = 'ancestral_nostalgia';
export const OVERWHELMED_BUFF = 'too_much_nostalgia';
export const NOSTALGIA_CARDS = Object.freeze(['ancestral_lands_time_1', 'ancestral_lands_time_2']);
export const NOSTALGIA_QUEST = 'baqala_nostalgia';

export const NOSTALGIA = Object.freeze({
  baseSeconds: 600, // catalog_buffs.js ancestral_nostalgia duration
  card1Seconds: 11 * 60, // start_baqala_buff / give_baqala_time with ancestral_lands_time_1
  card2Seconds: 12 * 60, // ... with ancestral_lands_time_2
  overwhelmedSeconds: 1800, // catalog_buffs.js too_much_nostalgia duration
  potionSeconds: 300, // potion_ancestral_spirits.js onQuaff give_baqala_time(300)
});

/** Player copy, word for word from the source files named. */
export const NOSTALGIA_TEXT = Object.freeze({
  // inc_special_locations.js:27 sendActivity
  enter: "The gravity of countless ages weighs heavily on your shoulders. You can't spend too long here!",
  // savanna.js:9-10 and 50-51 prompts_add title
  title: 'Overwhelmed!',
  // savanna.js:9 (entering while overwhelmed; OK runs do_baqala_boot)
  tooMuch: "Oh, this is too much! You will be sent somewhere to recuperate until you're ready to return to the Ancestral Lands.",
  // savanna.js:50 (leaving overwhelmed, the first time)
  kicked: "You were overwhelmed by wistfulness while exploring the savanna, and forced to beat a hasty retreat. You won't be able to re-enter for approximately exactly half an hour, so be careful!",
  ok: 'OK',
});

const ownedSet = (owned) => (owned instanceof Set ? owned : new Set(Array.isArray(owned) ? owned : []));

/** The buff's full length in seconds: buffs_alter_time's duration (12*60, 11*60 or the catalog 600). */
export function nostalgiaLimitSeconds(owned = []) {
  const have = ownedSet(owned);
  if (have.has('ancestral_lands_time_2')) return NOSTALGIA.card2Seconds;
  if (have.has('ancestral_lands_time_1')) return NOSTALGIA.card1Seconds;
  return NOSTALGIA.baseSeconds;
}

/** Ancestral Nostalgia's time left for a clock (seconds spent, get_baqala_buff_time). */
export function buffLeftSeconds(spentSeconds, owned = []) {
  return nostalgiaLimitSeconds(owned) - Math.max(0, Number(spentSeconds) || 0);
}

/** The buff has run out (its on_remove runs check_baqala_boot). */
export const nostalgiaExpired = (spentSeconds, owned = []) => buffLeftSeconds(spentSeconds, owned) <= 0;

/**
 * give_baqala_time(amount) on a clock: nothing without the buff; the buff
 * cannot grow past its full length (buffs_alter_time moves its start to now
 * at most), so the clock drops by min(amount, spent). Returns the seconds given.
 */
export function giveBaqalaTime(clock, seconds, { active = true } = {}) {
  if (!active || !clock) return 0;
  const spent = Math.max(0, Number(clock.spent) || 0);
  const given = Math.min(Math.max(0, Number(seconds) || 0), spent);
  clock.spent = spent - given;
  return given;
}

/**
 * reset_baqala_times: the clock starts over (the kick, and the end of
 * Overwhelmed by Ancestral Nostalgia).
 */
export function resetBaqalaTimes(clock) {
  if (!clock) return clock;
  clock.spent = 0;
  clock.exitAt = null;
  clock.inside = false;
  clock.loggedOut = false;
  return clock;
}

/** One of the do_baqala_boot streets (rows from js/ancestral-nostalgia-data.js), then one of its incoming arrivals. */
export function pickBootTarget(streets = [], { streetRoll = Math.random(), arrivalRoll = Math.random(), exists = () => true } = {}) {
  const pool = streets.filter((s) => s && s.arrivals?.length && exists(s.tsid));
  if (!pool.length) return null;
  const street = pool[Math.min(pool.length - 1, Math.floor(streetRoll * pool.length))];
  const [x, y] = street.arrivals[Math.min(street.arrivals.length - 1, Math.floor(arrivalRoll * street.arrivals.length))];
  return { tsid: street.tsid, label: street.label, arrive: { x, y } };
}
