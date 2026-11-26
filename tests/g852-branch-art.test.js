/**
 * G852, #394: rocks on tree branches. A pine branch is a floor line 242-290 px wide, wide enough for
 * the deck rule (DECK_RUN_PX), so planned rocks, a shrine, a vendor, patches and animals stood up in
 * the trees on 16 streets; Glitch's snaps show none of 720 rocks on branch art. street-ecology.js
 * branchArtCovers marks a street's branch art, and the big things take a spot on it (over another
 * floor) only when nothing else is left (plan.branch).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  BRANCH_ART,
  branchArtCovers,
  branchFreeGroup,
  buildPlatformCandidates,
  ecologyForStreet,
  onBranchArt,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=8f50537c';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
const floor = (id, x1, x2, y) => ({ id, x1, y1: y, x2, y2: y, pcPerm: -1, itemPerm: -1 });

describe('branch art', () => {
  it('is the branch pieces a floor is drawn with, not trunks or whole trees', () => {
    for (const name of ['platform_branch_4', 'platform_branch_a04', 'tree_stack_branch_2', 'tree_stack_leafy_1', 'pinecluster_mask_1', 'treetop_noflowers_1', 'platform_bottletree_4_panel', 'platform_branch_boards_1']) {
      assert.ok(BRANCH_ART.test(name), name);
    }
    for (const name of ['tree_stack_trunk', 'tree_stack_base', 'tree_coniferous_fg_1', 'bottletree_body_1', 'rock_ground_1']) {
      assert.ok(!BRANCH_ART.test(name), name);
    }
    const s = {
      bounds: { l: -1000, r: 1000, t: -1000, b: 0 },
      layers: [
        { name: 'middleground', z: 0, decos: [
          { sprite: 'platform_branch_4', x: 0, y: -400, w: 302, h: 103 },
          { sprite: 'tree_coniferous_fg_1', x: 300, y: 0, w: 633, h: 1394 },
          { sprite: 'tree_stack_branch_2', x: -500, y: -300, w: 300, h: 80, hidden: true },
        ] },
        { name: 'middleplus', z: 1, decos: [{ sprite: 'platform_branch_4', x: 0, y: 900, w: 302, h: 103 }] },
      ],
    };
    const covers = branchArtCovers(s);
    assert.equal(covers.length, 1);
    assert.deepEqual(covers[0].block, { l: 849, r: 1151, t: 497, b: 600 });
    assert.ok(covers[0].branch);
  });

  it('is a branch only over another floor', () => {
    const branches = [{ block: { l: 0, r: 300, t: 500, b: 600 } }];
    assert.ok(onBranchArt({ x: 150, y: 505, under: 2000 }, branches));
    assert.ok(!onBranchArt({ x: 150, y: 505, under: 0 }, branches), 'a branch on the ground is ground');
    assert.ok(!onBranchArt({ x: 400, y: 505, under: 2000 }, branches));
    assert.ok(branchFreeGroup('rocks') && branchFreeGroup('soil:patch') && branchFreeGroup('furnitureStone'));
    assert.ok(!branchFreeGroup('quoins') && !branchFreeGroup('apples'));
  });

  it('keeps big things off a deck-wide branch while the floor has room, and small pick-ups may use it', () => {
    // A 2000 px floor and a 270 px branch line 400 px over it (a deck by width, branch art by its deco).
    const platforms = [floor('ground', 0, 2000, 900), floor('branch', 865, 1135, 500)];
    const reserved = [{ x: 1000, y: 500, key: 'branch:0', branch: true, block: { l: 850, r: 1150, t: 400, b: 500 } }];
    const cands = buildPlatformCandidates(platforms, { worldW: 2000, seed: 't' });
    const up = cands.filter((c) => c.y === 500);
    assert.ok(up.length && up.every((c) => c.run >= 240), 'the branch is a deck by width');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const plan = planStreetPlacements(platforms, [{ key: 'rocks', count: 6, clearance: 74 }, { key: 'quoins', count: 20, clearance: 28 }], { worldW: 2000, seed, reserved, unreached: null });
      assert.equal(plan.groups.rocks.length, 6);
      assert.ok(plan.groups.rocks.every((p) => p.y === 900), `${seed}: a rock up the branch`);
      assert.deepEqual(plan.branch, []);
    }
    // With no floor left the rock still goes down (never dropped), and the plan says where.
    // A 400 px floor under the branch holds five spots: the sixth rock takes the branch.
    const short = [floor('ground', 800, 1200, 900), floor('branch', 865, 1135, 500)];
    const plan = planStreetPlacements(short, [{ key: 'rocks', count: 6, clearance: 74 }], { worldW: 2000, seed: 'x', reserved, unreached: null });
    assert.equal(plan.groups.rocks.length, 6);
    assert.deepEqual(plan.groups.rocks.map((p) => p.y), [900, 900, 900, 900, 900, 500]);
    assert.deepEqual(plan.branch, [{ key: 'rocks', index: 5 }]);
  });

  it('leaves no planned big thing on branch art over a floor on the streets the audit found', () => {
    setStreetEcologyCatalog(catalog);
    setCreatureEcology(catalog);
    // Hechey Track, Osechi Oath, Tokali Kola, Double Rainbow, Loksa Laarb, Bortola Start.
    for (const tsid of ['GLI2V0UN7RD1T2J', 'GA9NT2E8FF8243N', 'GA9P334396A2GHP', 'GDOGBH4BG1E2BM0', 'GNV37JHLS1I2BF2', 'GA9U0VLRB0D2JES']) {
      const data = street(tsid);
      const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
      const plan = planStreetPlacements(platformsScreen(data), creatureRequests(pop, data, catalog), { worldW: streetWidth(data), seed: tsid, reserved: streetReservedSpots(data) });
      assert.deepEqual(plan.branch, [], `${data.label}: ${JSON.stringify(plan.branch)}`);
    }
  });
});
