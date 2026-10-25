/**
 * The new stack's fade-in for a createItemStackWithPoof that a feature cannot
 * reach sprite by sprite (G298).
 *
 * locations/location.js 2054-2070 createItemStackWithPoof sends poof_in; the
 * client's LocationItemstackView.as 738-769 poofItIn plays the overlay and
 * fades the new stack's view in (js/overlay-art.js POOF_IN, poofInAlpha: 0
 * for 0.2 s, then up over 1 s). A home yard is redrawn whole by other systems
 * (rocks, gardens, pods, resource nodes, patches, protos), so homes-feature
 * hands over the layer's children from before the redraw: every child added
 * since whose bounds centre lies within `halfW` of the poof's x fades in.
 */
import { POOF_IN, poofInAlpha } from './overlay-art.js?v=g273-1';

/** The children added since `before` whose centre (from `centreX(child)`) lies within halfW of x. */
export function newChildrenNear(children, before, x, halfW, centreX) {
  const out = [];
  for (const child of children || []) {
    if (!child || child.destroyed || before?.has?.(child)) continue;
    if (String(child.label || '').startsWith('overlay:')) continue; // the puff itself
    const cx = centreX(child);
    if (Number.isFinite(cx) && Math.abs(cx - x) <= halfW) out.push(child);
  }
  return out;
}

/** A child's bounds centre in the layer's own coordinates (its position when it has no size yet). */
export function layerCentreX(layer, child) {
  try {
    const b = child.getBounds?.();
    if (b && b.width > 0 && layer?.toLocal) return layer.toLocal({ x: b.x + b.width / 2, y: b.y }).x;
  } catch {
    /* a child mid-teardown */
  }
  return Number(child?.x);
}

/**
 * Fade the yard's new children near x in, as poofItIn did. Returns the faded
 * children. Each keeps its own alpha as the end point; the fade runs on
 * requestAnimationFrame and stops early for a destroyed child.
 */
export function fadeInNewNear(layer, before, { x, halfW, clock = () => Date.now(), raf = globalThis.requestAnimationFrame } = {}) {
  if (!layer?.children || !Number.isFinite(x) || !(halfW > 0)) return [];
  const rows = newChildrenNear(layer.children, before, x, halfW, (child) => layerCentreX(layer, child))
    .map((child) => ({ child, base: Number.isFinite(child.alpha) ? child.alpha : 1 }));
  if (!rows.length) return [];
  for (const row of rows) row.child.alpha = 0;
  const start = clock();
  const end = POOF_IN.fadeInDelayMs + POOF_IN.fadeInMs;
  const step = () => {
    const ms = clock() - start;
    const k = poofInAlpha(ms);
    let live = 0;
    for (const row of rows) {
      if (row.child.destroyed) continue;
      row.child.alpha = row.base * k;
      live += 1;
    }
    if (live && ms < end && typeof raf === 'function') raf(step);
    else for (const row of rows) if (!row.child.destroyed) row.child.alpha = row.base;
  };
  if (typeof raf === 'function') raf(step);
  else for (const row of rows) row.child.alpha = row.base;
  return rows.map((row) => row.child);
}
