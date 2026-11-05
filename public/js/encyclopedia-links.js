/**
 * ENCYC (Austin 2026-11-05): the game's ways into the Encyclopedia (/encyclopedia/, the pages
 * tools/encyclopedia/build.mjs and tools/catalog/build.mjs write).
 *
 * - The `i` key opens it in its own tab on the most relevant page: the thing whose card or verb
 *   menu is open, else the thing under the pointer (a pack slot, a store tile, something in the
 *   world), else the region of the street you are on, else the home page. Glitch's `i` started
 *   Info mode (TSMainView.as iKeyHandler 870-891, InfoManager.as), whose item cards linked to the
 *   item's Encyclopedia page ("See in Encyclopedia", GetInfoDialog.as 142-163, 637-638, 759-761);
 *   the remake has no Info mode, so `i` goes straight to the page. The key needed no card: the
 *   client never asked for Encyclopeddling (that card only turned the island's new-item growls
 *   into the item dialog, players/inc_items.js 614), and `i` did nothing only where the location
 *   hid the imagination menu (location.no_imagination: the tutorial's clouds, training rooms and
 *   house), in decorate, look-builder or cultivate mode, or with a text field focused.
 * - Menu > World > Encyclopedia (and the player menu's Encyclopedia, PlayerInfoButtons.as 43,
 *   TSFrontController.as openEncyclopediaPage 4395-4400) open the home page.
 * - "In the Encyclopedia" links on the pack's item card and on the Skills and Quests sheets, only
 *   where the thing has a page.
 *
 * Pages are found in the encyclopedia's own index (encyclopedia/search.json: every page's section,
 * id, name and address), so nothing here knows how a page is named. A thing with no page goes to the
 * home page's search for its name (?q=&s=, encyclopedia.js). Every window opens under one name, as
 * the client's did (its target 'encyclopedia'), so a second press reuses the Encyclopedia's tab.
 */

/** The home page and the index, relative to the game root (the play pages' <base>). */
export const ENCYCLOPEDIA_HOME = 'encyclopedia/';
export const ENCYCLOPEDIA_INDEX = 'encyclopedia/search.json';
/** The window every Encyclopedia link opens in (TSFrontController.as 4398: 'encyclopedia'). */
export const ENCYCLOPEDIA_WINDOW = 'encyclopedia';
/** The links' words and the Menu row's. */
export const ENCYCLOPEDIA_LINK_LABEL = 'In the Encyclopedia';
export const ENCYCLOPEDIA_MENU_LABEL = 'Encyclopedia';
export const ENCYCLOPEDIA_TIP = 'Opens in a new tab';

/** Lower case with accents and punctuation folded (encyclopedia.js fold), for names. */
export function foldName(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * PURE: the lookups from search.json: `pages` ("section:id" to the page's address) and `places`
 * (a region's folded name to its pages, more than one only if two regions share a name).
 */
export function buildEncyclopediaIndex(json) {
  const pages = new Map();
  const places = new Map();
  for (const e of Array.isArray(json?.entries) ? json.entries : []) {
    if (!e || typeof e.s !== 'string' || typeof e.id !== 'string' || typeof e.h !== 'string') continue;
    pages.set(`${e.s}:${e.id}`, e.h);
    if (e.s === 'places') {
      const k = foldName(e.n);
      if (!places.has(k)) places.set(k, []);
      places.get(k).push({ id: e.id, h: e.h });
    }
  }
  const sections = (Array.isArray(json?.sections) ? json.sections : []).map((s) => s?.key).filter(Boolean);
  return { pages, places, sections };
}

/**
 * PURE: the pages a class id can have, in the encyclopedia's own order (tools/encyclopedia/data.mjs
 * keyOf: an animal, a person, then an item). The encyclopedia folds the regional shrines into
 * their Giant's shrine and every Street Spirit into the one Street Spirit page, so those ids also
 * try the page they were folded into.
 */
export function classPageKeys(id) {
  const cls = String(id || '');
  if (!cls) return [];
  const keys = [`animals:${cls}`, `people:${cls}`];
  const shrine = /^npc_shrine_(?:firebog|ix|uralia)_([a-z]+)$/.exec(cls);
  if (shrine) keys.push(`people:npc_shrine_${shrine[1] === 'tii' ? 'ti' : shrine[1]}`);
  if (/^street_spirit(?:_|$)/.test(cls)) keys.push('people:street_spirit');
  keys.push(`items:${cls}`);
  return keys;
}

/** PURE: the home page's search for a name (and a section, when it is one of the index's). */
export function encyclopediaSearchHref(name, section = '', index = null) {
  const q = String(name || '').trim();
  if (!q) return ENCYCLOPEDIA_HOME;
  const p = new URLSearchParams({ q });
  if (section && (!index || index.sections.includes(section))) p.set('s', section);
  return `${ENCYCLOPEDIA_HOME}?${p}`;
}

/**
 * PURE: a thing's page in the index, or '' when it has none (or the index is not loaded).
 * A subject is { section: 'skills' | 'quests', id }, { section: 'places', name, hubId } (a
 * region, by its name on the map), or { id } for a class (an item, an animal, a person).
 */
export function encyclopediaPage(index, subject) {
  if (!index || !subject) return '';
  const { section = '', id = '', name = '', hubId = '' } = subject;
  if (section === 'places') {
    const found = index.places.get(foldName(name)) || [];
    if (found.length > 1 && hubId !== '') return (found.find((p) => p.id.endsWith(`-${hubId}`)) || found[0]).h;
    return found[0]?.h || '';
  }
  if (section) return index.pages.get(`${section}:${id}`) || '';
  for (const key of classPageKeys(id)) {
    const h = index.pages.get(key);
    if (h) return h;
  }
  return '';
}

/**
 * PURE: where the `i` key goes for a subject: its page, else a search for its name, else the home
 * page. With no index yet, the search (the home page finds the page by its name).
 */
export function encyclopediaHref(index, subject) {
  if (!subject) return ENCYCLOPEDIA_HOME;
  const page = encyclopediaPage(index, subject);
  if (page) return page;
  return encyclopediaSearchHref(subject.name, subject.section || '', index);
}

/** The `i` keydown: a plain i (either case), never with Ctrl, Alt or Cmd (the browser's), never held. */
export function isEncyclopediaKey(e) {
  return Boolean(e) && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && String(e.key || '').toLowerCase() === 'i';
}

/**
 * The game's Encyclopedia: the index (loaded once, on load() or the first open), the links and
 * the window. `fetchJson(url)` resolves to the parsed index; `openWindow(url, name)` is
 * window.open; `resolve(href)` makes an address absolute (against the page's <base>).
 * `onReady()` runs once the index is in, so open sheets can draw their links.
 */
export function createEncyclopedia({
  fetchJson = (url) => globalThis.fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
  openWindow = (url, name) => globalThis.open?.(url, name) || null,
  resolve = (href) => new URL(href, globalThis.document?.baseURI || globalThis.location?.href).href,
  onReady = () => {},
  wait = 4000,
} = {}) {
  let index = null;
  let loading = null;

  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = Promise.resolve()
      .then(() => fetchJson(ENCYCLOPEDIA_INDEX))
      .then((json) => {
        index = buildEncyclopediaIndex(json);
        try { onReady(index); } catch { /* a sheet that fails to redraw keeps the index */ }
        return index;
      })
      .catch(() => null)
      .finally(() => { loading = null; });
    return loading;
  }

  /** A thing's page, absolute, or '' when it has none or the index is not in yet. */
  function pageFor(subject) {
    const h = encyclopediaPage(index, subject);
    return h ? resolve(h) : '';
  }

  /**
   * Open the Encyclopedia for a subject (null: the home page). The window opens now, inside the
   * key press or click, so no pop-up blocker stops it; before the index is in it opens empty and
   * goes to the page once the index answers (the search after `wait` ms or a failed load).
   * Returns the address it went to, or a promise of it.
   */
  function open(subject = null) {
    if (!subject || index) {
      const url = resolve(encyclopediaHref(index, subject));
      const w = openWindow(url, ENCYCLOPEDIA_WINDOW);
      w?.focus?.();
      return url;
    }
    const w = openWindow('', ENCYCLOPEDIA_WINDOW);
    w?.focus?.();
    let timer = null;
    const late = new Promise((done) => { timer = setTimeout(() => done(null), wait); });
    return Promise.race([load(), late]).then((got) => {
      clearTimeout(timer);
      const url = resolve(encyclopediaHref(got || null, subject));
      if (w && !w.closed) {
        try { w.location.href = url; } catch { openWindow(url, ENCYCLOPEDIA_WINDOW); }
      } else openWindow(url, ENCYCLOPEDIA_WINDOW);
      return url;
    });
  }

  /**
   * "In the Encyclopedia" for a subject with a page, as an <a> that opens the Encyclopedia's
   * window (it works with the middle button and the keyboard too); null when there is no page.
   */
  function link(doc, subject, className = '') {
    const href = pageFor(subject);
    if (!href || !doc?.createElement) return null;
    const a = doc.createElement('a');
    a.className = `ency-link${className ? ` ${className}` : ''}`;
    a.href = href;
    a.target = ENCYCLOPEDIA_WINDOW;
    a.title = ENCYCLOPEDIA_TIP;
    a.dataset.encyclopedia = encyclopediaPage(index, subject);
    a.textContent = ENCYCLOPEDIA_LINK_LABEL;
    return a;
  }

  /** The same link as markup, for cards drawn from strings ('' when there is no page). */
  function linkMarkup(subject, className = '') {
    const href = pageFor(subject);
    if (!href) return '';
    const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<a class="ency-link${className ? ` ${attr(className)}` : ''}" href="${attr(href)}" target="${ENCYCLOPEDIA_WINDOW}" title="${ENCYCLOPEDIA_TIP}" data-encyclopedia="${attr(encyclopediaPage(index, subject))}">${ENCYCLOPEDIA_LINK_LABEL}</a>`;
  }

  return {
    load,
    open,
    link,
    linkMarkup,
    pageFor,
    get ready() {
      return Boolean(index);
    },
    get index() {
      return index;
    },
  };
}
