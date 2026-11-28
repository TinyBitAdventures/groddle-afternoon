/**
 * #746 reopened (Austin's ruling 2026-11-27): every Knocker moved to Glitch's measured spot on the
 * trunk's left edge (tests/r746-knocker-left-edge.test.js), so on many trees it now lies inside its
 * Sloth's box (the hanging sloth across, from the leaves down to the floor). A click or tap on the
 * Knocker is the Knocker's; the Sloth stays tappable everywhere else.
 *
 * Glitch: sloth_knocker draws in the normal item holder, npc_sloth in the background one
 * (LocationRenderer.placeItemstackInMG 1508-1517, js/item-bands.js), and the pick walked the stacks
 * front to back taking the first opaque at the mouse (LocationRenderer.as
 * getMostLikelyItemstackFromList 1863-1953): the Knocker in front. js/pick.js pickTarget (R56) does
 * the same for hover, click, right click and a phone's tap (game.js pickInteractableAt).
 *
 * The scene here is built as resource-nodes-feature.js buildSlothView builds it (the sloth's root over
 * its box, its art mirrored for a left sloth, the Knocker on the trunk, each at its band's itemZ), from
 * the real 1x art, on all 84 trees, the sloth hidden in the leaves and hanging down, under a computer's
 * stage (scale 1) and a phone's (scaled down, the camera moved).
 *
 * Run: node --test tests/r746-knocker-pick.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readImage } from '../tools/builder/art-image.mjs';
import { SLOTH_SPOTS } from '../public/js/sloth-spots-data.js?v=0fb481e0';
import { slothSpotFromRow } from '../public/js/sloth-trees.js?v=775bef07';
import { SLOTH_ART_DIR, SLOTH_KNOCKER_ART, SLOTH_SHEETS } from '../public/js/sloth-art.js?v=a2768e2f';
import { itemZ } from '../public/js/item-bands.js?v=ec366be3';
import { SOLID_ALPHA, pickTarget, targetPad, spriteWorldHitBox } from '../public/js/pick.js?v=a43f94f8';
import { slothGeometry } from '../public/js/features/resource-nodes-feature.js?v=5922a1ed';

const ecology = JSON.parse(readFileSync(new URL('../public/assets/content/street-ecology.json', import.meta.url), 'utf8'));

// —— A small stand-in for Pixi's scene graph: translate and scale, children, zIndex ——
class Node {
  constructor() {
    Object.assign(this, { x: 0, y: 0, scale: { x: 1, y: 1 }, children: [], parent: null, zIndex: 0, visible: true, alpha: 1, sortableChildren: false });
  }
  addChild(...cs) {
    for (const c of cs) {
      c.parent = this;
      this.children.push(c);
    }
    return cs[0];
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
const EMPTY = {};
class Sprite extends Node {
  constructor(texture) {
    super();
    this.texture = texture;
    this.anchor = { x: 0, y: 0 };
  }
  get width() {
    return Math.abs((this.texture.orig?.width || 0) * this.scale.x);
  }
  get height() {
    return Math.abs((this.texture.orig?.height || 0) * this.scale.y);
  }
}
const PIXI = { Sprite, Graphics, Texture: { EMPTY } };

const images = new Map();
function image(file) {
  if (!images.has(file)) images.set(file, readImage(new URL(`../public/${SLOTH_ART_DIR}${file}`, import.meta.url).pathname));
  return images.get(file);
}
/** A texture over one cell of a 1x sheet. */
function cellTexture(file, cell, i = 0, cols = 1) {
  const img = image(file);
  const frame = { x: (i % cols) * cell.w, y: Math.floor(i / cols) * cell.h, width: cell.w, height: cell.h };
  return { frame, orig: { width: cell.w, height: cell.h }, trim: null, source: { width: img.w, resource: { width: img.w }, img } };
}
function pixelsOf(tex) {
  const { img } = tex.source;
  const { width: w, height: h } = tex.frame;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = tex.frame.x + x;
      const sy = tex.frame.y + y;
      if (sx < img.w && sy < img.h) rgba.set(img.px.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { rgba, w, h };
}
/** Independent of js/pick.js: the art's own alpha at a layer point (0 off the art). */
function alphaAt(spr, layer, x, y) {
  const l = spr.toLocal(layer.toGlobal({ x, y }));
  const t = spr.texture;
  const u = Math.floor(l.x + spr.anchor.x * t.orig.width + 1e-6);
  const v = Math.floor(l.y + spr.anchor.y * t.orig.height + 1e-6);
  if (u < 0 || v < 0 || u >= t.frame.width || v >= t.frame.height) return 0;
  const { img } = t.source;
  return img.px[((t.frame.y + v) * img.w + t.frame.x + u) * 4 + 3];
}
/** Solid at the point or within `r` px of it (the pick tests a 3 x 3 box; 2 px leaves its rounding out), by the art alone. */
function solidNear(spr, layer, x, y, r = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (alphaAt(spr, layer, x + dx, y + dy) > SOLID_ALPHA) return true;
  return false;
}

/** The Sloth and its Knocker as buildSlothView draws them, in an entity layer under a stage. */
function slothScene(spot, pose, stage) {
  const root0 = new Container();
  root0.scale = { x: stage.scale, y: stage.scale };
  root0.x = stage.x;
  root0.y = stage.y;
  const layer = root0.addChild(new Container());
  layer.sortableChildren = true;
  const geo = slothGeometry({ x: spot.x, y: spot.y, sloth: spot });
  const root = new Container();
  root.x = (geo.box.left + geo.box.right) / 2;
  root.y = geo.box.bottom;
  root.zIndex = itemZ('npc_sloth', 4);
  root._worldHitW = geo.box.right - geo.box.left;
  root._worldHitH = geo.box.bottom - geo.box.top;
  const art = root.addChild(new Container());
  art.x = geo.origin.x - root.x;
  art.y = geo.origin.y - root.y;
  art.scale = { x: geo.dir, y: 1 };
  const sheet = SLOTH_SHEETS[pose];
  const body = new Sprite(cellTexture(sheet.file, sheet.cell, 0, sheet.cols));
  body.anchor = { x: sheet.origin.x / sheet.cell.w, y: sheet.origin.y / sheet.cell.h };
  // The rod and paw hold no art outside eat and spit.
  art.addChild(body, new Sprite(EMPTY), new Sprite(EMPTY));
  const { knock, origin } = SLOTH_KNOCKER_ART;
  const knocker = new Sprite(cellTexture(SLOTH_KNOCKER_ART.still, { w: knock.cell.w, h: knock.cell.h }));
  knocker.anchor = { x: origin.x / knock.cell.w, y: origin.y / knock.cell.h };
  knocker.x = geo.knocker.x;
  knocker.y = geo.knocker.y;
  knocker.zIndex = itemZ('sloth_knocker', 4);
  knocker._worldHitW = 34;
  knocker._worldHitH = 52;
  layer.addChild(root, knocker);
  const sloth = { classId: 'npc_sloth', airborne: true, sprite: root };
  const knock2 = { classId: 'sloth_knocker', sprite: knocker };
  return { layer, geo, body, knocker, sloth, knock: knock2, targets: [sloth, knock2] };
}

const trees = [];
for (const [tsid, rows] of Object.entries(SLOTH_SPOTS)) {
  rows.forEach((row, i) => trees.push({ tsid, i, label: `${ecology.streets[tsid]?.label || tsid} ${i}`, spot: slothSpotFromRow(row) }));
}
// Haqiq Cedony (the report) first.
trees.sort((a, b) => (b.tsid === 'GDORIA62TLQ2HOH') - (a.tsid === 'GDORIA62TLQ2HOH'));

const STAGES = [
  { name: 'a computer (1280x800, stage scale 1)', scale: 1, x: -1200, y: -40 },
  { name: 'a phone (402x874, stage scale 0.58 as the game sets it there)', scale: 0.58, x: -611, y: 12 },
];
const POSES = [['hidden in the leaves', 'hidden'], ['hanging down', 'hangIdle1']];

describe('#746 reopened: a click or tap on the Knocker is the Knocker, the Sloth everywhere else', () => {
  it("the Knocker hangs inside its Sloth's box on many trees now (none on v0.79.0, KNOCKER_CLEAR), Chandrika Chimes's among them", () => {
    const inside = trees.filter(({ spot }) => {
      const { box, knocker } = slothGeometry({ x: spot.x, y: spot.y, sloth: spot });
      return knocker.x > box.left && knocker.x < box.right && knocker.y > box.top && knocker.y < box.bottom;
    });
    assert.equal(trees.length, 84);
    assert.ok(inside.length >= 30, `${inside.length} trees`);
    assert.ok(inside.some((t) => t.tsid === 'GHF6MVO2G6J2F1F'), 'Chandrika Chimes');
  });

  for (const stage of STAGES) {
    for (const [poseName, pose] of POSES) {
      it(`on ${stage.name}, the sloth ${poseName}: on the Knocker the Knocker, off it the Sloth (all 84 trees)`, () => {
        const bad = [];
        let onKnocker = 0;
        let inBoth = 0;
        let onSloth = 0;
        for (const { label, spot } of trees) {
          const s = slothScene(spot, pose, stage);
          const P = (x, y) => pickTarget(s.targets, x, y, { PIXI, layer: s.layer, pixelsOf });
          const kb = spriteWorldHitBox(s.knocker, targetPad(s.knock));
          const sb = spriteWorldHitBox(s.sloth.sprite, targetPad(s.sloth));
          const miss = [];
          // Every point of the Knocker's padded rectangle: its own art (drawn in front) is the Knocker,
          // and so is any point there the sloth's art does not cover.
          for (let y = Math.ceil(kb.top); y <= kb.bottom; y++) {
            for (let x = Math.ceil(kb.left); x <= kb.right; x++) {
              const onArt = solidNear(s.knocker, s.layer, x, y);
              // Off the Knocker's own pixels where the sloth's are drawn: what shows there is the sloth.
              if (!onArt && solidNear(s.body, s.layer, x, y, 2)) continue;
              if (onArt) onKnocker++;
              if (x >= sb.left && x <= sb.right && y >= sb.top && y <= sb.bottom) inBoth++;
              const got = P(x, y);
              if (got !== s.knock) miss.push(`(${x},${y}) ${onArt ? 'on its art' : 'beside it'}: ${got?.classId || 'nothing'}`);
            }
          }
          // The Sloth's padded box off the Knocker's rectangle, every 3 px: the Sloth.
          for (let y = Math.ceil(sb.top); y <= sb.bottom; y += 3) {
            for (let x = Math.ceil(sb.left); x <= sb.right; x += 3) {
              if (x >= kb.left && x <= kb.right && y >= kb.top && y <= kb.bottom) continue;
              onSloth++;
              const got = P(x, y);
              if (got !== s.sloth) miss.push(`(${x},${y}) off the Knocker: ${got?.classId || 'nothing'}`);
            }
          }
          if (miss.length) bad.push(`${label}: ${miss.length} points, first ${miss[0]}`);
        }
        assert.deepEqual(bad, []);
        assert.ok(onKnocker > 84 * 300, `${onKnocker} points on the Knockers' art`);
        assert.ok(inBoth > 1000, `${inBoth} Knocker points inside a Sloth's box`);
        assert.ok(onSloth > 84 * 1000, `${onSloth} Sloth points`);
      });
    }
  }
});
