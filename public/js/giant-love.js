/**
 * "I love you <Giant>" in local chat (G94): pure rules for the
 * shrine-hint feature (js/features/shrine-hint-feature.js), which listens to
 * the Local chat box and shows the Giant's screen.
 *
 * Sources:
 * - glitch-GameServerJS main.js 1702 doLocalChat trims the line
 *   (utils.trim); 1798-1824: when the lowercased line starts with
 *   "i love you", the Giant is everything after its 11th character,
 *   lowercased, with every non a-z character dropped ("tii" reads as
 *   "ti"); it must be one of config.giants (config_base.js 165-177). The
 *   closest shrine within 200 px (players/player.js 1152-1187
 *   findCloseStack: straight-line distance from the player to the item)
 *   must belong to that Giant (items/include/shrines.js 1160-1162
 *   get_giant). Then a giant_screen: tip_title "A Message:", tip_body
 *   "I love you too, " + the player's label, sound GONG_GIANTS,
 *   start_with_tip. No favor, no daily limit, no activity line; the chat
 *   line itself still goes out (it is sent before this check).
 * - glitch-client GiantView.as 174-294: with start_with_tip the screen
 *   reads "<Giant> says..." over the tip body (the "A Message:" title box
 *   only shows on the donation path), on the Giant's colour at 0.75
 *   alpha (Giants.as 11-66); BaseScreenView.as 76 plays the sound when the
 *   0.8 s fade-in ends; it waits for the text before "Click anywhere..."
 *   closes it.
 *
 * Remake: there are no player names, so the label is "friend", as the
 * Butler's lines and quest copy say it (js/quests.js, js/hi-signs.js). The
 * Giant's video (giant_<name>_flv_overlay) was never recovered; the screen
 * shows the Giant's CC0 emblem art instead.
 */

/** config_base.js 165-177 config.giants. */
export const LOVE_GIANTS = Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);

/** main.js 1806 findCloseStack(is_shrine, 200). */
export const LOVE_RADIUS = 200;

/** main.js 1817-1820. */
export const LOVE_TIP_TITLE = 'A Message:';
export const LOVE_SOUND = 'GONG_GIANTS';
export const LOVE_PLAYER_LABEL = 'friend';

/** GiantView.as DEFAULT_ALPHA, fade_in_secs (the sound plays as it ends, BaseScreenView.as 76). */
export const GIANT_SCREEN_ALPHA = 0.75;
export const GIANT_SCREEN_FADE_MS = 800;

/** Giants.as 11-66: label and bg_color, keyed by the client tsid (ti is "tii" there). */
export const GIANT_SCREEN = Object.freeze({
  alph: Object.freeze({ label: 'Alph', bg: '#455637' }),
  humbaba: Object.freeze({ label: 'Humbaba', bg: '#5f434a' }),
  cosma: Object.freeze({ label: 'Cosma', bg: '#3a475d' }),
  spriggan: Object.freeze({ label: 'Spriggan', bg: '#44241c' }),
  grendaline: Object.freeze({ label: 'Grendaline', bg: '#053634' }),
  zille: Object.freeze({ label: 'Zille', bg: '#4e3e18' }),
  mab: Object.freeze({ label: 'Mab', bg: '#4d5f43' }),
  tii: Object.freeze({ label: 'Tii', bg: '#2e3548' }),
  lem: Object.freeze({ label: 'Lem', bg: '#476d57' }),
  pot: Object.freeze({ label: 'Pot', bg: '#32606e' }),
  friendly: Object.freeze({ label: 'Friendly', bg: '#010b1c' }),
});

/**
 * The Giant a chat line declares love for (a config.giants id, so Tii is
 * "ti"), or null. `text` is the line as typed; it is trimmed like the server.
 */
export function loveYouGiant(text) {
  const lower = String(text ?? '').replace(/^\s+|\s+$/g, '').toLowerCase();
  if (lower.substr(0, 10) !== 'i love you') return null;
  let name = lower.substr(11).replace(/[^a-z]/g, '');
  if (name === 'tii') name = 'ti';
  return LOVE_GIANTS.includes(name) ? name : null;
}

/** The tip body: "I love you too, " + the player's label. */
export function loveYouLine(label = LOVE_PLAYER_LABEL) {
  return `I love you too, ${label}`;
}

/**
 * findCloseStack: the closest shrine ({ giant, x, y }) to (x, y) within
 * `radius`, or null. Ties keep the first (the source's strict <).
 */
export function closestShrine(shrines = [], x = 0, y = 0, radius = LOVE_RADIUS) {
  let best = null;
  let bestD = radius + 1;
  for (const s of shrines || []) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return bestD <= radius ? best : null;
}

/**
 * The whole check for one chat line. Returns { ok: true, giant, screen }
 * or { ok: false, reason } with reason 'not-love' (no "i love you" start
 * or no Giant named), 'no-shrine' (none within 200 px) or
 * 'wrong-shrine' (the closest one is another Giant's).
 */
export function giantLoveResponse(text, { shrines = [], x = 0, y = 0, label = LOVE_PLAYER_LABEL } = {}) {
  const giant = loveYouGiant(text);
  if (!giant) return { ok: false, reason: 'not-love', giant: null };
  const shrine = closestShrine(shrines, x, y);
  if (!shrine) return { ok: false, reason: 'no-shrine', giant };
  if (shrine.giant !== giant) return { ok: false, reason: 'wrong-shrine', giant, shrineGiant: shrine.giant };
  const tsid = giant === 'ti' ? 'tii' : giant;
  const info = GIANT_SCREEN[tsid];
  return {
    ok: true,
    giant,
    screen: {
      tsid,
      title: `${info.label} says...`,
      tipTitle: LOVE_TIP_TITLE,
      tipBody: loveYouLine(label),
      sound: LOVE_SOUND,
      startWithTip: true,
      bg: info.bg,
      alpha: GIANT_SCREEN_ALPHA,
    },
  };
}
