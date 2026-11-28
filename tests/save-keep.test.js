/**
 * G737: a save the game cannot read, or one a newer version wrote, is never written over; the
 * save's version is read and older ones go through the migrations table (js/player-save.js
 * inspectPlayerSave, migratePlayerSave; js/save-store.js keepUnreadableSave, hold).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_SAVE_MIGRATIONS,
  PLAYER_SAVE_VERSION,
  createPlayerSave,
  inspectPlayerSave,
  migratePlayerSave,
  serializePlayerSave,
} from '../public/js/player-save.js?v=c691c143';
import { UNREADABLE_SAVE_KEY, createSaveSync, keepUnreadableSave } from '../public/js/save-store.js?v=1ccb1d6b';

const memoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

const good = serializePlayerSave(createPlayerSave({ inventory: { apple: 3 }, player: { currants: 42 }, savedAt: 1 }));

describe('a stored save is read before the game uses it', () => {
  it('nothing stored is a new game', () => {
    assert.equal(inspectPlayerSave(null).status, 'none');
    assert.equal(inspectPlayerSave('').status, 'none');
  });

  it('a save this build wrote reads as ok', () => {
    const seen = inspectPlayerSave(good);
    assert.equal(seen.status, 'ok');
    assert.equal(seen.save.inventory.apple, 3);
    assert.equal(seen.save.player.currants, 42);
  });

  it('broken JSON, a save with no pack, or not an object at all is unreadable', () => {
    for (const raw of [good.slice(0, 40), '{"player":{"currants":5}}', '"just words"', 'null', '[1,2]']) {
      assert.equal(inspectPlayerSave(raw).status, 'unreadable', raw);
    }
  });

  it('a save from a newer version still plays, flagged newer', () => {
    const newer = JSON.stringify({ ...JSON.parse(good), version: PLAYER_SAVE_VERSION + 1, futureField: { x: 1 } });
    const seen = inspectPlayerSave(newer);
    assert.equal(seen.status, 'newer');
    assert.equal(seen.version, PLAYER_SAVE_VERSION + 1);
    assert.equal(seen.save.inventory.apple, 3);
  });

  it('the migrations table starts empty, and an older save goes through each step in turn', () => {
    assert.deepEqual(Object.keys(PLAYER_SAVE_MIGRATIONS), []);
    const steps = [];
    const migrations = {
      5: (save) => { steps.push(5); return { ...save, version: 6, renamed: save.old }; },
      6: (save) => { steps.push(6); save.version = 7; save.inventory.bonus = 1; return save; },
    };
    const old = { version: 5, old: 'kept', inventory: { apple: 1 } };
    const out = migratePlayerSave(old, { migrations, to: 7 });
    assert.deepEqual(steps, [5, 6]);
    assert.equal(out.renamed, 'kept');
    assert.equal(out.inventory.bonus, 1);
    const seen = inspectPlayerSave(JSON.stringify({ version: 5, inventory: { apple: 1 } }), {}, { migrations, to: 7 });
    assert.equal(seen.status, 'ok');
    assert.equal(seen.save.inventory.bonus, 1);
    assert.equal(seen.save.version, PLAYER_SAVE_VERSION);
    steps.length = 0;
    migratePlayerSave({ version: 9, inventory: {} }, { migrations, to: 7 });
    assert.deepEqual(steps, [], 'a newer save is never migrated down');
  });
});

describe('a solo save the game could not read is kept', () => {
  it('copies it beside the original once, never replacing an earlier copy', () => {
    const storage = memoryStorage({ groddle_player_state_v1: '{broken' });
    assert.equal(keepUnreadableSave('{broken', storage), true);
    const kept = JSON.parse(storage.getItem(UNREADABLE_SAVE_KEY));
    assert.equal(kept.raw, '{broken');
    assert.equal(kept.key, 'groddle_player_state_v1');
    assert.equal(keepUnreadableSave('{other', storage), false);
    assert.equal(JSON.parse(storage.getItem(UNREADABLE_SAVE_KEY)).raw, '{broken');
    assert.equal(storage.getItem('groddle_player_state_v1'), '{broken', 'the original is left where it was');
  });
});

describe('a held multiplayer save writes nothing more', () => {
  it('stops before the next write and takes no keep or retry', async () => {
    const calls = [];
    const states = [];
    const timers = { setTimeout: (fn) => { fn.queued = true; return fn; }, clearTimeout: () => {} };
    const sync = createSaveSync({
      url: '/save',
      version: 3,
      writer: 'abcdef0123456789',
      payload: () => ({ kind: 'groddle-multiplayer', format: 1, entries: {} }),
      fetch: async (...a) => { calls.push(a); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ version: 4 }) }; },
      timers,
      onState: (s) => states.push(s),
    });
    assert.equal(sync.hold('unreadable'), 'held');
    sync.changed();
    await sync.flush();
    await sync.flush({ keepalive: true });
    await sync.takeover();
    await sync.retry();
    await sync.yieldTo();
    assert.equal(calls.length, 0);
    assert.equal(sync.state, 'held');
    assert.deepEqual(states, ['held']);
  });

  it('a write already out when the hold came is the last', async () => {
    let answer;
    const calls = [];
    const sync = createSaveSync({
      url: '/save',
      payload: () => ({ kind: 'groddle-multiplayer', format: 1, entries: {} }),
      fetch: (...a) => { calls.push(a); return new Promise((r) => { answer = r; }); },
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
    });
    sync.changed();
    const out = sync.flush();
    sync.hold('newer');
    answer({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ version: 1 }) });
    assert.equal(await out, 'held');
    sync.changed();
    await sync.flush();
    assert.equal(calls.length, 1);
  });
});
