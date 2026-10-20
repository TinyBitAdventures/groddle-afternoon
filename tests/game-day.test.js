/**
 * Official Dametime calendar, atmosphere, and new-day boundary.
 * Run: node --test tests/game-day.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_EPOCH_MS,
  GAME_MINUTE_MS,
  GAME_HOUR_MS,
  GAME_DAY_MS,
  GAME_YEAR_MS,
  DAY_NAMES,
  MONTH_NAMES,
  MONTH_LENGTHS,
  dametimeParts,
  formatDametime,
  getGameDayKey,
  getGameDayStartMs,
  timestampForGameHour,
  daylightState,
  shouldFireNewDay,
  setLastNewDayTs,
  resetGameDayClock,
  getLastNewDayTs,
  getLastNewDayKey,
  applyNewDayRefill,
  formatGameDayLabel,
  msUntilNewDay,
} from '../public/js/game-day.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

describe('official Glitch Dametime', () => {
  beforeEach(() => store.clear());

  it('uses the original accelerated units and irregular calendar', () => {
    assert.equal(GAME_MINUTE_MS, 10_000);
    assert.equal(GAME_HOUR_MS, 10 * 60_000);
    assert.equal(GAME_DAY_MS, 4 * 60 * 60_000);
    assert.equal(GAME_YEAR_MS, 308 * GAME_DAY_MS);
    assert.equal(MONTH_LENGTHS.reduce((sum, n) => sum + n, 0), 308);
    assert.deepEqual(DAY_NAMES, [
      'Hairday', 'Moonday', 'Twoday', 'Weddingday',
      'Theday', 'Fryday', 'Standday', 'Fabday',
    ]);
    assert.equal(MONTH_NAMES.at(-1), 'Recurse');
  });

  it('matches TimeController at the official epoch', () => {
    const p = dametimeParts(GAME_EPOCH_MS);
    assert.deepEqual(
      {
        year: p.year,
        month: p.month,
        monthDay: p.monthDay,
        weekDay: p.weekDay,
        hour24: p.hour24,
        minute: p.minute,
        time: p.time,
        ampm: p.ampm,
      },
      {
        year: 0,
        month: 'Primuary',
        monthDay: 1,
        weekDay: 'Hairday',
        hour24: 0,
        minute: 0,
        time: '12:00',
        ampm: 'AM',
      }
    );
    assert.equal(formatDametime(GAME_EPOCH_MS), 'midnight, 1st of Primuary, Year 0');
    assert.equal(formatGameDayLabel(GAME_EPOCH_MS), 'Hairday, the 1st of Primuary');
  });

  it('rolls game minutes, hours, weekdays, months, and years exactly', () => {
    let p = dametimeParts(GAME_EPOCH_MS + 13 * GAME_HOUR_MS + 7 * GAME_MINUTE_MS);
    assert.equal(`${p.time} ${p.ampm}`, '1:07 PM');

    p = dametimeParts(GAME_EPOCH_MS + GAME_DAY_MS);
    assert.equal(p.weekDay, 'Moonday');
    assert.equal(p.monthDay, 2);

    p = dametimeParts(GAME_EPOCH_MS + 29 * GAME_DAY_MS);
    assert.equal(p.month, 'Spork');
    assert.equal(p.monthDay, 1);

    p = dametimeParts(GAME_EPOCH_MS + GAME_YEAR_MS);
    assert.equal(p.year, 1);
    assert.equal(p.month, 'Primuary');
    assert.equal(p.monthDay, 1);
    // Official client uses 307 for weekday rotation.
    assert.equal(p.weekDay, 'Weddingday');
  });

  it('provides stable keys, starts, and deterministic visual QA hours', () => {
    const now = GAME_EPOCH_MS + 42 * GAME_DAY_MS + 17 * GAME_HOUR_MS + 4 * GAME_MINUTE_MS;
    const start = getGameDayStartMs(now);
    assert.equal(start, GAME_EPOCH_MS + 42 * GAME_DAY_MS);
    assert.equal(getGameDayKey(now), getGameDayKey(start));
    const dusk = timestampForGameHour(now, 19, 30);
    const p = dametimeParts(dusk);
    assert.equal(p.hour24, 19);
    assert.equal(p.minute, 30);
    assert.equal(getGameDayKey(dusk), getGameDayKey(now));
  });

  it('interpolates readable dawn/day/dusk/night atmosphere', () => {
    const at = (hour) => daylightState(timestampForGameHour(GAME_EPOCH_MS, hour));
    assert.equal(at(2).phase, 'night');
    assert.equal(at(6).phase, 'dawn');
    assert.equal(at(12).phase, 'day');
    assert.equal(at(19).phase, 'dusk');
    assert.ok(at(2).opacity > at(12).opacity);
    assert.ok(at(19).opacity > at(12).opacity);
    assert.match(at(19).cssColor, /^rgb\(/);
  });

  it('seeds once, then fires at official midnight rather than first-launch + 4h', () => {
    const dayStart = GAME_EPOCH_MS + 20 * GAME_DAY_MS;
    const firstVisit = dayStart + 23 * GAME_HOUR_MS;
    assert.equal(shouldFireNewDay(firstVisit), false);
    assert.equal(getLastNewDayTs(), firstVisit);
    assert.equal(getLastNewDayKey(), getGameDayKey(firstVisit));
    assert.equal(shouldFireNewDay(dayStart + GAME_DAY_MS - 1), false);
    assert.equal(shouldFireNewDay(dayStart + GAME_DAY_MS), true);
    setLastNewDayTs(dayStart + GAME_DAY_MS);
    assert.equal(shouldFireNewDay(dayStart + GAME_DAY_MS + 1), false);
  });

  it('migrates timestamp-only saves to official day keys', () => {
    const old = GAME_EPOCH_MS + 4 * GAME_DAY_MS + GAME_HOUR_MS;
    localStorage.setItem('groddle_last_new_day_ts', String(old));
    assert.equal(getLastNewDayKey(), '');
    assert.equal(shouldFireNewDay(old + GAME_HOUR_MS), false);
    assert.equal(getLastNewDayKey(), getGameDayKey(old));
    assert.equal(shouldFireNewDay(old + GAME_DAY_MS), true);
  });

  it('clears both calendar markers for a deterministic fresh game', () => {
    setLastNewDayTs(GAME_EPOCH_MS + GAME_DAY_MS);
    assert.ok(getLastNewDayTs());
    assert.ok(getLastNewDayKey());
    resetGameDayClock();
    assert.equal(getLastNewDayTs(), 0);
    assert.equal(getLastNewDayKey(), '');
  });

  it('counts down to the next official midnight', () => {
    const dayStart = GAME_EPOCH_MS + 8 * GAME_DAY_MS;
    assert.equal(msUntilNewDay(dayStart), GAME_DAY_MS);
    assert.equal(
      msUntilNewDay(dayStart + 23 * GAME_HOUR_MS + 59 * GAME_MINUTE_MS),
      GAME_MINUTE_MS
    );
  });

  it('refills energy and mood to top', () => {
    const pc = { energy: 12, mood: 40 };
    const result = applyNewDayRefill(pc);
    assert.equal(pc.energy, 100);
    assert.equal(pc.mood, 100);
    assert.equal(result.energyGained, 88);
    assert.equal(result.moodGained, 60);
  });
});

describe('Dametime client wiring', () => {
  it('renders a live clock, world-only tint, ticker updates, and deterministic QA', async () => {
    const { readFile } = await import('node:fs/promises');
    const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
    assert.match(html, /id="dametime-clock"/);
    assert.match(html, /id="daylight-overlay"/);
    assert.match(css, /\.daylight-overlay\s*\{/);
    assert.match(css, /pointer-events:\s*none/);
    assert.match(game, /updateDametimeChrome/);
    assert.match(game, /timedemo/);
    assert.match(game, /night:\s*23/);
    assert.match(game, /dametimeTickAccum/);
    assert.match(game, /resetGameDayClock/);
  });
});
