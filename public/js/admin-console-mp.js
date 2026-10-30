/**
 * What an administrator's console does to a connected game (multiplayer
 * only): the realtime server's admin_message, booted, admin_give and
 * admin_refill (groddle-afternoon-server admin.go), sent only on the site's
 * signed calls (groddle-afternoon-site src/AdminConsole.php, /console/).
 * js/features/realtime-feature.js wires these to the client; everything here
 * takes the engine from the caller, so tests drive it with a fake one.
 *
 * - A message shows as a dialog, "Message from an administrator", the text
 *   as plain text (the dialog sets textContent), at most ADMIN_TEXT_MAX.
 * - A boot shows "An administrator signed you out: <reason>." and the
 *   client stops reconnecting (close 4010, realtime-client 'booted'); a ban
 *   the same with "This account is suspended." (4011, 'suspended').
 * - A give is a settled ledger trade from nobody (admin-give-<16 hex>):
 *   applied once through the trade slice's applied list (ledgerReceipt), so
 *   the save check keeps it; the items go into the pack and the currants
 *   onto the purse, with the site's line ("An administrator gave you 3
 *   Cherries and 50 currants."). A game that never got the message gets it
 *   at its next load (the site's Ledger::catchUp).
 * - A refill fills mood and energy to the tank (metabolics.js moodMax /
 *   energyMax).
 */

import { addItem } from './inventory.js?v=85d4faba';
import { energyMax, moodMax } from './metabolics.js?v=8504134e';

export const ADMIN_TEXT_MAX = 500;
const GIVE_OP = /^admin-give-[0-9a-f]{16}$/;
const CLASS = /^[a-z0-9_]{1,64}$/;

export const ADMIN_TEXT = Object.freeze({
  messageTitle: 'Message from an administrator',
  kicker: 'Groddle Afternoon',
  signedOut: (reason) => (reason ? `An administrator signed you out: ${reason}` : 'An administrator signed you out.'),
  suspended: 'This account is suspended.',
  gave: 'An administrator gave you something.',
  refilled: 'An administrator filled your mood and energy.',
  stateBooted: 'Signed out by an administrator',
  stateSuspended: 'Account suspended',
});

/** A message's text as shown: a string, trimmed, at most ADMIN_TEXT_MAX characters. */
export function adminMessageText(msg) {
  const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
  return [...text].slice(0, ADMIN_TEXT_MAX).join('');
}

/** The dialog for an admin_message; false when it carries no text. */
export function showAdminMessage(engine, msg) {
  const text = adminMessageText(msg);
  if (!text) return false;
  engine.prompt?.({ modal: true, kicker: ADMIN_TEXT.kicker, title: ADMIN_TEXT.messageTitle, text, choices: [{ label: 'OK', value: 'ok' }] });
  engine.pushActivity?.(`${ADMIN_TEXT.messageTitle}: ${text}`);
  engine.setData?.('adminMessage', text);
  return true;
}

/** The line a booted message earns (ends with a full stop). */
export function bootedLine(msg) {
  const reason = typeof msg?.reason === 'string' ? msg.reason.trim().replace(/[.!?]+$/, '') : '';
  const out = ADMIN_TEXT.signedOut(reason);
  const line = /[.!?]$/.test(out) ? out : `${out}.`;
  return msg?.banned === true ? `${line} ${ADMIN_TEXT.suspended}` : line;
}

/** A booted message: the dialog, once. */
export function showBooted(engine, msg) {
  const line = bootedLine(msg);
  engine.prompt?.({ modal: true, kicker: ADMIN_TEXT.kicker, title: msg?.banned === true ? ADMIN_TEXT.stateSuspended : ADMIN_TEXT.stateBooted, text: line, choices: [{ label: 'OK', value: 'ok' }] });
  engine.pushActivity?.(line);
  engine.setData?.('adminBooted', line);
  return line;
}

/** An admin_give as goods, or null when it is not one. */
export function adminGiveGoods(msg) {
  const op = String(msg?.op || '');
  if (!GIVE_OP.test(op)) return null;
  const items = [];
  for (const it of Array.isArray(msg.items) ? msg.items : []) {
    const n = Math.floor(Number(it?.n));
    if (!CLASS.test(String(it?.c || '')) || !(n >= 1 && n <= 9999)) return null;
    items.push({ c: it.c, n });
  }
  const currants = Math.max(0, Math.floor(Number(msg.currants) || 0));
  if (!items.length && !currants) return null;
  const text = typeof msg.text === 'string' && msg.text.trim() ? msg.text.trim().slice(0, 200) : ADMIN_TEXT.gave;
  return { op, items, currants, text };
}

/** Applies an admin_give once: true when applied now, false when already applied or not one. */
export function applyAdminGive(engine, msg) {
  const g = adminGiveGoods(msg);
  if (!g) return false;
  if (engine.query?.('ledgerReceipt', g.op, engine) !== true) return false;
  for (const { c, n } of g.items) addItem(engine.inv, c, n);
  if (g.currants) engine.pc.currants = (Number(engine.pc.currants) || 0) + g.currants;
  engine.pushActivity?.(g.text);
  engine.toast?.(g.text, 4200);
  engine.playSound?.('ITEM_GIVEN_TO_YOU', { volume: 0.6 });
  engine.setData?.('adminGive', g.op);
  engine.refreshPack?.();
  engine.save?.();
  return true;
}

/** An admin_refill: mood and energy to the tank. */
export function applyAdminRefill(engine) {
  const pc = engine.pc;
  if (!pc) return false;
  pc.energy = energyMax(pc);
  pc.mood = moodMax(pc);
  engine.pushActivity?.(ADMIN_TEXT.refilled);
  engine.toast?.(ADMIN_TEXT.refilled, 3600);
  engine.setData?.('adminRefill', `${pc.mood}/${pc.energy}`);
  engine.refreshPack?.();
  engine.save?.();
  return true;
}
