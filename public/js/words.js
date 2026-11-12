/**
 * Shared count and article words for player text: "1 second" / "2 seconds", "a Bean" / "an
 * Egg Plant", "a Spicy Grog" / "3 Spicy Grogs". GSJS common.js pluralize; item.js formatStack
 * reads an item's own article (a or an) the same way.
 */

/** common.js pluralize: "1 minute", "3 minutes". */
export function pluralize(count, single, plural = `${single}s`) {
  return count === 1 ? `1 ${single}` : `${count} ${plural}`;
}

/** "a" or "an" before a word, by its first letter: "a Bean Tree", "an Egg Plant". */
export function withArticle(word) {
  const w = String(word ?? '');
  return `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
}

/** item.js formatStack: "a Cherry" for one, else "3 Cherries". */
export function countWords(count, single, plural = `${single}s`) {
  return count === 1 ? withArticle(single) : `${count} ${plural}`;
}
