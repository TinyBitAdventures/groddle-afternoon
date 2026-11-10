/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 2): in every chat the speaker's
 * name is a button; a left click, a right-click, Enter or Shift+F10 opens that player's menu from a
 * list (js/ui/player-menu.js), as Glitch's chat name links did (glitch-client
 * port/RightSideManager.as 305-307). The rest of the line stays text (the browser's Copy), a name
 * inside selected text keeps the browser's menu, your own lines and notes have no button, and the
 * menu closes with the drawer or the tab. The sender's id rides every line path: Local
 * (realtime-feature, engine.chatLine), Global, the groups, Live Help and the Trade Channel
 * (groups-feature drawerLine), the party (party_said) and IMs (player-im.js drawerLine).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=82bcf45b';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { browserMenuPolicy } from '../public/js/ui/context-guard.js?v=0f71ac17';

const src = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

describe('a speaker\'s name in the drawer (js/ui/social-drawer.js)', () => {
  const saved = {};
  let t;
  let drawer;
  let opened;
  let menuOpen;
  let closed;

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    opened = [];
    closed = 0;
    menuOpen = '';
    const menu = { isOpenFor: (owner) => owner === menuOpen, close: () => { closed += 1; menuOpen = ''; } };
    const notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({
      root: t.game,
      dock: t.dock,
      notifier,
      mode: 'online',
      storage: memoryStore(),
      width: () => 1920,
      playerMenu: (opts) => {
        opened.push(opts);
        menuOpen = `player:${opts.id}`;
        return true;
      },
      contextMenu: () => menu,
    });
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const names = () => t.dock.querySelectorAll('.social-name');

  it('another player\'s line: the name is a button with their id; yours, a note and a line with no player are text', () => {
    drawer.localLine('Bo', 'hello there', { playerId: 7 });
    drawer.localLine('Ada', 'hi Bo', { mine: true, playerId: 1 });
    drawer.push('local', { note: true, text: 'Cy is here.' });
    drawer.localLine('Grandma', 'the street spirit said', {});
    const b = names();
    assert.equal(b.length, 1);
    assert.equal(b[0].textContent, 'Bo');
    assert.equal(b[0].getAttribute('data-player-id'), '7');
    assert.equal(b[0].getAttribute('data-ctx'), 'player');
    assert.equal(b[0].getAttribute('aria-haspopup'), 'menu');
    assert.equal(b[0].getAttribute('aria-keyshortcuts'), 'Shift+F10');
    assert.equal(b[0].parentElement.tagName, 'B', 'inside the <b> the Classic skin colours by name');
    assert.match(t.dock.querySelector('[data-social-log]').textContent, /Bo hello there.*You hi Bo.*Grandma the street spirit said/);
    assert.deepEqual(drawer.lines('local').map((l) => l.playerId), [7, 1, 0, 0]);
  });

  it('a left click opens their menu at the pointer; Enter (a keyboard click) beside the name, with focus coming back', () => {
    const b = names()[0];
    b.dispatch('click', { detail: 1, clientX: 40, clientY: 300 });
    assert.equal(opened.length, 1);
    assert.deepEqual({ id: opened[0].id, name: opened[0].name, at: opened[0].at, keys: opened[0].keys }, { id: 7, name: 'Bo', at: { x: 40, y: 300 }, keys: false });
    assert.equal(opened[0].anchor, b);
    b.dispatch('click', { detail: 0 });
    assert.equal(opened[1].keys, true);
    assert.equal(opened[1].at, null);
    assert.equal(typeof opened[1].findOpener, 'function');
  });

  it('a right-click opens the same menu and stops the browser\'s; Shift+F10 too', () => {
    const b = names()[0];
    const e = b.dispatch('contextmenu', { clientX: 50, clientY: 310, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.deepEqual(opened.at(-1).at, { x: 50, y: 310 });
    const k = b.dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.defaultPrevented, true);
    assert.equal(opened.at(-1).keys, true);
    // The page's guard agrees: a [data-ctx] button is ours, the line's text the browser's.
    const fake = (tag, ctx) => ({ tagName: tag, matches: () => false, closest: (sel) => (ctx && sel === '[data-ctx]' ? {} : null) });
    assert.equal(browserMenuPolicy(fake('BUTTON', true)), 'ours');
    assert.equal(browserMenuPolicy(fake('P', false)), 'browser');
  });

  it('inside selected text the name keeps the browser\'s menu (Copy): nothing opens', () => {
    const b = names()[0];
    const n = opened.length;
    t.doc.getSelection = () => ({ isCollapsed: false, toString: () => 'Bo hello', containsNode: () => true });
    const e = b.dispatch('contextmenu', { clientX: 50, clientY: 310, button: 2 });
    delete t.doc.getSelection;
    assert.equal(e.defaultPrevented, false);
    assert.equal(opened.length, n);
  });

  it('the menu closes when the tab changes or the drawer collapses', () => {
    names()[0].dispatch('click', { detail: 1, clientX: 1, clientY: 1 });
    drawer.select('activity');
    assert.equal(closed, 1);
    drawer.select('local');
    names()[0].dispatch('click', { detail: 1, clientX: 1, clientY: 1 });
    drawer.close();
    assert.equal(closed, 2);
  });
});

describe('the sender\'s id on every line path', () => {
  it('Local: realtime-feature passes it to engine.chatLine, game.js on to the drawer', () => {
    assert.match(src('js/features/realtime-feature.js'), /engine\.chatLine\?\.\(name, text, \{ playerId: Number\(id\) \|\| 0, rk: lineKey\(lid\) \}\);/);
    const game = src('game.js');
    assert.match(game, /chatLine: \(speaker, text, \{ playerId = 0, rk = '' \} = \{\}\) => showLocalChatBubble\(String\(speaker \|\| ''\), String\(text \|\| ''\), \{ playerId: Number\(playerId\) \|\| 0, rk: String\(rk \|\| ''\) \}\),/);
    assert.match(game, /socialDrawer\.localLine\(participant, message, \{ feat, mine, playerId, rk \}\);/);
    assert.match(game, /playerMenu: \(opts\) => openPlayerListMenu\(opts\),\n\s+contextMenu: \(\) => playerContextMenu\(\),/);
  });

  it('Global, groups, Live Help and the Trade Channel (groups-feature), the party and IMs', () => {
    assert.match(src('js/features/groups-feature.js'), /const drawerLine = \(line\) => \(line\.note \? \{ note: true, text: line\.text \} : \{ name: shownName\(line\), text: line\.text, mine: line\.id === userId\(\), at: line\.at, playerId: line\.id, rk: reactKey\(line\.lid\) \}\);/);
    assert.match(src('js/features/party-feature.js'), /social\?\.push\('party', \{ name, text, mine: Number\(msg\.id\) === me\(\), at: Number\(msg\.at\) \|\| Date\.now\(\), playerId: Number\(msg\.id\) \|\| 0, rk: lineKey\(msg\.lid\) \}\)/);
    assert.match(src('js/player-im.js'), /playerId: mine \? 0 : Number\(line\.from\) \|\| 0/);
  });

  it('both skins draw the button as the name it was', () => {
    assert.match(src('style.css'), /\.social-msg \.social-name \{[^}]*background: none;[^}]*color: inherit;[^}]*font: inherit;[^}]*cursor: pointer;/);
    assert.match(src('css/classic.css'), /:root\[data-ui="classic"\] \.social-drawer \.social-msg \.social-name \{ color: inherit; font: inherit; \}/);
  });
});
