/**
 * Bag names: the original's Rename verb on every bag (Live Help 2026-11-02:
 * "any chance we'll be able to Name (and rename) our Bags?").
 *
 * Source (glitch-GameServerJS, CC0): items/bag_bigger.js verbs.rename 475-520
 * (tooltip "Give me a new name", sort_on 67, "Name Me!" / "My new name:", 32
 * characters of 'A-Z a-z 0-9'), getLabel 592-598 (the name, else the label),
 * onInputBoxResponse 605-611 (cut to 32, letters, digits and spaces kept, an
 * empty answer keeps the old name). Rules: js/bag-names.js; the name lives on
 * the bag's row in the pack arrangement (js/pack-slots.js), the feature is
 * features/bags-feature.js, a dropped bag keeps it (js/world-items.js).
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BAG_NAME_MAX,
  BAG_RENAME_COPY,
  RENAMABLE_BAGS,
  SOURCE_RENAMABLE_BAGS,
  bagLabel,
  canRenameBag,
  cleanBagName,
  renamedTo,
} from '../public/js/bag-names.js?v=22391c55';
import { BAG_DEFS, PACK_CAPACITY, giveBag, layoutPack, moveStack, normalizePrefs, renameBag, takeBag } from '../public/js/pack-slots.js?v=a94b816c';
import { ITEM_CATALOG, isToolItem } from '../public/js/inventory.js?v=d82f3b00';
import { createDroppedItemState, dropInventoryStack, parseDroppedItemState, placeDroppedBag, serializeDroppedItemState } from '../public/js/world-items.js?v=6378e71c';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=e3195f4b';
import { pouchFeature } from '../public/js/features/elemental-pouch-feature.js?v=91bc070a';
import { POUCH_CLASS } from '../public/js/elemental-pouch.js?v=ceefa97a';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const ROOT = join(import.meta.dirname, '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS', 'items');
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };

/** Two Bigger Bags (b1 with apples, b2 empty) and a Red Toolbox (b3). */
function kit() {
  const inv = { bag_bigger: 2, bag_toolbox_red: 1, apple: 3, cherry: 2 };
  const prefs = {
    bags: [{ key: 'b1', cls: 'bag_bigger' }, { key: 'b2', cls: 'bag_bigger' }, { key: 'b3', cls: 'bag_toolbox_red' }],
    place: { pack: ['@b1', '@b2', '@b3', 'cherry'], b1: ['apple'], b2: [], b3: [] },
    n: { pack: [0, 0, 0, 2], b1: [3], b2: [], b3: [] },
  };
  return { inv, prefs };
}

function soloEngine(inv) {
  const data = {};
  const engine = {
    mode: 'solo',
    started: true,
    inv,
    data,
    saves: 0,
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    pushActivity: () => {},
    toast: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    playSound: () => {},
    save: () => { engine.saves += 1; },
    droppedItems: createDroppedItemState(),
    dropTsid: 'LSTREET1',
    droppedItemsChanged: () => { engine.dropChanges = (engine.dropChanges || 0) + 1; },
  };
  engine.query = (hook, ...args) => (typeof bagsFeature[hook] === 'function' ? bagsFeature[hook](...args) : null);
  return engine;
}

describe('the rules (onInputBoxResponse 605-611)', () => {
  it('keeps the first 32 characters, then only letters, digits and spaces', () => {
    assert.equal(cleanBagName('Lunch-Box #1!'), 'LunchBox 1');
    assert.equal(cleanBagName('x'.repeat(40)).length, BAG_NAME_MAX);
    // Cut first, then cleaned (substr(0, 32) before replace): 31 letters and a dash, then more letters.
    assert.equal(cleanBagName(`${'a'.repeat(31)}-bbbb`), 'a'.repeat(31));
    assert.equal(cleanBagName('Ünïcode ok 9'), 'ncode ok 9');
    assert.equal(cleanBagName(null), '');
    assert.equal(cleanBagName('   '), '');
  });

  it('an empty answer keeps the old name; a new one replaces it', () => {
    assert.equal(renamedTo('Lunchbox', ''), 'Lunchbox');
    assert.equal(renamedTo('Lunchbox', '!!!'), 'Lunchbox');
    assert.equal(renamedTo('Lunchbox', '   '), 'Lunchbox');
    assert.equal(renamedTo('Lunchbox', 'Tools 2'), 'Tools 2');
    assert.equal(renamedTo('', ''), '');
  });

  it('shows the name, else the class label (getLabel 592-598)', () => {
    assert.equal(bagLabel('Lunchbox', 'Bigger Bag'), 'Lunchbox');
    assert.equal(bagLabel('', 'Bigger Bag'), 'Bigger Bag');
  });

  it("says the source's words", () => {
    assert.equal(BAG_RENAME_COPY.label, 'Rename');
    assert.equal(BAG_RENAME_COPY.tooltip, 'Give me a new name');
    assert.equal(BAG_RENAME_COPY.title, 'Name Me!');
    assert.equal(BAG_RENAME_COPY.input, 'My new name:');
    assert.equal(BAG_RENAME_COPY.sortOn, 67);
  });
});

describe('which bags have Rename (grep -ln "verbs.rename" items/bag*.js)', () => {
  it('the source list is what the source has', (t) => {
    if (!existsSync(GSJS)) return t.skip('no glitch-GameServerJS');
    const have = readdirSync(GSJS)
      .filter((f) => /^bag.*\.js$/.test(f) && /verbs\.rename = /.test(readFileSync(join(GSJS, f), 'utf8')))
      .map((f) => f.replace(/\.js$/, ''))
      .sort();
    assert.deepEqual(have, [...SOURCE_RENAMABLE_BAGS].sort());
    // Word for word on each (the verb's name, tooltip, sort and the 32-character box).
    for (const cls of have) {
      const src = readFileSync(join(GSJS, `${cls}.js`), 'utf8');
      assert.match(src, /"tooltip"\t+: "Give me a new name"/, cls);
      // sort_on 67 everywhere but bag_bigger_pink.js:483 (66): the verb sits in the same place on each menu.
      assert.match(src, new RegExp(`"sort_on"\\t+: ${cls === 'bag_bigger_pink' ? 66 : 67},\\n\\t"tooltip"\\t+: "Give me a new name"`), cls);
      assert.match(src, /input_max_chars: 32/, cls);
      assert.match(src, /this\.askPlayer\(pc, 'name', 'Name Me!', args\)/, cls);
    }
    // The furniture cabinets have none.
    assert.ok(!/verbs\.rename = /.test(readFileSync(join(GSJS, 'bag_furniture_cabinet.js'), 'utf8')));
  });

  it('every bag the pack opens is on it and has Rename; the rest have none', () => {
    for (const cls of Object.keys(BAG_DEFS)) {
      assert.ok(SOURCE_RENAMABLE_BAGS.includes(cls), cls);
      assert.equal(canRenameBag(cls), true, cls);
    }
    assert.deepEqual([...RENAMABLE_BAGS].sort(), Object.keys(BAG_DEFS).sort());
    for (const cls of ['bag_gift_box', 'bag_test_item', 'bag_furniture_cabinet', 'apple']) assert.equal(canRenameBag(cls), false, cls);
  });
});

describe('each bag has its own name (pack-slots.js)', () => {
  it('names one Bigger Bag and not the other; the label follows', () => {
    const { inv, prefs } = kit();
    const res = renameBag(prefs, 'b2', 'Lunch-box!');
    assert.equal(res.ok, true);
    assert.equal(res.name, 'Lunchbox');
    const layout = layoutPack(inv, res.prefs, OPTS);
    assert.equal(layout.bags.b2.label, 'Lunchbox');
    assert.equal(layout.bags.b2.className, 'Bigger Bag');
    assert.equal(layout.bags.b1.label, 'Bigger Bag');
    assert.equal(layout.bags.b1.name, '');
    assert.equal(layout.pack.slots.find((s) => s.key === 'b2').name, 'Lunchbox');
    assert.deepEqual(layout.prefs.bags.find((b) => b.key === 'b2'), { key: 'b2', cls: 'bag_bigger', name: 'Lunchbox' });
    assert.deepEqual(layout.prefs.bags.find((b) => b.key === 'b1'), { key: 'b1', cls: 'bag_bigger' });
  });

  it('an empty answer keeps the old name', () => {
    const { prefs } = kit();
    const first = renameBag(prefs, 'b1', 'Fruit');
    const again = renameBag(first.prefs, 'b1', '   ');
    assert.equal(again.ok, true);
    assert.equal(again.changed, false);
    assert.equal(again.name, 'Fruit');
    assert.equal(normalizePrefs(again.prefs).bags[0].name, 'Fruit');
  });

  it('a toolbox takes a name too; an unknown key does not', () => {
    const { prefs } = kit();
    assert.equal(renameBag(prefs, 'b3', 'Tools').name, 'Tools');
    assert.equal(renameBag(prefs, 'b9', 'Nope').ok, false);
  });

  it('the save cleans a name it is handed', () => {
    const p = normalizePrefs({ bags: [{ key: 'b1', cls: 'bag_bigger', name: '<b>Hi</b> there, friend and more letters than fit' }] });
    // Cut to 32 first ('<b>Hi</b> there, friend and more'), then cleaned.
    assert.equal(p.bags[0].name, 'bHib there friend and more');
    assert.equal(normalizePrefs({ bags: [{ key: 'b1', cls: 'bag_bigger', name: '!!' }] }).bags[0].name, undefined);
  });

  it('moving a bag along the pack row keeps its name', () => {
    const { inv, prefs } = kit();
    const named = renameBag(prefs, 'b1', 'Fruit').prefs;
    const moved = moveStack(inv, named, { container: 'pack', index: 0 }, { container: 'pack', index: 2 }, OPTS);
    assert.equal(moved.ok, true);
    const layout = layoutPack(inv, moved.prefs, OPTS);
    assert.deepEqual(layout.pack.slots.filter((s) => s.kind === 'bag').map((s) => s.key), ['b2', 'b3', 'b1']);
    assert.equal(layout.bags.b1.label, 'Fruit');
  });

  it('takeBag gives the name and giveBag puts it back', () => {
    const { inv, prefs } = kit();
    const named = renameBag(prefs, 'b1', 'Fruit').prefs;
    const out = takeBag(inv, named, 'b1', OPTS);
    assert.equal(out.name, 'Fruit');
    const left = { ...inv, bag_bigger: 1, apple: 0 };
    const back = giveBag(left, out.prefs, 'bag_bigger', out.contents, OPTS, out.name);
    assert.equal(back.ok, true);
    const layout = layoutPack({ ...left, bag_bigger: 2, apple: 3 }, back.prefs, OPTS);
    assert.equal(layout.bags[back.key].label, 'Fruit');
    assert.deepEqual(layout.bags[back.key].slots.map((s) => [s.cls, s.count]), [['apple', 3]]);
  });
});

describe('on the ground (world-items.js)', () => {
  it('a dropped bag keeps its name through the save and never merges', () => {
    const state = createDroppedItemState();
    placeDroppedBag(state, 'LSTREET1', 'bag_bigger', [], { x: 10, y: 20 }, { now: 1, name: 'Spare' });
    const again = parseDroppedItemState(serializeDroppedItemState(state));
    const row = again.streets.LSTREET1[0];
    assert.equal(row.name, 'Spare');
    assert.equal(row.contents, undefined);
    // An unnamed Bigger Bag dropped beside it does not join the named one.
    const inv = { bag_bigger: 1 };
    const res = dropInventoryStack(again, inv, 'LSTREET1', 'bag_bigger', 1, { x: 12, y: 20 }, { now: 2 });
    assert.equal(res.merged, false);
    assert.equal(again.streets.LSTREET1.length, 2);
  });

  it('a name on something that is not a bag is not kept', () => {
    const state = parseDroppedItemState({ streets: { LSTREET1: [{ id: 'world-item-1', classTsid: 'apple', count: 1, name: 'Bob' }] } });
    assert.equal(state.streets.LSTREET1[0].name, undefined);
  });
});

describe('the feature (bags-feature.js)', () => {
  beforeEach(() => {
    bagsFeature.restore(undefined);
    pouchFeature._reset();
  });

  it('every bag menu has Rename, enabled, with the source tooltip; stacks do not', () => {
    const { inv, prefs } = kit();
    const engine = soloEngine(inv);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    for (const cls of ['bag_bigger', 'bag_toolbox_red']) {
      assert.deepEqual(bagsFeature.packVerbs(cls, engine), [{ id: 'bags_rename', label: 'Rename', enabled: true, reason: '', tooltip: 'Give me a new name' }]);
    }
    assert.ok(!(bagsFeature.packVerbs('apple', engine) || []).some((v) => v.id === 'bags_rename'));
    // Without a document the box is not drawn, but the verb is the feature's.
    assert.equal(bagsFeature.runPackVerb('bag_bigger', 'bags_rename', engine), true);
  });

  it("names the menu's bag and saves; the name round-trips through the save", () => {
    const { inv, prefs } = kit();
    const engine = soloEngine(inv);
    bagsFeature.init(engine);
    bagsFeature.restore({ v: 1, prefs, migrated: true }, engine);
    bagsFeature.packBagMenu('b2');
    const res = globalThis.groddlePack.rename('b2', 'Lunchbox');
    assert.equal(res.ok, true);
    assert.equal(engine.saves, 1);
    assert.equal(engine.data.packBagNames, 'b2:bag_bigger:Lunchbox');
    assert.deepEqual(bagsFeature.packBagInfo('b2', engine), { key: 'b2', cls: 'bag_bigger', label: 'Lunchbox', name: 'Lunchbox', className: 'Bigger Bag' });
    // A stack's Put in / Take out buttons say the bag's name (PackDisplayManager.as:725-727 "Put in <b>label</b>").
    const put = bagsFeature.packVerbs('cherry', engine).map((v) => v.label);
    assert.ok(put.includes('Put in Lunchbox (0/16)'), put.join(' | '));
    assert.ok(put.includes('Put in Bigger Bag (1/16)'), put.join(' | '));
    // Blank keeps it, and does not save again.
    globalThis.groddlePack.rename('b2', '');
    assert.equal(engine.saves, 1);
    assert.equal(bagsFeature.packBagInfo('b2', engine).label, 'Lunchbox');
    // Through JSON, as the save store and the site's save route keep it.
    const saved = JSON.parse(JSON.stringify(bagsFeature.save()));
    bagsFeature.restore(undefined, engine);
    assert.equal(bagsFeature.packBagInfo('b2', engine).label, 'Bigger Bag');
    bagsFeature.restore(saved, engine);
    const layout = bagsFeature.packLayout(engine);
    assert.equal(layout.bags.b2.label, 'Lunchbox');
    assert.equal(layout.bags.b1.label, 'Bigger Bag');
  });

  it('a dropped bag takes its name down and back up', () => {
    const { inv, prefs } = kit();
    const engine = soloEngine(inv);
    bagsFeature.restore({ v: 1, prefs: renameBag(prefs, 'b2', 'Spare').prefs, migrated: true }, engine);
    const out = bagsFeature.packTakeBag('b2', engine);
    assert.equal(out.ok, true);
    assert.equal(out.name, 'Spare');
    assert.equal(inv.bag_bigger, 1);
    const back = bagsFeature.packGiveBag('bag_bigger', out.contents, engine, out.name);
    assert.equal(back.ok, true);
    assert.equal(bagsFeature.packBagInfo(back.key, engine).label, 'Spare');
  });

  it("adds Rename to a dropped bag of one's own, and renames it where it lies", () => {
    const engine = soloEngine({});
    const placed = placeDroppedBag(engine.droppedItems, 'LSTREET1', 'bag_generic', [], { x: 0, y: 0 }, { name: 'Old' });
    const target = { classId: 'dropped_item', worldItemId: placed.stack.id, state: { id: placed.stack.id, classTsid: 'bag_generic', name: 'Old' } };
    const verbs = bagsFeature.decorateVerbs(target, [{ id: 'pickup', label: 'pick up', sort: 10, enabled: true }], engine);
    assert.deepEqual(verbs.map((v) => v.id), ['pickup', 'rename']);
    assert.equal(verbs[1].tooltip, 'Give me a new name');
    assert.equal(bagsFeature.bagRenameGround(target, engine), true);
    // A stack that is not the player's own record (a shared one) has no Rename.
    const shared = { classId: 'dropped_item', worldItemId: 'shared-1', state: { id: 'shared-1', classTsid: 'bag_generic' } };
    assert.equal(bagsFeature.decorateVerbs(shared, [{ id: 'pickup', label: 'pick up', enabled: true }], engine), null);
    assert.equal(bagsFeature.bagRenameGround(shared, engine), null);
  });

  it("the Elemental Pouch's one-name save goes to its first pouch, once", () => {
    const inv = { [POUCH_CLASS]: 2, element_red: 10 };
    const engine = soloEngine(inv);
    bagsFeature.restore({ v: 1, migrated: true }, engine);
    bagsFeature.packLayout(engine);
    pouchFeature.restore({ name: 'Sparkles' });
    // The pouch's own Rename is gone: one Rename, the bags feature's.
    assert.ok(!pouchFeature.packVerbs(POUCH_CLASS, engine).some((v) => v.id === 'rename'));
    pouchFeature.onTick(16, Date.now(), engine);
    const layout = bagsFeature.packLayout(engine);
    const pouches = Object.values(layout.bags).filter((b) => b.cls === POUCH_CLASS);
    assert.deepEqual(pouches.map((b) => b.label), ['Sparkles', 'Elemental Pouch']);
    assert.equal(pouchFeature.save().name, '');
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

describe("the site's ledger ignores bag names (LedgerMath::holdings)", { skip: skipSite }, () => {
  it('counts the same holdings with and without names', () => {
    const { prefs } = kit();
    const state = (named) => ({
      inventory: { bag_bigger: 2, apple: 3 },
      player: { currants: 5 },
      systems: { features: { bags: { v: 1, prefs: named ? renameBag(prefs, 'b1', 'Fruit').prefs : prefs, migrated: true } } },
    });
    const dropped = (named) => ({ version: 1, nextId: 2, streets: { LSTREET1: [{ id: 'world-item-1', classTsid: 'bag_generic', count: 1, x: 0, y: 0, ...(named ? { name: 'Spare' } : {}) }] } });
    const run = (named) => {
      const entries = JSON.stringify({ playerState: JSON.stringify(state(named)), droppedItems: JSON.stringify(dropped(named)) });
      const code = `foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerMath; use Groddle\\Minn\\Economy; echo json_encode(LedgerMath::holdings(json_decode(${JSON.stringify(entries)}, true), Economy::shared()));`;
      return JSON.parse(execFileSync('php', ['-r', code]).toString());
    };
    const plain = run(false);
    assert.deepEqual(run(true), plain);
    assert.equal(plain.items.bag_bigger, 2);
    assert.equal(plain.items.bag_generic, 1);
  });
});
