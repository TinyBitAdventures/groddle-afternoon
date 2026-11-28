/**
 * G892, G923: the thought bubble over another player at work (js/skill-bubbles.js;
 * players/inc_skill_packages.js 291-314 and 349-369; #460: players mining one rock together
 * saw only themselves at it).
 *
 * - Your timed verb (game.js beginVerbAction -> verbStarted) sends one word on the emote
 *   message, online only: an overlay package (pet, nibble, squeeze, milk, massage, harvest,
 *   scoop, revive) its overlay, a tool package (mine, dig, harvest peat, scrape, tend, clear,
 *   chop, water) the tool you work with, mirrored when the thing is on your left
 *   (inc_skill_packages.js 225-237). You see your own word bar or tool, as the actor did.
 * - A make with a tool (game.js runMakeCraft -> itemBubbleStarted) sends the tool for the
 *   whole batch (players/inc_making.js 465, 663); a batch longer than 99 s sends it again.
 * - G923 part C, the same way: a potion's bottle (js/potion-bottle-fx.js), a powder's shaker
 *   (powders-feature playShaker), a musicblock and a Tinkertool repair (game.js), a Wine of the
 *   Dead pour (homes-feature pourFx) ask itemBubbleStarted; a petrified rock's crack
 *   (artifacts-feature crackFx) asks overlayBubbleStarted; a Paper Tree's harvest is a timed verb.
 * - Your cancel (verbCancelled, itemBubbleStopped) sends sp_off_0, as Glitch dismissed the
 *   others' '-all' overlay (main.js 4971-4972).
 * - Another player's word arrives as the realtime client's 'overlay' event, and the bubble
 *   stands over that player's Glitch for those seconds (a new word replaces it).
 * Solo has nobody else to see it.
 *
 * QA: &skillbubbledemo=1 also draws the bubble over your own Glitch, as the others see
 * it (&skillbubblehold=<ms> freezes it there). Canvas data: skillBubbleSent (the last
 * word sent or shown), skillBubbles (bubbles drawn over others), skillBubbleShown (the
 * last one drawn over another player: <id>:<overlay or item>).
 */

import { actionDurationFor } from '../action-timing.js?v=283e65ce';
import {
  SKILL_BUBBLE_OFF,
  itemBubbleWord,
  parseSkillBubbleWord,
  playItemBubble,
  playSkillBubble,
  skillBubbleFor,
  skillBubbleWord,
  skillToolClass,
  skillToolFor,
} from '../skill-bubbles.js?v=e96957c2';

export const SKILL_BUBBLES_FEATURE_ID = 'skill-bubbles';

/** The longest a word can say; a longer run says it again as it runs out. */
const WORD_MAX_MS = 99_000;

/** Bubbles over other players (id -> handle), and the client listened to. */
const shown = new Map();
let watched = null;
let off = null;
let selfBubble = null;
/** Your bubble the others see: { word(ms), endsAt, nextAt, target } while it runs. */
let mine = null;

function drop(id) {
  shown.get(id)?.stop();
  shown.delete(id);
}

/** Another player's word (the client's 'overlay' event); other overlay words are not ours. */
export function onSkillBubble(engine, { id, e }) {
  const parsed = parseSkillBubbleWord(e);
  if (!parsed) return false;
  if (parsed.off) {
    const had = shown.has(id);
    drop(id);
    engine.setData?.('skillBubbles', String(shown.size));
    return had;
  }
  const root = () => engine.query?.('remoteAvatar', id);
  if (!root()) return false;
  drop(id);
  const at = () => { const r = root(); return r ? { x: r.x, y: r.y } : { x: 0, y: 0 }; };
  const alive = () => Boolean(root());
  const h = parsed.item
    ? playItemBubble(engine, parsed.item, at, { durationMs: parsed.durationMs, flipped: parsed.flipped, alive })
    : playSkillBubble(engine, parsed.key, at, { durationMs: parsed.durationMs, alive });
  shown.set(id, h);
  h.done?.then(() => { if (shown.get(id) === h) shown.delete(id); });
  engine.setData?.('skillBubbles', String(shown.size));
  engine.setData?.('skillBubbleShown', `${id}:${parsed.item || parsed.key}${parsed.flipped ? ':mirrored' : ''}`);
  return true;
}

function watch(engine) {
  const client = engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') : null;
  if (client === watched) return;
  off?.();
  off = null;
  for (const id of [...shown.keys()]) drop(id);
  watched = client;
  if (client?.on) off = client.on('overlay', (msg) => onSkillBubble(engine, msg));
}

function clientOf(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') : null;
}

function send(engine, word) {
  if (!word) return false;
  const ok = Boolean(clientOf(engine)?.emote?.(word));
  if (ok) engine.setData?.('skillBubbleSent', word);
  return ok;
}

/** QA &skillbubbledemo=1: the bubble over your own Glitch, as the others see it. */
function demo(engine, word, ms) {
  if (engine.param?.('skillbubbledemo') !== '1') return;
  const parsed = parseSkillBubbleWord(word);
  if (!parsed || parsed.off) return;
  selfBubble?.stop();
  const hold = engine.param?.('skillbubblehold');
  const at = () => ({ x: engine.player?.x || 0, y: engine.player?.y || 0 });
  const opts = { durationMs: hold ? 0 : ms, holdMs: hold ? Number(hold) || 0 : null };
  selfBubble = parsed.item
    ? playItemBubble(engine, parsed.item, at, { ...opts, flipped: parsed.flipped })
    : playSkillBubble(engine, parsed.key, at, opts);
  engine.setData?.('skillBubbleSent', word);
}

/**
 * Show the others `wordFor(ms)` for `ms`: sent now, and again each time a 99 s word runs out
 * while the run goes on (onTick). `target` ties it to a timed verb for verbCancelled.
 */
function start(engine, wordFor, ms, target = null) {
  const now = Date.now();
  const word = wordFor(Math.min(ms, WORD_MAX_MS));
  if (!word) return false;
  mine = { wordFor, endsAt: now + ms, nextAt: now + WORD_MAX_MS, target };
  send(engine, word);
  demo(engine, word, ms);
  return true;
}

function stop(engine, target = undefined) {
  if (!mine || (target !== undefined && mine.target !== target)) return;
  const live = Date.now() < mine.endsAt;
  mine = null;
  selfBubble?.stop();
  selfBubble = null;
  if (live) send(engine, SKILL_BUBBLE_OFF);
}

/** The word a timed verb shows the others, as a function of its milliseconds, or null. */
function verbWord(target, verb, engine) {
  const key = skillBubbleFor(target?.classId, verb?.id);
  if (key) return (ms) => skillBubbleWord(key, ms);
  const pkg = skillToolFor(target?.classId, verb?.id);
  if (!pkg) return null;
  const tool = skillToolClass(pkg, engine.inv, engine.toolState);
  const spr = target?.sprite;
  // inc_skill_packages.js 225-237: the thing on your left plays '-tool_animation', mirrored.
  const flipped = Boolean(spr && engine.player && spr.x < engine.player.x);
  return (ms) => itemBubbleWord(tool, ms, { flipped });
}

export const skillBubblesFeature = {
  id: SKILL_BUBBLES_FEATURE_ID,

  onTick(dtMs, now, engine) {
    watch(engine);
    if (!mine) return;
    const t = Date.now();
    if (t >= mine.endsAt) mine = null;
    else if (t >= mine.nextAt) {
      mine.nextAt = t + WORD_MAX_MS;
      send(engine, mine.wordFor(Math.min(mine.endsAt - t, WORD_MAX_MS)));
    }
  },

  onStreetClear() {
    for (const id of [...shown.keys()]) drop(id);
    selfBubble?.stop();
    selfBubble = null;
    mine = null;
  },

  /** game.js beginVerbAction: a timed verb began (runSkillPackage's bubble to the others). */
  verbStarted(target, verb, engine) {
    const wordFor = verbWord(target, verb, engine);
    if (!wordFor) return undefined;
    const ms = Number.isFinite(verb.durationMs) ? Math.max(0, Number(verb.durationMs)) : actionDurationFor(target.classId, verb.id);
    if (!(ms > 0)) return undefined;
    start(engine, wordFor, ms, target);
    return undefined;
  },

  /** game.js cancelCurrentAction: the others' bubble goes too (main.js 4971-4972). */
  verbCancelled(target, verbId, engine) {
    stop(engine, target);
    return undefined;
  },

  /**
   * An item's art over you for the others (players/inc_making.js 465, 663 and the rest):
   * game.js runMakeCraft (the tool, the batch's whole time), the potions, powders, musicblocks,
   * Tinkertool and Wine of the Dead. opts.flipped mirrors it. A class with no wire code sends nothing.
   */
  itemBubbleStarted(classTsid, durationMs, engine, opts = {}) {
    const ms = Math.max(0, Number(durationMs) || 0);
    if (ms > 0) start(engine, (t) => itemBubbleWord(classTsid, t, { flipped: Boolean(opts.flipped) }), ms, opts.target ?? null);
    return undefined;
  },

  /**
   * An overlay over you for the others with no verb behind it (G923: petrified_rock_small.js 199,
   * features/artifacts-feature.js crackFx).
   */
  overlayBubbleStarted(key, durationMs, engine) {
    const ms = Math.max(0, Number(durationMs) || 0);
    if (ms > 0) start(engine, (t) => skillBubbleWord(key, t), ms, null);
    return undefined;
  },

  /** game.js cancelMakeCraft: the make stopped early. */
  itemBubbleStopped(engine) {
    stop(engine);
    return undefined;
  },
};
