/**
 * Full-screen transition / award FX — timings and modes modeled on original Glitch client:
 * - LoadingLocationView.as: fadeIn ~0.2s easeInCubic, fadeOut ~0.5s easeInCubic
 * - BaseScreenView.as: fade_in ~0.4s, fade_out ~0.3s for award-style screens
 * - AchievementView.as: bg ~#a7c39c @ 0.9 alpha, full-viewport celebration
 *
 * DOM-driven (not Pixi) so it covers HUD + canvas inside #game-root.
 */

import { ACHIEVEMENT_DROP, ACHIEVEMENT_ROCK_WH, achievementBubbleText, easeOutBounce, mountPetRock } from './familiar.js?v=2089ac54';
import { formatLoadingTime, ordinal } from './exploration.js?v=19c6758f';
import { isModernSkin, momentArt, momentArtShape, rewardChips } from './ui/moment-card.js?v=3c9c0aa6';

/**
 * Street-load timings (seconds).
 * Slightly slower than original LoadingLocationView so teleports read as intentional
 * and the crossfade cannot be rushed past.
 */
export const LOAD_FADE_IN = 0.45;
export const LOAD_FADE_OUT = 0.85;
/** Pause after street is ready, before fade-out (ms). */
export const LOAD_HOLD_MS = 480;
/** BaseScreenView.as 33-34 fade_in_secs / fade_out_secs (tweens 109 and 153). */
export const AWARD_FADE_IN = 0.4;
export const AWARD_FADE_OUT = 0.3;
/**
 * Award and new-day screens stay up until the player closes them: BaseScreenView
 * has no timer, only onOkClick (171-173) from the OK button, Enter or Escape
 * (224-226). These holds are for QA only (awardAutoCloseMs), so headless
 * autoplay runs still finish.
 */
export const AWARD_QA_HOLD_MS = 3800;
export const NEW_DAY_QA_HOLD_MS = 4500;

/**
 * Each screen's OK button. AchievementView.as 117-124, LevelUpView.as 83-89,
 * CollectionCompleteView.as 98-104, NewDayView.as 112-118 (the Facebook and
 * Twitter share buttons of AchievementView 129-160 are left out). Screens the
 * client never had (quest cards, Feats, Cubimal boxes, emblems) use their
 * payload's primaryLabel, else 'OK'.
 */
export const AWARD_BUTTON_LABELS = Object.freeze({
  achievement: 'OK, Good!',
  level: 'Sweet sweetness...',
  collection: 'Alllllright!',
  newDay: 'Onwards and upwards!',
});

/**
 * When each OK button animates in (seconds after the screen starts): delay and
 * time of its tween, 40 px up with easeOutBounce (offset 40), except the
 * level-up button, which only fades (LevelUpView.as 257-258).
 * AchievementView.as 511-517, CollectionCompleteView.as 273-276, NewDayView.as 566-569.
 * Input is ready well before: once the .4 s fade-in ends (BaseScreenView.as 119-121).
 */
export const AWARD_BUTTON_IN = Object.freeze({
  achievement: Object.freeze({ delay: 1.5, time: 0.4, rise: 40 }),
  level: Object.freeze({ delay: 1.2, time: 0.5, rise: 0 }),
  collection: Object.freeze({ delay: 1.3, time: 0.4, rise: 40 }),
  newDay: Object.freeze({ delay: 1.3, time: 0.4, rise: 40 }),
  other: Object.freeze({ delay: 1.5, time: 0.4, rise: 40 }),
});

/** Which screen an award payload is: achievement, level, collection (trophies) or other. */
export function awardScreenKind(payload = {}) {
  if (payload.screen && AWARD_BUTTON_IN[payload.screen]) return payload.screen;
  if (payload.kind === 'achievement') return 'achievement';
  if (payload.kind === 'level') return 'level';
  return 'other';
}

/** The OK button's label for an award payload (AWARD_BUTTON_LABELS, else primaryLabel, else OK). */
export function awardButtonLabel(payload = {}) {
  const screen = awardScreenKind(payload);
  return AWARD_BUTTON_LABELS[screen] || String(payload.primaryLabel || '').trim() || 'OK';
}

/**
 * QA only: how long an award or new-day screen waits before closing itself,
 * or null (the game's default: it waits for the player).
 * `&awardautoclose=1` uses the QA hold, `=<ms>` that many ms, `=0` never;
 * without it, any `*autoplay` route (jobautoplay, questautoplay, ...) closes
 * screens after the QA hold, as they did before, so autoplay runs finish.
 */
export function awardAutoCloseMs(search = globalThis.location?.search || '', { newDay = false } = {}) {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const hold = newDay ? NEW_DAY_QA_HOLD_MS : AWARD_QA_HOLD_MS;
  if (params.has('awardautoclose')) {
    const raw = String(params.get('awardautoclose') || '').trim();
    if (raw === '0' || raw === 'off' || raw === 'false') return null;
    const ms = Number(raw);
    return Number.isFinite(ms) && ms > 1 ? ms : hold;
  }
  for (const [key, value] of params) {
    if (/autoplay$/i.test(key) && value !== '' && value !== '0') return hold;
  }
  return null;
}

/**
 * Street loading cards in flight (G192). The client holds prompts, quest
 * conversations and award screens while you move between locations
 * (model.moveModel.moving): glitch-client PromptView.as refresh 420 hides the
 * prompts and checkForNewPrompts 440 holds modal ones, QuestsDialog.as
 * onEmergencyTick 338 waits to show a quest conversation, and
 * TSFrontController.as tryShowScreenViewFromQ 3399-3400 keeps award screens
 * queued. So the card shows first and they follow once it has faded.
 *
 * The count lives on <html data-street-cards>, so every copy of this module
 * shares it (game.js imports it under a ?v= key, some features without one);
 * style.css hides .quest-dialogue modals while it is set.
 */
const STREET_CARD_ATTR = 'streetCards';
export const STREET_CARD_GONE = 'groddle:street-card-gone';

function streetCardRoot() {
  return globalThis.document?.documentElement || null;
}

/** True while a street loading card is up (fading in, holding or fading out). */
export function streetCardUp() {
  return Number(streetCardRoot()?.dataset?.[STREET_CARD_ATTR] || 0) > 0;
}

/** Resolves once no street loading card is up (at once when none is). */
export function afterStreetCard() {
  const root = streetCardRoot();
  if (!root || !streetCardUp()) return Promise.resolve();
  return new Promise((resolve) => {
    const gone = () => {
      if (streetCardUp()) return;
      root.removeEventListener(STREET_CARD_GONE, gone);
      resolve();
    };
    root.addEventListener(STREET_CARD_GONE, gone);
  });
}

function holdStreetCard(delta) {
  const root = streetCardRoot();
  if (!root?.dataset) return;
  const was = Number(root.dataset[STREET_CARD_ATTR] || 0);
  const n = Math.max(0, was + delta);
  if (n) {
    root.dataset[STREET_CARD_ATTR] = String(n);
    if (!was) root.dispatchEvent?.(new Event(STREET_CARD_UP));
    return;
  }
  delete root.dataset[STREET_CARD_ATTR];
  root.dispatchEvent?.(new Event(STREET_CARD_GONE));
}

/** Sent on <html> when the first street loading card goes up (G198). */
export const STREET_CARD_UP = 'groddle:street-card-up';

/**
 * setTimeout whose clock stops while a street loading card is up (G198).
 * glitch-client GrowlQueue.as moveMoveStarted 243-247 pauses a growl's fade
 * (TSTweener.pauseTweens) and hides it while you move, and moveMoveEnded
 * 249-253 resumes it; new growls wait in the queue (showNextMessage 86-92).
 * Toasts, activity lines and prompt timeouts use this so they are not spent
 * under the card. Armed while a card is up, the clock starts once it has gone.
 * Returns cancel().
 */
export function cardPausedTimeout(fn, ms) {
  const root = streetCardRoot();
  let left = Math.max(0, Number(ms) || 0);
  let startedAt = 0;
  let id = 0;
  let done = false;
  const cleanup = () => {
    root?.removeEventListener?.(STREET_CARD_UP, pause);
    root?.removeEventListener?.(STREET_CARD_GONE, resume);
  };
  const fire = () => {
    id = 0;
    if (done) return;
    done = true;
    cleanup();
    fn();
  };
  const run = () => {
    startedAt = Date.now();
    id = setTimeout(fire, left);
  };
  function pause() {
    if (!id) return;
    clearTimeout(id);
    id = 0;
    left = Math.max(0, left - (Date.now() - startedAt));
  }
  function resume() {
    if (done || id || streetCardUp()) return;
    run();
  }
  root?.addEventListener?.(STREET_CARD_UP, pause);
  root?.addEventListener?.(STREET_CARD_GONE, resume);
  if (!streetCardUp()) run();
  return () => {
    done = true;
    if (id) clearTimeout(id);
    id = 0;
    cleanup();
  };
}

/**
 * Prompts and dialogs the card gate hides (style.css `html[data-street-cards]
 * .quest-dialogue`): the main quest dialogue and the feature modals that
 * share its class (qi-dialogue, party, Rube, drops).
 */
export const CARD_GATED_DIALOGS = '.quest-dialogue';
/** Keys a dialog answers: Enter/Space press its button, Escape closes it. */
const CARD_DIALOG_KEYS = new Set(['Enter', ' ', 'Spacebar', 'Escape']);

/**
 * G200: should this key event be kept from a prompt the card hides? The
 * client hid prompts while you moved (PromptView.as refresh 420) and they
 * took no input; here the card only makes them invisible (visibility:
 * hidden), so Escape still closed one unseen (game.js closeQuestDialogue,
 * an offer read as "Not right now") and Enter/Space on a button left focused
 * inside one would answer it. True while a card is up and either the event
 * comes from inside a gated dialog, or it is a dialog key and one is open.
 */
export function cardHidesKey(event, doc = globalThis.document) {
  if (!streetCardUp()) return false;
  if (event?.target?.closest?.(CARD_GATED_DIALOGS)) return true;
  if (!CARD_DIALOG_KEYS.has(event?.key)) return false;
  return Boolean(doc?.querySelector?.(`${CARD_GATED_DIALOGS}:not([hidden])`));
}

const KEY_GUARD = Symbol.for('groddle.streetCardKeyGuard');

/**
 * Installs cardHidesKey on `target` (window) once, in the capture phase,
 * ahead of the game's and the features' key handlers: keydown, keypress and
 * keyup (Space presses a button on keyup) are stopped and their default
 * (the button press) prevented. Once per page, whichever ?v= copy of this
 * module loads first. Returns true when it installed.
 */
export function installStreetCardKeyGuard(target = globalThis.window) {
  if (!target?.addEventListener || target[KEY_GUARD]) return false;
  const guard = (event) => {
    if (!cardHidesKey(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup']) target.addEventListener(type, guard, true);
  target[KEY_GUARD] = guard;
  return true;
}

// game.js imports this module before any feature registers a key handler.
installStreetCardKeyGuard();

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for next animation frame (after CSS class applied).
 * @returns {Promise<void>}
 */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * Normalize player-paced quest-completion pages.
 * Empty/malformed arrays deliberately fall back to the ordinary timed award.
 * @param {{ steps?: Array<{text?: string, response?: string}>, primaryLabel?: string }} payload
 */
/**
 * Award text comes from GSJS copy, which carries the client's HTML: item links
 * (<a href="event:item|npc_piggy">Piggies</a>), <b>, <br>, <split> and entities.
 * The card shows plain text, so keep the words and drop the markup.
 */
export function awardText(value) {
  return String(value ?? '')
    .replace(/<split[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeAwardPages(payload = {}) {
  if (!Array.isArray(payload.steps)) return [];
  const pages = payload.steps
    .map((step) => ({
      text: awardText(step?.text),
      response: awardText(step?.response),
    }))
    .filter((step) => step.text || step.response);
  return pages.map((page, index) => ({
    text: page.text,
    response:
      page.response ||
      (index === pages.length - 1
        ? String(payload.primaryLabel || 'OK').trim() || 'OK'
        : 'Continue'),
  }));
}

/**
 * Turn the compact reward summary into source-style reward pills.
 * @param {string} subtitle
 */
export function awardRewardTokens(subtitle = '') {
  return String(subtitle || '')
    .split(/\s*·\s*/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const lower = text.toLowerCase();
      const kind =
        lower.includes('currant') ? 'currants'
        : lower.includes('energy') ? 'energy'
        : lower.includes('mood') ? 'mood'
        : lower.includes('favor') ? 'favor'
        : lower.includes('img') || /\bxp\b/i.test(text) ? 'img'
        : 'item';
      return { text, kind };
    });
}

/**
 * Fills `sub` with reward pills (awardRewardTokens). The modern card gives each the icon
 * js/ui/moment-card.js names (iMG, currants, a Giant's emblem).
 */
function fillRewardTokens(sub, rewards, { icons = false } = {}) {
  sub.replaceChildren();
  for (const reward of rewards) {
    const token = document.createElement('span');
    token.className = `award-reward award-reward--${reward.kind}`;
    if (icons && reward.icon) {
      const icon = document.createElement('img');
      icon.src = reward.icon;
      icon.alt = '';
      icon.className = 'award-reward-icon';
      token.appendChild(icon);
    }
    token.appendChild(document.createTextNode(reward.text));
    sub.appendChild(token);
  }
  sub.classList.toggle('has-reward-tokens', rewards.length > 0);
}

/**
 * Run a CSS opacity transition on an element that starts hidden.
 * @param {HTMLElement} el
 * @param {{ show: boolean, durationSec: number }} opts
 */
export async function crossfadeElement(el, { show, durationSec, easing = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)' }) {
  if (!el) return;
  el.hidden = false;
  el.style.transition = `opacity ${durationSec}s ${easing}`; // easeInCubic-ish by default (LoadingLocationView)
  await nextFrame();
  if (show) {
    el.classList.add('is-visible');
    el.setAttribute('aria-hidden', 'false');
  } else {
    el.classList.remove('is-visible');
    el.setAttribute('aria-hidden', 'true');
  }
  await wait(durationSec * 1000 + 20);
  if (!show) {
    el.hidden = true;
    el.style.transition = '';
  }
}

/** LocationRenderer / DecoByteLoader status labels on the card's bar. */
export const LOAD_STATUS = Object.freeze({
  loading: 'loading...',
  preparing: 'preparing...',
  splines: 'reticulating splines...',
});

/** The bar label with TimerBar show_perc_in_label: "reticulating splines... 39%". */
export function loadStatusLabel(text, percent = 0) {
  const p = Math.round(Number(percent) || 0);
  return p ? `${text} ${p}%` : text;
}

/** 0xRRGGBB or '#rrggbb' to a CSS colour. */
export function cssColor(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

/**
 * LoadingLocationView.refresh: the split "Leaving / Welcome to" card shows
 * only when the hub changes; "Leaving" needs the two hubs' colours to differ.
 */
export function loadingSplit({ fromHub = '', toHub = '', fromTop, fromBottom, toTop, toBottom } = {}) {
  if (!fromHub || !toHub || fromHub === toHub) return { split: false, leaving: false, welcome: false };
  const same = cssColor(fromTop, '') === cssColor(toTop, '') && cssColor(fromBottom, '') === cssColor(toBottom, '');
  return { split: true, leaving: !same, welcome: Boolean(toHub) };
}

/* ------------------------------------------------------------------ */
/* G249: the home loading card (LoadingLocationPOLView)                */
/* ------------------------------------------------------------------ */

/**
 * LoadingInfo.as 12-14. location.js getLoadingInfo 3391-3407 sends pol_type
 * (homes_get_type) and the owner for a home location, and
 * LoadingLocationView.fadeIn 340-370 then hides the picture, the street name,
 * the hub and the Home to: list and shows LoadingLocationPOLView instead.
 */
export const POL_TYPES = Object.freeze(['interior', 'exterior', 'tower']);

/** LoadingLocationPOLView.as 24-31 and refresh 147-159. */
export const POL_LAYOUT = Object.freeze({
  extX: 135,
  intX: 290,
  lastHereW: 326,
  lastHereH: 28,
  gradRadius: 200,
  gradColors: Object.freeze(['#d5ede1', '#adccbd']),
  gradSpread: Object.freeze([90, 255]),
  /** setNeighbors 384: at most five faces. */
  maxNeighbours: 5,
});

/** The pc singles picture the card loads (setAvatar 333, `_172.png`: 172 x 248). */
export const POL_OWNER_SIZE = Object.freeze({ w: 172, h: 248 });

/**
 * buildBase 62-68: Tiny Speck's enter_home_door.png / enter_tower_door.png
 * (glitch-client TSEngineAssets/src/assets/graphics, Assets.as 245-248).
 */
const POL_DOORS = Object.freeze({
  interior: Object.freeze({ src: 'assets/sprites/loading/enter_home_door.png', x: 0, y: 0, w: 294, h: 380 }),
  tower: Object.freeze({ src: 'assets/sprites/loading/enter_tower_door.png', x: -105, y: -10, w: 409, h: 370 }),
});

export function isPolType(type) {
  return POL_TYPES.includes(type);
}

/** StringUtil.nameApostrophe 581-587: always "’s" ("we don't want to be old times"). */
export function nameApostrophe(name) {
  return name ? `${name}’s` : '';
}

/**
 * setText 215-235: "Entering", then "Your" (or the owner's name), then House,
 * Home Street or Tower. A custom name takes the name's place, and a Tower's
 * last line becomes "(Your Tower)".
 * @param {{ type: string, ownerName?: string, customName?: string }} pol
 */
export function polCardTitle({ type, ownerName = '', customName = '' } = {}) {
  if (!isPolType(type)) return null;
  let name = ownerName ? nameApostrophe(ownerName) : 'Your';
  let street = type === 'interior' ? 'House' : 'Home Street';
  if (type === 'tower') street = 'Tower';
  if (customName) {
    if (type === 'tower') street = `(${name} Tower)`;
    name = customName;
  }
  return { entering: 'Entering', name, street };
}

/**
 * setDetails 282-310, the last-here box as the client's HTML. Unlike the
 * street card it has no Qurazy line, says "just moments ago" without a time,
 * and trims the time to two parts (one past ten days). The em-dash is Tiny
 * Speck's own (&#8212;, line 299).
 * @param {{ firstVisit?: boolean, visitCount?: number, lastVisitMins?: number }} visit
 */
export function polVisitLine(visit = {}) {
  let txt = '';
  const mins = Number(visit.lastVisitMins) || 0;
  const count = Number(visit.visitCount) || 0;
  if (visit.firstVisit) {
    txt = '<b>First time here!</b>';
  } else {
    txt = mins
      ? `Last here <b>${formatLoadingTime(mins * 60, { maxToShow: mins < 1440 * 10 ? 2 : 1 })} ago</b>`
      : 'Last here <b>just moments ago</b>';
    if (count) txt += ' &#8212; ';
  }
  // visit_count is 0-based: first visit = 0, 2nd = 1 (lines 304-307).
  if (count && !visit.firstVisit) txt += `this is your ${ordinal(count + 1)} visit`;
  return txt;
}

/** setDetails 313-316: only the first street feature, after "Features: ". */
export function polFeaturesLine(features = []) {
  const first = Array.isArray(features) ? features.find((f) => f) : '';
  return first ? `Features: ${first}` : '';
}

/**
 * setNeighbors 383-424: exterior only, the first five neighbours that have a
 * face; the row shows only when one does.
 * @param {Array<{ name?: string, faceUrl?: string }>} list
 */
export function polNeighbours(type, list = []) {
  if (type !== 'exterior' || !Array.isArray(list)) return [];
  return list.slice(0, POL_LAYOUT.maxNeighbours).filter((n) => n?.faceUrl);
}

/**
 * Where everything sits (refresh 147-187, setText 202-209, setAvatar 337-347):
 * the text column at x 290 behind a door (house: x 0, Tower: -105, -10) or at
 * x 135 on a home street; the owner at -20, 15 by the door or -40, -20 outside.
 */
export function polCardLayout(type) {
  if (!isPolType(type)) return null;
  const inside = type !== 'exterior';
  const textX = inside ? POL_LAYOUT.intX : POL_LAYOUT.extX;
  const owner = inside ? { x: -20, y: 15 } : { x: -40, y: -20 };
  const door = POL_DOORS[type] || null;
  return {
    textX,
    enterY: inside ? 50 : 0,
    featuresPad: inside ? 20 : 12,
    allWidth: textX + POL_LAYOUT.lastHereW,
    owner,
    door,
    artHeight: Math.max(owner.y + POL_OWNER_SIZE.h, door ? door.y + door.h : 0),
  };
}

/**
 * refresh 189-195: the radial fill, a 200 px circle centred 30 px right of
 * the holder's left edge (the holder is centred), mint inside 90/255 of the
 * way out, then the darker green. `scale` shrinks it with the holder on a
 * narrow screen.
 */
export function polGradient(layout, scale = 1) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const half = Math.round(((layout?.allWidth || POL_LAYOUT.extX + POL_LAYOUT.lastHereW) / 2 - 30) * s);
  const [inner, outer] = POL_LAYOUT.gradColors;
  const stop = Math.round((POL_LAYOUT.gradSpread[0] / 255) * 1000) / 10;
  return `radial-gradient(circle ${Math.round(POL_LAYOUT.gradRadius * s)}px at calc(50% - ${half}px) 50%, ${inner} ${stop}%, ${outer} 100%)`;
}

/** The holder's scale on a screen narrower than the card (16 px gutters); 1 otherwise. */
export function polCardScale(layout, viewWidth) {
  const w = Number(viewWidth) || 0;
  if (!layout || w <= 0) return 1;
  return Math.min(1, Math.max(0.3, (w - 32) / layout.allWidth));
}

const CARD_HTML = `
  <div class="st-split" data-st-split hidden></div>
  <div class="st-hubs">
    <p class="st-hub-leave" data-st-leaving hidden><span>Leaving</span><b data-st-leave-hub></b></p>
    <p class="st-hub-welcome" data-st-welcoming hidden><span>Welcome to</span><b data-st-welcome-hub></b></p>
  </div>
  <div class="screen-transition-inner st-card">
    <p class="st-last" data-st-last><span data-st-last-text></span><img class="st-qurazy" data-st-qurazy src="assets/sprites/loading/qurazy_quoin.png" alt="Qurazy Quoin" hidden /></p>
    <div class="st-snap-wrap" data-st-snap-wrap hidden><img class="st-snap" data-st-snap alt="" /></div>
    <div class="st-title">
      <p class="st-entering">Entering</p>
      <h2 class="st-enter" data-st-enter>…</h2>
      <p class="st-enter-hub" data-st-enter-hub></p>
    </div>
    <div class="st-details">
      <div class="st-home" data-st-home hidden></div>
      <img class="st-upgrade-badge" data-st-upgrade-badge src="assets/sprites/loading/upgrade_badge.png" alt="Upgraded since your last visit" hidden />
      <div class="st-upgrade" data-st-upgrade hidden></div>
    </div>
  </div>
  <div class="st-pol" data-st-pol hidden>
    <div class="st-pol-holder" data-st-pol-holder>
      <div class="st-pol-art" data-st-pol-art>
        <img class="st-pol-door" data-st-pol-door alt="" hidden />
        <img class="st-pol-owner" data-st-pol-owner alt="" hidden />
      </div>
      <div class="st-pol-text" data-st-pol-text>
        <p class="st-pol-entering" data-st-pol-entering>Entering</p>
        <p class="st-pol-name" data-st-pol-name></p>
        <p class="st-pol-street" data-st-pol-street></p>
        <p class="st-pol-last" data-st-pol-last></p>
        <p class="st-pol-features" data-st-pol-features hidden></p>
        <div class="st-pol-neighbours" data-st-pol-neighbours hidden><span>Neighbors:</span></div>
      </div>
    </div>
  </div>
  <div class="st-progress" aria-hidden="true"><i data-st-bar></i><span class="st-status" data-st-status></span></div>`;

/** Builds the card once over whatever placeholder markup the page shipped. */
function ensureLoadingCard(el) {
  if (el.dataset.stCard === '3' || !el.ownerDocument) return;
  el.innerHTML = CARD_HTML;
  el.dataset.stCard = '3';
}

/**
 * G249: show or hide the home card (LoadingLocationView.fadeIn 340-370:
 * pol_ui.visible = is_house, over the street card and under the bar).
 * Returns the layout when shown.
 */
function showPolCard(el, pol) {
  const root = el.querySelector('[data-st-pol]');
  const layout = pol ? polCardLayout(pol.type) : null;
  const title = pol ? polCardTitle(pol) : null;
  el.dataset.stPol = layout ? pol.type : '';
  if (!root) return null;
  if (!layout || !title) {
    root.hidden = true;
    return null;
  }
  const q = (sel) => root.querySelector(sel);
  root.hidden = false;
  root.style.background = polGradient(layout);
  const holder = q('[data-st-pol-holder]');
  if (holder) {
    holder.style.width = `${layout.allWidth}px`;
    holder.style.gridTemplateColumns = `${layout.textX}px ${POL_LAYOUT.lastHereW}px`;
  }
  const art = q('[data-st-pol-art]');
  if (art) art.style.minHeight = `${layout.artHeight}px`;
  const text = q('[data-st-pol-text]');
  if (text) {
    text.style.paddingTop = `${layout.enterY}px`;
    text.style.setProperty('--st-pol-features-pad', `${layout.featuresPad}px`);
  }
  const door = q('[data-st-pol-door]');
  if (door) {
    door.hidden = !layout.door;
    if (layout.door) {
      door.src = layout.door.src;
      Object.assign(door.style, { left: `${layout.door.x}px`, top: `${layout.door.y}px`, width: `${layout.door.w}px`, height: `${layout.door.h}px` });
    } else door.removeAttribute('src');
  }
  const owner = q('[data-st-pol-owner]');
  if (owner) {
    Object.assign(owner.style, { left: `${layout.owner.x}px`, top: `${layout.owner.y}px`, width: `${POL_OWNER_SIZE.w}px`, height: `${POL_OWNER_SIZE.h}px` });
    owner.hidden = true;
    owner.removeAttribute('src');
    // setAvatar / onAvatarLoad 327-367: the picture arrives when it has loaded.
    const want = (owner.dataset.want = String(Math.random()));
    Promise.resolve(typeof pol.ownerImg === 'function' ? pol.ownerImg() : pol.ownerImg)
      .then((url) => {
        if (!url || owner.dataset.want !== want) return;
        owner.alt = pol.ownerName || 'You';
        owner.onload = () => { if (owner.dataset.want === want) owner.hidden = false; };
        owner.src = url;
      })
      .catch(() => {});
  }
  const set = (sel, value) => {
    const node = q(sel);
    if (node) node.textContent = value;
  };
  set('[data-st-pol-entering]', title.entering);
  set('[data-st-pol-name]', title.name);
  set('[data-st-pol-street]', title.street);
  el.dataset.stPolTitle = `${title.entering} / ${title.name} / ${title.street}`;
  const name = q('[data-st-pol-name]');
  if (name) name.style.fontSize = '';
  setPolVisit(el, pol.visit);
  setPolDetails(el, pol, []);
  const row = q('[data-st-pol-neighbours]');
  if (row) {
    row.querySelectorAll('img').forEach((img) => img.remove());
    const faces = polNeighbours(pol.type, pol.neighbours);
    for (const n of faces) {
      const img = el.ownerDocument.createElement('img');
      img.className = 'st-pol-face';
      img.alt = n.name || '';
      img.src = n.faceUrl;
      row.append(img);
    }
    row.hidden = !faces.length;
  }
  return layout;
}

/**
 * Needs layout, so after the fade-in starts: refresh 170-175 scales a name
 * wider than the last-here box down to fit, and a narrow screen scales the
 * whole holder (and the fill with it).
 */
function fitPolCard(el, layout) {
  const root = el.querySelector('[data-st-pol]:not([hidden])');
  const view = el.ownerDocument?.defaultView;
  if (!root || !view) return;
  const scale = polCardScale(layout, root.clientWidth);
  root.querySelector('[data-st-pol-holder]')?.style.setProperty('--st-pol-scale', String(scale));
  root.style.background = polGradient(layout, scale);
  const name = root.querySelector('[data-st-pol-name]');
  if (!name) return;
  const over = name.scrollWidth / POL_LAYOUT.lastHereW;
  if (over > 1) name.style.fontSize = `${Math.floor(parseFloat(view.getComputedStyle(name).fontSize) / over)}px`;
}

function setPolVisit(el, visit) {
  const node = el.querySelector('[data-st-pol-last]');
  const html = polVisitLine(visit || {});
  if (node) node.innerHTML = html;
  el.dataset.stVisit = html.replace(/<[^>]+>/g, '').replace(/&#8212;/g, '—');
}

function setPolDetails(el, pol, features) {
  const node = el.querySelector('[data-st-pol-features]');
  const html = polFeaturesLine(features?.length ? features : pol?.features);
  if (node) {
    node.innerHTML = html;
    node.hidden = !html;
  }
  el.dataset.stPolFeatures = html.replace(/<[^>]+>/g, '');
}

/**
 * Full street-load sequence: fade in → work → fade out
 * (LoadingLocationView.as fadeIn / showRegular / refresh / fadeOut).
 * @param {HTMLElement} el  #screen-transition
 * @param {{
 *   fromLabel?: string,
 *   fromHub?: string,
 *   toLabel: string,
 *   toHub?: string,
 *   loadingImg?: string|null,
 *   topColor?: string|number|null,
 *   bottomColor?: string|number|null,
 *   fromTopColor?: string|number|null,
 *   fromBottomColor?: string|number|null,
 *   visitHtml?: string,
 *   details?: () => ({ visitHtml?: string, qurazyHere?: boolean, features?: string[], activeProject?: boolean,
 *     upgradeHtml?: string, upgradeBadge?: boolean }|null|Promise<object|null>),
 *   pol?: { type: 'interior'|'exterior'|'tower', ownerName?: string, customName?: string,
 *     visit?: { firstVisit?: boolean, visitCount?: number, lastVisitMins?: number },
 *     features?: string[], neighbours?: Array<{ name?: string, faceUrl?: string }>,
 *     ownerImg?: string|null|Promise<string|null>|(() => Promise<string|null>) }|null,
 *   holdMs?: number,
 *   onMid?: () => Promise<void>|void,
 * }} opts
 */
export async function runStreetTransition(el, opts) {
  if (!el) return streetTransition(el, opts);
  // Prompts, conversations and awards wait for the card (G192, see streetCardUp).
  holdStreetCard(1);
  try {
    return await streetTransition(el, opts);
  } finally {
    holdStreetCard(-1);
  }
}

async function streetTransition(el, opts) {
  if (!el) {
    if (opts.onMid) await opts.onMid();
    return;
  }
  ensureLoadingCard(el);
  const q = (sel) => el.querySelector(sel);
  const enter = q('[data-st-enter]');
  const enterHub = q('[data-st-enter-hub]');
  const bar = q('[data-st-bar]');
  const status = q('[data-st-status]');
  const snapWrap = q('[data-st-snap-wrap]');
  const snap = q('[data-st-snap]');
  const last = q('[data-st-last-text]') || q('[data-st-last]');
  const qurazy = q('[data-st-qurazy]');
  const home = q('[data-st-home]');
  const upgrade = q('[data-st-upgrade]');
  const badge = q('[data-st-upgrade-badge]');
  const splitEl = q('[data-st-split]');
  const leaving = q('[data-st-leaving]');
  const welcoming = q('[data-st-welcoming]');

  // Hub gradient (LoadingLocationView top_color / bottom_color).
  const top = cssColor(opts.topColor, '#1a2830');
  const bot = cssColor(opts.bottomColor, '#1e2a24');
  const gradient = (a, b) => `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
  const split = loadingSplit({
    fromHub: opts.fromHub,
    toHub: opts.toHub,
    fromTop: opts.fromTopColor ?? opts.topColor,
    fromBottom: opts.fromBottomColor ?? opts.bottomColor,
    toTop: opts.topColor,
    toBottom: opts.bottomColor,
  });
  if (split.split) {
    // Left half keeps the old hub's colours; the scalloped right half has the new one.
    el.style.background = gradient(cssColor(opts.fromTopColor, top), cssColor(opts.fromBottomColor, bot));
    if (splitEl) {
      splitEl.style.background = gradient(top, bot);
      splitEl.classList.toggle('has-shadow', split.leaving);
      splitEl.hidden = false;
    }
  } else {
    el.style.background = gradient(top, bot);
    if (splitEl) splitEl.hidden = true;
  }
  if (leaving) {
    leaving.hidden = !split.leaving;
    const hub = leaving.querySelector('[data-st-leave-hub]');
    if (hub) hub.textContent = opts.fromHub || '';
  }
  if (welcoming) {
    welcoming.hidden = !split.welcome;
    const hub = welcoming.querySelector('[data-st-welcome-hub]');
    if (hub) hub.textContent = opts.toHub || '';
  }
  el.dataset.stSplit = split.split ? (split.leaving ? 'leaving' : 'welcome') : '';

  if (enter) enter.textContent = opts.toLabel || 'An Unknown Area';
  if (enterHub) {
    enterHub.textContent = opts.toHub ? `in ${opts.toHub}` : '';
    enterHub.hidden = !opts.toHub;
  }
  const setVisit = (html, showQurazy = false) => {
    if (last) last.innerHTML = html || '';
    if (qurazy) qurazy.hidden = !showQurazy;
    el.dataset.stVisit = String(html || '').replace(/<[^>]+>/g, '').replace(/&#8212;/g, '—');
  };
  setVisit(opts.visitHtml || '');
  if (home) {
    home.innerHTML = '';
    home.hidden = true;
  }
  if (upgrade) {
    upgrade.innerHTML = '';
    upgrade.hidden = true;
  }
  if (badge) badge.hidden = true;
  el.dataset.stHomeTo = '';
  // G249: a home (location.js getLoadingInfo pol_type) gets the owner's card instead.
  const polLayout = showPolCard(el, opts.pol);
  if (snapWrap && snap) {
    // refresh() always drew the rounded 0x666666 picture box with the street's
    // picture over it, and set "Entering" 42 px above the box's foot. Most
    // streets have no picture in the remake: an empty box under the overlapping
    // title read as broken, so without one the box goes and the title stands
    // on its own (data-st-snap="none").
    const card = snapWrap.closest('.st-card');
    const noPicture = () => {
      snap.removeAttribute('src');
      snap.hidden = true;
      snapWrap.hidden = true;
      card?.classList.add('no-snap');
      el.dataset.stSnap = 'none';
    };
    if (opts.loadingImg) {
      snap.alt = opts.toLabel || 'Street preview';
      snap.hidden = false;
      snapWrap.hidden = false;
      card?.classList.remove('no-snap');
      el.dataset.stSnap = 'picture';
      snap.onerror = noPicture;
      snap.src = opts.loadingImg;
    } else {
      noPicture();
    }
  }
  const setStatus = (text, percent = 0) => {
    const label = loadStatusLabel(text, percent);
    if (status) status.textContent = label;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    el.dataset.stStatus = label;
  };
  setStatus(LOAD_STATUS.loading);

  // Non-interactive during load (no click-to-skip)
  el.style.pointerEvents = 'auto';
  el.setAttribute('aria-busy', 'true');

  const fading = crossfadeElement(el, { show: true, durationSec: LOAD_FADE_IN });
  if (polLayout) fitPolCard(el, polLayout);
  await fading;

  try {
    setStatus(LOAD_STATUS.preparing);
    if (opts.onMid) await opts.onMid();
    // What the street turned out to hold (location.js getLoadingInfo street_details).
    const info = opts.details ? await opts.details() : null;
    if (info && polLayout) {
      // LoadingLocationPOLView.setDetails: the box keeps its own words; Features: is the first street feature.
      setPolDetails(el, opts.pol, Array.isArray(info.features) ? info.features : []);
    } else if (info) {
      if (info.visitHtml != null || info.qurazyHere) setVisit(info.visitHtml ?? opts.visitHtml, Boolean(info.qurazyHere));
      const features = Array.isArray(info.features) ? info.features : [];
      if (home && (features.length || info.activeProject)) {
        // LoadingLocationView.buildHomeTo
        const proj = '<span class="st-hl">Active project!</span>';
        const items = features.length
          ? features.map((f, i) => `<li>${f}${i === 0 && info.activeProject ? `&nbsp;&nbsp;&nbsp;${proj}` : ''}</li>`)
          : [`<li>${proj}</li>`];
        home.innerHTML = `<b>Home to:</b><ul>${items.join('')}</ul>`;
        home.hidden = Boolean(info.upgradeBadge);
        el.dataset.stHomeTo = features.map((f) => f.replace(/<[^>]+>/g, '')).join(' | ');
      }
      if (upgrade && info.upgradeHtml) {
        upgrade.innerHTML = info.upgradeHtml;
        upgrade.hidden = false;
      }
      if (badge) badge.hidden = !info.upgradeBadge;
      el.dataset.stUpgradeBadge = info.upgradeBadge ? '1' : '0';
    }
    // LocationRenderer READYING_TEXT, counted up over the hold so travel is no slower.
    // QA only (js/loading-card-qa.js): &loadcardhold=<ms> keeps the card up for screenshots.
    const qaHold = Number(new URLSearchParams(globalThis.location?.search || '').get('loadcardhold')) || 0;
    const hold = qaHold || (opts.holdMs ?? LOAD_HOLD_MS);
    const steps = 6;
    setStatus(LOAD_STATUS.splines);
    for (let i = 1; i <= steps; i += 1) {
      await wait(hold / steps);
      setStatus(LOAD_STATUS.splines, (100 * i) / steps);
    }
  } finally {
    await crossfadeElement(el, { show: false, durationSec: LOAD_FADE_OUT });
    if (bar) bar.style.width = '0%';
    if (snap) snap.removeAttribute('src');
    el.setAttribute('aria-busy', 'false');
  }
}

/**
 * G219: the familiar drops in beside a new badge (AchievementView.as 163-185,
 * 466-480, 541-557): pet_rock idle at 68 px falls from above the screen with
 * easeOutBounce (1 s, after 1 s) onto a blurred black oval (0.8, blur
 * 25 / 15 px plus the gap / 10 while it falls), and 0.4 s after it lands it
 * says "New Achievement!" (plus the status text) in a chat bubble.
 * Returns a stop function.
 */
export function startFamiliarDrop(fam, { status = '', body = '', name = '' } = {}) {
  if (!fam) return () => {};
  const rock = fam.querySelector('[data-award-familiar-rock]');
  const shadow = fam.querySelector('.award-familiar-shadow');
  const bubble = fam.querySelector('[data-award-familiar-bubble]');
  mountPetRock(rock, { size: ACHIEVEMENT_ROCK_WH });
  const text = achievementBubbleText({ status, name });
  // G225: the card prints desc, so the bubble always carries the status line:
  // status_text, or 'You got the <name> badge!' (AchievementView.as 552;
  // inc_achievements.js 310-311). `body` is kept for callers; unused.
  void body;
  const line = text.line;
  if (bubble) {
    bubble.hidden = true;
    bubble.querySelector('b').textContent = text.head;
    bubble.querySelector('span').textContent = line;
    bubble.querySelector('span').hidden = !line;
  }
  fam.dataset.phase = 'waiting';
  rock.style.transform = 'translateY(-200vh)';
  if (shadow) shadow.style.opacity = '0';
  const t0 = performance.now();
  let raf = 0;
  let from = 0;
  let bubbleTimer = 0;
  let stopped = false;
  const frame = (now) => {
    if (stopped) return;
    const t = now - t0 - ACHIEVEMENT_DROP.delayMs;
    if (t < 0) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (!from) {
      // From above the screen: -(distance to the top) - 2 * the rock's height.
      const host = fam.closest('.award-screen') || fam.parentElement;
      const top = host ? fam.getBoundingClientRect().top - host.getBoundingClientRect().top : 200;
      from = Math.max(200, top + 2 * ACHIEVEMENT_ROCK_WH);
      fam.dataset.phase = 'falling';
      if (shadow) shadow.style.opacity = '1';
    }
    const p = Math.min(1, t / ACHIEVEMENT_DROP.durationMs);
    const gap = from * (1 - easeOutBounce(p));
    rock.style.transform = `translateY(${-gap.toFixed(1)}px)`;
    if (shadow) shadow.style.filter = `blur(${((25 + gap / 10) / 4).toFixed(1)}px)`;
    if (p < 1) {
      raf = requestAnimationFrame(frame);
      return;
    }
    fam.dataset.phase = 'landed';
    bubbleTimer = setTimeout(() => {
      if (stopped || !bubble) return;
      bubble.hidden = false;
      fam.dataset.phase = 'talking';
    }, ACHIEVEMENT_DROP.bubbleAfterMs);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(bubbleTimer);
  };
}

/** Keys whose browser default (scrolling the page) a screen with the keyboard stops. */
const SCREEN_NAV_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

/** A text field outside the screen (the online chat box) keeps its own keys. */
function typingElsewhere(event, el) {
  const t = event?.target;
  return Boolean(t?.closest?.('input, textarea, select, [contenteditable="true"]') && !el?.contains?.(t));
}

/**
 * The input of one award or new-day screen (BaseScreenView.as).
 * - It takes the keyboard while it is up, fading included: TSFrontController
 *   requestFocus blurs the location (TSMainView.as blur 538-555 stops the
 *   avatar's key control and LocationInputHandler), so no key reaches the
 *   avatar, the hotkeys or the features (a capture listener on window, ahead
 *   of theirs). Key-ups pass, so a key held before the screen does not stick.
 * - Enter and Escape call onOkClick (startListeningForControlEvts 224-226),
 *   the OK button too (each view's ok_bt CLICK); clicks anywhere else on the
 *   screen do nothing.
 * - onOkClick closes only once ready_for_input (171-173), which onAnimateComplete
 *   sets when the fade-in ends (99-121); earlier presses and clicks are ignored.
 * - KeyBeacon fires KEY_DOWN_ once per press (KeyBeacon.as 296-302) and a
 *   Shift/Ctrl/Alt press is a different key there (289-295): a held or
 *   modified Enter does not close it.
 * Returns { done, ready, close, release }: `done` resolves with how it closed.
 */
export function screenInput(el, { button = null, win = globalThis.window } = {}) {
  let isReady = false;
  let closed = false;
  let resolveDone = () => {};
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const close = (how = 'button') => {
    if (!isReady || closed) return false;
    closed = true;
    el.dataset.awardInput = 'closing';
    el.dataset.awardClosedBy = how;
    resolveDone(how);
    return true;
  };
  const onKey = (event) => {
    if (typingElsewhere(event, el)) return;
    event.stopImmediatePropagation();
    const plain = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (event.type === 'keydown' && plain && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault();
      if (!event.repeat) close(event.key === 'Enter' ? 'enter' : 'escape');
      return;
    }
    if (SCREEN_NAV_KEYS.has(event.key) || event.key === 'Enter') event.preventDefault();
  };
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button && (event.target === button || button.contains?.(event.target))) close('button');
  };
  win?.addEventListener?.('keydown', onKey, true);
  win?.addEventListener?.('keypress', onKey, true);
  el.addEventListener('click', onClick);
  el.dataset.awardInput = 'waiting';
  delete el.dataset.awardClosedBy;
  return {
    done,
    ready() {
      if (closed) return;
      isReady = true;
      el.dataset.awardInput = 'ready';
    },
    close,
    release() {
      win?.removeEventListener?.('keydown', onKey, true);
      win?.removeEventListener?.('keypress', onKey, true);
      el.removeEventListener('click', onClick);
      el.dataset.awardInput = 'closed';
    },
  };
}

/** Sets the OK button's label and its entrance (AWARD_BUTTON_IN) for one screen. */
function prepareOkButton(button, label, screen) {
  if (!button) return;
  const anim = AWARD_BUTTON_IN[screen] || AWARD_BUTTON_IN.other;
  button.textContent = label;
  button.disabled = false;
  button.removeAttribute('aria-disabled');
  button.hidden = false;
  button.style.setProperty('--award-ok-delay', `${anim.delay}s`);
  button.style.setProperty('--award-ok-time', `${anim.time}s`);
  button.style.setProperty('--award-ok-rise', `${anim.rise}px`);
  button.dataset.awardOk = anim.rise ? 'bounce' : 'fade';
}

/** BaseScreenView.as 109 and 153: the screen fades with a linear tween. */
const SCREEN_EASING = 'linear';

/**
 * Resolves once `el` is drawn fully opaque (at most `maxMs` more): ready_for_input
 * comes with the end of the fade-in tween (onAnimateComplete), so a slow frame
 * that holds the CSS fade back holds input back too.
 */
function opaqueSettled(el, maxMs = 1000) {
  const cs = globalThis.getComputedStyle;
  const raf = globalThis.requestAnimationFrame;
  if (typeof cs !== 'function' || typeof raf !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    // A hidden tab runs no frames: the cap still frees the input.
    const cap = setTimeout(() => finish(), maxMs);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(cap);
      resolve();
    };
    const check = () => {
      if (done) return;
      let op = 1;
      try {
        op = Number(cs(el).opacity);
      } catch {
        op = 1;
      }
      if (!(op < 0.99)) finish();
      else raf(check);
    };
    check();
  });
}

/**
 * Shows a BaseScreenView-style screen and waits for the player: fade in
 * (AWARD_FADE_IN), ready, then the OK button, Enter or Escape, then fade out
 * (AWARD_FADE_OUT, done 151-154). `autoCloseMs` (QA) closes it after that long.
 * Resolves with how it closed: 'button', 'enter', 'escape' or 'auto'.
 */
export async function holdScreenUntilDismissed(el, { button = null, autoCloseMs = null, onReady = null } = {}) {
  if (!el) return '';
  const input = screenInput(el, { button });
  el.style.pointerEvents = 'auto';
  let timer = 0;
  try {
    await crossfadeElement(el, { show: true, durationSec: AWARD_FADE_IN, easing: SCREEN_EASING });
    await opaqueSettled(el);
    input.ready();
    button?.focus?.({ preventScroll: true });
    onReady?.();
    if (Number.isFinite(autoCloseMs) && autoCloseMs >= 0) {
      timer = setTimeout(() => input.close('auto'), Math.max(0, autoCloseMs - AWARD_FADE_IN * 1000));
    }
    const how = await input.done;
    clearTimeout(timer);
    if (button && globalThis.document?.activeElement === button) button.blur?.();
    await crossfadeElement(el, { show: false, durationSec: AWARD_FADE_OUT, easing: SCREEN_EASING });
    return how;
  } finally {
    clearTimeout(timer);
    input.release();
  }
}

/**
 * New Day (NewDayView.as): the same screen rules, its button 'Onwards and
 * upwards!' (112-118). Enter mid-count closes it too: NewDayView keeps
 * onOkClick and onDoneTweenComplete stops the energy count (216-222).
 */
export async function showNewDayScreen(el, { button = el?.querySelector?.('[data-nd-ok]') || null, autoCloseMs = awardAutoCloseMs(undefined, { newDay: true }) } = {}) {
  if (!el) return '';
  prepareOkButton(button, AWARD_BUTTON_LABELS.newDay, 'newDay');
  return holdScreenUntilDismissed(el, { button, autoCloseMs });
}

/**
 * The player-paced quest completion (the quest book card with its page
 * buttons): it waits for the last page's button or the close control. While
 * it is up it has the keyboard like the other screens (screenInput); Tab and
 * Enter or Space on its own buttons still work.
 */
async function showAwardPages(el, { payload, pages, next, close, body, sub }) {
  const win = globalThis.window;
  const modern = isModernSkin();
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const pagedKey = (event) => {
    if (typingElsewhere(event, el)) return;
    event.stopImmediatePropagation();
    const onButton = event.target === next || event.target === close;
    if (onButton && (event.key === 'Enter' || event.key === ' ' || event.code === 'Space')) return;
    if (event.key === 'Tab') return;
    event.preventDefault();
  };
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', swallow);
  win?.addEventListener?.('keydown', pagedKey, true);
  win?.addEventListener?.('keypress', pagedKey, true);
  try {
    await crossfadeElement(el, { show: true, durationSec: AWARD_FADE_IN, easing: SCREEN_EASING });
    let pageIndex = 0;
    const renderPage = () => {
      const page = pages[pageIndex];
      const final = pageIndex === pages.length - 1;
      el.dataset.page = String(pageIndex + 1);
      if (body) {
        body.textContent = page.text;
        body.hidden = !page.text;
      }
      if (sub) {
        const tokens = awardRewardTokens(payload.subtitle);
        const chips = modern ? rewardChips(tokens) : [];
        fillRewardTokens(sub, final ? (chips.length ? chips : tokens) : [], { icons: modern });
        sub.hidden = !final || !payload.subtitle;
      }
      next.textContent = page.response;
      next.hidden = false;
      if (close) close.hidden = false;
      payload.onPage?.({ index: pageIndex + 1, total: pages.length, final });
    };
    renderPage();
    next.focus({ preventScroll: true });
    await new Promise((resolve) => {
      const finish = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        next.removeEventListener('click', advance);
        close?.removeEventListener('click', finish);
        resolve();
      };
      const advance = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pageIndex < pages.length - 1) {
          pageIndex += 1;
          renderPage();
          next.focus({ preventScroll: true });
        } else {
          finish();
        }
      };
      next.addEventListener('click', advance);
      close?.addEventListener('click', finish);
    });
    el.removeEventListener('click', swallow);
    await crossfadeElement(el, { show: false, durationSec: AWARD_FADE_OUT, easing: SCREEN_EASING });
  } finally {
    el.removeEventListener('click', swallow);
    win?.removeEventListener?.('keydown', pagedKey, true);
    win?.removeEventListener?.('keypress', pagedKey, true);
  }
}

/**
 * Full-screen award / quest complete celebration. It stays until the player
 * closes it (holdScreenUntilDismissed: its OK button, Enter or Escape once the
 * fade-in is done); paged quest completions wait for their page buttons.
 * @param {HTMLElement} el  #award-screen
 * @param {{
 *   kind?: 'achievement'|'quest'|'level'|'generic'|'feat'|'badge',
 *   screen?: 'achievement'|'level'|'collection',
 *   title: string,
 *   subtitle?: string,
 *   body?: string,
 *   iconUrl?: string|null,
 *   steps?: Array<{text?: string, response?: string}>,
 *   primaryLabel?: string,
 *   onPage?: (page: {index: number, total: number, final: boolean}) => void,
 *   onDismiss?: () => void,
 * }} payload
 */
export async function showAwardScreen(el, payload) {
  if (!el) return;
  const kind = payload.kind || 'generic';
  const kicker = el.querySelector('[data-award-kicker]');
  const title = el.querySelector('[data-award-title]');
  const body = el.querySelector('[data-award-body]');
  const badge = el.querySelector('[data-award-badge]');
  const glyph = el.querySelector('[data-award-glyph]');
  const img = el.querySelector('[data-award-img]');
  const sub = el.querySelector('[data-award-sub]');
  const next = el.querySelector('[data-award-next]');
  const close = el.querySelector('[data-award-close]');
  const pages = normalizeAwardPages(payload);
  const paged = pages.length > 0 && next;
  const screen = awardScreenKind(payload);
  // The modern skin's big moment card (js/ui/moment-card.js): art for every moment, reward chips.
  const modern = isModernSkin();
  const art = modern ? momentArt(payload) : payload.iconUrl;
  if (modern && art) el.dataset.art = momentArtShape(art);
  else delete el.dataset.art;

  const kickers = {
    achievement: 'New Achievement!',
    quest: 'Quest Complete!',
    level: 'Level Up!',
    generic: 'Well done!',
  };
  if (kicker) kicker.textContent = kickers[kind] || kickers.generic;
  const bodyText = awardText(payload.body);
  if (title) title.textContent = awardText(payload.title);
  if (body) {
    body.textContent = bodyText;
    body.hidden = !bodyText;
  }
  if (sub) {
    const chips = modern && !paged ? rewardChips(awardRewardTokens(awardText(payload.subtitle))) : [];
    if (chips.length) fillRewardTokens(sub, chips, { icons: true });
    else {
      sub.textContent = awardText(payload.subtitle);
      sub.classList.remove('has-reward-tokens');
    }
    sub.hidden = !payload.subtitle || Boolean(paged);
  }
  if (next) next.hidden = true;
  if (close) close.hidden = true;
  if (badge) {
    badge.dataset.kind = kind;
  }
  // Real badge PNG when available (Wayback / assets/badges)
  if (img && glyph) {
    if (art) {
      img.hidden = false;
      img.alt = payload.title || 'Badge';
      img.src = art;
      glyph.hidden = true;
      img.onerror = () => {
        img.hidden = true;
        glyph.hidden = false;
        glyph.textContent =
          kind === 'quest' ? '✓' : kind === 'level' ? '★' : kind === 'achievement' ? '◉' : '✦';
      };
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      glyph.hidden = false;
      glyph.textContent =
        kind === 'quest' ? '✓' : kind === 'level' ? '★' : kind === 'achievement' ? '◉' : '✦';
    }
  } else if (badge && !img) {
    badge.textContent =
      kind === 'quest' ? '✓' : kind === 'level' ? '★' : kind === 'achievement' ? '◉' : '✦';
  }

  el.dataset.kind = kind;
  // G219: a badge (an achievement with a class) brings the familiar along.
  const fam = el.querySelector('[data-award-familiar]');
  // CollectionCompleteView (a trophy) has no familiar.
  const withFamiliar = Boolean(fam) && kind === 'achievement' && Boolean(payload.classTsid) && !paged && screen !== 'collection';
  let stopFamiliar = () => {};
  if (fam) fam.hidden = !withFamiliar;
  el.dataset.familiar = withFamiliar ? 'true' : 'false';
  if (withFamiliar) {
    stopFamiliar = startFamiliarDrop(fam, {
      status: payload.status || '',
      body: bodyText,
      name: awardText(payload.title),
    });
  }
  if (paged) {
    el.dataset.paged = 'true';
    el.dataset.pages = String(pages.length);
  } else {
    delete el.dataset.paged;
    delete el.dataset.page;
    delete el.dataset.pages;
  }
  el.dataset.screen = paged ? 'pages' : screen;
  if (paged) {
    await showAwardPages(el, { payload, pages, next, close, body, sub });
  } else {
    el.dataset.okin = 'true';
    prepareOkButton(next, awardButtonLabel(payload), screen);
    await holdScreenUntilDismissed(el, { button: next, autoCloseMs: awardAutoCloseMs() });
    delete el.dataset.okin;
  }

  stopFamiliar();
  if (fam) fam.hidden = true;
  if (next) next.hidden = true;
  if (close) close.hidden = true;
  delete el.dataset.paged;
  delete el.dataset.page;
  delete el.dataset.pages;
  if (payload.onDismiss) payload.onDismiss();
}
