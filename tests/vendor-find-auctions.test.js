/**
 * G803 (chat 2026-11-04 and 11-15): two players could not find the Auctions until told they are in the
 * top-right Menu. Glitch surfaced them in the player menu (PlayerInfoButtons.as 45), on an item's Get
 * Info (GetInfoDialog.as 189), in another player's menu (InteractionMenuController.as 560-562) and in a
 * vendor's buy window: "Find auctions" for an auctionable item (StoreBuyUI.as 166-187, 548-558). The
 * remake had all but the vendor's; a vendor's buy window now offers it too (online, a class the trade
 * table lists), opening the Auctions window on that item.
 * Run: node --test tests/vendor-find-auctions.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUCTION_TEXT } from '../public/js/auctions.js?v=2b806ad4';
import { auctionsFeature } from '../public/js/features/auctions-feature.js?v=801021f4';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

describe('G803: a vendor\'s buy window offers Find auctions', () => {
  it('the feature answers with the pack card\'s own Find auctions, or null', () => {
    const online = { packVerbs: () => [{ id: 'auctions_find', label: AUCTION_TEXT.find, tooltip: AUCTION_TEXT.findTip }, { id: 'auctions_sell', label: AUCTION_TEXT.sell }] };
    assert.deepEqual(auctionsFeature.vendorFindAuctions.call(online, 'cherry'), { label: 'Find auctions', tooltip: 'See who is selling these' });
    // Solo, or a class the trade table does not list: packVerbs says null, so no button.
    assert.equal(auctionsFeature.vendorFindAuctions.call({ packVerbs: () => null }, 'cherry'), null);
    const engine = { mode: 'solo', setData() {}, query: () => null };
    auctionsFeature.init(engine);
    auctionsFeature.restore({}, engine);
    assert.equal(auctionsFeature.vendorFindAuctions('cherry'), null);
  });

  it('game.js puts it under the count on Buy only, and it opens the Auctions window on the item', () => {
    const game = read('game.js');
    assert.match(game, /const findAuctions = isBuy \? features\.query\('vendorFindAuctions', vendorSelected\) : null;/);
    assert.match(game, /\$\{findAuctions \? `\s*<p class="vendor-auctions"><button type="button" class="vendor-auctions-btn" data-v-auctions /);
    const click = game.slice(game.indexOf("detail.querySelector('[data-v-auctions]')"));
    assert.match(click.slice(0, 300), /closeVendor\(\);\s*runPackCardVerb\(cls, 'auctions_find', 'auctions'\);/);
    const css = read('style.css');
    assert.match(css, /#vendor-panel \.vendor-auctions-btn \{/);
  });
});
