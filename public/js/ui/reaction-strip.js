/**
 * Reactions under chat lines in the Social drawer (rules and words in js/chat-reactions.js; the data
 * from features/chat-reactions-feature.js). A line with a reaction key (`line.rk`) gets:
 *
 * - an "add reaction" button (a face with a plus), shown while the line is hovered or has the
 *   keyboard, always focusable: "React to mr granberry's message". It opens the picker.
 * - the picker: the reactions in a row (role menu, each a menuitemcheckbox checked when it is
 *   yours already). Left and Right (or Up and Down, Home, End) move, Enter or Space picks, Escape or a
 *   click elsewhere closes; the keyboard goes back to the button it came from.
 * - chips under the words, one a reaction with its count ("👍 2"): a click puts yours on or takes it
 *   off; hovering one (or giving it the keyboard) shows who ("Thumbs up: You and mr granberry"); its
 *   spoken name is "👍 2, you and mr granberry".
 *
 * Rows are kept between redraws (js/ui/keyed-nodes.js): `decorate(row, line)` runs on each row a
 * redraw uses and only adds the button and the strip once; `update(rk)` redraws the chips of the rows
 * showing that line in place (their words are never touched, so a selection in them stays). A chip
 * keeps its node while its reaction stays, so the keyboard stays on it after a toggle.
 */
import { REACTIONS, addLabel, chipLabel, chipTip, isMine, pickerMove, reactionOf, sameReactions } from '../chat-reactions.js?v=38460172';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The add button's face with a plus (drawn here, no art). */
function addIcon(doc) {
  if (typeof doc.createElementNS !== 'function') return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M9 3.2a6 6 0 1 0 5.8 7.4M6.6 11.4c.6 1 1.6 1.6 2.8 1.6s2.2-.6 2.8-1.6M7 8h.01M11.6 8h.01M15.5 2.5v5M13 5h5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

/** A reaction's face: its emoji as text, or the Hi sign drawn from Tiny Speck's art. */
function glyphNode(doc, def) {
  const s = doc.createElement('span');
  s.setAttribute('aria-hidden', 'true');
  if (def.glyph) {
    s.setAttribute('class', 'react-glyph');
    s.textContent = def.glyph;
  } else s.setAttribute('class', `react-glyph react-glyph-${def.key}`);
  return s;
}

function connected(n) {
  return n?.isConnected !== false;
}

/**
 * The reactions of one drawer. `reactions(rk)` gives a line's list ([{ key, by }], normalReactions),
 * `me()` your player id, `send(rk, key, on)` asks the server (true when it went), `enabled()` whether
 * reactions are on now (online with a server that gives line ids).
 */
export function createReactionUI({ doc = globalThis.document, win = globalThis, reactions = () => [], me = () => 0, send = () => false, enabled = () => true, host = null } = {}) {
  /** rk -> the rows showing that line (a line can show in two panes under Classic). */
  const rows = new Map();
  /** row -> { rk, line, strip, add, chips: Map key -> chip, drawn: the list last drawn } */
  const parts = new WeakMap();
  let picker = null;
  let tip = null;
  /** The chip the tip is about (it goes with it). */
  let tipFor = null;

  function el(tag, attrs = {}, text = '') {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : String(v));
    if (text) n.textContent = text;
    return n;
  }

  function hostEl() {
    return host?.() || doc.getElementById?.('game-root') || doc.body;
  }

  // —— Who reacted: one small tip for the whole drawer ——
  function showTip(chip, text) {
    if (!text) return;
    if (!tip) {
      tip = el('div', { class: 'react-tip', 'aria-hidden': 'true', 'data-react-tip': '' });
      hostEl()?.append(tip);
    }
    tip.textContent = text;
    tip.hidden = false;
    tipFor = chip;
    const r = chip.getBoundingClientRect?.() || { left: 0, top: 0, bottom: 0, width: 0 };
    const vw = win.innerWidth || 0;
    const w = tip.offsetWidth || 160;
    const h = tip.offsetHeight || 24;
    let left = r.left + (r.width || 0) / 2 - w / 2;
    if (vw) left = Math.max(8, Math.min(left, vw - w - 8));
    let top = r.top - h - 6;
    if (top < 8) top = r.bottom + 6;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    tipFor = null;
  }

  // —— The picker ——
  function closePicker({ focus = false } = {}) {
    hideTip();
    if (!picker) return;
    const { node, from, cleanup } = picker;
    picker = null;
    cleanup();
    node.remove?.();
    from?.removeAttribute?.('aria-expanded');
    if (focus && connected(from)) from.focus?.({ preventScroll: true });
  }

  function openPicker(row, { keys = false } = {}) {
    const p = parts.get(row);
    if (!p) return false;
    if (picker?.from === p.add) {
      closePicker({ focus: keys });
      return true;
    }
    closePicker();
    hideTip();
    const mine = new Set((reactions(p.rk) || []).filter((c) => isMine(c, me())).map((c) => c.key));
    const node = el('div', { class: 'react-picker', role: 'menu', 'aria-label': 'Reactions', 'data-react-picker': p.rk });
    const items = REACTIONS.map((def, i) => {
      const b = el('button', { type: 'button', class: 'react-pick', role: 'menuitemcheckbox', 'aria-checked': String(mine.has(def.key)), 'aria-label': def.label, title: def.label, 'data-react-pick': def.key, tabindex: i === 0 ? '0' : '-1' });
      b.append(glyphNode(doc, def));
      b.addEventListener('pointerdown', (e) => {
        if (e.button === 0) e.preventDefault?.();
      });
      b.addEventListener('click', (e) => {
        const back = keys || e.detail === 0;
        const on = b.getAttribute('aria-checked') !== 'true';
        closePicker({ focus: back });
        send(p.rk, def.key, on);
      });
      return b;
    });
    node.append(...items);
    const move = (to) => {
      items.forEach((b, i) => b.setAttribute('tabindex', i === to ? '0' : '-1'));
      items[to]?.focus?.({ preventScroll: true });
    };
    node.addEventListener('keydown', (e) => {
      // The picker's keys are its own: they never walk the avatar.
      e.stopPropagation?.();
      if (e.key === 'Escape') {
        e.preventDefault?.();
        closePicker({ focus: true });
        return;
      }
      if (e.key === 'Tab') {
        closePicker({ focus: true });
        return;
      }
      const at = items.indexOf(doc.activeElement);
      const to = pickerMove(at < 0 ? 0 : at, e.key);
      if (to >= 0) {
        e.preventDefault?.();
        move(to);
      }
    });
    hostEl()?.append(node);
    // Over the button's line, inside the line's own column (the chat column, never over the world):
    // its right edge at the button's, pushed left of the line's right edge and right of its left.
    const r = p.add.getBoundingClientRect?.() || { left: 0, top: 0, right: 0, bottom: 0 };
    const line = row.getBoundingClientRect?.() || null;
    const vw = win.innerWidth || 0;
    const vh = win.innerHeight || 0;
    const w = node.offsetWidth || REACTIONS.length * 34;
    const h = node.offsetHeight || 40;
    let left = (r.right || 0) - w;
    if (line && line.width) left = Math.min(Math.max(left, line.left), line.right - w);
    if (vw) left = Math.max(8, Math.min(left, vw - w - 8));
    let top = (r.top || 0) - h - 4;
    if (top < 8) top = (r.bottom || 0) + 4;
    if (vh) top = Math.min(top, vh - h - 8);
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
    p.add.setAttribute('aria-expanded', 'true');
    const onDown = (e) => {
      if (node.contains?.(e.target) || e.target === p.add || p.add.contains?.(e.target)) return;
      closePicker();
    };
    doc.addEventListener?.('pointerdown', onDown, true);
    picker = { node, from: p.add, rk: p.rk, cleanup: () => doc.removeEventListener?.('pointerdown', onDown, true) };
    if (keys) items[0]?.focus?.({ preventScroll: true });
    return true;
  }

  // —— Chips ——
  function chipFor(p, key) {
    let chip = p.chips.get(key);
    if (chip) return chip;
    const def = reactionOf(key);
    chip = el('button', { type: 'button', class: 'react-chip', 'data-react-chip': key });
    const count = el('span', { class: 'react-count' });
    chip.append(glyphNode(doc, def), count);
    p.counts.set(key, count);
    chip.addEventListener('pointerdown', (e) => {
      // As the names: a click acts without taking the keyboard from the world.
      if (e.button === 0) e.preventDefault?.();
    });
    chip.addEventListener('click', () => {
      const list = reactions(p.rk) || [];
      const c = list.find((x) => x.key === key);
      send(p.rk, key, !isMine(c, me()));
    });
    const tipNow = () => showTip(chip, chip.dataset.reactWho || '');
    chip.addEventListener('pointerenter', tipNow);
    chip.addEventListener('focus', tipNow);
    chip.addEventListener('pointerleave', hideTip);
    chip.addEventListener('blur', hideTip);
    p.chips.set(key, chip);
    return chip;
  }

  function paint(row) {
    const p = parts.get(row);
    if (!p) return;
    const list = reactions(p.rk) || [];
    const you = me();
    if (p.drawn && sameReactions(p.drawn, list) && p.drawnMe === you) return;
    p.drawn = list;
    p.drawnMe = you;
    const want = [];
    for (const c of list) {
      const chip = chipFor(p, c.key);
      const mine = isMine(c, you);
      const count = p.counts.get(c.key);
      if (count && count.textContent !== String(c.by.length)) count.textContent = String(c.by.length);
      chip.setAttribute('aria-label', chipLabel(c, you));
      chip.setAttribute('aria-pressed', String(mine));
      chip.dataset.reactWho = chipTip(c, you);
      if (tipFor === chip && tip && !tip.hidden) tip.textContent = chip.dataset.reactWho;
      chip.classList.toggle('is-mine', mine);
      want.push(chip);
    }
    for (const key of [...p.chips.keys()]) {
      if (list.some((c) => c.key === key)) continue;
      // A chip that goes takes its tip with it (no pointerleave comes from a removed node).
      if (tipFor === p.chips.get(key)) hideTip();
      p.chips.delete(key);
      p.counts.delete(key);
    }
    // Only what changed: a chip that stays keeps its node (and the keyboard on it).
    const now = [...(p.strip.childNodes || p.strip.children || [])];
    if (now.length !== want.length || now.some((n, i) => n !== want[i])) {
      for (const n of now) if (!want.includes(n)) p.strip.removeChild?.(n);
      let at = p.strip.firstChild ?? null;
      for (const n of want) {
        if (n === at) {
          at = at.nextSibling ?? null;
          continue;
        }
        p.strip.insertBefore?.(n, at);
      }
    }
    p.strip.hidden = list.length === 0;
    row.classList.toggle('has-reactions', list.length > 0);
  }

  /** Gives a drawn row its button and chips once, and its chips as they are now. */
  function decorate(row, line) {
    const rk = String(line?.rk || '');
    if (!row || !rk || !enabled()) return row;
    let p = parts.get(row);
    if (!p || p.rk !== rk) {
      const add = el('button', { type: 'button', class: 'react-add', 'aria-label': addLabel(line), 'aria-haspopup': 'menu', 'data-react-add': rk });
      const icon = addIcon(doc);
      if (icon) add.append(icon);
      add.addEventListener('pointerdown', (e) => {
        if (e.button === 0) e.preventDefault?.();
      });
      add.addEventListener('click', (e) => openPicker(row, { keys: e.detail === 0 }));
      const strip = el('span', { class: 'react-strip', role: 'group', 'aria-label': 'Reactions', 'data-react-strip': rk });
      strip.hidden = true;
      row.append(add, strip);
      row.classList.add('can-react');
      p = { rk, line, add, strip, chips: new Map(), counts: new Map(), drawn: null, drawnMe: 0 };
      parts.set(row, p);
    }
    // A kept row drawn again (another tab, back from the cache) is one of the line's rows again.
    if (!rows.has(rk)) rows.set(rk, new Set());
    rows.get(rk).add(row);
    paint(row);
    return row;
  }

  /** A line's reactions changed: its rows' chips are drawn again in place. */
  function update(rk) {
    const set = rows.get(String(rk || ''));
    if (!set) return 0;
    let n = 0;
    for (const row of [...set]) {
      // A row no longer kept by any redraw: forgotten (it is made again, decorated, if it comes back).
      if (row.isConnected === false) {
        set.delete(row);
        continue;
      }
      paint(row);
      n += 1;
    }
    if (!set.size) rows.delete(rk);
    if (picker?.rk === rk) {
      const mine = new Set((reactions(rk) || []).filter((c) => isMine(c, me())).map((c) => c.key));
      for (const b of picker.node.querySelectorAll?.('[data-react-pick]') || []) b.setAttribute('aria-checked', String(mine.has(b.getAttribute('data-react-pick'))));
    }
    return n;
  }

  return {
    decorate,
    update,
    openPicker: (row, opts) => openPicker(row, opts),
    closePicker,
    get pickerOpen() {
      return picker?.rk || '';
    },
  };
}
