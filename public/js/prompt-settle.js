/**
 * Interaction-hint hysteresis. A new hint (or none) must hold for `settleMs`
 * before it replaces the shown one, so hopping at a ladder top or walking
 * the edge of an item's range doesn't flick the hint back and forth.
 */
export function createPromptSettler(settleMs = 180) {
  let pendingId = '';
  let since = 0;
  /**
   * @param {{ key: string, label: string }|null} want this frame's hint
   * @param {string} shownId the shown hint's id ('' when hidden)
   * @param {number} now ms
   * @returns {boolean} true when `want` should be applied now
   */
  return function settle(want, shownId, now) {
    const id = promptId(want);
    if (id !== pendingId) {
      pendingId = id;
      since = now;
    }
    return id === shownId || now - since >= settleMs;
  };
}

export function promptId(want) {
  return want ? `${want.key}|${want.label}` : '';
}
