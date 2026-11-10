/**
 * Report 137: Pick up on a stack asks how many, as the original's verb did.
 *
 * InteractionMenuController.as 976-985: a verb on more than one, with neither is_single nor is_all,
 * shows the count chooser; items/*.js verbs.pickup (defined by takeable) sets neither. All comes first
 * and has the focus (getCountChoices 1757-1761, InteractionMenu.as getDefaultChoiceIndex 1206-1215).
 * Real browser checks: both skins, the street and Decoration Mode (the lane's report).
 *
 * Run: node --test tests/stack-pickup.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_PLURALS } from '../public/js/item-plurals-data.js?v=62e96051';
import { normalizeGroundStack } from '../public/js/drops-mp.js?v=ec6a135d';
import { createDroppedItemState, dropInventoryStack, pickupCountTitle, pickupCountToAsk, pickupDroppedStack } from '../public/js/world-items.js?v=da2bb7a1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const chooser = read('public/js/ui/count-chooser.js');

/** One stack of `count` on a street, with what its copies keep. */
function ground(count, extra = {}) {
  const state = createDroppedItemState();
  const inv = { hatchet: count };
  const out = dropInventoryStack(state, inv, 'LA1', 'hatchet', count, { x: 10, y: 20 }, { now: 1, ...extra });
  assert.equal(out.ok, true);
  return { state, inv, id: out.stack.id };
}

describe('which stacks ask', () => {
  it('more than one asks, up to the whole stack; one is one press', () => {
    assert.equal(pickupCountToAsk({ classTsid: 'apple', count: 6 }), 6);
    assert.equal(pickupCountToAsk({ classTsid: 'apple', count: 2 }), 2);
    assert.equal(pickupCountToAsk({ classTsid: 'apple', count: 1 }), 0);
    assert.equal(pickupCountToAsk(null), 0);
  });

  it('a bag with contents or a name comes back whole', () => {
    assert.equal(pickupCountToAsk({ classTsid: 'bag_bigger', count: 2, contents: [{ classTsid: 'plum', count: 1 }] }), 0);
    assert.equal(pickupCountToAsk({ classTsid: 'bag_bigger', count: 2, name: 'Lunch' }), 0);
  });

  it('a stack shared with the street asks too (G560: drops.go ground_pickup takes the count)', () => {
    const stack = normalizeGroundStack({ id: 'drop-0123456789abcdef', c: 'apple', n: 5, x: 0, y: 0 }, 'LA1');
    assert.equal(stack.shared, true);
    assert.equal(pickupCountToAsk(stack), 5);
    // The stack as the menu sees it carries the mark, and sharedPickup is asked the count (tests/g560-shared-pickup.test.js).
    assert.match(game, /\.\.\.\(stack\.shared \? \{ shared: true \} : \{\}\),\s+\},\s+worldItemId: stack\.id,/);
    assert.match(game, /features\.query\('sharedPickup', target, engine, room != null && room < wantCount \? room : wantCount\)/);
  });
});

describe('the words', () => {
  it('the title is the original\'s: the verb capitalized, how many, the item\'s plural', () => {
    assert.equal(pickupCountTitle('emblem_lem'), 'Pick Up how many Emblems of Lem?');
    assert.equal(pickupCountTitle('bag_toolbox_red'), 'Pick Up how many Red Toolboxes?');
    assert.doesNotMatch(pickupCountTitle('emblem_lem'), /—/);
  });

  const items = join(root, '..', 'glitch-GameServerJS', 'items');
  it('every plural in the table is the source\'s name_plural', { skip: existsSync(items) ? false : 'needs glitch-GameServerJS beside the game' }, () => {
    for (const [cls, plural] of Object.entries(ITEM_PLURALS)) {
      const src = readFileSync(join(items, `${cls}.js`), 'utf8');
      const m = /var name_plural = "((?:[^"\\]|\\.)*)"/.exec(src);
      assert.equal(plural, m?.[1], cls);
    }
  });
});

describe('a part of a stack', () => {
  it('takes what was asked and leaves the rest', () => {
    const { state, inv, id } = ground(5);
    const out = pickupDroppedStack(state, inv, 'LA1', id, 2);
    assert.deepEqual([out.ok, out.count, out.remaining, out.removed], [true, 2, 3, false]);
    assert.equal(inv.hatchet, 2);
    assert.equal(state.streets.LA1[0].count, 3);
  });

  it('asking for more than the stack holds takes the stack', () => {
    const { state, inv, id } = ground(3);
    const out = pickupDroppedStack(state, inv, 'LA1', id, 9);
    assert.deepEqual([out.count, out.remaining, out.removed], [3, 0, true]);
  });

  it('tools and tagged copies keep their own points and tags, on both sides', () => {
    const { state, inv, id } = ground(3, { points: [40, 30, 20], tags: ['a', 'b', 'c'] });
    const first = pickupDroppedStack(state, inv, 'LA1', id, 2);
    assert.deepEqual(first.points, [40, 30]);
    assert.deepEqual(first.tags, ['a', 'b']);
    const row = state.streets.LA1[0];
    assert.deepEqual([row.count, row.points, row.tags], [1, [20], ['c']]);
    const rest = pickupDroppedStack(state, inv, 'LA1', id, 1);
    assert.deepEqual([rest.points, rest.tags, rest.removed], [[20], ['c'], true]);
  });
});

describe('the street', () => {
  const fn = game.slice(game.indexOf('function pickupDroppedWorldItem('), game.indexOf('function quoinFrames('));

  it('Pick up asks in a level of the verb menu, and a full pack never asks', () => {
    assert.match(game, /const askMax = v\.id === 'pickup' \? pickupCountAsked\(target\) : 0;/);
    assert.match(game, /else if \(askMax\) openPickupCount\(target, v, askMax\);/);
    assert.match(game, /features\.query\('packRoom', target\.state\.classTsid, max, engine\) !== 0 \? max : 0/);
  });

  it('the count goes with the verb, past the walk over and the timed action', () => {
    assert.match(game, /requestVerb\(target, verb, \{ run: \(\) => beginVerbAction\(target, \{ \.\.\.verb, id: `\$\{verb\.id\}:\$\{n\}` \}\) \}\)/);
    assert.match(game, /const \[pickVerb, pickCount\] = String\(verbId \|\| ''\)\.split\(':'\);\s+if \(pickVerb === 'pickup'\) \{\s+pickupDroppedWorldItem\(target, pickCount \? Number\(pickCount\) : Infinity\);/);
  });

  it('the partial-fit rule holds for a chosen count (takeable.js 76-93)', () => {
    assert.match(fn, /const room = wantClass \? features\.query\('packRoom', wantClass, wantCount, engine\) : null;\s+if \(room === 0(?: \|\| \(element && room == null\))?\) \{/);
    assert.match(fn, /room != null && room < wantCount \? room : requested\)/);
    assert.match(fn, /const wantCount = Math\.min\(stackCount, Math\.max\(1, Math\.floor\(Number\(requested\)\) \|\| stackCount\)\);/);
  });

  it('the chooser starts on the whole stack, with the shared keys, and says so for tests', () => {
    assert.match(chooser, /export function createCountChooser\(doc, \{ title, max, start = max, verb, hook/);
    assert.match(chooser, /bindCountField\(input, \{/);
    assert.match(game, /hook: 'stack-count'/);
    assert.match(game, /setCanvasData\('stackPickCount', `\$\{id\}:\$\{n\}:\$\{max\}`\)/);
    assert.match(game, /setCanvasData\('stackPickLast', `\$\{id\}:\$\{result\.count\}:\$\{result\.remaining\}`\)/);
  });

  it('both skins draw it', () => {
    assert.match(read('public/style.css'), /\[data-ui="modern"\] \.count-pop \.count-pop-go \{/);
    assert.match(read('public/css/classic.css'), /\.count-pop-go, \.count-pop-back\) \{/);
    assert.match(read('public/css/classic.css'), /\.count-pop \.count-pop-go \{/);
    assert.match(read('public/css/classic.css'), /\[data-stack-count-panel\]/);
  });
});

describe('Decoration Mode', () => {
  const homes = read('public/js/features/homes-feature.js');
  const pop = homes.slice(homes.indexOf('let stackCount = null;'), homes.indexOf('/** A stack dragged (or carried after Move)'));

  it('Pick up asks through the shared chooser on more than one; one press on one or on a full pack', () => {
    assert.match(pop, /'data-home-stack': 'pickup' \}, onClick: \(\) => askStackCount\(engine, row\)/);
    assert.match(pop, /const max = engine\.pickUpCountAsked\?\.\(row\.id\) \|\| 0;\s+if \(!max\) return pickUpStack\(engine, row\.id\);/);
    assert.match(pop, /createCountChooser\(document, \{/);
    assert.match(pop, /title: pickupCountTitle\(row\.classTsid\)/);
    assert.match(game, /pickUpCountAsked\(id\) \{\s+return pickupCountAsked\(/);
  });

  it('dragging onto the pack and onto a Storage Display Box still takes the whole stack', () => {
    assert.match(homes, /if \(overPack\(e\.clientX, e\.clientY\)\) return pickUpStack\(engine, was\.id\);/);
    const box = homes.slice(homes.indexOf('function stackIntoBox('), homes.indexOf('let stackCount = null;'));
    assert.match(box, /if \(!engine\.pickUpDroppedStack\?\.\(id\)\) \{/);
  });

  it('what is left stays selected, and the count reaches the engine', () => {
    const fn = homes.slice(homes.indexOf('function pickUpStack('), homes.indexOf('function stackIntoBox('));
    assert.match(fn, /engine\.pickUpDroppedStack\?\.\(id, count\)/);
    assert.match(fn, /if \(!stackRow\(engine, id\)\) selected = null;/);
  });

  it('the keys: Esc goes back, not out of the mode, and the arrows on its buttons leave the camera alone', () => {
    assert.match(homes, /if \(stackCount\) \{\s+ui\?\.builder\?\.pop\?\.querySelector\('\[data-stack-count-back\]'\)\?\.click\(\);\s+return;/);
    assert.match(homes, /if \(e\.target\?\.closest\?\.\('\.count-pop'\)\) return;\s+const dir = panKey\(e\.key\);/);
  });

  it('tests can read it', () => {
    assert.match(pop, /engine\.setData\('homeStackCount', `\$\{id\}:\$\{n\}:\$\{max\}`\)/);
  });
});

describe('the plural table grants nothing', () => {
  it('the economy builder reads it as a catalog, so a class named there does not lift its credit gate', () => {
    assert.match(read('tools/build-economy.mjs'), /'public\/js\/item-plurals-data\.js',\s+\]\);/);
  });
});
