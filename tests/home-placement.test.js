import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js';
import {
  INTERIOR,
  PLACEMENT_INSET,
  SEGMENT_W,
  TOWER_ROOM,
  createHomeDecorState,
  furnitureSize,
  interiorWidth,
  normalizeHomeDecorState,
  placeFurniture,
  placementRoom,
  placementSpan,
  snapPlacement,
} from '../public/js/home-decor.js?v=g418-1';

const GS = join(import.meta.dirname, '..', '..', 'glitch-GameServerJS');
const haveGs = existsSync(GS);

/** One class per userdeco set (placement_set in items/furniture_*.js). */
const BY_SET = {
  ceiling: 'furniture_ceilinglamp',
  wall: 'furniture_painting',
  bookshelf: 'furniture_bed',
  chair: 'furniture_table',
  rug: 'furniture_rug',
};

/** HandOfDecorator.as 1146: half_width_it_takes = Math.ceil(width / 2). */
const half = (cls) => Math.ceil(furnitureSize(cls).w / 2);
const towerState = () => normalizeHomeDecorState({ layout: 'tower', wallSegments: 6, starterKit: true });
const spanOf = (state, cls) => {
  const { left, right } = placementSpan(state, cls);
  return [left, right];
};

/** locations/inc_geo_builder.js geo_builder_room_plats run as the oracle. */
function sourcePlats(startX, endX) {
  const ctx = {};
  vm.runInNewContext(readFileSync(join(GS, 'locations/inc_geo_builder.js'), 'utf8'), ctx);
  const plats = [];
  ctx.geo_builder_room_plats(plats, startX, endX, 28);
  return Object.fromEntries(plats.map((p) => [p.placement_userdeco_set, [p.start.x, p.end.x]]));
}

describe('Tower floor placement plats (inc_geo_builder.js 122-182)', () => {
  it('starts the plats clear of the elevator column (tower.js 455-458)', { skip: !haveGs }, () => {
    const src = readFileSync(join(GS, 'locations/tower.js'), 'utf8');
    assert.match(src, /var start_x = geo_cfg\.left_offset \+ 32;/);
    assert.match(src, /var end_x = geo_cfg\.left_offset \+ \(\(geo_cfg\.wall_segments \+ 0\) \* 150\);/);
    assert.match(src, /'wall_segments'\t\t: 6,\s+'left_offset'\t\t: 145,/);
    assert.deepEqual(placementRoom(towerState()), { start: 177, end: 1045 });
  });

  it('gives every set the source span', { skip: !haveGs }, () => {
    const room = placementRoom(towerState());
    const plats = sourcePlats(room.start, room.end);
    assert.deepEqual(plats, {
      ceiling: [187, 1035],
      wall: [187, 1035],
      bookshelf: [177, 1045],
      chair: [167, 1055],
      rug: [135, 1087],
      front: [157, 1065],
    });
    for (const [set, cls] of Object.entries(BY_SET)) {
      assert.deepEqual(FURNITURE_CATALOG[cls].placementSet, [set], cls);
      assert.deepEqual(spanOf(towerState(), cls), plats[set], set);
    }
    for (const [set, inset] of Object.entries(PLACEMENT_INSET)) {
      assert.deepEqual([room.start + inset, room.end - inset], plats[set], set);
    }
  });

  it('lets a piece use the widest plat its placement_set names', () => {
    const tower = towerState();
    // furniture_floorlamp: bookshelf, chair, front
    assert.deepEqual(spanOf(tower, 'furniture_floorlamp'), [157, 1065]);
    // furniture_armchair: bookshelf, chair
    assert.deepEqual(spanOf(tower, 'furniture_armchair'), [167, 1055]);
  });

  it('keeps a wall piece and a rug placed at the far left off the elevator', () => {
    const tower = towerState();
    const wall = snapPlacement(tower, 'furniture_painting', { x: -999, y: 450 });
    assert.equal(wall.x, 187 + half('furniture_painting'));
    const rug = snapPlacement(tower, 'furniture_rug', { x: -999 });
    assert.equal(rug.x, 135 + half('furniture_rug'));
    const bed = snapPlacement(tower, 'furniture_bed', { x: -999 });
    assert.equal(bed.x, 177 + half('furniture_bed'));
    const far = snapPlacement(tower, 'furniture_painting', { x: 9999, y: 450 });
    assert.ok(far.x + furnitureSize('furniture_painting').w / 2 <= 1035);
    // The old rule let them run to the walk line at 130.
    assert.ok(wall.x - half('furniture_painting') > TOWER_ROOM.innerLeft);
  });

  it('moves a Tower floor saved under the old rule off the elevator column', () => {
    const h = half('furniture_painting');
    const state = normalizeHomeDecorState({
      layout: 'tower',
      wallSegments: 6,
      starterKit: true,
      placed: [{ id: 1, classTsid: 'furniture_painting', x: 130 + h, y: 450 }],
      geo: 2,
    });
    assert.equal(state.placed[0].x, 187 + h);
  });
});

describe('House placement plats (inc_homes.js 1484-1563)', () => {
  it('builds the same six plats as geo_builder_room_plats over the wall segments', { skip: !haveGs }, () => {
    const src = readFileSync(join(GS, 'locations/inc_homes.js'), 'utf8');
    assert.match(src, /var start_x = start \* 150;\s+var end_x = \(end \+ 1\) \* 150;/);
    const builder = readFileSync(join(GS, 'locations/inc_geo_builder.js'), 'utf8');
    const insets = (text) => [...text.matchAll(/'start'\s*: \{'x': start_x([+-]\d+)?, [^}]*\},\s*'end'\s*: \{'x': end_x([+-]\d+)?,[^}]*\},\s*'placement_userdeco_set'\s*: '(\w+)'/g)]
      .map((m) => [m[3], m[1] || '0', m[2] || '0']);
    const house = insets(src.slice(src.indexOf('// build the placement plats - they work by room')));
    assert.equal(house.length, 6);
    assert.deepEqual(house, insets(builder));
  });

  it('keeps furniture on the back wall, off the end caps', () => {
    const house = createHomeDecorState();
    const w = interiorWidth(house);
    assert.deepEqual(placementRoom(house), { start: SEGMENT_W, end: w - SEGMENT_W });
    if (haveGs) {
      const plats = sourcePlats(SEGMENT_W, w - SEGMENT_W);
      for (const [set, cls] of Object.entries(BY_SET)) assert.deepEqual(spanOf(house, cls), plats[set], set);
    }
    const painting = snapPlacement(house, 'furniture_painting', { x: -999, y: 450 });
    assert.equal(painting.x, 160 + half('furniture_painting'));
    assert.ok(painting.x - half('furniture_painting') > INTERIOR.endCapW);
  });

  it('still lays the starter room out inside its plats', () => {
    const house = createHomeDecorState({ storage: { furniture_bookcase: 1 } });
    const r = placeFurniture(house, {}, 'furniture_bookcase', { x: 0 });
    assert.ok(r.ok);
    assert.equal(r.item.x, SEGMENT_W + half('furniture_bookcase'));
  });
});
