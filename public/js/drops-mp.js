/**
 * Stacks dropped on a public street for everyone in multiplayer (register
 * G332): the pure rules and words. features/drops-mp-feature.js talks to the
 * realtime server (groddle-afternoon-server drops.go, whose header lists the
 * messages and the source rules) and draws the stacks through game.js's own
 * dropped-stack path; the site's ledger keeps them (src/LedgerDrop.php).
 * Solo never reads this file.
 *
 * Sources (glitch-GameServerJS):
 * - items/include/takeable.js takeable_drop 157-213 (the stack lands at the
 *   dropper's feet), takeable_drop_conditions 104-135 (quest and soulbound
 *   items stay, 117-118), takeable_drop_lock 215-218 (who dropped it).
 * - takeable_pickup_conditions 5-51: the dropper guards it while within
 *   100 px (29-44, "You are not allowed to pick this up."); takeable_pickup
 *   53-102. main.js 2970-2979 with config_prod.js:37: within 800 px.
 * - location.js deleteTakeables 4619-4626 is called from nowhere: a dropped
 *   stack waited on the street for whoever came.
 *
 * Ours: a class the ledger does not carry (the trade table), a note (its
 * writing would not travel) and anything dropped in a private place (a home, a tower floor, a party
 * space, a race) stay the player's own, as in solo; a stack nobody picks up
 * in seven days goes back to its dropper.
 */

/** Where the site and server ids come from (drops.go dropOpRe). */
export const DROP_OP = /^drop-[0-9a-f]{16}$/;

/** drops.go dropReach (config_prod.js:37 verb_radius). */
export const DROP_REACH = 800;

/** drops.go dropLockRadius (takeable.js:38). */
export const DROP_LOCK_RADIUS = 100;

export const DROP_TEXT = Object.freeze({
  dropped: (n, label) => `You dropped ${n}× ${label}.`, // the game's own drop line (game.js dropPackItem)
  picked: (n, label) => `You picked up ${n}× ${label}.`, // the game's own pickup line
  back: (n, label) => `Nobody picked up your ${n}× ${label}, so it came back to your pack.`, // ours
  by: (name) => `Dropped by ${name}`, // ours
  busy: 'Wait a moment, you are still dropping something.', // drops.go
  gone: 'That stack has already been picked up.', // the game's own
  locked: 'You are not allowed to pick this up.', // takeable.js:39
  offline: "You're offline.",
});

/** A public street others share (realtime-feature sharedStreet; drops.go dropShared: no "_" in the id). */
export function isPublicStreet(street) {
  const s = String(street || '');
  return Boolean(s) && !s.includes('_');
}

/**
 * Whether a pack stack is dropped for everyone: '' when it is, else why it
 * stays the player's own (the game then drops it as in solo).
 */
export function shareReason(classTsid, table, { street = '', dropKey = '' } = {}) {
  const c = String(classTsid || '');
  if (!isPublicStreet(street)) return 'private';
  if (dropKey && dropKey !== street) return 'private'; // a Tower floor keeps its own stacks (G226)
  if (!table?.items) return 'table';
  if (!table.items[c]) return 'type';
  if (c === 'note') return 'note';
  return '';
}

function finite(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** One stack as the server sends it, as game.js's dropped-stack path draws it; null when it is not one. */
export function normalizeGroundStack(raw, street = '') {
  if (!raw || typeof raw !== 'object' || !DROP_OP.test(String(raw.id || ''))) return null;
  const classTsid = String(raw.c || '').replace(/[^a-z0-9_]/g, '');
  const count = Math.floor(finite(raw.n));
  if (!classTsid || count < 1) return null;
  const by = raw.by && typeof raw.by === 'object' ? { id: Math.floor(finite(raw.by.id)), name: String(raw.by.name || 'Someone').slice(0, 64) } : { id: 0, name: 'Someone' };
  const out = {
    id: String(raw.id),
    streetTsid: String(street || ''),
    classTsid,
    count,
    x: finite(raw.x),
    y: finite(raw.y),
    droppedAt: Math.max(0, Math.floor(finite(raw.at))),
    shared: true,
    by,
    subtitle: `${DROP_TEXT.by(by.name)} · ${count} in this pile`,
  };
  if (raw.r != null && Number.isFinite(Number(raw.r))) out.r = Math.max(0, Math.floor(Number(raw.r)));
  return out;
}

/** A street's stacks from ground_state, oldest first. */
export function groundFrom(msg) {
  const street = String(msg?.street || '');
  const list = Array.isArray(msg?.stacks) ? msg.stacks : [];
  return { street, stacks: list.map((s) => normalizeGroundStack(s, street)).filter(Boolean) };
}

/** An item the server or the site says moved ({ c, n, r? }); null when it is not one. */
export function normalizeItem(raw) {
  const c = String(raw?.c || '').replace(/[^a-z0-9_]/g, '');
  const n = Math.floor(finite(raw?.n));
  if (!c || n < 1) return null;
  const out = { c, n };
  if (raw.r != null && Number.isFinite(Number(raw.r))) out.r = Math.max(0, Math.floor(Number(raw.r)));
  return out;
}

/**
 * What one settled op does to the pack and what the player reads:
 * side 'dropped' (the stack left the pack), 'took' (picked up) or 'back'
 * (it came home). label(c, n) names a class.
 */
export function dropEffect(side, item, label = (c) => c) {
  const it = normalizeItem(item);
  if (!it) return null;
  const name = label(it.c, it.n);
  if (side === 'dropped') return { pack: { [it.c]: -it.n }, tool: null, line: DROP_TEXT.dropped(it.n, name), sound: 'ITEM_DROP' };
  const tool = it.r != null ? { c: it.c, r: it.r } : null;
  if (side === 'back') return { pack: { [it.c]: it.n }, tool, line: DROP_TEXT.back(it.n, name), sound: 'ITEM_PICKUP' };
  return { pack: { [it.c]: it.n }, tool, line: DROP_TEXT.picked(it.n, name), sound: 'ITEM_PICKUP' };
}

/** A row of GET groddle/v1/drops as an op the save applies: { op, side, item } or null. */
export function normalizeMine(row) {
  const op = String(row?.op || '');
  const id = String(row?.id || '');
  if (!DROP_OP.test(id) || (op !== id && op !== `${id}-t`)) return null;
  const item = normalizeItem(row?.item);
  if (!item) return null;
  const side = op === id ? 'dropped' : row?.why === 'return' ? 'back' : 'took';
  return { op, id, side, item };
}
