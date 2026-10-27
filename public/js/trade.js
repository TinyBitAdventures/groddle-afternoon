/**
 * Trading in multiplayer (phase 4): the rules and words of the trade window,
 * pure (no DOM, no engine), for js/features/trade-feature.js. The server is
 * groddle-afternoon-server/trade.go; its header lists the messages and the source rules
 * (glitch-GameServerJS players/inc_trading.js, glitch-client TradeDialog.as
 * and TradeManager.as).
 *
 * The escrow ("hold"): an offered item leaves the pack into the trade hold,
 * which saves with the character, before the offer goes to the server. The
 * hold only ever covers every offer the server could still swap: it grows
 * before an offer is sent and shrinks only once the server has answered
 * (holdFor). A trade_done says what this side gave and gets; settleDone
 * turns the hold into the pack changes. Cancel and void return the hold.
 *
 * Goods are { items: [{ c, n, r? }], currants }: one entry per trade slot
 * (a slot is one stack: at most the class's stackmax), r a tool's points
 * left. Counts are { [classTsid]: n }.
 */

/** TradeDialog.as:50 MAX_TRADE_SLOTS. */
export const TRADE_SLOTS = 6;
/** MakingSlot.as:25 MAX_COUNT. */
export const SLOT_MAX = 9999;
/** Trades remembered as applied, so a done heard twice is applied once. */
export const APPLIED_KEEP = 24;

/** Copy players read, from the source (file:line) or ours where it had none. */
export const TRADE_TEXT = Object.freeze({
  verb: 'Offer to Trade', // InteractionMenuController.as:548
  verbTip: 'Open a trade dialog and offer to make a trade...', // InteractionMenuController.as:552
  title: (name) => `Trade with ${name}`, // TradeDialog.as:218
  subtitle: (name) => `Drag items from your pack to the left column. ${name} will counter on the right.`, // TradeDialog.as:219
  mineHead: "I'll trade:", // TradeDialog.as:223
  theirsHead: (name) => `${name} is offering:`, // TradeDialog.as:224
  offerCurrants: 'Offer Currants', // TradeDialog.as:227
  currants: 'Currants', // TradeDialog.as:238
  offer: 'Looks good. Make offer...', // TradeDialog.as:372, 1424
  confirm: 'Confirm the trade', // TradeDialog.as:359
  edit: 'Edit', // TradeDialog.as:1415
  done: 'Ok, done!', // TradeDialog.as:1434
  waiting: (name) => `Waiting for ${name}`, // TradeDialog.as:247
  settling: 'Finishing the trade...', // ours (G335: the site's ledger is moving both sides)
  begun: (name) => `You and ${name} have begun a trade.`, // RightSideManager line, TradeDialog.as:1345 (its chat half is not here)
  confirmed: 'confirmed the offer', // TradeDialog.as:367
  theyEdit: 'is editing their offer', // TradeDialog.as:427
  youEdit: 'are editing the offer', // TradeDialog.as:427
  sealedTitle: 'The deal was sealed!', // TradeDialog.as:613
  sealedSub: (name) => `You and ${name} made the trade.`, // TradeDialog.as:614
  tradedMine: 'I traded:', // TradeDialog.as:617
  tradedTheirs: (name) => `${name} traded:`, // TradeDialog.as:618
  nothing: 'nothing at all', // TradeDialog.as:697
  canceled: (name) => `${name} canceled their trade with you.`, // inc_trading.js:269
  ohWell: 'Oh well', // inc_trading.js:273
  cantTrade: "You can't trade this item!", // TradeDialog.as:1063
  soulbound: "That item is locked to you, and can't be traded.", // inc_trading.js:477
  notEnough: "You don't have enough of that item.", // inc_trading.js:456
  notEnoughCurrants: "You don't have enough currants for that.", // inc_trading.js:846
  unsettled: 'You have unsettled items from a previous trade. Make some room in your pack for them before attempting another trade.', // inc_trading.js:102
  busySelf: 'You are already trading with someone else. Finish that up first.', // inc_trading.js:91
  ok: 'OK', // inc_trading.js:332
  add: 'Add', // TradeDialog.as:1057
  // Ours.
  yourPack: 'Your pack',
  full: 'The trade window is full.',
  offline: 'You are offline, so you cannot trade right now.',
  saveFailed: 'Your game could not save, so the trade was cancelled.',
  usage: 'Type /trade and a name to trade with someone on this street.',
});

export function n0(v) {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** Goods as the server sends them (junk dropped). */
export function normalizeGoods(g) {
  const items = [];
  for (const it of Array.isArray(g?.items) ? g.items : []) {
    const c = typeof it?.c === 'string' ? it.c : '';
    const n = n0(it?.n);
    if (!c || !n) continue;
    const row = { c, n };
    if (Number.isInteger(it?.r) && it.r >= 0) row.r = it.r;
    items.push(row);
    if (items.length >= TRADE_SLOTS) break;
  }
  return { items, currants: n0(g?.currants) };
}

export function emptyGoods() {
  return { items: [], currants: 0 };
}

/** { class: total } over the slots. */
export function countsOf(goods) {
  const out = {};
  for (const it of goods?.items || []) out[it.c] = (out[it.c] || 0) + it.n;
  return out;
}

export function sameGoods(a, b) {
  return JSON.stringify(normalizeGoods(a)) === JSON.stringify(normalizeGoods(b));
}

/**
 * Why a class may not go in a trade, or '' when it may. table is
 * assets/content/trade-items.json (tools/build-realtime-trade.mjs).
 */
export function untradeableReason(classTsid, table) {
  if (table?.items?.[classTsid]) return '';
  return table?.untradeable?.[classTsid] === 'soulbound' ? TRADE_TEXT.soulbound : TRADE_TEXT.cantTrade;
}

export function slotMax(classTsid, table) {
  return Math.max(1, Math.min(SLOT_MAX, n0(table?.items?.[classTsid]?.max) || 1));
}

/** "3 Apples" / "1 Apple" (common.js:798 pluralize), with the table's names, else label(c). */
export function countLabel(classTsid, n, table, label = (c) => c) {
  const row = table?.items?.[classTsid];
  const single = row?.name || label(classTsid, 1);
  const plural = row?.plural || label(classTsid, 2) || single;
  return n === 1 ? `1 ${single}` : `${n.toLocaleString('en-US')} ${plural}`;
}

export function currantsLabel(n) {
  return `${Number(n).toLocaleString('en-US')} ${n === 1 ? 'currant' : 'currants'}`;
}

/**
 * Put n of a class into the offer: fills a slot of that class first, then
 * empty slots, each up to the class's stackmax (TradeDialog.as
 * findEmptySlotOrSlotWithThisItem). Returns { goods, added, reason }.
 */
export function addToGoods(goods, classTsid, n, table, { tool = null } = {}) {
  const reason = untradeableReason(classTsid, table);
  if (reason) return { goods, added: 0, reason };
  const max = slotMax(classTsid, table);
  const items = goods.items.map((it) => ({ ...it }));
  let left = n0(n);
  for (const it of items) {
    if (!left) break;
    if (it.c !== classTsid || it.n >= max) continue;
    const take = Math.min(left, max - it.n);
    it.n += take;
    left -= take;
  }
  while (left > 0 && items.length < TRADE_SLOTS) {
    const take = Math.min(left, max);
    const row = { c: classTsid, n: take };
    if (Number.isInteger(tool)) row.r = tool;
    items.push(row);
    left -= take;
  }
  const added = n0(n) - left;
  return { goods: { items, currants: goods.currants }, added, reason: added ? '' : TRADE_TEXT.full };
}

/** Set one slot's count (0 removes it). */
export function setSlot(goods, index, n, table) {
  const items = goods.items.map((it) => ({ ...it }));
  if (!items[index]) return goods;
  const v = Math.min(n0(n), slotMax(items[index].c, table));
  if (v <= 0) items.splice(index, 1);
  else items[index].n = v;
  return { items, currants: goods.currants };
}

/**
 * What the hold must cover: for every class (and currants) the most any of
 * these offers asks for (the server's current one and those still in flight).
 */
export function holdFor(offers) {
  const items = {};
  let currants = 0;
  for (const g of offers) {
    if (!g) continue;
    for (const [c, n] of Object.entries(countsOf(g))) items[c] = Math.max(items[c] || 0, n);
    currants = Math.max(currants, n0(g.currants));
  }
  return { items, currants };
}

/** The moves from a hold to a wanted hold: take from the pack (positive) or give back (negative). */
export function holdDelta(have, want) {
  const items = {};
  for (const c of new Set([...Object.keys(have?.items || {}), ...Object.keys(want?.items || {})])) {
    const d = (want?.items?.[c] || 0) - (have?.items?.[c] || 0);
    if (d) items[c] = d;
  }
  return { items, currants: (want?.currants || 0) - (have?.currants || 0) };
}

/**
 * Can the pack (plus what is already held) back this offer?
 * '' when yes, else the source's refusal.
 */
export function backedBy(goods, inv, purse, hold) {
  for (const [c, n] of Object.entries(countsOf(goods))) {
    if (n > (n0(inv?.[c]) + n0(hold?.items?.[c]))) return TRADE_TEXT.notEnough;
  }
  if (n0(goods.currants) > n0(purse) + n0(hold?.currants)) return TRADE_TEXT.notEnoughCurrants;
  return '';
}

/**
 * A finished trade on this side: the hold minus what was given goes back to
 * the pack, what was got comes in. If the hold is short of what the server
 * says was given (a save from before the hold, which a careful client never
 * has), the rest is taken from the pack so nothing is made twice.
 * Returns { pack: { class: +/-n }, currants: +/-n, tools: [{ c, r }] }.
 */
export function settleDone(hold, done) {
  const gave = normalizeGoods(done?.gave);
  const got = normalizeGoods(done?.got);
  const pack = {};
  const add = (c, n) => {
    if (!n) return;
    pack[c] = (pack[c] || 0) + n;
    if (!pack[c]) delete pack[c];
  };
  const gaveCounts = countsOf(gave);
  for (const c of new Set([...Object.keys(hold?.items || {}), ...Object.keys(gaveCounts)])) {
    add(c, n0(hold?.items?.[c]) - (gaveCounts[c] || 0));
  }
  for (const [c, n] of Object.entries(countsOf(got))) add(c, n);
  const currants = n0(hold?.currants) - gave.currants + got.currants;
  const tools = got.items.filter((it) => Number.isInteger(it.r)).map((it) => ({ c: it.c, r: it.r }));
  return { pack, currants, tools };
}

/** TradeDialog.as complete() 655-700: "You traded Bo 3 Apples, 50 currants for 7 Cherries". */
export function completeLine(name, gave, got, table, label) {
  const side = (g) => {
    const goods = normalizeGoods(g);
    const parts = Object.entries(countsOf(goods)).map(([c, n]) => countLabel(c, n, table, label));
    if (goods.currants) parts.push(currantsLabel(goods.currants));
    return parts.length ? parts.join(', ') : TRADE_TEXT.nothing;
  };
  return `You traded ${name} ${side(gave)} for ${side(got)}`;
}

/**
 * The trade window's lines for one side's change (TradeDialog.as addItem 471,
 * changeItem 515, removeItem 556, currants 568-576), by class totals.
 * who is "You" or the other player's name.
 */
export function changeLines(who, before, after, table, label) {
  const lines = [];
  const a = countsOf(before);
  const b = countsOf(after);
  for (const c of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const was = a[c] || 0;
    const now = b[c] || 0;
    if (was === now) continue;
    if (!was) lines.push(`${who} added ${countLabel(c, now, table, label)}`);
    else if (!now) lines.push(`${who} removed ${countLabel(c, was, table, label)}`);
    else lines.push(`${who} changed the amount from ${was.toLocaleString('en-US')} to ${countLabel(c, now, table, label)}`);
  }
  const was = n0(before?.currants);
  const now = n0(after?.currants);
  if (was !== now) {
    const unit = now === 1 ? 'currant' : 'currants';
    if (!now) lines.push(`${who} removed all of the currants`);
    else if (!was) lines.push(`${who} added ${now.toLocaleString('en-US')} ${unit}`);
    else lines.push(`${who} changed the amount from ${was.toLocaleString('en-US')} to ${now.toLocaleString('en-US')} ${unit}`);
  }
  return lines;
}

/** inc_trading.js rollback 326-335: "Your 3 Apples and 1 Pick have been returned to you." ('' when no items). */
export function returnedLine(counts, table, label) {
  const parts = Object.entries(counts || {}).filter(([, n]) => n > 0).map(([c, n]) => countLabel(c, n, table, label));
  if (!parts.length) return '';
  // common.js:765 pretty_list(list, ' and '); 'has' for one entry, as the source counts entries.
  const verb = parts.length === 1 ? 'has' : 'have';
  const last = parts.pop();
  const list = parts.length ? `${parts.join(', ')} and ${last}` : last;
  return `Your ${list} ${verb} been returned to you.`;
}

/** /trade <name>: { kind: 'start', name } | { kind: 'usage' } | null. */
export function tradeCommand(text) {
  const m = /^\/trade(?:\s+(.*))?$/i.exec(String(text || '').trim());
  if (!m) return null;
  const name = String(m[1] || '').replace(/\s+/g, ' ').trim();
  return name ? { kind: 'start', name: name.slice(0, 64) } : { kind: 'usage' };
}

/** A saved trade slice (feature save()), cleaned. */
export function normalizeSlice(slice) {
  const hold = slice?.hold;
  let h = null;
  if (hold && typeof hold.trade === 'string' && /^[a-z0-9-]{1,40}$/.test(hold.trade)) {
    const items = {};
    for (const [c, n] of Object.entries(hold.items || {})) if (typeof c === 'string' && n0(n)) items[c] = n0(n);
    h = {
      trade: hold.trade,
      with: { id: n0(hold.with?.id), name: String(hold.with?.name || 'A Glitch').slice(0, 64) },
      items,
      currants: n0(hold.currants),
    };
  }
  const applied = (Array.isArray(slice?.applied) ? slice.applied : []).filter((t) => typeof t === 'string' && t.length <= 40).slice(-APPLIED_KEEP);
  return { hold: h, applied };
}

export function holdEmpty(hold) {
  return !hold || (!n0(hold.currants) && !Object.values(hold.items || {}).some((n) => n > 0));
}
