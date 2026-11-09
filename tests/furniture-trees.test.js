/**
 * Planned street furniture steps off trees as it does off doors (Austin 2026-11-08: on Tii Street
 * the planner stood the Mailbox 75 px from a Spice Plant's trunk, inside it).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { DOOR_CLEARANCE, TREE_OBSTACLE_W, clearOfDoors, treeObstacles } from '../public/js/street-furniture.js?v=55131f49';
import { platformsScreen } from '../public/js/street-model.js?v=b6cb6a4e';

const tii = JSON.parse(readFileSync(new URL('../public/assets/streets/GLI23TBNDHD19F2.json', import.meta.url), 'utf8'));
const src = readFileSync(new URL('../public/js/features/street-furniture-feature.js', import.meta.url), 'utf8');

describe('furniture keeps clear of trees', () => {
  const platforms = platformsScreen(tii);
  const width = tii.bounds.r - tii.bounds.l;
  const half = 50; // the mailbox's half width in spawnStreet
  const spice = { x: 3190, y: 779 }; // Tii Street's Spice Plant (planner and server data)

  it('the Tii Street mailbox moves off the Spice Plant onto the floor', () => {
    const moved = clearOfDoors({ x: 3115, y: 778 }, half, treeObstacles([spice]), platforms, width);
    const reach = TREE_OBSTACLE_W / 2 + half + DOOR_CLEARANCE;
    assert.ok(Math.abs(moved.x - spice.x) >= reach - 1, JSON.stringify(moved));
    assert.ok(Math.abs(moved.y - spice.y) <= 60, JSON.stringify(moved));
  });

  it('a spot clear of every tree stays put, and bad points are ignored', () => {
    const far = { x: 1500, y: 860 };
    assert.deepEqual(clearOfDoors(far, half, treeObstacles([spice, { x: NaN, y: 1 }]), platforms, width), far);
    assert.deepEqual(treeObstacles([null, { x: 1 }]), []);
  });

  it('spawnStreet counts the planned trees with the doors', () => {
    assert.match(src, /const doors = \[\.\.\.\(engine\.street\?\.doors \|\| \[\]\), \.\.\.treeObstacles\(engine\.placement\('trees'\)\)\];/);
  });
});
