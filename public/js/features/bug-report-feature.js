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
 * QA: canvas data bugReport (closed|open|sending), bugReportLast (the last
 * line shown), reportsView (list|thread|new), reportsUnread (n);
 * window.groddleBugReport.open('list'|'new'), .openTicket(id), .refresh() in multiplayer.
 */

import { createReportsApi, REPORT_PICTURE, REPORT_TEXT, UNREAD_POLL_MS, base64Size, pictureSize, reportFromHash } from '../reports.js?v=0cc4230d';
import { mountReportsSheet } from '../ui/reports-sheet.js?v=4b181c55';

export const BUG_REPORT_FEATURE_ID = 'bug-report';

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
export const MAX_MESSAGE = 2000;
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

/** What the report carries besides the player's words. */
export function reportContext(engine, errors = [], env = globalThis) {
  const p = engine?.player;
  const street = engine?.street;
  return {
    street: String(engine?.streetTsid || ''),
    streetName: String(street?.label || street?.name || ''),
    x: Number.isFinite(p?.x) ? String(Math.round(p.x)) : '',
    y: Number.isFinite(p?.y) ? String(Math.round(p.y)) : '',
    build: buildKey(env.document),
    page: String(env.location?.pathname || ''),
    agent: String(env.navigator?.userAgent || '').slice(0, 300),
    screen: env.innerWidth ? `${env.innerWidth}x${env.innerHeight}` : '',
    errors: errors.slice(-MAX_ERRORS),
  };
}

/**
 * The game's canvas as a report's picture: { url, width, height, bytes } (a
 * JPEG data URL), or null when the view cannot be drawn or never fits.
 */
export function capturePicture(engine, doc = globalThis.document, limits = REPORT_PICTURE) {
  let view = null;
  try { view = engine?.snapshotView?.({ resolution: 1 }); } catch { view = null; }
  if (!view?.width || !view?.height || !doc?.createElement) return null;
  for (const widest of limits.widths) {
    const [w, h] = pictureSize(view.width, view.height, Math.min(widest, limits.maxWidth), limits.maxHeight);
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
    ctx.drawImage(view, 0, 0, w, h);
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

const STYLE = `
.bug-btn { display: inline-flex; align-items: center; justify-content: center; padding: var(--sp-2) 0.45rem; position: relative; }
.bug-btn img { width: 23px; height: 20px; display: block; }
.bug-btn .bug-unread[hidden], .reports-panel[hidden], .reports-view[hidden], .reports-panel [hidden] { display: none !important; }
[data-ui="modern"] #game-root #bug-report-panel { position: absolute; inset: 0; z-index: calc(var(--z-dialog) + 5); display: grid; place-items: center; padding: calc(var(--hud-h) + 12px) var(--hud-inset) calc(var(--pack-live-height, 72px) + 8px); background: var(--scrim); }
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
[data-ui="modern"] #bug-report-panel .reports-body { display: flex; flex-direction: column; padding-top: var(--space-2); }
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
[data-ui="modern"] #bug-report-panel .reports-empty { margin: var(--space-4) 0; color: var(--text-muted); line-height: var(--lh-body); text-align: center; }
[data-ui="modern"] #bug-report-panel .reports-thread-head { display: flex; align-items: center; gap: var(--space-2); }
[data-ui="modern"] #bug-report-panel .reports-messages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); flex: 1 1 auto; min-height: 0; overflow-y: auto; }
[data-ui="modern"] #bug-report-panel .reports-msg { max-width: 88%; padding: var(--space-2) var(--space-3); border-radius: var(--radius-m); background: var(--surface-sunken); }
[data-ui="modern"] #bug-report-panel .reports-msg.is-admin { align-self: flex-start; border: 1px solid var(--accent); background: var(--surface-raised); }
[data-ui="modern"] #bug-report-panel .reports-msg.is-player { align-self: flex-end; }
[data-ui="modern"] #bug-report-panel .reports-msg-who { margin: 0 0 2px; font-size: var(--fs-s); }
[data-ui="modern"] #bug-report-panel .reports-msg-who time { color: var(--text-muted); }
[data-ui="modern"] #bug-report-panel .reports-msg-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--lh-body); }
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
[data-ui="modern"] #bug-report-panel .reports-picture-thumb { flex: none; width: 128px; height: auto; max-height: 96px; object-fit: cover; border: 1px solid var(--border); border-radius: var(--radius-s); }
[data-ui="modern"] #bug-report-panel .reports-picture { display: block; margin-top: var(--space-2); width: fit-content; max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-s); overflow: hidden; line-height: 0; cursor: zoom-in; }
[data-ui="modern"] #bug-report-panel .reports-picture:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
[data-ui="modern"] #bug-report-panel .reports-picture img { display: block; max-width: 100%; width: auto; height: auto; max-height: 180px; }
[data-ui="modern"] #bug-report-panel .reports-status.is-error { color: var(--text-danger); white-space: normal; }
[data-ui="modern"] .top-bar .top-actions .bug-btn .bug-unread { pointer-events: none; }
@media (prefers-reduced-motion: reduce) { [data-ui="modern"] #bug-report-panel .reports-card { animation: none; } }
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
  const btn = el('button', { id: 'bug-btn', type: 'button', class: 'chrome-btn mute-btn bug-btn', title: BUG_TEXT.tip, 'aria-label': BUG_TEXT.tip, 'aria-haspopup': 'dialog', 'data-bug-report-open': '' });
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
    capture: () => capturePicture(engine),
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
      else btn.title = b.tip;
      btn.setAttribute('aria-label', b.tip);
      btn.dataset.unread = String(unread);
      btn.setAttribute('aria-expanded', state === 'closed' ? 'false' : 'true');
    },
  });
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
  const linked = reportFromHash(globalThis.location?.hash);
  if (linked) {
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* the hash stays */ }
    sheet.openTicket(linked);
  }

  return { ...sheet, stop: () => clearInterval(timer), get state() { return sheet.state; }, get view() { return sheet.view; }, get unread() { return sheet.unread; } };
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
