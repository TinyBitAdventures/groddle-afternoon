/**
 * Storage in a house (ticket 51, register G404): cabinets and the Storage
 * Display Box, in play (Decoration Mode keeps its own Display button). The
 * rules, the words and their sources are js/home-storage.js; the windows are
 * js/ui/storage-windows.js.
 *
 * - A cabinet (bag_furniture_cabinet_base): open shows its grid. Pack stacks
 *   drag onto a slot ("Move Here"), a slot's stack drags back onto the pack
 *   or to another slot, a slot's click has Take out, and the pack's menu has
 *   Put in <cabinet> while one is open. canContain refuses contraband,
 *   elements, trophies, furniture, what can't leave the pack and no_bag; tools
 *   keep their wear. It can't be picked up or sold until it is empty. Its
 *   slots are saved on its row with the house (js/home-decor.js).
 * - A Storage Display Box (bag_furniture_sdb): set selling price / edit /
 *   stop selling, remove (how many), deposit (which item, how many), collect
 *   currants; a visitor's purchase opens its store (the count, "Buy: N for
 *   X"). The price tag (sdb_cost) shows over a selling box, and the owner sees
 *   a pile of currants on a box with income (sdb_collect).
 *
 * Solo: the owner stocks and prices; nobody buys (there are no other players
 * and the source had no NPC buyers), so collect stays at "There's nothing to
 * collect."
 *
 * Multiplayer (engine.mode and the realtime client): the site keeps prices
 * and income (src/LedgerBoxes.php). A visitor in the house buys through the
 * realtime server (home_boxes.go sdb_buy), which checks they stand in the
 * house and the owner does not block them; the site reads the price and the
 * stock from the stored box, cuts the count to the stock, moves the currants
 * and the things in the ledger at once and keeps the currants on the box. A
 * key-holder (players/inc_acl_keys.js) opens the owner's cabinets the same
 * way (cabinet_move). Every purchase and move has its own op id, applied once
 * through the trade slice (ledgerReceipt); one the answer never came back for
 * is asked again on the next connect. The owner, online or when they next
 * load, applies their side of each (the box loses what was bought, the
 * cabinet the stack: applyOwnerOp), and collects the box's currants later.
 *
 * QA: window.groddleHomeStorage: state(), act(uid, verbId), open(uid),
 * put(cls, n, slot), take(slot, n), buy(n), price(uid, p), standNear(uid);
 * canvas data hstWhere (own | visit:<owner> | ''), hstBoxes
 * (uid:class:count:price:selling, ';'), hstCabinet (uid:used/capacity of the
 * open one), hstLast.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, removeItem } from '../inventory.js?v=60dfc9ca';
import { displayRefusal, furnitureDef, furnitureSize, isFurniture } from '../home-decor.js?v=d6fabb62';
import { pieceLabel } from '../furniture-upgrades.js?v=a3788c0d';
import { textureFromUrl } from '../textures.js?v=f024bd6a';
import { stackMaxOf, isBagClass } from '../pack-slots.js?v=6cf9f397';
import { ELEMENT_CLASSES, NO_BAG_CLASSES, NO_SLOT_CLASSES } from '../pack-slots-data.js?v=800f664c';
import { TOOL_CONDITION_CATALOG, copyTagKind, copyTags, receiveToolCopy, setCopyTag, takeToolCopy } from '../tools.js?v=5f482998';
import { scriptFromTag, scriptLabel } from '../teleportation.js?v=1050225e';
import { possessive, readVisitScene } from '../neighbours-mp.js?v=f221f6e6';
import { saveStore } from '../save-store.js?v=8839ba7b';
import { homesFeature } from './homes-feature.js?v=5cc55db0';
import {
  SDB_PRICE_MAX,
  STORAGE_TEXT as T,
  applyOwnerOp,
  cabinetDef,
  cabinetMove,
  cabinetPut,
  cabinetRefusal,
  cabinetRoom,
  cabinetTake,
  cabinetVerbs,
  isCabinetClass,
  isSdbClass,
  isStorageClass,
  newOpId,
  normalizeContents,
  parseSdbPrice,
  slotHoldsBag,
  sdbBuyMax,
  sdbCheckEmpty,
  sdbQuote,
  sdbSelling,
  sdbStoreItem,
  sdbVerbs,
  setSdbPrice,
  slotsUsed,
} from '../home-storage.js?v=121f1897';
import {
  closeStorageWindow,
  openCabinetWindow,
  openCountDialog,
  openPickDialog,
  openPriceDialog,
  openStoreDialog,
  storageWindowKind,
} from '../ui/storage-windows.js?v=3436f2ed';

export const HOME_STORAGE_ID = 'home-storage';
export const CLASS_STORAGE = 'home_storage';
const PILE_ART = 'assets/sprites/street-jobs/pile_of_currants.webp';
const BIG_SPENDERS = [[1009, 'big_spender'], [2003, 'el_big_spenderino'], [5003, 'moneybags_magoo']];
const PENDING_KEEP = 24;
const RESEND_AFTER_MS = 4000;

let engineRef = null;
/** Drawn here now: uid -> { target, box, tag, coin, row, owner }. */
let drawn = new Map();
let drawnKey = '';
/** The house I visit now: { owner, name, key, roomX, pieces, data } (multiplayer). */
let visit = null;
/** The window open now: { kind: 'cabinet'|'store', uid, owner, handle }. */
let win = null;
/** My own boxes as the site has them (multiplayer): uid -> { price, selling, income, stock }. */
let ownBoxes = new Map();
let ownLoadedAt = 0;
let ownLoading = false;
/** My purchases and key-holder moves the server has not answered: [{ t, op, ...frame, at }]. */
let pending = [];
let client = null;
let wired = false;
let last = '';

const mp = (engine) => engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));

function labelOf(cls) {
  return ITEM_CATALOG[cls]?.label || furnitureDef(cls)?.label || String(cls || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function pluralOf(cls) {
  return ITEM_CATALOG[cls]?.namePlural || `${labelOf(cls)}s`;
}
function iconOf(cls) {
  return ITEM_CATALOG[cls]?.icon || itemIcon(cls);
}
const stackmax = (cls) => stackMaxOf(cls, ITEM_CATALOG);

/** What the remake knows of a class for canContain. */
function metaOf(cls) {
  const tags = ITEM_CATALOG[cls]?.tags || [];
  return { element: ELEMENT_CLASSES.has(cls), noSlot: NO_SLOT_CLASSES.has(cls) || isFurniture(cls), blocked: tags.includes('quest-item') || tags.includes('no_drop'), noBag: NO_BAG_CLASSES.has(cls) };
}
const isTool = (cls) => Boolean(TOOL_CONDITION_CATALOG[cls]);

function notice(engine, text, ms = 3600) {
  if (!text) return;
  last = text;
  engine.toast?.(text, ms);
  engine.pushActivity?.(text);
  publish(engine);
}

// ~~ Where am I ~~

/** 'own' (inside my own house, any floor), 'visit' (inside someone's house, multiplayer), or ''. */
function where(engine) {
  if (visit && readVisitScene(engine.streetTsid)?.owner === visit.owner && readVisitScene(engine.streetTsid)?.room === 'interior') return 'visit';
  if (!engine.homeContext?.()?.inHome) return '';
  const st = homesFeature._state?.();
  if (st?.scene?.room !== 'interior' || st.scene.construction) return '';
  return 'own';
}

function ownState() {
  const st = homesFeature._state?.();
  return { decor: st?.decor, ground: Boolean(st?.decor && st.decor === st.houseDecor), roomX: st?.scene?.background?.houseX || 0, mode: st?.mode || null };
}

function ownRow(uid) {
  return ownState().decor?.placed?.find((p) => p.id === Number(uid)) || null;
}

/** The rows drawn here, with where they stand in world x. */
function rowsHere(engine) {
  const w = where(engine);
  if (w === 'own') {
    const s = ownState();
    return (s.decor?.placed || []).filter((p) => isStorageClass(p.classTsid)).map((p) => ({ row: p, x: s.roomX + p.x, y: p.y, owner: true }));
  }
  if (w === 'visit') {
    return (visit.pieces || []).map(({ item }) => item).filter((p) => isStorageClass(p?.classTsid)).map((p) => ({ row: p, x: visit.roomX + Number(p.x), y: Number(p.y), owner: false }));
  }
  return [];
}

// ~~ Drawing: a hit box, a price tag and the owner's currants on each piece ~~

function priceTag(engine, price) {
  const { PIXI } = engine;
  const tag = new PIXI.Container();
  const text = new PIXI.Text({ text: `${Math.max(0, Math.floor(price)).toLocaleString('en-US')}c`, style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 12, fontWeight: '700', fill: 0x24461e, padding: 2 } });
  text.resolution = 3;
  text.anchor.set(0.5);
  const w = Math.ceil(text.width) + 12;
  const bg = new PIXI.Graphics();
  bg.roundRect(-w / 2, -10, w, 20, 6).fill({ color: 0xe9f7c9 }).stroke({ width: 2, color: 0x6b8f3a });
  tag.addChild(bg, text);
  tag.zIndex = 41;
  tag.label = 'sdb-cost';
  return tag;
}

function clearDrawn(engine) {
  for (const e of drawn.values()) {
    if (e.target) engine.unregister?.(e.target);
    else if (e.box && !e.box.destroyed) e.box.destroy({ children: true });
    for (const s of [e.tag, e.coin]) if (s && !s.destroyed) s.destroy({ children: true });
  }
  drawn = new Map();
}

function boxShown(engine, row, owner) {
  if (!isSdbClass(row.classTsid)) return null;
  if (owner) {
    if (mp(engine) && ownState().ground) {
      const b = ownBoxes.get(row.id);
      return { selling: Boolean(b?.selling && sdbSelling({ ...row, selling: true, price: b.price })), price: b?.price || row.price || 0, income: b?.income || 0, stock: b?.stock ?? row.display?.count ?? 0 };
    }
    return { selling: sdbSelling(row), price: row.price || 0, income: 0, stock: row.display?.count || 0 };
  }
  const b = (visit?.data?.boxes || []).find((x) => Number(x.uid) === row.id);
  return b ? { selling: b.stock > 0, price: Number(b.price) || 0, income: 0, stock: Number(b.stock) || 0, class: String(b.class || '') } : { selling: false, price: 0, income: 0, stock: 0 };
}

function sceneKey(engine) {
  const w = where(engine);
  if (!w) return '';
  const s = ownState();
  const rows = rowsHere(engine).map(({ row, x, y }) => {
    const b = boxShown(engine, row, w === 'own');
    return `${row.id}:${row.classTsid}:${Math.round(x)}:${Math.round(y)}:${row.upgradeId || ''}:${row.display?.count || 0}:${b ? `${b.selling}:${b.price}:${b.income}:${b.stock}` : ''}`;
  });
  const sceneRef = w === 'own' ? homesFeature._state?.()?.scene : null;
  if (sceneRef && !sceneRef.__hstId) sceneRef.__hstId = Math.random().toString(36).slice(2);
  return `${w}:${engine.streetTsid}:${sceneRef?.__hstId || visit?.owner || ''}:${s.mode || ''}:${visit?.key ? 'k' : ''}|${rows.join(',')}`;
}

function draw(engine) {
  clearDrawn(engine);
  const { PIXI } = engine;
  if (!PIXI || !engine.entityLayer) return;
  const w = where(engine);
  const editing = w === 'own' && ownState().mode;
  for (const { row, x, y, owner } of rowsHere(engine)) {
    const def = furnitureDef(row.classTsid);
    if (!def) continue;
    const { w: bw, h } = furnitureSize(row.classTsid, row.upgradeId);
    const ceiling = def.slot === 'ceiling';
    const shown = boxShown(engine, row, owner);
    const e = { row, owner, target: null, box: null, tag: null, coin: null, x, y };
    // A visitor who holds no key sees a cabinet but can't select it (isSelectable: isOwner).
    const selectable = !editing && (owner || isSdbClass(row.classTsid) || visit?.key);
    if (selectable) {
      const box = new PIXI.Container();
      box.x = Math.round(x);
      box.y = Math.round(y);
      box.zIndex = 13;
      const g = new PIXI.Graphics();
      g.rect(-bw / 2, ceiling ? 0 : -h, bw, h).fill({ color: 0xffffff, alpha: 0.001 });
      box.addChild(g);
      box._worldHitW = bw;
      box._worldHitH = h;
      engine.entityLayer.addChild(box);
      e.box = box;
      const name = pieceLabel(row, def.label) || def.label;
      let subtitle = owner ? 'Yours' : possessive(visit?.name || 'Someone');
      if (isCabinetClass(row.classTsid)) {
        const d = cabinetDef(row.classTsid);
        if (owner) subtitle = `${slotsUsed(row.contents)} of ${d.capacity} slots used`;
      } else if (shown?.selling) {
        subtitle = `${shown.stock.toLocaleString('en-US')} ${pluralOf(row.display?.classTsid || shown.class)} at ${shown.price.toLocaleString('en-US')}c each`;
      } else if (row.display?.count) subtitle = `${row.display.count.toLocaleString('en-US')} ${row.display.count === 1 ? labelOf(row.display.classTsid) : pluralOf(row.display.classTsid)}`;
      e.target = engine.register({ featureId: HOME_STORAGE_ID, classId: CLASS_STORAGE, label: name, subtitle, sprite: box, state: { uid: row.id, owner } });
    }
    if (shown?.selling) {
      // sdb_cost (getExtraConfig 944-957): the sale price over the box, 55 px up.
      const tag = priceTag(engine, shown.price);
      tag.x = Math.round(x);
      tag.y = Math.round(y) - h - 12;
      engine.entityLayer.addChild(tag);
      e.tag = tag;
    }
    if (owner && shown?.income > 0) {
      // sdb_collect (959-976): for the owner only, at -16, -6 from the box.
      const coin = new PIXI.Sprite(textureFromUrl(PILE_ART));
      coin.anchor.set(0.5, 1);
      coin.width = 20;
      coin.height = 24;
      coin.x = Math.round(x) - 16;
      coin.y = Math.round(y) - 6;
      coin.zIndex = 42;
      coin.label = 'sdb-collect';
      engine.entityLayer.addChild(coin);
      e.coin = coin;
    }
    drawn.set(row.id, e);
  }
}

function publish(engine) {
  const w = where(engine);
  engine.setData?.('hstWhere', w === 'visit' ? `visit:${visit.owner}` : w);
  engine.setData?.('hstBoxes', rowsHere(engine).filter(({ row }) => isSdbClass(row.classTsid)).map(({ row, owner }) => {
    const b = boxShown(engine, row, owner);
    return `${row.id}:${row.display?.classTsid || b?.class || ''}:${owner ? row.display?.count || 0 : b?.stock || 0}:${b?.price || 0}:${b?.selling ? 1 : 0}${owner && b?.income ? `:${b.income}` : ''}`;
  }).join(';'));
  engine.setData?.('hstCabinet', win?.kind === 'cabinet' ? `${win.uid}:${slotsUsed(win.slots)}/${win.slots?.length || 0}` : '');
  engine.setData?.('hstWindow', storageWindowKind());
  engine.setData?.('hstLast', last);
}

function redraw(engine, force = false) {
  const key = sceneKey(engine);
  if (!force && key === drawnKey) return;
  drawnKey = key;
  draw(engine);
  publish(engine);
}

function changed(engine, { scene = false } = {}) {
  engine.save?.();
  if (scene) homesFeature.refreshFurniture?.(engine);
  redraw(engine, true);
  if (win?.kind === 'cabinet' && win.owner === 0) win.handle.update(ownRow(win.uid)?.contents || [], '');
}

// ~~ The site (multiplayer) ~~

function createSite() {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  let nonce = /^[0-9a-f]{10}$/.test(String(boot.nonce || '')) ? String(boot.nonce) : '';
  const api = new URL('wp-json/groddle/v1/', document.baseURI).href;
  const nonceUrl = boot.nonceUrl || new URL('wp-admin/admin-ajax.php?action=rest-nonce', document.baseURI).href;
  async function refresh() {
    try {
      const res = await fetch(nonceUrl, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* the answer below stands */ }
    return false;
  }
  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = {};
      if (nonce) headers['X-WP-Nonce'] = nonce;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let res;
      try {
        res = await fetch(api + path, { method, credentials: 'same-origin', cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch {
        throw Object.assign(new Error(T.offline), { status: 0 });
      }
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(typeof data?.message === 'string' ? data.message : T.failed), { status: res.status, code: data?.code || '' });
      return data;
    }
    throw new Error(T.failed);
  }
  return {
    mine: () => call('homes/boxes'),
    price: (uid, price) => call('homes/boxes', { method: 'PUT', body: { uid, price } }),
    stop: (uid) => call(`homes/boxes/${Number(uid)}`, { method: 'DELETE' }),
    collect: (uid, op) => call(`homes/boxes/${Number(uid)}/collect`, { method: 'POST', body: { op } }),
    street: (owner) => call(`homes/${Number(owner)}/street`),
    cabinet: (owner, uid) => call(`homes/${Number(owner)}/cabinets/${Number(uid)}`),
  };
}
let site = null;
const siteApi = () => (site ||= createSite());

/** Writes the save now and waits for it (the site reads the stored house; home-street-mp-feature flush). */
async function flush(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    try {
      await saveStore.flush();
    } catch {
      return false;
    }
    if (saveStore.state === 'saved') return true;
    if (['conflict', 'elsewhere', 'signed-out', 'error', 'offline'].includes(saveStore.state)) return false;
  }
  return saveStore.state === 'saved';
}

/** My boxes' prices and income, and my side of what others did to my house (applied once each). */
async function loadOwn(engine, { force = false } = {}) {
  if (!mp(engine) || ownLoading || (!force && Date.now() - ownLoadedAt < 4000)) return;
  ownLoading = true;
  try {
    const a = await siteApi().mine();
    ownBoxes = new Map((a?.boxes || []).map((b) => [Number(b.uid), { price: Number(b.price) || 0, selling: b.selling === true, income: Number(b.income) || 0, stock: Number(b.stock) || 0, class: String(b.class || '') }]));
    ownLoadedAt = Date.now();
    applyOwnerOps(engine, a?.ops || []);
  } catch (err) {
    console.warn('[home-storage]', err?.message || err);
  } finally {
    ownLoading = false;
  }
  redraw(engine, true);
}

/** sdb_sold, cabinet_changed, or a load: each op others made on my house comes out of (or into) it once. */
function applyOwnerOps(engine, ops) {
  const st = homesFeature._state?.();
  const ground = st?.houseDecor;
  if (!ground) return;
  let any = false;
  for (const raw of ops) {
    const op = String(raw?.op || '');
    if (!/^(sdb|cab)-[0-9a-f]{16}-o$/.test(op)) continue;
    // False: a load (the site's catch-up) or an earlier word applied it already.
    if (engine.query?.('ledgerReceipt', op, engine) !== true) continue;
    const cls = String(raw.class || '');
    const left = applyOwnerOp(ground, { kind: raw.kind, uid: raw.uid, classTsid: cls, n: raw.n, slot: Number.isInteger(raw.slot) ? raw.slot : null }, { max: stackmax });
    if (left.take) removeItem(engine.inv, cls, Math.min(left.take, countItem(engine.inv, cls)));
    if (left.give) {
      ensureItem(cls);
      addItem(engine.inv, cls, left.give);
    }
    any = true;
  }
  if (any) {
    engine.refreshPack?.();
    // Saved at once, so the site sees them applied before the trade slice's list moves on.
    flush(engine);
    homesFeature.refreshFurniture?.(engine);
    if (win?.kind === 'cabinet' && win.owner === 0) win.handle.update(ownRow(win.uid)?.contents || []);
  }
}

// ~~ Cabinets ~~

function cabinetTitle(row) {
  return pieceLabel(row, furnitureDef(row.classTsid)?.label || 'Cabinet');
}

function accepts(cls) {
  const refused = cabinetRefusal(cls, metaOf(cls));
  if (refused) return refused.msg;
  if (win?.owner && isTool(cls)) return T.ownerTools;
  return null;
}

function itemView(cls, slot = null) {
  const cap = TOOL_CONDITION_CATALOG[cls]?.capacity;
  // A Teleportation Script in a slot goes by its street (teleportation_script.js getLabel 254-260).
  const script = copyTagKind(cls) === 'script' ? scriptFromTag(slot?.tags?.[0]) : null;
  return { label: script ? scriptLabel(script) : labelOf(cls), plural: pluralOf(cls), icon: iconOf(cls), wear: cap ? (points) => (Array.isArray(points) && points.length ? Math.max(0, Math.min(1, Number(points[0]) / cap)) : null) : null };
}

function openCabinet(engine, uid, { owner = 0 } = {}) {
  const row = owner ? (visit?.pieces || []).map((p) => p.item).find((p) => Number(p?.id) === Number(uid)) : ownRow(uid);
  if (!row || !isCabinetClass(row.classTsid)) return false;
  const d = cabinetDef(row.classTsid);
  const slots = owner ? normalizeContents(row.classTsid, row.contents, stackmax) : (row.contents = normalizeContents(row.classTsid, row.contents, stackmax));
  win = { kind: 'cabinet', uid: row.id, owner, slots, cls: row.classTsid, handle: null };
  const handle = openCabinetWindow({
    title: cabinetTitle(row),
    sub: owner ? `${possessive(visit?.name || 'Someone')} house` : T.slots(d.capacity),
    art: furnitureDef(row.classTsid)?.art?.path || '',
    cols: d.cols,
    rowsDisplay: d.rowsDisplay,
    slots,
    item: itemView,
    stackmax,
    accepts,
    moveHere: T.moveHere,
    put: ({ cls, count, copy, slot, bag }) => cabinetPutFromPack(engine, cls, count, { slot, copy, bag }),
    take: (slot, n) => cabinetTakeToPack(engine, slot, n),
    move: (from, to) => cabinetMoveSlot(engine, from, to),
    onClose: () => {
      if (win?.handle === handle) win = null;
      publish(engine);
    },
  });
  win.handle = handle;
  if (owner) refreshVisitCabinet(engine);
  publish(engine);
  return true;
}

async function refreshVisitCabinet(engine) {
  if (!win || win.kind !== 'cabinet' || !win.owner) return;
  const { owner, uid } = win;
  try {
    const a = await siteApi().cabinet(owner, uid);
    if (win?.owner === owner && win.uid === uid) {
      win.slots = normalizeContents(win.cls, a?.contents, stackmax);
      win.handle.update(win.slots);
      publish(engine);
    }
  } catch (err) {
    if (win?.owner === owner) win.handle.note(err?.message || T.failed, true);
  }
}

/**
 * The pack's bag a move into a cabinet means (#108): the one dragged or whose menu is open,
 * else the one of its class that leaves last anyway. Returns { key, box } or null.
 */
function packBag(engine, cls, key = '') {
  const layout = engine.query?.('packLayout', engine);
  if (!layout?.bags) return null;
  const named = String(key || engine.query?.('packMenuBagKey') || '');
  if (layout.bags[named]?.cls === cls) return { key: named, box: layout.bags[named] };
  const mine = (layout.pack?.slots || []).filter((s) => s.kind === 'bag' && s.cls === cls);
  const last = mine.at(-1);
  return last && layout.bags[last.key] ? { key: last.key, box: layout.bags[last.key] } : null;
}

/**
 * A bag into the owner's cabinet whole (#108, CabinetDialog.as onPackDrag: bags go in with
 * what they hold): it leaves the pack with its contents and name (bags-feature packTakeBag,
 * as a drop does) and the slot keeps them. Returns 1 when it went in, else 0.
 */
function cabinetPutBag(engine, row, cls, bag, slot) {
  const at = Number.isInteger(slot) ? slot : row.contents.indexOf(null);
  if (at < 0 || at >= row.contents.length || row.contents[at]) {
    win.handle.note(T.full, true);
    return 0;
  }
  const res = engine.query?.('packTakeBag', bag.key, engine);
  if (!res?.ok) {
    win.handle.note(T.failed, true);
    return 0;
  }
  const contents = (res.contents || []).map((c) => ({ classTsid: c.cls, count: c.count, ...(Array.isArray(c.points) ? { points: c.points } : {}), ...(Array.isArray(c.tags) ? { tags: c.tags } : {}) }));
  cabinetPut(row.contents, cls, 1, { slot: at, contents, name: res.name || '' });
  engine.refreshPack?.();
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  win.slots = row.contents;
  changed(engine);
  return 1;
}

/** A pack stack into the cabinet (the slot named, else where it fits). Returns how many went in. */
function cabinetPutFromPack(engine, cls, count, { slot = null, copy = null, bag = '' } = {}) {
  if (!win || win.kind !== 'cabinet') return 0;
  const why = accepts(cls);
  if (why) {
    win.handle.note(why, true);
    return 0;
  }
  // #108: a bag goes in whole, with what it holds (the owner's own cabinet); a key-holder moves empty bags only.
  const held = isBagClass(cls) ? packBag(engine, cls, bag) : null;
  if (held && (held.box.slots?.length || held.box.name)) {
    if (win.owner) {
      win.handle.note(T.ownerBags, true);
      return 0;
    }
    const row = ownRow(win.uid);
    if (!row) return 0;
    row.contents = normalizeContents(row.classTsid, row.contents, stackmax);
    return cabinetPutBag(engine, row, cls, held, Number.isInteger(slot) ? slot : null);
  }
  // An empty bag: the one chosen is the one that leaves (pack-slots.js bagLeavesLast), not another of its class.
  if (held) engine.query?.('packBagLeaves', held.key);
  const have = countItem(engine.inv, cls);
  let n = Math.min(Math.max(1, Math.floor(Number(count) || 1)), have);
  if (!n) {
    win.handle.note('That stack is no longer in your pack.', true);
    return 0;
  }
  if (win.owner) return keyHolderMove(engine, 'put', cls, n, slot);
  const row = ownRow(win.uid);
  if (!row) return 0;
  row.contents = normalizeContents(row.classTsid, row.contents, stackmax);
  n = Math.min(n, cabinetRoom(row.contents, cls, stackmax(cls), Number.isInteger(slot) ? slot : null));
  if (!n) {
    win.handle.note(T.full, true);
    return 0;
  }
  // A tool takes its wear in with it (js/tools.js copies): the dragged copy first.
  let points = null;
  if (isTool(cls) && engine.toolState) {
    // The dragged tool's own slot is the one that empties (bags-feature packTakeUnit), not the first of its class.
    if (Number.isInteger(copy)) engine.query?.('packTakeUnit', cls, copy, 1, engine);
    points = [];
    for (let i = 0; i < n; i += 1) points.push(takeToolCopy(engine.toolState, cls, i === 0 && Number.isInteger(copy) ? { copy } : {}));
  }
  // Its own words go in with it (the copies about to leave are the last ones now).
  const tags = copyTagKind(cls) && engine.toolState ? copyTags(engine.toolState, cls).slice(-n) : null;
  const put = cabinetPut(row.contents, cls, n, { slot: Number.isInteger(slot) ? slot : null, max: stackmax(cls), points, tags });
  removeItem(engine.inv, cls, put);
  engine.refreshPack?.();
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  win.slots = row.contents;
  changed(engine);
  return put;
}

/** A slot's stack (n of it) back into the pack, as much as the pack takes. */
function cabinetTakeToPack(engine, slot, n) {
  if (!win || win.kind !== 'cabinet') return 0;
  const s = win.slots?.[slot];
  if (!s) return 0;
  const room = engine.query?.('packRoom', s.classTsid, n, engine);
  let k = Math.min(Math.max(1, Math.floor(Number(n) || 1)), s.count);
  if (Number.isFinite(room)) k = Math.min(k, room);
  if (k <= 0) {
    win.handle.note(T.noRoom, true);
    return 0;
  }
  if (win.owner) {
    // #108: a bag with things in it comes out only to the owner (the site moves counts).
    if (slotHoldsBag(s)) {
      win.handle.note(T.ownerBags, true);
      return 0;
    }
    return keyHolderMove(engine, 'take', s.classTsid, k, slot);
  }
  const row = ownRow(win.uid);
  if (!row) return 0;
  const cls = s.classTsid;
  // #108: a bag comes back whole, with what it held and its name, where it fits (bags-feature packGiveBag).
  if (isBagClass(cls) && engine.query?.('packBagRoom', cls, [], engine) != null) {
    const contents = (s.contents || []).map((c) => ({ cls: c.classTsid, count: c.count, ...(c.points ? { points: c.points } : {}), ...(c.tags ? { tags: c.tags } : {}) }));
    if (!engine.query('packBagRoom', cls, contents, engine)) {
      win.handle.note(T.noRoom, true);
      return 0;
    }
    const keep = JSON.parse(JSON.stringify(s));
    const out = cabinetTake(row.contents, cls, 1, { slot });
    if (!out.taken) return 0;
    ensureItem(cls);
    for (const c of contents) ensureItem(c.cls);
    const res = engine.query('packGiveBag', cls, contents, engine, out.name || '');
    if (!res?.ok) {
      // It didn't fit after all: it stays in its slot, as it was.
      row.contents[slot] = keep;
      win.handle.note(T.noRoom, true);
      return 0;
    }
    engine.refreshPack?.();
    engine.playSound?.('ITEM_PICKUP', { volume: 0.4 });
    win.slots = row.contents;
    changed(engine);
    return 1;
  }
  const out = cabinetTake(row.contents, cls, k, { slot });
  ensureItem(cls);
  addItem(engine.inv, cls, out.taken);
  if (isTool(cls) && engine.toolState) for (const p of out.points) receiveToolCopy(engine.toolState, cls, p, 1);
  // ... and their own words, on the copies that just came (the newest).
  if (copyTagKind(cls) && engine.toolState && out.tags?.some((t) => t != null)) {
    const held = countItem(engine.inv, cls);
    out.tags.forEach((t, i) => { if (t != null) setCopyTag(engine.toolState, cls, held - out.tags.length + i, t); });
  }
  engine.refreshPack?.();
  engine.playSound?.('ITEM_PICKUP', { volume: 0.4 });
  win.slots = row.contents;
  changed(engine);
  if (out.taken < n && out.taken < s.count) win.handle.note(T.noRoom, true);
  return out.taken;
}

function cabinetMoveSlot(engine, from, to) {
  if (!win || win.kind !== 'cabinet' || win.owner) return false;
  const row = ownRow(win.uid);
  if (!row) return false;
  const s = row.contents?.[from];
  if (!s) return false;
  const ok = cabinetMove(row.contents, from, to, stackmax(s.classTsid));
  if (ok) {
    win.slots = row.contents;
    changed(engine);
  }
  return ok;
}

/** A key-holder's move on someone else's cabinet: through the realtime server and the site. */
function keyHolderMove(engine, kind, cls, n, slot) {
  if (!client || client.state !== 'online') {
    win?.handle.note(T.offline, true);
    return 0;
  }
  if (isTool(cls)) {
    win?.handle.note(T.ownerTools, true);
    return 0;
  }
  const frame = { owner: win.owner, uid: win.uid, op: newOpId('cab'), kind, class: cls, n };
  if (Number.isInteger(slot)) frame.slot = slot;
  remember({ t: 'cabinet_move', ...frame });
  client.send('cabinet_move', frame);
  win.handle.note('…');
  return n;
}

// ~~ The Storage Display Box ~~

function ownBoxInfo(engine, row) {
  return boxShown(engine, row, true) || { selling: false, price: 0, income: 0, stock: 0 };
}

/** Furniture listing of the box itself (home-street-mp-feature): canVend is false while it is for sale. */
function forSale(engine, row) {
  const verbs = engine.query?.('furnitureSaleLock', homesFeature._state?.()?.houseDecor, row.id, engine);
  return typeof verbs === 'string' && Boolean(verbs);
}

function depositChoices(engine, row) {
  return Object.entries(engine.inv)
    .filter(([cls, n]) => n > 0 && ITEM_CATALOG[cls] && !displayRefusal(row, cls, { tool: isTool(cls), bag: isBagClass(cls), blocked: metaOf(cls).blocked }))
    .map(([cls, n]) => ({ cls, label: labelOf(cls), icon: iconOf(cls), count: n }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 80);
}

function sdbOwnerVerbs(engine, row) {
  const info = ownBoxInfo(engine, row);
  const online = mp(engine) && ownState().ground;
  const view = { ...row, selling: info.selling, price: info.price };
  const has = row.display ? countItem(engine.inv, row.display.classTsid) > 0 : true;
  const verbs = sdbVerbs(view, { owner: true, forSale: forSale(engine, row), income: info.income, has, fits: depositChoices(engine, row).length > 0, online });
  return verbs.map((v) => (v.id === 'sdb_deposit' && v.reason?.startsWith("You don't have anymore") ? { ...v, reason: T.noneLeft(pluralOf(row.display.classTsid)) } : v));
}

function openPricer(engine, row) {
  const cls = row.display?.classTsid;
  if (!cls) return;
  const info = ownBoxInfo(engine, row);
  openPriceDialog({
    title: T.setSelling.replace(/^./, (c) => c.toUpperCase()),
    single: T.pricerTitle(labelOf(cls)),
    qty: `${T.pricerTitle(labelOf(cls))}. ${T.pricerQty(row.display.count)}`,
    value: info.price || 1,
    help: T.priceHelp,
    submit: T.setPrice,
    onSet: async (text) => {
      const price = parseSdbPrice(text);
      if (price == null) return T.priceHelp;
      return setPrice(engine, row, price);
    },
  });
}

/** onInputBoxResponse: a price over 0 sells, 0 stops. Answers words for the dialog, or ''. */
async function setPrice(engine, row, price) {
  const was = { selling: row.selling, price: row.price };
  const res = setSdbPrice(row, price, { forSale: forSale(engine, row) });
  if (!res.ok) return res.msg;
  if (mp(engine) && ownState().ground) {
    try {
      // The site reads the stored house: what is in the box now must be saved first.
      await flush(engine);
      const a = price > 0 ? await siteApi().price(row.id, price) : await siteApi().stop(row.id);
      ownBoxes = new Map((a?.boxes || []).map((b) => [Number(b.uid), { price: Number(b.price) || 0, selling: b.selling === true, income: Number(b.income) || 0, stock: Number(b.stock) || 0, class: String(b.class || '') }]));
      applyOwnerOps(engine, a?.ops || []);
      client?.send?.('home_refresh', { what: 'boxes' });
    } catch (err) {
      row.selling = was.selling;
      row.price = was.price;
      if (!row.selling) delete row.selling;
      if (!row.price) delete row.price;
      return err?.message || T.failed;
    }
  }
  const cls = row.display?.classTsid;
  notice(engine, price > 0 ? T.nowSelling(pluralOf(cls), price) : T.stopped(pluralOf(cls)), 3000);
  changed(engine);
  return '';
}

function openRemove(engine, row) {
  const cls = row.display?.classTsid;
  if (!cls) return;
  const room = engine.query?.('packRoom', cls, row.display.count, engine);
  const max = Math.max(1, Math.min(row.display.count, Number.isFinite(room) ? room : row.display.count));
  if (Number.isFinite(room) && room < 1) return notice(engine, T.noRoom, 2600);
  openCountDialog({ title: T.removeHow(pluralOf(cls)), icon: iconOf(cls), label: labelOf(cls), max, verb: 'Remove', onOk: (n) => sdbRemove(engine, row, n) });
  return undefined;
}

/** remove 495-575: n of the box's class back into the pack; an emptied box stops selling. */
function sdbRemove(engine, row, n) {
  const cls = row.display?.classTsid;
  if (!cls) return 0;
  const k = Math.min(n, row.display.count);
  row.display.count -= k;
  ensureItem(cls);
  addItem(engine.inv, cls, k);
  engine.refreshPack?.();
  const emptied = sdbCheckEmpty(row);
  if (emptied && mp(engine) && ownState().ground && ownBoxes.get(row.id)?.selling) {
    flush(engine).then(() => siteApi().stop(row.id)).then(() => client?.send?.('home_refresh', { what: 'boxes' })).catch(() => {});
  }
  if (mp(engine) && ownState().ground) flush(engine).then(() => client?.send?.('home_refresh', { what: 'boxes' }));
  changed(engine, { scene: true });
  return k;
}

function openDeposit(engine, row) {
  const items = depositChoices(engine, row);
  if (!items.length) return notice(engine, T.nothingFits, 2600);
  const ask = (cls) => {
    const have = countItem(engine.inv, cls);
    if (have <= 1) return sdbDeposit(engine, row, cls, 1);
    openCountDialog({ title: T.depositHow(pluralOf(cls)), icon: iconOf(cls), label: labelOf(cls), max: have, verb: 'Deposit', onOk: (n) => sdbDeposit(engine, row, cls, n) });
    return undefined;
  };
  // A box that already shows a class takes only that (drop_ok_code 624-636).
  if (row.display?.classTsid) return ask(row.display.classTsid);
  if (items.length === 1) return ask(items[0].cls);
  openPickDialog({ title: T.depositTip, items, onPick: ask });
  return undefined;
}

/** deposit 611-802: n of a class from the pack; the box takes that class from now on. */
function sdbDeposit(engine, row, cls, n) {
  if (forSale(engine, row)) return notice(engine, T.forSale, 2600);
  const refused = displayRefusal(row, cls, { tool: isTool(cls), bag: isBagClass(cls), blocked: metaOf(cls).blocked });
  if (refused) return notice(engine, refused.msg, 2600);
  const k = Math.min(n, countItem(engine.inv, cls));
  if (!k) return undefined;
  removeItem(engine.inv, cls, k);
  row.display = { classTsid: cls, count: (row.display?.count || 0) + k };
  engine.refreshPack?.();
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  if (mp(engine) && ownState().ground) flush(engine).then(() => client?.send?.('home_refresh', { what: 'boxes' }));
  changed(engine, { scene: true });
  return k;
}

/** collect_currants 804-853: the box's income, once per collection (the same op asked again on a retry). */
async function sdbCollect(engine, row) {
  if (!mp(engine) || !ownState().ground) return notice(engine, T.nothingToCollect, 2600);
  const info = ownBoxInfo(engine, row);
  if (!info.income) return notice(engine, T.nothingToCollect, 2600);
  const op = row.__collectOp || (row.__collectOp = newOpId('sdbc'));
  try {
    const a = await siteApi().collect(row.id, op);
    delete row.__collectOp;
    const n = Number(a?.currants) || 0;
    if (a?.credit && engine.query?.('ledgerReceipt', String(a.credit), engine) !== false) {
      engine.pc.currants = (engine.pc.currants || 0) + n;
      engine.updateHud?.();
    }
    const cls = String(a?.class || row.display?.classTsid || '');
    notice(engine, T.collected(n, cls ? pluralOf(cls) : ''), 4200);
    engine.playSound?.('PURCHASE_ITEM', { volume: 0.5 });
    flush(engine);
    await loadOwn(engine, { force: true });
  } catch (err) {
    if (err?.status === 404) delete row.__collectOp;
    notice(engine, err?.message || T.failed, 3200);
  }
  return undefined;
}

// ~~ A visitor's purchase (multiplayer) ~~

function visitBox(uid) {
  return (visit?.data?.boxes || []).find((b) => Number(b.uid) === Number(uid)) || null;
}

function openStore(engine, row) {
  const b = visitBox(row.id);
  if (!b || !(b.stock > 0)) return notice(engine, T.noLongerSelling, 2600);
  const cls = String(b.class);
  ensureItem(cls);
  const item = { cls, label: labelOf(cls), plural: pluralOf(cls), icon: iconOf(cls), cost: Number(b.price), count: Number(b.stock) };
  const handle = openStoreDialog({
    title: furnitureDef(row.classTsid)?.label || 'Storage Display Box',
    sub: possessive(visit.name),
    item,
    have: () => countItem(engine.inv, cls),
    max: (it) => {
      const room = engine.query?.('packRoom', cls, it.count, engine);
      const most = sdbBuyMax({ cost: it.cost, count: it.count }, engine.pc?.currants || 0);
      return Number.isFinite(room) ? Math.min(most, room) : most;
    },
    text: T,
    onBuy: (n, it) => buy(engine, row.id, cls, n, it.cost),
    onClose: () => {
      if (win?.handle === handle) win = null;
      publish(engine);
    },
  });
  win = { kind: 'store', uid: row.id, owner: visit.owner, cls, handle };
  publish(engine);
  return undefined;
}

/** purchase -> sellItem: the count and the price the store showed; the server and the site do the rest. */
function buy(engine, uid, cls, n, price) {
  const q = sdbQuote({ classTsid: cls, cost: price, count: n }, { count: n, price, currants: engine.pc?.currants || 0 });
  if (!q.ok) return q.msg;
  if (!client || client.state !== 'online') return T.offline;
  const frame = { owner: visit.owner, uid, op: newOpId('sdb'), count: n, price };
  remember({ t: 'sdb_buy', ...frame });
  client.send('sdb_buy', frame);
  return new Promise((resolve) => {
    waiting.set(frame.op, resolve);
    setTimeout(() => {
      if (waiting.has(frame.op)) {
        waiting.delete(frame.op);
        resolve('');
      }
    }, 9000);
  });
}
const waiting = new Map();

function remember(entry) {
  pending = [...pending.filter((p) => p.op !== entry.op), { ...entry, at: Date.now() }].slice(-PENDING_KEEP);
  engineRef?.save?.();
}

function settle(op) {
  const before = pending.length;
  pending = pending.filter((p) => p.op !== op);
  if (pending.length !== before) engineRef?.save?.();
}

function bought(engine, msg) {
  const op = String(msg.op || '');
  settle(op);
  const resolve = waiting.get(op);
  waiting.delete(op);
  if (msg.status !== 'settled') {
    const text = String(msg.text || T.failed);
    if (resolve) resolve(text);
    else notice(engine, text, 3200);
    // A price that moved, a box sold out: read the box again.
    if (visit && Number(msg.owner) === visit.owner) refreshVisit(engine);
    return;
  }
  const cls = String(msg.class || '');
  const n = Math.max(0, Math.floor(Number(msg.n) || 0));
  const total = Math.max(0, Math.floor(Number(msg.total) || 0));
  // Once per purchase: the trade slice remembers the op (the buyer's side of the ledger's trade).
  if (engine.query?.('ledgerReceipt', op, engine) !== false && cls && n) {
    engine.pc.currants = Math.max(0, (engine.pc.currants || 0) - total);
    ensureItem(cls);
    addItem(engine.inv, cls, n);
    engine.refreshPack?.();
    engine.updateHud?.();
    engine.playSound?.('PURCHASE_ITEM', { volume: 0.6 });
    // sellItem 1251-1261.
    for (const [at, badge] of BIG_SPENDERS) if (total >= at) engine.grantAchievement?.(badge);
    flush(engine);
  }
  const owner = Number(msg.owner);
  const name = visit?.owner === owner ? visit.name : 'them';
  notice(engine, T.bought(n, pluralOf(cls), labelOf(cls), total, name), 4200);
  if (visit?.owner === owner) {
    const b = visitBox(msg.uid);
    if (b) b.stock = Math.max(0, Number(msg.stock) || 0);
    setVisitCount(engine, Number(msg.uid), Math.max(0, Number(msg.stock) || 0));
    if (win?.kind === 'store' && win.uid === Number(msg.uid)) {
      if (b && b.stock > 0) win.handle.update({ count: b.stock });
      else win.handle.update({ count: 0 });
    }
    redraw(engine, true);
  }
  if (resolve) resolve('');
}

/** The visited box's count badge (homes-feature furnitureView draws it from the owner's stored save). */
function setVisitCount(engine, uid, stock) {
  const piece = (visit?.pieces || []).find((p) => Number(p.item?.id) === uid);
  if (!piece) return;
  if (piece.item.display) piece.item.display.count = stock;
  const badge = piece.box?.children?.find?.((c) => c.label === 'sdb-count');
  if (badge) badge.text = String(stock);
  if (!stock) for (const c of piece.box?.children || []) if (c.label === 'sdb-count' || c.label === 'sdb-icon') c.alpha = 0.4;
}

function cabinetMoved(engine, msg) {
  const op = String(msg.op || '');
  settle(op);
  const kind = String(msg.kind || '');
  if (msg.status !== 'settled') {
    if (win?.kind === 'cabinet' && win.owner === Number(msg.owner)) {
      win.handle.note(String(msg.text || T.failed), true);
      refreshVisitCabinet(engine);
    } else notice(engine, String(msg.text || T.failed), 3200);
    return;
  }
  const cls = String(msg.class || '');
  const n = Math.max(0, Math.floor(Number(msg.n) || 0));
  if (engine.query?.('ledgerReceipt', op, engine) !== false && cls && n) {
    if (kind === 'take') {
      ensureItem(cls);
      addItem(engine.inv, cls, n);
    } else if (kind === 'put') removeItem(engine.inv, cls, Math.min(n, countItem(engine.inv, cls)));
    engine.refreshPack?.();
    flush(engine);
  }
  if (win?.kind === 'cabinet' && win.owner === Number(msg.owner) && win.uid === Number(msg.uid)) {
    if (Array.isArray(msg.contents)) {
      win.slots = normalizeContents(win.cls, msg.contents, stackmax);
      win.handle.update(win.slots);
    } else refreshVisitCabinet(engine);
  }
  publish(engine);
}

async function refreshVisit(engine) {
  if (!visit) return;
  const owner = visit.owner;
  try {
    const data = await siteApi().street(owner);
    if (visit?.owner !== owner) return;
    visit.data = data;
    visit.key = visit.key || data?.key === true;
    for (const b of data?.boxes || []) setVisitCount(engine, Number(b.uid), Number(b.stock) || 0);
    if (win?.kind === 'store' && win.owner === owner) {
      const b = visitBox(win.uid);
      const was = win.handle.item();
      if (!b) win.handle.update({ count: 0 }, T.noLongerSelling, true);
      else if (Number(b.price) !== was.cost) {
        win.handle.update({ cost: Number(b.price), count: Number(b.stock) });
        engine.prompt?.({ title: T.priceChangedTitle, text: T.priceChanged(was.cost, Number(b.price)), choices: [{ label: T.thanks, value: true }] });
      } else win.handle.update({ count: Number(b.stock) });
    }
  } catch (err) {
    console.warn('[home-storage]', err?.message || err);
  }
  redraw(engine, true);
}

function wire(engine) {
  if (wired) return;
  client = engine.query?.('realtimeClient');
  if (!client?.on) return;
  wired = true;
  client.on('msg:sdb_bought', (msg) => bought(engine, msg));
  client.on('msg:cabinet_moved', (msg) => cabinetMoved(engine, msg));
  client.on('msg:sdb_sold', () => loadOwn(engine, { force: true }));
  client.on('msg:cabinet_changed', (msg) => {
    if (Number(msg.owner) === Number(client.me?.id)) loadOwn(engine, { force: true });
    else if (visit && Number(msg.owner) === visit.owner) {
      if (win?.kind === 'cabinet' && win.owner === visit.owner && win.uid === Number(msg.uid)) refreshVisitCabinet(engine);
    }
  });
  client.on('msg:box_changed', (msg) => {
    if (!visit || Number(msg.owner) !== visit.owner) return;
    const b = visitBox(msg.uid);
    if (b) b.stock = Math.max(0, Number(msg.stock) || 0);
    setVisitCount(engine, Number(msg.uid), Math.max(0, Number(msg.stock) || 0));
    if (win?.kind === 'store' && win.uid === Number(msg.uid)) win.handle.update({ count: b?.stock || 0 });
    redraw(engine, true);
  });
  client.on('msg:home_refresh', (msg) => {
    if (msg.what === 'boxes' && visit && Number(msg.owner) === visit.owner) refreshVisit(engine);
  });
  // What the server never answered is asked again (the site settles each op once).
  client.on('hello', () => {
    const now = Date.now();
    for (const p of pending) if (now - p.at > RESEND_AFTER_MS) {
      const { t, at, ...frame } = p;
      client.send(t, frame);
    }
  });
}

// ~~ Verbs ~~

function verbsFor(target, engine) {
  const uid = Number(target?.state?.uid);
  if (target?.state?.owner) {
    const row = ownRow(uid);
    if (!row) return [];
    // G369: its style from its own menu, as any furniture's verbs.upgrade is (home-feature pieceStyleVerb).
    const style = homesFeature.pieceStyleVerb?.(uid, engine);
    const extra = style ? [style] : [];
    if (isCabinetClass(row.classTsid)) return [...cabinetVerbs({ canOpen: true, forSale: forSale(engine, row) }), ...extra];
    if (isSdbClass(row.classTsid)) return [...sdbOwnerVerbs(engine, row), ...extra];
    return [];
  }
  const row = (visit?.pieces || []).map((p) => p.item).find((p) => Number(p?.id) === uid);
  if (!row) return [];
  if (isCabinetClass(row.classTsid)) return cabinetVerbs({ canOpen: Boolean(visit?.key) });
  if (isSdbClass(row.classTsid)) {
    const b = visitBox(uid);
    return sdbVerbs({ ...row, display: b ? { classTsid: b.class, count: b.stock } : row.display, selling: Boolean(b?.stock > 0), price: b?.price || 0 }, { owner: false });
  }
  return [];
}

function runVerb(target, verbId, engine) {
  const uid = Number(target?.state?.uid);
  const own = Boolean(target?.state?.owner);
  const verb = verbsFor(target, engine).find((v) => v.id === verbId);
  if (verb && verb.enabled === false) {
    if (verb.reason) notice(engine, verb.reason, 2600);
    return true;
  }
  if (own && (verbId === 'upgrade' || verbId === 'change_style')) return homesFeature.openPieceStyle(uid, engine), true;
  if (verbId === 'cabinet_open') return openCabinet(engine, uid, { owner: own ? 0 : visit?.owner || 0 }), true;
  if (verbId === 'sdb_purchase') {
    const row = (visit?.pieces || []).map((p) => p.item).find((p) => Number(p?.id) === uid);
    if (row) openStore(engine, row);
    return true;
  }
  const row = own ? ownRow(uid) : null;
  if (!row) return false;
  if (verbId === 'sdb_set_price' || verbId === 'sdb_edit_price') return openPricer(engine, row), true;
  if (verbId === 'sdb_stop') return setPrice(engine, row, 0).then((why) => why && notice(engine, why, 3200)), true;
  if (verbId === 'sdb_remove') return openRemove(engine, row), true;
  if (verbId === 'sdb_deposit') return openDeposit(engine, row), true;
  if (verbId === 'sdb_collect') return sdbCollect(engine, row), true;
  return false;
}

// ~~ QA ~~

function qa(engine) {
  if (typeof window === 'undefined') return;
  window.groddleHomeStorage = {
    state: () => ({ where: where(engine), currants: engine.pc?.currants ?? null, drawn: [...drawn.keys()], window: storageWindowKind(), win: win ? { kind: win.kind, uid: win.uid, owner: win.owner, slots: win.slots } : null, ownBoxes: Object.fromEntries(ownBoxes), visit: visit ? { owner: visit.owner, key: visit.key, boxes: visit.data?.boxes || [] } : null, pending: pending.map((p) => p.op), last }),
    act(uid, verbId) {
      const e = drawn.get(Number(uid));
      if (!e?.target) return null;
      if (!verbId) {
        const own = verbsFor(e.target, engine);
        const extra = engine.query ? (globalThis.groddleHomeStreet?.storageSaleVerbs?.(uid) || []) : [];
        return [...own, ...extra].map((v) => `${v.id}${v.enabled === false ? '!' : ''}`);
      }
      if (verbId.startsWith('furn_')) return globalThis.groddleHomeStreet?.storageSaleRun?.(uid, verbId) ?? false;
      return runVerb(e.target, verbId, engine);
    },
    open: (uid) => {
      const e = drawn.get(Number(uid));
      return e ? openCabinet(engine, Number(uid), { owner: e.owner ? 0 : visit?.owner || 0 }) : false;
    },
    put: (cls, n, slot = null, bag = '') => cabinetPutFromPack(engine, cls, n, { slot, bag }),
    take: (slot, n) => cabinetTakeToPack(engine, slot, n),
    move: (from, to) => cabinetMoveSlot(engine, from, to),
    buy: (n, price = null) => {
      if (win?.kind !== 'store') return Promise.resolve('no store open');
      return Promise.resolve(buy(engine, win.uid, win.cls, n, price ?? win.handle.item().cost));
    },
    /** QA tamper: send a purchase as a modified client would, straight to the server. */
    rawBuy: (frame) => client?.send?.('sdb_buy', { op: newOpId('sdb'), ...frame }),
    price: (uid, p) => {
      const row = ownRow(uid);
      return row ? setPrice(engine, row, p) : Promise.resolve('no box');
    },
    deposit: (uid, cls, n) => {
      const row = ownRow(uid);
      return row ? sdbDeposit(engine, row, cls, n) : 0;
    },
    remove: (uid, n) => {
      const row = ownRow(uid);
      return row ? sdbRemove(engine, row, n) : 0;
    },
    collect: (uid) => {
      const row = ownRow(uid);
      return row ? sdbCollect(engine, row) : null;
    },
    refresh: () => (where(engine) === 'visit' ? refreshVisit(engine) : loadOwn(engine, { force: true })),
    flush: () => flush(engine),
    close: () => closeStorageWindow(),
    standNear(uid) {
      const e = drawn.get(Number(uid));
      const p = engine.player;
      if (!e || !p) return false;
      p.x = e.x - 40;
      p.vx = 0;
      return true;
    },
  };
}

export const homeStorageFeature = {
  id: HOME_STORAGE_ID,

  init(engine) {
    engineRef = engine;
    qa(engine);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started && engine.started !== undefined) return;
    engineRef = engine;
    const w = where(engine);
    if (mp(engine)) {
      wire(engine);
      if (w === 'own' && ownState().ground && Date.now() - ownLoadedAt > 30000) loadOwn(engine);
    }
    if (w !== 'visit' && visit && !readVisitScene(engine.streetTsid)) visit = null;
    // Leaving the room closes its windows (the source's dialogs ended with the location).
    if (win && ((win.owner === 0 && w !== 'own') || (win.owner && (w !== 'visit' || visit?.owner !== win.owner)))) closeStorageWindow();
    redraw(engine);
  },

  onStreetClear(engine) {
    clearDrawn(engine);
    drawnKey = '';
    closeStorageWindow();
  },

  onStreetEnter(street, engine) {
    drawnKey = '';
    if (mp(engine) && where(engine) === 'own') loadOwn(engine, { force: true });
  },

  /** home-street-mp-feature onVisit: a visit scene was built ({ owner, name, room, key, spots }). */
  homeStorageVisit(info, engine) {
    if (engine?.mode !== 'multiplayer' || info?.room !== 'interior') {
      if (info?.room !== 'interior') visit = null;
      return null;
    }
    visit = { owner: Number(info.owner), name: String(info.name || ''), key: info.key === true, roomX: Number(info.spots?.roomX) || 0, pieces: info.spots?.pieces || [], data: null };
    drawnKey = '';
    refreshVisit(engine);
    return null;
  },

  verbsFor(target, engine) {
    return target?.classId === CLASS_STORAGE ? verbsFor(target, engine) : null;
  },

  runVerb(target, verbId, engine) {
    return target?.classId === CLASS_STORAGE ? runVerb(target, verbId, engine) : false;
  },

  /** homes-feature pick up (canPickup): a box with currants on it stays (online, the site's income). */
  storagePickupIncome(uid) {
    return ownBoxes.get(Number(uid))?.income || 0;
  },

  /** Put in <cabinet> on a pack stack's menu while a cabinet is open (the same move as a drag). */
  packVerbs(classTsid, engine) {
    if (win?.kind !== 'cabinet' || countItem(engine.inv, classTsid) < 1) return [];
    const why = accepts(classTsid);
    const row = win.owner ? null : ownRow(win.uid);
    const label = row ? cabinetTitle(row) : furnitureDef(win.cls)?.label || 'Cabinet';
    return [{ id: 'cabinet_put', label: `Put in ${label}`, enabled: !why, reason: why || '', tooltip: T.moveHere, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId !== 'cabinet_put' || win?.kind !== 'cabinet') return false;
    cabinetPutFromPack(engine, classTsid, Math.min(countItem(engine.inv, classTsid), Number.isFinite(stackmax(classTsid)) ? stackmax(classTsid) : countItem(engine.inv, classTsid)));
    return true;
  },

  save() {
    if (!pending.length) return undefined;
    return { pending };
  },

  restore(slice, engine) {
    pending = engine?.mode === 'multiplayer' && Array.isArray(slice?.pending)
      ? slice.pending.filter((p) => p && /^(sdb|cab)-[0-9a-f]{16}$/.test(String(p.op || '')) && (p.t === 'sdb_buy' || p.t === 'cabinet_move')).slice(-PENDING_KEEP)
      : [];
    visit = null;
    ownBoxes = new Map();
    ownLoadedAt = 0;
  },
};

export { SDB_PRICE_MAX };
