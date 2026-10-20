/**
 * Street-spirit style vendor: buy/sell against currants + pack.
 * Prices adapted from Glitch economy feel (GSJS street_spirit patterns).
 */

import {
  addItem,
  removeItem,
  countItem,
  listPackItemSlots,
  ITEM_CATALOG,
  ensureItem,
} from './inventory.js?v=catalog-unified-2';
import { gardenVendorOffers } from './garden.js?v=vendor-crops-1';
import { miningVendorOffers } from './mining.js';

/** @typedef {{ classTsid: string, label: string, buyPrice: number, sellPrice: number, stock?: number }} VendorOffer */

const BUYBACK_MULTIPLIER = 0.66;

/** Build one catalog_stores.js offer using the original vendor buy-back rate. */
function officialOffer(classTsid, label, buyPrice) {
  return {
    classTsid,
    label,
    buyPrice,
    sellPrice: Math.max(1, Math.floor(buyPrice * BUYBACK_MULTIPLIER)),
  };
}

const groceriesOffers = [
  officialOffer('coffee', 'Coffee', 6),
  officialOffer('honey', 'Honey', 5),
  officialOffer('mushroom', 'Mushroom', 3),
  officialOffer('mustard', 'Mustard', 5),
  officialOffer('oats', 'Oats', 9),
  officialOffer('oily_dressing', 'Oily Dressing', 3),
  officialOffer('olive_oil', 'Olive Oil', 6),
  officialOffer('sesame_oil', 'Sesame Oil', 5),
  officialOffer('birch_syrup', 'Birch Syrup', 5),
  officialOffer('beer', 'Beer', 11),
  officialOffer('garlic', 'Garlic', 5),
  officialOffer('bun', 'Bun', 10),
];

const gardeningOffers = [
  officialOffer('hoe', 'Hoe', 65),
  officialOffer('watering_can', 'Watering Can', 81),
  officialOffer('seed_broccoli', 'Broccoli Seed', 26),
  officialOffer('seed_cabbage', 'Cabbage Seed', 28),
  officialOffer('seed_carrot', 'Carrot Seed', 30),
  officialOffer('seed_corn', 'Corn Seed', 27),
  officialOffer('seed_cucumber', 'Cucumber Seed', 27),
  officialOffer('seed_onion', 'Onion Seed', 16),
  officialOffer('seed_potato', 'Potato Seed', 43),
  officialOffer('seed_rice', 'Rice Seed', 21),
  officialOffer('seed_spinach', 'Spinach Seed', 13),
  officialOffer('seed_tomato', 'Tomato Seed', 22),
  officialOffer('seed_zucchini', 'Zucchini Seed', 37),
  officialOffer('seed_parsnip', 'Parsnip Seed', 26),
];

const produceOffers = [
  officialOffer('garlic', 'Garlic', 4),
  officialOffer('broccoli', 'Broccoli', 6),
  officialOffer('carrot', 'Carrot', 7),
  officialOffer('cabbage', 'Cabbage', 8),
  officialOffer('corn', 'Corn', 7),
  officialOffer('cucumber', 'Cucumber', 4),
  officialOffer('onion', 'Onion', 4),
  officialOffer('parsnip', 'Parsnip', 7),
  officialOffer('potato', 'Potato', 8),
  officialOffer('rice', 'Rice', 4),
  officialOffer('spinach', 'Spinach', 3),
  officialOffer('tomato', 'Tomato', 6),
  officialOffer('zucchini', 'Zucchini', 6),
  officialOffer('bubble_tuner', 'Bubble Tuner', 167),
  officialOffer('gassifier', 'Gassifier', 167),
];

const toyOffers = [
  officialOffer('dice', 'Dice', 550),
  officialOffer('dice_12sided', '12-Sided Dice', 1210),
  officialOffer('fortune_cookie', 'Fortune Cookie', 220),
  officialOffer('emotional_bear', 'Emotional Bear', 330),
  officialOffer('lips', 'Lips', 11),
  officialOffer('moon', 'Moon', 109),
  officialOffer('npc_garden_gnome', 'Garden Gnome', 2200),
];

/** Street-spirit shop types shown in the original gameplay footage. */
export const VENDOR_PROFILES = Object.freeze({
  groceries: {
    key: 'groceries',
    id: 'street_spirit_groceries',
    label: 'Groceries Vendor',
    badge: 'G',
    color: 0xd87439,
    desc: 'Coffee, oils, syrups, and pantry staples from the official Groceries catalog.',
    offers: groceriesOffers,
  },
  gardening: {
    key: 'gardening',
    id: 'street_spirit_gardening',
    label: 'Gardening Goods Vendor',
    badge: 'GG',
    color: 0x6f9e3b,
    desc: 'Seeds, watering cans, and hoes for a serious patch of dirt.',
    offers: gardeningOffers,
  },
  produce: {
    key: 'produce',
    id: 'street_spirit_produce',
    label: 'Produce Vendor',
    badge: 'P',
    color: 0xc74f47,
    desc: 'Fresh vegetables and peculiar produce tools from the official catalog.',
    offers: produceOffers,
  },
  toys: {
    key: 'toys',
    id: 'street_spirit_toys',
    label: 'Toy Vendor',
    badge: 'T',
    color: 0x7653a6,
    desc: 'Dice, bears, fortunes, moons, lips, and other entirely necessary toys.',
    offers: toyOffers,
  },
});

const VENDOR_SEQUENCE = [
  VENDOR_PROFILES.groceries,
  VENDOR_PROFILES.gardening,
  VENDOR_PROFILES.produce,
  VENDOR_PROFILES.toys,
];

/** Register official stock in the shared pack catalog. */
export function ensureVendorItems() {
  const tools = new Set(['hoe', 'watering_can', 'bubble_tuner', 'gassifier']);
  for (const vendor of VENDOR_SEQUENCE) {
    for (const offer of vendor.offers) {
      ensureItem(offer.classTsid, {
        label: offer.label,
        desc: `${offer.label}, stocked by the ${vendor.label}. (GSJS catalog_stores.js)`,
        isTool: tools.has(offer.classTsid),
      });
    }
  }
}

/**
 * Pick a stable shop for a street, with a query-friendly profile override.
 * Hechey Track stays the familiar groceries stop.
 */
export function selectVendorProfile(streetTsid = '', override = '') {
  const requested = String(override || '').trim().toLowerCase();
  if (VENDOR_PROFILES[requested]) return VENDOR_PROFILES[requested];
  if (streetTsid === 'GLI2V0UN7RD1T2J') return VENDOR_PROFILES.groceries;
  let hash = 0;
  for (const char of String(streetTsid)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return VENDOR_SEQUENCE[hash % VENDOR_SEQUENCE.length];
}

ensureVendorItems();

/**
 * Backward-compatible all-goods vendor used by existing subsystem tests.
 * Live streets use one specialized VENDOR_PROFILES entry instead.
 */
export const DEFAULT_VENDOR = {
  id: 'street_spirit_groceries',
  label: 'Street Spirit (All Goods)',
  desc: 'Compatibility catalog containing every currently implemented vendor good.',
  offers: /** @type {VendorOffer[]} */ ([
    ...new Map(
      [
        { classTsid: 'apple', label: 'Apple', buyPrice: 8, sellPrice: 3 },
        { classTsid: 'cherry', label: 'Cherry', buyPrice: 6, sellPrice: 2 },
        { classTsid: 'grain', label: 'Grain', buyPrice: 5, sellPrice: 2 },
        { classTsid: 'butterfly_lotion', label: 'Butterfly Lotion', buyPrice: 25, sellPrice: 10 },
        { classTsid: 'plank', label: 'Plank', buyPrice: 12, sellPrice: 5 },
        { classTsid: 'milk_butterfly', label: 'Butterfly Milk', buyPrice: 40, sellPrice: 15 },
        { classTsid: 'pinch_of_salt', label: 'Pinch of Salt', buyPrice: 3, sellPrice: 1 },
        { classTsid: 'meat', label: 'Meat', buyPrice: 15, sellPrice: 5 },
        ...VENDOR_SEQUENCE.flatMap((vendor) => vendor.offers),
        ...gardenVendorOffers(),
        ...miningVendorOffers(),
      ].map((offer) => [offer.classTsid, offer])
    ).values(),
  ]),
};

/**
 * @param {VendorOffer[]} offers
 * @param {string} classTsid
 */
export function findOffer(offers, classTsid) {
  return offers.find((o) => o.classTsid === classTsid) || null;
}

/**
 * Buy one unit from vendor.
 * @param {{ currants: number }} pc
 * @param {import('./inventory.js').Inventory} inv
 * @param {VendorOffer[]} offers
 * @param {string} classTsid
 * @param {number} [qty=1]
 */
export function vendorBuy(pc, inv, offers, classTsid, qty = 1) {
  const offer = findOffer(offers, classTsid);
  if (!offer) return { ok: false, reason: 'not_sold', msgs: ['They do not sell that.'] };
  const amount = Math.floor(Number(qty));
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, reason: 'bad_qty', msgs: ['Buy at least one.'] };
  }
  const cost = offer.buyPrice * amount;
  if ((pc.currants || 0) < cost) {
    return {
      ok: false,
      reason: 'broke',
      msgs: [`Need ${cost} currants (you have ${pc.currants || 0}).`],
    };
  }
  pc.currants = (pc.currants || 0) - cost;
  addItem(inv, classTsid, amount);
  return {
    ok: true,
    reason: 'bought',
    classTsid,
    qty: amount,
    cost,
    msgs: [`Bought ${amount}× ${offer.label} for ${cost} currants.`],
    packCount: countItem(inv, classTsid),
    currants: pc.currants,
  };
}

/**
 * Sell one unit to vendor.
 * @param {{ currants: number }} pc
 * @param {import('./inventory.js').Inventory} inv
 * @param {VendorOffer[]} offers
 * @param {string} classTsid
 * @param {number} [qty=1]
 */
export function vendorSell(pc, inv, offers, classTsid, qty = 1) {
  if (ITEM_CATALOG[classTsid]?.sellable === false) {
    return { ok: false, reason: 'not_sellable', msgs: ['They will not buy that.'] };
  }
  const offer = findOffer(offers, classTsid);
  if (!offer) {
    // Still allow sell of known catalog items at floor price
    if (!ITEM_CATALOG[classTsid]) {
      return { ok: false, reason: 'not_bought', msgs: ['They will not buy that.'] };
    }
  }
  const amount = Math.floor(Number(qty));
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, reason: 'bad_qty', msgs: ['Sell at least one.'] };
  }
  if (countItem(inv, classTsid) < amount) {
    return { ok: false, reason: 'empty', msgs: ['You do not have enough to sell.'] };
  }
  const unit = offer?.sellPrice ?? 1;
  const gain = unit * amount;
  if (!removeItem(inv, classTsid, amount)) {
    return { ok: false, reason: 'empty', msgs: ['You do not have enough to sell.'] };
  }
  pc.currants = (pc.currants || 0) + gain;
  const label = offer?.label || ITEM_CATALOG[classTsid]?.label || classTsid;
  return {
    ok: true,
    reason: 'sold',
    classTsid,
    qty: amount,
    gain,
    msgs: [`Sold ${amount}× ${label} for ${gain} currants.`],
    packCount: countItem(inv, classTsid),
    currants: pc.currants,
  };
}

/**
 * List buy rows for UI.
 * @param {VendorOffer[]} offers
 */
export function listBuyOffers(offers) {
  return offers.map((o) => ({
    classTsid: o.classTsid,
    label: o.label,
    price: o.buyPrice,
    mode: 'buy',
  }));
}

/**
 * List sellable pack rows for UI.
 * @param {import('./inventory.js').Inventory} inv
 * @param {VendorOffer[]} offers
 */
export function listSellOffers(inv, offers) {
  return listPackItemSlots(inv).filter((slot) => slot.sellable !== false).map((slot) => {
    const offer = findOffer(offers, slot.classTsid);
    return {
      classTsid: slot.classTsid,
      label: offer?.label || slot.label,
      price: offer?.sellPrice ?? 1,
      have: slot.count,
      mode: 'sell',
      vendorStocked: Boolean(offer),
    };
  });
}

/**
 * Build the non-mutating quote shown after dropping/clicking a pack item.
 * The vendor buys any known non-tool item, matching the original sell tab.
 * @param {import('./inventory.js').Inventory} inv
 * @param {VendorOffer[]} offers
 * @param {string} classTsid
 * @param {number} [qty=1]
 */
export function createVendorSellQuote(inv, offers, classTsid, qty = 1) {
  const slot = listPackItemSlots(inv).find((row) => row.classTsid === classTsid);
  if (!slot || slot.count < 1 || slot.sellable === false) {
    return { ok: false, reason: 'not_sellable', classTsid, msgs: ['That item is not sellable from your pack.'] };
  }
  const offer = findOffer(offers, classTsid);
  const unitPrice = offer?.sellPrice ?? 1;
  const amount = Math.max(1, Math.min(slot.count, Math.floor(Number(qty) || 1)));
  return {
    ok: true,
    reason: 'quoted',
    classTsid,
    label: offer?.label || slot.label,
    have: slot.count,
    maxQty: slot.count,
    qty: amount,
    unitPrice,
    total: unitPrice * amount,
    vendorStocked: Boolean(offer),
  };
}
