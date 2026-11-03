/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit R4): one contextmenu listener on the document
 * (js/ui/context-guard.js) stops the browser's own menu over the game's canvas, over anything with
 * a menu of ours ([data-ctx]) and over plain HUD controls, and leaves it for text fields, links,
 * selected text and everything else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserMenuPolicy, installContextGuard, selectionCovers } from '../public/js/ui/context-guard.js?v=0f71ac17';

/** One compound selector part: tag, #id, [attr], [attr="v"] and :not([attr="v"]). */
function matchOne(n, part) {
  const m = /^([a-z]+)?(#[\w-]+)?((?:\[[^\]]+\])*)((?::not\(\[[^\]]+\]\))*)$/i.exec(part.trim());
  if (!m) throw new Error(`selector ${part}`);
  if (m[1] && n.tag !== m[1].toLowerCase()) return false;
  if (m[2] && n.attrs.id !== m[2].slice(1)) return false;
  const attrOk = (a, v) => (v === undefined ? a in n.attrs : n.attrs[a] === v);
  for (const a of m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (!attrOk(a[1], a[2])) return false;
  for (const a of m[4].matchAll(/:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/g)) if (attrOk(a[1], a[2])) return false;
  return true;
}
function matches(n, sel) {
  return sel.split(',').some((one) => {
    const parts = one.split('>').map((s) => s.trim());
    if (parts.length === 2) return matchOne(n, parts[1]) && Boolean(n.parent) && matchOne(n.parent, parts[0]);
    return matchOne(n, parts[0]);
  });
}
function el(tag, attrs = {}, parent = null) {
  const n = { tag, attrs, parent };
  n.matches = (sel) => matches(n, sel);
  n.closest = (sel) => {
    for (let x = n; x; x = x.parent) if (matches(x, sel)) return x;
    return null;
  };
  return n;
}

const root = el('div', { id: 'game-root' });
const canvas = el('canvas', { role: 'application' }, root);
const hud = el('div', { id: 'pack-bar' }, root);

test('the world canvas never shows the browser menu', () => {
  assert.equal(browserMenuPolicy(canvas), 'ours');
  // Even with text selected somewhere: the canvas is the game's.
  const sel = { isCollapsed: false, toString: () => 'words', containsNode: () => true };
  assert.equal(browserMenuPolicy(canvas, { selection: sel }), 'ours');
});

test('a [data-ctx] surface stops the browser menu; a link or selected text in it keeps it', () => {
  const card = el('div', { 'data-ctx': 'quest-card' }, root);
  const head = el('button', { class: 'qc-head' }, card);
  const span = el('span', {}, head);
  assert.equal(browserMenuPolicy(span), 'ours');
  const link = el('a', { href: '/players/bo/' }, card);
  assert.equal(browserMenuPolicy(link), 'browser');
  const words = el('p', {}, card);
  const sel = { isCollapsed: false, toString: () => 'some words', containsNode: (t) => t === words };
  assert.equal(browserMenuPolicy(words, { selection: sel }), 'browser', 'Copy stays for selected text');
  assert.equal(browserMenuPolicy(head, { selection: sel }), 'ours', 'a selection elsewhere does not count');
});

test('plain HUD controls show nothing; fields, links and plain text keep the browser menu', () => {
  assert.equal(browserMenuPolicy(el('button', {}, hud)), 'none');
  assert.equal(browserMenuPolicy(el('img', {}, el('button', {}, hud))), 'none', 'the icon in a pack slot');
  assert.equal(browserMenuPolicy(el('div', { role: 'tab' }, hud)), 'none');
  assert.equal(browserMenuPolicy(el('input', { type: 'checkbox' }, hud)), 'none');
  assert.equal(browserMenuPolicy(el('input', { id: 'local-chat-input' }, hud)), 'browser', 'the chat input keeps Paste');
  assert.equal(browserMenuPolicy(el('input', { type: 'text' }, hud)), 'browser');
  assert.equal(browserMenuPolicy(el('textarea', {}, hud)), 'browser');
  assert.equal(browserMenuPolicy(el('span', {}, el('div', { contenteditable: 'true' }, hud))), 'browser');
  assert.equal(browserMenuPolicy(el('span', {}, el('a', { href: 'https://example.com/' }, hud))), 'browser');
  assert.equal(browserMenuPolicy(el('p', {}, hud)), 'browser', 'help text keeps Copy');
  assert.equal(browserMenuPolicy(null), 'browser');
});

test('selectionCovers only counts a real selection that takes in the target', () => {
  const t = el('p');
  assert.equal(selectionCovers(null, t), false);
  assert.equal(selectionCovers({ isCollapsed: true, toString: () => 'x', containsNode: () => true }, t), false);
  assert.equal(selectionCovers({ isCollapsed: false, toString: () => '  ', containsNode: () => true }, t), false);
  assert.equal(selectionCovers({ isCollapsed: false, toString: () => 'x', containsNode: () => false }, t), false);
  assert.equal(selectionCovers({ isCollapsed: false, toString: () => 'x', containsNode: () => true }, t), true);
});

test('installed once, in the capture phase: it only prevents the default', () => {
  const calls = [];
  const data = {};
  const doc = { addEventListener: (type, fn, capture) => calls.push({ type, fn, capture }), getSelection: () => null };
  installContextGuard(doc, { setData: (k, v) => { data[k] = v; } });
  installContextGuard(doc);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'contextmenu');
  assert.equal(calls[0].capture, true);
  const fire = (target) => {
    const e = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    calls[0].fn(e);
    return e;
  };
  const onCanvas = fire(canvas);
  assert.equal(onCanvas.defaultPrevented, true);
  assert.equal(onCanvas.stopped, undefined, 'the surface still hears it');
  assert.equal(data.browserMenu, 'ours');
  assert.equal(fire(el('button', {}, hud)).defaultPrevented, true);
  assert.equal(data.browserMenu, 'none');
  assert.equal(fire(el('input', { type: 'text' }, hud)).defaultPrevented, false);
  assert.equal(data.browserMenu, 'browser');
});

test('game.js installs it before focus-return, and held-keys keeps its contextmenu safety net', () => {
  const pub = join(import.meta.dirname, '../public');
  const game = readFileSync(join(pub, 'game.js'), 'utf8');
  assert.match(game, /installContextGuard\(document, \{ setData: setCanvasData \}\);[\s\S]{0,400}installFocusReturn\(document\);/);
  const held = readFileSync(join(pub, 'js/held-keys.js'), 'utf8');
  assert.match(held, /doc\.addEventListener\('contextmenu', \(\) => held\.releaseAll\('contextmenu'\), true\);/);
});
