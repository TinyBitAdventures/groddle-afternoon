/**
 * PINCH (Austin 2026-11-12 on his iPhone: "It's a bit hard to hit the street signs. Maybe zooming
 * feature would be all it needs?"): on a phone (window.GRODDLE_DEVICE === 'phone') two fingers on
 * the street zoom the world in and out (js/world-zoom.js phoneZoom, js/location-view.js
 * phoneStage `closeup`), and a tap on the street acts when the finger lifts, not when it lands, so
 * the first finger of a pinch never opens a verb menu or starts a walk.
 *
 * - One finger that lifts within TAP_SLOP_PX of where it landed is a tap: tap(down event), the
 *   canvas's own pointerdown handler with the press's own event (its time and place).
 * - A second finger on the street makes it a pinch: no tap, the level follows the spread of the two
 *   fingers (pinchLevel), once a frame. A finger that drags is no tap either.
 * - PINCH PREVIEW (Austin 2026-11-13: "The phone zoom in/out flickers and is mostly black during the
 *   zoom itself"): begin() comes before the pinch's first level and end() after its last, once each,
 *   so the game can draw the levels between by scaling the stage alone and size the renderer once,
 *   when the fingers lift (resizing it once a frame cleared the canvas after Pixi drew it, so
 *   most frames of a pinch showed black).
 * - The canvas takes every touch itself (touch-action: none), so the page never zooms or pans
 *   (style.css TOUCH PANELS keeps that for the rest of the page). The stick and Jump are their own
 *   elements with their own touches (js/touch-controls.js): a pinch on the street never reaches them.
 * Computers and tablets never install it.
 */

/** A finger that strays this far (CSS px) from where it landed is a drag, not a tap. */
export const TAP_SLOP_PX = 12;
/** Two fingers must spread or close this much (CSS px) before the zoom moves (a two-finger tap does nothing). */
export const PINCH_DEAD_PX = 6;

/**
 * PURE: the level after a pinch. `span` is how much bigger level 1 draws than level 0 (the stage's
 * scale ratio): the street grows by exactly the fingers' spread, so what is between them stays
 * between them. Held to 0..1, on the zoom's 1/100 grid.
 */
export function pinchLevel(startLevel, startDist, dist, span) {
  const s = Number(span);
  const a = Number(startDist);
  const b = Number(dist);
  const z0 = Math.min(1, Math.max(0, Number(startLevel) || 0));
  if (!(s > 1.005) || !(a > 0) || !(b > 0)) return z0;
  const z = z0 + Math.log(b / a) / Math.log(s);
  return Math.round(Math.min(1, Math.max(0, z)) * 100) / 100;
}

/** PURE: whether a press was a tap (it never left TAP_SLOP_PX and no second finger came). */
export function isWorldTap({ dx = 0, dy = 0, pinched = false, cancelled = false } = {}, slop = TAP_SLOP_PX) {
  return !pinched && !cancelled && Math.hypot(Number(dx) || 0, Number(dy) || 0) <= slop;
}

/**
 * Wires the canvas. tap(e): the world's press handler, called on lift with the press's event.
 * getLevel / setLevel / span: the phone zoom and its scale ratio for the current street.
 * begin() / end(): a pinch that moves the level starts and ends (PINCH PREVIEW).
 * Returns { defer(e), destroy() }: defer(e) is true when the canvas's pointerdown should wait (a
 * real touch); synthetic presses (the stick's tap-through) act at once.
 */
export function installPinchZoom({ canvas, tap, getLevel, setLevel, span = () => 1, begin = () => {}, end = () => {}, setData = () => {}, win = globalThis.window } = {}) {
  if (!canvas) return null;
  canvas.style.touchAction = 'none';
  const fingers = new Map();
  let press = null;
  let pinch = null;
  let frame = 0;
  let want = null;
  let live = false;

  const spread = () => {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const flush = () => {
    frame = 0;
    if (want == null) return;
    const v = want;
    want = null;
    setLevel(v);
  };
  const onDown = (e) => {
    if (e.pointerType !== 'touch' || !e.isTrusted) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    if (fingers.size === 1) {
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, event: e, pinched: false, cancelled: false };
      return;
    }
    // A second finger: a pinch, never a tap.
    if (press) press.pinched = true;
    if (fingers.size === 2) {
      pinch = { dist: spread(), level: Number(getLevel()) || 0, moved: false };
      setData('pinch', 'on');
    }
  };
  const onMove = (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX;
    f.y = e.clientY;
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) press.cancelled = true;
    if (!pinch || fingers.size < 2) return;
    const d = spread();
    if (!pinch.moved && Math.abs(d - pinch.dist) < PINCH_DEAD_PX) return;
    if (!pinch.moved) {
      live = true;
      begin();
    }
    pinch.moved = true;
    want = pinchLevel(pinch.level, pinch.dist, d, span());
    if (!frame) frame = win?.requestAnimationFrame ? win.requestAnimationFrame(flush) : (flush(), 0);
  };
  const onEnd = (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    const p = press;
    if (p && p.id === e.pointerId) {
      press = null;
      const ok = e.type === 'pointerup' && isWorldTap({ dx: e.clientX - p.x, dy: e.clientY - p.y, pinched: p.pinched, cancelled: p.cancelled });
      setData('worldTap', ok ? 'tap' : (p.pinched ? 'pinch' : 'drag'));
      if (ok) tap(p.event);
    }
    if (pinch && fingers.size < 2) {
      if (frame && win?.cancelAnimationFrame) win.cancelAnimationFrame(frame);
      frame = 0;
      flush();
      pinch = null;
      if (live) {
        live = false;
        end();
      }
      setData('pinch', '');
    }
  };
  // iOS: its own pinch gesture never zooms the page over the street.
  const noGesture = (e) => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown, true);
  canvas.addEventListener('pointermove', onMove);
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, onEnd);
  canvas.addEventListener('gesturestart', noGesture);
  canvas.addEventListener('gesturechange', noGesture);
  return {
    defer: (e) => e?.pointerType === 'touch' && e.isTrusted === true && fingers.has(e.pointerId),
    destroy() {
      if (live) {
        live = false;
        end();
      }
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      for (const type of ['pointerup', 'pointercancel']) canvas.removeEventListener(type, onEnd);
      canvas.removeEventListener('gesturestart', noGesture);
      canvas.removeEventListener('gesturechange', noGesture);
    },
  };
}
