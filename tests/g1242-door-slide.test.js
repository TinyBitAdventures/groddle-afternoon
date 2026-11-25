/**
 * G1242 (report #634): a placed Door between house floors slides along its own floor.
 *
 * Glitch refused a placed Door's pick-up (items/furniture_door.js canPickup 531-534) but moved it:
 * main.js doFurnitureMove 7051-7106 keeps its y ("Don't move doors from their y position",
 * msg.y = item.y), moves its geo door to the new x and points the other floor's Door at it
 * (target_door.connect.x = msg.x); the client keeps the drag on the Door's own plat
 * (HandOfDecorator.as 1269-1273 door_plat_id). inc_homes.js 741-788 builds each pair from both
 * Doors' own x: floor_N_up stands at doors_up[N-1].x and leads to doors_down[N].x, and back.
 * Run: node --test tests/g1242-door-slide.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  DOOR_CLASS,
  addFloor,
  createFloorsState,
  doorDestination,
  doorLiftCheck,
  expandHouseFloors,
  slideDoor,
  unexpandHouseFloors,
} from '../public/js/home-floors.js?v=459925ff';
import { createHomeDecorState, placeFurniture, placementSpan, furnitureSize, interiorWidth } from '../public/js/home-decor.js?v=31f37d9b';
import { homesFeature, visitorHomeState } from '../public/js/features/homes-feature.js?v=92e952c9';

const GLITCH = join(homedir(), 'Documents/glitch-audit');
const read = (f) => (existsSync(join(GLITCH, f)) ? readFileSync(join(GLITCH, f), 'utf8') : null);

/** A two-floor house: the ground floor's Door at x leads up to the second floor's Door. */
function twoFloors(x = 600) {
  const ground = createHomeDecorState({ starterKit: true, wall: 'creamy_stripes', floor: 'woodpanel', ceiling: 'whitewood_ceiling' });
  ground.storage[DOOR_CLASS] = 1;
  const door = placeFurniture(ground, {}, DOOR_CLASS, { x }).item;
  const fs = createFloorsState();
  fs.pending = { floor: 0, id: door.id };
  const res = addFloor(fs, ground);
  assert.equal(res.ok, true);
  const upper = fs.upper[0];
  const down = upper.placed.find((row) => row.id === res.link.down);
  return { fs, ground, upper, door, down };
}

/** The x range a Door may stand in on this floor (inside the walls). */
function doorRange(state) {
  const { left, right } = placementSpan(state, DOOR_CLASS, 'bookshelf');
  const half = Math.ceil(furnitureSize(DOOR_CLASS).w / 2);
  return { min: left + half, max: right - half };
}

describe('G1242 the source', () => {
  it('doFurnitureMove keeps a Door\'s y and moves its link; the client keeps it on its plat', () => {
    const main = read('glitch-GameServerJS/main.js');
    if (main) {
      assert.ok(main.includes('// Don\'t move doors from their y position'));
      assert.match(main, /target_door\.connect\.x = intval\(msg\.x\);/);
    }
    const homes = read('glitch-GameServerJS/locations/inc_homes.js');
    if (homes) assert.match(homes, /x: this\.cfg\.doors_down\[i\]\.x,\s+y: bounds\[i\]\.b-120,/);
    const hod = read('glitch-client/com/tinyspeck/engine/control/HandOfDecorator.as');
    if (hod) assert.ok(hod.includes('//make it so that the only plat it can go on is the current plat it is on.'));
  });
});

describe('G1242 a placed Door slides along its floor (#634)', () => {
  it('sideways: the Door moves and its end of the link follows; the other Door stays', () => {
    const { fs, ground, upper, door, down } = twoFloors(600);
    const res = slideDoor(fs, ground, 0, door.id, { x: 420, y: door.y });
    assert.equal(res.ok, true);
    assert.equal(door.x, 420);
    assert.equal(fs.links[0].upX, 420);
    assert.equal(fs.links[0].downX, 600);
    assert.equal(down.x, 600, 'the Door upstairs did not move');
    // And the Door upstairs on its own floor: its end only.
    assert.equal(slideDoor(fs, upper, 1, down.id, { x: 780 }).ok, true);
    assert.equal(down.x, 780);
    assert.deepEqual([fs.links[0].upX, fs.links[0].downX], [420, 780]);
  });

  it('never up or down, never to another floor, and never through the walls', () => {
    const { fs, ground, upper, door, down } = twoFloors(600);
    const y = door.y;
    const plat = door.plat;
    slideDoor(fs, ground, 0, door.id, { x: 500, y: y - 260 });
    assert.equal(door.y, y, 'its y is kept (msg.y = item.y)');
    assert.equal(door.plat, plat);
    slideDoor(fs, ground, 0, door.id, { x: 500, y: y + 80, plat: 'front' });
    assert.equal(door.y, y);
    assert.equal(door.plat, plat);
    // Each floor is its own room (one decor each): a slide works on the room it is in, so the
    // Door stays on its floor, the other floor is untouched and the link joins the same floors.
    const upstairs = JSON.stringify(upper.placed);
    slideDoor(fs, ground, 0, door.id, { x: 300, y: y - 500 });
    assert.equal(JSON.stringify(upper.placed), upstairs);
    assert.equal(ground.placed.includes(door), true);
    assert.equal(upper.placed.includes(down), true);
    assert.deepEqual([fs.links[0].floor, fs.links[0].up, fs.links[0].down], [0, door.id, down.id]);
    // Something that is not a Door is not slid by the Door's rule.
    const chair = ground.placed.find((row) => row.classTsid !== DOOR_CLASS);
    if (chair) assert.equal(slideDoor(fs, ground, 0, chair.id, { x: 300 }).ok, false);
    const { min, max } = doorRange(ground);
    slideDoor(fs, ground, 0, door.id, { x: -900 });
    assert.equal(door.x, min);
    slideDoor(fs, ground, 0, door.id, { x: 99999 });
    assert.equal(door.x, max);
    assert.equal(fs.links[0].upX, max);
  });

  it('its pick-up is still refused after a slide', () => {
    const { fs, ground, door, down } = twoFloors(600);
    slideDoor(fs, ground, 0, door.id, { x: 450 });
    assert.equal(doorLiftCheck(fs, 0, door.id).msg, "You can't pick up placed doors.");
    assert.equal(doorLiftCheck(fs, 1, down.id).msg, "You can't pick up placed doors.");
  });

  it('walking through lands at the other Door\'s own x', () => {
    const { fs, ground, upper, door, down } = twoFloors(600);
    slideDoor(fs, ground, 0, door.id, { x: 400 });
    slideDoor(fs, upper, 1, down.id, { x: 760 });
    assert.deepEqual(doorDestination(fs, 0, door.id), { floor: 1, x: 760, via: down.id, dir: 'up' });
    assert.deepEqual(doorDestination(fs, 1, down.id), { floor: 0, x: 400, via: door.id, dir: 'down' });
  });

  it('the expansion still works, and a Door can then slide into the new wall', () => {
    const { fs, ground, upper, door, down } = twoFloors(600);
    slideDoor(fs, ground, 0, door.id, { x: 450 });
    const before = doorRange(ground).max;
    const res = expandHouseFloors(fs, ground, { wall_segment: 2, grade_aa_earth_block: 1, girder: 1 });
    assert.equal(res.ok, true);
    assert.equal(upper.wallSegments, ground.wallSegments);
    assert.deepEqual([door.x, down.x], [450, 600], 'growing moves no Door');
    slideDoor(fs, upper, 1, down.id, { x: 99999 });
    assert.ok(down.x > before, 'the new wall is room for the Door');
    assert.equal(fs.links[0].downX, down.x);
    // Un-expand: the Door in the last 300 px moves 150 left on its own floor, and only its end follows.
    const edge = interiorWidth(upper) - 300;
    assert.ok(down.x >= edge && door.x < edge);
    const wasDown = down.x;
    assert.equal(unexpandHouseFloors(fs, ground, {}).ok, true);
    assert.ok(down.x <= wasDown - 150);
    assert.deepEqual([fs.links[0].upX, fs.links[0].downX], [door.x, down.x]);
    assert.equal(door.x, 450);
  });
});

describe('G1242 saves', () => {
  it('an old save (one x for both Doors) keeps both where they were', () => {
    const { fs, ground } = twoFloors(600);
    const old = JSON.parse(JSON.stringify({ ...fs, upper: fs.upper.map(({ storage, ...rest }) => rest) }));
    old.links = old.links.map(({ upX, downX, ...rest }) => ({ ...rest, x: 600 }));
    const back = createFloorsState(old, ground);
    assert.deepEqual(back.links.map((l) => [l.upX, l.downX]), [[600, 600]]);
    assert.equal(doorDestination(back, 0, back.links[0].up).x, 600);
    assert.equal(doorDestination(back, 1, back.links[0].down).x, 600);
    assert.equal(back.upper[0].placed.find((row) => row.id === back.links[0].down).x, 600);
    // Through homes-feature: the next save holds each end's own x, nothing moved.
    const engine = { param: () => null, setData() {} };
    homesFeature.restore({ decor: ground, floors: old }, engine);
    const saved = homesFeature.save();
    assert.deepEqual(saved.floors.links.map((l) => [l.floor, l.upX, l.downX]), [[0, 600, 600]]);
    assert.equal(saved.decor.placed.find((row) => row.classTsid === DOOR_CLASS).x, 600);
  });

  it('a moved Door is saved where it stands, and a visitor sees it there', () => {
    const { fs, ground, door } = twoFloors(600);
    slideDoor(fs, ground, 0, door.id, { x: 420 });
    const engine = { param: () => null, setData() {} };
    homesFeature.restore({ decor: ground, floors: { ...fs, upper: fs.upper.map(({ storage, ...rest }) => rest) } }, engine);
    const saved = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.deepEqual(saved.floors.links.map((l) => [l.upX, l.downX]), [[420, 600]]);
    // neighbours-mp-feature hands the site's view (the owner's homes slice) to visitorHomeState.
    const v = visitorHomeState({ homes: saved, home: { style: 'meadow' } });
    assert.equal(v.decor.placed.find((row) => row.id === door.id).x, 420);
  });
});
