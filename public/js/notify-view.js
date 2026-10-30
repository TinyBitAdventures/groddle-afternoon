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
 */
import { placeBelow, placeBeside, plainText } from './notify.js?v=g459-1';

const STACK_ID = 'notify-notices';
const LOG_ID = 'activity-log';
const BUTTON_ID = 'activity-log-btn';
const MEASURE_MS = 50;

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Signed amounts in plain text as gain/loss spans (the original's coloured Local Chat amounts). */
export function colorizeAmounts(text) {
  return escapeHtml(text).replace(
    /(^|[\s(])([+\-−]\d[\d,]*(?:\.\d+)?)(\s+)([A-Za-z][\w'’-]*(?:\s(?:favor|Tree|Pie|Pies))?)/g,
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
export function mountNotifyView(notifier, { root, setData = () => {}, logButtonHost = null } = {}) {
  if (typeof document === 'undefined' || !root) return null;
  const stack = document.createElement('div');
  stack.id = STACK_ID;
  stack.className = 'notify-notices';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-label', 'Notices');
  root.appendChild(stack);
  const logView = mountActivityLog(notifier, { container: root, buttonHost: logButtonHost });

  /** id → card element */
  const cards = new Map();
  /** name → rect (#game-root px) reserved by its owner (reserve()). */
  const reserved = new Map();
  let measuredAt = -Infinity;
  let zones = { top: 12, banner: [], blockers: [], maxBottom: Infinity, rootW: 0 };
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
    const dialogs = [];
    for (const d of root.querySelectorAll('[role="dialog"]')) {
      // Interaction menus (the verb menu, the Enter chooser, the item pickers: .verb-menu) step aside instead.
      if (d.id === LOG_ID || d.classList.contains('verb-menu') || d.classList.contains('glitch-modal') || d.closest('#pack-bar')) continue;
      if (['award-screen', 'new-day-screen', 'giant-screen-panel', 'overlay'].includes(d.id)) continue;
      const card = dialogCard(d, rr, rootArea);
      if (card) dialogs.push(card);
    }
    blockers.push(...dialogs);
    blockers.push(...keepMenusClear(root, dialogs, rr));
    // The chat dock and the pack are the floor.
    const dock = relRect(document.getElementById('local-chat-dock'), rr);
    const pack = relRect(document.getElementById('pack-bar'), rr);
    const floor = Math.min(dock ? dock.top : Infinity, pack ? pack.top : Infinity, rr.height);
    zones = { top: plate ? plate.bottom + 6 : 10, banner, blockers, maxBottom: Math.min(floor - 8, rr.height * 0.62), rootW: rr.width };
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
    const h = stack.offsetHeight;
    const w = stack.offsetWidth;
    if (!h) {
      place = { dy: 0, wait: false };
      shownBox = null;
      return;
    }
    const left = (zones.rootW - w) / 2;
    const rect = { left, right: left + w, top: zones.top, bottom: zones.top + h };
    place = placeBelow(rect, zones.blockers, { margin: 6, maxBottom: zones.maxBottom });
    const top = Math.round(zones.top + place.dy);
    if (stack.style.top !== `${top}px`) stack.style.top = `${top}px`;
    shownBox = place.wait ? null : { left, right: left + w, top, bottom: top + h };
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
    /** Speech that could not get clear sits over the stack: the stack fades under it. */
    setUnderSpeech(over) {
      if (over === underSpeech) return;
      underSpeech = over;
      stack.toggleAttribute('data-under-speech', over);
    },
    reducedMotion,
  };
}
