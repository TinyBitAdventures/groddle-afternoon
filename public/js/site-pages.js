/**
 * #741 (iPhone, the game added to the Home Screen): Support the game, "N players online. See who"
 * and every other link from the game to our own site opened a new tab. A Home Screen app has one
 * window and no tabs, so the page took the game's place with no way back. Austin's ruling
 * (2026-11-27): in the Home Screen app every link to our own site opens in the in-game page viewer
 * (js/ui/encyclopedia-sheet.js, the #401 sheet with "Back to the game"), Contribute included.
 *
 * Glitch kept the game open behind every site page: the client opened each in its own named window
 * (TSFrontController.as 4353-4400: calendar, tokens, profile, credits, subscribe, encyclopedia).
 * The viewer over the game is ours, for the one window a Home Screen app has.
 *
 * One rule, here: catchSiteLinks(window) takes every plain click on a link to this site, in the
 * capture phase before anything else, whatever its target, and openSitePage(url) is the only way
 * game code opens a page itself (window.open is for nobody else; tests/r741-site-pages.test.js
 * fails on a new one). Outside a Home Screen app nothing is set (setSitePageViewer is never
 * called), so links and openSitePage open a new tab as before.
 *
 * Left to the browser: another site's address (iOS shows it over the app, the game still under it),
 * a play page (the game itself), a link with `download`, a modified or middle click, a link within
 * the page, and a link the game opens over itself already (`data-opens-here`: the picture lightbox).
 */

/** The live site's hosts: an address on one of them is this site's while the page is on one too. */
export const SITE_HOSTS = Object.freeze(['groddleafternoon.com', 'www.groddleafternoon.com']);
/** A link the game already opens over itself (js/ui/picture-lightbox.js lightboxLink). */
export const OPENS_HERE_ATTR = 'data-opens-here';

let viewer = null;

/** The viewer every site page opens in (the Home Screen app's sheet), or null: a new tab. */
export function setSitePageViewer(open) {
  viewer = typeof open === 'function' ? open : null;
}

/** Whether a viewer is set (the Home Screen app). */
export const hasSitePageViewer = () => Boolean(viewer);

/** What a link to a page says it does: over the game (the viewer) or in a new tab. */
export const SITE_PAGE_TEXT = Object.freeze({
  here: 'opens over the game',
  tab: 'opens in a new tab',
});

/**
 * Whether a link to `href` opens over the game (a viewer is set and the address is this site's),
 * so its words say only what really happens.
 */
export function opensOverGame(href, win = globalThis.window ?? globalThis) {
  if (!viewer) return false;
  const base = pageBase(win);
  return Boolean(sitePageHref(href, { base, pageHref: win?.location?.href || base }));
}

/** A link's tip: "<label>, opens over the game" or "<label>, opens in a new tab". */
export function siteLinkTip(label, href, win) {
  return `${label}, ${opensOverGame(href, win) ? SITE_PAGE_TEXT.here : SITE_PAGE_TEXT.tab}`;
}

const pageBase = (win = globalThis) => win?.document?.baseURI || win?.location?.href || '';

/**
 * PURE: the address a link opens in the viewer, or '' when it is not a page of this site the game
 * keeps (another site, a play page, not a web address). `base` is the page's <base> (the game root),
 * `pageHref` the page's own address. An address on the live site's other host (www or not) is this
 * site's, at the page's own origin.
 */
export function sitePageHref(href, { base = '', pageHref = base, siteHosts = SITE_HOSTS } = {}) {
  let url;
  let page;
  try {
    page = new URL(String(pageHref || base));
    url = new URL(String(href ?? ''), String(base || pageHref));
  } catch {
    return '';
  }
  // A picture the game made (a held report picture): this page's own, shown as it is.
  if (url.protocol === 'blob:') return url.origin === page.origin ? url.href : '';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.origin !== page.origin) {
    const hosts = siteHosts.map((h) => String(h).toLowerCase());
    if (!hosts.includes(url.hostname.toLowerCase()) || !hosts.includes(page.hostname.toLowerCase())) return '';
    url = new URL(`${url.pathname}${url.search}${url.hash}`, page.origin);
  }
  let playRoot = '';
  try { playRoot = new URL('play/', base || page.href).href; } catch { /* none */ }
  if (playRoot && url.href.startsWith(playRoot)) return '';
  return url.href;
}

/**
 * Opens a page of this site from game code: in the viewer when one is set (and the address is
 * this site's), else as window.open(url, name, features) did. Returns the viewer's window-like
 * handle or the window. An empty url opens the viewer empty (a page to come, js/encyclopedia-links.js).
 */
export function openSitePage(url, { name = '_blank', features, title = '', win = globalThis.window ?? globalThis } = {}) {
  const base = pageBase(win);
  const href = url ? sitePageHref(url, { base, pageHref: win?.location?.href || base }) : '';
  if (viewer && (href || !url)) return viewer(href, { title });
  const feats = features ?? (name === '_blank' ? 'noopener' : undefined);
  return (feats === undefined ? win?.open?.(url, name) : win?.open?.(url, name, feats)) || null;
}

/** PURE: whether a click is a plain one (the left button, no key held): the only kind the viewer takes. */
export function plainLinkClick(e) {
  return Boolean(e) && (e.button ?? 0) === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** The link a click is on, through open shadow roots too. */
function linkOf(e) {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  for (const n of path) if (n?.tagName === 'A' && n.hasAttribute?.('href')) return n;
  return e.target?.closest?.('a[href]') || null;
}

/**
 * The one catch: every plain click on a link to a page of this site, anywhere in the game's page,
 * goes to the viewer (capture phase on the window, so no handler of the link's can let it through to
 * a new tab first). Does nothing while no viewer is set. Returns a function that removes it.
 */
export function catchSiteLinks(win = globalThis) {
  const onClick = (e) => {
    if (!viewer || e.defaultPrevented || !plainLinkClick(e)) return;
    const a = linkOf(e);
    if (!a || a.hasAttribute('download') || a.closest?.(`[${OPENS_HERE_ATTR}]`)) return;
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#')) return;
    const base = a.ownerDocument?.baseURI || pageBase(win);
    const href = sitePageHref(a.href || raw, { base, pageHref: win?.location?.href || base });
    if (!href) return;
    e.preventDefault();
    viewer(href, { title: '' });
  };
  win.addEventListener('click', onClick, true);
  return () => win.removeEventListener('click', onClick, true);
}
