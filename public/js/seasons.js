/**
 * Seasonal calendar and holiday rules (pure; the world side lives in
 * js/features/seasons-feature.js).
 *
 * How the source decided an event was on (common.js):
 *  - isZilloween(): the Dametime month Remember from the 25th to the end of
 *    Zilloween day (Remember has 37 days), plus a 48-hour real-world special
 *    from 6pm PST on 2012-10-30. Carving, candy counting, pumpkin planting
 *    and the carved-pumpkin rot all ask it.
 *  - isGlitchmas(): a real-world cut-off (2012-01-03 10am PST); Egg Nog and
 *    the Yeti's cracker mail ask it.
 *  - isPiDay(): March 14 anywhere on Earth (UTC, plus 12 hours either side);
 *    the Pi recipe and Pi's Estimate verb ask it.
 *  - Both isZilloween and isGlitchmas were forced to `return true` for the
 *    end of the world, so the final server ran every holiday at once.
 *  - The Egg Hunt has no date check at all: petting an Egg Plant runs the
 *    lgt_egg_plant_pet package (items/include/trants.js performPetting, "For
 *    the easter egg hunt"), whose egg_plant_pet drop gives one of five
 *    chocolate eggs, all year. collection_egg_hunter (collection_type 2) then
 *    takes one of each egg for the Egg Hunter Trophy (players/
 *    inc_achievements.js 392-420). So it is not a dated event here either:
 *    EGG_HUNT below describes it, and it is never in activeSeasons.
 *
 * The remake drives each event from the player's real-world date instead
 * (windows below), keeps the source's Dametime Zilloween (Remember 25-37,
 * about two real days in every 51) and the exact Pi Day test, and accepts a
 * `?season=<id>` QA override (`none` forces every event off; an id that is
 * not a dated event, such as egg_hunt, overrides nothing) and
 * `?seasondate=YYYY-MM-DD` to preview a calendar date.
 */

import { SEASON_DATA } from './seasons-data.js?v=249cedba';

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------- catalog */

/**
 * Every dated event. `source` is how much survives in GameServerJS:
 * 'source' = items, verbs and badges are all recovered;
 * 'reconstructed' = items survive but the event mechanics were lost;
 * 'designed' = no source event, written for the remake in Glitch's voice.
 */
export const SEASONS = Object.freeze({
  zilloween: Object.freeze({
    id: 'zilloween',
    label: 'Zilloween',
    giant: 'zille',
    icon: 'pumpkin_lit_1',
    source: 'source',
    window: 'October 17 to November 1, and Remember 25-37 on the Dametime calendar',
    blurb: 'Jack-O-Lanterns glow on every street. Carve pumpkins with a Pick and a Knife & Board, light them with a full Firefly Jar, eat candy for a Sugar Rush, and give candy away.',
  }),
  glitchmas: Object.freeze({
    id: 'glitchmas',
    label: 'Glitchmas',
    giant: 'all',
    icon: 'glitchmas_cracker',
    source: 'source',
    window: 'December 12 to January 3',
    blurb: 'Snow over Ur and candy canes by the signposts. The Toy Vendor stocks Glitchmas Crackers and Cards, Egg Nog is back, and somebody wants you to say "yay".',
  }),
  pi_day: Object.freeze({
    id: 'pi_day',
    label: 'Pi Day',
    giant: 'ti',
    icon: 'pi',
    source: 'source',
    window: 'March 14, wherever it is still March 14',
    blurb: 'Anyone with a Frying Pan can cook Pi today, and a Pi in your pack can Estimate Pi for favor with Tii.',
  }),
});

export const SEASON_IDS = Object.freeze(Object.keys(SEASONS));

/**
 * The Egg Hunt, as the final source ran it: all year, from Egg Plants (see
 * the header). Not a dated event, so not in SEASONS.
 */
export const EGG_HUNT = Object.freeze({
  id: 'egg_hunt',
  label: 'Egg Hunt',
  icon: 'egghunt_egg_5',
  source: 'source',
  window: 'all year',
  blurb: 'Pet an Egg Plant and now and then a chocolate egg drops. Collect all five kinds and the Egg Hunter Trophy takes them in exchange.',
  /** items/include/trants.js performPetting: the Egg Plant's petting package. */
  pet: Object.freeze({ trant: 'trant_egg', package: 'lgt_egg_plant_pet', table: 'egg_plant_pet' }),
  /** achievements/collection_egg_hunter.js and its reward. */
  badge: 'collection_egg_hunter',
  trophy: 'trophy_egghunt',
});

/* -------------------------------------------------------- calendar math */

/** Local calendar parts of a timestamp (the player's own date). */
function local(now) {
  const d = new Date(now);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

const dayIndex = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);

/** Whether a local date falls in [from, to] (inclusive month/day pairs, may wrap the year). */
function inWindow({ m, d }, from, to) {
  const v = m * 100 + d;
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export const REAL_WINDOWS = Object.freeze({
  zilloween: Object.freeze({ from: [10, 17], to: [11, 1] }),
  glitchmas: Object.freeze({ from: [12, 12], to: [1, 3] }),
});

/** Source isPiDay(): March 14 in UTC, or the 15th before noon UTC, or the 13th from noon UTC. */
export function isPiDay(now = Date.now()) {
  const date = new Date(now);
  if (date.getUTCMonth() + 1 !== 3) return false;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  return day === 14 || (day === 15 && hour < 12) || (day === 13 && hour >= 12);
}

/** Source isZilloween() calendar test on Dametime parts ({ month, monthDay }). */
export function isDametimeZilloween(parts) {
  return Boolean(parts && parts.month === 'Remember' && Number(parts.monthDay) >= 25);
}

/** Which real-world windows contain `now`, in priority order. */
export function calendarSeasons(now = Date.now()) {
  const t = local(now);
  const out = [];
  if (isPiDay(now)) out.push('pi_day');
  if (inWindow(t, REAL_WINDOWS.zilloween.from, REAL_WINDOWS.zilloween.to)) out.push('zilloween');
  if (inWindow(t, REAL_WINDOWS.glitchmas.from, REAL_WINDOWS.glitchmas.to)) out.push('glitchmas');
  return out;
}

/** Parse `?seasondate=YYYY-MM-DD` into a local-noon timestamp (or null). */
export function parseSeasonDate(text) {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime();
}

/**
 * Every event on right now: { ids, primary, via } where via is
 * 'override' | 'calendar' | 'dametime' | 'none'.
 * opts: { override: '' | 'none' | id, dametime: dametimeParts(now) }
 */
export function activeSeasons(now = Date.now(), opts = {}) {
  const override = String(opts.override || '').trim().toLowerCase();
  if (override === 'none' || override === 'off') return { ids: [], primary: null, via: 'override' };
  if (SEASONS[override]) return { ids: [override], primary: override, via: 'override' };
  const ids = calendarSeasons(now);
  let via = ids.length ? 'calendar' : 'none';
  if (!ids.includes('zilloween') && isDametimeZilloween(opts.dametime)) {
    ids.push('zilloween');
    if (via === 'none') via = 'dametime';
  }
  return { ids, primary: ids[0] || null, via };
}

/** A stable key for one occurrence of an event (resets yearly flags). */
export function seasonYearKey(id, now = Date.now()) {
  const t = local(now);
  // Glitchmas spans New Year: January belongs to the previous December's season.
  if (id === 'glitchmas' && t.m === 1) return `${id}:${t.y - 1}`;
  return `${id}:${t.y}`;
}

/* -------------------------------------------------------- shared state */

export function createSeasonState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {});
  const arr = (v) => (Array.isArray(v) ? [...v] : []);
  return {
    version: 1,
    daily: obj(s.daily), // { day, candy, pies, nog, pi, treats: {tsid: true} }
    carvedFaces: arr(s.carvedFaces).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5),
    placed: arr(s.placed).filter((r) => r && typeof r.cls === 'string' && typeof r.tsid === 'string'),
    pumpkinPhrases: obj(s.pumpkinPhrases), // pack lit pumpkins: { cls: [phrase] }
    giftees: arr(s.giftees).filter((g) => typeof g === 'string'),
    crackersOpened: Math.max(0, Math.floor(Number(s.crackersOpened) || 0)),
    cards: arr(s.cards).filter((c) => c && Number.isInteger(c.poem)),
    holidayQuest: obj(s.holidayQuest), // { [yearKey]: 'offered' | 'done' }
    yetiMail: arr(s.yetiMail).filter((k) => typeof k === 'string'),
    eggsFound: obj(s.eggsFound), // retired grass-egg hunt ({ [yearKey]: [tsid] }): kept so older saves round-trip
    piYears: arr(s.piYears).filter((y) => typeof y === 'string'),
    trophyGiven: s.trophyGiven === true, // the Egg Hunter Trophy exchange has run (planEggTrophy)
    lastActive: arr(s.lastActive).filter((id) => SEASONS[id]),
    stats: obj(s.stats),
  };
}

/** Today's counters (resets on a new Dametime day key). */
export function dailyRow(state, dayKey) {
  if (state.daily?.day !== dayKey) state.daily = { day: dayKey, candy: 0, pies: 0, nog: 0, pi: 0, treats: {} };
  state.daily.treats ||= {};
  return state.daily;
}

/* ------------------------------------------------------------ Zilloween */

export const PUMPKIN_FACES = Object.freeze([1, 2, 3, 4, 5]);
export const carvedClass = (face) => `pumpkin_carved_${face}`;
export const litClass = (face) => `pumpkin_lit_${face}`;
export const CARVED_CLASSES = Object.freeze(PUMPKIN_FACES.map(carvedClass));
export const LIT_CLASSES = Object.freeze(PUMPKIN_FACES.map(litClass));
export const PUMPKIN_CLASSES = Object.freeze([...CARVED_CLASSES, ...LIT_CLASSES]);
export const faceOf = (cls) => Number(String(cls).match(/^pumpkin_(?:carved|lit)_([1-5])$/)?.[1]) || 0;
export const isLitPumpkin = (cls) => LIT_CLASSES.includes(cls);

/** items/pumpkin.js carve: two 2-second steps (Pick, then Knife & Board), 15 energy, +10 mood, +5 iMG. */
export const CARVE = Object.freeze({
  stepMs: Object.freeze([2000, 2000]),
  energy: 15,
  mood: 10,
  xp: 5,
  outputs: Object.freeze([['pepitas', 5], ['jellisac_clump', 1]]),
});

/** carved_pumpkin_base light: a full (7-fly) Firefly Jar; -5 energy, +20 mood, +5 iMG; the jar empties. */
export const LIGHT = Object.freeze({ flies: 7, energy: 5, mood: 20, xp: 5 });

export const SOURCE_LINES = Object.freeze({
  carveOffSeason: 'You can only carve a pumpkin during Zilloween!',
  carveTools: 'You need a Pick (or Fancy Pick) and a Knife & Board to carve',
  carveEnergy: "You don't have enough energy to carve a pumpkin!",
  lightJar: 'You need a full Firefly Jar to light a Pumpkin',
  smashCarved: '"PUNKIN-SMASH! Oh! You got pepitas!"',
  smashLit: '"PUNKIN-SMASH! Oh! You got a pumpkin pie!"',
  rot: '"Gadzooks! All the fancy carved zilloween pumpkins rotted away! I guess some things really are seasonal after all. Still, you might want to check if there\'s anything left of them…"',
  placeOnly: 'A carved pumpkin can only be placed inside or near the entrance to your house, or in party spaces.',
  lament: 'You wished hard, and lamented the calendar, but Zilloween did not come, so you could not plant your seeds. At least you learnt something. You gain 2 iMG.',
  lamentTooltip: 'Close your eyes and wish hard for Zilloween to come again',
  plantOffSeason: 'This item is seasonal. It can only be grown during the appropriate holidays.',
  teachAsk: 'Want to teach me a new phrase?',
  teachMore: 'Teach me a new phrase or pick one for me to forget!',
  teachFull: "I can't learn anymore phrases. Pick one for me to forget!",
  forgot: 'Ok, forgot that one.',
  toothache: (lost) => `OW! TOOTHACHE! Stupid candy. Stupid, delicious, scrumptious, addictive candy. No more candy today. You lose ${lost} mood.`,
  noMoreCandy: "No more candy today. You don't want toothache again.",
  noMorePie: 'No more pie. You cannot possibly eat another slice.',
  candyEaten: "Hey! They're eating the candy! They like it! Yay!",
  crackerWait: 'You are waiting for somebody to help pull your Glitchmas Cracker.',
  crackerAway: 'You put your Glitchmas Cracker away.',
  crackerAlready: 'You are already pulling a Glitchmas Cracker!',
  crackerJoke: 'You got a joke from the Glitchmas Cracker. Happy Glitchmas!',
  nog: 'You nogged an egg. It was a creamy, but ultimately unsatisfying experience.',
  nogDone: "You've already nogged an Egg today.",
  unwrap: 'Oh how nice! They made you a present.',
  piStart: 'You start estimating Pi.',
  piDone: "That's as many digits as you can get.",
  piAlready: 'You have already estimated pi today.',
});

/**
 * Carve gate, in the source's order. ctx: { zilloween, carving, hasPick,
 * hasKnife, energy }.
 */
export function carveCheck(ctx = {}) {
  if (!ctx.zilloween) return { ok: false, msg: SOURCE_LINES.carveOffSeason };
  if (ctx.carving) return { ok: false, msg: 'You are already carving!' };
  if (!ctx.hasPick || !ctx.hasKnife) return { ok: false, msg: SOURCE_LINES.carveTools };
  if ((Number(ctx.energy) || 0) <= CARVE.energy) return { ok: false, msg: SOURCE_LINES.carveEnergy };
  return { ok: true };
}

/** onCarveComplete: a random face 1-5, 5 Pepitas and a Clump of Jellisac, one of nine lines. */
export function carveOutcome(rng = Math.random) {
  const face = Math.floor(5 * rng()) + 1;
  const growls = SEASON_DATA.carveGrowls;
  const growl = growls[Math.min(growls.length - 1, Math.floor(rng() * growls.length))];
  return {
    face,
    carved: carvedClass(face),
    outputs: [[carvedClass(face), 1], ...CARVE.outputs],
    growl,
    counter: `pumpkins_carved:number_${face}`,
    effects: { energy: -CARVE.energy, mood: CARVE.mood, xp: CARVE.xp },
  };
}

/** Pumpkin Carver: group_count over pumpkins_carved = all five faces. */
export function recordCarvedFace(state, face) {
  if (!state.carvedFaces.includes(face)) state.carvedFaces.push(face);
  state.carvedFaces.sort();
  return state.carvedFaces.length >= PUMPKIN_FACES.length;
}

export function lightCheck(jarFlies) {
  return (Number(jarFlies) || 0) >= LIGHT.flies ? { ok: true } : { ok: false, msg: SOURCE_LINES.lightJar };
}

/** Smash: carved gives 5 Pepitas, lit gives a Pumpkin Pie. Rot pays the same. */
export function smashOutcome(cls) {
  if (isLitPumpkin(cls)) return { items: [['pumpkin_pie', 1]], line: SOURCE_LINES.smashLit };
  if (CARVED_CLASSES.includes(cls)) return { items: [['pepitas', 5]], line: SOURCE_LINES.smashCarved };
  return null;
}

/**
 * carved_pumpkin_base drop: your own POL (home street or interior) or a party
 * space; the source also allowed within 300px of a house entrance, which is
 * the home street here.
 */
export function placeCheck(ctx = {}) {
  if (ctx.inHome || ctx.partySpace) return { ok: true };
  return { ok: false, msg: SOURCE_LINES.placeOnly };
}

/** lit_pumpkin_base teach: three phrases at most, 150 characters each. */
export function teachPhrase(phrases, text) {
  const list = Array.isArray(phrases) ? phrases : [];
  const value = String(text || '').trim().slice(0, 150);
  if (!value) return { ok: false, msg: '' };
  if (list.length >= 3) return { ok: false, msg: SOURCE_LINES.teachFull };
  list.push(value);
  return { ok: true, phrases: list, msg: `MWA-HA-HA! Now I've learned how to say "${value}"` };
}

/** onPlayerCollision: speak a learned phrase at most every 6 seconds, for 1.5 s + 30 ms a character. */
export const PUMPKIN_SPEECH = Object.freeze({ everyMs: 6000, baseMs: 1500, perCharMs: 30 });
export const speechMs = (text) => PUMPKIN_SPEECH.baseMs + String(text || '').length * PUMPKIN_SPEECH.perCharMs;

/**
 * Street Jack-O-Lanterns (designed). Source lit pumpkins only spoke phrases
 * their carver taught them; the street ones were never placed by Tiny Speck,
 * so they speak these lines (in the source's own MWA-HA-HA voice) and answer
 * "Trick or treat?" once a street a game day.
 */
export const STREET_LANTERN_LINES = Object.freeze([
  'MWA-HA-HA!',
  'Happy Zilloween! Zille is watching. Zille is always watching.',
  'Nice pack. Got any candy in it?',
  "I used to be a vegetable, you know. Now I'm a lifestyle.",
  'Somebody carved me with a Pick. A PICK. Who does that?',
  'Fireflies tickle.',
  "Don't stand too close. I'm told I smell of burny pumpkin.",
  'Trick or treat? No, wait, that is your line.',
]);

export const PUMPKIN_TREAT = Object.freeze({
  /** 3 in 4 visits give candy, weighted toward the cheap stuff. */
  treatChance: 0.75,
  candies: Object.freeze([['birch_candy', 0.5], ['corn_syrup_squares', 0.3], ['carobish_treats', 0.2]]),
  tricks: Object.freeze([
    { line: 'The Jack-O-Lantern blows out its fireflies and shouts BOO! You jump a foot. Two feet, maybe.', mood: -2 },
    { line: '"Trick!" The Jack-O-Lantern cackles and spits a pumpkin seed at you. It is weirdly delicious.', energy: 2 },
    { line: 'The Jack-O-Lantern whispers something about Rooks. You decide you did not hear it.', mood: -1 },
  ]),
  treatLines: Object.freeze([
    'The Jack-O-Lantern burps up a candy. "Treat! Now scram, I am haunting."',
    '"Treat it is," says the Jack-O-Lantern, and a candy rolls out of its mouth.',
    'A candy drops from the Jack-O-Lantern. It is only a little bit warm.',
  ]),
  already: 'The Jack-O-Lantern has nothing left for you today. "Come back tomorrow, candy-face."',
});

export function pumpkinTreat(state, tsid, dayKey, rng = Math.random) {
  const row = dailyRow(state, dayKey);
  if (row.treats[tsid]) return { ok: false, msg: PUMPKIN_TREAT.already };
  row.treats[tsid] = true;
  if (rng() < PUMPKIN_TREAT.treatChance) {
    let r = rng();
    let candy = PUMPKIN_TREAT.candies[0][0];
    for (const [id, w] of PUMPKIN_TREAT.candies) {
      if (r < w) { candy = id; break; }
      r -= w;
    }
    const line = PUMPKIN_TREAT.treatLines[Math.floor(rng() * PUMPKIN_TREAT.treatLines.length) % PUMPKIN_TREAT.treatLines.length];
    return { ok: true, kind: 'treat', candy, line };
  }
  const trick = PUMPKIN_TREAT.tricks[Math.floor(rng() * PUMPKIN_TREAT.tricks.length) % PUMPKIN_TREAT.tricks.length];
  return { ok: true, kind: 'trick', ...trick };
}

/* ---------------------------------------------------------------- candy */

export const CANDY_CLASSES = Object.freeze(['birch_candy', 'corn_syrup_squares', 'carobish_treats']);
export const CANDY_DAILY_MAX = 11;
export const PIE_DAILY_MAX = 5;
export const TOOTHACHE_MOOD = 10;

/** zilloween_candy specialConditions: eating stops after 11 in a game day. */
export function candyEatGate(state, dayKey) {
  return dailyRow(state, dayKey).candy >= CANDY_DAILY_MAX ? { ok: false, msg: SOURCE_LINES.noMoreCandy } : { ok: true };
}

/** pumpkin_pie specialConditions (pumpkin_pie.js 238-261): five pies a game day, then its line. */
export function pieEatGate(state, dayKey) {
  return dailyRow(state, dayKey).pies >= PIE_DAILY_MAX ? { ok: false, msg: SOURCE_LINES.noMorePie } : { ok: true };
}

/**
 * How many more one Eat may take today (Eat how many?, js/eat-many.js), or null for
 * other items. Candy: num_can_eat = 11 - candy_eaten today, msg.count cut to it, the
 * last one aches (items/birch_candy.js 134-141, 159-164; corn_syrup_squares.js and
 * carobish_treats.js the same). Pie: num_can_eat = 5 - pies_eaten today
 * (items/pumpkin_pie.js 100-109). Returns { kind, daily, eaten, left, toothacheMood? }.
 */
export function dailyEatLimit(state, dayKey, classTsid) {
  const row = dailyRow(state, dayKey);
  if (CANDY_CLASSES.includes(classTsid)) {
    return { kind: 'candy', daily: CANDY_DAILY_MAX, eaten: row.candy, left: Math.max(0, CANDY_DAILY_MAX - row.candy), toothacheMood: TOOTHACHE_MOOD };
  }
  if (classTsid === 'pumpkin_pie') {
    return { kind: 'pie', daily: PIE_DAILY_MAX, eaten: row.pies, left: Math.max(0, PIE_DAILY_MAX - row.pies) };
  }
  return null;
}

/**
 * One candy eaten (a batch calls this once per candy, in order). Returns
 * { total, toothache, rush: 'apply' | 'extend' | null, counter }.
 * Source: the eleventh candy aches and gives no Sugar Rush; a rush already
 * running is extended by one buff duration per candy.
 */
export function recordCandyEaten(state, dayKey, { zilloween = false, hasRush = false } = {}) {
  const row = dailyRow(state, dayKey);
  row.candy += 1;
  const toothache = row.candy >= CANDY_DAILY_MAX;
  const rush = toothache ? null : hasRush ? 'extend' : 'apply';
  return { total: row.candy, toothache, rush, counter: zilloween ? 'candy_eaten:zilloween' : null };
}

export const CANDY_GIVEN_BADGES = Object.freeze([
  [5, 'mini_tricksy_treater'],
  [37, 'minor_tricksy_treater'],
  [103, 'major_tricksy_treater'],
  [257, 'super_tricksy_treater'],
  [499, 'the_candyglitch'],
]);

/** zilloween_candy_given is a group_count: distinct candy-lovers given candy during Zilloween. */
export function recordCandyGiven(state, giftee) {
  const fresh = !state.giftees.includes(giftee);
  if (fresh) state.giftees.push(giftee);
  const distinct = state.giftees.length;
  return { fresh, distinct, badges: CANDY_GIVEN_BADGES.filter(([n]) => distinct >= n).map(([, id]) => id) };
}

/** zilloweenBoostCheck: the giver gets +20 mood when the candy is eaten within 30 seconds. */
export const TREATER_BOOST = Object.freeze({ mood: 20, windowMs: 30_000 });

/** Who can be given candy (solo stand-ins for the source's other players). */
export const CANDY_LOVERS = Object.freeze({
  npc_piggy: 'Piggy',
  npc_chicken: 'Chicken',
  npc_butterfly: 'Butterfly',
});
export const isCandyLover = (classId) => Boolean(CANDY_LOVERS[classId] || /^street_spirit/.test(String(classId || '')));

/* ------------------------------------------------------------ Glitchmas */

export const SEASONAL_STOCK = Object.freeze({
  glitchmas: Object.freeze({
    toys: Object.freeze([
      Object.freeze({ classTsid: 'glitchmas_cracker', label: 'Glitchmas Cracker', cost: 550 }),
      Object.freeze({ classTsid: 'glitchmas_card', label: 'Glitchmas Card', cost: 220 }),
    ]),
  }),
});
export const SEASONAL_ITEMS = Object.freeze(
  Object.fromEntries(Object.entries(SEASONAL_STOCK).flatMap(([season, stores]) =>
    Object.values(stores).flat().map((o) => [o.classTsid, season])))
);

/** Pop Idol is a counter on glitchmas_cracker:opened (13). */
export const CRACKER = Object.freeze({ helpRange: 260, table: 'glitchmas_cracker', counter: 'glitchmas_cracker:opened' });

/** crackerPull: randInt(0, 1) picks a joke or a fun fact for the helper. */
export function crackerNote(rng = Math.random) {
  if (rng() < 0.5) {
    const list = SEASON_DATA.crackerJokes;
    const j = list[Math.floor(rng() * list.length) % list.length];
    return { classTsid: 'glitchmas_cracker_joke', title: j.question, body: j.answer };
  }
  const list = SEASON_DATA.crackerFactoids;
  return { classTsid: 'glitchmas_cracker_factoid', title: 'Fun Fact', body: list[Math.floor(rng() * list.length) % list.length] };
}

/** egg_plain nog: once a game day during Glitchmas, +11 iMG. */
export const NOG = Object.freeze({ xp: 11 });
export function nogCheck(state, dayKey) {
  return dailyRow(state, dayKey).nog >= 1 ? { ok: false, msg: SOURCE_LINES.nogDone } : { ok: true };
}

export const randomPoem = (rng = Math.random) => Math.floor(rng() * SEASON_DATA.cardPoems.length) % SEASON_DATA.cardPoems.length;

/** Keep one card record per Glitchmas Card in the pack (new cards get a random poem). */
export function syncCards(state, count, rng = Math.random) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  while (state.cards.length < n) state.cards.push({ poem: randomPoem(rng), message: '', signed: false });
  if (state.cards.length > n) state.cards.length = n;
  return state.cards;
}

export const yetiQuote = (cls, rng = Math.random) => {
  const list = cls === 'limited_edition_imitation_grichmas_yeti' ? SEASON_DATA.imitationYetiQuotes : SEASON_DATA.yetiQuotes;
  return list[Math.floor(rng() * list.length) % list.length];
};
export const YETI_DOLLS = Object.freeze(['collectors_edition_2010_glitchmas_yeti', 'limited_edition_imitation_grichmas_yeti']);

/** "A Holiday Thing": say "yay" in local chat. */
export const saysYay = (text) => /\byay\b/i.test(String(text || ''));

/** The Yeti's cracker letter: once a Glitchmas, from December 24 (source: 2011-12-24 4pm). */
export function yetiMailDue(state, now = Date.now()) {
  const t = local(now);
  const key = seasonYearKey('glitchmas', now);
  if (state.yetiMail.includes(key)) return null;
  if (t.m === 12 && t.d >= 24) return key;
  if (t.m === 1 && t.d <= 3) return key;
  return null;
}

/* -------------------------------------------------------------- Egg Hunt */

export const EGG_CLASSES = Object.freeze([1, 2, 3, 4, 5].map((n) => `egghunt_egg_${n}`));

/**
 * The Egg Hunter Trophy, the source way (inc_achievements.js 392-420): once
 * collection_egg_hunter is unlocked, however the fifth egg arrived, one of
 * each egg is destroyed (items_destroy(label, 1), so a missing one is simply
 * skipped) and the trophy is given, once. Returns { take, trophy } or null.
 * countOf(classTsid) is the pack count.
 */
export function planEggTrophy(state, unlocked, countOf) {
  if (state?.trophyGiven || !(unlocked || []).includes(EGG_HUNT.badge)) return null;
  return { take: EGG_CLASSES.filter((cls) => (Number(countOf(cls)) || 0) > 0), trophy: EGG_HUNT.trophy };
}

/* ---------------------------------------------------------------- Pi Day */

export const PI_DIGITS = Object.freeze([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3]);

/**
 * pi.js estimateDigit, run to the end: digit i continues with chance
 * 1/max where max = 1 up to the sixth digit, then round(i/2). The first
 * estimate of a calendar year pays each digit as favor with Tii, later ones
 * as mood. Returns { digits: [...], favor, total }.
 */
export function estimatePi(rng = Math.random, { favor = true } = {}) {
  const digits = [];
  for (let i = 0; i < PI_DIGITS.length; i += 1) {
    const max = i > 5 ? Math.round(i / 2) : 1;
    const chance = 1 + Math.floor(rng() * max);
    if (chance !== 1) break;
    digits.push(PI_DIGITS[i]);
  }
  return { digits, favor, total: digits.reduce((a, b) => a + b, 0) };
}

/* ----------------------------------------------------------------- misc */

/** Days left in an event window (for the season chip), or null. */
export function daysLeft(id, now = Date.now()) {
  const t = local(now);
  const today = dayIndex(t.y, t.m, t.d);
  let end = null;
  if (id === 'zilloween') end = dayIndex(t.y, 11, 1);
  else if (id === 'glitchmas') end = t.m === 1 ? dayIndex(t.y, 1, 3) : dayIndex(t.y + 1, 1, 3);
  else if (id === 'pi_day') end = today;
  if (end == null) return null;
  const left = end - today;
  return left >= 0 && left < 60 ? left : null;
}

/* ------------------------------------------------------ supply reporting */

/**
 * Seasonal item paths for tools/job-obtainable.mjs: conversions (carving a
 * pumpkin needs the Knife & Board; the Pick is starter kit; the five eggs
 * become the Egg Hunter Trophy) and direct sources that only run while their
 * event is on, plus the Egg Plant's all-year chocolate eggs.
 */
export function seasonalConversions() {
  return [
    { inputs: ['pumpkin'], tool: 'knife_and_board', outputs: [...CARVED_CLASSES, 'pepitas', 'jellisac_clump'], source: 'season:zilloween_carve' },
    ...CARVED_CLASSES.map((cls) => ({ inputs: [cls], tool: null, outputs: ['pepitas'], source: 'season:zilloween_smash' })),
    ...CARVED_CLASSES.map((cls) => ({ inputs: [cls, 'firefly_jar'], tool: null, outputs: [litClass(faceOf(cls))], source: 'season:zilloween_light' })),
    ...LIT_CLASSES.map((cls) => ({ inputs: [cls], tool: null, outputs: ['pumpkin_pie'], source: 'season:zilloween_smash' })),
    { inputs: ['glitchmas_present'], tool: null, outputs: ['collectors_edition_2010_glitchmas_yeti'], source: 'season:glitchmas_unwrap' },
    { inputs: ['glitchmas_cracker'], tool: null, outputs: ['glitchmas_cracker_joke', 'glitchmas_cracker_factoid'], source: 'season:glitchmas_cracker' },
    // All five eggs complete collection_egg_hunter, which trades them for the trophy.
    { inputs: [...EGG_CLASSES], tool: null, outputs: [EGG_HUNT.trophy], source: `collection:${EGG_HUNT.badge}` },
  ];
}

export function seasonalSources() {
  return [
    ...CANDY_CLASSES.map((id) => [id, 'season:zilloween_lantern_treat']),
    ...Object.values(SEASONAL_STOCK).flatMap((stores) => Object.values(stores).flat().map((o) => [o.classTsid, 'season:vendor'])),
    ['glitchmas_present', 'season:glitchmas_quest'],
    // Not seasonal: petting an Egg Plant rolls egg_plant_pet all year.
    ...EGG_CLASSES.map((id) => [id, `drop:${EGG_HUNT.pet.table}`]),
  ];
}

