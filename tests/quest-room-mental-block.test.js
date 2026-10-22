/**
 * Mental Block (public/js/quest-rooms/mental-block.js): source constants
 * from quests/mental_block*.js, the block rules from the footage billboards,
 * and every station solvable (and not without blocks) for the remake's jump.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import {
  CELL,
  CORR_Y,
  EVAL_CURRANTS,
  EXIT_PROMPT_MS,
  GRADES,
  LEVELS,
  MAX_STACK,
  MENTAL_BLOCK_FACTS,
  PROMPT_AGAIN_MS,
  REACH,
  SHELF_Y,
  STUCK_TEXT,
  canClimb,
  columnPlatforms,
  columnTop,
  columnsAfter,
  dropOnto,
  gradeFor,
  levelGeometry,
  levelLadders,
  movesBetween,
  room,
  solidRects,
  solvingPlans,
  staticPlatforms,
} from '../public/js/quest-rooms/mental-block.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const read = (p) => readFileSync(join(GS, p), 'utf8');
// The remake's jump: v 9.6, gravity 0.42 a frame (game.js) peaks ~105-110 px.
const JUMP_PEAK = (9.6 * 9.6) / (2 * 0.42);

describe('Mental Block source', () => {
  it('keeps the exit-delay prompt, flags and stages', () => {
    assert.equal(EXIT_PROMPT_MS, 300_000);
    assert.equal(PROMPT_AGAIN_MS, 120_000);
    assert.equal(STUCK_TEXT, 'Are you stuck? Do you want to leave this place?');
    assert.equal(room.id, 'mental_block');
    assert.equal(room.durationMs, 0, 'the exit delay is a prompt, not a clock');
    assert.deepEqual(room.onLeave(), { leaveFlag: 'leave' });
    assert.equal(room.firstStage('mental_block'), 'mb1');
    assert.equal(room.firstStage('mental_block_rem'), 'mb1');
    assert.equal(room.firstStage('mental_block_2'), 'mb2');
    if (!existsSync(GS)) return;
    for (const q of ['mental_block', 'mental_block_2', 'mental_block_rem']) {
      const src = read(`quests/${q}.js`);
      assert.match(src, /5\*60/);
      assert.match(src, /"name"\s*:\s*"solved_puzzle"/);
      assert.match(src, /this\.set_flag\(pc, 'leave'\)/);
    }
    const inst = read('players/inc_instances.js');
    assert.match(inst, /Are you stuck\? Do you want to leave this place\?/);
    assert.match(inst, /instances_schedule_exit_prompt\(details\.instance_id, 2\*60\)/);
    // The reminisce rides the Play Cube, an hour after part 1.
    assert.match(read('items/play_cube.js'), /'mental_block_rem'/);
    assert.match(read('quests/mental_block_rem.js'), /time\(\) - part1\.ts_done < 60\*60/);
  });

  it('ships its button and teleporter art', () => {
    for (const f of ['wall_button_lockOut.png', 'wall_button_lockIn.png', 'Teleporter_Base.png', 'Teleporter_Beam.png']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/mental_block', f)), f);
    }
    assert.ok(existsSync(join(root, 'public/assets/decos/groddle/door_asset_gray.png')));
    assert.ok(existsSync(join(root, 'public', room.icon)));
  });
});

describe('Mental Block block rules', () => {
  it('stacks blue on anything and red only on red, crushing the blue run', () => {
    assert.deepEqual(dropOnto([], 'b'), { stack: ['b'], crushed: 0 });
    assert.deepEqual(dropOnto(['r'], 'b'), { stack: ['r', 'b'], crushed: 0 });
    assert.deepEqual(dropOnto(['r'], 'r'), { stack: ['r', 'r'], crushed: 0 });
    // CAUTION board: red blocks destroy blue blocks below it.
    assert.deepEqual(dropOnto(['b', 'b'], 'r'), { stack: ['r'], crushed: 2 });
    assert.deepEqual(dropOnto(['r', 'b', 'b'], 'r'), { stack: ['r', 'r'], crushed: 2 });
    assert.deepEqual(dropOnto(['b', 'r', 'b'], 'r'), { stack: ['b', 'r', 'r'], crushed: 1 });
  });

  it('moves the tube one stop at a time, wrapping', () => {
    assert.equal(movesBetween(0, 3, 4), 3);
    assert.equal(movesBetween(3, 0, 4), 1);
    assert.equal(movesBetween(2, 2, 3), 0);
  });

  it('rates Mental Block 2 stations with the footage grades', () => {
    assert.equal(EVAL_CURRANTS, 4);
    assert.deepEqual(GRADES, ["You've got Brains", 'Normal', 'Adequate']);
    assert.equal(gradeFor(0), "You've got Brains");
    assert.equal(gradeFor(1), 'Normal');
    assert.equal(gradeFor(3), 'Adequate');
  });
});

describe('Mental Block stations (footage)', () => {
  it('keeps the designer runs: block orders and tube stops', () => {
    const q = (stage) => LEVELS[stage].sections.map((s) => s.queue);
    assert.deepEqual(q('mb1'), ['bbb', 'bbbr', 'bbbrbbr']);
    assert.deepEqual(q('mb2'), ['bbrbr', 'bbrbbrrbb', 'rbbbrbbr']);
    const stops = (stage) => LEVELS[stage].sections.map((s) => s.positions.length);
    assert.deepEqual(stops('mb1'), [2, 3, 4]);
    assert.deepEqual(stops('mb2'), [3, 4, 4]);
    const ledges = (stage) => LEVELS[stage].sections.map((s) => s.cliff.h);
    assert.deepEqual(ledges('mb1'), [3, 4, 5]);
  });

  it('one block is a hop and two are not, for the remake jump', () => {
    assert.ok(JUMP_PEAK > CELL + 20, `${JUMP_PEAK} clears one block`);
    assert.ok(JUMP_PEAK < 2 * CELL - 20, `${JUMP_PEAK} never clears two`);
    assert.ok(REACH.rise >= CELL && REACH.rise < 2 * CELL);
  });

  for (const stage of ['mb1', 'mb2']) {
    const geo = levelGeometry(stage);
    for (const s of geo.sections) {
      it(`${stage} station ${s.i + 1}: the designer's plan climbs, bare shelves do not`, () => {
        assert.equal(s.plan.length, s.queue.length, 'the footage run uses every block');
        assert.ok(canClimb(s, columnsAfter(s, s.plan)), 'designer plan reaches the ledge');
        assert.equal(canClimb(s, s.positions.map(() => [])), false, 'no blocks, no way up');
        for (const stack of columnsAfter(s, s.plan)) assert.ok(stack.length <= MAX_STACK);
      });
    }
  }

  it('Mental Block 1 stations need their whole order', () => {
    const geo = levelGeometry('mb1');
    const min = geo.sections.map((s) => Math.min(...solvingPlans(s).map((p) => p.length)));
    assert.deepEqual(min, [3, 4, 7]);
    // The first try in the footage (two left, one right) does not reach.
    assert.equal(canClimb(geo.sections[0], columnsAfter(geo.sections[0], [0, 0, 1])), false);
    // Blues stacked by the ledge with the red on top are crushed back to one red.
    assert.equal(canClimb(geo.sections[1], columnsAfter(geo.sections[1], [2, 2, 2, 2])), false);
  });

  it('Mental Block 2 needs a step before each tower', () => {
    const s = levelGeometry('mb2').sections[0];
    assert.deepEqual(solvingPlans(s).map((p) => columnsAfter(s, p).map((c) => c.join('')).join('|')), ['r|r|bbb', 'r|r|bbb']);
    // The footage's first try (reds left and right, blues between) climbs nowhere.
    assert.equal(canClimb(s, columnsAfter(s, [1, 1, 0, 1, 2])), false);
    const last = levelGeometry('mb2').sections[2];
    assert.ok(Math.min(...solvingPlans(last).map((p) => p.length)) >= 7);
  });
});

describe('Mental Block geometry', () => {
  for (const stage of ['mb1', 'mb2']) {
    const geo = levelGeometry(stage);
    it(`${stage}: stations sit in order inside the room`, () => {
      let prevEnd = 0;
      for (const s of geo.sections) {
        assert.ok(s.x0 - 34 > prevEnd, 'ground before the shaft');
        assert.ok(s.positions.every((x, k) => k === 0 || x - s.positions[k - 1] >= CELL + 40), 'columns never touch');
        assert.ok(s.positions[s.positions.length - 1] + CELL / 2 <= s.cliff.x, 'last column clears the ledge');
        for (const so of s.solids) {
          for (const x of s.positions) {
            const lip = so.ladder ? so.x2 + 34 : so.x2;
            assert.ok(x + CELL / 2 <= so.x1 || x - CELL / 2 >= lip || so.kind === 'pedestal', `column ${x} clear of ${so.kind}`);
          }
        }
        // Buttons and the Limit board fit the corridor; the ladder reaches it.
        for (const b of Object.values(s.buttons)) assert.ok(b.x > s.x0 + 20 && b.x < s.cliff.x - 20);
        assert.ok(s.board.x - 84 > s.buttons.drop.x + 20 && s.board.x + 84 <= s.cliff.x);
        prevEnd = s.cliff.slopeEnd;
      }
      assert.ok(geo.W > (geo.end.padX || geo.end.x) + 100);
      const ladders = levelLadders(geo).filter((l) => l.kind === 'corridor');
      assert.equal(ladders.length, geo.sections.length);
      for (const l of ladders) assert.equal(l.yBot, CORR_Y);
    });

    it(`${stage}: the corridor fits the avatar and its ceiling stops a jump short of the shelf`, () => {
      assert.ok(CORR_Y - SHELF_Y - MENTAL_BLOCK_FACTS.SHELF_T >= 100);
      assert.ok(CORR_Y - JUMP_PEAK > SHELF_Y, 'no jumping up through the shelf');
    });

    it(`${stage}: walk lines and walls are well formed`, () => {
      const plats = staticPlatforms(geo);
      for (const p of plats) assert.ok(p.x2 >= p.x1 && Number.isFinite(p.y1 + p.y2), p.id);
      assert.equal(new Set(plats.map((p) => p.id)).size, plats.length);
      const cols = geo.sections.map((s) => columnsAfter(s, s.plan));
      const tops = columnPlatforms(geo, cols);
      const rects = solidRects(geo, cols).filter((r) => r.kind === 'column');
      assert.equal(tops.length, rects.length);
      for (const r of rects) {
        const s = geo.sections[r.section];
        assert.equal(r.yTop, columnTop(s, r.pos, cols[r.section][r.pos]));
        assert.ok(r.yTop >= SHELF_Y - MAX_STACK * CELL);
      }
    });
  }

  it('the teleporter ledge and the drop quoins sit where a walk off the edge passes', () => {
    const geo = levelGeometry('mb1');
    const { end } = geo;
    assert.ok(SHELF_Y - end.ledgeY > 1.5 * JUMP_PEAK, 'the door ledge is out of jumping reach');
    assert.equal(end.quoins.length, 3);
    for (const q of end.quoins) assert.ok(q.x > end.edge && q.x < end.padX - 80);
    // Every station's quoins float above its own shelf.
    for (const s of geo.sections) for (const q of s.quoins) assert.ok(q.y < SHELF_Y);
  });

  it('keeps what the player must use within the visible band above the floor', () => {
    for (const stage of ['mb1', 'mb2']) {
      const geo = levelGeometry(stage);
      for (const s of geo.sections) for (const b of Object.values(s.buttons)) assert.equal(b.y, CORR_Y);
    }
  });
});
