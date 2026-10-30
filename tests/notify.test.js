/**
 * NOTIFY (UI audit 2026-10-29, section 4 and top-10 item 1): one notification
 * system. js/notify.js has the rules (notices, gains, moments, chat, the
 * Activity log, zones); js/notify-view.js draws them; game.js routes every
 * toast, activity line, float and award line through it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createNotifier,
  noticeKey,
  parseGainLine,
  effectTokens,
  gainLineText,
  stackFloat,
  placeBelow,
  placeBeside,
  NOTICE_LIMIT,
  NOTICE_MS,
  LOG_LIMIT,
  REPEAT_MS,
  GAIN_BATCH_MS,
  FLOAT_LINE_PX,
} from '../public/js/notify.js?v=g459-1';
import { REMAKE_SCREEN_GATES, SCREEN_GATES, screenQueueHold, waitForScreenGates } from '../public/js/screen-queue.js?v=g459-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function notifier(opts = {}) {
  const clock = fakeClock();
  const changes = [];
  const n = createNotifier({ now: clock.now, clock: clock.now, onChange: (w) => changes.push(w), ...opts });
  return { n, clock, changes };
}

describe('notices: de-duplication', () => {
  it('the same words within the window show once, with a count, and log once', () => {
    const { n, clock } = notifier();
    n.notice('Your pack has 16 slots now.');
    clock.advance(500);
    n.notice('Your pack has 16 slots now.');
    clock.advance(500);
    n.notice('your pack has 16 slots now');
    assert.equal(n.notices.length, 1);
    assert.equal(n.notices[0].count, 3);
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].count, 3);
    assert.equal(n.stats.repeats, 2);
  });

  it('a toast and its activity line (the same words plus amounts) are one notice; the longer wording shows', () => {
    const { n } = notifier();
    n.notice('Harvested 3 Cherries.');
    n.activity('Harvested 3 Cherries. -2 energy, +1 mood.');
    assert.equal(n.notices.length, 1);
    assert.equal(n.notices[0].count, 1, 'one event said twice is not a repeat');
    assert.equal(n.notices[0].text, 'Harvested 3 Cherries. -2 energy, +1 mood.');
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].text, 'Harvested 3 Cherries. -2 energy, +1 mood.');
  });

  it('the key ignores case, punctuation and signed stat amounts, not other numbers', () => {
    assert.equal(noticeKey('Harvested 3 Cherries! +3 iMG, −2 energy'), 'harvested 3 cherries');
    assert.notEqual(noticeKey('Riddle 2 solved'), noticeKey('Riddle 3 solved'));
    assert.equal(noticeKey('<b>Hi</b> there.'), 'hi there');
  });

  it('after the window the same words are a new notice and a new log line', () => {
    const { n, clock } = notifier();
    n.notice('Arrived: Hechey Track');
    clock.advance(REPEAT_MS + NOTICE_MS + 1);
    n.tick();
    assert.equal(n.notices.length, 0);
    n.notice('Arrived: Hechey Track');
    assert.equal(n.notices.length, 1);
    assert.equal(n.notices[0].count, 1);
    assert.equal(n.entries.length, 2);
  });
});

describe('notices: at most two, newest replaces oldest, auto-dismiss', () => {
  it('keeps the newest NOTICE_LIMIT', () => {
    assert.equal(NOTICE_LIMIT, 2);
    const { n } = notifier();
    n.notice('one');
    n.notice('two');
    n.notice('three');
    assert.deepEqual(n.notices.map((x) => x.text), ['two', 'three']);
    assert.equal(n.stats.dropped, 1);
    // Every one is still in the log.
    assert.deepEqual(n.entries.map((e) => e.text), ['one', 'two', 'three']);
  });

  it('goes after its time; a held clock (loading card) stops it', () => {
    let held = false;
    const { n, clock } = notifier({ held: () => held });
    n.notice('Arrived: Groddle Meadow', { ms: 3000 });
    clock.advance(1000);
    n.tick();
    held = true;
    clock.advance(10_000);
    n.tick();
    assert.equal(n.notices.length, 1, 'held under the card');
    held = false;
    clock.advance(1900);
    n.tick();
    assert.equal(n.notices.length, 1, 'its remaining time runs after the card');
    clock.advance(200);
    n.tick();
    assert.equal(n.notices.length, 0);
  });

  it('a view hold (no room, a screen up) pauses it too, and a panel opened after it sends it early', () => {
    const { n, clock } = notifier();
    n.notice('You bought 3 Cherries.');
    clock.advance(NOTICE_MS * 3);
    n.tick({ hold: true });
    assert.equal(n.notices.length, 1);
    const raisedBefore = clock.now();
    clock.advance(10);
    n.tick({ dropBefore: raisedBefore });
    assert.equal(n.notices.length, 0);
    assert.equal(n.entries.length, 1, 'its line stays in the log');
  });

  it('dismiss takes one away', () => {
    const { n } = notifier();
    const a = n.notice('a');
    n.notice('b');
    assert.equal(n.dismiss(a.id), true);
    assert.deepEqual(n.notices.map((x) => x.text), ['b']);
  });
});

describe('gains: batching into one log line, no notice', () => {
  it('{ base, effects } is a gain: one log line with its amounts, no notice', () => {
    const { n } = notifier();
    n.activity({ base: 'You pet a Piggy.', effects: { energy: -4, mood: 1, xp: 1 } });
    assert.equal(n.notices.length, 0);
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].kind, 'gain');
    assert.equal(n.entries[0].text, 'You pet a Piggy. -4 energy, +1 mood, +1 iMG.');
  });

  it('a burst of the same gain is one line counted ×N with summed amounts', () => {
    const { n, clock } = notifier();
    n.gain('You collected an iMG quoin. +3 iMG.');
    clock.advance(GAIN_BATCH_MS - 50);
    n.gain('You collected an iMG quoin. +5 iMG.');
    clock.advance(GAIN_BATCH_MS - 50);
    n.gain('You collected an iMG quoin. +2 iMG.');
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].count, 3);
    assert.equal(n.entries[0].text, 'You collected an iMG quoin. +10 iMG.');
    assert.equal(n.stats.batched, 2);
  });

  it('bare amounts in the burst join the line before; a gain after the burst is its own line', () => {
    const { n, clock } = notifier();
    n.gain('You harvest a Cherry Tree. -2 energy, +3 Cherry.');
    clock.advance(100);
    n.gain('', { tokens: [{ n: 1, unit: 'mood' }, { n: 2, unit: 'Cherry' }] });
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].text, 'You harvest a Cherry Tree. -2 energy, +5 Cherry, +1 mood.');
    clock.advance(GAIN_BATCH_MS + 1);
    n.gain('You harvest a Cherry Tree. -2 energy, +3 Cherry.');
    assert.equal(n.entries.length, 2);
  });

  it('a different action in the burst is its own line', () => {
    const { n } = notifier();
    n.gain('You pet a Piggy. -4 energy.');
    n.gain('You harvest a Cherry Tree. -2 energy.');
    assert.equal(n.entries.length, 2);
  });

  it('a toast then its gain line (same words) are one log line, the gain', () => {
    const { n } = notifier();
    n.notice('You ate a Cherry.');
    n.activity({ base: 'You ate a Cherry.', effects: { energy: 3 } });
    assert.equal(n.entries.length, 1);
    assert.equal(n.entries[0].kind, 'gain');
    assert.equal(n.entries[0].text, 'You ate a Cherry. +3 energy.');
  });

  it('parses the amounts formatActivityLine writes', () => {
    assert.deepEqual(parseGainLine('You pet a Piggy. -4 energy, +1 mood, +1 iMG.'), {
      base: 'You pet a Piggy.',
      tokens: [{ n: -4, unit: 'energy' }, { n: 1, unit: 'mood' }, { n: 1, unit: 'iMG' }],
    });
    assert.deepEqual(parseGainLine('Nothing happened.'), { base: 'Nothing happened.', tokens: [] });
    assert.equal(parseGainLine('Score -3 to +4 in a row of things'), null);
    assert.deepEqual(effectTokens({ energy: -2, img: 3, items: { cherry: 4 } }, (id) => id.toUpperCase()), [
      { n: -2, unit: 'energy' }, { n: 3, unit: 'iMG' }, { n: 4, unit: 'CHERRY' },
    ]);
    assert.equal(gainLineText('Done!', [{ n: 2, unit: 'mood' }]), 'Done! +2 mood.');
  });
});

describe('moments and chat: logged, never a notice', () => {
  it('a moment logs its line and takes the same words off the notices', () => {
    const { n } = notifier();
    n.notice('Badge earned: Fruit Picker.');
    n.moment('Badge earned: Fruit Picker.');
    assert.equal(n.notices.length, 0);
    assert.equal(n.entries.at(-1).kind, 'moment');
  });

  it('solo chat is in the log (scrollback, not unread); online chat stays in chat', () => {
    const { n } = notifier();
    n.chat('Ur: hello');
    n.chat('Ur: hi', { online: true });
    assert.deepEqual(n.entries.map((e) => [e.kind, e.text]), [['chat', 'Ur: hello']]);
    assert.equal(n.notices.length, 0);
    assert.equal(n.unread, 0);
  });
});

describe('the Activity log', () => {
  it('keeps LOG_LIMIT lines, the newest', () => {
    assert.equal(LOG_LIMIT, 200);
    const { n } = notifier({ logLimit: 5 });
    for (let i = 0; i < 12; i++) n.log(`line ${i}`);
    assert.equal(n.entries.length, 5);
    assert.deepEqual(n.entries.map((e) => e.text), ['line 7', 'line 8', 'line 9', 'line 10', 'line 11']);
  });

  it('the default cap holds under a long session', () => {
    const { n, clock } = notifier();
    for (let i = 0; i < 500; i++) {
      n.notice(`notice ${i}`);
      clock.advance(10);
    }
    assert.equal(n.entries.length, LOG_LIMIT);
    assert.equal(n.entries[0].text, 'notice 300');
  });

  it('counts unread lines until read', () => {
    const { n, changes } = notifier();
    n.notice('a');
    n.log('b');
    assert.equal(n.unread, 2);
    n.markRead();
    assert.equal(n.unread, 0);
    assert.ok(changes.includes('read'));
  });
});

describe('big moments wait behind dialogs and panels (screen queue)', () => {
  it('the remake gates come after the client gates', () => {
    assert.deepEqual(REMAKE_SCREEN_GATES.map(([k]) => k), ['panel', 'dialog']);
    assert.equal(SCREEN_GATES.some(([k]) => k === 'panel' || k === 'dialog'), false);
    assert.equal(screenQueueHold({ panel: true }), 'panel open');
    assert.equal(screenQueueHold({ dialog: true }), 'dialog open');
    assert.equal(screenQueueHold({ choicesDialog: true, dialog: true }), 'ChoicesDialog');
    assert.equal(screenQueueHold({}), '');
  });

  it('a moment raised during a conversation shows only once it closes', async () => {
    const timers = [];
    const gate = { dialog: true };
    let shown = false;
    const holds = [];
    const wait = waitForScreenGates(() => gate, { setTimer: (fn) => timers.push(fn), onHold: (w) => holds.push(w) }).then(() => {
      shown = true;
    });
    assert.deepEqual(holds, ['dialog open']);
    timers.shift()();
    await Promise.resolve();
    assert.equal(shown, false);
    gate.dialog = false;
    gate.panel = true;
    timers.shift()();
    assert.equal(holds.at(-1), 'panel open');
    gate.panel = false;
    timers.shift()();
    await wait;
    assert.equal(shown, true);
  });

  it('game.js feeds both gates and the announcers log their lines as moments', () => {
    const game = read('public/game.js');
    assert.match(game, /\n\s+panel: Boolean\(openGlitchModal\(\)\),/);
    assert.match(game, /\n\s+dialog: conversationCardOpen\(\),/);
    for (const re of [
      /logMoment\(`Badge earned: /,
      /logMoment\(\n\s+`Quest complete: /,
      /logMoment\(activity\);\n\s+enqueueAward\(\{\n\s+kind: 'level'/,
      /logMoment\(skillLearnedActivity\(/,
      /logMoment\(`The Shrine grants you an Emblem/,
    ]) assert.match(game, re);
  });
});

describe('zones', () => {
  it('placeBelow moves under what is in the way, or waits when nothing fits', () => {
    const notices = { left: 300, right: 700, top: 50, bottom: 90 };
    const banner = { left: 200, right: 800, top: 60, bottom: 120 };
    assert.deepEqual(placeBelow(notices, [banner], { margin: 6 }), { dy: 76, wait: false });
    assert.deepEqual(placeBelow(notices, []), { dy: 0, wait: false });
    const verb = { left: 350, right: 650, top: 126, bottom: 500 };
    assert.deepEqual(placeBelow(notices, [banner, verb], { margin: 6, maxBottom: 400 }), { dy: 0, wait: true });
    assert.equal(placeBelow(notices, [banner, verb], { margin: 6, maxBottom: 700 }).dy, 456);
    // Side by side (a verb card stepped aside to x 300), touching is clear.
    assert.deepEqual(placeBelow(notices, [{ left: 0, right: 300, top: 40, bottom: 400 }], { margin: 6 }), { dy: 0, wait: false });
  });

  it('placeBeside picks the shorter clear side', () => {
    const card = { left: 400, right: 600, top: 100, bottom: 300 };
    const talk = { left: 450, right: 700, top: 200, bottom: 320 };
    assert.deepEqual(placeBeside(card, [talk], { margin: 8, minLeft: 0, maxRight: 1000 }), { dx: -158, ok: true });
    assert.equal(placeBeside(card, [talk], { margin: 8, minLeft: 300, maxRight: 750 }).ok, false);
  });

  it('floats near one spot stack a line apart', () => {
    const recent = [];
    const y1 = stackFloat(recent, 100, 200, 0);
    recent.push({ x: 100, y: y1, t: 0 });
    const y2 = stackFloat(recent, 110, 200, 50);
    recent.push({ x: 110, y: y2, t: 50 });
    const y3 = stackFloat(recent, 90, 200, 60);
    assert.deepEqual([y1, y2, y3], [200, 200 - FLOAT_LINE_PX, 200 - 2 * FLOAT_LINE_PX]);
    assert.equal(stackFloat(recent, 400, 200, 60), 200, 'far away: no stacking');
    assert.equal(stackFloat(recent, 100, 200, 5000), 200, 'later: no stacking');
  });
});

describe('one module: no direct notice DOM writes outside it', () => {
  const files = [join(PUBLIC, 'game.js')];
  for (const dir of ['js', 'js/features', 'js/quest-rooms']) {
    for (const f of readdirSync(join(PUBLIC, dir))) if (f.endsWith('.js')) files.push(join(PUBLIC, dir, f));
  }
  it('no game file reaches for the old #toast or #activity-feed, or the notice stack', () => {
    for (const f of files) {
      if (/notify(-view)?\.js$/.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /getElementById\(['"](toast|activity-feed|notify-notices)['"]\)/, f);
      assert.doesNotMatch(src, /querySelector(All)?\(['"][^'"]*(#toast|#activity-feed|\.notify-card|#notify-notices)/, f);
    }
  });

  it('the page has neither old element; toast() and pushActivity() are the notifier', () => {
    const html = read('public/play/index.html');
    assert.doesNotMatch(html, /id="toast"/);
    assert.doesNotMatch(html, /id="activity-feed"/);
    const game = read('public/game.js');
    assert.match(game, /function toast\(msg, ms = 3000\) \{\n\s+notify\.notice\(wholeStatAmounts\(msg\), \{ ms \}\);\n\}/);
    assert.match(game, /function pushActivity\(msg\) \{[\s\S]{0,400}notify\.activity\(msg, \{ labelOf \}\);/);
    assert.match(game, /import \{ createNotifier[^}]*\} from '\.\/js\/notify\.js\?v=g\d+-\d+';/);
    // The engine's toast and pushActivity are those functions (features call engine.toast).
    assert.match(game, /\n  toast,\n  pushActivity,\n/);
  });

  it('a notice clock still stops under the street card and the multiplayer start card', () => {
    const game = read('public/game.js');
    assert.match(game, /function toastHeld\(\) \{\n\s+return streetCardUp\(\) \|\| \(GAME_MODE === 'multiplayer' && !state\.started\);\n\}/);
    assert.match(game, /const notify = createNotifier\(\{\n\s+held: \(\) => toastHeld\(\),/);
    assert.match(game, /const hold = toastHeld\(\) \? 'card' : isScreenViewOpen\(\) \? 'screen' : '';/);
    const css = read('public/style.css');
    assert.match(css, /html\[data-street-cards\] \.notify-notices \{ visibility: hidden; \}/);
  });

  it('a successful verb that changed something is a gain (float + log), not a notice', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(result\.ok && verbChangedSomething\(result\.effects\)[^\n]*\{\n\s+if \(showLine\) floatText\(target\.sprite\.x, target\.sprite\.y - 50, toastLine, 0xfff4d6, \{ life: 110 \}\);\n\s+logGain\(feedLine\);/);
  });

  it('reduced motion: floats do not rise, cards do not slide', () => {
    const game = read('public/game.js');
    assert.match(game, /t\._vy = notifyView\?\.reducedMotion\(\) \? 0 : -0\.7;/);
    assert.match(game, /t\.y \+= \(t\._vy \?\? -0\.55\) \* dt;/);
    const css = read('public/style.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.notify-card, \.activity-log \{ animation: none; \}/);
  });
});
