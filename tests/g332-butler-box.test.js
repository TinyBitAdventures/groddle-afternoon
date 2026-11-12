/**
 * G332: a friend's Butler takes a wrapped Gift Box (items/bag_butler.js:1013
 * and 1059: leave_package lets bag_gift_box_wrapped through though it is
 * no_trade). The box goes whole: the visitor's game lists each box
 * (gifts-feature giftBoxList), the realtime server checks it
 * (groddle-afternoon-server homes_help.go butlerBox; its own test), the site
 * moves the box and what is inside out of the visitor's ledger and keeps the
 * stacks with the parcel (src/ButlerParcels.php boxOf), and the owner's
 * Butler hands over one wrapped box with them inside (giftBoxIn), credited
 * as the box and the stacks; a load that missed either side applies it as a
 * give's box (ButlerParcels::catchUp -> LedgerGift::apply).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mergeParcels, normalizeParcels } from '../public/js/neighbours-mp.js?v=95f6997a';
import { nextHandover, normalizeButlerState, normalizeParcelBox } from '../public/js/butler.js?v=8232e2c7';
import { giftsFeature } from '../public/js/features/gifts-feature.js?v=fa465818';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'WordFilter', 'LedgerGift', 'ButlerParcels'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\ButlerParcels; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const P1 = 'butler-00000000000000b1';
const BOX = [{ c: 'cherry', n: 3 }, { c: 'pick', n: 1, r: 40 }];

describe('G332: a wrapped Gift Box left with a Butler (bag_butler.js:1013)', () => {
  it('keeps what is inside through the site\'s list, the Butler and its handover', () => {
    assert.deepEqual(normalizeParcelBox(BOX), BOX);
    assert.equal(normalizeParcelBox([]), null);
    assert.equal(normalizeParcelBox([{ c: 'a', n: 1 }, { c: 'a', n: 2 }]), null);
    assert.equal(normalizeParcelBox([{ c: 'a', n: 1 }, { c: 'b', n: 1 }, { c: 'c', n: 1 }, { c: 'd', n: 1 }]), null);
    const parcels = normalizeParcels({ parcels: [
      { id: P1, from: { id: 9, name: 'Bo' }, item: { c: 'bag_gift_box_wrapped', n: 1, box: BOX }, text: '', at: 1000 },
      { id: 'butler-00000000000000b2', from: { id: 9, name: 'Bo' }, item: { c: 'bag_gift_box_wrapped', n: 1, box: [] }, text: '', at: 1000 },
    ] });
    assert.equal(parcels.length, 1, 'a box with nothing in it is not one');
    assert.deepEqual(parcels[0].item, { c: 'bag_gift_box_wrapped', n: 1, box: BOX });
    const st = normalizeButlerState({ owned: true });
    assert.equal(mergeParcels(st, parcels), 1);
    const again = normalizeButlerState(JSON.parse(JSON.stringify(st)));
    assert.deepEqual(again.packages[0].box, BOX, 'the save keeps it');
    const out = nextHandover(again, { now: 5000, itemName: (c, n) => `${n} ${c}` });
    assert.equal(out.id, P1);
    assert.deepEqual(out.give, { classTsid: 'bag_gift_box_wrapped', count: 1, box: BOX, fromId: 'p9' });
    // Solo packages carry no box.
    const solo = normalizeButlerState({ packages: [{ id: 'b1', from: 'npc', classTsid: 'apple', count: 2 }] });
    assert.equal('box' in solo.packages[0], false);
  });

  it('moves a box between the gifts slices in multiplayer, and does nothing in solo', () => {
    const inv = { bag_gift_box_wrapped: 1 };
    const engine = { mode: 'multiplayer', inv, refreshPack() {} };
    giftsFeature.restore({ boxes: [{ id: 'w2', items: [{ c: 'apple', n: 2 }], from: { id: 3, name: 'Cy' }, at: 1 }], next: 3 }, engine);
    assert.deepEqual(giftsFeature.giftBoxList(engine), [{ id: 'w2', items: [{ c: 'apple', n: 2 }], from: { id: 3, name: 'Cy' } }]);
    assert.equal(giftsFeature.giftBoxOut('w2', [{ c: 'apple', n: 2 }], engine), true);
    assert.equal(inv.bag_gift_box_wrapped || 0, 0);
    assert.deepEqual(giftsFeature.giftBoxList(engine), []);
    assert.equal(giftsFeature.giftBoxIn({ id: `${P1}-in`, items: BOX, from: { id: 9, name: 'Bo' }, at: 2 }, engine), true);
    assert.equal(inv.bag_gift_box_wrapped, 1);
    assert.deepEqual(giftsFeature.save().boxes.map((b) => [b.id, b.items]), [[`${P1}-in`, BOX]]);
    assert.equal(giftsFeature.giftBoxIn({ id: 'x', items: [] }, engine), false, 'nothing inside, no box');
    const solo = { mode: 'solo', inv: {} };
    giftsFeature.restore(null, solo);
    assert.equal(giftsFeature.giftBoxList(solo), null);
    assert.equal(giftsFeature.giftBoxIn({ id: 'w1', items: BOX }, solo), null);
    assert.equal(giftsFeature.giftBoxOut('w1', BOX, solo), null);
  });

  it('lists each box for a friend\'s Butler and hands one over through gifts-feature', () => {
    const nb = read('public/js/features/neighbours-mp-feature.js');
    assert.match(nb, /engine\.query\?\.\('giftBoxList', engine\)/);
    assert.match(nb, /item = box \? \{ c, n: 1, box: box\.items, ref: box\.id \}/);
    assert.match(nb, /engine\.query\?\.\('giftBoxOut', String\(msg\.item\.ref \|\| ''\), box, engine\)/);
    const bf = read('public/js/features/butler-feature.js');
    assert.match(bf, /engine\.query\?\.\('giftBoxIn', \{ id: `\$\{parcel\}-in`/);
  });

  it('checks a box at the site and applies a missed one to a stored save', { skip: skipSite }, () => {
    const out = php(`
      $gave = ['items' => ['bag_gift_box' => 1, 'cherry' => 3, 'pick' => 1], 'currants' => 0];
      $box = [['c' => 'cherry', 'n' => 3], ['c' => 'pick', 'n' => 1, 'r' => 40]];
      $ok = ButlerParcels::boxOf($box, $gave);
      $none = ButlerParcels::boxOf(null, $gave);
      $wrong = ButlerParcels::boxOf([['c' => 'cherry', 'n' => 2], ['c' => 'pick', 'n' => 1]], $gave);
      $inner = ButlerParcels::boxOf([['c' => 'bag_gift_box', 'n' => 1]], ['items' => ['bag_gift_box' => 2], 'currants' => 0]);
      $item = ButlerParcels::itemOf('bag_gift_box_wrapped', 1, json_encode($box));
      $plain = ButlerParcels::itemOf('apple', 3, '');
      $counts = ButlerParcels::countsOf($item);
      $visitor = ['playerState' => json_encode(['inventory' => ['bag_gift_box_wrapped' => 1], 'systems' => ['features' => ['gifts' => ['boxes' => [['id' => 'w2', 'items' => $box]]]]]])];
      $v = json_decode(ButlerParcels::applyBox($visitor, 'gave', '${P1}', $box, 9, 7, 1000, 'Bo')['playerState'], true);
      $owner = ['playerState' => json_encode(['inventory' => new stdClass(), 'systems' => ['features' => new stdClass()]])];
      $o = ButlerParcels::applyBox($owner, 'got', '${P1}-in', $box, 9, 7, 1000, 'Bo');
      $o2 = ButlerParcels::applyBox($o, 'got', '${P1}-in', $box, 9, 7, 1000, 'Bo');
      $os = json_decode($o2['playerState'], true);
      echo json_encode([$ok, $none, $wrong, $inner, $item, $plain, $counts,
        $v['inventory']['bag_gift_box_wrapped'], $v['systems']['features']['gifts']['boxes'],
        $os['inventory']['bag_gift_box_wrapped'], array_map(fn ($b) => [$b['id'], $b['items']], $os['systems']['features']['gifts']['boxes']),
        ButlerParcels::isParcel('${P1}'), ButlerParcels::isParcel('${P1}-in'), ButlerParcels::isParcel('gift-00000000000000b1')]);`);
    assert.deepEqual(out, [
      BOX, [], null, null,
      { c: 'bag_gift_box_wrapped', n: 1, box: BOX }, { c: 'apple', n: 3 },
      { bag_gift_box: 1, cherry: 3, pick: 1 },
      0, [],
      1, [[`${P1}-in`, BOX]],
      true, true, false,
    ]);
  });

  it('keeps the box with the parcel row and credits the box and the stacks', { skip: skipSite }, () => {
    const src = readFileSync(join(SITE_DIR, 'src/ButlerParcels.php'), 'utf8');
    assert.match(src, /\$counts = self::countsOf\(\$item\);/);
    assert.match(src, /INSERT INTO \{\$parcels\} \(id, owner_id, from_id, class_tsid, count, message, box, at_ms, created_at\)/);
    const ledger = readFileSync(join(SITE_DIR, 'src/Ledger.php'), 'utf8');
    assert.match(ledger, /ButlerParcels::isParcel\(\$p\['trade'\]\) => ButlerParcels::catchUp/);
    const minn = JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_butler_parcels.includes('box text NULL'));
  });
});
