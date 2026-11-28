/**
 * G919 (Austin 2026-11-17, his iPhone): on a phone the pinned quests are one round button in the
 * top bar's right pill, beside Quests and Report a problem, the same size and look as them. Upright
 * the tracker card took a whole row under the street's name; sideways it sat over the stick.
 *
 * - Its face: the quest book, a thin ring for the first pinned quest's progress and, with two
 *   pinned, a count badge. Nothing pinned: no button.
 * - A tap opens the pins under it as a top bar popover (#quest-pins-pop): the tracker's own card
 *   (#quest-pins, js/ui/quest-tracker.js) moves in, so its rows, steps, bars, a row's tap (Quests)
 *   and its long-press menu (Unpin, Open in Quests: js/ui/quest-pin-menu.js) are the same ones. It
 *   closes on a tap elsewhere, Escape or the button again; the bar lifts over the sheets and the
 *   Social drawer while it is open (style.css, the G644 layer rules).
 * - A step that moves (a count going up, a step done, a try that failed) pops one short line out of
 *   the button ("Pet Piggies 3/6") for PIN_LINE_MS, then it shrinks back. One line at a time (a new
 *   change replaces it), and none while the popover is open.
 *
 * A phone is the phone gate's device in Modern (html.touch-phone, data-ui="modern"; the same test as
 * js/ui/topbar.js phoneBar). Computers, tablets and Classic keep the card where it was (Classic
 * shows no tracker at all). QA: canvas data questPinBtn ("" hidden, else "<pins>:<percent>"),
 * questPinPop ("1" open), questPinLine (the line shown, "" when none); groddleQA.questPins.button().
 */
import { questTextPlain } from '../quest-text.js?v=92213536';
import { focusBack } from './focus-return.js?v=da190597';

/** How long the step line stays out. */
export const PIN_LINE_MS = 3000;

/** The button's icon: the Quests sheet's book (the card's head shows the same one). */
export const PIN_BUTTON_ICON = 'assets/ui/familiar/quests_small.webp';

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/** PURE: the phone bar test (js/ui/topbar.js phoneBar). */
export function phonePins(doc) {
  const root = doc?.documentElement;
  // PHONE LAYOUT (G1194, direction C): the card itself sits over the stick (js/ui/phone-layout.js), no button.
  if (root?.classList?.contains?.('phone-layout')) return false;
  return Boolean(root?.classList?.contains?.('touch-phone') && root.dataset?.ui === 'modern');
}

/**
 * PURE: the button's face for the rows the tracker shows (quest-tracker render): hidden with none;
 * else the first quest's share for the ring (0 for a failed try), the badge ("2" with two pinned,
 * "" with one) and its spoken label.
 */
export function pinButtonFace(rows = []) {
  const shown = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!shown.length) return { hidden: true, share: 0, badge: '', label: '' };
  const first = shown[0];
  const share = first.failed ? 0 : clamp01((Number(first.percent) || 0) / 100);
  const what = first.failed ? `${first.title}: ${first.short || 'try again'}` : `${first.title} ${first.count || ''}`.trim();
  const more = shown.length > 1 ? `, and ${shown.length - 1} more` : '';
  return { hidden: false, share, badge: shown.length > 1 ? String(shown.length) : '', label: `Pinned quests: ${what}${more}` };
}

/** PURE: what a row's step line depends on (its count, each step's count and whether its try failed). */
export function pinStepKey(r) {
  if (!r) return '';
  const steps = Array.isArray(r.steps) ? r.steps.map((s) => `${s.count || ''}${s.done ? '+' : ''}`).join(',') : '';
  return `${r.failed ? 'F' : ''}|${r.count || ''}|${steps}`;
}

/** A step's words and count: "Pet Piggies 3/6"; a step of one done: "Plant a bean: done". */
function stepWords(desc, count, done) {
  const words = questTextPlain(desc).replace(/\s+/g, ' ').trim();
  if (count) return `${words} ${count}`;
  return done ? `${words}: done` : words;
}

/**
 * PURE: the line a row pops when its step moved since `prev` (the row as last drawn), or ''.
 * A try that failed: "<title>: time ran out". Several steps: the step that moved, with its count.
 * One step: that step and the quest's count.
 */
export function pinStepLine(prev, next) {
  if (!prev || !next || pinStepKey(prev) === pinStepKey(next)) return '';
  if (next.failed) return prev.failed ? '' : `${next.title}: ${next.short || 'try again'}`;
  if (Array.isArray(next.steps) && next.steps.length > 1) {
    const was = Array.isArray(prev.steps) ? prev.steps : [];
    const moved = next.steps.find((s, i) => was[i] && (s.count !== was[i].count || s.done !== was[i].done));
    if (moved) return stepWords(moved.desc, moved.count, moved.done);
    const open = next.steps.find((s) => !s.done) || next.steps[next.steps.length - 1];
    return stepWords(open.desc, open.count, open.done);
  }
  return stepWords(next.step, next.count, Number(next.percent) >= 100);
}

/** The gap (px) between the step line and what it sits under (style.css .qpb-line top: 100% + 6px). */
export const PIN_LINE_GAP = 6;

/**
 * PURE (G921): how far (px) the step line drops so it clears the street's name pill. Upright the
 * pill sits under the top bar, and the line, right-aligned under the button, covered its clock: it
 * then starts under the pill. `btn` and `plate` are client rects, `lineW` / `lineH` the line's laid
 * out size (offsetWidth / offsetHeight: its pop-in scale does not count). 0 when it misses the pill
 * (sideways the pill stands in the bar's row, above the line).
 */
export function pinLineDrop(btn, plate, lineW, lineH, gap = PIN_LINE_GAP) {
  if (!btn || !plate || !(plate.right > plate.left) || !(plate.bottom > plate.top)) return 0;
  const line = { left: btn.right - (Number(lineW) || 0), right: btn.right, top: btn.bottom + gap };
  line.bottom = line.top + (Number(lineH) || 0);
  const hits = line.left < plate.right && line.right > plate.left && line.top < plate.bottom && line.bottom > plate.top;
  return hits ? Math.ceil(plate.bottom + gap - line.top) : 0;
}

/**
 * The phone's quest button. `card` is the tracker's #quest-pins; `menu` its row menu (an open menu
 * keeps the popover open). Returns { sync(rows), active(), isOpen(), open(), close(), state() };
 * with no top bar (tests, a page without one) every call does nothing.
 * @param {{ card: HTMLElement|null, menu?: { isOpen(): boolean, element?(): HTMLElement|null }|null,
 *   setData?: (k: string, v: string) => void, reducedMotion?: () => boolean,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} opts
 */
export function createQuestPinButton({ card, menu = null, setData = () => {}, setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = (id) => globalThis.clearTimeout(id) } = {}) {
  const doc = card?.ownerDocument;
  const bar = typeof doc?.querySelector === 'function' ? doc.querySelector('header.top-bar') : null;
  const actions = bar?.querySelector?.('.hud-actions');
  const questBtn = doc?.getElementById?.('quest-btn');
  const inert = { sync() {}, active: () => false, isOpen: () => false, open() {}, close() {}, state: () => null, element: () => null };
  if (!card || !bar || !actions || !questBtn) return inert;

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.id = 'quest-pins-btn';
  btn.className = 'chrome-btn hud-ibtn quest-pins-btn';
  btn.hidden = true;
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'quest-pins-pop');
  btn.setAttribute('aria-label', 'Pinned quests');
  const make = (tag, attrs = {}, ns = '') => {
    const n = ns && typeof doc.createElementNS === 'function' ? doc.createElementNS(ns, tag) : doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const icon = make('img', { src: PIN_BUTTON_ICON, alt: '', width: '22', height: '15' });
  // The ring: the Menu button's study ring (js/ui/topbar.js installPhoneRows), here the first quest's share.
  const ring = make('svg', { class: 'qpb-ring', viewBox: '0 0 36 36', 'aria-hidden': 'true' }, SVG);
  const fill = make('circle', { class: 'qpb-fill', cx: '18', cy: '18', r: '16.5', pathLength: '100', 'stroke-dasharray': '0 100' }, SVG);
  ring.append(make('circle', { class: 'qpb-track', cx: '18', cy: '18', r: '16.5' }, SVG), fill);
  const badge = make('span', { class: 'hud-badge qpb-badge', 'aria-hidden': 'true' });
  badge.hidden = true;
  const line = make('span', { class: 'qpb-line', 'aria-hidden': 'true' });
  btn.append(icon, ring, badge, line);
  questBtn.parentElement.insertBefore(btn, questBtn.nextSibling);

  const pop = doc.createElement('div');
  pop.id = 'quest-pins-pop';
  pop.className = 'hud-pop quest-pins-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Pinned quests');
  pop.hidden = true;
  bar.append(pop);
  // The step line, for a screen reader (the drawn line is aria-hidden inside the button).
  const say = doc.createElement('span');
  say.className = 'visually-hidden qpb-say';
  say.setAttribute('role', 'status');
  bar.append(say);

  /** Where the card lives off a phone, to put it back. */
  const home = { parent: card.parentElement, next: card.nextSibling };
  let rows = [];
  let last = new Map();
  let lineTimer = null;
  let lineText = '';
  const active = () => phonePins(doc);
  const isOpen = () => !pop.hidden;

  const hideLine = () => {
    if (lineTimer != null) clearTimer(lineTimer);
    lineTimer = null;
    lineText = '';
    delete btn.dataset.line;
    setData('questPinLine', '');
  };
  const showLine = (text) => {
    if (lineTimer != null) clearTimer(lineTimer);
    lineText = text;
    line.textContent = text;
    say.textContent = text;
    // G921: under the street's name pill, not over its clock.
    const plate = doc.getElementById?.('street-nameplate');
    const drop = plate && !plate.hidden && typeof plate.getBoundingClientRect === 'function' ? pinLineDrop(btn.getBoundingClientRect(), plate.getBoundingClientRect(), line.offsetWidth, line.offsetHeight) : 0;
    if (drop) btn.style?.setProperty?.('--qpb-line-drop', `${drop}px`);
    else btn.style?.removeProperty?.('--qpb-line-drop');
    btn.dataset.line = 'on';
    setData('questPinLine', text);
    lineTimer = setTimer(hideLine, PIN_LINE_MS);
  };

  const place = () => {
    const box = pop.offsetParent?.getBoundingClientRect?.() || bar.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 0;
    const right = Math.min(box.right, doc.documentElement.clientWidth || box.right);
    const lo = box.left + 4;
    const hi = Math.max(lo, right - w - 4);
    const left = Math.max(lo, Math.min(hi, r.left + r.width / 2 - w / 2));
    pop.style.left = `${Math.round(left - box.left)}px`;
  };
  const close = (back = false) => {
    if (!isOpen()) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    setData('questPinPop', '');
    if (menu?.isOpen?.()) menu.close?.({ focus: false });
    if (back) focusBack(btn, { doc });
  };
  const open = () => {
    if (isOpen() || btn.hidden) return;
    hideLine();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setData('questPinPop', '1');
    place();
  };

  /** The card goes into the popover on a phone and back to its place elsewhere. */
  const seat = () => {
    if (active()) {
      if (card.parentElement !== pop) pop.append(card);
      return;
    }
    close();
    if (card.parentElement === pop && home.parent) home.parent.insertBefore(card, home.next && home.next.parentElement === home.parent ? home.next : null);
  };

  const paint = () => {
    const on = active();
    const face = pinButtonFace(rows);
    const hidden = !on || face.hidden;
    if (btn.hidden !== hidden) btn.hidden = hidden;
    if (hidden) {
      close();
      hideLine();
      setData('questPinBtn', '');
      return;
    }
    fill.setAttribute('stroke-dasharray', `${Math.round(face.share * 100)} 100`);
    badge.textContent = face.badge;
    if (badge.hidden === Boolean(face.badge)) badge.hidden = !face.badge;
    if (btn.getAttribute('aria-label') !== face.label) btn.setAttribute('aria-label', face.label);
    setData('questPinBtn', `${rows.length}:${Math.round(face.share * 100)}`);
    if (isOpen()) place();
  };

  /** The tracker's rows as drawn (render): moves the card, draws the face, pops a moved step. */
  function sync(next = []) {
    rows = (Array.isArray(next) ? next : []).filter(Boolean).slice(0, 2);
    seat();
    paint();
    let said = '';
    const seen = new Map();
    for (const r of rows) {
      seen.set(r.classTsid, r);
      if (!said) said = pinStepLine(last.get(r.classTsid), r);
    }
    last = seen;
    if (said && active() && !btn.hidden && !isOpen()) showLine(said);
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  doc.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    const t = e.target;
    if (pop.contains(t) || btn.contains(t)) return;
    // The row menu (long press) is the popover's own: a tap in it picks, not closes.
    const m = menu?.element?.();
    if (m && m.contains?.(t)) return;
    close();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen() || menu?.isOpen?.()) return;
    e.stopPropagation();
    close(true);
  });
  doc.defaultView?.addEventListener?.('resize', () => { if (isOpen()) place(); });
  // A skin switch or the phone class going: the card goes home and the button hides.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => { seat(); paint(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-ui'] });
  }

  return {
    sync,
    active,
    isOpen,
    open,
    close,
    element: () => btn,
    state: () => ({ hidden: btn.hidden, count: rows.length, share: pinButtonFace(rows).share, badge: badge.hidden ? '' : badge.textContent, open: isOpen(), line: lineText, inPopover: card.parentElement === pop }),
  };
}
