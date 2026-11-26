/**
 * The Calendar (register G800).
 * Source: glitch-client com/tinyspeck/engine/port/DateTimeDialog.as 131-160 (the Calendar button in
 * the clock's dialog), TSFrontController.as openCalendarPage 4353-4358 (/calendar/), the 2012
 * calendar page (Ur's year in eight-day weeks, holidays, Feats six Ur days long, real-world tips),
 * the developer docs' holiday list (gtg_developer_docs_time_.txt 130-149).
 * Remake: js/calendar.js, features/calendar-feature.js, features/hi-signs-feature.js (the board's
 * Calendar button), features/solo-feats-feature.js calendarFeats, classic/classic-topbar.js.
 * Run: node --test tests/calendar.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_TEXT,
  UR_HOLIDAYS,
  aboutWhen,
  calendarEvents,
  eventWindow,
  eventsOn,
  featRunAt,
  featTurns,
  featAnchor,
  fmtLocal,
  urDayOfYear,
  urHolidaysOn,
  urMidnight,
  urYear,
} from '../public/js/calendar.js?v=d8506d36';
import { GAME_DAY_MS, dametimeParts } from '../public/js/game-day.js?v=57fecfcb';
import { RUN_MS, runAt } from '../public/js/feats-mp.js?v=e1fc8239';
import { calendarSeasons, isDametimeZilloween } from '../public/js/seasons.js?v=5d8f545a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, '..', 'glitch-client');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// 11:10 pm Pacific on 2026-11-21, the night before Pot Luck Day.
const NOW = Date.parse('2026-11-22T07:10:00Z');

describe('Ur year, as the calendar page laid it out', () => {
  it('twelve months, 308 days, weeks of eight from Hairday, matching the clock', () => {
    const p = dametimeParts(NOW);
    const y = urYear(p.year);
    assert.equal(y.months.length, 12);
    assert.equal(y.months.reduce((n, m) => n + m.days.length, 0), 308);
    const today = y.months.flatMap((m) => m.days).find((d) => d.start <= NOW && NOW < d.end);
    assert.equal(today.month, p.month);
    assert.equal(today.day, p.monthDay);
    assert.equal(['Hairday', 'Moonday', 'Twoday', 'Weddingday', 'Theday', 'Fryday', 'Standday', 'Fabday'][today.weekDay], p.weekDay);
    assert.equal(today.end - today.start, GAME_DAY_MS);
  });

  it("names Glitch's holidays on their days (developer docs time 130-149)", () => {
    assert.deepEqual(UR_HOLIDAYS.map((h) => h.label), ['AlphCon', 'Lemadan', 'Pot Twoday', 'Root', 'Sprinkling', 'Croppaday', 'Belabor Day', 'Recurse Eve']);
    assert.deepEqual(urHolidaysOn({ month: 'Candy', day: 3 }), ['Root']);
    assert.deepEqual(urHolidaysOn({ month: 'Junuary', day: 17 }), ['Croppaday']);
    assert.deepEqual(urHolidaysOn({ month: 'Junuary', day: 16 }), []);
    assert.equal(urDayOfYear('Remember', 25), 231);
  });

  it('says how far off a day is in the page\'s words', () => {
    assert.equal(aboutWhen(NOW + 12 * 86_400_000, NOW), 'About 12 real world days from now');
    assert.equal(aboutWhen(NOW - 4 * 3_600_000, NOW), 'About 4 real world hours ago');
    assert.equal(aboutWhen(NOW + 60_000, NOW), 'About 1 real world minute from now');
    assert.equal(CALENDAR_TEXT.now(dametimeParts(NOW)).startsWith("Right at this very moment, it's "), true);
  });
});

describe('the events the remake runs, on their real dates', () => {
  it('Pot Luck Day starts at midnight on Ur\'s clock (Pacific) and is shown in your own zone', () => {
    const rows = calendarEvents(NOW);
    const pot = rows.find((r) => r.id === 'pot_luck_day');
    assert.equal(pot.on, false);
    assert.equal(pot.glitch, false, 'a Groddle original');
    assert.equal(pot.start, Date.parse('2026-11-22T08:00:00Z'));
    assert.equal(pot.end, Date.parse('2026-11-30T08:00:00Z'));
    assert.equal(fmtLocal(pot.start, { locale: 'en-US', timeZone: 'America/New_York' }), 'Sun, Nov 22, 3:00 AM');
    assert.equal(fmtLocal(pot.start, { locale: 'en-US', timeZone: 'Europe/London' }), 'Sun, Nov 22, 8:00 AM');
    assert.deepEqual(new Set(rows.map((r) => r.id)), new Set(['pot_luck_day', 'glitchmas', 'pi_day', 'zilloween', 'zilloween_ur', 'new_ur', 'new_ur_eve']));
    // Soonest first.
    assert.deepEqual(rows.map((r) => r.start), [...rows.map((r) => r.start)].sort((a, b) => a - b));
  });

  it('every window agrees with seasons.js, hour by hour, across a year', () => {
    const t0 = Date.parse('2026-01-01T00:30:00Z');
    for (let t = t0; t < t0 + 366 * 86_400_000; t += 3_600_000) {
      const on = new Set(calendarSeasons(t));
      for (const id of ['zilloween', 'glitchmas', 'pi_day', 'pot_luck_day', 'new_ur']) {
        const y = new Date(t).getUTCFullYear();
        const inside = [y - 1, y, y + 1].some((yy) => {
          const w = eventWindow(id, yy);
          return w.start <= t && t < w.end;
        });
        assert.equal(inside, on.has(id), `${id} at ${new Date(t).toISOString()}`);
      }
    }
  });

  it("Ur's own Zilloween is Remember 25 to 37, as isDametimeZilloween", () => {
    const z = calendarEvents(NOW).find((r) => r.id === 'zilloween_ur');
    assert.equal(isDametimeZilloween(dametimeParts(z.start)), true);
    assert.equal(isDametimeZilloween(dametimeParts(z.start - 1)), false);
    assert.equal(isDametimeZilloween(dametimeParts(z.end - 1)), true);
    assert.equal(isDametimeZilloween(dametimeParts(z.end)), false);
    assert.equal(z.end - z.start, 13 * GAME_DAY_MS);
  });

  it('marks the Ur days an event covers', () => {
    const rows = calendarEvents(NOW);
    const pot = rows.find((r) => r.id === 'pot_luck_day');
    assert.deepEqual(eventsOn({ start: pot.start, end: pot.start + GAME_DAY_MS }, rows).map((r) => r.id), ['pot_luck_day']);
    assert.deepEqual(eventsOn({ start: pot.start - GAME_DAY_MS, end: pot.start }, rows), []);
  });

  it('a standard-time boundary keeps midnight', () => {
    assert.equal(urMidnight(2026, 3, 8), Date.parse('2026-03-08T08:00:00Z'));
    assert.equal(urMidnight(2026, 3, 9), Date.parse('2026-03-09T07:00:00Z'));
    assert.equal(urMidnight(2026, 11, 31), urMidnight(2026, 12, 1));
  });
});

describe('the Feats', () => {
  it('online: one a real day in the server\'s order, six Ur days each, from today\'s run', () => {
    const turns = featTurns(NOW, null, 6);
    const r = runAt(NOW);
    assert.equal(turns[0].feat, r.feat);
    assert.equal(turns[0].start, r.start);
    assert.equal(RUN_MS, 6 * GAME_DAY_MS);
    for (let i = 1; i < turns.length; i += 1) {
      assert.equal(turns[i].start, turns[i - 1].end);
      assert.equal(turns[i].feat, runAt(turns[i].start).feat);
    }
  });

  it('online: follows the run the server sent when its order was moved', () => {
    const r = runAt(NOW);
    const other = runAt(NOW + 3 * RUN_MS).feat;
    const anchor = featAnchor(NOW, { feat: other, start: r.start, end: r.end });
    assert.equal(featRunAt(NOW, anchor).feat, other);
    assert.equal(featRunAt(NOW + RUN_MS, anchor).feat, runAt(NOW + 4 * RUN_MS).feat);
  });

  it('the Feat feature answers calendarFeats in both modes', () => {
    const src = read('public/js/features/solo-feats-feature.js');
    assert.match(src, /calendarFeats\(\) \{/);
    assert.match(src, /return \{ mode: 'world', run: /);
    assert.match(src, /return \{ mode: 'solo', rows: featRows\(state\)/);
  });
});

describe('where the Calendar opens', () => {
  it("Glitch's clock dialog had a Calendar button", { skip: !existsSync(client) }, () => {
    const as = readFileSync(join(client, 'com/tinyspeck/engine/port/DateTimeDialog.as'), 'utf8');
    assert.match(as, /label: 'Calendar'/);
    assert.match(as, /openCalendarPage/);
  });

  it('the hi sign board (the clock dialog online) has one; solo the clock opens it; Classic passes the click on', () => {
    assert.match(read('public/js/features/hi-signs-feature.js'), /new CustomEvent\('groddle:calendar'\)/);
    const feature = read('public/js/features/calendar-feature.js');
    assert.match(feature, /export const CALENDAR_EVENT = 'groddle:calendar'/);
    assert.match(feature, /engine\?\.mode === 'multiplayer'\) return;/);
    assert.match(read('public/js/classic/classic-topbar.js'), /clock\?\.dataset\.calendar !== undefined/);
    assert.match(read('public/js/features/index.js'), /FEATURES\.push\(calendarFeature\)/);
  });
});
