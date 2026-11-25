/**
 * The Purple Journey (G150, with G138 Le Voyage Violet), as a feature module
 * (see js/feature-host.js). Rules and copy live in js/purple-journey.js; the
 * room is js/purple-journey-scene.js.
 *
 * - Essence of Purple gets Imbibe in the pack (refused when dead, during the
 *   journey and while Purpled Out). The first sip starts the countdown 15 s
 *   later: four activity lines (mood +5, +10), then the HURRY UP PLEASE ITS
 *   TIME lines over a purple haze with the surprise emote (mood -5, -10),
 *   and two seconds after the last, Le Voyage Violet. A second sip before
 *   the journey starts is wasted ("Nope, nothing.").
 * - In the room: Purple Journey (90 s) starts; a Scion of Purple manifests
 *   3 s in and every 12-17 s (five in all) beside you, fades in, speaks its
 *   mysterious words (a quote, the HURRY line or a fact about your pack,
 *   the catalog, your house, your badges or the streets you have walked)
 *   and fades out; a quoin appears 6 s in and every 10-20 s (2-6 of a
 *   random kind, or 25 one time in twenty); at 85 s "You are starting to
 *   feel a little less weird." When the buff ends (or is ended) you go back
 *   where you were, Purpled Out (120 s) starts and, 2 s later, the
 *   journeys_taken counter goes up: three journeys earn Elementary Penguin.
 * - Purple Flower's Munch is refused while Purpled Out (packUseGate).
 * - Leaving the room early (the Map) stops the Scions, as onPlayerExit did;
 *   the buff runs out wherever you are. A journey due while you are in a
 *   quest room, a memory or your house waits until you are back on a street.
 * - G961: on a computer the Scion draws sharp (its 3x atlases, js/onscreen-sharp.js), held one
 *   state ahead (scionHeldLabels) and destroyed when it fades; phones and low-memory devices keep
 *   the 1x sheets and load nothing more. The 1x sheets go too when the room is left.
 * - Not built: Purpled Out's chat scrambling (main.js:1747, the remake has
 *   no chat).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&purpledemo=1 packs two
 *   Essences of Purple; &purpleautoplay=1 imbibes on arrival (add
 *   &purplefast=1 for a countdown ten times faster), =room skips straight
 *   into the room, =wasted sips twice. &purplehold=1 keeps the room open
 *   (the buff is held at full). Canvas: purpleStage, purpleTaken,
 *   purpleRoom, purpleScions, purpleQuoins, purpleLast, purpleVog, purpleSharp (G961: on or
 *   off:<reason>; the sharp labels in; their GPU MB; atlases fetched; the GPU format; the 1x
 *   sheets' GPU MB). &onscreensharp=off keeps the 1x.
 */

import { addItem, countItem, ITEM_CATALOG, removeItem } from '../inventory.js?v=6414dbdc';
import { shiftMetabolic } from '../metabolics.js?v=48f784bf';
import { collectQuoin, QUOIN_SHEET, QUOIN_TYPES, quoinTouches } from '../quoins.js?v=5abad2c7';
import { frameTexture, holdSource, releaseTexture, sourceFromUrl } from '../textures.js?v=b8e38103';
import { createOnscreenSharp, ktx2Loader, maxTextureSizeOf, rendererCompressedFormats, sharpAllowed, textureBytes } from '../onscreen-sharp.js?v=75b8a30d';
import { playPoofIn } from '../overlay-art.js?v=e50bacca';
import { STREET_INDEX } from '../street-loader.js?v=10376267';
import { getAchievementCatalog } from '../content-catalogs.js?v=2b7048b9';
import { POTION_ART } from '../potion-art.js?v=9d731b38';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=ecade42e';
import {
  EMPEROR,
  ESSENCE,
  JOURNEY_BUFF,
  JOURNEY_COUNTER,
  PURPLED_OUT_BUFF,
  PURPLE_TEXT,
  SCION,
  VOYAGE_ARRIVAL,
  VOYAGE_LABEL,
  VOYAGE_TSID,
  emperorPosition,
  emperorQuoin,
  imbibe,
  imbibeButton,
  purpleTimeline,
  scionWords,
} from '../purple-journey.js?v=5e078ed8';
import { VOYAGE_FLOOR, VOYAGE_H, VOYAGE_OFFSET, VOYAGE_W, buildVoyageScene } from '../purple-journey-scene.js?v=1f3c08c6';
import { homesFeature } from './homes-feature.js?v=1c264731';

export const PURPLE_FEATURE_ID = 'purple-journey';
/** The scene's own TSID (the template is LNVV4OTMAUG2PQV). */
export const VOYAGE_SCENE = `PJ_${VOYAGE_TSID}`;
const COUNTER_DELAY_MS = 2_000;
const TIMELINE = purpleTimeline();
const SIP_DELAY_MS = 15_000;

let taken = false; // pc.taken_purple: a sip is waiting for its journey
let startedAt = 0; // when the running countdown's sip was taken (0: none)
let cursor = 0; // next TIMELINE row
let run = null; // { returnTo, enteredAt, nextScionAt, nextQuoinAt, scions, feelingBetter }
let journeyOn = false; // the purple_journey buff, last tick
let counterAt = 0;
let scions = []; // { sprite, label, born, spoke, talkUntil, idleAt, vanishing, state, idleKind, held, sharp }
let quoins = []; // { sprite, x, y, type, amount }
let last = '';
let demoDone = false;
let autoplay = null;
const vogs = new Map();
let hazeEl = null;

const now = () => Date.now();
const fast = (engine) => (engine.param?.('purplefast') === '1' ? 0.1 : 1);

function publish(engine) {
  if (!engine?.setData) return;
  const due = TIMELINE[cursor];
  engine.setData('purpleStage', startedAt ? String(due ? due.stage : 'done') : '');
  engine.setData('purpleTaken', taken ? '1' : '');
  engine.setData('purpleRoom', run ? (engine.streetTsid === VOYAGE_SCENE ? 'in' : 'left') : '');
  engine.setData('purpleScions', String(run?.scions || 0));
  engine.setData('purpleQuoins', String(quoins.length));
  engine.setData('purpleLast', last);
  // G961 QA: whether this device draws the Scion sharp, the labels in and their GPU MB.
  const st = run ? sharp?.stats() : null;
  engine.setData('purpleSharp', st ? `${st.allowed ? 'on' : `off:${st.reason}`};${st.held.filter((r) => r.loaded).map((r) => r.label).join(',')};${st.gpuMB};${st.loads};${st.held.find((r) => r.loaded)?.format || ''};${scionSheetsGpuMB(engine)}` : '');
}

/** G961 QA: MB of the Scion's 1x sheets on the GPU now. */
function scionSheetsGpuMB(engine) {
  const managed = engine.renderer?.texture?.managedTextures;
  if (!scionFrames || !managed) return 0;
  const sources = new Set(Object.values(scionFrames).map((set) => set.all[0]?.source).filter(Boolean));
  let bytes = 0;
  for (const src of sources) if (managed.includes(src)) bytes += textureBytes(src);
  return +(bytes / 1048576).toFixed(1);
}

function isDead(engine) {
  return engine.metabolicGate?.('energy', 'gain')?.ok === false;
}

function addMood(engine, delta) {
  const pc = engine.pc;
  // inc_special_locations.js 331-356: metabolics_add_mood(5 / 10), then
  // metabolics_lose_mood(5 / 10), both through the doors (G300).
  shiftMetabolic(pc, 'mood', delta);
  engine.refreshPack?.();
}

/* ------------------------------------------------------------------ */
/* Haze and vog lines (vp_canvas / vp_overlay)                          */
/* ------------------------------------------------------------------ */

function viewHost() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('game-root') || document.body;
}

function haze(steps) {
  const host = viewHost();
  if (!host || typeof host.animate !== 'function') return;
  if (!hazeEl || !hazeEl.isConnected) {
    hazeEl = document.createElement('div');
    hazeEl.className = 'purple-haze';
    hazeEl.style.cssText = 'position:absolute;inset:0;z-index:86;pointer-events:none;background:#a020f0;opacity:0';
    host.appendChild(hazeEl);
  }
  const total = steps.reduce((a, s) => a + s.secs, 0) || 1;
  let t = 0;
  let alpha = 0;
  const frames = [{ opacity: 0, offset: 0 }];
  for (const s of steps) {
    t += s.secs;
    alpha = s.alpha;
    frames.push({ opacity: alpha, offset: Math.min(1, t / total) });
  }
  hazeEl.animate(frames, { duration: total * 1000, fill: 'forwards' });
}

/** vp_overlay: a nuxp_vog line at x% / top_y% of the view for 2.5 s; a uid replaces its own line. */
function vog(engine, { uid, text, x, y, big }, durationMs = 2500) {
  engine.setData?.('purpleVog', text);
  const host = viewHost();
  if (!host) return;
  vogs.get(uid)?.remove();
  const el = document.createElement('div');
  el.className = 'purple-vog';
  el.textContent = text;
  el.style.cssText = `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,0);z-index:88;pointer-events:none;`
    + `max-width:min(560px,90%);text-align:center;font:900 ${big ? 'clamp(1.4rem,3.6vw,2.2rem)' : 'clamp(1rem,2.6vw,1.5rem)'}/1.2 Nunito,'Trebuchet MS',sans-serif;`
    + 'color:#fff;text-shadow:0 2px 0 #3b0f48,0 0 4px #3b0f48,0 0 16px rgba(160,32,240,.6);transition:opacity .3s';
  host.appendChild(el);
  vogs.set(uid, el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      if (vogs.get(uid) === el) vogs.delete(uid);
    }, 320);
  }, durationMs);
}

function clearVogs() {
  for (const el of vogs.values()) el.remove();
  vogs.clear();
}

/* ------------------------------------------------------------------ */
/* Imbibe and the countdown                                             */
/* ------------------------------------------------------------------ */

function imbibeCtx(engine) {
  return { dead: isDead(engine), journeying: engine.hasBuff(JOURNEY_BUFF), purpledOut: engine.hasBuff(PURPLED_OUT_BUFF) };
}

export function imbibeEssence(engine) {
  if (countItem(engine.inv, ESSENCE) < 1) return false;
  const button = imbibeButton(imbibeCtx(engine));
  if (!button.enabled) {
    engine.toast?.(button.reason, 2800);
    return true;
  }
  const out = imbibe({ takenPurple: taken });
  removeItem(engine.inv, ESSENCE, 1);
  for (const row of itemVerbAchievementCounters(ESSENCE, 'imbibe')) engine.achievement(row.counter, row.amount);
  engine.pushActivity?.(out.message);
  if (out.started) {
    taken = true;
    startedAt = now();
    cursor = 0;
  }
  last = out.started ? 'imbibe:sip' : 'imbibe:wasted';
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

/** The first vog line (stage 5): purplefast squeezes only the quiet minute before it. */
const VOG_START = TIMELINE.find((row) => row.vog).at;

/** When TIMELINE row `i` is due (ms). */
function rowAt(engine, i) {
  const f = fast(engine);
  const at = TIMELINE[i].at;
  return startedAt + SIP_DELAY_MS * f + (at <= VOG_START ? at * f : at - VOG_START * (1 - f));
}

function canEnterRoom(engine) {
  if (engine.streetTsid === VOYAGE_SCENE) return false;
  if (engine.homeContext?.().inHome) return false;
  return !engine.transientInstance?.() && !engine.busy?.();
}

function runRow(engine, row) {
  if (row.activity) engine.pushActivity?.(row.activity);
  if (row.mood) addMood(engine, row.mood);
  if (row.vog) {
    engine.playEmotion?.(row.emote || 'surprise');
    haze(row.haze);
    vog(engine, row.vog);
  }
  // Stage 12 only clears the flag; the instance create already queued still runs.
  if (row.clearsTaken) taken = false;
  last = `stage:${row.stage}${row.enter ? ':enter' : ''}`;
}

function tickCountdown(engine, t) {
  while (startedAt && cursor < TIMELINE.length && t >= rowAt(engine, cursor)) {
    const row = TIMELINE[cursor];
    if (row.enter) {
      // instances_create_delayed; the second call finds you already inside.
      if (!run && !engine.hasBuff(JOURNEY_BUFF)) {
        if (!canEnterRoom(engine)) return; // wait for a street
        enterVoyage(engine);
      }
      cursor += 1;
      continue;
    }
    runRow(engine, row);
    cursor += 1;
  }
  if (startedAt && cursor >= TIMELINE.length) startedAt = 0;
}

/* ------------------------------------------------------------------ */
/* Le Voyage Violet                                                     */
/* ------------------------------------------------------------------ */

const toScreen = (gx, gy) => ({ x: gx + VOYAGE_OFFSET.x, y: gy + VOYAGE_OFFSET.y });
const toGeo = (sx, sy) => ({ x: sx - VOYAGE_OFFSET.x, y: sy - VOYAGE_OFFSET.y });

export function enterVoyage(engine) {
  const scene = buildVoyageScene(engine.PIXI);
  const spawn = toScreen(VOYAGE_ARRIVAL.x, VOYAGE_ARRIVAL.y);
  const returnTo = { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
  engine.stopFollowing?.();
  engine.closeMap?.();
  engine.enterScene({
    tsid: VOYAGE_SCENE,
    label: VOYAGE_LABEL,
    // G363: no hub line. The voyage is the purple_journey instance (players/inc_special_locations.js
    // 392-393), and getLoadingInfo sends an instance no hub_name (location.js 3311).
    hubName: '',
    width: VOYAGE_W,
    height: VOYAGE_H,
    background: scene.background,
    platforms: scene.platforms,
    walls: [],
    spawn: { x: spawn.x, y: VOYAGE_FLOOR },
    returnTo,
    ownLight: true,
  });
  const t = now();
  // purple_emperor.js onPlayerEnter.
  run = { returnTo, enteredAt: t, nextScionAt: t + EMPEROR.firstScionMs, nextQuoinAt: t + EMPEROR.firstQuoinMs, scions: 0, feelingBetter: false };
  if (engine.hasBuff(JOURNEY_BUFF)) engine.removeBuff(JOURNEY_BUFF);
  engine.applyBuff(JOURNEY_BUFF);
  // purple_journey on_apply: delete pc.taken_purple.
  taken = false;
  journeyOn = true;
  // The room's music (inc_data_sounds.js music_map PURPLE_LOCATION, ZeGroupTheme.mp3) is recovered
  // (assets/audio/sfx/PURPLE_LOCATION.mp3, Sounds.zip) but this room does not play it yet.
  haze([{ alpha: 0.5, secs: 0.2 }, { alpha: 0, secs: 1.2 }]);
  last = 'room:enter';
  engine.save?.();
  publish(engine);
  return true;
}

function between(rng, [a, b]) {
  return a + rng() * (b - a);
}

/* ---- Scions of Purple ---- */

const SCION_SHEETS = ['scion_of_purple', 'scion_of_purple_fade'];
let scionFrames = null;
function scionTextures(engine) {
  if (scionFrames) return scionFrames;
  const { PIXI } = engine;
  const cut = (name) => {
    const art = POTION_ART[name];
    // R30: held, given back with releaseTexture when the room is left.
    const base = holdSource(art.url);
    const frames = [];
    for (let i = 0; i < art.frames; i += 1) {
      frames.push(frameTexture(base, new PIXI.Rectangle((i % art.cols) * art.cellW, Math.floor(i / art.cols) * art.cellH, art.cellW, art.cellH)));
    }
    const labels = {};
    for (const [label, [start, count]] of Object.entries(art.labels)) labels[label] = { frames: frames.slice(start, start + count), art, start, all: frames };
    return labels;
  };
  scionFrames = Object.assign({}, ...SCION_SHEETS.map(cut));
  return scionFrames;
}

/** The 1x sheets go when the room is left (they were kept for the rest of the session before G961). */
function releaseScionTextures() {
  if (!scionFrames) return;
  const seen = new Set();
  for (const set of Object.values(scionFrames)) {
    // One cut per sheet: its labels share `all`.
    if (seen.has(set.all)) continue;
    seen.add(set.all);
    const source = set.all[0]?.source;
    for (const t of set.all) if (!t.destroyed) t.destroy(false);
    if (source) releaseTexture(source);
  }
  scionFrames = null;
}

/* ---- G961: the Scion sharp while it is on screen ---- */

/** purple_apparition.js: what a Scion plays after each state (idle1 or idle2 is picked when it appears). */
export function scionNextState(state, idleKind) {
  return { fadeIn: 'talk', talk: 'idle0', idle0: idleKind, idle1: 'fadeOut', idle2: 'fadeOut' }[state] || null;
}

/** PURE: the labels a Scion holds sharp: the one it plays and the next (fetched while this one plays). */
export function scionHeldLabels(state, idleKind) {
  return [state, scionNextState(state, idleKind)].filter(Boolean);
}

let sharp = null; // js/onscreen-sharp.js holder, once the device has been asked
function scionSharp(engine) {
  if (sharp) return sharp;
  const { PIXI } = engine;
  const renderer = engine.renderer;
  if (!PIXI?.loadKTX2onWorker || !renderer) return null;
  const formats = rendererCompressedFormats(renderer);
  const allowed = sharpAllowed({
    off: engine.param?.('onscreensharp') === 'off',
    device: globalThis.GRODDLE_DEVICE || null,
    resolution: (renderer.resolution || 1) * Math.abs(engine.stage?.scale?.x || 1),
    deviceMemory: globalThis.navigator?.deviceMemory ?? null,
    maxTextureSize: maxTextureSizeOf(renderer),
    formats,
  });
  sharp = createOnscreenSharp({ PIXI, allowed, load: ktx2Loader(PIXI, formats), onReady: () => sharpenScions() });
  return sharp;
}

const scionArtPath = (label) => scionFrames?.[label]?.art.url || null;

/** The label's frames with the sharp ones in, or null until they are. */
function sharpFrames(set, label) {
  const map = sharp?.frames(set.art.url, label);
  return map ? set.frames.map((t, j) => map.get(set.start + j) || t) : null;
}

/** PURE: what a Scion lets go of and takes up when it changes state (gone: everything goes). */
export function scionHoldChange(held, state, idleKind, gone = false) {
  const want = gone ? [] : scionHeldLabels(state, idleKind);
  return { release: [...held].filter((l) => !want.includes(l)), hold: want.filter((l) => !held.has(l)) };
}

function holdScionArt(s) {
  if (!sharp) return;
  const { release, hold } = scionHoldChange(s.held, s.state, s.idleKind, s.vanished);
  for (const label of release) {
    sharp.release(scionArtPath(label), label);
    s.held.delete(label);
  }
  for (const label of hold) if (sharp.hold(scionArtPath(label), label)) s.held.add(label);
}

/** A held label arrived: Scions playing it swap to the sharp frames where they are. */
function sharpenScions() {
  for (const s of scions) {
    if (s.sharp || s.sprite.destroyed || !s.state) continue;
    const set = scionFrames?.[s.state];
    const frames = set && sharpFrames(set, s.state);
    if (!frames) continue;
    const frame = s.sprite.currentFrame;
    const playing = s.sprite.playing;
    s.sprite.textures = frames;
    if (playing) s.sprite.gotoAndPlay(frame);
    else s.sprite.gotoAndStop(frame);
    s.sharp = true;
  }
  unloadScionSheets(scions[0]?.engine);
}

/**
 * Once every Scion on screen draws sharp, the 1x sheets' GPU copies go (the fade sheet is drawn for
 * the moment a Scion's sharp fade-in is still loading); the decoded images stay, so a Scion drawn at
 * 1x again uploads them again.
 */
function unloadScionSheets(engine) {
  const managed = engine?.renderer?.texture?.managedTextures;
  if (!scionFrames || !managed || !scions.length || scions.some((s) => !s.sharp && !s.sprite.destroyed)) return;
  for (const set of Object.values(scionFrames)) {
    const src = set.all[0]?.source;
    if (src && !src.destroyed && managed.includes(src)) src.unload?.();
  }
}

function dropScion(s) {
  s.vanished = true;
  holdScionArt(s);
  if (!s.sprite.destroyed) {
    s.sprite.parent?.removeChild(s.sprite);
    s.sprite.destroy();
  }
}

function setScionState(s, label, loop = true) {
  const set = scionTextures(s.engine)[label];
  if (!set || s.sprite.destroyed) return;
  s.state = label;
  holdScionArt(s);
  const crisp = sharpFrames(set, label);
  s.sharp = Boolean(crisp);
  s.sprite.textures = crisp || set.frames;
  s.sprite.anchor.set(set.art.anchorX / set.art.cellW, set.art.anchorY / set.art.cellH);
  s.sprite.scale.set(set.art.scale);
  s.sprite.loop = loop;
  s.sprite.animationSpeed = 10 / 60;
  s.sprite.gotoAndPlay(0);
  if (crisp) unloadScionSheets(s.engine);
}

function scionContext(engine) {
  const inv = engine.inv || {};
  const named = (cls) => {
    const meta = ITEM_CATALOG[cls] || {};
    const single = meta.label || '';
    return single ? { single, plural: meta.namePlural || (single.endsWith('s') ? single : `${single}s`) } : null;
  };
  const pack = Object.entries(inv).filter(([, n]) => n > 0).map(([cls, count]) => ({ ...named(cls), count })).filter((r) => r.single);
  const catalog = Object.values(ITEM_CATALOG).filter((m) => m?.label && (Number(m.baseCost) || 0) > 0 && !(m.tags || []).includes('no_rube'))
    .map((m) => ({ plural: m.namePlural || (m.label.endsWith('s') ? m.label : `${m.label}s`) }));
  let house = [];
  try {
    const decor = homesFeature._state?.().houseDecor;
    const counts = {};
    for (const row of decor?.placed || []) counts[row.classTsid] = (counts[row.classTsid] || 0) + 1;
    house = Object.entries(counts).map(([cls, count]) => ({ ...named(cls), count })).filter((r) => r.single);
  } catch {
    house = [];
  }
  const cat = getAchievementCatalog() || {};
  const badges = (engine.unlockedAchievements || []).map((id) => cat[id]?.name).filter(Boolean);
  const streets = (engine.visitedStreets?.() || []).map((tsid) => STREET_INDEX.streets?.[tsid]?.label
    || STREET_INDEX.streets?.[String(tsid).replace(/^G/, 'L')]?.label || '').filter(Boolean);
  return { pack, catalog, house, badges, streets };
}

/** manifestStrangeness. */
function manifestScion(engine) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI?.AnimatedSprite || !p) return;
  const geoPlayer = toGeo(p.x, p.y);
  const pos = toScreen(...Object.values(emperorPosition(geoPlayer)));
  const first = scionTextures(engine).fadeIn;
  if (!first) return;
  scionSharp(engine);
  const spr = new PIXI.AnimatedSprite(first.frames);
  spr.x = pos.x;
  spr.y = pos.y;
  spr.zIndex = 45;
  spr.eventMode = 'none';
  engine.entityLayer.addChild(spr);
  const s = { engine, sprite: spr, label: 'Scion of Purple', born: now(), spoke: false, talkUntil: 0, idleAt: 0, vanishing: false, state: '', idleKind: Math.random() < 0.5 ? 'idle1' : 'idle2', held: new Set(), sharp: false, vanished: false };
  setScionState(s, 'fadeIn', false);
  scions.push(s);
  run.scions += 1;
  last = `scion:${run.scions}`;
}

function tickScions(engine, t) {
  for (const s of [...scions]) {
    const age = t - s.born;
    if (s.sprite.destroyed) {
      dropScion(s);
      scions = scions.filter((x) => x !== s);
      continue;
    }
    if (!s.spoke && age >= SCION.speakMs) {
      // speak: talk, the bubble for 9 s, back to idle0 after 3 s.
      s.spoke = true;
      const words = scionWords(scionContext(engine));
      engine.say?.({ sprite: s.sprite, label: s.label }, words.text, SCION.bubbleMs);
      setScionState(s, 'talk');
      s.talkUntil = t + SCION.talkMs;
      engine.setData?.('purpleScionWords', words.text);
    } else if (s.talkUntil && t >= s.talkUntil && s.state === 'talk') {
      setScionState(s, 'idle0');
      s.idleAt = t + SCION.idleAfterTalkMs;
    } else if (s.idleAt && t >= s.idleAt && s.state === 'idle0') {
      setScionState(s, s.idleKind);
    }
    if (!s.vanishing && age >= SCION.vanishMs) {
      s.vanishing = true;
      setScionState(s, 'fadeOut', false);
    }
    if (age >= SCION.dieMs) {
      dropScion(s);
      scions = scions.filter((x) => x !== s);
    }
  }
}

/* ---- Quoins ---- */

let quoinBase = null;
function quoinFrames(engine, type) {
  const { PIXI } = engine;
  quoinBase ||= sourceFromUrl(QUOIN_SHEET.url);
  const row = QUOIN_TYPES[type]?.row ?? 0;
  const out = [];
  for (let c = 0; c < QUOIN_SHEET.columns; c += 1) {
    out.push(frameTexture(quoinBase, new PIXI.Rectangle(c * QUOIN_SHEET.frameWidth, row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight)));
  }
  return out;
}

/** manifestQuoin (createItemStackWithPoof). */
function manifestQuoin(engine) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI?.AnimatedSprite || !p) return;
  const q = emperorQuoin();
  const pos = toScreen(...Object.values(emperorPosition(toGeo(p.x, p.y))));
  const spr = new PIXI.AnimatedSprite(quoinFrames(engine, q.type));
  spr.anchor.set(0.5, 0.5);
  spr.animationSpeed = 0.4;
  spr.scale.set(q.big ? 1.2 : 0.9);
  spr.x = pos.x;
  spr.y = pos.y;
  spr.zIndex = 40;
  spr.eventMode = 'none';
  spr.play();
  engine.entityLayer.addChild(spr);
  // createItemStackWithPoof (location.js 2054-2071): it appears in a
  // proto_puff centred on it (G272).
  const h = Math.abs(spr.height) || 40;
  playPoofIn(PIXI, { layer: engine.fxLayer || engine.entityLayer, x: pos.x, bottom: pos.y + h / 2, itemH: h });
  quoins.push({ sprite: spr, x: pos.x, y: pos.y, ...q });
}

function tickQuoins(engine) {
  const p = engine.player;
  if (!p) return;
  const scale = engine.query?.('avatarBodyScale', engine) ?? 1;
  for (const q of [...quoins]) {
    // Ticket 37: the street quoin's box (items/quoin.js onPlayerCollision 156, js/quoins.js quoinTouches).
    const quoinScale = Math.abs(q.sprite?.scale?.y || 1);
    if (quoinTouches({ x: q.x, y: q.y, typeId: q.type }, p.x, p.y, { scale, quoinScale })) {
      // quoin.js onPlayerCollision: the daily limit holds here (not a game or Paradise). Ticket 94: at
      // the limit the quoin stays, as on a street, and the line shows at most every 5 s (game.js grabWorldQuoin).
      const res = collectQuoin(engine.quoinState, q.type, engine.pc, { amount: q.amount });
      // At the limit a quoin gives nothing (quoin.js 159); #202: a line says why, once a minute.
      if (res.reason === 'daily_limit') {
        engine.quoinLimitTouched?.();
        continue;
      }
      if (res.hitLimit) engine.announceQuoinLimit?.(res.dailyLimit);
      quoins = quoins.filter((x) => x !== q);
      q.sprite.parent?.removeChild(q.sprite);
      q.sprite.destroy();
      if (res.ok) {
        const lab = QUOIN_TYPES[res.resolvedTypeId || q.type]?.label || 'iMG';
        // items/quoin.js 205: an iMG quoin shows what landed after the mood bonus.
        engine.floatText?.(q.x, q.y - 16, `+${['xp', 'qurazy'].includes(res.resolvedTypeId) ? res.actual : res.amount} ${lab}`, '#ffffff');
        engine.playSound?.(`QUOIN_${String(res.typeId || 'xp').toUpperCase()}`, { volume: 0.5 });
      }
      engine.refreshPack?.();
      last = `quoin:${q.type}:${q.amount}`;
    }
  }
}

function clearRoomEntities() {
  for (const s of scions) dropScion(s);
  for (const q of quoins) if (!q.sprite.destroyed) q.sprite.destroy();
  scions = [];
  quoins = [];
  sharp?.releaseAll();
  releaseScionTextures();
}

function tickRoom(engine, t) {
  if (!run || engine.streetTsid !== VOYAGE_SCENE) return;
  const f = engine.param?.('purplehold') === '1';
  if (f) {
    const row = engine.buffRow?.(JOURNEY_BUFF);
    if (row?.expiresAt) row.expiresAt = Math.max(row.expiresAt, t + 30_000);
  }
  if (run.scions < EMPEROR.scions && t >= run.nextScionAt) {
    manifestScion(engine);
    run.nextScionAt = t + between(Math.random, EMPEROR.scionEveryMs);
  }
  if (!run.feelingBetter && t >= run.nextQuoinAt) {
    manifestQuoin(engine);
    run.nextQuoinAt = t + between(Math.random, EMPEROR.quoinEveryMs);
  }
  if (!run.feelingBetter && !f && t - run.enteredAt >= EMPEROR.finishMs) {
    // finishUp.
    run.feelingBetter = true;
    engine.pushActivity?.(PURPLE_TEXT.feelingBetter);
  }
  tickScions(engine, t);
  tickQuoins(engine);
}

/** catalog_buffs.js purple_journey on_remove. */
async function journeyOver(engine) {
  const back = run?.returnTo;
  const inside = engine.streetTsid === VOYAGE_SCENE;
  run = null;
  clearRoomEntities();
  if (engine.hasBuff(PURPLED_OUT_BUFF)) engine.removeBuff(PURPLED_OUT_BUFF);
  engine.applyBuff(PURPLED_OUT_BUFF);
  counterAt = now() + COUNTER_DELAY_MS;
  last = 'journey:over';
  publish(engine);
  if (inside && back?.tsid) {
    await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true });
  }
  engine.save?.();
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

function setupDemo(engine) {
  if (demoDone || engine.param?.('purpledemo') !== '1') return;
  demoDone = true;
  if (countItem(engine.inv, ESSENCE) < 2) addItem(engine.inv, ESSENCE, 2 - countItem(engine.inv, ESSENCE));
  engine.removeBuff?.(PURPLED_OUT_BUFF);
  engine.setData?.('purpleDemo', '1');
  engine.refreshPack?.();
  const mode = engine.param?.('purpleautoplay');
  if (mode) autoplay = { mode, at: now() + 1500 };
}

function runAutoplay(engine) {
  const mode = autoplay.mode;
  autoplay = null;
  if (mode === 'room') {
    enterVoyage(engine);
    return;
  }
  imbibeEssence(engine);
  if (mode === 'wasted') imbibeEssence(engine);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const purpleJourneyFeature = {
  id: PURPLE_FEATURE_ID,

  onStreetEnter(street, engine) {
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear() {
    // purple_emperor.js onPlayerExit: no more Scions for someone who left.
    clearRoomEntities();
    clearVogs();
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    if (autoplay && t >= autoplay.at && !engine.busy?.()) runAutoplay(engine);
    if (startedAt) tickCountdown(engine, t);
    tickRoom(engine, t);
    const on = engine.hasBuff(JOURNEY_BUFF);
    if (journeyOn && !on) journeyOver(engine);
    journeyOn = on;
    if (counterAt && t >= counterAt) {
      counterAt = 0;
      // achievements_increment_delayed: essence_of_purple / journeys_taken (Elementary Penguin at 3).
      engine.achievement(JOURNEY_COUNTER, 1);
      last = 'journey:counted';
    }
    publish(engine);
  },

  /** The scene keeps no ordinary signposts; a reload resumes where you came from (enterScene's returnTo). */
  labelFor(tsid) {
    return tsid === VOYAGE_SCENE ? { street: VOYAGE_LABEL, hub: '', hubId: 'scene' } : null;
  },

  /** purple_flower.js canMunch while Purpled Out. */
  packUseGate(classTsid, engine) {
    if (classTsid === 'purple_flower' && engine?.hasBuff?.(PURPLED_OUT_BUFF)) return { ok: false, msg: PURPLE_TEXT.noMunch };
    return null;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== ESSENCE || countItem(engine.inv, classTsid) < 1) return [];
    return [imbibeButton(imbibeCtx(engine))];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== ESSENCE || verbId !== 'imbibe') return false;
    imbibeEssence(engine);
    return true;
  },

  save() {
    return { version: 1, taken, startedAt, cursor, counterAt };
  },

  restore(slice) {
    const t = now();
    taken = slice?.taken === true;
    startedAt = Math.max(0, Number(slice?.startedAt) || 0);
    cursor = Math.max(0, Math.floor(Number(slice?.cursor) || 0));
    counterAt = Math.max(0, Number(slice?.counterAt) || 0);
    // A countdown left behind by a reload: resume it if the room is still ahead, else the sip is spent.
    const enterRow = TIMELINE.findIndex((r) => r.enter);
    if (startedAt && t > startedAt + SIP_DELAY_MS + TIMELINE[enterRow].at + 60_000) {
      startedAt = 0;
      taken = false;
    }
    if (!startedAt) taken = false;
    run = null;
    journeyOn = false;
  },

  /** Tests. */
  _state() {
    return { taken, startedAt, cursor, run: run ? { ...run } : null, journeyOn, counterAt, scions: scions.length, quoins: quoins.length, last, scionStates: scions.map((s) => ({ state: s.state, sharp: s.sharp, held: [...s.held] })), sharp: sharp?.stats() || null };
  },
  _reset() {
    taken = false;
    startedAt = 0;
    cursor = 0;
    run = null;
    journeyOn = false;
    counterAt = 0;
    scions = [];
    quoins = [];
    last = '';
    demoDone = false;
    autoplay = null;
    scionFrames = null;
    sharp = null;
    quoinBase = null;
  },
};
