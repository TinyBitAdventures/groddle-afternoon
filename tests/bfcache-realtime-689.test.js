/**
 * Report #689 (desktop Chrome, 1352x802, a house Tower floor): twice in a day the player refuelled a
 * machine and loaded planks into a Woodworker, the game seemed to take it, and nothing happened;
 * signing out and in fixed it. features/realtime-feature.js stopped the realtime client on pagehide
 * and nothing started it again: desktop Chrome brings the page back from its back/forward cache
 * (pageshow with persisted), still playing and saving, with the client 'stopped' (the live journal:
 * two windows of 1.5 h saving with the socket closed). Every shared act was refused offline, and
 * the Make panel closed as if a home machine's job had started (startJob said yes before it sent).
 * Now (R25, the page lifecycle): realtime-client.js bindPageLifecycle starts the client again on
 * that pageshow, the way a first connect does (the Make panel: tests/machine-make-offline-689.test.js).
 * Glitch: not applicable (the Flash client).
 * Run: node --test tests/bfcache-realtime-689.test.js
 */
import assert from 'node:assert/strict';
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { PAGE_RETURN_STATES, bindPageLifecycle, createRealtimeClient } from '../public/js/realtime-client.js?v=eb1515a8';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

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
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(msg) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
  }
  return { WebSocket: FakeSocket, made, last: () => made[made.length - 1] };
}

/** A window and a document as far as the lifecycle needs: events with `persisted`. */
function fakePage() {
  const win = new EventTarget();
  const doc = new EventTarget();
  const fire = (target, type, extra = {}) => target.dispatchEvent(Object.assign(new Event(type), extra));
  return { win, doc, hide: (persisted = true) => fire(win, 'pagehide', { persisted }), show: (persisted) => fire(win, 'pageshow', { persisted }), resume: () => fire(doc, 'resume') };
}

async function onlineClient() {
  const time = fakeTime();
  const sockets = fakeSockets();
  const asked = [];
  const ticket = async () => {
    asked.push(time.now());
    return { ticket: `t${asked.length}`, path: '/ws' };
  };
  const client = createRealtimeClient({ ticket, baseUri: 'https://groddle.localhost/play/online/', WebSocket: sockets.WebSocket, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, now: time.now, random: () => 0.5 });
  const hellos = [];
  client.on('hello', (me) => hellos.push(me));
  const page = fakePage();
  bindPageLifecycle(client, page.win, page.doc);
  client.start();
  await flush();
  const ws = sockets.last();
  ws.open();
  ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
  client.join({ street: 'GLI32N0F1UD114O', x: 100, y: -50 });
  return { time, sockets, asked, client, hellos, page, ws };
}

describe('#689: a page the back/forward cache brings back connects again', () => {
  it('pagehide says leave and stops; pageshow (persisted) gets a new ticket, the socket, hello and the street again', async () => {
    const c = await onlineClient();
    assert.equal(c.ws.sent.at(-1).t, 'join');
    c.page.hide();
    assert.equal(c.client.state, 'stopped');
    assert.equal(c.ws.sent.at(-1).t, 'leave', 'the street hears you go');
    assert.equal(c.ws.closedWith.code, 1000);
    // Back: the same page, still playing.
    c.page.show(true);
    await flush();
    assert.equal(c.client.state, 'connecting', 'connecting again, not stopped');
    assert.equal(c.asked.length, 2, 'a fresh ticket (single use)');
    const ws2 = c.sockets.last();
    assert.notEqual(ws2, c.ws);
    ws2.open();
    assert.deepEqual(ws2.sent[0], { t: 'auth', ticket: 't2' });
    ws2.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(c.client.state, 'online');
    assert.equal(c.hellos.length, 2, 'every system hears hello again and re-syncs, as after a dropped socket');
    const join = ws2.sent.find((m) => m.t === 'join');
    assert.equal(join?.street, 'GLI32N0F1UD114O', 'the street wanted is joined again');
    assert.equal(c.client.send('home_machine', { verb: 'use' }), true, 'shared acts go again');
  });

  it('a page that left offline or connecting comes back trying too', async () => {
    for (const st of ['offline', 'connecting', 'idle']) assert.ok(PAGE_RETURN_STATES.has(st), st);
    const c = await onlineClient();
    c.ws.onclose({ code: 1006 });
    assert.equal(c.client.state, 'offline');
    c.page.hide();
    c.page.show(true);
    await flush();
    assert.equal(c.client.state, 'connecting');
  });

  it('a fresh load (not persisted) and a page that left replaced or booted stay as they were', async () => {
    const c = await onlineClient();
    c.page.show(false);
    assert.equal(c.client.state, 'online', 'a first pageshow changes nothing');
    c.ws.onclose({ code: 4001 });
    assert.equal(c.client.state, 'replaced');
    c.page.hide();
    c.page.show(true);
    await flush();
    assert.equal(c.client.state, 'stopped', 'never takes the character back from the other window by itself');
    assert.equal(c.asked.length, 1);
    const d = await onlineClient();
    d.ws.onclose({ code: 4010 });
    d.page.hide();
    d.page.show(true);
    await flush();
    assert.equal(d.client.state, 'stopped', 'booted stays signed out');
  });

  it("Chrome's resume (after a freeze) probes the socket", async () => {
    const c = await onlineClient();
    const pings = () => c.ws.sent.filter((m) => m.t === 'ping').length;
    c.page.resume();
    assert.equal(pings(), 1);
    assert.equal(c.client.probing, true);
  });

  it('the realtime feature binds the lifecycle (no bare pagehide stop)', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /bindPageLifecycle\(client, window, document\);/);
    assert.ok(!/addEventListener\('pagehide', \(\) => client\.stop\(\)\)/.test(src));
  });
});

// —— In Chrome, with its back/forward cache on (Playwright turns it off by default) ——

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const PAGE = `<!doctype html><meta charset=utf-8><title>game</title><a id=away href="/other.html">away</a>
<script type=module>
import { bindPageLifecycle, createRealtimeClient } from '/js/realtime-client.js';
// A socket in the page that opens and says hello (an open real socket keeps a page out of the cache).
window.made = [];
class PageSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; window.made.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 10); }
  send(data) { const m = JSON.parse(data); this.sent.push(m); if (m.t === 'auth') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ t: 'hello', you: { id: 7, name: 'Ada' } }) }), 10); }
  close() { this.readyState = 3; }
}
let n = 0;
const client = createRealtimeClient({ ticket: async () => ({ ticket: 't' + (++n), path: '/ws' }), baseUri: location.href, WebSocket: PageSocket });
bindPageLifecycle(client, window, document);
client.start();
window.addEventListener('pageshow', (e) => { window.restored = e.persisted; });
window.rt = () => ({ state: client.state, sockets: window.made.length, tickets: n });
</script>`;

describe('#689 in Chrome: Back from the back/forward cache, the client is online again', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let browser = null;
  let lock = null;
  beforeAll(async () => {
    const { acquireLock } = await import('../tools/qa/browser-lock.mjs');
    const { browserArgs } = await import('../tools/qa/browser.mjs');
    lock = await acquireLock({ label: 'bfcache-realtime-689 test', waitMs: LOCK_WAIT_MS });
    try {
      browser = await chromium.launch({ channel: process.env.GRODDLE_BROWSER_CHANNEL ?? 'chrome', headless: true, args: browserArgs(), ignoreDefaultArgs: ['--disable-back-forward-cache'] });
    } catch (e) {
      lock.release();
      lock = null;
      throw e;
    }
    const js = join(root, 'public/js');
    server = createServer((req, res) => {
      const path = req.url.split('?')[0];
      if (path.startsWith('/js/')) {
        try { res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(readFileSync(join(js, path.slice(4)))); } catch { res.writeHead(404).end(); }
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(path === '/other.html' ? '<!doctype html><title>Encyclopedia</title>other' : PAGE);
    }).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await browser?.close().catch(() => {});
    lock?.release();
    server?.close();
  });

  it('away and Back: restored from the cache, a second ticket and socket, online', { timeout: 60_000 }, async () => {
    const page = await (await browser.newContext({ viewport: { width: 1352, height: 802 } })).newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.rt?.().state === 'online');
    await page.click('#away');
    await page.waitForURL(/other\.html/);
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction(() => typeof window.rt === 'function');
    await page.waitForFunction(() => window.rt().state === 'online', null, { timeout: 5000 }).catch(() => {});
    const restored = await page.evaluate(() => window.restored);
    const after = await page.evaluate(() => window.rt());
    assert.equal(restored, true, 'Chrome restored the page from the back/forward cache');
    assert.deepEqual(after, { state: 'online', sockets: 2, tickets: 2 });
  });
});
