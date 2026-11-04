/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 3): a buddy row (the Social
 * drawer's Buddies tab and the Manage buddies panel) opens that player's menu from a list
 * (js/ui/player-menu.js): a left click on the row, as Glitch's contact rows did
 * (view/ui/chat/ContactElement.as 267-271), a right-click, a long press on touch, Enter or Shift+F10
 * on the name. The chips (IM, Visit; the panel's Remove, Add back, Un-block) act as before. The
 * menu closes when the drawer collapses or the tab changes, and with the panel; over the panel it
 * sits on the screen layer.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=8b819d51';
import { createNotifier } from '../public/js/notify.js?v=37c6b748';
import { LONG_PRESS_MS } from '../public/js/ui/context-menu.js?v=0453d723';

const src = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');

describe('the Buddies tab\'s rows (js/ui/social-drawer.js)', () => {
  const saved = {};
  let t;
  let drawer;
  let opened;
  let menuOpen;
  let closed;
  const chips = [];

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleBuddies']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    opened = [];
    closed = 0;
    menuOpen = '';
    globalThis.groddleBuddies = {
      drawerView: () => ({
        rows: [
          { id: 4, name: 'Moss', online: true, where: 'Online: Groddle Meadow', actions: [{ label: 'IM', run: () => chips.push('im:4') }, { label: 'Visit', run: () => chips.push('visit:4') }] },
          { id: 5, name: 'Pip', online: false, where: 'Offline', actions: [] },
        ],
        empty: 'No buddies yet.',
        addedYou: [],
        newAdds: [],
        manage: () => {},
      }),
    };
    const menu = { isOpenFor: (owner) => owner === menuOpen, close: () => { closed += 1; menuOpen = ''; } };
    drawer = mountSocialDrawer({
      root: t.game,
      dock: t.dock,
      notifier: createNotifier({ onChange: () => drawer?.update() }),
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
    drawer.select('buddies');
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const log = () => t.dock.querySelector('[data-social-log]');
  const row = (id) => log().querySelector(`[data-social-buddy="${id}"]`);

  it('each row is ours ([data-ctx]) with its name as the keys\' button', () => {
    const li = row(4);
    assert.equal(li.getAttribute('data-ctx'), 'player');
    assert.equal(li.getAttribute('data-name'), 'Moss');
    const who = li.querySelector('[data-social-buddy-who]');
    assert.equal(who.tagName, 'BUTTON');
    assert.equal(who.getAttribute('aria-haspopup'), 'menu');
    assert.equal(who.getAttribute('aria-keyshortcuts'), 'Shift+F10');
    assert.match(who.textContent, /Moss.*Online: Groddle Meadow/);
  });

  it('a left click on the row opens the buddy\'s menu at the pointer; a click on a chip does the chip', () => {
    const li = row(4);
    li.querySelector('[data-social-buddy-who]').dispatch('click', { detail: 1, clientX: 1200, clientY: 300 });
    assert.equal(opened.length, 1);
    assert.deepEqual({ id: opened[0].id, name: opened[0].name, at: opened[0].at, keys: opened[0].keys }, { id: 4, name: 'Moss', at: { x: 1200, y: 300 }, keys: false });
    assert.equal(opened[0].anchor, row(4));
    row(4).querySelectorAll('.social-chip')[0].dispatch('click', { detail: 1 });
    assert.deepEqual(chips, ['im:4']);
    assert.equal(opened.length, 1, 'the chip opened no menu');
  });

  it('a right-click anywhere on the row (a chip too) opens it and stops the browser\'s menu', () => {
    const e = row(5).dispatch('contextmenu', { clientX: 1210, clientY: 340, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.equal(opened.at(-1).id, 5);
    const c = row(4).querySelectorAll('.social-chip')[1].dispatch('contextmenu', { clientX: 1300, clientY: 300, button: 2 });
    assert.equal(c.defaultPrevented, true);
    assert.equal(opened.at(-1).id, 4);
  });

  it('Enter (a keyboard click) or Shift+F10 on the name: beside the row, focus coming back to the name', () => {
    const who = row(5).querySelector('[data-social-buddy-who]');
    who.dispatch('click', { detail: 0 });
    assert.equal(opened.at(-1).keys, true);
    assert.equal(opened.at(-1).opener, who);
    assert.equal(opened.at(-1).findOpener(), row(5).querySelector('[data-social-buddy-who]'));
    const k = who.dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.defaultPrevented, true);
    assert.equal(opened.at(-1).keys, true);
    assert.equal(opened.at(-1).id, 5);
  });

  it('a long press on touch opens it (the click it ends in opens nothing more)', async () => {
    const n = opened.length;
    row(4).dispatch('pointerdown', { pointerType: 'touch', clientX: 1200, clientY: 300, button: 0 });
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60));
    assert.equal(opened.length, n + 1);
    assert.equal(opened.at(-1).id, 4);
    row(4).dispatch('click', { detail: 1, clientX: 1200, clientY: 300 });
    assert.equal(opened.length, n + 1);
  });

  it('closes when the tab changes or the drawer collapses', () => {
    row(4).dispatch('click', { detail: 1, clientX: 1, clientY: 1 });
    const was = closed;
    drawer.select('local');
    assert.equal(closed, was + 1);
    drawer.select('buddies');
    row(4).dispatch('click', { detail: 1, clientX: 1, clientY: 1 });
    drawer.close();
    assert.equal(closed, was + 2);
  });
});

describe('the Manage buddies panel (features/buddies-feature.js)', () => {
  const feature = src('js/features/buddies-feature.js');
  it('every row is ours with its name a button, when the engine has the menu', () => {
    assert.match(feature, /const li = el\('li', \{ 'data-buddy': String\(entry\.id\), 'data-online': String\(on\), 'data-ctx': menu \? 'player' : false, 'data-name': entry\.name \}\);/);
    assert.match(feature, /el\('button', \{ type: 'button', class: 'buddy-what', 'data-buddy-who': String\(entry\.id\), 'aria-haspopup': 'menu', 'aria-keyshortcuts': 'Shift\+F10' \}\)/);
  });

  it('a click on the row (not its buttons), a right-click, a long press: engine.openPlayerMenu over the panel', () => {
    assert.match(feature, /if \(!li \|\| e\.target\?\.closest\?\.\('button\.buddy-act'\)\) return;/);
    assert.match(feature, /bindContextTrigger\(panel, \{\n\s+rowOf,[\s\S]{0,200}longPress: true,/);
    assert.match(feature, /engine\.openPlayerMenu\?\.\(\{[\s\S]{0,300}layer: 'screen',/);
    assert.match(feature, /findOpener: \(\) => panel\.querySelector\(`\[data-buddy-who="\$\{id\}"\]`\),/);
  });

  it('closing the panel closes its menu', () => {
    assert.match(feature, /function close\(\) \{\n\s+shade\.hidden = true;\n\s+engine\.setData\?\.\('buddiesPanel', 'closed'\);\n\s+if \(menuFor && engine\.isPlayerMenuOpen\?\.\(menuFor\)\) engine\.closePlayerMenu\?\.\(\{ focus: false \}\);/);
  });
});
