/**
 * The 11 Ticket to Paradise a day count in game days, as Glitch's did
 * (items/paradise_ticket.js 154 stats_get_daily_counter; players/inc_achievements.js
 * 14-19 resets the counters on current_day_key(), the four-hour game day).
 * Run: node --test tests/paradise-game-day.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARADISE_DAILY_LIMIT,
  activateParadiseTicket,
  createParadiseState,
  normalizeParadiseState,
  paradiseDayKey,
} from '../public/js/paradise-flight.js?v=6d8739e1';
import { GAME_DAY_MS, getGameDayKey, getGameDayStartMs } from '../public/js/game-day.js?v=cf9afac0';

const opts = (now) => ({ imagination: 999999, quoinMultiplier: 1, now });

test('the day key is the game day', () => {
  const now = Date.UTC(2026, 10, 12, 13, 5);
  assert.equal(paradiseDayKey(now), `game-${getGameDayKey(now)}`);
  const start = getGameDayStartMs(now);
  assert.equal(paradiseDayKey(start), paradiseDayKey(start + GAME_DAY_MS - 1));
  assert.notEqual(paradiseDayKey(start), paradiseDayKey(start + GAME_DAY_MS));
});

test('a full day of tickets opens again on the next game day, not the next calendar day', () => {
  const start = getGameDayStartMs(Date.UTC(2026, 10, 12, 13, 5));
  const state = createParadiseState({}, start);
  for (let i = 0; i < PARADISE_DAILY_LIMIT; i += 1) {
    assert.equal(activateParadiseTicket(state, 'cloud_rings', opts(start + i)).ok, true);
  }
  assert.equal(activateParadiseTicket(state, 'cloud_rings', opts(start + GAME_DAY_MS - 1)).reason, 'daily_limit');
  const next = start + GAME_DAY_MS;
  assert.equal(activateParadiseTicket(state, 'cloud_rings', opts(next)).ok, true);
  assert.equal(state.ticketsToday, 1);
});

test("an older save's calendar-day count cannot hold back the game day", () => {
  const now = Date.UTC(2026, 10, 12, 13, 5);
  const calendarKey = new Date(now).toISOString().slice(0, 10);
  const state = normalizeParadiseState({ dayKey: calendarKey, ticketsToday: PARADISE_DAILY_LIMIT }, now);
  assert.equal(state.ticketsToday, 0);
  assert.equal(state.dayKey, paradiseDayKey(now));
  assert.equal(activateParadiseTicket(state, 'cloud_rings', opts(now)).ok, true);
});
