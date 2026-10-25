/**
 * Conversations (register G189): the player's one conversation record and
 * the source's offer, chain and completion rules, shared by every teller:
 * animals, trees, rocks, peat bogs, barnacles, patches, shrines
 * (js/conversations-data.js) and the Street Spirits
 * (js/street-spirit-talks.js). The world side is
 * features/conversations-feature.js.
 *
 * Source (Tiny Speck GameServerJS, CC0), players/inc_conversations.js:
 * - The record (conversations_init 1-12): completed and offered, each
 *   { [class_tsid]: { [id]: time } }, last_offer, chains_completed and
 *   chains_inprogress ({ [chain id]: time }).
 * - conversations_has_completed 39-53: completed with the named class, or
 *   any class when none is named.
 * - conversations_has_offered 55-80: offered within 30 minutes (10 s on dev
 *   servers); the first class holding the id decides.
 * - conversations_offer 82-113: never when completed or offered (83), the
 *   teller is rooked or poisoned (84-85), within 5 minutes of login (88,
 *   not on dev), within 10 s of arriving on the street (89), within the
 *   timeout of the last offer or the last completion (91-95: 30 minutes, 15
 *   s while a chain is in progress; 10 s and 5 s on dev), before
 *   donate_to_all_shrines is done (97-100, not on dev), or when the
 *   conversation's own conversation_canoffer_<id> says no (102-105). It then
 *   records the offer under the teller's class and the time (107-110).
 * - conversations_complete 120-144: drops the offer from every class, records
 *   the completion under the teller's class, and moves the chain on: the last
 *   level marks the chain completed and deletes chains_inprogress outright
 *   (136: every chain in progress, not just this one), any other level marks
 *   it in progress.
 * - conversations_offered_for_class 146-155: every id the class has offered,
 *   expired or not (the Talk to list of animals, trees, rocks and patches);
 *   conversations_offered_for_item 157-165: the item's own conversations
 *   offered by any class and not expired (the shrines).
 * - conversations_can_do_chain 222-235: a conversation outside a chain waits
 *   while any chain is in progress; a chain's conversation waits while a
 *   different chain is.
 * - convo_bubble_choices 237-260: the call-out, 10 s.
 *
 * Not carried over: conversations_set_current_state / conversations_login
 * (178-220) resume a conversation cut off by a logout; here closing the
 * dialogue keeps it offered, so Talk to starts it again. The source also
 * waits 60 s after donate_to_all_shrines finishes (99); the remake's quest
 * record keeps no finish time, so that minute is not held.
 *
 * `heard` is the remake's own: when the player first opened each
 * conversation (the source keeps only the one in progress).
 */

import { CONVERSATIONS, TELLERS } from './conversations-data.js?v=g189-1';

export const CONVERSATION_RULES_SOURCE = 'tinyspeck/glitch-GameServerJS players/inc_conversations.js (CC0)';

const MINUTE = 60 * 1000;

/** inc_conversations.js timings. */
export const CONVERSATION_RULES = Object.freeze({
  offerTimeoutMs: 30 * MINUTE, // 59, 91
  devTimeoutMs: 10 * 1000, // 59, 91 (config.is_dev)
  chainTimeoutMs: 15 * 1000, // 92
  devChainTimeoutMs: 5 * 1000, // 92
  loginGraceMs: 5 * MINUTE, // 88
  streetDwellMs: 10 * 1000, // 89
  bubbleMs: 10000, // 258
  shrineQuest: 'donate_to_all_shrines', // 97-100
});

/** inc_conversations.js 237-251, in order. */
export const CONVO_BUBBLE_CHOICES = Object.freeze([
  "Hey {pc_label}, come here, I've got something to tell you!",
  'Hey! {pc_label}! Come talk to me!',
  '{pc_label}! Talk to me? I know secrets.',
  'Say, {pc_label}? You want secrets? Talk to me.',
  'Psssssst! {pc_label}! Talk to me!',
  'Hey! {pc_label}! Talk to me! Here! Me! {pc_label}!',
  'Hey hey hey! Hey! {pc_label}! Hey! Talk to me!',
  'Oy, {pc_label}! Talk to me! I have secrets.',
  'Psst, {pc_label}… Pssst, talk to me!… {pc_label}!',
  '{pc_label}? Want to know what I know? Talk to me!',
  'I know stuff about stuff, {pc_label}. Curious? Talk to me.',
  'Hello? {pc_label}? C’mere. Talk to me.',
  '{pc_label}! Pssssst! Talk to me! {pc_label}!',
]);

/** The call-out bubble (choose_one in the source; `pick` in [0, 1)). The remake has no player names, so {pc_label} reads "friend". */
export function offerBubble(pick = Math.random(), label = 'friend') {
  const i = Math.min(CONVO_BUBBLE_CHOICES.length - 1, Math.max(0, Math.floor(pick * CONVO_BUBBLE_CHOICES.length)));
  // A name opening a sentence is capitalized, as the source's player names were.
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return CONVO_BUBBLE_CHOICES[i].replace(/(^|[.!?…]\s*)\{pc_label\}/g, `$1${cap}`).replace(/\{pc_label\}/g, label);
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);

function cleanFlat(raw) {
  const out = {};
  if (!isMap(raw)) return out;
  for (const [id, ts] of Object.entries(raw)) if (/^\w+$/.test(id) && num(ts)) out[id] = num(ts);
  return out;
}

function cleanByClass(raw) {
  const out = {};
  if (!isMap(raw)) return out;
  for (const [cls, ids] of Object.entries(raw)) {
    const row = cleanFlat(ids);
    if (Object.keys(row).length) out[cls] = row;
  }
  return out;
}

/** The record, shaped like pc.conversations (plus `heard`). */
export function normalizeRecord(raw = {}) {
  const src = isMap(raw) ? raw : {};
  return {
    completed: cleanByClass(src.completed),
    offered: cleanByClass(src.offered),
    lastOffer: num(src.lastOffer),
    chainsCompleted: cleanFlat(src.chainsCompleted),
    chainsInProgress: cleanFlat(src.chainsInProgress),
    heard: cleanFlat(src.heard),
  };
}

/** conversations_has_completed(class_id, id). */
export function hasCompleted(record, id, cls = null) {
  if (cls) return Boolean(record.completed?.[cls]?.[id]);
  return Object.values(record.completed || {}).some((row) => Boolean(row?.[id]));
}

/** conversations_has_offered(class_id, id): the first class holding the id decides. */
export function hasOffered(record, id, now, timeoutMs = CONVERSATION_RULES.offerTimeoutMs, cls = null) {
  const rows = cls ? [record.offered?.[cls]] : Object.values(record.offered || {});
  for (const row of rows) {
    if (row?.[id]) return now - row[id] < timeoutMs;
  }
  return false;
}

/** conversations_get_last_completed_conversation 167-176. */
export function lastCompleted(record) {
  let high = 0;
  for (const row of Object.values(record.completed || {})) for (const ts of Object.values(row || {})) high = Math.max(high, ts);
  return high;
}

/** conversations_can_do_chain 222-235. */
export function canDoChain(record, chain) {
  const inProgress = Object.keys(record.chainsInProgress || {});
  if (!chain && !inProgress.length) return true;
  if (chain && record.chainsInProgress?.[chain.id]) return true;
  if (inProgress.length) return false;
  return true;
}

/**
 * The checks every offer makes (conversations_offer 83-100) before the
 * conversation's own gate. ctx: { now, dev, sessionStart, streetEnteredAt,
 * shrinesDone, rooked, poisoned }. Returns { ok, reason }.
 */
export function offerRules(record, id, ctx = {}) {
  const now = num(ctx.now) || Date.now();
  const dev = Boolean(ctx.dev);
  const expiry = dev ? CONVERSATION_RULES.devTimeoutMs : CONVERSATION_RULES.offerTimeoutMs;
  if (hasCompleted(record, id)) return { ok: false, reason: 'completed' };
  if (hasOffered(record, id, now, expiry)) return { ok: false, reason: 'offered' };
  if (ctx.rooked) return { ok: false, reason: 'rooked' };
  if (ctx.poisoned) return { ok: false, reason: 'poisoned' };
  if (!dev && now - num(ctx.sessionStart) < CONVERSATION_RULES.loginGraceMs) return { ok: false, reason: 'login' };
  if (now - num(ctx.streetEnteredAt) < CONVERSATION_RULES.streetDwellMs) return { ok: false, reason: 'street' };
  let gap = expiry;
  if (Object.keys(record.chainsInProgress || {}).length) gap = dev ? CONVERSATION_RULES.devChainTimeoutMs : CONVERSATION_RULES.chainTimeoutMs;
  if (record.lastOffer > now - gap) return { ok: false, reason: 'cooldown' };
  if (lastCompleted(record) > now - gap) return { ok: false, reason: 'cooldown' };
  if (!dev && !ctx.shrinesDone) return { ok: false, reason: CONVERSATION_RULES.shrineQuest };
  return { ok: true, reason: '' };
}

/** conversations_offer 107-110: record the offer. */
export function recordOffer(record, cls, id, now = Date.now()) {
  record.offered[cls] ||= {};
  record.offered[cls][id] = now;
  record.lastOffer = now;
}

/** conversations_complete 120-144. */
export function completeConversation(record, cls, id, chain = null, now = Date.now()) {
  for (const [c, row] of Object.entries(record.offered)) {
    if (!row?.[id]) continue;
    delete row[id];
    if (!Object.keys(row).length) delete record.offered[c];
  }
  record.completed[cls] ||= {};
  record.completed[cls][id] = now;
  if (chain) {
    if (chain.level === chain.max) {
      record.chainsCompleted[chain.id] = now;
      // 136: `delete this.conversations.chains_inprogress`, every chain at once.
      record.chainsInProgress = {};
    } else {
      record.chainsInProgress[chain.id] = now;
    }
  }
  return true;
}

/** The remake's `heard`: the first time the player opened a conversation. */
export function markHeard(record, id, now = Date.now()) {
  if (!record.heard[id]) record.heard[id] = now;
}

/** conversations_offered_for_class: every id this class has offered (expired offers stay until told). */
export function offeredForClass(record, cls) {
  return Object.keys(record.offered?.[cls] || {});
}

/** conversations_offered_for_item: the item's own conversations offered by any class, not expired. */
export function offeredForItem(record, list, now = Date.now(), dev = false) {
  const expiry = dev ? CONVERSATION_RULES.devTimeoutMs : CONVERSATION_RULES.offerTimeoutMs;
  return (list || []).filter((id) => hasOffered(record, id, now, expiry));
}

// ---------------------------------------------------------------------------
// The data conversations (conversations-data.js)
// ---------------------------------------------------------------------------

/** conversation_canoffer_<id>: the chain, then level, quest and earlier conversations. ctx: { level, questDone(id) }. */
export function gateCheck(record, id, ctx = {}) {
  const def = CONVERSATIONS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (!canDoChain(record, def.chain)) return { ok: false, reason: 'chain' };
  if (def.gate.level && (Number(ctx.level) || 0) < def.gate.level) return { ok: false, reason: `level:${def.gate.level}` };
  if (def.gate.quest && !(typeof ctx.questDone === 'function' && ctx.questDone(def.gate.quest))) return { ok: false, reason: `quest:${def.gate.quest}` };
  for (const after of def.gate.after) if (!hasCompleted(record, after)) return { ok: false, reason: `gate:${after}` };
  return { ok: true, reason: '' };
}

/** conversations_offer for one data conversation from one teller class. */
export function canOfferConversation(record, cls, id, ctx = {}) {
  if (!TELLERS[cls]?.list.includes(id)) return { ok: false, reason: 'teller' };
  const rules = offerRules(record, id, ctx);
  if (!rules.ok) return rules;
  return gateCheck(record, id, ctx);
}

/**
 * onPlayerCollision: offer the first conversation in the class's list that
 * can be, recording it. Returns { id, reason } (id '' when none; reason is
 * why the first not-yet-told conversation was held).
 */
export function offerFor(record, cls, ctx = {}) {
  let reason = 'none';
  for (const id of TELLERS[cls]?.list || []) {
    const res = canOfferConversation(record, cls, id, ctx);
    if (res.ok) {
      recordOffer(record, cls, id, num(ctx.now) || Date.now());
      return { id, reason: '' };
    }
    if (reason === 'none' && res.reason !== 'completed') reason = res.reason;
  }
  return { id: '', reason };
}

/** The talk_to verb's list for a teller: by class, or by item for the shrines. */
export function talkableFor(record, cls, now = Date.now(), dev = false) {
  const t = TELLERS[cls];
  if (!t) return [];
  const ids = t.talk === 'item' ? offeredForItem(record, t.list, now, dev) : offeredForClass(record, cls);
  // talk_to runs the first that has a conversation_run_ on this class.
  return ids.filter((id) => t.list.includes(id));
}

/** Scripted-dialogue beats: the teller's line with its one answer. */
export function conversationBeats(id) {
  return (CONVERSATIONS[id]?.steps || []).map((s) => ({ text: s.text, response: s.choice }));
}

/** Every conversation that must be completed before `id` can be offered, earliest first. */
export function prerequisitesOf(id, defs = CONVERSATIONS) {
  const out = [];
  const seen = new Set();
  const visit = (cur) => {
    for (const after of defs[cur]?.gate?.after || []) {
      if (seen.has(after)) continue;
      seen.add(after);
      visit(after);
      out.push(after);
    }
  };
  visit(id);
  return out;
}

// ---------------------------------------------------------------------------
// The player's one record (saved by the conversations feature)
// ---------------------------------------------------------------------------

let record = normalizeRecord();
let legacy = null;
const restoreHooks = [];

/** Run `fn` after every restore (features re-apply QA seeds the restore replaced). */
export function afterRecordRestore(fn) {
  if (typeof fn === 'function' && !restoreHooks.includes(fn)) restoreHooks.push(fn);
}

/** The live record every teller reads and writes. */
export function conversationRecord() {
  return record;
}

/**
 * Fold an older record (the Street Spirits' saved ledger, register G185,
 * shaped { completed, offered, lastOffer }) into `into`: completions and the
 * last offer keep the later time, and an offer already told is not revived.
 */
export function mergeRecords(into, older) {
  const src = normalizeRecord(older);
  for (const [cls, row] of Object.entries(src.completed)) {
    into.completed[cls] ||= {};
    for (const [id, ts] of Object.entries(row)) into.completed[cls][id] = Math.max(into.completed[cls][id] || 0, ts);
  }
  for (const [cls, row] of Object.entries(src.offered)) {
    for (const [id, ts] of Object.entries(row)) {
      if (hasCompleted(into, id)) continue;
      into.offered[cls] ||= {};
      into.offered[cls][id] = Math.max(into.offered[cls][id] || 0, ts);
    }
  }
  into.lastOffer = Math.max(into.lastOffer, src.lastOffer);
  for (const key of ['chainsCompleted', 'chainsInProgress', 'heard']) {
    for (const [id, ts] of Object.entries(src[key])) into[key][id] = Math.max(into[key][id] || 0, ts);
  }
  return into;
}

const hasData = (r) => Object.keys(r.completed).length > 0 || Object.keys(r.offered).length > 0 || r.lastOffer > 0;

/** restore(): the saved record, with any older ledger handed over this load. */
export function restoreConversationRecord(slice) {
  record = normalizeRecord(slice);
  if (legacy) mergeRecords(record, legacy);
  legacy = null;
  for (const fn of restoreHooks) fn(record);
  return record;
}

/**
 * The Street Spirits' restore hands over its old ledger (saves made before
 * G189). It is folded into the record now and again if the record is
 * restored after it, so feature order does not matter.
 */
export function adoptLegacyTalks(slice) {
  const old = normalizeRecord(slice);
  legacy = hasData(old) ? old : null;
  if (legacy) mergeRecords(record, legacy);
  return Boolean(legacy);
}

/** Tests: start a clean record. */
export function resetConversationRecord(raw = {}) {
  record = normalizeRecord(raw);
  legacy = null;
  restoreHooks.length = 0;
  return record;
}
