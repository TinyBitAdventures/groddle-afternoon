/**
 * Register G271/G257: quoin spots were never archived. The 2012 location files list each street's
 * quoins (objrefs labelled "Coin") but not where they hung nor what kind each was, so every quoin
 * stood on a planner spot and its kind came from a hash (js/quoins.js planStreetQuoins). Now:
 * - a street players snapped in Nov-Dec 2012 has measured spots and kinds
 *   (assets/content/quoin-spots.json, js/quoin-spots-data.js, tools/snap-placements/quoins.py),
 *   and its quoins hang there, of that kind (game.js enterStreet and the realtime server's layout,
 *   tools/build-realtime-quoins.mjs, through js/quoins.js streetQuoinPoints);
 * - when the street's file names more quoins than the snaps show (a quoin grabbed before every snap),
 *   the planner's spots top it up to the file's count, never past it;
 * - a street with no measured spots keeps the planner's spots and the hashed kinds.
 * Respawn stays by class (G216: streetQuoinClass by index and kind). None of this needs the snaps
 * (research/eleven-snaps is not public).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { streetHeight, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';
import {
  MEASURED_QUOIN_CLEARANCE,
  QUOIN_TYPES,
  measuredStreetQuoins,
  planStreetQuoins,
  quoinRespawnMs,
  streetQuoinClass,
  streetQuoinPoints,
} from '../public/js/quoins.js?v=61be601c';
import { QUOIN_COIN_COUNTS, QUOIN_SPOTS } from '../public/js/quoin-spots-data.js?v=7c343cbc';
import { streetQuoinLayout } from '../tools/build-realtime-quoins.mjs';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=02dd7dda';

const root = join(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const spotsFile = read('public/assets/content/quoin-spots.json');
const index = read('public/assets/streets/index.json');
const street = (tsid) => read(`public/assets/streets/${tsid}.json`);

/** Pansanu Insanu, Tahli: Eleven's one archived quoin (bench fixture IHFK8C8NB6J2FJ5) sits here at 376, -484. */
const PANSANU = 'GHFF2N2M36J2MG3';
const NATURAL = Object.keys(QUOIN_TYPES).filter((id) => id !== 'qurazy');
/** Umbra: drawn as black silhouettes, so its quoins show their shape and not their kind. */
const UMBRA = 'GDOSHD9J6NT2HUJ';

describe('G271: the measured quoin spots', () => {
  it('has the documented shape, on real streets, inside each street and within its file count', () => {
    assert.match(spotsFile.source, /eleven giants/i);
    assert.match(spotsFile.source, /no pixels/i);
    const tsids = Object.keys(spotsFile.streets);
    assert.ok(tsids.length >= 400, `${tsids.length} streets`);
    let total = 0;
    for (const tsid of tsids) {
      assert.match(tsid, /^G[A-Z0-9]+$/, tsid);
      assert.ok(index.streets[tsid], tsid);
      const data = street(tsid);
      const spots = spotsFile.streets[tsid];
      const coins = spotsFile.coins[tsid];
      assert.ok(spots.length >= 1, tsid);
      if (coins !== undefined) assert.ok(spots.length <= coins, `${tsid} ${spots.length} of ${coins}`);
      assert.ok(spotsFile.snaps[tsid] >= 1, `${tsid} snaps`);
      for (const [x, y, kind] of spots) {
        assert.ok(x > 0 && x < streetWidth(data), `${tsid} x ${x}`);
        assert.ok(y > 0 && y < streetHeight(data), `${tsid} y ${y}`);
        // '' where the snaps show the coin's shape and no colour (Umbra's silhouettes).
        assert.ok(NATURAL.includes(kind) || kind === '', `${tsid} kind ${kind}`);
      }
      // Two spots are two quoins, never one seen twice (the tool merges within 20 px).
      for (let i = 0; i < spots.length; i += 1) {
        for (let j = i + 1; j < spots.length; j += 1) {
          assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 20, `${tsid} ${i} ${j}`);
        }
      }
      total += spots.length;
    }
    assert.ok(total >= 3000, `${total} quoins`);
    // Qurazy quoins are a per-player roll on a marker (G260), kept apart from the natural spots.
    for (const [tsid, rows] of Object.entries(spotsFile.qurazy || {})) {
      assert.ok(index.streets[tsid], tsid);
      for (const row of rows) assert.equal(row.length, 2, tsid);
    }
  });

  it('has more than one kind, as Tiny Speck mixed them', () => {
    const kinds = {};
    for (const rows of Object.values(spotsFile.streets)) for (const [, , kind] of rows) kinds[kind] = (kinds[kind] || 0) + 1;
    for (const kind of ['xp', 'mood', 'energy', 'currants']) assert.ok(kinds[kind] > 100, `${kind}: ${kinds[kind]}`);
  });

  it('leaves Umbra\'s kinds unknown (black silhouettes) and the game hashes them', () => {
    const rows = spotsFile.streets[UMBRA];
    assert.ok(rows.length >= 10, `${rows.length}`);
    assert.ok(rows.every(([, , kind]) => kind === ''));
    const spots = measuredStreetQuoins(UMBRA);
    assert.equal(spots.length, rows.length);
    for (const s of spots) assert.equal(s.type, undefined);
    let unknown = 0;
    for (const rows2 of Object.values(spotsFile.streets)) unknown += rows2.filter(([, , k]) => k === '').length;
    assert.equal(unknown, rows.length, 'Umbra is the only street with unknown kinds');
  });

  it('is what the game reads (js/quoin-spots-data.js matches the JSON)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(QUOIN_SPOTS)), spotsFile.streets);
    assert.deepEqual(JSON.parse(JSON.stringify(QUOIN_COIN_COUNTS)), spotsFile.coins);
  });

  it('puts Pansanu Insanu\'s 11 where the snaps show them, one on Eleven\'s archived quoin', () => {
    const spots = measuredStreetQuoins(PANSANU);
    assert.equal(spots.length, 11);
    assert.equal(QUOIN_COIN_COUNTS[PANSANU], 11, 'the 2012 file names 11 Coins');
    // Fixture x 376, y -484 is 3376, 516 from the street's top left (bounds l -3000, t -1000). The
    // snaps put the cell centre 7 px right of it and the bob's middle 3-4 px over it.
    const near = spots.filter((s) => Math.abs(s.x - 3376) <= 12 && Math.abs(s.y - 516) <= 12);
    assert.equal(near.length, 1, JSON.stringify(spots));
    // The snaps show a mood quoin there in 2012 (the fixture, saved later by Eleven, says currants).
    assert.equal(near[0].type, 'mood');
    for (const s of spots) assert.equal(s.exactY, true);
    assert.deepEqual([...new Set(spots.map((s) => s.type))].sort(), ['energy', 'mood', 'xp']);
  });
});

describe('G271: a street\'s quoin points', () => {
  const planned = [{ x: 100, y: 900 }, { x: 3390, y: 600 }, { x: 5000, y: 950 }, { x: 5900, y: 400 }];

  it('a street with measured spots uses them, with their kinds, and no planned one', () => {
    const points = streetQuoinPoints(PANSANU, planned);
    assert.deepEqual(points, measuredStreetQuoins(PANSANU));
    assert.equal(points.length, 11);
  });

  it('tops up to the file count from the planner, skipping planned spots under a measured quoin, never past the count', () => {
    const measured = measuredStreetQuoins(PANSANU);
    const near = measured.find((s) => Math.abs(s.x - 3383) < 20);
    const plan = [{ x: near.x + 10, y: near.y + 92 }, { x: 100, y: 900 }, { x: 5000, y: 950 }, { x: 5900, y: 400 }];
    const points = streetQuoinPoints(PANSANU, plan, { coins: 13 });
    assert.equal(points.length, 13);
    assert.deepEqual(points.slice(0, 11), measured);
    assert.deepEqual(points.slice(11), [plan[1], plan[2]], 'the planned spot under a measured quoin is skipped');
    assert.ok(MEASURED_QUOIN_CLEARANCE >= 40);
    // No count known, or fewer than measured: the measured ones only.
    assert.equal(streetQuoinPoints(PANSANU, plan, { coins: undefined }).length, 11);
    assert.equal(streetQuoinPoints(PANSANU, plan, { coins: 5 }).length, 11);
  });

  it('a street with no measured spots, or whose population has no quoins, keeps the planner\'s', () => {
    const unmeasured = Object.keys(index.streets).find((t) => t.startsWith('G') && !QUOIN_SPOTS[t]);
    assert.ok(unmeasured);
    assert.equal(measuredStreetQuoins(unmeasured), null);
    assert.equal(streetQuoinPoints(unmeasured, planned), planned);
    assert.deepEqual(streetQuoinPoints(PANSANU, [], { count: 0 }), []);
    // The L tsid of a measured street reads its G row.
    assert.deepEqual(measuredStreetQuoins(`L${PANSANU.slice(1)}`), measuredStreetQuoins(PANSANU));
  });

  it('respawn stays by class (G216): each measured spot\'s class is of its kind, with a timer', () => {
    measuredStreetQuoins(PANSANU).forEach((s, i) => {
      const cls = streetQuoinClass(PANSANU, i, s.type);
      assert.ok(Number.isFinite(quoinRespawnMs(cls)), `${i} ${cls}`);
      assert.ok(cls.endsWith(s.type), `${i} ${s.type} ${cls}`);
    });
  });

  it('game.js lays measured spots out with their kinds (enterStreet, naturalQuoinPlan)', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /spawnQuoins\(Array\.isArray\(roomQuoins\) \? roomQuoins : streetQuoinPoints\(data\.tsid, placement\('quoins'\), \{ count: currentStreetPopulation\.quoins \}\)\)/);
    assert.match(game, /if \(QUOIN_TYPES\[spot\?\.type\]\) plan\[i\] = spot\.type;/);
    assert.match(game, /q\.baseY = opts\.useExactY \? spot\.y :/);
    assert.match(game, /useExactY: spot\.exactY === true/);
    // An unmeasured street's kinds still come from the hash.
    assert.equal(planStreetQuoins('GXXXXXXXXXXXXXX', 8).length, 8);
  });
});

describe('G271: multiplayer shares the measured spots', () => {
  it('the realtime server lays Pansanu Insanu\'s quoins on the measured spots, at their own y, of their kinds', async () => {
    setZoneStreetsShown(false);
    applyStreetIndex(index);
    setStreetEcologyCatalog(read('public/assets/content/street-ecology.json'));
    const data = await loadStreetDataFromFs(PANSANU, join(root, 'public/assets/streets'));
    const layout = streetQuoinLayout(data);
    const measured = measuredStreetQuoins(PANSANU);
    assert.equal(layout.length, measured.length);
    layout.forEach(([x, y, type, cls], i) => {
      assert.deepEqual([x, y, type], [measured[i].x, measured[i].y, measured[i].type]);
      assert.equal(cls, streetQuoinClass(PANSANU, i, type));
    });
  });

  it('data/quoins.json in the server repo is current when that repo is beside this one', { skip: existsSync(join(root, '../groddle-afternoon-server/quoins.go')) ? false : 'no server repo' }, () => {
    const out = spawnSync(process.execPath, [join(root, 'tools/build-realtime-quoins.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr || out.stdout);
  });
});

describe('G271: the measuring tool', () => {
  const py = spawnSync('python3.11', ['-c', 'print(1)'], { encoding: 'utf8' });
  const skip = py.status === 0 ? false : 'python3.11 not installed';
  const tool = join(root, 'tools/snap-placements/quoins.py');

  it('skips cleanly without the snaps and writes nothing', { skip }, () => {
    const before = readFileSync(join(root, 'public/assets/content/quoin-spots.json'), 'utf8');
    const out = spawnSync('python3.11', ['-I', tool, '--snaps', join(root, 'no-such-snaps')], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /no snaps at .* nothing to measure/);
    assert.equal(readFileSync(join(root, 'public/assets/content/quoin-spots.json'), 'utf8'), before);
  });

  it('--check agrees the data module is current', { skip }, () => {
    const out = spawnSync('python3.11', ['-I', tool, '--check'], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stdout + out.stderr);
  });
});
