/**
 * The Classic growl line (classic-spec spec §11, GrowlQueue.as 25-26, 122-127): the game's notices
 * one at a time on a single line at the viewport's bottom-left, each 0.2 s in, 4 s up, 0.6 s out.
 *
 * It is a second view on the same notices: js/notify-view.js keeps drawing #notify-notices (Classic
 * keeps it mounted with visibility: hidden, so playtest.mjs and tests/notify.test.js still hold) and
 * this mirrors each card as it comes, in order, once. The line is its own live region, since the
 * hidden stack no longer speaks.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g476-1';

export const GROWL_IN_MS = 200;
export const GROWL_HOLD_MS = 4000;
export const GROWL_OUT_MS = 600;
/** More waiting than this and the oldest go (the client's queue only ever held a few). */
export const GROWL_QUEUE_MAX = 6;

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
    const outMs = reduced() ? 0 : GROWL_OUT_MS;
    timer = setTimeout(() => {
      line.classList.remove('is-on');
      timer = setTimeout(next, outMs);
    }, inMs + GROWL_HOLD_MS);
  }

  function take(card) {
    const text = card.querySelector?.('.notify-text');
    if (!text) return;
    const html = text.innerHTML;
    if (seen.get(card) === html) return;
    seen.set(card, html);
    queue = enqueue(queue, html);
    if (!showing) next();
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
