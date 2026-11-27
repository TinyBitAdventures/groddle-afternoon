/**
 * #515 (R18 part 2, R9): a drop acts on the stack that was dragged, not the first of its class.
 *
 * Player report #515: a stack dragged onto Decorate came from the first stack of that class in the
 * pack, not the one dragged. Glitch's drag carried the itemstack (PackContainerView.as 329
 * dragVO.dragged_itemstack) and each target sent its tsid (HandOfDecorator.as 527,
 * LocationInputHandler.as 619 and 851, CabinetDialog.as 434, TradeDialog.as 1088). Here the drag
 * carries the slot and the copy's place (js/drag-stack.js), and every target that takes a pack stack
 * hands it on to the removal.
 *
 * - The core (js/drag-stack.js) with the real pack (features/bags-feature.js): two stacks of a class,
 *   the dragged one empties; two tools of different wear, the dragged one's wear leaves; a stack gone
 *   falls back to the class's order. Without it the first stack in slot order went.
 * - Per target: Decorate (box, room), the display box, the pour, a thing on the street (and a
 *   shrine's tool), both Butlers, a player (gift), a cabinet and a trade each take the dragged stack.
 * - The garden is a class drop in Glitch too (LocationInputHandler.as 857 handleDrop(class_tsid)): left so.
 * Run: node --test tests/drag-stack-515.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addItem, createInventory, removeItem } from '../public/js/inventory.js?v=3be7988a';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=426f342b';
import { bindToolInventory, createToolConditionState, setToolRemaining, toolCopies } from '../public/js/tools.js?v=4156bba8';
import { draggedCount, draggedHere, draggedStack, markDragged, takeDragged } from '../public/js/drag-stack.js?v=e0138d76';
import { runDrop } from '../public/js/features/world-drop-feature.js?v=707fc5a0';
import { registerButlerDrop } from '../public/js/butler-drop.js?v=c958ef1d';
import { beginDrag, dragDrop, endDrag } from '../public/js/drop-targets.js?v=59e6edb4';

const root = join(import.meta.dirname, '..', 'public');
const read = (f) => readFileSync(join(root, f), 'utf8');

/** An engine whose pack questions the real bags feature answers. */
function engineFor(items, prefs, toolState = null) {
  const inv = createInventory({});
  for (const k of Object.keys(inv)) delete inv[k]; // no starting kit: only what the test holds
  const state = toolState ? bindToolInventory(toolState, inv) : null;
  for (const [c, n] of Object.entries(items)) addItem(inv, c, n);
  const e = {
    mode: 'solo', inv, toolState: state, started: true, data: {},
    setData(k, v) { this.data[k] = v; }, pushActivity() {}, toast() {}, param: () => null, save() {}, updateHud() {}, refreshPack() {}, playSound() {},
    query: (name, ...args) => (typeof bagsFeature[name] === 'function' && name.startsWith('pack') ? bagsFeature[name](...args) : null),
  };
  bagsFeature.restore(JSON.parse(JSON.stringify({ v: 1, prefs, rock: {}, open: '', migrated: true, starter: 'none' })), e);
  bagsFeature.packLayout(e);
  return e;
}

const slots = (e) => {
  const l = bagsFeature.packLayout(e);
  const out = { pack: l.pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : `${s.cls}:${s.count}`)) };
  for (const [k, b] of Object.entries(l.bags)) out[k] = b.slots.map((s) => `${s.cls}:${s.count}`);
  return out;
};

/** Cherries: 10 in the pack, 3 in a Bigger Bag (the bag sits first, so the bag's stack is first in slot order). */
const CHERRIES = {
  items: { bag_bigger: 1, cherry: 13 },
  prefs: { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'cherry'], b1: ['cherry'] }, n: { pack: [0, 10], b1: [3] } },
};
const packCherry = { from: 'pack', cls: 'cherry', count: 10, container: 'pack', index: 1, copy: null };

/** Two Picks: a worn one (20) in the bag (first in pack order), a new one (100) in the pack. */
function picks() {
  const state = createToolConditionState();
  const e = engineFor({ bag_bigger: 1, pick: 2 }, { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'pick'], b1: ['pick'] }, n: { pack: [0, 1], b1: [1] } }, state);
  setToolRemaining(e.toolState, 'pick', 20, { copy: 0 });
  setToolRemaining(e.toolState, 'pick', 100, { copy: 1 });
  return e;
}
const wear = (e) => toolCopies(e.toolState, 'pick').map((c) => c.remaining);

describe('js/drag-stack.js with the real pack', () => {
  let e;
  beforeEach(() => { e = engineFor(CHERRIES.items, CHERRIES.prefs); });

  it('before: a removal of the class takes the first stack in slot order (the bag\'s)', () => {
    removeItem(e.inv, 'cherry', 3);
    assert.deepEqual(slots(e), { pack: ['@b1', 'cherry:10'], b1: [] });
  });

  it('the dragged stack (the pack\'s 10) is the one that empties', () => {
    const ds = draggedStack(e, packCherry);
    assert.deepEqual(ds.place, { cls: 'cherry', container: 'pack', index: 1 });
    assert.equal(draggedHere(e, ds), 10);
    assert.equal(draggedCount(e, ds), 10);
    assert.equal(takeDragged(e, ds, 10), 'stack');
    removeItem(e.inv, 'cherry', 10);
    assert.deepEqual(slots(e), { pack: ['@b1'], b1: ['cherry:3'] });
  });

  it('a mark for later (a verb after a walk) holds the slot until the removal', () => {
    const ds = draggedStack(e, packCherry);
    assert.equal(markDragged(e, ds, 1), true);
    bagsFeature.packLayout(e);
    removeItem(e.inv, 'cherry', 1);
    assert.deepEqual(slots(e), { pack: ['@b1', 'cherry:9'], b1: ['cherry:3'] });
  });

  it('a stack gone: nothing marked, the class\'s order decides', () => {
    const ds = draggedStack(e, { ...packCherry, index: 4 });
    assert.equal(draggedHere(e, ds), 0);
    assert.equal(takeDragged(e, ds, 1), '');
    assert.equal(markDragged(e, ds, 1), false);
    assert.equal(draggedStack(e, { from: 'trade', cls: 'cherry', count: 1 }), null, 'only a pack stack');
  });

  it('two Picks of different wear: the dragged one leaves with its own wear, its slot empties', () => {
    const p = picks();
    assert.deepEqual(wear(p), [20, 100]);
    // The new Pick in the pack row: its place among the class's copies is 1.
    const ds = draggedStack(p, { from: 'pack', cls: 'pick', count: 1, container: 'pack', index: 1, copy: 1 });
    assert.deepEqual(ds.pick, { copy: 1, copies: [1], r: 100, t: null });
    assert.equal(takeDragged(p, ds, 1), 'copy');
    assert.equal(wear(p).at(-1), 100, 'its wear is the one the count going down takes');
    removeItem(p.inv, 'pick', 1);
    assert.deepEqual(wear(p), [20], 'the worn one stays');
    assert.deepEqual(slots(p), { pack: ['@b1'], b1: ['pick:1'] }, 'and in its own slot');
  });

  it('the copy is found again by its wear when the pack moved meanwhile', () => {
    const p = picks();
    const ds = draggedStack(p, { from: 'pack', cls: 'pick', count: 1, container: 'b1', index: 0, copy: 0 });
    // The two swap places in the copies (as a reorder would) before the drop lands.
    p.toolState.condition.pick.copies.reverse();
    assert.equal(takeDragged(p, ds, 1), 'copy');
    removeItem(p.inv, 'pick', 1);
    assert.deepEqual(wear(p), [100], 'the worn one (dragged) went');
    assert.equal(markDragged(p, ds, 1), false, 'a class with copies is never marked for later without its copy');
  });
});

describe('every drop target hands on the dragged stack (#515)', () => {
  const homes = read('js/features/homes-feature.js');
  const part = (src, from, to) => src.slice(src.indexOf(from), to ? src.indexOf(to, src.indexOf(from)) : undefined);

  it('Decorate: a box and the room take the dragged stack (HandOfDecorator.as 527)', () => {
    const t = part(homes, "id: 'home-decorate',", "// --- #470");
    assert.match(t, /ds: draggedStack\(engine, st\)/);
    assert.match(t, /depositInBox\(engine, hit\.box, was\.classTsid, count, was\.ds\)/);
    assert.ok(t.includes('dropPackStackAt?.(was.classTsid, count, target.x + roomX0(), target.y, packDropOpts(engine, was, target))'));
    assert.match(part(homes, 'function packDropOpts(', '/** The home\'s drop targets'), /beforeRemove: \(n\) => takeDragged\(engine, was\.ds, n\)/);
    assert.match(t, /markDragged\(engine, was\.ds, 1, [^)]*\);\s+const res = placeAtPointer/, 'furniture: the piece dragged');
    const dep = part(homes, 'function depositInBox(', '// --- pack items onto shelves');
    assert.ok(dep.indexOf('takeDragged(engine, ds, n)') < dep.indexOf('displayDeposit('), 'marked before the count goes down');
    const game = read('game.js');
    const at = part(game, 'dropPackStackAt(classTsid, count, x, y, { beforeRemove = null, floor = false, beforeShare = null, into = null, merge = true, pointer = false, copy = null } = {}) {', 'takeDroppedStack(id)');
    assert.ok(at.indexOf('beforeRemove?.(n);') > 0 && at.indexOf('beforeRemove?.(n);') < at.indexOf('leavingToolPoints(classTsid, n)'), 'before the wear that goes down is read');
  });

  it('the display box outside Decorate, and the pour', () => {
    const box = part(homes, "id: 'home-display-box',", '/** The home\'s three drop targets');
    assert.match(box, /ds: draggedStack\(engine, st\)/);
    assert.match(box, /depositInBox\(engine, hit\.box, was\.classTsid, draggedCount\(engine, was\.ds\) \|\| was\.count, was\.ds\)/);
    const pour = part(homes, "id: 'home-pour',", 'function confirmDialog(');
    assert.match(pour, /ds: draggedStack\(engine, st\)/);
    assert.match(pour, /dropPour\(engine, row, ds\)/);
    assert.match(homes, /onYes: \(\) => applyPour\(engine, row, ds\)/);
    assert.match(homes, /if \(ds\) takeDragged\(engine, ds, 1\);\n  removeItem\(engine\.inv, WOTD, 1\);/);
  });

  it('a thing on the street: what the verb uses comes off the dragged stack; a tool stays and works', () => {
    const e = engineFor(CHERRIES.items, CHERRIES.prefs);
    const ds = draggedStack(e, packCherry);
    const calls = [];
    e.requestVerb = (t, v) => calls.push(v.id);
    const over = { target: { classId: 'npc_piggy' }, drop: { verb: { id: 'feed', enabled: true }, rule: { use: 'verb' } }, ok: true };
    runDrop(e, over, 'cherry', null, ds);
    assert.deepEqual(calls, ['feed']);
    bagsFeature.packLayout(e);
    removeItem(e.inv, 'cherry', 1);
    assert.deepEqual(slots(e), { pack: ['@b1', 'cherry:9'], b1: ['cherry:3'] }, 'the dragged stack fed it');
    const p = picks();
    const pds = draggedStack(p, { from: 'pack', cls: 'pick', count: 1, container: 'pack', index: 1, copy: 1 });
    p.requestVerb = () => true;
    runDrop(p, { target: { classId: 'rock_beryl_1' }, drop: { verb: { id: 'mine', enabled: true }, rule: { use: 'verb', tool: true } }, ok: true }, 'pick', 1, pds);
    assert.deepEqual(wear(p), [20, 100], 'a tool that works a rock is not taken');
    const game = read('game.js');
    assert.match(game, /openShrineDonate: \(target, classTsid, \{ copy = null \} = \{\}\) => openShrinePanel\(target, \{ item: classTsid, copy \}\),/);
    assert.match(game, /const toolCopy = TOOL_WEAR\[classTsid\] \? leavingToolCopy\(classTsid, dragged\) : null;/, 'a shrine takes the tool dragged');
  });

  it('both Butlers: the drop passes the stack, the package and the gift take from it', () => {
    const e = engineFor(CHERRIES.items, CHERRIES.prefs);
    const left = [];
    const el = { contains: (n) => n === el };
    const off = registerButlerDrop({ engine: e, scope: () => el, butlerAt: () => ({ target: {}, mine: false }), takes: () => true, leave: (d) => left.push(d) });
    beginDrag(packCherry);
    dragDrop({ x: 1, y: 1, el });
    endDrag();
    off();
    assert.equal(left.length, 1);
    assert.deepEqual(left[0].ds.place, { cls: 'cherry', container: 'pack', index: 1 });
    const nb = read('js/features/neighbours-mp-feature.js');
    assert.match(nb, /confirmPackage\(stacks\[0\]\.c, 1, stacks\[0\]\.box \|\| null, stacks\[0\]\.pick \|\| null, drop\.ds \|\| null\)/);
    assert.match(nb, /else if \(ours && leaving\.ds\) takeDragged\(engine, leaving\.ds, item\.n\);/);
    const bf = read('js/features/butler-feature.js');
    assert.match(bf, /give: \(\{ cls, count, copy, ds \}\) => giveMenu\(engine, \{ cls, count, copy, ds \}\)/);
    assert.match(bf, /else if \(ds\) takeDragged\(engine, ds, n\);\n {10}removeItem\(engine\.inv, chosen, n\);/);
  });

  it('a player (gift): the give comes off the dragged stack (LocationInputHandler.as 851)', () => {
    const g = read('js/features/gifts-feature.js');
    assert.match(g, /drag\.ds = draggedStack\(engine, st\)/);
    assert.match(g, /open\(\{ to: p, classTsid: c, from: here \? \{ \.\.\.ds\.place, count: here \} : null \}\)/);
    assert.match(g, /const at = from\?\.cls === classTsid \? from : engine\.query\?\.\('packFocused', classTsid, engine\);/);
  });

  it('a cabinet and a trade take the dragged stack (CabinetDialog.as 434, TradeDialog.as 1088)', () => {
    assert.match(read('js/ui/storage-windows.js'), /put\(\{ cls: stack\.cls, count: stack\.count, copy: stack\.copy \?\? null, bag: stack\.bag \|\| '', slot: i, stack \}\)/);
    const hs = read('js/features/home-storage-feature.js');
    assert.ok(hs.indexOf('takeDragged(engine, draggedStack(engine, stack), n)') < hs.indexOf('removeItem(engine.inv, cls, put)'));
    const tr = read('js/features/trade-feature.js');
    assert.match(tr, /addFromPack\(d\.stack\.cls, undefined, \{ ds: draggedStack\(engine, d\.stack\) \}\)/);
    assert.match(tr, /Math\.min\(left, slotMax\(c, table\), ds \? draggedCount\(engine, ds\) : Infinity\)/, 'its own count');
    const hold = part(tr, 'function growHold(', 'const moreCur');
    assert.ok(hold.indexOf('takeDragged(engine, ds,') < hold.indexOf('toolPointsOut(c, more)'), 'before its wear goes into the hold');
  });

  it('the garden stays a class drop, as in Glitch (handleDrop(dragged_itemstack.class_tsid))', () => {
    assert.doesNotMatch(read('js/features/garden-guano-feature.js'), /draggedStack|takeDragged|markDragged/);
  });
});
