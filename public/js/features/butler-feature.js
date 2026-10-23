/**
 * The Butler on the home street (rules and copy in js/butler.js).
 *
 * Source: items/bag_butler.js (+ include/butler_*.js), items/butler_box.js,
 * players/inc_butler.js, locations/home.js. See js/butler.js for the map.
 *
 * What the solo Butler does:
 *  - Arrives as a "Special One-Time Delivery" box on the home street once you
 *    own a home and are level 3. Read label (four beats), Open: a puff, the
 *    Butler 750 ms later where the box stood (a random one of three looks),
 *    and two seconds later "Thank you. I am very happy to be here with you".
 *  - Stands at its post right of the door, strolls up to 300 px either side,
 *    idles (idle1-4), steps back when you walk into it, waves when you come
 *    within 550 px, acknowledges you at 250 px, and walks back to its post 15 s
 *    after your last command.
 *  - Greets you when you come home (bow, "Welcome home." and how long you were
 *    away), then says what it holds and whether you have mail.
 *  - Holds what neighbours leave when they drop by (Visiting Stone opt-in):
 *    the gift as a package, the line as a message; "packages" / "messages"
 *    hand them over one at a time with the source lines.
 *  - Verbs: talk to (How can I be of service?: mailbox, messages, packages,
 *    a joke, teach a greeting or an idle line), chat (the click responses,
 *    annoyed when poked), mailbox, packages / messages, who visited?, give (a
 *    gift for visitors), name, customize (the three looks), set post, dance
 *    (faster, then it falls over), jump, zombie, muffle / dispense butlerly
 *    wisdom (hints), zip it / chatter (idle chatter, with the Tower line).
 *  - Hears about the club: back from Join the Club's painting, the quest
 *    turns in when you come within 550 px of the Butler at home (doQuests;
 *    quest-rooms/clubhouse.js world hook via butlerApi.questReady/hearQuest).
 *
 * QA (with ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home):
 *   &butlerdemo=1        a Butler at its post (&butlerlook=v10|v11|v22,
 *                        &butleraway=<game days> since your last visit)
 *   &butlerdemo=box      the delivery box (no level check)
 *   &butlerdemo=parcel   a Butler holding Dorrit's drop-by package and note
 *   &butlerdemo=owned    own a Butler without going home (Visiting Stone QA:
 *                        &homedemo=owned&stonedemo=1&stoneautoplay=optin)
 *   &butlerautoplay=greet|parcel|parceldone|rename|look|box|talk|joke|dance|
 *                   hint|tower|gift|visitors|mailbox
 * Join the Club end to end: ?autostart=1&fresh=1&resetgame=1&questoffer=off&
 *   homedemo=owned&butlerdemo=owned&questdemo=join_club&questautoplay=1&questfx=0,
 *   then Home → Teleport home (canvas clubButler=heard, butlerLast=quest:join_club).
 * Canvas data: butlerState, butlerName, butlerLook, butlerX, butlerPost,
 *   butlerAnim, butlerMode, butlerPackages, butlerMessages, butlerGift,
 *   butlerDialog, butlerLast, butlerVisitors, butlerAutoplay.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, listPackItemSlots, removeItem } from '../inventory.js?v=catalog-unified-3';
import { homeStreetLayout, towerItem } from '../home-cultivation.js?v=home-cultivation-1';
import { homesFeature } from './homes-feature.js?v=homes-7';
import { levelInfoForXp } from '../progression.js?v=progression-1';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js';
import { NEIGHBOURS, NEIGHBOUR_ITEMS, neighbourById } from '../neighbours.js?v=neighbours-1';
import {
  BUTLER,
  BUTLER_BOX,
  BUTLER_BOX_ART,
  BUTLER_FPS,
  BUTLER_FRAMES,
  BUTLER_INTRO,
  BUTLER_INTRO_REPLY,
  BUTLER_JOKES,
  BUTLER_LOOKS,
  BUTLER_LOOPERS,
  BUTLER_PART_NAMES,
  BUTLER_PART_ORDER,
  BUTLER_SERVICE,
  BUTLER_STRINGS,
  BUTLER_TEACH,
  afterGreetingForOwner,
  boxDue,
  butlerCounts,
  butlerLook,
  butlerName,
  butlerSheetUrl,
  butlerText,
  clickResponse,
  createButler,
  createButlerState,
  giftOffer,
  giveGiftTo,
  hintDue,
  idleChatter,
  nearLevel,
  nextHandover,
  normalizeButlerState,
  ownerGreeting,
  packagesAndMessagesForOwner,
  pickHint,
  pluralize,
  recordVisitor,
  renameButler,
  retrieveVerbs,
  serializeButlerState,
  setGift,
  takeVisitorDelivery,
  teachButler,
  visitorsReport,
} from '../butler.js?v=butler-1';

export const BUTLER_FEATURE_ID = 'butler';
const HOME_STREET_TSID = 'RH_HOME_EXT';
/** The box (and so the first post) stands right of the door, inside the house lot. */
const BOX_RX = 300;
const Z = 29;

let st = createButlerState();
let view = null; // { box, butler }
let dialog = null;
let dialogState = null;
let lastTsid = null;
let lastMsg = '';
let publishAt = 0;
let pendingOpenAt = 0;
let pendingOpenX = 0;
let introAt = 0;
let greetTimers = [];
let demo = null;
let autoplay = null;
let frameCache = new Map();
let visitsAllowed = () => false;
let canOptInFn = () => false;
const rt = {
  x: 0,
  dir: 'left', // the art faces left
  mode: 'idle', // idle | walk | attending | dance | step | interacting
  walkTo: null,
  walkClip: 'walk4',
  idleUntil: 0,
  modeUntil: 0,
  lastCommandAt: 0,
  lastTickSec: 0,
  lastSpeakAt: 0,
  clicks: [],
  near: false,
  far: false,
  stepAt: 0,
  danceFaster: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return Date.now();
}

function currentRoom(engine) {
  const ctx = engine.homeContext?.();
  if (!ctx?.inHome) return null;
  return engine.streetTsid === HOME_STREET_TSID ? 'street' : null;
}

function layout() {
  const cult = homesFeature._state?.()?.cult;
  return homeStreetLayout(cult || {});
}

function houseX() {
  return layout().houseX;
}

function postX() {
  const l = layout();
  const rx = st.post ?? BOX_RX;
  return Math.max(60, Math.min(l.width - 60, l.houseX + rx));
}

function itemName(cls, n = 1) {
  const meta = ITEM_CATALOG[cls] || NEIGHBOUR_ITEMS[cls] || {};
  const single = meta.label || String(cls).replace(/_/g, ' ');
  const many = meta.namePlural || `${single}s`;
  return pluralize(n, single, many);
}

function stackMax(cls) {
  return Number(ITEM_CATALOG[cls]?.stackMax) || 999;
}

function level(engine) {
  return Math.max(1, Math.floor(Number(engine.pc?.level) || 1));
}

function hasTower() {
  return Boolean(towerItem(homesFeature._state?.()?.cult || {}));
}

function say(engine, text, ms = 3000, { activity = false } = {}) {
  if (!text) return;
  lastMsg = text;
  rt.lastSpeakAt = performance.now();
  if (view?.butler?.target) engine.say?.(view.butler.target, text, ms);
  if (activity) engine.pushActivity?.(`${butlerName(st)}: ${text}`);
  publish(engine, true);
}

function command() {
  rt.lastCommandAt = performance.now();
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------

function clipFrames(engine, clip) {
  const look = butlerLook(st.look);
  const key = `${look.id}:${clip}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const { PIXI } = engine;
  const base = sourceFromUrl(butlerSheetUrl(look.id, clip));
  const cols = look.cols[clip] || 1;
  const list = [];
  for (let i = 0; i < (BUTLER_FRAMES[clip] || 1); i += 1) {
    list.push(frameTexture(base, new PIXI.Rectangle((i % cols) * look.cell.w, Math.floor(i / cols) * look.cell.h, look.cell.w, look.cell.h)));
  }
  frameCache.set(key, list);
  return list;
}

function setClip(engine, clip, { loop = BUTLER_LOOPERS.includes(clip), then = null } = {}) {
  const v = view?.butler;
  if (!v || v.anim.destroyed) return;
  v.anim.textures = clipFrames(engine, clip);
  v.anim.loop = loop;
  v.clip = clip;
  v.anim.onComplete = loop ? null : () => {
    v.anim.onComplete = null;
    if (then) then();
    else restClip(engine);
  };
  if ((BUTLER_FRAMES[clip] || 1) > 1) v.anim.gotoAndPlay(0);
  else v.anim.gotoAndStop(0);
  if (clip === 'idle2') engine.playSound?.('BUTLER_DOLL_IDLE_2', { volume: 0.5 });
  if (clip === 'fall') engine.playSound?.('BUTLER_DOLL_FALL', { volume: 0.6 });
  publish(engine);
}

/** The clip for what the Butler is doing now (endAnim → idle0, or the walk). */
function restClip(engine) {
  if (rt.mode === 'walk' || rt.mode === 'step') setClip(engine, rt.mode === 'step' ? 'stepBack' : rt.walkClip);
  else if (rt.mode === 'dance') setClip(engine, 'dance');
  else setClip(engine, 'idle0');
}

/** reactionAllowed: free to react (not mid one-off clip, not busy). */
function reactionAllowed() {
  const v = view?.butler;
  if (!v) return false;
  if (!['idle', 'attending'].includes(rt.mode)) return false;
  return v.clip === 'idle0' || v.clip === 'walk4' || v.clip === 'walk3';
}

function oneOff(engine, clip, then) {
  setClip(engine, clip, { loop: false, then });
}

function faceX(x) {
  rt.dir = x < rt.x ? 'left' : 'right';
}

function spawnBox(engine) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(BUTLER_BOX_ART));
  spr.anchor.set(0.5, 0.97);
  spr.x = houseX() + BOX_RX;
  spr.y = engine.groundY + 2;
  spr.zIndex = Z;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: BUTLER_BOX.CLASS,
    featureId: BUTLER_FEATURE_ID,
    label: BUTLER_BOX.label,
    subtitle: st.boxRead ? 'Open me!' : BUTLER_BOX.description,
    sprite: spr,
    state: {},
  });
  return { sprite: spr, target };
}

function subtitle() {
  const c = butlerCounts(st);
  const bits = [];
  if (c.packages) bits.push(pluralize(c.packages, 'package', 'packages'));
  if (c.plainMessages) bits.push(pluralize(c.plainMessages, 'message', 'messages'));
  return bits.length ? `Holding ${bits.join(' and ')} for you` : 'Your Butler';
}

function spawnButler(engine) {
  const { PIXI } = engine;
  const look = butlerLook(st.look);
  const box = new PIXI.Container();
  box.zIndex = Z;
  const anim = new PIXI.AnimatedSprite(clipFrames(engine, 'idle0'));
  anim.anchor.set(look.anchor.x, look.anchor.y);
  anim.animationSpeed = BUTLER_FPS / 60;
  box.addChild(anim);
  box.x = rt.x;
  box.y = engine.groundY + 2;
  engine.entityLayer.addChild(box);
  const target = engine.register({
    classId: BUTLER.CLASS,
    featureId: BUTLER_FEATURE_ID,
    label: butlerName(st),
    subtitle: subtitle(),
    sprite: box,
    state: {},
  });
  const v = { container: box, anim, target, clip: null, look: look.id };
  return v;
}

function respawnButler(engine) {
  if (!view?.butler) return;
  // unregister removes and destroys the container.
  engine.unregister?.(view.butler.target);
  view.butler = spawnButler(engine);
  setClip(engine, 'idle0');
}

function clearView() {
  view = null;
  rt.greeting = null;
  for (const id of greetTimers) clearTimeout(id);
  greetTimers = [];
}

function spawnView(engine) {
  clearView();
  view = { box: null, butler: null };
  const forcedBox = demo?.kind === 'box';
  if (!st.owned && (forcedBox || boxDue(st, { homeOwned: engine.homeContext?.().owned === true, level: level(engine) }))) {
    view.box = spawnBox(engine);
    if (pendingOpenAt) {
      engine.unregister?.(view.box.target);
      view.box = null;
    }
  }
  if (st.owned) {
    if (!rt.x || rt.lastStreet !== engine.streetTsid) rt.x = postX();
    rt.lastStreet = engine.streetTsid;
    rt.mode = 'idle';
    rt.walkTo = null;
    rt.idleUntil = performance.now() + 3000;
    view.butler = spawnButler(engine);
    setClip(engine, 'idle0');
  }
}

// ---------------------------------------------------------------------------
// Dialog (the source's conversation bubbles and input boxes)
// ---------------------------------------------------------------------------

const CSS = `
#butler-dialog .butler-card { width: min(470px, calc(100vw - 32px)); }
#butler-dialog .bd-body { display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.2rem 0.95rem 0.4rem; }
#butler-dialog .bd-portrait { flex: 0 0 auto; width: 74px; height: 84px; display: flex; align-items: flex-end; justify-content: center; }
#butler-dialog .bd-portrait img { max-width: 100%; max-height: 100%; image-rendering: auto; }
#butler-dialog .bd-text { margin: 0.2rem 0 0.4rem; line-height: 1.4; white-space: pre-line; }
#butler-dialog .bd-choices { display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: flex-end; padding: 0.3rem 0.95rem 0.95rem; }
#butler-dialog .bd-choices.bd-stack { flex-direction: column; align-items: stretch; }
#butler-dialog .bd-btn { font: inherit; border: 1px solid #e0d3bb; border-radius: 9px; padding: 0.4rem 0.85rem; background: #fffdf8; cursor: pointer; text-align: left; }
#butler-dialog .bd-btn:hover, #butler-dialog .bd-btn:focus-visible { background: #f6efe1; }
#butler-dialog .bd-btn.primary { border-color: #9cc47a; background: #e8f0dc; font-weight: 700; }
#butler-dialog .bd-input { font: inherit; width: 100%; box-sizing: border-box; padding: 0.45rem 0.6rem; border: 1px solid #d9ccb3; border-radius: 8px; background: #fff; }
#butler-dialog .bd-label { display: block; font-size: 0.82rem; opacity: 0.75; margin: 0.1rem 0 0.3rem; }
#butler-dialog .bd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 0.4rem; max-height: 220px; overflow: auto; margin-top: 0.3rem; }
#butler-dialog .bd-item { font: inherit; font-size: 0.72rem; border: 1px solid #e4d9c4; border-radius: 8px; background: #fff; padding: 0.3rem 0.2rem; display: grid; justify-items: center; gap: 0.15rem; cursor: pointer; }
#butler-dialog .bd-item[aria-pressed="true"] { border-color: #8bb565; background: #eef5e4; }
#butler-dialog .bd-item img { width: 36px; height: 36px; object-fit: contain; }
#butler-dialog .bd-looks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; margin-top: 0.3rem; }
#butler-dialog .bd-look { font: inherit; font-size: 0.72rem; border: 1px solid #e4d9c4; border-radius: 9px; background: #fff; padding: 0.35rem; cursor: pointer; display: grid; justify-items: center; gap: 0.2rem; }
#butler-dialog .bd-look[aria-pressed="true"] { border-color: #8bb565; background: #eef5e4; font-weight: 700; }
#butler-dialog .bd-look img { height: 78px; }
#butler-dialog .bd-parts { font-size: 0.7rem; opacity: 0.75; line-height: 1.3; text-align: center; }
#butler-dialog .bd-count { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
#butler-dialog .bd-count input { width: 5rem; }
`;

function ensureDialog(engine) {
  if (dialog || typeof document === 'undefined') return dialog;
  if (!document.getElementById('butler-css')) {
    const style = document.createElement('style');
    style.id = 'butler-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  dialog = document.createElement('div');
  dialog.id = 'butler-dialog';
  dialog.className = 'glitch-modal';
  dialog.hidden = true;
  dialog.innerHTML = `<div class="glitch-modal-card butler-card" role="dialog" aria-modal="true" aria-labelledby="bd-title">
    <div class="glitch-modal-head"><h2 id="bd-title" data-bd-title>Butler</h2><button type="button" class="verb-menu-x" data-bd-close aria-label="Close">×</button></div>
    <div class="bd-body"><div class="bd-portrait"><img data-bd-portrait alt=""></div><div class="bd-main"><p class="bd-text" data-bd-text></p><div data-bd-extra></div></div></div>
    <div class="bd-choices" data-bd-choices></div></div>`;
  (document.getElementById('make-panel')?.parentElement || document.body).appendChild(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-bd-close]')) closeDialog(engine, 'close');
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog(engine, 'close');
    }
  });
  return dialog;
}

/**
 * Open a conversation step: { key, title, text, portrait, choices: [{ value,
 * txt, primary }], stack, input: { label, value, max }, extra(el), onChoice }.
 */
function openDialog(engine, step) {
  if (!ensureDialog(engine)) return;
  dialogState = step;
  rt.mode = 'interacting';
  command();
  dialog.querySelector('[data-bd-title]').textContent = step.title || butlerName(st);
  const portrait = dialog.querySelector('[data-bd-portrait]');
  portrait.src = step.portrait || (st.owned ? butlerSheetUrl(st.look, 'idle0') : BUTLER_BOX_ART);
  dialog.querySelector('[data-bd-text]').textContent = step.text || '';
  const extra = dialog.querySelector('[data-bd-extra]');
  extra.innerHTML = '';
  let input = null;
  if (step.input) {
    const label = document.createElement('label');
    label.className = 'bd-label';
    label.textContent = step.input.label || '';
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'bd-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (step.input.max) input.maxLength = step.input.max;
    input.value = step.input.value || '';
    input.dataset.bdInput = '1';
    label.appendChild(input);
    extra.appendChild(label);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const primary = (step.choices || []).find((c) => c.primary) || step.choices?.[0];
        if (primary) choose(engine, primary.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(engine, 'close');
      }
    });
  }
  step.extra?.(extra);
  const box = dialog.querySelector('[data-bd-choices]');
  box.innerHTML = '';
  box.classList.toggle('bd-stack', Boolean(step.stack));
  for (const c of step.choices || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `bd-btn${c.primary ? ' primary' : ''}`;
    b.textContent = c.txt;
    b.dataset.butlerChoice = c.value;
    if (c.disabled) b.disabled = true;
    b.addEventListener('click', () => choose(engine, c.value));
    box.appendChild(b);
  }
  dialog.dataset.step = step.key || '';
  dialog.hidden = false;
  if (input) requestAnimationFrame(() => input.focus());
  else requestAnimationFrame(() => box.querySelector('button')?.focus());
  if (view?.butler && st.owned) {
    faceX(engine.player?.x ?? rt.x);
    if (step.talk !== false && reactionAllowedLoose()) oneOff(engine, 'talk');
  }
  publish(engine, true);
}

function reactionAllowedLoose() {
  const clip = view?.butler?.clip;
  return clip === 'idle0' || clip === 'talk' || clip === 'walk4';
}

function choose(engine, value) {
  if (!dialogState) return;
  const step = dialogState;
  const input = dialog.querySelector('[data-bd-input]');
  engine.playSound?.('CLICK_SUCCESS', { volume: 0.45 });
  step.onChoice?.(value, input ? input.value : '');
}

function closeDialog(engine, value = null) {
  const step = dialogState;
  dialogState = null;
  if (dialog) dialog.hidden = true;
  if (rt.mode === 'interacting') {
    rt.mode = 'idle';
    rt.idleUntil = performance.now() + 2000;
  }
  command();
  if (value === 'close') step?.onClose?.();
  if (rt.greeting && !dialogState) greetNow(engine);
  publish(engine, true);
}

function dialogOpen() {
  return Boolean(dialog && !dialog.hidden);
}

/** A one-button line ("Thanks!"), then `next`. */
function line(engine, key, text, reply, next = null, opts = {}) {
  openDialog(engine, {
    key,
    text,
    choices: [{ value: 'ok', txt: reply, primary: true }],
    onChoice: () => (next ? next() : closeDialog(engine)),
    onClose: opts.onClose,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

function readLabel(engine, i = 0) {
  const beat = BUTLER_BOX.beats[i];
  openDialog(engine, {
    key: `label:${i}`,
    title: BUTLER_BOX.label,
    portrait: BUTLER_BOX_ART,
    text: beat.text,
    talk: false,
    choices: [{ value: 'next', txt: beat.response, primary: true }],
    onChoice: () => {
      if (i + 1 < BUTLER_BOX.beats.length) return readLabel(engine, i + 1);
      st.boxRead = true;
      if (view?.box?.target) view.box.target.subtitle = 'Open me!';
      engine.save?.();
      closeDialog(engine);
    },
  });
}

function openBox(engine) {
  if (!view?.box || pendingOpenAt) return;
  const x = view.box.sprite.x;
  engine.playSound?.('PROTO_PUFF', { volume: 0.7 });
  puff(engine, x, engine.groundY - 50);
  // unregister removes and destroys the sprite.
  engine.unregister?.(view.box.target);
  view.box = null;
  pendingOpenAt = performance.now() + BUTLER.OPEN_DELAY_MS;
  pendingOpenX = x;
}

function puff(engine, x, y) {
  const { PIXI } = engine;
  const g = new PIXI.Graphics();
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    g.circle(Math.cos(a) * 30, Math.sin(a) * 20, 16 + (i % 3) * 5).fill({ color: 0xffffff, alpha: 0.85 });
  }
  g.circle(0, 0, 30).fill({ color: 0xffffff, alpha: 0.9 });
  g.x = x;
  g.y = y;
  g.zIndex = 70;
  engine.entityLayer.addChild(g);
  const start = performance.now();
  const tick = () => {
    if (g.destroyed) return;
    const k = (performance.now() - start) / 2000;
    if (k >= 1) return g.destroy();
    g.alpha = 1 - k;
    g.scale.set(1 + k * 0.8);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function finishOpen(engine) {
  pendingOpenAt = 0;
  const forcedLook = BUTLER_LOOKS.find((l) => l.id === engine.param?.('butlerlook'));
  createButler(st, { post: pendingOpenX - houseX(), now: now() });
  if (forcedLook) st.look = forcedLook.id;
  rt.x = pendingOpenX;
  rt.mode = 'idle';
  engine.save?.();
  if (currentRoom(engine) === 'street' && view) {
    view.box = null;
    view.butler = spawnButler(engine);
    setClip(engine, 'idle0');
    // createButler: stepBackFromPlayer, then doIntro after 2 s.
    if (engine.player) stepBack(engine, engine.player.x, { quiet: true });
  }
  introAt = performance.now() + BUTLER.INTRO_DELAY_MS;
  publish(engine, true);
}

function doIntro(engine) {
  introAt = 0;
  if (!view?.butler) return;
  st.introDone = true;
  engine.save?.();
  line(engine, 'intro', BUTLER_INTRO(), BUTLER_INTRO_REPLY);
}

// ---------------------------------------------------------------------------
// Motion (onUpdate / stateChange, simplified to one tick)
// ---------------------------------------------------------------------------

function startWalk(engine, x, { clip = 'walk4', mode = 'walk' } = {}) {
  const l = layout();
  rt.walkTo = Math.max(40, Math.min(l.width - 40, Math.round(x)));
  rt.walkClip = clip;
  rt.mode = mode;
  faceX(rt.walkTo);
  if (mode === 'step') faceX(engine.player?.x ?? rt.x);
  setClip(engine, mode === 'step' ? 'stepBack' : clip);
}

/** stepBackFromPlayer: back away 100 px + the avatar's width, never across the player. */
function stepBack(engine, px, { quiet = false } = {}) {
  const shift = BUTLER.STEP_AWAY_DIST + 40;
  let target = rt.x < px ? Math.min(px - shift, rt.x - 10) : Math.max(px + shift, rt.x + 10);
  const l = layout();
  if (target < 40 || target > l.width - 40) {
    if (!quiet && performance.now() - rt.lastSpeakAt > 500) say(engine, butlerText('stepAwayStuck', { pc: 'friend' }));
    return false;
  }
  rt.stepAt = performance.now();
  startWalk(engine, target, { mode: 'step' });
  return true;
}

function returnToPost(engine) {
  startWalk(engine, postX());
  rt.returning = true;
}

function wander(engine) {
  // startMoving: a stroll to a random spot within 300 px of the post.
  const p = postX();
  const l = layout();
  const left = Math.max(200, p - BUTLER.WANDER_RANGE);
  const right = Math.min(l.width - 200, p + BUTLER.WANDER_RANGE);
  let x = left + Math.random() * Math.max(1, right - left);
  if (Math.abs(x - rt.x) < 100) x = rt.x + (x < rt.x ? -120 : 120);
  startWalk(engine, x);
}

function idleAnim(engine) {
  // onIdle: animate for interest.
  const chance = 1 + Math.floor(Math.random() * 10);
  if (chance < 3) oneOff(engine, Math.random() < 0.5 ? 'idle2' : 'idle1');
  else if (chance > 5) oneOff(engine, chance > 8 ? 'idle3' : 'idle4');
}

function ownerHintCtx(engine) {
  const inv = engine.inv || {};
  const learned = engine.learnedSkills || [];
  const qs = engine.questState || {};
  const decor = homesFeature._state?.() || {};
  const placedSdb = [decor.houseDecor, ...(decor.towerDecor || [])].some((d) => (d?.placed || []).some((p) => p.classTsid === 'bag_furniture_sdb'));
  const storedSdb = [decor.houseDecor].some((d) => Number(d?.storage?.bag_furniture_sdb) > 0) || countItem(inv, 'bag_furniture_sdb') > 0;
  let near = null;
  try {
    near = nearLevel(levelInfoForXp(engine.pc?.xp));
  } catch {
    near = null;
  }
  return {
    level: level(engine),
    learning: Object.keys(engine.skillQueue || {}).length > 0,
    skillCount: learned.length,
    canOptIn: canOptInFn(),
    allowVisits: visitsAllowed(),
    towerQuestNone: !qs.active?.tower_quest && !(qs.completed || []).includes('tower_quest'),
    fiberArts: learned.includes('fiber_arts_1'),
    hasHoe: countItem(inv, 'hoe') > 0,
    hasHighClassHoe: countItem(inv, 'high_class_hoe') > 0,
    nearLevel: near,
    hasTower: hasTower(),
    sdbPlaced: placedSdb,
    sdbOwned: storedSdb,
  };
}

function maybeHint(engine, force = false) {
  if (!hintDue(st, { now: now(), level: level(engine), force })) return false;
  const hint = pickHint(st, ownerHintCtx(engine), { now: now() });
  if (!hint) return false;
  say(engine, hint.text, 6000, { activity: true });
  engine.save?.();
  return true;
}

function maybeChatter(engine, { force = false, towerLevel = false } = {}) {
  const text = idleChatter(st, {
    now: now(),
    lastCommandAt: Date.now() - (performance.now() - rt.lastCommandAt),
    level: towerLevel ? BUTLER.TOWER_COMMENT_LEVEL : level(engine),
    hasTower: towerLevel ? false : hasTower(),
    force,
    rand: towerLevel ? () => 0 : Math.random,
  });
  if (!text) return false;
  say(engine, text, 3400);
  oneOff(engine, 'talk');
  engine.save?.();
  return true;
}

function tickButler(engine, dtMs) {
  const v = view?.butler;
  if (!v || v.container.destroyed) return;
  const p = engine.player;
  const t = performance.now();
  const dt = Math.min(0.1, dtMs / 1000);
  if (rt.mode === 'walk' || rt.mode === 'step') {
    const dx = rt.walkTo - rt.x;
    const stepPx = BUTLER.WALK_SPEED * dt * (rt.mode === 'step' ? 1.4 : 1);
    if (Math.abs(dx) <= stepPx) {
      rt.x = rt.walkTo;
      rt.walkTo = null;
      rt.returning = false;
      rt.mode = 'idle';
      rt.idleUntil = t + BUTLER.IDLE_MIN_MS + Math.random() * (BUTLER.IDLE_MAX_MS - BUTLER.IDLE_MIN_MS);
      if (p) faceX(p.x);
      setClip(engine, 'idle0');
      if (rt.greeting) greetNow(engine);
    } else {
      rt.x += Math.sign(dx) * stepPx;
    }
  } else if (rt.mode === 'dance' && t >= rt.modeUntil) {
    rt.mode = 'idle';
    rt.idleUntil = t + 4000;
    setClip(engine, 'idle0');
  }
  // Once a second, like onUpdate.
  if (t - rt.lastTickSec >= 1000) {
    rt.lastTickSec = t;
    secondTick(engine, t);
  }
  v.container.x = Math.round(rt.x);
  v.anim.scale.x = rt.dir === 'right' ? -1 : 1;
  if (v.target) {
    v.target.label = butlerName(st);
    v.target.subtitle = subtitle();
  }
}

function secondTick(engine, t) {
  const p = engine.player;
  const busy = dialogOpen() || engine.busy?.({ ignoreHome: true });
  const d = p ? Math.abs(p.x - rt.x) : Infinity;
  // Hit boxes: far 550, near 250, at 50.
  const inFar = d <= BUTLER.FAR_DIST;
  const inNear = d <= BUTLER.NEAR_DIST;
  if (inFar && !rt.far && !busy && reactionAllowed()) {
    // onPlayerFar: wave if facing the player.
    const facing = (p.x < rt.x && rt.dir === 'left') || (p.x >= rt.x && rt.dir === 'right');
    if (facing) oneOff(engine, 'wave');
    rt.mode = 'attending';
  }
  if (inNear && !rt.near && !busy) {
    // onPlayerNear: face and acknowledge; the owner may get a hint.
    if (reactionAllowed()) {
      faceX(p.x);
      oneOff(engine, 'acknowledge');
    }
    // Not while greeting (onPlayerCollision skips hints in the greeting state).
    if (!st.hintsOff && st.introDone && !rt.greeting && t - (rt.greetedAt || 0) > 12_000) maybeHint(engine);
  }
  rt.far = inFar;
  rt.near = inNear;
  if (busy || rt.mode === 'interacting' || rt.mode === 'dance' || rt.mode === 'step') return;
  if (p && d <= BUTLER.AT_DIST && t - rt.stepAt > 3000 && reactionAllowed()) {
    if (stepBack(engine, p.x) && Math.random() < 0.5 && t - rt.lastSpeakAt > 10_000) say(engine, butlerText('stepAwayList'));
    return;
  }
  // shouldReturnToBase: 15 s after the last command, more than 50 px off post.
  if (rt.mode !== 'walk' && Math.abs(rt.x - postX()) > 50 && t - rt.lastCommandAt > BUTLER.WAIT_TIME) {
    returnToPost(engine);
    return;
  }
  const attending = p && d <= BUTLER.FAR_DIST * 0.5;
  if (rt.mode === 'walk') return;
  if (attending) {
    rt.mode = 'attending';
    if (reactionAllowed() && Math.random() < 0.34) {
      if (Math.random() < 0.5) {
        faceX(p.x);
      } else oneOff(engine, Math.random() < 0.5 ? 'idle3' : 'idle4');
    }
  } else {
    if (rt.mode === 'attending') rt.mode = 'idle';
    if (maybeChatter(engine)) return;
    if (t - rt.lastCommandAt > 5000 && reactionAllowed()) idleAnim(engine);
    if (t >= rt.idleUntil && reactionAllowed()) wander(engine);
  }
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

/**
 * The owner comes home: startGreeting (5 s in the source, here 1.2 s) walks
 * the Butler over (moveToPlayer, stopping a step short), then greetPlayer's
 * owner branch bows and says getGreetingForOwner; afterGreeting follows with
 * what it holds, the mail line from onPlayerEnter and its suggestion.
 */
function greetOwner(engine) {
  if (!view?.butler || !st.owned) return;
  const t = now();
  rt.greeting = {
    greeting: ownerGreeting(st, t),
    after: afterGreetingForOwner(st, t),
    mail: packagesAndMessagesForOwner(st, { mail: (engine.mailUnread?.() || 0) > 0, now: t }),
  };
  st.lastOwnerVisit = t;
  engine.save?.();
  greetTimers.push(setTimeout(() => {
    const p = engine.player;
    if (!view?.butler || !rt.greeting || !p) return;
    command();
    if (Math.abs(p.x - rt.x) > 140) startWalk(engine, p.x + (rt.x > p.x ? 90 : -90));
    else greetNow(engine);
  }, 1200));
}

function greetNow(engine) {
  const g = rt.greeting;
  rt.greeting = null;
  rt.greetedAt = performance.now();
  if (!g || !view?.butler) return;
  if (engine.player) faceX(engine.player.x);
  command();
  oneOff(engine, 'bow');
  say(engine, g.greeting, 3500, { activity: true });
  const parts = [];
  if (g.after.text) parts.push(g.after.text);
  if (g.mail && /mail\.$/.test(g.mail)) parts.push(g.after.text ? BUTLER_STRINGS.ownerMailAlso.trim() : BUTLER_STRINGS.ownerMail);
  if (g.after.suggest !== 'none') parts.push(g.after.suggestion);
  if (!parts.length) return;
  greetTimers.push(setTimeout(() => {
    if (!view?.butler) return;
    command();
    say(engine, parts.join(' '), 6000, { activity: true });
    if (reactionAllowedLoose()) oneOff(engine, 'talk');
  }, 3800));
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function butlerVerbs(engine) {
  const dancing = rt.mode === 'dance';
  const verbs = [
    { id: 'talk_to', label: 'talk to', tooltip: 'Converse with the Butler', enabled: true },
    { id: 'chat', label: 'chat', tooltip: 'Have a word with the Butler', enabled: true },
    { id: 'access_mailbox', label: 'mailbox', tooltip: 'Access your mailbox', enabled: true },
    ...retrieveVerbs(st),
    (() => {
      const report = visitorsReport(st);
      return report.count > 0
        ? { id: 'visitors', label: 'who visited?', tooltip: 'Find out who visited your street', enabled: true }
        : { id: 'visitors', label: 'who visited?', tooltip: 'Find out who visited your street', enabled: false, reason: 'There have been no visitors since the last time you asked.' };
    })(),
    { id: 'give', label: 'give', tooltip: st.gift ? butlerText('visitorGiftTooltip', { param: itemName(st.gift.classTsid, st.gift.count) }) : 'Leave a gift for your visitors', enabled: true },
    { id: 'name', label: 'name', tooltip: "Change the Butler's name", enabled: true },
    { id: 'customize', label: 'customize', tooltip: "Change the Butler's appearance", enabled: true },
    { id: 'set_post', label: 'set post', tooltip: "Change the Butler's assigned post to your current position", enabled: true },
    dancing
      ? { id: 'faster', label: 'faster', tooltip: 'Tell the Butler to dance faster', enabled: true }
      : { id: 'dance', label: 'dance', tooltip: 'Ask the Butler to show you its moves', enabled: rt.mode !== 'interacting', reason: BUTLER_STRINGS.danceFail },
    { id: 'jump', label: 'jump', tooltip: 'Ask the Butler to jump', enabled: !dancing, reason: BUTLER_STRINGS.jumpFail },
    { id: 'zombie', label: 'zombie', tooltip: 'Give the Butler a craving for brains', enabled: !dancing },
    st.hintsOff
      ? { id: 'dispense_wisdom', label: 'dispense butlerly wisdom', tooltip: 'Ask the Butler to give hints & tips', enabled: true }
      : { id: 'muffle_wisdom', label: 'muffle butlerly wisdom', tooltip: 'Instruct the Butler to stop giving hints & tips', enabled: true },
    st.muted
      ? { id: 'chatter', label: 'chatter', tooltip: 'Allow the Butler to say random things when bored', enabled: true }
      : { id: 'zip_it', label: 'zip it!', tooltip: 'Tell the Butler to stop the random chatter', enabled: true },
  ];
  return verbs.map((v) => ({ reason: '', durationMs: 0, ...v }));
}

function runButlerVerb(engine, id) {
  command();
  switch (id) {
    case 'talk_to': return talkTo(engine);
    case 'chat': return chat(engine);
    case 'access_mailbox': return accessMailbox(engine);
    case 'retrieve_messages':
    case 'retrieve_packages': return retrieve(engine);
    case 'visitors': return whoVisited(engine);
    case 'give': return giveMenu(engine);
    case 'name': return nameMenu(engine);
    case 'customize': return customize(engine);
    case 'set_post': return setPost(engine);
    case 'dance': return dance(engine);
    case 'faster': return faster(engine);
    case 'jump': return jump(engine);
    case 'zombie': return zombie(engine);
    case 'muffle_wisdom': st.hintsOff = true; engine.save?.(); lastMsg = 'hints:off'; return publish(engine, true);
    case 'dispense_wisdom': st.hintsOff = false; engine.save?.(); lastMsg = 'hints:on'; return publish(engine, true);
    case 'zip_it': st.muted = true; engine.save?.(); lastMsg = 'chatter:off'; return publish(engine, true);
    case 'chatter': st.muted = false; engine.save?.(); lastMsg = 'chatter:on'; return publish(engine, true);
    default: return null;
  }
}

/** after_greeting_owner: "How can I be of service?" */
function talkTo(engine) {
  openDialog(engine, {
    key: 'service',
    text: BUTLER_SERVICE.text,
    stack: true,
    choices: BUTLER_SERVICE.choices.map((c) => ({ ...c })),
    onChoice: (value) => {
      if (value === 'mailbox') {
        closeDialog(engine);
        return accessMailbox(engine);
      }
      if (value === 'messages' || value === 'packages') return retrieve(engine);
      if (value === 'chat') return joke(engine);
      if (value === 'teach') return teachMenu(engine);
      return closeDialog(engine);
    },
  });
}

/** buildAndRunConvo('alphy'): one joke, a beat at a time. */
function joke(engine, index = null, step = 0) {
  const i = index ?? Math.floor(Math.random() * BUTLER_JOKES.length);
  const beats = BUTLER_JOKES[i];
  const beat = beats[step];
  openDialog(engine, {
    key: `joke:${i}:${step}`,
    text: beat.text,
    choices: [{ value: 'ok', txt: beat.response, primary: true }],
    onChoice: () => (step + 1 < beats.length ? joke(engine, i, step + 1) : closeDialog(engine)),
  });
}

function teachMenu(engine) {
  openDialog(engine, {
    key: 'teach',
    text: BUTLER_TEACH.text,
    stack: true,
    choices: BUTLER_TEACH.choices.map((c) => ({ ...c })),
    onChoice: (value) => {
      if (value === 'nothing') return closeDialog(engine);
      openDialog(engine, {
        key: `teach:${value}`,
        title: BUTLER_TEACH.inputTitle,
        text: '',
        input: { label: BUTLER_TEACH.inputLabel, value: '', max: 140 },
        choices: [{ value: 'cancel', txt: 'Cancel' }, { value: 'ok', txt: 'OK', primary: true }],
        onChoice: (v, txt) => {
          if (v !== 'ok') return closeDialog(engine);
          const out = teachButler(st, value, txt);
          if (!out.ok) return closeDialog(engine);
          engine.save?.();
          line(engine, 'taught', out.text, 'ok');
        },
      });
    },
  });
}

/** doClick: summon from afar, else the click responses and a reaction. */
function chat(engine) {
  const p = engine.player;
  if (p && Math.abs(rt.x - p.x) > 300) {
    say(engine, BUTLER_STRINGS.clickSummon);
    startWalk(engine, p.x + (p.x < rt.x ? 60 : -60));
    return;
  }
  const out = clickResponse(rt.clicks, performance.now());
  if (p) faceX(p.x);
  say(engine, out.text, 3000, { activity: true });
  if (view?.butler) setClip(engine, out.anim, { loop: false });
}

function accessMailbox(engine) {
  // access_mailbox: stop, react, checkMail.
  if (view?.butler && reactionAllowed()) oneOff(engine, 'acknowledge');
  engine.openMailbox?.();
  lastMsg = 'mailbox';
  publish(engine, true);
}

/** onRetrieveMessages: "Yes, yes, let me get those for you!", then one at a time. */
function retrieve(engine) {
  const c = butlerCounts(st);
  if (!c.packages && !c.messages) return line(engine, 'none', BUTLER_STRINGS.messagesNone, 'Thanks!');
  line(engine, 'retrieve', butlerText('messagesStart'), 'Thanks!', () => handOver(engine));
}

function handOver(engine) {
  const out = nextHandover(st, { now: now(), itemName });
  if (out.kind === 'none') {
    engine.save?.();
    return closeDialog(engine);
  }
  engine.pushActivity?.(`${butlerName(st)}: ${out.text}`);
  lastMsg = out.text;
  const give = out.give;
  line(engine, out.kind === 'package' ? 'package' : 'message', out.text, 'Thanks!', () => {
    // acceptPackage: giveStack, then the next one.
    if (give) {
      ensureItem(give.classTsid, NEIGHBOUR_ITEMS[give.classTsid] || {});
      addItem(engine.inv, give.classTsid, give.count);
      engine.refreshPack?.();
      engine.floatText?.(engine.player?.x ?? rt.x, (engine.player?.y ?? engine.groundY) - 90, `+${itemName(give.classTsid, give.count)}`, 0xf2c879);
    }
    engine.save?.();
    handOver(engine);
  }, {
    onClose: () => {
      // Closing the bubble still hands the stack over (onConversationEnding: giveStack).
      if (give) {
        addItem(engine.inv, give.classTsid, give.count);
        engine.refreshPack?.();
      }
      engine.save?.();
    },
  });
  publish(engine, true);
}

function whoVisited(engine) {
  const report = visitorsReport(st);
  if (!report.count) return line(engine, 'visitors', 'There have been no visitors since the last time you asked.', 'Thanks!');
  st.lastWhoVisited = now();
  engine.save?.();
  if (report.many) {
    line(engine, 'visitors', BUTLER_STRINGS.visitorsMany, 'Thanks!', () => line(engine, 'visitors:list', report.output, 'Thanks!'));
  } else {
    engine.pushActivity?.(`${butlerName(st)}: ${report.output}`);
    line(engine, 'visitors', report.output, 'Thanks!');
  }
}

/** verbs.name: "Rename Me!" / "My new name:" (19 characters). */
function nameMenu(engine, preset = null) {
  openDialog(engine, {
    key: 'name',
    title: 'Rename Me!',
    text: '',
    input: { label: 'My new name:', value: preset ?? st.name ?? '', max: 60 },
    choices: [{ value: 'cancel', txt: 'Cancel' }, { value: 'ok', txt: 'OK', primary: true }],
    onChoice: (v, txt) => {
      if (v !== 'ok') return closeDialog(engine);
      const out = renameButler(st, txt, { now: now() });
      if (!out.ok) return closeDialog(engine);
      engine.save?.();
      engine.pushActivity?.(out.text);
      line(engine, 'named', out.text, 'ok');
    },
  });
}

/** customize: the client's look picker, here the three complete looks. */
function customize(engine) {
  const render = (el) => {
    const grid = document.createElement('div');
    grid.className = 'bd-looks';
    for (const look of BUTLER_LOOKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-look';
      b.dataset.butlerLook = look.id;
      b.setAttribute('aria-pressed', look.id === st.look ? 'true' : 'false');
      const img = document.createElement('img');
      img.src = butlerSheetUrl(look.id, 'idle0');
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = look.name;
      const parts = document.createElement('span');
      parts.className = 'bd-parts';
      parts.textContent = BUTLER_PART_ORDER.map((k) => `${BUTLER_PART_NAMES[k]} ${String(look.parts[k]).replace(/\D/g, '')}`).join(' · ');
      b.append(img, name, parts);
      b.addEventListener('click', () => {
        if (st.look === look.id) return;
        st.look = look.id;
        engine.save?.();
        respawnButler(engine);
        if (view?.butler && reactionAllowed()) oneOff(engine, 'bow');
        for (const other of grid.querySelectorAll('[data-butler-look]')) other.setAttribute('aria-pressed', other.dataset.butlerLook === st.look ? 'true' : 'false');
        dialog.querySelector('[data-bd-portrait]').src = butlerSheetUrl(st.look, 'idle0');
        lastMsg = `look:${st.look}`;
        publish(engine, true);
      });
      grid.appendChild(b);
    }
    el.appendChild(grid);
  };
  openDialog(engine, {
    key: 'customize',
    title: `Customize ${butlerName(st)}`,
    text: 'Pick a look.',
    talk: false,
    extra: render,
    choices: [{ value: 'done', txt: 'Done', primary: true }],
    onChoice: () => closeDialog(engine),
  });
}

function setPost(engine) {
  openDialog(engine, {
    key: 'set_post',
    text: BUTLER_STRINGS.setPostConfirm,
    choices: [{ value: 'no', txt: 'Never mind.' }, { value: 'yes', txt: 'Yes, please.', primary: true }],
    onChoice: (v) => {
      closeDialog(engine);
      if (v !== 'yes' || !engine.player) return;
      st.post = Math.round(engine.player.x - houseX());
      engine.save?.();
      lastMsg = `post:${st.post}`;
      returnToPost(engine);
    },
  });
}

/** IM "dance": danceStart, then 7-10 s of dance. */
function dance(engine) {
  if (rt.mode === 'dance') return say(engine, BUTLER_STRINGS.alreadyDancing);
  if (!view?.butler || rt.mode === 'interacting') return say(engine, BUTLER_STRINGS.danceFail);
  rt.mode = 'dance';
  rt.danceFaster = 0;
  rt.modeUntil = performance.now() + (7 + Math.random() * 3) * 1000 + 833;
  setClip(engine, 'danceStart', { loop: false, then: () => setClip(engine, 'dance') });
  lastMsg = 'dance';
  publish(engine, true);
}

/** IM "faster": dance → fastDance → fall over. */
function faster(engine) {
  if (rt.mode !== 'dance') return say(engine, butlerText('fasterFailList'));
  if (view?.butler?.clip === 'fastDance') {
    rt.modeUntil = performance.now() + 5633;
    setClip(engine, 'fall', { loop: false, then: () => { rt.mode = 'idle'; setClip(engine, 'idle0'); } });
    say(engine, butlerText('fasterFall'));
  } else {
    setClip(engine, 'fastDance');
    rt.modeUntil = Math.max(rt.modeUntil, performance.now() + 4000);
  }
}

function jump(engine) {
  if (view?.butler?.clip === 'jump') return say(engine, BUTLER_STRINGS.alreadyDoingIt);
  if (!reactionAllowedLoose()) return say(engine, BUTLER_STRINGS.jumpFail);
  oneOff(engine, 'jump');
}

/** IM "zombie": "braains", then a zombie walk (walk3) away from you. */
function zombie(engine) {
  say(engine, 'braains');
  const p = engine.player;
  const away = p ? (rt.x >= p.x ? rt.x + 240 : rt.x - 240) : rt.x + 240;
  startWalk(engine, away, { clip: 'walk3' });
}

/** give: pick a pack stack and a count, confirm, then the old gift comes back. */
function giveMenu(engine) {
  const slots = listPackItemSlots(engine.inv).filter((s) => giftable(s.classTsid));
  if (!slots.length) return line(engine, 'give:none', BUTLER_STRINGS.visitorGiftNoPrevious.trim(), 'Oh, ok.');
  let chosen = slots[0].classTsid;
  let count = 1;
  const render = (el) => {
    const grid = document.createElement('div');
    grid.className = 'bd-grid';
    const countRow = document.createElement('label');
    countRow.className = 'bd-count';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.className = 'bd-input';
    input.dataset.butlerCount = '1';
    const sync = () => {
      const have = countItem(engine.inv, chosen);
      input.max = String(have);
      count = Math.max(1, Math.min(have, Math.floor(Number(input.value) || 1)));
      input.value = String(count);
      for (const b of grid.querySelectorAll('[data-butler-item]')) b.setAttribute('aria-pressed', b.dataset.butlerItem === chosen ? 'true' : 'false');
    };
    for (const s of slots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-item';
      b.dataset.butlerItem = s.classTsid;
      const img = document.createElement('img');
      img.src = s.icon || itemIcon(s.classTsid);
      img.alt = '';
      const lab = document.createElement('span');
      lab.textContent = `${s.label} ×${s.count}`;
      b.append(img, lab);
      b.addEventListener('click', () => {
        chosen = s.classTsid;
        input.value = '1';
        sync();
      });
      grid.appendChild(b);
    }
    input.addEventListener('change', sync);
    input.addEventListener('keydown', (e) => e.stopPropagation());
    countRow.append(document.createTextNode('How many?'), input);
    el.append(grid, countRow);
    input.value = '1';
    sync();
  };
  openDialog(engine, {
    key: 'give',
    text: st.gift ? butlerText('visitorGiftTooltip', { param: itemName(st.gift.classTsid, st.gift.count) }) : BUTLER_STRINGS.visitorGiftNoPrevious.trim(),
    talk: false,
    extra: render,
    choices: [{ value: 'cancel', txt: 'Never mind.' }, { value: 'ok', txt: 'Give', primary: true }],
    onChoice: (v) => {
      if (v !== 'ok') return closeDialog(engine);
      const n = Math.max(1, Math.min(countItem(engine.inv, chosen), count));
      const offer = giftOffer(st, { classTsid: chosen, count: n, names: itemName, stackMax: stackMax(chosen) });
      openDialog(engine, {
        key: 'give:confirm',
        text: offer.text,
        choices: [{ value: 'no', txt: 'Never mind.' }, { value: 'yes', txt: 'Take them!', primary: true }],
        onChoice: (answer) => {
          if (answer !== 'yes') return line(engine, 'give:no', BUTLER_STRINGS.visitorGiftNo, 'Bye');
          if (countItem(engine.inv, chosen) < n) return closeDialog(engine);
          removeItem(engine.inv, chosen, n);
          const out = setGift(st, { classTsid: chosen, count: n, stackMax: stackMax(chosen) });
          if (out.returned) addItem(engine.inv, out.returned.classTsid, out.returned.count);
          engine.refreshPack?.();
          engine.save?.();
          closeDialog(engine);
          setTimeout(() => say(engine, out.text, 3000), 1200);
        },
      });
    },
  });
}

function giftable(cls) {
  const meta = ITEM_CATALOG[cls] || {};
  const tags = meta.tags || [];
  if (tags.includes('no_trade') || tags.includes('quest-item') || tags.includes('no_drop')) return false;
  if (/^(bag_|furniture_|trophy_)/.test(cls) || cls === BUTLER_BOX.CLASS) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Visitors (the Visiting Stone hand-off)
// ---------------------------------------------------------------------------

/**
 * A neighbour drops by (street-furniture-feature deliverVisitor): the Butler
 * takes the gift as a package and the line as a message, hands out the gift
 * you left for visitors, and IMs you (visitorNotifyOwnerHere). Returns false
 * when there is no Butler or it is full, so the letter goes to the mailbox.
 */
function receiveVisitor(engine, letter) {
  if (!st.owned || !letter) return false;
  const id = letter.neighbourId || neighbourIdFor(letter.sender);
  const out = takeVisitorDelivery(st, { from: id, fromName: letter.sender, attachment: letter.attachment, text: letter.text, now: Number(letter.deliveryAt) || now() });
  if (!out.ok) return false;
  recordVisitor(st, { id, name: letter.sender, now: Number(letter.deliveryAt) || now() });
  giveGiftTo(st, id);
  engine.pushActivity?.(`${butlerName(st)}: ${butlerText('visitorNotifyOwnerHere', { pc: letter.sender })}`);
  lastMsg = `visitor:${id}`;
  engine.save?.();
  if (view?.butler) {
    const text = packagesAndMessagesForOwner(st, { now: now() });
    if (text) greetTimers.push(setTimeout(() => say(engine, text, 4000), 2500));
  }
  publish(engine, true);
  return true;
}

function neighbourIdFor(name) {
  return NEIGHBOURS.find((n) => n.name === name)?.id || String(name || 'visitor').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** For street-furniture-feature (one-way import, no cycle). */
export const butlerApi = {
  owned: () => st.owned === true,
  /** butler.getLabel(pc) for the owner: the name, or "Butler". */
  label: () => (st.owned ? butlerName(st) : ''),
  receiveVisitor: (engine, letter) => receiveVisitor(engine, letter),
  /** street-furniture-feature tells the hints whether visits are on and opt-in is open. */
  setVisitState(allowed, canOptIn) {
    if (typeof allowed === 'function') visitsAllowed = allowed;
    if (typeof canOptIn === 'function') canOptInFn = canOptIn;
  },
  /**
   * For quest rooms whose end NPC is the Butler (quest-rooms/clubhouse.js):
   * bag_butler.js doQuests runs when the owner comes home within 600 px or
   * walks into the far hit box (550 px). Ready when the owner is on the home
   * street within FAR_DIST, the intro and the arrival greeting are over, and
   * nothing else is open.
   */
  questReady(engine) {
    const v = view?.butler;
    const p = engine.player;
    if (!st.owned || !st.introDone || !v || v.container.destroyed || !p) return false;
    if (currentRoom(engine) !== 'street' || rt.greeting || dialogOpen() || engine.busy?.({ ignoreHome: true })) return false;
    if (rt.mode === 'dance' || rt.mode === 'interacting') return false;
    if (rt.greetedAt && performance.now() - rt.greetedAt < QUEST_AFTER_GREETING_MS) return false;
    return Math.abs(p.x - rt.x) <= BUTLER.FAR_DIST;
  },
  /** The Butler hears about it: faces you and talks while the quest completion shows. */
  hearQuest(engine, questId) {
    if (!view?.butler || !st.owned) return null;
    command();
    if (engine.player) faceX(engine.player.x);
    if (reactionAllowedLoose() || reactionAllowed()) oneOff(engine, 'talk');
    lastMsg = `quest:${questId}`;
    publish(engine, true);
    return { name: butlerName(st), portrait: butlerSheetUrl(st.look, 'idle0') };
  },
};
/** Let the arrival greeting's lines play before a quest turn-in covers them (greetNow's follow-up comes at 3.8 s). */
const QUEST_AFTER_GREETING_MS = 5000;

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

function publish(engine, force = false) {
  const t = performance.now();
  if (!force && t < publishAt) return;
  publishAt = t + 250;
  const c = butlerCounts(st);
  engine.setData('butlerState', st.owned ? 'butler' : view?.box ? 'box' : pendingOpenAt ? 'opening' : 'none');
  engine.setData('butlerName', butlerName(st));
  engine.setData('butlerLook', st.look);
  const boxSprite = view?.box?.sprite;
  engine.setData('butlerX', st.owned && view?.butler ? String(Math.round(rt.x)) : boxSprite && !boxSprite.destroyed ? String(Math.round(boxSprite.x)) : '');
  engine.setData('butlerPost', st.owned ? String(Math.round(postX())) : '');
  engine.setData('butlerAnim', view?.butler?.clip || '');
  engine.setData('butlerMode', rt.mode);
  engine.setData('butlerPackages', String(c.packages));
  engine.setData('butlerMessages', String(c.messages));
  engine.setData('butlerGift', st.gift ? `${st.gift.classTsid}:${st.gift.count}` : '');
  engine.setData('butlerDialog', dialogOpen() ? (dialog.dataset.step || 'open') : 'closed');
  engine.setData('butlerLast', lastMsg);
  engine.setData('butlerVisitors', Object.keys(st.visitors).join(','));
  engine.setData('butlerBoxRead', st.boxRead ? '1' : '0');
}

let demoOwnedDone = false;
/** &butlerdemo=owned: a Butler at home while you play elsewhere (Visiting Stone QA); &butlername=. */
function ownedDemo(engine) {
  demoOwnedDone = true;
  if (String(engine.param('butlerdemo') || '').toLowerCase() !== 'owned' || st.owned) return;
  createButler(st, { post: BOX_RX, now: now(), rand: () => 0 });
  st.introDone = true;
  if (engine.param('butlername')) renameButler(st, engine.param('butlername'));
  engine.save?.();
}

function demoSetup(engine) {
  const kind = String(engine.param('butlerdemo') || '').toLowerCase();
  if (!kind || kind === 'owned' || demo) return;
  demo = { kind };
  if (kind === 'box') {
    st = createButlerState();
  } else if (!st.owned) {
    createButler(st, { post: BOX_RX, now: now(), rand: () => 0 });
    st.introDone = true;
    st.createdAt = now();
  }
  const lookParam = BUTLER_LOOKS.find((l) => l.id === engine.param('butlerlook'));
  if (lookParam && st.owned) st.look = lookParam.id;
  const away = Number(engine.param('butleraway'));
  if (Number.isFinite(away) && away > 0 && st.owned) st.lastOwnerVisit = now() - away * BUTLER.GAME_DAY_MS;
  if (kind === 'parcel' && st.owned && !st.packages.length) {
    const dorrit = neighbourById('dorrit');
    const t = now() - 5 * 60_000;
    takeVisitorDelivery(st, { from: dorrit.id, fromName: dorrit.name, attachment: dorrit.visitorGift, text: dorrit.visitor, now: t });
    recordVisitor(st, { id: dorrit.id, name: dorrit.name, now: t });
  }
  rt.x = postX();
  engine.save?.();
  const auto = engine.param('butlerautoplay');
  if (auto) autoplay = { mode: String(auto).toLowerCase(), phase: 'start', at: performance.now() + 2500 };
}

function clickChoice(value) {
  const b = dialog?.querySelector(`[data-butler-choice="${value}"]`) || dialog?.querySelector('.bd-btn.primary');
  b?.click();
  return Boolean(b);
}

function autoplayStep(engine) {
  if (!autoplay || performance.now() < autoplay.at) return;
  const say2 = (s) => engine.setData('butlerAutoplay', s);
  const later = (ms) => {
    autoplay.at = performance.now() + ms;
  };
  const done = (s = 'done') => {
    say2(s);
    autoplay = null;
  };
  const m = autoplay.mode;
  if (autoplay.phase === 'start') {
    if (!view) return later(300);
    if (m === 'box') {
      if (!view.box) return done('nobox');
      readLabel(engine, 0);
      autoplay.phase = 'label';
      return later(700);
    }
    if (!view.butler) return later(300);
    autoplay.phase = m === 'greet' || m === 'parcel' || m === 'parceldone' ? 'greeting' : 'go';
    return later(500);
  }
  if (autoplay.phase === 'greeting') {
    // Wait for the arrival greeting and its follow-up line.
    if (rt.greeting || !rt.greetedAt) return later(300);
    autoplay.phase = 'go';
    return later(m === 'greet' ? 300 : 6000);
  }
  if (m === 'box') {
    if (autoplay.phase === 'label') {
      if (dialogOpen()) {
        clickChoice('next');
        return later(500);
      }
      openBox(engine);
      autoplay.phase = 'intro';
      say2('opening');
      return later(3500);
    }
    if (autoplay.phase === 'intro') return done(st.owned ? 'intro' : 'noowner');
  }
  if (autoplay.phase !== 'go') return;
  switch (m) {
    case 'greet':
      return done('greeted');
    case 'parcel':
    case 'parceldone':
      if (!autoplay.opened) {
        autoplay.opened = true;
        runButlerVerb(engine, 'retrieve_packages');
        return later(900);
      }
      if (dialogOpen() && dialog.dataset.step === 'retrieve') {
        clickChoice('ok');
        return later(m === 'parcel' ? 600 : 900);
      }
      if (m === 'parcel') return done('holding');
      if (dialogOpen()) {
        clickChoice('ok');
        return later(700);
      }
      return done('received');
    case 'rename':
      if (!autoplay.opened) {
        autoplay.opened = true;
        nameMenu(engine);
        return later(700);
      }
      if (dialog?.dataset.step === 'name') {
        const input = dialog.querySelector('[data-bd-input]');
        input.value = engine.param('butlername') || 'Jeeves';
        clickChoice('ok');
        return later(600);
      }
      return done('named');
    case 'look':
      if (!autoplay.opened) {
        autoplay.opened = true;
        customize(engine);
        return later(800);
      }
      dialog?.querySelector(`[data-butler-look="${engine.param('butlerlookto') || 'v22'}"]`)?.click();
      return done('look');
    case 'talk':
      talkTo(engine);
      return done('service');
    case 'joke':
      joke(engine, 1);
      return done('joke');
    case 'dance':
      dance(engine);
      return done('dancing');
    case 'hint':
      maybeHint(engine, true);
      return done('hint');
    case 'tower':
      maybeChatter(engine, { force: true, towerLevel: true });
      return done('tower');
    case 'visitors':
      whoVisited(engine);
      return done('visitors');
    case 'mailbox':
      accessMailbox(engine);
      return done('mailbox');
    case 'gift':
      if (!autoplay.opened) {
        autoplay.opened = true;
        addItem(engine.inv, 'cherry', 3);
        giveMenu(engine);
        return later(800);
      }
      if (dialog?.dataset.step === 'give') {
        dialog.querySelector('[data-butler-item="cherry"]')?.click();
        const input = dialog.querySelector('[data-butler-count]');
        if (input) {
          input.value = '3';
          input.dispatchEvent(new Event('change'));
        }
        clickChoice('ok');
        return later(700);
      }
      if (dialog?.dataset.step === 'give:confirm') {
        clickChoice('yes');
        return later(1800);
      }
      return done('gift');
    default:
      return done('unknown');
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const butlerFeature = {
  id: BUTLER_FEATURE_ID,

  init(engine) {
    publish(engine, true);
  },

  save() {
    return serializeButlerState(st);
  },

  restore(slice) {
    st = normalizeButlerState(slice || {});
    rt.x = 0;
  },

  onStreetClear() {
    clearView();
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    if (!demoOwnedDone) ownedDemo(engine);
    const tsid = engine.streetTsid;
    const room = currentRoom(engine);
    const arrived = room === 'street' && lastTsid !== HOME_STREET_TSID;
    const fromHouse = lastTsid === 'RH_HOME_INT';
    lastTsid = tsid;
    if (room && !view) {
      demoSetup(engine);
      spawnView(engine);
      if (arrived && st.owned && st.introDone) {
        // Home from Ur: the greeting walk. Out of the house: onPlayerEnter's line only.
        if (fromHouse) {
          st.lastOwnerVisit = now();
          const line = packagesAndMessagesForOwner(st, { mail: (engine.mailUnread?.() || 0) > 0, now: now() });
          if (line) greetTimers.push(setTimeout(() => say(engine, line, 4000, { activity: true }), 1200));
        } else greetOwner(engine);
      }
      publish(engine, true);
    } else if (!room && view) {
      clearView();
    }
    if (pendingOpenAt && performance.now() >= pendingOpenAt) finishOpen(engine);
    if (introAt && performance.now() >= introAt) doIntro(engine);
    if (view?.butler) tickButler(engine, dtMs);
    autoplayStep(engine);
    publish(engine);
  },

  verbsFor(target, engine) {
    if (target.classId === BUTLER_BOX.CLASS) {
      // butler_box.js: read label until it is read, then only open.
      return st.boxRead
        ? [{ id: 'open', label: 'open', enabled: true, reason: '', tooltip: 'Open the box', durationMs: 0 }]
        : [{ id: 'read_label', label: 'read label', enabled: true, reason: '', tooltip: 'Read the label', durationMs: 0 }];
    }
    if (target.classId === BUTLER.CLASS) return butlerVerbs(engine);
    return null;
  },

  runVerb(target, verbId, engine) {
    if (target.classId === BUTLER_BOX.CLASS) {
      if (verbId === 'read_label') readLabel(engine);
      else if (verbId === 'open') openBox(engine);
      return true;
    }
    if (target.classId === BUTLER.CLASS) {
      runButlerVerb(engine, verbId);
      return true;
    }
    return false;
  },

  /** QA / tests. */
  _state() {
    return { st, rt, view, dialogState };
  },
  _reset() {
    st = createButlerState();
    view = null;
    dialogState = null;
    demo = null;
    autoplay = null;
    lastTsid = null;
    demoOwnedDone = false;
    frameCache = new Map();
  },
  _receiveVisitor(engine, letter) {
    return receiveVisitor(engine, letter);
  },
};

