/**
 * The chat box that wraps (Austin 2026-11-04: "the message just keeps going on a single line"). The
 * chat inputs (#local-chat-input in the Social drawer, the Classic skin's Local Chat / Activity field)
 * are text areas that grow with what you type, from one line up to MAX_ROWS, then scroll.
 *
 * A message is still one line: Enter sends it (as the one-line box did; Glitch's chat field was one
 * line, InputField.as), Shift+Enter adds no new line, and a pasted line break becomes a space. The
 * server makes every chat line one line anyway (groddle-afternoon-server hub.go cleanChat: all
 * whitespace runs are one space), so a new line typed here could never reach anyone, and one shown
 * only to you would look like two messages. Up and Down still walk back through what you said while
 * the caret is on the box's first (Up) or last (Down) line; elsewhere they move the caret.
 *
 * bindChatInput(field, { form }) wires one; the pure parts (oneLine, fitHeight, historyKey) are tested
 * in tests/chat-input.test.js.
 */

export const MAX_ROWS = 5;

/** PURE: the words as one line: each line break (and the spaces round it) is one space. */
export function oneLine(text) {
  return String(text ?? '').replace(/[ \t]*[\r\n\u2028\u2029]+[ \t]*/g, ' ');
}

/**
 * PURE: the box's height for its content: { height, scroll } (px; scroll when the words need more than
 * MAX_ROWS lines). `scrollHeight` is the content's height with its padding, `lineHeight` one line's,
 * `extra` the padding and border round the lines.
 */
export function fitHeight({ scrollHeight = 0, lineHeight = 18, extra = 0, border = 0, maxRows = MAX_ROWS, minRows = 1 } = {}) {
  const lh = Math.max(1, Number(lineHeight) || 18);
  const min = Math.ceil(lh * minRows + extra);
  const max = Math.ceil(lh * maxRows + extra);
  const want = Math.ceil((Number(scrollHeight) || 0) + border);
  return { height: Math.max(min, Math.min(max, want)), scroll: want > max + 1 };
}

/**
 * PURE: whether Up or Down is for the history of what you said (else the caret moves): no text
 * selected, and the caret on the first line (Up) or the last (Down) of the box. `rows` is how many
 * lines the box shows now, `caretRow` the line the caret is on (0 first); a box of one line is always both.
 */
export function historyKey(key, { start = 0, end = 0, length = 0, rows = 1, caretRow = 0 } = {}) {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return false;
  if (start !== end) return false;
  if (rows <= 1) return true;
  if (key === 'ArrowUp') return start === 0 || caretRow <= 0;
  return end >= length || caretRow >= rows - 1;
}

/** PURE: Enter (without Shift, Alt, Ctrl or Cmd, not while an input method is composing) sends. */
export function sendKey(e) {
  return Boolean(e && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey);
}

function px(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** The field's line height and the room round its lines (px), from its computed style. */
function metrics(field, win) {
  try {
    const cs = win.getComputedStyle(field);
    let lh = px(cs.lineHeight);
    if (!lh) lh = px(cs.fontSize) * 1.3 || 18;
    const pad = px(cs.paddingTop) + px(cs.paddingBottom);
    const border = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    return { lineHeight: lh, pad, border, boxSizing: cs.boxSizing, minHeight: px(cs.minHeight) };
  } catch {
    return { lineHeight: 18, pad: 0, border: 0, boxSizing: 'content-box', minHeight: 0 };
  }
}

/**
 * Makes `field` (a textarea) the chat box: it grows with its words up to MAX_ROWS, Enter submits
 * `form`, line breaks become spaces, and the history keys are left to `onHistory(key)` (true when it
 * took the key) only where historyKey allows them. Setting field.value from code fits it again.
 * Returns { fit } (fits the height now).
 */
export function bindChatInput(field, { form = field?.form || null, onHistory = null, maxRows = MAX_ROWS, win = globalThis } = {}) {
  if (!field?.addEventListener) return { fit() {} };
  let fitting = false;
  let rows = 1;
  let lineH = 18;
  function fit() {
    if (fitting || typeof win.getComputedStyle !== 'function') return;
    fitting = true;
    try {
      const m = metrics(field, win);
      lineH = m.lineHeight;
      // border-box: the height holds the padding and border; content-box: only the lines.
      const bb = m.boxSizing === 'border-box';
      const border = bb ? m.border : -m.pad;
      const extra = bb ? m.pad + m.border : 0;
      field.style.height = 'auto';
      const sh = field.scrollHeight || 0;
      const fitted = fitHeight({ scrollHeight: sh, lineHeight: m.lineHeight, extra, border, maxRows });
      const scroll = fitted.scroll;
      const height = Math.max(fitted.height, m.minHeight);
      field.style.height = `${height}px`;
      field.style.overflowY = scroll ? 'auto' : 'hidden';
      rows = Math.max(1, Math.round((sh - m.pad) / Math.max(1, m.lineHeight)));
      field.dataset.chatRows = String(Math.min(rows, maxRows));
    } finally {
      fitting = false;
    }
  }

  /** The line of the box the caret is on (0 first), measured with a hidden copy of the words before it. */
  function caretRow() {
    const doc = field.ownerDocument;
    if (!doc?.createElement || rows <= 1) return 0;
    const at = field.selectionStart ?? 0;
    const probe = doc.createElement('div');
    try {
      const cs = win.getComputedStyle(field);
      for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'boxSizing', 'wordSpacing', 'textIndent']) probe.style[p] = cs[p];
      probe.style.width = `${field.clientWidth + px(cs.borderLeftWidth) + px(cs.borderRightWidth)}px`;
    } catch { /* no styles: one line */ }
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal', top: '0', left: '-9999px', paddingTop: '0', paddingBottom: '0', borderTopWidth: '0', borderBottomWidth: '0', height: 'auto' });
    probe.textContent = `${field.value.slice(0, at)}\u200b`;
    doc.body.append(probe);
    const h = probe.scrollHeight;
    probe.remove();
    return Math.max(0, Math.round(h / Math.max(1, lineH)) - 1);
  }

  // Setting the value from code (the history, a command clearing it, the Feat panel filling it in) fits it too.
  const proto = Object.getPrototypeOf(field);
  const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.get && desc?.set && !Object.prototype.hasOwnProperty.call(field, 'value')) {
    Object.defineProperty(field, 'value', {
      configurable: true,
      enumerable: true,
      get() { return desc.get.call(this); },
      set(v) {
        desc.set.call(this, v);
        fit();
      },
    });
  }

  field.addEventListener('input', () => {
    const v = field.value;
    const one = oneLine(v);
    if (one !== v) {
      const at = field.selectionStart ?? one.length;
      field.value = one;
      const pos = Math.min(one.length, at);
      field.setSelectionRange?.(pos, pos);
    }
    fit();
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // No new lines: Enter sends, Shift+Enter (and the rest) adds nothing.
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (sendKey(e) && form) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent?.(new win.Event('submit', { bubbles: true, cancelable: true }));
      }
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && onHistory) {
      const ok = historyKey(e.key, {
        start: field.selectionStart ?? 0,
        end: field.selectionEnd ?? 0,
        length: field.value.length,
        rows,
        caretRow: rows > 1 ? caretRow() : 0,
      });
      if (ok && onHistory(e.key)) e.preventDefault();
    }
  });
  // Shown again (a tab with the box, the other skin): fit it when it takes the keyboard.
  field.addEventListener('focus', () => fit());
  // The box's width changes (the drawer opens, the window resizes): fit the lines again.
  if (typeof win.ResizeObserver === 'function') {
    let w = -1;
    new win.ResizeObserver(() => {
      const now = field.clientWidth || 0;
      if (now === w) return;
      w = now;
      fit();
    }).observe(field);
  }
  fit();
  return { fit };
}
