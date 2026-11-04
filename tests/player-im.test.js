/**
 * IMs between players (Austin 2026-11-02, "Build it"): js/player-im.js, features/player-im-feature.js
 * on the Social drawer's Chats list, the server's half in groddle-afternoon-server im.go.
 * Source: GameServerJS main.js doSendIM 4263-4380; glitch-client InteractionMenuController.as
 * 566-571 (the player menu's IM), RightSideManager.as 591-621 (refusals), RightSideView.as 524-542 (sounds).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IM_REFUSALS,
  IM_TEXT,
  IM_VERB_ID,
  channelOpts,
  drawerLine,
  imId,
  imLinkFrom,
  imPeer,
  imVerb,
  normalState,
  refusalText,
} from '../public/js/player-im.js?v=04c55d2f';
import { playerImFeature } from '../public/js/features/player-im-feature.js?v=8bb50d68';
import { FEATURES } from '../public/js/features/index.js?v=efa812b8';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=d008629d';
import { createNotifier } from '../public/js/notify.js?v=d85330ff';
import { memoryStore, page } from './social-fake-dom.js';
import { serverPath, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('IMs: rules and copy', () => {
  it('a conversation is im:<player> in the Chats list, under Private', () => {
    assert.equal(imId(9), 'im:9');
    assert.equal(imId(0), '');
    assert.equal(imPeer('im:9'), 9);
    assert.equal(imPeer('party'), 0);
    assert.equal(imPeer('im:x'), 0);
    const o = channelOpts('Bo', { buddy: true });
    assert.equal(o.section, 'private');
    assert.equal(o.note, 'Buddy');
    assert.equal(o.placeholder, 'Message Bo');
    assert.equal(channelOpts('Cy').note, 'Player');
  });

  it("the player menu's IM is the source's, and never for a blocked player", () => {
    const v = imVerb({ id: 9 });
    assert.equal(v.id, IM_VERB_ID);
    assert.equal(v.label, 'IM'); // InteractionMenuController.as:567
    assert.equal(v.tooltip, 'Chat with this person directly.'); // :569
    assert.equal(v.sort, 9999);
    assert.equal(imVerb({ id: 9, blocked: true }), null);
    assert.equal(imVerb({ id: 0 }), null);
  });

  it('refusals say "<Name> is <reason>" as the source did; offline accepted says when they get it', () => {
    assert.equal(refusalText('ignoring you', 'Bo'), 'Bo is ignoring you.');
    assert.equal(refusalText('on your ignore list', 'Bo'), 'Bo is on your ignore list.');
    assert.equal(refusalText('offline', 'Bo'), 'Bo is offline.');
    assert.equal(refusalText('self', 'Ada'), "You can't IM yourself.");
    assert.ok(IM_REFUSALS.slow_down);
    assert.equal(IM_TEXT.offline('Bo'), "Bo is offline: they'll get it when they're back.");
    assert.doesNotMatch(Object.values(IM_TEXT).map((v) => (typeof v === 'function' ? v('X') : v)).join(' '), /—/, 'no em-dashes');
  });

  it("a player page's link names the player", () => {
    assert.deepEqual(imLinkFrom('#im=9&name=Bo%20Peep'), { id: 9, name: 'Bo Peep' });
    assert.deepEqual(imLinkFrom('#im=9'), { id: 9, name: '' });
    assert.equal(imLinkFrom('#new'), null);
    assert.equal(imLinkFrom('#im=x'), null);
    assert.deepEqual(imLinkFrom('#im=9&name=%E0%A4%A'), { id: 9, name: '' }, 'a bad name is no name');
  });

  it('a state from the server is read carefully', () => {
    const s = normalState({ convs: [
      { with: { id: 9, name: ' Bo ', online: true }, lines: [{ id: 2, from: 9, text: 'b', at: 2 }, { id: 1, from: 7, text: 'a', at: 1 }, { id: 0, from: 7, text: 'bad' }], unread: 1 },
      { with: { id: 'x' } },
    ] });
    assert.equal(s.length, 1);
    assert.deepEqual(s[0].lines.map((l) => l.text), ['a', 'b']);
    assert.equal(s[0].name, 'Bo');
    assert.deepEqual(drawerLine({ from: 7, text: 'a', at: 1 }, { me: 7, myName: 'Ada', name: 'Bo' }), { name: 'Ada', text: 'a', mine: true, at: 1, playerId: 0 });
    // RIGHTCLICK: the other player's line carries their id (their name opens their menu).
    assert.deepEqual(drawerLine({ from: 8, text: 'b', at: 2 }, { me: 7, myName: 'Ada', name: 'Bo' }), { name: 'Bo', text: 'b', mine: false, at: 2, playerId: 8 });
  });
});

describe('IMs: wiring', () => {
  it('the feature is listed before street-objects and realtime; it says what it needs from the drawer', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('player-im'));
    assert.ok(ids.indexOf('player-im') < ids.indexOf('street-objects'));
    assert.match(read('public/js/ui/social-drawer.js'), /setUnread\(id, n\)/);
    assert.match(read('public/js/features/buddies-feature.js'), /engine\.query\?\.\('imOpen', b\.id, b\.name, engine\)/);
  });

  it('in solo nothing answers', () => {
    const solo = { mode: 'solo', query: () => null };
    playerImFeature.onTick(16, 0, solo);
    assert.equal(playerImFeature.imReady(solo), null);
    assert.equal(playerImFeature.imOpen(9, 'Bo', solo), null);
    assert.equal(playerImFeature.verbOverride({ classId: 'pc_remote', playerId: 9 }, solo), null);
  });

  it('a meditation breaks on an IM from someone else, unless Tune Out The Chatter (player.js 1851-1858)', async () => {
    const { imInterrupts, chatInterrupts } = await import('../public/js/radiance-mp.js?v=dd99d51f');
    assert.equal(imInterrupts([]), true);
    assert.equal(imInterrupts(['meditative_arts_less_distraction']), false);
    assert.equal(chatInterrupts(['meditative_arts_less_distraction']), true);
    assert.match(read('public/js/features/meditation-feature.js'), /c\.on\('msg:im'/);
  });

  it('the server has the same kinds', { skip: !existsSync(serverPath('im.go')) && 'the server repo with im.go is not beside the game (GRODDLE_SERVER_DIR)' }, () => {
    const go = readFileSync(serverPath('im.go'), 'utf8');
    for (const k of ['"t":"im_send"', '"t":"im_sync"', '"t":"im_read"', '"t":"im_close"', '"t":"im"', '"t":"im_state"', '"t":"im_no"']) assert.ok(go.includes(k), k);
    const src = read('public/js/features/player-im-feature.js');
    for (const k of ["'im_send'", "'im_sync'", "'im_read'", "'im_close'", "'msg:im'", "'msg:im_state'", "'msg:im_no'"]) assert.ok(src.includes(k), k);
  });
});

describe("IMs: a player's page on the site", () => {
  it('"Send them an IM" links the fragment the game reads', { skip: skipWithoutSite || (!readFileSync(sitePath('src/PlayerPages.php'), 'utf8').includes('IM_LABEL') && 'the site has no IM link yet (GRODDLE_SITE_DIR)') }, () => {
    const php = readFileSync(sitePath('src/PlayerPages.php'), 'utf8');
    assert.match(php, /public const IM_LABEL = 'Send them an IM';/); // PlayerInfoDialog.as 172-175
    assert.match(php, /return '\/play\/online\/#im=' \. \$id \. '&name=' \. rawurlencode\(\$name\);/);
    // What rawurlencode makes of a name, read back.
    assert.deepEqual(imLinkFrom(`#im=54&name=${encodeURIComponent('Bo Peep')}`), { id: 54, name: 'Bo Peep' });
    // Only where the buddy button is offered: signed in, someone else's page, no block either way.
    assert.match(php, /data-im-link="' \. \$s\['id'\] \. '"/);
  });
});

describe('IMs: in the Social drawer, against a fake server', () => {
  it('lists, opens, sends, gets, reads, refuses and closes', () => {
    const p = page();
    globalThis.document = p.doc;
    globalThis.CSS ||= { escape: (v) => String(v) };
    globalThis.addEventListener ||= () => {};
    const data = {};
    let drawer = null;
    const notifier = createNotifier({ now: () => 0, clock: () => 0, onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: p.game, dock: p.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, canChat: () => true, streetName: () => 'Hechey Track', setData: (k, v) => { data[k] = v; } });
    const handlers = new Map();
    const sent = [];
    const client = {
      state: 'online',
      me: { id: 7, name: 'Ada' },
      players: [{ id: 11, name: 'Cy' }],
      on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
      emit(type, d) { for (const fn of handlers.get(type) || []) fn(d); },
      send(kind, payload) { sent.push({ t: kind, ...payload }); return true; },
    };
    const sounds = [];
    const counted = [];
    let blocked = new Set();
    let localSaid = 0;
    p.form.addEventListener('submit', () => { localSaid += 1; });
    const engine = {
      mode: 'multiplayer',
      started: true,
      social: drawer,
      query(hook, ...args) {
        if (hook === 'realtimeClient') return client;
        if (hook === 'realtimeHidden') return blocked.has(Number(args[0])) ? true : null;
        if (hook === 'buddyNames') return [{ id: 9, name: 'Bo' }];
        return null;
      },
      targetVerbs: () => [{ id: 'trade', label: 'Trade' }],
      setData(k, v) { data[k] = v; },
      playSound(k) { sounds.push(k); },
      achievement(c) { counted.push(c); },
      toast() {},
    };
    playerImFeature.onTick(16, 1000, engine);
    assert.deepEqual(sent[0], { t: 'im_sync' }, 'asks for the kept conversations');

    // After a reload: the server's history, unread count and all, under Private.
    client.emit('msg:im_state', { t: 'im_state', convs: [{ with: { id: 9, name: 'Bo', online: false }, lines: [{ id: 1, from: 7, text: 'see you', at: 1000 }, { id: 2, from: 9, text: 'back soon', at: 2000 }], unread: 1 }] });
    const list = drawer.chatList();
    const priv = list.find((s) => s.id === 'private');
    assert.deepEqual(priv.rows.map((r) => [r.id, r.label, r.note, r.unread, r.last]), [['im:9', 'Bo', 'Buddy', 1, 'back soon']]);
    assert.equal(drawer.unread('chats'), 1, 'the Chats tab counts it');
    assert.deepEqual(drawer.lines('im:9').map((l) => `${l.mine ? '>' : ''}${l.name}: ${l.text}`), ['>Ada: see you', 'Bo: back soon']);
    assert.ok(counted.includes('talked_to:9'));

    // Opening it reads it: the server is told once.
    drawer.select('im:9');
    playerImFeature.onTick(16, 2000, engine);
    assert.deepEqual(sent.at(-1), { t: 'im_read', with: 9 });
    assert.equal(p.input.placeholder, 'Message Bo');

    // A line typed there is an IM, not Local chat; a slash command stays the game's.
    p.input.value = 'are you there?';
    p.form.dispatch('submit');
    assert.deepEqual(sent.at(-1), { t: 'im_send', to: 9, text: 'are you there?' });
    assert.equal(localSaid, 0, 'Local chat never saw it');
    assert.equal(p.input.value, '');
    p.input.value = '/wave';
    p.form.dispatch('submit');
    assert.equal(localSaid, 1);

    // The server sends it back (as filtered); Bo is offline, so the note says when they get it, once.
    client.emit('msg:im', { t: 'im', with: { id: 9, name: 'Bo', online: false }, line: { id: 3, from: 7, text: 'are you there?', at: 3000 }, unread: 0 });
    client.emit('msg:im', { t: 'im', with: { id: 9, name: 'Bo', online: false }, line: { id: 4, from: 7, text: 'ok #!@$', at: 3100 }, unread: 0 });
    const shown = drawer.lines('im:9').map((l) => (l.note ? `(${l.text})` : `${l.name}: ${l.text}`));
    assert.deepEqual(shown.slice(-3), ['Ada: are you there?', "(Bo is offline: they'll get it when they're back.)", 'Ada: ok #!@$']);

    // A new player IMs: a new conversation (INCOMING_CHAT_NEW), noted Player; the next line INCOMING_CHAT.
    drawer.select('local');
    client.emit('msg:im', { t: 'im', with: { id: 11, name: 'Cy', online: true }, line: { id: 1, from: 11, text: 'hi Ada', at: 4000 }, unread: 1 });
    client.emit('msg:im', { t: 'im', with: { id: 11, name: 'Cy', online: true }, line: { id: 2, from: 11, text: 'nice hat', at: 4100 }, unread: 2 });
    assert.deepEqual(sounds, ['INCOMING_CHAT_NEW', 'INCOMING_CHAT']);
    const cy = drawer.chatList().find((s) => s.id === 'private').rows.find((r) => r.id === 'im:11');
    assert.equal(cy.note, 'Player');
    assert.equal(cy.unread, 2);
    assert.match(data.imConvs, /11:2/);

    // A refusal says the source's words in that conversation, with CLICK_FAILURE.
    client.emit('msg:im_no', { t: 'im_no', reason: 'ignoring you', with: 11, message: 'That player is ignoring you.' });
    assert.equal(drawer.lines('im:11').at(-1).text, 'Cy is ignoring you.');
    assert.equal(sounds.at(-1), 'CLICK_FAILURE');

    // The player menu has IM; picking it opens the conversation with the keyboard in it.
    const verbs = playerImFeature.verbOverride({ classId: 'pc_remote', playerId: 12, label: 'Dee' }, engine);
    assert.deepEqual(verbs.map((v) => v.id), ['trade', IM_VERB_ID]);
    assert.equal(playerImFeature.runVerbOverride({ classId: 'pc_remote', playerId: 12, label: 'Dee' }, IM_VERB_ID), true);
    assert.equal(drawer.chat, 'im:12');
    assert.equal(drawer.label('im:12'), 'Dee');
    assert.equal(p.doc.activeElement, p.input);
    // The Buddies rows' IM opens the same way.
    assert.equal(playerImFeature.imReady(engine), true);
    assert.equal(playerImFeature.imOpen(9, 'Bo', engine), true);
    assert.equal(drawer.chat, 'im:9');

    // Blocked: no IM on their menu, their lines are dropped and their conversation goes.
    blocked = new Set([11]);
    assert.equal(playerImFeature.verbOverride({ classId: 'pc_remote', playerId: 11, label: 'Cy' }, engine), null);
    client.emit('msg:im', { t: 'im', with: { id: 11, name: 'Cy', online: true }, line: { id: 3, from: 11, text: 'hello??', at: 5000 }, unread: 3 });
    playerImFeature.onTick(16, 3000, engine);
    assert.equal(drawer.has('im:11'), false);
    // Opening one anyway (a player's page's IM link, a name in an old line): the source's refusal, no conversation.
    const toasts = [];
    engine.toast = (x) => toasts.push(x);
    assert.equal(playerImFeature.imOpen(11, 'Cy', engine), true);
    assert.deepEqual(toasts, ['Cy is on your ignore list.']);
    assert.equal(drawer.has('im:11'), false);
    assert.equal(sounds.at(-1), 'CLICK_FAILURE');
    assert.equal(data.imLast, 'no:on your ignore list');

    // Close: the server is told, and it leaves the list.
    p.dock.querySelector('[data-im-close="9"]').click();
    assert.deepEqual(sent.at(-1), { t: 'im_close', with: 9 });
    assert.equal(drawer.has('im:9'), false);

    // A player's page on the site: "Send them an IM" links /play/online/#im=<id>&name=<name>; it opens once.
    const replaced = [];
    globalThis.location = { hash: '#im=13&name=Eve', pathname: '/play/online/', search: '' };
    globalThis.history = { state: null, replaceState: (st, t, url) => { replaced.push(url); globalThis.location.hash = ''; } };
    playerImFeature.onTick(16, 9000, engine);
    assert.equal(drawer.chat, 'im:13');
    assert.equal(drawer.label('im:13'), 'Eve');
    assert.deepEqual(replaced, ['/play/online/']);
    delete globalThis.location;
    delete globalThis.history;
  });
});
