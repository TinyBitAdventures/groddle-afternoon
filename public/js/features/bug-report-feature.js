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
 * Solo has no account to send from and stays offline (G879, #425): where the icon sits, solo shows a
 * plain link to the website's Bugs board instead (bugsBoardHref, mountSoloBugsLink), and the game
 * itself sends nothing.
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
 * #496 (a phone's copy wrapped its words in another font and showed a scrolled list at its top):
 * the copy waits for the page's fonts and carries the loaded faces inline (fontFaceCss), every
 * engine draws it again after its fonts apply (redrawCount), and scrolled boxes keep their place
 * (markScrolls, restoreScrolls: sticky parts too, which the library's own restoreScrollPosition moved away).
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
 * Over other windows: the bug icon is a plain top-bar icon that windows and
 * full-window moments cover (Austin 2026-11-15: no copy of it floating over
 * them). R opens Reports from anywhere, over open windows too.
 *
 * A picture taken on purpose (G791, #216 and #281: a bug can be gone before
 * the Reports window opens): Shift+R anywhere in the game (not while typing,
 * not with the window open) takes the picture at once, the whole game window
 * as Include the game's UI draws it (the world only when that cannot be
 * drawn), and holds it for the next reply or new report; a toast says so.
 * Take a picture in a thread (js/ui/reports-sheet.js) closes the window and
 * shows a small bar (#report-shutter): play on, show the problem, then Take
 * the picture (or Shift+R), or Cancel (or Esc); the window comes back where it
 * was with the picture. The bar is never in the picture (REPORT_LEAVE_OUT).
 * The client had no such key (GameHeaderUI.as 47-69, a button); Shift+R was free.
 *
 * Several pictures, any kind (Austin 2026-11-15): a message carries up to four, the game's own
 * picture among them; the rest are added by Take a picture or Shift+R (one each), the file picker,
 * a drop or a paste (js/report-pictures.js reads each into the same JPEG; js/ui/reports-sheet.js
 * shows them as thumbnails). A picture taken with four already waiting is not kept; the toast says so.
 *
 * QA: canvas data bugReport (closed|open|sending), bugReportLast (the last
 * line shown), reportsView (list|thread|new), reportsUnread (n);
 * reportPicture (''|taking|held), reportShutter ('0'|'1');
 * window.groddleBugReport.open('list'|'new'), .openTicket(id), .refresh() in multiplayer.
 */

import { createReportsApi, REPORT_PICTURE, REPORT_TEXT, UNREAD_POLL_MS, base64Size, isPictureKey, pictureSize, reportFromHash } from '../reports.js?v=3c805cc4';
import { mountReportsSheet } from '../ui/reports-sheet.js?v=4a42cc37';
import { PICTURE_TEXT } from '../report-pictures.js?v=fe05b74d';
import { canvasTransparent } from '../render-probe.js?v=519c86ef';
import { marksLine, startBaitCheck } from '../extension-marks.js?v=36c70f4b';
import { imageFailureLine } from '../textures.js?v=b8e38103';

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

/** As the site keeps them (BugReports.php MAX_MESSAGE, MAX_ERRORS, MAX_ERROR). */
export const MAX_MESSAGE = 4000;
const MAX_ERRORS = 10;
const MAX_ERROR = 600;

/** Stack frames a page error keeps below its message (report #246: the top frame alone never named the calling line). */
export const STACK_FRAMES = 5;

/**
 * The browser's own ResizeObserver notice (ticket 98): a layout loop it settled itself, not a
 * fault, so a report never carries it. Chrome, Firefox and Safari say "ResizeObserver loop
 * completed with undelivered notifications." (the spec's words); Chrome before 2023 said
 * "ResizeObserver loop limit exceeded". Some wrap it in "Uncaught" or "Error:".
 */
const BENIGN_ERROR = /^(?:uncaught\s+)?(?:error:\s*)?ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/i;

/** True for a page error that is a browser notice, not a fault: left out of reports. */
export function benignError(text) {
  return BENIGN_ERROR.test(String(text || '').replace(/\s+/g, ' ').trim());
}

/** The page's last errors, newest last, each cut short; browser notices (benignError) left out. */
export function rememberError(list, text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR);
  if (!line || benignError(line)) return list;
  list.push(line);
  if (list.length > MAX_ERRORS) list.splice(0, list.length - MAX_ERRORS);
  return list;
}

/**
 * One line for the report form from a window 'error' event: the stack's message line and up to
 * STACK_FRAMES frames below it (or the message), each frame's address without the page's origin so
 * five fit in MAX_ERROR, led by where the game caught it when it did (feature-host reportPageError:
 * report 116, a feature's per-frame throw is caught and the game goes on, so its id is the useful part).
 */
export function pageErrorLine(e) {
  const where = typeof e?.error?.groddleWhere === 'string' && e.error.groddleWhere ? `${e.error.groddleWhere}: ` : '';
  const stack = typeof e?.error?.stack === 'string' ? e.error.stack : '';
  const origin = globalThis.location?.origin;
  const frames = stack.split('\n').slice(0, STACK_FRAMES + 1)
    .map((f) => (origin && origin !== 'null' ? f.split(origin).join('') : f).trim()).filter(Boolean);
  const line = frames.join(' ') || e?.message || '';
  return line ? where + line : '';
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

/** Never in the picture: the Reports window itself and the picture bar (G791). */
export const REPORT_LEAVE_OUT = Object.freeze(['bug-report-panel', 'report-shutter']);

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
      // The open tool's name (game.js renderMakePanel sets it on a tool's own screen; the tools screen has none).
      const tool = slug(n.dataset?.makeToolName);
      const recipe = slug(n.querySelector('#make-title')?.textContent).replace(/^make\s*/, '');
      if (tool) name += `:${tool}`;
      if (recipe) name += `/${recipe}`;
    } else if (n.id === 'shrine-panel') {
      const giant = slug(n.querySelector('h2')?.textContent).replace(/^shrine to\s*/, '');
      if (giant) name += `:${giant}`;
    } else if (n.id === 'quest-panel') {
      const detail = questLogDetail(n);
      if (detail) name += `:${detail}`;
    } else if (n.id === 'vendor-panel') {
      const tab = slug(n.querySelector('[aria-selected="true"], .active')?.textContent);
      if (tab) name += `:${tab}`;
    }
    out.push(name);
  }
  return out;
}

/**
 * #155 (Quests sheet with counts and no rows): the sheet as drawn when the report was written,
 * "active 0/69 cards, tabs 26/8/32": the tab in use, the cards shown in it of the cards #quest
 * holds (every tab), and the numbers on the tabs. A report then tells a list that never drew
 * (0/0) from cards drawn but not shown (0/69) from a picture that missed them (25/69). #585: cards
 * on show that the page draws no box for are named, "0/20 cards (8 styled out)": a style from outside
 * the game (an ad blocker's rule) hides them.
 */
export function questLogDetail(panel) {
  const list = panel?.querySelector?.('#quest');
  if (!list) return '';
  const cards = [...(list.querySelectorAll?.('.q-card') || [])];
  const shown = cards.filter((c) => !c.hidden && c.getClientRects?.().length).length;
  const tabs = [...(panel.querySelectorAll?.('[role="tab"]') || [])];
  const on = tabs.find((t) => t.getAttribute?.('aria-selected') === 'true');
  const tab = slug(on?.dataset?.tab || on?.textContent?.replace(/[\d\s]+(of[\d\s]+)?$/, '') || '');
  const counts = tabs.map((t) => (/\d+(?:\s+of\s+\d+)?/.exec(String(t.textContent || '')) || ['?'])[0]);
  // #585: cards kept on show (no hidden) with no box: a style from outside the game hides them.
  const styled = list.parentElement?.getClientRects?.().length ? cards.filter((c) => !c.hidden && c.getClientRects && !c.getClientRects().length).length : 0;
  return `${tab ? `${tab} ` : ''}${shown}/${cards.length} cards${styled ? ` (${styled} styled out)` : ''}${counts.length ? `, tabs ${counts.join('/')}` : ''}`;
}

/**
 * #465: online, the realtime street the client stands on (the server's answer) and the one it asked
 * for when they differ, or none: "rt HOME_520", "rt none (asked HOME_520)". It rides at the front
 * of `panels`, a context key the site already keeps (BugReports.php CONTEXT).
 */
export function realtimeLine(engine) {
  if (engine?.mode !== 'multiplayer') return '';
  let client = null;
  try { client = engine.query?.('realtimeClient') || null; } catch { client = null; }
  if (!client) return 'rt off';
  const on = String(client.street || '') || 'none';
  const asked = String(client.wanted || '') || 'none';
  return `rt ${on}${asked !== on ? ` (asked ${asked})` : ''}`;
}

/**
 * #585: what the page can learn about extensions changing it (js/extension-marks.js): adblock is the
 * bait check's answer (yes|no, '' when none ran) and marks the traces extensions left in the page.
 */
export function extensionContext(bait = null, doc = globalThis.document) {
  let adblock = '';
  try { adblock = String(bait?.read?.() || ''); } catch { adblock = ''; }
  return { adblock, marks: marksLine(doc) };
}

/**
 * What the report carries besides the player's words. `images` (#662): the images that failed to
 * load this session, by path and count (js/textures.js imageFailureLine), one line in the errors.
 */
export function reportContext(engine, errors = [], env = globalThis, bait = null, images = imageFailureLine(MAX_ERROR)) {
  const p = engine?.player;
  const street = engine?.street;
  let panels = '';
  try { panels = openPanels(env.document).join(', '); } catch { panels = ''; }
  const rt = realtimeLine(engine);
  // The update state (js/update-check.js updateLine: this build, a newer one found, what holds the pill
  // back): a page that found a new build showed no pill for over an hour (2026-11-19). It rides in
  // `panels`, a key the site keeps, as rt does.
  let upd = '';
  try { upd = String(engine?.query?.('updateState', engine) || '').slice(0, 120); } catch { upd = ''; }
  panels = [rt, upd, panels].filter(Boolean).join(', ').slice(0, 300);
  // G844 (#393): the boot render-texture probe, the GPU's name and limits (js/render-probe.js).
  let gpu = '';
  try { gpu = String(engine?.renderProbeLine?.() || '').slice(0, 200); } catch { gpu = ''; }
  const failed = engine?.renderProbe?.ok === false || engine?.renderProbe?.plain === false;
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
    gpu,
    ...extensionContext(bait, env.document),
    // The site keeps only the context keys it knows; a failed probe (and #662's failed images) also
    // ride in the errors so they reach it now.
    errors: withExtras(errors, [failed && gpu ? `render probe: ${gpu}` : '', String(images || '').slice(0, MAX_ERROR)]),
  };
}

/** The page's last errors with the extra lines after them, MAX_ERRORS in all (the extras kept). */
function withExtras(errors, extras) {
  const add = extras.filter(Boolean);
  const keep = MAX_ERRORS - add.length;
  return [...(keep > 0 ? errors.slice(-keep) : []), ...add];
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
  // G844 (#393): an empty frame (the GPU drew nothing off screen and the screen copy failed too) is
  // no picture, never a black one. Read from the frame's own 2D context, once per report.
  if (frame?.width && frame?.height && canvasTransparent(frame, null, Infinity)) return null;
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
 * #496: every engine draws the copy at least this many more times. The library redraws only in
 * WebKit and Firefox, so Chrome kept its first pass, taken before the copy's own fonts are applied.
 */
export const MIN_REDRAWS = 2;
/** #496: how long the picture waits for the page's fonts to finish loading before it is drawn anyway. */
export const FONT_WAIT_MS = 1500;

/** A unicode-range as numbers ("U+0000-00FF, U+0131" and "U+0-FF, U+131" read the same): a face's key. */
export function unicodeRangeKey(range) {
  const out = [];
  for (const m of String(range || '').matchAll(/U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/gi)) {
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : m[1].includes('?') ? parseInt(m[1].replace(/\?/g, 'f'), 16) : lo;
    out.push(`${lo}-${hi}`);
  }
  return out.join(',') || '0-1114111';
}

const unquote = (s) => String(s || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
const faceKey = (family, style, range) => `${unquote(family)}|${String(style || 'normal').trim().toLowerCase()}|${unicodeRangeKey(range)}`;

/**
 * #496: the page's @font-face rules for the faces it has loaded (document.fonts), with each one's
 * file address resolved against its stylesheet: [{ cssText, urls: [[raw, absolute]] }]. These are
 * the fonts the screen is drawn in; the copy carries them as its own, so its words measure and wrap
 * as on screen. Empty when the page has loaded none (the library then finds them itself).
 */
export function loadedFontFaces(doc = globalThis.document) {
  const loaded = new Set();
  try {
    for (const f of doc?.fonts || []) if (f.status === 'loaded') loaded.add(faceKey(f.family, f.style, f.unicodeRange));
  } catch { /* no font list */ }
  if (!loaded.size) return [];
  const out = [];
  const walk = (rules, base) => {
    for (const rule of rules || []) {
      if (rule.cssRules && rule.type !== 5) { walk(rule.cssRules, base); continue; }
      if (rule.type !== 5 && !/FontFace/.test(rule.constructor?.name || '')) continue;
      const s = rule.style;
      const key = faceKey(s.getPropertyValue('font-family'), s.getPropertyValue('font-style'), s.getPropertyValue('unicode-range'));
      if (!loaded.has(key)) continue;
      const urls = [];
      for (const m of rule.cssText.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
        if (m[2].startsWith('data:')) continue;
        let abs = m[2];
        try { abs = new URL(m[2], base || doc.baseURI).href; } catch { /* left as written */ }
        urls.push([m[2], abs]);
      }
      out.push({ cssText: rule.cssText, urls });
    }
  };
  for (const sheet of doc?.styleSheets || []) {
    let rules = null;
    try { rules = sheet.cssRules; } catch { rules = null; }
    walk(rules, sheet.href);
  }
  return out;
}

/** Font files already read as data URLs, by address: read once, every later picture reuses them. */
const fontData = new Map();
async function fontDataUrl(url, fetchFn = globalThis.fetch) {
  if (!fontData.has(url)) {
    const p = Promise.resolve().then(() => fetchFn(url)).then((r) => {
      if (!r?.ok) throw new Error(`font ${r?.status}`);
      return r.blob();
    }).then((blob) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    }));
    p.catch(() => fontData.delete(url));
    fontData.set(url, p);
  }
  return fontData.get(url);
}

/**
 * #496: the CSS the copy carries for its fonts: the loaded faces' rules with every file inlined
 * as a data URL. '' when there is none to carry or a file cannot be read (the library then embeds
 * the fonts its own way). `read` turns an address into a data URL (tests pass their own).
 */
export async function fontFaceCss(doc = globalThis.document, read = fontDataUrl) {
  const faces = loadedFontFaces(doc);
  if (!faces.length) return '';
  try {
    const parts = await Promise.all(faces.map(async ({ cssText, urls }) => {
      let css = cssText;
      for (const [raw, abs] of urls) {
        const data = await read(abs);
        css = css.split(raw).join(data);
      }
      return css;
    }));
    return parts.join('\n');
  } catch {
    return '';
  }
}

/** #496: waits for the page's fonts (document.fonts.ready), at most `ms`. */
export async function fontsSettled(doc = globalThis.document, ms = FONT_WAIT_MS) {
  const ready = doc?.fonts?.ready;
  if (!ready) return false;
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([Promise.resolve(ready).then(() => true, () => false), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * #496: marks the boxes under `root` the player has scrolled (data-shot-scroll="left,top") and the
 * sticky parts inside them (data-shot-sticky="dx,dy": how far sticking moved each one from where
 * it would sit, measured with it held relative for a moment, before any paint). The copy is never
 * scrolled, so restoreScrolls moves it to match. Returns the function that removes the marks.
 */
export function markScrolls(root, win = globalThis) {
  const marked = [];
  const mark = (node, name, value) => { node.setAttribute(name, value); marked.push([node, name]); };
  let nodes = [];
  try { nodes = [root, ...(root?.querySelectorAll?.('*') || [])]; } catch { nodes = []; }
  for (const box of nodes) {
    const x = Math.round(box?.scrollLeft || 0);
    const y = Math.round(box?.scrollTop || 0);
    if (!x && !y) continue;
    mark(box, 'data-shot-scroll', `${x},${y}`);
    for (const part of box.querySelectorAll?.('*') || []) {
      let pos = '';
      try { pos = win.getComputedStyle?.(part)?.position || ''; } catch { pos = ''; }
      if (pos !== 'sticky') continue;
      const at = part.getBoundingClientRect();
      const was = part.style.position;
      part.style.position = 'relative';
      const home = part.getBoundingClientRect();
      part.style.position = was;
      const dx = Math.round(at.left - home.left);
      const dy = Math.round(at.top - home.top);
      if (dx || dy) mark(part, 'data-shot-sticky', `${dx},${dy}`);
    }
  }
  return () => { for (const [node, name] of marked) node.removeAttribute(name); };
}

/**
 * #496: in the page's copy, each marked box's children moved up by its scroll (so the copy shows
 * the part the player had scrolled to), and each marked sticky part held where it showed on screen.
 * Returns how many boxes it moved.
 */
export function restoreScrolls(clone) {
  let n = 0;
  const boxes = [...(clone?.matches?.('[data-shot-scroll]') ? [clone] : []), ...(clone?.querySelectorAll?.('[data-shot-scroll]') || [])];
  for (const box of boxes) {
    const [x, y] = String(box.getAttribute('data-shot-scroll')).split(',').map(Number);
    for (const child of box.children || []) {
      const own = child.style.transform;
      child.style.transform = `translate(${-x}px, ${-y}px)${own && own !== 'none' ? ` ${own}` : ''}`;
    }
    n += 1;
  }
  for (const part of clone?.querySelectorAll?.('[data-shot-sticky]') || []) {
    const [dx, dy] = String(part.getAttribute('data-shot-sticky')).split(',').map(Number);
    Object.assign(part.style, { position: 'relative', top: `${dy}px`, left: `${dx}px`, bottom: 'auto', right: 'auto' });
  }
  return n;
}

/**
 * #529: the page's copy keeps attributes, not what the player changed since: a ticked box drawn
 * from its `checked` attribute (Make's "Only show what I can make" starts ticked in the markup),
 * a list showing its first option. Marks every checkbox and radio under `root` with its live state
 * (data-shot-checked="1|0") and every option of a select with whether it is chosen
 * (data-shot-selected="1|0"). Returns the function that removes the marks.
 */
export function markFormState(root) {
  const marked = [];
  const mark = (node, name, on) => { node.setAttribute(name, on ? '1' : '0'); marked.push([node, name]); };
  let boxes = [];
  let lists = [];
  try {
    boxes = [...(root?.querySelectorAll?.('input[type="checkbox"], input[type="radio"]') || [])];
    lists = [...(root?.querySelectorAll?.('select') || [])];
  } catch { boxes = []; lists = []; }
  for (const box of boxes) mark(box, 'data-shot-checked', Boolean(box.checked));
  for (const list of lists) for (const option of list.options || []) mark(option, 'data-shot-selected', Boolean(option.selected));
  return () => { for (const [node, name] of marked) node.removeAttribute(name); };
}

/**
 * #529: in the page's copy, each marked box and option drawn as it is on screen: the `checked` and
 * `selected` attributes set or taken off to match, and the marks removed. Returns how many it set.
 */
export function restoreFormState(clone) {
  let n = 0;
  const all = (sel) => [...(clone?.matches?.(sel) ? [clone] : []), ...(clone?.querySelectorAll?.(sel) || [])];
  for (const [sel, mark, attr] of [['[data-shot-checked]', 'data-shot-checked', 'checked'], ['[data-shot-selected]', 'data-shot-selected', 'selected']]) {
    for (const node of all(sel)) {
      if (node.getAttribute(mark) === '1') node.setAttribute(attr, '');
      else node.removeAttribute(attr);
      node.removeAttribute(mark);
      n += 1;
    }
  }
  return n;
}

/**
 * #496: how many more times the library draws the copy: what WebKit counted for its pictures
 * (at most REDRAWS), never fewer than MIN_REDRAWS in any engine.
 */
export function redrawCount(counted) {
  return Math.max(MIN_REDRAWS, Math.min(Number(counted) || 0, REDRAWS));
}

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
/**
 * G791: a picture of the game taken on purpose, now: the whole game window as Include the game's
 * UI draws it, from the canvas read at once (captureFrame), else the location view alone. Null
 * when the game cannot be drawn.
 */
export async function takePictureNow(engine, doc = globalThis.document, limits = REPORT_PICTURE) {
  const frame = captureFrame(engine, doc, limits);
  if (!frame) return null;
  let pic = null;
  try { pic = await capturePictureWithUi(engine, doc, limits, frame); } catch { pic = null; }
  return pic || encodePicture(frame, doc, limits, viewRows(frame.width, frame.height, engine?.camera));
}

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
  let unmark = null;
  try {
    const bg = globalThis.getComputedStyle?.(doc.body)?.backgroundColor || '#ffffff';
    // #496: the copy is drawn in the page's own fonts (loaded first, carried inline), not a fallback.
    await fontsSettled(doc);
    const fontCss = await fontFaceCss(doc);
    const unmarkScrolls = markScrolls(root);
    const unmarkForms = markFormState(root);
    unmark = () => { unmarkScrolls(); unmarkForms(); };
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
      ...(fontCss ? { font: { cssText: fontCss } } : {}),
      // #496: a scrolled list (Skills, a vendor) is copied where the player scrolled it, not at its top.
      // #529: ticked boxes and chosen options drawn as the player left them, not as the markup has them.
      onCloneNode: (clone) => { maskClone(clone); restoreScrolls(clone); restoreFormState(clone); },
      onEmbedNode: () => { if (context) context.drawImageCount = redrawCount(context.drawImageCount); },
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
    unmark?.();
  }
  if (!drawn || blankPicture(drawn, doc)) return null;
  const out = encodePicture(drawn, doc, limits);
  return out ? { ...out, ui: true } : null;
}

const STYLE = `
/* G791: the bar while a picture for a report waits to be taken (both skins). */
.report-shutter { position: fixed; top: calc(var(--hud-h) + 10px + var(--safe-t)); left: 50%; transform: translateX(-50%); z-index: calc(var(--z-modal) + 40); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-2); max-width: calc(100vw - 16px); box-sizing: border-box; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-l); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font-ui); pointer-events: auto; }
.report-shutter[hidden] { display: none !important; }
.report-shutter-text { flex: 1 1 12rem; min-width: 0; }
.report-shutter button { flex: none; min-height: 32px; margin: 0; padding: 0 var(--space-4); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface-raised); color: var(--text); font: inherit; cursor: pointer; }
.report-shutter .report-shutter-take { border-color: var(--accent); background: var(--accent); color: var(--text-inverse); }
.report-shutter button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.report-shutter .kcap { margin-left: var(--space-1); }
/* G791: Take a picture and Remove under the reply box (both skins lay them out the same way). */
#bug-report-panel .reports-take-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
#bug-report-panel .reports-reply-picture[hidden] { display: none !important; }
.bug-btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--sp-2) 0.45rem; position: relative; }
.bug-btn img { width: 23px; height: 20px; display: block; }
.bug-btn .bug-unread[hidden], .reports-panel[hidden], .reports-view[hidden], .reports-panel [hidden] { display: none !important; }
[data-ui="modern"] #game-root #bug-report-panel { position: absolute; inset: 0; z-index: calc(var(--z-modal) + 32); display: grid; place-items: center; padding: calc(var(--hud-h) + 12px + var(--safe-t)) var(--hud-inset) calc(var(--pack-live-height, 72px) + 8px); background: var(--scrim); }
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
/* REPORTSMENU: a row's menu (js/ui/report-row-menu.js) keeps the shared menu's ring inside its rows. */
[data-ui="modern"] #bug-report-panel .ctx-menu .vm-row:focus-visible { outline-offset: -2px; }
[data-ui="modern"] #bug-report-panel .reports-body { display: flex; flex-direction: column; padding-top: var(--space-2); scrollbar-width: auto; scrollbar-color: auto; }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar { width: 10px; }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar-track { background: var(--surface-sunken); border-radius: var(--radius-pill); }
[data-ui="modern"] #bug-report-panel .reports-body::-webkit-scrollbar-thumb { background: var(--border-strong); border: 2px solid var(--surface-sunken); border-radius: var(--radius-pill); }
[data-ui="modern"] #bug-report-panel .reports-view { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; flex: 1 1 auto; }
/* Ticket 115: the status tabs over the list, each with its count and a red count of new replies. */
[data-ui="modern"] #bug-report-panel .reports-tabs { flex: none; display: flex; flex-wrap: wrap; gap: var(--space-1); padding: 0 0 var(--space-1); border-bottom: 1px solid var(--border); }
[data-ui="modern"] #bug-report-panel .reports-tab { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 28px; margin: 0; padding: 0 var(--space-2); border: 1px solid transparent; border-radius: var(--radius-pill); background: transparent; color: var(--text-muted); font: var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-tab:hover { background: var(--surface-hover); color: var(--text); }
[data-ui="modern"] #bug-report-panel .reports-tab[aria-selected="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
[data-ui="modern"] #bug-report-panel .reports-tab-count { min-width: 16px; padding: 0 var(--space-1); border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-xs); font-weight: var(--fw-heavy); text-align: center; }
[data-ui="modern"] #bug-report-panel .reports-tab[data-count="0"] .reports-tab-count { opacity: 0.6; }
[data-ui="modern"] #bug-report-panel .reports-tab-dot { min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: var(--radius-pill); background: var(--danger); color: var(--text-inverse); font-size: var(--fs-2xs); font-weight: var(--fw-heavy); line-height: 16px; text-align: center; }
[data-ui="modern"] #bug-report-panel .reports-tabpanel { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; }
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
/* #225: Has a reply, on a report an administrator answered (closed or not): an outline tag beside the status chip. */
[data-ui="modern"] #bug-report-panel .reports-replied { flex: none; padding: 0 var(--space-2); border: 1px solid var(--status-good); border-radius: var(--radius-pill); color: var(--status-good); font-size: var(--fs-xs); font-weight: var(--fw-bold); line-height: var(--lh-tight); white-space: nowrap; }
/* Read by the team (Austin 2026-11-12): quiet words after a row's line, and under a thread's newest message. */
[data-ui="modern"] #bug-report-panel .reports-read { display: inline-block; margin-left: var(--space-2); color: var(--text-muted); font-size: var(--fs-xs); white-space: nowrap; }
[data-ui="modern"] #bug-report-panel .reports-read::before { content: "✓"; content: "✓" / ""; margin-right: var(--space-1); color: var(--status-good); }
[data-ui="modern"] #bug-report-panel .reports-read-note { margin: 0; align-self: flex-end; color: var(--text-muted); font-size: var(--fs-xs); }
[data-ui="modern"] #bug-report-panel .reports-read-note::before { content: "✓"; content: "✓" / ""; margin-right: var(--space-1); color: var(--status-good); }
/* Ticket 49: Working on it, an administrator's mark. */
[data-ui="modern"] #bug-report-panel .reports-chip.is-working { background: color-mix(in srgb, var(--status-warn) 24%, transparent); color: var(--warn); }
[data-ui="modern"] #bug-report-panel .reports-empty { margin: var(--space-4) 0; color: var(--text-muted); line-height: var(--lh-body); text-align: center; }
/* #744: Older reports, the next page of the list, centred after it (a finger's height on a phone). */
[data-ui="modern"] #bug-report-panel .reports-older { align-self: center; margin: var(--space-2) 0 var(--space-1); }
@media (max-width: 600px), (pointer: coarse) { [data-ui="modern"] #bug-report-panel .reports-older { min-height: 40px; } }
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
/* Reactions on a message (Austin 2026-11-18; js/ui/reaction-strip.js, the chat's chips in each skin): under its words, the
   chips then the add button, which stays in sight here (a thread has few messages) and is full strength on hover or focus. */
#bug-report-panel .reports-msg-react { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-top: var(--space-1); }
#bug-report-panel .reports-msg-react > .react-strip { margin-top: 0; }
#bug-report-panel .reports-msg-react > .react-add { order: 1; margin-left: 0; opacity: 0.6; }
#bug-report-panel .reports-msg:is(:hover, :focus-within) .reports-msg-react > .react-add, #bug-report-panel .reports-msg-react > .react-add[aria-expanded="true"] { opacity: 1; }
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
/* #585: Browser extensions you use (optional), one line under the pictures. */
[data-ui="modern"] #bug-report-panel .reports-ext-row { display: grid; gap: 2px; }
[data-ui="modern"] #bug-report-panel .reports-new-view .reports-ext-row .reports-text { flex: none; min-height: 0; resize: none; }
/* Ticket 73: the picture at its own shape, big enough to read, a link to the lightbox. */
[data-ui="modern"] #bug-report-panel .reports-picture-thumb { flex: none; display: block; width: 216px; max-width: 45%; border: 1px solid var(--border); border-radius: var(--radius-s); overflow: hidden; line-height: 0; cursor: zoom-in; }
[data-ui="modern"] #bug-report-panel .reports-picture-thumb img { display: block; width: 100%; height: auto; }
[data-ui="modern"] #bug-report-panel .reports-picture-thumb:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-picture { display: block; margin-top: var(--space-2); width: fit-content; max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-s); overflow: hidden; line-height: 0; cursor: zoom-in; }
[data-ui="modern"] #bug-report-panel .reports-picture:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-picture img { display: block; max-width: 100%; width: auto; height: auto; max-height: 180px; }
[data-ui="modern"] #bug-report-panel .reports-status.is-error { color: var(--text-danger); white-space: normal; }
/* Several pictures a message (Austin 2026-11-15): a row of thumbnails under the box, each opening the
   pictures over the game, each with its x; the window lit while pictures are dragged over it. */
#bug-report-panel .reports-tray { list-style: none; margin: 0; padding: var(--space-1) 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
#bug-report-panel .reports-tray[hidden], #bug-report-panel .reports-thumb[hidden] { display: none; }
#bug-report-panel .reports-thumb { position: relative; flex: none; display: block; }
#bug-report-panel .reports-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
[data-ui="modern"] #bug-report-panel .reports-tray .reports-picture-thumb { width: auto; max-width: none; }
[data-ui="modern"] #bug-report-panel .reports-tray .reports-picture-thumb img { width: auto; max-width: 120px; height: auto; max-height: 80px; }
[data-ui="modern"] #bug-report-panel .reports-thumb-remove { position: absolute; top: calc(-1 * var(--space-2)); right: calc(-1 * var(--space-2)); display: inline-grid; place-items: center; width: 26px; height: 26px; margin: 0; padding: 0; border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-heavy) var(--fs-l)/var(--lh-none) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .reports-thumb-remove:hover { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel .reports-thumb-remove:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-msg-pictures { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
[data-ui="modern"] #bug-report-panel .reports-msg-pictures .reports-picture { margin-top: 0; }
[data-ui="modern"] #bug-report-panel .reports-msg-pictures[data-count]:not([data-count="1"]) .reports-picture img { max-height: 96px; }
[data-ui="modern"] #bug-report-panel[data-dropping] .reports-card { outline: 3px dashed var(--accent); outline-offset: -3px; }
[data-ui="modern"] #bug-report-panel .reports-take-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.picture-lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); }
.picture-lightbox-prev { left: var(--space-4); }
.picture-lightbox-next { right: var(--space-4); }
.picture-lightbox-count { position: absolute; left: 50%; bottom: var(--space-4); transform: translateX(-50%); margin: 0; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-nav { width: 44px; height: 44px; }
[data-ui="modern"] #bug-report-panel .picture-lightbox-count { padding: var(--space-1) var(--space-3); border-radius: var(--radius-pill); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font-ui); }
[data-ui="modern"] .top-bar .top-actions .bug-btn .bug-unread { pointer-events: none; }
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
/* G808, Circle the spot (js/ui/picture-marks.js, #49): the picture sits in a frame its size with the rings' SVG
   over it (clipped to it, as the JPEG is), and the marking bar under it. While the bar shows, the picture keeps
   clear of it. Classic: css/classic.css; the phone companion: play/phone/phone.css. */
.picture-lightbox { --marks-room: 7rem; }
.picture-lightbox-frame { position: relative; flex: none; display: block; margin: auto; line-height: 0; }
.picture-lightbox[data-markable] .picture-lightbox-stage { bottom: var(--marks-room); }
.picture-lightbox[data-markable] .picture-lightbox-img { max-height: calc(100vh - var(--marks-room) - 2 * var(--space-6)); }
.picture-lightbox[data-markable] .picture-lightbox-count { bottom: auto; top: var(--space-4); left: var(--space-4); transform: none; }
.picture-marks-layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.picture-lightbox[data-marking] .picture-marks-layer { pointer-events: auto; cursor: crosshair; touch-action: none; }
.picture-marks-layer:focus { outline: none; }
.picture-marks-layer:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.picture-mark-focus { display: none; stroke: var(--focus); stroke-dasharray: 10 8; }
.picture-marks-layer:focus-visible .picture-mark[data-selected] .picture-mark-focus { display: inline; }
.picture-mark.is-draft { opacity: 0.75; }
.picture-marks { position: absolute; left: 50%; bottom: var(--space-4); transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-2); width: max-content; max-width: calc(100vw - 2 * var(--space-4)); box-sizing: border-box; margin: 0; padding: var(--space-2) var(--space-4); animation: picture-marks-in var(--motion-med) var(--ease-out); }
.picture-marks-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); margin: 0; }
.picture-marks-icon { display: inline-block; width: 0.85em; height: 0.85em; box-sizing: border-box; border: 2px solid currentColor; border-radius: 50%; }
.picture-marks-help { flex: 1 0 100%; margin: 0; text-align: center; }
.picture-marks-live { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@keyframes picture-marks-in { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 600px), (pointer: coarse) {
  .picture-lightbox { --marks-room: 9.5rem; }
  .picture-marks { left: var(--space-2); right: var(--space-2); bottom: var(--space-2); width: auto; max-width: none; transform: none; }
  .picture-marks-title { flex: 1 0 100%; text-align: center; }
  .picture-marks-keys { display: none; }
  .picture-marks-btn { min-height: 40px; }
}
@media (prefers-reduced-motion: reduce) { .picture-marks { animation: none; } }
[data-ui="modern"] #bug-report-panel .picture-marks { border: 1px solid var(--border); border-radius: var(--radius-l); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3); font: var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font-ui); }
[data-ui="modern"] #bug-report-panel .picture-marks-title { font-weight: var(--fw-heavy); }
[data-ui="modern"] #bug-report-panel .picture-marks-btn { min-height: 32px; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface-raised); color: var(--text); font: var(--fw-heavy) var(--fs-s)/var(--lh-tight) var(--font-ui); cursor: pointer; }
[data-ui="modern"] #bug-report-panel .picture-marks-btn:hover:not(:disabled) { background: var(--surface-hover); }
[data-ui="modern"] #bug-report-panel .picture-marks-btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
[data-ui="modern"] #bug-report-panel .picture-marks-btn.is-go { border-color: var(--accent); background: var(--accent); color: var(--text-inverse); }
[data-ui="modern"] #bug-report-panel .picture-marks-btn.is-go:hover { border-color: var(--accent-hover); background: var(--accent-hover); }
[data-ui="modern"] #bug-report-panel .picture-marks-btn:disabled { opacity: 0.5; cursor: default; }
[data-ui="modern"] #bug-report-panel .picture-marks-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel :is(.picture-marks-count, .picture-marks-help) { color: var(--text-muted); font-size: var(--fs-xs); }
@media (max-width: 600px), (pointer: coarse) { [data-ui="modern"] #bug-report-panel .picture-marks-btn { min-height: 40px; } }
/* The "2 marks" tag on a thumbnail whose picture has rings (G808). */
#bug-report-panel .reports-thumb-marks { position: absolute; left: var(--space-1); bottom: var(--space-1); padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--danger); color: var(--text-inverse); font: var(--fw-heavy) var(--fs-2xs)/var(--lh-normal) var(--font-ui); white-space: nowrap; pointer-events: none; }
#bug-report-panel .reports-thumb-marks[hidden] { display: none; }
/* #264 (Friendly, an upright phone): Send sat just below the window's foot. The picture of a phone's
   screen is tall, so its preview (up to 45% of the row across) stood about 270 px high. On a phone the
   window runs nearly to the foot of the screen (over the pack row), the preview is a short thumbnail and
   the box starts smaller, so Send shows without a scroll. */
:root.touch-phone[data-ui="modern"] #game-root #bug-report-panel { padding: calc(var(--hud-h) + 8px + var(--safe-t)) var(--sp-2) var(--sp-4); }
:root.touch-phone[data-ui="modern"] #bug-report-panel .reports-new-view .reports-text { min-height: 6rem; }
:root.touch-phone[data-ui="modern"] #bug-report-panel .reports-picture-thumb { width: auto; max-width: 35%; }
:root.touch-phone[data-ui="modern"] #bug-report-panel .reports-picture-thumb img { width: auto; max-width: 100%; max-height: 96px; }
:root.touch-phone[data-ui="modern"] #bug-report-panel .reports-tray .reports-picture-thumb { max-width: none; }
:root.touch-phone[data-ui="modern"] #bug-report-panel .reports-tray .reports-picture-thumb img { max-width: 88px; max-height: 60px; }
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
  btn.append(el('img', { src: 'assets/ui/bug_icon.webp', alt: '', width: '23', height: '20' }));
  const badge = el('span', { class: 'bug-unread hud-badge', 'aria-hidden': 'true', hidden: true, 'data-reports-badge': '' });
  btn.append(badge);
  // The modern bar keeps it in the right pill, before Sound (Mute lives in Sound's popover there).
  const mute = document.getElementById?.('sound-btn') || document.getElementById?.('mute-btn');
  if (mute?.parentElement) mute.parentElement.insertBefore(btn, mute);
  else document.querySelector?.('.top-actions')?.append(btn);

  const host = document.getElementById('game-root') || document.body;
  // G791: a picture being taken, and the bar while one waits to be taken (openShutter).
  let taking = false;
  let shutter = null;
  // #585: the open form's bait check; its answer stays for the report it was made for.
  let bait = null;
  let baitOn = false;
  const sheet = mountReportsSheet({
    host,
    api,
    context: () => reportContext(engine, errors, globalThis, bait),
    // The picture with the UI draws the canvas as the world picture found it when the form opened (ticket 73).
    capture: ({ ui = false, world = null } = {}) => (ui ? capturePictureWithUi(engine, document, REPORT_PICTURE, world?.frame) : capturePicture(engine)),
    // G791: Take a picture under the reply box: the bar over the game until the player takes it.
    takePicture: (handlers) => openShutter(handlers),
    toast: (t, ms) => engine.toast?.(t, ms),
    opener: () => btn,
    // REPORTSMENU: the rows' menu (js/ui/report-row-menu.js) names itself in the canvas data.
    setData: (k, v) => engine.setData?.(k, v),
    onState: ({ state, view, unread, last, held }) => {
      // #585: the bait check runs while the new report form is open (js/extension-marks.js).
      const writing = state !== 'closed' && view === 'new';
      if (writing && !baitOn) { bait?.stop(); bait = startBaitCheck(); }
      else if (!writing && baitOn) bait?.stop();
      baitOn = writing;
      engine.setData?.('reportPicture', taking ? 'taking' : held ? 'held' : '');
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
  // == G791: a picture taken on purpose ==
  // Why the last picture was not kept: it could not be drawn (''), or four were already waiting ('full').
  let notKept = '';
  /** The picture now, held for the next reply or new report; null when it could not be drawn or there is no room. */
  async function takeNow() {
    if (taking) return null;
    taking = true;
    engine.setData?.('reportPicture', 'taking');
    let pic = null;
    try { pic = await takePictureNow(engine, document); } catch { pic = null; }
    taking = false;
    const kept = Boolean(pic && sheet.hold(pic));
    notKept = pic && !kept ? 'full' : '';
    engine.setData?.('reportPicture', kept ? 'held' : (sheet.held ? 'held' : ''));
    return kept ? pic : null;
  }
  /** Shift+R in the game: the picture at once, and a toast that says where it went. */
  async function holdNow() {
    const pic = await takeNow();
    engine.toast?.(pic ? REPORT_TEXT.takeTaken : notKept === 'full' ? PICTURE_TEXT.full : REPORT_TEXT.takeFailed, pic ? 4200 : 3200);
  }
  /** The bar over the game after Take a picture: Take the picture (or Shift+R), or Cancel (or Esc). */
  function openShutter({ done, cancel }) {
    closeShutter();
    const bar = el('div', { id: 'report-shutter', class: 'report-shutter', role: 'group', 'aria-label': REPORT_TEXT.take, 'data-report-shutter': '' });
    const words = el('span', { class: 'report-shutter-text', 'aria-live': 'polite' }, REPORT_TEXT.shutterTitle);
    const take = el('button', { type: 'button', class: 'report-shutter-take', 'aria-keyshortcuts': 'Shift+R', 'data-report-shutter-take': '' }, REPORT_TEXT.shutterTake);
    take.append(el('span', { class: 'kcap', 'aria-hidden': 'true' }, '⇧R'));
    const no = el('button', { type: 'button', class: 'report-shutter-cancel', 'aria-keyshortcuts': 'Escape', 'data-report-shutter-cancel': '' }, REPORT_TEXT.shutterCancel);
    bar.append(words, take, no);
    document.body.append(bar);
    const go = async () => {
      if (taking || shutter?.bar !== bar) return;
      take.disabled = true;
      words.textContent = REPORT_TEXT.takeDrawing;
      // Out of sight while the page is copied (it is left out too: REPORT_LEAVE_OUT).
      bar.hidden = true;
      const pic = await takeNow();
      closeShutter();
      done(pic);
    };
    const stop = () => {
      if (taking || shutter?.bar !== bar) return;
      closeShutter();
      cancel();
    };
    take.addEventListener('click', go);
    no.addEventListener('click', stop);
    shutter = { bar, take: go, cancel: stop };
    engine.setData?.('reportShutter', '1');
  }
  function closeShutter() {
    shutter?.bar.remove();
    shutter = null;
    engine.setData?.('reportShutter', '0');
  }
  // Shift+R (and Esc while the bar is up), ahead of the game's own keys; never while typing or with the window open.
  window.addEventListener('keydown', (e) => {
    if (sheet.state !== 'closed') return;
    if (shutter && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      shutter.cancel();
      return;
    }
    if (!isPictureKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (shutter) shutter.take();
    else holdNow();
  }, true);

  // The shell's centred size, like Mail: it hands focus back to the icon when it closes.
  engine.panelShell?.add?.({ id: 'bug-report-panel', kind: 'center', close: () => sheet.close() });
  btn.addEventListener('click', () => (sheet.state === 'closed' ? sheet.open('list') : sheet.close()));


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
  // REPORTSMENU: the rows' Copy link gives the same link; pasted into this tab, only the hash changes.
  const openLinked = () => {
    const linked = reportFromHash(globalThis.location?.hash);
    if (!linked) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* the hash stays */ }
    sheet.openTicket(linked);
  };
  openLinked();
  globalThis.addEventListener?.('hashchange', openLinked);

  return { ...sheet, takeNow, holdNow, get shutter() { return Boolean(shutter); }, get held() { return sheet.held; }, get pictures() { return sheet.pictures; }, get room() { return sheet.room; }, stop: () => { clearInterval(timer); }, get state() { return sheet.state; }, get view() { return sheet.view; }, get unread() { return sheet.unread; } };
}

/** G879: the community Bugs board, on the live site. */
export const BUGS_BOARD_URL = 'https://groddleafternoon.com/chat/bugs/';
/** G879: the solo link's tip (the bar shows it as data-tip). */
export const SOLO_BUGS_TIP = 'Bugs board on the website';
/** G879: hosts whose site serves /chat/ itself (the live site and the local one). */
const SITE_HOSTS = new Set(['groddleafternoon.com', 'www.groddleafternoon.com', 'groddle.localhost']);

/** PURE (G879): the Bugs board's address from a page on `hostname`: relative where the site serves it, else the live one. */
export function bugsBoardHref(hostname) {
  return SITE_HOSTS.has(String(hostname || '').toLowerCase()) ? '/chat/bugs/' : BUGS_BOARD_URL;
}

/**
 * G879 (#425): solo's way to report: a link where the Report icon sits (same id, so the bar's
 * layout, the phone's three buttons and R hold), opening the Bugs board in a new tab. Solo stays
 * offline: the link is the player's to follow, the game sends nothing.
 */
function mountSoloBugsLink() {
  if (document.getElementById('bug-btn')) return document.getElementById('bug-btn');
  const href = bugsBoardHref(globalThis.location?.hostname);
  const link = el('a', { id: 'bug-btn', class: 'chrome-btn mute-btn bug-btn', href, target: '_blank', rel: 'noopener', title: SOLO_BUGS_TIP, 'aria-label': `${SOLO_BUGS_TIP} (${REPORT_KEY})`, 'aria-keyshortcuts': REPORT_KEY, 'data-key': REPORT_KEY, 'data-solo-bugs': '' });
  link.append(el('img', { src: 'assets/ui/bug_icon.webp', alt: '', width: '23', height: '20' }));
  const mute = document.getElementById?.('sound-btn') || document.getElementById?.('mute-btn');
  if (mute?.parentElement) mute.parentElement.insertBefore(link, mute);
  else document.querySelector?.('.top-actions')?.append(link);
  return link;
}

let session = null;
let soloLink = null;
const pageErrors = [];
let listening = false;

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('error', (e) => rememberError(pageErrors, pageErrorLine(e)));
  window.addEventListener('unhandledrejection', (e) => rememberError(pageErrors, `Unhandled: ${e?.reason?.message || e?.reason}`));
}

export const bugReportFeature = {
  id: BUG_REPORT_FEATURE_ID,

  init(engine) {
    if (engine?.mode !== 'multiplayer') return;
    listen();
  },

  onTick(dtMs, now, engine) {
    if (!soloLink && engine?.mode === 'solo' && engine.started && typeof document !== 'undefined') soloLink = mountSoloBugsLink();
    if (session || engine?.mode !== 'multiplayer' || !engine.started || typeof document === 'undefined') return;
    session = createSession(engine, pageErrors);
    globalThis.groddleBugReport = session;
  },
};
