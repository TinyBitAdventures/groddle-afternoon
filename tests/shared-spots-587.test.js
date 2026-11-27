/**
 * #587 (R43): on Indri Slope a salmon beside the Asura Spire signpost, then a second in the school to
 * its left, opened a menu with Pocket and the server refused it with "You need to be closer... out of
 * date", across reloads, while the player stood on it. Online, each page planned the street's rocks,
 * trees and nodes itself and named each by its plan index (resource-nodes-feature resourceSpawnPlan),
 * and the server checks reach from its own copy of that plan (data/objects.json). The page plans with
 * every feature's placement groups; the builder's copy stops at the resource nodes. A group after the
 * nodes still moves them: the planner reseats the nodes the front art hides (street-ecology.js
 * reseatHiddenNodes) clear of everything planned, and on Indri Slope the Qurazy marker group made it
 * seat npc_salmon:2 at the spot the server has for npc_salmon:3 (2480,1104.5), and npc_salmon:3 768 px
 * to its left. Batterflies, Visiting Stones and Heli Kitties do the same: the page's own plan drifts
 * from the server's on 27 of the 1,076 shared streets (23 before the wildlife catalog loads), and on
 * up to 46 with a player's own groups (a Funpickle find, a street job board). Since #680 (R43) the
 * planner moves a covered node before it plans the next group and the builder plans the page's groups,
 * so the page's own plan matches the server's too (tests/g1276-one-shared-plan.test.js).
 *
 * Glitch had one place for each shared item, the location's: the client drew what the server sent.
 * So online a rock, a street tree and a node stand at the snapshot's spot for their id ("spots",
 * objects.go placedBySnapshot), as the street animals already do (street-objects-feature
 * placeFromSnapshot, js/street-objects.js snapshotPlace), whatever this page's planner said.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createStreetCopy, snapshotPlace, takeObjs } from '../public/js/street-objects.js?v=7d1864e8';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=add76182';
import { moveEntity, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=52b79748';
import { createResourceNode } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { createMineRock } from '../public/js/mining.js?v=7ecaa572';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { ecologyForStreet, planStreetPlacements, populationForStreet, rockSpawnPlan, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=8f50537c';
import { FEATURES } from '../public/js/features/index.js?v=8b13e227';
import { setWildlifeCatalog } from '../public/js/wildlife.js?v=670c3a7f';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const INDRI = 'GUV2SSTOU8A30RS';

/** Drawn off the server's spot: more than its 0.1 px rounding (tools/build-realtime-objects.mjs r1). */
const apart = (p, spot) => Boolean(spot) && (Math.abs(p.x - spot[0]) > 0.11 || Math.abs(p.y - spot[1]) > 0.11);

/** A street's objects.json row as objects.go's snapshot gives it: { id: [x, y] } (placedBySnapshot). */
function serverSpots(row) {
  const out = {};
  for (const [i, , x, y] of row.rocks || []) out[`rock:${i}`] = [x, y];
  for (const [i, , x, y] of row.trees || []) out[`tree:${i}`] = [x, y];
  for (const [key, , x, y] of row.nodes || []) out[`node:${key}`] = [x, y];
  return out;
}

/**
 * The page's online plan as game.js enterStreet makes it: the core groups, then every feature's
 * placement groups (features.collect), the ones each player has the same (a Funpickle find and a
 * street job board are the player's own and left out here).
 */
function pagePlan(data) {
  const engine = { mode: 'multiplayer', param: () => null, query: () => null, setData() {}, homeContext: () => ({ inHome: false }), transientInstance: () => false };
  for (const f of FEATURES) if (typeof f.prepareStreet === 'function') f.prepareStreet(data, engine);
  const party = FEATURES.find((f) => f.id === 'party-spaces');
  const population = populationForStreet(data.tsid, party.ecologyOverride(data) || ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const groups = FEATURES.filter((f) => typeof f.placementGroups === 'function' && f.id !== 'resource-nodes')
    .flatMap((f) => f.placementGroups(population, data, engine) || []);
  const plan = planStreetPlacements(platformsScreen(data), [...placementRequests(population), ...groups], { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
  const placement = (key) => plan.groups[key] || [];
  return { population, nodes: resourceSpawnPlan(population, placement), rocks: rockSpawnPlan(population, placement('rocks'), data.tsid), trees: placement('trees') };
}

/** street-objects-feature on a street, with rocks, trees and nodes drawn where `plan` puts them. */
function rig(tsid, plan, population) {
  const listeners = new Map();
  const client = {
    state: 'online',
    wanted: tsid,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {};
    },
    send() { return true; },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  // game.js spawnMineRock: the root at the rock's spot; spawnTrees: the sprite 2 px under the planned spot.
  const rocks = plan.rocks.filter((p) => Number.isFinite(p.x)).map((p) => ({ classId: p.classTsid, sprite: { x: p.x, y: p.y }, state: { rock: createMineRock(p.classTsid) }, rockIndex: p.index }));
  const trees = plan.trees.map((p, i) => ({ classId: population.treeClasses[i], sprite: { x: p.x, y: p.y + 2 }, state: { maturity: 6, fruitCount: 0, health: 8 }, treeIndex: i }))
    .filter((t) => t.classId && t.classId !== 'wood_tree');
  // resource-nodes-feature's entities, moved by its own moveEntity.
  const entities = plan.nodes.map((n) => ({ ...n, node: createResourceNode(n.classTsid), view: { kind: 'ground', sprite: { x: n.x, y: n.y + 2 } }, target: { classId: n.classTsid, resourceKey: n.key } }));
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: tsid,
    inv: {},
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: [],
    interactables: [...rocks, ...trees],
    data: {},
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast() {},
    refreshRock() {},
    refreshTreeVisual() {},
    query(hook) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'streetResourceNodes') {
        return entities.map((e) => ({ key: e.key, classTsid: e.classTsid, node: e.node, target: e.target, refresh() {}, ready: () => true, reason: () => '', moveTo: (x, y) => moveEntity(e, x, y) }));
      }
      return null;
    },
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: tsid, players: [] });
  return { engine, client, rocks, trees, entities };
}

describe('#587 online, rocks, trees and nodes stand at the server\'s spot for their id', () => {
  it('snapshotPlace: the spot as the page holds it, nodes 2 px over their foot; nothing from an older server', () => {
    const copy = createStreetCopy();
    takeObjs(copy, { t: 'objs', street: 'S', snap: true, objs: [], spots: { 'rock:1': [100, 500], 'tree:0': [300, 602], 'node:npc_salmon:3': [2480, 1104.5], 'kitty:0': [5, 6] } });
    assert.deepEqual(snapshotPlace(copy, 'rock:1', 'rock'), { x: 100, y: 500 });
    assert.deepEqual(snapshotPlace(copy, 'tree:0', 'tree'), { x: 300, y: 602 });
    assert.deepEqual(snapshotPlace(copy, 'node:npc_salmon:3', 'node'), { x: 2480, y: 1102.5 });
    assert.equal(snapshotPlace(copy, 'kitty:0', 'kitty'), null, 'a walker walks from its spot its own way');
    assert.equal(snapshotPlace(copy, 'rock:2', 'rock'), null);
    const old = createStreetCopy();
    takeObjs(old, { t: 'objs', street: 'S', snap: true, objs: [] });
    assert.equal(snapshotPlace(old, 'rock:1', 'rock'), null);
  });

  it('moveEntity moves a node and the art drawn from it', () => {
    const ground = { x: 10, y: 20, view: { kind: 'ground', sprite: { x: 10, y: 22 } } };
    assert.deepEqual(moveEntity(ground, 30, 40), { x: 10, y: 20 });
    assert.deepEqual([ground.x, ground.y, ground.view.sprite.x, ground.view.sprite.y], [30, 40, 30, 42]);
    const wall = { x: 10, y: 20, wall: true, view: { kind: 'ground', sprite: { x: 10, y: 20 } } };
    moveEntity(wall, 30, 40);
    assert.deepEqual([wall.view.sprite.x, wall.view.sprite.y], [30, 40]);
    // A Salmon swims from entity.x each frame (placeSharedSalmon).
    const fish = { x: 10, y: 20, view: { kind: 'salmon', sprite: { x: 0, y: 0 } } };
    moveEntity(fish, 30, 40);
    assert.deepEqual([fish.x, fish.y], [30, 40]);
  });

  it('Indri Slope: the fish beside the Asura Spire signpost is npc_salmon:3, in reach where the player stood', { skip: skipWithoutServer }, async () => {
    setZoneStreetsShown(false);
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    const eco = JSON.parse(read('public/assets/content/street-ecology.json'));
    setStreetEcologyCatalog(eco);
    setWildlifeCatalog(eco);
    const objects = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    const data = await loadStreetDataFromFs(INDRI, join(root, 'public/assets/streets'));
    const plan = pagePlan(data);
    const { engine, client, entities } = rig(INDRI, plan, plan.population);
    const near = (x, y) => entities.filter((e) => Math.abs(e.x - x) <= 700 && Math.abs(e.y - y) <= 500);
    // Her report: 2472,1103. The server: npc_salmon:3 at 2480,1104.5.
    const fish = () => entities.reduce((a, e) => (Math.abs(e.x - 2472) < Math.abs(a.x - 2472) ? e : a));
    // R43 (#680): the page's own plan already has it there (one plan: a group after the nodes no longer
    // moves them, tests/g1276-one-shared-plan.test.js); the snapshot keeps it there.
    assert.equal(fish().key, 'npc_salmon:3', `the page plans ${fish().key} at 2472`);
    client.emit('msg:objs', { t: 'objs', street: INDRI, snap: true, objs: [], spots: serverSpots(objects[INDRI]) });
    streetObjectsFeature.onTick(16, 0, engine);
    assert.equal(fish().key, 'npc_salmon:3', `the fish at 2472 is ${fish().key}`);
    for (const e of entities) {
      const [x, y] = objects[INDRI].nodes.find((r) => r[0] === e.key).slice(2);
      assert.deepEqual([e.x, e.y + 2], [x, y], `${e.key} stands at the server's spot`);
    }
    assert.ok(near(2472, 1103).some((e) => e.key === 'npc_salmon:3'));
    assert.doesNotMatch(engine.data.streetObjectsPlaced || '', /node:npc_salmon/, 'no fish had to move');
  });

  it('every street the server shares: what a page draws is where the server checks reach', { skip: skipWithoutServer }, async () => {
    setZoneStreetsShown(false);
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    const eco = JSON.parse(read('public/assets/content/street-ecology.json'));
    setStreetEcologyCatalog(eco);
    setWildlifeCatalog(eco);
    const objects = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    const tsids = Object.keys(objects).filter((t) => STREET_INDEX.streets[t] && !isZoneTsid(t)).sort();
    let drifted = 0;
    const wrong = [];
    for (const tsid of tsids) {
      let data;
      try {
        data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      } catch {
        continue;
      }
      const plan = pagePlan(data);
      const row = objects[tsid];
      const { engine, client, rocks, trees, entities } = rig(tsid, plan, plan.population);
      const want = serverSpots(row);
      const off = () => [
        ...rocks.filter((t) => apart(t.sprite, want[`rock:${t.rockIndex}`])).map((t) => `rock:${t.rockIndex}`),
        ...trees.filter((t) => apart(t.sprite, want[`tree:${t.treeIndex}`])).map((t) => `tree:${t.treeIndex}`),
        ...entities.filter((e) => apart({ x: e.x, y: e.y + 2 }, want[`node:${e.key}`])).map((e) => `node:${e.key}`),
      ];
      if (off().length) drifted += 1;
      client.emit('msg:objs', { t: 'objs', street: tsid, snap: true, objs: [], spots: want });
      streetObjectsFeature.onTick(16, 0, engine);
      const still = off();
      if (still.length) wrong.push(`${tsid} ${data.label}: ${still.slice(0, 4).join(', ')}`);
    }
    // R43 (#680): the page's own plan now matches the server's but on the Party Space templates planned
    // here outside their party (tests/client-server-placement.test.js plans them inside it: no drift);
    // the snapshot puts them right.
    assert.ok(drifted >= 1, `the page's own plan drifts on ${drifted} streets`);
    console.log(`# the page's own plan drifts from the server on ${drifted} streets`);
    assert.deepEqual(wrong, [], `${wrong.length} streets draw a rock, tree or node off the server's spot\n${wrong.slice(0, 20).join('\n')}`);
  });
});
