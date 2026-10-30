/**
 * The save interface (js/save-store.js): solo saves keep the exact
 * localStorage keys the game has always written and the browser store
 * round-trips raw strings untouched (phase 1); the multiplayer store serves
 * the save from memory and writes it back to Minn in the background, never
 * touching localStorage, and solo backups snapshot and restore a solo save
 * only (phase 2).
 */
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import {
  MULTIPLAYER_SAVE_KIND,
  MULTIPLAYER_SAVE_UNAVAILABLE,
  SAVE_ENTRY_NAMES,
  SAVE_FORMAT,
  SAVE_KEYS,
  SAVE_STATES,
  SOLO_SAVE_KIND,
  createBrowserSaveStore,
  createMultiplayerSaveStore,
  createSaveStore,
  createSaveSync,
  freezeSoloSaves,
  restoreSoloSave,
  saveStore,
  savedAtOf,
  soloSaveSnapshot,
} from '../public/js/save-store.js?v=mp2-1';
import { AUDIO_MUTED_KEY } from '../public/js/audio-pref.js?v=g465-1';
import { STORAGE_KEY as APPEARANCE_KEY, APPEARANCE_PRESETS, appearanceToJson, loadAppearance, saveAppearance } from '../public/js/character-builder.js';
import { getGameDayKey, getLastNewDayKey, getLastNewDayTs, resetGameDayClock, setLastNewDayTs } from '../public/js/game-day.js?v=dametime-3';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=g424-1';

const pub = join(import.meta.dirname, '..', 'public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');

const memoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
};

const realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function useLocalStorage(storage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  return storage;
}
afterEach(() => {
  if (realLocalStorage) Object.defineProperty(globalThis, 'localStorage', realLocalStorage);
  else delete globalThis.localStorage;
});

describe('save-store keys', () => {
  it('keeps every key the game wrote before the save interface (HEAD 600db87d)', () => {
    // game.js 6701, 9337-9341; game-day.js 28-29; character-builder.js 41 at 600db87d.
    assert.deepEqual({ ...SAVE_KEYS }, {
      playerState: 'groddle_player_state_v1',
      location: 'groddle_player_location',
      droppedItems: 'groddle_dropped_items_v1',
      companions: 'groddle:companions',
      lastNewDayTs: 'groddle_last_new_day_ts',
      lastNewDayKey: 'groddle_last_new_day_key',
      appearance: 'groddle.avatar.appearance.v1',
    });
    assert.ok(Object.isFrozen(SAVE_KEYS));
    assert.deepEqual(SAVE_ENTRY_NAMES, Object.keys(SAVE_KEYS));
    assert.equal(APPEARANCE_KEY, SAVE_KEYS.appearance, 'character-builder exports the same look key');
  });

  it('leaves device preferences out of the save', () => {
    const keys = Object.values(SAVE_KEYS);
    assert.ok(!keys.includes(AUDIO_MUTED_KEY), 'mute is a device preference');
    assert.ok(!keys.includes('groddle-compare-theme'), 'the /compare/ theme is a page preference');
  });

  it('practice copies read the look through by the save-store key', () => {
    const src = read('js/practice-mode.js');
    const set = src.match(/READ_THROUGH = new Set\(\[([^\]]+)\]\)/)[1];
    assert.ok(set.includes(`'${SAVE_KEYS.appearance}'`));
    assert.ok(set.includes(`'${AUDIO_MUTED_KEY}'`));
  });
});

describe('browser save store', () => {
  it('round-trips raw strings under the legacy keys', () => {
    const storage = memoryStorage();
    const store = createBrowserSaveStore({ storage });
    assert.equal(store.kind, 'browser');
    for (const name of SAVE_ENTRY_NAMES) {
      assert.equal(store.get(name), null);
      const raw = `{"entry":"${name}","n":1}`;
      store.set(name, raw);
      assert.equal(storage.map.get(SAVE_KEYS[name]), raw, `${name} writes ${SAVE_KEYS[name]}`);
      assert.equal(store.get(name), raw);
    }
    assert.equal(storage.map.size, SAVE_ENTRY_NAMES.length);
    store.remove('droppedItems');
    assert.equal(storage.map.has('groddle_dropped_items_v1'), false);
    assert.equal(store.get('droppedItems'), null);
    store.set('companions', 1);
    assert.equal(storage.map.get('groddle:companions'), '1', 'values are stored as strings');
  });

  it('refuses unknown entry names', () => {
    const store = createBrowserSaveStore({ storage: memoryStorage() });
    assert.throws(() => store.get('groddle_player_state_v1'), /Unknown save entry/);
    assert.throws(() => store.set('toString', 'x'), /Unknown save entry/);
  });

  it('reads globalThis.localStorage on every call (practice swaps it)', () => {
    const first = useLocalStorage(memoryStorage({ groddle_player_location: 'A' }));
    assert.equal(saveStore.kind, 'browser', 'node and /play/ are solo');
    assert.equal(saveStore.get('location'), 'A');
    const second = useLocalStorage(memoryStorage({ groddle_player_location: 'B' }));
    assert.equal(saveStore.get('location'), 'B');
    saveStore.set('location', 'C');
    assert.equal(second.map.get('groddle_player_location'), 'C');
    assert.equal(first.map.get('groddle_player_location'), 'A');
  });

  it('passes storage errors through like localStorage did', () => {
    const store = createBrowserSaveStore({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() {} } });
    assert.throws(() => store.get('playerState'), /blocked/);
    assert.throws(() => store.set('playerState', 'x'), /quota/);
  });

  it('loads a save written by the old direct-localStorage code untouched', () => {
    // What game.js savePlayerState wrote before the save interface: serializePlayerSave(...) under the raw key.
    const legacy = memoryStorage();
    const snapshot = createPlayerSave({
      inventory: { slots: [] },
      player: { energy: 77, mood: 66, currants: 1234, img: 5000, level: 6 },
      systems: {},
      world: { streets: {} },
      savedAt: 1_760_000_000_000,
    });
    const raw = serializePlayerSave(snapshot);
    legacy.setItem('groddle_player_state_v1', raw);
    legacy.setItem('groddle_player_location', JSON.stringify({ tsid: 'GLI2V0UN7RD1T2J', x: 812, y: -97, savedAt: 1 }));
    legacy.setItem('groddle_last_new_day_key', getGameDayKey(1_760_000_000_000));
    legacy.setItem('groddle_last_new_day_ts', '1760000000000');
    legacy.setItem(APPEARANCE_KEY, appearanceToJson(APPEARANCE_PRESETS.costume_rook.appearance));
    const before = new Map(legacy.map);
    useLocalStorage(legacy);

    assert.equal(saveStore.get('playerState'), raw, 'byte-identical');
    assert.deepEqual(parsePlayerSave(saveStore.get('playerState')), parsePlayerSave(raw));
    assert.equal(parsePlayerSave(saveStore.get('playerState')).player.currants, 1234);
    assert.deepEqual(JSON.parse(saveStore.get('location')), { tsid: 'GLI2V0UN7RD1T2J', x: 812, y: -97, savedAt: 1 });
    assert.equal(getLastNewDayKey(), getGameDayKey(1_760_000_000_000));
    assert.equal(getLastNewDayTs(), 1_760_000_000_000);
    assert.deepEqual(loadAppearance().vector, APPEARANCE_PRESETS.costume_rook.appearance.vector);
    assert.deepEqual(legacy.map, before, 'loading wrote nothing: no migration');
  });

  it('game-day and the look write through the store under the legacy keys', () => {
    const storage = useLocalStorage(memoryStorage());
    setLastNewDayTs(1_760_000_000_000);
    assert.equal(storage.map.get('groddle_last_new_day_ts'), '1760000000000');
    assert.equal(storage.map.get('groddle_last_new_day_key'), getGameDayKey(1_760_000_000_000));
    resetGameDayClock();
    assert.equal(storage.map.has('groddle_last_new_day_ts'), false);
    assert.equal(storage.map.has('groddle_last_new_day_key'), false);
    saveAppearance(APPEARANCE_PRESETS.costume_rook.appearance);
    assert.equal(storage.map.get('groddle.avatar.appearance.v1'), appearanceToJson(APPEARANCE_PRESETS.costume_rook.appearance));
  });
});

describe('multiplayer save store without a loaded save', () => {
  it('refuses every call with "not available yet"', () => {
    const store = createMultiplayerSaveStore({ boot: null });
    assert.equal(store.kind, 'multiplayer');
    assert.equal(store.ready, false);
    assert.equal(MULTIPLAYER_SAVE_UNAVAILABLE, 'Multiplayer saves are not available yet');
    for (const name of SAVE_ENTRY_NAMES) {
      assert.throws(() => store.get(name), /not available yet/);
      assert.throws(() => store.set(name, 'x'), /not available yet/);
      assert.throws(() => store.remove(name), /not available yet/);
    }
    assert.throws(() => store.get('nope'), /Unknown save entry/);
  });

  it('is what createSaveStore picks for multiplayer, and never touches localStorage', () => {
    const storage = useLocalStorage(memoryStorage({ groddle_player_state_v1: 'SOLO' }));
    assert.equal(createSaveStore('multiplayer', { boot: null }).kind, 'multiplayer');
    assert.equal(createSaveStore('solo').kind, 'browser');
    assert.equal(createSaveStore('anything').kind, 'browser');
    assert.throws(() => createSaveStore('multiplayer', { boot: null }).set('playerState', 'MP'));
    assert.throws(() => createSaveStore('multiplayer', { boot: {} }).get('playerState'), /not available yet/, 'boot data without a save URL is no save');
    assert.equal(storage.map.get('groddle_player_state_v1'), 'SOLO', 'a solo save never goes online');
  });
});

/** A fetch that records requests and answers from a queue of { status, body, nonce } (or throws for 'network'). */
function fakeFetch(answers = []) {
  const calls = [];
  const queue = [...answers];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, json: init.body ? JSON.parse(init.body) : null });
    const next = queue.length ? queue.shift() : { status: 200, body: { version: (calls.at(-1).json?.version ?? 0) + 1 } };
    if (next === 'network') throw new TypeError('Failed to fetch');
    const headers = new Map(next.nonce ? [['x-wp-nonce', next.nonce]] : []);
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      json: async () => next.body,
      text: async () => (typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
    };
  };
  return { fn, calls, queue };
}

/** Timers driven by hand: tick(ms) runs what came due. */
function fakeTimers() {
  let now = 1_000_000;
  let id = 0;
  const due = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { due.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout(t) { due.delete(t); },
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = until;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    get pending() { return due.size; },
  };
}

function eventScope() {
  const listeners = {};
  const states = [];
  const scope = {
    document: { documentElement: { dataset: {} }, visibilityState: 'visible', addEventListener(type, fn) { (listeners[`doc:${type}`] ||= []).push(fn); } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(e) { if (e.type === 'groddle:save-state') states.push(e.detail.state); (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    fire(type) { (listeners[type] || []).forEach((fn) => fn({ type })); },
  };
  return { scope, states, listeners };
}

const BOOT = Object.freeze({
  saveUrl: 'https://groddle.localhost/wp-json/groddle/v1/save',
  nonceUrl: 'https://groddle.localhost/wp-admin/admin-ajax.php?action=rest-nonce',
  nonce: 'aaaaaaaaaa',
  version: 4,
  entries: { playerState: '{"savedAt":5}', location: '{"tsid":"LIF12PMQ5121D68"}', nope: 'dropped', appearance: 7 },
  player: { id: 3, name: 'Tester' },
});

describe('multiplayer save store (phase 2)', () => {
  const make = (answers, extra = {}) => {
    const fetch = fakeFetch(answers);
    const timers = fakeTimers();
    const { scope, states } = eventScope();
    const store = createMultiplayerSaveStore({ boot: BOOT, scope, fetch: fetch.fn, timers, now: timers.now, debounceMs: 2000, maxWaitMs: 10000, ...extra });
    return { store, fetch, timers, scope, states };
  };

  it('serves the loaded save from memory, known string entries only', () => {
    const { store, fetch } = make();
    assert.equal(store.ready, true);
    assert.equal(store.get('playerState'), '{"savedAt":5}');
    assert.equal(store.get('location'), '{"tsid":"LIF12PMQ5121D68"}');
    assert.equal(store.get('appearance'), null, 'a non-string entry is not loaded');
    assert.equal(store.get('droppedItems'), null);
    assert.throws(() => store.get('nope'), /Unknown save entry/);
    assert.deepEqual(Object.keys(store.snapshot()).sort(), ['location', 'playerState']);
    assert.equal(store.player.name, 'Tester');
    assert.equal(fetch.calls.length, 0, 'reading writes nothing');
  });

  it('never reads or writes localStorage', () => {
    const storage = useLocalStorage(memoryStorage({ groddle_player_state_v1: 'SOLO', groddle_player_location: 'SOLO-LOC' }));
    const { store } = make();
    assert.equal(store.get('playerState'), '{"savedAt":5}');
    store.set('playerState', 'MP');
    store.remove('location');
    assert.deepEqual(Object.fromEntries(storage.map), { groddle_player_state_v1: 'SOLO', groddle_player_location: 'SOLO-LOC' });
  });

  it('writes the whole save back once changes settle, naming the version it was made from', async () => {
    const { store, fetch, timers, states } = make();
    store.set('playerState', '{"savedAt":6}');
    store.set('location', '{"tsid":"B"}');
    store.set('location', '{"tsid":"B"}');
    assert.equal(store.state, 'pending');
    await timers.tick(1999);
    assert.equal(fetch.calls.length, 0, 'debounced');
    await timers.tick(1);
    assert.equal(fetch.calls.length, 1);
    const put = fetch.calls[0];
    assert.equal(put.url, BOOT.saveUrl);
    assert.equal(put.method, 'PUT');
    assert.equal(put.credentials, 'same-origin');
    assert.equal(put.headers['X-WP-Nonce'], 'aaaaaaaaaa');
    assert.deepEqual(put.json, { version: 4, data: { kind: MULTIPLAYER_SAVE_KIND, format: SAVE_FORMAT, entries: { playerState: '{"savedAt":6}', location: '{"tsid":"B"}' } } });
    assert.equal(store.state, 'saved');
    assert.equal(store.version, 5);
    assert.deepEqual(states, ['pending', 'saving', 'saved']);
    store.set('location', '{"tsid":"B"}');
    await timers.tick(5000);
    assert.equal(fetch.calls.length, 1, 'an unchanged value is no change');
  });

  it('a steady stream of changes still writes within maxWaitMs', async () => {
    const { store, fetch, timers } = make();
    for (let i = 0; i < 12; i++) {
      store.set('location', `{"x":${i}}`);
      await timers.tick(1000);
    }
    assert.ok(fetch.calls.length >= 1, 'written while changes kept coming');
    assert.ok(fetch.calls.length <= 2);
  });

  it('keeps the newest nonce the server hands back', async () => {
    const { store, fetch, timers } = make([{ status: 200, body: { version: 5 }, nonce: 'bbbbbbbbbb' }]);
    store.set('location', '1');
    await timers.tick(2000);
    store.set('location', '2');
    await timers.tick(2000);
    assert.equal(fetch.calls[1].headers['X-WP-Nonce'], 'bbbbbbbbbb');
    assert.equal(fetch.calls[1].json.version, 5);
  });

  it('a change made during a write goes in the next one', async () => {
    let release;
    const fetch = fakeFetch();
    const slow = async (url, init) => {
      await new Promise((r) => { release = r; });
      return fetch.fn(url, init);
    };
    const timers = fakeTimers();
    const store = createMultiplayerSaveStore({ boot: BOOT, scope: eventScope().scope, fetch: slow, timers, now: timers.now, debounceMs: 2000 });
    store.set('location', 'A');
    await timers.tick(2000);
    store.set('location', 'B');
    release();
    await timers.tick(0);
    assert.equal(store.state, 'pending');
    await timers.tick(2000);
    release();
    await timers.tick(0);
    assert.deepEqual(fetch.calls.map((c) => c.json.data.entries.location), ['A', 'B']);
    assert.deepEqual(fetch.calls.map((c) => c.json.version), [4, 5]);
    assert.equal(store.state, 'saved');
  });

  it('goes offline on a failed write and retries with backoff', async () => {
    const { store, fetch, timers, states } = make(['network', { status: 502, body: null }]);
    store.set('location', 'A');
    await timers.tick(2000);
    assert.equal(store.state, 'offline');
    await timers.tick(1999);
    assert.equal(fetch.calls.length, 1);
    await timers.tick(1);
    assert.equal(fetch.calls.length, 2, 'retried after 2 s');
    assert.equal(store.state, 'offline');
    await timers.tick(4000);
    assert.equal(fetch.calls.length, 3, 'then after 4 s');
    assert.equal(store.state, 'saved');
    assert.ok(states.includes('offline'));
  });

  it('stops writing when a newer copy was saved elsewhere (409)', async () => {
    const { store, fetch, timers, states } = make([{ status: 409, body: { code: 'groddle_save_conflict', data: { status: 409, version: 9 } } }]);
    store.set('location', 'A');
    await timers.tick(2000);
    assert.equal(store.state, 'conflict');
    store.set('location', 'B');
    await timers.tick(60_000);
    assert.equal(fetch.calls.length, 1, 'never overwrites the newer copy');
    assert.equal(states.at(-1), 'conflict');
    assert.equal(store.get('location'), 'B', 'the game keeps playing from memory');
  });

  it('asks for a fresh nonce once when the old one expired, then says signed-out', async () => {
    const { store, fetch, timers } = make([
      { status: 403, body: { code: 'rest_cookie_invalid_nonce' } },
      { status: 200, body: 'cccccccccc' },
      { status: 200, body: { version: 5 } },
    ]);
    store.set('location', 'A');
    await timers.tick(2000);
    assert.equal(fetch.calls[1].url, BOOT.nonceUrl);
    assert.equal(fetch.calls[2].headers['X-WP-Nonce'], 'cccccccccc');
    assert.equal(store.state, 'saved');
    const ended = make([{ status: 401, body: { code: 'rest_not_logged_in' } }]);
    ended.store.set('location', 'A');
    await ended.timers.tick(2000);
    assert.equal(ended.store.state, 'signed-out');
  });

  it('a refused save (400, 413) is an error and is not retried', async () => {
    const { store, fetch, timers } = make([{ status: 413, body: { code: 'groddle_save_too_large' } }]);
    store.set('playerState', 'x');
    await timers.tick(2000);
    assert.equal(store.state, 'error');
    await timers.tick(60_000);
    assert.equal(fetch.calls.length, 1);
  });

  it('writes at once with keepalive when the page is hidden or closed', async () => {
    const { store, fetch, scope } = make();
    store.set('location', 'A');
    scope.document.visibilityState = 'hidden';
    scope.fire('doc:visibilitychange');
    await Promise.resolve();
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].keepalive, true);
    await store.flush();
    store.set('location', 'B');
    scope.fire('pagehide');
    assert.equal(fetch.calls.length, 2);
    assert.equal(fetch.calls[1].keepalive, true);
    scope.fire('pagehide');
    await store.flush();
    assert.equal(fetch.calls.length, 2, 'nothing new, nothing sent');
  });

  it('a save too big for keepalive goes as an ordinary request', async () => {
    const { store, fetch, scope } = make();
    store.set('playerState', 'x'.repeat(70_000));
    scope.fire('pagehide');
    assert.equal(fetch.calls[0].keepalive, false);
  });

  it('marks <html data-save-state> and lists the states it can be in', async () => {
    const { store, timers, scope } = make();
    store.set('location', 'A');
    assert.equal(scope.document.documentElement.dataset.saveState, 'pending');
    await timers.tick(2000);
    assert.equal(scope.document.documentElement.dataset.saveState, 'saved');
    assert.deepEqual([...SAVE_STATES], ['saved', 'pending', 'saving', 'offline', 'conflict', 'signed-out', 'error']);
  });

  it('createSaveSync on its own writes nothing until something changes', async () => {
    const fetch = fakeFetch();
    const sync = createSaveSync({ url: 'u', payload: () => ({}), fetch: fetch.fn, timers: fakeTimers() });
    assert.equal(await sync.flush(), 'saved');
    assert.equal(fetch.calls.length, 0);
  });
});

describe('solo backups', () => {
  const soloSave = (savedAt) => serializePlayerSave(createPlayerSave({ inventory: { slots: [] }, player: { energy: 1, mood: 1, currants: 9, img: 1, level: 2 }, systems: {}, world: { streets: {} }, savedAt }));

  it('snapshot takes every entry this browser holds, raw, as a solo save', () => {
    const storage = memoryStorage({ groddle_player_state_v1: soloSave(1000), groddle_player_location: 'LOC', 'groddle:companions': '1', unrelated: 'x', [AUDIO_MUTED_KEY]: '1' });
    const data = soloSaveSnapshot(createBrowserSaveStore({ storage }));
    assert.equal(data.kind, SOLO_SAVE_KIND);
    assert.equal(data.format, SAVE_FORMAT);
    assert.deepEqual(Object.keys(data.entries).sort(), ['companions', 'location', 'playerState']);
    assert.equal(data.entries.playerState, storage.map.get('groddle_player_state_v1'));
    assert.throws(() => soloSaveSnapshot(createBrowserSaveStore({ storage: memoryStorage({ groddle_player_location: 'LOC' }) })), /no solo game/);
  });

  it('savedAtOf reads the player state\'s savedAt', () => {
    assert.equal(savedAtOf({ playerState: soloSave(1234) }), 1234);
    assert.equal(savedAtOf({ playerState: 'not json' }), 0);
    assert.equal(savedAtOf(null), 0);
  });

  it('restore replaces every entry and removes what the backup lacks', () => {
    const storage = memoryStorage({ groddle_player_state_v1: 'OLD', groddle_dropped_items_v1: 'OLD-DROPS', [AUDIO_MUTED_KEY]: '1' });
    const store = createBrowserSaveStore({ storage });
    restoreSoloSave({ kind: SOLO_SAVE_KIND, format: 1, entries: { playerState: 'NEW', location: 'NEW-LOC', bogus: 'x' } }, store);
    assert.deepEqual(Object.fromEntries(storage.map), { groddle_player_state_v1: 'NEW', groddle_player_location: 'NEW-LOC', [AUDIO_MUTED_KEY]: '1' });
  });

  it('only a solo save restores: a multiplayer save never becomes a solo game, nor the reverse', () => {
    const storage = memoryStorage({ groddle_player_state_v1: 'KEEP' });
    const store = createBrowserSaveStore({ storage });
    assert.throws(() => restoreSoloSave({ kind: MULTIPLAYER_SAVE_KIND, format: 1, entries: { playerState: 'MP' } }, store), /Only a solo backup/);
    assert.throws(() => restoreSoloSave({ kind: SOLO_SAVE_KIND, format: 2, entries: { playerState: 'X' } }, store), /Only a solo backup/);
    assert.throws(() => restoreSoloSave({ kind: SOLO_SAVE_KIND, format: 1, entries: {} }, store), /no player state/);
    assert.equal(storage.map.get('groddle_player_state_v1'), 'KEEP');
  });

  it('freezeSoloSaves stops the page\'s solo store writing before the reload', async () => {
    // A fresh module instance, so freezing does not leak into the other cases.
    const fresh = await import(`../public/js/save-store.js?v=mp2-1&freeze=${Date.now()}`);
    const storage = useLocalStorage(memoryStorage({ groddle_player_location: 'RESTORED' }));
    fresh.saveStore.set('location', 'BEFORE');
    assert.equal(storage.map.get('groddle_player_location'), 'BEFORE');
    fresh.freezeSoloSaves();
    fresh.saveStore.set('location', 'GAME-AUTOSAVE');
    fresh.saveStore.remove('location');
    assert.equal(storage.map.get('groddle_player_location'), 'BEFORE', 'the running game cannot write over a restore');
    assert.equal(fresh.saveStore.get('location'), 'BEFORE', 'reads still work');
    assert.equal(typeof freezeSoloSaves, 'function');
  });
});

describe('every save read and write goes through the store', () => {
  const files = (dir) => readdirSync(join(pub, dir), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f));
  // Storage layers and device preferences that stay on localStorage directly;
  // online-boot.js keeps one per-tab flag (Play as <name> picked) in sessionStorage, never a save;
  // groups-feature.js remembers which chat tabs a multiplayer player has open on this device, never a save.
  const ALLOWED = new Set(['js/save-store.js', 'js/practice-mode.js', 'js/audio-pref.js', 'js/online-boot.js', 'js/features/groups-feature.js']);

  it('game.js and js/ make no direct localStorage or sessionStorage calls', () => {
    const offenders = [];
    for (const rel of ['game.js', 'content.js', ...files('js')]) {
      if (ALLOWED.has(rel)) continue;
      const src = read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      if (/\b(localStorage|sessionStorage)\b/.test(src)) offenders.push(rel);
    }
    assert.deepEqual(offenders, []);
  });

  it('game.js uses the store for the player state, location, drops and companions', () => {
    const game = read('game.js');
    assert.match(game, /import \{ saveStore \} from '\.\/js\/save-store\.js\?v=[\w-]+';/);
    for (const name of ['playerState', 'location', 'droppedItems', 'companions']) {
      assert.match(game, new RegExp(`_STORAGE_KEY = '${name}';`), name);
    }
    assert.match(game, /saveStore\.set\(PLAYER_STATE_STORAGE_KEY, serialized\)/);
    assert.match(game, /parsePlayerSave\(saveStore\.get\(PLAYER_STATE_STORAGE_KEY\)/);
    assert.match(game, /saveStore\.remove\(PLAYER_STATE_STORAGE_KEY\);\n\s*saveStore\.remove\(DROPPED_ITEMS_STORAGE_KEY\);\n\s*saveStore\.remove\(LOCATION_STORAGE_KEY\);/);
  });

  it('every importer of save-store and of game-mode uses one cache key for it', () => {
    const keys = { 'save-store': new Set(), 'game-mode': new Set() };
    for (const rel of ['game.js', ...files('js')]) {
      for (const m of read(rel).matchAll(/from '[^']*\/(save-store|game-mode)\.js(\?v=[^']*)?'/g)) keys[m[1]].add(m[2] || '');
    }
    for (const [mod, set] of Object.entries(keys)) {
      assert.equal(set.size, 1, `${mod}: ${[...set].join(' ')}`);
      assert.match([...set][0], /^\?v=[\w-]+$/, mod);
    }
  });
});

describe('practice copies stay solo', () => {
  it('practice-mode does nothing on a multiplayer entry page', () => {
    const source = read('js/practice-mode.js');
    const real = memoryStorage();
    const window = { location: { search: '?practice=1' }, localStorage: real, sessionStorage: memoryStorage(), GRODDLE_MODE: 'multiplayer' };
    const document = { documentElement: { dataset: {} }, body: null, getElementById: () => null, addEventListener() {} };
    vm.runInNewContext(source, { window, document, URLSearchParams });
    assert.equal(window.localStorage, real);
    assert.equal(window.groddlePractice, undefined);
  });
});
