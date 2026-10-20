/**
 * Pure pack-pager geometry. The recovered client pages by the largest whole
 * number of slots that fits in the viewport, rather than by arbitrary pixels.
 */

export function packPagerState({
  scrollLeft = 0,
  clientWidth = 0,
  scrollWidth = 0,
} = {}, epsilon = 2) {
  const viewport = Math.max(0, Number(clientWidth) || 0);
  const content = Math.max(0, Number(scrollWidth) || 0);
  const max = Math.max(0, content - viewport);
  const left = Math.min(max, Math.max(0, Number(scrollLeft) || 0));
  const overflow = max > epsilon;
  return {
    overflow,
    max,
    left,
    canBack: overflow && left > epsilon,
    canForward: overflow && left < max - epsilon,
  };
}

export function packPageStep(clientWidth, slotStep) {
  const viewport = Math.max(0, Number(clientWidth) || 0);
  const slot = Math.max(1, Number(slotStep) || 1);
  return Math.max(slot, Math.floor(viewport / slot) * slot);
}

export function packPageTarget(metrics, direction, slotStep) {
  const state = packPagerState(metrics);
  const delta = Math.sign(Number(direction) || 0) * packPageStep(metrics?.clientWidth, slotStep);
  return Math.min(state.max, Math.max(0, state.left + delta));
}
