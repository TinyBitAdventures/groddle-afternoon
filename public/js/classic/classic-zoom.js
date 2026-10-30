/**
 * ZOOM under Classic: the world zoom (js/world-zoom.js) magnifies the 2012 frame with the world,
 * at one u (classic-layout.js classicZoomScale). CSS cannot solve that u, so this sets it on
 * <html> as --cu-zoom (css/classic.css uses it for --cu when set) and clears it at Wide, under
 * Modern and in "Original window size", where the CSS rule stands alone.
 *
 * It runs on the window's resize ahead of the game's own handler (game.js imports this before
 * main() adds its listener), so the stage measures the cell at the new u.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g476-1';
import { classicLayout } from './classic-layout.js?v=g476-1';
import { worldZoom, onZoomChange } from '../world-zoom.js?v=g486-1';

/** PURE: the --cu-zoom value for a window and state, or null to clear it. */
export function classicZoomVar({ width, height, mode, size, zoom, contactsOpen = false }) {
  if (mode !== 'classic' || size === 'original' || !(zoom > 0)) return null;
  const L = classicLayout({ width, height, size, contactsOpen, zoom });
  return `${Math.round(L.u * 10000) / 10000}px`;
}

export function installClassicZoom({ doc = globalThis.document, win = globalThis } = {}) {
  const root = doc?.documentElement;
  if (!root) return () => {};
  const apply = () => {
    const s = uiState();
    const v = classicZoomVar({
      width: win.innerWidth,
      height: win.innerHeight,
      mode: s.mode,
      size: s.size,
      zoom: worldZoom(),
      contactsOpen: root.dataset.classicStrip === 'open',
    });
    if (v == null) {
      if (root.style.getPropertyValue('--cu-zoom')) root.style.removeProperty('--cu-zoom');
    } else if (root.style.getPropertyValue('--cu-zoom') !== v) root.style.setProperty('--cu-zoom', v);
  };
  win.addEventListener?.('resize', apply);
  onUiModeChange(apply);
  onZoomChange(apply);
  // The contact strip opening changes the chrome (classic-panes.js sends a resize after it too).
  if (typeof win.MutationObserver === 'function') {
    new win.MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-classic-strip'] });
  }
  apply();
  return apply;
}

/** Applied as the module loads, so the first measure already sees it. */
export const applyClassicZoom = installClassicZoom();
