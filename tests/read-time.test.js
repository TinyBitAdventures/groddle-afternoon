/**
 * Ticket 69 (Friendly): "some pop up messages like the butler message and the
 * post-meditation messages don't last very long". One reading-time rule
 * (js/read-time.js: the client's bubble rule, 4 s + 300 ms a word, at most
 * 10 s, AvaChatBubbleManager.as 18-20 and 51) for notices and speech bubbles,
 * and a notice under NOTICE_KEEP_MS old is not pushed out by a newer one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_MAX_MS, READ_MIN_MS, READ_PER_WORD_MS, holdMs, readMs, wordCount } from '../public/js/read-time.js?v=60ae7efc';
import { NOTICE_KEEP_MS, createNotifier } from '../public/js/notify.js?v=37c6b748';
import { MEDITATION_TEXT } from '../public/js/meditation.js?v=380b2f3f';
import { BUTLER_STRINGS, ownerGreeting } from '../public/js/butler.js?v=86316578';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
};

function notifier() {
  let t = 1000;
  const n = createNotifier({ now: () => t, clock: () => t });
  return { n, advance: (ms) => (t += ms), now: () => t };
}

describe('readMs: the client bubble rule', () => {
  it('is 4 s plus 300 ms a word, at most 10 s', () => {
    assert.equal(READ_MIN_MS, 4000);
    assert.equal(READ_PER_WORD_MS, 300);
    assert.equal(READ_MAX_MS, 10_000);
    assert.equal(readMs(''), 4000);
    assert.equal(readMs('Hi'), 4300);
    assert.equal(readMs('Welcome home.'), 4600);
    assert.equal(readMs(Array(20).fill('word').join(' ')), 10_000);
    assert.equal(readMs(Array(60).fill('word').join(' ')), 10_000);
  });

  it('counts words, not spaces or markup', () => {
    assert.equal(wordCount('  one   two\nthree  '), 3);
    assert.equal(wordCount('<b>one</b> two'), 2);
    assert.equal(wordCount(null), 0);
  });

  it('holdMs keeps the caller time when it is longer', () => {
    assert.equal(holdMs('Hi', 3000), 4300);
    assert.equal(holdMs('Hi', 12_000), 12_000);
    assert.equal(holdMs('Hi'), 4300);
  });
});

describe('speech bubbles hold their reading time', () => {
  const game = read('public/game.js');
  it('showSpeechBubble takes the longer of the caller time and readMs', () => {
    const body = fnBody(game, 'showSpeechBubble');
    assert.match(body, /max: holdMs\(text, speech\.durationMs \|\| 5000\) \/ \(1000 \/ 60\)/);
    assert.match(game, /import \{ holdMs \} from '\.\/js\/read-time\.js(\?v=[0-9a-f]+)?';/);
  });
  it('groddleQA.speech() reports each bubble time and how long it has been up', () => {
    assert.match(game, /ms: Math\.round\(\(m\.max \|\| 0\) \* \(1000 \/ 60\)\)/);
    assert.match(game, /upMs: Math\.round\(\(m\.life \|\| 0\) \* \(1000 \/ 60\)\)/);
  });
});

describe('the Butler greeting', () => {
  const src = read('public/js/features/butler-feature.js');
  const body = fnBody(src, 'greetNow');
  it('says the greeting for its reading time, and the next line only after it', () => {
    assert.match(body, /const greetMs = holdMs\(g\.greeting, 3500\);\n\s+say\(engine, g\.greeting, greetMs, \{ activity: true \}\);/);
    assert.match(body, /\}, greetMs \+ BUTLER_GREET_GAP_MS\)\);/);
    assert.doesNotMatch(body, /3800/);
  });
  it('a taught greeting and an away line keep a longer greeting up longer', () => {
    const NOW = Date.UTC(2026, 10, 3);
    const plain = ownerGreeting({}, NOW);
    assert.equal(plain, BUTLER_STRINGS.ownerGreeting);
    assert.equal(holdMs(plain, 3500), 4600, 'Welcome home. is two words');
    const taught = ownerGreeting({ ownerGreeting: 'Pip pip, old bean, the kettle is on and the cat is fed.' }, NOW);
    assert.ok(holdMs(taught, 3500) > 7000, taught);
  });
});

describe('the meditation lines', () => {
  const src = read('public/js/features/meditation-feature.js');
  it('still raise the end line, the insight line and the zen toast in that order', () => {
    const a = src.indexOf('engine.pushActivity(out.message);');
    const b = src.indexOf('engine.pushActivity(`${name}: a flash of insight. +${out.imgBonus} iMG`);');
    const c = src.indexOf('engine.toast(MEDITATION_TEXT.zenReached, 3600);');
    assert.ok(a > 0 && b > a && c > b);
  });

  it('the end line with an insight line stays up its full reading time', () => {
    const { n, advance } = notifier();
    const end = `${MEDITATION_TEXT.end[0]} That was relaxing. +12 mood, +8 energy, +5 iMG`;
    n.activity(end);
    n.activity('Focused Imagination: a flash of insight. +3 iMG');
    const life = readMs(end);
    assert.ok(life > 6000, `${life}`);
    advance(life - 1);
    n.tick();
    assert.ok(n.notices.some((x) => x.text === end));
    advance(1);
    n.tick();
    assert.ok(!n.notices.some((x) => x.text === end));
  });

  it('with all three at once the end line is not knocked off at once: it shows NOTICE_KEEP_MS, then the zen line', () => {
    const { n, advance } = notifier();
    const end = `${MEDITATION_TEXT.end[1]} That was relaxing. +4 energy, +5 iMG`;
    n.activity(end);
    n.activity('Focused Imagination: a flash of insight. +3 iMG');
    n.notice(MEDITATION_TEXT.zenReached, { ms: 3600 });
    assert.equal(n.notices[0].text, end, 'still showing the moment the zen line is raised');
    assert.equal(n.waiting[0].text, MEDITATION_TEXT.zenReached);
    advance(NOTICE_KEEP_MS - 1);
    n.tick();
    assert.equal(n.notices[0].text, end);
    advance(1);
    n.tick();
    assert.deepEqual(n.notices.map((x) => x.text), ['Focused Imagination: a flash of insight. +3 iMG', MEDITATION_TEXT.zenReached]);
    assert.equal(n.notices[1].ms, readMs(MEDITATION_TEXT.zenReached), 'the zen line holds its reading time, not 3.6 s');
    // All three are in the Activity log.
    assert.equal(n.entries.length, 3);
  });
});
