/**
 * The Magic Rock at home (items/magic_rock.js, GSJS CC0): its owner-only home
 * verbs, the How To lessons that unlock them, and the "first cultivation has
 * to happen in your yard" rule. Pure; features/homes-feature.js draws the rock
 * and runs the verbs.
 *
 * Where it stands (locations/inc_homes.js): homes_demo_backyard 2349-2358 puts
 * one in the back yard at (-29, -155), homes_demo_frontyard 2469-2471 one on
 * the home street at (221, -144); both only_visible_to the owner.
 *
 * pc.magic_rock (the flags this module keeps): a How To verb sets its key to
 * 'howto_shown' (magic_rock.js 154, 183, 212); the matching verb (change
 * style 286, expand 319, cultivate land 344) only shows once its key is set.
 * checkLevelCapForHowto (520-532): from level 6 every key is set and
 * cultivate is 'cultivate_complete', so a seasoned player skips the lessons.
 *
 * The yard rule (cultivate_land 348-356): while cultivate is still
 * 'howto_shown', Cultivate Land on the home street (homes_get_type() ==
 * 'exterior') answers "Sorry kid ..." instead. It unlocks the first time
 * cultivation mode ends in a location with a Magic Rock (main.js 6062-6068 ->
 * doCultivationModeEnded 564-572): "Good work, kid ..." and cultivate becomes
 * 'cultivate_complete'. Only the rock's own verb is gated: the client's
 * Cultivate header button (YouDisplayManager.as 484) and shift+C
 * (TSMainView.as 815-828) send cultivation_start, which the server never
 * checks against these flags (inc_cultivation.js cultivation_start 104-111).
 *
 * G232: talk to (magic_rock.js 360-461) hands over the home street's daily
 * iMG (players/inc_houses.js houses_get_img_rewards 1706-1710 ->
 * locations/inc_cultivation.js cultivation_get_img_rewards 244-278), and
 * with nothing to hand over sends houses_upgrade_start, which opens the
 * client's HouseSignDialog (NCMsgHandler.as 3093-3096).
 *
 * The solo reading of the iMG: the pool only grows from other players.
 * cultivation_add_img_rewards (inc_cultivation.js 168-178) refuses the
 * owner (`!config.is_dev && this.pols_is_owner(pc)`), and every caller
 * (harvesting, petting, mining, Making on the street, ...) passes the acting
 * player; home.js home_log_visitor 435-458 (3% of the cap for each new
 * visitor a game day) only runs for someone who is not the owner (home.js
 * 93-96). With no visitors the pool stays empty, so what is left is the
 * stipend the same function adds on top: from level 2, 20% of the level's
 * cap (cultivation_rewards_cap 180-241), once a game day (the daily counter
 * cultivation_img_rewards, reset by player.js doNewDay 1052).
 *
 * Left out: How To: House Keys / house keys (keys are for other players),
 * How To: Customize / customize (the house chassis, street only, credits),
 * Whatcha Reading? (is_god only).
 */

/** checkLevelCapForHowto: pc.stats_get_level() >= 6. */
export const HOWTO_LEVEL_CAP = 6;

export const HOWTO_SHOWN = 'howto_shown';
export const CULTIVATE_COMPLETE = 'cultivate_complete';

/** The flag keys this remake uses (pc.magic_rock). */
const KEYS = Object.freeze(['changestyle', 'expand', 'cultivate']);

/** announce_vog_fade text, word for word ('//' separates the pages). */
export const HOWTO_TEXT = Object.freeze({
  // magic_rock.js 151
  changestyle: 'You can change the style of your Home Street or Yard whenever you want.//Changing the style takes a small amount of imagination each time you do it.//To change the style, just click on your Magic Rock and choose \'Change Style’.',
  // magic_rock.js 180
  expand: 'You can expand your Home Street and your Yard to make them wider and wider and wider//Expansion costs imagination and each expansion costs a bit more than the last one.//To expand your Home Street or your Yard, click on your Magic Rock and choose \'Expand\'.',
  // magic_rock.js 209
  cultivate: 'Cultivation allows you to spend imagination to create resources on your property.//You can cultivate gardens, mineable rocks, patches (for trees) and many other things.//Anything you cultivate on your home street will be usable by visitors; anything in your yard is private.//(The first thing you cultivate must be cultivated in your yard.)//Choose the \'Cultivate\' verb on your Magic Rock to get started.',
});

/**
 * conversation_start lines: `<split butt_txt="X">` ends a page whose button
 * reads X; the last page's button is the choice.
 */
export const ROCK_LINES = Object.freeze({
  // magic_rock.js 351
  yardFirst: [
    { text: 'Sorry kid — your first cultivation has to happen in your yard.', response: 'Ok?' },
    { text: 'Go inside your house and I’ll meet you in the yard for some cultivation action.', response: 'Will Do' },
  ],
  // magic_rock.js 567
  goodWork: [
    { text: 'Good work, kid. You are on your way to being a master of cultivation.', response: 'Yay!' },
    { text: 'Here’s a tip for: you can skip right into cultivation mode without talking to me if you press the shift key and the ‘C’ key together: shift+C!', response: 'Thanks' },
  ],
});

/** The verbs, in sort_on order (magic_rock.js 139-338). */
const VERBS = Object.freeze([
  { id: 'howto_changestyle', key: 'changestyle', howto: true, sort: 53, label: 'How To: Change Styles', tooltip: 'Learn how to change your street style' },
  { id: 'howto_expand', key: 'expand', howto: true, sort: 54, label: 'How To: Expand', tooltip: 'Learn how to expand your street and yard' },
  { id: 'howto_cultivate', key: 'cultivate', howto: true, sort: 55, label: 'How To: Cultivate', tooltip: 'Learn how to cultivate land' },
  { id: 'change_style', key: 'changestyle', sort: 58, label: 'change style', tooltip: 'Change your street style' },
  { id: 'expand', key: 'expand', sort: 59, label: 'expand', tooltip: '' },
  { id: 'cultivate_land', key: 'cultivate', sort: 60, label: 'cultivate land', tooltip: 'Cultivate your land' },
]);

export const ROCK_VERB_IDS = Object.freeze(VERBS.map((v) => v.id));

/** pc.magic_rock from a save (unknown keys and values dropped). */
export function normalizeRockFlags(seed) {
  const out = {};
  if (!seed || typeof seed !== 'object') return out;
  for (const key of KEYS) {
    const v = seed[key];
    if (v === HOWTO_SHOWN || (key === 'cultivate' && v === CULTIVATE_COMPLETE)) out[key] = v;
  }
  return out;
}

/** checkLevelCapForHowto: level 6 and up skips every lesson. Returns true when it applied. */
export function applyLevelCap(flags, level) {
  if (!(Number(level) >= HOWTO_LEVEL_CAP)) return false;
  flags.cultivate = CULTIVATE_COMPLETE;
  flags.changestyle = HOWTO_SHOWN;
  flags.expand = HOWTO_SHOWN;
  return true;
}

/**
 * The rock's verbs for this player in this room ('yard' inside the house,
 * 'street' outside), as verb menu rows. Mutates `flags` through the level cap,
 * as evaluating the How To conditions did.
 */
export function rockVerbs(flags, { level = 1, room = 'yard' } = {}) {
  applyLevelCap(flags, level);
  const rows = [];
  for (const v of VERBS) {
    const shown = Boolean(flags[v.key]);
    if (v.howto ? shown : !shown) continue;
    const tooltip = v.id === 'expand' ? (room === 'street' ? 'Expand your street' : 'Expand your yard') : v.tooltip;
    rows.push({ id: v.id, label: v.label, enabled: true, tooltip, durationMs: 0 });
  }
  return rows;
}

/** A How To verb: marks its lesson shown; returns the VOG pages. */
export function readHowto(flags, verbId) {
  const v = VERBS.find((row) => row.id === verbId && row.howto);
  if (!v) return null;
  flags[v.key] = HOWTO_SHOWN;
  return HOWTO_TEXT[v.key].split('//').map((s) => s.trim()).filter(Boolean);
}

/**
 * cultivate_land's handler: { ok: false, lines } on the home street while the
 * first cultivation is still owed to the yard, else { ok: true }.
 */
export function cultivateLandCheck(flags, room) {
  if (flags.cultivate === HOWTO_SHOWN && room === 'street') return { ok: false, lines: ROCK_LINES.yardFirst };
  return { ok: true };
}

/**
 * doCultivationModeEnded: with any lesson read, cultivation is complete from
 * now on; the first time (cultivate still 'howto_shown') the rock says so.
 * Returns the lines to say, or null.
 */
export function cultivationModeEnded(flags) {
  if (!Object.keys(flags).length) return null;
  const first = flags.cultivate === HOWTO_SHOWN;
  flags.cultivate = CULTIVATE_COMPLETE;
  return first ? ROCK_LINES.goodWork : null;
}

// ---------------------------------------------------------------------------
// G232: talk to: the home street's daily iMG
// ---------------------------------------------------------------------------

/** inc_cultivation.js cultivation_rewards_cap 180-241: the cap for each level (index level - 1). */
export const CULTIVATION_REWARDS_CAP = Object.freeze([
  50, 75, 100, 125, 150, 175, 200, 225, 250, 275,
  325, 375, 425, 475, 525, 585, 645, 705, 765, 825,
  900, 975, 1050, 1125, 1200, 1275, 1350, 1425, 1500, 1575,
  1675, 1775, 1875, 1975, 2075, 2175, 2275, 2375, 2475, 2575,
  2675, 2775, 2875, 2975, 3075, 3175, 3275, 3375, 3475, 3575,
  3675, 3775, 3875, 3975, 4075, 4175, 4275, 4375, 4475, 4575,
]);

/** cultivation_get_img_rewards: `if (pc.stats_get_level() >= 2)` adds the stipend. */
export const STIPEND_LEVEL = 2;
/** Math.round(cap * 0.20). */
export const STIPEND_SHARE = 0.2;

/** cultivation_get_rewards_cap 280-282 (levels past the table use its last row). */
export function rewardsCap(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  return CULTIVATION_REWARDS_CAP[Math.min(n, CULTIVATION_REWARDS_CAP.length) - 1];
}

/**
 * cultivation_get_img_rewards (inc_cultivation.js 244-278): 0 once cashed in
 * this game day; else the best earlier day in `pool` ({ dayKey: amount },
 * today's own day never counts), capped, plus the stipend from level 2.
 * The remake keeps no pool (see the solo reading above), so callers pass none.
 */
export function imgRewards({ level = 1, cashedToday = false, pool = null, today = '' } = {}) {
  if (cashedToday) return 0;
  let best = 0;
  for (const [day, amount] of Object.entries(pool || {})) {
    if (day === today) continue;
    const n = Number(amount) || 0;
    if (n > best) best = n;
  }
  const cap = rewardsCap(level);
  let out = Math.min(best, cap);
  if (Math.floor(Number(level) || 1) >= STIPEND_LEVEL) out += Math.round(cap * STIPEND_SHARE);
  return out;
}

/**
 * magic_rock.js 431-441: the daily_img counters for a hand-over of `amount`
 * (Healthy iMG turnover, Raking in the iMG, The Kindness of Strangers).
 */
export function dailyImgCounters(amount) {
  const out = [];
  if (amount > 503) out.push('daily_img:five_hundred_three');
  if (amount > 1009) out.push('daily_img:one_thousand_nine');
  if (amount > 2503) out.push('daily_img:twenty_five_hundred_three');
  return out;
}

/**
 * magic_rock.js 445: the conversation_start line (its "<b>N iMG</b>" in
 * plain text; the quest card draws no markup).
 */
export function imgRewardLine(amount) {
  return `My observations today have resulted in ${amount} iMG. Remember: the more stuff visitors do on your home street, the more you’ll earn.`;
}

/**
 * onPlayerCollision (magic_rock.js 992-1001): the bubble while there is iMG
 * to hand over, for 10 s. The remake has no player names ("friend", as
 * quests.js reads {pc_label}).
 */
export const IMG_BUBBLE_MS = 10 * 1000;
export function imgBubbleText(name = 'friend') {
  return `Hey ${name}, I have some iMG for you. Click on me and I’ll hand it over.`;
}

/**
 * HouseSignDialog.as (opened by houses_upgrade_start): the title, the
 * buttons in their order (buildBase 50-75, showButtons 91-151) and the
 * Expand tip. Change House (the exterior's chassis changer) and House Keys
 * (the key ACL, for other players) are not built here; Change Tower is
 * always hidden in the client (147).
 */
export const HOUSE_SIGN = Object.freeze({
  title: 'Your street',
  buttons: Object.freeze([
    Object.freeze({ id: 'expand', label: 'Expand' }),
    Object.freeze({ id: 'change_style', label: 'Change Style' }),
    Object.freeze({ id: 'cultivate', label: 'Cultivate Land' }),
  ]),
  expandTip: 'Your street is already sooo big!',
});

/**
 * showButtons 99-104: on the home street Expand is open while either side
 * has expansions left, in the yard while the yard has.
 */
export function houseSignCanExpand({ room = 'yard', count = 0, countLeft = 0, countRight = 0 } = {}) {
  return room === 'street' ? Boolean(countLeft || countRight) : Boolean(count);
}
