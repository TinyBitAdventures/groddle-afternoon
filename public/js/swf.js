/**
 * The three SWFs and the Game they make (register row G190). Rules only; the
 * feature (js/features/swf-feature.js) drives them in the world.
 *
 * Source (glitch-GameServerJS, CC0):
 * - items/swf_1.js, swf_2.js, swf_3.js: three "SWF" items, stackmax 1, tags
 *   no_rube / collectible / swf / no_auction. Each has the same pack verb
 *   wrangle (swf_1.js 29-84, swf_3.js 29-65): no conditions, tooltip "Wrangle
 *   all the imagination out of this buggy sucker!", handler
 *   stats_add_xp(25 * msg.count, false) (the mood bonus applies), the line
 *   "Every last bit o' imagination has been drained out of that sucker!
 *   Optimization complete.", then apiDelete() and
 *   buildVerbMessage(count, 'wrangle', 'wrangled') (items/item.js 26-76:
 *   "You wrangled a SWF. ...").
 * - players/inc_items.js 650-666 (items_added): when an SWF lands in the pack
 *   and the other two are already there, apiSetTimer('createGlitchGame', 400).
 * - players/inc_items.js 728-805: createGlitchGame shows a locking 5 s
 *   vp_overlay (500 wide, top_y 15%, not click to advance) with "You've got
 *   multiple SWFs! That makes a Flash based MMO!" and drops swf_1 at your
 *   feet (takeable_drop); 400 ms later swf_2 goes on the ground at x + 40,
 *   400 ms later swf_3 at x + 80, 400 ms later createItemFromGround('game_box',
 *   1) puts a Game in the pack, and 400 ms later all three SWFs are deleted.
 *   If three more SWFs are still in the pack, it starts again.
 * - items/game_box.js: the Game (stackmax 1, tags no_discovery_dialog). Play
 *   (103-160): "Play the Game"; disabled with "You're already playing!" while
 *   you play any Game. It shows the play_glitch pc_overlay above the avatar
 *   (24,500 ms, not locking, delta_y -140, 110 x 110) and 24.5 s later
 *   onFinishPlayGame (177-200) pays stats_add_xp(250, false), says "You played
 *   a Game. Woah! How much fun was that!?!!" and deletes the Game. While it
 *   plays, Drop says "You can't drop this while you are playing it!" (77-101).
 */

export const SWF_CLASSES = Object.freeze(['swf_1', 'swf_2', 'swf_3']);
export const GAME_BOX = 'game_box';

export const isSwf = (classTsid) => SWF_CLASSES.includes(classTsid);

/** swf_1.js 29-84 (identical in swf_2.js and swf_3.js). */
export const WRANGLE = Object.freeze({
  id: 'wrangle',
  label: 'Wrangle',
  tooltip: 'Wrangle all the imagination out of this buggy sucker!',
  xpPerSwf: 25,
  line: "Every last bit o' imagination has been drained out of that sucker! Optimization complete.",
});

/** players/inc_items.js 650-805. */
export const GLITCH_GAME = Object.freeze({
  stepMs: 400,
  overlay: Object.freeze({
    text: "You've got multiple SWFs! That makes a Flash based MMO!",
    durationMs: 5000,
    locking: true,
    topY: '15%',
  }),
  /** Ground x offsets from where you stand: takeable_drop, then x + 40, x + 80. */
  dropOffsets: Object.freeze([0, 40, 80]),
});

/** items/game_box.js 103-200. */
export const PLAY = Object.freeze({
  id: 'play',
  label: 'Play',
  tooltip: 'Play the Game',
  durationMs: 24500,
  xp: 250,
  line: 'Woah! How much fun was that!?!!',
  alreadyPlaying: "You're already playing!",
  noDrop: "You can't drop this while you are playing it!",
});

/**
 * createGlitchGame and its four timers, as stages after the 400 ms the
 * items_added timer waits. Each stage runs `stepMs` after the one before it.
 */
export const GAME_STAGES = Object.freeze(['announce', 'drop2', 'drop3', 'create', 'finish']);

const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));

/** items_has for all three SWFs (players/inc_items.js 651-666). */
export function hasAllSwfs(inv) {
  return SWF_CLASSES.every((cls) => whole(inv?.[cls]) >= 1);
}

/**
 * items_added's trigger, read off the pack: an SWF count went up since the
 * last look and all three are now in the pack.
 * @param {Record<string, number>} before pack counts at the last look (null: none yet)
 * @param {Record<string, number>} after
 */
export function swfAddedWithSet(before, after) {
  if (!hasAllSwfs(after)) return false;
  return SWF_CLASSES.some((cls) => whole(after?.[cls]) > whole(before?.[cls]));
}

/** The three SWF counts, for the next look. */
export function swfCounts(inv) {
  return Object.fromEntries(SWF_CLASSES.map((cls) => [cls, whole(inv?.[cls])]));
}

/** items/item.js buildVerbMessage: "You <past> a SWF." or "You <past> 2 SWF." */
export function verbMessage(past, single, plural, count = 1, article = 'a') {
  const n = whole(count) || 1;
  return n > 1 ? `You ${past} ${n} ${plural}.` : `You ${past} ${article} ${single}.`;
}

/** The wrangle activity base line (the effects are added by the caller). */
export function wrangleMessage(count = 1) {
  return `${verbMessage('wrangled', 'SWF', 'SWF', count)} ${WRANGLE.line}`;
}

/** onFinishPlayGame's activity base line. */
export function playMessage() {
  return `${verbMessage('played', 'Game', 'Games', 1)} ${PLAY.line}`;
}

/** Where the three SWFs land: [x, x + 40, x + 80] clamped to the street. */
export function dropPoints(x, worldW = Infinity, margin = 24) {
  const max = Number.isFinite(worldW) ? Math.max(margin, worldW - margin) : Infinity;
  return GLITCH_GAME.dropOffsets.map((dx) => Math.min(max, Math.max(margin, Math.round(Number(x) || 0) + dx)));
}

/** Pack popover verbs for an SWF. */
export function swfVerbs(classTsid, inv) {
  if (!isSwf(classTsid) || whole(inv?.[classTsid]) < 1) return [];
  return [{ id: WRANGLE.id, label: WRANGLE.label, tooltip: WRANGLE.tooltip, enabled: true, reason: '' }];
}

/** Pack popover verbs for the Game. */
export function gameBoxVerbs(inv, playing) {
  if (whole(inv?.[GAME_BOX]) < 1) return [];
  return [{
    id: PLAY.id,
    label: PLAY.label,
    tooltip: PLAY.tooltip,
    enabled: !playing,
    reason: playing ? PLAY.alreadyPlaying : '',
    primary: true,
  }];
}

/** A saved slice, cleaned. */
export function normalizeSwfState(raw = {}) {
  const playUntil = Number(raw?.playUntil);
  const game = raw?.game && typeof raw.game === 'object' ? raw.game : null;
  return {
    version: 1,
    playUntil: Number.isFinite(playUntil) && playUntil > 0 ? playUntil : 0,
    games: whole(raw?.games),
    wrangled: whole(raw?.wrangled),
    played: whole(raw?.played),
    // A Glitch game cut off by a reload: { stage, created, drops: [{ id, tsid, classTsid }] }.
    game: game
      ? {
        stage: GAME_STAGES.includes(game.stage) ? game.stage : 'announce',
        created: game.created === true,
        drops: Array.isArray(game.drops)
          ? game.drops.filter((d) => d && typeof d.id === 'string' && typeof d.tsid === 'string' && isSwf(d.classTsid)).map((d) => ({ id: d.id, tsid: d.tsid, classTsid: d.classTsid }))
          : [],
      }
      : null,
  };
}
