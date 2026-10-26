/**
 * Shared street quoins (multiplayer phase 4): the pure book-keeping behind
 * js/features/shared-quoins-feature.js. No DOM, no Pixi (tests/shared-quoins.test.js).
 *
 * As in the original (GameServerJS items/quoin.js onPlayerCollision 156-310),
 * a street's quoins are the same for everyone on it: the first Glitch to
 * touch one gets it, it vanishes for everyone and comes back after its
 * class's respawn_time, and Glitches near the grab get a shard
 * (distributeQuoinShards 83-154). The realtime server (groddle-afternoon-server/quoins.go)
 * decides all of that; this side asks (quoin_claim), waits for the answer
 * and keeps a book of what the server said:
 *
 * - quoins        the street's quoins (place, type, class) and which are gone
 * - quoin_got     this player got one: amount before their own multiplier
 * - quoin_taken   someone else got one (with everyone's shards)
 * - quoin_refused not yours (gone, too far, ...)
 * - quoin_back    one respawned
 *
 * A claim is answered or forgotten after CLAIM_WAIT_MS; a quoin refused for
 * anything but "gone" waits RECLAIM_MS before it is asked for again, so a
 * player standing in it does not ask every frame.
 */

/** Realtime client states that will not come back by themselves: quoins go back to solo rules. */
export const LOCAL_STATES = Object.freeze(new Set(['off', 'signed-out', 'replaced', 'stopped']));

export const CLAIM_WAIT_MS = 3000;
export const RECLAIM_MS = 1200;

/** items/quoin.js 84 and 162-174: the types that shard and the stat each shows. */
export const SHARD_STATS = Object.freeze({ xp: 'iMG', mood: 'mood', energy: 'energy', currants: 'currants' });

const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const word = (v) => (typeof v === 'string' && /^[A-Za-z0-9_ -]{1,40}$/.test(v) ? v : '');
const index = (v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : -1);

/** A shard as the server sent it, cleaned ({ id, x, y, amount, pct }). */
function cleanShard(s) {
  if (!s || typeof s !== 'object') return null;
  const id = Number(s.id);
  const amount = Math.floor(finite(s.amount, 0));
  if (!Number.isFinite(id) || amount < 1) return null;
  return { id, x: finite(s.x), y: finite(s.y), amount, pct: finite(s.pct) };
}

/** A quoin_got / quoin_taken message, cleaned, or null. */
export function normalizeGrab(msg) {
  const i = index(msg?.i);
  const street = word(msg?.street);
  if (i < 0 || !street) return null;
  return {
    street,
    i,
    id: Number.isFinite(Number(msg.id)) ? Number(msg.id) : null,
    name: String(msg.name || '').slice(0, 64),
    type: word(msg.type),
    amount: Math.max(0, Math.floor(finite(msg.amount, 0))),
    x: finite(msg.x),
    y: finite(msg.y),
    crowd: Math.max(0, Math.floor(finite(msg.crowd, 0))),
    shards: (Array.isArray(msg.shards) ? msg.shards : []).map(cleanShard).filter(Boolean),
  };
}

/** A quoins message, cleaned: { street, shared, spots: Map(i -> spot), gone: Set }. */
export function normalizeSync(msg) {
  const street = word(msg?.street);
  if (!street) return null;
  const spots = new Map();
  if (msg.shared === true) {
    for (const q of Array.isArray(msg.quoins) ? msg.quoins : []) {
      const i = index(q?.i);
      if (i < 0 || !Number.isFinite(Number(q.x)) || !Number.isFinite(Number(q.y))) continue;
      spots.set(i, { i, x: Number(q.x), y: Number(q.y), type: word(q.type) || 'xp', className: String(q.class || '') });
    }
  }
  const gone = new Set((Array.isArray(msg.gone) ? msg.gone : []).map(index).filter((i) => i >= 0));
  return { street, shared: msg.shared === true && spots.size > 0, spots, gone };
}

/**
 * The shards for js/quoin-shards.js quoinShardFxPlan ({ id, x, y, delta, stat }),
 * in server order. The viewer's own delta is what landed (`mine`, after the
 * tank caps); the others show the server's amounts.
 */
export function fxShards(grab, { viewerId = null, mine = null } = {}) {
  const stat = SHARD_STATS[grab?.type] || '';
  const out = [];
  for (const s of grab?.shards || []) {
    if (s.id === viewerId) {
      if (mine > 0) out.push({ id: s.id, x: s.x, y: s.y, delta: mine, stat });
    } else out.push({ id: s.id, x: s.x, y: s.y, delta: s.amount, stat });
  }
  return out;
}

/** The viewer's own shard of a grab, or null. */
export function shardFor(grab, viewerId) {
  if (viewerId == null) return null;
  return (grab?.shards || []).find((s) => s.id === viewerId) || null;
}

/** What the server is told for shard eligibility (quoin.js 98-104, 113-115). */
export function statusOf({ afk = false, following = false, multiplier = 1 } = {}) {
  const mult = Math.max(1, Math.min(100, finite(multiplier, 1)));
  return { afk: afk === true, following: following === true, mult: Math.round(mult * 100) / 100 };
}

/** One book per session: the server's view of the street, and the claims in flight. */
export function createSharedQuoinBook() {
  /** The last quoins message (one street at a time). */
  let sync = null;
  /** `${street}#${i}` -> claim sent at. */
  const pending = new Map();
  /** `${street}#${i}` -> do not ask again before. */
  const cooldown = new Map();
  const key = (street, i) => `${street}#${i}`;

  return {
    get sync() {
      return sync;
    },

    /** A quoins message arrived. Returns the cleaned sync or null. */
    synced(msg) {
      const next = normalizeSync(msg);
      if (!next) return null;
      sync = next;
      for (const k of [...pending.keys()]) if (!k.startsWith(`${next.street}#`)) pending.delete(k);
      return sync;
    },

    /**
     * The street was left (or the socket dropped, or a re-join): nothing is
     * known until the next sync. Claims in flight stay booked, so an answer
     * that crosses the re-join still lands (expire() drops the rest).
     */
    forget() {
      sync = null;
      cooldown.clear();
    },

    /** Shared quoins on this street: the server's spot list, or null. */
    spotsFor(street) {
      return sync && sync.street === street && sync.shared ? sync.spots : null;
    },

    isGone(street, i) {
      return Boolean(sync && sync.street === street && sync.gone.has(i));
    },

    isPending(street, i) {
      return pending.has(key(street, i));
    },

    /** Ask for quoin i? True when a claim should go out now (and it is booked). */
    claim(street, i, now) {
      const k = key(street, i);
      if (!this.spotsFor(street)?.has(i) || this.isGone(street, i) || pending.has(k)) return false;
      if (now < (cooldown.get(k) || 0)) return false;
      pending.set(k, now);
      return true;
    },

    /** The claim could not be sent: forget it at once. */
    unsent(street, i) {
      pending.delete(key(street, i));
    },

    /** quoin_got / quoin_taken: gone for everyone. Returns whether this player had asked. */
    taken(street, i) {
      const k = key(street, i);
      const asked = pending.delete(k);
      cooldown.delete(k);
      if (sync && sync.street === street) sync.gone.add(i);
      return asked;
    },

    /** quoin_refused. Returns 'gone' (drop it) or 'restore' (show it again). */
    refused(street, i, why, now) {
      const k = key(street, i);
      pending.delete(k);
      if (why === 'gone') {
        if (sync && sync.street === street) sync.gone.add(i);
        return 'gone';
      }
      cooldown.set(k, now + RECLAIM_MS);
      return 'restore';
    },

    /** quoin_back: spawned again. */
    back(street, i) {
      if (sync && sync.street === street) sync.gone.delete(i);
      cooldown.delete(key(street, i));
    },

    /** Claims unanswered for CLAIM_WAIT_MS: [{ street, i }] to show again. */
    expire(now) {
      const out = [];
      for (const [k, at] of pending) {
        if (now - at < CLAIM_WAIT_MS) continue;
        pending.delete(k);
        const cut = k.lastIndexOf('#');
        out.push({ street: k.slice(0, cut), i: Number(k.slice(cut + 1)) });
      }
      return out;
    },
  };
}
