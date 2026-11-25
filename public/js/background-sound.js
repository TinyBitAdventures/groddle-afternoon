/**
 * #693: "Keep playing sound in the background", a Sound setting (Austin 2026-11-25).
 *
 * G1266 (#660) hushed every sound while the page was hidden (another tab, another app, the window
 * put away), on every device: on Android the music had played on after the player left the
 * browser. On a computer that stopped the music the moment the player looked at another tab, which
 * Glitch never did: the Flash client kept playing when its window lost focus
 * (StageBeacon.onDeactivate only throttled the frame rate after a while, power saving mode, and
 * SoundMaster had no focus handling), and a Flash plugin in a background tab kept its sound too.
 *
 * So the hush now follows this setting (js/audio-resume.js hushWhenHidden, read each time the page
 * hides):
 *   - on: nothing hushes while the page is hidden; sound plays on as Glitch's did. Coming back
 *     still rebuilds music the system stopped meanwhile at the same point (the iPad path, #660).
 *   - off: G1266's hush as before (the context suspended, the street music paused at its place).
 * The default follows the device the phone gate named (play/index.html, window.GRODDLE_DEVICE):
 * on for a computer, off for a phone or a tablet (an iPad counts as a phone here), where the system
 * puts the browser away and a player expects the game to go quiet with it. Mute stays mute either way.
 *
 * The choice is kept on this device with the other sound settings (js/audio-pref.js
 * loadBackgroundSound / saveBackgroundSound); nothing stored means the device's default.
 * Controls: the Sound popover (js/ui/topbar.js, Modern and Classic) and Preferences on `,`
 * (js/classic/classic-prefs.js).
 */
import { loadBackgroundSound, saveBackgroundSound } from './audio-pref.js?v=80d433c3';

export const BACKGROUND_SOUND_LABEL = 'Keep playing sound in the background';
export const BACKGROUND_SOUND_HINT = 'Music and sounds go on while you are in another tab or app.';
export const BACKGROUND_SOUND_EVENT = 'groddle:background-sound';

/** The phone gate's devices that hush by default: the system puts the browser away on them. */
export const HUSHED_DEVICES = Object.freeze(['phone', 'tablet']);

/** PURE: the default for a device (window.GRODDLE_DEVICE): off on a phone or tablet, on otherwise. */
export function backgroundSoundDefault(device) {
  return !HUSHED_DEVICES.includes(String(device || ''));
}

/**
 * The setting for one window. `device` reads the phone gate's device; load/save are the sound
 * prefs' store (tests pass fakes). set() stores it, tells onChange listeners and sends
 * `groddle:background-sound`.
 */
export function createBackgroundSound({ win = globalThis, device = () => win?.GRODDLE_DEVICE, load = () => loadBackgroundSound(), save = (on) => saveBackgroundSound(on) } = {}) {
  let chosen = null;
  try { chosen = load(); } catch { chosen = null; }
  const listeners = new Set();
  const get = () => (typeof chosen === 'boolean' ? chosen : backgroundSoundDefault(device()));
  return {
    get,
    set(v) {
      const next = Boolean(v);
      const was = get();
      chosen = next;
      try { save(next); } catch { /* not remembered */ }
      if (next === was) return next;
      for (const fn of [...listeners]) {
        try { fn(next); } catch (err) { console.error(err); }
      }
      try {
        if (typeof win?.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(BACKGROUND_SOUND_EVENT, { detail: { on: next } }));
      } catch { /* no window events (tests) */ }
      return next;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const setting = createBackgroundSound();
/** This window's choice: true keeps sound playing while the page is hidden. */
export const backgroundSoundOn = () => setting.get();
export const setBackgroundSound = (on) => setting.set(on);
export const onBackgroundSoundChange = (fn) => setting.onChange(fn);
/** The shared setting object ({ get, set, onChange }) the Sound popover's switch takes. */
export const backgroundSound = setting;
