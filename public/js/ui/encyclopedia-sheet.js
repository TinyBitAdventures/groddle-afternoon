/**
 * #401 (iPhone, the game added to the Home Screen): a way into the Encyclopedia (its Menu row, `i`,
 * an "In the Encyclopedia" link) took the whole app to the Encyclopedia's page, out of the game, and
 * only a swipe or Play and signing in again led back. A Home Screen app has one window and no tabs:
 * the Encyclopedia's own window (js/encyclopedia-links.js ENCYCLOPEDIA_WINDOW, the client's
 * 'encyclopedia', TSFrontController.as 4398) became the game's, since the pages sit inside the app's
 * scope (manifest.webmanifest scope "/").
 *
 * There, and only there, the Encyclopedia opens in this sheet over the game instead: the page in a
 * frame, a Back for the pages walked inside it and "Back to the game", so the game and its session
 * stay underneath. In a browser tab nothing changes (a new tab, as the client's new window).
 *
 * The frame's own links are followed with location.replace and a Back list of our own, so nothing is
 * added to the app's history (a swipe back never walks the frame's pages, and a Back with nothing
 * behind it can never leave the game). A link to a play page closes the sheet (you are in the game);
 * a link to another site opens outside the app (iOS shows it over the app, the game still under it).
 *
 * #741 (Austin 2026-11-27): the same sheet is the Home Screen app's page viewer for every page of
 * our own site the game links to (Support the game, See who, the boards, a profile, the privacy
 * policy): js/site-pages.js catchSiteLinks and openSitePage send them all here. Its title is the
 * page's own once it loads ("Encyclopedia" or the site's name until then).
 *
 * QA: `?homescreen=1` opens it in a browser tab too; canvas data `encyclopediaSheet` is the address shown.
 */

/** PURE: true in an iPhone or iPad Home Screen app (navigator.standalone, or the manifest's standalone on iOS). */
export function isHomeScreenApp(win = globalThis.window) {
  try {
    if (/[?&]homescreen=1(?:&|$)/.test(String(win?.location?.search || ''))) return true;
    const nav = win?.navigator;
    if (nav?.standalone === true) return true;
    const ios = /iPhone|iPad|iPod/.test(String(nav?.userAgent || '')) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
    return ios && Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches);
  } catch {
    return false;
  }
}

/**
 * PURE: what a link followed inside the sheet does: 'frame' (the next page in the sheet), 'game'
 * (a play page: close the sheet), 'out' (another site: outside the app) or '' (leave it to the page:
 * a link within the same page, a download, a non-web address).
 */
export function sheetLinkPlan(href, { origin = '', playRoot = '' } = {}) {
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.origin !== origin) return 'out';
  if (playRoot && url.href.startsWith(playRoot)) return 'game';
  return 'frame';
}

export const SHEET_TEXT = Object.freeze({
  title: 'Encyclopedia',
  /** Any other page's title until its own loads. */
  site: 'Groddle Afternoon',
  back: 'Back',
  backLabel: 'Back to the page before',
  close: 'Back to the game',
});

const CSS = `
/* The id: the phone's cap on dialogs (style.css, max-width 100vw - 8px) is not for a whole-screen sheet. */
#ency-sheet.ency-sheet { position: fixed; inset: 0; z-index: var(--z-top); display: flex; flex-direction: column; margin: 0; max-width: none; max-height: none;
  background: var(--surface-card); color: var(--text); font-family: var(--font-round);
  padding: var(--safe-t, 0px) var(--safe-r, 0px) 0 var(--safe-l, 0px); }
#ency-sheet.ency-sheet[hidden] { display: none; }
.ency-sheet-bar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border); background: var(--surface-bright); }
.ency-sheet-title { flex: 1 1 auto; min-width: 0; font-size: var(--fs-lg); font-weight: var(--fw-heavy); color: var(--text-heading);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ency-sheet-bar button { flex: none; white-space: nowrap; min-height: 40px; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-pill);
  background: var(--surface-bright); color: var(--text); font: inherit; font-size: var(--fs-base); font-weight: var(--fw-bold); }
.ency-sheet-bar button[hidden] { display: none; }
.ency-sheet-bar .ency-sheet-close { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.ency-sheet-frame { flex: 1 1 auto; width: 100%; min-height: 0; border: 0; background: var(--surface-card); }
`;

/**
 * The sheet, built on first use in `root`. open(url) shows the page and returns a window-like
 * handle for js/encyclopedia-links.js createEncyclopedia (focus(), closed, location.href = later
 * address). The game's links reach it through js/site-pages.js (catchSiteLinks, openSitePage).
 */
export function createEncyclopediaSheet({ doc = globalThis.document, win = globalThis.window, root = null, setData = () => {} } = {}) {
  let el = null;
  let frame = null;
  let titleEl = null;
  let backBtn = null;
  let closeBtn = null;
  let current = '';
  let returnFocus = null;
  const behind = [];
  const base = () => doc.baseURI || win?.location?.href || '';
  const playRoot = () => {
    try { return new URL('play/', base()).href; } catch { return ''; }
  };
  const origin = () => {
    try { return new URL(base()).origin; } catch { return ''; }
  };

  function build() {
    if (el) return;
    if (!doc.getElementById('ency-sheet-css')) {
      const style = doc.createElement('style');
      style.id = 'ency-sheet-css';
      style.textContent = CSS;
      doc.head.append(style);
    }
    el = doc.createElement('section');
    el.id = 'ency-sheet';
    el.className = 'ency-sheet';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', SHEET_TEXT.title);
    const bar = doc.createElement('header');
    bar.className = 'ency-sheet-bar';
    backBtn = doc.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ency-sheet-back';
    backBtn.dataset.encySheetBack = '';
    backBtn.textContent = `‹ ${SHEET_TEXT.back}`;
    backBtn.setAttribute('aria-label', SHEET_TEXT.backLabel);
    backBtn.hidden = true;
    titleEl = doc.createElement('span');
    titleEl.className = 'ency-sheet-title';
    titleEl.textContent = SHEET_TEXT.title;
    closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ency-sheet-close';
    closeBtn.dataset.encySheetClose = '';
    closeBtn.textContent = SHEET_TEXT.close;
    bar.append(backBtn, titleEl, closeBtn);
    frame = makeFrame();
    el.append(bar, frame);
    // On the page itself, not in the game's frame (a fixed box there can sit inside its box).
    (root || doc.body).append(el);
    backBtn.addEventListener('click', back);
    closeBtn.addEventListener('click', close);
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  /** An empty frame for the pages. */
  function makeFrame() {
    const f = doc.createElement('iframe');
    f.className = 'ency-sheet-frame';
    f.title = SHEET_TEXT.title;
    f.addEventListener('load', onFrameLoad);
    return f;
  }

  /** The bar's title (and the dialog's name): the page's own, or `t`. */
  function setTitle(t) {
    titleEl.textContent = t;
    el.setAttribute('aria-label', t);
    frame.title = t;
  }

  /** The title a page has until its own loads. */
  const titleFor = (url) => (/\/encyclopedia\//.test(String(url || '')) ? SHEET_TEXT.title : SHEET_TEXT.site);

  /** Shows `url` in the frame without adding to the app's history. */
  function show(url, title = '') {
    current = String(url || '');
    setData('encyclopediaSheet', current);
    if (current || title) setTitle(title || titleFor(current));
    backBtn.hidden = behind.length === 0;
    if (!current) return;
    // replace(), never src: a frame's src change after its first page adds to the app's history.
    try {
      if (frame.contentWindow) frame.contentWindow.location.replace(current);
      else frame.src = current;
    } catch {
      frame.src = current;
    }
  }

  function onFrameLoad() {
    let fdoc = null;
    try { fdoc = frame.contentDocument; } catch { fdoc = null; }
    if (!fdoc || !fdoc.body) return;
    const t = String(fdoc.title || '').trim();
    setTitle(t || titleFor(current));
    // The page's own address after its redirects and searches (?q=), for Back.
    try { if (frame.contentWindow.location.href !== 'about:blank') current = frame.contentWindow.location.href; } catch { /* kept */ }
    fdoc.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.('a[href]');
      if (!a || a.hasAttribute('download')) return;
      const href = a.href;
      const plan = sheetLinkPlan(href, { origin: origin(), playRoot: playRoot() });
      if (!plan) return;
      // A link within the page (#section) stays the page's own.
      if (plan === 'frame' && href.split('#')[0] === String(current).split('#')[0] && href.includes('#')) return;
      e.preventDefault();
      if (plan === 'game') close();
      else if (plan === 'out') win?.open?.(href, '_blank', 'noopener');
      else go(href);
    });
  }

  /** The next page in the sheet (the one shown goes on the Back list). */
  function go(url) {
    if (current) behind.push(current);
    show(url);
  }

  function back() {
    if (!behind.length) return;
    show(behind.pop());
  }

  /** Opens the sheet on `url` (or, open already, goes there); `title` until the page's own loads. */
  function open(url = '', { title = '' } = {}) {
    build();
    const wasHidden = el.hidden;
    if (wasHidden) {
      behind.length = 0;
      returnFocus = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
      el.hidden = false;
      show(url, title);
      closeBtn.focus?.({ preventScroll: true });
    } else if (url) go(url);
    return handle;
  }

  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    behind.length = 0;
    current = '';
    setData('encyclopediaSheet', '');
    // A new empty frame in the page's place: no page (and no sound or timers) while the game plays on,
    // and no navigation of the old one left to land after the next open (#741, open, close, open again).
    const old = frame;
    frame = makeFrame();
    old.replaceWith(frame);
    try { returnFocus?.focus?.({ preventScroll: true }); } catch { /* gone */ }
    returnFocus = null;
  }

  const isOpen = () => Boolean(el && !el.hidden);

  /** What createEncyclopedia's open() expects of a window. */
  const handle = {
    focus() {},
    get closed() { return !isOpen(); },
    location: {
      get href() { return current; },
      set href(url) { if (isOpen()) show(url); },
    },
  };

  return { open, close, isOpen, get current() { return current; } };
}
