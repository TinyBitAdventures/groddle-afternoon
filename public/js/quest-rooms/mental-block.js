/**
 * Mental Block, Mental Block 2 and the Mental Block reminisce
 * (quests/mental_block.js, mental_block_2.js, mental_block_rem.js).
 *
 * Source: each quest's onStarted makes a private copy of its own template
 * (mental_block LIF3NLRNBBA3HD2, mental_block_rem LIFN6H8V6QB3TSH, a copy of
 * the first level, and mental_block_2 LIFE2JAV2FC3TPI) through
 * questInstanceLocation with a 5 * 60 second exit delay. That delay is not a
 * time limit: players/inc_instances.js shows "Are you stuck? Do you want to
 * leave this place?" after it, and again two minutes after every "No
 * thanks". Two flags finish each quest, `solved_puzzle` and `leave`
 * (onExitLocation sets `leave` on any exit and fails a quest that is not
 * complete). canOffer for Mental Block and its reminisce wants the
 * walk_speed_3 and jump_2 imagination upgrades; the reminisce also waits an
 * hour after part 1 and after its own last finish or fail, and is offered by
 * the Play Cube (items/play_cube.js available_quests). focusing_orb,
 * spinach, potion_rainbow_juice and potion_alphabet_sauce refuse to work
 * here ("I'd say, doing that would give you an unfair advantage.").
 *
 * The templates and their scripts are not in the archive. Both levels are
 * rebuilt from the level designer's own run-throughs (reference videos
 * mgsdduCR_Gc "Mental Block" and Y0GgASrJ_GE "Mental Block 2"): a grey,
 * silhouetted level of puzzle stations. At each station a perforated tube
 * hangs over a shelf; grey arrows mark the other places it can move to. A
 * ladder leads down into a control corridor under the shelf with three red
 * buttons, Reset, move-the-tube and drop-a-block, and a Limit board that
 * counts the blocks left and shows their colours in order. Blue blocks stack
 * on anything; red blocks stack only on red and crush every blue block
 * beneath them. Blocks become the steps up to a ledge too high to jump. The
 * stations, block orders, tube stops, towers, floating slabs and ledge
 * heights are the footage's, in block units (the remake's jump clears one
 * block, never two, like the original's). Mental Block opens with the BLOCK
 * DROP billboard and later the CAUTION one, both with working demo buttons,
 * and ends with three iMG quoins down a drop, a teleporter ("You done did
 * it!") and a door. Mental Block 2 opens with "Facts about Blocks", has
 * towers with ladders on their far sides, rates every station on an
 * Evaluation board (+4 currants; the footage shows "Adequate", "Normal" and
 * "You've got Brains"; the rule behind them is lost, so here it follows the
 * resets used) and ends at a door.
 *
 * Reconstructed beyond the footage: the Limit board also draws a small map
 * of the station (the remake's camera cannot show the shelf from the
 * corridor), and any dropped block answers "Reset" so a player boxed into a
 * pit by their own columns is never stuck. Triple jump is off in here, like
 * the source's other jump boosts. Art: the recovered wall_button (lockOut /
 * lockIn), Teleporter_Base / Teleporter_Beam and door_asset_gray; the tube,
 * blocks, billboards and silhouettes are clean vectors.
 */

import { pushOutOfSolids, spawnQuoins, takeQuoins, BODY_H } from './puzzle-kit.js?v=8a4480a4';
import { textureFromUrl } from '../textures.js?v=01a295a1';

const ROOM_ID = 'mental_block';
const ART = `assets/sprites/quest-rooms/${ROOM_ID}/`;

/** One block, in px. The remake's jump rises ~105 px: one block, never two. */
export const CELL = 72;
export const SHELF_Y = 700;
const SHELF_T = 34;
/** The control corridor's floor under the shelf. */
export const CORR_Y = SHELF_Y + 150;
const H = 960;
/** Highest column top (cells above the shelf) the tube still clears. */
export const MAX_STACK = 7;
const TUBE_MOUTH_Y = SHELF_Y - 7.5 * CELL;
// source: questInstanceLocation(pc, ..., 5*60, ...) -> instances_schedule_exit_prompt.
export const EXIT_PROMPT_MS = 5 * 60 * 1000;
// source: players/inc_instances.js instances_exit_via_prompt, "no" -> 2*60.
export const PROMPT_AGAIN_MS = 2 * 60 * 1000;
export const STUCK_TEXT = 'Are you stuck? Do you want to leave this place?';
/** Footage: every Mental Block 2 Evaluation board pays +4 currants. */
export const EVAL_CURRANTS = 4;
export const GRADES = Object.freeze(["You've got Brains", 'Normal', 'Adequate']);

/** Test-model jump reach (px): rise, and edge-to-edge gaps for a rise / level / drop. */
export const REACH = Object.freeze({ rise: 100, gapUp: 125, gapFlat: 175, gapDown: 220 });

const B = 'b';
const R = 'r';

/**
 * The two levels. Section x values are relative to the station's ladder
 * (`x0`); heights are in blocks above the shelf. `plan` is the position each
 * block of `queue` goes to in the designer's solving run.
 */
export const LEVELS = Object.freeze({
  mb1: Object.freeze({
    title: 'Mental Block',
    W: 5360,
    spawnX: 150,
    intro: { kind: 'block_drop', x: 470 },
    signs: [{ kind: 'caution', x: 2050 }],
    sections: [
      {
        x0: 880,
        positions: [190, 350],
        tubeStart: 0,
        queue: 'bbb',
        cliff: { dx: 390, h: 3, plateau: 240 },
        buttons: { reset: 55, move: 125, drop: 190 },
        board: 300,
        quoins: [{ dx: 190, h: 3.4, type: 'xp' }, { dx: 520, h: 3.6, type: 'currants' }],
        plan: [0, 1, 1],
      },
      {
        x0: 2380,
        positions: [150, 300, 470],
        tubeStart: 0,
        queue: 'bbbr',
        slabs: [{ x1: 240, x2: 360, h: 2 }],
        cliff: { dx: 510, h: 4, plateau: 280 },
        buttons: { reset: 60, move: 150, drop: 230 },
        board: 410,
        quoins: [{ dx: 150, h: 3.3, type: 'xp' }, { dx: 300, h: 4.4, type: 'xp' }, { dx: 650, h: 4.6, type: 'currants' },
          { dx: 1180, h: 0.8, type: 'currants' }],
        plan: [2, 2, 2, 0],
      },
      {
        x0: 3800,
        positions: [150, 300, 450, 600],
        tubeStart: 0,
        queue: 'bbbrbbr',
        slabs: [{ x1: 410, x2: 490, h: 2 }],
        solids: [{ kind: 'pedestal', x1: 560, x2: 640, h: 1 }],
        cliff: { dx: 640, h: 5, plateau: 300 },
        buttons: { reset: 60, move: 170, drop: 250 },
        board: 540,
        quoins: [{ dx: 300, h: 4.3, type: 'xp' }, { dx: 450, h: 5.2, type: 'xp' }, { dx: 800, h: 5.6, type: 'currants' }],
        plan: [3, 3, 3, 0, 1, 1, 2],
      },
    ],
    // After the last ledge: a drop past three iMG quoins to the teleporter.
    end: { kind: 'teleporter', padX: 5060, ledgeH: 2.4 },
  }),
  mb2: Object.freeze({
    title: 'Mental Block 2',
    W: 5960,
    spawnX: 150,
    intro: { kind: 'facts', x: 480 },
    signs: [],
    sections: [
      {
        x0: 980,
        positions: [150, 450, 740],
        tubeStart: 0,
        queue: 'bbrbr',
        solids: [
          { kind: 'tower', x1: 230, x2: 294, h: 2, ladder: true },
          { kind: 'tower', x1: 554, x2: 618, h: 2, ladder: true },
        ],
        cliff: { dx: 780, h: 4, plateau: 340 },
        buttons: { reset: 60, move: 200, drop: 280 },
        board: 640,
        quoins: [{ dx: 420, h: 4.2, type: 'xp' }, { dx: 480, h: 4.2, type: 'xp' }],
        plan: [2, 2, 0, 2, 1],
      },
      {
        x0: 2650,
        positions: [150, 300, 480, 760],
        tubeStart: 0,
        queue: 'bbrbbrrbb',
        solids: [{ kind: 'tower', x1: 520, x2: 584, h: 3, ladder: true }],
        cliff: { dx: 800, h: 4, plateau: 340 },
        buttons: { reset: 60, move: 200, drop: 280 },
        board: 710,
        quoins: [{ dx: 150, h: 4.3, type: 'xp' }],
        plan: [3, 3, 0, 3, 2, 1, 1, 2, 2],
      },
      {
        x0: 4380,
        positions: [260, 660, 810, 960],
        tubeStart: 1,
        queue: 'rbbbrbbr',
        slabs: [{ x1: 330, x2: 470, h: 3 }],
        solids: [
          { kind: 'pedestal', x1: 140, x2: 200, h: 1 },
          { kind: 'tower', x1: 480, x2: 544, h: 3, ladder: true },
        ],
        cliff: { dx: 1000, h: 4, plateau: 560 },
        buttons: { reset: 60, move: 200, drop: 290 },
        board: 880,
        quoins: [{ dx: 660, h: 6, type: 'xp' }, { dx: 1420, h: 4.9, type: 'xp' }],
        plan: [3, 2, 2, 1, 3, 0, 0, 3],
      },
    ],
    end: { kind: 'door', dx: 400 },
  }),
});

const yAt = (h) => SHELF_Y - h * CELL;

/* ------------------------------------------------------------------ */
/* Pure model                                                           */
/* ------------------------------------------------------------------ */

/** Drop one block on a column: red crushes the blue run on top, then lands. */
export function dropOnto(stack, color) {
  const out = [...stack];
  let crushed = 0;
  if (color === R) {
    while (out.length && out[out.length - 1] === B) {
      out.pop();
      crushed += 1;
    }
  }
  out.push(color);
  return { stack: out, crushed };
}

/** Absolute geometry of one level (pure; the tests and the room share it). */
export function levelGeometry(stage = 'mb1') {
  const L = LEVELS[stage] || LEVELS.mb1;
  const sections = L.sections.map((s, i) => {
    const x0 = s.x0;
    const cliffX = x0 + s.cliff.dx;
    const cliffTop = yAt(s.cliff.h);
    const plateauEnd = cliffX + s.cliff.plateau;
    const slopeEnd = plateauEnd + Math.round(s.cliff.h * CELL * 1.35);
    const slabs = (s.slabs || []).map((k) => ({ x1: x0 + k.x1, x2: x0 + k.x2, top: yAt(k.h), h: k.h }));
    const solids = (s.solids || []).map((k) => ({ kind: k.kind, x1: x0 + k.x1, x2: x0 + k.x2, top: yAt(k.h), h: k.h, ladder: Boolean(k.ladder) }));
    const positions = s.positions.map((dx) => x0 + dx);
    return {
      i,
      x0,
      positions,
      bases: positions.map((x) => columnBase({ slabs, solids }, x)),
      tubeStart: s.tubeStart,
      queue: [...s.queue],
      plan: [...s.plan],
      slabs,
      solids,
      cliff: { x: cliffX, top: cliffTop, h: s.cliff.h, end: plateauEnd, slopeEnd },
      corridor: { x1: x0 - 34, x2: cliffX },
      buttons: {
        reset: { x: x0 + s.buttons.reset, y: CORR_Y },
        move: { x: x0 + s.buttons.move, y: CORR_Y },
        drop: { x: x0 + s.buttons.drop, y: CORR_Y },
      },
      board: { x: x0 + s.board, y: CORR_Y },
      quoins: (s.quoins || []).map((q) => ({ x: x0 + q.dx, y: yAt(q.h), type: q.type })),
    };
  });
  const last = sections[sections.length - 1];
  const end = { ...L.end };
  if (end.kind === 'teleporter') {
    end.edge = last.cliff.end;
    end.ledgeY = SHELF_Y - end.ledgeH * CELL;
    // Three iMG quoins down the drop, on the arc of a walk off the edge
    // (4.4 px a frame across, gravity 0.42).
    const from = last.cliff.h;
    end.quoins = [from - 1, from - 2.4, from - 3.8].map((h) => {
      const t = Math.sqrt(((from - h) * CELL) / 0.21);
      return { x: Math.round(end.edge + 4.4 * t), y: yAt(h), type: 'xp' };
    });
  } else {
    end.x = last.cliff.x + end.dx;
    end.y = last.cliff.top;
  }
  return { stage: L === LEVELS.mb2 ? 'mb2' : 'mb1', title: L.title, W: L.W, H, spawn: { x: L.spawnX, y: SHELF_Y }, intro: L.intro, signs: L.signs, sections, end };
}

/** Where a block lands at x before any blocks: a slab or pedestal top, else the shelf. */
export function columnBase(sec, x) {
  let top = SHELF_Y;
  for (const k of [...sec.slabs, ...sec.solids.filter((s) => s.kind === 'pedestal')]) {
    if (x >= k.x1 && x <= k.x2) top = Math.min(top, k.top);
  }
  return top;
}

/** Column top y for a stack at position p. */
export function columnTop(sec, p, stack) {
  return sec.bases[p] - stack.length * CELL;
}

/** Static walk lines of a level. */
export function staticPlatforms(geo) {
  const out = [];
  const add = (id, x1, y1, x2, y2 = y1) => out.push({ id: `mb_${id}`, x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), style: 'invisible' });
  let groundStart = 0;
  geo.sections.forEach((s, i) => {
    add(`ground${i}`, groundStart, SHELF_Y, s.x0 - 34);
    add(`shelf${i}`, s.x0 - 6, SHELF_Y, s.cliff.x);
    add(`corr${i}`, s.corridor.x1, CORR_Y, s.corridor.x2);
    add(`plateau${i}`, s.cliff.x, s.cliff.top, s.cliff.end);
    for (const [k, slab] of s.slabs.entries()) add(`slab${i}_${k}`, slab.x1, slab.top, slab.x2);
    for (const [k, so] of s.solids.entries()) add(`solid${i}_${k}`, so.x1, so.top, so.ladder ? so.x2 + 30 : so.x2);
    const lastOne = i === geo.sections.length - 1;
    if (!lastOne) {
      add(`slope${i}`, s.cliff.end, s.cliff.top, s.cliff.slopeEnd, SHELF_Y);
      groundStart = s.cliff.slopeEnd;
    } else if (geo.end.kind === 'teleporter') {
      add('endfloor', s.cliff.end, SHELF_Y, geo.W);
      add('endledge', geo.end.padX - 70, geo.end.ledgeY, geo.end.padX + 70);
    } else {
      add('endplateau', s.cliff.end, s.cliff.top, geo.W);
    }
  });
  return out;
}

/** Ladders: one down into each corridor, one on the far side of every tower. */
export function levelLadders(geo) {
  const out = [];
  for (const s of geo.sections) {
    // The rails stand a little above the walk line so the climb ends on top of it.
    out.push({ x: s.x0, yTop: SHELF_Y - 12, yBot: CORR_Y, section: s.i, kind: 'corridor' });
    for (const so of s.solids) if (so.ladder) out.push({ x: so.x2 + 18, yTop: so.top - 12, yBot: SHELF_Y, section: s.i, kind: 'tower' });
  }
  return out;
}

/** Solid rectangles the avatar cannot walk through (static + the columns). */
export function solidRects(geo, cols = null) {
  const out = [];
  geo.sections.forEach((s, i) => {
    // The ground left of the ladder shaft, down to the corridor floor.
    out.push({ x1: s.x0 - 220, x2: s.x0 - 34, yTop: SHELF_Y, yBot: CORR_Y + 20, kind: 'ground' });
    out.push({ x1: s.cliff.x, x2: s.cliff.x + 60, yTop: s.cliff.top, yBot: CORR_Y + 20, kind: 'cliff' });
    for (const so of s.solids) out.push({ x1: so.x1, x2: so.x2, yTop: so.top, yBot: SHELF_Y, kind: so.kind });
    if (i === geo.sections.length - 1 && geo.end.kind === 'teleporter') {
      out.push({ x1: s.cliff.end - 60, x2: s.cliff.end, yTop: s.cliff.top, yBot: H, kind: 'cliff' });
    }
    const stacks = cols?.[i] || [];
    stacks.forEach((stack, p) => {
      if (!stack.length) return;
      const x = s.positions[p];
      out.push({ x1: x - CELL / 2, x2: x + CELL / 2, yTop: columnTop(s, p, stack), yBot: s.bases[p], kind: 'column', section: i, pos: p });
    });
  });
  return out;
}

/** Walk lines on top of the dropped columns. */
export function columnPlatforms(geo, cols) {
  const out = [];
  geo.sections.forEach((s, i) => {
    (cols?.[i] || []).forEach((stack, p) => {
      if (!stack.length) return;
      const x = s.positions[p];
      const y = columnTop(s, p, stack);
      out.push({ id: `mb_col_${i}_${p}`, x1: x - CELL / 2, y1: y, x2: x + CELL / 2, y2: y, style: 'invisible' });
    });
  });
  return out;
}

/** Columns after dropping `plan[k]` for the first n queue blocks. */
export function columnsAfter(sec, plan, n = plan.length) {
  let cols = sec.positions.map(() => []);
  for (let k = 0; k < Math.min(n, plan.length, sec.queue.length); k++) {
    const p = plan[k];
    cols = cols.map((c, j) => (j === p ? dropOnto(c, sec.queue[k]).stack : c));
  }
  return cols;
}

/**
 * Can the avatar get from the station's shelf (left end) to its ledge?
 * Surfaces are tops (x1, x2, y); a move climbs one rise over a short gap,
 * walks or hops a level gap, or drops down, and never passes a wall taller
 * than both ends. Ladders join the shelf to tower tops.
 */
export function canClimb(sec, cols) {
  const walls = [];
  for (const so of sec.solids) walls.push({ x1: so.x1, x2: so.x2, top: so.top });
  cols.forEach((stack, p) => {
    if (!stack.length) return;
    const x = sec.positions[p];
    const base = sec.bases[p];
    // A column on a slab floats: it only walls the space above the slab.
    walls.push({ x1: x - CELL / 2, x2: x + CELL / 2, top: columnTop(sec, p, stack), floor: base });
  });
  walls.push({ x1: sec.cliff.x, x2: sec.cliff.x + 60, top: sec.cliff.top });
  // Shelf pieces between grounded walls.
  const grounded = walls.filter((w) => w.floor == null || w.floor >= SHELF_Y).sort((a, b) => a.x1 - b.x1);
  const surfaces = [];
  let x = sec.x0 - 6;
  for (const w of grounded) {
    if (w.x1 > x) surfaces.push({ x1: x, x2: w.x1, y: SHELF_Y, id: `shelf@${Math.round(x)}` });
    x = Math.max(x, w.x2);
  }
  // Slab, tower and pedestal tops, less what columns standing on them cover
  // (a sliver narrower than the avatar is no foothold).
  const covers = cols.map((stack, p) => (stack.length ? { x1: sec.positions[p] - CELL / 2, x2: sec.positions[p] + CELL / 2, base: sec.bases[p] } : null)).filter(Boolean);
  const pieces = (x1, x2, y) => {
    let out = [[x1, x2]];
    for (const c of covers) {
      if (Math.abs(c.base - y) > 1) continue;
      out = out.flatMap(([a, b]) => (c.x2 <= a || c.x1 >= b ? [[a, b]] : [[a, c.x1], [c.x2, b]]));
    }
    return out.filter(([a, b]) => b - a >= 24);
  };
  for (const so of sec.solids) {
    for (const [a, b] of pieces(so.x1, so.ladder ? so.x2 + 30 : so.x2, so.top)) {
      surfaces.push({ x1: a, x2: b, y: so.top, id: `${so.kind}@${a}`, ladderX: so.ladder && b >= so.x2 ? so.x2 + 18 : null });
    }
  }
  for (const sl of sec.slabs) for (const [a, b] of pieces(sl.x1, sl.x2, sl.top)) surfaces.push({ x1: a, x2: b, y: sl.top, id: `slab@${a}` });
  cols.forEach((stack, p) => {
    if (!stack.length) return;
    const cx = sec.positions[p];
    surfaces.push({ x1: cx - CELL / 2, x2: cx + CELL / 2, y: columnTop(sec, p, stack), id: `col${p}` });
  });
  const goal = { x1: sec.cliff.x, x2: sec.cliff.end, y: sec.cliff.top, id: 'ledge' };
  surfaces.push(goal);
  const gap = (a, b) => Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
  const blocked = (a, b) => {
    const lo = Math.min(a.x2, b.x2);
    const hi = Math.max(a.x1, b.x1);
    const ceiling = Math.min(a.y, b.y); // the higher of the two (smaller y)
    return walls.some((w) => w.x1 < hi && w.x2 > lo && w.top < ceiling - 2 && !(w.x1 <= a.x1 && w.x2 >= a.x2) && !(w.x1 <= b.x1 && w.x2 >= b.x2));
  };
  const link = (a, b) => {
    if (a === b) return false;
    const rise = a.y - b.y;
    const g = gap(a, b);
    if (blocked(a, b)) return false;
    if (rise > 2) return rise <= REACH.rise && g <= REACH.gapUp;
    if (rise >= -2) return g <= REACH.gapFlat;
    return g <= REACH.gapDown;
  };
  const start = surfaces[0];
  const seen = new Set([start]);
  const todo = [start];
  while (todo.length) {
    const a = todo.pop();
    if (a === goal) return true;
    for (const b of surfaces) {
      if (seen.has(b)) continue;
      let ok = link(a, b);
      // Ladders: the shelf piece holding a tower ladder's foot reaches its top.
      if (!ok && b.ladderX != null && a.y === SHELF_Y && b.ladderX >= a.x1 - 2 && b.ladderX <= a.x2 + 30) ok = true;
      if (ok) {
        seen.add(b);
        todo.push(b);
      }
    }
  }
  return false;
}

/** Every drop plan (a prefix of the queue, any positions) that reaches the ledge. */
export function solvingPlans(sec, { limit = Infinity } = {}) {
  const n = sec.positions.length;
  const out = [];
  const walk = (plan, cols) => {
    if (out.length >= limit) return;
    if (canClimb(sec, cols)) out.push([...plan]);
    if (plan.length >= sec.queue.length) return;
    const color = sec.queue[plan.length];
    for (let p = 0; p < n; p++) {
      const next = cols.map((c, j) => (j === p ? dropOnto(c, color).stack : c));
      if (sec.bases[p] - next[p].length * CELL < yAt(MAX_STACK)) continue;
      plan.push(p);
      walk(plan, next);
      plan.pop();
    }
  };
  walk([], sec.positions.map(() => []));
  return out;
}

/** Tube moves (next position, wrapping) to go from one stop to another. */
export function movesBetween(from, to, n) {
  return ((to - from) % n + n) % n;
}

/** Evaluation board grade (Mental Block 2) from the resets used at a station. */
export function gradeFor(resets) {
  if (resets <= 0) return GRADES[0];
  if (resets === 1) return GRADES[1];
  return GRADES[2];
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

const BLOCK_COLORS = {
  b: { fill: 0x86e3f6, top: 0xc9f5ff, edge: 0x4fb9d6, glow: 0x9feeff },
  r: { fill: 0xe0484d, top: 0xf58a8a, edge: 0xa82a30, glow: 0xff7f7f },
};

/** A glowing translucent cube, bottom-centre at (0, 0). */
function drawBlock(g, color, size = CELL) {
  const c = BLOCK_COLORS[color] || BLOCK_COLORS.b;
  const w = size - 4;
  const half = w / 2;
  const top = Math.round(size * 0.16);
  g.ellipse(0, -1, half + 8, 7).fill({ color: c.glow, alpha: 0.18 });
  g.roundRect(-half, -w + top / 2, w, w - top / 2, 5).fill({ color: c.fill, alpha: 0.9 });
  g.roundRect(-half, -w, w, top + 2, 5).fill({ color: c.top, alpha: 0.95 });
  g.roundRect(-half + 5, -w + top + 5, 7, w - top - 14, 3).fill({ color: 0xffffff, alpha: 0.22 });
  g.roundRect(-half, -w, w, w, 5).stroke({ width: 1.5, color: c.edge, alpha: 0.7 });
}

/** The perforated block-dropping tube, its mouth at (0, 0). */
function drawTube(g, len = 150) {
  g.roundRect(-30, -len + 4, 64, len, 10).fill({ color: 0x000000, alpha: 0.25 });
  g.moveTo(-26, -len);
  g.lineTo(26, -len);
  g.lineTo(22, -len * 0.45);
  g.lineTo(32, -6);
  g.lineTo(-32, -6);
  g.lineTo(-22, -len * 0.45);
  g.closePath();
  g.fill(0x8f9294);
  g.rect(-20, -len, 9, len - 10).fill({ color: 0xc3c6c8, alpha: 0.7 });
  const holes = [[-8, 0.15, 7], [9, 0.22, 5], [-12, 0.34, 5], [6, 0.4, 8], [-4, 0.55, 6], [13, 0.6, 4], [-14, 0.7, 4], [4, 0.78, 6], [-6, 0.88, 4], [12, 0.9, 5]];
  for (const [hx, at, r] of holes) {
    g.ellipse(hx, -len + at * len, r, r * 1.1).fill({ color: 0x2b2d2f, alpha: 0.9 });
  }
  g.ellipse(0, -6, 33, 9).fill(0x6e7173);
  g.ellipse(0, -5, 27, 6).fill(0x1d1f20);
}

/** A grey down arrow (a tube stop), its tip at (0, 0). */
function drawArrow(g) {
  g.rect(-9, -64, 18, 34);
  g.moveTo(-26, -32);
  g.lineTo(26, -32);
  g.lineTo(0, 0);
  g.closePath();
  g.fill({ color: 0xb5b8ba, alpha: 0.55 });
}

/** Rounded billboard on two legs; returns { c, screen, w, h }. */
function billboard(PIXI, x, y, w, h, { face = 0x5f7a8c, faceLow = 0x4c6474, frame = 0x1b1d1f } = {}) {
  const c = new PIXI.Container();
  c.x = x;
  c.y = y;
  const g = new PIXI.Graphics();
  g.rect(-w * 0.3 - 6, -14, 12, 14);
  g.rect(w * 0.3 - 6, -14, 12, 14);
  g.roundRect(-w / 2, -h - 14, w, h, 14);
  g.fill(frame);
  g.roundRect(-w / 2 + 9, -h - 5, w - 18, h - 18, 9).fill(faceLow);
  g.roundRect(-w / 2 + 9, -h - 5, w - 18, (h - 18) * 0.55, 9).fill(face);
  c.addChild(g);
  return { c, w, h, top: -h - 14 };
}

function text(kit, PIXI, str, x, y, size, fill = 0xffffff, opts = {}) {
  return kit.label(PIXI, str, x, y, { size, fill, stroke: opts.stroke, wrap: opts.wrap, weight: opts.weight || '800', ax: opts.ax, ay: opts.ay });
}

function terrain(PIXI, geo) {
  const g = new PIXI.Graphics();
  const black = 0x0b0c0d;
  const fillPoly = (pts) => {
    g.poly(pts.flat()).fill(black);
  };
  let groundStart = 0;
  geo.sections.forEach((s, i) => {
    // Ground up to the ladder shaft.
    fillPoly([[groundStart, SHELF_Y], [s.x0 - 34, SHELF_Y], [s.x0 - 34, H], [groundStart, H]]);
    // Corridor: back wall, floor, shelf slab.
    g.rect(s.corridor.x1, SHELF_Y + SHELF_T, s.corridor.x2 - s.corridor.x1, CORR_Y - SHELF_Y - SHELF_T).fill(0x2a2c2e);
    g.rect(s.corridor.x1, CORR_Y - 46, s.corridor.x2 - s.corridor.x1, 3).fill(0x35383a);
    fillPoly([[s.corridor.x1, CORR_Y], [s.corridor.x2, CORR_Y], [s.corridor.x2, H], [s.corridor.x1, H]]);
    g.rect(s.x0 - 6, SHELF_Y, s.cliff.x - s.x0 + 6, SHELF_T).fill(black);
    g.rect(s.x0 - 6, SHELF_Y, s.cliff.x - s.x0 + 6, 3).fill({ color: 0x3d4043, alpha: 0.8 });
    // Towers and pedestals.
    for (const so of s.solids) {
      g.rect(so.x1, so.top, so.x2 - so.x1, SHELF_Y - so.top + 2).fill(black);
    }
    for (const sl of s.slabs) {
      g.roundRect(sl.x1, sl.top, sl.x2 - sl.x1, 22, 5).fill(black);
    }
    // The ledge and the hill down to the next station.
    const lastOne = i === geo.sections.length - 1;
    const pts = [[s.cliff.x, s.cliff.top + 6], [s.cliff.x + 6, s.cliff.top], [s.cliff.end, s.cliff.top]];
    if (!lastOne) pts.push([s.cliff.slopeEnd, SHELF_Y], [s.cliff.slopeEnd, H]);
    else if (geo.end.kind === 'teleporter') pts.push([s.cliff.end, H]);
    else pts.push([geo.W, s.cliff.top], [geo.W, H]);
    pts.push([s.cliff.x, H]);
    fillPoly(pts);
    groundStart = lastOne ? s.cliff.end : s.cliff.slopeEnd;
  });
  if (geo.end.kind === 'teleporter') {
    fillPoly([[geo.end.edge, SHELF_Y], [geo.W, SHELF_Y], [geo.W, H], [geo.end.edge, H]]);
    // A hanging pillar over the drop, and the door ledge.
    g.rect(geo.end.edge + 130, 0, 60, SHELF_Y - 6.2 * CELL);
    g.roundRect(geo.end.padX - 70, geo.end.ledgeY, 140, 22, 4);
    g.fill(black);
  }
  // Grass along the walkable tops (not the shelves).
  const tufts = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 6; d < len - 6; d += 9) {
      const t = d / len;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const hgt = 4 + ((d * 7) % 9);
      g.moveTo(x - 3, y + 1);
      g.lineTo(x + ((d * 3) % 5) - 2, y - hgt);
      g.lineTo(x + 3, y + 1);
    }
  };
  groundStart = 0;
  geo.sections.forEach((s, i) => {
    tufts(groundStart, SHELF_Y, s.x0 - 40, SHELF_Y);
    tufts(s.cliff.x + 4, s.cliff.top, s.cliff.end, s.cliff.top);
    const lastOne = i === geo.sections.length - 1;
    if (!lastOne) {
      tufts(s.cliff.end, s.cliff.top, s.cliff.slopeEnd, SHELF_Y);
      groundStart = s.cliff.slopeEnd;
    } else if (geo.end.kind === 'teleporter') tufts(geo.end.edge, SHELF_Y, geo.W, SHELF_Y);
    else tufts(s.cliff.end, s.cliff.top, geo.W, s.cliff.top);
  });
  g.fill(black);
  return g;
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

export const room = {
  id: ROOM_ID,
  title: 'Mental Block',
  kicker: 'Drop blocks, climb out',
  icon: 'assets/sprites/icons/play_cube.png',
  theme: 'dark',
  // G315: hub 135 'Puzzles' (inc_data_maps_prod.js 1197), the template's hub.
  hubName: 'Puzzles',
  // The 5 * 60 exit delay is a prompt, not a clock (see tick).
  durationMs: 0,
  leaveText: 'Leave before you reach the end? You will have to start over.',
  travelText: 'Find the way out, or use Leave.',

  firstStage(questId) {
    return questId === 'mental_block_2' ? 'mb2' : 'mb1';
  },

  stageLabel(stage) {
    return stage === 'mb2' ? 'Mental Block 2' : 'Mental Block';
  },

  hudTitle(ctx) {
    return ctx.def?.title || (ctx.stage === 'mb2' ? 'Mental Block 2' : 'Mental Block');
  },

  build(ctx, stage) {
    const { PIXI, kit } = ctx;
    const geo = levelGeometry(stage);
    ctx.data.geo = geo;
    const root = kit.sceneRoot(PIXI, geo.W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#3c3e40'], [0.5, '#66696b'], [1, '#8b8e90']], 960, 640));
    const far = root.layer(0.3, 1);
    const hills = new PIXI.Graphics();
    for (let i = 0; i < 14; i++) {
      const x = i * 520;
      hills.moveTo(x - 200, 760);
      hills.quadraticCurveTo(x + 60, 520 + (i % 3) * 50, x + 360, 760);
    }
    hills.fill({ color: 0x2f3133, alpha: 0.35 });
    far.addChild(hills);
    const world = root.layer(1, 3);
    world.addChild(terrain(PIXI, geo));
    const lg = new PIXI.Graphics();
    for (const l of levelLadders(geo)) kit.drawLadder(lg, l, { rail: 0x1e2022, rung: 0x34373a, half: 14 });
    world.addChild(lg);
    ctx.data.world = world;
    return {
      label: geo.title,
      width: geo.W,
      height: H,
      background: root,
      platforms: staticPlatforms(geo),
      walls: levelLadders(geo).map((l) => kit.ladder(l.x, l.yTop, l.yBot)),
      spawn: qaStart(ctx, geo) >= 0 ? { x: geo.sections[qaStart(ctx, geo)].x0 - 110, y: SHELF_Y } : geo.spawn,
    };
  },

  enter(ctx) {
    const geo = ctx.data.geo;
    const { PIXI } = ctx;
    // A lower camera anchor (y_cam_offset 240): the shelf and its towers stay in view.
    if (ctx.engine.street) {
      const phys = ctx.engine.street.physics || {};
      ctx.engine.street.physics = { ...phys, setting: { ...(phys.setting || {}), y_cam_offset: 240 } };
    }
    ctx.data.phase = 'play';
    ctx.data.startedAt = Date.now();
    ctx.data.promptAt = Date.now() + EXIT_PROMPT_MS;
    ctx.data.prevX = geo.spawn.x;
    ctx.data.state = geo.sections.map((s) => ({
      cols: s.positions.map(() => []),
      next: 0,
      tube: s.tubeStart,
      drops: 0,
      resets: 0,
      dropsSinceReset: 0,
      busy: false,
      cleared: false,
      grade: '',
    }));
    // QA: ?mbstation=N starts at station N with the ones before it cleared.
    for (let k = 0; k < qaStart(ctx, geo); k++) ctx.data.state[k].cleared = true;
    ctx.data.columnTargets = {};
    ctx.data.outTex = textureFromUrl(`${ART}wall_button_lockOut.png`);
    ctx.data.inTex = textureFromUrl(`${ART}wall_button_lockIn.png`);
    ctx.data.view = geo.sections.map((s) => makeStationView(ctx, s));
    ctx.data.buttons = [];
    geo.sections.forEach((s) => {
      for (const kind of ['reset', 'move', 'drop']) ctx.data.buttons.push(makeButton(ctx, s.i, kind, s.buttons[kind]));
    });
    makeIntro(ctx, geo.intro);
    for (const sign of geo.signs) makeCaution(ctx, sign.x);
    ctx.data.evalBoards = geo.stage === 'mb2' ? geo.sections.map((s) => makeEvalBoard(ctx, s)) : [];
    makeEnd(ctx);
    const quoinDefs = [...geo.sections.flatMap((s) => s.quoins), ...(geo.end.quoins || [])];
    ctx.data.quoins = spawnQuoins(ctx, quoinDefs);
    geo.sections.forEach((s) => redrawStation(ctx, s.i));
  },

  tick(ctx) {
    const p = ctx.player;
    const geo = ctx.data.geo;
    if (!p || !geo || !ctx.data.state) return;
    const now = Date.now();
    if (ctx.data.phase === 'beam') {
      stepBeam(ctx);
      return;
    }
    const cols = ctx.data.state.map((st) => st.cols);
    catchTunnel(ctx, p, geo, cols);
    pushOutOfSolids(p, ctx.data.prevX, solidRects(geo, cols));
    ctx.data.prevX = p.x;
    ctx.data.prevY = p.y;
    // The corridor has a ceiling (the shelf); only the ladder shaft opens up.
    for (const s of geo.sections) {
      if (p.x < s.x0 + 26 || p.x > s.corridor.x2) continue;
      const ceil = SHELF_Y + SHELF_T;
      if (p.y > ceil + 4 && p.y - BODY_H < ceil) {
        p.y = ceil + BODY_H;
        if (p.vy < 0) p.vy = 0;
      }
    }
    for (const st of ctx.data.state) if (st.fall) stepFall(ctx, st);
    animateViews(ctx, now);
    takeQuoins(ctx, ctx.data.quoins || []);
    checkLedges(ctx);
    checkEnd(ctx);
    maybePromptStuck(ctx, now);
  },

  physics(ctx) {
    if (ctx.data.phase === 'beam') return { speed: 0, jump: 0, gravity: 0 };
    // Like the source's refused boosts: no triple jump past a block puzzle.
    return { tripleJump: 0 };
  },

  verbs(ctx, target) {
    if (target.mbButton) {
      const b = target.mbButton;
      const tips = { reset: 'Clear the blocks and start this station over', move: 'Move the block-dropping tube', drop: 'Drop a block from the tube' };
      const labels = { reset: 'Reset', move: 'Move tube', drop: 'Drop block' };
      return [{ id: 'press', label: labels[b.kind], enabled: true, tooltip: tips[b.kind], durationMs: 0 }];
    }
    if (target.mbColumn) return [{ id: 'reset', label: 'Reset', enabled: true, tooltip: 'Clear the blocks and start this station over', durationMs: 0 }];
    if (target.mbDemo) return [{ id: 'press', label: 'Press', enabled: true, tooltip: 'Show me', durationMs: 0 }];
    if (target === ctx.data.endTarget) {
      return geo(ctx).end.kind === 'door'
        ? [{ id: 'enter', label: 'Enter', enabled: true, tooltip: 'Leave through the door', durationMs: 0 }]
        : [{ id: 'enter', label: 'Teleport', enabled: true, tooltip: 'Step into the beam', durationMs: 0 }];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.mbButton && verbId === 'press') {
      pressButton(ctx, target.mbButton);
      return true;
    }
    if (target.mbColumn && verbId === 'reset') {
      resetStation(ctx, target.mbColumn.section);
      return true;
    }
    if (target.mbDemo && verbId === 'press') {
      target.mbDemo.press();
      return true;
    }
    if (target === ctx.data.endTarget && verbId === 'enter') {
      useExit(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const geo = ctx.data.geo;
    const st = ctx.data.state || [];
    if (!geo || !st.length) return { text: 'Drop blocks from the tube to build a way up to the ledge.', stats: [] };
    const cleared = st.filter((s) => s.cleared).length;
    const i = currentSection(ctx);
    const left = i >= 0 ? geo.sections[i].queue.length - st[i].next : 0;
    let text = 'Drop blocks from the tube to build a way up to the ledge.';
    if (ctx.data.phase === 'done') text = 'You done did it!';
    else if (cleared >= st.length) text = geo.end.kind === 'door' ? 'Go through the door.' : 'Drop down and step into the teleporter.';
    else if (i >= 0 && st[i].next >= geo.sections[i].queue.length && !st[i].cleared) text = 'Out of blocks? Press Reset to start this station over.';
    const stats = [['ledges', `${cleared}/${st.length}`]];
    if (i >= 0) stats.push(['blocks left', left]);
    return { text, stats };
  },

  onLeave() {
    return { leaveFlag: 'leave' };
  },

  publish(ctx) {
    const st = ctx.data.state || [];
    if (!ctx.data.geo) return;
    ctx.setData('mbStage', ctx.data.geo?.stage || '');
    ctx.setData('mbPhase', ctx.data.phase || '');
    ctx.setData('mbSection', String(currentSection(ctx)));
    ctx.setData('mbCols', st.map((s) => s.cols.map((c) => c.join('') || '-').join('|')).join(' / '));
    ctx.setData('mbTubes', st.map((s) => s.tube).join(','));
    ctx.setData('mbLeft', st.map((s, i) => ctx.data.geo.sections[i].queue.length - s.next).join(','));
    ctx.setData('mbCleared', st.map((s) => (s.cleared ? 1 : 0)).join(','));
    ctx.setData('mbGrades', st.map((s) => s.grade || '-').join('|'));
    ctx.setData('mbResets', st.map((s) => s.resets).join(','));
    ctx.setData('mbQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
  },

  async autoplay(ctx, mode = 'solve') {
    const geo = ctx.data.geo;
    await ctx.wait(500);
    const go = async (x, y, ms = 350) => {
      ctx.place(x, y);
      await ctx.wait(ms);
    };
    for (const s of geo.sections) {
      const st = ctx.data.state[s.i];
      const plan = mode === 'wrong' && s.i === 0 ? [...s.plan].reverse() : s.plan;
      await go(s.buttons.move.x, CORR_Y, 300);
      for (let k = 0; k < plan.length; k++) {
        const moves = movesBetween(st.tube, plan[k], s.positions.length);
        for (let m = 0; m < moves; m++) {
          await go(s.buttons.move.x, CORR_Y, 120);
          pressButton(ctx, { section: s.i, kind: 'move' });
        }
        await go(s.buttons.drop.x, CORR_Y, 120);
        pressButton(ctx, { section: s.i, kind: 'drop' });
        while (st.busy) await ctx.wait(80);
      }
      if (mode === 'wrong' && s.i === 0) {
        ctx.setData('mbAutoplay', canClimb(s, st.cols) ? 'wrong-climbable' : 'wrong-stuck');
        return 'wrong';
      }
      // Climb the steps: every column top left to right, then the ledge.
      const tops = st.cols.map((c, p) => ({ x: s.positions[p], y: c.length ? columnTop(s, p, c) : null })).filter((t) => t.y != null);
      for (const t of tops) await go(t.x, t.y, 260);
      await go(s.cliff.x + 60, s.cliff.top, 700);
      if (mode === 'one') return 'one';
    }
    for (const q of ctx.data.quoins) if (!q.taken && q.type === 'xp' && geo.end.quoins?.some((e) => e.x === q.x && e.y === q.y)) await go(q.x, q.y + 30, 200);
    if (geo.end.kind === 'teleporter') {
      await go(geo.end.padX, SHELF_Y, 600);
    } else {
      await go(geo.end.x - 20, geo.end.y, 400);
      useExit(ctx);
    }
    for (let i = 0; i < 60 && ctx.data.phase !== 'done'; i++) await ctx.wait(100);
    return ctx.data.phase === 'done' ? 'exited' : 'stuck';
  },
};

const geo = (ctx) => ctx.data.geo;

/** QA start station (0-based) from ?mbstation=N, or -1. */
function qaStart(ctx, g) {
  const n = Number(ctx.param?.('mbstation'));
  return Number.isInteger(n) && n >= 1 && n <= g.sections.length ? n - 1 : -1;
}

/**
 * A long fall moves the avatar more than the ground snap (16 px) in one
 * step, so it can drop through a walk line (the shelf over the corridor
 * most of all). Put it back on any line it crossed going down.
 */
function catchTunnel(ctx, p, g, cols) {
  const prevY = ctx.data.prevY;
  if (prevY == null || p.y <= prevY || (p.vy ?? 0) < 0) return;
  if (!ctx.data.ladders) ctx.data.ladders = levelLadders(g);
  if (ctx.data.ladders.some((l) => Math.abs(p.x - l.x) < 30 && p.y >= l.yTop - 4 && p.y <= l.yBot + 4)) return;
  if (!ctx.data.staticLines) ctx.data.staticLines = staticPlatforms(g).filter((l) => l.y1 === l.y2);
  let best = null;
  for (const l of [...ctx.data.staticLines, ...columnPlatforms(g, cols)]) {
    if (p.x < l.x1 || p.x > l.x2) continue;
    if (prevY <= l.y1 + 2 && p.y > l.y1 + 2 && (best == null || l.y1 < best)) best = l.y1;
  }
  if (best == null) return;
  p.y = best;
  p.vy = 0;
}

function currentSection(ctx) {
  const g = ctx.data.geo;
  const p = ctx.player;
  if (!g || !p) return -1;
  for (const s of g.sections) if (p.x >= s.x0 - 400 && p.x <= s.cliff.x + 40) return s.i;
  return -1;
}

/* ------------------------------------------------------------------ */
/* Stations                                                             */
/* ------------------------------------------------------------------ */

function makeStationView(ctx, s) {
  const { PIXI } = ctx;
  const v = { arrows: [], blocks: s.positions.map(() => []), shards: [] };
  v.layer = ctx.add(new PIXI.Container(), 12);
  v.glow = new PIXI.Graphics();
  v.glow.ellipse(0, 0, 46, 8).fill({ color: 0xd8f6ff, alpha: 0.18 });
  v.glow.ellipse(0, 0, 26, 4).fill({ color: 0xffffff, alpha: 0.22 });
  v.layer.addChild(v.glow);
  s.positions.forEach((x) => {
    const a = new PIXI.Graphics();
    drawArrow(a);
    a.x = x;
    a.y = TUBE_MOUTH_Y - 18;
    v.layer.addChild(a);
    v.arrows.push(a);
  });
  v.blockLayer = new PIXI.Container();
  v.layer.addChild(v.blockLayer);
  v.tube = new PIXI.Graphics();
  drawTube(v.tube, 150);
  v.tube.x = s.positions[s.tubeStart];
  v.tube.y = TUBE_MOUTH_Y;
  v.tubeX = v.tube.x;
  v.layer.addChild(v.tube);
  // The Limit board: count, queue strip, and a little map of the station.
  v.board = ctx.add(new PIXI.Container(), 11);
  v.board.x = s.board.x;
  v.board.y = s.board.y;
  const frame = new PIXI.Graphics();
  frame.roundRect(-84, -112, 168, 104, 8).fill(0x15171a);
  frame.roundRect(-84, -112, 168, 104, 8).stroke({ width: 2, color: 0x4b5156, alpha: 1 });
  v.board.addChild(frame);
  v.board.addChild(text(ctx.kit, PIXI, 'Limit', -40, -98, 13));
  v.count = text(ctx.kit, PIXI, '0', 12, -98, 19);
  v.board.addChild(v.count);
  v.strip = new PIXI.Graphics();
  v.board.addChild(v.strip);
  v.map = new PIXI.Graphics();
  v.board.addChild(v.map);
  return v;
}

function makeButton(ctx, section, kind, at) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  if (kind === 'reset') c.addChild(kit.label(PIXI, 'Reset', 0, -46, { size: 12, fill: 0xffffff, stroke: { color: 0x111111, width: 3 } }));
  const post = new PIXI.Graphics();
  post.roundRect(-5, -20, 10, 20, 3).fill(0x1a1c1e);
  c.addChild(post);
  const btn = new PIXI.Sprite(ctx.data.outTex);
  btn.anchor.set(0.5, 0.5);
  btn.y = -24;
  btn.scale.set(0.9);
  c.addChild(btn);
  c.x = at.x;
  c.y = at.y;
  const labels = { reset: 'Reset', move: 'Tube Mover', drop: 'Block Dropper' };
  const subs = { reset: 'Start this station over', move: 'Moves the block-dropping tube', drop: 'Drops a block from the tube' };
  const target = ctx.register({ classId: 'mental_block_button', label: labels[kind], subtitle: subs[kind], sprite: c, mbButton: { section, kind } });
  return { section, kind, target, btn, container: c };
}

function flashButton(ctx, section, kind) {
  const b = ctx.data.buttons.find((x) => x.section === section && x.kind === kind);
  if (!b) return;
  b.btn.texture = ctx.data.inTex;
  setTimeout(() => {
    if (b.btn && !b.btn.destroyed) b.btn.texture = ctx.data.outTex;
  }, 260);
}

function pressButton(ctx, { section, kind }) {
  const s = ctx.data.geo.sections[section];
  const st = ctx.data.state[section];
  if (!s || !st) return;
  const at = s.buttons[kind];
  if (kind !== 'reset' && !ctx.near(at.x, at.y, 110)) {
    ctx.setData('mbLastPress', `${section}:${kind}:far`);
    ctx.toast('Climb down to the buttons first.', 1800);
    return;
  }
  ctx.setData('mbLastPress', `${section}:${kind}`);
  flashButton(ctx, section, kind);
  if (kind === 'reset') {
    resetStation(ctx, section);
    return;
  }
  if (kind === 'move') {
    st.tube = (st.tube + 1) % s.positions.length;
    ctx.sound('BUTTON_2', { volume: 0.5 });
    redrawStation(ctx, section);
    return;
  }
  // Drop (one block in the air at a time; the tube may move meanwhile).
  if (st.busy) {
    ctx.sound('CLICK_FAILURE', { volume: 0.3 });
    return;
  }
  if (st.next >= s.queue.length) {
    ctx.sound('CLICK_FAILURE', { volume: 0.4 });
    ctx.floatText(at.x, at.y - 80, 'No blocks left', '#ffd7a0');
    return;
  }
  const color = s.queue[st.next];
  const p = st.tube;
  const { stack, crushed } = dropOnto(st.cols[p], color);
  if (s.bases[p] - stack.length * CELL < yAt(MAX_STACK)) {
    ctx.sound('CLICK_FAILURE', { volume: 0.4 });
    ctx.floatText(at.x, at.y - 80, 'The tube is blocked', '#ffd7a0');
    return;
  }
  st.next += 1;
  st.drops += 1;
  st.dropsSinceReset += 1;
  st.busy = true;
  ctx.sound('BUTTON_2', { volume: 0.5 });
  startFall(ctx, section, p, color, stack, crushed);
  redrawStation(ctx, section, { keepColumn: p });
}

function resetStation(ctx, section) {
  const s = ctx.data.geo.sections[section];
  const st = ctx.data.state[section];
  if (!s || !st) return;
  if (st.fall) finishFall(ctx, st);
  if (st.dropsSinceReset > 0) st.resets += 1;
  st.dropsSinceReset = 0;
  st.cols = s.positions.map(() => []);
  st.next = 0;
  st.tube = s.tubeStart;
  st.busy = false;
  ctx.sound('CLICK_SUCCESS', { volume: 0.45 });
  const v = ctx.data.view[section];
  v.blocks.forEach((list) => list.forEach((b) => shatter(ctx, v, b)));
  v.blocks = s.positions.map(() => []);
  syncPlatforms(ctx);
  redrawStation(ctx, section);
}

function startFall(ctx, section, p, color, stack, crushed) {
  const s = ctx.data.geo.sections[section];
  const st = ctx.data.state[section];
  const v = ctx.data.view[section];
  const g = new ctx.PIXI.Graphics();
  drawBlock(g, color);
  g.x = s.positions[p];
  g.y = TUBE_MOUTH_Y + CELL - 6;
  v.blockLayer.addChild(g);
  const before = st.cols[p].length;
  st.fall = {
    section,
    p,
    color,
    sprite: g,
    // Time-based, so a slow frame never stalls a drop.
    y0: g.y,
    v0: 0,
    t0: Date.now(),
    // First stop: the current top; a red then crushes the blue run and falls on.
    stopY: s.bases[p] - before * CELL,
    finalY: s.bases[p] - (stack.length - 1) * CELL,
    crushed,
    stack,
  };
}

/** Block gravity in px per ms² (about 1.1 px a frame², a quick drop). */
const FALL_G = 0.004;

function stepFall(ctx, st) {
  const f = st.fall;
  const t = Date.now() - f.t0;
  f.sprite.y = Math.min(f.y0 + f.v0 * t + 0.5 * FALL_G * t * t, f.stopY);
  if (f.sprite.y < f.stopY) return;
  if (f.crushed && f.stopY !== f.finalY) {
    // Crush the blue run under the red block.
    const v = ctx.data.view[f.section];
    const list = v.blocks[f.p];
    for (let n = 0; n < f.crushed; n++) {
      const b = list.pop();
      if (b) shatter(ctx, v, b);
    }
    ctx.sound('CRUSHER_IMPACT', { volume: 0.5 });
    f.v0 = 0.35 * (f.v0 + FALL_G * t);
    f.y0 = f.stopY;
    f.t0 = Date.now();
    f.stopY = f.finalY;
    return;
  }
  finishFall(ctx, st);
}

function finishFall(ctx, st) {
  const f = st.fall;
  if (!f) return;
  st.fall = null;
  const v = ctx.data.view[f.section];
  if (f.crushed && v.blocks[f.p].length > f.stack.length - 1) {
    const list = v.blocks[f.p];
    while (list.length > f.stack.length - 1) shatter(ctx, v, list.pop());
  }
  f.sprite.y = f.finalY;
  v.blocks[f.p].push(f.sprite);
  st.cols[f.p] = f.stack;
  st.busy = false;
  ctx.sound('ITEM_DROP', { volume: 0.45 });
  syncPlatforms(ctx);
  redrawStation(ctx, f.section);
}

function shatter(ctx, v, sprite) {
  if (!sprite || sprite.destroyed) return;
  sprite.shatterAt = Date.now();
  v.shards.push(sprite);
}

function syncPlatforms(ctx) {
  const list = ctx.engine.platforms;
  const cols = ctx.data.state.map((st) => st.cols);
  if (list) {
    const keep = list.filter((p) => !String(p.id).startsWith('mb_col_'));
    list.length = 0;
    list.push(...keep, ...columnPlatforms(ctx.data.geo, cols));
  }
  syncColumnTargets(ctx);
}

/** Every standing column answers "Reset" (a way out of a self-made pit). */
function syncColumnTargets(ctx) {
  const g = ctx.data.geo;
  const map = ctx.data.columnTargets;
  g.sections.forEach((s, i) => {
    ctx.data.state[i].cols.forEach((stack, p) => {
      const key = `${i}_${p}`;
      const t = map[key];
      if (!stack.length) {
        if (t) {
          ctx.unregister(t);
          if (t.sprite && !t.sprite.destroyed) t.sprite.destroy();
          delete map[key];
        }
        return;
      }
      const top = columnTop(s, p, stack);
      if (t && t.mbColumn.top === top) return;
      if (t) {
        ctx.unregister(t);
        if (t.sprite && !t.sprite.destroyed) t.sprite.destroy();
      }
      const hit = new ctx.PIXI.Graphics();
      hit.rect(-CELL / 2, top - s.bases[p], CELL, s.bases[p] - top).fill({ color: 0xffffff, alpha: 0.001 });
      hit.x = s.positions[p];
      hit.y = s.bases[p];
      map[key] = ctx.register({ classId: 'mental_block_blocks', label: 'Blocks', subtitle: 'Dropped from the tube', sprite: hit, mbColumn: { section: i, pos: p, top } });
    });
  });
}

function redrawStation(ctx, i, opts = {}) {
  const s = ctx.data.geo.sections[i];
  const st = ctx.data.state[i];
  const v = ctx.data.view[i];
  if (!s || !st || !v) return;
  v.tubeX = s.positions[st.tube];
  v.arrows.forEach((a, p) => {
    a.visible = p !== st.tube;
  });
  const shown = st.cols[st.tube];
  v.glow.x = s.positions[st.tube];
  v.glow.y = (opts.keepColumn === st.tube ? s.bases[st.tube] - (st.cols[st.tube].length) * CELL : s.bases[st.tube] - shown.length * CELL) + 2;
  // Limit board.
  const left = s.queue.length - st.next;
  v.count.text = String(left);
  const strip = v.strip;
  strip.clear();
  const rest = s.queue.slice(st.next);
  const perRow = 5;
  const size = 14;
  const rows = Math.ceil(s.queue.length / perRow);
  strip.roundRect(-62, -82, 124, rows * 18 + 6, 4).stroke({ width: 2, color: 0xdfe6ea, alpha: 0.9 });
  rest.forEach((c, k) => {
    const row = Math.floor(k / perRow);
    const col = k % perRow;
    strip.roundRect(-55 + col * 23, -78 + row * 18, size + 4, size, 3).fill(c === R ? 0xe0484d : 0x86e3f6);
  });
  // The station map: shelf, solids, columns and the tube.
  const m = v.map;
  m.clear();
  const x1 = s.x0 - 10;
  const x2 = s.cliff.x + 30;
  const sx = 150 / (x2 - x1);
  const sy = 0.11;
  const mx = (x) => -75 + (x - x1) * sx;
  const my = (y) => -14 - (SHELF_Y - y) * sy;
  m.rect(mx(x1), my(SHELF_Y), 150, 2);
  m.rect(mx(s.cliff.x), my(s.cliff.top), mx(x2) - mx(s.cliff.x), my(SHELF_Y) - my(s.cliff.top));
  for (const so of s.solids) m.rect(mx(so.x1), my(so.top), (so.x2 - so.x1) * sx, my(SHELF_Y) - my(so.top));
  for (const sl of s.slabs) m.rect(mx(sl.x1), my(sl.top), (sl.x2 - sl.x1) * sx, 2);
  m.fill(0x55595d);
  st.cols.forEach((stack, p) => {
    stack.forEach((c, k) => {
      m.rect(mx(s.positions[p]) - 3.5, my(s.bases[p] - (k + 1) * CELL), 7, CELL * sy - 1).fill(c === R ? 0xe0484d : 0x86e3f6);
    });
  });
  s.positions.forEach((x, p) => {
    m.rect(mx(x) - 3, -60, 6, 7).fill(p === st.tube ? 0xd8dcdf : 0x6b6f73);
  });
}

function animateViews(ctx, now) {
  const t = now / 1000;
  ctx.data.view.forEach((v) => {
    v.tube.x += (v.tubeX - v.tube.x) * 0.15;
    v.glow.alpha = 0.7 + Math.sin(t * 3) * 0.25;
    v.shards = v.shards.filter((b) => {
      if (!b || b.destroyed) return false;
      const age = (now - b.shatterAt) / 320;
      if (age >= 1) {
        b.destroy();
        return false;
      }
      b.alpha = 1 - age;
      b.scale.set(1 + age * 0.35);
      return true;
    });
  });
  for (const d of ctx.data.demos || []) d.tick?.(now);
  if (ctx.data.beam) ctx.data.beam.alpha = ctx.data.phase === 'beam' ? 0.75 + Math.sin(t * 9) * 0.2 : 0.18 + Math.sin(t * 2) * 0.08;
}

/* ------------------------------------------------------------------ */
/* Ledges, evaluation, exit                                             */
/* ------------------------------------------------------------------ */

function checkLedges(ctx) {
  const p = ctx.player;
  const g = ctx.data.geo;
  g.sections.forEach((s, i) => {
    const st = ctx.data.state[i];
    if (st.cleared) return;
    if (p.x >= s.cliff.x + 8 && p.x <= s.cliff.end && Math.abs(p.y - s.cliff.top) < 6) {
      st.cleared = true;
      ctx.sound('CLICK_SUCCESS', { volume: 0.5 });
      if (g.stage === 'mb2') showEvaluation(ctx, i);
    }
  });
}

function makeEvalBoard(ctx, s) {
  const { PIXI, kit } = ctx;
  const b = billboard(PIXI, s.cliff.x + 170, s.cliff.top, 200, 110, { face: 0x2c2f33, faceLow: 0x24272a, frame: 0x101113 });
  b.c.addChild(text(kit, PIXI, 'Evaluation', 0, -100, 22, 0xf5e61e));
  const grade = text(kit, PIXI, '', 0, -70, 14);
  const pay = text(kit, PIXI, '', 0, -46, 16);
  b.c.addChild(grade, pay);
  ctx.add(b.c, 8);
  return { grade, pay };
}

function showEvaluation(ctx, i) {
  const st = ctx.data.state[i];
  const s = ctx.data.geo.sections[i];
  st.grade = gradeFor(st.resets);
  const board = ctx.data.evalBoards[i];
  if (board) {
    board.grade.text = st.grade;
    board.pay.text = `+${EVAL_CURRANTS} currants`;
  }
  const pc = ctx.engine.pc;
  if (pc) pc.currants = (Number(pc.currants) || 0) + EVAL_CURRANTS;
  ctx.engine.updateHud?.();
  ctx.floatText(s.cliff.x + 170, s.cliff.top - 140, `+${EVAL_CURRANTS} currants`, '#ffe680');
  ctx.sound('QUOIN_CURRANTS', { volume: 0.45 });
}

function makeEnd(ctx) {
  const { PIXI, kit } = ctx;
  const g = ctx.data.geo;
  const end = g.end;
  if (end.kind === 'teleporter') {
    // Teleporter_Base (550x1058): the pad's foot at y 1020, the top emitter's
    // rim at y ~30; the emitter hangs under the door ledge.
    const sc = (SHELF_Y + 4 - end.ledgeY) / 990;
    const base = new PIXI.Sprite(textureFromUrl(`${ART}Teleporter_Base.png`));
    base.anchor.set(0.5, 1020 / 1058);
    base.scale.set(sc);
    base.x = end.padX;
    base.y = SHELF_Y + 4;
    ctx.add(base, 6);
    const beam = new PIXI.Sprite(textureFromUrl(`${ART}Teleporter_Beam.png`));
    beam.anchor.set(0.5, 1020 / 1058);
    beam.scale.set(sc);
    beam.x = end.padX;
    beam.y = SHELF_Y + 4;
    beam.alpha = 0.2;
    ctx.add(beam, 7);
    ctx.data.beam = beam;
    const door = kit.deco(PIXI, 'door_asset_gray', end.padX, end.ledgeY + 2, { scale: 0.27, tint: 0x9db3d6 });
    ctx.add(door, 5);
    const sign = text(kit, PIXI, 'You done\ndid it!', end.padX - 150, SHELF_Y - 110, 26, 0xf5e61e, { stroke: { color: 0x111111, width: 4 } });
    ctx.add(sign, 9);
    const hit = new PIXI.Graphics();
    hit.rect(-60, -90, 120, 90).fill({ color: 0xffffff, alpha: 0.001 });
    hit.x = end.padX;
    hit.y = SHELF_Y;
    ctx.data.endTarget = ctx.register({ classId: 'mental_block_teleporter', label: 'Teleporter', subtitle: 'The way out', sprite: hit });
  } else {
    const door = kit.deco(PIXI, 'door_asset_gray', end.x, end.y + 4, { scale: 0.28, tint: 0x9db3d6 });
    ctx.add(door, 5);
    const hit = new PIXI.Graphics();
    hit.rect(-50, -150, 100, 150).fill({ color: 0xffffff, alpha: 0.001 });
    hit.x = end.x;
    hit.y = end.y;
    ctx.data.endTarget = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: hit });
  }
}

function checkEnd(ctx) {
  const g = ctx.data.geo;
  const p = ctx.player;
  if (ctx.data.phase !== 'play' || g.end.kind !== 'teleporter') return;
  if (Math.abs(p.x - g.end.padX) < 34 && Math.abs(p.y - SHELF_Y) < 4) startBeam(ctx);
}

function useExit(ctx) {
  const g = ctx.data.geo;
  if (ctx.data.phase !== 'play') return;
  if (g.end.kind === 'teleporter') {
    if (!ctx.near(g.end.padX, SHELF_Y, 120)) {
      ctx.toast('Walk onto the teleporter first.', 1800);
      return;
    }
    startBeam(ctx);
    return;
  }
  if (!ctx.near(g.end.x, g.end.y, 140)) {
    ctx.toast('Walk up to the door first.', 1800);
    return;
  }
  finish(ctx);
}

function startBeam(ctx) {
  const g = ctx.data.geo;
  ctx.data.phase = 'beam';
  ctx.data.beamFrom = Date.now();
  ctx.place(g.end.padX, SHELF_Y - 2);
  ctx.sound('ACTIVATE_GAME_TELEPORTER', { volume: 0.6 });
}

function stepBeam(ctx) {
  const g = ctx.data.geo;
  const t = Math.min(1, (Date.now() - ctx.data.beamFrom) / 1300);
  const y = SHELF_Y - (SHELF_Y - g.end.ledgeY) * (t * t * (3 - 2 * t));
  const p = ctx.player;
  p.x = g.end.padX;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  animateViews(ctx, Date.now());
  if (t >= 1) finish(ctx);
}

async function finish(ctx) {
  if (ctx.data.phase === 'done') return;
  ctx.data.phase = 'done';
  ctx.progress('solved_puzzle');
  ctx.solve();
  ctx.engine.playEmotion?.('happy');
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(700);
  ctx.leave({ transition: ctx.fx() });
}

function maybePromptStuck(ctx, now) {
  if (ctx.data.phase !== 'play' || ctx.data.prompting || now < ctx.data.promptAt) return;
  if (ctx.dialogOpen?.() || ctx.cardOpen?.()) return;
  ctx.data.prompting = true;
  // G304: instances_show_exit_prompt (inc_instances.js 322-344) is a prompts_add with
  // icon_buttons and no timeout: the bottom-right prompt stack, not the card.
  ctx.prompt({
    text: STUCK_TEXT,
    iconButtons: true,
    choices: [
      { label: 'Yes, please', value: 'yes' },
      { label: 'No thanks', value: 'no' },
    ],
  }).then((choice) => {
    ctx.data.prompting = false;
    if (choice === 'yes') ctx.leave({ transition: ctx.fx() });
    else ctx.data.promptAt = Date.now() + PROMPT_AGAIN_MS;
  });
}

/* ------------------------------------------------------------------ */
/* Billboards with demo buttons                                         */
/* ------------------------------------------------------------------ */

function demoButton(ctx, parent, x, y, onPress, label = 'Demo Button') {
  const { PIXI } = ctx;
  const spr = new PIXI.Sprite(ctx.data.outTex);
  spr.anchor.set(0.5, 0.5);
  spr.scale.set(0.62);
  spr.x = x;
  spr.y = y;
  parent.addChild(spr);
  const hit = new PIXI.Graphics();
  hit.circle(0, 0, 18).fill({ color: 0xffffff, alpha: 0.001 });
  hit.x = parent.x + x;
  hit.y = parent.y + y;
  const demo = {
    press() {
      spr.texture = ctx.data.inTex;
      setTimeout(() => {
        if (!spr.destroyed) spr.texture = ctx.data.outTex;
      }, 240);
      ctx.sound('BUTTON_2', { volume: 0.4 });
      onPress();
    },
  };
  ctx.register({ classId: 'mental_block_demo_button', label, subtitle: 'Try it', sprite: hit, mbDemo: demo });
  return demo;
}

/** A tiny falling-block demo: blocks drop onto a column inside a billboard. */
function miniColumn(ctx, parent, x, floorY, size = 22) {
  const { PIXI } = ctx;
  const layer = new PIXI.Container();
  layer.x = x;
  layer.y = floorY;
  parent.addChild(layer);
  const col = { stack: [], sprites: [], falling: null, layer };
  col.set = (colors) => {
    for (const s of col.sprites) s.destroy();
    col.sprites = colors.map((c, k) => {
      const g = new PIXI.Graphics();
      drawBlock(g, c, size);
      g.y = -k * size;
      layer.addChild(g);
      return g;
    });
    col.stack = [...colors];
  };
  col.drop = (color, fromY = -110) => {
    if (col.falling) return;
    const g = new PIXI.Graphics();
    drawBlock(g, color, size);
    g.y = fromY;
    layer.addChild(g);
    const { stack, crushed } = dropOnto(col.stack, color);
    col.falling = { g, vy: 0, stopY: -col.stack.length * size, finalY: -(stack.length - 1) * size, crushed, stack };
  };
  col.tick = () => {
    const f = col.falling;
    if (!f) return;
    f.vy = Math.min(9, f.vy + 0.6);
    f.g.y += f.vy;
    if (f.g.y < f.stopY) return;
    if (f.crushed && f.stopY !== f.finalY) {
      for (let n = 0; n < f.crushed; n++) col.sprites.pop()?.destroy();
      f.stopY = f.finalY;
      f.vy = 0;
      return;
    }
    f.g.y = f.finalY;
    col.sprites.push(f.g);
    col.stack = f.stack;
    col.falling = null;
  };
  return col;
}

function makeIntro(ctx, intro) {
  const { PIXI, kit } = ctx;
  ctx.data.demos = [];
  if (intro.kind === 'block_drop') {
    const b = billboard(PIXI, intro.x, SHELF_Y, 380, 186);
    const c = b.c;
    c.addChild(text(kit, PIXI, 'BLOCK DROP', 0, -178, 24, 0xf5e61e));
    c.addChild(text(kit, PIXI, 'arrows indicate where\ntube can move to', -88, -146, 12));
    const tube = new PIXI.Graphics();
    drawTube(tube, 130);
    tube.scale.set(0.38);
    tube.x = -112;
    tube.y = -86;
    c.addChild(tube);
    const arrow = new PIXI.Graphics();
    drawArrow(arrow);
    arrow.scale.set(0.4);
    arrow.x = -62;
    arrow.y = -88;
    c.addChild(arrow);
    c.addChild(text(kit, PIXI, 'moves the\nblock-dropping tube', -88, -66, 12));
    c.addChild(text(kit, PIXI, 'drops a block\nfrom tube', 92, -66, 12));
    const stackLabel = text(kit, PIXI, 'blue blocks can stack\non top of each other', 92, -146, 12);
    stackLabel.visible = false;
    c.addChild(stackLabel);
    const col = miniColumn(ctx, c, 92, -86, 20);
    let at = 0;
    const spots = [-112, -62];
    ctx.add(c, 4);
    demoButton(ctx, c, -88, -38, () => {
      at = (at + 1) % 2;
      tube.x = spots[at];
      arrow.x = spots[1 - at];
    }, 'Tube Mover (demo)');
    demoButton(ctx, c, 92, -38, () => {
      stackLabel.visible = true;
      if (col.stack.length >= 2) col.set([]);
      col.drop(B, -40);
    }, 'Block Dropper (demo)');
    ctx.data.demos.push(col);
  } else {
    const b = billboard(PIXI, intro.x, SHELF_Y, 500, 186);
    const c = b.c;
    c.addChild(text(kit, PIXI, 'Facts about Blocks', 0, -178, 24, 0xf5e61e));
    const cols = [-160, 0, 160];
    c.addChild(text(kit, PIXI, 'Blue blocks\nstack on\neverything.', cols[0], -135, 12));
    c.addChild(text(kit, PIXI, 'Red blocks\nstack on\nred blocks.', cols[1], -135, 12));
    c.addChild(text(kit, PIXI, 'Red blocks\ncrushes\nblue blocks.', cols[2], -135, 12));
    const a = miniColumn(ctx, c, cols[0] - 14, -44, 18);
    a.set([B, B]);
    const a2 = miniColumn(ctx, c, cols[0] + 14, -44, 18);
    a2.set([R, B]);
    const r = miniColumn(ctx, c, cols[1], -44, 18);
    r.set([R, R]);
    const crush = miniColumn(ctx, c, cols[2], -44, 18);
    crush.set([B]);
    ctx.add(c, 4);
    demoButton(ctx, c, cols[2], -26, () => {
      if (crush.stack[crush.stack.length - 1] === R) crush.set([B]);
      else crush.drop(R, -80);
    }, 'Block Dropper (demo)');
    ctx.data.demos.push(crush);
  }
}

function makeCaution(ctx, x) {
  const { PIXI, kit } = ctx;
  const b = billboard(PIXI, x, SHELF_Y, 300, 170, { face: 0x8c8a3e, faceLow: 0x77752f, frame: 0x161616 });
  const c = b.c;
  c.addChild(text(kit, PIXI, '\\\\\\ CAUTION \\\\\\', 0, -160, 24, 0xf5e61e));
  c.addChild(text(kit, PIXI, 'red blocks destroy\nblue blocks\nbelow it', -50, -112, 13));
  const col = miniColumn(ctx, c, 80, -50, 20);
  col.set([B, B]);
  ctx.add(c, 4);
  demoButton(ctx, c, -50, -38, () => {
    if (col.stack[col.stack.length - 1] === R) col.set([B, B]);
    else col.drop(R, -100);
  }, 'Block Dropper (demo)');
  ctx.data.demos.push(col);
}

export const MENTAL_BLOCK_FACTS = Object.freeze({ CELL, SHELF_Y, CORR_Y, SHELF_T, H, TUBE_MOUTH_Y, MAX_STACK, REACH });
