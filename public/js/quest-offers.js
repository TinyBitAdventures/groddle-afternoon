/**
 * Quest offers + progress routing: the general engine behind the original
 * game's 441 mined quests (players/inc_quests.js, quests/quest.js,
 * items/include/npc_quests.js, players/inc_familiar.js in glitch-GameServerJS).
 *
 * Pure functions over `questState` (from quests.js createQuestState). All new
 * persistent state lives under `questState.offers`; run it through
 * normalizeQuestOfferState when loading a save.
 *
 * How the original worked, and what this module reproduces:
 *  - quests_offer(): a quest is offered when its prereq_quests are done,
 *    canOffer() passes and its status is 'none' (or 'done' and repeatable).
 *    Callers were level-ups (quests_level_map, offered once you are 5% into
 *    the level), skill learning (skills_get_quest_map), XP thresholds,
 *    quest completion code (chains), achievements, and named hooks.
 *  - Only one offer every 5 minutes (last_quest_offer, quests_offer_queue);
 *    is_emergency quests skip the wait. The 'turn_off_quests' buff holds all.
 *  - The Magic Rock familiar delivers offers one at a time.
 *  - "Not right now" on a familiar offer leaves the quest in the log as
 *    offered-not-accepted. It is never auto-offered again, but can be
 *    accepted from the log at any time. Declining an NPC offer records
 *    nothing: the NPC asks again next time you talk (npc_conversation.js).
 *  - NPC givers (setAvailableQuests) check `prerequisites` (has_skill,
 *    over_level, has_achievement, ...) as well as prereq_quests.
 *  - Accept runs doProvided (items from the familiar), then init_reqs:
 *    item requirements count what is already in the pack and
 *    `acquired_<item>` flags are pre-set if you hold the item.
 *  - Counters advance only while the quest is accepted; item requirements
 *    track the pack count (and can go back down); `remove: true` item
 *    requirements are destroyed on completion (tryComplete).
 *  - Timed quests apply a timer buff in onStarted; when it runs out the
 *    quest fails, progress resets and it can be started again.
 *  - Completion: familiar_turnin quests are turned in through the familiar
 *    (completion text + rewards); end_npcs quests at those NPCs.
 *
 * Exported API (see each function's doc):
 *   OFFER_INTERVAL_MS, LEVEL_OFFER_FRACTION, COUNTER_ROUTES, EMITTED_EVENTS
 *   normalizeQuestOfferState(seed) / ensureQuestOfferState(questState)
 *   classifyQuests(catalog) / questOfferIndex(catalog)
 *   questStatus(questState, id)
 *   prerequisitesMet(def, questState, pc, ctx) / triggerMet(trigger, def, questState, pc, ctx)
 *   pendingQuestOffers(questState, pc, ctx) / nextQuestOffer(questState, pc, ctx)
 *   npcQuestOffers(questState, npcClass, pc, ctx)
 *   enqueueQuestOffer(questState, id) / markOffered / declineOffer / acceptOffer
 *   listDeclinedOffers(questState)
 *   routeQuestEvent(questState, event, amount, ctx) / syncItemRequirements(questState, inv, ctx)
 *   eventCounters(event) / requirementRoute(req) / isEventEmitted(event) / questRoutingReport(catalog)
 *   questEventsForVerb(classTsid, verbId, achievementEvents)
 *   turnInQuest(questState, id, pc, ctx)
 *   tickQuestTimers(questState, now) / restartTimedQuest(questState, id, now)
 *
 * ctx (all optional): { level, xp, skills, achievements, inv, buffs, hub,
 *   region, street, events, streetsVisited, emblemsMax, recipes, now,
 *   includeCustom, addItem, removeItem, countItem, learnRecipe,
 *   customPrereq(id, prereq) }
 */

import { VENDOR_NPCS, VENDOR_NPC_CLASSES } from './vendor-npcs.js';
import { getQuestCatalog } from './content-catalogs.js';
import { levelInfoForXp } from './progression.js';
import {
  assignQuest,
  completeQuest,
  applyQuestRewards,
  parseQuestConversation,
  cleanQuestMarkup,
  eventToCounter,
} from './quests.js';

/** Original: only one offer every 5 minutes (quests_offer delay = 60 * 5). */
export const OFFER_INTERVAL_MS = 5 * 60 * 1000;
/** quests_give_level_do: offered once XP is 5% into the mapped level. */
export const LEVEL_OFFER_FRACTION = 0.05;

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

const finiteInt = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
};
const cleanId = (value) => String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');

function cleanTimeMap(seed) {
  const out = {};
  for (const [rawId, value] of Object.entries(seed && typeof seed === 'object' ? seed : {})) {
    const id = cleanId(rawId);
    if (id) out[id] = Math.max(0, finiteInt(value, 0));
  }
  return out;
}

/** Persistable offer/engine state. Unknown or hostile input becomes empty. */
export function normalizeQuestOfferState(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const timers = {};
  for (const [rawId, row] of Object.entries(src.timers || {})) {
    const id = cleanId(rawId);
    if (!id || !row || typeof row !== 'object') continue;
    const startedAt = Math.max(0, finiteInt(row.startedAt, 0));
    const endsAt = Math.max(startedAt, finiteInt(row.endsAt, 0));
    if (endsAt > 0) timers[id] = { startedAt, endsAt };
  }
  const distinct = {};
  for (const [rawId, counters] of Object.entries(src.distinct || {})) {
    const id = cleanId(rawId);
    if (!id || !counters || typeof counters !== 'object') continue;
    const row = {};
    for (const [rawCounter, labels] of Object.entries(counters)) {
      const counter = String(rawCounter || '').slice(0, 80);
      if (counter && Array.isArray(labels)) {
        row[counter] = [...new Set(labels.map(cleanId).filter(Boolean))].slice(0, 200);
      }
    }
    distinct[id] = row;
  }
  const queue = [...new Set((Array.isArray(src.queue) ? src.queue : []).map(cleanId).filter(Boolean))];
  return {
    offered: cleanTimeMap(src.offered),
    declined: cleanTimeMap(src.declined),
    failed: cleanTimeMap(src.failed),
    repeats: cleanTimeMap(src.repeats),
    managed: cleanTimeMap(src.managed),
    queue,
    lastOfferAt: Math.max(0, finiteInt(src.lastOfferAt, 0)),
    timers,
    distinct,
  };
}

/** Attach (or repair) questState.offers in place and return it. */
export function ensureQuestOfferState(questState) {
  if (!questState.offers || typeof questState.offers !== 'object' || !questState.offers.queue) {
    questState.offers = normalizeQuestOfferState(questState.offers);
  }
  return questState.offers;
}

/* ------------------------------------------------------------------ */
/* Classification                                                       */
/* ------------------------------------------------------------------ */

/** NPC classes that exist in the remake and can hand out quests on talk. */
export const REMAKE_QUEST_NPCS = Object.freeze([
  'street_spirit', 'street_spirit_groceries', 'street_spirit_gardening', 'street_spirit_produce',
  'street_spirit_toys', 'npc_piggy', 'emotional_bear',
  // Pack items whose Reminisce verb offers a quest room's repeat (quest-rooms/catalog.js REMINISCE_ITEMS).
  'play_cube', 'conch',
  // Offers Le Misérable II inside its room (quest-rooms/le-miserable.js).
  'npc_maintenance_bot',
  // Offers and turns in Carry That Weight II in her camp (quest-rooms/juju-camp.js).
  'npc_juju_grandma',
  // Offer and turn in Gwendolyn's Task II and III inside the room (quest-rooms/gwendolyn.js).
  'npc_squid',
  'npc_gwendolyn',
  // Gives Contraband and offers Smuggle the Smuggler (features/smuggling-feature.js).
  'npc_smuggler',
  // The imprisoned Smuggler in quest-rooms/penalty.js (part 1's end NPC, offers II and III).
  'npc_rare_item_vendor',
  // The Magic Rock on your home street offers Build a Tower (features/home-tower-feature.js).
  'magic_rock',
  // A Savanna Dust Trap's Juju Bandit offers Carry That Weight (features/juju-bandits-feature.js).
  'npc_juju_bandit',
  // Bumping into a Firefly offers Firefly Whistle (features/resource-nodes-feature.js, npc_firefly.js).
  'npc_firefly',
  // The vendor NPCs with a quest verb (features/vendor-npcs-feature.js): Meet the Merchants, and
  // Uncle Friendly's A Purple Journey North (make_eye_contact; npc_jabba1.js hides it on Helga).
  ...VENDOR_NPC_CLASSES.filter((npc) => VENDOR_NPCS[npc].questVerb),
]);
const GSJS_STREET_SPIRITS = new Set([
  'street_spirit', 'street_spirit_groddle', 'street_spirit_firebog', 'street_spirit_zutto', 'street_spirit_ix',
]);

/**
 * Original NPC classes the remake answers with another class. Empty since
 * the vendor NPCs stand on their own streets (G121); the gardening street
 * spirit used to stand in for the Gardening Tools and Tool Vendors.
 */
export const NPC_ALIASES = Object.freeze({});

/**
 * Quests whose end NPC the remake spawns as a talkable NPC wait for that
 * talk (npc_quests.js offerQuests turn-in) instead of turning in the moment
 * the pack holds the goods. Other end_npcs quests keep the auto turn-in.
 */
export const TALK_TURNIN_NPCS = Object.freeze(new Set(VENDOR_NPC_CLASSES));
export function heldForNpcTurnIn(def) {
  return Boolean(def && !def.familiarTurnin && (def.endNpcs || []).some((npc) => TALK_TURNIN_NPCS.has(npc)));
}

/** Does an NPC the player is talking to satisfy a trigger's giver class? */
export function npcMatches(triggerNpc, npcClass) {
  const want = NPC_ALIASES[String(triggerNpc || '')] || String(triggerNpc || '');
  const have = String(npcClass || '');
  if (!want || !have) return false;
  if (want === have) return true;
  // The original's street spirit art variants are one giver family.
  return GSJS_STREET_SPIRITS.has(want) && have.startsWith('street_spirit');
}

const npcInRemake = (npc) => REMAKE_QUEST_NPCS.some((have) => npcMatches(npc, have));

const FAMILIAR_TRIGGERS = new Set(['level', 'xp', 'skill', 'quest', 'achievement', 'region', 'street', 'event', 'prerequisites', 'inferred']);
const isNpcTrigger = (t) => t.type === 'npc' || (t.type === 'inferred' && t.npc);
const isFamiliarTrigger = (t) => FAMILIAR_TRIGGERS.has(t.type) && !isNpcTrigger(t);

/**
 * Split a catalog into solo-offerable and excluded quests.
 * @returns {{ solo: object[], custom: object[], excluded: object[], byReason: Record<string,string[]> }}
 */
export function classifyQuests(catalog = getQuestCatalog()) {
  const solo = [];
  const custom = [];
  const excluded = [];
  const byReason = {};
  for (const def of Object.values(catalog || {})) {
    if (!def?.classTsid) continue;
    const triggers = Array.isArray(def.offerTriggers) ? def.offerTriggers : [];
    const row = {
      classTsid: def.classTsid,
      title: def.title,
      triggers,
      familiar: triggers.some(isFamiliarTrigger),
      npcs: triggers.filter(isNpcTrigger).map((t) => t.npc),
      inferred: triggers.length > 0 && triggers.every((t) => t.inferred),
      isEmergency: !!def.isEmergency,
      isRepeatable: !!def.isRepeatable,
      custom: !!def.custom,
    };
    row.reachable = row.familiar || row.npcs.some(npcInRemake);
    if (def.solo === false || (def.solo === undefined && (def.isJob || def.isMultiplayer))) {
      const reason = def.soloReason || (def.isJob ? 'job' : 'multiplayer');
      (byReason[reason] ||= []).push(def.classTsid);
      excluded.push({ ...row, reason });
    } else if (def.custom) {
      custom.push(row);
    } else {
      solo.push(row);
    }
  }
  return { solo, custom, excluded, byReason };
}

let indexCache = { catalog: null, rows: null };
/** Cached solo-offerable (non-custom) rows for the loaded catalog. */
export function questOfferIndex(catalog = getQuestCatalog()) {
  if (indexCache.catalog !== catalog || !indexCache.rows) {
    indexCache = { catalog, rows: classifyQuests(catalog).solo };
  }
  return indexCache.rows;
}

/* ------------------------------------------------------------------ */
/* Context helpers                                                      */
/* ------------------------------------------------------------------ */

const asSet = (value) => {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  if (Array.isArray(value.learned)) return new Set(value.learned);
  if (Array.isArray(value.unlocked)) return new Set(value.unlocked);
  if (typeof value === 'object') return new Set(Object.keys(value).filter((k) => value[k]));
  return new Set();
};
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function levelOf(pc, ctx) {
  if (Number.isFinite(Number(ctx.level))) return Number(ctx.level);
  return levelInfoForXp(Number(ctx.xp ?? pc?.xp) || 0).level;
}
function xpOf(pc, ctx) {
  return Math.max(0, Number(ctx.xp ?? pc?.xp) || 0);
}
const countIn = (inv, classTsid, ctx = {}) =>
  typeof ctx.countItem === 'function' ? ctx.countItem(inv, classTsid) : Math.max(0, Number(inv?.[classTsid]) || 0);
const eventHappened = (ctx, name) => {
  const events = ctx.events;
  if (!events) return false;
  if (events instanceof Set || Array.isArray(events)) return asSet(events).has(name);
  return Boolean(events[name]);
};

/** 'none' | 'active' | 'failed' | 'declined' | 'offered' | 'done' */
export function questStatus(questState, classTsid) {
  const offers = ensureQuestOfferState(questState);
  if (questState.active?.[classTsid]) return offers.failed[classTsid] ? 'failed' : 'active';
  if (offers.declined[classTsid]) return 'declined';
  if (offers.offered[classTsid]) return 'offered';
  if ((questState.completed || []).includes(classTsid)) return 'done';
  return 'none';
}

function questDone(questState, classTsid, ctx) {
  if ((questState.completed || []).includes(classTsid)) return true;
  const proxy = getQuestCatalog()[classTsid]?.prereqProxy;
  return Boolean(proxy?.skill && asSet(ctx.skills).has(proxy.skill));
}

/**
 * Evaluate the original `prerequisites` gate list (items/include/npc_quests.js
 * getAvailableQuests). `custom_code` gates fail closed unless ctx.customPrereq
 * says otherwise.
 */
export function prerequisitesMet(def, questState, pc = null, ctx = {}) {
  for (const p of def?.prerequisites || []) {
    const not = Boolean(p.not);
    let has;
    switch (p.condition) {
      case 'has_achievement': has = asSet(ctx.achievements).has(p.value); break;
      case 'has_skill': has = asSet(ctx.skills).has(p.value); break;
      case 'has_item': has = countIn(ctx.inv, p.value, ctx) > 0; break;
      case 'has_buff': has = asSet(ctx.buffs).has(p.value); break;
      case 'has_recipe': has = asSet(ctx.recipes).has(String(p.value)); break;
      case 'completed_quest': has = questDone(questState, p.value, ctx); break;
      case 'in_hub': has = sameText(ctx.hubId ?? ctx.hub, p.value); break;
      case 'over_level': {
        const level = levelOf(pc, ctx);
        if (not ? level > Number(p.value) : level < Number(p.value)) return { ok: false, missing: p };
        continue;
      }
      case 'over_mood':
      case 'over_energy': {
        const value = Number(p.condition === 'over_mood' ? pc?.mood : pc?.energy) || 0;
        if (not ? value > Number(p.value) : value < Number(p.value)) return { ok: false, missing: p };
        continue;
      }
      case 'over_favor': {
        const [giant, need] = String(p.value).split('|');
        const favor = Number((pc?.giantFavor || pc?.favor || {})[giant]) || 0;
        if (not ? favor > Number(need) : favor < Number(need)) return { ok: false, missing: p };
        continue;
      }
      case 'quest_count_over': {
        const done = (questState.completed || []).length;
        if (not ? done > Number(p.value) : done < Number(p.value)) return { ok: false, missing: p };
        continue;
      }
      case 'custom_code':
        has = typeof ctx.customPrereq === 'function' ? Boolean(ctx.customPrereq(def.classTsid, p)) : false;
        break;
      default:
        has = false;
    }
    if (has === not) return { ok: false, missing: p };
  }
  for (const pre of def?.prereqQuests || []) {
    if (!questDone(questState, pre, ctx)) return { ok: false, missing: { condition: 'prereq_quest', value: pre } };
  }
  return { ok: true, missing: null };
}

/** Is one offer trigger satisfied right now? (NPC triggers need ctx.npc.) */
export function triggerMet(trigger, def, questState, pc = null, ctx = {}) {
  const t = trigger || {};
  switch (t.type) {
    case 'level': {
      const level = levelOf(pc, ctx);
      if (level > t.level) return true;
      if (level < t.level) return false;
      if (ctx.level !== undefined && ctx.xp === undefined && pc?.xp === undefined) return true;
      return levelInfoForXp(xpOf(pc, ctx)).progress >= LEVEL_OFFER_FRACTION;
    }
    case 'xp':
      return xpOf(pc, ctx) >= Number(t.xp || 0);
    case 'skill':
      return asSet(ctx.skills).has(t.skill);
    case 'quest':
      return questDone(questState, t.quest, ctx);
    case 'achievement':
      return asSet(ctx.achievements).has(t.achievement);
    case 'region':
      return sameText(ctx.region ?? ctx.hub, t.region);
    case 'street':
      return sameText(ctx.street, t.street) || sameText(ctx.streetTsid, t.street);
    case 'npc':
      return npcMatches(t.npc, ctx.npc);
    case 'prerequisites':
      return (def?.prerequisites || []).length > 0;
    case 'event':
      if (t.adminOnly) return false;
      if (t.event === 'streets_visited') return (Number(ctx.streetsVisited) || 0) >= Number(t.count || 0);
      if (t.event === 'emblems') return (Number(ctx.emblemsMax) || 0) >= Number(t.count || 0);
      if (t.afterQuest && !questDone(questState, t.afterQuest, ctx)) return false;
      if (t.event === 'item_use') return eventHappened(ctx, `item_use:${t.item}`);
      return eventHappened(ctx, t.event);
    case 'inferred': {
      if (t.npc && !npcMatches(t.npc, ctx.npc)) return false;
      if (t.level && levelOf(pc, ctx) < t.level) return false;
      if (t.region && !sameText(ctx.region ?? ctx.hub, t.region)) return false;
      if (t.street && !(sameText(ctx.street, t.street) || sameText(ctx.streetTsid, t.street))) return false;
      const skills = asSet(ctx.skills);
      if ((t.skills || []).some((s) => !skills.has(s))) return false;
      if ((t.quests || []).some((q) => !questDone(questState, q, ctx))) return false;
      return true;
    }
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Offers                                                               */
/* ------------------------------------------------------------------ */

const TRIGGER_RANK = { quest: 0, skill: 1, level: 2, xp: 2, achievement: 3, event: 4, region: 4, street: 4, npc: 5, prerequisites: 6, inferred: 6 };

function offerableStatus(questState, def) {
  const status = questStatus(questState, def.classTsid);
  if (status === 'none') return true;
  return status === 'done' && def.isRepeatable;
}

function eligibleTrigger(def, questState, pc, ctx, { npc = false } = {}) {
  if (!def?.solo) return null;
  if (def.custom && !ctx.includeCustom) return null;
  if (!offerableStatus(questState, def)) return null;
  const triggers = (def.offerTriggers || []).filter((t) => (npc ? isNpcTrigger(t) : isFamiliarTrigger(t)));
  const met = triggers.filter((t) => triggerMet(t, def, questState, pc, ctx));
  if (!met.length) return null;
  if (!prerequisitesMet(def, questState, pc, ctx).ok) return null;
  return met.sort((a, b) => (TRIGGER_RANK[a.type] ?? 9) - (TRIGGER_RANK[b.type] ?? 9))[0];
}

/**
 * Familiar-delivered quests whose triggers are met now, in delivery order:
 * emergencies first, then quests already queued (chain offers), then by
 * trigger kind (chain, skill, level, achievement, event, inferred) and level.
 * Does not mutate state.
 */
export function pendingQuestOffers(questState, pc = null, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  const catalog = getQuestCatalog();
  const queueIndex = new Map(offers.queue.map((id, i) => [id, i]));
  const rows = [];
  for (const def of Object.values(catalog)) {
    const trigger = eligibleTrigger(def, questState, pc, ctx);
    if (!trigger) continue;
    rows.push({ classTsid: def.classTsid, def, trigger, emergency: !!def.isEmergency, queued: queueIndex.has(def.classTsid) });
  }
  return rows.sort((a, b) =>
    Number(b.emergency) - Number(a.emergency) ||
    Number(b.queued) - Number(a.queued) ||
    (queueIndex.get(a.classTsid) ?? 0) - (queueIndex.get(b.classTsid) ?? 0) ||
    (TRIGGER_RANK[a.trigger.type] ?? 9) - (TRIGGER_RANK[b.trigger.type] ?? 9) ||
    (Number(a.trigger.level ?? a.trigger.xp) || 0) - (Number(b.trigger.level ?? b.trigger.xp) || 0)
  );
}

function offerCard(row, waitMs = 0) {
  const def = row.def;
  return {
    classTsid: def.classTsid,
    def,
    trigger: row.trigger,
    emergency: row.emergency,
    title: def.title,
    beats: parseQuestConversation(def.offer || def.desc),
    acceptLabel: def.acceptLabel || "Ok, I'll do it!",
    declineLabel: def.declineLabel || 'Not right now',
    waitMs,
  };
}

/**
 * The one offer the familiar should deliver now, honouring the 5-minute
 * spacing (emergencies skip it) and the turn_off_quests buff. Returns null
 * while waiting; `{ waiting: ms }` tells the caller when to look again.
 */
export function nextQuestOffer(questState, pc = null, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  if (Object.keys(offers.offered).length) return null; // one at a time
  if (asSet(ctx.buffs).has('turn_off_quests')) return null;
  const pending = pendingQuestOffers(questState, pc, ctx);
  if (!pending.length) return null;
  const now = Number(ctx.now ?? Date.now());
  const head = pending[0];
  const elapsed = now - offers.lastOfferAt;
  if (!head.emergency && offers.lastOfferAt && elapsed < OFFER_INTERVAL_MS) {
    return { waiting: OFFER_INTERVAL_MS - elapsed, classTsid: head.classTsid };
  }
  return offerCard(head);
}

/**
 * NPC talk (getAvailableQuests): quests this NPC can offer now, plus active
 * quests that can be turned in to it.
 */
export function npcQuestOffers(questState, npcClass, pc = null, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  const npcCtx = { ...ctx, npc: npcClass };
  const offered = [];
  for (const def of Object.values(getQuestCatalog())) {
    if (offers.declined[def.classTsid]) continue;
    const trigger = eligibleTrigger(def, questState, pc, npcCtx, { npc: true });
    if (trigger) offered.push(offerCard({ def, trigger, emergency: !!def.isEmergency }));
  }
  const completable = [];
  for (const id of Object.keys(questState.active || {})) {
    const def = getQuestCatalog()[id];
    if (!def || !(def.endNpcs || []).some((npc) => npcMatches(npc, npcClass))) continue;
    if (requirementsComplete(questState, def)) completable.push({ classTsid: id, def, turnIn: 'npc' });
  }
  return { offered, completable };
}

/** Queue a quest for familiar delivery (chain offers use this). */
export function enqueueQuestOffer(questState, classTsid) {
  const offers = ensureQuestOfferState(questState);
  if (classTsid && !offers.queue.includes(classTsid)) offers.queue.push(classTsid);
  return offers.queue;
}

/** The familiar has presented this offer; starts the 5-minute spacing. */
export function markOffered(questState, classTsid, now = Date.now()) {
  const offers = ensureQuestOfferState(questState);
  offers.offered[classTsid] = now;
  offers.lastOfferAt = now;
  offers.queue = offers.queue.filter((id) => id !== classTsid);
  return offers;
}

/**
 * "Not right now". Familiar offers stay in the log as acceptable and are not
 * offered again; NPC offers are simply dropped so the NPC asks next time.
 */
export function declineOffer(questState, classTsid, now = Date.now(), { source = 'familiar' } = {}) {
  const offers = ensureQuestOfferState(questState);
  delete offers.offered[classTsid];
  offers.queue = offers.queue.filter((id) => id !== classTsid);
  if (source !== 'npc') offers.declined[classTsid] = now;
  return { ok: true, status: questStatus(questState, classTsid) };
}

/** Declined familiar offers, for the quest log's "accept" rows. */
export function listDeclinedOffers(questState) {
  const offers = ensureQuestOfferState(questState);
  const catalog = getQuestCatalog();
  return Object.entries(offers.declined)
    .sort((a, b) => a[1] - b[1])
    .map(([id, at]) => ({ classTsid: id, def: catalog[id], declinedAt: at }))
    .filter((row) => row.def);
}

function addTo(inv, classTsid, count, ctx) {
  if (!inv || !classTsid || !count) return;
  if (typeof ctx.addItem === 'function') ctx.addItem(inv, classTsid, count);
  else inv[classTsid] = (Number(inv[classTsid]) || 0) + count;
}
function removeFrom(inv, classTsid, count, ctx) {
  if (!inv || !classTsid || !count) return false;
  if (typeof ctx.removeItem === 'function') return ctx.removeItem(inv, classTsid, count) !== false;
  const have = Number(inv[classTsid]) || 0;
  if (have < count) return false;
  inv[classTsid] = have - count;
  return true;
}

/**
 * Accept an offered, declined, or NPC-offered quest. Repeatable completed
 * quests restart (startQuestRepeat). Gives doProvided items, starts the timer
 * of timed quests, and pre-fills item requirements / acquired_ flags.
 */
export function acceptOffer(questState, classTsid, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  const def = getQuestCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  const now = Number(ctx.now ?? Date.now());
  const wasDone = (questState.completed || []).includes(classTsid);
  if (wasDone) {
    if (!def.isRepeatable) return { ok: false, reason: 'already_completed' };
    questState.completed = questState.completed.filter((id) => id !== classTsid);
    offers.repeats[classTsid] = (offers.repeats[classTsid] || 0) + 1;
  }
  const result = assignQuest(questState, classTsid, { ignorePrereq: true });
  if (!result.ok) {
    if (wasDone) questState.completed.push(classTsid);
    return { ok: false, reason: result.reason };
  }
  delete offers.offered[classTsid];
  delete offers.declined[classTsid];
  delete offers.failed[classTsid];
  delete offers.distinct[classTsid];
  // Quests this engine handed out; legacy story/starter quests keep their own
  // progress path and are skipped by managedOnly routing.
  offers.managed[classTsid] = now;
  offers.queue = offers.queue.filter((id) => id !== classTsid);
  const given = [];
  for (const item of def.giveItems || []) {
    addTo(ctx.inv, item.classTsid, item.count, ctx);
    given.push({ ...item });
  }
  if (def.timer?.durationSec) {
    offers.timers[classTsid] = { startedAt: now, endsAt: now + def.timer.durationSec * 1000 };
  } else {
    delete offers.timers[classTsid];
  }
  const quest = questState.active[classTsid];
  if (ctx.inv) {
    for (const req of def.requirements || []) {
      if (req.type === 'flag' && req.name.startsWith('acquired_') && countIn(ctx.inv, req.name.slice(9), ctx) > 0) {
        quest.progress[req.name] = 1;
      }
    }
  }
  if (ctx.inv) syncItemRequirements(questState, ctx.inv, { ...ctx, only: classTsid, silent: true });
  // onAccept -> checkCompletion: already-held items (or no requirements) complete it at once.
  const completable = requirementsComplete(questState, def)
    ? [{ classTsid, def, turnIn: turnInKind(def) }]
    : [];
  return { ok: true, reason: wasDone ? 'repeat' : 'accepted', quest, def, given, completable };
}

/* ------------------------------------------------------------------ */
/* Routing table                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every requirement counter/flag a solo quest uses, the remake event that
 * should advance it, and the system that has to emit that event. Events use
 * the same `group:label` shape as js/achievements.js. `{a}`/`{b}` are
 * placeholders shared by the event and counter templates.
 *   distinct: count each label once per quest run (GSJS stored a hash)
 *   minAmount: flag only when one event carries at least this amount
 */
export const COUNTER_ROUTES = Object.freeze([
  // animals (animal-kinship.js; emitted via worldVerbAchievementCounters)
  { system: 'animals', counter: 'piggies_petted', event: 'npc_piggy:pet' },
  { system: 'animals', counter: 'meats_collected_from_pigs', event: 'npc_piggy:nibble' },
  { system: 'animals', counter: 'butterflies_massaged', event: 'npc_butterfly:massage' },
  { system: 'animals', counter: 'butterflies_milked', event: 'npc_butterfly:milk' },
  { system: 'animal-kinship', counter: 'piggy_nibble_max_reward', event: 'animal_max_reward:npc_piggy' },
  { system: 'animal-kinship', counter: 'butterfly_milk_max_reward', event: 'animal_max_reward:npc_butterfly' },
  { system: 'animal-kinship', counter: 'chicken_squeeze_max_reward', event: 'animal_max_reward:npc_chicken' },
  { system: 'animal-kinship', counter: 'chicken_music_block', event: 'skill_package_drop:npc_chicken' },
  { system: 'animal-naming', counter: 'piggies_named', event: 'animals_named:npc_piggy' },
  { system: 'animal-naming', counter: 'butterflies_named', event: 'animals_named:npc_butterfly' },
  { system: 'herdkeeping', counter: 'pigs_hogtied', event: 'npc_piggy:hogtie' },
  { system: 'piggy-plops', counter: 'plops_inspected', event: 'plop:inspect' },
  // trees (trant-care.js, trants.js, woodcutting.js)
  { system: 'trant-care', counter: 'trees_watered', event: 'trants_watered:{a}' },
  { system: 'trant-care', counter: 'trees_petted', event: 'trants_petted:{a}' },
  { system: 'trant-care', counter: 'heal_trant', event: 'trants_healed:{a}' },
  { system: 'trants', counter: 'trant_harvest_{a}', event: 'trants_harvested:{a}' },
  { system: 'trants', counter: 'fruit_tree_harvested', event: 'trants_harvested:trant_fruit' },
  { system: 'trants', counter: 'bubble_tree_harvested', event: 'trants_harvested:trant_bubble' },
  { system: 'trants', counter: 'spice_tree_harvested', event: 'trants_harvested:trant_spice' },
  { system: 'trants', counter: 'harvest_bonus_{a}', event: 'trants_super_harvested:{a}' },
  { system: 'woodcutting', counter: 'harvest_max_wood_tree', event: 'trants_super_harvested:wood_tree' },
  { system: 'trants', counter: 'gardening_harvest_last_egg_plant', event: 'trants_harvested_last:trant_egg' },
  // making (making.js)
  { system: 'making', counter: '<make requirement>', event: 'making_recipe:{a}', note: '{a} = recipes.json key (or make:<recipeId>)' },
  { system: 'making', counter: 'make_potions', event: 'making_tool:cauldron' },
  { system: 'making', counter: 'different_potions_made', event: 'making_tool_output:cauldron:{a}', distinct: true },
  { system: 'making', counter: 'make_hooch', event: 'making_tool:still' },
  { system: 'making', counter: 'make_teleportation_script', event: 'making_recipe:teleportation_script' },
  { system: 'making', counter: 'different_beans_seasoned', event: 'making_tool_output:bean_seasoner:{a}', distinct: true },
  // mining / refining (mining.js)
  { system: 'mining', counter: 'mining', event: '{a}:mine' },
  { system: 'mining', counter: 'mining_clear_rock', event: 'rocks_depleted:{a}' },
  { system: 'mining', counter: 'ore_crushed', event: 'ore_crushed' },
  { system: 'mining', counter: 'refined_{a}', event: 'ore_refined:{a}' },
  { system: 'mining', counter: '100_metal_smelted', event: 'metal_smelted', minAmount: 100 },
  // gardens + herbs (garden.js)
  { system: 'garden', counter: 'garden_harvest_{a}', event: 'garden_harvest:{a}' },
  { system: 'garden', counter: 'onions_harvested', event: 'garden_harvest:onion' },
  { system: 'garden', counter: 'super_harvest_herb', event: 'herb_super_harvest:{a}' },
  { system: 'garden', counter: 'seeds_extracted', event: 'herb_seeds_extracted:{a}' },
  { system: 'garden', counter: 'herb_seeds_planted_shucks', event: 'herb_seed_planted:{a}' },
  { system: 'garden', counter: 'harvest_herb_shucks', event: 'herb_harvest:{a}' },
  { system: 'garden', counter: 'yellow_crumb_flower_planted', event: 'herb_seed_planted:herb_seed_yellow_crumb_flower' },
  { system: 'garden', counter: 'silvertongue_planted', event: 'herb_seed_planted:herb_seed_silvertongue' },
  { system: 'garden', counter: 'harvest_herb_gardens', event: 'herb_harvest:{a}' },
  // soil / patches (no remake system yet)
  { system: 'soil', counter: 'dig_dirt', event: 'soil_dug:earth' },
  { system: 'soil', counter: 'dig_loam', event: 'soil_dug:loam' },
  { system: 'soil', counter: 'patches_tended', event: 'patch:tend' },
  { system: 'soil', counter: 'patch_music_block', event: 'skill_package_drop:patch' },
  { system: 'soil', counter: 'beans_planted', event: 'patch:plant' },
  { system: 'soil', counter: 'pol_beans_planted', event: 'patch:plant_home' },
  { system: 'soil', counter: 'seedlings_petted', event: 'patch_seedling:pet' },
  { system: 'soil', counter: 'seedlings_fully_petted', event: 'patch_seedling:grown' },
  { system: 'soil', counter: 'hub_plant_beans', event: 'hub_bean_planted:{a}', distinct: true },
  { system: 'soil', counter: 'pol_trants_fully_grown', event: 'home_trant_grown:{a}' },
  // shrines / favor (shrines.js)
  { system: 'shrines', counter: 'shrine_donated_{a}', event: 'shrines_donated:{a}' },
  { system: 'shrines', counter: 'donate_giants', event: 'shrines_donated:{a}', distinct: true },
  { system: 'shrines', counter: 'favor_points', event: 'favor_earned:{a}' },
  { system: 'shrines', counter: 'earned_favor_{a}', event: 'favor_earned:{a}' },
  { system: 'shrines', counter: 'favor_unique_shrines', event: 'favor_earned:{a}', distinct: true },
  { system: 'shrines', counter: 'emblems_acquired', event: 'emblems_acquired:{a}' },
  { system: 'shrines', counter: 'icons_created', event: 'emblems_iconized:{a}' },
  { system: 'shrines', counter: 'primary_giant_spend_mad_favor', event: 'favor_spent:primary_large' },
  { system: 'shrines', counter: 'spend_enormous_favor', event: 'favor_spent:huge' },
  { system: 'shrines', counter: 'lemburgers_donated', event: 'shrine_item_donated:lemburger' },
  { system: 'shrines', counter: 'jellisacs_slathered', event: 'shrine_item_donated:jellisac' },
  { system: 'shrines', counter: 'cocktail_shaker_donated', event: 'shrine_item_donated:cocktail_shaker' },
  { system: 'shrines', counter: 'awesome_pot_donated', event: 'shrine_item_donated:awesome_pot' },
  { system: 'shrines', counter: 'super_harvest_jellisac', event: 'jellisac:super_harvest' },
  // inventory / items
  { system: 'inventory', counter: 'acquired_{a}', event: 'in_inventory:{a}', note: 'any item gained; also pre-set on accept' },
  { system: 'food', counter: 'beers_drank', event: 'beer:drink' },
  { system: 'food', counter: 'drink_creamy_martini', event: 'creamy_martini:drink' },
  { system: 'food', counter: 'purple_journey_munch', event: 'purple_flower:eat' },
  // vendors (vendor.js)
  { system: 'vendor', counter: 'generic_bag_purchased', event: 'vendor_bought:bag_generic' },
  { system: 'vendor', counter: 'generic_bag_purchased', event: 'vendor_bought:bag_bigger' },
  { system: 'vendor', counter: '{a}_sold', event: 'vendor_sold:{a}' },
  // tools (tools.js)
  { system: 'tools', counter: 'tinkertool_repair', event: 'tool_repaired:{a}' },
  { system: 'tools', counter: 'tinkertool_repaired', event: 'tool_repaired:tinkertool' },
  { system: 'tools', counter: 'tinkertool_15s_repair', event: 'tool_repaired_long:{a}' },
  { system: 'tools', counter: 'tool_broke_{a}', event: 'tool_broke:{a}' },
  // skills (skills.js)
  { system: 'skills', counter: 'learn_skill', event: 'skill_learned:{a}' },
  // travel / teleportation (travel.js, map)
  { system: 'travel', counter: 'map_dest_reached', event: 'map_destination_reached' },
  { system: 'travel', counter: 'visit_seam_street', event: 'street_first_visit:{a}', note: 'seam streets only' },
  { system: 'travel', counter: 'find_ix_hole', event: 'street_entered:great_hole_to_ix' },
  { system: 'travel', counter: 'find_groddle_ladder', event: 'street_entered:groddle_ladder' },
  { system: 'travel', counter: 'arrive_at_neva_neva', event: 'street_entered:neva_neva' },
  { system: 'travel', counter: 'arrive_at_ajaya_bliss', event: 'street_entered:ajaya_bliss' },
  { system: 'travel', counter: 'go_to_eastwest_spice', event: 'street_entered:eastwest_spice' },
  { system: 'travel', counter: 'visit_herb_gardens', event: 'street_entered:herb_gardens' },
  { system: 'teleportation', counter: 'teleportation_count', event: 'teleported' },
  { system: 'teleportation', counter: 'teleport_between_zones', event: 'teleported_between_zones' },
  { system: 'teleportation', counter: 'teleportation_point_in_xalanga', event: 'teleport_point_set:xalanga' },
  { system: 'teleportation', counter: 'teleport_to_xalanga', event: 'teleported_to:xalanga' },
  // social stand-ins (emotional-bear.js with local companions; mailbox.js)
  { system: 'emotional-bear', counter: 'players_mooned', event: 'players_mooned' },
  { system: 'emotional-bear', counter: 'players_garlic_kissed', event: 'players_garlic_kissed', note: 'kiss while under the garlic buff' },
  { system: 'emotional-bear', counter: 'hugs_{a}', event: 'emotional_bear_hug:{a}' },
  { system: 'mailbox', counter: 'mail_packages_sent', event: 'mail_sent' },
  { system: 'cubimals', counter: 'npcs_given_cubimals', event: 'cubimal_given:{a}' },
  // quoins / meditation / misc
  { system: 'quoins', counter: 'quoins_collected', event: 'quoins_collected' },
  { system: 'meditation', counter: 'meditation_time', event: 'meditation_seconds' },
  { system: 'meditation', counter: 'wintry_place_meditation', event: 'meditation_seconds_wintry' },
  { system: 'meditation', counter: 'meditation_24_mood_energy', event: 'meditation_gain_24' },
  { system: 'meditation', counter: 'meditation_mood_50', event: 'meditation_mood_50' },
  { system: 'remote-herdkeeping', counter: 'meat_collector_full', event: 'meat_collector:full' },
  { system: 'remote-herdkeeping', counter: 'butterfly_milker_full', event: 'butterfly_milker:full' },
  { system: 'bog', counter: 'peat_bog_fully_harvested', event: 'peat_bog:emptied' },
  { system: 'engineering', counter: 'machine_shop_pit_stop_complete', event: 'machine_assembled' },
  { system: 'baqala', counter: 'organelles_found', event: 'dust_trap:organelle' },
  { system: 'hell', counter: 'jump_hell_hole', event: 'hell_hole_jumped' },
  { system: 'hell', counter: 'buy_wotd', event: 'vendor_bought:wine_of_the_dead' },
  { system: 'hell', counter: 'drink_wotd', event: 'wine_of_the_dead:drink' },
  { system: 'story', counter: 'return_to_spirit', event: 'street_spirit:talk' },
  { system: 'story', counter: 'quest_manor_mystery_done', event: 'note_manor_mystery:solve' },
  { system: 'story', counter: 'treasure_1', event: 'treasure_map_1:dig' },
  { system: 'mining', counter: 'mine_100_sparkly_while_in_neva_neva', event: 'sparkly_mined_in:neva_neva', minAmount: 100 },
  { system: 'mining', counter: 'grind_100_chunks_of_sparkly_in_neva_neva', event: 'sparkly_ground_in:neva_neva', minAmount: 100 },
  { system: 'mining', counter: 'mine_100_sparkly_in_ajaya_bliss', event: 'sparkly_mined_in:ajaya_bliss', minAmount: 100 },
  { system: 'mining', counter: 'grind_100_chunks_of_sparkly_in_ajaya_bliss', event: 'sparkly_ground_in:ajaya_bliss', minAmount: 100 },
  // Last: every successful verb on an item also counts as VERB:<class>:<verb>
  // (items/item.js notifyVerb), e.g. npc_batterfly:feed, beer:drink.
  { system: 'verbs', counter: 'VERB:{a}:{b}', event: '{a}:{b}', note: 'generic item verb' },
]);

/**
 * What game.js emits today (verified by grep of applyAchievementProgress /
 * applyQuestProgress call sites). Values restrict a placeholder.
 */
export const EMITTED_EVENTS = Object.freeze([
  { event: 'npc_piggy:{a}', a: ['pet', 'nibble'] },
  { event: 'npc_chicken:{a}', a: ['squeeze'] },
  { event: 'npc_butterfly:{a}', a: ['massage', 'milk'] },
  { event: 'trants_petted:{a}' },
  { event: 'trants_watered:{a}' },
  { event: 'trants_harvested:{a}', a: ['trant_fruit', 'trant_egg', 'trant_bean', 'trant_bubble', 'trant_spice', 'trant_gas'] },
  { event: 'trants_fruit_harvested:{a}' },
  { event: 'making_tool:{a}' },
  { event: 'shrines_donated:{a}' },
  { event: 'emblems_acquired:{a}' },
  { event: 'favor_spent:primary_large', note: 'game.js shrine Learn Faster? spend: 997+ favor with the skill\'s primary Giant (shrines.js spend_points)' },
  { event: 'favor_spent:huge', note: 'game.js shrine Learn Faster? spend: 1,511+ favor with any Giant' },
  { event: 'in_inventory:{a}', note: 'every pack gain (quest-offers feature diff)' },
  { event: 'contraband_delivered', note: 'features/smuggling-feature.js sets it when the contact takes the box' },
  { event: 'cultivate_tower', note: 'features/home-tower-feature.js on cultivating the Tower' },
  { event: 'build_tower', note: 'features/home-tower-feature.js when the Tower project finishes' },
  { event: 'meditation_station_days', note: 'js/meditation-station.js, one per counted game day' },
  { event: 'hell_hole_jumped', note: 'features/hell-feature.js on arriving in Mahatam Audarika (G163)' },
  { event: 'map_destination_reached', note: 'features/map-routes-feature.js on entering a route destination (locations/location.js 310-313 map_dest_reached; G177, G192)' },
  // game.js emitGameEvent (2026-10-19)
  { event: '{a}:{b}', note: 'every successful world verb and pack use' },
  { event: 'rocks_depleted:{a}' },
  { event: 'making_recipe:{a}' },
  { event: 'making_tool_output:{a}:{b}' },
  { event: 'vendor_bought:{a}' },
  { event: 'vendor_sold:{a}' },
  { event: 'skill_learned:{a}' },
  { event: 'tool_repaired:{a}' },
  { event: 'garden_harvest:{a}' },
  { event: 'herb_harvest:{a}' },
  { event: 'mail_sent' },
  { event: 'street_first_visit:{a}' },
  { event: 'street_entered:{a}' },
  { event: 'cubimals_freed:{a}' },
  { event: 'musicblocks_played:{a}' },
  { event: 'feats:contributed' },
  { event: 'players_hugged' },
  { event: 'players_high_fived' },
  { event: 'kissed' },
  { event: 'players_mooned' },
  { event: 'quoins_collected' },
  { event: 'favor_points', note: 'flat amount; switch to favor_earned:<giant>' },
  // animal husbandry (game.js executeVerb + features/animal-husbandry-feature.js, 2026-10-20)
  { event: 'animal_max_reward:{a}', a: ['npc_piggy', 'npc_butterfly', 'npc_chicken'] },
  { event: 'skill_package_drop:{a}', a: ['npc_chicken'], note: 'Animal Kinship V+ squeeze drop of a Musicblock' },
  { event: 'animals_named:{a}', a: ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_batterfly'] },
  { event: 'npc_piggy:hogtie', note: 'Herdkeeping capture off your own land' },
  { event: 'plop:inspect' },
  { event: 'guano:pickup' },
  { event: 'npc_batterfly:feed' },
  { event: 'eggs_incubated:{a}', a: ['piggy_egg', 'butterfly_egg', 'chicken_egg'] },
  { event: 'animals_grown:{a}', a: ['chick', 'piglet', 'caterpillar'] },
  { event: 'meat_collector:full' },
  { event: 'butterfly_milker:full' },
]);

const templateCache = new Map();
function compileTemplate(template) {
  if (templateCache.has(template)) return templateCache.get(template);
  const names = [];
  const source = String(template)
    .split(/(\{[ab]\})/)
    .map((part) => {
      const m = part.match(/^\{([ab])\}$/);
      if (m) {
        names.push(m[1]);
        return '([^:]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const compiled = { re: new RegExp(`^${source}$`), names };
  templateCache.set(template, compiled);
  return compiled;
}
function matchTemplate(template, value) {
  const { re, names } = compileTemplate(template);
  const m = String(value).match(re);
  if (!m) return null;
  const vars = {};
  names.forEach((name, i) => {
    if (vars[name] !== undefined && vars[name] !== m[i + 1]) vars.__conflict = true;
    vars[name] = m[i + 1];
  });
  return vars.__conflict ? null : vars;
}
const fill = (template, vars) => String(template).replace(/\{([ab])\}/g, (_, k) => vars[k] ?? `{${k}}`);

/**
 * Counter names an event advances, with route metadata.
 * @returns {{ counter: string, route: object, label: string }[]}
 */
export function eventCounters(event) {
  const name = String(event || '').trim();
  if (!name) return [];
  const out = [];
  for (const route of COUNTER_ROUTES) {
    if (route.counter.startsWith('<')) continue;
    const vars = matchTemplate(route.event, name);
    if (!vars) continue;
    out.push({ counter: fill(route.counter, vars), route, label: vars.a ?? name });
  }
  // Direct counter/flag names (e.g. 'found_ghost') and the legacy aliases
  // game.js already passes to applyQuestProgress ('pet_piggy').
  out.push({ counter: name, route: null, label: name });
  const legacy = eventToCounter(name);
  if (legacy) out.push({ counter: legacy, route: null, label: name });
  return out;
}

/** Is this concrete event emitted by game.js today? */
export function isEventEmitted(event) {
  return EMITTED_EVENTS.some((row) => {
    const vars = matchTemplate(row.event, event);
    if (!vars) return false;
    return !row.a || row.a.includes(vars.a);
  });
}

/**
 * The route for one requirement: which system/event advances it, and
 * whether that event is emitted today.
 */
export function requirementRoute(req) {
  if (!req) return null;
  // Flags and counters set by a rebuilt quest room (features/quest-instances-feature.js).
  if (req.route === 'quest-instances') return { system: 'quest-instances', event: req.name, emitted: true };
  if (req.type === 'item' || req.type === 'currants') {
    return { system: 'inventory', event: 'syncItemRequirements', emitted: true, sync: true };
  }
  if (req.type === 'make') {
    const key = req.recipeKey || req.outputClass || `make:${req.recipeId}`;
    return {
      system: 'making',
      event: `making_recipe:${key}`,
      emitted: false,
      inRemake: Boolean(req.recipeKey),
    };
  }
  if (req.type === 'work') return { system: 'jobs', event: `work:${req.classId}`, emitted: false };
  for (const route of COUNTER_ROUTES) {
    if (route.counter.startsWith('<')) continue;
    const vars = matchTemplate(route.counter, req.name);
    if (!vars) continue;
    const event = fill(route.event, vars);
    if (/\{[ab]\}/.test(event)) {
      // Placeholder only on the event side ({a}:mine): emitted if any instance is.
      const emitted = EMITTED_EVENTS.some((row) => matchTemplate(route.event, fill(row.event, { a: (row.a || ['x'])[0] })));
      return { system: route.system, event, emitted, route };
    }
    return { system: route.system, event, emitted: isEventEmitted(event), route };
  }
  if (isEventEmitted(req.name)) return { system: 'direct', event: req.name, emitted: true };
  return { system: 'unrouted', event: req.name, emitted: false };
}

/** requirementRoute, but a flat counter game.js already passes counts as emitted ('legacy'). */
function requirementRouteWithLegacy(req) {
  const route = requirementRoute(req);
  if (route && !route.emitted && (req.type === 'counter' || req.type === 'flag') && isEventEmitted(req.name)) {
    return { ...route, emitted: 'legacy', legacyEvent: req.name };
  }
  return route;
}

/**
 * Routing report for the lead: per system, the requirement counters solo
 * quests need and whether anything emits them yet.
 */
export function questRoutingReport(catalog = getQuestCatalog(), { includeCustom = false } = {}) {
  const bySystem = {};
  for (const def of Object.values(catalog)) {
    if (!def?.solo || (def.custom && !includeCustom)) continue;
    for (const req of def.requirements || []) {
      const route = requirementRouteWithLegacy(req);
      const subject = req.type === 'make'
        ? req.recipeKey || req.outputClass || req.recipeId
        : req.type === 'item' ? req.classId : req.name;
      const key = `${req.type}:${subject}`;
      const sys = (bySystem[route.system] ||= {});
      const row = (sys[key] ||= { requirement: key, event: route.event, emitted: route.emitted, quests: [] });
      if (route.inRemake === false) row.recipeMissing = true;
      if (!row.quests.includes(def.classTsid)) row.quests.push(def.classTsid);
    }
  }
  const unemitted = {};
  for (const [system, rows] of Object.entries(bySystem)) {
    const list = Object.values(rows).filter((r) => !r.emitted);
    if (list.length) unemitted[system] = list;
  }
  return { bySystem, unemitted };
}

/**
 * Quest events for one successful world verb: the GSJS-style generic
 * `<class>:<verb>` (items/item.js notifyVerb) plus the verb's achievement
 * events (worldVerbAchievementCounters), deduplicated, plus the tree
 * pet/water/harvest events the achievement layer skips (wood_tree, paper_tree).
 * @param {string} classTsid
 * @param {string} verbId
 * @param {{ counter: string, amount?: number }[]} [achievementEvents]
 * @returns {{ event: string, amount: number }[]}
 */
export function questEventsForVerb(classTsid, verbId, achievementEvents = []) {
  const cls = String(classTsid || '').trim();
  const verb = String(verbId || '').split(':')[0].trim();
  const out = [];
  const seen = new Set();
  const push = (event, amount = 1) => {
    if (!event || seen.has(event)) return;
    seen.add(event);
    out.push({ event, amount: Math.max(1, Math.floor(Number(amount) || 1)) });
  };
  for (const row of achievementEvents || []) {
    // Item-count events (trants_fruit_harvested) carry yields, not actions.
    if (String(row?.counter || '').startsWith('trants_fruit_harvested:')) continue;
    push(row?.counter, row?.amount);
  }
  if (cls && verb) push(`${cls}:${verb}`);
  const treeGroup = { water: 'trants_watered', pet: 'trants_petted', harvest: 'trants_harvested' }[verb];
  if (treeGroup && /^(?:trant_|wood_tree|paper_tree)/.test(cls)) push(`${treeGroup}:${cls}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Progress                                                             */
/* ------------------------------------------------------------------ */

function requirementDone(req, value) {
  if (req.type === 'flag') return Number(value) > 0;
  return (Number(value) || 0) >= (Number(req.num) || 1);
}

function requirementsComplete(questState, def) {
  const quest = questState.active?.[def.classTsid];
  if (!quest) return false;
  return (def.requirements || []).every((req) => requirementDone(req, quest.progress?.[req.name]));
}

function routableQuests(questState, ctx) {
  const offers = ensureQuestOfferState(questState);
  const catalog = getQuestCatalog();
  return Object.keys(questState.active || {})
    .filter((id) => !offers.failed[id] && (!ctx.only || ctx.only === id))
    .filter((id) => !ctx.managedOnly || offers.managed[id])
    .map((id) => ({ id, quest: questState.active[id], def: catalog[id] }))
    .filter((row) => row.def);
}

function turnInKind(def) {
  if (def.familiarTurnin) return 'familiar';
  if ((def.endNpcs || []).length) return 'npc';
  return 'auto';
}

function collectCompletable(questState, rows, before) {
  const completable = [];
  for (const { id, def } of rows) {
    if (!before.get(id) && requirementsComplete(questState, def)) {
      completable.push({ classTsid: id, def, turnIn: turnInKind(def) });
    }
  }
  return completable;
}

function makeMatches(req, event) {
  const m = String(event).match(/^(?:making_recipe:(.+)|make:(.+))$/);
  if (!m) return false;
  if (m[2] !== undefined) return String(req.recipeId) === m[2];
  return m[1] === req.recipeKey || m[1] === req.outputClass;
}

/**
 * Single entry point for gameplay events. Advances every active quest
 * requirement the event maps to (counter, flag, make, work) and returns the
 * quests that just became completable. With ctx.inv, item requirements are
 * re-synced first. With ctx.autoTurnIn, completable quests are turned in
 * immediately and their results returned in `completed`.
 * @param {object} questState
 * @param {string} event  e.g. 'npc_piggy:pet', 'trants_harvested:trant_bean', 'making_recipe:cheese', 'quoins_collected'
 * @param {number} [amount=1]
 */
export function routeQuestEvent(questState, event, amount = 1, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  const rows = routableQuests(questState, ctx);
  const before = new Map(rows.map(({ id, def }) => [id, requirementsComplete(questState, def)]));
  if (ctx.inv) syncItemRequirements(questState, ctx.inv, { ...ctx, silent: true });
  const advanced = [];
  if (delta > 0) {
    const counters = eventCounters(event);
    for (const { id, quest, def } of rows) {
      for (const req of def.requirements || []) {
        let next = null;
        const current = Number(quest.progress[req.name]) || 0;
        if (req.type === 'make' && makeMatches(req, event)) {
          next = Math.min(req.num, current + delta);
        } else if (req.type === 'work' && event === `work:${req.classId}`) {
          next = Math.min(req.num, current + delta);
        } else if (req.type === 'counter' || req.type === 'flag') {
          const hit = counters.find((c) => c.counter === req.name);
          if (!hit) continue;
          if (hit.route?.minAmount && delta < hit.route.minAmount) continue;
          if (hit.route?.distinct) {
            const seen = ((offers.distinct[id] ||= {})[req.name] ||= []);
            if (seen.includes(hit.label)) continue;
            seen.push(hit.label);
            next = req.type === 'flag' ? 1 : Math.min(req.num, current + 1);
          } else {
            next = req.type === 'flag' ? 1 : Math.min(req.num, current + delta);
          }
        }
        if (next === null || next === current) continue;
        quest.progress[req.name] = next;
        advanced.push({ classTsid: id, requirement: req.name, current: next, num: req.type === 'flag' ? 1 : req.num });
      }
    }
  }
  const completable = collectCompletable(questState, rows, before);
  const completed = ctx.autoTurnIn
    ? completable.map((row) => turnInQuest(questState, row.classTsid, ctx.pc || null, ctx))
    : [];
  return { advanced, completable, completed };
}

/**
 * Item/currant requirements track what is in the pack (quest.js
 * get_req_state: min(count, num)), so they can also fall. Call after any
 * pack change. Returns newly completable quests.
 */
export function syncItemRequirements(questState, inv, ctx = {}) {
  const rows = routableQuests(questState, ctx);
  const before = new Map(rows.map(({ id, def }) => [id, requirementsComplete(questState, def)]));
  const advanced = [];
  for (const { id, quest, def } of rows) {
    for (const req of def.requirements || []) {
      let have = null;
      if (req.type === 'item') have = countIn(inv, req.classId, ctx);
      else if (req.type === 'currants') have = Math.max(0, Number(ctx.pc?.currants) || 0);
      if (have === null) continue;
      const next = Math.min(req.num, have);
      if ((Number(quest.progress[req.name]) || 0) === next) continue;
      quest.progress[req.name] = next;
      advanced.push({ classTsid: id, requirement: req.name, current: next, num: req.num });
    }
  }
  const completable = ctx.silent ? [] : collectCompletable(questState, rows, before);
  return { advanced, completable };
}

/* ------------------------------------------------------------------ */
/* Turn-in + rewards                                                    */
/* ------------------------------------------------------------------ */

/**
 * Complete an active quest whose requirements are met (or ctx.force):
 * destroys `remove: true` items (tryComplete), moves it to completed,
 * grants rewards (scalar, per-Giant favor, items, recipes), queues chain
 * offers, and returns an award-screen payload.
 */
export function turnInQuest(questState, classTsid, pc = null, ctx = {}) {
  const offers = ensureQuestOfferState(questState);
  const def = getQuestCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  if (!questState.active?.[classTsid]) return { ok: false, reason: 'not_active' };
  if (ctx.inv) syncItemRequirements(questState, ctx.inv, { ...ctx, only: classTsid, silent: true });
  if (!ctx.force && !requirementsComplete(questState, def)) return { ok: false, reason: 'incomplete' };
  const removed = [];
  if (ctx.inv) {
    for (const req of def.requirements || []) {
      if (req.type === 'item' && req.remove && removeFrom(ctx.inv, req.classId, req.num, ctx)) {
        removed.push({ classTsid: req.classId, count: req.num });
      }
    }
  }
  const result = completeQuest(questState, classTsid, null);
  const summary = applyQuestRewards(pc, def.rewards || {}, ctx);
  delete offers.timers[classTsid];
  delete offers.failed[classTsid];
  delete offers.distinct[classTsid];
  const chained = [];
  for (const next of def.chainOffers || []) {
    enqueueQuestOffer(questState, next);
    chained.push(next);
  }
  return {
    ok: result.ok,
    reason: result.reason,
    classTsid,
    def,
    removed,
    rewards: summary,
    chained,
    award: questAwardPayload(def, summary),
  };
}

/** Payload for screen-fx.js showAwardScreen / game.js enqueueAward. */
export function questAwardPayload(def, summary = {}) {
  const steps = parseQuestConversation(def?.completion || '');
  return {
    kind: 'quest',
    classTsid: def?.classTsid,
    title: def?.title || 'Quest complete',
    body: steps.length ? '' : cleanQuestMarkup(def?.desc || ''),
    subtitle: summary.subtitle || '',
    steps,
    primaryLabel: 'OK',
  };
}

/* ------------------------------------------------------------------ */
/* Timed quests                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fail timed quests whose timer buff has run out (quest.js onFail:
 * progress resets; the quest stays in the log and can be started again).
 * @returns {string[]} failed quest ids
 */
export function tickQuestTimers(questState, now = Date.now()) {
  const offers = ensureQuestOfferState(questState);
  const failed = [];
  for (const [id, timer] of Object.entries(offers.timers)) {
    const quest = questState.active?.[id];
    if (!quest) {
      delete offers.timers[id];
      continue;
    }
    if (now < timer.endsAt) continue;
    const def = getQuestCatalog()[id];
    if (def && requirementsComplete(questState, def)) continue;
    for (const key of Object.keys(quest.progress)) quest.progress[key] = 0;
    delete offers.timers[id];
    delete offers.distinct[id];
    offers.failed[id] = now;
    failed.push(id);
  }
  return failed;
}

/** Restart a failed timed quest with a fresh timer. */
export function restartTimedQuest(questState, classTsid, now = Date.now()) {
  const offers = ensureQuestOfferState(questState);
  const quest = questState.active?.[classTsid];
  const def = getQuestCatalog()[classTsid];
  if (!quest || !def) return { ok: false, reason: 'not_active' };
  for (const key of Object.keys(quest.progress)) quest.progress[key] = 0;
  delete offers.failed[classTsid];
  delete offers.distinct[classTsid];
  if (def.timer?.durationSec) {
    offers.timers[classTsid] = { startedAt: now, endsAt: now + def.timer.durationSec * 1000 };
  }
  quest.startedAt = now;
  return { ok: true, timer: offers.timers[classTsid] || null };
}

/** Remaining time for an active timed quest, or null. */
export function questTimerStatus(questState, classTsid, now = Date.now()) {
  const offers = ensureQuestOfferState(questState);
  const timer = offers.timers[classTsid];
  if (!timer) return offers.failed[classTsid] ? { failed: true, remainingMs: 0 } : null;
  return { failed: false, remainingMs: Math.max(0, timer.endsAt - now), endsAt: timer.endsAt };
}
