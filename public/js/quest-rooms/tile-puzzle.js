/**
 * An Old Fashioned B&E (quests/btc_room_3.js + btc_room_3_reminisce.js):
 * B.T.C Room #3.
 *
 * Source: onStarted makes a private copy of LHF3NS7UR1C3C52 ("B.T.C Room #3",
 * hub 139 in inc_data_maps_prod.js) with a 5 * 60 second exit delay and
 * preserve_links; leaving before the end fails the quest (onExitLocation ->
 * failQuest + instances_exit). The one requirement is the
 * `instance_exit_via_door` flag ("Reach the Exit"); first run pays 500 iMG,
 * 500 currants and 50 Ti favor, the reminisce 350 / 200 / 20. The template
 * and its wall_button event scripts are not in the locations dump.
 *
 * Reconstructed from GranniesgotGame's recording (8qWMCIV6bYE, reference
 * only): a pale lab of grey service columns with ladders, hazard-trimmed
 * ledges and wall screens, between teal maze shafts drawn in glowing cyan.
 * Each screen shows the glyph of the shaft tile beside it and the red wall
 * button under it (items/wall_button.js: resetting mode, 1000 ms) turns that
 * tile to its next layout. The room's location events (a voice over the
 * speakers at the start and at the glowing "end" box) are lost and no CC0
 * copy of their words survives, so the voice reads the quest's own
 * description (btc_room_3.js 2) and the end is remake copy (G310). At the
 * end box the floor drops into a lower room of quoins with the EXIT door.
 *
 * Reconstruction: six tiles (three columns, two rows), each a pipe piece
 * (elbow, straight or tee) whose open sides are where you can pass. A closed
 * left or right side is a cyan wall; an open top is a pair of stepping
 * ledges up to the row line; an open bottom on the upper row is a hole in its
 * floor (a closed bottom is solid both ways, so steps underneath stop at it).
 * Every service column has a ladder, so the player can always reach a button
 * and never gets stuck; crossing each column of tiles is the puzzle. Art:
 * the recovered OGA wall_button (lockOut / lockIn statics),
 * the cheese icon; the lab itself never survived, so it is drawn as vectors.
 */

import { BODY_H, JUMP_GAP, JUMP_RISE, spawnQuoins, takeQuoins } from './puzzle-kit.js?v=cu-1';
import { textureFromUrl } from '../textures.js';

const ART = 'assets/sprites/quest-rooms/tile_puzzle/';

export const START_W = 400;
export const GREY_W = 200;
export const TILE_W = 440;
export const ROW_H = 285; // three 95 px rises per row: floor, two steps, the row line
export const STEP_RISE = 95;
export const COLS = 3;
export const ROWS = 2;
export const FLOOR = 900;
export const LINE = FLOOR - ROW_H; // the upper row's floor
export const TOP = FLOOR - 2 * ROW_H; // the lab ceiling
export const END_X1 = START_W + COLS * (GREY_W + TILE_W); // 2320
export const W = END_X1 + 700;
export const H = 1000;
export const EXIT_MS = 5 * 60 * 1000; // source: questInstanceLocation(..., 5*60)
export const BUTTON_RESET_MS = 1000; // source: wall_button reset_timer
export const TRAP = { x1: END_X1 + 220, x2: END_X1 + 380 };
export const END_BOX = { x: END_X1 + 120, y: LINE };
export const DOOR = { x: END_X1 + 590, y: FLOOR };
export const SPAWN = { x: 150, y: FLOOR };
/** Hole in an upper tile's floor and the two steps under it, relative to the tile centre. */
export const HOLE = { dx1: 10, dx2: 150 };
export const STEPS = [
  { dx1: -130, dx2: -20, rise: STEP_RISE },
  { dx1: 20, dx2: 130, rise: 2 * STEP_RISE },
];

// quests/btc_room_3.js 2 desc.
export const INTRO = [
  { text: 'Solve the maze using the ladders and buttons.', response: 'Click anywhere…' },
  { text: 'Piece of Cheesecake! Okay, I lied about the cake …', response: 'Click anywhere…' },
];
// Remake copy (G310).
export const OUTRO = [
  { text: 'Maze solved. Drop down for your quoins, then take the EXIT.', response: 'Click anywhere…' },
];

/* ------------------------------------------------------------------ */
/* Tiles and the maze graph (pure)                                      */
/* ------------------------------------------------------------------ */

const SIDES = ['U', 'R', 'D', 'L'];
/** Pipe pieces at rotation 0; each press turns a tile a quarter clockwise. */
export const PIECES = Object.freeze({
  elbow: ['U', 'R'],
  straight: ['L', 'R'],
  tee: ['L', 'U', 'R'],
});

/** c = column (0 left), r = row (0 upper, 1 lower); start = rotation on entry. */
export const TILES = Object.freeze([
  { id: 't0_0', c: 0, r: 0, kind: 'elbow', start: 0 },
  { id: 't0_1', c: 0, r: 1, kind: 'elbow', start: 2 },
  { id: 't1_0', c: 1, r: 0, kind: 'straight', start: 1 },
  { id: 't1_1', c: 1, r: 1, kind: 'tee', start: 1 },
  { id: 't2_0', c: 2, r: 0, kind: 'elbow', start: 0 },
  { id: 't2_1', c: 2, r: 1, kind: 'tee', start: 2 },
]);
/** One shortest answer (tests check it and that nothing shorter works). */
export const SOLUTION = Object.freeze(['t0_1', 't0_0', 't1_0', 't2_1', 't2_0']);

export const tileById = (id) => TILES.find((t) => t.id === id);
export const greyX = (c) => START_W + c * (GREY_W + TILE_W);
export const tileX = (c) => greyX(c) + GREY_W;
export const rowBot = (r) => (r === 1 ? FLOOR : LINE);
export const rowTop = (r) => rowBot(r) - ROW_H;
export const tileRect = (t) => ({ x1: tileX(t.c), x2: tileX(t.c) + TILE_W, yTop: rowTop(t.r), yBot: rowBot(t.r), cx: tileX(t.c) + TILE_W / 2 });
/** The button (and screen) for tile (c, r) sits on service column c at row r. */
export const buttonSpot = (t) => ({ x: greyX(t.c) + 140, y: rowBot(t.r) });
export const ladderX = (c) => greyX(c) + 45;

export function startRotations() {
  return Object.fromEntries(TILES.map((t) => [t.id, t.start]));
}

export function openings(kind, rot) {
  return new Set((PIECES[kind] || []).map((s) => SIDES[(SIDES.indexOf(s) + (rot % 4) + 4) % 4]));
}

export const tileOpen = (rots, id) => openings(tileById(id).kind, rots[id] ?? tileById(id).start);
const tileAt = (c, r) => TILES.find((t) => t.c === c && t.r === r);

/**
 * Directed moves between maze nodes: G<c>_<r> service-column floors and
 * ledges (c 0..COLS-1), T<c>_<r> the inside of a tile, and E the end ledge.
 */
export function mazeEdges(rots) {
  const edges = [];
  const add = (a, b, both = true) => {
    edges.push([a, b]);
    if (both) edges.push([b, a]);
  };
  for (let c = 0; c < COLS; c++) add(`G${c}_0`, `G${c}_1`); // every column's ladder
  for (const t of TILES) {
    const open = tileOpen(rots, t.id);
    const T = `T${t.c}_${t.r}`;
    if (open.has('L')) add(`G${t.c}_${t.r}`, T);
    if (open.has('R')) {
      if (t.c < COLS - 1) add(T, `G${t.c + 1}_${t.r}`);
      else if (t.r === 0) add(T, 'E'); // the lower right is the lab's solid wall
    }
    if (t.r === 0 && open.has('D')) {
      const below = tileAt(t.c, 1);
      // A hole always drops you; climbing back needs the steps below.
      add(T, `T${t.c}_1`, tileOpen(rots, below.id).has('U'));
    }
  }
  return edges;
}

export function reachable(rots, from = 'G0_1') {
  const edges = mazeEdges(rots);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    for (const [a, b] of edges) {
      if (a === n && !seen.has(b)) {
        seen.add(b);
        queue.push(b);
      }
    }
  }
  return seen;
}

export const mazeSolved = (rots) => reachable(rots).has('E');

/** Fewest button presses to open a way to E, pressing only buttons you can reach. */
export function fewestPresses(rots0 = startRotations(), limit = 12) {
  const key = (r) => TILES.map((t) => (r[t.id] ?? 0) % 4).join('');
  const seen = new Set([key(rots0)]);
  let frontier = [rots0];
  for (let depth = 0; depth <= limit; depth++) {
    const next = [];
    for (const rots of frontier) {
      if (mazeSolved(rots)) return depth;
      const here = reachable(rots);
      for (const t of TILES) {
        if (!here.has(`G${t.c}_${t.r}`)) continue;
        const r2 = { ...rots, [t.id]: ((rots[t.id] ?? 0) + 1) % 4 };
        const k = key(r2);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(r2);
      }
    }
    frontier = next;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Geometry (pure)                                                      */
/* ------------------------------------------------------------------ */

/** Walkable lines that never change: the floor, ledges, the end and the reward room. */
export function fixedPlatforms(trapOpen = false) {
  const p = [
    { id: 'tp_floor', x1: 0, y1: FLOOR, x2: END_X1, y2: FLOOR },
    { id: 'tp_room_floor', x1: END_X1, y1: FLOOR, x2: W, y2: FLOOR },
    { id: 'tp_end_a', x1: END_X1, y1: LINE, x2: TRAP.x1, y2: LINE },
    { id: 'tp_end_b', x1: TRAP.x2, y1: LINE, x2: W, y2: LINE },
    // Two lit ledges in the reward room.
    { id: 'tp_room_l1', x1: END_X1 + 100, y1: FLOOR - 95, x2: END_X1 + 220, y2: FLOOR - 95 },
    { id: 'tp_room_l2', x1: END_X1 + 300, y1: FLOOR - 170, x2: END_X1 + 420, y2: FLOOR - 170 },
  ];
  if (!trapOpen) p.push({ id: 'tp_trap', x1: TRAP.x1, y1: LINE, x2: TRAP.x2, y2: LINE });
  for (let c = 0; c < COLS; c++) p.push({ id: `tp_ledge${c}`, x1: greyX(c), y1: LINE, x2: greyX(c) + GREY_W, y2: LINE });
  return p.map((q) => ({ ...q, style: 'invisible' }));
}

/** A tile's own walkable lines for a set of openings. */
export function tilePlatforms(t, open) {
  const r = tileRect(t);
  const out = [];
  if (t.r === 0) {
    if (open.has('D')) {
      out.push({ id: `tp_${t.id}_fa`, x1: r.x1, y1: r.yBot, x2: r.cx + HOLE.dx1, y2: r.yBot });
      out.push({ id: `tp_${t.id}_fb`, x1: r.cx + HOLE.dx2, y1: r.yBot, x2: r.x2, y2: r.yBot });
    } else {
      out.push({ id: `tp_${t.id}_f`, x1: r.x1, y1: r.yBot, x2: r.x2, y2: r.yBot });
    }
  }
  if (open.has('U')) {
    STEPS.forEach((s, i) => out.push({ id: `tp_${t.id}_s${i}`, x1: r.cx + s.dx1, y1: r.yBot - s.rise, x2: r.cx + s.dx2, y2: r.yBot - s.rise, step: true }));
  }
  return out.map((q) => ({ ...q, style: 'invisible', tile: t.id }));
}

export function allPlatforms(rots, trapOpen = false) {
  const out = fixedPlatforms(trapOpen);
  for (const t of TILES) out.push(...tilePlatforms(t, tileOpen(rots, t.id)));
  return out;
}

/** Source-shaped barriers ({ id, x, y, h, pc_perm }); 0 is open, null solid both ways. */
export function makeBarriers() {
  const out = [];
  for (const t of TILES) {
    const r = tileRect(t);
    // Upper walls run past the lab ceiling so nobody hops over them.
    const y = t.r === 0 ? r.yTop - 200 : r.yTop;
    const h = r.yBot - y;
    out.push({ id: `tp_${t.id}_L`, x: r.x1, y, h, pc_perm: null, tile: t.id, side: 'L' });
    out.push({ id: `tp_${t.id}_R`, x: r.x2, y, h, pc_perm: null, tile: t.id, side: 'R' });
  }
  // The lab wall between the lower right tile and the reward room.
  out.push({ id: 'tp_wall_room', x: END_X1 + 2, y: LINE + 6, h: FLOOR - LINE - 6, pc_perm: null, fixed: true });
  out.push({ id: 'tp_wall_left', x: 2, y: TOP - 200, h: FLOOR - TOP + 200, pc_perm: null, fixed: true });
  out.push({ id: 'tp_wall_right', x: W - 2, y: TOP - 200, h: FLOOR - TOP + 200, pc_perm: null, fixed: true });
  return out;
}

export function syncBarriers(barriers, rots) {
  for (const b of barriers) {
    if (!b.tile) continue;
    b.pc_perm = tileOpen(rots, b.tile).has(b.side) ? 0 : null;
  }
  return barriers;
}

/** Lines that stop a rising head: a closed upper floor over its lower tile, and the lab ceiling. */
export function ceilings(rots) {
  const out = [{ id: 'tp_ceiling', x1: 0, x2: W, y: TOP }];
  for (const t of TILES) {
    if (t.r !== 0 || tileOpen(rots, t.id).has('D')) continue;
    const r = tileRect(t);
    out.push({ id: `tp_${t.id}_ceil`, x1: r.x1, x2: r.x2, y: r.yBot });
  }
  return out;
}

/** Keep the head under a ceiling it was under last tick. True when clamped. */
export function clampCeiling(player, prevY, list) {
  if (!player || !Number.isFinite(prevY)) return false;
  for (const c of list) {
    if (player.x <= c.x1 || player.x >= c.x2) continue;
    if (prevY - BODY_H >= c.y - 1 && player.y - BODY_H < c.y) {
      player.y = c.y + BODY_H;
      if (player.vy < 0) player.vy = 0;
      return true;
    }
  }
  return false;
}

export function mazeQuoins() {
  const out = TILES.map((t) => ({ id: `q_${t.id}`, x: tileRect(t).x1 + 70, y: rowBot(t.r) - 52, type: 'xp' }));
  // The quoins down below.
  out.push(
    { id: 'nc0', x: END_X1 + 60, y: FLOOR - 52, type: 'currants' },
    { id: 'nc1', x: END_X1 + 160, y: FLOOR - 95 - 52, type: 'xp' },
    { id: 'nc2', x: END_X1 + 260, y: FLOOR - 52, type: 'mood' },
    { id: 'nc3', x: END_X1 + 360, y: FLOOR - 170 - 52, type: 'xp' },
    { id: 'nc4', x: END_X1 + 440, y: FLOOR - 52, type: 'energy' },
    { id: 'nc5', x: END_X1 + 500, y: FLOOR - 52, type: 'currants' },
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

const TEAL = 0x0d5560;
const TEAL_DEEP = 0x083d46;
const CYAN = 0x2ff3ff;
const LAB = 0xd8d8d2;
const LAB_DARK = 0xb9bab3;

function hazardStrip(g, x1, x2, y, h = 14) {
  g.rect(x1, y, x2 - x1, h).fill(0x3d3a30);
  g.rect(x1, y, x2 - x1, 3);
  g.rect(x1, y + h - 3, x2 - x1, 3);
  g.fill(0xd8b23c);
  for (let x = x1 + 10; x < x2 - 16; x += 30) g.roundRect(x, y + 5, 16, 4, 2);
  g.fill({ color: 0xf4fbff, alpha: 0.95 });
}

function glowLine(g, x1, y1, x2, y2) {
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ width: 12, color: CYAN, alpha: 0.12 });
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ width: 6, color: CYAN, alpha: 0.35 });
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke({ width: 3, color: 0xc9fdff, alpha: 1 });
}

function lightLedge(g, x1, x2, y) {
  g.roundRect(x1 + 3, y + 5, x2 - x1, 14, 5).fill({ color: 0x8f8a78, alpha: 0.35 });
  g.roundRect(x1, y, x2 - x1, 14, 5).fill(0xa9a594);
  g.rect(x1 + 3, y, x2 - x1 - 6, 4).fill(0xd3cfbd);
  for (let x = x1 + 10; x < x2 - 14; x += 24) g.roundRect(x, y + 6, 12, 4, 2);
  g.fill({ color: 0xffffff, alpha: 0.95 });
}

/** Redraw one tile: teal shaft, cyan walls and floor, lit steps. */
function drawTile(g, t, open, flash = 0) {
  const r = tileRect(t);
  g.clear();
  g.rect(r.x1, r.yTop, TILE_W, ROW_H).fill(TEAL_DEEP);
  g.rect(r.x1 + 6, r.yTop + 6, TILE_W - 12, ROW_H - 12).fill({ color: TEAL, alpha: 0.9 });
  // Smoky swirls behind the glass.
  for (let i = 0; i < 3; i++) {
    const y = r.yTop + 60 + i * 80;
    g.moveTo(r.x1 + 20, y);
    g.bezierCurveTo(r.x1 + 120, y - 50, r.x1 + 220, y + 50, r.x2 - 20, y - 10);
  }
  g.stroke({ width: 10, color: 0x2a8c95, alpha: 0.18 });
  if (flash > 0) {
    g.rect(r.x1, r.yTop, TILE_W, ROW_H).fill({ color: 0xbffaff, alpha: 0.35 * flash });
  }
  if (!open.has('L')) glowLine(g, r.x1 + 4, r.yTop + 4, r.x1 + 4, r.yBot - 4);
  if (!open.has('R')) glowLine(g, r.x2 - 4, r.yTop + 4, r.x2 - 4, r.yBot - 4);
  if (t.r === 0) {
    if (open.has('D')) {
      glowLine(g, r.x1, r.yBot, r.cx + HOLE.dx1, r.yBot);
      glowLine(g, r.cx + HOLE.dx2, r.yBot, r.x2, r.yBot);
    } else glowLine(g, r.x1, r.yBot, r.x2, r.yBot);
    if (!open.has('U')) glowLine(g, r.x1 + 4, r.yTop + 4, r.x2 - 4, r.yTop + 4);
  }
  // Interior maze strokes that echo the piece (purely decorative, kept off the walking lines).
  if (open.has('U')) {
    for (const s of STEPS) lightLedge(g, r.cx + s.dx1, r.cx + s.dx2, r.yBot - s.rise);
  }
}

/** The screen glyph: a pipe from the centre to each open side. */
function drawGlyph(g, open, size = 64) {
  g.clear();
  const h = size / 2;
  g.roundRect(-h - 10, -h - 10, size + 20, size + 20, 8).fill(0x2b2e31).stroke({ width: 4, color: 0x8b8d88, alpha: 1 });
  g.roundRect(-h - 4, -h - 4, size + 8, size + 8, 5).fill(0x3a3f43);
  const ends = { U: [0, -h], R: [h, 0], D: [0, h], L: [-h, 0] };
  for (const pass of [[10, 0.25], [5, 1]]) {
    for (const s of open) {
      g.moveTo(0, 0);
      g.lineTo(ends[s][0], ends[s][1]);
    }
    g.stroke({ width: pass[0], color: CYAN, alpha: pass[1] ?? 1 });
  }
  g.circle(0, 0, 4).fill(CYAN);
}

function drawLadder(g, x, yTop, yBot) {
  g.moveTo(x - 18, yTop - 6);
  g.lineTo(x - 18, yBot);
  g.moveTo(x + 18, yTop - 6);
  g.lineTo(x + 18, yBot);
  g.stroke({ width: 6, color: 0x5d6266, alpha: 1 });
  for (let y = yBot - 14; y > yTop; y -= 20) {
    g.moveTo(x - 18, y);
    g.lineTo(x + 18, y);
  }
  g.stroke({ width: 5, color: 0x8d9296, alpha: 1 });
}

function drawLab(g) {
  // Wall: pale panels, seams and a few rivets.
  g.rect(-400, TOP - 260, W + 800, FLOOR - TOP + 360).fill(LAB);
  for (let x = 0; x < W; x += 200) {
    g.moveTo(x, TOP);
    g.lineTo(x, FLOOR);
  }
  g.stroke({ width: 2, color: LAB_DARK, alpha: 0.8 });
  // Ceiling band.
  g.rect(0, TOP - 260, W, 250).fill(0x9c9d97);
  hazardStrip(g, 0, W, TOP - 14);
  // Floor.
  g.rect(-400, FLOOR, W + 800, H - FLOOR + 400).fill(0x6f6d63);
  hazardStrip(g, 0, W, FLOOR);
  // The start pillar.
  g.rect(70, TOP, 90, FLOOR - TOP).fill(0xeee9dc);
  g.rect(140, TOP, 20, FLOOR - TOP).fill(0xd5cfbf);
  // Service columns: ledges, ladders and panel framing.
  for (let c = 0; c < COLS; c++) {
    const x = greyX(c);
    g.rect(x + 8, TOP, GREY_W - 16, FLOOR - TOP).fill(0xcac9c1);
    hazardStrip(g, x, x + GREY_W, LINE);
    drawLadder(g, ladderX(c), LINE, FLOOR);
  }
  // End ledge and the reward room under it.
  g.rect(END_X1, LINE + 14, W - END_X1, FLOOR - LINE - 14).fill(0xc4c3bb);
  hazardStrip(g, END_X1, TRAP.x1, LINE);
  hazardStrip(g, TRAP.x2, W, LINE);
  g.rect(END_X1, LINE, 10, FLOOR - LINE).fill(0x55524a);
  lightLedge(g, END_X1 + 100, END_X1 + 220, FLOOR - 95);
  lightLedge(g, END_X1 + 300, END_X1 + 420, FLOOR - 170);
  // Cracks the test subjects left behind.
  for (const [x, y] of [[END_X1 + 150, 760], [END_X1 + 270, 690], [END_X1 + 460, 780]]) {
    g.moveTo(x, y);
    g.lineTo(x + 18, y + 26);
    g.lineTo(x + 6, y + 48);
    g.lineTo(x + 26, y + 70);
  }
  g.stroke({ width: 3, color: 0x8e7f6c, alpha: 0.6 });
}

function drawTrap(g, open) {
  g.clear();
  if (open) {
    g.rect(TRAP.x1, LINE, TRAP.x2 - TRAP.x1, 14).fill(0x2f2d28);
    return;
  }
  hazardStrip(g, TRAP.x1, TRAP.x2, LINE);
  g.moveTo((TRAP.x1 + TRAP.x2) / 2, LINE);
  g.lineTo((TRAP.x1 + TRAP.x2) / 2, LINE + 14);
  g.stroke({ width: 2, color: 0x2a2822, alpha: 1 });
}

function drawEndBox(PIXI, kit) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.roundRect(-52, -116, 104, 104, 8).fill({ color: 0xe9ffb8, alpha: 0.22 });
  g.rect(-44, -108, 88, 88).stroke({ width: 5, color: 0xd7f59a, alpha: 0.95 });
  g.rect(-36, -100, 72, 72).stroke({ width: 2, color: 0xf8ffe0, alpha: 0.9 });
  c.addChild(g);
  c.addChild(kit.label(PIXI, 'end', 0, -64, { size: 22, fill: 0xf3ffd6, stroke: { color: 0x9ab85a, width: 3 } }));
  c.x = END_BOX.x;
  c.y = END_BOX.y;
  return c;
}

function drawDoor(PIXI, kit) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.roundRect(-64, -176, 128, 176, 10).fill({ color: 0x9fe8f7, alpha: 0.25 });
  g.roundRect(-58, -170, 116, 170, 8).stroke({ width: 6, color: 0x8fe3f5, alpha: 1 });
  g.rect(-50, -162, 100, 162).fill(0xbdbfbc);
  g.rect(-2, -162, 4, 162).fill(0xa5a7a3);
  g.roundRect(-36, -160, 72, 8, 4).fill({ color: 0xffffff, alpha: 0.8 });
  c.addChild(g);
  const sign = new PIXI.Graphics();
  sign.roundRect(-150, -128, 66, 30, 4).fill(0x3a3a36);
  c.addChild(sign);
  c.addChild(kit.label(PIXI, 'EXIT', -117, -113, { size: 17, fill: 0xf1f1ea }));
  c.x = DOOR.x;
  c.y = DOOR.y;
  return c;
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

function syncWorld(ctx) {
  const list = ctx.engine.platforms;
  if (list) {
    const keep = list.filter((p) => !String(p.id).startsWith('tp_'));
    list.length = 0;
    list.push(...keep, ...allPlatforms(ctx.data.rots, ctx.data.trapOpen));
  }
  syncBarriers(ctx.engine.street?.barriers || ctx.data.barriers, ctx.data.rots);
  ctx.data.ceilings = ceilings(ctx.data.rots);
}

function redrawTile(ctx, id, flash = 0) {
  const t = tileById(id);
  const open = tileOpen(ctx.data.rots, id);
  const view = ctx.data.tileViews?.[id];
  if (view && !view.destroyed) drawTile(view, t, open, flash);
  const glyph = ctx.data.glyphs?.[id];
  if (glyph && !glyph.destroyed) drawGlyph(glyph, open);
}

function nodeAt(x, y) {
  for (let c = 0; c < COLS; c++) {
    const g = greyX(c);
    if (x >= g && x <= g + GREY_W) return `G${c}_${y <= LINE + 4 ? 0 : 1}`;
  }
  if (x < START_W) return 'G0_1';
  if (x >= END_X1) return y <= LINE + 4 ? 'E' : 'room';
  const c = Math.floor((x - START_W) / (GREY_W + TILE_W));
  return `T${c}_${y <= LINE + 4 ? 0 : 1}`;
}

export const room = {
  id: 'tile_puzzle',
  title: 'B.T.C Room #3',
  kicker: 'Solve the maze',
  icon: 'assets/sprites/icons/cheese.png',
  theme: 'lab',
  hubName: 'Somewhere you should not be',
  durationMs: EXIT_MS,
  leaveText: 'Sneak out before you reach the exit? The quest will fail.',
  travelText: 'Reach the exit, or use Leave.',

  build(ctx) {
    const { PIXI, kit } = ctx;
    ctx.data.rots = startRotations();
    ctx.data.trapOpen = false;
    ctx.data.barriers = syncBarriers(makeBarriers(), ctx.data.rots);
    ctx.data.ceilings = ceilings(ctx.data.rots);
    const root = kit.sceneRoot(PIXI, W, H);
    const back = root.layer(0, 0);
    back.addChild(kit.gradient(PIXI, [[0, '#a7a9a3'], [1, '#d8d8d2']], 960, 640));
    const world = root.layer(1, 3);
    const lab = new PIXI.Graphics();
    drawLab(lab);
    world.addChild(lab);
    ctx.data.tileViews = {};
    for (const t of TILES) {
      const g = new PIXI.Graphics();
      world.addChild(g);
      ctx.data.tileViews[t.id] = g;
      drawTile(g, t, tileOpen(ctx.data.rots, t.id));
    }
    const trap = new PIXI.Graphics();
    drawTrap(trap, false);
    world.addChild(trap);
    ctx.data.trapView = trap;
    world.addChild(drawEndBox(PIXI, kit));
    world.addChild(drawDoor(PIXI, kit));
    world.addChild(kit.label(PIXI, 'B.T.C ROOM #3', 260, TOP + 60, { size: 26, fill: 0x8a8b84, weight: '900' }));
    return {
      label: 'B.T.C Room #3',
      width: W,
      height: H,
      background: root,
      platforms: allPlatforms(ctx.data.rots, false),
      walls: Array.from({ length: COLS }, (_, c) => ({ id: `tp_ladder${c}`, x: ladderX(c), yTop: LINE, yBot: FLOOR })),
      barriers: ctx.data.barriers,
      spawn: SPAWN,
    };
  },

  enter(ctx) {
    const { PIXI } = ctx;
    ctx.data.glyphs = {};
    ctx.data.buttons = {};
    ctx.data.presses = [];
    for (const t of TILES) {
      const spot = buttonSpot(t);
      // The wall screen showing this tile's glyph.
      const glyph = new PIXI.Graphics();
      glyph.x = spot.x - 10;
      glyph.y = spot.y - 118;
      ctx.add(glyph, 12);
      ctx.data.glyphs[t.id] = glyph;
      drawGlyph(glyph, tileOpen(ctx.data.rots, t.id));
      const c = new PIXI.Container();
      const out = new PIXI.Sprite(textureFromUrl(`${ART}wall_button_lockOut.png`));
      const pressed = new PIXI.Sprite(textureFromUrl(`${ART}wall_button_lockIn.png`));
      for (const s of [out, pressed]) {
        s.anchor.set(0.5, 0.5);
        s.scale.set(1.2);
        c.addChild(s);
      }
      pressed.visible = false;
      c.x = spot.x - 10;
      c.y = spot.y - 52;
      const target = ctx.register({ classId: 'wall_button', label: 'Wall Button', subtitle: 'Press', sprite: c, tpTile: t.id });
      ctx.data.buttons[t.id] = { target, out, pressed, until: 0 };
    }
    const doorHit = new PIXI.Graphics();
    doorHit.rect(-64, -176, 128, 176).fill({ color: 0xffffff, alpha: 0.001 });
    doorHit.x = DOOR.x;
    doorHit.y = DOOR.y;
    ctx.data.door = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: doorHit });
    ctx.data.quoins = spawnQuoins(ctx, mazeQuoins());
    ctx.data.prevY = SPAWN.y;
    ctx.data.phase = 'intro';
    syncWorld(ctx);
    intro(ctx);
  },

  tick(ctx) {
    const p = ctx.player;
    if (!p || !ctx.data.rots) return;
    clampCeiling(p, ctx.data.prevY, ctx.data.ceilings || []);
    ctx.data.prevY = p.y;
    const now = Date.now();
    for (const b of Object.values(ctx.data.buttons || {})) {
      if (b.until && now >= b.until) {
        b.until = 0;
        b.out.visible = true;
        b.pressed.visible = false;
      }
    }
    for (const [id, f] of Object.entries(ctx.data.flash || {})) {
      const left = Math.max(0, f - now);
      redrawTile(ctx, id, left / 400);
      if (!left) delete ctx.data.flash[id];
    }
    takeQuoins(ctx, ctx.data.quoins || []);
    ctx.data.node = nodeAt(p.x, p.y);
    const busy = ctx.engine.acting?.() || ctx.engine.questDialogueOpen?.() || ctx.dialogOpen();
    if (ctx.data.phase === 'maze' && !busy && Math.abs(p.x - END_BOX.x) < 60 && Math.abs(p.y - LINE) < 8) outro(ctx);
  },

  verbs(ctx, target) {
    if (target.tpTile) return [{ id: 'press', label: 'Press', enabled: true, tooltip: 'Press' }];
    if (target === ctx.data.door) return [{ id: 'enter', label: 'Exit', enabled: true, tooltip: 'Leave through the door' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.tpTile && verbId === 'press') {
      press(ctx, target.tpTile);
      return true;
    }
    if (target === ctx.data.door && verbId === 'enter') {
      exit(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const phase = ctx.data.phase;
    const got = (ctx.data.quoins || []).filter((q) => q.taken).length;
    const text = phase === 'done'
      ? 'Out the door.'
      : phase === 'drop' || phase === 'outro'
        ? 'The quoins are down below. Then the EXIT.'
        : 'Solve the maze using the ladders and buttons. Reach the "end" box.';
    return { text, stats: [['buttons', ctx.data.presses?.length || 0], ['quoins', `${got}/${(ctx.data.quoins || []).length}`]] };
  },

  onLeave() {
    return { leaveFlag: 'instance_exit_via_door' };
  },

  publish(ctx) {
    const rots = ctx.data.rots || {};
    ctx.setData('tpRots', TILES.map((t) => `${t.id}:${rots[t.id] ?? 0}`).join(','));
    ctx.setData('tpOpen', mazeSolved(rots) ? '1' : '0');
    ctx.setData('tpPhase', ctx.data.phase || '');
    ctx.setData('tpPresses', (ctx.data.presses || []).join(','));
    ctx.setData('tpNode', ctx.data.node || '');
    ctx.setData('tpQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('tpTrap', ctx.data.trapOpen ? '1' : '0');
  },

  async autoplay(ctx, mode) {
    const go = async (x, y = FLOOR, ms = 350) => {
      ctx.place(x, y);
      await ctx.wait(ms);
    };
    for (let i = 0; i < 80 && ctx.data.phase === 'intro'; i++) {
      ctx.advanceDialog();
      await ctx.wait(150);
    }
    if (mode === 'intro') return 'intro';
    const pressAt = async (id) => {
      const t = tileById(id);
      const s = buttonSpot(t);
      await go(s.x - 30, s.y);
      room.runVerb(ctx, ctx.data.buttons[id].target, 'press');
      await ctx.wait(300);
    };
    for (const id of SOLUTION) await pressAt(id);
    if (mode === 'solved') return mazeSolved(ctx.data.rots) ? 'solved' : 'stuck';
    // Walk the way through on the maze nodes: col 0 up through the tiles, row 0 across col 1, col 2 up and out.
    await go(tileRect(tileById('t0_1')).x1 + 70);
    await go(tileRect(tileById('t0_0')).x2 - 60, LINE);
    await go(tileRect(tileById('t1_0')).x1 + 70, LINE);
    await go(tileRect(tileById('t2_1')).x1 + 70);
    await go(tileRect(tileById('t2_0')).x2 - 60, LINE);
    await go(END_BOX.x - 20, LINE, 600);
    for (let i = 0; i < 80 && ctx.data.phase !== 'drop'; i++) {
      ctx.advanceDialog();
      await ctx.wait(150);
    }
    if (mode === 'end') return 'end';
    for (const q of ctx.data.quoins.filter((x) => x.id.startsWith('nc'))) await go(q.x, q.y + 52, 250);
    await go(DOOR.x - 30);
    room.runVerb(ctx, ctx.data.door, 'enter');
    return 'exited';
  },
};

async function intro(ctx) {
  await ctx.wait(500);
  await ctx.converse({ title: 'B.T.C Room #3', kicker: 'A voice over the speakers', beats: INTRO });
  if (ctx.data.phase === 'intro') ctx.data.phase = 'maze';
}

async function outro(ctx) {
  ctx.data.phase = 'outro';
  ctx.sound('CLICK_SUCCESS', { volume: 0.5 });
  await ctx.converse({ title: 'B.T.C Room #3', kicker: 'A voice over the speakers', beats: OUTRO });
  ctx.data.trapOpen = true;
  if (ctx.data.trapView && !ctx.data.trapView.destroyed) drawTrap(ctx.data.trapView, true);
  syncWorld(ctx);
  ctx.sound('DOOR_OPEN', { volume: 0.4 });
  ctx.floatText((TRAP.x1 + TRAP.x2) / 2, LINE - 40, 'Down below!', '#ffffff');
  ctx.data.phase = 'drop';
}

function press(ctx, id) {
  const t = tileById(id);
  const b = ctx.data.buttons[id];
  if (!t || !b) return;
  const s = buttonSpot(t);
  if (!ctx.near(s.x, s.y, 130)) {
    ctx.toast('Walk up to the button first.', 1600);
    return;
  }
  // Resetting wall_button: down now, back up after reset_timer.
  if (b.until) return;
  b.until = Date.now() + BUTTON_RESET_MS;
  b.out.visible = false;
  b.pressed.visible = true;
  ctx.data.rots[id] = ((ctx.data.rots[id] ?? 0) + 1) % 4;
  ctx.data.presses.push(id);
  (ctx.data.flash ||= {})[id] = Date.now() + 400;
  redrawTile(ctx, id, 1);
  syncWorld(ctx);
  ctx.sound('CLICK_SUCCESS', { volume: 0.4 });
}

async function exit(ctx) {
  if (ctx.data.phase === 'done') return;
  if (!ctx.near(DOOR.x, DOOR.y, 140)) {
    ctx.toast('Walk up to the door first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.progress('instance_exit_via_door');
  ctx.solve();
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(400);
  ctx.leave({ transition: ctx.fx() });
}

export const TILE_PUZZLE_FACTS = Object.freeze({ W, H, FLOOR, LINE, TOP, ROW_H, TILE_W, GREY_W, STEP_RISE, JUMP_RISE, JUMP_GAP, BODY_H });
