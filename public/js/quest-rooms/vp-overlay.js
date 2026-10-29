/**
 * GSJS `vp_overlay` announcements with `nuxp_vog` text: a line of big white
 * type across the top of the viewport (top_y '15%'), either waiting for a
 * click (click_to_advance, with its "click to continue" prompt) or fading
 * after `duration` ms, then any `done_anncs` in order. Shared by the Firefly
 * Whistle lab (quest-rooms/firefly-whistle.js) and the Firefly that offers it
 * (features/resource-nodes-feature.js: npc_firefly.js "What ho! ... Fireflies!").
 *
 * The source's `locking` (the avatar stands still while it shows) is left to
 * the caller (features/swf-feature.js holds the avatar for createGlitchGame's
 * line and lets go when the line ends or is cancelled).
 *
 * G313: a move cancels it. TSMainView.moveMoveStarted (1612) and
 * LocationView.dispose (50) run AnnouncementController.cancelAllOverlaysWeCan
 * (193-215), which cancels every running InWindowAnnouncementOverlay; cancel()
 * is finish() (AbstractAnnouncementOverlay.as 148-150), and overlayIsDone
 * (AnnouncementController.as 448-457) drops the locking count, so a locking
 * line lets the avatar go. A cancelled line's done_anncs are parsed at its
 * fade-out start (AbstractAnnouncementOverlay.as 645-676), but the second
 * cancel at LocationView.dispose takes the next one down before the new street
 * shows, so a sequence ends there: vpSequence stops at a cancelled line. Its
 * done_payload is still sent (645-663), so a caller's follow-up still runs.
 * Each line (and one still waiting out its delay_ms) registers with
 * overlay-art's trackOverlay; the promise resolves false when cancelled.
 */

import { trackOverlay } from '../overlay-art.js?v=g448-1';

let el = null;
let current = null;

function host() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
}

function ensure() {
  if (el || typeof document === 'undefined') return el;
  el = document.createElement('div');
  el.className = 'vp-overlay';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.style.cssText = 'position:absolute;left:50%;z-index:87;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;'
    + 'width:min(560px,calc(100% - 32px));text-align:center;pointer-events:none;transition:opacity .3s;opacity:0';
  host()?.appendChild(el);
  return el;
}

/**
 * Show one announcement. Resolves true when it is clicked through, has timed
 * out or another line replaced it, false when a street change cancelled it.
 * @param {{ setData?: (k: string, v: string) => void }} sink QA data (engine or room ctx)
 * @param {{ lines: string[], clickToAdvance?: boolean, durationMs?: number, delayMs?: number, topY?: string }} annc
 */
export function vpOverlay(sink, { lines = [], clickToAdvance = false, durationMs = 3000, delayMs = 0, topY = '15%' } = {}) {
  const text = lines.join('\n');
  const node = ensure();
  if (!node) return Promise.resolve(true);
  return new Promise((resolve) => {
    let finishLine = null;
    let delayTimer = 0;
    let settled = false;
    const release = trackOverlay(() => {
      if (finishLine) finishLine(false);
      else settle(false);
    });
    const settle = (shown) => {
      if (settled) return;
      settled = true;
      clearTimeout(delayTimer);
      release();
      resolve(shown);
    };
    const show = () => {
      if (settled) return;
      current?.finish?.();
      // Inside a quest room the room card holds the top of the view: sit just under it.
      const card = document.getElementById('quest-instance-hud');
      const under = card && !card.hidden && card.parentElement === node.parentElement ? card.offsetTop + card.offsetHeight + 14 : 0;
      node.style.top = under ? `max(${topY}, ${under}px)` : topY;
      node.innerHTML = lines.map(() => '<p style="margin:0;font:900 clamp(1.1rem,2.8vw,1.6rem)/1.25 Nunito,\'Trebuchet MS\',sans-serif;color:#fff;'
        + 'text-shadow:0 2px 0 #24303a,0 0 3px #24303a,0 0 14px rgba(0,0,0,.45)"></p>').join('')
        + (clickToAdvance ? '<button type="button" style="pointer-events:auto;margin-top:4px;padding:3px 12px;font:800 .78rem Nunito,sans-serif;color:#24303a;'
          + 'border:0;border-radius:999px;background:rgba(255,255,255,.88);box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer">Click to continue &#9656;</button>' : '');
      [...node.querySelectorAll('p')].forEach((p, i) => { p.textContent = lines[i]; });
      node.hidden = false;
      requestAnimationFrame(() => { node.style.opacity = '1'; });
      sink?.setData?.('vpOverlay', text.replace(/\n/g, ' '));
      let done = false;
      let timer = 0;
      const finish = (shown = true) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (current?.finish === finish) current = null;
        node.style.opacity = '0';
        node.hidden = true;
        sink?.setData?.('vpOverlay', '');
        settle(shown !== false);
      };
      finishLine = finish;
      current = { finish, text };
      if (clickToAdvance) node.querySelector('button')?.addEventListener('click', () => finish(true), { once: true });
      else timer = setTimeout(() => finish(true), Math.max(300, durationMs));
    };
    if (delayMs > 0) delayTimer = setTimeout(show, delayMs);
    else show();
  });
}

/**
 * An announcement and its done_anncs, one after another. Resolves true when
 * every line ran, false when a street change cancelled one (the rest never show).
 */
export async function vpSequence(sink, anncs) {
  for (const annc of anncs) {
    if ((await vpOverlay(sink, annc)) === false) return false;
  }
  return true;
}

/** QA: click through (or skip) the line on screen. */
export function advanceVpOverlay() {
  if (!current) return false;
  current.finish();
  return true;
}

/** The text on screen, '' when none. */
export function vpOverlayText() {
  return current?.text || '';
}
