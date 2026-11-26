/**
 * Report #557: Enter held a moment past the keyboard's repeat delay opened a verb menu (keydown) and
 * its repeat then pressed the menu's lit row, the first one that can be done: at an empty machine that
 * was Refuel, and a Fuel Cell went in that the player never chose. A held digit pressed its row again
 * and again, and a held Enter in How many? pressed OK. A held key's repeat now never picks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verbMenuKey } from '../public/js/ui/verb-menu.js?v=1ad4f969';
import { bindCountField } from '../public/js/ui/count-chooser.js?v=75f69512';

describe('#557: a held key never picks a row', () => {
  const menu = () => {
    const clicks = [];
    const row = (verb) => ({ dataset: { verb }, hidden: false, getClientRects: () => [1], hasAttribute: () => false, getAttribute: () => null, focus() {}, click() { clicks.push(verb); }, classList: { toggle() {}, contains: () => false }, closest() { return this; } });
    const rows = [row('use'), row('refuel')];
    const doc = { activeElement: rows[1] };
    return { clicks, el: { ownerDocument: doc, querySelectorAll: () => rows, querySelector: () => null, dataset: {} } };
  };

  it("Enter's repeat on the lit row is stopped (the caller prevents the button's own press)", () => {
    const { el, clicks } = menu();
    assert.equal(verbMenuKey(el, { key: 'Enter' }), false, 'a fresh Enter is the focused button\'s');
    assert.equal(verbMenuKey(el, { key: 'Enter', repeat: true }), true);
    assert.equal(verbMenuKey(el, { key: ' ', repeat: true }), true);
    assert.deepEqual(clicks, []);
  });

  it('a digit picks its row once; its repeat picks nothing', () => {
    const { el, clicks } = menu();
    assert.equal(verbMenuKey(el, { key: '2' }), true);
    assert.equal(verbMenuKey(el, { key: '2', repeat: true }), true);
    assert.equal(verbMenuKey(el, { key: '2', repeat: true }), true);
    assert.deepEqual(clicks, ['refuel']);
  });

  it("How many?'s field takes a fresh Enter as OK, never a held one's repeat", () => {
    const handlers = {};
    const input = { dataset: {}, value: '2', addEventListener: (type, fn) => { handlers[type] = fn; } };
    const oks = [];
    bindCountField(input, { max: () => 3, set() {}, confirm: (n) => oks.push(n), cancel() {} });
    const key = (k, repeat = false) => handlers.keydown({ key: k, repeat, preventDefault() {}, stopPropagation() {} });
    key('Enter', true);
    assert.deepEqual(oks, []);
    key('Enter');
    assert.deepEqual(oks, [2]);
  });
});
