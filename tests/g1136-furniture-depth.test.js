/**
 * G1136 / #612 (Austin 2026-11-22): every floor piece stands at the depth the original gave its
 * placement set, not only the Door. Glitch's rooms have one placement plat per set
 * (inc_homes.js homes_rebuild_floor 1497-1563 for a house floor, inc_geo_builder.js
 * geo_builder_room_plats 122-182 for a tower floor): bookshelf at b - (108 + frame_height),
 * chair 73, rug 43 and front 23, and the avatars' walk line at 43 (inc_homes.js 927-931,
 * tower.js 273). A piece's SWF stage bottom centre stood on its plat; the remake draws the art's
 * own bottom, its base SWF's foot under the line (tools/furniture-upgrades/base.json).
 * HandOfDecorator.as 1118-1127 put a piece with more than one set on the nearest of its plats under
 * the pointer (10 px over it counted). The client drew them back to front by plat: CHASSIS (the
 * Door), WALL_FURN, RUG_FURN, BOOKSHELF_FURN, CHAIR_FURN, then the avatars, then FG_FURN (front
 * and ceiling) over them (MiddleGroundRenderer.setupEndShapes, LocationRenderer.as 1440-1470).
 * Saved pieces, all on the walk line before (a Door on the back wall's base), go on load to the
 * plat of their class nearest where their art stood, so a room changes least; the back plat on a tie
 * (Austin 2026-11-22). A piece saved with a plat keeps it.
 *
 * Run: node --test tests/g1136-furniture-depth.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FURNITURE_HOLDERS,
  INTERIOR,
  PLAT_DEPTH,
  createHomeDecorState,
  furnitureDrawsInFront,
  furnitureHolderOf,
  moveFurniture,
  nearestStandSet,
  normalizeHomeDecorState,
  placeFurniture,
  placementSpan,
  platLineY,
  renderOrder,
  restY,
  snapPlacement,
  standSetAt,
  standingSets,
} from '../public/js/home-decor.js?v=0fd93a2f';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=0367f90f';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=0b2cf3cc';

const root = join(import.meta.dirname, '..');
const GSJS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client/com/tinyspeck/engine');
const BASE = JSON.parse(readFileSync(join(root, 'tools/furniture-upgrades/base.json'), 'utf8'));

/** Glitch's values: each set's plat, px above the floor bound (+ frame_height), and the walk line. */
const GLITCH_PLAT = { bookshelf: 108, chair: 73, rug: 43, front: 23 };
const GLITCH_WALK = 43;

/**
 * Every floor and rug class: its placement_set (items/<class>.js) and its base SWF's foot.
 * 29 floor classes (28 and the Door) and the Rug.
 */
const CLASSES = [
  ['furniture_chair', ['chair', 'bookshelf'], -17],
  ['furniture_armchair', ['bookshelf', 'chair'], -25],
  ['furniture_bench', ['bookshelf', 'chair'], -20],
  ['furniture_stool', ['bookshelf', 'chair'], -13],
  ['furniture_sofa', ['bookshelf', 'chair'], -22],
  ['furniture_loveseat', ['bookshelf', 'chair'], -22],
  ['furniture_coffeetable', ['bookshelf', 'chair'], -27],
  ['furniture_sidetable', ['bookshelf', 'chair'], -18],
  ['furniture_desk', ['bookshelf', 'chair'], -21],
  ['furniture_counter', ['bookshelf', 'chair'], -22],
  ['bag_furniture_smallcabinet', ['bookshelf', 'chair'], -24],
  ['furniture_bed', ['bookshelf'], -45],
  ['furniture_bookcase', ['bookshelf'], -20],
  ['furniture_cabinet', ['bookshelf'], -14],
  ['furniture_fireplace', ['bookshelf'], -24],
  ['bag_furniture_cabinet', ['bookshelf'], -25],
  ['bag_furniture_largecabinet', ['bookshelf'], 0],
  ['furniture_door', ['bookshelf'], -4],
  ['furniture_table', ['chair'], -25],
  ['furniture_floorlamp', ['bookshelf', 'chair', 'front'], -15],
  ['furniture_roomdeco', ['bookshelf', 'chair', 'front'], -23],
  ['furniture_smallbackfloordeco', ['bookshelf', 'chair', 'front'], -18],
  ['furniture_largebackfloordeco', ['bookshelf', 'chair', 'front'], -23],
  ['furniture_smallfrontfloordeco', ['bookshelf', 'chair', 'front'], -11],
  ['furniture_largefrontfloordeco', ['bookshelf', 'chair', 'front'], -9],
  ['furniture_tablelamp', ['bookshelf', 'chair', 'front'], 0],
  ['furniture_tabledeco', ['bookshelf', 'chair', 'front'], 0],
  ['furniture_smalltabledeco', ['bookshelf', 'chair', 'front'], -6],
  ['furniture_largetabledeco', ['bookshelf', 'chair', 'front'], -11],
  ['furniture_rug', ['rug'], -24],
];

/**
 * Where a save from before plats puts each class: its art's bottom stood on the walk line (the Door
 * 65 px behind it, a rug 18 px in front), and the plat whose rest line is nearest that wins. A
 * sofa and the coffee table in front of it both go to the chair line, so z keeps the table in front.
 */
const MIGRATED = {
  furniture_chair: 'chair',
  furniture_armchair: 'chair',
  furniture_bench: 'chair',
  furniture_stool: 'chair',
  furniture_sofa: 'chair',
  furniture_loveseat: 'chair',
  furniture_coffeetable: 'chair',
  furniture_sidetable: 'chair',
  furniture_desk: 'chair',
  furniture_counter: 'chair',
  bag_furniture_smallcabinet: 'chair',
  furniture_bed: 'bookshelf',
  furniture_bookcase: 'bookshelf',
  furniture_cabinet: 'bookshelf',
  furniture_fireplace: 'bookshelf',
  bag_furniture_cabinet: 'bookshelf',
  bag_furniture_largecabinet: 'bookshelf',
  furniture_door: 'bookshelf',
  furniture_table: 'chair',
  furniture_floorlamp: 'chair',
  furniture_roomdeco: 'chair',
  furniture_smallbackfloordeco: 'chair',
  furniture_largebackfloordeco: 'chair',
  furniture_smallfrontfloordeco: 'chair',
  furniture_largefrontfloordeco: 'chair',
  // Art with no foot stood 20 px over the front plat's rest line and 30 over the chair's.
  furniture_tablelamp: 'front',
  furniture_tabledeco: 'front',
  furniture_smalltabledeco: 'chair',
  furniture_largetabledeco: 'chair',
  furniture_rug: 'rug',
};

/** Where the old code stood each class's art bottom (DOOR_FOOT_Y, the rug's 18 px, the walk line). */
const oldY = (cls) => (cls === 'furniture_door' ? INTERIOR.floorY - 65 : cls === 'furniture_rug' ? INTERIOR.floorY + 18 : INTERIOR.floorY);

describe("G1136: each placement set's depth is Glitch's", () => {
  it('the four standing plats sit where homes_rebuild_floor put them', () => {
    for (const [set, up] of Object.entries(GLITCH_PLAT)) {
      assert.equal(PLAT_DEPTH[set], GLITCH_WALK - up, set);
      assert.equal(platLineY(set), INTERIOR.floorY - (up - GLITCH_WALK), set);
    }
  });

  it('the house and tower plat builders say so', { skip: !existsSync(GSJS) && 'glitch-GameServerJS not beside the repo' }, () => {
    const house = readFileSync(join(GSJS, 'locations/inc_homes.js'), 'utf8');
    const tower = readFileSync(join(GSJS, 'locations/inc_geo_builder.js'), 'utf8');
    for (const [src, off] of [[house, 'cfg.frame_height'], [tower, 'y_offset']]) {
      for (const [set, up] of Object.entries(GLITCH_PLAT)) {
        const re = new RegExp(`'start'\\s*:\\s*\\{'x': start_x[^}]*'y': 0 - \\((\\d+) \\+ ${off.replace('.', '\\.')}\\)\\}[\\s\\S]{0,200}'placement_userdeco_set'\\s*:\\s*'${set}'`);
        assert.equal(Number(re.exec(src)?.[1]), up, `${set} in ${off}`);
      }
    }
    // The walk line (the avatars' floor platform) and the Doors.
    assert.match(house, /'platform_pc_perm'\s*:\s*-1,\s*'start'\s*:\s*\{'x' : floor_start,\s*'y': 0 - \(43 \+ cfg\.frame_height\)\}/);
    assert.match(house, /doors_up\[i-1\]\.apiSetXY\(this\.cfg\.doors_up\[i-1\]\.x, bounds\[i-1\]\.b - \(108 \+ cfg\.frame_height\)\)/);
    const towerSrc = readFileSync(join(GSJS, 'locations/tower.js'), 'utf8');
    assert.match(towerSrc, /var floor_y = 0 - \(frame_h \+ 43\);/);
    assert.match(towerSrc, /this\.geo_builder_room_plats\(plats, start_x, end_x, frame_h\);/);
  });

  it('every floor class stands on its first plat by default, its foot under the line', () => {
    const floorClasses = Object.values(FURNITURE_CATALOG).filter((def) => def.slot === 'floor' || def.slot === 'rug').map((def) => def.classTsid).sort();
    assert.deepEqual(floorClasses, CLASSES.map(([cls]) => cls).sort());
    for (const [cls, sets, foot] of CLASSES) {
      assert.deepEqual(standingSets(cls), sets, cls);
      if (Number.isFinite(BASE[cls]?.foot)) assert.equal(BASE[cls].foot, foot, `${cls} base.json foot`);
      assert.equal(Number(FURNITURE_CATALOG[cls].art.foot) || 0, foot, `${cls} catalog foot`);
      const state = createHomeDecorState({ storage: { [cls]: 1 } });
      const placed = placeFurniture(state, {}, cls, { x: 500 }).item;
      const want = platLineY(sets[0]) - foot;
      assert.equal(placed.y, want, cls);
      if (FURNITURE_CATALOG[cls].slot === 'floor') assert.equal(placed.plat, sets[0], cls);
      for (const set of sets) assert.equal(restY(cls, set), platLineY(set) - foot, `${cls} on ${set}`);
    }
  });

  it('a class with no standing set (a trophy) and wall and ceiling pieces keep their own lines', () => {
    assert.deepEqual(standingSets('furniture_shelf'), []);
    assert.deepEqual(standingSets('furniture_ceilinglamp'), []);
    const state = createHomeDecorState({ storage: { furniture_ceilinglamp: 1 } });
    assert.equal(placeFurniture(state, {}, 'furniture_ceilinglamp', { x: 500, y: 600 }).item.y, INTERIOR.ceilingY);
  });

  it('the plat is the nearest under the pointer, else the nearest of all (HandOfDecorator)', () => {
    const lamp = 'furniture_floorlamp';
    const foot = -15;
    // Pointer well above the floor: every plat is under it, the bookshelf's is nearest.
    assert.equal(standSetAt(lamp, 300), 'bookshelf');
    // Just behind the chair line (its point 5 px over it): the chair's.
    assert.equal(standSetAt(lamp, platLineY('chair') - 5 - foot), 'chair');
    // 9 px under the chair line still counts the chair's (10 px allowance).
    assert.equal(standSetAt(lamp, platLineY('chair') + 9 - foot), 'chair');
    // On the walk line: the front plat is the only one under it.
    assert.equal(standSetAt(lamp, INTERIOR.floorY - foot), 'front');
    // Past every plat: the nearest of all.
    assert.equal(standSetAt('furniture_sofa', 900), 'chair');
    // A chosen plat holds; one the class has not is ignored.
    assert.equal(snapPlacement(createHomeDecorState(), 'furniture_sofa', { x: 500, plat: 'chair' }).plat, 'chair');
    assert.equal(snapPlacement(createHomeDecorState(), 'furniture_sofa', { x: 500, plat: 'front' }).plat, 'bookshelf');
  });

  it("the client's own rule, as the test reads it", { skip: !existsSync(CLIENT) && 'glitch-client not beside the repo' }, () => {
    const hod = readFileSync(join(CLIENT, 'control/HandOfDecorator.as'), 'utf8');
    assert.match(hod, /private const plat_under_allowance:int = 10;/);
    assert.match(hod, /const placement_plats:Vector\.<PlatformLine> = PlatformLine\.getPlatsBelowY\(item_plats, find_y-plat_under_allowance\);\s*var closest:Object = PlatformLine\.getClosestToXYObject\(placement_plats, find_x, find_y, true, 0, false\);[\s\S]{0,80}if \(!closest\) \{\s*item_ps = true;\s*closest = PlatformLine\.getClosestToXYObject\(item_plats/);
  });

  it("a piece stays inside its own plat's ends", () => {
    const state = createHomeDecorState();
    const back = placementSpan(state, 'furniture_sofa', 'bookshelf');
    const chair = placementSpan(state, 'furniture_sofa', 'chair');
    assert.equal(chair.left, back.left - 10);
    assert.equal(chair.right, back.right + 10);
  });

  it('a move keeps its plat unless pulled to another; a restyle keeps it and takes the new foot', () => {
    const state = createHomeDecorState({ storage: { furniture_sofa: 1, furniture_tablelamp: 1 } });
    const sofa = placeFurniture(state, {}, 'furniture_sofa', { x: 500 }).item;
    assert.equal(sofa.plat, 'bookshelf');
    moveFurniture(state, sofa.id, { x: 600, y: sofa.y });
    assert.equal(sofa.plat, 'bookshelf');
    moveFurniture(state, sofa.id, { x: 600, y: restY('furniture_sofa', 'chair') });
    assert.equal(sofa.plat, 'chair');
    assert.equal(sofa.y, platLineY('chair') + 22);
    // A style whose art reaches 30 px under its point (upgrade 345, measured on its zoom-3 art, #669): same plat, 8 px lower.
    assert.equal(FURNITURE_UPGRADES.furniture_sofa.upgrades['345'].art.foot, -30);
    sofa.upgradeId = '345';
    moveFurniture(state, sofa.id, { x: sofa.x, y: sofa.y, plat: sofa.plat });
    assert.equal(sofa.plat, 'chair');
    assert.equal(sofa.y, platLineY('chair') + 30);
  });

  it('saved pieces from the walk line go to the plat nearest where they stood; a saved plat stays', () => {
    assert.deepEqual(Object.keys(MIGRATED).sort(), CLASSES.map(([cls]) => cls).sort());
    const placed = CLASSES.map(([classTsid], i) => ({ id: i + 1, classTsid, slot: FURNITURE_CATALOG[classTsid].slot, x: 600, y: oldY(classTsid), z: i }));
    placed.push({ id: 99, classTsid: 'furniture_sofa', slot: 'floor', x: 300, y: 1, plat: 'bookshelf', z: 99 });
    placed.push({ id: 100, classTsid: 'furniture_chair', slot: 'floor', x: 300, y: INTERIOR.floorY, plat: 'front', z: 100 });
    for (const layout of ['house', 'tower']) {
      const state = normalizeHomeDecorState({ geo: 2, layout, wallSegments: 7, placed, nextId: 101 });
      for (const [cls, , foot] of CLASSES) {
        const row = state.placed.find((r) => r.classTsid === cls && r.id <= CLASSES.length);
        const set = MIGRATED[cls];
        assert.equal(row.y, platLineY(set) - foot, `${layout} ${cls}`);
        if (row.slot === 'floor') assert.equal(row.plat, set, `${layout} ${cls} plat`);
      }
      // A plat saved since stays, wherever its y says.
      const sofa = state.placed.find((r) => r.id === 99);
      assert.equal(sofa.plat, 'bookshelf');
      assert.equal(sofa.y, platLineY('bookshelf') + 22);
      // A chair cannot stand on the front plat: the nearest of its own instead.
      assert.equal(state.placed.find((r) => r.id === 100).plat, 'chair');
      // The coffee table still draws in front of the sofa it stood before.
      const order = renderOrder(state).map((r) => r.classTsid);
      assert.ok(order.indexOf('furniture_sofa') < order.indexOf('furniture_coffeetable'));
    }
  });

  it('the nearest plat by the art bottom, the back one on a tie', () => {
    // A floor lamp's art bottom 15 px under the walk line: chair rest 15 px off, front 35.
    assert.equal(nearestStandSet('furniture_floorlamp', INTERIOR.floorY), 'chair');
    assert.equal(nearestStandSet('furniture_floorlamp', INTERIOR.floorY + 30), 'front');
    // Halfway between the chair and front rest lines: the chair's.
    const mid = (restY('furniture_floorlamp', 'chair') + restY('furniture_floorlamp', 'front')) / 2;
    assert.equal(nearestStandSet('furniture_floorlamp', mid), 'chair');
    assert.equal(nearestStandSet('furniture_floorlamp', mid + 1), 'front');
    // Well behind the walk line: the back wall.
    assert.equal(nearestStandSet('furniture_sofa', INTERIOR.floorY - 50), 'bookshelf');
    assert.equal(nearestStandSet('furniture_shelf', INTERIOR.floorY), null);
  });
});

describe('G1136: back to front by plat, the avatars between', () => {
  const room = () => {
    const state = createHomeDecorState({
      storage: { furniture_table: 1, furniture_tablelamp: 1, furniture_floorlamp: 2, furniture_sofa: 1, furniture_door: 1, furniture_rug: 1, furniture_painting: 1, furniture_ceilinglamp: 1 },
    });
    // Set down front to back, so z alone would draw them the wrong way round.
    const lampFront = placeFurniture(state, {}, 'furniture_floorlamp', { x: 300, y: INTERIOR.floorY + 15 }).item;
    const table = placeFurniture(state, {}, 'furniture_table', { x: 500 }).item;
    const tablelamp = placeFurniture(state, {}, 'furniture_tablelamp', { x: 520 }).item;
    const sofa = placeFurniture(state, {}, 'furniture_sofa', { x: 520 }).item;
    const rug = placeFurniture(state, {}, 'furniture_rug', { x: 500 }).item;
    const ceiling = placeFurniture(state, {}, 'furniture_ceilinglamp', { x: 500 }).item;
    const painting = placeFurniture(state, {}, 'furniture_painting', { x: 400, y: 440 }).item;
    const door = placeFurniture(state, {}, 'furniture_door', { x: 800 }).item;
    return { state, lampFront, table, tablelamp, sofa, rug, ceiling, painting, door };
  };

  it('each piece draws in the holder of the plat it stands on', () => {
    const r = room();
    assert.deepEqual([...FURNITURE_HOLDERS], ['chassis', 'wall', 'rug', 'bookshelf', 'chair', 'front']);
    assert.equal(r.lampFront.plat, 'front');
    const holders = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'state').map(([k, row]) => [k, furnitureHolderOf(row)]));
    assert.deepEqual(holders, { lampFront: 'front', table: 'chair', tablelamp: 'chair', sofa: 'bookshelf', rug: 'rug', ceiling: 'front', painting: 'wall', door: 'chassis' });
  });

  it('renderOrder runs Door, wall, rug, back wall pieces, chair line, front; tabletop decor just over its table', () => {
    const r = room();
    const order = renderOrder(r.state).map((row) => row.id);
    assert.deepEqual(order, [r.door.id, r.painting.id, r.rug.id, r.sofa.id, r.table.id, r.tablelamp.id, r.lampFront.id, r.ceiling.id]);
    // Inside a holder, z: a piece restacked to the back draws first.
    const s2 = createHomeDecorState({ storage: { furniture_chair: 2 } });
    const a = placeFurniture(s2, {}, 'furniture_chair', { x: 300 }).item;
    const b = placeFurniture(s2, {}, 'furniture_chair', { x: 400 }).item;
    assert.deepEqual(renderOrder(s2).map((row) => row.id), [a.id, b.id]);
    a.z = b.z + 1;
    assert.deepEqual(renderOrder(s2).map((row) => row.id), [b.id, a.id]);
  });

  it('only front-plat and ceiling pieces draw over the avatars (FG_FURN)', () => {
    const r = room();
    const front = r.state.placed.filter(furnitureDrawsInFront).map((row) => row.id).sort();
    assert.deepEqual(front, [r.lampFront.id, r.ceiling.id].sort());
  });

  it('the client holders stand in that order around the avatars', { skip: !existsSync(CLIENT) && 'glitch-client not beside the repo' }, () => {
    const mg = readFileSync(join(CLIENT, 'view/renderer/MiddleGroundRenderer.as'), 'utf8');
    const names = [...mg.slice(mg.indexOf('override protected function setupEndShapes')).matchAll(/addChild\((\w+)\);/g)].map((m) => m[1]);
    const at = (n) => names.indexOf(n);
    for (const [a, b] of [['CHASSIS', 'WALL_FURN'], ['WALL_FURN', 'RUG_FURN'], ['RUG_FURN', 'BOOKSHELF_FURN'], ['BOOKSHELF_FURN', 'CHAIR_FURN'], ['CHAIR_FURN', 'YOUR_AVATAR'], ['YOUR_AVATAR', 'FG_FURN']]) {
      assert.ok(at(a) >= 0 && at(a) < at(b), `${a} before ${b}`);
    }
    const lr = readFileSync(join(CLIENT, 'view/renderer/LocationRenderer.as'), 'utf8');
    assert.match(lr, /placement_userdeco_set == 'bookshelf'\) \{\s*if \(lis\.item\.tsid == 'furniture_door'\) \{\s*mgr\.addChassisItem\(lis\);/);
    assert.match(lr, /placement_userdeco_set == 'front'\) \{\s*mgr\.addForegroundFurnitureItem\(lis\);/);
  });
});
