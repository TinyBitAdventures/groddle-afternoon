/**
 * A sideways strip with no scrollbar (Make's tool strip): a scrollbar drawn over a row of tabs covers
 * their names (Safari with "Show scroll bars: Always", 2026-11-01), so the strip hides it and scrolls
 * these ways instead. A trackpad's sideways swipe and touch already scroll it natively.
 *
 * - A vertical mouse wheel over the strip scrolls it sideways (as js/ui/home-builder.js's strip).
 * - A mouse drag scrolls it; once the pointer has moved past DRAG_SLOP px the drag is a scroll, and
 *   the click it ends with does not pick the tab under it.
 *
 * Bound once to the strip element; its children may be rebuilt freely. Returns an unbind function.
 */

/** Pixels a pressed mouse moves before the press becomes a drag (a shaky click stays a click). */
export const DRAG_SLOP = 5;

/** The scroll a vertical wheel turn asks of a sideways strip, or 0 when the turn is mostly sideways. */
export function wheelToSideways(deltaX, deltaY) {
  return Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : 0;
}

export function bindDragScroll(strip) {
  if (!strip) return () => {};
  const overflows = () => strip.scrollWidth > strip.clientWidth + 1;
  let press = null;
  let swallowClick = false;

  const onWheel = (e) => {
    const dx = wheelToSideways(e.deltaX, e.deltaY);
    if (!dx || !overflows()) return;
    strip.scrollLeft += e.deltaMode === 1 ? dx * 16 : dx;
    e.preventDefault();
  };
  const onDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !overflows()) return;
    press = { id: e.pointerId, x: e.clientX, left: strip.scrollLeft, dragging: false };
  };
  const onMove = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    if (!press.dragging) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      press.dragging = true;
      strip.classList.add('is-dragging');
      try { strip.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    }
    strip.scrollLeft = press.left - dx;
    e.preventDefault();
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.dragging) {
      strip.classList.remove('is-dragging');
      swallowClick = true;
      // The click (if any) follows pointerup in the same task; a later one is a new click.
      setTimeout(() => { swallowClick = false; }, 0);
    }
    press = null;
  };
  const onClick = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  strip.addEventListener('wheel', onWheel, { passive: false });
  strip.addEventListener('pointerdown', onDown);
  strip.addEventListener('pointermove', onMove);
  strip.addEventListener('pointerup', onUp);
  strip.addEventListener('pointercancel', onUp);
  strip.addEventListener('click', onClick, true);
  return () => {
    strip.removeEventListener('wheel', onWheel);
    strip.removeEventListener('pointerdown', onDown);
    strip.removeEventListener('pointermove', onMove);
    strip.removeEventListener('pointerup', onUp);
    strip.removeEventListener('pointercancel', onUp);
    strip.removeEventListener('click', onClick, true);
    strip.classList.remove('is-dragging');
  };
}
