/**
 * Ticket 69: how long a line stays up so it can be read.
 *
 * The original client's chat bubbles held 4 s plus 300 ms a word, at most 10 s
 * (AvaChatBubbleManager.as 18-20 and 51; LisChatBubbleManager.as 112, words as
 * msg.split(' ')). Its activity growls held a flat 4 s (GrowlQueue.as 29), but
 * the same line also went into the Local chat, which stayed on screen
 * (NCMsgHandler.as 1926-1952); here the notices and bubbles are what the player
 * sees, so both take the bubble rule as their shortest time.
 */

export const READ_MIN_MS = 4000;
export const READ_PER_WORD_MS = 300;
export const READ_MAX_MS = 10000;

/** Words in a line (markup removed): what the 300 ms a word counts. */
export function wordCount(text) {
  const plain = String(text ?? '').replace(/<[^>]+>/g, ' ').trim();
  return plain ? plain.split(/\s+/).length : 0;
}

/** The time a line needs: 4 s plus 300 ms a word, at most 10 s. */
export function readMs(text) {
  return Math.min(READ_MAX_MS, READ_MIN_MS + wordCount(text) * READ_PER_WORD_MS);
}

/** The caller's time, or the reading time when that is longer. */
export function holdMs(text, ms = 0) {
  return Math.max(readMs(text), Number(ms) || 0);
}

/**
 * G629: how long a speech bubble stays up.
 *
 * An inhabitant's line (an animal, a tree, a rock, a spirit, a vendor, an NPC) that the source
 * sent with its own time shows for that time exactly: the server's sendBubble(msg, duration)
 * (items/item.js 562-569) reached the client as bubble_duration and was used as given
 * (LisChatBubbleManager.as 97, 112: `ms = ms || ...`), so "Yum!" was up 3 s and "Mew!" 1 s.
 * `exact` marks such a time; it is never set on a player's chat bubble.
 *
 * Every other line keeps ticket 69's floor: the longer of the caller's time and the reading
 * time. A line with no time at all gets the client's own default, which is the reading time
 * (LisChatBubbleManager.as 112: Math.min(10000, 4000 + words * 300)).
 */
export function bubbleMs(text, ms = 0, exact = false) {
  const given = Number(ms) || 0;
  if (exact && given > 0) return given;
  return holdMs(text, given);
}
