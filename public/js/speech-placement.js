/**
 * Where a world speech bubble goes over its speaker (register G214).
 *
 * The client (glitch-client, reference only):
 * - LisChatBubbleManager.as bubble 100-130: an itemstack's bubble points at
 *   LocationItemstackView.getYAboveDisplay() (633-655: the top of the view's
 *   drawn bounds, getRect, so the art and not its padded frame) moved by the
 *   message's offset_x / offset_y (130), and a negative offset_x reverses the
 *   pointer (129).
 * - GameServerJS item.js sendBubble 562-584 (CC0) sends those offsets from the
 *   class's conversation_offset_x / conversation_offset_y; conversations use
 *   the same props (include/npc_conversation.js 87-90, 168-171). Every Street
 *   Spirit has 0 / 60 (street_spirit*.js classProps 26-27): its bubble points
 *   60 px down into its art, so the 244 px Firebog spirit keeps its bubble in
 *   the 408 px view without a camera move or a bubble beside it.
 * - ChatBubble.as keepInBounds 98-117: a bubble above the top of the view is
 *   pushed down over its speaker, for itemstack bubbles "within reason"
 *   (LisChatBubbleManager.as 124: keep_in_viewport_within_reason) at most
 *   120 px (114).
 *
 * The remake keeps its own rule beyond that (G185): when even the client's
 * push would leave the bubble pointing past the middle of the speaker, it
 * hangs under the speaker's feet, tail up, when that fits.
 */

/** ChatBubble.as keepInBounds 114: y -= Math.max(-120, rect.y). */
export const SPEECH_PUSH_LIMIT = 120;

/** An alpha at or under this counts as empty when measuring art. */
export const OPAQUE_ALPHA = 16;

/**
 * GameServerJS conversation_offset_x / conversation_offset_y (classProps,
 * items/<class>.js lines 22-27) for the classes the remake lets speak; every
 * other class is 0 / 0. Street spirits get theirs from the spirits feature
 * (the vendor target's class is its store), see STREET_SPIRIT_SPEECH_OFFSET.
 */
export const SPEECH_OFFSETS = Object.freeze({
  npc_piggy: Object.freeze({ x: 0, y: -22 }), // npc_piggy.js 24-25
  mortar_barnacle: Object.freeze({ x: -10, y: -20 }), // mortar_barnacle.js 22-23
  patch: Object.freeze({ x: 0, y: -35 }), // patch.js 22-23
  patch_dark: Object.freeze({ x: 0, y: -35 }), // patch_dark.js 22-23
  patch_seedling: Object.freeze({ x: 0, y: -35 }), // patch_seedling.js 22-23
  peat_1: Object.freeze({ x: -8, y: 0 }), // peat_1.js 22-23
  peat_2: Object.freeze({ x: -8, y: 0 }), // peat_2.js 22-23
  peat_3: Object.freeze({ x: -8, y: 0 }), // peat_3.js 22-23
  rock_beryl_1: Object.freeze({ x: -16, y: 0 }), // rock_beryl_1.js 24-25
  rock_beryl_2: Object.freeze({ x: -16, y: 0 }),
  rock_beryl_3: Object.freeze({ x: -16, y: 0 }),
  rock_dullite_1: Object.freeze({ x: -10, y: 0 }), // rock_dullite_1.js 24-25
  rock_dullite_2: Object.freeze({ x: -10, y: 0 }),
  rock_dullite_3: Object.freeze({ x: -10, y: 0 }),
  rock_sparkly_1: Object.freeze({ x: -6, y: 0 }), // rock_sparkly_1.js 24-25
  rock_sparkly_2: Object.freeze({ x: -6, y: 0 }),
  rock_sparkly_3: Object.freeze({ x: -6, y: 0 }),
  hell_bartender: Object.freeze({ x: 0, y: 20 }), // hell_bartender.js 24-25
  phantom_glitch: Object.freeze({ x: 0, y: 60 }), // phantom_glitch.js 24-25
  ice_knob: Object.freeze({ x: 0, y: -40 }), // ice_knob.js 22
});

/** street_spirit.js / _groddle / _firebog / _zutto / _ix classProps 26-27. */
export const STREET_SPIRIT_SPEECH_OFFSET = Object.freeze({ x: 0, y: 60 });

const NONE = Object.freeze({ x: 0, y: 0 });

/** The speaker's offset: its own (set by a feature) or its class's. */
export function speechOffsetFor(target) {
  const own = target?.speechOffset;
  if (own && (Number.isFinite(own.x) || Number.isFinite(own.y))) return { x: Number(own.x) || 0, y: Number(own.y) || 0 };
  return SPEECH_OFFSETS[String(target?.classId || '')] || NONE;
}

/**
 * The tail tip's y for a bubble (view or world units, y down).
 *  want    the tip over the speaker's art, offsets applied
 *  minTip  the highest tip that keeps the bubble's top in view
 *  maxTip  the lowest tip still in view
 *  artTop  the top of the speaker's art; feet its feet
 *  below   the tip when hung under the feet; belowFits whether that fits
 * Returns { tip, flip }.
 */
export function placeSpeechTip({ want, minTip, maxTip, artTop, feet, below, belowFits }) {
  const top = Math.min(minTip, maxTip);
  if (want >= top) return { tip: Math.min(want, maxTip), flip: false };
  // Pushed down over the speaker, as far as the client would and while the
  // tail still points at the upper half of the art.
  const middle = Number.isFinite(artTop) && Number.isFinite(feet) ? (artTop + feet) / 2 : Infinity;
  if (top - want <= SPEECH_PUSH_LIMIT && top <= middle) return { tip: top, flip: false };
  if (belowFits) return { tip: below, flip: true };
  return { tip: top, flip: false };
}

/** The first row (0 = top) of a w x h alpha array with any pixel over OPAQUE_ALPHA, or -1. */
export function firstOpaqueRow(alpha, w, h, stride = 1) {
  for (let y = 0; y < h; y += 1) {
    const row = y * w * stride;
    for (let x = 0; x < w; x += 1) {
      if (alpha[row + x * stride] > OPAQUE_ALPHA) return y;
    }
  }
  return -1;
}

const tops = new WeakMap();
let scratch = null;

/**
 * The first opaque row of a Pixi texture's frame, read once from its image
 * (null while it has not loaded, or outside a browser). `read` replaces the
 * canvas read in tests: (texture) => { alpha, w, h, stride } | null.
 */
export function opaqueTopOf(texture, read = readFrameAlpha) {
  if (!texture) return null;
  if (tops.has(texture)) return tops.get(texture);
  const px = read(texture);
  if (!px) return null;
  const row = firstOpaqueRow(px.alpha, px.w, px.h, px.stride || 1);
  const top = row < 0 ? px.h : row;
  tops.set(texture, top);
  return top;
}

function readFrameAlpha(texture) {
  const res = texture?.source?.resource;
  const f = texture?.frame;
  if (!res || !f || !(f.width > 0) || !(f.height > 0) || typeof document === 'undefined') return null;
  if (res.complete === false || !(res.width > 0)) return null;
  try {
    scratch ||= document.createElement('canvas');
    const w = Math.ceil(f.width);
    const h = Math.ceil(f.height);
    if (scratch.width < w) scratch.width = w;
    if (scratch.height < h) scratch.height = h;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(res, f.x, f.y, f.width, f.height, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return { alpha: data.subarray(3), w, h, stride: 4 };
  } catch {
    return null;
  }
}

/**
 * How far a sprite's art reaches above its anchor point, in world px: the
 * opaque top of its frame (the tallest frame of an animated clip), scaled.
 * 0 when not known yet.
 */
export function artHeightOf(sprite, read = readFrameAlpha) {
  if (!sprite || sprite.destroyed) return 0;
  const list = Array.isArray(sprite.textures) && sprite.textures.length ? sprite.textures : [sprite.texture];
  const ay = Number(sprite.anchor?.y) || 0;
  let best = 0;
  for (const tex of list) {
    const top = opaqueTopOf(tex, read);
    if (top == null) return 0;
    const h = Number(tex.orig?.height ?? tex.frame?.height) || 0;
    const trimY = Number(tex.trim?.y) || 0;
    best = Math.max(best, ay * h - (top + trimY));
  }
  return Math.max(0, best * Math.abs(Number(sprite.scale?.y) || 1));
}

/** Animals, trees and Icons measure their art (G214); Street Spirits use their sheet's crop. */
export const ART_HEIGHT_CLASS = /^(npc_(piggy|chicken|butterfly|batterfly)|trant_\w+|wood_tree|icon_\w+)$/;

/**
 * Give a target an artHeight read from its sprite each time it is asked
 * (cached per texture), unless something already set one.
 */
export function giveArtHeight(target, read = readFrameAlpha) {
  if (!target || !ART_HEIGHT_CLASS.test(String(target.classId || '')) || 'artHeight' in target) return target;
  Object.defineProperty(target, 'artHeight', {
    configurable: true,
    enumerable: false,
    get: () => artHeightOf(target.sprite, read),
    // A feature that knows better can still set one.
    set: (value) => Object.defineProperty(target, 'artHeight', { value, writable: true, configurable: true, enumerable: true }),
  });
  return target;
}

/**
 * The tail of a bubble clamped at the edge of the view (register G233).
 *
 * The client (glitch-client ChatBubble.as keepInBounds 170-200, reference
 * only): when it slid a bubble in from the edge by adj_x it slid the pointer
 * back by the same amount, so the tip stayed over the speaker (179-183), kept
 * it at least 10 px in from the bubble's left end (175, 186) and, past the
 * right end (176, 189-193), flipped the 25 px pointer so its tip sat 10 px in
 * from the right end and leant out toward the speaker. The remake's tail is a
 * symmetric 18 px wedge, so the same idea is: the tip follows the speaker
 * inside the bubble's ends, and the wedge's base stops short of the rounded
 * corners, which tilts the tail toward a speaker past the bubble's end.
 */

/** ChatBubble.as 175-176: the pointer stays 10 px in from either end. */
export const SPEECH_TAIL_TIP_INSET = 10;
/** The remake's wedge: 9 px each side of its base centre, 11 px tall (game.js showSpeechBubble). */
export const SPEECH_TAIL_HALF = 9;
export const SPEECH_TAIL_HEIGHT = 11;
/** The bubble's corner radius (game.js showSpeechBubble roundRect). */
export const SPEECH_BUBBLE_RADIUS = 12;

/**
 * Where the tail goes along a bubble `width` wide whose centre is at
 * `bubbleX` (world or view x) for a speaker at `speakerX` (its x plus the
 * class's offset_x, the point the bubble was meant to be centred on).
 * Returns { tip, base } in the bubble's own x (0 = its left end).
 */
export function placeSpeechTail({ bubbleX, width, speakerX }) {
  const w = Number(width) || 0;
  const mid = w / 2;
  const off = Number(speakerX) - Number(bubbleX);
  const want = mid + (Number.isFinite(off) ? off : 0);
  const clampTo = (v, lo, hi) => (lo > hi ? mid : Math.min(hi, Math.max(lo, v)));
  const tip = clampTo(want, SPEECH_TAIL_TIP_INSET, w - SPEECH_TAIL_TIP_INSET);
  const edge = SPEECH_BUBBLE_RADIUS + SPEECH_TAIL_HALF;
  const base = clampTo(tip, edge, w - edge);
  return { tip: Math.round(tip * 2) / 2, base: Math.round(base * 2) / 2 };
}

/**
 * The wedge's points for a bubble `height` tall: `fill` is the closed shape
 * (overlapping the bubble's border by 2 px so the two read as one), `edge`
 * the two slanted sides to outline. `up` is the tail of a bubble hung under
 * its speaker (G185), drawn from the bubble's top.
 */
export function speechTailPoints({ height, tip, base, up = false, length = SPEECH_TAIL_HEIGHT }) {
  const h = SPEECH_TAIL_HALF;
  const y0 = up ? 0 : height;
  const yIn = up ? 2 : height - 2;
  const yTip = up ? -length : height + length;
  return {
    fill: [base - h, yIn, tip, yTip, base + h, yIn],
    edge: [base - h, y0, tip, yTip, base + h, y0],
  };
}

/*
 * G269: a bubble never sits under the top-left HUD column (the activity
 * feed's popups and the buff strip over it). The client had no such column:
 * its activity went to the Local chat pane and growls (GrowlQueue.as), so
 * this is the remake's own rule, the same kind as keeping clear of the
 * street-name pill. Everything here is in view px, y down from the top of
 * the location view.
 */

/** Gap kept between a bubble (body and tail) and the column, in view px. */
export const SPEECH_HUD_MARGIN = 6;

/**
 * The bubble's box on screen, tail included: a bubble tip-down has its
 * body height + 11 above `tip`; one hung under the feet (`flip`) has its
 * tail from `tip` down, then the body.
 */
export function speechBubbleRect({ left, width, height, tip, flip = false }) {
  const top = flip ? tip : tip - height - SPEECH_TAIL_HEIGHT;
  return { left, right: left + width, top, bottom: top + height + SPEECH_TAIL_HEIGHT };
}

function overlaps(a, b, margin) {
  return a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;
}

/**
 * Where a placed bubble goes so it clears `box` (the HUD column), or null
 * when it already does. Tries, keeping the smallest move:
 * - beside the column, while the tail can still point at the speaker
 *   (`speakerX`, inside the tip inset of either end);
 * - below the column, tip down, while the tip stays at or above the feet;
 * - hung under the feet (G185), when the feet are already below the column.
 * With none fitting (a phone-width view the column fills) it stays put,
 * `how: 'over'`, and game.js fades the column under it instead.
 * Returns { dx, tip, flip, how } (dx moves the bubble's x).
 */
export function clearSpeechOfBox({ left, width, height, tip, flip = false, speakerX, feet, box, viewWidth, viewBottom, margin = SPEECH_HUD_MARGIN, edge = 12 }) {
  if (!box || !(box.right > box.left) || !(box.bottom > box.top)) return null;
  const now = speechBubbleRect({ left, width, height, tip, flip });
  if (!overlaps(now, box, margin)) return null;
  const reaches = (l) => !Number.isFinite(speakerX) || (speakerX >= l + SPEECH_TAIL_TIP_INSET && speakerX <= l + width - SPEECH_TAIL_TIP_INSET);
  const options = [];
  for (const l of [box.right + margin, box.left - margin - width]) {
    if (l >= edge && l + width <= viewWidth - edge && reaches(l)) {
      options.push({ dx: l - left, tip, flip, how: 'beside', cost: Math.abs(l - left) });
    }
  }
  const downTip = box.bottom + margin + height + SPEECH_TAIL_HEIGHT;
  if (downTip <= viewBottom && (!Number.isFinite(feet) || downTip <= feet)) {
    options.push({ dx: 0, tip: downTip, flip: false, how: 'below', cost: Math.abs(downTip - height - SPEECH_TAIL_HEIGHT - now.top) });
  }
  const underTip = Number.isFinite(feet) ? feet + 6 : NaN;
  if (underTip >= box.bottom + margin && underTip + SPEECH_TAIL_HEIGHT + height <= viewBottom) {
    options.push({ dx: 0, tip: underTip, flip: true, how: 'under', cost: Math.abs(underTip - now.top) });
  }
  if (!options.length) return { dx: 0, tip, flip, how: 'over' };
  options.sort((a, b) => a.cost - b.cost);
  const { cost, ...best } = options[0];
  return best;
}

/**
 * One box round the visible elements (the feed's popup lines, the buff
 * strip), in view px of a canvas drawn at viewW x viewH; null when none is
 * showing. Browser only.
 */
export function hudColumnBox(elements, canvas, viewW, viewH) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return null;
  const c = canvas.getBoundingClientRect();
  if (!c.width || !c.height) return null;
  const sx = viewW / c.width;
  const sy = viewH / c.height;
  let box = null;
  for (const el of elements) {
    if (!el || el.hidden) continue;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const b = { left: (r.left - c.left) * sx, right: (r.right - c.left) * sx, top: (r.top - c.top) * sy, bottom: (r.bottom - c.top) * sy };
    box = box
      ? { left: Math.min(box.left, b.left), right: Math.max(box.right, b.right), top: Math.min(box.top, b.top), bottom: Math.max(box.bottom, b.bottom) }
      : b;
  }
  return box;
}

/*
 * G357: a bubble keeps off another Glitch's head (Austin 2026-10-27: a short
 * speaker's bubble covered the player beside it). The client never moved a
 * bubble for an avatar; its own moves were the top-of-view push (above) and a
 * sideways slide, so that is how a bubble gets off a head here (G427 below).
 */

/** Gap kept between a bubble and the head beside it. */
export const SPEECH_AVATAR_MARGIN = 6;

/** ChatBubble.as keepInBounds 160-169: the client moved a bubble sideways at most 100 px (adj_x_limit). */
export const SPEECH_SLIDE_LIMIT = 100;

/*
 * G427 (Austin 2026-10-29, The Great Hole to Ix: a Jack-O-Lantern's bubble
 * lifted over the player with a 250 px white tail). The client's pointer is
 * one talk_bubble_point clip that never stretches (ChatBubble.as 374-379); a
 * bubble moved sideways and its pointer slid along the bottom to stay on the
 * speaker (keepInBounds 172-201). So a bubble that would cover a player now
 * slides off their head the same way, at most SPEECH_SLIDE_LIMIT px, its
 * tail the client's 11 px and its tip still over the speaker.
 */

/**
 * The smallest sideways move (world or view x) that takes a tip-down
 * bubble's body off every avatar box it overlaps: `left`/`width`/`height` the
 * body, `tip` the tail's point, `speakerX` where the tail must still point,
 * `minLeft`/`maxRight` the view's edges, `avatars` boxes { left, right, top,
 * bottom } (the speaker's own left out). Returns { dx, covered } (covered: no
 * move within the limit clears them; dx is then 0).
 */
export function slideOffAvatars({
  left, width, height, tip, speakerX, avatars,
  minLeft = -Infinity, maxRight = Infinity,
  limit = SPEECH_SLIDE_LIMIT, margin = SPEECH_AVATAR_MARGIN,
}) {
  const bottom = tip - SPEECH_TAIL_HEIGHT;
  const top = bottom - height;
  const heads = (avatars || []).filter((a) => a && a.right > a.left && a.bottom > a.top
    && bottom > a.top - margin && top < a.bottom);
  const covers = (dx) => heads.some((a) => left + dx + width > a.left - margin && left + dx < a.right + margin);
  if (!covers(0)) return { dx: 0, covered: false };
  // The tail's tip stays on the speaker, inside the body (placeSpeechTail's inset).
  const lo = Math.max(-limit, minLeft - left, speakerX - (left + width - SPEECH_TAIL_TIP_INSET));
  const hi = Math.min(limit, maxRight - width - left, speakerX - (left + SPEECH_TAIL_TIP_INSET));
  const tries = [];
  for (const a of heads) tries.push(a.right + margin - left, a.left - margin - width - left);
  let best = null;
  for (const dx of tries) {
    if (dx < lo || dx > hi || covers(dx)) continue;
    if (best === null || Math.abs(dx) < Math.abs(best)) best = dx;
  }
  return best === null ? { dx: 0, covered: true } : { dx: best, covered: false };
}

