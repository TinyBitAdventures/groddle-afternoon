import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STATION_COUNTER,
  STATION_DAYS,
  STATION_MAX_GAP_DAYS,
  STATION_QUEST,
  STATION_SECONDS,
  normalizeStationState,
  recordStationSession,
  stationMessage,
} from '../public/js/meditation-station.js?v=75b2cbf1';

const root = join(import.meta.dirname, '..', 'public');

function practise(state, day, seconds = 60, tsid = 'GA5101HF7F429V5') {
  return recordStationSession(state, { tsid, label: 'Empty Via 5', seconds, day });
}

describe('Meditation Station', () => {
  it('keeps the quest text numbers and source rewards', () => {
    assert.equal(STATION_DAYS, 11);
    assert.equal(STATION_MAX_GAP_DAYS, 6);
    assert.equal(STATION_SECONDS, 60);
    const def = JSON.parse(readFileSync(join(root, 'assets/content/quests.json'), 'utf8'))[STATION_QUEST];
    assert.match(def.desc, /at least once every 6 game days and meditate for 60 seconds\. Do so on 11 game days/);
    assert.deepEqual(def.rewards, { xp: 1000, currants: 500, energy: 50, favor: { 0: { giant: 'cosma', points: 100 } } });
    assert.equal(def.isRepeatable, true);
    assert.equal(STATION_COUNTER, 'meditation_station_days');
  });

  it('counts a game day once its sessions on the station street reach 60 seconds', () => {
    let r = practise(normalizeStationState(), 100, 25);
    assert.equal(r.counted, false);
    assert.equal(r.state.tsid, 'GA5101HF7F429V5');
    assert.match(stationMessage(r), /25 of 60 seconds today/);
    r = practise(r.state, 100, 40);
    assert.equal(r.counted, true);
    assert.equal(r.days, 1);
    r = practise(r.state, 100, 300);
    assert.equal(r.counted, false, 'one count per game day');
    assert.equal(r.days, 1);
  });

  it('ignores other streets while the practice holds', () => {
    let r = practise(normalizeStationState(), 10);
    r = practise(r.state, 12, 60, 'GIF1Q3IQM7122SP');
    assert.equal(r.wrongStreet, true);
    assert.equal(r.days, 1);
    assert.match(stationMessage(r), /Your meditation station is Empty Via 5/);
  });

  it('starts over after more than 6 game days, wherever you meditate next', () => {
    let r = practise(normalizeStationState(), 10);
    r = practise(r.state, 16);
    assert.equal(r.days, 2, 'six days later still counts');
    r = practise(r.state, 23, 60, 'GIF1Q3IQM7122SP');
    assert.equal(r.reset, true);
    assert.equal(r.state.tsid, 'GIF1Q3IQM7122SP');
    assert.equal(r.days, 1);
  });

  it('completes on the eleventh counted day', () => {
    let state = normalizeStationState();
    let r;
    for (let i = 0; i < 11; i += 1) {
      r = practise(state, 200 + i * 6);
      state = r.state;
    }
    assert.equal(r.days, 11);
    assert.equal(r.done, true);
    assert.match(stationMessage(r), /11 game days/);
  });

  it('normalizes hostile saves', () => {
    const s = normalizeStationState({ tsid: '<script>', days: 99, lastDay: 'x', todaySeconds: -4 });
    assert.equal(s.tsid, 'script');
    assert.equal(s.days, 11);
    assert.equal(s.lastDay, null);
    assert.equal(s.todaySeconds, 0);
    assert.deepEqual(normalizeStationState(null).days, 0);
  });
});
