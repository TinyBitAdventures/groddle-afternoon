import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FOUR_LETTER_BLOCKS,
  FOUR_LETTER_QUEST_ID,
  FOUR_LETTER_REWARD,
  createFourLetterState,
  currentFourLetterRiddle,
  fourLetterObjective,
  fourLetterWord,
  spinFourLetterBlock,
  startFourLetterPuzzle,
} from '../public/js/four-letter-quest.js?v=a5574ac7';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

function spinUntil(state, blockIndex, wanted) {
  let result = null;
  for (let i = 0; i < FOUR_LETTER_BLOCKS[blockIndex].letters.length; i += 1) {
    result = spinFourLetterBlock(state, blockIndex);
    if (state.letters[blockIndex] === wanted) return result;
  }
  throw new Error(`Could not spin block ${blockIndex} to ${wanted}`);
}

test('Four Letter Words uses the exact source block setup and reward', () => {
  const state = createFourLetterState();
  assert.equal(FOUR_LETTER_QUEST_ID, 'letter_block_2');
  assert.deepEqual(state.letters, ['B', 'S', 'M', 'E']);
  assert.deepEqual(FOUR_LETTER_BLOCKS.map((block) => [...block.letters]), [
    ['M', 'T', 'B'],
    ['E', 'A', 'S'],
    ['A', 'M', 'S'],
    ['T', 'E', 'B'],
  ]);
  assert.deepEqual(FOUR_LETTER_REWARD, {
    xp: 500,
    currants: 300,
    mood: 200,
    favor: { giant: 'lem', points: 50 },
  });
});

test('blocks cannot spin before Mr. Block starts the puzzle', () => {
  const state = createFourLetterState();
  assert.equal(spinFourLetterBlock(state, 0).reason, 'not_running');
  assert.equal(startFourLetterPuzzle(state).ok, true);
  assert.equal(currentFourLetterRiddle(state).answer, 'MAST');
  assert.match(fourLetterObjective(state), /Riddle 1 of 3/);
});

test('spinning cycles each restricted letter list in source order', () => {
  const state = createFourLetterState();
  startFourLetterPuzzle(state);
  assert.equal(spinFourLetterBlock(state, 0).letter, 'M');
  assert.equal(spinFourLetterBlock(state, 0).letter, 'T');
  assert.equal(spinFourLetterBlock(state, 0).letter, 'B');
  assert.equal(fourLetterWord(state), 'BSME');
});

test('the three source words solve in order and finish the puzzle', () => {
  const state = createFourLetterState();
  startFourLetterPuzzle(state);

  spinUntil(state, 0, 'M');
  spinUntil(state, 1, 'A');
  spinUntil(state, 2, 'S');
  let result = spinUntil(state, 3, 'T');
  assert.equal(result.reason, 'riddle_solved');
  assert.deepEqual(state.solvedWords, ['MAST']);

  spinUntil(state, 0, 'T');
  spinUntil(state, 3, 'E');
  result = spinUntil(state, 2, 'M');
  assert.equal(result.reason, 'riddle_solved');
  assert.deepEqual(state.solvedWords, ['MAST', 'TAME']);

  spinUntil(state, 0, 'B');
  spinUntil(state, 1, 'E');
  spinUntil(state, 2, 'A');
  result = spinUntil(state, 3, 'T');
  assert.equal(result.reason, 'complete');
  assert.equal(result.complete, true);
  assert.equal(state.status, 'solved');
  assert.deepEqual(state.solvedWords, ['MAST', 'TAME', 'BEAT']);
  assert.equal(currentFourLetterRiddle(state), null);
  assert.equal(fourLetterObjective(state), 'All three riddles solved');
});

test('client ships the clean room, original block art, verbs, HUD, and deterministic QA route', () => {
  const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
  const content = fs.readFileSync(path.join(publicDir, 'content.js'), 'utf8');
  const html = fs.readFileSync(path.join(publicDir, 'play/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');

  for (const letter of ['A', 'B', 'E', 'M', 'S', 'T']) {
    assert.equal(
      fs.existsSync(path.join(publicDir, 'assets', 'sprites', 'quests', 'four-letter', `letter-block-${letter}.png`)),
      true
    );
  }
  assert.equal(
    fs.existsSync(path.join(publicDir, 'assets', 'sprites', 'quests', 'four-letter', 'mr-block.png')),
    true
  );
  assert.match(game, /drawPlayroomBackground/);
  assert.match(game, /player\.baseScale = .* \* 0\.42/);
  assert.match(game, /letterautoplay/);
  assert.match(game, /handleFourLetterTarget/);
  assert.match(content, /classId === 'letter_block'/);
  assert.match(content, /classId === 'npc_letterblock'/);
  assert.match(html, /id="four-letter-hud"/);
  assert.match(css, /\.four-letter-word span\.is-spinning/);
});
