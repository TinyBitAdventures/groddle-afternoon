/**
 * The Auction House between real players (register G333): pure rules and
 * words, no DOM and no fetch. The site decides everything of value
 * (groddle-afternoon-site src/LedgerAuction.php: listings, the ledger's
 * moves, expiry, deliveries); features/auctions-feature.js draws it and
 * applies what the site settled. Multiplayer only.
 *
 * Source (glitch-GameServerJS players/inc_auctions.js, inc_mail.js; the
 * prices and copy of glitch.com's /auctions/ pages, Wayback 2011-2012, saved
 * in research/wayback/raw/auctions/pages/; the AS3 client's entry points):
 *  - Listing fee: intval(cost / 100 * 1.5), at least 3 currants, never
 *    refunded (inc_auctions.js:166-178; the create page's costs and its
 *    "All auctions have a non-refundable listing fee of 1.5% (minimum 3
 *    currants)"). Commission 8% at the time of sale ("Successful auctions are
 *    charged a commission of 8% at time of sale"); the seller gets
 *    Math.round(cost * 0.92) (inc_auctions.js:504).
 *  - The price the create page offers: count x the class's going rate, 10%
 *    under its base cost (Math.round(count * base_cost * 0.9); the site's
 *    economy value v is round(0.9 * base_cost)).
 *  - A sale tells the seller "Someone bought your auction of 3x Tomatoes",
 *    or, with more waiting, "4 of your auctions were purchased: ..." (452-479),
 *    and counts auctions_sold_<class> by the count (526; Tater 'n' Mater),
 *    bootleg_hooch for Hooch (hooch.js onAuctionSold 131-133); the buyer's
 *    big purchases grant Big Spender, El Big Spenderino and Moneybags Magoo
 *    (532-546).
 *  - Deliveries come by mail (inc_mail.js 764-771), and the ones that came
 *    while you were away are announced once (800-806).
 */

import { formatStack } from './gifts.js?v=d0732a90';

export const AUCTION_SENDER = 'Auction Fulfillment and Logistics Corporation';
/** Our save slice keeps this many announced sales. */
export const TOLD_KEEP = 120;

export const AUCTION_TEXT = Object.freeze({
  title: 'Auctions',
  menuTip: 'Buy from and sell to other players',
  browse: 'All auctions',
  post: 'Post a new auction',
  mine: 'Your auctions',
  // GetInfoDialog.as:189, StoreBuyUI.as:169
  find: 'Find auctions',
  findTip: 'See who is selling these',
  // Ours: the create page picked a stack from your pack; the pack popover goes straight there.
  sell: 'Sell at auction',
  sellTip: 'Post this stack on the Auction House',
  // InteractionMenuController.as:560-562
  viewAuctions: 'View Auctions',
  viewAuctionsTip: 'View active auctions from this person.',
  searchHint: 'Give us at least 3 letters to search for',
  none: 'No active auctions',
  forbidden: 'This type of item can not be auctioned.',
  feeDesc: (r) => `All auctions have a non-refundable listing fee of ${r.listPercent}% (minimum ${r.listMin} currants)`,
  commissionDesc: (r) => `Successful auctions are charged a commission of ${r.commission}% at time of sale`,
  snooze: 'You snooze, you lose... Someone purchased this auction.',
  nothingToSell: "You don't have anything to sell!",
  offline: 'The Auction House is not answering. Try again in a moment.',
  listed: (stack, cost) => `You put ${stack} up for auction for ${cost.toLocaleString('en-US')} currants.`,
  bought: (stack, cost) => `You bought ${stack} for ${cost.toLocaleString('en-US')} currants. It will arrive in your mailbox in 10 minutes.`,
  cancelled: (stack) => `You cancelled your auction of ${stack}. It will come back to you by mail.`,
  expired: (stack) => `Your auction of ${stack} ended without a buyer. It will come back to you by mail.`,
  arrived: 'An auction delivery is waiting in your mailbox.',
});

const n0 = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const DEFAULT_RULES = Object.freeze({ listPercent: 1.5, listMin: 3, commission: 8, hours: 72, delivery: 600, maxActive: 100, costMax: 9999999, searchMin: 3 });

export function normalizeRules(r) {
  const out = { ...DEFAULT_RULES };
  for (const k of Object.keys(out)) if (Number.isFinite(Number(r?.[k])) && Number(r[k]) >= 0) out[k] = Number(r[k]);
  return out;
}

/** inc_auctions.js:168-171 (the site charges the same). */
export function listingFee(cost, rules = DEFAULT_RULES) {
  const fee = Math.trunc((n0(cost) / 100) * rules.listPercent);
  return fee > rules.listMin ? fee : rules.listMin;
}

/** The create page's readout: the commission the sale will pay. */
export function commission(cost, rules = DEFAULT_RULES) {
  return n0(cost) - proceeds(cost, rules);
}

/** inc_auctions.js:504: what the seller gets. */
export function proceeds(cost, rules = DEFAULT_RULES) {
  return Math.round(n0(cost) * ((100 - rules.commission) / 100));
}

/** The create page's first price: count x the going rate (v, round(0.9 x base cost)). */
export function suggestedPrice(count, value) {
  const cost = Math.round(n0(count) * Math.max(0, Number(value) || 0));
  return cost >= 1 ? cost : 0;
}

/**
 * "36.2 each": the price per one as the list pages printed it, one decimal
 * with an exact half to the even digit (4 for 145 showed 36.2, 4 for 195
 * showed 48.8), and never below 0.1.
 */
export function unitPrice(cost, count) {
  const n = n0(count);
  if (!n) return '';
  const each = n0(cost) / n;
  if (each < 0.1) return '<0.1';
  const tenths = each * 10;
  let r = Math.round(tenths);
  if (Math.abs(tenths - Math.trunc(tenths) - 0.5) < 1e-9 && r % 2 === 1) r -= 1;
  return String(r / 10);
}

/** "3x Tomatoes" (inc_auctions.js:450). */
export function countName(c, n, table, label = (x) => x) {
  const row = table?.items?.[c];
  const count = Math.max(1, n0(n));
  const name = count > 1 ? (row?.plural || label(c, 2)) : (row?.name || label(c, 1));
  return `${count}x ${name}`;
}

/** "a Cherry", "3 Cherries" (item.js formatStack). */
export function stackWords(c, n, table, label) {
  return formatStack(c, n, table, label);
}

/** The seller's prompt for the sales not told yet (inc_auctions.js:452-479). */
export function soldText(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return `Someone bought your auction of ${list[0]}`;
  const count = list.length;
  let shown = list;
  let extra = 0;
  if (count > 10) {
    // As the source counts it: nine named, and count - 10 others (one fewer than are left).
    extra = count - 10;
    shown = list.slice(0, 9);
  }
  let txt = `${count} of your auctions were purchased: `;
  const last = shown.length - 1;
  shown.forEach((item, i) => {
    txt += item;
    if (i === last - 1 && !extra) txt += ' and ';
    else if (i !== last) txt += ', ';
  });
  if (extra) txt += ` and ${extra}${extra > 1 ? ' others' : ' other'}`;
  return txt;
}

/** inc_mail.js:764-770: the letter a delivery comes with. */
export function mailText(kind) {
  const thing = kind === 'cancelled' ? 'cancelled auction' : kind === 'expired' ? 'expired auction' : 'auction purchase';
  return `Your ${thing}, courtesy of the Auction Fulfillment and Logistics Corporation.`;
}

/** inc_mail.js:800-806: deliveries that came while you were away. */
export function arrivedWhileOutText(kind) {
  if (kind === 'cancelled') return 'Your cancelled auctions arrived while you were out. All items have been placed in your mailbox for convenient pickup.';
  if (kind === 'expired') return 'Your expired auctions arrived while you were out. All items have been placed in your mailbox for convenient pickup.';
  return 'Your purchased auctions arrived while you were out. All items have been placed in your mailbox for convenient pickup.';
}

/** "Ends in 23h 59m 55s" (the list pages). */
export function endsIn(ends, now = Date.now()) {
  let s = Math.max(0, Math.floor((Number(ends) - now) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** "just now", "12 sec ago", "26 hr ago" (the list pages). */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - Number(at)) / 1000));
  if (s < 3) return 'just now';
  if (s < 60) return `${s} sec ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

/** A listing from the site, checked. */
export function normalizeListing(raw) {
  const id = String(raw?.id || '');
  const c = String(raw?.c || '');
  if (!/^[0-9a-f]{16}$/.test(id) || !/^[a-z0-9_]{1,64}$/.test(c)) return null;
  const who = (p) => (p && n0(p.id) ? { id: n0(p.id), name: String(p.name || 'Someone').slice(0, 40) } : null);
  const out = {
    id,
    c,
    n: Math.max(1, n0(raw.n)),
    cost: n0(raw.cost),
    cat: String(raw.cat || 'other'),
    seller: who(raw.seller) || { id: 0, name: 'Someone' },
    status: ['active', 'bought', 'cancelled', 'expired'].includes(raw.status) ? raw.status : 'active',
    at: n0(raw.at),
    ends: n0(raw.ends),
    mine: raw.mine === true,
  };
  if (raw.r != null && Number.isFinite(Number(raw.r))) out.r = Math.max(0, Math.floor(Number(raw.r)));
  if (raw.ended) out.ended = n0(raw.ended);
  if (raw.buyer) out.buyer = who(raw.buyer);
  if (raw.proceeds != null) out.proceeds = n0(raw.proceeds);
  if (raw.fee != null) out.fee = n0(raw.fee);
  return out;
}

/** One of the site's settled moves (a Receipt), checked: { op, gave, got } as counts. */
export function normalizeReceipt(raw) {
  const op = String(raw?.op || '');
  if (!/^auc-[0-9a-f]{16}-[lbpd]$/.test(op)) return null;
  const goods = (g) => {
    const items = {};
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const c = String(it?.c || '');
      const n = n0(it?.n);
      if (/^[a-z0-9_]{1,64}$/.test(c) && n) items[c] = (items[c] || 0) + n;
    }
    return { items, currants: n0(g?.currants) };
  };
  return { op, kind: op.slice(-1), id: op.slice(4, 20), gave: goods(raw.gave), got: goods(raw.got) };
}

/** What a receipt does to the pack and the purse. */
export function receiptEffects(receipt) {
  const pack = {};
  for (const [c, n] of Object.entries(receipt?.gave?.items || {})) pack[c] = (pack[c] || 0) - n;
  for (const [c, n] of Object.entries(receipt?.got?.items || {})) pack[c] = (pack[c] || 0) + n;
  for (const c of Object.keys(pack)) if (!pack[c]) delete pack[c];
  return { pack, currants: n0(receipt?.got?.currants) - n0(receipt?.gave?.currants) };
}

/** The quest counters one sale counts for its seller (inc_auctions.js:526, hooch.js:131-133). */
export function saleCounters(listing) {
  if (!listing?.c) return [];
  const n = Math.max(1, n0(listing.n));
  const out = [{ counter: `auctions_sold_${listing.c}`, amount: n }];
  if (listing.c === 'hooch') out.push({ counter: 'bootleg_hooch', amount: n });
  return out;
}

/** The badges one purchase grants its buyer (inc_auctions.js:532-546). */
export function purchaseBadges(cost) {
  const c = n0(cost);
  const out = [];
  if (c >= 1009) out.push('big_spender');
  if (c >= 2003) out.push('el_big_spenderino');
  if (c >= 5003) out.push('moneybags_magoo');
  return out;
}

/** The mail row for a delivery (js/mailbox.js deliverMail), carrying its ledger op. */
export function deliveryMail(d) {
  const id = String(d?.id || '');
  if (!/^[0-9a-f]{16}$/.test(id) || !d?.item?.c) return null;
  return {
    id: `auction-${id}`,
    sender: AUCTION_SENDER,
    text: mailText(d.kind),
    sentAt: n0(d.at),
    deliveryAt: n0(d.at),
    attachment: { classTsid: String(d.item.c), count: Math.max(1, n0(d.item.n)) },
    ledger: `auc-${id}-d`,
  };
}

/** A fresh listing id (16 hex): asking twice with it lists once. */
export function newListingId(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 16; i += 1) s += Math.floor(rand() * 16).toString(16);
  return s;
}

/** The save slice: sales already told and counted (listing ids). */
export function normalizeAuctionsSlice(s) {
  const told = (Array.isArray(s?.told) ? s.told : []).map(String).filter((x) => /^[0-9a-f]{16}$/.test(x));
  const seenOut = n0(s?.seenOut);
  return { told: [...new Set(told)].slice(-TOLD_KEEP), seenOut };
}
