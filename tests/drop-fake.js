/**
 * A fake page for the drop registry (js/drop-targets.js, R9 G967): a document whose elementFromPoint
 * answers what the test puts under the finger, a pack row holding one pack slot, and the two ways a
 * stack is carried, the touch lift (touchLift: hold, move, let go) and the mouse (the slot's HTML5
 * dragstart, then dragover and drop on the document). Shared by tests/drop-targets.test.js,
 * tests/g865-cabinet-touch-drop.test.js and tests/trade.test.js.
 */
import { beginDrag, installDropRegistry, packStackOf, touchLift } from '../public/js/drop-targets.js?v=d5325567';

export function fakeDoc() {
  const listeners = {};
  const doc = {
    listeners,
    documentElement: { dataset: {} },
    body: { appendChild() {} },
    under: null,
    elementFromPoint() { return doc.under; },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    fire(t, init = {}) {
      const e = { type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...init };
      for (const fn of [...(listeners[t] || [])]) fn(e);
      return e;
    },
  };
  return doc;
}

/** A pack slot as game.js draws it (data-tsid, data-pack-count, data-pack-container, data-pack-index). */
export function fakeSlot(cls, count = 1, extra = {}) {
  const slot = {
    dataset: { tsid: cls, packCount: String(count), packContainer: 'pack', packIndex: '0', ...extra },
    classList: { add() {}, remove() {}, contains: () => false },
    draggable: true,
    closest() { return slot; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
  };
  return slot;
}

/** A pack row: what touchLift listens on. */
export function fakeRow(slots) {
  const listeners = {};
  return {
    contains: (n) => slots.includes(n),
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    fire(t, init) {
      const e = { type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
      for (const fn of [...(listeners[t] || [])]) fn(e);
      return e;
    },
  };
}

/** One page: the document with the registry's mouse listeners, and a row whose slots lift by touch. */
export function dropPage(slots = []) {
  const doc = fakeDoc();
  installDropRegistry(doc);
  const row = fakeRow(slots);
  touchLift(row, { selector: '.pack-slot', stackOf: (slot) => packStackOf(slot), holdMs: 1, doc });
  return { doc, row };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/** A finger holds the slot, moves onto `el` at (x, y) and lets go there. Resolves the document's pointerup. */
export async function touchDrop(page, slot, el, x = 200, y = 300) {
  page.row.fire('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10, target: slot });
  await tick(5);
  page.doc.under = el;
  page.row.fire('pointermove', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, target: slot });
  return page.doc.fire('pointerup', { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y });
}

/** The mouse: the slot's dragstart (as game.js renderPackRow begins it), dragover and drop on `el`. */
export function mouseDrop(page, slot, el, x = 200, y = 300) {
  beginDrag(packStackOf(slot), { input: 'mouse' });
  const over = page.doc.fire('dragover', { target: el, clientX: x, clientY: y });
  const drop = page.doc.fire('drop', { target: el, clientX: x, clientY: y });
  page.doc.fire('dragend', {});
  return { over, drop };
}
