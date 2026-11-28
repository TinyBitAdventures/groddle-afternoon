/**
 * The light-puzzle rig's made art, shared by Walk Toward the Light (light-perspective.js) and
 * Radiant Glare (radiant-glare.js): dish platforms, lamp shades, striped poles, stone ledges, wall
 * spotlights, caged switch bulbs and pipe knobs.
 *
 * Tiny Speck's art for these rooms was never archived and no CC0 deco matches what players' 2012
 * Snaps show, so these pictures were made for Groddle (GPT Image 2.6 Sunburst via T3 Chat, from our
 * measurement drawing, Tiny Speck's CC0 style sheet and the Snaps as reference only; dedicated
 * CC0 1.0). Each file's provenance is in tools/provenance/made-decos.json; the pack is
 * research/art-briefs/quest-rooms-2026-11-16 (outside git).
 *
 * They ship as made decos (assets/decos/groddle/gz_ai_*.webp at 2 px a unit, @1.5x at 3), so the
 * kit's deco loader picks the 3x file on dense screens. The dish, pole and bulbs are neutral grey:
 * one picture is tinted by the light it stands in, as the Snaps show the same piece in six colours.
 */

import { DECO_DIR, deco } from './kit.js?v=2c203c2c';
import { textureFromUrl } from '../textures.js?v=b8e38103';

/** Each piece's name and its size in world units (its 2x file is twice that in pixels). */
export const RIG_ART = Object.freeze({
  dish: Object.freeze({ name: 'gz_ai_lp_dish', w: 240, h: 50 }),
  shade: Object.freeze({ name: 'gz_ai_lp_shade', w: 100, h: 26 }),
  pole: Object.freeze({ name: 'gz_ai_lp_pole', w: 32, h: 75 }),
  poleCap: Object.freeze({ name: 'gz_ai_lp_pole_cap', w: 32, h: 16 }),
  ledgeLeft: Object.freeze({ name: 'gz_ai_lp_ledge_left', w: 40, h: 48 }),
  ledgeMid: Object.freeze({ name: 'gz_ai_lp_ledge_mid', w: 236, h: 48 }),
  ledgeRight: Object.freeze({ name: 'gz_ai_lp_ledge_right', w: 40, h: 48 }),
  spotlight: Object.freeze({ name: 'gz_ai_rg_spotlight', w: 62, h: 150 }),
  bulbOff: Object.freeze({ name: 'gz_ai_rg_bulb_off', w: 53, h: 59 }),
  bulbLit: Object.freeze({ name: 'gz_ai_rg_bulb_lit', w: 53, h: 59 }),
  knob: Object.freeze({ name: 'gz_ai_rg_knob', w: 30, h: 30 }),
});

/** Where the walking line crosses a dish (a share of its height from the top: the middle of its flat top). */
export const DISH_FEET = 0.2;
/** Pole segments stack this much (units at 32 wide) into the one above: the drawing's ~18 px, upper over lower. */
export const POLE_OVERLAP = 2.55;
/** The caged bulb inside its canvas (units, on the lit bulb's halo canvas): x1, y1, x2, y2. */
export const BULB_BOX = Object.freeze([14.8, 13.88, 37.85, 49.88]);
/** The spotlight's two bulbs (units from the picture's right edge and its middle) and their radius. */
export const SPOT_BULBS = Object.freeze({ dx: -54.5, dys: Object.freeze([-17, 15.5]), r: 7.5 });

/** The scale that draws a piece `w` units wide (its 2x file is 2 px a unit). */
const fit = (piece, w) => w / (piece.w * 2);

/** Mix two 0xrrggbb colours (t of b). */
export function mixHex(a, b, t) {
  const m = (sh) => Math.round(((a >> sh) & 0xff) * (1 - t) + ((b >> sh) & 0xff) * t) << sh;
  return m(16) | m(8) | m(0);
}

/** A dish platform `w` wide, tinted, its walking line at y 0. */
export function dishSprite(PIXI, w, tint) {
  return deco(PIXI, RIG_ART.dish.name, 0, 0, { ay: DISH_FEET, scale: fit(RIG_ART.dish, w), tint });
}

/** A lamp shade `w` wide, its rim at y 0 (hung from a wire drawn by the room). */
export function shadeSprite(PIXI, w = RIG_ART.shade.w) {
  return deco(PIXI, RIG_ART.shade.name, 0, 0, { ay: 1, scale: fit(RIG_ART.shade, w) });
}

/**
 * A striped pole `w` wide and `h` tall from (0, 0) at its top: segments stacked top to bottom,
 * each upper one drawn over the one below, cut at h, the cap on top. Tinted.
 */
export function poleSprite(PIXI, w, h, tint) {
  const c = new PIXI.Container();
  const k = w / RIG_ART.pole.w;
  const segH = RIG_ART.pole.h * k;
  const step = segH - POLE_OVERLAP * k;
  const n = Math.max(1, Math.ceil((h - segH) / step) + 1);
  const body = new PIXI.Container();
  for (let i = n - 1; i >= 0; i--) {
    body.addChild(deco(PIXI, RIG_ART.pole.name, 0, i * step, { ay: 0, scale: fit(RIG_ART.pole, w), tint }));
  }
  const clip = new PIXI.Graphics();
  clip.rect(-w, -1, w * 2, h + 1).fill(0xffffff);
  body.addChild(clip);
  body.mask = clip;
  c.addChild(body);
  // The cap sits over the top segment's rim.
  c.addChild(deco(PIXI, RIG_ART.poleCap.name, 0, 6 * k, { ay: 1, scale: fit(RIG_ART.poleCap, w), tint }));
  return c;
}

/**
 * A stone ledge from x1 to x2 whose top face carries the walking line y: its left end, the middle
 * tiled, its right end, `h` tall (48 at the drawing's size). left/right false leaves that end off (a wall).
 */
export function ledgeStrip(PIXI, x1, x2, y, { h = RIG_ART.ledgeMid.h, left = true, right = true } = {}) {
  const c = new PIXI.Container();
  const k = h / RIG_ART.ledgeMid.h;
  const top = y - 5 * k;
  const endW = RIG_ART.ledgeLeft.w * k;
  const lw = left ? endW : 0;
  const rw = right ? endW : 0;
  const midW = Math.max(0, x2 - x1 - lw - rw);
  if (midW > 0) {
    // The 2x file (or the 3x, resolution 1.5) is twice the piece's size in texture units: tiles at half scale.
    const mid = new PIXI.TilingSprite({ texture: textureFromUrl(`${DECO_DIR}${RIG_ART.ledgeMid.name}.png`), width: midW + 2, height: h, tileScale: { x: 0.5 * k, y: 0.5 * k } });
    mid.x = x1 + lw - 1;
    mid.y = top;
    c.addChild(mid);
  }
  if (lw) c.addChild(deco(PIXI, RIG_ART.ledgeLeft.name, x1, top, { ax: 0, ay: 0, scale: fit(RIG_ART.ledgeLeft, endW) }));
  if (rw) c.addChild(deco(PIXI, RIG_ART.ledgeRight.name, x2, top, { ax: 1, ay: 0, scale: fit(RIG_ART.ledgeRight, endW) }));
  c.ledgeTop = top;
  return c;
}

/**
 * A caged switch bulb `h` units tall (36 at the drawing's size), its collar's foot at (0, 0),
 * tinted `color`; `set(on)` swaps the pale off bulb for the lit one (a lighter tint, so it glows).
 * `set(null)` shows it off and untinted.
 */
export function bulbSprite(PIXI, color, h = 36) {
  const c = new PIXI.Container();
  const [bx1, by1, bx2, by2] = BULB_BOX;
  const scale = (h / (by2 - by1)) * 0.5;
  const opts = { ax: (bx1 + bx2) / 2 / RIG_ART.bulbOff.w, ay: by2 / RIG_ART.bulbOff.h, scale };
  const off = deco(PIXI, RIG_ART.bulbOff.name, 0, 0, opts);
  const lit = deco(PIXI, RIG_ART.bulbLit.name, 0, 0, opts);
  c.addChild(off, lit);
  c.off = off;
  c.lit = lit;
  c.setColor = (col) => {
    off.tint = col == null ? 0xffffff : mixHex(col, 0xffffff, 0.12);
    lit.tint = col == null ? 0xffffff : mixHex(col, 0xffffff, 0.3);
  };
  c.set = (on) => {
    off.visible = !on;
    lit.visible = Boolean(on);
  };
  c.setColor(color);
  c.set(false);
  return c;
}

/** A pipe knob `d` units across, centred on (x, y). */
export function knobSprite(PIXI, x, y, d = RIG_ART.knob.w) {
  return deco(PIXI, RIG_ART.knob.name, x, y, { ay: 0.5, scale: fit(RIG_ART.knob, d) });
}

/** The room x its light comes from, for a spotlight `h` tall on the wall at x. */
export function spotlightBeamX(side, x, h = RIG_ART.spotlight.h) {
  return x + SPOT_BULBS.dx * (h / RIG_ART.spotlight.h) * (side === 'L' ? -1 : 1);
}

/**
 * A wall spotlight `h` tall on the wall at x, centred on y, facing into the room (side 'R': drawn
 * as it is, facing left; 'L': mirrored). `lens` (Graphics over its two bulbs) is tinted by the room.
 */
export function spotlightSprite(PIXI, side, x, y, h = RIG_ART.spotlight.h) {
  const c = new PIXI.Container();
  const k = h / RIG_ART.spotlight.h;
  const s = side === 'L' ? -1 : 1;
  const spr = deco(PIXI, RIG_ART.spotlight.name, 0, 0, { ax: 1, ay: 0.5, scale: fit(RIG_ART.spotlight, RIG_ART.spotlight.w * k), flip: s < 0 });
  c.addChild(spr);
  const lens = new PIXI.Graphics();
  for (const dy of SPOT_BULBS.dys) lens.circle(SPOT_BULBS.dx * k * s, dy * k, SPOT_BULBS.r * k).fill(0xffffff);
  lens.alpha = 0;
  c.addChild(lens);
  c.lens = lens;
  c.x = x;
  c.y = y;
  return c;
}
