/**
 * Other players on the street (multiplayer phase 3, Austin's plan of
 * 2026-10-25): their Glitches walk, jump and climb where they really are,
 * with name plates; Local chat reaches them (bubbles over the speaker, the
 * dock's lines, a short chat log) and emotes play on their Glitch. The
 * connection is js/realtime-client.js; the server is groddle-afternoon-server (Go), opened
 * with a ticket from Minn (groddle/v1/realtime).
 *
 * Multiplayer only (engine.mode). In solo this feature does nothing at all:
 * no socket, no UI, no hooks answer.
 *
 * - The street is engine.streetTsid; private places (transient instances,
 *   quest rooms, scenes, the player's home) leave the street, so nobody
 *   sees you there and you see nobody.
 * - Local chat: the dock's input is the chat; "/" focuses it, Escape leaves
 *   it (game.js keydown already ignores keys typed in an input). Your own
 *   lines show under your account name (playerChatName). /happy, /surprise
 *   and /angry (or /emote <name>) play an emote, as do the log's buttons.
 * - The dock gets a status row: Connecting, "N here", Offline retrying,
 *   "Playing somewhere else" (close 4001: never reconnects by itself; Play
 *   here reloads, for the newest save, and takes the character back), and
 *   the chat log toggle.
 *
 * QA: canvas data realtimeState, realtimeHere, realtimePlayers,
 * realtimeStreet, realtimeLastSaid; window.groddleRealtime in multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=g338-1';
import { EMOTES, createRealtimeClient, createTrack, pushSample, sampleTrack } from '../realtime-client.js?v=mp3-2';
import { ANIM_FPS, EMOTION_MS, animForState, crowdScaleX } from '../avatar-anims.js';

export const REALTIME_FEATURE_ID = 'realtime';
/** Lines kept in the chat log. */
export const LOG_LINES = 40;
const BUBBLE_MS = 7200;
const LOOK_CHECK_MS = 2000;
const PLATE_Y = -150;

/** The pill's words for a client state (plain remake copy, no em-dashes). */
export function statusText(state, { here = 0, attempt = 0 } = {}) {
  switch (state) {
    case 'online': return here > 1 ? `${here} here` : 'Just you here';
    case 'connecting': return attempt > 0 ? 'Offline, retrying' : 'Connecting';
    case 'offline': return 'Offline, retrying';
    case 'replaced': return 'Playing somewhere else';
    case 'signed-out': return 'Signed out';
    case 'off': return 'Others are off on this site';
    case 'stopped': return 'Offline';
    default: return 'Connecting';
  }
}

/** The emote a chat line asks for (/happy, /surprise, /angry, /emote <name>), or null. */
export function emoteCommand(text) {
  const m = /^\/(?:emote\s+)?([a-z]+)\s*$/i.exec(String(text || '').trim());
  if (!m) return null;
  const word = m[1].toLowerCase();
  const e = word === 'surprised' ? 'surprise' : word;
  return EMOTES.includes(e) ? e : null;
}

/** Where the player's Glitch stands, as the server takes it. */
export function poseOf(player) {
  return {
    x: Number(player?.x) || 0,
    y: Number(player?.y) || 0,
    dir: player?.facing === 'left' ? -1 : 1,
    anim: player?.glitchState || 'stand',
  };
}

/** The street others can share with you now, or '' in a private place. */
export function sharedStreet(engine) {
  if (!engine?.player || !engine.streetTsid) return '';
  // A private scene some players share (a multiplayer race: races-feature realtimeStreet, RACE_<match>).
  const own = engine.query?.('realtimeStreet', engine);
  if (own) return String(own);
  if (engine.transientInstance?.()) return '';
  if (engine.homeContext?.().inHome) return '';
  return String(engine.streetTsid);
}

/** What others draw you with: the character builder's vector look. */
export function lookOf(engine) {
  const vector = engine?.playerAppearance?.vector;
  return { v: 1, vector: vector && typeof vector === 'object' ? vector : {} };
}

const STYLE = `
.mp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0 0 0.3rem; pointer-events: auto; font: 600 11.5px/1.3 system-ui, sans-serif; }
.mp-state { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; color: #24401b; background: rgba(244, 251, 236, 0.94); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22); }
.mp-state::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #e8a33c; }
.mp-state[data-state="online"]::before { background: #5fa83a; }
.mp-state[data-state="offline"]::before, .mp-state[data-state="replaced"]::before, .mp-state[data-state="signed-out"]::before, .mp-state[data-state="stopped"]::before { background: #c8553d; }
.mp-state[data-state="off"]::before { background: #9a948a; }
.mp-bar button { font: inherit; border: 0; border-radius: 999px; padding: 0.2rem 0.6rem; cursor: pointer; color: #3a3340; background: rgba(255, 253, 247, 0.92); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); }
.mp-bar button[aria-pressed="true"] { background: #efe4f6; }
.mp-bar button[hidden] { display: none; }
.mp-log { list-style: none; margin: 0 0 0.3rem; padding: 0.35rem 0.5rem; max-height: 9.5rem; overflow-y: auto; pointer-events: auto; border-radius: 8px;
  background: rgba(255, 253, 247, 0.95); box-shadow: 0 2px 7px rgba(28, 25, 31, 0.2); color: #302b34; font: 12px/1.35 system-ui, sans-serif; }
.mp-log[hidden] { display: none; }
.mp-log li { margin: 0.1rem 0; overflow-wrap: anywhere; }
.mp-log li b { color: #74508e; }
.mp-log li.is-note { color: #6b6460; font-style: italic; }
.mp-log .mp-emotes { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.35rem; }
.mp-log .mp-emotes button { font: 600 11.5px/1.3 system-ui, sans-serif; border: 0; border-radius: 999px; padding: 0.2rem 0.6rem; cursor: pointer; color: #2e5a20; background: #eef6e4; box-shadow: inset 0 0 0 1px #b9d8a0; }
`;

const EMOTE_LABELS = { happy: 'Happy', surprise: 'Surprised', angry: 'Angry' };

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** One running multiplayer session: the client, the drawn Glitches and the dock UI. */
function createSession(engine) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const client = createRealtimeClient({ ticket: () => account.realtimeTicket(), baseUri: document.baseURI });
  const remotes = new Map();
  const log = [];
  let lookJson = '';
  let lookCheckAt = 0;

  // —— Dock UI ——
  const style = el('style', { id: 'realtime-css' });
  style.textContent = STYLE;
  document.head.append(style);
  const dock = document.getElementById('local-chat-dock');
  const form = document.getElementById('local-chat-form');
  const input = document.getElementById('local-chat-input');
  const bar = el('div', { class: 'mp-bar', 'data-realtime-bar': '' });
  const pill = el('span', { class: 'mp-state', role: 'status', 'aria-live': 'polite', 'data-state': 'connecting' }, 'Connecting');
  const logBtn = el('button', { type: 'button', 'aria-pressed': 'false', 'aria-controls': 'mp-log', 'data-realtime-log-btn': '' }, 'Chat log');
  const hereBtn = el('button', { type: 'button', hidden: true, 'data-realtime-play-here': '' }, 'Play here');
  bar.append(pill, logBtn, hereBtn);
  const logList = el('ol', { id: 'mp-log', class: 'mp-log', hidden: true, 'aria-label': 'Chat log' });
  const emoteRow = el('div', { class: 'mp-emotes' });
  for (const e of EMOTES) {
    const b = el('button', { type: 'button', 'data-emote': e }, EMOTE_LABELS[e] || e);
    b.addEventListener('click', () => emote(e));
    emoteRow.append(b);
  }
  if (dock && form) {
    dock.insertBefore(bar, form);
    dock.insertBefore(logList, dock.firstChild);
  }
  if (input) input.placeholder = 'Chat with this street (press /)';
  logBtn.addEventListener('click', () => {
    const open = logList.hidden;
    logList.hidden = !open;
    logBtn.setAttribute('aria-pressed', String(open));
    if (open) renderLog();
  });
  // The other window may have saved since this one loaded (the save pill says
  // so): reload for the newest save, which also takes the character back.
  hereBtn.addEventListener('click', () => {
    client.stop();
    location.reload();
  });

  function renderLog() {
    if (logList.hidden) return;
    const items = log.map((line) => {
      const li = el('li', line.note ? { class: 'is-note' } : {});
      if (line.note) li.textContent = line.text;
      else li.append(el('b', {}, `${line.name}: `), document.createTextNode(line.text));
      return li;
    });
    logList.replaceChildren(...items, emoteRow);
    logList.scrollTop = logList.scrollHeight;
  }

  function addLog(line) {
    log.push(line);
    while (log.length > LOG_LINES) log.shift();
    renderLog();
  }

  function publish() {
    const s = client.state;
    pill.dataset.state = s === 'connecting' && client.attempt > 0 ? 'offline' : s;
    pill.textContent = statusText(s, { here: client.here, attempt: client.attempt });
    hereBtn.hidden = s !== 'replaced';
    engine.setData?.('realtimeState', s);
    engine.setData?.('realtimeHere', String(client.here));
    engine.setData?.('realtimeStreet', client.street);
    engine.setData?.('realtimePlayers', client.players.map((p) => p.name).join(','));
  }

  // —— Other players' Glitches ——
  function makeRemote(p) {
    const PIXI = engine.PIXI;
    const pack = engine.glitchPack(p.look);
    const root = new PIXI.Container();
    const body = new PIXI.AnimatedSprite(pack.anims?.idle0?.length ? pack.anims.idle0 : [pack.idleFrame]);
    body.updateAnchor = true;
    body.animationSpeed = ANIM_FPS / 60;
    body.autoUpdate = true;
    body.gotoAndStop(0);
    const name = new PIXI.Text({ text: p.name, style: {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 12,
      fill: 0x4e4943,
      fontWeight: '700',
      dropShadow: { alpha: 0.92, blur: 2, color: 0xffffff, distance: 0 },
    } });
    name.anchor.set(0.5, 1);
    name.y = PLATE_Y;
    const plate = new PIXI.Graphics();
    plate.roundRect(-Math.ceil(name.width / 2) - 7, name.y - name.height - 4, Math.ceil(name.width) + 14, Math.ceil(name.height) + 7, 7)
      .fill({ color: 0xfffdf5, alpha: 0.86 }).stroke({ width: 1, color: 0x5fa83a, alpha: 0.7 });
    root.addChild(body, plate, name);
    root.zIndex = 49;
    root.eventMode = 'none';
    root.x = p.x;
    root.y = p.y;
    const r = {
      id: p.id,
      name: p.name,
      look: p.look,
      pack,
      root,
      body,
      st: null,
      track: createTrack({ x: p.x, y: p.y, dir: p.dir, anim: p.anim }, performance.now()),
      emote: null,
      emoteUntil: 0,
      packCheckAt: 0,
      target: { name: p.name, label: p.name, classId: 'pc_remote', sprite: root, artHeight: -PLATE_Y + 4 },
    };
    return r;
  }

  function dropRemote(r) {
    engine.closeSay?.(r.target, { now: true });
    r.root.parent?.removeChild(r.root);
    if (!r.root.destroyed) r.root.destroy({ children: true });
    remotes.delete(r.id);
  }

  function holdPacks() {
    engine.holdGlitchPacks?.([...remotes.values()].map((r) => r.pack));
  }

  function syncRoster() {
    const live = new Map(client.players.map((p) => [p.id, p]));
    for (const r of [...remotes.values()]) if (!live.has(r.id)) dropRemote(r);
    for (const p of live.values()) if (!remotes.has(p.id)) remotes.set(p.id, makeRemote(p));
    holdPacks();
    publish();
  }

  function applyAnim(r, st) {
    if (r.st === st && r.body.textures) return;
    const { anim, loop, then, hold } = animForState(st, { idles: false });
    const anims = r.pack.anims || {};
    const frames = anims[anim]?.length ? anims[anim] : [r.pack.idleFrame];
    r.st = st;
    r.body.textures = frames;
    r.body.loop = Boolean(loop);
    r.body.onComplete = then && anims.fallLoop?.length
      ? () => {
          if (r.st !== st || r.body.destroyed) return;
          r.body.textures = anims.fallLoop;
          r.body.loop = true;
          r.body.gotoAndPlay(0);
        }
      : null;
    if (frames.length < 2 || hold) r.body.gotoAndStop(0);
    else r.body.gotoAndPlay(0);
  }

  function drawRemotes(t) {
    const layer = engine.entityLayer;
    const wall = Date.now();
    let swapped = false;
    for (const r of remotes.values()) {
      if (r.root.destroyed) {
        const p = client.players.find((q) => q.id === r.id);
        remotes.delete(r.id);
        if (p) remotes.set(p.id, makeRemote(p));
        swapped = true;
        continue;
      }
      // A street rebuild empties the entity layer; put them back.
      if (layer && r.root.parent !== layer) layer.addChild(r.root);
      if (r.pack.pending && t >= r.packCheckAt) {
        r.packCheckAt = t + 400;
        const next = engine.glitchPack(r.look);
        if (!next.pending) {
          r.pack = next;
          r.st = null;
          swapped = true;
        }
      }
      const at = sampleTrack(r.track, t);
      if (!at) continue;
      r.root.x = at.x;
      r.root.y = at.y;
      r.body.scale.set(crowdScaleX(1, at.dir, true), 1);
      const standing = at.anim === 'stand' || /^idle\d$/.test(at.anim);
      applyAnim(r, r.emote && wall < r.emoteUntil && standing ? r.emote : at.anim);
    }
    if (swapped) holdPacks();
  }

  // —— Chat and emotes ——
  function emote(e) {
    if (!EMOTES.includes(e)) return false;
    engine.playEmotion?.(e);
    client.emote(e);
    return true;
  }

  client.on('state', ({ state }) => {
    publish();
    if (state === 'replaced') {
      const line = 'You are playing in another window, so the street sees you there. Play here brings you back.';
      addLog({ note: true, text: line });
      engine.toast?.(line, 5200);
    }
    if (state === 'signed-out') addLog({ note: true, text: 'You are signed out, so others cannot see you. Log in again to rejoin.' });
  });
  client.on('roster', syncRoster);
  client.on('joined', (p) => addLog({ note: true, text: `${p.name} is here.` }));
  client.on('left', ({ id }) => {
    const r = remotes.get(id);
    if (r) addLog({ note: true, text: `${r.name} left.` });
  });
  client.on('moved', (p) => {
    const r = remotes.get(p.id);
    if (r) pushSample(r.track, { x: p.x, y: p.y, dir: p.dir, anim: p.anim }, performance.now());
  });
  client.on('said', ({ id, name, text, mine }) => {
    // A blocked player's words never reach you (buddies-feature: the source's buddy_ignore).
    if (!mine && engine.query?.('realtimeHidden', id)) return;
    addLog({ name, text });
    engine.setData?.('realtimeLastSaid', `${name}:${text}`);
    if (mine) return;
    const r = remotes.get(id);
    if (r) engine.say?.(r.target, text, BUBBLE_MS, { speaker: name });
    engine.chatLine?.(name, text);
  });
  client.on('emoted', ({ id, e }) => {
    if (engine.query?.('realtimeHidden', id)) return;
    const r = remotes.get(id);
    if (!r) return;
    r.emote = e;
    r.emoteUntil = Date.now() + EMOTION_MS;
    r.st = null;
  });
  client.on('error', ({ code, message }) => {
    if (code === 'slow_down') {
      engine.toast?.(message || 'Slow down a little.', 2400);
      addLog({ note: true, text: message || 'Slow down a little.' });
    } else console.warn('[realtime]', code, message);
  });

  // "/" focuses the chat, unless something else has the keyboard.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!engine.started || engine.busy?.() || engine.acting?.() || !input) return;
    e.preventDefault();
    input.focus();
  });
  window.addEventListener('pagehide', () => client.stop());

  const session = {
    client,
    remotes,
    log,
    emote,
    start() {
      publish();
      client.start();
    },
    tick(t) {
      const player = engine.player;
      const street = sharedStreet(engine);
      if (street !== client.wanted) {
        if (street) {
          lookJson = JSON.stringify(lookOf(engine));
          lookCheckAt = t + LOOK_CHECK_MS;
          client.join({ street, ...poseOf(player), look: lookOf(engine) });
        } else client.leave();
      } else if (street) {
        if (t >= lookCheckAt) {
          lookCheckAt = t + LOOK_CHECK_MS;
          const now = JSON.stringify(lookOf(engine));
          // A new outfit: join again so everyone redraws you.
          if (now !== lookJson) {
            lookJson = now;
            client.join({ street, ...poseOf(player), look: lookOf(engine) });
          }
        }
        client.move(poseOf(player));
      }
      drawRemotes(t);
    },
    /** game.js sayLocalChat: the player said a line in Local chat. */
    said(text) {
      if (client.chat(text)) return;
      addLog({ name: client.me?.name || boot.player?.name || 'You', text });
      addLog({ note: true, text: 'Only you heard that.' });
    },
    chatName() {
      return client.me?.name || boot.player?.name || null;
    },
  };
  return session;
}

let session = null;

export const realtimeFeature = {
  id: REALTIME_FEATURE_ID,

  init(engine) {
    if (engine.mode !== 'multiplayer' || typeof document === 'undefined' || typeof globalThis.WebSocket !== 'function') return;
    session = createSession(engine);
    globalThis.groddleRealtime = session;
  },

  onTick(dtMs, now, engine) {
    if (!session || !engine.started) return;
    if (session.client.state === 'idle') session.start();
    session.tick(performance.now());
  },

  /** game.js sayLocalChat, for each line the player says. */
  localChatSaid(text) {
    session?.said(text);
    return null;
  },

  /** The name the player's own chat lines show under. */
  playerChatName() {
    return session?.chatName() || null;
  },

  /**
   * The realtime client (js/realtime-client.js) for the features built on it
   * (shared quoins, street objects, parties): engine.query('realtimeClient').
   * Null in solo and before the session starts. Listen with
   * client.on('msg:<kind>', fn), send with client.send(kind, payload), and
   * client.on('roster', fn) for each street joined (and each arrival).
   */
  realtimeClient() {
    return session?.client || null;
  },

  /** /who: the other players on this street. */
  remotePlayerNames() {
    return session ? session.client.players.map((p) => p.name) : null;
  },

  /** /happy, /surprise, /angry, /emote <name>. */
  chatCommand(text) {
    if (!session) return null;
    const e = emoteCommand(text);
    return e ? session.emote(e) : null;
  },
};
