/**
 * G153 house floors (js/home-floors.js): the Door (items/furniture_door.js)
 * set down on the top floor opens Build a New Floor (quests/job_proto_door.js);
 * finishing it adds a floor (locations/inc_homes.js homes_add_floor_at) with
 * a Door down at the same x, up to config_base.js MAX_FLOORS 3.
 * Run: node --test tests/home-floors.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  DOOR_CLASS,
  DOOR_JOB,
  DOOR_JOB_PHASES,
  DOOR_TEXT,
  MAX_FLOORS,
  addFloor,
  clearPendingDoor,
  createFloorsState,
  doorArtKey,
  doorDestination,
  doorJobId,
  doorLiftCheck,
  doorPlaceCheck,
  doorRole,
  expandHouseFloors,
  floorCount,
  quoteHouseExpansion,
  quoteHouseUnexpand,
  unexpandHouseFloors,
  wallExpandItems,
} from '../public/js/home-floors.js?v=g448-3';
import { createHomeDecorState, placeFurniture } from '../public/js/home-decor.js?v=g448-3';
import { FURNITURE_CATALOG, FURNITURE_STORE } from '../public/js/homes-catalog.js';
import { furnitureStoreProfile } from '../public/js/features/homes-feature.js?v=g478-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const gsjs = (f) => (existsSync(join(GSJS, f)) ? readFileSync(join(GSJS, f), 'utf8') : null);

/** A ground floor with a Door placed at x from storage. */
function houseWithDoor(x = 600) {
  const ground = createHomeDecorState({ starterKit: true, wall: 'creamy_stripes', floor: 'woodpanel', ceiling: 'whitewood_ceiling' });
  ground.storage[DOOR_CLASS] = 1;
  const placed = placeFurniture(ground, {}, DOOR_CLASS, { x });
  assert.equal(placed.ok, true);
  return { ground, door: placed.item };
}

describe('the Door: source', () => {
  it('is furniture the Furniture Store sells for 2,500 and recipe 260 makes', () => {
    const def = FURNITURE_CATALOG[DOOR_CLASS];
    assert.equal(def.label, 'Door');
    assert.equal(def.baseCost, 2500);
    assert.equal(def.canFlip, false);
    assert.deepEqual(def.placementSet, ['bookshelf']);
    for (const p of Object.values(def.doorArt)) assert.ok(existsSync(join(root, 'public', p)), p);
    assert.equal(FURNITURE_STORE.offers.find((o) => o.classTsid === DOOR_CLASS).cost, 2500);
    assert.ok(furnitureStoreProfile().offers.some((o) => o.classTsid === DOOR_CLASS && o.buyPrice === 2500), 'the store lists it');
    const recipes = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes.json'), 'utf8'));
    assert.equal(recipes.furniture_door.id, '260');
    const door = gsjs('items/furniture_door.js');
    if (!door) return;
    assert.match(door, /"job_class_id"\s*: "job_proto_door"/);
    assert.ok(door.includes(`"tooltip"			: "${DOOR_TEXT.createTooltip}"`));
    assert.ok(door.includes(DOOR_TEXT.cantPickUp));
    assert.match(door, /this\.container\.homes_add_floor_at\(this\.x, this\);/);
    assert.match(gsjs('config_base.js'), /MAX_FLOORS\s*: 3,/);
    assert.equal(MAX_FLOORS, 3);
  });

  it('Build a New Floor is job_proto_door: 100 Planks, in the projects catalog', () => {
    const jobs = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
    const cls = jobs.classes[DOOR_JOB];
    assert.equal(cls.title, 'Build a New Floor');
    assert.equal(cls.completion, DOOR_TEXT.built);
    assert.deepEqual(cls.requirements.map((r) => [r.type, r.classId, r.num]), [['item', 'plank', 100]]);
    assert.deepEqual(DOOR_JOB_PHASES.map((p) => [p.classTsid, p.order, p.delaySeconds]), [[DOOR_JOB, 1, 60]]);
  });
});

describe('placing a Door (homes_can_add_door)', () => {
  it('only on the top floor, never in a Tower, one floor at a time, three floors at most', () => {
    const fs = createFloorsState();
    assert.equal(doorPlaceCheck(fs, { floor: 0 }).ok, true);
    assert.equal(doorPlaceCheck(fs, { floor: 0, tower: true }).msg, DOOR_TEXT.tower);
    const { ground, door } = houseWithDoor();
    fs.pending = { floor: 0, id: door.id };
    assert.equal(doorPlaceCheck(fs, { floor: 0 }).msg, DOOR_TEXT.busy);
    assert.equal(doorRole(fs, 0, door.id), 'pending');
    assert.equal(doorArtKey('pending'), 'up_job');
    assert.equal(doorJobId(fs), `home_floor_1_${door.id}`);
    addFloor(fs, ground);
    assert.equal(floorCount(fs), 2);
    assert.equal(doorPlaceCheck(fs, { floor: 0 }).msg, DOOR_TEXT.notTop);
    assert.equal(doorPlaceCheck(fs, { floor: 1 }).ok, true);
  });

  it('a Door whose project has not started can be picked up; after that, or once built, never', () => {
    const fs = createFloorsState();
    const { ground, door } = houseWithDoor();
    fs.pending = { floor: 0, id: door.id };
    assert.equal(doorLiftCheck(fs, 0, door.id, { inProgress: false }).ok, true);
    assert.deepEqual(doorLiftCheck(fs, 0, door.id, { inProgress: true }), { ok: false, role: 'pending', msg: "You can't pick up placed doors." });
    assert.equal(clearPendingDoor(fs).id, door.id);
    assert.equal(doorRole(fs, 0, door.id), null);
    fs.pending = { floor: 0, id: door.id };
    const res = addFloor(fs, ground);
    assert.equal(doorLiftCheck(fs, 0, door.id).msg, "You can't pick up placed doors.");
    assert.equal(doorLiftCheck(fs, 1, res.link.down).msg, "You can't pick up placed doors.");
  });
});

describe('a new floor (homes_add_floor_at)', () => {
  it('is as long as the house, papered with the top floor\'s first wall, its floor and ceiling, with a Door down at the same x', () => {
    const fs = createFloorsState();
    const { ground, door } = houseWithDoor(720);
    ground.walls[1] = 'red_brick';
    fs.pending = { floor: 0, id: door.id };
    const res = addFloor(fs, ground);
    assert.equal(res.ok, true);
    assert.equal(res.floor, 1);
    const up = res.decor;
    assert.equal(up.wallSegments, ground.wallSegments);
    assert.ok(up.walls.every((w) => w === 'red_brick'));
    assert.equal(up.floor, 'woodpanel');
    assert.equal(up.ceiling, 'whitewood_ceiling');
    const down = up.placed.find((row) => row.id === res.link.down);
    assert.equal(down.classTsid, DOOR_CLASS);
    assert.equal(down.x, 720);
    assert.equal(doorRole(fs, 0, door.id), 'up');
    assert.equal(doorRole(fs, 1, down.id), 'down');
    assert.deepEqual(doorDestination(fs, 0, door.id), { floor: 1, x: 720, via: down.id, dir: 'up' });
    assert.deepEqual(doorDestination(fs, 1, down.id), { floor: 0, x: 720, via: door.id, dir: 'down' });
    assert.equal(fs.pending, null);
  });

  it('the third floor is the last, and a save keeps floors, links and the floor you are on', () => {
    const fs = createFloorsState();
    const { ground, door } = houseWithDoor(600);
    fs.pending = { floor: 0, id: door.id };
    addFloor(fs, ground);
    const second = fs.upper[0];
    second.storage[DOOR_CLASS] = 1;
    const d2 = placeFurniture(second, {}, DOOR_CLASS, { x: 900 }).item;
    fs.pending = { floor: 1, id: d2.id };
    addFloor(fs, ground);
    assert.equal(floorCount(fs), 3);
    assert.equal(doorPlaceCheck(fs, { floor: 2 }).msg, DOOR_TEXT.full);
    fs.at = 2;
    const back = createFloorsState(JSON.parse(JSON.stringify({ ...fs, upper: fs.upper.map(({ storage, ...rest }) => rest) })), ground);
    assert.equal(floorCount(back), 3);
    assert.equal(back.at, 2);
    assert.deepEqual(back.links.map((l) => [l.floor, l.x]), [[0, 600], [1, d2.x]]);
    assert.equal(back.upper[1].placed.find((r) => r.classTsid === DOOR_CLASS).x, d2.x);
  });
});

describe('expanding a house with floors (homes_get_expand_costs, homes_extend)', () => {
  it('charges a Wall Segment a floor, Urth Blocks and Girders on two and three floors', () => {
    assert.deepEqual(wallExpandItems(1, 5), { wall_segment: 1 });
    assert.deepEqual(wallExpandItems(2, 5), { wall_segment: 2, grade_aa_earth_block: 1 });
    assert.deepEqual(wallExpandItems(2, 7), { wall_segment: 2, grade_aa_earth_block: 1, girder: 1 });
    assert.deepEqual(wallExpandItems(3, 7), { wall_segment: 3, grade_aa_earth_block: 3, girder: 3 });
    assert.deepEqual(wallExpandItems(3, 11), { wall_segment: 3, grade_aa_earth_block: 3, girder: 2 });
    const src = gsjs('locations/inc_homes.js');
    if (src) assert.match(src, /out\.wall\.items\[CLASS_WALL\] = num_floors;/);
  });

  it('every floor grows together, and nothing grows while a floor is being built', () => {
    const fs = createFloorsState();
    const { ground, door } = houseWithDoor();
    fs.pending = { floor: 0, id: door.id };
    assert.equal(quoteHouseExpansion(fs, ground, { wall_segment: 9 }).msg, DOOR_TEXT.locked);
    assert.equal(quoteHouseUnexpand(fs, ground).msg, DOOR_TEXT.locked);
    addFloor(fs, ground);
    const inv = { wall_segment: 2, grade_aa_earth_block: 1 };
    const before = ground.wallSegments;
    const res = expandHouseFloors(fs, ground, inv);
    assert.equal(res.ok, true);
    assert.deepEqual(inv, { wall_segment: 0, grade_aa_earth_block: 0 });
    assert.equal(ground.wallSegments, before + 1);
    assert.equal(fs.upper[0].wallSegments, before + 1);
    assert.equal(expandHouseFloors(fs, ground, { wall_segment: 1 }).reason, 'need_items');
    const refund = {};
    const un = unexpandHouseFloors(fs, ground, refund);
    assert.equal(un.ok, true);
    assert.equal(ground.wallSegments, before);
    assert.equal(fs.upper[0].wallSegments, before);
    assert.equal(refund.wood_post, 4, 'two floors refund twice');
    assert.deepEqual(un.items, quoteHouseUnexpand(fs, { ...ground, wallSegments: before + 1 }).items);
  });
});

describe('homes-feature keeps the floors', () => {
  it('saves and restores floors, links and the floor you are on; each upper floor keeps its own stacks', async () => {
    const { homesFeature } = await import('../public/js/features/homes-feature.js?v=g478-1');
    const engine = { param: () => null, setData() {} };
    const { ground, door } = houseWithDoor(600);
    const fs = createFloorsState();
    fs.pending = { floor: 0, id: door.id };
    addFloor(fs, ground);
    fs.at = 1;
    homesFeature.restore({ decor: ground, floors: { ...fs, upper: fs.upper.map(({ storage, ...rest }) => rest) } }, engine);
    const saved = homesFeature.save();
    assert.equal(saved.floors.upper.length, 1);
    assert.equal(saved.floors.at, 1);
    assert.equal(saved.floors.upper[0].storage, undefined, 'storage is the house\'s, saved once');
    assert.deepEqual(saved.floors.links.map((l) => [l.floor, l.x]), [[0, 600]]);
    assert.equal(homesFeature.dropTsid('RH_HOME_INT'), 'RH_HOME_FLOOR_1');
    homesFeature.restore({ decor: ground, floors: { ...saved.floors, at: 0 } }, engine);
    assert.equal(homesFeature.dropTsid('RH_HOME_INT'), null);
    assert.equal(homesFeature.dropTsid('RH_HOME_EXT'), null);
  });
});
