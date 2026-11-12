/**
 * "Your looks" (ticket 59, Austin 2026-11-03): the looks you have worn, to
 * switch back to in one click, as the original kept them.
 *
 * The client (glitch-client ImaginationYourLooksUI.as):
 * - up to 37 looks on file, the current one among them (MAX_OUTFITS 37, 54;
 *   onAPIComplete 426-500: total_outfits = min(total, 37), the current look
 *   drawn apart as "Your current look", the rest in a row);
 * - newest worn first (AvatarLook.as parseMultiple 21-52: sorted on
 *   last_worn, descending);
 * - "Any look you keep for more than 5 minutes is auto-saved." (486-489):
 *   a look goes on file once it has been worn five minutes, not on saving
 *   it in the builder. The server side of it (avatar.getHistory,
 *   avatar.switchOutfit, avatar.deleteOutfit: APICall.as 598-631) was the
 *   web API, not GSJS, so the rule is the client's own words;
 * - clicking one switches to it (AvatarLookUI.as 190-196, tip "Switch to
 *   this look"), its Remove button asks first (ImaginationYourLooksUI.as
 *   166-180: "Remove this look from your history?") and removes it
 *   (onDeleteConfirm 544-550);
 * - no names (the looks are pictures only).
 *
 * The remake keeps the look's parts and colours only (the character
 * builder's vector fields, js/avatar-looks.js normalizeVectorFields), never
 * pictures: the pictures are drawn in the browser when the list shows. The
 * record lives in the player save as the your-looks feature's slice
 * (systems.features['your-looks'], features/your-looks-feature.js), in solo
 * and online alike: 37 looks are a few kilobytes.
 */
import { normalizeVectorFields } from './avatar-looks.js?v=76eb9653';

/** MAX_OUTFITS (ImaginationYourLooksUI.as 54): looks on file, the current one counted. */
export const YOUR_LOOKS_MAX = 37;
/** "Any look you keep for more than 5 minutes is auto-saved." (486-487). */
export const YOUR_LOOKS_KEEP_MS = 5 * 60 * 1000;
export const YOUR_LOOKS_VERSION = 1;

/** The client's words (ImaginationYourLooksUI.as 94, 162-177, 470-489; AvatarLookUI.as 80, 211). */
export const YOUR_LOOKS_TEXT = Object.freeze({
  title: 'Your looks',
  current: 'Your current look',
  none: 'All we have on file is your current look, so no switching!',
  total: (n) => `You have ${Number(n).toLocaleString('en-US')} ${n === 1 ? 'look' : 'looks'} from your past that you can quickly switch to`,
  auto: 'Any look you keep for more than 5 minutes is auto-saved.',
  removeNote: 'You can permanently remove any you don’t like.',
  switchTip: 'Switch to this look',
  removeTip: 'Remove this look',
  remove: 'Remove',
  switching: 'Okay! Switching to this look...',
  confirmTitle: 'Remove this look from your history?',
  confirmText: 'If you remove this look, you will no longer be able to instantly switch to it. Are you sure you want to remove it?',
  confirmNo: 'No, never mind',
  confirmYes: 'Yes, remove it',
});

function finite(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
}

/** PURE: a look's saved fields, cleaned and in one key order (so equal looks compare equal). */
export function cleanLook(vector) {
  const v = normalizeVectorFields(vector && typeof vector === 'object' ? vector : {});
  for (const k of ['variant', 'tint', 'face']) if (v[k] && !Object.keys(v[k]).length) delete v[k];
  return sorted(v);
}

/** PURE: the stable id of a look (its cleaned fields as JSON). */
export function lookId(vector) {
  return JSON.stringify(cleanLook(vector));
}

/** PURE: a new record. */
export function createYourLooks() {
  return { v: YOUR_LOOKS_VERSION, list: [], wearing: { id: '', ms: 0 } };
}

/**
 * PURE: a saved record made safe: known fields, each look cleaned, one entry
 * per look (the newest kept), newest worn first, at most YOUR_LOOKS_MAX.
 * Entries: { look, at (last worn, ms), n (times worn) }.
 */
export function normalizeYourLooks(seed) {
  const out = createYourLooks();
  if (!seed || typeof seed !== 'object') return out;
  const seen = new Map();
  for (const raw of Array.isArray(seed.list) ? seed.list : []) {
    if (!raw || typeof raw !== 'object' || !raw.look || typeof raw.look !== 'object') continue;
    const look = cleanLook(raw.look);
    const id = JSON.stringify(look);
    const at = Math.max(0, Math.floor(finite(raw.at)));
    const n = Math.max(1, Math.floor(finite(raw.n, 1)));
    const had = seen.get(id);
    if (had && had.at >= at) continue;
    seen.set(id, { look, at, n });
  }
  out.list = [...seen.values()].sort((a, b) => b.at - a.at).slice(0, YOUR_LOOKS_MAX);
  const w = seed.wearing;
  if (w && typeof w === 'object' && typeof w.id === 'string') {
    out.wearing = { id: w.id.slice(0, 4000), ms: Math.max(0, Math.min(YOUR_LOOKS_KEEP_MS, Math.floor(finite(w.ms)))) };
  }
  return out;
}

/** PURE: the entry for a look, or null. */
export function findLook(state, vector) {
  const id = lookId(vector);
  return (state?.list || []).find((e) => JSON.stringify(e.look) === id) || null;
}

/**
 * PURE: put a look on file as worn now: a new entry first, or the one on file
 * moved first; the oldest falls off past YOUR_LOOKS_MAX. Mutates and returns state.
 */
export function recordLook(state, vector, now = Date.now(), { wear = true } = {}) {
  const look = cleanLook(vector);
  const id = JSON.stringify(look);
  const at = Math.max(0, Math.floor(finite(now, Date.now())));
  const i = state.list.findIndex((e) => JSON.stringify(e.look) === id);
  const entry = i >= 0 ? state.list.splice(i, 1)[0] : { look, at, n: 0 };
  entry.at = at;
  if (wear || i < 0) entry.n = Math.max(1, (entry.n || 0) + (wear ? 1 : 0));
  state.list.unshift(entry);
  state.list.length = Math.min(state.list.length, YOUR_LOOKS_MAX);
  return state;
}

/** PURE: take a look off file (Remove). True when one was removed. */
export function removeLook(state, vector) {
  const id = lookId(vector);
  const i = state.list.findIndex((e) => JSON.stringify(e.look) === id);
  if (i < 0) return false;
  state.list.splice(i, 1);
  return true;
}

/**
 * PURE: time spent in the look you wear. A new look starts its own count;
 * at YOUR_LOOKS_KEEP_MS it goes on file (or, already on file, its last worn
 * moves to now). Returns 'kept' the moment it does, '' otherwise.
 */
export function noteWear(state, vector, dtMs, now = Date.now()) {
  const id = lookId(vector);
  if (state.wearing.id !== id) state.wearing = { id, ms: 0 };
  if (state.wearing.ms >= YOUR_LOOKS_KEEP_MS) return '';
  state.wearing.ms = Math.min(YOUR_LOOKS_KEEP_MS, state.wearing.ms + Math.max(0, finite(dtMs)));
  if (state.wearing.ms < YOUR_LOOKS_KEEP_MS) return '';
  recordLook(state, vector, now, { wear: !findLook(state, vector) });
  return 'kept';
}

/**
 * PURE: switch to a look on file: it is worn now (last worn, one more wear)
 * and counts as kept, so it stays on file. Returns its entry, or null.
 */
export function wearLook(state, vector, now = Date.now()) {
  if (!findLook(state, vector)) return null;
  recordLook(state, vector, now);
  state.wearing = { id: lookId(vector), ms: YOUR_LOOKS_KEEP_MS };
  return state.list[0];
}

/** PURE: the looks you can switch to (every one on file but the one you wear), newest worn first. */
export function pastLooks(state, currentVector) {
  const id = lookId(currentVector);
  return (state?.list || []).filter((e) => JSON.stringify(e.look) !== id);
}

/** PURE: the line over the row (onAPIComplete 470-480): how many you can switch to. */
export function totalLine(pastCount) {
  return pastCount > 0 ? YOUR_LOOKS_TEXT.total(pastCount) : YOUR_LOOKS_TEXT.none;
}
