/**
 * B.T.C Room #3 (quests/btc_room_3.js + _reminisce): public/js/quest-rooms/tile-puzzle.js.
 * Source constants, the tile maze (solvable, not pre-solved, every press
 * reachable) and the geometry against the avatar's ~110 px jump.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as mod from '../public/js/quest-rooms/tile-puzzle.js?v=9ba8f9cc';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS/quests');
const gsjs = (name) => (existsSync(join(GS, name)) ? readFileSync(join(GS, name), 'utf8') : null);

describe('B.T.C Room #3 source facts', () => {
  it('keeps the 5-minute instance, the exit flag and the room id', () => {
    assert.equal(mod.room.id, 'tile_puzzle');
    assert.equal(mod.EXIT_MS, 5 * 60 * 1000);
    assert.equal(mod.room.durationMs, mod.EXIT_MS);
    assert.equal(mod.BUTTON_RESET_MS, 1000);
    assert.deepEqual(mod.room.onLeave(), { leaveFlag: 'instance_exit_via_door' });
    for (const file of ['btc_room_3.js', 'btc_room_3_reminisce.js']) {
      const src = gsjs(file);
      if (!src) continue;
      assert.match(src, /questInstanceLocation\(pc, 'tile_puzzle', 0, 0, 5\*60/);
      assert.match(src, /"name"\t\t: "instance_exit_via_door"/);
    }
  });

  it('G310: the voice reads the quest description; nothing is transcribed from the recording', () => {
    assert.equal(mod.INTRO.map((b) => b.text).join(' '), 'Solve the maze using the ladders and buttons. Piece of Cheesecake! Okay, I lied about the cake …');
    const quest = gsjs('btc_room_3.js');
    if (quest) assert.ok(quest.includes(`var desc = "${mod.INTRO.map((b) => b.text).join(' ')}";`));
    const all = JSON.stringify([mod.INTRO, mod.OUTRO]);
    for (const gone of ['Gasp!', 'cheese as compensation', 'We ran out', 'not cheese']) assert.ok(!all.includes(gone), gone);
  });
});

describe('B.T.C Room #3 maze', () => {
  it('turns pieces a quarter clockwise and back after four presses', () => {
    assert.deepEqual([...mod.openings('elbow', 0)].sort(), ['R', 'U']);
    assert.deepEqual([...mod.openings('elbow', 1)].sort(), ['D', 'R']);
    assert.deepEqual([...mod.openings('straight', 1)].sort(), ['D', 'U']);
    assert.deepEqual([...mod.openings('tee', 3)].sort(), ['D', 'L', 'U']);
    assert.deepEqual([...mod.openings('tee', 4)].sort(), [...mod.openings('tee', 0)].sort());
  });

  it('starts closed, needs five presses, and the listed answer opens it press by press', () => {
    const rots = mod.startRotations();
    assert.equal(mod.mazeSolved(rots), false);
    assert.equal(mod.fewestPresses(), mod.SOLUTION.length);
    const r = { ...rots };
    for (const id of mod.SOLUTION) {
      const t = mod.tileById(id);
      assert.ok(mod.reachable(r).has(`G${t.c}_${t.r}`), `button for ${id} reachable when pressed`);
      r[id] = (r[id] + 1) % 4;
    }
    assert.ok(mod.mazeSolved(r));
  });

  it('never strands the player: every reachable node can get back to the start', () => {
    // Try every single rotation of each tile from the start and from the answer.
    const answer = { ...mod.startRotations() };
    for (const id of mod.SOLUTION) answer[id] = (answer[id] + 1) % 4;
    for (const base of [mod.startRotations(), answer]) {
      for (const t of mod.TILES) {
        for (let k = 0; k < 4; k++) {
          const rots = { ...base, [t.id]: k };
          for (const n of mod.reachable(rots)) {
            if (n === 'E') continue;
            assert.ok(mod.reachable(rots, n).has('G0_1'), `${n} returns with ${t.id}=${k}`);
          }
        }
      }
    }
  });

  it('keeps the lower right tile shut on the reward room side', () => {
    const rots = mod.startRotations();
    for (let k = 0; k < 4; k++) {
      const edges = mod.mazeEdges({ ...rots, t2_1: k });
      assert.ok(!edges.some(([a, b]) => a === 'T2_1' && b === 'E'));
    }
  });
});

describe('B.T.C Room #3 geometry', () => {
  const F = mod.TILE_PUZZLE_FACTS;

  it('steps and row lines rise one ordinary jump at a time', () => {
    assert.ok(F.STEP_RISE <= F.JUMP_RISE);
    assert.equal(F.ROW_H, 3 * F.STEP_RISE);
    for (const t of mod.TILES) {
      const steps = mod.tilePlatforms(t, mod.openings(t.kind, 0)).concat(mod.tilePlatforms(t, new Set(['U', 'D'])));
      const ys = [...new Set(steps.filter((p) => p.step).map((p) => p.y1))].sort((a, b) => b - a);
      const bot = mod.rowBot(t.r);
      assert.deepEqual(ys, [bot - F.STEP_RISE, bot - 2 * F.STEP_RISE]);
    }
    // The hole in an upper floor is a jumpable gap and sits over the top step.
    const hole = mod.HOLE.dx2 - mod.HOLE.dx1;
    assert.ok(hole <= F.JUMP_GAP, `hole ${hole}`);
    const top = mod.STEPS[1];
    assert.ok(top.dx1 >= mod.HOLE.dx1 && top.dx2 <= mod.HOLE.dx2, 'top step under the hole');
  });

  it('keeps the steps clear of the side walls and too low to vault them', () => {
    // A jump from the top step clears the row line for under ~14 frames: <= 70 px sideways.
    for (const s of mod.STEPS) {
      assert.ok(F.TILE_W / 2 - Math.max(Math.abs(s.dx1), Math.abs(s.dx2)) >= 85, `step ${s.dx1}..${s.dx2}`);
    }
    // No row is reachable from the one below without the steps.
    assert.ok(F.ROW_H > 2 * F.JUMP_RISE);
  });

  it('opens and closes walls with the piece and caps closed floors from below', () => {
    const rots = mod.startRotations();
    const bars = mod.syncBarriers(mod.makeBarriers(), rots);
    const left00 = bars.find((b) => b.id === 'tp_t0_0_L');
    const right00 = bars.find((b) => b.id === 'tp_t0_0_R');
    assert.equal(left00.pc_perm, null);
    assert.equal(right00.pc_perm, 0);
    // The upper walls reach past the lab ceiling.
    assert.ok(left00.y < F.TOP);
    const ceil = mod.ceilings(rots);
    // t0_0 starts {U,R}: its floor is solid both ways over t0_1.
    assert.ok(ceil.some((c) => c.id === 'tp_t0_0_ceil' && c.y === F.LINE));
    const after = mod.ceilings({ ...rots, t0_0: 1 });
    assert.ok(!after.some((c) => c.id === 'tp_t0_0_ceil'));
    // clampCeiling stops a rising head and leaves a standing avatar alone.
    const p = { x: mod.tileRect(mod.tileById('t0_0')).cx, y: F.LINE + F.BODY_H - 6, vy: -5 };
    assert.ok(mod.clampCeiling(p, F.LINE + F.BODY_H + 8, ceil));
    assert.equal(p.y, F.LINE + F.BODY_H);
    assert.equal(p.vy, 0);
    const stand = { x: p.x, y: F.LINE, vy: 0 };
    assert.equal(mod.clampCeiling(stand, F.LINE, ceil), false);
  });

  it('puts buttons and screens in the visible band and quoins over walkable lines', () => {
    for (const t of mod.TILES) {
      const s = mod.buttonSpot(t);
      assert.ok(s.x > mod.greyX(t.c) && s.x < mod.greyX(t.c) + F.GREY_W, `${t.id} button on its column`);
      // The button stands on a walking line: the floor or its column's ledge.
      assert.equal(s.y, mod.rowBot(t.r));
      assert.ok(Math.abs(s.x - mod.ladderX(t.c)) > 60, `${t.id} button clear of the ladder`);
    }
    const plats = mod.allPlatforms(mod.startRotations()).concat(mod.allPlatforms(mod.startRotations(), true));
    for (const q of mod.mazeQuoins()) {
      const under = plats.filter((p) => q.x >= p.x1 && q.x <= p.x2 && p.y1 >= q.y);
      assert.ok(under.some((p) => p.y1 - q.y <= 60), `quoin ${q.id}`);
    }
    // The trapdoor is a platform until the speaker is done.
    assert.ok(mod.fixedPlatforms(false).some((p) => p.id === 'tp_trap'));
    assert.ok(!mod.fixedPlatforms(true).some((p) => p.id === 'tp_trap'));
    // Reward room ledges are one rise apart.
    const l1 = plats.find((p) => p.id === 'tp_room_l1');
    const l2 = plats.find((p) => p.id === 'tp_room_l2');
    assert.ok(F.FLOOR - l1.y1 <= F.JUMP_RISE && l1.y1 - l2.y1 <= F.JUMP_RISE && l2.x1 - l1.x2 <= F.JUMP_GAP);
  });

  it('ships its button art', () => {
    for (const f of ['wall_button_lockOut.png', 'wall_button_lockIn.png']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/tile_puzzle', f)), f);
    }
    assert.ok(existsSync(join(root, 'public', mod.room.icon)));
  });
});
