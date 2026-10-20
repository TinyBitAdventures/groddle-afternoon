/**
 * Full-screen transition / award FX — timings and modes modeled on original Glitch client:
 * - LoadingLocationView.as: fadeIn ~0.2s easeInCubic, fadeOut ~0.5s easeInCubic
 * - BaseScreenView.as: fade_in ~0.4s, fade_out ~0.3s for award-style screens
 * - AchievementView.as: bg ~#a7c39c @ 0.9 alpha, full-viewport celebration
 *
 * DOM-driven (not Pixi) so it covers HUD + canvas inside #game-root.
 */

/**
 * Street-load timings (seconds).
 * Slightly slower than original LoadingLocationView so teleports read as intentional
 * and the crossfade cannot be rushed past.
 */
export const LOAD_FADE_IN = 0.45;
export const LOAD_FADE_OUT = 0.85;
/** Pause after street is ready, before fade-out (ms). */
export const LOAD_HOLD_MS = 480;
/** BaseScreenView award timings. */
export const AWARD_FADE_IN = 0.45;
export const AWARD_FADE_OUT = 0.4;
/** Minimum on-screen time for award/new-day — not dismissible early. */
export const AWARD_HOLD_MS = 3800;
export const NEW_DAY_HOLD_MS = 4500;

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
export function normalizeAwardPages(payload = {}) {
  if (!Array.isArray(payload.steps)) return [];
  const pages = payload.steps
    .map((step) => ({
      text: String(step?.text || '').trim(),
      response: String(step?.response || '').trim(),
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
 * Run a CSS opacity transition on an element that starts hidden.
 * @param {HTMLElement} el
 * @param {{ show: boolean, durationSec: number }} opts
 */
export async function crossfadeElement(el, { show, durationSec }) {
  if (!el) return;
  el.hidden = false;
  el.style.transition = `opacity ${durationSec}s cubic-bezier(0.55, 0.06, 0.68, 0.19)`; // easeInCubic-ish
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

/**
 * Full street-load sequence: fade in → work → fade out.
 * @param {HTMLElement} el  #screen-transition
 * @param {{
 *   fromLabel?: string,
 *   fromHub?: string,
 *   toLabel: string,
 *   toHub?: string,
 *   loadingImg?: string|null,
 *   topColor?: string|null,
 *   bottomColor?: string|null,
 *   onMid?: () => Promise<void>|void,
 * }} opts
 */
export async function runStreetTransition(el, opts) {
  if (!el) {
    if (opts.onMid) await opts.onMid();
    return;
  }
  const leave = el.querySelector('[data-st-leave]');
  const leaveHub = el.querySelector('[data-st-leave-hub]');
  const enter = el.querySelector('[data-st-enter]');
  const enterHub = el.querySelector('[data-st-enter-hub]');
  const bar = el.querySelector('[data-st-bar]');
  const status = el.querySelector('[data-st-status]');
  const snapWrap = el.querySelector('[data-st-snap-wrap]');
  const snap = el.querySelector('[data-st-snap]');

  // Hub gradient (LoadingLocationView top_color / bottom_color)
  const top = opts.topColor || '#1a2830';
  const bot = opts.bottomColor || '#1e2a24';
  el.style.background = `linear-gradient(180deg, ${top} 0%, ${bot} 55%, ${bot} 100%)`;

  if (leave) {
    const from = opts.fromLabel || '';
    leave.textContent = from ? `Leaving ${from}` : '';
    leave.hidden = !from;
  }
  if (leaveHub) {
    leaveHub.textContent = opts.fromHub || '';
    leaveHub.hidden = !opts.fromHub;
  }
  if (enter) enter.textContent = opts.toLabel || '…';
  if (enterHub) {
    enterHub.textContent = opts.toHub || '';
    enterHub.hidden = !opts.toHub;
  }
  if (snapWrap && snap) {
    if (opts.loadingImg) {
      snap.alt = opts.toLabel || 'Street preview';
      snap.src = opts.loadingImg;
      snapWrap.hidden = false;
      snap.onerror = () => {
        snapWrap.hidden = true;
      };
    } else {
      snap.removeAttribute('src');
      snapWrap.hidden = true;
    }
  }
  if (status) status.textContent = 'loading…';
  if (bar) {
    bar.style.width = '8%';
    bar.classList.add('is-busy');
  }

  // Non-interactive during load (no click-to-skip)
  el.style.pointerEvents = 'auto';
  el.setAttribute('aria-busy', 'true');

  await crossfadeElement(el, { show: true, durationSec: LOAD_FADE_IN });
  if (bar) bar.style.width = '55%';

  try {
    if (opts.onMid) await opts.onMid();
    if (bar) bar.style.width = '100%';
    if (status) status.textContent = 'ready';
    const hold = opts.holdMs ?? LOAD_HOLD_MS;
    await wait(hold);
  } finally {
    if (bar) {
      bar.classList.remove('is-busy');
      bar.style.width = '100%';
    }
    await crossfadeElement(el, { show: false, durationSec: LOAD_FADE_OUT });
    if (bar) bar.style.width = '0%';
    if (snap) {
      snap.removeAttribute('src');
      if (snapWrap) snapWrap.hidden = true;
    }
    el.setAttribute('aria-busy', 'false');
  }
}

/**
 * Full-screen award / quest complete celebration.
 * @param {HTMLElement} el  #award-screen
 * @param {{
 *   kind?: 'achievement'|'quest'|'level'|'generic',
 *   title: string,
 *   subtitle?: string,
 *   body?: string,
 *   iconUrl?: string|null,
 *   holdMs?: number,
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

  const kickers = {
    achievement: 'New Achievement!',
    quest: 'Quest Complete!',
    level: 'Level Up!',
    generic: 'Well done!',
  };
  if (kicker) kicker.textContent = kickers[kind] || kickers.generic;
  if (title) title.textContent = payload.title || '';
  if (body) {
    body.textContent = payload.body || '';
    body.hidden = !payload.body;
  }
  if (sub) {
    // Crossfades are non-skippable — no "click to dismiss" cue
    sub.textContent = payload.subtitle || '';
    sub.classList.remove('has-reward-tokens');
    sub.hidden = !payload.subtitle || Boolean(paged);
  }
  if (next) next.hidden = true;
  if (close) close.hidden = true;
  if (badge) {
    badge.dataset.kind = kind;
  }
  // Real badge PNG when available (Wayback / assets/badges)
  if (img && glyph) {
    if (payload.iconUrl) {
      img.hidden = false;
      img.alt = payload.title || 'Badge';
      img.src = payload.iconUrl;
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
  if (paged) {
    el.dataset.paged = 'true';
    el.dataset.pages = String(pages.length);
  } else {
    delete el.dataset.paged;
    delete el.dataset.page;
    delete el.dataset.pages;
  }
  el.style.pointerEvents = 'auto';
  // Swallow clicks/keys so they don't hit the world underneath.
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  el.addEventListener('click', swallow);

  await crossfadeElement(el, { show: true, durationSec: AWARD_FADE_IN });

  if (paged) {
    const swallowPagedKey = (event) => {
      if (
        (event.target === next || event.target === close) &&
        (event.key === 'Enter' || event.key === ' ' || event.code === 'Space')
      ) {
        event.stopPropagation();
        return;
      }
      swallow(event);
    };
    el.addEventListener('keydown', swallowPagedKey);
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
        sub.replaceChildren();
        const rewards = awardRewardTokens(payload.subtitle);
        if (final && rewards.length) {
          for (const reward of rewards) {
            const token = document.createElement('span');
            token.className = `award-reward award-reward--${reward.kind}`;
            token.textContent = reward.text;
            sub.appendChild(token);
          }
        }
        sub.classList.toggle('has-reward-tokens', final && rewards.length > 0);
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
    el.removeEventListener('keydown', swallowPagedKey);
  } else {
    el.addEventListener('keydown', swallow);
    const hold = payload.holdMs ?? AWARD_HOLD_MS;
    await wait(hold);
    el.removeEventListener('keydown', swallow);
  }

  el.removeEventListener('click', swallow);

  await crossfadeElement(el, { show: false, durationSec: AWARD_FADE_OUT });
  if (next) next.hidden = true;
  if (close) close.hidden = true;
  delete el.dataset.paged;
  delete el.dataset.page;
  delete el.dataset.pages;
  if (payload.onDismiss) payload.onDismiss();
}
