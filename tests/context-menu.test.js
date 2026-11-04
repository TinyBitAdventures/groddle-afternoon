/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit R1, R5-R8): the shared context menu
 * (js/ui/context-menu.js), grown out of the tracker's pin menu, which is now its first user.
 * open({ title, rows, at, anchor, keys, onPick }) draws the verb menu's rows, places itself at the
 * pointer or beside the anchor, closes on Esc, Tab, a press elsewhere or a resize, and gives focus
 * back to its opener after a keyboard open, to the world after a pointer open. bindContextTrigger
 * wires a surface's right-click, Shift+F10 / Menu key (with the echo guard), long press and the
 * Ctrl+click a Mac sends.
 */
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl, matches } from './social-fake-dom.js';
import {
  bindContextTrigger, createContextMenu, isContextMenuKey, placeContextMenu, ECHO_MS, LONG_PRESS_MS, MORE_KEYS_LABEL,
} from '../public/js/ui/context-menu.js?v=990e8c56';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  blur() { if (globalThis.document.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n instanceof FakeEl && matches(n, sel)) return n;
    return null;
  }
  get ownerDocument() { return globalThis.document; }
  replaceWith(n) {
    const p = this.parentElement;
    const i = p.children.indexOf(this);
    p.adopt([n]);
    p.children.splice(i, 1, n);
    this.parentElement = null;
  }
  get isConnected() { for (let n = this; n; n = n.parentElement) if (n === globalThis.document.body) return true; return false; }
}

function setup() {
  const listeners = {};
  const doc = {
    activeElement: null,
    listeners,
    createElement: (t) => new El(t),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    body: new El('body'),
  };
  globalThis.document = doc;
  const root = new El('div');
  root.id = 'game-root';
  root.rect = { left: 0, top: 60, right: 1280, bottom: 800, width: 1280, height: 740 };
  const card = new El('div');
  card.setAttribute('data-ctx', 'card');
  card.rect = { left: 400, top: 200, right: 640, bottom: 260, width: 240, height: 60 };
  root.append(card);
  doc.body.append(root);
  const data = {};
  const menu = createContextMenu({ doc, host: root, setData: (k, v) => { data[k] = v; } });
  return { doc, root, card, menu, data };
}

const ROWS = [
  { id: 'pin', label: 'Pin to screen', tip: 'Shows it under the left pill.' },
  { id: 'open', label: 'Open', tip: 'Shows its steps.' },
  { id: 'later', label: 'Not right now', disabled: true, reason: 'You are on it already.' },
];

let s;
beforeEach(() => { s = setup(); });
afterEach(() => {
  delete globalThis.document;
  mock.timers.reset();
});

describe('the shared context menu (js/ui/context-menu.js)', () => {
  it('opens on the Menu key or Shift+F10, never with Ctrl, Alt or Cmd', () => {
    assert.equal(isContextMenuKey({ key: 'ContextMenu' }), true);
    assert.equal(isContextMenuKey({ key: 'F10', shiftKey: true }), true);
    assert.equal(isContextMenuKey({ key: 'F10' }), false);
    assert.equal(isContextMenuKey({ key: 'ContextMenu', shiftKey: true }), false);
    assert.equal(isContextMenuKey({ key: 'F10', shiftKey: true, altKey: true }), false);
    assert.equal(MORE_KEYS_LABEL, 'Shift+F10 for more');
  });

  it('draws the verb menu\'s rows: key caps, menuitems, the disabled row with its reason, Classic\'s classes', () => {
    assert.equal(s.menu.open({ title: 'Porcine Pleaser', rows: ROWS, at: { x: 300, y: 220 }, owner: 'quest-card:porcine' }), true);
    const el = s.menu.element();
    assert.equal(el.getAttribute('role'), 'menu');
    assert.ok(el.classList.contains('ctx-menu'));
    assert.equal(el.querySelector('.ctx-title').textContent, 'Porcine Pleaser');
    const rows = el.querySelectorAll('.vm-row');
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.getAttribute('role'), 'menuitem');
      assert.ok(r.classList.contains('verb-choice'), 'Classic draws .verb-choice rows');
    }
    assert.deepEqual(rows.map((r) => r.dataset.ctxRow), ['pin', 'open', 'later']);
    assert.match(rows[0]._html, /vm-key kcap" aria-hidden="true">1</);
    assert.equal(rows[2].getAttribute('aria-disabled'), 'true');
    assert.equal(rows[2].dataset.vmReason, 'You are on it already.');
    assert.equal(s.doc.activeElement, rows[0], 'the first row that can be done takes focus');
    assert.equal(s.data.contextMenu, 'quest-card:porcine');
    assert.equal(el.style.left, '300px');
    assert.equal(el.style.top, '160px', 'in the host\'s px');
  });

  it('update() draws a changed row again in place: its key cap, the focus, and a pick by its new state', () => {
    const picks = [];
    const LOOKING = { id: 'profile', label: 'Open Profile Page', tip: 'Their page.', disabled: true, reason: 'Looking for their page.' };
    s.menu.open({ rows: [LOOKING, ...ROWS.slice(0, 2)], keys: true, onPick: (id) => picks.push(id) });
    const el = s.menu.element();
    el.querySelectorAll('.vm-row')[0].focus();
    assert.equal(s.menu.update([LOOKING, { ...ROWS[0] }]), 0, 'nothing changed: nothing drawn again');
    assert.equal(s.menu.update([{ ...LOOKING, disabled: false, reason: '' }, { id: 'not-open', label: 'X' }]), 1, 'a row that is not open is not added');
    const rows = el.querySelectorAll('.vm-row');
    assert.deepEqual(rows.map((r) => r.dataset.ctxRow), ['profile', 'pin', 'open']);
    assert.equal(rows[0].getAttribute('aria-disabled'), null);
    assert.match(rows[0]._html, /vm-key kcap" aria-hidden="true">1</);
    assert.equal(s.doc.activeElement, rows[0], 'the focus stays on the row');
    rows[0].dispatch('click');
    assert.deepEqual(picks, ['profile']);
    assert.equal(s.menu.update([LOOKING]), 0, 'closed: nothing to update');
  });

  it('a pick closes it and runs the row; a disabled row says why and does nothing', () => {
    const picks = [];
    s.menu.open({ rows: ROWS, at: { x: 10, y: 80 }, onPick: (id, o) => picks.push([id, o.keys]) });
    const rows = s.menu.element().querySelectorAll('.vm-row');
    // bindVerbMenu stops a disabled row's click (its reason in the footer, a shake).
    rows[2].dispatch('click', { stopImmediatePropagation() { this.stopped = true; } });
    assert.equal(s.menu.isOpen(), true, 'the disabled row keeps it open');
    assert.deepEqual(picks, []);
    rows[1].click();
    assert.deepEqual(picks, [['open', false]]);
    assert.equal(s.menu.isOpen(), false);
    assert.equal(s.data.contextMenu, '');
  });

  it('opened from the keys it sits beside the anchor and gives focus back to the opener; by the pointer, to the world', () => {
    const opener = new El('button');
    s.card.append(opener);
    s.menu.open({ rows: ROWS, anchor: s.card, keys: true, opener });
    assert.equal(s.menu.element().style.left, '646px', 'right of the anchor');
    assert.equal(s.menu.element().style.top, '140px', 'level with its top');
    s.menu.element().querySelectorAll('.vm-row')[0].dispatch('keydown', { key: 'Escape' });
    assert.equal(s.doc.activeElement, opener);

    s.menu.open({ rows: ROWS, at: { x: 500, y: 300 }, opener });
    const esc = s.menu.element().querySelectorAll('.vm-row')[0].dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true, 'the game never sees it');
    assert.equal(s.doc.activeElement, s.doc.body, 'a pointer open gives the keys back to the world');
  });

  it('Tab, the Menu key again, a press elsewhere or a resize close it; keys in it stay out of the game', () => {
    for (const key of ['Tab', 'ContextMenu']) {
      s.menu.open({ rows: ROWS, at: { x: 10, y: 80 } });
      s.menu.element().querySelectorAll('.vm-row')[0].dispatch('keydown', { key });
      assert.equal(s.menu.isOpen(), false, key);
    }
    s.menu.open({ rows: ROWS, at: { x: 10, y: 80 } });
    const space = s.menu.element().querySelectorAll('.vm-row')[0].dispatch('keydown', { key: ' ' });
    assert.equal(space.stopped, true, 'Space does not jump');
    for (const fn of s.doc.listeners.pointerdown) fn({ target: s.menu.element().querySelectorAll('.vm-row')[1] });
    assert.equal(s.menu.isOpen(), true, 'a press inside keeps it');
    for (const fn of s.doc.listeners.pointerdown) fn({ target: s.root });
    assert.equal(s.menu.isOpen(), false);
    const cm = s.menu.element().dispatch('contextmenu', {});
    assert.equal(cm.defaultPrevented, true, 'never the browser menu over it');
  });

  it('opening another closes the first (one menu at a time), and its data keys go back to ""', () => {
    s.menu.open({ rows: ROWS, at: { x: 10, y: 80 }, owner: 'a', data: { questPinMenu: 'x' } });
    assert.equal(s.data.questPinMenu, 'x');
    s.menu.open({ rows: ROWS.slice(0, 1), at: { x: 10, y: 80 }, owner: 'b' });
    assert.equal(s.data.questPinMenu, '');
    assert.equal(s.menu.owner(), 'b');
    assert.equal(s.menu.isOpenFor('b'), true);
    assert.equal(s.menu.element().querySelectorAll('.vm-row').length, 1);
  });

  it('stays inside the host', () => {
    assert.deepEqual(placeContextMenu({ at: { x: 1260, y: 700 }, size: { w: 216, h: 140 }, room: { w: 1280, h: 740 } }), { x: 1044, y: 592 });
    assert.deepEqual(placeContextMenu({ anchor: { right: 360, top: 100 }, size: { w: 216, h: 140 }, room: { w: 375, h: 600 } }), { x: 151, y: 100 });
    assert.deepEqual(placeContextMenu({ size: { w: 100, h: 50 }, room: { w: 400, h: 400 } }), { x: 8, y: 8 });
  });
});

describe('bindContextTrigger (R5)', () => {
  function wire({ longPress = false } = {}) {
    let t = 1000;
    const opens = [];
    const list = new El('div');
    const row = new El('button');
    row.setAttribute('data-row', 'a');
    list.append(row);
    s.root.append(list);
    let open = false;
    const clicks = [];
    bindContextTrigger(list, {
      rowOf: (target) => target?.closest?.('[data-row]') || null,
      now: () => t,
      longPress,
      isOpenFor: () => open,
      open: (r, o) => { open = true; opens.push({ row: r, at: o.at, keys: o.keys }); },
    });
    list.addEventListener('click', (e) => clicks.push(e.target));
    return { list, row, opens, clicks, tick: (ms) => { t += ms; }, close: () => { open = false; } };
  }

  it('a right-click opens at the pointer and stops the browser menu; a second within the echo window does not reopen', () => {
    const w = wire();
    const e = w.row.dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.deepEqual(w.opens.map((o) => [o.at, o.keys]), [[{ x: 300, y: 220 }, false]]);
    w.row.dispatch('contextmenu', { clientX: 0, clientY: 0 });
    assert.equal(w.opens.length, 1, 'the contextmenu a key sends after it');
    w.tick(ECHO_MS + 1);
    w.row.dispatch('contextmenu', { clientX: 310, clientY: 230, button: 2 });
    assert.equal(w.opens.length, 2, 'later, a right-click opens it again where it is');
  });

  it('Shift+F10 and the Menu key open it from the keys (no pointer place) and the game never sees them', () => {
    const w = wire();
    for (const key of ['Enter', 'F10', 'Delete']) w.row.dispatch('keydown', { key });
    assert.equal(w.opens.length, 0);
    const k = w.row.dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.defaultPrevented, true);
    assert.equal(k.stopped, true);
    assert.deepEqual(w.opens.map((o) => [o.at, o.keys]), [[null, true]]);
  });

  it('a Mac\'s Ctrl+click opens it, and its click is swallowed (it is not a left click)', () => {
    const w = wire();
    w.row.dispatch('contextmenu', { clientX: 300, clientY: 220, button: 0, ctrlKey: true });
    assert.equal(w.opens.length, 1);
    w.row.click();
    assert.deepEqual(w.clicks, [], 'swallowed');
    w.row.click();
    assert.equal(w.clicks.length, 1, 'only that one');
  });

  it('a long press opens it only where asked, and its tap opens nothing', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const plain = wire();
    plain.row.dispatch('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    mock.timers.tick(LONG_PRESS_MS * 2);
    assert.equal(plain.opens.length, 0, 'no long press unless the surface asks (the pack drags, the world taps)');
    const w = wire({ longPress: true });
    w.row.dispatch('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    mock.timers.tick(LONG_PRESS_MS);
    assert.equal(w.opens.length, 1);
    assert.equal(w.opens[0].at, null, 'beside the row, not under the finger');
    w.row.click();
    assert.deepEqual(w.clicks, []);
    w.row.dispatch('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    mock.timers.tick(LONG_PRESS_MS * 2);
    assert.equal(w.opens.length, 1, 'a mouse never long-presses');
  });
});

describe('the wiring', () => {
  it('the tracker\'s pin menu is built on it (its first user)', () => {
    const pin = read('js/ui/quest-pin-menu.js');
    assert.match(pin, /import \{ createContextMenu, isContextMenuKey, LONG_PRESS_MS, LONG_PRESS_SLOP, placeContextMenu \} from '\.\/context-menu\.js/);
    assert.match(pin, /createContextMenu\(\{ doc, host, id: 'quest-pin-menu'/);
    const tracker = read('js/ui/quest-tracker.js');
    assert.match(tracker, /bindContextTrigger\(list, \{/);
    assert.match(tracker, /aria-haspopup="menu"/);
    assert.doesNotMatch(tracker, /addEventListener\('contextmenu'/, 'its own listener went into the shared trigger');
  });

  it('both skins draw it: Modern beside the pin menu, Classic with the 2012 verb menu card and rows', () => {
    const css = read('style.css');
    assert.match(css, /\n\.ctx-menu \{ display: none; \}/);
    assert.match(css, /\[data-ui="modern"\] #game-root \.ctx-menu:not\(\.quest-pin-menu\):not\(\[hidden\]\) \{/);
    assert.match(css, /\[data-ui="modern"\] \.ctx-menu \.vm-row,/);
    const classic = read('css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.ctx-menu:not\(\[hidden\]\) \{/);
    assert.match(classic, /:root\[data-ui="classic"\] \.ctx-menu \.verb-choice:is\(:hover, :focus-visible, \.cur\)/);
    assert.match(classic, /:root\[data-ui="classic"\] \.ctx-menu :is\(\.vm-key, \.vm-lock\) \{ display: none; \}/);
  });

  it('game.js takes the menu key from it', () => {
    assert.match(read('game.js'), /import \{ bindContextTrigger, createContextMenu, isContextMenuKey as isMenuKey, MORE_KEYS_LABEL \} from '\.\/js\/ui\/context-menu\.js/);
  });
});
