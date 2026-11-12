/**
 * Report 236 (mr granberry): with the vendor's Sell shelf open, choosing Sell on an item in the pack
 * scrolled the shelf down to its tile but never up, so a tile above the view looked refused.
 * placeVendorPop (public/game.js) now brings the tile into view first, then as much of the pop as fits.
 * The real function runs here against stand-in DOM boxes.
 * Run: node --test tests/r236-vendor-scroll-up.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');
const src = game.slice(game.indexOf('function placeVendorPop(list, detail) {'), game.indexOf('\n}\n', game.indexOf('function placeVendorPop(list, detail) {')) + 2);
const room = Number(game.match(/const VENDOR_POP_ROOM = (\d+)/)?.[1] ?? 12);

function run({ scrollTop, tileTopInView, tileH = 90, popH = 120, clientHeight = 400 }) {
  let scrolledTo = null;
  const body = { scrollTop, clientHeight, getBoundingClientRect: () => ({ top: 0 }), scrollTo: (o) => { scrolledTo = o.top; } };
  const tile = { classList: { add() {} }, getBoundingClientRect: () => ({ top: tileTopInView, bottom: tileTopInView + tileH, left: 10, width: 60 }) };
  const list = { querySelector: () => tile, querySelectorAll: () => [], style: {}, offsetTop: 0, offsetHeight: 5000 };
  const detail = { offsetParent: body, offsetHeight: popH, style: { setProperty() {}, removeProperty() {} } };
  const fn = new Function('VENDOR_POP_ROOM', 'vendorSelected', 'CSS', 'notifyView', 'app', `${src}; return placeVendorPop;`)(room, 'apple', { escape: (s) => s }, null, null);
  fn(list, detail);
  return scrolledTo;
}

describe('report 236: the Sell shelf scrolls up to a tile above the view', () => {
  it('scrolls up when the chosen tile is above the visible part', () => {
    const to = run({ scrollTop: 900, tileTopInView: -300 });
    assert.ok(to !== null && to < 900, `scrolled up (to ${to})`);
    assert.equal(to, 900 - 300 - room, 'the tile lands at the top with a little room');
  });

  it('still scrolls down for a tile whose pop runs past the bottom', () => {
    const to = run({ scrollTop: 0, tileTopInView: 350 });
    assert.ok(to > 0, `scrolled down (to ${to})`);
  });

  it('leaves the shelf alone when the tile and its pop are in view', () => {
    assert.equal(run({ scrollTop: 100, tileTopInView: 40 }), null);
  });
});
