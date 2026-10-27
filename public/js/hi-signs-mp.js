/**
 * Hi signs between real players (register G327): the pure half of the
 * multiplayer hi, the leaderboard and the powders that spread. The realtime
 * server (groddle-afternoon-server hi.go) decides every sign, target,
 * infection, bonus, tally and record; js/features/hi-signs-feature.js and
 * js/features/powders-feature.js draw what it says and apply the mood and
 * badges to this player's own save.
 *
 * Source map (GameServerJS, Dec 2012; glitch-client):
 *  - players/inc_emotes.js doEmote (82-315) and the bonus (335-363), the
 *    missile hit (516-628); groups/hi_variants_tracker.js the day's tally.
 *  - HiLeaderboard.as (glitch-client view/ui): the clock dialog's "Hi sign
 *    leaderboard": your sign, the eleven signs by count (then name),
 *    yesterday's winner or top spreader; it polls every 60 s while open.
 *  - items/sneezing_powder.js 241-331, sparkle_powder.js 240-341,
 *    items/item.js 193-241 buildVerbEveryoneMessage, catalog_buffs.js
 *    2411-2445 (Sneezing), players/player.js 2632-2652 (sneeze).
 *
 * Solo never loads this file's rules into play: every caller checks
 * engine.mode === 'multiplayer' and the realtime client first.
 */

import { HI_VARIANTS, HI_VARIANT_NAMES, isHiVariant } from './hi-signs.js?v=hi-signs-4';

/** HiLeaderboard.as poll(): every 60 s while the panel is open. */
export const BOARD_POLL_MS = 60_000;

/** The Butler hi kinds hi.go takes in hi_say. */
export const BUTLER_TARGET = 'target';
export const BUTLER_INFECT = 'infect';

/** HiLeaderboard.as copy ("H" is the remake's Feat key, so only "5"). */
export const BOARD_TEXT = Object.freeze({
  title: 'Hi sign leaderboard',
  instruct: 'Press "5" to say hi!',
  more: 'Show more info',
  less: 'Show less info',
  desc: 'You can say a quick hi to people in Glitch by hitting the "5" key. Every game day in Glitch, you\'ll get a new "hi" sign. You can get one randomly assigned by saying hi before anyone says hi to you. If someone says hi to you first, you get their "hi" sign. The leaderboard below shows how many people have each sign today.',
  noneYet: "You don't have a daily hi sign yet!",
  noWinner: 'There was no winner yesterday!',
});

function intOr(v, d = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
}

function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60);
}

/** A board from the server: every sign, 0 when nobody has it (get_all_counts). */
export function normalizeBoard(board) {
  const b = board && typeof board === 'object' ? board : {};
  const out = {};
  for (const v of HI_VARIANTS) out[v] = Math.max(0, intOr(b[v]));
  return out;
}

/** Yesterday's winner ({ variant, count, top: { id, name, count, variant } | null }). */
export function normalizeWinner(w) {
  const s = w && typeof w === 'object' ? w : {};
  const top = s.top && typeof s.top === 'object' && intOr(s.top.id) > 0
    ? { id: intOr(s.top.id), name: cleanName(s.top.name), count: Math.max(0, intOr(s.top.count)), variant: isHiVariant(s.top.variant) ? s.top.variant : '' }
    : null;
  return { variant: isHiVariant(s.variant) ? s.variant : '', count: Math.max(0, intOr(s.count)), top };
}

/** hi_state: the day's signs as the server holds them. */
export function normalizeHiState(msg) {
  const m = msg && typeof msg === 'object' ? msg : {};
  return {
    day: intOr(m.day, -1),
    variant: isHiVariant(m.variant) ? m.variant : '',
    butler: isHiVariant(m.butler) ? m.butler : '',
    board: normalizeBoard(m.board),
    yesterday: normalizeWinner(m.yesterday),
    held: Math.max(0, intOr(m.held)),
  };
}

/** Achievement counter rows from the server ([["hi_variants:bats", 1], ...]), checked. */
export function counterRows(list) {
  const out = [];
  for (const row of Array.isArray(list) ? list : []) {
    if (!Array.isArray(row)) continue;
    const c = String(row[0] ?? '');
    const n = intOr(row[1]);
    if (/^[a-z_]{1,40}:[a-z0-9_]{1,40}$/.test(c) && n > 0 && n < 1000) out.push([c, n]);
  }
  return out;
}

/** Badge ids the server says were earned. */
export function grantIds(list) {
  return (Array.isArray(list) ? list : []).map(String).filter((id) => /^[a-z0-9_]{1,60}$/.test(id));
}

/** HiLeaderboard refresh(): by count, most first, then by sign. */
export function boardRows(board) {
  const b = normalizeBoard(board);
  return HI_VARIANTS.map((v) => ({ variant: v, name: HI_VARIANT_NAMES[v], count: b[v] }))
    .sort((x, y) => y.count - x.count || x.variant.localeCompare(y.variant));
}

/** HiLeaderboard: "Your daily hi sign: <name>" or none yet. */
export function yourSignLine(variant) {
  return isHiVariant(variant) ? `Your daily hi sign: ${HI_VARIANT_NAMES[variant]}` : BOARD_TEXT.noneYet;
}

/** HiLeaderboard: "Yesterday: Top spreader: <name> (<count> <variant>)", the winning sign, or no winner. */
export function yesterdayLine(winner) {
  const w = normalizeWinner(winner);
  if (!w.variant) return BOARD_TEXT.noWinner;
  if (w.top?.name) return `Yesterday: Top spreader: ${w.top.name} (${w.top.count} ${w.top.variant})`;
  return `Yesterday: ${HI_VARIANT_NAMES[w.variant]}`;
}

/** The record line everyone on the street reads (feature_report_hi_records: "<name>'s <msg>"). */
export function recordLine(name, msg) {
  return `${cleanName(name)}'s ${String(msg || '').replace(/<\/?b>/g, '')}`;
}

// ---------------------------------------------------------------------------
// Powders that spread
// ---------------------------------------------------------------------------

/** The two powders hi.go spreads. */
export const SPREAD_POWDERS = Object.freeze(new Set(['sneezing_powder', 'sparkle_powder']));

export const POWDER_MP = Object.freeze({
  /** sparkle_powder.js 288-299: +20 mood for everyone else. */
  SPARKLE_MOOD: 20,
  /** catalog_buffs.js 2433-2435 / player.js 2638-2645: the sneeze overlay above the sneezer. */
  SNEEZE_WH: 300,
  SNEEZE_DY: -110,
  SNEEZE_MS: 2000,
  /** player.js naughtySplanking(): 3 drops of 10 mood, 3.5 s apart. */
  SPLANK_DROPS: 3,
  SPLANK_MOOD: 10,
  SPLANK_MS: 3500,
});

export const POWDER_MP_TEXT = Object.freeze({
  /** sneezing_powder.js 255, sparkle_powder.js 254. */
  crowdSneeze: 'Really? Really?! Why be SUCH a jerk??',
  crowdSparkle: "There ain't enough sparkle in the jar for this many people.",
  /** Ours, when the server asks for a little patience. */
  slow: 'Slow down a little.',
  /** player.js 2651 sneeze(). */
  sneeze: 'Achoo!! Argh! Hate that.',
  /** catalog_buffs.js 2438 Sneezing on_remove. */
  lastSneeze: "With that last sneeze, you finally succeed in blowing out the bean that's been lodged in your nose for days. Relief! Now for the last time: stop sticking beans up there.",
  sparkle: "The air fills with energizing, moisturizing, tantalizing, romanticizing, surprising, her-prizing, revitalizing sparkle powder! It's good for what ails you, bewails you and assails you.",
});

/** What a player on the street reads when someone else's powder reaches them. */
export function powderCaughtLine(cls, name, granted = POWDER_MP.SPARKLE_MOOD) {
  const who = cleanName(name) || 'Someone';
  // sneezing_powder.js 323: pc.linkifyLabel()+" scattered a sneezing powder. How hilarious."
  if (cls === 'sneezing_powder') return `${who} scattered a sneezing powder. How hilarious.`;
  // buildVerbEveryoneMessage (item.js 193-241): "<label> sprinkled a Sparkle Powder. <flavor> You +20 Mood."
  if (cls === 'sparkle_powder') return `${who} sprinkled a Sparkle Powder. ${POWDER_MP_TEXT.sparkle}${granted > 0 ? ` You +${granted} Mood.` : ''}`;
  return '';
}

/** The refusal line for a powder the server would not spread. */
export function powderRefusedLine(cls, why) {
  if (why === 'crowd') return cls === 'sneezing_powder' ? POWDER_MP_TEXT.crowdSneeze : POWDER_MP_TEXT.crowdSparkle;
  return POWDER_MP_TEXT.slow;
}

/** The sound a refusal plays (HORRIBLE_SOUND before the splanking, CLICK_FAILURE for sparkle). */
export function powderRefusedSound(cls, why) {
  if (why !== 'crowd') return '';
  return cls === 'sneezing_powder' ? 'HORRIBLE_SOUND' : 'CLICK_FAILURE';
}
