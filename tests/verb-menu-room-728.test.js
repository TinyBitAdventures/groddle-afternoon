/**
 * Report #728 (desktop 1536x702): "any object ... when I click on it, a window opens, with a menu in
 * the upper half and some description in the lower half. In a number of cases the description part
 * is so tall that I can only see 2 lines of the menu."
 *
 * The pack's menu shows the thing's description in its footer (.vm-detail), locked to the height of
 * its tallest line (lockVerbMenuSize). A card taller than the room (ticket 87) gave way only in its
 * rows (fitVerbMenuRows, menuRowsCap): the description kept all its height and the verbs were cut to
 * MIN_ROWS_BOX, about three rows. At 1536x702 a stack in an open bag (the card stands on the bag's
 * tray) with a long description does it: the beta testers' item showed 6 of its 9 verbs.
 *
 * Now the verbs come first (menuFitCaps): the footer gives up what the card is over, down to about
 * three lines, and scrolls; only then do the rows. Glitch had no description in its verb menu (its
 * desc_tf was the verb's one-line tooltip, InteractionMenu.as 192-201, 916-928), so the layout is ours.
 *
 * Run: node --test tests/verb-menu-room-728.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_DETAIL_BOX, MIN_ROWS_BOX, fitVerbMenuRows, lockVerbMenuSize, menuFitCaps } from '../public/js/ui/verb-menu.js?v=1ad4f969';

/** A box whose height is its content's, capped by its own max-height (as a browser lays it out). */
function box(natural, extra = {}) {
  const classes = new Set();
  const el = {
    natural,
    hidden: false,
    style: { minHeight: '', maxHeight: '', overflowY: '' },
    dataset: {},
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
    get offsetHeight() {
      if (this.hidden) return 0;
      const min = parseFloat(this.style.minHeight) || 0;
      const max = parseFloat(this.style.maxHeight);
      const h = Math.max(this.natural, min);
      return Number.isFinite(max) ? Math.min(h, Math.max(max, 0)) : h;
    },
    ...extra,
  };
  return el;
}

/** A pack card: its head and link (fixed), its rows box and its footer. */
function card({ head = 60, rows, detail }) {
  const rowsEl = box(rows);
  const detailEl = box(0);
  detailEl.dataset.vmLockH = String(detail);
  detailEl.style.minHeight = `${detail}px`;
  const el = {
    querySelector: (sel) => (sel === '.vm-detail' ? detailEl : null),
    get offsetHeight() { return head + rowsEl.offsetHeight + detailEl.offsetHeight; },
  };
  return { el, rowsEl, detailEl };
}

describe('#728: the verbs keep their room before the description', () => {
  it('menuFitCaps: the footer gives way first, down to about three lines, then the rows', () => {
    assert.deepEqual(menuFitCaps({ card: 400, rows: 288, detail: 174, room: 420 }), { rows: null, detail: null }, 'fits: nothing capped');
    assert.deepEqual(menuFitCaps({ card: 532, rows: 288, detail: 174, room: 427 }), { rows: null, detail: 69 }, 'the beta testers\' item in a bag: all 9 verbs');
    assert.deepEqual(menuFitCaps({ card: 640, rows: 288, detail: 287, room: 420 }), { rows: null, detail: 67 }, 'a very long description: still every verb');
    const tight = menuFitCaps({ card: 700, rows: 420, detail: 200, room: 200 });
    assert.equal(tight.detail, MIN_DETAIL_BOX, 'the footer keeps about three lines');
    assert.equal(tight.rows, MIN_ROWS_BOX, 'and the rows their three');
    assert.deepEqual(menuFitCaps({ card: 700, rows: 420, detail: 40, room: 588 }), { rows: 308, detail: null }, 'a short footer keeps its size: the rows give way as before');
    assert.deepEqual(menuFitCaps({ card: 700, rows: 420, detail: 200, room: 0 }), { rows: null, detail: null }, 'no room measured');
  });

  it('the player\'s screen: a long description no longer leaves 2 or 3 verbs (fitVerbMenuRows)', () => {
    // 9 verbs of 32 px and a description 287 px tall, in 420 px of room (a card over an open bag at 1536x702).
    const { el, rowsEl, detailEl } = card({ rows: 9 * 32, detail: 287 });
    assert.equal(fitVerbMenuRows(el, rowsEl, 420), null, 'no rows cap');
    assert.equal(rowsEl.offsetHeight, 288, 'every verb shows');
    assert.ok(el.offsetHeight <= 420, `the card fits (${el.offsetHeight})`);
    assert.equal(detailEl.offsetHeight, 420 - 60 - 288);
    assert.equal(detailEl.style.overflowY, 'auto', 'the description scrolls');
    assert.ok(detailEl.classList.contains('vm-scroll'));
    assert.equal(detailEl.style.minHeight, detailEl.style.maxHeight, 'a fixed height: the card never shifts under the pointer');
    // The same card with room again: the footer is back to its locked height, nothing scrolls.
    assert.equal(fitVerbMenuRows(el, rowsEl, 800), null);
    assert.equal(detailEl.offsetHeight, 287);
    assert.equal(detailEl.style.maxHeight, '');
    assert.equal(detailEl.style.overflowY, '');
    assert.ok(!detailEl.classList.contains('vm-scroll'));
  });

  it('lockVerbMenuSize measures the footer uncapped and remembers that height for the fit', () => {
    const detail = box(0);
    detail.style.maxHeight = '70px';
    let text = '';
    Object.defineProperty(detail, 'textContent', { get: () => text, set: (v) => { text = v; detail.natural = v ? 30 + v.length : 0; } });
    const row = { hidden: false, getClientRects: () => [1], getAttribute: () => null, hasAttribute: () => false, dataset: { vmTip: 'Eat it.' } };
    const menu = { dataset: { vmDefault: 'x'.repeat(200) }, querySelector: () => detail, querySelectorAll: () => [row] };
    lockVerbMenuSize(menu);
    assert.equal(detail.style.minHeight, '230px', 'the whole description, not the last cap');
    assert.equal(detail.dataset.vmLockH, '230');
    assert.equal(detail.style.maxHeight, '');
  });
});
