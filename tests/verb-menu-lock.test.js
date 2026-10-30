// The verb menu's footer keeps one height while it is open (Austin 2026-10-30): it hangs from its
// bottom edge, so a footer that grew and shrank with the hovered row slid the rows under a still
// pointer, picked another row, and looped.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockVerbMenuSize } from '../public/js/ui/verb-menu.js?v=g477-1';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

/** A footer whose height is one 18 px line per 30 characters, and rows carrying their tips. */
function fakeMenu(tips, { def = '' } = {}) {
  const detail = { textContent: '', hidden: false, style: {}, get offsetHeight() { return this.hidden ? 0 : 12 + 18 * Math.max(1, Math.ceil(this.textContent.length / 30)); } };
  const rows = tips.map((t) => ({ hidden: false, dataset: { vmTip: t }, getAttribute: () => null, hasAttribute: () => false, getClientRects: () => [1] }));
  const el = { dataset: { vmDefault: def }, querySelector: (q) => (q === '.vm-detail' ? detail : null), querySelectorAll: () => rows };
  return { el, detail, rows };
}

describe('verb menu footer lock', () => {
  it('reserves the tallest line any row can show, and puts back what was shown', () => {
    const { el, detail } = fakeMenu(['Move to Bigger Bag', '+2 mood, fresh tune +50 iMG · DR series 2/5']);
    detail.textContent = 'Move to Bigger Bag';
    lockVerbMenuSize(el);
    assert.equal(detail.style.minHeight, '48px', 'two lines');
    assert.equal(detail.textContent, 'Move to Bigger Bag');
    assert.ok(el.dataset.vmLock);
  });
  it('measures once per set of rows', () => {
    const { el, detail } = fakeMenu(['a', 'b']);
    lockVerbMenuSize(el);
    detail.style.minHeight = 'kept';
    lockVerbMenuSize(el);
    assert.equal(detail.style.minHeight, 'kept');
  });
  it('waits while the footer has no layout (a hidden menu), so it measures when shown', () => {
    const { el, detail } = fakeMenu(['a']);
    Object.defineProperty(detail, 'offsetHeight', { get: () => 0 });
    lockVerbMenuSize(el);
    assert.equal(el.dataset.vmLock, undefined);
  });
  it('both menus lock before they are measured and placed, and forget the lock when redrawn', () => {
    const pack = game.slice(game.indexOf('function positionPackPopover('), game.indexOf('function paradiseCourseForTicket('));
    assert.ok(pack.indexOf('lockVerbMenuSize(pop)') < pack.indexOf('pop.offsetWidth'));
    const world = game.slice(game.indexOf('function placeWorldVerbMenu('));
    assert.ok(world.indexOf('lockVerbMenuSize(menu)') < world.indexOf('card.offsetHeight'));
    assert.match(game, /pop\.innerHTML = markup;\n\s+delete pop\.dataset\.vmLock;/);
    assert.match(game, /delete menu\.dataset\.vmLock;\n\s+list\.innerHTML = '';/);
  });
});
