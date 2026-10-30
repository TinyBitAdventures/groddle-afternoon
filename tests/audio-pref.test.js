import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIO_MUTED_KEY, loadMutedPreference, saveMutedPreference } from '../public/js/audio-pref.js?v=g465-1';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

describe('remembered mute choice', () => {
  it('starts with sound on and remembers a mute', () => {
    const storage = memoryStorage();
    assert.equal(loadMutedPreference(storage), false);
    saveMutedPreference(true, storage);
    assert.equal(storage.getItem(AUDIO_MUTED_KEY), '1');
    assert.equal(loadMutedPreference(storage), true);
    saveMutedPreference(false, storage);
    assert.equal(loadMutedPreference(storage), false);
  });

  it('treats missing or blocked storage as sound on', () => {
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(loadMutedPreference(blocked), false);
    assert.doesNotThrow(() => saveMutedPreference(true, blocked));
    assert.equal(loadMutedPreference(null), false);
  });
});

describe('remembered sound levels (the top bar\'s Sound popover)', () => {
  it('starts at the game\'s own mix and remembers each level, clamped to 0..100', async () => {
    const { AUDIO_LEVEL_KEYS, loadAudioLevels, saveAudioLevel } = await import('../public/js/audio-pref.js?v=g465-1');
    const storage = memoryStorage();
    assert.deepEqual(loadAudioLevels(storage), { effects: 100, music: 100 });
    saveAudioLevel('music', 35, storage);
    saveAudioLevel('effects', 140, storage);
    saveAudioLevel('nope', 5, storage);
    assert.equal(storage.getItem(AUDIO_LEVEL_KEYS.music), '35');
    assert.deepEqual(loadAudioLevels(storage), { effects: 100, music: 35 });
    saveAudioLevel('effects', 0, storage);
    assert.equal(loadAudioLevels(storage).effects, 0);
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.deepEqual(loadAudioLevels(blocked), { effects: 100, music: 100 });
    assert.doesNotThrow(() => saveAudioLevel('music', 10, blocked));
  });
});
