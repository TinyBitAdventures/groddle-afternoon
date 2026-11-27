/**
 * R9 (G967): the one registry of the places a dragged stack can go, for the mouse and for touch.
 *
 * Before it each target wired its own HTML5 dragstart, dragover and drop listeners, and the pack's
 * touch lift (report 37) told only the cabinet (#407, G865), so on a phone a pack stack could not go
 * into a Storage Display Box (#470), a trade, a gift, a garden plot, a vendor or onto a thing on the
 * street. Now a target registers once here, and the mouse drag (the pack slot's HTML5 drag) and the
 * touch lift (touchLift: hold still, then the finger carries the stack) both find it through the
 * same resolve, as Glitch's client asked one function for the target under the dragged stack
 * (DragVO.as findDragTargetForStack 122-198: players first, then a garden's plots, then the things
 * that take it; every target an IDragTarget with highlightOnDragOver / unhighlightOnDragOut).
 *
 * A target: {
 *   id,                       a short name (QA: <html data-drop-over / data-drop-last>)
 *   order,                    lower asks first (DragVO's order: the pack bar, windows, then players, plots, things)
 *   scope() -> Element|null,  the element a point must be inside (null: not now)
 *   start(drag),              a drag began (a target may take up its own state, as each dragstart watcher did)
 *   over(drag, at) -> null | { ok, effect? }   null: not mine; ok false: mine but refused (the target shows why)
 *   drop(drag, at, res),      let go over it (res is over's answer; a refusal is the target's to name)
 *   leave(drag),              the drag moved off it
 *   end(drag),                any drag ended (dropped, cancelled, or the lift let go)
 * }
 * drag: { stack: { from: 'pack'|'cabinet'|'trade', cls, count, copy, bag, container, index, tool, vendor, slot }, input: 'mouse'|'touch' }
 * at: { x, y, el } in client px, el the element under the point.
 *
 * Every drop target in the game lives here: tests/drop-targets.test.js fails on a drop or dragover
 * listener anywhere else (save the two that take files from the desktop, not stacks).
 */

const targets = new Map();
let drag = null;
let overNow = null; // { target, res }
let mark = null; // the document element whose dataset carries the QA marks

function setMark(key, value) {
  if (mark?.dataset) mark.dataset[key] = value;
}

/** Registers a target (replacing one of the same id); returns its unregister. */
export function registerDropTarget(target) {
  if (!target?.id || typeof target.over !== 'function' || typeof target.drop !== 'function') throw new Error('a drop target needs an id, over() and drop()');
  const t = { order: 50, ...target };
  targets.set(t.id, t);
  // A target that comes while a drag is under way (a window opened mid-drag) hears it too.
  if (drag) t.start?.(drag);
  return () => {
    if (targets.get(t.id) !== t) return;
    if (overNow?.target === t) overNow = null;
    targets.delete(t.id);
  };
}

/** The ids registered, in asking order (QA and tests). */
export function dropTargetIds() {
  return ordered().map((t) => t.id);
}

function ordered() {
  return [...targets.values()].sort((a, b) => a.order - b.order);
}

/** The drag under way, or null. */
export function currentDrag() {
  return drag;
}

/** A drag begins: every target hears start (an unfinished one ends first). */
export function beginDrag(stack, { input = 'mouse' } = {}) {
  if (drag) endDrag();
  if (!stack?.cls && stack?.from === 'pack') return null;
  drag = { stack, input };
  for (const t of ordered()) t.start?.(drag);
  setMark('dropOver', '');
  return drag;
}

/** PURE over the registry: the first target (by order) whose scope holds the point and that answers. */
export function resolveDrop(at, d = drag) {
  if (!d) return null;
  for (const t of ordered()) {
    if (t.scope) {
      const s = t.scope();
      if (!s || !at?.el || !(s === at.el || s.contains?.(at.el))) continue;
    }
    const res = t.over(d, at);
    if (res) return { target: t, res };
  }
  return null;
}

/** The drag moves: lights the target under it (the last one hears leave). Returns over's answer or null. */
export function dragOver(at) {
  if (!drag) return null;
  const hit = resolveDrop(at);
  if (overNow && overNow.target !== hit?.target) overNow.target.leave?.(drag);
  overNow = hit;
  setMark('dropOver', hit ? `${hit.target.id}:${hit.res.ok === false ? 'no' : 'ok'}` : '');
  return hit;
}

/** Let go: the target under the point takes it. Returns { id, ok } or null when nothing did; the drag ends. */
export function dragDrop(at) {
  if (!drag) return null;
  const d = drag;
  const hit = resolveDrop(at);
  if (overNow && overNow.target !== hit?.target) overNow.target.leave?.(d);
  overNow = null;
  let out = null;
  if (hit) {
    out = { id: hit.target.id, ok: hit.res.ok !== false };
    setMark('dropLast', `${hit.target.id}:${out.ok ? 'ok' : 'no'}:${d.input}`);
    try {
      hit.target.drop(d, at, hit.res);
    } finally {
      if (drag === d) endDrag();
    }
    return out;
  }
  setMark('dropLast', `none:${d.input}`);
  if (drag === d) endDrag();
  return out;
}

/** The drag ends without a drop (or after one): leave, then every target's end. */
export function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (overNow) overNow.target.leave?.(d);
  overNow = null;
  setMark('dropOver', '');
  for (const t of ordered()) t.end?.(d);
}

/**
 * What a dragged stack passes over to the world under it. Glitch asked the location itself whether the
 * dragged stack was over it (LocationInputHandler.as _packDragMoveHandler 655-658:
 * _locationRenderer.hitTestObject, whatever was drawn on top) and scrolled at the view's edge by the
 * pointer alone (HandOfDecorator.as maybeScrollVPByDragging). Here the element under the pointer decided,
 * so a stack held over the HUD or a card fell out of the room. Two kinds:
 *
 * - The HUD drawn over the location: the top bar (stats, Currants, buttons), the street map, the name
 *   plate, the Social rail (the drawer shut: open, it is a window), the pinned quests, the effects, the
 *   tracker, a phone's stick and jump, and a home's Decorate and Cultivate buttons. In Classic the
 *   Currants counter sits on the view's left edge at floor height.
 * - What pops up by itself, mid-drag too: the Magic Rock's New Quest card and the other conversation
 *   cards and prompts (#quest-dialogue, its shade covering the view), the familiar's card, the prompts
 *   beside the pack, and the notices (the butler's, the mail's). Glitch's drag went on under a card that
 *   took focus (Cursor.as blur does nothing). Its screens waited for the drag instead
 *   (js/screen-queue.js SCREEN_GATES 'Cursor').
 */
export const DROP_THROUGH = [
  '.top-bar', '#street-minimap', '#street-nameplate', '.social-rail', '.local-chat-dock:not(.is-open)', '#quest-pins', '#buff-strip', '#play-context', '#touch-controls', '#homes-modes',
  '#quest-dialogue', '#familiar-dialog', '#prompt-stack', '#notify-notices',
];
const DROP_THROUGH_SELECTOR = DROP_THROUGH.join(', ');

/**
 * The point a drag is at, with the element that decides it: the element under the pointer, or, over
 * what a drag passes over (DROP_THROUGH), the first element under that (document.elementsFromPoint).
 */
export function dropPoint(doc, x, y, el) {
  if (!el?.closest?.(DROP_THROUGH_SELECTOR)) return { x, y, el };
  const under = doc?.elementsFromPoint?.(x, y) || [];
  return { x, y, el: under.find((n) => n && !n.closest?.(DROP_THROUGH_SELECTOR)) || el };
}

/**
 * The mouse: one dragover, one drop and one dragend listener for the whole page. A source's
 * dragstart calls beginDrag; HTML5 hands the point and the element under it.
 */
export function installDropRegistry(doc = globalThis.document) {
  if (!doc || doc.__dropRegistry) return;
  doc.__dropRegistry = true;
  mark = doc.documentElement || null;
  const at = (e) => dropPoint(doc, e.clientX, e.clientY, e.target);
  doc.addEventListener('dragover', (e) => {
    if (!drag) return;
    const hit = dragOver(at(e));
    if (!hit) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = hit.res.effect || (hit.res.ok === false ? 'none' : 'move');
  });
  doc.addEventListener('drop', (e) => {
    if (drag && dragDrop(at(e))) e.preventDefault();
  });
  // A source redrawn by its own drop is gone from the page, so its dragend may never bubble here: the drop ends the drag too.
  doc.addEventListener('dragend', () => endDrag());
}

/**
 * Touch (report 37): a stack held still for a moment lifts, follows the finger and drops where it
 * is let go, as a mouse drag does; a finger that moves first scrolls as before. `box` holds the
 * slots; `selector` finds the slot under the finger; `stackOf(slot)` is the stack (null: it does not
 * lift); `onLift(slot)` and `onEnd(slot, lifted)` let the source dress the slot. Returns an uninstall.
 */
export function touchLift(box, { selector, stackOf, onLift, onEnd, holdMs = 350, doc = globalThis.document } = {}) {
  if (!box || !doc) return () => {};
  let touch = null;
  const end = () => {
    if (!touch) return;
    const t = touch;
    touch = null;
    clearTimeout(t.timer);
    t.ghost?.remove?.();
    onEnd?.(t.slot, t.on);
    if (t.on && drag) endDrag();
  };
  const atPoint = (x, y) => dropPoint(doc, x, y, doc.elementFromPoint?.(x, y) || null);
  const down = (event) => {
    if (event.pointerType !== 'touch' || touch) return;
    const slot = event.target?.closest?.(selector);
    if (!slot || !box.contains(slot)) return;
    const t = { slot, id: event.pointerId, x: event.clientX, y: event.clientY, on: false, ghost: null };
    touch = t;
    t.timer = setTimeout(() => {
      if (touch !== t) return;
      const stack = stackOf(slot);
      if (!stack) {
        touch = null;
        return;
      }
      t.on = true;
      onLift?.(slot);
      beginDrag(stack, { input: 'touch' });
      const r = slot.getBoundingClientRect();
      const ghost = slot.cloneNode?.(true);
      if (ghost) {
        ghost.removeAttribute?.('id');
        ghost.classList.add('pack-touch-ghost');
        ghost.style.cssText = `position:fixed;left:${t.x - r.width / 2}px;top:${t.y - r.height / 2}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;opacity:.85;z-index:2147483000`;
        doc.body.appendChild(ghost);
        t.ghost = ghost;
      }
    }, holdMs);
  };
  const move = (event) => {
    if (!touch || event.pointerId !== touch.id) return;
    if (!touch.on) {
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10) end();
      return;
    }
    if (touch.ghost) {
      const r = touch.ghost.getBoundingClientRect();
      touch.ghost.style.left = `${event.clientX - r.width / 2}px`;
      touch.ghost.style.top = `${event.clientY - r.height / 2}px`;
    }
    dragOver(atPoint(event.clientX, event.clientY));
  };
  const up = (event) => {
    if (!touch || event.pointerId !== touch.id) return;
    if (touch.on) {
      // The tap that ends a lift is not a click on the slot (that would open its menu).
      const eat = (e) => { e.stopPropagation(); e.preventDefault(); };
      doc.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => doc.removeEventListener('click', eat, true), 400);
      if (drag) dragDrop(atPoint(event.clientX, event.clientY));
    }
    end();
  };
  const cancel = (event) => { if (touch && event.pointerId === touch.id) end(); };
  // Lifted, the finger drags the stack: no scrolling, no long-press menu, no native drag on top.
  const noScroll = (event) => { if (touch?.on) event.preventDefault(); };
  const noMenu = (event) => { if (touch) event.preventDefault(); };
  const noNative = (event) => { if (touch?.on) event.preventDefault(); };
  box.addEventListener('pointerdown', down);
  box.addEventListener('pointermove', move);
  box.addEventListener('touchmove', noScroll, { passive: false });
  box.addEventListener('contextmenu', noMenu);
  box.addEventListener('dragstart', noNative, true);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  return () => {
    end();
    box.removeEventListener?.('pointerdown', down);
    box.removeEventListener?.('pointermove', move);
    box.removeEventListener?.('touchmove', noScroll, { passive: false });
    box.removeEventListener?.('contextmenu', noMenu);
    box.removeEventListener?.('dragstart', noNative, true);
    doc.removeEventListener?.('pointerup', up);
    doc.removeEventListener?.('pointercancel', cancel);
  };
}

/** A pack slot's stack, as the mouse and the touch lift both carry it. */
export function packStackOf(slot, extra = {}) {
  const d = slot?.dataset || {};
  const copy = d.packCopy != null && d.packCopy !== '' && Number.isInteger(Number(d.packCopy)) ? Number(d.packCopy) : null;
  return {
    from: 'pack',
    cls: d.tsid || '',
    count: Math.max(1, Math.floor(Number(d.packCount) || 1)),
    copy,
    bag: d.packBag || '',
    container: d.packContainer ?? null,
    index: d.packIndex != null && d.packIndex !== '' ? Number(d.packIndex) : null,
    slot,
    ...extra,
  };
}
