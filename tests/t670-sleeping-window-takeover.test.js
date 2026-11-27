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
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QUIET_MS, SLEPT_MS, bindPageLifecycle, createRealtimeClient } from '../public/js/realtime-client.js?v=eb1515a8';
import { ENDED_STATES } from '../public/js/online-request.js?v=dac938db';
import { ASLEEP_TEXT, statusText } from '../public/js/features/realtime-feature.js?v=5f3320d1';
import { SAVE_ALERT_COPY, saveAlertFor } from '../public/js/online-boot.js?v=a0f37b71';
import { SAVE_CHOICE_EVENT, createMultiplayerSaveStore } from '../public/js/save-store.js?v=1ccb1d6b';

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

// —— #670 (Austin's ruling 2026-11-26): a window that slept offers only "Load the other save" ——
// Its copy is from before the sleep, and keeping it would replace what was played on the other
// device since (harvests, XP, quests). Glitch asked for a reload after 3.5 minutes of silence and
// never offered to keep the old copy (NetController.as 596-603).

function saveTimers() {
  let now = 1_000_000; let id = 0; const due = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { due.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout(t) { due.delete(t); },
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        due.delete(next[0]); now = next[1].at; next[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = until;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

function saveScope() {
  const listeners = {};
  const states = [];
  const scope = {
    states,
    document: { documentElement: { dataset: {} }, visibilityState: 'visible', addEventListener(type, fn) { (listeners[`doc:${type}`] ||= []).push(fn); } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(e) { if (e.type === 'groddle:save-state') states.push(e.detail); (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    fire(type) { (listeners[type] || []).forEach((fn) => fn({ type })); },
    fireDoc(type) { (listeners[`doc:${type}`] || []).forEach((fn) => fn({ type })); },
  };
  return scope;
}

/** The save route as MultiplayerSave.php decides: the page that read the save last writes; others get elsewhere unless they take over. */
function saveSite() {
  const calls = [];
  const row = { version: 3, writer: 'laptop0000000001', seq: 0, data: { entries: { playerState: '{"xp":10}' } } };
  const fn = async (url, init = {}) => {
    const json = JSON.parse(init.body);
    calls.push(json);
    let status = 200; let body;
    if (json.takeover === true || (json.writer === row.writer && json.seq > row.seq)) {
      Object.assign(row, { version: row.version + 1, writer: json.writer, seq: json.seq, data: json.data });
      body = { version: row.version, updatedAt: '2026-11-26T10:00:00Z', ...(json.takeover ? { took: true } : {}) };
    } else {
      status = 409;
      body = { code: 'groddle_save_elsewhere', data: { status: 409, version: row.version, updatedAt: '2026-11-26T09:30:00Z' } };
    }
    return { status, ok: status === 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  /** The player opens the character on the other device and plays: it reads (claims) and saves more. */
  const otherDevicePlays = () => Object.assign(row, { version: row.version + 1, writer: 'phone00000000002', seq: 1, data: { entries: { playerState: '{"xp":250}' } } });
  return { fn, calls, row, otherDevicePlays };
}

const SAVE_BOOT = Object.freeze({
  saveUrl: 'https://groddle.localhost/wp-json/groddle/v1/save',
  nonce: 'aaaaaaaaaa',
  version: 3,
  writer: 'laptop0000000001',
  updatedAt: '2026-11-26T09:00:00Z',
  entries: { playerState: '{"xp":10}' },
  player: { id: 7, name: 'Tester' },
});

/** The laptop's page: the other device plays while it sleeps, and on waking its next write is refused. */
async function laptopPage({ sleptFirst = false, sleeps = true } = {}) {
  const site = saveSite();
  const timers = saveTimers();
  const scope = saveScope();
  const reloads = [];
  scope.location = { reload: () => reloads.push('reload') };
  const store = createMultiplayerSaveStore({ boot: SAVE_BOOT, scope, fetch: site.fn, timers, now: timers.now, debounceMs: 2000, maxWaitMs: 10000 });
  site.otherDevicePlays();
  // The realtime client's 'asleep' (realtime-feature.js tells the store) can come before or after the refused write.
  if (sleeps && sleptFirst) store.windowSlept();
  store.set('playerState', '{"xp":12}');
  await timers.tick(2000);
  assert.equal(store.state, 'elsewhere');
  if (sleeps && !sleptFirst) store.windowSlept();
  return { site, timers, scope, store, reloads };
}

describe('#670: a window that slept offers only "Load the other save"', () => {
  it('the save card: after a sleep, Load the other save and no Keep', () => {
    for (const state of ['elsewhere', 'conflict']) {
      const card = saveAlertFor(state, { slept: true, confirmedAt: '2026-11-26T09:00:00Z', otherUpdatedAt: '2026-11-26T09:30:00Z' });
      assert.deepEqual(card.buttons, [['load', SAVE_ALERT_COPY.load]], `${state}: only the stored save`);
      assert.equal(card.body, SAVE_ALERT_COPY.asleepBody);
      assert.ok(!card.lines.includes(SAVE_ALERT_COPY.keepNote), 'no word about keeping this window');
      assert.equal(card.title, SAVE_ALERT_COPY[state].title);
    }
    assert.equal(SAVE_ALERT_COPY.asleepBody, 'This window was asleep, so it loads your saved game.');
    assert.doesNotMatch(SAVE_ALERT_COPY.asleepBody, /—/);
  });

  it('a window that did not sleep (a short drop) keeps both choices', () => {
    const card = saveAlertFor('elsewhere', { confirmedAt: '2026-11-26T09:00:00Z' });
    assert.deepEqual(card.buttons.map(([c]) => c), ['load', 'keep']);
    assert.ok(card.lines.includes(SAVE_ALERT_COPY.keepNote));
    // Another tab of this browser took over: Play here, as before, slept or not.
    assert.deepEqual(saveAlertFor('elsewhere', { by: 'window', slept: true }).buttons, [['load', SAVE_ALERT_COPY.here]]);
  });

  it('the store says slept on the card it shows, whichever came first', async () => {
    for (const sleptFirst of [false, true]) {
      const { scope } = await laptopPage({ sleptFirst });
      const last = scope.states.at(-1);
      assert.equal(last.state, 'elsewhere');
      assert.equal(last.slept, true, `slept ${sleptFirst ? 'before' : 'after'} the refused write: the card hears it`);
      assert.deepEqual(saveAlertFor(last.state, last).buttons.map(([c]) => c), ['load']);
    }
  });

  it('Keep from a slept window writes nothing over the other device\'s save', async () => {
    const { site, timers, scope, store } = await laptopPage();
    const sent = site.calls.length;
    scope.dispatchEvent(new scope.CustomEvent(SAVE_CHOICE_EVENT, { detail: { choice: 'keep' } }));
    await store.takeover();
    await timers.tick(20000);
    assert.equal(site.calls.length, sent, 'no takeover went out');
    assert.equal(site.row.data.entries.playerState, '{"xp":250}', 'the other device\'s progress stays');
    assert.equal(store.slept, true);
  });

  it('Play here (a reload) loads the stored save: the page going writes no takeover', async () => {
    const { site, timers, scope, store } = await laptopPage();
    store.set('playerState', '{"xp":13}');
    // Play here: client.stop() and location.reload(); the page goes (visibility hidden, pagehide).
    scope.document.visibilityState = 'hidden';
    scope.fireDoc('visibilitychange');
    scope.fire('pagehide');
    await timers.tick(0);
    assert.ok(site.calls.every((c) => c.takeover !== true), 'nothing took the save back');
    assert.equal(site.row.data.entries.playerState, '{"xp":250}', 'the reload reads the other device\'s save');
    const feature = readFileSync(new URL('../public/js/features/realtime-feature.js', import.meta.url), 'utf8');
    assert.match(feature, /hereBtn\.addEventListener\('click', \(\) => \{\n {4}client\.stop\(\);\n {4}location\.reload\(\);\n {2}\}\);/, 'Play here reloads, nothing else');
    assert.match(feature, /if \(state === 'asleep'\) \{[^}]*saveStore\.windowSlept\?\.\(\);/, 'the asleep state tells the save store');
  });

  it('a short drop (no sleep) can still keep this window\'s game', async () => {
    const { site, timers, scope } = await laptopPage({ sleeps: false });
    scope.dispatchEvent(new scope.CustomEvent(SAVE_CHOICE_EVENT, { detail: { choice: 'keep' } }));
    await timers.tick(0);
    assert.equal(site.calls.at(-1).takeover, true);
    assert.equal(site.row.data.entries.playerState, '{"xp":12}');
  });
});
