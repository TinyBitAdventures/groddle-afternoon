/**
 * Notice Boards are everyone's in multiplayer (Austin 2026-11-04): a board's
 * notes come from the realtime server (groddle-afternoon-server boards.go,
 * whose header lists the messages and the source rules) and the site keeps
 * them (src/LedgerBoard.php), so every player on the street reads the same
 * ten and sees each pin and take as it happens. The pure rules and words are
 * js/boards-mp.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature answers nothing, and street-furniture-feature keeps each
 * board's notes in the player's own save as always; online, a street the
 * server has no board for (or a demo board) is the same.
 *
 * street-furniture-feature asks five hooks: sharedBoard (tsid: null when the
 * board is not shared, else { ready, capacity, notes }), sharedBoardPin (a
 * carried note: true when it went to the server), sharedBoardTake (a note id),
 * sharedBoardReport (a note id and why: a promise) and sharedBoardSelf (your
 * id). Nothing leaves or enters the pack until the server says the site
 * moved it (board_pinned, board_taken); each applies once through the trade
 * slice's applied list (ledgerReceipt), and on every connect the site's list
 * (GET groddle/v1/boards/mine) brings any answer that was missed.
 *
 * QA: canvas data boardShared (street:notes), boardState (none|pinning|taking),
 * boardLast; window.groddleBoards.
 */

import { countItem, removeItem } from '../inventory.js?v=60dfc9ca';
import { createMinnAccount } from '../minn-account.js?v=c15f0ecf';
import { saveStore } from '../save-store.js?v=89422a9c';
import { BOARD_MP_TEXT, BOARD_NOTE_ID, boardFrom, carriedFromBoard, normalizeBoardNote, normalizeMineBoard, pinPayload, sameWords } from '../boards-mp.js?v=6e2613b2';
// The same key as features/index.js: one module instance holds the carried notes and draws the boards.
import { carriedNoteList, giveCarriedNote, refreshSharedBoards, takeCarriedNote } from './street-furniture-feature.js?v=8741b760';
import { noteContent } from '../street-furniture.js?v=55131f49';

export const BOARDS_MP_FEATURE_ID = 'boards-mp';
const SYNC_EVERY_MS = 60000;
const WAIT_MS = 15000;
const NOTE = 'note';

let multiplayer = false;

/** Writes the save and waits for it, so the ledger has seen the Note a pin takes (drops-mp-feature persist). */
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

function titleOf(note) {
  return noteContent(note || {}).title;
}

export function createBoardsSession(engine, client, { account = null, me = 0, flush = persist } = {}) {
  /** The street the server last listed and its notes, oldest first. */
  let street = '';
  let capacity = 10;
  let notes = [];
  /** The pin the server is weighing: { ref, noteId, note, at }. */
  let pinning = null;
  /** The take the server is weighing: { id, at }. */
  let taking = null;
  let lastLine = '';
  let syncing = false;
  let syncedAt = 0;
  let refN = 0;

  function publish() {
    engine.setData?.('boardShared', street ? `${street}:${notes.length}` : '');
    engine.setData?.('boardState', pinning ? 'pinning' : taking ? 'taking' : 'none');
    engine.setData?.('boardLast', lastLine);
  }

  function redraw() {
    refreshSharedBoards(engine);
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
    return client.state === 'online' && s && s === String(engine.streetTsid || '') && !s.includes('_') ? s : '';
  }

  /** A pin settled: the carried note it came from leaves the pack, once. */
  function applyPinned(op, note, from = null) {
    if (!op || engine.query?.('ledgerReceipt', op, engine) !== true) return false;
    const carried = carriedNoteList(engine);
    let gone = from?.noteId ? takeCarriedNote(engine, from.noteId) : null;
    if (gone && from?.note && !sameWords(gone, from.note)) {
      // The id was reused by a later note: put it back and find the one with these words.
      giveCarriedNote(engine, gone);
      gone = null;
    }
    if (!gone) {
      const match = note ? carried.find((n) => sameWords(n, note)) : null;
      gone = match ? takeCarriedNote(engine, match.id) : null;
    }
    if (!gone && countItem(engine.inv, NOTE) > 0) removeItem(engine.inv, NOTE, 1);
    engine.playSound?.('ITEM_DROP', { volume: 0.5 });
    engine.refreshPack?.();
    engine.save?.();
    tell(BOARD_MP_TEXT.pinned(titleOf(note)));
    return true;
  }

  /** A take settled: the note goes into the pack with its words and writer, once. */
  function applyTook(op, note) {
    if (!op || !note || engine.query?.('ledgerReceipt', op, engine) !== true) return false;
    giveCarriedNote(engine, carriedFromBoard(note));
    engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
    engine.save?.();
    tell(BOARD_MP_TEXT.took(titleOf(note)));
    return true;
  }

  function addNote(n) {
    if (!n || notes.some((o) => o.id === n.id)) return;
    notes = [...notes, n].slice(-capacity);
  }

  client.on('msg:board_state', (msg) => {
    const b = boardFrom(msg, me);
    street = b.street;
    capacity = b.capacity;
    notes = b.notes;
    redraw();
  });

  client.on('msg:board_added', (msg) => {
    if (!street || String(msg.street || '') !== street) return;
    addNote(normalizeBoardNote(msg.note, me));
    redraw();
  });

  client.on('msg:board_gone', (msg) => {
    if (!street || String(msg.street || '') !== street) return;
    const id = String(msg.id || '');
    const before = notes.length;
    notes = notes.filter((n) => n.id !== id);
    if (notes.length !== before) redraw();
  });

  client.on('msg:board_pinned', (msg) => {
    const p = pinning;
    if (p && msg.ref && msg.ref !== p.ref) return;
    pinning = null;
    if (msg.status !== 'settled') {
      tell(String(msg.text || BOARD_MP_TEXT.offline));
      return;
    }
    const n = normalizeBoardNote(msg.note, me);
    if (n && street && String(engine.streetTsid || '') === street) addNote(n);
    applyPinned(String(msg.op || ''), n || p?.note, p);
    redraw();
  });

  client.on('msg:board_taken', (msg) => {
    taking = null;
    if (msg.status !== 'settled') {
      tell(String(msg.text || BOARD_MP_TEXT.gone));
      redraw();
      return;
    }
    applyTook(String(msg.op || ''), normalizeBoardNote(msg.note, me));
    redraw();
  });

  client.on('state', ({ state } = {}) => {
    if (state === 'online') sync();
    else {
      // Off the server: its notes are not shown, and an answer under way comes back through the site's list.
      pinning = null;
      taking = null;
      if (street) {
        street = '';
        notes = [];
        redraw();
      }
    }
    publish();
  });

  /** The site's pins and takes this save has not applied (an answer that never arrived). */
  async function sync() {
    if (syncing || !account?.boards) return;
    syncing = true;
    syncedAt = Date.now();
    try {
      const data = await account.boards();
      for (const row of Array.isArray(data?.boards) ? data.boards : []) {
        const m = normalizeMineBoard(row, me);
        if (!m) continue;
        if (m.side === 'pinned') {
          if (pinning) continue; // its answer may still come
          applyPinned(m.op, m.note);
        } else applyTook(m.op, m.note);
      }
    } catch (err) {
      console.warn('[boards]', err?.message || err);
    } finally {
      syncing = false;
    }
  }

  /** street-furniture's board: null when this street's board is not shared, else what it holds. */
  function board(tsid) {
    const s = String(tsid || '');
    if (!s || s.includes('_') || s !== String(engine.streetTsid || '')) return null;
    if (!here()) return { ready: false, capacity, notes: [] };
    return { ready: street === s, capacity, notes: street === s ? notes : [] };
  }

  /** A carried note onto the board: true when it went to the server (the pack changes on its answer). */
  function pin(note) {
    const s = here();
    if (!s || street !== s) {
      engine.toast?.(s ? BOARD_MP_TEXT.loading : BOARD_MP_TEXT.offline, 2600);
      return false;
    }
    if (pinning) {
      if (Date.now() - pinning.at < WAIT_MS) {
        engine.toast?.(BOARD_MP_TEXT.busy, 2400);
        return false;
      }
      pinning = null;
    }
    const payload = pinPayload(note);
    const ref = `b${Date.now().toString(36)}${(refN += 1)}`;
    pinning = { ref, noteId: String(note?.id || ''), note: { ...note }, at: Date.now() };
    publish();
    // The ledger must have seen the Note: write the save first.
    Promise.resolve(flush(engine)).then(() => {
      if (pinning?.ref !== ref) return;
      if (!client.send('board_pin', { ref, board: 0, note: payload.note, author: payload.author })) {
        pinning = null;
        tell(BOARD_MP_TEXT.offline);
      }
    });
    return true;
  }

  /** Take a note: true when the server was asked. */
  function take(id) {
    const s = here();
    const nid = String(id || '');
    if (!BOARD_NOTE_ID.test(nid) || !notes.some((n) => n.id === nid)) {
      engine.toast?.(BOARD_MP_TEXT.gone, 2400);
      return false;
    }
    if (!s) {
      engine.toast?.(BOARD_MP_TEXT.offline, 2400);
      return false;
    }
    if (taking && Date.now() - taking.at < WAIT_MS) {
      engine.toast?.(BOARD_MP_TEXT.taking, 2400);
      return false;
    }
    taking = { id: nid, at: Date.now() };
    client.send('board_take', { id: nid });
    publish();
    return true;
  }

  /** Report a note to the administrators: { ok, text }. */
  async function report(id, why = '') {
    const nid = String(id || '');
    if (!BOARD_NOTE_ID.test(nid) || !account?.reportBoardNote) return { ok: false, text: BOARD_MP_TEXT.reportFailed };
    try {
      const r = await account.reportBoardNote(nid, String(why || '').slice(0, 500));
      const text = r?.status === 'already' ? BOARD_MP_TEXT.reportedAlready : BOARD_MP_TEXT.reported;
      tell(text);
      return { ok: true, text };
    } catch (err) {
      const text = String(err?.message || BOARD_MP_TEXT.reportFailed);
      return { ok: false, text };
    }
  }

  publish();
  sync();

  return {
    client,
    get street() { return street; },
    get notes() { return [...notes]; },
    get pinning() { return pinning; },
    get taking() { return taking; },
    board,
    pin,
    take,
    report,
    sync,
    tick(now) {
      // A street change empties the board until the server's board_state for the new one.
      if (street && street !== client.street) {
        street = '';
        notes = [];
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
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  session = createBoardsSession(engine, client, { account, me: Math.floor(Number(boot.player?.id) || 0) });
  globalThis.groddleBoards = session;
  return session;
}

export const boardsMpFeature = {
  id: BOARDS_MP_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(Date.now());
  },

  /** street-furniture-feature buildBoard / openBoard: the street's shared board, or null (the player's own). */
  sharedBoard(tsid, engine) {
    if (!multiplayer || engine?.mode !== 'multiplayer') return null;
    return ensure(engine)?.board(tsid) ?? null;
  },

  /** addToBoard: a carried note goes to the server (true), or stays (false). */
  sharedBoardPin(note, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.pin(note);
  },

  /** openBoard's Take. */
  sharedBoardTake(id, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.take(id);
  },

  /** A shared note's Report: a promise of { ok, text }. */
  sharedBoardReport(id, why, engine) {
    if (!multiplayer || !session || engine?.mode !== 'multiplayer') return null;
    return session.report(id, why);
  },
};
