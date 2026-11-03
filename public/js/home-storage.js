/**
 * Storage in a house (ticket 51, register G404): cabinets and the Storage
 * Display Box, rules only (no Pixi, no DOM). features/home-storage-feature.js
 * draws them, asks the player and talks to the site; the site's
 * src/LedgerBoxes.php keeps the same rules for what crosses between players.
 *
 * Sources (tinyspeck/glitch-GameServerJS, CC0):
 * - items/bag_furniture_cabinet.js (bag_furniture_cabinet_base, with
 *   _smallcabinet, _wallcabinet, _largecabinet): classProps width x height
 *   slots (Cabinet 4x8 = capacity 32, "This cabinet has 32 slots."; Small
 *   4x4 = 16; Wall 3x3 = 9; Large 2x3 = 6, its file declares no capacity),
 *   rows_display rows shown at once (4, 4, 3, 3); verbs.open 294-340 for the
 *   owner or a key-holder (isOwner 452-466: container.owner or
 *   acl_keys_player_has_key), disabled "You can't add items while it's for
 *   sale."; cabinet_start sends cols, rows, rows_display and the stacks;
 *   canContain 437-444 refuses contraband, elements, trophies, anything not
 *   takeable and no_bag; canPickup 446-450 "You must empty the cabinet first.".
 * - glitch-client CabinetDialog.as: the grid (50 x 52 slots, 4 px apart,
 *   rows 18 px apart on shelves, a scroller past rows_display), Done, the
 *   drag tip "Move Here"; a slot takes a drop when it is empty or holds the
 *   same class under its stackmax (findDropTarget 571-599).
 * - items/bag_furniture_sdb.js: one class per box (class_type), capacity
 *   1000 stacks; verbs set_selling_price 219-263 ("Price per <name>",
 *   "Quantity: N", "Set price", 7 digits), stop_selling 265-302,
 *   edit_selling_price 304-327, remove 495-575, purchase 577-609 (never the
 *   owner: sell_to_owner is a debug prop), deposit 611-802, collect_currants
 *   804-853 (the income kept on the box); canPickup 878-883 (empty, and the
 *   currants collected first), canSell 885-888 (empty), canVend 890-894 (not
 *   while the box itself is for sale); checkEmpty 896-907 stops the selling
 *   when the box empties; getStoreInfo 1043-1061, isSelling 1072-1074,
 *   sellItem 1139-1278 (the count cut to the stock, the price checked, the
 *   buyer pays, the income goes on the box).
 *
 * Remake decisions:
 * - A placed cabinet keeps its slots on its own row (`contents`, an array of
 *   capacity slots, each null or { classTsid, count, points? }); `points` is
 *   each tool's wear (js/tools.js copies), one per unit. The ledger counts
 *   what a cabinet holds as the save's own (site LedgerMath::holdings).
 * - A box keeps `display` ({ classTsid, count }, as before), `selling` and
 *   `price` on its row. Online the site keeps the price and the income
 *   (groddle_home_boxes), never a client's word.
 * - Tools go in with their wear; a bag goes in as a bag (what it held stays
 *   in the pack, as when one is sold or given: bags-feature).
 */

/** classProps width (cols), height (rows) and rows_display of each cabinet class. */
export const CABINETS = Object.freeze({
  bag_furniture_cabinet: Object.freeze({ cols: 4, rows: 8, rowsDisplay: 4 }),
  bag_furniture_smallcabinet: Object.freeze({ cols: 4, rows: 4, rowsDisplay: 4 }),
  bag_furniture_wallcabinet: Object.freeze({ cols: 3, rows: 3, rowsDisplay: 3 }),
  bag_furniture_largecabinet: Object.freeze({ cols: 2, rows: 3, rowsDisplay: 3 }),
});

export const SDB_CLASS = 'bag_furniture_sdb';

/** set_selling_price input_max_chars 7, input_restrict 0-9. */
export const SDB_PRICE_MAX = 9999999;

/** StoreBuyUI.as updateMax: the most one purchase asks for (max_buy_override aside). */
export const SDB_BUY_MAX = 999;

/** The box holds a "virtually infinite" amount (capacity 1000 stacks); the remake's row keeps a count. */
export const SDB_COUNT_MAX = 1_000_000;

/** The source's words (file:line in each), and ours where marked. */
export const STORAGE_TEXT = Object.freeze({
  open: 'open',
  openTip: 'Inspect your storage', // bag_furniture_cabinet.js:303
  forSale: "You can't add items while it's for sale.", // :310, bag_furniture_sdb.js:672
  emptyCabinet: 'You must empty the cabinet first.', // :448
  emptySdb: 'You must empty the SDB first.', // bag_furniture_sdb.js:871
  collectFirst: 'The currants must be collected from this SDB first.', // :881
  done: 'Done', // CabinetDialog.as:104
  moveHere: 'Move Here', // CabinetDialog.as:442
  cantGoIn: "That can't go in there.", // ours: the source's drop just fails
  full: "I'm full!", // bag_furniture_sdb.js:738
  noRoom: "You don't have enough room for all of that!", // :542
  slots: (n) => `This cabinet has ${n} slots.`, // getDescExtras
  setSelling: 'set selling price',
  setSellingTip: "Start selling what's inside", // :228
  stopSelling: 'stop selling',
  stopSellingTip: "Stop selling what's inside", // :274
  editSelling: 'edit selling price',
  editSellingTip: "Change the sale price of what's inside", // :313
  remove: 'remove',
  removeTip: 'Click to remove an item', // :504
  removeHow: (plural) => `Remove how many ${plural}?`, // InteractionMenuController.as:1354
  deposit: 'deposit',
  depositTip: 'Add an item', // :620
  depositHow: (plural) => `Deposit how many ${plural}?`,
  dropTip: 'Deposit', // :623
  noneLeft: (plural) => `You don't have anymore ${plural}.`, // :658
  nothingFits: "You don't have anything that can go in here", // :704
  oneKind: 'A Storage Display Box shows off one kind of thing at a time.', // ours (drop_ok_code refuses)
  purchase: 'purchase',
  purchaseTip: 'Buy some of it', // :595
  notForSale: 'Items not for sale!', // :595
  collect: 'collect currants',
  collectTip: 'Receive the money collected', // :813
  collectTipN: (n) => `Receive the money collected: ${n.toLocaleString('en-US')} ${n === 1 ? 'currant' : 'currants'}`, // :815-821
  nothingToCollect: "There's nothing to collect.", // :829
  collected: (n, plural) => `You collected ${n.toLocaleString('en-US')} ${n === 1 ? 'currant' : 'currants'} from a Storage Display Box${plural ? ` for selling ${plural}` : ''}.`, // :846-853
  pricerTitle: (single) => `Price per ${single}`, // :244
  pricerQty: (n) => `Quantity: ${n}`, // :245
  setPrice: 'Set price', // :251
  priceHelp: 'Type a price of 1 currant or more. 0 stops the selling.', // ours
  nowSelling: (plural, price) => `You're selling ${plural} for ${price.toLocaleString('en-US')} ${price === 1 ? 'currant' : 'currants'} each.`, // ours
  stopped: (plural) => `You stopped selling ${plural}.`, // buildVerbMessage 'stopped selling', ours in full
  // sellItem 1139-1278 and StoreBuyUI.as.
  noLongerSelling: 'Oops, that store is no longer selling.',
  zero: "You can't buy a negative/zero amount of things!",
  wrongStore: 'Oops, something went wrong with that store.',
  noLongerSells: 'Sorry, the store no longer sells that item.',
  priceMoved: 'Oops, the price appears to have changed underneath you. Please try your purchase again.',
  afford: "Sorry, you can't afford that.",
  cantFind: "I couldn't sell you that thing, because I couldn't find it :/",
  allOut: "We're all out!", // StoreBuyUI.as:596
  notEnough: "You don't have enough currants!", // :609
  youHave: (n) => `You have ${n.toLocaleString('en-US')} of these.`, // :215
  forSaleCount: (n) => `${n.toLocaleString('en-US')} for sale`, // :233
  priceEach: (n) => `Price ${n.toLocaleString('en-US')}`, // :520
  buyButton: (n, total) => `Buy: ${n.toLocaleString('en-US')} for ${total.toLocaleString('en-US')}`, // :580
  priceChangedTitle: 'Price changed!', // :249
  priceChanged: (was, now) => `The price for this item has just now changed, from ${was.toLocaleString('en-US')} to ${now.toLocaleString('en-US')}. I thought you would like to know.`, // :250
  thanks: 'Thanks!', // :252
  bought: (n, plural, single, total, owner) => `You bought ${n.toLocaleString('en-US')} ${n === 1 ? single : plural} from ${owner} for ${total.toLocaleString('en-US')} ${total === 1 ? 'currant' : 'currants'}.`, // ours
  soloNobody: 'Visitors to your house can buy what you sell here when you play online.', // ours
  keyOnly: 'Only the owner and their key-holders can open this.', // ours: the source shows no verb
  ownerTools: 'Only the owner can move tools in and out of a cabinet.', // ours (the ledger moves counts)
  offline: 'You are not connected to the game server right now.', // ours
  failed: 'That did not work. Try again in a moment.', // ours
});

const whole = (v, max = Number.MAX_SAFE_INTEGER) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

const cleanKey = (v) => String(v || '').replace(/[^a-z0-9_]/gi, '').slice(0, 64);

export function isCabinetClass(cls) {
  return Object.prototype.hasOwnProperty.call(CABINETS, cls);
}

export function isSdbClass(cls) {
  return cls === SDB_CLASS;
}

/** A piece the storage feature answers for (a cabinet or a box). */
export function isStorageClass(cls) {
  return isCabinetClass(cls) || isSdbClass(cls);
}

/** { cols, rows, rowsDisplay, capacity } of a cabinet class, or null (onCreate: capacity = width * height). */
export function cabinetDef(cls) {
  const d = CABINETS[cls];
  return d ? { ...d, capacity: d.cols * d.rows } : null;
}

/** One slot as saved: { classTsid, count, points? } or null. */
function cleanSlot(raw, stackmax = () => Infinity) {
  if (!raw || typeof raw !== 'object') return null;
  const classTsid = cleanKey(raw.classTsid);
  const max = stackmax(classTsid);
  const count = whole(raw.count, Number.isFinite(max) ? max : SDB_COUNT_MAX);
  if (!classTsid || !count) return null;
  const out = { classTsid, count };
  if (Array.isArray(raw.points)) {
    const pts = raw.points.slice(0, count).map((p) => Math.max(0, Math.floor(Number(p) || 0)));
    if (pts.length) out.points = pts;
  }
  return out;
}

/**
 * A cabinet's slots as the save keeps them, cleaned: always `capacity` long,
 * null for an empty slot. A save from before cabinets held things has none,
 * and gets an empty cabinet.
 */
export function normalizeContents(cls, raw, stackmax) {
  const def = cabinetDef(cls);
  if (!def) return [];
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < def.capacity; i += 1) out.push(cleanSlot(list[i], stackmax));
  // Stacks past the end (a smaller cabinet class than the save had) move into the first free slots.
  for (const extra of list.slice(def.capacity)) {
    const slot = cleanSlot(extra, stackmax);
    const free = out.indexOf(null);
    if (slot && free >= 0) out[free] = slot;
  }
  return out;
}

/** Whether a row's cabinet has nothing in it (countContents). */
export function cabinetEmpty(row) {
  return !Array.isArray(row?.contents) || row.contents.every((s) => !s);
}

/** class -> count over a cabinet's slots. */
export function cabinetCounts(slots) {
  const out = {};
  for (const s of Array.isArray(slots) ? slots : []) if (s) out[s.classTsid] = (out[s.classTsid] || 0) + s.count;
  return out;
}

export function slotsUsed(slots) {
  return (Array.isArray(slots) ? slots : []).filter(Boolean).length;
}

/**
 * canContain 437-444: why a class can't go in a cabinet, or null. `meta` says
 * what the remake knows of the class: element, noSlot (furniture and
 * trophies, js/pack-slots.js takesNoSlot), blocked (not takeable: a quest
 * item, no_drop), noBag.
 */
export function cabinetRefusal(cls, meta = {}) {
  const c = cleanKey(cls);
  if (!c || c === 'contraband' || meta.element || meta.noSlot || meta.trophy || meta.blocked || meta.noBag) {
    return { reason: 'cant', msg: STORAGE_TEXT.cantGoIn };
  }
  return null;
}

/** How many more of `cls` a slot takes: an empty slot a full stack, the same class up to its stackmax. */
export function slotRoom(slot, cls, max) {
  const cap = Number.isFinite(max) && max >= 1 ? Math.floor(max) : Infinity;
  if (!slot) return cap;
  if (slot.classTsid !== cls) return 0;
  return Math.max(0, cap - slot.count);
}

/** How many of `cls` the cabinet takes in all (into `slot` only, when named). */
export function cabinetRoom(slots, cls, max, slot = null) {
  if (Number.isInteger(slot)) return slot >= 0 && slot < slots.length ? slotRoom(slots[slot], cls, max) : 0;
  let room = 0;
  for (const s of slots) room += slotRoom(s, cls, max);
  return room;
}

/**
 * Puts up to `n` of `cls` in: into `slot` when named (an inventory move to a
 * slot, CabinetDialog onPackDragComplete), else topping up stacks of the class
 * first, then the first empty slots (bag.js addItemStack 191-232). `points`
 * is each tool's wear, in order. Mutates `slots`; returns how many went in.
 */
export function cabinetPut(slots, cls, n, { slot = null, max = Infinity, points = null } = {}) {
  let left = whole(n);
  const pts = Array.isArray(points) ? [...points] : null;
  const fill = (i) => {
    const room = slotRoom(slots[i], cls, max);
    const k = Math.min(room, left);
    if (!k) return;
    const s = slots[i] || { classTsid: cls, count: 0 };
    s.count += k;
    if (pts) {
      s.points = [...(s.points || []), ...pts.splice(0, k)];
    }
    slots[i] = s;
    left -= k;
  };
  if (Number.isInteger(slot)) {
    if (slot >= 0 && slot < slots.length) fill(slot);
  } else {
    for (let i = 0; i < slots.length && left; i += 1) if (slots[i]?.classTsid === cls) fill(i);
    for (let i = 0; i < slots.length && left; i += 1) if (!slots[i]) fill(i);
  }
  return whole(n) - left;
}

/**
 * Takes up to `n` of `cls` out: from `slot` when named, else from the last
 * stacks of the class first. Mutates `slots`; returns { taken, points } (the
 * wear of the tools that came out, when the stacks kept any).
 */
export function cabinetTake(slots, cls, n, { slot = null } = {}) {
  let left = whole(n);
  const points = [];
  const takeAt = (i) => {
    const s = slots[i];
    if (!s || s.classTsid !== cls || !left) return;
    const k = Math.min(s.count, left);
    s.count -= k;
    if (Array.isArray(s.points)) points.push(...s.points.splice(s.points.length - k, k));
    left -= k;
    if (s.count <= 0) slots[i] = null;
  };
  if (Number.isInteger(slot)) takeAt(slot);
  else for (let i = slots.length - 1; i >= 0 && left; i -= 1) takeAt(i);
  return { taken: whole(n) - left, points };
}

/**
 * A drag inside the cabinet (CabinetDialog onSlotMouseUp): a stack to an
 * empty slot moves; onto the same class it tops that stack up (the rest
 * stays); anything else swaps. Mutates `slots`; returns whether it changed.
 */
export function cabinetMove(slots, from, to, max = Infinity) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
  if (from < 0 || to < 0 || from >= slots.length || to >= slots.length || !slots[from]) return false;
  const a = slots[from];
  const b = slots[to];
  if (b && b.classTsid === a.classTsid) {
    const moved = cabinetTake(slots, a.classTsid, slotRoom(b, a.classTsid, max), { slot: from });
    if (!moved.taken) return false;
    cabinetPut(slots, a.classTsid, moved.taken, { slot: to, max, points: moved.points.length ? moved.points : null });
    return true;
  }
  slots[to] = a;
  slots[from] = b || null;
  return true;
}

// —— The Storage Display Box ——

/** isSelling 1072-1074: something in it, selling, and a price. */
export function sdbSelling(box) {
  return Boolean(box?.display?.count > 0 && box.selling === true && whole(box.price) > 0);
}

/** set_selling_price's answer (onInputBoxResponse 1081-1106): the first 7 characters' digits; null when none. */
export function parseSdbPrice(text) {
  const digits = String(text ?? '').slice(0, 7).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n >= 0 && n <= SDB_PRICE_MAX ? n : null;
}

/**
 * onInputBoxResponse 1088-1101: a price over 0 sells, 0 stops. Only with
 * something in the box (1085) and not while the box itself is for sale
 * (canVend). Mutates the row; returns { ok, selling, price } or { ok:false, msg }.
 */
export function setSdbPrice(box, price, { forSale = false } = {}) {
  if (!box || !isSdbClass(box.classTsid)) return { ok: false, reason: 'not_box', msg: STORAGE_TEXT.wrongStore };
  if (forSale) return { ok: false, reason: 'for_sale', msg: STORAGE_TEXT.forSale };
  if (!box.display?.count) return { ok: false, reason: 'empty', msg: STORAGE_TEXT.noLongerSelling };
  const p = Math.floor(Number(price));
  if (!Number.isFinite(p) || p < 0 || p > SDB_PRICE_MAX) return { ok: false, reason: 'price', msg: STORAGE_TEXT.priceHelp };
  if (p > 0) {
    box.price = p;
    box.selling = true;
  } else {
    delete box.selling;
  }
  return { ok: true, selling: box.selling === true, price: whole(box.price) };
}

/** checkEmpty 896-907: an emptied box stops selling (its price stays for next time). */
export function sdbCheckEmpty(box) {
  if (box?.display?.count > 0) return false;
  if (box) {
    delete box.display;
    delete box.selling;
  }
  return true;
}

/**
 * getStoreInfo 1043-1061: what a box sells, { classTsid, cost, count }, or
 * null when it isn't selling. `stock` (online, the site's count) stands for
 * the box's own when given.
 */
export function sdbStoreItem(box, stock = null) {
  if (!sdbSelling(box)) return null;
  const count = stock == null ? whole(box.display.count) : whole(stock);
  return count > 0 ? { classTsid: box.display.classTsid, cost: whole(box.price), count } : null;
}

/**
 * sellItem 1150-1216: the count cut to what is for sale, the price as shown
 * checked against the box's, the buyer's purse. Returns { ok, n, total } or
 * { ok:false, why, msg }.
 */
export function sdbQuote(item, { count, price, currants }) {
  if (!item) return { ok: false, why: 'gone', msg: STORAGE_TEXT.noLongerSelling };
  const want = Math.floor(Number(count));
  if (!Number.isFinite(want) || want <= 0) return { ok: false, why: 'zero', msg: STORAGE_TEXT.zero };
  const n = Math.min(want, item.count);
  if (price != null && Math.floor(Number(price)) !== item.cost) return { ok: false, why: 'price', msg: STORAGE_TEXT.priceMoved };
  const total = n * item.cost;
  if (Math.floor(Number(currants) || 0) < total) return { ok: false, why: 'short', msg: STORAGE_TEXT.afford };
  return { ok: true, n, total };
}

/** StoreBuyUI.as updateMax: the most the buyer can ask for now (0: nothing). */
export function sdbBuyMax(item, currants) {
  if (!item) return 0;
  return Math.max(0, Math.min(Math.floor((Number(currants) || 0) / item.cost), item.count, SDB_BUY_MAX));
}

/**
 * The verbs a box shows (sort_on order), for its owner or a visitor.
 * `forSale`: the box itself is up for sale (furniture_base); `income` the
 * currants waiting on it (online; the owner's alone); `has` whether the
 * owner has more of its class to deposit; `fits` whether anything at all fits.
 */
export function sdbVerbs(box, { owner = false, forSale = false, income = 0, has = true, fits = true, online = false } = {}) {
  const T = STORAGE_TEXT;
  const v = (id, label, tooltip, enabled = true, reason = '', extra = {}) => ({ id, label, tooltip, enabled, reason, ...extra });
  if (!owner) {
    if (sdbSelling(box)) return [v('sdb_purchase', T.purchase, T.purchaseTip, true, '', { primary: true })];
    return [v('sdb_purchase', T.purchase, T.purchaseTip, false, forSale ? '' : T.notForSale)];
  }
  const out = [];
  const full = Boolean(box?.display?.count > 0);
  const selling = sdbSelling(box);
  if (full && !forSale && !selling) out.push(v('sdb_set_price', T.setSelling, T.setSellingTip));
  if (!forSale && selling) out.push(v('sdb_stop', T.stopSelling, T.stopSellingTip));
  if (!forSale && selling) out.push(v('sdb_edit_price', T.editSelling, T.editSellingTip));
  if (full) out.push(v('sdb_remove', T.remove, T.removeTip));
  // deposit's conditions 638-670.
  let dep = v('sdb_deposit', T.deposit, T.depositTip, true, '', { primary: !full });
  if (forSale) dep = { ...dep, enabled: false, reason: T.forSale };
  else if (full && !has) dep = { ...dep, enabled: false, reason: T.noneLeft(box.display.plural || box.display.classTsid) };
  else if (!fits) dep = { ...dep, enabled: false, reason: T.nothingFits };
  out.push(dep);
  if (!forSale) {
    const n = whole(income);
    out.push(v('sdb_collect', T.collect, n ? T.collectTipN(n) : T.collectTip, n > 0, n > 0 ? '' : T.nothingToCollect, online ? {} : { solo: true }));
  }
  return out;
}

/** verbs.open for a cabinet: the owner or a key-holder, disabled while the cabinet is for sale. */
export function cabinetVerbs({ canOpen = false, forSale = false } = {}) {
  if (!canOpen) return [];
  return [{ id: 'cabinet_open', label: STORAGE_TEXT.open, tooltip: STORAGE_TEXT.openTip, enabled: !forSale, reason: forSale ? STORAGE_TEXT.forSale : '', primary: true }];
}

/** canPickup: a cabinet or box with things in it (or currants on it) stays put. Returns the words, or ''. */
export function storagePickupLock(row, { income = 0 } = {}) {
  if (isCabinetClass(row?.classTsid) && !cabinetEmpty(row)) return STORAGE_TEXT.emptyCabinet;
  if (isSdbClass(row?.classTsid)) {
    if (row.display?.count > 0) return STORAGE_TEXT.emptySdb;
    if (whole(income) > 0) return STORAGE_TEXT.collectFirst;
  }
  return '';
}

/** canSell: a cabinet or box with things in it can't go up for sale (LedgerFurniture TEXT_EMPTY). */
export function storageHasContents(row) {
  if (isCabinetClass(row?.classTsid)) return !cabinetEmpty(row);
  if (isSdbClass(row?.classTsid)) return Boolean(row.display?.count > 0);
  return false;
}

// —— What crosses between players, applied to the owner's house (online) ——

/** Box and cabinet op ids: sdb- a purchase, cab- a key-holder's take or put, sdbc- a collection; -o the owner's side. */
export const BOX_OP_RE = /^(sdb|cab)-[0-9a-f]{16}$/;
export const COLLECT_OP_RE = /^sdbc-[0-9a-f]{16}$/;

export function newOpId(prefix, rand = Math.random) {
  let hex = '';
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const b = new Uint8Array(8);
    c.getRandomValues(b);
    hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } else {
    for (let i = 0; i < 16; i += 1) hex += Math.floor(rand() * 16).toString(16);
  }
  return `${prefix}-${hex}`;
}

/**
 * The owner's side of an op someone else made on their house (the site's
 * groddle/v1/homes/boxes `ops`, or the realtime server's word): a purchase
 * from a box (kind buy) or a key-holder's take or put on a cabinet. Applied
 * to the decor's row with id `uid`: a box loses what was bought, a cabinet
 * loses or gains the stack (the slot named first). Returns what the house
 * could not carry, for the caller to take from or give to the pack:
 * { take: n } or { give: n } (0 when the house carried all of it).
 */
export function applyOwnerOp(decor, op, { max = () => Infinity } = {}) {
  const row = (decor?.placed || []).find((p) => p.id === whole(op?.uid));
  const cls = cleanKey(op?.classTsid);
  const n = whole(op?.n);
  if (!cls || !n) return { take: 0, give: 0 };
  if (op.kind === 'buy') {
    let left = n;
    if (row && isSdbClass(row.classTsid) && row.display?.classTsid === cls) {
      const k = Math.min(row.display.count, left);
      row.display.count -= k;
      left -= k;
      sdbCheckEmpty(row);
    }
    return { take: left, give: 0 };
  }
  if (!row || !isCabinetClass(row.classTsid)) return op.kind === 'put' ? { take: 0, give: n } : { take: n, give: 0 };
  row.contents = normalizeContents(row.classTsid, row.contents);
  const slot = Number.isInteger(op.slot) ? op.slot : null;
  if (op.kind === 'take') {
    let got = cabinetTake(row.contents, cls, n, { slot }).taken;
    if (got < n) got += cabinetTake(row.contents, cls, n - got).taken;
    return { take: n - got, give: 0 };
  }
  if (op.kind === 'put') {
    let put = cabinetPut(row.contents, cls, n, { slot, max: max(cls) });
    if (put < n) put += cabinetPut(row.contents, cls, n - put, { max: max(cls) });
    return { take: 0, give: n - put };
  }
  return { take: 0, give: 0 };
}

/** The site's pending ops for a visitor's view of a cabinet: the stored slots with each op applied in order. */
export function cabinetView(cls, stored, ops = [], max = () => Infinity) {
  const row = { id: 1, classTsid: cls, contents: normalizeContents(cls, stored, max) };
  for (const op of ops) applyOwnerOp({ placed: [row] }, { ...op, uid: 1 }, { max });
  return row.contents;
}
