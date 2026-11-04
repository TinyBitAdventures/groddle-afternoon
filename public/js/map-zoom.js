/**
 * MAPZOOM (ticket 76, Austin 2026-11-04; register G521): zoom and pan on the Map. Friendly asked for
 * "a zoomed in version where you can move it around to what you're looking for". The client's map was
 * a fixed 760 x 460 with no zoom (HubMapDialog.as MAP_W / MAP_ACTUAL_W): this is the remake's own.
 *
 * The Map is one SVG whose viewBox is the region's frame (map-graph.js renderHubMapSvg). Zoom narrows
 * the viewBox, so every street line, name, GO button, stripe, star and route line stays vector-sharp
 * and keeps working as drawn (clicks land on what is under the pointer). The frame is the fit view
 * (zoom 1, what opens); zoom goes up to MAP_ZOOM_MAX, and the view never leaves the frame.
 *
 * - Wheel or trackpad pinch (a ctrlKey wheel in Chrome and Firefox, gesture events in Safari) zooms
 *   about the pointer; +, - and Fit buttons sit in a corner; = / + , - and 0 zoom while the Map is open
 *   (game.js; the world zoom keeps them everywhere else).
 * - A drag (mouse, pen or one finger) pans, with a little glide after; two fingers pinch and pan. A
 *   press that moves less than MAP_DRAG_SLOP is still a click: a street's menu, a GO button.
 * - Past 2x the names grow more slowly than the map, the GO buttons, star and icons past 1.25x, the
 *   street lines past 1.5x (mapInkScale), so nothing gets huge.
 *
 * The pure math first (tests/map-zoom.test.js), then the controller (DOM).
 */

/** The closest the Map zooms, times the fit view. */
export const MAP_ZOOM_MAX = 3;
/** One +/- button or key step. */
export const MAP_ZOOM_STEP = 1.5;
/** A street found with the search, or the destination shown: zoomed to at least this, centred on it. */
export const MAP_FOCUS_ZOOM = 2;
/** How far (CSS px) a press may move and still be a click, by pointer type (a finger wobbles more). */
export const MAP_DRAG_SLOP = Object.freeze({ mouse: 4, pen: 6, touch: 10 });

const EPS = 1e-6;

/** PURE: a zoom kept in [1, max]. */
export function clampMapZoom(zoom, max = MAP_ZOOM_MAX) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 1;
  return Math.min(Math.max(z, 1), max);
}

/** PURE: the view that shows the whole frame [x, y, w, h]. */
export function fitMapView(frame) {
  const [fx, fy, fw, fh] = frame;
  return { zoom: 1, cx: fx + fw / 2, cy: fy + fh / 2 };
}

/** PURE: the view's zoom clamped and its centre kept so the box it shows stays inside the frame. */
export function clampMapView(frame, view, max = MAP_ZOOM_MAX) {
  const [fx, fy, fw, fh] = frame;
  const zoom = clampMapZoom(view?.zoom, max);
  const w = fw / zoom;
  const h = fh / zoom;
  const cx = Number.isFinite(view?.cx) ? view.cx : fx + fw / 2;
  const cy = Number.isFinite(view?.cy) ? view.cy : fy + fh / 2;
  return {
    zoom,
    cx: Math.min(Math.max(cx, fx + w / 2), fx + fw - w / 2),
    cy: Math.min(Math.max(cy, fy + h / 2), fy + fh - h / 2),
  };
}

/** PURE: the viewBox [x, y, w, h] a view shows. */
export function mapViewBox(frame, view) {
  const [, , fw, fh] = frame;
  const w = fw / view.zoom;
  const h = fh / view.zoom;
  return [view.cx - w / 2, view.cy - h / 2, w, h];
}

/** PURE: the map point at fraction (px, py) of the drawn map (0 to 1 across, 0 to 1 down). */
export function mapPointAt(frame, view, px, py) {
  const [x, y, w, h] = mapViewBox(frame, view);
  return { x: x + px * w, y: y + py * h };
}

/** PURE: the view at `zoom` that puts map point (mx, my) at fraction (px, py) of the drawn map, clamped. */
export function viewWithPointAt(frame, zoom, mx, my, px, py, max = MAP_ZOOM_MAX) {
  const z = clampMapZoom(zoom, max);
  const w = frame[2] / z;
  const h = frame[3] / z;
  return clampMapView(frame, { zoom: z, cx: mx - px * w + w / 2, cy: my - py * h + h / 2 }, max);
}

/** PURE: zoom to `zoom` about the pointer at fraction (px, py): the map point under it stays under it. */
export function zoomMapAt(frame, view, zoom, px = 0.5, py = 0.5, max = MAP_ZOOM_MAX) {
  const m = mapPointAt(frame, view, px, py);
  return viewWithPointAt(frame, zoom, m.x, m.y, px, py, max);
}

/** PURE: the view moved as a drag of (dx, dy) CSS px over a map drawn sizeW x sizeH px moves it. */
export function panMapBy(frame, view, dx, dy, sizeW, sizeH, max = MAP_ZOOM_MAX) {
  const [, , w, h] = mapViewBox(frame, view);
  return clampMapView(frame, { zoom: view.zoom, cx: view.cx - (dx * w) / (sizeW || 1), cy: view.cy - (dy * h) / (sizeH || 1) }, max);
}

/** PURE: centred on map point (x, y) (as near as the frame allows), at `zoom` or closer as it is. */
export function focusMapView(frame, view, x, y, zoom = MAP_FOCUS_ZOOM, max = MAP_ZOOM_MAX) {
  return clampMapView(frame, { zoom: Math.max(clampMapZoom(view?.zoom, max), zoom), cx: x, cy: y }, max);
}

/** PURE: has a press moved far enough (dx, dy CSS px) to be a drag rather than a click? */
export function isMapDrag(dx, dy, pointerType = 'mouse') {
  const slop = MAP_DRAG_SLOP[pointerType] ?? MAP_DRAG_SLOP.mouse;
  return Math.hypot(dx, dy) > slop;
}

/**
 * PURE: how much one wheel event zooms (a factor; over 1 is closer). A mouse notch (about 100 px) is
 * about 1.2x; a trackpad pinch (Chrome and Firefox send it as a ctrlKey wheel of a few px) follows
 * the fingers. Lines and pages are counted as px. Never more than 2x in one event.
 * @param {{ deltaY?: number, deltaMode?: number, ctrlKey?: boolean }} e
 */
export function wheelZoomFactor(e) {
  const unit = e?.deltaMode === 1 ? 16 : e?.deltaMode === 2 ? 400 : 1;
  const dy = (Number(e?.deltaY) || 0) * unit;
  const k = e?.ctrlKey ? 0.01 : 0.0018;
  return Math.exp(Math.min(Math.max(-dy * k, -Math.LN2), Math.LN2));
}

/**
 * PURE: how big the marks draw at a zoom, as a share of what plain zooming would give them. Up to 2x the
 * street names grow with the map, past it at half the rate (3x: 2.5x their fit size), so they read; the
 * GO buttons, star and street icons from 1.25x (3x: about 2.1x); the street and route lines from 1.5x.
 */
export function mapInkScale(zoom) {
  const z = clampMapZoom(zoom, Infinity);
  const slow = (knee) => (z <= knee ? 1 : (knee + (z - knee) / 2) / z);
  return { text: slow(2), mark: slow(1.25), line: slow(1.5) };
}

/** PURE: the zoom one button or key step gives. */
export function stepMapZoom(zoom, dir, max = MAP_ZOOM_MAX) {
  const z = clampMapZoom(zoom, max);
  if (dir === 'reset') return 1;
  const next = dir === 'in' ? z * MAP_ZOOM_STEP : z / MAP_ZOOM_STEP;
  // A step that lands within a hair of an end goes to it.
  return clampMapZoom(Math.abs(next - max) < 0.05 ? max : Math.abs(next - 1) < 0.05 ? 1 : next, max);
}

/** The corners the buttons may take, in the order they are tried (stacked, then in a row): a tie keeps the first. */
export const MAP_ZOOM_CORNERS = Object.freeze(['br', 'bl', 'tr', 'tl']);

/**
 * PURE: the corner of the box [x, y, w, h] where the buttons cover the least: a GO button counts most,
 * then its sign, then a street name, then anything else (the star, an icon). `size` is the buttons'
 * box stacked ({ w, h, m }: m its gap from the edge); laid in a row it is h wide and w tall, tried after
 * every stacked corner (a region with a GO button in each corner, Muufo). `marks` are
 * { x0, y0, x1, y1, weight }, in the same units; a mark within `pad` of the buttons counts as under them.
 * Returns { corner, row, cost }.
 */
export function pickMapZoomCorner(frame, size, marks, pad = 0) {
  const [fx, fy, fw, fh] = frame;
  const { m = 0 } = size;
  let best = null;
  for (const row of [false, true]) {
    const w = row ? size.h : size.w;
    const h = row ? size.w : size.h;
    for (const c of MAP_ZOOM_CORNERS) {
      const x0 = c.endsWith('l') ? fx + m : fx + fw - m - w;
      const y0 = c.startsWith('t') ? fy + m : fy + fh - m - h;
      const box = { x0: x0 - pad, y0: y0 - pad, x1: x0 + w + pad, y1: y0 + h + pad };
      let cost = 0;
      for (const k of marks || []) if (k.x0 < box.x1 && k.x1 > box.x0 && k.y0 < box.y1 && k.y1 > box.y0) cost += k.weight || 1;
      if (!best || cost < best.cost) best = { corner: c, row, cost };
    }
  }
  return best;
}

/** PURE: two views the same (to a thousandth of a unit). */
export function sameMapView(a, b) {
  return Boolean(a && b) && Math.abs(a.zoom - b.zoom) < 1e-3 && Math.abs(a.cx - b.cx) < 1e-3 && Math.abs(a.cy - b.cy) < 1e-3;
}

/* ------------------------------------------------------------ controller (DOM) */

const ZOOM_IN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ZOOM_OUT_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ZOOM_FIT_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The buttons' words (their tips name the keys). */
export const MAP_ZOOM_TEXT = Object.freeze({
  group: 'Map zoom',
  in: 'Zoom in (=)',
  out: 'Zoom out (-)',
  fit: 'Whole region (0)',
});

const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const now = () => globalThis.performance?.now?.() ?? Date.now();
const raf = (fn) => (typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(fn) : setTimeout(() => fn(now()), 16));
const caf = (id) => (typeof globalThis.cancelAnimationFrame === 'function' ? globalThis.cancelAnimationFrame(id) : clearTimeout(id));

/**
 * The Map's zoom and pan on `canvas` (#map-canvas, which keeps its listeners while openMap redraws
 * the SVG inside it). Call attach(svg, key) after each render: the same key (the region) keeps the
 * view while the Map stays open; a new one, or reset(), starts at fit.
 * @param {HTMLElement} canvas
 * @param {{ onChange?: (view: { zoom:number, cx:number, cy:number }) => void, doc?: Document }} [opts]
 */
export function createMapZoom(canvas, { onChange = null, doc = globalThis.document } = {}) {
  let svg = null;
  let frame = null;
  let view = null;
  let key = null;
  let ctl = null;
  let anim = 0;
  /** Where a running ease ends, and its backstop timer. */
  let easeTo = null;
  let finish = 0;
  let suppressClick = false;
  /** @type {Map<number, { x:number, y:number, type:string }>} */
  const pointers = new Map();
  let press = null;
  let gesture = null;

  const rect = () => svg?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
  const fracAt = (clientX, clientY) => {
    const r = rect();
    return { px: (clientX - r.left) / (r.width || 1), py: (clientY - r.top) / (r.height || 1) };
  };

  function apply(next) {
    if (!svg || !frame) return;
    view = clampMapView(frame, next);
    const vb = mapViewBox(frame, view);
    svg.setAttribute('viewBox', vb.map((n) => +n.toFixed(3)).join(' '));
    const ink = mapInkScale(view.zoom);
    svg.style.setProperty('--map-text-k', ink.text.toFixed(4));
    svg.style.setProperty('--map-mark-k', ink.mark.toFixed(4));
    svg.style.setProperty('--map-line-k', ink.line.toFixed(4));
    const zoomed = view.zoom > 1 + EPS;
    svg.toggleAttribute('data-zoomed', zoomed);
    canvas.toggleAttribute('data-zoomed', zoomed);
    canvas.dataset.mapZoom = view.zoom.toFixed(2);
    // MAPSIZE: a 1x screen takes the Retina painting once a map unit draws over one device pixel.
    const soft = svg.querySelector('image.map-bg-soft[data-hi]');
    if (soft && (rect().width / vb[2]) * (Number(globalThis.devicePixelRatio) || 1) > 1.01) soft.setAttribute('href', soft.dataset.hi);
    if (ctl) {
      ctl.querySelector('[data-zoom="in"]').disabled = view.zoom >= MAP_ZOOM_MAX - EPS;
      ctl.querySelector('[data-zoom="out"]').disabled = !zoomed;
      ctl.querySelector('[data-zoom="fit"]').disabled = !zoomed;
    }
    onChange?.(view);
  }

  function stop() {
    if (anim) caf(anim);
    anim = 0;
    if (finish) clearTimeout(finish);
    finish = 0;
    easeTo = null;
  }

  /** Ease to `target` over a moment (at once with reduced motion). */
  function animateTo(target, ms = 180) {
    stop();
    if (!frame) return;
    const to = clampMapView(frame, target);
    const from = view || fitMapView(frame);
    if (reducedMotion() || sameMapView(from, to)) {
      apply(to);
      return;
    }
    easeTo = to;
    // Frames can come slowly (a busy page, a hidden tab): the ease always ends where it was going.
    finish = setTimeout(() => {
      if (!anim) return;
      stop();
      apply(to);
    }, ms + 120);
    const t0 = now();
    const a = mapViewBox(frame, from);
    const b = mapViewBox(frame, to);
    const pan = Math.abs(from.zoom - to.zoom) < EPS;
    // A zoom eases in log space about the one map point both views show at the same place, so a zoom
    // about the pointer keeps that point still all the way; a pan moves the centre evenly.
    const px = pan ? 0 : (b[0] - a[0]) / (a[2] - b[2]);
    const py = pan ? 0 : (b[1] - a[1]) / (a[3] - b[3]);
    const fixed = { x: a[0] + px * a[2], y: a[1] + py * a[3] };
    const step = (t) => {
      // (A frame's timestamp can be a hair before t0.)
      const u = Math.min(1, Math.max(0, ((t ?? now()) - t0) / ms));
      const e = 1 - (1 - u) ** 3;
      if (pan) apply({ zoom: to.zoom, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e });
      else {
        const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e);
        const w = frame[2] / zoom;
        const h = frame[3] / zoom;
        apply({ zoom, cx: fixed.x - px * w + w / 2, cy: fixed.y - py * h + h / 2 });
      }
      if (u >= 1) {
        stop();
        apply(to);
        return;
      }
      anim = raf(step);
    };
    anim = raf(step);
  }

  function zoomStep(dir, at = null) {
    if (!frame) return;
    // A press while one step is still easing steps on from where that one ends.
    const cur = easeTo || view || fitMapView(frame);
    const z = stepMapZoom(cur.zoom, dir);
    const p = at || { px: 0.5, py: 0.5 };
    animateTo(dir === 'reset' ? fitMapView(frame) : zoomMapAt(frame, cur, z, p.px, p.py));
  }

  function controls() {
    const el = doc.createElement('div');
    el.className = 'map-zoom-ctl';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', MAP_ZOOM_TEXT.group);
    for (const [id, art] of [['in', ZOOM_IN_SVG], ['out', ZOOM_OUT_SVG], ['fit', ZOOM_FIT_SVG]]) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.zoom = id;
      b.title = MAP_ZOOM_TEXT[id];
      b.setAttribute('aria-label', MAP_ZOOM_TEXT[id]);
      b.innerHTML = art;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomStep(id === 'fit' ? 'reset' : id);
      });
      el.appendChild(b);
    }
    return el;
  }

  // ---- wheel and Safari's pinch
  let safariPinch = null;
  canvas.addEventListener('wheel', (e) => {
    if (!frame || e.target?.closest?.('.map-zoom-ctl')) return;
    e.preventDefault();
    // Safari pinches with its gesture events (below); a ctrlKey wheel beside one is the same pinch.
    if (safariPinch && e.ctrlKey) return;
    stop();
    const cur = view || fitMapView(frame);
    const p = fracAt(e.clientX, e.clientY);
    apply(zoomMapAt(frame, cur, cur.zoom * wheelZoomFactor(e), p.px, p.py));
  }, { passive: false });
  canvas.addEventListener('gesturestart', (e) => {
    if (!frame) return;
    e.preventDefault();
    stop();
    safariPinch = { zoom: (view || fitMapView(frame)).zoom };
  });
  canvas.addEventListener('gesturechange', (e) => {
    if (!frame || !safariPinch) return;
    e.preventDefault();
    // iPhone and iPad send these beside the touches, which the pinch below already follows.
    if (pointers.size >= 2) return;
    const p = fracAt(e.clientX, e.clientY);
    apply(zoomMapAt(frame, view || fitMapView(frame), safariPinch.zoom * (Number(e.scale) || 1), p.px, p.py));
  });
  canvas.addEventListener('gestureend', (e) => {
    e.preventDefault();
    safariPinch = null;
  });

  // ---- drag, one-finger pan, two-finger pinch
  const capture = (id) => {
    try { canvas.setPointerCapture?.(id); } catch { /* the pointer is gone */ }
  };
  const startGesture = () => {
    const pts = [...pointers.values()];
    const cur = view || fitMapView(frame);
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = fracAt((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { kind: 'pinch', zoom: cur.zoom, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, anchor: mapPointAt(frame, cur, mid.px, mid.py) };
    } else if (pts.length === 1) {
      const [a] = pts;
      const f = fracAt(a.x, a.y);
      gesture = { kind: 'pan', zoom: cur.zoom, anchor: mapPointAt(frame, cur, f.px, f.py), trail: [{ x: a.x, y: a.y, t: now() }] };
    } else gesture = null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!frame || e.button > 0 || e.target?.closest?.('.map-zoom-ctl')) return;
    suppressClick = false;
    stop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' });
    if (pointers.size === 1) press = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse', dragging: false };
    if (pointers.size >= 2 && press) {
      // A second finger: a pinch, never a tap.
      press.dragging = true;
      for (const id of pointers.keys()) capture(id);
      startGesture();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || !frame) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (press && !press.dragging) {
      if (!isMapDrag(e.clientX - press.x, e.clientY - press.y, press.type)) return;
      press.dragging = true;
      capture(e.pointerId);
      canvas.dataset.mapDragging = '1';
      startGesture();
    }
    if (!press?.dragging || !gesture) return;
    e.preventDefault();
    const pts = [...pointers.values()];
    if (gesture.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const mid = fracAt((a.x + b.x) / 2, (a.y + b.y) / 2);
      const z = gesture.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist);
      apply(viewWithPointAt(frame, z, gesture.anchor.x, gesture.anchor.y, mid.px, mid.py));
    } else if (gesture.kind === 'pan') {
      const f = fracAt(e.clientX, e.clientY);
      apply(viewWithPointAt(frame, gesture.zoom, gesture.anchor.x, gesture.anchor.y, f.px, f.py));
      gesture.trail.push({ x: e.clientX, y: e.clientY, t: now() });
      if (gesture.trail.length > 6) gesture.trail.shift();
    }
  });

  const glide = (trail) => {
    if (!trail || trail.length < 2 || reducedMotion()) return;
    const last = trail[trail.length - 1];
    const first = trail.find((p) => last.t - p.t <= 100) || trail[0];
    const dt = last.t - first.t;
    if (dt <= 0 || now() - last.t > 60) return;
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    if (Math.hypot(vx, vy) < 0.3) return;
    let t0 = now();
    const step = (t) => {
      const tt = t ?? now();
      const d = Math.min(48, tt - t0);
      t0 = tt;
      const r = rect();
      apply(panMapBy(frame, view, vx * d, vy * d, r.width, r.height));
      const decay = 0.9 ** (d / 16);
      vx *= decay;
      vy *= decay;
      anim = Math.hypot(vx, vy) > 0.02 ? raf(step) : 0;
    };
    anim = raf(step);
  };

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* not held */ }
    if (press?.dragging) {
      // The click this press ends in is the drag's, not a street's or a GO button's.
      suppressClick = e.type === 'pointerup';
      setTimeout(() => { suppressClick = false; }, 0);
      if (pointers.size) {
        // One finger of a pinch lifted: the other pans on from here.
        startGesture();
        return;
      }
      const trail = gesture?.kind === 'pan' ? gesture.trail : null;
      gesture = null;
      press = null;
      delete canvas.dataset.mapDragging;
      if (e.type === 'pointerup') glide(trail);
      return;
    }
    if (!pointers.size) press = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // Before the streets', GO buttons' and the route picker's own click listeners (capture, on the document).
  doc.addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  canvas.addEventListener('dragstart', (e) => e.preventDefault());

  return {
    /** A freshly drawn SVG: its frame is the fit view; the same key keeps the view there was. */
    attach(nextSvg, nextKey = '') {
      stop();
      pointers.clear();
      press = null;
      gesture = null;
      delete canvas.dataset.mapDragging;
      svg = nextSvg || null;
      if (!svg) {
        frame = null;
        return;
      }
      const raw = svg.dataset.frame || svg.getAttribute('viewBox') || '';
      const f = raw.split(/[\s,]+/).map(Number);
      if (f.length !== 4 || !(f[2] > 0 && f[3] > 0)) {
        frame = null;
        return;
      }
      frame = f;
      svg.dataset.frame = f.join(' ');
      const keep = key !== null && String(nextKey) === key && view;
      key = String(nextKey);
      ctl = controls();
      canvas.appendChild(ctl);
      apply(keep ? view : fitMapView(frame));
    },
    /**
     * The buttons take the corner that covers the least of the map as drawn now (pickMapZoomCorner, in
     * CSS px over the canvas). Called when the map gets its size (game.js fitMapCanvas), not while it
     * pans, so the buttons never hop about under the pointer.
     */
    placeControls() {
      if (!ctl || !svg || !frame) return null;
      const r = canvas.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return null;
      const cs = getComputedStyle(ctl);
      const inset = Math.min(...[cs.top, cs.right, cs.bottom, cs.left].map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0), 8);
      // Measured stacked (whichever way they lie now).
      const across = ctl.dataset.row === '1';
      const size = { w: across ? ctl.offsetHeight : ctl.offsetWidth, h: across ? ctl.offsetWidth : ctl.offsetHeight, m: inset };
      const marks = [];
      const add = (sel, weight) => {
        for (const el of svg.querySelectorAll(sel)) {
          const b = el.getBoundingClientRect();
          if (b.width > 0) marks.push({ x0: b.left - r.left, y0: b.top - r.top, x1: b.right - r.left, y1: b.bottom - r.top, weight });
        }
      };
      add('.map-go-ring', 10);
      add('.map-go-sub', 4);
      add('text.map-label.loaded, text.map-label.current', 3);
      add('text.map-label.dim, .map-you, .map-icon', 1);
      // A GO ring that only touches the buttons is still too close to press (4 px of room).
      const pick = pickMapZoomCorner([0, 0, r.width, r.height], size, marks, 4);
      ctl.dataset.corner = pick.corner;
      ctl.dataset.row = pick.row ? '1' : '0';
      canvas.dataset.mapZoomCorner = `${pick.corner}${pick.row ? ' row' : ''}:${pick.cost}`;
      return pick;
    },
    /** The Map closed: the next open starts at fit. */
    reset() {
      stop();
      key = null;
      view = null;
    },
    /** = / + , - and 0 (game.js, while the Map is open). */
    step(dir) {
      zoomStep(dir);
    },
    /** Centre on map point (x, y), zoomed to at least `zoom`. */
    focus(x, y, zoom = MAP_FOCUS_ZOOM, { animate = true } = {}) {
      if (!frame) return;
      const to = focusMapView(frame, view || fitMapView(frame), x, y, zoom);
      if (animate) animateTo(to, 260);
      else apply(to);
    },
    /** The view now ({ zoom, cx, cy }), or null with no map. */
    view: () => (view ? { ...view } : null),
    frame: () => (frame ? [...frame] : null),
  };
}
