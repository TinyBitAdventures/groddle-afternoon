/**
 * Machine art states (register row G193): which of its own SWF states a
 * Fuelmaker, Blockmaker, Metal Machine or Woodworker shows, and which frame.
 * The sheets and the per-state frame ranges are generated
 * (js/machine-art-sheets.js, tools/build-machine-art.py); this module is the
 * state machine, from GameServerJS (machine_base, the same in all four files;
 * fuelmaker.js lines below) and players/inc_making.js:
 *
 * - Idle: `assembled` (onAssembled :1268-1269, kickMachine :1206-1222).
 * - A job starts: `loadOpen`, then onLidClose 1100 ms later (inc_making.js:
 *   437-439), `loadClose`, then onActive 1100 ms after that (:1403-1406,
 *   :1264-1266), `active` until the job is done. Those 2200 ms are the
 *   machine job's "extra time for the animations" (inc_making.js:187, 230-231;
 *   machine-rooms.js MACHINE_EXTRA_WAIT_MS).
 * - Done with your stuff inside: setContents -> blinkReadyLight(pc, 'done')
 *   (:1533-1544, :961-1002) sends `ready` to whoever has contents waiting, and
 *   onPlayerEnter (:1421-1452) sends it again when you come back. The blinking
 *   green light is drawn in the SWF's ready loop.
 * - Collect: `collectOpen` (verbs.collect :606), onCollect 3000 ms later
 *   `collectClose` (:624, :1285-1291), then blinkReadyLight(pc, 'collected')
 *   1000 ms after that puts it back to `assembled`.
 * - A machine that hands its output over by itself (craftytaskingStep
 *   :1111-1142, the Craftybot's turn at a machine): `ready` 1 s, `collectOpen`
 *   1 s, `collectClose`. craftytaskingComplete sets `assembled` in the same
 *   breath, which would cut collectClose; the remake lets it close for the
 *   1 s a Collect gives it (:1290). The pack machines use this hand-over in
 *   the Make panel's result (they put the output straight in your pack).
 *
 * The client loops a state in the SWF's `loopers` (assembled, the Hold
 * frames, active, ready) and plays the rest once, stopping on the last frame
 * (glitch-client SSCollection.as:116-131), at 30 fps (TSEngineConstants.as:6).
 * A once state that has a Hold (loadOpen, collectOpen) goes on to its Hold.
 *
 * Low fuel: use() (:1553-1566) drops the tank by the job's fuel and, at 10 or
 * less, lowFuelAlert (:1228-1233) says "I am low on fuel!" in a 10 s bubble
 * and again every 30 s while the tank stays that low.
 */

import { MACHINE_ART_LOOPERS, MACHINE_ART_SHEETS } from './machine-art-sheets.js';
import { SPLIT_SPRITES } from './sprite-hires.js?v=g446-4';

export { MACHINE_ART_SHEETS };

/** An art URL with its content key (js/data-urls.js groddleDataUrl); as it is in Node and on a page without the map. */
const keyedArt = (url) => (typeof globalThis.groddleDataUrl === 'function' ? globalThis.groddleDataUrl(url) : url);

export const MACHINE_ART_FPS = 30;
export const MACHINE_ART_IDS = Object.freeze(Object.keys(MACHINE_ART_SHEETS));

/** GSJS timers between states, in ms (header). */
export const MACHINE_STATE_MS = Object.freeze({
  lidOpen: 1100, // inc_making.js:438-439 apiSetTimer('onLidClose', 1100)
  lidClose: 1100, // fuelmaker.js:1405 apiSetTimer('onActive', 1100)
  collectOpen: 3000, // fuelmaker.js:624 apiSetTimerX('onCollect', 3000)
  collectClose: 1000, // fuelmaker.js:1290 apiSetTimerX('blinkReadyLight', 1000)
  handReady: 1000, // fuelmaker.js:1130 craftytaskingStep ready -> collectOpen
  handOpen: 1000, // fuelmaker.js:1135 collectOpen -> collectClose
});

/** A once state that goes on to a one-frame Hold (the .fla lists the Hold, not the state, in loopers). */
const HOLD_AFTER = Object.freeze({ loadOpen: 'loadOpenHold', collectOpen: 'collectOpenHold' });

export const LOW_FUEL_LEVEL = 10; // fuelmaker.js:1229, :1563
export const LOW_FUEL_LINE = 'I am low on fuel!'; // fuelmaker.js:1230
export const LOW_FUEL_BUBBLE_MS = 10000; // sendBubble(..., 10000)
export const LOW_FUEL_REPEAT_MS = 30 * 1000; // apiSetTimer('lowFuelAlert', 30*1000)

export const isMachineArt = (classTsid) => Boolean(MACHINE_ART_SHEETS[classTsid]);
export const isLowFuel = (remaining) => Number.isFinite(Number(remaining)) && Number(remaining) <= LOW_FUEL_LEVEL;

/* ------------------------------------------------------------ QA freeze */

let frozen = '';
/** QA (&machineartstate=<state>): every machine shows this state. '' clears it. */
export function freezeMachineState(state) {
  frozen = state && MACHINE_ART_SHEETS.fuelmaker.states[state] ? state : '';
  return frozen;
}
const maybeFrozen = (out) => (frozen ? { state: frozen, since: out.since } : out);

/* --------------------------------------------------------------- states */

/** The start of a job: loadOpen, loadClose, then active (ms since the job started). */
function jobStartState(startedAt) {
  const lid = MACHINE_STATE_MS.lidOpen;
  const close = lid + MACHINE_STATE_MS.lidClose;
  return (t) => {
    const ms = t - startedAt;
    if (ms < lid) return { state: 'loadOpen', since: startedAt };
    if (ms < close) return { state: 'loadClose', since: startedAt + lid };
    return { state: 'active', since: startedAt + close };
  };
}

/**
 * A room machine's state at `now`: a running job (job.startedAt, job.readyAt),
 * your stuff waiting (hasContents), or a Collect a moment ago (collectedAt).
 * @returns {{ state: string, since: number }} since: when the state began (ms clock).
 */
export function roomMachineState({ job = null, waiting = false, collectedAt = 0 } = {}, now = Date.now()) {
  const started = Number(job?.startedAt);
  if (job && now < (Number(job.readyAt) || 0) && Number.isFinite(started)) return maybeFrozen(jobStartState(started)(now));
  if (waiting) return maybeFrozen({ state: 'ready', since: Number(job?.readyAt) || 0 });
  const c = Number(collectedAt) || 0;
  if (c && now >= c) {
    const open = MACHINE_STATE_MS.collectOpen;
    if (now - c < open) return maybeFrozen({ state: 'collectOpen', since: c });
    if (now - c < open + MACHINE_STATE_MS.collectClose) return maybeFrozen({ state: 'collectClose', since: c + open });
  }
  return maybeFrozen({ state: 'assembled', since: 0 });
}

/** A pack machine in the Make panel: ms since the batch started (the first unit carries the 2200 ms). */
export function packMakeState(elapsedMs) {
  return maybeFrozen(jobStartState(0)(Math.max(0, Number(elapsedMs) || 0)));
}

/** A pack machine handing its output over (the Make panel's result): ready, collectOpen, collectClose, assembled. */
export function packHandOverState(elapsedMs) {
  const ms = Math.max(0, Number(elapsedMs) || 0);
  const a = MACHINE_STATE_MS.handReady;
  const b = a + MACHINE_STATE_MS.handOpen;
  const c = b + MACHINE_STATE_MS.collectClose;
  if (ms < a) return maybeFrozen({ state: 'ready', since: 0 });
  if (ms < b) return maybeFrozen({ state: 'collectOpen', since: a });
  if (ms < c) return maybeFrozen({ state: 'collectClose', since: b });
  return maybeFrozen({ state: 'assembled', since: c });
}

/** The craft session's elapsed ms (js/making.js createCraftSession): finished units plus the current one. */
export function craftSessionElapsedMs(timer) {
  if (!timer) return 0;
  let ms = 0;
  for (let i = 0; i < (timer.completed || 0); i++) ms += timer.durations?.[i] ?? timer.durationMs ?? 0;
  return ms + (Number(timer.unitElapsedMs) || 0);
}

/* --------------------------------------------------------------- frames */

/**
 * The sheet frame for `state`, `ms` after it began: loopers loop, the rest
 * play once and stop (on their Hold, when they have one).
 * @returns {number} frame index into the machine's sheet, or -1.
 */
export function machineFrame(classTsid, state, ms) {
  const sheet = MACHINE_ART_SHEETS[classTsid];
  const range = sheet?.states[state];
  if (!range) return -1;
  const [first, count] = range;
  const k = Math.max(0, Math.floor((Math.max(0, Number(ms) || 0) * MACHINE_ART_FPS) / 1000));
  // A QA freeze loops every state, so a once state shows its motion too.
  if (frozen || MACHINE_ART_LOOPERS.includes(state)) return first + (k % count);
  if (k < count) return first + k;
  const hold = HOLD_AFTER[state];
  return hold ? sheet.states[hold][0] : first + count - 1;
}

/** Pixel rect of frame k in a machine's sheet. */
export function machineFrameRect(classTsid, k) {
  const s = MACHINE_ART_SHEETS[classTsid];
  if (!s || k < 0) return null;
  return { x: (k % s.cols) * s.fw, y: Math.floor(k / s.cols) * s.fh, w: s.fw, h: s.fh };
}

/** createSheetLoader def (js/sprite-sheets.js) for a machine's sheet. */
export function machineSheetDef(classTsid) {
  const s = MACHINE_ART_SHEETS[classTsid];
  return s ? { path: s.url, fw: s.fw, fh: s.fh, cols: s.cols, frames: s.frames } : null;
}

/* ------------------------------------------------------------------ DOM */

/**
 * The 3x parts of a machine's sheet (tools/vector-sprites/machines.json, rendered
 * from each SWF's animatee clip; js/sprite-hires.js SPLIT_SPRITES) when the Make
 * panel would stretch the 1x art: more than one device pixel per art pixel
 * (devicePixelRatio x the panel scale), as the Make panel's tool sheets switch
 * to their 3x renders above 1x (tools/build-make-tool-sheets.py density_for).
 * Each part is [url, first frame, frame count, columns]. Null keeps the 1x sheet.
 */
export function machineHiresParts(classTsid, dpr = globalThis.devicePixelRatio || 1) {
  const s = MACHINE_ART_SHEETS[classTsid];
  const split = s ? SPLIT_SPRITES.get(s.url) : null;
  if (!split?.parts?.length || !(Number(dpr) * s.scale > 1)) return null;
  return split.parts;
}

/** CSS background (image, size, position) that shows frame k from the 1x sheet or its 3x part. */
export function machineFrameBackground(classTsid, k, parts = null) {
  const s = MACHINE_ART_SHEETS[classTsid];
  if (!s || k < 0) return null;
  const part = parts?.find(([, from, count]) => k >= from && k < from + count);
  if (part) {
    const [url, from, count, cols] = part;
    const j = k - from;
    return {
      image: `url('${keyedArt(url)}')`,
      size: `${cols * s.fw}px ${Math.ceil(count / cols) * s.fh}px`,
      position: `${-(j % cols) * s.fw}px ${-Math.floor(j / cols) * s.fh}px`,
    };
  }
  const r = machineFrameRect(classTsid, k);
  return {
    image: `url('${keyedArt(s.url)}')`,
    size: `${s.cols * s.fw}px ${Math.ceil(s.frames / s.cols) * s.fh}px`,
    position: `${-r.x}px ${-r.y}px`,
  };
}

/**
 * A span that shows one frame of a machine's sheet (the Make panel). The
 * caller moves it with setMachineArtFrame. Null for anything else.
 */
export function machineArtHtml(classTsid, { className = 'mp-tool mp-tool-machine', label = '', dpr } = {}) {
  const s = MACHINE_ART_SHEETS[classTsid];
  if (!s) return null;
  const parts = machineHiresParts(classTsid, dpr);
  const bg = machineFrameBackground(classTsid, 0, parts);
  const style = [
    `width:${s.fw}px`,
    `height:${s.fh}px`,
    `background-image:${bg.image}`,
    `background-size:${bg.size}`,
    parts ? `background-position:${bg.position}` : 'background-position:0 0',
    'background-repeat:no-repeat',
    `--mp-scale:${s.scale}`,
  ].join(';');
  const aria = label ? ` role="img" aria-label="${label.replace(/[<>&"]/g, '')}"` : ' aria-hidden="true"';
  const hires = parts ? ` data-machine-hires="3" data-machine-part="${bg.image.replace(/"/g, '')}"` : '';
  return `<span class="${className}" data-machine-art="${classTsid}" data-machine-state="assembled"${hires}${aria} style="${style}"></span>`;
}

/** Show `state`, `ms` after it began, on a span from machineArtHtml. */
export function setMachineArtFrame(el, state, ms) {
  const cls = el?.dataset?.machineArt;
  const k = machineFrame(cls, state, ms);
  const parts = el?.dataset?.machineHires ? machineHiresParts(cls, Infinity) : null;
  const bg = machineFrameBackground(cls, k, parts);
  if (!bg) return;
  // A split sheet's frames sit in more than one file (browsers rewrite url('') quotes, so compare our own copy).
  if (parts && el.dataset.machinePart !== bg.image) {
    el.dataset.machinePart = bg.image;
    el.style.backgroundImage = bg.image;
    el.style.backgroundSize = bg.size;
  }
  if (el.style.backgroundPosition !== bg.position) el.style.backgroundPosition = bg.position;
  if (el.dataset.machineState !== state) el.dataset.machineState = state;
}

/**
 * Play the pack hand-over (ready, collectOpen, collectClose, assembled) on a
 * span until it leaves the page or the sequence ends.
 */
export function playMachineHandOver(el, { now = () => performance.now(), raf = globalThis.requestAnimationFrame } = {}) {
  if (!el || typeof raf !== 'function') return;
  const t0 = now();
  const end = MACHINE_STATE_MS.handReady + MACHINE_STATE_MS.handOpen + MACHINE_STATE_MS.collectClose;
  const step = () => {
    if (!el.isConnected) return;
    const ms = now() - t0;
    const { state, since } = packHandOverState(ms);
    setMachineArtFrame(el, state, ms - since);
    if (ms <= end || frozen) raf(step);
  };
  step();
}
