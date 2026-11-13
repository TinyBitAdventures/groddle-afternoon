/**
 * G366, the Local chat typing mark (main.js doLocalChatStart 1677-1694), and
 * G367, the Butler's IMs between real players (butler_data.js doFarCommand,
 * notifyOwner; bag_butler.js onPlayerEnter, sendIM): the game's half. The
 * server's half is groddle-afternoon-server hub.go "typing" and butler_im.go
 * (their Go tests).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRealtimeClient, CORE_KINDS } from '../public/js/realtime-client.js?v=cda54c6e';
import { TYPING_EVERY_MS, TYPING_MS, typingCounts, typingDotAlpha } from '../public/js/features/realtime-feature.js?v=df069959';
import { BUTLER_IM_TEXT, BUTLER_IM_VERBS, HELP_AGAIN_MS, commandHelp, imDelayMs, imLine, imText, normalizeImPrefs, parseButlerIm } from '../public/js/butler-im.js?v=44783638';
import { butlerImFeature, BUTLER_TAB } from '../public/js/features/butler-im-feature.js?v=9a024926';
import { slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=6ac029f5';
import { FEATURES } from '../public/js/features/index.js?v=4497c7cd';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

function fakeSocketClient() {
  const made = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; made.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  }
  const client = createRealtimeClient({ ticket: async () => ({ ticket: 't', path: '/ws' }), baseUri: 'https://groddle.localhost/play/online/', WebSocket: FakeSocket, setTimeout: () => 0, clearTimeout: () => {}, now: () => 1000, random: () => 0.5 });
  return { client, last: () => made.at(-1) };
}

describe('G366 typing mark: the client', () => {
  it('typing is a core frame with no text, sent only on a street', async () => {
    assert.ok(CORE_KINDS.has('typing'), 'send() refuses it: typing() is the way');
    const { client, last } = fakeSocketClient();
    const seen = [];
    client.on('typing', (d) => seen.push(d.id));
    client.start();
    await flush();
    const ws = last();
    ws.open();
    ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(client.typing(), false, 'no street');
    assert.equal(client.send('typing'), false);
    client.join({ street: 'S1' });
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    assert.equal(client.typing(), true);
    assert.deepEqual(ws.sent.at(-1), { t: 'typing' });
    ws.receive({ t: 'typing', id: 8 });
    ws.receive({ t: 'typing', id: 99 });
    assert.deepEqual(seen, [8], 'only a player on the street');
  });

  it('a line counts when it is no command and Local is in front', () => {
    assert.equal(typingCounts('h'), true);
    assert.equal(typingCounts('   '), false);
    assert.equal(typingCounts('/p hi'), false, 'ChatArea.as:534: a slash command is no line');
    assert.equal(typingCounts('hi', false), false, 'a party, group or Butler chat is not the street');
  });

  it('the source numbers: 5 s, once a line, 4 s apart; the dots light in turn', () => {
    assert.equal(TYPING_MS, 5000); // main.js:1682 duration
    assert.equal(TYPING_EVERY_MS, 4000); // ChatArea.as:65 ACTIVITY_TIMER
    const lit = (t) => [0, 1, 2].filter((i) => typingDotAlpha(i, t) === 1);
    assert.deepEqual(lit(0), [0]);
    assert.deepEqual(lit(230), [1]);
    assert.deepEqual(lit(450), [2]);
  });

  it('the feature sends on input, clears on the line, hides the blocked, and asks the chat tab', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /input\?\.addEventListener\('input', onChatInput\)/);
    assert.match(src, /client\.on\('typing'[\s\S]{0,80}realtimeHidden/);
    assert.match(src, /r\.typingUntil = 0/);
    assert.match(src, /social\.tab === 'local'/);
    assert.match(read('public/js/features/groups-feature.js'), /chatTab\(\) \{\s*return session \? session\.tab : null;/);
  });
});

describe('G367 the Butler IM: commands and copy', () => {
  it('parses the far commands as doFarCommand does', () => {
    assert.deepEqual(parseButlerIm('announce Back in five'), { kind: 'announce', text: 'Back in five' });
    assert.deepEqual(parseButlerIm('a hi'), { kind: 'announce', text: 'hi' });
    assert.deepEqual(parseButlerIm('tell them the door is open'), { kind: 'tell', text: 'the door is open' });
    assert.deepEqual(parseButlerIm('t hi'), { kind: 'tell', text: 'hi' });
    assert.deepEqual(parseButlerIm('who'), { kind: 'who' });
    assert.deepEqual(parseButlerIm('w?'), { kind: 'who' });
    assert.equal(parseButlerIm('q').kind, 'quit');
    assert.equal(parseButlerIm('quit').text, BUTLER_IM_TEXT.notificationsOff);
    assert.equal(parseButlerIm('r').kind, 'resume');
    assert.equal(parseButlerIm('a').text, BUTLER_IM_TEXT.farCommandTellNoMessage);
    assert.equal(parseButlerIm('tell').text, BUTLER_IM_TEXT.farCommandTellNoMessage);
    assert.equal(parseButlerIm('help').kind, 'help');
    assert.equal(parseButlerIm('?').text, BUTLER_IM_TEXT.helpIntro + BUTLER_IM_TEXT.helpOptions);
    assert.equal(parseButlerIm('help announce').text, BUTLER_IM_TEXT.helpAnnounce);
    assert.equal(parseButlerIm('who', { afterHelp: true }).text, BUTLER_IM_TEXT.helpWho, 'after help, a command is a topic');
    assert.deepEqual(parseButlerIm('announce I need help'), { kind: 'announce', text: 'I need help' }, 'ours: the message wins');
    assert.equal(parseButlerIm('dance').text, BUTLER_IM_TEXT.helpUnknown + BUTLER_IM_TEXT.clickHelpAddition);
    assert.equal(commandHelp('t'), BUTLER_IM_TEXT.helpTellOwner);
  });

  it('the IMs read as butler_strings.js wrote them', () => {
    assert.equal(imText('visitorSpeechReport', { pc: 'Bo', param: 'hi' }), "Bo said 'hi'");
    assert.equal(imLine({ kind: 'visitor', from: { name: 'Bo' } }), 'Bo is on your Home Street.');
    assert.equal(imLine({ kind: 'visitor', from: { name: 'Bo' } }, { helpAgain: true }), "Bo is on your Home Street. You can type 'help' for hints about what I can do!");
    assert.equal(imLine({ kind: 'speech', from: { name: 'Bo' }, text: 'anyone home?' }), "Bo said 'anyone home?'");
    assert.equal(imLine({ kind: 'announced', text: 'Back soon' }), 'Ok, I announced "Back soon".');
    assert.equal(imLine({ kind: 'told', text: "Bo, Ada just told me to say 'hi' to you." }), 'Ok, I said "Bo, Ada just told me to say \'hi\' to you." in local chat.');
    assert.equal(imLine({ kind: 'tell_fail' }), "I'm sorry, there is nobody here any more.");
    assert.equal(imLine({ kind: 'who', names: ['Bo', 'Cy'] }), 'People on your home street right now: Bo, Cy');
    assert.equal(imLine({ kind: 'who', names: [] }), 'There is nobody on your home street right now.');
    assert.equal(imLine({ kind: 'no_butler' }), '');
    assert.equal(HELP_AGAIN_MS, 600_000);
    for (const r of [0, 0.5, 0.999]) assert.ok(imDelayMs(() => r) >= 500 && imDelayMs(() => r) <= 1000);
    assert.deepEqual(normalizeImPrefs(null), { v: 1, notify: true, listen: true });
    assert.deepEqual(normalizeImPrefs({ notify: false }), { v: 1, notify: false, listen: true });
    assert.equal(BUTLER_IM_VERBS.stop.label, 'Stop telling me things visitors say');
  });
});

/** A multiplayer engine with a fake realtime client and drawer. */
function mpEngine() {
  const handlers = new Map();
  const sent = [];
  const client = {
    state: 'online',
    me: { id: 7, name: 'Ada' },
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); },
    emit(type, d) { for (const fn of handlers.get(type) || []) fn(d); },
    send(kind, payload) { sent.push({ t: kind, ...payload }); return true; },
  };
  const tabs = new Map();
  const data = {};
  const chat = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    saves: 0,
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'realtimeHidden') return args[0] === 66 ? true : null;
      if (hook === 'visitorButlerSay') return args[0] === 9 ? 'Jeeves' : null;
      return null;
    },
    setData(k, v) { data[k] = v; },
    save() { engine.saves += 1; },
    chatLine(name, text) { chat.push(`${name}: ${text}`); },
    toast() {},
    pushActivity() {},
    social: {
      tab: 'local',
      channel(id, opts) { if (!tabs.has(id)) tabs.set(id, { opts, lines: [] }); tabs.get(id).opts = opts; return true; },
      push(id, line) { tabs.get(id).lines.push(line); return true; },
      select() {},
      isOpen: () => true,
    },
  };
  return { engine, client, sent, tabs, data, chat };
}

describe('G367 the Butler IM: the feature', () => {
  it('is in the feature list before realtime, and /butler <command> reaches it', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('butler-im') && ids.indexOf('butler-im') < ids.indexOf('realtime'));
    const src = read('public/js/features/slash-commands-feature.js');
    assert.match(src, /engine\.query\?\.\('butlerImCommand', rest, engine\)/);
  });

  it('does nothing in solo and saves nothing', () => {
    butlerImFeature.restore({ notify: false }, { mode: 'solo' });
    assert.equal(butlerImFeature.save(), undefined);
    assert.equal(butlerImFeature.butlerImCommand('a hi', { mode: 'solo', query: () => null }), null);
  });

  it('IMs, commands and the Butler on the street, end to end against a fake server', async (t) => {
    // G525: the test's own clock for both, and the longest delay every time. The delays are random, 500 to
    // 1000 ms, and a second IM comes 1 ms after the first: a 1000 ms roll (1 in 501) put it at 1001, past the
    // tick(1000) this used to take on the real clock, and one Jeeves line was missing.
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    t.mock.method(Math, 'random', () => 0.999);
    const { butlerApi } = await import('../public/js/features/butler-feature.js?v=ec590369');
    t.mock.method(butlerApi, 'owned', () => true);
    t.mock.method(butlerApi, 'label', () => 'Jeeves');
    const streetSaid = [];
    t.mock.method(butlerApi, 'streetSay', (eng, text) => { streetSaid.push(text); return true; });
    const { engine, client, sent, tabs, chat } = mpEngine();
    butlerImFeature.restore(undefined, engine);
    butlerImFeature.onTick(16, 0, engine);
    assert.deepEqual(sent[0], { t: 'butler_watch', on: true, notify: true, listen: true });

    // The server's IMs come into the Butler's chat 0.5 to 1 s later.
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'visitor', from: { id: 9, name: 'Bo' } });
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'speech', from: { id: 9, name: 'Bo' }, text: 'anyone home?' });
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'speech', from: { id: 66, name: 'Blocked' }, text: 'x' });
    const lines = () => (tabs.get(BUTLER_TAB)?.lines || []).map((l) => `${l.mine ? '>' : ''}${l.name}: ${l.text}`);
    t.mock.timers.tick(999);
    assert.deepEqual(lines(), [], 'not before the delay');
    t.mock.timers.tick(1);
    assert.deepEqual(lines(), ["Jeeves: Bo is on your Home Street. You can type 'help' for hints about what I can do!"], 'the first at the 1 s it rolled');
    t.mock.timers.tick(1);
    assert.deepEqual(lines(), ["Jeeves: Bo is on your Home Street. You can type 'help' for hints about what I can do!", "Jeeves: Bo said 'anyone home?'"]);
    assert.equal(tabs.get(BUTLER_TAB).opts.prefix, '/butler ', 'a line typed in its chat is an IM to it');

    // /butler a … from Local chat (slash-commands-feature asks butlerImCommand).
    assert.equal(butlerImFeature.butlerImCommand('a Back in five', engine), true);
    assert.deepEqual(sent.at(-1), { t: 'butler_announce', text: 'Back in five' });
    butlerImFeature.butlerImCommand('t hi', engine);
    assert.deepEqual(sent.at(-1), { t: 'butler_tell', text: 'hi' });
    butlerImFeature.butlerImCommand('who', engine);
    assert.deepEqual(sent.at(-1), { t: 'butler_who' });
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'announced', text: 'Back in five' });
    t.mock.timers.tick(1000);
    assert.equal(lines().at(-1), 'Jeeves: Ok, I announced "Back in five".');
    assert.ok(lines().includes('>Ada: a Back in five'), 'your IM shows in its chat');

    // quit: saved and told to the server; the eavesdrop verbs follow notifications.
    butlerImFeature.butlerImCommand('q', engine);
    assert.deepEqual(sent.at(-1), { t: 'butler_watch', on: true, notify: false, listen: true });
    assert.deepEqual(butlerImFeature.save(), { v: 1, notify: false, listen: true });
    assert.ok(engine.saves > 0);
    butlerImFeature.butlerImCommand('r', engine);
    assert.equal(sent.at(-1).notify, true);

    // The Butler says it on the street: yours over your own, a visited owner's through neighbours-mp.
    client.emit('msg:butler_said', { t: 'butler_said', owner: 7, text: 'Back in five' });
    client.emit('msg:butler_said', { t: 'butler_said', owner: 9, text: 'Welcome!' });
    assert.deepEqual(streetSaid, ['Back in five']);
    assert.deepEqual(chat, ['Jeeves: Back in five', 'Jeeves: Welcome!']);
    t.mock.timers.reset();
  });

  it('IMs show in the order they came, even when the clock moves between them (a long delay, then a short one)', async (t) => {
    // The delays are spaced by Date.now while the timers keep their own clock: under load the two
    // drift apart, and a slow first IM once showed after a quick second one (full suite 2026-11-04).
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { butlerApi } = await import('../public/js/features/butler-feature.js?v=ec590369');
    t.mock.method(butlerApi, 'owned', () => true);
    t.mock.method(butlerApi, 'label', () => 'Jeeves');
    let clock = 1_000_000;
    t.mock.method(Date, 'now', () => clock);
    const delays = [0.999, 0];
    t.mock.method(Math, 'random', () => delays.shift() ?? 0);
    // Its own copy of the feature: the one above keeps its session (and fake client) for the file.
    const { butlerImFeature: fresh } = await import('../public/js/features/butler-im-feature.js?fresh=im-order');
    const { engine, client, tabs } = mpEngine();
    fresh.restore(undefined, engine);
    fresh.onTick(16, 0, engine);
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'visitor', from: { id: 9, name: 'Bo' } });
    clock += 5;
    client.emit('msg:butler_im', { t: 'butler_im', kind: 'speech', from: { id: 9, name: 'Bo' }, text: 'anyone home?' });
    t.mock.timers.tick(999);
    assert.deepEqual(tabs.get(BUTLER_TAB).lines.map((l) => l.text), ["Bo is on your Home Street. You can type 'help' for hints about what I can do!"], 'the first timer due shows the oldest IM');
    t.mock.timers.tick(1);
    assert.deepEqual(tabs.get(BUTLER_TAB).lines.map((l) => l.text), ["Bo is on your Home Street. You can type 'help' for hints about what I can do!", "Bo said 'anyone home?'"]);
    t.mock.timers.reset();
  });
});
