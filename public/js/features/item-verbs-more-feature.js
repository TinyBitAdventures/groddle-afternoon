/**
 * More pack verbs from GameServerJS (register rows G406-G434) as a feature
 * module (see js/feature-host.js). Rules, numbers and lines live in
 * js/item-verbs-more.js; the three potions (Draught of Wisdom, Rocky
 * Regeneration Solution, Alphabet Sauce) are in js/features/potions-feature.js.
 *
 * Pack verbs: Antique Spigot (Apply to forehead, Collect, Contemplate,
 * Spin), Broccoli Activate, Bacon Sniff, Banana Caress, Butterfly Lotion
 * Taste, Boot Inspect, Hard Bubble Pop, Disperse on the four elements,
 * Stinky Cheese Lick and Sniff, Very, Very Stinky Cheese Prod and Sniff,
 * Cheese Sniff, Butterfly Milk Sniff, Licorice's own Eat (it replaces the
 * food Eat: packUseInfo / runPackUse), the Pair of Dice and the 12-sided Die,
 * Juju Shoo-Shoo Powder, Butterfly Net Attract, Dusty Stick Unleash (a
 * Bundle of Joy), the Factory Defect Chick's race that always breaks, and
 * Smash on the twenty Street Creator trophy pieces.
 *
 * A Hog-tied Piggy that reaches the pack with no escape timer (frog mail or
 * the mailbox, inc_mail.js 995 onFrogDelivery) gets one: 1 in 6 a 5-minute
 * attempt with Herdkeeping, 1 in 3 without (hogtied_piggy.js 177-188).
 *
 * Stand-in art (swap when the art lands): the dice overlays (dice_overlay,
 * twelve_sided_die) through js/overlay-stand-in.js, which plays the real
 * overlay once it is in overlays.json; the Bundle of Joy walks with the
 * newxp Dust Bunny sheet (its own npc_bundle_of_joy.swf is not rendered).
 *
 * Multiplayer is not here: the street hearing the dice, bacon's "Something
 * smells delicious." for others, Random Kindness (the client hides a verb
 * that needs another player when you are alone, InteractionMenuController.as
 * 1695-1696), and the 12-sided die's rook attack (engine.query('summonRook')
 * has no answer yet).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&packverbdemo=1 packs
 *   one of each item here (and an Elemental Pouch; &packverblevel=<n> sets
 *   your level, &packverbmood=<n> / &packverbenergy=<n> your stats);
 *   &packverbautoplay=<class>:<verb> runs one on arrival (the twelve-sided
 *   die: &packverbface=<giant|rook>; the pair: &packverbdice=<l>,<r>).
 *   Canvas: packVerbLast, packVerbMessage, packVerbDice, packVerbJoy,
 *   packVerbNet, packVerbDefect.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { getGameDayKey } from '../game-day.js';
import { levelInfoForXp, XP_FOR_LEVEL } from '../progression.js?v=progression-1';
import { itemVerbAchievementCounters } from '../item-verbs.js?v=item-verbs-4';
import { ELEMENT_STACKMAX, hasPouch, POUCH_CLASS } from '../elemental-pouch.js';
import { GENTLE_ISLAND_TSIDS, isNewxpSceneTsid } from '../newxp.js?v=newxp-4';
import { SKILLQUEST_AK_TSID } from '../skillquest-ak.js?v=g298-1';
import { setToolRemaining, TOOL_CONDITION_CATALOG } from '../tools.js?v=woodcutting-test-8';
import { HERDKEEPING, hogtieEscapeDelayMs, husbandryPack } from '../animal-husbandry.js?v=g414-1';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g430-1';
import { sourceFromUrl, frameTexture } from '../textures.js';
import { landingY, walkSurfaceY } from '../walk-surface.js?v=g442-6';
import { overlayOrStandIn } from '../overlay-stand-in.js?v=g441-1';
import {
  BUNDLE_OF_JOY,
  BUTTERFLY_NET,
  DEFECT_CHICK,
  DICE,
  DIE_FACES,
  DUSTY_STICK,
  ELEMENT_CLASSES,
  LICORICE_EAT,
  SPIGOT_VERBS,
  activateBroccoli,
  attractWithNet,
  baconButton,
  bananaButton,
  blowJujuPowder,
  bootButton,
  broccoliButton,
  bubbleButton,
  caressBanana,
  cheeseSniffButton,
  defectRaceButton,
  defectRaceSecs,
  diceButton,
  dieButton,
  dieFaceName,
  dieOutcome,
  disperseButton,
  disperseElements,
  eatLicorice,
  frogDeliveryEscapeChance,
  inspectBoot,
  joyExclamation,
  joyNextLeg,
  jujuChargesLeft,
  jujuPowderButton,
  lickButton,
  lickStinkyCheese,
  lotionButton,
  milkSniffButton,
  netButton,
  netPointsLeft,
  netWaitSpot,
  pairOutcome,
  popBubble,
  prodButton,
  prodCheese,
  randInt,
  smashButton,
  smashTrophy,
  sniffBacon,
  sniffCheese,
  sniffMilk,
  sniffStinkyCheese,
  sniffVeryStinkyCheese,
  spigotVerb,
  stickButton,
  stickPoints,
  stinkySniffButton,
  tasteLotion,
  trophySmash,
  vvSniffButton,
  JUJU_POWDER,
} from '../item-verbs-more.js?v=g391-1';
import { itemZ } from '../item-bands.js?v=g429-1';

export const ITEM_VERBS_MORE_FEATURE_ID = 'item-verbs-more';

const DEMO_ITEMS = Object.freeze([
  'antique_spigot', 'broccoli', 'bacon', 'banana', 'butterfly_lotion', 'boot', 'hard_bubble', 'element_blue',
  'cheese', 'cheese_stinky', 'cheese_very_very_stinky', 'milk_butterfly', 'licorice', 'dice', 'dice_12sided',
  'juju_shoo_shoo_powder', 'butterfly_net', 'dusty_stick', 'npc_cubimal_factorydefect_chick',
  'trophy_street_creator_earth_piece4', POUCH_CLASS,
]);

const now = () => Date.now();
const rng = () => Math.random();

let daily = { day: '', broccoli: 0, rookSummons: 0 };
let jujuCharges = null; // the open jar's charges (null: full)
let netPoints = null; // the Butterfly Net's points (null: full)
let stickEmptiedAt = null; // the Dusty Stick, empty since (null: full)
const rolling = { dice: null, dice_12sided: null };
let joys = []; // Bundles of Joy: { id, tsid, x, y, dir, moveDistance, toX, bornAt, phase, excited, view }
let joySeq = 0;
let fibers = []; // a joy that died while you were away: { tsid, x, y }
let attracted = null; // { target }
let defect = null; // { at, phase, secs, x, y, sprite }
let hogtieAt = 0;
let last = '';
let lastMessage = '';
let demoDone = false;
let autoplayAt = 0;
let loader = null;

/* ------------------------------------------------------------------ */
/* Plumbing                                                             */
/* ------------------------------------------------------------------ */

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('packVerbLast', last);
  engine.setData('packVerbMessage', lastMessage);
  engine.setData('packVerbDice', ['dice', 'dice_12sided'].map((k) => (rolling[k] ? `${k}:${rolling[k].phase}` : '')).filter(Boolean).join(','));
  engine.setData('packVerbJoy', joys.filter((j) => j.tsid === engine.streetTsid).map((j) => j.phase).join(','));
  engine.setData('packVerbNet', `${netPointsLeft(netPoints)}${attracted ? ':waiting' : ''}`);
  engine.setData('packVerbDefect', defect ? defect.phase : '');
}

function say(engine, text, ok = true) {
  if (!text) return;
  lastMessage = text;
  engine.pushActivity?.(text);
  engine.toast?.(text, ok ? 3400 : 2600);
}

function counters(engine, classTsid, verb, count = 1) {
  for (const row of itemVerbAchievementCounters(classTsid, verb, count)) engine.achievement(row.counter, row.amount);
}

function today() {
  const day = getGameDayKey(now());
  if (daily.day !== day) daily = { day, broccoli: 0, rookSummons: 0 };
  return daily;
}

function level(engine) {
  return levelInfoForXp(engine.pc?.xp).level;
}

function playerName(engine) {
  return engine.query?.('playerChatName', engine) || engine.whoIsHere?.()?.[0] || 'Ur';
}

function refresh(engine) {
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
}

/** One verb's result: the activity line, the item spent, items given, the badge counters. */
function finish(engine, classTsid, verbId, out, { count = 1 } = {}) {
  if (!out) return null;
  if (out.consume) removeItem(engine.inv, classTsid, out.consume);
  for (const [cls, n] of Object.entries(out.give || {})) if (n > 0) addItem(engine.inv, cls, n);
  say(engine, out.message, out.ok);
  if (out.ok) counters(engine, classTsid, verbId, count);
  last = `${classTsid}:${verbId}:${out.ok ? 'ok' : 'failed'}`;
  refresh(engine);
  return out;
}

function newxpOrSkillQuest(engine) {
  const tsid = String(engine.streetTsid || '');
  // location.is_newxp (the intro scenes and Gentle Island) or is_skillquest (A L'il Animal Kinship).
  return isNewxpSceneTsid(tsid) || GENTLE_ISLAND_TSIDS.includes(tsid) || tsid === SKILLQUEST_AK_TSID;
}

/* ------------------------------------------------------------------ */
/* Pack buttons                                                         */
/* ------------------------------------------------------------------ */

function buttonsFor(classTsid, engine) {
  const pc = engine.pc || {};
  switch (classTsid) {
    case 'antique_spigot':
      return SPIGOT_VERBS.map((v) => ({ id: v.id, label: v.label, tooltip: v.tooltip, enabled: true, reason: '', primary: v.id === 'applytoforehead' }));
    case 'broccoli':
      return [broccoliButton()];
    case 'bacon':
      return [baconButton()];
    case 'banana':
      return [bananaButton()];
    case 'butterfly_lotion':
      return [lotionButton({ newxpOrSkillQuest: newxpOrSkillQuest(engine) })];
    case 'boot':
      return [bootButton()];
    case 'hard_bubble':
      return [bubbleButton(level(engine))];
    case 'cheese':
      return [cheeseSniffButton(pc)];
    case 'cheese_stinky':
      return [lickButton(pc), stinkySniffButton()];
    case 'cheese_very_very_stinky':
      return [prodButton(pc), vvSniffButton(pc)];
    case 'milk_butterfly':
      return [milkSniffButton()];
    case 'dice':
      return [diceButton({ rolling: Boolean(rolling.dice) })];
    case 'dice_12sided':
      return [dieButton(pc, { rolling: Boolean(rolling.dice_12sided) })];
    case 'juju_shoo_shoo_powder':
      return [jujuPowderButton(jujuCharges)];
    case 'butterfly_net':
      return [netButton(netPoints)];
    case 'dusty_stick':
      return [stickButton(stickEmptiedAt, now())];
    case 'npc_cubimal_factorydefect_chick': {
      const b = defectRaceButton({ racing: Boolean(defect) });
      return b ? [b] : [];
    }
    default:
      if (ELEMENT_CLASSES.includes(classTsid)) return [disperseButton()];
      if (trophySmash(classTsid)) return [smashButton(classTsid, { hasPouch: hasPouch(engine.inv) })];
      return [];
  }
}

/* ------------------------------------------------------------------ */
/* Running a verb                                                       */
/* ------------------------------------------------------------------ */

/** Run one pack verb (button, QA, tests). Returns the result, or null when nothing ran. */
export function runMoreVerb(engine, classTsid, verbId, opts = {}) {
  if (countItem(engine.inv, classTsid) < 1) return null;
  const button = buttonsFor(classTsid, engine).find((b) => b.id === verbId);
  if (!button) return null;
  if (!button.enabled) {
    engine.toast?.(button.reason, 2600);
    last = `${classTsid}:${verbId}:refused`;
    publish(engine);
    return { ok: false, refused: true, message: button.reason };
  }
  const pc = engine.pc;
  const r = opts.rng || rng;
  switch (classTsid) {
    case 'antique_spigot':
      return finish(engine, classTsid, verbId, spigotVerb(pc, verbId));
    case 'broccoli': {
      const out = activateBroccoli(pc, today().broccoli);
      if (out.counted) today().broccoli += 1;
      return finish(engine, classTsid, verbId, out);
    }
    case 'bacon':
      return finish(engine, classTsid, verbId, sniffBacon(pc));
    case 'banana':
      return finish(engine, classTsid, verbId, caressBanana(pc, level(engine), r));
    case 'butterfly_lotion': {
      const out = finish(engine, classTsid, verbId, tasteLotion(pc));
      // The open tube's wear starts over once no tube is left (a new one is full).
      if (countItem(engine.inv, 'butterfly_lotion') < 1 && engine.toolState) {
        setToolRemaining(engine.toolState, 'butterfly_lotion', TOOL_CONDITION_CATALOG.butterfly_lotion.capacity);
      }
      return out;
    }
    case 'boot':
      return finish(engine, classTsid, verbId, inspectBoot(pc, r));
    case 'hard_bubble':
      return finish(engine, classTsid, verbId, popBubble(pc, level(engine), 1));
    case 'cheese':
      return finish(engine, classTsid, verbId, sniffCheese(pc, r));
    case 'cheese_stinky':
      return finish(engine, classTsid, verbId, verbId === 'lick' ? lickStinkyCheese(pc) : sniffStinkyCheese());
    case 'cheese_very_very_stinky':
      return finish(engine, classTsid, verbId, verbId === 'prod' ? prodCheese(pc) : sniffVeryStinkyCheese(pc, r));
    case 'milk_butterfly':
      return finish(engine, classTsid, verbId, sniffMilk(pc));
    case 'dice':
      return startPair(engine, opts);
    case 'dice_12sided':
      return startTwelve(engine, opts);
    case 'juju_shoo_shoo_powder':
      return blowPowder(engine);
    case 'butterfly_net':
      return attract(engine);
    case 'dusty_stick':
      return unleash(engine);
    case 'npc_cubimal_factorydefect_chick':
      return startDefectRace(engine, opts);
    default:
      if (ELEMENT_CLASSES.includes(classTsid)) {
        const count = countItem(engine.inv, classTsid);
        return finish(engine, classTsid, verbId, disperseElements(pc, classTsid, count), { count });
      }
      if (trophySmash(classTsid)) {
        const room = {};
        for (const cls of ['element_green', 'element_blue', 'element_shiny']) room[cls] = Math.max(0, ELEMENT_STACKMAX - countItem(engine.inv, cls));
        const out = smashTrophy(classTsid, room);
        // trophy_piece.js 114: the handler sends its own line (no buildVerbMessage).
        return finish(engine, classTsid, verbId, out);
      }
      return null;
  }
}

/** licorice.js verbs.eat (the default verb). */
export function eatLicoriceNow(engine) {
  if (countItem(engine.inv, 'licorice') < 1) return null;
  return finish(engine, 'licorice', 'eat', eatLicorice(engine.pc));
}

/* ---- Dice ---------------------------------------------------------- */

function overlayAt(engine, dx) {
  return () => {
    const p = engine.player;
    return p ? { x: p.x + dx, y: p.y + DICE.pair.deltaY } : { x: 0, y: 0 };
  };
}

function startPair(engine, opts = {}) {
  const cfg = DICE.pair;
  const pin = String(opts.dice || engine.param?.('packverbdice') || '').split(',').map((n) => Math.floor(Number(n)));
  const roll = {
    phase: 'spin',
    at: now(),
    left: pin[0] >= 1 && pin[0] <= 6 ? pin[0] : null,
    right: pin[1] >= 1 && pin[1] <= 6 ? pin[1] : null,
    views: [
      overlayOrStandIn(engine, cfg.overlay, { at: overlayAt(engine, -cfg.deltaX), wh: cfg.wh, durationMs: cfg.durationMs, state: 'spin', label: '?' }),
      overlayOrStandIn(engine, cfg.overlay, { at: overlayAt(engine, cfg.deltaX), wh: cfg.wh, durationMs: cfg.durationMs, state: 'spin', label: '?' }),
    ],
  };
  rolling.dice = roll;
  counters(engine, 'dice', 'roll');
  last = 'dice:roll:spin';
  refresh(engine);
  return { ok: true, rolling: true };
}

function tickPair(engine, t) {
  const roll = rolling.dice;
  if (!roll) return;
  const cfg = DICE.pair;
  for (const v of roll.views) v.tick?.();
  if (roll.phase === 'spin' && t - roll.at >= cfg.leftMs) {
    // onDiceRollCompleteLeft: randInt(1, 6), overlay_state 'roll' + left.
    roll.left ||= randInt(1, 6);
    roll.views[0].setState(`roll${roll.left}`, String(roll.left));
    roll.phase = 'left';
  }
  if (roll.phase === 'left' && t - roll.at >= cfg.rightMs) {
    roll.right ||= randInt(1, 6);
    const out = pairOutcome(roll.left, roll.right);
    if (out.toys) engine.featsIncrement?.('tottlys_toys', out.toys);
    roll.views[1].setState(`roll${roll.right}`, String(roll.right));
    // pc.location.sendActivity(..., pc): everyone here, your name first.
    say(engine, `${playerName(engine)} ${out.line}`);
    roll.phase = 'landed';
    roll.total = out.total;
    last = `dice:roll:${out.total}`;
    publish(engine);
  }
  if (t - roll.at >= cfg.durationMs) {
    for (const v of roll.views) v.stop?.();
    rolling.dice = null;
    engine.refreshPack?.();
    publish(engine);
  }
}

function startTwelve(engine, opts = {}) {
  const cfg = DICE.twelve;
  const pin = String(opts.face || engine.param?.('packverbface') || '');
  rolling.dice_12sided = {
    phase: 'spin',
    at: now(),
    face: DIE_FACES.includes(pin) ? pin : null,
    views: [overlayOrStandIn(engine, cfg.overlay, { at: overlayAt(engine, 0), wh: cfg.wh, durationMs: cfg.durationMs, state: 'spin', label: '?' })],
  };
  counters(engine, 'dice_12sided', 'roll');
  last = 'dice_12sided:roll:spin';
  refresh(engine);
  return { ok: true, rolling: true };
}

function tickTwelve(engine, t) {
  const roll = rolling.dice_12sided;
  if (!roll) return;
  const cfg = DICE.twelve;
  for (const v of roll.views) v.tick?.();
  if (roll.phase === 'spin' && t - roll.at >= cfg.landMs) {
    // onDiceRollLand: choose_one(config.giants + 'rook').
    const face = roll.face || DIE_FACES[randInt(0, DIE_FACES.length - 1)];
    const out = dieOutcome(engine.pc, face, { rookable: true, rooked: false });
    if (out.rook) {
      engine.featsIncrement?.('tottlys_toys', out.toys);
      // achievements_increment_daily('rook', 'summoned'): nothing reads it but this count.
      today().rookSummons += 1;
    }
    say(engine, `${playerName(engine)} ${out.line}`);
    if (out.moodLine) engine.pushActivity?.(out.moodLine);
    // 15%: startRookAttack on a rookable street that is not already rooked (the rook feature decides).
    if (out.attack) engine.query?.('summonRook', engine, { clearMs: 60 * 1000, source: 'dice_12sided' });
    roll.views[0].setState(`roll_${face}`, dieFaceName(face));
    roll.phase = 'landed';
    last = `dice_12sided:roll:${face}${out.attack ? ':attack' : ''}`;
    engine.updateHud?.();
    publish(engine);
  }
  if (t - roll.at >= cfg.durationMs) {
    for (const v of roll.views) v.stop?.();
    rolling.dice_12sided = null;
    engine.refreshPack?.();
    publish(engine);
  }
}

/* ---- Juju Shoo-Shoo Powder ------------------------------------------ */

function blowPowder(engine) {
  // pc.location.item_exists('npc_juju_boss'): the remake's streets have no Juju boss (only Dust Trap bandits).
  const bossHere = (engine.interactables || []).some((t) => t?.classId === 'npc_juju_boss');
  const out = blowJujuPowder(jujuCharges, { bossHere });
  if (out.ok) {
    engine.playSound?.(JUJU_POWDER.sound, { volume: 0.6 });
    engine.query?.('jujuPowderBlow', engine);
    jujuCharges = out.charges;
    if (out.emptied) {
      removeItem(engine.inv, 'juju_shoo_shoo_powder', 1);
      jujuCharges = null;
    }
  }
  return finish(engine, 'juju_shoo_shoo_powder', 'blow_on', out);
}

/* ---- Butterfly Net -------------------------------------------------- */

function closestButterfly(engine) {
  const p = engine.player;
  if (!p) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of engine.interactables || []) {
    if (t?.classId !== 'npc_butterfly' || !t.sprite || t.sprite.destroyed || t.sprite.visible === false) continue;
    const d = Math.hypot(t.sprite.x - p.x, t.sprite.y - p.y);
    if (d <= BUTTERFLY_NET.range && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function attract(engine) {
  const target = closestButterfly(engine);
  const out = attractWithNet(engine.pc, netPoints, target);
  if (out.ok) {
    netPoints = out.points;
    // onWaitStart: it stops and flies to wait beside you (was_attracted is set and only ever cleared).
    endAttraction();
    attracted = { target };
  }
  return finish(engine, 'butterfly_net', 'attract', out);
}

function endAttraction() {
  const b = attracted?.target?.sprite;
  if (b && !b.destroyed && b._ambient) b.baseY = b.y;
  attracted = null;
}

function tickAttracted(engine) {
  const t = attracted?.target;
  const b = t?.sprite;
  const p = engine.player;
  if (!t || !b || b.destroyed || !p || !(engine.interactables || []).includes(t)) {
    if (attracted) attracted = null;
    return;
  }
  // moveToWait every 500 ms: fly to 20 px behind and 100 px above you, and keep following.
  const spot = netWaitSpot(p.x, p.y);
  b.x += (spot.x - b.x) * 0.08;
  b.y += (spot.y - b.y) * 0.08 + Math.sin(now() / 260) * 0.6;
  const bs = Math.abs(b.baseScale || b.scale.y || 1);
  b.scale.x = (p.x >= b.x ? 1 : -1) * bs;
}

/* ---- Dusty Stick and the Bundle of Joy ------------------------------- */

const JOY_SHEET = Object.freeze({ url: 'assets/sprites/newxp/dustbunny_walk_right.png', fw: 104, fh: 59, frames: 9 });

function joyFrames(engine) {
  const { PIXI } = engine;
  if (!PIXI?.Rectangle) return [];
  joyFrames.cache ||= null;
  if (joyFrames.cache) return joyFrames.cache;
  const base = sourceFromUrl(JOY_SHEET.url);
  joyFrames.cache = Array.from({ length: JOY_SHEET.frames }, (_, i) => frameTexture(base, new PIXI.Rectangle(i * JOY_SHEET.fw, 0, JOY_SHEET.fw, JOY_SHEET.fh)));
  return joyFrames.cache;
}

function drawJoy(engine, joy) {
  const { PIXI } = engine;
  if (!PIXI?.AnimatedSprite || !engine.entityLayer || joy.view) return;
  const frames = joyFrames(engine);
  if (!frames.length) return;
  const spr = new PIXI.AnimatedSprite(frames);
  spr.anchor.set(0.5, 0.96);
  spr.baseScale = 0.9;
  spr.scale.set(0.9);
  spr.animationSpeed = 0.4;
  spr.zIndex = itemZ('npc_bundle_of_joy', 4);
  spr.eventMode = 'none';
  spr.label = 'bundle-of-joy';
  spr.x = joy.x;
  spr.y = joy.y;
  spr.play();
  engine.entityLayer.addChild(spr);
  joy.view = spr;
  joy.target = { sprite: spr, label: 'Bundle of Joy', classId: 'npc_bundle_of_joy' };
}

function dropJoyView(joy) {
  const s = joy.view;
  if (s && !s.destroyed) {
    s.parent?.removeChild(s);
    s.destroy();
  }
  joy.view = null;
  joy.target = null;
}

function unleash(engine) {
  const p = engine.player;
  if (!p || stickPoints(stickEmptiedAt, now()) !== DUSTY_STICK.capacity) return null;
  stickEmptiedAt = now();
  joySeq += 1;
  const joy = { id: `joy${joySeq}`, tsid: engine.streetTsid, x: Math.round(p.x), y: Math.round(p.y), dir: 'left', moveDistance: 100, toX: null, bornAt: now(), phase: 'born', excited: 0, view: null };
  joys.push(joy);
  drawJoy(engine, joy);
  return finish(engine, 'dusty_stick', 'unleash', { ok: true, consume: 0, message: 'You unleashed a Dusty Stick.' });
}

function streetEdges(engine) {
  const w = Number(engine.worldW) || 4000;
  return { left: 0, right: w };
}

function tickJoys(engine, t, dtMs) {
  const phases = joys.map((j) => j.phase).join(',');
  for (const joy of joys) {
    const age = t - joy.bornAt;
    const here = joy.tsid === engine.streetTsid;
    if (joy.phase !== 'gone' && joy.phase !== 'dying' && age >= BUNDLE_OF_JOY.dieAtMs) {
      // onDie: stop, "Oh no! My existen ...", gone 3 s later.
      joy.phase = 'dying';
      joy.view?.stop?.();
      if (here && joy.target) engine.say?.(joy.target, BUNDLE_OF_JOY.dyingBubble, BUNDLE_OF_JOY.dyingBubbleMs);
    }
    if (joy.phase === 'dying' && age >= BUNDLE_OF_JOY.dieAtMs + BUNDLE_OF_JOY.goneAfterMs) {
      // okReallyDieNow: the owner hears it; replaceWithPoofIfOnGround('fiber').
      joy.phase = 'gone';
      engine.pushActivity?.(BUNDLE_OF_JOY.ceased);
      if (here) engine.dropWorldStack?.(BUNDLE_OF_JOY.leaves, 1, joy.x, joy.y);
      else fibers.push({ tsid: joy.tsid, x: joy.x, y: joy.y });
      if (joy.target) engine.closeSay?.(joy.target, { now: true });
      dropJoyView(joy);
      last = 'dusty_stick:joy:gone';
      continue;
    }
    if (joy.phase === 'gone' || joy.phase === 'dying') continue;
    // onExcited every 2 s: the first four say one of the exclamations for a second.
    const due = Math.floor(age / BUNDLE_OF_JOY.exciteEveryMs);
    if (due > joy.excited) {
      joy.excited = due;
      if (due <= BUNDLE_OF_JOY.excitements && here && joy.target) {
        engine.say?.(joy.target, joyExclamation(Math.floor(rng() * 4), playerName(engine)), BUNDLE_OF_JOY.bubbleMs);
      }
    }
    if (age < BUNDLE_OF_JOY.firstMoveMs) continue;
    if (joy.phase === 'born') joy.phase = 'walk';
    if (joy.toX == null) {
      const leg = joyNextLeg(joy, streetEdges(engine));
      joy.dir = leg.dir;
      joy.moveDistance = leg.moveDistance;
      joy.toX = leg.toX;
    }
    const step = (BUNDLE_OF_JOY.walkSpeed * dtMs) / 1000;
    const dx = joy.toX - joy.x;
    if (Math.abs(dx) <= step) {
      joy.x = joy.toX;
      joy.toX = null;
      // walk_onMsg pathing_complete: move_distance *= 1.5.
      joy.moveDistance *= 1.5;
    } else joy.x += Math.sign(dx) * step;
    // npc_can_fall false: it keeps to the walkable surface under it (the source paths along platforms).
    if (engine.platforms) joy.y = landingY(engine.platforms, joy.x, joy.y - 4) ?? walkSurfaceY(engine.platforms, joy.x, joy.y, { up: 60, down: 60 }) ?? joy.y;
    const s = joy.view;
    if (s && !s.destroyed) {
      s.x = joy.x;
      s.y = joy.y;
      s.scale.x = (joy.dir === 'left' ? -1 : 1) * s.baseScale;
    }
  }
  const gone = joys.some((j) => j.phase === 'gone');
  joys = joys.filter((j) => j.phase !== 'gone');
  if (gone || joys.map((j) => j.phase).join(',') !== phases) publish(engine);
}

/* ---- The Factory Defect Chick -------------------------------------- */

function defectSprite(engine, sheet, x, y) {
  const { PIXI } = engine;
  if (!PIXI?.AnimatedSprite || !engine.entityLayer) return null;
  loader ||= createSheetLoader(PIXI);
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.x = x;
  spr.y = y;
  spr.zIndex = 30;
  spr.eventMode = 'none';
  spr.animationSpeed = pixiSpeed(30);
  spr.label = 'defect-chick';
  engine.entityLayer.addChild(spr);
  loader.load(sheet).then(() => {
    const frames = loader.frames(sheet);
    if (spr.destroyed || !frames.length) return;
    spr.textures = frames;
    spr.play();
  });
  return spr;
}

function clearDefectSprite() {
  const s = defect?.sprite;
  if (s && !s.destroyed) {
    s.parent?.removeChild(s);
    s.destroy();
  }
  if (defect) defect.sprite = null;
}

function startDefectRace(engine, opts = {}) {
  const p = engine.player;
  if (!p || defect) return null;
  const pinned = Math.floor(Number(opts.secs ?? engine.param?.('packverbracesecs')));
  // verbs.race: set down 50 px ahead, CUBIMAL_WIND_UP. The source takes it out of the pack;
  // here it stays counted there (no Race button while it runs), so a save mid-race never
  // writes a lost and regained 1.36 million-currant rare item to the ledger.
  const face = Number(p.scale?.x ?? 1) < 0 ? -1 : 1;
  const x = Math.round(p.x + DEFECT_CHICK.aheadPx * face);
  defect = { at: now(), phase: 'wound', secs: pinned >= 2 && pinned <= 10 ? pinned : defectRaceSecs(), x, y: Math.round(p.y), sprite: null };
  defect.sprite = defectSprite(engine, DEFECT_CHICK.brokenSheet, x, defect.y);
  engine.playSound?.('CUBIMAL_WIND_UP', { volume: 0.6 });
  return finish(engine, DEFECT_CHICK.classTsid, 'race', { ok: true, consume: 0, message: 'You raced a Factory Defect Chick Cubimal.' });
}

function returnDefect(engine) {
  defect?.loop?.stop?.();
  clearDefectSprite();
  defect = null;
  refresh(engine);
}

function tickDefect(engine, t) {
  if (!defect) return;
  const age = t - defect.at;
  if (defect.phase === 'wound' && age >= DEFECT_CHICK.windUpMs) {
    // onRaceStart: state race (in place: no walk speed), CUBIMAL_RACE.
    defect.phase = 'race';
    clearDefectSprite();
    defect.sprite = defectSprite(engine, DEFECT_CHICK.raceSheet, defect.x, defect.y);
    defect.loop = engine.playSoundLoop?.('CUBIMAL_RACE', { intervalMs: 3_400, volume: 0.55 }) || null;
    publish(engine);
  }
  const raceEnd = DEFECT_CHICK.windUpMs + defect.secs * 1000;
  if (defect.phase === 'race' && age >= raceEnd) {
    // onRaceEnd: "Oh! It's broken!", state 1, CUBIMAL_RACE stops, CUBIMAL_WIND_DOWN.
    defect.phase = 'broken';
    say(engine, DEFECT_CHICK.broken);
    clearDefectSprite();
    defect.sprite = defectSprite(engine, DEFECT_CHICK.brokenSheet, defect.x, defect.y);
    defect.loop?.stop?.();
    defect.loop = null;
    engine.playSound?.('CUBIMAL_WIND_DOWN', { volume: 0.6 });
    last = 'npc_cubimal_factorydefect_chick:broken';
    publish(engine);
  }
  if (defect.phase === 'broken' && age >= raceEnd + DEFECT_CHICK.backMs) {
    // returnToPack.
    last = 'npc_cubimal_factorydefect_chick:back';
    returnDefect(engine);
  }
}

/* ---- Hog-tied Piggy by mail ----------------------------------------- */

function checkHogtie(engine, t) {
  if (t < hogtieAt) return;
  hogtieAt = t + 1000;
  const pack = husbandryPack();
  if (countItem(engine.inv, 'hogtied_piggy') < 1 || pack.hogtie) return;
  // onFrogDelivery: setEscapeTimer(chance) and buffs_apply('hog_tie') (the buff's tick is nextXpAt).
  const chance = frogDeliveryEscapeChance(engine.learnedSkills || []);
  pack.hogtie = { escapeAt: t + hogtieEscapeDelayMs(chance), nextXpAt: t + HERDKEEPING.hogtieTickMs, name: '' };
  last = `hogtied_piggy:delivered:${chance < 0.2 ? '1in6' : '1in3'}`;
  engine.save?.();
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

function setupDemo(engine) {
  if (demoDone || engine.param?.('packverbdemo') !== '1') return;
  demoDone = true;
  for (const cls of DEMO_ITEMS) if (countItem(engine.inv, cls) < 1) addItem(engine.inv, cls, cls.startsWith('element_') ? 100 : 1);
  const pc = engine.pc;
  const lvl = Math.floor(Number(engine.param?.('packverblevel')) || 0);
  if (lvl > 1 && pc) pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[Math.min(XP_FOR_LEVEL.length, lvl) - 2] || 0);
  const mood = engine.param?.('packverbmood');
  if (mood != null && pc) pc.mood = Math.max(0, Number(mood) || 0);
  const energy = engine.param?.('packverbenergy');
  if (energy != null && pc) pc.energy = Math.max(0, Number(energy) || 0);
  engine.setData?.('packVerbDemo', '1');
  refresh(engine);
  if (engine.param?.('packverbautoplay')) autoplayAt = now() + 1800;
}

function runAutoplay(engine) {
  const [cls, verb] = String(engine.param?.('packverbautoplay') || '').split(':');
  if (!cls) return;
  if (cls === 'licorice' && (!verb || verb === 'eat')) {
    eatLicoriceNow(engine);
    return;
  }
  const id = verb || buttonsFor(cls, engine)[0]?.id;
  if (id) runMoreVerb(engine, cls, id);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const itemVerbsMoreFeature = {
  id: ITEM_VERBS_MORE_FEATURE_ID,

  onStreetEnter(street, engine) {
    setupDemo(engine);
    for (const joy of joys) if (joy.tsid === engine.streetTsid) drawJoy(engine, joy);
    // A joy that died while you were away left its fiber where it stood.
    const here = fibers.filter((f) => f.tsid === engine.streetTsid);
    fibers = fibers.filter((f) => f.tsid !== engine.streetTsid);
    for (const f of here) engine.dropWorldStack?.(BUNDLE_OF_JOY.leaves, 1, f.x, f.y);
    publish(engine);
  },

  onStreetClear(engine) {
    endAttraction();
    for (const joy of joys) dropJoyView(joy);
    // Leaving mid-race: the figure goes straight back in the pack (as the series figures do).
    if (defect) returnDefect(engine);
  },

  onTick(dtMs, t, engine) {
    if (!engine?.started && engine?.started !== undefined) return;
    tickPair(engine, t);
    tickTwelve(engine, t);
    tickJoys(engine, t, dtMs);
    tickAttracted(engine);
    tickDefect(engine, t);
    checkHogtie(engine, t);
    if (autoplayAt && t >= autoplayAt && !engine.acting?.()) {
      autoplayAt = 0;
      runAutoplay(engine);
    }
  },

  onNewDay(t) {
    daily = { day: getGameDayKey(t), broccoli: 0, rookSummons: 0 };
  },

  onEvent(counter) {
    // Any verb on a butterfly ends the wait (onInteractionEnding -> checkWaiting -> onWaitEnd).
    if (attracted && String(counter || '').startsWith('npc_butterfly:')) endAttraction();
  },

  verbStarted(target) {
    if (attracted && target === attracted.target) endAttraction();
    return null;
  },

  packVerbs(classTsid, engine) {
    if (countItem(engine.inv, classTsid) < 1) return [];
    return buttonsFor(classTsid, engine);
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!buttonsFor(classTsid, engine).some((b) => b.id === verbId)) return false;
    runMoreVerb(engine, classTsid, verbId);
    return true;
  },

  /** licorice.js verbs.eat replaces food's Eat in the pack (game.js asks before its own use info). */
  packUseInfo(classTsid, engine) {
    if (classTsid !== 'licorice') return null;
    const have = countItem(engine.inv, 'licorice') > 0;
    return {
      usable: have,
      verb: LICORICE_EAT.label,
      singleAction: true,
      effects: {},
      message: LICORICE_EAT.tooltip,
      reason: have ? '' : 'That is no longer in your pack.',
    };
  },

  runPackUse(classTsid, engine) {
    if (classTsid !== 'licorice') return null;
    eatLicoriceNow(engine);
    return true;
  },

  save() {
    return {
      version: 1,
      daily: { ...daily },
      jujuCharges,
      netPoints,
      stickEmptiedAt,
      fibers: fibers.map((f) => ({ ...f })),
    };
  },

  restore(slice) {
    const d = slice?.daily || {};
    daily = { day: String(d.day || ''), broccoli: Math.max(0, Math.floor(Number(d.broccoli) || 0)), rookSummons: Math.max(0, Math.floor(Number(d.rookSummons) || 0)) };
    jujuCharges = slice?.jujuCharges == null ? null : jujuChargesLeft(slice.jujuCharges);
    netPoints = slice?.netPoints == null ? null : netPointsLeft(slice.netPoints);
    stickEmptiedAt = Number.isFinite(Number(slice?.stickEmptiedAt)) && slice?.stickEmptiedAt != null ? Number(slice.stickEmptiedAt) : null;
    fibers = (Array.isArray(slice?.fibers) ? slice.fibers : []).filter((f) => f && typeof f.tsid === 'string').map((f) => ({ tsid: f.tsid, x: Number(f.x) || 0, y: Number(f.y) || 0 }));
  },

  /** Tests. */
  _state() {
    return {
      daily: { ...daily },
      jujuCharges,
      netPoints,
      stickEmptiedAt,
      rolling: { dice: rolling.dice ? { ...rolling.dice, views: undefined } : null, dice_12sided: rolling.dice_12sided ? { ...rolling.dice_12sided, views: undefined } : null },
      joys: joys.map((j) => ({ ...j, view: undefined, target: undefined })),
      fibers: fibers.map((f) => ({ ...f })),
      attracted: Boolean(attracted),
      defect: defect ? { ...defect, sprite: undefined, loop: undefined } : null,
      last,
      lastMessage,
    };
  },
  _reset() {
    daily = { day: '', broccoli: 0, rookSummons: 0 };
    jujuCharges = null;
    netPoints = null;
    stickEmptiedAt = null;
    rolling.dice = null;
    rolling.dice_12sided = null;
    joys = [];
    joySeq = 0;
    fibers = [];
    attracted = null;
    defect = null;
    hogtieAt = 0;
    last = '';
    lastMessage = '';
    demoDone = false;
    autoplayAt = 0;
    joyFrames.cache = null;
  },
};
