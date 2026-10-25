/**
 * Señor Funpickle, the Special Item That Only Beta Testers Get (register G209).
 *
 * Source: glitch-GameServerJS items/special_item_that_only_beta_testers_get.js
 * (eleven-gsjs has the same file). In Glitch it was Tiny Speck's gift to the
 * beta testers at "The Great Reset"; nobody else could get one. The remake
 * makes it a rare late-game street find (Austin 2026-10-25, desk FUNPICKLE),
 * the way Goodnight Groddle became a street find once every series tune is
 * owned (js/musicblocks.js MUSICBLOCK_ENDGAME_DROP).
 *
 * What the item does (all from the source file):
 * - Seven pack verbs (procrastinate, ignore, begrudge, respect, enjoy, infer,
 *   admire; 93-294) all call deployItem: the Too Much Fun buff (5 minutes,
 *   catalog_buffs.js 130-146), the item hops out 75 px in front of you
 *   (349-370), bounces after 1 s (bounce 296-301: state bounce2 and the
 *   SPECIAL_ITEM_THAT_ONLY_BETA_TESTERS_GET sound) and uses a power after 6 s.
 * - usePower (536-591): one of six powers at random (once every power has been
 *   seen, the weighted 30/30/10/10/10/10 table), then the item goes back in the
 *   pack. If you left the street it just goes back (tryAddToPack 509-534).
 *   The spammer power was removed (570-573); its letters are never sent.
 * - giveAward (372-378): the first time all six powers have been seen, Tiny
 *   Speck send Musicblock GNG (Goodnight Groddle).
 *
 * This module is the rules and the copy; js/features/funpickle-feature.js puts
 * them in the world.
 */

export const FUNPICKLE = 'special_item_that_only_beta_testers_get';

/** 3-14 and 647-652: the item's own words and tags. */
export const FUNPICKLE_ITEM = Object.freeze({
  label: 'Special Item That Only Beta Testers Get',
  namePlural: 'Special Items That Only Beta Testers Get',
  desc: 'Best selling toy in a year that the historians have glossed over, sales plummeted when it was discovered that many of the advertised functions of Señor Funpickle could cause injury, death, or severe unpopularity. Hastily rebranded, the remaining stock were quietly farmed out as commemorative free gifts at a time known as "The Great Reset".',
  baseCost: 0,
  stackMax: 1,
  sellable: false,
  donatable: false,
  tags: Object.freeze(['no_rube', 'collectible', 'no_auction', 'no_donate']),
});

/** 29-48 verbs.pickup tooltip (takeable). */
export const PICKUP_TOOLTIP = 'Put it in your pack';

/** The seven verbs in sort_on order (53-59) with their keys_in_pack (656-666). */
export const FUNPICKLE_VERBS = Object.freeze([
  { id: 'procrastinate', label: 'Procrastinate', key: 't', tooltip: 'Never mind. You can do stuff to the item later' },
  { id: 'ignore', label: 'Ignore', key: 'o', tooltip: "If you don't pay any attention to the item, maybe it will go away" },
  { id: 'begrudge', label: 'Begrudge', key: 'g', tooltip: 'Nurse a secret contempt for the item' },
  { id: 'respect', label: 'Respect', key: 'h', tooltip: 'Treat the item with the respect and deference it deserves' },
  { id: 'enjoy', label: 'Enjoy', key: 'n', tooltip: 'Experience the pure and honest enjoyment the item brings you' },
  { id: 'infer', label: 'Infer', key: 'c', tooltip: 'Deduce secret truths of the universe from brute facts about the item' },
  { id: 'admire', label: 'Admire', key: 'e', tooltip: 'Admire the many aesthetically pleasing qualities of the item' },
].map(Object.freeze));

export const COOLDOWN_BUFF = 'beta_item_cooldown';
/** Every verb's conditions (106-112 and the same six times after). */
export const COOLDOWN_REASON = 'On second thought, maybe you should wait a while before using this again.';
export const INTRO_REASON = "It's too early to start messing with your pickle. Can't you just wait for a while?";
/** canPickup 335-341. */
export const IN_USE_REASON = 'The Special Item That Only Beta Testers Get is moving around too much to pick up.';
/** deployItem 365. */
export const INVOKE_LINE = 'You invoke the awesome power of the Special Item That Only Beta Testers Get.';
/** deployItem 358, 368-369. */
export const DEPLOY_OFFSET = 75;
export const BOUNCE_MS = 1000;
export const POWER_MS = 6000;
export const BOUNCE_SOUND = 'SPECIAL_ITEM_THAT_ONLY_BETA_TESTERS_GET';

/** usePower 544. */
export const POWERS = Object.freeze(['moonwalk', 'comedian', 'sneezingFit', 'scream', 'brokenTeleporter', 'packExploder']);

/** The activity line each power sends first (moonwalk 381, comedian 344, sneezingFit 470). */
export const POWER_LINES = Object.freeze({
  moonwalk: 'A whole new sound, a whole new way to move: do the moonwalk.',
  comedian: 'Suddenly you feel overpoweringly witty, like the next thing you say just may be the funniest thing you have ever said.',
  sneezingFit: "You know that those times when you feel like you need to sneeze, but you can't? This is not one of those times.",
});

/** The buff each buff power applies. */
export const POWER_BUFFS = Object.freeze({ moonwalk: 'moonwalk', comedian: 'comedian', sneezingFit: 'sneezing_fit' });

/** scream 440-444, one at random; WILHELM_SCREAM; -5 mood (466). */
export const SCREAM_LINES = Object.freeze([
  "Put it away, will you?!? You'll startle the chickens.",
  'Squeeeeeeeee',
  'Put that away, you\'re frightening the livestock.',
]);
export const SCREAM_MOOD = 5;
/** scream 448-464: two black flashes. */
export const SCREAM_STEPS = Object.freeze([
  { alpha: 0, secs: 0.1 },
  { alpha: 0.9, secs: 0.05 },
  { alpha: 0.9, secs: 0.1 },
  { alpha: 0, secs: 0.05 },
  { alpha: 0, secs: 0.2 },
  { alpha: 0.9, secs: 0.1 },
  { alpha: 0.9, secs: 0.05 },
  { alpha: 0, secs: 0.05 },
].map(Object.freeze));

/** catalog_buffs.js 452-480 comedian on_remove (your next local chat line, main.js 1712-1715). */
export const COMEDIAN_SOUND = 'COMEDIAN';
export const COMEDIAN_LINE = 'Gosh darn it, that was witty. Everyone laughed uproariously!';
/** Everyone else on the street: +10 mood and the line about you. */
export const COMEDIAN_OTHERS_MOOD = 10;
export const comedianOthersLine = (label) => `${label} just said something wildly amusing. What a riot!`;

/**
 * catalog_buffs.js 2446-2510 sneezing_fit: 33 s, a sneeze every 3 s. Each
 * sneeze: SNEEZING_AHCHOO, the overlay_sneezing_powder pc_overlay (300 x 300
 * at delta_y -110, 2 s), +2 mood to everyone else, -3 mood to you, and two
 * Beans on the ground at your feet; lines on the sneezes counted below.
 */
export const SNEEZE_SOUND = 'SNEEZING_AHCHOO';
export const SNEEZE_EVERY_MS = 3000;
export const SNEEZE_MOOD = 3;
export const SNEEZE_OTHERS_MOOD = 2;
export const SNEEZE_BEANS = 2;
export const SNEEZE_OVERLAY = Object.freeze({ key: 'overlay_sneezing_powder', width: 300, height: 300, dy: -110, durationMs: 2000 });
export const SNEEZE_LINES = Object.freeze({
  1: 'You sneezed out some beans!',
  3: 'You sneezed out some more beans!',
  5: 'OK, this is starting to get worrying',
  7: 'Where are they even coming from?',
  9: 'Beans, beans, an awful disease: the more you snort the more you sneeze.',
  10: 'Wait, it feels like this is the last one.',
});
export const SNEEZE_END_LINE = "Either you're out of sneezes or you're out of beans. In any case, you should stop making bets that require you to put things up your nose.";

/** brokenTeleporter 303-333: a black wash to .7 over .5 s, two click-through lines, then a random teleport. */
export const TELEPORTER_WASH = Object.freeze({ alpha: 0.7, secs: 0.5 });
export function brokenTeleporterLines(label = 'Ur') {
  return [`${label}?`, "There's something amiss with the particle accelerating teletransponder… Oh boy…"];
}

/** packExploder 393-437. */
export const PACK_EXPLODER_MAX = 5;
// The source has a no-break space after the ellipsis.
export const PACK_EXPLODER_NOTHING = "Hm…\u00a0that didn't seem to do anything.";
export function packExploderLine(names) {
  return `They say that a fool and their money are soon parted. If rather than "a fool" they mean "you" and "money" they mean "${prettyList(names, ' and ')}", then yes, they're right.`;
}

/** giveAward 372-378. */
export const AWARD_ITEM = 'musicblock_goodnight_groddle';
export const AWARD_LINE = "You've experienced every shade of fun The Special Item Only Beta Testers Get has in his arsenal. As an apology, Tiny Speck have sent you this Musicblock.";

/** common.js 765-772 pretty_list. */
export function prettyList(list, joiner = ' and ') {
  const items = [...(list || [])];
  if (!items.length) return '';
  if (items.length === 1) return String(items[0]);
  const last = items.pop();
  return `${items.join(', ')}${joiner}${last}`;
}

/* ------------------------------------------------------------------ */
/* Save                                                                 */
/* ------------------------------------------------------------------ */

/**
 * found: picked up once (the street find never comes back).
 * placed: { tsid, x, y } while it waits on a street.
 * powersUsed: the source's powers_used; givenAward: given_award.
 * out: the item is out of the pack (deployed) and goes back on load.
 */
export function normalizeFunpickleState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const used = {};
  for (const id of POWERS) if (s.powersUsed?.[id]) used[id] = 1;
  const placed = s.placed && typeof s.placed.tsid === 'string' && Number.isFinite(Number(s.placed.x)) && Number.isFinite(Number(s.placed.y))
    ? { tsid: s.placed.tsid, x: Number(s.placed.x), y: Number(s.placed.y) }
    : null;
  return {
    version: 1,
    found: s.found === true,
    placed,
    powersUsed: used,
    givenAward: s.givenAward === true,
    out: s.out === true,
    uses: Math.max(0, Math.floor(Number(s.uses) || 0)),
  };
}

/* ------------------------------------------------------------------ */
/* Verbs and powers                                                     */
/* ------------------------------------------------------------------ */

/** The seven pack buttons: disabled on Too Much Fun or before the intro. */
export function funpickleVerbButtons({ cooldown = false, introDone = true, inUse = false } = {}) {
  let reason = '';
  if (cooldown) reason = COOLDOWN_REASON;
  else if (!introDone) reason = INTRO_REASON;
  else if (inUse) reason = IN_USE_REASON;
  return FUNPICKLE_VERBS.map((v) => ({ id: v.id, label: v.label, tooltip: v.tooltip, enabled: !reason, reason }));
}

export function isFunpickleVerb(id) {
  return FUNPICKLE_VERBS.some((v) => v.id === id);
}

/** usePower 547-566: choose_one before the award, the weighted table after. */
export function choosePower(state, rng = Math.random) {
  const r = rng();
  if (!state?.givenAward) return POWERS[Math.min(POWERS.length - 1, Math.floor(r * POWERS.length))];
  if (r <= 0.3) return POWERS[0];
  if (r <= 0.6) return POWERS[1];
  if (r <= 0.7) return POWERS[2];
  if (r <= 0.8) return POWERS[3];
  if (r <= 0.9) return POWERS[4];
  return POWERS[5];
}

/** usePower 568-579: mark the power seen; true when this one earns the award. */
export function recordPower(state, power) {
  if (!state.powersUsed || typeof state.powersUsed !== 'object') state.powersUsed = {};
  // The spammer functionality has been removed (570-573).
  delete state.powersUsed.spammer;
  if (POWERS.includes(power)) state.powersUsed[power] = 1;
  state.uses = (state.uses || 0) + 1;
  if (Object.keys(state.powersUsed).length === POWERS.length && !state.givenAward) {
    state.givenAward = true;
    return true;
  }
  return false;
}

/**
 * packExploder 394-402: up to five stacks worth more than 0 and less than
 * 1000 currants (not bags, not elements), cheapest first; one of each flies
 * out. The source's comparator returns a boolean, so its order was loose;
 * this sorts by base cost, then pack order. The remake also leaves quest
 * items and no_drop items alone (its own drop rules).
 */
export function packExploderPicks(inv, { baseCost = () => 0, tags = () => [] } = {}, max = PACK_EXPLODER_MAX) {
  const rows = [];
  let order = 0;
  for (const [id, n] of Object.entries(inv || {})) {
    order += 1;
    if (!(Number(n) > 0) || id === FUNPICKLE) continue;
    const cost = Number(baseCost(id)) || 0;
    if (!(cost > 0 && cost < 1000)) continue;
    const t = tags(id) || [];
    if (id.startsWith('bag_') || t.includes('bag')) continue;
    if (t.includes('element') || /^element_/.test(id)) continue;
    if (t.includes('quest-item') || t.includes('no_drop')) continue;
    rows.push({ id, cost, order });
  }
  rows.sort((a, b) => a.cost - b.cost || a.order - b.order);
  return rows.slice(0, max).map((r) => r.id);
}

/** packExploder 417-430: x within 500 px either side of you (the stack then falls to a platform). */
export function packExploderX(x, rng = Math.random) {
  return x - 500 + 1000 * rng();
}

/** config_prod.js 1203 public_hubs (teleportation_random_teleport picks one). */
export const PUBLIC_HUBS = Object.freeze([27, 40, 50, 51, 56, 58, 63, 64, 66, 71, 72, 75, 76, 78, 85, 86, 88, 89, 90, 91, 92, 93, 95, 97, 98, 99, 100, 101, 102, 105, 106, 107, 108, 109, 110, 112, 113, 114, 116, 119, 120, 121, 123, 125, 126, 128, 131, 133, 136, 137, 140, 141, 142, 143].map(String));

/**
 * players/inc_teleportation.js 548-597 teleportation_random_teleport: a random
 * public hub, then a random street in it that is not a home, an instance, hidden
 * or job-locked (`ok(tsid)`). Returns a street tsid or null.
 * @param {Record<string, { hubId?: string }>} streets the street index
 */
export function pickRandomTeleport(streets, rng = Math.random, ok = () => true, hubs = PUBLIC_HUBS) {
  const byHub = new Map();
  for (const [tsid, meta] of Object.entries(streets || {})) {
    const hub = String(meta?.hubId ?? '');
    if (!hubs.includes(hub)) continue;
    if (!byHub.has(hub)) byHub.set(hub, []);
    byHub.get(hub).push(tsid);
  }
  const hubIds = [...byHub.keys()];
  while (hubIds.length) {
    const hub = hubIds.splice(Math.floor(rng() * hubIds.length), 1)[0];
    const candidates = byHub.get(hub);
    while (candidates.length) {
      const tsid = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
      if (ok(tsid)) return tsid;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The street find                                                      */
/* ------------------------------------------------------------------ */

/**
 * The remake's own rule (desk FUNPICKLE): from level FIND_MIN_LEVEL, about one
 * street in FIND_ODDS hides it, chosen by a stable hash of the street so it
 * is a place, not a dice roll on every visit. Once picked up it never turns up
 * again. Not inside homes, instances or the newxp island (the caller says).
 */
export const FIND_MIN_LEVEL = 30;
export const FIND_ODDS = 40;

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isFindStreet(tsid) {
  return Boolean(tsid) && stableHash(`funpickle:${tsid}`) % FIND_ODDS === 0;
}

/** Whether this street should get the find now. */
export function shouldPlaceFind(state, { tsid, level = 1, owned = false, eligible = true, force = false } = {}) {
  if (!state || !tsid || state.found || owned || state.placed) return false;
  if (force) return true;
  if (!eligible || (Number(level) || 0) < FIND_MIN_LEVEL) return false;
  return isFindStreet(tsid);
}
