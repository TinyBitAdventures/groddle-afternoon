/**
 * Trading in multiplayer (phase 4): two players on one street trade items
 * and currants in the original's trade window. The server is
 * groddle-afternoon-server/trade.go (its header lists the messages, the source rules and
 * the escrow guarantees); the pure rules and copy are js/trade.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature does nothing: no UI, no verbs, no save slice.
 *
 * - Click another player's Glitch for Offer to Trade (the player menu the
 *   party feature draws, extended through verbOverride), or type
 *   /trade <name>. The window opens for both players at once, as in the
 *   original (trading_request_start sends trade_start to the target).
 * - Your side: the pack strip (click, or drag onto the left column) puts a
 *   stack in a slot, each slot one stack up to the class's stackmax, six
 *   slots; - and + change a slot; the x takes it out; the currants field.
 *   "Looks good. Make offer..." accepts and locks your side; with the other
 *   side locked the button is "Confirm the trade"; Edit unlocks. Any change
 *   to either offer unlocks both (the server's rule). The x on the window
 *   cancels.
 * - Escrow: what you offer leaves the pack into the trade hold, which is
 *   saved with the character before the offer is sent; the hold returns on
 *   a cancel, a void (asked for on every connect while a hold is kept) or
 *   with whatever the trade did not take. On trade_done the hold minus what
 *   you gave comes back, what you got goes in, the save is written and only
 *   then the server hears trade_ack.
 * - Settling (G335): once both accept, the server asks the site's ledger to
 *   move both sides; until it answers the window shows "settling" (Edit and
 *   the x are off). A refusal arrives as a cancel plus the source's words.
 *
 * - Trade requests (G329, players/inc_requests.js; server requests.go):
 *   Menu, Make a trade offer tells the street "<name> is looking for someone
 *   to trade with." for 5 minutes (End trade takes it back); everyone there,
 *   and anyone arriving, gets it with Start negotiation!, which starts a
 *   trade with the requester (inc_requests.js:110-121).
 *
 * QA: canvas data tradeState (none|open|locked|settling|sealed), tradeWith,
 * tradeHold, tradeMine, tradeTheirs, tradeLast, tradeRequest (mine|''),
 * tradeRequestsHeard (requester ids); window.groddleTrade (request,
 * endRequest, acceptRequest).
 */

import { ITEM_CATALOG, addItem, countItem, itemIcon, listPackSlots, removeItem } from '../inventory.js?v=catalog-unified-7';
import { TOOL_CONDITION_CATALOG, getToolCondition, setToolRemaining } from '../tools.js?v=woodcutting-test-8';
import { saveStore } from '../save-store.js?v=mp2-2';
import { playOverlay } from '../overlays.js?v=g448-2';
import {
  APPLIED_KEEP,
  TRADE_SLOTS,
  TRADE_TEXT,
  addToGoods,
  backedBy,
  changeLines,
  completeLine,
  countsOf,
  currantsLabel,
  emptyGoods,
  holdEmpty,
  holdFor,
  n0,
  normalizeGoods,
  normalizeSlice,
  returnedLine,
  sameGoods,
  setSlot,
  settleDone,
  slotMax,
  tradeCommand,
  untradeableReason,
} from '../trade.js?v=g335-1';

export const TRADE_FEATURE_ID = 'trade';
export const TRADE_VERB = 'trade_start';
const SEND_DEBOUNCE_MS = 220;
const LOG_LINES = 40;
const TABLE_URL = 'assets/content/trade-items.json';
const BLOCKED_SAVES = new Set(['conflict', 'signed-out', 'error', 'offline']);

/**
 * G329 trade requests (players/inc_requests.js, the realtime server's requests.go):
 * "<name> is looking for someone to trade with." to the street for 5 minutes;
 * whoever accepts starts a trade with the requester.
 */
export const TRADE_REQUEST_TEXT = Object.freeze({
  menu: 'Make a trade offer', // ChatDropdown.as:100
  menuTip: 'Tell everyone on this street you are looking for someone to trade with',
  accept: 'Start negotiation!', // RightSideManager.as getActionLink
  end: 'End trade', // ActionRequestUI.as:78
  notNow: 'Not now',
});

/** The saved slice: { hold: { trade, with, items, currants } | null, applied: [tradeId] }. */
let saved = normalizeSlice(null);
let multiplayer = false;

const STYLE = `
/* Above overlay art (z 70, e.g. the Qurazy banner): a window in use is never covered by an effect. */
.trade-win { position: fixed; z-index: 75; left: 50%; top: 9vh; transform: translateX(-50%); width: min(660px, calc(100vw - 32px)); max-height: 84vh; overflow-y: auto;
  border-radius: 12px; background: #fffdf6; color: #302b34; box-shadow: 0 10px 30px rgba(28, 25, 31, 0.35), 0 0 0 1px rgba(116, 80, 142, 0.18); font: 13px/1.4 system-ui, sans-serif; pointer-events: auto; }
.trade-win[hidden] { display: none; }
.trade-head { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.8rem 0.9rem 0.4rem; }
.trade-head h2 { margin: 0; font: 700 16px/1.25 'Trebuchet MS', system-ui, sans-serif; color: #4b2f63; }
.trade-head p { margin: 0.15rem 0 0; color: #6b6460; font-size: 12px; }
.trade-head .trade-x { margin-left: auto; border: 0; background: transparent; font: 700 18px/1 system-ui; color: #8d8781; cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 6px; }
.trade-head .trade-x:hover { background: #f1ecf5; color: #4b2f63; }
.trade-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; padding: 0 0.9rem; }
.trade-side { position: relative; border-radius: 10px; padding: 0.5rem 0.55rem 0.6rem; background: #f6f1e7; box-shadow: inset 0 0 0 1px #e6dccb; min-height: 11rem; }
.trade-side h3 { margin: 0 0 0.35rem; font: 700 12.5px/1.3 system-ui, sans-serif; color: #5a4a3a; }
.trade-side[data-drop="true"] { box-shadow: inset 0 0 0 2px #74508e; background: #f1ecf5; }
.trade-cur { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.45rem; font-size: 12px; color: #5a4a3a; }
.trade-cur input { width: 7rem; font: inherit; padding: 0.15rem 0.35rem; border-radius: 6px; border: 1px solid #d9cdb8; background: #fff; }
.trade-cur b { color: #2e5a20; }
.trade-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
.trade-slot { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 4.4rem; border-radius: 8px; background: #fffaf0; box-shadow: inset 0 0 0 1px #e6dccb; padding: 0.2rem; }
.trade-slot img { width: 34px; height: 34px; object-fit: contain; image-rendering: auto; }
.trade-slot .trade-n { font: 700 11.5px/1.2 system-ui; color: #3a3340; }
.trade-slot .trade-name { font-size: 10.5px; color: #6b6460; text-align: center; line-height: 1.15; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trade-slot .trade-tools { display: flex; gap: 0.15rem; margin-top: 0.15rem; }
.trade-slot button { font: 700 11px/1 system-ui; border: 0; border-radius: 5px; width: 1.25rem; height: 1.15rem; cursor: pointer; color: #3a3340; background: #efe7da; }
.trade-slot button:disabled { opacity: 0.4; cursor: default; }
.trade-slot.is-empty { color: #b7ab98; font-size: 18px; }
.trade-lock { position: absolute; inset: 0; border-radius: 10px; background: rgba(95, 168, 58, 0.16); box-shadow: inset 0 0 0 2px rgba(95, 168, 58, 0.75); display: flex; align-items: flex-start; justify-content: flex-end; padding: 0.35rem 0.45rem; pointer-events: none; font: 700 11px/1 system-ui; color: #2e5a20; }
.trade-lock[hidden] { display: none; }
.trade-pack { padding: 0.55rem 0.9rem 0; }
.trade-pack h4 { margin: 0 0 0.3rem; font: 700 12px/1.3 system-ui; color: #5a4a3a; }
.trade-pack-list { display: flex; flex-wrap: wrap; gap: 0.3rem; max-height: 7.4rem; overflow-y: auto; }
.trade-pack-list button { display: inline-flex; align-items: center; gap: 0.25rem; font: 600 11.5px/1.2 system-ui; border: 0; border-radius: 999px; padding: 0.15rem 0.5rem 0.15rem 0.2rem; cursor: pointer; color: #3a3340; background: #f1ecf5; box-shadow: inset 0 0 0 1px #d6c8e2; }
.trade-pack-list button img { width: 22px; height: 22px; object-fit: contain; }
.trade-pack-list button[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
.trade-pack-list .trade-none { color: #8d8781; font-size: 12px; }
.trade-log { list-style: none; margin: 0.55rem 0.9rem 0; padding: 0.35rem 0.5rem; max-height: 6.5rem; overflow-y: auto; border-radius: 8px; background: #f8f5ee; color: #4a4450; font-size: 12px; }
.trade-log li { margin: 0.08rem 0; overflow-wrap: anywhere; }
.trade-log li.is-error { color: #a33b25; }
.trade-foot { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.9rem 0.8rem; flex-wrap: wrap; }
.trade-foot .trade-wait { color: #6b6460; font-style: italic; }
.trade-foot .trade-spacer { flex: 1 1 auto; }
.trade-foot button { font: 700 12.5px/1.2 system-ui; border: 0; border-radius: 999px; padding: 0.42rem 0.95rem; cursor: pointer; color: #fff; background: #74508e; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
.trade-foot button.is-quiet { color: #3a3340; background: #efe7da; }
.trade-foot button:disabled { opacity: 0.5; cursor: default; }
.trade-foot button[hidden] { display: none; }
.trade-win[data-state="sealed"] .trade-side { background: #eef6e4; box-shadow: inset 0 0 0 1px #b9d8a0; }
@media (max-width: 560px) { .trade-cols { grid-template-columns: 1fr; } .trade-win { top: 4vh; } }
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

/**
 * Writes the character's save now and waits for it to land: true once the
 * store says saved (a solo store has nothing to wait for).
 */
async function persist(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    let state;
    try {
      state = await saveStore.flush();
    } catch {
      return false;
    }
    const now = saveStore.state || state;
    if (now === 'saved') return true;
    if (BLOCKED_SAVES.has(now)) return false;
  }
  return saveStore.state === 'saved';
}

function createSession(engine, client) {
  let table = null;
  let tableLoading = null;
  /** The open trade, or null. */
  let open = null;
  let sendTimer = null;
  let lastLine = '';

  // —— Trade table (tools/build-realtime-trade.mjs) ——
  function loadTable() {
    if (table || tableLoading) return tableLoading;
    tableLoading = fetch(TABLE_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        table = t && t.items ? t : { items: {}, untradeable: {} };
        render();
      })
      .catch(() => {
        tableLoading = null;
      });
    return tableLoading;
  }

  // —— UI ——
  const style = el('style', { id: 'trade-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const win = el('section', { id: 'trade-window', class: 'trade-win', hidden: true, role: 'dialog', 'aria-label': 'Trade', 'data-trade-window': '' });
  const title = el('h2', { 'data-trade-title': '' });
  const sub = el('p', { 'data-trade-sub': '' });
  const closeBtn = el('button', { type: 'button', class: 'trade-x', 'aria-label': 'Cancel the trade', title: 'Cancel the trade', 'data-trade-close': '' }, '×');
  const headText = el('div');
  headText.append(title, sub);
  const head = el('div', { class: 'trade-head' });
  head.append(headText, closeBtn);
  const cols = el('div', { class: 'trade-cols' });
  const mineCol = el('div', { class: 'trade-side', 'data-trade-mine': '' });
  const theirsCol = el('div', { class: 'trade-side', 'data-trade-theirs': '' });
  cols.append(mineCol, theirsCol);
  const packBox = el('div', { class: 'trade-pack' });
  const packList = el('div', { class: 'trade-pack-list', 'data-trade-pack': '' });
  packBox.append(el('h4', {}, TRADE_TEXT.yourPack), packList);
  const logList = el('ol', { class: 'trade-log', 'aria-live': 'polite', 'data-trade-log': '' });
  const foot = el('div', { class: 'trade-foot' });
  const waitText = el('span', { class: 'trade-wait', hidden: true });
  const editBtn = el('button', { type: 'button', class: 'is-quiet', hidden: true, 'data-trade-edit': '' }, TRADE_TEXT.edit);
  const offerBtn = el('button', { type: 'button', 'data-trade-offer': '' }, TRADE_TEXT.offer);
  const doneBtn = el('button', { type: 'button', hidden: true, 'data-trade-done': '' }, TRADE_TEXT.done);
  foot.append(waitText, el('span', { class: 'trade-spacer' }), editBtn, offerBtn, doneBtn);
  win.append(head, cols, packBox, logList, foot);
  document.body.append(win);

  closeBtn.addEventListener('click', () => cancel());
  editBtn.addEventListener('click', () => unlock());
  offerBtn.addEventListener('click', () => accept());
  doneBtn.addEventListener('click', () => close());
  // Drag a pack stack onto your side.
  mineCol.addEventListener('dragover', (e) => {
    if (!open || open.sealed || open.mine.accepted) return;
    e.preventDefault();
    mineCol.dataset.drop = 'true';
  });
  mineCol.addEventListener('dragleave', () => { delete mineCol.dataset.drop; });
  mineCol.addEventListener('drop', (e) => {
    delete mineCol.dataset.drop;
    const c = e.dataTransfer?.getData('text/x-groddle-item');
    if (!c) return;
    e.preventDefault();
    addFromPack(c);
  });

  publish();

  function line(text, kind = '') {
    if (!text) return;
    lastLine = text;
    if (open) {
      open.lines.push({ text, kind });
      while (open.lines.length > LOG_LINES) open.lines.shift();
    }
    renderLog();
    publish();
  }

  function renderLog() {
    if (!open) return;
    logList.replaceChildren(...open.lines.map((l) => el('li', l.kind ? { class: `is-${l.kind}` } : {}, l.text)));
    logList.scrollTop = logList.scrollHeight;
  }

  function publish() {
    const state = !open ? 'none' : open.sealed ? 'sealed' : open.settling ? 'settling' : open.mine.accepted ? 'locked' : 'open';
    engine.setData?.('tradeState', state);
    engine.setData?.('tradeWith', open?.with.name || '');
    engine.setData?.('tradeHold', saved.hold ? JSON.stringify({ items: saved.hold.items, currants: saved.hold.currants }) : '');
    engine.setData?.('tradeMine', open ? JSON.stringify({ ...countsOf(open.draft), currants: open.draft.currants }) : '');
    engine.setData?.('tradeTheirs', open ? JSON.stringify({ ...countsOf(open.theirs.goods), currants: open.theirs.goods.currants }) : '');
    engine.setData?.('tradeLast', lastLine);
  }

  function slotNode(it, index, editable) {
    const slot = el('div', { class: 'trade-slot', 'data-trade-slot': String(index), 'data-class': it.c });
    const img = el('img', { src: iconFor(it.c), alt: '' });
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    slot.append(img, el('span', { class: 'trade-n' }, it.n.toLocaleString('en-US')), el('span', { class: 'trade-name', title: itemLabel(it.c, it.n) }, itemLabel(it.c, it.n)));
    if (editable) {
      const tools = el('div', { class: 'trade-tools' });
      const minus = el('button', { type: 'button', 'aria-label': `One fewer ${itemLabel(it.c)}`, 'data-trade-minus': String(index) }, '−');
      const plus = el('button', { type: 'button', 'aria-label': `One more ${itemLabel(it.c)}`, 'data-trade-plus': String(index) }, '+');
      const out = el('button', { type: 'button', 'aria-label': `Take the ${itemLabel(it.c, it.n)} out`, 'data-trade-remove': String(index) }, '×');
      plus.disabled = it.n >= slotMax(it.c, table) || available(it.c) <= 0;
      minus.addEventListener('click', () => editDraft(setSlot(open.draft, index, it.n - 1, table)));
      plus.addEventListener('click', () => editDraft(setSlot(open.draft, index, it.n + 1, table)));
      out.addEventListener('click', () => editDraft(setSlot(open.draft, index, 0, table)));
      tools.append(minus, plus, out);
      slot.append(tools);
    }
    return slot;
  }

  function sideNode(col, heading, goods, { editable, locked, lockLabel }) {
    const slots = el('div', { class: 'trade-slots' });
    goods.items.forEach((it, i) => slots.append(slotNode(it, i, editable)));
    for (let i = goods.items.length; i < TRADE_SLOTS; i += 1) slots.append(el('div', { class: 'trade-slot is-empty' }, editable ? '+' : ''));
    const cur = el('label', { class: 'trade-cur' });
    if (editable) {
      const input = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: String(goods.currants), 'data-trade-currants': '', 'aria-label': TRADE_TEXT.offerCurrants });
      input.addEventListener('change', () => {
        const v = n0(input.value);
        editDraft({ items: open.draft.items, currants: v });
      });
      cur.append(el('span', {}, TRADE_TEXT.offerCurrants), input);
    } else {
      cur.append(el('span', {}, TRADE_TEXT.currants), el('b', {}, goods.currants ? currantsLabel(goods.currants) : '0'));
    }
    const lock = el('div', { class: 'trade-lock', hidden: !locked }, lockLabel);
    col.replaceChildren(el('h3', {}, heading), cur, slots, lock);
  }

  /** What more of a class the pack can still put in (the pack, plus what the hold already keeps, minus the offer). */
  function available(c) {
    if (!open) return 0;
    return countItem(engine.inv, c) + n0(saved.hold?.items?.[c]) - (countsOf(open.draft)[c] || 0);
  }

  function renderPack() {
    if (!open || open.sealed) {
      packBox.hidden = true;
      return;
    }
    packBox.hidden = false;
    const editable = !open.mine.accepted;
    const rows = listPackSlots(engine.inv || {});
    const buttons = [];
    for (const row of rows) {
      const left = available(row.classTsid);
      if (left <= 0) continue;
      const reason = table ? untradeableReason(row.classTsid, table) : '';
      const b = el('button', {
        type: 'button',
        draggable: editable && !reason ? 'true' : 'false',
        'aria-disabled': String(Boolean(reason) || !editable),
        title: reason || `${TRADE_TEXT.add} ${itemLabel(row.classTsid, left)}`,
        'data-trade-pack-item': row.classTsid,
      });
      const img = el('img', { src: iconFor(row.classTsid), alt: '' });
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
      b.append(img, document.createTextNode(`${left.toLocaleString('en-US')} ${itemLabel(row.classTsid, left)}`));
      b.addEventListener('click', () => addFromPack(row.classTsid));
      b.addEventListener('dragstart', (e) => {
        if (reason || !editable) {
          e.preventDefault();
          return;
        }
        e.dataTransfer?.setData('text/x-groddle-item', row.classTsid);
      });
      buttons.push(b);
    }
    packList.replaceChildren(...(buttons.length ? buttons : [el('span', { class: 'trade-none' }, 'Nothing in your pack to trade.')]));
  }

  function render() {
    if (!open) {
      win.hidden = true;
      publish();
      return;
    }
    win.hidden = false;
    win.dataset.state = open.sealed ? 'sealed' : open.settling ? 'settling' : open.mine.accepted ? 'locked' : 'open';
    const name = open.with.name;
    if (open.sealed) {
      title.textContent = TRADE_TEXT.sealedTitle;
      sub.textContent = TRADE_TEXT.sealedSub(name);
      sideNode(mineCol, TRADE_TEXT.tradedMine, open.sealed.gave, { editable: false, locked: false });
      sideNode(theirsCol, TRADE_TEXT.tradedTheirs(name), open.sealed.got, { editable: false, locked: false });
    } else {
      title.textContent = TRADE_TEXT.title(name);
      sub.textContent = TRADE_TEXT.subtitle(name);
      const editable = !open.mine.accepted;
      sideNode(mineCol, TRADE_TEXT.mineHead, editable ? open.draft : open.mine.goods, { editable, locked: open.mine.accepted, lockLabel: 'Locked' });
      sideNode(theirsCol, TRADE_TEXT.theirsHead(name), open.theirs.goods, { editable: false, locked: open.theirs.accepted, lockLabel: 'Locked' });
    }
    renderPack();
    renderLog();
    const online = client.state === 'online';
    closeBtn.hidden = Boolean(open.sealed) || Boolean(open.settling);
    doneBtn.hidden = !open.sealed;
    offerBtn.hidden = Boolean(open.sealed) || open.mine.accepted;
    editBtn.hidden = Boolean(open.sealed) || !open.mine.accepted || Boolean(open.settling);
    waitText.hidden = Boolean(open.sealed) || !open.mine.accepted;
    waitText.textContent = open.settling ? TRADE_TEXT.settling : TRADE_TEXT.waiting(name);
    offerBtn.textContent = open.theirs.accepted ? TRADE_TEXT.confirm : TRADE_TEXT.offer;
    offerBtn.disabled = !online || open.closing;
    editBtn.disabled = !online || open.closing;
    publish();
  }

  // —— The hold (escrow) ——
  function heldCounts() {
    return saved.hold ? { items: { ...saved.hold.items }, currants: saved.hold.currants } : { items: {}, currants: 0 };
  }

  /** Move from the pack into the hold so it covers goods. False when the pack cannot. */
  function growHold(goods) {
    const want = holdFor([{ items: Object.entries(heldCounts().items).map(([c, n]) => ({ c, n })), currants: heldCounts().currants }, goods]);
    const have = heldCounts();
    const pc = engine.pc;
    for (const [c, n] of Object.entries(want.items)) {
      const more = n - (have.items[c] || 0);
      if (more > 0 && countItem(engine.inv, c) < more) return false;
    }
    if (want.currants - have.currants > n0(pc?.currants)) return false;
    if (!saved.hold) saved.hold = { trade: open.id, with: { ...open.with }, items: {}, currants: 0 };
    for (const [c, n] of Object.entries(want.items)) {
      const more = n - (have.items[c] || 0);
      if (more > 0) {
        removeItem(engine.inv, c, more);
        saved.hold.items[c] = n;
      }
    }
    const moreCur = want.currants - have.currants;
    if (moreCur > 0) {
      pc.currants -= moreCur;
      saved.hold.currants = want.currants;
    }
    engine.updateHud?.();
    return true;
  }

  /** Give back what no offer the server could still swap asks for. */
  function shrinkHold() {
    if (!open || !saved.hold || saved.hold.trade !== open.id) return;
    const want = holdFor([open.mine.goods, ...open.pending.values()]);
    let moved = false;
    for (const [c, n] of Object.entries(saved.hold.items)) {
      const extra = n - (want.items[c] || 0);
      if (extra > 0) {
        addItem(engine.inv, c, extra);
        moved = true;
        if (want.items[c]) saved.hold.items[c] = want.items[c];
        else delete saved.hold.items[c];
      }
    }
    const extraCur = saved.hold.currants - want.currants;
    if (extraCur > 0) {
      engine.pc.currants += extraCur;
      saved.hold.currants = want.currants;
      moved = true;
    }
    if (moved) {
      engine.updateHud?.();
      engine.save?.();
    }
  }

  /** Everything held goes back to the pack (cancel, void): the source's rollback prompt when items return. */
  function returnHold(tradeId) {
    const hold = saved.hold;
    if (!hold || (tradeId && hold.trade !== tradeId)) return;
    saved.hold = null;
    for (const [c, n] of Object.entries(hold.items)) if (n > 0) addItem(engine.inv, c, n);
    if (hold.currants > 0) engine.pc.currants += hold.currants;
    engine.updateHud?.();
    engine.save?.();
    const text = returnedLine(hold.items, table, itemLabel);
    if (text) {
      // inc_trading.js rollback 327-334: a prompt with OK, 5 s.
      engine.prompt?.({ text, choices: [{ label: TRADE_TEXT.ok, value: 'ok' }], timeout: 5 });
      engine.pushActivity?.(text);
    }
    publish();
  }

  // —— Offers ——
  function latestSent() {
    let v = 0;
    let g = null;
    for (const [pv, pg] of open.pending) if (pv > v) { v = pv; g = pg; }
    return g || open.mine.goods;
  }

  function editDraft(goods) {
    if (!open || open.sealed || open.mine.accepted) return;
    const why = backedBy(goods, engine.inv, engine.pc?.currants, saved.hold?.trade === open.id ? saved.hold : null);
    if (why) {
      line(why, 'error');
      render();
      return;
    }
    open.draft = normalizeGoods(goods);
    render();
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      sendTimer = null;
      sendNext();
    }, SEND_DEBOUNCE_MS);
  }

  function addFromPack(c) {
    if (!open || open.sealed || open.mine.accepted) return;
    if (!table) {
      loadTable();
      return;
    }
    const reason = untradeableReason(c, table);
    if (reason) {
      line(reason, 'error');
      return;
    }
    const left = available(c);
    if (left <= 0) {
      line(TRADE_TEXT.notEnough, 'error');
      return;
    }
    const tracked = TOOL_CONDITION_CATALOG[c] ? getToolCondition(engine.toolState, c).remaining : null;
    const { goods, added, reason: why } = addToGoods(open.draft, c, Math.min(left, slotMax(c, table)), table, { tool: tracked });
    if (!added) {
      line(why, 'error');
      return;
    }
    editDraft(goods);
  }

  /** Sends the draft when it differs from the last offer sent: hold first, saved, then the offer. */
  async function sendNext() {
    if (!open || open.sending || open.sealed || open.closing) return;
    const goods = open.draft;
    if (sameGoods(goods, latestSent())) return;
    open.sending = true;
    const trade = open.id;
    if (!growHold(goods)) {
      open.sending = false;
      line(TRADE_TEXT.notEnough, 'error');
      open.draft = latestSent();
      render();
      return;
    }
    render();
    const ok = await persist(engine);
    if (!open || open.id !== trade) return;
    open.sending = false;
    if (!ok) {
      line(TRADE_TEXT.saveFailed, 'error');
      engine.toast?.(TRADE_TEXT.saveFailed, 3200);
      cancel();
      return;
    }
    open.sentV = Math.max(open.sentV, open.mine.v) + 1;
    const v = open.sentV;
    open.pending.set(v, goods);
    if (!client.send('trade_offer', { trade, v, items: goods.items, currants: goods.currants })) {
      open.pending.delete(v);
      line(TRADE_TEXT.offline, 'error');
    }
    if (!sameGoods(open.draft, goods)) sendNext();
    else if (open.autoAccept) accept();
  }

  function accept() {
    if (!open || open.sealed || open.closing) return;
    if (open.sending || sendTimer || open.pending.size || !sameGoods(open.draft, open.mine.goods)) {
      // TradeDialog.as onOfferClick 837-850: an offer still on its way is accepted once it lands.
      open.autoAccept = true;
      if (sendTimer) {
        clearTimeout(sendTimer);
        sendTimer = null;
        sendNext();
      }
      return;
    }
    open.autoAccept = false;
    if (!client.send('trade_accept', { trade: open.id, mine: open.mine.v, seen: open.theirs.v })) line(TRADE_TEXT.offline, 'error');
  }

  function unlock() {
    if (!open || open.sealed) return;
    open.autoAccept = false;
    client.send('trade_unlock', { trade: open.id });
  }

  function cancel() {
    if (!open || open.sealed) return;
    open.closing = true;
    if (!client.send('trade_cancel', { trade: open.id })) {
      // Offline: the server ended it when the socket went; the hold comes back with the check on reconnect.
      close();
      return;
    }
    render();
  }

  // G383 inc_trading.js 188-205, 247: the other trader wears Tiny Speck's trading picture, 70 px,
  // 110 px over the head, until the trade ends (apiSendAnnouncementX: everyone but the wearer sees it).
  let tradingBubble = null;
  function showTradingBubble(withId) {
    tradingBubble?.stop();
    let last = null;
    tradingBubble = engine.PIXI ? playOverlay(engine.PIXI, 'trading', {
      layer: engine.fxLayer || engine.entityLayer,
      wh: 70,
      durationMs: 0,
      at: () => {
        const p = (client.players || []).find((x) => Number(x.id) === Number(withId));
        if (p) last = { x: Number(p.x) || 0, y: (Number(p.y) || 0) - 110 };
        return last || { x: -1e5, y: -1e5 };
      },
    }) : null;
  }

  function close() {
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    tradingBubble?.stop();
    tradingBubble = null;
    open = null;
    render();
  }

  // —— Trade requests (G329) ——
  /** Your open request's prompt uid (or '' when the prompt went), null when you have none. */
  let myRequest = null;
  /** Requests heard on this street: requester id -> prompt uid. */
  const heard = new Map();
  function requestData() {
    engine.setData?.('tradeRequest', myRequest !== null ? 'mine' : '');
    engine.setData?.('tradeRequestsHeard', [...heard.keys()].join(','));
  }
  function request() {
    if (!client.send('trade_request', {})) {
      engine.toast?.(TRADE_TEXT.offline, 2600);
      return false;
    }
    return true;
  }
  function endRequest() {
    return client.send('trade_request_cancel', {});
  }
  function acceptRequest(from) {
    const id = n0(from);
    if (!id) return false;
    if (open && !open.sealed) {
      engine.toast?.(TRADE_TEXT.busySelf, 2800);
      return false;
    }
    if (!holdEmpty(saved.hold)) {
      engine.toast?.(TRADE_TEXT.unsettled, 4200);
      client.send('trade_check', { trade: saved.hold.trade });
      return false;
    }
    loadTable();
    return client.send('trade_request_accept', { from: id });
  }
  const menu = document.getElementById?.('more-list');
  if (menu && !document.getElementById?.('trade-request-btn')) {
    const btn = el('button', { id: 'trade-request-btn', type: 'button', class: 'chrome-btn', title: TRADE_REQUEST_TEXT.menuTip, 'data-trade-request': '' }, TRADE_REQUEST_TEXT.menu);
    btn.addEventListener('click', () => request());
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(btn, before);
    else menu.append(btn);
  }

  client.on('msg:trade_requested', (msg) => {
    const from = n0(msg.from?.id);
    const text = String(msg.text || '');
    if (!from || !text) return;
    const timeout = Math.max(1, Math.min(300, n0(msg.timeout) || 300));
    if (msg.mine === true) {
      if (myRequest) engine.removePrompt?.(myRequest);
      // ActionRequestUI.as:76-83: your own line has End trade and the time left.
      myRequest = engine.prompt?.({
        text,
        choices: [{ label: TRADE_REQUEST_TEXT.end, value: 'end' }],
        timeout,
        onChoice: (v) => {
          myRequest = '';
          if (v === 'end') endRequest();
          requestData();
        },
        onTimeout: () => { myRequest = ''; },
      }) || '';
    } else {
      if (heard.has(from)) engine.removePrompt?.(heard.get(from));
      engine.pushActivity?.(text);
      const uid = engine.prompt?.({
        text,
        choices: [{ label: TRADE_REQUEST_TEXT.accept, value: 'accept' }, { label: TRADE_REQUEST_TEXT.notNow, value: 'no' }],
        timeout,
        onChoice: (v) => {
          heard.delete(from);
          requestData();
          if (v === 'accept') acceptRequest(from);
        },
        onTimeout: () => { heard.delete(from); requestData(); },
      });
      heard.set(from, uid || '');
    }
    requestData();
  });

  client.on('msg:trade_unrequested', (msg) => {
    const from = n0(msg.from);
    if (from && from === n0(client.me?.id)) {
      if (myRequest) engine.removePrompt?.(myRequest);
      myRequest = null;
    } else if (heard.has(from)) {
      const uid = heard.get(from);
      if (uid) engine.removePrompt?.(uid);
      heard.delete(from);
    }
    if (msg.text) engine.pushActivity?.(String(msg.text));
    requestData();
  });

  let requestStreet = '';
  client.on('roster', (r) => {
    const street = String(r?.street || '');
    if (street === requestStreet) return;
    requestStreet = street;
    // A new street: the requests heard on the last one are gone (location.js:895-950).
    for (const uid of heard.values()) if (uid) engine.removePrompt?.(uid);
    heard.clear();
    requestData();
  });

  // —— Starting ——
  function start(who) {
    if (open && !open.sealed) {
      engine.toast?.(TRADE_TEXT.busySelf, 2800);
      return true;
    }
    if (!holdEmpty(saved.hold)) {
      engine.toast?.(TRADE_TEXT.unsettled, 4200);
      client.send('trade_check', { trade: saved.hold.trade });
      return true;
    }
    loadTable();
    if (!client.send('trade_start', who)) engine.toast?.(TRADE_TEXT.offline, 2600);
    return true;
  }

  // —— Messages ——
  client.on('hello', () => {
    // A new socket: any trade open on the old one was ended by the server.
    if (open && !open.sealed) close();
    if (saved.hold && holdEmpty(saved.hold)) saved.hold = null;
    if (saved.hold) client.send('trade_check', { trade: saved.hold.trade });
  });

  client.on('msg:trade_open', (msg) => {
    const id = String(msg.trade || '');
    const withP = { id: n0(msg.with?.id), name: String(msg.with?.name || 'A Glitch') };
    if (!id || !withP.id) return;
    if (!holdEmpty(saved.hold) && saved.hold.trade !== id) {
      // Items still held from an earlier trade: settle that first (inc_trading.js 99-104).
      client.send('trade_cancel', { trade: id });
      client.send('trade_check', { trade: saved.hold.trade });
      engine.toast?.(TRADE_TEXT.unsettled, 4200);
      return;
    }
    const resumed = open?.id === id;
    if (!resumed) {
      open = {
        id,
        with: withP,
        by: n0(msg.by),
        mine: { v: 0, goods: emptyGoods(), accepted: false },
        theirs: { v: 0, goods: emptyGoods(), accepted: false },
        draft: emptyGoods(),
        sentV: 0,
        pending: new Map(),
        sending: false,
        autoAccept: false,
        closing: false,
        sealed: null,
        lines: [],
      };
      line(TRADE_TEXT.begun(withP.name));
      engine.playSound?.('UI_PANEL_OPEN');
      showTradingBubble(withP.id);
    }
    loadTable();
    render();
  });

  client.on('msg:trade_state', (msg) => {
    if (!open || msg.trade !== open.id || open.sealed) return;
    const mine = { v: n0(msg.mine?.v), goods: normalizeGoods(msg.mine), accepted: msg.mine?.accepted === true };
    const theirs = { v: n0(msg.theirs?.v), goods: normalizeGoods(msg.theirs), accepted: msg.theirs?.accepted === true };
    const name = open.with.name;
    for (const l of changeLines(name, open.theirs.goods, theirs.goods, table, itemLabel)) line(l);
    for (const l of changeLines('You', open.mine.goods, mine.goods, table, itemLabel)) line(l);
    if (theirs.accepted !== open.theirs.accepted) line(`${name} ${theirs.accepted ? TRADE_TEXT.confirmed : TRADE_TEXT.theyEdit}`);
    if (mine.accepted !== open.mine.accepted) line(`You ${mine.accepted ? TRADE_TEXT.confirmed : TRADE_TEXT.youEdit}`);
    open.mine = mine;
    open.theirs = theirs;
    open.settling = msg.settling === true;
    open.sentV = Math.max(open.sentV, mine.v);
    for (const v of [...open.pending.keys()]) if (v <= mine.v || v === n0(msg.rejected)) open.pending.delete(v);
    if (msg.rejected) {
      open.autoAccept = false;
      open.draft = latestSent();
    } else if (!open.pending.size && !open.sending && !sendTimer && mine.accepted) {
      open.draft = mine.goods;
    }
    shrinkHold();
    render();
    if (open.autoAccept && !open.pending.size && !open.sending && !sendTimer && sameGoods(open.draft, open.mine.goods)) accept();
  });

  client.on('msg:trade_cancel', (msg) => {
    const id = String(msg.trade || '');
    if (msg.by?.name) {
      // inc_trading.js 268-275: "<name> canceled their trade with you." [Oh well], 10 s.
      const text = TRADE_TEXT.canceled(String(msg.by.name));
      engine.prompt?.({ text, choices: [{ label: TRADE_TEXT.ohWell, value: 'ok' }], timeout: 10 });
      engine.pushActivity?.(text);
    }
    if (open?.id === id) close();
    returnHold(id);
  });

  client.on('msg:trade_void', (msg) => {
    const id = String(msg.trade || '');
    if (open?.id === id && !open.sealed) close();
    returnHold(id);
  });

  client.on('msg:trade_done', (msg) => applyDone(msg));

  client.on('msg:trade_activity', (msg) => {
    const text = String(msg.text || '');
    if (!text) return;
    engine.pushActivity?.(text);
    engine.toast?.(text, 3200);
  });

  client.on('error', ({ code, message }) => {
    if (code !== 'trade' || !message) return;
    if (open && !open.sealed) {
      open.autoAccept = false;
      open.closing = false;
      line(message, 'error');
      render();
    } else {
      engine.toast?.(message, 3200);
      engine.pushActivity?.(message);
    }
  });

  client.on('state', () => { if (open) render(); });

  async function applyDone(msg) {
    const id = String(msg.trade || '');
    if (!id) return;
    if (saved.applied.includes(id)) {
      if (await persist(engine)) client.send('trade_ack', { trade: id });
      return;
    }
    const withP = { id: n0(msg.with?.id), name: String(msg.with?.name || 'A Glitch') };
    const hold = saved.hold?.trade === id ? saved.hold : null;
    if (!hold && Object.keys(countsOf(normalizeGoods(msg.gave))).length) console.warn('[trade] done without its hold', id);
    const s = settleDone(hold, msg);
    const inv = engine.inv;
    const had = {};
    for (const t of s.tools) had[t.c] = countItem(inv, t.c);
    for (const [c, n] of Object.entries(s.pack)) {
      if (n > 0) addItem(inv, c, n);
      else removeItem(inv, c, Math.min(countItem(inv, c), -n));
    }
    engine.pc.currants = Math.max(0, n0(engine.pc.currants) + s.currants);
    // A traded tool keeps its wear (the source carried tool_state): a first one takes the
    // sender's points, one more of a class you have takes whichever is more worn.
    for (const t of s.tools) {
      if (!TOOL_CONDITION_CATALOG[t.c] || !engine.toolState) continue;
      const mine = getToolCondition(engine.toolState, t.c).remaining;
      setToolRemaining(engine.toolState, t.c, had[t.c] > 0 ? Math.min(mine, t.r) : t.r);
    }
    if (hold) saved.hold = null;
    saved.applied = [...saved.applied, id].slice(-APPLIED_KEEP);
    const gave = normalizeGoods(msg.gave);
    const got = normalizeGoods(msg.got);
    // trading_transfer 1122-1129: players_traded counts a trade where something moved.
    if (gave.items.length || gave.currants || got.items.length || got.currants) engine.achievement?.(`players_traded:${withP.id}`, 1);
    engine.updateHud?.();
    const text = completeLine(withP.name, gave, got, table, itemLabel);
    engine.pushActivity?.(text);
    engine.playSound?.('TRADE_COMPLETED');
    if (!open || open.id !== id) {
      open = { id, with: withP, mine: { v: 0, goods: gave, accepted: true }, theirs: { v: 0, goods: got, accepted: true }, draft: gave, pending: new Map(), lines: [] };
    }
    open.sealed = { gave, got };
    line(text);
    render();
    if (await persist(engine)) client.send('trade_ack', { trade: id });
  }

  return {
    client,
    get open() { return open; },
    get hold() { return saved.hold; },
    get applied() { return saved.applied; },
    get table() { return table; },
    start,
    request,
    endRequest,
    acceptRequest,
    get requesting() { return myRequest !== null; },
    get requestsHeard() { return [...heard.keys()]; },
    addFromPack,
    editDraft,
    accept,
    unlock,
    cancel,
    close,
    lines: () => (open ? open.lines.map((l) => l.text) : []),
    /** QA: the pack counts and purse the trade works on, and the hold. */
    snapshot: () => ({ inv: { ...(engine.inv || {}) }, currants: engine.pc?.currants ?? 0, hold: saved.hold ? JSON.parse(JSON.stringify(saved.hold)) : null }),
    tick() {
      // The pack can change under an open window (a pickup, a meal): redraw the strip now and then.
      if (!open || open.sealed || win.hidden) return;
      const key = JSON.stringify(engine.inv);
      if (key !== open.packKey) {
        open.packKey = key;
        renderPack();
      }
    },
    verb(target) {
      return { id: TRADE_VERB, label: TRADE_TEXT.verb, tooltip: TRADE_TEXT.verbTip, enabled: true, reason: '', durationMs: 0, sort: 200 };
    },
    command(text) {
      const cmd = tradeCommand(text);
      if (!cmd) return null;
      if (cmd.kind === 'usage') {
        engine.toast?.(TRADE_TEXT.usage, 3000);
        return true;
      }
      return start({ name: cmd.name });
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
  globalThis.groddleTrade = session;
  return session;
}

export const tradeFeature = {
  id: TRADE_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick();
  },

  /** Another player's Glitch (pc_remote, drawn by realtime and party): its menu plus Offer to Trade. */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== TRADE_VERB), session.verb(target)];
  },

  runVerbOverride(target, verbId) {
    if (verbId !== TRADE_VERB || !session || !target?.playerId) return null;
    return session.start({ id: target.playerId });
  },

  /** /trade <name>. */
  chatCommand(text, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    const s = ensure(engine);
    return s ? s.command(text) : null;
  },

  /** The pack popover's Add to trade, while a trade window is open on your side. */
  packVerbs(classTsid) {
    const o = session?.open;
    if (!o || o.sealed || o.mine?.accepted) return null;
    const reason = session.table ? untradeableReason(classTsid, session.table) : '';
    return [{ id: 'trade_add', label: 'Add to trade', enabled: !reason, reason, tooltip: 'Put this in the trade window' }];
  },

  runPackVerb(classTsid, verbId) {
    if (verbId !== 'trade_add' || !session?.open) return false;
    session.addFromPack(classTsid);
    return true;
  },

  /**
   * G334: a ledger spend the realtime server made for this player (a Party
   * Pack, the Party ATM's currants: party_spaces.go), remembered with the
   * trades the save has applied so the site counts it once (LedgerSpend.php).
   * True the first time (the caller applies it), false when already applied.
   */
  ledgerReceipt(id) {
    if (!multiplayer || typeof id !== 'string' || !id || id.length > 40) return null;
    if (saved.applied.includes(id)) return false;
    saved.applied = [...saved.applied, id].slice(-APPLIED_KEEP);
    return true;
  },

  save() {
    if (!multiplayer) return undefined;
    if (!saved.hold && !saved.applied.length) return undefined;
    return { hold: saved.hold, applied: saved.applied };
  },

  restore(slice, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    saved = multiplayer ? normalizeSlice(slice) : normalizeSlice(null);
  },
};
