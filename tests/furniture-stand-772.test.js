/**
 * Report #772: "Why can I stand on a table out in the streets of UR but not in my home?" Glitch put a
 * placed piece's plats in the room (locations/inc_geo.js geo_add_plats_from_item 934-953, main.js
 * doFurnitureDrop 7031, restored on load inc_homes.js 815-821), each solid from the top for players
 * (items/furniture_table.js getFurnitureBaseGeo: platform_pc_perm -1; glitch-client PlatformLine.as
 * 341). The house gave the avatar only its floor and yard lines (homes-feature.js housePlatforms).
 * Now each piece's plats (js/furniture-plats-data.js, tools/furniture-plats/build.mjs) are the house's
 * lines too, for the owner and every visitor, rebuilt on every place, move, pickup, upgrade and flip.
 * Run: node --test tests/furniture-stand-772.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { Display, FakeEl, fakePixi } from './fake-scene.js';

globalThis.document ??= { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null };
class FakeTexture extends Display {
  constructor(opts = {}) {
    super();
    this.source = opts.source;
  }
}
FakeTexture.EMPTY = new Display();
FakeTexture.from = (src) => new FakeTexture({ source: src });
const pixi = new Proxy({ Container: Display, Graphics: Display, Sprite: Display, Text: Display, TilingSprite: Display, ImageSource: Display, Texture: FakeTexture }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});
globalThis.PIXI = pixi;
globalThis.Image ??= class { set src(_) {} };

const { housePlatforms, refreshFurnitureLines, settleStacksOntoFloor, visitorHomeScene, visitorHomeState } = await import('../public/js/features/homes-feature.js?v=7c7ee524');
const {
  INTERIOR, FURNITURE_HEADROOM, createHomeDecorState, flipFurniture, furniturePlatforms, isFurnitureLine, moveFurniture,
  pickUpFurniture, placeFurniture, surfaceHeight, wallTopY, furnitureSize,
} = await import('../public/js/home-decor.js?v=3a84d959');
const { applyUpgrade } = await import('../public/js/furniture-upgrades.js?v=f563b304');
const { FURNITURE_PLATS } = await import('../public/js/furniture-plats-data.js?v=2842bcc0');
const { JUMP_SPEED, NORMAL_BUFF, avatarGround, stepAvatar, steerX } = await import('../public/js/avatar-step.js?v=8415ee96');
const { avatarHeadReach } = await import('../public/js/street-model.js?v=a9a05f9d');

const root = join(import.meta.dirname, '..');
const GSJS = join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const FLOOR = INTERIOR.floorY;
const ROOM = { leftOpen: false };

/** A room holding `pieces` ([classTsid, x, y?] each, placed as the decorator places them). */
function room(pieces) {
  const storage = {};
  for (const [c] of pieces) storage[c] = (storage[c] || 0) + 1;
  const st = createHomeDecorState({ storage });
  for (const [c, x, y] of pieces) assert.equal(placeFurniture(st, {}, c, { x, y }).ok, true, c);
  return st;
}

/** Frames of the avatar on `lines` (game.js physics through avatar-step.js), steering `dir` while `steer(i)`. */
function walk(body, lines, frames, dir = 0, steer = () => true, worldW = 1500) {
  const ground = (x, y, vy) => avatarGround(lines, x, y, vy, { fallback: FLOOR });
  for (let i = 0; i < frames; i += 1) {
    body.vx = steerX(body.vx, steer(i) ? dir : 0, body.onGround, NORMAL_BUFF);
    stepAvatar(body, { platforms: lines, worldW, ground });
  }
  return body;
}

const jump = (body) => Object.assign(body, { vy: JUMP_SPEED, onGround: false });
const standing = (x, y = FLOOR) => ({ x, y, vx: 0, vy: 0, onGround: true });

describe('#772: placed furniture is a line players stand on, as Glitch', () => {
  it('Glitch tables, chairs and beds carry plats solid from the top for players', { skip: !existsSync(GSJS) && 'no glitch-GameServerJS' }, () => {
    for (const c of ['furniture_table', 'furniture_chair', 'furniture_bed']) {
      const src = readFileSync(join(GSJS, `items/${c}.js`), 'utf8');
      const geo = src.slice(src.indexOf('function getFurnitureBaseGeo'), src.indexOf('function getFurnitureBaseGeo') + 400);
      assert.match(geo, /"platform_pc_perm":-1/, c);
    }
  });

  it('the house gives the avatar a line across a placed table, at its top (fails on v0.80.0)', () => {
    const st = room([['furniture_table', 600]]);
    const table = st.placed[0];
    const lines = housePlatforms(ROOM, 0, 1200, st);
    const top = lines.filter(isFurnitureLine);
    assert.equal(top.length, 1, `only floor lines: ${lines.map((l) => l.id)}`);
    const [l] = top;
    assert.equal(l.pc_perm, -1, 'solid from the top, jumped up through from under');
    assert.equal(l.item_perm, 0, 'things set on it rest through `on`, not on the line');
    assert.ok(l.x1 < table.x && l.x2 > table.x, 'across the table');
    // The same top things set on it rest on (surfaceHeight, from the same plat).
    assert.ok(Math.abs(Math.min(l.y1, l.y2) - (table.y - surfaceHeight(table.classTsid))) <= 1);
    // The floor stays, and without a room's decor the house is as before.
    assert.ok(lines.some((p) => p.id === 'home-floor'));
    assert.deepEqual(housePlatforms(ROOM, 0, 1200).map((p) => p.id), ['home-floor']);
  });

  it('a jump from under the table lands on it; walking off its end drops back to the floor', () => {
    const st = room([['furniture_table', 600]]);
    const lines = housePlatforms(ROOM, 0, 1200, st);
    const top = lines.find(isFurnitureLine);
    const body = walk(jump(standing(600)), lines, 120);
    assert.equal(body.onGround, true);
    assert.equal(Math.round(body.y), Math.min(top.y1, top.y2), 'on the table top');
    walk(body, lines, 90, 1);
    assert.ok(body.x > top.x2 + 20, 'walked past its end');
    assert.equal(body.y, FLOOR, 'back on the floor');
  });

  it('a running jump from beside the table lands on it', () => {
    const st = room([['furniture_table', 600]]);
    const lines = housePlatforms(ROOM, 0, 1200, st);
    const top = lines.find(isFurnitureLine);
    const body = walk(jump(standing(top.x1 - 60)), lines, 120, 1, (i) => i < 6);
    assert.equal(body.onGround, true);
    assert.ok(body.x > top.x1 && body.x < top.x2, `at x ${body.x}`);
    assert.equal(Math.round(body.y), Math.min(top.y1, top.y2));
  });

  it('chairs, beds and shelves hold the avatar too; a pass-through hearth (pc_perm 0) does not', () => {
    const st = room([['furniture_chair', 300], ['furniture_bed', 700], ['furniture_shelf', 1000, 420], ['furniture_fireplace', 1300]]);
    const ids = new Set(furniturePlatforms(st, 0).map((l) => l.furnitureId));
    for (const item of st.placed) assert.ok(ids.has(item.id), item.classTsid);
    // The Fireplace's base geo has its mantel (-1) and a hearth (pc_perm 0): one line only.
    const fire = st.placed.find((p) => p.classTsid === 'furniture_fireplace');
    assert.equal(furniturePlatforms(st, 0).filter((l) => l.furnitureId === fire.id).length, 1);
    assert.equal(FURNITURE_PLATS.furniture_fireplace.base.length, 1);
  });

  it('a piece facing left mirrors its plats about its x, as getPlatsAndWalls did', () => {
    const st = room([['furniture_armchair', 500]]);
    const [right] = furniturePlatforms(st, 0);
    assert.equal(flipFurniture(st, st.placed[0].id).ok, true);
    const [left] = furniturePlatforms(st, 0);
    const x = st.placed[0].x;
    assert.notEqual(right.x1 - x, x - right.x2, 'the armchair\'s seat is off centre');
    assert.deepEqual([left.x1, left.x2], [2 * x - right.x2, 2 * x - right.x1]);
    assert.deepEqual([left.y1, left.y2], [right.y2, right.y1]);
  });

  it('a plat nearer the ceiling than the avatar\'s head reach is left out (Glitch\'s ceiling plat kept feet under it)', () => {
    assert.equal(FURNITURE_HEADROOM, avatarHeadReach(1).reach);
    const h = furnitureSize('furniture_shelf').h;
    const st = room([['furniture_shelf', 400, wallTopY(h)], ['furniture_shelf', 800, 420]]);
    const lines = furniturePlatforms(st, 0);
    assert.deepEqual(lines.map((l) => l.furnitureId), [st.placed[1].id], 'the top shelf is out of reach');
    for (const l of lines) assert.ok(Math.min(l.y1, l.y2) >= INTERIOR.ceilingY + FURNITURE_HEADROOM);
  });

  it('the generated data is current (tools/furniture-plats/build.mjs --check)', { skip: !existsSync(GSJS) && 'no glitch-GameServerJS' }, () => {
    execFileSync(process.execPath, [join(root, 'tools/furniture-plats/build.mjs'), '--check'], { stdio: 'pipe' });
  });
});

describe('#772: the lines follow the furniture (place, move, pick up, upgrade, flip)', () => {
  it('rebuilds the scene\'s own line list in place, keeping the floor', () => {
    const st = room([]);
    const lines = housePlatforms({ leftOpen: true, groundY: 680, rampX: -20, floorStart: 56 }, 900, 2100, st);
    const engineLines = lines; // game.js keeps this very array (streetPlatforms = bgLayer.platformsScreen)
    const floorIds = lines.map((l) => l.id);
    const furnitureLines = () => engineLines.filter(isFurnitureLine);
    assert.equal(furnitureLines().length, 0);

    // Placed: in room x, past the back yard (x0 900).
    st.storage.furniture_table = 1;
    const placed = placeFurniture(st, {}, 'furniture_table', { x: 500 });
    assert.equal(refreshFurnitureLines(lines, st, 900), engineLines);
    assert.equal(furnitureLines().length, 1);
    assert.ok(furnitureLines()[0].x1 < 1400 && furnitureLines()[0].x2 > 1400, 'at the table\'s world x');

    // Moved: the line goes with it, none left behind.
    moveFurniture(st, placed.item.id, { x: 800, y: placed.item.y });
    refreshFurnitureLines(lines, st, 900);
    assert.equal(furnitureLines().length, 1);
    assert.ok(furnitureLines()[0].x1 < 1700 && furnitureLines()[0].x2 > 1700);

    // Upgraded: the style's own plats (catalog_furniture.js), not the plain table's.
    const style = Object.keys(FURNITURE_PLATS.furniture_table.upgrades).find((id) => {
      const [[x1, y1, x2]] = FURNITURE_PLATS.furniture_table.upgrades[id];
      const [[b1, c1, b2]] = FURNITURE_PLATS.furniture_table.base;
      return x1 !== b1 || x2 !== b2 || y1 !== c1;
    });
    const before = furnitureLines()[0];
    assert.equal(applyUpgrade(placed.item, style, { currants: 1e9 }).ok, true);
    refreshFurnitureLines(lines, st, 900);
    assert.equal(furnitureLines().length, FURNITURE_PLATS.furniture_table.upgrades[style].length);
    assert.notDeepEqual(furnitureLines()[0], before);

    // Picked up: gone.
    assert.equal(pickUpFurniture(st, placed.item.id).ok, true);
    refreshFurnitureLines(lines, st, 900);
    assert.equal(furnitureLines().length, 0);
    assert.deepEqual(lines.map((l) => l.id), floorIds, 'the yard, ramp and floor untouched');
  });

  it('a table set down over a standing player leaves them on the floor, free to walk out', () => {
    const st = room([]);
    const lines = housePlatforms(ROOM, 0, 1500, st);
    const body = walk(standing(600), lines, 10);
    st.storage.furniture_table = 1;
    placeFurniture(st, {}, 'furniture_table', { x: 600 });
    refreshFurnitureLines(lines, st, 0);
    walk(body, lines, 30);
    assert.equal(body.y, FLOOR, 'not lifted into or onto it');
    walk(body, lines, 60, 1);
    assert.ok(body.x > 720, `walked out from under it (x ${body.x})`);
    assert.equal(body.y, FLOOR);
  });

  it('a piece taken away from under a player standing on it lets them fall to the floor', () => {
    const st = room([['furniture_table', 600]]);
    const lines = housePlatforms(ROOM, 0, 1500, st);
    const body = walk(jump(standing(600)), lines, 120);
    assert.ok(body.y < FLOOR - 40);
    pickUpFurniture(st, st.placed[0].id);
    refreshFurnitureLines(lines, st, 0);
    walk(body, lines, 60);
    assert.equal(body.y, FLOOR);
    assert.equal(body.onGround, true);
  });

  it('stacks settle as before: the lines hold no items, a thing set on a piece rests on it through `on`', () => {
    const st = room([['furniture_table', 600]]);
    const lines = housePlatforms(ROOM, 0, 1500, st);
    const table = st.placed[0];
    // A shared stack (no room decor to read) over the table falls to the floor, not onto the line.
    const loose = [{ x: 600, y: 400 }];
    settleStacksOntoFloor(loose, lines);
    assert.equal(loose[0].y, FLOOR);
    // With the room's decor it lands on the table's top and keeps it as `on`, as before.
    const kept = [{ x: 600, y: 400 }];
    settleStacksOntoFloor(kept, lines, st, 0);
    assert.equal(kept[0].on, table.id);
    assert.equal(kept[0].y, table.y - surfaceHeight(table.classTsid));
  });

  it('a floor hole drops only a player on the floor, not one walking a table over it', () => {
    const src = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    const at = src.indexOf('const hole = fallCheck({');
    assert.match(src.slice(at, at + 400), /onGround: p\.onGround === true && Math\.abs\(p\.y - GROUND_Y\) <= 2,/);
  });

  it('every furniture change redraws through renderFurniture, which rebuilds the lines', () => {
    const src = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    const body = src.slice(src.indexOf('function renderFurniture(engine)'), src.indexOf('function furnitureBounds('));
    assert.match(body, /refreshFurnitureLines\(scene\.background\?\.platformsScreen, decor, roomX0\(\)\)/);
    assert.match(src, /root\.platformsScreen = housePlatforms\(room, x0, width, decor\);/, 'every house room and Tower floor, own or visited');
  });
});

describe('#772 online: a visitor stands on the owner\'s furniture', () => {
  function sceneEngine() {
    const base = { PIXI: pixi, entityLayer: new Display(), fxLayer: new Display(), spawnGarden: () => null };
    return new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' || String(k).startsWith('spawn') ? undefined : new Display()) });
  }
  const table = { id: 5, classTsid: 'furniture_table', slot: 'floor', x: 500, y: 615, facingRight: true, z: 1, on: null, plat: 'chair' };
  const chair = { id: 2, classTsid: 'furniture_chair', slot: 'floor', x: 800, y: 607, facingRight: true, z: 2, on: null, plat: 'chair' };
  const VIEW = {
    owner: { id: 7, name: 'Owner' },
    home: { style: 'meadow' },
    homes: {
      cult: { items: [] },
      backYard: { items: [] },
      decor: { wallSegments: 9, placed: [table] },
      floors: { upper: [{ placed: [chair] }], links: [] },
    },
  };

  it('the ground floor carries the owner\'s table where the owner\'s own scene has it', () => {
    const scene = visitorHomeScene(sceneEngine(), VIEW, 'interior');
    const x0 = scene.populate(sceneEngine()).roomX;
    // The owner's room as the owner's own house reads it (the same normalising), past the back yard.
    const own = furniturePlatforms(visitorHomeState(VIEW).decor, x0);
    const got = scene.platforms.filter(isFurnitureLine);
    assert.equal(got.length, 1);
    assert.deepEqual(got, own);
    const body = walk(jump(standing(Math.round((got[0].x1 + got[0].x2) / 2))), scene.platforms, 120, 0, () => false, scene.width);
    assert.ok(body.x > got[0].x1 && body.x < got[0].x2);
    assert.ok(body.onGround && body.y <= Math.max(got[0].y1, got[0].y2) + 0.5 && body.y >= Math.min(got[0].y1, got[0].y2) - 0.5, `on the table (y ${body.y})`);
  });

  it('an upper floor carries its own pieces', () => {
    const scene = visitorHomeScene(sceneEngine(), VIEW, 'interior', { floor: 1 });
    assert.deepEqual(scene.platforms.filter(isFurnitureLine).map((l) => l.furnitureId), [2]);
  });
});
