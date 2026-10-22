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
 * lost. Reconstructed from GlitchAddict footage (OuO_TtcfAyI, 2 min): a
 * silhouetted autumn wood at sunset, the caption "Almost forgot this feeling
 * of …", a black bird that flies ahead, words drifting in the air that the
 * player climbs (forgot; Almost, wonder., feeling; stillness., comfort.,
 * this, of), then a scrambled sentence whose words change as the player jumps
 * into them. With "Almost forgot this feeling of" in place the bird lands in a
 * warm glow; touching it opens the room named by the last word. The Wonder
 * room (the one recorded) has a bench, falling leaves and a hovering red
 * bird that leaves a Qurazy Quoin behind (+1098 iMG on camera: level 60's
 * 915 x 1.2), and a small "exit" at its left edge. Stillness and Comfort are
 * built in the same style from their names. Words are one-way platforms;
 * the climbs cross two rock walls so every word is remembered on the way.
 */

export const ROOM_ID = 'an_autumn_day';
export const QUEST_ID = 'an_autumn_day';
export const REPEAT_QUEST_ID = 'an_autumn_day_part2';
/** source: questInstanceLocation(..., 5*60, ...) exit delay. */
export const AUTUMN_MS = 5 * 60 * 1000;
/** source: inc_data_maps_prod.js location names. */
export const MAIN_LABEL = 'An Autumn Day';
export const FEELING_LABEL = 'This feeling of …';
export const HUB_NAME = 'A shared memory of the Giants';
export const CAPTION = 'Almost forgot this feeling of …';
export const SOURCE_TSIDS = Object.freeze({
  main: 'LUVCCQSMDIB3HOI',
  stillness: 'LUVCL0STDIB37HE',
  comfort: 'LUVCLOOUDIB3432',
  wonder: 'LUVCMAKVDIB33B4',
});
export const FEELINGS = Object.freeze(['stillness', 'comfort', 'wonder']);

/** The sentence: five fixed words, then one of three endings. */
export const SENTENCE = Object.freeze(['Almost', 'forgot', 'this', 'feeling', 'of']);
export const ENDINGS = Object.freeze(['stillness.', 'comfort.', 'wonder.']);
/** Footage: the row first read "forgot Almost this forgot of comfort." */
export const SCRAMBLE = Object.freeze(['forgot', 'Almost', 'this', 'forgot', 'of', 'comfort.']);
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
 * forgot lifts the player onto a fallen trunk; two staircases cross two rock
 * walls too tall to jump.
 */
export function mainWords() {
  const F = MAIN.FLOOR;
  return [
    { id: 'forgot', text: 'forgot', x: 925, y: F - 78, stair: 0 },
    { id: 'almost', text: 'Almost', x: 1500, y: F - 92, stair: 1 },
    { id: 'wonder', text: 'wonder.', x: 1590, y: F - 182, stair: 1 },
    { id: 'feeling', text: 'feeling', x: 1688, y: F - 270, stair: 1 },
    { id: 'stillness', text: 'stillness.', x: 2420, y: F - 92, stair: 2 },
    { id: 'comfort', text: 'comfort.', x: 2532, y: F - 182, stair: 2 },
    { id: 'this', text: 'this', x: 2612, y: F - 272, stair: 2 },
    { id: 'of', text: 'of', x: 2656, y: F - 362, stair: 2 },
  ].map((w) => ({ ...w, w: wordWidth(w.text) }));
}

/** Solid props: the fallen trunk, two rock walls, a few stones and the bench. */
export function mainProps() {
  const F = MAIN.FLOOR;
  return {
    bench: { x: 330, y: F - 34, w: 120 },
    trunk: { x1: 985, x2: 1170, top: F - 128 },
    walls: [
      { id: 'aad_wall_a', x1: 1760, x2: 1905, top: F - 332 },
      { id: 'aad_wall_b', x1: 2780, x2: 2925, top: F - 440 },
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

/** The sentence row: six slots the player jumps into (head height, not standing height). */
export function sentenceSlots() {
  const F = MAIN.FLOOR;
  return [0, 1, 2, 3, 4, 5].map((i) => ({ i, x: 3300 + i * 138, y: F - 140, w: 120, h: 34 }));
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

/** The word after `word` in its slot's cycle (five sentence words, or the three endings). */
export function cycleWord(slot, word) {
  const list = slot >= SENTENCE.length ? ENDINGS : SENTENCE;
  const at = list.indexOf(word);
  return list[(at + 1) % list.length];
}

export function slotCorrect(slot, word) {
  return slot >= SENTENCE.length ? ENDINGS.includes(word) : SENTENCE[slot] === word;
}

/** "Almost forgot this feeling of" in place (any ending will do). */
export function sentenceReady(words) {
  return Array.isArray(words) && words.length === 6 && words.every((w, i) => slotCorrect(i, w));
}

/** The room the sentence leads to ('wonder' for "wonder."). */
export function feelingFor(words) {
  const end = Array.isArray(words) ? String(words[5] || '') : '';
  const id = end.replace(/\.$/, '');
  return FEELINGS.includes(id) ? id : null;
}

export function feelingCaption(feeling) {
  return FEELINGS.includes(feeling) ? `Almost forgot this feeling of ${feeling}.` : CAPTION;
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
const RED = 0xc3161d;
const RED_DARK = 0x86101a;

function wordText(PIXI, text, opts = {}) {
  const t = new PIXI.Text(text, {
    fontFamily: 'Nunito, "Trebuchet MS", sans-serif',
    fontSize: opts.size || WORD_SIZE,
    fontWeight: opts.weight || '900',
    fill: opts.fill ?? 0xffffff,
    dropShadow: true,
    dropShadowColor: 0x4a1a10,
    dropShadowAlpha: 0.55,
    dropShadowBlur: 4,
    dropShadowDistance: 2,
  });
  t.anchor.set(0.5, opts.ay ?? 0.5);
  return t;
}

/** A tapering bonsai-like tree with flat leaf clumps (the footage's backdrop trees). */
function drawWoodTree(g, x, base, h, trunk, leaf, leafAlpha, seed) {
  const r = (k) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const w = 16 + r(1) * 18;
  g.beginFill(trunk.color, trunk.alpha);
  g.moveTo(x - w, base);
  g.bezierCurveTo(x - w * 0.6, base - h * 0.4, x - w * 0.25 + (r(2) - 0.5) * 30, base - h * 0.75, x - 3, base - h);
  g.lineTo(x + 3, base - h);
  g.bezierCurveTo(x + w * 0.25 + (r(3) - 0.5) * 30, base - h * 0.75, x + w * 0.6, base - h * 0.4, x + w, base);
  g.closePath();
  g.endFill();
  const branches = 3 + Math.floor(r(4) * 3);
  for (let b = 0; b < branches; b++) {
    const at = 0.35 + (b / branches) * 0.55;
    const side = b % 2 ? 1 : -1;
    const bx = x + side * w * (1 - at) * 0.4;
    const by = base - h * at;
    const len = 40 + r(10 + b) * 70;
    const ex = bx + side * len;
    const ey = by - 20 - r(20 + b) * 40;
    g.lineStyle(5 - at * 3, trunk.color, trunk.alpha);
    g.moveTo(bx, by);
    g.quadraticCurveTo(bx + side * len * 0.5, by - 4, ex, ey);
    g.lineStyle(0);
    g.beginFill(leaf, leafAlpha);
    g.drawEllipse(ex, ey - 3, 26 + r(30 + b) * 22, 7 + r(40 + b) * 4);
    g.endFill();
  }
  g.beginFill(leaf, leafAlpha);
  g.drawEllipse(x, base - h - 4, 30 + r(5) * 20, 8);
  g.endFill();
}

function drawBench(g, x, seatY) {
  g.beginFill(INK);
  for (let k = 0; k < 3; k++) g.drawRoundedRect(x - 60, seatY - 44 + k * 11, 120, 6, 2);
  g.drawRect(x - 62, seatY - 3, 124, 7);
  g.drawRect(x - 52, seatY - 48, 5, 50);
  g.drawRect(x + 47, seatY - 48, 5, 50);
  g.drawRect(x - 54, seatY, 6, 34);
  g.drawRect(x + 48, seatY, 6, 34);
  g.endFill();
}

function drawLamp(g, x, floor) {
  g.beginFill(INK);
  g.drawRect(x - 3, floor - 150, 6, 150);
  g.drawRect(x - 9, floor - 6, 18, 6);
  g.drawEllipse(x, floor - 166, 15, 20);
  g.drawRect(x - 10, floor - 188, 20, 5);
  g.endFill();
  g.beginFill(0xffe7b0, 0.85);
  for (const dx of [-6, 0, 6]) g.drawRoundedRect(x + dx - 1.5, floor - 176, 3, 16, 1.5);
  g.endFill();
}

function drawFence(g, x1, x2, floor) {
  g.beginFill(INK);
  g.drawRect(x1, floor - 46, x2 - x1, 5);
  g.drawRect(x1, floor - 24, x2 - x1, 5);
  for (let x = x1; x <= x2; x += 22) {
    g.moveTo(x, floor);
    g.lineTo(x, floor - 58);
    g.lineTo(x + 4, floor - 66);
    g.lineTo(x + 8, floor - 58);
    g.lineTo(x + 8, floor);
    g.closePath();
  }
  g.endFill();
}

function drawStone(g, s, floor) {
  g.beginFill(INK);
  g.drawRoundedRect(s.x1, s.top, s.x2 - s.x1, floor - s.top + 6, 14);
  g.endFill();
}

function drawRockWall(g, w, floor) {
  g.beginFill(INK);
  g.moveTo(w.x1 - 14, floor + 4);
  g.bezierCurveTo(w.x1 - 4, floor - 120, w.x1 - 10, w.top + 60, w.x1 + 6, w.top + 8);
  g.quadraticCurveTo(w.x1 + 30, w.top - 6, (w.x1 + w.x2) / 2, w.top - 2);
  g.quadraticCurveTo(w.x2 - 20, w.top - 8, w.x2 - 4, w.top + 10);
  g.bezierCurveTo(w.x2 + 6, w.top + 80, w.x2 + 2, floor - 140, w.x2 + 18, floor + 4);
  g.closePath();
  g.endFill();
  tufts(g, w.x1 + 6, w.x2 - 6, w.top, 9);
}

function tufts(g, x1, x2, y, step = 14) {
  g.beginFill(INK);
  for (let x = x1; x < x2; x += step) {
    const h = 6 + ((x * 7) % 9);
    g.moveTo(x - 4, y + 1);
    g.lineTo(x - 1, y - h);
    g.lineTo(x + 1, y + 1);
    g.lineTo(x + 3, y - h * 0.7);
    g.lineTo(x + 5, y + 1);
  }
  g.endFill();
}

function flowers(g, x, y, n, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.sin(seed * 31 + i * 7.3);
    const b = Math.cos(seed * 17 + i * 3.1);
    g.beginFill(i % 3 ? RED : RED_DARK, 0.95);
    g.drawEllipse(x + a * n * 9, y - 6 - Math.abs(b) * 14, 13 + Math.abs(a) * 9, 8 + Math.abs(b) * 5);
    g.endFill();
  }
}

function drawGround(g, W, H, floor) {
  g.beginFill(INK);
  g.moveTo(0, floor + 2);
  for (let x = 0; x <= W; x += 120) g.lineTo(x, floor + 2 - ((x / 120) % 3 === 1 ? 4 : 0));
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.endFill();
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
    g.beginFill(0xffffff, 0.07);
    const x = 120 + i * 190;
    g.moveTo(x, 0);
    g.lineTo(x + 70, 0);
    g.lineTo(x + 230, 540);
    g.lineTo(x + 150, 540);
    g.closePath();
    g.endFill();
  }
  return g;
}

/** Backdrop wood on a parallax layer: factor f, viewed from ground camY0. */
function woodLayer(PIXI, root, f, z, { W, floor, count, trunk, leaf, leafAlpha, minH, maxH, seed }) {
  const layer = root.layer(f, z);
  const camY0 = floor - 306;
  const base = floor - camY0 * (1 - f) - (1 - f) * 24;
  const span = f * (W - 960) + 1100;
  const g = new PIXI.Graphics();
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (span / count) + Math.sin(seed + i * 2.7) * 40;
    const h = minH + (Math.sin(seed * 3 + i * 1.9) * 0.5 + 0.5) * (maxH - minH);
    drawWoodTree(g, x, base, h, trunk, leaf, leafAlpha, seed + i);
  }
  layer.addChild(g);
  return layer;
}

function bareTree(PIXI, kit, name, x, floor, scale, flip = false) {
  return kit.deco(PIXI, name, x, floor + 6, { scale, flip, tint: INK });
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
  woodLayer(PIXI, root, 0.3, 2, {
    W: W + PAD, floor: FLOOR, count: 15, trunk: { color: 0x6e4a48, alpha: 0.5 }, leaf: 0xb4503a, leafAlpha: 0.45, minH: 420, maxH: 720, seed: 3,
  });
  const mid = woodLayer(PIXI, root, 0.55, 3, {
    W: W + PAD, floor: FLOOR, count: 13, trunk: { color: 0x3a2524, alpha: 0.78 }, leaf: 0x9a3222, leafAlpha: 0.7, minH: 480, maxH: 820, seed: 11,
  });
  // The pink spirits that stand among the trees (footage), on the middle layer.
  const camY0 = FLOOR - 306;
  const midBase = FLOOR - camY0 * 0.45 - 10;
  for (const [x, s] of [[560, 0.36], [1230, 0.42], [1720, 0.34], [2160, 0.4]]) mid.addChild(ghost(PIXI, kit, x, midBase, s));
  const world = root.layer(1, 4);
  const g = new PIXI.Graphics();
  const props = mainProps();
  // Tall bare trees in front of the wood.
  for (const [name, x, s, flip] of [
    ['heights_tree_bare_1', 120, 0.42, false], ['heights_tree_bare_3', 760, 0.6, true], ['tree_bare_tall_1', 1430, 0.45, false],
    ['heights_tree_bare_2', 2060, 0.62, false], ['heights_tree_bare_1', 2620, 0.4, true], ['heights_tree_bare_4', 3700, 0.55, false],
    ['tree_bare_thin_1', 4290, 0.5, true],
  ]) world.addChild(bareTree(PIXI, kit, name, x, FLOOR, s, flip));
  // A huge black trunk frames the clearing (the footage's dark left edge).
  g.beginFill(INK);
  g.moveTo(2975, FLOOR + 6);
  g.bezierCurveTo(3010, FLOOR - 300, 2990, FLOOR - 700, 3030, 0);
  g.lineTo(3135, 0);
  g.bezierCurveTo(3120, FLOOR - 650, 3100, FLOOR - 260, 3150, FLOOR + 6);
  g.closePath();
  g.endFill();
  drawGround(g, W + PAD, H, FLOOR);
  drawBench(g, props.bench.x, props.bench.y);
  drawFence(g, 560, 700, FLOOR);
  drawFence(g, 4230, 4390, FLOOR);
  for (const x of props.lamps) drawLamp(g, x, FLOOR);
  for (const s of props.stones) drawStone(g, s, FLOOR);
  for (const w of props.walls) drawRockWall(g, w, FLOOR);
  // The fallen trunk with its root plate.
  g.beginFill(INK);
  g.drawRoundedRect(props.trunk.x1, props.trunk.top, props.trunk.x2 - props.trunk.x1, FLOOR - props.trunk.top + 6, 22);
  g.moveTo(props.trunk.x2 - 10, props.trunk.top + 10);
  g.lineTo(props.trunk.x2 + 40, props.trunk.top - 30);
  g.lineTo(props.trunk.x2 + 46, props.trunk.top - 24);
  g.lineTo(props.trunk.x2 + 6, props.trunk.top + 24);
  g.endFill();
  tufts(g, props.trunk.x1 + 10, props.trunk.x2 - 10, props.trunk.top, 12);
  for (const [x, n, s] of [[460, 5, 1], [820, 4, 2], [1530, 6, 3], [2240, 5, 4], [2470, 4, 5], [3260, 7, 6], [3900, 6, 7], [4340, 4, 8]]) {
    flowers(g, x, FLOOR + 2, n, s);
  }
  world.addChild(g);
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
    sun.beginFill(0xfff1d6, 0.5);
    sun.drawCircle(820, FLOOR - 300, 70);
    sun.endFill();
    sky.addChild(sun);
  }
  screen.addChild(lightRays(PIXI));
  woodLayer(PIXI, root, 0.35, 2, {
    W: W + PAD, floor: FLOOR, count: 10, trunk: { color: 0x6e4a48, alpha: 0.5 }, leaf: 0xb4503a, leafAlpha: 0.5, minH: 380, maxH: 560, seed: 21,
  });
  woodLayer(PIXI, root, 0.6, 3, {
    W: W + PAD, floor: FLOOR, count: 9, trunk: { color: 0x3a2524, alpha: 0.8 }, leaf: 0x9a3222, leafAlpha: 0.7, minH: 420, maxH: 620, seed: 29,
  });
  const world = root.layer(1, 4);
  for (const [name, x, s, flip] of [['heights_tree_bare_3', 230, 0.5, false], ['heights_tree_bare_1', 1010, 0.36, true], ['tree_bare_tall_1', 1330, 0.36, false]]) {
    world.addChild(bareTree(PIXI, kit, name, x, FLOOR, s, flip));
  }
  if (warm) {
    world.addChild(kit.glow(PIXI, 780, FLOOR - 166, 0xffc56a, 90)).alpha = 0.32;
    world.addChild(ghost(PIXI, kit, 560, FLOOR + 2, 0.24, 0.8));
    world.addChild(ghost(PIXI, kit, 700, FLOOR + 2, 0.2, 0.8));
  }
  const g = new PIXI.Graphics();
  drawGround(g, W + PAD, H, FLOOR);
  drawBench(g, lay.bench.x, lay.bench.y);
  if (warm) drawLamp(g, 780, FLOOR);
  drawFence(g, 1210, 1390, FLOOR);
  for (const [x, n, s] of [[420, 5, 2], [880, 6, 3], [1150, 4, 4]]) flowers(g, x, FLOOR + 2, n, s);
  world.addChild(g);
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

function makeLeaves(ctx, layer, count, frozen) {
  const { PIXI } = ctx;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const g = new PIXI.Graphics();
    g.beginFill(i % 3 ? 0xb5281e : 0x7d1c14, 0.9);
    g.drawEllipse(0, 0, 6, 3);
    g.endFill();
    g.x = 80 + ((i * 397) % (ROOM.W - 160));
    g.y = 60 + ((i * 211) % (ROOM.FLOOR - 120));
    g.rotation = i;
    g.seed = i * 1.7;
    g.frozen = frozen;
    layer.addChild(g);
    leaves.push(g);
  }
  return leaves;
}

function stepLeaves(leaves, dt, t) {
  for (const l of leaves || []) {
    if (l.destroyed) continue;
    if (l.frozen) {
      l.rotation = l.seed + Math.sin(t / 2600 + l.seed) * 0.04;
      continue;
    }
    l.y += dt * 0.035;
    l.x += Math.sin(t / 700 + l.seed) * dt * 0.03 - dt * 0.008;
    l.rotation += dt * 0.0016;
    if (l.y > ROOM.FLOOR + 4) {
      l.y = -10;
      l.x = 60 + Math.random() * (ROOM.W - 120);
    }
  }
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
  if (!d.sentenceShown || d.choosing || i < 0 || i > 5) return false;
  const before = sentenceReady(d.sentence);
  setSlotWord(ctx, i, cycleWord(i, d.sentence[i]));
  d.touches = (d.touches || 0) + 1;
  ctx.sound(i === 5 ? 'LITTLE_STAR_9' : `LITTLE_STAR_${3 + i}`, { volume: 0.32 });
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
  stepLeaves(d.leaves, dt, t);
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
    ctx.data.sentence ||= [...SCRAMBLE];
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
    for (let i = 0; i < 6; i++) {
      const want = i === 5 ? `${feeling}.` : SENTENCE[i];
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
