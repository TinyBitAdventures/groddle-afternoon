/**
 * NAME COLOURS (#709): a player's name wears one colour in the chat panel and in their speech bubble.
 *
 * Glitch gave each speaker the next chat_element_others_N colour in the order they first spoke that
 * session (RightSideManager.as 803-822 getPCColorIndex) and used the same colour for the name in their
 * bubble (AvaChatBubbleManager.as 117-119); your own name was chat_element_you (0xaa322a).
 * Ours (Austin 2026-11-26, #709): one fixed colour per player, picked from their stable player id
 * (not their display name), so a name keeps its colour across days and devices. A line with no
 * player id (solo companions) is keyed by its name. The palette is Glitch's six chat colours as
 * recovered from a 2011 frame (style.css --c-classic-name-N, FROM FRAME), the green and the olive a
 * shade darker so all six read 4.5:1 on the cream panel: style.css --c-chat-name-N, which the chat
 * uses (data-name-colour="N" on the name); the bubbles, drawn on the canvas, use the numbers here.
 */

/** Glitch's chat name colours, each 4.5:1 or better on the cream panel (#fbf5ea): style.css --c-chat-name-0..5. */
export const NAME_PALETTE = Object.freeze([0x5c7827, 0x344b9f, 0x806e29, 0x55349f, 0x34739f, 0x6c5745]);

/** Your own name: Modern's violet (style.css --c-violet-49, --accent); Classic's chat_element_you (--c-classic-you). */
export const YOU_MODERN = 0x6b4c9e;
export const YOU_CLASSIC = 0xaa322a;

/** PURE: the key a player's colour hangs on: their id when they have one, else their name. */
export function nameColourKey(playerId, name = '') {
  const n = Number(playerId);
  if (Number.isFinite(n) && n > 0) return `id:${Math.floor(n)}`;
  const s = typeof playerId === 'string' ? playerId.trim() : '';
  if (s && s !== '0') return `id:${s}`;
  return `name:${String(name || '')}`;
}

/** PURE: the palette slot (0..n-1) for a key (FNV-1a with a final mix, so near ids land apart). */
export function nameColourSlot(key, n = NAME_PALETTE.length) {
  const s = String(key ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % Math.max(1, n);
}

/** PURE: a player's slot from their id (or name when they have none). */
export function playerNameSlot(playerId, name = '') {
  return nameColourSlot(nameColourKey(playerId, name));
}

/** PURE: the colour (a number, for the canvas) of a speaker's name; `mine` is you, in `classic` or Modern. */
export function playerNameColour(playerId, name = '', { mine = false, classic = false } = {}) {
  if (mine) return classic ? YOU_CLASSIC : YOU_MODERN;
  return NAME_PALETTE[playerNameSlot(playerId, name)];
}
