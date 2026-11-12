/**
 * REPORTSMENU (Austin 2026-11-12: "we should add a right click context menu on these for quicker
 * close/management actions"): the menu a row of the Reports list opens (js/ui/reports-sheet.js).
 * Right-click (Ctrl+click on a Mac), a long press on touch, or Shift+F10 or the Menu key on a
 * focused row opens it; a plain click on a row still opens the report.
 *
 * It is the shared context menu (js/ui/context-menu.js): the verb menu's rows with key caps 1-6,
 * the footer line that says what a row does, Up/Down (or W/S), Home/End, Enter or the digit to
 * pick, Esc or Tab to close; both skins draw it (style.css and css/classic.css .ctx-menu). It
 * lives inside the Reports window (its host is #bug-report-panel), so it sits over the window and
 * goes with it. The window keeps the keys (aria-modal), so closing the menu always gives focus
 * back to the row as drawn now, never to the world.
 *
 * Its rows are only what a player may do with their own report (groddle-afternoon-site
 * src/Tickets.php):
 * - Open: the report, as a click on the row does.
 * - Add a message: the report at its reply box (on a closed report, Reopen: a message from you is
 *   what opens it again, the site has no other way for a player).
 * - Close report: withdraws it (POST tickets/{id}/close), as the thread's Close report button,
 *   which asks nothing first. Not on a closed report.
 * - Mark as read: the new reply dot goes without opening it (GET tickets/{id} marks it read).
 * - Mark as unread: the dot comes back (POST tickets/{id}/unread), only on a report an
 *   administrator wrote in last.
 * - Copy link: the game's address with #report=<id> (js/reports.js reportFromHash opens it).
 *
 * QA: canvas data contextMenu ("report:<id>") and reportMenu (<id>), "" when closed.
 */

import { createContextMenu, bindContextTrigger } from './context-menu.js?v=79326483';

/** The menu's words. */
export const REPORT_MENU_TEXT = Object.freeze({
  open: 'Open',
  openTip: 'Shows the whole conversation.',
  reply: 'Add a message',
  replyTip: 'Opens it at the reply box.',
  reopen: 'Reopen',
  reopenTip: 'Opens it at the reply box: a message from you opens it again.',
  close: 'Close report',
  closeTip: 'Withdraws it, for when you no longer need an answer. A message from you opens it again.',
  read: 'Mark as read',
  readTip: 'Takes the new reply dot off without opening it.',
  unread: 'Mark as unread',
  unreadTip: 'Puts the new reply dot back, to come back to it later.',
  copy: 'Copy link',
  copyTip: 'A link that opens this report in the game.',
  // What the window's status line says after each.
  reopenHint: 'Write a reply to open it again.',
  readDone: 'Marked as read.',
  unreadDone: 'Marked as unread.',
  copied: 'Link copied.',
  copyFailed: (url) => `The link did not copy. It is ${url}`,
});

const OWNER = 'report:';

/**
 * PURE: the rows a report's menu shows, in order (key caps 1 to 6): Open; Add a message (Reopen
 * when closed); Close report unless closed; Mark as read when it has a reply you have not read, or
 * Mark as unread when an administrator wrote last; Copy link.
 * @param {{ status?: string, unread?: boolean, lastAuthor?: string }} t a ticket Summary
 */
export function reportMenuRows(t) {
  const T = REPORT_MENU_TEXT;
  const closed = t?.status === 'closed';
  const rows = [
    { id: 'open', label: T.open, tip: T.openTip, focusBack: false },
    closed ? { id: 'reopen', label: T.reopen, tip: T.reopenTip, focusBack: false } : { id: 'reply', label: T.reply, tip: T.replyTip, focusBack: false },
  ];
  if (!closed) rows.push({ id: 'close', label: T.close, tip: T.closeTip });
  if (t?.unread === true) rows.push({ id: 'read', label: T.read, tip: T.readTip });
  else if (t?.lastAuthor === 'admin') rows.push({ id: 'unread', label: T.unread, tip: T.unreadTip });
  rows.push({ id: 'copy', label: T.copy, tip: T.copyTip });
  return rows;
}

/** PURE: the link to a report: the page's own address (no query kept but its own, no hash) with #report=<id>. */
export function reportLink(id, loc = globalThis.location) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return '';
  const base = `${loc?.origin || ''}${loc?.pathname || '/'}`;
  return `${base}#report=${n}`;
}

/**
 * Copy words to the clipboard: the Clipboard API, else a hidden text box and the copy command.
 * Resolves true when it copied.
 */
export async function copyText(text, doc = globalThis.document) {
  const nav = doc?.defaultView?.navigator || globalThis.navigator;
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch { /* refused: try the old way */ }
  try {
    const box = doc.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    doc.body.append(box);
    box.select();
    const ok = doc.execCommand?.('copy') === true;
    box.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Wire the menu on the Reports list. `ticketOf(id)` gives a row's ticket as the sheet holds it now;
 * `rowFor(id)` its row's button as drawn now; `onPick(rowId, ticket, { keys })` does the action.
 * @param {{ doc: Document, host: HTMLElement, list: HTMLElement, ticketOf: (id: number) => object|null,
 *   rowFor: (id: number) => HTMLElement|null, onPick: Function, setData?: (k: string, v: string) => void }} o
 */
export function bindReportRowMenu({ doc, host, list, ticketOf, rowFor, onPick, setData = () => {} }) {
  let menu = null;
  const idOf = (li) => Number(li?.dataset?.ticket) || 0;
  const rowOf = (target) => {
    const li = target?.closest?.('.reports-row[data-ticket]');
    return li && list.contains?.(li) ? li : null;
  };

  function open(li, { at = null, keys = false } = {}) {
    const id = idOf(li);
    const t = id ? ticketOf(id) : null;
    if (!t) return false;
    menu ||= createContextMenu({ doc, host, id: 'report-row-menu', className: 'report-row-menu', rowData: 'reportRow', setData });
    const btn = li.querySelector?.('.reports-row-btn') || li;
    return menu.open({
      title: t.subject || '',
      rows: reportMenuRows(t),
      at,
      anchor: btn,
      // The window keeps the keys: whichever way it opened, focus goes back to the row on close.
      keys: true,
      opener: btn,
      findOpener: () => rowFor(id),
      owner: `${OWNER}${id}`,
      data: { reportMenu: id },
      onPick: (rowId) => onPick(rowId, ticketOf(id) || t, { keys }),
    });
  }

  bindContextTrigger(list, {
    rowOf,
    isOpenFor: (li) => Boolean(menu?.isOpenFor(`${OWNER}${idOf(li)}`)),
    open: (li, { at, keys }) => open(li, { at, keys }),
    longPress: true,
  });

  return {
    open: (id, o) => {
      const li = rowFor(Number(id))?.closest?.('.reports-row');
      return li ? open(li, o) : false;
    },
    close: (o = { focus: false }) => menu?.close(o) || false,
    isOpen: () => Boolean(menu?.isOpen()),
    /** The report whose menu is open, or 0. */
    ticket: () => (menu?.isOpen() && menu.owner().startsWith(OWNER) ? Number(menu.owner().slice(OWNER.length)) : 0),
    element: () => menu?.element() || null,
  };
}
