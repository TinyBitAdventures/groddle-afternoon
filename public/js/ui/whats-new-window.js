/**
 * The What's new window (#745, Austin 2026-11-27: "I'd like to also add the popup style of what's new.
 * I just don't want to automatically open that for folks"). Ours: Glitch had nothing like it.
 *
 * - It opens only when the player asks: the Menu's "What's new" row (World, after Encyclopedia, in
 *   both skins; js/ui/topbar.js MENU_ROWS), or the loading card's "See all notes" (js/whats-new.js
 *   requestWhatsNew), which waits for the game to be ready (no loading card, no start card). Never by
 *   itself: the loading card's three lines are the only notice an update gets.
 * - It shows the newest release first: its highlights from play/whats-new.json (the mockup's centred
 *   card, "1. Centred card"). "All versions" swaps in a picker of every release, newest first with its
 *   date (Austin 2026-11-27: "a selector instead of an expand/collapse list"); picking one shows that
 *   version in the same card, and "All versions" there goes back to the picker. The picker reads
 *   play/whats-new-all.json, fetched the first time it opens. The card's ‹ and › buttons, or the Left and
 *   Right arrow keys, step to the older and newer version (Austin 2026-11-27). Everything stays in the
 *   game: no link out.
 * - Esc, the close button, Got it or a press on the shade close it, and focus goes back the usual way
 *   (js/ui/focus-return.js). Keys pressed in it stay in it, so the avatar never walks under it.
 *   It is a role=dialog aria-modal window, so js/window-stack.js puts the newest window on top.
 *
 * Its look (Modern) is WHATS_NEW_WINDOW_STYLE below, injected on first open; Classic restyles it as
 * a 2012 dialog in public/css/classic.css; phones get their safe areas in public/style.css (PHONEPANELS).
 * QA: <html data-whats-new> is "queued" while a loading-card request waits, "open" while it is up.
 *
 * The fast boot fallback's link (#745, Austin 2026-11-28; js/whats-new.js offerWhatsNewFallback), on the
 * start card or in an Activity line, is any [data-whats-new-version] button: a press opens the window at
 * that version (openVersion), over the start card too (js/window-stack.js isTopWindow). Ours.
 */
import {
  WHATS_NEW_ALL_PATH, WHATS_NEW_PATH, WHATS_NEW_REQUEST_EVENT, releasesOf, shortVersion, takeWhatsNewRequest, whatsNewRequested,
} from '../whats-new.js?v=988ec58d';
import { focusBack } from './focus-return.js?v=da190597';

/** The Menu row (js/ui/topbar.js MENU_ROWS places it in World, after Encyclopedia). */
export const WHATS_NEW_MENU = Object.freeze({ id: 'whats-new-btn', label: "What's new", tip: "What's new in the latest update, and every version before it" });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** PURE: 2026-11-27 reads "Nov 27, 2026" ('' for anything else). */
export function releaseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The words (plain, no em dashes). */
export const WHATS_NEW_WINDOW_TEXT = Object.freeze({
  eyebrow: (v) => `Updated · ${v}`,
  olderEyebrow: (v) => v,
  title: (v) => `What's new in ${shortVersion(v)}`,
  released: (date) => (releaseDate(date) ? `Released ${releaseDate(date)}.` : ''),
  allEyebrow: (n) => `${n} ${n === 1 ? 'version' : 'versions'}`,
  allTitle: 'All versions',
  allSub: 'Newest first. Pick one to see its highlights.',
  all: 'All versions',
  back: 'Back',
  older: (v) => (v ? `Older version, ${shortVersion(v)} (Left arrow)` : 'Older version (Left arrow)'),
  newer: (v) => (v ? `Newer version, ${shortVersion(v)} (Right arrow)` : 'Newer version (Right arrow)'),
  done: 'Got it',
  close: 'Close',
  loading: 'Loading the notes.',
  failed: 'The notes could not load. Try again in a moment.',
  partial: 'Only the newest versions could load.',
});

/** PURE: the All versions list: every release, newest first, { version, short, date, lines }. */
export function versionRows(data) {
  return releasesOf(data).map((r) => ({ version: r.version, short: shortVersion(r.version), date: releaseDate(r.date), lines: r.lines }));
}

/** PURE: an id for a version's lines (v0.78.0 is whats-new-v0-78-0). */
export const versionDomId = (v) => `whats-new-${String(v).replace(/[^\w]+/g, '-')}`;

export const WHATS_NEW_WINDOW_STYLE = `
.wn-shade { position: fixed; inset: 0; z-index: var(--z-dialog); display: grid; place-items: center; padding: var(--sp-8); background: var(--overlay-scrim); }
.wn-shade[hidden] { display: none; }
.wn-window { position: relative; display: flex; flex-direction: column; box-sizing: border-box; width: min(440px, 100%); max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem);
  border-radius: var(--radius-3xl); background: var(--surface-card); color: var(--text-heading); box-shadow: var(--shadow-3); font-family: var(--font-round);
  padding: var(--sp-12) var(--sp-12) var(--sp-10); }
.wn-window:focus { outline: none; }
.wn-close { position: absolute; top: var(--sp-5); right: var(--sp-5); border: 0; padding: var(--sp-1) var(--sp-4); background: transparent; color: var(--text-muted);
  font-size: var(--fs-2xl); line-height: var(--lh-none); cursor: pointer; border-radius: var(--radius-pill); }
.wn-close:hover { color: var(--text-heading); }
.wn-eyebrow { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: var(--radius-pill); background: var(--accent-soft); color: var(--accent);
  font-size: var(--fs-sm); font-weight: var(--fw-heavy); letter-spacing: 0.02em; }
.wn-window h2 { margin: var(--sp-5) 0 2px; padding-right: var(--sp-10); font-size: var(--fs-3xl); font-weight: var(--fw-heavy); line-height: var(--lh-tight); color: var(--text-heading); }
.wn-window h2:focus { outline: none; }
.wn-sub { margin: 0 0 var(--sp-8); color: var(--text-muted); font-size: var(--fs-base); font-weight: var(--fw-regular); }
.wn-body { min-height: 0; overflow: auto; overscroll-behavior: contain; margin: 0 calc(-1 * var(--sp-4)); padding: 0 var(--sp-4); }
.wn-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-5); }
.wn-list li { display: grid; grid-template-columns: 22px 1fr; gap: var(--sp-4); align-items: start; font-size: var(--fs-l); font-weight: var(--fw-regular); line-height: var(--lh-snug); color: var(--text-heading); }
.wn-list li > i { width: 22px; height: 22px; border-radius: var(--radius-round); display: grid; place-items: center; font-style: normal; font-size: var(--fs-xs); font-weight: var(--fw-heavy);
  background: var(--surface-moss); color: var(--text-moss); }
.wn-note { margin: 0; color: var(--text-muted); font-size: var(--fs-base); }
.wn-window :is(.wn-note, .wn-list, .wn-versions, .wn-sub)[hidden] { display: none; }
.wn-versions { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); }
.wn-ver-head { display: flex; align-items: center; gap: var(--sp-4); width: 100%; box-sizing: border-box; padding: var(--sp-4) var(--sp-5); border: 0; border-radius: var(--radius-lg); background: transparent;
  color: var(--text-heading); font: inherit; font-size: var(--fs-base); text-align: left; cursor: pointer; }
.wn-ver-head:hover, .wn-ver-head[aria-current="true"] { background: var(--surface-raised); }
.wn-ver-head b { font-weight: var(--fw-heavy); min-width: 4.5em; }
.wn-ver-head span { flex: 1; color: var(--text-muted); }
.wn-ver-head::after { content: '›'; color: var(--accent); font-weight: var(--fw-heavy); font-size: var(--fs-l); line-height: var(--lh-none); }
.wn-actions { display: flex; gap: var(--sp-4); justify-content: flex-end; align-items: center; margin-top: var(--sp-10); flex: 0 0 auto; }
.wn-steps { display: flex; gap: var(--sp-1); margin-right: auto; }
.wn-steps[hidden] { display: none; }
.wn-btn.wn-step { min-width: 40px; padding-inline: var(--sp-4); font-size: var(--fs-xl); line-height: var(--lh-none); border-radius: var(--radius-pill); }
.wn-btn.wn-step:hover:not(:disabled) { background: var(--surface-raised); }
.wn-btn.wn-step:disabled { color: var(--text-muted); cursor: default; opacity: 0.45; }
.wn-btn { border: 0; border-radius: var(--radius-pill); padding: 10px 20px; font: inherit; font-size: var(--fs-base); font-weight: var(--fw-heavy); cursor: pointer; }
.wn-btn[hidden] { display: none; }
.wn-btn.wn-primary { background: var(--accent); color: var(--accent-text); }
.wn-btn.wn-quiet { background: transparent; color: var(--accent); padding-inline: 8px; }
.wn-window :is(button):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function setFlag(doc, value) {
  const root = doc?.documentElement;
  if (!root?.dataset) return;
  if (value) root.dataset.whatsNew = value;
  else delete root.dataset.whatsNew;
}

/**
 * PURE-ish: true once the game is ready for a window the player asked for while it loaded: the
 * loading card is gone, no sign-in gate, and the start card is not up.
 */
export function gameReady(doc) {
  const body = doc?.body;
  if (!body || body.classList?.contains('is-booting') || body.classList?.contains('online-gated')) return false;
  const start = doc.getElementById?.('overlay');
  return !(start && !start.classList?.contains('hidden') && !start.hidden);
}

/**
 * The window (built on first open). `fetch` is injectable for tests.
 * @param {Document} doc
 */
export function createWhatsNewWindow(doc = globalThis.document, { fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  let shade = null;
  let returnFocus = null;
  let view = 'latest';
  let shown = null;
  let allFailed = false;
  const parts = {};
  const cache = new Map();

  const load = async (path) => {
    if (cache.has(path)) return cache.get(path);
    const res = await fetchFn(new URL(path, doc.baseURI).href);
    if (!res?.ok) throw new Error(`${path}: ${res?.status}`);
    const data = await res.json();
    cache.set(path, data);
    return data;
  };

  const build = () => {
    if (!doc.getElementById('whats-new-css')) {
      const style = el(doc, 'style', { id: 'whats-new-css' });
      style.textContent = WHATS_NEW_WINDOW_STYLE;
      doc.head?.append(style);
    }
    shade = el(doc, 'div', { id: 'whats-new-shade', class: 'wn-shade', hidden: true });
    const win = el(doc, 'section', { id: 'whats-new-window', class: 'wn-window', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'whats-new-title', 'data-view': 'latest' });
    const close = el(doc, 'button', { type: 'button', class: 'wn-close', 'aria-label': WHATS_NEW_WINDOW_TEXT.close, title: WHATS_NEW_WINDOW_TEXT.close }, '×');
    parts.eyebrow = el(doc, 'span', { class: 'wn-eyebrow' });
    parts.title = el(doc, 'h2', { id: 'whats-new-title', tabindex: '-1' });
    parts.sub = el(doc, 'p', { class: 'wn-sub' });
    parts.body = el(doc, 'div', { class: 'wn-body' });
    parts.note = el(doc, 'p', { class: 'wn-note', role: 'status', hidden: true });
    parts.list = el(doc, 'ul', { class: 'wn-list' });
    parts.versions = el(doc, 'ul', { class: 'wn-versions', hidden: true, 'aria-label': WHATS_NEW_WINDOW_TEXT.allTitle });
    parts.body.append(parts.note, parts.list, parts.versions);
    const actions = el(doc, 'div', { class: 'wn-actions' });
    parts.all = el(doc, 'button', { type: 'button', class: 'wn-btn wn-quiet', 'data-whats-new-all': '' }, WHATS_NEW_WINDOW_TEXT.all);
    parts.back = el(doc, 'button', { type: 'button', class: 'wn-btn wn-quiet', 'data-whats-new-back': '', hidden: true }, WHATS_NEW_WINDOW_TEXT.back);
    parts.done = el(doc, 'button', { type: 'button', class: 'wn-btn wn-primary', 'data-whats-new-done': '' }, WHATS_NEW_WINDOW_TEXT.done);
    parts.steps = el(doc, 'div', { class: 'wn-steps' });
    parts.older = el(doc, 'button', { type: 'button', class: 'wn-btn wn-quiet wn-step', 'data-whats-new-older': '' }, '‹');
    parts.newer = el(doc, 'button', { type: 'button', class: 'wn-btn wn-quiet wn-step', 'data-whats-new-newer': '' }, '›');
    parts.steps.append(parts.older, parts.newer);
    actions.append(parts.steps, parts.all, parts.back, parts.done);
    win.append(close, parts.eyebrow, parts.title, parts.sub, parts.body, actions);
    shade.append(win);
    parts.win = win;
    doc.body.append(shade);
    close.addEventListener('click', () => api.close());
    parts.done.addEventListener('click', () => api.close());
    parts.all.addEventListener('click', () => api.showAll());
    parts.older.addEventListener('click', () => api.step(-1));
    parts.newer.addEventListener('click', () => api.step(1));
    parts.back.addEventListener('click', () => { if (shown) api.showVersion(shown); else api.showLatest(); });
    parts.versions.addEventListener('click', (e) => {
      const head = e.target?.closest?.('.wn-ver-head');
      const v = head?.closest?.('.wn-ver')?.getAttribute('data-version');
      if (v) api.showVersion(v);
    });
    shade.addEventListener('pointerdown', (e) => { if (e.target === shade) api.close(); });
    // Keys pressed in the window stay in it: the game's movement keys must not fire under it.
    shade.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        api.close();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && view === 'latest' && shown && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        api.step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  };

  const note = (text) => {
    parts.note.textContent = text || '';
    parts.note.hidden = !text;
  };

  const setView = (next) => {
    view = next;
    parts.win.setAttribute('data-view', next);
    parts.list.hidden = next !== 'latest';
    parts.versions.hidden = next !== 'all';
    parts.all.hidden = next !== 'latest';
    parts.steps.hidden = next !== 'latest';
    parts.back.hidden = next !== 'all';
    if (parts.body.scrollTop) parts.body.scrollTop = 0;
  };

  /** The card for one release: the newest says "Updated", an older one names its version. */
  const fillLatest = (release, newest = true) => {
    shown = release.version;
    parts.win.setAttribute('data-version', release.version);
    parts.eyebrow.textContent = newest ? WHATS_NEW_WINDOW_TEXT.eyebrow(release.version) : WHATS_NEW_WINDOW_TEXT.olderEyebrow(release.version);
    parts.title.textContent = WHATS_NEW_WINDOW_TEXT.title(release.version);
    parts.sub.textContent = WHATS_NEW_WINDOW_TEXT.released(release.date);
    parts.sub.hidden = !parts.sub.textContent;
    parts.list.replaceChildren(...release.lines.map((text) => {
      const li = el(doc, 'li');
      li.append(el(doc, 'i', { 'aria-hidden': 'true' }, '✓'), el(doc, 'span', {}, text));
      return li;
    }));
  };

  /** The ‹ › buttons: names and ends for the version on show (older stays on until the whole history says it's the first). */
  const updateSteps = () => {
    const list = knownReleases();
    const at = list.findIndex((r) => r.version === shown);
    const older = at >= 0 ? list[at + 1] : null;
    const newer = at > 0 ? list[at - 1] : null;
    const more = !cache.has(WHATS_NEW_ALL_PATH) && !allFailed;
    parts.older.disabled = at < 0 || (!older && !more);
    parts.newer.disabled = !newer;
    for (const [btn, text] of [[parts.older, WHATS_NEW_WINDOW_TEXT.older(older?.version)], [parts.newer, WHATS_NEW_WINDOW_TEXT.newer(newer?.version)]]) {
      btn.setAttribute('aria-label', text);
      btn.setAttribute('title', text);
    }
  };

  /** Every release the window has: the whole history once fetched, else the newest file's. */
  const knownReleases = () => {
    for (const path of [WHATS_NEW_ALL_PATH, WHATS_NEW_PATH]) {
      if (cache.has(path)) {
        const list = releasesOf(cache.get(path));
        if (list.length) return list;
      }
    }
    return [];
  };

  const fillVersions = (rows) => {
    parts.eyebrow.textContent = WHATS_NEW_WINDOW_TEXT.allEyebrow(rows.length);
    parts.title.textContent = WHATS_NEW_WINDOW_TEXT.allTitle;
    parts.sub.textContent = WHATS_NEW_WINDOW_TEXT.allSub;
    parts.sub.hidden = false;
    let current = null;
    parts.versions.replaceChildren(...rows.map((r) => {
      const li = el(doc, 'li', { class: 'wn-ver', 'data-version': r.version });
      const here = r.version === shown;
      const head = el(doc, 'button', { type: 'button', id: versionDomId(r.version), class: 'wn-ver-head', 'aria-current': here ? 'true' : false });
      head.append(el(doc, 'b', {}, r.short), el(doc, 'span', {}, r.date));
      li.append(head);
      if (here) current = head;
      return li;
    }));
    // The version on show stays in view in a long list.
    current?.scrollIntoView?.({ block: 'center' });
  };

  const api = {
    isOpen: () => Boolean(shade && !shade.hidden),
    view: () => view,
    /** Opens on the newest release (resolves once its lines are in). */
    async open() {
      if (!shade) build();
      if (!api.isOpen()) returnFocus = doc.activeElement;
      shade.hidden = false;
      setFlag(doc, 'open');
      setView('latest');
      parts.title.focus?.({ preventScroll: true });
      try {
        const newest = releasesOf(await load(WHATS_NEW_PATH))[0];
        if (!newest) throw new Error('no releases');
        fillLatest(newest);
        updateSteps();
        note('');
      } catch {
        parts.eyebrow.textContent = '';
        parts.title.textContent = WHATS_NEW_MENU.label;
        parts.sub.hidden = true;
        parts.list.replaceChildren();
        note(WHATS_NEW_WINDOW_TEXT.failed);
      }
    },
    /** The All versions list (fetched the first time). */
    async showAll() {
      if (!api.isOpen()) await api.open();
      setView('all');
      if (!cache.has(WHATS_NEW_ALL_PATH)) note(WHATS_NEW_WINDOW_TEXT.loading);
      parts.title.focus?.({ preventScroll: true });
      let rows = [];
      try {
        rows = versionRows(await load(WHATS_NEW_ALL_PATH));
        note('');
      } catch {
        // The short file still lists the newest releases.
        allFailed = true;
        rows = cache.has(WHATS_NEW_PATH) ? versionRows(cache.get(WHATS_NEW_PATH)) : [];
        note(rows.length ? WHATS_NEW_WINDOW_TEXT.partial : WHATS_NEW_WINDOW_TEXT.failed);
      }
      if (view === 'all') fillVersions(rows);
      return rows.length;
    },
    /** One version in the card (from the picker); false when the window doesn't have it. */
    async showVersion(version) {
      const list = knownReleases();
      const at = list.findIndex((r) => r.version === version);
      if (at < 0) return false;
      setView('latest');
      fillLatest(list[at], at === 0);
      note('');
      updateSteps();
      parts.title.focus?.({ preventScroll: true });
      return true;
    },
    /** One version older (-1) or newer (+1) than the one on show; the whole history is fetched when the newest file runs out. */
    async step(dir) {
      if (view !== 'latest' || !shown) return false;
      let list = knownReleases();
      let at = list.findIndex((r) => r.version === shown);
      if (dir < 0 && at >= 0 && at + 1 >= list.length && !cache.has(WHATS_NEW_ALL_PATH)) {
        try {
          await load(WHATS_NEW_ALL_PATH);
        } catch {
          allFailed = true; // only the newest file: nothing older to show
        }
        list = knownReleases();
        at = list.findIndex((r) => r.version === shown);
        updateSteps();
      }
      const next = at < 0 ? null : list[at - Math.sign(dir)];
      return next ? api.showVersion(next.version) : false;
    },
    /** Opens on one version (the fallback link's); the newest when the window doesn't have it. */
    async openVersion(version) {
      await api.open();
      if (!version || shown === version) return shown === version;
      if (!knownReleases().some((r) => r.version === version) && !cache.has(WHATS_NEW_ALL_PATH)) {
        try {
          await load(WHATS_NEW_ALL_PATH);
        } catch {
          allFailed = true;
        }
      }
      return api.showVersion(version);
    },
    async showLatest() {
      setView('latest');
      parts.title.focus?.({ preventScroll: true });
      const newest = cache.has(WHATS_NEW_PATH) ? releasesOf(cache.get(WHATS_NEW_PATH))[0] : null;
      if (newest) {
        fillLatest(newest);
        updateSteps();
        note('');
      } else await api.open();
    },
    close() {
      if (!api.isOpen()) return;
      shade.hidden = true;
      setFlag(doc, '');
      const back = returnFocus;
      returnFocus = null;
      // The opener after a keyboard open and close, the world after a click (focus-return.js).
      if (back && typeof back.focus === 'function' && back.isConnected) focusBack(back, { doc });
    },
  };
  return api;
}

/**
 * The Menu row, and the loading card's request (game.js calls this once, after installMoreMenu).
 * A request waits, checking every `poll` ms, until gameReady. Returns the window.
 */
export function installWhatsNewWindow({ doc = globalThis.document, fetch: fetchFn, poll = 400, ready = () => gameReady(doc) } = {}) {
  const notes = createWhatsNewWindow(doc, fetchFn ? { fetch: fetchFn } : undefined);
  const list = doc.getElementById?.('more-list');
  if (list && !doc.getElementById(WHATS_NEW_MENU.id)) {
    const row = el(doc, 'button', { type: 'button', id: WHATS_NEW_MENU.id, class: 'chrome-btn', title: WHATS_NEW_MENU.tip }, WHATS_NEW_MENU.label);
    // The Menu closes on a pick (game.js installMoreMenu).
    row.addEventListener('click', () => { notes.open(); });
    list.append(row);
  }
  let timer = null;
  const serve = () => {
    if (!whatsNewRequested(doc)) return;
    if (!ready()) {
      setFlag(doc, 'queued');
      if (!timer) timer = setInterval(serve, poll);
      return;
    }
    if (timer) clearInterval(timer);
    timer = null;
    takeWhatsNewRequest(doc);
    notes.open();
  };
  doc.addEventListener?.(WHATS_NEW_REQUEST_EVENT, serve);
  serve();
  // #745 fallback: the quiet "What's new in vX.Y" link (start card or Activity line) opens it at that version.
  (doc.body || doc).addEventListener?.('click', (e) => {
    const link = e.target?.closest?.('[data-whats-new-version]');
    if (!link) return;
    e.preventDefault?.();
    notes.openVersion(link.getAttribute('data-whats-new-version'));
  });
  return notes;
}
