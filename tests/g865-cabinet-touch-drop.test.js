/**
 * #407 (G865): on a phone a pack stack lifted by a long press could be dragged over an open
 * cabinet, but letting go there did nothing: the cabinet listened only for the mouse's HTML5 drop
 * (js/ui/storage-windows.js), and the touch lift (game.js setupPackDrops) dropped only on pack
 * slots. R9 (G967): the cabinet is a target of the drop registry (js/drop-targets.js), which the
 * touch lift and the mouse both ask, and it puts the stack in as a mouse drop does
 * (CabinetDialog.as findDropTarget: an empty slot, or the same class under its stackmax).
 * Run: node --test tests/g865-cabinet-touch-drop.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { page } from './social-fake-dom.js';
import { dropPage, fakeSlot, touchDrop, mouseDrop } from './drop-fake.js';
import { beginDrag, dragOver, endDrag, packStackOf } from '../public/js/drop-targets.js?v=d5325567';
import { openCabinetWindow, closeStorageWindow } from '../public/js/ui/storage-windows.js?fresh=g865-cabinet-touch-drop';

describe('a touch drag from the pack onto a cabinet (#407)', () => {
  const saved = {};
  let h;
  let t;
  let drops;
  const puts = [];
  const moves = [];
  let refuse = null;

  before(() => {
    for (const k of ['document']) saved[k] = globalThis[k];
    t = page();
    t.doc.removeEventListener = () => {};
    globalThis.document = t.doc;
    h = openCabinetWindow({
      title: 'Cabinet',
      cols: 4,
      rowsDisplay: 2,
      slots: [{ classTsid: 'apple', count: 3 }, null, { classTsid: 'cherry', count: 1 }, null],
      item: (cls) => ({ label: cls, icon: '' }),
      accepts: (cls) => (cls === refuse ? 'That cannot go in here.' : null),
      stackmax: () => 10,
      put: (stack) => { puts.push(stack); },
      take: () => {},
      move: (from, to) => { moves.push([from, to]); },
    });
    drops = dropPage([]);
  });
  after(() => {
    try { closeStorageWindow(); } catch { /* the fake DOM's elements have no remove() */ }
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  const slot = (i) => h.root.querySelector(`[data-hst-slot="${i}"]`);
  const lift = (s) => { drops.row.contains = (n) => n === s; return s; };

  it('lights the slot it would go into, and names a refusal', () => {
    beginDrag(packStackOf(fakeSlot('apple', 2)), { input: 'touch' });
    assert.equal(dragOver({ x: 200, y: 300, el: slot(1) }).res.ok, true);
    assert.ok(slot(1).classList.contains('is-over'));
    endDrag();
    assert.ok(!slot(1).classList.contains('is-over'), 'the lift ending clears it');
    refuse = 'pick';
    beginDrag(packStackOf(fakeSlot('pick', 1)), { input: 'touch' });
    assert.equal(dragOver({ x: 220, y: 300, el: slot(3) }).res.ok, false);
    assert.ok(slot(3).classList.contains('is-no'));
    endDrag();
    refuse = null;
    assert.ok(!slot(3).classList.contains('is-no'));
  });

  it('let go on an empty slot: the whole stack goes in, by touch as by the mouse', async () => {
    await touchDrop(drops, lift(fakeSlot('apple', 2, { packBag: 'bag_generic_1' })), slot(1));
    // #515: the drag's own stack (its pack slot) goes along, so that stack is the one that goes in.
    const bare = (p) => { const { stack, ...rest } = p; return rest; };
    assert.deepEqual(puts.map(bare), [{ cls: 'apple', count: 2, copy: null, bag: 'bag_generic_1', slot: 1 }]);
    assert.deepEqual([puts[0].stack.container, puts[0].stack.index], ['pack', 0]);
    puts.length = 0;
    const { drop } = mouseDrop(drops, fakeSlot('apple', 2), slot(3));
    assert.equal(drop.defaultPrevented, true, 'taken');
    assert.deepEqual(puts.map(bare), [{ cls: 'apple', count: 2, copy: null, bag: '', slot: 3 }]);
  });

  it('a full slot of another class, a refused class, or somewhere outside the window takes nothing', async () => {
    puts.length = 0;
    await touchDrop(drops, lift(fakeSlot('apple', 1)), slot(2));
    refuse = 'pick';
    await touchDrop(drops, lift(fakeSlot('pick', 1)), slot(3));
    refuse = null;
    await touchDrop(drops, lift(fakeSlot('apple', 1)), t.doc.body);
    assert.deepEqual(puts, []);
    assert.equal(drops.doc.documentElement.dataset.dropLast, 'none:touch', 'outside the cabinet: not ours');
  });

  it('a cabinet slot dragged onto another slot moves (its own drag, through the registry too)', () => {
    beginDrag({ from: 'cabinet', grid: slot(0).parentElement, index: 0, cls: 'apple', count: 3 }, { input: 'mouse' });
    drops.doc.fire('dragover', { target: slot(1), clientX: 0, clientY: 0 });
    drops.doc.fire('drop', { target: slot(1), clientX: 0, clientY: 0 });
    assert.deepEqual(moves, [[0, 1]]);
  });
});
