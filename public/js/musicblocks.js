/**
 * Playable Musicblocks, based on Tiny Speck's musicblock_base behavior.
 *
 * The original blocks are reusable collectibles: playing costs 2 energy,
 * grants 2 mood, and awards freshness XP depending on when that exact tune
 * was last heard. The recovered public-domain MP3s below are shipped locally.
 */

import { addItem, countItem, ensureItem } from './inventory.js?v=catalog-unified-3';
import { GAME_DAY_MS } from './game-day.js';

export const MUSICBLOCK_MONTH_MS = Math.round(30.5 * 24 * 60 * 60 * 1000);
export const MUSICBLOCK_REPLAY_MS = 4 * 60 * 60 * 1000;

export const MUSICBLOCK_CATALOG = {
  musicblock_d_green_02: {
    classTsid: 'musicblock_d_green_02',
    label: 'Musicblock DG-2',
    desc: 'Dig those crazy pincer-snapping beats.',
    durationMs: 6000,
    audio: 'assets/audio/ambient/Musicblock-DG-2_1291896713.mp3',
    collection: 'DG',
    baseCost: 400,
  },
  musicblock_d_green_03: {
    classTsid: 'musicblock_d_green_03',
    label: 'Musicblock DG-3',
    desc: 'Some would ban this musicblock. Might not be a bad idea.',
    durationMs: 8000,
    audio: 'assets/audio/ambient/Musicblock-DG-3_1291896740.mp3',
    collection: 'DG',
    baseCost: 500,
  },
  musicblock_d_red_01: {
    classTsid: 'musicblock_d_red_01',
    label: 'Musicblock DR-1',
    desc: 'Music to drink a Cloud 11 Smoothie by.',
    durationMs: 10000,
    audio: 'assets/audio/ambient/Musicblock-DR-1_1291896467.mp3',
    collection: 'DR',
    baseCost: 400,
  },
  musicblock_d_red_05: {
    classTsid: 'musicblock_d_red_05',
    label: 'Musicblock DR-5',
    desc: 'This friendly little tune reaches into your brain and scratches your hypothalamus. Tickly.',
    durationMs: 14000,
    audio: 'assets/audio/ambient/Musicblock-DR-5_1291896506.mp3',
    collection: 'DR',
    baseCost: 700,
  },
};

export function ensureMusicblockItems() {
  for (const def of Object.values(MUSICBLOCK_CATALOG)) {
    ensureItem(def.classTsid, { label: def.label, desc: def.desc });
  }
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
  const collection = listMusicblockCollection(inv);
  if (!collection.missing.length) return null;
  return collection.missing[stableHash(streetTsid) % collection.missing.length];
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
  const seriesRows = collection.rows.filter((row) => row.collection === def.collection);
  return {
    ok: true,
    reason: 'collected',
    def,
    newDiscovery: before < 1,
    collection,
    seriesOwned: seriesRows.filter((row) => row.owned).length,
    seriesTotal: seriesRows.length,
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
    xp = 50;
    freshness = 'fresh';
    msg = 'Totally fresh tunes! Rad!';
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

  pc.energy = Math.max(0, (pc.energy || 0) - 2);
  const oldMood = pc.mood || 0;
  pc.mood = Math.min(100, oldMood + 2);
  if (xp) {
    pc.xp = (pc.xp || 0) + xp;
    pc.imagination = (pc.imagination || 0) + xp;
  }
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
