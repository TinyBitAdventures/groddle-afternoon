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
