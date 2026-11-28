/**
 * G1335 (the #748 review, 393x641 WebKit): on a phone a tap on a Thanksgiving feast pile often opened
 * the neighbouring pile. The 16 piles stand 19-21 source px apart (js/feast-day.js FEAST_SPOTS: two
 * runs of 7 and 9 between the Harvest Table, the spice tree and the shrine; the server's
 * feast_day.go lays the same spots), 6-7 px on a phone, while each pile's art is up to 89 px wide,
 * every other one drawn in front (feast-day-feature zIndex 12 / 11). The pick takes the front art
 * under the finger (js/pick.js, R56), so a tap on a pile drawn behind went to a neighbour in front.
 *
 * Now each pile's tap area is its own slot (feast-day fitPileTap: as wide as the gap to its nearest
 * neighbour, no padding), so a tap goes to the pile whose spot is nearest the finger. The piles are
 * ours (inventions feast-day-piles); Glitch had no feast.
 * Run: node --test tests/feast-pile-tap.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickTarget, resetPickMasks } from '../public/js/pick.js?v=c09a14e3';
import * as feast from '../public/js/feast-day.js?fresh=feast-pile-tap';

const { FEAST_SPOTS, PILE_HALF } = feast;

class Node {
  constructor() { this.x = 0; this.y = 0; this.scale = { x: 1, y: 1 }; this.children = []; this.parent = null; this.zIndex = 0; this.visible = true; this.alpha = 1; this.sortableChildren = false; }
  addChild(c) { c.parent = this; this.children.push(c); return c; }
  toGlobal(p) { let { x, y } = p; for (let n = this; n; n = n.parent) { x = x * n.scale.x + n.x; y = y * n.scale.y + n.y; } return { x, y }; }
  toLocal(g) { const chain = []; for (let n = this; n; n = n.parent) chain.unshift(n); let { x, y } = g; for (const n of chain) { x = (x - n.x) / n.scale.x; y = (y - n.y) / n.scale.y; } return { x, y }; }
}
class Sprite extends Node {
  constructor(texture) { super(); this.texture = texture; this.anchor = { x: 0.5, y: 1 }; }
  get width() { return Math.abs(this.texture.orig.width * this.scale.x); }
  get height() { return Math.abs(this.texture.orig.height * this.scale.y); }
}

/** A pile's art: the widest pile (a three-bite Sno Cone), solid from edge to edge. */
const W = PILE_HALF * 2;
const H = 60;
const tex = { frame: { x: 0, y: 0, width: W, height: H }, orig: { width: W, height: H }, source: { width: W, resource: { complete: true, naturalWidth: W } } };
const solid = () => ({ rgba: new Uint8Array(W * H * 4).fill(255), w: W, h: H });
const GROUND = 600;

/** The street's piles as feast-day-feature redraw lays them (fit: its tap area step). */
function street(fit) {
  const layer = new Node();
  layer.sortableChildren = true;
  const targets = FEAST_SPOTS.map((x, s) => {
    const sprite = layer.addChild(new Sprite(tex));
    sprite.x = x;
    sprite.y = GROUND;
    sprite.zIndex = s % 2 ? 11 : 12;
    if (fit) fit(sprite, s);
    return { classId: 'feast_day_pile', sprite, feastSpot: s };
  });
  // Pixi draws a sortable layer by zIndex, stable.
  layer.children = [...layer.children].sort((a, b) => a.zIndex - b.zIndex);
  return { layer, targets };
}

const tap = ({ layer, targets }, x, y = GROUND - H / 2) => pickTarget(targets, x, y, { layer, artParts: (t) => [t.sprite], pixelsOf: solid })?.feastSpot;

describe('G1335: a tap on a feast pile gets that pile', () => {
  it('a tap on each pile\'s spot, and a few px either side of it, picks that pile', () => {
    resetPickMasks();
    assert.equal(typeof feast.fitPileTap, 'function', 'feast-day.js fitPileTap');
    const scene = street(feast.fitPileTap);
    const wrong = [];
    FEAST_SPOTS.forEach((x, s) => {
      for (const dx of [-7, -3, 0, 3, 7]) {
        const got = tap(scene, x + dx);
        if (got !== s) wrong.push(`spot ${s} (x ${x}) +${dx}: got ${got}`);
      }
    });
    assert.deepEqual(wrong, []);
  });

  it('each tap goes to the nearest spot (the slots meet, no gaps and no overlap inside a run)', () => {
    const scene = street(feast.fitPileTap);
    for (let x = FEAST_SPOTS[0]; x <= FEAST_SPOTS.at(-1); x += 1) {
      const got = tap(scene, x);
      if (got == null) continue; // between the runs (the spice tree)
      const d = Math.abs(FEAST_SPOTS[got] - x);
      const nearest = Math.min(...FEAST_SPOTS.map((sx) => Math.abs(sx - x)));
      assert.ok(d - nearest <= 1, `x ${x}: spot ${got} at ${d} px, nearest at ${nearest}`);
    }
    // Inside a run every x picks a pile.
    for (const [from, to] of feast.FEAST_DAY_RULES.runs) for (let x = from; x <= to; x += 1) assert.notEqual(tap(scene, x), undefined, `x ${x}`);
  });

  it('feast-day-feature fits each pile it lays', () => {
    const src = readFileSync(new URL('../public/js/features/feast-day-feature.js', import.meta.url), 'utf8');
    assert.match(src, /fitPileTap\(sprite, p\.s\);/);
  });

  it('before: the piles drawn behind could not be tapped at their own spot (the bug)', () => {
    const scene = street(null);
    const behind = FEAST_SPOTS.filter((x, s) => s % 2 && tap(scene, x) !== s);
    assert.ok(behind.length >= 6, `${behind.length} of 8 piles behind went to a neighbour`);
  });
});
