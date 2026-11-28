/**
 * G852, #394: Hechey Track's five starter rocks (the remake's own: its archived row names none) were
 * planned onto its pine branches, four of five. They stand on fixed spots on the main floor
 * (street-ecology.js STARTER_ROCK_SPOTS), seated at the rocks' turn so the trees, gardens, vendor and
 * shrine before them stay where they were, and each rock keeps its index and class (its saved ore).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { isItemSolid, isStandable, platformYAt, platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  PLACEMENT_FOOTPRINTS,
  PLACEMENT_HEIGHTS,
  ROCK_SHAPE_HEIGHTS,
  ROCK_SHAPE_WIDTHS,
  STARTER_ROCK_SPOTS,
  ecologyForStreet,
  footOverAir,
  onBranchArt,
  planStreetPlacements,
  populationForStreet,
  rockPlacementRequest,
  rockSpawnPlan,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=63b5b2c0';
import { placementRequests } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const HECHEY = 'GLI2V0UN7RD1T2J';
setStreetEcologyCatalog(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

describe('Hechey Track starter rocks', () => {
  it('are the default street\'s onboarding five, on fixed spots, in their classes and indexes', () => {
    assert.equal(index.default, HECHEY);
    const pop = populationForStreet(HECHEY, ecologyForStreet(HECHEY), { starter: true });
    assert.deepEqual(pop.rockClasses, ['rock_metal_1', 'rock_dullite_1', 'rock_beryl_1', 'rock_sparkly_1', 'rock_metal_1']);
    assert.deepEqual(pop.starterRockSpots, STARTER_ROCK_SPOTS[HECHEY]);
    assert.equal(rockPlacementRequest(pop).late, true);
    const plan = rockSpawnPlan(pop, [], HECHEY);
    assert.deepEqual(plan.map((r) => [r.index, r.classTsid, r.x, r.y, r.shape]), STARTER_ROCK_SPOTS[HECHEY].map(([x, y, shape], i) => [i, pop.rockClasses[i], x, y, shape]));
    // Not on another street, nor on Hechey Track off the onboarding path (not the start street).
    assert.equal(populationForStreet(HECHEY, ecologyForStreet(HECHEY)).starterRockSpots, undefined);
  });

  it('stand on the main floor, off branch art, clear of signposts, the ladder and the planned scenery', async () => {
    const data = await loadStreetDataFromFs(HECHEY, streetsDir);
    const platforms = platformsScreen(data);
    const items = platforms.filter((p) => isStandable(p) && isItemSolid(p));
    const reserved = streetReservedSpots(data);
    const pop = populationForStreet(HECHEY, ecologyForStreet(HECHEY), { starter: true });
    const plan = planStreetPlacements(platforms, placementRequests(pop), { worldW: streetWidth(data), seed: HECHEY, reserved });
    const branches = reserved.filter((r) => r.branch);
    rockSpawnPlan(pop, plan.groups.rocks, HECHEY).forEach((rock) => {
      const w = ROCK_SHAPE_WIDTHS[rock.classTsid][rock.shape - 1];
      const h = ROCK_SHAPE_HEIGHTS[rock.classTsid][rock.shape - 1];
      const ys = items.map((p) => platformYAt(p, rock.x, 0)).filter((y) => y != null);
      // The lowest floor at x: nothing under it.
      assert.ok(Math.abs(Math.max(...ys) - rock.y) <= 1, `rock ${rock.index} at ${rock.x},${rock.y}: floors ${ys}`);
      assert.ok(footOverAir(platforms, rock, w / 2) <= 12, `rock ${rock.index} hangs over air`);
      assert.ok(!onBranchArt({ ...rock, under: 1 }, branches), `rock ${rock.index} on branch art`);
      for (const r of reserved.filter((s) => /^(signpost|ladder|door):/.test(s.key))) {
        assert.ok(rock.x + w / 2 < r.block.l || rock.x - w / 2 > r.block.r, `rock ${rock.index} covers ${r.key}`);
      }
      for (const key of ['trees', 'gardens', 'vendor', 'shrine']) {
        const half = (key === 'trees' ? PLACEMENT_FOOTPRINTS.trees : PLACEMENT_FOOTPRINTS[key]) / 2;
        for (const p of plan.groups[key]) {
          if (Math.abs(p.y - rock.y) > PLACEMENT_HEIGHTS[key] + h) continue;
          assert.ok(Math.abs(p.x - rock.x) >= half + w / 2, `rock ${rock.index} at ${rock.x} inside ${key} at ${Math.round(p.x)}`);
        }
      }
    });
    assert.deepEqual(plan.branch, []);
  });
});
