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

/**
 * The Sound popover's two levels (the top bar, js/ui/topbar.js), 0 to 100 each,
 * kept in this browser beside the mute choice: Effects scales the sound
 * effects bus, Music the street music. 100 (the default) is the game's own mix.
 */
export const AUDIO_LEVEL_KEYS = Object.freeze({ effects: 'groddle.audio.effects', music: 'groddle.audio.music' });

const level = (v) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
};

export function loadAudioLevels(storage = globalThis.localStorage) {
  const out = { effects: 100, music: 100 };
  for (const [kind, key] of Object.entries(AUDIO_LEVEL_KEYS)) {
    try {
      out[kind] = level(storage?.getItem(key) ?? null);
    } catch {
      /* storage blocked: the game's own mix */
    }
  }
  return out;
}

export function saveAudioLevel(kind, value, storage = globalThis.localStorage) {
  const key = AUDIO_LEVEL_KEYS[kind];
  if (!key) return;
  try {
    storage?.setItem(key, String(level(value)));
  } catch {
    /* the level just won't be remembered */
  }
}
