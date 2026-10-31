/**
 * Picto-Pattern (quests/picto_pattern.js).
 *
 * Source: players/inc_stats.js offers the quest from the familiar once the
 * player passes 34,490 iMG; onStarted makes a private copy of the
 * `picto_pattern` template (prod LIFI3TJSFGD3MIS) with a 5 * 60 second exit
 * delay and preserve_links. Two flags finish it: `solved_puzzle` ("Solved
 * Puzzle") and `leave` ("Complete the Journey"), which onExitLocation sets on
 * any exit; leaving before the puzzle is solved fails the quest. Rewards 1100
 * currants, 110 mood, 110 energy, 110 Ti favor and 11 Cloud 11 Smoothies.
 * items/spinach.js, focusing_orb.js, potion_rainbow_juice.js and
 * potion_alphabet_sauce.js refuse to work in this instance ("I'd say, doing
 * that would give you an unfair advantage.").
 *
 * The template, its clouds and their scripts are not in the archive. The
 * puzzle is rebuilt from the level designer's own run-through (reference
 * video UryaMaICZFg, location "Picto Pattern"; the alternate build
 * 9EgYwbh5g1s is a different picture-exchange level, puzzle_lvl_pattern_
 * sequence, so it is not used): three stations, each a question cloud ("How
 * does 14 become 11 in three steps?"), a cloud holding the start number as
 * tally marks, a chain of empty clouds joined by faint beams and a last cloud
 * holding 11. Three coloured operation buttons (+I, -II, +III ...) and Reset
 * stand on the ground. Each press fills the next empty cloud with that step;
 * when the chain is full it is checked: a wrong total flashes the 11 cloud
 * red and empties the chain, a right one lights the beams, turns the chain
 * into solid cloud you can walk along and puts an iMG quoin over every cloud.
 * Puzzles and button sets are the footage's: 14 in three (+1 -2 +3), 8 in
 * four (-1 -2 +3), 1 in six (+4 -2 +3). After the third, an EXIT door on a
 * floating island. Tally marks are clean vectors; the buttons are the
 * recovered wall_button (lockOut / lockIn), the island, door, signs and arrow
 * are recovered decos. The look is felt craft, as two players' Snaps show it
 * (research/wayback/raw/snaps/picto_pattern/, reference only): clouds of white
 * felt with a dashed blue stitch (the CC0 wardrobia fabric clouds, tinted for
 * a filled step) and a stitched pale-green felt band over brown felt (the CC0
 * meomi2 feltgrass tile, recoloured from the Snaps): tools/room-art picto_pattern.
 */

import { pushOutOfSolids, spawnQuoins, takeQuoins, JUMP_RISE, JUMP_GAP } from './puzzle-kit.js?v=17e22046';
import { textureFromUrl } from '../textures.js?v=db2ce452';
import { PICTO_PATTERN_FILES } from '../picto-pattern-art.js?v=72120af4';

const ROOM_ID = 'picto_pattern';
const ART = `assets/sprites/quest-rooms/${ROOM_ID}/`;
const H = 760;
const FLOOR = 620;

// source: quests/picto_pattern.js desc "Add and subtract until you reach 11."
export const TARGET = 11;
// source: onStarted questInstanceLocation(pc, 'picto_pattern', 0, 0, 5*60, ...)
export const ROOM_MS = 5 * 60 * 1000;

/** The three stations, as played in the designer's footage. */
export const PUZZLES = Object.freeze([
  Object.freeze({ start: 14, steps: 3, ops: Object.freeze([1, -2, 3]) }),
  Object.freeze({ start: 8, steps: 4, ops: Object.freeze([-1, -2, 3]) }),
  Object.freeze({ start: 1, steps: 6, ops: Object.freeze([4, -2, 3]) }),
]);

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Button / filled-cloud colour per step (footage: cyan, red, blue, tan, purple). */
export const OP_COLORS = Object.freeze({
  1: 0x86d8ea,
  '-1': 0xf0c58f,
  '-2': 0xee7d74,
  3: 0x6aa5ec,
  4: 0xae90ea,
});

const OP_NAMES = Object.freeze({ 1: 'Add One', '-1': 'Take One', '-2': 'Take Two', 3: 'Add Three', 4: 'Add Four' });

/** "How does 14 become 11 in three steps?" */
export function questionText(puzzle) {
  return `How does ${puzzle.start} become ${TARGET} in ${NUMBER_WORDS[puzzle.steps] || puzzle.steps} steps?`;
}

/** Where a sequence of steps lands. */
export function applyOps(start, seq) {
  return seq.reduce((n, op) => n + op, start);
}

/** A full chain that makes 11. */
export function checkAnswer(puzzle, seq) {
  return seq.length === puzzle.steps && applyOps(puzzle.start, seq) === TARGET;
}

/** Every distinct set of steps (sorted) that solves a puzzle. */
export function solutionsFor(puzzle) {
  const found = new Set();
  const walk = (seq) => {
    if (seq.length === puzzle.steps) {
      if (checkAnswer(puzzle, seq)) found.add([...seq].sort((a, b) => b - a).join(','));
      return;
    }
    for (const op of puzzle.ops) walk([...seq, op]);
  };
  walk([]);
  return [...found].map((s) => s.split(',').map(Number));
}

/** Tally marks for n: bundles of five (four strokes and a slash) and the rest. */
export function tallyStrokes(n) {
  const v = Math.max(0, Math.floor(n));
  return { fives: Math.floor(v / 5), ones: v % 5 };
}

/** "+III", "-II": the step's sign and strokes, as the clouds show it. */
export function opLabel(op) {
  return `${op < 0 ? '-' : '+'}${'I'.repeat(Math.abs(op))}`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const CLOUD_W = 120;
const CLOUD_H = 58;
const CHAIN_DX = 165;
const HIGH = FLOOR - 155;
const LOW = FLOOR - 125;
const CLOUD_DY = 26; // cloud body centre below its walk line
const BUTTON_DX = 115;

/** Every station's geometry, the exit island and the room width. */
export function pictoLayout() {
  const sections = [];
  let x0 = 360;
  PUZZLES.forEach((puzzle, i) => {
    const question = { x: x0 + 140, surf: FLOOR - 95, w: 240, h: 100 };
    const chain = [];
    const n = puzzle.steps + 2;
    for (let k = 0; k < n; k++) {
      const kind = k === 0 ? 'start' : k === n - 1 ? 'end' : 'slot';
      const surf = kind === 'start' ? HIGH : kind === 'end' ? FLOOR - 100 : k % 2 ? LOW : HIGH;
      chain.push({ k, kind, x: x0 + 330 + k * CHAIN_DX, surf });
    }
    const buttons = puzzle.ops.map((op, b) => ({ id: `s${i}_op${b}`, op, x: x0 + 420 + b * BUTTON_DX }));
    const reset = { id: `s${i}_reset`, x: x0 + 420 + puzzle.ops.length * BUTTON_DX + 30 };
    const last = chain[chain.length - 1].x;
    const gate = i < PUZZLES.length - 1 ? { x: last + 190, x1: last + 150, x2: last + 230 } : null;
    sections.push({ i, puzzle, x0, question, chain, buttons, reset, gate, right: last + 300 });
    x0 = last + 300;
  });
  const door = { x: x0 + 260, surf: FLOOR - 70 };
  const island = { x1: door.x - 120, x2: door.x + 120, surf: door.surf };
  return {
    sections,
    door,
    island,
    spawn: { x: 230, y: FLOOR },
    width: door.x + 420,
    floor: FLOOR,
  };
}

/** Walkable lines over a solved chain: cloud tops and the beams between them. */
export function chainPlatforms(section) {
  const half = CLOUD_W / 2 - 8;
  const out = [];
  section.chain.forEach((c, k) => {
    out.push({ id: `pp_s${section.i}_c${k}`, x1: c.x - half, y1: c.surf, x2: c.x + half, y2: c.surf, style: 'invisible' });
    const next = section.chain[k + 1];
    if (next) out.push({ id: `pp_s${section.i}_b${k}`, x1: c.x + half, y1: c.surf, x2: next.x - half, y2: next.surf, style: 'invisible' });
  });
  return out;
}

function basePlatforms(layout) {
  const out = [{ id: 'pp_floor', x1: 0, y1: FLOOR, x2: layout.width, y2: FLOOR, style: 'invisible' }];
  for (const s of layout.sections) {
    const q = s.question;
    out.push({ id: `pp_q${s.i}`, x1: q.x - q.w / 2 + 26, y1: q.surf, x2: q.x + q.w / 2 - 26, y2: q.surf, style: 'invisible' });
  }
  out.push({ id: 'pp_island', x1: layout.island.x1, y1: layout.island.surf, x2: layout.island.x2, y2: layout.island.surf, style: 'invisible' });
  return out;
}

/** Fog walls that hold you at a station until it is solved. */
export function gateSolids(layout, solved) {
  return layout.sections
    .filter((s) => s.gate && !solved[s.i])
    .map((s) => ({ x1: s.gate.x1, x2: s.gate.x2, yTop: FLOOR - 640, yBot: FLOOR + 20 }));
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

export const PICTO_ART_DIR = ART;
/** Felt pieces by role (js/picto-pattern-art.js, tools/room-art/build.py picto_pattern). */
export const FELT = Object.freeze({ question: 'fabric_cloud_1', cloud: 'fabric_cloud_2', ground: ['feltgrass_1', 'feltgrass_2', 'feltgrass_3'] });
/** The felt grass band's top edge sits this far down its tile (the tile's transparent head). */
const FELT_GRASS_TOP = 128;

/** A felt room-art piece, centred, scaled to a world width. */
function felt(PIXI, name, width, opts = {}) {
  const [file, w] = PICTO_PATTERN_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  spr.anchor.set(0.5, opts.ay ?? 0.5);
  spr.scale.set(width / w);
  if (opts.tint != null) spr.tint = opts.tint;
  return spr;
}

/** Tally marks for n, centred on (0, 0). */
function drawTally(g, n, color = 0x15161a, size = 1) {
  g.clear();
  const { fives, ones } = tallyStrokes(n);
  const hgt = 26 * size;
  const step = 6.5 * size;
  const gap = 11 * size;
  const width = fives * (4 * step + gap) + Math.max(0, ones - 1) * step + (ones ? 0 : -gap);
  let x = -width / 2;
  for (let f = 0; f < fives; f++) {
    for (let s = 0; s < 4; s++) {
      g.moveTo(x + s * step, -hgt / 2);
      g.lineTo(x + s * step, hgt / 2);
    }
    g.moveTo(x - 4 * size, hgt * 0.32);
    g.lineTo(x + 3 * step + 4 * size, -hgt * 0.32);
    x += 4 * step + gap;
  }
  for (let s = 0; s < ones; s++) {
    g.moveTo(x + s * step, -hgt / 2);
    g.lineTo(x + s * step, hgt / 2);
  }
  g.stroke({ width: 4 * size, color: color, alpha: 1 });
}

/** "+III" as a drawn sign and strokes, centred on (0, 0). */
function drawOp(g, op, color = 0x15161a, size = 1) {
  g.clear();
  const n = Math.abs(op);
  const hgt = 24 * size;
  const step = 7 * size;
  const signW = 12 * size;
  const width = signW + 8 * size + (n - 1) * step;
  const x0 = -width / 2;
  g.moveTo(x0, 0);
  g.lineTo(x0 + signW, 0);
  if (op > 0) {
    g.moveTo(x0 + signW / 2, -signW / 2);
    g.lineTo(x0 + signW / 2, signW / 2);
  }
  g.stroke({ width: 3.5 * size, color: color, alpha: 1 });
  for (let s = 0; s < n; s++) {
    const x = x0 + signW + 8 * size + s * step;
    g.moveTo(x, -hgt / 2);
    g.lineTo(x, hgt / 2);
  }
  g.stroke({ width: 4 * size, color: color, alpha: 1 });
}

function drawGlow(g, w, h, color = 0xffffff, strength = 1) {
  g.clear();
  for (let r = 5; r >= 1; r--) {
    g.ellipse(0, h * 0.1, w * (0.5 + r * 0.09), h * (0.42 + r * 0.12)).fill({ color: color, alpha: 0.05 * strength * (6 - r) });
  }
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export const room = {
  id: ROOM_ID,
  title: 'Picto-Pattern',
  kicker: 'Add and subtract until you reach 11',
  icon: 'assets/sprites/icons/cloud_11_smoothie.png',
  theme: 'lab',
  hubName: 'Picto Pattern',
  durationMs: ROOM_MS,
  leaveText: 'Leave before the puzzle is solved? You will have to start over.',
  travelText: 'Solve the clouds and find the exit, or use Leave.',
  expireText: 'Time is up!',

  build(ctx) {
    const { PIXI, kit } = ctx;
    const layout = pictoLayout();
    const W = layout.width;
    ctx.data.layout = layout;
    ctx.data.solved = layout.sections.map(() => false);
    const root = kit.sceneRoot(PIXI, W, H);
    const sky = root.layer(0, 0);
    sky.addChild(kit.gradient(PIXI, [[0, '#1b1f36'], [0.55, '#2e3554'], [1, '#4b5578']], 960, 640));
    const far = root.layer(0.2, 1);
    for (let i = 0; i < 10; i++) {
      far.addChild(kit.deco(PIXI, i % 2 ? 'cloud_5' : 'cloud_3', 120 + i * 420, 250 + (i % 3) * 70, { scale: 0.7, alpha: 0.18, tint: 0xc8d2ec }));
    }
    const world = root.layer(1, 3);
    world.addChild(drawGround(PIXI, W));
    // The question clouds rest on the felt grass, in front of it.
    const behind = new PIXI.Container();
    world.addChild(behind);
    // The title plank, tilted, at the start: the location name, inc_data_maps_prod.js 18092 (as the footage shows it).
    world.addChild(kit.deco(PIXI, 'firebog_sign_blank_plank', 100, FLOOR - 112, { ay: 0.5, scale: 0.36, rotation: -0.1 }));
    const title = kit.label(PIXI, 'Picto Pattern', 100, FLOOR - 114, { size: 17, fill: 0xffffff, stroke: { color: 0x5a3a1c, width: 4 } });
    title.rotation = -0.1;
    world.addChild(title);

    ctx.data.view = { sections: [] };
    const beams = new PIXI.Container();
    const clouds = new PIXI.Container();
    world.addChild(beams);
    for (const s of layout.sections) {
      // The question cloud: walkable, the step up to the chain.
      const q = new PIXI.Container();
      q.x = s.question.x;
      q.y = s.question.surf + 56;
      const qg = felt(PIXI, FELT.question, s.question.w + 40);
      qg.y = 2;
      q.addChild(qg);
      q.addChild(kit.label(PIXI, questionText(s.puzzle), 0, -8, { size: 16, fill: 0x3a3f4c, wrap: 170, weight: '800' }));
      behind.addChild(q);
      const sv = { beams: [], clouds: [] };
      s.chain.forEach((c, k) => {
        const next = s.chain[k + 1];
        if (next) {
          const b = new PIXI.Graphics();
          beams.addChild(b);
          sv.beams.push({ g: b, from: c, to: next });
        }
        const cont = new PIXI.Container();
        cont.x = c.x;
        cont.y = c.surf + CLOUD_DY;
        const glowG = new PIXI.Graphics();
        const body = felt(PIXI, FELT.cloud, CLOUD_W + 14);
        body.y = 6;
        const glyph = new PIXI.Graphics();
        glyph.y = 4;
        cont.addChild(glowG, body, glyph);
        clouds.addChild(cont);
        sv.clouds.push({ c, cont, glowG, body, glyph });
      });
      ctx.data.view.sections.push(sv);
      // The fog wall to the next station, and the arrow that replaces it.
      if (s.gate) {
        const fog = new PIXI.Container();
        for (let r = 0; r < 4; r++) {
          fog.addChild(kit.deco(PIXI, 'cloud_fluffy_2', s.gate.x + (r % 2 ? 14 : -14), FLOOR + 30 - r * 105, { ay: 1, scale: 0.36, sy: 0.6, tint: 0xdfe5f2, alpha: 0.9 }));
        }
        world.addChild(fog);
        const arrow = kit.deco(PIXI, 'arrow_ground2', s.gate.x, FLOOR - 26, { ay: 0.5, scale: 0.5, alpha: 0 });
        world.addChild(arrow);
        sv.fog = fog;
        sv.arrow = arrow;
      }
    }
    world.addChild(clouds);
    // The exit: a floating island, a doorway and its plank.
    const { door, island } = layout;
    world.addChild(kit.deco(PIXI, 'floating_platform_grass_02', door.x, island.surf - 14, { ay: 0, scale: (island.x2 - island.x1 + 30) / 612 }));
    world.addChild(kit.deco(PIXI, 'door_asset_starter_01a', door.x + 12, island.surf + 4, { scale: 0.44 }));
    // The EXIT plank on a post beside the doorway, low enough to read under the room card.
    const post = new PIXI.Graphics();
    post.roundRect(door.x - 82, island.surf - 92, 8, 92, 3).fill(0x6b4a2b);
    world.addChild(post);
    world.addChild(kit.deco(PIXI, 'firebog_sign_blank_plank', door.x - 78, island.surf - 96, { ay: 0.5, scale: 0.2, rotation: -0.08 }));
    const exitText = kit.label(PIXI, 'EXIT', door.x - 78, island.surf - 97, { size: 14, fill: 0xffffff, stroke: { color: 0x5a3a1c, width: 3 } });
    exitText.rotation = -0.08;
    world.addChild(exitText);
    return {
      label: 'Picto Pattern',
      width: W,
      height: H,
      background: root,
      platforms: basePlatforms(layout),
      spawn: layout.spawn,
    };
  },

  enter(ctx) {
    const { PIXI } = ctx;
    const layout = ctx.data.layout;
    ctx.data.state = layout.sections.map(() => ({ filled: [], status: 'open', resolveAt: 0, result: null }));
    ctx.data.quoins = [];
    ctx.data.wrong = 0;
    ctx.data.presses = 0;
    ctx.data.prevX = layout.spawn.x;
    ctx.data.phase = 'play';
    ctx.data.buttons = [];
    const outTex = textureFromUrl(`${ART}wall_button_lockOut.png`);
    const inTex = textureFromUrl(`${ART}wall_button_lockIn.png`);
    for (const s of layout.sections) {
      for (const b of s.buttons) ctx.data.buttons.push(makeButton(ctx, { ...b, section: s.i, outTex, inTex }));
      ctx.data.buttons.push(makeButton(ctx, { ...s.reset, section: s.i, reset: true, outTex, inTex }));
    }
    const doorHit = new PIXI.Graphics();
    doorHit.rect(-46, -150, 92, 150).fill({ color: 0xffffff, alpha: 0.001 });
    doorHit.x = layout.door.x + 12;
    doorHit.y = layout.door.surf;
    ctx.data.door = ctx.register({ classId: 'puzzle_exit_door', label: 'Exit', subtitle: 'The way out', sprite: doorHit });
    redrawAll(ctx);
  },

  tick(ctx) {
    const p = ctx.player;
    const layout = ctx.data.layout;
    if (!p || !layout || !ctx.data.state) return;
    pushOutOfSolids(p, ctx.data.prevX, gateSolids(layout, ctx.data.solved));
    ctx.data.prevX = p.x;
    const now = Date.now();
    ctx.data.state.forEach((st, i) => {
      if (st.status === 'checking' && now >= st.resolveAt) resolve(ctx, i);
      else if (st.status === 'wrong' && now >= st.resolveAt) {
        st.status = 'open';
        st.filled = [];
        st.result = null;
        redrawSection(ctx, i);
      }
    });
    // Pulse the next empty cloud; fade the fog and show the arrow once solved.
    const t = now / 1000;
    ctx.data.view.sections.forEach((sv, i) => {
      const st = ctx.data.state[i];
      sv.clouds.forEach((cv, k) => {
        const next = st.status === 'open' && cv.c.kind === 'slot' && k === st.filled.length + 1;
        cv.glowG.alpha = next ? 0.6 + Math.sin(t * 4) * 0.35 : cv.glowG.baseAlpha ?? 0;
      });
      if (sv.fog) {
        const want = ctx.data.solved[i] ? 0 : 1;
        sv.fog.alpha += (want - sv.fog.alpha) * 0.08;
        sv.fog.visible = sv.fog.alpha > 0.02;
        sv.arrow.alpha += ((ctx.data.solved[i] ? 0.9 : 0) - sv.arrow.alpha) * 0.08;
        sv.arrow.x = layout.sections[i].gate.x + (ctx.data.solved[i] ? Math.sin(t * 3) * 6 : 0);
      }
    });
    takeQuoins(ctx, ctx.data.quoins);
  },

  verbs(ctx, target) {
    if (target.ppButton) {
      const label = target.ppButton.reset ? 'Reset' : 'Press';
      return [{ id: 'press', label, enabled: true, tooltip: target.ppButton.reset ? 'Empty the clouds' : `Fill the next cloud with ${opLabel(target.ppButton.op)}` }];
    }
    if (target === ctx.data.door) return [{ id: 'enter', label: 'Enter', enabled: true, tooltip: 'Leave through the door' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.ppButton && verbId === 'press') {
      press(ctx, target.ppButton);
      return true;
    }
    if (target === ctx.data.door && verbId === 'enter') {
      exit(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const st = ctx.data.state || [];
    const i = st.findIndex((s) => s.status !== 'solved');
    const got = (ctx.data.quoins || []).filter((q) => q.taken).length;
    if (i < 0) {
      return {
        text: ctx.data.phase === 'done' ? 'Whew!' : 'Every cloud makes 11. Head right to the exit.',
        stats: [['puzzles', `${PUZZLES.length}/${PUZZLES.length}`], ['quoins', got]],
      };
    }
    const puzzle = PUZZLES[i];
    return {
      text: questionText(puzzle),
      stats: [['puzzle', `${i + 1}/${PUZZLES.length}`], ['steps', `${st[i].filled.length}/${puzzle.steps}`], ['quoins', got]],
    };
  },

  onLeave() {
    // source: onExitLocation sets `leave` on any exit; the runtime fails an unsolved run.
    return { leaveFlag: 'leave' };
  },

  publish(ctx) {
    const st = ctx.data.state || [];
    const i = st.findIndex((s) => s.status !== 'solved');
    ctx.setData('ppSection', String(i < 0 ? PUZZLES.length : i));
    ctx.setData('ppFilled', i < 0 ? '' : st[i].filled.join(','));
    ctx.setData('ppStatus', i < 0 ? 'solved' : st[i].status);
    ctx.setData('ppSolved', String(st.filter((s) => s.status === 'solved').length));
    ctx.setData('ppWrong', String(ctx.data.wrong || 0));
    ctx.setData('ppPresses', String(ctx.data.presses || 0));
    ctx.setData('ppQuoins', String((ctx.data.quoins || []).filter((q) => q.taken).length));
    ctx.setData('ppPhase', ctx.data.phase || '');
    ctx.setData('ppFlag', ctx.hasProgress('solved_puzzle') ? '1' : '0');
  },

  async autoplay(ctx, mode) {
    const layout = ctx.data.layout;
    const go = async (x, y = FLOOR, ms = 350) => {
      ctx.place(x, y);
      await ctx.wait(ms);
    };
    const pressOp = async (s, op) => {
      const b = ctx.data.buttons.find((x) => x.def.section === s.i && (op === 'reset' ? x.def.reset : x.def.op === op && !x.def.reset));
      await go(b.def.x - 24, FLOOR, 250);
      room.runVerb(ctx, b.target, 'press');
      await ctx.wait(250);
    };
    const settle = async (i) => {
      for (let n = 0; n < 40 && ['checking', 'wrong'].includes(ctx.data.state[i].status); n++) await ctx.wait(150);
    };
    await ctx.wait(600);
    for (const s of layout.sections) {
      if (mode === 'wrong' && s.i === 0) {
        for (const op of [1, 1, 1]) await pressOp(s, op);
        await ctx.wait(200);
        const shown = ctx.data.state[0].status;
        await settle(0);
        ctx.setData('ppAutoplay', `wrong:${shown}`);
        return 'wrong';
      }
      if (mode === 'reset' && s.i === 0) {
        await pressOp(s, -2);
        await pressOp(s, 'reset');
        return ctx.data.state[0].filled.length === 0 ? 'reset' : 'reset-failed';
      }
      const [answer] = solutionsFor(s.puzzle);
      for (const op of answer) await pressOp(s, op);
      await settle(s.i);
      // Walk the lit chain for its quoins.
      for (const c of s.chain) await go(c.x, c.surf, 260);
      await go(s.chain[s.chain.length - 1].x + 120);
      if (mode === 'solve1') return ctx.data.solved[0] ? 'solve1' : 'solve1-failed';
    }
    await go(layout.door.x - 10, layout.door.surf, 500);
    if (mode === 'door') return 'door';
    room.runVerb(ctx, ctx.data.door, 'enter');
    return 'exited';
  },
};

function drawGround(PIXI, W) {
  const c = new PIXI.Container();
  // Brown felt under the tiles (their stitch holes show through to it).
  const g = new PIXI.Graphics();
  g.rect(0, FLOOR + 50, W, H - FLOOR + 200).fill(0x8f7c51);
  c.addChild(g);
  // The stitched pale-green felt band over brown felt: the recoloured feltgrass tiles, edge to edge.
  const [, tw] = PICTO_PATTERN_FILES.feltgrass_1;
  for (let x = 0, k = 0; x < W + tw; x += tw - 1, k++) {
    const t = felt(PIXI, FELT.ground[(k * 7) % 3], tw, { ay: 0 });
    t.x = x + tw / 2;
    t.y = FLOOR - 8 - FELT_GRASS_TOP;
    c.addChild(t);
  }
  return c;
}

function makeButton(ctx, def) {
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  if (def.reset) {
    c.addChild(kit.label(PIXI, 'Reset', 0, -46, { size: 12, fill: 0xffffff, stroke: { color: 0x2a2f45, width: 3 } }));
  } else {
    const sign = new PIXI.Container();
    sign.y = -52;
    const g = felt(PIXI, FELT.cloud, 74, { tint: OP_COLORS[def.op] ?? 0xffffff });
    g.y = 3;
    const glyph = new PIXI.Graphics();
    glyph.y = 3;
    drawOp(glyph, def.op, 0x15161a, 0.62);
    sign.addChild(g, glyph);
    c.addChild(sign);
  }
  const post = new PIXI.Graphics();
  post.roundRect(-5, -22, 10, 22, 3).fill(0x3b4058);
  c.addChild(post);
  const btn = new PIXI.Sprite(def.outTex);
  btn.anchor.set(0.5, 0.5);
  btn.y = -24;
  btn.scale.set(def.reset ? 0.8 : 0.95);
  if (def.reset) btn.tint = 0xa3a9b8;
  c.addChild(btn);
  c.x = def.x;
  c.y = FLOOR;
  const target = ctx.register({
    classId: 'picto_button',
    label: def.reset ? 'Reset' : `${opLabel(def.op)} (${OP_NAMES[def.op] || 'Step'})`,
    subtitle: def.reset ? 'Empty the clouds' : 'Press',
    sprite: c,
    ppButton: { id: def.id, section: def.section, op: def.op, reset: Boolean(def.reset) },
  });
  return { def, target, btn, container: c };
}

function press(ctx, pb) {
  const st = ctx.data.state?.[pb.section];
  const s = ctx.data.layout.sections[pb.section];
  if (!st || !s) return;
  const button = ctx.data.buttons.find((b) => b.def.id === pb.id);
  if (button) {
    button.btn.texture = button.def.inTex;
    setTimeout(() => {
      if (button.btn && !button.btn.destroyed) button.btn.texture = button.def.outTex;
    }, 260);
  }
  ctx.data.presses += 1;
  if (st.status === 'solved') {
    ctx.sound('CLICK_FAILURE', { volume: 0.3 });
    return;
  }
  if (st.status !== 'open') return;
  if (pb.reset) {
    st.filled = [];
    ctx.sound('CLICK_SUCCESS', { volume: 0.4 });
    redrawSection(ctx, pb.section);
    return;
  }
  st.filled.push(pb.op);
  ctx.sound('CLICK_SUCCESS', { volume: 0.5 });
  if (st.filled.length >= s.puzzle.steps) {
    st.status = 'checking';
    st.resolveAt = Date.now() + 600;
  }
  redrawSection(ctx, pb.section);
}

function resolve(ctx, i) {
  const st = ctx.data.state[i];
  const s = ctx.data.layout.sections[i];
  const end = s.chain[s.chain.length - 1];
  st.result = applyOps(s.puzzle.start, st.filled);
  if (checkAnswer(s.puzzle, st.filled)) {
    st.status = 'solved';
    ctx.data.solved[i] = true;
    // The lit chain becomes cloud you can walk along, with a quoin over every cloud.
    const list = ctx.engine.platforms;
    if (list) list.push(...chainPlatforms(s));
    ctx.data.quoins.push(...spawnQuoins(ctx, s.chain.map((c, k) => ({ id: `s${i}q${k}`, x: c.x, y: c.surf - 46, type: 'xp' }))));
    ctx.floatText(end.x, end.surf - 40, `${TARGET}!`, '#f2ffb0');
    if (ctx.data.solved.every(Boolean)) {
      ctx.progress('solved_puzzle');
      ctx.solve();
      ctx.sound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
      ctx.toast('Solved! The exit is to the right.', 2600);
    } else {
      ctx.sound('ACHIEVEMENT_UNLOCKED', { volume: 0.45 });
    }
  } else {
    st.status = 'wrong';
    st.resolveAt = Date.now() + 1500;
    ctx.data.wrong += 1;
    ctx.floatText(end.x, end.surf - 40, `That makes ${st.result}.`, '#ffb3a8');
    ctx.sound('CLICK_FAILURE', { volume: 0.5 });
  }
  redrawSection(ctx, i);
}

function redrawAll(ctx) {
  ctx.data.layout.sections.forEach((s) => redrawSection(ctx, s.i));
}

function redrawSection(ctx, i) {
  const st = ctx.data.state[i];
  const s = ctx.data.layout.sections[i];
  const sv = ctx.data.view.sections[i];
  const solved = st.status === 'solved';
  const wrong = st.status === 'wrong';
  sv.clouds.forEach((cv) => {
    const { c } = cv;
    let fill = 0xf7f8fc;
    let alpha = 1;
    let glow = 0;
    let glowColor = 0xffffff;
    cv.glyph.clear();
    if (c.kind === 'start') {
      drawTally(cv.glyph, s.puzzle.start);
    } else if (c.kind === 'end') {
      drawTally(cv.glyph, TARGET, wrong ? 0xd8322a : 0x15161a);
      if (wrong) { glow = 0.9; glowColor = 0xff4a3a; fill = 0xffe4e0; }
      if (solved) { glow = 0.55; glowColor = 0xf2ffb0; }
    } else {
      const op = st.filled[c.k - 1];
      if (op != null) {
        drawOp(cv.glyph, op);
        fill = solved ? 0xf7f8fc : OP_COLORS[op] ?? 0xffffff;
      } else {
        alpha = 0.9;
      }
    }
    // White felt, dyed by the step it holds (the sprite's tint).
    cv.body.tint = solved && c.kind !== 'end' ? 0xf4f9e4 : fill;
    cv.body.alpha = alpha;
    drawGlow(cv.glowG, CLOUD_W, CLOUD_H, c.kind === 'slot' && !glow ? 0xffffff : glowColor, 1);
    cv.glowG.baseAlpha = glow;
    cv.glowG.alpha = glow;
  });
  for (const b of sv.beams) {
    const g = b.g;
    g.clear();
    const half = CLOUD_W / 2 - 10;
    const x1 = b.from.x + half;
    const y1 = b.from.surf + CLOUD_DY;
    const x2 = b.to.x - half;
    const y2 = b.to.surf + CLOUD_DY;
    if (solved || wrong) {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke({ width: 16, color: solved ? 0xeaf7a0 : 0xff5a4a, alpha: 0.22 });
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke({ width: solved || wrong ? 6 : 4, color: solved ? 0xeef8b8 : wrong ? 0xff6a5a : 0xcfd6e6, alpha: solved || wrong ? 0.95 : 0.4 });
  }
}

async function exit(ctx) {
  if (ctx.data.phase === 'done') return;
  const { door } = ctx.data.layout;
  if (!ctx.data.solved.every(Boolean)) {
    ctx.toast('Make every chain of clouds add up to 11 first.', 2200);
    return;
  }
  if (!ctx.near(door.x, door.surf, 140)) {
    ctx.toast('Walk up to the door first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.sound('DOOR_OPEN', { volume: 0.6 });
  await ctx.wait(400);
  ctx.leave({ transition: ctx.fx() });
}

export const PICTO_FACTS = Object.freeze({ H, FLOOR, CLOUD_W, CLOUD_H, CHAIN_DX, HIGH, LOW, JUMP_RISE, JUMP_GAP });
