/**
 * Ticket 238: a player who logged out at 0 energy logs in on a new game day and is refilled,
 * not croaked. Glitch ran checkNewGameDay first at login (players/player.js 187, 854-879) and a
 * player still dead at a new day was resurrected and then given doNewDay's full tanks (862-865,
 * 891-895).
 * Run: node --test tests/hell-new-day-first.test.js
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHellState, croak, hellNewDay, shouldCroak } from '../public/js/hell.js?v=87b075a8';
import { GAME_DAY_MS, getGameDayStartMs, newDayPending, setLastNewDayTs } from '../public/js/game-day.js?v=a7e262aa';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const DAY0 = getGameDayStartMs(Date.UTC(2026, 10, 12, 12)) + GAME_DAY_MS / 2;
const DAY1 = DAY0 + GAME_DAY_MS;
const STREET = { streetTsid: 'GLI2V0UN7RD1T2J', hubId: '', x: 1840, y: 905 };
const pc = (energy = 0, mood = 0) => ({ energy, mood, energyMax: 100, moodMax: 100, activeBuffs: [] });

describe('the new day comes before the croak', () => {
  beforeEach(() => store.clear());

  it('newDayPending is true only when a past day is acknowledged, and seeds nothing', () => {
    assert.equal(newDayPending(DAY1), false);
    assert.equal(store.size, 0);
    setLastNewDayTs(DAY0);
    assert.equal(newDayPending(DAY0 + 1000), false);
    assert.equal(newDayPending(DAY1), true);
  });

  it('shouldCroak holds at 0 energy while the new day waits, and croaks once it has run', () => {
    const state = createHellState();
    assert.equal(shouldCroak(pc(0), state, { ...STREET, now: DAY1, newDayPending: true }), false);
    assert.equal(shouldCroak(pc(0), state, { ...STREET, now: DAY1, newDayPending: false }), true);
  });

  it('a player still dead at the new day keeps its refill when resurrected', () => {
    const dead = croak(createHellState(), { ...STREET, now: DAY0, rng: () => 0 }).state;
    const day = hellNewDay(dead, pc(100, 100), DAY1);
    assert.equal(day.resurrection.ok, true);
    assert.equal(day.state.isDead, false);
    assert.equal(day.effects.some((effect) => effect.type === 'metabolics'), false);
    assert.ok(day.effects.some((effect) => effect.type === 'teleport'));
  });

  it('the hell feature asks the engine, and game.js answers from game-day.js', () => {
    const feature = readFileSync(new URL('../public/js/features/hell-feature.js', import.meta.url), 'utf8');
    assert.match(feature, /newDayPending: engine\.newDayPending\?\.\(now\) === true/);
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(game, /newDayPending: \(now\) => newDayPending\(now\)/);
  });
});
