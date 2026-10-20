/**
 * Hub-tuned ambient music — from GSJS main.js ambient_library + ambient_hub_map.
 *
 * Original flow:
 * 1. Login payload sends ambient_hub_map[hubId] → set name (e.g. "caverns")
 * 2. Client SoundMaster.changeAmbientSet + ambientPlay picks tracks from ambient_library
 * 3. Optional per-street override: location.geometry.music_file → announce_music
 *
 * This module resolves theme + track list; the game loads/plays buffers.
 */

/**
 * @typedef {{
 *   defaultTheme: string,
 *   themes: Record<string, { label: string, tracks: string[], gsjsKeys?: string[] }>,
 *   hubMap: Record<string, string>,
 *   hubNameHints?: Record<string, string>,
 * }} AmbientMusicConfig
 */

/** @type {AmbientMusicConfig|null} */
let config = null;

/**
 * @param {AmbientMusicConfig} data
 */
export function setAmbientMusicConfig(data) {
  config = data && typeof data === 'object' ? data : null;
  return config;
}

export function getAmbientMusicConfig() {
  return config;
}

/**
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 */
export async function loadAmbientMusicConfig(
  url = 'assets/content/ambient-music.json',
  fetchImpl = globalThis.fetch
) {
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = await res.json();
    return setAmbientMusicConfig(data);
  } catch {
    return null;
  }
}

/**
 * Resolve ambient theme id for a hub.
 * @param {{ hubId?: string|number, hubName?: string, musicFile?: string|null }} street
 * @returns {string}
 */
export function resolveAmbientTheme(street = {}) {
  const cfg = config;
  const fallback = cfg?.defaultTheme || 'default';
  if (!cfg) return fallback;

  // Per-street override key if we ever import geometry.music_file
  if (street.musicFile && String(street.musicFile).trim()) {
    return `street:${street.musicFile}`;
  }

  const hid = street.hubId != null ? String(street.hubId) : '';
  if (hid && cfg.hubMap && cfg.hubMap[hid]) {
    return cfg.hubMap[hid];
  }

  const name = street.hubName || '';
  if (name && cfg.hubNameHints) {
    for (const [hint, theme] of Object.entries(cfg.hubNameHints)) {
      if (name.toLowerCase().includes(hint.toLowerCase())) return theme;
    }
  }
  return fallback;
}

/**
 * Track URL list for a theme (existing files preferred by caller).
 * @param {string} themeId
 * @returns {string[]}
 */
export function tracksForTheme(themeId) {
  const cfg = config;
  if (!cfg?.themes) return [];
  if (themeId && themeId.startsWith('street:')) {
    // Future: map music_file keys to local paths
    return tracksForTheme(cfg.defaultTheme || 'default');
  }
  const theme = cfg.themes[themeId] || cfg.themes[cfg.defaultTheme] || cfg.themes.default;
  return Array.isArray(theme?.tracks) ? theme.tracks.filter(Boolean) : [];
}

/**
 * Pick a track URL for the theme (stable by hub so re-enter same song, or random).
 * @param {string} themeId
 * @param {{ hubId?: string|number, random?: boolean, rng?: () => number }} [opts]
 */
export function pickAmbientTrack(themeId, opts = {}) {
  const tracks = tracksForTheme(themeId);
  if (!tracks.length) return null;
  if (opts.random) {
    const rng = opts.rng || Math.random;
    return tracks[Math.floor(rng() * tracks.length) % tracks.length];
  }
  // Stable pick from hub id so a hub keeps the same track within a session
  const seed = String(opts.hubId || themeId || '0');
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tracks[h % tracks.length];
}

/**
 * Human label for UI/toast.
 * @param {string} themeId
 */
export function themeLabel(themeId) {
  const t = config?.themes?.[themeId];
  return t?.label || themeId || 'default';
}

/**
 * All unique track URLs referenced by config (for preloading).
 * @returns {string[]}
 */
export function allAmbientTrackUrls() {
  const cfg = config;
  if (!cfg?.themes) return [];
  const set = new Set();
  for (const t of Object.values(cfg.themes)) {
    for (const u of t.tracks || []) set.add(u);
  }
  return [...set];
}
