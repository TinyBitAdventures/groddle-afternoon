/**
 * A stack's menu stays on its stack (player report 2026-11-01, ticket 13): with
 * several stacks of Dullite (or Small Shiny Objects) in a bag, the menu of the
 * last one jumped to the first stack while it redrew, its count chooser offered
 * every Dullite held, and Drop All took from the first stack.
 *
 * Source (CC0): main.js doVerb 2926-3250 works on the itemstack the client
 * named (msg.itemstack_tsid), and a verb's count is capped at that stack's
 * (3239-3250: "not enough items in stack"), so a drop, a give or an eat from a
 * stack's menu is that stack's. Without a named stack, the server takes from
 * the first one in slot order (items/bag.js removeItemStackClass 316-334),
 * which the layout still does for everything else.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEM_CATALOG, isToolItem, removeItem } from '../public/js/inventory.js?v=d82f3b00';
import { PACK_CAPACITY, layoutPack } from '../public/js/pack-slots.js?v=c91d0ca3';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=5cbc3c97';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };

/** A Bigger Bag holding three stacks of Dullite (50, 50, 12) and two Small Shiny Objects (small_worthless, one to a stack: stackmax 1); one Dullite stack in the pack. */
function kit() {
  const inv = { bag_bigger: 1, dullite: 132, small_worthless: 2, apple: 2 };
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_bigger' }],
    place: { pack: ['@b1', 'dullite', 'apple'], b1: ['dullite', 'small_worthless', 'dullite', 'small_worthless', 'dullite'] },
    n: { pack: [0, 20, 2], b1: [50, 1, 50, 1, 12] },
  };
  return { inv, prefs };
}

const counts = (layout) => ({
  pack: layout.pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : `${s.cls}:${s.count}`)),
  b1: layout.bags.b1.slots.map((s) => `${s.cls}:${s.count}`),
});

describe('pack-slots.js layoutPack takeFirst: the stack a verb was used on gives first', () => {
  it('without it, fewer still comes off the first stack in slot order (bag.js:316-334)', () => {
    const { inv, prefs } = kit();
    const layout = layoutPack({ ...inv, dullite: 120 }, prefs, OPTS);
    // The bag sits first in the pack row, so its first Dullite stack is the first in slot order.
    assert.deepEqual(counts(layout).b1, ['dullite:38', 'small_worthless:1', 'dullite:50', 'small_worthless:1', 'dullite:12']);
  });

  it('dropping all of the last Dullite stack in the bag takes that stack and nothing else', () => {
    const { inv, prefs } = kit();
    const layout = layoutPack({ ...inv, dullite: 120 }, prefs, { ...OPTS, takeFirst: [{ container: 'b1', index: 4 }] });
    assert.deepEqual(counts(layout), {
      pack: ['@b1', 'dullite:20', 'apple:2'],
      b1: ['dullite:50', 'small_worthless:1', 'dullite:50', 'small_worthless:1'],
    });
  });

  it('a count from the middle stack comes off that one', () => {
    const { inv, prefs } = kit();
    const layout = layoutPack({ ...inv, dullite: 125 }, prefs, { ...OPTS, takeFirst: [{ container: 'b1', index: 2 }] });
    assert.deepEqual(counts(layout).b1, ['dullite:50', 'small_worthless:1', 'dullite:43', 'small_worthless:1', 'dullite:12']);
    assert.deepEqual(counts(layout).pack, ['@b1', 'dullite:20', 'apple:2']);
  });

  it('Small Shiny Objects too: the second stack goes, the first stays', () => {
    const { inv, prefs } = kit();
    const layout = layoutPack({ ...inv, small_worthless: 1 }, prefs, { ...OPTS, takeFirst: [{ container: 'b1', index: 3 }] });
    assert.deepEqual(counts(layout).b1, ['dullite:50', 'small_worthless:1', 'dullite:50', 'dullite:12']);
  });

  it('a place that holds another item is ignored', () => {
    const { inv, prefs } = kit();
    const layout = layoutPack({ ...inv, dullite: 130 }, prefs, { ...OPTS, takeFirst: [{ container: 'b1', index: 1 }] });
    assert.equal(counts(layout).b1[0], 'dullite:48');
  });
});

describe('features/bags-feature.js: the menu\'s stack (packFocus) and its takes (packTakeFrom)', () => {
  const engineFor = (inv) => ({
    mode: 'solo', inv, started: true, data: {}, said: [],
    setData(k, v) { this.data[k] = v; }, pushActivity(t) { this.said.push(t); }, toast() {}, param: () => null, save() {}, updateHud() {}, refreshPack() {},
    query: () => null,
  });
  const start = () => {
    const { inv, prefs } = kit();
    const e = engineFor({ ...inv });
    bagsFeature.restore(JSON.parse(JSON.stringify({ v: 1, prefs, rock: {}, open: 'b1', migrated: true, starter: 'none' })), e);
    bagsFeature.packLayout(e);
    return e;
  };

  it('the menu knows its own stack and that stack\'s count, not the item\'s total', () => {
    const e = start();
    assert.deepEqual(bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 4 }, e), { cls: 'dullite', container: 'b1', index: 4, count: 12 });
    assert.deepEqual(bagsFeature.packFocused('dullite', e), { cls: 'dullite', container: 'b1', index: 4, count: 12 });
    assert.equal(bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 1 }, e), null, 'that slot holds Small Shiny Objects');
  });

  it('Drop All on the last stack drops those 12, and every other stack stays as it was', () => {
    const e = start();
    bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 4 }, e);
    assert.equal(bagsFeature.packTakeFrom('dullite', 12, e), true);
    removeItem(e.inv, 'dullite', 12);
    assert.deepEqual(counts(bagsFeature.packLayout(e)), {
      pack: ['@b1', 'dullite:20', 'apple:2'],
      b1: ['dullite:50', 'small_worthless:1', 'dullite:50', 'small_worthless:1'],
    });
  });

  it('a count (5 of 12) leaves 7 on that stack; the next fewer goes back to slot order', () => {
    const e = start();
    bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 4 }, e);
    bagsFeature.packTakeFrom('dullite', 5, e);
    removeItem(e.inv, 'dullite', 5);
    assert.deepEqual(counts(bagsFeature.packLayout(e)).b1.at(-1), 'dullite:7');
    removeItem(e.inv, 'dullite', 1);
    const after = counts(bagsFeature.packLayout(e));
    assert.equal(after.b1[0], 'dullite:49', 'the take was used up: one more taken some other way comes off the first stack');
    assert.equal(after.b1.at(-1), 'dullite:7');
  });

  it('online the take waits for the server: a redraw in between keeps it', () => {
    const e = start();
    bagsFeature.packFocus({ cls: 'small_worthless', container: 'b1', index: 3 }, e);
    bagsFeature.packTakeFrom('small_worthless', 1, e, { wait: 60000 });
    bagsFeature.packLayout(e);
    bagsFeature.packLayout(e);
    removeItem(e.inv, 'small_worthless', 1);
    assert.deepEqual(counts(bagsFeature.packLayout(e)).b1, ['dullite:50', 'small_worthless:1', 'dullite:50', 'dullite:12']);
  });

  it('a give opened from the menu takes from the stack it was opened on, even if another menu opens before it settles', () => {
    const e = start();
    bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 2 }, e);
    const from = bagsFeature.packFocused('dullite', e);
    bagsFeature.packFocus({ cls: 'dullite', container: 'pack', index: 1 }, e);
    bagsFeature.packTakeFrom('dullite', 10, e, { place: from, wait: 60000 });
    removeItem(e.inv, 'dullite', 10);
    const after = counts(bagsFeature.packLayout(e));
    assert.equal(after.b1[2], 'dullite:40');
    assert.equal(after.pack[1], 'dullite:20');
  });

  it('Put in / Take out move the menu\'s own stack', () => {
    const e = start();
    bagsFeature.packFocus({ cls: 'dullite', container: 'b1', index: 2 }, e);
    const verbs = bagsFeature.packVerbs('dullite', e).map((v) => v.id);
    assert.deepEqual(verbs, ['bags_take:b1'], 'a stack in the bag offers Take out, not the pack stack\'s Put in');
    bagsFeature.runPackVerb('dullite', 'bags_take:b1', e);
    const after = counts(bagsFeature.packLayout(e));
    assert.deepEqual(after.b1, ['dullite:50', 'small_worthless:1', 'small_worthless:1', 'dullite:12']);
    assert.ok(after.pack.includes('dullite:50'));
  });
});

describe('game.js: the menu stays on the slot it was opened from', () => {
  const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
  const gifts = readFileSync(join(ROOT, 'public/js/features/gifts-feature.js'), 'utf8');
  const pop = game.slice(game.indexOf('function renderPackPopover('), game.indexOf('function renderPackRow('));

  it('remembers the slot\'s place and finds that slot again after a redraw (not the first of the item)', () => {
    assert.match(pop, /const anchorPlace = packPlaceOf\(anchor\);\s*if \(anchorPlace\) packSelectedPlace = anchorPlace;/);
    assert.match(pop, /findPackSlotElement\(classTsid, packSelectedCopy, packSelectedBag, packSelectedPlace\)/);
    assert.match(game, /onScroll: \(\) => \{[\s\S]{0,120}findPackSlotElement\(packSelected, packSelectedCopy, packSelectedBag, packSelectedPlace\)/);
    assert.match(game, /return \(place && all\.find\(\(el\) => isPackPlace\(el, place\)\)\)/);
  });

  it('two stacks that draw the same card keep their own buttons', () => {
    assert.match(pop, /\(pop\.dataset\.packPlace \|\| ''\) === placeKey/);
  });

  it('the counts are the stack\'s: header, Drop\'s chooser and its Max, Eat more', () => {
    // A bag's menu is one bag's (×1; tests/bag-rename.test.js), any other the stack's count.
    assert.match(pop, /<b>×\$\{named\?\.one \? 1 : stackCount\}<\/b>/);
    assert.match(pop, /countStepMarkup\(\{ value: packDropQty, max: stackCount, verb: 'Drop'/);
    assert.match(pop, /setDropQty\(stackCount\)/);
    assert.match(pop, /packEatManyInfo\(classTsid, useInfo, stackCount\)/);
    assert.doesNotMatch(pop, /max: slot\.count|of \$\{slot\.count\}/);
  });

  it('a drop, an eat or a give from the menu comes off its stack', () => {
    const drop = game.slice(game.indexOf('function dropPackItem('), game.indexOf('function dropPackBag('));
    assert.match(drop, /Math\.min\(inv\[classTsid\] \|\| 0, fromStack\)/);
    assert.match(drop, /takeFromMenuStack\(classTsid, count, 60000\)/);
    assert.match(pop, /takeFromMenuStack\(classTsid, n\);\s*closePackPopover\(\);/);
    assert.match(gifts, /packTakeFrom', p\.c, frame\.item\.n, engine, \{ place: give\.from/);
  });

  it('Classic: the menu takes its own clicks over the pack band (they went to the street)', () => {
    const css = readFileSync(join(ROOT, 'public/css/classic.css'), 'utf8');
    assert.match(css, /:root\[data-ui="classic"\] #pack-popover \{ pointer-events: auto; \}/);
  });

  it('a click on another stack of the same item moves the menu there instead of closing it', () => {
    assert.match(game, /const samePlace = !packSelectedPlace \|\| !inLayout \|\| isPackPlace\(slot, packSelectedPlace\);/);
  });
});
