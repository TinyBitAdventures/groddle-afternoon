/**
 * Giving things to another player in multiplayer (register G332): the pure
 * rules and words. features/gifts-feature.js draws the windows and talks to
 * the realtime server (groddle-afternoon-server gifts.go, whose header lists
 * the messages); the site's ledger moves the goods (groddle-afternoon-site
 * src/LedgerGift.php). Solo never reads this file.
 *
 * Sources (glitch-GameServerJS):
 * - items/include/takeable.js takeable_give_conditions 220-246 (soulbound
 *   222, quest items 235) and takeable_give 248-292: the words both players
 *   read (272-273), items_given / items_received (278-281), and
 *   kindly_randomness's give_player_level1 (283-289). item.js:607-611
 *   formatStack ("a Cherry", "3 Cherries").
 * - items/bag_gift_box.js: wrap 254-297 (its words 295), recycle 221-252
 *   and modal_callback 674-682 (four Sheets of Paper), canContain 666-672
 *   with bag_generic's parent_canContain 719-721, capacity 3 (onCreate 687).
 * - items/bag_gift_box_wrapped.js unwrap 419-484: the growl lists what was
 *   inside, or "nothing. Oh... that was mean!"; the box becomes a Wrappable
 *   Gift Box again (replaceWith('bag_gift_box'), 467).
 *
 * The gifts slice (systems.features.gifts in the save) keeps the wrapped
 * boxes: { boxes: [{ id, items: [{ c, n, r? }], from?: { id, name }, at }], next }.
 * The pack holds one bag_gift_box_wrapped per box. The site's ledger counts
 * each box as one bag_gift_box and what is inside (LedgerMath::holdings).
 */

export const GIFT_BOX = 'bag_gift_box';
export const GIFT_WRAPPED = 'bag_gift_box_wrapped';
export const GIFT_NOTE = 'note';
export const GIFT_PAPER = 'paper';
/** bag_gift_box.js onCreate 687. */
export const BOX_SLOTS = 3;
/** Wrapped boxes the slice keeps (LedgerGift::BOX_KEEP). */
export const BOX_KEEP = 40;
/** bag_gift_box.js modal_callback 677-678: the box and three more. */
export const RECYCLE_PAPER = 4;

export const GIFT_TEXT = Object.freeze({
  verb: 'Give',
  verbTip: 'Or, drag item to player', // every item's give verb tooltip
  packVerb: 'Give to…',
  soulbound: "This item is locked to you and can't be given to another player.", // takeable.js:222
  quest: "This item is needed for a quest and can't be given to another player.", // takeable.js:235
  cant: "That can't be given to another player.", // ours: the ledger does not carry it
  nobody: 'There is nobody here to give it to.', // ours
  gave: (name, stack) => `You gave ${name} ${stack}.`, // takeable.js:272
  got: (name, stack) => `${name} gave you ${stack}.`, // takeable.js:273
  wrap: 'Wrap',
  wrapTip: 'Wrap this Gift Box', // bag_gift_box.js:263
  wrapped: 'With the speed and vigor of the Glitchmas Yeti, you wrap the Gift Box into a nice little package.', // :295
  wrapEmpty: 'Put something in the Gift Box first.', // ours
  boxFull: 'A Gift Box holds three stacks.', // ours (capacity 3)
  unwrap: 'Unwrap',
  unwrapTip: 'Unwrap this Gift Box', // bag_gift_box_wrapped.js:428
  unwrapGrowl: 'You open your wonderfully wrapped Gift Box and receive ', // :431
  unwrapNothing: 'nothing. Oh... that was mean!', // :460
  recycle: 'Recycle',
  recycleTip: 'Recycle this Gift Box into Paper', // bag_gift_box.js:230
  recycleAsk: 'Are you sure you want to recycle this Wrappable Gift Box?', // :241 (this.label)
  recycled: 'You recycled a Wrappable Gift Box into 4 Sheets of Paper.', // :680
  noDrop: 'Give it to someone, or unwrap it first.', // ours: the box's contents live with the box
});

/** Pack items that a Gift Box cannot hold (bag_generic parent_canContain 719-721; canContain 667). */
const NO_BOX = /^(bag_|furniture_|element_)|^npc_crafty_bot$/;

const n0 = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const CLASS_RE = /^[a-z0-9_]{1,64}$/;
const REF_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** item.js formatStack: "a Cherry" for one (the item's article: a or an here), else "3 Cherries". */
export function formatStack(classTsid, n, table, label = (c) => c) {
  const row = table?.items?.[classTsid];
  const single = row?.name || label(classTsid, 1);
  const plural = row?.plural || label(classTsid, 2) || single;
  const count = Math.max(1, n0(n));
  if (count === 1) return `${/^[aeiou]/i.test(single) ? 'an' : 'a'} ${single}`;
  return `${count.toLocaleString('en-US')} ${plural}`;
}

/**
 * takeable_give_conditions for one class of the pack: '' when it can be
 * given, else the reason. table is trade-items.json (the classes the ledger
 * carries); tags the class's catalog tags.
 */
export function giveReason(classTsid, table, tags = []) {
  const c = String(classTsid || '');
  if (c === GIFT_WRAPPED) return '';
  if (Array.isArray(tags) && tags.includes('quest-item')) return GIFT_TEXT.quest;
  if (table?.items?.[c]) return '';
  return table?.untradeable?.[c] === 'soulbound' ? GIFT_TEXT.soulbound : GIFT_TEXT.cant;
}

/** Can a Gift Box hold this class (canContain)? Notes stay out (ours: a note's writing is given on its own). */
export function boxReason(classTsid, table, tags = []) {
  const c = String(classTsid || '');
  if (NO_BOX.test(c) || c === GIFT_WRAPPED) return "That won't fit in a Gift Box.";
  if (c === GIFT_NOTE) return 'Give a written note on its own.';
  return giveReason(c, table, tags);
}

/** The most of a class one give (or one box slot) takes: the class's stack, as the trade table says. */
export function stackMax(classTsid, table) {
  return Math.max(1, Math.min(9999, n0(table?.items?.[classTsid]?.max) || 1));
}

function cleanItem(raw) {
  const c = String(raw?.c ?? '');
  const n = n0(raw?.n);
  if (!CLASS_RE.test(c) || !n) return null;
  const out = { c, n };
  const r = Math.floor(Number(raw?.r));
  if (raw?.r != null && Number.isFinite(r) && r >= 0) out.r = r;
  return out;
}

function cleanFrom(raw) {
  const id = n0(raw?.id);
  return id ? { id, name: String(raw?.name || 'Someone').slice(0, 64) } : null;
}

/** The gifts slice, cleaned. */
export function normalizeGiftsSlice(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const boxes = [];
  for (const b of Array.isArray(s.boxes) ? s.boxes : []) {
    const id = String(b?.id || '');
    const items = (Array.isArray(b?.items) ? b.items : []).map(cleanItem).filter(Boolean).slice(0, BOX_SLOTS);
    if (!REF_RE.test(id)) continue;
    const box = { id, items, at: n0(b?.at) };
    const from = cleanFrom(b?.from);
    if (from) box.from = from;
    boxes.push(box);
  }
  return { boxes: boxes.slice(-BOX_KEEP), next: Math.max(1, n0(s.next) || boxes.length + 1) };
}

/**
 * Wrap: the Wrappable Gift Box and up to three stacks become one wrapped
 * box. picks: [{ c, n, r? }]; have(c) the pack's count. Returns
 * { ok, box, pack: { c: delta }, error }.
 */
export function wrapBox(slice, picks, have, table, tagsOf = () => []) {
  if (have(GIFT_BOX) < 1) return { ok: false, error: 'You need a Wrappable Gift Box.' };
  const items = [];
  for (const raw of Array.isArray(picks) ? picks : []) {
    const it = cleanItem(raw);
    if (!it) continue;
    const why = boxReason(it.c, table, tagsOf(it.c));
    if (why) return { ok: false, error: why };
    if (items.some((x) => x.c === it.c)) return { ok: false, error: 'One stack of each thing.' };
    if (it.n > stackMax(it.c, table) || it.n > have(it.c)) return { ok: false, error: "You don't have enough of that item." };
    items.push(it);
  }
  if (!items.length) return { ok: false, error: GIFT_TEXT.wrapEmpty };
  if (items.length > BOX_SLOTS) return { ok: false, error: GIFT_TEXT.boxFull };
  const box = { id: `w${slice.next}`, items, at: Date.now() };
  const pack = { [GIFT_BOX]: -1, [GIFT_WRAPPED]: 1 };
  for (const it of items) pack[it.c] = (pack[it.c] || 0) - it.n;
  return { ok: true, box, pack, next: slice.next + 1 };
}

/** unwrap: the growl, by the source's own joining (", " then " and " before the last). */
export function unwrapGrowl(items, table, label) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return GIFT_TEXT.unwrapGrowl + GIFT_TEXT.unwrapNothing;
  let growl = GIFT_TEXT.unwrapGrowl;
  list.forEach((it, i) => {
    if (i !== 0 && i === list.length - 1) growl += ' and ';
    else if (i !== 0) growl += ', ';
    growl += formatStack(it.c, it.n, table, label);
  });
  return growl;
}

/** What unwrapping one box does to the pack: { c: delta }. */
export function unwrapPack(box) {
  const pack = { [GIFT_WRAPPED]: -1, [GIFT_BOX]: 1 };
  for (const it of box?.items || []) pack[it.c] = (pack[it.c] || 0) + it.n;
  return pack;
}

/** A gift message or a site list row, cleaned: { op, side, with, item, box, note, ref }. */
export function normalizeGift(raw, side = null) {
  const op = String(raw?.op || '');
  if (!/^gift-[0-9a-f]{16}$/.test(op)) return null;
  const s = side || (raw?.side === 'gave' ? 'gave' : 'got');
  const withP = cleanFrom(s === 'gave' ? raw?.to || raw?.with : raw?.from || raw?.with) || { id: 0, name: 'Someone' };
  let item = null;
  let box = null;
  if (Array.isArray(raw?.box)) box = raw.box.map(cleanItem).filter(Boolean).slice(0, BOX_SLOTS);
  else if (raw?.item) item = cleanItem(raw.item);
  else if (Array.isArray(raw?.items)) {
    // The site lists the goods as the ledger moved them: a box is the bag_gift_box then what was inside.
    const items = raw.items.map(cleanItem).filter(Boolean);
    if (raw.box === true) box = items.filter((it, i) => !(i === 0 && it.c === GIFT_BOX)).slice(0, BOX_SLOTS);
    else item = items[0] || null;
  }
  if (!item && !box) return null;
  let note = null;
  if (item?.c === GIFT_NOTE && raw?.note && typeof raw.note === 'object') {
    note = { title: String(raw.note.title || '').slice(0, 150), body: String(raw.note.body || '').slice(0, 1000) };
  }
  const ref = REF_RE.test(String(raw?.ref || '')) ? String(raw.ref) : '';
  return { op, side: s, with: withP, item, box, note, ref };
}

/**
 * What one settled gift does to this player's game: { pack: { c: delta },
 * tool, addBox, removeBox, addNote, removeNote, line, counters }.
 * gift: normalizeGift; ctx: { table, label, level } (level: the receiver's, for the giver's quest).
 */
export function giftEffects(gift, { table, label, level = null } = {}) {
  const out = { pack: {}, tool: null, addBox: null, removeBox: null, addNote: null, removeNote: null, line: '', counters: [] };
  const name = gift.with.name;
  const gave = gift.side === 'gave';
  const sign = gave ? -1 : 1;
  let stack;
  let cls;
  if (gift.box) {
    cls = GIFT_WRAPPED;
    out.pack[GIFT_WRAPPED] = sign;
    stack = formatStack(GIFT_WRAPPED, 1, { items: { [GIFT_WRAPPED]: { name: 'Gift Box', plural: 'Gift Boxes' } } });
    if (gave) out.removeBox = { ref: gift.ref, items: gift.box };
    else out.addBox = { id: gift.op, items: gift.box, from: { id: gift.with.id, name }, at: Date.now() };
  } else {
    const it = gift.item;
    cls = it.c;
    stack = formatStack(it.c, it.n, table, label);
    if (it.c === GIFT_NOTE && gift.note) {
      if (gave) out.removeNote = gift.note;
      else out.addNote = { ...gift.note, lastEditor: `player:${gift.with.id}`, lastEdited: Math.floor(Date.now() / 1000) };
    } else {
      out.pack[it.c] = sign * it.n;
      if (!gave && it.r != null) out.tool = { c: it.c, r: it.r };
    }
  }
  out.line = gave ? GIFT_TEXT.gave(name, stack) : GIFT_TEXT.got(name, stack);
  const count = gift.box ? 1 : gift.item.n;
  if (gave) {
    const detail = { to: gift.with.id, count };
    const lvl = Number(level);
    if (Number.isFinite(lvl) && lvl > 0) detail.toLevel = lvl;
    out.counters.push({ counter: `items_given:${cls}`, amount: 1, detail });
  } else {
    out.counters.push({ counter: `items_received:${cls}`, amount: 1, detail: { from: gift.with.id, count } });
  }
  return out;
}

/** The box a gift_given names: by its id (ref), else the first with the same contents. */
export function findBox(boxes, ref, items) {
  if (ref) {
    const i = boxes.findIndex((b) => b.id === ref);
    if (i >= 0) return i;
  }
  const key = (list) => JSON.stringify([...(list || [])].map((it) => [it.c, it.n]).sort());
  return boxes.findIndex((b) => key(b.items) === key(items));
}
