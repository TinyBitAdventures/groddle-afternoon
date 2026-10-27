// G356: the Map teleports only as the original did (Teleport Here needs Teleportation IV, a visited
// street, the energy and no cooldown); a street click opens Set as Destination / Teleport Here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAP_TELEPORT_TEXT,
  MAP_TELEPORT_UNVISITED_OK,
  canMapTeleport,
  createTeleportState,
  mapTeleport,
  teleportEnergyCost,
} from '../public/js/teleportation.js?v=g356-1';

const T4 = ['teleportation_1', 'teleportation_2', 'teleportation_3', 'teleportation_4'];
const target = { tsid: 'LA9TARGET', label: 'Somewhere', hubId: '27' };
const ctx = (over = {}) => ({ learned: T4, energy: 100, tank: 100, currentTsid: 'LA9HERE', visited: true, now: 1000, ...over });

test('Teleport Here needs Teleportation IV: the remake has no tokens', () => {
  for (const learned of [[], ['teleportation_1'], ['teleportation_1', 'teleportation_2', 'teleportation_3']]) {
    const out = canMapTeleport(createTeleportState(), target, ctx({ learned }));
    assert.equal(out.ok, false);
    assert.equal(out.error, MAP_TELEPORT_TEXT.noSkill);
  }
  assert.equal(canMapTeleport(createTeleportState(), target, ctx()).ok, true);
});

test('only to a street you have visited (the rescue pig street excepted), not the one you are on', () => {
  assert.equal(canMapTeleport(createTeleportState(), target, ctx({ visited: false })).error, MAP_TELEPORT_TEXT.unvisited);
  assert.equal(canMapTeleport(createTeleportState(), { tsid: MAP_TELEPORT_UNVISITED_OK }, ctx({ visited: false })).ok, true);
  assert.equal(canMapTeleport(createTeleportState(), target, ctx({ currentTsid: target.tsid })).error, MAP_TELEPORT_TEXT.here);
});

test('the energy cost is the skill rank fraction; it must be more than the cost', () => {
  const cost = teleportEnergyCost(T4, 100);
  assert.equal(cost, 15);
  const short = canMapTeleport(createTeleportState(), target, ctx({ energy: cost }));
  assert.equal(short.ok, false);
  assert.equal(short.error, MAP_TELEPORT_TEXT.energy(cost));
  assert.equal(canMapTeleport(createTeleportState(), target, ctx({ energy: cost + 1 })).energyCost, cost);
});

test('a map teleport counts the day, starts the cooldown and records map events', () => {
  const out = mapTeleport(createTeleportState(), target, ctx());
  assert.equal(out.ok, true);
  assert.equal(out.state.mapTeleportsToday, 1);
  assert.equal(out.state.totals.map, 1);
  assert.ok(out.state.cooldownUntil > 1000);
  assert.deepEqual(out.events[0], { counter: 'teleportation_self:map', amount: 1 });
  const again = canMapTeleport(out.state, { tsid: 'LA9OTHER' }, ctx({ now: 1500 }));
  assert.equal(again.error, MAP_TELEPORT_TEXT.cooldown);
});

test('the daily map teleports run out', () => {
  const state = { ...createTeleportState(), mapTeleportsToday: 1000 };
  assert.equal(canMapTeleport(state, target, ctx()).error, MAP_TELEPORT_TEXT.outToday);
});

test('a street click on the Map opens the street menu, not travel', () => {
  const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
  const block = game.slice(game.indexOf("canvas.querySelectorAll('.map-street.travelable')"), game.indexOf("canvas.querySelectorAll('.map-street.current')"));
  assert.match(block, /openMapStreetMenu\(canvas, e,/);
  assert.match(block, /get\('maptravel'\) === 'free'/, 'free travel stays only behind the QA flag');
  const menu = game.slice(game.indexOf('function openMapStreetMenu'), game.indexOf('function closeMap()'));
  assert.match(menu, /'Set as Destination'/);
  assert.match(menu, /features\.query\('mapTeleport', 'check'/);
  assert.match(menu, /features\.query\('mapTeleport', 'go'/);
});
