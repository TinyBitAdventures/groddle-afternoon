/**
 * Happy New Ur (register G1195; plan research/seasonal/new-year-plan.md, Austin's picks 2026-11-23).
 * Pure rules: no DOM. js/features/new-ur-feature.js puts them in the world; the realtime server's
 * new_ur.go keeps every online player on one clock.
 *
 * What Glitch did (plan section 1): New Year sat inside Glitchmas (common.js isGlitchmas ran to
 * 2012-01-03); at midnight Pacific on 2011-12-31 every player online got about two seconds of the
 * Sparkle Powder burst, Ur-wide, while a crowd partied in Unnu Slight by the stone dragon. That part
 * is matched: one moment for the whole world, the sparkle for everyone on every street, the party
 * street Unnu Slight.
 *
 * Ours (inventions register new-ur-countdown): the moment is a Groddle midnight, not a real one.
 * Groddle days are four real hours from Glitch's epoch (js/game-day.js GAME_EPOCH_MS, GAME_DAY_MS),
 * so six of them start on every December 31 on Ur's clock (Pacific). Each gets the countdown and the
 * show; the one nearest 1 PM Pacific (Austin's pick, "or whichever Glitch new game day is closest to
 * that time") is the big one with the party. Every time here is derived from the game clock; none is
 * written down as a UTC time. The show: Tiny Speck's 321_countdown, the Sparkle Powder burst,
 * fireworks_1-3 on the loneliness party's 4 s rhythm, and the New Day screen as "Happy New Ur!".
 * The season (Dec 26 to Jan 3, js/seasons.js new_ur) is there for the stock the later pieces bring.
 *
 * Hooks for the later pieces (plan section 6, steps 4 to 8), all left empty here:
 *  - keepsake and badge: features answer collect('newUrMidnight', info, engine) at each midnight a
 *    player sees ({ year, index, big, at, count, first }); the save's seen list is recordMidnight.
 *  - Confetti Popper, Bubbly: js/seasons.js SEASONAL_STOCK.new_ur (the Toy Vendor's rows) and
 *    collect('newUrShow', info, engine) for party-street extras at the big midnight.
 *  - Sparkly Batterflies: firstUrDay(now) (the Groddle day the big midnight opens).
 *  - Chicken party hats: hatsOn(now) (December 31 and January 1 on Ur's clock).
 */

import { GAME_DAY_MS, GAME_EPOCH_MS, GAME_HOUR_MS, dametimeParts } from './game-day.js?v=57fecfcb';
import { SEASON_TIME_ZONE, urDate } from './seasons.js?v=5d8f545a';

export const NEW_UR_SEASON = 'new_ur';
/** Unnu Slight (Bortola), the street with the stone dragon's head: Glitch's 2011 party street. */
export const PARTY_STREET = 'GIFUNGIBHQ1243A';
export const PARTY_STREET_LABEL = 'Unnu Slight';
/**
 * The stone dragon's mouth, in the street's px, for the glow. Unnu Slight's own template (Tiny Speck's
 * "Unnu Slight (dragon)" street render, the GoodnightGroddle archive's FullStreetTemplates/Bortola,
 * 3000 x 1600 as the street is) lights the dragon's throat between its teeth: that lit patch's middle
 * is (642, 1059), the head's rock reaching from the street's left end to its snout at about x 1100.
 * The 2012-01-01 00:52 and 00:55 snaps of the New Year crowd on Unnu Slight (forum thread general
 * 14813) show the party standing up on that head. Reference only: no pixels come from either.
 */
export const DRAGON_AT = Object.freeze({ x: 640, y: 1060 });
/** New Year's Eve on Ur's clock. */
export const EVE = Object.freeze({ m: 12, d: 31 });
/** Austin's pick: the Groddle midnight nearest 1 PM on Ur's clock on December 31 is the big one. */
export const BIG_HOUR = 13;

export const NEW_UR_TIMING = Object.freeze({
  /** The HUD countdown from one game hour before (11 PM on the Groddle clock, ten real minutes). */
  leadMs: GAME_HOUR_MS,
  /** The last six game minutes: the countdown turns big. */
  bigMs: 60_000,
  /** Big numbers 10..4 in the middle of the view. */
  tenMs: 10_000,
  /** Tiny Speck's 321_countdown (its GO lands on midnight: 3, 2, 1 a second each). */
  threeMs: 3_000,
  /** The show after midnight, everywhere. */
  showMs: 20_000,
  /** The party after the big midnight (and the teleport's window): one game hour. */
  partyMs: GAME_HOUR_MS,
  /** The New Day screen is dressed for a new day that starts this close to a midnight. */
  dressMs: GAME_HOUR_MS,
  /** The New Day screen two seconds in (forced under QA; the game's own check runs every 5 s). */
  newDayAtMs: 2_000,
  /** Everyone plays happy once, three seconds in; on the party street surprise once at T-10 s. */
  happyAtMs: 3_000,
  /** items/include/loneliness.js lonelinessEndPartyOverlay 355-463, spirit-loneliness.js fireworks. */
  fireworks: Object.freeze([
    Object.freeze({ at: 0, key: 'fireworks_1', x: 0.5, y: 0.75 }),
    Object.freeze({ at: 4000, key: 'fireworks_2', x: 0.3, y: 0.3 }),
    Object.freeze({ at: 8000, key: 'fireworks_3', x: 0.7, y: 0.3 }),
  ]),
  /** The party street gets them twice over. */
  partyFireworks: Object.freeze([
    Object.freeze({ at: 12000, key: 'fireworks_1', x: 0.5, y: 0.75 }),
    Object.freeze({ at: 14000, key: 'fireworks_2', x: 0.25, y: 0.35 }),
    Object.freeze({ at: 16000, key: 'fireworks_3', x: 0.75, y: 0.35 }),
  ]),
  fireworkMs: 2000,
});

/** Player-facing words: plain, short, no em dashes. */
export const NEW_UR_TEXT = Object.freeze({
  name: 'Happy New Ur',
  countdown: (left) => `Happy New Ur in ${left}`,
  party: 'Party at Unnu Slight',
  goParty: 'Go to the party',
  goPartyTip: 'One free teleport to Unnu Slight',
  partyUsed: 'You have used your free trip to the party.',
  partyHere: 'You are at the party!',
  title: 'HAPPY NEW UR!',
  refill: 'A new year, and a complete energy refill',
  activity: (p) => `Happy New Ur! Year ${p.year}, ${p.month} the ${p.monthDayWithSuffix}.`,
  calendarLabel: 'Happy New Ur countdown',
  calendarMidnights: 'Groddle midnights',
  calendarBig: 'the party',
});

/** The New Day bubble's lines on a New Ur midnight, in place of NewDayView's (ours). */
export const NEW_UR_LINES = Object.freeze([
  'Out with the old, in with the Ur!',
  'Happy New Ur!',
  'A whole new Ur. Mind the sparkles.',
  'Another year older and not a day wiser. Splendid!',
]);

/**
 * Global's lines before the big midnight (new_ur.go newUrNotices says the same; times in words, as
 * Global cannot say a local time).
 */
export const NEW_UR_NOTICES = Object.freeze([
  Object.freeze({ leadMs: 24 * 3_600_000, text: 'Happy New Ur in 24 hours! The year turns at a Groddle midnight. Party at Unnu Slight.' }),
  Object.freeze({ leadMs: 3_600_000, text: 'Happy New Ur in one hour! Party at Unnu Slight, or watch the sky wherever you are.' }),
  Object.freeze({ leadMs: 10 * 60_000, text: 'Happy New Ur in 10 minutes! The year turns at Groddle midnight. Party at Unnu Slight!' }),
]);

/* ---------------------------------------------------------------- clock */

let hourFormat = null;
function urHour(t) {
  hourFormat ||= new Intl.DateTimeFormat('en-US', { timeZone: SEASON_TIME_ZONE, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(hourFormat.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) + Number(p.minute) / 60;
}

/** 00:00 on Ur's clock (Pacific) starting a calendar date, in ms. */
export function urMidnightOf(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const [yy, mm, dd] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  for (const h of [8, 7, 9, 6]) {
    const t = Date.UTC(yy, mm - 1, dd, h);
    const u = urDate(t);
    if (u.y === yy && u.m === mm && u.d === dd && urHour(t) === 0) return t;
  }
  return Date.UTC(yy, mm - 1, dd, 8);
}

/** The first Groddle midnight (a game day's start) at or after t. */
export function nextGroddleMidnight(t) {
  const n = Math.ceil((Number(t) - GAME_EPOCH_MS) / GAME_DAY_MS);
  return GAME_EPOCH_MS + n * GAME_DAY_MS;
}

/**
 * The Groddle midnights on December 31 of year y on Ur's clock (six: one every four real hours),
 * soonest first: { year, index (1-6), at, big }. The big one is the one nearest BIG_HOUR.
 */
export function newUrMidnights(y) {
  const start = urMidnightOf(y, EVE.m, EVE.d);
  const end = urMidnightOf(y + 1, 1, 1);
  const ats = [];
  for (let t = nextGroddleMidnight(start); t < end; t += GAME_DAY_MS) ats.push(t);
  const target = start + BIG_HOUR * 3_600_000;
  let big = ats[0];
  for (const t of ats) if (Math.abs(t - target) < Math.abs(big - target)) big = t;
  return ats.map((at, i) => Object.freeze({ year: y, index: i + 1, at, big: at === big }));
}

/** The big midnight of year y's New Year's Eve. */
export const bigMidnight = (y) => newUrMidnights(y).find((m) => m.big);

/** The eve whose midnights may be near `now`: this December's, or last December's in January. */
const evesNear = (now) => {
  const y = urDate(now).y;
  return [...newUrMidnights(y - 1), ...newUrMidnights(y)];
};

/** How long after a midnight its moment lasts: the party after the big one, the show after the rest. */
const tailMs = (m) => (m.big ? NEW_UR_TIMING.partyMs : NEW_UR_TIMING.showMs);

/**
 * Where `now` sits around a New Ur midnight: { phase, midnight, msTo } where phase is
 *   'none'  (no midnight near: midnight null)
 *   'lead'  (the last game hour: the HUD countdown)
 *   'big'   (the last minute)
 *   'ten'   (10..4 in the middle)
 *   'three' (the 321 overlay)
 *   'show'  (the first 20 s after: sparkle and fireworks)
 *   'party' (after the show, the big midnight's game hour)
 * msTo is ms to the midnight (negative after it).
 */
export function newUrMoment(now) {
  const t = Number(now);
  const T = NEW_UR_TIMING;
  for (const m of evesNear(t)) {
    const msTo = m.at - t;
    if (msTo > T.leadMs || -msTo >= tailMs(m)) continue;
    let phase = 'lead';
    if (msTo <= 0) phase = -msTo < T.showMs ? 'show' : 'party';
    else if (msTo <= T.threeMs) phase = 'three';
    else if (msTo <= T.tenMs) phase = 'ten';
    else if (msTo <= T.bigMs) phase = 'big';
    return { phase, midnight: m, msTo };
  }
  return { phase: 'none', midnight: null, msTo: Infinity };
}

/** "9:52" (minutes:seconds) left, rounded up so 0:00 is midnight itself. */
export function countdownLeft(msTo) {
  const s = Math.max(0, Math.ceil(Number(msTo) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The big centre number during 'ten' (10..4), else null. */
export function bigNumber(msTo) {
  const s = Math.ceil(Number(msTo) / 1000);
  return s >= 4 && s <= 10 ? s : null;
}

/** Whether `now` is New Year's Eve on Ur's clock (the party street is dressed all day). */
export function isNewUrEve(now) {
  const t = urDate(now);
  return t.m === EVE.m && t.d === EVE.d;
}

/** The free trip to the party: from one game hour before the big midnight to one game hour after. */
export function partyTripOpen(now) {
  const { midnight } = newUrMoment(now);
  return Boolean(midnight?.big);
}

/**
 * The New Day screen's dress for a day that starts at a New Ur midnight (a day starting up to
 * dressMs before now, or a moment early for a clock a little ahead), else null.
 */
export function newDayDress(now, rand = Math.random) {
  const t = Number(now);
  for (const m of evesNear(t)) {
    if (t < m.at - 30_000 || t >= m.at + NEW_UR_TIMING.dressMs) continue;
    const p = dametimeParts(Math.max(t, m.at));
    const line = NEW_UR_LINES[Math.floor(rand() * NEW_UR_LINES.length) % NEW_UR_LINES.length];
    return { title: NEW_UR_TEXT.title, refill: NEW_UR_TEXT.refill, date: p.stringDayMonth, line, activity: NEW_UR_TEXT.activity(p), year: m.year, index: m.index, big: m.big };
  }
  return null;
}

/* -------------------------------------------------------- the later pieces */

/** Sparkly Batterflies (a later lane): the Groddle day the big midnight opens. */
export function firstUrDay(now) {
  const t = Number(now);
  return evesNear(t).some((m) => m.big && t >= m.at && t < m.at + GAME_DAY_MS);
}

/**
 * Sparkly Batterflies (G1195 step 7): from the big midnight to the end of January 1 on Ur's clock.
 * The plan's first Groddle day after the big midnight (firstUrDay) is four real hours of a US
 * afternoon; the Batterflies keep glinting through New Year's Day so every time zone sees them (ours).
 */
export function sparklyBatterflies(now) {
  const t = Number(now);
  if (firstUrDay(t)) return true;
  const u = urDate(t);
  if (!(u.m === 1 && u.d === 1)) return false;
  const big = bigMidnight(u.y - 1);
  return Boolean(big) && t >= big.at;
}

/** Chicken party hats: December 31 and January 1 on Ur's clock (js/new-ur-party.js, pot-luck-feature). */
export function hatsOn(now) {
  const t = urDate(now);
  return (t.m === 12 && t.d === 31) || (t.m === 1 && t.d === 1);
}

/* ---------------------------------------------------------------- save */

export function createNewUrState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const seen = {};
  for (const [y, list] of Object.entries(s.seen && typeof s.seen === 'object' ? s.seen : {})) {
    if (!/^\d{4}$/.test(y) || !Array.isArray(list)) continue;
    seen[y] = [...new Set(list.filter((n) => Number.isInteger(n) && n >= 1 && n <= 6))].sort();
  }
  const trips = Array.isArray(s.trips) ? s.trips.filter((y) => /^\d{4}$/.test(String(y))).map(String) : [];
  return { seen, trips };
}

/**
 * A midnight this player was online for (the keepsake and badge hook). Returns
 * { fresh, count (midnights seen that eve), first (the first of the eve) }.
 */
export function recordMidnight(state, m) {
  const y = String(m.year);
  const list = (state.seen[y] ||= []);
  const fresh = !list.includes(m.index);
  if (fresh) {
    list.push(m.index);
    list.sort();
  }
  return { fresh, count: list.length, first: fresh && list.length === 1 };
}

/** The one free trip to the party, once an eve. */
export function takeTrip(state, year) {
  const y = String(year);
  if (state.trips.includes(y)) return false;
  state.trips.push(y);
  return true;
}

/* ------------------------------------------------------------------ QA */

/**
 * ?newurmidnight=1..6 (&newurlead=<s>, default 20; &seasondate=YYYY-MM-DD picks the eve's year,
 * else this year's): how far to move the show's clock so that midnight is `lead` seconds away now.
 * 0 without the param.
 */
export function qaClockOffset({ midnight = '', lead = '', date = null } = {}, now = Date.now()) {
  const k = Math.floor(Number(midnight));
  if (!(k >= 1 && k <= 6)) return 0;
  const leadS = lead === '' || lead == null ? 20 : Math.max(0, Number(lead) || 0);
  const t = date ?? now;
  const u = urDate(t);
  const y = u.m === 1 ? u.y - 1 : u.y;
  const m = newUrMidnights(y)[k - 1];
  return m ? m.at - leadS * 1000 - now : 0;
}
