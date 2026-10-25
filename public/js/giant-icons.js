/**
 * Giant Icons: eleven Emblems of one Giant iconize into an Icon of that
 * Giant, which is adored for mood, energy and iMG, kept running with tithes,
 * and bestows "Giant Love" on players who walk past it on a street.
 *
 * Source (Tiny Speck GameServerJS, CC0):
 *   items/emblem_*.js      emblem_base iconize (11 -> icon; ti -> icon_tii,
 *                          quests_inc_counter icons_created), caress (+25
 *                          mood), consider (+20 energy), contemplate (+30
 *                          iMG), each once a game day per emblem class
 *   items/include/icon.js  ruminate (mood) / revere (energy) / reflect (iMG):
 *                          randInt(25, 100), above level 20 the range grows
 *                          +5 / +20 a level; the last tither gets x2, else
 *                          Piety x1.2; each costs one of 20 actions; once a
 *                          game day per icon class. Tithe: 121 currants
 *                          (+33 a level above 20, Pious Patron cards
 *                          -3/5/10/20%), only at 10 or fewer actions and
 *                          level 5+, adds 5 actions. Bestowment on collision:
 *                          one check a minute per Giant, 5% (Giants' Beloved
 *                          5.5/6/6.5%), mood/energy/iMG randInt(50, 100)
 *                          (+5/+20 a level above 20) or favor 25 (+5 x level
 *                          above 20) while 10 (Piety 20) under the Giant's
 *                          favor cap; "A tithe is due." once a minute when
 *                          the icon is out of actions
 *   items/icon_*.js        20 actions, Voices/Rituals/Books/Facts of the
 *                          Giants conversations (level 10, 111 iMG): since
 *                          G202 these run on the player's one conversation
 *                          record with the source's offer rules
 *                          (js/conversations.js, conversations-data.js,
 *                          features/conversations-feature.js), as
 *                          include/icon.js onPlayerCollision 565-575 runs
 *                          them through pc.conversations_offer; their text
 *                          is only in conversations-data.js (G214)
 *   quests/create_giant_icon.js, achievements/giant_lover.js
 *
 * ruminate/revere/reflect only work in the pack or a POL (container.is_bag ||
 * pols_is_pol); a public street icon offers tithe, talk to, pick up and the
 * bestowments. The remake's homes are scenes without the feature street
 * hooks, so icons are placed on streets only.
 */

import { GIANT_ICON_DATA } from './giant-icons-data.js';
// The Icon conversations' one copy, with every other teller's (G214); the key every importer uses.
import { TELLERS } from './conversations-data.js?v=g202-1';

export { GIANT_ICON_DATA };

export const ICONIZE_COUNT = 11;
export const ICON_ACTIONS = 20;
export const TITHE_THRESHOLD = 10;
export const TITHE_ACTIONS = 5;
export const TITHE_MIN_LEVEL = 5;
export const BESTOW_DELAY_MS = 60_000;
export const BESTOW_TESTING_DELAY_MS = 6_000;
export const GIANT_LOVE_MS = 3250;
export const EMBLEM_VERBS = Object.freeze({
  caress: { stat: 'mood', amount: 25, past: 'caressed', tooltip: 'Roll it around in your hand' },
  consider: { stat: 'energy', amount: 20, past: 'considered', tooltip: 'Think on the emblem a bit' },
  contemplate: { stat: 'xp', amount: 30, past: 'contemplated', tooltip: 'Ponder the emblemness of this' },
});
export const ICON_VERBS = Object.freeze({
  ruminate: { stat: 'mood', past: 'ruminated on', label: 'Ruminate', done: 'ruminated on' },
  revere: { stat: 'energy', past: 'revered', label: 'Revere', done: 'revered' },
  reflect: { stat: 'xp', past: 'reflected on', label: 'Reflect', done: 'reflected on' },
});
export const GIANT_LOVER = 'giant_lover';
export const ICON_QUEST = 'create_giant_icon';

const GIANT_IDS = Object.keys(GIANT_ICON_DATA);
const ICON_TO_GIANT = Object.fromEntries(GIANT_IDS.map((g) => [GIANT_ICON_DATA[g].iconClass, g]));

const whole = (v, max = 1e9) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const capitalize = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));
/** Source randInt(lo, hi), inclusive. */
export const randInt = (lo, hi, rng = Math.random) => lo + Math.floor(rng() * (hi - lo + 1));

export function iconClassFor(giant) {
  return GIANT_ICON_DATA[giant]?.iconClass || null;
}
export function giantForIcon(classTsid) {
  return ICON_TO_GIANT[classTsid] || null;
}
export function giantForEmblem(classTsid) {
  const g = String(classTsid || '').replace(/^emblem_/, '');
  return classTsid?.startsWith?.('emblem_') && GIANT_ICON_DATA[g] ? g : null;
}
/** The name the icon verbs print: get_giant() is the class suffix, so Ti's icon says "Tii". */
export function iconGiantName(giant) {
  return capitalize(GIANT_ICON_DATA[giant]?.iconClass.replace('icon_', '') || giant);
}

/* ---------------------------------------------------------------- state */

export function createIconState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const pack = {};
  for (const g of GIANT_IDS) {
    const rows = Array.isArray(s.pack?.[g]) ? s.pack[g] : [];
    pack[g] = rows.map((n) => whole(n, ICON_ACTIONS + 1000));
  }
  const placed = {};
  for (const [tsid, rows] of Object.entries(s.placed || {})) {
    if (!Array.isArray(rows)) continue;
    const list = rows
      .filter((r) => r && GIANT_ICON_DATA[r.giant])
      .map((r) => ({ id: String(r.id || ''), giant: r.giant, x: Number(r.x) || 0, y: Number(r.y) || 0, actions: whole(r.actions, 10_000) }))
      .filter((r) => r.id);
    if (list.length) placed[tsid] = list;
  }
  return {
    pack,
    placed,
    day: String(s.day || ''),
    used: s.used && typeof s.used === 'object' ? { ...s.used } : {},
    tither: s.tither ? String(s.tither) : null,
    bestowAt: { ...(s.bestowAt || {}) },
    titheAskAt: { ...(s.titheAskAt || {}) },
    iconized: Array.isArray(s.iconized) ? s.iconized.filter((g) => GIANT_ICON_DATA[g]) : [],
    created: whole(s.created),
    bestowed: whole(s.bestowed),
    nextId: Math.max(1, whole(s.nextId) || 1),
  };
}

/** Daily-use ledger (achievements_get_daily_label_count) for a game day key. */
export function rollIconDay(state, dayKey) {
  if (state.day !== dayKey) {
    state.day = dayKey;
    state.used = {};
  }
}
export function usedToday(state, classTsid, verb) {
  return Boolean(state.used[`${classTsid}:${verb}`]);
}
function markUsed(state, classTsid, verb) {
  state.used[`${classTsid}:${verb}`] = (state.used[`${classTsid}:${verb}`] || 0) + 1;
}

/** Keep one action counter per Icon in the pack (fresh icons start at 20). */
export function syncPackIcons(state, inv) {
  for (const g of GIANT_IDS) {
    const n = whole(inv?.[GIANT_ICON_DATA[g].iconClass]);
    const rows = state.pack[g] || (state.pack[g] = []);
    while (rows.length < n) rows.push(ICON_ACTIONS);
    if (rows.length > n) rows.length = n;
  }
  return state;
}

/* ------------------------------------------------------------- emblems */

export function iconizeCheck(inv, giant) {
  const def = GIANT_ICON_DATA[giant];
  if (!def) return { ok: false, msg: 'That is not an emblem.' };
  const have = whole(inv?.[def.emblemClass]);
  if (have < ICONIZE_COUNT) return { ok: false, have, msg: `You need ${ICONIZE_COUNT} ${def.emblemPlural} to form an Icon (you have ${have}).` };
  return { ok: true, have };
}

/**
 * emblem_base iconize: destroy 11 emblems, create the Icon. Returns the
 * source activity line and whether this was the player's first Icon of that
 * Giant (Giant Lover counts distinct Giants).
 */
export function iconize(state, inv, giant) {
  const check = iconizeCheck(inv, giant);
  if (!check.ok) return check;
  const def = GIANT_ICON_DATA[giant];
  inv[def.emblemClass] = whole(inv[def.emblemClass]) - ICONIZE_COUNT;
  if (inv[def.emblemClass] <= 0) delete inv[def.emblemClass];
  inv[def.iconClass] = whole(inv[def.iconClass]) + 1;
  syncPackIcons(state, inv);
  state.created += 1;
  const first = !state.iconized.includes(giant);
  if (first) state.iconized.push(giant);
  const name = iconGiantName(giant);
  return {
    ok: true,
    giant,
    iconClass: def.iconClass,
    first,
    distinct: state.iconized.length,
    giantLover: state.iconized.length >= GIANT_IDS.length,
    msg: `*Zap!* 11 Emblems of ${name} combined to form an Icon of ${name}.`,
  };
}

export function emblemVerbCheck(state, giant, verb) {
  const def = GIANT_ICON_DATA[giant];
  if (!def || !EMBLEM_VERBS[verb]) return { ok: false, msg: '' };
  if (usedToday(state, def.emblemClass, verb)) {
    return { ok: false, msg: `You've already ${EMBLEM_VERBS[verb].past} an Emblem of ${capitalize(giant)} today.` };
  }
  return { ok: true };
}

/** caress / consider / contemplate: a fixed metabolic gift once a game day. */
export function useEmblem(state, giant, verb) {
  const check = emblemVerbCheck(state, giant, verb);
  if (!check.ok) return check;
  const def = GIANT_ICON_DATA[giant];
  const v = EMBLEM_VERBS[verb];
  markUsed(state, def.emblemClass, verb);
  return {
    ok: true,
    stat: v.stat,
    amount: v.amount,
    msg: `You ${v.past} an ${def.emblemLabel}.`,
  };
}

/* ------------------------------------------------------------- icons */

/** icon_tithe_cost: 121 currants, +33 a level above 20, the best Pious Patron card. */
export function titheCost(level, upgrades = []) {
  const owned = asSet(upgrades);
  let cost = 121;
  if (level > 20) cost += (level - 20) * 33;
  if (owned.has('icon_tithe_4')) cost -= cost * 0.2;
  else if (owned.has('icon_tithe_3')) cost -= cost * 0.1;
  else if (owned.has('icon_tithe_2')) cost -= cost * 0.05;
  else if (owned.has('icon_tithe_1')) cost -= cost * 0.03;
  return Math.round(cost);
}

/** Bestowment chance in percent (Giants' Beloved I-III). */
export function bestowChance(upgrades = []) {
  const owned = asSet(upgrades);
  if (owned.has('icon_bestow_chance_3')) return 6.5;
  if (owned.has('icon_bestow_chance_2')) return 6;
  if (owned.has('icon_bestow_chance_1')) return 5.5;
  return 5;
}

/** [lower, upper] for an adoration verb (25-100) or a bestowment (50-100), scaled above level 20. */
export function rewardRange(level, bestow = false) {
  let upper = 100;
  let lower = bestow ? 50 : 25;
  if (level > 20) {
    upper += (level - 20) * 20;
    lower += (level - 20) * 5;
  }
  return [lower, upper];
}

/** Find an icon record: { where: 'pack', giant, index } or a placed row. */
export function packIconActions(state, giant) {
  return state.pack[giant] || [];
}

/** The pack icon a verb acts on: the first with actions left (tithe: the emptiest one). */
export function pickPackIcon(state, giant, { forTithe = false } = {}) {
  const rows = packIconActions(state, giant);
  if (!rows.length) return -1;
  if (forTithe) {
    let best = -1;
    for (let i = 0; i < rows.length; i += 1) if (best === -1 || rows[i] < rows[best]) best = i;
    return best;
  }
  const i = rows.findIndex((n) => n > 0);
  return i === -1 ? 0 : i;
}

function iconRef(state, ref) {
  if (ref.placedId) {
    for (const rows of Object.values(state.placed)) {
      const row = rows.find((r) => r.id === ref.placedId);
      if (row) return { row, key: `placed:${row.id}`, giant: row.giant };
    }
    return null;
  }
  const giant = ref.giant;
  const rows = state.pack[giant];
  if (!rows || !rows.length) return null;
  const index = Number.isInteger(ref.index) ? ref.index : pickPackIcon(state, giant, ref);
  if (index < 0 || index >= rows.length) return null;
  return {
    get row() {
      return { actions: rows[index] };
    },
    set: (n) => {
      rows[index] = n;
    },
    key: `pack:${giant}:${index}`,
    giant,
  };
}

function setActions(ref, n) {
  if (ref.set) ref.set(n);
  else ref.row.actions = n;
}

export function adoreCheck(state, ref, verb, ctx = {}) {
  const found = iconRef(state, ref);
  if (!found) return { ok: false, msg: 'You have no Icon of that Giant.' };
  const def = GIANT_ICON_DATA[found.giant];
  if (ref.placedId && !ctx.pol) return { ok: false, hidden: true, msg: '' };
  if (usedToday(state, def.iconClass, verb)) {
    return { ok: false, msg: `You've already ${ICON_VERBS[verb].done} an Icon of ${iconGiantName(found.giant)} today.` };
  }
  if (found.row.actions <= 0) {
    return { ok: false, msg: `This Icon requires a tithe of ${titheCost(ctx.level || 0, ctx.upgrades)} currants to become operational.` };
  }
  return { ok: true, found };
}

/**
 * ruminate (mood) / revere (energy) / reflect (iMG). Returns the amount to
 * pay; the caller applies it (mood/energy clamp to the tank).
 */
export function adoreIcon(state, ref, verb, ctx = {}, rng = Math.random) {
  if (!ICON_VERBS[verb]) return { ok: false, msg: '' };
  const check = adoreCheck(state, ref, verb, ctx);
  if (!check.ok) return check;
  const { found } = check;
  const def = GIANT_ICON_DATA[found.giant];
  const [lower, upper] = rewardRange(ctx.level || 0);
  let amount = randInt(lower, upper, rng);
  let tither = false;
  if (state.tither && state.tither === found.key) {
    amount *= 2;
    tither = true;
    state.tither = null;
  } else if (asSet(ctx.skills).has('piety_1')) {
    amount = 1.2 * amount;
  }
  amount = Math.round(amount);
  setActions(found, Math.max(0, found.row.actions - 1));
  markUsed(state, def.iconClass, verb);
  return {
    ok: true,
    giant: found.giant,
    stat: ICON_VERBS[verb].stat,
    amount,
    tither,
    actions: found.row.actions,
    msg: `You ${ICON_VERBS[verb].past} an ${def.label}.`,
  };
}

export function titheCheck(state, ref, ctx = {}) {
  const found = iconRef(state, { ...ref, forTithe: true });
  if (!found) return { ok: false, msg: 'You have no Icon of that Giant.' };
  if (found.row.actions > TITHE_THRESHOLD) return { ok: false, msg: 'This Icon does not require a tithe.' };
  if ((ctx.level || 0) < TITHE_MIN_LEVEL) return { ok: false, msg: 'Only the truly penitent Glitch may tithe. Come back in a few levels.' };
  const cost = titheCost(ctx.level || 0, ctx.upgrades);
  if ((ctx.currants || 0) < cost) return { ok: false, cost, msg: `You need ${cost} currants to tithe!` };
  return { ok: true, found, cost };
}

/** icon_tithe: pay, +5 actions (only while at 10 or fewer), become the Icon's last tither. */
export function titheIcon(state, ref, pc, ctx = {}) {
  const check = titheCheck(state, ref, { ...ctx, currants: pc?.currants });
  if (!check.ok) return check;
  const { found, cost } = check;
  const def = GIANT_ICON_DATA[found.giant];
  pc.currants = Math.max(0, (pc.currants || 0) - cost);
  const extra = [];
  if (found.row.actions <= TITHE_THRESHOLD) {
    setActions(found, found.row.actions + TITHE_ACTIONS);
    extra.push('Your generous donation will contribute to the upkeep of the Icon.');
  }
  state.tither = found.key;
  return {
    ok: true,
    cost,
    giant: found.giant,
    actions: found.row.actions,
    msg: `You tithed ${cost} currants to an ${def.label}. ${extra.join(' ')}`.trim(),
  };
}

/* ------------------------------------------------------------- placing */

/** Move one pack Icon onto a street (keeps its action counter). */
export function placeIcon(state, inv, giant, tsid, x, y) {
  const def = GIANT_ICON_DATA[giant];
  if (!def || whole(inv?.[def.iconClass]) < 1) return { ok: false, msg: 'You have no Icon of that Giant.' };
  syncPackIcons(state, inv);
  const rows = state.pack[giant];
  const index = pickPackIcon(state, giant);
  const actions = rows.splice(index, 1)[0] ?? ICON_ACTIONS;
  inv[def.iconClass] -= 1;
  if (inv[def.iconClass] <= 0) delete inv[def.iconClass];
  const id = `icon${state.nextId++}`;
  const row = { id, giant, x: Math.round(x), y: Math.round(y), actions };
  (state.placed[tsid] ||= []).push(row);
  if (state.tither === `pack:${giant}:${index}`) state.tither = `placed:${id}`;
  return { ok: true, row, msg: `You placed an ${def.label}.` };
}

export function pickUpIcon(state, inv, tsid, id) {
  const rows = state.placed[tsid] || [];
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return { ok: false, msg: 'That Icon is not here any more.' };
  const [row] = rows.splice(i, 1);
  if (!rows.length) delete state.placed[tsid];
  const def = GIANT_ICON_DATA[row.giant];
  inv[def.iconClass] = whole(inv[def.iconClass]) + 1;
  (state.pack[row.giant] ||= []).push(row.actions);
  if (state.tither === `placed:${row.id}`) state.tither = `pack:${row.giant}:${state.pack[row.giant].length - 1}`;
  return { ok: true, row, msg: `You picked up an ${def.label}.` };
}

/* ------------------------------------------------------------ bestowing */

/**
 * doPlayerResponse on collision with a placed Icon. One check a minute per
 * Giant (6 s while testing). Returns null when nothing happens, a tithe
 * request bubble, or a bestowment { stat, amount } to apply.
 * ctx: { now, level, skills, upgrades, favor, favorMax, testing }
 */
export function bestowCheck(state, row, ctx = {}, rng = Math.random) {
  const now = ctx.now ?? Date.now();
  const giant = row.giant;
  const delay = ctx.testing ? BESTOW_TESTING_DELAY_MS : BESTOW_DELAY_MS;
  if (row.actions <= 0) {
    if (now - (state.titheAskAt[giant] || 0) >= delay) {
      state.titheAskAt[giant] = now;
      return { kind: 'tithe', bubble: 'A tithe is due. Insert currants to continue.' };
    }
    return null;
  }
  if (now - (state.bestowAt[giant] || 0) < delay) return null;
  state.bestowAt[giant] = now;
  const chance = bestowChance(ctx.upgrades);
  const roll = randInt(1, 1000, rng);
  if (!(roll <= 10 * chance || ctx.testing)) return { kind: 'miss', roll, chance };
  const piety = asSet(ctx.skills).has('piety_1');
  const types = ['mood', 'energy', 'xp'];
  const favorMax = (ctx.favorMax || 0) - (piety ? 20 : 10);
  if (!((ctx.favor || 0) >= favorMax)) types.push('favor');
  const type = types[randInt(0, types.length - 1, rng)];
  const key = `placed:${row.id}`;
  const level = ctx.level || 0;
  let amount;
  if (type === 'favor') {
    amount = 25;
    if (level > 20) amount += 5 * level;
  } else {
    const [lower, upper] = rewardRange(level, true);
    amount = randInt(lower, upper, rng);
  }
  let tither = false;
  if (state.tither === key) {
    amount *= 2;
    tither = true;
    state.tither = null;
  } else if (piety) {
    amount *= 1.2;
  }
  amount = Math.round(amount);
  state.bestowed += 1;
  return {
    kind: 'bestow',
    type,
    amount,
    tither,
    favorGiant: giant === 'ti' ? 'ti' : giant,
    roll,
    chance,
  };
}

/** The activity line for a bestowment after the caller applied `actual`. */
export function bestowMessage(giant, type, actual) {
  const name = iconGiantName(giant);
  if (type === 'xp') return `The Icon of ${name} has bestowed ${actual} iMG upon you.`;
  if (type === 'favor') return `The Icon of ${name} has bestowed ${actual} favor upon you.`;
  if (actual > 0) return `The Icon of ${name} has bestowed ${actual} ${type} upon you.`;
  return `The Icon of ${name} tried to bestow ${type} upon you, but you didn't need any.`;
}

/* ------------------------------------------------------------ talk to */

/**
 * A save from before G202 kept the Icon conversations told in `talked`;
 * the feature hands them to the shared record once. The ids it knows.
 */
export function legacyIconTalks(slice) {
  const known = new Set(Object.values(GIANT_ICON_DATA).flatMap((d) => TELLERS[d.iconClass]?.list || []));
  return (Array.isArray(slice?.talked) ? slice.talked : []).map(String).filter((id) => known.has(id));
}

export const GIANT_ICON_IDS = Object.freeze(GIANT_IDS);
