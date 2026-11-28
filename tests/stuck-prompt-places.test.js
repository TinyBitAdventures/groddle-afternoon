/**
 * Glitch's "Are you stuck? Do you want to leave this place?" (players/inc_instances.js 317-370) for
 * the instances the quest-room runtime does not run (js/stuck-prompt.js): Beam Me Down
 * (tests/beam-me-down-stuck-prompt.test.js drives the scene), Four Letter Words' playroom
 * (letter_block_2.js 191: five minutes) and Legalize It's Back Alley (card_carrying_qualification.js
 * 88: three minutes), which game.js runs itself and which never asked.
 * Run: node --test tests/stuck-prompt-places.test.js
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStuckAsker } from '../public/js/stuck-prompt.js?v=f36901d7';
import { FOUR_LETTER_EXIT_PROMPT_MS } from '../public/js/four-letter-quest.js?v=9540cc6f';
import { LEGALIZE_ALLEY_EXIT_PROMPT_MS } from '../public/js/legalize-it.js?v=fd70dda3';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60 * 1000;

function host(params = {}) {
  const h = {
    prompts: [],
    removed: [],
    data: {},
    dead: false,
    isBusy: false,
    prompt(o) {
      h.prompts.push(o);
      return `p${h.prompts.length}`;
    },
    removePrompt(uid) {
      h.removed.push(uid);
    },
    isDead: () => h.dead,
    busy: () => h.isBusy,
    setData(k, v) {
      h.data[k] = v;
    },
    param: (k) => params[k] ?? null,
  };
  return h;
}

describe('js/stuck-prompt.js asks as instances_show_exit_prompt did', () => {
  before(() => mock.timers.enable({ apis: ['Date'], now: 5_000_000 }));
  after(() => mock.timers.reset());

  it('after the delay, once; No thanks asks again two minutes later; Yes, please leaves', () => {
    const h = host();
    const asker = createStuckAsker();
    let left = 0;
    const tick = (ms) => {
      mock.timers.tick(ms);
      return asker.tick('room', h, { onYes: () => (left += 1) });
    };
    asker.arm('room', FOUR_LETTER_EXIT_PROMPT_MS, h);
    assert.equal(tick(5 * MIN - 1), false);
    assert.equal(tick(1), true);
    const p = h.prompts[0];
    assert.equal(p.text, 'Are you stuck? Do you want to leave this place?');
    assert.equal(p.iconButtons, true);
    assert.deepEqual(p.choices.map((c) => c.label), ['Yes, please', 'No thanks']);
    assert.equal(h.data.stuckPrompt, 'room');
    assert.equal(tick(10 * MIN), false, 'one at a time');
    p.onChoice('no');
    assert.equal(tick(2 * MIN - 1), false);
    assert.equal(tick(1), true);
    h.prompts[1].onChoice('yes');
    assert.equal(left, 1);
    assert.equal(asker.armed('room'), false);
    assert.equal(tick(10 * MIN), false);
  });

  it('dead: asked a minute later; busy (a dialog): waits; out of the place or a transition', () => {
    const h = host();
    const asker = createStuckAsker();
    asker.arm('room', 3 * MIN, h);
    h.dead = true;
    mock.timers.tick(3 * MIN);
    assert.equal(asker.tick('room', h), false);
    h.dead = false;
    mock.timers.tick(MIN - 1);
    assert.equal(asker.tick('room', h), false);
    mock.timers.tick(1);
    h.isBusy = true;
    assert.equal(asker.tick('room', h), false);
    assert.equal(asker.tick('room', h, { moving: true }), false, 'a transition waits');
    h.isBusy = false;
    assert.equal(asker.tick('room', h), true);
    // Out of the place (location.js onPlayerExit): the open prompt goes, never asked again.
    assert.equal(asker.tick('room', h, { here: false }), false);
    assert.deepEqual(h.removed, ['p1']);
    assert.equal(asker.armed('room'), false);
  });

  it('a finished quest takes it away; another place’s tick does nothing; QA &stuckpromptms=', () => {
    const h = host({ stuckpromptms: '2000' });
    const asker = createStuckAsker();
    asker.arm('room', 5 * MIN, h);
    mock.timers.tick(2000);
    assert.equal(asker.tick('other', h), false);
    assert.equal(asker.tick('room', h), true);
    asker.cancel('room', h);
    assert.deepEqual(h.removed, ['p1']);
    mock.timers.tick(10 * MIN);
    assert.equal(asker.tick('room', h), false);
  });
});

describe('game.js asks in its own instances', () => {
  const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
  const fn = (name) => {
    const start = game.indexOf(`function ${name}(`);
    assert.ok(start > 0, name);
    return game.slice(start, game.indexOf('\n}\n', start) + 2);
  };

  it('the delays are Glitch’s: five minutes in the playroom, three in the Back Alley', () => {
    assert.equal(FOUR_LETTER_EXIT_PROMPT_MS, 5 * MIN);
    assert.equal(LEGALIZE_ALLEY_EXIT_PROMPT_MS, 3 * MIN);
  });

  it('Four Letter Words: armed on arrival, asked each frame, Yes leaves (giving up an unsolved quest), gone when solved or left', () => {
    assert.match(fn('startFourLetterQuest'), /roomStuck\.arm\('four-letter', FOUR_LETTER_EXIT_PROMPT_MS, roomStuckHost\(\)\);/);
    const tick = fn('updateFourLetterQuest');
    assert.match(tick, /roomStuck\.tick\('four-letter', roomStuckHost\(\), \{\s*here: fourLetterIsInstanced\(\),/);
    assert.match(tick, /onYes: \(\) => leaveFourLetterQuest\(\{ abandon: fourLetterState\?\.status !== 'solved' \}\)/);
    assert.ok(tick.indexOf('roomStuck.tick') < tick.indexOf('if (!fourLetterIsInstanced()) return;'), 'asked before the early return');
    assert.match(fn('finishFourLetterQuest'), /roomStuck\.cancel\('four-letter', roomStuckHost\(\)\);/);
    assert.match(fn('leaveFourLetterQuest'), /roomStuck\.cancel\('four-letter', roomStuckHost\(\)\);/);
  });

  it('Legalize It: armed once the Back Alley is entered, Yes is the alley’s own way out', () => {
    const target = fn('handleLegalizeTarget');
    assert.match(target, /await legalizeSceneTransition\('The Back Alley', spawnLegalizeBackAlley\);\s*roomStuck\.arm\('legalize-alley', LEGALIZE_ALLEY_EXIT_PROMPT_MS, roomStuckHost\(\)\);/);
    const tick = fn('updateLegalizeIt');
    assert.match(tick, /roomStuck\.tick\('legalize-alley', roomStuckHost\(\), \{\s*here: legalizeIsInstanced\(\),\s*moving: legalizeTransitionBusy,\s*onYes: \(\) => legalizeExitAlley\(\),/);
    assert.ok(tick.indexOf('roomStuck.tick') < tick.indexOf('if (!legalizeOnRoute()'), 'asked before the early return');
  });

  it('the host is the prompt stack, Hell’s dead and the busy check that ignores being in an instance', () => {
    const h = fn('roomStuckHost');
    for (const want of ['engine.prompt(opts)', 'engine.removePrompt(uid)', 'playerIsDead()', 'engine.busy({ ignoreInstance: true })']) assert.ok(h.includes(want), want);
  });
});
