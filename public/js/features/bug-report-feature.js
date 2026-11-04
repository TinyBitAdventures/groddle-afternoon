/**
 * Report a bug, in multiplayer. The original client put a bug icon in the
 * game header (GameHeaderUI.as 47-69, tip "Report a bug"; the icon is
 * TSEngineAssets graphics/bug_icon.png from Tiny Speck's released client,
 * CC0) and opened a small form over the game (BootError.as 280-290: "Thanks
 * for reporting a bug!", "Please describe the problem you are having:", Send,
 * Close). Sending attached what the client knew (session details, the last
 * messages and errors, 405-411); here that is the street, the player's place,
 * the build, the browser and the last errors the page saw.
 *
 * TICKETS (2026-10-30): each report is a ticket the administrators answer
 * (groddle-afternoon-site src/Tickets.php, groddle/v1/tickets; the console's
 * Reports tab). The icon opens the Reports sheet (js/ui/reports-sheet.js):
 * your reports with their status and a dot for a new reply, each thread with
 * a reply box and Close report, and New report (the original's form, the
 * same context). The icon carries a badge while a reply is unread: asked when
 * the game starts, when the sheet opens, and every UNREAD_POLL_MS while the
 * page is in view (the realtime server has no per-player channel to push it
 * on). A reply email's link (/play/online/#report=<id>) opens that thread.
 * Solo has no account to send from: in solo this feature draws nothing.
 *
 * A picture of the game (Austin 2026-10-30): New report draws the game as it
 * is (capturePicture: engine.snapshotView, the Pixi stage through the
 * renderer's extract, the location view only) to a JPEG at most 1280 wide,
 * quality 0.8 and lower or narrower until it is under 300 KiB, and the form
 * sends it unless the player unticks Attach a picture of the game. What it
 * holds is what the canvas draws: the street, the player, other players'
 * avatars with their name plates, and speech bubbles (local chat said aloud).
 * The HUD, the chat dock, Activity and every window are page elements and are
 * never in it.
 *
 * With the game's UI (player report 2026-11-01, Austin's design): Include the
 * game's UI, ticked by default, draws the whole game window instead
 * (capturePictureWithUi): the page (#wrap) through modern-screenshot 4.7.0
 * (MIT, public/vendor/modern-screenshot, imported only when that picture is
 * first drawn), with the canvas's own picture in place of the WebGL canvas
 * (engine.snapshotCanvas: render then extract). The Reports window and its
 * scrim are left out; chat, mail, Activity and group chat keep their boxes
 * with the words blanked (REPORT_MASK), since they hold other players' names
 * and words. The same size and JPEG budget as before. The report's context
 * names the windows that were open (openPanels: "donate:mab", "make:gassifier").
 *
 * Ticket 73 (Safari 26.5: "Drawing the picture..." and no typing until it
 * loaded): the canvas is read once as the form opens (captureFrame), the world
 * picture is its location view, and the picture with the UI is drawn from that
 * same frame later, when the player pauses typing or presses Send
 * (js/ui/reports-sheet.js UI_IDLE_MS). Measured there, nearly all of that
 * drawing is the library copying each element's computed style; WebKit lists
 * every CSS custom property (the design tokens) in it, so only the standard
 * properties are copied (STYLE_NAMES): the custom ones are already resolved
 * into the standard values.
 *
 * Over other windows (the same report): a window's scrim covers the top bar,
 * so the bug icon could not be clicked while Donate or another window was
 * open. While anything covers it, a copy of the icon (#bug-btn-lift) sits on
 * top at the same place and opens the sheet over the window.
 *
 * QA: canvas data bugReport (closed|open|sending), bugReportLast (the last
 * line shown), reportsView (list|thread|new), reportsUnread (n);
 * window.groddleBugReport.open('list'|'new'), .openTicket(id), .refresh() in multiplayer.
 */

import { createReportsApi, REPORT_PICTURE, REPORT_TEXT, UNREAD_POLL_MS, base64Size, pictureSize, reportFromHash } from '../reports.js?v=7744973e';
import { mountReportsSheet } from '../ui/reports-sheet.js?v=b94f8fd4';

export const BUG_REPORT_FEATURE_ID = 'bug-report';

/** Ticket 62: the key that opens the Reports sheet (game.js keydown; the client had none). */
export const REPORT_KEY = 'R';

/** The words: the source's where it had them, short plain ones of ours where it did not (js/reports.js has the sheet's). */
export const BUG_TEXT = Object.freeze({
  tip: REPORT_TEXT.tip,
  title: REPORT_TEXT.title,
  label: REPORT_TEXT.label,
  send: REPORT_TEXT.send,
  close: REPORT_TEXT.close,
  sending: REPORT_TEXT.sending,
  sent: REPORT_TEXT.sent,
  empty: REPORT_TEXT.empty,
  failed: REPORT_TEXT.failed,
});

/** As the site keeps them (BugReports.php MAX_MESSAGE, MAX_ERRORS). */
export const MAX_MESSAGE = 4000;
const MAX_ERRORS = 10;

/** The page's last errors, newest last, each cut short. */
export function rememberError(list, text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!line) return list;
  list.push(line);
  if (list.length > MAX_ERRORS) list.splice(0, list.length - MAX_ERRORS);
  return list;
}

/** The build the page runs: game.js's content key (tools/module-keys; the online page names it on #online-boot). */
export function buildKey(doc = globalThis.document) {
  const src = doc?.getElementById?.('online-boot')?.dataset?.game
    || doc?.querySelector?.('script[src*="game.js"]')?.getAttribute?.('src') || '';
  const m = /[?&]v=([^&"]+)/.exec(src);
  return m ? m[1] : '';
}

/** Where the words of other players show: kept as boxes, their text blanked, in a picture with the UI. */
export const REPORT_MASK = Object.freeze([
  '#local-chat-stream', '#local-chat-input', '#activity-history', '.social-log', '.social-compose',
  '.grp-lines', '#mp-log', '#mail-list', '#mail-reader', '.mail-compose-form',
]);

/** Never in the picture: the Reports window itself and the icon's copy over windows. */
export const REPORT_LEAVE_OUT = Object.freeze(['bug-report-panel', 'bug-btn-lift']);

/** The names a report gives the windows (their element ids without "-panel", unless named here). */
const PANEL_NAMES = Object.freeze({ 'shrine-panel': 'donate', 'quest-dialogue': 'conversation', 'verb-menu': 'verbs', 'pack-popover': 'item' });
const PANEL_SELECTOR = '.side-panel, .ui-sheet, .glitch-modal, .home-panel, .mail-panel, .map-panel, #verb-menu, #pack-popover, #quest-dialogue';

const visible = (n) => Boolean(n && !n.hidden && n.getClientRects?.().length && globalThis.getComputedStyle?.(n)?.visibility !== 'hidden');
const slug = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);

/**
 * The windows open when the report was written, e.g. ["donate:mab", "make:gassifier/heavy gas", "map"]:
 * a picture can miss what the player saw, the list cannot.
 */
export function openPanels(doc = globalThis.document) {
  const out = [];
  const seen = new Set();
  for (const n of doc?.querySelectorAll?.(PANEL_SELECTOR) || []) {
    if (!n.id || REPORT_LEAVE_OUT.includes(n.id) || seen.has(n.id) || !visible(n)) continue;
    seen.add(n.id);
    let name = PANEL_NAMES[n.id] || n.id.replace(/-panel$/, '');
    if (n.id === 'make-panel') {
      const tool = slug(n.querySelector('.make-tool-chip.active')?.textContent);
      const recipe = slug(n.querySelector('#make-title')?.textContent).replace(/^make\s*/, '');
      if (tool) name += `:${tool}`;
      if (recipe) name += `/${recipe}`;
    } else if (n.id === 'shrine-panel') {
      const giant = slug(n.querySelector('h2')?.textContent).replace(/^shrine to\s*/, '');
      if (giant) name += `:${giant}`;
    } else if (n.id === 'vendor-panel') {
      const tab = slug(n.querySelector('[aria-selected="true"], .active')?.textContent);
      if (tab) name += `:${tab}`;
    }
    out.push(name);
  }
  return out;
}

/** What the report carries besides the player's words. */
export function reportContext(engine, errors = [], env = globalThis) {
  const p = engine?.player;
  const street = engine?.street;
  let panels = '';
  try { panels = openPanels(env.document).join(', ').slice(0, 300); } catch { panels = ''; }
  return {
    street: String(engine?.streetTsid || ''),
    streetName: String(street?.label || street?.name || ''),
    x: Number.isFinite(p?.x) ? String(Math.round(p.x)) : '',
    y: Number.isFinite(p?.y) ? String(Math.round(p.y)) : '',
    build: buildKey(env.document),
    page: String(env.location?.pathname || ''),
    agent: String(env.navigator?.userAgent || '').slice(0, 300),
    screen: env.innerWidth ? `${env.innerWidth}x${env.innerHeight}` : '',
    panels,
    errors: errors.slice(-MAX_ERRORS),
  };
}

/**
 * The canvas drawn once as a report opens (ticket 73): the whole canvas (the location view and
 * the strip under the pack), at least as wide as it shows and as the picture can be, with the
 * "Enter: choose" hint left out (engine.snapshotCanvas: render then extract). Both pictures come
 * from it: the world one is its location view, and the one with the UI draws it in place of the
 * WebGL canvas, so the canvas is read back once, not twice. Null before the renderer starts.
 */
export function captureFrame(engine, doc = globalThis.document, limits = REPORT_PICTURE) {
  const canvas = doc?.querySelector?.('#game-root canvas');
  const cssW = canvas?.getBoundingClientRect?.().width || canvas?.clientWidth || 0;
  const viewW = Number(engine?.camera?.w) || 0;
  const width = Math.max(cssW, Math.min(viewW || cssW, limits.maxWidth));
  let frame = null;
  try { frame = engine?.snapshotCanvas?.(width ? { width } : {}) || null; } catch { frame = null; }
  return frame?.width && frame?.height ? frame : null;
}

/** PURE: the rows of a frame that hold the location view (camera h of camera w, the frame's width across). */
export function viewRows(frameW, frameH, camera) {
  const w = Number(camera?.w) || 0;
  const h = Number(camera?.h) || 0;
  if (!(frameW > 0 && frameH > 0)) return 0;
  if (!(w > 0 && h > 0)) return frameH;
  return Math.max(1, Math.min(frameH, Math.round((h * frameW) / w)));
}

/**
 * The game's canvas as a report's picture: { url, width, height, bytes, frame } (a JPEG data
 * URL of the location view; `frame`, not enumerable, is the whole canvas for the picture with
 * the UI), or null when the view cannot be drawn or never fits.
 */
export function capturePicture(engine, doc = globalThis.document, limits = REPORT_PICTURE) {
  const frame = captureFrame(engine, doc, limits);
  if (!frame) return null;
  const out = encodePicture(frame, doc, limits, viewRows(frame.width, frame.height, engine?.camera));
  if (out) Object.defineProperty(out, 'frame', { value: frame });
  return out;
}

/** A drawn view (a canvas; its top `rows` only, when given) as the report's JPEG within the site's limits, or null. */
export function encodePicture(view, doc = globalThis.document, limits = REPORT_PICTURE, rows = 0) {
  if (!view?.width || !view?.height || !doc?.createElement) return null;
  const srcH = rows > 0 ? Math.min(rows, view.height) : view.height;
  for (const widest of limits.widths) {
    const [w, h] = pictureSize(view.width, srcH, Math.min(widest, limits.maxWidth), limits.maxHeight);
    if (!w || !h) return null;
    const c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext?.('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(view, 0, 0, view.width, srcH, 0, 0, w, h);
    for (const q of limits.qualities) {
      let url = '';
      try { url = c.toDataURL(limits.type, q); } catch { return null; }
      if (!url.startsWith('data:image/jpeg;base64,')) return null;
      const bytes = base64Size(url.slice(url.indexOf(',') + 1));
      if (bytes <= limits.maxBytes) return { url, width: w, height: h, bytes };
    }
  }
  return null;
}

/** modern-screenshot, self-hosted and pinned (MIT, public/vendor/modern-screenshot/LICENSE); loaded when first wanted. */
const SHOT_LIB = '../../vendor/modern-screenshot/modern-screenshot-4.7.0.mjs';
let shotLib = null;
const loadShotLib = () => (shotLib ||= import(SHOT_LIB).catch((err) => { shotLib = null; throw err; }));

/** Blanks the words inside a cloned box, keeping the box: every descendant hidden, its own text clear. */
export function maskClone(root, selectors = REPORT_MASK) {
  let n = 0;
  for (const box of root?.querySelectorAll?.(selectors.join(', ')) || []) {
    box.style.color = 'transparent';
    if ('value' in box) box.value = '';
    box.setAttribute?.('placeholder', '');
    for (const d of box.querySelectorAll('*')) d.style.visibility = 'hidden';
    n += 1;
  }
  return n;
}

/** Never copied: the Reports window, and every element not drawn (most of the page is closed windows). */
export function leftOut(node, win = globalThis) {
  if (!node || node.nodeType !== 1) return false;
  if (node.id && REPORT_LEAVE_OUT.includes(node.id)) return true;
  if (node.hidden || node.tagName === 'TEMPLATE' || node.tagName === 'NOSCRIPT') return true;
  try { return win.getComputedStyle?.(node)?.display === 'none'; } catch { return false; }
}

/**
 * Whether a drawn picture came out blank: nearly every pixel pale (WebKit hands back a white page
 * when the copy is too much for it; player report 32 got one), or all one colour. A sample of
 * 48 x 24 pixels; a canvas that cannot be read counts as blank.
 */
export function blankPicture(canvas, doc = globalThis.document) {
  if (!canvas?.width || !canvas?.height || !doc?.createElement) return true;
  try {
    const c = doc.createElement('canvas');
    c.width = 48;
    c.height = 24;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, 48, 24);
    const d = ctx.getImageData(0, 0, 48, 24).data;
    let pale = 0;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) pale += 1;
      const y = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    return pale / (d.length / 4) >= 0.92 || hi - lo < 6;
  } catch {
    return true;
  }
}

/**
 * The standard CSS properties a computed style lists, the custom ones (--*) left out: what the
 * page's copy carries for each element (ticket 73). WebKit lists every custom property in a
 * computed style, and the game's design tokens made each copied element carry them all (about
 * 23 KB each, 6 MB for the window); their values are already resolved into the standard ones.
 * Read once per page; null leaves the library's own list.
 */
let styleNames = null;
export function standardStyleNames(win = globalThis) {
  if (styleNames) return styleNames;
  let cs = null;
  try { cs = win.getComputedStyle?.(win.document.documentElement); } catch { cs = null; }
  const out = [];
  for (let i = 0; i < (cs?.length || 0); i++) {
    const name = cs.item(i);
    if (name && !name.startsWith('--')) out.push(name);
  }
  if (out.length) styleNames = out;
  return styleNames;
}

/** WebKit draws the page's copy again while its pictures decode (the library's fixSvgXmlDecode): a few passes, not one per picture. */
const REDRAWS = 4;

/**
 * The whole game window as a report's picture: the page with its HUD and open windows over
 * the canvas's own picture, the Reports window left out, chat and mail blanked. Resolves to
 * { url, width, height, bytes, ui: true } or null (the caller then sends the world only).
 * `frame` is the canvas as the report opened (captureFrame, ticket 73): the Reports window is
 * modal, so the windows under it are the ones open then, and the canvas is not read again.
 * Kept quick (ticket 30: Safari took most of a minute and froze typing): only what is drawn
 * is copied, the canvas goes in as a JPEG, WebKit redraws a few times instead of once per
 * picture, images that never load (closed windows' lazy ones) are not waited on, and a blank
 * result is refused.
 */
export async function capturePictureWithUi(engine, doc = globalThis.document, limits = REPORT_PICTURE, frame = null) {
  const root = doc?.getElementById?.('wrap') || doc?.body;
  const canvas = doc?.querySelector?.('#game-root canvas');
  if (!root || !canvas) return null;
  const rect = root.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  let lib;
  try { lib = await loadShotLib(); } catch { return null; }
  const cssW = canvas.getBoundingClientRect().width || canvas.clientWidth;
  let world = frame?.width && frame?.height ? frame : null;
  if (!world) { try { world = engine?.snapshotCanvas?.({ width: cssW }); } catch { world = null; } }
  if (!world) return null;
  // A JPEG, not a PNG: a fifth of the bytes for the copy to carry and WebKit to decode.
  const worldUrl = world.toDataURL('image/jpeg', 0.92);
  const [w] = pictureSize(rect.width, rect.height, limits.maxWidth, limits.maxHeight);
  // The library copies a canvas through its toDataURL: the WebGL buffer is empty by then, so the
  // canvas answers with the picture just drawn from the stage while the page is copied.
  const own = Object.prototype.hasOwnProperty.call(canvas, 'toDataURL');
  canvas.toDataURL = () => worldUrl;
  let drawn = null;
  try {
    const bg = globalThis.getComputedStyle?.(doc.body)?.backgroundColor || '#ffffff';
    let context = null;
    // The library waits for every <img> under the root first; a short wait there (closed windows hold
    // lazy images that never load), the full one for the pictures it copies.
    context = await lib.createContext(root, {
      scale: Math.min(1, w / rect.width),
      backgroundColor: bg,
      timeout: 1500,
      drawImageInterval: 60,
      filter: (node) => !leftOut(node),
      includeStyleProperties: standardStyleNames(),
      onCloneNode: (clone) => { maskClone(clone); },
      onEmbedNode: () => { if (context) context.drawImageCount = Math.min(context.drawImageCount, REDRAWS); },
    });
    context.timeout = 8000;
    try {
      drawn = await lib.domToCanvas(context);
    } finally {
      try { lib.destroyContext?.(context); } catch { /* gone */ }
    }
  } catch {
    drawn = null;
  } finally {
    if (!own) delete canvas.toDataURL;
  }
  if (!drawn || blankPicture(drawn, doc)) return null;
  const out = encodePicture(drawn, doc, limits);
  return out ? { ...out, ui: true } : null;
}

const STYLE = `
.bug-btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--sp-2) 0.45rem; position: relative; }
.bug-btn img { width: 23px; height: 20px; display: block; }
.bug-btn .bug-unread[hidden], .reports-panel[hidden], .reports-view[hidden], .reports-panel [hidden] { display: none !important; }
[data-ui="modern"] #game-root #bug-report-panel { position: absolute; inset: 0; z-index: calc(var(--z-modal) + 32); display: grid; place-items: center; padding: calc(var(--hud-h) + 12px) var(--hud-inset) calc(var(--pack-live-height, 72px) + 8px); background: var(--scrim); }
[data-ui="modern"] #bug-report-panel .reports-card { display: flex; flex-direction: column; width: min(560px, 100%); height: min(620px, 100%); max-height: 100%; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-l); background: var(--surface); box-shadow: var(--shadow-3); color: var(--text); font-family: var(--font-ui); font-size: var(--fs-m); animation: ui-sheet-center-in var(--motion-med) var(--ease-out); }
[data-ui="modern"] #bug-report-panel .reports-head { flex: none; flex-wrap: nowrap; }
[data-ui="modern"] #bug-report-panel .reports-head h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-ui="modern"] #bug-report-panel .ui-sheet-icon { width: 23px; }
[data-ui="modern"] #bug-report-panel .reports-back { flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; margin: 0; padding: 0; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--text); font: var(--fw-heavy) var(--fs-2xl)/var(--lh-none) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-back:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel :is(.reports-new, .reports-btn) { flex: none; display: inline-flex; align-items: center; justify-content: center; min-height: 32px; margin: 0; padding: 0 var(--space-4); border: 1px solid var(--accent); border-radius: var(--radius-pill); background: var(--accent); color: var(--text-inverse); font: var(--fw-heavy) var(--fs-s)/var(--lh-tight) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel :is(.reports-new, .reports-btn):hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
[data-ui="modern"] #bug-report-panel .reports-btn.is-quiet { border-color: var(--border-strong); background: var(--surface-raised); color: var(--text); }
[data-ui="modern"] #bug-report-panel .reports-btn.is-quiet:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel :is(button, textarea):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel button:disabled { opacity: 0.55; cursor: default; }
[data-ui="modern"] #bug-report-panel .reports-body { display: flex; flex-direction: column; padding-top: var(--space-2); scrollbar-width: auto; scrollbar-color: auto; }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar { width: 10px; }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar-track { background: var(--surface-sunken); border-radius: var(--radius-pill); }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar-thumb { background: var(--border-strong); border: 2px solid var(--surface-sunken); border-radius: var(--radius-pill); }
[data-ui="modern"] #bug-report-panel .reports-view { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; flex: 1 1 auto; }
[data-ui="modern"] #bug-report-panel .reports-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
[data-ui="modern"] #bug-report-panel .reports-row-btn { display: grid; gap: 2px; width: 100%; margin: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface-raised); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-row-btn:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel .reports-row[data-unread] .reports-row-btn { border-color: var(--accent); }
[data-ui="modern"] #bug-report-panel .reports-row-top { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
[data-ui="modern"] #bug-report-panel .reports-subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--fw-bold); }
[data-ui="modern"] #bug-report-panel .reports-row[data-unread] .reports-subject { font-weight: var(--fw-heavy); }
[data-ui="modern"] #bug-report-panel :is(.reports-line, .reports-when) { color: var(--text-muted); font-size: var(--fs-s); }
[data-ui="modern"] #bug-report-panel .reports-dot { flex: none; width: 9px; height: 9px; border-radius: var(--radius-pill); background: var(--danger); }
[data-ui="modern"] #bug-report-panel .reports-chip { flex: none; padding: 1px var(--space-2); border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-xs); font-weight: var(--fw-heavy); line-height: var(--lh-tight); }
[data-ui="modern"] #bug-report-panel .reports-chip.is-open { background: var(--accent-soft); color: var(--accent); }
[data-ui="modern"] #bug-report-panel .reports-chip.is-answered { color: var(--status-good); }
/* Ticket 49: Working on it, an administrator's mark. */
[data-ui="modern"] #bug-report-panel .reports-chip.is-working { background: color-mix(in srgb, var(--status-warn) 24%, transparent); color: var(--warn); }
[data-ui="modern"] #bug-report-panel .reports-empty { margin: var(--space-4) 0; color: var(--text-muted); line-height: var(--lh-body); text-align: center; }
[data-ui="modern"] #bug-report-panel .reports-thread-head { display: flex; align-items: center; gap: var(--space-2); }
/* Ticket 21: a thread is read in the sheet's one scroller (its body, with a scrollbar you can see), every message at its full height. */
[data-ui="modern"] #bug-report-panel .reports-thread-view { flex: 1 0 auto; }
[data-ui="modern"] #bug-report-panel .reports-messages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: none; }
[data-ui="modern"] #bug-report-panel .reports-msg { flex: none; }
[data-ui="modern"] #bug-report-panel .reports-msg { max-width: 88%; padding: var(--space-2) var(--space-3); border-radius: var(--radius-m); background: var(--surface-sunken); }
[data-ui="modern"] #bug-report-panel .reports-msg.is-admin { align-self: flex-start; border: 1px solid var(--accent); background: var(--surface-raised); }
[data-ui="modern"] #bug-report-panel .reports-msg.is-player { align-self: flex-end; }
[data-ui="modern"] #bug-report-panel .reports-msg-who { margin: 0 0 2px; font-size: var(--fs-s); }
[data-ui="modern"] #bug-report-panel .reports-msg-who time { color: var(--text-muted); }
[data-ui="modern"] #bug-report-panel .reports-msg-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--lh-body); }
/* Ticket 49: Edit on your report until it is read, and its words in a box in place. */
[data-ui="modern"] #bug-report-panel .reports-edit { margin: 0 0 0 var(--space-2); padding: 1px var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface-raised); color: var(--text); font: var(--fw-bold) var(--fs-xs)/var(--lh-tight) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-edit:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel .reports-msg[data-editing] { box-sizing: border-box; width: 88%; display: grid; gap: var(--space-2); }
[data-ui="modern"] #bug-report-panel .reports-edit-text { min-height: 5rem; }
[data-ui="modern"] #bug-report-panel .reports-closed-note { margin: 0; color: var(--text-muted); font-size: var(--fs-s); }
[data-ui="modern"] #bug-report-panel .reports-new-title { margin: 0; font-weight: var(--fw-heavy); font-size: var(--fs-l); }
[data-ui="modern"] #bug-report-panel .reports-label { color: var(--text-muted); font-size: var(--fs-s); }
[data-ui="modern"] #bug-report-panel .reports-text { box-sizing: border-box; width: 100%; resize: vertical; margin: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-m); background: var(--surface-raised); color: var(--text); font: var(--fs-m)/var(--lh-body) var(--font-ui); }
[data-ui="modern"] #bug-report-panel .reports-new-view .reports-text { flex: 1 1 auto; min-height: 7.5rem; }
[data-ui="modern"] #bug-report-panel .reports-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
[data-ui="modern"] #bug-report-panel .reports-picture-row { display: flex; align-items: flex-start; gap: var(--space-3); }
[data-ui="modern"] #bug-report-panel .reports-picture-text { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
[data-ui="modern"] #bug-report-panel .reports-check { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: var(--fw-bold); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-checkbox { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-checkbox:disabled { cursor: default; }
[data-ui="modern"] #bug-report-panel .reports-checkbox:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-hint { margin: 0; color: var(--text-muted); font-size: var(--fs-s); line-height: var(--lh-body); }
/* Ticket 73: the picture at its own shape, big enough to read, a link to the lightbox. */
[data-ui="modern"] #bug-report-panel .reports-picture-thumb { flex: none; display: block; width: 216px; max-width: 45%; border: 1px solid var(--border); border-radius: var(--radius-s); overflow: hidden; line-height: 0; cursor: zoom-in; }
[data-ui="modern"] #bug-report-panel .reports-picture-thumb img { display: block; width: 100%; height: auto; }
[data-ui="modern"] #bug-report-panel .reports-picture-thumb:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-picture { display: block; margin-top: var(--space-2); width: fit-content; max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-s); overflow: hidden; line-height: 0; cursor: zoom-in; }
[data-ui="modern"] #bug-report-panel .reports-picture:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-picture img { display: block; max-width: 100%; width: auto; height: auto; max-height: 180px; }
[data-ui="modern"] #bug-report-panel .reports-status.is-error { color: var(--text-danger); white-space: normal; }
[data-ui="modern"] .top-bar .top-actions .bug-btn .bug-unread { pointer-events: none; }
#bug-btn-lift { position: fixed; z-index: calc(var(--z-modal) + 31); margin: 0; box-sizing: border-box; }
#bug-btn-lift[hidden] { display: none !important; }
#bug-report-panel .reports-check-sub { margin-left: var(--space-5); font-weight: var(--fw-regular); }
#bug-report-panel .reports-check:has(.reports-checkbox:disabled) { opacity: 0.55; cursor: default; }
#bug-report-panel .reports-filter { flex: none; }
#bug-report-panel .reports-filter[hidden] { display: none; }
/* The report's picture over the game (js/ui/picture-lightbox.js, Austin 2026-11-03): fitted to the window, or at
   actual size scrolling. Fixed to the window, inside the report window so it goes with it; Classic: css/classic.css. */
.picture-lightbox { position: fixed; inset: 0; z-index: var(--z-raised); pointer-events: auto; animation: picture-lightbox-in var(--motion-med) var(--ease-out); }
.picture-lightbox:focus { outline: none; }
.picture-lightbox-stage { position: absolute; inset: 0; display: flex; overflow: hidden; overscroll-behavior: contain; }
.picture-lightbox[data-zoomed] .picture-lightbox-stage { overflow: auto; }
.picture-lightbox-img { flex: none; display: block; margin: auto; max-width: 92vw; max-height: 88vh; width: auto; height: auto; user-select: none; -webkit-user-drag: none; touch-action: none; }
.picture-lightbox[data-zoomable] .picture-lightbox-img { cursor: zoom-in; }
.picture-lightbox[data-zoomed] .picture-lightbox-img { max-width: none; max-height: none; cursor: grab; }
.picture-lightbox[data-dragging] .picture-lightbox-img { cursor: grabbing; }
.picture-lightbox-bar { position: absolute; top: var(--space-4); right: var(--space-4); display: flex; align-items: center; gap: var(--space-2); }
.picture-lightbox [hidden] { display: none !important; }
@keyframes picture-lightbox-in { from { opacity: 0; } to { opacity: 1; } }
[data-ui="modern"] #bug-report-panel .picture-lightbox { background: color-mix(in srgb, var(--c-black) 72%, transparent); }
[data-ui="modern"] #bug-report-panel .picture-lightbox-img { border-radius: var(--radius-m); background: var(--surface-sunken); box-shadow: var(--shadow-3); }
[data-ui="modern"] #bug-report-panel .picture-lightbox[data-zoomed] .picture-lightbox-img { border-radius: 0; box-shadow: none; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-btn { flex: none; display: inline-grid; place-items: center; width: 36px; height: 36px; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-heavy) var(--fs-2xl)/var(--lh-none) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-btn:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel .picture-lightbox-tab { display: inline-flex; align-items: center; min-height: 36px; box-sizing: border-box; padding: 0 var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font-ui); text-decoration: none; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-tab:hover { background: var(--surface-hover); text-decoration: underline; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-tab:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { [data-ui="modern"] #bug-report-panel .reports-card, .picture-lightbox { animation: none; } }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** The icon's tip and its badge for n unread replies. */
export function badgeFor(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return { hidden: count === 0, text: count > 9 ? '9+' : String(count), tip: count ? REPORT_TEXT.tipUnread(count) : REPORT_TEXT.tip };
}

function createSession(engine, errors) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const api = createReportsApi({ baseUri: document.baseURI, nonce: boot.nonce || '' });

  const style = el('style', { id: 'bug-report-css' });
  style.textContent = STYLE;
  document.head.append(style);

  // The header icon, beside the mute button (GameHeaderUI.as: the bug icon sat with help in the header).
  // R opens it too (ticket 62, game.js keydown): the key cap in its tooltip, as the bar's other buttons.
  const btn = el('button', { id: 'bug-btn', type: 'button', class: 'chrome-btn mute-btn bug-btn', title: BUG_TEXT.tip, 'aria-label': `${BUG_TEXT.tip} (${REPORT_KEY})`, 'aria-keyshortcuts': REPORT_KEY, 'data-key': REPORT_KEY, 'aria-haspopup': 'dialog', 'data-bug-report-open': '' });
  btn.append(el('img', { src: 'assets/ui/bug_icon.png', alt: '', width: '23', height: '20' }));
  const badge = el('span', { class: 'bug-unread hud-badge', 'aria-hidden': 'true', hidden: true, 'data-reports-badge': '' });
  btn.append(badge);
  // The modern bar keeps it in the right pill, before Sound (Mute lives in Sound's popover there).
  const mute = document.getElementById?.('sound-btn') || document.getElementById?.('mute-btn');
  if (mute?.parentElement) mute.parentElement.insertBefore(btn, mute);
  else document.querySelector?.('.top-actions')?.append(btn);

  const host = document.getElementById('game-root') || document.body;
  const sheet = mountReportsSheet({
    host,
    api,
    context: () => reportContext(engine, errors),
    // The picture with the UI draws the canvas as the world picture found it when the form opened (ticket 73).
    capture: ({ ui = false, world = null } = {}) => (ui ? capturePictureWithUi(engine, document, REPORT_PICTURE, world?.frame) : capturePicture(engine)),
    toast: (t, ms) => engine.toast?.(t, ms),
    opener: () => btn,
    onState: ({ state, view, unread, last }) => {
      engine.setData?.('bugReport', state);
      engine.setData?.('bugReportLast', last);
      engine.setData?.('reportsView', view);
      engine.setData?.('reportsUnread', String(unread));
      const b = badgeFor(unread);
      badge.hidden = b.hidden;
      badge.textContent = b.text;
      // The modern bar shows data-tip (topbar.js adoptTitles moves a title there once); elsewhere the title.
      if (btn.dataset.tip !== undefined) btn.dataset.tip = b.tip;
      // A title is moved to data-tip by the bar (the key cap shows from data-key), so it carries no "(R)".
      else btn.title = b.tip;
      btn.setAttribute('aria-label', `${b.tip} (${REPORT_KEY})`);
      btn.dataset.unread = String(unread);
      btn.setAttribute('aria-expanded', state === 'closed' ? 'false' : 'true');
    },
  });
  // The shell's centred size, like Mail: it hands focus back to the icon when it closes.
  engine.panelShell?.add?.({ id: 'bug-report-panel', kind: 'center', close: () => sheet.close() });
  btn.addEventListener('click', () => (sheet.state === 'closed' ? sheet.open('list') : sheet.close()));

  // Over other windows: a copy of the icon on top of whatever covers it, in the same place.
  const lift = btn.cloneNode(true);
  lift.id = 'bug-btn-lift';
  lift.hidden = true;
  lift.removeAttribute('data-bug-report-open');
  lift.setAttribute('data-bug-report-lift', '');
  lift.addEventListener('click', () => btn.click());
  document.body.append(lift);
  const placeLift = () => {
    const r = btn.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && btn.getClientRects().length;
    // What is on top there, the copy itself aside (it sits exactly over the icon while shown).
    const stack = shown ? document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2) : [];
    const top = stack.find((n) => n !== lift && !lift.contains(n)) || null;
    const covered = Boolean(shown && top && !btn.contains(top));
    if (covered) {
      const cs = getComputedStyle(btn);
      Object.assign(lift.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, background: cs.backgroundColor, borderRadius: cs.borderRadius, color: cs.color });
      lift.title = `${btn.dataset.tip || btn.title || BUG_TEXT.tip} (${REPORT_KEY})`;
      lift.setAttribute('aria-label', btn.getAttribute('aria-label') || BUG_TEXT.tip);
      const b = lift.querySelector('[data-reports-badge]');
      const src = btn.querySelector('[data-reports-badge]');
      if (b && src) { b.hidden = src.hidden; b.textContent = src.textContent; }
    }
    if (lift.hidden === covered) lift.hidden = !covered;
    engine.setData?.('bugReportLift', covered ? '1' : '0');
  };
  // Its own clock: the game's tick stops while a window holds the game.
  const liftTimer = setInterval(placeLift, 200);

  async function poll() {
    if (sheet.state !== 'closed' || document.hidden || globalThis.navigator?.onLine === false) return;
    try {
      const r = await api.unread();
      sheet.setUnread(r?.unread);
    } catch { /* the badge keeps what it had */ }
  }
  poll();
  const timer = setInterval(poll, UNREAD_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // A reply email's link: /play/online/#report=<id> opens that thread once.
  const linked = reportFromHash(globalThis.location?.hash);
  if (linked) {
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* the hash stays */ }
    sheet.openTicket(linked);
  }

  return { ...sheet, placeLift, stop: () => { clearInterval(timer); clearInterval(liftTimer); }, get state() { return sheet.state; }, get view() { return sheet.view; }, get unread() { return sheet.unread; } };
}

let session = null;
const pageErrors = [];
let listening = false;

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('error', (e) => rememberError(pageErrors, e?.error?.stack?.split('\n').slice(0, 2).join(' ') || e?.message));
  window.addEventListener('unhandledrejection', (e) => rememberError(pageErrors, `Unhandled: ${e?.reason?.message || e?.reason}`));
}

export const bugReportFeature = {
  id: BUG_REPORT_FEATURE_ID,

  init(engine) {
    if (engine?.mode !== 'multiplayer') return;
    listen();
  },

  onTick(dtMs, now, engine) {
    if (session || engine?.mode !== 'multiplayer' || !engine.started || typeof document === 'undefined') return;
    session = createSession(engine, pageErrors);
    globalThis.groddleBugReport = session;
  },
};
