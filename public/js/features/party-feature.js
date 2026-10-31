/**
 * Parties in multiplayer (phase 4): invite other players to a party, talk on
 * its own channel, and see where each member is. The server is
 * groddle-afternoon-server/party.go (its header lists the messages and the source rules);
 * the pure rules and copy are js/party.js.
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')). In solo
 * this feature does nothing: no UI, no targets, no hooks answer. Solo's Party
 * Packs and companions stay as they are (party-spaces-feature.js).
 *
 * - Click another player's Glitch (or stand by it and press Enter) for
 *   Invite to Party, as in the original's player menu. The Party button in
 *   the chat dock opens the Party Chat panel: the roster with where each
 *   member is, Invite buttons for the others on this street, the party's
 *   lines, and Leave (with the original's confirmation).
 * - An invite is a prompt with OK / No thanks that times out like the
 *   original's (89 s).
 * - Chat: /p <text> (or /party <text>) talks to the party; /invite <name>
 *   invites someone online by name; /leaveparty leaves. Party lines show in
 *   the panel and in the chat stream marked "Party".
 * - Party Spaces between the members (and their quoins) are party-spaces-feature.js (G334).
 * - The modern skin's Social drawer (engine.social): while you are in a party it
 *   has a Party tab, with the roster, invites and Leave over the party's lines,
 *   and what you type there goes to the party (/p). No Party pill then.
 *
 * QA: canvas data partyState (none|in), partyMembers (name@where,...),
 * partyLeader, partyInvites (prompts waiting), partyLastSaid;
 * window.groddleParty in multiplayer.
 */

import { STREET_INDEX } from '../street-loader.js?v=d6cbbd5c';
import {
  PARTY_LOG_LINES,
  PARTY_TEXT,
  inviteCandidates,
  inviteVerb,
  memberWhere,
  normalizeParty,
  partiersLine,
  partyCommand,
} from '../party.js?v=b86bf389';

export const PARTY_FEATURE_ID = 'party';
/** The hit box over another player's Glitch and name plate (realtime-feature PLATE_Y -150). */
const HIT_W = 64;
const HIT_H = 172;

const STYLE = `
.party-pill[data-in-party="true"] { background: var(--c-mauve-93); }
.party-box { pointer-events: auto; margin: 0 0 0.3rem; padding: var(--sp-3) 0.55rem 0.45rem; border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-card) 96%, transparent);
  box-shadow: var(--shadow-2); color: var(--text); font: var(--fs-sm)/var(--lh-normal) var(--font-system); }
.party-box[hidden] { display: none; }
.party-head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.party-head b { color: var(--c-violet-50); font-size: var(--fs-sm); }
.party-head .party-count { color: var(--text-muted); flex: 1 1 auto; }
.party-box button { font: 600 var(--fs-xs)/var(--lh-snug) var(--font-system); border: 0; border-radius: var(--radius-pill); padding: 0.18rem 0.55rem; cursor: pointer; color: var(--text-heading); background: var(--surface-lilac); box-shadow: inset 0 0 0 1px var(--c-mauve-85); }
.party-box button:disabled { cursor: default; opacity: 0.55; }
.party-roster { list-style: none; margin: 0.3rem 0 0; padding: 0; }
.party-roster li { display: flex; gap: var(--sp-3); align-items: baseline; margin: var(--sp-1) 0; }
.party-roster li .party-where { color: var(--c-lime-51); }
.party-roster li[data-online="false"] { color: var(--text-subtle); }
.party-roster li .party-lead { color: var(--c-gold-57); font-size: var(--fs-2xs); }
.party-invites { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin-top: var(--sp-3); color: var(--text-muted); }
.party-log { list-style: none; margin: var(--sp-3) 0 0; padding: var(--sp-2) 0 0; max-height: 7.5rem; overflow-y: auto; border-top: 1px solid var(--c-mauve-93); }
.party-log:empty { display: none; }
.party-log li { margin: var(--sp-1) 0; overflow-wrap: anywhere; }
.party-log li b { color: var(--c-violet-50); }
.party-log li.is-note { color: var(--text-muted); font-style: italic; }
.party-hint { margin: 0.3rem 0 0; color: var(--text-subtle); font-size: var(--fs-xs); }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** The public name of a street tsid. */
function streetLabel(engine, tsid) {
  const feature = engine.query?.('labelFor', tsid, engine);
  if (feature?.street) return feature.street;
  const s = STREET_INDEX.streets || {};
  const meta = s[tsid] || s[String(tsid).replace(/^G/, 'L')] || s[String(tsid).replace(/^L/, 'G')];
  return meta?.label || tsid;
}

function createSession(engine, client) {
  let party = null;
  const log = [];
  /** fromId -> prompt uid */
  const invites = new Map();
  /** playerId -> { target, box } */
  const targets = new Map();
  let lastSaid = '';

  // —— UI ——
  const style = el('style', { id: 'party-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const dock = document.getElementById('local-chat-dock');
  const form = document.getElementById('local-chat-form');
  const bar = document.querySelector('[data-realtime-bar]');
  const pill = el('button', { type: 'button', class: 'party-pill', 'aria-pressed': 'false', 'aria-controls': 'party-box', 'data-party-btn': '' }, 'Party');
  const box = el('section', { id: 'party-box', class: 'party-box', hidden: true, 'aria-label': PARTY_TEXT.title, 'data-party-box': '' });
  const head = el('div', { class: 'party-head' });
  const count = el('span', { class: 'party-count' });
  const leaveBtn = el('button', { type: 'button', 'data-party-leave': '', hidden: true }, 'Leave');
  head.append(el('b', {}, PARTY_TEXT.title), count, leaveBtn);
  const roster = el('ul', { class: 'party-roster', 'data-party-roster': '' });
  const inviteRow = el('div', { class: 'party-invites', 'data-party-invites': '' });
  const logList = el('ol', { class: 'party-log', 'aria-live': 'polite', 'data-party-log': '' });
  const hint = el('p', { class: 'party-hint' }, 'Type /p and a message to talk to your party.');
  box.append(head, roster, inviteRow, logList, hint);
  const social = engine.social || null;
  if (social) {
    // The drawer's Party tab holds the box (shown whenever the tab is): no pill.
    box.hidden = false;
  } else {
    if (bar) bar.append(pill);
    if (dock && form) {
      if (!bar) dock.insertBefore(pill, form);
      dock.insertBefore(box, bar || form);
    }
  }
  pill.addEventListener('click', () => setOpen(box.hidden));
  leaveBtn.addEventListener('click', confirmLeave);

  function setOpen(open) {
    if (social) {
      render();
      return;
    }
    box.hidden = !open;
    pill.setAttribute('aria-pressed', String(open));
    if (open) render();
  }

  function me() {
    return client.me?.id || 0;
  }

  function render() {
    const n = party?.members.length || 0;
    pill.textContent = n ? `Party (${n})` : 'Party';
    pill.dataset.inParty = String(Boolean(party));
    leaveBtn.hidden = !party;
    count.textContent = party ? partiersLine(party, me()) : 'Not in a party.';
    roster.replaceChildren(...(party?.members || []).map((m) => {
      const li = el('li', { 'data-party-member': String(m.id), 'data-online': String(m.online) });
      li.append(el('b', {}, m.id === me() ? `${m.name} (you)` : m.name));
      if (m.leader) li.append(el('span', { class: 'party-lead' }, 'leader'));
      li.append(el('span', { class: 'party-where' }, memberWhere(m, (t) => streetLabel(engine, t))));
      return li;
    }));
    const here = inviteCandidates(client.players, party);
    const buttons = here.map((p) => {
      const b = el('button', { type: 'button', 'data-party-invite': String(p.id), title: PARTY_TEXT.inviteTip }, `Invite ${p.name}`);
      b.addEventListener('click', () => invite({ id: p.id }));
      return b;
    });
    inviteRow.replaceChildren(...(buttons.length ? [el('span', {}, 'On this street:'), ...buttons] : [el('span', {}, 'Nobody else on this street to invite. /invite <name> finds someone online.')]));
    if (!box.hidden) renderLog();
    if (social) {
      if (party && !social.has('party')) {
        social.channel('party', { label: 'Party', header: box, prefix: '/p ', placeholder: 'Message your party', inputLabel: 'Party chat' });
      } else if (!party && social.has('party')) social.drop('party');
    }
    publish();
  }

  function renderLog() {
    logList.replaceChildren(...log.map((line) => {
      const li = el('li', line.note ? { class: 'is-note' } : {});
      if (line.note) li.textContent = line.text;
      else li.append(el('b', {}, `${line.name}: `), document.createTextNode(line.text));
      return li;
    }));
    logList.scrollTop = logList.scrollHeight;
  }

  function addLog(line) {
    log.push(line);
    while (log.length > PARTY_LOG_LINES) log.shift();
    if (!box.hidden) renderLog();
  }

  function publish() {
    engine.setData?.('partyState', party ? 'in' : 'none');
    engine.setData?.('partyMembers', (party?.members || []).map((m) => `${m.name}@${memberWhere(m, (t) => streetLabel(engine, t))}`).join(','));
    engine.setData?.('partyLeader', party?.members.find((m) => m.leader)?.name || '');
    engine.setData?.('partyInvites', String(invites.size));
    engine.setData?.('partyLastSaid', lastSaid);
  }

  /** inc_party.js party_activity: the party pane, or local chat when it is closed (RightSideManager.as 421-431). */
  function activity(text) {
    addLog({ note: true, text });
    // The drawer: the Party tab while in a party, else Local (as the source's local chat when the pane is shut).
    if (social) {
      if (!(party && social.push('party', { note: true, text }))) engine.chatLine?.('Party', text);
      return;
    }
    if (box.hidden) engine.chatLine?.('Party', text);
  }

  // —— Sending ——
  function invite(who) {
    if (!client.send('party_invite', who)) {
      engine.toast?.('You are offline, so nobody can be invited right now.', 2600);
      return false;
    }
    return true;
  }

  function say(text) {
    if (!party) {
      activity(PARTY_TEXT.notInParty);
      return true;
    }
    if (!client.send('party_chat', { text })) activity('You are offline, so your party did not hear that.');
    return true;
  }

  function confirmLeave() {
    if (!party) return;
    engine.prompt?.({
      modal: true,
      text: PARTY_TEXT.leaveConfirm,
      choices: [{ label: PARTY_TEXT.leaveYes, value: true }, { label: PARTY_TEXT.leaveNo, value: false }],
      onChoice: (v) => { if (v === true) client.send('party_leave'); },
    });
  }

  // —— Messages ——
  client.on('msg:party', (msg) => {
    const was = party;
    party = normalizeParty(msg.party);
    // RightSideManager.as partyChatStatus: a new party opens the Party Chat pane.
    if (party && !was) setOpen(true);
    render();
  });
  client.on('msg:party_activity', (msg) => activity(String(msg.text || '')));
  client.on('msg:party_said', (msg) => {
    const name = String(msg.name || 'A Glitch');
    const text = String(msg.text || '');
    lastSaid = `${name}:${text}`;
    addLog({ name, text });
    if (!social?.push('party', { name, text, mine: Number(msg.id) === me(), at: Number(msg.at) || Date.now() })) engine.chatLine?.(`Party · ${name}`, text);
    publish();
  });
  client.on('msg:party_invited', (msg) => {
    const from = Number(msg.from?.id) || 0;
    if (!from) return;
    if (invites.has(from)) engine.removePrompt?.(invites.get(from));
    const uid = engine.prompt?.({
      text: String(msg.text || `${msg.from?.name || 'Someone'} has invited you to join their Party Chat.`),
      choices: [{ label: PARTY_TEXT.accept, value: 'accept' }, { label: PARTY_TEXT.decline, value: 'decline' }],
      timeout: Math.max(1, Math.min(89, Number(msg.timeout) || 89)),
      iconButtons: true,
      onChoice: (v) => {
        invites.delete(from);
        publish();
        client.send(v === 'accept' ? 'party_accept' : 'party_decline', { from });
      },
      onTimeout: () => { invites.delete(from); publish(); },
    });
    invites.set(from, uid || '');
    publish();
  });
  client.on('msg:party_uninvited', (msg) => {
    const from = Number(msg.from) || 0;
    if (invites.has(from)) {
      const uid = invites.get(from);
      if (uid) engine.removePrompt?.(uid);
      invites.delete(from);
      publish();
    }
  });
  client.on('error', ({ code, message }) => {
    if (code === 'party_slash' || code === 'bad_party') activity(message);
  });
  client.on('roster', () => { if (!box.hidden) render(); });
  client.on('state', ({ state }) => {
    // Off the server: the party is shown again when the server answers.
    if (state !== 'online' && party) {
      party = null;
      render();
    }
  });

  // —— Other players' Glitches: the Invite to Party menu ——
  function dropTarget(id) {
    const t = targets.get(id);
    if (!t) return;
    engine.unregister?.(t.target);
    targets.delete(id);
  }

  function syncTargets() {
    const layer = engine.entityLayer;
    const PIXI = engine.PIXI;
    if (!layer || !PIXI) return;
    const drawn = globalThis.groddleRealtime?.remotes;
    const live = new Map(client.players.map((p) => [p.id, p]));
    for (const id of [...targets.keys()]) if (!live.has(id)) dropTarget(id);
    for (const p of live.values()) {
      let t = targets.get(p.id);
      if (t && (t.box.destroyed || t.box.parent !== layer)) {
        dropTarget(p.id);
        t = null;
      }
      if (!t) {
        const hit = new PIXI.Container();
        hit._worldHitW = HIT_W;
        hit._worldHitH = HIT_H;
        hit.zIndex = 48;
        layer.addChild(hit);
        const target = { featureId: PARTY_FEATURE_ID, classId: 'pc_remote', label: p.name, playerId: p.id, sprite: hit, artHeight: HIT_H };
        engine.register?.(target);
        t = { target, box: hit };
        targets.set(p.id, t);
      }
      const r = drawn?.get?.(p.id)?.root;
      const at = r && !r.destroyed ? r : p;
      t.box.x = at.x;
      t.box.y = at.y;
      t.target.label = p.name;
    }
  }

  return {
    client,
    get party() { return party; },
    log,
    invites,
    targets,
    invite,
    say,
    setOpen,
    confirmLeave,
    tick() { syncTargets(); },
    clear() {
      for (const t of targets.values()) if (!t.box.destroyed) t.box.destroy();
      targets.clear();
    },
    verbs(target) {
      const p = client.players.find((q) => q.id === target.playerId) || { id: target.playerId, name: target.label };
      return [inviteVerb(p, party)];
    },
    command(text) {
      const cmd = partyCommand(text);
      if (!cmd) return null;
      if (cmd.kind === 'chat') return say(cmd.text);
      if (cmd.kind === 'invite') return invite({ name: cmd.name });
      if (cmd.kind === 'leave') {
        if (party) confirmLeave();
        else activity(PARTY_TEXT.notInParty);
        return true;
      }
      activity(cmd.text);
      return true;
    },
  };
}

let session = null;

function ensure(engine) {
  if (session) return session;
  if (engine.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleParty = session;
  return session;
}

export const partyFeature = {
  id: PARTY_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick();
  },

  onStreetClear() {
    session?.clear();
  },

  verbsFor(target) {
    return session ? session.verbs(target) : null;
  },

  runVerb(target, verbId) {
    if (!session || verbId !== 'party_invite' || !target?.playerId) return false;
    session.invite({ id: target.playerId });
    return true;
  },

  /** /p, /party, /invite, /leaveparty. */
  chatCommand(text, engine) {
    if (engine?.mode !== 'multiplayer') return null;
    const s = ensure(engine);
    return s ? s.command(text) : null;
  },
};
