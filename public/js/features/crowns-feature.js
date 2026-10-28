/**
 * Game of Crowns as a feature module (see js/feature-host.js).
 *
 * Rules: js/game-of-crowns.js. The arena is the archived instance street
 * GHFFV931FRF3TMS (Game of Crowns, template LHV2H026E492IAF) loaded as a
 * normal street; this module restores its five ladders from the location XML
 * (the street importer dropped them), places the four Crown Game Locks, and
 * runs three stand-in players with a platform/ladder navigation graph: they
 * chase whoever holds the crown, and flee when they hold it.
 *
 * The arena's ledges sit up to ~135 px apart, above the remake's 110 px jump,
 * so the arena grants a 1.15x jump (the rivals' graph uses the same reach).
 *
 * QA:
 *   ?autostart=1&racedemo=it_game            enter, auto-ready
 *     &racestage=ready                       stop on the rules card
 *     &raceassist=1                          rivals stand still
 *     &raceautoplay=1                        you start with the crown and walk into play
 *     &crownstart=<seconds>                  pre-fill your crown clock
 *     &crownrival=<seconds>                  pre-fill the first rival's clock; it starts as It (G304 loss splash)
 */

import { crowdScaleX } from '../avatar-anims.js';
import { OVERLAY_USES, playCountdownArt, playWindowOverlay } from '../overlays.js?v=g392-1';
import {
  CROWNS_ID,
  CROWNS_LADDERS,
  CROWNS_LOCK_POINTS,
  CROWNS_LOCK_REACH,
  CROWNS_PLAYERS,
  CROWNS_START_POINTS,
  CROWNS_STREET,
  CROWNS_TAG_DISTANCE,
  CROWNS_TAG_REACH_Y,
  CROWNS_TEXT,
  CROWNS_TICKET,
  CROWNS_TITLE,
  CROWNS_WIN_MS,
  beginCrownsCountdown,
  buildNavGraph,
  createCrownsGame,
  crownLockReady,
  crownRemainingSeconds,
  crownsCountdownCue,
  crownsLocked,
  crownsResult,
  crownsStandings,
  findNavPath,
  findNavPathToward,
  nearestNavNode,
  pickupCrownLock,
  placeCrownLocks,
  playLineScreenY,
  tagCrowns,
  tickCrowns,
} from '../game-of-crowns.js?v=crowns-2';
import { RACE_RIVALS } from '../races.js?v=races-4';
import { wallsScreen } from '../street-model.js';
import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';
import { CROWNS_SPLASH, splashFor } from '../game-splash.js?v=g311-1';
import { saveStore } from '../save-store.js?v=mp2-2';
import {
  CROWNS_MP_TEXT,
  crownHolderPos,
  crownMsNow,
  crownsMpBoard,
  crownsMpOutcome,
  normalizeCrownsMatch,
  normalizeCrownsReward,
  normalizeCrownsState,
} from '../crowns-mp.js?v=g334c-1';

const ICON = 'assets/sprites/races/';
const CROWN_DIR = 'assets/sprites/races/crowns/';
const RIVAL_SCALE = 1.35 * 0.4;
const JUMP_SCALE = 1.15;
const AI_SPEED = 3.7; // px per 60 Hz frame (the avatar runs 4.4)


/** Waiting-area ledges above the play line (screen coords) for the 4 starts. */
const START_POINTS = CROWNS_START_POINTS;

/** Four lock spots on ledges below the play line (screen coords). */
const LOCK_POINTS = CROWNS_LOCK_POINTS;

export { CROWNS_LADDERS };

let record = { wins: 0, losses: 0, returnTo: null, pendingTicket: null };
let game = null;
let pending = null;
let nav = null;
let playLineY = 610;
let actors = {};
let crownSprite = null;
let lockSprites = [];
let hud = null;
let resultApplied = false;
let lastHud = 0;
let engineRef = null;
let lastTip = '';
let autoPath = null;

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
.crowns-hud { top: 48px; }
.crowns-board { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; font-size: .82rem; font-weight: 800; }
.crowns-board span { padding: 3px 9px; border-radius: 999px; background: rgba(18,15,14,.68); }
.crowns-board span.is-it { color: #3a240c; background: #ffd55b; }
.crowns-board span.is-you b { text-decoration: underline; }
.crowns-tip { margin: 8px auto 0; max-width: 520px; font-size: clamp(.9rem, 2.4vw, 1.2rem); font-weight: 900;
  text-shadow: 0 2px 0 #472b13, 0 4px 12px rgba(0,0,0,.7); }
.crowns-tip:empty { display: none; }
.crowns-clock { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); display: flex; align-items: center; gap: 6px;
  padding: 2px 12px 2px 4px; border-radius: 999px; color: #3a240c; font-weight: 900; background: rgba(255,247,211,.94); }
.crowns-clock[hidden] { display: none; }
.crowns-clock img { width: 34px; height: auto; }
.crowns-rules { margin: 0 auto 16px; padding: 0; list-style: none; text-align: left; display: inline-block; font-weight: 700; font-size: .9rem; }
.crowns-rules li::before { content: '• '; color: #f2d36c; }
`;

function buildChrome(engine) {
  if (hud || typeof document === 'undefined') return;
  if (!document.getElementById('crowns-feature-style')) {
    const style = el('style', { id: 'crowns-feature-style' });
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const host = document.getElementById('hog-haul-hud')?.parentElement || document.body;
  const bar = el('section', { id: 'crowns-hud', class: 'hog-haul-hud crowns-hud', hidden: true, 'aria-live': 'polite' }, `
    <div class="crowns-board" data-crowns-board></div>
    <p class="crowns-tip" data-crowns-tip></p>
    <div class="crowns-clock" data-crowns-clock hidden><img src="${CROWN_DIR}game_crown_unlocked.png" alt="" /><span data-crowns-clock-text></span></div>`);
  const ready = el('div', { id: 'crowns-ready', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'crowns-ready-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-ready-card">
      <img class="game-logo" src="assets/sprites/overlays/game_of_crowns_logo@1.5x.webp" alt="" />
      <p>${CROWNS_TITLE}</p>
      <h2 id="crowns-ready-title">Hold the crown for 60 seconds to win</h2>
      <ul class="crowns-rules">${CROWNS_TEXT.rules.map((r) => `<li>${r}</li>`).join('')}</ul><br />
      <button type="button" class="btn-glitch-primary" data-crowns-ready>Click to Start</button>
    </div>`);
  const countdown = el('div', { id: 'crowns-countdown', class: 'hog-haul-countdown', hidden: true });
  // G304: the end is the game splash (engine.gameSplash), not a card of its own.
  for (const node of [bar, ready, countdown]) host.appendChild(node);
  hud = { bar, ready, countdown };
  ready.querySelector('[data-crowns-ready]').addEventListener('click', () => readyUp(engine));
}

/* ------------------------------------------------------------------ */

function rivals() {
  return RACE_RIVALS.slice(0, CROWNS_PLAYERS.min - 1);
}

/** Entry from a Game of Crowns ticket (after the race start delay). */
export async function startCrowns(engine, opts = {}) {
  if (game || pending) return false;
  buildChrome(engine);
  if (engine.streetTsid !== CROWNS_STREET) {
    record.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player.x), y: Math.round(engine.player.y) };
  }
  // Multiplayer (G334): the ticket was spent when the arena opened (crown_match).
  record.pendingTicket = opts.mp ? null : opts.ticket || null;
  pending = { at: Date.now(), mp: opts.mp || null };
  engine.instanceHold = CROWNS_ID;
  engine.save();
  const start = opts.mp?.spawn || START_POINTS[0];
  await engine.enter(CROWNS_STREET, { spawnX: start.x, spawnY: start.y, bypassFeatureGates: true, useTransition: opts.useTransition });
  return true;
}

function setupArena(street, engine) {
  const { PIXI } = engine;
  playLineY = playLineScreenY(street);
  nav = buildNavGraph(engine.platforms || [], wallsScreen(street), { jumpScale: JUMP_SCALE });
  const params = new URLSearchParams(location.search);
  const players = [{ id: 'you', name: 'You' }, ...rivals().map((r) => ({ id: r.name, name: r.name }))];
  const crownStart = Number(params.get('crownstart'));
  if (crownStart > 0) players[0].crownMs = crownStart * 1000;
  // QA (G304): &crownrival=<seconds> pre-fills the first rival's clock and starts it as It (the loss splash).
  const rivalStart = Number(params.get('crownrival'));
  if (rivalStart > 0 && players[1]) players[1].crownMs = rivalStart * 1000;
  game = createCrownsGame({
    now: Date.now(),
    players,
    itId: params.get('raceautoplay') === '1' ? 'you' : rivalStart > 0 && players[1] ? players[1].id : undefined,
  });
  placeCrownLocks(game, LOCK_POINTS);
  resultApplied = false;
  clearTip();
  autoPath = null;
  actors = {};
  rivals().forEach((r, i) => {
    const start = START_POINTS[i + 1];
    let sprite = null;
    let label = null;
    // Each rival is a vector Glitch with its name's look (engine.npcGlitch).
    const npc = engine.npcGlitch?.(r.name) || null;
    if (npc) {
      sprite = npc.sprite;
      sprite.npc = npc;
      sprite.crowdScale = npc.scale;
      sprite.facesRight = true;
      sprite.scale.set(sprite.crowdScale);
      sprite.zIndex = 46;
      sprite.eventMode = 'none';
      engine.entityLayer.addChild(sprite);
      label = new PIXI.Text({ text: r.name, style: { fontFamily: 'Arial', fontSize: 13, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x2a1d14, width: 3 } } });
      label.anchor.set(0.5, 1);
      label.zIndex = 47;
      engine.entityLayer.addChild(label);
    }
    actors[r.name] = { id: r.name, x: start.x, y: start.y, sprite, label, path: [], seg: 0, segT: 0, planIn: 0, facing: 1, mode: 'idle' };
    placeActor(actors[r.name]);
  });
  lockSprites = game.locks.map((lock) => {
    const sprite = new PIXI.Sprite(textureFromUrl(`${CROWN_DIR}crown_game_lock.png`));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(1.2);
    sprite.x = lock.x;
    sprite.y = lock.y - 4;
    sprite.zIndex = 30;
    engine.entityLayer.addChild(sprite);
    return sprite;
  });
  crownSprite = new PIXI.Sprite(textureFromUrl(`${CROWN_DIR}game_crown_unlocked.png`));
  crownSprite.anchor.set(0.5, 1);
  crownSprite.scale.set(0.8);
  crownSprite.zIndex = 60;
  engine.entityLayer.addChild(crownSprite);
  const player = engine.player;
  player.x = START_POINTS[0].x;
  player.y = START_POINTS[0].y;
  hud.ready.hidden = false;
  hud.bar.hidden = false;
  engine.hideGameSplash?.();
  renderHud(engine, true);
  publish(engine);
  if (params.get('racedemo') === CROWNS_ID && params.get('racestage') !== 'ready') setTimeout(() => readyUp(engine), 600);
}

function readyUp(engine) {
  if (mp) return mpReadyUp(engine);
  if (!game || game.status !== 'staging') return;
  beginCrownsCountdown(game, Date.now());
  hud.ready.hidden = true;
  hud.countdown.hidden = false;
  hud.countdown.textContent = 'READY?';
  engine.playSound('COUNT_DOWN', { volume: 0.55 });
  // G394: Tiny Speck's 321_countdown (shared_instance_manager.js 672-683), the words kept for screen readers.
  playCountdownArt(hud.countdown);
}

function posOf(id, engine) {
  if (id === 'you') return { x: engine.player.x, y: engine.player.y };
  const a = actors[id];
  return a ? { x: a.x, y: a.y } : null;
}

function placeActor(a) {
  if (!a.sprite || a.sprite.destroyed) return;
  a.sprite.x = a.x;
  a.sprite.y = a.y;
  const scale = a.sprite.crowdScale || RIVAL_SCALE;
  a.sprite.scale.set(crowdScaleX(scale, a.facing, a.sprite.facesRight), scale);
  if (a.sprite.npc) {
    // The Glitch's own walk, climb, jump and fall; standing idles (idle4 and random idles).
    a.sprite.npc.setMode(['walk', 'climb', 'jump', 'drop'].includes(a.mode) ? a.mode : 'stand');
  } else if (a.mode === 'walk' || a.mode === 'climb') {
    if (!a.sprite.playing) a.sprite.play();
  } else if (a.sprite.playing) a.sprite.gotoAndStop(a.mode === 'jump' || a.mode === 'drop' ? 3 : 0);
  if (a.label && !a.label.destroyed) {
    a.label.x = a.x;
    a.label.y = a.y - 128;
  }
}

/** Plan: chasers head for the crown; the holder heads somewhere far away. */
function plan(a, engine, now) {
  const from = nearestNavNode(nav, a.x, a.y);
  if (!from) return;
  let to = null;
  if (game.itId === a.id) {
    const threats = Object.keys(game.players).filter((id) => id !== a.id).map((id) => posOf(id, engine)).filter(Boolean);
    let best = -1;
    for (let i = 0; i < 18; i += 1) {
      const n = nav.nodes[Math.floor(Math.random() * nav.nodes.length)];
      if (n.y < playLineY + 10 || n.wall) continue;
      const d = Math.min(...threats.map((t) => Math.hypot(t.x - n.x, (t.y - n.y) * 1.3)));
      if (d > best) {
        const path = findNavPath(nav, from, n);
        if (path.length > 1) {
          best = d;
          to = path;
        }
      }
    }
  } else {
    const target = posOf(game.itId, engine);
    if (target) to = findNavPathToward(nav, from, target.x, target.y);
  }
  a.path = to && to.length > 1 ? to : [];
  a.seg = 1;
  a.segT = 0;
  // Replans count in game time (dt), so slow frames never reset progress.
  a.planIn = (game.itId === a.id ? 1700 : 700) + Math.random() * 400;
}

function segDuration(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (b.mode === 'climb') return Math.max(120, (Math.hypot(dx, dy) / 2.2) * (1000 / 60));
  if (b.mode === 'jump') return Math.max(420, (Math.abs(dx) / AI_SPEED) * (1000 / 60));
  if (b.mode === 'drop') return Math.max(260, Math.sqrt((2 * Math.max(0, dy)) / 0.42) * (1000 / 60));
  return Math.max(30, (Math.hypot(dx, dy) / AI_SPEED) * (1000 / 60));
}

function stepActor(a, dtMs, engine, now) {
  if (new URLSearchParams(location.search).get('raceassist') === '1') return;
  a.planIn = (a.planIn ?? 0) - dtMs;
  if (a.planIn <= 0 || a.seg >= a.path.length) plan(a, engine, now);
  if (a.seg >= a.path.length) {
    a.mode = 'idle';
    placeActor(a);
    return;
  }
  const A = a.path[a.seg - 1];
  const B = a.path[a.seg];
  const dur = segDuration(A, B);
  a.segT += dtMs;
  const u = Math.min(1, a.segT / dur);
  a.x = A.x + (B.x - A.x) * u;
  a.y = A.y + (B.y - A.y) * u;
  if (B.mode === 'jump') a.y -= Math.max(30, A.y - B.y + 40) * 4 * u * (1 - u);
  a.mode = B.mode === 'start' ? 'walk' : B.mode;
  if (B.x !== A.x) a.facing = B.x < A.x ? -1 : 1;
  if (u >= 1) {
    a.seg += 1;
    a.segT = 0;
  }
  placeActor(a);
}

/*
 * G311: it_game_tip is a vp_overlay with duration 3000 (inc_games.js 409-421, 425-438, 566-579,
 * 594-607): each tip shows for 3 s, a new one replaces it (overlay_dismiss, then send), and none
 * outlasts the game. games_end_it_game (613-623) runs games_it_dismiss_overlays (739-747), which
 * takes the crown indicator and the score and king overlays down before the splash.
 */
export const CROWNS_TIP_MS = 3000;
let tipTimer = 0;

function clearTip() {
  clearTimeout(tipTimer);
  tipTimer = 0;
  lastTip = '';
  const node = hud?.bar.querySelector('[data-crowns-tip]');
  if (node) node.textContent = '';
}

function tip(engine, text) {
  if (!text || !hud) return;
  lastTip = text;
  hud.bar.querySelector('[data-crowns-tip]').textContent = text;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(clearTip, CROWNS_TIP_MS);
}

function handleEvents(events, engine) {
  for (const e of events) {
    if (e.type === 'started') {
      hud.countdown.classList.add('is-go');
      hud.countdown.textContent = 'GO!';
      setTimeout(() => {
        if (game?.status === 'running') hud.countdown.hidden = true;
      }, 650);
      engine.playSound('READY', { volume: 0.65 });
      record.pendingTicket = null;
      engine.save();
      tip(engine, game.itId === 'you' ? CROWNS_TEXT.youreItAbove : `${game.players[game.itId].name} has the crown! Tag them to steal it.`);
    }
    // G313: games_it_game_gate 557-579: the holder going down through the play line gets "Stay it for
    // 60 seconds, and you win!" with a new 60 s apiSetTimer. it_game_tick (groups/global_game.js 228-249)
    // still ends the game when crown_time plus this stretch reaches 60, so the clock keeps its total.
    if (e.type === 'entered_play' && e.id === 'you' && e.isIt) tip(engine, CROWNS_TEXT.stayIt);
    if (e.type === 'exited_play' && e.id === 'you' && e.isIt) tip(engine, CROWNS_TEXT.exited);
    if (e.type === 'won') finish(engine);
  }
}

function passCrown(from, to, engine) {
  const p = game.players;
  if (to === 'you') {
    tip(engine, p.you.below ? CROWNS_TEXT.youreIt(crownRemainingSeconds(game, 'you')) : CROWNS_TEXT.youreItAbove);
    engine.playSound('YOU_TAKE_CROWN', { volume: 0.55 });
  } else if (from === 'you') {
    tip(engine, p.you.below ? CROWNS_TEXT.notIt : CROWNS_TEXT.notItAbove);
    engine.playSound('YOU_LOSE_CROWN', { volume: 0.45 });
  } else {
    tip(engine, `${p[to].name} stole the crown from ${p[from].name}!`);
  }
  const fromPos = posOf(from, engine);
  if (from !== 'you' && actors[from]) actors[from].planIn = 0;
  if (to !== 'you' && actors[to]) actors[to].planIn = 0;
  if (fromPos) engine.floatText(fromPos.x, fromPos.y - 150, 'Tag!', 0xffd55b);
}

function tick(dtMs, now, engine) {
  const below = {};
  for (const id of Object.keys(game.players)) {
    const pos = posOf(id, engine);
    below[id] = Boolean(pos && pos.y >= playLineY);
  }
  handleEvents(tickCrowns(game, now, below), engine);
  if (game.status === 'countdown') hud.countdown.textContent = crownsCountdownCue(game, now);
  const player = engine.player;
  if (game.status === 'staging' || game.status === 'countdown') {
    player.x = START_POINTS[0].x;
  }
  if (game.status !== 'running') return;

  for (const a of Object.values(actors)) stepActor(a, dtMs, engine, now);

  if (engine.param('raceautoplay') === '1' && game.itId === 'you') {
    if (!autoPath) {
      const from = nearestNavNode(nav, player.x, player.y);
      const to = nearestNavNode(nav, 2600, 1770);
      autoPath = { path: findNavPath(nav, from, to), seg: 1, t: 0 };
    }
    const { path } = autoPath;
    if (autoPath.seg < path.length) {
      const A = path[autoPath.seg - 1];
      const B = path[autoPath.seg];
      autoPath.t += dtMs;
      const u = Math.min(1, autoPath.t / segDuration(A, B));
      player.x = A.x + (B.x - A.x) * u;
      player.y = A.y + (B.y - A.y) * u;
      player.vx = 0;
      player.vy = 0;
      if (u >= 1) {
        autoPath.seg += 1;
        autoPath.t = 0;
      }
    }
  }

  // Tags: anyone touching the holder.
  const holder = posOf(game.itId, engine);
  if (holder) {
    for (const id of Object.keys(game.players)) {
      if (id === game.itId) continue;
      const p = posOf(id, engine);
      if (!p || Math.abs(p.x - holder.x) > CROWNS_TAG_DISTANCE || Math.abs(p.y - holder.y) > CROWNS_TAG_REACH_Y) continue;
      const from = game.itId;
      const out = tagCrowns(game, id, from, now);
      if (out) {
        passCrown(out.from, out.to, engine);
        break;
      }
    }
  }

  // Crown Game Locks.
  game.locks.forEach((lock, i) => {
    const ready = crownLockReady(lock, now);
    if (lockSprites[i]) lockSprites[i].visible = ready;
    if (!ready) return;
    for (const id of Object.keys(game.players)) {
      const p = posOf(id, engine);
      if (!p || Math.abs(p.x - lock.x) > CROWNS_LOCK_REACH.x || Math.abs(p.y - lock.y) > CROWNS_LOCK_REACH.y) continue;
      const out = pickupCrownLock(game, id, i, now);
      if (out.ok) {
        if (id === 'you') {
          engine.floatText(lock.x, lock.y - 90, out.text, 0xb8f08a);
          engine.playSound('QUOIN_GOT', { volume: 0.55 });
        }
        break;
      }
    }
  });

  if (crownSprite && holder) {
    const locked = crownsLocked(game, game.itId, now);
    const tex = `${CROWN_DIR}game_crown_${locked ? 'locked' : 'unlocked'}.png`;
    if (crownSprite._tex !== tex) {
      crownSprite.texture = textureFromUrl(tex);
      crownSprite._tex = tex;
    }
    crownSprite.x = holder.x;
    crownSprite.y = holder.y - 128 - (game.itId === 'you' ? 6 : 12);
    crownSprite.visible = true;
  }
}

function finish(engine) {
  if (resultApplied) return;
  resultApplied = true;
  const res = crownsResult(game, 'you');
  const pc = engine.pc;
  // inc_games.js 672: stats_add_xp(200, false) takes the mood bonus.
  const xp = res.won ? grantMoodXp(pc, res.reward.xp) : 0;
  if (res.won) {
    pc.currants = (pc.currants || 0) + res.reward.currants;
    record.wins += 1;
    engine.achievement('it_game:won', 1);
    engine.pushActivity(`You won the Game of Crowns! +${xp} iMG · +${res.reward.currants} currants.`);
    engine.playSound('YOU_WIN', { volume: 0.7 });
  } else {
    record.losses += 1;
    engine.achievement('it_game:lost', 1);
    engine.pushActivity(`${res.winnerName} won the Game of Crowns.`);
    engine.playSound('YOU_LOSE', { volume: 0.7 }); // inc_games.js 695
  }
  if (res.secondsWithCrown > 0) engine.achievement('it_game:seconds_with_crown', res.secondsWithCrown);
  // The remake's own crown-time line (no source) goes to the activity log, not the splash.
  if (!res.won) engine.pushActivity(`You held the crown for ${res.secondsWithCrown} seconds.`);
  // G304: games_end_it_game 633-700: a game_splash_screen, tsid it_game,
  // game_of_crowns_winner at you_winner with rays, or other_winner with the
  // winner's name (text_delta_y 25), then Play Again and Leave the Game (w 150,
  // does_close, games_leave_instance_overlay 'again' / 'leave'). The prize
  // (200 iMG and 50 currants) is drawn in the art.
  engine.gameSplash?.({
    key: CROWNS_SPLASH.key,
    ...splashFor(res.won, res.winnerName),
    textDeltaY: CROWNS_SPLASH.textDeltaY,
    buttons: [
      { label: CROWNS_SPLASH.againLabel, w: CROWNS_SPLASH.buttonW, value: 'again', onClick: () => playAgain(engine) },
      { label: CROWNS_SPLASH.leaveLabel, w: CROWNS_SPLASH.buttonW, value: 'leave', onClick: () => leave(engine) },
    ],
  });
  hud.countdown.hidden = true;
  // G311: the tip, the board and the clock go before the splash (games_it_dismiss_overlays 739-747).
  clearTip();
  hud.bar.hidden = true;
  if (crownSprite) crownSprite.visible = false;
  engine.updateHud();
  engine.save();
  publish(engine);
}

async function leave(engine) {
  const back = record.returnTo;
  engine.hideGameSplash?.();
  hud.bar.hidden = true;
  game = null;
  pending = null;
  record.returnTo = null;
  engine.instanceHold = null;
  engine.save();
  if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  publish(engine);
}

function playAgain(engine) {
  engine.hideGameSplash?.();
  game = null;
  pending = { at: Date.now() };
  engine.enter(CROWNS_STREET, { spawnX: START_POINTS[0].x, spawnY: START_POINTS[0].y, bypassFeatureGates: true, useTransition: false });
}

/**
 * G396 games_it_game_start_scores (inc_games.js 872-893): who holds the crown, as Tiny Speck's
 * vp_overlay indicators: crown_game_indicator_you 140 wide at x 70 px, y 88% when you do,
 * crown_game_indicator_someone_else 100 wide at x 94%, y 91% when someone else does (duration 0,
 * swapped at each change, dismissed at the end).
 */
const CROWN_INDICATORS = Object.freeze({
  you: { key: 'crown_game_indicator_you', ...OVERLAY_USES.crown_game_indicator_you },
  other: { key: 'crown_game_indicator_someone_else', ...OVERLAY_USES.crown_game_indicator_someone_else },
});
let crownIndicator = null; // { kind, handle }

function syncCrownIndicator(kind) {
  if ((crownIndicator?.kind || null) === (kind || null) && !crownIndicator?.handle?.cancelled) return;
  crownIndicator?.handle?.stop();
  crownIndicator = null;
  const ind = CROWN_INDICATORS[kind];
  if (!ind) return;
  const handle = playWindowOverlay(ind.key, {
    wh: ind.wh,
    durationMs: 0,
    place: ind.xPx != null
      ? (meta, r) => windowPlacementAt(meta, r, ind)
      : null,
    x: ind.x,
    y: ind.y,
  });
  crownIndicator = { kind, handle };
}

/** x in source px from the view's left (scaled with the view), y a fraction. */
function windowPlacementAt(meta, r, ind) {
  const [sw, sh] = meta.stage;
  const [bx, by, bw, bh] = meta.box;
  const scale = (ind.wh / Math.max(sw, sh)) * (r.scale || 1);
  const left = ind.xPx * (r.scale || 1) - (sw * scale) / 2;
  const top = r.height * ind.y - (sh * scale) / 2;
  return { left: left + bx * scale, top: top + by * scale, width: bw * scale, height: bh * scale };
}

/** G396 dismissOverlaysAndStart (shared_instance_manager.js 247-257): game_of_crowns_throbber, 200 wide, centred, while it waits. */
let crownsThrobber = null;

function syncCrownsThrobber(waiting) {
  if (waiting && (!crownsThrobber || crownsThrobber.cancelled)) {
    const t = OVERLAY_USES.game_of_crowns_throbber;
    crownsThrobber = playWindowOverlay('game_of_crowns_throbber', { wh: t.wh, x: t.x, y: t.y, durationMs: 0 });
    hud?.countdown.classList.add('has-throbber');
  } else if (!waiting && crownsThrobber) {
    crownsThrobber.stop();
    crownsThrobber = null;
    hud?.countdown.classList.remove('has-throbber');
  }
}

function renderHud(engine, force = false) {
  if (!hud || !game) return;
  syncCrownIndicator(game.status === 'running' && game.itId ? (game.itId === 'you' ? 'you' : 'other') : null);
  const now = Date.now();
  if (!force && now - lastHud < 150) return;
  lastHud = now;
  hud.bar.querySelector('[data-crowns-board]').innerHTML = crownsStandings(game)
    .map((row) => `<span class="${row.it ? 'is-it' : ''} ${row.id === 'you' ? 'is-you' : ''}"><b>${row.name}</b> ${row.seconds}s${row.it ? ' 👑' : ''}</span>`)
    .join('');
  const clock = hud.bar.querySelector('[data-crowns-clock]');
  const mine = game.itId === 'you';
  clock.hidden = !mine || game.status !== 'running';
  if (mine) {
    clock.querySelector('[data-crowns-clock-text]').textContent = `${crownRemainingSeconds(game, 'you')}s to win${game.players.you.below ? '' : ' (below the play line)'}`;
    clock.querySelector('img').src = `${CROWN_DIR}game_crown_${crownsLocked(game, 'you', now) ? 'locked' : 'unlocked'}.png`;
  }
}

function publish(engine) {
  engine.setData('crownsStatus', game ? game.status : pending ? 'entering' : 'idle');
  engine.setData('crownsIt', game ? game.itId || '' : '');
  engine.setData('crownsYouSeconds', game ? String(Math.floor(game.players.you.crownMs / 1000)) : '0');
  engine.setData('crownsWinner', game?.winner || '');
  engine.setData('crownsTip', lastTip);
  engine.setData('crownsPlayers', game ? String(Object.keys(game.players).length) : '0');
  engine.setData('crownsLadders', String(CROWNS_LADDERS.length));
  engine.setData('crownsNavNodes', nav ? String(nav.nodes.length) : '0');
  engine.setData('crownsRivals', Object.values(actors).map((a) => `${a.id}@${Math.round(a.x)},${Math.round(a.y)}:${game ? Math.floor((game.players[a.id]?.crownMs || 0) / 1000) : 0}`).join('|'));
  // Multiplayer (G334): status:round:holder:my crown seconds, and the board.
  if (mp || engine.mode === 'multiplayer') {
    const st = mp?.state;
    engine.setData('crownsMp', mp ? `${mp.status}:${mp.round}:${st?.it || 0}:${Math.floor(crownMsNow(st, mp.myId, Date.now(), mp.winMs) / 1000)}` : 'idle');
    engine.setData('crownsMpBoard', st ? crownsMpBoard(st, mp.myId, Date.now(), mp.winMs).map((r) => `${r.name}:${r.seconds}${r.it ? '*' : ''}`).join('|') : '');
  }
}

/* ------------------------------------------------------------------ */
/* Multiplayer (G334): real players (js/crowns-mp.js, groddle-afternoon-server/crowns.go) */
/* ------------------------------------------------------------------ */

/*
 * The server holds the crown: who has it, the tags, the locks, the clock
 * below the play line and the winner, from where everyone stands. This
 * client only shows it, sends Click to Start / Play Again / Leave, and
 * applies its own rewards from what the server says: the winner's 200 iMG
 * and 50 currants (the currants already in the site's ledger, applied once
 * through ledgerReceipt), it_game:won / lost / seconds_with_crown. Solo never
 * reaches any of this (mp is only set from a crown_match).
 *
 * G334 (lane RACES3): a reload is a logout (instance.js player_logout 380-394:
 * playerLeft and games_auto_leave): the page comes back where the challenge
 * was made and is out of the game, which goes on for the rest (global_game.js
 * playerLeft 803-813). A page holding a spent ticket it never saw become a
 * game asks the server (crown_pending -> crown_ticket, as races-feature's
 * race_pending): a street change never refunds in multiplayer. The dead do not
 * play (race_ticket_it_game.js:119; location.js onPlayerEnter 85-89 sends them
 * back to Hell): a crown_match that reaches a dead player is left at once.
 */
let mp = null; // { match, street, slot, spawn, players, playLine, locks, winMs, myId, status, round, state, ready, acked, readyAt, below, result }
let mpClient = null;
const mpInvites = new Map(); // challenger id -> prompt uid
let mpWaitUid = null;
let mpMustWaitUid = null;
let mpChallenging = false;
let mpAccepting = false;
let mpStarting = false;
let mpAsked = false; // crown_pending sent, no crown_ticket yet
let mpLast = '';
/** race_ticket_it_game.js:119, the ticket's words for a dead player. */
const MP_TOO_DEAD = 'You are too dead to be racing around.';
const MP_LEFT = 'You left the Game of Crowns.';
let mpLeftNote = false; // this page reloaded out of an arena (reloadLocation)
let mpLeftTold = false; // the player has been told they left this game
let mpAppliedIds = []; // crown_reward ids this save applied (kept in the slice)
const mpCounted = new Set(); // match:round counters applied this session
const mpApplying = new Set();
const MP_APPLIED_KEEP = 20;
const BLOCKED_SAVES = new Set(['conflict', 'signed-out', 'error', 'offline']);

function isMp(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient'));
}

function mpNote(engine, what) {
  mpLast = what;
  engine.setData?.('crownsMpLast', what);
}

function mpDead(engine) {
  return engine?.query?.('isDead', engine) === true;
}

/**
 * G349 for crowns: a spent ticket this page holds for a challenge it never
 * saw end (a reload, a dropped socket, a croak or teleport while it waited).
 * The server says what became of it (crown_ticket, or crown_failed for a
 * challenge still open); entering a street never refunds in multiplayer.
 */
function mpAskPending(engine) {
  const c = mpClient;
  if (!c || c.state !== 'online' || mpAsked || !record.pendingTicket || mpBusy()) return;
  mpAsked = c.send('crown_pending', {}) !== false;
  mpNote(engine, 'pending');
}

function mpBusy() {
  return Boolean(mp || mpStarting || mpChallenging || mpAccepting || game || pending);
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
 * race_ticket.js activate for a Game of Crowns Ticket in multiplayer:
 * challenge the street (inc_games.js games_invite_create). races-feature
 * routes the ticket here. True when the challenge went out.
 */
export function crownsMpChallenge(classTsid, engine) {
  if (classTsid !== CROWNS_TICKET || !isMp(engine)) return false;
  if (mpBusy()) {
    engine.toast('You are already racing!', 2400);
    return false;
  }
  const c = mpAttach(engine);
  if (!c || c.state !== 'online' || !c.street) {
    engine.toast(CROWNS_MP_TEXT.offline, 2600);
    return false;
  }
  // race_ticket.js:121: the verb is disabled with nobody else here.
  if (!c.players.length) {
    engine.toast(CROWNS_MP_TEXT.alone, 2600);
    return false;
  }
  if (countItem(engine.inv, classTsid) < 1) return false;
  removeItem(engine.inv, classTsid, 1);
  record.pendingTicket = classTsid;
  engine.updateHud();
  engine.save();
  engine.pushActivity('You activated a Game of Crowns Ticket.');
  mpChallenging = true;
  if (!c.send('crown_challenge', {})) {
    mpChallenging = false;
    mpRefund(engine);
    return false;
  }
  mpNote(engine, 'challenge');
  publish(engine);
  return true;
}

function mpAttach(engine) {
  if (mpClient) return mpClient;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  mpClient = c;
  c.on('msg:crown_challenged', (msg) => {
    const from = Number(msg.from?.id) || 0;
    if (!from || from === c.me?.id) return;
    if (mpInvites.has(from)) engine.removePrompt?.(mpInvites.get(from));
    // inc_games.js 2392 broadcastActionRequest('game_accept', …): accept from the prompt.
    const uid = engine.prompt?.({
      text: String(msg.text || ''),
      choices: [{ label: CROWNS_MP_TEXT.accept, value: 'accept' }, { label: CROWNS_MP_TEXT.decline, value: 'no' }],
      timeout: Math.max(1, Math.min(60, Number(msg.timeout) || 60)),
      iconButtons: true,
      onChoice: (v) => {
        mpInvites.delete(from);
        if (v !== 'accept') return;
        if (mpBusy()) {
          engine.toast('You are already racing!', 2400);
          return;
        }
        mpAccepting = true;
        if (!c.send('crown_accept', { from })) mpAccepting = false;
        publish(engine);
      },
      onTimeout: () => mpInvites.delete(from),
    });
    mpInvites.set(from, uid || '');
    mpNote(engine, `challenged:${from}`);
  });
  c.on('msg:crown_unchallenged', (msg) => {
    const from = Number(msg.from) || 0;
    const uid = mpInvites.get(from);
    if (uid) engine.removePrompt?.(uid);
    mpInvites.delete(from);
    if (msg.text) engine.pushActivity(String(msg.text));
  });
  c.on('msg:crown_waiting', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    mpStarting = true;
    if (mpWaitUid) engine.removePrompt?.(mpWaitUid);
    // inc_games.js 2396-2405: "Waiting for other players..." with OK, for 60 s.
    mpWaitUid = engine.prompt?.({
      text: String(msg.text || 'Waiting for other players...'),
      choices: [{ label: CROWNS_MP_TEXT.ok, value: 'ok' }],
      timeout: Math.max(1, Math.min(60, Number(msg.timeout) || 60)),
      onChoice: () => { mpWaitUid = null; },
      onTimeout: () => { mpWaitUid = null; },
    }) || null;
    mpNote(engine, `waiting:${Number(msg.have) || 0}/${Number(msg.need) || 0}`);
    publish(engine);
  });
  c.on('msg:crown_failed', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    mpStarting = false;
    mpClearPrompts(engine);
    if (msg.refund === true) {
      mpRefund(engine);
      engine.prompt?.({ text: String(msg.text || ''), choices: [{ label: CROWNS_MP_TEXT.dagnabit, value: 'ok' }], timeout: 10 });
    } else if (msg.text) engine.pushActivity(String(msg.text));
    mpNote(engine, `failed:${msg.refund === true ? 'refund' : 'no'}`);
    publish(engine);
  });
  c.on('msg:crown_refused', (msg) => {
    const text = String(msg.text || '');
    if (mpChallenging) {
      mpChallenging = false;
      mpRefund(engine);
      engine.toast(text, 3000);
    } else if (mpAccepting) {
      mpAccepting = false;
      // inc_games.js 2466-2470: the late accepter's prompt.
      if (msg.why === 'full') engine.prompt?.({ text, choices: [{ label: CROWNS_MP_TEXT.dagnabit, value: 'ok' }], timeout: 10 });
      else engine.toast(text, 3000);
    } else if (text) engine.toast(text, 2600);
    mpNote(engine, `refused:${msg.why || ''}`);
    publish(engine);
  });
  c.on('msg:crown_starting', (msg) => {
    mpChallenging = false;
    mpAccepting = false;
    mpStarting = true;
    mpClearPrompts(engine);
    for (const uid of mpInvites.values()) if (uid) engine.removePrompt?.(uid);
    mpInvites.clear();
    // inc_games.js 2516-2557: the race_start_delay overlay, 5 s.
    engine.toast(String(msg.text || ''), Math.max(1000, Number(msg.in) || 5000));
    engine.pushActivity(String(msg.text || ''));
    engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
    mpNote(engine, 'starting');
    publish(engine);
  });
  c.on('msg:crown_match', (msg) => {
    if (mpDead(engine) && !mp && !game && !pending) {
      // Croaked while the start ran: back to Hell, out of the game (the ticket was spent on it).
      if (msg?.match) c.send('crown_leave', { match: String(msg.match) });
      mpStarting = false;
      record.pendingTicket = null;
      engine.toast(MP_TOO_DEAD, 3600);
      engine.pushActivity(MP_TOO_DEAD);
      engine.save();
      mpNote(engine, 'dead');
      publish(engine);
      return;
    }
    const info = normalizeCrownsMatch(msg);
    mpLeftTold = false;
    if (!info || mp || game || pending) {
      if (msg?.match) c.send('crown_leave', { match: String(msg.match) });
      mpStarting = false;
      return;
    }
    mp = { ...info, myId: c.me?.id ?? null, status: 'waiting', round: 1, state: null, ready: false, acked: false, readyAt: 0, below: false, result: null, startAt: 0 };
    mpStarting = false;
    mpNote(engine, `match:${info.match}`);
    // The ticket is spent once the arena opens (as solo and the races).
    record.pendingTicket = null;
    Promise.resolve(startCrowns(engine, { mp: info, useTransition: true })).finally(() => publish(engine));
  });
  c.on('msg:crown_ready_state', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    if ((msg.ready || []).map(Number).includes(mp.myId)) mp.acked = true;
    if (msg.text) engine.pushActivity(String(msg.text));
    mpNote(engine, `ready:${(msg.ready || []).length}`);
  });
  c.on('msg:crown_soon', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    mp.status = 'soon';
    mp.acked = true;
    if (mpMustWaitUid) engine.removePrompt?.(mpMustWaitUid);
    mpMustWaitUid = null;
    engine.hideGameSplash?.();
    if (hud) {
      hud.ready.hidden = true;
      hud.countdown.hidden = false;
      hud.countdown.classList.remove('is-go');
      hud.countdown.textContent = String(msg.text || 'YAY! THE GAME IS STARTING SOON.');
    }
    engine.playSound('GAME_STARTING_SOON', { volume: 0.5 });
    mpNote(engine, 'soon');
    publish(engine);
  });
  c.on('msg:crown_round', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    // Play Again: a new round, everyone back at the starts (games_leave_instance 'again' 2212-2233).
    mp.round = Math.max(1, Number(msg.round) || mp.round + 1);
    mp.state = null;
    mp.result = null;
    mp.below = false;
    resultApplied = false;
    clearTip();
    engine.hideGameSplash?.();
    const spawn = mp.spawn || START_POINTS[0];
    engine.player.x = spawn.x;
    engine.player.y = spawn.y;
    engine.player.vx = 0;
    engine.player.vy = 0;
    if (hud) hud.bar.hidden = false;
    mpNote(engine, `round:${mp.round}`);
  });
  c.on('msg:crown_countdown', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    mp.status = 'countdown';
    mp.startAt = Date.now() + Math.max(0, Number(msg.in) || 4000);
    if (hud) {
      hud.ready.hidden = true;
      hud.countdown.hidden = false;
      hud.countdown.classList.remove('is-go');
      hud.countdown.textContent = 'READY?';
      playCountdownArt(hud.countdown);
    }
    engine.playSound('COUNT_DOWN', { volume: 0.55 });
    mpNote(engine, 'countdown');
  });
  c.on('msg:crown_go', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    mp.state = normalizeCrownsState(msg);
    mp.status = 'running';
    mp.below = engine.player.y >= playLineY;
    if (hud) {
      hud.countdown.classList.add('is-go');
      hud.countdown.textContent = 'GO!';
      setTimeout(() => {
        if (mp?.status === 'running' && hud) hud.countdown.hidden = true;
      }, 650);
    }
    engine.playSound('READY', { volume: 0.65 });
    const it = mp.state.it;
    if (it === mp.myId) {
      tip(engine, CROWNS_TEXT.youreItAbove);
      engine.playSound('YOU_TAKE_CROWN', { volume: 0.55 });
    } else if (it) tip(engine, CROWNS_MP_TEXT.has(mpName(it)));
    mpNote(engine, `go:${it}`);
    publish(engine);
  });
  c.on('msg:crown_state', (msg) => mpState(engine, msg));
  c.on('msg:crown_tag', (msg) => {
    if (!mpState(engine, msg)) return;
    const from = Number(msg.from) || 0;
    const to = Number(msg.to) || 0;
    // games_is_it / games_is_not_it: the tip, the sound (CROWN_CHANGES_HANDS for the rest, setIt 220).
    if (to === mp.myId) {
      tip(engine, mp.below ? CROWNS_TEXT.youreIt(Math.ceil((mp.winMs - crownMsNow(mp.state, to, Date.now(), mp.winMs)) / 1000)) : CROWNS_TEXT.youreItAbove);
      engine.playSound('YOU_TAKE_CROWN', { volume: 0.55 });
    } else if (from === mp.myId) {
      tip(engine, mp.below ? CROWNS_TEXT.notIt : CROWNS_TEXT.notItAbove);
      engine.playSound('YOU_LOSE_CROWN', { volume: 0.45 });
    } else {
      tip(engine, CROWNS_MP_TEXT.stole(String(msg.toName || mpName(to)), String(msg.fromName || mpName(from))));
      engine.playSound('CROWN_CHANGES_HANDS', { volume: 0.45 });
    }
    const pos = crownHolderPos(from, mp.myId, engine.player, mpClient?.players);
    if (pos) engine.floatText(pos.x, pos.y - 150, 'Tag!', 0xffd55b);
    mpNote(engine, `tag:${from}>${to}`);
  });
  c.on('msg:crown_lock', (msg) => {
    if (!mpState(engine, msg)) return;
    const x = Number(msg.x);
    const y = Number(msg.y);
    // crown_game_lock.js onPlayerCollision: the location's quoin_got "+4 time"; QUOIN_GOT for the toucher.
    if (Number.isFinite(x) && Number.isFinite(y)) engine.floatText(x, y - 90, CROWNS_TEXT.lockGot, 0xb8f08a);
    if (Number(msg.id) === mp.myId) engine.playSound('QUOIN_GOT', { volume: 0.55 });
    mpNote(engine, `lock:${msg.i}:${msg.id}:${msg.locked === true}`);
  });
  c.on('msg:crown_end', (msg) => mpFinish(engine, msg));
  c.on('msg:crown_left', (msg) => {
    // Leaving a running game: the crown time you had goes on your badges (playerLeft -> games_is_not_it).
    const key = `${msg.match}:${msg.round}`;
    // Out of the arena with the game still on (a reload, another street): it goes on without you
    // (global_game.js playerLeft 803-813).
    if (!mp && !mpLeftTold && !mpCounted.has(key)) engine.pushActivity(MP_LEFT);
    mpLeftTold = true;
    const seconds = Math.max(0, Math.floor(Number(msg.seconds) || 0));
    if (!mpCounted.has(key)) {
      mpCounted.add(key);
      if (seconds > 0) engine.achievement('it_game:seconds_with_crown', seconds);
    }
  });
  c.on('msg:crown_removed', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    engine.pushActivity(String(msg.text || ''));
    engine.toast(String(msg.text || ''), 3600);
    mp = null;
    leave(engine);
  });
  c.on('msg:crown_reward', (msg) => mpApplyReward(engine, msg));
  // G349 for crowns: what became of a spent ticket's challenge, when this page asks (mpAskPending).
  c.on('msg:crown_ticket', (msg) => {
    mpAsked = false;
    if (!record.pendingTicket || mp) return;
    if (msg.refund === true) {
      mpRefund(engine);
      engine.toast(String(msg.text || 'Your game never started, so your ticket was returned.'), 3600);
    } else {
      record.pendingTicket = null;
      engine.save();
    }
    mpNote(engine, `ticket:${msg.refund === true ? 'refund' : 'spent'}`);
    publish(engine);
  });
  // Every (re)connect: the server called off any open challenge this page had (crowns.go onDisconnect).
  c.on('hello', () => {
    mpAsked = false;
    if (!mp && (mpChallenging || mpAccepting || mpStarting)) {
      // A filled challenge waits for its start, which counts whoever is online then.
      mpChallenging = false;
      mpAccepting = false;
      mpStarting = false;
      mpClearPrompts(engine);
    }
    mpAskPending(engine);
  });
  if (c.state === 'online') mpAskPending(engine);
  return c;
}

function mpName(id) {
  return mp?.state?.scores?.find((r) => r.id === id)?.name || mp?.players?.find((p) => p.id === id)?.name || 'Someone';
}

/** crown_state and the state in crown_tag / crown_lock. False when it is not this game's. */
function mpState(engine, msg) {
  if (!mp || msg?.match !== mp.match) return false;
  const st = normalizeCrownsState(msg);
  if (!st || st.round !== mp.round) return false;
  mp.state = st;
  if (mp.status !== 'running' && mp.status !== 'done') mp.status = 'running';
  return true;
}

function mpSetupArena(street, engine) {
  const { PIXI } = engine;
  playLineY = Number.isFinite(mp.playLine) ? mp.playLine : playLineScreenY(street);
  resultApplied = false;
  clearTip();
  actors = {};
  lockSprites = (mp.locks.length ? mp.locks : LOCK_POINTS).map((lock) => {
    const sprite = new PIXI.Sprite(textureFromUrl(`${CROWN_DIR}crown_game_lock.png`));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(1.2);
    sprite.x = lock.x;
    sprite.y = lock.y - 4;
    sprite.zIndex = 30;
    engine.entityLayer.addChild(sprite);
    return sprite;
  });
  crownSprite = new PIXI.Sprite(textureFromUrl(`${CROWN_DIR}game_crown_unlocked.png`));
  crownSprite.anchor.set(0.5, 1);
  crownSprite.scale.set(0.8);
  crownSprite.zIndex = 60;
  crownSprite.visible = false;
  engine.entityLayer.addChild(crownSprite);
  const spawn = mp.spawn || START_POINTS[0];
  engine.player.x = spawn.x;
  engine.player.y = spawn.y;
  hud.ready.hidden = false;
  hud.bar.hidden = false;
  engine.hideGameSplash?.();
  mpRenderHud(engine, true);
  mpNote(engine, 'arena');
  publish(engine);
}

/** Click to Start: tell the server, then wait for the others (dismissOverlaysAndStart 231-342). */
function mpReadyUp(engine) {
  if (!mp || mp.status !== 'waiting' || mp.ready) return;
  mp.ready = true;
  mp.readyAt = Date.now();
  hud.ready.hidden = true;
  mpClient?.send('crown_ready', { match: mp.match });
  mpMustWait(engine);
  mpNote(engine, 'clicked');
  publish(engine);
}

/** "You must wait for more players before this game can begin." with Leave (shared_instance_manager.js 259-266). */
function mpMustWait(engine) {
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.textContent = CROWNS_MP_TEXT.mustWait;
  const round = mp.round;
  setTimeout(() => {
    if (mpMustWaitUid || !mp || mp.round !== round || (mp.status !== 'waiting' && mp.status !== 'done')) return;
    mpMustWaitUid = engine.prompt?.({
      text: CROWNS_MP_TEXT.mustWait,
      choices: [{ label: CROWNS_MP_TEXT.leave, value: 'leave' }],
      onChoice: (v) => {
        mpMustWaitUid = null;
        if (v === 'leave') mpLeave(engine);
      },
    }) || null;
  }, 700);
}

function mpTick(dtMs, now, engine) {
  const player = engine.player;
  if (mp.status === 'waiting' || mp.status === 'soon' || mp.status === 'countdown') {
    const spawn = mp.spawn || START_POINTS[0];
    player.x = spawn.x;
  }
  if (mp.status === 'countdown' && hud) hud.countdown.textContent = crownsCountdownCue({ status: 'countdown', startAt: mp.startAt }, now) || 'GO!';
  // Click to Start counts once you stand in the arena: ask again until the server says so.
  if (mp.ready && !mp.acked && mp.status === 'waiting' && mpClient?.street === mp.street && now - mp.readyAt >= 1500) {
    mp.readyAt = now;
    mpClient.send('crown_ready', { match: mp.match });
  }
  const st = mp.state;
  if (mp.status === 'running' && st) {
    const below = player.y >= playLineY;
    if (below !== mp.below && st.it === mp.myId) {
      // games_it_game_gate 557-607: the holder through the play line, or back up.
      tip(engine, below ? CROWNS_TEXT.stayIt : CROWNS_TEXT.exited);
    }
    mp.below = below;
  }
  const holder = st ? crownHolderPos(st.it, mp.myId, player, mpClient?.players) : null;
  if (crownSprite && !crownSprite.destroyed) {
    if (holder && mp.status === 'running') {
      const locked = now < st.lockedUntil;
      const tex = `${CROWN_DIR}game_crown_${locked ? 'locked' : 'unlocked'}.png`;
      if (crownSprite._tex !== tex) {
        crownSprite.texture = textureFromUrl(tex);
        crownSprite._tex = tex;
      }
      crownSprite.x = holder.x;
      crownSprite.y = holder.y - 128 - (st.it === mp.myId ? 6 : 12);
      crownSprite.visible = true;
    } else crownSprite.visible = false;
  }
  lockSprites.forEach((sprite, i) => {
    if (sprite && !sprite.destroyed) sprite.visible = st ? st.locks[i] !== false : true;
  });
}

function mpRenderHud(engine, force = false) {
  if (!hud || !mp) return;
  syncCrownIndicator(mp.status === 'running' && mp.state?.it ? (mp.state.it === mp.myId ? 'you' : 'other') : null);
  syncCrownsThrobber(mp.status === 'waiting' && !hud.countdown.hidden && hud.countdown.textContent === CROWNS_MP_TEXT.mustWait);
  const now = Date.now();
  if (!force && now - lastHud < 150) return;
  lastHud = now;
  const st = mp.state;
  const rows = st ? crownsMpBoard(st, mp.myId, now, mp.winMs) : mp.players.map((p) => ({ id: p.id, name: p.name, seconds: 0, it: false, you: p.id === mp.myId }));
  const board = hud.bar.querySelector('[data-crowns-board]');
  board.textContent = '';
  for (const row of rows) {
    const span = document.createElement('span');
    span.className = `${row.it ? 'is-it' : ''} ${row.you ? 'is-you' : ''}`.trim();
    const b = document.createElement('b');
    b.textContent = row.name;
    span.append(b, ` ${row.seconds}s${row.it ? ' 👑' : ''}`);
    board.appendChild(span);
  }
  const clock = hud.bar.querySelector('[data-crowns-clock]');
  const mine = Boolean(st && st.it === mp.myId && mp.status === 'running');
  clock.hidden = !mine;
  if (mine) {
    const left = Math.ceil((mp.winMs - crownMsNow(st, mp.myId, now, mp.winMs)) / 1000);
    clock.querySelector('[data-crowns-clock-text]').textContent = `${left}s to win${mp.below ? '' : ' (below the play line)'}`;
    clock.querySelector('img').src = `${CROWN_DIR}game_crown_${now < st.lockedUntil ? 'locked' : 'unlocked'}.png`;
  }
}

/** crown_end: the splash for everyone, and this player's badges (games_end_it_game 613-737). */
function mpFinish(engine, msg) {
  if (!mp || msg.match !== mp.match) return;
  const out = crownsMpOutcome(msg, mp.myId);
  mp.status = 'done';
  mp.ready = false;
  mp.acked = false;
  mp.result = out;
  if (mpMustWaitUid) engine.removePrompt?.(mpMustWaitUid);
  mpMustWaitUid = null;
  const key = `${msg.match}:${msg.round}`;
  if (!mpCounted.has(key) && out.played) {
    mpCounted.add(key);
    if (out.won) {
      record.wins += 1;
      engine.achievement('it_game:won', 1);
    } else if (out.outcome === 'lost') {
      record.losses += 1;
      engine.achievement('it_game:lost', 1);
    }
    if (out.seconds > 0) engine.achievement('it_game:seconds_with_crown', out.seconds);
  }
  clearTip();
  if (hud) {
    hud.bar.hidden = true;
    hud.countdown.hidden = true;
    hud.ready.hidden = true;
  }
  if (crownSprite && !crownSprite.destroyed) crownSprite.visible = false;
  if (out.outcome === 'called_off') {
    // No winner (too few left, or too long): only leaving is left.
    engine.pushActivity(CROWNS_MP_TEXT.calledOff);
    engine.prompt?.({
      text: CROWNS_MP_TEXT.calledOff,
      choices: [{ label: CROWNS_SPLASH.leaveLabel, value: 'leave' }],
      onChoice: () => mpLeave(engine),
      onTimeout: () => mpLeave(engine),
      timeout: 30,
    });
  } else {
    if (out.won) {
      // The activity line comes with the reward (crown_reward: what landed).
      engine.playSound('YOU_WIN', { volume: 0.7 });
    } else {
      engine.pushActivity(`${out.winnerName} won the Game of Crowns.`);
      if (out.played) engine.pushActivity(`You held the crown for ${out.seconds} seconds.`);
      engine.playSound('YOU_LOSE', { volume: 0.7 });
    }
    engine.gameSplash?.({
      key: CROWNS_SPLASH.key,
      ...splashFor(out.won, out.winnerName),
      textDeltaY: CROWNS_SPLASH.textDeltaY,
      buttons: [
        { label: CROWNS_SPLASH.againLabel, w: CROWNS_SPLASH.buttonW, value: 'again', onClick: () => mpPlayAgain(engine) },
        { label: CROWNS_SPLASH.leaveLabel, w: CROWNS_SPLASH.buttonW, value: 'leave', onClick: () => mpLeave(engine) },
      ],
    });
  }
  engine.updateHud();
  engine.save();
  mpNote(engine, `end:${out.outcome}:${out.seconds}`);
  publish(engine);
}

function mpPlayAgain(engine) {
  if (!mp) return;
  engine.hideGameSplash?.();
  mp.ready = true;
  mp.readyAt = Date.now();
  mpClient?.send('crown_again', { match: mp.match });
  mpMustWait(engine);
  mpNote(engine, 'again');
}

function mpLeave(engine) {
  if (mp) mpClient?.send('crown_leave', { match: mp.match });
  if (mpMustWaitUid) engine.removePrompt?.(mpMustWaitUid);
  mpMustWaitUid = null;
  mp = null;
  mpNote(engine, 'left');
  leave(engine);
}

/** Off the arena some other way (a reload, a forced move): out of the game. */
function mpDrop(engine) {
  if (mp) mpClient?.send('crown_leave', { match: mp.match });
  mp = null;
  if (hud) {
    hud.bar.hidden = true;
    hud.ready.hidden = true;
    hud.countdown.hidden = true;
  }
  if (!game && !pending && engine.instanceHold === CROWNS_ID) engine.instanceHold = null;
}

async function mpPersist(engine) {
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

/**
 * crown_reward (games_end_it_game 671-674): the winner's 200 iMG with the
 * mood bonus, and the 50 currants the site's ledger already holds, applied
 * once (this slice's applied ids; the currants also through ledgerReceipt,
 * which a load that caught the ledger up has already listed).
 */
async function mpApplyReward(engine, msg) {
  const r = normalizeCrownsReward(msg);
  const c = mpClient;
  if (!r || !c || mpApplying.has(r.id)) return;
  if (mpAppliedIds.includes(r.id)) {
    if (await mpPersist(engine)) c.send('crown_ack', { id: r.id });
    return;
  }
  mpApplying.add(r.id);
  const pc = engine.pc;
  const xp = r.xp > 0 ? grantMoodXp(pc, r.xp) : 0;
  let currants = 0;
  if (r.currants > 0) {
    const receipt = engine.query?.('ledgerReceipt', r.id, engine);
    if (receipt !== false) {
      pc.currants = (pc.currants || 0) + r.currants;
      currants = r.currants;
    }
  }
  mpAppliedIds = [...mpAppliedIds, r.id].slice(-MP_APPLIED_KEEP);
  const bits = [xp ? `+${xp} iMG` : '', r.currants ? `+${r.currants} currants` : ''].filter(Boolean).join(' · ');
  if (bits) engine.pushActivity(`You won the Game of Crowns! ${bits}.`);
  engine.updateHud();
  mpNote(engine, `reward:${r.id}:${xp}:${currants}`);
  publish(engine);
  const ok = await mpPersist(engine);
  mpApplying.delete(r.id);
  if (ok) c.send('crown_ack', { id: r.id });
}

export const crownsFeature = {
  id: 'crowns',

  init(engine) {
    engineRef = engine;
  },

  save() {
    // Multiplayer: the crown_reward ids this save applied (solo saves never carry them).
    return mpAppliedIds.length ? { ...record, applied: mpAppliedIds } : record;
  },

  restore(slice, engine) {
    mpAppliedIds = engine?.mode === 'multiplayer' && Array.isArray(slice?.applied)
      ? slice.applied.filter((id) => typeof id === 'string' && /^crowns-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$/.test(id)).slice(-MP_APPLIED_KEEP)
      : [];
    const back = slice?.returnTo;
    record = {
      wins: Math.max(0, Math.floor(Number(slice?.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(slice?.losses) || 0)),
      returnTo: back && typeof back.tsid === 'string' && back.tsid !== CROWNS_STREET
        ? { tsid: back.tsid, x: Math.round(Number(back.x) || 0), y: Math.round(Number(back.y) || 0) }
        : null,
      pendingTicket: slice?.pendingTicket === CROWNS_TICKET ? CROWNS_TICKET : null,
    };
  },

  reloadLocation(saved, engine) {
    if (saved?.tsid === CROWNS_STREET) {
      // G334: in multiplayer a reload out of the arena is a logout: out of the game (told on arrival).
      if ((engine || engineRef)?.mode === 'multiplayer') mpLeftNote = true;
      const back = record.returnTo;
      return back ? { tsid: back.tsid, x: back.x, y: back.y } : { tsid: 'GLI2V0UN7RD1T2J', x: 600, y: 700 };
    }
    return null;
  },

  ecologyOverride(street) {
    return street.tsid === CROWNS_STREET ? { label: CROWNS_TITLE, counts: {}, empty: true } : null;
  },

  prepareStreet(street) {
    if (street.tsid !== CROWNS_STREET) return;
    street.label = CROWNS_TITLE;
    // G318: no hub line. LHV2H026E492IAF sits in hub 67 "Multiplayer Quests" (inc_data_maps_prod.js
    // 18003), and getLoadingInfo sends instances no hub_name (location.js 3311).
    street.hubName = '';
    street.walls = CROWNS_LADDERS.map((l) => ({ id: l.id, x: l.x, y: l.y - l.h, w: 50, h: l.h }));
  },

  labelFor(tsid) {
    // A multiplayer arena (CROWNS_<match>) reads as the game, not its hub street.
    return tsid === CROWNS_STREET || /^CROWNS_[0-9A-F]{16}$/.test(String(tsid || '')) ? { street: CROWNS_TITLE, hub: '', hubId: 'it_game' } : null;
  },

  /** realtime-feature sharedStreet: in a multiplayer game the arena is shared on the match's own hub street (CROWNS_<match>). */
  realtimeStreet(engine) {
    return mp && engine.streetTsid === CROWNS_STREET ? mp.street : null;
  },

  onStreetEnter(street, engine) {
    buildChrome(engine);
    if (engine.mode === 'multiplayer') mpAttach(engine);
    if (street.tsid === CROWNS_STREET && pending) {
      const entry = pending;
      pending = null;
      if (entry.mp && mp) mpSetupArena(street, engine);
      else setupArena(street, engine);
      return;
    }
    // Anywhere else, a multiplayer game is over for this player.
    if (mp && street.tsid !== CROWNS_STREET) mpDrop(engine);
    if (mpLeftNote && street.tsid !== CROWNS_STREET) {
      mpLeftNote = false;
      mpLeftTold = true;
      engine.pushActivity(MP_LEFT);
    }
    if (street.tsid !== CROWNS_STREET) {
      // In multiplayer a spent ticket comes back only when the server says the challenge
      // failed (crown_failed / crown_ticket; inc_games.js 2448-2450): a croak to Hell One
      // during the start or a reload is a street change, not a failed challenge (G349).
      if (engine.mode === 'multiplayer') mpAskPending(engine);
      else if (record.pendingTicket) {
        addItem(engine.inv, record.pendingTicket, 1);
        record.pendingTicket = null;
        engine.toast('Your game never started, so your ticket was returned.', 3600);
        engine.updateHud();
      }
      if (!game) record.returnTo = null;
      if (!game && !pending && engine.instanceHold === CROWNS_ID) engine.instanceHold = null;
      const demo = engine.param('racedemo');
      if (demo === CROWNS_ID && !crownsFeature._demoDone) {
        crownsFeature._demoDone = true;
        setTimeout(() => startCrowns(engine, { useTransition: false }), 300);
      }
    }
    publish(engine);
  },

  onStreetClear() {
    actors = {};
    crownSprite = null;
    lockSprites = [];
  },

  travelGate() {
    return game || pending || mp || mpStarting || mpChallenging ? { ok: false, msg: "You can't leave in the middle of a game!" } : null;
  },

  physics(engine) {
    if (mp && engine.streetTsid === CROWNS_STREET) return mp.status === 'running' ? { jump: JUMP_SCALE } : { speed: 0, jump: 0 };
    if (engine.streetTsid !== CROWNS_STREET || !game) return null;
    if (game.status !== 'running') return { speed: 0, jump: 0 };
    return { jump: JUMP_SCALE };
  },

  onTick(dtMs, now, engine) {
    if (engine.mode === 'multiplayer' && !mpClient) mpAttach(engine);
    if (mp && engine.streetTsid === CROWNS_STREET) {
      mpTick(dtMs, now, engine);
      mpRenderHud(engine);
      publish(engine);
      return;
    }
    if (!game || engine.streetTsid !== CROWNS_STREET) return;
    tick(dtMs, now, engine);
    renderHud(engine);
    publish(engine);
  },

  _demoDone: false,
  _state() {
    return { game, record, mp, mpAppliedIds };
  },
};
