/**
 * The Great Hog Haul between real players (G334), multiplayer only.
 *
 * A Great Hog Haul Ticket challenges the street through races-feature
 * (race_challenge for the hogtie_piggy course; the invite, the accept and the
 * 5 s start are races.go's). races-feature hands the match here
 * (startHogHaulMp): both racers go to the haul's street, shared live on the
 * match's own hub street (RACE_<match>), and the server decides who picks up
 * which sack, who hogties which Piggy, who scores at the Pig Pen and who wins
 * (groddle-afternoon-server hoghaul.go, data/hoghaul.json from
 * tools/build-realtime-hoghaul.mjs). The winner's 100 currants reach the
 * site's ledger as the server's receipt (credits.go); this client applies its
 * own reward to its own save, as every race does.
 *
 * Source: players/inc_games.js games_hogtie_piggy_* 1829-2183 (the splash,
 * the tips, the scores overlay, the end splash and rewards), items/pig_bait.js
 * and items/npc_piggy.js onPlayerCollision, groups/global_game.js 634-720.
 * Solo's Hog Haul (game.js startHogHaulRace, the quest and the solo ticket) is
 * not touched: every hook here answers only while a multiplayer haul runs.
 *
 * QA: canvas data hogMp (match:slot), hogMpStatus, hogMpScores, hogMpCarry,
 * hogMpLast; window.groddleQA-free: hogHaulMpFeature._state().
 */

import {
  HOG_MP_TEXT,
  atPen,
  carryMap,
  hogLine,
  hogObjective,
  normalizeHogMatch,
  pigPose,
  touches,
} from '../hog-haul-mp.js?v=g334-hog-1';
import { HOG_HAUL_SPLASH, splashFor } from '../game-splash.js?v=g463-1';
import { grantMoodXp } from '../mood-xp.js';
import { playCountdownArt } from '../overlays.js?v=g458-1';
import { HOG_HAUL_STREET_ID } from '../hog-haul.js?v=hog-haul-2';

const HOLD = 'hog-haul-mp';
const BAIT_ICON = 'assets/sprites/races/pig_bait__x1_iconic_png_1354830334.png';
const PIG_ICON = 'assets/sprites/races/hogtied_piggy__x1_1_png_1354830331.png';
const PIGGY_SCALE = 1.35 * 0.72; // game.js ENTITY_SCALE.piggy
const WIN = Object.freeze({ currants: 100, xp: 50 }); // inc_games.js 2134-2135

let engineRef = null;
let client = null;
let mp = null; // the running match (normalizeHogMatch + live state)
let pending = null; // a match waiting for its street
let record = { returnTo: null };
let hud = null;
let sprites = { baits: [], pigs: [], penPigs: [], carry: new Map() };
let last = '';

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

function note(engine, what) {
  last = what;
  engine.setData?.('hogMpLast', what);
}

function myId() {
  return client?.me?.id ?? null;
}

function buildChrome() {
  if (hud || typeof document === 'undefined') return;
  const host = document.getElementById('hog-haul-hud')?.parentElement || document.getElementById('game-root') || document.body;
  const bar = el('section', { id: 'hog-mp-hud', class: 'hog-haul-hud race-hud', hidden: true, 'aria-live': 'polite' }, `
    <div class="hog-haul-scoreboard" data-hog-mp-scores></div>
    <p class="hog-haul-objective" data-hog-mp-objective></p>
    <div class="hog-haul-cargo" data-hog-mp-cargo aria-label="Carrying nothing"><img data-hog-mp-cargo-icon alt="" /><span data-hog-mp-cargo-label>Hands free</span></div>`);
  const steps = HOG_MP_TEXT.steps.map((s) => `<span>${s}</span>`).join('<i>›</i>');
  const ready = el('div', { id: 'hog-mp-ready', class: 'hog-haul-screen', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hog-mp-ready-title' }, `
    <div class="hog-haul-screen-shade"></div>
    <div class="hog-haul-ready-card">
      <img class="game-logo" src="assets/sprites/overlays/thegreathoghaul_logo@1.5x.webp" alt="" />
      <p>${HOG_MP_TEXT.title}</p>
      <h2 id="hog-mp-ready-title" data-hog-mp-ready-text>${HOG_MP_TEXT.splash}</h2>
      <div class="hog-haul-loop" aria-label="Race steps">${steps}</div>
      <button type="button" class="btn-glitch-primary" data-hog-mp-ready-btn>${HOG_MP_TEXT.start}</button>
    </div>`);
  const countdown = el('div', { id: 'hog-mp-countdown', class: 'hog-haul-countdown', hidden: true, 'aria-live': 'assertive' });
  host.append(bar, ready, countdown);
  hud = { bar, ready, countdown };
  ready.querySelector('[data-hog-mp-ready-btn]').addEventListener('click', () => {
    if (ready.dataset.mode === 'leave') leave(engineRef);
    else readyUp(engineRef);
  });
}

function hideChrome() {
  if (!hud) return;
  hud.bar.hidden = true;
  hud.ready.hidden = true;
  hud.countdown.hidden = true;
  delete hud.ready.dataset.mode;
}

function renderHud() {
  if (!hud || !mp) return;
  const me = myId();
  hud.bar.hidden = mp.status === 'done';
  // hogtie_piggy_show_overlays 1873-1896: "label: score" for each racer.
  hud.bar.querySelector('[data-hog-mp-scores]').innerHTML = mp.players
    .map((p) => `<span><b>${p.id === me ? 'You' : escapeHtml(p.name)}</b>: <strong>${mp.scores.get(p.id) || 0}</strong></span>`)
    .join('');
  const mine = mp.carry.get(me) || '';
  hud.bar.querySelector('[data-hog-mp-objective]').textContent = mp.status === 'running' ? hogObjective(mine) : HOG_MP_TEXT.splash;
  const cargo = hud.bar.querySelector('[data-hog-mp-cargo]');
  cargo.classList.toggle('is-carrying', Boolean(mine));
  cargo.setAttribute('aria-label', mine === 'pig' ? 'Carrying a hogtied Piggy' : mine === 'bait' ? 'Carrying Pig Bait' : 'Carrying nothing');
  hud.bar.querySelector('[data-hog-mp-cargo-icon]').src = mine === 'pig' ? PIG_ICON : BAIT_ICON;
  hud.bar.querySelector('[data-hog-mp-cargo-label]').textContent = mine === 'pig' ? 'Hogtied Piggy' : mine === 'bait' ? 'Pig Bait' : 'Hands free';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function publish(engine) {
  engine.setData?.('hogMp', mp ? `${mp.match}:${mp.slot}` : '');
  engine.setData?.('hogMpStatus', mp ? mp.status : pending ? 'entering' : 'idle');
  engine.setData?.('hogMpScores', mp ? mp.players.map((p) => `${p.name}:${mp.scores.get(p.id) || 0}`).join(',') : '');
  engine.setData?.('hogMpCarry', mp ? [...mp.carry].map(([id, w]) => `${id}:${w}`).join(',') : '');
  engine.setData?.('hogMpLast', last);
}

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */

function anim(engine, key, { speed = 0.12, slice = null, scale = 1 } = {}) {
  const { PIXI } = engine;
  let frames = engine.textures?.[key]?.frames || [];
  if (slice) frames = frames.slice(slice[0], slice[1]);
  if (!frames.length) return null;
  const spr = new PIXI.AnimatedSprite(frames);
  spr.animationSpeed = speed;
  spr.anchor.set(0.5, 1);
  spr.scale.set(scale);
  spr.play();
  return spr;
}

function setupWorld(engine) {
  clearSprites();
  sprites.baits = mp.baits.map((b, i) => {
    const spr = anim(engine, 'pigBait', { speed: 0.1, scale: 0.92 });
    if (spr) {
      spr.x = b.x;
      spr.y = b.y + 2;
      spr.zIndex = 34;
      spr.bob = i * 0.85;
      engine.entityLayer.addChild(spr);
    }
    return { ...b, i, spr, live: true, claimAt: 0 };
  });
  sprites.pigs = mp.pigs.map((p, i) => {
    const spr = anim(engine, 'piggyWalk', { speed: 0.14, slice: [0, 8], scale: PIGGY_SCALE });
    if (spr) {
      spr.x = p.x;
      spr.y = p.y + 2;
      spr.zIndex = 35;
      engine.entityLayer.addChild(spr);
    }
    return { ...p, i, spr, live: true, claimAt: 0 };
  });
  mp.penClaimAt = 0;
  const player = engine.player;
  if (player && mp.spawn) {
    player.x = mp.spawn.x;
    player.y = mp.spawn.y;
    player.vx = 0;
    player.vy = 0;
  }
  engine.snapCamera?.();
}

function clearSprites() {
  for (const row of [...sprites.baits, ...sprites.pigs]) row.spr?.destroy?.();
  for (const spr of [...sprites.penPigs, ...sprites.carry.values()]) spr?.destroy?.();
  sprites = { baits: [], pigs: [], penPigs: [], carry: new Map() };
}

function take(row) {
  if (!row?.live) return;
  row.live = false;
  if (row.spr) row.spr.visible = false;
}

/** inc_games.js:2073: a returned Piggy is made in the pen. */
function penPig(engine) {
  const spr = anim(engine, 'piggyWalk', { speed: 0.1, slice: [0, 8], scale: PIGGY_SCALE * 0.8 });
  if (!spr) return;
  const n = sprites.penPigs.length;
  spr.x = mp.pen.x - 70 + (n % 4) * 46;
  spr.y = mp.pen.y - 7;
  spr.zIndex = 34;
  engine.entityLayer.addChild(spr);
  sprites.penPigs.push(spr);
}

/** The hogtied Piggy over whoever carries one (you, and the other racers where realtime draws them). */
function drawCarry(engine) {
  const me = myId();
  const where = new Map();
  if (engine.player) where.set(me, { x: engine.player.x, y: engine.player.y - Math.abs(engine.player.height || 90) - 8 });
  for (const p of client?.players || []) where.set(p.id, { x: p.x, y: p.y - 98 });
  for (const [id, spr] of sprites.carry) {
    if (mp.carry.get(id) !== 'pig' || !where.has(id)) {
      spr.destroy?.();
      sprites.carry.delete(id);
    }
  }
  for (const [id, what] of mp.carry) {
    if (what !== 'pig' || !where.has(id)) continue;
    let spr = sprites.carry.get(id);
    if (!spr) {
      spr = anim(engine, 'hogtiedPiggy', { speed: 0, scale: 1.05 });
      if (!spr) continue;
      spr.zIndex = 100;
      spr.eventMode = 'none';
      engine.entityLayer.addChild(spr);
      sprites.carry.set(id, spr);
    }
    const at = where.get(id);
    spr.x = at.x;
    spr.y = at.y;
    spr.rotation = Math.sin(Date.now() / 240) * 0.08;
  }
}

/* ------------------------------------------------------------------ */
/* The match                                                          */
/* ------------------------------------------------------------------ */

/** races-feature's race_match for the haul: go to its street (the ticket is spent: race_ticket.js:150). */
export function startHogHaulMp(engine, msg) {
  const info = normalizeHogMatch(msg);
  const c = attach(engine);
  if (!info || !c || mp || pending) {
    if (msg?.match) c?.send('race_leave', { match: String(msg.match) });
    return false;
  }
  buildChrome();
  if (engine.streetTsid !== info.home) {
    record.returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  }
  pending = {
    ...info,
    status: 'waiting',
    scores: new Map(info.players.map((p) => [p.id, 0])),
    carry: new Map(),
    ready: false,
    acked: false,
    readyAt: 0,
    calledOff: null,
    resultApplied: false,
  };
  engine.instanceHold = HOLD;
  engine.save();
  note(engine, `match:${info.match}`);
  Promise.resolve(engine.enter(info.home, { spawnX: info.spawn.x, spawnY: info.spawn.y, bypassFeatureGates: true })).catch(() => {});
  publish(engine);
  return true;
}

function readyUp(engine) {
  if (!mp || mp.status !== 'waiting' || mp.ready) return;
  mp.ready = true;
  mp.readyAt = Date.now();
  client?.send('race_ready', { match: mp.match });
  hud.ready.hidden = true;
  hud.countdown.hidden = false;
  hud.countdown.classList.remove('is-go');
  hud.countdown.classList.add('race-soon');
  // shared_instance_manager.js:261.
  hud.countdown.textContent = 'You must wait for more players before this game can begin.';
  note(engine, 'clicked');
  publish(engine);
}

function onEvent(engine, msg) {
  if (!mp || msg.match !== mp.match) return;
  const me = myId();
  const rows = Array.isArray(msg.scores) ? msg.scores : [];
  for (const r of rows) if (Number(r?.id) > 0) mp.scores.set(Number(r.id), Math.max(0, Math.floor(Number(r.score) || 0)));
  mp.carry = carryMap(msg.carry);
  const who = Number(msg.id);
  const i = Number(msg.i);
  if (msg.what === 'bait') take(sprites.baits[i]);
  if (msg.what === 'pig') take(sprites.pigs[i]);
  if (msg.what === 'pen') penPig(engine);
  if (who === me) {
    const line = hogLine(msg.what, msg.score);
    if (line) engine.toast(line, msg.what === 'bait' && msg.score ? 2000 : 3000);
    if (msg.what === 'bait') engine.playSfx?.('pickup', { volume: 0.7, rate: 1.14 });
    if (msg.what === 'pig') engine.playSfx?.('pet', { volume: 0.72, rate: 1.25 });
    if (msg.what === 'pen') engine.playSfx?.('pickup', { volume: 0.8, rate: 0.82 });
  } else if (msg.what === 'pen') {
    engine.toast(HOG_MP_TEXT.rivalPen(String(msg.name || 'Someone')), 2200);
    engine.playSfx?.('alert', { volume: 0.35, rate: 0.92 });
  }
  note(engine, `${msg.what}:${i}:${who}`);
  renderHud();
  publish(engine);
}

function onEnd(engine, msg) {
  if (!mp || msg.match !== mp.match || mp.status === 'done') return;
  const me = myId();
  for (const r of Array.isArray(msg.scores) ? msg.scores : []) if (Number(r?.id) > 0) mp.scores.set(Number(r.id), Math.floor(Number(r.score) || 0));
  mp.status = 'done';
  mp.carry = new Map();
  // hogtie_piggy_dismiss_overlays (2097): the scores go with the end.
  hud.bar.hidden = true;
  hud.countdown.hidden = true;
  hud.ready.hidden = true;
  const winner = msg.winner && Number(msg.winner.id) > 0 ? { id: Number(msg.winner.id), name: String(msg.winner.name || '') } : null;
  if (engine.player) engine.player.vx = 0;
  if (winner && !mp.resultApplied) {
    mp.resultApplied = true;
    const won = winner.id === me;
    if (won) {
      // games_end_hogtie_piggy 2131-2137: +50 iMG (stats_add_xp, false: the mood bonus), +100 currants, won.
      engine.pc.currants = (engine.pc.currants || 0) + WIN.currants;
      const xp = grantMoodXp(engine.pc, WIN.xp);
      engine.achievement?.('hogtie_piggy:won', 1);
      engine.questFlag?.('multiplayer_quest_win');
      engine.pushActivity(`You won ${HOG_MP_TEXT.title}! +${WIN.currants} currants · +${xp} iMG.`);
      engine.playSound?.('YOU_WIN', { volume: 0.7 });
    } else {
      engine.achievement?.('hogtie_piggy:lost', 1);
      engine.pushActivity(`${winner.name} won ${HOG_MP_TEXT.title}.`);
    }
    mp.outcome = won ? 'won' : 'lost';
    // games_end_hogtie_piggy 2104-2152: thegreathoghaul_winner, you_winner with rays or other_winner, Leave the Game.
    engine.gameSplash?.({
      key: HOG_HAUL_SPLASH.key,
      ...splashFor(won, winner.name),
      textDeltaY: HOG_HAUL_SPLASH.textDeltaY,
      buttons: [{ label: HOG_HAUL_SPLASH.leaveLabel, value: 'leave', onClick: () => leave(engine) }],
    });
    mp.splash = true;
  } else if (!winner) {
    // global_game.js cancel after playerLeft: the logo splash and Leave the Game, no reward (2153-2177).
    mp.outcome = 'forfeit';
    const left = msg.left?.name ? String(msg.left.name) : '';
    hud.ready.querySelector('[data-hog-mp-ready-text]').textContent = left ? `${left} left the game, so it is over.` : 'The game is over.';
    hud.ready.querySelector('[data-hog-mp-ready-btn]').textContent = 'Leave the Game';
    hud.ready.dataset.mode = 'leave';
    hud.ready.hidden = false;
    engine.pushActivity(left ? `${left} left the game, so it is over.` : 'The game is over.');
  }
  engine.updateHud?.();
  engine.save();
  note(engine, `end:${msg.why || ''}`);
  renderHud();
  publish(engine);
}

/** Leave the Game (games_leave_instance_overlay 'leave'): back to where the challenge was made. */
async function leave(engine) {
  if (!mp) return false;
  const outcome = mp.outcome || 'forfeit';
  client?.send('race_leave', { match: mp.match });
  if (mp.splash) engine.hideGameSplash?.();
  if (outcome === 'won') engine.questFlag?.('race_leave');
  finish(engine);
  const back = record.returnTo;
  record.returnTo = null;
  engine.save();
  if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  if (outcome === 'won') engine.toast(HOG_MP_TEXT.done, 3600);
  engine.setData?.('hogMpOutcome', outcome);
  publish(engine);
  return true;
}

function finish(engine) {
  mp = null;
  pending = null;
  hideChrome();
  clearSprites();
  if (engine.instanceHold === HOLD) engine.instanceHold = null;
}

function attach(engine) {
  if (client) return client;
  const c = engine?.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  c.on('msg:race_ready_state', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    if ((msg.ready || []).map(Number).includes(myId())) mp.acked = true;
    if (msg.text) engine.pushActivity(String(msg.text));
  });
  c.on('msg:race_soon', (msg) => {
    if (!mp || msg.match !== mp.match || mp.status !== 'waiting') return;
    mp.acked = true;
    mp.status = 'soon';
    hud.ready.hidden = true;
    hud.countdown.hidden = false;
    hud.countdown.classList.add('race-soon');
    hud.countdown.textContent = String(msg.text || 'YAY! THE GAME IS STARTING SOON.');
    engine.playSound?.('GAME_STARTING_SOON', { volume: 0.5 });
    note(engine, 'soon');
    publish(engine);
  });
  c.on('msg:race_countdown', (msg) => {
    if (!mp || msg.match !== mp.match || mp.status === 'done') return;
    mp.status = 'countdown';
    mp.goAt = Date.now() + Math.max(0, Number(msg.in) || 4000);
    hud.countdown.classList.remove('race-soon', 'is-go');
    hud.countdown.hidden = false;
    hud.countdown.textContent = 'READY?';
    engine.playSound?.('COUNT_DOWN', { volume: 0.55 });
    // G394: Tiny Speck's 321_countdown (shared_instance_manager.js 672-683).
    playCountdownArt(hud.countdown);
    note(engine, 'countdown');
    publish(engine);
  });
  c.on('msg:race_go', (msg) => {
    if (!mp || msg.match !== mp.match || mp.status === 'done') return;
    mp.status = 'running';
    hud.countdown.hidden = false;
    hud.countdown.classList.add('is-go');
    hud.countdown.textContent = 'GO!';
    setTimeout(() => { if (mp?.status === 'running') hud.countdown.hidden = true; }, 650);
    engine.playSfx?.('start', { volume: 0.7, rate: 1.16 });
    engine.toast('Find a Pig Bait sack!', 2200);
    note(engine, 'go');
    renderHud();
    publish(engine);
  });
  c.on('msg:race_hog', (msg) => onEvent(engine, msg));
  c.on('msg:race_hog_refused', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    const i = Number(msg.i);
    const row = msg.what === 'bait' ? sprites.baits[i] : msg.what === 'pig' ? sprites.pigs[i] : null;
    if (msg.why === 'gone') take(row);
    if (msg.why === 'needs_bait' && msg.text && Date.now() - (mp.needsAt || 0) > 3000) {
      mp.needsAt = Date.now();
      engine.toast(String(msg.text), 1600);
    }
    note(engine, `refused:${msg.what}:${i}:${msg.why}`);
  });
  c.on('msg:race_end', (msg) => onEnd(engine, msg));
  c.on('msg:race_removed', (msg) => {
    if (!mp || msg.match !== mp.match) return;
    engine.pushActivity(String(msg.text || ''));
    engine.toast(String(msg.text || ''), 3600);
    mp.outcome = 'forfeit';
    leave(engine);
  });
  return c;
}

/** While running: the touches a racer makes, each asked of the server once a second until it answers. */
function tick(engine, now) {
  const player = engine.player;
  for (const b of sprites.baits) {
    if (!b.live || !b.spr) continue;
    b.spr.bob += 0.05;
    b.spr.y = b.y + 2 + Math.sin(b.spr.bob) * 3;
  }
  for (const p of sprites.pigs) {
    if (!p.live || !p.spr) continue;
    const pose = pigPose(p, p.i, now);
    p.spr.x = pose.x;
    p.spr.scale.x = Math.abs(p.spr.scale.x) * (pose.dir < 0 ? -1 : 1);
  }
  drawCarry(engine);
  if (mp.status === 'countdown' && mp.goAt) {
    const left = mp.goAt - now;
    hud.countdown.textContent = left > 3000 ? 'READY?' : left > 0 ? String(Math.max(1, Math.ceil(left / 1000))) : 'GO!';
  }
  if (mp.status !== 'running' || !player) return;
  const carry = mp.carry.get(myId()) || '';
  const ask = (row, kind, payload) => {
    if (now - (row.claimAt || 0) < 1000) return;
    row.claimAt = now;
    client?.send(kind, payload);
  };
  if (carry === 'pig') {
    if (atPen(player.x, player.y, mp.pen)) ask(mp, 'race_pen', { match: mp.match });
    return;
  }
  const b = !carry && sprites.baits.find((r) => r.live && touches(player.x, player.y, r.x, r.y));
  if (b) {
    ask(b, 'race_bait', { match: mp.match, i: b.i });
    return;
  }
  // With bait it hogties; empty-handed the server answers "You need bait first!" (inc_games.js 2004-2017).
  const p = sprites.pigs.find((r) => r.live && r.spr && touches(player.x, player.y, r.spr.x, r.y));
  if (p) ask(p, 'race_pig', { match: mp.match, i: p.i });
}

export const hogHaulMpFeature = {
  id: 'hog-haul-mp',

  init(engine) {
    engineRef = engine;
  },

  save() {
    return record.returnTo ? { returnTo: record.returnTo } : {};
  },

  restore(slice) {
    const back = slice?.returnTo;
    record = {
      returnTo: back && typeof back.tsid === 'string' && /^[A-Z0-9]{8,20}$/.test(back.tsid)
        ? { tsid: back.tsid, x: Math.round(Number(back.x) || 0), y: Math.round(Number(back.y) || 0) }
        : null,
    };
  },

  /** A reload in the middle of a haul goes back to where the challenge was made (the game is over: races.go). */
  reloadLocation(saved) {
    if (engineRef?.mode !== 'multiplayer' || !record.returnTo || saved?.tsid !== HOG_HAUL_STREET_ID) return null;
    return { ...record.returnTo };
  },

  ecologyOverride(street) {
    const game = mp || pending;
    return game && street?.tsid === game.home ? { label: HOG_MP_TEXT.title, counts: {}, empty: true } : null;
  },

  /** realtime-feature sharedStreet: the haul is shared on the match's own hub street (RACE_<match>). */
  realtimeStreet(engine) {
    const game = mp || pending;
    return game && engine.streetTsid === game.home ? game.street : null;
  },

  onStreetEnter(street, engine) {
    if (engine.mode !== 'multiplayer') return;
    attach(engine);
    buildChrome();
    if (pending && street.tsid === pending.home) {
      mp = pending;
      pending = null;
      setupWorld(engine);
      hud.ready.querySelector('[data-hog-mp-ready-text]').textContent = HOG_MP_TEXT.splash;
      hud.ready.querySelector('[data-hog-mp-ready-btn]').textContent = HOG_MP_TEXT.start;
      delete hud.ready.dataset.mode;
      // The splash once the loading card has gone (as Naraka's prompts, hell-feature enterThenPrompt).
      const game = mp;
      Promise.resolve(engine.afterStreetCard?.()).catch(() => {}).then(() => {
        if (mp === game && mp.status === 'waiting' && !mp.ready) hud.ready.hidden = false;
      });
      engine.pushActivity(`${HOG_MP_TEXT.title}: ${HOG_MP_TEXT.splash}`);
      renderHud();
      publish(engine);
      return;
    }
    if (mp && street.tsid !== mp.home) {
      // Taken off the haul's street (a croak, a teleport): out of the game (instance.js player_exited_location 343-366).
      client?.send('race_leave', { match: mp.match });
      finish(engine);
    }
    if (!mp && !pending && record.returnTo && street.tsid === record.returnTo.tsid) record.returnTo = null;
    publish(engine);
  },

  onStreetClear() {
    sprites = { baits: [], pigs: [], penPigs: [], carry: new Map() };
  },

  travelGate() {
    return mp || pending ? { ok: false, msg: "You can't leave in the middle of a race!" } : null;
  },

  physics(engine) {
    if (!mp || engine.streetTsid !== mp.home) return null;
    return mp.status === 'running' ? null : { speed: 0, jump: 0 };
  },

  onTick(dtMs, now, engine) {
    if (!mp || engine.streetTsid !== mp.home) return;
    // Click to Start counts once the racer stands in the instance: ask again until it does.
    if (mp.ready && !mp.acked && mp.status === 'waiting' && client?.street === mp.street && now - mp.readyAt >= 1500) {
      mp.readyAt = now;
      client.send('race_ready', { match: mp.match });
    }
    tick(engine, now);
  },

  labelFor(tsid) {
    const game = mp || pending;
    // G363: a game is an instance: no hub line (location.js 3311), as races show none.
    return game && tsid === game.street ? { street: HOG_MP_TEXT.title, hub: '', hubId: 'scene' } : null;
  },

  /** QA / tests. */
  _state() {
    return { mp, pending, record, last };
  },
};
