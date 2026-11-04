/**
 * Math Mayhem between real players (G397) as a feature module (see js/feature-host.js).
 *
 * Rules and sources: js/math-mayhem.js (GameServerJS math_mayhem). The server
 * (groddle-afternoon-server mayhem.go) runs the game: the open game every Game
 * Pig joins, the teams, the numbers, the target, every touch from where players
 * stand, the winner and the reward. This module shows it:
 * - the Game Pig (items/test_game_starter.js, its CC0 SWF drawn at 3x) beside
 *   the Race Ticket Dispenser's streets, multiplayer only; Admire asks "Which
 *   game do you want to play?" and Maths joins;
 * - the street's prompt when someone there wants a game (Join);
 * - the arena (the Game of Crowns street, crowns-feature restores its ladders)
 *   shared on the game's own hub street MAYHEM_<game>: Click to Start, the
 *   wait, the 321 countdown, the "Target: N" line (inc_games.js 1207-1229), each
 *   player's number in a disc of their team's colour over their head
 *   (AbstractAvatarView.as 173-245), a board, and the end: Tiny Speck's
 *   crown_game_winner_you or crown_game_winner_someone_else with the winner's
 *   name, then button_play_again and button_leave_game (games_end_math_mayhem
 *   1065-1147);
 * - the winner's 200 iMG and 50 currants (the currants already in the site's
 *   ledger, applied once through ledgerReceipt) and math_mayhem:won / lost.
 * Solo has no Math Mayhem: it needs four real players, so solo never places the
 * Game Pig and never reaches any of this.
 *
 * QA (multiplayer): window.groddleQA.mayhem.join() / ready() / again() /
 * leave(); canvas data-mayhem (status:round:target:my number), data-mayhem-board,
 * data-mayhem-last, data-mayhem-pig (the Game Pig's x,y or 0), data-mayhem-end; the end
 * screen's buttons [data-mayhem-end-again] and [data-mayhem-end-leave].
 */

import { CROWNS_START_POINTS, CROWNS_STREET } from '../game-of-crowns.js?v=e32f35f5';
import {
  MAYHEM_END,
  MAYHEM_ID,
  MAYHEM_REWARD_ID_RE,
  MAYHEM_TEXT,
  MAYHEM_TITLE,
  mayhemBoard,
  mayhemColor,
  mayhemOutcome,
  mayhemPos,
  normalizeMayhemPlayers,
  normalizeMayhemReward,
  normalizeMayhemRoom,
  normalizeMayhemState,
} from '../math-mayhem.js?v=7fe952aa';
import { platformYNear } from '../location-navigation.js?v=4be109b9';
import { hasRaceDispenser } from '../races.js?v=df0576ad';
import { OVERLAY_USES, locationRect, playCountdownArt, playWindowOverlay } from '../overlays.js?v=210ad5ee';
import { textureFromUrl } from '../textures.js?v=3149d699';
import { grantMoodXp } from '../mood-xp.js?v=958e7680';
import { saveStore } from '../save-store.js?v=8839ba7b';

const PIG_CLASS = 'test_game_starter';
const PIG_ART = 'assets/sprites/races/test_game_starter@3x.webp';
const JUMP_SCALE = 1.15; // the arena's ledges, as crowns-feature
const APPLIED_KEEP = 20;
const BLOCKED_SAVES = new Set(['conflict', 'elsewhere', 'signed-out', 'error', 'offline']);
/** AbstractAvatarView.as 209: a disc with a number is 22 px across the radius, 2 px ring. */
const DISC_R = 22;

let engineRef = null;
let client = null;
let record = { wins: 0, losses: 0, returnTo: null };
let applied = [];
const applying = new Set();
const counted = new Set();
let mm = null; // { room, street, slot, spawn, players, min, max, myId, status, round, state, ready, readyAt, entering, result }
let joining = false;
let lastNote = '';
let pigTarget = null;
let hud = null;
let discs = new Map(); // id -> { g, t, key }
let ends = []; // end-screen overlay handles and elements
let throbber = null;
let mustWaitUid = null;
const looking = new Map(); // from id -> prompt uid
let leftNote = false;

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function note(engine, what) {
  lastNote = what;
  engine?.setData?.('mayhemLast', what);
}

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

const STYLE = `
.mayhem-hud { top: 48px; }
.mayhem-board { display: flex; justify-content: center; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-md); font-weight: 800; }
.mayhem-board span { display: inline-flex; align-items: center; gap: var(--sp-3); padding: 3px 9px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--c-grey-17) 68%, transparent); }
.mayhem-board span.is-you b { text-decoration: underline; }
.mayhem-board i { display: inline-block; min-width: 1.6em; padding: 0 var(--sp-2); border-radius: var(--radius-pill); font-style: normal; text-align: center; background: var(--team); }
.mayhem-tip { margin: var(--sp-4) auto 0; max-width: 520px; font-size: clamp(var(--fs-base), 2.4vw, var(--fs-2xl)); font-weight: 900;
  text-shadow: 0 2px 0 var(--c-brown-32), 0 4px 12px color-mix(in srgb, var(--c-black) 70%, transparent); }
.mayhem-tip:empty { display: none; }
.mayhem-target { margin: 0 auto var(--sp-3); pointer-events: none; white-space: nowrap; text-align: center;
  font-size: clamp(var(--fs-2xl), 3.2vw, var(--fs-5xl)); font-weight: 900; color: var(--c-gold-91);
  text-shadow: 0 2px 0 var(--c-brown-32), 0 0 6px var(--c-brown-28), 0 4px 12px color-mix(in srgb, var(--c-black) 70%, transparent); }
.mayhem-target[hidden] { display: none; }
.mayhem-rules { margin: 0 auto var(--sp-8); padding: 0; list-style: none; text-align: left; display: inline-block; font-weight: 700; font-size: var(--fs-base); }
.mayhem-rules li::before { content: '• '; color: var(--c-gold-87); }
.mayhem-name { position: absolute; z-index: calc(var(--z-modal) + 41); transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap; text-align: center;
  font-size: clamp(var(--fs-xl), 2.6vw, var(--fs-4xl)); font-weight: 900; color: var(--c-brown-28);
  text-shadow: 0 1px 0 var(--c-gold-91), 0 0 4px var(--c-gold-91); }
.mayhem-end-btn { position: absolute; z-index: calc(var(--z-modal) + 42); padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: transparent; cursor: pointer; font-weight: 800; }
.mayhem-end-btn:focus-visible { outline: 3px solid var(--c-gold-91); outline-offset: 2px; }
.mayhem-end-btn.no-art { color: var(--c-brown-28); background: var(--c-gold-89); }
.mayhem-card-leave { margin-left: var(--sp-4); padding: 0; border: 0; background: transparent; color: var(--c-gold-87); font-weight: 800; text-decoration: underline; cursor: pointer; }
`;

function buildChrome(engine) {
  if (hud || typeof document === 'undefined') return;
  if (!document.getElementById('mayhem-feature-style')) {
    const style = el('style', { id: 'mayhem-feature-style' });
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const host = document.getElementById('hog-haul-hud')?.parentElement || document.getElementById('game-root') || document.body;
  // "Target: N" heads the bar (the source's overlay stood at x 65%, top_y 10%, where the remake's top bar is).
  const bar = el('section', { id: 'mayhem-hud', class: 'hog-haul-hud mayhem-hud', hidden: true, 'aria-live': 'polite' }, `
    <div id="mayhem-target" class="mayhem-target" role="status" hidden></div>
    <div class="mayhem-board" data-mayhem-board></div>
    <p class="mayhem-tip" data-mayhem-tip></p>`);
  const ready = el('div', { id: 'mayhem-ready', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mayhem-ready-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-ready-card">
      <p>${MAYHEM_TITLE}</p>
      <h2 id="mayhem-ready-title">${MAYHEM_TEXT.headline}</h2>
      <ul class="mayhem-rules">${MAYHEM_TEXT.rules.map((r) => `<li>${r}</li>`).join('')}</ul><br />
      <p data-mayhem-seats></p>
      <button type="button" class="btn-glitch-primary" data-mayhem-ready>Click to Start</button>
      <button type="button" class="mayhem-card-leave" data-mayhem-leave>${MAYHEM_TEXT.leave}</button>
    </div>`);
  const countdown = el('div', { id: 'mayhem-countdown', class: 'hog-haul-countdown', hidden: true });
  for (const node of [bar, ready, countdown]) host.appendChild(node);
  hud = { bar, ready, countdown, target: bar.querySelector('#mayhem-target') };
  ready.querySelector('[data-mayhem-ready]').addEventListener('click', () => readyUp(engine));
  ready.querySelector('[data-mayhem-leave]').addEventListener('click', () => leaveGame(engine));
}

/* ------------------------------------------------------------------ */
/* The Game Pig and joining                                            */
/* ------------------------------------------------------------------ */

function spawnPig(engine, point) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(PIG_ART));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(1 / 3);
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 19;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  pigTarget = engine.register({
    classId: PIG_CLASS,
    featureId: 'mayhem',
    label: MAYHEM_TEXT.pigLabel,
    subtitle: MAYHEM_TEXT.pigDesc,
    sprite,
  });
}

/**
 * The Game Pig stands beside the street's Race Ticket Dispenser, on the same floor. It takes no
 * planner group: the street's plan (and the realtime server's copy of it) stays as it is.
 */
function pigSpot(engine) {
  const d = engine.placement?.('raceDispenser')?.[0];
  if (!d) return null;
  for (const dx of [-95, 95, -130, 130]) {
    const y = platformYNear(engine.platforms, d.x + dx, d.y, 24);
    if (y != null) return { x: Math.round(d.x + dx), y: Math.round(y) };
  }
  return null;
}

/** test_game_starter.js admire 41-69: "Which game do you want to play?" (only Maths here). */
function admire(engine) {
  engine.prompt?.({
    title: MAYHEM_TEXT.pigLabel,
    text: MAYHEM_TEXT.pigAsk,
    // The source's three games were words (Color, Crowns, Maths); here only Maths, and a way out.
    choices: [{ label: MAYHEM_TEXT.pigMaths, value: MAYHEM_ID }, { label: MAYHEM_TEXT.decline, value: 'no' }],
    onChoice: (v) => {
      if (v === MAYHEM_ID) join(engine);
    },
  });
}

function busy() {
  return Boolean(mm || joining);
}

function join(engine) {
  if (!isMp(engine)) {
    engine.toast(MAYHEM_TEXT.solo, 3000);
    return false;
  }
  if (busy()) return false;
  const c = attach(engine);
  if (!c || c.state !== 'online' || !c.street) {
    engine.toast(MAYHEM_TEXT.offline, 2600);
    return false;
  }
  joining = c.send('mayhem_join', {}) !== false;
  note(engine, 'join');
  publish(engine);
  return joining;
}

/* ------------------------------------------------------------------ */
/* The socket                                                          */
/* ------------------------------------------------------------------ */

function attach(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  c.on('msg:mayhem_looking', (msg) => {
    const from = Number(msg.from?.id) || 0;
    if (!from || from === c.me?.id || busy()) return;
    if (looking.has(from)) engine.removePrompt?.(looking.get(from));
    const uid = engine.prompt?.({
      text: MAYHEM_TEXT.joinPrompt(String(msg.from?.name || 'Someone'), Number(msg.need) || 0),
      choices: [{ label: MAYHEM_TEXT.join, value: 'join' }, { label: MAYHEM_TEXT.decline, value: 'no' }],
      timeout: 60,
      iconButtons: true,
      onChoice: (v) => {
        looking.delete(from);
        if (v === 'join') join(engine);
      },
      onTimeout: () => looking.delete(from),
    });
    looking.set(from, uid || '');
    note(engine, `looking:${from}`);
  });
  c.on('msg:mayhem_refused', (msg) => {
    joining = false;
    if (msg.text) engine.toast(String(msg.text), 2600);
    note(engine, `refused:${msg.why || ''}`);
    publish(engine);
  });
  c.on('msg:mayhem_room', (msg) => enterRoom(engine, msg));
  c.on('msg:mayhem_players', (msg) => {
    if (!mm || msg.room !== mm.room) return;
    mm.players = normalizeMayhemPlayers(msg.players);
    mm.need = Math.max(0, Number(msg.need) || 0);
    if ((msg.ready || []).map(Number).includes(mm.myId)) mm.acked = true;
    if (msg.text) engine.pushActivity(String(msg.text));
    renderSeats();
    note(engine, `players:${mm.players.length}:${mm.need}`);
  });
  c.on('msg:mayhem_soon', (msg) => {
    if (!mm || msg.room !== mm.room) return;
    mm.status = 'soon';
    mm.acked = true;
    clearMustWait(engine);
    clearEnd();
    if (hud) {
      hud.ready.hidden = true;
      hud.countdown.hidden = false;
      hud.countdown.classList.remove('is-go');
      hud.countdown.textContent = String(msg.text || 'YAY! THE GAME IS STARTING SOON.');
    }
    engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
    note(engine, 'soon');
    publish(engine);
  });
  c.on('msg:mayhem_countdown', (msg) => {
    if (!mm || msg.room !== mm.room) return;
    mm.status = 'countdown';
    mm.round = Math.max(1, Number(msg.round) || mm.round);
    mm.state = null;
    mm.result = null;
    mm.startAt = Date.now() + Math.max(0, Number(msg.in) || 4000);
    clearEnd();
    clearMustWait(engine);
    toSpawn(engine);
    if (hud) {
      hud.ready.hidden = true;
      hud.countdown.hidden = false;
      hud.countdown.classList.remove('is-go');
      hud.countdown.textContent = 'READY?';
      playCountdownArt(hud.countdown);
    }
    engine.playSound('COUNT_DOWN', { volume: 0.55 });
    note(engine, `countdown:${mm.round}`);
  });
  c.on('msg:mayhem_go', (msg) => {
    if (!mm || msg.room !== mm.room) return;
    const st = normalizeMayhemState(msg);
    if (!st) return;
    mm.state = st;
    mm.status = 'running';
    if (hud) {
      hud.countdown.classList.add('is-go');
      hud.countdown.textContent = 'GO!';
      setTimeout(() => {
        if (mm?.status === 'running' && hud) hud.countdown.hidden = true;
      }, 650);
      hud.bar.hidden = false;
    }
    engine.playSound('READY', { volume: 0.65 });
    const me = st.players.find((p) => p.id === mm.myId);
    if (me) tip(`You are ${me.team}: ${me.score}. Make ${st.target}!`);
    note(engine, `go:${st.target}`);
    render(engine, true);
    publish(engine);
  });
  c.on('msg:mayhem_state', (msg) => setState(engine, msg));
  c.on('msg:mayhem_bump', (msg) => {
    if (!setState(engine, msg)) return;
    const a = Number(msg.a?.id) || 0;
    const b = Number(msg.b?.id) || 0;
    if (a === mm.myId || b === mm.myId) {
      const other = a === mm.myId ? msg.b : msg.a;
      tip(`${String(other?.name || 'Someone')} and you make ${Number(msg.answer) || 0}.`);
      engine.playSound('CLICK_SUCCESS', { volume: 0.4 });
    }
    note(engine, `bump:${a}+${b}=${Number(msg.answer) || 0}`);
  });
  c.on('msg:mayhem_end', (msg) => finish(engine, msg));
  c.on('msg:mayhem_removed', (msg) => {
    if (!mm || msg.room !== mm.room) return;
    engine.pushActivity(String(msg.text || ''));
    engine.toast(String(msg.text || ''), 3600);
    mm = null;
    exitArena(engine);
  });
  c.on('msg:mayhem_reward', (msg) => applyReward(engine, msg));
  c.on('hello', () => {
    // A reconnect: an unanswered join is gone with the old socket.
    joining = false;
  });
  return c;
}

function setState(engine, msg) {
  if (!mm || msg?.room !== mm.room) return false;
  const st = normalizeMayhemState(msg);
  if (!st || st.round !== mm.round) return false;
  mm.state = st;
  if (mm.status !== 'done') mm.status = 'running';
  render(engine, true);
  return true;
}

/** mayhem_room: into the arena (playerJoinInstance, then the instance's entrance). */
async function enterRoom(engine, msg) {
  joining = false;
  const info = normalizeMayhemRoom(msg);
  if (!info || mm || engine.query?.('isDead', engine) === true) {
    if (msg?.room) client?.send('mayhem_leave', { room: String(msg.room) });
    return;
  }
  for (const uid of looking.values()) if (uid) engine.removePrompt?.(uid);
  looking.clear();
  mm = { ...info, myId: client?.me?.id ?? null, status: 'waiting', round: 1, state: null, ready: false, acked: false, readyAt: 0, entering: true, result: null, need: 0, startAt: 0 };
  buildChrome(engine);
  if (engine.streetTsid !== CROWNS_STREET) {
    record.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player.x), y: Math.round(engine.player.y) };
  }
  // test_game_starter.js:81.
  engine.pushActivity(MAYHEM_TEXT.transported);
  engine.instanceHold = MAYHEM_ID;
  engine.save();
  note(engine, `room:${info.room}:${info.slot}`);
  const spawn = info.spawn || CROWNS_START_POINTS[0];
  await engine.enter(CROWNS_STREET, { spawnX: spawn.x, spawnY: spawn.y, bypassFeatureGates: true, useTransition: true });
  publish(engine);
}

function toSpawn(engine) {
  const spawn = mm?.spawn || CROWNS_START_POINTS[0];
  engine.player.x = spawn.x;
  engine.player.y = spawn.y;
  engine.player.vx = 0;
  engine.player.vy = 0;
}

function setupArena(engine) {
  mm.entering = false;
  toSpawn(engine);
  clearDiscs();
  if (hud) {
    hud.ready.hidden = mm.status !== 'waiting' || mm.ready;
    hud.bar.hidden = false;
  }
  renderSeats();
  render(engine, true);
  note(engine, 'arena');
  publish(engine);
}

/** Click to Start (games_accept_start_button, dismissOverlaysAndStart 231-342). */
function readyUp(engine) {
  if (!mm || mm.status !== 'waiting' || mm.ready) return;
  mm.ready = true;
  mm.readyAt = Date.now();
  if (hud) hud.ready.hidden = true;
  client?.send('mayhem_ready', { room: mm.room });
  mustWait(engine);
  note(engine, 'clicked');
  publish(engine);
}

/** "You must wait for more players before this game can begin." with Leave, and the throbber. */
function mustWait(engine) {
  if (!hud) return;
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.textContent = MAYHEM_TEXT.mustWait;
  const round = mm.round;
  setTimeout(() => {
    if (mustWaitUid || !mm || mm.round !== round || mm.status !== 'waiting' || !mm.ready) return;
    mustWaitUid = engine.prompt?.({
      text: MAYHEM_TEXT.mustWait,
      choices: [{ label: MAYHEM_TEXT.leave, value: 'leave' }],
      onChoice: (v) => {
        mustWaitUid = null;
        if (v === 'leave') leaveGame(engine);
      },
    }) || null;
  }, 700);
}

function clearMustWait(engine) {
  if (mustWaitUid) engine.removePrompt?.(mustWaitUid);
  mustWaitUid = null;
}

function playAgain(engine) {
  if (!mm) return;
  clearEnd();
  mm.ready = true;
  mm.acked = false;
  mm.readyAt = Date.now();
  mm.status = 'waiting';
  client?.send('mayhem_again', { room: mm.room });
  toSpawn(engine);
  mustWait(engine);
  note(engine, 'again');
  publish(engine);
}

function leaveGame(engine) {
  if (mm) client?.send('mayhem_leave', { room: mm.room });
  mm = null;
  note(engine, 'left');
  exitArena(engine);
}

/** Back where the player came from (games_leave_instance 'leave': instances_exit). */
async function exitArena(engine) {
  clearMustWait(engine);
  clearEnd();
  clearDiscs();
  syncThrobber(false);
  if (hud) {
    hud.bar.hidden = true;
    hud.ready.hidden = true;
    hud.countdown.hidden = true;
    hud.target.hidden = true;
  }
  const back = record.returnTo;
  record.returnTo = null;
  if (engine.instanceHold === MAYHEM_ID) engine.instanceHold = null;
  engine.save();
  if (back?.tsid && engine.streetTsid === CROWNS_STREET) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* The end (games_end_math_mayhem 1048-1155)                           */
/* ------------------------------------------------------------------ */

function finish(engine, msg) {
  if (!mm || msg.room !== mm.room) return;
  const out = mayhemOutcome(msg, mm.myId);
  const st = normalizeMayhemState(msg);
  if (st) mm.state = st;
  mm.status = 'done';
  mm.ready = false;
  mm.acked = false;
  mm.result = out;
  clearMustWait(engine);
  const key = `${msg.room}:${msg.round}`;
  if (!counted.has(key) && out.played) {
    counted.add(key);
    if (out.won) {
      record.wins += 1;
      engine.achievement('math_mayhem:won', 1);
    } else {
      record.losses += 1;
      engine.achievement('math_mayhem:lost', 1);
    }
  }
  clearTip();
  clearDiscs();
  if (hud) {
    hud.bar.hidden = true;
    hud.countdown.hidden = true;
    hud.ready.hidden = true;
    hud.target.hidden = true;
  }
  if (out.won) engine.playSound('YOU_WIN', { volume: 0.7 });
  else if (out.outcome === 'lost') {
    engine.pushActivity(MAYHEM_TEXT.theyWon(out.winnerName));
    engine.playSound('YOU_LOSE', { volume: 0.7 });
  } else engine.pushActivity(out.outcome === 'timeout' ? MAYHEM_TEXT.timeUp : MAYHEM_TEXT.calledOff);
  showEnd(engine, out, msg.why === 'short');
  engine.updateHud();
  engine.save();
  note(engine, `end:${out.outcome}`);
  publish(engine);
}

/**
 * The pictures (1065-1074 you, 1090-1112 someone else and their name) and the
 * two buttons (1116-1148). A round with nobody at the target shows only the
 * buttons (the source's winner-less end); a game too few are left in only Leave.
 */
function showEnd(engine, out, short) {
  clearEnd();
  const doc = globalThis.document;
  const root = doc?.getElementById('game-root');
  if (!root) return;
  const pic = out.won ? MAYHEM_END.you : out.outcome === 'lost' ? MAYHEM_END.other : null;
  if (pic) ends.push(playWindowOverlay(pic.key, { wh: pic.wh, x: pic.x, y: pic.y, durationMs: 0, loop: false }));
  const r = locationRect(doc);
  if (!r) return;
  if (out.outcome === 'lost') {
    const name = el('div', { class: 'mayhem-name', 'data-mayhem-winner': '' });
    name.textContent = out.winnerName;
    name.style.left = `${r.left + r.width * MAYHEM_END.name.x}px`;
    // The name sits in the crown, above its "IS THE WINNER" plate.
    name.style.top = `${r.top + r.height * MAYHEM_END.name.y - 8 * r.scale}px`;
    root.appendChild(name);
    ends.push({ el: name });
  }
  const buttons = short ? [MAYHEM_END.leave] : [MAYHEM_END.again, MAYHEM_END.leave];
  for (const b of buttons) {
    const again = b === MAYHEM_END.again;
    const label = again ? 'Play Again' : 'Leave the Game';
    const handle = playWindowOverlay(b.key, { wh: b.wh, x: b.x, y: b.y, durationMs: 0, loop: false, zIndex: 86 });
    ends.push(handle);
    // The art is a picture; a button the same size sits on it for the click and the keyboard.
    const w = b.wh * r.scale;
    const h = w * (42 / 207);
    const btn = el('button', { type: 'button', class: 'mayhem-end-btn', 'aria-label': label, [`data-mayhem-end-${again ? 'again' : 'leave'}`]: '' });
    btn.textContent = label;
    Object.assign(btn.style, { left: `${r.left + r.width * b.x - w / 2}px`, top: `${r.top + r.height * b.y - h / 2}px`, width: `${w}px`, height: `${h}px` });
    btn.addEventListener('click', () => (again ? playAgain(engine) : leaveGame(engine)));
    root.appendChild(btn);
    ends.push({ el: btn });
    handle.done?.then((ok) => {
      if (ok === false && btn.isConnected) btn.classList.add('no-art');
    });
    if (again) setTimeout(() => btn.isConnected && btn.focus({ preventScroll: true }), 400);
  }
}

function clearEnd() {
  for (const e of ends) {
    if (e?.stop) e.stop();
    e?.el?.remove();
  }
  ends = [];
}

/* ------------------------------------------------------------------ */
/* Rewards (games_end_math_mayhem 1077-1079)                           */
/* ------------------------------------------------------------------ */

async function persist(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    let st;
    try {
      st = await saveStore.flush();
    } catch {
      return false;
    }
    const now = saveStore.state || st;
    if (now === 'saved') return true;
    if (BLOCKED_SAVES.has(now)) return false;
  }
  return saveStore.state === 'saved';
}

/** mayhem_reward: the winner's 200 iMG with the mood bonus and the 50 currants the ledger holds, once. */
async function applyReward(engine, msg) {
  const r = normalizeMayhemReward(msg);
  const c = client;
  if (!r || !c || applying.has(r.id)) return;
  if (applied.includes(r.id)) {
    if (await persist(engine)) c.send('mayhem_ack', { id: r.id });
    return;
  }
  applying.add(r.id);
  const pc = engine.pc;
  const xp = r.xp > 0 ? grantMoodXp(pc, r.xp) : 0;
  let currants = 0;
  if (r.currants > 0 && engine.query?.('ledgerReceipt', r.id, engine) !== false) {
    pc.currants = (pc.currants || 0) + r.currants;
    currants = r.currants;
  }
  applied = [...applied, r.id].slice(-APPLIED_KEEP);
  const bits = [xp ? `+${xp} iMG` : '', currants ? `+${currants} currants` : ''].filter(Boolean).join(' · ');
  engine.pushActivity(MAYHEM_TEXT.youWon(bits));
  engine.updateHud();
  note(engine, `reward:${r.id}:${xp}:${currants}`);
  publish(engine);
  const ok = await persist(engine);
  applying.delete(r.id);
  if (ok) c.send('mayhem_ack', { id: r.id });
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

let tipTimer = 0;
function tip(text) {
  const node = hud?.bar.querySelector('[data-mayhem-tip]');
  if (!node) return;
  node.textContent = text;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(clearTip, 3000);
}

function clearTip() {
  clearTimeout(tipTimer);
  const node = hud?.bar.querySelector('[data-mayhem-tip]');
  if (node) node.textContent = '';
}

function renderSeats() {
  const node = hud?.ready.querySelector('[data-mayhem-seats]');
  if (!node || !mm) return;
  const n = mm.players.length;
  node.textContent = `${n} ${n === 1 ? 'player' : 'players'} here (${mm.min} to ${mm.max}).`;
}

function clearDiscs() {
  for (const d of discs.values()) {
    d.g?.destroy?.();
    d.t?.destroy?.();
  }
  discs = new Map();
}

/** AbstractAvatarView.as showColorDot 204-245: the team's disc, a 2 px darker ring, the number in white. */
function drawDisc(d, p) {
  const key = `${p.team}:${p.score}`;
  if (d.key === key) return;
  d.key = key;
  const c = Number.parseInt(mayhemColor(p.team).slice(1), 16);
  const g = d.g;
  g.clear();
  g.circle(0, 0, DISC_R).fill({ color: c });
  g.circle(0, 0, DISC_R).fill({ color: 0x000000, alpha: 0.5 });
  g.circle(0, 0, DISC_R - 2).fill({ color: c });
  d.t.text = String(p.score);
}

function render(engine, force = false) {
  if (!mm || !hud) return;
  const st = mm.state;
  const running = mm.status === 'running' && st;
  // The disc over each player in the round.
  if (running && engine.entityLayer) {
    const { PIXI } = engine;
    const seen = new Set();
    for (const p of st.players) {
      const pos = mayhemPos(p.id, mm.myId, engine.player, client?.players);
      let d = discs.get(p.id);
      if (!d) {
        const g = new PIXI.Graphics();
        g.zIndex = 61;
        const t = new PIXI.Text({ text: '', style: { fontFamily: 'Arial', fontSize: 22, fontWeight: '700', fill: 0xffffff } });
        t.anchor.set(0.5);
        t.zIndex = 62;
        engine.entityLayer.addChild(g, t);
        d = { g, t, key: '' };
        discs.set(p.id, d);
      }
      drawDisc(d, p);
      seen.add(p.id);
      const visible = Boolean(pos);
      d.g.visible = visible;
      d.t.visible = visible;
      if (pos) {
        // Over the head; another player's disc sits over their name plate (realtime-feature PLATE_Y -150).
        const y = pos.y - (p.id === mm.myId ? 150 : 172) - DISC_R;
        d.g.x = d.t.x = pos.x;
        d.g.y = d.t.y = y;
      }
    }
    for (const [id, d] of discs) {
      if (!seen.has(id)) {
        d.g?.destroy?.();
        d.t?.destroy?.();
        discs.delete(id);
      }
    }
  }
  // "Target: N" (games_mayhem_show_target 1207-1229).
  hud.target.hidden = !running;
  if (running) {
    const text = MAYHEM_TEXT.target(st.target);
    if (hud.target.textContent !== text) hud.target.textContent = text;
  }
  syncThrobber(mm.status === 'waiting' && mm.ready);
  if (!force) return;
  const board = hud.bar.querySelector('[data-mayhem-board]');
  board.textContent = '';
  const rows = st ? mayhemBoard(st, mm.myId) : mm.players.map((p) => ({ id: p.id, name: p.name, team: '', score: 0, you: p.id === mm.myId }));
  for (const row of rows) {
    const span = document.createElement('span');
    if (row.you) span.className = 'is-you';
    const b = document.createElement('b');
    b.textContent = row.name;
    span.append(b);
    if (row.team) {
      const i = document.createElement('i');
      i.style.setProperty('--team', mayhemColor(row.team));
      i.textContent = String(row.score);
      span.append(i);
    }
    board.appendChild(span);
  }
}

/** dismissOverlaysAndStart 247-257: game_of_crowns_throbber while a clicked player waits. */
function syncThrobber(on) {
  if (on && (!throbber || throbber.cancelled)) {
    const t = OVERLAY_USES.game_of_crowns_throbber;
    throbber = playWindowOverlay('game_of_crowns_throbber', { wh: t.wh, x: t.x, y: t.y, durationMs: 0 });
    hud?.countdown.classList.add('has-throbber');
  } else if (!on && throbber) {
    throbber.stop();
    throbber = null;
    hud?.countdown.classList.remove('has-throbber');
  }
}

function publish(engine) {
  if (!engine?.setData) return;
  // The Game Pig's feet (world px) when one stands here, else 0.
  const pig = pigTarget?.sprite;
  engine.setData('mayhemPig', pig && !pig.destroyed ? `${Math.round(pig.x)},${Math.round(pig.y)}` : '0');
  if (engine.mode !== 'multiplayer') return;
  const me = mm?.state?.players.find((p) => p.id === mm.myId);
  engine.setData('mayhem', mm ? `${mm.status}:${mm.round}:${mm.state?.target || 0}:${me ? me.score : ''}` : joining ? 'joining' : 'idle');
  engine.setData('mayhemBoard', mm?.state ? mayhemBoard(mm.state, mm.myId).map((r) => `${r.name}:${r.team}:${r.score}`).join('|') : '');
  engine.setData('mayhemEnd', mm?.result ? `${mm.result.outcome}:${mm.result.winnerName}` : '');
  engine.setData('mayhemLast', lastNote);
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

/** True while Math Mayhem holds the Game of Crowns arena (crowns-feature leaves its name and reload to it). */
export function mayhemHoldsArena() {
  return Boolean(mm || record.returnTo);
}

export const mayhemFeature = {
  id: 'mayhem',

  init(engine) {
    engineRef = engine;
  },

  save() {
    return applied.length ? { ...record, applied } : record;
  },

  restore(slice, engine) {
    applied = engine?.mode === 'multiplayer' && Array.isArray(slice?.applied)
      ? slice.applied.filter((id) => typeof id === 'string' && MAYHEM_REWARD_ID_RE.test(id)).slice(-APPLIED_KEEP)
      : [];
    const back = slice?.returnTo;
    record = {
      wins: Math.max(0, Math.floor(Number(slice?.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(slice?.losses) || 0)),
      returnTo: back && typeof back.tsid === 'string' && back.tsid !== CROWNS_STREET
        ? { tsid: back.tsid, x: Math.round(Number(back.x) || 0), y: Math.round(Number(back.y) || 0) }
        : null,
    };
  },

  /** A reload in the arena is a logout: back where the player came from, out of the game. */
  reloadLocation(saved) {
    if (saved?.tsid !== CROWNS_STREET || !record.returnTo) return null;
    leftNote = true;
    const back = record.returnTo;
    record.returnTo = null;
    return { tsid: back.tsid, x: back.x, y: back.y };
  },

  ecologyOverride(street) {
    return street.tsid === CROWNS_STREET && mm ? { label: MAYHEM_TITLE, counts: {}, empty: true } : null;
  },

  prepareStreet(street) {
    if (street.tsid === CROWNS_STREET && mm) street.label = MAYHEM_TITLE;
  },

  labelFor(tsid) {
    if (/^MAYHEM_[0-9A-F]{16}$/.test(String(tsid || '')) || (tsid === CROWNS_STREET && mm)) return { street: MAYHEM_TITLE, hub: '', hubId: MAYHEM_ID };
    return null;
  },

  /** realtime-feature sharedStreet: the arena is shared on the game's own hub street (MAYHEM_<game>). */
  realtimeStreet(engine) {
    return mm && engine.streetTsid === CROWNS_STREET ? mm.street : null;
  },

  onStreetEnter(street, engine) {
    if (engine.mode === 'multiplayer') attach(engine);
    if (street.tsid === CROWNS_STREET && mm) {
      buildChrome(engine);
      setupArena(engine);
      return;
    }
    if (mm && street.tsid !== CROWNS_STREET) {
      // Off the arena some other way: out of the game.
      client?.send('mayhem_leave', { room: mm.room });
      mm = null;
      clearEnd();
      clearDiscs();
      syncThrobber(false);
      if (hud) {
        hud.bar.hidden = true;
        hud.ready.hidden = true;
        hud.countdown.hidden = true;
        hud.target.hidden = true;
      }
      if (engine.instanceHold === MAYHEM_ID) engine.instanceHold = null;
    }
    if (street.tsid !== CROWNS_STREET && record.returnTo && !mm) record.returnTo = null;
    if (leftNote && street.tsid !== CROWNS_STREET) {
      leftNote = false;
      engine.pushActivity(MAYHEM_TEXT.left);
    }
    if (engine.mode === 'multiplayer' && hasRaceDispenser(street.tsid)) {
      const point = pigSpot(engine);
      if (point) spawnPig(engine, point);
    }
    publish(engine);
  },

  onStreetClear() {
    pigTarget = null;
    clearDiscs();
  },

  travelGate() {
    return mm ? { ok: false, msg: "You can't leave in the middle of a game!" } : null;
  },

  physics(engine) {
    if (!mm || engine.streetTsid !== CROWNS_STREET) return null;
    return mm.status === 'running' ? { jump: JUMP_SCALE } : { speed: 0, jump: 0 };
  },

  verbsFor(target) {
    if (target.classId !== PIG_CLASS) return null;
    return [{ id: 'admire', label: 'admire', enabled: !busy(), reason: busy() ? 'You are already in a game!' : '', tooltip: MAYHEM_TEXT.pigAsk }];
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== PIG_CLASS) return false;
    if (verbId === 'admire') admire(engine);
    return true;
  },

  onTick(dtMs, now, engine) {
    if (engine.mode === 'multiplayer' && !client) attach(engine);
    const qa = globalThis.groddleQA;
    if (engine.mode === 'multiplayer' && qa && !qa.mayhem) {
      qa.mayhem = {
        join: () => join(engine),
        admire: () => admire(engine),
        ready: () => readyUp(engine),
        again: () => playAgain(engine),
        leave: () => leaveGame(engine),
        state: () => (mm ? { room: mm.room, status: mm.status, round: mm.round, state: mm.state, result: mm.result, players: mm.players } : null),
      };
    }
    if (!mm || engine.streetTsid !== CROWNS_STREET || mm.entering) return;
    if (mm.status !== 'running') {
      // Held on the start until GO (the waiting and countdown overlays are locking).
      const spawn = mm.spawn || CROWNS_START_POINTS[0];
      engine.player.x = spawn.x;
    }
    if (mm.status === 'countdown' && hud) {
      const left = mm.startAt - now;
      hud.countdown.textContent = left <= 0 ? 'GO!' : left > 3000 ? 'READY?' : String(Math.max(1, Math.ceil(left / 1000)));
    }
    // Click to Start counts once you stand in the arena: ask again until the server says so.
    if (mm.ready && !mm.acked && mm.status === 'waiting' && client?.street === mm.street && now - mm.readyAt >= 1500) {
      mm.readyAt = now;
      client.send(mm.result ? 'mayhem_again' : 'mayhem_ready', { room: mm.room });
    }
    render(engine, now - (mayhemFeature._lastBoard || 0) > 250);
    if (now - (mayhemFeature._lastBoard || 0) > 250) mayhemFeature._lastBoard = now;
    publish(engine);
  },

  _lastBoard: 0,
  _state() {
    return { mm, record, applied, joining };
  },
};
