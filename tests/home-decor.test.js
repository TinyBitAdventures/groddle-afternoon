import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FURNITURE_CATALOG,
  FURNITURE_STARTER_KIT,
  FURNITURE_STORE,
  HOME_LIMITS,
  HOME_TEXTURE_CONFIGS,
} from '../public/js/homes-catalog.js';
import {
  INTERIOR,
  SEGMENT_W,
  createHomeDecorState,
  displayDeposit,
  displayWithdraw,
  expandInterior,
  flipFurniture,
  furnishDemoRoom,
  furnitureScale,
  grantStarterKit,
  interiorWidth,
  listPlaceable,
  moveFurniture,
  normalizeHomeDecorState,
  pickUpFurniture,
  placeFurniture,
  quoteInteriorExpansion,
  renderOrder,
  restackFurniture,
  setHomeTexture,
  snapPlacement,
} from '../public/js/home-decor.js';

const root = join(import.meta.dirname, '..', 'public');

describe('furniture catalog', () => {
  it('carries the source labels, base costs and placement sets', () => {
    const chair = FURNITURE_CATALOG.furniture_chair;
    assert.equal(chair.label, 'Chair');
    assert.equal(chair.baseCost, 450);
    assert.deepEqual(chair.placementSet, ['chair', 'bookshelf']);
    assert.equal(chair.slot, 'floor');
    assert.equal(FURNITURE_CATALOG.furniture_bed.baseCost, 1700);
    assert.equal(FURNITURE_CATALOG.furniture_shelf.slot, 'wall');
    assert.equal(FURNITURE_CATALOG.furniture_ceilinglamp.slot, 'ceiling');
    assert.equal(FURNITURE_CATALOG.furniture_rug.slot, 'rug');
    assert.equal(FURNITURE_CATALOG.furniture_table.canFlip, false);
    assert.equal(FURNITURE_CATALOG.furniture_tablelamp.tabletop, true);
  });

  it('links Construction Tool recipes and the Furniture Store (store 23)', () => {
    assert.deepEqual(FURNITURE_CATALOG.furniture_chair.recipe, { id: '252', tool: 'construction_tool', name: 'Chair' });
    assert.equal(FURNITURE_CATALOG.furniture_fireplace.recipe.id, '321');
    assert.equal(FURNITURE_CATALOG.furniture_rug.recipe.tool, 'loomer');
    assert.equal(FURNITURE_STORE.storeId, 23);
    assert.equal(FURNITURE_STORE.label, 'Furniture Store');
    assert.equal(FURNITURE_STORE.buyMultiplier, 0.5);
    assert.deepEqual(
      FURNITURE_STORE.offers.map((o) => `${o.classTsid}:${o.cost}`),
      ['furniture_door:2500', 'furniture_bed:1700', 'furniture_chair:450', 'furniture_sofa:1500']
    );
  });

  it('ships exact recovered art for every class', () => {
    for (const def of Object.values(FURNITURE_CATALOG)) {
      assert.ok(existsSync(join(root, def.art.path)), def.art.path);
      assert.ok(existsSync(join(root, 'assets/sprites/icons', `${def.classTsid}.png`)), def.classTsid);
      assert.ok(def.art.w > 0 && def.art.h > 0);
    }
    assert.deepEqual(FURNITURE_CATALOG.furniture_chair.art, { path: 'assets/sprites/furniture/furniture_chair.png', w: 72, h: 93 });
    assert.equal(furnitureScale('furniture_fireplace'), 0.5);
    assert.equal(furnitureScale('furniture_chair'), 1);
  });

  it('keeps the source starter kit and home limits', () => {
    assert.deepEqual(FURNITURE_STARTER_KIT, {
      furniture_chair: 1,
      furniture_table: 1,
      furniture_shelf: 2,
      furniture_ceilinglamp: 1,
      bag_furniture_smallcabinet: 1,
      furniture_floorlamp: 1,
      furniture_tabledeco: 1,
      furniture_roomdeco: 1,
      bag_furniture_sdb: 2,
      furniture_walldeco: 1,
    });
    assert.equal(HOME_LIMITS.START_WALL_SEGMENTS, 7);
    assert.equal(HOME_LIMITS.MAX_WALL_SEGMENTS, 20);
    assert.equal(HOME_TEXTURE_CONFIGS.walls.grey_unfinished.name, 'Drywall');
    assert.equal(HOME_TEXTURE_CONFIGS.floors.woodpanel.name, 'Wood Paneling');
  });
});

describe('decorating the house', () => {
  it('starts with the source drywall, unfinished floor and seven wall segments', () => {
    const state = createHomeDecorState();
    assert.equal(state.wall, 'grey_unfinished');
    assert.equal(state.floor, 'starter_crappy');
    assert.equal(state.ceiling, 'starter_crappy_ceiling');
    assert.equal(state.wallSegments, 7);
    assert.equal(interiorWidth(state), 7 * SEGMENT_W);
  });

  it('grants the starter kit once into private storage', () => {
    const state = createHomeDecorState();
    grantStarterKit(state);
    grantStarterKit(state);
    assert.equal(state.storage.furniture_shelf, 2);
    assert.equal(state.storage.bag_furniture_sdb, 2);
    const list = listPlaceable(state, { furniture_sofa: 1 });
    assert.ok(list.some((row) => row.classTsid === 'furniture_sofa' && row.packed === 1));
  });

  it('places from storage first, then the pack, snapping to each slot', () => {
    const state = createHomeDecorState({ storage: { furniture_chair: 1 } });
    const inv = { furniture_chair: 1, furniture_shelf: 1, furniture_ceilinglamp: 1, furniture_rug: 1 };
    const a = placeFurniture(state, inv, 'furniture_chair', { x: 400, y: 100 });
    assert.equal(a.from, 'storage');
    assert.equal(a.item.y, INTERIOR.floorY);
    const b = placeFurniture(state, inv, 'furniture_chair', { x: 600 });
    assert.equal(b.from, 'pack');
    assert.equal(inv.furniture_chair, 0);
    const shelf = placeFurniture(state, inv, 'furniture_shelf', { x: 500, y: 9999 });
    assert.equal(shelf.item.slot, 'wall');
    assert.ok(shelf.item.y <= INTERIOR.floorY - INTERIOR.wallMarginBottom);
    const lamp = placeFurniture(state, inv, 'furniture_ceilinglamp', { x: 500, y: 600 });
    assert.equal(lamp.item.y, INTERIOR.wallTop);
    const rug = placeFurniture(state, inv, 'furniture_rug', { x: 500 });
    assert.equal(rug.item.slot, 'rug');
    assert.equal(placeFurniture(state, inv, 'furniture_chair', { x: 500 }).reason, 'none');
  });

  it('clamps inside the end caps', () => {
    const state = createHomeDecorState();
    const at = snapPlacement(state, 'furniture_bed', { x: -500 });
    assert.equal(at.x, INTERIOR.endCapW + 142);
  });

  it('rests tabletop decor on tables and carries it when the table moves', () => {
    const state = createHomeDecorState({ storage: { furniture_table: 1, furniture_tablelamp: 1 } });
    const table = placeFurniture(state, {}, 'furniture_table', { x: 500 }).item;
    const lamp = placeFurniture(state, {}, 'furniture_tablelamp', { x: 520 }).item;
    assert.equal(lamp.on, table.id);
    assert.equal(lamp.y, INTERIOR.floorY - 80);
    moveFurniture(state, table.id, { x: 800 });
    assert.equal(lamp.x, 820);
    const order = renderOrder(state).map((row) => row.id);
    assert.ok(order.indexOf(lamp.id) > order.indexOf(table.id));
    pickUpFurniture(state, table.id);
    assert.equal(state.placed.length, 0);
    assert.equal(state.storage.furniture_table, 1);
    assert.equal(state.storage.furniture_tablelamp, 1);
  });

  it('flips only flippable pieces and restacks', () => {
    const state = createHomeDecorState({ storage: { furniture_chair: 1, furniture_table: 1 } });
    const chair = placeFurniture(state, {}, 'furniture_chair', { x: 300 }).item;
    const table = placeFurniture(state, {}, 'furniture_table', { x: 600 }).item;
    assert.equal(flipFurniture(state, chair.id).item.facingRight, false);
    assert.equal(flipFurniture(state, table.id).reason, 'cannot_flip');
    restackFurniture(state, chair.id);
    assert.ok(chair.z > table.z);
    restackFurniture(state, chair.id, true);
    assert.ok(chair.z < table.z);
  });

  it('shows off one item class in a Storage Display Box and blocks pickup until empty', () => {
    const state = createHomeDecorState({ storage: { bag_furniture_sdb: 1 } });
    const inv = { musicblock_d_blue_05: 3, apple: 2 };
    const box = placeFurniture(state, inv, 'bag_furniture_sdb', { x: 400, y: 500 }).item;
    assert.equal(displayDeposit(state, inv, box.id, 'musicblock_d_blue_05', 2).ok, true);
    assert.equal(displayDeposit(state, inv, box.id, 'apple', 1).reason, 'other_class');
    assert.equal(pickUpFurniture(state, box.id).reason, 'not_empty');
    assert.deepEqual(displayWithdraw(state, inv, box.id), { ok: true, classTsid: 'musicblock_d_blue_05', qty: 2 });
    assert.equal(inv.musicblock_d_blue_05, 3);
    assert.equal(pickUpFurniture(state, box.id).ok, true);
  });

  it('applies any visible wall, floor and ceiling swatch', () => {
    const state = createHomeDecorState();
    assert.equal(setHomeTexture(state, 'wall', 'creamy_stripes').name, 'Beige Striped Wallpaper');
    assert.equal(setHomeTexture(state, 'floor', 'woodpanel').ok, true);
    assert.equal(setHomeTexture(state, 'ceiling', 'nope').reason, 'unknown');
    assert.equal(normalizeHomeDecorState(JSON.parse(JSON.stringify(state))).wall, 'creamy_stripes');
  });

  it('expands one wall segment per Wall Segment up to the source maximum', () => {
    const state = createHomeDecorState({ wallSegments: 19 });
    assert.equal(quoteInteriorExpansion(state, {}).reason, 'need_items');
    const inv = { wall_segment: 2 };
    assert.equal(expandInterior(state, inv).wallSegments, 20);
    assert.equal(inv.wall_segment, 1);
    assert.equal(expandInterior(state, inv).reason, 'max');
  });

  it('round-trips a furnished demo room through normalization', () => {
    const state = furnishDemoRoom(createHomeDecorState());
    assert.ok(state.placed.length >= 12);
    const copy = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(copy.placed, state.placed);
    assert.equal(copy.nextId, state.nextId);
  });
});
