/**
 * Shared street quoins (multiplayer phase 4). In multiplayer a street's
 * natural quoins are the same for everyone on it, as in the original
 * (GameServerJS items/quoin.js onPlayerCollision 156-310): the first Glitch
 * to touch one gets it, it vanishes for everyone and respawns after its
 * class's respawn_time, and Glitches within 300 px get a shard
 * (distributeQuoinShards 83-154). The realtime server (groddle-afternoon-server/quoins.go)
 * owns all of that; the book is js/shared-quoins.js.
 *
 * Multiplayer only (engine.mode and the realtime client). In solo this
 * feature does nothing: every hook returns null.
 *
 * - On each street the client asks quoin_sync; the answer places the
 *   street's natural quoins where the server has them (the same planner as
 *   solo, without the per-player arrival reservation) and leaves out the
 *   ones gone. Until then they are hidden and cannot be grabbed.
 * - Touching one (game.js quoinTouched) hides it and asks the server; the
 *   reward lands only when the server says this player got it
 *   (engine.grantQuoin, the solo reward path with the server's amount),
 *   and the quoin comes back if the server says no.
 * - Someone else's grab hides it with the source's grow-and-shrink (or the
 *   shard bolts), and a shard lands on this player's own stats with the
 *   QUOIN_SHARD_<n> sound (quoin.js 177).
 * - Respawns come from the server (game.js tickQuoinRespawns asks
 *   quoinsShared and stands down).
 * - quoin_status tells the server whether this player is AFK or following
 *   someone, and their multiplier, for shard eligibility (quoin.js 98-115).
 *
 * The daily quoin limit (quoin.js 159) is the player's own: at the limit
 * the touch is left to game.js, which says so and leaves the quoin alone.
 * Personal quoins (Qurazy, quest rewards, private instances, homes) never
 * come here. A Party Space's quoins are its party's (G334): the space's hub
 * street (PARTY_<id>, the sharedQuoinStreet query) is the street they share. If realtime is off for good (off, signed out, replaced) the
 * street's quoins are this player's own again, as in solo.
 *
 * QA: canvas data sharedQuoins (pending | shared | local | off),
 * sharedQuoinsStreet, sharedQuoinsLive (spawned/total), sharedQuoinLast
 * (got:i:amount | taken:i:by | refused:i:why | back:i | shard:i:amount>actual).
 */

import { QUOIN_TYPES, creditQuoinStat } from '../quoins.js?v=desk2-1';
import { quoinShardGrabberSound, quoinShardSoundKey } from '../quoin-shards.js?v=g216-1';
import { LOCAL_STATES, SHARD_STATS, createSharedQuoinBook, fxShards, normalizeGrab, shardFor, statusOf } from '../shared-quoins.js?v=mp4-1';

export const SHARED_QUOINS_FEATURE_ID = 'shared-quoins';
/** Status goes out on a change, and at least this often while on a street. */
const STATUS_EVERY_MS = 15000;

let client = null;
let book = null;
let unsub = [];
/** The street this page entered (engine.streetTsid at onStreetEnter). */
let entered = '';
/** The street whose sync was put in the world. */
let applied = '';
/** The street quoin_sync was sent for. */
let asked = '';
let statusKey = '';
let statusAt = 0;
let mode = 'off';

function multiplayer(engine) {
  return engine?.mode === 'multiplayer';
}

/** realtime-feature sharedStreet: the street others share, or '' in a private place. */
function sharedStreet(engine) {
  if (!engine?.player || !engine.streetTsid) return '';
  // G334: a Party Space's members share its quoins on the space's hub street (party-spaces-feature).
  const own = engine.query?.('sharedQuoinStreet', engine);
  if (own) return String(own);
  if (engine.transientInstance?.()) return '';
  if (engine.homeContext?.().inHome) return '';
  return String(engine.streetTsid);
}

/** The world's natural quoins (the street's own spots, not quest or Qurazy ones). */
function naturalQuoins(engine) {
  return (engine.quoins || []).filter((q) => q && !q.destroyed && Number.isInteger(q.naturalQuoinIndex)
    && !Number.isInteger(q.summersDayBonusIndex) && !Number.isInteger(q.summersDayRewardIndex));
}

function findQuoin(engine, i) {
  return naturalQuoins(engine).find((q) => q.naturalQuoinIndex === i && q.sharedQuoin) || null;
}

function publish(engine, last) {
  engine.setData?.('sharedQuoins', mode);
  engine.setData?.('sharedQuoinsStreet', applied);
  const spots = applied ? book?.spotsFor(applied) : null;
  if (spots) {
    const live = naturalQuoins(engine).filter((q) => q.sharedQuoin).length;
    engine.setData?.('sharedQuoinsLive', `${live}/${spots.size}`);
  } else engine.setData?.('sharedQuoinsLive', '');
  if (last) engine.setData?.('sharedQuoinLast', last);
}

/** How this street's quoins work right now. */
function currentMode(engine) {
  if (!client) return 'off';
  const street = sharedStreet(engine);
  if (!street || street !== entered) return 'local';
  if (LOCAL_STATES.has(client.state)) return 'local';
  if (applied === street) return book.spotsFor(street) ? 'shared' : 'local';
  if (book.sync?.street === street && !book.sync.shared) return 'local';
  return 'pending';
}

function spawnShared(engine, spot) {
  const q = engine.spawnQuoin({ x: spot.x, y: spot.y }, QUOIN_TYPES[spot.type] ? spot.type : 'xp', {
    naturalQuoinIndex: spot.i,
    phaseIndex: spot.i,
    useExactY: true,
  });
  if (!q) return null;
  q.quoinClass = spot.className;
  q.sharedQuoin = true;
  return q;
}

/** Put the server's view of this street in the world. */
function applySync(engine) {
  const street = entered;
  const spots = book.spotsFor(street);
  applied = street;
  if (!spots) {
    // Not a street the server shares: the quoins are this player's own.
    for (const q of naturalQuoins(engine)) q.visible = true;
    return;
  }
  for (const q of naturalQuoins(engine)) engine.takeQuoin(q);
  // Only the spots this street has here (a feature may give it fewer).
  const count = Number.isFinite(Number(engine.population?.quoins)) ? Number(engine.population.quoins) : spots.size;
  for (const spot of spots.values()) {
    if (spot.i >= count || book.isGone(street, spot.i)) continue;
    spawnShared(engine, spot);
  }
}

function sendStatus(engine, now, force = false) {
  const status = statusOf({ afk: engine.playerAfk, following: engine.playerFollowing, multiplier: engine.quoinState?.multiplier });
  const k = JSON.stringify(status);
  if (!force && k === statusKey && now - statusAt < STATUS_EVERY_MS) return;
  if (client.send('quoin_status', status)) {
    statusKey = k;
    statusAt = now;
  }
}

function showGrabFx(engine, grab, { grabberIsViewer, mine = null }) {
  const viewerId = client?.me?.id ?? null;
  return engine.query?.('quoinShardFx', {
    quoin: { x: grab.x, y: grab.y },
    grabberIsViewer,
    viewerId,
    shards: fxShards(grab, { viewerId, mine }),
    stat: SHARD_STATS[grab.type] || '',
  }, engine);
}

function onGot(engine, msg) {
  const grab = normalizeGrab(msg);
  if (!grab) return;
  const asked = book.taken(grab.street, grab.i);
  // Off that street already (the answer crossed a signpost): nothing to draw or give.
  if (grab.street !== entered) return;
  let q = findQuoin(engine, grab.i);
  if (!asked) {
    if (q) engine.takeQuoin(q);
    return;
  }
  // A re-sync may have dropped the drawn quoin meanwhile: the win still lands where it was.
  if (!q) {
    const spot = book.spotsFor(grab.street)?.get(grab.i) || { i: grab.i, x: grab.x, y: grab.y, type: grab.type, className: '' };
    q = spawnShared(engine, spot);
    if (!q) return;
  }
  const sound = quoinShardGrabberSound(grab.shards.length);
  const ok = engine.grantQuoin?.(q, { amount: grab.amount, share: { sound } });
  if (!ok) engine.takeQuoin(q);
  else showGrabFx(engine, grab, { grabberIsViewer: true });
  publish(engine, `got:${grab.i}:${grab.amount}`);
}

function onTaken(engine, msg) {
  const grab = normalizeGrab(msg);
  if (!grab) return;
  book.taken(grab.street, grab.i);
  if (grab.street !== entered) return;
  const q = findQuoin(engine, grab.i);
  if (q) engine.takeQuoin(q);
  const myId = client?.me?.id ?? null;
  const shard = shardFor(grab, myId);
  let actual = 0;
  if (shard && SHARD_STATS[grab.type]) {
    // The shard lands on this player's own stats (quoin.js 121-133).
    actual = creditQuoinStat(engine.pc, grab.type, shard.amount);
    if (actual > 0) {
      // quoin.js 94, 177: QUOIN_SHARD_<Glitches in the radius, 2 to 9>.
      const sound = quoinShardSoundKey(grab.crowd);
      engine.playSound?.(sound, { volume: 0.6, jitter: 0.03 });
      engine.setData?.('quoinShardSound', sound);
      engine.pushActivity?.(`You got a quoin shard from ${grab.name || 'someone'}: +${actual} ${SHARD_STATS[grab.type]}.`);
      engine.updateHud?.();
    }
    engine.setData?.('quoinShardYou', `${grab.type}:${shard.amount}>${actual}`);
  }
  showGrabFx(engine, grab, { grabberIsViewer: false, mine: actual });
  publish(engine, shard ? `shard:${grab.i}:${shard.amount}>${actual}` : `taken:${grab.i}:${grab.id}`);
}

function onRefused(engine, msg) {
  const i = Number.isInteger(msg?.i) ? msg.i : -1;
  const street = String(msg?.street || '');
  if (i < 0 || !street) return;
  const what = book.refused(street, i, String(msg.why || ''), Date.now());
  if (street !== entered) return;
  const q = findQuoin(engine, i);
  if (q) {
    if (what === 'gone') engine.takeQuoin(q);
    else q.visible = true;
  }
  publish(engine, `refused:${i}:${msg.why || ''}`);
}

function onBack(engine, msg) {
  const i = Number.isInteger(msg?.i) ? msg.i : -1;
  const street = String(msg?.street || '');
  if (i < 0 || !street) return;
  book.back(street, i);
  if (street !== entered || applied !== street) return;
  const spot = book.spotsFor(street)?.get(i);
  const count = Number.isFinite(Number(engine.population?.quoins)) ? Number(engine.population.quoins) : Infinity;
  if (spot && spot.i < count && !findQuoin(engine, i)) spawnShared(engine, spot);
  publish(engine, `back:${i}`);
}

function attach(engine, c) {
  client = c;
  book = createSharedQuoinBook();
  unsub = [
    c.on('msg:quoins', (msg) => {
      if (book.synced(msg)) publish(engine);
    }),
    c.on('msg:quoin_got', (msg) => onGot(engine, msg)),
    c.on('msg:quoin_taken', (msg) => onTaken(engine, msg)),
    c.on('msg:quoin_refused', (msg) => onRefused(engine, msg)),
    c.on('msg:quoin_back', (msg) => onBack(engine, msg)),
    c.on('roster', ({ street }) => {
      if (!street) {
        // Off the street or the socket dropped: the next join syncs afresh.
        // Keep what is drawn; nothing can be grabbed until the next sync.
        if (asked) {
          asked = '';
          applied = '';
          book.forget();
        }
        return;
      }
      if (street === asked) return;
      asked = street;
      sendStatus(engine, Date.now(), true);
      c.send('quoin_sync', { street });
    }),
  ];
}

/** The realtime client, once realtime-feature has one (it makes it at init). */
function ensureClient(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (c) attach(engine, c);
  return client;
}

export const sharedQuoinsFeature = {
  id: SHARED_QUOINS_FEATURE_ID,

  onStreetEnter(street, engine) {
    if (!multiplayer(engine)) return;
    ensureClient(engine);
    entered = sharedStreet(engine) || String(engine.streetTsid || '');
    applied = '';
    if (client && sharedStreet(engine) && !LOCAL_STATES.has(client.state)) {
      // Hidden until the server says where they are and which are gone.
      for (const q of naturalQuoins(engine)) q.visible = false;
    }
  },

  onStreetClear(engine) {
    if (!multiplayer(engine)) return;
    entered = '';
    applied = '';
  },

  onTick(dtMs, now, engine) {
    if (!multiplayer(engine) || !engine.started) return;
    if (!ensureClient(engine)) return;
    const wall = Date.now();
    if (book.sync && book.sync.street === entered && applied !== entered && entered === sharedStreet(engine)) applySync(engine);
    for (const { street, i } of book.expire(wall)) {
      const q = street === entered ? findQuoin(engine, i) : null;
      if (q) q.visible = true;
    }
    const next = currentMode(engine);
    if (next !== mode) {
      // Realtime is gone for good: the drawn quoins are this player's own again.
      if (next === 'local') for (const q of naturalQuoins(engine)) q.visible = true;
      mode = next;
      publish(engine);
    }
    if (client.state === 'online' && client.street) sendStatus(engine, wall);
  },

  /**
   * game.js quoin pickup: the player touched quoin q. True when this feature
   * has it (asked the server, or waiting): game.js leaves it alone. Null
   * hands it to the solo path (solo, personal quoins, local mode, and the
   * daily limit, whose notice game.js gives).
   */
  quoinTouched(q, engine) {
    if (!multiplayer(engine) || !ensureClient(engine) || !q || !Number.isInteger(q.naturalQuoinIndex)) return null;
    if (Number.isInteger(q.summersDayBonusIndex) || Number.isInteger(q.summersDayRewardIndex)) return null;
    const m = currentMode(engine);
    if (m === 'local' || m === 'off') return null;
    if (m === 'pending' || !q.sharedQuoin) return true;
    const qs = engine.quoinState;
    // quoin.js 159: at the daily limit the quoin is not taken; game.js says so.
    if (qs && q.typeId !== 'qurazy' && qs.collectedToday >= qs.dailyLimit) return null;
    const street = applied;
    const i = q.naturalQuoinIndex;
    if (book.isPending(street, i)) return true;
    if (!book.claim(street, i, Date.now())) return true;
    if (!client.send('quoin_claim', { street, i })) {
      book.unsent(street, i);
      return true;
    }
    // A short optimistic hide; quoin_refused or the claim timing out brings it back.
    q.visible = false;
    return true;
  },

  /** game.js tickQuoinRespawns: the server brings this street's quoins back. */
  quoinsShared(engine) {
    if (!multiplayer(engine) || !client) return null;
    const m = currentMode(engine);
    return m === 'shared' || m === 'pending' ? true : null;
  },
};
