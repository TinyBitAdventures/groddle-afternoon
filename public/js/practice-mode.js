/**
 * Practice mode (?practice=1): a solo copy of the game that never touches the
 * player's saved game.
 *
 * Direct links on /restoration/ open a system, quest room or Paradise course
 * with demo parameters (and often &resetgame=1). With practice=1 every
 * localStorage read and write the game makes goes to a per-tab store in
 * sessionStorage instead, so those routes can reset and seed freely. Two keys
 * are read through from the real save so the practice copy still looks like
 * you: the avatar look and the mute setting. Writes never reach the real save.
 *
 * This is the storage layer under the solo save store (js/save-store.js reads
 * window.localStorage on every call, so it sees this per-tab store), which is
 * why it stays a plain Storage swap rather than a save-store client. The two
 * read-through keys are save-store's 'appearance' key and audio-pref's mute key.
 *
 * Classic script, loaded in play/index.html before the game modules so no
 * module sees the real localStorage first. If a shared multiplayer world is
 * ever added, practice links stay solo and nothing done in them counts there.
 */
(function practiceMode() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  if (params.get('practice') !== '1') return;
  // Practice copies are solo only (js/game-mode.js): a multiplayer entry page never practises.
  if (window.GRODDLE_MODE === 'multiplayer') return;

  const PREFIX = 'groddle-practice:';
  const READ_THROUGH = new Set(['groddle.avatar.appearance.v1', 'groddle.audio.muted']);
  let real = null;
  let tab = null;
  try { real = window.localStorage; } catch { real = null; }
  try { tab = window.sessionStorage; } catch { tab = null; }
  const memory = new Map();

  const rawGet = (k) => (tab ? tab.getItem(PREFIX + k) : memory.has(k) ? memory.get(k) : null);
  const rawSet = (k, v) => (tab ? tab.setItem(PREFIX + k, v) : memory.set(k, v));
  const rawRemove = (k) => (tab ? tab.removeItem(PREFIX + k) : memory.delete(k));
  const keys = () => {
    if (!tab) return [...memory.keys()];
    const out = [];
    for (let i = 0; i < tab.length; i += 1) {
      const k = tab.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out;
  };

  const store = {
    getItem(key) {
      const k = String(key);
      const v = rawGet(k);
      if (v !== null && v !== undefined) return v;
      if (READ_THROUGH.has(k) && real) {
        try { return real.getItem(k); } catch { return null; }
      }
      return null;
    },
    setItem(key, value) { rawSet(String(key), String(value)); },
    removeItem(key) { rawRemove(String(key)); },
    clear() { for (const k of keys()) rawRemove(k); },
    key(index) { return keys()[index] ?? null; },
    get length() { return keys().length; },
  };

  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => store });
  } catch {
    return;
  }
  window.groddlePractice = true;
  document.documentElement.dataset.practice = '1';

  const badge = () => {
    if (document.getElementById('practice-badge')) return;
    const note = document.createElement('div');
    note.id = 'practice-badge';
    note.setAttribute('role', 'status');
    note.textContent = 'Practice copy · your saved game is untouched';
    note.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:6px', 'transform:translateX(-50%)', 'z-index:9999',
      'padding:3px 10px', 'border-radius:999px', 'font:600 11px/1.4 "Trebuchet MS",system-ui,sans-serif',
      'background:rgba(48,70,44,0.82)', 'color:#fbfaf2', 'pointer-events:none', 'white-space:nowrap',
    ].join(';');
    document.body.append(note);
  };
  if (document.body) badge();
  else document.addEventListener('DOMContentLoaded', badge, { once: true });
})();
