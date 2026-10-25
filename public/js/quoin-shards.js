/**
 * Quoin shards (G212): when a Glitch grabs an iMG, mood, energy or currants
 * quoin, every other active, non-following, non-AFK Glitch within 300 px gets
 * a shard of it. Pure rules from GameServerJS items/quoin.js
 * distributeQuoinShards (83-154) and onPlayerCollision (156-271), plus the
 * client's shard picture (glitch-client AnnouncementController.as
 * doQuoinGot 814-905, QuoinAnimation.as, view/effects/LightningBolt.as).
 *
 * The remake's other Glitches are the local companions (js/local-companions.js)
 * and the race rival, so the solo form shares quoins with them: their shards
 * are shown over them, and their grabs near you shard you.
 */

/** items/quoin.js 84: only these four types shard (not mystery, favor, time or Qurazy). */
export const QUOIN_SHARD_TYPES = Object.freeze(['xp', 'mood', 'energy', 'currants']);

/** items/quoin.js 162-174 coin_stub: the stat name each shard shows. */
export const QUOIN_SHARD_STATS = Object.freeze({
  xp: 'iMG',
  mood: 'mood',
  energy: 'energy',
  currants: 'currants',
});

/** items/quoin.js 86: dist_threshold. */
export const QUOIN_SHARD_RADIUS = 300;
/** items/quoin.js 109-111: 50% inside 25 px, then a straight fall over the next 275 px, never under 5%. */
export const QUOIN_SHARD_NEAR = 25;
export const QUOIN_SHARD_FALL = 275;
export const QUOIN_SHARD_TOP = 0.5;
export const QUOIN_SHARD_FLOOR = 0.05;

/** Recovered takes are QUOIN_SHARD_2..5; 6..9 alias the top take (tools/sound/archiveorg-sfx-map.json 146-149). */
export const QUOIN_SHARD_SOUND_MIN = 2;
export const QUOIN_SHARD_SOUND_MAX = 9;

/**
 * Client timings and sizes: AnnouncementController.as doQuoinGot (bolts 0.2 s
 * apart lasting 1.5 s, bursts 0.2 s after their bolt, receivers 60 px above
 * their feet, the quoin's burst 15 px above its centre, small 16 px text in a
 * 34 px circle), QuoinAnimation.as (shard colour 0xF0F0BD, else white; 24 px
 * text in a 50 px circle) and LightningBolt.as (0.2 s fade in, 0.8 s fade out,
 * 2 px line with an 8 px glow at a random 0.3-0.7 alpha).
 */
export const QUOIN_SHARD_FX = Object.freeze({
  boltStepSec: 0.2,
  boltSec: 1.5,
  boltFadeInSec: 0.2,
  boltFadeOutSec: 0.8,
  boltWidth: 2,
  boltGlow: 8,
  boltColor: 0xffffff,
  shardColor: 0xf0f0bd,
  plainColor: 0xffffff,
  receiverLift: 60,
  startLift: 15,
  smallText: 16,
  smallCircle: 34,
  text: 24,
  circle: 50,
  circleInSec: 0.5,
  circleOutSec: 0.5,
  textInSec: 0.2,
  textDelaySec: 0.4,
  shardTextHoldSec: 0.5,
  shardTextOutSec: 0.4,
  textHoldSec: 1.5,
  textOutSec: 0.4,
  textRise: 40,
  plainInSec: 0.3,
  plainOutSec: 0.2,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const secs = (value) => Math.round(value * 1000) / 1000;

export function quoinTypeShards(typeId) {
  return QUOIN_SHARD_TYPES.includes(String(typeId || ''));
}

/** items/quoin.js 108-111: the share for a Glitch `dist` px from the grabber. */
export function quoinShardPercentage(dist) {
  const d = Math.max(0, finite(dist, 0));
  if (d <= QUOIN_SHARD_NEAR) return QUOIN_SHARD_TOP;
  return Math.max(
    QUOIN_SHARD_TOP - QUOIN_SHARD_TOP * ((d - QUOIN_SHARD_NEAR) / QUOIN_SHARD_FALL),
    QUOIN_SHARD_FLOOR
  );
}

/**
 * items/quoin.js 113-118: the quoin's own benefit (before the grabber's
 * multiplier) times the receiver's multiplier and share, rounded, at least 1.
 */
export function quoinShardAmount(amount, multiplier, dist) {
  const m = finite(multiplier, 0) || 1;
  return Math.max(Math.round(finite(amount, 0) * m * quoinShardPercentage(dist)), 1);
}

/** items/quoin.js 94 and 270: QUOIN_SHARD_<n> with n held to 2-9. */
export function quoinShardSoundKey(count) {
  const n = Math.min(Math.max(Math.floor(finite(count, 0)), QUOIN_SHARD_SOUND_MIN), QUOIN_SHARD_SOUND_MAX);
  return `QUOIN_SHARD_${n}`;
}

/**
 * items/quoin.js 266-271: the grabber hears QUOIN_SHARD_<shards + 1> when
 * anyone got a shard, else the caller's usual QUOIN_GOT (null here).
 */
export function quoinShardGrabberSound(shardCount) {
  const n = Math.max(0, Math.floor(finite(shardCount, 0)));
  return n > 0 ? quoinShardSoundKey(n + 1) : null;
}

/**
 * Who gets a shard of one grab. `players` are the other Glitches on the
 * street ({ id, x, y, following, afk, multiplier }); positions are feet, as
 * the server's pc.x/pc.y. Location.getInRadius keeps a Glitch at exactly 300
 * px and sorts nearest first. `crowd` counts every Glitch in the radius,
 * the grabber included, as apiGetActivePlayersInTheRadiusX does (followers
 * and AFK Glitches count toward the sound but get nothing).
 */
export function planQuoinShards({ typeId, amount, grabber, players = [] } = {}) {
  if (!quoinTypeShards(typeId)) {
    return { applies: false, typeId, crowd: 0, receiverSound: null, receivers: [] };
  }
  const gx = finite(grabber?.x, 0);
  const gy = finite(grabber?.y, 0);
  const near = [];
  for (const other of Array.isArray(players) ? players : []) {
    if (!other) continue;
    const dist = Math.hypot(finite(other.x, Infinity) - gx, finite(other.y, Infinity) - gy);
    if (!(dist <= QUOIN_SHARD_RADIUS)) continue;
    near.push({ other, dist });
  }
  near.sort((a, b) => a.dist - b.dist);
  const crowd = near.length + 1;
  const receivers = [];
  for (const { other, dist } of near) {
    if (other.following || other.afk) continue;
    receivers.push({
      id: other.id,
      x: finite(other.x, 0),
      y: finite(other.y, 0),
      dist,
      percentage: quoinShardPercentage(dist),
      amount: quoinShardAmount(amount, other.multiplier, dist),
    });
  }
  return {
    applies: true,
    typeId,
    stat: QUOIN_SHARD_STATS[typeId],
    crowd,
    receiverSound: quoinShardSoundKey(crowd),
    receivers,
  };
}

/**
 * The client's picture of one grab for one viewer (doQuoinGot 814-905).
 * `shards` are the receivers that got something ({ id, x, y, delta, stat }),
 * in server order. Bolts chain from the quoin to the first receiver and on
 * from each receiver to the next; each receiver gets a burst. The viewer's
 * own shard shows its amount; other receivers show their place in the crowd
 * (2, 3, ...) in a small shard-coloured circle; when the viewer took a shard
 * from someone else, the quoin shows a small 1. A viewer with no part in the
 * grab sees only a plain grow-and-shrink at the quoin.
 * The grabber's own amount at the quoin is left to the caller's usual pickup
 * text (`own: true` on the start burst).
 */
export function quoinShardFxPlan({ quoin, grabberIsViewer = false, viewerId = 'player', shards = [], delta = 0, stat = '' } = {}) {
  const fx = QUOIN_SHARD_FX;
  const startX = finite(quoin?.x, 0);
  const startY = finite(quoin?.y, 0) - fx.startLift;
  const list = Array.isArray(shards) ? shards : [];
  const show = grabberIsViewer || list.some((s) => s.id === viewerId);
  const bolts = [];
  const bursts = [];
  if (show) {
    let lastX = startX;
    let lastY = startY;
    list.forEach((shard, m) => {
      const x = finite(shard.x, 0);
      const y = finite(shard.y, 0) - fx.receiverLift;
      bolts.push({ x1: lastX, y1: lastY, x2: x, y2: y, delaySec: secs(fx.boltStepSec * m), durationSec: fx.boltSec });
      lastX = x;
      lastY = y;
      const delaySec = secs(fx.boltStepSec * (m + 1));
      if (shard.id === viewerId) {
        bursts.push({ x, y, delaySec, value: shard.delta, stat: shard.stat, small: false, id: shard.id });
      } else {
        bursts.push({ x, y, delaySec, value: m + 2, stat: '', small: true, id: shard.id });
      }
    });
  }
  if (grabberIsViewer) {
    bursts.push({ x: startX, y: startY, delaySec: 0, value: delta, stat, small: false, own: true });
  } else if (show) {
    bursts.push({ x: startX, y: startY, delaySec: 0, value: 1, stat: '', small: true });
  } else {
    bursts.push({ x: startX, y: startY, delaySec: 0, value: 0, stat: '', small: false, plain: true });
  }
  return { show, bolts, bursts };
}

/**
 * Companions' quoin interest (remake rule, explained in the feature). A
 * companion only goes for a quoin that shares (the four types above), on its
 * own platform within its reach, not too high to touch, near enough you that
 * the grab shards you (it is flocking with you), and not one you are about
 * to take. One grab per companion per street visit, so a street keeps most
 * of its quoins for you.
 */
export const COMPANION_QUOIN_RULES = Object.freeze({
  lookMs: 2200,
  chance: 0.35,
  reachX: 220,
  maxRise: 132,
  touchX: 28,
  playerClearX: 64,
  perVisit: 1,
  walkMs: 7000,
});

export function companionTouchesQuoin(companion, quoin, rules = COMPANION_QUOIN_RULES) {
  const dx = Math.abs(finite(quoin?.x, Infinity) - finite(companion?.x, 0));
  const rise = finite(companion?.y, 0) - finite(quoin?.y, Infinity);
  return dx <= rules.touchX && rise >= -8 && rise <= rules.maxRise;
}

export function pickCompanionQuoin({ companion, quoins = [], player, rules = COMPANION_QUOIN_RULES } = {}) {
  if (!companion || (companion.grabs || 0) >= rules.perVisit) return null;
  const cx = finite(companion.x, 0);
  const cy = finite(companion.y, 0);
  const minX = finite(companion.minX, -Infinity);
  const maxX = finite(companion.maxX, Infinity);
  let best = null;
  let bestDx = Infinity;
  for (const q of Array.isArray(quoins) ? quoins : []) {
    if (!q || !quoinTypeShards(q.typeId)) continue;
    const qx = finite(q.x, NaN);
    const qy = finite(q.y, NaN);
    if (!Number.isFinite(qx) || !Number.isFinite(qy)) continue;
    if (qx < minX || qx > maxX) continue;
    const dx = Math.abs(qx - cx);
    if (dx > rules.reachX) continue;
    const rise = cy - qy;
    if (rise < -8 || rise > rules.maxRise) continue;
    if (player) {
      const px = finite(player.x, Infinity);
      const py = finite(player.y, Infinity);
      if (Math.abs(px - qx) <= rules.playerClearX) continue;
      // The grab happens with the companion's feet under the quoin.
      if (Math.hypot(px - qx, py - cy) > QUOIN_SHARD_RADIUS) continue;
    }
    if (dx < bestDx) {
      best = q;
      bestDx = dx;
    }
  }
  return best;
}
