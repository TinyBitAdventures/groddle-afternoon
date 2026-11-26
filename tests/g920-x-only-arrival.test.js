/**
 * G920: a spot given as x only (a QA or demo link's streetx with no streety, the landing shots'
 * hero and grow routes on Hechey Track, the tutorial autoplay's trips) stands on the street's
 * ground at that x, the lowest standable floor under it, not at the height of the placement
 * planner's spot elsewhere on the street (since 30e8eca38dd that can be a canopy). A follow-up to
 * G913 (no spot at all). Rules: js/street-arrival.js groundAt; wiring: game.js enterStreet.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groundAt } from '../public/js/street-arrival.js?v=c7294edc';
import { applyStreetIndex, loadStreetDataFromFs } from '../public/js/street-loader.js?v=10376267';
import { platformYAt, platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';
import { getStreetEcologyCatalog, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=8f50537c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const newxp = read('public/js/features/newxp-feature.js');
const shots = read('tools/landing/shots.mjs');
const HECHEY = 'GLI2V0UN7RD1T2J';

const line = (x1, y1, x2, y2, extra = {}) => ({ x1, y1, x2, y2, ...extra });
const floorsAt = (plats, x) => plats.map((p) => platformYAt(p, x, 0)).filter((y) => y != null).sort((a, b) => a - b);

describe('groundAt: the lowest standable floor under x', () => {
  it('takes the lowest of the stacked floors, a slope read at x', () => {
    const plats = [line(0, 300, 1000, 300), line(0, 900, 1000, 800), line(400, 500, 600, 500)];
    assert.equal(groundAt(plats, 500), 850);
  });

  it('passes over undersides and pass-through lines (pc_perm 1 and 0) and upright lines', () => {
    const plats = [line(0, 400, 1000, 400), line(0, 950, 1000, 950, { pcPerm: 1 }), line(0, 990, 1000, 990, { pc_perm: 0 }), line(500, 100, 500, 1200)];
    assert.equal(groundAt(plats, 500), 400);
  });

  it('a floor nobody reaches is passed over while a reached one stands at x; alone, it still counts', () => {
    const plats = [line(0, 400, 1000, 400, { id: 'top' }), line(0, 1200, 1000, 1200, { id: 'pocket' })];
    const unreached = { pocket: [[0, 1000]] };
    assert.equal(groundAt(plats, 500, { unreached }), 400);
    assert.equal(groundAt([plats[1]], 500, { unreached }), 1200);
  });

  it('null with no floor under x or no x (the old height stays)', () => {
    assert.equal(groundAt([line(0, 400, 100, 400)], 500), null);
    assert.equal(groundAt([line(0, 400, 1000, 400)], NaN), null);
    assert.equal(groundAt(null, 10), null);
  });
});

describe("Hechey Track: the landing shots' x-only spots stand on the ground", () => {
  let plats;
  before(async () => {
    applyStreetIndex(JSON.parse(read('public/assets/streets/index.json')));
    if (!getStreetEcologyCatalog()?.unreachedFloors) setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    plats = platformsScreen(await loadStreetDataFromFs(HECHEY, join(root, 'public/assets/streets')));
  });

  it('hero (streetx=2575): the street floor at 935, under the two branches at 353 and 455', () => {
    assert.deepEqual(floorsAt(plats, 2575).map(Math.round), [353, 455, 935]);
    assert.equal(Math.round(groundAt(plats, 2575, { tsid: HECHEY })), 935);
  });

  it('grow (streetx=3490): the street floor at 882', () => {
    assert.equal(Math.round(groundAt(plats, 3490, { tsid: HECHEY })), 882);
  });

  it("Grand Mile's arrival x (2140) agrees with G913's arrival height (905)", () => {
    assert.equal(Math.round(groundAt(plats, 2140, { tsid: HECHEY })), 905);
  });
});

describe('game.js enterStreet: x only takes the ground; x and y, or a save, unchanged', () => {
  const start = game.indexOf('async function enterStreet(tsid, opts = {}) {');
  const enter = game.slice(start, game.indexOf('const summerStory = ensureSummersDayStory(questState);', start));

  it('fills the height from groundAt at the clamped x, before the avatar stands there', () => {
    const fill = enter.search(/if \(Number\.isFinite\(opts\.spawnX\) && !Number\.isFinite\(opts\.spawnY\)\) \{\s*const groundY = groundAt\(streetPlatforms, clamp\(opts\.spawnX, 40, Math\.max\(80, WORLD_W - 40\)\), \{ tsid: data\.tsid \}\);\s*if \(groundY != null\) opts = \{ \.\.\.opts, spawnY: groundY \};/);
    assert.ok(fill > 0);
    assert.ok(fill < enter.indexOf('player.y = opts.spawnY ?? sourceSpawnY ?? GROUND_Y;'));
    assert.ok(enter.indexOf('streetPlatforms = bgLayer.platformsScreen;') < fill);
  });

  it('a given y (a save, a signpost, a door, streety) is never touched; no x still takes the G913 arrival', () => {
    assert.match(enter, /player\.x = opts\.spawnX \?\? sourceSpawnX \?\? WORLD_W \* 0\.5;\s*player\.y = opts\.spawnY \?\? sourceSpawnY \?\? GROUND_Y;/);
    assert.match(enter, /const arrivalsTable = Number\.isFinite\(opts\.spawnX\) \? null : loadStreetArrivals\(\);/);
    assert.match(game, /: savedLoc\s*\? \{ spawnX: savedLoc\.x, spawnY: savedLoc\.y, quiet: true \}/);
  });
});

describe('the callers that pass x only', () => {
  it('demo links: streetdemo with streetx and no streety', () => {
    assert.match(game, /\.\.\.\(Number\.isFinite\(demoX\) \? \{ spawnX: demoX \} : \{\}\),\s*\.\.\.\(Number\.isFinite\(demoY\) \? \{ spawnY: demoY \} : \{\}\),/);
    assert.match(shots, /streetdemo=\$\{HECHEY\}&streetx=2575`/);
    assert.match(shots, /streetdemo=\$\{HECHEY\}&streetx=3490`/);
  });

  it("the tutorial autoplay's trips to the bag vendor's street and Gentle Island Exit", () => {
    assert.match(newxp, /await engine\.enter\(GENTLE_ISLAND\.progress_way, \{ spawnX: 2300, quiet: true, bypassFeatureGates: true \}\);/);
    assert.match(newxp, /await engine\.enter\(GENTLE_ISLAND\.exit, \{ spawnX: 5600, quiet: true, bypassFeatureGates: true \}\);/);
  });
});
