/**
 * Welcome card tab (tidyk2, 2026-11-27, from the v0.79.0 review): a window playing online (A) and a
 * new tab of the same browser opened on the same character (B). B claims the save as it loads, on
 * its Welcome card (js/save-claim.js): A saves, stops writing and says "Playing in another tab"
 * (js/save-store.js yieldTo: state 'elsewhere', by 'window'). But A's street connection only went
 * when B pressed Start (B's ticket made the server close A with 4001), so until then A was not
 * greyed (the verbs, emotes and Play here of the #733 states, js/online-request.js PLAY_HERE_STATES)
 * while every other replaced window was. And a tab that yielded on its own Welcome card connected
 * on Start and took the character back from the other tab.
 *
 * Now the yield puts A's client in 'replaced' at once (realtime-client yieldedToTab: it leaves the
 * street and closes), so A greys as the other replaced windows do, and Play here brings it back.
 * Glitch let one session play a character and the newest won (the server's 4001).
 * Run: node --test tests/play-here-tab-yield.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRealtimeClient } from '../public/js/realtime-client.js?v=7e402304';
import { PLAY_HERE_STATES } from '../public/js/online-request.js?v=5fa7a635';
import { tabYielded } from '../public/js/features/realtime-feature.js?fresh=play-here-tab-yield';

const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  let t = 1_000_000;
  const timers = new Map();
  let seq = 0;
  const made = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closedWith = null; made.push(this); }
    send(data) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(JSON.parse(data)); }
    close(code, reason) { this.closedWith = { code, reason }; this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  }
  const client = createRealtimeClient({
    ticket: async () => ({ ticket: 't', path: '/ws' }),
    baseUri: 'https://groddle.localhost/play/online/',
    WebSocket: FakeSocket,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout: (id) => timers.delete(id),
    now: () => t,
    random: () => 0.5,
  });
  const states = [];
  client.on('state', ({ state }) => states.push(state));
  const advance = async (ms) => {
    t += ms;
    for (const [id, v] of [...timers]) if (v.at <= t) { timers.delete(id); v.fn(); await flush(); }
    await flush();
  };
  return { client, made, states, advance };
}

describe('a tab whose save went to another tab of this browser', () => {
  it('online: leaves the street and waits on Play here at once (replaced), never reconnecting by itself', async () => {
    const ctx = setup();
    ctx.client.join({ street: 'S1' });
    ctx.client.start();
    await flush();
    const ws = ctx.made.at(-1);
    ws.open();
    ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(ctx.client.state, 'online');
    ctx.client.yieldedToTab();
    assert.equal(ctx.client.state, 'replaced');
    assert.ok(PLAY_HERE_STATES.has(ctx.client.state), 'greyed as the other replaced windows (the #733 states)');
    assert.equal(ws.sent.at(-1).t, 'leave', 'the street sees it go now, not when the other tab starts');
    assert.ok(ws.closedWith, 'the socket is closed');
    await ctx.advance(10 * 60 * 1000);
    assert.equal(ctx.made.length, 1, 'no new socket by itself');
    ctx.client.restart();
    await flush();
    assert.equal(ctx.made.length, 2, 'Play here connects again');
  });

  it('on its own Welcome card (not started): replaced, and Start does not take the character back', async () => {
    const ctx = setup();
    assert.equal(ctx.client.state, 'idle');
    ctx.client.yieldedToTab();
    assert.equal(ctx.client.state, 'replaced');
    assert.deepEqual(ctx.states, ['replaced'], 'told, so the page greys now');
    ctx.client.start();
    await flush();
    assert.equal(ctx.made.length, 0, 'Start connects nothing');
  });

  it('an ended state stays as it is', () => {
    const ctx = setup();
    ctx.client.yieldedToTab();
    ctx.client.yieldedToTab();
    assert.deepEqual(ctx.states, ['replaced']);
  });
});

describe('realtime-feature hears the yield (groddle:save-state)', () => {
  it('only a yield to another tab of this browser counts, not a save taken on another device (that one offers Keep)', () => {
    assert.equal(tabYielded({ state: 'elsewhere', by: 'window' }), true);
    assert.equal(tabYielded({ state: 'elsewhere' }), false);
    assert.equal(tabYielded({ state: 'elsewhere', by: 'character' }), false);
    assert.equal(tabYielded({ state: 'conflict', by: 'window' }), false);
    assert.equal(tabYielded(null), false);
  });

  it('the session listens for it and puts its client in replaced', () => {
    const src = readFileSync(new URL('../public/js/features/realtime-feature.js', import.meta.url), 'utf8');
    assert.match(src, /addEventListener\('groddle:save-state', \(e\) => \{\s*if \(tabYielded\(e\?\.detail\)\) client\.yieldedToTab\(\);/);
  });
});
