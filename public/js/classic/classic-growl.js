/**
 * The Classic growl line (classic-spec spec §11, GrowlQueue.as 25-26, 122-127): the game's notices
 * one at a time on a single line at the viewport's bottom-left, each 0.2 s in, 4 s up, 0.6 s out.
 * Ticket 69: a line stays up its reading time (js/read-time.js, at least the 4 s). With one line
 * waiting it gives way after the 4 s; with more waiting (a burst) after NOTICE_KEEP_MS (js/notify.js),
 * as the client's growl gave way to the next after MIN_STAY_TIME (GrowlQueue.as 30, 152-164),
 * instead of a backlog of full holds that showed a line long after it happened.
 *
 * It is a second view on the same notices: js/notify-view.js keeps drawing #notify-notices (Classic
 * keeps it mounted with visibility: hidden, so playtest.mjs and tests/notify.test.js still hold) and
 * this mirrors each card as it comes, in order, once. The line is its own live region, since the
 * hidden stack no longer speaks.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=e8c5807a';
import { readMs } from '../read-time.js?v=be140198';
import { NOTICE_KEEP_MS } from '../notify.js?v=1fb97b21';

export const GROWL_IN_MS = 200;
export const GROWL_HOLD_MS = 4000;
export const GROWL_OUT_MS = 600;
/** More waiting than this and the oldest go (the client's queue only ever held a few). */
export const GROWL_QUEUE_MAX = 6;

/**
 * PURE: how long a line stays up (after its fade in) with `waiting` lines behind it: its reading
 * time alone, the 4 s with one behind it, NOTICE_KEEP_MS in a burst.
 */
export function growlStayMs(html, waiting = 0) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  const n = Number(waiting) || 0;
  if (n >= 2) return NOTICE_KEEP_MS;
  const read = Math.max(GROWL_HOLD_MS, readMs(text));
  return n === 1 ? GROWL_HOLD_MS : read;
}

/** PURE: the queue after a card shows or changes: new html joins the end, a repeat of the waiting tail does not. */
export function enqueue(queue, html, max = GROWL_QUEUE_MAX) {
  const h = String(html || '').trim();
  if (!h) return queue;
  if (queue.length && queue[queue.length - 1] === h) return queue;
  const next = [...queue, h];
  while (next.length > max) next.shift();
  return next;
}

export function installClassicGrowl({ doc = globalThis.document, win = globalThis } = {}) {
  const root = doc.getElementById('game-root');
  const stack = doc.getElementById('notify-notices');
  if (!root) return null;
  const line = doc.createElement('div');
  line.id = 'classic-growl';
  line.className = 'classic-growl';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  line.style.display = 'none';
  root.append(line);

  let queue = [];
  let timer = 0;
  let showing = false;
  /** The line up now: its html, when it began, when its fade out starts (0 once fading). */
  let current = null;
  const clock = () => (win.performance?.now ? win.performance.now() : Date.now());
  const seen = new WeakMap();
  const classic = () => uiState().mode === 'classic';
  const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  function next() {
    clearTimeout(timer);
    if (!queue.length || !classic()) {
      showing = false;
      line.classList.remove('is-on');
      return;
    }
    showing = true;
    const html = queue.shift();
    // The notifier's own markup (colorizeAmounts), already drawn in its card.
    line.innerHTML = html;
    line.classList.add('is-on');
    const inMs = reduced() ? 0 : GROWL_IN_MS;
    current = { html, at: clock(), inMs, fadeAt: 0 };
    fadeIn(inMs + growlStayMs(html, queue.length));
  }

  /** Starts the fade out `ms` from now. */
  function fadeIn(ms) {
    clearTimeout(timer);
    current.fadeAt = clock() + ms;
    timer = setTimeout(() => {
      current.fadeAt = 0;
      line.classList.remove('is-on');
      timer = setTimeout(next, reduced() ? 0 : GROWL_OUT_MS);
    }, ms);
  }

  /** Another line joined the queue: the one up gives way sooner (growlStayMs), never before NOTICE_KEEP_MS. */
  function hurry() {
    if (!current?.fadeAt) return;
    const at = current.at + current.inMs + growlStayMs(current.html, queue.length);
    if (at < current.fadeAt) fadeIn(Math.max(0, at - clock()));
  }

  function take(card) {
    const text = card.querySelector?.('.notify-text');
    if (!text) return;
    const html = text.innerHTML;
    if (seen.get(card) === html) return;
    seen.set(card, html);
    queue = enqueue(queue, html);
    if (!showing) next();
    else hurry();
  }

  if (stack && typeof win.MutationObserver === 'function') {
    new win.MutationObserver((records) => {
      if (!classic()) return;
      for (const r of records) {
        for (const n of r.addedNodes || []) if (n.classList?.contains('notify-card')) take(n);
        if (r.type === 'attributes' && r.target.classList?.contains('notify-card')) take(r.target);
      }
    }).observe(stack, { childList: true, attributes: true, subtree: true, attributeFilter: ['data-html'] });
  }

  const show = (state) => {
    const on = state.mode === 'classic';
    line.style.display = on ? '' : 'none';
    if (!on) {
      queue = [];
      next();
    }
  };
  onUiModeChange(show);
  show(uiState());
  return { line, queue: () => [...queue] };
}
