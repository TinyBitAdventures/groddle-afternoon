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
 * The street is the one game.js plans: every feature's prepareStreet has run on it first (a Party
 * Space's template inside its party keeps only its exit signpost, a keep-clear spot: R43, Toxic
 * Moon's rocks and Nylon Phool's salmon stood elsewhere on the server), and its quoins are checked
 * as well (data/quoins.json).
 * The server files skip when that repo is not beside this one (tools/repos.mjs).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { ecologyForStreet, gardenPlacementRequest, planStreetPlacements, populationForStreet, rockPlacementRequest, rockSpawnPlan, setStreetEcologyCatalog, shrinePlacementRequest, streetGardenBoxBeds, streetReservedSpots, treePlacementRequest } from '../public/js/street-ecology.js?v=f1c11a2d';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=abc828a8';
import { FEATURES } from '../public/js/features/index.js?v=4c3a8c47';
import { streetGardenBeds } from '../public/js/garden.js?v=a7c6f521';
import { isZoneTsid } from '../public/js/zone-streets.js?v=b40010d5';
import { partySpaceForStreet } from '../public/js/party-spaces.js?v=4e1ca2a5';
import { setWildlifeCatalog } from '../public/js/wildlife.js?v=670c3a7f';
import { arrivalsFor, defaultArrival } from '../public/js/street-arrival.js?v=ee7223c5';
import { streetQuoinLayout } from '../tools/build-realtime-quoins.mjs';
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
  // The rocks', trees', gardens' and shrine's groups are rockPlacementRequest, treePlacementRequest,
  // gardenPlacementRequest and shrinePlacementRequest(currentStreetPopulation) (the rocks, trees and
  // garden beds the snaps show, the shrine its picture shows, fixed).
  const rows = [...core.matchAll(/\{ key: '([a-zA-Z]+)', count: ([^,]+), clearance: (\d+) \}|rockPlacementRequest\(currentStreetPopulation\)|treePlacementRequest\(currentStreetPopulation\)|gardenPlacementRequest\(currentStreetPopulation\)|shrinePlacementRequest\(currentStreetPopulation\)/g)];
  assert.ok(rows.length >= 13, `read ${rows.length} planner groups from game.js`);
  return rows.map(([whole, key, expr, clearance]) => {
    if (whole.startsWith('rockPlacementRequest')) return { key: 'rocks', request: (pop) => rockPlacementRequest(pop) };
    if (whole.startsWith('treePlacementRequest')) return { key: 'trees', request: (pop) => treePlacementRequest(pop) };
    if (whole.startsWith('shrinePlacementRequest')) return { key: 'shrine', request: (pop) => shrinePlacementRequest(pop) };
    if (whole.startsWith('gardenPlacementRequest')) return { key: 'gardens', request: (pop) => gardenPlacementRequest(pop) };
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

/**
 * The street as game.js enterStreet has it when it plans: features.prepareStreet (every feature's, in
 * order) on the loaded street. On a Party Space's template the player is in its party, come from
 * another street, as anyone in the space online is (party-spaces-feature enterParty sets returnTo).
 */
/** An online page's engine as the features see it while game.js enterStreet plans the street. */
const PAGE_ENGINE = { mode: 'multiplayer', param: () => null, query: () => null, setData() {}, homeContext: () => ({ inHome: false }), transientInstance: () => false };

function pageStreet(data, preparers, party, engine = PAGE_ENGINE) {
  const space = partySpaceForStreet(data.tsid);
  party.restore(space ? { party: { template: space.id, expiresAt: Date.now() + 3_600_000, inside: true, returnTo: { tsid: STREET_INDEX.default, x: 300, y: 600 } } } : {});
  for (const f of preparers) f.prepareStreet(data, engine);
  party.restore({});
  return data;
}

/** The page's layout of one street: planner groups (game.js) and its resource nodes (resource-nodes-feature). */
function clientLayout(data, core, groupFeatures, keep = [], engine = PAGE_ENGINE) {
  // game.js streetEcologyEntry: a feature's ecologyOverride first. The only street the server shares
  // under an override is a Party Space's template (party-spaces-feature: its exact rocks, trees and
  // nodes), laid out for each space's instance PARTY_<id> (#576); the other overrides are private places.
  const party = FEATURES.find((f) => f.id === 'party-spaces');
  const ecology = party.ecologyOverride(data) || ecologyForStreet(data.tsid);
  const population = populationForStreet(data.tsid, ecology, { starter: data.tsid === STREET_INDEX.default });
  const requests = [
    ...core.map((g) => (g.request ? g.request(population) : { key: g.key, count: g.count(population), clearance: g.clearance })),
    // features.collect('placementGroups'): every feature's groups in FEATURES order, street furniture
    // included (R43, #680: the server once planned without them, and a node the front art covered moved
    // after the whole plan, so the page's own nodes stood elsewhere and its mailbox on the server's
    // Peat Bog on Lonkari Line). The groups after a group never move it (the planner seats each group,
    // and moves its covered nodes, in order): tests/g1276-one-shared-plan.test.js.
    ...groupFeatures.flatMap((f) => f.placementGroups(population, data, engine) || []),
  ];
  // game.js: WORLD_W = streetWidth(data); `keep` is what game.js adds to the keep-clear spots for this
  // page (soloKeepClear: nothing online).
  const plan = planStreetPlacements(platformsScreen(data), requests, { worldW: streetWidth(data), seed: data.tsid, reserved: [...streetReservedSpots(data), ...keep] });
  const placement = (key) => plan.groups[key] || [];
  return { population, placement, nodes: resourceSpawnPlan(population, placement), rocks: rockSpawnPlan(population, placement('rocks'), data.tsid) };
}

/** A solo page's engine as the features see it while game.js enterStreet plans the street. */
const SOLO_ENGINE = { ...PAGE_ENGINE, mode: 'solo' };

/**
 * #718: the keep-clear spots game.js enterStreet adds to the street's own (streetReservedSpots) before
 * it plans, run from game.js's own code for a page in `mode` that came in at `opts` (a save, a signpost
 * or a door: spawnX, spawnY) or with no spot (`entry`: street-arrival.js defaultArrival). Solo once kept
 * the player's arrival clear, which reseated the whole plan: Clam Calumny's floor Jellisacs stood at
 * 2753 and 2057 in a fresh solo game and at 1200.6 and 2672.1 on the server and every online page.
 */
function keepClear(mode, opts, entry) {
  const from = game.indexOf('const reserved = streetReservedSpots(data);');
  const code = game.slice(from + 'const reserved = streetReservedSpots(data);'.length, game.indexOf('currentStreetPlacement = planStreetPlacements(', from));
  const reserved = [];
  // eslint-disable-next-line no-new-func
  new Function('GAME_MODE', 'opts', 'entry', 'reserved', code)(mode, opts, entry, reserved);
  return reserved;
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
  let groupFeatures;
  let quoins;
  let preparers;
  let party;
  before(() => {
    if (skipWithoutServer) return;
    setZoneStreetsShown(false);
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    // The wildlife catalog game.js loads: the Heli Kitties' and the street furniture's groups read it.
    setWildlifeCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    objects = JSON.parse(readFileSync(serverPath('data/objects.json'), 'utf8')).streets;
    gardens = JSON.parse(readFileSync(serverPath('data/gardens.json'), 'utf8')).streets;
    core = clientCoreGroups();
    groupFeatures = FEATURES.filter((f) => typeof f.placementGroups === 'function');
    quoins = JSON.parse(readFileSync(serverPath('data/quoins.json'), 'utf8')).streets;
    preparers = FEATURES.filter((f) => typeof f.prepareStreet === 'function');
    party = FEATURES.find((f) => f.id === 'party-spaces');
  });

  /** What differs between a page's layout of a street and the server's files (quoins aside). */
  function streetDrift(tsid, data, { population, placement, nodes, rocks }) {
    const want = objects[tsid] || {};
    const bad = [];
    const rows = (kind, group, dy = 2) => {
      // Rocks by their index in rockClasses (rockSpawnPlan: measured or planned), as game.js spawnMineRocks.
      const pts = kind === 'rocks' ? rocks : placement(group);
      for (const row of want[kind] || []) {
        const [i] = row;
        const [x, y] = kind === 'rocks' || kind === 'trees' ? row.slice(2, 4) : row.slice(1, 3);
        if (differs(pts[i], x, y, dy)) bad.push(`${kind[0] === 'b' ? 'butterfly' : kind.slice(0, -1)}:${i} page ${at(pts[i])} server ${x},${y}`);
      }
    };
    rows('rocks', 'rocks', 0);
    rows('trees', 'trees');
    // G975: walkers stand on the line, as game.js enterStreet (R12 sprite feet); trees keep their + 2.
    rows('pigs', 'piggies', 0);
    rows('chickens', 'chickens', 0);
    // Same counts too: an animal the server lacks is one the page asks about by an id it does not know.
    if ((want.pigs || []).length !== placement('piggies').length) bad.push(`pigs: page ${placement('piggies').length} server ${(want.pigs || []).length}`);
    if ((want.chickens || []).length !== placement('chickens').length) bad.push(`chickens: page ${placement('chickens').length} server ${(want.chickens || []).length}`);
    const rest = placement('butterflies');
    const fly = placement('flyingButterflies');
    for (const [i, x, y, flying] of want.butterflies || []) {
      const p = flying ? fly[i - rest.length] : rest[i];
      if (differs(p, x, y, 0)) bad.push(`butterfly:${i} page ${at(p)} server ${x},${y}`);
    }
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    for (const [key, , x, y] of want.nodes || []) {
      if (differs(byKey.get(key), x, y)) bad.push(`node:${key} page ${at(byKey.get(key))} server ${x},${y}`);
    }
    // Shared public gardens (gardens.go): each bed's key (its plot ids), width and spot by the page's bed index.
    // Report #252: then the beds in a Herb Gardens street's planter boxes (game.js: x, y as they are, rows from the box).
    // G940: the planned and measured beds as game.js lays them out (garden.js streetGardenBeds).
    const beds = streetGardenBeds(tsid, placement('gardens'), population);
    const boxed = streetGardenBoxBeds(data, population);
    for (const [index, [key, cols, rows, x, y]] of (gardens[tsid] || []).entries()) {
      if (index >= beds.length) {
        const b = boxed[index - beds.length];
        if (!b || differs({ x: b.x, y: b.y - 2 }, x, y) || b.bed !== key || b.cols !== cols || b.rows !== rows) bad.push(`garden ${index} page ${b?.bed} ${b?.cols}x${b?.rows} at ${b?.x},${b?.y} server ${key} ${cols}x${rows} at ${x},${y}`);
        continue;
      }
      const bed = beds[index];
      if (differs({ x: bed.x, y: bed.y - 2 }, x, y) || bed.bed !== key || bed.cols !== cols || bed.rows !== rows) bad.push(`garden ${index} page ${bed.bed} ${bed.cols}x${bed.rows} at ${bed.x},${bed.y} server ${key} ${cols}x${rows} at ${x},${y}`);
    }
    if ((gardens[tsid] || []).length && (gardens[tsid] || []).length !== beds.length + boxed.length) bad.push(`gardens: page ${beds.length + boxed.length} server ${(gardens[tsid] || []).length}`);
    return bad;
  }

  it('game.js plans with the inputs the server\'s builder uses', () => {
    const call = plannerCall();
    assert.match(call, /\{ worldW: WORLD_W, seed: data\.tsid, reserved \}\s*\);\s*$/);
    assert.match(game, /WORLD_W = streetWidth\(data\);[\s\S]{0,6000}currentStreetPopulation = populationForStreet\(data\.tsid, ecologyEntry, \{\s*starter: data\.tsid === STREET_INDEX\.default,\s*\}\);/);
    // #718: no page keeps its own arrival clear, solo or online: one layout, the server's.
    const entry = { x: 3745, y: 428, from: 'incoming' };
    for (const mode of ['multiplayer', 'solo']) {
      assert.deepEqual(keepClear(mode, {}, entry), [], `${mode}: a fresh arrival adds no keep-clear spot`);
      assert.deepEqual(keepClear(mode, { spawnX: 3745, spawnY: 428 }, null), [], `${mode}: a save, signpost or door adds no keep-clear spot`);
    }
    assert.equal(FEATURES.find((f) => typeof f.placementGroups === 'function').id, 'resource-nodes');
  });

  it('every street: rocks, trees, nodes, Piggies, Chickens, Butterflies, garden beds and quoins', { skip: skipWithoutServer }, async () => {
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
      data = pageStreet(data, preparers, party);
      const layout = clientLayout(data, core, groupFeatures, keepClear('multiplayer', {}, null));
      const bad = streetDrift(tsid, data, layout);
      // Shared quoins (quoins.go): each spot by its index.
      const q = streetQuoinLayout(data, { starter: tsid === STREET_INDEX.default });
      const wantQ = quoins[tsid] || [];
      if (q.length !== wantQ.length) bad.push(`quoins: page ${q.length} server ${wantQ.length}`);
      else q.forEach(([x, y], i) => {
        if (x !== wantQ[i][0] || y !== wantQ[i][1]) bad.push(`quoin:${i} page ${x},${y} server ${wantQ[i][0]},${wantQ[i][1]}`);
      });
      if (bad.length) drift.push(`${tsid} ${data.label}: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
      checked += 1;
    }
    assert.ok(checked > 1000, `laid out ${checked} streets`);
    for (const tsid of Object.keys(objects)) assert.ok(tsids.includes(tsid), `${tsid} is in the server's objects but not a street the page knows`);
    assert.deepEqual(drift, [], `${drift.length} streets drift from the server: node tools/build-realtime-objects.mjs, tools/build-realtime-quoins.mjs and tools/build-realtime-gardens.mjs, then release the server with the game\n${drift.slice(0, 30).join('\n')}`);
  });

  // #718 (Clam Calumny): a solo page drew the street's two floor Jellisacs at 2753 and 2057, the server
  // and every online page at 1200.6 and 2672.1, and solo moved them again with the way you came in.
  // Glitch kept each thing on a street at one spot, the same for every player however they arrived.
  it('every street: a solo page lays it out as the server does, whichever way it comes in', { skip: skipWithoutServer }, async () => {
    const arrivals = JSON.parse(read('public/assets/content/street-arrivals.json'));
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
      data = pageStreet(data, preparers, party, SOLO_ENGINE);
      // A fresh game, Skip to Ur or a teleport (no spot: the default arrival), then each signpost or door landing.
      const entry = defaultArrival(data, arrivals, { worldW: streetWidth(data) });
      const ways = [[{}, entry], ...arrivalsFor(arrivals, tsid).map(([x, y]) => [{ spawnX: x, spawnY: y }, null])];
      const seen = new Set();
      for (const [opts, from] of ways) {
        const keep = keepClear('solo', opts, from);
        const id = JSON.stringify(keep);
        if (seen.has(id)) continue;
        seen.add(id);
        const bad = streetDrift(tsid, data, clientLayout(data, core, groupFeatures, keep, SOLO_ENGINE));
        if (bad.length) {
          const how = Number.isFinite(opts.spawnX) ? `arriving at ${opts.spawnX},${opts.spawnY}` : 'a fresh arrival';
          drift.push(`${tsid} ${data.label} (${how}): ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
          break;
        }
      }
      checked += 1;
    }
    assert.ok(checked > 1000, `laid out ${checked} streets`);
    assert.deepEqual(drift, [], `${drift.length} streets stand elsewhere solo than on the server\n${drift.slice(0, 30).join('\n')}`);
  });
});
