/**
 * Register G332: giving things to another player in multiplayer (the pack's
 * Give verb, a written note with its writing, the Gift Box wrapped, given and
 * unwrapped). The pure rules are js/gifts.js; the site's ledger route and
 * its load-time apply (src/LedgerGift.php, LedgerMath::holdings) run here
 * through php -r (skipped without the site or php); the server's rules are
 * gifts_test.go. Solo is untouched: the feature answers nothing there.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOX_SLOTS,
  GIFT_BOX,
  GIFT_TEXT,
  GIFT_WRAPPED,
  boxReason,
  findBox,
  formatStack,
  giftEffects,
  giveReason,
  normalizeGift,
  normalizeGiftsSlice,
  stackMax,
  unwrapGrowl,
  unwrapPack,
  wrapBox,
} from '../public/js/gifts.js?v=g332-1';
import { giftsFeature } from '../public/js/features/gifts-feature.js?v=g449-1';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'LedgerGift'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerGift; use Groddle\\Minn\\LedgerMath; use Groddle\\Minn\\Economy; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const OP = 'gift-00000000000000a1';
const OP2 = 'gift-00000000000000a2';

describe('the pack\'s Give follows the source', () => {
  it('says a stack as formatStack does (item.js:607-611)', () => {
    assert.equal(formatStack('cherry', 1, TABLE), 'a Cherry');
    assert.equal(formatStack('cherry', 3, TABLE), '3 Cherries');
    assert.equal(formatStack('apple', 1, TABLE), 'an Apple');
    assert.equal(formatStack('cherry', 1200, TABLE), '1,200 Cherries');
    assert.equal(GIFT_TEXT.gave('Bo', '3 Cherries'), 'You gave Bo 3 Cherries.');
    assert.equal(GIFT_TEXT.got('Ada', 'a Cherry'), 'Ada gave you a Cherry.');
  });

  it('gives what the ledger carries, never soulbound or quest items (takeable.js 220-246)', () => {
    assert.equal(giveReason('cherry', TABLE), '');
    assert.equal(giveReason('greeter_twig', TABLE), "This item is locked to you and can't be given to another player.");
    assert.equal(giveReason('cherry', TABLE, ['quest-item']), "This item is needed for a quest and can't be given to another player.");
    assert.equal(giveReason('no_such_thing', TABLE), "That can't be given to another player.");
    assert.equal(giveReason(GIFT_WRAPPED, TABLE), '', 'a wrapped box goes as a box');
    assert.equal(stackMax('cherry', TABLE), TABLE.items.cherry.max);
  });

  it('counts items_given with the receiver and the site\'s level for the quests, items_received for the receiver', () => {
    const gave = normalizeGift({ op: OP, to: { id: 9, name: 'Bo' }, item: { c: 'cherry', n: 3 } }, 'gave');
    const fx = giftEffects(gave, { table: TABLE, level: 4 });
    assert.deepEqual(fx.pack, { cherry: -3 });
    assert.equal(fx.line, 'You gave Bo 3 Cherries.');
    assert.deepEqual(fx.counters, [{ counter: 'items_given:cherry', amount: 1, detail: { to: 9, count: 3, toLevel: 4 } }]);
    // No level from the site: no toLevel, so kindly_randomness does not count it.
    assert.equal('toLevel' in giftEffects(gave, { table: TABLE }).counters[0].detail, false);
    const got = normalizeGift({ op: OP, from: { id: 7, name: 'Ada' }, item: { c: 'pick', n: 1, r: 40 } }, 'got');
    const fx2 = giftEffects(got, { table: TABLE });
    assert.deepEqual(fx2.pack, { pick: 1 });
    assert.deepEqual(fx2.tool, { c: 'pick', r: 40 });
    assert.equal(fx2.line, 'Ada gave you a Pick.');
    assert.deepEqual(fx2.counters, [{ counter: 'items_received:pick', amount: 1, detail: { from: 7, count: 1 } }]);
  });

  it('reads the server\'s messages and the site\'s list the same way', () => {
    assert.equal(normalizeGift({ op: 'gift-xyz', item: { c: 'cherry', n: 1 } }), null);
    assert.equal(normalizeGift({ op: OP, item: { c: 'Bad!', n: 1 } }), null);
    const row = normalizeGift({ op: OP, side: 'got', with: { id: 7, name: 'Ada' }, items: [{ c: GIFT_BOX, n: 1 }, { c: 'cherry', n: 3 }], box: true, note: null });
    assert.deepEqual(row.box, [{ c: 'cherry', n: 3 }]);
    assert.equal(row.item, null);
    assert.equal(row.with.name, 'Ada');
    const note = normalizeGift({ op: OP, side: 'gave', with: { id: 9, name: 'Bo' }, items: [{ c: 'note', n: 1 }], box: false, note: { title: 'Hi', body: 'There' }, ref: 'g1' });
    assert.deepEqual(note.note, { title: 'Hi', body: 'There' });
    assert.equal(note.ref, 'g1');
  });

  it('moves a note with its writing, and a box whole', () => {
    const got = normalizeGift({ op: OP, from: { id: 7, name: 'Ada' }, item: { c: 'note', n: 1 }, note: { title: 'Hi Bo', body: 'Meet me at the shrine' } }, 'got');
    const fx = giftEffects(got, { table: TABLE });
    assert.deepEqual(fx.pack, {}, 'the carried note adds its own pack stack');
    assert.equal(fx.addNote.title, 'Hi Bo');
    assert.equal(fx.addNote.lastEditor, 'player:7');
    const box = normalizeGift({ op: OP2, from: { id: 7, name: 'Ada' }, box: [{ c: 'cherry', n: 3 }] }, 'got');
    const fb = giftEffects(box, { table: TABLE });
    assert.deepEqual(fb.pack, { [GIFT_WRAPPED]: 1 });
    assert.equal(fb.addBox.id, OP2);
    assert.equal(fb.line, 'Ada gave you a Gift Box.');
    assert.equal(fb.counters[0].counter, `items_received:${GIFT_WRAPPED}`);
    const gaveBox = giftEffects(normalizeGift({ op: OP2, to: { id: 9, name: 'Bo' }, ref: 'w2', box: [{ c: 'cherry', n: 3 }] }, 'gave'), { table: TABLE });
    assert.deepEqual(gaveBox.pack, { [GIFT_WRAPPED]: -1 });
    assert.deepEqual(gaveBox.removeBox, { ref: 'w2', items: [{ c: 'cherry', n: 3 }] });
    const boxes = [{ id: 'w1', items: [{ c: 'apple', n: 1 }] }, { id: 'w2', items: [{ c: 'cherry', n: 3 }] }];
    assert.equal(findBox(boxes, 'w2', []), 1);
    assert.equal(findBox(boxes, 'gone', [{ c: 'cherry', n: 3 }]), 1, 'else by its contents');
  });
});

describe('the Gift Box (bag_gift_box.js, bag_gift_box_wrapped.js)', () => {
  const have = (inv) => (c) => inv[c] || 0;

  it('wraps up to three stacks, no bags, elements, furniture or notes', () => {
    const slice = normalizeGiftsSlice(null);
    const inv = { [GIFT_BOX]: 1, cherry: 10, apple: 3, plank: 4, grain: 2, element_red: 5 };
    const out = wrapBox(slice, [{ c: 'cherry', n: 10 }, { c: 'apple', n: 3 }], have(inv), TABLE);
    assert.equal(out.ok, true);
    assert.deepEqual(out.pack, { [GIFT_BOX]: -1, [GIFT_WRAPPED]: 1, cherry: -10, apple: -3 });
    assert.equal(out.box.id, 'w1');
    assert.equal(wrapBox(slice, [], have(inv), TABLE).error, GIFT_TEXT.wrapEmpty);
    assert.equal(wrapBox(slice, [{ c: 'cherry', n: 1 }, { c: 'apple', n: 1 }, { c: 'plank', n: 1 }, { c: 'grain', n: 1 }], have(inv), TABLE).error, GIFT_TEXT.boxFull);
    assert.equal(wrapBox(slice, [{ c: 'element_red', n: 1 }], have(inv), TABLE).ok, false);
    assert.equal(wrapBox(slice, [{ c: 'cherry', n: 11 }], have(inv), TABLE).ok, false, 'no more than the pack holds');
    assert.equal(wrapBox(slice, [{ c: 'cherry', n: 1 }], have({ cherry: 1 }), TABLE).ok, false, 'needs the box');
    assert.notEqual(boxReason('bag_generic', TABLE), '');
    assert.notEqual(boxReason('furniture_chair', TABLE), '');
    assert.notEqual(boxReason('note', TABLE), '');
    assert.equal(boxReason('cherry', TABLE), '');
    assert.equal(BOX_SLOTS, 3);
  });

  it('unwraps with the source\'s growl and gives the box back', () => {
    assert.equal(unwrapGrowl([{ c: 'cherry', n: 3 }], TABLE), 'You open your wonderfully wrapped Gift Box and receive 3 Cherries');
    assert.equal(unwrapGrowl([{ c: 'cherry', n: 3 }, { c: 'apple', n: 1 }, { c: 'plank', n: 2 }], TABLE), 'You open your wonderfully wrapped Gift Box and receive 3 Cherries, an Apple and 2 Planks');
    assert.equal(unwrapGrowl([], TABLE), 'You open your wonderfully wrapped Gift Box and receive nothing. Oh... that was mean!');
    assert.deepEqual(unwrapPack({ items: [{ c: 'cherry', n: 3 }] }), { [GIFT_WRAPPED]: -1, [GIFT_BOX]: 1, cherry: 3 });
  });

  it('keeps clean boxes in its slice', () => {
    const s = normalizeGiftsSlice({ boxes: [{ id: 'w1', items: [{ c: 'cherry', n: 3 }, { c: 'Bad', n: 1 }, { c: 'apple', n: 0 }] }, { id: '<x>', items: [] }, { id: OP, items: [{ c: 'pick', n: 1, r: 9 }], from: { id: 7, name: 'Ada' } }], next: 4 });
    assert.deepEqual(s.boxes.map((b) => b.id), ['w1', OP]);
    assert.deepEqual(s.boxes[0].items, [{ c: 'cherry', n: 3 }]);
    assert.deepEqual(s.boxes[1].from, { id: 7, name: 'Ada' });
    assert.equal(s.next, 4);
  });
});

describe('solo is untouched', () => {
  it('answers nothing and saves nothing in solo', () => {
    const engine = { mode: 'solo', started: true, query: () => null };
    giftsFeature.init(engine);
    giftsFeature.restore({ boxes: [{ id: 'w1', items: [{ c: 'cherry', n: 1 }] }] }, engine);
    assert.equal(giftsFeature.save(), undefined);
    assert.equal(giftsFeature.packVerbs(GIFT_BOX, engine), null);
    assert.equal(giftsFeature.packDropBlockReason(GIFT_WRAPPED), null);
    assert.equal(giftsFeature.verbOverride({ classId: 'pc_remote', playerId: 9 }, engine), null);
    assert.equal(giftsFeature.playerGiveReady(engine), null);
    giftsFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleGifts, undefined);
  });

  it('is registered once, after the trade feature it relies on (ledgerReceipt)', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.equal((index.match(/gifts-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('gifts-feature.js') > index.indexOf('trade-feature.js'));
    // One module instance holds the carried notes: gifts-feature imports street-furniture-feature with index.js's key.
    const key = (src) => (src.match(/street-furniture-feature\.js\?v=([a-z0-9-]+)/) || [])[1];
    assert.equal(key(readFileSync(join(root, 'public/js/features/gifts-feature.js'), 'utf8')), key(index));
  });
});

describe('the site settles a give in the ledger and applies it on load', { skip: skipSite }, () => {
  it('checks the realtime server\'s call', () => {
    const ok = php(`echo json_encode(LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3]], 'currants' => 0]]));`);
    assert.deepEqual(ok, { op: OP, from: 7, to: 9, items: [{ c: 'cherry', n: 3 }], box: false, ref: '', note: null });
    const bad = php(`echo json_encode([
      LedgerGift::call(['op' => 'gift-1', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3]]]]),
      LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 7, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3]]]]),
      LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3]], 'currants' => 5]]),
      LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3], ['c' => 'apple', 'n' => 1]]]]),
      LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'box' => true, 'gave' => ['items' => [['c' => 'cherry', 'n' => 3]]]]),
      LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'cherry', 'n' => 1]]], 'note' => ['title' => 'x']]),
    ]);`);
    assert.deepEqual(bad, [null, null, null, null, null, null]);
    const box = php(`echo json_encode(LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'box' => true, 'ref' => 'w1', 'gave' => ['items' => [['c' => 'bag_gift_box', 'n' => 1], ['c' => 'cherry', 'n' => 3], ['c' => 'pick', 'n' => 1, 'r' => 40]]]]));`);
    assert.equal(box.box, true);
    assert.equal(box.ref, 'w1');
    assert.deepEqual(box.items[2], { c: 'pick', n: 1, r: 40 });
    const note = php(`echo json_encode(LedgerGift::call(['op' => '${OP}', 'from' => 7, 'to' => 9, 'gave' => ['items' => [['c' => 'note', 'n' => 1]]], 'note' => ['title' => "Hi\\n<b>Bo</b>", 'body' => "a\\nb"]]));`);
    assert.deepEqual(note.note, { title: 'Hi bBo/b', body: 'a\nb' });
  });

  it('counts a wrapped box as the box and what is inside (LedgerMath::holdings)', () => {
    const out = php(`$s = ['inventory' => ['cherry' => 2, 'bag_gift_box_wrapped' => 1], 'player' => ['currants' => 0], 'systems' => ['features' => ['gifts' => ['boxes' => [['id' => 'w1', 'items' => [['c' => 'cherry', 'n' => 3], ['c' => 'apple', 'n' => 1]]]]]]]];
      echo json_encode(LedgerMath::holdings(['playerState' => json_encode($s)], Economy::shared()));`);
    assert.deepEqual(out.items, { apple: 1, bag_gift_box: 1, cherry: 5 });
  });

  it('applies a pending give to a stored save the way the game does', () => {
    const state = { inventory: { cherry: 5, note: 2, bag_gift_box_wrapped: 1 }, player: { currants: 10 }, systems: { features: {
      gifts: { boxes: [{ id: 'w1', items: [{ c: 'apple', n: 2 }] }] },
      'street-furniture': { carried: [{ id: 'n1', title: 'Blank', body: '' }, { id: 'n2', title: 'Hi', body: 'There' }], nextNoteId: 3 },
    } } };
    const entries = JSON.stringify({ playerState: JSON.stringify(state) });
    const run = (side, gift) => php(`$e = json_decode(${JSON.stringify(entries)}, true); $o = LedgerGift::apply($e, '${side}', json_decode(${JSON.stringify(JSON.stringify(gift))}, true)); echo $o['playerState'];`);
    const plain = run('gave', { op: OP, from: 7, to: 9, items: [{ c: 'cherry', n: 3 }], box: false, ref: '', note: null, at: 0 });
    assert.equal(plain.inventory.cherry, 2);
    assert.ok(plain.systems.features.trade.applied.includes(OP));
    const box = run('gave', { op: OP, from: 7, to: 9, items: [{ c: 'bag_gift_box', n: 1 }, { c: 'apple', n: 2 }], box: true, ref: 'w1', note: null, at: 0 });
    assert.equal(box.inventory.bag_gift_box_wrapped, 0);
    assert.deepEqual(box.systems.features.gifts.boxes, []);
    assert.equal(box.inventory.cherry, 5, 'nothing loose in the pack moves');
    const gotBox = run('got', { op: OP2, from: 7, to: 9, items: [{ c: 'bag_gift_box', n: 1 }, { c: 'cherry', n: 3 }], box: true, ref: '', note: null, at: 5000, fromName: 'Ada' });
    assert.equal(gotBox.inventory.bag_gift_box_wrapped, 2);
    assert.deepEqual(gotBox.systems.features.gifts.boxes[1], { id: OP2, items: [{ c: 'cherry', n: 3 }], from: { id: 7, name: 'Ada' }, at: 5000 });
    assert.ok(gotBox.systems.features.trade.applied.includes(OP2));
    const gaveNote = run('gave', { op: OP, from: 7, to: 9, items: [{ c: 'note', n: 1 }], box: false, ref: '', note: { title: 'Hi', body: 'There' }, at: 0 });
    assert.equal(gaveNote.inventory.note, 1);
    assert.deepEqual(gaveNote.systems.features['street-furniture'].carried.map((n) => n.id), ['n1'], 'the written one goes, the blank stays');
    const gotNote = run('got', { op: OP, from: 7, to: 9, items: [{ c: 'note', n: 1 }], box: false, ref: '', note: { title: 'Yo', body: 'Hello' }, at: 7000 });
    assert.equal(gotNote.inventory.note, 3);
    const added = gotNote.systems.features['street-furniture'].carried.at(-1);
    assert.deepEqual([added.id, added.title, added.body, added.lastEditor], ['n3', 'Yo', 'Hello', 'player:7']);
    assert.equal(gotNote.systems.features['street-furniture'].nextNoteId, 4);
    // Already applied: left as it is.
    const again = php(`$e = json_decode(${JSON.stringify(entries)}, true); $g = ['op' => '${OP}', 'from' => 7, 'to' => 9, 'items' => [['c' => 'cherry', 'n' => 3]], 'box' => false, 'ref' => '', 'note' => null, 'at' => 0]; $o = LedgerGift::apply($e, 'gave', $g); $o = LedgerGift::apply($o, 'gave', $g); echo $o['playerState'];`);
    assert.equal(again.inventory.cherry, 2);
  });

  it('is registered with Minn, its table declared and the catch-up wired', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new LedgerGift\(\$minn\)/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_gifts.some((c) => c.startsWith('PRIMARY KEY')));
    // HOMES3 made the catch-up a match (furniture sales have their own): a give still goes through LedgerGift's.
    assert.match(readFileSync(sitePath('src/Ledger.php'), 'utf8'), /LedgerGift::isGift\(\$p\['trade'\]\) (\?|=>) LedgerGift::catchUp/);
  });
});

describe('the server says the source\'s words', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
  it('gifts.go refuses with takeable.js and main.js lines', () => {
    let go = '';
    try { go = readFileSync(serverPath('gifts.go'), 'utf8'); } catch { /* not copied yet */ }
    if (!go) return;
    for (const line of [
      "You can't do that to yourself.",
      'That player has gone offline.',
      'You are blocked by that player and cannot give them anything.',
      'You are blocking that player and cannot give them anything.',
      GIFT_TEXT.soulbound,
      GIFT_TEXT.cant,
    ]) assert.ok(go.includes(line), line);
    assert.match(go, /giftBoxSlots\s+= 3/);
  });
});
