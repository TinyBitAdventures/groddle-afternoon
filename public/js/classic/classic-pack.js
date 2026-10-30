/**
 * The Classic pack's keyboard (classic-spec spec §8 Keyboard; PackDisplayManager.as 247-577): with a
 * slot focused, Left and Right (A, D) move along the row and wrap, Up (W) opens the focused bag and
 * goes into it, Down (S) comes back out, Enter opens the slot's menu (the button's own click), Esc
 * leaves the pack. The other slots dim to .5 round the focused one, which wears the #53e5ff ring.
 *
 * B, the client's key into the pack, is the remake's Badges, and both skins keep one key map
 * (Austin 2026-10-30), so the pack is reached as any button is (Tab, or a click) and the arrows take
 * over from there. Keys used here stay here, so the avatar does not walk.
 */
import { uiState } from './ui-mode.js?v=587c014a';

/** PURE: the next index along a row of n (wrapping), or -1 for an empty row. */
export function stepIndex(i, n, dir) {
  if (!(n > 0)) return -1;
  const at = Number.isInteger(i) && i >= 0 ? i : dir > 0 ? -1 : n;
  return (((at + dir) % n) + n) % n;
}

/** PURE: what a key does in the pack. */
export function packKey(key) {
  const k = String(key || '');
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'prev';
  if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'next';
  if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'in';
  if (k === 'ArrowDown' || k === 's' || k === 'S') return 'out';
  if (k === 'Escape') return 'leave';
  return null;
}

export function installClassicPack({ doc = globalThis.document } = {}) {
  const bar = doc.getElementById('pack-bar');
  if (!bar) return null;
  const rowSlots = () => [...bar.querySelectorAll('#pack-bags .pack-slot, #pack-items .pack-slot[data-tsid]')];
  const traySlots = () => [...bar.querySelectorAll('.pack-bag-slots .pack-slot[data-tsid]')];
  const setFocusMode = (on) => bar.classList.toggle('is-classic-focus', on);

  bar.addEventListener('focusin', () => { if (uiState().mode === 'classic') setFocusMode(true); });
  bar.addEventListener('focusout', (e) => { if (!bar.contains(e.relatedTarget)) setFocusMode(false); });
  bar.addEventListener('keydown', (e) => {
    if (uiState().mode !== 'classic' || e.ctrlKey || e.metaKey || e.altKey) return;
    const slot = e.target?.closest?.('.pack-slot');
    if (!slot) return;
    const act = packKey(e.key);
    if (!act) return;
    const inTray = Boolean(slot.closest('.pack-bag-slots'));
    const list = inTray ? traySlots() : rowSlots();
    const i = list.indexOf(slot);
    e.preventDefault();
    e.stopPropagation();
    if (act === 'prev' || act === 'next') {
      const j = stepIndex(i, list.length, act === 'next' ? 1 : -1);
      if (j >= 0) list[j].focus({ preventScroll: false });
    } else if (act === 'in' && !inTray && slot.classList.contains('pack-bag')) {
      if (!slot.classList.contains('is-open')) slot.click();
      // The tray draws on the next frame: go to its middle slot (PackDisplayManager.as 247-577).
      requestAnimationFrame(() => {
        const t = traySlots();
        if (t.length) t[Math.floor((t.length - 1) / 2)].focus({ preventScroll: true });
      });
    } else if (act === 'out' && inTray) {
      const bag = bar.querySelector('.pack-slot.pack-bag.is-open');
      bag?.focus({ preventScroll: true });
    } else if (act === 'leave') {
      slot.blur();
      setFocusMode(false);
    }
  }, true);
  return { stepIndex };
}
