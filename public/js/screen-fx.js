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
  <div class="st-progress" aria-hidden="true"><i data-st-bar></i><span class="st-status" data-st-status></span></div>`;

/** Builds the card once over whatever placeholder markup the page shipped. */
function ensureLoadingCard(el) {
  if (el.dataset.stCard === '2' || !el.ownerDocument) return;
  el.innerHTML = CARD_HTML;
  el.dataset.stCard = '2';
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
 *   holdMs?: number,
 *   onMid?: () => Promise<void>|void,
 * }} opts
 */
export async function runStreetTransition(el, opts) {
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
  if (snapWrap && snap) {
    // refresh() always draws the rounded 0x666666 picture box; the image loads over it.
    snapWrap.hidden = false;
    if (opts.loadingImg) {
      snap.alt = opts.toLabel || 'Street preview';
      snap.hidden = false;
      snap.onerror = () => {
        snap.hidden = true;
      };
      snap.src = opts.loadingImg;
    } else {
      snap.removeAttribute('src');
      snap.hidden = true;
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

  await crossfadeElement(el, { show: true, durationSec: LOAD_FADE_IN });

  try {
    setStatus(LOAD_STATUS.preparing);
    if (opts.onMid) await opts.onMid();
    // What the street turned out to hold (location.js getLoadingInfo street_details).
    const info = opts.details ? await opts.details() : null;
    if (info) {
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
  const bodyText = awardText(payload.body);
  if (title) title.textContent = awardText(payload.title);
  if (body) {
    body.textContent = bodyText;
    body.hidden = !bodyText;
  }
  if (sub) {
    // Crossfades are non-skippable — no "click to dismiss" cue
    sub.textContent = awardText(payload.subtitle);
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
