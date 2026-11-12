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
import { READ_MAX_MS, READ_MIN_MS, READ_PER_WORD_MS, bubbleMs, holdMs, readMs, wordCount } from '../public/js/read-time.js?v=be140198';
import { NOTICE_KEEP_MS, createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { MEDITATION_TEXT } from '../public/js/meditation.js?v=96f23682';
import { BUTLER_STRINGS, ownerGreeting } from '../public/js/butler.js?v=8232e2c7';

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
    assert.match(body, /max: bubbleMs\(text, speech\.durationMs, speech\.exact === true && !named\) \/ \(1000 \/ 60\)/);
    assert.match(game, /import \{ bubbleMs \} from '\.\/js\/read-time\.js(\?v=[0-9a-f]+)?';/);
    // The case ticket 69 fixed: a long line given a short time (the Butler's taught greeting at 3.5 s).
    const long = 'Pip pip, old bean, the kettle is on and the cat is fed.';
    assert.equal(bubbleMs(long, 3500), readMs(long));
    assert.ok(bubbleMs(long, 3500) > 7000);
    assert.equal(bubbleMs('Hi', 12_000), 12_000, 'a longer time asked is kept');
  });

  it('a line with no time gets the client default, its reading time (LisChatBubbleManager.as 112)', () => {
    assert.equal(bubbleMs('Hi'), 4300);
    assert.equal(bubbleMs('Hi', 0), 4300);
    assert.equal(bubbleMs(Array(30).fill('word').join(' ')), 10_000);
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

describe("inhabitants' lines keep the source's own times (G629)", () => {
  const game = read('public/game.js');
  it('an exact time is used as given, short or long', () => {
    assert.equal(bubbleMs('Yum!', 3000, true), 3000, 'npc_piggy.js 1496: 3 s, not the 4.3 s reading time');
    assert.equal(bubbleMs('Mew!', 1000, true), 1000, 'npc_kitty_chicken.js 1221');
    assert.equal(bubbleMs('purrrrrr', 2000, true), 2000);
    assert.equal(bubbleMs("I'm about to croak!", 10_000, true), 10_000);
    // Marked exact with no time: nothing to keep, so the reading time.
    assert.equal(bubbleMs('Yum!', 0, true), 4300);
  });

  it("a player's bubble never takes an exact time, and the Butler's greeting keeps its reading time", () => {
    const body = fnBody(game, 'showSpeechBubble');
    assert.match(body, /const named = target\.classId === 'pc_player' \|\| target\.classId === 'pc_remote';/);
    assert.ok(body.indexOf('const named =') < body.indexOf('max: bubbleMs('));
    const butler = read('public/js/features/butler-feature.js');
    assert.match(fnBody(butler, 'greetNow'), /const greetMs = holdMs\(g\.greeting, 3500\);/);
    assert.doesNotMatch(butler, /exact: true/);
    assert.doesNotMatch(read('public/js/features/realtime-feature.js'), /exact: true/);
  });

  it('the lines checked against the source are marked', () => {
    const mood = read('public/js/features/animal-mood-feature.js');
    // npc_piggy.js 1477, 1496, 1505, 1939; include/animal_sadness.js 88, 193-199.
    assert.equal(mood.match(/say\(engine, target, PIGGY_LINES\.yum, PIGGY_LINES\.yumMs, true\);/g).length, 4);
    assert.match(mood, /PIGGY_LINES\.croak, PIGGY_LINES\.croakMs, true\)/);
    assert.match(mood, /PIGGY_LINES\.happy, 3000, true\)/);
    assert.match(mood, /pickLine\(SAD_PIGGY_LINES\), 7000, true\)/);
    assert.match(mood, /engine\.say\(target, text, ms, exact \? \{ exact: true \} : null\)/);
    const husbandry = read('public/js/features/animal-husbandry-feature.js');
    assert.match(husbandry, /'Yum!', 3000, \{ exact: true \}\)/);
    // include/animal_naming.js 49.
    assert.match(husbandry, /And they shall call me "\$\{name\}"`, 5000, \{ exact: true \}\)/);
    const kitties = read('public/js/features/heli-kitties-feature.js');
    // npc_kitty_chicken.js 1221 (Mew! 1 s), 279 (purrrrrr 2 s).
    assert.match(kitties, /KITTY_MOTION\.mewBubble, KITTY_MOTION\.mewBubbleMs, \{ exact: true \}\)/);
    assert.match(kitties, /KITTY_PET\.bubbleMs, \{ slugs: [^\n]*, exact: true \}\);/);
    const content = read('public/content.js');
    // npc_chicken.js 230 (2 s), npc_butterfly.js 677 (5 s).
    assert.match(content, /durationMs: butter\.bubbleMs, exact: true/);
    assert.match(content, /durationMs: sung\.bubbleMs, exact: true/);
    // item.js sendResponse 1064 (3.5 s), npc_crab.js 548 (4 s), npc_yoga_frog.js 193 (3 s), npc_forehorseman.js 190 (3 s).
    // A plot's answer is marked where the plot's verb hands it on (content.js), not in the garden rules.
    assert.match(content, /function plotSpeech\(speech\) \{\n\s+return speech \? \{ \.\.\.speech, exact: true \} : null;\n\}/);
    assert.equal(content.match(/speech: plotSpeech\(r\.speech\)/g).length, 2, 'a plot verb that worked, and one refused with its line');
    assert.doesNotMatch(read('public/js/garden.js'), /exact: true/);
    assert.match(read('public/js/features/crabs-feature.js'), /CRAB_REPLY_MS, \{\n\s+exact: true,/);
    assert.match(read('public/js/features/mail-courier-feature.js'), /COURIER\.bubbleMs, \{ exact: true \}\)/);
    assert.equal(read('public/js/features/rook-attack-feature.js').match(/ROOK_SOURCE\.forehorsemanBubbleMs, \{ exact: true \}\)/g).length, 2);
  });
});
