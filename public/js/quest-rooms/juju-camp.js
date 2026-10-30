/**
 * Carry That Weight (quests/help_juju_bandits.js, help_juju_bandits_2.js) in
 * the Juju Hideout, plus the dig sites out on the Kajuu streets.
 *
 * Source:
 *  - onAccepted builds the hint table (four hubs x five streets), picks the
 *    clue hub from where you stand (86 Baqala, 91 Zhambu, 95 Xalanga, else
 *    90 Choru) and one of its streets, then questInstanceLocation(pc,
 *    'juju_camp', -839, -98, 5 * 60). Part II's onStarted is the same call.
 *  - items/npc_juju_grandma.js: a 200 x 200 collision box. First bump runs
 *    explain_task (six beats) and then giveItems: a Juju Trowel, the first
 *    Secret Juju Hint (read at once) and the instance exit prompt "All done
 *    here! Press OK when you're ready to leave." Later bumps: explain_again
 *    (gives the items) or already_started. With the Ancestral Paperweight she
 *    takes it and the trowel, sets return_weight and turns Part II in (its
 *    completion text, 1000 xp, 500 currants, 250 mood, the Paperweight back
 *    and 250 Paper), then the instance closes.
 *  - jujuBanditScene: a grandson (npc_juju_bandit, no bandana, the colour of
 *    the bandit who offered the quest) spawns at -1050, walks to -2304 at the
 *    instance walk speed 150, waits until you are left of -2000, then says one
 *    of eight lines; Grandma answers (angry for lines 0, 1, 4, 5) and the kid
 *    shrinks away. The first visit always plays line 7 with no answer; the
 *    scene repeats every 5-10 s. Bumping Grandma after the first scene sends
 *    the kid off; it restarts 5 s after her conversation ends.
 *  - Leaving the camp before the first hint fails the quest (onExitLocation);
 *    after it the quest stays active and the hunt goes on outside.
 *  - The hunt (world hooks below): entering a clue street's `juju_dig` box
 *    says "Seems like this might be a good place to dig…" and arms digging
 *    within the box +-100 px. The trowel's dig verb ("There's nothing to dig
 *    up here." otherwise) removes the hint, adds solve_clue, and hands over
 *    the next hint from a hub not used yet (read 1.5 s later) or, after the
 *    third, the Ancestral Paperweight. onComplete_custom offers Part II at
 *    once. The Paperweight's celebrate verb costs 2 mood, once.
 *
 * Lost: the Juju Hideout geometry (LNVDIG7F7DO2CM5 was never archived) and
 * the overworld npc_juju_bandit who offered the quest (catalog.js offers it
 * in the four Kajuu hubs). The camp is rebuilt from the hideout's own CC0
 * decos (juju_grandma_tent / campfire / papers / chair) on a savanna floor at
 * the source spawn height; Grandma sits left of the kid's -2304 stop. Its
 * look (dusk, two teepees, the chair, the mound) follows four players' Snaps. The twenty
 * clue streets are the archived streets with their `juju_dig` boxes.
 */

import { onLoaded, textureFromUrl } from '../textures.js';
import { loseMood } from '../metabolics.js';
import { JUJU_CAMP_FILES } from '../juju-camp-art.js';

const Q1 = 'help_juju_bandits';
const Q2 = 'help_juju_bandits_2';
const ROOM_ID = 'juju_camp';
const ART = 'assets/sprites/quest-rooms/juju_camp/';
/** save.memory key shared by the room (ctx.memory('hunt')) and the world hooks. */
export const HUNT_KEY = `room:${ROOM_ID}:hunt`;

/* ------------------------------------------------------------------ */
/* Source data                                                         */
/* ------------------------------------------------------------------ */

/** buildHintTable(), verbatim. */
export const HINTS = Object.freeze({
  baqala: {
    dust_path: { title: 'Hidden in Baqala', text: 'Dead-end on a trail of dust. Behind the big tree.' },
    empty_via: { title: 'Hidden in Baqala', text: 'At the northwest end of nothing.' },
    stake_claim: { title: 'Hidden in Baqala', text: 'Stake your claim in the southeast, and put down roots.' },
    plains_rte: { title: 'Hidden in Baqala', text: 'Not the fanciest route in the southwest. Behind the tall grass.' },
    parsins_trail: { title: 'Hidden in Baqala', text: 'On your way to Kajuu? Look to your left.' },
  },
  zhambu: {
    rubes_way: { title: 'Hidden in Zhambu', text: 'Looking for a good trade in the southeast? Stop for paper first.' },
    yokel_yarn: { title: 'Hidden in Zhambu', text: "The northeastern bumpkin's tale ended on a small mound." },
    loutish_ln: { title: 'Hidden in Zhambu', text: 'A brute on the way to Xalanga hid something near the street sign.' },
    cornfed_crt: { title: 'Hidden in Zhambu', text: 'If you’re well-fed in the northwest, rest under the tallest tree.' },
    boor_bane: { title: 'Hidden in Zhambu', text: 'On a small mound to the southwest, find the secret to banishing rude guests.' },
  },
  xalanga: {
    hazy_gate: { title: 'Hidden in Xalanga', text: 'Under the eaves of touching trees, you can barely see Choru from here.' },
    fervor_tack: { title: 'Hidden in Xalanga', text: 'Where fiery fervor breaks into deadpan doldrums.' },
    ramble_way: { title: 'Hidden in Xalanga', text: 'The story of the northwestern tree and its rocky friend rambled without conclusion.' },
    distant_drag: { title: 'Hidden in Xalanga', text: 'You can’t drag yourself much further northeast than this. Rest between trees on a tall hill.' },
    languid_line: { title: 'Hidden in Xalanga', text: 'Enervated in the west? Rest near a paper tree.' },
  },
  choru: {
    tumble_rd: { title: 'Hidden in Choru', text: 'Before tumbling into Besara, check behind the sign.' },
    chester_way: { title: 'Hidden in Choru', text: 'A yesterday rhyme. Look on top of this ladder in the southeast.' },
    naif_lane: { title: 'Hidden in Choru', text: 'Naive about alternate spellings? Check this western signpost.' },
    rooks_way: { title: 'Hidden in Choru', text: 'An enemy of imagination rises from behind a tree in the west.' },
    putter_track: { title: 'Hidden in Choru', text: 'If you try golfing in the northeast, avoid this dirt trap.' },
  },
});

/** quests/help_juju_bandits.js `locations` prod_tsid (imported as G<rest>.json). */
export const LOCATION_TSIDS = Object.freeze({
  dust_path: 'LA5P9MNTJK42IJS',
  empty_via: 'LA5BVMNOTH42T8L',
  stake_claim: 'LA515GCSSC42QGF',
  plains_rte: 'LA5N5E10CM42HJ4',
  parsins_trail: 'LA51450HIC42Q4I',
  rubes_way: 'LA5135VC0J52RGQ',
  yokel_yarn: 'LA513OVR0J52BMT',
  loutish_ln: 'LA513A7M0J521F2',
  cornfed_crt: 'LA5137QE0J52UB8',
  boor_bane: 'LA5132LA0J526JJ',
  hazy_gate: 'LIFF949JBO728GK',
  fervor_tack: 'LIFF8EOJAO72U8U',
  ramble_way: 'LIFF8OI1BO72KC1',
  distant_drag: 'LIFF7T7N9O72TP2',
  languid_line: 'LIFF86N5AO72UVT',
  tumble_rd: 'LIFMNSVS7952M4T',
  chester_way: 'LIFNNHRBJG52QS0',
  naif_lane: 'LIFNL5554G52MHJ',
  rooks_way: 'LIFD6TMU2952RMJ',
  putter_track: 'LIFMR8JU7952PH5',
});

/** onAccepted's switch on pc.location.hubid (default Choru). */
export const HUB_BY_ID = Object.freeze({ 86: 'baqala', 91: 'zhambu', 95: 'xalanga', 90: 'choru' });
export const HUBS = Object.freeze(Object.keys(HINTS));
export const CLUES = 3; // r357 solve_clue num 3
export const DIG_MARGIN = 100; // callback_juju_dig: box +-100 px
export const OPEN_HINT_MS = 1500; // doDig: apiSetTimer('openHint', 1500)
export const CAMP_MS = 5 * 60 * 1000; // questInstanceLocation(..., 5 * 60)

export const TEXT = Object.freeze({
  digHere: 'Seems like this might be a good place to dig…',
  dug: 'You dug around in the dirt.',
  anotherHint: 'You found another Secret Juju Hint!',
  cantDig: "There's nothing to dig up here.",
  noReason: 'You have no reason to go around digging in the dirt.',
  digTip: "Something's buried here. Get digging!",
  exitPrompt: "All done here! Press OK when you're ready to leave.",
  celebrate: 'In the middle of the celebrations, you break down.',
  celebrated: 'On second thought, maybe you should just get this back to the Jujus.',
  celebrateTip: 'Celebrate the peerless craftsmanship of this relic',
  noteReason: "You can't write on this.",
});

/** npc_juju_grandma.js conversations. */
export const GRANDMA = Object.freeze({
  explain_task: [
    { text: "Oh, it's you, er… what's-yer-name. Smelly, was it?", response: "So you're the one after my stuff!" },
    { text: 'It’s a lawless land, this, wild and lawless, and the good Giants help them what help themselves. I won’t apologize for going after your paper.', response: 'Fair enough.' },
    { text: 'We’ve brought you here to propose a mutually beneficial agreement between you and the Juju Bandits. See, something of ours has gone missing, and we need it back.', response: "I'm listening…" },
    { text: 'I tasked my grandsons with hiding our most precious heirloom, the Ancestral Paperweight. Only now they can’t remember where they buried it. They wrote clues to its location, but I can’t for the life of me figure them out.', response: 'So you want me to…?' },
    { text: "Follow the clues. Find the Paperweight. Simple. You’re going to need a trowel for digging, and a clear head for puzzling out clues. It'll be well-hidden, so you'll need to decipher the clues. There'll be nothing so conspicuous as a pile of fresh dirt to look for.", response: 'What do I get out of it?' },
    { text: 'You’ll be richly rewarded, I promise. I’ll tell my boys not to mess with you while you’re out, but really I wouldn’t count on them. Here’s your first clue, and a Juju Trowel for digging in the savanna soil.', response: 'OK.' },
  ],
  explain_again: [{ text: "Are you ready now? You'll need to search the savanna, puzzle out the clues and find the artifact.", response: 'OK' }],
  already_started: [{ text: "Go on. You've got work to do.", response: 'OK' }],
});

/** onCreate kid_convos / grandma_convos; scene state 4 turns angry for these. */
export const KID_LINES = Object.freeze([
  'Grandma, I’ve returned with three whole sheets of paper!',
  'Grandma, I managed to nab this Focusing Orb from an unsuspecting sap.',
  'Grandma, I chased someone around like you said, but they were too fast for me',
  'Grandma, I can’t catch anyone. Why do I have to walk around so slowly?',
  'Grandma, I found this Grilled Cheese Sandwich, and it’s the expensive kind!',
  'Grandma, I brought more paper, but don’t we have enough yet?',
  'Grandma, I nabbed this Walloping Big Diamond.',
  "Grandma, I brought that crafty Glitch who's so good at dodging us!",
]);
export const GRANDMA_LINES = Object.freeze([
  'Three sheets? Your grandfather used to return loaded down with paper, his back bent under the weight of it.',
  'What good are shiny trinkets when you want to write something down? No, paper is the thing, sonny, and lots of it!',
  'Did you remember to threaten them? Why, your grandfather could freeze even the bravest Glitch in their boots with a well-placed threat.',
  'Slow and steady wins the race, as your grandfather always said.',
  'A cheese sandwich? So grandma’s paper soup isn’t good enough for you anymore, you ingrate?',
  'Paper was good enough for your grandfather, and his father before him, so it’s good enough for you. Fewer questions, more paper!',
  'Walloping Big Diamond, you say? Well, maybe we can trade it for some paper.',
  "What? That's not… Can't you kids do anything right?",
]);
export const ANGRY_LINES = Object.freeze([0, 1, 4, 5]);
export const FIRST_LINE = 7;

/** Scene timings (ms) and spots (source x). */
export const SCENE = Object.freeze({
  kidSpawnX: -1050,
  kidStopX: -2304,
  pcTriggerX: -2000,
  walkSpeed: 150, // onContainerChanged: instance npc_walk_speed
  enterMs: 500,
  enterWithWeightMs: 3000,
  spawnToWalkMs: 1000,
  walkMs: 8500,
  waitPcMs: 1000,
  kidLineMs: 4000,
  grandmaLineMs: 6000,
  afterAnswerMs: 4500,
  repeatMinMs: 5000,
  repeatMaxMs: 10000,
  restartMs: 5000,
  escapeMs: 1500,
  giveItemsMs: 250,
});
export const GRANDMA_HIT = Object.freeze({ w: 200, h: 200 }); // apiSetHitBox(200, 200)

/** Pack items (ROOM_ITEMS entries; also passed to give() so they read right before the catalog has them). */
export const ITEMS = Object.freeze({
  juju_trowel: {
    label: 'Juju Trowel',
    namePlural: 'Juju Trowels',
    desc: 'A rustic trowel fashioned by Juju Bandits for delicate digging in the dense savanna dirt.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'no_discovery_dialog', 'quest-item'],
  },
  note_hint: {
    label: 'Secret Juju Hint',
    namePlural: 'Secret Juju Hints',
    desc: 'If you can decipher this clue, it might lead you somewhere interesting.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'no_discovery_dialog', 'quest-item', 'bureaucracy'],
  },
  juju_paperweight: {
    label: 'Ancestral Paperweight',
    namePlural: 'Ancestral Paperweight',
    desc: 'An ancient decorative weight of uncanny beauty and density, this relic is used by the Juju Bandits to secure the bounty of their traditional paper hunts.',
    stackMax: 1,
    baseCost: 0,
    sellable: false,
    donatable: false,
    tags: ['no_rube', 'no_trade', 'no_auction', 'no_vendor', 'no_donate', 'quest-item'],
  },
});

/* ------------------------------------------------------------------ */
/* Hunt rules (pure)                                                   */
/* ------------------------------------------------------------------ */

const pickKey = (obj, rng = Math.random) => {
  const keys = Object.keys(obj);
  return keys[Math.floor(rng() * keys.length) % keys.length];
};

/** onAccepted: the clue hub from the hub you stand in. */
export function hubForStart(hubId) {
  return HUB_BY_ID[String(hubId || '')] || 'choru';
}

/** A fresh hunt (buildHintTable + onAccepted + setUpHintText). */
export function newHunt(hubId, rng = Math.random) {
  const hub = hubForStart(hubId);
  const location = pickKey(HINTS[hub], rng);
  const colors = ['red', 'green', 'yellow']; // npc_juju_bandit onCreate variants
  return {
    hub,
    location,
    used: [hub],
    hint: 0,
    color: colors[Math.floor(rng() * colors.length) % colors.length],
    celebrated: false,
  };
}

/** chooseNextHint + setUpHintText: a street in a hub not used yet. */
export function nextClue(hunt, rng = Math.random) {
  const left = HUBS.filter((h) => !hunt.used.includes(h));
  if (!left.length) return false;
  const hub = left[Math.floor(rng() * left.length) % left.length];
  hunt.hub = hub;
  hunt.location = pickKey(HINTS[hub], rng);
  hunt.used.push(hub);
  return true;
}

export function clueFor(hunt) {
  return HINTS[hunt?.hub]?.[hunt?.location] || null;
}

/** The imported street id (G...) for a hint location. */
export function streetForLocation(location) {
  const t = LOCATION_TSIDS[location];
  return t ? `G${t.slice(1)}` : null;
}

const sameTsid = (a, b) => Boolean(a && b) && String(a).slice(1) === String(b).slice(1);

/** Is this street the current clue's street? */
export function isClueStreet(hunt, tsid) {
  return Boolean(hunt && LOCATION_TSIDS[hunt.location] && sameTsid(LOCATION_TSIDS[hunt.location], tsid));
}

/** The street's `juju_dig` box (screen space, bottom-centre x, y, w, h). */
export function digBox(street) {
  return (street?.boxes || []).find((b) => b.id === 'juju_dig') || null;
}

/** callback_juju_dig: the dig range once you have walked into the box. */
export function digRange(box) {
  if (!box) return null;
  return { left: box.x - box.w / 2 - DIG_MARGIN, right: box.x + box.w / 2 + DIG_MARGIN };
}

/**
 * Inside the box. Imported boxes are bottom-centre, but several dig boxes sit
 * a few px above their floor (Dust Path 1A: box 900, floor 907; Tumble Rd 5:
 * 650 over 657-675), as a centred source hit box would; accept the lower half
 * too so every clue street arms.
 */
export function inDigBox(box, x, y) {
  return Boolean(box) && Math.abs(x - box.x) <= box.w / 2 && y <= box.y + box.h / 2 && y >= box.y - box.h;
}

/** canDig: armed on this street, inside the range, no Paperweight yet. */
export function canDig({ armed, x, hasPaperweight }) {
  if (hasPaperweight || !armed) return false;
  return x > armed.left && x < armed.right;
}

/** doDig's branch: 'next' (another hint) or 'paperweight' (the third clue). */
export function digOutcome(hint) {
  return hint <= CLUES - 1 ? 'next' : 'paperweight';
}

/* ------------------------------------------------------------------ */
/* Camp geometry                                                       */
/* ------------------------------------------------------------------ */

export const BOUNDS = Object.freeze({ l: -3000, r: -100, t: -700, b: 0 });
const W = BOUNDS.r - BOUNDS.l;
const H = BOUNDS.b - BOUNDS.t;
export const sx = (x) => x - BOUNDS.l;
export const sy = (y) => y - BOUNDS.t;
export const FLOOR_Y = -90; // the spawn (-98) lands on it
export const SPAWN = Object.freeze({ x: -839, y: -98 });
export const GRANDMA_X = -2450;

export function campPlatforms(kit) {
  return [kit.plat(0, sy(FLOOR_Y), W, sy(FLOOR_Y), 'invisible', { id: 'jc_floor' })];
}

/* ------------------------------------------------------------------ */
/* Sprites                                                             */
/* ------------------------------------------------------------------ */

const GRANDMA_SHEETS = { idle: [7, 11, 72], talk: [7, 10, 67], angry: [7, 19, 126] };
const KID_SHEETS = { spawn: [4, 6, 23], walk: [4, 4, 16], walk_end: [4, 4, 16], shrink: [4, 6, 21] };

/** An AnimatedSprite that swaps between recovered sheets by state name. */
function npcView(ctx, urlFor, sheets, opts) {
  const { PIXI, kit } = ctx;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(opts.ax, opts.ay);
  spr.animationSpeed = 0.5; // 30 fps
  const cache = {};
  spr.setState = (name, { loop = true, hold = false } = {}) => {
    const [cols, rows, count] = sheets[name];
    const sheet = (cache[name] ||= kit.sheetFrames(PIXI, urlFor(name), cols, rows, count));
    spr.state = name;
    const apply = () => {
      if (spr.destroyed || spr.state !== name || !sheet.frames.length) return;
      spr.textures = sheet.frames;
      spr.loop = loop;
      if (hold) spr.gotoAndStop(sheet.frames.length - 1);
      else spr.gotoAndPlay(0);
    };
    if (sheet.frames.length) apply();
    else onLoaded(sheet.base, () => setTimeout(apply, 0));
  };
  return spr;
}

/** An invisible hit/label proxy so bubbles sit on the body, not the 254 px frame. */
function proxy(ctx, w, h) {
  const { PIXI } = ctx;
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.rect(-w / 2, -h, w, h).fill({ color: 0xffffff, alpha: 0.001 });
  c.addChild(g);
  return c;
}

/* ------------------------------------------------------------------ */
/* Grandma and the kid                                                 */
/* ------------------------------------------------------------------ */

const hunt = (ctx) => ctx.memory('hunt');
const busy = (ctx) => Boolean(ctx.dialogOpen() || ctx.cardOpen() || ctx.engine.questDialogueOpen?.() || ctx.engine.acting?.() || noteOpen());
let noteMod = null;
const noteOpen = () => Boolean(noteMod?.noteViewOpen?.());

async function openHint(engineLike, h) {
  const clue = clueFor(h);
  if (!clue || typeof document === 'undefined') return;
  noteMod ||= await import('../note-view.js?v=g463-1');
  noteMod.openNoteView({ kicker: 'Secret Juju Hint', title: clue.title, body: clue.text, reason: TEXT.noteReason });
  engineLike.setData?.('jujuNote', clue.title);
}

function schedule(ctx, state, ms) {
  ctx.data.scene = { state, at: Date.now() + ms };
}

function grandmaState(ctx, name) {
  ctx.data.grandma?.setState(name);
  ctx.data.grandmaMood = name;
}

function spawnKid(ctx) {
  const color = hunt(ctx).color || 'red';
  const view = npcView(ctx, (s) => `${ART}bandit_${color}_${s}.png`, KID_SHEETS, { ax: 148 / 240, ay: 185 / 254 });
  view.x = sx(SCENE.kidSpawnX);
  view.y = sy(FLOOR_Y);
  view.scale.x = -1; // dir = 'left'
  ctx.add(view, 31);
  view.setState('spawn', { loop: false });
  const hit = proxy(ctx, 56, 80);
  hit.x = view.x;
  hit.y = view.y;
  const target = ctx.register({ classId: 'npc_juju_bandit', label: 'Juju Bandit', subtitle: 'One of Grandma’s grandsons', sprite: hit });
  ctx.sound('JUJU_BANDIT_SPAWN', { volume: 0.5 });
  ctx.data.kid = { view, hit, target, x: view.x, walkTo: null };
}

function kidSay(ctx, text, ms) {
  const kid = ctx.data.kid;
  if (kid) ctx.say(kid.target, text, ms);
  ctx.data.lastKidLine = text;
}

/** escape(): shrink, then gone after 1.5 s. */
function kidEscape(ctx) {
  const kid = ctx.data.kid;
  if (!kid) return;
  ctx.data.kid = null;
  kid.walkTo = null;
  kid.view.setState('shrink', { loop: false });
  ctx.sound('JUJU_BANDIT_SHRINK', { volume: 0.5 });
  try { ctx.unregister(kid.target); } catch { /* gone */ }
  setTimeout(() => {
    for (const obj of [kid.view, kid.hit]) {
      if (obj && !obj.destroyed) {
        obj.parent?.removeChild(obj);
        obj.destroy({ children: true });
      }
    }
  }, SCENE.escapeMs);
}

/** jujuBanditScene(state). */
function sceneStep(ctx, state) {
  ctx.data.scene = null;
  const p = ctx.player;
  switch (state) {
    case 0:
      if (ctx.data.kid) return schedule(ctx, 0, 1000);
      spawnKid(ctx);
      return schedule(ctx, 1, SCENE.spawnToWalkMs);
    case 1: {
      const kid = ctx.data.kid;
      if (!kid) return undefined;
      kid.walkTo = sx(SCENE.kidStopX);
      kid.view.setState('walk');
      return schedule(ctx, 2, SCENE.walkMs);
    }
    case 2:
      if (!p || p.x > sx(SCENE.pcTriggerX)) return schedule(ctx, 2, SCENE.waitPcMs);
      if (ctx.data.doneFirstConvo) {
        ctx.data.convo = Math.floor(Math.random() * 7); // randInt(0, 6)
        kidSay(ctx, KID_LINES[ctx.data.convo], SCENE.kidLineMs);
        return schedule(ctx, 3, SCENE.kidLineMs);
      }
      ctx.data.convo = FIRST_LINE;
      kidSay(ctx, KID_LINES[FIRST_LINE], SCENE.kidLineMs);
      return schedule(ctx, 5, SCENE.kidLineMs);
    case 3:
      grandmaState(ctx, 'talk');
      ctx.say(ctx.data.grandmaTarget, GRANDMA_LINES[ctx.data.convo], SCENE.grandmaLineMs);
      ctx.data.lastGrandmaLine = GRANDMA_LINES[ctx.data.convo];
      return schedule(ctx, 4, SCENE.grandmaLineMs);
    case 4:
      grandmaState(ctx, ANGRY_LINES.includes(ctx.data.convo) ? 'angry' : 'idle');
      ctx.data.kid?.view.setState('walk_end', { loop: false, hold: true }); // idle2
      return schedule(ctx, 5, SCENE.afterAnswerMs);
    case 5:
      if (!ctx.data.talking) {
        grandmaState(ctx, 'idle');
        schedule(ctx, 0, SCENE.repeatMinMs + Math.random() * (SCENE.repeatMaxMs - SCENE.repeatMinMs));
      }
      kidEscape(ctx);
      ctx.data.doneFirstConvo = true;
      ctx.data.scenes = (ctx.data.scenes || 0) + 1;
      return undefined;
    default:
      return undefined;
  }
}

function stepKid(ctx, dtMs) {
  const kid = ctx.data.kid;
  if (!kid || kid.walkTo == null) return;
  const step = (SCENE.walkSpeed * dtMs) / 1000;
  const dx = kid.walkTo - kid.x;
  if (Math.abs(dx) <= step) {
    kid.x = kid.walkTo;
    kid.walkTo = null;
    kid.view.setState('walk_end', { loop: false });
  } else kid.x += Math.sign(dx) * step;
  kid.view.x = kid.x;
  kid.hit.x = kid.x;
}

/** giveItems: trowel, first hint (read now), exit prompt, scene in 5 s. */
async function giveItems(ctx) {
  if (ctx.data.givenItems) return;
  const h = hunt(ctx);
  ctx.give('juju_trowel', 1, ITEMS.juju_trowel);
  ctx.give('note_hint', 1, ITEMS.note_hint);
  h.hint = 1;
  ctx.data.givenItems = true;
  ctx.engine.save?.();
  ctx.solve(); // the quest now survives leaving (onExitLocation checks current_hint)
  grandmaState(ctx, 'idle');
  schedule(ctx, 0, SCENE.restartMs);
  await openHint(ctx, h);
  while (noteOpen()) await ctx.wait(200);
  if (!ctx.run) return;
  const answer = await ctx.converse({
    title: 'Juju Hideout',
    kicker: ctx.def?.title || 'Carry That Weight',
    text: TEXT.exitPrompt,
    choices: [{ label: 'OK', value: 'ok' }, { label: 'Not yet', value: 'stay' }],
  });
  if (answer === 'ok' && ctx.run) ctx.leave({ transition: ctx.fx() });
}

/** Part II: onPlayerCollision with the Paperweight. */
async function returnWeight(ctx) {
  if (ctx.data.returned) return;
  ctx.data.returned = true;
  ctx.take('juju_paperweight', 1);
  ctx.take('juju_trowel', 1);
  ctx.progress('return_weight');
  ctx.solve();
  ctx.data.givingOutQuest = true;
  await ctx.turnIn();
  ctx.data.talking = false;
  // onComplete_custom: instances_left.
  if (ctx.run) ctx.leave({ transition: ctx.fx() });
}

/** onPlayerCollision (and Talk to). */
async function bumpGrandma(ctx) {
  if (ctx.data.talking) return;
  if (ctx.data.doneFirstConvo) {
    ctx.data.scene = null;
    kidEscape(ctx);
  }
  ctx.data.talking = true;
  ctx.data.bumps = (ctx.data.bumps || 0) + 1;
  try {
    if (ctx.questId === Q2 && (ctx.count('juju_paperweight') > 0 || ctx.data.givingOutQuest)) {
      await returnWeight(ctx);
      return;
    }
    const talk = (beats) => ctx.converse({ title: 'Juju Grandma', kicker: 'Juju Hideout', beats: beats.map((b) => ({ ...b })) });
    if (ctx.data.collided) {
      if (ctx.data.givenItems) {
        await talk(GRANDMA.already_started);
        grandmaState(ctx, 'idle');
        schedule(ctx, 0, SCENE.restartMs);
      } else {
        await talk(GRANDMA.explain_again);
        await ctx.wait(SCENE.giveItemsMs);
        ctx.data.talking = false;
        await giveItems(ctx);
      }
    } else {
      ctx.data.collided = true;
      await talk(GRANDMA.explain_task);
      await ctx.wait(SCENE.giveItemsMs);
      ctx.data.talking = false;
      await giveItems(ctx);
    }
  } finally {
    ctx.data.talking = false;
  }
}

function nearGrandma(ctx) {
  const p = ctx.player;
  if (!p) return false;
  const gx = sx(GRANDMA_X);
  const gy = sy(FLOOR_Y);
  return Math.abs(p.x - gx) <= GRANDMA_HIT.w / 2 && p.y <= gy + 10 && p.y >= gy - GRANDMA_HIT.h;
}

/* ------------------------------------------------------------------ */
/* Scene art                                                           */
/* ------------------------------------------------------------------ */

/**
 * The hideout at dusk, as all four players' Snaps show it (research/wayback/raw/snaps/
 * help_juju_bandits/, reference only; colours sampled from them): a mauve to pink-brown sky
 * with a peach glow low down, dark acacias and scrub, olive dirt, two canvas teepees either
 * side of Grandma, her tall wooden chair beside stacks of paper, the campfire on her right and
 * a dirt mound with stones in front.
 */
export const JUJU_DUSK = Object.freeze({
  sky: [[0, '#6e5048'], [0.3, '#866252'], [0.55, '#a87c66'], [0.78, '#c28e69'], [1, '#8a6a48']],
  cloud: 0xb48a74,
  farTree: 0x3a3418,
  bush: 0x4c5226,
  ground: 0x685a29,
  groundTop: 0x4a4a1e,
  groundSpot: 0x564a20,
  tree: 0x7e7a5a,
  tent: 0xcabca4,
  grass: 0x8a8460,
});
/** Camp pieces at hideout x: [deco, x, dy, scale, flip]. Grandma sits at GRANDMA_X. */
export const CAMP_PIECES = Object.freeze([
  ['juju_grandma_tent_01a_al1', -2700, 10, 0.55, true],
  ['juju_grandma_tent_01a_al1', -1960, 10, 0.56, false],
  ['juju_grandma_papers_01a_al1', -2585, 6, 0.5, false],
  ['juju_grandma_papers_01b_al1', -2630, 5, 0.55, false],
  ['juju_grandma_papers_01c_al1', -2380, 3, 0.6, false],
  ['juju_grandma_campfire_01a_al1', -2215, 18, 0.62, false],
  ['juju_grandma_papers_01c_al1', -1180, 3, 0.6, true],
]);
/** The dirt mound in front of the fire, with stones round its foot. */
/** In front of the walkway, low in the frame as in the Snaps. */
export const CAMP_MOUND = Object.freeze({ x: -2060, dy: 112, scale: 0.62 });

function buildBackground(ctx) {
  const { PIXI, kit } = ctx;
  const P = JUJU_DUSK;
  const root = kit.sceneRoot(PIXI, W, H);
  const floor = sy(FLOOR_Y);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, P.sky, 960, 640));
  const far = root.layer(0.25, 1);
  // Long thin dusk clouds (the Snaps' pale streaks).
  for (let i = 0; i < 5; i++) far.addChild(kit.deco(PIXI, i % 2 ? 'cloud_fluffy_2' : 'cloud_fluffy_1', 120 + i * 420, 150 + (i % 3) * 40, { scale: 0.5, sy: 0.22, tint: P.cloud, alpha: 0.55 }));
  for (let i = 0; i < 6; i++) {
    far.addChild(kit.deco(PIXI, `tree_acacia_${(i % 4) + 1}`, 80 + i * 380, floor - 40, { scale: 0.32 + (i % 3) * 0.05, tint: P.farTree, alpha: 0.9 }));
  }
  const mid = root.layer(0.6, 2);
  for (let i = 0; i < 9; i++) {
    mid.addChild(kit.deco(PIXI, i % 3 ? 'heights_bush_4' : 'heights_bush_2', 60 + i * 330, floor - 6, { scale: 0.42, tint: P.bush, alpha: 0.95, flip: i % 2 === 1 }));
  }
  const world = root.layer(1, 3);
  const g = new PIXI.Graphics();
  g.rect(0, floor, W, H - floor + 400).fill(P.ground);
  g.rect(0, floor - 4, W, 12).fill(P.groundTop);
  for (let x = 40; x < W; x += 170) g.ellipse(x + (x % 7) * 9, floor + 34 + (x % 3) * 12, 46, 6);
  g.fill({ color: P.groundSpot, alpha: 0.7 });
  world.addChild(g);
  // Big acacias first, behind the camp, darkened for dusk.
  world.addChild(kit.deco(PIXI, 'tree_acacia_2', sx(-2860), floor + 6, { scale: 0.62, tint: P.tree }));
  world.addChild(kit.deco(PIXI, 'tree_acacia_3', sx(-1520), floor + 6, { scale: 0.55, flip: true, tint: P.tree }));
  world.addChild(kit.deco(PIXI, 'tree_acacia_1', sx(-420), floor + 6, { scale: 0.58, tint: P.tree }));
  world.addChild(kit.deco(PIXI, 'heights_bush_4', sx(-2960), floor + 4, { scale: 0.5, tint: P.bush }));
  // Low scrub and pampas behind the camp (the Snaps show tufts, not a wall of grass).
  for (let i = 0; i < 18; i++) {
    const x = 70 + i * 165 + (i % 4) * 23;
    world.addChild(kit.deco(PIXI, i % 3 ? 'lens_grass_1' : 'pampas_1', x, floor + 8, { scale: i % 3 ? 0.22 : 0.3, flip: i % 2 === 0, tint: P.grass }));
  }
  // The hideout's own decos: two teepees, the papers, the campfire and Grandma's chair.
  for (const [name, x, dy, scale, flip] of CAMP_PIECES) {
    const tint = name.includes('tent') ? P.tent : name.includes('papers') ? 0xe0d8cc : undefined;
    world.addChild(kit.deco(PIXI, name, sx(x), floor + dy, { scale, flip, tint }));
  }
  const [chairFile] = JUJU_CAMP_FILES.juju_grandma_chair_01a_al1;
  const chair = new PIXI.Sprite(textureFromUrl(`${ART}${chairFile}`));
  chair.anchor.set(0.5, 1);
  chair.x = sx(GRANDMA_X) - 14;
  chair.y = floor + 8;
  chair.tint = 0xd8ccb8;
  world.addChild(chair);
  // The dirt mound and its stones.
  const my = floor + CAMP_MOUND.dy;
  world.addChild(kit.deco(PIXI, 'rock_rubble_01a_al1', sx(CAMP_MOUND.x) - 100, my - 2, { scale: 0.14, tint: 0x7a7266 }));
  world.addChild(kit.deco(PIXI, 'mound_dirt_2', sx(CAMP_MOUND.x), my, { scale: CAMP_MOUND.scale, tint: 0x6a5844 }));
  world.addChild(kit.deco(PIXI, 'rock_rubble_01a_al1', sx(CAMP_MOUND.x) + 110, my + 2, { scale: 0.13, tint: 0x7a7266, flip: true }));
  return root;
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export const room = {
  id: ROOM_ID,
  title: 'Juju Hideout',
  kicker: 'Secret Juju Bandit Hideout',
  icon: 'assets/sprites/icons/juju_paperweight.png',
  theme: 'warm',
  hubName: 'Secret Juju Bandit Hideout',
  durationMs: CAMP_MS,
  leaveText: 'Leave the hideout? Grandma has not given you anything yet, so you would have to start over.',
  travelText: 'The Juju Bandits are watching the paths. Use Leave to go back.',
  doneLabel: 'Leave',

  start(ctx) {
    const h = ctx.memory('hunt');
    // onAccepted: a new hunt from where you stand; a hunt in progress carries on.
    if (ctx.questId === Q1 && (!h.hub || (h.hint > 0 && ctx.count('juju_trowel') === 0))) {
      Object.keys(h).forEach((k) => delete h[k]);
      Object.assign(h, newHunt(ctx.engine.street?.hubId));
    }
    if (!h.color) h.color = newHunt('').color;
  },

  build(ctx) {
    return {
      label: 'Juju Hideout',
      hubName: 'Secret Juju Bandit Hideout',
      width: W,
      height: H,
      background: buildBackground(ctx),
      platforms: campPlatforms(ctx.kit),
      spawn: { x: sx(SPAWN.x), y: sy(SPAWN.y) },
    };
  },

  enter(ctx) {
    const { PIXI } = ctx;
    void PIXI;
    ctx.data.scene = null;
    ctx.data.kid = null;
    ctx.data.talking = false;
    ctx.data.wasNear = false;
    // Items already given on an earlier visit (a retry after a reload).
    ctx.data.givenItems = ctx.questId === Q1 && hunt(ctx).hint > 0 && ctx.count('juju_trowel') > 0;
    if (ctx.data.givenItems) {
      ctx.data.collided = true;
      ctx.solve();
    }
    const view = npcView(ctx, (s) => `${ART}grandma_${s}.png`, GRANDMA_SHEETS, { ax: 0.38, ay: 1 });
    view.x = sx(GRANDMA_X);
    view.y = sy(FLOOR_Y) + 4;
    ctx.add(view, 30);
    view.setState('idle');
    ctx.data.grandma = view;
    const hit = proxy(ctx, 110, 128);
    hit.x = view.x;
    hit.y = view.y;
    ctx.data.grandmaTarget = ctx.register({ classId: 'npc_juju_grandma', label: 'Juju Grandma', subtitle: 'The meanest of the Juju band', sprite: hit });
    // onPlayerEnter.
    if (ctx.count('juju_paperweight') > 0) {
      ctx.data.doneFirstConvo = true;
      schedule(ctx, 0, SCENE.enterWithWeightMs);
    } else schedule(ctx, 0, SCENE.enterMs);
  },

  verbs(ctx, target) {
    if (target === ctx.data.grandmaTarget) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !ctx.data.talking, tooltip: 'Bump into her, or click' }];
    }
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target === ctx.data.grandmaTarget && verbId === 'talk_to') {
      bumpGrandma(ctx);
      return true;
    }
    return false;
  },

  tick(ctx, dtMs) {
    const now = Date.now();
    if (ctx.data.scene && now >= ctx.data.scene.at) sceneStep(ctx, ctx.data.scene.state);
    stepKid(ctx, Math.min(100, dtMs || 16));
    const near = nearGrandma(ctx);
    if (near && !ctx.data.wasNear && !ctx.data.talking && !busy(ctx)) bumpGrandma(ctx);
    ctx.data.wasNear = near;
    // A solved camp still closes when the instance time runs out.
    if (ctx.run?.status === 'solved' && ctx.remaining() <= 0 && !ctx.data.closing) {
      ctx.data.closing = true;
      ctx.leave({ transition: ctx.fx() });
    }
  },

  objective(ctx) {
    const h = hunt(ctx);
    if (ctx.questId === Q2) {
      return { text: ctx.data.returned ? 'Nice doing business with you.' : 'Return the Ancestral Paperweight to Juju Grandma.', stats: [['paperweight', ctx.count('juju_paperweight') ? 'in pack' : 'returned']] };
    }
    const text = ctx.data.givenItems ? TEXT.exitPrompt : 'Find the Juju Grandma at the back of the camp.';
    return { text, stats: [['clues', `${Math.max(0, (h.hint || 0) - 1)}/${CLUES}`]] };
  },

  onLeave(ctx, outcome) {
    const kid = ctx.data.kid;
    if (kid) kidEscape(ctx);
    ctx.data.scene = null;
    if (ctx.questId === Q1) {
      // onExitLocation: leaving before the first hint fails the quest.
      if (ctx.data.givenItems) return { keepQuest: true, leaveFlag: false, noTurnIn: true };
      return {};
    }
    return outcome === 'complete' ? { leaveFlag: false } : {};
  },

  publish(ctx) {
    const h = hunt(ctx);
    ctx.setData('jujuHub', h.hub || '');
    ctx.setData('jujuLocation', h.location || '');
    ctx.setData('jujuHint', String(h.hint || 0));
    ctx.setData('jujuGiven', ctx.data.givenItems ? '1' : '0');
    ctx.setData('jujuScene', ctx.data.scene ? String(ctx.data.scene.state) : '');
    ctx.setData('jujuScenes', String(ctx.data.scenes || 0));
    ctx.setData('jujuKid', ctx.data.kid ? `${Math.round(ctx.data.kid.x)}` : '');
    ctx.setData('jujuKidLine', ctx.data.lastKidLine || '');
    ctx.setData('jujuGrandma', ctx.data.grandmaMood || 'idle');
    ctx.setData('jujuBumps', String(ctx.data.bumps || 0));
    ctx.setData('jujuReturned', ctx.data.returned ? '1' : '0');
  },

  /**
   * QA. 'items': talk to Grandma (placing the avatar beside her) and leave
   * with the trowel. 'full': then dig all three clues on their streets and
   * return the Paperweight (Part II). 'scene': wait for the first kid scene.
   */
  async autoplay(ctx, mode) {
    await ctx.wait(800);
    if (mode === 'qa' && typeof window !== 'undefined') {
      // Real-input QA (tests drive keys and clicks): only travel is scripted.
      const engine = ctx.engine;
      window.jujuQA = {
        go: (tsid, x, y) => engine.enter(tsid, { spawnX: x, spawnY: y, quiet: true, bypassFeatureGates: true, useTransition: false }),
        box: () => digBox(engine.street),
        street: () => engine.streetTsid,
      };
      return 'qa';
    }
    if (mode === 'scene') {
      ctx.place(sx(-1900), sy(FLOOR_Y) - 10);
      for (let t = 0; t < 200 && !(ctx.data.scenes > 0); t++) await ctx.wait(100);
      return `scene:${ctx.data.scenes || 0}`;
    }
    const engine = ctx.engine;
    ctx.place(sx(GRANDMA_X) + 60, sy(FLOOR_Y) - 10);
    for (let t = 0; t < 40 && !ctx.dialogOpen(); t++) await ctx.wait(100);
    for (let t = 0; t < 30 && ctx.dialogOpen(); t++) {
      ctx.advanceDialog();
      await ctx.wait(250);
    }
    for (let t = 0; t < 40 && !noteOpen(); t++) await ctx.wait(100);
    await ctx.wait(600);
    noteMod?.closeNoteView();
    for (let t = 0; t < 30 && !ctx.dialogOpen(); t++) await ctx.wait(100);
    if (mode === 'items') {
      ctx.advanceDialog();
      return 'items';
    }
    ctx.advanceDialog();
    for (let t = 0; t < 60 && engine.inScene?.(); t++) await ctx.wait(100);
    await ctx.wait(1500);
    const out = await huntAutoplay(engine);
    return out;
  },

  /* ---------------------------------------------------------------- */
  /* The hunt on ordinary streets                                     */
  /* ---------------------------------------------------------------- */

  world: {
    onStreetEnter(w, street) {
      lastWorld = w;
      // onEnterLocation / onExitLocation: a new street drops the armed range.
      w.data.juju = { tsid: street?.tsid || w.engine.streetTsid || '', armed: null, inside: false };
      publishHunt(w);
    },

    onTick(w) {
      lastWorld = w;
      const st = (w.data.juju ||= { tsid: w.engine.streetTsid, armed: null, inside: false });
      if (st.tsid !== w.engine.streetTsid) Object.assign(st, { tsid: w.engine.streetTsid, armed: null, inside: false });
      if (!w.questActive(Q1)) return;
      const h = w.questMemory(HUNT_KEY);
      const p = w.engine.player;
      if (!p || !h.hint || !isClueStreet(h, st.tsid)) return;
      const box = digBox(w.engine.street);
      const inside = inDigBox(box, p.x, p.y);
      // callback_juju_dig fires on entering the box.
      if (inside && !st.inside && w.count('juju_paperweight') === 0) {
        w.activity(TEXT.digHere);
        st.armed = digRange(box);
        publishHunt(w);
      }
      st.inside = inside;
    },

    packVerbs(w, cls) {
      if (cls === 'juju_trowel') {
        const active = w.questActive(Q1);
        const ok = active && canDig({ armed: w.data.juju?.armed, x: w.engine.player?.x || 0, hasPaperweight: w.count('juju_paperweight') > 0 })
          && isClueStreet(w.questMemory(HUNT_KEY), w.engine.streetTsid);
        return [{ id: 'dig', label: 'Dig', primary: true, enabled: ok, reason: active ? TEXT.cantDig : TEXT.noReason, tooltip: TEXT.digTip }];
      }
      if (cls === 'note_hint') {
        const clue = clueFor(w.questMemory(HUNT_KEY));
        return [{ id: 'read', label: 'Read', primary: true, enabled: Boolean(clue), reason: 'It is blank :(', tooltip: 'What does it say?' }];
      }
      if (cls === 'juju_paperweight') {
        const done = w.questMemory(HUNT_KEY).celebrated;
        return [{ id: 'celebrate', label: 'Celebrate', enabled: !done, reason: TEXT.celebrated, tooltip: TEXT.celebrateTip }];
      }
      return [];
    },

    runPackVerb(w, cls, verb) {
      if (cls === 'juju_trowel' && verb === 'dig') {
        doDig(w);
        return true;
      }
      if (cls === 'note_hint' && verb === 'read') {
        openHint(w, w.questMemory(HUNT_KEY));
        return true;
      }
      if (cls === 'juju_paperweight' && verb === 'celebrate') {
        celebrate(w);
        return true;
      }
      return false;
    },
  },
};

let lastWorld = null;

function publishHunt(w) {
  const h = w.questMemory(HUNT_KEY);
  w.setData('jujuHub', h.hub || '');
  w.setData('jujuLocation', h.location || '');
  w.setData('jujuStreet', streetForLocation(h.location) || '');
  w.setData('jujuHint', String(h.hint || 0));
  w.setData('jujuArmed', w.data.juju?.armed ? '1' : '0');
}

/** doDig. */
async function doDig(w) {
  if (w.count('juju_paperweight') > 0) return false;
  const h = w.questMemory(HUNT_KEY);
  w.activity(TEXT.dug);
  w.sound('SHOVEL', { volume: 0.5 });
  w.take('note_hint', 1);
  w.progressQuest(Q1, 'solve_clue', 1);
  if (w.data.juju) w.data.juju.armed = null;
  const outcome = digOutcome(h.hint);
  if (outcome === 'next') {
    nextClue(h);
    w.give('note_hint', 1, ITEMS.note_hint);
    h.hint += 1;
    w.activity(TEXT.anotherHint);
    publishHunt(w);
    w.save();
    setTimeout(() => openHint(w, h), OPEN_HINT_MS);
    return true;
  }
  w.give('juju_paperweight', 1, ITEMS.juju_paperweight);
  h.hint = CLUES + 1;
  h.found = Date.now();
  publishHunt(w);
  w.save();
  // Complete now (familiar turn-in), then onComplete_custom offers Part II.
  await w.turnInQuest(Q1);
  const yes = await w.offerQuest(Q2, { kicker: 'Carry That Weight' });
  if (yes) await w.startInstance(Q2);
  return true;
}

function celebrate(w) {
  const h = w.questMemory(HUNT_KEY);
  if (h.celebrated) return;
  h.celebrated = true;
  const pc = w.engine.pc;
  // juju_paperweight.js 58: metabolics_lose_mood(2) (G300: nothing while dead).
  const lost = pc ? loseMood(pc, 2) : 0;
  w.activity(`You celebrated. ${TEXT.celebrate}`);
  const p = w.engine.player;
  if (p && lost > 0) w.floatText(p.x, p.y - 90, `-${lost} mood`, '#ffd0c4');
  w.engine.updateHud?.();
  w.save();
}

/** QA: walk the three clue streets as a player would (travel, step in the box, dig). */
async function huntAutoplay(engine) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let t = 0; t < 50 && !lastWorld; t++) await wait(100);
  const w = lastWorld;
  if (!w) return 'no-world';
  const log = [];
  for (let i = 0; i < CLUES; i++) {
    const h = w.questMemory(HUNT_KEY);
    const tsid = streetForLocation(h.location);
    log.push(h.location);
    await engine.enter(tsid, { quiet: true, bypassFeatureGates: true, useTransition: false });
    await wait(1200);
    const box = digBox(engine.street);
    if (!box) return `no-box:${h.location}`;
    w.place(box.x, box.y - 40);
    for (let t = 0; t < 40 && !w.data.juju?.armed; t++) await wait(100);
    if (!w.data.juju?.armed) return `not-armed:${h.location}`;
    const run = doDig(w);
    if (i < CLUES - 1) {
      await run;
      await wait(OPEN_HINT_MS + 600);
      noteMod?.closeNoteView();
    } else {
      // Paperweight: the turn-in award, then the Part II offer.
      for (let t = 0; t < 60; t++) {
        await wait(250);
        if (w.advanceAward()) break;
      }
      for (let t = 0; t < 40 && !w.dialogOpen(); t++) await wait(100);
      for (let t = 0; t < 20 && w.dialogOpen(); t++) {
        w.advanceDialog();
        await wait(250);
      }
      await run;
    }
  }
  engine.setData('jujuHuntLog', log.join(','));
  return `hunted:${log.join(',')}`;
}
