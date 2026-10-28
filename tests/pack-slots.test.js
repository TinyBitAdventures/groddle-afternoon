/**
 * G152 bags: the pack's 16 slots, bags and the magic rock (js/pack-slots.js,
 * js/features/bags-feature.js). Source checks skip without the tinyspeck clones
 * beside the game (glitch-GameServerJS, glitch-client).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BAG_DEFS,
  PACK_CAPACITY,
  PACK_COPY,
  bagAccepts,
  layoutPack,
  moveStack,
  packIntoBags,
  roomFor,
  splitStacks,
  stackMaxOf,
} from '../public/js/pack-slots.js?v=g152-2';
import { STACKMAX } from '../public/js/pack-slots-data.js?v=g152-1';
import { bagsFeature, rockChanges } from '../public/js/features/bags-feature.js?v=g397-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const CLIENT = join(ROOT, '..', 'glitch-client');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** n distinct one-stack classes the data knows (stackmax 50 seeds and the like). */
const singles = (n, prefix = 'zz_single_') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 1]));

describe('source constants', () => {
  it('the pack is 16 slots (PC.as:48, bag.js:1)', (t) => {
    assert.equal(PACK_CAPACITY, 16);
    if (!existsSync(join(CLIENT, 'com/tinyspeck/engine/data/pc/PC.as'))) return t.skip('no glitch-client');
    assert.match(readFileSync(join(CLIENT, 'com/tinyspeck/engine/data/pc/PC.as'), 'utf8'), /pack_slots:int = 16;/);
    assert.match(readFileSync(join(GSJS, 'items/bag.js'), 'utf8'), /^var capacity = 16;/m);
  });

  it('every bag capacity is its file\'s own onCreate', (t) => {
    if (!existsSync(join(GSJS, 'items'))) return t.skip('no glitch-GameServerJS');
    for (const [cls, def] of Object.entries(BAG_DEFS)) {
      const src = readFileSync(join(GSJS, 'items', `${cls}.js`), 'utf8');
      const own = /function onCreate\(\)\{[^}]*?this\.capacity = (\d+);/.exec(src);
      assert.ok(own, `${cls} onCreate`);
      assert.equal(def.capacity, Number(own[1]), cls);
      const limited = /function onCreate\(\)\{[^}]*?this\.is_limited = true;/.test(src) || /^var is_limited = true;/m.test(src);
      assert.equal(def.limited, limited, `${cls} is_limited`);
    }
  });

  it('pack-slots-data.js is current (tools/build-pack-slots.mjs)', async (t) => {
    if (!existsSync(join(GSJS, 'items'))) return t.skip('no glitch-GameServerJS');
    const { packSlotsSource } = await import('../tools/build-pack-slots.mjs');
    assert.equal(read('public/js/pack-slots-data.js'), packSlotsSource(GSJS));
  });

  it('copy is the source\'s words', () => {
    assert.equal(PACK_COPY.pickupDisabled, 'Your inventory is full!');
    assert.equal(PACK_COPY.pickupFull, 'Your bag is full!');
    assert.equal(PACK_COPY.buyNone, "You can't buy that -- there's no more room in your inventory!");
    assert.equal(PACK_COPY.buyPartial(3), " And 3 didn't fit in your inventory, so you weren't charged for them.");
    assert.equal(PACK_COPY.rockHolding('3 Cherries', true), 'Your magic rock is holding 3 Cherries for you. Make room in your pack to hold them.');
    assert.equal(PACK_COPY.rockGiven('3 Cherries', true), 'Your 3 Cherries have been given to you.');
    if (existsSync(join(GSJS, 'items/include/takeable.js'))) {
      const take = readFileSync(join(GSJS, 'items/include/takeable.js'), 'utf8');
      assert.ok(take.includes(PACK_COPY.pickupDisabled) && take.includes(PACK_COPY.pickupFull));
      assert.ok(readFileSync(join(GSJS, 'players/inc_stores.js'), 'utf8').includes(PACK_COPY.buyNone));
    }
  });
});

describe('slots and stacks', () => {
  it('a class takes one slot per stackmax', () => {
    assert.equal(STACKMAX.get('apple'), 100);
    assert.deepEqual(splitStacks(250, 100), [100, 100, 50]);
    const out = layoutPack({ apple: 250 });
    assert.deepEqual(out.pack.slots.map((s) => s.count), [100, 100, 50]);
    assert.equal(out.used, 3);
    assert.equal(out.free, 13);
    assert.equal(stackMaxOf('not_a_gsjs_thing'), Infinity, 'unknown classes take one slot');
  });

  it('furniture and trophies take no slot', () => {
    const out = layoutPack({ furniture_chair: 4, apple: 1 });
    assert.equal(out.used, 1);
  });

  it('a full pack has no room for a new class but tops up a stack', () => {
    const inv = { ...singles(15), apple: 40 };
    const base = layoutPack(inv);
    assert.equal(base.free, 0);
    assert.equal(roomFor(inv, base.prefs, 'cherry', 5), 0);
    assert.equal(roomFor(inv, base.prefs, 'apple', 100), 60, 'the apple stack fills to its stackmax (bag.js:191-206)');
  });

  it('what does not fit is held by the magic rock, and comes back when room frees', () => {
    const inv = singles(16);
    const first = layoutPack(inv);
    const gained = layoutPack({ ...inv, cherry: 3 }, first.prefs);
    assert.deepEqual(gained.rock, { cherry: 3 });
    assert.ok(!gained.pack.slots.some((s) => s.cls === 'cherry'), 'the old stacks keep their slots');
    const freed = layoutPack({ ...inv, cherry: 3, zz_single_4: 0 }, gained.prefs);
    assert.deepEqual(freed.rock, {});
    assert.equal(freed.slotted.cherry, 3);
    const changes = rockChanges(gained.rock, freed.rock, gained.slotted, freed.slotted);
    assert.deepEqual(changes.given, [{ cls: 'cherry', n: 3 }]);
    assert.deepEqual(rockChanges({}, gained.rock).holding, [{ cls: 'cherry', n: 3 }]);
  });
});

describe('bags', () => {
  it('a Generic Bag has 10 slots and a Bigger Bag 16, each in one pack slot', () => {
    const out = layoutPack({ bag_generic: 1, bag_bigger: 1, ...singles(40) });
    assert.equal(out.used, 16);
    const bags = Object.values(out.bags);
    assert.deepEqual(bags.map((b) => b.capacity).sort((a, b) => a - b), [10, 16]);
    assert.equal(out.rockStacks, 40 - 14 - 26, 'pack 14 + bags 26 hold 40');
  });

  it('limited bags take their kind first (bag.js:157-188)', () => {
    const out = layoutPack({ bag_spicerack: 1, all_spice: 20, apple: 3 });
    const rack = Object.values(out.bags)[0];
    assert.deepEqual(rack.slots.map((s) => s.cls), ['all_spice']);
    assert.ok(!out.pack.slots.some((s) => s.cls === 'all_spice'));
  });

  it('what each bag takes', () => {
    assert.ok(bagAccepts(BAG_DEFS.bag_toolbox_red, 'hoe'));
    assert.ok(!bagAccepts(BAG_DEFS.bag_toolbox_red, 'apple'));
    assert.ok(!bagAccepts(BAG_DEFS.bag_generic, 'bag_generic'), 'no bag in a bag');
    assert.ok(!bagAccepts(BAG_DEFS.bag_generic, 'bag_gift_box'), 'a gift box is a bag too');
    assert.ok(!bagAccepts(BAG_DEFS.bag_generic, 'element_red'), 'elements only in a pouch');
    assert.ok(bagAccepts(BAG_DEFS.bag_alchemistry_kit, 'abbasidose'));
    assert.ok(bagAccepts(BAG_DEFS.bag_cubimal_case, 'npc_cubimal_chick'));
    assert.ok(bagAccepts(BAG_DEFS.bag_spicerack, 'all_spice'));
  });

  it('the Elemental Pouch holds one stack of each element', () => {
    const out = layoutPack({ bag_elemental_pouch: 1, element_red: 6000, element_blue: 10 });
    const pouch = Object.values(out.bags)[0];
    assert.deepEqual(pouch.slots.map((s) => `${s.cls}:${s.count}`), ['element_red:5000', 'element_blue:10']);
    assert.deepEqual(out.pack.slots.filter((s) => s.kind === 'stack').map((s) => `${s.cls}:${s.count}`), ['element_red:1000']);
  });

  it('a bag that leaves the pack leaves its contents in it', () => {
    const one = layoutPack({ bag_generic: 1, ...singles(20) });
    assert.equal(one.rockStacks, 0, 'bag + 15 in the pack, 5 in the bag');
    const gone = layoutPack({ bag_generic: 0, ...singles(20) }, one.prefs);
    assert.equal(gone.used, 16);
    assert.equal(gone.rockStacks, 4);
  });
});

describe('moving stacks', () => {
  it('drag a stack into a bag and back (PackDisplayManager.as inventory move)', () => {
    const inv = { bag_generic: 1, ...singles(15) };
    const base = layoutPack(inv);
    assert.equal(base.free, 0);
    const from = { container: 'pack', index: base.pack.slots.findIndex((s) => s.kind === 'stack') };
    const moved = moveStack(inv, base.prefs, from, { bag: 'b1' });
    assert.equal(moved.ok, true);
    const after = layoutPack(inv, moved.prefs);
    assert.equal(after.free, 1);
    assert.equal(after.bags.b1.slots.length, 1);
    assert.equal(roomFor(inv, moved.prefs, 'plum', 5), 5, 'the freed slot takes a pick up');
    const back = moveStack(inv, moved.prefs, { container: 'b1', index: 0 }, { container: 'pack' });
    assert.equal(back.ok, true);
    assert.equal(layoutPack(inv, back.prefs).free, 0);
  });

  it('a bag never goes in a bag (PackDisplayManager.as:675, 708)', () => {
    const inv = { bag_generic: 2 };
    const base = layoutPack(inv);
    const r = moveStack(inv, base.prefs, { container: 'pack', index: 0 }, { bag: 'b2' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, PACK_COPY.bagInBag);
  });

  it('a bag refuses what it cannot hold and a full bag refuses more', () => {
    const inv = { bag_toolbox_red: 1, apple: 1 };
    const base = layoutPack(inv);
    const appleAt = base.pack.slots.findIndex((s) => s.cls === 'apple');
    const r = moveStack(inv, base.prefs, { container: 'pack', index: appleAt }, { bag: 'b1' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /can't hold that/);
  });
});

describe('old saves', () => {
  it('a big solo kit is packed into a Red Toolbox and Bigger Bags with pack slots to spare', () => {
    const inv = { ...singles(38), hoe: 1, pick: 1, watering_can: 1, hatchet: 1, knife_and_board: 1, frying_pan: 1, blender: 1 };
    const plan = packIntoBags(inv, { isTool: (c) => ['hoe', 'pick', 'watering_can', 'hatchet', 'knife_and_board', 'frying_pan', 'blender'].includes(c) });
    assert.equal(plan.mint[0], 'bag_toolbox_red');
    assert.ok(plan.mint.slice(1).every((c) => c === 'bag_bigger'));
    const after = { ...inv };
    for (const c of plan.mint) after[c] = (after[c] || 0) + 1;
    const out = layoutPack(after, plan.prefs);
    assert.equal(out.rockStacks, 0);
    assert.ok(out.free >= 8, `free ${out.free}`);
  });

  it('a save that already fits gets nothing', () => {
    assert.deepEqual(packIntoBags(singles(10)).mint, []);
  });
});

describe('bags feature', () => {
  const engineFor = (mode, inv) => ({ mode, inv, started: true, setData() {}, pushActivity() {}, toast() {}, param: () => null });

  it('solo packs an overflowing save into bags once; multiplayer never mints', () => {
    const solo = engineFor('solo', singles(30));
    bagsFeature.restore(undefined, solo);
    const layout = bagsFeature.packLayout(solo);
    assert.ok((solo.inv.bag_bigger || 0) >= 1);
    assert.equal(layout.rockStacks, 0);
    assert.equal(bagsFeature.save().migrated, true);
    const mp = engineFor('multiplayer', singles(30));
    bagsFeature.restore(undefined, mp);
    const mpLayout = bagsFeature.packLayout(mp);
    assert.equal(mp.inv.bag_bigger, undefined);
    assert.equal(mpLayout.rockStacks, 14);
  });

  it('pick up is disabled with the source\'s words when nothing fits', () => {
    const e = engineFor('multiplayer', singles(16));
    bagsFeature.restore({ v: 1, migrated: true }, e);
    bagsFeature.packLayout(e);
    const verbs = [{ id: 'pickup', label: 'pick up', enabled: true }];
    const out = bagsFeature.decorateVerbs({ classId: 'dropped_item', state: { classTsid: 'plum', count: 5 } }, verbs, e);
    assert.equal(out[0].enabled, false);
    assert.equal(out[0].reason, 'Your inventory is full!');
    assert.equal(bagsFeature.decorateVerbs({ classId: 'dropped_item', state: { classTsid: 'zz_single_3', count: 1 } }, verbs, e), null, 'a stack that tops up still fits');
  });

  it('save and restore keep the arrangement and the open bag', () => {
    const e = engineFor('solo', { bag_generic: 1, apple: 2 });
    bagsFeature.restore({ v: 1, migrated: true }, e);
    bagsFeature.packLayout(e);
    bagsFeature.packToggleBag('b1', e);
    const saved = JSON.parse(JSON.stringify(bagsFeature.save()));
    bagsFeature.restore(saved, e);
    assert.equal(bagsFeature.packOpenBag(), 'b1');
    assert.deepEqual(bagsFeature.save().prefs.bags, [{ key: 'b1', cls: 'bag_generic' }]);
  });
});

describe('wiring', () => {
  it('game.js draws the layout and gates pick up and vendor buys', () => {
    const game = read('public/game.js');
    assert.match(game, /features\.query\('packLayout', engine\)/);
    assert.match(game, /features\.query\('packRoom', wantClass, wantCount, engine\)/);
    assert.match(game, /PACK_COPY\.pickupFull/);
    assert.match(game, /PACK_COPY\.buyNone/);
    assert.match(game, /PACK_COPY\.buyPartial/);
    assert.match(game, /playSound\('PACK_FULL'/);
  });

  it('the feature is registered and vendors stock the bags', () => {
    assert.match(read('public/js/features/index.js'), /bags-feature\.js\?v=g397-1'; FEATURES\.push\(bagsFeature\)/);
    const text = read('public/js/store-catalog.js');
    for (const cls of ['bag_generic', 'bag_bigger', 'bag_toolbox_red', 'bag_spicerack']) assert.ok(text.includes(`"classTsid": "${cls}"`), cls);
    for (const cls of Object.keys(BAG_DEFS)) assert.ok(existsSync(join(ROOT, 'public/assets/sprites/icons', `${cls}.png`)), `${cls} icon`);
  });
});
