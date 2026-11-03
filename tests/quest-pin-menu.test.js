/**
 * PINMENU (Austin 2026-11-01): a pinned quest comes off the tracker only from its row's menu
 * (js/ui/quest-pin-menu.js, wired in js/ui/quest-tracker.js). The menu opens on right-click,
 * the Menu key or Shift+F10, or a long press, never on a left click; only its Unpin row unpins
 * (the same save slice the Quests card's Pinned button changes); Esc and a press elsewhere close
 * it, focus going back to the row when the keys opened it and to the world when the pointer
 * did (js/ui/focus-return.js); a left click still opens Quests.
 */
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl, matches } from './social-fake-dom.js';
import { createQuestTracker } from '../public/js/ui/quest-tracker.js?v=76c0a782';
import { isPinMenuKey, placePinMenu, LONG_PRESS_MS, PIN_MENU_ROWS } from '../public/js/ui/quest-pin-menu.js?v=7e50df06';
import { questPinsFeature } from '../public/js/features/quest-pins-feature.js?v=e59012f1';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

/** FakeEl with closest() and a document (the tracker and the verb menu use both). */
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
  get isConnected() { for (let n = this; n; n = n.parentElement) if (n === globalThis.document.body) return true; return false; }
}

const ROWS = [
  { classTsid: 'happy_endings', title: 'Happy Endings For All!', step: 'Massage 7 Butterflies', count: '0/7', percent: 0 },
  { classTsid: 'porcine_pleaser', title: 'Porcine Pleaser', step: 'Pet Piggies', count: '2/6', percent: 33 },
];

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
  globalThis.CSS = { escape: (s) => s };
  const root = new El('div');
  root.id = 'game-root';
  root.rect = { left: 0, top: 60, right: 1280, bottom: 800, width: 1280, height: 740 };
  const card = new El('section');
  card.id = 'quest-pins';
  card.rect = { left: 16, top: 120, right: 260, bottom: 260, width: 244, height: 140 };
  const head = new El('div');
  const title = new El('span');
  title.setAttribute('data-pins-title', '');
  const toggle = new El('button');
  toggle.setAttribute('data-pins-toggle', '');
  head.append(title, toggle);
  const list = new El('div');
  list.setAttribute('data-pins-list', '');
  card.append(head, list);
  root.append(card);
  doc.body.append(root);

  const calls = { open: [], unpin: [], data: {} };
  questPinsFeature.restore({ pins: ROWS.map((r) => r.classTsid) });
  let t = 1000;
  const tracker = createQuestTracker({
    el: card,
    now: () => t,
    setData: (k, v) => { calls.data[k] = v; },
    onOpen: (id) => calls.open.push(id),
    // As game.js: the feature's toggle, the save, then the HUD redraw.
    onUnpin: (id) => {
      calls.unpin.push(id);
      if (questPinsFeature.isPinned(id)) questPinsFeature.toggle(id);
      draw();
    },
  });
  /** render(), then the rows the markup describes (the fake DOM does not parse innerHTML). */
  function draw() {
    const shown = ROWS.filter((r) => questPinsFeature.isPinned(r.classTsid));
    tracker.render(shown, false);
    list.children = [];
    for (const r of shown) {
      const row = new El('button');
      row.className = 'tq';
      row.dataset.pin = r.classTsid;
      row.rect = { left: 24, top: 150, right: 252, bottom: 200, width: 228, height: 50 };
      list.append(row);
    }
  }
  draw();
  const row = (id) => list.querySelector(`[data-pin="${id}"]`);
  const menuEl = () => root.querySelector('#quest-pin-menu');
  const item = (id) => menuEl()?.querySelector(`[data-qpm="${id}"]`);
  return { doc, root, list, tracker, calls, row, menuEl, item, draw, tick: (ms) => { t += ms; } };
}

let s;
beforeEach(() => { s = setup(); });
afterEach(() => {
  questPinsFeature.restore(undefined);
  delete globalThis.document;
  mock.timers.reset();
});

describe('the pinned quest row menu (js/ui/quest-pin-menu.js)', () => {
  it('opens on the Menu key or Shift+F10 only, never with Ctrl, Alt or Cmd', () => {
    assert.equal(isPinMenuKey({ key: 'ContextMenu' }), true);
    assert.equal(isPinMenuKey({ key: 'F10', shiftKey: true }), true);
    assert.equal(isPinMenuKey({ key: 'F10' }), false);
    assert.equal(isPinMenuKey({ key: 'F10', shiftKey: true, ctrlKey: true }), false);
    assert.equal(isPinMenuKey({ key: 'ContextMenu', metaKey: true }), false);
    for (const key of ['Enter', ' ', 'u', 'Delete', 'Backspace']) assert.equal(isPinMenuKey({ key }), false, key);
  });

  it('lists Unpin then Open in Quests (key caps 1 and 2)', () => {
    assert.deepEqual(PIN_MENU_ROWS.map((r) => r.label), ['Unpin', 'Open in Quests']);
  });

  it('a left click opens Quests on the quest, as before: no menu, no unpin', () => {
    s.row('happy_endings').click();
    assert.deepEqual(s.calls.open, ['happy_endings']);
    assert.equal(s.tracker.menu.isOpen(), false);
    assert.equal(s.menuEl(), null, 'the menu is not even built');
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);
  });

  it('a right-click opens the menu at the pointer instead of the browser menu, and unpins nothing', () => {
    const e = s.row('happy_endings').dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.equal(s.tracker.menu.isOpen(), true);
    assert.equal(s.tracker.menu.pin(), 'happy_endings');
    assert.equal(s.calls.data.questPinMenu, 'happy_endings');
    assert.equal(s.menuEl().hidden, false);
    assert.equal(s.menuEl().querySelector('.qpm-title').textContent, 'Happy Endings For All!');
    assert.equal(s.menuEl().style.left, '300px');
    assert.equal(s.menuEl().style.top, '160px');
    assert.equal(s.doc.activeElement, s.item('unpin'), 'focus on Unpin');
    assert.deepEqual(s.calls.unpin, []);
    assert.deepEqual(s.calls.open, []);
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);
  });

  it('Shift+F10 or the Menu key on a focused row opens it beside the tracker; other keys do not', () => {
    for (const key of ['Enter', 'u', 'Delete']) {
      s.row('porcine_pleaser').dispatch('keydown', { key });
      assert.equal(s.tracker.menu.isOpen(), false, key);
    }
    const e = s.row('porcine_pleaser').dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(e.defaultPrevented, true);
    assert.equal(e.stopped, true, 'the game never sees it');
    assert.equal(s.tracker.menu.pin(), 'porcine_pleaser');
    assert.equal(s.menuEl().style.left, '266px', 'right of the card');
    // The contextmenu event the key sends after it does not move or reopen the menu.
    s.row('porcine_pleaser').dispatch('contextmenu', { clientX: 0, clientY: 0 });
    assert.equal(s.menuEl().style.left, '266px');
    s.tracker.menu.close();
    s.row('happy_endings').dispatch('keydown', { key: 'ContextMenu' });
    assert.equal(s.tracker.menu.pin(), 'happy_endings');
  });

  it('Unpin takes the pin off, in the save slice the Quests card reads, and closes the menu', () => {
    s.row('happy_endings').dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    s.item('unpin').click();
    assert.deepEqual(s.calls.unpin, ['happy_endings']);
    assert.equal(s.tracker.menu.isOpen(), false);
    assert.equal(s.menuEl().hidden, true);
    assert.equal(s.calls.data.questPinMenu, '');
    assert.equal(questPinsFeature.isPinned('happy_endings'), false, 'the Quests card shows Pin to screen again');
    assert.deepEqual(JSON.parse(JSON.stringify(questPinsFeature.save())).pins, ['porcine_pleaser']);
    assert.equal(s.calls.data.questPins, 'porcine_pleaser:2/6');
    assert.equal(s.doc.activeElement, s.doc.body, 'a pointer unpin leaves focus with the world (Enter stays the world\'s)');
    assert.deepEqual(s.calls.open, []);
  });

  it('keys in the menu stay out of the game: 1 unpins, 2 opens Quests, Esc closes back to the row', () => {
    s.row('happy_endings').dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    const esc = s.item('unpin').dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true);
    assert.equal(s.tracker.menu.isOpen(), false);
    assert.equal(s.doc.activeElement, s.doc.body, 'opened by the pointer: focus back to the world');
    s.row('happy_endings').dispatch('keydown', { key: 'F10', shiftKey: true });
    s.item('unpin').dispatch('keydown', { key: 'Escape' });
    assert.equal(s.doc.activeElement, s.row('happy_endings'), 'opened from the keys: focus back to the row');
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);

    s.row('happy_endings').dispatch('keydown', { key: 'F10', shiftKey: true });
    const space = s.item('unpin').dispatch('keydown', { key: ' ' });
    assert.equal(space.stopped, true, 'Space does not jump');
    s.item('unpin').dispatch('keydown', { key: '2' });
    assert.deepEqual(s.calls.open, ['happy_endings']);
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);

    s.row('happy_endings').dispatch('keydown', { key: 'F10', shiftKey: true });
    s.item('unpin').dispatch('keydown', { key: '1' });
    assert.deepEqual(questPinsFeature.pins(), ['porcine_pleaser']);
    assert.equal(s.doc.activeElement, s.row('porcine_pleaser'), 'focus moves to the pin that is left');
  });

  it('a press anywhere else closes it, unpinning nothing', () => {
    s.row('happy_endings').dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    for (const fn of s.doc.listeners.pointerdown) fn({ target: s.item('unpin') });
    assert.equal(s.tracker.menu.isOpen(), true, 'a press inside keeps it');
    for (const fn of s.doc.listeners.pointerdown) fn({ target: s.root });
    assert.equal(s.tracker.menu.isOpen(), false);
    assert.equal(s.doc.activeElement, s.doc.body);
    s.row('happy_endings').dispatch('keydown', { key: 'ContextMenu' });
    for (const fn of s.doc.listeners.pointerdown) fn({ target: s.root });
    assert.equal(s.tracker.menu.isOpen(), false);
    assert.equal(s.doc.activeElement, s.row('happy_endings'), 'opened from the keys: back to the row');
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);
  });

  it('a long press on touch opens it and its tap opens nothing; a short tap still opens Quests', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const row = s.row('happy_endings');
    row.dispatch('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 170 });
    mock.timers.tick(LONG_PRESS_MS - 100);
    row.dispatch('pointerup', { pointerType: 'touch' });
    mock.timers.tick(200);
    assert.equal(s.tracker.menu.isOpen(), false, 'a short tap is a tap');
    row.click();
    assert.deepEqual(s.calls.open, ['happy_endings']);

    row.dispatch('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 170 });
    mock.timers.tick(LONG_PRESS_MS);
    assert.equal(s.tracker.menu.pin(), 'happy_endings');
    row.dispatch('pointerup', { pointerType: 'touch' });
    row.click();
    assert.deepEqual(s.calls.open, ['happy_endings'], 'the long press\'s click opened nothing');
    assert.deepEqual(questPinsFeature.pins(), ['happy_endings', 'porcine_pleaser']);

    // A finger that slides (a scroll) is not a long press; a mouse never is.
    s.tracker.menu.close();
    row.dispatch('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 170 });
    row.dispatch('pointermove', { pointerType: 'touch', clientX: 100, clientY: 200 });
    mock.timers.tick(LONG_PRESS_MS * 2);
    row.dispatch('pointerdown', { pointerType: 'mouse', clientX: 100, clientY: 170 });
    mock.timers.tick(LONG_PRESS_MS * 2);
    assert.equal(s.tracker.menu.isOpen(), false);
  });

  it('closes when its quest leaves the tracker or the tracker folds', () => {
    s.row('porcine_pleaser').dispatch('contextmenu', { clientX: 300, clientY: 260, button: 2 });
    s.tracker.render(ROWS.slice(0, 1), false);
    assert.equal(s.tracker.menu.isOpen(), false);
    s.draw();
    s.row('happy_endings').dispatch('contextmenu', { clientX: 300, clientY: 220, button: 2 });
    s.tracker.render(ROWS, true);
    assert.equal(s.tracker.menu.isOpen(), false);
  });

  it('stays inside the window', () => {
    assert.deepEqual(placePinMenu({ at: { x: 1260, y: 700 }, size: { w: 216, h: 140 }, room: { w: 1280, h: 740 } }), { x: 1044, y: 592 });
    assert.deepEqual(placePinMenu({ anchor: { right: 360, top: 100 }, size: { w: 216, h: 140 }, room: { w: 375, h: 600 } }), { x: 151, y: 100 });
  });
});

describe('the game wiring', () => {
  it('Unpin is the Quests card\'s unpin: the feature toggle, the player save, the HUD redraw', () => {
    const game = read('game.js');
    const at = game.indexOf('onUnpin: (classTsid) => {');
    assert.ok(at > 0);
    const body = game.slice(at, game.indexOf('},', at));
    assert.match(body, /pins\.toggle\(classTsid\);\s*savePlayerState\(\);\s*updateHud\(\);/);
    assert.match(body, /if \(!pins\?\.isPinned\(classTsid\)\) return;/);
  });

  it('only the modern skin shows the tracker, so only it shows the menu (Classic has no tracker)', () => {
    const css = read('style.css');
    assert.match(css, /\n\.quest-pins \{ display: none; \}/);
    assert.match(css, /\n\.quest-pin-menu \{ display: none; \}/);
    assert.match(css, /\[data-ui="modern"\] #game-root #quest-pin-menu:not\(\[hidden\]\) \{/);
    assert.doesNotMatch(read('css/classic.css'), /quest-pins|quest-pin-menu/);
  });
});
