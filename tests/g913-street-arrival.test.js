/**
 * G913: an arrival with no spot of its own (a new game's first street, Skip to Ur, the tutorial
 * skipped from a scene, the tutorial exit's fallback, a trip that names no signpost or door) stands
 * where Glitch set you down on that street, one of its incoming arrivals (players/inc_teleportation.js
 * 482-503, locations/inc_geo_links.js geo_links_get_incoming 336-357), not on the placement planner's
 * free spot, which since 30e8eca38dd (every floor height) was high in Hechey Track's pines.
 * Rules: js/street-arrival.js; data: tools/build-street-arrivals.mjs; wiring: game.js enterStreet.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArrivals, render } from '../tools/build-street-arrivals.mjs';
import { arrivalsFor, defaultArrival, loadStreetArrivals, STREET_ARRIVALS_URL } from '../public/js/street-arrival.js?v=ee7223c5';
import { applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=10376267';
import { platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { planStreetPlacements, streetReservedSpots } from '../public/js/street-ecology.js?v=f1c11a2d';
import { newxpFeature, pickOpenExit } from '../public/js/features/newxp-feature.js?v=22c6b653';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const newxp = read('public/js/features/newxp-feature.js');
const index = JSON.parse(read('public/assets/streets/index.json'));
const table = JSON.parse(read('public/assets/content/street-arrivals.json'));
const HECHEY = 'GLI2V0UN7RD1T2J';

/** The floors under x, top to bottom (screen y grows down). */
const floorsAt = (plats, x) => plats.map((p) => platformYAt(p, x, 0)).filter((y) => y != null).sort((a, b) => a - b);

describe('the arrivals table', () => {
  it('is current with the street files (node tools/build-street-arrivals.mjs)', () => {
    assert.equal(read('public/assets/content/street-arrivals.json'), render(buildArrivals()));
  });

  it("holds Hechey Track's incoming arrivals: the points its neighbours' signposts land you on", () => {
    const rows = arrivalsFor(table, HECHEY);
    // Grand Mile's signpost_1 and Scribe's Weald's signpost_2 (assets/streets/GLI1BQA9PUH16A0.json, GLICFILAMTI11QV.json).
    assert.deepEqual(rows.find((p) => p[0] === 2140), [2140, 905]);
    assert.deepEqual(rows.find((p) => p[0] === 4400), [4400, 901]);
    assert.equal(rows.length, 8);
    assert.deepEqual(arrivalsFor(table, `L${HECHEY.slice(1)}`), rows, 'the L alias finds it too');
  });

  it('every street with any way in has rows; the streets keyed are index streets', () => {
    for (const tsid of Object.keys(table)) assert.ok(index.streets[tsid], tsid);
    assert.ok(Object.keys(table).length > 1300);
  });
});

describe('defaultArrival (pure)', () => {
  it('takes the incoming arrival nearest the middle', () => {
    const street = { tsid: 'GX1', signposts: [] };
    assert.deepEqual(defaultArrival(street, { GX1: [[100, 900], [1400, 880], [2600, 870]] }, { worldW: 3000 }), { x: 1400, y: 880, from: 'incoming' });
  });

  it("with no incoming arrival, the street's own way out nearest the middle (stuckWay); with none, null", () => {
    const bounds = { l: -1000, r: 1000, t: -1000, b: 0 };
    const street = { tsid: 'GX2', bounds, signposts: [{ x: -900, y: -100, connects: [{ tsid: 'GX3' }] }, { x: 100, y: -60, connects: [{ tsid: 'GX4' }] }], doors: [] };
    assert.deepEqual(defaultArrival(street, {}, { worldW: 2000 }), { x: 1100, y: 940, from: 'way' });
    assert.deepEqual(defaultArrival(street, null, { worldW: 2000 }), { x: 1100, y: 940, from: 'way' }, 'no table (offline): the way out');
    assert.equal(defaultArrival({ tsid: 'GX5', bounds, signposts: [], doors: [] }, {}, { worldW: 2000 }), null);
    assert.equal(defaultArrival(null, table, { worldW: 2000 }), null);
  });

  it('loads the table once, and tries a failed load again', async () => {
    let calls = 0;
    const bad = async () => { calls += 1; throw new Error('offline'); };
    assert.equal(await loadStreetArrivals(bad), null);
    const good = async (url) => { calls += 1; assert.equal(url, STREET_ARRIVALS_URL); return { ok: true, json: async () => ({ GX1: [[1, 2]] }) }; };
    assert.deepEqual(await loadStreetArrivals(good), { GX1: [[1, 2]] });
    assert.deepEqual(await loadStreetArrivals(good), { GX1: [[1, 2]] });
    assert.equal(calls, 2);
  });
});

describe('Hechey Track, the street every new game starts on', () => {
  let data;
  let plats;
  before(async () => {
    applyStreetIndex(index);
    data = await loadStreetDataFromFs(HECHEY, join(root, 'public/assets/streets'));
    plats = platformsScreen(data);
  });

  it("the planner's own spot is up in the canopy (the bug): far above the street's floor", () => {
    const plan = planStreetPlacements(plats, [{ key: 'player', count: 1, clearance: 190 }], { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
    const spot = plan.groups.player[0];
    const floors = floorsAt(plats, spot.x);
    assert.ok(floors.at(-1) - spot.y > 400, `planner spot ${Math.round(spot.x)},${Math.round(spot.y)} over a floor at ${Math.round(floors.at(-1))}`);
  });

  it("the default arrival stands on the street's floor, beside Grand Mile's signpost", () => {
    const at = defaultArrival(data, table, { worldW: streetWidth(data) });
    assert.deepEqual(at, { x: 2140, y: 905, from: 'incoming' });
    const floors = floorsAt(plats, at.x);
    // The lowest line under it is within a step of the arrival (it lands on that floor), none lower.
    assert.ok(Math.abs(floors.at(-1) - at.y) < 40, `floors ${floors.map(Math.round)} at x ${at.x}`);
  });
});

describe('game.js: every arrival with no spot takes the default arrival', () => {
  const start = game.indexOf('async function enterStreet(tsid, opts = {}) {');
  const enter = game.slice(start, game.indexOf('const summerStory = ensureSummersDayStory(questState);', start));

  it('fetches the table only when no spot is given, and asks defaultArrival with the street and its closed roads', () => {
    assert.match(enter, /const arrivalsTable = Number\.isFinite\(opts\.spawnX\) \? null : loadStreetArrivals\(\);/);
    assert.match(enter, /const entry = arrivalsTable && data\.tsid !== STOOT_MEMORIAL_STREET_ID\s*\? defaultArrival\(data, await arrivalsTable, \{ worldW: WORLD_W, closed: features\.query\('closedRoads', engine\) \|\| \[\] \}\)\s*: null;/);
  });

  it('a given spot (a save, a signpost, a door, a teleport) wins; with none the arrival, then the planner', () => {
    assert.match(enter, /data\.tsid === STOOT_MEMORIAL_STREET_ID \? WORLD_W \* 0\.72 : entry\?\.x \?\? spawn\?\.x;/);
    assert.match(enter, /const sourceSpawnY = entry\?\.y \?\? spawn\?\.y;/);
    assert.match(enter, /player\.x = opts\.spawnX \?\? sourceSpawnX \?\? WORLD_W \* 0\.5;\s*player\.y = opts\.spawnY \?\? sourceSpawnY \?\? GROUND_Y;/);
  });

  it('#718: neither solo nor multiplayer keeps the arrival clear: one layout, the server\'s, however you came in', () => {
    assert.doesNotMatch(enter, /key: 'saved-arrival'/);
    assert.match(enter, /const reserved = streetReservedSpots\(data\);[\s\S]{0,600}currentStreetPlacement = planStreetPlacements\(/);
    assert.doesNotMatch(enter.slice(enter.indexOf('const reserved = streetReservedSpots(data);'), enter.indexOf('currentStreetPlacement = planStreetPlacements(')), /reserved\.push/);
  });

  it('the paths that come with no spot: a fresh boot, Skip to Ur, the in-game skip, a failed save', () => {
    // A fresh boot (no save, or ?fresh): no spawnX.
    assert.match(game, /: savedLoc\s*\? \{ spawnX: savedLoc\.x, spawnY: savedLoc\.y, quiet: true \}\s*: \{\};/);
    // Skip to Ur on the start card starts on that same boot street; the in-game skip enters it with no spot.
    assert.match(newxp, /await engine\.enter\(DEFAULT_START, \{ quiet: true, bypassFeatureGates: true \}\);/);
    assert.match(game, /await streetMove\.run\(\(\) => enterStreet\(STREET_INDEX\.default\)\);/);
  });
});

describe('the tutorial: no made-up spot on the starting street', () => {
  it("the exit fallback (no exit with a way out) gives no spot, and isn't dropped mid-street", () => {
    assert.deepEqual(pickOpenExit(() => 0.5, () => true, () => false), { sourceTsid: '', tsid: HECHEY, x: null, y: null });
    assert.match(newxp, /if \(b && engine\.streetTsid === exit\.tsid && Number\.isFinite\(exit\.x\)\)/);
  });

  it('a reload inside a training scene resumes on the starting street with no spot', () => {
    const at = newxpFeature.reloadLocation({ tsid: 'NEWXP_TRAINING1', x: 1, y: 2 });
    assert.deepEqual(at, { tsid: HECHEY, x: null, y: null });
    assert.match(newxp, /if \(isNewxpSceneTsid\(saved\?\.tsid\)\) return \{ tsid: DEFAULT_START, x: null, y: null \};/);
  });
});
