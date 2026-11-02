/**
 * The word filter (the remake's own addition, Austin 2026-11-02; the original
 * Glitch had no swear filter in its server or client code). A bad word in
 * chat or in something a player names becomes a grawlix of the same length,
 * "fuck" -> "#!@$", the spaces and punctuation around it kept. The list is
 * js/word-filter-list.js. Twins with the same rule: the realtime server's
 * wordfilter.go and the site's src/WordFilter.php; all three pass
 * tests/fixtures/word-filter-vectors.json.
 *
 * The rule, written so the three agree byte for byte (only ASCII is ever
 * looked at; any other character is a word break, so UTF-8, UTF-16 and bytes
 * give the same answer):
 *  1. A piece is a run of ASCII letters, digits and @ $ !. A group is pieces
 *     joined by one of . - _ * ' ` each ("f.u.c.k", "it's").
 *  2. A group of two or more pieces, each at most JOIN_MAX characters long,
 *     is first tried as one word (the joiners left out: "f.u.c.k", "sh.it");
 *     otherwise, or if that is not bad, each piece is tried on its own (so
 *     "rec.until" is two words, never one).
 *  3. Leading and trailing ! are punctuation, not part of the word ("fuck!").
 *     A word needs more letters than digits ("455 currants", "45s").
 *  4. The word in lower case, with the swaps 0 o, 3 e, 4 a, 5 s, 7 t, @ a,
 *     $ s, ! i, v u, and 1 tried once as i and once as l. Any form that is an
 *     exception means the word is fine.
 *  5. Each form as runs of one letter ("fuuuck" is f1 u3 c1 k1). It is bad
 *     when the runs have the same letters as a stem plus suffix, or an exact
 *     word, each at least as long as there ("fuuuck" has the letters of
 *     "fuck"; "as" is not "ass", which needs two s), or when they contain an
 *     inside word that way.
 *  6. A bad word is replaced, from its first kept character to its last, by
 *     SYMBOLS from the start, as long as it was.
 * Not caught on purpose: letters spaced out with spaces ("f u c k"), since
 * joining across spaces would run "a" and "I" into the next word.
 */
import { WORD_FILTER } from './word-filter-list.js?v=20da9845';

/** The grawlix's symbols, taken in turn from the first. */
export const SYMBOLS = '#!@$%&*';

const JOINERS = ".-_*'`";
/** Rule 2: the longest piece a spelled-out word is joined from. */
const JOIN_MAX = 2;
const SWAPS = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', v: 'u' };

const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isWordChar = (c) => isLetter(c) || (c >= '0' && c <= '9') || c === '@' || c === '$' || c === '!';
const lower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Rule 4's forms of a word already in lower case. */
function forms(w) {
  const mapped = (one) => {
    let out = '';
    for (const c of w) out += c === '1' ? one : SWAPS[c] || c;
    return out;
  };
  return w.includes('1') ? [mapped('i'), mapped('l')] : [mapped('i')];
}

/** Rule 5's runs: [letters, counts]. */
function runs(w) {
  let letters = '';
  const counts = [];
  for (const c of w) {
    if (letters && letters[letters.length - 1] === c) counts[counts.length - 1] += 1;
    else {
      letters += c;
      counts.push(1);
    }
  }
  return [letters, counts];
}

function build(list) {
  const norm = (w) => forms(lower(w))[0];
  const whole = new Map();
  const add = (w) => {
    const [letters, counts] = runs(norm(w));
    if (!whole.has(letters)) whole.set(letters, []);
    whole.get(letters).push(counts);
  };
  for (const stem of list.stems) for (const suffix of list.suffixes) add(stem + suffix);
  for (const w of list.exact) add(w);
  return {
    whole,
    inside: list.inside.map((w) => runs(norm(w))),
    exceptions: new Set(list.exceptions.map(norm)),
  };
}

const RULES = build(WORD_FILTER);

const atLeast = (have, need, at = 0) => need.every((n, k) => have[at + k] >= n);

function badForm(f) {
  const [letters, counts] = runs(f);
  for (const need of RULES.whole.get(letters) || []) if (atLeast(counts, need)) return true;
  for (const [inLetters, inCounts] of RULES.inside) {
    for (let at = letters.indexOf(inLetters); at >= 0; at = letters.indexOf(inLetters, at + 1)) {
      if (atLeast(counts, inCounts, at)) return true;
    }
  }
  return false;
}

/** Rules 3-5 for one word (its ! already trimmed). */
export function isBadWord(word) {
  const w = String(word ?? '');
  let letters = 0;
  let digits = 0;
  for (const c of w) {
    if (isLetter(c)) letters += 1;
    else if (c >= '0' && c <= '9') digits += 1;
  }
  if (letters <= digits) return false;
  const fs = forms(lower(w));
  if (fs.some((f) => RULES.exceptions.has(f))) return false;
  return fs.some(badForm);
}

/** [start, end) of every bad word in s (rules 1-3), in order. */
export function badSpans(text) {
  const s = String(text ?? '');
  const spans = [];
  const n = s.length;
  const trimmed = (idx) => {
    let a = 0;
    let b = idx.length;
    while (a < b && s[idx[a]] === '!') a += 1;
    while (b > a && s[idx[b - 1]] === '!') b -= 1;
    if (a >= b) return null;
    const word = idx.slice(a, b).map((k) => s[k]).join('');
    return isBadWord(word) ? [idx[a], idx[b - 1] + 1] : null;
  };
  let i = 0;
  while (i < n) {
    if (!isWordChar(s[i])) {
      i += 1;
      continue;
    }
    const pieces = [];
    let j = i;
    for (;;) {
      const start = j;
      while (j < n && isWordChar(s[j])) j += 1;
      pieces.push([start, j]);
      if (j + 1 < n && JOINERS.includes(s[j]) && isWordChar(s[j + 1])) j += 1;
      else break;
    }
    const all = pieces.length > 1 && pieces.every(([a, b]) => b - a <= JOIN_MAX) ? trimmed(pieces.flatMap(([a, b]) => Array.from({ length: b - a }, (_, k) => a + k))) : null;
    if (all) spans.push(all);
    else {
      for (const [a, b] of pieces) {
        const one = trimmed(Array.from({ length: b - a }, (_, k) => a + k));
        if (one) spans.push(one);
      }
    }
    i = j;
  }
  return spans;
}

/** A grawlix n characters long. */
export function grawlix(n) {
  let out = '';
  for (let k = 0; k < n; k += 1) out += SYMBOLS[k % SYMBOLS.length];
  return out;
}

/** The text with every bad word turned into a grawlix; anything else as it was. */
export function filterText(text) {
  const s = String(text ?? '');
  const spans = badSpans(s);
  if (!spans.length) return s;
  let out = '';
  let at = 0;
  for (const [a, b] of spans) {
    out += s.slice(at, a) + grawlix(b - a);
    at = b;
  }
  return out + s.slice(at);
}

/** Whether the text has a bad word (a character name with one is refused, not filtered). */
export function hasBadWord(text) {
  return badSpans(text).length > 0;
}

/** The refusal for a character name with a bad word (js/account-forms.js, the site's PlayerAccount.php). */
export const NAME_REFUSED = 'Please pick a different name.';
