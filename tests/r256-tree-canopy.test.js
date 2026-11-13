/**
 * Report #256: on Kalix Follows a Visiting Stone (and on the live build a Mortar Barnacle) was
 * planned on the ledge behind a Spice Tree, inside its canopy. A planned tree's canopy is a box the
 * node and stone groups keep out of while any other spot is left (street-ecology.js TREE_CANOPY,
 * UNDER_CANOPY_HEIGHTS).
 * Run: node --test tests/r256-tree-canopy.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TREE_CANOPY, UNDER_CANOPY_HEIGHTS, blockingFixture, planStreetPlacements } from '../public/js/street-ecology.js?v=080b2e56';

const line = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, pcPerm: -1, itemPerm: -1 });
// A long floor and, behind the tree, a long ledge 135 px up (Kalix Follows: tree at 1077, ledge at 942).
const platforms = [line('ground', 0, 1077, 3000, 1077), line('ledge', 1500, 942, 2400, 942)];
const tree = { x: 1900, y: 1077 };

function inCanopy(p, key, footprint) {
  const w = TREE_CANOPY.w / 2;
  const box = { block: { l: tree.x - w, r: tree.x + w, t: tree.y - TREE_CANOPY.h, b: tree.y } };
  return Boolean(blockingFixture(p, [box], { footprint, height: UNDER_CANOPY_HEIGHTS[key] }));
}

describe('report #256: nodes and Visiting Stones keep out of planned trees', () => {
  it('the canopy is the widest trant as drawn, and each group its own art box', () => {
    assert.deepEqual({ ...TREE_CANOPY }, { w: 267, h: 210 });
    assert.equal(UNDER_CANOPY_HEIGHTS.furnitureStone, 124);
    assert.equal(UNDER_CANOPY_HEIGHTS['resource:mortar_barnacle'], 47);
  });

  it('with room elsewhere, no stone or barnacle stands inside the tree', () => {
    const plan = planStreetPlacements(platforms, [
      { key: 'trees', count: 1, clearance: 135, fixed: [tree] },
      { key: 'resource:mortar_barnacle', count: 4, clearance: 60 },
      { key: 'furnitureStone', count: 3, clearance: 90 },
    ], { worldW: 3000, seed: 'r256', unreached: null });
    assert.equal(plan.groups.trees.length, 1);
    for (const p of plan.groups['resource:mortar_barnacle']) assert.ok(!inCanopy(p, 'resource:mortar_barnacle', 60), `barnacle at ${p.x},${p.y}`);
    for (const p of plan.groups.furnitureStone) assert.ok(!inCanopy(p, 'furnitureStone', 90), `stone at ${p.x},${p.y}`);
    assert.equal(plan.blocked.length, 0);
  });

  it('with nowhere else, it still stands (a preference, never a loss)', () => {
    const tight = [line('ground', 1700, 1077, 2100, 1077)];
    const plan = planStreetPlacements(tight, [
      { key: 'trees', count: 1, clearance: 40, fixed: [tree] },
      { key: 'furnitureStone', count: 1, clearance: 40 },
    ], { worldW: 3000, seed: 'r256', unreached: null });
    assert.equal(plan.groups.furnitureStone.length, 1);
    assert.deepEqual(plan.blocked.map((b) => [b.key, b.fixture]), [['furnitureStone', 'trees']]);
  });

  it('other groups (quoins, Piggies, rocks) are not moved by it', () => {
    assert.equal(UNDER_CANOPY_HEIGHTS.quoins, undefined);
    assert.equal(UNDER_CANOPY_HEIGHTS.piggies, undefined);
    assert.equal(UNDER_CANOPY_HEIGHTS.rocks, undefined);
  });
});
