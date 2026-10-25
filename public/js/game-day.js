/**
 * Glitch Dametime and new-day boundaries.
 *
 * Ported from the official client TimeController.as / TimeModel.as and the
 * GameServerJS common.js calendar helpers. One game minute is 10 real seconds,
 * one game hour is 10 real minutes, and one game day is four real hours.
 */

import { saveStore } from './save-store.js?v=mp2-1';

export const SPEED_MULTIPLIER = 6;
export const GAME_EPOCH_MS = 1_238_562_000 * 1000;
export const GAME_MINUTE_MS = 10 * 1000;
export const GAME_HOUR_MS = 600 * 1000;
export const GAME_DAY_MS = 14_400 * 1000;
export const GAME_YEAR_MS = 4_435_200 * 1000;

export const DAY_NAMES = [
  'Hairday', 'Moonday', 'Twoday', 'Weddingday',
  'Theday', 'Fryday', 'Standday', 'Fabday',
];

export const MONTH_NAMES = [
  'Primuary', 'Spork', 'Bruise', 'Candy', 'Fever', 'Junuary',
  'Septa', 'Remember', 'Doom', 'Widdershins', 'Eleventy', 'Recurse',
];

export const MONTH_LENGTHS = [29, 3, 53, 17, 73, 19, 13, 37, 5, 47, 11, 1];

// Saved through the save interface (js/save-store.js): 'groddle_last_new_day_ts' and
// 'groddle_last_new_day_key' in solo, the same keys as always.
const STORAGE_KEY = 'lastNewDayTs';
const DAY_KEY_STORAGE_KEY = 'lastNewDayKey';

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function ordinal(day) {
  const n = Math.abs(Math.trunc(day));
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function calendarDayToMonthDay(dayOfYear) {
  let cumulative = 0;
  for (let i = 0; i < MONTH_LENGTHS.length; i++) {
    cumulative += MONTH_LENGTHS[i];
    if (cumulative > dayOfYear) {
      return {
        monthNumber: i + 1,
        monthDay: dayOfYear + 1 - (cumulative - MONTH_LENGTHS[i]),
      };
    }
  }
  return { monthNumber: 12, monthDay: 1 };
}

/**
 * Official calendar/time parts for a real Unix timestamp.
 * TimeController deliberately uses 307 days/year for weekday rotation even
 * though the irregular month table totals 308; preserve that client behavior.
 */
export function dametimeParts(now = Date.now()) {
  const elapsed = Number(now) - GAME_EPOCH_MS;
  const year = Math.floor(elapsed / GAME_YEAR_MS);
  const withinYear = elapsed - year * GAME_YEAR_MS;
  const dayOfYear = Math.floor(withinYear / GAME_DAY_MS);
  const withinDay = withinYear - dayOfYear * GAME_DAY_MS;
  const hour24 = Math.floor(withinDay / GAME_HOUR_MS);
  const minute = Math.floor((withinDay - hour24 * GAME_HOUR_MS) / GAME_MINUTE_MS) % 60;
  const { monthNumber, monthDay } = calendarDayToMonthDay(dayOfYear);
  const weekDay = DAY_NAMES[mod(dayOfYear + 307 * year, DAY_NAMES.length)];
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const time = `${hour12}:${String(minute).padStart(2, '0')}`;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  return {
    year,
    dayOfYear,
    monthNumber,
    monthDay,
    monthDayWithSuffix: ordinal(monthDay),
    month: MONTH_NAMES[monthNumber - 1],
    weekDay,
    hour24,
    minute,
    hour12,
    time,
    ampm,
    dayProgress: withinDay / GAME_DAY_MS,
    stringDayMonth: `${weekDay}, the ${ordinal(monthDay)} of ${MONTH_NAMES[monthNumber - 1]}`,
  };
}

export function formatDametime(now = Date.now()) {
  const p = dametimeParts(now);
  const when = p.hour24 === 0 && p.minute === 0
    ? 'midnight'
    : p.hour24 === 12 && p.minute === 0
      ? 'noon'
      : `${p.time} ${p.ampm.toLowerCase()}`;
  const date = p.monthNumber === 12
    ? p.month
    : `${p.monthDayWithSuffix} of ${p.month}, Year ${p.year}`;
  return `${when}, ${date}`;
}

export function getGameDayKey(now = Date.now()) {
  const p = dametimeParts(now);
  return `${p.year}-${String(p.monthNumber).padStart(2, '0')}-${String(p.monthDay).padStart(2, '0')}`;
}

export function getGameDayStartMs(now = Date.now()) {
  const p = dametimeParts(now);
  return GAME_EPOCH_MS + p.year * GAME_YEAR_MS + p.dayOfYear * GAME_DAY_MS;
}

/** Deterministic timestamp on the current game day, used by visual QA. */
export function timestampForGameHour(now, hour24, minute = 0) {
  const h = Math.max(0, Math.min(23, Math.floor(Number(hour24) || 0)));
  const m = Math.max(0, Math.min(59, Math.floor(Number(minute) || 0)));
  return getGameDayStartMs(now) + h * GAME_HOUR_MS + m * GAME_MINUTE_MS;
}

/**
 * Smooth world-light tint. The overlay affects only the street canvas, never
 * the HUD. Keyframes are intentionally restrained so CC0 street art remains
 * readable while dawn, dusk, and night are unmistakable.
 */
const LIGHT_KEYFRAMES = [
  { hour: 0, color: [18, 28, 68], opacity: 0.30 },
  { hour: 5, color: [18, 28, 68], opacity: 0.28 },
  { hour: 6.5, color: [244, 116, 76], opacity: 0.16 },
  { hour: 8, color: [255, 222, 150], opacity: 0.035 },
  { hour: 12, color: [255, 255, 255], opacity: 0 },
  { hour: 17, color: [255, 238, 180], opacity: 0.025 },
  { hour: 19.5, color: [139, 66, 112], opacity: 0.17 },
  { hour: 21, color: [24, 35, 80], opacity: 0.28 },
  { hour: 24, color: [18, 28, 68], opacity: 0.30 },
];

export function daylightState(now = Date.now()) {
  const p = dametimeParts(now);
  const hour = p.hour24 + p.minute / 60;
  let left = LIGHT_KEYFRAMES[0];
  let right = LIGHT_KEYFRAMES[LIGHT_KEYFRAMES.length - 1];
  for (let i = 1; i < LIGHT_KEYFRAMES.length; i++) {
    if (hour <= LIGHT_KEYFRAMES[i].hour) {
      left = LIGHT_KEYFRAMES[i - 1];
      right = LIGHT_KEYFRAMES[i];
      break;
    }
  }
  const span = Math.max(0.0001, right.hour - left.hour);
  const ratio = Math.max(0, Math.min(1, (hour - left.hour) / span));
  const color = left.color.map((channel, i) =>
    Math.round(channel + (right.color[i] - channel) * ratio)
  );
  const opacity = left.opacity + (right.opacity - left.opacity) * ratio;
  const phase = hour < 5 || hour >= 21
    ? 'night'
    : hour < 8
      ? 'dawn'
      : hour < 18
        ? 'day'
        : hour < 21
          ? 'dusk'
          : 'night';
  return { phase, hour, color, cssColor: `rgb(${color.join(' ')})`, opacity, parts: p };
}

export function getLastNewDayTs() {
  try {
    const value = Number(saveStore.get(STORAGE_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function getLastNewDayKey() {
  try {
    return saveStore.get(DAY_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** Seed/acknowledge the official game day containing `ts`. */
export function setLastNewDayTs(ts = Date.now()) {
  try {
    saveStore.set(STORAGE_KEY, String(ts));
    saveStore.set(DAY_KEY_STORAGE_KEY, getGameDayKey(ts));
  } catch {
    /* private mode */
  }
}

export function resetGameDayClock() {
  try {
    saveStore.remove(STORAGE_KEY);
    saveStore.remove(DAY_KEY_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Fire once when official Dametime crosses midnight. Existing timestamp-only
 * saves migrate by deriving their old game-day key.
 */
export function shouldFireNewDay(now = Date.now(), dayMs = GAME_DAY_MS) {
  if (dayMs !== GAME_DAY_MS) {
    const last = getLastNewDayTs();
    if (!last) {
      setLastNewDayTs(now);
      return false;
    }
    return now - last >= dayMs;
  }
  let lastKey = getLastNewDayKey();
  if (!lastKey) {
    const legacyTs = getLastNewDayTs();
    if (!legacyTs) {
      setLastNewDayTs(now);
      return false;
    }
    lastKey = getGameDayKey(legacyTs);
    try { saveStore.set(DAY_KEY_STORAGE_KEY, lastKey); } catch { /* private mode */ }
  }
  return lastKey !== getGameDayKey(now);
}

export function applyNewDayRefill(pc, caps = {}) {
  const eMax = caps.energyMax ?? Math.max(100, Number(pc.energyMax) || 100);
  const mMax = caps.moodMax ?? eMax;
  const energyBefore = pc.energy;
  const moodBefore = pc.mood;
  pc.energy = eMax;
  pc.mood = mMax;
  return {
    energyGained: Math.max(0, eMax - energyBefore),
    moodGained: Math.max(0, mMax - moodBefore),
    energyBefore,
    moodBefore,
  };
}

/** Original header label: “Moonday, the 5th of Spork”. */
export function formatGameDayLabel(now = Date.now()) {
  return dametimeParts(now).stringDayMonth;
}

/** Real milliseconds until the next official Dametime midnight. */
export function msUntilNewDay(now = Date.now(), dayMs = GAME_DAY_MS) {
  if (dayMs !== GAME_DAY_MS) {
    const last = getLastNewDayTs() || now;
    return Math.max(0, dayMs - (now - last));
  }
  const withinDay = mod(Number(now) - GAME_EPOCH_MS, GAME_DAY_MS);
  return withinDay === 0 ? GAME_DAY_MS : GAME_DAY_MS - withinDay;
}
