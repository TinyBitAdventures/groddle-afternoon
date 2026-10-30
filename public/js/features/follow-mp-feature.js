/**
 * Following another real player (registers G329 and G334). The words and
 * rules are js/follow-mp.js; who follows whom and where the leader went is
 * the server's (groddle-afternoon-server follow.go).
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): in solo
 * nothing here runs, no hook answers, and the solo follow of the recorded
 * Glitches (game.js companionFollowState, &followdemo=) is untouched.
 *
 * - Another player's Glitch gains Follow (Stop following when you follow
 *   them), as the source's player menu had (InteractionMenuController.as
 *   592-614). The leader is asked "<name> would like to follow you." with OK
 *   and No thanks for 30 s; the asker waits ("Waiting for <name> to
 *   confirm...").
 * - Following: your Glitch walks after the leader at the solo follow's
 *   trailing gap, and when the server says the leader went somewhere
 *   (follow_go), it goes there too, landing the gap behind them. Any input
 *   (the arrow keys, WASD, Space) stops it (AvatarController.as
 *   _endFollowing). The dock shows "Following <name>" with Stop; a leader
 *   sees "Followed by <names>" and a line for each who starts or stops.
 * - Counted from what the server confirmed: Stalker, Non-Creepy Designation
 *   at the third street followed (follow_arrived streets, main.js:1479-1484);
 *   a teleport with followers (follow_teleported: teleportation_self_withfollowers,
 *   _5, _11 by kind, and the teleportation_self_withfollowers_3 flag of
 *   Three's a Cloud with 3 or more at teleport_complete); the Glitch Train
 *   (follow_train: glitch_train:<street> and the buff while on, the count
 *   started over when off, player.js:3141-3153).
 * - The game says it is teleporting (follow_teleport) when its own teleport
 *   lands (the teleportation feature's teleportation_self:<kind> counter);
 *   the server counts the followers.
 *
 * QA: canvas data followMpState (idle | asking:<id> | following:<id> |
 * leading:<n>), followMpFollowers (names), followMpStreets, followMpLast (the
 * last line), followMpTrain (chain:on|off); window.groddleFollowMp in
 * multiplayer.
 */

import {
  FOLLOW_ASK_SECONDS,
  FOLLOW_COUNTERS,
  FOLLOW_STALKER_STREETS,
  FOLLOW_STOP_VERB,
  FOLLOW_TEXT,
  FOLLOW_VERB,
  STALKER_ACHIEVEMENT_ID,
  endedText,
  followArrival,
  followVelocity,
  followVerbs,
  isFollowInputKey,
  refusedText,
  teleportCounters,
  teleportKindOf,
} from '../follow-mp.js?v=7c5cda9a';

export const FOLLOW_MP_FEATURE_ID = 'follow-mp';

let session = null;
let guard = false;

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

const PILL_CSS = `
.mp-follow { display: inline-flex; align-items: center; gap: var(--sp-3); padding: 0.2rem 0.55rem; border-radius: var(--radius-pill); color: var(--c-violet-31); background: color-mix(in srgb, var(--surface-lilac) 95%, transparent); box-shadow: var(--shadow-1); }
.mp-follow[hidden] { display: none; }
.mp-bar .mp-follow button { padding: 0.05rem var(--sp-4); background: var(--surface-bright); box-shadow: inset 0 0 0 1px var(--c-violet-80); }
`;

function createSession(engine, client) {
  /** Who you follow ({ id, name }), whose answer you wait for, who follows you. */
  let following = null;
  let asking = null;
  let followers = [];
  let streets = 0;
  let last = '';
  let train = '';
  /** The leader's prompts for asks (asker id -> prompt uid). */
  const asks = new Map();
  /** A go the game is still travelling for, and the newest one waiting behind it. */
  let travelling = null;
  let queued = null;
  let pill = null;

  function line(text, toastMs = 0) {
    if (!text) return;
    last = text;
    engine.pushActivity?.(text);
    if (toastMs) engine.toast?.(text, toastMs);
    publish();
  }

  function ensurePill() {
    if (pill?.isConnected) return pill;
    const bar = typeof document !== 'undefined' ? document.querySelector('[data-realtime-bar]') : null;
    if (!bar) return null;
    if (!document.getElementById('follow-mp-css')) {
      const style = document.createElement('style');
      style.id = 'follow-mp-css';
      style.textContent = PILL_CSS;
      document.head.append(style);
    }
    pill = document.createElement('span');
    pill.className = 'mp-follow';
    pill.hidden = true;
    pill.dataset.followPill = '';
    const text = document.createElement('span');
    text.dataset.followPillText = '';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.dataset.followStop = '';
    stop.textContent = FOLLOW_TEXT.pillStop;
    stop.title = FOLLOW_TEXT.stopTip;
    stop.addEventListener('click', () => stopFollowing());
    pill.append(text, stop);
    bar.append(pill);
    return pill;
  }

  function publish() {
    const state = following ? `following:${following.id}` : asking ? `asking:${asking.id}` : followers.length ? `leading:${followers.length}` : 'idle';
    engine.setData?.('followMpState', state);
    engine.setData?.('followMpFollowers', followers.map((f) => f.name).join(','));
    engine.setData?.('followMpStreets', String(streets));
    engine.setData?.('followMpLast', last);
    engine.setData?.('followMpTrain', train);
    const p = ensurePill();
    if (!p) return;
    const text = p.querySelector('[data-follow-pill-text]');
    const stop = p.querySelector('[data-follow-stop]');
    if (following) {
      text.textContent = FOLLOW_TEXT.pillFollowing(following.name);
      stop.hidden = false;
      p.hidden = false;
    } else if (followers.length) {
      text.textContent = FOLLOW_TEXT.pillLed(followers.map((f) => f.name));
      stop.hidden = true;
      p.hidden = false;
    } else {
      p.hidden = true;
    }
  }

  function closeWaiting() {
    if (asking?.uid) engine.removePrompt?.(asking.uid);
    asking = null;
  }

  function stopFollowing() {
    if (!following) return false;
    client.send('follow_stop', {});
    // The walk stops now; the server's follow_ended says the line.
    following = { ...following, stopping: true };
    queued = null;
    publish();
    return true;
  }

  function ask(target) {
    const id = Number(target?.playerId) || 0;
    if (!id) return false;
    client.send('follow_start', { id });
    return true;
  }

  // —— The server's answers ——
  client.on('msg:follow_asked', (msg) => {
    const id = Number(msg?.id) || 0;
    if (!id) return;
    const name = String(msg.name || 'A Glitch');
    if (asks.has(id)) engine.removePrompt?.(asks.get(id));
    const answer = (accept) => {
      asks.delete(id);
      client.send('follow_answer', { id, accept });
    };
    const uid = engine.prompt?.({
      text: FOLLOW_TEXT.asked(name),
      choices: [{ label: FOLLOW_TEXT.ok, value: 'accept' }, { label: FOLLOW_TEXT.noThanks, value: 'decline' }],
      timeout: FOLLOW_ASK_SECONDS,
      timeoutValue: 'decline',
      onChoice: (v) => answer(v === 'accept'),
      onTimeout: () => answer(false),
    });
    asks.set(id, uid || '');
    last = `asked:${name}`;
    publish();
  });
  client.on('msg:follow_ask_gone', (msg) => {
    const id = Number(msg?.id) || 0;
    if (!asks.has(id)) return;
    const uid = asks.get(id);
    asks.delete(id);
    if (uid) engine.removePrompt?.(uid);
  });
  client.on('msg:follow_waiting', (msg) => {
    closeWaiting();
    const name = String(msg?.name || 'them');
    asking = { id: Number(msg?.id) || 0, name, uid: '' };
    asking.uid = engine.prompt?.({ text: FOLLOW_TEXT.waiting(name), choices: [{ label: FOLLOW_TEXT.ok, value: 'ok' }], timeout: FOLLOW_ASK_SECONDS }) || '';
    last = FOLLOW_TEXT.waiting(name);
    publish();
  });
  client.on('msg:follow_refused', (msg) => {
    closeWaiting();
    line(refusedText(msg?.why, msg?.name), 3400);
  });
  client.on('msg:follow_too_far', (msg) => line(FOLLOW_TEXT.tooFar(String(msg?.name || 'They')), 3400));
  client.on('msg:follow_started', (msg) => {
    closeWaiting();
    following = { id: Number(msg?.id) || 0, name: String(msg?.name || 'them') };
    streets = Math.max(1, Number(msg?.streets) || 1);
    line(FOLLOW_TEXT.started(following.name), 2800);
  });
  client.on('msg:follow_list', (msg) => {
    const before = new Map(followers.map((f) => [f.id, f.name]));
    followers = (Array.isArray(msg?.followers) ? msg.followers : [])
      .map((f) => ({ id: Number(f?.id) || 0, name: String(f?.name || 'A Glitch') }))
      .filter((f) => f.id);
    const added = Number(msg?.added) || 0;
    const removed = Number(msg?.removed) || 0;
    if (added) line(FOLLOW_TEXT.followedBy(followers.find((f) => f.id === added)?.name || 'A Glitch'), 2600);
    else if (removed && before.has(removed)) line(FOLLOW_TEXT.unfollowedBy(before.get(removed)));
    else publish();
  });
  client.on('msg:follow_ended', (msg) => {
    const name = String(msg?.name || following?.name || 'them');
    following = null;
    travelling = null;
    queued = null;
    streets = 0;
    line(endedText(msg?.why, name), msg?.why === 'stopped' ? 0 : 3400);
  });
  client.on('msg:follow_go', (msg) => {
    if (!following || following.stopping || Number(msg?.id) !== following.id) return;
    queued = { street: String(msg.street || ''), arrive: followArrival(msg), via: String(msg.via || 'walk') };
    pump();
  });
  client.on('msg:follow_arrived', (msg) => {
    if (!following || Number(msg?.id) !== following.id) return;
    streets = Math.max(streets, Number(msg.streets) || 0);
    if (streets >= FOLLOW_STALKER_STREETS && !engine.unlockedAchievements?.includes(STALKER_ACHIEVEMENT_ID)) {
      // main.js:1482-1484: achievements_grant('stalker_noncreepy_designation').
      if (engine.grantAchievement('stalker_noncreepy_designation')) engine.save?.();
    }
    publish();
  });
  client.on('msg:follow_teleported', (msg) => {
    const out = teleportCounters({ kind: msg?.kind, followers: msg?.followers, complete: msg?.complete });
    // inc_teleportation.js 404-414 / 533-542: achievements_increment(group, kind).
    if (out.one) engine.achievement(`teleportation_self_withfollowers:${out.kind}`, 1);
    if (out.five) engine.achievement(`teleportation_self_withfollowers_5:${out.kind}`, 1);
    if (out.eleven) engine.achievement(`teleportation_self_withfollowers_11:${out.kind}`, 1);
    // inc_teleportation.js 1054-1056: quests_set_flag (Three's a Cloud, r335).
    if (out.cloud) {
      engine.questFlag?.(FOLLOW_COUNTERS.cloudFlag);
      engine.achievement('teleportation_self_withfollowers_3', 1);
    }
    last = `teleported:${Number(msg?.followers) || 0}:${Number(msg?.complete) || 0}`;
    engine.save?.();
    publish();
  });
  client.on('msg:follow_train', (msg) => {
    const street = String(msg?.street || '');
    train = `${Number(msg?.chain) || 0}:${msg?.on ? 'on' : 'off'}`;
    if (msg?.on === true && street) {
      // player.js:3146-3147: achievements_increment('glitch_train', location) and the buff.
      engine.achievement(`glitch_train:${street}`, 1);
      if (!engine.hasBuff?.(FOLLOW_COUNTERS.train)) engine.applyBuff('glitch_train');
    } else if (engine.hasBuff?.(FOLLOW_COUNTERS.train)) {
      // achievements_reset_group: the Glitch Train is a continuous count.
      engine.resetAchievementCounter?.(FOLLOW_COUNTERS.train);
      engine.removeBuff?.(FOLLOW_COUNTERS.train);
    }
    publish();
  });
  client.on('state', ({ state }) => {
    // Off the server: the follow is gone (a new socket starts unfollowed).
    if (state === 'online') return;
    if (following || followers.length || asking) {
      closeWaiting();
      for (const uid of asks.values()) if (uid) engine.removePrompt?.(uid);
      asks.clear();
      following = null;
      followers = [];
      travelling = null;
      queued = null;
      publish();
    }
  });

  /** Travel after the leader, one go at a time (the newest wins). */
  function pump() {
    if (travelling || !queued || !following) return;
    const go = queued;
    queued = null;
    if (!go.street || go.street === engine.streetTsid) return;
    if (!engine.streetExists?.(go.street)) {
      line(FOLLOW_TEXT.lost(following.name), 3400);
      stopFollowing();
      return;
    }
    travelling = go;
    line(FOLLOW_TEXT.going(following.name));
    Promise.resolve(engine.travel?.(go.street, { via: 'follow', arrive: go.arrive || undefined }))
      .then((plan) => {
        travelling = null;
        if (following && plan && plan.ok === false && plan.reason !== 'already_here') {
          line(FOLLOW_TEXT.lost(following.name), 3400);
          stopFollowing();
        }
        pump();
      })
      .catch(() => {
        travelling = null;
        if (following) stopFollowing();
      });
  }

  // Any input of yours stops it (AvatarController.as _endFollowing).
  window.addEventListener('keydown', (e) => {
    if (!following || following.stopping || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (isFollowInputKey(e.key)) stopFollowing();
  }, true);

  return {
    client,
    get following() { return following; },
    get followers() { return followers; },
    get asking() { return asking; },
    get streets() { return streets; },
    get last() { return last; },
    ask,
    stop: stopFollowing,
    verbs(target) {
      return followVerbs({ targetId: target.playerId, followingId: following?.id || 0, followingName: following?.name || asking?.name || '', asking: asking?.id || 0 });
    },
    /** game.js teleportation: the leader's own teleport landed (teleportation_self:<kind>). */
    teleported(kind) {
      if (!followers.length || !engine.streetTsid) return;
      client.send('follow_teleport', { street: String(engine.streetTsid), kind });
    },
    tick() {
      if (!pill?.isConnected) publish();
      if (!following || following.stopping || travelling) return;
      const player = engine.player;
      const leader = globalThis.groddleRealtime?.remotes?.get?.(following.id)?.root;
      if (!player || !leader || leader.destroyed || engine.acting?.()) return;
      player.vx = followVelocity(player.x, leader.x, player.vx, player.vxMax || 4.4);
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (!isMp(engine)) return null;
  session = createSession(engine, engine.query('realtimeClient'));
  globalThis.groddleFollowMp = session;
  return session;
}

export const followMpFeature = {
  id: FOLLOW_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick();
  },

  onEvent(counter, amount, engine) {
    if (engine.mode !== 'multiplayer' || !session) return;
    const kind = teleportKindOf(counter);
    if (kind) session.teleported(kind);
  },

  /** Another player's Glitch: its menu plus Follow or Stop following. */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== FOLLOW_VERB && v.id !== FOLLOW_STOP_VERB), ...session.verbs(target)];
  },

  runVerbOverride(target, verbId) {
    if (!session || !target?.playerId) return null;
    if (verbId === FOLLOW_VERB) return session.ask(target);
    if (verbId === FOLLOW_STOP_VERB) return session.stop() || true;
    return null;
  },

  /** QUESTS (G329): Three's a Cloud is offered once following another player works. */
  followReady(engine) {
    return engine?.mode === 'multiplayer' && session ? true : null;
  },
};
