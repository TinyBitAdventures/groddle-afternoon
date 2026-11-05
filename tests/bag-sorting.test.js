/**
 * Bag sorting: the three pack upgrade cards (Internal Sortitude, Magic Sort,
 * Stack Up), which the remake had marked "the remake pack has no bags".
 *
 * Source (glitch-GameServerJS, CC0): items/bag_generic_gray.js verbs.sort_all
 * 30-51, sort_keys..sort_staples_a 53-415, magic_sort 417-447, stack_up
 * 449-473; items/bag.js addItemStack 113-150 (the sorted bags first with
 * pack_internal_sortitude), doSpecialize 783-801, removeSpecialize 774-781,
 * stackMatchesBagCategory 803-808; bag_bigger.js verbs.rename 516 (a rename
 * makes the name the player's); inc_data_imagination.js 5674-5746 (the cards).
 * Rules: js/pack-slots.js; the menu: features/bags-feature.js.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BAG_SORTS,
  BAG_SORT_COPY,
  SPECIALIZABLE_BAGS,
  canMagicSort,
  canSpecializeBag,
  layoutPack,
  magicSort,
  normalizePrefs,
  renameBag,
  sortTakes,
  specializeBag,
  stackUp,
  unitOrder,
} from '../public/js/pack-slots.js?v=c91d0ca3';
import { SORT_TAG_CLASSES } from '../public/js/pack-slots-data.js?v=800f664c';
import { ITEM_CATALOG, isToolItem } from '../public/js/inventory.js?v=d82f3b00';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=b8387357';
import { createToolConditionState } from '../public/js/tools.js?v=6684b484';
import { remakeStatus, isOfferedInRemake } from '../public/js/imagination-remake.js?v=c37ad887';

const ROOT = join(import.meta.dirname, '..');
const ITEMS = join(ROOT, '..', 'glitch-GameServerJS', 'items');
const HAS_GSJS = existsSync(join(ITEMS, 'bag_generic_gray.js'));
const OPTS = { catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };

/** Two Bigger Bags and a Red Toolbox, all empty, and loose mining goods and fruit in the pack. */
function kit() {
  const inv = { bag_bigger: 2, bag_toolbox_red: 1, pick: 1, cherry: 30, tin: 10, plain_metal: 5, beryl: 40, apple: 3 };
  return { inv, prefs: layoutPack(inv, null, OPTS).prefs };
}

function engineWith(inv, cards = []) {
  const data = {};
  const engine = {
    mode: 'solo',
    started: true,
    inv,
    data,
    pc: { imaginationUpgrades: [...cards] },
    saves: 0,
    lines: [],
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    pushActivity: (l) => engine.lines.push(l),
    toast: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    playSound: () => {},
    save: () => { engine.saves += 1; },
  };
  engine.query = (hook, ...args) => (typeof bagsFeature[hook] === 'function' ? bagsFeature[hook](...args) : null);
  return engine;
}

describe('the sort verbs match the source (bag_generic_gray.js 30-473)', { skip: HAS_GSJS ? false : 'needs glitch-GameServerJS beside the game' }, () => {
  it('each Sort: verb has the name, tooltip, sort_on, categories and reason the source gives', () => {
    const src = readFileSync(join(ITEMS, 'bag_generic_gray.js'), 'utf8');
    const verb = (id) => {
      const at = src.indexOf(`verbs.${id} = {`);
      return src.slice(at, src.indexOf('\nverbs.', at + 10));
    };
    for (const row of BAG_SORTS) {
      const block = verb(row.id);
      assert.ok(block.length > 50, row.id);
      assert.match(block, new RegExp(`"name"\\s*: "${row.label.replace(/[.+]/g, '\\$&')}"`), row.id);
      assert.ok(block.includes(`"tooltip"			: "${row.tooltip}"`), `${row.id} tooltip`);
      assert.match(block, new RegExp(`"sort_on"\\s*: ${row.sortOn},`), row.id);
      assert.ok(block.includes(`this.bag_category_tags == '${row.tags.join(',')}'`), `${row.id} categories`);
      assert.ok(block.includes(`reason:'${row.reason}'`), `${row.id} reason`);
      assert.ok(block.includes(`this.doSpecialize(pc, '${row.name}', '${row.tags.join(',')}')`), `${row.id} name`);
    }
    for (const v of [BAG_SORT_COPY.all, BAG_SORT_COPY.magic, BAG_SORT_COPY.stackUp]) {
      const block = verb(v.id);
      assert.ok(block.includes(`"tooltip"			: "${v.tooltip}"`), v.id);
      assert.match(block, new RegExp(`"sort_on"\\s*: ${v.sortOn},`), v.id);
    }
    assert.ok(src.includes(`pc.sendActivity('${BAG_SORT_COPY.magic.done}')`));
    assert.ok(src.includes(`pc.sendActivity('${BAG_SORT_COPY.stackUp.done}')`));
    assert.ok(src.includes(`reason:'${BAG_SORT_COPY.magic.unsorted}'`));
  });

  it('only the Generic and Bigger Bags can be specialized (can_specialize true)', () => {
    for (const cls of SPECIALIZABLE_BAGS) {
      assert.match(readFileSync(join(ITEMS, `${cls}.js`), 'utf8'), /"can_specialize"\s*: "true"/, cls);
    }
    for (const cls of ['bag_toolbox_red', 'bag_spicerack', 'bag_elemental_pouch']) {
      assert.match(readFileSync(join(ITEMS, `${cls}.js`), 'utf8'), /"can_specialize"\s*: "false"/, cls);
      assert.equal(canSpecializeBag(cls), false, cls);
    }
  });

  it('the category tags come from catalog_tags.js (nobag_<tag> left out)', () => {
    assert.ok(SORT_TAG_CLASSES.get('rock').has('beryl'));
    assert.ok(SORT_TAG_CLASSES.get('metal').has('tin'));
    assert.ok(SORT_TAG_CLASSES.get('key').has('door_key_1'));
    assert.ok(SORT_TAG_CLASSES.get('trantproduct').has('cherry'));
    assert.equal(sortTakes('sort_mining', 'beryl', OPTS), true);
    assert.equal(sortTakes('sort_mining', 'cherry', OPTS), false);
    assert.equal(sortTakes('sort_staples_ab', 'meat', OPTS), true);
  });
});

describe('Internal Sortitude (doSpecialize, addItemStack 113-150)', () => {
  it('specializing names an unnamed bag after the sort and Sort: All takes both off', () => {
    const { prefs } = kit();
    const on = specializeBag(prefs, 'b1', 'sort_mining');
    assert.equal(on.ok, true);
    assert.deepEqual(on.prefs.bags[0], { key: 'b1', cls: 'bag_bigger', sort: 'sort_mining', sortNamed: true });
    assert.equal(layoutPack(kit().inv, on.prefs, OPTS).bags.b1.label, 'Mining, etc.');
    // The sort it already has is disabled with the source's reason.
    assert.equal(specializeBag(on.prefs, 'b1', 'sort_mining').reason, 'This bag is currently sorted by mining goods');
    // Another sort renames a bag the sort named.
    assert.equal(layoutPack(kit().inv, specializeBag(on.prefs, 'b1', 'sort_food').prefs, OPTS).bags.b1.label, 'Food');
    const off = specializeBag(on.prefs, 'b1', 'sort_all');
    assert.deepEqual(off.prefs.bags[0], { key: 'b1', cls: 'bag_bigger' });
    const plain = layoutPack(kit().inv, off.prefs, OPTS).bags.b1;
    assert.equal(plain.label, plain.className);
    assert.equal(specializeBag(prefs, 'b3', 'sort_keys').reason, 'not_sortable');
  });

  it('a bag the player named keeps its name; a rename makes a sort-given name the player\'s', () => {
    const { inv, prefs } = kit();
    const named = renameBag(prefs, 'b1', 'Rocks').prefs;
    const sorted = specializeBag(named, 'b1', 'sort_mining').prefs;
    assert.equal(sorted.bags[0].sortNamed, undefined);
    assert.equal(layoutPack(inv, sorted, OPTS).bags.b1.label, 'Rocks');
    assert.equal(layoutPack(inv, specializeBag(sorted, 'b1', 'sort_all').prefs, OPTS).bags.b1.label, 'Rocks');
    // verbs.rename 515-516: the box shows the sort's name, OK keeps it (cleaned) as the player's.
    const byName = specializeBag(prefs, 'b1', 'sort_mining').prefs;
    const kept = renameBag(byName, 'b1', 'Mining, etc.');
    assert.equal(kept.name, 'Mining etc');
    assert.deepEqual(kept.prefs.bags[0], { key: 'b1', cls: 'bag_bigger', name: 'Mining etc', sort: 'sort_mining' });
  });

  it('normalizePrefs keeps a sort only on a bag that can take one', () => {
    const clean = normalizePrefs({ bags: [{ key: 'b1', cls: 'bag_bigger', sort: 'sort_food', sortNamed: true }, { key: 'b2', cls: 'bag_toolbox_red', sort: 'sort_food' }, { key: 'b3', cls: 'bag_generic', sort: 'bogus' }], place: { pack: [] } });
    assert.deepEqual(clean.bags, [{ key: 'b1', cls: 'bag_bigger', sort: 'sort_food', sortNamed: true }, { key: 'b2', cls: 'bag_toolbox_red' }, { key: 'b3', cls: 'bag_generic' }]);
  });

  it('with the card, what arrives goes into the bag sorted for it before the pack; without it, the pack first', () => {
    const { inv, prefs } = kit();
    const sorted = specializeBag(prefs, 'b2', 'sort_mining').prefs;
    const more = { ...inv, dullite: 10, broccoli: 2 };
    const plain = layoutPack(more, sorted, OPTS).prefs.place;
    assert.ok(plain.pack.includes('dullite'));
    assert.deepEqual(plain.b2, []);
    const card = layoutPack(more, sorted, { ...OPTS, sortitude: true }).prefs.place;
    assert.deepEqual(card.b2, ['dullite']);
    // Not for a mining bag: the pack, then an unsorted bag (b1), never the sorted one.
    assert.ok(card.pack.includes('broccoli'));
    const full = { ...inv };
    const fullPrefs = layoutPack(full, sorted, OPTS).prefs;
    // Fill the pack: the next stack that is not mining goes to the unsorted bag, not the sorted one.
    const packed = { ...full, ...Object.fromEntries(['apple', 'orange', 'lemon', 'grain', 'meat', 'spinach', 'carrot', 'corn', 'onion', 'potato'].map((c) => [c, 1])) };
    const after = layoutPack(packed, fullPrefs, { ...OPTS, sortitude: true });
    assert.equal(after.used, 16);
    assert.ok(after.prefs.place.b1.length > 0);
    assert.deepEqual(after.prefs.place.b2.filter((c) => !sortTakes('sort_mining', c, OPTS)), []);
  });

  it('with the card, more of a class tops up its stack in the sorted bag first (bag.js:191-206 in candidate order)', () => {
    const inv = { bag_bigger: 1, beryl: 40 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger', sort: 'sort_mining', sortNamed: true }], place: { pack: ['@b1', 'beryl'], b1: ['beryl'] }, n: { pack: [0, 20], b1: [20] } };
    const plain = layoutPack({ ...inv, beryl: 45 }, prefs, OPTS).prefs.n;
    assert.deepEqual([plain.pack[1], plain.b1[0]], [25, 20]);
    const card = layoutPack({ ...inv, beryl: 45 }, prefs, { ...OPTS, sortitude: true }).prefs.n;
    assert.deepEqual([card.pack[1], card.b1[0]], [20, 25]);
  });
});

describe('Magic Sort (verbs.magic_sort 417-447)', () => {
  it('needs a sorted bag or one with custom categories', () => {
    const { inv, prefs } = kit();
    const L = layoutPack(inv, prefs, OPTS);
    assert.equal(canMagicSort(L.bags.b1), false);
    assert.equal(canMagicSort(L.bags.b3), true);
    assert.equal(magicSort(inv, prefs, 'b1', OPTS).reason, 'This bag needs to be specialized before it can be magically sorted.');
  });

  it('gathers what the bag is for from the pack and the other bags; counts never change', () => {
    const { inv, prefs } = kit();
    const sorted = specializeBag(prefs, 'b1', 'sort_mining').prefs;
    // Put the tin in the other bag first: it comes out of there too.
    const moved = magicSort(inv, sorted, 'b1', OPTS);
    assert.equal(moved.ok, true);
    assert.equal(moved.moved, 3);
    const L = layoutPack(inv, moved.prefs, OPTS);
    assert.deepEqual(L.bags.b1.slots.map((s) => `${s.cls}:${s.count}`), ['tin:10', 'plain_metal:5', 'beryl:40']);
    assert.ok(!L.pack.slots.some((s) => ['tin', 'plain_metal', 'beryl'].includes(s.cls)));
    assert.deepEqual(L.slotted, layoutPack(inv, prefs, OPTS).slotted);
    // A toolbox gathers the tools.
    const tools = magicSort(inv, prefs, 'b3', OPTS);
    assert.deepEqual(layoutPack(inv, tools.prefs, OPTS).bags.b3.slots.map((s) => s.cls), ['pick']);
  });

  it('a full bag swaps out what it is not for', () => {
    const ten = ['cherry', 'orange', 'lemon', 'grain', 'meat', 'spinach', 'carrot', 'corn', 'onion', 'potato'];
    const inv = { bag_generic: 1, beryl: 5, ...Object.fromEntries(ten.map((c) => [c, 1])) };
    const prefs = {
      bags: [{ key: 'b1', cls: 'bag_generic', sort: 'sort_mining', sortNamed: true }],
      place: { pack: ['@b1', 'beryl'], b1: ten },
      n: { pack: [0, 5], b1: ten.map(() => 1) },
    };
    const start = layoutPack(inv, prefs, OPTS);
    assert.equal(start.bags.b1.slots.length, 10);
    const res = magicSort(inv, start.prefs, 'b1', OPTS);
    const L = layoutPack(inv, res.prefs, OPTS);
    assert.ok(L.bags.b1.slots.some((s) => s.cls === 'beryl'));
    assert.equal(L.bags.b1.slots.length, 10);
    assert.ok(L.pack.slots.some((s) => s.cls === 'cherry'));
  });

  it('its trace lets a tool keep its wear (unitOrder)', () => {
    const inv = { bag_toolbox_red: 1, pick: 2 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_toolbox_red' }], place: { pack: ['pick', '@b1'], b1: ['pick'] }, n: { pack: [1, 0], b1: [1] } };
    const before = layoutPack(inv, prefs, OPTS);
    const res = magicSort(inv, before.prefs, 'b1', OPTS);
    const after = layoutPack(inv, res.prefs, OPTS);
    // Before: the pack's pick (rank 0), the box's (rank 1); after both in the box, the box's own first.
    assert.deepEqual(unitOrder(before, after, res.trace, 'pick'), [1, 0]);
    const engine = engineWith({ ...inv }, ['pack_magic_sort']);
    engine.toolState = createToolConditionState();
    engine.toolState.inv = engine.inv;
    engine.toolState.condition = { pick: { copies: [10, 90], remaining: 10, broken: false, uses: 0, repairs: 0 } };
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    bagsFeature.packBagMenu('b1');
    assert.equal(bagsFeature.runPackVerb('bag_toolbox_red', 'bags_magic_sort', engine), true);
    // The worn pick (pack, 10) is now second; the box's (90) first.
    assert.deepEqual(engine.toolState.condition.pick.copies, [90, 10]);
  });
});

describe('Stack Up (verbs.stack_up 449-473)', () => {
  it('joins partial stacks across the pack and bags into the first ones in slot order', () => {
    const inv = { bag_bigger: 1, cherry: 12, apple: 3 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'cherry', 'apple'], b1: ['cherry', 'apple'] }, n: { pack: [0, 5, 1], b1: [7, 2] } };
    const res = stackUp(inv, prefs, OPTS);
    assert.equal(res.merged, 2);
    assert.deepEqual(res.prefs.place, { pack: ['@b1'], b1: ['cherry', 'apple'] });
    assert.deepEqual(res.prefs.n, { pack: [0], b1: [12, 3] });
  });
});

describe('the bag menu (features/bags-feature.js)', () => {
  it('shows the verbs only with their cards, in sort_on order before Rename', () => {
    const { inv, prefs } = kit();
    const none = engineWith({ ...inv });
    bagsFeature.init(none);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, none);
    bagsFeature.packBagMenu('b1');
    assert.deepEqual(bagsFeature.packVerbs('bag_bigger', none).map((v) => v.id), ['bags_rename']);
    const all = engineWith({ ...inv }, ['pack_internal_sortitude', 'pack_magic_sort', 'pack_stack_up_bags']);
    bagsFeature.init(all);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, all);
    bagsFeature.packBagMenu('b1');
    const verbs = bagsFeature.packVerbs('bag_bigger', all);
    // One Sort row (its sorts on a second level: the next test), then Magic sort, Stack up, Rename.
    assert.deepEqual(verbs.map((v) => v.label), ['Sort', 'Magic sort', 'Stack up', 'Rename']);
    assert.deepEqual(verbs.map((v) => v.id), ['bags_sort', 'bags_magic_sort', 'bags_stack_up', 'bags_rename']);
    assert.equal(verbs.find((v) => v.id === 'bags_magic_sort').enabled, false);
    // Stack Up alone: Stack up and Rename, no Sort row.
    const stackOnly = engineWith({ ...inv }, ['pack_stack_up_bags']);
    bagsFeature.init(stackOnly);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, stackOnly);
    bagsFeature.packBagMenu('b1');
    assert.deepEqual(bagsFeature.packVerbs('bag_bigger', stackOnly).map((v) => v.id), ['bags_stack_up', 'bags_rename']);
    bagsFeature.init(all);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, all);
    // A toolbox: no Sort: verbs, but Magic sort (custom categories) and Stack up.
    bagsFeature.packBagMenu('b3');
    assert.deepEqual(bagsFeature.packVerbs('bag_toolbox_red', all).map((v) => v.id), ['bags_magic_sort', 'bags_stack_up', 'bags_rename']);
  });

  it('the Sort row\'s second level: All, then the sorts in sort_on order by their plain names, the current one checked', () => {
    const { inv, prefs } = kit();
    const engine = engineWith({ ...inv }, ['pack_internal_sortitude']);
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    bagsFeature.packBagMenu('b1');
    const sortRow = () => bagsFeature.packVerbs('bag_bigger', engine).find((v) => v.id === 'bags_sort');
    let row = sortRow();
    assert.equal(row.label, 'Sort');
    assert.equal(row.enabled, true);
    const sub = row.sub;
    // The verb ids are the flat list's (bags_sort:<id>), in sort_on order (verbs.sort_all 50 to sort_staples_a 64).
    assert.deepEqual(sub.map((v) => v.id), ['bags_sort:sort_all', ...BAG_SORTS.map((r) => `bags_sort:${r.id}`)]);
    assert.deepEqual(BAG_SORTS.map((r) => r.sortOn), [...BAG_SORTS.map((r) => r.sortOn)].sort((a, b) => a - b));
    assert.deepEqual(sub.map((v) => v.label), ['All', 'Keys', 'Cards', 'Alchemy', 'Manufacturing', 'Mining, etc.', 'Herbs, etc.', 'Crops, etc.', 'Musicblocks', 'Emblems', 'Drinks', 'Food', 'Staples A+B', 'Staples B', 'Staples A']);
    assert.ok(sub.every((v) => !/^Sort: /.test(v.label)));
    // The source's tooltips stay on each choice.
    assert.equal(sub[0].tooltip, BAG_SORT_COPY.all.tooltip);
    assert.equal(sub.find((v) => v.id === 'bags_sort:sort_mining').tooltip, 'Specialize this bag for ore chunks, rock chunks and metal ingots');
    // Unsorted: All is the current choice (every choice says whether it is current).
    assert.ok(sub.every((v) => typeof v.current === 'boolean'));
    assert.deepEqual(sub.filter((v) => v.current).map((v) => v.id), ['bags_sort:sort_all']);
    assert.equal(sub[0].enabled, false);
    assert.equal(sub[0].reason, BAG_SORT_COPY.all.unsorted);
    assert.equal(row.tooltip, BAG_SORT_COPY.menu.tooltip);
    // Sorted for mining: that choice is current, disabled with the source's reason; All can be picked again.
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_sort:sort_mining', engine), true);
    row = sortRow();
    const mining = row.sub.find((v) => v.id === 'bags_sort:sort_mining');
    assert.deepEqual(row.sub.filter((v) => v.current).map((v) => v.id), ['bags_sort:sort_mining']);
    assert.equal(mining.enabled, false);
    assert.equal(mining.reason, 'This bag is currently sorted by mining goods');
    assert.equal(row.sub[0].enabled, true);
    assert.equal(row.sub[0].reason, '');
    assert.equal(row.tooltip, 'Sorted for Mining, etc. · choose another sort');
    // All takes the sort off again through the same verb id.
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_sort:sort_all', engine), true);
    assert.equal(engine.data.packLast, `sorted:b1:sort_all`);
    assert.equal(sortRow().sub[0].current, true);
  });

  it('runs on the menu\'s bag: sort, magic sort and stack up, with the source\'s lines, and saves', () => {
    const { inv, prefs } = kit();
    const engine = engineWith({ ...inv }, ['pack_internal_sortitude', 'pack_magic_sort', 'pack_stack_up_bags']);
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    bagsFeature.packBagMenu('b2');
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_sort:sort_mining', engine), true);
    assert.equal(engine.data.packLast, 'sorted:b2:sort_mining');
    let L = globalThis.groddlePack.layout();
    assert.equal(L.bags.b2.label, 'Mining, etc.');
    assert.equal(L.bags.b1.sort, undefined);
    const sorted = bagsFeature.packVerbs('bag_bigger', engine);
    assert.equal(sorted.find((v) => v.id === 'bags_sort').sub.find((v) => v.id === 'bags_sort:sort_mining').enabled, false);
    assert.equal(sorted.find((v) => v.id === 'bags_magic_sort').enabled, true);
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_magic_sort', engine), true);
    assert.deepEqual(engine.lines, ['You have sorted your bag quite magically!']);
    L = globalThis.groddlePack.layout();
    assert.deepEqual(L.bags.b2.slots.map((s) => s.cls), ['tin', 'plain_metal', 'beryl']);
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_stack_up', engine), true);
    assert.equal(engine.lines[1], 'Your inventory has been stacked up!');
    assert.ok(engine.saves >= 3);
    // The sort saves with the bag's row.
    assert.equal(bagsFeature.save().prefs.bags.find((b) => b.key === 'b2').sort, 'sort_mining');
  });

  it('refuses without the card', () => {
    const { inv, prefs } = kit();
    const engine = engineWith({ ...inv });
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_sort:sort_mining', engine), false);
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_stack_up', engine), false);
  });
});

describe('the cards (imagination-remake.js)', () => {
  it('are live and dealt', () => {
    for (const id of ['pack_internal_sortitude', 'pack_magic_sort', 'pack_stack_up_bags']) {
      assert.equal(remakeStatus(id).status, 'live', id);
      assert.equal(isOfferedInRemake(id), true, id);
      assert.doesNotMatch(remakeStatus(id).note, /no bags/);
    }
  });
});
