/**
 * The word filter's one list (the remake's own addition, Austin 2026-11-02:
 * "include a list of bad words to exclude from chat and things like bag
 * renames"). The original Glitch had no swear filter in its server or client
 * code; nothing here comes from the source.
 *
 * This file is the only copy anyone edits. tools/build-word-filter.mjs writes
 * it, as JSON, into the realtime server (data/word-filter.json, go:embed) and
 * the site (data/word-filter.json), and its --check (enforced by
 * tests/word-filter.test.js) fails when either is stale. The matcher is
 * js/word-filter.js, with its twins in the server (wordfilter.go) and the site
 * (src/WordFilter.php); tests/fixtures/word-filter-vectors.json holds the
 * cases all three must agree on.
 *
 * How a word matches (see js/word-filter.js for the whole rule):
 *  - stems: the whole word is the stem plus one of `suffixes` ("fuck",
 *    "fucks", "fucking"), case ignored, any letter repeated ("fuuuck"),
 *    common swaps (0 o, 1 i or l, 3 e, 4 a, 5 s, 7 t, @ a, $ s, ! i, v u)
 *    and single . - _ * ' ` between letters spelled out ("f.u.c.k").
 *  - exact: the same, but the whole word only, with no suffix: short words
 *    whose suffixed forms are ordinary words ("spic" but never "spicy" or
 *    "spices").
 *  - inside: matched anywhere in a word ("motherfucker"), unless the whole
 *    word is an exception ("Scunthorpe").
 *  - exceptions: ordinary words a rule above would otherwise catch, compared
 *    after the swaps. Whole-word matching already leaves "assassin", "class",
 *    "cocktail" and "Hancock" alone; the ones listed are kept here so the
 *    rule can never start catching them.
 * Write every entry in lower case letters only.
 */
export const WORD_FILTER = Object.freeze({
  stems: Object.freeze([
    // profanity
    'arse', 'arsehole', 'ass', 'asshat', 'asshole', 'asswipe', 'bastard', 'biatch', 'bitch', 'bollock', 'bollocks',
    'bullshit', 'batshit', 'apeshit', 'chickenshit', 'cocksucker', 'cumshot', 'dickhead', 'dildo', 'dipshit',
    'douchebag', 'dumbass', 'fatass', 'fuk', 'fuq', 'horseshit', 'jackass', 'jizz', 'phuck', 'phuk', 'piss',
    'shit', 'shite', 'shitface', 'shithead', 'shithole', 'shitstorm', 'skank', 'slut', 'smartass', 'twat',
    'wank', 'wanker', 'whore', 'bellend',
    // slurs
    'beaner', 'faggot', 'nigga', 'nigger', 'raghead', 'retard', 'towelhead', 'tranny', 'wetback',
  ]),
  suffixes: Object.freeze(['', 's', 'es', 'ed', 'd', 'er', 'ers', 'ing', 'ings', 'in', 'y', 'ey', 'ie', 'ies', 'ier', 'iest', 'z']),
  exact: Object.freeze([
    'cock', 'cocks', 'cum', 'cums', 'dick', 'dicks', 'dyke', 'dykes', 'fag', 'fags', 'gook', 'gooks', 'kike', 'kikes',
    'paki', 'pakis', 'pussies', 'pussy', 'spic', 'spics', 'titties', 'titty', 'tits', 'trannies',
  ]),
  inside: Object.freeze(['cunt', 'fuck']),
  exceptions: Object.freeze([
    // the classic ones (whole-word matching passes them; kept so it always will)
    'assassin', 'bass', 'class', 'cockpit', 'cocktail', 'grass', 'hancock', 'hello', 'pass', 'scunthorpe', 'shell',
    'shiitake', 'shitake',
    // the game's own words: a street (Eglesgown Wanks, Groddle Meadow) and the Batterfly's "pissy mood"
    'pissy', 'wanks',
  ]),
});
