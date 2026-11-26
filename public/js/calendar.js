/**
 * The Calendar (register G800): Ur's calendar with its holidays and Feats, and what is coming up,
 * as Glitch's Calendar page showed them. Pure (no DOM); js/features/calendar-feature.js draws it.
 *
 * What Glitch had:
 *  - A Calendar button in the clock's dialog (glitch-client DateTimeDialog.as 131-160: "Calendar",
 *    tip "Opens in a new window"), which opened the website's /calendar/ page
 *    (TSFrontController.as openCalendarPage 4353-4358). The Butler pointed at it: "If you ever want
 *    to know what date it is - if such things are important to you - look at the calendar by
 *    clicking the time in the top right, then the calendar icon. Ta-da!" (items/include/
 *    butler_hints.js:101).
 *  - The page (glitch.com/calendar/, Wayback 2012-10-25) showed one Ur year: "Right at this very
 *    moment, it's 9:15pm, Hairday, the 16th of Fever, Year 25", then each month as a grid of
 *    eight-day weeks (Hairday to Fabday), each day with a tip "About 14 real world days ago" /
 *    "About 12 real world days from now", the holidays named on their days ("Pot Twoday (About 14
 *    real world days ago)"), each Feat as a bar across the six Ur days of its 24 real hours with
 *    its name, and "Today". Year links went back to Year 1. An upcoming Feat read "This feat begins
 *    in ... (real time)".
 *  - Its holidays came from the web side (API calendar.getHolidays; the developer docs' time page,
 *    research/wayback/raw/developer/gtg_developer_docs_time_.txt 130-149, lists them: UR_HOLIDAYS).
 *    Only Zilloween had game code (common.js isZilloween); the others were days on the calendar.
 *
 * The remake fills it from its own data: Ur's days (js/game-day.js), Glitch's holidays as the
 * calendar named them, the events the remake runs on real dates (js/seasons.js SEASONS: Zilloween,
 * Glitchmas and Pi Day from Glitch, Pot Luck Day and Happy New Ur the remake's, with Happy New Ur's
 * countdown day and its six Groddle midnights: newUrEve) and in Ur's own Zilloween (Remember 25-37,
 * isDametimeZilloween), and the Feats: online the shared Feat's turns (js/feats-mp.js runAt, one a
 * real day, six Ur days, as Glitch's), solo your own Feats (js/solo-feats.js). Real times are shown
 * in the player's own time zone (fmtLocal), as the page linked "Find out when the feat starts in
 * your timezone".
 */

import {
  DAY_NAMES,
  GAME_DAY_MS,
  GAME_EPOCH_MS,
  GAME_YEAR_MS,
  MONTH_LENGTHS,
  MONTH_NAMES,
  dametimeParts,
} from './game-day.js?v=57fecfcb';
import { SEASONS, SEASON_TIME_ZONE, potLuckWindow, urDate } from './seasons.js?v=5d8f545a';
import { MP_ORDER, RUN_EPOCH_MS, RUN_MS, runAt } from './feats-mp.js?v=e1fc8239';
import { FEAT_BY_ID } from './solo-feats.js?v=2224a7a6';
import { NEW_UR_TEXT, newUrMidnights } from './new-ur.js?v=cec82e41';

export const CALENDAR_TEXT = Object.freeze({
  title: 'Calendar',
  button: 'Calendar',
  clockTip: 'Calendar: holidays and Feats',
  now: (p) => `Right at this very moment, it's ${p.time}${p.ampm.toLowerCase()}, ${p.stringDayMonth}, Year ${p.year}`,
  today: 'Today',
  onNow: 'On now',
  comingUp: 'Coming up',
  feats: 'Feats',
  featNow: "Today's Feat",
  featNext: 'Next Feats',
  soloFeats: 'In solo your Feats are your own: every Feat is open until you finish it, and a finished one opens again a game week later.',
  soloOpen: (n) => `${n} Feat${n === 1 ? '' : 's'} open now.`,
  soloDone: 'Opens again',
  allOpen: 'All of them are open now.',
  year: (y) => `Year ${y}`,
  fromGlitch: 'From Glitch',
  ours: 'A Groddle original',
  urDay: "A holiday on Ur's calendar",
  urDays: "Ur's calendar",
  yourTime: 'Times are in your own time zone.',
  close: 'Close',
});

/**
 * Glitch's holidays as its calendar named them (developer docs, time: 130-149; the 2012 page agrees),
 * [month, first day, last day, label]. Zilloween's day is 37 Remember there; the game ran Zilloween
 * from the 25th (common.js isZilloween), which is how the remake marks it (DAMETIME_ZILLOWEEN).
 */
export const UR_HOLIDAYS = Object.freeze([
  Object.freeze({ month: 'Primuary', from: 5, to: 5, label: 'AlphCon' }),
  Object.freeze({ month: 'Spork', from: 2, to: 2, label: 'Lemadan' }),
  Object.freeze({ month: 'Bruise', from: 3, to: 3, label: 'Pot Twoday' }),
  Object.freeze({ month: 'Candy', from: 2, to: 4, label: 'Root' }),
  Object.freeze({ month: 'Candy', from: 11, to: 11, label: 'Sprinkling' }),
  Object.freeze({ month: 'Junuary', from: 17, to: 17, label: 'Croppaday' }),
  Object.freeze({ month: 'Septa', from: 1, to: 1, label: 'Belabor Day' }),
  Object.freeze({ month: 'Eleventy', from: 11, to: 11, label: 'Recurse Eve' }),
]);

/** Ur's own Zilloween, the days isDametimeZilloween is true: Remember 25 to 37. */
export const DAMETIME_ZILLOWEEN = Object.freeze({ month: 'Remember', from: 25, to: 37 });

const DAY_MS = 86_400_000;
const whole = (v) => Math.floor(Number(v) || 0);

/** The 0-based day of the Ur year a month's day falls on. */
export function urDayOfYear(month, day) {
  const i = MONTH_NAMES.indexOf(month);
  if (i < 0) return -1;
  let d = 0;
  for (let k = 0; k < i; k += 1) d += MONTH_LENGTHS[k];
  return d + day - 1;
}

/** When Ur year `year` begins (real ms), and when one of its days does. */
export const urYearStart = (year) => GAME_EPOCH_MS + whole(year) * GAME_YEAR_MS;
export const urDayStart = (year, dayOfYear) => urYearStart(year) + dayOfYear * GAME_DAY_MS;

/**
 * One Ur year as the page laid it out: twelve months, each a list of its days with the weekday
 * column (0 Hairday .. 7 Fabday; TimeController's 307-day weekday turn) and real start and end.
 */
export function urYear(year) {
  const y = whole(year);
  const months = [];
  let doy = 0;
  for (let m = 0; m < MONTH_NAMES.length; m += 1) {
    const days = [];
    for (let d = 1; d <= MONTH_LENGTHS[m]; d += 1, doy += 1) {
      const start = urDayStart(y, doy);
      const weekDay = (((doy + 307 * y) % DAY_NAMES.length) + DAY_NAMES.length) % DAY_NAMES.length;
      days.push({ month: MONTH_NAMES[m], day: d, dayOfYear: doy, weekDay, start, end: start + GAME_DAY_MS });
    }
    months.push({ name: MONTH_NAMES[m], number: m + 1, days });
  }
  return { year: y, start: urYearStart(y), end: urYearStart(y + 1), months };
}

/** Glitch's holidays on a day ({ month, day }), by label. */
export function urHolidaysOn(day) {
  return UR_HOLIDAYS.filter((h) => h.month === day.month && day.day >= h.from && day.day <= h.to).map((h) => h.label);
}

/* ------------------------------------------------------------ real-world dates */

let laFormat = null;
function laParts(t) {
  laFormat ||= new Intl.DateTimeFormat('en-US', { timeZone: SEASON_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' });
  const p = Object.fromEntries(laFormat.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24 };
}

/** Midnight starting a calendar date on Ur's clock (Pacific: seasons.js SEASON_TIME_ZONE), in ms. */
export function urMidnight(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const [yy, mm, dd] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  for (const h of [7, 8, 6, 9]) {
    const t = Date.UTC(yy, mm - 1, dd, h);
    const p = laParts(t);
    if (p.h === 0 && p.d === dd && p.m === mm) return t;
  }
  return Date.UTC(yy, mm - 1, dd, 8);
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Each dated event's window in calendar year y, [start, end) in ms, as seasons.js turns it on:
 * whole days on Ur's clock (inWindow / isPotLuckDay), Pi Day by its UTC test (isPiDay).
 */
export function eventWindow(id, y) {
  if (id === 'zilloween') return { start: urMidnight(y, 10, 17), end: urMidnight(y, 11, 2) };
  if (id === 'glitchmas') return { start: urMidnight(y, 12, 12), end: urMidnight(y + 1, 1, 4) };
  if (id === 'new_ur') return { start: urMidnight(y, 12, 26), end: urMidnight(y + 1, 1, 4) };
  if (id === 'pi_day') return { start: Date.UTC(y, 2, 13, 12), end: Date.UTC(y, 2, 15, 12) };
  if (id === 'pot_luck_day') {
    const w = potLuckWindow(y);
    return { start: urMidnight(y, 11, w.from[1]), end: urMidnight(y, 11, Math.min(w.to[1], daysIn(y, 11)) + 1) };
  }
  return null;
}

/** Ur's own Zilloween in Ur year `year`, [start, end). */
export function dametimeZilloween(year) {
  const z = DAMETIME_ZILLOWEEN;
  return { start: urDayStart(year, urDayOfYear(z.month, z.from)), end: urDayStart(year, urDayOfYear(z.month, z.to)) + GAME_DAY_MS };
}

/**
 * The events on now or coming next, one row each, soonest first: { id, label, start, end, on,
 * glitch (from Glitch, or the remake's), blurb, ur (true for Ur's own Zilloween) }.
 */
export function calendarEvents(now = Date.now()) {
  const t = whole(now);
  const y = urDate(t).y;
  const rows = [];
  for (const id of Object.keys(SEASONS)) {
    let pick = null;
    for (const yy of [y - 1, y, y + 1]) {
      const w = eventWindow(id, yy);
      if (w && w.end > t && (!pick || w.start < pick.start)) pick = w;
    }
    if (!pick) continue;
    const def = SEASONS[id];
    rows.push({ id, label: def.label, start: pick.start, end: pick.end, on: pick.start <= t, glitch: def.source !== 'designed', blurb: def.blurb, ur: false });
  }
  const p = dametimeParts(t);
  let z = dametimeZilloween(p.year);
  if (z.end <= t) z = dametimeZilloween(p.year + 1);
  rows.push({ id: 'zilloween_ur', label: 'Zilloween', start: z.start, end: z.end, on: z.start <= t, glitch: true, blurb: "Zilloween on Ur's own calendar, Remember 25 to 37: pumpkins and candy as in the real-world Zilloween.", ur: true });
  // G1195: Happy New Ur's countdown day, December 31, with its six Groddle midnights (js/new-ur.js).
  const eve = newUrEve(t);
  if (eve) rows.push(eve);
  rows.sort((a, b) => Number(b.on) - Number(a.on) || a.start - b.start);
  return rows;
}

/**
 * The countdown day still to come or on (December 31 on Ur's clock): a calendarEvents row with
 * `midnights` ({ index, at, big }, the six Groddle midnights, the big one the party).
 */
export function newUrEve(now = Date.now()) {
  const t = whole(now);
  const y = urDate(t).y;
  for (const yy of [y - 1, y]) {
    const start = urMidnight(yy, 12, 31);
    const end = urMidnight(yy + 1, 1, 1);
    if (end <= t) continue;
    const midnights = newUrMidnights(yy).map(({ index, at, big }) => ({ index, at, big }));
    return { id: 'new_ur_eve', label: NEW_UR_TEXT.calendarLabel, start, end, on: start <= t, glitch: false, blurb: SEASONS.new_ur.blurb, ur: false, midnights };
  }
  return null;
}

/** "Groddle midnights: 1:00 AM, 5:00 AM, 9:00 AM, 1:00 PM (the party), 5:00 PM, 9:00 PM" in your own zone. */
export function midnightsLine(midnights, opts = {}) {
  const f = new Intl.DateTimeFormat(opts.locale || undefined, { hour: 'numeric', minute: '2-digit', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) });
  return `${NEW_UR_TEXT.calendarMidnights}: ${midnights.map((m) => `${f.format(new Date(m.at))}${m.big ? ` (${NEW_UR_TEXT.calendarBig})` : ''}`).join(', ')}`;
}

/** The events (calendarEvents rows) that touch an Ur day, for the grid. */
export function eventsOn(day, rows) {
  return rows.filter((r) => r.start < day.end && r.end > day.start);
}

/* ------------------------------------------------------------------- Feats */

/**
 * The shared Feat's turns online (feats-mp.js: one a real day, MP_ORDER in turn). anchor is the
 * run the server sent (its feat and start, on this page's clock), so a schedule the server shifted
 * is followed; without one it is runAt (the live server runs no shift). { n, idx } of that run.
 */
export function featAnchor(now = Date.now(), run = null) {
  const k = MP_ORDER.length;
  if (run && FEAT_BY_ID[run.feat] && MP_ORDER.includes(run.feat) && Number.isFinite(Number(run.start))) {
    return { n: Math.round((Number(run.start) - RUN_EPOCH_MS) / RUN_MS), idx: MP_ORDER.indexOf(run.feat) };
  }
  const r = runAt(now);
  return { n: r.run, idx: ((r.run % k) + k) % k };
}

/** The Feat run covering real time t: { n, feat, title, start, end }. */
export function featRunAt(t, anchor) {
  const k = MP_ORDER.length;
  const n = Math.floor((whole(t) - RUN_EPOCH_MS) / RUN_MS);
  const feat = MP_ORDER[(((anchor.idx + n - anchor.n) % k) + k) % k];
  const start = RUN_EPOCH_MS + n * RUN_MS;
  return { n, feat, title: FEAT_BY_ID[feat]?.title || feat, start, end: start + RUN_MS };
}

/** The Feat on now and the next `count` after it. */
export function featTurns(now = Date.now(), run = null, count = 7) {
  const anchor = featAnchor(now, run);
  const cur = featRunAt(now, anchor);
  const out = [cur];
  for (let i = 1; i <= count; i += 1) out.push(featRunAt(cur.start + i * RUN_MS, anchor));
  return out;
}

/* ---------------------------------------------------------------- wording */

/** The page's tip: "About 12 real world days from now" / "About 4 real world hours ago". */
export function aboutWhen(t, now = Date.now()) {
  const diff = whole(t) - whole(now);
  const a = Math.abs(diff);
  let n;
  let unit;
  if (a < 90 * 60_000) {
    n = Math.max(1, Math.round(a / 60_000));
    unit = 'minute';
  } else if (a < 2 * DAY_MS) {
    n = Math.round(a / 3_600_000);
    unit = 'hour';
  } else {
    n = Math.round(a / DAY_MS);
    unit = 'day';
  }
  return `About ${n} real world ${unit}${n === 1 ? '' : 's'} ${diff >= 0 ? 'from now' : 'ago'}`;
}

/** A real time in the player's own zone (opts.timeZone for tests): "Sun, Nov 22, 12:00 AM". */
export function fmtLocal(t, opts = {}) {
  const f = new Intl.DateTimeFormat(opts.locale || undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });
  return f.format(new Date(whole(t)));
}

/** "Sun, Nov 22, 12:00 AM to Mon, Nov 30, 12:00 AM". */
export const fmtSpan = (start, end, opts) => `${fmtLocal(start, opts)} to ${fmtLocal(end, opts)}`;

/** The Ur date of a real time, as the clock says it: "Hairday, the 16th of Fever, Year 25". */
export function urDateLine(t) {
  const p = dametimeParts(t);
  return `${p.stringDayMonth}, Year ${p.year}`;
}
