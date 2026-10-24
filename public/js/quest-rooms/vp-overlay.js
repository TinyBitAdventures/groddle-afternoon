/**
 * GSJS `vp_overlay` announcements with `nuxp_vog` text: a line of big white
 * type across the top of the viewport (top_y '15%'), either waiting for a
 * click (click_to_advance, with its "click to continue" prompt) or fading
 * after `duration` ms, then any `done_anncs` in order. Shared by the Firefly
 * Whistle lab (quest-rooms/firefly-whistle.js) and the Firefly that offers it
 * (features/resource-nodes-feature.js: npc_firefly.js "What ho! ... Fireflies!").
 *
 * The source's `locking` (the avatar stands still while it shows) is not
 * reproduced; the line simply sits above the world.
 */

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
 * Show one announcement. Resolves when it is clicked through or has timed out.
 * @param {{ setData?: (k: string, v: string) => void }} sink QA data (engine or room ctx)
 * @param {{ lines: string[], clickToAdvance?: boolean, durationMs?: number, delayMs?: number, topY?: string }} annc
 */
export function vpOverlay(sink, { lines = [], clickToAdvance = false, durationMs = 3000, delayMs = 0, topY = '15%' } = {}) {
  const text = lines.join('\n');
  const node = ensure();
  if (!node) return Promise.resolve();
  return new Promise((resolve) => {
    const show = () => {
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
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (current?.finish === finish) current = null;
        node.style.opacity = '0';
        node.hidden = true;
        sink?.setData?.('vpOverlay', '');
        resolve();
      };
      current = { finish, text };
      if (clickToAdvance) node.querySelector('button')?.addEventListener('click', finish, { once: true });
      else timer = setTimeout(finish, Math.max(300, durationMs));
    };
    if (delayMs > 0) setTimeout(show, delayMs);
    else show();
  });
}

/** An announcement and its done_anncs, one after another. */
export async function vpSequence(sink, anncs) {
  for (const annc of anncs) await vpOverlay(sink, annc);
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
