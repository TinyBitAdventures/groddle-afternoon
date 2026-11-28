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
 * - GiantView.as 255-459, the screen's choreography: the background fades
 *   in over 0.8 s (fade_in_secs); 0.4 s later the Giant's art, centred on
 *   the screen, grows from 0.2 to full size over 3 s (easeOutBack) while
 *   its alpha goes 0.2 to 1 (easeInSine); it holds 3 s, then slides over
 *   1.5 s (easeOutQuart) so the art and the text beside it (TEXT_OFFSET 20
 *   px right of the art) sit centred together; the text block stands 15 px
 *   above the middle and is revealed top to bottom by a mask growing to
 *   twice its height over 2 s; then "Click anywhere..." fades in (0.5 s)
 *   and the screen takes input.
 *
 * The label: online it is your name (pc.getLabel(), js/pc-label.js); solo
 * has no character name, so "friend", as the Butler's lines and quest copy
 * say it (#759).
 *
 * The art (#759): the Giant's video (giant_<name>_flv_overlay) was never
 * recovered, but players' snaps of this screen show what it showed: Tiny
 * Speck's own painting of the Giant, cut out of its panel, with a soft white
 * glow around it. That painting is in the CC0 tinyspeck/glitch-items
 * giants/Giants_All.ai; tools/giants/portraits.py cuts each one out
 * (giant-portraits/<giant>-cut.webp and -cut@2x.webp, SOURCE.txt beside
 * them); the glow is drawn here (a blurred white silhouette behind it).
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

/**
 * GiantView.as 255-459 timings in ms from the screen opening: the art grows
 * (delay .4 s after the fade-in, 3 s), holds 3 s, slides 1.5 s, then the
 * text mask runs 2 s and the screen takes input; the button fades in 0.5 s.
 */
export const GIANT_SCREEN_TIMES = Object.freeze({
  growAt: 1200,
  growMs: 3000,
  slideAt: 7200,
  slideMs: 1500,
  textAt: 8700,
  textMs: 2000,
  readyAt: 10700,
  okMs: 500,
});

/** The cut-out portraits' 1x sizes (giant-portraits/<giant>-cut.webp; the @2x file is twice), one scale for all eleven. */
export const GIANT_CUT = Object.freeze({
  alph: Object.freeze({ w: 215, h: 454 }),
  cosma: Object.freeze({ w: 226, h: 425 }),
  friendly: Object.freeze({ w: 236, h: 277 }),
  grendaline: Object.freeze({ w: 219, h: 444 }),
  humbaba: Object.freeze({ w: 241, h: 399 }),
  lem: Object.freeze({ w: 253, h: 355 }),
  mab: Object.freeze({ w: 227, h: 423 }),
  pot: Object.freeze({ w: 219, h: 363 }),
  spriggan: Object.freeze({ w: 235, h: 412 }),
  ti: Object.freeze({ w: 244, h: 313 }),
  zille: Object.freeze({ w: 258, h: 375 }),
});

/** The cut-out portrait for a config.giants id: { src, src2x, w, h } (1x px). */
export function giantCutArt(giant) {
  const size = GIANT_CUT[giant];
  if (!size) return null;
  return { src: `assets/sprites/giant-portraits/${giant}-cut.webp`, src2x: `assets/sprites/giant-portraits/${giant}-cut@2x.webp`, ...size };
}

/**
 * Where the screen puts things on a stage `w` x `h` CSS px (GiantView.as draw()
 * and onTweenComplete). The players' snaps (a 403 px tall game view) show
 * Humbaba's art about 250 px tall, 0.6 of the view, the title in about 30 px
 * type and the line in about 13 px; the remake scales that with the stage
 * (k: CSS px per 1x portrait px). `textW`/`textH` are the text block's size
 * at that k. Returns the art's size, its centre at the start (the middle of
 * the stage) and at the end, and the text block's top left; `stacked` when
 * the stage is too narrow for art and text side by side (a phone held
 * upright): then the text sits centred under the art.
 */
export const GIANT_LAYOUT = Object.freeze({ artOfHeight: 0.6, minArtH: 150, maxArtH: 460, refH: 399, gap: 20, raise: 15, edge: 16, titlePx: 48, linePx: 21, maxTextW: 350 });
export function giantScreenLayout(giant, { w = 0, h = 0, textW = 0, textH = 0, k: forcedK = 0 } = {}) {
  const art = GIANT_CUT[giant] || GIANT_CUT.humbaba;
  const L = GIANT_LAYOUT;
  const k = forcedK || giantScreenScale(giant, w, h);
  const artW = art.w * k;
  const artH = art.h * k;
  const gap = L.gap * k;
  const span = artW + gap + textW;
  const start = { x: w / 2, y: h / 2 };
  if (span <= w - 2 * L.edge) {
    const left = (w - span) / 2;
    return { k, artW, artH, stacked: false, start, end: { x: left + artW / 2, y: h / 2 }, text: { x: left + artW + gap, y: h / 2 - textH / 2 - L.raise * k } };
  }
  const total = artH + gap + textH;
  const top = Math.max(L.edge, (h - total) / 2);
  return { k, artW, artH, stacked: true, start, end: { x: w / 2, y: top + artH / 2 }, text: { x: (w - textW) / 2, y: top + artH + gap } };
}

/** k for a stage: the art 0.6 of the stage's height (Humbaba as the reference), and on a narrow stage no taller than leaves room for the text under it. */
export function giantScreenScale(giant, w = 0, h = 0) {
  const art = GIANT_CUT[giant] || GIANT_CUT.humbaba;
  const L = GIANT_LAYOUT;
  let k = Math.min(L.maxArtH, Math.max(L.minArtH, h * L.artOfHeight)) / L.refH;
  // Side by side needs the art, the gap and about 200 px of title; narrower than that stacks, so keep the art to half the height and most of the width.
  if (art.w * k + L.gap * k + 200 > w - 2 * L.edge) k = Math.min(k, (h * 0.5) / art.h, (w * 0.7) / art.w);
  return Math.max(0.2, k);
}

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

/** The tip body: "I love you too, " + the player's label (pc.getLabel(): your name online, "friend" solo). */
export function loveYouLine(label = LOVE_PLAYER_LABEL) {
  return `I love you too, ${String(label ?? '').trim() || LOVE_PLAYER_LABEL}`;
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
      art: giantCutArt(giant),
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
