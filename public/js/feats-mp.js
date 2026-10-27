/**
 * Feats between real players (register G345): the pure half of the shared
 * Feat. In the original a Feat was one goal everyone on the server worked
 * toward for one day; solo turned the fifteen production Feats into personal
 * goals (js/solo-feats.js, G143). In multiplayer the realtime server
 * (groddle-afternoon-server feats.go, its header lists the messages) runs one
 * Feat at a time for everyone, counts every player's contributions, keeps
 * the goals, the ranks and the rewards; the site's ledger puts each reward's
 * currants in (src/LedgerService.php ledger/feat). This file holds the rules
 * the server's table is built from (tools/build-realtime-feats.mjs ->
 * data/feats.json) and the client's helpers; features/solo-feats-feature.js
 * uses it only when engine.mode is 'multiplayer'.
 *
 * Source:
 *  - groups/feat.js 3-61: a Feat has goal, goal_multiplier, stretch_goal1 and
 *    stretch_goal2; increment adds every contribution (the sanity cap at
 *    24-30 is commented out, so it keeps counting past the goals) and the
 *    Feat is complete at stretch_goal2 (37-39). get_status 67-79.
 *  - players/inc_feats.js 15-35 feats_get: a Feat is open from its game_day
 *    for 24 real hours (converted + 24*60*60), one at a time
 *    (feats_get_current 295-309). Blog 2012-10-12 "The Epic of Feats": "All
 *    Feats now last exactly 24 hours", a "minimum goal" that unlocks a "bonus
 *    goal", then a "supermegabonus goal"; a Feat that misses its minimum goal
 *    has failed; the reward pool scales with what was done ("if ... players
 *    managed to pet 150 piggies ... the reward pool would be increased by
 *    50%"); every participant gets at least a small petrified rock, top
 *    contributors in tiers larger ones.
 *  - players/inc_feats.js 37-113 feats_increment: the first contribution to a
 *    Feat counts feats:contributed (54), epics_contributed:<epic> (56),
 *    epics_completed:<epic> (58-69), quick_on_your_feat inside 30 minutes of
 *    the start (72), the vog_text with {remaining} (74-83); every
 *    contribution grants down_to_the_wire (104-106).
 *  - players/inc_feats.js 129-151 adminFeatsGiveRewards: place <= 26 counts
 *    feats:top_26 (Order of the Third Otter at 3, of the Seventh Seal at 7),
 *    places 27 to 30 get The Cigar; 164-252 the conversation; 255-283
 *    feats_gather_rewards pays it and counts feats:contributed_to (281).
 *  - main.js 7692-7733 doBreakIt: one real reward conversation (place 1304,
 *    hi_signs_1): 272 iMG, 170 currants, 102 energy, 34 favor with every
 *    Giant and one Small Petrified Rock.
 *
 * GOALS. Goals are not in GSJS (groups/feat.js doCreate took them from the
 * web side). The rule here: the minimum goal is three players' sittings,
 * three times the solo personal goal (solo-feats.js PERSONAL GOALS: one
 * sitting of that Feat's activity); the bonus goal is twice the minimum and
 * the supermegabonus goal three times it, the blog's three steps.
 *
 * SCHEDULE. The source ran each Feat once on its own game_day, years apart.
 * Here the wired Feats take turns in game_day order, one a real day (the
 * source's 24 hours), from the Glitch calendar's epoch (game-day.js
 * GAME_EPOCH_MS), so a Feat starts on a game day boundary and the turn comes
 * back every ten days.
 *
 * REWARDS. A Feat that met its minimum goal pays every contributor the
 * doBreakIt reward times the pool's scale (what was done over the minimum
 * goal, at most the supermegabonus over the minimum, so 1 to 3), and a Small
 * Petrified Rock. Places 1 to 5 also get a Large rock and places 6 to 26 a
 * Medium one (the blog's tiers; the cut at 26 is feats:top_26's, the one at
 * 5 ours). Currants go into the ledger; iMG, mood, energy, favor, the rocks
 * (not tradeable, so not the ledger's) and the badges are the client's to
 * apply from feat_reward, which the server sends until it is acked.
 *
 * PACE. Contributions are the player's own client reporting what it did
 * (the server cannot see animals or packs). The server takes the amount
 * from its table where the source fixes one, caps a report at `burst`, and
 * lets each player add to each Feat at most `n` every `everyMs` (a bucket
 * that holds `burst`), the source's pace where it has one (MP_PACE). A
 * streak counts once per street per game day and a qurazy quoin once per
 * street per Feat (MP_ACTS).
 */

import { FEAT_BY_ID, QUICK_MS, REWARD_ITEM, SOLO_FEATS, WIRED_FEATS, vogTextFor } from './solo-feats.js?v=g335-1';
import { GAME_DAY_MS, GAME_EPOCH_MS } from './game-day.js?v=dametime-4';

/** players/inc_feats.js 25-27: a Feat is open for 24 real hours. */
export const RUN_MS = 24 * 60 * 60 * 1000;
export const RUN_EPOCH_MS = GAME_EPOCH_MS;
export { QUICK_MS };

/** GOALS: minimum = 3 x the personal goal; bonus 2 x minimum; supermegabonus 3 x minimum. */
export const MP_GOAL_SCALE = 3;
export const MP_BONUS = 2;
export const MP_SUPER = 3;

/** inc_feats.js 139-144: place <= 26 counts feats:top_26, 27 to 30 get The Cigar. */
export const TOP_PLACES = 26;
export const CIGAR_PLACES = 30;
/** Ours: the top tier of the blog's "various tiers" gets a Large rock. */
export const LARGE_PLACES = 5;

/** main.js 7712-7733 doBreakIt: the one recorded Feat reward (place 1304). */
export const MP_REWARD = Object.freeze({ xp: 272, currants: 170, mood: 0, energy: 102, favor: Object.freeze([Object.freeze({ giant: 'all', points: 34 })]) });
export const ROCK_SMALL = REWARD_ITEM;
export const ROCK_MEDIUM = 'petrified_rock_medium';
export const ROCK_LARGE = 'petrified_rock_large';

/**
 * Per Feat: at most n every everyMs, a bucket of burst (a report counts at
 * most burst). The source's pace where it has one, else ours (marked).
 */
export const MP_PACE = Object.freeze({
  // vog_text counts minutes: one a minute (meditation.js focusing_orb:meditation_time).
  meditation_of_groddlocritus: pace(1, 60_000, 2, 'one minute a minute (vog_text counts minutes)'),
  // location.js 255: no more than 5 found a game day.
  qurazy_quoin_collecting: pace(5, GAME_DAY_MS, 5, 'location.js:255 five a game day'),
  donate_sparkly: pace(1, 3_000, 50, 'ours: a chunk every 3 s, a stack at once'),
  reminscequests: pace(1, 60_000, 3, 'ours: a quest a minute'),
  // TSFrontController.as 3165-3178: one hi per two seconds.
  hi_signs_1: pace(1, 2_000, 3, 'TSFrontController.as:3165-3178 one hi per 2 s'),
  pet_only: pace(1, 2_000, 30, 'ours: a kindness every 2 s, committed on leaving a street'),
  // location.js 1046-1050 once per street per game day; inc_skill_packages.js:54 a Cubimal box +5.
  streaking: pace(1, 10_000, 5, 'ours: a street every 10 s; a Cubimal box is 5'),
  tottlys_toys: pace(1, 3_000, 10, 'ours: a toy every 3 s; setting a Cubimal free is 5'),
  animal_love: pace(1, 2_000, 10, 'ours: an animal every 2 s; a crab gives up to 5'),
  // location.js 4529-4553: 1, 2 and 3 points, one line per chain.
  makeup_feat_redux: pace(3, 15_000, 3, 'ours: a line of up to 3 points every 15 s'),
});

/** Feats whose reports name what was done: a fixed amount and a dedupe key. */
export const MP_ACTS = Object.freeze({
  streaking: Object.freeze({
    streak: Object.freeze({ n: 1, dedupe: 'street-day', source: 'location.js 1041-1055 once per street per game day' }),
    wheel: Object.freeze({ n: 5, source: 'inc_skill_packages.js:54 spinning_wheel cubimal_package' }),
  }),
  qurazy_quoin_collecting: Object.freeze({
    quoin: Object.freeze({ n: 1, dedupe: 'street', source: 'one qurazy quoin per street' }),
  }),
});

function pace(n, everyMs, burst, source) {
  return Object.freeze({ n, everyMs, burst, source });
}

/** The goals of one Feat in multiplayer. */
export function mpGoals(featId) {
  const f = FEAT_BY_ID[featId];
  if (!f?.wired) return null;
  const goal = f.goal * MP_GOAL_SCALE;
  return { goal, bonus: goal * MP_BONUS, super: goal * MP_SUPER };
}

/** The Feats that take turns, in game_day order (inc_data_feats_prod.js file order). */
export const MP_ORDER = Object.freeze(WIRED_FEATS.map((f) => f.id));

/** Which Feat is open at a time (the server's schedule, for tests and the panel's next line). */
export function runAt(now, shift = 0, order = MP_ORDER) {
  const n = Math.floor((Number(now) + shift - RUN_EPOCH_MS) / RUN_MS);
  const start = RUN_EPOCH_MS + n * RUN_MS - shift;
  return { run: n, feat: order[((n % order.length) + order.length) % order.length], start, end: start + RUN_MS };
}

/** inc_feats.js:311 feats_count_in_epic, over every production Feat. */
export function epicSizes() {
  const out = {};
  for (const f of SOLO_FEATS) if (f.epic_id) out[f.epic_id] = (out[f.epic_id] || 0) + 1;
  return out;
}

// —— Client helpers ——————————————————————————————————————————————————————

/** Ids a save remembers as applied (the site's LedgerMath::FEAT_APPLIED_KEEP). */
export const APPLIED_KEEP = 48;

export const MP_TEXT = Object.freeze({
  heading: "Today's Feat",
  copy: 'One Feat for everyone playing, for one day. Every contribution counts toward its goals.',
  goal: 'Minimum goal',
  bonus: 'Bonus goal',
  super: 'Supermegabonus goal',
  waiting: 'Waiting for the Feat...',
  offline: 'You are not connected, so this Feat cannot count that right now.',
  noOne: 'No one has contributed yet.',
  failed: 'did not meet its minimum goal, so the Feat failed.',
});

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const name = (v) => String(v || 'A Glitch').replace(/[\u0000-\u001f]/g, '').slice(0, 40);

/** A server time (ms) on this page's clock: offset is server now minus local now. */
export const localTime = (t, offset) => (whole(t) ? whole(t) - (Number(offset) || 0) : 0);

/** feats.go runJSON as the panel's run. */
export function runFromServer(msg, offset = 0) {
  if (!msg || !FEAT_BY_ID[msg.feat]) return null;
  return {
    run: whole(msg.run),
    feat: String(msg.feat),
    title: FEAT_BY_ID[msg.feat].title,
    start: localTime(msg.start, offset),
    end: localTime(msg.end, offset),
    total: whole(msg.total),
    goal: whole(msg.goal),
    bonus: whole(msg.bonus),
    super: whole(msg.super),
    count: whole(msg.count),
    mine: whole(msg.mine),
    place: whole(msg.place),
    top: (Array.isArray(msg.top) ? msg.top : []).slice(0, 5).map((c) => ({ id: whole(c?.id), name: name(c?.name), n: whole(c?.n) })),
  };
}

/**
 * Which goal is next and how far (inc_feats.js 87-100, commented in the
 * source but the order it reads the goals in): tier 0 none met, 1 the
 * minimum, 2 the bonus, 3 the supermegabonus.
 */
export function goalStatus(run) {
  if (!run) return { tier: 0, next: 0, remaining: 0, label: '' };
  const steps = [[run.goal, MP_TEXT.goal], [run.bonus, MP_TEXT.bonus], [run.super, MP_TEXT.super]];
  let tier = 0;
  for (const [n] of steps) if (n && run.total >= n) tier += 1;
  if (tier >= 3) return { tier, next: 0, remaining: 0, label: `${MP_TEXT.super} met!` };
  const [next, label] = steps[tier];
  return { tier, next, remaining: Math.max(0, next - run.total), label };
}

/** The line under the bar: "84 more to meet the minimum goal." */
export function goalLine(run) {
  const g = goalStatus(run);
  if (!run) return MP_TEXT.waiting;
  if (g.tier >= 3) return g.label;
  const met = g.tier ? `${[MP_TEXT.goal, MP_TEXT.bonus][g.tier - 1]} met! ` : '';
  return `${met}${g.remaining.toLocaleString()} more to meet the ${g.label.toLowerCase()}.`;
}

/** The first contribution's vog_text, its {remaining} toward the minimum goal (inc_feats.js 76-79). */
export function vogFor(featId, remaining) {
  return vogTextFor(featId, Math.max(0, whole(remaining)));
}

export function ordinal(n) {
  const v = whole(n);
  const t = v % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${v.toLocaleString()}${s}`;
}

/** "You: 42, 3rd of 7 contributors." */
export function youLine(run) {
  if (!run) return '';
  if (!run.mine) return run.count ? `${run.count.toLocaleString()} ${run.count === 1 ? 'Glitch has' : 'Glitches have'} contributed. You have not yet.` : MP_TEXT.noOne;
  return `You: ${run.mine.toLocaleString()}, ${ordinal(run.place)} of ${run.count.toLocaleString()} ${run.count === 1 ? 'contributor' : 'contributors'}.`;
}

/** "Ends in 13 hours." */
export function endsText(end, now = Date.now()) {
  const left = Math.max(0, whole(end) - whole(now));
  const minutes = Math.ceil(left / 60_000);
  if (!left) return 'Ending now.';
  if (minutes < 90) return `Ends in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  return `Ends in ${Math.round(minutes / 60)} hours.`;
}

/** The ended Feat's line: "... met its bonus goal." / "... failed." */
export function endedLine(msg) {
  const f = FEAT_BY_ID[msg?.feat];
  if (!f) return '';
  const tier = whole(msg.tier);
  if (!tier) return `The Feat "${f.title}" ${MP_TEXT.failed}`;
  return `The Feat "${f.title}" has ended and met its ${[MP_TEXT.goal, MP_TEXT.bonus, MP_TEXT.super][tier - 1].toLowerCase()}.`;
}

/** Keep an id once, the newest APPLIED_KEEP. */
export function remember(list, id) {
  if (!id || list.includes(id)) return list;
  list.push(id);
  if (list.length > APPLIED_KEEP) list.splice(0, list.length - APPLIED_KEEP);
  return list;
}

/** The ids a slice lists (feats.go makes feat-f- and feat-r- ids). */
export function appliedFrom(slice) {
  const raw = Array.isArray(slice?.applied) ? slice.applied : [];
  return raw.filter((id) => typeof id === 'string' && /^feat-[fr]-[a-z0-9-]{1,32}$/.test(id)).slice(-APPLIED_KEEP);
}

/**
 * A feat_reward as what the client applies: the rewards (without the
 * currants when the ledger already holds them), the rocks, the counters and
 * the grants. ledger: false when a load already put the currants in (the
 * site lists the id as applied, Ledger::catchUp).
 */
export function rewardParts(msg, { ledger = true } = {}) {
  const r = msg?.rewards || {};
  const favor = (Array.isArray(r.favor) ? r.favor : []).map((f) => ({ giant: String(f?.giant || ''), points: whole(f?.points) })).filter((f) => f.giant && f.points);
  const items = (Array.isArray(msg?.items) ? msg.items : []).map((it) => ({ classTsid: String(it?.c || ''), count: whole(it?.n) })).filter((it) => /^petrified_rock_(small|medium|large)$/.test(it.classTsid) && it.count);
  const counters = (Array.isArray(msg?.counters) ? msg.counters : []).map((c) => ({ counter: String(c?.counter || ''), amount: whole(c?.n) })).filter((c) => /^(feats|epics_contributed|epics_completed):[a-z0-9_]+$/.test(c.counter) && c.amount);
  const grants = (Array.isArray(msg?.grants) ? msg.grants : []).filter((g) => ['the_cigar', 'quick_on_your_feat'].includes(g));
  return {
    rewards: { xp: whole(r.xp), currants: ledger ? whole(r.currants) : 0, mood: whole(r.mood), energy: whole(r.energy), favor },
    items,
    counters,
    grants,
  };
}

/** Words for a reward: "+272 iMG, +170 currants, ...". */
export function rewardBits(r, items = []) {
  const bits = [];
  if (r.xp) bits.push(`+${r.xp.toLocaleString()} iMG`);
  if (r.currants) bits.push(`+${r.currants.toLocaleString()} currants`);
  if (r.mood) bits.push(`+${r.mood.toLocaleString()} mood`);
  if (r.energy) bits.push(`+${r.energy.toLocaleString()} energy`);
  for (const f of r.favor || []) bits.push(`+${f.points.toLocaleString()} ${f.giant === 'all' ? 'favor with every Giant' : `${f.giant} favor`}`);
  const label = { petrified_rock_small: 'Small Petrified Rock', petrified_rock_medium: 'Medium Petrified Rock', petrified_rock_large: 'Large Petrified Rock' };
  for (const it of items) bits.push(`${it.count} ${label[it.classTsid] || it.classTsid}`);
  return bits;
}

/** What one increment report sends: { feat, n, act?, street? } or null when it is not today's Feat. */
export function reportFor(run, featId, amount, opts = {}) {
  if (!run || run.feat !== featId) return null;
  const n = whole(amount);
  if (!n) return null;
  const out = { feat: featId, n };
  const acts = MP_ACTS[featId];
  if (acts) {
    const act = String(opts.act || '');
    if (!acts[act]) return null;
    out.act = act;
    if (acts[act].dedupe) out.street = String(opts.street || '').slice(0, 32);
  }
  return out;
}
