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
import { MAX_ROWS, bindChatInput, fitHeight, historyKey, oneLine, sendKey } from '../public/js/ui/chat-input.js?v=3cb4ce2e';
import { FakeEl } from './social-fake-dom.js';

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

  it('both skins\' boxes are text areas of the old length, Enter sends, nothing resizes them by hand', () => {
    for (const p of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(p);
      assert.match(html, /<textarea id="local-chat-input" rows="1" maxlength="180" /, p);
      assert.doesNotMatch(html, /<input id="local-chat-input"/, p);
    }
    const panes = read('public/js/classic/classic-panes.js');
    assert.match(panes, /el\(doc, 'textarea', \{ class: 'classic-lower-input', rows: '1', maxlength: '180'/);
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
