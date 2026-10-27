/**
 * Stacks dropped on a public street are everyone's in multiplayer (register
 * G332): a drop goes through the realtime server
 * (groddle-afternoon-server/drops.go, whose header lists the messages and
 * the source rules) to the site's ledger (src/LedgerDrop.php), every player
 * on the street sees the stack, and the first pickup wins. The pure rules
 * and words are js/drops-mp.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature answers nothing, so every drop is the player's own as always.
 * In multiplayer the same holds for a private place (a home, a tower floor,
 * a party space, a race), for a class the ledger does not carry, a note
 * (its writing would not travel), and whenever the server is out of reach: game.js drops those as it
 * always did.
 *
 * game.js asks three hooks: sharedDrop (dropPackItem, before the pack
 * changes: true when the drop went to the server), sharedPickup
 * (pickupDroppedWorldItem: true when it is a shared stack) and
 * sharedDroppedStacks (refreshDroppedWorldItems: the shared stacks to draw
 * beside the player's own). Nothing leaves or enters the pack until the
 * server says the site moved it (ground_dropped, ground_taken, ground_back);
 * each applies once through the trade slice's applied list (ledgerReceipt),
 * and on every connect the site's list brings any answer that was missed.
 *
 * Piggies (animal-mood-feature) eat only the stacks in engine.droppedItems,
 * the player's own: a shared stack is the server's, so no one page's Piggy
 * eats it.
 *
 * QA: canvas data sharedStacks, dropState (none|dropping|picking), dropLast;
 * window.groddleDrops.
 */

import { ITEM_CATALOG, addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { TOOL_CONDITION_CATALOG, getToolCondition, setToolRemaining } from '../tools.js?v=woodcutting-test-3';
import { createMinnAccount } from '../minn-account.js?v=nbhome-9';
import { saveStore } from '../save-store.js?v=mp2-2';
import { DROP_OP, DROP_TEXT, dropEffect, groundFrom, isPublicStreet, normalizeGroundStack, normalizeMine, shareReason } from '../drops-mp.js?v=g332-drops-1';

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

/** Writes the save and waits for it, so the ledger has seen what the drop takes (trade-feature persist). */
async function persist(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 4; i += 1) {
    try {
      await saveStore.flush();
    } catch {
      return false;
    }
    if (saveStore.state === 'saved') return true;
  }
  return saveStore.state === 'saved';
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
  /** The stack a pickup asked for: { id, at }. */
  let picking = null;
  let lastLine = '';
  let syncing = false;
  let syncedAt = 0;
  let refN = 0;

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
    engine.setData?.('dropState', dropping ? 'dropping' : picking ? 'picking' : 'none');
    engine.setData?.('dropLast', lastLine);
  }

  function redraw() {
    engine.redrawDroppedStacks?.();
    publish();
  }

  function tell(line, ms = 3200) {
    lastLine = line;
    engine.toast?.(line, ms);
    engine.pushActivity?.(line);
    publish();
  }

  /** The street the player shares with others now ('' when it is a private place or not joined). */
  function here() {
    const s = String(client.street || '');
    return client.state === 'online' && s && s === String(engine.streetTsid || '') && isPublicStreet(s) ? s : '';
  }

  /** One settled op: true when it was applied now. */
  function apply(op, side, item, at = null) {
    if (!op || engine.query?.('ledgerReceipt', op, engine) !== true) return false;
    const fx = dropEffect(side, item, itemLabel);
    if (!fx) return false;
    const inv = engine.inv;
    for (const [c, d] of Object.entries(fx.pack)) {
      if (d > 0) addItem(inv, c, d);
      else removeItem(inv, c, Math.min(countItem(inv, c), -d));
    }
    if (fx.tool && TOOL_CONDITION_CATALOG[fx.tool.c] && engine.toolState) {
      // As a trade does (trade-feature applyDone): a first one takes the stack's wear, one more keeps the more worn.
      const had = countItem(inv, fx.tool.c) - (fx.pack[fx.tool.c] || 0);
      const mine = getToolCondition(engine.toolState, fx.tool.c).remaining;
      setToolRemaining(engine.toolState, fx.tool.c, had > 0 ? Math.min(mine, fx.tool.r) : fx.tool.r);
    }
    if (at && Number.isFinite(at.x)) {
      const it = item.n === 1 ? itemLabel(item.c) : itemLabel(item.c, item.n);
      engine.floatText?.(at.x, at.y - 55, `${side === 'dropped' ? '−' : '+'}${item.n} ${it}`, side === 'dropped' ? 0xf2c879 : 0x7dcea0);
    }
    engine.playSound?.(fx.sound, { volume: 0.6 });
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
    removeItem(engine.inv, d.c, n);
    const out = engine.dropWorldStack?.(d.c, n, d.x, d.y);
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
    stacks.set(s.id, s);
    redraw();
  });

  client.on('msg:ground_gone', (msg) => {
    if (stacks.delete(String(msg.id || ''))) redraw();
  });

  client.on('msg:ground_dropped', (msg) => {
    const d = dropping;
    dropping = null;
    if (msg.status !== 'settled') {
      // The server would not share it: as in solo, the drop is the player's own.
      if (d && ['type', 'off', 'private'].includes(String(msg.why))) dropOwn(d);
      else tell(String(msg.text || "That didn't work."));
      publish();
      return;
    }
    const s = normalizeGroundStack(msg.stack, street);
    apply(String(msg.op || ''), 'dropped', s ? { c: s.classTsid, n: s.count } : d ? { c: d.c, n: d.n } : null, s);
  });

  client.on('msg:ground_taken', (msg) => {
    picking = null;
    if (msg.status !== 'settled') {
      tell(String(msg.text || DROP_TEXT.gone));
      return;
    }
    const s = stacks.get(String(msg.id || ''));
    apply(String(msg.op || ''), 'took', msg.item, s || engine.player);
  });

  client.on('msg:ground_back', (msg) => {
    apply(String(msg.op || ''), 'back', msg.item);
  });

  client.on('state', ({ state } = {}) => {
    if (state === 'online') sync();
    else {
      // Off the server: its stacks are not drawn, and an answer under way comes back through the site's list.
      dropping = null;
      picking = null;
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
        apply(m.op, m.side, m.item);
      }
    } catch (err) {
      console.warn('[drops]', err?.message || err);
    } finally {
      syncing = false;
    }
  }
  sync();

  /** dropPackItem: true when the drop went to the server (the pack changes on its answer). */
  function drop({ classTsid, count, x, y }) {
    const s = here();
    const c = String(classTsid || '');
    if (!s) return null;
    if (!table) {
      loadTable();
      return null;
    }
    if (shareReason(c, table, { street: s, dropKey: String(engine.dropTsid || s) })) return null;
    if (dropping) {
      if (Date.now() - dropping.at < WAIT_MS) {
        engine.toast?.(DROP_TEXT.busy, 2400);
        return true;
      }
      dropping = null;
    }
    const n = Math.min(Math.max(1, Math.floor(Number(count) || 1)), countItem(engine.inv, c));
    if (n < 1) return null;
    const item = { c, n };
    if (TOOL_CONDITION_CATALOG[c] && engine.toolState) item.r = getToolCondition(engine.toolState, c).remaining;
    const ref = `d${Date.now().toString(36)}${(refN += 1)}`;
    dropping = { ref, c, n, r: item.r, x: Number(x) || 0, y: Number(y) || 0, at: Date.now() };
    publish();
    // The ledger must have seen what the drop takes: write the save first.
    persist(engine).then(() => {
      if (dropping?.ref !== ref) return;
      if (!client.send('ground_drop', { ref, item, x: dropping.x, y: dropping.y })) {
        const d = dropping;
        dropping = null;
        dropOwn(d);
      }
    });
    return true;
  }

  /** pickupDroppedWorldItem: true when the target is a shared stack (the pack changes on the answer). */
  function pickup(target) {
    const id = String(target?.state?.id || target?.worldItemId || '');
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
    picking = { id, at: Date.now() };
    client.send('ground_pickup', { id });
    publish();
    return true;
  }

  function list(tsid) {
    const s = here();
    if (!s || tsid !== s || street !== s) return [];
    return [...stacks.values()];
  }

  publish();

  return {
    client,
    get table() { return table; },
    get street() { return street; },
    get stacks() { return [...stacks.values()]; },
    get dropping() { return dropping; },
    get picking() { return picking; },
    drop,
    pickup,
    list,
    sync,
    tick(now) {
      // A street change empties the list until the server's ground_state for the new one.
      if (street && street !== client.street) {
        street = '';
        stacks.clear();
        redraw();
      }
      if (now - syncedAt > SYNC_EVERY_MS && client.state === 'online') sync();
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

  /** game.js pickupDroppedWorldItem: a shared stack goes to the first to ask. */
  sharedPickup(target, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.pickup(target);
  },

  /** game.js refreshDroppedWorldItems: the shared stacks to draw with the player's own. */
  sharedDroppedStacks(tsid, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    const out = session.list(String(tsid || ''));
    return out.length ? out : null;
  },
};
