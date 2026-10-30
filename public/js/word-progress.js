/**
 * The word progress bar (Austin, 2026-10-28): while a verb runs, its word
 * ("harvest", "water", "pet", "mine", ...) fills with colour from left to
 * right over the item, with the cancel button beside it, as the original did.
 *
 * Sources (tinyspeck, CC0):
 * - glitch-client WordProgressBar.as: the word comes from word_progress.type
 *   (showWord('progress_' + type), progress_default when the swf has no such
 *   word); animateProgress(annc.duration - fade_in_ms, counter_limit) tweens
 *   fill_mc.width from 0 to the word's width, linear, once per round
 *   (counter_limit rounds, 1 by default: Announcement.as counter_limit = 1);
 *   the cancel button (word_dismisser_cancel / _hover) sits at
 *   x = int(word width + 3), y = 13, shown when annc.dismissible.
 * - glitch-client InLocationAnnouncementOverlay.as showWordProgress (199-201):
 *   the bar is centred on the overlay point (x = -bar width / 2, its top on
 *   the point); placeByLocationItemstackView (74-112, 88-104): the point is the item's
 *   x + delta_x and its y (feet) + delta_y, plus getYAboveDisplay() (up to the
 *   item's top) unless place_at_bottom; keepInBounds pushes an itemstack
 *   overlay down at most 120 px to keep it on screen (145).
 * - glitch-client AbstractAnnouncementOverlay.as go/fadeIn/finish: fade in
 *   over fade_in_sec (0.2, at most a third of the duration), fade out over
 *   fade_out_sec (0.4, at most a third) starting at duration - 2 x fade in.
 * - glitch-GameServerJS players/inc_skill_packages.js runSkillPackage (205-292):
 *   the itemstack_overlay carries delta_x = source_delta_x (10 by default;
 *   negated when the item is right of the player), delta_y = source_delta_y
 *   (20 by default), place_at_bottom, word_progress; dismissible only when
 *   the duration is 2000 ms or more (279).
 * - glitch-GameServerJS config_base.js word_progress_map (180-209) and each
 *   item's runSkillPackage call (cited per row below).
 * Other players never saw this bar: runSkillPackage sends it with
 * apiSendAnnouncement to the acting player only; the location saw the
 * pc_overlay bubble (apiSendAnnouncementX). The remake keeps it local too.
 */
import { WORD_PROGRESS_ART } from './word-progress-art.js?v=bd57f998';

/** config_base.js 180-209, verbatim: map key -> word. */
export const WORD_PROGRESS_MAP = Object.freeze({
  assembling: 'assembling',
  disassembling: 'disassembling',
  embedding: 'embedding',
  harvest: 'harvest',
  installing: 'installing',
  massage: 'massage',
  milk: 'milk',
  nibble: 'nibble',
  pet: 'pet',
  revive: 'revive',
  scoop: 'scoop',
  squeeze: 'squeeze',
  uninstalling: 'uninstalling',
  water: 'water',
  mine: 'mine',
  scrape: 'scrape',
  repairing: 'repairing',
  crushing: 'crushing',
  digging: 'digdig',
  tend: 'tend',
  crystalmalizing: 'crystlmlzng',
  clear: 'clear',
  smelting: 'smelting',
  spinning: 'spinning',
});

/**
 * The remake's verb ids -> the word_progress_map key their source call used.
 * Verbs not listed (feed, pickup, sing_to, plant, smash, ...) had no word in
 * the source and show progress_default ("doing stuff"), per Austin's brief.
 */
export const VERB_WORD_KEYS = Object.freeze({
  harvest: 'harvest', // include/trants.js 250, wood_tree.js 702, peat_1.js 367
  pet: 'pet', // include/trants.js 35, npc_piggy.js 955, wood_tree.js 1061
  water: 'water', // include/trants.js 130, wood_tree.js 1083
  water_all: 'water', // gardens ran with no_timers (include/garden.js 142): the verb's own word
  nibble: 'nibble', // npc_piggy.js 882
  squeeze: 'squeeze', // npc_chicken.js 776
  massage: 'massage', // npc_butterfly.js 813
  milk: 'milk', // npc_butterfly.js 736
  mine: 'mine', // include/mining.js 230
  scrape: 'scrape', // mortar_barnacle.js 347
  scoop: 'scoop', // jellisac.js 67
  dig: 'digging', // dirt_pile.js 220, patch.js 196
  tend: 'tend', // patch.js 435
  clear: 'clear', // trant_*_dead.js 132
  rook_revive: 'revive', // include/rook.js 128
  disassemble: 'disassembling', // machine parts (fuelmaker_core.js 159 ...)
  assemble: 'assembling', // fuelmaker_core.js 395 ...
  repair: 'repairing', // tinkertool.js 485
});

/** A class whose call names a different word than its verb (classId:verbId -> word). */
export const CLASS_WORDS = Object.freeze({
  'ice_knob:scrape': 'scrape2', // ice_knob.js 375 word_progress: {type: "scrape2"}
  'spindle:spin': 'spinning', // spindle.js 394
  'splendid_spindle:spin': 'spinning', // splendid_spindle.js 394
  'smelter:smelt': 'smelting', // smelter.js 532
  'crystallizer:crystallize': 'crystlmlzng', // crystallizer.js 317
  'ore_grinder:grind': 'crushing', // ore_grinder.js 530
  'grand_ol_grinder:grind': 'crushing', // grand_ol_grinder.js 530
});

/** The trants (include/trants.js): pet 35, water 130, harvest 250 place_at_bottom, source_delta_y -140, source_delta_x 0. */
export const TRANT_CLASSES = Object.freeze(['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas']);
const TRANT_PLACE = Object.freeze({ placeAtBottom: true, sourceDeltaX: 0, sourceDeltaY: -140 });
/** mortar_barnacle.js 347 and ice_knob.js 375: source_delta_y 80, source_delta_x 40 (from the item's top). */
const SCRAPE_PLACE = Object.freeze({ placeAtBottom: false, sourceDeltaX: 40, sourceDeltaY: 80 });
/** inc_skill_packages.js 229-264 defaults: delta_x 10 toward the player, delta_y 20 below the item's top. */
export const DEFAULT_PLACE = Object.freeze({ placeAtBottom: false, sourceDeltaX: 10, sourceDeltaY: 20 });

export const DISMISSIBLE_MIN_MS = 2000; // inc_skill_packages.js 279
export const FADE_IN_MS = 200; // Announcement.as fade_in_sec .2
export const FADE_OUT_MS = 400; // Announcement.as fade_out_sec .4
export const CANCEL_GAP = 3; // WordProgressBar.as show: cancel_bt.x = int(word_holder.width + 3)
export const CANCEL_Y = 13; // cancel_bt.y = 13
export const MAX_PUSH_DOWN = 120; // InLocationAnnouncementOverlay.as keepInBounds Math.max(-120, rect.y)

const baseVerb = (verbId) => String(verbId || '').split(':')[0];

/** The word a running action shows (a key of WORD_PROGRESS_ART.words). */
export function wordForAction(classId, verbId) {
  const verb = baseVerb(verbId);
  const word = CLASS_WORDS[`${classId}:${verb}`] || WORD_PROGRESS_MAP[VERB_WORD_KEYS[verb]] || 'default';
  return WORD_PROGRESS_ART.words[word] ? word : 'default';
}

/** The source's placement for this class and verb (before the left/right flip). */
export function wordPlacementFor(classId, verbId) {
  const verb = baseVerb(verbId);
  if (TRANT_CLASSES.includes(classId) && ['pet', 'water', 'harvest'].includes(verb)) return TRANT_PLACE;
  if ((classId === 'mortar_barnacle' || classId === 'ice_knob') && verb === 'scrape') return SCRAPE_PLACE;
  return DEFAULT_PLACE;
}

/**
 * The overlay point in world px (the bar's top centre), as runSkillPackage and
 * placeByLocationItemstackView build it. itemTop is the item's top (world y).
 */
export function wordAnchor({ classId, verbId, itemX, itemY, itemTop, playerX }) {
  const place = wordPlacementFor(classId, verbId);
  // source_item.x < pc.x: delta_x = +source_delta_x, else -source_delta_x.
  const dx = itemX < playerX ? place.sourceDeltaX : -place.sourceDeltaX;
  let y = itemY + place.sourceDeltaY;
  if (!place.placeAtBottom) y += (Number.isFinite(itemTop) ? itemTop : itemY) - itemY;
  return { x: itemX + dx, y, placeAtBottom: place.placeAtBottom };
}

/** The bar's size: the word's cell and the cancel button beside it (1x px). */
export function wordBarLayout(word) {
  const art = WORD_PROGRESS_ART.words[word] || WORD_PROGRESS_ART.words.default;
  const cancel = WORD_PROGRESS_ART.cancel.normal;
  const wordW = art.fillBox[0] + art.fillBox[1];
  const cancelX = Math.floor(wordW + CANCEL_GAP);
  return {
    art,
    cancelX,
    cancelY: CANCEL_Y,
    // Flash counts a hidden child in its parent's width, so the bar centres on word + button either way.
    width: Math.max(art.w, cancelX + cancel.w),
    height: Math.max(art.h, CANCEL_Y + cancel.h),
  };
}

export const isDismissible = (durationMs) => Number(durationMs) >= DISMISSIBLE_MIN_MS;

/** Fill (0..1) and opacity at elapsedMs of a durationMs action (one round, counter_limit 1). */
export function wordTimeline(elapsedMs, durationMs, { reducedMotion = false, rounds = 1 } = {}) {
  const d = Math.max(1, Number(durationMs) || 1);
  const t = Math.min(d, Math.max(0, Number(elapsedMs) || 0));
  const fadeIn = Math.min(FADE_IN_MS, d / 3);
  const fadeOut = Math.min(FADE_OUT_MS, d / 3);
  // animateProgress(duration - fade-in offset, limit): each round fills in (duration - fade in) / limit.
  const roundMs = Math.max(1, (d - fadeIn) / Math.max(1, rounds));
  const done = t >= d - fadeIn;
  const fill = done ? 1 : (t % roundMs) / roundMs;
  let alpha = 1;
  if (!reducedMotion) {
    const outStart = d - 2 * fadeIn;
    if (t < fadeIn) alpha = t / fadeIn;
    else if (t > outStart) alpha = Math.max(0, 1 - (t - outStart) / fadeOut);
  }
  return { fill: Math.min(1, Math.max(0, fill)), alpha: Math.min(1, Math.max(0, alpha)) };
}

/**
 * QA (&actionhold=<0-1>): a running verb stops where its word is that full (1:
 * just full, before the verb lands) and the word stays opaque, for screenshots
 * of the fill. Never set in play.
 */
export let ACTION_HOLD = 0;
try {
  const v = Number(new URLSearchParams(globalThis.location?.search || '').get('actionhold'));
  if (v > 0 && v <= 1) {
    ACTION_HOLD = v;
    // QA only: shots move the hold without a reload (window.groddleWordHold(0.6)).
    globalThis.groddleWordHold = (next) => {
      ACTION_HOLD = Number(next) > 0 && Number(next) <= 1 ? Number(next) : ACTION_HOLD;
    };
  }
} catch {
  ACTION_HOLD = 0;
}

/** The time to advance a running action by (ACTION_HOLD caps it; otherwise deltaMs). */
export function heldActionDelta(action, deltaMs, hold = ACTION_HOLD) {
  if (!hold || !action) return deltaMs;
  const d = Math.max(1, Number(action.durationMs) || 1);
  const fillMs = d - Math.min(FADE_IN_MS, d / 3);
  return Math.max(0, Math.min(deltaMs, Math.min(hold * fillMs, d - 1) - action.elapsedMs));
}

function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * Drives #action-progress (the word, its fill and the cancel button).
 * onCancel runs when the cancel button is clicked.
 */
export function createWordProgressView(el, { onCancel } = {}) {
  if (!el) return null;
  const wordEl = el.querySelector('[data-word-progress]');
  const layers = {
    base: el.querySelector('.word-progress-base'),
    fill: el.querySelector('[data-action-fill]'),
    top: el.querySelector('.word-progress-top'),
  };
  const label = el.querySelector('[data-action-label]');
  const cancel = el.querySelector('[data-word-cancel]');
  let shownWord = '';
  let sheet = '';
  cancel?.addEventListener('pointerdown', (e) => e.stopPropagation());
  cancel?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel?.();
  });

  function setSheet(scale) {
    const dpr = Number(globalThis.devicePixelRatio) || 1;
    const atlas = WORD_PROGRESS_ART.atlas;
    const next = dpr * scale > 1.2 ? atlas.x3.url : atlas.x1.url;
    if (next === sheet) return;
    sheet = next;
    el.style.setProperty('--word-progress-sheet', `url("${next}")`);
    el.style.setProperty('--word-progress-atlas', `${atlas.w}px ${atlas.h}px`);
    el.dataset.sheet = next.endsWith('@3x.webp') ? '3x' : '1x';
  }

  function setWord(word) {
    if (word === shownWord) return;
    shownWord = word;
    const { art, cancelX, cancelY, width, height } = wordBarLayout(word);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.dataset.word = word;
    wordEl.style.width = `${art.w}px`;
    wordEl.style.height = `${art.h}px`;
    for (const name of ['base', 'fill', 'top']) {
      const layer = layers[name];
      if (!layer) continue;
      const cell = art[name];
      layer.hidden = !cell;
      if (!cell) continue;
      layer.style.width = `${art.w}px`;
      layer.style.height = `${art.h}px`;
      layer.style.backgroundPosition = `${-cell[0]}px ${-cell[1]}px`;
    }
    if (cancel) {
      cancel.style.left = `${cancelX}px`;
      cancel.style.top = `${cancelY}px`;
    }
  }

  return {
    /**
     * action: { classId, verbId, label, elapsedMs, durationMs }; at: the bar's
     * top centre in CSS px over the canvas, at.clampX(x, widthPx) keeping it in
     * view; scale: CSS px per world px.
     */
    show(action, at, scale) {
      const word = wordForAction(action.classId, action.verbId);
      setSheet(scale);
      setWord(word);
      const { art, width } = wordBarLayout(word);
      const reducedMotion = prefersReducedMotion() || ACTION_HOLD > 0;
      const { fill, alpha } = wordTimeline(action.elapsedMs, action.durationMs, { reducedMotion });
      if (layers.fill) layers.fill.style.width = `${(art.fillBox[0] + art.fillBox[1] * fill).toFixed(2)}px`;
      const dismissible = isDismissible(action.durationMs);
      if (cancel) cancel.hidden = !dismissible;
      if (label && label.textContent !== action.label) label.textContent = action.label;
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      el.style.opacity = alpha.toFixed(3);
      const x = at.clampX ? at.clampX(at.x, width * scale) : at.x;
      el.style.transform = `translate(${(x - (width / 2) * scale).toFixed(2)}px, ${at.y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      el.dataset.fill = fill.toFixed(3);
      el.dataset.cancel = dismissible ? 'shown' : 'hidden';
      return { word, x, fill, alpha, width: width * scale, dismissible, reducedMotion };
    },
    hide() {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    },
  };
}
