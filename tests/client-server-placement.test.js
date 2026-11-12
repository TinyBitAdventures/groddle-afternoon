/**
 * Reports #222, #224, #226, #232 (2026-11-12): "I need to be closer" while standing at the thing.
 * The realtime server checks a verb on a rock, tree, node or street animal against ITS spot
 * (data/objects.json, built by tools/build-realtime-objects.mjs) and a garden plot against its bed
 * (data/gardens.json); the page draws each thing at the spot ITS planner gave (game.js enterStreet).
 * When the two drift (v0.27.2 moved 68 streets' objects while v0.33.1 pages still had the old
 * spots, #224 and #226), the player stands at a thing the server thinks is elsewhere.
 *
 * This lays out every street the way game.js does, reading game.js's own planner call (its groups,
 * counts, clearances and options, not the builder's copy of them), and compares each shared
 * object's spot with the server's files: a drift fails here with the list of streets and things.
 * The server files skip when that repo is not beside this one (tools/repos.mjs).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=26dabe26';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=0d173b95';
import { FEATURES } from '../public/js/features/index.js?v=ed630928';
import { streetGardenBed } from '../public/js/garden.js?v=788f2dbb';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const game = read('public/game.js');

/** game.js enterStreet's planner call, from `currentStreetPlacement = planStreetPlacements(` to its options. */
function plannerCall() {
  const at = game.indexOf('currentStreetPlacement = planStreetPlacements(');
  assert.ok(at > 0, 'game.js enterStreet plans the street with planStreetPlacements');
  return game.slice(at, game.indexOf('const placement = (key) => currentStreetPlacement.groups[key]', at));
}

/**
 * The core groups game.js asks for, as functions of the street's population: each
 * `{ key: 'k', count: currentStreetPopulation.<field>[.length | ? 1 : 0], clearance: N }`.
 */
function clientCoreGroups() {
  const call = plannerCall();
  const core = call.slice(0, call.indexOf("...features.collect('placementGroups'"));
  const rows = [...core.matchAll(/\{ key: '([a-zA-Z]+)', count: ([^,]+), clearance: (\d+) \}/g)];
  assert.ok(rows.length >= 13, `read ${rows.length} planner groups from game.js`);
  return rows.map(([, key, expr, clearance]) => {
    if (/^\d+$/.test(expr.trim())) return { key, count: () => Number(expr), clearance: Number(clearance) };
    const m =/^currentStreetPopulation\.(\w+)(\.length| \? 1 : 0)?$/.exec(expr.trim());
    assert.ok(m, `game.js count for ${key} reads the street's population: ${expr}`);
    const [, field, tail] = m;
    const count = (pop) => {
      const v = pop[field];
      if (tail === '.length') return v.length;
      if (tail) return v ? 1 : 0;
      return v;
    };
    return { key, count, clearance: Number(clearance) };
  });
}

/** The page's layout of one street: planner groups (game.js) and its resource nodes (resource-nodes-feature). */
function clientLayout(data, core, nodesFeature) {
  const population = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
  const requests = [
    ...core.map((g) => ({ key: g.key, count: g.count(population), clearance: g.clearance })),
    // features.collect('placementGroups'): resource-nodes is the first feature with groups, and
    // the groups after it never move the ones before (the planner seats each group in order).
    ...nodesFeature.placementGroups(population),
  ];
  // game.js: WORLD_W = streetWidth(data); no saved-arrival spot online.
  const plan = planStreetPlacements(platformsScreen(data), requests, { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
  const placement = (key) => plan.groups[key] || [];
  return { population, placement, nodes: resourceSpawnPlan(population, placement) };
}

const r1 = (n) => Math.round(n * 10) / 10;
const at = (p) => (p ? `${r1(p.x)},${r1(p.y)}` : 'none');

/** Where the page draws a shared thing and where the server has it differ (x exactly, y by the 2 px foot drop). */
function differs(p, x, y, dy = 2) {
  return !p || r1(p.x) !== x || Math.abs(r1(p.y + dy) - y) > 0.11;
}

describe('the page lays out each street where the realtime server checks reach', () => {
  let objects;
  let gardens;
  let core;
  let nodesFeature;
  before(() => {
    if (skipWithoutServer) return;
    setZoneStreetsShown(false);
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    objects = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    gardens = JSON.parse(readFileSync(serverPath('data/gardens.json'), 'utf8')).streets;
    core = clientCoreGroups();
    nodesFeature = FEATURES.find((f) => typeof f.placementGroups === 'function');
  });

  it('game.js plans with the inputs the server\'s builder uses', () => {
    const call = plannerCall();
    assert.match(call, /\{ worldW: WORLD_W, seed: data\.tsid, reserved \}\s*\);\s*$/);
    assert.match(game, /WORLD_W = streetWidth\(data\);[\s\S]{0,6000}currentStreetPopulation = populationForStreet\(data\.tsid, ecologyEntry, \{\s*starter: data\.tsid === STREET_INDEX\.default,\s*\}\);/);
    assert.match(game, /const reserved = streetReservedSpots\(data\);[\s\S]{0,400}if \(GAME_MODE !== 'multiplayer' && Number\.isFinite\(opts\.spawnX\)/);
    assert.equal(FEATURES.find((f) => typeof f.placementGroups === 'function').id, 'resource-nodes');
  });

  it('every street: rocks, trees, nodes, Piggies, Chickens, Butterflies and garden beds', { skip: skipWithoutServer }, async () => {
    const tsids = Object.keys(STREET_INDEX.streets).filter((t) => !isZoneTsid(t)).sort();
    const drift = [];
    let checked = 0;
    for (const tsid of tsids) {
      let data;
      try {
        data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      } catch {
        continue;
      }
      const { placement, nodes } = clientLayout(data, core, nodesFeature);
      const want = objects[tsid] || {};
      const bad = [];
      const rows = (kind, group, dy = 2) => {
        const pts = placement(group);
        for (const row of want[kind] || []) {
          const [i] = row;
          const [x, y] = kind === 'rocks' || kind === 'trees' ? row.slice(2, 4) : row.slice(1, 3);
          if (differs(pts[i], x, y, dy)) bad.push(`${kind[0] === 'b' ? 'butterfly' : kind.slice(0, -1)}:${i} page ${at(pts[i])} server ${x},${y}`);
        }
      };
      rows('rocks', 'rocks', 0);
      rows('trees', 'trees');
      rows('pigs', 'piggies');
      rows('chickens', 'chickens');
      // Same counts too: an animal the server lacks is one the page asks about by an id it does not know.
      if ((want.pigs || []).length !== placement('piggies').length) bad.push(`pigs: page ${placement('piggies').length} server ${(want.pigs || []).length}`);
      if ((want.chickens || []).length !== placement('chickens').length) bad.push(`chickens: page ${placement('chickens').length} server ${(want.chickens || []).length}`);
      const rest = placement('butterflies');
      const fly = placement('flyingButterflies');
      for (const [i, x, y, flying] of want.butterflies || []) {
        const p = flying ? fly[i - rest.length] : rest[i];
        if (differs(p, x, y, flying ? 0 : 2)) bad.push(`butterfly:${i} page ${at(p)} server ${x},${y}`);
      }
      const byKey = new Map(nodes.map((n) => [n.key, n]));
      for (const [key, , x, y] of want.nodes || []) {
        if (differs(byKey.get(key), x, y)) bad.push(`node:${key} page ${at(byKey.get(key))} server ${x},${y}`);
      }
      // Shared public gardens (gardens.go): each bed's key (its plot ids), width and spot by the page's bed index.
      const beds = placement('gardens');
      for (const [index, [key, cols, , x, y]] of (gardens[tsid] || []).entries()) {
        const bed = streetGardenBed(tsid, index);
        if (differs(beds[index], x, y) || bed.bed !== key || bed.cols !== cols) bad.push(`garden ${index} page ${bed.bed} ${bed.cols} at ${at(beds[index])} server ${key} ${cols} at ${x},${y}`);
      }
      if (bad.length) drift.push(`${tsid} ${data.label}: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
      checked += 1;
    }
    assert.ok(checked > 1000, `laid out ${checked} streets`);
    for (const tsid of Object.keys(objects)) assert.ok(tsids.includes(tsid), `${tsid} is in the server's objects but not a street the page knows`);
    assert.deepEqual(drift, [], `${drift.length} streets drift from the server: node tools/build-realtime-objects.mjs and tools/build-realtime-gardens.mjs, then release the server with the game\n${drift.slice(0, 30).join('\n')}`);
  });
});
