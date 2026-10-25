/**
 * The save interface (multiplayer phase 1, js/save-store.js): solo saves keep
 * the exact localStorage keys the game has always written, the browser store
 * round-trips raw strings untouched, and the multiplayer stub refuses.
 */
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import {
  MULTIPLAYER_SAVE_UNAVAILABLE,
  SAVE_ENTRY_NAMES,
  SAVE_KEYS,
  createBrowserSaveStore,
  createMultiplayerSaveStore,
  createSaveStore,
  saveStore,
} from '../public/js/save-store.js?v=mp1-1';
import { AUDIO_MUTED_KEY } from '../public/js/audio-pref.js';
import { STORAGE_KEY as APPEARANCE_KEY, APPEARANCE_PRESETS, appearanceToJson, loadAppearance, saveAppearance } from '../public/js/character-builder.js';
import { getGameDayKey, getLastNewDayKey, getLastNewDayTs, resetGameDayClock, setLastNewDayTs } from '../public/js/game-day.js?v=dametime-2';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js';

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
  it('keeps every key the game wrote before the save interface (HEAD 2cfd764f)', () => {
    // game.js 6701, 9337-9341; game-day.js 28-29; character-builder.js 41 at 2cfd764f.
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

describe('multiplayer save store (phase 1 stub)', () => {
  it('refuses every call with "not available yet"', () => {
    const store = createMultiplayerSaveStore();
    assert.equal(store.kind, 'multiplayer');
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
    assert.equal(createSaveStore('multiplayer').kind, 'multiplayer');
    assert.equal(createSaveStore('solo').kind, 'browser');
    assert.equal(createSaveStore('anything').kind, 'browser');
    assert.throws(() => createSaveStore('multiplayer').set('playerState', 'MP'));
    assert.equal(storage.map.get('groddle_player_state_v1'), 'SOLO', 'a solo save never goes online');
  });
});

describe('every save read and write goes through the store', () => {
  const files = (dir) => readdirSync(join(pub, dir), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f));
  // Storage layers and device preferences that stay on localStorage directly.
  const ALLOWED = new Set(['js/save-store.js', 'js/practice-mode.js', 'js/audio-pref.js']);

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
    assert.match(game, /import \{ saveStore \} from '\.\/js\/save-store\.js\?v=mp1-1';/);
    for (const name of ['playerState', 'location', 'droppedItems', 'companions']) {
      assert.match(game, new RegExp(`_STORAGE_KEY = '${name}';`), name);
    }
    assert.match(game, /saveStore\.set\(PLAYER_STATE_STORAGE_KEY, serialized\)/);
    assert.match(game, /parsePlayerSave\(saveStore\.get\(PLAYER_STATE_STORAGE_KEY\)/);
    assert.match(game, /saveStore\.remove\(PLAYER_STATE_STORAGE_KEY\);\n\s*saveStore\.remove\(DROPPED_ITEMS_STORAGE_KEY\);\n\s*saveStore\.remove\(LOCATION_STORAGE_KEY\);/);
  });

  it('every importer of save-store and game-mode uses one cache key', () => {
    const keys = new Set();
    for (const rel of ['game.js', ...files('js')]) {
      for (const m of read(rel).matchAll(/from '[^']*\/(save-store|game-mode)\.js(\?v=[^']*)?'/g)) keys.add(m[2] || '');
    }
    assert.deepEqual([...keys], ['?v=mp1-1']);
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
