/**
 * Chat logs that keep their rows (Austin 2026-11-04: "I click and drag to highlight however the drag
 * select disappears after a second or 2"). The Social drawer drew its log again from nothing on every
 * change anywhere (a buddy moving, someone joining the street, a new Activity line), and a selection
 * goes with the nodes it is in. Now each row is made once and kept by what it shows (createNodeCache),
 * and a redraw only adds, takes away or moves the rows that changed (reconcileChildren): a row you are
 * selecting in stays the same node, so the selection stays and Cmd+C copies it.
 */

/**
 * A cache of rows by key: get(key, make) gives the row made for that key before, or makes it; sweep()
 * after a redraw forgets the rows that redraw did not use.
 */
export function createNodeCache() {
  let had = new Map();
  let used = new Map();
  return {
    get(key, make) {
      if (used.has(key)) return used.get(key);
      let node = had.get(key);
      if (!node) node = make();
      used.set(key, node);
      return node;
    },
    sweep() {
      had = used;
      used = new Map();
    },
    clear() {
      had = new Map();
      used = new Map();
    },
    get size() {
      return had.size;
    },
  };
}

/**
 * PURE: keys for a run of items, each made unique (the same key again gets #2, #3): `keyOf(item)`.
 */
export function uniqueKeys(items, keyOf) {
  const seen = new Map();
  return items.map((it) => {
    const k = String(keyOf(it));
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  });
}

function kids(parent) {
  return parent.childNodes ? [...parent.childNodes] : [...(parent.children || [])];
}

/**
 * Makes `parent`'s children exactly `nodes`, in order, touching only what differs: a node already in
 * its place is left alone (not taken out and put back), so a selection inside it survives. Returns the
 * number of nodes added, moved or removed (0: nothing changed).
 */
export function reconcileChildren(parent, nodes) {
  if (!parent) return 0;
  if (typeof parent.insertBefore !== 'function' || typeof parent.removeChild !== 'function') {
    const now = kids(parent);
    if (now.length === nodes.length && now.every((n, i) => n === nodes[i])) return 0;
    parent.replaceChildren(...nodes);
    return nodes.length;
  }
  let changed = 0;
  const want = new Set(nodes);
  for (const c of kids(parent)) {
    if (!want.has(c)) {
      parent.removeChild(c);
      changed += 1;
    }
  }
  let at = parent.firstChild ?? null;
  for (const n of nodes) {
    if (n === at) {
      at = at.nextSibling ?? null;
      continue;
    }
    parent.insertBefore(n, at);
    changed += 1;
  }
  return changed;
}

/**
 * A press on a log's words (to select them, or a plain click) leaves the keyboard with the world, as
 * a click anywhere else in the drawer does (ticket 37): while the press lasts the log is not
 * focusable (its tabindex is put back when the press ends), so the press selects without taking
 * the keyboard and the arrow keys still walk the avatar. Blurring the log afterwards would not do:
 * WebKit drops a selection when the element holding it loses the focus. The selection stays and
 * Cmd+C copies it. A press on a button, a link or a field inside the log is theirs; Tab still
 * focuses the log.
 */
export function pressLeavesKeys(log, { doc = globalThis.document } = {}) {
  if (!log?.addEventListener || !doc?.addEventListener) return false;
  let held = null;
  const restore = () => {
    if (held === null) return;
    if (log.getAttribute('tabindex') === null) log.setAttribute('tabindex', held);
    held = null;
  };
  log.addEventListener('pointerdown', (e) => {
    restore();
    const hit = e.target?.closest?.('button, a, input, textarea, select, [tabindex]');
    if (e.button !== 0 || (hit && hit !== log)) return;
    const t = log.getAttribute('tabindex');
    if (t === null) return;
    held = t;
    log.removeAttribute('tabindex');
  });
  doc.addEventListener('pointerup', restore, true);
  doc.addEventListener('pointercancel', restore, true);
  return true;
}
