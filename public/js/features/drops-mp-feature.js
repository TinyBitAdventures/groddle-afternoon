/**
 * Stacks dropped on a public street, or at a player's home (their home
 * street, report #173; their house with its back yard and their Tower's
 * floors, G1190), are everyone's in multiplayer (register G332): a drop goes through the realtime server
 * (groddle-afternoon-server/drops.go, whose header lists the messages and
 * the source rules) to the site's ledger (src/LedgerDrop.php), every player
 * on the street sees the stack, and the first pickup wins. The pure rules
 * and words are js/drops-mp.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature answers nothing, so every drop is the player's own as always.
 * In multiplayer the same holds for a private place (a party space, a race,
 * an upper floor of the house), for food the owner drops on their own home street
 * (their animals there eat it from their own stacks: js/drops-mp.js), for a class the ledger does not carry, a note
 * (its writing would not travel), and whenever the server is out of reach: game.js drops those as it
 * always did.
 *
 * game.js asks three hooks: sharedDrop (dropPackItem, before the pack
 * changes: true when the drop went to the server), sharedPickup
 * (pickupDroppedWorldItem: true when it is a shared stack) and
 * sharedDroppedStacks (refreshDroppedWorldItems: the shared stacks to draw
 * beside the player's own). Pick up how many (G560): the count chosen, cut
 * to what fits the pack, goes with the pickup; the rest stays on the ground
 * and everyone on the street sees its new count (ground_left). Nothing leaves or enters the pack until the
 * server says the site moved it (ground_dropped, ground_taken, ground_back);
 * each applies once through the trade slice's applied list (ledgerReceipt),
 * and on every connect the site's list brings any answer that was missed.
 *
 * Piggies: a street Piggy eats a shared stack of food as the source's did
 * (items/npc_piggy.js onContainerItemAdded 1393-1411, onFoodPathing
 * 1482-1500): the server decides which Piggy and when and takes one off the
 * stack (drops.go ground_eaten); here the stack shrinks and the Piggy walks
 * over and chews (animal-mood-feature sharedAnimalEvent). Each page's own
 * Piggies (animal-mood-feature) still eat only the stacks in
 * engine.droppedItems, the player's own.
 *
 * Decoration Mode (R50, G1224 #655): the owner moving a stack dropped in their house or on a
 * Tower floor for everyone claims it (claimSharedStack): the server's first pickup has it whole,
 * as HandOfDecorator.as dragged any stack the owner could pick up, and the site's answer sets it
 * down where it was moved, in the owner's save and locked to them (house_lock, takeable.js
 * 179-198), joining a like stack it was laid on (#593). The pack never holds it, so a full pack
 * splits nothing; an answer that never came comes through the site's list on the next connect and
 * lands in the pack (sync): nothing is made twice or lost.
 *
 * The pack's drop prompt (game.js asks sharedDropPrompt) reads the drop
 * verb's tooltip, "Drop it on the ground.", when the stack is dropped for
 * everyone: shared stacks never merge.
 *
 * A drop shows at once (Austin 2026-11-24, "make it feel instant"): its count leaves the pack's view
 * (packHeld, game.js renderPackBar) and its stack shows where it lands, on the like stack it will join
 * or on its own (list), while the server weighs it; a floor move shows at its new spot the same way.
 * That is display only: the pack, the save and the ledger change on the server's answer as before
 * (apply). A refusal, a timeout or a lost connection puts the count back in the pack's view and takes
 * the stack away; a settled answer swaps it for the real one. Decoration Mode's move of a shared stack
 * onto a shelf or table (claim) shows the same way: off the floor at once and on the shelf, locked, on
 * the like stack it joins (ownStackGrowth) or on its own; refused or timed out, it is back on the floor
 * where it was (a late answer still sets it on the shelf, once). The drops wait their turn in the queue
 * (the server weighs one drop at a time per player, and the save is written before each), each shown
 * from the moment it is dropped.
 *
 * QA: canvas data sharedStacks, dropState (none|dropping|picking|claiming), dropLast,
 * dropEaten (the last bite: id:left:pig), dropPending (drops shown, not yet answered);
 * window.groddleDrops.
 */

import { ITEM_CATALOG, addItem, countItem, removeItem } from '../inventory.js?v=6414dbdc';
import { TOOL_CONDITION_CATALOG, leavingCopyTag, leavingToolWear, receiveToolCopy, takeToolCopy } from '../tools.js?v=4156bba8';
import { createMinnAccount } from '../minn-account.js?v=ca5f77b3';
import { saveStore, savedThrough } from '../save-store.js?v=4e720735';
import { ownGroundRows } from '../ground-stacks.js?v=22792362';
import { pileMaxOf } from '../world-items.js?v=a5deb102';
import { DROP_OP, DROP_QUEUE_MAX, DROP_TEXT, bucketTake, dropEffect, dropRefusalText, eatenStack, groundFrom, homePlaceOf, isFloorPlace, isPublicStreet, likeSharedStack, normalizeGroundStack, normalizeItem, normalizeMine, pickupAsk, pigAnimalKey, shareReason, stackAt, stackLeft } from '../drops-mp.js?v=34a8fc84';

export const DROPS_MP_FEATURE_ID = 'drops-mp';
const TABLE_URL = 'assets/content/trade-items.json';
const SYNC_EVERY_MS = 60000;
const WAIT_MS = 15000;

let multiplayer = false;

function itemLabel(c, n = 1) {
  const meta = ITEM_CATALOG[c];
  if (!meta) return String(c).replace(/_/g, ' ');
  return n === 1 ? meta.label : meta.namePlural || meta.label;
}

/** Writes the save and waits for it, so the ledger has seen what the drop takes (savedThrough, R28). */
export async function persist(engine, store = saveStore) {
  engine.save?.();
  return savedThrough(store);
}

function createSession(engine, client) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  let table = null;
  let tableLoading = null;
  /** The street the server last listed and its stacks (id -> stack). */
  let street = '';
  const stacks = new Map();
  /** The drop the server is weighing: { ref, c, n, r?, x, y, at }. */
  let dropping = null;
  /**
   * G1192: drops sent while one is being weighed wait here and go in order, each when the last is
   * answered and the server's rate allows (DROP_RATE): { street, classTsid, count, x, y, copy }.
   */
  const queue = [];
  /** The client's copy of drops.go's per-player bucket (drops and pickups alike). */
  const rate = { tokens: 0, at: 0 };
  let pumpTimer = null;
  /** The stack a pickup asked for: { id, at }. */
  let picking = null;
  /** The owner's floor-to-floor move the server is weighing: { id, at }. */
  let moving = null;
  let lastLine = '';
  let lastEaten = '';
  let syncing = false;
  let syncedAt = 0;
  let refN = 0;
  /**
   * Drops shown before the server answers, in order: { key, id ('pend-<n>', the stack drawn), street, c,
   * n (out of the pack's view), sx, y (where it lands, as the server keeps x), target (the stack it is
   * drawn joining: a server id or an earlier one's 'pend-' id), joinN, restN (drawn on its own), op
   * (once settled: the real stack it lies in, its own or the one it joined), at, done }.
   */
  const pending = [];
  let pendN = 0;
  /**
   * Decoration Mode's claims shown before the server's answer, in order (sent one at a time: the
   * server weighs one pickup per player): { id ('pend-claim-<n>', the stack drawn on the shelf), sid
   * (the shared stack), c, n, tsid, x, y, on, into, sent, done }.
   */
  const claims = [];
  let claimTimer = null;
  /** A claim whose answer did not come in time, by shared stack id: a late answer still sets it on the shelf. */
  const lateClaims = new Map();

  function loadTable() {
    if (table || tableLoading) return tableLoading;
    tableLoading = fetch(TABLE_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => { table = t && t.items ? t : { items: {}, untradeable: {} }; })
      .catch(() => { tableLoading = null; });
    return tableLoading;
  }
  loadTable();

  function publish() {
    engine.setData?.('sharedStacks', String(stacks.size));
    engine.setData?.('dropState', dropping ? 'dropping' : picking?.claim ? 'claiming' : picking ? 'picking' : 'none');
    engine.setData?.('dropQueue', String(queue.length));
    engine.setData?.('dropLast', lastLine);
    engine.setData?.('dropEaten', lastEaten);
    engine.setData?.('dropPending', String(pending.filter((q) => !q.done).length));
  }

  /** The pack's view of what the drops shown take out of it ({ class: n }), or null. */
  function held() {
    const out = {};
    for (const q of pending) if (!q.done) out[q.c] = (out[q.c] || 0) + q.n;
    return Object.keys(out).length ? out : null;
  }

  /** The drops shown changed: the done ones go, the pack and the stacks are drawn again. */
  function pendingChanged() {
    for (let i = pending.length - 1; i >= 0; i -= 1) if (pending[i].done) pending.splice(i, 1);
    for (let i = claims.length - 1; i >= 0; i -= 1) if (claims[i].done) claims.splice(i, 1);
    engine.refreshPack?.();
    redraw();
  }

  /** A drop shown ends (answered, refused, given up): its count shows in the pack again until the answer applies. */
  function endPending(q, { quiet = false } = {}) {
    if (!q || q.done) return;
    q.done = true;
    // The drops shown on it, and those waiting to be set on it, are on its real stack now (or, refused, on their own).
    const now = q.op && stacks.has(q.op) ? q.op : null;
    for (const o of pending) if (o.target === q.id) o.target = now;
    for (const w of queue) {
      if (w.into !== q.id) continue;
      w.into = now;
      if (!now) w.merge = false;
    }
    if (!quiet) pendingChanged();
  }

  function endAllPending() {
    if (!pending.length && !claims.length && !moving) return;
    for (const q of pending) q.done = true;
    for (const q of claims) q.done = true;
    moving = null;
    pendingChanged();
  }

  /** The like stack of the save a claim shown joins on its shelf (setDownStack's into), and how many it takes there. */
  function claimJoin(q) {
    if (!q.into) return null;
    const row = ownGroundRows(engine, q.tsid).find((r) => r?.id === q.into && r.classTsid === q.c && Number(r.count) > 0);
    if (!row) return null;
    const k = Math.max(0, Math.min(q.n, pileMaxOf(q.c) - Number(row.count)));
    return k > 0 ? { row, k } : null;
  }

  /** What the claims shown add to the save's own stacks at a place ({ row id: n }), or null (game.js draws them so). */
  function ownGrowth(tsid) {
    const out = {};
    for (const q of claims) {
      if (q.done || q.tsid !== tsid) continue;
      const j = claimJoin(q);
      if (j) out[j.row.id] = (out[j.row.id] || 0) + j.k;
    }
    return Object.keys(out).length ? out : null;
  }

  /** The claims shown on their shelf or table at a place, each on its own (what does not join a stack of the save). */
  function claimsShown(tsid) {
    const out = [];
    for (const q of claims) {
      if (q.done || q.tsid !== tsid) continue;
      const n = q.n - (claimJoin(q)?.k || 0);
      if (n > 0) out.push({ id: q.id, streetTsid: tsid, classTsid: q.c, count: n, x: q.x, y: q.y, ...(q.on != null ? { on: q.on } : {}), droppedAt: q.at, decor: true, pending: true, pendingDecor: true, shared: true });
    }
    return out;
  }

  /** The stack a drop shown joins, as an id in `map` (an earlier shown one now settled is its real stack), or null. */
  function targetIn(q, map) {
    if (!q.target) return null;
    if (map.has(q.target)) return q.target;
    const t = pending.find((o) => o.id === q.target);
    return t?.op && map.has(t.op) ? t.op : null;
  }

  function me() {
    const m = client.me || {};
    return { id: Number(m.id) || 0, name: String(m.name || '') };
  }

  /** The stack drawn for a drop shown, on its own. */
  function shownOwn(q, n) {
    const by = me();
    return { id: q.id, streetTsid: q.street, classTsid: q.c, count: n, x: q.sx, y: q.y, droppedAt: q.at, shared: true, pending: true, by, subtitle: `${DROP_TEXT.by(by.name || 'you')} · ${n} in this pile` };
  }

  /**
   * The place's stacks as they are drawn now (as the server keeps them): the server's, with each drop
   * shown on the stack it joins or on its own, and the floor move under way at its new spot.
   */
  function view(p = here()) {
    const out = new Map(stacks);
    if (!p || street !== p.street) return out;
    for (const q of pending) {
      if (q.done || q.street !== p.street) continue;
      const tid = targetIn(q, out);
      let rest = q.restN;
      if (tid && q.joinN > 0) out.set(tid, stackLeft(out.get(tid), out.get(tid).count + q.joinN));
      else rest += q.joinN;
      if (rest > 0) out.set(q.id, shownOwn(q, rest));
    }
    // A stack being set on a shelf or table is off the floor at once.
    for (const q of claims) if (!q.done) out.delete(q.sid);
    const s = moving && out.get(moving.id);
    if (s) {
      const t = moving.into ? out.get(moving.into) : null;
      const k = t ? moving.k : 0;
      if (t && k > 0 && !moving.joinSeen) out.set(t.id, stackLeft(t, t.count + k));
      if (s.count - k > 0) out.set(s.id, { ...stackLeft(s, s.count - k), x: moving.sx, y: moving.y });
      else out.delete(s.id);
    }
    return out;
  }

  /**
   * G1224: one redraw for a burst of changes (a house's floor holds any number of stacks, and joining
   * one the server may send many at once): every change asks, the stacks are drawn once, next frame.
   */
  let redrawDue = false;
  function redraw() {
    publish();
    if (redrawDue) return;
    redrawDue = true;
    const go = () => {
      redrawDue = false;
      engine.redrawDroppedStacks?.();
    };
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) requestAnimationFrame(go);
    else setTimeout(go, 0);
  }

  function tell(line, ms = 3200) {
    lastLine = line;
    engine.toast?.(line, ms);
    engine.pushActivity?.(line);
    publish();
  }

  /**
   * Where drops are everyone's now, or null (a private place, not joined): { street: the realtime
   * street, key: the game's own name for its stacks (engine.dropTsid), ox: the x the server's stack
   * positions start from, ownHome }. A public street is itself. A home place (report #173, G1190) is
   * HOME_<owner>, HOUSE_<owner> or TOWER_<owner>_<floor> on the server and the game's own scene for
   * it (RH_HOME_EXT, RH_HOME_INT, a Tower floor's RH_HOME_TOWER_<n>, or a visit's MPH_<owner>...),
   * as home-street-mp-feature homeDropOrigin says which home, room and floor that scene is: x from
   * the house on the home street and in the house, a Tower floor's own.
   */
  function here() {
    const s = String(client.street || '');
    const scene = String(engine.streetTsid || '');
    if (client.state !== 'online' || !s || !scene) return null;
    if (isPublicStreet(s)) return s === scene ? { street: s, key: s, ox: 0, ownHome: false } : null;
    const place = homePlaceOf(s);
    if (!place) return null;
    const o = engine.query?.('homeDropOrigin', engine);
    if (!o || Number(o.owner) !== place.owner || o.room !== place.room || (place.room === 'tower' && Number(o.floor) !== place.floor)) return null;
    const ox = place.room === 'tower' ? 0 : Number(o.houseX);
    if (!Number.isFinite(ox)) return null;
    return { street: s, key: String(engine.dropTsid || scene), ox: Math.round(ox), ownHome: o.own === true };
  }

  /**
   * Why a class dropped here stays the player's own, or '' when it is dropped for everyone. Food
   * is the trade table's (include/food.js, what the original's Piggies ate from the ground).
   */
  function reasonAt(p, c) {
    return shareReason(c, table, { street: p.street, ownHome: p.ownHome, herdFood: p.ownHome && table?.items?.[c]?.food === true });
  }

  /** A stack of the server's, where this game draws it. */
  function shown(s) {
    return stackAt(s, here()?.ox || 0);
  }

  /**
   * The chosen tool (its copy, pack order) moves last just before it leaves, so its own wear is
   * the one that goes (js/tools.js takeToolCopy); null leaves the last one, as before.
   */
  function leaveCopy(c, copy) {
    if (copy == null || !TOOL_CONDITION_CATALOG[c] || !engine.toolState) return;
    if (copy < countItem(engine.inv, c)) takeToolCopy(engine.toolState, c, { copy });
  }

  /**
   * R50: a claimed stack (Decoration Mode) set down in the owner's save where it was moved: true when
   * it is down. Its tool wear and one copy's words go with it, as an own drop keeps them (dropOwn).
   */
  function setDownClaim(claim, item, sounded = false) {
    const it = normalizeItem(item);
    if (!it || !claim?.tsid || typeof engine.placeOwnStack !== 'function') return false;
    const res = engine.placeOwnStack(claim.tsid, it.c, it.n, {
      x: claim.x,
      y: claim.y,
      on: claim.on ?? null,
      into: claim.into ?? null,
      ...(it.r != null ? { points: Array(it.n).fill(it.r) } : {}),
      ...(it.t != null && it.n === 1 ? { tags: [it.t] } : {}),
    });
    if (!res?.ok) return false;
    if (!sounded) engine.playSound?.('ITEM_DROP', { volume: 0.45 });
    engine.save?.();
    tell(DROP_TEXT.claimed(it.n, it.n === 1 ? itemLabel(it.c) : itemLabel(it.c, it.n)));
    engine.query?.('homeStackClaimed', res.id, engine);
    return true;
  }

  /**
   * One settled op: true when it was applied now (`copy`: the tool chosen for a drop; `claim`: where
   * Decoration Mode sets a stack taken whole, R50; when it can't go there it comes to the pack).
   */
  function apply(op, side, item, at = null, copy = null, claim = null, { sounded = false } = {}) {
    if (!op || engine.query?.('ledgerReceipt', op, engine) !== true) return false;
    if (side === 'took' && claim && setDownClaim(claim, item, sounded)) return true;
    const fx = dropEffect(side, item, itemLabel);
    if (!fx) return false;
    const inv = engine.inv;
    for (const [c, d] of Object.entries(fx.pack)) {
      if (d < 0 && side === 'dropped') leaveCopy(c, copy);
      if (d > 0) addItem(inv, c, d);
      else removeItem(inv, c, Math.min(countItem(inv, c), -d));
    }
    // G605: a Plop picked up brings its seeds (its words) into the pack's Plop table (animal-husbandry-feature).
    if (side === 'took' && item.c === 'plop' && item.n === 1 && item.t) engine.query?.('plopSeedsIn', item.t, engine);
    if (fx.tool && TOOL_CONDITION_CATALOG[fx.tool.c] && engine.toolState && (fx.pack[fx.tool.c] || 0) > 0) {
      // As a trade does (trade-feature applyDone): the tools picked up keep the stack's wear; yours keep their own.
      receiveToolCopy(engine.toolState, fx.tool.c, fx.tool.r, fx.pack[fx.tool.c], fx.tool.t ?? null);
    }
    if (at && Number.isFinite(at.x)) {
      const it = item.n === 1 ? itemLabel(item.c) : itemLabel(item.c, item.n);
      engine.floatText?.(at.x, at.y - 55, `${side === 'dropped' ? '−' : '+'}${item.n} ${it}`, side === 'dropped' ? 0xf2c879 : 0x7dcea0);
    }
    // A drop shown at once made its sound then (showDrop).
    if (!sounded) engine.playSound?.(fx.sound, { volume: 0.6 });
    engine.refreshPack?.();
    engine.save?.();
    tell(fx.line);
    return true;
  }

  /** The own-drop fallback (the class can't be shared after all, or no server): as the game drops it in solo. */
  function dropOwn(d) {
    const have = countItem(engine.inv, d.c);
    const n = Math.min(have, d.n);
    if (n < 1) return;
    leaveCopy(d.c, d.copy);
    removeItem(engine.inv, d.c, n);
    // A tool keeps its own wear on the ground (the wear sent with the drop).
    const out = engine.dropWorldStack?.(d.c, n, d.x, d.y, d.r != null ? Array(n).fill(d.r) : undefined, d.t != null && n === 1 ? [d.t] : undefined);
    if (!out?.ok) {
      addItem(engine.inv, d.c, n);
      return;
    }
    engine.playSound?.('ITEM_DROP', { volume: 0.6 });
    engine.refreshPack?.();
    tell(DROP_TEXT.dropped(n, itemLabel(d.c, n)));
  }

  client.on('msg:ground_state', (msg) => {
    const g = groundFrom(msg);
    street = g.street;
    stacks.clear();
    for (const s of g.stacks) stacks.set(s.id, s);
    redraw();
  });

  client.on('msg:ground_added', (msg) => {
    const s = normalizeGroundStack(msg.stack, street);
    if (!s || !street || street !== client.street) return;
    const was = stacks.get(s.id);
    // The stack a drop or a move in flight joins grew: the join landed (the answer follows), so it is not drawn twice.
    const q = dropping?.pend;
    if (q && !q.done && q.joinN > 0 && was && s.count > was.count && targetIn(q, stacks) === s.id) q.joinN = 0;
    if (moving && moving.into === s.id && was && s.count > was.count) moving.joinSeen = true;
    // The moved stack where it went: the move is drawn from the server's word now.
    if (moving?.settled && moving.id === s.id) moving = null;
    stacks.set(s.id, s);
    redraw();
  });

  client.on('msg:ground_gone', (msg) => {
    const id = String(msg.id || '');
    if (moving?.settled && moving.id === id) moving = null;
    if (stacks.delete(id)) redraw();
  });

  // Some of a stack was picked up (or its count corrected): the rest stays, with its new count.
  client.on('msg:ground_left', (msg) => {
    const id = String(msg.id || '');
    const s = stacks.get(id);
    if (!s || !street || String(msg.street || '') !== street) return;
    const left = stackLeft(s, msg.n);
    if (left) stacks.set(id, left);
    else stacks.delete(id);
    redraw();
  });

  // A street Piggy ate one (drops.go eat): the stack shrinks, the Piggy walks over and chews.
  client.on('msg:ground_eaten', (msg) => {
    const id = String(msg.id || '');
    const s = stacks.get(id);
    if (!s || !street || String(msg.street || '') !== street) return;
    const left = eatenStack(s, msg.n);
    if (left) stacks.set(id, left);
    else stacks.delete(id);
    redraw();
    const key = pigAnimalKey(street, msg.pig);
    const pig = key ? (engine.interactables || []).find((t) => t?.classId === 'npc_piggy' && t.animalKey === key && !t.featureId && !t.husbandryAnimal) : null;
    lastEaten = `${id}:${left ? left.count : 0}:${msg.pig || ''}`;
    if (pig) engine.query?.('sharedAnimalEvent', pig, { ev: 'ate', at: { x: Number(msg.x) || s.x, y: Number(msg.y) || s.y }, classTsid: s.classTsid }, engine);
    publish();
  });

  client.on('msg:ground_dropped', (msg) => {
    const d = dropping;
    dropping = null;
    // The drop shown for it ends here: refused, it is back in the pack's view; settled, the real stack takes its place.
    const q = d?.pend && (!msg.ref || d.ref === String(msg.ref)) ? d.pend : null;
    if (msg.status !== 'settled') {
      endPending(q, { quiet: true });
      // The server would not share it: as in solo, the drop is the player's own.
      if (d && ['type', 'off', 'private'].includes(String(msg.why))) dropOwn(d);
      else tell(dropRefusalText(msg, client.street || street));
      // A full place stays full for the drops behind it: they stay in the pack.
      if (String(msg.why) === 'full') dropQueue();
      pendingChanged();
      publish();
      pump();
      return;
    }
    const s = normalizeGroundStack(msg.stack, street);
    if (s && street && street === client.street) stacks.set(s.id, s);
    if (q) {
      q.op = s ? s.id : String(msg.into || '');
      endPending(q, { quiet: true });
    }
    // A drop that joined a like stack on a house floor says what left the pack (`item`); the stack it
    // joined comes again as ground_added, with its new count (drops.go "Merging").
    const it = normalizeItem(msg.item);
    const joined = msg.into ? stacks.get(String(msg.into)) : null;
    apply(String(msg.op || ''), 'dropped', it ? { c: it.c, n: it.n } : s ? { c: s.classTsid, n: s.count } : d ? { c: d.c, n: d.n } : null, shown(s || joined), d?.copy ?? null, null, { sounded: Boolean(q) });
    pendingChanged();
    pump();
  });

  // The owner's floor move settled or was refused (drops.go moveFrame); where it went comes as ground_added.
  // Refused, the stack is drawn where it was again; settled, at its new spot until the server's word on it comes.
  client.on('msg:ground_moved', (msg) => {
    const id = String(msg.id || '');
    if (moving?.id === id) {
      if (msg.status === 'settled') {
        moving.settled = true;
        moving.until = Date.now() + 2000;
      } else moving = null;
    }
    if (msg.status !== 'settled') tell(String(msg.text || DROP_TEXT.gone));
    redraw();
  });

  client.on('msg:ground_taken', (msg) => {
    const id = String(msg.id || '');
    const mine = picking && picking.id === id ? picking : null;
    // A claim that timed out still sets it on the shelf when its answer comes late.
    const late = mine ? null : lateClaims.get(id);
    const claim = mine?.claim || late?.claim || null;
    const entry = mine?.entry || null;
    if (!picking || mine) picking = null;
    lateClaims.delete(id);
    if (msg.status !== 'settled') {
      // Refused: the claim shown is back on the floor where it was.
      endClaim(entry);
      tell(String(msg.text || DROP_TEXT.gone));
      if (claim) engine.query?.('homeStackClaimed', null, engine);
      pumpClaims();
      return;
    }
    endClaim(entry, { quiet: true });
    const s = stacks.get(id);
    apply(String(msg.op || ''), 'took', msg.item, shown(s) || engine.player, null, claim, { sounded: Boolean(entry) });
    pendingChanged();
    pumpClaims();
  });

  client.on('msg:ground_back', (msg) => {
    apply(String(msg.op || ''), 'back', msg.item);
  });

  client.on('state', ({ state } = {}) => {
    if (state === 'online') sync();
    else {
      // Off the server: its stacks are not drawn, and an answer under way comes back through the site's list.
      // The drops still waiting stay in the pack.
      dropping = null;
      // A claim under way: its answer comes through the site's list, and still sets it on the shelf.
      if (picking?.claim) lateClaims.set(picking.id, { claim: picking.claim });
      picking = null;
      dropQueue();
      endAllPending();
      if (stacks.size) {
        stacks.clear();
        street = '';
        redraw();
      }
    }
    publish();
  });

  /** The site's drops and takes this save has not applied (an answer that never arrived). */
  async function sync() {
    if (syncing) return;
    syncing = true;
    syncedAt = Date.now();
    try {
      const data = await account.drops?.();
      for (const row of Array.isArray(data?.drops) ? data.drops : []) {
        const m = normalizeMine(row);
        if (!m) continue;
        if (m.side === 'dropped' && dropping) continue; // its answer may still come
        // A claim's answer may still come, to set it down where Decoration Mode moved it (R50).
        if (m.side === 'took' && picking?.claim && picking.id === m.id && Date.now() - picking.at < WAIT_MS) continue;
        const late = m.side === 'took' ? lateClaims.get(m.id) : null;
        if (late) lateClaims.delete(m.id);
        apply(m.op, m.side, m.item, null, null, late?.claim || null);
      }
    } catch (err) {
      console.warn('[drops]', err?.message || err);
    } finally {
      syncing = false;
    }
  }
  sync();

  /**
   * dropPackItem: true when the drop went to the server (the pack changes on its answer). G1192: one
   * sent while another is being weighed waits its turn (the server weighs one at a time and answered
   * "Wait a moment"); each goes when the last is answered and the server's rate allows.
   */
  function drop({ classTsid, count, x, y, copy = null, into = null, merge = true }) {
    const p = here();
    const c = String(classTsid || '');
    if (!p) return null;
    if (!table) {
      loadTable();
      return null;
    }
    if (reasonAt(p, c)) return null;
    if (dropping && Date.now() - dropping.at >= WAIT_MS) giveUp(); // no answer came: let the next go
    if (countItem(engine.inv, c) < 1) return null;
    if (queue.length >= DROP_QUEUE_MAX) {
      engine.toast?.(DROP_TEXT.busy, 2400);
      return true;
    }
    // What the pack shows: the drops shown already took theirs out of its view (none left: nothing more goes, as a
    // queued drop with nothing left to send was skipped).
    const visible = countItem(engine.inv, c) - (held()?.[c] || 0);
    if (visible < 1) return true;
    const n = Math.min(Math.max(1, Math.floor(Number(count) || 1)), visible);
    const q = showDrop(p, { c, n, x, y, into: into ? String(into) : null, merge: merge !== false });
    queue.push({ street: p.street, classTsid: c, count: n, x, y, copy, into: into ? String(into) : null, merge: merge !== false, pend: q });
    pendingChanged();
    pump();
    return true;
  }

  /**
   * A drop shown at once: on the like stack it will join (drops.go mergeTarget, as likeSharedStack reads
   * it; up to the class's pile, the rest beside it) or on its own where it lands.
   */
  function showDrop(p, { c, n, x, y, into, merge }) {
    const sx = Math.round(Number(x) || 0) - (p.ox || 0);
    const sy = Math.round(Number(y) || 0);
    const row = table?.items?.[c];
    // A tool goes down with its wear, a class with words may carry them: drawn on its own (the answer may join it).
    const words = Boolean(TOOL_CONDITION_CATALOG[c] || row?.tag);
    const t = likeSharedStack([...view(p).values()], p.street, { c, x: sx, y: sy, by: me().id, into, merge, words }, row);
    const joinN = t ? Math.max(0, Math.min(n, pileMaxOf(c) - t.count)) : 0;
    pendN += 1;
    const q = { key: pendN, id: `pend-${pendN}`, street: p.street, c, n, sx, y: sy, target: t?.id || null, joinN, restN: n - joinN, op: null, at: Date.now(), done: false };
    pending.push(q);
    engine.playSound?.('ITEM_DROP', { volume: 0.6 });
    return q;
  }

  /** The drops waiting their turn are given up (they stay in the pack, as before). */
  function dropQueue() {
    for (const w of queue) endPending(w.pend, { quiet: true });
    queue.length = 0;
  }

  /** The drop in flight got no answer in time: it shows in the pack again, and the next may go (a late answer still applies once). */
  function giveUp() {
    endPending(dropping?.pend, { quiet: true });
    dropping = null;
    pendingChanged();
  }

  /** Sends the next waiting drop when none is being weighed and the rate allows; else waits for that. */
  function pump() {
    if (pumpTimer) {
      clearTimeout(pumpTimer);
      pumpTimer = null;
    }
    while (!dropping && queue.length) {
      const p = here();
      const next = queue[0];
      // Left the place (or it stopped sharing): what waited stays in the pack.
      if (!p || p.street !== next.street) {
        dropQueue();
        pendingChanged();
        break;
      }
      const go = bucketTake(rate, Date.now());
      if (!go.ok) {
        pumpTimer = setTimeout(pump, go.waitMs);
        break;
      }
      queue.shift();
      if (!send(p, next)) {
        rate.tokens = Math.min(rate.tokens + 1, 6); // nothing went: the token stays
        endPending(next.pend);
      }
    }
    publish();
  }

  /** One drop to the server, its count cut to what the pack has now (the drops before it went first). */
  function send(p, { classTsid: c, count, x, y, copy, into = null, merge = true, pend = null }) {
    if (reasonAt(p, c)) return false;
    // Set on a drop still shown when it was dropped: that one's real stack now (it was answered first), else beside it.
    if (into && !DROP_OP.test(into)) {
      const t = pending.find((o) => o.id === into);
      into = t?.op && stacks.has(t.op) ? t.op : null;
      if (!into) merge = false;
    }
    const n = Math.min(Math.max(1, Math.floor(Number(count) || 1)), countItem(engine.inv, c));
    if (n < 1) return false;
    const item = { c, n };
    // The tool chosen (its own slot) carries its own wear; else the most worn of those that leave.
    const chosen = n === 1 && Number.isInteger(copy) && copy >= 0 && copy < countItem(engine.inv, c) ? copy : null;
    if (TOOL_CONDITION_CATALOG[c] && engine.toolState) {
      item.r = chosen != null ? takeToolCopy(engine.toolState, c, { copy: chosen, take: false }) : leavingToolWear(engine.toolState, c, n);
      // Its own words go down with it (a named Cubimal on the ground keeps its name).
      const t = leavingCopyTag(engine.toolState, c, n, chosen);
      if (t != null) item.t = t;
    }
    // G605: one Plop dropped takes its seeds down as its words (the pack's first, which the count going down takes).
    if (c === 'plop' && n === 1) {
      const t = engine.query?.('plopSeedsOut', engine);
      if (t) item.t = t;
    }
    const ref = `d${Date.now().toString(36)}${(refN += 1)}`;
    dropping = { ref, c, n, r: item.r, t: item.t ?? null, copy: chosen, x: Number(x) || 0, y: Number(y) || 0, at: Date.now(), pend };
    // The ledger must have seen what the drop takes: write the save first.
    persist(engine).then(() => {
      if (dropping?.ref !== ref) return;
      // On a home street the server keeps the stack's x from the house: ox is the house's x as drawn here.
      // On a house floor: the like stack it was set on, or merge false (set beside one): drops.go "Merging".
      if (!client.send('ground_drop', { ref, item, x: dropping.x, y: dropping.y, ...(p.ox ? { ox: p.ox } : {}), ...(into && DROP_OP.test(into) ? { into } : {}), ...(merge === false ? { merge: false } : {}) })) {
        const d = dropping;
        dropping = null;
        endPending(d.pend, { quiet: true });
        dropOwn(d);
        pendingChanged();
        pump();
      }
    });
    return true;
  }

  /**
   * pickupDroppedWorldItem: true when the target is a shared stack (the pack changes on the answer).
   * count: how many (chosen, and cut to what fits the pack); the whole stack sends no count.
   */
  function pickup(target, count = Infinity) {
    const id = String(target?.state?.id || target?.worldItemId || '');
    // A drop still shown before its answer: it is not on the floor yet.
    if (/^pend-/.test(id)) {
      engine.toast?.(DROP_TEXT.busy, 2400);
      return false;
    }
    if (!DROP_OP.test(id)) return null;
    if (!stacks.has(id)) {
      engine.toast?.(DROP_TEXT.gone, 2400);
      redraw();
      return false;
    }
    if (client.state !== 'online') {
      engine.toast?.(DROP_TEXT.offline, 2400);
      return false;
    }
    if (picking && Date.now() - picking.at < WAIT_MS) return true;
    // drops.go allow: a pickup takes from the same bucket as a drop; over it the server answers nothing.
    if (!bucketTake(rate, Date.now()).ok) {
      engine.toast?.(DROP_TEXT.slow, 2400);
      return true;
    }
    const n = pickupAsk(stacks.get(id).count, count);
    picking = { id, n, at: Date.now() };
    const ox = here()?.ox || 0;
    client.send('ground_pickup', { id, ...(n == null ? {} : { n }), ...(ox ? { ox } : {}) });
    publish();
    return true;
  }

  /**
   * R50 (G1224, #655): Decoration Mode moved a shared stack at the owner's own home: ask for the
   * whole of it, to be set down at `to` ({ tsid: the room's own key, x, y, on, into }) in the
   * owner's save when the site says it moved (ground_taken). { ok } or { ok: false, reason, msg }.
   */
  function claim(id, to = {}) {
    const p = here();
    const sid = String(id || '');
    if (/^pend-/.test(sid)) return { ok: false, reason: 'busy', msg: DROP_TEXT.busy };
    if (!DROP_OP.test(sid)) return null;
    if (!p?.ownHome || !homePlaceOf(p.street)) return { ok: false, reason: 'place', msg: DROP_TEXT.notHome };
    const s = stacks.get(sid);
    if (!s) {
      redraw();
      return { ok: false, reason: 'gone', msg: DROP_TEXT.gone };
    }
    if (client.state !== 'online') return { ok: false, reason: 'offline', msg: DROP_TEXT.offline };
    // Already on its way to a shelf, or too many waiting.
    const live = claims.filter((q) => !q.done);
    if (live.some((q) => q.sid === sid) || live.length >= DROP_QUEUE_MAX) return { ok: false, reason: 'busy', msg: DROP_TEXT.picking };
    const tsid = String(to.tsid || '');
    const x = Number(to.x);
    const y = Number(to.y);
    if (!tsid || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'where' };
    // Shown at once: off the floor, on the shelf or table (locked), on the like stack it joins there.
    pendN += 1;
    claims.push({ id: `pend-claim-${pendN}`, sid, c: s.classTsid, n: s.count, tsid, x: Math.round(x), y: Math.round(y), on: to.on ?? null, into: to.into ? String(to.into) : null, at: Date.now(), sent: false, done: false });
    engine.playSound?.('ITEM_DROP', { volume: 0.45 });
    pumpClaims();
    pendingChanged();
    return { ok: true };
  }

  /** A claim shown ends: refused or given up, the stack is back on the floor; settled, the save's stack takes its place. */
  function endClaim(q, { quiet = false } = {}) {
    if (!q || q.done) return;
    q.done = true;
    if (!quiet) pendingChanged();
  }

  /** Sends the next claim waiting when no pickup is being weighed and the rate allows (drops.go: one pickup at a time). */
  function pumpClaims() {
    if (claimTimer) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    while (!picking) {
      const q = claims.find((o) => !o.done && !o.sent);
      if (!q) break;
      const p = here();
      if (!p?.ownHome) {
        for (const o of claims) o.done = true;
        pendingChanged();
        break;
      }
      // Taken by someone else while it waited: it is gone, nothing to set down.
      if (!stacks.has(q.sid)) {
        endClaim(q);
        tell(DROP_TEXT.gone);
        continue;
      }
      const go = bucketTake(rate, Date.now());
      if (!go.ok) {
        claimTimer = setTimeout(pumpClaims, go.waitMs);
        break;
      }
      q.sent = true;
      picking = { id: q.sid, n: null, at: Date.now(), claim: { tsid: q.tsid, x: q.x, y: q.y, on: q.on, into: q.into, c: q.c }, entry: q };
      client.send('ground_pickup', { id: q.sid, ...(p.ox ? { ox: p.ox } : {}) });
    }
    publish();
  }

  /**
   * The owner's Decoration Mode move of a stack on their own house or Tower floor (main.js doModifyItem
   * 4852-4890): it stays on the floor for everyone, moved by the server (drops.go moveFrame), onto the
   * like stack `to.into` there if named. `to`: { x, y, into } as this game draws them. { ok } or
   * { ok: false, reason, msg }.
   */
  function move(id, to = {}) {
    const p = here();
    const sid = String(id || '');
    if (/^pend-/.test(sid)) return { ok: false, reason: 'busy', msg: DROP_TEXT.busy };
    if (!DROP_OP.test(sid)) return null;
    const place = p ? homePlaceOf(p.street) : null;
    if (!p?.ownHome || !place || (place.room !== 'interior' && place.room !== 'tower')) return { ok: false, reason: 'place', msg: DROP_TEXT.notHome };
    if (!stacks.has(sid)) {
      redraw();
      return { ok: false, reason: 'gone', msg: DROP_TEXT.gone };
    }
    if (client.state !== 'online') return { ok: false, reason: 'offline', msg: DROP_TEXT.offline };
    if (moving && !moving.settled && Date.now() - moving.at < WAIT_MS) return { ok: false, reason: 'busy', msg: DROP_TEXT.moving };
    const x = Number(to.x);
    const y = Number(to.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'where' };
    if (!bucketTake(rate, Date.now()).ok) return { ok: false, reason: 'slow', msg: DROP_TEXT.slow };
    const into = to.into && DROP_OP.test(String(to.into)) && String(to.into) !== sid ? String(to.into) : null;
    // Shown at once where it goes, on the like stack it joins (drops.go moveFrame, mergeTarget) up to its pile.
    const s = stacks.get(sid);
    const sx = Math.round(x) - (p.ox || 0);
    const row = table?.items?.[s.classTsid];
    const t = into ? likeSharedStack([...view(p).values()], p.street, { c: s.classTsid, by: s.by?.id, into, words: s.r != null || s.t != null }, row) : null;
    const k = t ? Math.max(0, Math.min(s.count, pileMaxOf(s.classTsid) - t.count)) : 0;
    moving = { id: sid, at: Date.now(), sx, y: Math.round(y), into: t ? into : null, k, joinSeen: false, settled: false, until: 0 };
    client.send('ground_move', { id: sid, x: Math.round(x), y: Math.round(y), ...(p.ox ? { ox: p.ox } : {}), ...(into ? { into } : {}) });
    engine.playSound?.('ITEM_DROP', { volume: 0.45 });
    redraw();
    return { ok: true };
  }

  /** Whether a pack stack of this class would be dropped for everyone here now. */
  function wouldShare(classTsid) {
    const p = here();
    if (!p) return false;
    if (!table) {
      loadTable();
      return false;
    }
    return !reasonAt(p, String(classTsid || ''));
  }

  /**
   * Whether `count` of a class goes to the shared floor here as one stack: shared here, and no more
   * than the server takes in one drop (drops.go dropMaxN: on a street the trade table's max, its
   * stackmax; at home its pile, pileMaxOf, never less than the stackmax).
   */
  function fits(classTsid, count) {
    const c = String(classTsid || '');
    const n = Math.floor(Number(count) || 0);
    if (n < 1 || !wouldShare(c)) return false;
    // In a house or on a Tower floor a pile goes down whole (pileMaxOf: no stack limit at home).
    const row = table?.items?.[c];
    const max = isFloorPlace(here()?.street) && row ? Math.max(pileMaxOf(c), Number(row.max) || 1) : Number(row?.max);
    return !(Number.isFinite(max) && max > 0 && n > max);
  }

  function list(tsid) {
    const p = here();
    if (!p || tsid !== p.key || street !== p.street) return [];
    const all = [...view(p).values()];
    return [...(p.ox ? all.map((s) => stackAt(s, p.ox)) : all), ...claimsShown(p.key)];
  }

  publish();

  return {
    client,
    get table() { return table; },
    get street() { return street; },
    get stacks() { return [...stacks.values()]; },
    get dropping() { return dropping; },
    get queued() { return queue.map((q) => ({ ...q })); },
    get picking() { return picking; },
    get moving() { return moving; },
    get pending() { return pending.filter((q) => !q.done).map((q) => ({ ...q })); },
    get claims() { return claims.filter((q) => !q.done).map((q) => ({ ...q })); },
    held,
    ownGrowth,
    drop,
    pickup,
    claim,
    move,
    list,
    wouldShare,
    fits,
    here,
    sync,
    tick(now) {
      // A street change empties the list until the server's ground_state for the new one.
      if (street && street !== client.street) {
        street = '';
        stacks.clear();
        redraw();
      }
      // Drops shown for a place left: given up, back in the pack's view.
      if (pending.some((q) => !q.done && q.street !== client.street)) {
        for (const q of pending) if (q.street !== client.street) q.done = true;
        pendingChanged();
      }
      if (now - syncedAt > SYNC_EVERY_MS && client.state === 'online') sync();
      // An answer that never came does not hold the drops behind it for good, nor stay shown.
      if (dropping && now - dropping.at >= WAIT_MS) {
        giveUp();
        pump();
      }
      // A claim with no answer in time: back on the floor; a late answer still sets it on the shelf.
      if (picking && now - picking.at >= WAIT_MS) {
        const q = picking.entry || null;
        if (q) lateClaims.set(picking.id, { claim: picking.claim });
        picking = null;
        endClaim(q);
        pumpClaims();
      }
      if (moving && ((moving.settled && now >= moving.until) || (!moving.settled && now - moving.at >= WAIT_MS))) {
        moving = null;
        redraw();
      }
    },
  };
}

let session = null;

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleDrops = session;
  return session;
}

export const dropsMpFeature = {
  id: DROPS_MP_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(Date.now());
  },

  /** game.js dropPackItem: a public street's drop is everyone's (true: sent to the server). */
  sharedDrop(drop, engine) {
    if (!multiplayer || engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.drop(drop) ?? null;
  },

  /** game.js pickupDroppedWorldItem: a shared stack, or the part of it asked for (count), goes to the first to ask. */
  sharedPickup(target, engine, count) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.pickup(target, count);
  },

  /** R50 (homes-feature Decoration Mode): the owner moved a shared stack; it is set down in their save when the site says it moved. */
  claimSharedStack(id, to, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.claim(id, to);
  },

  /** homes-feature Decoration Mode: the owner moved a shared stack along their floor; it stays shared (drops.go moveFrame). */
  moveSharedStack(id, to, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.move(id, to);
  },

  /** game.js pack drop prompt: the drop verb's own words when the stack goes to everyone (shared stacks never merge). */
  sharedDropPrompt(classTsid, engine) {
    if (!multiplayer || engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.wouldShare(classTsid) ? DROP_TEXT.prompt : null;
  },

  /** game.js renderPackBar: what the drops shown before their answer take out of the pack's view ({ class: n }), or null. */
  packHeld(engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.held();
  },

  /** game.js refreshDroppedWorldItems: what Decoration Mode's claims shown add to the save's own stacks here ({ row id: n }), or null. */
  ownStackGrowth(tsid, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    const p = session.here();
    return p && String(tsid || '') === p.key ? session.ownGrowth(p.key) : null;
  },

  /** game.js shareOwnStack: whether `count` of a class goes to the shared floor here as one stack. */
  sharedDropFits(classTsid, count, engine) {
    if (!multiplayer || engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.fits(classTsid, count) ? true : null;
  },

  /**
   * Decoration Mode marks (game.js refreshDroppedWorldItems, js/home-stack-marks.js): true while I
   * stand at my own home online (house, back yard, Tower floor, home street), where my own stacks
   * are mine alone and the server's are anyone's there.
   */
  homeStackMarks(engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    const p = session.here();
    return p?.ownHome === true && homePlaceOf(p.street) != null ? true : null;
  },

  /** game.js refreshDroppedWorldItems: the shared stacks to draw with the player's own. */
  sharedDroppedStacks(tsid, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    const out = session.list(String(tsid || ''));
    return out.length ? out : null;
  },
};
