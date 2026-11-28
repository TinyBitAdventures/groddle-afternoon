/**
 * What's new (#745, Austin 2026-11-27, option 3): on every load the loading card shows what
 * changed, a few short lines under the progress bar, while the game loads. Ours: Glitch had nothing
 * like it (only its "Reload is Coming" debuff before a deploy).
 *
 * - play/whats-new.json (tools/release/whats-new.mjs writes it at each release, from the same
 *   Emoji-Log draft as the release notes) lists the releases, newest first: { version, date, lines }.
 * - This browser remembers the newest version it loaded and when (localStorage, SEEN_KEY). On a load
 *   with a newer one, the card shows the top SHOW_LINES lines: across every release since the last
 *   visit when that visit was within ROLL_UP_MS, else the newest release's alone.
 * - Every other load (a first visit, or the same version again) shows the newest release's top
 *   SHOW_LINES lines ("New in vX.Y"): Austin 2026-11-27, always show the latest.
 * - Nothing waits for it: on a fast load the card may be gone before the lines arrive.
 *
 * - The card's "See all notes" asks for the What's new window (js/ui/whats-new-window.js), which opens
 *   only when the player asks: from there or from the Menu, never by itself (Austin 2026-11-27).
 *
 * Pure parts (whatsNewFor, validateWhatsNew) are tested in tests/whats-new.test.js; js/boot-progress.js
 * starts it as the card comes up, on both play pages.
 *
 * The fast boot fallback (#745, Austin 2026-11-28: "if the loading screen boots faster than 3 seconds
 * we should fall back to show the What's new link somewhere"). Ours. The card times how long its lines
 * were up (from the moment they went on a showing card to game.js's noteWhatsNewBootEnd). On a first
 * look at a new release (firstLookVersion: this browser had loaded an older one) whose lines were up
 * under FALLBACK_MIN_MS, and the player did not press See all notes, offerWhatsNewFallback shows a
 * quiet "What's new in vX.Y" link once for that version (FALLBACK_KEY): on the start card when it is
 * up, else an Activity line with the link and a short notice. The link opens the What's new window at
 * that version (js/ui/whats-new-window.js). Tested in tests/whats-new-fallback-745.test.js.
 */

/** The file the release writes, from the site root (the play pages' <base>): the newest KEEP_RELEASES releases. */
export const WHATS_NEW_PATH = 'play/whats-new.json';
/**
 * Every release since v0.1.0, the same format: only the What's new window's All versions list fetches
 * it (js/ui/whats-new-window.js), so the loading card reads the short file on every load.
 */
export const WHATS_NEW_ALL_PATH = 'play/whats-new-all.json';
export const WHATS_NEW_FORMAT = 'groddle-whats-new/1';
/** The newest version this browser loaded and when: { version, at }. */
export const SEEN_KEY = 'groddle-whats-new-seen';
/** A visit within this long rolls up every release since; an older one sees the newest release only. */
export const ROLL_UP_MS = 7 * 24 * 60 * 60 * 1000;
export const SHOW_LINES = 3;
/** A release lists at most this many lines; each at most MAX_LINE characters. */
export const MAX_LINES = 5;
export const MAX_LINE = 110;
/** The short file keeps this many releases (older ones are never rolled up: they are past a week). */
export const KEEP_RELEASES = 20;
/** The fallback link shows when the card's lines were up for less than this (Austin 2026-11-28: 3 seconds). */
export const FALLBACK_MIN_MS = 3000;
/** The version whose fallback link already showed in this browser: { version }. */
export const FALLBACK_KEY = 'groddle-whats-new-fallback';

const VERSION = /^v(\d+)\.(\d+)\.(\d+)$/;

/** v0.78.0 reads "v0.78"; a patch keeps its third number (v0.78.1). */
export const shortVersion = (v) => String(v).replace(/^(v\d+\.\d+)\.0$/, '$1');

/** The words (plain, no em dashes). */
export const WHATS_NEW_TEXT = Object.freeze({
  one: (v) => `New in ${shortVersion(v)}`,
  since: (v) => `New since ${shortVersion(v)}`,
  more: 'See all notes',
  queued: 'The notes open once the game is ready.',
  link: (v) => `What's new in ${shortVersion(v)}`,
  // Classic's chat column heads the same log "Local Chat" (js/classic/ui-mode.js restyles the drawer).
  notice: (v, classic = false) => `Updated to ${shortVersion(v)}. What's new is in ${classic ? 'Local Chat' : 'Activity'}.`,
});

/**
 * The loading card's "See all notes" asks for the What's new window (js/ui/whats-new-window.js), which
 * opens it once the game is ready; nothing leaves the page. The request is kept on <html> as
 * data-whats-new="queued" (the window may not be loaded yet), and this event tells a window already
 * installed.
 */
export const WHATS_NEW_REQUEST_EVENT = 'groddle-whats-new-request';

export function requestWhatsNew(doc = globalThis.document) {
  const root = doc?.documentElement;
  if (root?.dataset) root.dataset.whatsNew = 'queued';
  try {
    doc?.dispatchEvent?.(new Event(WHATS_NEW_REQUEST_EVENT));
  } catch {
    /* no Event (a test's document): the window finds the flag when it installs */
  }
}

/** True while a request waits. */
export const whatsNewRequested = (doc = globalThis.document) => doc?.documentElement?.dataset?.whatsNew === 'queued';

/** Takes the waiting request (true when there was one). */
export function takeWhatsNewRequest(doc = globalThis.document) {
  if (!whatsNewRequested(doc)) return false;
  delete doc.documentElement.dataset.whatsNew;
  return true;
}

/** Sorts versions: negative when a is older than b. Unknown versions sort oldest. */
export function compareVersions(a, b) {
  const x = VERSION.exec(String(a || ''));
  const y = VERSION.exec(String(b || ''));
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

/** The file's well-formed releases, newest first. */
export function releasesOf(data) {
  const list = Array.isArray(data?.releases) ? data.releases : [];
  return list
    .filter((r) => r && VERSION.test(String(r.version || '')) && Array.isArray(r.lines))
    .map((r) => ({ version: r.version, date: String(r.date || ''), lines: r.lines.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim()) }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * PURE: what the card shows on this load (null only with no release to show). `seen` is what this
 * browser stored ({ version, at }) or null on a first visit.
 */
export function whatsNewFor(data, seen, now = Date.now()) {
  const releases = releasesOf(data);
  const newest = releases[0];
  if (!newest) return null;
  const last = seen && typeof seen === 'object' ? String(seen.version || '') : '';
  // Austin 2026-11-27: always show the latest. Only an update since a recent visit rolls up.
  const updated = VERSION.test(last) && compareVersions(newest.version, last) > 0;
  const at = Number(seen?.at);
  const recent = updated && Number.isFinite(at) && at <= now && now - at <= ROLL_UP_MS;
  const pick = recent ? releases.filter((r) => compareVersions(r.version, last) > 0) : [newest];
  const shown = [];
  for (const r of pick) for (const text of r.lines) if (shown.length < SHOW_LINES) shown.push({ text, version: r.version });
  if (!shown.length) return null;
  const from = new Set(shown.map((s) => s.version));
  return {
    title: from.size > 1 ? WHATS_NEW_TEXT.since(last) : WHATS_NEW_TEXT.one(shown[0].version),
    lines: shown.map((s) => s.text),
    version: newest.version,
  };
}

/**
 * PURE: the newest version when this load is the player's first look at it (this browser had loaded an
 * older version), else ''. A first visit, or the same version again, is not a first look at an update.
 */
export function firstLookVersion(data, seen) {
  const newest = releasesOf(data)[0];
  const last = seen && typeof seen === 'object' ? String(seen.version || '') : '';
  return newest && VERSION.test(last) && compareVersions(newest.version, last) > 0 ? newest.version : '';
}

/**
 * PURE: the version whose fallback link to show, or ''. `version` is firstLookVersion's, `shownMs` how
 * long the card's lines were up, `held` true once the player pressed See all notes, `done` the version
 * whose link already showed (FALLBACK_KEY).
 */
export function fallbackVersion({ version = '', shownMs = 0, held = false, done = '' } = {}) {
  if (!VERSION.test(String(version || '')) || held || String(done || '') === version) return '';
  return Number(shownMs) < FALLBACK_MIN_MS ? version : '';
}

/** PURE: what to store after this load: the newest version seen (never backwards) and now. */
export function nextSeen(data, seen, now = Date.now()) {
  const newest = releasesOf(data)[0];
  if (!newest) return null;
  const last = String(seen?.version || '');
  const version = VERSION.test(last) && compareVersions(last, newest.version) > 0 ? last : newest.version;
  return { version, at: now };
}

/**
 * PURE: the problems with a whats-new file ([] when it is fine): its format, versions newest first and
 * each once, a date, one to MAX_LINES lines a release, each short, plain (no em or en dashes) and
 * free of paths, links and ticket numbers. `all` is the whole history (WHATS_NEW_ALL_PATH): no cap on
 * how many releases it keeps.
 */
export function validateWhatsNew(data, { all = false } = {}) {
  const out = [];
  if (!data || typeof data !== 'object') return ['not a JSON object'];
  if (data.format !== WHATS_NEW_FORMAT) out.push(`format is not ${WHATS_NEW_FORMAT}`);
  if (!Array.isArray(data.releases) || !data.releases.length) return [...out, 'no releases'];
  if (!all && data.releases.length > KEEP_RELEASES) out.push(`more than ${KEEP_RELEASES} releases`);
  data.releases.forEach((r, i) => {
    const v = r?.version;
    if (!VERSION.test(String(v || ''))) out.push(`release ${i}: version ${JSON.stringify(v)} is not vX.Y.Z`);
    else if (i > 0 && compareVersions(data.releases[i - 1]?.version, v) <= 0) out.push(`${v}: not newest first`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r?.date || ''))) out.push(`${v}: date is not YYYY-MM-DD`);
    if (!Array.isArray(r?.lines)) {
      out.push(`${v}: lines is not a list`);
      return;
    }
    if (r.lines.length > MAX_LINES) out.push(`${v}: more than ${MAX_LINES} lines`);
    if (!r.lines.length) out.push(`${v}: no lines`);
    for (const line of r.lines) {
      if (typeof line !== 'string' || !line.trim()) out.push(`${v}: an empty line`);
      else if (line.length > MAX_LINE) out.push(`${v}: longer than ${MAX_LINE}: ${line}`);
      else if (/[–—]/.test(line)) out.push(`${v}: a dash a player should not see: ${line}`);
      else if (/\/Users\/|\/home\/|https?:|\(\w{7,12}\)$/.test(line)) out.push(`${v}: a path, link or commit: ${line}`);
      else if (/#\d/.test(line)) out.push(`${v}: a ticket number: ${line}`);
    }
  });
  return out;
}

function readSeen(storage) {
  try {
    const v = JSON.parse(storage?.getItem(SEEN_KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function writeSeen(storage, value) {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(value));
  } catch {
    /* private window or storage off: the next load is a first visit again, which shows the newest release */
  }
}

/** This load's card timing, per document: when the lines went up, when the card went, the fetch. */
const boots = new WeakMap();
function bootOf(doc) {
  let b = boots.get(doc);
  if (!b) {
    b = { shownAt: null, endedAt: null, held: false, version: '', loaded: null, offered: false };
    boots.set(doc, b);
  }
  return b;
}
const clockNow = () => globalThis.performance?.now?.() ?? Date.now();

/** True while the loading card is on screen (not hidden, not fading out, the page still booting). */
function cardShowing(doc) {
  const loader = doc?.getElementById?.('boot-loader');
  if (!loader || loader.hidden || loader.classList?.contains?.('is-leaving')) return false;
  return !doc.body?.classList || doc.body.classList.contains('is-booting');
}

/** game.js: the loading card is going now (its lines stop being readable). */
export function noteWhatsNewBootEnd(doc = globalThis.document, at = clockNow()) {
  const b = bootOf(doc);
  if (b.endedAt == null) b.endedAt = at;
}

/** How long this load's lines were up on the card, in ms (0 when they never showed). */
export function whatsNewShownMs(doc = globalThis.document, at = clockNow()) {
  const b = bootOf(doc);
  if (b.shownAt == null) return 0;
  return Math.max(0, (b.endedAt ?? at) - b.shownAt);
}

function readDone(storage) {
  try {
    return String(JSON.parse(storage?.getItem(FALLBACK_KEY) || 'null')?.version || '');
  } catch {
    return '';
  }
}

/** The quiet link: a button the What's new window answers (data-whats-new-version, installWhatsNewWindow). */
export function whatsNewLinkHtml(version) {
  const v = String(version).replace(/[^\w.]/g, '');
  return `<button type="button" class="whats-new-link" data-whats-new-version="${v}">${WHATS_NEW_TEXT.link(v).replace(/'/g, '&#39;')}</button>`;
}

/** The start card ("Welcome to a scrap of Ur", #overlay) when it is up or coming in, else null. */
function startCardOf(doc) {
  const overlay = doc?.getElementById?.('overlay');
  if (!overlay || overlay.hidden || overlay.classList?.contains?.('hidden')) return null;
  return overlay.querySelector?.('.start-main') || null;
}

/** Puts the link on the start card, under its actions. Returns the line. */
function mountStartCardLink(doc, main, version) {
  main.querySelector?.('.start-news')?.remove?.();
  const line = doc.createElement('p');
  line.setAttribute('class', 'start-news');
  const link = doc.createElement('button');
  link.setAttribute('type', 'button');
  link.setAttribute('class', 'whats-new-link');
  link.setAttribute('data-whats-new-version', version);
  link.textContent = WHATS_NEW_TEXT.link(version);
  line.append(link);
  const actions = main.querySelector?.('.start-actions');
  if (actions && typeof main.insertBefore === 'function') main.insertBefore(line, actions.nextSibling || null);
  else main.append(line);
  return line;
}

/**
 * game.js, as the loading card goes: once this load's notes are in, shows the fallback link when
 * fallbackVersion says so (and remembers the version, so it shows once). `log(text, html)` writes the
 * Activity line, `notice(text)` raises the short notice; both are used only when the start card is
 * not up. Resolves to where it went ('start', 'activity') or ''. Never throws.
 */
export async function offerWhatsNewFallback(doc = globalThis.document, {
  storage = storageOf(globalThis),
  log = null,
  notice = null,
  now = clockNow,
} = {}) {
  try {
    const b = bootOf(doc);
    if (b.offered) return '';
    b.offered = true;
    await b.loaded;
    const version = fallbackVersion({ version: b.version, shownMs: whatsNewShownMs(doc, now()), held: b.held, done: readDone(storage) });
    if (doc?.documentElement?.dataset) doc.documentElement.dataset.whatsNewShownMs = String(Math.round(whatsNewShownMs(doc, now())));
    if (!version) return '';
    try {
      storage?.setItem(FALLBACK_KEY, JSON.stringify({ version }));
    } catch {
      /* storage off: the next load is no first look anyway (the seen version is stored, or nothing is) */
    }
    const main = startCardOf(doc);
    let where = '';
    if (main) {
      mountStartCardLink(doc, main, version);
      where = 'start';
    } else if (typeof log === 'function') {
      log(WHATS_NEW_TEXT.link(version), whatsNewLinkHtml(version));
      if (typeof notice === 'function') notice(WHATS_NEW_TEXT.notice(version, doc?.documentElement?.dataset?.ui === 'classic'));
      where = 'activity';
    }
    if (where && doc?.documentElement?.dataset) doc.documentElement.dataset.whatsNewFallback = `${where}:${version}`;
    return where;
  } catch {
    return '';
  }
}

/** Puts the lines on the loading card (#boot-loader). Returns the section, or null with no card. */
export function mountWhatsNew(doc, shown) {
  const card = doc?.getElementById?.('boot-loader')?.querySelector?.('.boot-loader-card');
  if (!card || !shown) return null;
  card.querySelector('.boot-loader-news')?.remove();
  const section = doc.createElement('section');
  section.className = 'boot-loader-news';
  const h = doc.createElement('h3');
  h.textContent = shown.title;
  const list = doc.createElement('ul');
  for (const text of shown.lines) {
    const li = doc.createElement('li');
    li.textContent = text;
    list.append(li);
  }
  // "See all notes": the What's new window once the game is ready, never a page away from it.
  const more = doc.createElement('button');
  more.type = 'button';
  more.className = 'boot-loader-news-more';
  more.textContent = WHATS_NEW_TEXT.more;
  more.addEventListener('click', () => {
    // The player asked for the notes: the window opens once the game is ready, so no fallback link.
    bootOf(doc).held = true;
    requestWhatsNew(doc);
    more.textContent = WHATS_NEW_TEXT.queued;
    more.disabled = true;
  });
  section.append(h, list, more);
  card.append(section);
  card.classList.add('has-news');
  return section;
}

function storageOf(win) {
  try {
    return win?.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Fetches the notes, shows what is new on the loading card, and remembers this version. Never throws;
 * a failed fetch changes nothing. Resolves to what it showed (or null).
 */
export function startWhatsNew(doc = globalThis.document, opts = {}) {
  const run = loadWhatsNew(doc, opts);
  if (doc && typeof doc === 'object') bootOf(doc).loaded = run;
  return run;
}

async function loadWhatsNew(doc, {
  fetch: fetchFn = globalThis.fetch?.bind(globalThis),
  storage = storageOf(globalThis),
  now = () => Date.now(),
  clock = clockNow,
} = {}) {
  try {
    if (!doc?.getElementById?.('boot-loader') || typeof fetchFn !== 'function') return null;
    const res = await fetchFn(new URL(WHATS_NEW_PATH, doc.baseURI).href);
    if (!res?.ok) return null;
    const data = await res.json();
    const seen = readSeen(storage);
    const t = now();
    const shown = whatsNewFor(data, seen, t);
    const b = bootOf(doc);
    b.version = firstLookVersion(data, seen);
    // The lines are readable from now only when the card is still up (a fast load may have gone already).
    const up = cardShowing(doc);
    if (shown) mountWhatsNew(doc, shown);
    if (shown && up && b.shownAt == null) b.shownAt = clock();
    const next = nextSeen(data, seen, t);
    if (next) writeSeen(storage, next);
    return shown;
  } catch {
    return null;
  }
}
