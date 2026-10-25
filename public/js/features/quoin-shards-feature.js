/**
 * Quoin shards (G212): grab an iMG, mood, energy or currants quoin with other
 * Glitches near you and they get a shard; their grabs near you shard you.
 * Rules in js/quoin-shards.js (GameServerJS items/quoin.js 83-154, 169,
 * 266-271); the picture is the client's lightning bolts and quoin bursts
 * (glitch-client AnnouncementController.as doQuoinGot 814-905,
 * QuoinAnimation.as, view/effects/LightningBolt.as), drawn in vector.
 *
 * The other Glitches here are the local companions (opt-in, ?companions=1)
 * and the Grab 'Em Good rival (races-feature calls quoinShards too).
 *
 * Companions did not grab quoins before G212. They now take a gentle
 * interest (COMPANION_QUOIN_RULES): while idle they may jog to a sharing
 * quoin on their own platform that is near you, at most one each per street
 * visit, and a quoin they take comes back on your next visit (it is not
 * saved as yours). So they flock with you without stripping a street.
 *
 * Hook: engine.query('quoinShards', grab, engine) with
 *   grab = { grabber: 'player' | <name>, typeId, baseAmount,
 *            quoin: { x, y }, at: { x, y } (grabber's feet),
 *            others?: [{ name, x, y }] (default: the local companions) }
 * returns { sound, shards, playerShard }. For the player's own grab `sound`
 * replaces QUOIN_GOT (null when nobody got a shard).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&quoindemo=xp&quoinshard=you
 *     (companions stand 10, 140 and 250 px from the quoin; walk onto it, or add
 *     &quoinshardautoplay=1). &quoinshard=them sends Amp to the quoin while you
 *     stand 120 px away; &quoinshard=natural sets the three round a quoin and
 *     leaves it to their own interest roll. &quoinmult=3 scales your shard. quoinshard turns the
 *     companions on for that load (game.js localCompanionsEnabled). A shard is a share of
 *     the quoin's class benefit (G227: spot 0's class is a stable hash; force one with
 *     &quoinclass=slow medium-large xp for a steady 25, or fast tiny xp for 1).
 * Canvas: data-quoin-shard-last, -crowd, -sound, -you, -fx, -demo,
 *     data-companion-quoins; data-last-sound for the sound check.
 */

import { QUOIN_TYPES, creditQuoinStat, quoinClassAmount } from '../quoins.js?v=g227-1';
import {
  COMPANION_QUOIN_RULES,
  QUOIN_SHARD_FX,
  QUOIN_SHARD_STATS,
  companionTouchesQuoin,
  pickCompanionQuoin,
  planQuoinShards,
  quoinShardFxPlan,
  quoinShardGrabberSound,
  quoinTypeShards,
} from '../quoin-shards.js?v=g216-1';

let fxRoot = null;
const fxItems = [];
/** Per companion name: { grabs, nextLookAt, target, until } for this street visit. */
const interest = new Map();
let companionGrabs = 0;
let demo = null;

// —— Tweener easings (the client's TSTweener uses Penner's set) ——
const easeOutBack = (t) => {
  const s = 1.70158;
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};
const easeInOutBack = (t) => {
  const s = 1.70158 * 1.525;
  const u = t * 2;
  if (u < 1) return 0.5 * (u * u * ((s + 1) * u - s));
  const v = u - 2;
  return 0.5 * (v * v * ((s + 1) * v + s) + 2);
};
const easeInExpo = (t) => (t <= 0 ? 0 : 2 ** (10 * (t - 1)));
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

function ensureRoot(engine) {
  const layer = engine.fxLayer;
  if (!layer) return null;
  if (fxRoot && !fxRoot.destroyed && fxRoot.parent === layer) return fxRoot;
  fxRoot = new engine.PIXI.Container();
  fxRoot.label = 'quoinShardFx';
  fxRoot.eventMode = 'none';
  fxRoot.zIndex = 60;
  layer.addChild(fxRoot);
  return fxRoot;
}

function clearFx() {
  for (const item of fxItems) if (!item.node.destroyed) item.node.destroy({ children: true });
  fxItems.length = 0;
  if (fxRoot && !fxRoot.destroyed) fxRoot.destroy({ children: true });
  fxRoot = null;
}

/** LightningBolt.as drawLightningStep: recursive midpoint displacement, redrawn each frame. */
function boltPath(g, x1, y1, x2, y2, displacement) {
  if (displacement < 1) {
    g.moveTo(x1, y1).lineTo(x2, y2);
    return;
  }
  const d = displacement * 0.5;
  const xm = (x1 + x2) * 0.5 + (Math.random() - 0.5) * d;
  const ym = (y1 + y2) * 0.5 + (Math.random() - 0.5) * d;
  boltPath(g, x1, y1, xm, ym, d);
  boltPath(g, x2, y2, xm, ym, d);
}

function drawBolt(item) {
  const { g, x1, y1, x2, y2, glowAlpha } = item;
  const fx = QUOIN_SHARD_FX;
  const displacement = Math.hypot(x2 - x1, y2 - y1) / 3;
  g.clear();
  // Pixi 8 has no GlowFilter in core: a wide soft stroke under the 2 px line stands in.
  boltPath(g, x1, y1, x2, y2, displacement);
  g.stroke({ width: fx.boltGlow, color: fx.boltColor, alpha: glowAlpha * 0.45, cap: 'round', join: 'round' });
  boltPath(g, x1, y1, x2, y2, displacement);
  g.stroke({ width: fx.boltWidth, color: fx.boltColor, alpha: 1, cap: 'round', join: 'round' });
}

function addBolt(engine, root, bolt) {
  const g = new engine.PIXI.Graphics();
  g.alpha = 0;
  root.addChild(g);
  fxItems.push({
    kind: 'bolt',
    node: g,
    g,
    ...bolt,
    // LightningBolt.as show(): a random glow alpha in [0.3, 0.7].
    glowAlpha: 0.3 + Math.random() * 0.4,
    age: 0,
  });
}

function burstText(engine, value, stat, small) {
  const fx = QUOIN_SHARD_FX;
  const color = small ? fx.shardColor : fx.plainColor;
  const label = value < 0 ? `-${Math.abs(value)}${stat ? ` ${stat}` : ''}` : `${small ? '' : '+'}${Math.abs(value)}${stat ? ` ${stat}` : ''}`;
  const text = new engine.PIXI.Text({ text: label, style: {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: small ? fx.smallText : fx.text,
    fontWeight: '700',
    fill: color,
    // QuoinAnimation.as: a tight 0x666666 glow round the figures.
    stroke: { color: 0x666666, width: 3, join: 'round' },
  } });
  text.anchor.set(0.5);
  text.scale.set(0);
  return text;
}

function addBurst(engine, root, burst) {
  const fx = QUOIN_SHARD_FX;
  const node = new engine.PIXI.Container();
  node.x = burst.x;
  node.y = burst.y;
  const circle = new engine.PIXI.Graphics();
  node.addChild(circle);
  const hasText = !burst.plain && (burst.value || burst.stat);
  const text = hasText ? burstText(engine, burst.value, burst.stat, burst.small) : null;
  if (text) node.addChild(text);
  root.addChild(node);
  fxItems.push({
    kind: 'burst',
    node,
    circle,
    text,
    small: burst.small,
    plain: !hasText,
    delaySec: burst.delaySec,
    color: burst.small ? fx.shardColor : fx.plainColor,
    size: burst.small ? fx.smallCircle : fx.circle,
    age: 0,
  });
}

function showFx(engine, plan) {
  const root = ensureRoot(engine);
  if (!root) return;
  for (const bolt of plan.bolts) addBolt(engine, root, bolt);
  for (const burst of plan.bursts) {
    // The player's own grab keeps game.js's pickup text at the quoin.
    if (burst.own) continue;
    addBurst(engine, root, burst);
  }
  engine.setData('quoinShardFx', String(fxItems.length));
}

function tickBolt(item) {
  const fx = QUOIN_SHARD_FX;
  const t = item.age - item.delaySec;
  if (t < 0) {
    item.g.alpha = 0;
    return true;
  }
  const hold = Math.max(item.durationSec, fx.boltFadeInSec + fx.boltFadeOutSec) - (fx.boltFadeInSec + fx.boltFadeOutSec);
  if (t < fx.boltFadeInSec) item.g.alpha = easeInExpo(t / fx.boltFadeInSec);
  else if (t < fx.boltFadeInSec + hold) item.g.alpha = 1;
  else {
    const out = (t - fx.boltFadeInSec - hold) / fx.boltFadeOutSec;
    if (out >= 1) return false;
    item.g.alpha = 1 - easeOutExpo(out);
  }
  drawBolt(item);
  return true;
}

function drawCircle(item, perc) {
  const r = Math.max(0, (item.size / 2) * perc);
  item.circle.clear();
  if (r <= 0.2) return;
  item.circle.circle(0, 0, r).fill({ color: item.color, alpha: 0.5 }).stroke({ width: 2, color: item.color });
}

function tickBurst(item) {
  const fx = QUOIN_SHARD_FX;
  const t = item.age - item.delaySec;
  if (t < 0) {
    drawCircle(item, 0);
    return true;
  }
  if (item.plain) {
    // tweenGrowAndShrink: 0.3 s out, 0.2 s back, then done.
    if (t < fx.plainInSec) drawCircle(item, easeOutBack(t / fx.plainInSec));
    else if (t < fx.plainInSec + fx.plainOutSec) drawCircle(item, 1 - easeInOutBack((t - fx.plainInSec) / fx.plainOutSec));
    else return false;
    return true;
  }
  // tweenCircle: 0.5 s out, 0.5 s back.
  if (t < fx.circleInSec) drawCircle(item, easeOutBack(t / fx.circleInSec));
  else if (t < fx.circleInSec + fx.circleOutSec) drawCircle(item, Math.max(0, 1 - easeInOutBack((t - fx.circleInSec) / fx.circleOutSec)));
  else drawCircle(item, 0);
  // tweenText: grows over 0.2 s (a shard at once, a full burst 0.4 s on), then fades.
  const textAt = item.small ? 0 : fx.textDelaySec;
  const tt = t - textAt;
  if (item.text) {
    if (tt < 0) item.text.scale.set(0);
    else if (tt < fx.textInSec) item.text.scale.set(easeOutCubic(tt / fx.textInSec));
    else {
      item.text.scale.set(1);
      const hold = item.small ? fx.shardTextHoldSec : fx.textHoldSec;
      const out = item.small ? fx.shardTextOutSec : fx.textOutSec;
      const after = tt - fx.textInSec - hold;
      if (after > 0) {
        const p = easeOutCubic(clamp01(after / out));
        item.text.alpha = 1 - p;
        if (!item.small) item.text.y = -fx.textRise * p;
        if (after >= out) return false;
      }
    }
  } else if (t >= fx.circleInSec + fx.circleOutSec) {
    return false;
  }
  return true;
}

function tickFx(dtMs, engine) {
  if (!fxItems.length) return;
  const dt = Math.max(0, dtMs) / 1000;
  for (let i = fxItems.length - 1; i >= 0; i -= 1) {
    const item = fxItems[i];
    if (item.node.destroyed) {
      fxItems.splice(i, 1);
      continue;
    }
    item.age += dt;
    const alive = item.kind === 'bolt' ? tickBolt(item) : tickBurst(item);
    if (!alive) {
      item.node.destroy({ children: true });
      fxItems.splice(i, 1);
    }
  }
  if (!fxItems.length) engine.setData('quoinShardFx', '0');
}

function companionsAsOthers(engine) {
  return (engine.localCompanions || [])
    .filter((actor) => actor?.sprite && !actor.sprite.destroyed)
    .map((actor) => ({ name: actor.name, x: actor.sprite.x, y: actor.sprite.y }));
}

function playerAsOther(engine) {
  const player = engine.player;
  if (!player) return null;
  return {
    id: 'player',
    x: player.x,
    y: player.y,
    // items/quoin.js 98-104: no shard while following someone or AFK.
    following: engine.playerFollowing === true,
    afk: engine.playerAfk === true,
    multiplier: Number(engine.quoinState?.multiplier) || 1,
  };
}

/**
 * One grab. Companions and the rival have no tracked stats, so their shard
 * always lands (actual > 0); yours goes through the normal quoin reward path
 * and only counts when something landed (items/quoin.js 160-182).
 */
function shareQuoin(grab, engine) {
  const typeId = String(grab?.typeId || '');
  if (!quoinTypeShards(typeId)) return null;
  const def = QUOIN_TYPES[typeId];
  const baseAmount = Number.isFinite(Number(grab.baseAmount)) ? Number(grab.baseAmount) : def.baseAmount;
  const grabber = String(grab.grabber || 'player');
  const at = grab.at || grab.quoin || { x: 0, y: 0 };
  const quoin = grab.quoin || at;
  const others = (Array.isArray(grab.others) ? grab.others : companionsAsOthers(engine))
    .filter((o) => o && o.name !== grabber)
    .map((o) => ({ id: o.name, x: o.x, y: o.y, following: false, afk: false, multiplier: 1 }));
  const players = grabber === 'player' ? others : [playerAsOther(engine), ...others].filter(Boolean);
  const plan = planQuoinShards({ typeId, amount: baseAmount, grabber: at, players });
  const stat = QUOIN_SHARD_STATS[typeId];
  const shards = [];
  let playerShard = null;
  for (const receiver of plan.receivers) {
    if (receiver.id === 'player') {
      const actual = creditQuoinStat(engine.pc, typeId, receiver.amount);
      playerShard = { amount: receiver.amount, actual, percentage: receiver.percentage, dist: Math.round(receiver.dist) };
      if (actual > 0) shards.push({ id: 'player', x: receiver.x, y: receiver.y, delta: actual, stat });
    } else {
      shards.push({ id: receiver.id, x: receiver.x, y: receiver.y, delta: receiver.amount, stat });
    }
  }
  const fxPlan = quoinShardFxPlan({
    quoin,
    grabberIsViewer: grabber === 'player',
    viewerId: 'player',
    shards,
    stat,
  });
  showFx(engine, fxPlan);
  engine.setData('quoinShardLast', `${grabber}>${shards.map((s) => `${s.id}:${s.delta}`).join(',') || 'none'}:${typeId}`);
  engine.setData('quoinShardCrowd', String(plan.crowd));
  let sound = null;
  if (grabber === 'player') {
    sound = quoinShardGrabberSound(shards.length);
    engine.setData('quoinShardSound', sound || 'QUOIN_GOT');
  } else if (playerShard && playerShard.actual > 0) {
    // items/quoin.js 177: the receiver hears QUOIN_SHARD_<Glitches in the radius>.
    engine.playSound(plan.receiverSound, { volume: 0.6, jitter: 0.03 });
    engine.setData('quoinShardSound', plan.receiverSound);
    engine.setData('quoinShardYou', `${typeId}:${playerShard.amount}>${playerShard.actual}@${playerShard.dist}`);
    engine.pushActivity(`You got a quoin shard from ${grabber}: +${playerShard.actual} ${stat}.`);
    engine.updateHud();
  }
  return { sound, shards, playerShard, crowd: plan.crowd };
}

function companionBounds(actor) {
  return {
    x: actor.sprite.x,
    y: actor.sprite.y,
    minX: actor.homeMinX ?? -Infinity,
    maxX: actor.homeMaxX ?? Infinity,
  };
}

function naturalQuoins(engine) {
  // Only the street's own quoins: quest, Summer's Day and other placed ones stay yours.
  return (engine.quoins || []).filter((q) => q && !q.destroyed && Number.isInteger(q.naturalQuoinIndex)
    && !Number.isInteger(q.summersDayBonusIndex) && !Number.isInteger(q.summersDayRewardIndex));
}

function companionGrab(actor, q, engine) {
  if (!engine.takeQuoin(q)) return;
  const row = interest.get(actor.name);
  row.grabs += 1;
  row.target = null;
  companionGrabs += 1;
  engine.setData('companionQuoins', String(companionGrabs));
  // A little hop for the higher quoins; updateLocalCompanions eases the feet back down.
  if (actor.sprite.y - q.y > 70) actor.sprite.y -= 26;
  actor.socialUntil = 0;
  shareQuoin({
    grabber: actor.name,
    typeId: q.typeId,
    // G227: the spot's class sets the amount it shards (quoin.js 161-169).
    baseAmount: quoinClassAmount(q.quoinClass, q.typeId) ?? QUOIN_TYPES[q.typeId]?.baseAmount,
    quoin: { x: q.x, y: q.y },
    at: { x: actor.sprite.x, y: actor.sprite.y },
  }, engine);
}

function tickCompanions(now, engine) {
  const actors = engine.localCompanions || [];
  if (!actors.length) return;
  const quoins = naturalQuoins(engine);
  const player = engine.player;
  const busy = engine.acting?.() || engine.busy?.();
  for (const actor of actors) {
    if (!actor?.sprite || actor.sprite.destroyed) continue;
    let row = interest.get(actor.name);
    if (!row) {
      row = { grabs: 0, nextLookAt: now + COMPANION_QUOIN_RULES.lookMs, target: null, until: 0 };
      interest.set(actor.name, row);
    }
    if (row.target) {
      const q = row.target;
      const live = quoins.includes(q);
      // Someone else's call on the companion (a chat, a Feat, the bear) wins.
      const redirected = actor.socialTargetX !== q.x;
      if (!live || redirected || now > row.until) {
        row.target = null;
        if (!redirected) actor.socialUntil = 0;
        continue;
      }
      actor.socialUntil = Math.max(actor.socialUntil || 0, now + 400);
      if (companionTouchesQuoin({ x: actor.sprite.x, y: actor.sprite.y }, q)) companionGrab(actor, q, engine);
      continue;
    }
    if (demo?.mode === 'them' && actor.name === demo.companion && !demo.sent) continue;
    if (now < row.nextLookAt || busy) continue;
    row.nextLookAt = now + COMPANION_QUOIN_RULES.lookMs;
    if (now < (actor.socialUntil || 0) || actor.state?.following) continue;
    if (Math.random() >= COMPANION_QUOIN_RULES.chance) continue;
    const q = pickCompanionQuoin({ companion: { ...companionBounds(actor), grabs: row.grabs }, quoins, player });
    if (!q) continue;
    sendCompanion(actor, q, row, now);
  }
}

function sendCompanion(actor, q, row, now) {
  row.target = q;
  row.until = now + COMPANION_QUOIN_RULES.walkMs;
  actor.socialTargetX = q.x;
  actor.socialUntil = now + COMPANION_QUOIN_RULES.walkMs;
}

// —— QA staging ——
function demoMode(engine) {
  const raw = engine.param('quoinshard');
  if (!raw || raw === '0') return null;
  return raw === 'them' || raw === 'natural' ? raw : 'you';
}

function groundAt(engine, x, fallbackY) {
  const platforms = engine.platforms || [];
  let best = null;
  for (const p of platforms) {
    const minX = Math.min(p.x1, p.x2);
    const maxX = Math.max(p.x1, p.x2);
    if (x < minX || x > maxX) continue;
    const span = p.x2 - p.x1 || 1;
    const y = p.y1 + ((x - p.x1) / span) * (p.y2 - p.y1);
    if (y < fallbackY - 40) continue;
    if (best === null || y < best) best = y;
  }
  return best ?? fallbackY;
}

function tickDemo(now, engine) {
  if (!demo || demo.done) return;
  const actors = engine.localCompanions || [];
  // The demo quoin is the first one (quoindemo's type), held from staging on.
  const q = demo.quoin || (engine.quoins || [])[0];
  const player = engine.player;
  if (!actors.length || !q || !player) return;
  // Let the boot's own quoindemo placement land first.
  demo.firstSeen ||= now;
  if (now - demo.firstSeen < 700) return;
  if (!demo.staged) {
    demo.staged = true;
    demo.stagedAt = now;
    demo.quoin = q;
    const groundY = q.baseY + 58;
    if (demo.mode === 'you') {
      // Shares of 50%, about 30% and about 9% (items/quoin.js 108-111).
      const offsets = [10, -140, 250];
      actors.forEach((actor, i) => {
        const x = q.x + (offsets[i] ?? 60 * (i + 1));
        actor.sprite.x = x;
        actor.sprite.y = groundAt(engine, x, groundY);
        actor.socialTargetX = x;
        actor.socialUntil = now + 60_000;
      });
      player.x = q.x - 70;
    } else if (demo.mode === 'natural') {
      // Companions around a quoin with their wander homes there; nothing is
      // forced, so the normal interest roll decides who goes and when.
      const offsets = [-180, 170, 330];
      actors.forEach((actor, i) => {
        const x = q.x + (offsets[i] ?? 120 * (i + 1));
        actor.sprite.x = x;
        actor.sprite.y = groundAt(engine, x, groundY);
        actor.homeX = x;
        actor.wanderTargetX = x;
        actor.homeMinX = q.x - 420;
        actor.homeMaxX = q.x + 420;
        actor.socialUntil = 0;
      });
      player.x = q.x - 140;
      player.y = groundY;
    } else {
      const amp = actors.find((a) => a.name === 'Amp') || actors[0];
      demo.companion = amp.name;
      for (const actor of actors) {
        if (actor === amp) continue;
        // The others stand off out of range so the crowd is two.
        const x = q.x + (actor.name === 'Bumbishfish' ? 420 : -460);
        actor.sprite.x = x;
        actor.sprite.y = groundAt(engine, x, groundY);
        actor.socialTargetX = x;
        actor.socialUntil = now + 60_000;
      }
      const ax = q.x + 90;
      amp.sprite.x = ax;
      amp.sprite.y = groundAt(engine, ax, groundY);
      player.x = q.x - 120;
      player.y = groundY;
    }
    player.vx = 0;
    player.vy = 0;
    engine.setData('quoinShardDemo', `staged:${demo.mode}`);
    return;
  }
  const elapsed = now - demo.stagedAt;
  if (demo.mode === 'natural') {
    if (companionGrabs > 0) demo.done = true;
  } else if (demo.mode === 'you') {
    if (engine.param('quoinshardautoplay') === '1' && elapsed > 1200 && !demo.moved) {
      demo.moved = true;
      player.x = q.x;
      player.y = q.baseY + 28;
      player.vx = 0;
      player.vy = 0;
    }
    if (!(engine.quoins || []).includes(q)) demo.done = true;
  } else if (!demo.sent && elapsed > 900) {
    demo.sent = true;
    const amp = actors.find((a) => a.name === demo.companion);
    let row = interest.get(amp.name);
    if (!row) {
      row = { grabs: 0, nextLookAt: now, target: null, until: 0 };
      interest.set(amp.name, row);
    }
    sendCompanion(amp, q, row, now);
    demo.done = true;
  }
  if (demo.done) engine.setData('quoinShardDemo', `done:${demo.mode}`);
}

export const quoinShardsFeature = {
  id: 'quoin-shards',

  onStreetEnter(street, engine) {
    interest.clear();
    const mode = demoMode(engine);
    demo = mode && !demo?.used ? { mode, staged: false, used: true } : demo?.used ? { used: true, done: true } : null;
  },

  onStreetClear() {
    interest.clear();
    clearFx();
  },

  onTick(dtMs, now, engine) {
    tickFx(dtMs, engine);
    tickDemo(now, engine);
    tickCompanions(now, engine);
  },

  /** engine.query('quoinShards', grab, engine): see the file comment. */
  quoinShards(grab, engine) {
    return shareQuoin(grab, engine);
  },
};
