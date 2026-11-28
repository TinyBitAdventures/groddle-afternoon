/**
 * The notifier's screen side (js/notify.js has the rules): the notice stack top
 * centre, the Activity log panel and its button, and the reserved zones the
 * stack keeps off. Browser only. Self-contained so a later Social drawer can
 * mount the log panel where it wants (mountActivityLog).
 *
 * Zones (UI audit section 4, "reserved zones"): the stack sits under the street
 * name; a banner (the Qurazy line), the verb menu's card or a conversation card
 * in the way moves it down, and when nothing fits it waits (hidden, its clock
 * stopped). Speech bubbles and the Enter hint keep off the stack and the banner
 * (game.js asks zoneBoxes()). Award screens own the screen: notices wait under
 * them.
 *
 * The modern skin's Social drawer (js/ui/social-drawer.js) is the Activity log
 * there (activityLog: false: no panel, no button) and covers the right edge:
 * sideInset() says how much, and the stack centres in the width that is left.
 */
import { placeBelow, placeBeside, plainText } from './notify.js?v=c9d79ec5';
import { REPORT_WINDOW_SELECTOR } from './window-stack.js?v=0c4a6356';

const STACK_ID = 'notify-notices';
const LOG_ID = 'activity-log';
const BUTTON_ID = 'activity-log-btn';
const MEASURE_MS = 50;

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Signed amounts in plain text as gain/loss spans (the original's coloured Local Chat amounts).
 * A unit that starts with a capital is an item or a Giant: the whole name takes the colour, every
 * word of it ("+3 Butterfly Butter", "-1 Pinch of Salt", "+5 Humbaba favor"; #547: only the first
 * word did). A lower-case unit is a stat, one word ("+2 mood", "-4 energy").
 */
export function colorizeAmounts(text) {
  return escapeHtml(text).replace(
    /(^|[\s(])([+\-−]\d[\d,]*(?:\.\d+)?)(\s+)([A-Z][\w'’-]*(?:\s(?:of\s)?(?:[A-Z0-9][\w'’-]*|favor))*|[a-z][\w'’-]*(?:\s(?:favor|Tree|Pie|Pies))?)/g,
    (all, pre, num, sp, unit) => `${pre}<span class="${num[0] === '+' ? 'act-gain' : 'act-loss'}">${num}${sp}${unit}</span>`
  );
}

function entryHtml(entry) {
  if (entry.html) return entry.html;
  return colorizeAmounts(entry.text);
}

function clockText(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m}`;
}

function reducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Screens and the start card own the screen: notices wait under them (not zones). */
const SCREEN_DIALOG_IDS = ['award-screen', 'new-day-screen', 'giant-screen-panel', 'overlay'];

/** The narrowest stack worth showing (px): under it the notices wait instead of standing in a sliver. */
export const NOTICE_MIN_W = 240;

/**
 * PURE: whether the width a side sheet and the drawer (or its rail) leave is too narrow for the
 * notices (Austin's iPhone, 2026-11-12: beside the Skills sheet a notice stood one letter wide down
 * the right edge). Then they wait, their clocks stopped, until the sheet closes; a wide window
 * never meets it.
 */
export function noRoomBeside(rootW, room, minW = NOTICE_MIN_W) {
  return Number(room) > 0 && Number(rootW) - 24 - Number(room) < minW;
}

/**
 * PURE: whether a [role=dialog] is a zone the notices keep off and the interaction menus step
 * aside from (a feature's conversation card). Not the Activity log, the menus themselves, the
 * glitch modals, the pack's dialogs or the screens; and not the report window (Austin
 * 2026-11-12): it opens over everything to show what the player saw, so nothing under it moves,
 * and its picture (bug-report-feature.js) shows them where they were.
 */
export function isZoneDialog(d) {
  if (!d) return false;
  if (d.id === LOG_ID || d.classList?.contains('verb-menu') || d.classList?.contains('glitch-modal') || d.closest?.('#pack-bar')) return false;
  if (SCREEN_DIALOG_IDS.includes(d.id)) return false;
  if (d.closest?.(REPORT_WINDOW_SELECTOR)) return false;
  return true;
}

/** A visible element's rect relative to `root`'s, or null. */
function relRect(el, rootRect) {
  if (!el || el.hidden) return null;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { left: r.left - rootRect.left, top: r.top - rootRect.top, right: r.right - rootRect.left, bottom: r.bottom - rootRect.top };
}

const area = (r) => (r ? Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top) : 0);

/**
 * The card inside a dialog that covers the screen (a scrim with a card in it):
 * its biggest child that is not itself screen-sized.
 */
function dialogCard(el, rootRect, rootArea) {
  const r = relRect(el, rootRect);
  if (!r) return null;
  if (area(r) < rootArea * 0.5) return r;
  let best = null;
  for (const child of el.children) {
    const c = relRect(child, rootRect);
    if (c && area(c) < rootArea * 0.5 && area(c) > area(best)) best = c;
  }
  return best;
}

/**
 * Mounts the Activity log panel and its button. `container` holds the panel;
 * the button goes in `buttonHost` (the Local chat form by default).
 */
export function mountActivityLog(notifier, { container, buttonHost = null, onOpenChange = () => {} } = {}) {
  if (typeof document === 'undefined' || !container) return null;
  const panel = document.createElement('section');
  panel.id = LOG_ID;
  panel.className = 'activity-log';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Activity log');
  panel.innerHTML =
    '<header class="activity-log-head"><h2>Activity</h2>' +
    '<button type="button" class="activity-log-close" aria-label="Close the activity log" title="Close (Esc)">×</button></header>' +
    '<div class="activity-log-list" role="log" aria-live="off" tabindex="0"></div>';
  container.appendChild(panel);
  const list = panel.querySelector('.activity-log-list');

  const button = document.createElement('button');
  button.type = 'button';
  button.id = BUTTON_ID;
  button.className = 'activity-log-btn';
  button.title = 'Activity log';
  button.setAttribute('aria-controls', LOG_ID);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = 'Activity<span class="activity-log-unread" hidden></span>';
  (buttonHost || container).appendChild(button);
  const badge = button.querySelector('.activity-log-unread');

  let drawn = 0;
  let drawnLast = null;

  function renderList() {
    const entries = notifier.entries;
    const last = entries[entries.length - 1];
    const lastSig = last ? `${last.id}:${last.count}:${last.text}` : '';
    if (drawn === entries.length && drawnLast === lastSig && list.childElementCount) return;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    list.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'activity-log-empty';
      empty.textContent = 'Pet, gather, make, or explore to begin your afternoon.';
      list.appendChild(empty);
    }
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = `activity-log-line is-${e.kind}`;
      row.dataset.kind = e.kind;
      const when = document.createElement('time');
      when.textContent = clockText(e.at);
      const text = document.createElement('span');
      text.className = 'activity-log-text';
      text.innerHTML = entryHtml(e);
      row.append(when, text);
      if (e.count > 1) {
        const n = document.createElement('span');
        n.className = 'notify-count';
        n.textContent = `×${e.count}`;
        row.appendChild(n);
      }
      list.appendChild(row);
    }
    drawn = entries.length;
    drawnLast = lastSig;
    if (atEnd || panel.dataset.justOpened) list.scrollTop = list.scrollHeight;
    delete panel.dataset.justOpened;
  }

  function renderBadge() {
    const n = notifier.unread;
    badge.hidden = !n || !panel.hidden;
    badge.textContent = n > 99 ? '99+' : String(n);
    button.setAttribute('aria-label', n && panel.hidden ? `Activity log, ${n} new` : 'Activity log');
  }

  function setOpen(open) {
    if (panel.hidden === !open) return;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.classList.toggle('is-open', open);
    if (open) {
      panel.dataset.justOpened = '1';
      drawn = -1;
      renderList();
      notifier.markRead();
    }
    renderBadge();
    onOpenChange(open);
  }

  button.addEventListener('click', () => setOpen(panel.hidden));
  // Enter and Space on the focused button open it, never the nearest thing's menu or a jump.
  button.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation();
  });
  panel.querySelector('.activity-log-close').addEventListener('click', () => {
    setOpen(false);
    button.focus();
  });
  // Esc closes the log before anything under it (capture, only while it is open).
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || panel.hidden) return;
    ev.stopPropagation();
    ev.preventDefault();
    setOpen(false);
  }, true);
  // Typing in the log never moves the avatar.
  panel.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') ev.stopPropagation();
  });

  return {
    panel,
    button,
    isOpen: () => !panel.hidden,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(panel.hidden),
    update() {
      if (!panel.hidden) {
        renderList();
        notifier.markRead();
      }
      renderBadge();
    },
  };
}

/**
 * The notice stack and its zones. `root` is #game-root. game.js calls frame()
 * once a frame with why notices must wait ('' when they may show).
 */
/**
 * LANDSCAPE (lane landscape's audit, 2026-11-13, finding 10: a phone held sideways is about 340 to
 * 430 px tall, so the notices under the street name stood over the avatar's head). Under
 * SHORT_SCREEN_H the stack steps beside the avatar when it would cover it: a column on the roomier
 * side, as wide as that side leaves (NOTICE_W at most), never narrower than BESIDE_MIN_W (then it
 * stays where it was). Taller windows (every computer) never move.
 */
export const SHORT_SCREEN_H = 520;
/** The stack's width (style.css .notify-notices: min(440px, ...)). */
export const NOTICE_W = 440;
export const BESIDE_MIN_W = 180;

/**
 * PURE: where the notice stack goes beside the avatar, or null to stay centred. `rect` is where the
 * centred stack sits, `avatar` the avatar's box, both in #game-root px; rootW, rootH the root's size;
 * insetL / insetR the side sheet and the drawer; safeL / safeR the screen's safe area (a notch);
 * keepOut the phone's stick and Jump (the column stops short of whichever stands on its side: a
 * notice over Jump would take the thumb's tap).
 * G878 (#425): `hold` is where the stack stood beside the avatar last frame ({ left, width, side }).
 * While notices are up it keeps that side as long as the side has room, wherever the avatar walks
 * (picking the roomier side every frame flipped it across the avatar at the middle of the screen),
 * and keeps its place there until the avatar walks into it, when it is pushed along (hugging the
 * avatar every frame slid it with each step). Returns { left, width, side }.
 */
export function noticesBesideAvatar({ rect, avatar, rootW, rootH, insetL = 0, insetR = 0, safeL = 0, safeR = 0, keepOut = [], margin = 10, edge = 8, hold = null } = {}) {
  if (!rect || !avatar || !(rootH > 0) || rootH >= SHORT_SCREEN_H) return null;
  const overlaps = rect.left < avatar.right + margin && rect.right > avatar.left - margin
    && rect.top < avatar.bottom + margin && rect.bottom > avatar.top - margin;
  const held = hold && (hold.side === 'left' || hold.side === 'right') ? hold : null;
  if (!overlaps && !held) return null;
  let minL = edge + Math.max(0, insetL, safeL);
  let maxR = rootW - edge - Math.max(0, insetR, safeR);
  for (const k of keepOut || []) {
    if (!k) continue;
    if (k.left >= avatar.right) maxR = Math.min(maxR, k.left - margin);
    else if (k.right <= avatar.left) minL = Math.max(minL, k.right + margin);
  }
  const leftRoom = avatar.left - margin - minL;
  const rightRoom = maxR - (avatar.right + margin);
  let side = null;
  if (held && (held.side === 'left' ? leftRoom : rightRoom) >= BESIDE_MIN_W) side = held.side;
  else {
    // A new column (or its side ran out of room): the roomier side, only while it covers the avatar.
    if (!overlaps || Math.max(leftRoom, rightRoom) < BESIDE_MIN_W) return null;
    side = leftRoom >= rightRoom ? 'left' : 'right';
  }
  const room = side === 'left' ? leftRoom : rightRoom;
  const width = Math.floor(Math.min(NOTICE_W, room));
  // Hug the avatar's side, so the column stays as near the middle as it can.
  const hug = side === 'left' ? avatar.left - margin - width : avatar.right + margin;
  let left = hug;
  if (held && held.side === side && Number.isFinite(held.left)) {
    // Where it stood, while that still clears the avatar and the screen's edge.
    const lo = side === 'left' ? minL : avatar.right + margin;
    const hi = side === 'left' ? avatar.left - margin - width : maxR - width;
    left = Math.min(Math.max(held.left, lo), hi);
  }
  return { left: Math.round(left), width, side };
}

/** PURE: whether box `r` comes within `margin` of any of `controls` (all { left, top, right, bottom }). */
function nearControl(r, controls, margin) {
  return (controls || []).some((c) => c && r.left < c.right + margin && r.right > c.left - margin
    && r.top < c.bottom + margin && r.bottom > c.top - margin);
}

/**
 * PURE (G921): whether the stack at `rect` stays clear of the phone's touch controls (`controls`: the
 * stick, Act and Jump, #game-root px), `margin` apart. A notice over one takes the thumb's tap
 * (lane fix29's sideways shots: "Your pack has 16 slots now" over Act).
 */
export function clearOfControls(rect, controls = [], margin = 8) {
  return !rect || !nearControl(rect, controls, margin);
}

/**
 * PURE (G921): the column the centred stack narrows to when it would reach down over a touch
 * control: the band between the controls on the left of the screen and those on the right, at the
 * stack's own centre as near as it fits, never wider than it was. Narrower cards wrap to more
 * lines, so the height is estimated from the width (`h` the stack's height at `rect`'s width) and
 * the band measured again. Null: it is clear already; { wait: true }: no band of BESIDE_MIN_W fits
 * clear of them (the notices wait, as with no room); else { left, width, height }.
 */
export function noticesBetweenControls({ rect, h = rect ? rect.bottom - rect.top : 0, controls = [], rootW, insetL = 0, insetR = 0, safeL = 0, safeR = 0, margin = 8, edge = 8 } = {}) {
  if (!rect || !controls?.length || clearOfControls(rect, controls, margin)) return null;
  const w = rect.right - rect.left;
  const mid = rootW / 2;
  let minL = edge + Math.max(0, insetL, safeL);
  let maxR = rootW - edge - Math.max(0, insetR, safeR);
  let width = w;
  let height = h;
  for (let pass = 0; pass < 3; pass += 1) {
    const span = { left: minL, right: maxR, top: rect.top, bottom: rect.top + height };
    for (const c of controls) {
      if (!c || !(span.top < c.bottom + margin && span.bottom > c.top - margin)) continue;
      if ((c.left + c.right) / 2 < mid) minL = Math.max(minL, c.right + margin);
      else maxR = Math.min(maxR, c.left - margin);
    }
    width = Math.floor(Math.min(NOTICE_W, w, maxR - minL));
    if (width < BESIDE_MIN_W) return { wait: true };
    height = Math.ceil((h * w) / width);
  }
  const left = Math.round(Math.min(Math.max(rect.left + (w - width) / 2, minL), maxR - width));
  if (nearControl({ left, right: left + width, top: rect.top, bottom: rect.top + height }, controls, margin)) return { wait: true };
  return { left, width, height };
}

/** The screen's safe area at the sides, CSS px (0 where there is none or no stylesheet). */
function safeSides(el) {
  try {
    const cs = getComputedStyle(el);
    return { safeL: parseFloat(cs.getPropertyValue('--safe-l')) || 0, safeR: parseFloat(cs.getPropertyValue('--safe-r')) || 0 };
  } catch {
    return { safeL: 0, safeR: 0 };
  }
}

export function mountNotifyView(notifier, { root, setData = () => {}, logButtonHost = null, activityLog = true, sideInset = () => null, sideInsetLeft = () => 0, avatarBox = () => null, region = () => null } = {}) {
  if (typeof document === 'undefined' || !root) return null;
  const stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.className = 'notify-notices';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-label', 'Notices');
  root.appendChild(stack);
  const logView = activityLog ? mountActivityLog(notifier, { container: root, buttonHost: logButtonHost }) : null;

  /** id → card element */
  const cards = new Map();
  /** name → rect (#game-root px) reserved by its owner (reserve()). */
  const reserved = new Map();
  let measuredAt = -Infinity;
  let zones = { top: 12, banner: [], blockers: [], maxBottom: Infinity, rootW: 0, rootH: 0, insetL: 0, insetR: 0, avatar: null, controls: [] };
  /** LANDSCAPE: the column beside the avatar the stack stands in ({ left, width }), or null (centred). */
  let beside = null;
  /** G878: the column the stack stood in last frame, held while notices are up (noticesBesideAvatar hold). */
  let besideHold = null;
  let shiftKey = '';
  let place = { dy: 0, wait: false };
  let holdWhy = '';
  let shownBox = null;
  let underSpeech = false;
  /** Interaction menu card → its sideways step (px), when a conversation card was in its way. */
  const menuShifts = new Map();

  function renderCards() {
    const live = new Set();
    for (const n of notifier.notices) {
      live.add(n.id);
      let card = cards.get(n.id);
      if (!card) {
        card = document.createElement('div');
        card.className = 'notify-card';
        card.setAttribute('role', 'status');
        card.title = 'Click to dismiss';
        card.addEventListener('click', () => notifier.dismiss(n.id));
        card.innerHTML = '<span class="notify-text"></span><span class="notify-count" hidden></span>';
        cards.set(n.id, card);
        stack.appendChild(card);
      }
      const html = n.html || colorizeAmounts(n.text);
      const textEl = card.firstChild;
      if (card.dataset.html !== html) {
        textEl.innerHTML = html;
        card.dataset.html = html;
      }
      const countEl = card.lastChild;
      countEl.hidden = n.count < 2;
      countEl.textContent = `×${n.count}`;
    }
    for (const [id, card] of cards) {
      if (live.has(id)) continue;
      cards.delete(id);
      card.remove();
    }
    // Newest at the top, under the street name.
    const order = [...notifier.notices].reverse().map((n) => cards.get(n.id));
    order.forEach((card, i) => {
      if (stack.children[i] !== card) stack.insertBefore(card, stack.children[i] || null);
    });
    const last = notifier.notices[notifier.notices.length - 1];
    setData('notifyNotices', String(notifier.notices.length));
    setData('notifyLast', last ? plainText(last.text) : '');
    setData('notifyLastCount', last ? String(last.count) : '');
  }

  function measure(t) {
    if (t - measuredAt < MEASURE_MS) return;
    measuredAt = t;
    const rr = root.getBoundingClientRect();
    const rootArea = rr.width * rr.height;
    const plate = relRect(document.getElementById('street-nameplate'), rr);
    // Banners: zones their owners reserved (the Qurazy line's art box), else an overlay's canvas.
    const banner = [...reserved.values()];
    for (const c of root.querySelectorAll('canvas.overlay-art:not(.qurazy-overlay)')) {
      if (Number(c.style.opacity || 1) <= 0.05) continue;
      const r = relRect(c, rr);
      if (r) banner.push(r);
    }
    const blockers = [...banner];
    // The buff strip (top left) on a narrow screen.
    const buffs = relRect(document.getElementById('buff-strip'), rr);
    if (buffs) blockers.push(buffs);
    // The mobile QA (2026-11-12): with no street name above them (the tutorial hides it) the notices
    // sat at the top over the top bar's pills and the tutorial pill. On a wide window they fit between
    // the pills and never meet them; on a narrow one they go under whatever they would cover.
    // G921: and the phone's quest step line while it is out (under the street's name upright).
    for (const sel of ['#hud-stats', 'header.top-bar .top-actions', '#newxp-pill', '#quest-pins-btn[data-line="on"] .qpb-line']) {
      const r = relRect(document.querySelector(sel), rr);
      if (r) blockers.push(r);
    }
    // G902 (#433): under 760 px the route card (To: / Next: / You Have Arrived!) stands under the
    // street's name, where the stack starts: on arrival the notices lay over it and each other's
    // lines. They go under it (on a wide window it is top right and never meets them).
    const gps = relRect(root.querySelector('.route-gps'), rr);
    if (gps) blockers.push(gps);
    const dialogs = [];
    for (const d of root.querySelectorAll('[role="dialog"]')) {
      // Interaction menus (the verb menu, the Enter chooser, the item pickers: .verb-menu) step aside
      // instead; the report window moves nothing (isZoneDialog).
      if (!isZoneDialog(d)) continue;
      const card = dialogCard(d, rr, rootArea);
      if (card) dialogs.push(card);
    }
    blockers.push(...dialogs);
    blockers.push(...keepMenusClear(root, dialogs, rr));
    // The chat dock and the pack are the floor (the Social drawer is a side, not a floor: sideInset).
    const dockEl = document.getElementById('local-chat-dock');
    const dock = dockEl?.classList.contains('social-drawer') ? null : relRect(dockEl, rr);
    let side = null;
    try {
      side = sideInset();
    } catch {
      side = null;
    }
    const pack = relRect(document.getElementById('pack-bar'), rr);
    const floor = Math.min(dock ? dock.top : Infinity, pack ? pack.top : Infinity, rr.height);
    zones = {
      top: plate ? plate.bottom + 6 : 10,
      banner,
      blockers,
      maxBottom: Math.min(floor - 8, rr.height * 0.62),
      floorBottom: floor - 8,
      rootW: rr.width,
      rootH: rr.height,
      avatar: rr.height < SHORT_SCREEN_H ? (() => { try { return avatarBox(); } catch { return null; } })() : null,
      keepOut: rr.height < SHORT_SCREEN_H ? ['.touch-stick', '.touch-jump'].map((sel) => relRect(root.querySelector(sel), rr)).filter(Boolean) : [],
      // G921: every touch control the stack keeps off on a short screen, Act too (clearOfControls).
      controls: rr.height < SHORT_SCREEN_H ? ['.touch-stick', '.touch-act', '.touch-jump'].map((sel) => relRect(root.querySelector(sel), rr)).filter(Boolean) : [],
      // The screen's safe area (style.css LANDSCAPE-HUD --safe-l / --safe-r, env() resolved).
      ...(rr.height < SHORT_SCREEN_H ? safeSides(root) : { safeL: 0, safeR: 0 }),
      // A side sheet on the left (VERBS' panel shell) as well as a drawer's own left.
      insetL: Math.max(0, Number(side?.left) || 0, Number((() => { try { return sideInsetLeft(); } catch { return 0; } })()) || 0),
      insetR: Math.max(0, Number(side?.right) || 0),
    };
    // PHONE LAYOUT (G1194, R1; js/ui/phone-layout.js): the phone's notice region, under the caption and over
    // the controls or the open sheet. The stack keeps inside it and waits when it has no room there.
    let r = null;
    try {
      r = region();
    } catch {
      r = null;
    }
    if (r) {
      const bottom = Math.round(r.bottom - rr.top);
      Object.assign(zones, {
        top: Math.round(r.top - rr.top),
        maxBottom: bottom,
        floorBottom: bottom,
        insetL: Math.max(0, Math.round(r.left - rr.left - 8)),
        insetR: Math.max(0, Math.round(rr.right - r.right - 8)),
        region: true,
      });
    }
  }

  /**
   * An interaction menu's card (the verb menu, the Enter chooser, an item picker: .verb-menu)
   * and a conversation card (a feature's talk, raised while the menu was open) never sit on
   * each other: the menu's card steps aside. Returns the menus' cards as they now sit.
   */
  function keepMenusClear(scope, dialogs, rr) {
    const out = [];
    const seen = new Set();
    for (const menu of scope.querySelectorAll('.verb-menu:not([hidden])')) {
      const card = menu.querySelector('.verb-menu-card');
      const shown = card && relRect(card, rr);
      if (!shown) continue;
      seen.add(card);
      const was = menuShifts.get(card) || 0;
      const base = { ...shown, left: shown.left - was, right: shown.right - was };
      const fit = placeBeside(base, dialogs, { margin: 10, minLeft: 8, maxRight: rr.width - 8 });
      const dx = fit.ok ? Math.round(fit.dx) : 0;
      if (dx !== was) card.style.transform = dx ? `translateX(${dx}px)` : '';
      if (dx) menuShifts.set(card, dx);
      else menuShifts.delete(card);
      out.push({ ...base, left: base.left + dx, right: base.right + dx });
    }
    // A menu that closed drops its step.
    for (const card of [...menuShifts.keys()]) {
      if (seen.has(card)) continue;
      card.style.transform = '';
      menuShifts.delete(card);
    }
    setData('notifyVerbShift', [...menuShifts.values()].join(','));
    return out;
  }

  function layout() {
    // Centre in the width a side drawer leaves (style.css reads the two numbers).
    const shift = Math.round((zones.insetL - zones.insetR) / 2);
    const room = Math.round(zones.insetL + zones.insetR);
    const key = `${shift}:${room}`;
    if (key !== shiftKey) {
      shiftKey = key;
      stack.style.setProperty('--notify-shift', `${shift}px`);
      stack.style.setProperty('--notify-room', `${room}px`);
      setData('notifyInset', room ? key : '');
    }
    const h = stack.offsetHeight;
    const w = stack.offsetWidth;
    if (!h) {
      place = { dy: 0, wait: false };
      shownBox = null;
      // G878: the notices are gone, so the next ones pick their side afresh.
      besideHold = null;
      return;
    }
    // A phone's side sheet leaves a sliver: the notices wait instead of standing one letter wide in it.
    if (noRoomBeside(zones.rootW, room)) {
      place = { dy: 0, wait: true };
      shownBox = null;
      return;
    }
    // Centred, at the width the stylesheet gives it (the stack may be standing narrower beside the avatar).
    const cw = beside ? Math.max(0, Math.min(NOTICE_W, zones.rootW - 24 - room)) : w;
    const cl = (zones.rootW - cw) / 2 + shift;
    // Its height at the other width, roughly (the cards' lines rewrap), so the choice does not flip.
    const ch = beside && cw > 0 ? Math.ceil((h * beside.width) / cw) : h;
    const centred = { left: cl, right: cl + cw, top: zones.top, bottom: zones.top + ch };
    let rect = centred;
    place = placeBelow(rect, zones.blockers, { margin: 6, maxBottom: zones.maxBottom });
    // LANDSCAPE: on a short screen, over the avatar (or with no room left centred, where it would
    // cover it), it steps beside it (noticesBesideAvatar).
    const probe = place.wait ? centred : { ...centred, top: centred.top + place.dy, bottom: centred.bottom + place.dy };
    const side = zones.avatar
      ? noticesBesideAvatar({ rect: probe, avatar: zones.avatar, rootW: zones.rootW, rootH: zones.rootH, insetL: zones.insetL, insetR: zones.insetR, safeL: zones.safeL, safeR: zones.safeR, keepOut: zones.keepOut, hold: besideHold })
      : null;
    if (side) {
      const sh = beside && beside.width === side.width ? h : Math.ceil((h * (beside ? beside.width : w)) / side.width);
      const sideRect = { left: side.left, right: side.left + side.width, top: zones.top, bottom: zones.top + sh };
      // Beside the avatar it covers nothing it keeps clear of, so it may run down to the pack row,
      // but not over Act, the stick or Jump (G921).
      const sidePlace = placeBelow(sideRect, zones.blockers, { margin: 6, maxBottom: zones.floorBottom });
      if (!sidePlace.wait && clearOfControls({ ...sideRect, top: sideRect.top + sidePlace.dy, bottom: sideRect.bottom + sidePlace.dy }, zones.controls)) {
        rect = sideRect;
        place = sidePlace;
      }
    }
    // G921: centred, it narrows to the band between the touch controls rather than reach over one.
    let band = null;
    if (rect === centred && !place.wait && zones.controls?.length) {
      const shown = { ...centred, top: centred.top + place.dy, bottom: centred.bottom + place.dy };
      const fit = noticesBetweenControls({ rect: shown, h: ch, controls: zones.controls, rootW: zones.rootW, insetL: zones.insetL, insetR: zones.insetR, safeL: zones.safeL, safeR: zones.safeR });
      if (fit?.wait) place = { dy: 0, wait: true };
      else if (fit) {
        const bandRect = { left: fit.left, right: fit.left + fit.width, top: zones.top, bottom: zones.top + fit.height };
        const bandPlace = placeBelow(bandRect, zones.blockers, { margin: 6, maxBottom: zones.maxBottom });
        const clear = clearOfControls({ ...bandRect, top: bandRect.top + bandPlace.dy, bottom: bandRect.bottom + bandPlace.dy }, zones.controls);
        if (bandPlace.wait || !clear) place = { dy: 0, wait: true };
        else {
          band = { left: fit.left, width: fit.width, side: 'band' };
          rect = bandRect;
          place = bandPlace;
        }
      }
    }
    // PHONE LAYOUT: a stack that runs past the bottom of its region waits (placeBelow only waits after a move).
    if (zones.region && !place.wait && zones.top + place.dy + (rect === centred ? ch : rect.bottom - rect.top) > zones.maxBottom) place = { dy: 0, wait: true };
    setBeside(band || (rect === centred ? null : side));
    besideHold = rect === centred || band ? null : side;
    const top = Math.round(zones.top + place.dy);
    if (stack.style.top !== `${top}px`) stack.style.top = `${top}px`;
    shownBox = place.wait ? null : { left: rect.left, right: rect.right, top, bottom: top + h };
  }

  /** LANDSCAPE: stand the stack in a column beside the avatar, or back to the stylesheet's centre. */
  function setBeside(next) {
    const key = next ? `${next.left}:${next.width}` : '';
    if (key === (beside ? `${beside.left}:${beside.width}` : '')) return;
    beside = next;
    stack.style.left = next ? `${next.left}px` : '';
    stack.style.width = next ? `${next.width}px` : '';
    stack.style.transform = next ? 'none' : '';
    setData('notifyBeside', key);
  }

  return {
    stack,
    log: logView,
    /** Called when the notifier changes. */
    update(what) {
      if (what === 'notice' || what === undefined) renderCards();
      logView?.update();
      setData('notifyLog', String(notifier.entries.length));
      setData('notifyUnread', String(notifier.unread));
    },
    /**
     * Once a frame. `hold` is why notices wait ('' when they may show);
     * `dropBefore` drops notices raised before a panel opened.
     */
    frame(t, { hold = '', dropBefore = -Infinity } = {}) {
      // While an interaction menu is open, every frame: a conversation card can appear under it at any moment.
      if (root.querySelector('.verb-menu:not([hidden])') || menuShifts.size) measuredAt = -Infinity;
      measure(t);
      layout();
      const why = hold || (place.wait && notifier.notices.length ? 'no room' : '');
      notifier.tick({ hold: Boolean(why), dropBefore });
      const hidden = Boolean(why);
      if (stack.classList.contains('is-waiting') !== hidden) stack.classList.toggle('is-waiting', hidden);
      if (why !== holdWhy) {
        holdWhy = why;
        setData('notifyHold', why);
      }
      setData('notifyTop', shownBox ? String(Math.round(shownBox.top)) : '');
    },
    /** Reserves `rect` (#game-root px) under `name`, or releases it with null (a banner's art box). */
    reserve(name, rect) {
      if (rect) reserved.set(name, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
      else reserved.delete(name);
      measuredAt = -Infinity;
      setData('notifyZones', [...reserved.keys()].join(','));
    },
    /** Rects (in #game-root px) others keep off: the shown stack and any banner. */
    zoneBoxes() {
      const out = [...zones.banner];
      if (shownBox && notifier.notices.length && !holdWhy) out.push(shownBox);
      return out;
    },
    /** The banners alone (reserved zones and overlay canvases), in #game-root px: the street's offer card keeps under them. */
    bannerBoxes() {
      return [...zones.banner];
    },
    /** Speech that could not get clear sits over the stack: the stack fades under it. */
    setUnderSpeech(over) {
      if (over === underSpeech) return;
      underSpeech = over;
      stack.toggleAttribute('data-under-speech', over);
    },
    reducedMotion,
  };
}
