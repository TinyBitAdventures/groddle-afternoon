/**
 * Small drawing kit shared by the rebuilt quest rooms (js/quest-rooms/*.js).
 *
 * Every room builds a Pixi container for engine.enterScene in world pixels
 * (y down, a platform's y is its walking surface). Art comes from recovered
 * CC0 decos (assets/decos/groddle/<name>.png), item icons
 * (assets/sprites/icons/<class>.png) and per-room sprites under
 * assets/sprites/quest-rooms/<room>/; shapes the archive never had are drawn
 * here as clean vectors.
 */

import { frameTexture, isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js?v=01a295a1';

export const DECO_DIR = 'assets/decos/groddle/';
export const ICON_DIR = 'assets/sprites/icons/';
export const ROOM_ART_DIR = 'assets/sprites/quest-rooms/';

const hex = (color) => (typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16) || 0);

/** A vertical gradient sprite from [[0..1, '#rrggbb'], ...] stops. */
export function gradient(PIXI, stops, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of stops) grad.addColorStop(at, typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
  sprite.width = width;
  sprite.height = height;
  // On a screen-fixed layer it stretches to a view larger than it (fillView, g458).
  sprite.viewFill = { w: width, h: height };
  return sprite;
}

/**
 * Stretch a screen-fixed layer's gradients (and anything else marked
 * `viewFill = { w, h }`) to cover the view: rooms drew their skies for the
 * old 960 px view, and the view now follows the window (g458).
 */
export function fillView(layer, viewW, viewH) {
  const w = Number(viewW) || 0;
  const h = Number(viewH) || 0;
  if (!layer || !(w > 0)) return;
  for (const child of layer.children || []) {
    const fill = child.viewFill;
    if (!fill) continue;
    child.width = Math.max(fill.w, w);
    child.height = Math.max(fill.h, h);
  }
}

/**
 * The scene root: a container with `worldW`/`worldH` and parallax layers.
 * layer(factor) returns a child container shifted by camera * (1 - factor),
 * so factor 1 moves with the world and 0 stays fixed to the screen.
 */
export function sceneRoot(PIXI, width, height) {
  const root = new PIXI.Container();
  root.worldW = width;
  root.worldH = height;
  root.sortableChildren = true;
  const layers = [];
  root.layer = (factor = 1, zIndex = 0) => {
    const c = new PIXI.Container();
    c.zIndex = zIndex;
    c.factor = factor;
    root.addChild(c);
    if (factor !== 1) layers.push(c);
    return c;
  };
  root.updateParallax = (camX = 0, camY = 0, viewW = 0, viewH = 0, canvasH = viewH) => {
    for (const c of layers) {
      c.x = camX * (1 - c.factor);
      c.y = camY * (1 - c.factor);
      if (c.factor === 0) fillView(c, viewW, canvasH);
    }
  };
  return root;
}

/** A recovered deco, bottom-centre anchored by default. */
export function deco(PIXI, name, x, y, opts = {}) {
  const spr = new PIXI.Sprite(textureFromUrl(`${opts.dir || DECO_DIR}${name}.png`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, opts.sy ?? s);
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  if (opts.tint != null) spr.tint = hex(opts.tint);
  if (opts.rotation) spr.rotation = opts.rotation;
  if (opts.zIndex != null) spr.zIndex = opts.zIndex;
  return spr;
}

/** An item icon (assets/sprites/icons/<class>.png). */
export function icon(PIXI, classTsid, x, y, opts = {}) {
  return deco(PIXI, classTsid, x, y, { ...opts, dir: ICON_DIR });
}

/** A room sprite (assets/sprites/quest-rooms/<room>/<name>.png). */
export function roomArt(PIXI, roomId, name, x, y, opts = {}) {
  return deco(PIXI, name, x, y, { ...opts, dir: `${ROOM_ART_DIR}${roomId}/` });
}

/** Frames cut from a horizontal/grid sheet once it has loaded. */
export function sheetFrames(PIXI, url, cols, rows, count = cols * rows) {
  const base = sourceFromUrl(url);
  const frames = [];
  const cut = () => {
    const fw = Math.floor(base.width / cols);
    const fh = Math.floor(base.height / rows);
    frames.length = 0;
    for (let i = 0; i < count; i++) {
      const cx = (i % cols) * fw;
      const cy = Math.floor(i / cols) * fh;
      frames.push(frameTexture(base, new PIXI.Rectangle(cx, cy, fw, fh)));
    }
  };
  if (isLoaded(base)) cut();
  else onLoaded(base, cut);
  return { base, frames, ready: () => isLoaded(base) && frames.length > 0 };
}

/** An animated sprite from a sheet (starts on frame 0 once loaded). */
export function animated(PIXI, url, cols, rows, opts = {}) {
  const sheet = sheetFrames(PIXI, url, cols, rows, opts.count);
  const placeholder = [PIXI.Texture.EMPTY];
  const spr = new PIXI.AnimatedSprite(sheet.frames.length ? sheet.frames : placeholder);
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  spr.animationSpeed = opts.speed ?? 0.25;
  spr.scale.set(opts.scale ?? 1);
  const start = () => {
    if (!sheet.frames.length) return;
    spr.textures = sheet.frames;
    if (opts.play !== false) spr.play();
  };
  if (sheet.frames.length) start();
  else onLoaded(sheet.base, () => setTimeout(start, 0));
  return spr;
}

/* ------------------------------------------------------------------ */
/* Platforms                                                            */
/* ------------------------------------------------------------------ */

let nextId = 0;
/** A walkable line from (x1, y1) to (x2, y2) with a drawing style. */
export function plat(x1, y1, x2, y2 = y1, style = 'ledge', extra = {}) {
  const flip = x2 < x1;
  return {
    id: extra.id || `qi${(nextId += 1)}`,
    x1: Math.round(flip ? x2 : x1),
    y1: Math.round(flip ? y2 : y1),
    x2: Math.round(flip ? x1 : x2),
    y2: Math.round(flip ? y1 : y2),
    style,
    ...extra,
  };
}

/** Surface y of a platform at x (null when x is off it). */
export function surfaceAt(p, x) {
  if (!p || x < p.x1 || x > p.x2) return null;
  if (p.x2 === p.x1) return p.y1;
  return p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
}

export const PALETTES = Object.freeze({
  memory: { top: 0xffffff, side: 0xeef4fb, edge: 0xc6d4e4, shadow: 0xb7c7da },
  wood: { top: 0x9b6b3f, side: 0x7a4f2c, edge: 0x5b3a1f, shadow: 0x45301c },
  stone: { top: 0xb9b2a3, side: 0x8f8778, edge: 0x6b6458, shadow: 0x5a5448 },
  grass: { top: 0x7cb648, side: 0x6a4329, edge: 0x4d7c2c, shadow: 0x4f321f },
  lab: { top: 0xcfd6dc, side: 0x8d98a3, edge: 0x5f6b77, shadow: 0x4b5560 },
  autumn: { top: 0xd98f3f, side: 0x7b4a2a, edge: 0xa65b26, shadow: 0x5a3820 },
  cloud: { top: 0xffffff, side: 0xf3f7ff, edge: 0xd9e4f5, shadow: 0xc9d7ee },
});

/**
 * Draw a platform as a slab of `depth` px under its surface.
 * styles: any PALETTES key, plus 'branch' (tapered limb), 'invisible'.
 */
export function drawPlatform(g, p, opts = {}) {
  if (p.style === 'invisible' || p.hidden) return;
  const pal = PALETTES[p.palette || p.style] || PALETTES[opts.palette] || PALETTES.memory;
  const depth = p.depth ?? opts.depth ?? 18;
  const r = Math.min(8, depth / 2);
  if (p.style === 'branch') {
    g.setFillStyle(hex(p.color ?? 0x6e4a2b));
    g.moveTo(p.x1, p.y1 - 2);
    g.lineTo(p.x2, p.y2 - 4);
    g.lineTo(p.x2, p.y2 + 6);
    g.lineTo(p.x1, p.y1 + 14);
    g.closePath();
    g.fill();
    return;
  }
  if (p.y1 === p.y2) {
    g.roundRect(p.x1 + 3, p.y1 + 4, p.x2 - p.x1, depth, r).fill({ color: pal.shadow, alpha: 0.35 });
    g.roundRect(p.x1, p.y1, p.x2 - p.x1, depth, r).fill(pal.side);
    g.roundRect(p.x1, p.y1 - 1, p.x2 - p.x1, Math.min(7, depth / 2), Math.min(4, r)).fill(pal.top);
    g.roundRect(p.x1, p.y1 - 1, p.x2 - p.x1, depth + 1, r).stroke({ width: 1.5, color: pal.edge, alpha: 0.9 });
    return;
  }
  g.moveTo(p.x1, p.y1);
  g.lineTo(p.x2, p.y2);
  g.lineTo(p.x2, p.y2 + depth);
  g.lineTo(p.x1, p.y1 + depth);
  g.closePath();
  g.fill(pal.side);
  g.moveTo(p.x1, p.y1);
  g.lineTo(p.x2, p.y2);
  g.stroke({ width: 3, color: pal.top, alpha: 1 });
}

/** A climbable ladder zone (enterScene `walls`) plus its drawing. */
export function ladder(x, yTop, yBot) {
  return { x: Math.round(x), yTop: Math.round(yTop), yBot: Math.round(yBot) };
}

export function drawLadder(g, l, opts = {}) {
  const rail = hex(opts.rail ?? 0x7a5634);
  const rung = hex(opts.rung ?? 0xa47a4b);
  const half = opts.half ?? 16;
  g.moveTo(l.x - half, l.yTop);
  g.lineTo(l.x - half, l.yBot);
  g.moveTo(l.x + half, l.yTop);
  g.lineTo(l.x + half, l.yBot);
  g.stroke({ width: 5, color: rail, alpha: 1 });
  for (let y = l.yBot - 14; y > l.yTop; y -= 22) {
    g.moveTo(l.x - half, y);
    g.lineTo(l.x + half, y);
  }
  g.stroke({ width: 4, color: rung, alpha: 1 });
}

/** A soft, rounded text label (signs, room names). */
export function label(PIXI, text, x, y, opts = {}) {
  const t = new PIXI.Text({ text: text, style: {
    fontFamily: opts.font || 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: opts.size || 18,
    fontWeight: opts.weight || '800',
    fill: opts.fill ?? 0x3d3d3d,
    align: 'center',
    // { color, width } like a Pixi 8 text stroke; none by default.
    stroke: opts.stroke ?? null,
    wordWrap: Boolean(opts.wrap),
    wordWrapWidth: opts.wrap || 300,
  } });
  t.anchor.set(opts.ax ?? 0.5, opts.ay ?? 0.5);
  t.x = x;
  t.y = y;
  if (opts.alpha != null) t.alpha = opts.alpha;
  return t;
}

/** A glowing pickup orb (iMG mote, coin glint, light). */
export function glow(PIXI, x, y, color = 0xffe680, radius = 14) {
  const g = new PIXI.Graphics();
  for (let i = 4; i >= 1; i--) {
    g.setFillStyle({ color: hex(color), alpha: 0.12 * (5 - i) });
    g.circle(0, 0, radius * (0.6 + i * 0.25)).fill();
  }
  g.circle(0, 0, radius * 0.45).fill({ color: 0xffffff, alpha: 0.9 });
  g.x = x;
  g.y = y;
  return g;
}

/** Deterministic 0..1 from a string (stable scatter). */
export function hash01(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Distance from the avatar's feet to a point. */
export function distanceTo(player, x, y) {
  if (!player) return Infinity;
  return Math.hypot((player.x || 0) - x, (player.y || 0) - y);
}
