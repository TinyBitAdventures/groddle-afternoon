/**
 * Player report #581: Gori Blear's Sparkly Rock "defying gravity". The planner's spot is the line's
 * height at the spot's x, and a flat-bottomed rock drawn there on a sloped or bowed floor hung its
 * downhill end over the air: the Sparkly Rock (rock:10, planned, not one of Tiny Speck's) 9 px over
 * a floor falling to the ledge's tip, its corner past the art's rim. Across the streets 525 of 1,068
 * planned rocks had an end more than 4 px off their floor (124 more than 12 px) and 272 planned nodes
 * more than 4 px (tools/node-floor-census.mjs). Now every planned rock and standing node is seated
 * onto the floor under the lower end of its foot (street-ecology.js seatOnFloor; the planner judges
 * each spot there), and a rock takes a spot it cannot be seated on (an end over a ledge end, more
 * than ROCK_SEAT_MAX_PX down) only when no other is left. One the front art would hide once seated
 * keeps its planned height (`afloat`): findable before grounded. Spots measured on Tiny Speck's snaps stay
 * where they are.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';
import {
  ROCK_SEAT_MAX_PX, ROCK_SHAPE_WIDTHS, footOverAir, planStreetPlacements, seatOnFloor, setStreetEcologyCatalog,
} from '../public/js/street-ecology.js?v=1c840641';
import { census, streetRows } from '../tools/node-floor-census.mjs';
import { setCreatureEcology } from '../tools/build-realtime-objects.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const GORI_BLEAR = 'GM1TS65LBN12EIV';
const floor = (id, x1, x2, y1, y2) => ({ id, x1, y1, x2, y2, pcPerm: -1, itemPerm: -1 });

before(() => {
  setZoneStreetsShown(false);
  applyStreetIndex(JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8')));
  const ecology = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
  setStreetEcologyCatalog(ecology);
  setCreatureEcology(ecology);
});

describe('#581 planned rocks and nodes stand on their floor', () => {
  it('no planned rock or standing node on any street has an end of its foot more than 5 px over its floor', async () => {
    const c = await census({ over: 5 });
    const planned = c.rows.filter((r) => r[2] === 'planned');
    // Every street laid out: planned and measured together (G1323 moved Nottis's 144 Ice Nubbins from
    // planned to measured wall spots, census 2026-11-27: 1,068 + 725 rocks, 913 + 512 nodes; Drifa's 166
    // moved too, leaving 747 planned nodes).
    assert.ok(c.planned.rock + c.measured.rock > 1700 && c.planned.node + c.measured.node > 1300, `the census lays out every street: ${JSON.stringify({ planned: c.planned, measured: c.measured })}`);
    assert.ok(c.planned.rock > 1000 && c.planned.node > 700, 'most rocks and nodes are still planned');
    assert.deepEqual(planned, [], `${planned.length} floating:\n${planned.slice(0, 20).map((r) => r.join(' ')).join('\n')}`);
    // The ones the front art would hide once seated stay a few px up, findable (census 2026-11-21: 11
    // rocks and 14 nodes, 6-11 px, under sliding foreground snow and front rock).
    assert.ok(c.afloat.rock + c.afloat.node <= 30, JSON.stringify(c.afloat));
  });

  it("Gori Blear's Sparkly Rock sits on the ledge, its downhill end on the line", async () => {
    const data = await loadStreetDataFromFs(GORI_BLEAR, streetsDir);
    const rock = streetRows(data).find((r) => r.key === 'rock:10');
    assert.equal(rock.classTsid, 'rock_sparkly_1');
    assert.equal(rock.measured, false, 'planned by us: Gori Blear has no snapped rocks');
    // The ledge (plat_1305233554983) falls from y 839 at x 526 to 854 at its tip, x 437.
    assert.ok(rock.y > 850 && rock.y <= 854, `seated at ${rock.y}, was 842.75`);
    const half = ROCK_SHAPE_WIDTHS.rock_sparkly_1[rock.shape - 1] / 2;
    assert.ok(footOverAir(platformsScreen(data), rock, half) <= 0.5);
  });

  it('seatOnFloor sinks a planned rock to the lower end of its foot, and leaves fixed points and ledge ends', () => {
    // A 0.1 slope: the floor 6 px lower 60 px left of the spot.
    const platforms = [floor('a', 0, 400, 240, 200), floor('low', 0, 400, 500, 500)];
    const groups = {
      rocks: [{ x: 200, y: 220, room: 120 }, { x: 300, y: 210, fixed: true }],
      'resource:dirt_pile': [{ x: 100, y: 230 }],
    };
    const seated = seatOnFloor(groups, [{ key: 'rocks' }, { key: 'resource:dirt_pile' }], platforms);
    assert.equal(groups.rocks[0].y, 226);
    assert.equal(groups.rocks[1].y, 210, 'a fixed (measured) rock stays');
    // A Dirt Pile's 150 px foot: 7.5 px.
    assert.equal(groups['resource:dirt_pile'][0].y, 237.5);
    assert.deepEqual(seated.map((s) => s.key), ['rocks', 'resource:dirt_pile']);
    // An end over a floor far below is a ledge end, not a slope: nothing moves.
    const ledge = { rocks: [{ x: 40, y: 236, room: 120 }] };
    seatOnFloor(ledge, [{ key: 'rocks' }], [floor('short', 0, 60, 236, 236), floor('low', 0, 400, 500, 500)]);
    assert.equal(ledge.rocks[0].y, 236);
  });

  it('a planned rock takes a spot it cannot be seated on (an end over a ledge end) only when no other is left', () => {
    assert.equal(ROCK_SEAT_MAX_PX, 28);
    // A ledge whose tip hangs over a floor far below, and a flat run: the rock takes the flat run.
    const platforms = [floor('tip', 0, 130, 300, 300), floor('low', 0, 800, 700, 700), floor('flat', 400, 700, 300, 300)];
    const plan = planStreetPlacements(platforms, [{ key: 'rocks', count: 2, clearance: 10 }], { worldW: 800, seed: 'r581', unreached: {} });
    const xs = plan.groups.rocks.map((p) => p.x);
    assert.ok(xs.every((x) => x >= 400 || x > 800), `took ${xs}`);
  });

  it("the realtime server's rocks and nodes are the seated spots (data/objects.json)", { skip: skipWithoutServer }, async () => {
    const objects = JSON.parse(readFileSync(serverPath('data', 'objects.json'), 'utf8'));
    const rock = objects.streets[GORI_BLEAR].rocks.find((r) => r[0] === 10);
    assert.equal(rock[1], 'rock_sparkly_1');
    assert.ok(rock[3] > 850, `server has it at y ${rock[3]}`);
    assert.ok(STREET_INDEX.streets[GORI_BLEAR]);
  });
});
