/**
 * Happy New Ur (register G1195; research/seasonal/new-year-plan.md, Austin's picks 2026-11-23):
 * the season, the six Groddle midnights of December 31 worked out from the game clock (never a UTC
 * time written down), the big one nearest 1 PM Pacific, the countdown's phases, the "Happy New Ur!"
 * New Day screen, the free trip, the Calendar's countdown row, the save's hooks for the keepsake and
 * badge, the QA clock, the wiring in game.js, and the server's lines (new_ur.go).
 * Run: node --test tests/new-ur.test.js (GRODDLE_SERVER_DIR=<server worktree> for the server check)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIG_HOUR,
  NEW_UR_NOTICES,
  NEW_UR_TEXT,
  NEW_UR_TIMING,
  PARTY_STREET,
  bigMidnight,
  bigNumber,
  countdownLeft,
  createNewUrState,
  firstUrDay,
  hatsOn,
  isNewUrEve,
  newDayDress,
  newUrMidnights,
  newUrMoment,
  partyTripOpen,
  qaClockOffset,
  recordMidnight,
  takeTrip,
} from '../public/js/new-ur.js?v=cec82e41';
import { GAME_DAY_MS, dametimeParts, getGameDayStartMs } from '../public/js/game-day.js?v=57fecfcb';
import { SEASONS, SEASONAL_STOCK, activeSeasons, daysLeft, seasonYearKey } from '../public/js/seasons.js?v=5d8f545a';
import { calendarEvents, midnightsLine, newUrEve } from '../public/js/calendar.js?v=d8506d36';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const pacificHour = (t) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric' }).format(new Date(t)));
const pacificDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(t));

const BIG_2026 = bigMidnight(2026).at;

describe('the six Groddle midnights of December 31', () => {
  it('are game-day starts, four real hours apart, all on December 31 on Ur\'s clock', () => {
    for (const y of [2026, 2027, 2028, 2035]) {
      const ms = newUrMidnights(y);
      assert.equal(ms.length, 6, `${y}`);
      ms.forEach((m, i) => {
        assert.equal(getGameDayStartMs(m.at), m.at, 'a new game day starts there');
        assert.equal(pacificDay(m.at), `${y}-12-31`);
        assert.equal(m.index, i + 1);
        if (i) assert.equal(m.at - ms[i - 1].at, GAME_DAY_MS);
      });
      assert.deepEqual(ms.map((m) => pacificHour(m.at)), [1, 5, 9, 13, 17, 21]);
      assert.equal(ms.filter((m) => m.big).length, 1);
      assert.equal(pacificHour(bigMidnight(y).at), BIG_HOUR, 'the big one is nearest 1 PM Pacific');
    }
  });

  it('puts 2026\'s big midnight at 1 PM Pacific, 21:00 UTC: the 10th of Candy, Year 126 (plan section 2)', () => {
    assert.equal(new Date(BIG_2026).toISOString(), '2026-12-31T21:00:00.000Z');
    const p = dametimeParts(BIG_2026);
    assert.deepEqual([p.year, p.month, p.monthDay, p.hour24, p.minute], [126, 'Candy', 10, 0, 0]);
    // The 5 PM one opens Glitch's Sprinkling (Candy 11) in 2026.
    assert.equal(dametimeParts(newUrMidnights(2026)[4].at).monthDay, 11);
  });

  it('writes no UTC time down: every time comes from the game clock and Ur\'s calendar', () => {
    const src = read('public/js/new-ur.js');
    assert.doesNotMatch(src, /T\d\d:\d\d|Date\.UTC\(\s*20\d\d/);
    assert.doesNotMatch(read('public/js/features/new-ur-feature.js'), /T\d\d:\d\d|Date\.UTC\(/);
  });
});

describe('the countdown', () => {
  it('runs one game hour before each midnight, then big, 10..4, the 321, the show and the big one\'s party', () => {
    const at = (d) => newUrMoment(BIG_2026 + d);
    assert.equal(at(-NEW_UR_TIMING.leadMs - 1).phase, 'none');
    assert.equal(at(-NEW_UR_TIMING.leadMs).phase, 'lead');
    assert.equal(at(-60_000).phase, 'big');
    assert.equal(at(-10_000).phase, 'ten');
    assert.equal(at(-3_000).phase, 'three');
    assert.equal(at(0).phase, 'show');
    assert.equal(at(NEW_UR_TIMING.showMs).phase, 'party');
    assert.equal(at(NEW_UR_TIMING.partyMs).phase, 'none');
    assert.equal(at(-5000).midnight.index, 4);
    assert.equal(at(-5000).midnight.big, true);
    // Another midnight has the show and no party.
    const first = newUrMidnights(2026)[0].at;
    assert.equal(newUrMoment(first + NEW_UR_TIMING.showMs - 1).phase, 'show');
    assert.equal(newUrMoment(first + NEW_UR_TIMING.showMs).phase, 'none');
    // An ordinary Groddle midnight has none of it.
    assert.equal(newUrMoment(BIG_2026 - 7 * 86_400_000).phase, 'none');
    assert.equal(newUrMoment(newUrMidnights(2026)[5].at + GAME_DAY_MS).phase, 'none');
  });

  it('says the time left, and the big numbers 10 to 4', () => {
    assert.equal(countdownLeft(592_000), '9:52');
    assert.equal(countdownLeft(1), '0:01');
    assert.equal(countdownLeft(0), '0:00');
    assert.equal(NEW_UR_TEXT.countdown('9:52'), 'Happy New Ur in 9:52');
    assert.deepEqual([10_000, 9_500, 4_000, 3_000, 11_000].map(bigNumber), [10, 10, 4, null, null]);
  });

  it('lands the 321 overlay\'s GO on midnight and fires the fireworks on the loneliness party\'s rhythm', () => {
    assert.equal(NEW_UR_TIMING.threeMs, 3000);
    assert.deepEqual(NEW_UR_TIMING.fireworks.map((f) => [f.at, f.key]), [[0, 'fireworks_1'], [4000, 'fireworks_2'], [8000, 'fireworks_3']]);
    assert.ok(NEW_UR_TIMING.partyFireworks.length === 3, 'twice over on the party street');
  });
});

describe('the Happy New Ur New Day screen', () => {
  it('dresses a day that starts at a New Ur midnight, not an ordinary one', () => {
    const d = newDayDress(BIG_2026 + 1500, () => 0);
    assert.equal(d.title, 'HAPPY NEW UR!');
    assert.equal(d.line, 'Out with the old, in with the Ur!');
    assert.equal(d.activity, 'Happy New Ur! Year 126, Candy the 10th.');
    assert.equal(d.date, dametimeParts(BIG_2026).stringDayMonth);
    assert.equal(d.big, true);
    assert.equal(newDayDress(newUrMidnights(2026)[0].at + 1000)?.index, 1);
    assert.equal(newDayDress(BIG_2026 + NEW_UR_TIMING.dressMs), null);
    assert.equal(newDayDress(BIG_2026 - 7 * 86_400_000), null);
    for (const s of Object.values(NEW_UR_TEXT).filter((v) => typeof v === 'string')) assert.doesNotMatch(s, /\u2014/);
  });

  it('game.js asks for the dress and puts its title, refill line and bubble line on the screen', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('async function maybeNewDay('), game.indexOf('function movementNow()'));
    assert.match(fn, /const dress = features\.query\('newDayDress', engine\) \|\| null;/);
    assert.match(fn, /titleEl\.textContent = dress\?\.title \|\| 'A NEW DAY';/);
    assert.match(fn, /dateEl\.textContent = dress\?\.date \|\| formatGameDayLabel\(\);/);
    assert.match(fn, /el\.classList\.toggle\('is-new-ur', Boolean\(dress\)\);/);
    assert.match(game, /function showNewDayBubble\(refill = \{\}, line = ''\)/);
    assert.match(game, /runNewDay: \(opts = \{\}\) => maybeNewDay\(\{ force: true, \.\.\.opts \}\),/);
    assert.match(read('public/js/features/index.js'), /import \{ newUrFeature \} from '\.\/new-ur-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(newUrFeature\);/);
  });
});

describe('the party street and the free trip', () => {
  it('is Unnu Slight, dressed all December 31, with one trip from an hour before the big midnight to an hour after', () => {
    assert.equal(PARTY_STREET, 'GIFUNGIBHQ1243A');
    assert.ok(existsSync(join(ROOT, `public/assets/streets/${PARTY_STREET}.json`)));
    assert.equal(JSON.parse(read(`public/assets/streets/${PARTY_STREET}.json`)).label, 'Unnu Slight');
    assert.equal(isNewUrEve(newUrMidnights(2026)[0].at), true);
    assert.equal(isNewUrEve(newUrMidnights(2026)[5].at + GAME_DAY_MS), false);
    assert.equal(partyTripOpen(BIG_2026 - NEW_UR_TIMING.leadMs), true);
    assert.equal(partyTripOpen(BIG_2026 + NEW_UR_TIMING.partyMs - 1), true);
    assert.equal(partyTripOpen(BIG_2026 + NEW_UR_TIMING.partyMs), false);
    assert.equal(partyTripOpen(newUrMidnights(2026)[0].at - 1000), false, 'only the big one');
    const s = createNewUrState();
    assert.equal(takeTrip(s, 2026), true);
    assert.equal(takeTrip(s, 2026), false);
    assert.equal(takeTrip(s, 2027), true);
  });
});

describe('hooks for the later pieces', () => {
  it('records each midnight seen, once, for the keepsake and badge', () => {
    const s = createNewUrState();
    const [m1, , , m4] = newUrMidnights(2026);
    assert.deepEqual(recordMidnight(s, m4), { fresh: true, count: 1, first: true });
    assert.deepEqual(recordMidnight(s, m4), { fresh: false, count: 1, first: false });
    assert.deepEqual(recordMidnight(s, m1), { fresh: true, count: 2, first: false });
    assert.deepEqual(createNewUrState(JSON.parse(JSON.stringify(s))).seen, { 2026: [1, 4] });
    assert.deepEqual(createNewUrState({ seen: { 2026: [9, 'x', 2], bad: [1] }, trips: ['2026', 'x'] }), { seen: { 2026: [2] }, trips: ['2026'] });
  });

  it('fills the stock and keeps the batterflies\' and hats\' clocks (tests/new-ur-party.test.js tests the pieces)', () => {
    assert.deepEqual(SEASONAL_STOCK.new_ur.toys.map((o) => o.classTsid), ['confetti_popper']);
    assert.equal(firstUrDay(BIG_2026), true);
    assert.equal(firstUrDay(BIG_2026 + GAME_DAY_MS), false);
    assert.equal(firstUrDay(BIG_2026 - 1), false);
    assert.equal(hatsOn(BIG_2026), true);
    assert.equal(hatsOn(Date.parse('2027-01-01T20:00:00Z')), true);
    assert.equal(hatsOn(Date.parse('2027-01-02T20:00:00Z')), false);
  });
});

describe('the dragon\'s glow', () => {
  it('sits in the stone dragon\'s mouth, where Tiny Speck\'s lit Unnu Slight template lights it', async () => {
    const { DRAGON_AT } = await import('../public/js/new-ur.js?v=cec82e41');
    // The lit patch of "Unnu Slight (dragon)" (3000 x 1600, the street's own size) has its middle at (642, 1059).
    assert.ok(Math.abs(DRAGON_AT.x - 642) <= 20 && Math.abs(DRAGON_AT.y - 1059) <= 20, JSON.stringify(DRAGON_AT));
    const street = JSON.parse(read('public/assets/streets/GIFUNGIBHQ1243A.json'));
    assert.deepEqual([street.bounds.r - street.bounds.l, street.bounds.b - street.bounds.t], [3000, 1600]);
  });
});

describe('the season and the Calendar', () => {
  it('is a designed season, Dec 26 to Jan 3, keyed to the December it began in', () => {
    assert.equal(SEASONS.new_ur.label, 'Happy New Ur');
    assert.equal(SEASONS.new_ur.source, 'designed');
    assert.deepEqual(activeSeasons(Date.parse('2026-12-31T20:00:00Z')).primary, 'new_ur');
    assert.deepEqual(activeSeasons(Date.parse('2026-06-01T20:00:00Z'), { override: 'new_ur' }).ids, ['new_ur']);
    assert.equal(seasonYearKey('new_ur', Date.parse('2027-01-02T20:00:00Z')), 'new_ur:2026');
    assert.equal(daysLeft('new_ur', Date.parse('2026-12-31T20:00:00Z')), 3);
  });

  it('shows the countdown day with its six midnights in your own time, the big one marked', () => {
    const now = Date.parse('2026-11-23T20:00:00Z');
    const eve = newUrEve(now);
    assert.equal(eve.id, 'new_ur_eve');
    assert.equal(eve.on, false);
    assert.equal(eve.label, 'Happy New Ur countdown');
    assert.equal(eve.midnights.length, 6);
    assert.ok(calendarEvents(now).some((r) => r.id === 'new_ur_eve'));
    assert.equal(midnightsLine(eve.midnights, { locale: 'en-US', timeZone: 'America/Los_Angeles' }),
      'Groddle midnights: 1:00 AM, 5:00 AM, 9:00 AM, 1:00 PM (the party), 5:00 PM, 9:00 PM');
    assert.equal(midnightsLine(eve.midnights, { locale: 'en-US', timeZone: 'Europe/London' }),
      'Groddle midnights: 9:00 AM, 1:00 PM, 5:00 PM, 9:00 PM (the party), 1:00 AM, 5:00 AM');
    // On the day it is on; the day after, next year's.
    assert.equal(newUrEve(BIG_2026).on, true);
    assert.equal(newUrEve(Date.parse('2027-01-01T20:00:00Z')).start > BIG_2026 + 300 * 86_400_000, true);
  });
});

describe('QA', () => {
  it('?newurmidnight=k&newurlead=s moves the show\'s clock to s seconds before midnight k of the eve', () => {
    const now = Date.parse('2026-11-23T20:00:00Z');
    const date = Date.parse('2026-12-31T20:00:00Z');
    for (let k = 1; k <= 6; k += 1) {
      const off = qaClockOffset({ midnight: String(k), lead: '15', date }, now);
      assert.equal(now + off, newUrMidnights(2026)[k - 1].at - 15_000);
      assert.equal(newUrMoment(now + off).phase, 'big');
    }
    assert.equal(qaClockOffset({ midnight: '4', date }, now) + now, BIG_2026 - 20_000, 'lead defaults to 20 s');
    assert.equal(qaClockOffset({ midnight: '' }, now), 0);
    assert.equal(qaClockOffset({ midnight: '7' }, now), 0);
  });
});

describe('the server keeps every player on one clock (new_ur.go)', () => {
  const dir = process.env.GRODDLE_SERVER_DIR || join(ROOT, '..', 'groddle-afternoon-server');
  const file = join(dir, 'new_ur.go');
  it('says the game\'s Global lines word for word and sends new_ur with its now', { skip: !existsSync(file) && 'no server checkout' }, () => {
    const go = readFileSync(file, 'utf8');
    for (const n of NEW_UR_NOTICES) assert.ok(go.includes(`"${n.text}"`), n.text);
    assert.match(go, /newUrBigHour = 13/);
    assert.match(go, /newUrEpoch = 1238562000/);
    assert.match(go, /"t": "new_ur", "now": /);
    assert.match(go, /r\.Handle\("new_ur_sync"/);
    for (const n of NEW_UR_NOTICES) assert.doesNotMatch(n.text, /\u2014/);
  });
});
