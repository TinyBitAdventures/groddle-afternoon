/**
 * Playable Musicblocks, based on Tiny Speck's musicblock_base behavior.
 *
 * The original blocks are reusable collectibles: playing costs 2 energy,
 * grants 2 mood, and awards freshness XP depending on when that exact tune
 * was last heard. The tunes are Tiny Speck's CC0 recordings (sound-key catalog).
 */

import { addItem, countItem, ensureItem } from './inventory.js?v=catalog-unified-5';
import { GAME_DAY_MS } from './game-day.js';
import { moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';
import { SOUND_ALIASES, SOUND_FILES } from './sound-keys.js';

export const MUSICBLOCK_MONTH_MS = Math.round(30.5 * 24 * 60 * 60 * 1000);
export const MUSICBLOCK_REPLAY_MS = 4 * 60 * 60 * 1000;

/**
 * Every recovered Musicblock tune is a collectible item (GSJS items/musicblock_*.js).
 * Labels, descriptions, base costs, stack sizes and music_duration come from the
 * item files; the series match the collection_musicblocks_* trophies. The tune
 * itself is the class sound the source announces on play
 * (announce_sound(class_tsid.toUpperCase())), resolved through the sound-key
 * catalog. Musicblock T-1 (musicblock_trumpets) is left out: its tune was never
 * recovered.
 */
export const MUSICBLOCK_SERIES = Object.freeze({
  DG: Object.freeze({ id: 'DG', colour: 'green', badge: 'collection_musicblocks_dg', glow: 0x9ee4ac }),
  DR: Object.freeze({ id: 'DR', colour: 'red', badge: 'collection_musicblocks_dr', glow: 0xf5a5b5 }),
  DB: Object.freeze({ id: 'DB', colour: 'blue', badge: 'collection_musicblocks_db', glow: 0x9cc8f5 }),
  BB: Object.freeze({ id: 'BB', colour: 'brown', badge: 'collection_musicblocks_bb', glow: 0xe0bb8a }),
  XS: Object.freeze({ id: 'XS', colour: 'shiny', badge: 'collection_musicblocks_xs', glow: 0xbdf2f2 }),
});

function row(classTsid, label, collection, durationMs, baseCost, stackMax, desc) {
  const soundKey = classTsid.toUpperCase();
  return Object.freeze({
    classTsid,
    label,
    desc,
    durationMs,
    soundKey,
    audio: SOUND_FILES[soundKey] || SOUND_FILES[SOUND_ALIASES[soundKey]] || null,
    icon: `assets/sprites/icons/${classTsid}.png`,
    collection,
    glow: collection ? MUSICBLOCK_SERIES[collection].glow : 0xe6d29a,
    baseCost,
    stackMax,
    // musicblock_base play: SB-1's first hearing pays 1000 XP, every other tune 50.
    freshXp: classTsid === 'musicblock_sb_secret_01' ? 1000 : 50,
  });
}

export const MUSICBLOCK_CATALOG = Object.freeze({
  musicblock_d_green_01: row("musicblock_d_green_01", "Musicblock DG-1", "DG", 11000, 400, 5,
    "Hoe Magazine gave this musicblock 6.8 out of a possible 7 pointlets."),
  musicblock_d_green_02: row("musicblock_d_green_02", "Musicblock DG-2", "DG", 6000, 400, 5,
    "Dig those crazy pincer-snapping beats."),
  musicblock_d_green_03: row("musicblock_d_green_03", "Musicblock DG-3", "DG", 8000, 500, 5,
    "Some would ban this musicblock. Might not be a bad idea."),
  musicblock_d_green_04: row("musicblock_d_green_04", "Musicblock DG-4", "DG", 13000, 600, 5,
    "This one is like that song from that guy who did that other musicblock."),
  musicblock_d_green_05: row("musicblock_d_green_05", "Musicblock DG-5", "DG", 15000, 700, 5,
    "Rock out with your block out. This is the musicblock anthem that's taking Groddle Forest by storm."),
  musicblock_d_red_01: row("musicblock_d_red_01", "Musicblock DR-1", "DR", 10000, 400, 5,
    "Music to drink a Cloud 11 Smoothie by."),
  musicblock_d_red_02: row("musicblock_d_red_02", "Musicblock DR-2", "DR", 10000, 400, 5,
    "The bestselling theme song from 'A Pig Petter's Diary'."),
  musicblock_d_red_03: row("musicblock_d_red_03", "Musicblock DR-3", "DR", 9000, 500, 5,
    "Underpants have been known to become airborne at the sound of this musicblock. Watch your back."),
  musicblock_d_red_04: row("musicblock_d_red_04", "Musicblock DR-4", "DR", 9000, 600, 5,
    "The best ear-wormy racket-pop currants can buy."),
  musicblock_d_red_05: row("musicblock_d_red_05", "Musicblock DR-5", "DR", 14000, 700, 5,
    "This friendly little tune reaches into your brain and scratches your hypothalamus. Tickly."),
  musicblock_d_blue_01: row("musicblock_d_blue_01", "Musicblock DB-1", "DB", 15000, 400, 5,
    "Knees, prepare to be slapped. This musicblock takes no prisoners with its twangy goodness."),
  musicblock_d_blue_02: row("musicblock_d_blue_02", "Musicblock DB-2", "DB", 9000, 400, 5,
    "Like the songs that giants hum to themselves when they're feeling blue. Unless they ARE blue, in which case they don't sing this way at all."),
  musicblock_d_blue_03: row("musicblock_d_blue_03", "Musicblock DB-3", "DB", 13000, 500, 5,
    "Warning: May cause you to do the chicken boogie."),
  musicblock_d_blue_04: row("musicblock_d_blue_04", "Musicblock DB-4", "DB", 12000, 600, 5,
    "Feet everywhere will tap despite themselves when they hear this."),
  musicblock_d_blue_05: row("musicblock_d_blue_05", "Musicblock DB-5", "DB", 11000, 700, 5,
    "If you could amplify butterfly song, this is roughly what it would sound like."),
  musicblock_b_brown_01: row("musicblock_b_brown_01", "Musicblock BB-1", "BB", 8000, 400, 5,
    "The hit single off the best selling album \"Music For Batterflies\", inspired by the enchanting noises inside a batterfly's gastrointestinal tract."),
  musicblock_b_brown_02: row("musicblock_b_brown_02", "Musicblock BB-2", "BB", 8000, 400, 5,
    "Warning: excessive volume may cause eyeball jelly to vibrate (in a good way)."),
  musicblock_b_brown_03: row("musicblock_b_brown_03", "Musicblock BB-3", "BB", 8000, 500, 5,
    "Lie back, close your eyes, and let the music wash over you, like the a cool sea breeze on a hot Alakol day. Or the tongues of a thousand piggies."),
  musicblock_b_brown_04: row("musicblock_b_brown_04", "Musicblock BB-4", "BB", 8000, 600, 5,
    "Voted Head-bumpingest, Toe-tappingest, Ear-wormingest, Air-drummingest Music Block of the Year, every year, for three centuries running."),
  musicblock_b_brown_05: row("musicblock_b_brown_05", "Musicblock BB-5", "BB", 8000, 700, 5,
    "Like the noise of Tii's sleeping brain, creating whole new rhythmical logarithms of imagination, but in musical form."),
  musicblock_x_shiny_01: row("musicblock_x_shiny_01", "Musicblock XS-1", "XS", 5000, 400, 5,
    "This is sort of an experimental, free-form, jazzy, fusiony something-or-other. Heavy on the experimental."),
  musicblock_x_shiny_02: row("musicblock_x_shiny_02", "Musicblock XS-2", "XS", 8000, 400, 5,
    "It's a little-known fact that this snappy little ditty was the inspiration for the phrase 'snappy little ditty'."),
  musicblock_x_shiny_03: row("musicblock_x_shiny_03", "Musicblock XS-3", "XS", 5000, 500, 5,
    "This rare musicblock is a bootleg from a Lapulapu Cavern rave dance party."),
  musicblock_x_shiny_04: row("musicblock_x_shiny_04", "Musicblock XS-4", "XS", 6000, 600, 5,
    "Rare recording of classic Glitch-hop before it all went mainstream."),
  musicblock_x_shiny_05: row("musicblock_x_shiny_05", "Musicblock XS-5", "XS", 6000, 700, 5,
    "If you played a butterfly song backward, this is roughly what it would sound like. You can barely hear the demons."),
  musicblock_goodnight_groddle: row("musicblock_goodnight_groddle", "Musicblock GNG", null, 64000, 5000, 1,
    "Once upon a time, this was the song that sent the world into slumber."),
  musicblock_sb_secret_01: row("musicblock_sb_secret_01", "Musicblock SB-1", null, 35000, 10000, 1,
    "This is the rare original recording of the song the Giants were humming when they were imagining the world."),
});

/**
 * How the original client played a block (G102). musicblock_base play sends
 * announce_sound(CLASS_TSID, 0, 0, true): an exclusive play_sound. In the
 * client (SoundMaster.playSound / SoundManager, glitch-client) an exclusive sound:
 * - pauses the street music, fading it out over 1 s (ambientStop -> pauseMusic, fade 1);
 *   it is not ducked under the block;
 * - fades every other sound effect out over 0.5 s (stopAllSoundEffects(.5)), so a
 *   block already playing gives way to the new one instead of overlapping it;
 * - restarts from the top when the same block is played again mid-tune
 *   (SoundManager.playSound stops an exclusive sound that is still playing);
 * - plays at the SFX volume like any other effect (both sliders default to 0.6);
 * - runs to the end of the recording: music_duration only times the pc_overlay
 *   bubbles, nothing stops the sound;
 * - then lets the street music resume where it paused, fading in over 1 s
 *   (onSoundComplete -> ambientPlay -> resumeSound(..., AMBIENT_FADE_MS / 1000)).
 * Player footage agrees (research/audio-hunt/README.md, G102): no street music under
 * the tail of BB-2/BB-3, DR-3 or DG-5, and every well-matched block plays past
 * its music_duration (BB-3 to 14.5 s of 15.0 against 8 s).
 * gain sits the block level with the rest of the SFX board (bus 0.7).
 */
export const MUSICBLOCK_PLAYBACK = Object.freeze({
  gain: 0.72,
  streetMusicLevel: 0,
  streetFadeOutSec: 1,
  streetFadeInSec: 1,
  previousBlockFadeOutSec: 0.5,
});

/** Seconds of a block's recording to play: all of it (durationMs only times the overlays). */
export function musicblockPlaySeconds(def, bufferSeconds) {
  const whole = Number(bufferSeconds);
  if (Number.isFinite(whole) && whole > 0) return whole;
  return Math.max(0.5, (def?.durationMs || 0) / 1000);
}

/** Item catalog meta for one block (other modules that drop blocks register through this). */
export function musicblockItemMeta(classTsid) {
  const def = MUSICBLOCK_CATALOG[classTsid];
  if (!def) return null;
  return {
    label: def.label,
    namePlural: def.label,
    desc: def.desc,
    icon: def.icon,
    baseCost: def.baseCost,
    stackMax: def.stackMax,
    tags: ['musicblock', 'collectible', 'no_rube'],
  };
}

export function ensureMusicblockItems() {
  for (const classTsid of Object.keys(MUSICBLOCK_CATALOG)) ensureItem(classTsid, musicblockItemMeta(classTsid));
}

export function starterMusicblocks() {
  ensureMusicblockItems();
  return { musicblock_d_green_02: 1 };
}

export function isMusicblock(classTsid) {
  return Boolean(MUSICBLOCK_CATALOG[classTsid]);
}

export function getMusicblock(classTsid) {
  return MUSICBLOCK_CATALOG[classTsid] || null;
}

export function createMusicblockState(seed = {}) {
  const heardAt = {};
  for (const [classTsid, timestamp] of Object.entries(seed.heardAt || {})) {
    const n = Number(timestamp);
    if (MUSICBLOCK_CATALOG[classTsid] && Number.isFinite(n) && n >= 0) heardAt[classTsid] = n;
  }
  return {
    heardAt,
    plays: Math.max(0, Math.floor(Number(seed.plays) || 0)),
    lastPlayed: MUSICBLOCK_CATALOG[seed.lastPlayed] ? seed.lastPlayed : null,
    collectedStreets: Object.fromEntries(
      Object.entries(seed.collectedStreets || {}).filter(([, collected]) => collected === true)
    ),
  };
}

export function listMusicblockCollection(inv) {
  const rows = Object.values(MUSICBLOCK_CATALOG).map((def) => ({
    ...def,
    count: countItem(inv, def.classTsid),
    owned: countItem(inv, def.classTsid) > 0,
  }));
  return {
    rows,
    owned: rows.filter((row) => row.owned).length,
    total: rows.length,
    complete: rows.length > 0 && rows.every((row) => row.owned),
    missing: rows.filter((row) => !row.owned),
  };
}

/** Owned/total for one series (DG, DR, DB, BB, XS); null for SB-1 and GNG. */
export function musicblockSeriesProgress(inv, collection) {
  if (!collection || !MUSICBLOCK_SERIES[collection]) return null;
  const rows = Object.values(MUSICBLOCK_CATALOG).filter((def) => def.collection === collection);
  const owned = rows.filter((def) => countItem(inv, def.classTsid) > 0).length;
  return { collection, owned, total: rows.length, complete: owned === rows.length };
}

/** The pack popover line: the block's series progress, when it belongs to one. */
export function musicblockCollectionNote(inv, classTsid) {
  const def = getMusicblock(classTsid);
  if (!def) return '';
  const series = musicblockSeriesProgress(inv, def.collection);
  return series ? `${series.collection} series ${series.owned}/${series.total}` : '';
}

/**
 * Street spawns: locations/newbie_island.js and the greeting locations
 * (location.js:663) place one random block from the five series. SB-1 only
 * comes out of the soil (patches.js musicblocks_brown). GNG was Tiny Speck's
 * thank-you from the Special Item That Only Beta Testers Get, which the remake
 * does not have, so it turns up on a street once all 25 series tunes are owned.
 */
export const MUSICBLOCK_STREET_POOL = Object.freeze(
  Object.values(MUSICBLOCK_CATALOG).filter((def) => def.collection).map((def) => def.classTsid)
);
export const MUSICBLOCK_ENDGAME_DROP = 'musicblock_goodnight_groddle';

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One deterministic unowned block per uncollected street. */
export function planMusicblockDrop(state, inv, streetTsid) {
  if (!state || !streetTsid || state.collectedStreets?.[streetTsid]) return null;
  let missing = MUSICBLOCK_STREET_POOL.filter((classTsid) => countItem(inv, classTsid) < 1);
  if (!missing.length && countItem(inv, MUSICBLOCK_ENDGAME_DROP) < 1) missing = [MUSICBLOCK_ENDGAME_DROP];
  if (!missing.length) return null;
  return MUSICBLOCK_CATALOG[missing[stableHash(streetTsid) % missing.length]];
}

/** Pick up a world block and return collection progress. */
export function collectMusicblock(state, inv, classTsid, streetTsid) {
  const def = getMusicblock(classTsid);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!state || !inv) return { ok: false, reason: 'state' };
  const before = countItem(inv, classTsid);
  addItem(inv, classTsid, 1);
  if (!state.collectedStreets) state.collectedStreets = {};
  if (streetTsid) state.collectedStreets[streetTsid] = true;
  const collection = listMusicblockCollection(inv);
  const series = musicblockSeriesProgress(inv, def.collection);
  return {
    ok: true,
    reason: 'collected',
    def,
    newDiscovery: before < 1,
    collection,
    seriesOwned: series ? series.owned : 0,
    seriesTotal: series ? series.total : 0,
    seriesComplete: Boolean(series?.complete),
  };
}

function gameDayIndex(timestamp) {
  return Math.floor(Math.max(0, timestamp) / GAME_DAY_MS);
}

/**
 * Play one reusable block and apply the official metabolic/freshness rewards.
 * The item is deliberately not consumed.
 */
export function playMusicblock(state, pc, classTsid, now = Date.now()) {
  const def = getMusicblock(classTsid);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!state || !pc) return { ok: false, reason: 'state' };
  if ((pc.energy || 0) < 2) {
    return { ok: false, reason: 'energy', msg: 'You need 2 energy to play that tune.' };
  }

  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const previous = state.heardAt[classTsid];
  let xp = 0;
  let freshness = 'stale';
  let msg = 'Good stuff, but play it too much and it gets stale, you know?';

  if (previous == null) {
    xp = def.freshXp;
    freshness = 'fresh';
    msg = classTsid === 'musicblock_sb_secret_01'
      ? 'You feel the oneness with the Giants, harking back to the time the world was imagined.'
      : 'Totally fresh tunes! Rad!';
  } else if (at - previous >= MUSICBLOCK_MONTH_MS) {
    xp = 100;
    freshness = 'returning';
    msg = "Good tune! It's been a long time since you've heard that one.";
  } else if (at - previous >= MUSICBLOCK_REPLAY_MS) {
    const today = gameDayIndex(at);
    const heardToday = Object.values(state.heardAt).filter(
      (timestamp) => gameDayIndex(Number(timestamp)) === today
    ).length;
    xp = heardToday === 0 ? 10 : 5;
    freshness = heardToday === 0 ? 'daily-first' : 'daily-new';
    msg = heardToday === 0
      ? 'Ah, first dose of music for the day!'
      : "Haven't heard that one yet today!";
  }

  // musicblock_*.js play: stats_add_xp(xp, false) takes the mood bonus, before
  // the +2 mood and -2 energy.
  if (xp) xp = grantMoodXp(pc, xp);
  pc.energy = Math.max(0, (pc.energy || 0) - 2);
  const oldMood = pc.mood || 0;
  pc.mood = Math.min(moodMax(pc), oldMood + 2);
  state.heardAt[classTsid] = at;
  state.plays = (state.plays || 0) + 1;
  state.lastPlayed = classTsid;

  return {
    ok: true,
    reason: 'played',
    def,
    freshness,
    msg,
    effects: { energy: -2, mood: pc.mood - oldMood, xp },
  };
}
