/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit later batch item 5): a row in the Social
 * drawer's Chats list has a menu: a right-click, a long press, Shift+F10 or the Menu key opens Open
 * (what a click on the row does), then that conversation's head buttons (Who is here and Close for
 * a group or a channel, Leave for the party, Close for an IM); an IM's row is the other player's
 * menu from a list (js/ui/player-menu.js) with Open first and IM left out (Open is the IM). Each
 * row presses the conversation's own button (R3: nothing new). A left click still opens the chat.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=f320dfb0';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { MORE_KEYS_LABEL } from '../public/js/ui/context-menu.js?v=79326483';
import { IM_VERB_ID } from '../public/js/player-im.js?v=da51888c';

function head(buttons) {
  const h = new FakeEl('div');
  const pressed = [];
  for (const [attr, label, hidden] of buttons) {
    const b = new FakeEl('button');
    b.setAttribute(attr, '');
    b.textContent = label;
    if (hidden) b.hidden = true;
    b.addEventListener('click', () => pressed.push(label));
    h.append(b);
  }
  return { h, pressed };
}

describe('a Chats row\'s menu (js/ui/social-drawer.js)', () => {
  const saved = {};
  let t;
  let drawer;
  let menus;
  let players;
  let heads;
  let openOwner = '';

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    menus = [];
    players = [];
    const menu = {
      open: (opts) => { menus.push(opts); openOwner = opts.owner; return true; },
      isOpenFor: (owner) => owner === openOwner,
      close: () => { openOwner = ''; },
    };
    drawer = mountSocialDrawer({
      root: t.game,
      dock: t.dock,
      notifier: createNotifier({ onChange: () => drawer?.update() }),
      mode: 'online',
      storage: memoryStore(),
      width: () => 1920,
      playerMenu: (opts) => { players.push(opts); openOwner = `player:${opts.id}`; return true; },
      contextMenu: () => menu,
    });
    heads = {
      group: head([['data-groups-who', 'Who is here'], ['data-groups-close-chat', 'Close']]),
      party: head([['data-party-invite', 'Invite Fi'], ['data-party-leave', 'Leave']]),
      im: head([['data-im-close', 'Close']]),
    };
    drawer.channel('group:12', { label: 'Zebra Club', header: heads.group.h, section: 'groups', note: '3 members' });
    drawer.channel('party', { label: 'Party', header: heads.party.h, section: 'private' });
    drawer.channel('im:8', { label: 'Bo', header: heads.im.h, section: 'private' });
    drawer.channel('butler', { label: 'Jeeves', section: 'private', note: 'Butler' });
    drawer.select('chats');
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const row = (id) => t.dock.querySelector(`[data-social-chat="${id}"]`);

  it('each row is ours, says it has a menu, and its label ends "Shift+F10 for more"', () => {
    const r = row('group:12');
    assert.equal(r.getAttribute('data-ctx'), 'chat');
    assert.equal(r.getAttribute('aria-haspopup'), 'menu');
    assert.equal(r.getAttribute('aria-keyshortcuts'), 'Shift+F10');
    assert.ok(r.getAttribute('aria-label').endsWith(`. ${MORE_KEYS_LABEL}`), r.getAttribute('aria-label'));
  });

  it('a group: Open, Who is here, Close at the pointer; the browser\'s menu stopped', () => {
    const e = row('group:12').dispatch('contextmenu', { clientX: 1200, clientY: 260, button: 2 });
    assert.equal(e.defaultPrevented, true);
    const m = menus.at(-1);
    assert.equal(m.owner, 'chat:group:12');
    assert.equal(m.title, 'Zebra Club');
    assert.deepEqual(m.at, { x: 1200, y: 260 });
    assert.deepEqual(m.rows.map((r) => r.label), ['Open', 'Who is here', 'Close']);
  });

  it('Open opens the conversation (the left click); Close presses its Close; Who is here opens it and asks', () => {
    let m = menus.at(-1);
    m.onPick('open', { row: m.rows[0] });
    assert.equal(drawer.chat, 'group:12');
    drawer.select('chats');
    row('group:12').dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    m = menus.at(-1);
    m.onPick(m.rows[1].id, { row: m.rows[1] });
    assert.deepEqual(heads.group.pressed, ['Who is here']);
    assert.equal(drawer.chat, 'group:12', 'the answer shows in the conversation');
    drawer.select('chats');
    row('group:12').dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    m = menus.at(-1);
    m.onPick(m.rows[2].id, { row: m.rows[2] });
    assert.deepEqual(heads.group.pressed, ['Who is here', 'Close']);
  });

  it('the party: Open and Leave (not its invite buttons); the Butler: Open', () => {
    row('party').dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    assert.deepEqual(menus.at(-1).rows.map((r) => r.label), ['Open', 'Leave']);
    heads.party.h.querySelector('[data-party-leave]').hidden = true;
    openOwner = ''; // a press elsewhere closed it (the echo guard would hold a second open)
    row('party').dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    assert.deepEqual(menus.at(-1).rows.map((r) => r.label), ['Open'], 'a hidden button is no row');
    row('butler').dispatch('contextmenu', { clientX: 1, clientY: 1, button: 2 });
    assert.deepEqual(menus.at(-1).rows.map((r) => r.label), ['Open']);
  });

  it('an IM: the other player\'s menu from a list, Open first, IM left out, Close after', () => {
    row('im:8').dispatch('contextmenu', { clientX: 5, clientY: 6, button: 2 });
    const p = players.at(-1);
    assert.equal(p.id, 8);
    assert.equal(p.name, 'Bo');
    assert.deepEqual(p.before.map((r) => r.label), ['Open']);
    assert.deepEqual(p.after.map((r) => r.label), ['Close']);
    assert.deepEqual(p.omit, [IM_VERB_ID]);
    p.after[0].run();
    assert.deepEqual(heads.im.pressed, ['Close']);
  });

  it('Shift+F10 on a focused row opens it beside the row, focus coming back to the row as drawn now', () => {
    drawer.select('chats');
    const r = row('butler');
    const k = r.dispatch('keydown', { key: 'F10', shiftKey: true });
    assert.equal(k.defaultPrevented, true);
    const m = menus.at(-1);
    assert.equal(m.keys, true);
    assert.equal(m.at, null);
    assert.equal(m.anchor, r);
    assert.equal(m.findOpener(), row('butler'));
  });

  it('a left click still opens the conversation, no menu', () => {
    drawer.select('chats');
    const n = menus.length;
    row('butler').click();
    assert.equal(drawer.chat, 'butler');
    assert.equal(menus.length, n);
  });
});
