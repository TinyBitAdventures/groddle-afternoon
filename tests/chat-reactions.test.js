/**
 * Reactions on chat lines (Austin 2026-11-04: "Another enhancement for chat, can we add emoji
 * responses?"): the rules and words (js/chat-reactions.js), the drawer's add button, picker and chips
 * (js/ui/reaction-strip.js in js/ui/social-drawer.js) drawn in place so a selection survives, the
 * feature that talks to the server (features/chat-reactions-feature.js), the line ids every chat surface
 * passes on, both skins' styles, and the server's set matching the game's.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REACTIONS,
  addLabel,
  chipLabel,
  chipTip,
  imKey,
  lineKey,
  normalReactions,
  parseKey,
  pickerMove,
  reactFrame,
  sameWords,
  whoText,
} from '../public/js/chat-reactions.js?v=d65d555b';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=eac982f5';
import { createNotifier } from '../public/js/notify.js?v=37c6b748';
import { chatReactionsFeature } from '../public/js/features/chat-reactions-feature.js?v=96309267';
import { drawerLine, normalLine } from '../public/js/player-im.js?v=23463a96';
import { chatLine } from '../public/js/groups.js?v=c9635d96';
import { FakeEl, FakeText, memoryStore, page } from './social-fake-dom.js';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('reactions: the rules and the words', () => {
  it('a small fixed set: six emoji as text and Tiny Speck\'s Hi sign', () => {
    assert.deepEqual(REACTIONS.map((r) => r.key), ['like', 'heart', 'laugh', 'wow', 'sad', 'tada', 'hi']);
    assert.deepEqual(REACTIONS.filter((r) => r.glyph).map((r) => r.glyph), ['👍', '❤️', '😂', '😮', '😢', '🎉']);
    const hi = REACTIONS.find((r) => r.key === 'hi');
    assert.equal(hi.glyph, '');
    assert.match(hi.art, /^assets\/sprites\/hi-signs\/hi_hi_1@3x\.webp$/);
    assert.ok(Object.isFrozen(REACTIONS) && REACTIONS.every((r) => Object.isFrozen(r)));
  });

  it('keys address a line by its id, an IM line by the other player and its id', () => {
    assert.equal(lineKey(1700000000123), 'l:1700000000123');
    assert.equal(lineKey(0), '');
    assert.equal(lineKey(undefined), '');
    assert.equal(imKey(9, 12), 'im:9:12');
    assert.equal(imKey(0, 12), '');
    assert.deepEqual(parseKey('l:42'), { kind: 'line', line: 42 });
    assert.deepEqual(parseKey('im:9:12'), { kind: 'im', with: 9, line: 12 });
    for (const bad of ['', 'l:', 'l:x', 'im:9', 'party:1', 'l:-1', null]) assert.equal(parseKey(bad), null, String(bad));
    assert.deepEqual(reactFrame('l:42', 'heart', true), { t: 'react', payload: { line: 42, e: 'heart', on: true } });
    assert.deepEqual(reactFrame('im:9:12', 'hi', false), { t: 'im_react', payload: { with: 9, line: 12, e: 'hi', on: false } });
    assert.equal(reactFrame('l:42', 'shrug', true), null, 'only the set');
    assert.equal(reactFrame('nope', 'like', true), null);
  });

  it('a server\'s reactions come in the set\'s order, each player once, without anyone you block', () => {
    const raw = [
      { e: 'hi', by: [{ id: 3, name: 'Cy' }] },
      { e: 'shrug', by: [{ id: 2, name: 'Bo' }] },
      { e: 'like', by: [{ id: 2, name: 'Bo' }, { id: 2, name: 'Bo' }, { id: 5, name: 'Ed' }, { id: 0, name: 'x' }] },
      { e: 'sad', by: [{ id: 5, name: 'Ed' }] },
    ];
    const got = normalReactions(raw, { hidden: (id) => id === 5 });
    assert.deepEqual(got, [{ key: 'like', by: [{ id: 2, name: 'Bo' }] }, { key: 'hi', by: [{ id: 3, name: 'Cy' }] }]);
    assert.deepEqual(normalReactions(null), []);
    assert.deepEqual(normalReactions([{ e: 'like', by: 'x' }]), []);
  });

  it('labels read as the brief asks: "👍 2, you and mr granberry"', () => {
    const chip = { key: 'like', by: [{ id: 7, name: 'Ada' }, { id: 54, name: 'mr granberry' }] };
    assert.equal(chipLabel(chip, 7), '👍 2, you and mr granberry');
    assert.equal(chipLabel(chip, 99), '👍 2, Ada and mr granberry');
    assert.equal(chipTip(chip, 7), 'Thumbs up: You and mr granberry');
    assert.equal(chipLabel({ key: 'hi', by: [{ id: 3, name: 'Cy' }] }, 7), 'Hi 1, Cy');
    assert.equal(whoText([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], 0), 'A, B and C');
    const many = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));
    assert.equal(whoText(many, 0), 'P1, P2, P3, P4, P5, P6, P7 and 5 others');
    assert.equal(addLabel({ name: 'mr granberry' }), "React to mr granberry's message");
    assert.equal(addLabel({ mine: true, name: 'Ada' }), 'React to your message');
    assert.equal(addLabel({}), 'React to this message');
  });

  it('the picker\'s keys wrap; other keys do not move it', () => {
    assert.equal(pickerMove(0, 'ArrowRight'), 1);
    assert.equal(pickerMove(6, 'ArrowRight'), 0);
    assert.equal(pickerMove(0, 'ArrowLeft'), 6);
    assert.equal(pickerMove(3, 'ArrowDown'), 4);
    assert.equal(pickerMove(3, 'ArrowUp'), 2);
    assert.equal(pickerMove(4, 'Home'), 0);
    assert.equal(pickerMove(1, 'End'), 6);
    assert.equal(pickerMove(1, 'a'), -1);
    assert.equal(sameWords(' hi  there ', 'hi there'), true);
    assert.equal(sameWords('hi', 'ho'), false);
  });
});

describe('reactions: the line ids every chat surface passes on', () => {
  it('groups, IMs, party and Local keep the server\'s ids', () => {
    assert.equal(chatLine({ id: 7, name: 'Ada', text: 'hi', at: 1, lid: 42 }).lid, 42);
    assert.equal(chatLine({ id: 7, name: 'Ada', text: 'hi', at: 1 }).lid, 0, 'an old server: none');
    const l = normalLine({ id: 12, from: 9, text: 'psst', at: 1, r: [{ e: 'like', by: [] }] });
    assert.deepEqual(l.r, [{ e: 'like', by: [] }]);
    assert.equal(drawerLine(l, { me: 7, name: 'Bo', withId: 9 }).rk, 'im:9:12');
    assert.equal(drawerLine({ id: 13, from: 7, text: 'back', at: 2 }, { me: 7, name: 'Bo', withId: 9 }).rk, 'im:9:13', 'your own line too');
    assert.match(read('public/js/features/groups-feature.js'), /rk: reactKey\(line\.lid\)/);
    assert.match(read('public/js/features/party-feature.js'), /rk: lineKey\(msg\.lid\)/);
    assert.match(read('public/js/features/realtime-feature.js'), /rk: lineKey\(lid\)/);
    assert.match(read('public/js/realtime-client.js'), /lid: Math\.max\(0, Math\.floor\(Number\(msg\.lid\)\) \|\| 0\)/);
    assert.match(read('public/js/features/player-im-feature.js'), /withId: c\.id/);
    const game = read('public/game.js');
    assert.match(game, /socialDrawer\.localLine\(participant, message, \{ feat, mine, playerId, rk \}\)/);
  });

  it('speech bubbles over avatars carry no reactions', () => {
    const game = read('public/game.js');
    const bubble = game.slice(game.indexOf('function showSpeechBubble('), game.indexOf('function showSpeechBubble(') + 4000);
    assert.doesNotMatch(bubble, /react/i);
    assert.doesNotMatch(read('public/js/speech-placement.js'), /react/i);
  });

  it('the feature is a multiplayer one, listed before street-objects', () => {
    const idx = read('public/js/features/index.js');
    const at = idx.indexOf('chatReactionsFeature');
    assert.ok(at > 0 && at < idx.indexOf('streetObjectsFeature'));
    assert.match(read('public/js/features/chat-reactions-feature.js'), /engine\?\.mode !== 'multiplayer'/);
  });
});

/** The drawer, online, in the fake DOM. */
function drawerRig() {
  const t = page();
  globalThis.document = t.doc;
  globalThis.addEventListener = () => {};
  globalThis.CSS = { escape: (s) => s };
  globalThis.requestAnimationFrame = (fn) => fn();
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track', playerMenu: () => true, setData: (k, v) => { t.data = { ...(t.data || {}), [k]: v }; } });
  const sent = [];
  const log = () => t.dock.querySelector('[data-social-log]');
  const rows = () => log().children.filter((c) => c.tagName === 'P');
  return { t, drawer, sent, log, rows };
}

describe('reactions: the Social drawer', () => {
  const saved = {};
  let r;
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial']) saved[k] = globalThis[k];
    r = drawerRig();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('solo has none; online, lines get a button only once a sender is connected, and only lines with a key', () => {
    const solo = page();
    const s = mountSocialDrawer({ root: solo.game, dock: solo.dock, notifier: createNotifier({}), mode: 'solo', storage: memoryStore(), width: () => 1920 });
    assert.equal(s.reactions, null);
    globalThis.document = r.t.doc;
    r.drawer.select('local');
    const at = Date.now();
    r.drawer.push('local', { name: 'mr granberry', text: 'can we add emoji responses?', playerId: 54, at, rk: 'l:100' });
    r.drawer.push('local', { note: true, text: 'Bo is here.', rk: 'l:999' });
    r.drawer.push('local', { name: 'Fi', text: 'no id from an old server', playerId: 9, at: at + 1 });
    assert.equal(r.log().querySelectorAll('[data-react-add]').length, 0, 'no sender yet');
    r.drawer.reactions.connect({ me: () => 7, send: (rk, key, on) => { r.sent.push([rk, key, on]); return true; } });
    const adds = r.log().querySelectorAll('[data-react-add]');
    assert.equal(adds.length, 1, 'the note and the line without an id have none');
    assert.equal(adds[0].getAttribute('aria-label'), "React to mr granberry's message");
    assert.equal(adds[0].getAttribute('aria-haspopup'), 'menu');
    assert.equal(adds[0].tagName, 'BUTTON');
  });

  it('reactions change in place: the same row and the same words, so a selection stays', () => {
    const row = r.rows()[0];
    const words = row.children.filter((c) => c instanceof FakeText);
    r.drawer.reactions.set('l:100', [{ key: 'like', by: [{ id: 7, name: 'Ada' }, { id: 54, name: 'mr granberry' }] }]);
    assert.equal(r.rows()[0], row, 'the same row node');
    assert.deepEqual(row.children.filter((c) => c instanceof FakeText), words, 'the same text nodes');
    const strip = row.querySelector('[data-react-strip]');
    assert.equal(strip.hidden, false);
    const chip = strip.querySelector('[data-react-chip="like"]');
    assert.equal(chip.getAttribute('aria-label'), '👍 2, you and mr granberry');
    assert.equal(chip.getAttribute('aria-pressed'), 'true');
    assert.equal(chip.textContent, '👍2');
    assert.ok(chip.classList.contains('is-mine'));
    // A count changes: the chip stays the same node (the keyboard stays on it).
    r.drawer.reactions.set('l:100', [{ key: 'like', by: [{ id: 54, name: 'mr granberry' }] }, { key: 'hi', by: [{ id: 9, name: 'Fi' }] }]);
    assert.equal(strip.querySelector('[data-react-chip="like"]'), chip);
    assert.equal(chip.getAttribute('aria-label'), '👍 1, mr granberry');
    assert.equal(chip.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(strip.children.map((c) => c.getAttribute('data-react-chip')), ['like', 'hi']);
    assert.ok(strip.querySelector('[data-react-chip="hi"]').querySelector('.react-glyph-hi'), 'the Hi sign is art');
    // Other redraws keep the row and its chips.
    r.drawer.refresh();
    r.drawer.push('local', { name: 'Fi', text: 'later', playerId: 9, at: Date.now() + 5 });
    assert.equal(r.rows()[0], row);
    assert.equal(row.querySelector('[data-react-chip="like"]'), chip);
    // None left: the strip hides.
    r.drawer.reactions.set('l:100', []);
    assert.equal(strip.hidden, true);
    assert.equal(strip.children.length, 0);
  });

  it('hovering a chip says who; the tip goes when its chip does', () => {
    r.drawer.reactions.set('l:100', [{ key: 'like', by: [{ id: 54, name: 'mr granberry' }, { id: 7, name: 'Ada' }] }]);
    const chip = r.rows()[0].querySelector('[data-react-chip="like"]');
    chip.dispatch('pointerenter');
    const tip = r.t.game.querySelector('[data-react-tip]');
    assert.equal(tip.hidden, false);
    assert.equal(tip.textContent, 'Thumbs up: You and mr granberry');
    assert.equal(tip.getAttribute('aria-hidden'), 'true', 'the chip\'s own name says it for the keys');
    r.drawer.reactions.set('l:100', [{ key: 'like', by: [{ id: 54, name: 'mr granberry' }] }]);
    assert.equal(tip.textContent, 'Thumbs up: mr granberry', 'kept up to date while it shows');
    r.drawer.reactions.set('l:100', []);
    assert.equal(tip.hidden, true, 'its chip went');
    chip.dispatch('focus');
    chip.dispatch('blur');
    assert.equal(tip.hidden, true);
  });

  it('a chip toggles yours: off when it is yours, on when it is not', () => {
    r.sent.length = 0;
    r.drawer.reactions.set('l:100', [{ key: 'heart', by: [{ id: 7, name: 'Ada' }] }, { key: 'wow', by: [{ id: 54, name: 'mr granberry' }] }]);
    const row = r.rows()[0];
    row.querySelector('[data-react-chip="heart"]').click();
    row.querySelector('[data-react-chip="wow"]').click();
    assert.deepEqual(r.sent, [['l:100', 'heart', false], ['l:100', 'wow', true]]);
  });

  it('the picker: opens from the keys on its first pick, arrows move, Escape closes and gives the keys back', () => {
    r.sent.length = 0;
    const row = r.rows()[0];
    const add = row.querySelector('[data-react-add]');
    add.dispatch('click', { detail: 0 });
    const picker = r.t.game.querySelector('[data-react-picker]');
    assert.ok(picker, 'the picker is up');
    assert.equal(picker.getAttribute('role'), 'menu');
    assert.equal(picker.getAttribute('aria-label'), 'Reactions');
    assert.equal(add.getAttribute('aria-expanded'), 'true');
    const items = picker.querySelectorAll('[data-react-pick]');
    assert.deepEqual(items.map((b) => b.getAttribute('data-react-pick')), REACTIONS.map((x) => x.key));
    assert.deepEqual(items.map((b) => b.getAttribute('aria-label')), REACTIONS.map((x) => x.label));
    assert.ok(items.every((b) => b.getAttribute('role') === 'menuitemcheckbox'));
    assert.equal(items.find((b) => b.getAttribute('data-react-pick') === 'heart').getAttribute('aria-checked'), 'true', 'yours is checked');
    assert.equal(globalThis.document.activeElement, items[0]);
    const key = (k) => globalThis.document.activeElement.dispatch('keydown', { key: k });
    const down = key('ArrowRight');
    assert.equal(down.stopped, true, 'the picker\'s keys never walk the avatar');
    assert.equal(globalThis.document.activeElement, items[1]);
    key('ArrowLeft');
    key('ArrowLeft');
    assert.equal(globalThis.document.activeElement, items[6], 'wraps');
    assert.equal(items[6].getAttribute('tabindex'), '0');
    assert.equal(items[0].getAttribute('tabindex'), '-1');
    key('Escape');
    assert.equal(r.t.game.querySelector('[data-react-picker]'), null, 'closed');
    assert.equal(add.getAttribute('aria-expanded'), null);
    assert.equal(globalThis.document.activeElement, add, 'the keys go back to the button');
    assert.deepEqual(r.sent, []);
    // A pick (Enter on a button is its click) sends it and closes.
    add.dispatch('click', { detail: 0 });
    key('ArrowRight');
    key('ArrowRight');
    globalThis.document.activeElement.dispatch('click', { detail: 0 });
    assert.deepEqual(r.sent, [['l:100', 'laugh', true]]);
    assert.equal(r.t.game.querySelector('[data-react-picker]'), null);
    assert.equal(globalThis.document.activeElement, add);
    // Picking one that is yours takes it off.
    add.dispatch('click', { detail: 0 });
    r.t.game.querySelector('[data-react-pick="heart"]').dispatch('click', { detail: 1 });
    assert.deepEqual(r.sent.at(-1), ['l:100', 'heart', false]);
  });

  it('the picker stays inside the line\'s column, over the line', () => {
    const row = r.rows()[0];
    const add = row.querySelector('[data-react-add]');
    row.rect = { left: 1200, right: 1480, top: 300, bottom: 340, width: 280, height: 40 };
    add.rect = { left: 1270, right: 1290, top: 300, bottom: 318, width: 20, height: 18 };
    add.dispatch('click', { detail: 1 });
    const picker = r.t.game.querySelector('[data-react-picker]');
    assert.equal(picker.style.left, '1200px', 'not past the column\'s left edge (over the world)');
    assert.equal(picker.style.top, '256px', 'above the button');
    r.drawer.reactions.closePicker();
    add.rect = { left: 1450, right: 1470, top: 20, bottom: 38, width: 20, height: 18 };
    add.dispatch('click', { detail: 1 });
    assert.equal(r.t.game.querySelector('[data-react-picker]').style.left, `${1470 - 7 * 34}px`);
    assert.equal(r.t.game.querySelector('[data-react-picker]').style.top, '42px', 'under it at the top');
    r.drawer.reactions.closePicker();
    row.rect = add.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  });

  it('the picker closes on a click elsewhere, a tab change and a collapse', () => {
    const add = r.rows()[0].querySelector('[data-react-add]');
    add.dispatch('click', { detail: 1 });
    assert.ok(r.drawer.reactions.pickerOpen);
    for (const fn of r.t.doc.listeners.pointerdown || []) fn({ target: r.t.game });
    assert.equal(r.drawer.reactions.pickerOpen, '');
    add.dispatch('click', { detail: 1 });
    r.drawer.select('activity');
    assert.equal(r.drawer.reactions.pickerOpen, '');
    r.drawer.select('local');
    add.dispatch('click', { detail: 1 });
    r.drawer.close();
    assert.equal(r.drawer.reactions.pickerOpen, '');
    r.drawer.open();
  });

  it('your own Local line takes its id when the server says it back', () => {
    r.drawer.push('local', { name: 'Ada', text: 'oh  #!@$ yes', mine: true });
    r.drawer.push('local', { name: 'Ada', text: 'again', mine: true });
    const before = r.rows();
    assert.equal(r.drawer.claimLine('local', 'oh #!@$ yes', 'l:200'), true);
    assert.equal(r.drawer.claimLine('local', 'oh #!@$ yes', 'l:200'), false, 'once');
    assert.equal(r.drawer.claimLine('local', 'never said', 'l:201'), false);
    assert.deepEqual(r.rows(), before, 'the same rows');
    const mine = r.rows().find((p) => p.querySelector('[data-react-add="l:200"]'));
    assert.ok(mine, 'its button is there now');
    assert.equal(mine.querySelector('[data-react-add]').getAttribute('aria-label'), 'React to your message');
    assert.equal(r.drawer.lines('local').find((l) => l.rk === 'l:200').text, 'oh  #!@$ yes');
  });

  it('a line in two panes (Classic\'s Local Chat / Activity) updates in both', () => {
    const a = r.drawer.logNodes(['local', 'activity'], { cache: 'classic-lower' }).find((n) => n.querySelector?.('[data-react-add="l:100"]'));
    const b = r.rows()[0];
    assert.ok(a && a !== b);
    r.drawer.reactions.set('l:100', [{ key: 'sad', by: [{ id: 9, name: 'Fi' }] }]);
    for (const row of [a, b]) assert.equal(row.querySelector('[data-react-chip="sad"]').getAttribute('aria-label'), '😢 1, Fi');
  });

  it('a row drawn again from the cache shows what changed while it was away', () => {
    r.drawer.select('activity');
    r.drawer.reactions.set('l:100', [{ key: 'tada', by: [{ id: 9, name: 'Fi' }, { id: 7, name: 'Ada' }] }]);
    r.drawer.select('local');
    const chip = r.rows()[0].querySelector('[data-react-chip="tada"]');
    assert.equal(chip.getAttribute('aria-label'), '🎉 2, you and Fi');
  });

  it('turning the sender off takes no rows away but adds no new buttons', () => {
    r.drawer.reactions.connect(null);
    r.drawer.push('local', { name: 'Fi', text: 'after', playerId: 9, rk: 'l:300', at: Date.now() + 9 });
    assert.equal(r.log().querySelector('[data-react-add="l:300"]'), null);
  });
});

describe('reactions: the feature and the socket', () => {
  const saved = {};
  let r;
  let client;
  let engine;
  let toasts;
  before(() => {
    for (const k of ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleReactions']) saved[k] = globalThis[k];
    r = drawerRig();
    const on = new Map();
    client = {
      state: 'online',
      me: { id: 7, name: 'Ada' },
      frames: [],
      on(type, fn) { if (!on.has(type)) on.set(type, []); on.get(type).push(fn); },
      emit(type, msg) { for (const fn of on.get(type) || []) fn(msg); },
      send(kind, payload) { if (this.state !== 'online') return false; this.frames.push({ t: kind, ...payload }); return true; },
    };
    toasts = [];
    engine = {
      mode: 'multiplayer',
      started: true,
      social: r.drawer,
      query: (name, id) => (name === 'realtimeClient' ? client : name === 'realtimeHidden' ? id === 66 : null),
      toast: (text) => toasts.push(text),
      setData: () => {},
    };
    chatReactionsFeature.onTick(16, 0, engine);
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('a pick goes to the server as react or im_react', () => {
    r.drawer.select('local');
    r.drawer.push('local', { name: 'Bo', text: 'hello', playerId: 9, rk: 'l:500' });
    r.rows().at(-1).querySelector('[data-react-add]').dispatch('click', { detail: 1 });
    r.t.game.querySelector('[data-react-pick="like"]').click();
    assert.deepEqual(client.frames.at(-1), { t: 'react', line: 500, e: 'like', on: true });
    r.drawer.channel('im:9', { label: 'Bo', section: 'private' });
    r.drawer.select('im:9');
    r.drawer.push('im:9', { name: 'Bo', text: 'psst', playerId: 9, rk: 'im:9:12' });
    r.rows().at(-1).querySelector('[data-react-add]').dispatch('click', { detail: 1 });
    r.t.game.querySelector('[data-react-pick="hi"]').click();
    assert.deepEqual(client.frames.at(-1), { t: 'im_react', with: 9, line: 12, e: 'hi', on: true });
    // Offline: nothing goes, the player is told.
    client.state = 'connecting';
    r.rows().at(-1).querySelector('[data-react-add]').dispatch('click', { detail: 1 });
    r.t.game.querySelector('[data-react-pick="sad"]').click();
    assert.equal(client.frames.length, 2);
    assert.match(toasts.at(-1), /online/);
    client.state = 'online';
  });

  it('what the server says lands on the lines, without players you block', () => {
    client.emit('msg:reacted', { t: 'reacted', line: 500, r: [{ e: 'like', by: [{ id: 7, name: 'Ada' }, { id: 66, name: 'Blocked' }] }] });
    assert.deepEqual(r.drawer.reactions.get('l:500'), [{ key: 'like', by: [{ id: 7, name: 'Ada' }] }]);
    client.emit('msg:im_reacted', { t: 'im_reacted', with: 9, line: 12, r: [{ e: 'hi', by: [{ id: 9, name: 'Bo' }] }] });
    assert.equal(r.rows().at(-1).querySelector('[data-react-chip="hi"]').getAttribute('aria-label'), 'Hi 1, Bo');
    // A channel's history, the IMs kept for you, a new IM line with reactions.
    client.emit('msg:channel_joined', { channel: 'global', history: [{ id: 9, name: 'Bo', text: 'a', at: 1, lid: 600, r: [{ e: 'wow', by: [{ id: 9, name: 'Bo' }] }] }, { id: 9, name: 'Bo', text: 'b', at: 2, lid: 601 }] });
    assert.deepEqual(r.drawer.reactions.get('l:600').map((c) => c.key), ['wow']);
    assert.deepEqual(r.drawer.reactions.get('l:601'), []);
    client.emit('msg:im_state', { convs: [{ with: { id: 11, name: 'Cy' }, lines: [{ id: 3, from: 11, text: 'x', at: 1, r: [{ e: 'heart', by: [{ id: 7, name: 'Ada' }] }] }] }] });
    assert.deepEqual(r.drawer.reactions.get('im:11:3'), [{ key: 'heart', by: [{ id: 7, name: 'Ada' }] }]);
    client.emit('msg:im', { with: { id: 11 }, line: { id: 4, from: 11, text: 'y', at: 2, r: [{ e: 'sad', by: [{ id: 11, name: 'Cy' }] }] } });
    assert.deepEqual(r.drawer.reactions.get('im:11:4').map((c) => c.key), ['sad']);
  });

  it('your own Local line said back with its id is claimed; a refusal is a toast', () => {
    r.drawer.select('local');
    r.drawer.push('local', { name: 'Ada', text: 'mine', mine: true });
    client.emit('said', { id: 7, name: 'Ada', text: 'mine', mine: true, lid: 700 });
    assert.equal(r.drawer.lines('local').at(-1).rk, 'l:700');
    client.emit('error', { code: 'react', message: 'That line is too old to react to now.' });
    assert.equal(toasts.at(-1), 'That line is too old to react to now.');
  });
});

describe('reactions: both skins\' styles', () => {
  it('Modern takes its colours and sizes from the tokens, the chips and buttons are not text to copy', () => {
    const css = read('public/style.css');
    for (const sel of ['.react-add {', '.react-chip {', '.react-picker {', '.react-pick {', '.react-tip {', '.react-glyph-hi {']) assert.ok(css.includes(sel), sel);
    assert.match(css, /\.react-chip\.is-mine \{ border-color: var\(--accent\); background: var\(--accent-soft\)/);
    assert.match(css, /\.react-add, \.react-strip, \.react-pick \{ -webkit-user-select: none; user-select: none; \}/);
    assert.match(css, /\.social-msg\.can-react:focus-within > \.react-add/, 'the button shows when the line has the keyboard');
    assert.match(css, /hi_hi_1@3x\.webp/);
  });

  it('Classic restyles them under its root only, in the client\'s chat dress', () => {
    const css = read('public/css/classic.css');
    const rules = [...css.matchAll(/([^{}]*\.react-[a-z-]+[^{}]*)\{/g)].map((m) => m[1].trim().split('\n').at(-1));
    assert.ok(rules.length >= 10, `${rules.length} rules`);
    for (const r of rules) for (const one of r.replace(/:is\([^)]*\)/g, ':is()').split(',')) assert.match(one.trim(), /^:root\[data-ui="classic"\]/, one);
    assert.match(css, /\.react-chip\.is-mine \{[^}]*var\(--c-classic-input-hi\)/);
    assert.match(css, /\.react-tip \{[^}]*var\(--c-classic-tip\)/s);
  });
});

describe('reactions: the server takes the same set', { skip: skipWithoutServer }, () => {
  it('reactions.go reactionKeys are the game\'s keys, in order', () => {
    const go = readFileSync(serverPath('reactions.go'), 'utf8');
    const m = /var reactionKeys = \[\]string\{([^}]*)\}/.exec(go);
    assert.ok(m, 'reactionKeys');
    assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/"/g, '')), REACTIONS.map((r) => r.key));
  });
});
