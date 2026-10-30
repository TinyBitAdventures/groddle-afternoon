/**
 * An Autumn Day (quests/an_autumn_day.js, quests/an_autumn_day_part2.js),
 * the sequel to A Summer's Day (js/summers-day.js).
 *
 * Source: onStarted calls questInstanceLocation(pc, 'an_autumn_day', 0, 0,
 * 5 * 60, {preserve_links: true}, {}, true): one 5-minute instance of four
 * linked template locations, LUVCCQSMDIB3HOI "An Autumn Day" and three
 * branches named "This feeling of …" (inc_data_maps_prod.js):
 * an_autumn_day_stillness LUVCL0STDIB37HE, _comfort LUVCLOOUDIB3432 and
 * _wonder LUVCMAKVDIB33B4. onExitLocation lets the player move between those
 * four freely and fails the quest on any other exit. The only requirement is
 * the `leave` flag, set by callback_an_autumn_day_finish (a location click
 * payload) just before it teleports the player to the instance exit. No
 * rewards; part 1 says "next time perhaps your decision will have a different
 * outcome", part 2 is the hourly repeatable reminisce (canOffer: an hour after
 * part 1 and after its own last finish or fail).
 *
 * The four location files (geometry, the word props, their scripts) are
 * lost. Reconstructed from GlitchAddict footage (OuO_TtcfAyI, 2 min,
 * reference only): a silhouetted autumn wood at sunset, a caption, a black
 * bird that flies ahead, words drifting in the air that the player climbs,
 * then a scrambled sentence whose words change as the player jumps into them;
 * with the sentence in place the bird lands in a warm glow, and touching it
 * opens the room named by the last word. Desk FOOTWORDS (Austin 2026-10-26,
 * G314): the footage's six-word caption does not ship; the caption, the
 * drifting words and the sentence are GSJS's own "This feeling of …" (the
 * three rooms' name, inc_data_maps_prod.js 17952-17954), so the climb and the
 * scramble are the remake's (This; wonder., feeling; stillness., comfort., of). The Wonder
 * room (the one recorded) has a bench, falling leaves and a hovering red
 * bird that leaves a Qurazy Quoin behind (+1098 iMG on camera: level 60's
 * 915 x 1.2), and a small "exit" at its left edge. Stillness and Comfort are
 * built in the same style from their names. Words are one-way platforms;
 * the climbs cross two rock walls so every word is remembered on the way.
 *
 * Look (G75): 24 players' Snaps (research/wayback/raw/snaps/an_autumn_day/,
 * reference only) show the backdrop every room shares: three hazy layers of
 * gnarled branching trees with flat red leaf puffs, two thin bare saplings
 * framing the view, red bushes, a cattail sprig, a small fence at the far
 * right and a heavy vignette. The trees, puffs and sprigs are limbo1.swf's
 * CC0 decos (tools/room-art an_autumn_day); saplings and vignette are vectors.
 *
 * The memory's own decos survive in quest01.swf (CC0) though no archived
 * location places them: the black park bench (bench_01_anautumnsday, a
 * still), the falling leaves (falling_leaves_01*_anatumunsday, four one-leaf
 * columns that play) and the girl whose hair blows in the wind
 * (silhouette_girl_anautumsday, 33 frames). Three Snaps of the Comfort room
 * (PHVU4BAI9S623BG, PHVJLT7S99527G2, PHF624MH10D2RFE) show her sitting at the
 * left end of the bench, so she sits there; where the leaves fall is ours.
 */

import { AN_AUTUMN_DAY_FILES } from '../an-autumn-day-art.js';
import { textureFromUrl } from '../textures.js';
import { sceneAnim } from '../deco-anim.js?v=g457-3';

export const ROOM_ID = 'an_autumn_day';
export const QUEST_ID = 'an_autumn_day';
export const REPEAT_QUEST_ID = 'an_autumn_day_part2';
/** source: questInstanceLocation(..., 5*60, ...) exit delay. */
export const AUTUMN_MS = 5 * 60 * 1000;
/** source: inc_data_maps_prod.js location names. */
export const MAIN_LABEL = 'An Autumn Day';
export const FEELING_LABEL = 'This feeling of …';
/** G315: template in hub 61 'Simple Level Quests' (inc_data_maps_prod.js 245), a dev label; plain remake wording. */
export const HUB_NAME = 'Quest';
/** Desk FOOTWORDS (G314): GSJS's words, inc_data_maps_prod.js 17952 "This feeling of …". */
export const CAPTION = 'This feeling of …';
export const SOURCE_TSIDS = Object.freeze({
  main: 'LUVCCQSMDIB3HOI',
  stillness: 'LUVCL0STDIB37HE',
  comfort: 'LUVCLOOUDIB3432',
  wonder: 'LUVCMAKVDIB33B4',
});
export const FEELINGS = Object.freeze(['stillness', 'comfort', 'wonder']);

/** The sentence: three fixed words, then one of three endings. */
export const SENTENCE = Object.freeze(['This', 'feeling', 'of']);
export const ENDINGS = Object.freeze(['stillness.', 'comfort.', 'wonder.']);
/** The row starts scrambled (a remake choice): two jumps per fixed word, one more for wonder. */
export const SCRAMBLE = Object.freeze(['feeling', 'of', 'This', 'comfort.']);
/** Seconds in a feeling room before its Qurazy Quoin shows (footage: ~18 s, camera mode included). */
export const LINGER_MS = 12_000;

const ART = 'assets/sprites/quest-rooms/an_autumn_day/';
const MUSIC = 'assets/audio/sfx/AUTUMN_DAY.mp3';

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */

export const MAIN = Object.freeze({ W: 4400, H: 1320, FLOOR: 1200 });
export const ROOM = Object.freeze({ W: 1400, H: 780, FLOOR: 660 });
/** Avatar body used for overlaps (feet .. feet - BODY_H), like the other rooms. */
export const BODY_H = 70;
const WORD_SIZE = 30;

/** Approximate rendered width of a word at WORD_SIZE (tests use it too). */
export function wordWidth(text) {
  return Math.round(String(text).length * 15 + 18);
}

/**
 * Drifting words in climbing order: `y` is the walking line on the word.
 * This lifts the player onto a fallen trunk; two staircases cross two rock
 * walls too tall to jump.
 */
export function mainWords() {
  const F = MAIN.FLOOR;
  return [
    { id: 'this', text: 'This', x: 925, y: F - 78, stair: 0 },
    { id: 'wonder', text: 'wonder.', x: 1580, y: F - 92, stair: 1 },
    { id: 'feeling', text: 'feeling', x: 1688, y: F - 182, stair: 1 },
    { id: 'stillness', text: 'stillness.', x: 2420, y: F - 92, stair: 2 },
    { id: 'comfort', text: 'comfort.', x: 2532, y: F - 182, stair: 2 },
    { id: 'of', text: 'of', x: 2656, y: F - 272, stair: 2 },
  ].map((w) => ({ ...w, w: wordWidth(w.text) }));
}

/** Solid props: the fallen trunk, two rock walls, a few stones and the bench. */
export function mainProps() {
  const F = MAIN.FLOOR;
  return {
    bench: { x: 330, y: F - 34, w: 120 },
    trunk: { x1: 985, x2: 1170, top: F - 128 },
    walls: [
      { id: 'aad_wall_a', x1: 1760, x2: 1905, top: F - 260 },
      { id: 'aad_wall_b', x1: 2780, x2: 2925, top: F - 350 },
    ],
    stones: [
      { x1: 1330, x2: 1400, top: F - 58 },
      { x1: 2120, x2: 2196, top: F - 56 },
      { x1: 4090, x2: 4180, top: F - 74 },
    ],
    lamps: [1262, 1990, 2318, 3560],
  };
}

/** Walkable lines of the main wood (kit.plat shapes, built without the kit for tests). */
export function mainPlatforms(kit) {
  const F = MAIN.FLOOR;
  const p = (id, x1, y, x2) => kit.plat(x1, y, x2, y, 'invisible', { id });
  const props = mainProps();
  const out = [p('aad_floor', 0, F, MAIN.W)];
  out.push(p('aad_bench', props.bench.x - props.bench.w / 2 + 8, props.bench.y, props.bench.x + props.bench.w / 2 - 8));
  out.push(p('aad_trunk', props.trunk.x1, props.trunk.top, props.trunk.x2));
  for (const w of props.walls) out.push(p(`${w.id}_top`, w.x1, w.top, w.x2));
  props.stones.forEach((s, i) => out.push(p(`aad_stone${i}`, s.x1, s.top, s.x2)));
  // A word's walking line overhangs its letters a little, like a ledge's lip.
  for (const w of mainWords()) out.push(p(`aad_word_${w.id}`, w.x - w.w / 2 - 6, w.y, w.x + w.w / 2 + 6));
  return out;
}

/**
 * Source-style walls ({x, y, h, pc_perm}): solid to an avatar walking right
 * into them (pc_perm -1), open from the right so the way back stays easy.
 */
export function mainBarriers() {
  const props = mainProps();
  const F = MAIN.FLOOR;
  return [
    { id: 'aad_trunk_wall', x: props.trunk.x1, y: props.trunk.top, h: F - props.trunk.top, pc_perm: -1 },
    ...props.walls.map((w) => ({ id: w.id, x: w.x1, y: w.top, h: F - w.top, pc_perm: -1 })),
  ];
}

/** The sentence row: one slot per word, the player jumps into them (head height, not standing height). */
export const SLOT_COUNT = SENTENCE.length + 1;
export function sentenceSlots() {
  const F = MAIN.FLOOR;
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({ i, x: 3300 + i * 150, y: F - 140, w: 132, h: 34 }));
}

/** Where the bird waits in the clearing, and where it lands once the sentence is right. */
export const CLEARING = Object.freeze({ x1: 3120, perch: { x: 4135, y: MAIN.FLOOR - 74 }, land: { x: 3175, y: MAIN.FLOOR - 2 } });

/** Feeling rooms: the bench, the exit at the left edge, the Qurazy spot. */
export function feelingLayout(feeling) {
  const F = ROOM.FLOOR;
  const quoin = {
    wonder: { x: 640, y: F - 158 },
    comfort: { x: 780, y: F - 156 },
    stillness: { x: 600, y: F - 162 },
  }[feeling] || { x: 640, y: F - 172 };
  return {
    spawn: { x: 800, y: F },
    bench: { x: 640, y: F - 34, w: 120 },
    exit: { x: 96, y: F },
    quoin,
  };
}

export function feelingPlatforms(kit, feeling) {
  const F = ROOM.FLOOR;
  const lay = feelingLayout(feeling);
  return [
    kit.plat(0, F, ROOM.W, F, 'invisible', { id: 'aad_room_floor' }),
    kit.plat(lay.bench.x - lay.bench.w / 2 + 8, lay.bench.y, lay.bench.x + lay.bench.w / 2 - 8, lay.bench.y, 'invisible', { id: 'aad_room_bench' }),
  ];
}

/* ------------------------------------------------------------------ */
/* Sentence rules                                                       */
/* ------------------------------------------------------------------ */

/** The word after `word` in its slot's cycle (the three sentence words, or the three endings). */
export function cycleWord(slot, word) {
  const list = slot >= SENTENCE.length ? ENDINGS : SENTENCE;
  const at = list.indexOf(word);
  return list[(at + 1) % list.length];
}

export function slotCorrect(slot, word) {
  return slot >= SENTENCE.length ? ENDINGS.includes(word) : SENTENCE[slot] === word;
}

/** "This feeling of" in place (any ending will do). */
export function sentenceReady(words) {
  return Array.isArray(words) && words.length === SLOT_COUNT && words.every((w, i) => slotCorrect(i, w));
}

/** The room the sentence leads to ('wonder' for "wonder."). */
export function feelingFor(words) {
  const end = Array.isArray(words) ? String(words[SENTENCE.length] || '') : '';
  const id = end.replace(/\.$/, '');
  return FEELINGS.includes(id) ? id : null;
}

export function feelingCaption(feeling) {
  return FEELINGS.includes(feeling) ? `This feeling of ${feeling}.` : CAPTION;
}

/** Fewest jumps to fix a sentence for a chosen ending (QA and tests). */
export function touchesToSolve(words, ending = 'wonder.') {
  let n = 0;
  words.forEach((w, i) => {
    const list = i >= SENTENCE.length ? ENDINGS : SENTENCE;
    const want = i >= SENTENCE.length ? ending : SENTENCE[i];
    n += (list.indexOf(want) - list.indexOf(w) + list.length) % list.length;
  });
  return n;
}

/** Bottom-anchored body vs a centred box. */
function bodyHits(p, box) {
  return Math.abs(p.x - box.x) <= box.w / 2 && p.y - BODY_H <= box.y + box.h / 2 && p.y >= box.y - box.h / 2;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

const INK = 0x0c0707;
/** The camera may scroll past the world's right edge (the side panel inset): draw beyond it. */
const PAD = 640;
/** Screen-fixed caption spot (the footage's bottom caption), left of the side panel. */
const CAPTION_AT = Object.freeze({ x: 400, y: 306 + 62 });

/** A limbo1 room-art piece at its world size times `scale` (bottom-centre anchored). */
function art(PIXI, name, x, y, opts = {}) {
  const [file] = AN_AUTUMN_DAY_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, s);
  spr.x = x;
  spr.y = y;
  if (opts.tint != null) spr.tint = opts.tint;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  return spr;
}

/** Branch tips on blur_tree_03 (x from its centre by width, y from its top by height): where the red puffs sit. */
export const PUFF_TIPS = Object.freeze([[-0.32, 0.43], [0.3, 0.38], [0.45, 0.53], [-0.5, 0.5], [-0.06, 0.3], [0.38, 0.73], [-0.32, 0.7]]);
/** The haze layers, far to near: parallax, tree tint and alpha, puff alpha. */
export const HAZE = Object.freeze([
  Object.freeze({ f: 0.3, tint: 0xa8645a, alpha: 0.42, puff: 0.42 }),
  Object.freeze({ f: 0.55, tint: 0x6a3a34, alpha: 0.62, puff: 0.66 }),
  Object.freeze({ f: 0.75, tint: 0x2e1816, alpha: 0.82, puff: 0.86 }),
]);
/**
 * Foreground saplings [x, height, seed]: about two to a view, rising past its top. In the
 * feeling rooms they stand where the Snaps frame them with the usual camera (x ~325): one at
 * ~15% of the view's width, one at ~85%.
 */
export const MAIN_SAPLINGS = Object.freeze([[120, 560, 1], [760, 600, 2], [1430, 560, 3], [2060, 610, 4], [2620, 560, 5], [3700, 590, 6], [4290, 570, 7]]);
export const FEELING_SAPLINGS = Object.freeze([[470, 600, 8], [1140, 580, 9]]);
/** Red bushes [x, scale, with a cattail sprig] on the ground (were vector flower clumps). */
export const MAIN_BUSHES = Object.freeze([[460, 0.45, false], [820, 0.35, false], [1530, 0.5, false], [2240, 0.4, false], [2470, 0.35, false], [3260, 0.6, true], [3900, 0.5, true], [4340, 0.35, false]]);
export const FEELING_BUSHES = Object.freeze([[420, 0.45, false], [880, 0.55, true], [1150, 0.4, false]]);

function wordText(PIXI, text, opts = {}) {
  const t = new PIXI.Text({ text: text, style: {
    fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: opts.size || WORD_SIZE,
    fontWeight: opts.weight || '900',
    fill: opts.fill ?? 0xffffff,
    dropShadow: { alpha: 0.55, blur: 4, color: 0x4a1a10, distance: 2 },
  } });
  t.anchor.set(0.5, opts.ay ?? 0.5);
  return t;
}

/** The saplings' few hanging leaves (the Snaps: dark red-brown against the sky). */
const SAPLING_LEAF = 0x4a1610;

/**
 * A black foreground sapling as the Snaps frame every view with (G98): a tall,
 * slightly leaning trunk tapering from ~11 px at the ground to a hair, rising past
 * the top of the view, with long thin side branches that sweep upward in turn left
 * and right, fork once and end in curled tips, a few hanging small leaves.
 */
function drawSapling(g, x, floor, h, seed) {
  const r = (k) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const lean = (r(1) - 0.5) * 90;
  const sway = (r(2) - 0.5) * 80;
  // Trunk: a quadratic from the ground to the top, drawn in short tapering strokes.
  const trunkAt = (t) => {
    const u = 1 - t;
    const cx = x + sway;
    const x2 = x + lean;
    return [u * u * x + 2 * u * t * cx + t * t * x2, floor + 6 - h * t];
  };
  const STEPS = 16;
  for (let i = 0; i < STEPS; i++) {
    const [x0, y0] = trunkAt(i / STEPS);
    const [x1, y1] = trunkAt((i + 1) / STEPS);
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke({ width: 11 - 9.5 * (i / STEPS), color: INK, cap: 'round' });
  }
  const leaf = (lx, ly, ang, size) => {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const p = (a, b) => [lx + a * c - b * sn, ly + a * sn + b * c];
    const [ax, ay] = p(0, 0);
    const [bx, by] = p(size, 0);
    const [c1x, c1y] = p(size / 2, -size * 0.38);
    const [c2x, c2y] = p(size / 2, size * 0.38);
    g.moveTo(ax, ay);
    g.quadraticCurveTo(c1x, c1y, bx, by);
    g.quadraticCurveTo(c2x, c2y, ax, ay);
    g.fill(SAPLING_LEAF);
  };
  // A thin branch: bows out and up at 25-50 degrees from the trunk, curls at the tip, maybe
  // carries a leaf, and may fork once into a V (the Snaps' Y-shaped forks).
  const branch = (x0, y0, side, len, width, k, out, twig) => {
    const x1 = x0 + side * Math.sin(out) * len;
    const y1 = y0 - Math.cos(out) * len;
    const mx = x0 + side * Math.sin(out) * len * 0.62;
    const my = y0 - Math.cos(out) * len * 0.28;
    g.moveTo(x0, y0);
    g.quadraticCurveTo(mx, my, x1, y1);
    g.stroke({ width, color: INK, cap: 'round' });
    g.moveTo(x1, y1);
    g.quadraticCurveTo(x1 + side * 8, y1 - 5, x1 + side * 4, y1 - 13);
    g.stroke({ width: Math.max(1.8, width * 0.55), color: INK, cap: 'round' });
    if (r(k + 2) > 0.4) leaf(x1 + side * 2, y1 + 2, Math.PI / 2 + side * (0.3 + r(k + 3) * 0.5), 13 + r(k + 4) * 7);
    if (twig) {
      const f = 0.45 + r(k + 5) * 0.2;
      const u = 1 - f;
      const fx = u * u * x0 + 2 * u * f * mx + f * f * x1;
      const fy = u * u * y0 + 2 * u * f * my + f * f * y1;
      branch(fx, fy, side, len * 0.5, width * 0.6, k + 7, Math.max(0.12, out - 0.45), false);
    }
  };
  const forks = 4 + Math.floor(r(3) * 2);
  for (let i = 0; i < forks; i++) {
    // Branches from ~an eighth of the way up, all within the view above the floor.
    const t = 0.12 + (i / forks) * 0.46 + (r(10 + i) - 0.5) * 0.03;
    const [bx, by] = trunkAt(t);
    const side = (i + seed) % 2 ? 1 : -1;
    const len = (170 - 60 * (i / forks)) * (0.75 + r(20 + i) * 0.4);
    branch(bx, by, side, len, 5.2 - 2 * (i / forks), 30 + i * 11, 0.45 + r(50 + i) * 0.4, r(40 + i) > 0.3);
  }
  // The leader ends in a curl too.
  const [tx, ty] = trunkAt(1);
  g.moveTo(tx, ty);
  g.quadraticCurveTo(tx + 10, ty - 10, tx + 4, ty - 20);
  g.stroke({ width: 1.5, color: INK, cap: 'round' });
}

/**
 * quest01.swf bench_01_anautumnsday (stage 132 x 61) at its own size: the seat's top edge is 33 px
 * over the legs' feet, so the feet stand 33 px under the seat's walking line (props.bench.y).
 */
export const BENCH = Object.freeze({ deco: 'bench_01_anautumnsday', scale: 0.5, seatOverFeet: 33 });
function bench(PIXI, kit, x, seatY) {
  return kit.deco(PIXI, BENCH.deco, x, seatY + BENCH.seatOverFeet, { scale: BENCH.scale });
}

/** The girl of the Comfort Snaps, standing at the bench's left end behind its back (stage 60 x 91). */
export const GIRL = Object.freeze({ deco: 'silhouette_girl_anautumsday', dx: -40, scale: 0.5 });

function drawLamp(g, x, floor) {
  g.rect(x - 3, floor - 150, 6, 150);
  g.rect(x - 9, floor - 6, 18, 6);
  g.ellipse(x, floor - 166, 15, 20);
  g.rect(x - 10, floor - 188, 20, 5);
  g.fill(INK);
  for (const dx of [-6, 0, 6]) g.roundRect(x + dx - 1.5, floor - 176, 3, 16, 1.5);
  g.fill({ color: 0xffe7b0, alpha: 0.85 });
}

/** A small picket fence (the Snaps keep it low, at the far right). */
function drawFence(g, x1, x2, floor) {
  g.rect(x1, floor - 30, x2 - x1, 4);
  g.rect(x1, floor - 15, x2 - x1, 4);
  for (let x = x1; x <= x2; x += 16) {
    g.moveTo(x, floor);
    g.lineTo(x, floor - 38);
    g.lineTo(x + 3, floor - 44);
    g.lineTo(x + 6, floor - 38);
    g.lineTo(x + 6, floor);
    g.closePath();
  }
  g.fill(INK);
}

function drawStone(g, s, floor) {
  g.roundRect(s.x1, s.top, s.x2 - s.x1, floor - s.top + 6, 14).fill(INK);
}

function drawRockWall(g, w, floor) {
  g.moveTo(w.x1 - 14, floor + 4);
  g.bezierCurveTo(w.x1 - 4, floor - 120, w.x1 - 10, w.top + 60, w.x1 + 6, w.top + 8);
  g.quadraticCurveTo(w.x1 + 30, w.top - 6, (w.x1 + w.x2) / 2, w.top - 2);
  g.quadraticCurveTo(w.x2 - 20, w.top - 8, w.x2 - 4, w.top + 10);
  g.bezierCurveTo(w.x2 + 6, w.top + 80, w.x2 + 2, floor - 140, w.x2 + 18, floor + 4);
  g.closePath();
  g.fill(INK);
  tufts(g, w.x1 + 6, w.x2 - 6, w.top, 9);
}

function tufts(g, x1, x2, y, step = 14) {
  for (let x = x1; x < x2; x += step) {
    const h = 6 + ((x * 7) % 9);
    g.moveTo(x - 4, y + 1);
    g.lineTo(x - 1, y - h);
    g.lineTo(x + 1, y + 1);
    g.lineTo(x + 3, y - h * 0.7);
    g.lineTo(x + 5, y + 1);
  }
  g.fill(INK);
}

function drawGround(g, W, H, floor) {
  g.moveTo(0, floor + 2);
  for (let x = 0; x <= W; x += 120) g.lineTo(x, floor + 2 - ((x / 120) % 3 === 1 ? 4 : 0));
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill(INK);
  tufts(g, 0, W, floor + 2, 11);
}

function skyGradient(PIXI, kit, W, H, floor) {
  const at = (y) => Math.max(0, Math.min(1, y / H));
  return kit.gradient(PIXI, [
    [0, '#e7899a'],
    [at(floor - 700), '#ef9488'],
    [at(floor - 360), '#f39d70'],
    [at(floor - 130), '#f6ad5c'],
    [at(floor), '#e98a4a'],
    [1, '#b45a32'],
  ], W, H);
}

/** Pale shafts of light across the upper sky (screen-fixed). */
function lightRays(PIXI) {
  const g = new PIXI.Graphics();
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 190;
    g.moveTo(x, 0);
    g.lineTo(x + 70, 0);
    g.lineTo(x + 230, 540);
    g.lineTo(x + 150, 540);
    g.closePath();
    g.fill({ color: 0xffffff, alpha: 0.07 });
  }
  return g;
}

/**
 * One haze layer of the backdrop wood on a parallax layer (factor f, viewed from ground camY0):
 * limbo1's blurred gnarled trees, tinted to the layer, with red leaf puffs on their branch tips.
 */
function woodLayer(PIXI, root, haze, z, { W, floor, count, minH, maxH, seed }) {
  const { f } = haze;
  const layer = root.layer(f, z);
  const camY0 = floor - 306;
  const base = floor - camY0 * (1 - f) - (1 - f) * 24;
  const span = f * (W - 960) + 1100;
  const puffs = ['tree_foliage_red_big', 'tree_foliage_red_small', 'tree_foliage_red_small2'];
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (span / count) + Math.sin(seed + i * 2.7) * 40;
    const h = minH + (Math.sin(seed * 3 + i * 1.9) * 0.5 + 0.5) * (maxH - minH);
    const plain = i % 5 === 3;
    const name = plain ? 'blur_tree_01_white' : 'blur_tree_03_white';
    const [, tw, th] = AN_AUTUMN_DAY_FILES[name];
    const scale = h / th;
    const flip = (i + seed) % 2 === 1;
    layer.addChild(art(PIXI, name, x, base + 8, { scale, flip, tint: haze.tint, alpha: haze.alpha }));
    if (plain) continue;
    for (let k = 0; k < 3; k++) {
      const [fx, fy] = PUFF_TIPS[(i * 3 + k + seed) % PUFF_TIPS.length];
      const px = x + (flip ? -fx : fx) * tw * scale;
      const py = base + 8 - h * (1 - fy);
      const puff = puffs[(i + k) % puffs.length];
      const ps = (h / 900) * (puff === 'tree_foliage_red_big' ? 0.75 : 1.1);
      layer.addChild(art(PIXI, puff, px, py + 10 * ps, { scale: ps, alpha: haze.puff, flip: k % 2 === 1 }));
    }
  }
  return layer;
}

/** A red bush on the ground, sometimes with a cattail sprig beside it. */
function bush(PIXI, layer, x, floor, scale, sprig = false) {
  layer.addChild(art(PIXI, 'tree_foliage_red_big', x, floor + 10, { scale }));
  if (sprig) {
    layer.addChild(art(PIXI, 'willow_01', x - 70 * scale, floor + 4, { scale: 0.9 }));
    layer.addChild(art(PIXI, 'willow_02', x - 58 * scale, floor + 4, { scale: 0.75, flip: true }));
  }
}

/** The Snaps' heavy vignette: dark corners and edges, fixed to the screen. */
let vignetteCanvas = null;
function vignette(PIXI) {
  if (!vignetteCanvas && typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 480;
    cv.height = 270;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(240, 125, 70, 240, 135, 290);
    grad.addColorStop(0, 'rgba(20,6,4,0)');
    grad.addColorStop(0.55, 'rgba(20,6,4,0.12)');
    grad.addColorStop(1, 'rgba(20,6,4,0.62)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 480, 270);
    vignetteCanvas = cv;
  }
  const spr = new PIXI.Sprite(vignetteCanvas ? PIXI.Texture.from(vignetteCanvas) : PIXI.Texture.EMPTY);
  spr.width = 960;
  spr.height = 540;
  return spr;
}

function ghost(PIXI, kit, x, y, scale, alpha = 0.55) {
  return kit.deco(PIXI, 'background_ghost_transparent', x, y, { scale, tint: 0xff8f6e, alpha });
}

function drawMain(ctx) {
  const { PIXI, kit } = ctx;
  const { W, H, FLOOR } = MAIN;
  const root = kit.sceneRoot(PIXI, W, H);
  const sky = root.layer(1, 0);
  sky.addChild(skyGradient(PIXI, kit, W + PAD, H, FLOOR));
  const screen = root.layer(0, 1);
  screen.addChild(lightRays(PIXI));
  woodLayer(PIXI, root, HAZE[0], 2, { W: W + PAD, floor: FLOOR, count: 15, minH: 380, maxH: 520, seed: 3 });
  const mid = woodLayer(PIXI, root, HAZE[1], 3, { W: W + PAD, floor: FLOOR, count: 12, minH: 430, maxH: 590, seed: 11 });
  // The pink spirits that stand among the trees (footage), on the middle layer.
  const camY0 = FLOOR - 306;
  const midBase = FLOOR - camY0 * 0.45 - 10;
  for (const [x, s] of [[560, 0.36], [1230, 0.42], [1720, 0.34], [2160, 0.4]]) mid.addChild(ghost(PIXI, kit, x, midBase, s));
  woodLayer(PIXI, root, HAZE[2], 3.5, { W: W + PAD, floor: FLOOR, count: 9, minH: 480, maxH: 660, seed: 17 });
  root.layer(0, 8).addChild(vignette(PIXI));
  const world = root.layer(1, 4);
  const g = new PIXI.Graphics();
  const props = mainProps();
  // Thin bare saplings in front of the wood.
  for (const [x, h, seed] of MAIN_SAPLINGS) drawSapling(g, x, FLOOR, h, seed);
  for (const [x, s, sprig] of MAIN_BUSHES) bush(PIXI, world, x, FLOOR, s, sprig);
  // A huge black trunk frames the clearing (the footage's dark left edge).
  g.moveTo(2975, FLOOR + 6);
  g.bezierCurveTo(3010, FLOOR - 300, 2990, FLOOR - 700, 3030, 0);
  g.lineTo(3135, 0);
  g.bezierCurveTo(3120, FLOOR - 650, 3100, FLOOR - 260, 3150, FLOOR + 6);
  g.closePath();
  g.fill(INK);
  drawGround(g, W + PAD, H, FLOOR);
  drawFence(g, 4250, 4380, FLOOR);
  for (const x of props.lamps) drawLamp(g, x, FLOOR);
  for (const s of props.stones) drawStone(g, s, FLOOR);
  for (const w of props.walls) drawRockWall(g, w, FLOOR);
  // The fallen trunk with its root plate.
  g.roundRect(props.trunk.x1, props.trunk.top, props.trunk.x2 - props.trunk.x1, FLOOR - props.trunk.top + 6, 22);
  g.moveTo(props.trunk.x2 - 10, props.trunk.top + 10);
  g.lineTo(props.trunk.x2 + 40, props.trunk.top - 30);
  g.lineTo(props.trunk.x2 + 46, props.trunk.top - 24);
  g.lineTo(props.trunk.x2 + 6, props.trunk.top + 24);
  g.fill(INK);
  tufts(g, props.trunk.x1 + 10, props.trunk.x2 - 10, props.trunk.top, 12);
  world.addChild(g);
  world.addChild(bench(PIXI, kit, props.bench.x, props.bench.y));
  const caption = wordText(PIXI, CAPTION, { size: 19, weight: '700', fill: 0xf4e6d6 });
  caption.x = CAPTION_AT.x;
  caption.y = CAPTION_AT.y;
  root.layer(0, 9).addChild(caption);
  // Words and the sentence row live on their own layer so they can fade.
  const words = new PIXI.Container();
  words.zIndex = 5;
  root.addChild(words);
  const wordSprites = {};
  for (const w of mainWords()) {
    const t = wordText(PIXI, w.text, { ay: 1 });
    t.x = w.x;
    t.y = w.y + 6;
    words.addChild(t);
    wordSprites[w.id] = t;
  }
  const slotSprites = sentenceSlots().map((s) => {
    const t = wordText(PIXI, SCRAMBLE[s.i]);
    t.x = s.x;
    t.y = s.y;
    t.alpha = 0;
    words.addChild(t);
    return t;
  });
  return { root, caption, wordSprites, slotSprites, layer: words };
}

function drawFeelingRoom(ctx, feeling) {
  const { PIXI, kit } = ctx;
  const { W, H, FLOOR } = ROOM;
  const lay = feelingLayout(feeling);
  const root = kit.sceneRoot(PIXI, W, H);
  const warm = feeling === 'comfort';
  const still = feeling === 'stillness';
  const sky = root.layer(1, 0);
  const screen = root.layer(0, 1);
  sky.addChild(kit.gradient(PIXI, [
    [0, still ? '#d98d93' : '#e9946a'],
    [0.45, still ? '#eaa684' : '#f2a15c'],
    [0.8, warm ? '#f7b45a' : '#f4b468'],
    [0.86, '#d98a4a'],
    [1, '#7a3a20'],
  ], W + PAD, H));
  if (still) {
    const sun = new PIXI.Graphics();
    sun.circle(820, FLOOR - 300, 70).fill({ color: 0xfff1d6, alpha: 0.5 });
    sky.addChild(sun);
  }
  screen.addChild(lightRays(PIXI));
  woodLayer(PIXI, root, HAZE[0], 2, { W: W + PAD, floor: FLOOR, count: 9, minH: 380, maxH: 500, seed: 21 });
  woodLayer(PIXI, root, HAZE[1], 3, { W: W + PAD, floor: FLOOR, count: 7, minH: 420, maxH: 560, seed: 29 });
  woodLayer(PIXI, root, HAZE[2], 3.5, { W: W + PAD, floor: FLOOR, count: 5, minH: 470, maxH: 620, seed: 33 });
  root.layer(0, 8).addChild(vignette(PIXI));
  const world = root.layer(1, 4);
  for (const [x, s, sprig] of FEELING_BUSHES) bush(PIXI, world, x, FLOOR, s, sprig);
  if (warm) world.addChild(kit.glow(PIXI, 780, FLOOR - 166, 0xffc56a, 90)).alpha = 0.32;
  const g = new PIXI.Graphics();
  // The two saplings that frame the view.
  for (const [x, h, seed] of FEELING_SAPLINGS) drawSapling(g, x, FLOOR, h, seed);
  drawGround(g, W + PAD, H, FLOOR);
  if (warm) drawLamp(g, 780, FLOOR);
  drawFence(g, 1260, 1390, FLOOR);
  world.addChild(g);
  // The Comfort Snaps: the girl sits at the bench's left end, behind its back.
  if (warm) world.addChild(sceneAnim(PIXI, GIRL.deco, lay.bench.x + GIRL.dx, FLOOR + 1, { scale: GIRL.scale, resolution: ctx.engine?.app?.renderer?.resolution }));
  world.addChild(bench(PIXI, kit, lay.bench.x, lay.bench.y));
  const exit = wordText(PIXI, 'exit', { size: 16, weight: '800', fill: 0x2a1a14 });
  exit.x = lay.exit.x;
  exit.y = FLOOR - 14;
  exit.alpha = 0.85;
  world.addChild(exit);
  const caption = wordText(PIXI, feelingCaption(feeling), { size: 19, weight: '700', fill: 0xf8eadb });
  caption.x = CAPTION_AT.x;
  caption.y = CAPTION_AT.y;
  caption.alpha = 0;
  root.layer(0, 9).addChild(caption);
  const fx = new PIXI.Container();
  fx.zIndex = 6;
  root.addChild(fx);
  return { root, caption, fx, exit };
}

/* ------------------------------------------------------------------ */
/* Birds, leaves, the Qurazy quoin                                      */
/* ------------------------------------------------------------------ */

/*
 * Bird art is CC0 glitch-overlays, flattened to one colour (G308): crow.png is rook_fly_side.swf
 * sprite 53 (its 18 frames in order, at 1/4 size), bird_red.png and bird_icon.png are
 * rook_fly_forward.swf sprite 17 (rookFlyForward_1) in red.
 */
function crowSprite(ctx, opts = {}) {
  const spr = ctx.kit.animated(ctx.PIXI, `${ART}crow.png`, 6, 3, { count: 18, speed: 0.32, ay: 0.55, ...opts });
  spr.scale.set(0.42);
  return spr;
}

function redBirdSprite(ctx) {
  const spr = ctx.kit.animated(ctx.PIXI, `${ART}bird_red.png`, 6, 6, { count: 36, speed: 0.22, ay: 0.5 });
  spr.scale.set(0.5);
  return spr;
}

/**
 * quest01.swf's falling leaves: each a 140 x 360 column one leaf falls down, as [deco, first and
 * last frame the leaf shows] (01a and 01c set off late, 01b lies blank after frame 222).
 */
export const LEAF_COLUMNS = Object.freeze([
  Object.freeze(['falling_leaves_01_anatumunsday', 0, 118]),
  Object.freeze(['falling_leaves_01a_anatumunsday', 22, 251]),
  Object.freeze(['falling_leaves_01b_anatumunsday', 0, 221]),
  Object.freeze(['falling_leaves_01c_anatumunsday', 48, 191]),
]);
/** Column height in world px (the stage's 360). */
export const LEAF_FALL = 360;

/**
 * Leaf columns across a feeling room, each on its own clock; `frozen` (Stillness) holds every leaf
 * in mid-air on a frame where it shows. Columns end between 380 px and the floor.
 */
export function leafColumns(count, frozen) {
  return Array.from({ length: count }, (_, i) => {
    const [deco, first, last] = LEAF_COLUMNS[i % LEAF_COLUMNS.length];
    return {
      deco,
      x: 80 + ((i * 397) % (ROOM.W - 160)),
      bottom: 380 + ((i * 211) % (ROOM.FLOOR - 380)),
      flip: i % 2 === 1,
      phase: i * 1733,
      hold: frozen ? first + ((i * 37) % (last - first + 1)) : null,
    };
  });
}

function makeLeaves(ctx, layer, count, frozen) {
  const now = performance.now();
  const resolution = ctx.engine?.app?.renderer?.resolution;
  return leafColumns(count, frozen).map((c) => layer.addChild(sceneAnim(ctx.PIXI, c.deco, c.x, c.bottom, {
    scale: 0.5, flip: c.flip, clock: now - c.phase, hold: c.hold, resolution,
  })));
}

function qurazyKey(feeling) {
  return `${feeling}`;
}

function spawnQurazy(ctx) {
  const d = ctx.data;
  if (d.quoin || !d.feeling) return;
  const spot = feelingLayout(d.feeling).quoin;
  const spr = ctx.quoinSprite('qurazy', spot.x, spot.y, 0.9);
  // The memory's quoin is a silhouette too (footage: a dark orb).
  spr.tint = 0x1a0d0b;
  spr.alpha = 0;
  ctx.add(spr, 40);
  d.quoin = { spr, x: spot.x, y: spot.y, taken: false, at: Date.now() };
  if (d.redBird && !d.redBird.destroyed) d.redBirdFade = Date.now();
  ctx.sound('TELEPORTER_VISIBLE_APPEAR', { volume: 0.3 });
}

function takeQurazy(ctx) {
  const q = ctx.data.quoin;
  if (!q || q.taken) return;
  q.taken = true;
  q.spr.visible = false;
  ctx.memory('qurazy')[qurazyKey(ctx.data.feeling)] = Date.now();
  const res = ctx.collectQuoin('qurazy', q.x, q.y);
  ctx.sound('QUORAZY_QUOIN', { volume: 0.45 });
  ctx.data.qurazyAmount = res?.amount || 0;
}

/* ------------------------------------------------------------------ */
/* Main wood: words, sentence, bird                                     */
/* ------------------------------------------------------------------ */

function remembered(ctx) {
  return Object.keys(ctx.data.remembered || {}).length;
}

function nextWord(ctx) {
  return mainWords().find((w) => !ctx.data.remembered[w.id]) || null;
}

function remember(ctx, word) {
  if (ctx.data.remembered[word.id]) return;
  ctx.data.remembered[word.id] = Date.now();
  const n = remembered(ctx);
  ctx.sound(`LITTLE_STAR_${Math.min(19, 2 + n * 2)}`, { volume: 0.35 });
  ctx.flag(`word_${word.id}`);
}

function setSlotWord(ctx, i, word) {
  ctx.data.sentence[i] = word;
  const t = ctx.data.scene?.slotSprites?.[i];
  if (t && !t.destroyed) {
    t.text = word;
    t.flash = Date.now();
  }
  styleSlots(ctx);
}

function styleSlots(ctx) {
  const sprites = ctx.data.scene?.slotSprites || [];
  sprites.forEach((t, i) => {
    if (!t || t.destroyed) return;
    const ok = slotCorrect(i, ctx.data.sentence[i]);
    t.style.fontWeight = ok ? '900' : '700';
    t.style.fill = ok ? 0xffffff : 0xffe1c8;
    t.baseAlpha = ok ? 1 : 0.72;
  });
}

/** Jumping into a slot changes its word (also QA). */
export function touchSlot(ctx, i) {
  const d = ctx.data;
  if (!d.sentenceShown || d.choosing || i < 0 || i >= SLOT_COUNT) return false;
  const before = sentenceReady(d.sentence);
  setSlotWord(ctx, i, cycleWord(i, d.sentence[i]));
  d.touches = (d.touches || 0) + 1;
  ctx.sound(i === SENTENCE.length ? 'LITTLE_STAR_9' : `LITTLE_STAR_${3 + i}`, { volume: 0.32 });
  const ready = sentenceReady(d.sentence);
  if (ready && !before) {
    ctx.flag('sentence');
    ctx.sound('REVEAL_1', { volume: 0.4 });
  }
  return true;
}

function guideTarget(ctx) {
  const d = ctx.data;
  const p = ctx.player;
  if (d.sentenceShown) return sentenceReady(d.sentence) ? { ...CLEARING.land, perched: true } : { ...CLEARING.perch, perched: true };
  if (!d.birdLeft) return { x: 640, y: MAIN.FLOOR - 70, perched: true };
  const w = nextWord(ctx);
  if (!w) return { x: Math.max(p.x + 160, CLEARING.x1 + 120), y: MAIN.FLOOR - 230 };
  return { x: w.x + 70 + w.w / 4, y: w.y - 120 };
}

function stepBird(ctx, dt, t) {
  const d = ctx.data;
  const bird = d.bird;
  if (!bird || bird.destroyed) return;
  const goal = guideTarget(ctx);
  const k = Math.min(1, dt * 0.0022);
  const dx = goal.x - d.birdPos.x;
  const dy = goal.y - d.birdPos.y;
  d.birdPos.x += dx * k;
  d.birdPos.y += dy * k;
  const close = Math.hypot(dx, dy) < 6;
  const perched = goal.perched && close;
  bird.x = d.birdPos.x;
  bird.y = d.birdPos.y + (perched ? 0 : Math.sin(t / 260) * 5) - (perched ? 18 : 0);
  if (Math.abs(dx) > 3) bird.scale.x = (dx > 0 ? -1 : 1) * Math.abs(bird.scale.y);
  if (perched && bird.playing) bird.gotoAndStop(3);
  else if (!perched && !bird.playing && bird.totalFrames > 1) bird.play();
  const glow = d.birdGlow;
  if (glow && !glow.destroyed) {
    const want = sentenceReady(d.sentence) && d.sentenceShown ? 1 : 0;
    glow.alpha += (want * (0.75 + Math.sin(t / 380) * 0.2) - glow.alpha) * Math.min(1, dt * 0.004);
    glow.x = bird.x;
    glow.y = bird.y + 4;
  }
}

async function chooseFeeling(ctx) {
  const d = ctx.data;
  const feeling = feelingFor(d.sentence);
  if (!feeling || d.choosing) return;
  d.choosing = true;
  d.feeling = feeling;
  ctx.flag(`chose_${feeling}`);
  ctx.activity(feelingCaption(feeling));
  ctx.sound('TELEPORT_AWAY', { volume: 0.35 });
  d.fadeSentence = Date.now();
  await ctx.wait(ctx.fx() ? 1300 : 200);
  if (!ctx.run) return;
  await ctx.gotoStage(feeling);
  d.choosing = false;
}

function tickMain(ctx, dt, t) {
  const d = ctx.data;
  const p = ctx.player;
  const scene = d.scene;
  if (!p || !scene) return;
  const busy = ctx.engine.acting?.() || ctx.engine.questDialogueOpen?.() || ctx.dialogOpen();
  if (!d.birdLeft && p.x > 420) d.birdLeft = true;
  // Caption fades once the walk begins.
  if (scene.caption && !scene.caption.destroyed) {
    const want = p.x < 520 ? 1 : 0;
    scene.caption.alpha += (want - scene.caption.alpha) * Math.min(1, dt * 0.003);
  }
  // Standing on a drifting word remembers it; remembered words dim but stay.
  for (const w of mainWords()) {
    const spr = scene.wordSprites[w.id];
    if (!spr || spr.destroyed) continue;
    const on = p.onGround && Math.abs(p.y - w.y) < 4 && Math.abs(p.x - w.x) <= w.w / 2 + 10;
    if (on && !busy) remember(ctx, w);
    const want = d.remembered[w.id] ? 0.38 : 0.92 + Math.sin(t / 500 + w.x) * 0.08;
    spr.alpha += (want - spr.alpha) * Math.min(1, dt * 0.004);
  }
  // The sentence gathers in the clearing.
  if (!d.sentenceShown && p.x > CLEARING.x1 && remembered(ctx) >= mainWords().length) {
    d.sentenceShown = Date.now();
    ctx.flag('clearing');
    styleSlots(ctx);
  }
  const slots = sentenceSlots();
  const fading = d.fadeSentence ? Math.max(0, 1 - (t - d.fadeSentence) / 1000) : 1;
  scene.slotSprites.forEach((spr, i) => {
    if (!spr || spr.destroyed) return;
    const base = d.sentenceShown ? spr.baseAlpha ?? 1 : 0;
    const flash = spr.flash ? Math.max(0, 1 - (t - spr.flash) / 260) : 0;
    spr.alpha = Math.max(0, base - flash * 0.6) * fading;
    spr.scale.set(1 + flash * 0.12);
    spr.y = slots[i].y + (d.sentenceShown ? Math.sin(t / 900 + i) * 1.5 : 0);
  });
  if (d.sentenceShown && !d.choosing && !busy) {
    // Jumping into a word changes it (rising edge per slot).
    d.inSlot ||= [];
    for (const s of slots) {
      const hit = bodyHits(p, s);
      if (hit && !d.inSlot[s.i]) touchSlot(ctx, s.i);
      d.inSlot[s.i] = hit;
    }
    if (sentenceReady(d.sentence) && Math.hypot(p.x - d.birdPos.x, p.y - CLEARING.land.y) < 56 && Math.abs(d.birdPos.x - CLEARING.land.x) < 12) {
      chooseFeeling(ctx);
    }
  }
  stepBird(ctx, dt, t);
}

/* ------------------------------------------------------------------ */
/* Feeling rooms                                                        */
/* ------------------------------------------------------------------ */

function tickFeeling(ctx, dt, t) {
  const d = ctx.data;
  const p = ctx.player;
  const scene = d.scene;
  if (!p || !scene) return;
  if (scene.caption && !scene.caption.destroyed) scene.caption.alpha = Math.min(1, (t - d.feelEnteredAt) / 1600);
  const rb = d.redBird;
  if (rb && !rb.destroyed) {
    rb.y = feelingLayout('wonder').quoin.y - 6 + Math.sin(t / 700) * 8;
    if (d.redBirdFade) rb.alpha = Math.max(0, 1 - (t - d.redBirdFade) / 1500);
  }
  if (d.perchCrow && !d.perchCrow.destroyed && d.feeling !== 'stillness') d.perchCrow.y = d.perchCrow.baseY + Math.sin(t / 900) * 0.6;
  const owed = !ctx.memory('qurazy')[qurazyKey(d.feeling)];
  if (owed && !d.quoin && t - d.feelEnteredAt >= LINGER_MS) spawnQurazy(ctx);
  const q = d.quoin;
  if (q && !q.taken) {
    q.spr.alpha = Math.min(1, (t - q.at) / 1200);
    q.spr.y = q.y + Math.sin(t / 420) * 4;
    if (q.spr.alpha > 0.6 && bodyHits(p, { x: q.x, y: q.y, w: 52, h: 40 })) takeQurazy(ctx);
  }
  const busy = ctx.engine.acting?.() || ctx.engine.questDialogueOpen?.() || ctx.dialogOpen();
  if (!busy && !d.leaving && t - d.feelEnteredAt > 1200 && p.x <= feelingLayout(d.feeling).exit.x + 40) finish(ctx);
}

/** callback_an_autumn_day_finish: set `leave` and go to the instance exit. */
async function finish(ctx) {
  const d = ctx.data;
  if (d.leaving) return;
  d.leaving = true;
  ctx.flag('finish');
  ctx.solve();
  await ctx.wait(ctx.fx() ? 500 : 50);
  await ctx.leave({ transition: ctx.fx() });
}

/** Everything in the memory is a silhouette, the avatar too (footage). */
function silhouette(ctx, on) {
  const p = ctx.player;
  const d = ctx.data;
  if (!p) return;
  if (on && !d.silhouette) {
    const f = new ctx.PIXI.ColorMatrixFilter();
    // Alpha column only: every visible pixel becomes near-black ink.
    f.matrix = [0, 0, 0, 0.05, 0, 0, 0, 0, 0.03, 0, 0, 0, 0, 0.03, 0, 0, 0, 0, 1, 0];
    d.silhouette = f;
    p.filters = [...(p.filters || []), f];
  } else if (!on && d.silhouette) {
    const left = (p.filters || []).filter((x) => x !== d.silhouette);
    p.filters = left.length ? left : null;
    d.silhouette = null;
  }
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

export const room = {
  id: ROOM_ID,
  title: MAIN_LABEL,
  /** Keeps its own sunset light, like A Summer's Day: the world-only Dametime tint stays off (G99). */
  ownLight: true,
  kicker: 'A shared memory',
  icon: `${ART}bird_icon.png`,
  theme: 'warm',
  hubName: HUB_NAME,
  durationMs: AUTUMN_MS,
  firstStage: 'main',
  leaveText: 'Leave the memory? It will fade, and you can ask to visit again later.',
  expireText: 'The autumn memory fades.',
  doneLabel: 'Go back',

  stageLabel: (stage) => (FEELINGS.includes(stage) ? FEELING_LABEL : MAIN_LABEL),

  start(ctx) {
    ctx.data.remembered = {};
    ctx.data.sentence = [...SCRAMBLE];
  },

  build(ctx, stage) {
    ctx.data.remembered ||= {};
    // A row saved before desk FOOTWORDS had six words: start it again.
    if (!Array.isArray(ctx.data.sentence) || ctx.data.sentence.length !== SLOT_COUNT) ctx.data.sentence = [...SCRAMBLE];
    if (FEELINGS.includes(stage)) {
      const scene = drawFeelingRoom(ctx, stage);
      ctx.data.scene = scene;
      return {
        label: FEELING_LABEL,
        hubName: HUB_NAME,
        width: ROOM.W,
        height: ROOM.H,
        background: scene.root,
        platforms: feelingPlatforms(ctx.kit, stage),
        spawn: feelingLayout(stage).spawn,
      };
    }
    const scene = drawMain(ctx);
    ctx.data.scene = scene;
    return {
      label: MAIN_LABEL,
      hubName: HUB_NAME,
      width: MAIN.W,
      height: MAIN.H,
      background: scene.root,
      platforms: mainPlatforms(ctx.kit),
      barriers: mainBarriers(),
      spawn: { x: 240, y: MAIN.FLOOR },
    };
  },

  enter(ctx, stage) {
    const d = ctx.data;
    silhouette(ctx, true);
    if (!d.stopMusic && !d.musicStarting) {
      d.musicStarting = true;
      Promise.resolve(ctx.engine.playCue?.(MUSIC, { volume: 0.5 })).then((stop) => {
        d.musicStarting = false;
        if (!ctx.run) stop?.();
        else d.stopMusic = stop;
      });
    }
    if (FEELINGS.includes(stage)) {
      d.feeling = stage;
      d.feelEnteredAt = Date.now();
      d.quoin = null;
      d.redBird = null;
      d.redBirdFade = 0;
      d.leaving = false;
      const lay = feelingLayout(stage);
      d.leaves = makeLeaves(ctx, d.scene.fx, stage === 'stillness' ? 26 : stage === 'wonder' ? 18 : 8, stage === 'stillness');
      if (stage === 'wonder') {
        const rb = redBirdSprite(ctx);
        rb.x = lay.quoin.x;
        rb.y = lay.quoin.y - 6;
        d.redBird = ctx.add(rb, 38);
      }
      // The black bird came along: on the bench back, or on the lamp.
      const crow = crowSprite(ctx, { play: false });
      crow.x = stage === 'comfort' ? 790 : lay.bench.x + 48;
      crow.baseY = stage === 'comfort' ? ROOM.FLOOR - 196 : lay.bench.y - 60;
      crow.y = crow.baseY;
      crow.scale.set(stage === 'comfort' ? -0.32 : 0.32, 0.32);
      d.perchCrow = ctx.add(crow, 36);
      ctx.flag(`room_${stage}`);
      return;
    }
    const bird = crowSprite(ctx);
    d.birdPos ||= { x: 640, y: MAIN.FLOOR - 70 };
    bird.x = d.birdPos.x;
    bird.y = d.birdPos.y;
    const glow = ctx.kit.glow(ctx.PIXI, bird.x, bird.y, 0xffb35c, 46);
    glow.alpha = 0;
    d.birdGlow = ctx.add(glow, 34);
    d.bird = ctx.add(bird, 36);
    if (d.sentenceShown) styleSlots(ctx);
    d.fadeSentence = 0;
  },

  clear(ctx) {
    ctx.data.leaves = [];
  },

  tick(ctx, dtMs) {
    const dt = Math.min(100, Number(dtMs) || 16);
    const t = Date.now();
    if (FEELINGS.includes(ctx.stage)) tickFeeling(ctx, dt, t);
    else tickMain(ctx, dt, t);
  },

  objective(ctx) {
    const d = ctx.data;
    const words = `${remembered(ctx)}/${mainWords().length}`;
    if (FEELINGS.includes(ctx.stage)) {
      const stats = [['feeling', d.feeling]];
      if (d.qurazyAmount) stats.push(['iMG', `+${d.qurazyAmount}`]);
      return { text: d.leaving ? 'Back to Ur…' : `${feelingCaption(d.feeling)} Walk to the exit when you are ready.`, stats };
    }
    if (d.choosing) return { text: feelingCaption(d.feeling), stats: [['words', words]] };
    if (d.sentenceShown) {
      return sentenceReady(d.sentence)
        ? { text: `${d.sentence.join(' ')} Go to the bird, or jump to change the last word.`, stats: [['words', words]] }
        : { text: 'Jump into the words to put the feeling back together.', stats: [['words', words]] };
    }
    if (!d.birdLeft) return { text: CAPTION, stats: [['words', words]] };
    return { text: 'Follow the bird and climb the drifting words.', stats: [['words', words]] };
  },

  onLeave(ctx) {
    silhouette(ctx, false);
    ctx.data.stopMusic?.();
    ctx.data.stopMusic = null;
    return {};
  },

  publish(ctx) {
    const d = ctx.data;
    ctx.setData('autumnStage', ctx.stage || '');
    ctx.setData('autumnWords', `${remembered(ctx)}/${mainWords().length}`);
    ctx.setData('autumnSentence', (d.sentence || []).join(' '));
    ctx.setData('autumnSentenceShown', d.sentenceShown ? '1' : '0');
    ctx.setData('autumnReady', sentenceReady(d.sentence) ? '1' : '0');
    ctx.setData('autumnFeeling', d.feeling || '');
    ctx.setData('autumnQurazy', d.quoin ? (d.quoin.taken ? `taken:${d.qurazyAmount || 0}` : 'shown') : 'none');
    ctx.setData('autumnBird', d.birdPos ? `${Math.round(d.birdPos.x)},${Math.round(d.birdPos.y)}` : '');
  },

  /**
   * QA: ?questdemo=an_autumn_day&questautoplay=wonder|comfort|stillness
   * (or words / sentence / room to stop early). Places the avatar; the
   * real-input route is in tests' QA notes.
   */
  async autoplay(ctx, mode) {
    const feeling = FEELINGS.includes(mode) ? mode : 'wonder';
    const settle = async (pred, ms = 8000) => {
      const end = Date.now() + ms;
      while (!pred() && Date.now() < end) await ctx.wait(100);
      return pred();
    };
    await ctx.wait(900);
    for (const w of mainWords()) {
      ctx.place(w.x, w.y - 4);
      if (!(await settle(() => ctx.data.remembered[w.id], 3000))) return `stuck:${w.id}`;
      await ctx.wait(150);
    }
    if (mode === 'words') return 'words';
    ctx.place(CLEARING.x1 + 120, MAIN.FLOOR);
    if (!(await settle(() => ctx.data.sentenceShown, 3000))) return 'no-sentence';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const want = i === SENTENCE.length ? `${feeling}.` : SENTENCE[i];
      for (let k = 0; k < 6 && ctx.data.sentence[i] !== want; k++) {
        touchSlot(ctx, i);
        await ctx.wait(120);
      }
    }
    if (mode === 'sentence') return 'sentence';
    await settle(() => Math.abs(ctx.data.birdPos.x - CLEARING.land.x) < 12, 8000);
    ctx.place(CLEARING.land.x + 30, MAIN.FLOOR);
    if (!(await settle(() => ctx.stage === feeling, 9000))) return 'no-room';
    if (mode === 'room') return 'room';
    await ctx.wait(600);
    if (!ctx.memory('qurazy')[qurazyKey(feeling)]) {
      ctx.data.feelEnteredAt = Date.now() - LINGER_MS;
      await settle(() => ctx.data.quoin && ctx.data.quoin.spr.alpha > 0.7, 4000);
      const q = ctx.data.quoin;
      if (q) {
        ctx.place(q.x, q.y + 40);
        await settle(() => q.taken, 3000);
      }
    }
    if (mode === 'quoin') return 'quoin';
    await ctx.wait(800);
    ctx.place(feelingLayout(feeling).exit.x + 20, ROOM.FLOOR);
    await settle(() => !ctx.run, 8000);
    return 'complete';
  },
};
