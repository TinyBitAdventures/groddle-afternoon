/**
 * Meditation Station (quests/meditativearts_meditation_station.js), pure rules.
 *
 * Source: "Visit the same street at least once every 6 game days and meditate
 * for 60 seconds. Do so on 11 game days." The shipped quest file only kept one
 * requirement (counter meditation_time, 60), which any minute of meditation
 * anywhere satisfies; the server never tracked the street or the days. The
 * remake runs the quest as written:
 *  - the first street you meditate on while the quest is active becomes your
 *    station;
 *  - a game day counts once you have meditated 60 seconds there that day
 *    (sessions add up);
 *  - more than 6 game days between counted days breaks the practice: the count
 *    starts again (the next meditation picks the station afresh);
 *  - 11 counted game days complete it (counter meditation_station_days).
 * Rewards stay source-exact (1,000 iMG, 500 currants, 50 energy, 100 Cosma
 * favor); the quest is repeatable ("keep finding new places to practice").
 */

export const STATION_QUEST = 'meditativearts_meditation_station';
export const STATION_COUNTER = 'meditation_station_days';
export const STATION_DAYS = 11;
export const STATION_MAX_GAP_DAYS = 6;
export const STATION_SECONDS = 60;

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cleanTsid = (v) => String(v || '').replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 64);

export function normalizeStationState(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const tsid = cleanTsid(src.tsid);
  return {
    tsid,
    label: tsid ? String(src.label || '').slice(0, 80) : '',
    days: tsid ? Math.min(STATION_DAYS, whole(src.days)) : 0,
    lastDay: tsid && src.lastDay != null && Number.isFinite(Number(src.lastDay)) ? Math.floor(Number(src.lastDay)) : null,
    today: src.today != null && Number.isFinite(Number(src.today)) ? Math.floor(Number(src.today)) : null,
    todaySeconds: whole(src.todaySeconds),
  };
}

/**
 * One finished meditation session. `day` is the game-day index (game-day.js
 * getGameDayStartMs / GAME_DAY_MS). Returns the next state plus what happened:
 * { state, counted, reset, wrongStreet, days, done }.
 */
export function recordStationSession(prev, { tsid, label = '', seconds = 0, day } = {}) {
  let s = normalizeStationState(prev);
  const at = cleanTsid(tsid);
  const d = Math.floor(Number(day));
  const out = { counted: false, reset: false, wrongStreet: false };
  if (!at || !Number.isFinite(d) || whole(seconds) <= 0) return { state: s, ...out, days: s.days, done: s.days >= STATION_DAYS };
  const lapsed = s.lastDay != null && d - s.lastDay > STATION_MAX_GAP_DAYS;
  if (s.tsid && lapsed) {
    // Practice broken: start again, wherever you are now.
    s = normalizeStationState({});
    out.reset = true;
  }
  if (s.tsid && s.tsid !== at) {
    return { state: s, ...out, wrongStreet: true, days: s.days, done: s.days >= STATION_DAYS };
  }
  if (!s.tsid) s = { ...s, tsid: at, label: String(label || at).slice(0, 80) };
  if (s.today !== d) s = { ...s, today: d, todaySeconds: 0 };
  s = { ...s, todaySeconds: s.todaySeconds + whole(seconds) };
  if (s.lastDay !== d && s.todaySeconds >= STATION_SECONDS && s.days < STATION_DAYS) {
    s = { ...s, days: s.days + 1, lastDay: d };
    out.counted = true;
  }
  return { state: s, ...out, days: s.days, done: s.days >= STATION_DAYS };
}

/** Short status for the activity feed. */
export function stationMessage(result) {
  const s = result.state;
  if (result.wrongStreet) return `Your meditation station is ${s.label || 'another street'}. Meditate there to keep up the practice.`;
  if (result.counted) {
    return result.done
      ? `That's ${STATION_DAYS} game days of practice at ${s.label}. Enlightenment awaits!`
      : `Meditation Station: day ${s.days} of ${STATION_DAYS} at ${s.label}. Come back within ${STATION_MAX_GAP_DAYS} game days.`;
  }
  if (result.reset) return `It has been more than ${STATION_MAX_GAP_DAYS} game days, so your practice starts over at ${s.label || 'this street'}.`;
  if (s.tsid && s.lastDay !== s.today && s.todaySeconds < STATION_SECONDS) {
    return `Meditation Station: ${s.todaySeconds} of ${STATION_SECONDS} seconds today at ${s.label}.`;
  }
  return '';
}
