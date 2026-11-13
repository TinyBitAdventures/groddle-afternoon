/**
 * Report #288 (Mrs_Ike, the Produce Vendor's Sell tab): "The Sell screen jumps back to the top after
 * each sell." A redraw that hides or rebuilds a list (game.js renderVendorList: Classic swaps the shelf
 * for the count chooser, then draws it again after the sale) lost where its scrollers sat.
 *
 * One remembered place, by key (the vendor and its tab): take() it while the list shows, restore() it
 * after the redraw when the key is still the same. Pure apart from the nodes' scrollTop.
 */
export function createScrollKeep() {
  let kept = null;
  return {
    /** Remember each node's scrollTop under this key (a missing node keeps 0). */
    take(key, nodes = []) {
      kept = { key: String(key || ''), tops: nodes.map((n) => Number(n?.scrollTop) || 0) };
    },
    /** Put them back when the key matches; true when it did. */
    restore(key, nodes = []) {
      if (!kept || !kept.key || kept.key !== String(key || '')) return false;
      nodes.forEach((n, i) => {
        if (n && Math.abs((Number(n.scrollTop) || 0) - kept.tops[i]) > 0.5) n.scrollTop = kept.tops[i];
      });
      return true;
    },
    clear() {
      kept = null;
    },
    peek() {
      return kept ? { key: kept.key, tops: [...kept.tops] } : null;
    },
  };
}
