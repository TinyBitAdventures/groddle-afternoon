/**
 * Glitch Races as a feature module (see js/feature-host.js).
 *
 * Rules: js/races.js. Courses: js/race-courses.js. This file binds them to
 * the world: Race Ticket Dispensers on the eleven archived streets (store 20),
 * ticket activation from the pack, the source start delay, the race scene
 * (engine.enterScene), the ready card, READY/3/2/1/GO countdown, the stand-in
 * rival, checkpoints and hazard respawns, the finish posts, the result screen
 * with source rewards, and the return to the pre-race street.
 *
 * QA:
 *   ?autostart=1&racedemo=<race_id>        enter a course, auto-ready
 *     &racestage=ready                     stop on the ready card
 *     &raceautoplay=1                      drive the avatar along the route
 *     &raceassist=1                        the rival never leaves the start
 *     &racerivalseconds=N                  rival finishes after N seconds
 *     &racepreview=finish|<checkpoint>     start beside the finish / a checkpoint
 *   ?autostart=1&racedemo=dispenser        a dispenser beside you, store open
 *     &raceautoplay=buy                    buy + activate a Space Race ticket
 */

import { crowdScaleX } from '../avatar-anims.js';
import {
  RACES,
  RACE_ACHIEVEMENTS,
  RACE_DISPENSER_CLASS,
  RACE_FLAGS,
  RACE_GENERIC_TICKET,
  RACE_IDS,
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
  raceResultCopy,
  raceSceneTsid,
  routeDurationMs,
  routeLengths,
  routePoseAt,
  routeTimeline,
  settleRace,
  startDelayMessage,
  tickRace,
} from '../races.js?v=races-1';
import { platformUnder, raceCourse, RACE_COURSE_IDS } from '../race-courses.js?v=races-1';
import {
  drawCheckpointFlag,
  drawFinishPosts,
  drawWinnerRainbow,
  raceLoadingColors,
  renderRaceCourse,
} from '../race-render.js?v=races-1';
import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-3';
import { runStreetTransition } from '../screen-fx.js';
import { CROWNS_TICKET, CROWNS_TITLE } from '../game-of-crowns.js?v=crowns-1';
import { startCrowns } from './crowns-feature.js?v=crowns-1';

const RACE_ICON_DIR = 'assets/sprites/races/';
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
let checkpointSprites = [];
let dispenserTarget = null;
let hud = null;
let progressHint = 0;
let resultApplied = false;
let lastHudAt = 0;
let startTimer = null;
let autoplayStartAt = 0;
let respawnUntil = 0;
let demoHandled = false;
let starting = false;
let lastSafe = null;
let engineRef = null;
let pinX = 0;

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
  return classTsid === RACE_GENERIC_TICKET || classTsid === CROWNS_TICKET || Boolean(raceForTicket(classTsid));
}

function ticketRaceId(classTsid) {
  if (classTsid === CROWNS_TICKET) return 'it_game';
  return classTsid === RACE_GENERIC_TICKET ? null : raceForTicket(classTsid)?.id || null;
}

function playable(raceId) {
  return raceId === 'it_game' || RACE_COURSE_IDS.includes(raceId);
}

function raceTitle(raceId) {
  return raceId === 'it_game' ? CROWNS_TITLE : RACES[raceId]?.title || '';
}

function raceDesc(raceId) {
  return raceId === 'it_game' ? 'Hold the crown for 60 seconds to win.' : RACES[raceId]?.desc || '';
}

/* ------------------------------------------------------------------ */
/* DOM chrome (styled like The Great Hog Haul)                        */
/* ------------------------------------------------------------------ */

const STYLE = `
.race-hud { top: 48px; }
.race-hud .hog-haul-scoreboard strong { min-width: 2.6em; padding: 0 .3em; }
.race-hud .race-track { position: relative; height: 10px; margin: 8px auto 0; width: min(420px, 90%);
  border-radius: 999px; background: rgba(18,15,14,.62); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
.race-hud .race-track i { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;
  border-radius: 50%; border: 2px solid #fff; transition: left 120ms linear; }
.race-hud .race-track i[data-race-you] { background: #ffd55b; z-index: 2; }
.race-hud .race-track i[data-race-them] { background: #c9a6ff; }
.race-hud .race-track b { position: absolute; right: -4px; top: -6px; font-size: 14px; }
.race-hud .race-time { display: inline-block; margin-left: 8px; font-variant-numeric: tabular-nums; }
.race-hud .race-forfeit { pointer-events: auto; position: absolute; right: -8px; top: 52px; padding: 3px 10px;
  border: 1px solid rgba(255,255,255,.5); border-radius: 999px; color: #fff; font: 700 .7rem/1.4 inherit;
  background: rgba(30,22,18,.65); cursor: pointer; }
.race-ready-hint { margin: -10px 0 18px; color: #f2d36c; font-size: .78rem; font-weight: 900; letter-spacing: .08em; }
.race-start-banner { position: absolute; z-index: 82; top: 15%; left: 50%; width: min(520px, calc(100% - 32px));
  transform: translateX(-50%); color: #fff; text-align: center; font-size: clamp(1.2rem, 3.4vw, 1.9rem);
  font-weight: 900; line-height: 1.15; text-shadow: 0 3px 0 #472b13, 0 6px 18px rgba(0,0,0,.7); pointer-events: none; }
.race-start-banner[hidden], .race-store[hidden] { display: none; }
.race-store-card { position: relative; z-index: 1; width: min(560px, 94%); max-height: 86%; overflow: auto;
  padding: 20px 20px 16px; border: 2px solid rgba(255,255,255,.74); border-radius: 18px; color: #fff;
  background: radial-gradient(circle at 50% -30%, rgba(255,222,105,.32), transparent 55%), linear-gradient(180deg,#493a2e,#251f1c);
  box-shadow: 0 18px 60px rgba(0,0,0,.5); }
.race-store-card header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.race-store-card header img { width: 44px; height: auto; }
.race-store-card h2 { margin: 0; font-size: 1.3rem; }
.race-store-card header p { margin: 2px 0 0; color: #f2d36c; font-size: .78rem; font-weight: 800; }
.race-store-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.race-store-card li { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.08); }
.race-store-card li.is-off { opacity: .55; }
.race-store-card li img { width: 36px; height: 36px; object-fit: contain; }
.race-store-card li small { display: block; color: #e8d9b8; font-size: .7rem; }
.race-store-card li .race-store-actions { display: flex; gap: 6px; }
.race-store-card button { padding: 5px 10px; border: 0; border-radius: 999px; font: 800 .74rem/1.2 inherit; cursor: pointer;
  color: #3a240c; background: #ffd55b; }
.race-store-card button[data-race-activate] { background: #b8f08a; }
.race-store-card button:disabled { cursor: default; opacity: .5; }
.race-store-card .race-store-close { position: absolute; right: 10px; top: 8px; background: transparent; color: #fff; font-size: 1.2rem; }
.race-result-time { margin: -10px 0 18px; color: #f6e7c4; font-size: .8rem; font-weight: 800; }
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
      <p class="race-ready-hint">(CLICK WHEN READY)</p>
      <button type="button" class="btn-glitch-primary" data-race-ready-btn>Click to Start</button>
    </div>`);
  const countdown = el('div', { id: 'race-countdown', class: 'hog-haul-countdown', hidden: true, 'aria-live': 'assertive' });
  const result = el('div', { id: 'race-result', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'race-result-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-result-card">
      <div class="hog-haul-result-rays" aria-hidden="true"></div>
      <img data-race-result-icon alt="" />
      <p data-race-result-kicker>RACE</p>
      <h2 id="race-result-title" data-race-result-title>YOU WON!</h2>
      <p data-race-result-detail></p>
      <p class="race-result-time" data-race-result-time></p>
      <button type="button" class="btn-glitch-primary" data-race-leave>Leave the Game</button>
    </div>`);
  const banner = el('div', { id: 'race-start-banner', class: 'race-start-banner', hidden: true, 'aria-live': 'assertive' });
  const store = el('div', { id: 'race-store-panel', class: 'hog-haul-screen race-store', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'race-store-title' }, `
    <div class="hog-haul-screen-shade" data-race-store-close></div>
    <div class="race-store-card">
      <button type="button" class="race-store-close" data-race-store-close aria-label="Close">×</button>
      <header><img src="${RACE_ICON_DIR}race_ticket_dispenser.png" alt="" />
        <div><h2 id="race-store-title">Ticket Dispenser</h2><p data-race-store-currants></p></div></header>
      <ul data-race-store-list></ul>
    </div>`);
  for (const node of [bar, ready, countdown, result, banner, store]) host.appendChild(node);
  hud = { bar, ready, countdown, result, banner, store };
  ready.querySelector('[data-race-ready-btn]').addEventListener('click', () => readyUp(engine));
  result.querySelector('[data-race-leave]').addEventListener('click', () => leaveRace(engine));
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
  removeItem(engine.inv, classTsid, 1);
  record.pendingTicket = classTsid;
  engine.updateHud();
  engine.save();
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

function ITEM_LABEL(classTsid) {
  if (classTsid === CROWNS_TICKET) return 'Game of Crowns Ticket';
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
  const params = new URLSearchParams(location.search);
  const rivalSeconds = Number(params.get('racerivalseconds'));
  rivalOpts = { pace: course.rivalPace, gravity: course.gravity };
  rivalTimeline = routeTimeline(rivalRoute(), rivalOpts);
  routeLens = routeLengths(course.route);
  const natural = routeDurationMs(rivalRoute(), rivalOpts);
  run = createRaceRun(raceId, {
    now: Date.now(),
    rival: opts.rival,
    rivalDurationMs: params.get('raceassist') === '1'
      ? 3_600_000
      : Number.isFinite(rivalSeconds) && rivalSeconds > 0 ? rivalSeconds * 1000 : natural,
    ticket: opts.ticket || null,
  });
  if (rivalSeconds > 0) rivalOpts = { ...rivalOpts, pace: course.rivalPace * (natural / (rivalSeconds * 1000)) };
  rivalTimeline = routeTimeline(rivalRoute(), rivalOpts);
  resultApplied = false;
  progressHint = 0;
  lastSafe = null;
  const race = RACES[raceId];
  const background = renderRaceCourse(engine.PIXI, course);
  const scene = {
    tsid: raceSceneTsid(raceId),
    label: race.title,
    hubName: 'Race',
    width: course.width,
    height: course.height,
    background,
    platforms: course.platforms,
    walls: course.walls,
    spawn: course.spawn.player,
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
      toHub: 'Race',
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

function spawnRaceEntities(engine) {
  const { PIXI } = engine;
  checkpointSprites = course.checkpoints.map((cp) => {
    const flag = drawCheckpointFlag(PIXI, cp);
    flag.zIndex = 8;
    engine.entityLayer.addChild(flag);
    return flag;
  });
  finishSprite = drawFinishPosts(PIXI, course.finish);
  finishSprite.zIndex = 9;
  engine.entityLayer.addChild(finishSprite);
  // Another Glitch's real walk cycle; the tinted portrait strip is the fallback.
  const crowd = engine.glitchCrowd?.(hashText(run.rivalName || run.raceId));
  const frames = crowd?.frames || engine.textures?.avatarStyledWalk?.frames || [];
  if (frames.length) {
    rivalSprite = new PIXI.AnimatedSprite(frames);
    rivalSprite.anchor.set(0.5, 1);
    rivalSprite.updateAnchor = Boolean(crowd);
    rivalSprite.animationSpeed = crowd ? crowd.animationSpeed : 0.18;
    rivalSprite.crowdScale = crowd ? crowd.scale : RIVAL_SCALE;
    rivalSprite.facesRight = Boolean(crowd);
    rivalSprite.scale.set(rivalSprite.crowdScale);
    if (!crowd) rivalSprite.tint = run.rivalTint;
    rivalSprite.x = course.spawn.rival.x;
    rivalSprite.y = course.spawn.rival.y;
    rivalSprite.zIndex = 46;
    rivalSprite.eventMode = 'none';
    engine.entityLayer.addChild(rivalSprite);
    rivalLabel = new PIXI.Text(run.rivalName, {
      fontFamily: 'Arial',
      fontSize: 13,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: 0x2a1d14,
      strokeThickness: 3,
    });
    rivalLabel.anchor.set(0.5, 1);
    rivalLabel.zIndex = 47;
    engine.entityLayer.addChild(rivalLabel);
  }
  placeRival(course.spawn.rival.x, course.spawn.rival.y, 'idle', 1);
  pinX = course.spawn.player.x;
  const preview = new URLSearchParams(location.search).get('racepreview');
  if (preview && engine.player) {
    const cp = preview === 'finish'
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

function placeRival(x, y, mode, facing) {
  if (!rivalSprite || rivalSprite.destroyed) return;
  rivalSprite.x = x;
  rivalSprite.y = y;
  const scale = rivalSprite.crowdScale || RIVAL_SCALE;
  rivalSprite.scale.set(crowdScaleX(scale, facing, rivalSprite.facesRight), scale);
  if (mode === 'walk' || mode === 'climb') {
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
  const icon = `${RACE_ICON_DIR}${race.ticket}.png`;
  hud.ready.querySelector('[data-race-ready-icon]').src = icon;
  hud.ready.querySelector('[data-race-ready-kicker]').textContent = race.title;
  hud.ready.querySelector('[data-race-ready-desc]').textContent = race.desc;
  hud.ready.hidden = false;
  hud.bar.hidden = false;
  renderHud(engine, true);
}

function readyUp(engine) {
  if (!run || run.status !== 'staging') return;
  beginRaceCountdown(run, Date.now());
  hud.ready.hidden = true;
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.textContent = 'READY?';
  engine.playSound('COUNT_DOWN', { volume: 0.55 });
  publish(engine);
}

function confirmForfeit(engine) {
  if (!run || !raceIsLive(run)) return;
  // eslint-disable-next-line no-alert
  const sure = engine.param('raceautoplay') ? true : window.confirm(`Leave ${RACES[run.raceId].title}? ${run.rivalName} will win.`);
  if (!sure) return;
  forfeitRace(run, Date.now());
  showResult(engine);
}

function respawn(engine, why) {
  const player = engine.player;
  const cp = course.checkpoints[run.checkpoint] || null;
  const to = cp || course.spawn.player;
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

  const pose = routePoseAt(rivalRoute(), now - run.startAt, rivalOpts, rivalTimeline);
  placeRival(pose.x, pose.y, pose.mode, pose.facing);
  run.rivalProgress = pose.progress;

  if (engine.param('raceautoplay') === '1') {
    const auto = routePoseAt(course.route, (now - autoplayStartAt) * 1.0, { pace: 1.25, gravity: course.gravity });
    player.x = auto.x;
    player.y = auto.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = auto.mode !== 'jump';
  }

  const proj = projectRouteProgress(course.route, player.x, player.y, progressHint, routeLens);
  if (proj.distance < 160) {
    progressHint = proj.segment;
    run.playerProgress = Math.max(0, Math.min(0.999, proj.progress));
  }

  course.checkpoints.forEach((cp, index) => {
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
  if (Math.abs(player.x - f.x) < 52 && player.y <= f.y + 8 && player.y >= f.y - 150) {
    if (finishRace(run, now)) showResult(engine);
  }
}

/** Stable small hash so a rival keeps the same Glitch. */
function hashText(text) {
  let h = 0;
  for (const ch of String(text || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function showResult(engine) {
  if (!run || resultApplied) return;
  resultApplied = true;
  const settled = settleRace(run, record);
  record = { ...settled.record, returnTo: record.returnTo, pendingTicket: null };
  const reward = settled.reward;
  const pc = engine.pc;
  if (reward.currants) pc.currants = (pc.currants || 0) + reward.currants;
  if (reward.xp) {
    pc.imagination = (pc.imagination || 0) + reward.xp;
    pc.xp = (pc.xp || 0) + reward.xp;
  }
  const race = RACES[run.raceId];
  // inc_race.js: the winner plays happy and the loser angry, 2 s on.
  if (run.status === 'won' || run.status === 'lost') engine.playEmotion?.(run.status === 'won' ? 'happy' : 'angry', 2000);
  if (run.status === 'won') {
    engine.questFlag(RACE_FLAGS.win);
    engine.achievement(RACE_ACHIEVEMENTS.won, 1);
    engine.pushActivity(`You won ${race.title}! +${reward.currants} currants · +${reward.xp} iMG.`);
    engine.playSound('YOU_WIN', { volume: 0.7 });
    const rainbow = drawWinnerRainbow(engine.PIXI);
    rainbow.x = engine.player.x;
    rainbow.y = engine.player.y - 30;
    rainbow.zIndex = 60;
    engine.entityLayer.addChild(rainbow);
  } else if (run.status === 'lost') {
    engine.achievement(RACE_ACHIEVEMENTS.lost, 1);
    engine.pushActivity(`${run.rivalName} won ${race.title}. +${reward.currants} currants · +${reward.xp} iMG for 2nd place.`);
  } else {
    engine.pushActivity(`You left ${race.title}.`);
  }
  const copy = raceResultCopy(run, reward);
  const card = hud.result.querySelector('.hog-haul-result-card');
  card.classList.toggle('is-loss', run.status !== 'won');
  hud.result.querySelector('[data-race-result-icon]').src = `${RACE_ICON_DIR}${race.ticket}.png`;
  hud.result.querySelector('[data-race-result-kicker]').textContent = race.title.toUpperCase();
  hud.result.querySelector('[data-race-result-title]').textContent = copy.title;
  hud.result.querySelector('[data-race-result-detail]').textContent = copy.detail;
  const time = raceElapsedMs(run, Date.now());
  const best = record.best[run.raceId];
  hud.result.querySelector('[data-race-result-time]').textContent = run.status === 'won'
    ? `Your time ${formatRaceTime(time)}${best ? ` · Best ${formatRaceTime(best)}` : ''}${run.falls ? ` · ${run.falls} fall${run.falls === 1 ? '' : 's'}` : ''}`
    : run.status === 'lost' ? `You were ${Math.round(run.playerProgress * 100)}% of the way there.` : '';
  hud.countdown.hidden = true;
  hud.ready.hidden = true;
  hud.result.hidden = false;
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
  hud.result.hidden = true;
  hud.bar.hidden = true;
  hud.countdown.hidden = true;
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
/* HUD + QA attributes                                                */
/* ------------------------------------------------------------------ */

function renderHud(engine, force = false) {
  if (!hud || !run) return;
  const now = Date.now();
  if (!force && now - lastHudAt < 90) return;
  lastHudAt = now;
  const you = Math.round((run.playerProgress || 0) * 100);
  const them = Math.round((run.rivalProgress || 0) * 100);
  hud.bar.querySelector('[data-race-you-pct]').textContent = `${you}%`;
  hud.bar.querySelector('[data-race-rival]').textContent = run.rivalName;
  hud.bar.querySelector('[data-race-rival-pct]').textContent = `${them}%`;
  hud.bar.querySelector('[data-race-you]').style.left = `${you}%`;
  hud.bar.querySelector('[data-race-them]').style.left = `${them}%`;
  hud.bar.querySelector('[data-race-time]').textContent = formatRaceTime(raceElapsedMs(run, now));
  hud.bar.querySelector('[data-race-objective]').textContent =
    run.status === 'staging' || run.status === 'countdown'
      ? RACES[run.raceId].desc
      : run.status === 'running'
        ? (them > you + 8 ? `${run.rivalName} is pulling ahead!` : you > them + 8 ? 'You are in the lead!' : 'Neck and neck!')
        : run.status === 'won' ? 'You won!' : `${run.rivalName} won.`;
  hud.bar.querySelector('[data-race-forfeit]').hidden = !raceIsLive(run);
}

function publish(engine) {
  engine.setData('raceStatus', run ? run.status : 'idle');
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
  engine.setData('raceCourseSource', course ? 'reconstructed' : '');
  if (run && ['won', 'lost', 'forfeit'].includes(run.status)) engine.setData('raceOutcome', run.status);
}

/* ------------------------------------------------------------------ */
/* Dispensers                                                         */
/* ------------------------------------------------------------------ */

function spawnDispenser(engine, point) {
  const { PIXI } = engine;
  const sprite = PIXI.Sprite.from(`${RACE_ICON_DIR}race_ticket_dispenser.png`);
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
  const demo = engine.param('racedemo');
  if (!demo) {
    demoHandled = true;
    return;
  }
  if (RACE_IDS.includes(demo) && playable(demo)) {
    demoHandled = true;
    setTimeout(() => startRace(demo, engine, { useTransition: false }), 300);
  } else if (demo !== 'dispenser') {
    demoHandled = true;
  } else {
    demoHandled = true;
    if ((engine.pc.currants || 0) < 200) engine.pc.currants = 500;
    openStore(engine);
    if (engine.param('raceautoplay') === 'buy') {
      setTimeout(() => {
        buyTicket('race_ticket_space_race', engine);
        closeStore();
        activateTicket('race_ticket_space_race', engine, { delayMs: 1200 });
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
    if (!run) {
      if (record.pendingTicket) {
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
    checkpointSprites = [];
    dispenserTarget = null;
  },

  travelGate() {
    if (run || starting) return { ok: false, msg: "You can't leave in the middle of a race!" };
    return null;
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
    const block = activationBlock(engine);
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

  /** QA / tests. */
  _state() {
    return { run, record, course: course?.id || null };
  },
};
