/**
 * The Auction House in multiplayer (register G333). The site owns the
 * listings and moves everything of value (groddle-afternoon-site
 * src/LedgerAuction.php); the rules and words are js/auctions.js. Solo has
 * no auctions: in solo this feature answers nothing and draws nothing.
 *
 * Where the original reached its auctions (the AS3 client, then the
 * glitch.com pages), and where they are here:
 * - Menu, Auctions (PlayerInfoButtons.as:45 addItem('Auctions')): the
 *   Auctions window, with All auctions, Post a new auction and Your
 *   auctions, as the web pages had (glitch.com/auctions/, /auctions/create/).
 *   The window's look and its search, category, sort and seller filters are
 *   ours (reimagined: the pages themselves were never released).
 * - A pack item's Find auctions (GetInfoDialog.as:189, StoreBuyUI.as:169:
 *   the item's auctions page), and Sell at auction (ours: the create page
 *   picked a stack from your pack; the pack popover goes straight to it).
 * - Another player's menu, View Auctions (InteractionMenuController.as:
 *   560-562, "View active auctions from this person.").
 * - Deliveries arrive by mail (inc_mail.js mail_add_auction_delivery, 764-771):
 *   a letter from the Auction Fulfillment and Logistics Corporation with the
 *   stack attached, 10 minutes after the sale, cancel or expiry. Receive
 *   asks the site (mailReceive), which puts the stack in your ledger first.
 *
 * Every move the site settled (listing, purchase, proceeds, delivery) comes
 * back as a receipt the save applies once (engine.query('ledgerReceipt'),
 * the trade slice's applied list); a missed one comes back on the next sync
 * (every 60 s while you have auctions or deliveries open, and on every
 * open), and a load applies anything still missed to the stored save
 * (Ledger::catchUp). A seller hears of a sale at the next sync: "Someone
 * bought your auction of 3x Tomatoes" (inc_auctions.js:452-479), with
 * auctions_sold_<class> counted once per sale for Tater 'n' Mater.
 *
 * QA: canvas data auctionsPanel (closed|browse|post|mine), auctionsLast,
 * auctionsActive (your active listing ids), auctionsMail (deliveries in the
 * mailbox), auctionsCounted (the quest counters the last sales counted);
 * window.groddleAuctions in multiplayer.
 */

import { ITEM_CATALOG, addItem, countItem, itemIcon, listPackSlots, removeItem } from '../inventory.js?v=catalog-unified-7';
import { TOOL_CONDITION_CATALOG, getToolCondition, setToolRemaining } from '../tools.js?v=woodcutting-test-8';
import { createMinnAccount } from '../minn-account.js?v=nbhome-10';
import { saveStore } from '../save-store.js?v=mp2-2';
import {
  AUCTION_TEXT as T,
  DEFAULT_RULES,
  ago,
  arrivedWhileOutText,
  commission,
  countName,
  deliveryMail,
  endsIn,
  listingFee,
  newListingId,
  normalizeAuctionsSlice,
  normalizeListing,
  normalizeReceipt,
  normalizeRules,
  purchaseBadges,
  receiptEffects,
  saleCounters,
  soldText,
  suggestedPrice,
  unitPrice,
} from '../auctions.js?v=g333-1';

export const AUCTIONS_FEATURE_ID = 'auctions';
const TABLE_URL = 'assets/content/trade-items.json';
const SYNC_EVERY_MS = 60000;
const VIEW_VERB = 'auctions_view';

let slice = normalizeAuctionsSlice(null);
let multiplayer = false;

const STYLE = `
.auc-shade { position: fixed; inset: 0; z-index: calc(var(--z-dialog) + 4); background: color-mix(in srgb, var(--c-mauve-23) 28%, transparent); display: flex; align-items: flex-start; justify-content: center; padding: 7vh var(--sp-8) var(--sp-8); pointer-events: auto; }
.auc-shade[hidden] { display: none; }
.auc-win { width: min(680px, 100%); max-height: 84vh; display: flex; flex-direction: column; border-radius: var(--radius-xl); background: var(--surface-card); color: var(--text); box-shadow: var(--shadow-3), 0 0 0 1px color-mix(in srgb, var(--c-violet-50) 18%, transparent); font: var(--fs-md)/var(--lh-normal) var(--font-system); overflow: hidden; }
.auc-head { display: flex; gap: var(--sp-5); align-items: center; padding: var(--sp-6) var(--sp-7) var(--sp-3); }
.auc-head h2 { margin: 0; font: 700 var(--fs-lg)/var(--lh-tight) var(--font-ui); color: var(--c-violet-36); }
.auc-x { margin-left: auto; border: 0; background: transparent; font: 700 var(--fs-xl)/var(--lh-none) var(--font-system); color: var(--text-subtle); cursor: pointer; padding: var(--sp-1) var(--sp-3); border-radius: var(--radius-sm); }
.auc-x:hover { background: var(--surface-lilac); color: var(--c-violet-36); }
.auc-tabs { display: flex; gap: 0.3rem; padding: 0 var(--sp-7); border-bottom: 1px solid var(--c-cream-93); flex-wrap: wrap; }
.auc-tabs button { border: 0; background: transparent; font: 700 var(--fs-sm)/var(--lh-tight) var(--font-system); color: var(--text-muted); padding: 0.45rem var(--sp-5); border-radius: var(--radius-md) var(--radius-md) 0 0; cursor: pointer; }
.auc-tabs button[aria-selected="true"] { color: var(--c-violet-36); background: var(--surface-lilac); }
.auc-body { overflow-y: auto; padding: var(--sp-5) var(--sp-7) 0.8rem; flex: 1; }
.auc-tools { display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: center; margin-bottom: 0.45rem; }
.auc-tools input[type="search"] { flex: 1 1 12rem; min-width: 0; font: var(--fs-md) var(--font-system); padding: var(--sp-3) var(--sp-5); border-radius: var(--radius-pill); border: 0; box-shadow: inset 0 0 0 1px var(--c-mauve-85); background: var(--surface-bright); }
.auc-tools select { font: var(--fs-sm) var(--font-system); padding: 0.32rem var(--sp-3); border-radius: var(--radius-md); border: 0; box-shadow: inset 0 0 0 1px var(--c-mauve-85); background: var(--surface-bright); max-width: 100%; }
.auc-hint { color: var(--text-subtle); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
.auc-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: var(--sp-3); }
.auc-chip { display: inline-flex; gap: 0.3rem; align-items: center; font: 600 var(--fs-xs)/var(--lh-tight) var(--font-system); border-radius: var(--radius-pill); padding: 0.2rem 0.3rem 0.2rem var(--sp-5); background: var(--c-violet-50); color: var(--text-inverse); }
.auc-chip button { border: 0; background: color-mix(in srgb, var(--surface-bright) 20%, transparent); color: var(--text-inverse); border-radius: var(--radius-pill); width: 1.2rem; height: 1.2rem; cursor: pointer; font: 700 var(--fs-xs)/var(--lh-none) var(--font-system); }
.auc-list { display: flex; flex-direction: column; gap: var(--sp-3); }
.auc-row { display: grid; grid-template-columns: 44px 1fr auto; gap: 0.55rem; align-items: center; padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-lg); background: var(--surface-card); box-shadow: inset 0 0 0 1px var(--c-cream-93); }
.auc-row.is-mine { box-shadow: inset 0 0 0 1px var(--c-mauve-85); background: var(--surface-lilac); }
.auc-icon { position: relative; width: 40px; height: 40px; }
.auc-icon img { width: 40px; height: 40px; object-fit: contain; }
.auc-icon b { position: absolute; right: -4px; bottom: -3px; font: 700 var(--fs-2xs)/var(--lh-none) var(--font-system); background: var(--c-violet-36); color: var(--text-inverse); border-radius: var(--radius-pill); padding: var(--sp-1) 0.3rem; }
.auc-what { min-width: 0; }
.auc-what strong { display: block; font: 700 var(--fs-md)/var(--lh-snug) var(--font-ui); color: var(--text-heading); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.auc-meta { color: var(--text-muted); font-size: var(--fs-xs); }
.auc-meta button { border: 0; background: none; padding: 0; color: var(--c-violet-50); font: 600 var(--fs-xs) var(--font-system); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.auc-price { text-align: right; }
.auc-price strong { display: block; font: 700 var(--fs-md)/var(--lh-tight) var(--font-system); color: var(--text-heading); white-space: nowrap; }
.auc-price span { display: block; color: var(--text-subtle); font-size: var(--fs-xs); white-space: nowrap; }
.auc-btn { font: 700 var(--fs-sm)/var(--lh-tight) var(--font-system); border: 0; border-radius: var(--radius-pill); padding: var(--sp-3) var(--sp-7); cursor: pointer; color: var(--text-inverse); background: var(--c-violet-50); box-shadow: var(--shadow-1); margin-top: var(--sp-2); }
.auc-btn.is-quiet { color: var(--text-heading); background: var(--surface-parchment); box-shadow: none; }
.auc-btn:disabled { opacity: 0.5; cursor: default; }
.auc-none { color: var(--text-subtle); padding: var(--sp-8) 0; text-align: center; }
.auc-pager { display: flex; gap: var(--sp-4); justify-content: center; align-items: center; margin-top: var(--sp-4); color: var(--text-muted); font-size: var(--fs-sm); }
.auc-status { min-height: 1.2em; margin: var(--sp-3) 0 0; font-size: var(--fs-sm); color: var(--c-mauve-40); }
.auc-status.is-error { color: var(--text-danger); }
.auc-pack { display: flex; flex-wrap: wrap; gap: 0.3rem; max-height: 9.5rem; overflow-y: auto; margin-bottom: var(--sp-4); }
.auc-pack button { display: inline-flex; align-items: center; gap: var(--sp-2); font: 600 var(--fs-xs)/var(--lh-tight) var(--font-system); border: 0; border-radius: var(--radius-pill); padding: 0.18rem 0.55rem 0.18rem var(--sp-2); cursor: pointer; color: var(--text-heading); background: var(--surface-lilac); box-shadow: inset 0 0 0 1px var(--c-mauve-85); }
.auc-pack button img { width: 22px; height: 22px; object-fit: contain; }
.auc-pack button[aria-pressed="true"] { background: var(--c-violet-50); color: var(--text-inverse); box-shadow: none; }
.auc-sell { border-radius: var(--radius-lg); background: var(--surface-card); box-shadow: inset 0 0 0 1px var(--c-cream-93); padding: var(--sp-5) var(--sp-6); }
.auc-sell h3 { margin: 0 0 var(--sp-2); font: 700 var(--fs-base)/var(--lh-snug) var(--font-ui); color: var(--c-violet-36); }
.auc-sell p { margin: var(--sp-2) 0; }
.auc-sell label { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; margin: var(--sp-3) 0; }
.auc-sell input { width: 6.5rem; font: var(--fs-md) var(--font-system); padding: 0.3rem 0.45rem; border-radius: var(--radius-md); border: 0; box-shadow: inset 0 0 0 1px var(--c-mauve-85); background: var(--surface-bright); text-align: right; }
.auc-costs { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); margin-top: var(--sp-3); }
.auc-costs small { display: block; color: var(--text-subtle); font-size: var(--fs-xs); line-height: var(--lh-tight); }
.auc-sec { margin: 0.7rem 0 var(--sp-3); font: 700 var(--fs-sm)/var(--lh-snug) var(--font-system); color: var(--c-sand-42); }
@media (max-width: 520px) { .auc-row { grid-template-columns: 40px 1fr; } .auc-price { grid-column: 1 / -1; text-align: left; display: flex; gap: var(--sp-5); align-items: center; flex-wrap: wrap; } .auc-costs { grid-template-columns: 1fr; } }
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

const money = (n) => `${Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US')} ₡`;

function createSession(engine) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  let table = null;
  let tableLoading = null;
  let rules = { ...DEFAULT_RULES };
  let cats = [];
  /** The last /auctions/mine answer. */
  let mine = { active: [], ended: [], deliveries: [], listable: {}, receipts: [] };
  let haveMine = false;
  let tab = 'browse';
  let open = false;
  const filters = { q: '', cat: '', c: '', seller: null, sort: 'new', page: 1 };
  let results = { auctions: [], total: 0, page: 1, per: 20 };
  let pick = null; // the Post tab: { c, n, cost, touched }
  let lowest = null; // { c, each } the lowest active price per one of pick.c
  let busy = false;
  let lastLine = '';
  let syncing = null;
  let syncedAt = 0;
  const startedAt = Date.now();

  const label = (c, n = 1) => {
    const row = table?.items?.[c];
    if (row) return n === 1 ? row.name : row.plural || row.name;
    const meta = ITEM_CATALOG[c];
    if (meta) return n === 1 ? meta.label : meta.namePlural || meta.label;
    return String(c).replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  };
  const iconFor = (c) => ITEM_CATALOG[c]?.icon || itemIcon(c);

  function loadTable() {
    if (table || tableLoading) return tableLoading;
    tableLoading = fetch(TABLE_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => { table = t && t.items ? t : { items: {}, untradeable: {} }; if (open) render(); })
      .catch(() => { tableLoading = null; });
    return tableLoading;
  }
  loadTable();

  // —— Calls ——

  /** A site call: { ok, data } with a refusal's own words on 409. */
  async function call(fn) {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : null;
      return { ok: false, data, text: String(data?.text || data?.message || err?.message || T.offline) };
    }
  }

  /** The save as the site will compare it: written before a listing or a purchase (trade-feature persist). */
  async function persist() {
    engine.save?.();
    if (typeof saveStore?.flush !== 'function') return;
    for (let i = 0; i < 3; i += 1) {
      try { await saveStore.flush(); } catch { return; }
      if (saveStore.state === 'saved') return;
    }
  }

  // —— Applying what the site settled ——

  function messageFor(op) {
    return (engine.mailMessages?.() || []).find((m) => m.ledger === op) || null;
  }

  /** One settled move, once (the trade slice's applied list): true when applied now. */
  function applyReceipt(raw, { quiet = false, r = null } = {}) {
    const receipt = normalizeReceipt(raw);
    if (!receipt) return false;
    if (engine.query?.('ledgerReceipt', receipt.op, engine) !== true) {
      if (receipt.kind === 'd') claimMail(receipt.op);
      return false;
    }
    const fx = receiptEffects(receipt);
    const inv = engine.inv;
    for (const [c, d] of Object.entries(fx.pack)) {
      if (d > 0) {
        const had = countItem(inv, c);
        addItem(inv, c, d);
        if (r != null && TOOL_CONDITION_CATALOG[c] && engine.toolState) {
          const mineR = getToolCondition(engine.toolState, c).remaining;
          setToolRemaining(engine.toolState, c, had > 0 ? Math.min(mineR, r) : r);
        }
      } else removeItem(inv, c, Math.min(countItem(inv, c), -d));
    }
    if (fx.currants) engine.pc.currants = Math.max(0, Math.floor(Number(engine.pc.currants) || 0) + fx.currants);
    if (receipt.kind === 'd') claimMail(receipt.op);
    engine.updateHud?.();
    engine.refreshPack?.();
    if (!quiet) engine.save?.();
    return true;
  }

  function claimMail(op) {
    const m = messageFor(op);
    if (m) {
      m.attachmentsClaimed = true;
      m.read = true;
    }
  }

  /**
   * The deliveries the site holds for you, as letters in the mailbox (once
   * each; a deleted one comes back until it is received). A delivery is
   * announced once when it arrives (slice.seenOut keeps the newest told):
   * the source's "arrived while you were out" for ones that came before
   * this session, a toast and the mail sound for the rest.
   */
  function mailDeliveries(list, now) {
    let added = 0;
    const away = [];
    let arrived = 0;
    let newest = slice.seenOut;
    for (const d of list) {
      const row = deliveryMail(d);
      if (!row) continue;
      const have = (engine.mailMessages?.() || []).find((m) => m.id === row.id);
      if (have) {
        if (d.collected) claimMail(row.ledger);
        else if (have.deleted) have.deleted = false;
        if (!have.ledger) have.ledger = row.ledger;
        // The site says when it arrives.
        if (row.deliveryAt && have.deliveryAt !== row.deliveryAt && !d.collected) have.deliveryAt = row.deliveryAt;
      } else if (!d.collected) {
        engine.deliverMail?.(row);
        added += 1;
      }
      if (!d.collected && d.at <= now && d.at > slice.seenOut) {
        newest = Math.max(newest, d.at);
        if (d.at <= startedAt) away.push(d.kind);
        else arrived += 1;
      }
    }
    if (newest > slice.seenOut) slice.seenOut = newest;
    if (away.length) {
      const text = arrivedWhileOutText(away[0]);
      engine.pushActivity?.(text);
      engine.toast?.(text, 5200);
    }
    if (arrived) {
      lastLine = T.arrived;
      engine.pushActivity?.(T.arrived);
      engine.toast?.(T.arrived, 4200);
      engine.playSound?.('HAS_MAIL', { volume: 0.5 });
    }
    if (added || away.length || arrived) engine.save?.();
    return added;
  }

  /** Sales not told yet: the source's prompt, the quest counters, once each. */
  function tellSales(ended) {
    const fresh = ended.filter((a) => a.mine && a.status === 'bought' && !slice.told.includes(a.id));
    if (!fresh.length) return;
    const counted = [];
    for (const a of fresh) {
      for (const row of saleCounters(a)) {
        engine.achievement?.(row.counter, row.amount);
        counted.push(`${row.counter}+${row.amount}`);
      }
      slice.told.push(a.id);
    }
    engine.setData?.('auctionsCounted', counted.join(','));
    slice.told = slice.told.slice(-120);
    const text = soldText(fresh.map((a) => countName(a.c, a.n, table, label)));
    lastLine = text;
    engine.pushActivity?.(text);
    engine.playSound?.('VENDOR_SELL', { volume: 0.55 });
    engine.prompt?.({ text, choices: [{ label: 'OK', value: 'accept' }] });
    engine.save?.();
  }

  /** Expired listings told once (the source's activity_notify auction_expire). */
  function tellExpired(ended) {
    for (const a of ended) {
      if (!a.mine || a.status !== 'expired' || slice.told.includes(a.id)) continue;
      slice.told.push(a.id);
      engine.pushActivity?.(T.expired(countName(a.c, a.n, table, label)));
    }
  }

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      syncedAt = Date.now();
      const r = await call(() => account.myAuctions());
      if (!r.ok || !r.data) return false;
      if (!table) await loadTable();
      const d = r.data;
      rules = normalizeRules(d.rules);
      for (const receipt of Array.isArray(d.receipts) ? d.receipts : []) applyReceipt(receipt, { quiet: true });
      mine = {
        active: (d.active || []).map(normalizeListing).filter(Boolean),
        ended: (d.ended || []).map(normalizeListing).filter(Boolean),
        deliveries: Array.isArray(d.deliveries) ? d.deliveries.filter((x) => x && x.id) : [],
        listable: d.listable && typeof d.listable === 'object' ? d.listable : {},
      };
      haveMine = true;
      mailDeliveries(mine.deliveries, Number(d.now) || Date.now());
      tellSales(mine.ended);
      tellExpired(mine.ended);
      engine.save?.();
      publish();
      if (open) render();
      return true;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  // —— The window ——

  const style = el('style', { id: 'auctions-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const shade = el('div', { class: 'auc-shade', hidden: true, 'data-auctions-shade': '' });
  const win = el('section', { class: 'auc-win', role: 'dialog', 'aria-modal': 'true', 'aria-label': T.title, 'data-auctions-window': '' });
  const head = el('div', { class: 'auc-head' });
  const title = el('h2', {}, T.title);
  const closeBtn = el('button', { type: 'button', class: 'auc-x', 'aria-label': 'Close', 'data-auctions-close': '' }, '×');
  head.append(title, closeBtn);
  const tabs = el('div', { class: 'auc-tabs', role: 'tablist' });
  const tabBtns = {};
  for (const [id, text] of [['browse', T.browse], ['post', T.post], ['mine', T.mine]]) {
    const b = el('button', { type: 'button', role: 'tab', 'data-auctions-tab': id }, text);
    b.addEventListener('click', () => show(id));
    tabBtns[id] = b;
    tabs.append(b);
  }
  const body = el('div', { class: 'auc-body' });
  const status = el('p', { class: 'auc-status', 'aria-live': 'polite', 'data-auctions-status': '' });
  win.append(head, tabs, body);
  shade.append(win);
  document.body.append(shade);
  closeBtn.addEventListener('click', () => close());
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  shade.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });

  const menu = document.getElementById?.('more-list');
  if (menu) {
    const btn = el('button', { id: 'auctions-btn', type: 'button', class: 'chrome-btn', title: T.menuTip }, T.title);
    btn.addEventListener('click', () => openWindow());
    const before = document.getElementById?.('signout-btn');
    if (before && before.parentElement === menu) menu.insertBefore(btn, before);
    else menu.append(btn);
  }

  function publish() {
    engine.setData?.('auctionsPanel', open ? tab : 'closed');
    engine.setData?.('auctionsLast', lastLine);
    engine.setData?.('auctionsActive', mine.active.map((a) => a.id).join(','));
    engine.setData?.('auctionsMail', (engine.mailMessages?.() || []).filter((m) => m.ledger && !m.deleted && !m.attachmentsClaimed).map((m) => m.ledger).join(','));
  }

  function say(text, kind = '') {
    lastLine = text || lastLine;
    status.textContent = text || '';
    status.className = `auc-status${kind ? ` is-${kind}` : ''}`;
    publish();
  }

  function openWindow(opts = {}) {
    open = true;
    shade.hidden = false;
    if (opts.c != null || opts.seller != null) {
      Object.assign(filters, { q: '', cat: '', c: opts.c || '', seller: opts.seller || null, page: 1 });
    }
    say('');
    show(opts.tab || 'browse', opts);
    sync();
    return true;
  }

  function close() {
    open = false;
    shade.hidden = true;
    publish();
  }

  function show(id, opts = {}) {
    tab = id;
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-selected', String(k === id));
    if (id === 'browse') search();
    if (id === 'post' && opts.c) choose(opts.c);
    render();
  }

  function render() {
    publish();
    if (!open) return;
    if (tab === 'browse') renderBrowse();
    else if (tab === 'post') renderPost();
    else renderMine();
  }

  // —— All auctions ——

  let searchTimer = 0;
  async function search() {
    const params = { sort: filters.sort, page: filters.page };
    if (filters.q.trim().length >= rules.searchMin) params.q = filters.q.trim();
    if (filters.cat) params.cat = filters.cat;
    if (filters.c) params.c = filters.c;
    if (filters.seller) params.seller = filters.seller.id;
    busy = true;
    if (tab === 'browse') renderBrowse();
    const r = await call(() => account.auctions(params));
    busy = false;
    if (r.ok && r.data) {
      results = { auctions: (r.data.auctions || []).map(normalizeListing).filter(Boolean), total: Number(r.data.total) || 0, page: Number(r.data.page) || 1, per: Number(r.data.per) || 20 };
      if (Array.isArray(r.data.cats)) cats = r.data.cats;
      rules = normalizeRules(r.data.rules);
    } else say(r.text, 'error');
    if (open && tab === 'browse') renderBrowse();
  }

  function listingRow(a, { actions = true } = {}) {
    const row = el('div', { class: `auc-row${a.mine ? ' is-mine' : ''}`, 'data-auction': a.id, 'data-class': a.c });
    const ic = el('div', { class: 'auc-icon' });
    const img = el('img', { src: iconFor(a.c), alt: '' });
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    ic.append(img, el('b', {}, String(a.n)));
    const what = el('div', { class: 'auc-what' });
    what.append(el('strong', {}, label(a.c, a.n)));
    const meta = el('div', { class: 'auc-meta' });
    meta.append('Seller: ');
    const who = el('button', { type: 'button', 'data-auction-seller': String(a.seller.id) }, a.seller.name);
    who.addEventListener('click', () => { Object.assign(filters, { seller: a.seller, q: '', c: '', cat: '', page: 1 }); show('browse'); });
    meta.append(who, ` · ${ago(a.at)}`);
    if (a.status === 'active') meta.append(` · Ends in ${endsIn(a.ends)}`);
    if (a.r != null && TOOL_CONDITION_CATALOG[a.c]) meta.append(` · ${a.r} uses left`);
    what.append(meta);
    const price = el('div', { class: 'auc-price' });
    price.append(el('strong', {}, `${a.n} for ${money(a.cost)}`));
    if (a.n > 1) price.append(el('span', {}, `${unitPrice(a.cost, a.n)} ₡ each`));
    if (actions && a.status === 'active') {
      if (a.mine) {
        const b = el('button', { type: 'button', class: 'auc-btn is-quiet', 'data-auction-cancel': a.id }, 'Cancel');
        b.addEventListener('click', () => cancel(a));
        price.append(b);
      } else {
        // Two clicks: Buy, then the price to confirm it (ours; the web page had its own purchase page).
        const b = el('button', { type: 'button', class: 'auc-btn', 'data-auction-buy': a.id }, 'Buy');
        b.disabled = busy;
        let armed = 0;
        b.addEventListener('click', () => {
          if (Date.now() - armed < 5000) {
            armed = 0;
            buy(a);
            return;
          }
          armed = Date.now();
          b.textContent = `Buy for ${money(a.cost)}?`;
          b.dataset.auctionConfirm = '';
          setTimeout(() => {
            if (armed && Date.now() - armed >= 5000 && b.isConnected) {
              armed = 0;
              b.textContent = 'Buy';
              delete b.dataset.auctionConfirm;
            }
          }, 5100);
        });
        price.append(b);
      }
    }
    row.append(ic, what, price);
    return row;
  }

  function renderBrowse() {
    const tools = el('div', { class: 'auc-tools' });
    const q = el('input', { type: 'search', placeholder: 'Search by item or seller', value: filters.q, 'aria-label': 'Search auctions', 'data-auctions-q': '' });
    q.addEventListener('input', () => {
      filters.q = q.value;
      filters.page = 1;
      clearTimeout(searchTimer);
      const ready = !q.value.trim() || q.value.trim().length >= rules.searchMin;
      if (ready) searchTimer = setTimeout(search, 350);
    });
    const cat = el('select', { 'aria-label': 'Browse by type', 'data-auctions-cat': '' });
    cat.append(el('option', { value: '' }, 'All types'));
    for (const [k, name] of cats) cat.append(el('option', { value: k, selected: filters.cat === k }, name));
    cat.addEventListener('change', () => { filters.cat = cat.value; filters.page = 1; search(); });
    const sort = el('select', { 'aria-label': 'Sort', 'data-auctions-sort': '' });
    for (const [k, name] of [['new', 'Latest auctions'], ['unit', 'Lowest price each'], ['price', 'Lowest total price'], ['ends', 'Ending soonest']]) sort.append(el('option', { value: k, selected: filters.sort === k }, name));
    sort.addEventListener('change', () => { filters.sort = sort.value; filters.page = 1; search(); });
    tools.append(q, cat, sort);
    const nodes = [tools];
    const typed = filters.q.trim();
    if (typed && typed.length < rules.searchMin) nodes.push(el('p', { class: 'auc-hint' }, `(${T.searchHint})`));
    const chips = el('div', { class: 'auc-chips' });
    const chip = (text, drop, key) => {
      const c = el('span', { class: 'auc-chip', [`data-auctions-chip-${key}`]: '' }, text);
      const x = el('button', { type: 'button', 'aria-label': `Clear ${text}` }, '×');
      x.addEventListener('click', () => { drop(); filters.page = 1; search(); });
      c.append(x);
      chips.append(c);
    };
    if (filters.c) chip(`Auctions for ${label(filters.c, 2)}`, () => { filters.c = ''; }, 'class');
    if (filters.seller) chip(`${filters.seller.name}'s auctions`, () => { filters.seller = null; }, 'seller');
    if (chips.childElementCount) nodes.push(chips);
    const list = el('div', { class: 'auc-list', 'data-auctions-list': '' });
    if (!results.auctions.length) list.append(el('div', { class: 'auc-none' }, busy ? 'Looking…' : T.none));
    for (const a of results.auctions) list.append(listingRow(a));
    nodes.push(list);
    const pages = Math.max(1, Math.ceil(results.total / results.per));
    if (pages > 1) {
      const pager = el('div', { class: 'auc-pager' });
      const prev = el('button', { type: 'button', class: 'auc-btn is-quiet', disabled: results.page <= 1 }, 'Newer');
      const next = el('button', { type: 'button', class: 'auc-btn is-quiet', disabled: results.page >= pages }, 'More');
      prev.addEventListener('click', () => { filters.page = Math.max(1, results.page - 1); search(); });
      next.addEventListener('click', () => { filters.page = results.page + 1; search(); });
      pager.append(prev, el('span', {}, `Page ${results.page} of ${pages}`), next);
      nodes.push(pager);
    }
    nodes.push(status);
    const keep = document.activeElement === body.querySelector('[data-auctions-q]');
    body.replaceChildren(...nodes);
    if (keep) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  }

  async function buy(a) {
    if (busy) return;
    if ((Number(engine.pc.currants) || 0) < a.cost) return say("You don't have enough currants.", 'error');
    busy = true;
    say('Buying…');
    await persist();
    const r = await call(() => account.buyAuction(a.id));
    busy = false;
    if (!r.ok || r.data?.status !== 'bought') {
      say(r.text || r.data?.text || "That didn't work.", 'error');
      search();
      return;
    }
    applyReceipt(r.data.receipt);
    for (const id of purchaseBadges(a.cost)) engine.grantAchievement?.(id);
    const line = T.bought(countName(a.c, a.n, table, label), a.cost);
    engine.pushActivity?.(line);
    engine.playSound?.('PURCHASE_ITEM', { volume: 0.6 });
    say(line);
    await sync();
    search();
  }

  async function cancel(a) {
    if (busy) return;
    busy = true;
    const r = await call(() => account.cancelAuction(a.id));
    busy = false;
    if (!r.ok || r.data?.status !== 'cancelled') {
      say(r.text || "That didn't work.", 'error');
    } else {
      const line = T.cancelled(countName(a.c, a.n, table, label));
      engine.pushActivity?.(line);
      say(line);
    }
    await sync();
    if (tab === 'browse') search();
  }

  // —— Post a new auction ——

  /** The pack's stacks the site would list: the ledger's listable classes (its counts) the pack also holds. */
  function sellables() {
    const out = [];
    for (const row of listPackSlots(engine.inv || {})) {
      const c = row.classTsid;
      const have = countItem(engine.inv, c);
      if (have <= 0 || out.some((x) => x.c === c)) continue;
      const site = mine.listable[c];
      if (haveMine && !site) continue;
      if (!haveMine && table && !table.items?.[c]) continue;
      out.push({ c, have: site ? Math.min(have, Number(site.n) || 0) : have, v: site ? Number(site.v) || 0 : 0 });
    }
    return out.filter((x) => x.have > 0);
  }

  async function choose(c) {
    const s = sellables().find((x) => x.c === c);
    if (!s) {
      pick = { c, n: 0, cost: 0, forbidden: true };
      render();
      return;
    }
    pick = { c, n: s.have, cost: suggestedPrice(s.have, s.v), touched: false };
    lowest = null;
    render();
    const r = await call(() => account.auctions({ c, sort: 'unit' }));
    const best = r.ok ? (r.data?.auctions || []).map(normalizeListing).filter(Boolean).find((a) => !a.mine) : null;
    if (pick?.c === c) {
      lowest = best ? { c, each: best.cost / best.n } : { c, each: null };
      render();
    }
  }

  function renderPost() {
    const nodes = [];
    const stacks = sellables();
    if (!stacks.length) {
      nodes.push(el('p', { class: 'auc-none' }, T.nothingToSell), status);
      body.replaceChildren(...nodes);
      return;
    }
    nodes.push(el('p', { class: 'auc-hint' }, 'Choose a stack from your pack.'));
    const pack = el('div', { class: 'auc-pack', 'data-auctions-pack': '' });
    for (const s of stacks) {
      const b = el('button', { type: 'button', 'aria-pressed': String(pick?.c === s.c), 'data-auctions-pick': s.c });
      const img = el('img', { src: iconFor(s.c), alt: '' });
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
      b.append(img, el('span', {}, `${label(s.c, s.have)} ×${s.have}`));
      b.addEventListener('click', () => choose(s.c));
      pack.append(b);
    }
    nodes.push(pack);
    if (pick) nodes.push(sellBox(stacks.find((x) => x.c === pick.c)));
    nodes.push(status);
    body.replaceChildren(...nodes);
  }

  function sellBox(s) {
    const box = el('div', { class: 'auc-sell', 'data-auctions-sell': pick.c });
    box.append(el('h3', {}, label(pick.c, 1)));
    if (!s || pick.forbidden) {
      box.append(el('p', {}, T.forbidden));
      return box;
    }
    const one = label(pick.c, 1);
    const rate = lowest?.c === pick.c && lowest.each != null
      ? `Lowest current auction price for a single ${one}: ${money(Math.round(lowest.each))}`
      : `Current going rate for a single ${one}: ${money(s.v)}`;
    box.append(el('p', { 'data-auctions-rate': '' }, rate));
    const countIn = el('input', { type: 'number', min: '1', max: String(s.have), step: '1', value: String(pick.n), 'data-auctions-count': '', inputmode: 'numeric' });
    const costIn = el('input', { type: 'number', min: '1', max: String(rules.costMax), step: '1', value: pick.cost ? String(pick.cost) : '', 'data-auctions-cost': '', inputmode: 'numeric' });
    const lc = el('label');
    lc.append(`How many ${label(pick.c, 2)} do you want to sell?`, countIn, el('span', {}, `/ ${s.have}`));
    const lp = el('label');
    lp.append('For what price?', costIn, el('span', {}, 'currants'));
    const each = el('p', { 'data-auctions-each': '' });
    const costs = el('div', { class: 'auc-costs' });
    const comm = el('div');
    const fee = el('div');
    costs.append(comm, fee);
    const go = el('button', { type: 'button', class: 'auc-btn', 'data-auctions-post': '' }, 'Post auction');
    const readout = () => {
      const n = Math.max(0, Math.min(s.have, Math.floor(Number(countIn.value) || 0)));
      const cost = Math.max(0, Math.floor(Number(costIn.value) || 0));
      pick.n = n;
      pick.cost = cost;
      each.textContent = `Your price per ${one}: ${n && cost ? `${unitPrice(cost, n)} ₡` : '–'}`;
      comm.replaceChildren(el('strong', {}, `Commission ${cost ? money(commission(cost, rules)) : '–'}`), el('small', {}, T.commissionDesc(rules)));
      fee.replaceChildren(el('strong', {}, `Listing fee ${cost ? money(listingFee(cost, rules)) : '–'}`), el('small', {}, T.feeDesc(rules)));
      go.disabled = busy || n < 1 || cost < 1 || cost > rules.costMax;
    };
    countIn.addEventListener('input', () => {
      if (!pick.touched) {
        const n = Math.max(0, Math.min(s.have, Math.floor(Number(countIn.value) || 0)));
        costIn.value = String(suggestedPrice(n, s.v) || '');
      }
      readout();
    });
    costIn.addEventListener('input', () => { pick.touched = true; readout(); });
    go.addEventListener('click', () => post(s));
    box.append(lc, lp, each, costs, go);
    readout();
    return box;
  }

  async function post(s) {
    if (busy || !pick) return;
    const c = pick.c;
    const n = pick.n;
    const cost = pick.cost;
    if (n < 1 || n > s.have) return say('Choose how many to sell.', 'error');
    if (cost < 1 || cost > rules.costMax) return say('Ask for a price from 1 to 9,999,999 currants.', 'error');
    if ((Number(engine.pc.currants) || 0) < listingFee(cost, rules)) return say("You don't have enough currants for the listing fee.", 'error');
    busy = true;
    say('Posting…');
    render();
    await persist();
    const listing = { id: newListingId(), c, n, cost };
    if (TOOL_CONDITION_CATALOG[c] && engine.toolState) listing.r = getToolCondition(engine.toolState, c).remaining;
    const r = await call(() => account.listAuction(listing));
    busy = false;
    if (!r.ok || r.data?.status !== 'listed') {
      say(r.text || r.data?.text || "That didn't work.", 'error');
      render();
      return;
    }
    applyReceipt(r.data.receipt);
    const line = T.listed(countName(c, n, table, label), cost);
    engine.pushActivity?.(line);
    engine.playSound?.('PACKAGE_SENT', { volume: 0.55 });
    pick = null;
    await sync();
    show('mine');
    say(line);
  }

  // —— Your auctions ——

  function renderMine() {
    const nodes = [];
    const waiting = mine.deliveries.filter((d) => !d.collected);
    if (waiting.length) {
      const ready = waiting.filter((d) => d.at <= Date.now()).length;
      const p = el('p', { 'data-auctions-deliveries': String(waiting.length) }, ready
        ? `${ready} ${ready === 1 ? 'delivery is' : 'deliveries are'} waiting in your mailbox.`
        : `${waiting.length} ${waiting.length === 1 ? 'delivery is' : 'deliveries are'} on the way to your mailbox (${endsIn(Math.min(...waiting.map((d) => d.at)))}).`);
      if (ready) {
        const b = el('button', { type: 'button', class: 'auc-btn', 'data-auctions-mailbox': '' }, 'Open your mailbox');
        b.addEventListener('click', () => { close(); engine.openMailbox?.(); });
        p.append(' ', b);
      }
      nodes.push(p);
    }
    nodes.push(el('h3', { class: 'auc-sec' }, `Running (${mine.active.length} of ${rules.maxActive})`));
    const list = el('div', { class: 'auc-list', 'data-auctions-mine': '' });
    if (!mine.active.length) list.append(el('div', { class: 'auc-none' }, 'You have no auctions running.'));
    for (const a of mine.active) list.append(listingRow(a));
    nodes.push(list);
    if (mine.ended.length) {
      nodes.push(el('h3', { class: 'auc-sec' }, 'Ended'));
      const done = el('div', { class: 'auc-list', 'data-auctions-ended': '' });
      for (const a of mine.ended) {
        const row = listingRow(a, { actions: false });
        const why = a.status === 'bought'
          ? (a.mine ? `Sold to ${a.buyer?.name || 'someone'}: you got ${money(a.proceeds)}` : `You bought it for ${money(a.cost)}`)
          : a.status === 'cancelled' ? 'Cancelled' : 'Expired';
        row.querySelector('.auc-meta')?.append(` · ${why}`);
        row.dataset.auctionStatus = a.status;
        done.append(row);
      }
      nodes.push(done);
    }
    nodes.push(status);
    body.replaceChildren(...nodes);
  }

  // —— The mailbox's Receive ——

  async function receive(message) {
    const id = String(message.ledger || '').slice(4, 20);
    const r = await call(() => account.collectAuction(id));
    if (!r.ok || !['collected', 'done'].includes(r.data?.status)) {
      engine.toast?.(r.text || 'There is nothing left to receive.', 3200);
      return false;
    }
    const d = r.data.delivery || {};
    const applied = applyReceipt(r.data.receipt, { r: d.item?.r ?? null });
    claimMail(message.ledger);
    if (applied) {
      const what = countName(message.attachment?.classTsid, message.attachment?.count, table, label);
      engine.toast?.(`Received ${what}.`, 3200);
      engine.pushActivity?.(`Auction delivery collected: ${what}`);
      engine.playSound?.('ITEM_GIVEN_TO_YOU', { volume: 0.55 });
    }
    mine.deliveries = mine.deliveries.map((x) => (x.id === id ? { ...x, collected: true } : x));
    publish();
    return true;
  }

  sync();

  return {
    get open() { return open; },
    get tab() { return tab; },
    get mine() { return mine; },
    get results() { return results; },
    get table() { return table; },
    get rules() { return rules; },
    openWindow,
    close,
    sync,
    search,
    receive,
    sellables,
    tick(now) {
      // Every minute while anything of yours is running or on its way (a sale, an expiry, a delivery), and while the window is open.
      const pending = mine.active.length || mine.deliveries.some((d) => !d.collected);
      if ((open || pending || !haveMine) && now - syncedAt > SYNC_EVERY_MS) sync();
    },
  };
}

let session = null;
let guard = false;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  session = createSession(engine);
  globalThis.groddleAuctions = session;
  return session;
}

export const auctionsFeature = {
  id: AUCTIONS_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(Date.now());
  },

  /** QUESTS (G329): Tater 'n' Mater is offered once the Auction House is live. */
  auctionsReady(engine) {
    return engine?.mode === 'multiplayer' && session ? true : null;
  },

  /** The mailbox's Receive on an auction delivery (game.js renderMailboxReader): settled by the site. */
  mailReceive(message) {
    if (!multiplayer || !session || !/^auc-[0-9a-f]{16}-d$/.test(String(message?.ledger || ''))) return null;
    return session.receive(message);
  },

  /** Another player's Glitch: its menu plus View Auctions (InteractionMenuController.as:560-562). */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== VIEW_VERB), { id: VIEW_VERB, label: T.viewAuctions, tooltip: T.viewAuctionsTip, enabled: true, reason: '', durationMs: 0, sort: 195 }];
  },

  runVerbOverride(target, verbId) {
    if (verbId !== VIEW_VERB || !session || !target?.playerId) return null;
    return session.openWindow({ tab: 'browse', seller: { id: Number(target.playerId), name: String(target.label || target.name || 'A Glitch') } });
  },

  /** The pack popover: Find auctions (GetInfoDialog.as:189) and Sell at auction (ours). */
  packVerbs(classTsid) {
    if (!multiplayer || !session) return null;
    const c = String(classTsid || '');
    const t = session.table;
    if (t && !t.items?.[c]) return null;
    const out = [{ id: 'auctions_find', label: T.find, enabled: true, reason: '', tooltip: T.findTip }];
    const can = session.sellables().some((s) => s.c === c);
    out.push({ id: 'auctions_sell', label: T.sell, enabled: can, reason: can ? '' : T.forbidden, tooltip: T.sellTip });
    return out;
  },

  runPackVerb(classTsid, verbId) {
    if (!session) return false;
    if (verbId === 'auctions_find') return session.openWindow({ tab: 'browse', c: String(classTsid) });
    if (verbId === 'auctions_sell') return session.openWindow({ tab: 'post', c: String(classTsid) });
    return false;
  },

  save() {
    if (!multiplayer || (!slice.told.length && !slice.seenOut)) return undefined;
    return { told: slice.told, seenOut: slice.seenOut };
  },

  restore(s, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    slice = multiplayer ? normalizeAuctionsSlice(s) : normalizeAuctionsSlice(null);
  },
};
