/**
 * Report #415 (register G884, Austin 2026-11-16): a "Who's here" list for Local chat with everyone on
 * your street, and how many players are online. Glitch's Local pane title tip said "People here (N):
 * You, A and B", "Just you!" alone (glitch-client ChatArea.as getTip 795-801, RightSideManager.as
 * localTooltip 1212-1255). js/whos-here.js holds the words and the rows; js/ui/social-drawer.js puts
 * the button in Local's head online, the list under it, a row opening that player's menu.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=0eba1119';
import { createNotifier } from '../public/js/notify.js?v=c9d79ec5';
import { WHOS_HERE_TEXT, streetOthers, whosHereView } from '../public/js/whos-here.js?v=82e3aca7';

describe('js/whos-here.js', () => {
  it('the others on the street: roster order, each id once, never you, nobody you block', () => {
    const players = [{ id: 7, name: 'Bo' }, { id: 1, name: 'Me' }, { id: 6, name: 'Fi' }, { id: 7, name: 'Bo' }, { id: 9, name: 'Zed' }, { name: 'No id' }];
    assert.deepEqual(streetOthers(players, { meId: 1, hidden: (id) => id === 9 }), [{ id: 7, name: 'Bo' }, { id: 6, name: 'Fi' }, { id: 0, name: 'No id' }]);
    assert.deepEqual(streetOthers(null), []);
    assert.deepEqual(streetOthers([null, 'x']), []);
    assert.deepEqual(streetOthers([{ id: 3, name: '  ' }]), [{ id: 3, name: 'Someone' }]);
  });

  it('the view: Glitch\'s "People here (N)" counting you, you first, "Just you!" alone, the online line once known', () => {
    const v = whosHereView({ me: { id: 1, name: 'Me' }, players: [{ id: 6, name: 'Fi' }, { id: 9, name: 'Zed' }], hidden: (id) => id === 9, online: 8 });
    assert.equal(v.head, 'People here (2)');
    assert.deepEqual(v.rows.map((r) => [r.name, r.you]), [['You', true], ['Fi', false]]);
    assert.equal(v.alone, '');
    assert.equal(v.online, '8 other players online. See who');
    assert.equal(v.onlineHref, '/chat/');
    const alone = whosHereView({ me: { id: 1 }, players: [], online: null });
    assert.equal(alone.head, 'People here (1)');
    assert.equal(alone.alone, 'Just you!');
    assert.equal(alone.online, '');
    assert.equal(alone.onlineHref, '', 'no count (solo, or not yet known): nothing to link');
    assert.equal(whosHereView({ online: 1 }).online, '1 other player online. See who');
    assert.doesNotMatch(WHOS_HERE_TEXT.online(3), /—/);
    assert.equal(WHOS_HERE_TEXT.button, "Who's here");
  });
});

describe('the Social drawer\'s Who\'s here (online)', () => {
  const saved = {};
  let t;
  let drawer;
  let opened;
  let ignoring;
  const data = {};

  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleBuddies', 'groddleRealtime']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    opened = [];
    ignoring = new Set([9]);
    globalThis.groddleRealtime = {
      client: { state: 'online', me: { id: 1, name: 'Ada' }, here: 4, players: [{ id: 6, name: 'Fi' }, { id: 9, name: 'Zed' }, { id: 4, name: 'Moss' }] },
    };
    globalThis.groddleBuddies = { isIgnoring: (id) => ignoring.has(Number(id)), drawerView: () => null };
    drawer = mountSocialDrawer({
      root: t.game,
      dock: t.dock,
      notifier: createNotifier({ onChange: () => drawer?.update() }),
      mode: 'online',
      storage: memoryStore(),
      width: () => 1920,
      setData: (k, v) => { data[k] = v; },
      playerMenu: (opts) => {
        opened.push(opts);
        return true;
      },
      contextMenu: () => ({ isOpenFor: () => false, close: () => {} }),
    });
    // The realtime feature hands Local its emotes as the head.
    const emotes = t.doc.createElement('div');
    emotes.classList.add('mp-emotes');
    drawer.channel('local', { header: emotes });
    drawer.select('local');
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const head = () => t.dock.querySelector('[data-social-view-head]');
  const btn = () => head().querySelector('[data-social-who]');
  const list = () => head().querySelector('[data-social-who-list]');
  const row = (id) => list().querySelector(`[data-social-here="${id}"]`);

  it('Local\'s head has the button beside the emotes; the list starts shut', () => {
    assert.ok(btn(), 'the button is in Local\'s head');
    assert.equal(btn().textContent, "Who's here");
    assert.equal(btn().getAttribute('aria-expanded'), 'false');
    assert.ok(head().querySelector('.mp-emotes'), 'the emotes stay');
    assert.equal(list().hidden, true);
    assert.equal(data.socialWhoNames, '');
  });

  it('the presence line counts the others here without anyone you block', () => {
    const label = t.dock.querySelector('.social-presence-label').textContent;
    assert.match(label, /^2 here$/);
    drawer.setOnline(8);
    assert.match(t.dock.querySelector('.social-presence-label').textContent, /2 here · 8 online/);
  });

  it('the button opens the list: People here (N), you first, the street in order, no blocked player, the online count', () => {
    btn().dispatch('click', { detail: 1 });
    assert.equal(btn().getAttribute('aria-expanded'), 'true');
    assert.equal(list().hidden, false);
    assert.equal(list().querySelector('[data-social-who-head]').textContent, 'People here (3)');
    const ids = list().querySelectorAll('[data-social-here]').map((li) => li.getAttribute('data-social-here'));
    assert.deepEqual(ids, ['1', '6', '4']);
    assert.equal(row(9), null, 'someone you block is not listed');
    assert.match(row(1).textContent, /You/);
    assert.equal(row(1).getAttribute('data-ctx'), null, 'your own row has no menu');
    // The website's /chat/ lists everyone online (its Who's around panel), in a new tab so the game keeps running.
    const line = list().querySelector('[data-social-who-online]');
    assert.equal(line.textContent, '8 other players online. See who');
    const link = line.querySelector('a[data-social-who-chat]');
    assert.ok(link, 'the online line is a link');
    assert.equal(link.getAttribute('href'), '/chat/');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener');
    // A chat link home (js/chat-links.js): styled as the chat's links, opened without the away-link confirm.
    assert.equal(link.getAttribute('class'), 'chat-link');
    assert.equal(link.getAttribute('data-chat-link'), 'home');
    assert.equal(link.textContent, '8 other players online. See who');
    assert.equal(data.socialWhoNames, 'Fi,Moss');
    // Each row shows the site's face where it has one (the circle stays under it).
    assert.equal(row(6).querySelector('img').getAttribute('src'), '/players/6/tile');
  });

  it('a row opens that player\'s menu at the pointer; Enter on the name opens it for the keys', () => {
    const who = row(6).querySelector('[data-social-here-who]');
    who.dispatch('click', { detail: 1, clientX: 1500, clientY: 200 });
    assert.equal(opened.length, 1);
    assert.deepEqual({ id: opened[0].id, name: opened[0].name, at: opened[0].at, keys: opened[0].keys }, { id: 6, name: 'Fi', at: { x: 1500, y: 200 }, keys: false });
    row(4).querySelector('[data-social-here-who]').dispatch('click', { detail: 0 });
    assert.equal(opened.at(-1).id, 4);
    assert.equal(opened.at(-1).keys, true);
    row(1).dispatch('click', { detail: 1, clientX: 1, clientY: 1 });
    assert.equal(opened.length, 2, 'your own row opens nothing');
    const e = row(4).dispatch('contextmenu', { clientX: 1510, clientY: 240, button: 2 });
    assert.equal(e.defaultPrevented, true);
    assert.equal(opened.at(-1).id, 4);
  });

  it('follows the street: an arrival and a block show at the next redraw; alone it says Just you!', () => {
    globalThis.groddleRealtime.client.players.push({ id: 12, name: 'Pip' });
    globalThis.groddleRealtime.client.here = 5;
    ignoring.add(4);
    drawer.refresh();
    assert.deepEqual(list().querySelectorAll('[data-social-here]').map((li) => li.getAttribute('data-social-here')), ['1', '6', '12']);
    globalThis.groddleRealtime.client.players = [];
    globalThis.groddleRealtime.client.here = 1;
    drawer.refresh();
    assert.equal(list().querySelector('[data-social-who-head]').textContent, 'People here (1)');
    assert.match(list().textContent, /Just you!/);
  });

  it('the button shuts it again', () => {
    btn().dispatch('click', { detail: 1 });
    assert.equal(list().hidden, true);
    assert.equal(data.socialWhoNames, '');
  });

  it('G884: a tap on the top line (N here · N online) opens Local with Who\'s here open, not Buddies', () => {
    globalThis.groddleRealtime.client.players = [{ id: 6, name: 'Fi' }];
    globalThis.groddleRealtime.client.here = 2;
    drawer.select('global');
    assert.equal(data.socialTab, 'global');
    const pill = t.dock.querySelector('[data-social-presence]');
    assert.match(pill.getAttribute('aria-label'), /Show who's here$/);
    pill.dispatch('click', { detail: 1 });
    assert.equal(data.socialTab, 'local');
    assert.equal(list().hidden, false);
    assert.equal(btn().getAttribute('aria-expanded'), 'true');
    assert.equal(data.socialWhoNames, 'Fi');
    // Again while it is open: it stays open (the button is what shuts it).
    pill.dispatch('click', { detail: 1 });
    assert.equal(list().hidden, false);
  });
});

describe('G884: /who leaves out players you block, as the list does', () => {
  it('realtime-feature remotePlayerNames asks realtimeHidden (buddies-feature) for each player; game.js whoIsHere uses it', () => {
    const rt = readFileSync(new URL('../public/js/features/realtime-feature.js', import.meta.url), 'utf8');
    const body = rt.slice(rt.indexOf('  remotePlayerNames(engine) {'), rt.indexOf('\n  },', rt.indexOf('  remotePlayerNames(engine) {')));
    assert.match(body, /session\.client\.players\.filter\(\(p\) => !engine\?\.query\?\.\('realtimeHidden', p\.id\)\)\.map\(\(p\) => p\.name\)/);
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(game, /whoIsHere: \(\) => \[[^\n]*features\.query\('remotePlayerNames', engine\)/);
  });
});

describe('#415 follow-up: the online line is ours', () => {
  it('is in the Inventions list', () => {
    const reg = JSON.parse(readFileSync(new URL('../tools/inventions/inventions.json', import.meta.url), 'utf8'));
    const entry = reg.entries.find((e) => e.id === 'whos-here-online-link');
    assert.ok(entry, 'whos-here-online-link entry');
    assert.equal(entry.status, 'kept');
    assert.match(entry.ruling, /#415/);
  });
});

describe('solo', () => {
  it('has no Who\'s here (nobody else plays there)', () => {
    const saved = { document: globalThis.document, groddleSocial: globalThis.groddleSocial, CSS: globalThis.CSS };
    const t = page();
    globalThis.document = t.doc;
    globalThis.CSS = { escape: (s) => s };
    try {
      mountSocialDrawer({ root: t.game, dock: t.dock, notifier: createNotifier({}), mode: 'solo', storage: memoryStore(), width: () => 1920 });
      assert.equal(t.dock.querySelector('[data-social-who]'), null);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete globalThis[k];
        else globalThis[k] = v;
      }
    }
  });
});
