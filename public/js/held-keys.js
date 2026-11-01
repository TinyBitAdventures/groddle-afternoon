/**
 * Held keys the game can vouch for (player report 23, 2026-11-01: on Safari the
 * avatar kept walking right with no key down, across streets, until a reload,
 * after a right click while walking). A key stays held in game.js's `keys` set
 * until its keyup arrives, and a browser loses keyups: a context menu or another
 * window takes the release, Cmd swallows the release of a key pressed with it,
 * and Option or Shift can change the released key's name ('d' goes down, '∂'
 * comes up). The client met the same thing in Flash and let go of every key when
 * it could not be sure:
 *
 * - glitch-client KeyBeacon.as onStageActivate / onStageDeactivate (97-107):
 *   reset when the game gains or loses focus; onFlashFocusChanged (322-324):
 *   reset when focus moves between the game and the page (a text field).
 * - KeyBeacon.as _keyUpFire (251-259): Cmd/Ctrl coming up resets every key,
 *   "because the up event for keys will not fire in some browsers when cmd/ctrl
 *   is also down".
 * - KeyBeacon.as _keyDownHandler (231-245): on a Mac a fresh press of Right,
 *   Left, A or D (Shift not held) resets the held keys before it counts, so a
 *   stuck direction goes the moment you press any direction.
 *
 * The page's version of those moments: the window's blur, the page hidden or
 * left, a context menu opening, full screen coming or going, focus moving into
 * a text field. A keyup also releases every name its physical key went down
 * with (by `code`), so a changed modifier cannot strand the first name.
 */

/** KeyBeacon._keyDownHandler 236-244: Keyboard.RIGHT, LEFT, A and D. */
const MAC_RESET_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'a', 'A', 'd', 'D']);

/** KeyBeacon._keyUpFire 257: Keyboard.CONTROL, which Flash on a Mac reports for Cmd. */
const RESET_ON_UP = new Set(['Meta', 'OS', 'Control']);

const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

export function isEditableTarget(target) {
  return Boolean(target?.matches?.(EDITABLE) || target?.isContentEditable);
}

/** EnvironmentUtil.is_mac, from the page's platform. */
export function isMacPlatform(nav = globalThis.navigator) {
  const platform = String(nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '');
  return /mac/i.test(platform);
}

/**
 * The bookkeeping, apart from the page: `keys` is game.js's Set of held key
 * names (it adds them itself on keydown). Returns { keydown, keyup, releaseAll }.
 * releaseAll(reason) returns true when something was held.
 */
export function createHeldKeys(keys, { mac = false, onRelease = null } = {}) {
  /** code -> every key name that code went down as since its last keyup. */
  const names = new Map();

  function releaseAll(reason = 'reset') {
    const had = keys.size > 0;
    keys.clear();
    names.clear();
    if (had) onRelease?.(reason);
    return had;
  }

  function keydown(e) {
    if (!e || isEditableTarget(e.target)) return;
    // KeyBeacon 234-245: was_down is the held set before this press counts.
    if (mac && e.isTrusted !== false && !e.repeat && !e.shiftKey && MAC_RESET_KEYS.has(e.key) && !keys.has(e.key)) {
      releaseAll('mac-direction');
    }
    if (e.code && e.key) {
      let set = names.get(e.code);
      if (!set) names.set(e.code, (set = new Set()));
      set.add(e.key);
    }
  }

  function keyup(e) {
    if (!e) return;
    if (RESET_ON_UP.has(e.key)) {
      releaseAll('cmd-up');
      return;
    }
    const key = String(e.key || '');
    keys.delete(key);
    if (key.length === 1) {
      keys.delete(key.toLowerCase());
      keys.delete(key.toUpperCase());
    }
    const went = e.code ? names.get(e.code) : null;
    if (went) {
      for (const name of went) {
        keys.delete(name);
        if (name.length === 1) {
          keys.delete(name.toLowerCase());
          keys.delete(name.toUpperCase());
        }
      }
      names.delete(e.code);
    }
  }

  return { keydown, keyup, releaseAll };
}

/**
 * Wires createHeldKeys to the page: keydown and keyup in the capture phase on
 * the window (ahead of panels that stop a key from bubbling), and the moments
 * the page cannot vouch for a held key. Returns the held-keys object.
 */
export function installHeldKeyGuard(keys, { win = globalThis.window, doc = globalThis.document, mac = isMacPlatform(win?.navigator), onRelease = null } = {}) {
  const held = createHeldKeys(keys, { mac, onRelease });
  if (!win?.addEventListener) return held;
  win.addEventListener('keydown', held.keydown, true);
  win.addEventListener('keyup', held.keyup, true);
  win.addEventListener('blur', () => held.releaseAll('blur'));
  win.addEventListener('pagehide', () => held.releaseAll('pagehide'));
  if (doc?.addEventListener) {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') held.releaseAll('hidden');
    });
    // A context menu takes the next keyup (Safari's, the report's right click).
    doc.addEventListener('contextmenu', () => held.releaseAll('contextmenu'), true);
    doc.addEventListener('fullscreenchange', () => held.releaseAll('fullscreen'));
    doc.addEventListener('webkitfullscreenchange', () => held.releaseAll('fullscreen'));
    doc.addEventListener('focusin', (e) => {
      if (isEditableTarget(e.target)) held.releaseAll('text-field');
    }, true);
  }
  return held;
}
