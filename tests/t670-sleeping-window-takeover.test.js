/**
 * #670 (G1324, Austin's ruling 2026-11-26): a window that slept (laptop lid closed) while the same character was
 * played on another device never heard its 4001; when it wakes, its quiet check drops the socket and
 * it reconnects by itself with a fresh ticket, and the server's "newest wins" (hub.go closeReplaced)
 * takes the character from the window the player is actually using. That window goes "Playing
 * somewhere else", and drops-mp-feature clears the shared house floor from its view.
 * Glitch (NetController.as disconnectHandler 596-603): silence over 3.5 minutes asked to reload, no
 * silent reconnect. Now: nothing heard for SLEPT_MS and the window waits on Play here ('asleep');
 * a short drop while the page is in use still reconnects by itself.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QUIET_MS, SLEPT_MS, bindPageLifecycle, createRealtimeClient } from '../public/js/realtime-client.js?v=eb1515a8';
import { ENDED_STATES } from '../public/js/online-request.js?v=dac938db';
import { ASLEEP_TEXT, statusText } from '../public/js/features/realtime-feature.js?v=d8663229';

const BASE = 'https://groddle.localhost/play/online/';
const flush = () => new Promise((r) => setImmediate(r));

function fakeTime(start = 1_000_000) {
  let t = start; let seq = 0; const timers = new Map();
  return {
    now: () => t,
    /** The machine slept: the wall clock moves on, no timer ran meanwhile (they come due on the next advance). */
    jump(ms) { t += ms; },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + Math.max(0, ms), fn }); return id; },
    clearTimeout: (id) => timers.delete(id),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); t = Math.max(t, due[1].at); due[1].fn(); await flush();
      }
      t = end; await flush();
    },
  };
}

/** One shared server: a socket that authenticates closes the character's older live socket with 4001, if that page is awake. */
function server() {
  const live = []; // { ws, page }
  const srv = {
    live,
    set down(v) { live.down = v; },
    /** The network drops a page's socket (a blip): it closes 1006. */
    drop(p) { const o = live.find((l) => l.page === p); if (o) { o.ws.readyState = 3; o.ws.onclose?.({ code: 1006 }); } },
    socketClass(page) {
      return class FakeSocket {
        constructor() {
          this.readyState = 0; this.page = page;
          const down = this.down = live.down;
          queueMicrotask(() => { if (down) { this.readyState = 3; this.onclose?.({ code: 1006 }); } else { this.readyState = 1; this.onopen?.(); } });
        }
        send(data) {
          const m = JSON.parse(data);
          if (m.t !== 'auth') return;
          for (const o of live.splice(0)) if (o.ws.readyState === 1 && o.page.awake) { o.ws.readyState = 3; o.ws.onclose?.({ code: 4001 }); }
          live.push({ ws: this, page });
          this.onmessage?.({ data: JSON.stringify({ t: 'hello', you: { id: 7, name: 'Cat' } }) });
        }
        close() { this.readyState = 3; }
      };
    },
  };
  return srv;
}

function page(srv) {
  const time = fakeTime();
  const p = { awake: true, time };
  let n = 0;
  p.client = createRealtimeClient({ ticket: async () => ({ ticket: `t${++n}`, path: '/ws' }), baseUri: BASE, WebSocket: srv.socketClass(p), setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, now: time.now, random: () => 0.5 });
  return p;
}

describe('#670: a sleeping window does not take the character back', () => {
  it('the window in use stays online when the laptop wakes', async () => {
    const srv = server();
    const laptop = page(srv);
    laptop.client.start(); await flush(); await flush();
    assert.equal(laptop.client.state, 'online');
    laptop.awake = false; // lid closed: no frames, no timers run

    const work = page(srv);
    work.client.start(); await flush(); await flush();
    assert.equal(work.client.state, 'online', 'the work PC plays');

    // Hours later the laptop wakes (Modern Standby, or the lid opens): its timers run.
    laptop.time.jump(3 * 60 * 60 * 1000);
    laptop.awake = true;
    await laptop.time.advance(QUIET_MS);
    assert.equal(work.client.state, 'online', `the window in use was replaced by the laptop (laptop is ${laptop.client.state})`);
    assert.equal(laptop.client.state, 'asleep', 'the woken window waits on Play here');
    assert.equal(statusText('asleep'), 'This window was asleep');
    assert.equal(ASLEEP_TEXT.note, 'This window was asleep. Play here?');
    assert.ok(ENDED_STATES.has('asleep'), 'shared acts say "You need to be online", not "Reconnecting..."');
    // Nothing reconnects later either.
    await laptop.time.advance(10 * 60 * 1000);
    assert.equal(laptop.client.state, 'asleep');
    assert.equal(work.client.state, 'online');

    // Play here (restart) takes the character back on purpose.
    laptop.client.restart(); await flush(); await flush();
    assert.equal(laptop.client.state, 'online');
    assert.equal(work.client.state, 'replaced');
  });

  it('a socket that closes on wake (no quiet check first) waits on Play here too', async () => {
    const srv = server();
    const laptop = page(srv);
    laptop.client.start(); await flush(); await flush();
    laptop.time.jump(SLEPT_MS + 1000);
    srv.drop(laptop);
    assert.equal(laptop.client.state, 'asleep');
  });

  it('a short blip while the page is in use still reconnects by itself', async () => {
    const srv = server();
    const p = page(srv);
    p.client.start(); await flush(); await flush();
    await p.time.advance(30_000);
    srv.drop(p);
    assert.equal(p.client.state, 'offline');
    await p.time.advance(5_000);
    assert.equal(p.client.state, 'online', 'reconnected after the blip');
  });

  it('a socket gone quiet for under SLEPT_MS (no sleep) still reconnects by itself', async () => {
    const srv = server();
    const p = page(srv);
    p.client.start(); await flush(); await flush();
    srv.live.splice(0); // the server forgot this socket, no close reached the page
    await p.time.advance(QUIET_MS + 25_000);
    assert.equal(p.client.state, 'online', 'the quiet check reconnected');
  });

  it('a line down past SLEPT_MS of silence stops retrying and waits on Play here', async () => {
    const srv = server();
    const p = page(srv);
    p.client.start(); await flush(); await flush();
    srv.down = true; // every new socket closes before it opens
    srv.drop(p);
    await p.time.advance(SLEPT_MS - 40_000);
    assert.equal(p.client.reconnecting, true, 'still retrying inside SLEPT_MS');
    await p.time.advance(60_000);
    assert.equal(p.client.state, 'asleep');
  });

  it('a page shown after being hidden SLEPT_MS probes its socket', () => {
    let t = 0; let probes = 0;
    const doc = { visibilityState: 'visible', l: {}, addEventListener(k, f) { this.l[k] = f; }, removeEventListener() {} };
    const client = { state: 'online', probe() { probes += 1; }, stop() {}, start() {} };
    bindPageLifecycle(client, null, doc, () => t);
    doc.visibilityState = 'hidden'; doc.l.visibilitychange();
    t += 10_000; doc.visibilityState = 'visible'; doc.l.visibilitychange();
    assert.equal(probes, 0, 'a short hide does not probe');
    doc.visibilityState = 'hidden'; doc.l.visibilitychange();
    t += SLEPT_MS; doc.visibilityState = 'visible'; doc.l.visibilitychange();
    assert.equal(probes, 1);
  });
});
