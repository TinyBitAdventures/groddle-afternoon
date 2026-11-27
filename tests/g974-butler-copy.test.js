/**
 * G974 (R18 leftover): a Butler parcel and the Butler's gift for visitors carry the copy itself.
 * Glitch's Butler moved the itemstack (items/bag_butler.js leave_package 991-1144, giveGift
 * 2482-2540), its instance props with it, so a named Cubimal left with a friend's Butler arrived
 * named and a worn pick worn. The remake sent only the class and count: the right copy left the
 * pack, but its name and wear were lost on the way. Now the visitor's game sends "r" and "t"
 * (copy-picks leavingWire), the realtime server checks them (homes_help.go copyOf, its own test),
 * the site keeps them with the parcel and the stock (src/ButlerParcels.php, src/ButlerGifts.php)
 * and the receiving game puts them on the copy that came (receiveWire). Older parcels without the
 * fields still deliver as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { giftOffer, giveGiftTo, nextHandover, normalizeButlerState, normalizeParcelBox, setGift, stackCopy } from '../public/js/butler.js?v=5d1199a7';
import { applyButlerStock, mergeParcels, normalizeButlerStock, normalizeGiftAnswer, normalizeParcels } from '../public/js/neighbours-mp.js?v=5323ddea';
import { leavingWire, receiveWire } from '../public/js/copy-picks.js?v=b368fd49';
import { bindToolInventory, copyTags, createToolConditionState, setCopyTag, setToolRemaining, toolCopies } from '../public/js/tools.js?v=4156bba8';
import { addItem, createInventory } from '../public/js/inventory.js?v=3be7988a';
import { createMinnAccount } from '../public/js/minn-account.js?v=7e3d7279';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const hasPhp = HAS_PHP;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'CopyTags', 'LedgerGift', 'ButlerParcels', 'ButlerGifts'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\ButlerParcels; use Groddle\\Minn\\ButlerGifts; ${body}`;
  return JSON.parse(execFileSync(PHP, ['-r', code]).toString());
}

const CUBIMAL = 'npc_cubimal_butler';
const P1 = 'butler-00000000000000c1';

function pack(items = {}) {
  const inv = createInventory({});
  const toolState = bindToolInventory(createToolConditionState(), inv);
  for (const [cls, n] of Object.entries(items)) addItem(inv, cls, n);
  return { inv, toolState };
}

describe('G974: a Butler parcel carries the copy (bag_butler.js leave_package)', () => {
  it('a named Cubimal left with a friend\'s Butler arrives named, a worn pick worn', { skip: skipSite }, () => {
    // The visitor: two Butler Cubimals, the second named; the named one is chosen.
    const bo = pack({ [CUBIMAL]: 2, pick: 1 });
    setCopyTag(bo.toolState, CUBIMAL, 1, 'Rufus');
    setToolRemaining(bo.toolState, 'pick', 40);
    const named = leavingWire(bo.toolState, CUBIMAL, { copy: 1, copies: [1], r: toolCopies(bo.toolState, CUBIMAL)[1].remaining, t: 'Rufus' }, 1);
    assert.equal(named.t, 'Rufus');
    const worn = leavingWire(bo.toolState, 'pick', null, 1);
    assert.deepEqual(worn, { r: 40 });
    assert.deepEqual(leavingWire(bo.toolState, 'cherry', null, 3), {}, 'a class without copies sends what it always did');

    // The site keeps them with the parcel and hands them back on the item (what the realtime server sent as "gave").
    const out = php(`
      $named = ButlerParcels::copyOf(['c' => '${CUBIMAL}', 'n' => 1, 'r' => ${named.r ?? 'null'}, 't' => 'Rufus']);
      $two = ButlerParcels::copyOf(['c' => '${CUBIMAL}', 'n' => 2, 't' => 'Rufus']);
      $worn = ButlerParcels::copyOf(['c' => 'pick', 'n' => 1, 'r' => 40]);
      $bad = ButlerParcels::copyOf(['c' => 'pick', 'n' => 1, 'r' => -1, 't' => 'x']);
      $items = [
        ButlerParcels::itemOf('${CUBIMAL}', 1, '', $named['r'], $named['tag']),
        ButlerParcels::itemOf('pick', 1, '', $worn['r'], $worn['tag']),
        ButlerParcels::itemOf('cherry', 3, ''),
      ];
      $box = ButlerParcels::boxOf([['c' => '${CUBIMAL}', 'n' => 1, 't' => 'Rufus'], ['c' => 'cherry', 'n' => 2, 't' => 'x']], ['items' => ['bag_gift_box' => 1, 'cherry' => 2, '${CUBIMAL}' => 1], 'currants' => 0]);
      echo json_encode([$named['tag'], $two, $worn, $bad, $items, $box]);`);
    const [tag, two, wornCopy, bad, items, box] = out;
    assert.equal(tag, '"Rufus"');
    assert.deepEqual(two, { r: null, tag: null }, 'words ride on one copy only');
    assert.deepEqual(wornCopy, { r: 40, tag: null });
    assert.deepEqual(bad, { r: null, tag: null }, 'wear out of range and words a pick does not keep go');
    assert.equal(items[0].t, 'Rufus');
    assert.deepEqual(items[1], { c: 'pick', n: 1, r: 40 });
    assert.deepEqual(items[2], { c: 'cherry', n: 3 }, 'a parcel without them goes as before');
    assert.deepEqual(box, [{ c: CUBIMAL, n: 1, t: 'Rufus' }, { c: 'cherry', n: 2 }]);

    // The owner's game: the list, its Butler, the handover, the pack.
    const parcels = normalizeParcels({ parcels: [
      { id: P1, from: { id: 9, name: 'Bo' }, item: items[0], text: '', at: 1000 },
      { id: 'butler-00000000000000c2', from: { id: 9, name: 'Bo' }, item: items[1], text: '', at: 1001 },
      { id: 'butler-00000000000000c3', from: { id: 9, name: 'Bo' }, item: items[2], text: '', at: 1002 },
    ] });
    const st = normalizeButlerState({ owned: true });
    assert.equal(mergeParcels(st, parcels), 3);
    const saved = normalizeButlerState(JSON.parse(JSON.stringify(st)));
    const ada = pack({ [CUBIMAL]: 1 });
    for (let i = 0; i < 3; i += 1) {
      const g = nextHandover(saved).give;
      addItem(ada.inv, g.classTsid, g.count);
      receiveWire(ada.toolState, g.classTsid, g, g.count);
    }
    assert.deepEqual(copyTags(ada.toolState, CUBIMAL), [null, 'Rufus'], 'the named Cubimal arrives named, beside the owner\'s own');
    assert.equal(toolCopies(ada.toolState, 'pick')[0].remaining, 40, 'the worn pick arrives worn');
  });

  it('keeps the copy inside a wrapped box and on parcels from the site, and none on old ones', () => {
    assert.deepEqual(normalizeParcelBox([{ c: CUBIMAL, n: 1, t: 'Rufus' }, { c: 'pick', n: 1, r: 40 }]), [{ c: CUBIMAL, n: 1, t: 'Rufus' }, { c: 'pick', n: 1, r: 40 }]);
    assert.deepEqual(stackCopy({ r: 5, t: 'Rufus' }, 2), { r: 5 }, 'words on one copy only');
    const [p] = normalizeParcels({ parcels: [{ id: P1, from: { id: 9 }, item: { c: 'apple', n: 2 }, at: 1 }] });
    assert.deepEqual(p.item, { c: 'apple', n: 2 });
    const st = normalizeButlerState({ owned: true, packages: [{ id: P1, from: 'p9', fromName: 'Bo', classTsid: 'apple', count: 2, time: 1 }] });
    assert.deepEqual(nextHandover(st).give, { classTsid: 'apple', count: 2 });
  });

  it('sends the copy from the visitor\'s package and takes it in on the owner\'s handover', () => {
    const feature = read('public/js/features/neighbours-mp-feature.js');
    assert.match(feature, /\{ c, n, \.\.\.leavingWire\(engine\.toolState, c, chosen, n\) \}/);
    assert.match(feature, /receiveWire\(engine\.toolState, c, msg\.item, n\)/, 'a visitor\'s gift from the Butler');
    const butler = read('public/js/features/butler-feature.js');
    assert.match(butler, /receiveWire\(engine\.toolState, g\.classTsid, g, g\.count\)/, 'the owner\'s handover');
    assert.match(butler, /receiveWire\(engine\.toolState, a\.got\.c, a\.got, a\.got\.n\)/, 'an old gift sent back by the site');
  });
});

describe('G974: the Butler\'s gift for visitors carries the copy (bag_butler.js giveGift)', () => {
  it('merges only alike copies, hands each visitor the copy itself and sends an old one back as it was', () => {
    const st = normalizeButlerState({ owned: true });
    const names = (c, n) => `${n} ${c}`;
    setGift(st, { classTsid: 'pick', count: 1, r: 40 });
    assert.notEqual(giftOffer(st, { classTsid: 'pick', count: 1, names, r: 90 }).returns, null, 'a pick of other wear takes its place');
    const out = setGift(st, { classTsid: CUBIMAL, count: 1, t: 'Rufus' });
    assert.deepEqual(out.returned, { classTsid: 'pick', count: 1, r: 40 });
    assert.deepEqual(normalizeButlerState(JSON.parse(JSON.stringify(st))).gift, { classTsid: CUBIMAL, count: 1, t: 'Rufus' });
    assert.notEqual(setGift(st, { classTsid: CUBIMAL, count: 1 }).returned, null, 'a named Cubimal never merges');
    setGift(st, { classTsid: 'apple', count: 2 });
    assert.equal(setGift(st, { classTsid: 'apple', count: 1 }).returned, null, 'alike copies still merge');
    setGift(st, { classTsid: CUBIMAL, count: 1, t: 'Rufus' });
    assert.deepEqual(giveGiftTo(st, 'p9'), { classTsid: CUBIMAL, count: 1, t: 'Rufus' });
  });

  it('keeps the copy with the site\'s stock', { skip: skipSite }, () => {
    const out = php(`
      $named = ['c' => '${CUBIMAL}', 'n' => 1, 't' => 'Rufus'];
      echo json_encode([
        ButlerGifts::handOut($named, null),
        ButlerGifts::handOut(['c' => 'pick', 'n' => 2, 'r' => 40], null),
        ButlerGifts::leave(['c' => 'pick', 'n' => 1, 'r' => 40], 'pick', 1, true, 90),
        ButlerGifts::leave(['c' => 'apple', 'n' => 1], 'apple', 1, true),
        ButlerGifts::leave(null, '${CUBIMAL}', 1, true, null, 'Rufus'),
        ButlerGifts::stack(['class_tsid' => '${CUBIMAL}', 'count' => 1, 'r' => null, 'tag' => '"Rufus"']),
        ButlerGifts::stack(['class_tsid' => 'apple', 'count' => 3]),
      ]);`);
    assert.deepEqual(out, [
      { give: CUBIMAL, item: { c: CUBIMAL, n: 1, t: 'Rufus' }, after: null, clear: true },
      { give: 'pick', item: { c: 'pick', n: 1, r: 40 }, after: { c: 'pick', n: 1, r: 40 }, clear: false },
      { after: { c: 'pick', n: 1, r: 90 }, back: { c: 'pick', n: 1, r: 40 }, clear: true },
      { after: { c: 'apple', n: 2 }, back: null, clear: false },
      { after: { c: CUBIMAL, n: 1, t: 'Rufus' }, back: null, clear: true },
      { c: CUBIMAL, n: 1, t: 'Rufus' },
      { c: 'apple', n: 3 },
    ]);
    const minn = JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8'));
    for (const t of ['groddle_butler_parcels', 'groddle_butler_gift']) {
      assert.ok(minn.tables[t].includes('r int(10) unsigned NULL DEFAULT NULL') && minn.tables[t].includes('tag text NULL'), t);
    }
  });

  it('reads the copy from the site\'s stock and answers, gives it to a visitor, and sends it on a give', async () => {
    const stock = normalizeButlerStock({ gift: { c: CUBIMAL, n: 1, t: 'Rufus' }, visits: [] });
    assert.deepEqual(stock.gift, { c: CUBIMAL, n: 1, t: 'Rufus' });
    const st = normalizeButlerState({ owned: true });
    applyButlerStock(st, stock);
    assert.deepEqual(st.gift, { classTsid: CUBIMAL, count: 1, t: 'Rufus' });
    const a = normalizeGiftAnswer({ status: 'given', op: 'bgift-0123456789abcdef', gave: { c: CUBIMAL, n: 1, t: 'Rufus' }, got: { c: 'pick', n: 1, r: 40 }, gift: { c: CUBIMAL, n: 1, t: 'Rufus' } });
    assert.deepEqual(a.got, { c: 'pick', n: 1, r: 40 });
    // The visitor the Butler gave it to.
    const cy = pack({});
    addItem(cy.inv, CUBIMAL, 1);
    assert.equal(receiveWire(cy.toolState, CUBIMAL, { c: CUBIMAL, n: 1, t: 'Rufus' }, 1), true);
    assert.deepEqual(copyTags(cy.toolState, CUBIMAL), ['Rufus']);
    const calls = [];
    const account = createMinnAccount({ baseUri: 'https://groddle.localhost/', nonce: 'abcdef0123', fetch: async (url, init = {}) => {
      calls.push(init.body || '');
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({}) };
    } });
    await account.butlerGive({ op: 'bgift-0123456789abcdef', c: CUBIMAL, n: 1, keep: false, t: 'Rufus' });
    await account.butlerGive({ op: 'bgift-0123456789abcdef', c: 'apple', n: 3, keep: true });
    assert.deepEqual(calls.map((b) => JSON.parse(b)), [
      { op: 'bgift-0123456789abcdef', c: CUBIMAL, n: 1, keep: false, t: 'Rufus' },
      { op: 'bgift-0123456789abcdef', c: 'apple', n: 3, keep: true },
    ]);
  });
});
