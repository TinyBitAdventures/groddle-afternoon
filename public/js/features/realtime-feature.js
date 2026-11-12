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
 * - The typing mark (G366, main.js doLocalChatStart 1677-1694): starting a
 *   Local chat line (the input gets text that is no slash command, with the
 *   Local tab in front) tells the street once per line, at most each 4 s
 *   (ChatArea.as 529-537, ACTIVITY_TIMER 4000); the others see a small "…"
 *   over your head for 5 s (duration 5000), gone as soon as your line comes
 *   (doLocalChat 1758 overlay_dismiss). The typer never sees their own
 *   (apiSendAnnouncementX). The source's typing_in_location_overlay SWF was
 *   never archived, so the dots are drawn (typingMark): a little white bubble,
 *   three dots in turn, over the name plate (ours: the source's delta_y -130
 *   sat where the remake's plate is). A blocked player's mark never shows.
 * - The modern skin's Social drawer (engine.social, js/ui/social-drawer.js)
 *   is the chat log there: the state pill and Play here sit in its head, the
 *   arrivals and notes go to its Local tab with the emote buttons over them,
 *   and "/" is the drawer's.
 *
 * - An administrator's teleport (v0.2.2, js/admin-teleport.js): the server's
 *   {"t":"teleport","street","x"?,"y"?,"by":"admin"} (sent only on the site's
 *   signed call, groddle-afternoon-server teleport.go) has already taken you
 *   off your street; the game enters the new one the ordinary way, quietly
 *   (at the spot when one came, else where an arrival lands), says
 *   "An administrator moved you to <street>." and saves. Nothing joins a
 *   street until the move is done.
 *
 * - The administrators' console (js/admin-console-mp.js, groddle-afternoon-server
 *   admin.go): admin_message opens "Message from an administrator"; booted
 *   says "An administrator signed you out: <reason>." and the client stops
 *   reconnecting (4010 'booted'; a ban 4011 'suspended'); admin_give applies a
 *   ledger give once (ledgerReceipt) to the pack and purse; admin_refill fills
 *   mood and energy. Like the teleport, only the site's signed calls send them.
 *
 * QA: canvas data realtimeState, realtimeHere, realtimePlayers,
 * realtimeStreet, realtimeLastSaid, realtimeTypingSent (marks sent),
 * realtimeTyping (ids showing the mark), realtimeTeleport (the street an
 * administrator sent you to, once there); window.groddleRealtime in multiplayer.
 */

import { chatBubbleText } from '../ui/chat-input.js?v=72d000ac';
import { createMinnAccount } from '../minn-account.js?v=c15f0ecf';
import { EMOTES, createRealtimeClient, createTrack, pushSample, sampleTrack } from '../realtime-client.js?v=cda54c6e';
import { ANIM_FPS, EMOTION_MS, animForState, crowdScaleX } from '../avatar-anims.js?v=fb921bf4';
import { redrawFrame } from '../avatar-pack.js?v=d8fba962';
import { movedLine } from '../admin-teleport.js?v=fa56e8df';
import { ADMIN_TEXT, applyAdminGive, applyAdminRefill, showAdminMessage, showBooted } from '../admin-console-mp.js?v=81e22ffc';
import { saveStore } from '../save-store.js?v=04420633';
import { STREET_INDEX } from '../street-loader.js?v=18b181ad';
import { appendLinkedText } from '../chat-links.js?v=b717fac7';
import { lineKey } from '../chat-reactions.js?v=38460172';

export const REALTIME_FEATURE_ID = 'realtime';
/** Lines kept in the chat log. */
export const LOG_LINES = 40;
const BUBBLE_MS = 7200;
const LOOK_CHECK_MS = 2000;
const PLATE_Y = -150;
/** G366: the mark lasts this long (main.js:1682 duration 5000) unless the line comes first. */
export const TYPING_MS = 5000;
/** One mark per line, and no sooner than this after the last (ChatArea.as:65 ACTIVITY_TIMER). */
export const TYPING_EVERY_MS = 4000;
/** The mark's foot, just over the name plate. */
const TYPING_Y = PLATE_Y - 24;

/**
 * Whether a line in the chat input should show the typing mark: some text, no
 * slash command (ChatArea.as:534 skips the slash key: a command is no line),
 * and Local in front (a party, group or Butler chat is not the street).
 */
export function typingCounts(text, localTab = true) {
  const t = String(text || '').trim();
  return Boolean(t) && !t.startsWith('/') && localTab !== false;
}

/** main.js doLocalChat 1709, the same words the channels answer (groddle-afternoon-server channels.go). */
export const LOCAL_SUSPENDED = "Sorry, you're currently suspended from this chat.";

/** The "…" drawn over a player who is typing (the SWF is lost): a bubble with three dots. */
export function typingMark(PIXI) {
  const mark = new PIXI.Container();
  const bubble = new PIXI.Graphics();
  bubble.roundRect(-17, -22, 34, 20, 10).fill({ color: 0xffffff, alpha: 0.96 }).stroke({ width: 1, color: 0x8c8378, alpha: 0.75 });
  bubble.moveTo(-4, -2.5).lineTo(0, 4).lineTo(4, -2.5).closePath().fill({ color: 0xffffff, alpha: 0.96 });
  mark.addChild(bubble);
  mark.dots = [-8, 0, 8].map((x) => {
    const d = new PIXI.Graphics();
    d.circle(0, 0, 2.6).fill({ color: 0x5c554d });
    d.x = x;
    d.y = -12;
    mark.addChild(d);
    return d;
  });
  mark.y = TYPING_Y;
  mark.visible = false;
  return mark;
}

/** The dots light in turn, one each 220 ms. */
export function typingDotAlpha(i, t) {
  return Math.floor(t / 220) % 3 === i ? 1 : 0.35;
}

/**
 * Close code 4012 (alternate characters, Austin 2026-11-12): another character of this login came
 * online, here or on another device, so this window's Glitch left the streets and does not come back.
 */
export const OTHER_CHARACTER_TEXT = Object.freeze({
  state: 'Playing as another character',
  note: "You're playing as another character in another window.",
});

/** The pill's words for a client state (plain remake copy, no em-dashes). */
export function statusText(state, { here = 0, attempt = 0 } = {}) {
  switch (state) {
    case 'online': return here > 1 ? `${here} here` : 'Just you here';
    case 'connecting': return attempt > 0 ? 'Offline, retrying' : 'Connecting';
    case 'offline': return 'Offline, retrying';
    case 'replaced': return 'Playing somewhere else';
    case 'other-character': return OTHER_CHARACTER_TEXT.state;
    case 'signed-out': return 'Signed out';
    case 'off': return 'Others are off on this site';
    case 'booted': return ADMIN_TEXT.stateBooted;
    case 'suspended': return ADMIN_TEXT.stateSuspended;
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
  const anim = player?.glitchState || 'stand';
  return {
    x: Number(player?.x) || 0,
    y: Number(player?.y) || 0,
    dir: player?.facing === 'left' ? -1 : 1,
    // Ticket 71: a triple jump's rise goes as its own word, so a follower takes the same step.
    anim: anim === 'lift' && player?.tripleJumping === true ? 'liftTriple' : anim,
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

/**
 * Draw order of another player's Glitch. The client adds each PC under its OTHER_AV marker
 * (MiddleGroundRenderer.addOtherAvatar, LayerRenderer.addUnder), so the one who arrived last is
 * drawn over the earlier ones, never by height; all of them sit over the items and under your
 * own avatar (YOUR_AVATAR, zIndex 50). `order` counts arrivals on this client.
 */
export function remoteAvatarZ(order) {
  const n = Math.max(0, Math.floor(Number(order) || 0)) % 9000;
  return 49 + n / 10000;
}

const STYLE = `
.mp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; margin: 0 0 0.3rem; pointer-events: auto; font: 600 var(--fs-xs)/var(--lh-snug) var(--font-system); }
.mp-state { display: inline-flex; align-items: center; gap: var(--sp-3); padding: 0.2rem 0.55rem; border-radius: var(--radius-pill); color: var(--c-green-34); background: color-mix(in srgb, var(--surface-moss) 94%, transparent); box-shadow: var(--shadow-1); }
.mp-state::before { content: ''; width: 7px; height: 7px; border-radius: var(--radius-round); background: var(--c-gold-76); }
.mp-state[data-state="online"]::before { background: var(--c-lime-67); }
.mp-state[data-state="offline"]::before, .mp-state[data-state="replaced"]::before, .mp-state[data-state="signed-out"]::before, .mp-state[data-state="stopped"]::before, .mp-state[data-state="booted"]::before, .mp-state[data-state="suspended"]::before, .mp-state[data-state="other-character"]::before { background: var(--c-red-59); }
.mp-state[data-state="off"]::before { background: var(--c-sand-67); }
.mp-bar button { font: inherit; border: 0; border-radius: var(--radius-pill); padding: 0.2rem var(--sp-5); cursor: pointer; color: var(--text-heading); background: color-mix(in srgb, var(--surface-card) 92%, transparent); box-shadow: var(--shadow-1); }
.mp-bar button[aria-pressed="true"] { background: var(--c-mauve-93); }
.mp-bar button[hidden] { display: none; }
.mp-log { list-style: none; margin: 0 0 0.3rem; padding: var(--sp-3) var(--sp-4); max-height: 9.5rem; overflow-y: auto; pointer-events: auto; border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-card) 95%, transparent); box-shadow: var(--shadow-2); color: var(--text); font: var(--fs-sm)/var(--lh-normal) var(--font-system); }
.mp-log[hidden] { display: none; }
.mp-log li { margin: var(--sp-1) 0; overflow-wrap: anywhere; }
.mp-log li b { color: var(--c-violet-50); }
.mp-log li.is-note { color: var(--text-muted); font-style: italic; }
.mp-log .mp-emotes { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: var(--sp-3); }
.mp-log .mp-emotes button { font: 600 var(--fs-xs)/var(--lh-snug) var(--font-system); border: 0; border-radius: var(--radius-pill); padding: 0.2rem var(--sp-5); cursor: pointer; color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 1px var(--c-lime-85); }
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

/**
 * The drawn Glitches still holding frames of a freed idle sheet: those drawn from a pack
 * whose anims game.js just refilled (dropIdleSheet), skipping the gone and the never drawn.
 */
export function remotesOnFreedFrames(remotes, anims) {
  const out = [];
  for (const r of remotes) {
    if (!r?.st || !r.body || r.body.destroyed || !anims?.has(r.pack?.anims)) continue;
    out.push(r);
  }
  return out;
}

/** One running multiplayer session: the client, the drawn Glitches and the dock UI. */
function createSession(engine) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const client = createRealtimeClient({ ticket: () => account.realtimeTicket(), baseUri: document.baseURI });
  const remotes = new Map();
  /** Arrivals so far, for remoteAvatarZ. */
  let arrivals = 0;
  const log = [];
  let lookJson = '';
  let lookCheckAt = 0;
  /** An administrator's teleport under way: no join until the game is on the new street. */
  let teleporting = false;

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
  const social = engine.social || null;
  if (social) {
    // The drawer's Local tab is the chat log: the pill and Play here go in its head, the emotes over Local.
    social.statusSlot?.append(pill, hereBtn);
    social.channel('local', { header: emoteRow });
  } else if (dock && form) {
    dock.insertBefore(bar, form);
    dock.insertBefore(logList, dock.firstChild);
  }
  if (input && !social) input.placeholder = 'Chat with this street (press /)';
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
      else {
        li.append(el('b', {}, `${line.name}: `));
        appendLinkedText(li, line.text);
      }
      return li;
    });
    logList.replaceChildren(...items, emoteRow);
    logList.scrollTop = logList.scrollHeight;
  }

  function addLog(line) {
    log.push(line);
    while (log.length > LOG_LINES) log.shift();
    renderLog();
    // The drawer's Local tab: notes come from here; spoken lines from engine.chatLine and game.js.
    if (line.note) social?.push('local', { note: true, text: line.text });
  }

  function publish() {
    const s = client.state;
    pill.dataset.state = s === 'connecting' && client.attempt > 0 ? 'offline' : s;
    pill.textContent = statusText(s, { here: client.here, attempt: client.attempt });
    hereBtn.hidden = s !== 'replaced';
    social?.refresh();
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
    const typing = typingMark(PIXI);
    root.addChild(body, plate, name, typing);
    root.zIndex = remoteAvatarZ(arrivals++);
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
      typing,
      typingUntil: 0,
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
    // A painted look paints this animation's sheet the first time someone plays it (G614): the
    // frames hold the still stand until it is in, then fill in place (framesReady).
    engine.needGlitchAnim?.(r.pack, anim);
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

  /**
   * game.js freed an idle sheet: a Glitch with your look shares your pack, and if it is in
   * that idle its sprite still holds the old frames. Draw it again from the refilled pack
   * before the textures go (a destroyed texture stops the whole frame drawing).
   */
  function framesFreed(anims) {
    for (const r of remotesOnFreedFrames(remotes.values(), anims)) {
      const st = r.st;
      r.st = null;
      applyAnim(r, st);
    }
  }

  /**
   * game.js painted a sheet a look had left for later (a visitor's first jump, climb or emote)
   * and refilled the pack's frame lists in place: each Glitch drawn from it shows the frame it
   * is on from the new sheet, keeping its place in the animation.
   */
  function framesReady(anims) {
    for (const r of remotesOnFreedFrames(remotes.values(), new Set([anims]))) redrawFrame(r.body);
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
      // The location's avatar filter (game.js setAvatarTone) on their Glitch, not their name.
      const tone = engine.avatarTone || null;
      if ((r.body.filters?.[0] || null) !== tone) r.body.filters = tone ? [tone] : null;
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
      const typingNow = wall < r.typingUntil;
      if (r.typing.visible !== typingNow) {
        r.typing.visible = typingNow;
        typingChanged = true;
      }
      if (typingNow) r.typing.dots.forEach((d, i) => { d.alpha = typingDotAlpha(i, wall); });
    }
    if (typingChanged) {
      typingChanged = false;
      engine.setData?.('realtimeTyping', [...remotes.values()].filter((r) => r.typing.visible).map((r) => r.id).join(','));
    }
    if (swapped) holdPacks();
  }

  // —— The cone of silence in Local chat (G480, main.js doLocalChat 1708-1710, doLocalChatStart 1679) ——
  let coneNow = false;
  const coned = () => coneNow === true;
  function setCone(on) {
    coneNow = on === true;
    engine.setData?.('realtimeCone', coneNow ? '1' : '0');
  }
  /** pc.sendActivity: the line went nowhere, and only its speaker is told. */
  function suspendedNote(message) {
    const line = message || LOCAL_SUSPENDED;
    addLog({ note: true, text: line });
    engine.pushActivity?.(line);
  }
  client.on('hello', (who) => setCone(who?.cone === true));
  client.on('msg:cone', (msg) => setCone(msg?.on === true));

  // —— The typing mark (G366) ——
  let typingChanged = false;
  /** This line already told the street; when the last mark went. */
  let typedLine = false;
  let typedAt = 0;
  let typingSent = 0;
  function localTabInFront() {
    if (social) return social.tab === 'local';
    const t = engine.query?.('chatTab');
    return t == null || t === 'street';
  }
  function onChatInput() {
    const text = input?.value || '';
    if (!String(text).trim()) {
      typedLine = false;
      return;
    }
    if (coned() || typedLine || teleporting || !typingCounts(text, localTabInFront())) return;
    const t = Date.now();
    if (t - typedAt < TYPING_EVERY_MS) return;
    if (!client.typing()) return;
    typedLine = true;
    typedAt = t;
    typingSent += 1;
    engine.setData?.('realtimeTypingSent', String(typingSent));
  }
  input?.addEventListener('input', onChatInput);
  // The line went (or the input was cleared for a command): the next line tells the street again.
  form?.addEventListener('submit', () => { typedLine = false; });

  // —— Chat and emotes ——
  function emote(e) {
    if (!EMOTES.includes(e)) return false;
    engine.playEmotion?.(e);
    client.emote(e);
    return true;
  }

  /** A sign-out or suspension already shown (the booted message comes before the close). */
  let bootedSaid = false;
  client.on('state', ({ state }) => {
    publish();
    if (state === 'replaced') {
      const line = 'You are playing in another window, so the street sees you there. Play here brings you back.';
      addLog({ note: true, text: line });
      engine.toast?.(line, 5200);
    }
    if (state === 'signed-out') addLog({ note: true, text: 'You are signed out, so others cannot see you. Log in again to rejoin.' });
    if (state === 'other-character') {
      addLog({ note: true, text: OTHER_CHARACTER_TEXT.note });
      engine.toast?.(OTHER_CHARACTER_TEXT.note, 5200);
    }
    // A ticket refused for a suspended account (no booted message came first): say so once.
    if (state === 'suspended' && !bootedSaid) {
      bootedSaid = true;
      addLog({ note: true, text: ADMIN_TEXT.suspended });
      showBooted(engine, { banned: true, reason: '' });
    }
  });
  client.on('roster', syncRoster);
  // Someone you block comes and goes unannounced (Glitch's chatUpdate dropped every line about an ignored player, RightSideManager.as 218-223).
  client.on('joined', (p) => { if (!engine.query?.('realtimeHidden', p.id)) addLog({ note: true, text: `${p.name} is here.` }); });
  client.on('left', ({ id }) => {
    const r = remotes.get(id);
    if (r && !engine.query?.('realtimeHidden', id)) addLog({ note: true, text: `${r.name} left.` });
  });
  client.on('moved', (p) => {
    const r = remotes.get(p.id);
    if (r) pushSample(r.track, { x: p.x, y: p.y, dir: p.dir, anim: p.anim }, performance.now());
  });
  client.on('said', ({ id, name, text, mine, lid }) => {
    // A blocked player's words never reach you (buddies-feature: the source's buddy_ignore).
    if (!mine && engine.query?.('realtimeHidden', id)) return;
    addLog({ name, text });
    engine.setData?.('realtimeLastSaid', `${name}:${text}`);
    if (mine) return;
    const r = remotes.get(id);
    // doLocalChat 1758: the line clears the typing mark.
    if (r?.typingUntil) {
      r.typingUntil = 0;
    }
    // The bubble shows a long line's start; Local keeps every word (chatBubbleText).
    if (r) engine.say?.(r.target, chatBubbleText(text), BUBBLE_MS, { speaker: name });
    // RIGHTCLICK: who said it, so their name in Local opens their menu (js/ui/player-menu.js).
    // REACTIONS: the line's key (features/chat-reactions-feature.js claims your own lines' keys).
    (engine.hearLocal || engine.chatLine)?.(name, text, { playerId: Number(id) || 0, rk: lineKey(lid) });
  });
  client.on('typing', ({ id }) => {
    if (engine.query?.('realtimeHidden', id)) return;
    const r = remotes.get(id);
    if (r) r.typingUntil = Date.now() + TYPING_MS;
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
    } else if (code === 'suspended') {
      setCone(true);
      suspendedNote(message);
    } else console.warn('[realtime]', code, message);
  });

  // An administrator moved you (the site's signed call; the server already took you off your street).
  client.on('msg:teleport', (msg) => {
    const street = String(msg?.street || '');
    if (!street || teleporting || !engine.streetExists?.(street)) {
      console.warn('[realtime] teleport to a street this game does not know', street);
      return;
    }
    teleporting = true;
    client.leave();
    const spot = Number.isFinite(msg.x) && Number.isFinite(msg.y) ? { spawnX: msg.x, spawnY: msg.y } : {};
    Promise.resolve()
      .then(() => engine.enter?.(street, { ...spot, quiet: true }))
      .catch((err) => console.warn('[realtime] teleport', err))
      .finally(() => {
        teleporting = false;
        const line = movedLine(STREET_INDEX.streets, street);
        addLog({ note: true, text: line });
        engine.pushActivity?.(line);
        engine.toast?.(line, 5200);
        engine.setData?.('realtimeTeleport', String(engine.streetTsid || street));
        engine.save?.();
        Promise.resolve(saveStore.flush?.()).catch(() => {});
      });
  });

  // The administrators' console (admin.go): a message, a sign-out, a give, a refill.
  client.on('msg:admin_message', (msg) => {
    if (showAdminMessage(engine, msg)) addLog({ note: true, text: `${ADMIN_TEXT.messageTitle}: ${msg.text}` });
  });
  client.on('msg:booted', (msg) => {
    bootedSaid = true;
    addLog({ note: true, text: showBooted(engine, msg) });
    engine.save?.();
    Promise.resolve(saveStore.flush?.()).catch(() => {});
  });
  client.on('msg:admin_give', (msg) => {
    if (!applyAdminGive(engine, msg)) return;
    addLog({ note: true, text: String(msg.text || ADMIN_TEXT.gave) });
    Promise.resolve(saveStore.flush?.()).catch(() => {});
  });
  client.on('msg:admin_refill', () => {
    if (applyAdminRefill(engine)) addLog({ note: true, text: ADMIN_TEXT.refilled });
  });

  // "/" focuses the chat, unless something else has the keyboard (the drawer's own "/" when there is one).
  if (!social) window.addEventListener('keydown', (e) => {
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
    get teleporting() { return teleporting; },
    start() {
      publish();
      client.start();
    },
    tick(t) {
      if (teleporting) {
        drawRemotes(t);
        return;
      }
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
    /** game.js sayLocalChat, before a line shows anywhere: true when the cone of silence refuses it. */
    refuseLine() {
      if (!coned()) return false;
      suspendedNote();
      return true;
    },
    chatName() {
      return client.me?.name || boot.player?.name || null;
    },
    /** The other Glitches drawn on this street, for bubbles to keep off their heads. */
    speechTargets() {
      return [...remotes.values()].map((r) => r.target).filter((t) => t.sprite && !t.sprite.destroyed && t.sprite.visible !== false);
    },
    framesFreed,
    framesReady,
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

  /** game.js sayLocalChat: the cone of silence holds this line back (G480). */
  localChatRefused() {
    return session?.refuseLine() ? true : null;
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

  /** Speech bubbles keep off these players' heads (game.js positionSpeechBubble). */
  speechAvoidTargets() {
    return session ? session.speechTargets() : null;
  },

  /** G387: another player's Glitch on this street (its Pixi root), for overlays drawn over it; null when not here. */
  remoteAvatar(id) {
    const r = session?.remotes.get(Number(id));
    return r?.root && !r.root.destroyed ? r.root : null;
  },

  /** MINIMAP (G370): the other players drawn on this street, for the street map's dots. */
  minimapPlayers() {
    if (!session) return null;
    return [...session.remotes.values()]
      .filter((r) => r.root && !r.root.destroyed && r.root.visible !== false)
      .map((r) => ({ id: r.id, label: r.name, x: r.root.x, y: r.root.y }));
  },

  /** game.js dropIdleSheet: these packs' anims were refilled and an idle sheet is about to be destroyed. */
  glitchFramesFreed(anims) {
    session?.framesFreed(anims);
    return null;
  },

  /** game.js lateSheetReady: a sheet this pack's look had left for later is painted and its frame lists refilled in place. */
  glitchFramesReady(anims) {
    session?.framesReady(anims);
    return null;
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
