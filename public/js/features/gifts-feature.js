/**
 * Giving things to another player in multiplayer (register G332): the pack's
 * Give verb, a written Note given with its writing, and the Gift Box you
 * wrap, give and the receiver unwraps. The server is
 * groddle-afternoon-server/gifts.go (its header lists the messages and the
 * source rules); the site's ledger moves the goods (src/LedgerGift.php); the
 * pure rules and words are js/gifts.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature does nothing: no verbs, no windows, no save slice.
 *
 * - Click another player's Glitch for Give (the player menu, extended
 *   through verbOverride as trade-feature does), or a pack item's Give to…:
 *   the Give window picks who (the players on your street) and what (a
 *   stack and how many, a written note, a wrapped Gift Box). Nothing leaves
 *   the pack until the server says the site's ledger moved it (gift_given);
 *   the receiver's game adds it on gift_got. Each applies the op once
 *   through the trade slice's applied list (ledgerReceipt), and on every
 *   connect asks the site for gives it has not applied (a missed answer).
 * - A Wrappable Gift Box in the pack: Wrap (up to three stacks go inside),
 *   Recycle (four Sheets of Paper). A wrapped Gift Box: Unwrap, or give it.
 *   The wrapped boxes and what is inside live in this feature's slice; the
 *   pack holds one bag_gift_box_wrapped per box (Drop is refused for it).
 * - Counts: items_given:<class> for the giver ({ to, toLevel, count }: the
 *   QUESTS lane's kindly_randomness and hand-out quests read it), and
 *   items_received:<class> for the receiver (takeable.js 278-281).
 *
 * - Drag a pack stack onto another player's Glitch (the source's "Or, drag
 *   item to player"): the tip says Give, and the drop opens the Give window
 *   for that player with that stack picked (game.js asks packDragStart).
 *
 * QA: canvas data giftState (none|open|wrap|sending), giftLast, giftBoxes,
 * giftDrag (none|dragging|over:<id>); window.groddleGifts.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, listPackSlots, removeItem } from '../inventory.js?v=catalog-unified-7';
import { TOOL_CONDITION_CATALOG, getToolCondition, setToolRemaining } from '../tools.js?v=woodcutting-test-8';
import { createMinnAccount } from '../minn-account.js?v=nbhome-10';
// The same key as features/index.js: one module instance holds the carried notes.
import { giveCarriedNote, takeCarriedNote, writtenCarriedNotes } from './street-furniture-feature.js?v=g448-4';
import {
  BOX_SLOTS,
  GIFT_BOX,
  GIFT_NOTE,
  GIFT_PAPER,
  GIFT_TEXT,
  GIFT_WRAPPED,
  RECYCLE_PAPER,
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
} from '../gifts.js?v=g332-1';

export const GIFTS_FEATURE_ID = 'gifts';
export const GIFT_VERB = 'gift_give';
const TABLE_URL = 'assets/content/trade-items.json';
const SYNC_EVERY_MS = 60000;

let slice = normalizeGiftsSlice(null);
let multiplayer = false;

const STYLE = `
.gift-win { position: fixed; z-index: 75; left: 50%; top: 10vh; transform: translateX(-50%); width: min(520px, calc(100vw - 32px)); max-height: 82vh; overflow-y: auto;
  border-radius: 12px; background: #fffdf6; color: #302b34; box-shadow: 0 10px 30px rgba(28, 25, 31, 0.35), 0 0 0 1px rgba(116, 80, 142, 0.18); font: 13px/1.4 system-ui, sans-serif; pointer-events: auto; }
.gift-win[hidden] { display: none; }
.gift-head { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.8rem 0.9rem 0.3rem; }
.gift-head h2 { margin: 0; font: 700 16px/1.25 'Trebuchet MS', system-ui, sans-serif; color: #4b2f63; }
.gift-head p { margin: 0.15rem 0 0; color: #6b6460; font-size: 12px; }
.gift-x { margin-left: auto; border: 0; background: transparent; font: 700 18px/1 system-ui; color: #8d8781; cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 6px; }
.gift-x:hover { background: #f1ecf5; color: #4b2f63; }
.gift-sec { padding: 0.35rem 0.9rem 0; }
.gift-sec h3 { margin: 0 0 0.3rem; font: 700 12px/1.3 system-ui; color: #5a4a3a; }
.gift-list { display: flex; flex-wrap: wrap; gap: 0.3rem; max-height: 9.5rem; overflow-y: auto; }
.gift-list button { display: inline-flex; align-items: center; gap: 0.25rem; font: 600 11.5px/1.2 system-ui; border: 0; border-radius: 999px; padding: 0.18rem 0.55rem 0.18rem 0.22rem; cursor: pointer; color: #3a3340; background: #f1ecf5; box-shadow: inset 0 0 0 1px #d6c8e2; max-width: 100%; }
.gift-list button.is-who { padding: 0.25rem 0.7rem; }
.gift-list button img { width: 22px; height: 22px; object-fit: contain; }
.gift-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gift-list button[aria-pressed="true"] { background: #74508e; color: #fff; box-shadow: none; }
.gift-list button[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
.gift-none { color: #8d8781; font-size: 12px; }
.gift-count { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.9rem 0; font-size: 12px; color: #5a4a3a; }
.gift-count[hidden] { display: none; }
.gift-count button { font: 700 12px/1 system-ui; border: 0; border-radius: 6px; min-width: 1.6rem; height: 1.5rem; cursor: pointer; color: #3a3340; background: #efe7da; }
.gift-count output { min-width: 4.5rem; text-align: center; font-weight: 700; }
.gift-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
.gift-slot { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 4.2rem; border-radius: 8px; background: #fffaf0; box-shadow: inset 0 0 0 1px #e6dccb; padding: 0.2rem; font-size: 11px; text-align: center; }
.gift-slot img { width: 32px; height: 32px; object-fit: contain; }
.gift-slot .gift-tools { display: flex; gap: 0.15rem; margin-top: 0.15rem; }
.gift-slot button { font: 700 11px/1 system-ui; border: 0; border-radius: 5px; width: 1.25rem; height: 1.15rem; cursor: pointer; color: #3a3340; background: #efe7da; }
.gift-slot.is-empty { color: #b7ab98; font-size: 18px; }
.gift-status { margin: 0.5rem 0.9rem 0; min-height: 1.2em; font-size: 12px; color: #4a4450; }
.gift-status.is-error { color: #a33b25; }
.gift-foot { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.9rem 0.8rem; justify-content: flex-end; flex-wrap: wrap; }
.gift-foot button { font: 700 12.5px/1.2 system-ui; border: 0; border-radius: 999px; padding: 0.42rem 0.95rem; cursor: pointer; color: #fff; background: #74508e; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
.gift-foot button.is-quiet { color: #3a3340; background: #efe7da; }
.gift-foot button:disabled { opacity: 0.5; cursor: default; }
.gift-drag-tip { position: fixed; z-index: 76; pointer-events: none; transform: translate(14px, 10px); padding: 0.2rem 0.55rem; border-radius: 6px; background: #fffdf6; color: #302b34;
  box-shadow: 0 2px 6px rgba(28, 25, 31, 0.3); font: 700 12px/1.3 system-ui, sans-serif; white-space: nowrap; }
.gift-drag-tip[hidden] { display: none; }
.gift-drag-tip.is-no { color: #cc0000; }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function itemLabel(c, n = 1) {
  const meta = ITEM_CATALOG[c];
  if (!meta) return String(c).replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  return n === 1 ? meta.label : meta.namePlural || meta.label;
}

function iconFor(c) {
  return ITEM_CATALOG[c]?.icon || itemIcon(c);
}

function icon(c) {
  const img = el('img', { src: iconFor(c), alt: '' });
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
  return img;
}

/** The source's names and words for the two Gift Box classes, for the pack (multiplayer only). */
function ensureGiftItems() {
  if (!ITEM_CATALOG[GIFT_BOX] || ITEM_CATALOG[GIFT_BOX].label !== 'Wrappable Gift Box') {
    ensureItem(GIFT_BOX, { label: 'Wrappable Gift Box', namePlural: 'Wrappable Gift Boxes', desc: "An empty box, filled with promise. Not really, it's filled with nothing, but once someone (the gifter) fills it with something (the gift), wraps it, and gives it to another (the giftee) it will be filled with joy. Each box can take three stacks of joy (or three stacks of anything, in fact).", baseCost: 400, stackMax: 1 });
  }
  ensureItem(GIFT_WRAPPED, { label: 'Gift Box', namePlural: 'Gift Boxes', desc: "One mystery surprise gift box, filled with… well, filled with gifts. But what gifts? There's only one way to find out… No, not asking the person who gave it to you. The OTHER, non-spoilerific way. Open it!", stackMax: 1, sellable: false, donatable: false, tags: ['no_rube', 'glitchmas', 'toys'] });
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  let table = null;
  let tableLoading = null;
  /** The Give window: { to: { id, name } | null, pick: { kind, c, n, noteId?, boxId? } | null }. */
  let give = null;
  /** The Wrap window: { picks: [{ c, n }] }. */
  let wrap = null;
  /** ref -> what the give took out of the pack, until gift_given. */
  const sending = new Map();
  let lastLine = '';
  let syncing = false;
  let syncedAt = 0;
  let refN = 0;

  ensureGiftItems();

  function loadTable() {
    if (table || tableLoading) return tableLoading;
    tableLoading = fetch(TABLE_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        table = t && t.items ? t : { items: {}, untradeable: {} };
        render();
      })
      .catch(() => { tableLoading = null; });
    return tableLoading;
  }
  loadTable();

  // —— UI ——
  const style = el('style', { id: 'gift-css' });
  style.textContent = STYLE;
  document.head.append(style);

  const win = el('section', { class: 'gift-win', hidden: true, role: 'dialog', 'aria-label': 'Give', 'data-gift-window': '' });
  const title = el('h2', { 'data-gift-title': '' });
  const sub = el('p', { 'data-gift-sub': '' });
  const closeBtn = el('button', { type: 'button', class: 'gift-x', 'aria-label': 'Close', 'data-gift-close': '' }, '×');
  const headText = el('div');
  headText.append(title, sub);
  const head = el('div', { class: 'gift-head' });
  head.append(headText, closeBtn);
  const whoSec = el('div', { class: 'gift-sec' });
  const whoList = el('div', { class: 'gift-list', 'data-gift-who': '' });
  whoSec.append(el('h3', {}, 'To'), whoList);
  const whatSec = el('div', { class: 'gift-sec' });
  const whatHead = el('h3', {}, 'What');
  const slotsBox = el('div', { class: 'gift-slots', 'data-gift-slots': '' });
  const whatList = el('div', { class: 'gift-list', 'data-gift-what': '' });
  whatSec.append(whatHead, slotsBox, whatList);
  const countRow = el('div', { class: 'gift-count', hidden: true });
  const minus = el('button', { type: 'button', 'aria-label': 'One fewer', 'data-gift-minus': '' }, '−');
  const countOut = el('output', { 'aria-live': 'polite', 'data-gift-count': '' });
  const plus = el('button', { type: 'button', 'aria-label': 'One more', 'data-gift-plus': '' }, '+');
  const allBtn = el('button', { type: 'button', 'data-gift-all': '' }, 'All');
  countRow.append(el('span', {}, 'How many'), minus, countOut, plus, allBtn);
  const status = el('p', { class: 'gift-status', 'aria-live': 'polite', 'data-gift-status': '' });
  const foot = el('div', { class: 'gift-foot' });
  const cancelBtn = el('button', { type: 'button', class: 'is-quiet', 'data-gift-cancel': '' }, 'Cancel');
  const goBtn = el('button', { type: 'button', 'data-gift-go': '' }, GIFT_TEXT.verb);
  foot.append(cancelBtn, goBtn);
  win.append(head, whoSec, whatSec, countRow, status, foot);
  document.body.append(win);

  closeBtn.addEventListener('click', () => close());
  cancelBtn.addEventListener('click', () => close());
  goBtn.addEventListener('click', () => (wrap ? doWrap() : send()));
  minus.addEventListener('click', () => setCount((give?.pick?.n || 1) - 1));
  plus.addEventListener('click', () => setCount((give?.pick?.n || 1) + 1));
  allBtn.addEventListener('click', () => setCount(Infinity));

  function publish() {
    engine.setData?.('giftState', wrap ? 'wrap' : give ? 'open' : sending.size ? 'sending' : 'none');
    engine.setData?.('giftLast', lastLine);
    engine.setData?.('giftBoxes', JSON.stringify(slice.boxes.map((b) => b.items.map((it) => `${it.c}:${it.n}`).join(','))));
  }

  function say(text, kind = '') {
    status.textContent = text || '';
    status.className = `gift-status${kind ? ` is-${kind}` : ''}`;
  }

  function others() {
    return (client.players || []).filter((p) => p && p.id).map((p) => ({ id: Number(p.id), name: String(p.name || 'A Glitch') }));
  }

  /** The pack's givable things: stacks, each written note, each wrapped box (ids not in a give under way). */
  function givables() {
    const out = [];
    const busyBoxes = new Set([...sending.values()].map((s) => s.boxId).filter(Boolean));
    const busyNotes = new Set([...sending.values()].map((s) => s.noteId).filter(Boolean));
    for (const row of listPackSlots(engine.inv || {})) {
      const c = row.classTsid;
      const have = countItem(engine.inv, c);
      if (have <= 0 || c === GIFT_WRAPPED) continue;
      if (c === GIFT_NOTE) {
        const written = writtenCarriedNotes(engine);
        for (const n of written) {
          if (!busyNotes.has(n.id)) out.push({ kind: 'note', c, n: 1, noteId: n.id, label: n.title || 'Note', reason: '' });
        }
        const blank = have - written.length;
        if (blank > 0) out.push({ kind: 'stack', c, n: 1, max: 1, label: 'A blank Note', reason: '' });
        continue;
      }
      const reason = table ? giveReason(c, table, ITEM_CATALOG[c]?.tags) : '';
      out.push({ kind: 'stack', c, n: 1, max: Math.min(have, stackMax(c, table)), label: itemLabel(c, have), have, reason });
    }
    slice.boxes.forEach((b) => {
      if (busyBoxes.has(b.id)) return;
      out.push({ kind: 'box', c: GIFT_WRAPPED, n: 1, boxId: b.id, label: b.from ? `Gift Box from ${b.from.name}` : 'Gift Box', reason: '' });
    });
    return out;
  }

  function sameThing(a, b) {
    return a && b && a.kind === b.kind && a.c === b.c && (a.noteId || '') === (b.noteId || '') && (a.boxId || '') === (b.boxId || '');
  }

  function render() {
    publish();
    if (!give && !wrap) {
      win.hidden = true;
      return;
    }
    win.hidden = false;
    if (wrap) return renderWrap();
    title.textContent = give.to ? `Give to ${give.to.name}` : 'Give';
    sub.textContent = GIFT_TEXT.verbTip;
    whoSec.hidden = false;
    const people = others();
    whoList.replaceChildren(...(people.length
      ? people.map((p) => {
        const b = el('button', { type: 'button', class: 'is-who', 'aria-pressed': String(give.to?.id === p.id), 'data-gift-to': String(p.id) }, p.name);
        b.addEventListener('click', () => { give.to = p; say(''); render(); });
        return b;
      })
      : [el('span', { class: 'gift-none' }, GIFT_TEXT.nobody)]));
    slotsBox.hidden = true;
    whatHead.textContent = 'What';
    const things = givables();
    whatList.replaceChildren(...(things.length
      ? things.map((t) => {
        const b = el('button', { type: 'button', 'aria-pressed': String(sameThing(give.pick, t)), 'aria-disabled': String(Boolean(t.reason)), title: t.reason || t.label, 'data-gift-item': t.c, ...(t.noteId ? { 'data-gift-note': t.noteId } : {}), ...(t.boxId ? { 'data-gift-box': t.boxId } : {}) });
        b.append(icon(t.c), el('span', {}, t.kind === 'stack' && t.have > 1 ? `${t.label} ×${t.have}` : t.label));
        b.addEventListener('click', () => {
          if (t.reason) return say(t.reason, 'error');
          const keep = sameThing(give.pick, t) ? give.pick.n : 1;
          give.pick = { ...t, n: Math.min(keep, t.max || 1) };
          say('');
          render();
        });
        return b;
      })
      : [el('span', { class: 'gift-none' }, 'Your pack is empty.')]));
    // A pick that left the pack (eaten, given) goes.
    if (give.pick && !things.some((t) => sameThing(t, give.pick))) give.pick = null;
    const p = give.pick;
    countRow.hidden = !(p && p.kind === 'stack' && (p.max || 1) > 1);
    if (p) countOut.textContent = `${p.n} of ${p.max || 1}`;
    goBtn.textContent = p && give.to ? `Give ${p.kind === 'box' ? 'the Gift Box' : p.kind === 'note' ? 'the note' : formatStack(p.c, p.n, table, itemLabel)}` : GIFT_TEXT.verb;
    goBtn.disabled = !p || !give.to || give.waiting;
  }

  function setCount(n) {
    const p = give?.pick;
    if (!p || p.kind !== 'stack') return;
    p.n = Math.max(1, Math.min(p.max || 1, n));
    render();
  }

  function open({ to = null, classTsid = null } = {}) {
    if (client.state !== 'online') {
      engine.toast?.("You're offline.", 2400);
      return true;
    }
    wrap = null;
    give = { to: to || null, pick: null };
    if (!give.to && others().length === 1) give.to = others()[0];
    if (classTsid) {
      const t = givables().find((x) => x.c === classTsid);
      if (t && !t.reason) give.pick = { ...t, n: t.kind === 'stack' ? Math.min(t.max || 1, 1) : 1 };
    }
    say('');
    render();
    return true;
  }

  function close() {
    give = null;
    wrap = null;
    render();
  }

  // —— Giving ——

  function send() {
    const p = give?.pick;
    const to = give?.to;
    if (!p || !to) return;
    if (!others().some((o) => o.id === to.id)) return say(GIFT_TEXT.nobody, 'error');
    const ref = p.kind === 'box' ? p.boxId : `g${Date.now().toString(36)}${(refN += 1)}`;
    let frame;
    if (p.kind === 'box') {
      const box = slice.boxes.find((b) => b.id === p.boxId);
      if (!box) return say('That Gift Box is gone.', 'error');
      frame = { to: to.id, ref, box: box.items.map((it) => ({ ...it })) };
    } else if (p.kind === 'note') {
      const note = writtenCarriedNotes(engine).find((n) => n.id === p.noteId);
      if (!note) return say('That note is gone.', 'error');
      frame = { to: to.id, ref, item: { c: GIFT_NOTE, n: 1 }, note: { title: note.title, body: note.body } };
    } else {
      const item = { c: p.c, n: Math.min(p.n, countItem(engine.inv, p.c)) };
      if (item.n < 1) return say("You don't have enough of that item.", 'error');
      if (TOOL_CONDITION_CATALOG[p.c] && engine.toolState) item.r = getToolCondition(engine.toolState, p.c).remaining;
      frame = { to: to.id, ref, item };
    }
    if (!client.send('gift_give', frame)) return say("You're offline.", 'error');
    sending.set(ref, { kind: p.kind, noteId: p.noteId || null, boxId: p.boxId || null, to, at: Date.now() });
    give.waiting = true;
    say('Giving…');
    render();
  }

  /** Takes one blank note out of the pack, keeping every written one (the pack drops the last note it carries). */
  function takeBlankNote() {
    const written = writtenCarriedNotes(engine);
    if (countItem(engine.inv, GIFT_NOTE) <= written.length) return false;
    const kept = written.map((n) => takeCarriedNote(engine, n.id)).filter(Boolean);
    removeItem(engine.inv, GIFT_NOTE, 1);
    for (const n of kept) giveCarriedNote(engine, n);
    return true;
  }

  /** One settled give, from the server's message or the site's list: true when it was applied now. */
  function apply(raw, side, level = null) {
    const gift = normalizeGift(raw, side);
    if (!gift) return false;
    if (engine.query?.('ledgerReceipt', gift.op, engine) !== true) return false;
    const fx = giftEffects(gift, { table, label: itemLabel, level });
    const inv = engine.inv;
    const blankNote = gift.side === 'gave' && gift.item?.c === GIFT_NOTE && !gift.note;
    for (const [c, d] of Object.entries(fx.pack)) {
      if (d > 0) addItem(inv, c, d);
      else if (blankNote && c === GIFT_NOTE) {
        if (!takeBlankNote()) removeItem(inv, c, Math.min(countItem(inv, c), -d));
      } else removeItem(inv, c, Math.min(countItem(inv, c), -d));
    }
    if (fx.tool && TOOL_CONDITION_CATALOG[fx.tool.c] && engine.toolState) {
      // As a trade does (trade-feature applyDone): a first one takes the giver's wear, one more keeps the more worn.
      const had = countItem(inv, fx.tool.c) - (fx.pack[fx.tool.c] || 0);
      const mine = getToolCondition(engine.toolState, fx.tool.c).remaining;
      setToolRemaining(engine.toolState, fx.tool.c, had > 0 ? Math.min(mine, fx.tool.r) : fx.tool.r);
    }
    if (fx.removeNote) {
      const n = writtenCarriedNotes(engine).find((x) => x.title === fx.removeNote.title && x.body === fx.removeNote.body);
      if (n) takeCarriedNote(engine, n.id);
      else if (countItem(inv, GIFT_NOTE) > 0) removeItem(inv, GIFT_NOTE, 1);
    }
    if (fx.addNote) giveCarriedNote(engine, fx.addNote);
    if (fx.removeBox) {
      const i = findBox(slice.boxes, fx.removeBox.ref, fx.removeBox.items);
      if (i >= 0) slice.boxes.splice(i, 1);
    }
    if (fx.addBox) slice.boxes.push(fx.addBox);
    for (const row of fx.counters) engine.achievement?.(row.counter, row.amount, row.detail);
    lastLine = fx.line;
    engine.pushActivity?.(fx.line);
    engine.toast?.(fx.line, 3200);
    engine.playSound?.(gift.side === 'gave' ? 'ITEM_GIVE' : 'ITEM_GIVEN_TO_YOU', { volume: 0.6 });
    engine.refreshPack?.();
    engine.save?.();
    publish();
    return true;
  }

  client.on('msg:gift_given', (msg) => {
    const ref = String(msg.ref || '');
    sending.delete(ref);
    if (give) give.waiting = false;
    if (msg.status !== 'settled') {
      const text = String(msg.text || "That didn't work.");
      lastLine = text;
      if (give) say(text, 'error');
      else engine.toast?.(text, 3200);
      engine.pushActivity?.(text);
      render();
      return;
    }
    apply(msg, 'gave', Number(msg.level) || null);
    if (give) {
      give.pick = null;
      say(lastLine);
    }
    render();
  });

  client.on('msg:gift_got', (msg) => {
    apply(msg, 'got');
    render();
  });

  client.on('state', ({ state } = {}) => {
    if (state === 'online') sync();
    else if (sending.size) {
      // The answer to a give under way is lost with the socket; the site's list brings a settled one back.
      sending.clear();
      if (give) give.waiting = false;
    }
    if (give || wrap) render();
  });

  client.on('roster', () => { if (give) render(); });

  /** The site's gives this save has not applied (a gift_given or gift_got that never arrived). */
  async function sync() {
    if (syncing) return;
    syncing = true;
    syncedAt = Date.now();
    try {
      const data = await account.gifts?.();
      if (!table) await loadTable();
      for (const row of Array.isArray(data?.gifts) ? data.gifts : []) {
        const waiting = sending.get(String(row.ref || ''));
        if (waiting && Date.now() - waiting.at < 20000) continue;
        apply(row, row.side === 'gave' ? 'gave' : 'got');
      }
    } catch (err) {
      console.warn('[gifts]', err?.message || err);
    } finally {
      syncing = false;
    }
  }
  sync();

  // —— Gift Boxes ——

  function renderWrap() {
    title.textContent = GIFT_TEXT.wrapTip;
    sub.textContent = 'Up to three stacks go inside. The one you give it to opens it.';
    whoSec.hidden = true;
    countRow.hidden = true;
    slotsBox.hidden = false;
    whatHead.textContent = 'Inside';
    const slots = wrap.picks.map((it, i) => {
      const slot = el('div', { class: 'gift-slot', 'data-gift-slot': String(i), 'data-class': it.c });
      const tools = el('div', { class: 'gift-tools' });
      const less = el('button', { type: 'button', 'aria-label': `One fewer ${itemLabel(it.c)}` }, '−');
      const more = el('button', { type: 'button', 'aria-label': `One more ${itemLabel(it.c)}` }, '+');
      const out = el('button', { type: 'button', 'aria-label': `Take the ${itemLabel(it.c, it.n)} out` }, '×');
      more.disabled = it.n >= Math.min(stackMax(it.c, table), countItem(engine.inv, it.c));
      less.addEventListener('click', () => { if (it.n > 1) it.n -= 1; else wrap.picks.splice(i, 1); render(); });
      more.addEventListener('click', () => { it.n += 1; render(); });
      out.addEventListener('click', () => { wrap.picks.splice(i, 1); render(); });
      tools.append(less, more, out);
      slot.append(icon(it.c), el('span', {}, `${it.n} ${itemLabel(it.c, it.n)}`), tools);
      return slot;
    });
    for (let i = wrap.picks.length; i < BOX_SLOTS; i += 1) slots.push(el('div', { class: 'gift-slot is-empty' }, '+'));
    slotsBox.replaceChildren(...slots);
    const rows = listPackSlots(engine.inv || {}).filter((r) => countItem(engine.inv, r.classTsid) > 0 && r.classTsid !== GIFT_BOX);
    whatList.replaceChildren(...rows.map((r) => {
      const c = r.classTsid;
      const reason = table ? boxReason(c, table, ITEM_CATALOG[c]?.tags) : '';
      const inBox = wrap.picks.some((p) => p.c === c);
      const b = el('button', { type: 'button', 'aria-disabled': String(Boolean(reason) || inBox), title: reason || `Put ${itemLabel(c, 2)} in`, 'data-gift-wrap-item': c });
      b.append(icon(c), el('span', {}, `${itemLabel(c, countItem(engine.inv, c))} ×${countItem(engine.inv, c)}`));
      b.addEventListener('click', () => {
        if (reason) return say(reason, 'error');
        if (inBox) return;
        if (wrap.picks.length >= BOX_SLOTS) return say(GIFT_TEXT.boxFull, 'error');
        wrap.picks.push({ c, n: Math.min(countItem(engine.inv, c), stackMax(c, table)) });
        say('');
        render();
      });
      return b;
    }));
    goBtn.textContent = GIFT_TEXT.wrap;
    goBtn.disabled = !wrap.picks.length;
  }

  function openWrap() {
    give = null;
    wrap = { picks: [] };
    say('');
    render();
    return true;
  }

  function doWrap() {
    if (!wrap) return;
    const picks = wrap.picks.map((p) => {
      const it = { c: p.c, n: p.n };
      if (TOOL_CONDITION_CATALOG[p.c] && engine.toolState) it.r = getToolCondition(engine.toolState, p.c).remaining;
      return it;
    });
    const out = wrapBox(slice, picks, (c) => countItem(engine.inv, c), table, (c) => ITEM_CATALOG[c]?.tags || []);
    if (!out.ok) return say(out.error, 'error');
    for (const [c, d] of Object.entries(out.pack)) {
      if (d > 0) addItem(engine.inv, c, d);
      else removeItem(engine.inv, c, -d);
    }
    slice.boxes.push(out.box);
    slice.next = out.next;
    lastLine = GIFT_TEXT.wrapped;
    engine.pushActivity?.(GIFT_TEXT.wrapped);
    engine.toast?.(GIFT_TEXT.wrapped, 3200);
    engine.refreshPack?.();
    engine.save?.();
    close();
  }

  function unwrapOne() {
    const box = slice.boxes[0];
    if (!box || countItem(engine.inv, GIFT_WRAPPED) < 1) return false;
    slice.boxes.shift();
    for (const [c, d] of Object.entries(unwrapPack(box))) {
      if (d > 0) addItem(engine.inv, c, d);
      else removeItem(engine.inv, c, Math.min(countItem(engine.inv, c), -d));
    }
    for (const it of box.items) {
      if (it.r != null && TOOL_CONDITION_CATALOG[it.c] && engine.toolState) {
        const mine = getToolCondition(engine.toolState, it.c).remaining;
        setToolRemaining(engine.toolState, it.c, countItem(engine.inv, it.c) > it.n ? Math.min(mine, it.r) : it.r);
      }
    }
    const growl = unwrapGrowl(box.items, table, itemLabel);
    lastLine = growl;
    engine.pushActivity?.(growl);
    engine.toast?.(growl, 4200);
    engine.refreshPack?.();
    engine.save?.();
    publish();
    return true;
  }

  function recycle() {
    engine.prompt?.({
      text: GIFT_TEXT.recycleAsk,
      modal: true,
      choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
      onChoice: (v) => {
        if (v !== 'yes' || countItem(engine.inv, GIFT_BOX) < 1) return;
        removeItem(engine.inv, GIFT_BOX, 1);
        addItem(engine.inv, GIFT_PAPER, RECYCLE_PAPER);
        lastLine = GIFT_TEXT.recycled;
        engine.pushActivity?.(GIFT_TEXT.recycled);
        engine.toast?.(GIFT_TEXT.recycled, 3200);
        engine.refreshPack?.();
        engine.save?.();
        publish();
      },
    });
    return true;
  }

  // —— Drag a pack item onto another player (the source's "Or, drag item to player") ——
  // glitch-client DragVO.as findDragTargetForStack 148-155: a giveable stack dragged over a
  // player's Glitch targets them; LocationInputHandler.as 531-537 and 692-697 show "Give" (or, for a
  // soulbound one, "You can't give this item away!" in red), and a drop there (633-638, 848-853) opens
  // the give "as if they had already chosen give and an itemstack".
  let drag = null;
  let dragWired = false;
  const tip = el('div', { class: 'gift-drag-tip', hidden: true, 'data-gift-drag-tip': '' });
  document.body.append(tip);

  function canvasEl() {
    return document.querySelector('canvas[aria-label="Groddle game world"]');
  }

  /** The other player whose Glitch is under a client point, or null. */
  function playerAt(clientX, clientY) {
    const canvas = canvasEl();
    const remotes = globalThis.groddleRealtime?.remotes;
    if (!canvas || !remotes?.entries) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const res = Number(canvas.dataset.renderResolution) || 1;
    const sx = ((clientX - rect.left) * (canvas.width / res)) / rect.width;
    const sy = ((clientY - rect.top) * (canvas.height / res)) / rect.height;
    const people = others();
    for (const [id, r] of remotes.entries()) {
      const p = people.find((o) => o.id === Number(id));
      if (!p || !r?.root || r.root.destroyed) continue;
      const b = r.root.getBounds();
      if (sx >= b.x - 8 && sx <= b.x + b.width + 8 && sy >= b.y - 8 && sy <= b.y + b.height + 8) return p;
    }
    return null;
  }

  function dragTip(text, no, x, y) {
    if (!text) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = text;
    tip.classList.toggle('is-no', Boolean(no));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function endDrag() {
    drag = null;
    dragTip('');
    engine.setData?.('giftDrag', 'none');
  }

  function wireDrag() {
    const canvas = canvasEl();
    if (dragWired || !canvas) return Boolean(canvas);
    dragWired = true;
    canvas.addEventListener('dragover', (event) => {
      if (!drag) return;
      const p = playerAt(event.clientX, event.clientY);
      drag.over = p;
      engine.setData?.('giftDrag', p ? `over:${p.id}` : 'dragging');
      if (!p) return dragTip('');
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      dragTip(drag.soulbound ? "You can't give this item away!" : GIFT_TEXT.verb, drag.soulbound, event.clientX, event.clientY);
    });
    canvas.addEventListener('dragleave', () => { if (drag) dragTip(''); });
    canvas.addEventListener('drop', (event) => {
      if (!drag) return;
      const p = playerAt(event.clientX, event.clientY) || drag.over;
      const c = drag.c;
      const soulbound = drag.soulbound;
      endDrag();
      if (!p) return;
      event.preventDefault();
      if (soulbound) return;
      open({ to: p, classTsid: c });
    });
    document.addEventListener('dragend', () => { if (drag) endDrag(); });
    return true;
  }

  /** game.js's pack slot dragstart (the vendor closed): true when the drag may go on. */
  function startDrag(classTsid, event) {
    const c = String(classTsid || '');
    if (client.state !== 'online' || !others().length || c === GIFT_WRAPPED || !wireDrag()) return false;
    const reason = table ? giveReason(c, table, ITEM_CATALOG[c]?.tags) : '';
    // Only a giveable stack targets a player (DragVO.as:148 item.giveable); a soulbound one shows the red tip.
    if (reason && reason !== GIFT_TEXT.soulbound) return false;
    drag = { c, soulbound: reason === GIFT_TEXT.soulbound, over: null };
    engine.setData?.('giftDrag', 'dragging');
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-groddle-item', c);
      event.dataTransfer.setData('text/plain', c);
    }
    return true;
  }

  publish();

  return {
    client,
    startDrag,
    playerAt,
    get drag() { return drag; },
    get give() { return give; },
    get wrap() { return wrap; },
    get boxes() { return slice.boxes; },
    get table() { return table; },
    get sending() { return [...sending.keys()]; },
    open,
    close,
    openWrap,
    unwrapOne,
    recycle,
    sync,
    others,
    givables,
    tick(now) {
      // The pack can change under an open window; the slice keeps no more boxes than the pack shows.
      if (give || wrap) {
        const key = JSON.stringify(engine.inv);
        if (key !== this._packKey) {
          this._packKey = key;
          render();
        }
      }
      const wrapped = countItem(engine.inv, GIFT_WRAPPED);
      if (slice.boxes.length > wrapped && !sending.size) slice.boxes.length = wrapped;
      if (now - syncedAt > SYNC_EVERY_MS && client.state === 'online') sync();
    },
  };
}

let session = null;
let guard = false;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleGifts = session;
  return session;
}

function hasPlayersHere() {
  return (session?.others() || []).length > 0;
}

export const giftsFeature = {
  id: GIFTS_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(Date.now());
  },

  /** QUESTS (G329): the hand-out quests are offered once a Give to a player works. */
  playerGiveReady(engine) {
    return engine?.mode === 'multiplayer' && session ? true : null;
  },

  /** Another player's Glitch: its menu plus Give (takeable.js give: requires_target_pc). */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== GIFT_VERB), { id: GIFT_VERB, label: GIFT_TEXT.verb, tooltip: GIFT_TEXT.verbTip, enabled: true, reason: '', durationMs: 0, sort: 190 }];
  },

  runVerbOverride(target, verbId) {
    if (verbId !== GIFT_VERB || !session || !target?.playerId) return null;
    return session.open({ to: { id: Number(target.playerId), name: String(target.label || target.name || 'A Glitch') } });
  },

  /** game.js pack slot dragstart: dragging a stack toward another player on the street (DragVO.as). */
  packDragStart(classTsid, event, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.startDrag(classTsid, event) ? true : null;
  },

  /** The pack popover: Give to…, and the Gift Box's own verbs. */
  packVerbs(classTsid, engine) {
    if (!multiplayer || !session) return null;
    const c = String(classTsid || '');
    const out = [];
    if (c === GIFT_BOX) {
      out.push({ id: 'gift_wrap', label: GIFT_TEXT.wrap, enabled: true, reason: '', tooltip: GIFT_TEXT.wrapTip });
      out.push({ id: 'gift_recycle', label: GIFT_TEXT.recycle, enabled: true, reason: '', tooltip: GIFT_TEXT.recycleTip });
    }
    if (c === GIFT_WRAPPED) {
      const ok = session.boxes.length > 0;
      out.push({ id: 'gift_unwrap', label: GIFT_TEXT.unwrap, enabled: ok, reason: ok ? '' : 'There is nothing in it.', tooltip: GIFT_TEXT.unwrapTip, primary: true });
    }
    const reason = session.table ? giveReason(c, session.table, ITEM_CATALOG[c]?.tags) : '';
    if (!reason) {
      const here = hasPlayersHere();
      out.push({ id: 'gift_give_to', label: GIFT_TEXT.packVerb, enabled: here, reason: here ? '' : GIFT_TEXT.nobody, tooltip: GIFT_TEXT.verbTip });
    }
    return out;
  },

  runPackVerb(classTsid, verbId) {
    if (!session) return false;
    if (verbId === 'gift_give_to') return session.open({ classTsid });
    if (verbId === 'gift_wrap') return session.openWrap();
    if (verbId === 'gift_unwrap') return session.unwrapOne();
    if (verbId === 'gift_recycle') return session.recycle();
    return false;
  },

  /** A wrapped Gift Box keeps its contents with it: give it or unwrap it, never drop it. */
  packDropBlockReason(classTsid) {
    return multiplayer && classTsid === GIFT_WRAPPED ? GIFT_TEXT.noDrop : null;
  },

  save() {
    if (!multiplayer || !slice.boxes.length) return undefined;
    return { boxes: slice.boxes, next: slice.next };
  },

  restore(s, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    slice = multiplayer ? normalizeGiftsSlice(s) : normalizeGiftsSlice(null);
  },
};
