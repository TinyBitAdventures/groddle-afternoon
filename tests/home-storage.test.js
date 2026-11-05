/**
 * Ticket 51 (G404): cabinets and the Storage Display Box, as the original did
 * them (GSJS items/bag_furniture_cabinet.js and its variants,
 * items/bag_furniture_sdb.js; glitch-client CabinetDialog.as, StoreBuyUI.as).
 * The rules are js/home-storage.js; the save keeps them on the placed rows
 * (js/home-decor.js); the site's src/LedgerBoxes.php and LedgerMath.php keep
 * the same rules for what crosses between players and what a save holds.
 *
 * Run: node --test tests/home-storage.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CABINETS,
  STORAGE_TEXT,
  applyOwnerOp,
  cabinetDef,
  cabinetMove,
  cabinetPut,
  cabinetRefusal,
  cabinetRoom,
  cabinetTake,
  cabinetVerbs,
  cabinetView,
  cabinetCounts,
  slotHoldsBag,
  normalizeContents,
  parseSdbPrice,
  sdbBuyMax,
  sdbCheckEmpty,
  sdbQuote,
  sdbSelling,
  sdbStoreItem,
  sdbVerbs,
  setSdbPrice,
  storageHasContents,
  storagePickupLock,
} from '../public/js/home-storage.js?v=6c449b4e';
import { createHomeDecorState, normalizeHomeDecorState, pickUpFurniture } from '../public/js/home-decor.js?v=5551be2e';
import { takeFromHouse } from '../public/js/ledger-house.js?v=b34f5c89';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS/items');
const read = (f) => {
  try {
    return readFileSync(join(GSJS, f), 'utf8');
  } catch {
    return '';
  }
};
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipPhp = skipWithoutSite || (!hasPhp && 'no php');
function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'Neighbours', 'LedgerFurniture', 'LedgerStarter', 'LedgerBoxes'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerBoxes; use Groddle\\Minn\\LedgerMath; use Groddle\\Minn\\Economy; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

function room(rows) {
  const st = createHomeDecorState({});
  st.placed.length = 0;
  st.placed.push(...rows);
  return st;
}

describe('cabinets: their size and what they take (bag_furniture_cabinet_base)', () => {
  it('has the source sizes: Cabinet 4x8 (32 slots), Small 4x4, Wall 3x3, Large 2x3', () => {
    assert.deepEqual(cabinetDef('bag_furniture_cabinet'), { cols: 4, rows: 8, rowsDisplay: 4, capacity: 32 });
    assert.equal(cabinetDef('bag_furniture_smallcabinet').capacity, 16);
    assert.equal(cabinetDef('bag_furniture_wallcabinet').capacity, 9);
    assert.equal(cabinetDef('bag_furniture_largecabinet').capacity, 6);
    assert.equal(cabinetDef('furniture_cabinet'), null, 'the plain Cabinet is furniture, not storage');
    for (const [cls, d] of Object.entries(CABINETS)) {
      const src = read(`${cls}.js`);
      if (!src) continue;
      assert.match(src, new RegExp(`"width"\\t: "${d.cols}"`), cls);
      assert.match(src, new RegExp(`"height"\\t: "${d.rows}"`), cls);
      assert.match(src, new RegExp(`"rows_display"\\t: "${d.rowsDisplay}"`), cls);
      const cap = src.match(/^var capacity = (\d+);/m);
      if (cap) assert.equal(Number(cap[1]), d.cols * d.rows, cls);
    }
    const base = read('bag_furniture_cabinet.js');
    if (base) {
      assert.match(base, /if \(stack\.class_id == 'contraband'\) return 0;\n\tif \(stack\.getProp\('is_element'\)\) return 0;\n\tif \(stack\.getProp\('is_trophy'\)\) return 0;/);
      assert.match(base, /"You must empty the cabinet first\."/);
      assert.match(base, /"tooltip"\t\t\t: "Inspect your storage"/);
    }
  });

  it('canContain: no contraband, elements, trophies or furniture, nothing untakeable or no_bag', () => {
    assert.equal(cabinetRefusal('apple'), null);
    assert.equal(cabinetRefusal('pick'), null, 'tools go in, with their wear');
    for (const [cls, meta] of [['contraband', {}], ['element_red', { element: true }], ['trophy_gem', { noSlot: true }], ['furniture_chair', { noSlot: true }], ['quest_thing', { blocked: true }], ['npc_crafty_bot', { noBag: true }]]) {
      assert.equal(cabinetRefusal(cls, meta)?.msg, STORAGE_TEXT.cantGoIn, cls);
    }
  });

  it('keeps a slot per place in its grid; an old save is an empty cabinet', () => {
    const empty = normalizeContents('bag_furniture_smallcabinet', undefined);
    assert.equal(empty.length, 16);
    assert.ok(empty.every((s) => s === null));
    const kept = normalizeContents('bag_furniture_wallcabinet', [{ classTsid: 'apple', count: 5 }, null, { classTsid: 'bad!', count: 0 }, ...Array(6).fill(null), { classTsid: 'plum', count: 2 }], () => 100);
    assert.equal(kept.length, 9);
    assert.deepEqual(kept[0], { classTsid: 'apple', count: 5 });
    assert.deepEqual(kept[1], { classTsid: 'plum', count: 2 }, 'a stack past the end moves into the first free slot');
    assert.deepEqual(normalizeContents('bag_furniture_wallcabinet', [{ classTsid: 'apple', count: 900 }], () => 100)[0].count, 100, 'never more than a stack');
  });

  it('puts in like an inventory move: the slot named, else top up, then empty slots; takes from the last stacks', () => {
    const s = normalizeContents('bag_furniture_largecabinet', []);
    assert.equal(cabinetPut(s, 'apple', 150, { max: 100 }), 150);
    assert.deepEqual(s.slice(0, 2), [{ classTsid: 'apple', count: 100 }, { classTsid: 'apple', count: 50 }]);
    assert.equal(cabinetRoom(s, 'apple', 100), 50 + 4 * 100);
    assert.equal(cabinetPut(s, 'plum', 3, { slot: 1, max: 100 }), 0, 'a slot of another class takes nothing');
    assert.equal(cabinetPut(s, 'plum', 3, { slot: 4, max: 100 }), 3);
    assert.deepEqual(cabinetTake(s, 'apple', 60), { taken: 60, points: [] });
    assert.deepEqual(s.slice(0, 2), [{ classTsid: 'apple', count: 90 }, null], 'the last stack goes first');
    assert.equal(cabinetPut(s, 'pick', 1, { max: 1, points: [42] }), 1);
    const at = s.findIndex((x) => x?.classTsid === 'pick');
    assert.deepEqual(s[at], { classTsid: 'pick', count: 1, points: [42] });
    assert.deepEqual(cabinetTake(s, 'pick', 1, { slot: at }), { taken: 1, points: [42] }, 'a tool keeps its wear');
    // CabinetDialog onSlotMouseUp: move, top up, or swap.
    assert.equal(cabinetMove(s, 0, 5, 100), true);
    assert.equal(s[0], null);
    assert.equal(cabinetMove(s, 4, 5, 100), true, 'a swap');
    assert.equal(s[5].classTsid, 'plum');
    assert.equal(s[4].classTsid, 'apple');
  });

  it('opens for the owner or a key-holder, never while it is for sale', () => {
    assert.deepEqual(cabinetVerbs({ canOpen: false }), []);
    const [open] = cabinetVerbs({ canOpen: true });
    assert.equal(open.label, 'open');
    assert.equal(open.tooltip, 'Inspect your storage');
    assert.equal(cabinetVerbs({ canOpen: true, forSale: true })[0].reason, "You can't add items while it's for sale.");
  });
});

describe('the save keeps a cabinet and a box with the house (js/home-decor.js)', () => {
  it('normalizes old saves: cabinets empty, boxes keep what they show and are not selling', () => {
    const old = normalizeHomeDecorState({ placed: [
      { id: 1, classTsid: 'bag_furniture_smallcabinet', x: 200, y: 620 },
      { id: 2, classTsid: 'bag_furniture_sdb', x: 600, y: 500, display: { classTsid: 'apple', count: 4 } },
    ] });
    assert.equal(old.placed[0].contents, undefined);
    assert.deepEqual(old.placed[1].display, { classTsid: 'apple', count: 4 });
    assert.equal(old.placed[1].selling, undefined);
    const st = normalizeHomeDecorState({ placed: [
      { id: 1, classTsid: 'bag_furniture_smallcabinet', x: 200, y: 620, contents: [{ classTsid: 'apple', count: 7 }] },
      { id: 2, classTsid: 'bag_furniture_sdb', x: 600, y: 500, display: { classTsid: 'apple', count: 4 }, selling: true, price: 12 },
      { id: 3, classTsid: 'bag_furniture_sdb', x: 700, y: 500, selling: true, price: 99999999 },
      { id: 4, classTsid: 'furniture_chair', x: 300, y: 620, contents: [{ classTsid: 'apple', count: 7 }] },
    ] });
    const again = normalizeHomeDecorState(JSON.parse(JSON.stringify(st)));
    assert.deepEqual(again, st, 'a round trip changes nothing');
    assert.equal(st.placed[0].contents.length, 16);
    assert.deepEqual(st.placed[0].contents[0], { classTsid: 'apple', count: 7 });
    assert.equal(st.placed[1].selling, true);
    assert.equal(st.placed[1].price, 12);
    assert.equal(st.placed[2].selling, undefined, 'an empty box is not selling');
    assert.equal(st.placed[2].price, undefined, 'a price over 7 digits is dropped');
    assert.equal(st.placed[3].contents, undefined, 'only cabinets hold slots');
  });

  it('canPickup: empty the cabinet, empty the box, collect its currants first', () => {
    const st = room([
      { id: 1, classTsid: 'bag_furniture_cabinet', slot: 'floor', x: 300, y: 620, z: 1, on: null, contents: normalizeContents('bag_furniture_cabinet', [{ classTsid: 'apple', count: 1 }]) },
      { id: 2, classTsid: 'bag_furniture_sdb', slot: 'wall', x: 600, y: 500, z: 2, on: null, display: { classTsid: 'apple', count: 1 } },
    ]);
    assert.equal(pickUpFurniture(st, 1).msg, 'You must empty the cabinet first.');
    assert.equal(pickUpFurniture(st, 2).msg, 'You must empty the SDB first.');
    assert.equal(storagePickupLock({ classTsid: 'bag_furniture_sdb' }, { income: 5 }), 'The currants must be collected from this SDB first.');
    assert.equal(storageHasContents(st.placed[0]), true);
    st.placed[0].contents = normalizeContents('bag_furniture_cabinet', []);
    delete st.placed[1].display;
    assert.equal(pickUpFurniture(st, 1).ok, true);
    assert.equal(pickUpFurniture(st, 2).ok, true);
  });

  it('a ledger correction takes from a cabinet too, and a cabinet taken away spills into the pack', () => {
    const d = { storage: {}, placed: [
      { id: 1, classTsid: 'bag_furniture_wallcabinet', contents: [{ classTsid: 'apple', count: 5 }, { classTsid: 'plum', count: 2 }, null] },
    ] };
    const spill = {};
    assert.deepEqual(takeFromHouse([d], { apple: 3 }, spill), { apple: 3 });
    assert.deepEqual(d.placed[0].contents[0], { classTsid: 'apple', count: 2 });
    assert.deepEqual(takeFromHouse([d], { bag_furniture_wallcabinet: 1 }, spill), { bag_furniture_wallcabinet: 1 });
    assert.deepEqual(spill, { apple: 2, plum: 2 });
    assert.equal(d.placed.length, 0);
  });
});

describe('the Storage Display Box sells what is in it (bag_furniture_sdb.js)', () => {
  const box = () => ({ id: 4, classTsid: 'bag_furniture_sdb', display: { classTsid: 'apple', count: 10 } });

  it('prices in currants per unit, 7 digits at most; 0 stops; only with something in it, never while it is for sale', () => {
    assert.equal(parseSdbPrice('12'), 12);
    assert.equal(parseSdbPrice('12345678'), 1234567, 'value.substr(0,7)');
    assert.equal(parseSdbPrice('1 2c'), 12);
    assert.equal(parseSdbPrice(''), null);
    const b = box();
    assert.equal(sdbSelling(b), false);
    assert.deepEqual(setSdbPrice(b, 12), { ok: true, selling: true, price: 12 });
    assert.equal(sdbSelling(b), true);
    assert.equal(setSdbPrice(b, 5, { forSale: true }).msg, "You can't add items while it's for sale.");
    assert.equal(setSdbPrice(b, 0).selling, false);
    assert.equal(b.price, 12, 'the price stays for next time');
    assert.equal(setSdbPrice({ classTsid: 'bag_furniture_sdb' }, 5).ok, false);
    const src = read('bag_furniture_sdb.js');
    if (src) {
      assert.match(src, /input_max_chars: 7,/);
      assert.match(src, /'<p class="rename_bubble_sdb_pricer_title">Price per '\+proto\.name_single\+'<\/p>'/);
      assert.match(src, /submit_label: "Set price",/);
      assert.match(src, /return \{state:'disabled', reason:'Items not for sale!'\};/);
    }
  });

  it('sells the count asked for, cut to what is there, at the price shown, if the purse holds it (sellItem)', () => {
    const b = box();
    setSdbPrice(b, 12);
    const item = sdbStoreItem(b);
    assert.deepEqual(item, { classTsid: 'apple', cost: 12, count: 10 });
    assert.deepEqual(sdbQuote(item, { count: 50, price: 12, currants: 1000 }), { ok: true, n: 10, total: 120 });
    assert.equal(sdbQuote(item, { count: 0, price: 12, currants: 1000 }).msg, "You can't buy a negative/zero amount of things!");
    assert.equal(sdbQuote(item, { count: 1, price: 11, currants: 1000 }).msg, 'Oops, the price appears to have changed underneath you. Please try your purchase again.');
    assert.equal(sdbQuote(item, { count: 9, price: 12, currants: 100 }).msg, "Sorry, you can't afford that.");
    assert.equal(sdbQuote(null, { count: 1 }).msg, 'Oops, that store is no longer selling.');
    assert.equal(sdbBuyMax(item, 100), 8);
    assert.equal(sdbBuyMax(sdbStoreItem(b, 3), 1000), 3, 'online the stock is the site\'s');
  });

  it('a box that empties stops selling (checkEmpty)', () => {
    const b = box();
    setSdbPrice(b, 12);
    b.display.count = 0;
    assert.equal(sdbCheckEmpty(b), true);
    assert.equal(b.selling, undefined);
    assert.equal(b.display, undefined);
  });

  it('shows the owner pricing, removing, depositing and collecting; a visitor purchase only', () => {
    const b = box();
    const ids = (list) => list.map((v) => `${v.id}${v.enabled ? '' : '!'}`);
    assert.deepEqual(ids(sdbVerbs(b, { owner: true })), ['sdb_set_price', 'sdb_remove', 'sdb_deposit', 'sdb_collect!']);
    setSdbPrice(b, 12);
    assert.deepEqual(ids(sdbVerbs(b, { owner: true, income: 24, online: true })), ['sdb_stop', 'sdb_edit_price', 'sdb_remove', 'sdb_deposit', 'sdb_collect']);
    assert.equal(sdbVerbs(b, { owner: true, income: 24 }).at(-1).tooltip, 'Receive the money collected: 24 currants');
    assert.equal(sdbVerbs(b, { owner: true }).at(-1).reason, "There's nothing to collect.");
    assert.deepEqual(ids(sdbVerbs(b, { owner: true, forSale: true })), ['sdb_remove', 'sdb_deposit!']);
    assert.deepEqual(ids(sdbVerbs(b, {})), ['sdb_purchase']);
    assert.equal(sdbVerbs({ classTsid: 'bag_furniture_sdb' }, {})[0].reason, 'Items not for sale!');
    assert.equal(sdbVerbs({ classTsid: 'bag_furniture_sdb' }, { owner: true, fits: false }).find((v) => v.id === 'sdb_deposit').reason, "You don't have anything that can go in here");
  });
});

describe('what others did to the house comes out of that very box or cabinet (applyOwnerOp)', () => {
  it('a purchase leaves the box; a key-holder\'s take and put move the cabinet\'s stacks; the rest is the pack\'s', () => {
    const d = { placed: [
      { id: 4, classTsid: 'bag_furniture_sdb', display: { classTsid: 'apple', count: 3 }, selling: true, price: 2 },
      { id: 5, classTsid: 'bag_furniture_wallcabinet', contents: normalizeContents('bag_furniture_wallcabinet', [{ classTsid: 'plum', count: 4 }]) },
    ] };
    assert.deepEqual(applyOwnerOp(d, { kind: 'buy', uid: 4, classTsid: 'apple', n: 2 }), { take: 0, give: 0 });
    assert.equal(d.placed[0].display.count, 1);
    assert.deepEqual(applyOwnerOp(d, { kind: 'buy', uid: 4, classTsid: 'apple', n: 3 }), { take: 2, give: 0 }, 'what the box no longer had comes out of the pack');
    assert.equal(d.placed[0].display, undefined);
    assert.equal(d.placed[0].selling, undefined);
    assert.deepEqual(applyOwnerOp(d, { kind: 'take', uid: 5, classTsid: 'plum', n: 3, slot: 0 }), { take: 0, give: 0 });
    assert.deepEqual(d.placed[1].contents[0], { classTsid: 'plum', count: 1 });
    assert.deepEqual(applyOwnerOp(d, { kind: 'put', uid: 5, classTsid: 'cherry', n: 4, slot: 0 }, { max: () => 250 }), { take: 0, give: 0 }, 'a taken slot: the next free one');
    assert.deepEqual(d.placed[1].contents[1], { classTsid: 'cherry', count: 4 });
    assert.deepEqual(applyOwnerOp(d, { kind: 'put', uid: 99, classTsid: 'cherry', n: 4 }), { take: 0, give: 4 }, 'a cabinet that is gone: the pack');
    const view = cabinetView('bag_furniture_wallcabinet', [{ classTsid: 'plum', count: 4 }], [{ kind: 'take', classTsid: 'plum', n: 1, slot: 0 }, { kind: 'put', classTsid: 'grain', n: 2, slot: 3 }]);
    assert.deepEqual([view[0], view[3]], [{ classTsid: 'plum', count: 3 }, { classTsid: 'grain', count: 2 }]);
  });

  it('the site applies ops to slots the same way (LedgerBoxes::slots, applyOne)', { skip: skipPhp }, () => {
    const got = php(`$s = LedgerBoxes::slots('bag_furniture_largecabinet', [['classTsid' => 'apple', 'count' => 5]]);
      $a = LedgerBoxes::applyOne($s, 'put', 'apple', 150, null, 100);
      $b = LedgerBoxes::applyOne($s, 'put', 'plum', 3, 1, 100);
      $c = LedgerBoxes::applyOne($s, 'take', 'apple', 60, null, 100);
      $d = LedgerBoxes::applyOne($s, 'take', 'plum', 9, null, 100);
      echo json_encode(['s' => $s, 'left' => [$a, $b, $c, $d], 'room' => LedgerBoxes::room($s, 'apple', 100), 'side' => [LedgerBoxes::isOwnerSide('sdb-0123456789abcdef-o'), LedgerBoxes::isOwnerSide('cab-0123456789abcdef-o'), LedgerBoxes::isOwnerSide('sdb-0123456789abcdef')]]);`);
    const s = normalizeContents('bag_furniture_largecabinet', [{ classTsid: 'apple', count: 5 }]);
    const left = [
      150 - cabinetPut(s, 'apple', 150, { max: 100 }),
      3 - (cabinetPut(s, 'plum', 3, { slot: 1, max: 100 }) || cabinetPut(s, 'plum', 3, { max: 100 })),
      60 - cabinetTake(s, 'apple', 60).taken,
      9 - cabinetTake(s, 'plum', 9).taken,
    ];
    assert.deepEqual(got.s, s);
    assert.deepEqual(got.left, left);
    assert.equal(got.room, cabinetRoom(s, 'apple', 100));
    assert.deepEqual(got.side, [true, true, false]);
  });

  it('the ledger counts what a cabinet holds as the save\'s own, and a correction spills a cabinet into the pack (LedgerMath)', { skip: skipPhp }, () => {
    const save = { inventory: { apple: 1 }, player: { currants: 0 }, systems: { features: { homes: { decor: { storage: {}, placed: [
      { id: 5, classTsid: 'bag_furniture_wallcabinet', contents: [{ classTsid: 'apple', count: 4 }, null, { classTsid: 'plum', count: 2 }] },
      { id: 4, classTsid: 'bag_furniture_sdb', display: { classTsid: 'cherry', count: 3 } },
    ] } } } } };
    const got = php(`$e = ['playerState' => ${JSON.stringify(JSON.stringify(save))}];
      $h = LedgerMath::holdings($e, Economy::shared());
      $r = LedgerMath::remove($e, ['items' => ['apple' => 3, 'bag_furniture_wallcabinet' => 1], 'currants' => 0]);
      $s = json_decode($r['playerState'], true);
      echo json_encode(['h' => $h['items'], 'inv' => $s['inventory'], 'placed' => array_column($s['systems']['features']['homes']['decor']['placed'], 'classTsid')]);`);
    assert.deepEqual(got.h, { apple: 5, bag_furniture_sdb: 1, bag_furniture_wallcabinet: 1, cherry: 3, plum: 2 });
    // apple: 1 from the pack, 2 from the cabinet; the cabinet taken away leaves its 2 apples and 2 plums in the pack.
    assert.deepEqual(got.inv, { apple: 2, plum: 2 });
    assert.deepEqual(got.placed, ['bag_furniture_sdb']);
  });
});

describe('#108: a bag goes into a cabinet whole and comes back whole (CabinetDialog.as onPackDrag)', () => {
  const held = [{ classTsid: 'grain', count: 55 }, { classTsid: 'cherry', count: 32 }, { classTsid: 'metalmaker', count: 1, points: [200] }];

  it('the original let bags in: the client\'s drag has no bag check, the cabinet\'s canContain none either', { skip: !read('bag_furniture_cabinet.js') && 'no glitch-GameServerJS' }, () => {
    const cab = read('bag_furniture_cabinet.js');
    const canContain = cab.slice(cab.indexOf('function canContain('), cab.indexOf('function canPickup('));
    assert.doesNotMatch(canContain, /is_bag|countContents/);
    const client = join(homedir(), 'Documents/glitch-audit/glitch-client/com/tinyspeck/engine/port/CabinetDialog.as');
    if (existsSync(client)) assert.match(readFileSync(client, 'utf8'), /we don't want no stinking bags - YES WE DO!\n\s*\/\/if \(dragVO\.dragged_itemstack\.slots\) return;/);
  });

  it('a slot keeps a stored bag\'s contents and name through a save, and gives them back on the way out', () => {
    const slots = normalizeContents('bag_furniture_smallcabinet', []);
    assert.equal(cabinetPut(slots, 'bag_bigger', 1, { contents: held, name: 'Lunchbox' }), 1);
    const saved = normalizeContents('bag_furniture_smallcabinet', JSON.parse(JSON.stringify(slots)), () => 1);
    assert.deepEqual(saved[0], { classTsid: 'bag_bigger', count: 1, contents: held, name: 'Lunchbox' });
    assert.equal(slotHoldsBag(saved[0]), true);
    assert.deepEqual(cabinetCounts(saved), { bag_bigger: 1, grain: 55, cherry: 32, metalmaker: 1 });
    // Not by class (a key-holder's op, the last stacks first): only by its own slot.
    assert.equal(cabinetTake(saved, 'bag_bigger', 1).taken, 0);
    const out = cabinetTake(saved, 'bag_bigger', 1, { slot: 0 });
    assert.deepEqual(out, { taken: 1, points: [], contents: held, name: 'Lunchbox' });
    assert.equal(saved[0], null);
  });

  it('a stored bag never merges with another, and goes alone into an empty slot', () => {
    const slots = normalizeContents('bag_furniture_largecabinet', []);
    cabinetPut(slots, 'bag_bigger', 1, { contents: held });
    cabinetPut(slots, 'bag_bigger', 1, { slot: 1 });
    assert.equal(cabinetPut(slots, 'bag_bigger', 1, { slot: 0, contents: held }), 0, 'not onto a full slot');
    assert.equal(cabinetMove(slots, 1, 0, 1), true, 'a swap, never a merge');
    assert.deepEqual(slots[1].contents, held);
    assert.equal(slots[0].contents, undefined);
  });

  it('the feature takes the chosen bag out with what it holds and gives it back the same (bags-feature packTakeBag, packGiveBag)', () => {
    const feature = readFileSync(join(import.meta.dirname, '../public/js/features/home-storage-feature.js'), 'utf8');
    assert.match(feature, /put: \(\{ cls, count, copy, slot, bag \}\) => cabinetPutFromPack\(engine, cls, count, \{ slot, copy, bag \}\)/);
    assert.match(feature, /const res = engine\.query\?\.\('packTakeBag', bag\.key, engine\);/);
    assert.match(feature, /const res = engine\.query\('packGiveBag', cls, contents, engine, out\.name \|\| ''\);/);
    // An empty bag: the one chosen leaves, not another of its class.
    assert.match(feature, /if \(held\) engine\.query\?\.\('packBagLeaves', held\.key\);/);
    // A key-holder moves only empty bags.
    assert.match(feature, /if \(slotHoldsBag\(s\)\) \{\n\s+win\.handle\.note\(T\.ownerBags, true\);/);
    // A bag that can't come back after all stays in its slot as it was (a copy from before the take).
    assert.match(feature, /const keep = JSON\.parse\(JSON\.stringify\(s\)\);\n\s+const out = cabinetTake\(row\.contents, cls, 1, \{ slot \}\);/);
    assert.match(feature, /row\.contents\[slot\] = keep;/);
  });

  it('a correction takes from inside a stored bag first and spills the rest when the bag goes (js/ledger-house.js)', () => {
    const d = room([{ id: 9, classTsid: 'bag_furniture_wallcabinet', contents: [{ classTsid: 'bag_bigger', count: 1, contents: [{ classTsid: 'grain', count: 5 }, { classTsid: 'plum', count: 2 }] }] }]);
    const spill = {};
    assert.deepEqual(takeFromHouse([d], { grain: 3 }, spill), { grain: 3 });
    assert.deepEqual(d.placed[0].contents[0].contents, [{ classTsid: 'grain', count: 2 }, { classTsid: 'plum', count: 2 }]);
    assert.deepEqual(takeFromHouse([d], { bag_bigger: 1 }, spill), { bag_bigger: 1 });
    assert.deepEqual(spill, { grain: 2, plum: 2 });
  });

  it('the site counts a stored bag\'s contents, clamps them the same way and keeps them through a key-holder\'s op', { skip: skipPhp }, () => {
    const save = { inventory: { apple: 1 }, player: { currants: 0 }, systems: { features: { homes: { decor: { storage: {}, placed: [
      { id: 5, classTsid: 'bag_furniture_wallcabinet', contents: [{ classTsid: 'bag_bigger', count: 1, name: 'Lunchbox', contents: [{ classTsid: 'grain', count: 5 }, { classTsid: 'plum', count: 2 }] }, null, { classTsid: 'apple', count: 3 }] },
    ] } } } } };
    const got = php(`$e = ['playerState' => ${JSON.stringify(JSON.stringify(save))}];
      $h = LedgerMath::holdings($e, Economy::shared());
      $a = json_decode(LedgerMath::remove($e, ['items' => ['grain' => 3], 'currants' => 0])['playerState'], true);
      $b = json_decode(LedgerMath::remove($e, ['items' => ['bag_bigger' => 1], 'currants' => 0])['playerState'], true);
      $row = json_decode(json_encode($a['systems']['features']['homes']['decor']['placed'][0]), false);
      echo json_encode(['h' => $h['items'], 'a' => $a['systems']['features']['homes']['decor']['placed'][0]['contents'][0], 'b' => [$b['inventory'], $b['systems']['features']['homes']['decor']['placed'][0]['contents'][0]],
        'bag' => LedgerBoxes::holdsBag($row, 'bag_bigger', null), 'slot2' => LedgerBoxes::holdsBag($row, 'bag_bigger', 2), 'apple' => LedgerBoxes::holdsBag($row, 'apple', null)]);`);
    assert.deepEqual(got.h, { apple: 4, bag_furniture_wallcabinet: 1, bag_bigger: 1, grain: 5, plum: 2 });
    assert.deepEqual(got.a, { classTsid: 'bag_bigger', count: 1, name: 'Lunchbox', contents: [{ classTsid: 'grain', count: 2 }, { classTsid: 'plum', count: 2 }] });
    assert.deepEqual(got.b, [{ apple: 1, grain: 5, plum: 2 }, null], 'the bag taken away leaves what it held in the pack');
    assert.deepEqual([got.bag, got.slot2, got.apple], [true, false, false], 'a key-holder cannot take it (LedgerBoxes::cabinetMove)');
    const boxes = readFileSync(join(SITE_DIR, 'src/LedgerBoxes.php'), 'utf8');
    assert.match(boxes, /if \(\$kind === 'take' && self::holdsBag\(\$row, \$class, \$slot\)\) \{\n\s+return \$refuse\('bag', self::TEXT_BAGS\);/);
    assert.match(boxes, /\$out->contents = json_decode\(\(string\) json_encode\(\$was\['contents'\]\), false\);/);
  });
});
