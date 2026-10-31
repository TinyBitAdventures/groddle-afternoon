/**
 * Glitch Races as a feature module (see js/feature-host.js).
 *
 * Rules: js/races.js. Courses: js/race-courses.js. This file binds them to
 * the world: Race Ticket Dispensers on the eleven archived streets (store 20),
 * ticket activation from the pack, the source start delay, the race scene
 * (engine.enterScene), the ready card, READY/3/2/1/GO countdown, the stand-in
 * rival, checkpoints and hazard respawns, the finish posts, the result screen
 * with source rewards, and the return to the pre-race street. Grab 'Em Good
 * (the quoin_grab game) runs on the same flow: its course carries 71 mood
 * quoins, both racers score one per grab, and the first grab that puts a
 * racer's lead past the quoins left (or takes the last one) ends it.
 *
 * QA:
 *   ?autostart=1&racedemo=<race_id>        enter a course, auto-ready
 *     &racestage=ready                     stop on the ready card
 *     &raceautoplay=1                      drive the avatar along the route
 *     &raceassist=1                        the rival never leaves the start
 *     &racerivalseconds=N                  rival finishes after N seconds
 *     &racepreview=finish|<checkpoint>     start beside the finish / a checkpoint
 *                                          (Grab 'Em Good: finish|canopy = below the canopy)
 *   ?autostart=1&racedemo=dispenser        a dispenser beside you, store open
 *     &raceautoplay=buy                    buy + activate a Space Race ticket
 *     &raceticket=<ticket class>           ...or that ticket (e.g. race_ticket_grab_em_good;
 *                                          race_ticket_hogtie_piggy opens The Great Hog Haul)
 *   ?autostart=1&racedemo=grab_em_good     Grab 'Em Good; raceassist freezes the rival,
 *                                          racerivalseconds=N times its own tree to N s
 *     &racerival=close                     the rival keeps 90 px ahead of you and takes what
 *                                          it touches, so race shards (G212) can be seen both
 *                                          ways (G216); canvas quoinShardLast / quoinShardYou
 */

import { crowdScaleX } from '../avatar-anims.js?v=fb921bf4';
import { playCountdownArt } from '../overlays.js?v=6d2b7a11';
import {
  RACES,
  RACE_ACHIEVEMENTS,
  RACE_DISPENSER_CLASS,
  RACE_FLAGS,
  RACE_GENERIC_TICKET,
  RACE_START_DELAY_MS,
  RACE_STORE_ITEMS,
  RACE_TICKET_PRICE,
  RACE_TICKET_STACK,
  beginRaceCountdown,
  createRaceRun,
  finishRace,
  forfeitRace,
  formatRaceTime,
  hasRaceDispenser,
  isRaceSceneTsid,
  noteRaceFall,
  normalizeRaceRecord,
  passRaceCheckpoint,
  pickGenericRace,
  pickRival,
  projectRouteProgress,
  raceCountdownCue,
  raceElapsedMs,
  raceForTicket,
  raceIsLive,
  RACE_SPLASH_TEXT,
  RACE_STARTING_SOON,
  RACE_STARTING_SOON_MS,
  QUOIN_GRAB_ACHIEVEMENTS,
  HOG_HAUL_GAME_ID,
  HOG_HAUL_TICKET,
  grabRaceQuoin,
  quoinGrabMood,
  quoinGrabRemaining,
  raceSceneTsid,
  routeDurationMs,
  routeLengths,
  routePoseAt,
  routeTimeline,
  settleRace,
  startDelayMessage,
  tickRace,
} from '../races.js?v=df0576ad';
import { platformUnder, raceCourse, RACE_COURSE_IDS } from '../race-courses.js?v=565822aa';
import {
  drawCheckpointFlag,
  drawFinishGate,
  raceLoadingColors,
  renderRaceCourse,
} from '../race-render.js?v=5f946939';
import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { runStreetTransition } from '../screen-fx.js?v=82ce3680';
import { CROWNS_STREET, CROWNS_TICKET, CROWNS_TITLE } from '../game-of-crowns.js?v=98e21baf';
import { HOG_HAUL_STREET_ID } from '../hog-haul.js?v=50d2e072';
import { QUOIN_GRAB_SPLASH, RACE_SPLASH, splashFor } from '../game-splash.js?v=15233d46';
import { crownsMpChallenge, startCrowns } from './crowns-feature.js?v=d628732d';
import { startHogHaulMp } from './hog-haul-mp-feature.js?v=087704cd';
import { textureFromUrl } from '../textures.js?v=01a295a1';
import { QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js?v=d4f4772b';
import { gainMetabolic } from '../metabolics.js?v=8504134e';
import { grantMoodXp } from '../mood-xp.js?v=958e7680';
import { quoinShardGrabberSound, quoinShardSoundKey } from '../quoin-shards.js?v=9a2e4c37';
import {
  MP_RACE_COURSES,
  MP_RACE_TEXT,
  endOutcome,
  mayClaim,
  normalizeMatch,
  normalizeScores,
  othersLabel,
  shardAmount,
  splitScores,
} from '../races-mp.js?v=c61cc7b5';

const RACE_ICON_DIR = 'assets/sprites/races/';
const GAME_LOGO_DIR = 'assets/sprites/overlays/';
const RIVAL_SCALE = 1.35 * 0.4;

let record = normalizeRaceRecord({});
let run = null;
let course = null;
let rivalTimeline = null;
let rivalOpts = null;
let routeLens = null;
let rivalSprite = null;
let rivalLabel = null;
let finishSprite = null;
let finishFront = null;
let checkpointSprites = [];
let dispenserTarget = null;
let hud = null;
let progressHint = 0;
let resultApplied = false;
let splashShown = false; // G299: the end splash is up (engine.gameSplash, js/game-splash.js)
let lastHudAt = 0;
let startTimer = null;
let soonTimer = null; // the 5 s "YAY! THE GAME IS STARTING SOON." wait after Click to Start
let autoplayStartAt = 0;
let respawnUntil = 0;
let demoHandled = false;
let starting = false;
let lastSafe = null;
let engineRef = null;
let pinX = 0;
// Grab 'Em Good: live quoin sprites and when each scripted racer reaches them.
let quoinSprites = [];
let rivalFrozen = false;
/** QA (G216): &racerival=close keeps the Grab 'Em Good rival beside you. */
let rivalClose = false;
let rivalCloseDir = 1;
const RIVAL_CLOSE_DX = 90;
let autoTimeline = null;
let hogTicketRuns = 0; // Hog Haul instances opened from a ticket this session (QA data)

// Multiplayer (js/races-mp.js, groddle-afternoon-server/races.go): real players race each
// other instead of the stand-in. Everything below is unused in solo.
/** The match this player is in: normalizeMatch(race_match) + { myId, rows, remaining, ready, acked }. */
let mp = null;
let mpClient = null;
/** Challenger id -> prompt uid of the challenges heard on this street. */
const mpInvites = new Map();
let mpWaitUid = null; // "Waiting for other players..."
let mpMustWaitUid = null; // "You must wait for more players before this game can begin."
let mpChallenging = false; // race_challenge sent, no answer yet
let mpAccepting = false; // race_accept sent, no answer yet
let mpReadyAt = 0;
let mpFinishAt = 0;
let mpLast = '';
let mpAsked = false; // race_pending sent, no race_ticket yet
/** race_ticket.js:119, the ticket's words for a dead player. */
const MP_TOO_DEAD = 'You are too dead to be racing around.';

/* ------------------------------------------------------------------ */
/* Items                                                              */
/* ------------------------------------------------------------------ */

function ensureRaceItems() {
  for (const race of Object.values(RACES)) {
    ensureItem(race.ticket, {
      label: race.ticketLabel,
      desc: race.ticketDesc,
      icon: `${RACE_ICON_DIR}${race.ticket}.png`,
      baseCost: 20,
      stackMax: RACE_TICKET_STACK,
      tags: ['no_trade'],
      namePlural: `${race.ticketLabel}s`,
    });
  }
  // items/race_ticket_hogtie_piggy.js: base_cost 20, stackmax 5, its own tags.
  ensureItem(HOG_HAUL_TICKET.classTsid, {
    label: HOG_HAUL_TICKET.label,
    desc: HOG_HAUL_TICKET.desc,
    icon: `${RACE_ICON_DIR}${HOG_HAUL_TICKET.classTsid}.png`,
    baseCost: 20,
    stackMax: RACE_TICKET_STACK,
    tags: ['no_rube', 'games', 'ticket', 'races', 'toys'],
    namePlural: HOG_HAUL_TICKET.namePlural,
  });
  ensureItem(CROWNS_TICKET, {
    label: 'Game of Crowns Ticket',
    desc: 'Challenge another player to Game of Crowns.',
    icon: `${RACE_ICON_DIR}${CROWNS_TICKET}.png`,
    baseCost: 20,
    stackMax: RACE_TICKET_STACK,
    tags: ['no_trade'],
    namePlural: 'Game of Crowns Tickets',
  });
  ensureItem(RACE_GENERIC_TICKET, {
    label: 'Race Ticket',
    desc: 'Challenge another player to a race.',
    icon: `${RACE_ICON_DIR}race_ticket.png`,
    baseCost: 60,
    stackMax: RACE_TICKET_STACK,
    tags: ['no_trade'],
    namePlural: 'Race Tickets',
  });
}

function isRaceTicket(classTsid) {
  return classTsid === RACE_GENERIC_TICKET || classTsid === CROWNS_TICKET || classTsid === HOG_HAUL_TICKET.classTsid || Boolean(raceForTicket(classTsid));
}

function ticketRaceId(classTsid) {
  if (classTsid === CROWNS_TICKET) return 'it_game';
  if (classTsid === HOG_HAUL_TICKET.classTsid) return HOG_HAUL_GAME_ID;
  return classTsid === RACE_GENERIC_TICKET ? null : raceForTicket(classTsid)?.id || null;
}

function playable(raceId) {
  return raceId === 'it_game' || raceId === HOG_HAUL_GAME_ID || RACE_COURSE_IDS.includes(raceId);
}

/** quests/hogtie_piggy.js desc (the other races' store lines are their quest descs too). */
const HOG_HAUL_QUEST_DESC = 'Hogtie three Piggies and put them in the Pig Pen!';

function raceTitle(raceId) {
  if (raceId === HOG_HAUL_GAME_ID) return HOG_HAUL_TICKET.title;
  return raceId === 'it_game' ? CROWNS_TITLE : RACES[raceId]?.title || '';
}

function raceDesc(raceId) {
  if (raceId === HOG_HAUL_GAME_ID) return HOG_HAUL_QUEST_DESC;
  return raceId === 'it_game' ? 'Hold the crown for 60 seconds to win.' : RACES[raceId]?.desc || '';
}

/* ------------------------------------------------------------------ */
/* DOM chrome (styled like The Great Hog Haul)                        */
/* ------------------------------------------------------------------ */

const STYLE = `
.race-hud { top: 48px; }
.race-hud .hog-haul-scoreboard strong { min-width: 2.6em; padding: 0 .3em; }
.race-hud .race-track { position: relative; height: 10px; margin: var(--sp-4) auto 0; width: min(420px, 90%);
  border-radius: var(--radius-pill); background: color-mix(in srgb, var(--c-grey-17) 62%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-white) 20%, transparent); }
.race-hud .race-track i { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;
  border-radius: var(--radius-round); border: 2px solid var(--c-white); transition: left 120ms linear; }
.race-hud .race-track i[data-race-you] { background: var(--c-gold-89); z-index: calc(var(--z-raised) + 1); }
.race-hud .race-track i[data-race-them] { background: var(--c-violet-79b); }
.race-hud .race-track b { position: absolute; right: -4px; top: -6px; font-size: var(--fs-base); }
.race-hud .race-time { display: inline-block; margin-left: var(--sp-4); font-variant-numeric: tabular-nums; }
.race-hud .race-forfeit { pointer-events: auto; position: absolute; right: -8px; top: 52px; padding: 3px var(--sp-5);
  border: 1px solid color-mix(in srgb, var(--c-white) 50%, transparent); border-radius: var(--radius-pill); color: var(--text-inverse); font: 700 var(--fs-xs)/var(--lh-normal) inherit;
  background: color-mix(in srgb, var(--c-sand-21) 65%, transparent); cursor: pointer; }
.race-ready-hint { margin: -10px 0 var(--sp-9); color: var(--c-gold-87); font-size: var(--fs-sm); font-weight: 900; letter-spacing: .08em; }
.hog-haul-countdown.race-soon { font-size: clamp(var(--fs-3xl), 4.6vw, var(--fs-display)); letter-spacing: 0; text-align: center; padding: 0 var(--sp-8); }
.race-start-banner { position: absolute; z-index: calc(var(--z-screen) + 2); top: 15%; left: 50%; width: min(520px, calc(100% - 32px));
  transform: translateX(-50%); color: var(--text-inverse); text-align: center; font-size: clamp(var(--fs-2xl), 3.4vw, var(--fs-4xl));
  font-weight: 900; line-height: var(--lh-tight); text-shadow: 0 3px 0 var(--c-brown-32), 0 6px 18px color-mix(in srgb, var(--c-black) 70%, transparent); pointer-events: none; }
.race-start-banner[hidden], .race-store[hidden] { display: none; }
.race-store-card { position: relative; z-index: var(--z-raised); width: min(560px, 94%); max-height: 86%; overflow: auto;
  padding: var(--sp-10) var(--sp-10) var(--sp-8); border: 2px solid color-mix(in srgb, var(--c-white) 74%, transparent); border-radius: var(--radius-3xl); color: var(--text-inverse);
  background: radial-gradient(circle at 50% -30%, color-mix(in srgb, var(--c-gold-91) 32%, transparent), transparent 55%), linear-gradient(180deg,var(--c-sand-36),var(--surface-dark));
  box-shadow: 0 18px 60px color-mix(in srgb, var(--c-black) 50%, transparent); }
.race-store-card header { display: flex; align-items: center; gap: var(--sp-6); margin-bottom: var(--sp-5); }
.race-store-card header img { width: 44px; height: auto; }
.race-store-card h2 { margin: 0; font-size: var(--fs-2xl); }
.race-store-card header p { margin: var(--sp-1) 0 0; color: var(--c-gold-87); font-size: var(--fs-sm); font-weight: 800; }
.race-store-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.race-store-card li { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: var(--sp-5);
  padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--surface-bright) 8%, transparent); }
.race-store-card li.is-off { opacity: .55; }
.race-store-card li img { width: 36px; height: 36px; object-fit: contain; }
.race-store-card li small { display: block; color: var(--c-gold-87b); font-size: var(--fs-xs); }
.race-store-card li .race-store-actions { display: flex; gap: var(--sp-3); }
.race-store-card button { padding: 5px var(--sp-5); border: 0; border-radius: var(--radius-pill); font: 800 var(--fs-sm)/var(--lh-tight) inherit; cursor: pointer;
  color: var(--c-brown-28); background: var(--c-gold-89); }
.race-store-card button[data-race-activate] { background: var(--c-lime-89); }
.race-store-card button:disabled { cursor: default; opacity: .5; }
.race-store-card .race-store-close { position: absolute; right: 10px; top: 8px; background: transparent; color: var(--text-inverse); font-size: var(--fs-2xl); }
@media (max-width: 620px) {
  .race-store-card li { grid-template-columns: 32px 1fr; }
  .race-store-card li .race-store-actions { grid-column: 1 / -1; justify-content: flex-end; }
}
`;

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(key, '');
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  if (html) node.innerHTML = html;
  return node;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function buildChrome(engine) {
  if (hud || typeof document === 'undefined') return;
  if (!document.getElementById('races-feature-style')) {
    const style = el('style', { id: 'races-feature-style' });
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const host = document.getElementById('hog-haul-hud')?.parentElement || document.getElementById('game-root') || document.body;
  const bar = el('section', { id: 'race-hud', class: 'hog-haul-hud race-hud', hidden: true, 'aria-live': 'polite' }, `
    <div class="hog-haul-scoreboard">
      <span><b>You</b>: <strong data-race-you-pct>0%</strong></span>
      <span><b data-race-rival>Amp</b>: <strong data-race-rival-pct>0%</strong></span>
      <span data-race-remaining-wrap hidden><b>Remaining</b>: <strong data-race-remaining>0</strong></span>
    </div>
    <div class="race-track" aria-hidden="true"><i data-race-them style="left:0%"></i><i data-race-you style="left:0%"></i><b>🏁</b></div>
    <p class="hog-haul-objective"><span data-race-objective></span><span class="race-time" data-race-time>0:00.0</span></p>
    <button type="button" class="race-forfeit" data-race-forfeit>Leave race</button>`);
  const ready = el('div', { id: 'race-ready', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'race-ready-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-ready-card">
      <img data-race-ready-icon alt="" />
      <p data-race-ready-kicker>Race</p>
      <h2 id="race-ready-title" data-race-ready-desc></h2>
      <button type="button" class="btn-glitch-primary" data-race-ready-btn>Click to Start</button>
    </div>`);
  const countdown = el('div', { id: 'race-countdown', class: 'hog-haul-countdown', hidden: true, 'aria-live': 'assertive' });
  const banner = el('div', { id: 'race-start-banner', class: 'race-start-banner', hidden: true, 'aria-live': 'assertive' });
  const store = el('div', { id: 'race-store-panel', class: 'hog-haul-screen race-store', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'race-store-title' }, `
    <div class="hog-haul-screen-shade" data-race-store-close></div>
    <div class="race-store-card">
      <button type="button" class="race-store-close" data-race-store-close aria-label="Close">×</button>
      <header><img src="${RACE_ICON_DIR}race_ticket_dispenser.png" alt="" />
        <div><h2 id="race-store-title">Ticket Dispenser</h2><p data-race-store-currants></p></div></header>
      <ul data-race-store-list></ul>
    </div>`);
  for (const node of [bar, ready, countdown, banner, store]) host.appendChild(node);
  hud = { bar, ready, countdown, banner, store };
  // The ready card doubles as a called-off multiplayer game's end card (data-mode="leave").
  ready.querySelector('[data-race-ready-btn]').addEventListener('click', () => (ready.dataset.mode === 'leave' ? leaveRace(engine) : readyUp(engine)));
  bar.querySelector('[data-race-forfeit]').addEventListener('click', () => confirmForfeit(engine));
  store.querySelectorAll('[data-race-store-close]').forEach((node) => node.addEventListener('click', () => closeStore()));
  store.querySelector('[data-race-store-list]').addEventListener('click', (event) => {
    const buy = event.target.closest('[data-race-buy]');
    const go = event.target.closest('[data-race-activate]');
    if (buy) buyTicket(buy.dataset.raceBuy, engine);
    if (go) {
      closeStore();
      activateTicket(go.dataset.raceActivate, engine);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Store (race_ticket_dispenser.js verb "purchase" → store 20)         */
/* ------------------------------------------------------------------ */

function storeOpen() {
  return Boolean(hud && !hud.store.hidden);
}

function closeStore() {
  if (hud) hud.store.hidden = true;
  engineRef?.setData('raceStore', 'closed');
}

function renderStore(engine) {
  if (!hud) return;
  const list = hud.store.querySelector('[data-race-store-list]');
  hud.store.querySelector('[data-race-store-currants]').textContent =
    `Every ticket ${RACE_TICKET_PRICE} currants · You have ${Math.floor(engine.pc.currants || 0).toLocaleString()}`;
  list.innerHTML = RACE_STORE_ITEMS.map((row) => {
    const raceId = ticketRaceId(row.classTsid);
    const on = Boolean(raceId && playable(raceId));
    const owned = on ? countItem(engine.inv, row.classTsid) : 0;
    const full = owned >= RACE_TICKET_STACK;
    const poor = (engine.pc.currants || 0) < row.cost;
    const why = !on ? 'Not in this remake yet' : full ? 'Your pack holds 5' : poor ? 'Not enough currants' : '';
    return `<li class="${on ? '' : 'is-off'}">
      <img src="${RACE_ICON_DIR}${row.classTsid}.png" alt="" />
      <span><b>${escapeHtml(row.label)}</b><small>${on ? escapeHtml(raceDesc(raceId)) : 'Not in this remake yet.'}${owned ? ` · ${owned} in pack` : ''}</small></span>
      <span class="race-store-actions">
        ${owned ? `<button type="button" data-race-activate="${row.classTsid}">Activate</button>` : ''}
        <button type="button" data-race-buy="${row.classTsid}" ${why ? `disabled title="${escapeHtml(why)}"` : ''}>Buy · ${row.cost}</button>
      </span></li>`;
  }).join('');
  engine.setData('raceStoreRows', String(RACE_STORE_ITEMS.length));
}

function openStore(engine) {
  buildChrome(engine);
  renderStore(engine);
  hud.store.hidden = false;
  engine.setData('raceStore', 'open');
}

function buyTicket(classTsid, engine) {
  const raceId = ticketRaceId(classTsid);
  if (!raceId || !playable(raceId)) return false;
  if (countItem(engine.inv, classTsid) >= RACE_TICKET_STACK) {
    engine.toast('Your pack can only hold five of those.');
    return false;
  }
  if ((engine.pc.currants || 0) < RACE_TICKET_PRICE) {
    engine.toast(`You need ${RACE_TICKET_PRICE} currants for that.`);
    return false;
  }
  engine.pc.currants -= RACE_TICKET_PRICE;
  addItem(engine.inv, classTsid, 1);
  engine.playSound('PURCHASE_ITEM', { volume: 0.55 });
  engine.pushActivity(`You bought a ${ITEM_LABEL(classTsid)} for ${RACE_TICKET_PRICE} currants.`);
  engine.updateHud();
  engine.save();
  renderStore(engine);
  publish(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Activation (race_ticket.js verb "activate")                         */
/* ------------------------------------------------------------------ */

function activationBlock(engine) {
  if (run || starting) return 'You are already racing!';
  if (engine.transientInstance()) return 'You cannot start a race from here.';
  if (engine.homeContext().inHome) return 'Races start out in the world, not at home.';
  const gate = engine.travelGate?.(raceSceneTsid('space_race'));
  if (gate && gate.ok === false) return gate.msg || 'You are too dead to be racing around.';
  return '';
}

function activateTicket(classTsid, engine, opts = {}) {
  if (!isRaceTicket(classTsid)) return false;
  const block = activationBlock(engine);
  if (block) {
    engine.toast(block, 2600);
    return false;
  }
  if (countItem(engine.inv, classTsid) < 1) return false;
  const raceId = ticketRaceId(classTsid) || pickGenericRace(Math.random());
  if (!playable(raceId)) {
    engine.toast('That race is not in this remake yet.');
    return false;
  }
  // G334: in multiplayer the Hog Haul Ticket challenges the street too (hog-haul-mp-feature, races.go + hoghaul.go).
  if (isMp(engine) && raceId === HOG_HAUL_GAME_ID) return mpChallenge(classTsid, raceId, engine);
  if (raceId === HOG_HAUL_GAME_ID && typeof engine.startHogHaulRace !== 'function') {
    engine.toast('That race is not in this remake yet.');
    return false;
  }
  if (isMp(engine) && MP_RACE_COURSES.includes(raceId)) return mpChallenge(classTsid, raceId, engine);
  // G334: a Game of Crowns Ticket challenges the real players on the street (crowns-feature, crowns.go).
  if (isMp(engine) && raceId === 'it_game') return crownsMpChallenge(classTsid, engine);
  removeItem(engine.inv, classTsid, 1);
  record.pendingTicket = classTsid;
  engine.updateHud();
  engine.save();
  if (raceId === HOG_HAUL_GAME_ID) return activateHogHaul(classTsid, engine, opts);
  const crowns = raceId === 'it_game';
  const rival = pickRival(raceId, Date.now() / 1000);
  // inc_games.js pretty_list(opponent_names, ' and ').
  const names = crowns ? 'Lily Linguistic' : rival.name;
  engine.pushActivity(`You activated a ${ITEM_LABEL(classTsid)}. ${crowns ? 'Three challengers' : rival.name} accepted your challenge!`);
  buildChrome(engine);
  hud.banner.textContent = startDelayMessage(raceTitle(raceId), crowns ? 'you, Amp, Bumbishfish' : 'you', names);
  hud.banner.hidden = false;
  engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
  starting = true;
  const delay = opts.delayMs ?? RACE_START_DELAY_MS;
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    hud.banner.hidden = true;
    const go = crowns ? startCrowns(engine, { ticket: classTsid }) : startRace(raceId, engine, { rival, ticket: classTsid });
    record.pendingTicket = crowns ? null : record.pendingTicket;
    Promise.resolve(go).finally(() => {
      starting = false;
    });
  }, delay);
  publish(engine);
  return true;
}

/**
 * race_ticket.js activate -> games_invite_create('hogtie_piggy'): the source
 * five-second start, then the Hog Haul instance (game.js startHogHaulRace,
 * its own Click to Start card, scores and 100 currants + 50 iMG win). As
 * with the Game of Crowns, the ticket is spent once the instance opens; a
 * reload before then gives it back.
 */
function activateHogHaul(classTsid, engine, opts = {}) {
  const rival = pickRival(HOG_HAUL_GAME_ID, Date.now() / 1000);
  engine.pushActivity(`You activated a ${ITEM_LABEL(classTsid)}. ${rival.name} accepted your challenge!`);
  buildChrome(engine);
  if (hud) {
    hud.banner.textContent = startDelayMessage(HOG_HAUL_TICKET.title, 'you', rival.name);
    hud.banner.hidden = false;
  }
  engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
  starting = true;
  hogTicketRuns += 1;
  const delay = opts.delayMs ?? RACE_START_DELAY_MS;
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    if (hud) hud.banner.hidden = true;
    record.pendingTicket = null;
    engine.save();
    Promise.resolve(engine.startHogHaulRace({ rivalLabel: rival.name, ticket: classTsid })).finally(() => {
      starting = false;
      publish(engine);
    });
  }, delay);
  publish(engine);
  return true;
}

function ITEM_LABEL(classTsid) {
  if (classTsid === CROWNS_TICKET) return 'Game of Crowns Ticket';
  if (classTsid === HOG_HAUL_TICKET.classTsid) return HOG_HAUL_TICKET.label;
  return raceForTicket(classTsid)?.ticketLabel || 'Race Ticket';
}

/* ------------------------------------------------------------------ */
/* Entering, readying, racing                                         */
/* ------------------------------------------------------------------ */

async function startRace(raceId, engine, opts = {}) {
  const nextCourse = raceCourse(raceId);
  if (!nextCourse || run) return false;
  buildChrome(engine);
  closeStore();
  if (!engine.inScene()) {
    record.returnTo = {
      tsid: engine.streetTsid,
      x: Math.round(engine.player?.x || 0),
      y: Math.round(engine.player?.y || 0),
    };
  }
  course = nextCourse;
  // Multiplayer: the race QA params stay solo's (a real opponent, no stand-in).
  const params = opts.mp ? new URLSearchParams() : new URLSearchParams(location.search);
  const rivalSeconds = Number(params.get('racerivalseconds'));
  rivalOpts = { pace: course.rivalPace, gravity: course.gravity };
  rivalTimeline = routeTimeline(rivalRoute(), rivalOpts);
  routeLens = routeLengths(myRoute());
  // Grab 'Em Good times the rival on its own tree (it then works down yours).
  const ownRival = course.kind === 'quoins' ? rivalRoute().slice(0, course.route.length) : rivalRoute();
  const natural = routeDurationMs(ownRival, rivalOpts);
  clearTimeout(soonTimer);
  soonTimer = null;
  run = createRaceRun(raceId, {
    now: Date.now(),
    rival: opts.mp ? { name: othersLabel(opts.mp.players, mp?.myId) || 'Your rival', tint: 0xc9a6ff } : opts.rival,
    // Multiplayer: nobody wins on the clock; the server's race_end decides.
    rivalDurationMs: opts.mp
      ? 86_400_000
      : params.get('raceassist') === '1'
        ? 3_600_000
        : Number.isFinite(rivalSeconds) && rivalSeconds > 0 ? rivalSeconds * 1000 : natural,
    ticket: opts.ticket || null,
    quoinTotal: opts.mp ? opts.mp.total : course.quoins?.length || 0,
  });
  if (rivalSeconds > 0) rivalOpts = { ...rivalOpts, pace: course.rivalPace * (natural / (rivalSeconds * 1000)) };
  rivalTimeline = routeTimeline(rivalRoute(), rivalOpts);
  rivalFrozen = course.kind === 'quoins' && params.get('raceassist') === '1';
  rivalClose = course.kind === 'quoins' && params.get('racerival') === 'close';
  rivalCloseDir = 1;
  autoTimeline = routeTimeline(course.route, { pace: 1.25, gravity: course.gravity });
  resultApplied = false;
  progressHint = 0;
  lastSafe = null;
  const race = RACES[raceId];
  const background = renderRaceCourse(engine.PIXI, course);
  const scene = {
    tsid: raceSceneTsid(raceId),
    label: race.title,
    // G318: no hub line. Race templates sit in hub 67 "Multiplayer Quests" (inc_data_maps_prod.js
    // 301, streets 17957-18004), and getLoadingInfo sends instances no hub_name (location.js 3311).
    hubName: '',
    width: course.width,
    height: course.height,
    background,
    platforms: course.platforms,
    walls: course.walls,
    spawn: mySpawn(),
    returnTo: record.returnTo,
  };
  const setup = () => {
    engine.enterScene(scene);
    spawnRaceEntities(engine);
  };
  const fx = document.getElementById('screen-transition');
  if (opts.useTransition === false || !fx) setup();
  else {
    await runStreetTransition(fx, {
      fromLabel: engine.street?.label || '',
      fromHub: engine.street?.hubName || '',
      toLabel: race.title,
      toHub: '',
      topColor: raceLoadingColors(course)[0],
      bottomColor: raceLoadingColors(course)[1],
      onMid: setup,
    });
  }
  engine.save();
  showReady(engine);
  engine.pushActivity(`${race.title}: ${race.desc}`);
  publish(engine);
  const stage = params.get('racestage');
  if (opts.autoReady || (params.get('racedemo') === raceId && stage !== 'ready')) {
    setTimeout(() => readyUp(engine), 600);
  }
  return true;
}

/** Time (ms from GO) at a float route index on a timeline. */
function timeAtIndex(times, at) {
  if (at == null || !times?.length) return Infinity;
  const i = Math.max(0, Math.min(times.length - 1, Math.floor(at)));
  const j = Math.min(times.length - 1, i + 1);
  return times[i] + (times[j] - times[i]) * (at - i);
}

/** Grab 'Em Good's quoins: mood quoins that bob in place and never respawn. */
function spawnQuoins(engine) {
  const { PIXI } = engine;
  const frames = engine.textures?.quoin?.frames || [];
  const start = QUOIN_TYPES.mood.row * QUOIN_SHEET.columns;
  const mood = frames.slice(start, start + QUOIN_SHEET.columns);
  // Multiplayer: where the server has them (groddle-afternoon-server/data/races.json, the same course).
  const spots = mp ? mp.quoins.map((p, index) => ({ ...(course.quoins[index] || {}), x: p.x, y: p.y })) : course.quoins;
  quoinSprites = spots.map((q, index) => {
    let sprite;
    if (mood.length) {
      sprite = new PIXI.AnimatedSprite(mood);
      sprite.animationSpeed = 0.28;
      sprite.gotoAndPlay(index % mood.length);
    } else {
      sprite = new PIXI.Graphics().circle(0, 0, 16).fill(QUOIN_TYPES.mood.color).stroke({ width: 2, color: 0xffffff });
    }
    sprite.anchor?.set(0.5, 0.5);
    sprite.x = q.x;
    sprite.y = q.y;
    sprite.zIndex = 25;
    sprite.eventMode = 'none';
    engine.entityLayer.addChild(sprite);
    return {
      ...q,
      index,
      sprite,
      live: true,
      rivalMs: rivalFrozen || rivalClose ? Infinity : timeAtIndex(rivalTimeline, q.rivalAt),
      autoMs: timeAtIndex(autoTimeline, q.at),
    };
  });
}

function takeQuoin(q) {
  q.live = false;
  if (q.sprite && !q.sprite.destroyed) q.sprite.destroy();
  q.sprite = null;
}

function spawnRaceEntities(engine) {
  const { PIXI } = engine;
  checkpointSprites = course.checkpoints.map((cp) => {
    const flag = drawCheckpointFlag(PIXI, cp);
    flag.zIndex = 8;
    engine.entityLayer.addChild(flag);
    return flag;
  });
  if (course.finish) {
    // Tiny Speck's finish gate: the far post and the bar behind the racers, the near post in front
    // of them (the avatar's body is zIndex 50, game.js makePlayer).
    const gate = drawFinishGate(PIXI, course.finish);
    finishSprite = gate.back;
    finishSprite.zIndex = 9;
    finishFront = gate.front;
    finishFront.zIndex = 60;
    engine.entityLayer.addChild(finishSprite, finishFront);
  }
  if (course.kind === 'quoins') spawnQuoins(engine);
  // The rival is a vector Glitch with its name's look (engine.npcGlitch).
  // Multiplayer has none: the other racers are real Glitches (realtime-feature).
  const npc = mp ? null : engine.npcGlitch?.(run.rivalName || run.raceId) || null;
  if (npc) {
    rivalSprite = npc.sprite;
    rivalSprite.npc = npc;
    rivalSprite.crowdScale = npc.scale;
    rivalSprite.facesRight = true;
    rivalSprite.scale.set(rivalSprite.crowdScale);
    rivalSprite.x = course.spawn.rival.x;
    rivalSprite.y = course.spawn.rival.y;
    rivalSprite.zIndex = 46;
    rivalSprite.eventMode = 'none';
    engine.entityLayer.addChild(rivalSprite);
    rivalLabel = new PIXI.Text({ text: run.rivalName, style: {
      fontFamily: 'Arial',
      fontSize: 13,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x2a1d14, width: 3 },
    } });
    rivalLabel.anchor.set(0.5, 1);
    rivalLabel.zIndex = 47;
    engine.entityLayer.addChild(rivalLabel);
  }
  placeRival(course.spawn.rival.x, course.spawn.rival.y, 'idle', 1);
  pinX = mySpawn().x;
  const preview = mp ? null : new URLSearchParams(location.search).get('racepreview');
  if (preview && engine.player) {
    // Grab 'Em Good has no posts: "finish" / "canopy" starts on the bough under the canopy.
    const top = course.kind === 'quoins' ? course.route[course.route.length - 3] : null;
    const cp = top && (preview === 'finish' || preview === 'canopy')
      ? { x: top.x, y: top.y }
      : preview === 'finish' && course.finish
        ? { x: course.finish.x - 260 * Math.sign(course.finish.x - course.spawn.player.x || 1), y: course.finish.y }
        : course.checkpoints[Number(preview)];
    if (cp) {
      const p = platformUnder(course.platforms, cp.x, cp.y, 4);
      engine.player.x = cp.x;
      engine.player.y = p ? p.y : cp.y;
      pinX = cp.x;
      engine.snapCamera?.();
    }
  }
}

/** Twin-path climbs give the rival its own mirrored route. */
function rivalRoute() {
  return course?.rivalRoute || course?.route || [];
}

/**
 * Multiplayer: slot 0 starts where solo's player does, slot 1 where solo's
 * stand-in does (groddle-afternoon-server/data/races.json spawns), and on a twin-path climb
 * slot 1 climbs the mirrored side.
 */
function mySpawn() {
  if (mp?.spawn) return { x: mp.spawn.x, y: mp.spawn.y };
  return mp && mp.slot % 2 === 1 ? course.spawn.rival : course.spawn.player;
}

function myRoute() {
  return mp && mp.slot % 2 === 1 && course?.rivalRoute && course.kind !== 'quoins' ? course.rivalRoute : course?.route || [];
}

/** The checkpoints on my side (a twin-path climb mirrors them for slot 1). */
function myCheckpoint(index) {
  const cp = course.checkpoints[index];
  if (!cp || !(mp && mp.slot % 2 === 1 && course.rivalRoute)) return cp || null;
  return { ...cp, x: course.width - cp.x };
}

function placeRival(x, y, mode, facing) {
  if (!rivalSprite || rivalSprite.destroyed) return;
  rivalSprite.x = x;
  rivalSprite.y = y;
  const scale = rivalSprite.crowdScale || RIVAL_SCALE;
  rivalSprite.scale.set(crowdScaleX(scale, facing, rivalSprite.facesRight), scale);
  if (rivalSprite.npc) {
    // walk / climb / jump play the Glitch's own animations; anything else stands (idle4 and idles).
    rivalSprite.npc.setMode(mode === 'walk' || mode === 'climb' || mode === 'jump' ? mode : 'stand');
  } else if (mode === 'walk' || mode === 'climb') {
    const speed = rivalSprite.facesRight ? 0.5 : 0.2;
    rivalSprite.animationSpeed = mode === 'climb' ? speed / 2 : speed;
    if (!rivalSprite.playing) rivalSprite.play();
  } else if (rivalSprite.playing) {
    rivalSprite.gotoAndStop(mode === 'jump' ? 3 : 0);
  }
  if (rivalLabel && !rivalLabel.destroyed) {
    rivalLabel.x = x;
    rivalLabel.y = y - 128;
  }
}

function showReady(engine) {
  const race = RACES[run.raceId];
  // G395 games_race_splash / games_quoin_grab_splash (inc_games.js 1279-1290, 1430-1440): the
  // splash graphic is Tiny Speck's race_logo, or grabemgood_logo for Grab 'Em Good.
  const icon = `${GAME_LOGO_DIR}${run.kind === 'quoins' ? 'grabemgood_logo' : 'race_logo'}@1.5x.webp`;
  const img = hud.ready.querySelector('[data-race-ready-icon]');
  img.src = icon;
  img.classList.add('game-logo');
  hud.ready.querySelector('[data-race-ready-kicker]').textContent = race.title;
  // games_quoin_grab_splash has its own line; the races share games_race_splash.
  hud.ready.querySelector('[data-race-ready-desc]').textContent = race.splash || RACE_SPLASH_TEXT;
  hud.ready.querySelector('[data-race-ready-btn]').textContent = 'Click to Start';
  delete hud.ready.dataset.mode;
  hud.ready.hidden = false;
  hud.bar.hidden = false;
  renderHud(engine, true);
}

function readyUp(engine) {
  if (mp) return mpReadyUp(engine);
  if (!run || run.status !== 'staging' || soonTimer) return;
  // shared_instance_manager.js: once everyone has clicked, 5 s of "YAY! THE
  // GAME IS STARTING SOON." (GAME_STARTING_SOON), then the 4 s countdown.
  hud.ready.hidden = true;
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.classList.add('race-soon');
  hud.countdown.textContent = RACE_STARTING_SOON;
  engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
  engine.setData('raceStarting', 'soon');
  const thisRun = run;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    if (!hud || run !== thisRun || run.status !== 'staging') return;
    beginRaceCountdown(run, Date.now());
    hud.countdown.classList.remove('race-soon');
    hud.countdown.textContent = 'READY?';
    engine.playSound('COUNT_DOWN', { volume: 0.55 });
    // G394: Tiny Speck's 321_countdown (shared_instance_manager.js 672-683), the words kept for screen readers.
    playCountdownArt(hud.countdown);
    engine.setData('raceStarting', 'countdown');
    publish(engine);
  }, RACE_STARTING_SOON_MS);
  publish(engine);
}

function confirmForfeit(engine) {
  if (!run || !raceIsLive(run)) return;
  // eslint-disable-next-line no-alert
  const title = RACES[run.raceId].title;
  const sure = mp
    ? window.confirm(MP_RACE_TEXT.confirmLeave(title))
    : engine.param('raceautoplay') ? true : window.confirm(`Leave ${title}? ${run.rivalName} will win.`);
  if (!sure) return;
  // global_game.js playerLeft 814-815: leaving calls the game off for everyone.
  if (mp) mpClient?.send('race_leave', { match: mp.match });
  forfeitRace(run, Date.now());
  showResult(engine);
}

function respawn(engine, why) {
  const player = engine.player;
  const cp = myCheckpoint(run.checkpoint);
  const to = cp || mySpawn();
  noteRaceFall(run);
  player.x = to.x;
  player.y = to.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  respawnUntil = Date.now() + 700;
  engine.snapCamera?.();
  engine.floatText(to.x, to.y - 90, why, 0xfff4d6);
  engine.playSound('CLICK_FAILURE', { volume: 0.4 });
  progressHint = Math.max(0, progressHint - 6);
}

function hazardText(kind) {
  if (kind === 'lava') return 'Ouch! Too hot!';
  if (kind === 'void') return 'Lost in space!';
  return 'Whoops!';
}

function raceTick(engine, now) {
  const events = tickRace(run, now);
  for (const event of events) {
    if (event.type === 'started') {
      hud.countdown.hidden = false;
      hud.countdown.classList.add('is-go');
      hud.countdown.textContent = 'GO!';
      setTimeout(() => {
        if (run?.status === 'running') hud.countdown.hidden = true;
      }, 650);
      engine.playSound('READY', { volume: 0.65 });
      record.pendingTicket = null;
      autoplayStartAt = now;
      engine.save();
    }
    if (event.type === 'lost') {
      run.rivalProgress = 1;
      const end = rivalRoute()[rivalRoute().length - 1];
      placeRival(end.x, end.y, 'idle', 1);
      showResult(engine);
    }
  }
  if (run.status === 'countdown') {
    hud.countdown.textContent = raceCountdownCue(run, now);
  }
  const player = engine.player;
  if (run.status === 'staging' || run.status === 'countdown') {
    player.x = pinX;
    player.vx = 0;
  }
  if (run.status !== 'running') return;

  if (run.kind === 'quoins') {
    quoinTick(engine, now);
    return;
  }

  if (mp) mpRivalProgress();
  else {
    const pose = routePoseAt(rivalRoute(), now - run.startAt, rivalOpts, rivalTimeline);
    placeRival(pose.x, pose.y, pose.mode, pose.facing);
    run.rivalProgress = pose.progress;
  }

  if (!mp && engine.param('raceautoplay') === '1') {
    const auto = routePoseAt(course.route, (now - autoplayStartAt) * 1.0, { pace: 1.25, gravity: course.gravity });
    player.x = auto.x;
    player.y = auto.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = auto.mode !== 'jump';
  }

  const proj = projectRouteProgress(myRoute(), player.x, player.y, progressHint, routeLens);
  if (proj.distance < 160) {
    progressHint = proj.segment;
    run.playerProgress = Math.max(0, Math.min(0.999, proj.progress));
  }

  course.checkpoints.forEach((_, index) => {
    const cp = myCheckpoint(index);
    if (Math.abs(player.x - cp.x) < 64 && Math.abs(player.y - cp.y) < 90 && passRaceCheckpoint(run, index)) {
      checkpointSprites[index]?.setPassed?.(true);
      engine.floatText(cp.x, cp.y - 100, 'Checkpoint!', 0xb8f08a);
      engine.playSound('QUOIN_GOT', { volume: 0.5 });
    }
  });

  const under = player.onGround ? platformUnder(course.platforms, player.x, player.y, 4) : null;
  if (under && !under.platform.hazard) lastSafe = { x: player.x, y: player.y };
  const floor = course.floor;
  if (floor && floor.kind !== 'ground' && now > respawnUntil &&
      (player.y >= floor.y - 4 || under?.platform.hazard)) {
    respawn(engine, hazardText(floor.kind));
  }

  const f = course.finish;
  if (f && Math.abs(player.x - f.x) < 52 && player.y <= f.y + 8 && player.y >= f.y - 150) {
    // Multiplayer: the server names the first across (race_set_winner); ask once a second.
    if (mp) {
      if (now - mpFinishAt >= 1000) {
        mpFinishAt = now;
        mpClient?.send('race_finish', { match: mp.match });
      }
    } else if (finishRace(run, now)) showResult(engine);
  }
}

/**
 * Grab 'Em Good while running: the rival walks its route and takes each quoin
 * it reaches; you take any quoin your avatar touches (items/quoin.js
 * onPlayerCollision). Each grab may settle the game (grabRaceQuoin).
 */
function quoinTick(engine, now) {
  if (mp) {
    mpQuoinTick(engine, now);
    return;
  }
  const elapsed = now - run.startAt;
  const player = engine.player;
  if (rivalClose && player) {
    // QA: stand 90 px from the avatar on its feet line, on the side of the
    // nearest quoin left at that height, so it reaches some first.
    let best = null;
    for (const q of quoinSprites) {
      if (!q.live || q.y < player.y - 118 || q.y > player.y + 18) continue;
      if (!best || Math.abs(q.x - player.x) < Math.abs(best.x - player.x)) best = q;
    }
    if (best && Math.abs(best.x - player.x) > 4) rivalCloseDir = Math.sign(best.x - player.x);
    else if (Math.abs(player.vx) > 0.2) rivalCloseDir = Math.sign(player.vx);
    placeRival(player.x + RIVAL_CLOSE_DX * rivalCloseDir, player.y, Math.abs(player.vx) > 0.2 ? 'walk' : 'idle', rivalCloseDir);
  } else if (!rivalFrozen) {
    const pose = routePoseAt(rivalRoute(), elapsed, rivalOpts, rivalTimeline);
    placeRival(pose.x, pose.y, pose.mode, pose.facing);
  }
  const auto = engine.param('raceautoplay') === '1';
  if (auto) {
    const pose = routePoseAt(course.route, now - autoplayStartAt, { pace: 1.25, gravity: course.gravity }, autoTimeline);
    player.x = pose.x;
    player.y = pose.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = pose.mode !== 'jump';
  }
  const bob = Math.sin(now / 320);
  for (const q of quoinSprites) {
    if (!q.live) continue;
    if (q.sprite) q.sprite.y = q.y + bob * 3;
    const touched = auto
      ? now - autoplayStartAt >= q.autoMs
      : Math.abs(player.x - q.x) <= 40 && q.y >= player.y - 118 && q.y <= player.y + 18;
    const rival = !touched && (rivalClose
      ? Boolean(rivalSprite && !rivalSprite.destroyed && Math.abs(rivalSprite.x - q.x) <= 40 && q.y >= rivalSprite.y - 118 && q.y <= rivalSprite.y + 18)
      : elapsed >= q.rivalMs);
    if (!touched && !rival) continue;
    takeQuoin(q);
    const result = grabRaceQuoin(run, touched ? 'you' : 'rival', now);
    if (!result.ok) continue;
    const amount = quoinGrabMood(engine.quoinState?.multiplier);
    // G212: the quoin_grab game runs the same onPlayerCollision, so a grab
    // within 300 px shards the other racer (items/quoin.js 83-154, 169).
    const rivalAt = rivalSprite && !rivalSprite.destroyed ? { name: run.rivalName, x: rivalSprite.x, y: rivalSprite.y } : null;
    const share = engine.query('quoinShards', {
      grabber: touched ? 'player' : run.rivalName,
      typeId: 'mood',
      baseAmount: quoinGrabMood(1),
      quoin: { x: q.x, y: q.y },
      at: touched ? { x: player.x, y: player.y } : rivalAt || { x: q.x, y: q.y },
      others: touched && rivalAt ? [rivalAt] : [],
    }, engine);
    if (touched) {
      // Game quoins pay their benefit but skip the daily quoin limit. G304: through the
      // gain gate (items/quoin.js 185 metabolics_add_mood: nothing lands while dead);
      // the quoin still shows its own amount (quoin.js 204 only swaps in xp's actual).
      gainMetabolic(engine.pc, 'mood', amount);
      engine.floatText(q.x, q.y - 24, `+${amount} mood`, 0xb5e35b);
      engine.playSound(share?.sound || 'QUOIN_GOT', { volume: 0.6, jitter: 0.04 });
      engine.updateHud();
    } else {
      engine.floatText(q.x, q.y - 24, `+${amount} mood`, 0xd9c8ff);
      if (!(share?.playerShard?.actual > 0)) engine.playSound('QUOIN_GOT', { volume: 0.22, jitter: 0.04 });
    }
    engine.setData('raceLastGrab', `${result.who}:${q.index}`);
    if (result.winner) {
      showResult(engine);
      return;
    }
  }
}

function showResult(engine) {
  if (!run || resultApplied) return;
  resultApplied = true;
  clearTimeout(soonTimer);
  soonTimer = null;
  hud.countdown.classList.remove('race-soon');
  const settled = settleRace(run, record);
  record = { ...settled.record, returnTo: record.returnTo, pendingTicket: null };
  const pc = engine.pc;
  // inc_race.js 368, 400 / inc_games.js 1373, 1573: stats_add_xp(n, false)
  // takes the mood bonus, and the splash names what landed.
  const reward = { ...settled.reward, xp: settled.reward.xp ? grantMoodXp(pc, settled.reward.xp) : 0 };
  if (reward.currants) pc.currants = (pc.currants || 0) + reward.currants;
  const race = RACES[run.raceId];
  // Desk RAINBOW (Austin 2026-10-26, G305): no winner rainbow and no happy or
  // angry emotes. Those are the quest races' race_finish (locations/inc_race.js
  // 384-385, 416); these ticket races end through inc_games.js games_end_race
  // (1330-1390), which has neither: the splash below is the whole ending.
  const quoins = run.kind === 'quoins';
  const counters = quoins ? QUOIN_GRAB_ACHIEVEMENTS : RACE_ACHIEVEMENTS;
  if (run.status === 'won') {
    engine.questFlag(RACE_FLAGS.win);
    engine.achievement(counters.won, 1);
    engine.pushActivity(`You won ${race.title}! +${reward.currants} currants · +${reward.xp} iMG.`);
    engine.playSound('YOU_WIN', { volume: 0.7 });
  } else if (run.status === 'lost') {
    engine.achievement(counters.lost, 1);
    engine.pushActivity(`${run.rivalName} won ${race.title}.`);
  } else if (mp?.calledOff != null) {
    engine.pushActivity(MP_RACE_TEXT.calledOff(mp.calledOff));
  } else {
    engine.pushActivity(`You left ${race.title}.`);
  }
  // The remake's own time line (no source) goes to the activity log, not the overlay.
  const time = raceElapsedMs(run, Date.now());
  const best = record.best[run.raceId];
  const timeLine = quoins
    ? `You grabbed ${run.scores.you} of ${run.quoinTotal} quoins, ${run.rivalName} ${run.scores.rival}${run.status === 'won' ? `, in ${formatRaceTime(time)}` : ''}.`
    : run.status === 'won'
      ? `Your time ${formatRaceTime(time)}${best ? `, best ${formatRaceTime(best)}` : ''}${run.falls ? `, ${run.falls} fall${run.falls === 1 ? '' : 's'}` : ''}.`
      : run.status === 'lost' ? `You were ${Math.round(run.playerProgress * 100)}% of the way there.` : '';
  if (timeLine) engine.pushActivity(timeLine);
  hud.countdown.hidden = true;
  hud.ready.hidden = true;
  // G299: ticket races end through players/inc_games.js games_end_race 1330-1390
  // (quoin races games_end_quoin_grab 1529-1600): a game_splash_screen with the
  // race_winner (grabemgood_winner) art at you_winner with rays, or other_winner
  // with the winner's name, and one "Leave the Game" (games_leave_instance_overlay
  // 'leave'). Leaving mid-race has no splash: you just go (games_leave_instance).
  if (run.status === 'won' || run.status === 'lost') {
    const splash = quoins ? QUOIN_GRAB_SPLASH : RACE_SPLASH;
    splashShown = true;
    engine.gameSplash?.({
      key: splash.key,
      ...splashFor(run.status === 'won', run.rivalName),
      textDeltaY: splash.textDeltaY,
      nameY: splash.nameY,
      buttons: [{ label: splash.leaveLabel, w: splash.buttonW, value: 'leave', onClick: () => leaveRace(engine) }],
    });
  } else if (mp?.calledOff != null) {
    showCalledOff(engine);
  } else setTimeout(() => leaveRace(engine), 0);
  engine.player.vx = 0;
  engine.updateHud();
  engine.save();
  renderHud(engine, true);
  publish(engine);
}

async function leaveRace(engine) {
  if (!run || raceIsLive(run)) return false;
  const outcome = run.status;
  const back = record.returnTo;
  if (outcome === 'won') engine.questFlag(RACE_FLAGS.leave);
  if (splashShown) engine.hideGameSplash?.();
  splashShown = false;
  hud.bar.hidden = true;
  hud.countdown.hidden = true;
  hud.ready.hidden = true;
  delete hud.ready.dataset.mode;
  if (mp) {
    // Out of the instance (games_leave_instance_overlay 'leave'); the street override ends with it.
    mpClient?.send('race_leave', { match: mp.match });
    mpClearPrompts(engine);
    mp = null;
  }
  run = null;
  course = null;
  record.returnTo = null;
  engine.save();
  const tsid = back?.tsid || null;
  if (tsid) await engine.enter(tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  engine.setData('raceStatus', 'left');
  engine.setData('raceOutcome', outcome);
  publish(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* Multiplayer: real players (js/races-mp.js, groddle-afternoon-server/races.go)       */
/* ------------------------------------------------------------------ */

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function mpMyId() {
  return mpClient?.me?.id ?? null;
}

function mpNote(engine, what) {
  mpLast = what;
  engine.setData?.('raceMpLast', what);
}

function mpClearPrompts(engine) {
  for (const uid of [mpWaitUid, mpMustWaitUid]) if (uid) engine.removePrompt?.(uid);
  mpWaitUid = null;
  mpMustWaitUid = null;
}

/** The ticket back after a challenge that never became a game (inc_games.js 2448-2450). */
function mpRefund(engine) {
  if (!record.pendingTicket) return;
  addItem(engine.inv, record.pendingTicket, 1);
  record.pendingTicket = null;
  engine.updateHud();
  engine.save();
}

/**
 * G349: a spent ticket this page holds for a challenge it never saw end (a
 * reload, a dropped socket, a croak or teleport while it waited). The source
 * spends the ticket at activation (race_ticket.js:150) and gives it back only
 * when the challenge fails (inc_games.js games_invite_timeout 2448-2450), so
 * in multiplayer the server says which (race_pending -> race_ticket, or
 * race_failed for a challenge still open); entering a street never refunds.
 */
function mpAskPending(engine) {
  const c = mpClient;
  if (!c || c.state !== 'online' || mpAsked || run || mpChallenging || starting || !record.pendingTicket) return;
  const course = ticketRaceId(record.pendingTicket);
  if (!course) return;
  mpAsked = c.send('race_pending', { course }) !== false;
  mpNote(engine, `pending:${course}`);
}

/** race_ticket.js activate in multiplayer: challenge the street (inc_games.js games_invite_create). */
function mpChallenge(classTsid, raceId, engine) {
  const c = mpClient || engine.query('realtimeClient');
  if (!c || c.state !== 'online' || !c.street) {
    engine.toast('You are offline, so nobody can hear your challenge.', 2600);
    return false;
  }
  // race_ticket.js:121: the verb is disabled with nobody else here.
  if (!c.players.length) {
    engine.toast('You need at least one other player here.', 2600);
    return false;
  }
  removeItem(engine.inv, classTsid, 1);
  record.pendingTicket = classTsid;
  engine.updateHud();
  engine.save();
  engine.pushActivity(`You activated a ${ITEM_LABEL(classTsid)}.`);
  mpChallenging = true;
  starting = true;
  if (!c.send('race_challenge', { course: raceId })) {
    mpChallenging = false;
    starting = false;
    mpRefund(engine);
    return false;
  }
  mpNote(engine, `challenge:${raceId}`);
  publish(engine);
  return true;
}

function mpAttach(engine) {
  if (mpClient) return mpClient;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  mpClient = c;
  c.on('msg:race_challenged', (msg) => {
    const from = Number(msg.from?.id) || 0;
    if (!from || from === mpMyId()) return;
    if (mpInvites.has(from)) engine.removePrompt?.(mpInvites.get(from));
    // inc_games.js 2392 broadcastActionRequest('game_accept', …): accept from the prompt.
    const uid = engine.prompt?.({
      text: String(msg.text || ''),
      choices: [{ label: MP_RACE_TEXT.accept, value: 'accept' }, { label: MP_RACE_TEXT.decline, value: 'no' }],
      timeout: Math.max(1, Math.min(60, Number(msg.timeout) || 60)),
      iconButtons: true,
      onChoice: (v) => {
        mpInvites.delete(from);
        if (v !== 'accept') return;
        if (run || starting) {
          engine.toast('You are already racing!', 2400);
          return;
        }
        mpAccepting = true;
        starting = true;
        if (!c.send('race_accept', { from })) {
          mpAccepting = false;
          starting = false;
        }
        publish(engine);
      },
      onTimeout: () => mpInvites.delete(from),
    });
    mpInvites.set(from, uid || '');
    mpNote(engine, `challenged:${from}`);
  });
  c.on('msg:race_unchallenged', (msg) => {
    const from = Number(msg.from) || 0;
    const uid = mpInvites.get(from);
    if (uid) engine.removePrompt?.(uid);
    mpInvites.delete(from);
    if (msg.text) engine.pushActivity(String(msg.text));
  });
  c.on('msg:race_waiting', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    starting = true;
    if (mpWaitUid) engine.removePrompt?.(mpWaitUid);
    // inc_games.js 2396-2405: "Waiting for other players..." with OK, for 60 s.
    mpWaitUid = engine.prompt?.({
      text: String(msg.text || 'Waiting for other players...'),
      choices: [{ label: MP_RACE_TEXT.ok, value: 'ok' }],
      timeout: Math.max(1, Math.min(60, Number(msg.timeout) || 60)),
      onChoice: () => { mpWaitUid = null; },
      onTimeout: () => { mpWaitUid = null; },
    }) || null;
    mpNote(engine, 'waiting');
    publish(engine);
  });
  c.on('msg:race_failed', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    if (!run) starting = false;
    mpClearPrompts(engine);
    if (msg.refund === true) {
      mpRefund(engine);
      if (msg.text) engine.prompt?.({ text: String(msg.text), choices: [{ label: MP_RACE_TEXT.dagnabit, value: 'ok' }], timeout: 10 });
    } else if (msg.text) engine.pushActivity(String(msg.text));
    mpNote(engine, `failed:${msg.refund === true ? 'refund' : 'no'}`);
    publish(engine);
  });
  c.on('msg:race_refused', (msg) => {
    const text = String(msg.text || '');
    if (mpChallenging) {
      mpChallenging = false;
      starting = false;
      mpRefund(engine);
      engine.toast(text, 3000);
    } else if (mpAccepting) {
      mpAccepting = false;
      starting = false;
      // inc_games.js 2466-2470: the late accepter's prompt.
      if (msg.why === 'full') engine.prompt?.({ text, choices: [{ label: MP_RACE_TEXT.dagnabit, value: 'ok' }], timeout: 10 });
      else engine.toast(text, 3000);
    } else if (text) engine.toast(text, 2600);
    mpNote(engine, `refused:${msg.why || ''}`);
    publish(engine);
  });
  c.on('msg:race_starting', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    starting = true;
    mpClearPrompts(engine);
    for (const uid of mpInvites.values()) if (uid) engine.removePrompt?.(uid);
    mpInvites.clear();
    buildChrome(engine);
    closeStore();
    hud.banner.textContent = String(msg.text || '');
    hud.banner.hidden = false;
    engine.pushActivity(String(msg.text || ''));
    engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
    mpNote(engine, 'starting');
    publish(engine);
  });
  c.on('msg:race_match', (msg) => {
    if (!run && engine.query?.('isDead', engine) === true) {
      // G334: croaked while the start ran. The dead do not race (race_ticket.js:119; location.js
      // onPlayerEnter 85-89 sends them back to Hell, instance.js 343-363 takes them out of the game):
      // leave the match at once. The server normally leaves a player in Naraka out (races.go start).
      if (msg?.match) c.send('race_leave', { match: String(msg.match) });
      if (hud) hud.banner.hidden = true;
      record.pendingTicket = null;
      starting = false;
      engine.toast(MP_TOO_DEAD, 3600);
      engine.pushActivity(MP_TOO_DEAD);
      engine.save();
      mpNote(engine, 'dead');
      publish(engine);
      return;
    }
    if (msg?.course === HOG_HAUL_GAME_ID && !run) {
      // The Great Hog Haul runs on its own street (hog-haul-mp-feature); the ticket is spent once it opens.
      if (hud) hud.banner.hidden = true;
      record.pendingTicket = null;
      starting = false;
      mpNote(engine, `hog:${String(msg.match || '')}`);
      engine.save();
      startHogHaulMp(engine, msg);
      publish(engine);
      return;
    }
    const info = normalizeMatch(msg);
    if (!info || run) {
      if (msg?.match) c.send('race_leave', { match: String(msg.match) });
      if (!run) starting = false;
      return;
    }
    const myId = mpMyId();
    mp = { ...info, myId, rows: info.players.map((p) => ({ id: p.id, name: p.name, score: 0 })), remaining: info.total, ready: false, acked: false, calledOff: null };
    if (hud) hud.banner.hidden = true;
    // The ticket is spent once the instance opens (as the Hog Haul and the crowns tickets).
    record.pendingTicket = null;
    mpNote(engine, `match:${info.match}`);
    Promise.resolve(startRace(info.course, engine, { mp: info })).finally(() => {
      starting = false;
      publish(engine);
    });
  });
  c.on('msg:race_ready_state', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    if ((msg.ready || []).map(Number).includes(mp.myId)) mp.acked = true;
    if (msg.text) engine.pushActivity(String(msg.text));
    mpNote(engine, `ready:${(msg.ready || []).length}`);
  });
  c.on('msg:race_soon', (msg) => {
    if (!mp || msg.match !== mp.match || !run || run.status !== 'staging') return;
    mp.acked = true;
    mp.soon = true;
    if (mpMustWaitUid) engine.removePrompt?.(mpMustWaitUid);
    mpMustWaitUid = null;
    hud.ready.hidden = true;
    hud.countdown.hidden = false;
    hud.countdown.classList.remove('is-go');
    hud.countdown.classList.add('race-soon');
    hud.countdown.textContent = String(msg.text || RACE_STARTING_SOON);
    engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
    engine.setData('raceStarting', 'soon');
    mpNote(engine, 'soon');
    publish(engine);
  });
  c.on('msg:race_countdown', (msg) => {
    if (!mp || msg.match !== mp.match || !run) return;
    if (beginRaceCountdown(run, Date.now())) run.startAt = Date.now() + Math.max(0, Number(msg.in) || 0);
    hud.countdown.classList.remove('race-soon');
    hud.countdown.textContent = 'READY?';
    engine.playSound('COUNT_DOWN', { volume: 0.55 });
    playCountdownArt(hud.countdown);
    engine.setData('raceStarting', 'countdown');
    mpNote(engine, 'countdown');
    publish(engine);
  });
  c.on('msg:race_go', (msg) => {
    if (!mp || msg.match !== mp.match || !run) return;
    if (run.status === 'countdown') run.startAt = Math.min(run.startAt, Date.now());
    mpNote(engine, 'go');
  });
  c.on('msg:race_grabbed', (msg) => mpGrabbed(engine, msg));
  c.on('msg:race_grab_refused', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    const q = quoinSprites[Number(msg.i)];
    if (q?.live) {
      if (msg.why === 'gone') takeQuoin(q);
      else if (q.sprite) q.sprite.alpha = 1;
    }
    mpNote(engine, `refused:${msg.i}:${msg.why}`);
  });
  c.on('msg:race_end', (msg) => {
    // G334: a page that reloaded mid-race hears the game it left is over (races.go pending / onJoin).
    if (!mp && msg?.left && Number(msg.left.id) === mpMyId() && msg.course !== HOG_HAUL_GAME_ID) {
      const title = String(msg.title || 'the race');
      engine.pushActivity(`You left ${title}, so the game is over.`);
      mpNote(engine, `end:${msg.why || ''}`);
      return;
    }
    mpEnd(engine, msg);
  });
  // G349: what became of a spent ticket's challenge, when this page asks (mpAskPending).
  c.on('msg:race_ticket', (msg) => {
    mpAsked = false;
    if (!record.pendingTicket || run) return;
    if (msg.refund === true) {
      mpRefund(engine);
      engine.toast(String(msg.text || 'Your race never started, so your ticket was returned.'), 3600);
    } else {
      record.pendingTicket = null;
      engine.save();
    }
    mpNote(engine, `ticket:${msg.refund === true ? 'refund' : 'spent'}`);
    publish(engine);
  });
  // Every (re)connect: the server called off any challenge this page had open (races.go onDisconnect).
  c.on('hello', () => {
    mpAsked = false;
    if (!run && (mpChallenging || mpAccepting || starting)) {
      mpChallenging = false;
      mpAccepting = false;
      starting = false;
      mpClearPrompts(engine);
      if (hud) hud.banner.hidden = true;
    }
    mpAskPending(engine);
  });
  if (c.state === 'online') mpAskPending(engine);
  c.on('msg:race_removed', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    engine.pushActivity(String(msg.text || ''));
    engine.toast(String(msg.text || ''), 3600);
    mp.calledOff = null;
    if (run && raceIsLive(run)) {
      forfeitRace(run, Date.now());
      showResult(engine);
    }
  });
  return c;
}

/** Click to Start: tell the server, then wait for everyone (dismissOverlaysAndStart 231-342). */
function mpReadyUp(engine) {
  if (!run || run.status !== 'staging' || mp.ready) return;
  mp.ready = true;
  mpReadyAt = Date.now();
  hud.ready.hidden = true;
  mpClient?.send('race_ready', { match: mp.match });
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.classList.add('race-soon');
  hud.countdown.textContent = MP_RACE_TEXT.mustWait;
  // The prompt (with Leave) only once it is clear others are still to click:
  // the last to click goes straight to "starting soon" (dismissOverlaysAndStart 259-296).
  const thisRun = run;
  setTimeout(() => {
    if (mpMustWaitUid || run !== thisRun || run.status !== 'staging' || !mp || mp.soon) return;
    mpMustWaitUid = engine.prompt?.({
      text: MP_RACE_TEXT.mustWait,
      choices: [{ label: MP_RACE_TEXT.leave, value: 'leave' }],
      onChoice: (v) => {
        mpMustWaitUid = null;
        if (v === 'leave' && run && raceIsLive(run)) {
          mpClient?.send('race_leave', { match: mp?.match });
          forfeitRace(run, Date.now());
          showResult(engine);
        }
      },
    }) || null;
  }, 700);
  engine.setData('raceStarting', 'waiting');
  mpNote(engine, 'clicked');
  publish(engine);
}

/** A finish-line race: the leading other racer's progress from where the server says they are. */
function mpRivalProgress() {
  let best = 0;
  for (const p of mpClient?.players || []) {
    const slot = mp.players.find((q) => q.id === p.id)?.slot;
    if (slot == null) continue;
    const route = slot % 2 === 1 && course.rivalRoute ? course.rivalRoute : course.route;
    // projectRouteProgress searches round a hint, so each racer keeps theirs.
    mp.hints ||= new Map();
    const proj = projectRouteProgress(route, p.x, p.y, mp.hints.get(p.id) || 0, null);
    if (proj.distance < 200) {
      mp.hints.set(p.id, proj.segment);
      best = Math.max(best, Math.min(0.999, proj.progress));
    }
  }
  run.rivalProgress = Math.max(run.rivalProgress || 0, best);
}

/** Grab 'Em Good with real players: a touch asks the server (first touch wins, quoin.js 157). */
function mpQuoinTick(engine, now) {
  const player = engine.player;
  const bob = Math.sin(now / 320);
  for (const q of quoinSprites) {
    if (!q.live) continue;
    if (q.sprite) q.sprite.y = q.y + bob * 3;
    const touched = player && Math.abs(player.x - q.x) <= 40 && q.y >= player.y - 118 && q.y <= player.y + 18;
    if (!touched || !mayClaim(q, now)) continue;
    q.claimAt = now;
    if (q.sprite) q.sprite.alpha = 0.45;
    mpClient?.send('race_grab', { match: mp.match, i: q.index });
  }
}

function mpGrabbed(engine, msg) {
  if (!mp || msg.match !== mp.match || !run) return;
  const myId = mp.myId;
  const rows = normalizeScores(msg.scores);
  if (rows.length) mp.rows = rows;
  mp.remaining = Math.max(0, Math.floor(Number(msg.remaining) || 0));
  const split = splitScores(mp.rows, myId);
  run.scores.you = split.you;
  run.scores.rival = split.rival;
  run.playerProgress = run.quoinTotal ? split.you / run.quoinTotal : 0;
  run.rivalProgress = run.quoinTotal ? split.rival / run.quoinTotal : 0;
  const i = Number(msg.i);
  const q = quoinSprites[i];
  const x = Number(msg.x) || q?.x || 0;
  const y = Number(msg.y) || q?.y || 0;
  if (q?.live) takeQuoin(q);
  const mult = engine.quoinState?.multiplier;
  const shards = (Array.isArray(msg.shards) ? msg.shards : []).filter((s) => Number.isFinite(Number(s?.id)));
  if (Number(msg.id) === myId) {
    // Game quoins pay their benefit times the multiplier and skip the daily limit (quoin.js 159-185).
    const amount = quoinGrabMood(mult);
    gainMetabolic(engine.pc, 'mood', amount);
    engine.floatText(x, y - 24, `+${amount} mood`, 0xb5e35b);
    engine.playSound(quoinShardGrabberSound(shards.length) || 'QUOIN_GOT', { volume: 0.6, jitter: 0.04 });
    if (shards.length) {
      engine.query?.('quoinShardFx', {
        quoin: { x, y },
        grabberIsViewer: true,
        viewerId: myId,
        shards: shards.map((s) => ({ id: Number(s.id), x: Number(s.x) || 0, y: Number(s.y) || 0, delta: 0, stat: 'mood' })),
        stat: 'mood',
      }, engine);
    }
    engine.updateHud();
  } else {
    engine.floatText(x, y - 24, `+${quoinGrabMood(1)} mood`, 0xd9c8ff);
    const amount = shardAmount(msg, myId, mult);
    let actual = 0;
    if (amount > 0) {
      // quoin.js 121-133: the shard lands on this racer's own mood.
      actual = gainMetabolic(engine.pc, 'mood', amount);
      if (actual > 0) {
        engine.playSound(quoinShardSoundKey(msg.crowd), { volume: 0.6, jitter: 0.03 });
        engine.pushActivity(`You got a quoin shard from ${String(msg.name || 'someone')}: +${actual} mood.`);
        engine.updateHud();
      }
      engine.setData('quoinShardYou', `mood:${amount}>${actual}`);
    } else engine.playSound('QUOIN_GOT', { volume: 0.22, jitter: 0.04 });
    if (shards.some((s) => Number(s.id) === myId)) {
      engine.query?.('quoinShardFx', {
        quoin: { x, y },
        grabberIsViewer: false,
        viewerId: myId,
        shards: shards.map((s) => ({ id: Number(s.id), x: Number(s.x) || 0, y: Number(s.y) || 0, delta: Number(s.id) === myId ? actual : 0, stat: 'mood' })),
        stat: 'mood',
      }, engine);
    }
  }
  engine.setData('raceLastGrab', `${Number(msg.id) === myId ? 'you' : 'rival'}:${i}`);
  mpNote(engine, `grabbed:${i}:${msg.id}`);
  renderHud(engine, true);
  publish(engine);
}

/** race_end: the winner from the server (global_game.js), or called off when someone left. */
function mpEnd(engine, msg) {
  if (!mp || msg.match !== mp.match) return;
  const rows = normalizeScores(msg.scores);
  if (rows.length) {
    mp.rows = rows;
    const split = splitScores(rows, mp.myId);
    if (run) {
      run.scores.you = split.you;
      run.scores.rival = split.rival;
    }
  }
  if (Number.isFinite(Number(msg.remaining))) mp.remaining = Number(msg.remaining);
  if (mpMustWaitUid) engine.removePrompt?.(mpMustWaitUid);
  mpMustWaitUid = null;
  mpNote(engine, `end:${msg.why || ''}`);
  if (!run || !raceIsLive(run)) return;
  const { outcome, winnerName, leftName } = endOutcome(msg, mp.myId);
  const now = Date.now();
  if (outcome === 'won') {
    run.status = 'won';
    run.playerProgress = run.kind === 'quoins' ? run.playerProgress : 1;
  } else if (outcome === 'lost') {
    run.status = 'lost';
    run.rivalName = winnerName || run.rivalName;
    if (run.kind !== 'quoins') run.rivalProgress = 1;
  } else {
    run.status = 'forfeit';
    mp.calledOff = leftName;
  }
  if (!run.startAt) run.startAt = now;
  run.finishedAt = now;
  showResult(engine);
}

/** A game called off (inc_games.js games_end_quoin_grab 1587-1610: the logo and Leave the Game, no reward). */
function showCalledOff(engine) {
  const race = RACES[run.raceId];
  hud.ready.querySelector('[data-race-ready-icon]').src = `${RACE_ICON_DIR}${race.ticket}.png`;
  hud.ready.querySelector('[data-race-ready-kicker]').textContent = race.title;
  hud.ready.querySelector('[data-race-ready-desc]').textContent = MP_RACE_TEXT.calledOff(mp?.calledOff || '');
  hud.ready.querySelector('[data-race-ready-btn]').textContent = MP_RACE_TEXT.leaveGame;
  hud.ready.dataset.mode = 'leave';
  hud.ready.hidden = false;
}

/* ------------------------------------------------------------------ */
/* HUD + QA attributes                                                */
/* ------------------------------------------------------------------ */

function renderHud(engine, force = false) {
  if (!hud || !run) return;
  const now = Date.now();
  if (!force && now - lastHudAt < 90) return;
  lastHudAt = now;
  const quoins = run.kind === 'quoins';
  const you = Math.round((run.playerProgress || 0) * 100);
  const them = Math.round((run.rivalProgress || 0) * 100);
  // quoin_grab_show_overlays: "label: score" per player, then "Remaining: N".
  hud.bar.querySelector('[data-race-you-pct]').textContent = quoins ? String(run.scores.you) : `${you}%`;
  hud.bar.querySelector('[data-race-rival]').textContent = run.rivalName;
  hud.bar.querySelector('[data-race-rival-pct]').textContent = quoins ? String(run.scores.rival) : `${them}%`;
  hud.bar.querySelector('[data-race-remaining-wrap]').hidden = !quoins;
  hud.bar.querySelector('[data-race-remaining]').textContent = String(mp && quoins ? mp.remaining : quoinGrabRemaining(run));
  hud.bar.querySelector('.race-track').hidden = quoins;
  hud.bar.querySelector('[data-race-you]').style.left = `${you}%`;
  hud.bar.querySelector('[data-race-them]').style.left = `${them}%`;
  hud.bar.querySelector('[data-race-time]').textContent = formatRaceTime(raceElapsedMs(run, now));
  hud.bar.querySelector('[data-race-objective]').textContent =
    run.status === 'staging' || run.status === 'countdown'
      ? RACES[run.raceId].desc
      : run.status === 'running' && quoins
        ? (run.scores.rival > run.scores.you + 2 ? `${run.rivalName} is grabbing more!` : run.scores.you > run.scores.rival + 2 ? 'You are in the lead!' : 'Neck and neck!')
      : run.status === 'running'
        ? (them > you + 8 ? `${run.rivalName} is pulling ahead!` : you > them + 8 ? 'You are in the lead!' : 'Neck and neck!')
        : run.status === 'won' ? 'You won!' : `${run.rivalName} won.`;
  hud.bar.querySelector('[data-race-forfeit]').hidden = !raceIsLive(run);
}

function publish(engine) {
  engine.setData('raceStatus', run ? run.status : 'idle');
  engine.setData('raceResultCard', splashShown ? 'shown' : '');
  engine.setData('raceId', run ? run.raceId : '');
  engine.setData('raceRival', run ? run.rivalName : '');
  engine.setData('raceProgress', run ? (run.playerProgress || 0).toFixed(3) : '0');
  engine.setData('raceRivalProgress', run ? (run.rivalProgress || 0).toFixed(3) : '0');
  engine.setData('raceCheckpoint', run ? String(run.checkpoint) : '-1');
  engine.setData('raceFalls', run ? String(run.falls) : '0');
  engine.setData('raceRivalMs', run ? String(Math.round(run.rivalDurationMs)) : '0');
  engine.setData('raceWins', String(Object.values(record.wins).reduce((a, b) => a + b, 0)));
  engine.setData('raceTickets', String(RACE_STORE_ITEMS.reduce((n, row) => n + countItem(engine.inv, row.classTsid), 0)));
  engine.setData('raceDispenser', dispenserTarget ? '1' : '0');
  engine.setData('raceHogTicketRuns', String(hogTicketRuns));
  engine.setData('raceCourseSource', course ? 'reconstructed' : '');
  engine.setData('raceKind', run ? run.kind : '');
  engine.setData('raceQuoinsYou', run?.kind === 'quoins' ? String(run.scores.you) : '');
  engine.setData('raceQuoinsRival', run?.kind === 'quoins' ? String(run.scores.rival) : '');
  engine.setData('raceQuoinsRemaining', run?.kind === 'quoins' ? String(mp ? mp.remaining : quoinGrabRemaining(run)) : '');
  engine.setData('raceMp', mp ? `${mp.match}:${mp.slot}` : '');
  engine.setData('raceMpStreet', mp ? mp.street : '');
  engine.setData('raceMpPlayers', mp ? mp.players.map((p) => p.name).join(',') : '');
  engine.setData('raceMpScores', mp ? mp.rows.map((r) => `${r.name}:${r.score}`).join(',') : '');
  engine.setData('raceMpLast', mpLast);
  engine.setData('raceQuoinsTotal', run?.kind === 'quoins' ? String(run.quoinTotal) : '');
  if (run && ['won', 'lost', 'forfeit'].includes(run.status)) engine.setData('raceOutcome', run.status);
}

/* ------------------------------------------------------------------ */
/* Dispensers                                                         */
/* ------------------------------------------------------------------ */

function spawnDispenser(engine, point) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(`${RACE_ICON_DIR}race_ticket_dispenser.png`));
  sprite.anchor.set(0.5, 1);
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 19;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  dispenserTarget = engine.register({
    classId: RACE_DISPENSER_CLASS,
    featureId: 'races',
    label: 'Race Ticket Dispenser',
    subtitle: 'Dispenses race tickets!',
    sprite,
  });
}

function wantsDemoDispenser(engine) {
  return engine.param('racedemo') === 'dispenser';
}

function handleDemo(engine) {
  if (demoHandled || !engine.started) return;
  // Demo and QA routes are solo's (Austin's multiplayer plan).
  if (engine.mode === 'multiplayer') {
    demoHandled = true;
    return;
  }
  const demo = engine.param('racedemo');
  if (!demo) {
    demoHandled = true;
    return;
  }
  if (RACES[demo] && playable(demo)) {
    demoHandled = true;
    setTimeout(() => startRace(demo, engine, { useTransition: false }), 300);
  } else if (demo !== 'dispenser') {
    demoHandled = true;
  } else {
    demoHandled = true;
    if ((engine.pc.currants || 0) < 200) engine.pc.currants = 500;
    openStore(engine);
    if (engine.param('raceautoplay') === 'buy') {
      const ticket = engine.param('raceticket') || 'race_ticket_space_race';
      setTimeout(() => {
        buyTicket(ticket, engine);
        closeStore();
        activateTicket(ticket, engine, { delayMs: 1200 });
      }, 700);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                            */
/* ------------------------------------------------------------------ */

export const racesFeature = {
  id: 'races',

  init(engine) {
    engineRef = engine;
    ensureRaceItems();
    publish(engine);
  },

  save() {
    return record;
  },

  restore(slice) {
    record = normalizeRaceRecord(slice || {});
  },

  /** A reload inside a race resumes on the pre-race street. */
  reloadLocation(saved) {
    if (isRaceSceneTsid(saved?.tsid) || (record.returnTo && !run)) {
      const back = record.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : null;
    }
    return null;
  },

  placementGroups(population, street) {
    if (!street || isRaceSceneTsid(street.tsid)) return [];
    const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('racedemo') === 'dispenser';
    if (!hasRaceDispenser(street.tsid) && !demo) return [];
    return [{ key: 'raceDispenser', count: 1, clearance: 70 }];
  },

  onStreetEnter(street, engine) {
    buildChrome(engine);
    if (engine.mode === 'multiplayer') mpAttach(engine);
    if (!run) {
      // G349: solo's reload rule. In multiplayer the server says (mpAskPending), never a street change.
      if (engine.mode === 'multiplayer') mpAskPending(engine);
      else if (record.pendingTicket) {
        addItem(engine.inv, record.pendingTicket, 1);
        engine.toast('Your race never started, so your ticket was returned.', 3600);
        record.pendingTicket = null;
        engine.updateHud();
      }
      if (record.returnTo) record.returnTo = null;
    }
    if (hasRaceDispenser(street.tsid) || wantsDemoDispenser(engine)) {
      let point = engine.placement('raceDispenser')[0];
      if (wantsDemoDispenser(engine)) point = { x: engine.player.x + 110, y: engine.player.y };
      if (point) spawnDispenser(engine, point);
    }
    handleDemo(engine);
    publish(engine);
  },

  onStreetClear() {
    rivalSprite = null;
    rivalLabel = null;
    finishSprite = null;
    finishFront = null;
    checkpointSprites = [];
    quoinSprites = [];
    dispenserTarget = null;
  },

  travelGate() {
    if (run || starting) return { ok: false, msg: "You can't leave in the middle of a race!" };
    return null;
  },

  /**
   * G267: location.js 2666-2671 sets no_starting_quests (with no_familiar) on
   * every is_race or is_game location. Races are the multiplayer quest
   * instances (quest.js 405: The Great Hog Haul, game.js on its street);
   * games are the shared instances a ticket opens (shared_instance_manager.js
   * 544: these race courses, Grab 'Em Good, the Hog Haul ticket and the Game
   * of Crowns arena). There the quest log's Try buttons and an offer's
   * accept_and_start are disabled (quest-offers-feature startBlockedReason).
   * null elsewhere, so another feature can answer.
   */
  noStartingQuests(engine) {
    const tsid = engine.streetTsid;
    return isRaceSceneTsid(tsid) || tsid === HOG_HAUL_STREET_ID || tsid === CROWNS_STREET ? true : null;
  },

  physics(engine) {
    if (!run || !course || !engine.inScene()) return null;
    if (run.status === 'staging' || run.status === 'countdown' || run.status === 'won' || run.status === 'lost' || run.status === 'forfeit') {
      return { speed: 0, jump: 0, gravity: course.gravity };
    }
    return { gravity: course.gravity };
  },

  onTick(dtMs, now, engine) {
    if (!demoHandled && engine.started) handleDemo(engine);
    if (engine.mode === 'multiplayer' && !mpClient) mpAttach(engine);
    // Click to Start counts once the racer stands in the instance: ask again until it does.
    if (mp?.ready && !mp.acked && mpClient?.street === mp.street && now - mpReadyAt >= 1500) {
      mpReadyAt = now;
      mpClient.send('race_ready', { match: mp.match });
    }
    if (!run || !course) return;
    if (!engine.inScene()) return;
    raceTick(engine, now);
    renderHud(engine);
    publish(engine);
  },

  verbsFor(target, engine) {
    if (target.classId !== RACE_DISPENSER_CLASS) return null;
    return [{ id: 'purchase', label: 'purchase', enabled: true, tooltip: 'Purchase a race ticket' }];
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== RACE_DISPENSER_CLASS) return false;
    if (verbId === 'purchase') openStore(engine);
    return true;
  },

  packVerbs(classTsid, engine) {
    if (!isRaceTicket(classTsid)) return [];
    const raceId = ticketRaceId(classTsid);
    // race_ticket.js:121, multiplayer: disabled with nobody else on the street.
    const alone = isMp(engine) && (!raceId || raceId === 'it_game' || raceId === HOG_HAUL_GAME_ID || MP_RACE_COURSES.includes(raceId)) && !(engine.query('realtimeClient')?.players.length > 0);
    const block = activationBlock(engine) || (alone ? 'You need at least one other player here.' : '');
    const name = raceId ? raceTitle(raceId) : 'a random race';
    return [{
      id: 'activate',
      label: 'Activate',
      primary: true,
      enabled: !block,
      reason: block,
      tooltip: `Challenge nearby players to ${name}`,
    }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!isRaceTicket(classTsid) || verbId !== 'activate') return false;
    activateTicket(classTsid, engine);
    return true;
  },

  /**
   * realtime-feature sharedStreet: in a multiplayer race the scene is shared
   * with the other racers on the match's own hub street (RACE_<match>).
   */
  realtimeStreet(engine) {
    return mp && run && engine.inScene?.() ? mp.street : null;
  },

  /** A racer's place in a party roster (party-feature streetLabel): the race, not RACE_<match>. */
  labelFor(tsid) {
    if (!/^RACE_[0-9A-F]{16}$/.test(String(tsid || ''))) return null;
    return { street: mp?.street === tsid ? RACES[mp.course]?.title || 'A race' : 'A race', hub: '', hubId: 'scene' };
  },

  /** QA / tests. */
  _state() {
    return { run, record, course: course?.id || null, mp };
  },
};
