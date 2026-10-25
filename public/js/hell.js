/**
 * Croaking (dying at zero energy), Naraka / Hell One, grape penance, and
 * resurrection. Pure rules: no DOM, no Pixi, no storage. Every mutator returns
 * a NEW state object plus an `effects` list the game applies in order.
 *
 * Source of truth (tinyspeck/glitch-GameServerJS, CC0):
 * - players/player.js        croak() 1245, resurrect() 1327, recognizeDeath() 1430,
 *                            low-energy "time passes" warning 837, checkNewGameDay() 855,
 *                            clearHellWarning() 3324 (gore overlay flag, see HELL_GORE_WARNING)
 * - players/inc_metabolics.js croak trigger + pooped/super_pooped 137-165, dead gain/loss
 *                            guards, pooped removal on energy gain above 5%
 * - players/inc_teleportation.js  dead / Naraka / pooped teleport rules
 * - config_prod.js            hell { tsid: LA5PPFP86NF2FOS, x: [-910,-814,-712], y: [-357 x3] },
 *                            default_location { LLIF6R3R9GE1GQB, -468, -111 }
 * - locations/location.js    isInHell / isInHellOne / isInPurgatoryHub (hubid 40),
 *                            hell_one entry prompt (1 s first visit, 30 s afterwards),
 *                            "dead but not in hell" force-back on enter
 * - items/bunch_of_grapes_hell.js  squish: grapes_squished += count, >= 11 resurrects,
 *                            SQUISH_GRAPES sound, grape deleted (each grape once)
 * - items/graveside_marker.js, items/hell_bartender.js, items/wine_of_the_dead.js,
 *   items/drink_ticket.js
 * - quests/hell_hole.js ("It's Better in a Hell Hole"), quests/hell_quest.js
 *   ("Beelzebooze"), quests/you_croaked.js (offer is commented out in croak())
 * - items/catalog_buffs.js   pooped / super_pooped / walking_dead
 * - achievements/clumsy1, darwin_award_winner, necromonger, zombie, dracula
 *   (player:deaths 3/11/53/251/1009), quiet_tragedy (croaked:at_home 1),
 *   naraka_completist (streets_visited_in_hub:number_40 7)
 * - inc_data_sounds.js       HELL music key (c2 Bongbong.mp3, not recoverable);
 *                            CROAK and SQUISH_GRAPES are client sound keys
 *
 * Coordinates: the archived street JSON uses source coordinates (x right,
 * y up = more negative). The game uses screen space: sx = x - bounds.l,
 * sy = y - bounds.t (street-model.js worldToScreen). Croak/resurrect locations
 * are stored in whatever space the caller passes (the spike saves screen
 * coordinates); hell spawns and grapes are exported in both spaces.
 *
 * State shape (normalizeHellState):
 * {
 *   version, isDead, deathsToday, deathsDayKey, totalDeaths, croakedAt, croakDayKey,
 *   visitId, hellVisits, grapesSquished, squishedGrapeIds[], resurrectLocation,
 *   previousMapPath, graveMarker, deathRecognized, lastLowEnergyWarningAt,
 *   pooped: null | { kind, appliedAt, expiresAt }, dontGetPooped,
 *   energyConsumedToday, energyConsumedDayKey,
 *   narakaStreetsVisited[], hellWarningShown
 * }
 */

import { ensureItem } from './inventory.js?v=catalog-unified-4';
import { GAME_DAY_MS, getGameDayKey, getGameDayStartMs } from './game-day.js?v=dametime-1';

export const HELL_STATE_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Source constants                                                    */
/* ------------------------------------------------------------------ */

/** players/player.js croak(): `grapes_squished >= 11` resurrects. */
export const GRAPES_REQUIRED = 11;

/** Energy % at or below which the "about to croak" warning fires. */
export const LOW_ENERGY_WARNING_PERCENT = 10;
/** inc_metabolics.js: `time() - this['!last_energy_warning'] > 60` seconds. */
export const LOW_ENERGY_WARNING_COOLDOWN_MS = 60 * 1000;
/** Energy % at or below which a player who already croaked today becomes Pooped. */
export const POOPED_ENERGY_PERCENT = 5;
/** Super Pooped when today's consumed energy reaches 20 x max energy. */
export const SUPER_POOPED_CONSUMED_MULTIPLIER = 20;
/** resurrect(): energy = top * 0.10, or top * 0.05 while Pooped. */
export const RESURRECT_ENERGY_FRACTION = 0.1;
export const RESURRECT_ENERGY_FRACTION_POOPED = 0.05;
/** resurrect(): mood is capped at top / 2 (it is 0 after croak, so stays 0). */
export const RESURRECT_MOOD_CAP_FRACTION = 0.5;
/** croak(): graveside marker created at (x, y - 29). */
export const GRAVE_MARKER_Y_OFFSET = -29;
/** graveside_marker onCreate: fade after 45 min, disappear 15 min later. */
export const GRAVE_MARKER_FADE_MS = 45 * 60 * 1000;
export const GRAVE_MARKER_DISAPPEAR_MS = 60 * 60 * 1000;
export const GRAVE_MARKER_RECOGNITION_FAVOR = 5;
/** location.js hell_one entry prompt delay in seconds (first visit / later). */
export const HELL_ENTRY_PROMPT_DELAY_FIRST_MS = 1000;
export const HELL_ENTRY_PROMPT_DELAY_REPEAT_MS = 30 * 1000;
export const HELL_ENTRY_PROMPT_TIMEOUT_MS = 10 * 1000;

export const HELL_TEXT = Object.freeze({
  croaked: 'You croaked!',
  aboutToCroak: 'You are about to croak! Find something to eat.',
  extremelyLow: 'You are extremely low on energy! Find something to eat.',
  hellEntryPrompt:
    'Uh oh. You croaked! Bummer! Just find some hellish grapes on the ground in here and give them some good squashing. Keep going until you get out!',
  squished: 'You squished a Bunch of Hellish Grapes.',
  squishTooltip: 'Do your purgatory duty',
  deadEnergyGain: "You would have gained energy, but you're dead!",
  deadMoodGain: "You would have gained some mood, but you're dead!",
  deadEnergyLoss: "You would have lost energy, but you're dead!",
  deadMoodLoss: "You would have lost some mood, but you're dead!",
  superPoopedEnergyGain: "You would have gained energy, but you're super pooped!",
  pooped: 'You are seriously pooped! You need energy to get out of it.',
  superPooped: 'You are completely pooped. Rest and chat a bit until the new day arrives.',
  teleportDead: 'You are dead.',
  teleportToNaraka: "There's only one way to get to Naraka, and that's not it.",
  teleportPooped: 'You are too Pooped to teleport. Eat something first!',
  wineNoLongerPooped: 'You are no longer pooped!',
  wineDied: 'You died!',
  wineNotPooped: "You aren't Pooped, so there's no reason to drink this now.",
  wineTooltipDead: 'Bottoms up! Drink this to become less Pooped.',
  wineTooltipAlive: "Bottoms up! What's the worst that could happen?",
  walkingDeadTick: 'Braiiiiiiiiins!',
  graveAlreadyRecognizedOther: 'Someone else has already recognized the passing of this Glitch.',
  graveAlreadyRecognizedSelf: 'You have already recognized the passing of this Glitch.',
});

/** Sound / music keys the game maps to audio. */
export const HELL_SOUNDS = Object.freeze({
  croak: 'CROAK',
  squish: 'SQUISH_GRAPES',
  music: 'HELL',
});

/**
 * HELL music: the production key pointed at c2.glitch.bz/sounds/2010-05/
 * 1274906921-Bongbong.mp3, which is absent from the Wayback Machine (CDX empty).
 * The recovered public-catalog stand-in is already shipped and mapped to hub 40
 * ("hell") in assets/content/ambient-music.json.
 */
export const HELL_MUSIC = Object.freeze({
  key: 'HELL',
  sourceUrl: 'http://c2.glitch.bz/sounds/2010-05/1274906921-Bongbong.mp3',
  track: 'assets/audio/ambient/Dirge-of-the-Damned_1291886020.mp3',
  ambientProfile: 'hell',
  stopFadeSeconds: 2,
});

/** Buffs touched by croak/resurrect (items/catalog_buffs.js). */
export const HELL_BUFFS = Object.freeze({
  pooped: Object.freeze({
    classTsid: 'pooped',
    name: 'Pooped',
    desc: 'You are seriously pooped! You need energy to get out of it',
    physics: Object.freeze({ speed: 0.5, jump: 0.5 }),
    until: 'next_game_day',
  }),
  super_pooped: Object.freeze({
    classTsid: 'super_pooped',
    name: 'Super Pooped',
    desc: 'You are completely pooped. Rest and chat a bit until the new day arrives',
    physics: Object.freeze({ speed: 0.5, jump: 0.5 }),
    blocksEnergyGain: true,
    until: 'next_game_day',
  }),
  walking_dead: Object.freeze({
    classTsid: 'walking_dead',
    name: 'Walking Dead',
    preventsCroak: true,
    tickSeconds: 60,
  }),
  /** Removed at croak; no_no_powder also suppresses the zero-energy croak. */
  removedOnCroak: Object.freeze(['no_no_powder_crash', 'no_no_powder']),
});

/** The production "safe location when all else fails" (config_prod.js). */
export const DEFAULT_LOCATION = Object.freeze({
  sourceTsid: 'LLIF6R3R9GE1GQB',
  tsid: 'GLIF6R3R9GE1GQB',
  label: 'Burnabee',
  sourceX: -468,
  sourceY: -111,
  bounds: Object.freeze({ l: -3000, r: 3000, t: -1000, b: 0 }),
  x: 2532,
  y: 889,
});

/** Spike home scene ids (js/homes.js); hard-coded to avoid a game.js-only import. */
export const HOME_TSIDS = Object.freeze({ street: 'RH_HOME_EXT', interior: 'RH_HOME_INT' });

/** Hell One floor geometry embedded from assets/streets/GA5PPFP86NF2FOS.json. */
export const HELL_ONE_PLATFORMS = Object.freeze([
  Object.freeze({ id: 'plat_1319486971932', x1: 1244, y1: -195, x2: 1499, y2: -187, pc_perm: -1 }),
  Object.freeze({ id: 'pl1263890361047', x1: -945, y1: -344, x2: -682, y2: -344, pc_perm: -1 }),
  Object.freeze({ id: 'plat_1319489256886', x1: -1283, y1: -191, x2: -1069, y2: -199, pc_perm: -1 }),
  Object.freeze({ id: 'plat_1319489256887', x1: -1499, y1: -203, x2: -1283, y2: -191, pc_perm: -1 }),
  Object.freeze({ id: 'pl1263887138338', x1: -1069, y1: -199, x2: 1097, y2: -191, pc_perm: -1 }),
]);

const HELL_ONE_BOUNDS = Object.freeze({ l: -1500, r: 1500, t: -1000, b: 0 });
const HELL_SOURCE_SPAWNS = Object.freeze([
  Object.freeze({ x: -910, y: -357 }),
  Object.freeze({ x: -814, y: -357 }),
  Object.freeze({ x: -712, y: -357 }),
]);

/**
 * Hell One. The config spawns sit 13 px above the raised ledge
 * `pl1263890361047` (y -344, x -945..-682), so each spawn also carries the
 * ledge `groundY` for a clean landing.
 */
export const HELL_LOCATION = Object.freeze({
  sourceTsid: 'LA5PPFP86NF2FOS',
  tsid: 'GA5PPFP86NF2FOS',
  label: 'Hell One',
  internalLabel: 'Hell One Clone',
  hubId: '40',
  hubName: 'Naraka',
  instanceId: 'hell_one',
  instanceMaxMembers: 21,
  noTeleportation: true,
  disallowAnimals: true,
  noRook: true,
  specialLoadingImage: 'streets/2010-12-16-static/hell.png',
  bounds: HELL_ONE_BOUNDS,
  sourceSpawns: HELL_SOURCE_SPAWNS,
  spawns: Object.freeze(
    HELL_SOURCE_SPAWNS.map((p) =>
      Object.freeze({
        x: p.x - HELL_ONE_BOUNDS.l,
        y: p.y - HELL_ONE_BOUNDS.t,
        groundY: -344 - HELL_ONE_BOUNDS.t,
        sourceX: p.x,
        sourceY: p.y,
      })
    )
  ),
  /**
   * The Hell Hole: the only floor gap (source x 1097..1244) under the
   * middleground `signpost_hell` deco; a Collision-triggered Teleporter drops
   * players into Mahatam Audarika, which sets the hell_hole quest flag.
   */
  hellHole: Object.freeze({
    sourceX1: 1097,
    sourceX2: 1244,
    x1: 1097 - HELL_ONE_BOUNDS.l,
    x2: 1244 - HELL_ONE_BOUNDS.l,
    /**
     * The rims' floor height (pl1263887138338 ends at 1097,-191; plat_1319486971932
     * starts at 1244,-195). game.js resolveGround bridges plain gaps at the lowest
     * floor, so standing over the gap at rim height is the fall (G163).
     */
    rimY: -195 - HELL_ONE_BOUNDS.t,
    sign: Object.freeze({ sprite: 'signpost_hell', sourceX: 1130, sourceY: -214, w: 155, h: 179 }),
    destinationSourceTsid: 'LA5PV4T79OE2AOA',
    destinationTsid: 'GA5PV4T79OE2AOA',
    destinationLabel: 'Mahatam Audarika',
    questFlag: 'jump_hell_hole',
  }),
});

/**
 * The seven hub-40 Naraka streets. Grape counts are the exact Bunch of
 * Hellish Grapes objrefs in streets/mnt/stos/location_data (263 total).
 * `label` is the public name; `internalLabel` is the archived geometry label.
 */
export const NARAKA_STREETS = Object.freeze([
  { sourceTsid: 'LA5PPFP86NF2FOS', tsid: 'GA5PPFP86NF2FOS', label: 'Hell One', internalLabel: 'Hell One Clone', grapes: 51 },
  { sourceTsid: 'LA5PV4T79OE2AOA', tsid: 'GA5PV4T79OE2AOA', label: 'Mahatam Audarika', internalLabel: 'Lisa Hell Street', grapes: 40 },
  { sourceTsid: 'LA5REO5I9OE2KLS', tsid: 'GA5REO5I9OE2KLS', label: 'Dhuma Maya', internalLabel: 'SiloHellRyan', grapes: 30 },
  { sourceTsid: 'LA524M0OMOE2OGT', tsid: 'GA524M0OMOE2OGT', label: 'Mada Tamaha', internalLabel: 'BloodyHell', grapes: 42 },
  { sourceTsid: 'LA5Q57C99OE2GNU', tsid: 'GA5Q57C99OE2GNU', label: 'Ratna Vitteha', internalLabel: 'Whiteless Hell', grapes: 40 },
  { sourceTsid: 'LA5S44RM9OE2416', tsid: 'GA5S44RM9OE2416', label: 'Valuka Himsa', internalLabel: 'HellyNessIan', grapes: 30 },
  { sourceTsid: 'LA5RPAFK9OE28GN', tsid: 'GA5RPAFK9OE28GN', label: 'Panka Surazu', internalLabel: 'FireBrimstoneFernando', grapes: 30 },
].map((row) => Object.freeze(row)));

/**
 * Hell Bar instance (hell_quest `hell_bar`); its geometry is not in the public
 * dump, so it is rebuilt from reference (js/hell-bar.js, tools/build-hell-bar.mjs,
 * features/hell-bar-feature.js; G140).
 */
export const HELL_BAR = Object.freeze({
  sourceTsid: 'LA5FPUNAI7P2NVF',
  entranceStreetSourceTsid: 'LA5RPAFK9OE28GN',
  entranceStreetTsid: 'GA5RPAFK9OE28GN',
  entranceStreetLabel: 'Panka Surazu',
  available: true,
});

/**
 * Gory-level overlay (location.js 1330): shown once per player when entering
 * Ratna Vitteha's `hell_01` box on the way to Mada Tamaha. clearHellWarning()
 * resets `hasBeenWarned` (test utility). Kept as data for the lead.
 */
export const HELL_GORE_WARNING = Object.freeze({
  triggerStreetSourceTsid: 'LA5Q57C99OE2GNU',
  triggerBoxId: 'hell_01',
  targetLabel: 'Mada Tamaha',
  pages: Object.freeze([
    'Warning: Mada Tamaha may not be suitable for those with a sensitive disposition. Explorer discretion is advised.',
    'Really: we mean it. If seeing gore makes you unhappy, do not go in.',
    "This is your final warning. You're on your own from here.",
  ]),
});

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export const HELL_ITEMS = Object.freeze({
  bunch_of_grapes_hell: Object.freeze({
    classTsid: 'bunch_of_grapes_hell',
    label: 'Bunch of Hellish Grapes',
    namePlural: 'Bunches of Hellish Grapes',
    desc: 'A deceptively innocuous-looking bunch of hellish grapes.',
    stackMax: 1,
    baseCost: 0,
    verb: 'squish',
    verbKey: 'q',
    tooltip: 'Do your purgatory duty',
    tags: Object.freeze(['no_trade', 'no_auction', 'no_rube']),
    icon: 'assets/sprites/icons/bunch_of_grapes_hell.png',
    world: 'assets/sprites/hell/bunch_of_grapes_hell-world.png',
  }),
  wine_of_the_dead: Object.freeze({
    classTsid: 'wine_of_the_dead',
    label: 'Wine of the Dead',
    namePlural: 'Wines of the Dead',
    desc: "A forbidding decanter filled with wine of the dead, made from grapes crushed in Purgatory. This Hade-licious drink will revive even the most pooped of hellions... but will kill all who drink it aboveground. Pour it on cultivated items in your home street or yard to unreap what you've sown. Beware its cursed powers!",
    stackMax: 13,
    baseCost: 66,
    icon: 'assets/sprites/icons/wine_of_the_dead.png',
    world: 'assets/sprites/hell/wine_of_the_dead-world.png',
  }),
  drink_ticket: Object.freeze({
    classTsid: 'drink_ticket',
    label: 'Diabolical Drink Ticket',
    namePlural: 'Diabolical Drink Tickets',
    desc: 'Printed in infernal inks on fire-resistant paper, a Diabolical Drink Ticket can be given to Hell\'s Bartender in exchange for the potent Wine of the Dead—a fermented beverage which revitalizes the devitalized. No one knows what the Bartender does with the tickets, but rumour has it that in sufficient numbers they can be redeemed for either an all-expenses-paid vacation to Ix or the apocalypse.',
    stackMax: 5,
    baseCost: 0,
    icon: 'assets/sprites/icons/drink_ticket.png',
    world: 'assets/sprites/hell/drink_ticket-world.png',
  }),
});

/** Register the three hell items in the shared inventory catalog. */
export function ensureHellItems() {
  ensureItem('bunch_of_grapes_hell', {
    label: HELL_ITEMS.bunch_of_grapes_hell.label,
    desc: HELL_ITEMS.bunch_of_grapes_hell.desc,
    icon: HELL_ITEMS.bunch_of_grapes_hell.icon,
    baseCost: 0,
    stackMax: 1,
    sellable: false,
    donatable: false,
  });
  ensureItem('wine_of_the_dead', {
    label: HELL_ITEMS.wine_of_the_dead.label,
    desc: HELL_ITEMS.wine_of_the_dead.desc,
    icon: HELL_ITEMS.wine_of_the_dead.icon,
    baseCost: 66,
    stackMax: 13,
  });
  ensureItem('drink_ticket', {
    label: HELL_ITEMS.drink_ticket.label,
    desc: HELL_ITEMS.drink_ticket.desc,
    icon: HELL_ITEMS.drink_ticket.icon,
    baseCost: 0,
    stackMax: 5,
  });
  return Object.keys(HELL_ITEMS);
}

/** Measured sheets (PIL alpha scan, full grids, never trimmed). */
export const HELL_SPRITES = Object.freeze({
  grapesWorld: Object.freeze({
    url: 'assets/sprites/hell/bunch_of_grapes_hell-world.png',
    width: 280, height: 39, cols: 4, rows: 1, frameW: 70, frameH: 39, frames: 4,
    note: 'Four static bunch variants (states 1-4), not an animation',
  }),
  grapesIcon: Object.freeze({ url: 'assets/sprites/icons/bunch_of_grapes_hell.png', width: 70, height: 73 }),
  graveside: Object.freeze({
    urlPattern: 'assets/sprites/hell/graveside/graveside_marker_<giant>.png',
    width: 270, height: 88, cols: 3, rows: 1, frameW: 90, frameH: 88,
    states: Object.freeze(['none', 'mourn', 'celebrate']),
    giants: Object.freeze(['alph', 'cosma', 'friendly', 'generic', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'tii', 'zille']),
  }),
  bartender: Object.freeze({
    frameW: 244,
    frameH: 197,
    idle1: Object.freeze({ url: 'assets/sprites/hell/hell_bartender-idle1.png', width: 3416, height: 1182, cols: 14, rows: 6, frames: 81 }),
    idle2: Object.freeze({ url: 'assets/sprites/hell/hell_bartender-idle2.png', width: 3660, height: 1182, cols: 15, rows: 6, frames: 87 }),
    talkLeft: Object.freeze({ url: 'assets/sprites/hell/hell_bartender-talk-left.png', width: 3904, height: 1379, cols: 16, rows: 7, frames: 110 }),
    talkRight: Object.freeze({ url: 'assets/sprites/hell/hell_bartender-talk-right.png', width: 3660, height: 1379, cols: 15, rows: 7, frames: 103 }),
    talkRightOut: Object.freeze({ url: 'assets/sprites/hell/hell_bartender-talk-right-out.png', width: 976, height: 394, cols: 4, rows: 2, frames: 7 }),
  }),
  wineWorld: Object.freeze({ url: 'assets/sprites/hell/wine_of_the_dead-world.png', width: 168, height: 78, cols: 4, rows: 1, frameW: 42, frameH: 78, frames: 4 }),
  wineIcon: Object.freeze({ url: 'assets/sprites/icons/wine_of_the_dead.png', width: 15, height: 48 }),
  drinkTicketIcon: Object.freeze({ url: 'assets/sprites/icons/drink_ticket.png', width: 48, height: 48 }),
  drinkTicketWorld: Object.freeze({ url: 'assets/sprites/hell/drink_ticket-world.png', width: 48, height: 20 }),
  hellHoleQuestIcon: Object.freeze({ url: 'assets/sprites/hell/quest_req_icon_hellhole.png', width: 175, height: 187 }),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanTsid(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

function cleanLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const tsid = cleanTsid(loc.tsid);
  if (!tsid) return null;
  const out = { tsid, x: num(loc.x), y: num(loc.y) };
  if (loc.home === 'interior' || loc.home === 'street') out.home = loc.home;
  if (loc.label) out.label = String(loc.label).slice(0, 120);
  return out;
}

function energyMaxOf(pc) {
  return Math.max(1, num(pc?.energyMax, 100));
}

function moodMaxOf(pc) {
  return Math.max(1, num(pc?.moodMax, 100));
}

function energyPercent(pc) {
  return (num(pc?.energy) / energyMaxOf(pc)) * 100;
}

function hasPcBuff(pc, classTsid) {
  const list = pc?.activeBuffs;
  return Array.isArray(list) && list.includes(classTsid);
}

/** Strip G/L prefix differences: GA5... and LA5... are the same street. */
function streetKey(tsid) {
  const t = cleanTsid(tsid);
  if (/^[GL]/.test(t)) return t.slice(1);
  return t;
}

const NARAKA_KEYS = new Set(NARAKA_STREETS.map((row) => streetKey(row.tsid)));

function dayKey(now) {
  return getGameDayKey(num(now, Date.now()));
}

function nextGameDayStart(now) {
  return getGameDayStartMs(now) + GAME_DAY_MS;
}

/** Deaths that count for the current game day. */
export function deathsTodayFor(state, now = Date.now()) {
  const s = normalizeHellState(state);
  return s.deathsDayKey && s.deathsDayKey === dayKey(now) ? s.deathsToday : 0;
}

/* ------------------------------------------------------------------ */
/* Location predicates                                                 */
/* ------------------------------------------------------------------ */

/** location.isInHellOne(): the config hell tsid (or its hell_one instance). */
export function isInHellOne(tsid) {
  return streetKey(tsid) === streetKey(HELL_LOCATION.tsid);
}

/**
 * location.isInPurgatoryHub(): any hub-40 location. Hell One is hub 40 in the
 * source, and so is the Hell Bar (inc_data_maps_prod.js hub 40; Panka's door
 * connect hub_id 40), though it is not one of the seven streets the Naraka
 * Completist badge counts.
 */
export function isInPurgatoryHub(tsid, hubId = '') {
  const key = streetKey(tsid);
  return String(hubId) === '40' || NARAKA_KEYS.has(key) || key === streetKey(HELL_BAR.sourceTsid);
}

/** location.isInHell(): Hell One or the purgatory hub. */
export function isInHell(tsid, hubId = '') {
  return isInHellOne(tsid) || isInPurgatoryHub(tsid, hubId);
}

export function narakaStreet(tsid) {
  const key = streetKey(tsid);
  return NARAKA_STREETS.find((row) => streetKey(row.tsid) === key) || null;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function createHellState() {
  return normalizeHellState({});
}

/**
 * Sanitize a saved snapshot. Unknown or malformed fields fall back to safe
 * defaults; dead players keep their resurrect location and penance progress.
 */
export function normalizeHellState(saved = {}) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const isDead = s.isDead === true;
  const pooped =
    s.pooped && (s.pooped.kind === 'pooped' || s.pooped.kind === 'super_pooped')
      ? {
          kind: s.pooped.kind,
          appliedAt: num(s.pooped.appliedAt),
          expiresAt: num(s.pooped.expiresAt),
        }
      : null;
  const grave = s.graveMarker && cleanTsid(s.graveMarker.tsid)
    ? {
        tsid: cleanTsid(s.graveMarker.tsid),
        x: num(s.graveMarker.x),
        y: num(s.graveMarker.y),
        giant: String(s.graveMarker.giant || 'generic'),
        createdAt: num(s.graveMarker.createdAt),
        state: ['none', 'mourn', 'celebrate'].includes(s.graveMarker.state) ? s.graveMarker.state : 'none',
        recognizer: s.graveMarker.recognizer ? String(s.graveMarker.recognizer).slice(0, 80) : null,
      }
    : null;
  const recognized =
    s.deathRecognized && (s.deathRecognized.type === 'mourn' || s.deathRecognized.type === 'celebrate')
      ? {
          type: s.deathRecognized.type,
          recognizer: String(s.deathRecognized.recognizer || 'someone').slice(0, 80),
        }
      : null;
  const squished = Array.isArray(s.squishedGrapeIds)
    ? [...new Set(s.squishedGrapeIds.map((id) => String(id)).filter(Boolean))].slice(0, 400)
    : [];
  return {
    version: HELL_STATE_VERSION,
    isDead,
    deathsToday: Math.max(0, Math.floor(num(s.deathsToday))),
    deathsDayKey: typeof s.deathsDayKey === 'string' ? s.deathsDayKey : '',
    totalDeaths: Math.max(0, Math.floor(num(s.totalDeaths))),
    croakedAt: isDead ? num(s.croakedAt) : 0,
    croakDayKey: isDead && typeof s.croakDayKey === 'string' ? s.croakDayKey : '',
    visitId: Math.max(0, Math.floor(num(s.visitId))),
    hellVisits: Math.max(0, Math.floor(num(s.hellVisits))),
    grapesSquished: isDead ? Math.max(0, Math.floor(num(s.grapesSquished))) : 0,
    squishedGrapeIds: isDead ? squished : [],
    resurrectLocation: isDead ? cleanLocation(s.resurrectLocation) : null,
    previousMapPath: isDead && s.previousMapPath != null ? s.previousMapPath : null,
    graveMarker: isDead ? grave : null,
    deathRecognized: recognized,
    lastLowEnergyWarningAt: num(s.lastLowEnergyWarningAt),
    pooped,
    dontGetPooped: s.dontGetPooped === true,
    // daily_history 'energy_consumed' (inc_metabolics.js 134), for Super Pooped (G200).
    energyConsumedToday: Math.max(0, num(s.energyConsumedToday)),
    energyConsumedDayKey: typeof s.energyConsumedDayKey === 'string' ? s.energyConsumedDayKey : '',
    narakaStreetsVisited: Array.isArray(s.narakaStreetsVisited)
      ? [...new Set(s.narakaStreetsVisited.map(streetKey).filter((k) => NARAKA_KEYS.has(k)))]
      : [],
    hellWarningShown: s.hellWarningShown === true,
  };
}

/* ------------------------------------------------------------------ */
/* Low-energy warning                                                  */
/* ------------------------------------------------------------------ */

/**
 * inc_metabolics.js metabolics_lose_energy(): energy <= 10% and not
 * walking_dead and not dead and more than 60 s since the last warning.
 * Returns the warning text, or null. Pure (does not record the warning).
 */
export function shouldWarnLowEnergy(pc, state, now = Date.now()) {
  const s = normalizeHellState(state);
  if (s.isDead || hasPcBuff(pc, 'walking_dead')) return null;
  if (energyPercent(pc) > LOW_ENERGY_WARNING_PERCENT) return null;
  if (s.lastLowEnergyWarningAt && now - s.lastLowEnergyWarningAt <= LOW_ENERGY_WARNING_COOLDOWN_MS) return null;
  return deathsTodayFor(s, now) ? HELL_TEXT.extremelyLow : HELL_TEXT.aboutToCroak;
}

/** Check + record in one step. */
export function checkLowEnergyWarning(state, pc, now = Date.now()) {
  const s = normalizeHellState(state);
  const text = shouldWarnLowEnergy(pc, s, now);
  if (!text) return { state: s, warn: false, text: null, effects: [] };
  return {
    state: { ...s, lastLowEnergyWarningAt: now },
    warn: true,
    text,
    effects: [{ type: 'activity', text }],
  };
}

/* ------------------------------------------------------------------ */
/* Croak                                                               */
/* ------------------------------------------------------------------ */

/**
 * player.croak() guards: no location lock, not dead, no walking_dead, not in
 * hell, intro done, not newbie island.
 */
export function canCroak(state, ctx = {}) {
  const s = normalizeHellState(state);
  if (ctx.locked) return { ok: false, reason: 'locked' };
  if (s.isDead) return { ok: false, reason: 'dead' };
  if (ctx.pc && hasPcBuff(ctx.pc, 'walking_dead')) return { ok: false, reason: 'walking_dead' };
  if (ctx.walkingDead) return { ok: false, reason: 'walking_dead' };
  if (isInHell(ctx.streetTsid, ctx.hubId)) return { ok: false, reason: 'in_hell' };
  if (ctx.introDone === false || ctx.newbieIsland) return { ok: false, reason: 'intro' };
  return { ok: true, reason: '' };
}

/**
 * inc_metabolics.js: energy == 0, no croak yet this game day, and no
 * No-No Powder buff, then croak() guards apply.
 * @param {{ energy:number, activeBuffs?:string[] }} pc
 * @param {object} state
 * @param {{ streetTsid?:string, hubId?:string, now?:number, locked?:boolean }} [ctx]
 */
export function shouldCroak(pc, state, ctx = {}) {
  const now = num(ctx.now, Date.now());
  if (num(pc?.energy) > 0) return false;
  if (deathsTodayFor(state, now)) return false;
  if (hasPcBuff(pc, 'no_no_powder')) return false;
  return canCroak(state, { ...ctx, pc }).ok;
}

/**
 * Croak. The caller supplies where the avatar is.
 * @param {object} state
 * @param {{
 *   streetTsid: string, x: number, y: number, hubId?: string, label?: string,
 *   inTransit?: boolean, transitStop?: {tsid:string,x:number,y:number},
 *   atHome?: boolean, home?: 'interior'|'street',
 *   instanceExit?: {tsid:string,x:number,y:number}, transient?: boolean,
 *   mapPath?: any, giant?: string, locked?: boolean, pc?: object,
 *   now?: number, rng?: () => number
 * }} ctx
 * @returns {{ ok:boolean, reason:string, state:object, effects:object[], teleport:object|null }}
 */
export function croak(state, ctx = {}) {
  const s = normalizeHellState(state);
  const now = num(ctx.now, Date.now());
  const guard = canCroak(s, ctx);
  if (!guard.ok) return { ok: false, reason: guard.reason, state: s, effects: [], teleport: null };

  const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
  const streetTsid = cleanTsid(ctx.streetTsid);
  const x = num(ctx.x);
  const y = num(ctx.y);
  const home = ctx.home === 'interior' || ctx.home === 'street'
    ? ctx.home
    : ctx.atHome
      ? 'interior'
      : streetTsid === HOME_TSIDS.interior
        ? 'interior'
        : streetTsid === HOME_TSIDS.street
          ? 'street'
          : null;
  const atHomeInterior = home === 'interior';

  // If you die on transit, you resurrect at the previous station.
  let resurrectLocation;
  if (ctx.inTransit) {
    resurrectLocation = cleanLocation(ctx.transitStop);
  } else if (ctx.instanceExit) {
    // Transient instances do not outlive the croak; the hell_one pattern
    // returns players to the instance exit.
    resurrectLocation = cleanLocation(ctx.instanceExit);
  } else if (ctx.transient) {
    resurrectLocation = null; // source: instance gone -> default location
  } else {
    resurrectLocation = cleanLocation({ tsid: streetTsid, x, y, home, label: ctx.label });
  }

  const today = dayKey(now);
  const deathsToday = (s.deathsDayKey === today ? s.deathsToday : 0) + 1;
  const spawnIndex = Math.max(
    0,
    Math.min(HELL_LOCATION.spawns.length - 1, Math.floor(rng() * HELL_LOCATION.spawns.length))
  );
  const spawn = HELL_LOCATION.spawns[spawnIndex];
  const giant = String(ctx.giant || 'generic').toLowerCase().replace(/^ti$/, 'tii');
  const graveMarker = streetTsid && !ctx.inTransit
    ? {
        tsid: streetTsid,
        x,
        y: y + GRAVE_MARKER_Y_OFFSET,
        giant,
        createdAt: now,
        state: 'none',
        recognizer: null,
      }
    : null;

  const next = {
    ...s,
    isDead: true,
    deathsToday,
    deathsDayKey: today,
    totalDeaths: s.totalDeaths + 1,
    croakedAt: now,
    croakDayKey: today,
    visitId: s.visitId + 1,
    hellVisits: s.hellVisits + 1,
    grapesSquished: 0,
    squishedGrapeIds: [],
    resurrectLocation,
    previousMapPath: ctx.mapPath != null ? ctx.mapPath : null,
    graveMarker,
    deathRecognized: null,
  };

  const teleport = {
    tsid: HELL_LOCATION.tsid,
    sourceTsid: HELL_LOCATION.sourceTsid,
    label: HELL_LOCATION.label,
    hubId: HELL_LOCATION.hubId,
    x: spawn.x,
    y: spawn.y,
    groundY: spawn.groundY,
    sourceX: spawn.sourceX,
    sourceY: spawn.sourceY,
    spawnIndex,
  };

  const effects = [
    { type: 'stop_all_music' },
    { type: 'sound', key: HELL_SOUNDS.croak },
    { type: 'activity', text: HELL_TEXT.croaked },
    { type: 'metabolics', set: { mood: 0, energy: 0 } },
    { type: 'remove_followers' },
    { type: 'remove_buffs', buffs: [...HELL_BUFFS.removedOnCroak] },
    ...(atHomeInterior ? [{ type: 'achievement', counter: 'croaked:at_home', amount: 1 }] : []),
    { type: 'achievement', counter: 'player:deaths', amount: 1 },
    ...(graveMarker ? [{ type: 'grave_marker', ...graveMarker }] : []),
    { type: 'teleport', ...teleport },
    { type: 'music', key: HELL_MUSIC.key, track: HELL_MUSIC.track },
    hellEntryPrompt(next),
  ];

  return { ok: true, reason: 'croaked', state: next, effects, teleport };
}

/** location.js hell_one entry prompt: 1 s delay on the first visit, 30 s after. */
export function hellEntryPrompt(state) {
  const s = normalizeHellState(state);
  return {
    type: 'prompt',
    text: HELL_TEXT.hellEntryPrompt,
    delayMs: s.hellVisits <= 1 ? HELL_ENTRY_PROMPT_DELAY_FIRST_MS : HELL_ENTRY_PROMPT_DELAY_REPEAT_MS,
    timeoutMs: HELL_ENTRY_PROMPT_TIMEOUT_MS,
    choices: [{ value: '', label: 'Ok' }],
    isGrapeSquish: true,
  };
}

/* ------------------------------------------------------------------ */
/* Grapes                                                              */
/* ------------------------------------------------------------------ */

function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function platformYAtSource(p, x) {
  const dx = p.x2 - p.x1;
  if (Math.abs(dx) < 1e-6) return (p.y1 + p.y2) / 2;
  return p.y1 + ((x - p.x1) / dx) * (p.y2 - p.y1);
}

/**
 * Deterministic grape layout. The archived location objects record each
 * street's exact grape count but not item x/y, so grapes are spread along the
 * walkable (pc_perm -1) floor in proportion to platform length, inset from
 * platform ends, with seeded jitter and one of the four source variants.
 * @param {{ tsid:string, bounds:{l:number,t:number}, platforms:object[] }} street
 * @param {number} [count]
 * @returns {{ id:string, x:number, y:number, sourceX:number, sourceY:number, variant:number, platformId:string }[]}
 */
export function planHellGrapes(street, count = null, opts = {}) {
  const tsid = cleanTsid(street?.tsid);
  const total = Math.max(
    0,
    Math.floor(count ?? narakaStreet(tsid)?.grapes ?? 0)
  );
  const bounds = street?.bounds || { l: 0, t: 0 };
  const margin = num(opts.margin, 36);
  const maxSlope = num(opts.maxSlope, 0.5);
  const segments = (street?.platforms || [])
    .filter((p) => p && (p.pc_perm == null || p.pc_perm === -1))
    .map((p) => (p.x1 <= p.x2 ? p : { ...p, x1: p.x2, y1: p.y2, x2: p.x1, y2: p.y1 }))
    .filter((p) => {
      const len = p.x2 - p.x1;
      return len > margin * 2 + 8 && Math.abs((p.y2 - p.y1) / len) <= maxSlope;
    })
    .map((p) => ({ p, a: p.x1 + margin, b: p.x2 - margin }))
    .sort((m, n) => m.a - n.a || m.p.y1 - n.p.y1);
  if (!total || !segments.length) return [];

  const lengths = segments.map((seg) => seg.b - seg.a);
  const sum = lengths.reduce((acc, v) => acc + v, 0);
  const raw = lengths.map((len) => (len / sum) * total);
  const alloc = raw.map(Math.floor);
  let left = total - alloc.reduce((acc, v) => acc + v, 0);
  raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((m, n) => n.frac - m.frac || m.index - n.index)
    .forEach(({ index }) => {
      if (left > 0) {
        alloc[index] += 1;
        left -= 1;
      }
    });

  const rand = mulberry32(hashSeed(`${tsid}:grapes`));
  const placed = [];
  segments.forEach((seg, si) => {
    const n = alloc[si];
    if (!n) return;
    const step = (seg.b - seg.a) / n;
    for (let i = 0; i < n; i += 1) {
      const jitter = (rand() - 0.5) * 0.4 * step;
      const sx = Math.round(seg.a + (i + 0.5) * step + jitter);
      const sy = Math.round(platformYAtSource(seg.p, sx));
      placed.push({
        sourceX: sx,
        sourceY: sy,
        x: sx - bounds.l,
        y: sy - bounds.t,
        variant: Math.floor(rand() * 4) % 4,
        platformId: String(seg.p.id || ''),
      });
    }
  });
  placed.sort((m, n) => m.sourceX - n.sourceX || m.sourceY - n.sourceY);
  return placed.map((row, index) => ({ id: `${tsid}:grape:${index}`, ...row }));
}

/** Hell One's 51 grapes, computed from the embedded floor geometry. */
export const HELL_ONE_GRAPES = Object.freeze(
  planHellGrapes(
    { tsid: HELL_LOCATION.tsid, bounds: HELL_ONE_BOUNDS, platforms: HELL_ONE_PLATFORMS },
    51
  ).map((row) => Object.freeze(row))
);

/** Grapes still on the ground for this hell visit. */
export function remainingGrapes(state, grapes) {
  const s = normalizeHellState(state);
  const gone = new Set(s.squishedGrapeIds);
  return (grapes || []).filter((g) => !gone.has(g.id));
}

/**
 * bunch_of_grapes_hell squish handler. Each grape is deleted when squished,
 * so a second squish of the same id is ignored. Squishing requires being dead
 * (only the dead are in hell in this remake).
 */
export function squishGrape(state, grapeId, now = Date.now()) {
  const s = normalizeHellState(state);
  const id = String(grapeId || '');
  if (!s.isDead) {
    return { ok: false, reason: 'not_dead', state: s, squished: s.grapesSquished, remaining: GRAPES_REQUIRED - s.grapesSquished, canResurrect: false, effects: [] };
  }
  if (!id) {
    return { ok: false, reason: 'unknown_grape', state: s, squished: s.grapesSquished, remaining: Math.max(0, GRAPES_REQUIRED - s.grapesSquished), canResurrect: canResurrect(s), effects: [] };
  }
  if (s.squishedGrapeIds.includes(id)) {
    return { ok: false, reason: 'already_squished', state: s, squished: s.grapesSquished, remaining: Math.max(0, GRAPES_REQUIRED - s.grapesSquished), canResurrect: canResurrect(s), effects: [] };
  }
  const next = {
    ...s,
    grapesSquished: s.grapesSquished + 1,
    squishedGrapeIds: [...s.squishedGrapeIds, id],
  };
  const ready = canResurrect(next);
  return {
    ok: true,
    reason: 'squished',
    state: next,
    squished: next.grapesSquished,
    remaining: Math.max(0, GRAPES_REQUIRED - next.grapesSquished),
    canResurrect: ready,
    at: now,
    effects: [
      { type: 'sound', key: HELL_SOUNDS.squish },
      { type: 'remove_grape', id },
      { type: 'activity', text: HELL_TEXT.squished },
      ...(ready ? [{ type: 'resurrect' }] : []),
    ],
  };
}

export function canResurrect(state) {
  const s = normalizeHellState(state);
  return s.isDead && s.grapesSquished >= GRAPES_REQUIRED;
}

/* ------------------------------------------------------------------ */
/* Resurrection                                                        */
/* ------------------------------------------------------------------ */

/**
 * Where resurrect() sends the player: the saved croak location (or transit
 * stop / instance exit). Falls back to config default_location when nothing
 * was saved or the saved place is itself in hell.
 */
export function resurrectTarget(state, opts = {}) {
  const s = normalizeHellState(state);
  const loc = s.resurrectLocation;
  const exists = typeof opts.streetExists === 'function' ? opts.streetExists : () => true;
  if (!loc || isInHell(loc.tsid) || !exists(loc.tsid)) {
    return {
      tsid: DEFAULT_LOCATION.tsid,
      sourceTsid: DEFAULT_LOCATION.sourceTsid,
      x: DEFAULT_LOCATION.x,
      y: DEFAULT_LOCATION.y,
      label: DEFAULT_LOCATION.label,
      fallback: true,
    };
  }
  return { ...loc, fallback: false };
}

/**
 * player.resurrect(): requires dead (or standing in hell). Energy is set to
 * 10% of max (5% while Pooped); mood is capped at half (0 after a croak, so it
 * stays 0). Sets quest flag `resurrected`, restores or clears the map path,
 * removes the grave marker, stops HELL music with a 2 s fade.
 * @param {object} state
 * @param {{ energy:number, mood:number, energyMax?:number, moodMax?:number }} pc
 * @param {number} [now]
 * @param {{ inHell?: boolean, streetExists?: (tsid:string)=>boolean }} [opts]
 */
export function resurrect(state, pc = {}, now = Date.now(), opts = {}) {
  const s = normalizeHellState(state);
  if (!s.isDead && !opts.inHell) {
    return { ok: false, reason: 'not_dead', state: s, effects: [], target: null, metabolics: null };
  }
  const energyMax = energyMaxOf(pc);
  const moodMax = moodMaxOf(pc);
  const pooped = isPooped(s, now) === 'pooped';
  const energy = energyMax * (pooped ? RESURRECT_ENERGY_FRACTION_POOPED : RESURRECT_ENERGY_FRACTION);
  const currentMood = s.isDead ? 0 : num(pc.mood);
  const moodCap = moodMax * RESURRECT_MOOD_CAP_FRACTION;
  const mood = currentMood > moodCap ? moodCap : currentMood;
  const target = resurrectTarget(s, opts);
  const next = {
    ...s,
    isDead: false,
    croakedAt: 0,
    croakDayKey: '',
    grapesSquished: 0,
    squishedGrapeIds: [],
    resurrectLocation: null,
    previousMapPath: null,
    graveMarker: null,
  };
  const effects = [
    { type: 'remove_grave_marker', tsid: s.graveMarker?.tsid || null },
    { type: 'music_stop', key: HELL_MUSIC.key, fadeSeconds: HELL_MUSIC.stopFadeSeconds },
    { type: 'metabolics', set: { energy, mood } },
    { type: 'quest_flag', flag: 'resurrected' },
    s.previousMapPath != null
      ? { type: 'restore_map_path', path: s.previousMapPath }
      : { type: 'clear_map_path' },
    { type: 'remove_followers' },
    { type: 'teleport', ...target },
  ];
  return {
    ok: true,
    reason: 'resurrected',
    state: next,
    effects,
    target,
    metabolics: { energy, mood, pooped },
  };
}

/**
 * player.checkNewGameDay(): a player still dead when the game day rolls over
 * is resurrected automatically. Also resets the per-day death count and
 * expires Pooped / Super Pooped (they last until the next game day).
 */
export function hellNewDay(state, pc = {}, now = Date.now(), opts = {}) {
  let s = normalizeHellState(state);
  const today = dayKey(now);
  const effects = [];
  let resurrection = null;
  if (s.isDead && s.croakDayKey && s.croakDayKey !== today) {
    resurrection = resurrect(s, pc, now, opts);
    s = resurrection.state;
    effects.push(...resurrection.effects);
  }
  if (s.deathsDayKey && s.deathsDayKey !== today) {
    s = { ...s, deathsToday: 0, deathsDayKey: today };
  }
  if (s.pooped && now >= s.pooped.expiresAt) {
    effects.push({ type: 'remove_buff', buff: s.pooped.kind });
    s = { ...s, pooped: null };
  }
  return { state: s, resurrection, effects };
}

/* ------------------------------------------------------------------ */
/* Pooped / Super Pooped                                               */
/* ------------------------------------------------------------------ */

export function isPooped(state, now = Date.now()) {
  const s = normalizeHellState(state);
  if (!s.pooped || now >= s.pooped.expiresAt) return null;
  return s.pooped.kind;
}

/**
 * Energy lost today (G200). inc_metabolics.js metabolics_lose_energy 124-134:
 * every loss adds what apiDec took to the day's `energy_consumed`
 * (daily_history_increment('energy_consumed', change * -1); apiDec returns the
 * negative change, so the count is positive, and inc_stats.js 658 and
 * player.js 914 flip it back for energy_spent_today). A dead player loses
 * nothing (the is_dead return at 118-123 comes before the increment). The
 * count is per game day (current_day_key()), so it starts again at 0.
 */
export function noteEnergyConsumed(state, amount, now = Date.now()) {
  const s = normalizeHellState(state);
  const lost = num(amount);
  if (!(lost > 0) || s.isDead) return s;
  const today = dayKey(now);
  const before = s.energyConsumedDayKey === today ? s.energyConsumedToday : 0;
  return { ...s, energyConsumedToday: before + lost, energyConsumedDayKey: today };
}

/** daily_history_get(current_day_key(), 'energy_consumed'): today's count, 0 on a new game day. */
export function energyConsumedTodayFor(state, now = Date.now()) {
  const s = normalizeHellState(state);
  return s.energyConsumedDayKey && s.energyConsumedDayKey === dayKey(now) ? s.energyConsumedToday : 0;
}

/**
 * inc_metabolics.js after an energy loss: alive, already croaked today,
 * energy <= 5% and not protected by Wine of the Dead. Super Pooped when
 * today's consumed energy reaches 20x max (inc_metabolics.js 149-152).
 * `opts.energyConsumedToday` overrides the count kept in the state
 * (noteEnergyConsumed); without it the state's own count for today is used.
 * @param {{ energyConsumedToday?: number }} [opts]
 */
export function checkPooped(state, pc = {}, now = Date.now(), opts = {}) {
  const s = normalizeHellState(state);
  const none = { state: s, applied: null, effects: [] };
  if (s.isDead || !deathsTodayFor(s, now) || s.dontGetPooped) return none;
  if (energyPercent(pc) > POOPED_ENERGY_PERCENT) return none;
  const current = isPooped(s, now);
  const expiresAt = nextGameDayStart(now);
  const consumed = opts.energyConsumedToday != null ? num(opts.energyConsumedToday) : energyConsumedTodayFor(s, now);
  if (consumed >= energyMaxOf(pc) * SUPER_POOPED_CONSUMED_MULTIPLIER && current !== 'super_pooped') {
    return {
      state: { ...s, pooped: { kind: 'super_pooped', appliedAt: now, expiresAt } },
      applied: 'super_pooped',
      effects: [
        ...(current === 'pooped' ? [{ type: 'remove_buff', buff: 'pooped' }] : []),
        { type: 'buff', buff: 'super_pooped', expiresAt, physics: HELL_BUFFS.super_pooped.physics },
        { type: 'prompt', text: HELL_TEXT.superPooped, timeoutMs: 10000, choices: [{ value: 'ok', label: 'OK' }] },
      ],
    };
  }
  if (!current) {
    return {
      state: { ...s, pooped: { kind: 'pooped', appliedAt: now, expiresAt } },
      applied: 'pooped',
      effects: [
        { type: 'buff', buff: 'pooped', expiresAt, physics: HELL_BUFFS.pooped.physics },
        { type: 'prompt', text: HELL_TEXT.pooped, timeoutMs: 10000, choices: [{ value: 'ok', label: 'OK' }] },
      ],
    };
  }
  return none;
}

/** metabolics_add_energy(): above 5% removes Pooped (not Super Pooped) and dontGetPooped. */
export function onEnergyGained(state, pc = {}, now = Date.now()) {
  const s = normalizeHellState(state);
  if (energyPercent(pc) <= POOPED_ENERGY_PERCENT) return { state: s, removed: null, effects: [] };
  const removed = isPooped(s, now) === 'pooped' ? 'pooped' : null;
  return {
    state: { ...s, pooped: removed ? null : s.pooped, dontGetPooped: false },
    removed,
    effects: removed ? [{ type: 'remove_buff', buff: 'pooped' }] : [],
  };
}

/**
 * Gate a metabolic change. Returns `{ allowed, text }`; `text` is the
 * source activity line for a blocked change.
 * @param {'energy'|'mood'} stat
 * @param {'gain'|'loss'} direction
 */
export function metabolicGate(state, stat, direction, now = Date.now()) {
  const s = normalizeHellState(state);
  if (s.isDead) {
    const text = direction === 'gain'
      ? stat === 'energy' ? HELL_TEXT.deadEnergyGain : HELL_TEXT.deadMoodGain
      : stat === 'energy' ? HELL_TEXT.deadEnergyLoss : HELL_TEXT.deadMoodLoss;
    return { allowed: false, text };
  }
  if (stat === 'energy' && direction === 'gain' && isPooped(s, now) === 'super_pooped') {
    return { allowed: false, text: HELL_TEXT.superPoopedEnergyGain };
  }
  return { allowed: true, text: null };
}

/** Movement multipliers for Pooped / Super Pooped (vx_max 0.5, vy_jump 0.5). */
export function hellPhysics(state, now = Date.now()) {
  const kind = isPooped(state, now);
  if (!kind) return { speed: 1, jump: 1 };
  const physics = HELL_BUFFS[kind].physics;
  return { speed: physics.speed, jump: physics.jump };
}

/**
 * inc_teleportation.js: the dead may only teleport within Naraka; the living
 * may never teleport into Naraka; Pooped blocks all teleports.
 */
export function canTeleport(state, targetTsid, now = Date.now(), hubId = '') {
  const s = normalizeHellState(state);
  const toHell = isInHell(targetTsid, hubId);
  if (s.isDead) {
    if (!toHell) return { ok: false, error: HELL_TEXT.teleportDead };
  } else if (toHell) {
    return { ok: false, error: HELL_TEXT.teleportToNaraka };
  }
  if (isPooped(s, now) === 'pooped') return { ok: false, error: HELL_TEXT.teleportPooped };
  return { ok: true, error: '' };
}

/* ------------------------------------------------------------------ */
/* Persistence / reload                                                */
/* ------------------------------------------------------------------ */

/**
 * Decide where a reloaded game should start.
 * - Dead and the game day has rolled: resurrect (checkNewGameDay).
 * - Dead and the saved street is in hell: resume there.
 * - Dead anywhere else: location.js "Dead, but not in hell? forcing back to hell".
 * - Alive but saved inside hell: resurrect() also accepts living players in
 *   hell, so send them to their resurrect target / default location.
 * @returns {{ action:'none'|'resume_hell'|'force_hell'|'resurrect', target:object|null }}
 */
export function resolveReloadLocation(state, savedLocation = null, now = Date.now()) {
  const s = normalizeHellState(state);
  const saved = cleanLocation(savedLocation);
  if (s.isDead) {
    if (s.croakDayKey && s.croakDayKey !== dayKey(now)) {
      return { action: 'resurrect', target: resurrectTarget(s) };
    }
    if (saved && isInHell(saved.tsid)) return { action: 'resume_hell', target: saved };
    const spawn = HELL_LOCATION.spawns[0];
    return {
      action: 'force_hell',
      target: {
        tsid: HELL_LOCATION.tsid,
        sourceTsid: HELL_LOCATION.sourceTsid,
        x: spawn.x,
        y: spawn.y,
        groundY: spawn.groundY,
      },
    };
  }
  if (saved && isInHell(saved.tsid)) {
    return { action: 'resurrect', target: resurrectTarget(s) };
  }
  return { action: 'none', target: saved };
}

/** Enforce on every street entry while dead (location.js onPlayerEnter). */
export function enforceHellOnEnter(state, tsid, hubId = '') {
  const s = normalizeHellState(state);
  if (!s.isDead || isInHell(tsid, hubId)) return null;
  const spawn = HELL_LOCATION.spawns[0];
  return { tsid: HELL_LOCATION.tsid, x: spawn.x, y: spawn.y, groundY: spawn.groundY };
}

/* ------------------------------------------------------------------ */
/* Naraka exploring                                                    */
/* ------------------------------------------------------------------ */

/**
 * First visit to each hub-40 street emits `streets_visited_in_hub:number_40`
 * (Naraka Completist at 7). Hell One Clone is hub 40 in the source even
 * though the geometry index leaves its hub blank.
 */
export function noteNarakaVisit(state, tsid, hubId = '') {
  const s = normalizeHellState(state);
  if (!isInPurgatoryHub(tsid, hubId)) return { state: s, events: [] };
  const key = streetKey(tsid);
  if (!NARAKA_KEYS.has(key) || s.narakaStreetsVisited.includes(key)) return { state: s, events: [] };
  return {
    state: { ...s, narakaStreetsVisited: [...s.narakaStreetsVisited, key] },
    events: [{ counter: 'streets_visited_in_hub:number_40', amount: 1 }],
  };
}

/** Hell hole quest flag: arriving in Mahatam Audarika. */
export function hellHoleFlagForStreet(tsid) {
  return streetKey(tsid) === streetKey(HELL_LOCATION.hellHole.destinationTsid)
    ? HELL_LOCATION.hellHole.questFlag
    : null;
}

/* ------------------------------------------------------------------ */
/* Grave marker, death recognition, quests                             */
/* ------------------------------------------------------------------ */

export const HELL_QUESTS = Object.freeze({
  hell_hole: Object.freeze({
    classTsid: 'hell_hole',
    title: "It's Better in a Hell Hole",
    desc: 'Continue exploring Naraka by jumping into the hole on the first level of Hell.',
    completion: "I was hoping for more of a swan dive, but I guess that'll have to do.",
    requirement: Object.freeze({ flag: 'jump_hell_hole', desc: 'Jump down the Hell Hole', icon: 'quest_req_icon_hellhole' }),
    acceptedOverlay: 'Make your way to the Hell Hole.',
    rewards: Object.freeze({}),
    prerequisiteNotCompleted: 'hell_quest',
    onCompleteOffers: 'hell_quest',
    canStartInHell: true,
    isEmergency: true,
  }),
  hell_quest: Object.freeze({
    classTsid: 'hell_quest',
    title: 'Beelzebooze',
    desc: 'Enter the Hell Bar in Panka Surazu, Naraka, exchange your Diabolical Drink Ticket for Wine of the Dead and drink to your good hellth… er, "health."',
    offer:
      'I know it looks gloomy down here, but it ain\'t so bad; great atmosphere, no cover charge and even a free drink ticket. <split butt_txt="Thanks... I think?" />Take this drink ticket to the Hell Bar at the far end of Naraka and exchange it for a bottle of Wine of the Dead. I have a feeling you’ll enjoy its revitalizing qualities.',
    completion:
      'How do you feel now, kid? Like a great weight has been lifted off your shoulders?<split butt_txt="More or less." />Great! Now go explore Naraka. Have fun. Don\'t do anything I wouldn\'t do. Oh, and take these extras for your excellent work.',
    buttonAccept: 'Thanks!',
    acceptedText: 'You received a drink ticket for Wine of the Dead and your map has been updated with the route to the Hell Bar.',
    acceptedTextPackFull:
      'Your pack is full so your drink ticket for Wine of the Dead has been put into storage. Your map has also been updated with the route to the Hell Bar.',
    acceptedGrant: Object.freeze({ drink_ticket: 1 }),
    pathTo: 'LA5RPAFK9OE28GN',
    requirements: Object.freeze([
      Object.freeze({ flag: 'buy_wotd', desc: 'Buy Wine of the Dead' }),
      Object.freeze({ flag: 'drink_wotd', desc: 'Drink Wine of the Dead' }),
    ]),
    rewards: Object.freeze({ xp: 250, currants: 150 }),
    canStartInHell: true,
    isEmergency: true,
  }),
  /** Offer is commented out in croak(); kept for reference only. */
  you_croaked: Object.freeze({
    classTsid: 'you_croaked',
    title: 'You Croaked',
    desc: 'Squish 11 bunches of hellish grapes to get yourself out of this hellish purgatory and back to the real world.',
    completion:
      "You did it, but squishing grapes is tiring work and now you're 'pooped'. You can only croak once a day, but you'll need to get your energy back up to start feeling better. Run out of energy while pooped and you'll end up 'super-pooped', and that's really no fun!",
    requirement: Object.freeze({ flag: 'resurrected' }),
    rewards: Object.freeze({ xp: 25, mood: 25, energy: 25 }),
    offeredInSource: false,
  }),
});

/** hell_hole getOffer(): built from the recognition record. */
export function hellHoleOfferText(recognition = null) {
  const mourner = recognition?.recognizer || 'someone';
  const did = recognition ? (recognition.type === 'mourn' ? 'mourned' : 'celebrated') : 'recognized';
  const what = recognition ? (recognition.type === 'mourn' ? 'death' : 'life') : 'passing';
  return `Woah! Did you feel that? A cold shiver down your recently deceased spine? It appears that ${mourner} just ${did} your ${what} at your gravestone.<split butt_txt="Really?" />Yeah. You're obviously missed by someone up on the surface, but you just got here and you look pooped. You're not in a rush to leave are you?<split butt_txt="I guess not." />Good. Now I know you're pooped, but there's more to Naraka than this first level of Hell. Why don't you jump in the Hell Hole and start exploring.`;
}

function questStatus(questState, id) {
  if (questState?.completed?.includes?.(id)) return 'done';
  if (questState?.active?.[id]) return 'todo';
  return 'none';
}

/**
 * Which hell quest (if any) the current situation offers. Mirrors
 * recognizeDeath(): Hell One + neither quest -> hell_hole; otherwise any
 * hub-40 street (Hell One included) + hell_quest not started -> hell_quest.
 * Requires a pending recognition. Completing hell_hole offers hell_quest
 * (onComplete_custom) via `ctx.completedHellHole`.
 */
export function hellQuestOffer(state, questState, ctx = {}) {
  const s = normalizeHellState(state);
  const hole = questStatus(questState, 'hell_hole');
  const quest = questStatus(questState, 'hell_quest');
  if (ctx.completedHellHole && quest === 'none') return 'hell_quest';
  if (!s.deathRecognized) return null;
  if (isInHellOne(ctx.streetTsid) && hole === 'none' && quest === 'none') return 'hell_hole';
  if (isInPurgatoryHub(ctx.streetTsid, ctx.hubId) && quest === 'none') {
    return 'hell_quest';
  }
  return null;
}

/** graveside_marker celebrate / mourn: activity text for the recognizer. */
export function graveRecognitionText(type, ownerLabel, giant = 'generic', favor = GRAVE_MARKER_RECOGNITION_FAVOR) {
  const base = type === 'mourn'
    ? `You mourn the passing of ${ownerLabel}. They have departed from this vale of tears only too soon, and we will not see their like again.`
    : `You celebrate the life of ${ownerLabel}. They were a good Glitch, a kind Glitch, and they left this world a better place than they found it.`;
  if (!giant || giant === 'generic') return base;
  const name = giant.charAt(0).toUpperCase() + giant.slice(1);
  return `${base} You receive ${favor} favor with ${name}, who is pleased by the respect you have shown.`;
}

/** graveside_marker getLabel(). */
export function graveMarkerLabel(ownerLabel) {
  return `Here Lies ${ownerLabel}`;
}

/**
 * Another Glitch (e.g. a local companion) mourns or celebrates the dead
 * player's grave. Mirrors graveside_marker verbs + player.recognizeDeath().
 * @param {{ type:'mourn'|'celebrate', recognizer:string, streetTsid?:string, hubId?:string,
 *           questState?:object, packFull?:boolean, now?:number }} ctx
 */
export function recognizeDeath(state, ctx = {}) {
  const s = normalizeHellState(state);
  const type = ctx.type === 'mourn' ? 'mourn' : ctx.type === 'celebrate' ? 'celebrate' : null;
  if (!type || !s.graveMarker) return { ok: false, reason: 'no_grave', state: s, offer: null, effects: [] };
  if (s.graveMarker.state !== 'none') {
    return { ok: false, reason: 'already_recognized', state: s, offer: null, effects: [], text: HELL_TEXT.graveAlreadyRecognizedOther };
  }
  const recognizer = String(ctx.recognizer || 'someone').slice(0, 80);
  let next = {
    ...s,
    graveMarker: { ...s.graveMarker, state: type, recognizer },
    deathRecognized: s.deathRecognized || { type, recognizer },
  };
  const offer = hellQuestOffer(next, ctx.questState, ctx);
  const effects = [{ type: 'grave_marker_state', state: type }];
  if (offer) {
    effects.push({ type: 'quest_offer', quest: offer, text: offer === 'hell_hole' ? hellHoleOfferText(next.deathRecognized) : HELL_QUESTS.hell_quest.offer });
  } else {
    const did = type === 'mourn' ? `${recognizer} has mourned your passing` : `${recognizer} has celebrated your life`;
    const text = ctx.packFull
      ? `${did}, but since your pack is full, your drink ticket for Wine of the Dead has been put into storage.`
      : `${did}, you received a drink ticket for Wine of the Dead.`;
    effects.push({ type: 'grant_item', classTsid: 'drink_ticket', count: 1 });
    effects.push({ type: 'prompt', text, choices: [{ value: 'ok', label: 'OK' }] });
  }
  // player.recognizeDeath(): the record is deleted once the online player has
  // been offered the quest (its text is built at offer time) or given the ticket.
  next = { ...next, deathRecognized: null };
  return { ok: true, reason: 'recognized', state: next, offer, effects };
}

/** Clear the stored recognition (hell_hole / hell_quest onAccepted). */
export function clearDeathRecognition(state) {
  return { ...normalizeHellState(state), deathRecognized: null };
}

/** graveside_marker onFade / onDisappear timing; resurrection removes it sooner. */
export function graveMarkerPhase(state, now = Date.now()) {
  const g = normalizeHellState(state).graveMarker;
  if (!g) return 'gone';
  const age = now - g.createdAt;
  if (age >= GRAVE_MARKER_DISAPPEAR_MS) return 'gone';
  if (age >= GRAVE_MARKER_FADE_MS) return 'fading';
  return 'shown';
}

/* ------------------------------------------------------------------ */
/* Wine of the Dead + Hell's Bartender                                  */
/* ------------------------------------------------------------------ */

/** wine_of_the_dead drink conditions. */
export function wineDrinkConditions(state, now = Date.now()) {
  const s = normalizeHellState(state);
  const tooltip = s.isDead ? HELL_TEXT.wineTooltipDead : HELL_TEXT.wineTooltipAlive;
  if (s.isDead && isPooped(s, now) !== 'pooped') {
    return { state: 'disabled', reason: HELL_TEXT.wineNotPooped, tooltip };
  }
  return { state: 'enabled', reason: '', tooltip };
}

/**
 * wine_of_the_dead drink handler: dead -> no longer Pooped (and protected from
 * Pooped); alive -> croak (ignores the once-per-day rule, as in the source).
 * Always sets quest flag `drink_wotd` and consumes one wine.
 */
export function drinkWineOfTheDead(state, ctx = {}) {
  const s = normalizeHellState(state);
  const now = num(ctx.now, Date.now());
  const cond = wineDrinkConditions(s, now);
  if (cond.state !== 'enabled') return { ok: false, reason: 'disabled', text: cond.reason, state: s, effects: [] };
  const base = [
    { type: 'consume_item', classTsid: 'wine_of_the_dead', count: 1 },
    { type: 'quest_flag', flag: 'drink_wotd' },
  ];
  if (s.isDead) {
    const next = { ...s, pooped: null, dontGetPooped: true };
    return {
      ok: true,
      reason: 'unpooped',
      state: next,
      effects: [...base, { type: 'remove_buff', buff: 'pooped' }, { type: 'activity', text: 'You drank a Wine of the Dead. You are no longer pooped!' }],
    };
  }
  const died = croak(s, ctx);
  return {
    ok: died.ok,
    reason: died.ok ? 'died' : died.reason,
    state: died.state,
    teleport: died.teleport,
    effects: [...base, { type: 'activity', text: 'You drank a Wine of the Dead. You died!' }, ...died.effects],
  };
}

export const HELL_BARTENDER = Object.freeze({
  classTsid: 'hell_bartender',
  label: "Hell's Bartender",
  desc: "A mixologist of the underworld, no one knows the true story of Hell's Bartender, but assume he was either really good at pouring bad drinks, or really bad at pouring good drinks in a previous life.",
  hitBox: Object.freeze({ w: 300, h: -200 }),
  chitChatMs: 30000,
  talkGeneral: Object.freeze([
    'I hear Naraka is pretty <i>Hellish</i> this time of year, heh heh heh.',
    "Close the door, you're letting all that fresh air in.",
    'Pull up a stool... if you can reach it.',
    'Get out there and enjoy the heat, you tenderfoot!',
    "Did you hear the one about the Demon and the Chicken? Remind me next time you're in if you haven't!",
  ]),
  wineResponses: Object.freeze([
    'One Wine of the Dead, coming right up.',
    "Here's your Wine of the Dead. Please enjoy irresponsibly.",
    'Oh ho, is it Unhappy Hour already?',
    'Be careful. This stuff can give you a wicked hangover. Heh heh heh.',
    "Didn't your mother ever tell you not to accept drinks from strange devils?",
    'One for you, and one for me.',
  ]),
  firstWine: 'Not this time! Enjoy your Wine of the Dead, little demon. You may find it opens some strange doors for you. Heh heh heh.',
  packFull: "It seems you can't fit anything else in your pack. Greed is good! Heh heh.",
  needTicket: 'You need to have a Diabolical Drink Ticket to buy Wine of the Dead.',
  conversations: Object.freeze({
    quest_buy_wine: Object.freeze([
      Object.freeze({ text: "Oh ho, what have we here? Aren't you a bit too young and tender to be frequenting a bar in the back end of Naraka?", response: "Hey, I'm tougher than I look!" }),
      Object.freeze({ text: "Oh ho, so you say. Well, short stuff, last time I checked you didn't have to win at arm wrestling to get a drink in my bar. How can I help you?", response: 'So, I won\'t have to "unleash the beast" after all?' }),
    ]),
    no_quest_yes_ticket: Object.freeze([
      Object.freeze({ text: "Well, well, well… what do we have here? It seems you've arrived a bit before your time.", response: 'Before my time?' }),
      Object.freeze({ text: 'Yes, Wine of the Dead is reserved for the honoured dead, whose passage has been duly recognized.', response: 'But I have a ticket!' }),
      Object.freeze({ text: 'A ticket is not always enough. No, first you must prove that your life—or your death—had value and meaning. Go find someone to Mourn your passing or Celebrate your life at your gravestone. Only then can you partake.', response: "Hell yeah, I'll do it!" }),
    ]),
    no_quest_no_ticket: Object.freeze([
      Object.freeze({ text: "Well, well, well… what do we have here? It seems you've arrived a bit before your time.", response: 'Before my time?' }),
      Object.freeze({ text: 'Yes, Wine of the Dead is reserved for the honoured dead, whose passage has been duly recognized.', response: 'I see. How does one get recognized?' }),
      Object.freeze({ text: 'You must contact someone in the land of the living, and get them to Mourn your passing or Celebrate your life at your gravestone. Only then can you sample these… refreshments, ha ha ha.', response: "Well I'll be damned. Thanks!" }),
    ]),
    yes_quest_no_ticket: Object.freeze([
      Object.freeze({ text: 'Oh ho, missing something, are we?', response: 'Pardon?' }),
      Object.freeze({ text: "You were expecting to obtain some Wine of the Dead, weren't you? You most certainly will need a ticket!", response: 'Oh hell, I most certainly would!' }),
      Object.freeze({ text: 'Yes, your ticket. Ask a friend among the living to Mourn your death or Celebrate your life at your gravestone. This is what you must do.', response: 'Damn straight!' }),
    ]),
  }),
});

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

/** Badges driven by these events (exact GSJS conditions). */
export const HELL_ACHIEVEMENTS = Object.freeze({
  clumsy1: Object.freeze({ counter: 'player:deaths', num: 3 }),
  darwin_award_winner: Object.freeze({ counter: 'player:deaths', num: 11 }),
  necromonger: Object.freeze({ counter: 'player:deaths', num: 53 }),
  zombie: Object.freeze({ counter: 'player:deaths', num: 251 }),
  dracula: Object.freeze({ counter: 'player:deaths', num: 1009 }),
  quiet_tragedy: Object.freeze({ counter: 'croaked:at_home', num: 1 }),
  naraka_completist: Object.freeze({ counter: 'streets_visited_in_hub:number_40', num: 7 }),
});

/** Pull `{ counter, amount }` rows for applyAchievementProgress from an effects list. */
export function achievementEventsFrom(effects = []) {
  return (effects || [])
    .filter((e) => e && e.type === 'achievement' && e.counter)
    .map((e) => ({ counter: e.counter, amount: e.amount || 1 }));
}
