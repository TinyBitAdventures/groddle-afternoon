/**
 * The Calendar window (register G800; rules and the source in js/calendar.js).
 *
 * Glitch put a Calendar button in the clock's dialog (DateTimeDialog.as 131-160), which opened the
 * calendar page: Ur's year, month by month in eight-day weeks, its holidays and its Feats, "Right at
 * this very moment, it's ...", and a tip on every day saying how far off it is in real time. Here:
 *  - Multiplayer: the clock's dialog is the hi sign board (features/hi-signs-feature.js), and its
 *    Calendar button opens this window (the groddle:calendar event).
 *  - Solo: the clock has no dialog of its own (the board is the multiplayer one), so the clock
 *    itself opens the Calendar; in Classic the date block passes its click on (classic-topbar.js).
 * The window lists what is on now and coming up (the events with their real dates and times in
 * your own time zone, the Feats), then the Ur year: Glitch's holidays, the remake's events on the
 * days they cover, the shared Feat's turns online, and Today. A tap on a day writes its tip under
 * its month (phones have no hover).
 *
 * QA: ?autostart=1&questoffer=off&calendaropen=1 opens it; &calendaryear=<n> shows Ur year n.
 * Canvas: calendarOpen (0 | 1), calendarYear, calendarEvents (ids on now and coming), calendarFeat.
 */

import { DAY_NAMES, dametimeParts } from '../game-day.js?v=beeaa24b';
import {
  CALENDAR_TEXT,
  aboutWhen,
  calendarEvents,
  eventsOn,
  featAnchor,
  featRunAt,
  featTurns,
  fmtLocal,
  fmtSpan,
  midnightsLine,
  urDateLine,
  urHolidaysOn,
  urYear,
} from '../calendar.js?v=e35525bd';

export const CALENDAR_FEATURE_ID = 'calendar';
export const CALENDAR_EVENT = 'groddle:calendar';

const STYLE = `
.ur-calendar { position: fixed; z-index: var(--z-dialog); top: 3rem; left: 50%; transform: translateX(-50%); width: min(44rem, calc(100vw - 1rem)); max-height: calc(100vh - 4rem); overflow: auto; box-sizing: border-box;
  border-radius: var(--radius-xl); padding: 0.8rem 0.9rem var(--sp-7); background: var(--surface-card); color: var(--c-sand-28); box-shadow: var(--shadow-3); font: var(--fs-md)/var(--lh-normal) var(--font-system); }
.ur-calendar[hidden] { display: none; }
.ur-calendar h2 { margin: 0 0 var(--sp-2); font-size: var(--fs-lg); }
.ur-calendar h3 { margin: var(--sp-6) 0 var(--sp-3); font-size: var(--fs-base); }
.ur-calendar .cal-close { float: right; border: 0; background: transparent; font-size: var(--fs-xl); line-height: var(--lh-none); cursor: pointer; color: var(--c-sand-28); }
.ur-calendar .cal-now { margin: 0; color: var(--c-sand-39); }
.ur-calendar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.ur-calendar li { padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-lg); background: var(--surface-parchment); }
.ur-calendar li b { margin-right: var(--sp-3); }
.ur-calendar li small { display: block; color: var(--c-sand-39); }
.ur-calendar .cal-tag { font-size: var(--fs-sm); color: var(--c-sand-39); }
.ur-calendar li[data-on] { box-shadow: inset 0.25rem 0 0 var(--c-green-48); }
.ur-calendar .cal-feats li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 var(--sp-4); }
.ur-calendar .cal-feats li small { display: inline; }
.ur-calendar .cal-tz { margin: var(--sp-3) 0 0; font-size: var(--fs-sm); color: var(--c-sand-39); }
.ur-calendar .cal-yearbar { display: flex; align-items: center; gap: var(--sp-4); margin-top: var(--sp-7); }
.ur-calendar .cal-yearbar h3 { margin: 0; }
.ur-calendar .cal-yearbar button { border: 1px solid var(--c-gold-84b); border-radius: var(--radius-pill); background: var(--c-cream-99b); color: var(--c-brown-46); font: inherit; font-weight: 700; padding: 0 var(--sp-5); cursor: pointer; }
.ur-calendar .cal-pick { min-height: 1.4em; margin: var(--sp-3) 0 0; font-size: var(--fs-sm); color: var(--c-brown-46); }
.ur-calendar h4 { margin: var(--sp-6) 0 var(--sp-2); font-size: var(--fs-base); }
.ur-calendar .cal-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
.ur-calendar .cal-head { font-size: var(--fs-xs); text-align: center; color: var(--c-sand-39); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ur-calendar .cal-day { position: relative; min-height: 2.9rem; padding: 2px 3px 9px; border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: var(--fs-xs); line-height: 1.15; overflow: hidden; cursor: pointer; }
.ur-calendar .cal-day.blank { background: transparent; cursor: default; }
.ur-calendar .cal-day .date { display: block; font-weight: 700; }
.ur-calendar .cal-day .lbl { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ur-calendar .cal-day.holiday .lbl.hol { color: var(--c-red-46); font-weight: 700; }
.ur-calendar .cal-day.past { opacity: 0.6; }
.ur-calendar .cal-day.today { outline: 2px solid var(--c-gold-63); }
.ur-calendar .cal-day[data-ev~="zilloween"], .ur-calendar .cal-day[data-ev~="zilloween_ur"] { background: var(--c-orange-81); }
.ur-calendar .cal-day[data-ev~="glitchmas"] { background: var(--c-blue-79); }
.ur-calendar .cal-day[data-ev~="pi_day"] { background: var(--surface-moss); }
.ur-calendar .cal-day[data-ev~="pot_luck_day"] { background: var(--c-gold-84); }
.ur-calendar .cal-day[data-ev~="new_ur"] { background: var(--c-slate-98); }
.ur-calendar .cal-day[data-ev~="new_ur_eve"] { background: var(--c-gold-84b); }
.ur-calendar .cal-party { margin-top: var(--sp-2); border: 1px solid var(--c-gold-84b); border-radius: var(--radius-pill); background: var(--c-cream-99b); color: var(--c-brown-46); font: inherit; font-weight: 700; padding: 0 var(--sp-5); cursor: pointer; }
.ur-calendar .cal-day .feat { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; background: var(--c-sky-54); }
.ur-calendar .cal-day .feat.odd { background: var(--c-green-57); }
.ur-calendar .cal-day.picked { outline: 2px solid var(--c-brown-46); }
@media (max-width: 520px) { .ur-calendar { top: 2.6rem; padding: 0.6rem 0.55rem var(--sp-6); } .ur-calendar .cal-day { min-height: 2.5rem; padding: 1px 2px 8px; } }
`;

let engineRef = null;
let box = null;
let shownYear = null;
let clockBound = false;
let listening = false;
let lastData = '';

function now() {
  return Date.now();
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function ensureBox() {
  if (box || typeof document === 'undefined') return box;
  if (!document.getElementById('ur-calendar-css')) {
    const style = document.createElement('style');
    style.id = 'ur-calendar-css';
    style.textContent = STYLE;
    document.head.append(style);
  }
  box = document.createElement('section');
  box.className = 'ur-calendar';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', CALENDAR_TEXT.title);
  box.dataset.calendar = '';
  document.body.append(box);
  return box;
}

/** The Feats from the Feat feature (solo-feats-feature calendarFeats). */
function featsInfo(engine) {
  return engine?.query?.('calendarFeats', engine) || (engine?.mode === 'multiplayer' ? { mode: 'world', run: null } : { mode: 'solo', rows: [] });
}

export function openCalendar(engine = engineRef, year = null) {
  if (!ensureBox()) return;
  const t = now();
  shownYear = Number.isFinite(Number(year)) && year !== null ? Math.floor(Number(year)) : dametimeParts(t).year;
  box.hidden = false;
  render(engine, t);
  const today = box.querySelector('.cal-day.today');
  today?.closest('.cal-month')?.scrollIntoView?.({ block: 'nearest' });
  box.scrollTop = 0;
  publish(engine);
}

export function closeCalendar(engine = engineRef) {
  if (!box || box.hidden) return;
  box.hidden = true;
  publish(engine);
}

function eventTag(r) {
  if (r.ur) return CALENDAR_TEXT.urDays;
  return r.glitch ? CALENDAR_TEXT.fromGlitch : CALENDAR_TEXT.ours;
}

function render(engine, t) {
  const events = calendarEvents(t);
  const feats = featsInfo(engine);
  const world = feats.mode === 'world';
  const anchor = world ? featAnchor(t, feats.run) : null;
  const parts = [];

  const close = el('button', 'cal-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', CALENDAR_TEXT.close);
  close.addEventListener('click', () => closeCalendar(engine));
  parts.push(close, el('h2', '', CALENDAR_TEXT.title), el('p', 'cal-now', CALENDAR_TEXT.now(dametimeParts(t))));

  // On now and coming up: the events, soonest first.
  const on = events.filter((r) => r.on);
  const coming = events.filter((r) => !r.on);
  const evList = (rows) => {
    const ul = el('ul', 'cal-events');
    for (const r of rows) {
      const li = el('li');
      li.dataset.event = r.id;
      if (r.on) li.dataset.on = '';
      li.append(el('b', '', r.label), el('span', 'cal-tag', eventTag(r)));
      li.append(el('small', '', `${fmtSpan(r.start, r.end)} (${r.on ? `ends ${aboutWhen(r.end, t).replace(/^About/, 'about')}` : aboutWhen(r.start, t)})`));
      // G1195: Happy New Ur's six Groddle midnights in your own time, and the free trip while it is open.
      if (r.midnights) {
        li.append(el('small', 'cal-midnights', midnightsLine(r.midnights)));
        const trip = engine?.query?.('newUrPartyTrip', engine);
        if (trip?.open) {
          const go = el('button', 'cal-party', trip.label);
          go.type = 'button';
          go.title = trip.tip || '';
          go.addEventListener('click', () => {
            closeCalendar(engine);
            engine.query?.('newUrGoParty', engine);
          });
          li.append(go);
        }
      }
      li.title = r.blurb;
      ul.append(li);
    }
    return ul;
  };
  if (on.length) parts.push(el('h3', '', CALENDAR_TEXT.onNow), evList(on));
  parts.push(el('h3', '', CALENDAR_TEXT.comingUp), evList(coming));

  // The Feats.
  parts.push(el('h3', '', CALENDAR_TEXT.feats));
  const fl = el('ul', 'cal-feats');
  if (world) {
    const turns = featTurns(t, feats.run, 6);
    turns.forEach((f, i) => {
      const li = el('li');
      li.dataset.feat = f.feat;
      if (i === 0) li.dataset.on = '';
      li.append(el('b', '', i === 0 ? `${CALENDAR_TEXT.featNow}: ${f.title}` : f.title));
      li.append(el('small', '', i === 0 ? `ends ${fmtLocal(f.end)} (${aboutWhen(f.end, t).replace(/^About/, 'about')})` : `${fmtLocal(f.start)} (${aboutWhen(f.start, t)})`));
      fl.append(li);
    });
  } else {
    const rows = feats.rows || [];
    const done = rows.filter((r) => r.complete && r.reopensAt);
    const open = rows.length - done.length;
    const intro = el('li');
    intro.append(el('span', '', `${CALENDAR_TEXT.soloFeats} ${done.length ? CALENDAR_TEXT.soloOpen(open) : CALENDAR_TEXT.allOpen}`));
    fl.append(intro);
    for (const r of done.sort((a, b) => a.reopensAt - b.reopensAt)) {
      const li = el('li');
      li.dataset.feat = r.id;
      li.append(el('b', '', r.title), el('small', '', `${CALENDAR_TEXT.soloDone} ${fmtLocal(r.reopensAt)} (${aboutWhen(r.reopensAt, t)})`));
      fl.append(li);
    }
  }
  parts.push(fl, el('p', 'cal-tz', CALENDAR_TEXT.yourTime));

  // The Ur year, as the page drew it.
  const year = urYear(shownYear);
  const bar = el('div', 'cal-yearbar');
  const prev = el('button', '', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', CALENDAR_TEXT.year(year.year - 1));
  prev.addEventListener('click', () => { shownYear -= 1; render(engine, now()); publish(engine); });
  const next = el('button', '', '›');
  next.type = 'button';
  next.setAttribute('aria-label', CALENDAR_TEXT.year(year.year + 1));
  next.addEventListener('click', () => { shownYear += 1; render(engine, now()); publish(engine); });
  bar.append(prev, el('h3', '', CALENDAR_TEXT.year(year.year)), next);
  const pick = el('p', 'cal-pick');
  pick.setAttribute('aria-live', 'polite');
  parts.push(bar, pick);

  const shortDays = DAY_NAMES.map((d) => d.slice(0, 3));
  for (const m of year.months) {
    const sec = el('div', 'cal-month');
    sec.dataset.month = m.name;
    sec.append(el('h4', '', m.name));
    const grid = el('div', 'cal-grid');
    for (const d of shortDays) grid.append(el('span', 'cal-head', d));
    for (let i = 0; i < m.days[0].weekDay; i += 1) grid.append(el('span', 'cal-day blank'));
    let prevRun = null;
    for (const day of m.days) {
      const cell = el('div', 'cal-day');
      cell.dataset.day = `${m.name}-${day.day}`;
      cell.append(el('span', 'date', String(day.day)));
      const labels = [];
      const isToday = day.start <= t && t < day.end;
      if (isToday) cell.classList.add('today');
      else if (day.end <= t) cell.classList.add('past');
      const hols = urHolidaysOn(day);
      if (hols.length) {
        cell.classList.add('holiday');
        for (const h of hols) cell.append(el('span', 'lbl hol', h));
        labels.push(...hols);
      }
      const evs = eventsOn(day, events);
      if (evs.length) {
        cell.dataset.ev = evs.map((r) => r.id).join(' ');
        for (const r of evs) {
          const first = day.start <= r.start || day.day === 1 || day.weekDay === 0;
          if (first) cell.append(el('span', 'lbl', r.label));
          labels.push(r.label);
        }
      }
      if (world) {
        const run = featRunAt(day.start, anchor);
        const bar = el('i', `feat${run.n % 2 ? ' odd' : ''}`);
        bar.dataset.feat = run.feat;
        cell.append(bar);
        if (run.n !== prevRun) cell.append(el('span', 'lbl', run.title));
        prevRun = run.n;
        labels.push(`Feat: ${run.title}`);
      }
      const when = isToday ? CALENDAR_TEXT.today : aboutWhen(day.start, t);
      const tip = `${labels.length ? `${labels.join(', ')} (${when})` : when}. ${fmtLocal(day.start)}.`;
      cell.title = tip;
      cell.addEventListener('click', () => {
        for (const n of box.querySelectorAll('.cal-day.picked')) n.classList.remove('picked');
        cell.classList.add('picked');
        pick.textContent = `${day.day} ${m.name}: ${tip}`;
        // Under the month tapped, so a phone shows it where the finger is.
        if (pick.previousElementSibling !== sec) sec.after(pick);
      });
      grid.append(cell);
    }
    sec.append(grid);
    parts.push(sec);
  }
  box.replaceChildren(...parts);
  lastData = [...on, ...coming].map((r) => `${r.id}${r.on ? ':on' : ''}`).join(',');
}

function publish(engine) {
  engine?.setData?.('calendarOpen', box && !box.hidden ? '1' : '0');
  engine?.setData?.('calendarYear', shownYear == null ? '' : String(shownYear));
  engine?.setData?.('calendarEvents', lastData);
  const f = featsInfo(engine);
  engine?.setData?.('calendarFeat', f.mode === 'world' ? featTurns(now(), f.run, 0)[0].feat : 'solo');
}

/** Solo: the clock opens the Calendar (multiplayer: the hi sign board's button does). */
function bindClock(engine) {
  if (clockBound || typeof document === 'undefined' || engine?.mode === 'multiplayer') return;
  const clock = document.getElementById('dametime-clock');
  if (!clock) return;
  clockBound = true;
  clock.dataset.calendar = '';
  // A click on the clock leaves the keys with the world (js/ui/focus-return.js), so Space jumps.
  clock.dataset.clickReleases = '';
  clock.dataset.tip = CALENDAR_TEXT.clockTip;
  clock.setAttribute('tabindex', '0');
  clock.setAttribute('role', 'button');
  const toggle = () => (box && !box.hidden ? closeCalendar(engineRef) : openCalendar(engineRef));
  clock.addEventListener('click', toggle);
  clock.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle();
  });
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener(CALENDAR_EVENT, () => openCalendar(engineRef));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box && !box.hidden) closeCalendar(engineRef);
  });
  if (!document.getElementById('ur-calendar-clock-css')) {
    const style = document.createElement('style');
    style.id = 'ur-calendar-clock-css';
    // The nameplate lets clicks through to the street; the solo clock takes them for the Calendar.
    style.textContent = '.dametime-clock[data-calendar] { cursor: pointer; pointer-events: auto; }';
    document.head.append(style);
  }
}

export const calendarFeature = {
  id: CALENDAR_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    listen();
    bindClock(engine);
  },

  onStreetEnter(_street, engine) {
    engineRef = engine;
    bindClock(engine);
    if (engine.param?.('calendaropen') === '1' && !box) {
      const y = engine.param?.('calendaryear');
      openCalendar(engine, y != null && y !== '' ? Number(y) : null);
    }
  },
};
