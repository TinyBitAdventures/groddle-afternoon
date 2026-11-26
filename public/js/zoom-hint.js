/**
 * G1328 (#726): a browser zoomed far out (about 50%) draws the game's buttons and panels tiny while
 * the world still fills the window, and players took it for our bug. One notice says so, once per
 * browser: "Your browser is zoomed out to 50%. Press Cmd+0 to reset it." Ours: Glitch was a Flash
 * app, sized by the plugin, and had nothing like it (Austin's ruling 2026-11-26).
 *
 * The signal: a desktop browser's outerWidth is the window in screen points and does not change
 * with the page zoom, while innerWidth is in CSS pixels, so outerWidth / innerWidth is the zoom
 * (Chrome, Edge and Safari; Firefox reports outerWidth in CSS pixels too, so it reads 1 there and
 * no notice shows). Window borders and a side-docked devtools panel only push the ratio up, toward
 * "not zoomed out". It must be clear before anything shows (no notice beats a false one):
 * - a desktop-class browser only: a fine pointer that can hover, no phone or tablet user agent, no
 *   iPad (which says MacIntel with touch). On a phone outerWidth means nothing (pinch zoom, the
 *   layout viewport) and the Home Screen app is a phone;
 * - not in an iframe, not an installed app window (display-mode standalone, fullscreen, minimal-ui),
 *   not pinch-zoomed (visualViewport.scale 1);
 * - the width ratio below ZOOM_HINT_BELOW and above ZOOM_FLOOR, and the height ratio below 1 as
 *   well (outerHeight takes in the toolbars, so innerHeight can only pass it when the page is
 *   really zoomed out).
 * Zoomed in (above 100%) and small changes (80% to 100%) never show it.
 *
 * Once: the caller hands a store in ({ get(), set(v) }, the game's ui cache key ZOOM_HINT_CACHE);
 * it is marked when the notice shows, every access in try/catch (a private window may show it again).
 * QA: `?zoomhint=0` never shows it.
 */

/** The ui-mode cache key (readUiCache), and its full stored name. */
export const ZOOM_HINT_CACHE = 'zoomHint';
export const ZOOM_HINT_KEY = `groddle.ui.cache.${ZOOM_HINT_CACHE}`;

/** Below this zoom (outerWidth / innerWidth) the notice is due: Chrome's 75% shows, its 80% does not. */
export const ZOOM_HINT_BELOW = 0.78;
/** Under this the reading is not a zoom (browsers stop at 25%): a broken or emulated window. */
export const ZOOM_FLOOR = 0.2;
/** How long the notice stays (js/notify.js caps a notice at NOTICE_MAX_MS). */
export const ZOOM_HINT_MS = 10000;
/** The zoom levels browsers step through below 80%: a reading this close to one names it. */
const ZOOM_STEPS = [25, 30, 33, 50, 63, 67, 75];

/** PURE: true for a phone or tablet user agent, or an iPad asking for the desktop site. */
export function touchDevice(nav = {}) {
  const ua = String(nav.userAgent || '');
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return true;
  if (nav.userAgentData?.mobile === true) return true;
  return nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1;
}

/** PURE: Cmd on a Mac, Ctrl elsewhere. */
export function zoomResetKey(nav = {}) {
  const platform = String(nav.userAgentData?.platform || nav.platform || '');
  const mac = /^mac/i.test(platform) || (!platform && /Macintosh|Mac OS X/.test(String(nav.userAgent || '')));
  return mac ? 'Cmd+0' : 'Ctrl+0';
}

/** PURE: the reading as a whole percent, on the browser's own step when it is that close. */
export function zoomPercent(ratio) {
  const raw = Math.round(Number(ratio) * 100);
  const step = ZOOM_STEPS.find((s) => Math.abs(s - raw) <= 2);
  return step ?? raw;
}

function safely(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * The page's zoom when it is clearly zoomed out on a desktop browser, as { ratio, percent };
 * null when it is not, or when the signal is not clear.
 * @param {Window|object} win
 */
export function readZoomOut(win = globalThis.window) {
  if (!win) return null;
  const nav = safely(() => win.navigator, null) || {};
  if (touchDevice(nav)) return null;
  const media = (q) => safely(() => Boolean(win.matchMedia?.(q)?.matches), false);
  if (!media('(pointer: fine)') || !media('(hover: hover)')) return null;
  if (media('(display-mode: standalone)') || media('(display-mode: fullscreen)') || media('(display-mode: minimal-ui)')) return null;
  if (nav.standalone === true) return null;
  // An iframe (a cross-origin parent throws on .top in some browsers: not clear, so no notice).
  if (safely(() => win.top !== win.self, true)) return null;
  const scale = safely(() => win.visualViewport?.scale, 1);
  if (scale != null && Math.abs(Number(scale) - 1) > 0.01) return null;
  const [ow, iw, oh, ih] = safely(() => [win.outerWidth, win.innerWidth, win.outerHeight, win.innerHeight].map(Number), []);
  if (![ow, iw, oh, ih].every((n) => Number.isFinite(n) && n > 0)) return null;
  // A tiny window (a popup, a window being minimised) is no reading.
  if (ow < 480 || oh < 320) return null;
  const ratio = ow / iw;
  if (!(ratio < ZOOM_HINT_BELOW && ratio >= ZOOM_FLOOR)) return null;
  if (!(oh / ih < 1)) return null;
  return { ratio, percent: zoomPercent(ratio) };
}

/** The notice's words. */
export function zoomHintText(percent, nav = {}) {
  return `Your browser is zoomed out to ${percent}%. Press ${zoomResetKey(nav)} to reset it.`;
}

/** True once the notice has shown in this browser. store: { get() } (null: never). */
export function zoomHintSeen(store) {
  return safely(() => String(store?.get?.() ?? '') === '1', false);
}

export function markZoomHintSeen(store) {
  safely(() => store?.set?.('1'), undefined);
}

/**
 * The notice's words when it is due now, else null.
 * @param {{ win?: object, store?: { get: () => any, set?: (v: string) => void } }} o
 */
export function zoomHintDue({ win = globalThis.window, store = null } = {}) {
  const qa = safely(() => new URLSearchParams(String(win?.location?.search || '')).get('zoomhint') || '', '');
  if (qa === '0' || zoomHintSeen(store)) return null;
  const zoom = readZoomOut(win);
  if (!zoom) return null;
  return zoomHintText(zoom.percent, safely(() => win.navigator, null) || {});
}

/**
 * Watches for a zoomed-out page (now, and after each resize: a zoom change fires one) and calls
 * notice(text) once, then marks the store and stops. ready() says when a notice may go (the game
 * has started). Returns stop().
 * @param {{ win?: object, store?: object, notice: (text: string) => void, ready?: () => boolean, settleMs?: number }} o
 */
export function watchZoomHint({ win = globalThis.window, store = null, notice, ready = () => true, settleMs = 600 } = {}) {
  let timer = null;
  let done = zoomHintSeen(store);
  const check = () => {
    timer = null;
    if (done || !safely(() => ready(), false)) return;
    const text = zoomHintDue({ win, store });
    if (!text) return;
    done = true;
    markZoomHintSeen(store);
    stop();
    notice(text);
  };
  const onResize = () => {
    if (done) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, settleMs);
  };
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    safely(() => win?.removeEventListener?.('resize', onResize), undefined);
  }
  if (!done) {
    safely(() => win?.addEventListener?.('resize', onResize), undefined);
    check();
  }
  return { check, stop };
}
