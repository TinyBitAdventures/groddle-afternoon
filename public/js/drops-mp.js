/**
 * Stacks dropped on a public street, or at a player's home (their home street,
 * house and Tower floors), for everyone in multiplayer (register G332; home
 * streets: report #173; house and Tower: G1190): the
 * pure rules and words. features/drops-mp-feature.js talks to the
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
 * A home street (report #173, Austin 2026-11-10: "visitors' and owners' drops
 * are seen by everyone there, as on public streets"): in the original a home
 * street was a location like any other, so the same drop and pickup rules ran
 * there. Ours there: a stack's x is kept from the house (the remake's home
 * street grows to the left and moves the house; drops.go "A home street"),
 * and food (the trade table's "food", include/food.js) the owner
 * drops on their own home street stays their own, because their own animals
 * there eat from the owner's own stacks (animal-husbandry-feature yardFood,
 * animal-mood-feature) and the server holds no home street animals to eat a
 * shared one.
 *
 * The house (with its back yard) and the Tower's floors (G1190, Austin
 * 2026-11-23: "make house floors shared as in Glitch", reversing the
 * 2026-11-10 ruling): the original's house and Tower were locations like the
 * street too (takeable.js 5-51, 157-213), so a stack dropped there is
 * everyone's there, HOUSE_<owner> and TOWER_<owner>_<floor> on the server:
 * the dropper's 100 px guard, then the first pickup, owner, key-holder or
 * visitor alike. The one home rule, house_lock (takeable.js 33-36, 179-198;
 * main.js doModifyItem 4870-4891), locked to the owner what the owner set on
 * a furniture plat in their house or Tower: here that is what the owner sets
 * down in Decoration Mode, which stays in the owner's own save, and visitors
 * see it locked (neighbours-mp-feature, the site's Neighbours::stackRows),
 * as they see the owner's stacks dropped there before G1190. In the house x
 * is kept from the house's left end, as on the home street; a Tower floor
 * keeps its own x. Every floor of the house is the house (R5, G1313): an
 * upper floor (HOUSE_<owner>_<floor>, G153) is shared as the ground floor is,
 * its x its own.
 *
 * Ours: a class the ledger does not carry (the trade table), a note (its
 * writing would not travel) and anything dropped in a private place (a
 * party space, a race) stay the player's own, as in solo; a stack nobody
 * picks up in seven days goes back to its dropper, but for the owner's own
 * at their own home. A copy's own words (a Cubimal's
 * name ...) ride with a one-copy stack as "t", as its wear rides as "r".
 */

import { cleanCopyTag } from './tools.js?v=4156bba8';
import { pileMaxOf } from './world-items.js?v=93313aad';

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
  // R50: Decoration Mode set a stack dropped here for everyone down as the owner's own (game.js dropPackStackAt's line).
  claimed: (n, label) => `You set down ${n}× ${label}.`,
  notHome: 'Only the owner can set that down here.', // ours: Decoration Mode is the owner's
  moving: 'Wait a moment, you are still moving something.', // ours, one move at a time (drops.go)
  picking: 'Wait a moment, you are still picking something up.', // ours, one pickup at a time (drops.go)
  by: (name) => `Dropped by ${name}`, // ours
  busy: 'Wait a moment, you are still dropping something.', // drops.go
  slow: 'Slow down a little.', // drops.go allow (slow_down)
  // drops.go dropTextFull (the server's line) says "street" everywhere. Only a street fills (dropStreetMax 60):
  // a house or Tower floor holds any number since G1224, so the place named is a street in practice.
  full: (place) => `This ${place} can't hold any more dropped things.`,
  gone: 'That stack has already been picked up.', // the game's own
  locked: 'You are not allowed to pick this up.', // takeable.js:39
  // G1306: a drop or pickup refused offline says js/online-request.js offlineLine ("Reconnecting...").
  // The drop verb's tooltip on every item (e.g. items/apple.js:84): the pack's drop prompt when the
  // stack is dropped for everyone (on a street those never merge; a house floor's do: drops.go).
  prompt: 'Drop it on the ground.',
});

/**
 * drops.go allow (dropBurst 6, dropEvery 1 s, party.go bucket.take): every ground_drop and
 * ground_pickup takes a token from the player's bucket of 6, one back a second; a frame over it gets
 * only a slow_down error, never its answer. The client keeps the same bucket so it never sends one.
 */
export const DROP_RATE = Object.freeze({ burst: 6, everyMs: 1000 });

/** How many drops may wait their turn behind the one the server is weighing. */
export const DROP_QUEUE_MAX = 12;

/**
 * PURE: take a token from `b` ({ tokens, at }, changed in place) at `now`, as party.go bucket.take:
 * { ok: true } when one was there, else { ok: false, waitMs } until the next one is.
 */
export function bucketTake(b, now, { burst = DROP_RATE.burst, everyMs = DROP_RATE.everyMs } = {}) {
  const t = Number(now) || 0;
  b.tokens = b.at ? Math.min(burst, (Number(b.tokens) || 0) + (t - b.at) / everyMs) : burst;
  b.at = t;
  if (b.tokens < 1) return { ok: false, waitMs: Math.max(1, Math.ceil((1 - b.tokens) * everyMs)) };
  b.tokens -= 1;
  return { ok: true };
}

/**
 * What a full place is called in its refusal (drops.go refuses "full" at dropStreetMax stacks on any
 * shared place): 'house' for a house with its back yard, 'Tower floor', else 'street'.
 */
export function fullPlaceName(street) {
  const home = homePlaceOf(street);
  if (home?.room === 'interior') return 'house';
  if (home?.room === 'tower') return 'Tower floor';
  return 'street';
}

/**
 * The words for a drop the server refused: its own, but a full place named as what it is. Report #691:
 * "waiting" (the site's Ledger::waitingFor) is an item in the pack past today's limit, not in the ledger
 * until the next 00:00 UTC: the site's words name it and say when, and should they not come (an older
 * site), the drop's own (`drop`: { n, one, many }, the class's names) say the same.
 */
export function dropRefusalText(msg, street = '', drop = null, now = Date.now()) {
  if (String(msg?.why || '') === 'full') return DROP_TEXT.full(fullPlaceName(street || msg?.street));
  if (String(msg?.why || '') === 'waiting' && !msg?.text && drop) {
    const clears = Number(msg?.clears) > 0 ? Number(msg.clears) * 1000 : nextUtcDay(now);
    return waitingText({ ...drop, verb: 'drop', now, clears });
  }
  return String(msg?.text || "That didn't work.");
}

/** #691: the next 00:00 UTC after `now` (ms), when the day's limits start again (the site's LedgerMath::nextDay). */
export function nextUtcDay(now) {
  return (Math.floor((Number(now) || 0) / 86400000) + 1) * 86400000;
}

/** #691: "in 25 minutes", "in about 3 hours" (the site's LedgerMath::untilText). */
export function untilText(ms) {
  const m = Math.max(1, Math.ceil((Number(ms) || 0) / 60000));
  if (m < 60) return m === 1 ? 'in 1 minute' : `in ${m} minutes`;
  const h = Math.max(1, Math.round(m / 60));
  return h === 1 ? 'in about 1 hour' : `in about ${h} hours`;
}

/**
 * #691: why an act is refused when `k` of the `n` it takes are in the pack but past today's limit
 * (Gameshow Tickets, beads, artifact pieces ...; never an emblem, G1299): the same words as the site's
 * LedgerMath::waitingText, "This Gameshow Ticket is past today's limit, so it isn't counted yet. You can
 * drop it after midnight UTC (in about 3 hours)." `one` and `many` are the class's names; `currants`
 * names the player's currants.
 */
export function waitingText({ one = 'item', many = one, n = 1, k = n, verb = 'drop', now = Date.now(), clears = nextUtcDay(now), currants = false } = {}) {
  const count = (x) => Number(x).toLocaleString('en-US');
  let single = k === 1;
  let who;
  if (currants) who = `${count(k)} of your currants`;
  else if (n === 1) who = `This ${one}`;
  else if (k === n) {
    who = `These ${count(n)} ${many}`;
    single = false;
  } else who = `${count(k)} of these ${many}`;
  const rest = single ? ` is past today's limit, so it isn't counted yet. You can ${verb} it` : ` are past today's limit, so they aren't counted yet. You can ${verb} them`;
  return `${who}${rest} after midnight UTC (${untilText(clears - now)}).`;
}

/** A public street others share (realtime-feature sharedStreet; drops.go dropShared: no "_" in the id). */
export function isPublicStreet(street) {
  const s = String(street || '');
  return Boolean(s) && !s.includes('_');
}

/** Whose home street a realtime street is (homes.go HOME_<owner>; drops.go dropHomeOwner), or 0. */
export function homeStreetOwner(street) {
  const m = /^HOME_([1-9][0-9]{0,17})$/.exec(String(street || ''));
  return m ? Number(m[1]) : 0;
}

/**
 * The home a realtime street is (homes.go: HOME_<owner>, HOUSE_<owner>, HOUSE_<owner>_<floor>,
 * TOWER_<owner>_<floor>): { owner, room: 'street' | 'interior' | 'tower', floor }, or null for any
 * other street. Every floor of the house is the house (R5, G1313; js/home-floors.js): an upper
 * floor is room 'interior' with its floor (1 or 2), shared as the ground floor is.
 */
export function homePlaceOf(street) {
  const m = /^(HOME|HOUSE)_([1-9][0-9]{0,17})$|^TOWER_([1-9][0-9]{0,17})_([0-9])$|^HOUSE_([1-9][0-9]{0,17})_([12])$/.exec(String(street || ''));
  if (!m) return null;
  if (m[3]) return { owner: Number(m[3]), room: 'tower', floor: Number(m[4]) };
  if (m[5]) return { owner: Number(m[5]), room: 'interior', floor: Number(m[6]) };
  return { owner: Number(m[2]), room: m[1] === 'HOUSE' ? 'interior' : 'street', floor: 0 };
}

/** A street whose drops are everyone's: a public street, or a player's home street, house or Tower floor (drops.go dropShared). */
export function isSharedStreet(street) {
  return isPublicStreet(street) || homePlaceOf(street) != null;
}

/**
 * The classes a player keeps their own on a shared street, house or Tower floor, and why (shareReason):
 * a note's writing would not travel; a Still works on the ground (#285: Distill, Collect, its hopper
 * running), and the shared ground keeps a stack's words but has no verbs to change them. Glitch let only
 * a home's owner pick a Still up there (items/still.js canPickup 386-389). The one list: the site's
 * economy table carries it as each class's "own" (tools/build-economy.mjs), which its house-floor move
 * reads (groddle-afternoon-site src/HouseFloors.php stays; report #670).
 */
export const KEPT_OWN = Object.freeze({ note: 'note', still: 'works' });

/**
 * Whether a pack stack is dropped for everyone: '' when it is, else why it
 * stays the player's own (the game then drops it as in solo).
 * street: the realtime street; ownHome: the player stands at their own home;
 * herdFood: their animals on their home street eat the class. (sceneKey and
 * dropKey, the game's names for the place, are checked by the feature: a
 * shared place is one the server and the scene agree on.)
 */
export function shareReason(classTsid, table, { street = '', ownHome = false, herdFood = false } = {}) {
  const c = String(classTsid || '');
  if (!isSharedStreet(street)) return 'private';
  if (!table?.items) return 'table';
  if (!table.items[c]) return 'type';
  // A note, and a Still (#285), stay the player's own (KEPT_OWN).
  if (Object.hasOwn(KEPT_OWN, c)) return KEPT_OWN[c];
  if (ownHome && herdFood && homeStreetOwner(street) > 0) return 'herd'; // the owner's animals eat it from the owner's own stacks
  return '';
}

/** A house (with its back yard) or a Tower floor (drops.go dropIndoors): where like stacks join. */
export function isFloorPlace(street) {
  const room = homePlaceOf(street)?.room;
  return room === 'interior' || room === 'tower';
}

/** The radius a drop on a house or Tower floor joins a like stack in (drops.go dropMergeRadius). */
export const DROP_MERGE_RADIUS = 100;

/**
 * PURE: the like stack a drop joins on a house or Tower floor, as drops.go mergeTarget decides it, or
 * null. `stacks`: the place's stacks as the server keeps them ({ id, classTsid, count, x, y, by, r?, t? });
 * `drop`: { c, x, y (server x, without the house's ox), by (the dropper's id), into (the stack it was
 * set on), merge (false: beside one), words (it carries wear or words) }; `row`: the class's trade row
 * (none: the table is not loaded). A like stack: the same class, no wear or words, below the class's pile
 * (js/world-items.js pileMaxOf: at home no stack limit, drops.go pileMax), the dropper's own.
 */
export function likeSharedStack(stacks, street, drop = {}, row = null) {
  if (!isFloorPlace(street) || drop.words || !row) return null;
  const limit = pileMaxOf(drop.c);
  if (limit < 2) return null;
  const like = (s) => s && s.classTsid === drop.c && s.r == null && s.t == null && s.count < limit && Number(s.by?.id) === Number(drop.by);
  const list = Array.isArray(stacks) ? stacks : [...(stacks?.values?.() || [])];
  if (drop.into) return like(list.find((s) => s.id === drop.into)) ? list.find((s) => s.id === drop.into) : null;
  if (drop.merge === false) return null;
  let best = null;
  let bestD = 0;
  for (const s of list) {
    if (!like(s)) continue;
    const d = Math.hypot(s.x - finite(drop.x), s.y - finite(drop.y));
    if (d >= DROP_MERGE_RADIUS) continue;
    if (!best || d < bestD || (d === bestD && s.id < best.id)) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** A stack as the server keeps it (x from the house on a home street), set where this game draws it. */
export function stackAt(stack, ox = 0) {
  const d = Math.round(Number(ox) || 0);
  return stack && d ? { ...stack, x: stack.x + d } : stack;
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
  // One copy's own words (a named Cubimal on the ground shows its name: game.js reads tags[0]).
  const t = count === 1 && raw.t != null ? cleanCopyTag(classTsid, raw.t) : null;
  if (t != null) {
    out.t = t;
    out.tags = [t];
  }
  return out;
}

/**
 * A stack after some of it went (a street Piggy ate one, drops.go ground_eaten; someone picked up a
 * part, ground_left): n left, or null when none is.
 */
export function stackLeft(stack, n) {
  const left = Math.floor(finite(n));
  if (!stack || left < 1) return null;
  return { ...stack, count: left, subtitle: `${DROP_TEXT.by(stack.by?.name || 'Someone')} · ${left} in this pile` };
}

/** A stack after a street Piggy ate one (drops.go ground_eaten). */
export const eatenStack = stackLeft;

/**
 * The count a Pick up of a shared stack sends (drops.go ground_pickup n): what was chosen and fits,
 * at least one; null asks for the whole stack (no count, or all of it).
 */
export function pickupAsk(stackCount, count) {
  const have = Math.max(1, Math.floor(finite(stackCount, 1)));
  const want = Math.floor(finite(count, have));
  return want >= 1 && want < have ? want : null;
}

/** The animalKey of the street Piggy a server id names ("pig:2"; js/street-objects.js streetPigIndex), or ''. */
export function pigAnimalKey(street, pig) {
  const m = /^pig:(\d{1,2})$/.exec(String(pig || ''));
  return m && street ? `${street}:npc_piggy:${Number(m[1])}` : '';
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
  const t = n === 1 && raw.t != null ? cleanCopyTag(c, raw.t) : null;
  if (t != null) out.t = t;
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
  const tool = it.r != null || it.t != null ? { c: it.c, r: it.r ?? null, ...(it.t != null ? { t: it.t } : {}) } : null;
  if (side === 'back') return { pack: { [it.c]: it.n }, tool, line: DROP_TEXT.back(it.n, name), sound: 'ITEM_PICKUP' };
  return { pack: { [it.c]: it.n }, tool, line: DROP_TEXT.picked(it.n, name), sound: 'ITEM_PICKUP' };
}

/**
 * A take's op: the stack's id and -t for the whole of it, -t<from> for a part (the site's
 * LedgerDrop takePart: from is the count it was taken from, so each part has its own), and
 * -t<from>-g<gen> for a part of a stack a merge on a house floor has grown (LedgerDrop partId).
 */
export function isTakeOp(op, id) {
  const o = String(op || '');
  return DROP_OP.test(String(id || '')) && o.startsWith(`${id}-t`) && /^(?:[1-9][0-9]{0,3}(?:-g[1-9][0-9]{0,8})?)?$/.test(o.slice(String(id).length + 2));
}

/** A row of GET groddle/v1/drops as an op the save applies: { op, side, item } or null. */
export function normalizeMine(row) {
  const op = String(row?.op || '');
  const id = String(row?.id || '');
  if (!DROP_OP.test(id) || (op !== id && !isTakeOp(op, id))) return null;
  const item = normalizeItem(row?.item);
  if (!item) return null;
  const side = op === id ? 'dropped' : row?.why === 'return' ? 'back' : 'took';
  return { op, id, side, item };
}
