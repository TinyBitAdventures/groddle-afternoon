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
 */

import { crowdScaleX } from '../avatar-anims.js';
import {
  CROWNS_ID,
  CROWNS_LADDERS,
  CROWNS_PLAYERS,
  CROWNS_STREET,
  CROWNS_TAG_DISTANCE,
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
} from '../game-of-crowns.js?v=crowns-1';
import { RACE_RIVALS } from '../races.js?v=races-3';
import { wallsScreen } from '../street-model.js';
import { addItem } from '../inventory.js?v=catalog-unified-3';
import { textureFromUrl } from '../textures.js';
import { grantMoodXp } from '../mood-xp.js';

const ICON = 'assets/sprites/races/';
const CROWN_DIR = 'assets/sprites/races/crowns/';
const RIVAL_SCALE = 1.35 * 0.4;
const JUMP_SCALE = 1.15;
const AI_SPEED = 3.7; // px per 60 Hz frame (the avatar runs 4.4)


/** Waiting-area ledges above the play line (screen coords) for the 4 starts. */
const START_POINTS = Object.freeze([
  { x: 1180, y: 243 },
  { x: 1800, y: 245 },
  { x: 660, y: 275 },
  { x: 2330, y: 259 },
]);

/** Four lock spots on ledges below the play line (screen coords). */
const LOCK_POINTS = Object.freeze([
  { x: 255, y: 1230 },
  { x: 1030, y: 1576 },
  { x: 1640, y: 1040 },
  { x: 2400, y: 1034 },
]);

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
.crowns-clock { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); display: flex; align-items: center; gap: 6px;
  padding: 2px 12px 2px 4px; border-radius: 999px; color: #3a240c; font-weight: 900; background: rgba(255,247,211,.94); }
.crowns-clock[hidden] { display: none; }
.crowns-clock img { width: 34px; height: auto; }
.crowns-rules { margin: 0 auto 16px; padding: 0; list-style: none; text-align: left; display: inline-block; font-weight: 700; font-size: .9rem; }
.crowns-rules li::before { content: '• '; color: #f2d36c; }
.crowns-result-actions { display: flex; gap: 10px; justify-content: center; }
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
      <img src="${CROWN_DIR}game_crown_unlocked.png" alt="" />
      <p>${CROWNS_TITLE}</p>
      <h2 id="crowns-ready-title">Hold the crown for 60 seconds to win</h2>
      <ul class="crowns-rules">${CROWNS_TEXT.rules.map((r) => `<li>${r}</li>`).join('')}</ul><br />
      <button type="button" class="btn-glitch-primary" data-crowns-ready>Click to Start</button>
    </div>`);
  const countdown = el('div', { id: 'crowns-countdown', class: 'hog-haul-countdown', hidden: true });
  const result = el('div', { id: 'crowns-result', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'crowns-result-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-result-card">
      <div class="hog-haul-result-rays" aria-hidden="true"></div>
      <img src="${CROWN_DIR}game_crown_unlocked.png" alt="" />
      <p>GAME OF CROWNS</p>
      <h2 id="crowns-result-title" data-crowns-result-title></h2>
      <p data-crowns-result-detail></p>
      <div class="crowns-result-actions">
        <button type="button" class="btn-glitch-primary" data-crowns-again>Play Again</button>
        <button type="button" class="btn-glitch-primary" data-crowns-leave>Leave the Game</button>
      </div>
    </div>`);
  for (const node of [bar, ready, countdown, result]) host.appendChild(node);
  hud = { bar, ready, countdown, result };
  ready.querySelector('[data-crowns-ready]').addEventListener('click', () => readyUp(engine));
  result.querySelector('[data-crowns-leave]').addEventListener('click', () => leave(engine));
  result.querySelector('[data-crowns-again]').addEventListener('click', () => playAgain(engine));
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
  record.pendingTicket = opts.ticket || null;
  pending = { at: Date.now() };
  engine.instanceHold = CROWNS_ID;
  engine.save();
  const start = START_POINTS[0];
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
  game = createCrownsGame({
    now: Date.now(),
    players,
    itId: params.get('raceautoplay') === '1' ? 'you' : undefined,
  });
  placeCrownLocks(game, LOCK_POINTS);
  resultApplied = false;
  lastTip = '';
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
  hud.result.hidden = true;
  renderHud(engine, true);
  publish(engine);
  if (params.get('racedemo') === CROWNS_ID && params.get('racestage') !== 'ready') setTimeout(() => readyUp(engine), 600);
}

function readyUp(engine) {
  if (!game || game.status !== 'staging') return;
  beginCrownsCountdown(game, Date.now());
  hud.ready.hidden = true;
  hud.countdown.hidden = false;
  hud.countdown.textContent = 'READY?';
  engine.playSound('COUNT_DOWN', { volume: 0.55 });
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

function tip(engine, text) {
  if (!text || text === lastTip) return;
  lastTip = text;
  hud.bar.querySelector('[data-crowns-tip]').textContent = text;
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
    if (e.type === 'entered_play' && e.id === 'you' && e.isIt) tip(engine, CROWNS_TEXT.youreIt(crownRemainingSeconds(game, 'you')));
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
      if (!p || Math.abs(p.x - holder.x) > CROWNS_TAG_DISTANCE || Math.abs(p.y - holder.y) > 70) continue;
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
      if (!p || Math.abs(p.x - lock.x) > 30 || Math.abs(p.y - lock.y) > 50) continue;
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
  }
  if (res.secondsWithCrown > 0) engine.achievement('it_game:seconds_with_crown', res.secondsWithCrown);
  const card = hud.result.querySelector('.hog-haul-result-card');
  card.classList.toggle('is-loss', !res.won);
  hud.result.querySelector('[data-crowns-result-title]').textContent = res.won ? 'YOU WON!' : `${res.winnerName} IS THE WINNER!`;
  hud.result.querySelector('[data-crowns-result-detail]').textContent = res.won
    ? `(You got ${res.reward.currants} currants and ${xp} xp.)`
    : `You held the crown for ${res.secondsWithCrown} seconds.`;
  hud.result.hidden = false;
  hud.countdown.hidden = true;
  if (crownSprite) crownSprite.visible = false;
  engine.updateHud();
  engine.save();
  publish(engine);
}

async function leave(engine) {
  const back = record.returnTo;
  hud.result.hidden = true;
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
  hud.result.hidden = true;
  game = null;
  pending = { at: Date.now() };
  engine.enter(CROWNS_STREET, { spawnX: START_POINTS[0].x, spawnY: START_POINTS[0].y, bypassFeatureGates: true, useTransition: false });
}

function renderHud(engine, force = false) {
  if (!hud || !game) return;
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
  engine.setData('crownsPlayers', game ? String(Object.keys(game.players).length) : '0');
  engine.setData('crownsLadders', String(CROWNS_LADDERS.length));
  engine.setData('crownsNavNodes', nav ? String(nav.nodes.length) : '0');
  engine.setData('crownsRivals', Object.values(actors).map((a) => `${a.id}@${Math.round(a.x)},${Math.round(a.y)}:${game ? Math.floor((game.players[a.id]?.crownMs || 0) / 1000) : 0}`).join('|'));
}

export const crownsFeature = {
  id: 'crowns',

  init(engine) {
    engineRef = engine;
  },

  save() {
    return record;
  },

  restore(slice) {
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

  reloadLocation(saved) {
    if (saved?.tsid === CROWNS_STREET) {
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
    street.hubName = 'Games';
    street.walls = CROWNS_LADDERS.map((l) => ({ id: l.id, x: l.x, y: l.y - l.h, w: 50, h: l.h }));
  },

  labelFor(tsid) {
    return tsid === CROWNS_STREET ? { street: CROWNS_TITLE, hub: 'Games', hubId: 'it_game' } : null;
  },

  onStreetEnter(street, engine) {
    buildChrome(engine);
    if (street.tsid === CROWNS_STREET && pending) {
      pending = null;
      setupArena(street, engine);
      return;
    }
    if (street.tsid !== CROWNS_STREET) {
      if (record.pendingTicket) {
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
    return game || pending ? { ok: false, msg: "You can't leave in the middle of a game!" } : null;
  },

  physics(engine) {
    if (engine.streetTsid !== CROWNS_STREET || !game) return null;
    if (game.status !== 'running') return { speed: 0, jump: 0 };
    return { jump: JUMP_SCALE };
  },

  onTick(dtMs, now, engine) {
    if (!game || engine.streetTsid !== CROWNS_STREET) return;
    tick(dtMs, now, engine);
    renderHud(engine);
    publish(engine);
  },

  _demoDone: false,
  _state() {
    return { game, record };
  },
};
