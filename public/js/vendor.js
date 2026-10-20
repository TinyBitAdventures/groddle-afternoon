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
} from './inventory.js?v=catalog-unified-3';
import { gardenVendorOffers } from './garden.js?v=vendor-crops-1';
import { miningVendorOffers } from './mining.js';

import { STORE_CATALOG } from './store-catalog.js?v=stores-1';

/** @typedef {{ classTsid: string, label: string, buyPrice: number, sellPrice: number, stock?: number }} VendorOffer */

const BUYBACK_MULTIPLIER = 0.66;

/** Build one catalog_stores.js offer using the store's buy-back rate. */
function officialOffer(classTsid, label, buyPrice, buyMultiplier = BUYBACK_MULTIPLIER) {
  return {
    classTsid,
    label,
    buyPrice,
    sellPrice: Math.max(1, Math.floor(buyPrice * buyMultiplier)),
  };
}

/** Shop-window copy for each street spirit (the source stores have names only). */
const VENDOR_DESCRIPTIONS = {
  groceries: 'Coffee, oils, syrups, and pantry staples from the official Groceries catalog.',
  gardening: 'Seeds, watering cans, and hoes for a serious patch of dirt.',
  produce: 'Fresh vegetables and peculiar produce tools from the official catalog.',
  toys: 'Dice, bears, fortunes, moons, lips, Cubimal boxes, and other entirely necessary toys.',
  hardware: 'Picks, scrapers, shovels, and sturdy tools for people who hit things for a living.',
  sno_cone: 'Sno cones in every colour a tongue can turn.',
  kitchen: 'Knives, pans, pots, shakers, and grills for an ambitious kitchen.',
  alchemical: 'Tinctures, tubes, beakers, and cauldrons for the scientifically curious.',
  animal: 'Lotions, seasoners, and looms for friends of piggies, chickens, and butterflies.',
  tools: 'A little of everything a working Glitch could need.',
  gardening_tools: 'Hoes, cans, seeds, and herb gear for gardeners who mean it.',
  emporium: 'Uncle Friendly’s grab bag of necessities and delightful oddities.',
  liquor: 'Helga pours the strong stuff. Drink responsibly, or at least interestingly.',
  meals: 'Hot meals ready to eat, for Glitches too busy to cook.',
  mining: 'Picks, smelters, grinders, and tongs for the subterranean set.',
};

/** Every ordinary street-spirit store from catalog_stores.js (see build-stores.mjs). */
export const VENDOR_PROFILES = Object.freeze(
  Object.fromEntries(
    STORE_CATALOG.map((store) => [
      store.key,
      {
        key: store.key,
        id: store.id,
        storeId: store.storeId,
        label: store.label,
        badge: store.badge,
        color: store.color,
        desc: VENDOR_DESCRIPTIONS[store.key] || `Official stock from the ${store.label}.`,
        offers: store.offers.map((offer) =>
          officialOffer(offer.classTsid, offer.label, offer.cost, store.buyMultiplier)
        ),
      },
    ])
  )
);

const VENDOR_SEQUENCE = Object.values(VENDOR_PROFILES);
const MINING_VENDOR_KEYS = ['mining', 'hardware', 'tools'];

/** Register official stock in the shared pack catalog. */
export function ensureVendorItems() {
  for (const vendor of VENDOR_SEQUENCE) {
    for (const offer of vendor.offers) {
      // Keep richer metadata already registered by making, mining, or gardens.
      if (ITEM_CATALOG[offer.classTsid]) continue;
      ensureItem(offer.classTsid, {
        label: offer.label,
        desc: `${offer.label}, stocked by the ${vendor.label}. (GSJS catalog_stores.js)`,
      });
    }
  }
}

/**
 * Pick a stable shop for a street, with a query-friendly profile override.
 * Hechey Track stays the familiar groceries stop seen in the footage; other
 * streets use their official store from map_stores, and streets without one
 * get a stable pick (rocky streets favour mining, hardware, and tools).
 * @param {string} [streetTsid]
 * @param {string} [override]
 * @param {{ rocks?: number, store?: string }} [context]
 */
export function selectVendorProfile(streetTsid = '', override = '', context = {}) {
  const requested = String(override || '').trim().toLowerCase();
  if (VENDOR_PROFILES[requested]) return VENDOR_PROFILES[requested];
  if (streetTsid === 'GLI2V0UN7RD1T2J') return VENDOR_PROFILES.groceries;
  // The street's own store from production map data (map_stores).
  if (VENDOR_PROFILES[context.store]) return VENDOR_PROFILES[context.store];
  let hash = 0;
  for (const char of String(streetTsid)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  if ((context.rocks || 0) >= 3) {
    return VENDOR_PROFILES[MINING_VENDOR_KEYS[hash % MINING_VENDOR_KEYS.length]];
  }
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
