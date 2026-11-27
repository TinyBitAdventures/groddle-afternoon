/**
 * #676 (a phone whose connection died): "Hold on, still asking the street." stayed up while a dig's
 * request waited for an answer that could not come (up to the answer's whole wait, online-request.js
 * answerWaitMs), and the page noticed the dead socket only after QUIET_MS (50 s) of silence.
 * Austin's ruling (2026-11-25): a request 3 s with no answer sends a ping; no frame back within a short
 * timeout drops the socket and connects again at once, and the words say "Reconnecting..." in place of
 * the busy line. Requests in flight end as failed (never sent again), so a dig is never asked twice.
 * Gardens and Patches use the same wait and get the same.
 * Run: node --test tests/reconnect-probe-676.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLOSE_QUIET, PROBE_TIMEOUT_MS, QUIET_MS, createRealtimeClient } from '../public/js/realtime-client.js?v=eb1515a8';
import { PROBE_AFTER_MS, RECONNECTING_LINE, createOnlineRequests, waitLine } from '../public/js/online-request.js?v=5fa7a635';
import { COPY } from '../public/js/street-objects.js?v=fcc07592';
import { streetObjectsFeature } from '../public/js/features/street-objects-feature.js?v=a9c9fed2';
import { createTrantState } from '../public/js/trants.js?v=cf0fe1a3';

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

async function onlineClient() {
  const time = fakeTime();
  const sockets = fakeSockets();
  const asked = [];
  const ticket = async () => {
    asked.push(time.now());
    return { ticket: `t${asked.length}`, path: '/ws' };
  };
  const client = createRealtimeClient({ ticket, baseUri: 'https://groddle.localhost/play/online/', WebSocket: sockets.WebSocket, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, now: time.now, random: () => 0.5 });
  const states = [];
  client.on('state', (d) => states.push(d));
  client.start();
  await flush();
  const ws = sockets.last();
  ws.open();
  ws.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
  return { time, sockets, asked, client, states, ws };
}

describe('#676: the realtime client finds a dead socket in seconds', () => {
  it('a probe with no frame back drops the socket and connects again at once', async () => {
    const c = await onlineClient();
    assert.equal(c.client.reconnecting, false);
    assert.equal(c.client.probe(), true);
    assert.equal(c.ws.sent.at(-1).t, 'ping');
    assert.equal(c.client.probing, true);
    await c.time.advance(PROBE_TIMEOUT_MS - 1);
    assert.equal(c.client.state, 'online', 'not yet');
    await c.time.advance(1);
    assert.deepEqual(c.ws.closedWith, { code: CLOSE_QUIET, reason: 'no pong' });
    assert.ok(PROBE_TIMEOUT_MS + PROBE_AFTER_MS < 10_000 && 10_000 < QUIET_MS, 'seconds, not the 50 s quiet');
    assert.equal(c.states.find((s) => s.state === 'offline')?.reconnecting, true);
    // At once: a new ticket and socket with no backoff wait.
    assert.equal(c.asked.length, 2);
    assert.equal(c.asked[1], c.asked[0] + PROBE_TIMEOUT_MS);
    assert.equal(c.client.state, 'connecting');
    assert.equal(c.client.reconnecting, true);
    const ws2 = c.sockets.last();
    assert.notEqual(ws2, c.ws);
    ws2.open();
    ws2.receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    assert.equal(c.client.state, 'online');
    assert.equal(c.client.reconnecting, false);
  });
  it('a pong keeps the socket; one probe at a time', async () => {
    const c = await onlineClient();
    c.client.probe();
    c.client.probe();
    assert.equal(c.ws.sent.filter((m) => m.t === 'ping').length, 1);
    c.ws.receive({ t: 'pong' });
    await c.time.advance(PROBE_TIMEOUT_MS + 10);
    assert.equal(c.ws.closedWith, null);
    assert.equal(c.client.state, 'online');
    assert.equal(c.client.probing, false);
  });
  it('a ping that cannot go out drops the socket now; offline there is nothing to probe', async () => {
    const c = await onlineClient();
    c.ws.readyState = 3;
    assert.equal(c.client.probe(), true);
    assert.equal(c.client.reconnecting, true);
    await c.time.advance(0);
    assert.equal(c.asked.length, 2);
    assert.equal(c.client.probe(), false, 'connecting: no probe');
  });
});

describe('#676: a request 3 s without an answer asks for a probe', () => {
  it('once per request, at PROBE_AFTER_MS, never for one sent from a street left', () => {
    let t = 1000;
    let probes = 0;
    const reqs = createOnlineRequests({ now: () => t, waitMs: () => 30_000, probe: () => { probes += 1; } });
    reqs.open(1, { id: 'rock:0' });
    reqs.send(1, () => true);
    t = 1000 + PROBE_AFTER_MS - 1;
    reqs.expire();
    assert.equal(probes, 0);
    t = 1000 + PROBE_AFTER_MS;
    reqs.expire();
    reqs.expire();
    assert.equal(probes, 1);
    reqs.open(2, { id: 'rock:1' });
    reqs.send(2, () => true);
    reqs.leave();
    t += PROBE_AFTER_MS;
    reqs.expire();
    assert.equal(probes, 1, 'the street was left');
  });
  it('the words: "Reconnecting..." while the client connects again, the line as given otherwise', () => {
    assert.equal(RECONNECTING_LINE, 'Reconnecting...');
    assert.equal(waitLine({ reconnecting: true }, COPY.busy), 'Reconnecting...');
    assert.equal(waitLine({ reconnecting: false }, COPY.busy), 'Hold on, still asking the street.');
    assert.equal(waitLine(null, COPY.connecting), COPY.connecting);
  });
});

function rig() {
  const sent = [];
  const listeners = new Map();
  let probes = 0;
  const client = {
    state: 'online',
    wanted: 'GSTREET',
    street: 'GSTREET',
    reconnecting: false,
    probe() { probes += 1; return true; },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {};
    },
    send(kind, payload = {}) {
      if (this.state !== 'online') return false;
      sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
  };
  const tree = createTrantState('trant_fruit', { maturity: 10, health: 7 });
  const treeT = { classId: 'trant_fruit', label: 'Fruit Tree', state: tree, treeIndex: 0 };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GSTREET',
    inv: { watering_can: 1 },
    pc: { energy: 200, imaginationUpgrades: [] },
    learnedSkills: [],
    toolState: null,
    interactables: [treeT],
    data: {},
    toasts: [],
    activeBuffIds: () => [],
    setData(k, v) { this.data[k] = String(v); },
    toast(line) { this.toasts.push(line); },
    pushActivity() {},
    playSound() {},
    say() {},
    refreshVerbMenu() {},
    query(hook) { return hook === 'realtimeClient' ? client : null; },
    executeVerb() {},
  };
  streetObjectsFeature._reset();
  streetObjectsFeature.onTick(16, 0, engine);
  client.emit('roster', { street: 'GSTREET', players: [] });
  client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
  streetObjectsFeature.onTick(16, 0, engine);
  return { engine, client, sent, treeT, probes: () => probes };
}

describe('#676: a street object waiting on a dead socket', () => {
  it('probes at 3 s, says "Reconnecting..." when the socket drops, and never sends the act again', () => {
    const r = rig();
    const realNow = Date.now;
    try {
      assert.equal(streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine), true);
      const acts = () => r.sent.filter((m) => m.t === 'obj_act');
      assert.equal(acts().length, 1);
      // A second tap while it waits: the busy line (the socket is not known dead yet).
      streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine);
      assert.equal(r.engine.toasts.at(-1), COPY.busy);
      streetObjectsFeature.onTick(16, 0, r.engine);
      assert.equal(r.probes(), 0, 'not before 3 s');
      const t0 = realNow();
      Date.now = () => t0 + PROBE_AFTER_MS + 50;
      streetObjectsFeature.onTick(16, 0, r.engine);
      assert.equal(r.probes(), 1, 'a probe at 3 s');
      // The probe found the socket dead: offline, connecting again at once.
      r.client.state = 'offline';
      r.client.reconnecting = true;
      r.client.emit('state', { state: 'offline', reconnecting: true });
      assert.equal(r.engine.toasts.at(-1), 'Reconnecting...');
      assert.equal(streetObjectsFeature.decorateVerbs(r.treeT, [{ id: 'water', enabled: true }], r.engine), null, 'the request let go: nothing greyed');
      // A tap while it reconnects says so.
      streetObjectsFeature.runVerbOverride(r.treeT, 'water', r.engine);
      assert.equal(r.engine.toasts.at(-1), 'Reconnecting...');
      // Back online: the street syncs, and the act that had no answer is not sent again.
      r.client.state = 'online';
      r.client.reconnecting = false;
      r.client.emit('state', { state: 'online' });
      r.client.emit('roster', { street: 'GSTREET', players: [] });
      r.client.emit('msg:objs', { t: 'objs', street: 'GSTREET', snap: true, objs: [] });
      Date.now = () => t0 + 60_000;
      streetObjectsFeature.onTick(16, 0, r.engine);
      assert.equal(acts().length, 1, 'no second dig');
    } finally {
      Date.now = realNow;
    }
  });
  it('gardens and Patches probe on the same wait and say "Reconnecting..." too', () => {
    for (const f of ['shared-gardens-feature', 'shared-patches-feature', 'street-objects-feature']) {
      const src = read(`public/js/features/${f}.js`);
      assert.match(src, /createOnlineRequests\(\{ waitMs: \(\) => answerWaitMs\(client\), probe: \(\) => client\?\.probe\?\.\(\) \}\)/, f);
      assert.match(src, /!ENDED_STATES\.has\(state\)\) engine\.toast\?\.\(waitLine\(c, COPY\.timeout\), 2400\)/, f);
      assert.doesNotMatch(src, /engine\.toast\?\.\(COPY\.(connecting|busy|waiting),/, `${f}: every wait line goes through waitLine`);
    }
  });
});
