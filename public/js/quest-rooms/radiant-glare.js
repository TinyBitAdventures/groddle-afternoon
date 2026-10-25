/**
 * Radiant Glare (quests/radiant_glare.js + radiant_glare_rem.js).
 *
 * Source: onStarted makes a private copy of LIFFFRAHB4A3JHJ (the reminisce
 * copy LIFQ6PP37QB3PDA, both hub 135 "Radiant Glare" in inc_data_maps_prod.js)
 * at its marker_teleport, with a 5 * 60 second exit delay and preserve_links.
 * Leaving before the quest is complete fails it (onExitLocation sets `leave`,
 * then failQuest). The requirements are the flags `solved_puzzle` ("You made
 * it!") and `leave` ("Complete the Journey"). First run: 1500 currants,
 * 200 mood, 200 energy, 150 Alph favor; reminisce: 350 currants, 200 mood,
 * 50 Alph favor. items/focusing_orb.js refuses to work inside either copy
 * ("I'd say, doing that would give you an unfair advantage.").
 *
 * Neither template (nor any instantiated copy) is in the locations dump, and
 * the level's lamps, orbs and colour panels were location scripts, not items,
 * so the level is rebuilt from the level designer's own run-through
 * (reference video ZQQydNM9THI): one tall dark shaft climbed floor by floor
 * "toward the radiant glare above". Platforms only exist while light of their
 * colour falls on them.
 *  1. Three lamps. Touching a glowing orb switches on the wall lamp of its
 *     colour for about ten seconds (timed from the footage, where a slow climb
 *     drops the player back to the floor): yellow leads to the blue orb, blue
 *     to the red one, red to the ladder.
 *  2. The mixer. A console with two banks of red, yellow and blue bulbs; the
 *     lamp shows the mix (red + yellow orange, red + blue purple, yellow +
 *     blue green). Green climbs to the ladder; purple to a bonus quoin.
 *  3. The totem. The same mixer stood on end, its top bank out of reach:
 *     "Can't reach a button? I heard clicking on it works just as well."
 *     Blue climbs halfway; switching to purple from up there (clicking the
 *     red bulb from afar) carries on to the ladder.
 *  4. The glare. A rainbow over the EXIT door, quoins along its arch.
 * Art is drawn as clean vectors in the footage's palette (no recovered deco
 * matches the lamps, disc platforms or panels); the EXIT sign is the
 * recovered sign_exit_starter_01a.
 */

import { BODY_H, JUMP_GAP, JUMP_RISE, spawnQuoins, takeQuoins } from './puzzle-kit.js?v=rg-1';

export const W = 1100;
export const H = 3400;
/** Walking surfaces of the four floors, bottom to top. */
export const FLOORS = Object.freeze({ lamps: 3240, mixer: 2210, totem: 1390, glare: 390 });
/** The dark slab under each upper floor. */
export const SLAB = 120;
/** Wall lamps in the first room stay on this long after their orb is touched (footage: about ten seconds). */
export const LAMP_MS = 10_000;
/** The last stretch of a lamp's time flickers. */
export const LAMP_WARN_MS = 2_500;
/** source: quests/radiant_glare.js onStarted questInstanceLocation(..., 5*60, {preserve_links: true}). */
export const EXIT_DELAY_MS = 5 * 60 * 1000;
export const HINT = "Can't reach a button? I heard clicking on it works just as well.";

export const LIGHT = Object.freeze({
  red: { hex: 0xe8584a, css: '#e8584a', glow: 0xff6a55, label: 'Red' },
  yellow: { hex: 0xe8d54a, css: '#e8d54a', glow: 0xfff07a, label: 'Yellow' },
  blue: { hex: 0x4f6fe0, css: '#6f8cff', glow: 0x6f8cff, label: 'Blue' },
  orange: { hex: 0xf09a3a, css: '#f09a3a', glow: 0xffb055, label: 'Orange' },
  purple: { hex: 0xb45ad6, css: '#c77ae6', glow: 0xd27cff, label: 'Purple' },
  green: { hex: 0x4fc45a, css: '#5fd36a', glow: 0x6fe07a, label: 'Green' },
});
export const PRIMARIES = Object.freeze(['red', 'yellow', 'blue']);

const MIXES = Object.freeze({ 'red+yellow': 'orange', 'blue+red': 'purple', 'blue+yellow': 'green' });

/** The colour a mixer shows for its two banks' bulbs (either may be null). */
export function mixColor(a, b) {
  if (!a && !b) return null;
  if (!a || !b || a === b) return a || b;
  return MIXES[[a, b].sort().join('+')] || null;
}

/** Which floor a y (feet) belongs to. */
export function tierAt(y) {
  if (y > FLOORS.mixer + 20) return 'lamps';
  if (y > FLOORS.totem + 20) return 'mixer';
  if (y > FLOORS.glare + 20) return 'totem';
  return 'glare';
}

/* ------------------------------------------------------------------ */
/* Layout                                                               */
/* ------------------------------------------------------------------ */

const PW = 150;

/** The rainbow's walking line over the EXIT: ends 80 px up (a hop), crown 230 px up. */
export function rainbowY(x) {
  const t = (x - 200) / 700;
  if (t < 0 || t > 1) return null;
  return FLOORS.glare - 80 - 150 * Math.sin(Math.PI * t);
}

export function radiantLayout() {
  const F = FLOORS;
  const platforms = [];
  const add = (tier, colors, cx, y, w = PW, extra = {}) => {
    const list = Array.isArray(colors) ? colors : [colors];
    platforms.push({ id: `${tier}_${list.join('-')}_${cx}_${y}`, tier, colors: list, x1: cx - w / 2, x2: cx + w / 2, y, cx, ...extra });
  };
  // 1. Three lamps: yellow -> blue orb, blue -> red orb, red -> ladder.
  add('lamps', 'yellow', 700, 3150);
  add('lamps', 'yellow', 900, 3060);
  add('lamps', 'yellow', 1020, 2970);
  add('lamps', 'blue', 860, 2880);
  add('lamps', 'blue', 640, 2790);
  add('lamps', 'blue', 420, 2700);
  add('lamps', 'red', 600, 2610);
  add('lamps', 'red', 820, 2520);
  add('lamps', 'red', 1010, 2430);
  // 2. The mixer (console top 2140). Green is the way; purple a bonus; the rest dead ends.
  add('mixer', 'green', 830, 2060);
  add('mixer', 'green', 1010, 1970);
  add('mixer', 'green', 820, 1880);
  add('mixer', 'green', 590, 1790);
  add('mixer', 'green', 370, 1700);
  add('mixer', 'green', 150, 1610);
  add('mixer', 'purple', 280, 2060);
  add('mixer', 'purple', 110, 1970);
  add('mixer', 'purple', 320, 1880);
  add('mixer', 'purple', 540, 1795);
  add('mixer', 'purple', 760, 1710);
  add('mixer', 'purple', 980, 1625);
  add('mixer', 'red', 850, 2050);
  add('mixer', 'red', 1020, 1960);
  add('mixer', 'yellow', 270, 2050);
  add('mixer', 'yellow', 100, 1960);
  add('mixer', 'blue', 840, 2055);
  add('mixer', 'blue', 1010, 1965);
  add('mixer', 'blue', 860, 1875);
  add('mixer', 'orange', 260, 2055);
  add('mixer', 'orange', 90, 1965);
  add('mixer', 'orange', 300, 1875);
  // 3. The totem (slab 1295). Blue to the two-tone platform, purple on to the ledge.
  add('totem', 'blue', 790, 1210);
  add('totem', 'blue', 980, 1120);
  add('totem', 'blue', 800, 1030);
  add('totem', ['blue', 'purple'], 600, 940, PW, { junction: true });
  add('totem', 'purple', 800, 850);
  add('totem', 'purple', 990, 760);
  add('totem', 'purple', 410, 1210);
  add('totem', 'purple', 210, 1120);
  add('totem', 'orange', 400, 1205);
  add('totem', 'orange', 190, 1115);
  add('totem', 'orange', 380, 1025);
  add('totem', 'orange', 180, 935);
  add('totem', 'green', 790, 1205);
  add('totem', 'green', 990, 1115);
  add('totem', 'red', 420, 1210);
  add('totem', 'red', 230, 1120);
  add('totem', 'yellow', 800, 1205);
  add('totem', 'yellow', 990, 1115);

  const console = { cx: 550, x1: 390, x2: 710, top: F.mixer - 70 };
  // The upper bank hangs on a tall stem, just under the two-tone disc: out of reach, but in view from up there.
  const totem = { cx: 600, x1: 520, x2: 680, top: F.totem - 95, bankA: F.totem - 38, bankB: 1010 };
  return {
    platforms,
    // Permanent walking lines: the floors, the console, the totem slab, the ledge under the last ladder.
    solids: [
      { id: 'rg_floor_lamps', x1: 0, x2: W, y: F.lamps },
      { id: 'rg_floor_mixer', x1: 0, x2: W, y: F.mixer },
      { id: 'rg_floor_totem', x1: 0, x2: W, y: F.totem },
      { id: 'rg_floor_glare', x1: 0, x2: W, y: F.glare },
      { id: 'rg_console', x1: console.x1, x2: console.x2, y: console.top },
      { id: 'rg_totem_slab', x1: totem.x1, x2: totem.x2, y: totem.top },
      { id: 'rg_ledge', x1: 930, x2: W, y: 670 },
    ],
    console,
    totem,
    ladders: [
      { id: 'lamps', x: 1040, yTop: F.mixer, yBot: 2430 },
      { id: 'mixer', x: 120, yTop: F.totem, yBot: 1610 },
      { id: 'totem', x: 1040, yTop: F.glare, yBot: 670 },
    ],
    // Touch an orb to light its lamp (room 1).
    orbs: [
      { color: 'yellow', x: 480, y: F.lamps - 46 },
      { color: 'blue', x: 1020, y: 2970 - 62 },
      { color: 'red', x: 400, y: 2700 - 92 },
    ],
    lamps: [
      { id: 'yellow', tier: 'lamps', side: 'L', y: 3080 },
      { id: 'blue', tier: 'lamps', side: 'R', y: 2800 },
      { id: 'red', tier: 'lamps', side: 'L', y: 2540 },
      { id: 'mixer', tier: 'mixer', side: 'R', y: 1880 },
      { id: 'totem', tier: 'totem', side: 'L', y: 1040 },
    ],
    // Bulbs: bank a / b of each panel, three primaries each.
    bulbs: [
      ...PRIMARIES.map((color, i) => ({ id: `mixer_a_${color}`, panel: 'mixer', bank: 'a', color, x: 430 + i * 40, y: F.mixer - 30 })),
      ...PRIMARIES.map((color, i) => ({ id: `mixer_b_${color}`, panel: 'mixer', bank: 'b', color, x: 590 + i * 40, y: F.mixer - 30 })),
      ...PRIMARIES.map((color, i) => ({ id: `totem_a_${color}`, panel: 'totem', bank: 'a', color, x: totem.cx - 40 + i * 40, y: totem.bankA })),
      ...PRIMARIES.map((color, i) => ({ id: `totem_b_${color}`, panel: 'totem', bank: 'b', color, x: totem.cx - 40 + i * 40, y: totem.bankB })),
    ],
    quoins: [
      { x: 600, y: 2535, type: 'xp' },
      { x: 980, y: 1555, type: 'xp' },
      { x: 180, y: 865, type: 'xp' },
      { x: 1000, y: 608, type: 'xp' },
      ...[0.15, 0.5, 0.85].map((t) => ({ x: Math.round(200 + 700 * t), y: Math.round(rainbowY(200 + 700 * t) - 44), type: 'xp' })),
    ],
    door: { x: 470, y: F.glare },
    spawn: { x: 150, y: F.lamps },
    // The lighting a player follows, room by room (tests walk it).
    solution: {
      lamps: [['yellow'], ['yellow', 'blue'], ['blue', 'red']],
      mixer: { a: 'yellow', b: 'blue' },
      totem: [{ a: 'blue', b: null }, { a: 'blue', b: 'red' }],
    },
  };
}

/** Lit colours per floor for a light state at `now`. */
export function litByTier(state, now = Date.now()) {
  const lamps = new Set();
  for (const [color, until] of Object.entries(state?.lampUntil || {})) if (until > now) lamps.add(color);
  const mixer = mixColor(state?.mixer?.a, state?.mixer?.b);
  const totem = mixColor(state?.totem?.a, state?.totem?.b);
  return { lamps, mixer: new Set(mixer ? [mixer] : []), totem: new Set(totem ? [totem] : []), glare: new Set() };
}

export function isLit(platform, lit) {
  const on = lit?.[platform.tier];
  return Boolean(on && platform.colors.some((c) => on.has(c)));
}

/** Every walking line for a lighting: the permanent ones and the lit platforms. */
export function walkable(layout, lit) {
  const out = layout.solids.map((s) => ({ id: s.id, x1: s.x1, y1: s.y, x2: s.x2, y2: s.y, style: 'invisible' }));
  // The rainbow, as short segments along its arch.
  for (let x = 200; x < 900; x += 35) {
    const x2 = Math.min(900, x + 35);
    out.push({ id: `rg_rainbow_${x}`, x1: x, y1: Math.round(rainbowY(x)), x2, y2: Math.round(rainbowY(x2)), style: 'invisible' });
  }
  for (const p of layout.platforms) {
    if (isLit(p, lit)) out.push({ id: `rg_${p.id}`, x1: p.x1, y1: p.y, x2: p.x2, y2: p.y, style: 'invisible' });
  }
  return out;
}

/**
 * Surfaces a standing avatar can reach from `start` with the ordinary jump
 * (rise <= JUMP_RISE, edge gap <= JUMP_GAP) or by dropping, among the given
 * level surfaces ({ id, x1, x2, y }). Returns the reached ids.
 */
export function reachable(surfaces, startId, rise = JUMP_RISE, gap = JUMP_GAP) {
  const byId = new Map(surfaces.map((s) => [s.id, s]));
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const a = byId.get(queue.shift());
    for (const b of surfaces) {
      if (seen.has(b.id)) continue;
      const dx = Math.max(0, b.x1 - a.x2, a.x1 - b.x2);
      const up = a.y - b.y;
      const ok = up >= 0 ? up <= rise && dx <= gap : dx <= gap + Math.min(200, -up * 0.6) || dx === 0;
      if (ok) {
        seen.add(b.id);
        queue.push(b.id);
      }
    }
  }
  return seen;
}

/** Level surfaces (no rainbow) for one floor under a lighting. */
export function tierSurfaces(layout, tier, lit) {
  const top = { lamps: FLOORS.mixer + SLAB, mixer: FLOORS.totem + SLAB, totem: FLOORS.glare + SLAB, glare: 0 }[tier];
  const bottom = { lamps: FLOORS.lamps, mixer: FLOORS.mixer, totem: FLOORS.totem, glare: FLOORS.glare }[tier];
  const out = layout.solids.filter((s) => s.y <= bottom && s.y > top);
  for (const p of layout.platforms) if (p.tier === tier && isLit(p, lit)) out.push({ id: p.id, x1: p.x1, x2: p.x2, y: p.y });
  return out;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

function coneTexture(PIXI) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.save();
  g.translate(0, 128);
  g.scale(1, 0.38);
  const grad = g.createRadialGradient(10, 0, 6, 120, 0, 470);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.62)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -20);
  g.quadraticCurveTo(260, -330, 512, -300);
  g.lineTo(512, 300);
  g.quadraticCurveTo(260, 330, 0, 20);
  g.closePath();
  g.fill();
  g.restore();
  return PIXI.Texture.from(c);
}

function drawLamp(PIXI, side, x, y) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  const s = side === 'L' ? 1 : -1;
  // Wall bracket.
  g.rect(s > 0 ? 0 : -10, -5, 10, 10).fill(0x1f1d26);
  // The dish, a dark half-cone opening into the room.
  g.moveTo(8 * s, -10);
  g.lineTo(26 * s, -32);
  g.lineTo(30 * s, 32);
  g.lineTo(8 * s, 10);
  g.closePath().fill(0x2b2933).stroke({ width: 2, color: 0x6c6878, alpha: 1 });
  for (let i = -24; i <= 24; i += 8) {
    g.rect(14 * s + (s < 0 ? -2 : 0), i, 2, 4).fill(0x55515f);
  }
  c.addChild(g);
  const lens = new PIXI.Graphics();
  lens.ellipse(30 * s, 0, 6, 30).fill(0xf4f2f8);
  c.addChild(lens);
  c.lens = lens;
  c.x = x;
  c.y = y;
  return c;
}

function drawDisc(PIXI, w, color) {
  const g = new PIXI.Graphics();
  const hx = w / 2;
  g.ellipse(0, 14, hx * 0.92, 8).fill({ color: 0x000000, alpha: 0.18 });
  g.ellipse(0, 6, hx, 11).fill({ color: color, alpha: 0.75 });
  g.ellipse(0, 1, hx, 9).fill(color);
  g.ellipse(-hx * 0.12, -1, hx * 0.7, 4).fill({ color: 0xffffff, alpha: 0.35 });
  // Scalloped underside, the footage's cloud discs.
  for (let i = -2; i <= 2; i++) {
    g.ellipse(i * hx * 0.36, 11, hx * 0.22, 6).fill({ color: color, alpha: 0.55 });
  }
  return g;
}

function drawSlab(g, y) {
  g.rect(0, y, W, SLAB).fill(0x1c1b21);
  g.rect(0, y - 3, W, 5).fill(0x55535e);
  for (let x = 30; x < W; x += 140) g.rect(x, y + 30 + ((x / 140) % 3) * 22, 70, 4);
  g.fill({ color: 0x2a2930, alpha: 0.8 });
}

function drawRainbow(PIXI) {
  const g = new PIXI.Graphics();
  const bands = [0xe8584a, 0xf09a3a, 0xe8d54a, 0x4fc45a, 0x4f6fe0, 0xb45ad6];
  // A soft halo, then the bands under the walking line.
  for (let pass = 0; pass < 2; pass++) {
    bands.forEach((color, i) => {
      g.setStrokeStyle({ width: pass ? 9 : 22, color: color, alpha: pass ? 0.72 : 0.12 });
      for (let x = 200; x <= 900; x += 10) {
        const y = rainbowY(x) + 6 + i * 9;
        if (x === 200) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    });
  }
  return g;
}

function drawDoor(PIXI, x, y) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.moveTo(-34, 0);
  g.lineTo(-34, -78);
  g.arc(0, -78, 34, Math.PI, 0);
  g.lineTo(34, 0);
  g.closePath().fill(0x18171c).stroke({ width: 3, color: 0x6c6878, alpha: 1 });
  for (let i = 0; i < 8; i++) {
    for (let r = 0; r < 2; r++) {
      g.rect(-32 + i * 8, -16 + r * 8, 8, 8).fill((i + r) % 2 ? 0xf2f2f2 : 0x222126);
    }
  }
  g.circle(22, -52, 3).fill(0x8f8b9b);
  c.addChild(g);
  c.x = x;
  c.y = y;
  return c;
}

function drawConsole(PIXI, k) {
  const g = new PIXI.Graphics();
  const y = k.top;
  g.roundRect(k.x1, y, k.x2 - k.x1, FLOORS.mixer - y, 4).fill(0x17161b).stroke({ width: 2, color: 0x4d4a57, alpha: 1 });
  // The rail on top: two posts, a bar, the bank knobs either side of the lamp.
  g.moveTo(k.x1 + 40, y);
  g.lineTo(k.x1 + 40, y - 36);
  g.lineTo(k.x2 - 40, y - 36);
  g.lineTo(k.x2 - 40, y);
  g.stroke({ width: 4, color: 0x8f8b9b, alpha: 1 });
  for (const kx of [k.x1 + 80, k.x2 - 80]) {
    g.circle(kx, y - 36, 10).fill(0x2b2933).stroke({ width: 3, color: 0x8f8b9b, alpha: 1 });
  }
  return g;
}

function drawTotem(PIXI, t) {
  const g = new PIXI.Graphics();
  const slabY = t.top;
  const knobB = t.bankB + 34;
  // The lower bank hangs from the slab; the upper bank sits on a knob at the top of a tall stem.
  for (let i = -1; i <= 1; i++) {
    g.moveTo(t.cx + i * 40, t.bankA - 22);
    g.lineTo(t.cx + i * 40, slabY + 26);
    g.moveTo(t.cx + i * 40, t.bankB);
    g.lineTo(t.cx + i * 40, knobB);
    g.lineTo(t.cx, knobB);
  }
  g.moveTo(t.cx, knobB);
  g.lineTo(t.cx, slabY);
  g.stroke({ width: 4, color: 0x8f8b9b, alpha: 1 });
  g.circle(t.cx, knobB, 10).fill(0x2b2933).stroke({ width: 3, color: 0x8f8b9b, alpha: 1 });
  g.roundRect(t.x1, slabY, t.x2 - t.x1, 26, 4).fill(0x17161b).stroke({ width: 2, color: 0x4d4a57, alpha: 1 });
  return g;
}

/** A panel bulb; `set(lit)` brightens it. */
function makeBulb(PIXI, color) {
  const c = new PIXI.Container();
  const glow = new PIXI.Graphics();
  glow.circle(0, -12, 20).fill({ color: LIGHT[color].glow, alpha: 0.35 });
  const g = new PIXI.Graphics();
  g.ellipse(0, -14, 10, 12).fill(LIGHT[color].hex);
  g.rect(-6, -4, 12, 8).fill(0x8f8b9b);
  g.ellipse(-3, -18, 3, 5).fill({ color: 0xffffff, alpha: 0.5 });
  const hit = new PIXI.Graphics();
  hit.rect(-18, -34, 36, 42).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(hit, glow, g);
  c.set = (on) => {
    glow.visible = on;
    g.alpha = on ? 1 : 0.42;
  };
  c.set(false);
  return c;
}

/** The mixer's own lamp (on the console rail / in the totem slab). */
function makeMixLamp(PIXI) {
  const c = new PIXI.Container();
  const glow = new PIXI.Graphics();
  const g = new PIXI.Graphics();
  c.addChild(glow, g);
  c.set = (color) => {
    glow.clear();
    g.clear();
    const col = color ? LIGHT[color].hex : 0x3a3842;
    if (color) {
      glow.circle(0, 0, 22).fill({ color: LIGHT[color].glow, alpha: 0.35 });
    }
    g.roundRect(-9, -13, 18, 26, 6).fill(col).stroke({ width: 2, color: 0x8f8b9b, alpha: 1 });
  };
  c.set(null);
  return c;
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

function syncPlatforms(ctx) {
  const list = ctx.engine.platforms;
  if (!list) return;
  const keep = list.filter((p) => !String(p.id).startsWith('rg_'));
  list.length = 0;
  list.push(...keep, ...walkable(ctx.data.layout, ctx.data.lit));
}

function lightKey(lit) {
  return ['lamps', 'mixer', 'totem'].map((t) => [...lit[t]].sort().join('+')).join('|');
}

function refreshLight(ctx, now = Date.now()) {
  const lit = litByTier(ctx.data.light, now);
  ctx.data.lit = lit;
  const key = lightKey(lit);
  if (key !== ctx.data.litKey) {
    ctx.data.litKey = key;
    syncPlatforms(ctx);
  }
  return lit;
}

export const room = {
  id: 'radiant_glare',
  title: 'Radiant Glare',
  kicker: 'Hone your skills as you travel toward the radiant glare above',
  icon: 'assets/sprites/icons/play_cube.png',
  theme: 'lab',
  // G315: hub 135 'Puzzles' (inc_data_maps_prod.js 1197), the template's hub.
  hubName: 'Puzzles',
  durationMs: EXIT_DELAY_MS,
  leaveText: 'Leave before you reach the glare? You will have to start over.',
  travelText: 'Find the EXIT, or use Leave.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const layout = radiantLayout();
    ctx.data.layout = layout;
    ctx.data.light = { lampUntil: { yellow: 0, blue: 0, red: 0 }, mixer: { a: null, b: null }, totem: { a: null, b: null } };
    ctx.data.lit = litByTier(ctx.data.light);
    ctx.data.litKey = lightKey(ctx.data.lit);
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#3f3b4d'], [0.55, '#37343f'], [1, '#2e2c35']], 960, 640));
    const world = root.layer(1, 2);
    // Walls: a faint frame either side of the shaft.
    const walls = new PIXI.Graphics();
    walls.rect(0, 0, 8, H);
    walls.rect(W - 8, 0, 8, H);
    walls.fill({ color: 0x2a2832, alpha: 0.9 });
    world.addChild(walls);
    // A soft "radiant glare" from above the top floor.
    const glare = kit.gradient(PIXI, [[0, '#fff6d8'], [0.5, '#6f6880'], [1, '#3f3b4d']], W, 360);
    glare.alpha = 0.55;
    world.addChild(glare);
    // Light cones live under the platforms.
    const cones = new PIXI.Container();
    world.addChild(cones);
    const coneTex = coneTexture(PIXI);
    ctx.data.cones = {};
    for (const lamp of layout.lamps) {
      const spr = new PIXI.Sprite(coneTex);
      spr.anchor.set(0, 0.5);
      spr.blendMode = 'add';
      const len = W - 30;
      spr.scale.set((lamp.side === 'L' ? 1 : -1) * (len / 512), 1.35);
      spr.x = lamp.side === 'L' ? 26 : W - 26;
      spr.y = lamp.y;
      spr.alpha = 0;
      spr.targetAlpha = 0;
      cones.addChild(spr);
      ctx.data.cones[lamp.id] = spr;
    }
    const g = new PIXI.Graphics();
    for (const y of [FLOORS.mixer, FLOORS.totem, FLOORS.glare]) drawSlab(g, y);
    // The bottom floor.
    g.rect(0, FLOORS.lamps, W, H - FLOORS.lamps).fill(0x1c1b21);
    g.rect(0, FLOORS.lamps - 3, W, 5).fill(0x55535e);
    // The stone ledge under the last ladder.
    const ledge = layout.solids.find((s) => s.id === 'rg_ledge');
    g.rect(ledge.x1, ledge.y, ledge.x2 - ledge.x1, 26).fill(0x1c1b21);
    g.rect(ledge.x1, ledge.y - 3, ledge.x2 - ledge.x1, 5).fill(0x55535e);
    // Ladder shafts through the slabs, then the ladders.
    for (const l of layout.ladders) {
      g.rect(l.x - 26, l.yTop, 52, SLAB).fill(0x0f0e12);
    }
    world.addChild(g);
    const lg = new PIXI.Graphics();
    for (const l of layout.ladders) kit.drawLadder(lg, kit.ladder(l.x, l.yTop - 6, l.yBot), { rail: 0xb9b6c2, rung: 0x9c99a6, half: 15 });
    world.addChild(lg);
    world.addChild(drawRainbow(PIXI));
    world.addChild(drawDoor(PIXI, layout.door.x, layout.door.y));
    world.addChild(kit.deco(PIXI, 'sign_exit_starter_01a', layout.door.x, layout.door.y - 120, { scale: 0.62 }));
    world.addChild(drawConsole(PIXI, layout.console));
    world.addChild(drawTotem(PIXI, layout.totem));
    // Platforms (one disc per colour; the two-tone one has both).
    const plats = new PIXI.Container();
    world.addChild(plats);
    ctx.data.discs = [];
    for (const p of layout.platforms) {
      for (const color of p.colors) {
        const d = drawDisc(PIXI, p.x2 - p.x1, LIGHT[color].hex);
        d.x = p.cx;
        d.y = p.y;
        d.alpha = 0;
        d.visible = false;
        plats.addChild(d);
        ctx.data.discs.push({ p, color, d });
      }
    }
    // Lamps on the walls, over their cones.
    ctx.data.lampSprites = {};
    for (const lamp of layout.lamps) {
      const spr = drawLamp(PIXI, lamp.side, lamp.side === 'L' ? 0 : W, lamp.y);
      world.addChild(spr);
      ctx.data.lampSprites[lamp.id] = spr;
    }
    // Mix lamps.
    ctx.data.mixLamps = { mixer: makeMixLamp(PIXI), totem: makeMixLamp(PIXI) };
    ctx.data.mixLamps.mixer.x = layout.console.cx;
    ctx.data.mixLamps.mixer.y = layout.console.top - 36;
    ctx.data.mixLamps.totem.x = layout.totem.cx;
    ctx.data.mixLamps.totem.y = layout.totem.top + 13;
    world.addChild(ctx.data.mixLamps.mixer, ctx.data.mixLamps.totem);
    // Orbs.
    ctx.data.orbSprites = layout.orbs.map((o) => {
      const s = kit.glow(PIXI, o.x, o.y, LIGHT[o.color].glow, 13);
      world.addChild(s);
      return { ...o, s };
    });
    const platforms = walkable(layout, ctx.data.lit);
    const qa = ctx.param?.('rgtier');
    const spawn = qa && FLOORS[qa] ? { x: qa === 'lamps' ? 150 : qa === 'mixer' ? 1040 : qa === 'totem' ? 200 : 1040, y: FLOORS[qa] } : layout.spawn;
    return {
      label: 'Radiant Glare',
      width: W,
      height: H,
      background: root,
      platforms,
      walls: layout.ladders.map((l) => ctx.kit.ladder(l.x, l.yTop, l.yBot)),
      spawn,
    };
  },

  enter(ctx) {
    const layout = ctx.data.layout;
    ctx.data.quoins = spawnQuoins(ctx, layout.quoins);
    ctx.data.bulbs = layout.bulbs.map((b) => {
      const spr = makeBulb(ctx.PIXI, b.color);
      spr.x = b.x;
      spr.y = b.y;
      const target = ctx.register({
        classId: 'radiant_bulb',
        label: `${LIGHT[b.color].label} Bulb`,
        subtitle: b.panel === 'totem' ? 'Clicking works from anywhere' : 'Mix the light',
        sprite: spr,
        rgBulb: b,
      });
      return { ...b, spr, target };
    });
    const doorHit = new ctx.PIXI.Graphics();
    doorHit.rect(-40, -116, 80, 116).fill({ color: 0xffffff, alpha: 0.001 });
    doorHit.x = layout.door.x;
    doorHit.y = layout.door.y;
    ctx.data.door = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: doorHit });
    ctx.data.touches = [];
    ctx.data.presses = [];
    ctx.data.tier = tierAt(ctx.player?.y ?? layout.spawn.y);
    ctx.data.best = ctx.data.tier;
    ctx.data.falls = 0;
    ctx.data.phase = 'play';
    syncPlatforms(ctx);
  },

  tick(ctx) {
    const p = ctx.player;
    const layout = ctx.data.layout;
    if (!p || !layout) return;
    const now = Date.now();
    const lit = refreshLight(ctx, now);
    // Orbs: touching one lights its lamp for LAMP_MS (again refreshes it).
    const t = now / 1000;
    for (const o of ctx.data.orbSprites || []) {
      o.s.y = o.y + Math.sin(t * 2.2 + o.x / 90) * 4;
      if (Math.abs(p.x - o.x) < 30 && p.y - BODY_H < o.y + 16 && p.y + 4 > o.y - 16) touchOrb(ctx, o, now);
    }
    // Cones and lamp lenses follow the light; the first room's lamps flicker as they run out.
    for (const lamp of layout.lamps) {
      const cone = ctx.data.cones[lamp.id];
      let color = null;
      let alpha = 0;
      if (lamp.tier === 'lamps') {
        if (lit.lamps.has(lamp.id)) {
          color = lamp.id;
          const left = ctx.data.light.lampUntil[lamp.id] - now;
          alpha = left < LAMP_WARN_MS ? 0.35 + 0.35 * (Math.sin(now / 55) > 0 ? 1 : 0.2) : 0.7;
        }
      } else {
        color = [...lit[lamp.tier]][0] || null;
        alpha = color ? 0.7 : 0;
      }
      if (color) cone.tint = LIGHT[color].glow;
      cone.alpha += (alpha - cone.alpha) * 0.25;
      const lens = ctx.data.lampSprites[lamp.id]?.lens;
      if (lens) lens.tint = color ? LIGHT[color].glow : 0x77737f;
    }
    for (const { p: plat, color, d } of ctx.data.discs || []) {
      const want = lit[plat.tier]?.has(color) ? 1 : 0;
      d.alpha += (want - d.alpha) * 0.3;
      d.visible = d.alpha > 0.03;
    }
    ctx.data.mixLamps?.mixer.set([...lit.mixer][0] || null);
    ctx.data.mixLamps?.totem.set([...lit.totem][0] || null);
    // Floors: hints on arrival, falls counted.
    const tier = tierAt(p.y);
    if (tier !== ctx.data.tier) {
      const order = ['lamps', 'mixer', 'totem', 'glare'];
      if (order.indexOf(tier) < order.indexOf(ctx.data.tier) && p.vy >= 0) ctx.data.falls += 1;
      ctx.data.tier = tier;
      if (order.indexOf(tier) > order.indexOf(ctx.data.best)) {
        ctx.data.best = tier;
        if (tier === 'totem') ctx.toast(HINT, 6000);
        if (tier === 'glare') ctx.floatText(p.x, p.y - 100, 'The radiant glare!', '#fff2b8');
      }
    }
    takeQuoins(ctx, ctx.data.quoins || []);
  },

  verbs(ctx, target) {
    if (target.rgBulb) {
      const b = target.rgBulb;
      const on = ctx.data.light?.[b.panel]?.[b.bank] === b.color;
      return [{ id: 'press', label: on ? 'Switch off' : 'Press', enabled: true, tooltip: on ? 'Turn this bulb off' : 'Light this bulb', durationMs: 0 }];
    }
    if (target === ctx.data.door) return [{ id: 'enter', label: 'Enter', enabled: true, tooltip: 'Leave through the EXIT', durationMs: 0 }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.rgBulb && verbId === 'press') {
      pressBulb(ctx, target.rgBulb.id);
      return true;
    }
    if (target === ctx.data.door && verbId === 'enter') {
      exit(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const got = (ctx.data.quoins || []).filter((q) => q.taken).length;
    const tier = ctx.data.tier || 'lamps';
    const text = ctx.data.phase === 'done'
      ? 'You made it!'
      : {
        lamps: 'Touch the glowing orbs to switch on the lamps. Light shows the way up.',
        mixer: 'Press the bulbs to mix a colour of light. Find the colour that reaches the ladder.',
        totem: `Mix the light to climb. ${HINT}`,
        glare: 'You reached the radiant glare. Walk through the EXIT.',
      }[tier];
    const floor = { lamps: 1, mixer: 2, totem: 3, glare: 4 }[tier];
    const lit = ctx.data.lit ? [...(ctx.data.lit[tier] || [])].map((c) => LIGHT[c].label).join(' + ') : '';
    const light = tier === 'glare' ? 'radiant' : lit || 'dark';
    return { text, stats: [['floor', `${floor}/4`], ['light', light], ['quoins', `${got}/${(ctx.data.quoins || []).length}`]] };
  },

  publish(ctx) {
    const light = ctx.data.light || {};
    const lit = ctx.data.lit || litByTier(light);
    ctx.setData('rgTier', ctx.data.tier || '');
    ctx.setData('rgBest', ctx.data.best || '');
    ctx.setData('rgLamps', [...lit.lamps].sort().join(','));
    ctx.setData('rgMixer', [...lit.mixer].join(','));
    ctx.setData('rgTotem', [...lit.totem].join(','));
    ctx.setData('rgTouches', (ctx.data.touches || []).join(','));
    ctx.setData('rgPresses', (ctx.data.presses || []).join(','));
    ctx.setData('rgQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('rgFalls', String(ctx.data.falls || 0));
    ctx.setData('rgPhase', ctx.data.phase || '');
  },

  async autoplay(ctx, mode) {
    const layout = ctx.data.layout;
    const plat = (tier, color, i) => layout.platforms.filter((p) => p.tier === tier && p.colors.includes(color))[i];
    const go = async (x, y, ms = 420) => {
      ctx.place(x, y);
      await ctx.wait(ms);
    };
    const on = async (p, dx = 0) => go(p.cx + dx, p.y);
    const press = async (id) => {
      const b = ctx.data.bulbs.find((x) => x.id === id);
      room.runVerb(ctx, b.target, 'press');
      await ctx.wait(450);
    };
    const climb = async (l) => go(l.x, l.yTop, 500);
    await ctx.wait(500);
    // 1. Yellow orb on the floor, blue over the last yellow disc, red over the last blue.
    // Orbs are touched outright: a slow renderer can miss the tick at a placed point.
    const orb = (color) => touchOrb(ctx, layout.orbs.find((o) => o.color === color));
    await go(layout.orbs[0].x, FLOORS.lamps);
    orb('yellow');
    for (let i = 0; i < 3; i++) await on(plat('lamps', 'yellow', i));
    orb('blue');
    for (let i = 0; i < 3; i++) await on(plat('lamps', 'blue', i));
    orb('red');
    for (let i = 0; i < 3; i++) await on(plat('lamps', 'red', i));
    if (mode === 'lamps') return 'lamps';
    await climb(layout.ladders[0]);
    // 2. Yellow + blue = green.
    await go(layout.console.cx + 60, layout.console.top);
    await press('mixer_a_red');
    await press('mixer_a_red');
    await press('mixer_a_yellow');
    await press('mixer_b_blue');
    for (let i = 0; i < 6; i++) await on(plat('mixer', 'green', i));
    if (mode === 'mixer') return 'mixer';
    await climb(layout.ladders[1]);
    // 3. Blue to the two-tone disc, then add red for purple.
    await go(layout.totem.cx, layout.totem.top);
    await press('totem_a_blue');
    for (let i = 0; i < 4; i++) await on(plat('totem', 'blue', i));
    await press('totem_b_red');
    if (mode === 'totem') return 'totem';
    for (let i = 1; i < 3; i++) await on(plat('totem', 'purple', i));
    await go(1000, 670);
    await climb(layout.ladders[2]);
    // 4. Over the rainbow, then the EXIT.
    for (const q of layout.quoins.slice(-3)) await go(q.x, rainbowY(q.x), 350);
    await go(layout.door.x + 10, FLOORS.glare);
    if (mode === 'top') return 'top';
    room.runVerb(ctx, ctx.data.door, 'enter');
    return 'exited';
  },
};

/** An orb touched: its lamp burns for LAMP_MS (a touch while lit tops it up). */
function touchOrb(ctx, o, now = Date.now()) {
  const until = ctx.data.light.lampUntil[o.color];
  if (until - now >= LAMP_MS - 600) return;
  ctx.data.light.lampUntil[o.color] = now + LAMP_MS;
  ctx.data.touches.push(o.color);
  ctx.sound('GLOWING_ORB_COLLIDE', { volume: 0.5 });
  if (until <= now) ctx.floatText(o.x, o.y - 40, `${LIGHT[o.color].label} light!`, LIGHT[o.color].css);
  refreshLight(ctx, now);
}

function pressBulb(ctx, id) {
  const b = ctx.data.layout.bulbs.find((x) => x.id === id);
  if (!b) return;
  const panel = ctx.data.light[b.panel];
  panel[b.bank] = panel[b.bank] === b.color ? null : b.color;
  ctx.data.presses.push(id);
  for (const bulb of ctx.data.bulbs || []) {
    if (bulb.panel === b.panel) bulb.spr.set(ctx.data.light[bulb.panel][bulb.bank] === bulb.color);
  }
  const mix = mixColor(panel.a, panel.b);
  ctx.sound('SWITCH_PRESS_BLOOIAN', { volume: 0.45 });
  ctx.floatText(b.x, b.y - 50, mix ? `${LIGHT[mix].label} light` : 'Dark', mix ? LIGHT[mix].css : '#c8c4d2');
  refreshLight(ctx);
}

async function exit(ctx) {
  if (ctx.data.phase === 'done') return;
  const door = ctx.data.layout.door;
  if (!ctx.near(door.x, door.y, 120)) {
    ctx.toast('Walk up to the EXIT first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.progress('solved_puzzle');
  ctx.solve();
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(400);
  ctx.leave({ transition: ctx.fx() });
}

export const RADIANT_FACTS = Object.freeze({ W, H, FLOORS, SLAB, LAMP_MS, JUMP_RISE, JUMP_GAP, BODY_H });
