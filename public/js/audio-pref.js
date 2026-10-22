/**
 * The player's mute choice, kept in this browser. Sound is on unless they
 * turned it off; storage can be missing or throw (private windows), which
 * reads as "not muted".
 */
export const AUDIO_MUTED_KEY = 'groddle.audio.muted';

export function loadMutedPreference(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(AUDIO_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMutedPreference(muted, storage = globalThis.localStorage) {
  try {
    storage?.setItem(AUDIO_MUTED_KEY, muted ? '1' : '0');
  } catch {
    /* the choice just won't be remembered */
  }
}
