/**
 * Report #752 (root R56): in a column of stacked Storage Display Boxes a click on the upper third of
 * a box picked the box above it (placed top first) and the lower third the box below (placed bottom
 * first). The pick took the smallest rectangle padded 8 px under the pointer, so where pieces
 * overlapped the one placed first won, not the one drawn in front. Glitch walked the stacks under the
 * mouse front to back and took the first with an opaque pixel there (LocationRenderer.as
 * getMostLikelyItemstackFromList 1863-1953: alpha over 200 for overlapping furniture, a 3 x 3 box).
 * Now one pick does that for hover, click, a phone's tap (game.js pickInteractableAt) and Decoration
 * Mode (homes-feature.js furnitureAt): js/pick.js.
 *
 * The scenes here are built as the game builds them (the furniture holder at z 12 with each piece's
 * art in render order, an invisible storage hit box at z 13 naming that art, doors at z 11, stacks
 * and animals by js/item-bands.js itemZ) from the real art files, read with ImageMagick.
 *
 * Run: node --test tests/r752-stacked-pick.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readImage } from '../tools/builder/art-image.mjs';
import { furnitureDef, furnitureDrawsInFront, furnitureSize, pieceArt, pieceScale, renderOrder } from '../public/js/home-decor.js?v=c63e5e16';
import { isStorageClass } from '../public/js/home-storage.js?v=17bf7f79';
import { worldArtFor } from '../public/js/world-art.js?v=a67514c8';
import { itemZ } from '../public/js/item-bands.js?v=ec366be3';
import { nearestPlotIndex } from '../public/js/garden-view.js?v=04fe8467';
import { PICK_REACH, SOLID_ALPHA, pickByRectangle, pickFront, pickTarget, resetPickMasks, pickStats } from '../public/js/pick.js?v=8137f9fc';

let magick = true;
try {
  execFileSync('magick', ['-version'], { stdio: 'ignore' });
} catch {
  magick = false;
}
const SKIP = magick ? false : 'ImageMagick (magick) is not installed';

// —— A small stand-in for Pixi's scene graph: translate and scale, children, zIndex ——
class Node {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.scale = { x: 1, y: 1 };
    this.children = [];
    this.parent = null;
    this.zIndex = 0;
    this.visible = true;
    this.alpha = 1;
    this.sortableChildren = false;
  }
  addChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  toGlobal(p) {
    let { x, y } = p;
    for (let n = this; n; n = n.parent) {
      x = x * n.scale.x + n.x;
      y = y * n.scale.y + n.y;
    }
    return { x, y };
  }
  toLocal(g) {
    const chain = [];
    for (let n = this; n; n = n.parent) chain.unshift(n);
    let { x, y } = g;
    for (const n of chain) {
      x = (x - n.x) / n.scale.x;
      y = (y - n.y) / n.scale.y;
    }
    return { x, y };
  }
}
class Container extends Node {}
class Graphics extends Node {}
class Sprite extends Node {
  constructor(texture) {
    super();
    this.texture = texture;
    this.anchor = { x: 0, y: 0 };
  }
  get width() {
    return Math.abs(this.texture.orig.width * this.scale.x);
  }
  get height() {
    return Math.abs(this.texture.orig.height * this.scale.y);
  }
}
const PIXI = { Sprite, Graphics, Texture: { EMPTY: {} } };

const images = new Map();
function image(path) {
  if (!images.has(path)) images.set(path, readImage(new URL(`../public/${path}`, import.meta.url).pathname));
  return images.get(path);
}
/** A texture over an art file: `w` x `h` units (the file may be a 3x render), or one cell of a sheet. */
function texture(path, w, h, cell = null) {
  const img = image(path);
  const k = cell ? 1 : img.w / w;
  const sw = img.w / k;
  const frame = cell ? { x: cell.x, y: cell.y, width: cell.w, height: cell.h } : { x: 0, y: 0, width: w, height: h };
  return { frame, orig: { width: frame.width, height: frame.height }, trim: null, source: { width: sw, resource: { width: img.w }, img } };
}
/** The canvas reader's stand-in: the frame's pixels out of the file, at the file's resolution. */
function pixelsOf(tex) {
  const { img } = tex.source;
  const k = img.w / tex.source.width;
  const w = Math.round(tex.frame.width * k);
  const h = Math.round(tex.frame.height * k);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(tex.frame.x * k) + x;
      const sy = Math.floor(tex.frame.y * k) + y;
      if (sx >= img.w || sy >= img.h) continue;
      rgba.set(img.px.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { rgba, w, h };
}
/** Independent of js/pick.js: the art's own alpha at a world point (no 3 x 3 box). */
function alphaAt(spr, layer, x, y) {
  const g = layer.toGlobal({ x, y });
  const l = spr.toLocal(g);
  const t = spr.texture;
  const u = l.x + spr.anchor.x * t.orig.width;
  const v = l.y + spr.anchor.y * t.orig.height;
  if (u < 0 || v < 0 || u >= t.frame.width || v >= t.frame.height) return 0;
  const { img } = t.source;
  const k = img.w / t.source.width;
  // (a hair over, so a third of a pixel at x 1391 still lands on its own 3x pixel)
  const px = Math.floor((t.frame.x + u) * k + 1e-6);
  const py = Math.floor((t.frame.y + v) * k + 1e-6);
  if (px >= img.w || py >= img.h) return 0;
  return img.px[(py * img.w + px) * 4 + 3];
}

// —— A room as homes-feature.js and home-storage-feature.js draw it ——
const ROOM_X = 1000;
function makeRoom() {
  const entityLayer = new Container();
  entityLayer.sortableChildren = true;
  const back = entityLayer.addChild(new Container());
  back.sortableChildren = true;
  back.zIndex = 12; // FURNITURE_Z
  back.x = ROOM_X;
  const front = entityLayer.addChild(new Container());
  front.sortableChildren = true;
  front.zIndex = 90; // FURNITURE_FRONT_Z
  front.x = ROOM_X;
  return { entityLayer, back, front, rows: [], views: new Map(), targets: [], art: new Map() };
}
/** Place a piece (room x, its foot y); `z` orders it as placement did. */
function place(room, classTsid, x, y, upgradeId = '') {
  const def = furnitureDef(classTsid);
  const id = room.rows.length + 1;
  room.rows.push({ id, classTsid, upgradeId, x, y, z: id, slot: def.slot, plat: def.slot === 'floor' ? 'bookshelf' : def.slot });
  return id;
}
/** renderFurniture + furnitureView + home-storage-feature draw: views in render order, storage hit boxes. */
function drawRoom(room) {
  renderOrder({ placed: room.rows }).forEach((row, i) => {
    const art = pieceArt(row.classTsid, row.upgradeId);
    const s = pieceScale(row.classTsid, row.upgradeId);
    const view = new Container();
    const spr = view.addChild(new Sprite(texture(art.path, art.w, art.h)));
    spr.anchor = { x: 0.5, y: row.slot === 'ceiling' ? 0 : 1 };
    spr.scale = { x: s, y: s };
    view.x = row.x;
    view.y = row.y;
    view.zIndex = i;
    view.art = spr;
    (furnitureDrawsInFront(row) ? room.front : room.back).addChild(view);
    room.views.set(row.id, view);
    room.art.set(row.id, spr);
    if (!isStorageClass(row.classTsid)) return;
    const { w, h } = furnitureSize(row.classTsid, row.upgradeId);
    const box = room.entityLayer.addChild(new Container());
    box.x = ROOM_X + row.x;
    box.y = row.y;
    box.zIndex = 13;
    box.addChild(new Graphics());
    box._worldHitW = w;
    box._worldHitH = h;
    box.rimArt = () => room.views.get(row.id)?.art || null;
    room.targets.push({ classId: 'home_storage', label: `piece ${row.id}`, id: row.id, sprite: box });
  });
}
/** A door between floors (homes-feature spawnDoorTargets): a Sprite at FURNITURE_Z - 1. */
function addDoor(room, x, y) {
  const art = pieceArt('furniture_door');
  const spr = room.entityLayer.addChild(new Sprite(texture(art.path, art.w, art.h)));
  spr.anchor = { x: 0.5, y: 1 };
  spr.x = ROOM_X + x;
  spr.y = y;
  spr.zIndex = 11;
  const t = { classId: 'furniture_door', label: 'Door', id: `door@${x}`, sprite: spr };
  room.targets.push(t);
  room.art.set(t.id, spr);
  return t;
}
/** A put-down stack (game.js spawnDroppedItemStack): its world art at itemZ(class, 12). */
function addStack(layer, targets, classTsid, x, y, artMap) {
  const wa = worldArtFor(classTsid, 1, null);
  assert.ok(wa, `${classTsid} has world art`);
  const spr = layer.addChild(new Sprite(texture(wa.url, wa.w, wa.h)));
  spr.anchor = { x: 0.5, y: 1 };
  spr.x = x;
  spr.y = y;
  spr.zIndex = itemZ(classTsid, 12);
  const t = { classId: classTsid, label: classTsid, id: `${classTsid}@${x},${y}`, sprite: spr };
  targets.push(t);
  artMap?.set(t.id, spr);
  return t;
}

const opts = (layer) => ({ PIXI, layer, nearestPlotIndex, pixelsOf });
const pick = (room, x, y) => pickTarget(room.targets, x, y, opts(room.entityLayer));

/** Decoration Mode's furnitureAt as homes-feature.js now runs it (front first, rectangles, then pickFront). */
function furnitureAt(room, point) {
  const top = renderOrder({ placed: room.rows }).reverse();
  const order = [...top.filter(furnitureDrawsInFront), ...top.filter((r) => !furnitureDrawsInFront(r))];
  const under = order.filter((item) => {
    const { w, h } = furnitureSize(item.classTsid, item.upgradeId);
    const t = item.slot === 'ceiling' ? item.y : item.y - h;
    return point.x >= item.x - w / 2 && point.x <= item.x + w / 2 && point.y >= t && point.y <= t + h;
  });
  return { under, item: under.length < 2 ? under[0] || null : pickFront(under, room.back.toGlobal(point), (it) => room.views.get(it.id)?.art, pixelsOf) };
}

// The report's boxes: four styles of one size (61 x 72), feet 57 px apart (its picture).
const STYLES = ['263', '264', '266', '547'];
const PITCH = 57;
const BOTTOM_FOOT = 560;
/** A column of four boxes, top first or bottom first; returns the ids top to bottom. */
function sdbColumn(order) {
  const room = makeRoom();
  const feet = STYLES.map((_, i) => BOTTOM_FOOT - (3 - i) * PITCH);
  const byTop = [];
  const seq = order === 'topfirst' ? [0, 1, 2, 3] : [3, 2, 1, 0];
  for (const i of seq) byTop[i] = place(room, 'bag_furniture_sdb', 300, feet[i], STYLES[i]);
  drawRoom(room);
  return { room, byTop, feet };
}
const THIRDS = [['upper third', -24], ['middle', 0], ['lower third', 20]];

describe('report #752: stacked Storage Display Boxes pick the box under the pointer', { skip: SKIP }, () => {
  for (const order of ['topfirst', 'bottomfirst']) {
    it(`reproduces the report with the old rule (${order})`, () => {
      const { room, byTop, feet } = sdbColumn(order);
      const wrong = [];
      byTop.forEach((id, i) => {
        for (const [name, dy] of THIRDS) {
          const got = pickByRectangle(room.targets, ROOM_X + 300, feet[i] - 36 + dy, { nearestPlotIndex });
          if (got.id !== id) wrong.push(`box ${i + 1} ${name} -> box ${byTop.indexOf(got.id) + 1}`);
        }
      });
      // As result.txt: three boxes' upper (top first) or lower (bottom first) thirds picked a neighbour.
      assert.equal(wrong.length, 3, wrong.join('; '));
      assert.ok(wrong.every((w) => w.includes(order === 'topfirst' ? 'upper third' : 'lower third')), wrong.join('; '));
    });

    it(`each third of each box picks that box: hover, click and tap (${order})`, () => {
      const { room, byTop, feet } = sdbColumn(order);
      byTop.forEach((id, i) => {
        for (const [name, dy] of THIRDS) {
          const got = pick(room, ROOM_X + 300, feet[i] - 36 + dy);
          assert.equal(got?.id, id, `box ${i + 1} ${name}: got box ${byTop.indexOf(got?.id) + 1}`);
        }
      });
    });

    it(`Decoration Mode picks the same box (${order})`, () => {
      const { room, byTop, feet } = sdbColumn(order);
      byTop.forEach((id, i) => {
        for (const [name, dy] of THIRDS) {
          const got = furnitureAt(room, { x: 300, y: feet[i] - 36 + dy });
          assert.equal(got.item?.id, id, `box ${i + 1} ${name}`);
        }
      });
    });
  }

  it('a lone box keeps its padding: a click just off its art still reaches it', () => {
    const room = makeRoom();
    const id = place(room, 'bag_furniture_sdb', 300, 500, '263');
    drawRoom(room);
    assert.equal(pick(room, ROOM_X + 300 + 30.5 + 6, 500 - 36)?.id, id, '6 px right of its rectangle');
    assert.equal(pick(room, ROOM_X + 300, 500 - 72 - 6)?.id, id, '6 px over its top');
    assert.equal(pick(room, ROOM_X + 300 + 30.5 + 12, 500 - 36), null, 'past the pad');
  });

  it('masks are built once per texture, only when rectangles overlap', () => {
    resetPickMasks();
    const { room, feet } = sdbColumn('topfirst');
    pick(room, ROOM_X + 300, feet[0] - 36 - 24); // the top box's upper third: one rectangle
    assert.equal(pickStats().built, 0, 'no mask for a lone rectangle');
    for (let n = 0; n < 50; n++) pick(room, ROOM_X + 300, feet[1] - 36 - 24);
    const { built, bytes } = pickStats();
    assert.ok(built >= 1 && built <= 2, `masks built: ${built}`);
    // One bit a pixel: a 183 x 216 render is under 5 KB.
    assert.ok(bytes <= 2 * Math.ceil((183 * 216) / 8), `mask bytes: ${bytes}`);
  });
});

/**
 * The truth at a point, independent of the pick: the front-most piece whose art is solid there, when
 * the answer is the same all round the box the pick tests (PICK_REACH art px, sampled at a third of
 * a pixel for the 3x renders, two samples wider for rounding; else undefined: an edge, skipped). null
 * when nothing is solid (the pick falls back to rectangles).
 */
function truthAt(drawnFrontFirst, layer, x, y) {
  let answer;
  const n = 3 * PICK_REACH + 2;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const dx = i / 3;
      const dy = j / 3;
      const front = drawnFrontFirst.find((d) => alphaAt(d.spr, layer, x + dx, y + dy) > SOLID_ALPHA);
      const id = front ? front.id : null;
      if (answer === undefined) answer = id;
      else if (answer !== id) return undefined;
    }
  }
  return answer;
}

/** Every piece a home draws that the pointer picks: boxes, cabinets, doors and machines. */
const KINDS = [
  ...STYLES.map((u) => ['bag_furniture_sdb', u]),
  ['bag_furniture_sdb', ''],
  ['bag_furniture_cabinet', ''],
  ['bag_furniture_smallcabinet', ''],
  ['bag_furniture_wallcabinet', ''],
  ['bag_furniture_largecabinet', ''],
  ['door', ''],
  ['spice_mill', 'machine'],
  ['still', 'machine'],
  ['loomer', 'machine'],
  ['tincturing_kit', 'machine'],
];

describe('R56: every home piece kind, stacked and overlapping, picks what is drawn under the pointer', { skip: SKIP }, () => {
  for (const pitch of [24, 45, 70]) {
    for (const order of ['forward', 'reverse']) {
      it(`a column and a row of every kind, ${pitch} px apart, placed ${order}`, () => {
        const room = makeRoom();
        const seq = order === 'forward' ? KINDS : [...KINDS].reverse();
        const spots = seq.map((k, i) => ({ k, col: { x: 400, y: 300 + i * pitch }, row: { x: 400 + i * pitch * 1.6, y: 300 + KINDS.length * pitch + 200 } }));
        const furniture = [];
        for (const { k, col, row } of spots) {
          for (const p of [col, row]) {
            if (k[0] === 'door' || k[1] === 'machine') continue;
            furniture.push(place(room, k[0], p.x, p.y, k[1]));
          }
        }
        drawRoom(room);
        for (const { k, col, row } of spots) {
          for (const p of [col, row]) {
            if (k[0] === 'door') addDoor(room, p.x, p.y);
            else if (k[1] === 'machine') addStack(room.entityLayer, room.targets, k[0], ROOM_X + p.x, p.y, room.art);
          }
        }
        // Front first as Pixi draws: by holder zIndex, then by index in it.
        const drawn = room.targets.map((t) => ({ id: t.id, spr: room.art.get(t.id) }));
        // Furniture in its holder (z 12) by render order; things on the entity layer by zIndex then index.
        const rank = (d) => (d.spr.parent === room.entityLayer ? [d.spr.zIndex, room.entityLayer.children.indexOf(d.spr), 0] : [room.back.zIndex, room.entityLayer.children.indexOf(room.back), d.spr.parent.zIndex]);
        drawn.sort((a, b) => {
          const ra = rank(a);
          const rb = rank(b);
          return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2];
        });
        let checked = 0;
        let overlapped = 0;
        let oldWrong = 0;
        let decoChecked = 0;
        const bad = [];
        for (let x = 250; x <= 400 + KINDS.length * pitch * 1.6 + 150; x += 3) {
          for (let y = 80; y <= 300 + KINDS.length * pitch + 230; y += 3) {
            const wx = ROOM_X + x;
            const under = room.targets.filter((t) => pickByRectangle([t], wx, y));
            if (under.length < 2) continue;
            overlapped++;
            const truth = truthAt(drawn.filter((d) => under.some((t) => t.id === d.id)), room.entityLayer, wx, y);
            if (!truth) continue;
            const got = pick(room, wx, y);
            checked++;
            if (got?.id !== truth) bad.push(`(${x},${y}) ${got?.id} want ${truth}`);
            if (pickByRectangle(room.targets, wx, y, { nearestPlotIndex })?.id !== truth) oldWrong++;
            // Decoration Mode over the furniture alone.
            if (furniture.includes(truth)) {
              const { under: u, item } = furnitureAt(room, { x, y });
              const deco = drawn.filter((d) => furniture.includes(d.id) && u.some((it) => it.id === d.id));
              const dTruth = truthAt(deco, room.entityLayer, wx, y);
              if (u.length > 1 && dTruth) {
                decoChecked++;
                if (item?.id !== dTruth) bad.push(`deco (${x},${y}) ${item?.id} want ${dTruth}`);
              }
            }
          }
        }
        assert.deepEqual(bad.slice(0, 12), [], `${bad.length} of ${checked} points wrong`);
        assert.ok(checked > 400, `points checked where rectangles overlap: ${checked} of ${overlapped}`);
        assert.ok(decoChecked > 100, `Decoration Mode points: ${decoChecked}`);
        assert.ok(oldWrong > 0, 'the old rule got some of these wrong');
      });
    }
  }
});

describe('R56 on a street: what is drawn in front wins, a lone thing keeps its pad', { skip: SKIP }, () => {
  /** A street: a fruit tree (itemZ 6) with a piggy (itemZ 2, the foreground band) walking in front of it. */
  function street(piggyDx) {
    const layer = new Container();
    layer.sortableChildren = true;
    const targets = [];
    // The 1x frame as drawn (its own size, bottom centre on the ground).
    const TREE = 'assets/sprites/trants/frames/trant_fruit_m10_f0.webp';
    const img = image(TREE);
    const tree = layer.addChild(new Sprite(texture(TREE, img.w, img.h)));
    tree.anchor = { x: 0.5, y: 1 };
    tree.x = 2000;
    tree.y = 900;
    tree.zIndex = itemZ('trant_fruit', 6);
    const treeT = { classId: 'trant_fruit', id: 'tree', sprite: tree };
    const piggy = layer.addChild(new Sprite(texture('assets/sprites/npc_piggy__x1_walk_png_1354829432.webp', 0, 0, { x: 0, y: 0, w: 88, h: 62 })));
    piggy.anchor = { x: 0.5, y: 1 };
    piggy.x = 2000 + piggyDx;
    piggy.y = 905;
    piggy.zIndex = itemZ('npc_piggy', 2);
    const piggyT = { classId: 'npc_piggy', id: 'piggy', sprite: piggy };
    targets.push(treeT, piggyT);
    return { layer, targets, tree, piggy };
  }

  it('the piggy in front of the tree: its own pixels are the piggy, the tree\'s trunk above it the tree', () => {
    const s = street(0);
    const P = (x, y) => pickTarget(s.targets, x, y, opts(s.layer))?.id;
    // The piggy's middle: solid piggy, in front.
    const pm = { x: 2000, y: 905 - 25 };
    assert.ok(alphaAt(s.piggy, s.layer, pm.x, pm.y) > SOLID_ALPHA);
    assert.equal(P(pm.x, pm.y), 'piggy');
    // Over the piggy's back, on the trunk, inside the piggy's padded box but off its art: the tree.
    let found = 0;
    for (let y = 905 - 62 - 7; y < 905 - 30; y++) {
      for (let x = 1960; x <= 2040; x++) {
        if (alphaAt(s.piggy, s.layer, x, y) || alphaAt(s.piggy, s.layer, x, y - 1) || alphaAt(s.piggy, s.layer, x, y + 1)) continue;
        if (alphaAt(s.piggy, s.layer, x - 1, y) || alphaAt(s.piggy, s.layer, x + 1, y)) continue;
        if (alphaAt(s.tree, s.layer, x, y) <= SOLID_ALPHA) continue;
        assert.equal(P(x, y), 'tree', `(${x},${y}) on the trunk, off the piggy`);
        found++;
      }
    }
    assert.ok(found > 20, `trunk points over the piggy: ${found}`);
    // Before: the piggy's smaller rectangle took them all.
    assert.equal(pickByRectangle(s.targets, pm.x, 905 - 62 - 4)?.id, 'piggy');
  });

  it('beside the tree, empty space near the piggy still picks the piggy (its pad, nothing drawn there)', () => {
    const s = street(-260); // the piggy out beside the tree's foliage, on open ground
    const P = (x, y) => pickTarget(s.targets, x, y, opts(s.layer))?.id;
    const px = 2000 - 260;
    // 5 px past the piggy's rectangle, empty: the piggy still.
    assert.equal(P(px + 44 + 5, 905 - 20), 'piggy');
    assert.equal(P(px, 905 - 62 - 5), 'piggy');
  });

  it('a stack lying on a garden: its pixels are the stack, the plot beside them the plot', () => {
    const layer = new Container();
    layer.sortableChildren = true;
    const targets = [];
    // Two plots in a row (game.js garden cells: Containers at itemZ garden_plot, hit by their base).
    const plots = [0, 1].map((c) => {
      const cell = layer.addChild(new Container());
      cell.x = 3000 + c * 59;
      cell.y = 870;
      cell.zIndex = itemZ('garden_plot', 9 + 0.3);
      cell._gardenHitW = 59;
      cell._gardenBaseH = 16;
      cell._gardenHitH = 16;
      const t = { classId: 'garden_plot', id: `plot ${c}`, sprite: cell };
      targets.push(t);
      return t;
    });
    const stack = addStack(layer, targets, 'apple', 3000, 872);
    const P = (x, y) => pickTarget(targets, x, y, opts(layer))?.id;
    const solid = (x, y) => alphaAt(stack.sprite, layer, x, y) > SOLID_ALPHA;
    // The apple's middle, over plot 0's base.
    const ay = 872 - 8;
    assert.ok(solid(3000, ay));
    assert.equal(pickByRectangle(targets, 3000, ay, { nearestPlotIndex })?.id, 'plot 0', 'before: the plot under it took the click');
    assert.equal(P(3000, ay), stack.id);
    // Off the apple, on plot 0 and on plot 1: the plots.
    assert.equal(P(3000 - 25, 862), 'plot 0');
    assert.equal(P(3059, 862), 'plot 1');
    assert.ok(plots.length === 2);
  });

  it('an invisible hit area drawn in front of art keeps the old rule against it (a player over a pile)', () => {
    const layer = new Container();
    layer.sortableChildren = true;
    const targets = [];
    const stack = addStack(layer, targets, 'still', 500, 600);
    const box = layer.addChild(new Container());
    box.x = 500;
    box.y = 600;
    box.zIndex = 49; // other players draw over items
    box._worldHitW = 20;
    box._worldHitH = 40;
    box._worldHitExact = true;
    targets.push({ classId: 'pc_remote', id: 'player', sprite: box });
    const P = (x, y) => pickTarget(targets, x, y, opts(layer))?.id;
    assert.ok(alphaAt(stack.sprite, layer, 500, 580) > SOLID_ALPHA);
    assert.equal(P(500, 580), 'player', 'the smaller box in front still wins');
    assert.ok(alphaAt(stack.sprite, layer, 500, 540) > SOLID_ALPHA);
    assert.equal(P(500, 540), stack.id, 'above the box, the still');
  });
});

describe('R56: hover, click, right click and a phone\'s tap share the pick; Decoration Mode too', () => {
  const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
  const homes = readFileSync(new URL('../public/js/features/homes-feature.js', import.meta.url), 'utf8');
  it('game.js asks js/pick.js', () => {
    assert.match(game, /function pickInteractableAt\(worldX, worldY\) \{\n\s*return pickTarget\(interactables, worldX, worldY, \{ PIXI, layer: entityLayer, nearestPlotIndex \}\);/);
    assert.match(game, /const hit = pickInteractableAt\(wx, wy\);/, 'hover');
    assert.match(game, /const best = pickInteractableAt\(sx, sy\);/, 'click');
    assert.match(game, /best = signBoard \? null : pickInteractableAt\(sx, sy\);/, 'right click');
    assert.match(game, /const hit = pickInteractableAt\(sx, sy\);\n\s*setCanvasData\('touchTapThrough'/, 'the stick\'s tap-through');
  });
  it('Decoration Mode\'s furnitureAt tests the art where pieces overlap', () => {
    const body = homes.slice(homes.indexOf('function furnitureAt('), homes.indexOf('// BUILDER: carrying'));
    assert.match(body, /pickFront\(under, layer\.toGlobal\(\{ x: point\.x, y: point\.y \}\), \(item\) => views\?\.get\(item\.id\)\?\.art \|\| null\)/);
  });
});
