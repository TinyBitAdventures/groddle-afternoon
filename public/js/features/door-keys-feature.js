/**
 * Door keys lying on their streets (#157): the feature that puts them there. Data and rules are
 * js/door-key-spawns.js (where each key lay, from the wiki and forum, and the 5-minute respawn).
 *
 * Solo: each spot's key is an ordinary ground stack (engine.dropWorldStack, game.js createItemStack),
 * picked up like any stack. The feature keeps, per spot, the stack it put down and when that stack
 * went; on the street it puts a new one down 5 minutes after the last was picked up, and only one
 * (nothing piles up while the player is away: a spot holds at most its one stack).
 *
 * Multiplayer: one key per spot shared by everyone on the street, held by the realtime server
 * (groddle-afternoon-server keys.go). On each street the client asks key_sync; the server says which
 * spots hold their key. The keys are drawn as shared ground stacks (game.js collects
 * sharedDroppedStacks) and Pick up asks the server (sharedPickup): the first to ask gets it
 * (key_got, into the pack; the server credits the ledger, credits.go "take"), everyone else sees it
 * go (key_taken) and come back 5 minutes later (key_back). Without the server (realtime off, a
 * private place) no key lies there: a multiplayer key is never the player's own.
 *
 * QA: &keydemo=<street tsid>|1 goes to that street (1: Shillrigg Tiers) and stands the player a few
 * steps from its key; &keyrespawn=<seconds> shortens the solo respawn for a test (never the shipped
 * value). Canvas data: keyMode (solo | shared | pending | off), keySpots (lying/spots here),
 * keyLast (drop:i | taken:i | got:i | gone:i | back:i | refused:i:why), keyBackIn (ms, first spot).
 */

import { addItem } from '../inventory.js?v=5be47371';
import { listDroppedStacks } from '../world-items.js?v=792e1606';
import { DOOR_KEYS, doorKeyClass } from '../doors.js?v=727d0e0b';
import {
  KEY_RESPAWN_MS,
  KEY_SPAWNS,
  keyBackIn,
  keySpawnsOn,
  keySpotId,
  keySpotIndex,
  normalizeKeySpawnState,
  soloKeyStep,
} from '../door-key-spawns.js?v=8e6b40bb';

export const DOOR_KEYS_FEATURE_ID = 'door-keys';
const TICK_MS = 400;
/** A pick-up that got no answer is let go after this long. */
const PICK_WAIT_MS = 4000;

export const KEY_TEXT = Object.freeze({
  lying: 'A door key lying here',
  gone: 'Someone picked that key up first.',
  offline: 'Not connected: the key can wait.',
});

let state = normalizeKeySpawnState();
let lastTick = 0;
/** The street the solo spots were last checked on (onStreetClear checks it once more). */
let soloStreet = '';
let demo = { stage: 'idle' };

// Multiplayer.
let client = null;
let unsub = [];
/** street -> Map(i -> { here: boolean }) from the server. */
const book = new Map();
let asked = '';
let picking = null; // { street, i, at }

function multiplayer(engine) {
  return engine?.mode === 'multiplayer';
}

function keyLabel(key) {
  return DOOR_KEYS[key]?.label || 'door key';
}

/** A public street the key spots can be on (no instance, scene or home). */
function openStreet(engine) {
  if (!engine?.player || !engine.streetTsid) return '';
  if (engine.transientInstance?.()) return '';
  if (engine.homeContext?.().inHome) return '';
  return String(engine.streetTsid);
}

function respawnMs(engine) {
  const s = Number(engine?.param?.('keyrespawn'));
  return Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : KEY_RESPAWN_MS;
}

function publish(engine, last) {
  if (!engine?.setData) return;
  const street = openStreet(engine);
  const spots = street ? keySpawnsOn(street) : [];
  if (multiplayer(engine)) {
    const here = book.get(street);
    engine.setData('keyMode', !client ? 'off' : !spots.length ? 'off' : here ? 'shared' : 'pending');
    engine.setData('keySpots', spots.length ? `${here ? spots.filter((s) => here.get(s.i)?.here).length : 0}/${spots.length}` : '');
  } else {
    engine.setData('keyMode', spots.length ? 'solo' : 'off');
    const lying = spots.filter((s) => {
      const spot = state.spots[s.i];
      return spot?.stack && stackOnGround(engine, street, spot.stack);
    }).length;
    engine.setData('keySpots', spots.length ? `${lying}/${spots.length}` : '');
    engine.setData('keyBackIn', spots.length ? String(keyBackIn(state.spots[spots[0].i], Date.now(), respawnMs(engine))) : '');
  }
  if (last) engine.setData('keyLast', last);
}

/* ------------------------------------------------------------------ */
/* Solo                                                                */
/* ------------------------------------------------------------------ */

function stackOnGround(engine, street, id) {
  return listDroppedStacks(engine.droppedItems, street).some((s) => s.id === id);
}

/** One pass over a street's spots: note a pickup, put a key down when it is due. */
function soloStep(engine, street, { drop = true } = {}) {
  const spots = keySpawnsOn(street);
  if (!spots.length) return;
  const now = Date.now();
  let changed = false;
  let last = '';
  for (const s of spots) {
    const spot = state.spots[s.i];
    const step = soloKeyStep(spot, { present: Boolean(spot?.stack) && stackOnGround(engine, street, spot.stack), now, respawnMs: respawnMs(engine) });
    if (step === 'taken') {
      state.spots[s.i] = { stack: '', takenAt: now };
      changed = true;
      last = `taken:${s.i}`;
    } else if (step === 'drop' && drop && engine.dropWorldStack) {
      // createItemStack at the spot: it rests on the line under it (game.js dropWorldStack).
      const res = engine.dropWorldStack(doorKeyClass(s.key), 1, s.x, s.y - 4);
      if (res?.ok && res.stack?.id) {
        state.spots[s.i] = { stack: res.stack.id, takenAt: 0 };
        changed = true;
        last = `drop:${s.i}`;
      }
    }
  }
  if (changed) engine.save?.();
  publish(engine, last);
}

/* ------------------------------------------------------------------ */
/* Multiplayer                                                         */
/* ------------------------------------------------------------------ */

function redraw(engine) {
  engine.redrawDroppedStacks?.();
  publish(engine);
}

function spotOf(street, i) {
  const row = KEY_SPAWNS[i];
  return row && row.street === street ? row : null;
}

function onKeys(engine, msg) {
  const street = String(msg?.street || '');
  if (!street) return;
  const here = new Map();
  for (const k of Array.isArray(msg.keys) ? msg.keys : []) {
    const i = Number(k?.i);
    if (Number.isInteger(i) && spotOf(street, i)) here.set(i, { here: Boolean(k.here) });
  }
  book.set(street, here);
  if (street === openStreet(engine)) redraw(engine);
}

function mark(engine, street, i, isHere, last) {
  const here = book.get(street);
  if (here && spotOf(street, i)) here.set(i, { here: isHere });
  if (street === openStreet(engine)) redraw(engine);
  publish(engine, last);
}

function onGot(engine, msg) {
  const street = String(msg?.street || '');
  const i = Number(msg?.i);
  const row = spotOf(street, i);
  if (picking && picking.street === street && picking.i === i) picking = null;
  if (!row) return;
  // The key goes into the pack wherever the answer finds the player (it was theirs on the street).
  const cls = doorKeyClass(row.key);
  addItem(engine.inv, cls, 1);
  const label = keyLabel(row.key);
  const line = `You picked up 1× ${label}.`;
  engine.toast?.(line);
  engine.pushActivity?.(line);
  if (street === openStreet(engine)) engine.floatText?.(row.x, row.y - 55, `+1 ${label}`, 0x7dcea0);
  engine.playSound?.('ITEM_PICKUP', { volume: 0.65, jitter: 0.04 });
  engine.refreshPack?.();
  engine.save?.();
  mark(engine, street, i, false, `got:${i}`);
}

function onTaken(engine, msg) {
  const street = String(msg?.street || '');
  const i = Number(msg?.i);
  if (!spotOf(street, i)) return;
  mark(engine, street, i, false, `gone:${i}`);
}

function onBack(engine, msg) {
  const street = String(msg?.street || '');
  const i = Number(msg?.i);
  if (!spotOf(street, i)) return;
  mark(engine, street, i, true, `back:${i}`);
}

function onRefused(engine, msg) {
  const street = String(msg?.street || '');
  const i = Number(msg?.i);
  const why = String(msg?.why || '');
  if (picking && picking.street === street && picking.i === i) picking = null;
  if (!spotOf(street, i)) return;
  if (why === 'gone') {
    engine.toast?.(KEY_TEXT.gone, 2400);
    mark(engine, street, i, false, `refused:${i}:${why}`);
    return;
  }
  publish(engine, `refused:${i}:${why}`);
}

function attach(engine, c) {
  client = c;
  unsub = [
    c.on('msg:keys', (msg) => onKeys(engine, msg)),
    c.on('msg:key_got', (msg) => onGot(engine, msg)),
    c.on('msg:key_taken', (msg) => onTaken(engine, msg)),
    c.on('msg:key_back', (msg) => onBack(engine, msg)),
    c.on('msg:key_refused', (msg) => onRefused(engine, msg)),
    c.on('roster', ({ street }) => {
      if (!street) {
        // Off the street or the socket dropped: what lies there is unknown until the next sync.
        if (asked) {
          book.delete(asked);
          asked = '';
          redraw(engine);
        }
        return;
      }
      if (street === asked) return;
      asked = street;
      if (keySpawnsOn(street).length) c.send('key_sync', { street });
    }),
  ];
}

function ensureClient(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (c) attach(engine, c);
  return client;
}

/** The shared stacks to draw here: each spot whose key the server says is lying there. */
export function sharedKeyStacks(street) {
  const here = book.get(street);
  if (!here) return [];
  const out = [];
  for (const s of keySpawnsOn(street)) {
    if (!here.get(s.i)?.here) continue;
    out.push({
      id: keySpotId(s.i),
      streetTsid: street,
      classTsid: doorKeyClass(s.key),
      count: 1,
      x: s.x,
      y: s.y - 4,
      droppedAt: 0,
      shared: true,
      subtitle: KEY_TEXT.lying,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function demoStreet(engine) {
  const raw = engine.param?.('keydemo');
  if (!raw) return '';
  return raw === '1' ? 'GCR11SBEGQL13D9' : String(raw);
}

function demoStep(engine) {
  const tsid = demoStreet(engine);
  if (!tsid || demo.stage === 'done') return;
  if (demo.stage === 'idle') {
    if (!engine.streetExists?.(tsid) || !keySpawnsOn(tsid).length) {
      demo = { stage: 'done' };
      engine.setData?.('keyDemo', 'unknown-street');
      return;
    }
    demo = { stage: 'away' };
    engine.setData?.('keyDemo', 'travelling');
    if (engine.streetTsid === tsid) demo = { stage: 'place', at: Date.now() + 300 };
    else engine.enter(tsid);
    return;
  }
  if (demo.stage === 'place' && Date.now() >= demo.at && engine.player) {
    const s = keySpawnsOn(tsid)[0];
    engine.player.x = s.x + (s.x > 400 ? -110 : 110);
    engine.player.y = s.y - 2;
    engine.player.vx = 0;
    engine.player.vy = 0;
    engine.snapCamera?.();
    demo = { stage: 'done' };
    engine.setData?.('keyDemo', 'placed');
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const doorKeysFeature = {
  id: DOOR_KEYS_FEATURE_ID,

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeKeySpawnState(slice || {});
  },

  onStreetEnter(street, engine) {
    if (demo.stage === 'away' && engine.streetTsid === demoStreet(engine)) demo = { stage: 'place', at: Date.now() + 500 };
    if (multiplayer(engine)) {
      ensureClient(engine);
      publish(engine);
      return;
    }
    soloStreet = openStreet(engine);
    lastTick = 0;
  },

  onStreetClear(engine) {
    // A key picked up just before leaving still counts from when it went.
    if (!multiplayer(engine) && soloStreet) soloStep(engine, soloStreet, { drop: false });
    soloStreet = '';
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    demoStep(engine);
    if (now - lastTick < TICK_MS) return;
    lastTick = now;
    if (multiplayer(engine)) {
      if (!ensureClient(engine)) return;
      if (picking && Date.now() - picking.at > PICK_WAIT_MS) picking = null;
      return;
    }
    const street = openStreet(engine);
    if (!street) return;
    soloStreet = street;
    soloStep(engine, street);
  },

  /** game.js refreshDroppedWorldItems (collected): this street's shared keys, multiplayer only. */
  sharedDroppedStacks(tsid, engine) {
    if (!multiplayer(engine) || !client) return null;
    const street = openStreet(engine);
    if (!street || String(tsid || '') !== street) return null;
    const out = sharedKeyStacks(street);
    return out.length ? out : null;
  },

  /** game.js pickupDroppedWorldItem: a shared key goes to the first to ask the server. */
  sharedPickup(target, engine) {
    const i = keySpotIndex(target?.state?.id || target?.worldItemId);
    if (i < 0 || !multiplayer(engine)) return null;
    const street = openStreet(engine);
    if (!client || !spotOf(street, i)) return null;
    if (client.state !== 'online') {
      engine.toast?.(KEY_TEXT.offline, 2400);
      return false;
    }
    if (picking && Date.now() - picking.at < PICK_WAIT_MS) return true;
    if (!client.send('key_take', { street, i })) {
      engine.toast?.(KEY_TEXT.offline, 2400);
      return false;
    }
    picking = { street, i, at: Date.now() };
    return true;
  },
};

/** Tests: start a fresh session (state, book, client). */
export function resetDoorKeysForTest() {
  state = normalizeKeySpawnState();
  lastTick = 0;
  soloStreet = '';
  demo = { stage: 'idle' };
  for (const off of unsub) off?.();
  unsub = [];
  client = null;
  book.clear();
  asked = '';
  picking = null;
}
