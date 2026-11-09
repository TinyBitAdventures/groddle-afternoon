/**
 * Reporting an IM, and taking a moderator's purge and deleted lines out of open windows (rules and
 * copy in js/im-report.js; the site's half is groddle-afternoon-site src/ModReports.php and
 * Moderation.php, the server's groddle-afternoon-server moderation.go). Multiplayer only: in solo
 * this feature does nothing, draws nothing and saves nothing.
 *
 * - The Social drawer (js/ui/social-drawer.js REPORTING) gives an IM line from the other player a
 *   small Report button; the conversation's head has Report too (their newest line). Both open the
 *   report window: the line, an optional note, "Block them too", Send report or Cancel (Escape).
 *   Sent, the window closes and a toast thanks the player; "Block them too" blocks through the
 *   buddies feature (blockPlayer), which takes the conversation away.
 * - chat_purged: every line the player said since then leaves the drawer (every conversation and
 *   thread), groups-feature's channels and player-im-feature's conversations (their own handlers).
 *   im_deleted: one line leaves the conversation.
 *
 * QA: canvas data imReport (open:<id> | sent:<status> | failed | closed), modPurged (player:since:n);
 * window.groddleImReport.open(withId, lineId) in multiplayer.
 */

import {
  REPORT_TEXT,
  imLineOf,
  mayReport,
  newestFrom,
  purgeOf,
  purged,
  reportBody,
  reportResultText,
} from '../im-report.js?v=93211487';
import { createMinnAccount } from '../minn-account.js?v=9057becf';

export const IM_REPORT_FEATURE_ID = 'im-report';

let session = null;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function createSession(engine, client) {
  const social = engine.social;
  let account = null;
  let open = null;
  const me = () => Number(client.me?.id) || 0;
  const imLines = (id) => engine.query?.('imLines', id) || [];
  const nameOf = (id) => engine.query?.('imName', id) || 'this player';

  function close(why = 'closed') {
    if (!open) return;
    const { shade, opener } = open;
    shade.remove();
    open = null;
    engine.setData?.('imReport', why);
    if (opener?.isConnected) opener.focus?.({ preventScroll: true });
  }

  /** The report window for one IM line (server line { id, from, text, at }). */
  function show(withId, line, { opener = null } = {}) {
    close();
    const name = nameOf(withId);
    const shade = el('div', { class: 'mod-report-shade', 'data-mod-report': String(withId) });
    const win = el('div', { class: 'mod-report-window', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mod-report-title' });
    const head = el('div', { class: 'mod-report-head' });
    head.append(el('h2', { id: 'mod-report-title' }, REPORT_TEXT.title));
    const x = el('button', { type: 'button', class: 'verb-menu-x', 'aria-label': REPORT_TEXT.cancel }, '×');
    head.append(x);
    const form = el('form', { class: 'mod-report-body' });
    form.append(el('p', { class: 'mod-report-intro' }, REPORT_TEXT.intro(name)));
    const quote = el('blockquote', { class: 'mod-report-line', 'data-mod-report-line': `${line.id}:${line.at}` });
    quote.append(el('strong', {}, `${name}: `), document.createTextNode(String(line.text || '')));
    form.append(quote);
    const noteId = `mod-report-note-${withId}`;
    form.append(el('label', { for: noteId }, REPORT_TEXT.noteLabel));
    const note = el('textarea', { id: noteId, rows: '3', maxlength: '500', placeholder: REPORT_TEXT.notePlaceholder, 'data-mod-report-note': '' });
    form.append(note);
    const blockRow = el('label', { class: 'mod-report-block' });
    const block = el('input', { type: 'checkbox', 'data-mod-report-block': '' });
    blockRow.append(block, document.createTextNode(` ${REPORT_TEXT.block(name)}`));
    form.append(blockRow);
    const status = el('p', { class: 'mod-report-status', role: 'status', 'aria-live': 'polite' });
    form.append(status);
    const foot = el('div', { class: 'mod-report-foot' });
    const cancel = el('button', { type: 'button', class: 'mod-report-cancel', 'data-mod-report-cancel': '' }, REPORT_TEXT.cancel);
    const send = el('button', { type: 'submit', class: 'mod-report-send', 'data-mod-report-send': '' }, REPORT_TEXT.send);
    foot.append(cancel, send);
    form.append(foot);
    win.append(head, form);
    shade.append(win);
    x.addEventListener('click', () => close());
    cancel.addEventListener('click', () => close());
    shade.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        close();
      }
      // The game's keys stay out while the window is open.
      e.stopPropagation?.();
    });
    shade.addEventListener('pointerdown', (e) => {
      if (e.target === shade) close();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault?.();
      if (send.disabled) return;
      const body = reportBody({ withId, me: me(), line, lines: imLines(withId), note: note.value });
      if (!body) {
        status.textContent = REPORT_TEXT.failed;
        return;
      }
      send.disabled = true;
      send.textContent = REPORT_TEXT.sending;
      account ??= createMinnAccount({ baseUri: document.baseURI, nonce: globalThis.GRODDLE_MP_BOOT?.nonce || '' });
      let answer = null;
      try {
        answer = await account.reportIm(body);
      } catch (err) {
        send.disabled = false;
        send.textContent = REPORT_TEXT.send;
        status.textContent = reportResultText(null, err);
        engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
        engine.setData?.('imReport', 'failed');
        return;
      }
      const blockToo = block.checked;
      close(`sent:${answer?.status || 'reported'}`);
      engine.toast?.(reportResultText(answer), 3600);
      if (blockToo) engine.query?.('blockPlayer', withId, name);
    });
    (document.getElementById('verb-menu')?.parentElement || document.body).append(shade);
    open = { shade, opener };
    engine.setData?.('imReport', `open:${withId}`);
    requestAnimationFrame?.(() => note.focus?.({ preventScroll: true }));
    return true;
  }

  /** Report from a drawer line (the flag button). */
  function reportLine(chatId, drawerLine, opts = {}) {
    const at = imLineOf(chatId, drawerLine);
    if (!at) return false;
    const line = imLines(at.with).find((l) => Number(l.id) === at.line && !l.parent) || imLines(at.with).find((l) => Number(l.id) === at.line);
    if (!line || Number(line.from) !== at.with) return false;
    return show(at.with, line, opts);
  }

  /** Report from a conversation's head: their newest line. */
  function reportConversation(withId, opts = {}) {
    const line = newestFrom(imLines(withId).filter((l) => !l.parent), withId);
    if (!line) {
      engine.toast?.(REPORT_TEXT.nothing(nameOf(withId)), 2800);
      return false;
    }
    return show(withId, line, opts);
  }

  social?.reporting?.connect({
    can: (chatId, line) => mayReport(chatId, line),
    report: (chatId, line, opts) => reportLine(chatId, line, opts),
  });

  client.on('msg:chat_purged', (msg) => {
    const p = purgeOf(msg);
    if (!p) return;
    const opts = { ...p, me: me() };
    const n = social?.purge?.((l) => purged(l, opts)) || 0;
    engine.setData?.('modPurged', `${p.player}:${p.since}:${n}`);
  });
  client.on('msg:im_deleted', (msg) => {
    const w = Math.floor(Number(msg?.with));
    const id = Math.floor(Number(msg?.line));
    if (!(w > 0) || !(id > 0)) return;
    const rk = `im:${w}:${id}`;
    social?.purge?.((l) => l.rk === rk);
    if (open && open.shade.getAttribute('data-mod-report') === String(w)) close('gone');
  });

  return {
    open: (withId, lineId) => {
      const line = imLines(withId).find((l) => Number(l.id) === Number(lineId));
      return line ? show(Number(withId), line) : false;
    },
    reportConversation,
    close,
    get isOpen() {
      return Boolean(open);
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client || !engine.social) return null;
  session = createSession(engine, client);
  globalThis.groddleImReport = session;
  return session;
}

export const imReportFeature = {
  id: IM_REPORT_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started || session) return;
    ensure(engine);
  },

  /** player-im-feature: its conversation head's Report. */
  imReport(withId, opener, engine) {
    const s = ensure(engine);
    return s ? s.reportConversation(Number(withId), { opener }) : null;
  },
};
