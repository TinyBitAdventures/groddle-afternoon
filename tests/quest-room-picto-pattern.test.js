/**
 * Picto-Pattern (public/js/quest-rooms/picto-pattern.js): source constants
 * from quests/picto_pattern.js, the three footage puzzles, and geometry the
 * avatar can reach and see.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import {
  PICTO_FACTS,
  PUZZLES,
  ROOM_MS,
  TARGET,
  applyOps,
  chainPlatforms,
  checkAnswer,
  gateSolids,
  opLabel,
  pictoLayout,
  questionText,
  room,
  solutionsFor,
  tallyStrokes,
} from '../public/js/quest-rooms/picto-pattern.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS/quests/picto_pattern.js');
const { FLOOR, JUMP_RISE, JUMP_GAP, CLOUD_W } = PICTO_FACTS;
// The room card leaves ~160 px above the floor visible.
const BAND = 160;

describe('Picto-Pattern (picto_pattern) source', () => {
  it('keeps the quest timer, target and flags', () => {
    assert.equal(TARGET, 11);
    assert.equal(ROOM_MS, 300_000);
    assert.equal(room.id, 'picto_pattern');
    assert.equal(room.durationMs, ROOM_MS);
    assert.deepEqual(room.onLeave(), { leaveFlag: 'leave' });
    if (!existsSync(GSJS)) return;
    const src = readFileSync(GSJS, 'utf8');
    assert.match(src, /questInstanceLocation\(pc, 'picto_pattern', 0, 0, 5\*60/);
    assert.match(src, /"name"\s*:\s*"solved_puzzle"/);
    assert.match(src, /this\.set_flag\(pc, 'leave'\)/);
    assert.match(src, /Add and subtract until you reach 11/);
  });

  it('ships its button art and reward icon', () => {
    for (const f of ['wall_button_lockOut.png', 'wall_button_lockIn.png']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/picto_pattern', f)), f);
    }
    assert.ok(existsSync(join(root, 'public', room.icon)));
  });
});

describe('Picto-Pattern puzzles', () => {
  it('asks the footage questions', () => {
    assert.deepEqual(PUZZLES.map(questionText), [
      'How does 14 become 11 in three steps?',
      'How does 8 become 11 in four steps?',
      'How does 1 become 11 in six steps?',
    ]);
    assert.deepEqual(PUZZLES.map((p) => p.ops.map(opLabel)), [['+I', '-II', '+III'], ['-I', '-II', '+III'], ['+IIII', '-II', '+III']]);
  });

  it('has one set of steps per puzzle, the one the designer played', () => {
    assert.deepEqual(PUZZLES.map(solutionsFor), [[[1, -2, -2]], [[3, 3, -1, -2]], [[4, 4, 3, 3, -2, -2]]]);
    // Played orders from the footage.
    assert.ok(checkAnswer(PUZZLES[0], [-2, -2, 1]));
    assert.ok(checkAnswer(PUZZLES[1], [3, 3, -1, -2]));
    assert.ok(checkAnswer(PUZZLES[2], [4, 3, 3, 4, -2, -2]));
    // The red attempt on the third chain, and short chains, do not count.
    assert.equal(checkAnswer(PUZZLES[2], [4, 4, 3, -2, -2, -2]), false);
    assert.equal(applyOps(1, [4, 4, 3, -2, -2, -2]), 6);
    assert.equal(checkAnswer(PUZZLES[0], [-2, 1]), false);
  });

  it('draws tallies in fives', () => {
    assert.deepEqual(tallyStrokes(14), { fives: 2, ones: 4 });
    assert.deepEqual(tallyStrokes(11), { fives: 2, ones: 1 });
    assert.deepEqual(tallyStrokes(1), { fives: 0, ones: 1 });
    assert.deepEqual(tallyStrokes(-3), { fives: 0, ones: 0 });
  });
});

describe('Picto-Pattern geometry', () => {
  const layout = pictoLayout();

  it('steps from the floor onto each question cloud and up to its chain', () => {
    for (const s of layout.sections) {
      const q = s.question;
      assert.ok(FLOOR - q.surf <= JUMP_RISE, `question ${s.i} is ${FLOOR - q.surf} px up`);
      const start = s.chain[0];
      assert.ok(q.surf - start.surf <= JUMP_RISE, `chain ${s.i} start rise`);
      const gap = (start.x - CLOUD_W / 2) - (q.x + q.w / 2);
      assert.ok(gap <= JUMP_GAP, `gap ${gap}`);
      // The last cloud is reachable from the floor too.
      assert.ok(FLOOR - s.chain[s.chain.length - 1].surf <= JUMP_RISE);
    }
    assert.ok(FLOOR - layout.island.surf <= JUMP_RISE);
  });

  it('joins a solved chain into one walkable line', () => {
    for (const s of layout.sections) {
      const plats = chainPlatforms(s);
      assert.equal(plats.length, s.chain.length * 2 - 1);
      for (let k = 1; k < plats.length; k++) {
        assert.equal(plats[k].x1, plats[k - 1].x2, `section ${s.i} line ${k} starts where the last ends`);
        assert.equal(plats[k].y1, plats[k - 1].y2);
      }
      for (let k = 1; k < s.chain.length; k++) assert.ok(Math.abs(s.chain[k].surf - s.chain[k - 1].surf) <= JUMP_RISE);
    }
  });

  it('keeps the clouds, buttons and question text in the visible band', () => {
    for (const s of layout.sections) {
      for (const c of s.chain) {
        // Tally / step glyphs sit ~30 px under the walk line.
        assert.ok(FLOOR - (c.surf + 30) <= BAND, `glyph at ${FLOOR - c.surf - 30}`);
      }
      assert.ok(FLOOR - (s.question.surf + 50) <= BAND);
      assert.equal(s.buttons.length, s.puzzle.ops.length);
      const xs = [...s.buttons.map((b) => b.x), s.reset.x];
      for (let k = 1; k < xs.length; k++) assert.ok(xs[k] - xs[k - 1] >= 90, 'buttons stand apart');
      assert.ok(xs[0] > s.question.x + s.question.w / 2 - 10, 'buttons after the question cloud');
    }
  });

  it('holds you at a station until it is solved, then opens the way to the exit', () => {
    const [a, b, c] = layout.sections;
    assert.equal(gateSolids(layout, [false, false, false]).length, 2);
    assert.equal(gateSolids(layout, [true, false, false]).length, 1);
    assert.equal(gateSolids(layout, [true, true, false]).length, 0);
    assert.ok(a.gate.x1 > a.chain[a.chain.length - 1].x && a.gate.x2 < b.question.x - b.question.w / 2);
    assert.ok(b.gate.x1 > b.chain[b.chain.length - 1].x && b.gate.x2 < c.question.x - c.question.w / 2);
    assert.equal(c.gate, null);
    assert.ok(layout.door.x > c.chain[c.chain.length - 1].x + 100);
    assert.ok(layout.width > layout.island.x2 + 100);
  });
});

describe('Picto Pattern felt look (G76, players Snaps)', () => {
  it('draws its clouds and ground from the CC0 felt room-art set', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
    const { PICTO_PATTERN_FILES } = await import('../public/js/picto-pattern-art.js');
    const mod = await import('../public/js/quest-rooms/picto-pattern.js');
    const plan = JSON.parse(readFileSync(join(spike, 'tools/room-art/picto_pattern.json'), 'utf8'));
    assert.match(plan.source, /glitch-locations meomi2\.swf, wardrobia\.swf \(CC0\)/);
    const names = [mod.FELT.question, mod.FELT.cloud, ...mod.FELT.ground];
    assert.deepEqual(Object.keys(PICTO_PATTERN_FILES).sort(), [...names].sort());
    for (const name of names) {
      const row = plan.pieces[name];
      const [file, w, h] = PICTO_PATTERN_FILES[name];
      assert.deepEqual([file, w, h], [row.file, ...row.world]);
      const path = join(spike, 'public', mod.PICTO_ART_DIR, file);
      assert.ok(existsSync(path), file);
      assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16), row.sha, `${file} changed since the build`);
    }
    // The ground is meomi2's feltgrassTall tile, recoloured to the Snaps' pale green and brown.
    for (const name of mod.FELT.ground) {
      assert.match(plan.pieces[name].swf, /^bundle:meomi2\.swf#plat_tile_center_0\d_feltgrassTall$/);
      const ramp = Object.fromEntries(plan.pieces[name].ramp);
      assert.equal(ramp[132], '#d7e5b2');
      assert.equal(ramp[60], '#917c51');
    }
  });
});
