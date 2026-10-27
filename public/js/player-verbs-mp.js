/**
 * What one player does to another in multiplayer (Track M, lane
 * VERBS): the rules and copy, pure (no DOM, no socket). The realtime server
 * (groddle-afternoon-server verbs.go) decides that an act happened: the
 * target is a real player on your street, online, within reach, neither of
 * you blocking the other. Each side's game then applies its own side once,
 * with the amounts here (the source's constants), never the doer's numbers.
 * The world side is features/player-verbs-mp-feature.js.
 *
 * - The player menu's emotes (main.js:3547-3580: every is_emote verb of the
 *   pack's items, for a player on your street): the Emotional Bear's Hug,
 *   High Five, Kiss (Lips upgrade) and Moon (Moon upgrade),
 *   items/emotional_bear.js 54-385, and the Plank's Splank, items/plank.js
 *   30-89.
 * - Pack verbs that ask whom (requires_target_pc): the Watering Can's Soak
 *   (watering_can.js 273-332) and a Musicblock's Play for (musicblock_*.js
 *   94-252).
 * - Charades (potion_charades.js 511-552, main.js 1766-1793).
 * - Epic Blowout's "under the influence" (locations/home.js:207).
 *
 * Solo never reads any of this.
 */

export const PLAYER_VERBS_SOURCE = 'items/emotional_bear.js, items/plank.js, items/watering_can.js, items/musicblock_*.js';

/** home.js:207: the buffs that count a guest under the influence. */
export const INFLUENCE_BUFFS = Object.freeze(['buff_buzzed', 'buff_smashed', 'purple_flower', 'no_no_powder']);

export const BEAR = 'emotional_bear';
export const PLANK = 'plank';
export const WATERING_CAN = 'watering_can';
export const CHARADES_POTION = 'potion_charades';
export const CHARADES_BUFF = 'charades';
export const GARLIC_BREATH = 'buff_garlic_breath';

/**
 * The verbs. item: the pack item that carries it; upgrade: the bear upgrade
 * it needs (hasUpgrade); energy: what it costs the doer; need: the doer
 * must have more energy than this (the source's `energy <= n` refusal);
 * overlay: the target's vp_overlay (state, ms, size); sort: sort_on.
 */
export const PLAYER_VERBS = Object.freeze({
  hug: Object.freeze({ id: 'hug', label: 'Hug', tooltip: 'Hug this player', item: BEAR, emote: true, sort: 51, energy: 5, need: 5, selfMood: 2, targetMood: 2, overlay: Object.freeze({ anim: 'hug', ms: 5000 }), sound: 'EMO_BEAR_HUG', counter: 'players_hugged', source: 'emotional_bear.js:54-128' }),
  high_five: Object.freeze({ id: 'high_five', label: 'High five', tooltip: 'High five this player', item: BEAR, emote: true, sort: 52, energy: 10, need: 10, selfMood: 0, targetMood: 10, overlay: Object.freeze({ anim: 'high-five', ms: 4000 }), sound: 'EMOTIONAL_BEAR_HIGH_5', counter: 'players_high_fived', source: 'emotional_bear.js:130-195' }),
  kiss: Object.freeze({ id: 'kiss', label: 'Kiss', tooltip: 'Kiss this player', item: BEAR, upgrade: 'kiss', emote: true, sort: 53, energy: 10, need: 10, selfMood: 0, targetMood: 10, overlay: Object.freeze({ anim: 'kiss', ms: 3000 }), sound: 'KISS_RECV', selfSound: 'KISS_SEND', counter: 'kissed', source: 'emotional_bear.js:197-315' }),
  moon: Object.freeze({ id: 'moon', label: 'Moon', tooltip: 'Moon this player', item: BEAR, upgrade: 'moon', emote: true, sort: 54, energy: 10, need: 10, selfMood: 0, targetMood: 10, overlay: Object.freeze({ anim: 'moon', ms: 6000 }), sound: '', counter: 'players_mooned', source: 'emotional_bear.js:317-385' }),
  splank: Object.freeze({ id: 'splank', label: 'Splank', tooltip: 'Smack someone', item: PLANK, emote: true, sort: 50, energy: 10, need: -1, selfMood: 0, targetMood: 0, overlay: Object.freeze({ anim: 'splank', ms: 10000 }), sound: 'SPLANK', counter: 'players_splanked', source: 'plank.js:30-89' }),
  soak: Object.freeze({ id: 'soak', label: 'Soak', tooltip: 'Soak others with water', item: WATERING_CAN, emote: false, sort: 57, energy: 5, need: -1, selfMood: 5, targetMood: -3, targetEnergy: 5, overlay: null, sound: '', counter: '', source: 'watering_can.js:273-332' }),
  play_for: Object.freeze({ id: 'play_for', label: 'Play for', tooltip: 'Let someone else listen', item: 'musicblock', emote: false, sort: 53, energy: 2, need: -1, selfMood: 0, targetMood: 2, overlay: null, sound: '', counter: 'musicblocks_played', source: 'musicblock_*.js:94-252' }),
});

export const EMOTE_IDS = Object.freeze(['splank', 'hug', 'high_five', 'kiss', 'moon']);

/** The player menu verb id for one of these (the feature's own prefix, so no other feature answers it). */
export const MENU_PREFIX = 'pverb_';

export const VERB_TEXT = Object.freeze({
  bearRace: "You're in a race! Save your emotional outbursts for later.", // emotional_bear.js:66
  plankRace: 'That would be unsportspersonlike of you.', // plank.js:44
  broken: (name) => `This ${name} has become broken, and must be repaired.`, // watering_can.js:289
  noEnergy: (verb, name) => `You tried to ${verb} ${name}, but you just don't have the energy.`, // emotional_bear.js:89, 158, 233, 344
  nobody: 'There is nobody here to do that to.', // ours
  pickTitle: (label) => `${label} whom?`,
  wait: 'Wait a moment.', // ours: one act at a time
  // The doer's activity (buildVerbMessage, and the bear's own lines).
  hugged: (name) => `You hugged ${name}. Energy -5, Mood +2`, // emotional_bear.js:112
  highFived: (name) => `You high fived ${name}. Energy -10`, // 182
  kissedGarlic: (name, energy, mood) => `You kissed ${name}. Hopefully they don't notice your garlic breath. ${energy} energy, +${mood} mood`, // 239, buildVerbMessage
  kissed: (name, energy) => `You kissed ${name}. ${energy} energy`, // 253
  mooned: (name) => `You mooned ${name}. Energy -10`, // 377
  splanked: (name) => `You splanked ${name}. Energy -10`, // plank.js:83-86
  soaked: (name) => `You soaked ${name}. Haha!`, // watering_can.js:316
  playedFor: (block, name) => `You played ${block} for ${name}. Energy -2`, // musicblock 247
  // The target's.
  gotHug: (name) => `${name} hugged you! Mood +2`, // 104
  gotHighFive: (name) => `${name} high fived you! Mood +10`, // 176
  gotKissGarlic: (name, mood, xp) => `${name} kisses you. Wooeee, that is stinky! ${mood} mood, +${xp} iMG`, // 241
  gotKiss: (name, mood) => `${name} kisses you. +${mood} mood`, // 250
  gotMoon: (name) => `${name} mooned you! Mood +10`, // 371
  gotSplank: (name) => `${name} splanked you!`, // plank.js:77
  gotSoak: (name) => `${name} dumps water all over you. You are soaked!`, // watering_can.js:313
  heard: (block, lines) => `You heard ${block}. ${lines.join(' ')}`, // musicblock 249
});

export const CHARADES_TEXT = Object.freeze({
  title: 'Charades!',
  inputLabel: "It's Charades! Choose a secret word for others to guess:", // potion_charades.js:543
  minChars: 4, // 547
  maxChars: 140, // 546
  secret: (word) => `The secret word is: "${word}"`, // 524
  everybody: 'Everybody in this location can play Charades to try and guess your secret word. Try to give them hints, but no cheating!', // 525
  ruined: 'You ruined it!', // main.js:1772
  timeout: "Time's up and nobody guessed your charade.", // catalog_buffs.js:417
  left: 'You left your own game of charades. I guess you were done playing.', // location.js:890
  guessed: (name) => `${name} guessed your secret word!`, // ours: the drinker's RAINBOW_YOUDIDIT came with no line
  tooShort: 'Choose a word of at least 4 characters.', // ours (input_min_chars 4)
});

/** potion_charades.js:520: the first 32 characters, a-z 0-9 space and dash, trimmed, lower case. */
export function cleanCharadesWord(value) {
  return String(value ?? '').slice(0, 32).replace(/[^a-z0-9 -]/gi, '').trim().toLowerCase();
}

/** Is this street a race (RACE_ / CROWNS_ instances), where emotes are off? */
export function isVerbRaceStreet(tsid) {
  return /^(RACE_|CROWNS_)/.test(String(tsid || ''));
}

/** Is anyone under the influence (home.js:207)? */
export function underTheInfluence(buffIds = []) {
  const ids = new Set(buffIds || []);
  return INFLUENCE_BUFFS.some((b) => ids.has(b));
}

/**
 * The player menu's emotes for another player (main.js:3555-3576): one per
 * verb whose item is in the pack, enabled unless the street is a race.
 * { inv: {class: count}, upgrades: ['kiss', 'moon'], race: bool }.
 */
export function emoteMenu({ inv = {}, upgrades = [], race = false } = {}) {
  const ups = new Set(upgrades || []);
  const out = [];
  for (const id of EMOTE_IDS) {
    const v = PLAYER_VERBS[id];
    if (!((Number(inv?.[v.item]) || 0) > 0)) continue;
    if (v.upgrade && !ups.has(v.upgrade)) continue; // conditions: state null without the upgrade
    const reason = race ? (v.item === PLANK ? VERB_TEXT.plankRace : VERB_TEXT.bearRace) : '';
    out.push({ id: MENU_PREFIX + id, verb: id, label: v.label, tooltip: v.tooltip, enabled: !reason, reason, durationMs: 0, sort: v.sort });
  }
  return out;
}

/**
 * The doer's own energy check (the source refuses at `energy <= need`;
 * a kiss with garlic breath needs only 5, emotional_bear.js 228-235).
 * Returns '' or the refusal.
 */
export function energyRefusal(verbId, { energy = 0, garlic = false, name = 'them' } = {}) {
  const v = PLAYER_VERBS[verbId];
  if (!v || v.need < 0) return '';
  const need = verbId === 'kiss' && garlic ? 5 : v.need;
  if ((Number(energy) || 0) > need) return '';
  const word = { hug: 'hug', high_five: 'high five', kiss: 'kiss', moon: 'moon' }[verbId] || verbId;
  return VERB_TEXT.noEnergy(word, name);
}

/**
 * What the doer's side of a confirmed act is: { energy (lost), mood (gained), text, sound }.
 * The caller spends and adds through metabolics (loseEnergy, gainMetabolic).
 */
export function doerSide(verbId, { name = 'them', garlic = false, blockLabel = '' } = {}) {
  const v = PLAYER_VERBS[verbId];
  if (!v) return null;
  switch (verbId) {
    case 'hug': return { energy: 5, mood: 2, text: VERB_TEXT.hugged(name) };
    case 'high_five': return { energy: 10, mood: 0, text: VERB_TEXT.highFived(name) };
    case 'kiss':
      return garlic
        ? { energy: 5, mood: 5, text: VERB_TEXT.kissedGarlic(name, -5, 5), sound: 'KISS_SEND', garlic: true }
        : { energy: 10, mood: 0, text: VERB_TEXT.kissed(name, -10), sound: 'KISS_SEND' };
    case 'moon': return { energy: 10, mood: 0, text: VERB_TEXT.mooned(name) };
    case 'splank': return { energy: 10, mood: 0, text: VERB_TEXT.splanked(name) };
    // watering_can.js 304-305: +5 mood, -5 energy for the soaker.
    case 'soak': return { energy: 5, mood: 5, text: VERB_TEXT.soaked(name) };
    // musicblock 228: -2 energy for the player.
    case 'play_for': return { energy: 2, mood: 0, text: VERB_TEXT.playedFor(blockLabel || 'a musicblock', name) };
    default: return null;
  }
}

/**
 * What the target's side is: { mood (signed), energy (signed), xp, text, sound, overlay }.
 * play_for's iMG comes from hearMusicblock, which needs the target's own heard map.
 */
export function targetSide(verbId, { from = 'Somebody', garlic = false } = {}) {
  const v = PLAYER_VERBS[verbId];
  if (!v) return null;
  switch (verbId) {
    case 'hug': return { mood: 2, energy: 0, xp: 0, text: VERB_TEXT.gotHug(from), sound: v.sound, overlay: v.overlay };
    case 'high_five': return { mood: 10, energy: 0, xp: 0, text: VERB_TEXT.gotHighFive(from), sound: v.sound, overlay: v.overlay };
    case 'kiss':
      return garlic
        ? { mood: -3, energy: 0, xp: 2, garlic: true, text: VERB_TEXT.gotKissGarlic(from, -3, 2), sound: v.sound, overlay: v.overlay }
        : { mood: 10, energy: 0, xp: 0, text: VERB_TEXT.gotKiss(from, 10), sound: v.sound, overlay: v.overlay };
    case 'moon': return { mood: 10, energy: 0, xp: 0, text: VERB_TEXT.gotMoon(from), sound: '', overlay: v.overlay };
    // plank.js:64: the target's +10 mood is commented out in the source.
    case 'splank': return { mood: 0, energy: 0, xp: 0, text: VERB_TEXT.gotSplank(from), sound: v.sound, overlay: v.overlay };
    // watering_can.js 310-311: -3 mood, +5 energy.
    case 'soak': return { mood: -3, energy: 5, xp: 0, text: VERB_TEXT.gotSoak(from), sound: '', overlay: null };
    case 'play_for': return { mood: 2, energy: 0, xp: 0, text: '', sound: '', overlay: null };
    default: return null;
  }
}

/**
 * The doer's counters for one confirmed act (achievements_increment(group, target)):
 * [{ counter }] with the label the target's id; and the quest counters the
 * source counts once per player (counters_get_label_count == 1, or the quest's
 * own per-target hash), as { quest, counter, label }.
 */
export function doerCounters(verbId, { to, garlic = false, block = '' } = {}) {
  const target = String(Math.floor(Number(to)) || '');
  if (!target) return { achievements: [], quests: [] };
  const a = [];
  const q = [];
  switch (verbId) {
    case 'hug':
      a.push(`players_hugged:${target}`);
      q.push({ quest: 'zero_mood', counter: 'players_hugged', label: target }); // emotional_bear.js 116-119 canHug
      break;
    case 'high_five': a.push(`players_high_fived:${target}`); break;
    case 'kiss':
      if (garlic) {
        a.push(`players_garlic_kissed:${target}`);
        q.push({ quest: 'spread_garlic_love', counter: 'players_garlic_kissed', label: target }); // 244-249
      }
      a.push(`kissed:${target}`);
      break;
    case 'moon':
      a.push(`players_mooned:${target}`);
      q.push({ quest: 'rising_moon', counter: 'players_mooned', label: target }); // 356-361
      break;
    case 'splank': a.push(`players_splanked:${target}`); break; // plank.js:69 (Hanky Splanky)
    case 'soak': q.push({ quest: 'watering_time', counter: 'players_soaked', label: target }); break; // watering_can.js 320-326
    case 'play_for':
      if (block) a.push(`musicblocks_played:${block}`); // musicblock 235
      // musicblock 239-242 canPlayFor: each player once in the quest; the block's flag.
      if (block) q.push({ quest: 'play_musicblocks', counter: `${block}_played`, label: target, perTarget: true });
      break;
    default: break;
  }
  return { achievements: a, quests: q };
}

/** The bear's Tottly's Toys feat: once per verb and player (emotional_bear.js 121-125 and the like). */
export const FEAT_VERBS = Object.freeze(new Set(['hug', 'high_five', 'kiss', 'moon']));
export const FEAT_ID = 'tottlys_toys';

const MONTH_MS = Math.round(30.5 * 24 * 60 * 60 * 1000);
const REPLAY_MS = 4 * 60 * 60 * 1000;

/**
 * A block another player played for you (musicblock 161-215, play_for):
 * the iMG your heard map earns (before the mood bonus), the lines, and
 * heardAt updated. dayOf(ts) is the game day index.
 */
export function hearMusicblock(heardAt, classTsid, { now = Date.now(), from = 'Somebody', dayOf = (t) => Math.floor(t / (4 * 60 * 60 * 1000)) } = {}) {
  const map = heardAt && typeof heardAt === 'object' ? heardAt : {};
  const prev = map[classTsid];
  const lines = [];
  let xp = 0;
  if (prev == null) {
    xp = 50;
    lines.push('Totally fresh tunes! Rad!', `It was generous of ${from} to share some new music!`);
  } else if (Number(prev) < now - MONTH_MS) {
    xp = 100;
    lines.push("Good tune! It's been a long time since you've heard that one.", `It was generous of ${from} to play it for you!`);
  } else if (Number(prev) < now - REPLAY_MS) {
    const today = dayOf(now);
    const heardToday = Object.values(map).filter((t) => dayOf(Number(t)) === today).length;
    xp = heardToday === 0 ? 10 : 5;
    lines.push(heardToday === 0 ? 'Ah, first dose of music for the day!' : "Haven't heard that one yet today!", `It was generous of ${from} to play it for you!`);
  } else {
    lines.push('Good stuff, but play it too much and it gets stale, you know?', `Still, it was generous of ${from} to share their tunes!`);
  }
  map[classTsid] = now;
  return { xp, lines };
}

/** The save slice: { feat: ['verb:target'], seen: [ids applied] } cleaned. */
export function normalizeVerbsSlice(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const feat = [...new Set((Array.isArray(s.feat) ? s.feat : []).map(String).filter((k) => /^[a-z_]{1,12}:\d{1,12}$/.test(k)))].slice(-400);
  return { feat };
}
