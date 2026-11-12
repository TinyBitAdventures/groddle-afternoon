/**
 * The chat box that wraps (js/ui/chat-input.js, Austin 2026-11-04): a text area that grows from one
 * line to five and then scrolls, Enter sends, no new lines (the server makes every chat line one line:
 * hub.go cleanChat), Up and Down walk the history from the first or last line. Both skins' boxes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_BUBBLE_CHARS, CHAT_MAX_CHARS, MAX_ROWS, bindChatInput, chatBubbleText, fitHeight, heldAtFocus, historyKey, keyWatch, oneLine, sendKey, strayRepeat } from '../public/js/ui/chat-input.js?v=72d000ac';
import { FakeEl } from './social-fake-dom.js';
import { MAX_CHAT } from '../public/js/realtime-client.js?v=cda54c6e';
import { SERVER_DIR, SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the chat box: rules', () => {
  it('a message is one line: line breaks become one space', () => {
    assert.equal(oneLine('hello\nthere'), 'hello there');
    assert.equal(oneLine('a \r\n\r\n  b'), 'a b');
    assert.equal(oneLine('a b c'), 'a b c');
    assert.equal(oneLine('no breaks  here'), 'no breaks  here');
    assert.equal(oneLine(null), '');
  });

  it('grows from one line to five, then scrolls', () => {
    assert.equal(MAX_ROWS, 5);
    // The Modern box: 18 px lines, 14 px of padding and 2 of border (border-box).
    const box = (sh) => fitHeight({ scrollHeight: sh, lineHeight: 18, extra: 16, border: 2 });
    assert.deepEqual(box(32), { height: 34, scroll: false }, 'one line is the old 34 px box');
    assert.deepEqual(box(0), { height: 34, scroll: false }, 'never shorter than one line');
    assert.deepEqual(box(50), { height: 52, scroll: false });
    assert.deepEqual(box(18 * 5 + 14), { height: 106, scroll: false }, 'five lines');
    assert.deepEqual(box(18 * 9 + 14), { height: 106, scroll: true }, 'more than five scroll');
  });

  it('Enter sends; Shift+Enter, modified Enter and an input method\'s Enter do not', () => {
    assert.equal(sendKey({ key: 'Enter' }), true);
    for (const e of [{ key: 'Enter', shiftKey: true }, { key: 'Enter', altKey: true }, { key: 'Enter', ctrlKey: true }, { key: 'Enter', metaKey: true }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'a' }, null]) {
      assert.equal(sendKey(e), false, JSON.stringify(e));
    }
  });

  it('Up and Down are the history from the first or last line, else the caret moves', () => {
    assert.equal(historyKey('ArrowUp', { start: 5, end: 5, length: 10, rows: 1 }), true, 'one line: always the history');
    assert.equal(historyKey('ArrowDown', { start: 5, end: 5, length: 10, rows: 1 }), true);
    assert.equal(historyKey('ArrowUp', { start: 40, end: 40, length: 90, rows: 3, caretRow: 1 }), false, 'the middle line moves the caret');
    assert.equal(historyKey('ArrowUp', { start: 4, end: 4, length: 90, rows: 3, caretRow: 0 }), true);
    assert.equal(historyKey('ArrowUp', { start: 0, end: 0, length: 90, rows: 3, caretRow: 2 }), true, 'at the very start');
    assert.equal(historyKey('ArrowDown', { start: 40, end: 40, length: 90, rows: 3, caretRow: 1 }), false);
    assert.equal(historyKey('ArrowDown', { start: 80, end: 80, length: 90, rows: 3, caretRow: 2 }), true);
    assert.equal(historyKey('ArrowDown', { start: 90, end: 90, length: 90, rows: 3, caretRow: 0 }), true, 'at the very end');
    assert.equal(historyKey('ArrowUp', { start: 0, end: 4, length: 10, rows: 1 }), false, 'text selected: the selection moves');
    assert.equal(historyKey('Enter', {}), false);
  });
});

describe('the chat box: wired', () => {
  function field() {
    const f = new FakeEl('textarea');
    const form = new FakeEl('form');
    form.submits = 0;
    form.requestSubmit = () => { form.submits += 1; };
    form.append(f);
    f.selectionStart = 0;
    f.selectionEnd = 0;
    f.setSelectionRange = (a, b) => { f.selectionStart = a; f.selectionEnd = b; };
    return { f, form };
  }

  it('Enter submits the form and adds no new line; Shift+Enter adds nothing', () => {
    const { f, form } = field();
    bindChatInput(f, { form, win: {} });
    const enter = f.dispatch('keydown', { key: 'Enter' });
    assert.equal(enter.defaultPrevented, true);
    assert.equal(form.submits, 1);
    const shift = f.dispatch('keydown', { key: 'Enter', shiftKey: true });
    assert.equal(shift.defaultPrevented, true, 'no new line');
    assert.equal(form.submits, 1, 'and not sent');
    const ime = f.dispatch('keydown', { key: 'Enter', isComposing: true });
    assert.equal(ime.defaultPrevented, false, 'an input method keeps its Enter');
    assert.equal(form.submits, 1);
  });

  it('a pasted line break becomes a space', () => {
    const { f, form } = field();
    bindChatInput(f, { form, win: {} });
    f.value = 'one\ntwo\r\nthree';
    f.selectionStart = f.value.length;
    f.dispatch('input');
    assert.equal(f.value, 'one two three');
  });

  it('Up and Down give the history only where historyKey allows', () => {
    const { f, form } = field();
    const asked = [];
    bindChatInput(f, { form, win: {}, onHistory: (k) => { asked.push(k); return true; } });
    const up = f.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(up.defaultPrevented, true);
    f.selectionStart = 0;
    f.selectionEnd = 3;
    const sel = f.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(sel.defaultPrevented, false);
    assert.deepEqual(asked, ['ArrowUp']);
  });

  it('G563: a walking key held from before the box opened repeats into it typing nothing', () => {
    // Walk with D, press / to talk: the D keeps auto-repeating into the box ("d/home" went out as chat).
    const { f, form } = field();
    bindChatInput(f, { form, win: {} });
    const repeats = [1, 2, 3].map(() => f.dispatch('keydown', { key: 'd', code: 'KeyD', repeat: true }));
    assert.ok(repeats.every((e) => e.defaultPrevented), 'the held D types nothing');
    f.dispatch('keyup', { key: 'd', code: 'KeyD' });
    // Pressed in the box, a key types and repeats as usual (holding a letter, Shift or not).
    const fresh = f.dispatch('keydown', { key: 'd', code: 'KeyD' });
    assert.equal(fresh.defaultPrevented, false);
    assert.equal(f.dispatch('keydown', { key: 'D', code: 'KeyD', repeat: true, shiftKey: true }).defaultPrevented, false);
    f.dispatch('keyup', { key: 'd', code: 'KeyD' });
    // Leaving the box forgets what went down in it.
    f.dispatch('keydown', { key: 'a', code: 'KeyA' });
    f.dispatch('blur');
    assert.equal(f.dispatch('keydown', { key: 'a', code: 'KeyA', repeat: true }).defaultPrevented, true);
    assert.equal(strayRepeat({ key: 'x', repeat: false }, new Set()), false);
    assert.equal(strayRepeat({ key: 'x', code: 'KeyX', repeat: true, isComposing: true }, new Set()), false, 'an input method keeps its keys');
  });

  it('G563: a walking key down when the box takes the keyboard types nothing until it comes up', () => {
    // The page: the window watches keys in the capture phase; the box sits in it.
    const win = new FakeEl('window');
    const { f, form } = field();
    win.append(form);
    bindChatInput(f, { form, win });
    assert.equal(keyWatch(win), keyWatch(win), 'one watch a window');
    // Walking with A (the key goes to the page, not the box), then / takes the keyboard to the box.
    win.dispatch('keydown', { key: 'a', code: 'KeyA' });
    win.dispatch('keydown', { key: '/', code: 'Slash' });
    f.dispatch('focus');
    // The held A, marked as a repeat or not (remote desktops send them unmarked), types nothing:
    // its keydown, its keypress and the text it would insert.
    const marked = f.dispatch('keydown', { key: 'a', code: 'KeyA', repeat: true });
    assert.equal(marked.defaultPrevented, true);
    const unmarked = f.dispatch('keydown', { key: 'a', code: 'KeyA' });
    assert.equal(unmarked.defaultPrevented, true, 'an unmarked repeat of the held A');
    assert.equal(f.dispatch('keypress', { key: 'a', code: 'KeyA' }).defaultPrevented, true);
    assert.equal(f.dispatch('beforeinput', { inputType: 'insertText', data: 'a' }).defaultPrevented, true);
    // Other keys type while it is held: the command itself.
    for (const k of ['l', 'e']) assert.equal(f.dispatch('keydown', { key: k, code: `Key${k.toUpperCase()}` }).defaultPrevented, false, k);
    assert.equal(f.dispatch('beforeinput', { inputType: 'insertText', data: 'e' }).defaultPrevented, false);
    // The / that opened the box was down too: a second / after it came up types (a "/leave" typed after /).
    f.dispatch('keyup', { key: '/', code: 'Slash' });
    assert.equal(f.dispatch('keydown', { key: '/', code: 'Slash' }).defaultPrevented, false);
    // Once the A comes up, a real "a" pressed in the box types, and repeats if held.
    f.dispatch('keyup', { key: 'a', code: 'KeyA' });
    assert.equal(f.dispatch('keydown', { key: 'a', code: 'KeyA' }).defaultPrevented, false, 'a fresh a types');
    assert.equal(f.dispatch('keypress', { key: 'a', code: 'KeyA' }).defaultPrevented, false);
    assert.equal(f.dispatch('keydown', { key: 'a', code: 'KeyA', repeat: true }).defaultPrevented, false, 'and repeats');
    f.dispatch('keyup', { key: 'a', code: 'KeyA' });
    f.dispatch('blur');
    // A box opened with nothing held types the first letter (a real "a" as the first letter).
    f.dispatch('focus');
    assert.equal(f.dispatch('keydown', { key: 'a', code: 'KeyA' }).defaultPrevented, false);
    f.dispatch('keyup', { key: 'a', code: 'KeyA' });
    f.dispatch('blur');
    // Arrow keys held for walking (they would move the caret) and Shift+D: the physical key counts.
    win.dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    win.dispatch('keydown', { key: 'd', code: 'KeyD' });
    f.dispatch('focus');
    assert.equal(f.dispatch('keydown', { key: 'ArrowRight', code: 'ArrowRight', repeat: true }).defaultPrevented, true);
    assert.equal(f.dispatch('keydown', { key: 'D', code: 'KeyD', shiftKey: true }).defaultPrevented, true);
    // Cmd coming up forgets the held keys (their own key-ups can go missing, js/held-keys.js).
    f.dispatch('keyup', { key: 'Meta', code: 'MetaLeft' });
    assert.equal(f.dispatch('keydown', { key: 'd', code: 'KeyD' }).defaultPrevented, false);
    f.dispatch('blur');
    // The window losing focus forgets what was down.
    win.dispatch('keydown', { key: 's', code: 'KeyS' });
    win.dispatch('blur');
    f.dispatch('focus');
    assert.equal(f.dispatch('keydown', { key: 's', code: 'KeyS' }).defaultPrevented, false);
    assert.equal(heldAtFocus({ key: 'a', code: 'KeyA', isComposing: true }, new Set(['keya'])), false, 'an input method keeps its keys');
    assert.equal(heldAtFocus({ key: 'a', code: 'KeyA' }, new Set()), false);
    assert.equal(keyWatch({}), null, 'no window, no watch (strayRepeat still drops repeats)');
  });

  it('a chat line holds 1,000 characters, as the original box did, in the box, the client, the server and the site', () => {
    assert.equal(CHAT_MAX_CHARS, 1000);
    assert.equal(MAX_CHAT, CHAT_MAX_CHARS, 'what the client sends');
    const game = read('public/game.js');
    assert.match(game, /const typed = String\(message \|\| ''\)\.trim\(\)\.slice\(0, CHAT_MAX_CHARS\);/, 'what a solo player says');
    assert.doesNotMatch(game, /slice\(0, 180\);\n  if \(!typed\)/);
  });

  it('the bubble over a speaker shows a long line\'s start, the chat every word', () => {
    assert.equal(CHAT_BUBBLE_CHARS, 240);
    assert.equal(chatBubbleText('  hello there  '), 'hello there');
    const exact = 'x'.repeat(240);
    assert.equal(chatBubbleText(exact), exact);
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const shown = chatBubbleText(long);
    assert.ok(shown.length <= 241 && shown.endsWith('…'));
    assert.ok(long.startsWith(shown.slice(0, -1)) && long[shown.length - 1] === ' ', 'cut between words');
    assert.equal(chatBubbleText('y'.repeat(400)), `${'y'.repeat(240)}…`, 'one long word is cut where it stands');
    const game = read('public/game.js');
    assert.match(game, /text: chatBubbleText\(text\),\n      durationMs: result\.matched/);
    assert.match(game, /showLocalCompanionSpeech\(participant, chatBubbleText\(text\), \{/);
    assert.match(game, /showLocalChatBubble\(shown, text, \{/, 'the chat gets the whole line');
    const rt = read('public/js/features/realtime-feature.js');
    assert.match(rt, /engine\.say\?\.\(r\.target, chatBubbleText\(text\), BUBBLE_MS, \{ speaker: name \}\);/);
    assert.match(rt, /\(engine\.hearLocal \|\| engine\.chatLine\)\?\.\(name, text, \{/, 'Local gets the whole line');
  });

  it('the server cuts a line at the same length', { skip: skipWithoutServer }, () => {
    const hub = readFileSync(join(SERVER_DIR, 'hub.go'), 'utf8');
    assert.equal(Number(hub.match(/\tmaxChat\s+= (\d+)/)?.[1]), CHAT_MAX_CHARS);
    // A line of four-byte characters with its envelope still fits one frame.
    const frame = Number(readFileSync(join(SERVER_DIR, 'main.go'), 'utf8').match(/\tmaxFrame\s+= (\d+)/)?.[1]);
    assert.ok(frame >= CHAT_MAX_CHARS * 6 + 512, `maxFrame ${frame}`);
  });

  it('the site keeps a line that long', { skip: skipWithoutSite }, () => {
    const history = readFileSync(join(SITE_DIR, 'src/ChatHistory.php'), 'utf8');
    assert.equal(Number(history.match(/public const TEXT_MAX = (\d+);/)?.[1]), CHAT_MAX_CHARS);
  });

  it('both skins\' boxes are text areas of the original length, Enter sends, nothing resizes them by hand', () => {
    for (const p of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(p);
      assert.match(html, /<textarea id="local-chat-input" rows="1" maxlength="1000" /, p);
      assert.doesNotMatch(html, /<input id="local-chat-input"/, p);
    }
    const panes = read('public/js/classic/classic-panes.js');
    assert.match(panes, /el\(doc, 'textarea', \{ class: 'classic-lower-input', rows: '1', maxlength: String\(CHAT_MAX_CHARS\)/);
    assert.match(panes, /bindChatInput\(lowerInput, \{ form: lowerForm, win \}\)/);
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /bindChatInput\(input, \{\n\s+form,\n\s+onHistory\(key\) \{/);
    const css = read('public/style.css');
    assert.match(css, /\.social-drawer #local-chat-input \{[^}]*resize: none;[^}]*\}/);
    assert.match(css, /\.social-drawer #local-chat-input \{[^}]*white-space: pre-wrap;[^}]*\}/);
    assert.match(css, /\.social-drawer #local-chat-form \{ display: flex; align-items: flex-end;/);
    assert.match(read('public/css/classic.css'), /:is\(#local-chat-input, \.classic-lower-input\) \{[^}]*resize: none;/);
    // The server makes each line one line (groddle-afternoon-server hub.go cleanChat), so the box never sends a new line.
    assert.match(read('public/js/ui/chat-input.js'), /cleanChat/);
  });
});
