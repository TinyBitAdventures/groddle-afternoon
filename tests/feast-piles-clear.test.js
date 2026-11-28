/**
 * Thanksgiving Day's feast piles keep clear of Groddle Forest Junction's fixtures (G1015, lane
 * potluckk): every spot, with the widest pile's art (PILE_HALF each side), stays PILE_MARGIN clear of
 * the street tree's trunk, the shrine's base where the game stands it online (the same planner and
 * seed as game.js and tools/build-realtime-rook.mjs, no per-player reservation), the signposts, the
 * subway door and the Hardware Vendor. The last pile at 700 overlapped the shrine's base (730-848)
 * and the first right of the tree, at 490, its trunk (396-464).
 * Run: node --test tests/feast-piles-clear.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyStreetIndex, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { PLACEMENT_FOOTPRINTS, ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=63b5b2c0';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { FEAST_SPOTS, PILE_HALF, PILE_MARGIN } from '../public/js/feast-day.js?v=4609da69';
import { TABLE_AT, TABLE_STREET } from '../public/js/pot-luck-feast.js?v=971888be';
import { worldArtFor } from '../public/js/world-art.js?v=a67514c8';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

setZoneStreetsShown(false);
applyStreetIndex(json('public/assets/streets/index.json'));
setStreetEcologyCatalog(json('public/assets/content/street-ecology.json'));
const data = json(`public/assets/streets/${TABLE_STREET}.json`);
const left = data.dynamic?.l ?? data.bounds?.l ?? -3000;
const population = populationForStreet(data.tsid, ecologyForStreet(data.tsid), {});
const reserved = streetReservedSpots(data);
const plan = planStreetPlacements(platformsScreen(data), placementRequests(population), { worldW: streetWidth(data), seed: data.tsid, reserved });
// The piles' floor: the table's ground (source y); a fixture far above or below it is on another floor.
const floorY = TABLE_AT.y - (data.dynamic?.t ?? data.bounds?.t ?? -1200);
const onFloor = (p) => Math.abs(p.y - floorY) < 90;

/** Each fixture on the piles' floor as [name, from, to] in source x. */
function fixtures() {
  const out = [];
  const shrine = plan.groups.shrine?.[0];
  if (shrine) out.push(['shrine', shrine.x + left - PLACEMENT_FOOTPRINTS.shrine / 2, shrine.x + left + PLACEMENT_FOOTPRINTS.shrine / 2]);
  const vendor = plan.groups.vendor?.[0];
  if (vendor && onFloor(vendor)) out.push(['vendor online', vendor.x + left - PLACEMENT_FOOTPRINTS.vendor / 2, vendor.x + left + PLACEMENT_FOOTPRINTS.vendor / 2]);
  // Solo the Hardware Vendor can stand where the shrine stands online (a saved arrival moves the plan).
  if (shrine) out.push(['vendor solo', shrine.x + left - PLACEMENT_FOOTPRINTS.vendor / 2, shrine.x + left + PLACEMENT_FOOTPRINTS.vendor / 2]);
  // A tree's trunk: the spice tree's frame (trant_spice m7, 318 x 250, foot at 159) has its trunk in
  // columns 109-190 just above the roots; game.js spawnTrees draws it at 210 / 250 and mirrors an
  // odd index, so the trunk runs from 26 left of its foot to 42 right (31-50 px each way at 1:1).
  const trees = plan.groups.trees || [];
  trees.forEach((t, i) => {
    if (!onFloor(t)) return;
    const k = 210 / 250;
    const [l, r] = i % 2 ? [-31 * k, 50 * k] : [-50 * k, 31 * k];
    out.push([`tree ${Math.round(t.x + left)}`, t.x + left + l, t.x + left + r]);
  });
  for (const r of reserved) {
    if (!/^(signpost|door):/.test(r.key) || !onFloor(r)) continue;
    out.push([r.key, r.x + left - 50, r.x + left + 50]);
  }
  return out;
}

describe('the feast piles on Groddle Forest Junction', () => {
  it('finds the shrine online where the realtime server has it (data/rook.json 3788.6: source 789)', () => {
    const shrine = plan.groups.shrine?.[0];
    assert.ok(shrine, 'the street has a shrine');
    assert.ok(Math.abs(shrine.x + left - 789) < 2, `shrine at ${shrine.x + left}`);
    const names = fixtures().map((f) => f[0]);
    assert.ok(names.includes('tree 422'), names.join(','));
    // The street's spice tree is the plan's sixth (an odd index: drawn mirrored).
    const spice = (plan.groups.trees || []).findIndex((t) => Math.round(t.x + left) === 422);
    assert.equal(population.treeClasses[spice], 'trant_spice');
    assert.equal(spice % 2, 1);
    assert.ok(names.some((n) => n.startsWith('door:')), names.join(','));
  });

  it('PILE_HALF is half the widest pile drawn (a laid food at three bites)', () => {
    const corn = worldArtFor('corn', 3, null);
    assert.ok(corn?.url, 'corn has put-down art');
    assert.ok(PILE_HALF >= 44, 'a three-bite Sno Cone is 89 px wide');
  });

  it('every pile clears every fixture by the margin', () => {
    for (const x of FEAST_SPOTS) {
      for (const [name, from, to] of fixtures()) {
        const gap = x + PILE_HALF <= from ? from - (x + PILE_HALF) : x - PILE_HALF >= to ? (x - PILE_HALF) - to : -1;
        assert.ok(gap >= PILE_MARGIN, `pile at ${x} is ${gap} px from ${name} (${Math.round(from)}-${Math.round(to)})`);
      }
    }
  });
});
