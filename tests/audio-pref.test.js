import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIO_MUTED_KEY, loadMutedPreference, saveMutedPreference } from '../public/js/audio-pref.js';

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
