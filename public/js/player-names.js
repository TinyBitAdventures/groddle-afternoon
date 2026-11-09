/**
 * The name shown for another player when the realtime server or the site sends
 * none (a missing or blank name). No fallback name survives in the original:
 * glitch-client and GSJS always had a pc.label. "Someone" is the word the
 * realtime server and the site already use for a player they cannot name
 * (groddle-afternoon-server boards.go, drops.go, party_persist.go; site
 * LedgerBoard.php). Our own copy never says the game's name (Austin's rule),
 * so the old fallback that named the game went (2026-11-09).
 */
export const UNNAMED_PLAYER = 'Someone';

/** A player's name as sent, or UNNAMED_PLAYER when it is missing or blank. */
export function playerNameOr(name) {
  const s = String(name ?? '').trim();
  return s || UNNAMED_PLAYER;
}
