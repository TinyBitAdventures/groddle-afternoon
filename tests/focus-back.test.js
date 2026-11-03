// A window that closes gives focus back to its opener only after a keyboard open and close; after a
// mouse or touch open (or a pointer close) the world gets the keys, so Space jumps (Austin 2026-11-03:
// clicked the street name, Esc closed the Map, the street name kept a ring and Space opened the Map again).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD_SELECTOR, focusBack, focusBackTarget, focusWorld, installFocusReturn, lastInput, pressedBy, tabbedSincePointer } from '../public/js/ui/focus-return.js?v=da190597';
import { mountPanelShell } from '../public/js/ui/panel-shell.js?v=6812fe04';

const read = (p) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

/** A tiny document: elements that focus (activeElement follows), a world canvas, listeners by type. */
function fakeDoc() {
  const listeners = {};
  const doc = {
    body: { tag: 'body' },
    activeElement: null,
    listeners,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    fire: (t, e) => { for (const fn of listeners[t] || []) fn(e); },
    byId: {},
    getElementById: (id) => doc.byId[id] || null,
    querySelector: (sel) => (sel === WORLD_SELECTOR ? doc.world : null),
  };
  doc.activeElement = doc.body;
  const node = (name, { control = true, parent = null } = {}) => {
    const self = {
      name,
      parent,
      isConnected: true,
      hidden: false,
      ownerDocument: doc,
      closest: (sel) => {
        const parts = sel.split(',').map((p) => p.trim());
        for (let x = self; x; x = x.parent) {
          if (x.control && parts.includes('button')) return x;
          if (x.modal && parts.includes('[role="dialog"]')) return x;
        }
        return null;
      },
      contains: (n) => { for (let x = n; x; x = x.parent) if (x === self) return true; return false; },
      focus: () => { doc.activeElement = self; },
      blur: () => { if (doc.activeElement === self) doc.activeElement = doc.body; },
      setAttribute() {},
      hasAttribute: () => true,
      querySelector: () => self.title || null,
      control,
    };
    return self;
  };
  doc.node = node;
  doc.world = node('world', { control: false });
  return doc;
}

test('PURE: the opener only after a keyboard open and a keyboard close', () => {
  assert.equal(focusBackTarget({ opener: true, openerPressed: 'keyboard', last: 'keyboard' }), 'opener', 'Tab, Enter, Esc');
  assert.equal(focusBackTarget({ opener: true, openerPressed: 'pointer', last: 'keyboard' }), 'world', 'a click, then Esc');
  assert.equal(focusBackTarget({ opener: true, openerPressed: 'keyboard', last: 'pointer' }), 'world', 'Enter, then the close button clicked');
  assert.equal(focusBackTarget({ opener: true, openerPressed: '', last: '' }), 'opener', 'nothing known: as before');
  assert.equal(focusBackTarget({ opener: false, openerPressed: '', last: 'keyboard' }), 'world', 'no opener');
  assert.equal(focusBackTarget({ opener: true, openerPressed: 'pointer', last: 'keyboard', tabbed: true }), 'opener', 'a click, Tab through it, Esc: the last input wins');
  assert.equal(focusBackTarget({ opener: true, openerPressed: 'pointer', last: 'pointer', tabbed: true }), 'world', 'Tab, then the close button clicked');
});

test('installed: Tab after a mouse open sends Esc back to the opener; a pointer press forgets it', () => {
  const doc = fakeDoc();
  installFocusReturn(doc, { raf: () => {} });
  const pill = doc.node('pill');
  doc.fire('pointerdown', { target: pill });
  assert.equal(tabbedSincePointer(doc), false);
  doc.fire('keydown', { key: 'Tab', target: doc.body });
  assert.equal(tabbedSincePointer(doc), true);
  doc.fire('keydown', { key: 'Escape', target: doc.body });
  assert.equal(focusBack(pill), 'opener', 'a ring on the street name: the player is on the keyboard now');
  doc.fire('pointerdown', { target: pill });
  doc.fire('keydown', { key: 'Escape', target: doc.body });
  assert.equal(tabbedSincePointer(doc), false);
  assert.equal(focusBack(pill), 'world');
});

test('installed: each control remembers how it was last pressed, and the last input of all', () => {
  const doc = fakeDoc();
  const pill = doc.node('pill');
  assert.equal(pressedBy(pill, doc), '', 'nothing tracked before install');
  installFocusReturn(doc, { raf: () => {} });
  doc.fire('pointerdown', { target: pill });
  assert.equal(pressedBy(pill, doc), 'pointer');
  assert.equal(lastInput(doc), 'pointer');
  doc.fire('keydown', { key: 'Shift', target: doc.body });
  assert.equal(lastInput(doc), 'pointer', 'a bare modifier says nothing');
  doc.fire('keydown', { key: 'Escape', target: doc.body });
  assert.equal(lastInput(doc), 'keyboard');
  assert.equal(pressedBy(pill, doc), 'pointer', 'a key elsewhere leaves the pill as it was pressed');
  const icon = doc.node('icon', { control: false, parent: pill });
  doc.fire('keydown', { key: 'Enter', target: icon });
  assert.equal(pressedBy(pill, doc), 'keyboard', 'Enter on the pill (or inside it) counts for the pill');
});

test('focusBack: a mouse-opened window gives the keys to the world, a keyboard one to its opener', () => {
  const doc = fakeDoc();
  installFocusReturn(doc, { raf: () => {} });
  const pill = doc.node('pill');
  // Click the street name, Esc closes the Map.
  doc.fire('pointerdown', { target: pill });
  doc.fire('keydown', { key: 'Escape', target: doc.body });
  assert.equal(focusBack(pill), 'world');
  assert.equal(doc.activeElement, doc.world, 'the world canvas has the keys: Space jumps');
  // Tab to it, Enter, then Esc.
  doc.fire('keydown', { key: 'Enter', target: pill });
  doc.fire('keydown', { key: 'Escape', target: doc.body });
  assert.equal(focusBack(pill), 'opener');
  assert.equal(doc.activeElement, pill, 'a keyboard player is back where they were');
  // Opened by the keyboard, closed with the mouse (the close button).
  doc.fire('pointerdown', { target: doc.node('close') });
  assert.equal(focusBack(pill), 'world');
  // The street map's show button: only the last input counts.
  const show = doc.node('show');
  doc.fire('pointerdown', { target: show });
  doc.fire('keydown', { key: 'Enter', target: doc.body });
  assert.equal(focusBack(show, { byOpener: false }), 'opener');
});

test('focusBack without tracking keeps the old behaviour; focusWorld without a canvas lets go', () => {
  const doc = fakeDoc();
  const btn = doc.node('btn');
  assert.equal(focusBack(btn), 'opener', 'not installed: the opener, as before');
  assert.equal(focusBack(null, { doc }), '', 'not installed and no opener: focus is left alone');
  doc.world = null;
  btn.focus();
  assert.equal(focusWorld(doc), null);
  assert.equal(doc.activeElement, doc.body, 'blurred');
});

test('the click release now gives the keys to the world canvas', () => {
  const doc = fakeDoc();
  const frames = [];
  installFocusReturn(doc, { raf: (fn) => frames.push(fn) });
  const mute = doc.node('mute');
  mute.focus();
  doc.fire('click', { target: mute, detail: 1 });
  frames.shift()();
  assert.equal(doc.activeElement, doc.world);
});

test('panel shell: Esc after a click open hands the world the keys; after a keyboard open, the opener', () => {
  const doc = fakeDoc();
  installFocusReturn(doc, { raf: () => {} });
  const root = doc.node('root', { control: false });
  root.ownerDocument = doc;
  root.style = { getPropertyValue: () => '', setProperty() {} };
  root.dataset = {};
  const map = doc.node('map-panel', { control: false });
  map.modal = true;
  map.title = doc.node('map-title', { control: false, parent: map });
  map.hidden = true;
  doc.byId['map-panel'] = map;
  const shell = mountPanelShell({ root, sheets: [{ id: 'map-panel', kind: 'center' }] });
  const pill = doc.node('street-name');

  // Mouse: the click focuses the street name and opens the Map; Esc closes it.
  doc.fire('pointerdown', { target: pill });
  pill.focus();
  map.hidden = false;
  shell.sync();
  map.title.focus();
  doc.fire('keydown', { key: 'Escape', target: map.title });
  map.hidden = true;
  shell.sync();
  assert.equal(doc.activeElement, doc.world, 'not the street name: Space jumps');

  // Keyboard: Tab to the street name, Enter, Esc.
  pill.focus();
  doc.fire('keydown', { key: 'Enter', target: pill });
  map.hidden = false;
  shell.sync();
  map.title.focus();
  doc.fire('keydown', { key: 'Escape', target: map.title });
  map.hidden = true;
  shell.sync();
  assert.equal(doc.activeElement, pill, 'back on the street name, ring and all');
});

test('the windows that give focus back on close all go through focusBack', () => {
  const shell = read('public/js/ui/panel-shell.js');
  assert.match(shell, /import \{ focusBack \} from '\.\/focus-return\.js(\?v=[0-9a-f]+)?';/);
  assert.match(shell, /focusBack\(opener\?\.isConnected \? opener : null, \{ doc \}\)/);
  assert.doesNotMatch(shell, /opener\.focus/);
  const topbar = read('public/js/ui/topbar.js');
  assert.match(topbar, /if \(back\) focusBack\(btn, \{ doc \}\);/);
  assert.match(read('public/js/ui/imagination-hub.js'), /focusBack\(back, \{ doc \}\)/);
  assert.match(read('public/js/ui/reports-sheet.js'), /if \(back\) focusBack\(back, \{ doc \}\);/);
  assert.match(read('public/js/classic/classic-hub.js'), /focusBack\(back, \{ doc \}\)/);
  assert.match(read('public/js/classic/classic-prefs.js'), /focusBack\(back, \{ doc \}\)/);
  assert.match(read('public/js/features/street-minimap-feature.js'), /focusBack\(view\.showBtn, \{ doc: document, byOpener: false \}\)/);
  const game = read('public/game.js');
  // The Menu, the player card and the energy and mood pills on Esc.
  assert.equal((game.match(/focusBack\(btn\);/g) || []).length, 2);
  assert.match(game, /if \(back && vitalsMenuPill\) focusBack\(vitalsMenuPill\);/);
  assert.doesNotMatch(game, /setOpen\(false\);\n\s+btn\.focus\(\);/);
  // The clock (the hi sign board) lets a click go too.
  assert.match(read('public/js/features/hi-signs-feature.js'), /clock\.dataset\.clickReleases = '';/);
  // Popovers that only set things: Sound, the energy and mood pills'.
  assert.match(topbar, /pop\.dataset\.clickReleases = '';\n\s+popover\(doc, btn, pop,/);
  assert.match(game, /menu\.className = 'vitals-menu';\n[^\n]*\n\s+menu\.dataset\.clickReleases = '';/);
  // The Social drawer: a click opens and closes it without taking the keys (ticket 37).
  const social = read('public/js/ui/social-drawer.js');
  assert.match(social, /focus: e\.detail === 0 \? 'tab' : null/);
  assert.match(social, /focus: e\.detail === 0 \? 'log' : null/);
  assert.match(social, /focus: e\.detail === 0 \? 'rail' : null/);
});
