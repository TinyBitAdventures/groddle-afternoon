/**
 * Summoning another real player with Teleportation V (multiplayer). The words
 * and the menu entry are js/summon-mp.js; the summoner's checks and payment
 * are js/teleportation.js (the teleportation feature's teleportSummon); the
 * request, the places and the move are the server's
 * (groddle-afternoon-server summon.go).
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): in solo
 * nothing here runs and no hook answers.
 *
 * - With Teleportation V, another player's menu (on their Glitch, or from a
 *   list: a chat name, a buddy row, the minimap) gains "Summon <name>",
 *   greyed with the reason when you can't (main.js:3661-3715). Choosing it
 *   asks "Are you sure you want to summon this player to your location.
 *   -<cost> energy?" (InteractionMenuController.as 844-880), then the server
 *   asks them and you see "Waiting for <name> to confirm." for 30 s.
 * - The target sees "<name> would like to summon you to <place>. Do you
 *   accept?" (from a Party Space: "... would like to invite you to their
 *   party in <place>. Do you accept?") with Yes and No for 30 s, a timeout
 *   answering no (main.js:3899-3930). Their game refuses without asking when
 *   they are dead, somewhere it holds them (the tutorial, a quest room, a
 *   home scene, a Party Space) or carry Contraband (inc_teleportation.js 740-759).
 * - Yes: your game pays (one of the day's two summonses, the energy, the
 *   cooldown) and says "<name> is on their way!" (648-655) with the Activity
 *   line "Summoning <name> to your location. -<cost> energy" (643); they
 *   shimmer out and land 20 px to your right (658-676), or join your party
 *   and enter your Party Space (682-687). No or the timeout: "<name> did not
 *   accept your summons." (718-725). A Yes that cannot go through: "Oops.
 *   Something happened with that teleport." (614).
 *
 * QA: canvas data summonMpState (idle | asking:<id>), summonMpLast (the last
 * line or event); window.groddleSummonMp in multiplayer.
 */

import {
  SUMMON_ASK_SECONDS,
  SUMMON_ON_WAY_SECONDS,
  SUMMON_TEXT,
  SUMMON_VERB,
  askedText,
  summonRefusal,
  summonVerb,
} from '../summon-mp.js?v=42c1557d';
import { STREET_INDEX } from '../street-loader.js?v=18b181ad';
import { UNNAMED_PLAYER } from '../player-names.js?v=f9b78094';

export const SUMMON_MP_FEATURE_ID = 'summon-mp';

let session = null;
let guard = false;

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

/** A street's public name (party-feature streetLabel): a feature's label first, then the index. */
function streetLabel(engine, tsid) {
  const feature = engine.query?.('labelFor', tsid, engine);
  if (feature?.street) return feature.street;
  const s = STREET_INDEX.streets || {};
  const meta = s[tsid] || s[String(tsid).replace(/^G/, 'L')] || s[String(tsid).replace(/^L/, 'G')];
  return meta?.label || '';
}

function createSession(engine, client) {
  /** The summons you are waiting on ({ id, name, uid }), the prompts of summonses to you (from id -> uid). */
  let asking = null;
  const asks = new Map();
  let last = '';

  function publish() {
    engine.setData?.('summonMpState', asking ? `asking:${asking.id}` : 'idle');
    engine.setData?.('summonMpLast', last);
  }

  function line(text, toastMs = 0) {
    if (!text) return;
    last = text;
    engine.pushActivity?.(text);
    if (toastMs) engine.toast?.(text, toastMs);
    publish();
  }

  /** A prompt in the stack with one OK (inc_teleportation.js prompts_add, icon_buttons false). */
  function note(text, seconds) {
    last = text;
    engine.prompt?.({ text, choices: [{ label: SUMMON_TEXT.ok, value: 'ok' }], timeout: seconds });
    publish();
  }

  function closeWaiting() {
    if (asking?.uid) engine.removePrompt?.(asking.uid);
    asking = null;
  }

  function check() {
    return engine.query?.('teleportSummon', 'check', { asking: Boolean(asking) }, engine) || null;
  }

  function verbs(target) {
    const c = check();
    const verb = summonVerb({ targetId: target.playerId, name: target.label || target.name || UNNAMED_PLAYER, rank: c?.rank || 0, check: c });
    return verb ? [verb] : [];
  }

  /** Summon <name>: the confirmation, then the request (main.js doPcMenu 'summon'). */
  function ask(target) {
    const id = Number(target?.playerId) || 0;
    if (!id) return false;
    const c = check();
    if (!c?.ok) {
      line(c?.error || '', 3400);
      return true;
    }
    engine.prompt?.({
      modal: true,
      text: SUMMON_TEXT.confirm(c.energyCost || 0),
      choices: [{ label: SUMMON_TEXT.sure, value: 'yes' }, { label: SUMMON_TEXT.never, value: 'no' }],
      onChoice: (v) => {
        if (v !== 'yes') return;
        if (!client.send('summon', { id })) line(SUMMON_TEXT.offline, 3400);
      },
    });
    return true;
  }

  function answer(from, accept, why = '') {
    asks.delete(from);
    client.send('summon_answer', why ? { from, accept, why } : { from, accept });
  }

  // The summoner's side.
  client.on('msg:summon_waiting', (msg) => {
    closeWaiting();
    const name = String(msg?.name || UNNAMED_PLAYER);
    const seconds = Number(msg?.timeout) || SUMMON_ASK_SECONDS;
    asking = { id: Number(msg?.id) || 0, name, uid: '' };
    asking.uid = engine.prompt?.({ text: SUMMON_TEXT.waiting(name), choices: [{ label: SUMMON_TEXT.ok, value: 'ok' }], timeout: seconds }) || '';
    last = SUMMON_TEXT.waiting(name);
    publish();
  });
  client.on('msg:summon_refused', (msg) => {
    closeWaiting();
    line(String(msg?.text || ''), 3400);
  });
  client.on('msg:summon_declined', (msg) => {
    closeWaiting();
    const text = String(msg?.text || SUMMON_TEXT.declined(String(msg?.name || UNNAMED_PLAYER)));
    engine.pushActivity?.(text);
    note(text, 10);
  });
  client.on('msg:summon_pay', (msg) => {
    closeWaiting();
    const id = Number(msg?.id) || 0;
    const name = String(msg?.name || UNNAMED_PLAYER);
    const party = engine.query?.('summonPartySpace', 'here', engine) === true;
    const out = engine.query?.('teleportSummon', 'pay', { name, party }, engine);
    if (!out?.ok) {
      client.send('summon_paid', { id, ok: false });
      if (out?.error) engine.toast?.(out.error, 3400);
      last = `unpaid:${out?.error || ''}`;
      publish();
      return;
    }
    client.send('summon_paid', { id, ok: true });
    engine.pushActivity?.(SUMMON_TEXT.summoning(name, out.energyCost || 0));
    note(SUMMON_TEXT.onTheirWay(name), SUMMON_ON_WAY_SECONDS);
  });

  // The target's side.
  client.on('msg:summon_asked', (msg) => {
    const from = Number(msg?.from?.id) || 0;
    if (!from) return;
    // Someone you block: the server refuses them (summon.go); if one comes, it is a no unseen.
    if (engine.query?.('realtimeHidden', from)) {
      answer(from, false);
      return;
    }
    const why = summonRefusal({
      dead: engine.query?.('isDead') === true,
      busy: Boolean(engine.transientInstance?.()) || Boolean(engine.homeContext?.().inHome),
      contraband: Boolean(engine.hasBuff?.('dont_get_caught')),
    });
    if (why) {
      answer(from, false, why);
      last = `refused:${why}`;
      publish();
      return;
    }
    const name = String(msg.from.name || UNNAMED_PLAYER);
    const street = String(msg.street || '');
    if (asks.has(from)) engine.removePrompt?.(asks.get(from));
    const seconds = Number(msg.timeout) || SUMMON_ASK_SECONDS;
    const uid = engine.prompt?.({
      text: askedText({ name, place: streetLabel(engine, street), party: String(msg.party || '') }),
      choices: [{ label: SUMMON_TEXT.yes, value: 'yes' }, { label: SUMMON_TEXT.no, value: 'no' }],
      iconButtons: true,
      timeout: seconds,
      timeoutValue: 'timeout',
      onChoice: (v) => answer(from, v === 'yes'),
      onTimeout: () => answer(from, false),
    });
    asks.set(from, uid || '');
    last = `asked:${name}`;
    publish();
  });
  client.on('msg:summon_gone', (msg) => {
    const from = Number(msg?.from) || 0;
    if (!asks.has(from)) return;
    const uid = asks.get(from);
    asks.delete(from);
    if (uid) engine.removePrompt?.(uid);
  });
  client.on('msg:summon_go', (msg) => {
    const name = String(msg?.from?.name || UNNAMED_PLAYER);
    const street = String(msg?.street || '');
    let went = false;
    if (msg?.party === true) {
      went = engine.query?.('summonPartySpace', 'enter', engine) === true;
    } else {
      went = engine.query?.('teleportSummon', 'arrive', { street, x: msg?.x, y: msg?.y, label: streetLabel(engine, street) }, engine) === true;
    }
    if (!went) {
      line(SUMMON_TEXT.oops, 3400);
      return;
    }
    line(SUMMON_TEXT.summoned(name));
  });
  client.on('msg:summon_failed', (msg) => line(String(msg?.text || SUMMON_TEXT.oops), 3400));

  client.on('state', ({ state }) => {
    if (state === 'online') return;
    closeWaiting();
    for (const uid of asks.values()) if (uid) engine.removePrompt?.(uid);
    asks.clear();
    publish();
  });

  publish();
  return {
    client,
    get asking() { return asking; },
    get last() { return last; },
    ask,
    verbs,
  };
}

function ensure(engine) {
  if (session) return session;
  if (!isMp(engine)) return null;
  session = createSession(engine, engine.query('realtimeClient'));
  globalThis.groddleSummonMp = session;
  return session;
}

export const summonMpFeature = {
  id: SUMMON_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine);
  },

  /** Another player (on the street or from a list): their menu plus Summon <name> with Teleportation V. */
  verbOverride(target, engine) {
    if (guard || !session || target?.classId !== 'pc_remote' || !target.playerId || engine?.mode !== 'multiplayer') return null;
    const extra = session.verbs(target);
    if (!extra.length) return null;
    guard = true;
    let base;
    try {
      base = engine.targetVerbs?.(target) || [];
    } finally {
      guard = false;
    }
    return [...base.filter((v) => v.id !== SUMMON_VERB), ...extra];
  },

  runVerbOverride(target, verbId) {
    if (!session || verbId !== SUMMON_VERB || !target?.playerId) return null;
    return session.ask(target);
  },
};
