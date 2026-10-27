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
 * Reports go to the site (groddle-afternoon-site src/BugReports.php, POST
 * groddle/v1/feedback), signed in as the player, and land as private Bug
 * reports in Minn Admin. Solo has no account to send from: in solo this
 * feature draws nothing.
 *
 * QA: canvas data bugReport (closed|open|sending), bugReportLast (the last
 * line shown); window.groddleBugReport.open() in multiplayer.
 */

import { createMinnAccount } from '../minn-account.js?v=nbhome-9';

export const BUG_REPORT_FEATURE_ID = 'bug-report';

/** The words: the source's where it had them, short plain ones of ours where it did not. */
export const BUG_TEXT = Object.freeze({
  tip: 'Report a bug',
  title: 'Thanks for reporting a bug!',
  label: 'Please describe the problem you are having:',
  send: 'Send',
  close: 'Close',
  sending: 'Sending…',
  sent: 'Thanks! Your report was sent.',
  empty: 'Please describe the problem you are having.',
  failed: 'That didn\'t send. Try again in a moment.',
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

/** The build the page runs: game.js's round16 key (the online page names it on #online-boot). */
export function buildKey(doc = globalThis.document) {
  const src = doc?.getElementById?.('online-boot')?.dataset?.game
    || doc?.querySelector?.('script[src*="game.js"]')?.getAttribute?.('src') || '';
  const m = /[?&]round16=([^&"]+)/.exec(src);
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

const STYLE = `
.bug-btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.45rem; }
.bug-btn img { width: 23px; height: 20px; display: block; }
.bug-shade { position: fixed; inset: 0; z-index: 75; background: rgba(32, 24, 40, 0.28); display: flex; align-items: flex-start; justify-content: center; padding: 12vh 16px 16px; }
.bug-shade[hidden] { display: none; }
.bug-win { width: min(440px, 100%); border-radius: 12px; background: #fffdf6; color: #302b34; box-shadow: 0 10px 30px rgba(28, 25, 31, 0.35), 0 0 0 1px rgba(116, 80, 142, 0.18); font: 13px/1.4 system-ui, sans-serif; padding: 0.8rem 0.95rem 0.85rem; }
.bug-win h2 { margin: 0 0 0.45rem; font: 700 17px/1.2 'Trebuchet MS', system-ui, sans-serif; color: #4b2f63; display: flex; align-items: center; gap: 0.45rem; }
.bug-win label { display: block; margin: 0 0 0.3rem; color: #4a4450; }
.bug-win textarea { box-sizing: border-box; width: 100%; min-height: 7.5rem; resize: vertical; font: 13px/1.4 system-ui, sans-serif; padding: 0.45rem 0.55rem; border-radius: 8px; border: 0; box-shadow: inset 0 0 0 1px #d6c8e2; background: #fff; color: #302b34; }
.bug-win textarea:focus { outline: 2px solid #74508e; outline-offset: 1px; }
.bug-foot { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.55rem; }
.bug-status { flex: 1; min-height: 1.2em; font-size: 12px; color: #4a4450; }
.bug-status.is-error { color: #a33b25; }
.bug-win button { font: 700 12px/1.2 system-ui; border: 0; border-radius: 999px; padding: 0.4rem 0.95rem; cursor: pointer; color: #fff; background: #74508e; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
.bug-win button.is-quiet { color: #3a3340; background: #efe7da; box-shadow: none; }
.bug-win button:disabled { opacity: 0.5; cursor: default; }
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

function createSession(engine, errors) {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  let state = 'closed';
  let lastLine = '';

  const style = el('style', { id: 'bug-report-css' });
  style.textContent = STYLE;
  document.head.append(style);

  // The form: an id ending in -panel so engine.busy() counts it while it shows.
  const shade = el('div', { id: 'bug-report-panel', class: 'bug-shade', hidden: true, 'data-bug-report': '' });
  const win = el('section', { class: 'bug-win', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bug-report-title' });
  const title = el('h2', { id: 'bug-report-title' });
  title.append(el('img', { src: 'assets/ui/bug_icon.png', alt: '', width: '23', height: '20' }), document.createTextNode(BUG_TEXT.title));
  const label = el('label', { for: 'bug-report-text' }, BUG_TEXT.label);
  const text = el('textarea', { id: 'bug-report-text', maxlength: String(MAX_MESSAGE), rows: '6', 'data-bug-report-text': '' });
  const foot = el('div', { class: 'bug-foot' });
  const status = el('p', { class: 'bug-status', 'aria-live': 'polite', 'data-bug-report-status': '' });
  const closeBtn = el('button', { type: 'button', class: 'is-quiet', 'data-bug-report-close': '' }, BUG_TEXT.close);
  const sendBtn = el('button', { type: 'button', 'data-bug-report-send': '' }, BUG_TEXT.send);
  foot.append(status, closeBtn, sendBtn);
  win.append(title, label, text, foot);
  shade.append(win);
  document.body.append(shade);

  // Typing here is not walking: keys stay in the form (as the auctions window does).
  for (const kind of ['keydown', 'keyup', 'keypress']) {
    shade.addEventListener(kind, (e) => {
      e.stopPropagation();
      if (kind === 'keydown' && e.key === 'Escape') close();
      if (kind === 'keydown' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
    });
  }
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) close(); });
  text.addEventListener('input', () => { if (status.classList.contains('is-error')) say(''); });
  closeBtn.addEventListener('click', () => close());
  sendBtn.addEventListener('click', () => send());

  // The header icon, beside the mute button (GameHeaderUI.as: the bug icon sat with help in the header).
  const btn = el('button', { id: 'bug-btn', type: 'button', class: 'chrome-btn mute-btn bug-btn', title: BUG_TEXT.tip, 'aria-label': BUG_TEXT.tip, 'data-bug-report-open': '' });
  btn.append(el('img', { src: 'assets/ui/bug_icon.png', alt: '', width: '23', height: '20' }));
  btn.addEventListener('click', () => (state === 'closed' ? open() : close()));
  const mute = document.getElementById?.('mute-btn');
  if (mute?.parentElement) mute.parentElement.insertBefore(btn, mute);
  else document.querySelector?.('.top-actions')?.append(btn);

  function say(line, error = false) {
    lastLine = line || '';
    status.textContent = lastLine;
    status.classList.toggle('is-error', error);
    publish();
  }

  function publish() {
    engine.setData?.('bugReport', state);
    engine.setData?.('bugReportLast', lastLine);
  }

  function open() {
    state = 'open';
    shade.hidden = false;
    say('');
    sendBtn.disabled = false;
    setTimeout(() => text.focus(), 0);
    publish();
  }

  function close() {
    if (state === 'sending') return;
    state = 'closed';
    shade.hidden = true;
    publish();
    btn.focus?.();
  }

  async function send() {
    if (state !== 'open') return;
    const message = text.value.trim();
    if (!message) {
      say(BUG_TEXT.empty, true);
      text.focus();
      return;
    }
    state = 'sending';
    sendBtn.disabled = true;
    say(BUG_TEXT.sending);
    try {
      await account.reportBug(message.slice(0, MAX_MESSAGE), reportContext(engine, errors));
      text.value = '';
      state = 'open';
      close();
      lastLine = BUG_TEXT.sent;
      publish();
      engine.toast?.(BUG_TEXT.sent, 3200);
    } catch (err) {
      state = 'open';
      sendBtn.disabled = false;
      say(typeof err?.message === 'string' && err.data?.message ? err.data.message : BUG_TEXT.failed, true);
    }
  }

  publish();
  return { open, close, send, get state() { return state; } };
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
