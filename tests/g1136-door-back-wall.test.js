/**
 * G1136 / #612: a placed Door stands at the base of the back wall, its point
 * 65 px behind the walk line, on every floor (inc_homes.js homes_rebuild_floor
 * 749-750: doors at b - (108 + frame_height); the walk line at b - (43 +
 * frame_height)). The art's bottom is its base SWF's foot (4 px) under that.
 * Saved Doors move there on load, and a Door draws behind the room's other
 * floor pieces (CHASSIS). Every other floor piece's depth: g1136-furniture-depth.
 * Run: node --test tests/g1136-door-back-wall.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DOOR_CLASS, addFloor, createFloorsState } from '../public/js/home-floors.js?v=17371532';
import {
  DOOR_FOOT_Y,
  INTERIOR,
  PLAT_DEPTH,
  createHomeDecorState,
  floorRestY,
  moveFurniture,
  normalizeHomeDecorState,
  placeFurniture,
  renderOrder,
  restY,
} from '../public/js/home-decor.js?v=c63e5e16';

function houseWithDoor(x = 600) {
  const ground = createHomeDecorState({ starterKit: true });
  ground.storage[DOOR_CLASS] = 1;
  ground.storage.furniture_chair = 1;
  const placed = placeFurniture(ground, {}, DOOR_CLASS, { x, y: INTERIOR.floorY });
  assert.equal(placed.ok, true);
  return { ground, door: placed.item };
}

describe('G1136: the Door stands at the back wall', () => {
  it('stands on the bookshelf plat, 65 px behind the walk line; a chair on its own plat', () => {
    assert.equal(PLAT_DEPTH.bookshelf, -65);
    assert.equal(DOOR_FOOT_Y, INTERIOR.floorY - 65 + 4);
    assert.equal(floorRestY(DOOR_CLASS), DOOR_FOOT_Y);
    const { ground, door } = houseWithDoor();
    assert.equal(door.y, DOOR_FOOT_Y);
    assert.equal(door.plat, 'bookshelf');
    const chair = placeFurniture(ground, {}, 'furniture_chair', { x: 300, y: INTERIOR.floorY });
    assert.equal(chair.item.plat, 'chair');
    assert.equal(chair.item.y, restY('furniture_chair', 'chair'));
  });

  it('stays there when moved', () => {
    const { ground, door } = houseWithDoor();
    const moved = moveFurniture(ground, door.id, { x: 400, y: INTERIOR.floorY + 30 });
    assert.equal(moved.ok, true);
    assert.equal(ground.placed.find((r) => r.id === door.id).y, DOOR_FOOT_Y);
  });

  it('the Door down on a new floor stands there too', () => {
    const fs = createFloorsState();
    const { ground, door } = houseWithDoor();
    fs.pending = { floor: 0, id: door.id };
    const res = addFloor(fs, ground);
    assert.equal(res.ok, true);
    assert.equal(res.decor.placed.find((r) => r.id === res.link.down).y, DOOR_FOOT_Y);
  });

  it('a saved Door on the walk line moves back on load, and a saved chair to its own plat', () => {
    const saved = {
      geo: 2,
      starterKit: true,
      placed: [
        { id: 1, classTsid: DOOR_CLASS, slot: 'floor', x: 600, y: INTERIOR.floorY, z: 2 },
        { id: 2, classTsid: 'furniture_chair', slot: 'floor', x: 300, y: INTERIOR.floorY, z: 1 },
      ],
      nextId: 3,
    };
    const state = normalizeHomeDecorState(saved);
    assert.equal(state.placed.find((r) => r.id === 1).y, DOOR_FOOT_Y);
    assert.equal(state.placed.find((r) => r.id === 2).y, restY('furniture_chair', 'chair'));
    // Back to front: the Door before the chair, though its z is higher.
    assert.deepEqual(renderOrder(state).map((r) => r.id), [1, 2]);
  });
});
