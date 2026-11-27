/**
 * What the world calls you ({pc_label}, the player's name in Glitch: items/item.js 1054,
 * npc_bureaucrat.js 425 "Attention, <name>!"). Online it is your account name (#734,
 * realtime-feature playerChatName). Solo has no character name, so the speakers say "friend",
 * as A Summer's Day, the conversations and the Street Spirits always have.
 */
export const SOLO_PC_LABEL = 'friend';

/** {pc_label} for this engine: the name played under online, "friend" in solo. */
export function pcLabel(engine) {
  return String(engine?.query?.('playerChatName', engine) || '').trim() || SOLO_PC_LABEL;
}

/**
 * {pc_label} starting a sentence: Glitch put the player's name there, which starts with a capital
 * (npc_bureaucrat.js 425 "<b>"+label+"</b>! We will be with you..."), so solo's "friend" is "Friend".
 * A name played under online is kept as written.
 */
export function sentenceLabel(label) {
  return label === SOLO_PC_LABEL ? 'Friend' : label;
}
