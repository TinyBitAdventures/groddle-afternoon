/**
 * The Purple Journey (register row G150), as pure rules: Essence of
 * Purple's Imbibe, the countdown that follows, the Le Voyage Violet instance
 * (LNVV4OTMAUG2PQV, instance id `purple_journey`) and its two buffs.
 * js/features/purple-journey-feature.js plays them.
 *
 * Sources (GameServerJS, CC0):
 * - items/essence_of_purple.js verbs.imbibe: refused when dead, during the
 *   journey and while Purpled Out; the first sip sets pc.taken_purple and
 *   starts begin_purple_journey 15 s later; another sip before the journey
 *   starts is wasted ("Nope, nothing.").
 * - players/inc_special_locations.js:312-441 begin_purple_journey(stage):
 *   stages 0-4 are activity lines (and mood), 5-11 are vog lines over a
 *   purple haze with the surprise emote, stage 11 creates the instance two
 *   seconds later and stage 12 clears taken_purple. Stage 7 has no break, so
 *   it runs stage 8 too and two timer chains run from there (the second
 *   instance create finds the player already inside).
 * - items/purple_emperor.js (the instance's hidden controller): on entering,
 *   buffs_apply('purple_journey'), a Scion of Purple (purple_apparition) 3 s
 *   later and then every 12-17 s, five in all, and a quoin 6 s later and then
 *   every 10-20 s (5% big), placed by getRandomPosition; at 85 s "You are
 *   starting to feel a little less weird." and no more quoins.
 * - items/purple_apparition.js: fades in, speaks after 1 s (9 s bubble,
 *   3 s of talking), idles, fades out at 10.5 s and is gone at 12 s; what it
 *   says is getMysteriousWords: the HURRY UP line, one of 22 quotes, or a
 *   randomFact about your pack, the catalog, your house, your badges or the
 *   streets you have visited.
 * - items/catalog_buffs.js:2013-2033 purple_journey (90 s): on_remove exits
 *   the instance, applies purpled_out (120 s) and, 2 s later,
 *   achievements_increment('essence_of_purple', 'journeys_taken')
 *   (players/inc_achievements.js:104 achievements_increment_delayed), the
 *   counter of Elementary Penguin (3 journeys).
 * - items/purple_flower.js:316 canMunch: "No. Not even a little bit." while
 *   Purpled Out.
 * - items/quoin.js 'small random <type>' (2-6) and 'slow medium-large
 *   <type>' (25).
 */

export const ESSENCE = 'essence_of_purple';
export const JOURNEY_BUFF = 'purple_journey';
export const PURPLED_OUT_BUFF = 'purpled_out';
export const JOURNEY_COUNTER = 'essence_of_purple:journeys_taken';
/** Production TSID of the template (config.is_dev used LMF33RVTAUG2IU6). */
export const VOYAGE_TSID = 'LNVV4OTMAUG2PQV';
export const VOYAGE_LABEL = 'Le Voyage Violet';

export const PURPLE_TEXT = Object.freeze({
  verb: 'Imbibe',
  tooltip: 'Drink to see how deep the rabbit hole really goes',
  dead: "Nope, it's probably for abusing things like this that you wound up in hell in the first place.",
  journeying: "More? Are you insane? Wait, what if you are? What if this isn't the drugs? Maybe this is just your life now, forever.",
  purpledOut: "Ugh, you don't even want to look at this right now, much less drink it.",
  wasted: 'Nope, nothing.',
  sip: 'Hm… tastes strangely woody, and a little sour.',
  feelingBetter: 'You are starting to feel a little less weird.',
  noMunch: 'No. Not even a little bit.',
});

/** essence_of_purple verbs.imbibe conditions, in order. */
export function imbibeButton({ dead = false, journeying = false, purpledOut = false } = {}) {
  let reason = '';
  if (dead) reason = PURPLE_TEXT.dead;
  else if (journeying) reason = PURPLE_TEXT.journeying;
  else if (purpledOut) reason = PURPLE_TEXT.purpledOut;
  return { id: 'imbibe', label: PURPLE_TEXT.verb, tooltip: PURPLE_TEXT.tooltip, enabled: !reason, reason, primary: !reason };
}

/** verbs.imbibe handler: the sip (one essence either way). */
export function imbibe({ takenPurple = false } = {}) {
  return takenPurple
    ? { ok: true, started: false, message: PURPLE_TEXT.wasted }
    : { ok: true, started: true, message: PURPLE_TEXT.sip, delayMs: 15_000 };
}

/* ------------------------------------------------------------------ */
/* begin_purple_journey                                                 */
/* ------------------------------------------------------------------ */

const VOG = (uid, text, x, y, big = false) => Object.freeze({ uid, text, x, y, big });

/** One stage's own effects and timers (inc_special_locations.js:320-401). */
const STAGES = Object.freeze({
  0: { activity: 'Nothing seems to be happening. Maybe you got a bad batch of Essence of Purple?', next: [[1, 15_000]] },
  1: { activity: 'Maybe you just need to take more.', next: [[2, 15_000]] },
  2: { activity: "Oh, you're starting to feel relaxed and kind of tingly. Actually, it's fairly pleasant.", mood: 5, next: [[3, 7_500]] },
  3: { activity: "You realize you've been grinding your teeth a little. Hurry up, please; it's time.", mood: 10, next: [[4, 5_000]] },
  4: { activity: 'Your jaw hurts now. Your jaw hurts your hurts your your hurry up please it\'s its', next: [[5, 2_000]] },
  5: { vog: VOG('purple_1', 'HURRY UP PLEASE ITS TIME.', 20, 10), mood: -5, next: [[6, 1_000]] },
  6: { vog: VOG('purple_2', 'HURRY UP PLEASE ITS HURRY UP PLEASE ITS HURRY UP PLEASE ITS TIME', 50, 25), mood: -10, next: [[7, 1_000]] },
  // No break: case 7 falls into case 8, whose vog replaces this one before it shows.
  7: { vog: VOG('purple_3', 'HURRY UP PLEASE ITS TIME OH NO OH NO OH NO OH NO OH NO NO NO NO NO NO', 25, 60), next: [[8, 500]], fallsInto: 8 },
  8: { vog: VOG('purple_4', 'NO NO NO HURRY UP NO NO ITS NO NO HURRY UP PLEASE', 70, 80), next: [[9, 250]] },
  9: { vog: VOG('purple_5', 'HURRY HURRY HURRY HUR HURRY', 15, 80), next: [[10, 100]] },
  10: { vog: VOG('purple_6', 'ITS TIME ITS HURRY UP ITS OH NO', 70, 10), longHaze: true, next: [[11, 1_000]] },
  11: { vog: VOG('purple_7', 'HURRY UP PLEASE ITS TIME', 50, 50, true), enterAfter: 2_000, next: [[12, 1_500]] },
  12: { clearsTaken: true, next: [] },
});

/** vp_canvas purple_haze steps: #a020f0 at alpha .5, held .25 s (.75 s at stage 10), out over .5 s. */
export function hazeSteps(long = false) {
  return [
    { alpha: 0.5, secs: 0.5 },
    { alpha: 0.5, secs: long ? 0.75 : 0.25 },
    { alpha: 0, secs: 0.5 },
    { alpha: 0, secs: 1.75 },
  ];
}

/**
 * Run begin_purple_journey from stage 0 (15 s after the sip) and return
 * every effect in time order: { at (ms after stage 0), stage, activity?,
 * mood?, vog?, haze?, emote?, enter?, clearsTaken? }. `enter` marks the
 * instances_create_delayed calls (the first one takes you in).
 */
export function purpleTimeline() {
  const out = [];
  const queue = [[0, 0]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [at, stage] = queue.shift();
    let def = STAGES[stage];
    const timers = [...def.next];
    let mood = def.mood || 0;
    if (def.fallsInto != null) {
      const into = STAGES[def.fallsInto];
      timers.push(...into.next);
      mood += into.mood || 0;
      def = { ...def, vog: into.vog };
    }
    const row = { at, stage };
    if (def.activity) row.activity = def.activity;
    if (mood) row.mood = mood;
    if (def.vog) {
      row.vog = def.vog;
      row.haze = hazeSteps(Boolean(def.longHaze));
      row.emote = 'surprise';
    }
    if (def.clearsTaken) row.clearsTaken = true;
    out.push(row);
    if (def.enterAfter) out.push({ at: at + def.enterAfter, stage, enter: true });
    for (const [next, ms] of timers) queue.push([at + ms, next]);
  }
  return out.sort((a, b) => a.at - b.at || a.stage - b.stage);
}

/* ------------------------------------------------------------------ */
/* Le Voyage Violet                                                     */
/* ------------------------------------------------------------------ */

/**
 * The instance's geometry is lost (no street file, research/streets-hunt
 * `instance-template-no-geometry`); this is a rebuild from the Snaps: a wide
 * night meadow under a crescent moon, clotheslines of washing, mushrooms and
 * stumps, and a floor of jagged purple peaks. geo: x -1600..1600, y -1000..0;
 * the floor is at y -61 (the instances_create_delayed arrival point x 0,
 * y -61).
 */
export const VOYAGE_GEO = Object.freeze({ l: -1600, r: 1600, t: -1000, b: 0 });
export const VOYAGE_ARRIVAL = Object.freeze({ x: 0, y: -61 });

/** purple_emperor.js timers (ms). */
export const EMPEROR = Object.freeze({
  firstScionMs: 3_000,
  scionEveryMs: [12_000, 17_000],
  scions: 5,
  firstQuoinMs: 6_000,
  quoinEveryMs: [10_000, 20_000],
  bigQuoinChance: 0.05,
  finishMs: 85_000,
});

/** purple_apparition.js timers (ms after it is created). */
export const SCION = Object.freeze({ speakMs: 1_000, bubbleMs: 9_000, talkMs: 3_000, idleAfterTalkMs: 4_500, vanishMs: 10_500, dieMs: 12_000 });

/** getRandomPosition: around the player, inside the walls, between 100 and 500 px up. */
export function emperorPosition(player, geo = VOYAGE_GEO, rng = Math.random) {
  let x = -300 + rng() * 600 + (Number(player?.x) || 0);
  let y = -75 + rng() * 150 + (Number(player?.y) || 0);
  x = Math.min(geo.r - 100, Math.max(geo.l + 100, x));
  y = Math.max(geo.t + 500, Math.min(-100, y));
  return { x, y };
}

/** manifestQuoin: a small random quoin (2-6), or 5% of the time a slow medium-large one (25). */
export function emperorQuoin(rng = Math.random) {
  const big = rng() < EMPEROR.bigQuoinChance;
  const type = ['mood', 'energy', 'xp', 'currants'][Math.min(3, Math.floor(rng() * 4))];
  const amount = big ? 25 : 2 + Math.min(4, Math.floor(rng() * 5));
  return { type, amount, big };
}

/** The 22 quotes and their bubble widths (getMysteriousWords). The second quote's tab is five spaces. */
const TAB = '     ';
export const SCION_QUOTES = Object.freeze([
  'Tes yeux, où rien ne se révèle\nDe doux ni d’amer,\nSont deux bijoux froids où se mêle\nL’or avec le fer.',
  `A lost battalion of platonic conversationalists jumping\n${TAB}down the stoops off fire escapes off windowsills\n${TAB}off Empire State out of the moon.`,
  // The source's dash after "silence" is a comma here (no em-dashes in the game's copy).
  'Everything is dead, and the dead are everywhere.\nMen are alone, and all around them is silence—that is the earth!',
  'For forty years I have been listening to your words there through a crack under the floor. I have invented them myself. After all, there was nothing else I could invent.',
  'Le Prince d’Aquitaine à la tour abolie.\nThese fragments I have shored against my ruins.',
  `I'm with you in Rockland\n${TAB}where fifty more shocks will never return your\n${TAB}soul to its body again from its pilgrimage to a\n${TAB}cross in the void`,
  'This could be the start of a beautiful friendship.',
  '"I am withdrawing to write a book."\n"I am withdrawing to construct a labyrinth."\nEveryone imagined two works;\nto no one did it occur that the book and the labyrinth\nwere the same thing.',
  'Between the desire\nand the spasm\nBetween the potency\nand the existence\nBetween the essence\nand the descent\nFalls the Shadow',
  'This is the record of a box man. I am at this time beginning to write this record in my box. I am in a cardboard box that fits over my head and covers me completely to the hips.',
  '“Do you see the eye?” she asked me.\n“Well?”\n“It’s an egg,” she concluded in all simplicity.',
  'And the worms, they will climb\nthe crooked ladder of your spine—\nwe’re all mad here.',
  '“Yes, Lord,” she replied, grabbing a butcher’s knife from the kitchen.',
  '(i do not know what it is about you that closes\nand opens;only something in me understands\nthe voice of your eyes is deeper than all roses)\nnobody,not even the rain,has such small hands',
  'People with pure hearts can go to a whole new world.',
  'In the half light of dawn, in a cellar, I have cut the jugular vein of sacred bulls before the black stone. During a lunar year I have been declared invisible.',
  'The Zone wants to be respected. Otherwise, it will punish you.',
  'She has turned her face, more than once, to the Outer Radiance and simply seen nothing there. And so each time she has taken a little more of the Zero into herself.',
  'Once upon a time and a very good time it was there was a moocow coming down along the road and this moocow that was coming down along the road met a nicens little boy named baby tuckoo',
  'Silence glimmers in the empty hallways, on the radios no one listens to anymore. Silence is love just as your raspy voice is a bird.',
  'Every love story is a ghost story.',
  'The black wind howls. One among you will shortly perish.',
]);

export const HURRY = 'HURRY UP PLEASE ITS TIME.';

const randInt = (rng, a, b) => a + Math.min(b - a, Math.floor(rng() * (b - a + 1)));
const pick = (rng, list) => (list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : undefined);

/**
 * randomFact(type) from what the player has: ctx = {
 *   pack: [{ single, plural, count }], catalog: [{ plural }], house: [{ single, plural, count }],
 *   badges: [name], streets: [label] }
 * Returns '' when the fact needs something the player does not have (the
 * source then said "undefined"; the remake asks again).
 */
export function scionFact(type, ctx = {}, rng = Math.random) {
  const packItem = () => pick(rng, ctx.pack || []);
  const catalogPlural = (fallback) => pick(rng, ctx.catalog || [])?.plural || fallback;
  const houseItem = () => pick(rng, ctx.house || []);
  const badge = () => pick(rng, ctx.badges || []);
  const street = () => pick(rng, ctx.streets || []);
  const many = (it) => (Number(it?.count) || 0) > 1;
  const nameOf = (it) => (many(it) ? it.plural : it.single);
  switch (type) {
    case 0: {
      const it = packItem();
      if (!it) return '';
      return `Your ${nameOf(it)} ${many(it) ? 'love' : 'loves'} you very much, but can't find the words.`;
    }
    case 1:
      return `The ${catalogPlural('Magic Beans')} are waging an endless and bloody war against the ${catalogPlural('Flamingo Eyedrops')}.`;
    case 2:
      return `Beware the ${catalogPlural('Replica Canoes')}.`;
    case 3: {
      const it = houseItem();
      if (!it) return 'HURRY UP PLEASE ITS TIME';
      return `The ${nameOf(it)} in your home ${many(it) ? 'are' : 'is'} conspiring against you.`;
    }
    case 4: {
      const it = houseItem();
      if (!it) return 'HURRY UP PLEASE ITS TIME';
      return `The ${nameOf(it)} in your home ${many(it) ? 'feel' : 'feels'} neglected. Please hug ${many(it) ? 'them' : 'it'}.`;
    }
    case 5:
      return `The ${catalogPlural('Consumptive Raccoons')} are best of friends with the ${catalogPlural('Terrifying Knees')}.`;
    case 6: {
      const it = packItem();
      if (!it) return '';
      const is = many(it) ? 'are' : 'is';
      return `Your ${nameOf(it)} ${is} cursed. ${many(it) ? 'They' : 'It'} ${is} the source of all your problems.`;
    }
    case 7: {
      const it = packItem();
      if (!it) return '';
      return `You must become one with your ${nameOf(it)}.`;
    }
    case 8: {
      const b = badge();
      return b ? `Did you feel accomplished when you received the ${b} badge?` : '';
    }
    case 9: {
      const b = badge();
      return b ? `The ${b} badge is not what it seems.` : '';
    }
    case 10: {
      const b = badge();
      return b ? `The ${b} badge is grape-flavoured.` : '';
    }
    case 11: {
      const s = street();
      return s ? `Do you ever miss ${s}? You can go back there, but you can never really go back there.` : '';
    }
    case 12: {
      const s = street();
      return s ? `Return to ${s} to meet your destiny.` : '';
    }
    case 13: {
      const s = street();
      return s ? `I have hidden a secret in ${s}.` : '';
    }
    default:
      return '';
  }
}

/** getMysteriousWords: 1 in 5 the HURRY line, 2 in 5 a quote, 2 in 5 a fact. */
export function scionWords(ctx = {}, rng = Math.random) {
  const kind = randInt(rng, 0, 4);
  if (kind === 0) return { text: HURRY, kind: 'hurry' };
  if (kind <= 2) return { text: pick(rng, SCION_QUOTES), kind: 'quote' };
  for (let tries = 0; tries < 8; tries += 1) {
    const text = scionFact(randInt(rng, 0, 13), ctx, rng);
    if (text) return { text, kind: 'fact' };
  }
  return { text: HURRY, kind: 'hurry' };
}
