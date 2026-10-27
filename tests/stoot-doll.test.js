import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STOOT_DOLL_BUBBLE_MS,
  STOOT_DOLL_ID,
  STOOT_DOLL_QUOTES,
  STOOT_DOLL_SOUND_KEYS,
  STOOT_MEMORIAL_STREET_ID,
  createStootDollState,
  pullStootDollString,
  selectStootDollQuote,
} from '../public/js/stoot-doll.js';
import {
  ITEM_CATALOG,
  createInventory,
  ensureItem,
  listPackItemSlots,
} from '../public/js/inventory.js?v=catalog-unified-7';
import {
  createDroppedItemState,
  dropInventoryStack,
  listDroppedStacks,
  pickupDroppedStack,
} from '../public/js/world-items.js?v=world-items-4';
import {
  createShrineState,
  listShrineDonationOptions,
  quoteShrineDonation,
} from '../public/js/shrines.js?v=spinning-wheel-test-4';
import {
  createVendorSellQuote,
  listSellOffers,
  vendorSell,
} from '../public/js/vendor.js?v=vendor-profiles-7';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.describe('official Stoot pull-string catalog', () => {
  test('preserves all 43 source quotes in production order', () => {
    assert.equal(STOOT_DOLL_ID, 'stoot_barfield_pullstring_doll');
    assert.equal(STOOT_MEMORIAL_STREET_ID, 'GIFPV9EMLT72DP4');
    assert.equal(STOOT_DOLL_QUOTES.length, 43);
    assert.equal(STOOT_DOLL_QUOTES[0], 'That is not part of our corporate culture.');
    assert.equal(STOOT_DOLL_QUOTES[20], '不好');
    assert.equal(STOOT_DOLL_QUOTES[21], '好');
    assert.equal(
      STOOT_DOLL_QUOTES[29],
      'It would be ... a couple hundred pixels wide.'
    );
    assert.equal(STOOT_DOLL_QUOTES[42], "It's fucking awesome!");
    assert.equal(STOOT_DOLL_BUBBLE_MS, 10_000);
  });

  test('maps the final 14 voiced lines to exact production sound keys', () => {
    assert.equal(Object.keys(STOOT_DOLL_SOUND_KEYS).length, 14);
    assert.equal(STOOT_DOLL_SOUND_KEYS[STOOT_DOLL_QUOTES[29]], 'STEWARTDOLL1');
    assert.equal(STOOT_DOLL_SOUND_KEYS[STOOT_DOLL_QUOTES[35]], 'STEWARTDOLL7');
    assert.equal(STOOT_DOLL_SOUND_KEYS[STOOT_DOLL_QUOTES[42]], 'STEWARTDOLL14');
    assert.equal(STOOT_DOLL_SOUND_KEYS[STOOT_DOLL_QUOTES[28]], undefined);
  });

  test('selects deterministic boundaries without changing source text', () => {
    assert.deepEqual(selectStootDollQuote(0), {
      index: 0,
      quote: STOOT_DOLL_QUOTES[0],
      soundKey: '',
    });
    assert.deepEqual(selectStootDollQuote(1), {
      index: 42,
      quote: STOOT_DOLL_QUOTES[42],
      soundKey: 'STEWARTDOLL14',
    });
    assert.equal(selectStootDollQuote((29.25) / 43).index, 29);
  });
});

test.describe('pull-string interaction', () => {
  test('tracks repeated pulls and reports the original activity sentence', () => {
    const state = createStootDollState();
    const first = pullStootDollString(state, { roll: 0 });
    const second = pullStootDollString(state, { roll: 42.25 / 43 });
    assert.equal(first.pullCount, 1);
    assert.equal(second.pullCount, 2);
    assert.equal(state.lastQuoteIndex, 42);
    assert.equal(state.lastSoundKey, 'STEWARTDOLL14');
    assert.equal(
      first.activity,
      'The doll starts to speak: "That is not part of our corporate culture."'
    );
  });

  test('ships the clean doll art and world verb without recording media', () => {
    assert.deepEqual(
      pngSize(path.join(root, 'public/assets/sprites/spinning-wheel/stoot-doll.png')),
      { width: 59, height: 59 }
    );
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const content = fs.readFileSync(path.join(root, 'public/content.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
    assert.match(game, /function handleStootDollTarget\(/);
    assert.match(game, /function pullPackedStootDoll\(/);
    assert.match(game, /data\.tsid === STOOT_MEMORIAL_STREET_ID/);
    // G315: hub 96 (inc_data_maps_prod.js 16973-16978); 'Alphermia Prime' had no source.
    assert.match(game, /data\.hubName = 'Jethimadh Tower: Mid'/);
    assert.doesNotMatch(game, /Alphermia Prime/);
    assert.match(game, /currentStreetPopulation\.companions !== false/);
    assert.match(game, /stootDollAudio = 'none'/);
    assert.match(game, /if \(result\.soundKey\) playSound\(result\.soundKey/);
    assert.match(game, /Never substitute compressed video audio/);
    // G317: the c2 voice files are in no CC0 release; the keys stay, silent.
    for (let n = 1; n <= 14; n += 1) {
      assert.equal(fs.existsSync(path.join(root, `public/assets/audio/sfx/STEWARTDOLL${n}.mp3`)), false, `STEWARTDOLL${n}`);
    }
    assert.match(game, /stootdollautoplay/);
    assert.match(game, /stootdollpackautoplay/);
    assert.match(game, /stootdolldropautoplay/);
    assert.match(game, /stootdollpickupautoplay/);
    assert.match(game, /dataset\.droppedStootDolls/);
    assert.match(game, /useInfo\.singleAction \? 'Item' : 'Consumable'/);
    // One inventory module everywhere (any current key); never the stale first one. The stale key is
    // spelled in pieces so cache-key bumps never rewrite it.
    assert.match(game, /inventory\.js\?v=[\w.-]+'/);
    assert.doesNotMatch(game, new RegExp('inventory\\.js\\?v=catalog-unified' + '-1\''));
    assert.match(content, /classId === 'stoot_barfield_pullstring_doll'/);
    assert.match(content, /add\('pull_string', 'pull string'/);
    assert.match(content, /s\.classTsid === 'stoot_barfield_pullstring_doll'/);
    assert.match(html, /stootdoll=6/);
    assert.equal(
      fs.readdirSync(path.join(root, 'public'), { recursive: true })
        .some((file) => /\.mp4$/i.test(String(file))),
      false
    );
  });

  test('keeps the rare doll usable in the pack and intact through drop and pickup', () => {
    ensureItem(STOOT_DOLL_ID, {
      label: 'Stoot Barfield Pullstring Doll',
      icon: 'assets/sprites/spinning-wheel/stoot-doll.png',
      baseCost: 1_333_100,
      stackMax: 1,
      sellable: false,
      donatable: false,
    });
    const inv = createInventory({ [STOOT_DOLL_ID]: 1 });
    const slot = listPackItemSlots(inv).find((row) => row.classTsid === STOOT_DOLL_ID);
    assert.equal(slot.count, 1);
    assert.equal(slot.stackMax, 1);
    assert.equal(slot.sellable, false);
    assert.equal(slot.donatable, false);
    assert.equal(ITEM_CATALOG[STOOT_DOLL_ID].baseCost, 1_333_100);

    const droppedState = createDroppedItemState();
    const dropped = dropInventoryStack(
      droppedState,
      inv,
      'GIFPV9EMLT72DP4',
      STOOT_DOLL_ID,
      1,
      { x: 100, y: 200 },
      { now: 10 }
    );
    assert.equal(dropped.ok, true);
    assert.equal(inv[STOOT_DOLL_ID], 0);
    assert.equal(listDroppedStacks(droppedState, 'GIFPV9EMLT72DP4')[0].classTsid, STOOT_DOLL_ID);
    const picked = pickupDroppedStack(
      droppedState,
      inv,
      'GIFPV9EMLT72DP4',
      dropped.stack.id
    );
    assert.equal(picked.ok, true);
    assert.equal(inv[STOOT_DOLL_ID], 1);
    assert.deepEqual(listDroppedStacks(droppedState, 'GIFPV9EMLT72DP4'), []);
  });

  test('honors the source no-vendor and no-donate tags', () => {
    ensureItem(STOOT_DOLL_ID, {
      label: 'Stoot Barfield Pullstring Doll',
      sellable: false,
      donatable: false,
    });
    const inv = createInventory({ [STOOT_DOLL_ID]: 1 });
    const shrine = createShrineState();
    assert.equal(
      listShrineDonationOptions(shrine, 'mab', inv)
        .some((row) => row.classTsid === STOOT_DOLL_ID),
      false
    );
    assert.equal(
      quoteShrineDonation(shrine, 'mab', inv, STOOT_DOLL_ID, 1).reason,
      'not_donatable'
    );
    assert.equal(
      listSellOffers(inv, [])
        .some((row) => row.classTsid === STOOT_DOLL_ID),
      false
    );
    assert.equal(
      createVendorSellQuote(inv, [], STOOT_DOLL_ID, 1).reason,
      'not_sellable'
    );
    assert.equal(
      vendorSell({ currants: 0 }, inv, [], STOOT_DOLL_ID, 1).reason,
      'not_sellable'
    );
    assert.equal(inv[STOOT_DOLL_ID], 1);
  });
});
