/**
 * Walk Toward the Light (quests/puzzle_level_light_perspective.js + _rem).
 *
 * Source: onStarted makes a private copy of LIFV3KVHV583MC6 (the reminisce
 * copy LIFS98777QB3P4B, both "Walk Toward The Light" in hub 135) with a
 * 5 * 60 second exit delay at (-3445, -159); leaving before the end fails the
 * quest. The goal is the `solved_puzzle` flag (the reminisce adds `leave`).
 * Rewards: 1500 currants, 200 mood, 150 Cosma favor (reminisce 350 / 200 /
 * 50, offered by the Play Cube an hour after the first run). Focusing orbs,
 * Spinach, Rainbow Juice and Alphabet Sauce refuse inside it: "I'd say, doing
 * that would give you an unfair advantage."
 *
 * Neither template is in the locations dump, so the level is rebuilt from a
 * full run recorded by its designer (reference video Et0RkY43A5Q): a dark
 * room where hanging bulbs, ceiling spotlights and mixing lamps reveal cloud
 * platforms of their own colour. Each lesson is the designer's own sign text:
 *  1. "What would the world be without light?" / "Light up your path to find
 *     the way." Touch the yellow orb, the yellow bulb shows a yellow cloud.
 *  2. "But remember, not all lights stay on forever." The bulb goes out.
 *  3. "Sometimes you encounter a wall, but it is only a wall if you see it as
 *     one." A red spotlight paints a striped red wall; the red orb puts it
 *     out for a while, the blue orb shows the blue cloud behind it. A second
 *     red wall stands on the step beyond.
 *  4. "Other times, you need to fall" ... "to find something you couldn't see
 *     before": yellow and blue orbs show two clouds too far apart; the red
 *     orb that lights the middle one waits on the floor below (it stays on).
 *  5. "In some cases, you'll need to mix colors to reveal the correct path."
 *     A red/yellow switch on the ledge and a blue one reached only from the
 *     yellow clouds feed one double-bulb lamp: red + blue makes purple, the
 *     way across (yellow + blue makes green, the way back up).
 *  6. Two stacked red/yellow/blue switches: red with yellow makes orange.
 *  7. Always-on yellow and blue spotlights, two more red walls and a blue
 *     orb, then "Astounding! You truly are a Champ!", three quoins and the
 *     EXIT door on the floor below.
 * Falls land on the dark floor; each section has a ladder back to its start
 * (slab pillars keep you from walking past a section underneath). Timings
 * are read off the footage (bulbs ~6-10 s); the floor's red light stays on.
 *
 * Art: the CC0 hanging_lightbulb (bulbs), door_asset_gray (tinted) and
 * firebog_sign_blank_plank (the EXIT plank); lamp shades, dish platforms,
 * light cones, striped poles, switch panels and rock slabs are vectors.
 *
 * Look (G78): five players' Snaps (research/wayback/raw/snaps/
 * puzzle_level_light_perspective and _rem, reference only) show ceiling lamp
 * shades (grey domes, dotted crowns) throwing soft cones, bare bulbs on long
 * wires from the ceiling, platforms that are shallow wooden dishes tinted by
 * the light they stand in, tall red-and-pink striped poles and a dark plank
 * EXIT sign; the sign texts already matched.
 */

import { BODY_H, JUMP_GAP, JUMP_RISE, pushOutOfSolids, spawnQuoins, takeQuoins } from './puzzle-kit.js?v=cu-1';

const W = 7600;
const H = 1100;
export const LOW = 1000;
const FALL_Y = H - 30;

// source: questInstanceLocation(..., 5*60, ...)
export const DURATION_MS = 5 * 60 * 1000;
// Footage: the first yellow bulb is out ~6 s after the touch, the wall's blue
// bulb and the red wall's dark spell last a little longer, the "fall" yellow
// and blue pair ~10 s; the floor's red bulb never goes out.
export const ORB_MS = Object.freeze({ short: 6000, wall: 8000, pair: 10000 });
const FLICKER_MS = 1500;

export const LIGHT_COLORS = Object.freeze({
  red: { hex: 0xff5b4d, dim: 0xc8463c, css: '#ff6b5d', label: 'Red' },
  yellow: { hex: 0xf3d33c, dim: 0xc2a62a, css: '#f3d33c', label: 'Yellow' },
  blue: { hex: 0x4d6bff, dim: 0x3b52c4, css: '#7d93ff', label: 'Blue' },
  orange: { hex: 0xf59a2c, dim: 0xc27621, css: '#f5a24a', label: 'Orange' },
  green: { hex: 0x3fbf5a, dim: 0x2f9446, css: '#5fd27a', label: 'Green' },
  purple: { hex: 0xb34fd8, dim: 0x8a3ca8, css: '#c77ae6', label: 'Purple' },
});

/** The colour two lamp feeds make (one pick per switch panel). */
export function mixColor(picks) {
  const set = new Set((picks || []).filter(Boolean));
  if (!set.size) return null;
  if (set.size === 1) return [...set][0];
  const has = (a, b) => set.size === 2 && set.has(a) && set.has(b);
  if (has('red', 'yellow')) return 'orange';
  if (has('yellow', 'blue')) return 'green';
  if (has('red', 'blue')) return 'purple';
  return null;
}

/* ------------------------------------------------------------------ */
/* Layout                                                               */
/* ------------------------------------------------------------------ */

/**
 * The whole level in world pixels (y down; a surface y is where feet stand).
 * slabs: rock ledges, `pillar` blocks the floor beneath their left end.
 * lights: bulb / dish (fixed colour, `base` on or off) and double (a mixing
 * lamp fed by `panels`). clouds show (and hold you) while their light shines
 * their colour; walls stand while their light is on.
 */
export function lightLayout() {
  const slabs = [
    { id: 'a', x1: 0, x2: 560, y: 800 },
    { id: 'b', x1: 860, x2: 1500, y: 760, pillar: true },
    { id: 'c1', x1: 1880, x2: 2150, y: 760, pillar: true },
    { id: 'c2', x1: 2150, x2: 2500, y: 700, step: 760 }, // step: its riser is solid
    { id: 'd', x1: 3320, x2: 3820, y: 700, pillar: true },
    { id: 'e', x1: 4620, x2: 5200, y: 700, pillar: true },
    { id: 'e2', x1: 4820, x2: 5200, y: 590, thin: true },
    { id: 'f', x1: 5930, x2: 6080, y: 700, pillar: true },
    { id: 'g', x1: 6840, x2: 7200, y: 700, pillar: true },
  ];
  const ladders = [
    { id: 'a', x: 500, top: 800 },
    { id: 'b', x: 1440, top: 760 },
    { id: 'c', x: 2440, top: 700 },
    { id: 'd', x: 3770, top: 700 },
    { id: 'e', x: 5160, top: 700 },
    { id: 'e2', x: 4860, top: 590, bottom: 700 },
    { id: 'f', x: 6060, top: 700 },
  ];
  const lights = [
    { id: 'l1', kind: 'bulb', color: 'yellow', base: 'off', x: 700, y: 470, cone: [300, 360] },
    { id: 'l2', kind: 'bulb', color: 'blue', base: 'off', x: 1700, y: 440, cone: [300, 370] },
    { id: 'w1', kind: 'dish', color: 'red', base: 'on', x: 1565, y: 480, cone: [120, 390] },
    { id: 'w2', kind: 'dish', color: 'red', base: 'on', x: 2300, y: 440, cone: [120, 270] },
    { id: 'l4y', kind: 'bulb', color: 'yellow', base: 'off', x: 2660, y: 400, cone: [260, 350] },
    { id: 'l4r', kind: 'bulb', color: 'red', base: 'off', x: 2910, y: 400, cone: [260, 350] },
    { id: 'l4b', kind: 'bulb', color: 'blue', base: 'off', x: 3160, y: 400, cone: [260, 350] },
    { id: 'm1', kind: 'double', panels: ['pa', 'pb'], x: 4200, y: 390, cone: [720, 520] },
    { id: 'm2', kind: 'double', panels: ['pc', 'pd'], x: 5570, y: 330, cone: [700, 560] },
    { id: 'd1', kind: 'dish', color: 'yellow', base: 'on', x: 6210, y: 420, cone: [220, 330] },
    { id: 'w3', kind: 'dish', color: 'red', base: 'on', x: 6305, y: 430, cone: [120, 420] },
    { id: 'd2', kind: 'dish', color: 'blue', base: 'on', x: 6430, y: 420, cone: [220, 350] },
    { id: 'd3', kind: 'dish', color: 'blue', base: 'off', x: 6640, y: 420, cone: [220, 350] },
    { id: 'w4', kind: 'dish', color: 'red', base: 'on', x: 6765, y: 430, cone: [120, 420] },
  ];
  const cloud = (id, light, color, x1, x2, y) => ({ id, light, color, x1, x2, y });
  const clouds = [
    cloud('y1', 'l1', 'yellow', 640, 760, 790),
    cloud('b2', 'l2', 'blue', 1620, 1780, 770),
    cloud('c4y', 'l4y', 'yellow', 2600, 2720, 690),
    cloud('c4r', 'l4r', 'red', 2850, 2970, 690),
    cloud('c4b', 'l4b', 'blue', 3100, 3220, 690),
    // Mixing lamp 1: yellow down to the blue switch, green back up, purple across.
    cloud('m1y1', 'm1', 'yellow', 3900, 4060, 740),
    cloud('m1y2', 'm1', 'yellow', 4130, 4230, 810),
    cloud('m1g1', 'm1', 'green', 4130, 4230, 810),
    cloud('m1g2', 'm1', 'green', 3960, 4060, 760),
    cloud('m1g3', 'm1', 'green', 4310, 4410, 740),
    cloud('m1p1', 'm1', 'purple', 3920, 4040, 690),
    cloud('m1p2', 'm1', 'purple', 4160, 4280, 690),
    cloud('m1p3', 'm1', 'purple', 4400, 4520, 690),
    cloud('m1r1', 'm1', 'red', 3940, 4060, 610),
    // Mixing lamp 2: only orange reaches the far ledge.
    cloud('m2o1', 'm2', 'orange', 5290, 5420, 680),
    cloud('m2o2', 'm2', 'orange', 5510, 5640, 650),
    cloud('m2o3', 'm2', 'orange', 5730, 5870, 680),
    cloud('m2r1', 'm2', 'red', 5300, 5410, 610),
    cloud('m2y1', 'm2', 'yellow', 5300, 5410, 760),
    cloud('m2y2', 'm2', 'yellow', 5520, 5620, 820),
    cloud('m2b1', 'm2', 'blue', 5310, 5420, 700),
    cloud('m2b2', 'm2', 'blue', 5530, 5640, 760),
    cloud('m2g1', 'm2', 'green', 5300, 5410, 640),
    cloud('m2g2', 'm2', 'green', 5500, 5600, 580),
    cloud('m2p1', 'm2', 'purple', 5300, 5420, 690),
    cloud('m2p2', 'm2', 'purple', 5530, 5640, 690),
    // The spotlight run.
    cloud('f1', 'd1', 'yellow', 6150, 6270, 700),
    cloud('f2', 'd2', 'blue', 6370, 6490, 720),
    cloud('f3', 'd3', 'blue', 6580, 6700, 720),
  ];
  const walls = [
    { id: 'w1', light: 'w1', x1: 1545, x2: 1585, yTop: 500, yBot: 860 },
    { id: 'w2', light: 'w2', x1: 2280, x2: 2320, yTop: 460, yBot: 700 },
    { id: 'w3', light: 'w3', x1: 6285, x2: 6325, yTop: 450, yBot: 840 },
    { id: 'w4', light: 'w4', x1: 6745, x2: 6785, yTop: 450, yBot: 840 },
  ];
  const orb = (id, color, x, y, light, ms) => ({ id, color, x, y, light, ms });
  const orbs = [
    orb('o1', 'yellow', 470, 700, 'l1', ORB_MS.short),
    orb('o2', 'blue', 1360, 660, 'l2', ORB_MS.wall),
    orb('o3', 'red', 1420, 660, 'w1', ORB_MS.wall),
    orb('o4', 'red', 2210, 600, 'w2', ORB_MS.short),
    orb('o5', 'yellow', 2370, 600, 'l4y', ORB_MS.pair),
    orb('o6', 'blue', 2430, 600, 'l4b', ORB_MS.pair),
    orb('o7', 'red', 2900, LOW - 50, 'l4r', null),
    orb('o8', 'red', 6220, 600, 'w3', ORB_MS.wall),
    orb('o9', 'blue', 6450, 620, 'd3', ORB_MS.wall),
    orb('o10', 'red', 6660, 620, 'w4', ORB_MS.wall),
  ];
  // Switch panels: a pick lights one of their bulbs (or none).
  const panels = [
    { id: 'pa', colors: ['red', 'yellow'], x: 3740, surface: 700, bulbY: 615 },
    { id: 'pb', colors: ['blue'], x: 4265, surface: 810, bulbY: 735, hanging: true },
    { id: 'pc', colors: ['red', 'yellow', 'blue'], x: 5090, surface: 700, bulbY: 650 },
    { id: 'pd', colors: ['red', 'yellow', 'blue'], x: 5090, surface: 590, bulbY: 520 },
  ];
  // G318: the designer's sign texts, read off footage Et0RkY43A5Q and matched in five players'
  // Snaps (reference only). No GSJS or client text: neither template is in the locations dump.
  // Longer than the sign-words rule allows: Austin 2026-10-28: one-off approval (footage Et0RkY43A5Q).
  const signs = [
    { text: 'What would the world be without light?', x: 240, y: 680 },
    { text: 'Light up your path to find the way.', x: 680, y: 665 },
    { text: 'But remember, not all lights stay on forever.', x: 1010, y: 640 },
    { text: 'Sometimes you encounter a wall, but it is only a wall if you see it as one.', x: 1250, y: 580 },
    { text: 'Other times, you need to fall', x: 2560, y: 560, dots: true },
    { text: 'to find something you couldn’t see before', x: 2740, y: 880 },
    { text: 'In some cases, you’ll need to mix colors to reveal the correct path.', x: 3520, y: 570 },
    { text: 'Astounding! You truly are a Champ!', x: 7020, y: 560, big: true }, // the end sign, footage Et0RkY43A5Q
  ];
  const q = (x, y, type = 'xp') => ({ x, y, type });
  const quoins = [
    q(700, 735), q(1100, 700, 'currants'), q(1700, 715), q(2420, 650, 'mood'), q(2910, 635),
    q(4000, 555, 'currants'), q(4360, 685, 'energy'), q(4220, 635), q(5355, 585, 'mood'),
    q(5575, 595), q(6430, 665, 'currants'),
    q(6960, 640), q(7020, 625), q(7080, 640),
  ];
  return {
    slabs, ladders, lights, clouds, walls, orbs, panels, signs, quoins,
    door: { x: 7450, y: LOW },
    spawn: { x: 150, y: 800 },
    // Ladder tops a player climbs back to after a fall, by floor section.
    checkpoints: [{ x: 150, y: 800 }, { x: 1000, y: 760 }, { x: 2380, y: 700 }, { x: 3600, y: 700 }, { x: 4700, y: 700 }, { x: 6000, y: 700 }],
  };
}

/* ------------------------------------------------------------------ */
/* Light state (pure)                                                    */
/* ------------------------------------------------------------------ */

/** { timers: lightId -> until (ms, Infinity = for good), picks: panelId -> colour|null } */
export function initialLightState(layout = lightLayout()) {
  const picks = {};
  for (const p of layout.panels) picks[p.id] = null;
  return { timers: {}, picks };
}

const lightById = (layout, id) => layout.lights.find((l) => l.id === id) || null;

/** Is a fixed light's orb effect running? */
function timerLive(state, id, now) {
  const until = state.timers[id];
  return until != null && until > now;
}

/** The colour a light shines now (null when dark). */
export function lightColor(layout, state, id, now = 0) {
  const l = lightById(layout, id);
  if (!l) return null;
  if (l.kind === 'double') return mixColor(l.panels.map((p) => state.picks[p]));
  const flipped = timerLive(state, id, now);
  const on = l.base === 'on' ? !flipped : flipped;
  return on ? l.color : null;
}

/** Touch an orb: its light flips from its base state for `ms` (null: for good). */
export function touchOrb(layout, state, orbId, now = 0) {
  const orb = layout.orbs.find((o) => o.id === orbId);
  if (!orb) return false;
  const until = orb.ms == null ? Infinity : now + orb.ms;
  const before = state.timers[orb.light];
  state.timers[orb.light] = Math.max(before ?? 0, until);
  return before == null || before <= now;
}

/** Press a panel bulb: light it (the others on that panel go out) or put it out. */
export function pressBulb(layout, state, panelId, color) {
  const panel = layout.panels.find((p) => p.id === panelId);
  if (!panel || !panel.colors.includes(color)) return false;
  state.picks[panelId] = state.picks[panelId] === color ? null : color;
  return true;
}

/** Drop finished timers; returns true when any light changed. */
export function expireLights(state, now) {
  let changed = false;
  for (const [id, until] of Object.entries(state.timers)) {
    if (until <= now) {
      delete state.timers[id];
      changed = true;
    }
  }
  return changed;
}

/** ms left on a timed light (0 when none, Infinity for good). */
export function lightRemaining(state, id, now) {
  const until = state.timers[id];
  return until == null ? 0 : Math.max(0, until - now);
}

export function litClouds(layout, state, now = 0) {
  return layout.clouds.filter((c) => lightColor(layout, state, c.light, now) === c.color);
}

export function standingWalls(layout, state, now = 0) {
  return layout.walls.filter((w) => lightColor(layout, state, w.light, now) != null);
}

/** Solid rectangles: slab pillars, the step and every lit wall. */
export function solidRects(layout, state, now = 0) {
  const out = [];
  for (const s of layout.slabs) {
    if (s.pillar) out.push({ id: `pillar_${s.id}`, x1: s.x1, x2: s.x1 + 60, yTop: s.y, yBot: LOW });
    if (s.step) out.push({ id: `step_${s.id}`, x1: s.x1, x2: s.x1 + 40, yTop: s.y, yBot: s.step });
  }
  for (const w of standingWalls(layout, state, now)) out.push({ id: `wall_${w.id}`, x1: w.x1, x2: w.x2, yTop: w.yTop, yBot: w.yBot });
  return out;
}

/** Walkable lines for the engine. */
export function surfaces(layout, state, now = 0) {
  const out = [{ id: 'lp_low', x1: 0, y1: LOW, x2: W, y2: LOW, style: 'invisible' }];
  for (const s of layout.slabs) out.push({ id: `lp_slab_${s.id}`, x1: s.x1, y1: s.y, x2: s.x2, y2: s.y, style: 'invisible' });
  for (const c of litClouds(layout, state, now)) out.push({ id: `lp_cloud_${c.id}`, x1: c.x1, y1: c.y, x2: c.x2, y2: c.y, style: 'invisible' });
  return out;
}

/** Can a player standing at feet (px, py) reach a panel bulb? */
export function bulbInReach(panel, px, py, bulbX = panel.x) {
  const up = py - panel.bulbY;
  return Math.abs(px - bulbX) <= 80 && up >= 30 && up <= 140;
}

/** Bulb x positions on a panel (centred on panel.x, 40 px apart). */
export function bulbXs(panel) {
  const n = panel.colors.length;
  return panel.colors.map((_, i) => panel.x + (i - (n - 1) / 2) * 40);
}

/**
 * The intended run, for tests and autoplay: actions (orb / bulb) and hops to
 * surfaces ({ to: slab or cloud id, x }). Hops are checked against the
 * surfaces lit at that moment.
 */
export const SOLUTION = Object.freeze([
  { orb: 'o1' }, { to: 'y1', x: 700 }, { to: 'b', x: 1000 },
  { orb: 'o2' }, { orb: 'o3' }, { to: 'b2', x: 1700 }, { to: 'c1', x: 2000 }, { to: 'c2', x: 2200 },
  { orb: 'o4' }, { orb: 'o5' }, { orb: 'o6' },
  { fall: true, x: 2900 }, { orb: 'o7' }, { ladder: 'c' },
  { orb: 'o5' }, { orb: 'o6' }, { to: 'c4y', x: 2660 }, { to: 'c4r', x: 2910 }, { to: 'c4b', x: 3160 }, { to: 'd', x: 3500 },
  { bulb: ['pa', 'yellow'] }, { to: 'm1y1', x: 3970 }, { to: 'm1y2', x: 4180 }, { bulb: ['pb', 'blue'] },
  { to: 'm1g2', x: 4010 }, { to: 'd', x: 3740 }, { bulb: ['pa', 'red'] },
  { to: 'm1p1', x: 3980 }, { to: 'm1p2', x: 4220 }, { to: 'm1p3', x: 4460 }, { to: 'e', x: 4900 },
  { bulb: ['pc', 'red'] }, { ladder: 'e2' }, { bulb: ['pd', 'yellow'] },
  { to: 'e', x: 5150 }, { to: 'm2o1', x: 5355 }, { to: 'm2o2', x: 5575 }, { to: 'm2o3', x: 5790 }, { to: 'f', x: 6000 },
  { to: 'f1', x: 6200 }, { orb: 'o8' }, { to: 'f2', x: 6430 }, { orb: 'o9' }, { to: 'f3', x: 6620 }, { orb: 'o10' }, { to: 'g', x: 7000 },
]);

/** Horizontal gap between two spans (0 when they overlap). */
export function spanGap(a, b) {
  if (a.x2 < b.x1) return b.x1 - a.x2;
  if (b.x2 < a.x1) return a.x1 - b.x2;
  return 0;
}

export const LIGHT_ROOM_FACTS = Object.freeze({ W, H, LOW, JUMP_RISE, JUMP_GAP, BODY_H });

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

let coneTexture = null;
function coneTex(PIXI) {
  if (coneTexture && !coneTexture.source?.destroyed) return coneTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.filter = 'blur(14px)';
  const grad = g.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(128, 300, 100, 290, 0, Math.PI, 0);
  g.lineTo(228, 302);
  g.lineTo(28, 302);
  g.closePath();
  g.fill();
  coneTexture = PIXI.Texture.from(c);
  return coneTexture;
}

function drawSlab(g, s) {
  const depth = s.thin ? 26 : 42;
  g.rect(s.x1, s.y, s.x2 - s.x1, depth).fill(0x1f1e24);
  g.rect(s.x1, s.y, s.x2 - s.x1, depth - 8).fill(0x2c2b33);
  // Rough top edge and a few chips.
  g.moveTo(s.x1, s.y + 1);
  g.lineTo(s.x2, s.y + 1);
  g.stroke({ width: 3, color: 0x56545e, alpha: 1 });
  for (let x = s.x1 + 30; x < s.x2 - 20; x += 70) {
    g.rect(x, s.y + 12 + ((x / 70) % 2) * 8, 26, 4).fill(0x24232a);
  }
  if (s.pillar) {
    g.rect(s.x1, s.y + depth - 2, 60, LOW - s.y - depth + 2).fill(0x232229);
    g.moveTo(s.x1 + 58, s.y + depth);
    g.lineTo(s.x1 + 58, LOW);
    g.stroke({ width: 2, color: 0x34333b, alpha: 1 });
  }
  if (s.step) {
    g.rect(s.x1, s.y, s.x2 - s.x1, s.step - s.y + depth - 8).fill(0x2c2b33);
  }
}

/** Mix two 0xrrggbb colours (t of b). */
function mixHex(a, b, t) {
  const m = (sh) => Math.round(((a >> sh) & 0xff) * (1 - t) + ((b >> sh) & 0xff) * t) << sh;
  return m(16) | m(8) | m(0);
}

/** A shallow wooden dish platform, tinted by the light it appears in (the Snaps). */
function drawCloud(PIXI, c) {
  const col = LIGHT_COLORS[c.color];
  const w = c.x2 - c.x1;
  const wood = 0xa86a34;
  const top = mixHex(wood, col.hex, 0.55);
  const rim = mixHex(top, 0xffffff, 0.3);
  const under = mixHex(wood, col.dim, 0.35);
  const g = new PIXI.Graphics();
  // Soft glow under the dish.
  g.ellipse(0, 10, w / 2 + 18, 22).fill({ color: col.hex, alpha: 0.18 });
  // The bowl underneath, then the flat top and its rim.
  g.moveTo(-w / 2, 2);
  g.bezierCurveTo(-w * 0.42, 15, -w * 0.18, 19, 0, 19);
  g.bezierCurveTo(w * 0.18, 19, w * 0.42, 15, w / 2, 2);
  g.closePath();
  g.fill(under);
  g.moveTo(-w * 0.3, 12);
  g.quadraticCurveTo(0, 16, w * 0.3, 12);
  g.stroke({ width: 2, color: mixHex(under, 0x000000, 0.25), alpha: 0.7 });
  g.ellipse(0, 2, w / 2, 7).fill(rim);
  g.ellipse(0, 3, w / 2 - 5, 4.5).fill(top);
  g.x = (c.x1 + c.x2) / 2;
  g.y = c.y;
  return g;
}

function drawWall(PIXI, w) {
  const g = new PIXI.Graphics();
  const h = w.yBot - w.yTop;
  const width = w.x2 - w.x1;
  g.roundRect(-width, 0, width * 2, h, width).fill({ color: LIGHT_COLORS.red.hex, alpha: 0.16 });
  drawPole(g, width - 6, h);
  g.x = (w.x1 + w.x2) / 2;
  g.y = w.yTop;
  return g;
}

/** A ceiling lamp shade on its wire (the Snaps' grey domes with a dotted crown). */
function drawShade(PIXI, x, y, color) {
  const g = new PIXI.Graphics();
  g.moveTo(0, -y);
  g.lineTo(0, -22);
  g.stroke({ width: 2, color: 0x111114, alpha: 1 });
  // The lit bulb under the rim.
  g.ellipse(0, -2, 14, 6).fill({ color: LIGHT_COLORS[color]?.hex ?? 0xfff2c8, alpha: 0.9 });
  g.ellipse(0, -2, 7, 3).fill({ color: 0xffffff, alpha: 0.9 });
  // Dome, rim and crown.
  g.moveTo(-34, -4);
  g.bezierCurveTo(-30, -20, -14, -26, 0, -26);
  g.bezierCurveTo(14, -26, 30, -20, 34, -4);
  g.closePath();
  g.fill(0x8e8c90);
  g.ellipse(0, -4, 34, 5).fill(0xb9b7bb);
  g.ellipse(0, -25, 9, 4).fill(0x6c6a6e);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 8);
    g.circle(-Math.cos(a) * 22, -18 - Math.sin(a) * 4, 1.8).fill(0x4a484c);
  }
  g.x = x;
  g.y = y;
  return g;
}

/** A tall striped pole (the Snaps' red-and-pink columns), centred on (0, 0) at its top. */
function drawPole(g, width, h) {
  const band = 34;
  for (let y = 0, i = 0; y < h; y += band, i++) {
    const bh = Math.min(band, h - y);
    g.rect(-width / 2, y, width, bh).fill(i % 2 ? 0xf3a3a0 : 0xdc4f4c);
  }
  // Round shading: darker flanks, a soft highlight left of centre.
  g.rect(-width / 2, 0, width * 0.18, h).fill({ color: 0x5a1010, alpha: 0.22 });
  g.rect(width / 2 - width * 0.18, 0, width * 0.18, h).fill({ color: 0x5a1010, alpha: 0.3 });
  g.rect(-width * 0.22, 0, width * 0.12, h).fill({ color: 0xffffff, alpha: 0.18 });
  g.ellipse(0, 0, width / 2, 4).fill(0xf6b8b4);
}

function drawSign(PIXI, kit, s) {
  const c = new PIXI.Container();
  const t = kit.label(PIXI, s.text, s.x, s.y, {
    size: s.big ? 17 : 14,
    fill: 0xf4f1ea,
    stroke: { color: 0x1d1b22, width: 3 },
    weight: '800',
    wrap: s.big ? 200 : 210,
  });
  c.addChild(t);
  if (s.dots) {
    const d = new PIXI.Graphics();
    for (let i = 0; i < 3; i++) {
      d.circle(s.x, s.y + 40 + i * 30, 2.5).fill({ color: 0xf4f1ea, alpha: 0.8 });
    }
    c.addChild(d);
  }
  return c;
}

/** A panel bulb: caged lamp, dim until picked. */
function bulbSprite(PIXI, color) {
  const c = new PIXI.Container();
  const col = LIGHT_COLORS[color];
  const glow = new PIXI.Graphics();
  glow.circle(0, -14, 22).fill({ color: col.hex, alpha: 0.35 });
  glow.blendMode = 'add';
  c.addChild(glow);
  const g = new PIXI.Graphics();
  g.roundRect(-7, -4, 14, 6, 2).fill(0x6b6b72);
  g.roundRect(-9, -26, 18, 23, 8).fill(col.hex);
  g.moveTo(-9, -18); g.lineTo(9, -18);
  g.moveTo(-9, -11); g.lineTo(9, -11);
  g.moveTo(0, -26); g.lineTo(0, -4);
  g.stroke({ width: 1.5, color: 0x2a2a30, alpha: 0.8 });
  c.addChild(g);
  // Generous invisible hit area for clicks.
  const hit = new PIXI.Graphics();
  hit.rect(-18, -36, 36, 40).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(hit);
  c.glow = glow;
  c.body = g;
  return c;
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

function syncPlatforms(ctx) {
  const list = ctx.engine.platforms;
  if (!list) return;
  const keep = list.filter((p) => !String(p.id).startsWith('lp_'));
  list.length = 0;
  list.push(...keep, ...surfaces(ctx.data.layout, ctx.data.state, Date.now()));
}

function setAlpha(obj, want, rate = 0.2) {
  if (!obj || obj.destroyed) return;
  obj.alpha += (want - obj.alpha) * rate;
  obj.visible = obj.alpha > 0.02;
}

export const room = {
  id: 'light_perspective',
  title: 'Walk Toward the Light',
  kicker: 'Light up your path to find the way',
  icon: 'assets/sprites/icons/bulb.png',
  theme: 'dark',
  // G315: hub 135 'Puzzles' (inc_data_maps_prod.js 1197), the template's hub.
  hubName: 'Puzzles',
  durationMs: DURATION_MS,
  leaveText: 'Leave before you find the exit? You will have to start over.',
  travelText: 'Find the exit, or use Leave.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const layout = lightLayout();
    ctx.data.layout = layout;
    ctx.data.state = initialLightState(layout);
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#221f29'], [0.45, '#35303d'], [1, '#4a4452']], 960, 640));
    const world = root.layer(1, 3);
    // Light cones first so everything else sits in them.
    const cones = new PIXI.Container();
    world.addChild(cones);
    ctx.data.cones = {};
    for (const l of layout.lights) {
      const spr = new PIXI.Sprite(coneTex(PIXI));
      spr.anchor.set(0.5, 0);
      spr.x = l.x;
      spr.y = l.y - (l.kind === 'dish' ? 4 : 0);
      spr.width = l.cone[0];
      spr.height = l.cone[1];
      spr.blendMode = 'add';
      spr.alpha = 0;
      spr.visible = false;
      cones.addChild(spr);
      ctx.data.cones[l.id] = spr;
    }
    const g = new PIXI.Graphics();
    // The dark floor everything falls to.
    g.rect(0, LOW, W, H - LOW).fill(0x1c1b21);
    g.moveTo(0, LOW + 1);
    g.lineTo(W, LOW + 1);
    g.stroke({ width: 3, color: 0x47454f, alpha: 1 });
    for (const s of layout.slabs) drawSlab(g, s);
    for (const l of layout.ladders) kit.drawLadder(g, kit.ladder(l.x, l.top - 2, l.bottom ?? LOW), { rail: 0x3c3b44, rung: 0x55535e, half: 14 });
    world.addChild(g);
    // Panel pipes (behind the bulbs, which are registered targets).
    const pipes = new PIXI.Graphics();
    for (const p of layout.panels) {
      const xs = bulbXs(p);
      const knobY = p.bulbY + 34;
      for (const bx of xs) {
        pipes.moveTo(bx, p.bulbY + 2);
        pipes.lineTo(bx, p.bulbY + 14);
      }
      pipes.moveTo(xs[0], p.bulbY + 14);
      pipes.lineTo(xs[xs.length - 1], p.bulbY + 14);
      pipes.moveTo(p.x, p.bulbY + 14);
      pipes.lineTo(p.x, knobY);
      // Wire off towards the lamp.
      pipes.stroke({ width: 3, color: 0x8e8d96, alpha: 0.9 });
      const lamp = layout.lights.find((l) => l.panels?.includes(p.id));
      pipes.moveTo(p.x, knobY);
      pipes.lineTo(p.x + 70, knobY);
      pipes.lineTo(p.x + 70, p.hanging ? LOW : p.surface + 60);
      if (lamp && !p.hanging) pipes.lineTo(Math.min(lamp.x - 120, p.x + 260), p.surface + 60);
      pipes.stroke({ width: 2, color: 0x8e8d96, alpha: 0.6 });
      pipes.circle(p.x, knobY, 7).fill(0x3a3a40).stroke({ width: 2, color: 0x8e8d96, alpha: 1 });
    }
    world.addChild(pipes);
    // Fixtures: hanging bulbs, double bulbs, spotlight dishes.
    ctx.data.fixtures = {};
    for (const l of layout.lights) {
      const c = new PIXI.Container();
      if (l.kind === 'dish') {
        c.addChild(drawShade(PIXI, l.x, l.y, l.color));
      } else {
        const offs = l.kind === 'double' ? [-14, 14] : [0];
        // Bare bulbs hang on long wires from the ceiling.
        const wire = new PIXI.Graphics();
        for (const dx of offs) {
          wire.moveTo(l.x + dx, 0);
          wire.lineTo(l.x + dx, l.y - 80);
        }
        wire.stroke({ width: 1.5, color: 0x111114, alpha: 0.9 });
        c.addChild(wire);
        for (const dx of offs) {
          const b = kit.deco(PIXI, 'hanging_lightbulb', l.x + dx, l.y + 40, { ay: 1, scale: 0.85 });
          c.addChild(b);
        }
        // A bright core that tints with the light (hidden when dark).
        const core = new PIXI.Graphics();
        for (const dx of offs) {
          core.circle(l.x + dx, l.y + 26, 8).fill({ color: 0xffffff, alpha: 0.9 });
        }
        core.blendMode = 'add';
        core.visible = false;
        c.addChild(core);
        c.core = core;
      }
      world.addChild(c);
      ctx.data.fixtures[l.id] = c;
    }
    ctx.data.cloudSprites = {};
    for (const c of layout.clouds) {
      const spr = drawCloud(PIXI, c);
      spr.alpha = 0;
      spr.visible = false;
      world.addChild(spr);
      ctx.data.cloudSprites[c.id] = spr;
    }
    ctx.data.wallSprites = {};
    for (const w of layout.walls) {
      const spr = drawWall(PIXI, w);
      world.addChild(spr);
      ctx.data.wallSprites[w.id] = spr;
    }
    for (const s of layout.signs) world.addChild(drawSign(PIXI, kit, s));
    world.addChild(kit.deco(PIXI, 'door_asset_gray', layout.door.x, layout.door.y + 2, { scale: 0.52, tint: 0x9a96a6 }));
    // The Snaps' dark plank EXIT sign, tilted, on the floor beside the door.
    world.addChild(kit.deco(PIXI, 'firebog_sign_blank_plank', layout.door.x - 96, layout.door.y - 26, { ay: 0.5, scale: 0.24, rotation: -0.08, tint: 0x4a474e }));
    const exitText = kit.label(PIXI, 'EXIT', layout.door.x - 96, layout.door.y - 27, { size: 15, fill: 0xf4f1ea, stroke: { color: 0x1d1b22, width: 2 }, weight: '800' });
    exitText.rotation = -0.08;
    world.addChild(exitText);
    return {
      label: 'Walk Toward the Light',
      width: W,
      height: H,
      background: root,
      platforms: surfaces(layout, ctx.data.state, Date.now()),
      walls: layout.ladders.map((l) => kit.ladder(l.x, l.top - 24, l.bottom ?? LOW)),
      spawn: layout.spawn,
    };
  },

  enter(ctx) {
    const { PIXI, kit } = ctx;
    const layout = ctx.data.layout;
    ctx.data.orbs = layout.orbs.map((o) => {
      const spr = kit.glow(PIXI, o.x, o.y, LIGHT_COLORS[o.color].hex, 15);
      ctx.add(spr, 25);
      return { ...o, spr, inside: false };
    });
    ctx.data.bulbs = [];
    for (const p of layout.panels) {
      const xs = bulbXs(p);
      p.colors.forEach((color, i) => {
        const spr = bulbSprite(PIXI, color);
        spr.x = xs[i];
        spr.y = p.bulbY + 4;
        const target = ctx.register({
          classId: 'light_switch',
          label: `${LIGHT_COLORS[color].label} Light`,
          subtitle: 'Switch',
          sprite: spr,
          lightBulb: { panel: p.id, color, x: xs[i] },
        });
        ctx.data.bulbs.push({ panel: p.id, color, spr, target });
      });
    }
    const doorHit = new PIXI.Graphics();
    doorHit.rect(-55, -150, 110, 150).fill({ color: 0xffffff, alpha: 0.001 });
    doorHit.x = layout.door.x;
    doorHit.y = layout.door.y;
    ctx.data.door = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: doorHit });
    ctx.data.quoins = spawnQuoins(ctx, layout.quoins);
    ctx.data.prevX = layout.spawn.x;
    ctx.data.touches = [];
    ctx.data.presses = [];
    ctx.data.falls = 0;
    ctx.data.phase = 'play';
    syncPlatforms(ctx);
    refreshBulbs(ctx);
  },

  tick(ctx) {
    const p = ctx.player;
    const layout = ctx.data.layout;
    if (!p || !layout || !ctx.data.orbs) return;
    const now = Date.now();
    const state = ctx.data.state;
    if (expireLights(state, now)) syncPlatforms(ctx);
    // Orbs fire on touch (entering their glow), like a collision box.
    for (const o of ctx.data.orbs) {
      const inside = Math.abs(p.x - o.x) < 26 && p.y - BODY_H < o.y + 14 && p.y + 4 > o.y - 14;
      if (inside && !o.inside) touch(ctx, o.id);
      o.inside = inside;
      if (o.spr && !o.spr.destroyed) {
        const pulse = 1 + Math.sin(now / 260 + o.x / 50) * 0.08;
        o.spr.scale.set(pulse);
      }
    }
    pushOutOfSolids(p, ctx.data.prevX, solidRects(layout, state, now));
    // A slow frame (dt up to 2.5) can carry a falling avatar past the
    // engine's landing window; catch any ledge or lit cloud crossed since
    // the last tick (not on ladders, where climbing down passes through).
    const prevY = ctx.data.prevY ?? p.y;
    if (p.vy >= 0 && p.y > prevY && p.y - prevY < 120 && !layout.ladders.some((l) => Math.abs(p.x - l.x) < 30)) {
      for (const s of surfaces(layout, state, now)) {
        if (s.id === 'lp_low' || p.x < s.x1 || p.x > s.x2) continue;
        if (prevY <= s.y1 + 2 && p.y > s.y1 + 2) {
          p.y = s.y1;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      }
    }
    ctx.data.prevY = p.y;
    ctx.data.prevX = p.x;
    // A fall below the floor (should not happen) returns to the section start.
    if (p.y > FALL_Y) {
      const cp = [...layout.checkpoints].reverse().find((c) => c.x <= p.x) || layout.checkpoints[0];
      ctx.place(cp.x, cp.y);
    }
    // Count landings on the floor as falls.
    const onLow = p.y >= LOW - 2 && p.x < layout.door.x - 400;
    if (onLow && !ctx.data.wasLow) ctx.data.falls += 1;
    ctx.data.wasLow = onLow;
    renderLights(ctx, now);
    takeQuoins(ctx, ctx.data.quoins || []);
  },

  verbs(ctx, target) {
    if (target.lightBulb) {
      const on = ctx.data.state.picks[target.lightBulb.panel] === target.lightBulb.color;
      return [{ id: 'switch', label: on ? 'Switch off' : 'Switch on', enabled: true, durationMs: 0, tooltip: on ? 'Put this light out' : 'Light it' }];
    }
    if (target === ctx.data.door) return [{ id: 'enter', label: 'Enter', enabled: true, durationMs: 0, tooltip: 'Leave through the door' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.lightBulb && verbId === 'switch') {
      const { panel, color, x } = target.lightBulb;
      const def = ctx.data.layout.panels.find((p) => p.id === panel);
      const p = ctx.player;
      if (!bulbInReach(def, p.x, p.y, x)) {
        ctx.toast('You can’t reach that switch from here.', 1800);
        return true;
      }
      press(ctx, panel, color);
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
    const x = ctx.player?.x || 0;
    let text = 'Touch the floating lights to light up your path.';
    if (ctx.data.phase === 'done') text = 'Colorific!';
    else if (x > 6800) text = 'Find the exit.';
    else if (x > 3300 && x < 5950) text = 'Mix the switch colours to reveal the correct path.';
    else if (x > 5950) text = 'Walk toward the light.';
    return { text, stats: [['quoins', `${got}/${(ctx.data.quoins || []).length}`], ['falls', ctx.data.falls || 0]] };
  },

  onLeave() {
    // The default `leave` flag is the reminisce's "Return from the Puzzle".
    return {};
  },

  publish(ctx) {
    const state = ctx.data.state;
    const layout = ctx.data.layout;
    if (!state || !layout) return;
    const now = Date.now();
    ctx.setData('ltLit', layout.lights.filter((l) => lightColor(layout, state, l.id, now)).map((l) => `${l.id}:${lightColor(layout, state, l.id, now)}`).join(','));
    ctx.setData('ltClouds', litClouds(layout, state, now).map((c) => c.id).join(','));
    ctx.setData('ltWalls', standingWalls(layout, state, now).map((w) => w.id).join(','));
    ctx.setData('ltPicks', Object.entries(state.picks).map(([k, v]) => `${k}:${v || '-'}`).join(','));
    ctx.setData('ltTouches', (ctx.data.touches || []).join(','));
    ctx.setData('ltQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('ltFalls', String(ctx.data.falls || 0));
    ctx.setData('ltPhase', ctx.data.phase || '');
    const p = ctx.player;
    if (p) ctx.setData('ltPlayer', `${Math.round(p.x)},${Math.round(p.y)}`);
  },

  async autoplay(ctx, mode) {
    const go = async (x, y) => {
      ctx.place(x, y);
      await ctx.wait(350);
    };
    await ctx.wait(500);
    for (const step of SOLUTION) {
      if (step.orb) {
        const o = ctx.data.layout.orbs.find((it) => it.id === step.orb);
        await go(o.x, Math.min(o.y + 100, LOW));
        touch(ctx, o.id);
      } else if (step.bulb) {
        const [panel, color] = step.bulb;
        const def = ctx.data.layout.panels.find((p) => p.id === panel);
        const bx = bulbXs(def)[def.colors.indexOf(color)];
        await go(bx - 60, def.surface);
        const b = ctx.data.bulbs.find((it) => it.panel === panel && it.color === color);
        room.runVerb(ctx, b.target, 'switch');
      } else if (step.to) {
        const s = surfaceById(ctx.data.layout, step.to);
        await go(step.x, s.y);
      } else if (step.fall) {
        await go(step.x, LOW);
      } else if (step.ladder) {
        const l = ctx.data.layout.ladders.find((it) => it.id === step.ladder);
        await go(l.x - 40, l.top);
      }
      ctx.data.autoStep = (ctx.data.autoStep || 0) + 1;
      if (mode.startsWith('step') && ctx.data.autoStep >= Number(mode.slice(4))) {
        ctx.setData('ltAutoplay', mode);
        return mode;
      }
      if (mode === 'mix' && step.bulb?.[0] === 'pb') {
        ctx.setData('ltAutoplay', 'mix');
        return 'mix';
      }
      if (mode === 'final' && step.to === 'f') {
        ctx.setData('ltAutoplay', 'final');
        return 'final';
      }
    }
    for (const qx of [6960, 7020, 7080]) await go(qx, 700);
    if (mode === 'champ') return 'champ';
    await go(ctx.data.layout.door.x - 30, LOW);
    if (mode === 'door') return 'door';
    room.runVerb(ctx, ctx.data.door, 'enter');
    return 'exited';
  },
};

function surfaceById(layout, id) {
  const s = layout.slabs.find((it) => it.id === id) || layout.clouds.find((it) => it.id === id);
  return s ? { ...s, y: s.y } : null;
}

function touch(ctx, orbId) {
  const layout = ctx.data.layout;
  const o = layout.orbs.find((it) => it.id === orbId);
  if (!o) return;
  const now = Date.now();
  const fresh = touchOrb(layout, ctx.data.state, orbId, now);
  ctx.data.touches.push(orbId);
  ctx.sound('GLOWING_ORB_COLLIDE', { volume: fresh ? 0.55 : 0.3 });
  syncPlatforms(ctx);
}

function press(ctx, panel, color) {
  const layout = ctx.data.layout;
  pressBulb(layout, ctx.data.state, panel, color);
  ctx.data.presses.push(`${panel}:${color}`);
  ctx.sound('SWITCH_PRESS_BLOOIAN', { volume: 0.5 });
  const lamp = layout.lights.find((l) => l.panels?.includes(panel));
  const now = Date.now();
  const mixed = lamp ? lightColor(layout, ctx.data.state, lamp.id, now) : null;
  const def = layout.panels.find((p) => p.id === panel);
  ctx.floatText(def.x, def.bulbY - 40, mixed ? `${LIGHT_COLORS[mixed].label} light` : 'Lights out', mixed ? LIGHT_COLORS[mixed].css : '#cfcbd6');
  refreshBulbs(ctx);
  syncPlatforms(ctx);
}

function refreshBulbs(ctx) {
  for (const b of ctx.data.bulbs || []) {
    const on = ctx.data.state.picks[b.panel] === b.color;
    if (!b.spr || b.spr.destroyed) continue;
    b.spr.glow.visible = on;
    b.spr.body.alpha = on ? 1 : 0.42;
  }
}

function renderLights(ctx, now) {
  const { layout, state } = ctx.data;
  for (const l of layout.lights) {
    const color = lightColor(layout, state, l.id, now);
    // Timed lights flicker as they run out.
    const left = lightRemaining(state, l.id, now);
    const timedOn = l.base === 'off' && color && left !== Infinity && left < FLICKER_MS;
    const timedOff = l.base === 'on' && !color && lightRemaining(state, l.id, now) < FLICKER_MS && left > 0;
    const flick = (timedOn || timedOff) && Math.floor(now / 120) % 2 === 0;
    const cone = ctx.data.cones[l.id];
    if (cone && !cone.destroyed) {
      if (color) cone.tint = LIGHT_COLORS[color].hex;
      const want = color ? (flick ? 0.2 : l.kind === 'dish' ? 0.46 : 0.44) : timedOff && flick ? 0.12 : 0;
      setAlpha(cone, want, 0.25);
    }
    const fx = ctx.data.fixtures[l.id];
    if (fx?.core) {
      fx.core.visible = Boolean(color) && !flick;
      if (color) fx.core.tint = LIGHT_COLORS[color].hex;
    }
  }
  const lit = new Set(litClouds(layout, state, now).map((c) => c.id));
  for (const c of layout.clouds) setAlpha(ctx.data.cloudSprites[c.id], lit.has(c.id) ? 1 : 0, 0.3);
  const up = new Set(standingWalls(layout, state, now).map((w) => w.id));
  for (const w of layout.walls) setAlpha(ctx.data.wallSprites[w.id], up.has(w.id) ? 1 : 0, 0.3);
}

async function exit(ctx) {
  if (ctx.data.phase === 'done') return;
  if (!ctx.near(ctx.data.layout.door.x, ctx.data.layout.door.y, 140)) {
    ctx.toast('Walk up to the door first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.progress('solved_puzzle');
  ctx.solve();
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(400);
  ctx.leave({ transition: ctx.fx() });
}
