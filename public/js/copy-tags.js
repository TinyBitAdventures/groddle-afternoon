/**
 * A copy's own words on the way between players (2026-11-04): a Cubimal's name, a Draught of Giant
 * Amicability's Giant, a Still's hopper and Hooch, a lit pumpkin's phrases, a Teleportation Script's
 * destination. js/tools.js keeps them
 * beside each copy (row.tags, classes with `tag` naming the kind); online they ride with the copy as
 * "t" wherever its wear rides as "r" (gifts, trades, auctions, mail, shared ground drops).
 *
 * What one may hold, by kind. The same rules run three times, and each must give the same answer:
 * here (the game that receives a copy checks it again), the realtime server's copytags.go and the
 * site's src/CopyTags.php, both reading them from the tables the game builds
 * (tools/build-realtime-trade.mjs "tags", tools/build-economy.mjs "tags"):
 *  - name: the characters a Cubimal name keeps (npc_cubimal_chick.js onInputBoxResponse 41 keeps
 *    letters, digits and spaces; the word filter's grawlix symbols are kept too), then at most
 *    `max` of them, then the word filter, trimmed. ASCII only, so every language cuts it alike.
 *  - phrases: a list of at most `max` (lit_pumpkin_base teach: three phrases); each one line, no
 *    control characters or angle brackets, at most `len` characters (code points), the word filter,
 *    trimmed; empty ones dropped.
 *  - giant: one of the Giants a Draught can favour (potion_favor.js config.giants).
 *  - still: { hopper, hooch, workingSince } whole numbers, hopper at most `hopper` (the Hoocher
 *    cards' ceiling), hooch at most `hooch` (still.js max), workingSince a time no later than now.
 *  - script: a Teleportation Script's { tsid, x, y, label, hubId, hubName, imbued }
 *    (teleportation_script.js 298-319 destination, is_imbued): tsid and hubId letters, digits, _ and
 *    -, at most `id`; x and y whole numbers within `coord` (null when not known); label and hubName as
 *    one phrase of `len`; imbued true or false. No tsid is no words.
 * Anything else, or an empty result, is no words (null): the copy arrives with none, as before.
 */
import { SYMBOLS, filterText } from './word-filter.js?v=9a7a7ebb';

export const COPY_TAG_RULES = Object.freeze({
  name: Object.freeze({ max: 32 }),
  phrases: Object.freeze({ max: 3, len: 150 }),
  giant: Object.freeze({ giants: Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']) }),
  still: Object.freeze({ hopper: 600, hooch: 50 }),
  script: Object.freeze({ id: 32, len: 80, coord: 1000000 }),
});

/** Spaces off both ends (only the ASCII space: tabs and line breaks are spaces by then; other languages trim alike). */
const trimSpaces = (s) => s.replace(/^ +| +$/g, '');

const NAME_KEEP = new Set(`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ${SYMBOLS}`);

function cleanName(value, rules) {
  if (typeof value !== 'string') return null;
  let s = '';
  for (const c of value) if (NAME_KEEP.has(c)) s += c;
  const out = trimSpaces(filterText(s.slice(0, rules.max)));
  return out || null;
}

/** One phrase: one line, no control characters, angle brackets or U+FFFD, `len` code points at most. */
export function cleanPhrase(value, len) {
  if (typeof value !== 'string') return '';
  let s = '';
  for (const c of value) {
    const code = c.codePointAt(0);
    if (c === '<' || c === '>' || code === 0xfffd || (code >= 0xd800 && code <= 0xdfff)) continue;
    if (c === '\n' || c === '\r' || c === '\t') {
      s += ' ';
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code < 0xa0) || code === 0x2028 || code === 0x2029) continue;
    s += c;
  }
  return trimSpaces(filterText(Array.from(trimSpaces(s)).slice(0, len).join('')));
}

function cleanPhrases(value, rules) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const p of value.slice(0, rules.max)) {
    const s = cleanPhrase(p, rules.len);
    if (s) out.push(s);
  }
  return out.length ? out : null;
}

/** A JSON number as a whole number from 0 to max (anything else, a numeric string too, is 0). */
const whole = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);

function cleanStill(value, rules, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const hopper = whole(value.hopper, rules.hopper);
  const hooch = whole(value.hooch, rules.hooch);
  const workingSince = whole(value.workingSince, Math.floor(now));
  if (!hopper && !hooch && !workingSince) return null;
  return { hopper, hooch, workingSince };
}

const SCRIPT_ID = /^[A-Za-z0-9_-]+$/;

/** A JSON number as a whole number within max, toward zero (anything else, a numeric string too, is null). */
function coord(v, max) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(-max, Math.min(max, Math.trunc(v))) + 0;
}

function scriptId(v, max) {
  return typeof v === 'string' && v.length <= max && SCRIPT_ID.test(v) ? v : '';
}

function cleanScript(value, rules) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tsid = scriptId(value.tsid, rules.id);
  if (!tsid) return null;
  return {
    tsid,
    x: coord(value.x, rules.coord),
    y: coord(value.y, rules.coord),
    label: cleanPhrase(value.label, rules.len),
    hubId: scriptId(value.hubId, rules.id),
    hubName: cleanPhrase(value.hubName, rules.len),
    imbued: value.imbued === true,
  };
}

/** A copy's words of `kind`, as they may travel (null: none). `now` in ms. */
export function cleanCopyTagOf(kind, value, { now = Date.now(), rules = COPY_TAG_RULES } = {}) {
  if (value == null) return null;
  switch (kind) {
    case 'name': return cleanName(value, rules.name);
    case 'phrases': return cleanPhrases(value, rules.phrases);
    case 'giant': return typeof value === 'string' && rules.giant.giants.includes(value) ? value : null;
    case 'still': return cleanStill(value, rules.still, now);
    case 'script': return cleanScript(value, rules.script);
    default: return null;
  }
}
