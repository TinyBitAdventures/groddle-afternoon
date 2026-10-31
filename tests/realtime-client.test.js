/**
 * Multiplayer phase 3, the game side: js/realtime-client.js (ticket, socket,
 * auth, reconnects, roster, move throttling, chat, emotes, motion
 * smoothing), minn-account.js realtimeTicket(), and the rules of
 * js/features/realtime-feature.js (off in solo, status copy, emote commands,
 * private places). The protocol is hub.go's header comment in
 * groddle-afternoon-server; the real server is driven by
 * tests/minn-accounts-live.test.js (opt-in).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BACKOFF_MAX_MS,
  CLOSE_QUIET,
  CLOSE_REPLACED,
  CLOSE_TICKET,
  INTERP_DELAY_MS,
  MAX_CHAT,
  MOVE_EVERY_MS,
  PING_EVERY_MS,
  QUIET_MS,
  backoffMs,
  createRealtimeClient,
  createTrack,
  decodeAnim,
  encodeAnim,
  fitLook,
  pushSample,
  sampleTrack,
  socketUrl,
} from '../public/js/realtime-client.js?v=8894c637';
import { createMinnAccount } from '../public/js/minn-account.js?v=81339760';
import { emoteCommand, lookOf, poseOf, realtimeFeature, sharedStreet, statusText } from '../public/js/features/realtime-feature.js?v=72bd6e0f';
import { FEATURES } from '../public/js/features/index.js?v=181a2477';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const BASE = 'https://groddle.localhost/play/online/';
const flush = () => new Promise((r) => setImmediate(r));

/** Manual clock + timers. */
function fakeTime(start = 1_000_000) {
  let t = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    pending: () => timers.size,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}

/** A WebSocket stand-in that records every socket the client opens. */
function fakeSockets() {
  const made = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closedWith = null;
      made.push(this);
    }
    send(data) {
      if (this.readyState !== 1) throw new Error('not open');
      this.sent.push(JSON.parse(data));
    }
    close(code, reason) {
      this.closedWith = { code, reason };
      this.readyState = 3;
    }
    // Test drivers.
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(msg) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
    drop(code = 1006) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
    kinds() {
      return this.sent.map((m) => m.t);
    }
  }
  return { WebSocket: FakeSocket, made, last: () => made[made.length - 1] };
}

function setup({ tickets } = {}) {
  const time = fakeTime();
  const sockets = fakeSockets();
  const asked = [];
  const queue = tickets ? [...tickets] : null;
  const ticket = async () => {
    asked.push(time.now());
    const next = queue ? queue.shift() : { ticket: `t${asked.length}`, path: '/ws' };
    if (next instanceof Error) throw next;
    return next ?? { ticket: `t${asked.length}`, path: '/ws' };
  };
  const client = createRealtimeClient({ ticket, baseUri: BASE, WebSocket: sockets.WebSocket, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, now: time.now, random: () => 0.5 });
  const events = [];
  for (const type of ['state', 'hello', 'roster', 'joined', 'left', 'moved', 'said', 'emoted', 'error']) client.on(type, (d) => events.push([type, d]));
  return { time, sockets, asked, client, events };
}

/** Start, open, hello as player 7 "Ada". */
async function online(ctx, { id = 7, name = 'Ada' } = {}) {
  ctx.client.start();
  await flush();
  const ws = ctx.sockets.last();
  ws.open();
  ws.receive({ t: 'hello', you: { id, name } });
  return ws;
}

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('realtime-client: wire helpers', () => {
  it('avatar states travel as the server anim words and come back', () => {
    const states = ['stand', 'idle0', 'idle4', 'afk', 'wake', 'walk1x', 'walk2x', 'climb', 'climbPause', 'lift', 'fall', 'land', 'hit1', 'hit2', 'happy', 'surprise', 'angry'];
    for (const s of states) {
      const w = encodeAnim(s);
      assert.match(w, /^[a-z0-9_]{1,24}$/, `${s} fits hub.go wordRe`);
      assert.equal(decodeAnim(w), s);
    }
    assert.equal(encodeAnim('climbPause'), 'climb_pause');
    assert.equal(encodeAnim('jumpOver_lift'), 'stand', 'unknown states stand');
    assert.equal(decodeAnim('moonwalk'), 'stand');
  });

  it('the socket is on the page host, wss on https', () => {
    assert.equal(socketUrl('/ws', BASE), 'wss://groddle.localhost/ws');
    assert.equal(socketUrl('/ws', 'http://127.0.0.1:8771/play/online/'), 'ws://127.0.0.1:8771/ws');
    assert.equal(socketUrl(undefined, BASE), 'wss://groddle.localhost/ws');
    // GRODDLE_REALTIME_URL: the site names a server on another host; kept as given, never downgraded.
    assert.equal(socketUrl('wss://play.example.com/ws', BASE), 'wss://play.example.com/ws');
    assert.equal(socketUrl('ws://127.0.0.1:8793/ws', BASE), 'ws://127.0.0.1:8793/ws');
  });

  it('a look over 4 KB of JSON is not sent', () => {
    assert.deepEqual(fitLook({ v: 1, vector: { outfit: { hat: 'x' } } }), { v: 1, vector: { outfit: { hat: 'x' } } });
    assert.equal(fitLook({ blob: 'x'.repeat(5000) }), null);
    assert.equal(fitLook(null), null);
  });

  it('backoff doubles from a second and caps at 30 s, with jitter', () => {
    assert.equal(backoffMs(0, () => 0.5), 1000);
    assert.equal(backoffMs(1, () => 0.5), 2000);
    assert.equal(backoffMs(3, () => 0.5), 8000);
    assert.equal(backoffMs(20, () => 0.5), BACKOFF_MAX_MS);
    assert.equal(backoffMs(0, () => 0), 750);
    assert.equal(backoffMs(0, () => 1), 1250);
  });
});

describe('realtime-client: connecting', () => {
  it('fetches a ticket, opens the socket and sends it as the first frame', async () => {
    const ctx = setup();
    assert.equal(ctx.client.state, 'idle');
    ctx.client.start();
    assert.equal(ctx.client.state, 'connecting');
    await flush();
    assert.equal(ctx.asked.length, 1);
    const ws = ctx.sockets.last();
    assert.equal(ws.url, 'wss://groddle.localhost/ws');
    ws.open();
    assert.deepEqual(ws.sent, [{ t: 'auth', ticket: 't1' }]);
    ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(ctx.client.state, 'online');
    assert.deepEqual(ctx.client.me, { id: 7, name: 'Ada' });
    assert.equal(ctx.client.here, 0, 'not on a street yet');
  });

  it('a street asked for before hello is joined once online, with the look', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'GA5101HF7F429V5', x: 100.04, y: -30, dir: -1, anim: 'stand', look: { v: 1, vector: {} } });
    const ws = await online(ctx);
    assert.deepEqual(ws.sent[1], { t: 'join', street: 'GA5101HF7F429V5', x: 100, y: -30, dir: -1, anim: 'stand', look: { v: 1, vector: {} } });
  });

  it('the roster leaves you out, and joined, moved and left keep it', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo', x: 10, y: 5, dir: -1, anim: 'walk2x', look: { v: 1 } }, { id: 7, name: 'Ada' }] });
    assert.equal(ctx.client.here, 2);
    assert.deepEqual(ctx.client.players.map((p) => p.name), ['Bo']);
    assert.equal(ctx.client.players[0].dir, -1);
    ws.receive({ t: 'joined', player: { id: 9, name: 'Cy', x: 0, y: 0, dir: 1, anim: 'climb_pause' } });
    assert.equal(ctx.client.here, 3);
    assert.equal(ctx.client.players.find((p) => p.id === 9).anim, 'climbPause');
    ws.receive({ t: 'moved', id: 8, x: 40, y: 6, dir: 1, anim: 'stand' });
    assert.deepEqual(ctx.client.players.find((p) => p.id === 8), { id: 8, name: 'Bo', x: 40, y: 6, dir: 1, anim: 'stand', look: { v: 1 } });
    ws.receive({ t: 'moved', id: 99, x: 1, y: 1 });
    ws.receive({ t: 'left', id: 9 });
    assert.equal(ctx.client.here, 2);
    const kinds = ctx.events.map(([k]) => k);
    assert.ok(kinds.includes('joined') && kinds.includes('left') && kinds.includes('moved'));
    assert.equal(ctx.events.filter(([k, d]) => k === 'moved' && d.id === 99).length, 0, 'strangers do not move');
  });

  it('module kinds: send() carries them, core kinds are refused, and their frames arrive as msg:<kind>', async () => {
    const ctx = setup();
    assert.equal(ctx.client.send('quoin', { id: 'q1' }), false, 'nothing is sent before online');
    const ws = await online(ctx);
    assert.equal(ctx.client.send('quoin', { id: 'q1', t: 'chat' }), true);
    assert.deepEqual(ws.sent.at(-1), { id: 'q1', t: 'quoin' }, 'the kind wins over a t in the payload');
    for (const core of ['auth', 'join', 'move', 'chat', 'emote', 'leave', 'ping']) assert.equal(ctx.client.send(core), false, core);
    assert.equal(ctx.client.send('Bad-Kind'), false);
    const heard = [];
    ctx.client.on('msg:quoin_gone', (m) => heard.push(m.id));
    ws.receive({ t: 'quoin_gone', id: 'q1' });
    ws.receive({ t: 'pong' });
    assert.deepEqual(heard, ['q1']);
  });

  it('frames from the old street are dropped until the new street answers', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    ctx.client.join({ street: 'S2', x: 5 });
    assert.equal(ws.sent.at(-1).t, 'join');
    assert.equal(ctx.client.here, 0, 'the old roster is gone at once');
    ws.receive({ t: 'joined', player: { id: 8, name: 'Bo' } });
    ws.receive({ t: 'said', id: 8, name: 'Bo', text: 'old street', at: 1 });
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    assert.equal(ctx.client.here, 0);
    ws.receive({ t: 'street', street: 'S2', players: [] });
    assert.equal(ctx.client.street, 'S2');
    assert.equal(ctx.client.here, 1);
    assert.equal(ctx.events.filter(([k]) => k === 'said').length, 0);
  });

  it('leave sends leave and empties the street; a private place keeps the socket', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    ctx.client.leave();
    assert.equal(ws.sent.at(-1).t, 'leave');
    assert.equal(ctx.client.wanted, '');
    assert.equal(ctx.client.here, 0);
    assert.equal(ctx.client.state, 'online');
    assert.equal(ctx.client.move({ x: 1, y: 1 }), false, 'no moves off the street');
    assert.equal(ctx.client.chat('hi'), false);
  });
});

describe('realtime-client: moves, chat, emotes', () => {
  it('moves go out at most every 100 ms, only when changed, and the last one always lands', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1', x: 0, y: 0 });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [] });
    const moves = () => ws.sent.filter((m) => m.t === 'move');
    assert.equal(ctx.client.move({ x: 0, y: 0, dir: 1, anim: 'stand' }), false, 'the join already said where you stand');
    await ctx.time.advance(MOVE_EVERY_MS);
    assert.equal(ctx.client.move({ x: 4, y: 0, dir: 1, anim: 'walk2x' }), true);
    for (let i = 1; i <= 5; i++) {
      await ctx.time.advance(16);
      ctx.client.move({ x: 4 + i * 4, y: 0, dir: 1, anim: 'walk2x' });
    }
    assert.equal(moves().length, 1, 'held back inside the 100 ms window');
    await ctx.time.advance(MOVE_EVERY_MS);
    assert.equal(moves().length, 2, 'the trailing send');
    assert.deepEqual(moves()[1], { t: 'move', x: 24, y: 0, dir: 1, anim: 'walk2x' });
    await ctx.time.advance(1000);
    ctx.client.move({ x: 24, y: 0, dir: 1, anim: 'walk2x' });
    assert.equal(moves().length, 2, 'unchanged is not sent');
    ctx.client.move({ x: 24, y: 0, dir: -1, anim: 'climbPause' });
    assert.deepEqual(moves()[2], { t: 'move', x: 24, y: 0, dir: -1, anim: 'climb_pause' });
    // 60 frames of walking in a second send about 10 moves (the server drops beyond 20).
    const before = moves().length;
    for (let i = 0; i < 60; i++) {
      await ctx.time.advance(1000 / 60);
      ctx.client.move({ x: 100 + i, y: 0, dir: 1, anim: 'walk2x' });
    }
    const sent = moves().length - before;
    assert.ok(sent >= 9 && sent <= 11, `sent ${sent}`);
  });

  it('chat is one trimmed line of at most 200 characters, sent only on a street', async () => {
    const ctx = setup();
    const ws = await online(ctx);
    assert.equal(ctx.client.chat('hi'), false, 'no street yet');
    ctx.client.join({ street: 'S1' });
    ws.receive({ t: 'street', street: 'S1', players: [] });
    assert.equal(ctx.client.chat('  hello\n  there  '), true);
    assert.deepEqual(ws.sent.at(-1), { t: 'chat', text: 'hello there' });
    ctx.client.chat('x'.repeat(300));
    assert.equal(ws.sent.at(-1).text.length, MAX_CHAT);
    assert.equal(ctx.client.chat('   '), false);
    ws.receive({ t: 'said', id: 7, name: 'Ada', text: 'hello there', at: 5 });
    ws.receive({ t: 'said', id: 8, name: 'Bo', text: 'hi Ada', at: 6 });
    const said = ctx.events.filter(([k]) => k === 'said').map(([, d]) => d);
    assert.deepEqual(said, [{ id: 7, name: 'Ada', text: 'hello there', at: 5, mine: true }, { id: 8, name: 'Bo', text: 'hi Ada', at: 6, mine: false }]);
    ws.receive({ t: 'error', code: 'slow_down', message: 'Slow down a little.' });
    assert.deepEqual(ctx.events.at(-1), ['error', { code: 'slow_down', message: 'Slow down a little.' }]);
  });

  it('emotes are the three emotions, sent and received', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    assert.equal(ctx.client.emote('wave'), false);
    assert.equal(ctx.client.emote('happy'), true);
    assert.deepEqual(ws.sent.at(-1), { t: 'emote', e: 'happy' });
    ws.receive({ t: 'emoted', id: 8, e: 'surprise' });
    ws.receive({ t: 'emoted', id: 8, e: 'dance' });
    const emoted = ctx.events.filter(([k]) => k === 'emoted');
    assert.equal(emoted.length, 1);
    assert.equal(emoted[0][1].e, 'surprise');
  });
});

describe('realtime-client: closes and reconnects', () => {
  it('4001 (playing somewhere else) never reconnects by itself; restart takes the character back', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ws.drop(CLOSE_REPLACED);
    assert.equal(ctx.client.state, 'replaced');
    await ctx.time.advance(10 * 60 * 1000);
    assert.equal(ctx.sockets.made.length, 1);
    assert.equal(ctx.asked.length, 1);
    ctx.client.restart();
    await flush();
    const again = ctx.sockets.last();
    assert.notEqual(again, ws);
    again.open();
    again.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(again.sent[1].t, 'join', 'the street is joined again');
    assert.equal(again.sent[1].street, 'S1');
  });

  it('4003 (used or bad ticket) fetches a new ticket straight away', async () => {
    const ctx = setup();
    ctx.client.start();
    await flush();
    ctx.sockets.last().open();
    ctx.sockets.last().drop(CLOSE_TICKET);
    assert.equal(ctx.client.state, 'connecting');
    await ctx.time.advance(0);
    assert.equal(ctx.asked.length, 2);
    assert.equal(ctx.sockets.made.length, 2);
    ctx.sockets.last().open();
    assert.deepEqual(ctx.sockets.last().sent[0], { t: 'auth', ticket: 't2' });
    // Twice more and it backs off like any other failure.
    ctx.sockets.last().drop(CLOSE_TICKET);
    await ctx.time.advance(0);
    ctx.sockets.last().open();
    ctx.sockets.last().drop(CLOSE_TICKET);
    assert.equal(ctx.client.state, 'offline');
  });

  it('a dropped socket retries with backoff and rejoins where the player now stands', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1', x: 0 });
    const ws = await online(ctx);
    ws.receive({ t: 'street', street: 'S1', players: [{ id: 8, name: 'Bo' }] });
    ws.drop(1006);
    assert.equal(ctx.client.state, 'offline');
    assert.equal(ctx.client.here, 0);
    ctx.client.move({ x: 321, y: 4, dir: -1, anim: 'walk1x' });
    await ctx.time.advance(999);
    assert.equal(ctx.sockets.made.length, 1, 'waits about a second');
    await ctx.time.advance(1);
    assert.equal(ctx.sockets.made.length, 2);
    // That one fails too: the next wait is two seconds.
    ctx.sockets.last().drop(1006);
    await ctx.time.advance(1999);
    assert.equal(ctx.sockets.made.length, 2);
    await ctx.time.advance(1);
    const ws3 = ctx.sockets.last();
    ws3.open();
    ws3.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.deepEqual(ws3.sent[1], { t: 'join', street: 'S1', x: 321, y: 4, dir: -1, anim: 'walk1x' });
    assert.equal(ctx.client.attempt, 0, 'online resets the backoff');
  });

  it('signed out (401) and no realtime on this site (503) stop; a network error retries', async () => {
    const out = setup({ tickets: [httpError(401)] });
    out.client.start();
    await flush();
    assert.equal(out.client.state, 'signed-out');
    await out.time.advance(120000);
    assert.equal(out.asked.length, 1);
    assert.equal(out.sockets.made.length, 0);

    const off = setup({ tickets: [httpError(503)] });
    off.client.start();
    await flush();
    assert.equal(off.client.state, 'off');
    await off.time.advance(120000);
    assert.equal(off.asked.length, 1);

    const net = setup({ tickets: [httpError(0)] });
    net.client.start();
    await flush();
    assert.equal(net.client.state, 'offline');
    await net.time.advance(1000);
    assert.equal(net.asked.length, 2);
    assert.equal(net.sockets.made.length, 1);
  });

  it('pings while online and drops a socket that went quiet', async () => {
    const ctx = setup();
    const ws = await online(ctx);
    await ctx.time.advance(PING_EVERY_MS);
    assert.equal(ws.sent.at(-1).t, 'ping');
    ws.receive({ t: 'pong' });
    await ctx.time.advance(QUIET_MS + PING_EVERY_MS);
    assert.equal(ws.closedWith?.code, CLOSE_QUIET);
    assert.ok(['offline', 'connecting'].includes(ctx.client.state));
    assert.ok(ctx.sockets.made.length >= 2, 'and connects again');
  });

  it('stop says leave, closes cleanly and never comes back', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    const ws = await online(ctx);
    ctx.client.stop();
    assert.equal(ws.sent.at(-1).t, 'leave');
    assert.equal(ws.closedWith.code, 1000);
    assert.equal(ctx.client.state, 'stopped');
    ws.drop(1000);
    await ctx.time.advance(60000);
    assert.equal(ctx.sockets.made.length, 1);
  });
});

describe('realtime-client: smooth motion', () => {
  it('draws a little behind, blending between moves', () => {
    const track = createTrack({ x: 0, y: 0, dir: 1, anim: 'walk2x' }, 1000);
    pushSample(track, { x: 10, y: 0, dir: 1, anim: 'walk2x' }, 1100);
    pushSample(track, { x: 20, y: 0, dir: 1, anim: 'walk2x' }, 1200);
    assert.equal(sampleTrack(track, 1150 + INTERP_DELAY_MS).x, 15);
    assert.equal(sampleTrack(track, 900).x, 0, 'before the first sample: the first');
    assert.equal(sampleTrack(track, 5000).x, 20, 'after the last: hold');
  });

  it('a walk after standing still starts from where they stood', () => {
    const track = createTrack({ x: 0, y: 0, dir: 1, anim: 'stand' }, 0);
    pushSample(track, { x: 8, y: 0, dir: 1, anim: 'walk2x' }, 10000);
    const at = sampleTrack(track, 10000 - MOVE_EVERY_MS / 2 + INTERP_DELAY_MS);
    assert.ok(at.x > 0 && at.x < 8, `x ${at.x}`);
    assert.ok(sampleTrack(track, 10000 - INTERP_DELAY_MS).x === 0);
  });

  it('a teleport snaps instead of sliding across the street', () => {
    const track = createTrack({ x: 0, y: 0, dir: 1, anim: 'stand' }, 0);
    pushSample(track, { x: 3000, y: 0, dir: 1, anim: 'stand' }, 100);
    assert.equal(sampleTrack(track, 50 + INTERP_DELAY_MS).x, 0);
    assert.equal(sampleTrack(track, 100 + INTERP_DELAY_MS).x, 3000);
  });
});

/** A fetch answering by URL suffix, as tests/minn-account.test.js does. */
function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    let answer = key ? routes[key] : { status: 404, body: 'Not found' };
    if (Array.isArray(answer)) answer = answer.shift();
    if (answer === 'network') throw new TypeError('Failed to fetch');
    const headers = new Map(answer.nonce ? [['x-wp-nonce', answer.nonce]] : []);
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      json: async () => (typeof answer.body === 'string' ? JSON.parse(answer.body) : answer.body),
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fn, calls };
}

describe('minn-account: realtime tickets', () => {
  const SITE = 'https://groddle.localhost/';
  const NONCE_PATH = 'wp-admin/admin-ajax.php?action=rest-nonce';

  it('posts with the boot nonce and hands back the ticket', async () => {
    const f = routedFetch({ 'groddle/v1/realtime': { status: 200, body: { ticket: 'abc.def', expiresIn: 60, path: '/ws' } } });
    const account = createMinnAccount({ baseUri: SITE, fetch: f.fn, nonce: '0123456789' });
    assert.deepEqual(await account.realtimeTicket(), { ticket: 'abc.def', expiresIn: 60, path: '/ws' });
    assert.equal(f.calls.length, 1, 'no admin-ajax round trip with a nonce in hand');
    assert.equal(f.calls[0].method, 'POST');
    assert.equal(f.calls[0].headers['X-WP-Nonce'], '0123456789');
    assert.equal(f.calls[0].body, undefined);
  });

  it('a stale nonce is refreshed once', async () => {
    const f = routedFetch({
      'groddle/v1/realtime': [
        { status: 403, body: { code: 'rest_cookie_invalid_nonce' } },
        { status: 200, body: { ticket: 'fresh', expiresIn: 60, path: '/ws' } },
      ],
      [NONCE_PATH]: { status: 200, body: 'abcdef0123' },
    });
    const account = createMinnAccount({ baseUri: SITE, fetch: f.fn, nonce: '0123456789' });
    assert.equal((await account.realtimeTicket()).ticket, 'fresh');
    assert.equal(f.calls[2].headers['X-WP-Nonce'], 'abcdef0123');
  });

  it('signed out, off and unreachable carry their status', async () => {
    const out = createMinnAccount({ baseUri: SITE, fetch: routedFetch({ 'groddle/v1/realtime': { status: 401, body: { code: 'groddle_realtime_signed_out' } } }).fn });
    await assert.rejects(out.realtimeTicket(), (e) => e.status === 401 && e.code === 'groddle_realtime_signed_out');
    const off = createMinnAccount({ baseUri: SITE, fetch: routedFetch({ 'groddle/v1/realtime': { status: 503, body: { code: 'groddle_realtime_off' } } }).fn });
    await assert.rejects(off.realtimeTicket(), (e) => e.status === 503);
    const gone = createMinnAccount({ baseUri: SITE, fetch: routedFetch({ 'groddle/v1/realtime': 'network' }).fn });
    await assert.rejects(gone.realtimeTicket(), (e) => e.status === 0);
  });

  it('a seeded nonce that is not one is ignored', async () => {
    const f = routedFetch({ 'groddle/v1/realtime': { status: 200, body: { ticket: 'x' } } });
    await createMinnAccount({ baseUri: SITE, fetch: f.fn, nonce: '<script>' }).realtimeTicket();
    assert.equal(f.calls[0].headers['X-WP-Nonce'], undefined);
  });
});

describe('realtime feature', () => {
  it('is registered (before the account backup, which stays last), under its own key', () => {
    assert.equal(FEATURES.at(-2), realtimeFeature);
    assert.match(read('public/js/features/index.js'), /realtime-feature\.js\?v=[0-9a-f]{8}/);
  });

  it('does nothing in solo: no socket, no UI, no hook answers', () => {
    let sockets = 0;
    let dom = 0;
    const saved = { WebSocket: globalThis.WebSocket, document: globalThis.document };
    globalThis.WebSocket = class { constructor() { sockets++; } };
    globalThis.document = new Proxy({}, { get() { dom++; return () => null; } });
    try {
      realtimeFeature.init({ mode: 'solo' });
      realtimeFeature.onTick(16, Date.now(), { mode: 'solo', started: true, player: { x: 0, y: 0 }, streetTsid: 'S1' });
      assert.equal(realtimeFeature.localChatSaid('hi'), null);
      assert.equal(realtimeFeature.playerChatName(), null);
      assert.equal(realtimeFeature.chatCommand('/happy'), null);
      assert.equal(realtimeFeature.remotePlayerNames(), null);
    } finally {
      globalThis.WebSocket = saved.WebSocket;
      if (saved.document === undefined) delete globalThis.document;
      else globalThis.document = saved.document;
    }
    assert.equal(sockets, 0);
    assert.equal(dom, 0);
    assert.equal(globalThis.groddleRealtime, undefined);
  });

  it('says where it stands in plain words', () => {
    assert.equal(statusText('connecting'), 'Connecting');
    assert.equal(statusText('connecting', { attempt: 2 }), 'Offline, retrying');
    assert.equal(statusText('online', { here: 1 }), 'Just you here');
    assert.equal(statusText('online', { here: 3 }), '3 here');
    assert.equal(statusText('replaced'), 'Playing somewhere else');
    assert.equal(statusText('offline'), 'Offline, retrying');
    for (const s of ['idle', 'connecting', 'online', 'offline', 'replaced', 'signed-out', 'off', 'stopped']) assert.doesNotMatch(statusText(s), /—|–/);
  });

  it('emote commands', () => {
    assert.equal(emoteCommand('/happy'), 'happy');
    assert.equal(emoteCommand('/Surprised'), 'surprise');
    assert.equal(emoteCommand('/emote angry'), 'angry');
    assert.equal(emoteCommand('/who'), null);
    assert.equal(emoteCommand('happy'), null);
  });

  it('private places leave the street', () => {
    const player = { x: 12.5, y: -40, facing: 'left', glitchState: 'walk2x' };
    const engine = (over = {}) => ({ player, streetTsid: 'S1', transientInstance: () => false, homeContext: () => ({ inHome: false }), ...over });
    assert.equal(sharedStreet(engine()), 'S1');
    assert.equal(sharedStreet(engine({ transientInstance: () => true })), '');
    assert.equal(sharedStreet(engine({ homeContext: () => ({ inHome: true }) })), '');
    assert.equal(sharedStreet(engine({ player: null })), '');
    assert.deepEqual(poseOf(player), { x: 12.5, y: -40, dir: -1, anim: 'walk2x' });
    assert.deepEqual(poseOf({ x: 1, y: 2 }), { x: 1, y: 2, dir: 1, anim: 'stand' });
    assert.deepEqual(lookOf({ playerAppearance: { vector: { outfit: { hat: 'a' } } } }), { v: 1, vector: { outfit: { hat: 'a' } } });
    assert.deepEqual(lookOf({}), { v: 1, vector: {} });
  });

  it('game.js hands the feature the chat and the Glitch packs, nothing more', () => {
    const game = read('public/game.js');
    assert.match(game, /features\.query\('localChatSaid', text, engine\)/);
    assert.match(game, /features\.query\('playerChatName', engine\)/);
    assert.match(game, /glitchPack\(look\)/);
    assert.match(game, /heldGlitchAnims\.has\(bake\.pack\.anims\)/);
    assert.doesNotMatch(game, /realtime-client\.js/);
  });
});
