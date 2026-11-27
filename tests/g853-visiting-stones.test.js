/**
 * G853, #392: Visiting Stones belong at dead ends ("Visiting Stones can typically be found in
 * \"dead-end locations\" of most regions", visiting_stone.js 202). The 103 the players' 2012 snaps show
 * (tools/snap-placements/stone-spots.json, seated by stone-spots.mjs into js/stone-spots-data.js) stand
 * where the snaps show them (street-furniture.js stoneSpotRow, kept clear by streetReservedSpots); the
 * other 96 are planned within 800 px of the street's end with no signpost (stoneDeadEndZone).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  ecologyForStreet,
  footOverAir,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=dde3c62d';
import {
  FURNITURE_GROUPS,
  STONE_DEAD_END_PX,
  fixedFurniturePoints,
  furnitureFor,
  furniturePlacementGroups,
  measuredStones,
  stoneDeadEndZone,
  stoneSpotRow,
} from '../public/js/street-furniture.js?v=071203fc';
import { STONE_SPOTS } from '../public/js/stone-spots-data.js?v=3373caf6';
import { STONE_SEAT_PX } from '../tools/snap-placements/stone-spots.mjs';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const source = JSON.parse(readFileSync(join(root, 'tools/snap-placements/stone-spots.json'), 'utf8')).streets;
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

describe('Visiting Stones at dead ends', () => {
  it('the measured spots are current and seated on their floors (tools/snap-placements/stone-spots.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/snap-placements/stone-spots.mjs'), '--check'], { stdio: 'pipe' });
    assert.equal(Object.keys(STONE_SPOTS).length, 103);
    for (const [tsid, [x, y]] of Object.entries(STONE_SPOTS)) {
      assert.ok(catalog.furniture[tsid]?.visiting_stone || catalog.furniture[`L${tsid.slice(1)}`]?.visiting_stone, `${tsid} has no stone in its row`);
      assert.ok(Math.abs(x - source[tsid].spot[0]) <= 1 && Math.abs(y - source[tsid].spot[1]) <= STONE_SEAT_PX, tsid);
    }
  });

  it('a measured stone is pinned where the snaps show it and kept clear by every planned thing', () => {
    const tsid = 'GA512CSG4H42RKG'; // Stake Claim Rd A: 392, 651
    const s = JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
    const row = stoneSpotRow(furnitureFor(catalog, tsid), s);
    assert.deepEqual(fixedFurniturePoints(row, 'visiting_stone'), measuredStones(tsid));
    assert.deepEqual(measuredStones(tsid), [{ x: 392, y: 651 }]);
    assert.ok(!furniturePlacementGroups(row, tsid, s).some((g) => g.key === FURNITURE_GROUPS.visiting_stone.key));
    const keep = streetReservedSpots(s).find((r) => r.key === 'stone:0');
    assert.deepEqual([keep.x, keep.y, keep.clearance], [392, 651, 90]);
    // A row with its own fixed stone (a feature's row) keeps it.
    const own = { visiting_stone: 1, at: { visiting_stone: [{ x: 10, y: 20 }] } };
    assert.equal(stoneSpotRow(own, s), own);
  });

  it('the dead end is the end on the half with no signpost', () => {
    const s = (xs) => ({ bounds: { l: -3000, r: 3000, t: -1000, b: 0 }, signposts: xs.map((x) => ({ x, y: -100, connects: [{ tsid: 'LX' }] })) });
    assert.deepEqual(stoneDeadEndZone(s([-2800, -1000])), { lo: 6000 - STONE_DEAD_END_PX, hi: 6000 });
    assert.deepEqual(stoneDeadEndZone(s([2800])), { lo: 0, hi: STONE_DEAD_END_PX });
    assert.equal(stoneDeadEndZone(s([-2800, 2800])), null);
    assert.equal(stoneDeadEndZone(s([])), null);
    // A signpost whose every connect is hidden is not one the player sees.
    const hidden = s([-2800, 2800]);
    hidden.signposts[1].connects = [{ tsid: 'LY', hidden: true }];
    assert.deepEqual(stoneDeadEndZone(hidden), { lo: 6000 - STONE_DEAD_END_PX, hi: 6000 });
  });

  it('every planned stone stands within 800 px of its dead end, on a floor with both ends over it', async () => {
    let planned = 0;
    const noDeadEnd = [];
    for (const [rowTsid, row] of Object.entries(catalog.furniture)) {
      if (!row.visiting_stone) continue;
      const tsid = `G${rowTsid.slice(1)}`;
      if (!index.streets[tsid] || STONE_SPOTS[tsid]) continue;
      const data = await loadStreetDataFromFs(tsid, streetsDir);
      const zone = stoneDeadEndZone(data);
      if (!zone) {
        noDeadEnd.push(tsid);
        continue;
      }
      const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
      const platforms = platformsScreen(data);
      const plan = planStreetPlacements(platforms, creatureRequests(pop, data, catalog), { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
      const [stone] = plan.groups[FURNITURE_GROUPS.visiting_stone.key] || [];
      assert.ok(stone, `${data.label}: no stone`);
      // #731 (G1330): a stone stays in its dead end, as in Glitch. Off the front art (East Spice's gear
      // trees, Chuff Chase 1's acacia, Puckell Peck's conifer) it moves within the dead end only, to
      // the spot the drawn art leaves seen (street-ecology.js reseatHiddenNodes, frontArtShare).
      assert.ok(stone.x >= zone.lo && stone.x <= zone.hi, `${data.label}: stone at ${Math.round(stone.x)}, dead end ${zone.lo}-${zone.hi}`);
      assert.ok(footOverAir(platforms, stone, 45) <= 12, `${data.label}: stone over air`);
      planned += 1;
    }
    assert.ok(planned >= 90, `${planned} planned stones checked`);
    // Signposts on both halves (or none): no dead end the rule finds, so the planner picks (Curling
    // Lake's stands 2,451 px from an end). Memento Sana, Ginseng Grope, Slippery Climb, Curling Lake.
    assert.deepEqual(noDeadEnd.sort(), ['GA5D59PVEL13KNQ', 'GA92VDUR8D82E3F', 'GHF6UMCMHOD387H', 'GHFN5KCGS5D3IFC']);
  });
});
