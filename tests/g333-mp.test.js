/**
 * Register G333: the Auction House between real players in multiplayer. The
 * pure rules and words are js/auctions.js; the site's rules
 * (src/LedgerAuction.php: the fee, the commission, what can be listed, the
 * search) run here through php -r (skipped without the site or php), and its
 * table (data/auctions.json) must match tools/build-auctions.mjs. The routes
 * themselves are checked live (lanes/auction/api.mjs). Solo is untouched:
 * the feature answers nothing there and the mailbox keeps solo letters as
 * they were.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUCTION_SENDER,
  AUCTION_TEXT,
  ago,
  arrivedWhileOutText,
  commission,
  countName,
  deliveryMail,
  endsIn,
  listingFee,
  mailText,
  newListingId,
  normalizeAuctionsSlice,
  normalizeListing,
  normalizeReceipt,
  proceeds,
  purchaseBadges,
  receiptEffects,
  saleCounters,
  soldText,
  suggestedPrice,
  unitPrice,
} from '../public/js/auctions.js?v=g333-1';
import { auctionsFeature } from '../public/js/features/auctions-feature.js?v=g333-1';
import { normalizeMailboxState } from '../public/js/mailbox.js?v=homes-mail-3';
import { MULTIPLAYER_QUESTS, MULTIPLAYER_QUESTS_LEFT_OUT, offerableMultiplayerQuest } from '../public/js/quests-mp.js?v=g329-5';
import { auctionJson } from '../tools/build-auctions.mjs';
import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const TABLE = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8'));
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (['Economy', 'LedgerMath', 'LedgerAuction'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\LedgerAuction; use Groddle\\Minn\\Economy; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

const ID = '00000000000000a1';

describe('the prices follow the source and the 2012 create page', () => {
  it('takes a listing fee of 1.5%, at least 3, truncated as auctions_start does (inc_auctions.js:168-171)', () => {
    assert.equal(listingFee(1), 3);
    assert.equal(listingFee(200), 3);
    assert.equal(listingFee(400), 6);
    assert.equal(listingFee(700), 10, '10.5 truncates');
    assert.equal(listingFee(2200), 33);
  });

  it('pays the seller the price less 8% (inc_auctions.js:504)', () => {
    assert.equal(proceeds(2200), 2024);
    assert.equal(commission(2200), 176);
    assert.equal(proceeds(400), 368);
    assert.equal(proceeds(1), 1, 'Math.round(0.92)');
    assert.equal(proceeds(6), 6, 'Math.round(5.52)');
  });

  it('offers count x the going rate, and prints the price each as the list pages did', () => {
    assert.equal(suggestedPrice(3, 18), 54);
    assert.equal(suggestedPrice(2, 0), 0);
    assert.equal(unitPrice(1650, 10), '165');
    assert.equal(unitPrice(145, 4), '36.2');
    assert.equal(unitPrice(195, 4), '48.8');
    assert.equal(unitPrice(1, 50), '<0.1');
  });

  it('tells the times as the pages did', () => {
    const now = 1_000_000_000;
    assert.equal(endsIn(now + (23 * 3600 + 59 * 60 + 55) * 1000, now), '23h 59m');
    assert.equal(endsIn(now + 65_000, now), '1m 5s');
    assert.equal(ago(now - 1000, now), 'just now');
    assert.equal(ago(now - 12_000, now), '12 sec ago');
    assert.equal(ago(now - 26 * 3600_000, now), '26 hr ago');
  });
});

describe('the source\'s words', () => {
  it('tells the seller of one sale, or many (inc_auctions.js:452-479)', () => {
    assert.equal(countName('tomato', 3, TABLE), '3x Tomatoes');
    assert.equal(countName('tomato', 1, TABLE), '1x Tomato');
    assert.equal(soldText(['3x Tomatoes']), 'Someone bought your auction of 3x Tomatoes');
    assert.equal(soldText(['1x Apple', '2x Planks', '3x Tomatoes']), '3 of your auctions were purchased: 1x Apple, 2x Planks and 3x Tomatoes');
    const many = soldText(Array.from({ length: 12 }, (_, i) => `${i + 1}x Plank`));
    assert.ok(many.startsWith('12 of your auctions were purchased: 1x Plank, '));
    assert.ok(many.endsWith('9x Plank and 2 others'), many);
  });

  it('mails deliveries from the Auction Fulfillment and Logistics Corporation (inc_mail.js:764-806)', () => {
    assert.equal(mailText('purchased'), 'Your auction purchase, courtesy of the Auction Fulfillment and Logistics Corporation.');
    assert.equal(mailText('cancelled'), 'Your cancelled auction, courtesy of the Auction Fulfillment and Logistics Corporation.');
    assert.equal(mailText('expired'), 'Your expired auction, courtesy of the Auction Fulfillment and Logistics Corporation.');
    assert.match(arrivedWhileOutText('purchased'), /^Your purchased auctions arrived while you were out\./);
    const row = deliveryMail({ id: ID, kind: 'purchased', item: { c: 'potato', n: 50 }, at: 5000 });
    assert.deepEqual(row, { id: `auction-${ID}`, sender: AUCTION_SENDER, text: mailText('purchased'), sentAt: 5000, deliveryAt: 5000, attachment: { classTsid: 'potato', count: 50 }, ledger: `auc-${ID}-d` });
    assert.equal(deliveryMail({ id: 'nope', item: { c: 'potato', n: 1 } }), null);
  });

  it('keeps the create page\'s copy and has no em-dashes', () => {
    const r = { listPercent: 1.5, listMin: 3, commission: 8 };
    assert.equal(AUCTION_TEXT.feeDesc(r), 'All auctions have a non-refundable listing fee of 1.5% (minimum 3 currants)');
    assert.equal(AUCTION_TEXT.commissionDesc(r), 'Successful auctions are charged a commission of 8% at time of sale');
    assert.equal(AUCTION_TEXT.forbidden, 'This type of item can not be auctioned.');
    assert.equal(AUCTION_TEXT.viewAuctionsTip, 'View active auctions from this person.');
    // Player-facing copy only: the files' section comments use the codebase's '——' markers.
    const src = (readFileSync(join(root, 'public/js/auctions.js'), 'utf8') + readFileSync(join(root, 'public/js/features/auctions-feature.js'), 'utf8'))
      .split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
    assert.equal(src.includes('—'), false);
  });
});

describe('what a sale or a purchase counts', () => {
  it('counts auctions_sold_<class> for Tater \'n\' Mater, and Hooch for the bootlegger (inc_auctions.js:526, hooch.js:131-133)', () => {
    assert.deepEqual(saleCounters({ c: 'potato', n: 50 }), [{ counter: 'auctions_sold_potato', amount: 50 }]);
    assert.deepEqual(saleCounters({ c: 'hooch', n: 3 }), [{ counter: 'auctions_sold_hooch', amount: 3 }, { counter: 'bootleg_hooch', amount: 3 }]);
  });

  it('grants the spender badges to the buyer (inc_auctions.js:532-546)', () => {
    assert.deepEqual(purchaseBadges(1008), []);
    assert.deepEqual(purchaseBadges(1009), ['big_spender']);
    assert.deepEqual(purchaseBadges(5003), ['big_spender', 'el_big_spenderino', 'moneybags_magoo']);
  });

  it('reads the site\'s receipts and moves only what they say', () => {
    assert.equal(normalizeReceipt({ op: 'auc-xyz-l' }), null);
    const listed = normalizeReceipt({ op: `auc-${ID}-l`, gave: { items: [{ c: 'potato', n: 50 }], currants: 6 }, got: { items: [], currants: 0 } });
    assert.deepEqual(receiptEffects(listed), { pack: { potato: -50 }, currants: -6 });
    const paid = normalizeReceipt({ op: `auc-${ID}-p`, gave: { items: [], currants: 0 }, got: { items: [], currants: 368 } });
    assert.deepEqual(receiptEffects(paid), { pack: {}, currants: 368 });
    const delivered = normalizeReceipt({ op: `auc-${ID}-d`, gave: {}, got: { items: [{ c: 'potato', n: 50 }] } });
    assert.equal(delivered.kind, 'd');
    assert.deepEqual(receiptEffects(delivered), { pack: { potato: 50 }, currants: 0 });
  });

  it('reads listings and keeps a clean slice', () => {
    assert.equal(normalizeListing({ id: 'bad', c: 'potato' }), null);
    const a = normalizeListing({ id: ID, c: 'potato', n: 50, cost: 400, seller: { id: 7, name: 'Ada' }, status: 'bought', buyer: { id: 9, name: 'Bo' }, proceeds: 368, at: 1, ends: 2 });
    assert.deepEqual([a.n, a.cost, a.seller.name, a.buyer.name, a.proceeds], [50, 400, 'Ada', 'Bo', 368]);
    assert.match(newListingId(), /^[0-9a-f]{16}$/);
    const s = normalizeAuctionsSlice({ told: [ID, ID, 'nope'], seenOut: 9 });
    assert.deepEqual(s, { told: [ID], seenOut: 9 });
  });
});

describe('solo is untouched', () => {
  it('answers nothing and saves nothing in solo', () => {
    const engine = { mode: 'solo', started: true, query: () => null };
    auctionsFeature.init(engine);
    auctionsFeature.restore({ told: [ID] }, engine);
    assert.equal(auctionsFeature.save(), undefined);
    assert.equal(auctionsFeature.packVerbs('potato', engine), null);
    assert.equal(auctionsFeature.verbOverride({ classId: 'pc_remote', playerId: 9 }, engine), null);
    assert.equal(auctionsFeature.mailReceive({ ledger: `auc-${ID}-d` }), null);
    assert.equal(auctionsFeature.auctionsReady(engine), null);
    auctionsFeature.onTick(16, 0, engine);
    assert.equal(globalThis.groddleAuctions, undefined);
  });

  it('leaves solo letters exactly as they were, and keeps an auction letter\'s ledger op', () => {
    const solo = normalizeMailboxState({ messages: [{ id: 'mail-1', sender: 'Amp', text: 'Hi', attachment: { classTsid: 'apple', count: 1 } }] });
    assert.equal('ledger' in solo.messages[0], false);
    const mp = normalizeMailboxState({ messages: [{ id: `auction-${ID}`, sender: AUCTION_SENDER, text: 'x', attachment: { classTsid: 'potato', count: 50 }, ledger: `auc-${ID}-d` }] });
    assert.equal(mp.messages[0].ledger, `auc-${ID}-d`);
    assert.equal(normalizeMailboxState({ messages: [{ id: 'm', ledger: 'something-else' }] }).messages[0].ledger, undefined);
  });

  it('is registered once, after the trade feature it relies on (ledgerReceipt), and the mailbox asks it', () => {
    const index = readFileSync(join(root, 'public/js/features/index.js'), 'utf8');
    assert.equal((index.match(/auctions-feature\.js/g) || []).length, 1);
    assert.ok(index.indexOf('auctions-feature.js') > index.indexOf('trade-feature.js'));
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /message\.ledger \? features\.query\('mailReceive', message, engine\)/);
    assert.match(game, /mailMessages: \(\) => mailboxState\.messages/);
  });
});

describe('Tater \'n\' Mater waits for the Auction House (G329)', () => {
  it('is a multiplayer quest offered by Croppery II once auctions are live', () => {
    assert.equal(MULTIPLAYER_QUESTS.croppery_harvest_and_sell_at_auction.offer, 'source');
    assert.equal('croppery_harvest_and_sell_at_auction' in MULTIPLAYER_QUESTS_LEFT_OUT, false);
    assert.equal(offerableMultiplayerQuest('croppery_harvest_and_sell_at_auction', { multiplayer: true, mpReady: {} }), null);
    assert.ok(offerableMultiplayerQuest('croppery_harvest_and_sell_at_auction', { multiplayer: true, mpReady: { auctions: true } }));
    assert.equal(offerableMultiplayerQuest('croppery_harvest_and_sell_at_auction', { multiplayer: false, mpReady: { auctions: true } }), null);
  });
});

describe('the site\'s rules', { skip: skipSite }, () => {
  it('has the table tools/build-auctions.mjs writes', () => {
    assert.equal(readFileSync(sitePath('data/auctions.json'), 'utf8'), auctionJson());
  });

  it('charges, pays and refuses as the game shows', () => {
    const out = php(`echo json_encode([
      'fees' => array_map(fn ($c) => LedgerAuction::fee($c), [1, 200, 400, 700, 2200]),
      'proceeds' => array_map(fn ($c) => LedgerAuction::proceeds($c), [1, 6, 400, 2200]),
      'refuse' => [LedgerAuction::startRefusal('potato', 50, 400), LedgerAuction::startRefusal('element_red', 1, 40), LedgerAuction::startRefusal('bag_bigger', 1, 40), LedgerAuction::startRefusal('potato', 0, 40), LedgerAuction::startRefusal('potato', 1, 10000000)],
      'listable' => [LedgerAuction::listable('potato'), LedgerAuction::listable('greeter_twig'), LedgerAuction::listable('no_such_thing')],
      'search' => [LedgerAuction::searchText('  po '), LedgerAuction::searchText('pota  to')],
      'named' => array_slice(LedgerAuction::classesNamed('potato'), 0, 50),
      'op' => LedgerAuction::op('${ID}', 'd'),
      'rules' => LedgerAuction::rules(),
    ]);`);
    assert.deepEqual(out.fees, [1, 200, 400, 700, 2200].map((c) => listingFee(c)));
    assert.deepEqual(out.proceeds, [1, 6, 400, 2200].map((c) => proceeds(c)));
    assert.deepEqual(out.refuse, [null, ['type', AUCTION_TEXT.forbidden], ['type', AUCTION_TEXT.forbidden], ['bad_count', 'Choose how many to sell.'], ['cost_too_high', 'Ask for a price from 1 to 9,999,999 currants.']]);
    assert.deepEqual(out.listable, [true, false, false]);
    assert.deepEqual(out.search, ['', 'pota to']);
    assert.ok(out.named.includes('potato'));
    assert.equal(out.op, `auc-${ID}-d`);
    assert.deepEqual(out.rules, { listPercent: 1.5, listMin: 3, commission: 8, hours: 72, delivery: 600, maxActive: 100, costMax: 9999999, searchMin: 3 });
  });

  it('is registered with Minn and its table declared', () => {
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new LedgerAuction\(\$minn\)/);
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    const cols = manifest.tables.groddle_auctions;
    assert.ok(cols.some((c) => c.startsWith('PRIMARY KEY')));
    assert.ok(cols.some((c) => c.startsWith('deliver_at ')));
  });

  it('credits Tater \'n\' Mater\'s 450 currants once (tools/build-economy.mjs)', () => {
    const economy = JSON.parse(readFileSync(sitePath('data/economy.json'), 'utf8'));
    assert.deepEqual(economy.credits.quests.croppery_harvest_and_sell_at_auction, { c: 450 });
  });
});
