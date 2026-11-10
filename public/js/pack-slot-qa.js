/**
 * QA routes that open a stack's pack card the way a player does: a click on its slot.
 *
 * Since bags (G152) a fresh solo game keeps its tools in the Red Toolbox and most of its items in
 * Bigger Bags, and a closed bag's stacks are not drawn. A route's
 * `.pack-slot[data-tsid="<class>"]` then found nothing and its click did nothing: machineartdemo
 * never opened Make, the cubimal demo's drop and set-free never opened the card, and the Top of the
 * Tree autoplay never ate its Spinach. packSlotFor opens the bag that holds the stack first, as a
 * click on the bag does (bags-feature packToggleBag, one open bag at a time), and returns the slot.
 */

/** The key of the bag whose slots hold `classTsid` ('' when it lies in the pack's own row, or nowhere). */
export function bagHolding(layout, classTsid) {
  const cls = String(classTsid || '');
  if (!cls || !layout) return '';
  if ((layout.pack?.slots || []).some((s) => s?.kind !== 'bag' && s?.cls === cls)) return '';
  for (const [key, box] of Object.entries(layout.bags || {})) {
    if ((box?.slots || []).some((s) => s?.cls === cls)) return key;
  }
  return '';
}

/**
 * The pack slot that shows a stack of `classTsid`, with its bag opened first when it sits in a
 * closed one; null when the pack holds none. For QA routes only: play code opens nothing by itself.
 */
export function packSlotFor(engine, classTsid, doc = globalThis.document) {
  const find = () => doc?.querySelector?.(`.pack-slot[data-tsid="${classTsid}"]`) || null;
  const shown = find();
  if (shown) return shown;
  const key = bagHolding(engine?.query?.('packLayout', engine), classTsid);
  if (!key) return null;
  if (engine.query('packOpenBag') !== key) engine.query('packToggleBag', key, engine);
  engine.refreshPack?.();
  return find();
}
