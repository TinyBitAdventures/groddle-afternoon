/**
 * G83: the Elemental Pouch (js/elemental-pouch.js + features/elemental-pouch-feature.js).
 * Source: glitch-GameServerJS items/bag_elemental_pouch.js, inc_data_imagination.js
 * element_handling_bonus_1/_2, quests/elementhandling_buy_elemental_pouch.js,
 * items/catalog_stores.js.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ELEMENT_STACKMAX,
  POUCH_CLASS,
  POUCH_ITEM,
  SHAKE_COPY,
  PICKUP_BLOCKED,
  chooseOne,
  createPouchState,
  elementChangeText,
  pouchContents,
  pouchPickupCheck,
  shakeCheck,
  shakeDeltas,
  shakeElement,
  shakePouch,
} from '../public/js/elemental-pouch.js?v=42702eda';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=cd309adc';
import { runMoreVerb } from '../public/js/features/item-verbs-more-feature.js?v=c408ea6c';
import { pouchFeature } from '../public/js/features/elemental-pouch-feature.js?v=fc245749';
import { FEATURES } from '../public/js/features/index.js?v=22d61aba';
import { ITEM_CATALOG, countItem, createInventory } from '../public/js/inventory.js?v=f49c8998';
import { STORE_CATALOG } from '../public/js/store-catalog.js?v=74b56af3';
import { VENDOR_PROFILES, vendorBuy } from '../public/js/vendor.js?v=dc7d6463';
import { IMAGINATION_UPGRADES } from '../public/js/imagination.js?v=1bdfd77c';
import { isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js?v=c37ad887';
import { SKILL_REMAKE_NOTES } from '../public/js/skill-tree.js?v=e399b9ca';
import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';
import { acceptOffer, pendingQuestOffers, syncItemRequirements, turnInQuest } from '../public/js/quest-offers.js?v=89511e1e';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = decodeURIComponent(new URL('../../glitch-GameServerJS', import.meta.url).pathname);
const DAY = '2026-10-23';
const CARD1 = ['element_handling_bonus_1'];
const BOTH = ['element_handling_bonus_1', 'element_handling_bonus_2'];
const fill = (n) => ({ [POUCH_CLASS]: 1, element_blue: n, element_red: n, element_green: n, element_shiny: n });

describe('the item and where it comes from', () => {
  it('uses the source label, copy, base cost and stackmax', () => {
    assert.equal(POUCH_ITEM.label, 'Elemental Pouch');
    assert.equal(POUCH_ITEM.baseCost, 50);
    assert.equal(POUCH_ITEM.stackMax, 1);
    assert.match(POUCH_ITEM.desc, /What, you thought you could carry them in your HANDS\? Requires Element Handling skill\.$/);
    if (existsSync(join(GSJS, 'items/bag_elemental_pouch.js'))) {
      const src = readFileSync(join(GSJS, 'items/bag_elemental_pouch.js'), 'utf8');
      assert.ok(src.includes(`var description = "${POUCH_ITEM.desc}";`));
      assert.ok(src.includes('var base_cost = 50;'));
    }
    assert.ok(existsSync(join(ROOT, 'public/assets/sprites/icons/bag_elemental_pouch.webp')));
  });

  it('is stocked by the four source vendors at their catalog_stores.js prices', () => {
    const stocked = Object.fromEntries(
      STORE_CATALOG.flatMap((s) => s.offers.filter((o) => o.classTsid === POUCH_CLASS).map((o) => [s.key, o.cost]))
    );
    assert.deepEqual(stocked, { hardware: 56, alchemical: 54, tools: 53, mining: 75 });
    const pc = { currants: 100, imaginationUpgrades: [] };
    const inv = createInventory({});
    const bought = vendorBuy(pc, inv, VENDOR_PROFILES.alchemical.offers, POUCH_CLASS, 1);
    assert.equal(bought.ok, true);
    assert.equal(countItem(inv, POUCH_CLASS), 1);
    assert.equal(pc.currants, 46);
  });

  it('is registered in the pack catalog by the feature, which the registry loads', () => {
    assert.ok(FEATURES.some((f) => f.id === pouchFeature.id));
    pouchFeature._reset();
    assert.equal(ITEM_CATALOG[POUCH_CLASS].label, 'Elemental Pouch');
    assert.equal(ITEM_CATALOG[POUCH_CLASS].stackMax, 1);
    assert.deepEqual(ITEM_CATALOG[POUCH_CLASS].tags, ['bag', 'no_rube']);
  });

  it('needs Element Handling to pick up off the ground (canPickup)', () => {
    assert.deepEqual(pouchPickupCheck([]), { ok: false, msg: PICKUP_BLOCKED });
    assert.equal(PICKUP_BLOCKED, 'You need to know Element Handling to pick this up.');
    assert.equal(pouchPickupCheck(['elementhandling_1']).ok, true);
  });
});

describe('Get Elemental! (quests/elementhandling_buy_elemental_pouch.js)', () => {
  before(async () => {
    resetContentCatalogs();
    await loadContentCatalogsFromDir(join(ROOT, 'public/assets/content'));
  });

  it('is offered once you know Element Handling and completes when you buy a pouch', () => {
    const qs = createQuestState();
    const pc = { energy: 50, mood: 50, imagination: 0, xp: 0, currants: 200, giantFavor: {}, imaginationUpgrades: [] };
    const offered = pendingQuestOffers(qs, pc, { level: 5, skills: ['elementhandling_1'] }).map((r) => r.classTsid);
    assert.ok(offered.includes('elementhandling_buy_elemental_pouch'));
    const none = pendingQuestOffers(createQuestState(), pc, { level: 5, skills: [] }).map((r) => r.classTsid);
    assert.ok(!none.includes('elementhandling_buy_elemental_pouch'));

    const inv = createInventory({});
    const ctx = { inv, pc, addItem: (bag, id, n) => { bag[id] = (bag[id] || 0) + n; } };
    assert.equal(acceptOffer(qs, 'elementhandling_buy_elemental_pouch', ctx).completable.length, 0);
    assert.equal(vendorBuy(pc, inv, VENDOR_PROFILES.hardware.offers, POUCH_CLASS, 1).ok, true);
    assert.equal(pc.currants, 144);
    const sync = syncItemRequirements(qs, inv, { ...ctx, managedOnly: true });
    assert.deepEqual(sync.completable.map((r) => r.classTsid), ['elementhandling_buy_elemental_pouch']);
    const done = turnInQuest(qs, 'elementhandling_buy_elemental_pouch', pc, ctx);
    assert.equal(done.ok, true);
    assert.equal(countItem(inv, POUCH_CLASS), 1, 'the requirement does not remove the pouch');
    assert.deepEqual([inv.element_red, inv.element_green, inv.element_blue], [100, 100, 100]);
  });
});

describe('Shake (verbs.shake 53-114, doShake 669-690)', () => {
  it('is hidden without Elemental Shake and Super Elemental Shake', () => {
    assert.equal(shakeCheck(createPouchState(), fill(100), [], DAY), null);
    assert.equal(shakeDeltas([]), null);
    assert.deepEqual([...shakeDeltas(CARD1)], [0.04, 0.05, 0.06]);
    assert.deepEqual([...shakeDeltas(BOTH)], [0.08, 0.09, 0.1, 0.11, 0.12]);
    assert.deepEqual([...shakeDeltas(['element_handling_bonus_2'])], [0.08, 0.09, 0.1, 0.11, 0.12]);
  });

  it('is disabled with nothing to shake', () => {
    assert.deepEqual(shakeCheck(createPouchState(), { [POUCH_CLASS]: 1 }, CARD1, DAY), { ok: false, msg: "There's nothing to shake." });
    assert.equal(pouchContents(fill(3)), 12);
  });

  it('choose_one picks randInt(0, n-1)', () => {
    assert.equal(chooseOne([0.04, 0.05, 0.06], () => 0), 0.04);
    assert.equal(chooseOne([0.04, 0.05, 0.06], () => 0.5), 0.05);
    assert.equal(chooseOne([0.04, 0.05, 0.06], () => 0.999), 0.06);
    assert.equal(chooseOne([0.04, 0.05, 0.06], () => 1), 0.06);
  });

  it('Elemental Shake: 4 to 6% of each element, blue, red, green, shiny, once a day', () => {
    const state = createPouchState();
    const inv = fill(100);
    const out = shakePouch(state, inv, CARD1, DAY, { rng: () => 0 });
    assert.equal(out.ok, true);
    assert.equal(out.msg, 'You shook your pouch and created an additional 4 Blue Elements, 4 Red Elements, 4 Green Elements and 4 Shiny Elements.');
    assert.deepEqual([inv.element_blue, inv.element_red, inv.element_green, inv.element_shiny], [104, 104, 104, 104]);
    assert.equal(state.shakeDay, DAY);
    assert.deepEqual(shakeCheck(state, inv, CARD1, DAY), { ok: false, msg: 'You already Shook your Elements today.' });
    const again = shakePouch(state, inv, CARD1, DAY, { rng: () => 0 });
    assert.equal(again.ok, false);
    assert.equal(again.msg, SHAKE_COPY.already);
    assert.equal(inv.element_blue, 104);
    // doNewDay clears the daily counter.
    assert.equal(shakeCheck(state, inv, CARD1, '2026-10-24').ok, true);
  });

  it('Super Elemental Shake replaces the table: 8 to 12%', () => {
    const inv = fill(100);
    const out = shakePouch(createPouchState(), inv, BOTH, DAY, { rng: () => 0.99 });
    assert.equal(out.msg, 'You shook your pouch and created an additional 12 Blue Elements, 12 Red Elements, 12 Green Elements and 12 Shiny Elements.');
    const low = fill(100);
    shakePouch(createPouchState(), low, BOTH, DAY, { rng: () => 0 });
    assert.equal(low.element_red, 108);
  });

  it('draws a delta per element and rounds each bonus', () => {
    const rolls = [0, 0.5, 0.99, 0];
    let i = 0;
    const inv = { [POUCH_CLASS]: 1, element_blue: 25, element_red: 30, element_green: 0, element_shiny: 10 };
    const out = shakePouch(createPouchState(), inv, CARD1, DAY, { rng: () => rolls[i++] });
    // blue 25*0.04 = 1; red round(30*0.05 = 1.5) = 2; green 0; shiny round(10*0.04 = 0.4) = 0.
    assert.deepEqual(out.deltas, { element_blue: 0.04, element_red: 0.05, element_green: 0.06, element_shiny: 0.04 });
    assert.equal(out.msg, 'You shook your pouch and created an additional 1 Blue Element and 2 Red Elements.');
  });

  it('stops at 5000 of an element, and a full pouch (or a bonus that rounds to 0) does not use the day', () => {
    assert.equal(ELEMENT_STACKMAX, 5000);
    const inv = { element_red: 4990 };
    assert.equal(shakeElement(inv, 'element_red', 0.12), 10);
    assert.equal(inv.element_red, 5000);
    const state = createPouchState();
    const full = fill(5000);
    const out = shakePouch(state, full, BOTH, DAY, { rng: () => 0 });
    assert.equal(out.msg, 'You shook your pouch but it was too full to create any more elements.');
    assert.equal(state.shakeDay, '');
    const tiny = createPouchState();
    const few = { [POUCH_CLASS]: 1, element_red: 10 };
    assert.equal(shakePouch(tiny, few, CARD1, DAY, { rng: () => 0 }).msg, SHAKE_COPY.full);
    assert.equal(shakeCheck(tiny, few, CARD1, DAY).ok, true);
  });

  it('joins the change list with commas and a final "and"', () => {
    assert.equal(elementChangeText([{ name: 'Blue Element', count: 1 }]), '1 Blue Element');
    assert.equal(elementChangeText([{ name: 'Blue Element', count: 1 }, { name: 'Red Elements', count: 2 }]), '1 Blue Element and 2 Red Elements');
  });
});

describe('feature hooks', () => {
  let engine;
  beforeEach(() => {
    pouchFeature._reset();
    const data = {};
    engine = {
      inv: fill(100),
      pc: { imaginationUpgrades: [] },
      learnedSkills: ['elementhandling_1'],
      data,
      lines: [],
      setData: (k, v) => { data[k] = v; },
      param: () => null,
      pushActivity: (line) => engine.lines.push(line),
      toast: () => {},
      refreshPack: () => {},
      save: () => {},
    };
  });

  it('offers Shake only with a card (Rename is every bag\'s: tests/bag-rename.test.js)', () => {
    assert.deepEqual(pouchFeature.packVerbs(POUCH_CLASS, engine).map((v) => v.id), []);
    assert.deepEqual(pouchFeature.packVerbs('element_red', engine), []);
    engine.pc.imaginationUpgrades = [...CARD1];
    const verbs = pouchFeature.packVerbs(POUCH_CLASS, engine);
    assert.deepEqual(verbs.map((v) => v.id), ['shake']);
    assert.equal(verbs[0].enabled, true);
    assert.equal(verbs[0].tooltip, 'Shake up your Elements');
  });

  it('shakes once a game day and saves the counter', () => {
    engine.pc.imaginationUpgrades = [...CARD1];
    assert.equal(pouchFeature.runPackVerb(POUCH_CLASS, 'shake', engine), true);
    assert.match(engine.lines[0], /^You shook your pouch and created an additional \d+ Blue Elements/);
    assert.ok(engine.inv.element_blue >= 104 && engine.inv.element_blue <= 106);
    const verbs = pouchFeature.packVerbs(POUCH_CLASS, engine);
    assert.equal(verbs[0].enabled, false);
    assert.equal(verbs[0].reason, 'You already Shook your Elements today.');
    const saved = pouchFeature.save();
    assert.ok(saved.shakeDay);
    pouchFeature._reset();
    pouchFeature.restore(saved);
    assert.equal(pouchFeature.packVerbs(POUCH_CLASS, engine)[0].enabled, false);
    assert.equal(engine.data.pouchShake, 'disabled:You already Shook your Elements today.');
  });

  it('does nothing without a pouch in the pack', () => {
    engine.pc.imaginationUpgrades = [...CARD1];
    engine.inv[POUCH_CLASS] = 0;
    assert.equal(pouchFeature.runPackVerb(POUCH_CLASS, 'shake', engine), false);
  });

  it('greys out pick up on a dropped pouch for non Element Handlers', () => {
    const target = { classId: 'dropped_item', state: { classTsid: POUCH_CLASS } };
    const verbs = [{ id: 'pickup', label: 'pick up', enabled: true }];
    assert.equal(pouchFeature.decorateVerbs(target, verbs, engine), null);
    engine.learnedSkills = [];
    const out = pouchFeature.decorateVerbs(target, verbs, engine);
    assert.equal(out[0].enabled, false);
    assert.equal(out[0].reason, 'You need to know Element Handling to pick this up.');
    assert.equal(pouchFeature.decorateVerbs({ classId: 'dropped_item', state: { classTsid: 'apple' } }, verbs, engine), null);
  });
});

describe('cards and skill notes', () => {
  it('deals Elemental Shake and Super Elemental Shake with source costs', () => {
    assert.equal(IMAGINATION_UPGRADES.element_handling_bonus_1.cost, 2000);
    assert.equal(IMAGINATION_UPGRADES.element_handling_bonus_2.cost, 4000);
    for (const id of ['element_handling_bonus_1', 'element_handling_bonus_2']) {
      assert.equal(remakeStatus(id).status, 'live', id);
      assert.equal(isOfferedInRemake(id), true, id);
    }
  });

  it('marks Element Handling live with a note about the pouch', () => {
    assert.equal(SKILL_REMAKE_NOTES['Element Handling'].status, 'live');
    assert.match(SKILL_REMAKE_NOTES['Element Handling'].note, /Elemental Pouch/);
  });
});

// Report 99: a full pouch beside one with room. The rules are the pack's (js/pack-slots.js), read per pouch.
describe('two pouches: room is each pouch\'s, not one cap against the whole pack', () => {
  const PIECE = 'trophy_street_creator_wood_piece3'; // 300 green, 450 blue, 550 shiny
  const said = (engine) => engine.lines.join(' ');
  let engine;
  const rig = (inv) => {
    pouchFeature._reset();
    bagsFeature.restore(undefined);
    engine = {
      inv: { ...inv },
      pc: { imaginationUpgrades: [...CARD1] },
      learnedSkills: ['elementhandling_1'],
      lines: [],
      setData: () => {},
      param: () => null,
      pushActivity: (line) => engine.lines.push(line),
      toast: () => {},
      refreshPack: () => {},
      updateHud: () => {},
      playSound: () => {},
      achievement: () => {},
      featsIncrement: () => {},
      save: () => {},
      query: (hook, ...args) => (typeof bagsFeature[hook] === 'function' ? bagsFeature[hook](...args) : null),
    };
    bagsFeature.init(engine);
    return engine;
  };
  // A pack layout's prefs that put the stacks where the test says (b1 and b2 are the pouches).
  const place = (b1, b2) => {
    const stacks = (counts) => Object.keys(counts);
    const n = (counts) => Object.values(counts);
    bagsFeature.restore({
      v: 1,
      migrated: true,
      prefs: {
        place: { pack: ['@b1', '@b2'], b1: stacks(b1), b2: stacks(b2) },
        n: { b1: n(b1), b2: n(b2) },
        bags: { b1: { cls: POUCH_CLASS }, b2: { cls: POUCH_CLASS } },
      },
    }, engine);
  };
  /** Other things, one class per slot, until the pack has `free` slots left. */
  const fillPack = (free) => {
    const classes = ['apple', 'cherry', 'grain', 'meat', 'milk_butterfly', 'bun', 'cheese', 'plum', 'lemon', 'corn', 'carrot', 'tomato', 'onion', 'salmon', 'potato', 'rice'];
    let i = 0;
    while (bagsFeature.packLayout(engine).free > free) engine.inv[classes[i++]] = 1;
  };

  it('Smash: green full in one pouch goes to the other, nothing destroyed', () => {
    rig({ [POUCH_CLASS]: 2, element_green: 5000, [PIECE]: 1 });
    assert.equal(bagsFeature.packRoom('element_green', 300, engine), 300);
    assert.ok(runMoreVerb(engine, PIECE, 'smash'));
    assert.equal(said(engine), 'You smashed A Piece of Street Creator Wood Trophy. You received 300 Green Elements, 450 Blue Elements and 550 Shiny Elements.');
    assert.deepEqual([engine.inv.element_green, engine.inv.element_blue, engine.inv.element_shiny, engine.inv[PIECE] || 0], [5300, 450, 550, 0]);
    const layout = bagsFeature.packLayout(engine);
    assert.equal(layout.rockStacks, 0);
    assert.deepEqual(Object.values(layout.bags).map((b) => b.slots.find((s) => s.cls === 'element_green')?.count).sort((a, b) => a - b), [300, 5000]);
  });

  it('Smash: one full pouch and a free pack slot, the slot takes none: the element is destroyed (the ruling of 2026-11-07)', () => {
    rig({ [POUCH_CLASS]: 1, element_green: 5000, [PIECE]: 1 });
    runMoreVerb(engine, PIECE, 'smash');
    assert.match(said(engine), /^You smashed A Piece of Street Creator Wood Trophy\. 300 Green Elements were created, but destroyed, because you couldn't carry them\./);
    assert.equal(engine.inv.element_green, 5000);
    assert.equal(bagsFeature.packLayout(engine).pack.slots.find((s) => s.cls === 'element_green'), undefined);
  });

  it('Smash: no room anywhere, all of it is created, but destroyed, and the piece is spent', () => {
    rig({ [POUCH_CLASS]: 1, element_green: 5000, element_blue: 5000, element_shiny: 5000, element_red: 5000, [PIECE]: 1 });
    fillPack(0);
    runMoreVerb(engine, PIECE, 'smash');
    assert.equal(said(engine), "You smashed A Piece of Street Creator Wood Trophy. 300 Green Elements were created, but destroyed, because you couldn't carry them. 450 Blue Elements were created, but destroyed, because you couldn't carry them. 550 Shiny Elements were created, but destroyed, because you couldn't carry them.");
    assert.deepEqual([engine.inv.element_green, engine.inv.element_blue, engine.inv.element_shiny, engine.inv[PIECE] || 0], [5000, 5000, 5000, 0]);
    assert.equal(bagsFeature.packLayout(engine).rockStacks, 0);
  });

  it('Shake: each pouch reads its own stacks (doShake this.countItemClass 678; canContain 651-659)', () => {
    rig({ [POUCH_CLASS]: 2, element_green: 6000 });
    place({ element_green: 5000 }, { element_green: 1000 });
    // The pack holds 6000, over one pouch's 5000: the old sum called this too full.
    bagsFeature.packBagMenu('b2');
    assert.deepEqual(bagsFeature.packBagCounts(POUCH_CLASS, engine), { key: 'b2', counts: { element_green: 1000 } });
    assert.equal(pouchFeature.runPackVerb(POUCH_CLASS, 'shake', engine), true);
    assert.match(said(engine), /^You shook your pouch and created an additional (40|50|60) Green Elements\.$/);
    const layout = bagsFeature.packLayout(engine);
    assert.equal(layout.bags.b1.slots[0].count, 5000);
    assert.ok(layout.bags.b2.slots[0].count > 1000);
  });

  it('Shake: the full pouch is too full and the day is not used, as a full pouch always was; the empty one has nothing to shake', () => {
    rig({ [POUCH_CLASS]: 2, element_green: 5000 });
    place({ element_green: 5000 }, {});
    bagsFeature.packBagMenu('b1');
    assert.equal(pouchFeature.packVerbs(POUCH_CLASS, engine)[0].enabled, true);
    pouchFeature.runPackVerb(POUCH_CLASS, 'shake', engine);
    assert.equal(said(engine), SHAKE_COPY.full);
    assert.equal(engine.inv.element_green, 5000);
    bagsFeature.packBagMenu('b2');
    const verb = pouchFeature.packVerbs(POUCH_CLASS, engine)[0];
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, SHAKE_COPY.empty);
  });
});
