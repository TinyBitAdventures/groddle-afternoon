/**
 * The Classic interface's frame at runtime (classic-spec layout.md §4, build-plan §4 commit 1).
 *
 * The grid itself is CSS (css/classic.css): a 40u header, 20u gutters, the world cell (#game-root)
 * and the right column, with u worked out in CSS from the window exactly as classic-layout.js
 * classicScale does, so it is right before any script runs and the game's own resize handler
 * (game.js syncLocationViewHeight) measures the finished cell. This module adds what CSS cannot
 * know:
 *
 * - The world view's rect and the pack band under it, from the real canvas (the canvas is the
 *   view plus the 132 px pack reserve, js/location-view.js stageFor), as CSS px on <html>:
 *   --cv-x, --cv-y, --cv-w, --cv-h (the view), --cv-right (window right to view right) and
 *   --cband-h (the band), and --cu-n, u as a plain number (Classic's type is scaled by it). The
 *   chrome the 2012 client drew inside the viewport (the ear, the
 *   currants, the growl, the prompts, the pack row) hangs off these.
 * - The Social drawer (js/ui/social-drawer.js) is the chat column: under Classic it is held open
 *   beside the world, or as the 48u rail below 1313 px wide (open question 3), without touching the
 *   player's own Modern choice; leaving Classic hands it back (restore()).
 * - window.groddleClassic for QA: the mode, the measured view and the pure layout.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g468-9';
import { classicLayout, railFor } from './classic-layout.js?v=g468-1';

const VARS = ['--cv-x', '--cv-y', '--cv-w', '--cv-h', '--cv-right', '--cband-h', '--cu-n'];
const PACK_RESERVE = 132;

/** PURE: the view and band from the canvas rect and its location viewport height (world px). */
export function viewFromCanvas(rect, locationViewH, windowW) {
  const locH = Number(locationViewH) > 0 ? Number(locationViewH) : 600;
  const share = locH / (locH + PACK_RESERVE);
  const h = rect.height * share;
  return {
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h,
    right: Math.max(0, windowW - (rect.left + rect.width)),
    band: rect.height - h,
  };
}

const px = (v) => `${Math.round(v * 100) / 100}px`;

export function installClassicFrame({ doc = globalThis.document, win = globalThis } = {}) {
  const root = doc.documentElement;
  let last = null;
  let classic = false;
  let rail = null;

  const layoutNow = () => classicLayout({ width: win.innerWidth, height: win.innerHeight, size: uiState().size, contactsOpen: root.dataset.classicStrip === 'open' });
  const canvas = () => doc.querySelector('#game-root > canvas[role="application"]') || doc.querySelector('#game-root > canvas');
  const drawer = () => win.groddleSocial || null;

  function measure() {
    if (!classic) return;
    const c = canvas();
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const v = viewFromCanvas(r, c.dataset.locationViewportHeight, win.innerWidth || r.right);
    last = v;
    const values = { '--cv-x': v.x, '--cv-y': v.y, '--cv-w': v.w, '--cv-h': v.h, '--cv-right': v.right, '--cband-h': v.band };
    for (const [k, n] of Object.entries(values)) {
      const s = px(n);
      if (root.style.getPropertyValue(k) !== s) root.style.setProperty(k, s);
    }
    // u as a plain number, so Classic's type grows with the chrome, as if the whole 2012 stage were zoomed.
    const u = String(Math.round(layoutNow().u * 1000) / 1000);
    if (root.style.getPropertyValue('--cu-n') !== u) root.style.setProperty('--cu-n', u);
  }

  function holdColumn() {
    const d = drawer();
    if (!d || !classic) return;
    const now = railFor(win.innerWidth || 0);
    if (now === rail) return;
    rail = now;
    // Wide: the column is always there. Narrow: the rail, opened over the world on demand.
    d.present?.(!now);
  }

  function apply(state) {
    const was = classic;
    classic = state.mode === 'classic';
    if (classic) {
      rail = null;
      holdColumn();
      measure();
      // The game measures #game-root on the resize ui-mode sends; measure again once it has.
      win.requestAnimationFrame?.(() => win.requestAnimationFrame?.(measure));
    } else {
      for (const k of VARS) root.style.removeProperty(k);
      last = null;
      if (was) drawer()?.restore?.();
    }
  }

  win.addEventListener?.('resize', () => {
    if (!classic) return;
    holdColumn();
    win.requestAnimationFrame?.(measure);
  });
  // The canvas changes size after the game's resize handler, and its location height with the street.
  let watched = null;
  const watch = () => {
    const c = canvas();
    if (!c || c === watched) return;
    watched = c;
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(() => measure()).observe(c);
    if (typeof win.MutationObserver === 'function') {
      new win.MutationObserver(() => measure()).observe(c, { attributes: true, attributeFilter: ['data-location-viewport-height', 'style'] });
    }
  };
  watch();
  if (!watched && typeof win.MutationObserver === 'function') {
    const gameRoot = doc.getElementById('game-root');
    if (gameRoot) {
      const mo = new win.MutationObserver(() => {
        watch();
        if (watched) { mo.disconnect(); measure(); }
      });
      mo.observe(gameRoot, { childList: true });
    }
  }

  onUiModeChange((now) => apply(now));
  apply(uiState());

  win.groddleClassic = {
    mode: () => uiState().mode,
    state: () => uiState(),
    /** The measured world view and pack band (CSS px), or null under Modern. */
    view: () => (last ? { ...last } : null),
    /** The pure frame for this window (classic-layout.js). */
    layout: () => layoutNow(),
    measure,
  };
  return win.groddleClassic;
}
