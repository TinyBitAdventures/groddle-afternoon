/**
 * Update ready (Austin, 2026-10-31): when a new version of the game is out, a small "Update ready"
 * pill shows in the top bar, in both interfaces (Modern: first in the right pill; Classic: in the
 * header after the Menu button, a running study's chip moving along). Clicking it saves the game
 * (solo: this browser's save; online: the cloud save, written before anything else happens) and
 * reloads. Nothing ever reloads by itself.
 *
 * The checks are js/update-check.js: play/build.json against this page's own stamp
 * (tools/deploy/build-id.mjs), about every five minutes with jitter, when the tab is shown again, and
 * online when the realtime socket comes back after a drop. A page with no stamp (a QA server on the
 * repo) checks nothing and draws nothing.
 *
 * - The pill waits while a race or other scene, the trade window, a modal prompt, a quest dialogue or
 *   an open panel is up (blockingDetail), and shows once that clears. Only windows a player can see count
 *   (shownToPlayer), and never the Reports window. It is an ordinary button in the bar's tab order.
 * - The fallback (2026-11-19, a desktop page that found v0.51.0 and showed no pill for over an hour):
 *   when the pill has stayed hidden HIDDEN_NUDGE_MS while an update waits, the news is said once more
 *   (UPDATE_TEXT.waiting, a toast and Activity; createHiddenNudge).
 * - A report carries the update state in its context (updateState: "upd <own>><newer> hidden 63m
 *   modal #id", bug-report-feature reportContext).
 * - Classic's placement and colours are in css/classic.css (the Classic palette lives only there).
 * - Activity gets one line per new build: "A new version is ready. ...".
 * - #307/#308: a realtime refusal of a rock, tree or node as too far (street-objects-feature asks
 *   updateReminder) says the notice again while a newer build waits (createReachReminder), and shows
 *   the pill if a blocking screen let it.
 *
 * QA: canvas data updateReady (the new build id, '' until one), updateOwn (this page's build),
 * updateChecks (checks so far), updateReminded (reach reminders so far), updateBlocked (what holds
 * the pill back, '' when nothing), updateNudged ('1' once the fallback spoke); window.groddleUpdate
 * { check(), latest, own, reload(), remind() }.
 */

import { UPDATE_TEXT, blockingDetail, buildUrl, createHiddenNudge, createReachReminder, createUpdateCheck, ownBuild, saveThenReload, updateLine } from '../update-check.js?v=380fa5a3';
import { saveStore } from '../save-store.js?v=1ccb1d6b';

export const UPDATE_READY_FEATURE_ID = 'update-ready';
/** How often the pill looks for blocking UI while an update waits. */
const BLOCK_CHECK_MS = 500;

const STYLE = `
.update-ready-btn[hidden] { display: none !important; }
[data-ui="modern"] .top-bar .update-ready-btn {
  flex: none; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 var(--space-2) 0 7px; margin: 0 2px;
  border: 0; border-radius: var(--radius-pill); background: var(--accent-soft); color: var(--accent);
  font-size: var(--fs-s); font-weight: var(--fw-heavy); white-space: nowrap; cursor: pointer;
}
[data-ui="modern"] .top-bar .update-ready-btn:hover { filter: brightness(0.97); }
[data-ui="modern"] .top-bar .update-ready-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.update-ready-btn svg, #menu-update-btn svg { width: 14px; height: 14px; flex: none; }
/* A narrow window keeps the street's name: the pill shows its arrow only (its tooltip and name still say it). */
@media (max-width: 1000px) {
  [data-ui="modern"] .top-bar .update-ready-btn { width: 28px; padding: 0; justify-content: center; }
  [data-ui="modern"] .top-bar .update-ready-btn > span { display: none; }
}
.update-ready-btn[aria-busy="true"] { cursor: progress; opacity: 0.75; }
/* G926 (#455): an upright phone's bar holds the stats and three or four 44 px buttons, and the pill pushed
   the Menu off the right edge. There it waits in the Menu instead (the Now group's first row, in the
   accent) with a dot on the Menu button, as Projects marks a finished project; sideways and on a computer
   the bar keeps it. */
#menu-update-btn { display: none; }
@media (orientation: portrait) {
  :root.touch-phone[data-ui="modern"] .top-bar .update-ready-btn { display: none; }
  :root.touch-phone[data-ui="modern"] .more-list #menu-update-btn:not([hidden]) { display: flex; align-items: center; gap: var(--space-2); grid-column: 1 / -1; color: var(--accent); font-weight: var(--fw-heavy); }
  :root.touch-phone[data-ui="modern"] .top-bar .more-menu:has(#menu-update-btn:not([hidden])) #more-btn { position: relative; }
  :root.touch-phone[data-ui="modern"] .top-bar .more-menu:has(#menu-update-btn:not([hidden])) #more-btn::before { content: ''; position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: var(--radius-round); background: var(--accent); box-shadow: 0 0 0 2px var(--surface-raised); pointer-events: none; }
}
`;

/** The circling arrow beside the words. */
const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13.6 1.6v3.6H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function createSession(engine, own) {
  const style = document.createElement('style');
  style.id = 'update-ready-css';
  style.textContent = STYLE;
  document.head.append(style);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'update-ready-btn';
  btn.className = 'chrome-btn update-ready-btn';
  btn.hidden = true;
  btn.title = UPDATE_TEXT.tip;
  btn.setAttribute('aria-label', `${UPDATE_TEXT.pill}. ${UPDATE_TEXT.tip}`);
  const words = document.createElement('span');
  words.textContent = UPDATE_TEXT.pill;
  btn.innerHTML = ICON;
  btn.append(words);
  const actions = document.querySelector('.top-bar .top-actions') || document.querySelector('.top-actions');
  if (actions) actions.insertBefore(btn, actions.firstChild);
  else (document.getElementById('game-root') || document.body).append(btn);
  // G926 (#455): the same offer as a Menu row, shown upright on a phone only (STYLE), where the pill is off
  // the bar (js/ui/topbar.js MENU_ROWS places it first in the phone's Now group).
  const row = document.createElement('button');
  row.type = 'button';
  row.id = 'menu-update-btn';
  row.className = 'chrome-btn menu-phone-row';
  row.hidden = true;
  row.title = UPDATE_TEXT.tip;
  row.setAttribute('aria-label', `${UPDATE_TEXT.pill}. ${UPDATE_TEXT.tip}`);
  row.innerHTML = ICON;
  const rowWords = document.createElement('span');
  rowWords.textContent = UPDATE_TEXT.pill;
  row.append(rowWords);
  document.getElementById('more-list')?.append(row);

  let announced = '';
  let busy = false;
  let blockTimer = null;
  let blocked = '';
  const nudge = createHiddenNudge();

  function place() {
    const ready = Boolean(check.latest);
    const why = ready && !busy ? blockingDetail(engine) : { reason: '', what: '' };
    const show = ready && (busy || !why.reason);
    if (btn.hidden === show) btn.hidden = !show;
    if (row.hidden === show) row.hidden = !show;
    const now = [why.reason, why.what].filter(Boolean).join(' ');
    if (now !== blocked) {
      blocked = now;
      engine.setData?.('updateBlocked', blocked);
    }
    if (ready && nudge.update(show)) {
      engine.toast?.(UPDATE_TEXT.waiting, 6000);
      engine.pushActivity?.(UPDATE_TEXT.waiting);
      engine.setData?.('updateNudged', '1');
    }
  }

  const check = createUpdateCheck({
    own,
    url: (at) => buildUrl(document.baseURI, at),
    onUpdate: ({ build }) => {
      engine.setData?.('updateReady', build);
      if (announced !== build) {
        announced = build;
        engine.pushActivity?.(UPDATE_TEXT.activity);
      }
      place();
      if (blockTimer == null) blockTimer = setInterval(place, BLOCK_CHECK_MS);
    },
  });
  engine.setData?.('updateOwn', own);
  engine.setData?.('updateReady', '');
  const reminder = createReachReminder({
    check,
    say: (text) => {
      engine.toast?.(text, 6000);
      engine.pushActivity?.(text);
      engine.setData?.('updateReminded', String(reminder.count));
      place();
    },
  });

  async function update() {
    if (busy || !check.latest) return;
    busy = true;
    btn.setAttribute('aria-busy', 'true');
    words.textContent = UPDATE_TEXT.saving;
    rowWords.textContent = UPDATE_TEXT.saving;
    const store = saveStore?.kind === 'multiplayer' ? saveStore : null;
    const reloaded = await saveThenReload({
      engine,
      store,
      reload: () => location.reload(),
      say: (text) => engine.toast?.(text, 5200),
    });
    if (!reloaded) {
      busy = false;
      btn.removeAttribute('aria-busy');
      words.textContent = UPDATE_TEXT.pill;
      rowWords.textContent = UPDATE_TEXT.pill;
      place();
    }
  }
  btn.addEventListener('click', update);
  // The Menu closes on a pick (game.js installMoreMenu), then the game saves and reloads.
  row.addEventListener('click', update);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check.shown();
  });

  // Online: a check when the realtime socket comes back after a drop (a server restart reconnects everyone).
  let seenOnline = false;
  let watching = null;
  function watchRealtime() {
    if (watching || engine.mode !== 'multiplayer') return;
    const client = engine.query?.('realtimeClient');
    if (!client?.on) return;
    watching = client;
    seenOnline = client.state === 'online';
    client.on('hello', () => {
      if (seenOnline) check.reconnected();
      seenOnline = true;
    });
  }

  check.start();
  const session = {
    check: () => check.check('manual'),
    reload: update,
    remind: () => reminder.reached(),
    watchRealtime,
    get latest() { return check.latest; },
    get own() { return own; },
    get checks() { return check.checks; },
    get button() { return btn; },
    get menuRow() { return row; },
    /** The update state for a report (updateLine): this build, the newer one, and what holds the pill back. */
    line() {
      const latest = check.latest?.build || '';
      const why = latest ? blockingDetail(engine) : { reason: '', what: '' };
      return updateLine({ own, latest, shown: Boolean(latest) && !btn.hidden, hiddenMs: nudge.hiddenFor, reason: why.reason, what: why.what });
    },
    tick() {
      watchRealtime();
      engine.setData?.('updateChecks', String(check.checks));
    },
  };
  return session;
}

let session = null;
/** No stamp on this page (a QA server on the repo): nothing checks. */
let unstamped = false;
let lastTick = 0;

export const updateReadyFeature = {
  id: UPDATE_READY_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (unstamped || !engine?.started || typeof document === 'undefined') return;
    if (!session) {
      const own = ownBuild(document);
      if (!own) {
        unstamped = true;
        return;
      }
      session = createSession(engine, own);
      globalThis.groddleUpdate = session;
    }
    if (now - lastTick < 1000) return;
    lastTick = now;
    session.tick();
  },

  /** bug-report-feature reportContext: the update state line ('' on a page with no stamp). */
  updateState() {
    return session ? session.line() : null;
  },

  /** street-objects-feature: the realtime server refused a rock, tree or node as too far (#307/#308). */
  updateReminder(reason, engine) {
    return session?.remind() ? true : null;
  },
};
