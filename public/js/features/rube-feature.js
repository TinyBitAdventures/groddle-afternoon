/**
 * The Rube (js/rube.js) as a feature module.
 *
 * On each street entry he may appear (0.5%, Rubeweed and a long dry spell
 * double it, Rube Radar makes it 1%) to the RUBE_APPEARS cue (here The Rube
 * Song, the published track; the source cue file X_yappi_youpi.mp3 is not
 * recovered), spawns in, walks to you and calls out. Talk to him for his
 * offer: "Sounds great!" trades, "What else do you have?" re-deals (five
 * offers at most), "No thanks." sends him off. He fades out 4.3 s after the
 * deal ends, or as soon as you leave the street. Two trades a game day, none
 * within an hour of the last. Essence of Rubeweed (pack: Imbibe) lures him
 * within five seconds, once a game day.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&rubedemo=1 spawns him
 *     next to you with a pack of tradeable goods (&rubeseed=N fixes the deal
 *     RNG, &rubelevel=N the level floor). &rubeautoplay=1 talks, asks for
 *     another offer, then accepts (=decline says No thanks, =offer stops on
 *     the open offer, =lure imbibes Essence of Rubeweed instead of the demo
 *     spawn). Canvas: rubeState, rubeOffer, rubeOffers, rubeTrades,
 *     rubeLast, rubeAutoplay, rubeChance.
 */

import { ITEM_CATALOG, ensureItem } from '../inventory.js?v=catalog-unified-4';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { hellFeature } from './hell-feature.js?v=hell-8';
import { landingY, walkSurfaceY } from '../walk-surface.js';
import {
  RUBE_CLASS,
  RUBE_FADE_MS,
  RUBE_LEAVE_MS,
  RUBE_LURE_TICK_MS,
  RUBE_MAX_OFFERS,
  RUBE_TEXT,
  createRubeState,
  createRubeVisit,
  imbibeCheck,
  imbibeRubeweed,
  rollRubeDay,
  rubeAccept,
  rubeDecline,
  rubeEntryCheck,
  rubeRedo,
  rubeSpawnChance,
  rubeTalk,
  streetCanHostRube,
} from '../rube.js';
import { frameTexture, sourceFromUrl } from '../textures.js';

export const RUBE_FEATURE_ID = 'rube';
const SONG = 'assets/audio/ambient/The_Rube_Song_1290596637.mp3';
const ART = 'assets/sprites/rube/';
const CELL = { w: 108, h: 154 };
/** Sheet grids measured from the OGA npc_rube PNGs (108x154 cells). */
const CLIPS = {
  spawn_in: { file: 'rube_spawn_in.webp', cols: 9, frames: 205, fps: 30, loop: false },
  walk: { file: 'rube_walk.webp', cols: 8, frames: 15, fps: 30, loop: true },
  walk_end: { file: 'rube_walk_end.webp', cols: 7, frames: 14, fps: 30, loop: false },
  talk: { file: 'rube_talk.webp', cols: 7, frames: 20, fps: 24, loop: true },
  offer_trade: { file: 'rube_offer_trade.png', cols: 34, frames: 340, fps: 30, loop: true },
  offer_accept: { file: 'rube_offer_accept.webp', cols: 9, frames: 70, fps: 30, loop: false },
  offer_reject: { file: 'rube_offer_reject.webp', cols: 9, frames: 130, fps: 30, loop: false },
  fade_out: { file: 'rube_fade_out.webp', cols: 9, frames: 97, fps: 30, loop: false },
};
const WALK_SPEED = 60; // npc_walk_speed px/s
const NEAR_PX = 100;
const START_MOVING_MS = 8000;

let catalog = null;
let catalogPromise = null;
let state = createRubeState();
let rube = null; // live visit on this street
let modal = null;
let last = '';
let rng = Math.random;
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;
let lureAt = 0;
const frameCache = new Map();

const dayKey = () => getGameDayKey(Date.now());

function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function loadCatalog() {
  if (catalog) return Promise.resolve(catalog);
  catalogPromise ||= fetch('assets/content/rube-catalog.json?v=rube-1')
    .then((r) => r.json())
    .then((json) => {
      catalog = json.items || {};
      return catalog;
    })
    .catch(() => {
      catalog = {};
      return catalog;
    });
  return catalogPromise;
}

function frames(engine, clip) {
  const def = CLIPS[clip];
  if (frameCache.has(clip)) return frameCache.get(clip);
  const { PIXI } = engine;
  const base = sourceFromUrl(ART + def.file);
  const list = [];
  for (let i = 0; i < def.frames; i += 1) {
    const x = (i % def.cols) * CELL.w;
    const y = Math.floor(i / def.cols) * CELL.h;
    list.push(frameTexture(base, new PIXI.Rectangle(x, y, CELL.w, CELL.h)));
  }
  frameCache.set(clip, list);
  return list;
}

function setClip(engine, clip, onComplete = null) {
  if (!rube?.sprite || rube.sprite.destroyed) return;
  const def = CLIPS[clip];
  const spr = rube.sprite;
  spr.textures = frames(engine, clip);
  spr.loop = def.loop;
  spr.animationSpeed = def.fps / 60;
  spr.onComplete = onComplete;
  spr.gotoAndPlay(0);
  rube.clip = clip;
  publish(engine);
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('rubeState', rube ? `${rube.phase}:${rube.clip}` : 'none');
  const v = rube?.visit;
  engine.setData('rubeOffer', v?.offerGive ? `${v.offerGive}<-${v.offerReceive}` : 'none');
  engine.setData('rubeOffers', String(v?.offerCount || 0));
  engine.setData('rubeTrades', `${state.tradesToday}/${state.totalTrades}`);
  engine.setData('rubeLast', last || 'none');
  engine.setData('rubeLure', state.lureActive ? 'active' : state.lureDisabled ? 'used' : 'ready');
}

function streetCtx(engine) {
  const street = engine.street || {};
  return {
    instance: Boolean(engine.transientInstance?.()),
    home: Boolean(engine.homeContext?.().inHome),
    hell: Boolean(hellFeature.inHell?.(engine.streetTsid) || hellFeature.isDead?.()),
    hubId: String(street.hubId || ''),
  };
}

function offerCtx(engine) {
  return { inv: engine.inv, catalog: catalog || {}, level: Number(engine.pc?.level) || 1, upgrades: engine.pc?.imaginationUpgrades || [] };
}

/* ------------------------------------------------------------ spawn */

function spawnRube(engine, { summoned = false, near = false } = {}) {
  if (rube || !engine.PIXI || !engine.player) return false;
  const { PIXI } = engine;
  const p = engine.player;
  const worldW = engine.worldW || 2000;
  // spawn_rube: a random x across the street on the player's platform level.
  let x = near ? p.x + 260 : 80 + rng() * Math.max(1, worldW - 160);
  if (!near && Math.abs(x - p.x) > 900) x = p.x + Math.sign(x - p.x) * (500 + rng() * 300);
  x = Math.max(60, Math.min(worldW - 60, x));
  // spawn_npc: the closest platform below the player's height, else above.
  const ground = landingY(engine.platforms, x, p.y - 60) ?? walkSurfaceY(engine.platforms, x, p.y, { up: 400, down: 400 }) ?? p.y;
  const spr = new PIXI.AnimatedSprite(frames(engine, 'spawn_in'));
  spr.anchor.set(0.5, 0.97);
  spr.x = x;
  spr.y = ground;
  spr.zIndex = 8;
  spr._worldHitW = 70;
  spr._worldHitH = 140;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: RUBE_CLASS,
    featureId: RUBE_FEATURE_ID,
    label: 'The Rube',
    subtitle: 'Is bad at trading',
    sprite: spr,
  });
  rube = {
    sprite: spr,
    target,
    visit: createRubeVisit({ summoned }),
    phase: 'spawn_in',
    clip: 'spawn_in',
    spawnedAt: Date.now(),
    leaveAt: 0,
    removeAt: 0,
    stopSong: null,
    called: false,
    facing: 1,
  };
  setClip(engine, 'spawn_in', () => {
    if (rube?.phase === 'spawn_in') {
      rube.phase = 'walk';
      setClip(engine, 'walk');
    }
  });
  state.visits += 1;
  last = RUBE_TEXT.arrived;
  engine.pushActivity?.(RUBE_TEXT.arrived);
  // RUBE_APPEARS (X_yappi_youpi.mp3) is not recovered; The Rube Song plays over the ducked BGM.
  Promise.resolve(engine.playCue?.(SONG, { volume: 0.55 })).then((stop) => {
    if (rube) rube.stopSong = stop;
    else if (typeof stop === 'function') stop();
  });
  publish(engine);
  return true;
}

function removeRube(engine) {
  if (!rube) return;
  if (typeof rube.stopSong === 'function') rube.stopSong();
  closeModal();
  engine.unregister?.(rube.target);
  rube = null;
  publish(engine);
}

/** resetOffer(pc): done, then die 4.3 s later (fade_out, removed 6 s after that). */
function endVisit(engine, clip) {
  if (!rube) return;
  rube.visit.done = true;
  rube.phase = 'leaving';
  rube.target.subtitle = RUBE_TEXT.done;
  if (clip) setClip(engine, clip, () => rube && rube.phase === 'leaving' && setClip(engine, 'talk'));
  rube.leaveAt = Date.now() + RUBE_LEAVE_MS;
  engine.save?.();
}

function die(engine) {
  if (!rube || rube.phase === 'fading') return;
  rube.phase = 'fading';
  setClip(engine, 'fade_out');
  rube.removeAt = Date.now() + RUBE_FADE_MS;
}

/* ------------------------------------------------------------ trade UI */

function closeModal() {
  if (modal?.el) modal.el.hidden = true;
  if (modal) modal.open = false;
}

function iconFor(id) {
  return ITEM_CATALOG[id]?.icon || `assets/sprites/icons/${id}.png`;
}

function ensureModal() {
  if (modal?.el?.isConnected) return modal;
  const host = document.getElementById('quest-dialogue')?.parentNode || document.body;
  const el = document.createElement('div');
  el.id = 'rube-trade';
  el.className = 'quest-dialogue glitch-modal';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="quest-dialogue-shade"></div>
    <div class="quest-dialogue-card" style="background:linear-gradient(160deg,#fffdf4,#f3ead2);box-shadow:0 22px 70px rgba(0,0,0,.42),inset 0 0 0 1px #d9c48f">
      <img src="assets/sprites/icons/npc_rube.png" alt="" style="height:76px;margin:-4px auto 2px;display:block" />
      <p class="mr-kicker">The Rube</p>
      <div data-rube-items style="display:flex;justify-content:center;align-items:center;gap:14px;margin:4px 0 8px"></div>
      <p data-rube-copy class="quest-dialogue-copy" style="min-height:3.2em"></p>
      <div data-rube-buttons style="display:flex;flex-direction:column;align-items:center;gap:6px"></div>
    </div>`;
  host.appendChild(el);
  modal = { el, open: false, onClose: null };
  return modal;
}

function itemTile(id, caption) {
  const label = catalog?.[id]?.label || ITEM_CATALOG[id]?.label || id;
  return `<figure style="margin:0;display:grid;justify-items:center;gap:2px;width:96px">
    <span style="display:grid;place-items:center;width:58px;height:58px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 2px #e4d6ad"><img src="${iconFor(id)}" alt="" style="max-width:48px;max-height:48px" /></span>
    <figcaption style="font-size:.75rem;line-height:1.15;color:#6b5a3a">${caption}<br><b style="color:#3f3220">${label}</b></figcaption></figure>`;
}

function showModal(engine, text, { offer = true } = {}) {
  const m = ensureModal();
  const v = rube?.visit;
  const items = m.el.querySelector('[data-rube-items]');
  items.innerHTML = offer && v?.offerGive
    ? `${itemTile(v.offerGive, 'You get')}<span style="font-size:1.6rem;color:#a08a55">⇄</span>${itemTile(v.offerReceive, 'He wants')}`
    : '';
  m.el.querySelector('[data-rube-copy]').textContent = text;
  const buttons = m.el.querySelector('[data-rube-buttons]');
  if (offer) {
    buttons.innerHTML = `
      <button type="button" class="btn-glitch-primary" data-rube="yes">${RUBE_TEXT.yes}</button>
      <button type="button" class="btn-glitch-primary" data-rube="redo" style="filter:saturate(.6)">${RUBE_TEXT.redo}</button>
      <button type="button" class="quest-dialogue-cancel" data-rube="no">${RUBE_TEXT.no}</button>`;
  } else {
    buttons.innerHTML = '<button type="button" class="btn-glitch-primary" data-rube="ok">OK</button>';
  }
  buttons.querySelectorAll('[data-rube]').forEach((b) => b.addEventListener('click', () => choose(engine, b.dataset.rube)));
  m.el.hidden = false;
  m.open = true;
  engine.setData?.('rubeModal', offer ? 'offer' : 'reply');
}

function choose(engine, choice) {
  if (!rube) return closeModal();
  const v = rube.visit;
  if (choice === 'ok') {
    closeModal();
    engine.setData?.('rubeModal', 'closed');
    return;
  }
  if (choice === 'yes') {
    const res = rubeAccept(v, state, engine.inv, Date.now());
    if (res.ok) {
      const label = (id) => catalog?.[id]?.label || id;
      const meta = catalog?.[res.give];
      if (!ITEM_CATALOG[res.give] || /^Item /.test(ITEM_CATALOG[res.give].desc || '')) {
        ensureItem(res.give, { label: meta?.label, namePlural: meta?.plural, baseCost: meta?.baseCost });
      }
      engine.achievement?.(`rube_trades:${dayKey()}`, 1);
      engine.playSound?.('TRADE_COMPLETED', { volume: 0.6 });
      engine.pushActivity?.(`You traded one ${label(res.receive)} to the Rube for ${meta?.article || 'a'} ${label(res.give)}.`);
      engine.refreshPack?.();
    }
    last = res.text;
    engine.say?.(rube.target, res.text, 4000);
    showModal(engine, res.text, { offer: false });
    endVisit(engine, res.state);
  } else if (choice === 'redo') {
    const res = rubeRedo(v, offerCtx(engine), rng);
    last = res.text;
    if (res.ok) showModal(engine, res.text);
    else {
      showModal(engine, res.text, { offer: false });
      endVisit(engine, 'offer_reject');
    }
  } else if (choice === 'no') {
    rubeDecline(v);
    last = RUBE_TEXT.no;
    closeModal();
    endVisit(engine, 'offer_reject');
  }
  publish(engine);
}

function talk(engine) {
  if (!rube) return;
  const p = engine.player;
  if (p) rube.facing = p.x < rube.sprite.x ? -1 : 1;
  const res = rubeTalk(rube.visit, offerCtx(engine), rng);
  last = res.text;
  if (res.ok) {
    if (rube.phase !== 'leaving') setClip(engine, 'offer_trade');
    showModal(engine, res.text);
  } else {
    showModal(engine, res.text, { offer: false });
    if (res.ended) endVisit(engine, 'offer_reject');
  }
  publish(engine);
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  const demo = engine.param?.('rubedemo');
  if (demoDone || !demo) return;
  demoDone = true;
  if (engine.param('rubeseed')) rng = seeded(engine.param('rubeseed'));
  const pc = engine.pc;
  const lvl = Number(engine.param('rubelevel'));
  if (lvl > 0) pc.level = lvl;
  // Tradeable goods across the cost bands (all in the Rube catalog).
  const goods = { cherry: 20, plank: 10, grain: 10, meat: 6, bun: 4, butterfly_lotion: 2, hatchet: 1 };
  for (const [id, n] of Object.entries(goods)) engine.inv[id] = Math.max(Number(engine.inv[id]) || 0, n);
  if (engine.param('rubeautoplay') === 'lure') {
    engine.inv.essence_of_rubeweed = Math.max(1, Number(engine.inv.essence_of_rubeweed) || 0);
  }
  engine.updateHud?.();
  loadCatalog().then(() => {
    if (engine.param('rubeautoplay') !== 'lure') spawnRube(engine, { near: true });
    if (engine.param('rubeautoplay')) autoplayAt = Date.now() + 2500;
  });
}

function autoplay(engine, now) {
  const mode = engine.param('rubeautoplay');
  autoplayAt = now + 1600;
  const step = autoplayStep;
  autoplayStep += 1;
  if (mode === 'lure') {
    if (step === 0) rubeFeature.runPackVerb('essence_of_rubeweed', 'imbibe', engine);
    else if (rube) {
      autoplayAt = 0;
      engine.setData('rubeAutoplay', 'lured');
    }
    return;
  }
  if (!rube) return;
  if (step === 0) {
    // Skip the long spawn-in for QA: start walking now.
    rube.phase = 'walk';
    setClip(engine, 'walk');
    return;
  }
  if (step === 1) return talk(engine);
  // &rubeoffers=4|5: press "What else do you have?" until that offer is up (the patience counter).
  const want = Math.min(RUBE_MAX_OFFERS, Number(engine.param('rubeoffers')) || 0);
  if (mode === 'offer' && want && rube.visit.offerCount < want && !rube.visit.done) {
    autoplayAt = now + 700;
    return choose(engine, 'redo');
  }
  if (mode === 'offer') {
    autoplayAt = 0;
    engine.setData('rubeAutoplay', 'offer');
    return;
  }
  if (step === 2) return choose(engine, mode === 'decline' ? 'no' : 'redo');
  if (step === 3 && mode !== 'decline') return choose(engine, 'yes');
  autoplayAt = 0;
  engine.setData('rubeAutoplay', 'done');
}

/* ------------------------------------------------------------ feature */

export const rubeFeature = {
  id: RUBE_FEATURE_ID,

  init(engine) {
    rollRubeDay(state, dayKey());
    ensureItem(RUBE_CLASS, { label: 'Rube', sellable: false, donatable: false });
    loadCatalog();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    rollRubeDay(state, dayKey());
    demoSetup(engine);
    if (demoDone || rube) return publish(engine);
    // location_spawns: no QA routes (they need a quiet street).
    const params = [...new URLSearchParams(globalThis.location?.search || '').keys()];
    if (params.some((k) => /demo$|autoplay$/.test(k))) return publish(engine);
    loadCatalog().then(() => {
      const check = rubeEntryCheck(state, {
        street: streetCtx(engine),
        inv: engine.inv,
        catalog,
        rubeweed: (engine.activeBuffIds?.() || []).includes('rubeweed'),
        upgrades: engine.pc?.imaginationUpgrades || [],
      }, rng);
      engine.setData?.('rubeChance', `${check.reason}:${check.chance ?? ''}`);
      if (check.spawn) spawnRube(engine);
    });
  },

  onStreetClear(engine) {
    // onPlayerExit: the Rube leaves with you.
    if (rube) {
      if (typeof rube.stopSong === 'function') rube.stopSong();
      closeModal();
      rube = null;
    }
    publish(engine);
  },

  onNewDay() {
    rollRubeDay(state, dayKey());
  },

  onTick(dtMs, now, engine) {
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
    // Rube Lure buff: tryRubeLure every 5 s until he comes.
    if (state.lureActive && !rube && now >= lureAt && catalog) {
      lureAt = now + RUBE_LURE_TICK_MS;
      if (streetCanHostRube(streetCtx(engine)) && spawnRube(engine, { summoned: true })) state.lureActive = false;
    }
    if (!rube) return;
    const spr = rube.sprite;
    const p = engine.player;
    if (rube.removeAt && now >= rube.removeAt) return removeRube(engine);
    if (rube.leaveAt && now >= rube.leaveAt && !modal?.open) {
      rube.leaveAt = 0;
      die(engine);
    }
    if (rube.phase === 'spawn_in' && now - rube.spawnedAt >= START_MOVING_MS) {
      rube.phase = 'walk';
      setClip(engine, 'walk');
    }
    if (rube.phase === 'walk' && p) {
      const dx = p.x - spr.x;
      const nx = spr.x + Math.sign(dx) * WALK_SPEED * (dtMs / 1000);
      const ny = walkSurfaceY(engine.platforms, nx, spr.y, { up: 46, down: 80 });
      if (Math.abs(dx) > NEAR_PX && ny != null) {
        rube.facing = Math.sign(dx);
        spr.x = nx;
        spr.y = ny;
      } else {
        rube.phase = 'waiting';
        setClip(engine, 'walk_end', () => rube?.phase === 'waiting' && setClip(engine, 'talk'));
        if (!rube.called) {
          rube.called = true;
          engine.say?.(rube.target, RUBE_TEXT.hello('friend'), 20000);
        }
      }
    }
    // The sheets face left; flip toward where he walks or looks.
    spr.scale.x = rube.facing > 0 ? -1 : 1;
  },

  verbsFor(target, engine) {
    if (target.classId !== RUBE_CLASS || !rube) return [];
    const done = rube.visit.done;
    return [{ id: 'talk_to', label: 'Talk to', enabled: !done && Boolean(catalog), reason: RUBE_TEXT.done, tooltip: RUBE_TEXT.tooltip, durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== RUBE_CLASS || verbId !== 'talk_to') return false;
    talk(engine);
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== 'essence_of_rubeweed') return [];
    const check = imbibeCheck(state, { street: streetCtx(engine), dead: hellFeature.isDead?.() });
    return [{ id: 'imbibe', label: 'Imbibe', enabled: check.ok, reason: check.msg || '', tooltip: 'Drink to become infused with the potent (and quite unpleasant) smell of Rube', primary: check.ok }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== 'essence_of_rubeweed' || verbId !== 'imbibe') return false;
    const res = imbibeRubeweed(state, engine.inv, { street: streetCtx(engine), dead: hellFeature.isDead?.() });
    last = res.msg;
    engine.pushActivity?.(res.msg);
    engine.toast?.(res.msg, 3200);
    if (res.ok) {
      lureAt = Date.now() + 1000;
      loadCatalog();
      engine.refreshPack?.();
      engine.save?.();
    }
    publish(engine);
    return true;
  },

  save() {
    return { version: 1, ...state };
  },

  restore(slice) {
    state = createRubeState(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { state, rube, last };
  },
  _reset() {
    state = createRubeState();
    rube = null;
    last = '';
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
  },
  _spawnChance: rubeSpawnChance,
};
