/**
 * Four Letter Words quest state.
 *
 * Source anchors:
 * - quests/letter_block_2.js
 * - items/letter_block.js
 *
 * The original room creates four blocks with restricted letter sets. Spinning
 * them cycles in-order and solves MAST, TAME, then BEAT.
 */

export const FOUR_LETTER_QUEST_ID = 'letter_block_2';
export const FOUR_LETTER_ROOM_ID = 'LIF149EVS2A22H1';
export const FOUR_LETTER_BASE_STREET_ID = 'GCR101Q98A12EHH';

export const FOUR_LETTER_BLOCKS = Object.freeze([
  Object.freeze({ id: 'block_1', letters: Object.freeze(['M', 'T', 'B']), initial: 'B' }),
  Object.freeze({ id: 'block_2', letters: Object.freeze(['E', 'A', 'S']), initial: 'S' }),
  Object.freeze({ id: 'block_3', letters: Object.freeze(['A', 'M', 'S']), initial: 'M' }),
  Object.freeze({ id: 'block_4', letters: Object.freeze(['T', 'E', 'B']), initial: 'E' }),
]);

export const FOUR_LETTER_RIDDLES = Object.freeze([
  Object.freeze({
    answer: 'MAST',
    text: 'Through waves that roll and winds that whip, this stands tall from a mighty ship.',
  }),
  Object.freeze({
    answer: 'TAME',
    text: 'Of animals I reminisce, some are wild and some are this.',
  }),
  Object.freeze({
    answer: 'BEAT',
    text: 'Up and down through every song, this tells you when to dance along.',
  }),
]);

export const FOUR_LETTER_REWARD = Object.freeze({
  xp: 500,
  currants: 300,
  mood: 200,
  favor: Object.freeze({ giant: 'lem', points: 50 }),
});

export function createFourLetterState() {
  return {
    status: 'staging',
    riddleIndex: 0,
    letters: FOUR_LETTER_BLOCKS.map((block) => block.initial),
    solvedWords: [],
    spins: 0,
  };
}

export function startFourLetterPuzzle(state) {
  if (!state || state.status !== 'staging') {
    return { ok: false, reason: 'not_staging', state };
  }
  state.status = 'running';
  return {
    ok: true,
    reason: 'started',
    word: fourLetterWord(state),
    riddle: currentFourLetterRiddle(state),
    state,
  };
}

export function fourLetterWord(state) {
  return Array.isArray(state?.letters) ? state.letters.join('') : '';
}

export function currentFourLetterRiddle(state) {
  if (!state || state.status === 'solved') return null;
  return FOUR_LETTER_RIDDLES[state.riddleIndex] || null;
}

export function spinFourLetterBlock(state, index) {
  const block = FOUR_LETTER_BLOCKS[index];
  if (!state || state.status !== 'running') {
    return { ok: false, reason: 'not_running', state };
  }
  if (!block) return { ok: false, reason: 'unknown_block', state };

  const current = state.letters[index];
  const currentIndex = block.letters.indexOf(current);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % block.letters.length;
  state.letters[index] = block.letters[nextIndex];
  state.spins += 1;

  const word = fourLetterWord(state);
  const riddle = currentFourLetterRiddle(state);
  let solved = false;
  let complete = false;
  if (riddle && word === riddle.answer) {
    solved = true;
    state.solvedWords.push(word);
    state.riddleIndex += 1;
    complete = state.riddleIndex >= FOUR_LETTER_RIDDLES.length;
    if (complete) state.status = 'solved';
  }

  return {
    ok: true,
    reason: solved ? (complete ? 'complete' : 'riddle_solved') : 'spun',
    index,
    letter: state.letters[index],
    word,
    solved,
    complete,
    nextRiddle: currentFourLetterRiddle(state),
    state,
  };
}

export function fourLetterObjective(state) {
  if (!state) return '';
  if (state.status === 'staging') return 'Talk to Mr. Block';
  if (state.status === 'solved') return 'All three riddles solved';
  const riddle = currentFourLetterRiddle(state);
  return riddle
    ? `Riddle ${state.riddleIndex + 1} of ${FOUR_LETTER_RIDDLES.length}: ${riddle.text}`
    : '';
}

