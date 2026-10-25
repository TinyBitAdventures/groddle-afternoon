/**
 * Gwendolyn's Task (quests/tower_quest.js, tower_quest_part2.js,
 * tower_quest_part3.js, tower_quest_part3repeat.js): the vision quest that
 * teaches "a measure of mastery over your own mind".
 *
 * Source chain (each onAccepted runs instances_create_delayed with
 * exit_delay 2 * 60 and no_auto_return):
 *  - tower_quest -> Area 42 (instance tower_quest_desert, template
 *    LCR8MP0IJI1299U, enter -2077,-105). locations/location.js applies the
 *    its_so_hot buff on entry; items/npc_cactus.js rants on collision, then
 *    spawns a squidBlue npc_squid; items/npc_squid.js doDesert is a
 *    29-state script (swoonerflies fall, its_so_hot2, "Follow me...", the
 *    purple cooling_down and looping blue its_cool flashes) that ends in
 *    offerQuests: tower_quest turns in at the squid (end_npcs) and part 2 is
 *    offered.
 *  - tower_quest_part2 -> The Outer Mind (tower_quest_headspace,
 *    LCR8MQ9JJI12IIK, -911,-410). Three collision boxes: the four-page
 *    innermind_vog_interrupt, make_squid_appear (the squid waits bamfed out
 *    at -543,-950) and end_squiddy_convo; Zzybzfrx turns part 2 in and offers
 *    part 3 (part3repeat on a paid repeat).
 *  - tower_quest_part3 -> The Inner Mind (tower_quest_crystine,
 *    LCR8MRAKJI12UOP, -1924,-143); its crystine_across box opens Gwendolyn's
 *    Chamber (tower_quest_chamber, LCR8MSVKJI12BOU, -408,-163, no exit
 *    delay), where npc_gwendolyn turns part 3 in (1100 xp, 100 mood, 11
 *    Cosma favor, a Random Kindness) and gwendolyn_chamber_exit teleports to
 *    Corridor Five (LTJ10M515812V0C, 102,-534).
 *  - Entering any other location before part 3 is done fails the whole chain
 *    (location.js onPlayerEnter), back to tower_quest.
 *  - exit_delay is not a timer: instances_show_exit_prompt asks "Are you
 *    stuck? Do you want to leave this place?" every 2 minutes; the cactus
 *    and squid collisions push it back.
 *
 * What survives: Area 42 itself (the instantiated copy LHF8DDDBTPF3P4U,
 * geometry GHF8DDDBTPF3P4U, is an imported street), every line of dialogue
 * and timing, and the NPC art (OGA npc_cactus, npc_squid squidBlue and
 * squidPurple, npc_gwendolyn, npc_butterfly rooked frames for the
 * swoonerflies, whose own SWF is a recoloured butterfly). The cactus's spot
 * is lost (its objref carries no x/y); it stands by the trailer, where the
 * three reference recordings (V51lCz1q0qI, 01_XPTF2lZ0, 89tShFGl3uc) show
 * it. The Outer Mind, The Inner Mind and the Chamber are lost and rebuilt
 * from those recordings: a head floating in space with a sunburst brain,
 * eyeballs and pink tube paths over a checkered floor (clean vector); a white
 * void of glossy shards, jellies, glass domes and glass stairs with mood and
 * energy quoins, a Gurly Drink and the EXIT arrow, matched to its five player
 * Snaps and drawn with the tower_quest set's own CC0 arbito1.swf decos
 * (G71, tools/room-art set gwendolyn_inner_mind); a dark grove of round grey
 * trees (clean vector).
 *
 * Meditation: the step into your own head reuses the Focusing Orb's
 * recovered tool animation and the meditation halo palette
 * (js/meditation.js), and the two mind scenes play the recovered meditation
 * tracks (MEDITATION_MUSIC) over the ducked street music.
 *
 * Room 23 (the tower_quest instance behind Corridor Five's key 5 door) is
 * where the chain starts: Greeterbot Sentry G-42 greets you and the Ghost of
 * Gwendolyn offers tower_quest there (js/gwendolyn-room-23.js,
 * features/gwendolyn-room-23-feature.js; catalog OFFER_OVERRIDES routes the
 * offer to npc_gwendolyn). After a failed run the quest stays in the log and
 * quest-instances' retry prompt takes you back to Area 42.
 *
 * Remake notes: the buffs are drawn by the room (red
 * flashes, "So hot! -3 mood!") rather than added to the buff bar, since
 * they end with the room.
 */

import { acceptOffer, ensureQuestOfferState } from '../quest-offers.js';
import { MEDITATION_MUSIC, ORB_TOOL_SHEET } from '../meditation.js';
import { gainMetabolic, loseMood } from '../metabolics.js';
import { frameTexture, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g311-1';
import { GWENDOLYN_INNER_FILES } from './gwendolyn-inner-art.js';

export const ROOM_ID = 'gwendolyn';
const ART = `assets/sprites/quest-rooms/${ROOM_ID}/`;

export const TASK = 'tower_quest';
export const PART2 = 'tower_quest_part2';
export const PART3 = 'tower_quest_part3';
export const PART3_REPEAT = 'tower_quest_part3repeat';
export const CHAIN = Object.freeze([TASK, PART2, PART3, PART3_REPEAT]);

/** The four instances (quests/*.js onAccepted, locations/location.js). */
export const INSTANCES = Object.freeze({
  desert: { instanceId: 'tower_quest_desert', template: 'LCR8MP0IJI1299U', label: 'Area 42', x: -2077, y: -105, exitDelaySec: 2 * 60 },
  outer_mind: { instanceId: 'tower_quest_headspace', template: 'LCR8MQ9JJI12IIK', label: 'The Outer Mind', x: -911, y: -410, exitDelaySec: 2 * 60 },
  inner_mind: { instanceId: 'tower_quest_crystine', template: 'LCR8MRAKJI12UOP', label: 'The Inner Mind', x: -1924, y: -143, exitDelaySec: 2 * 60 },
  chamber: { instanceId: 'tower_quest_chamber', template: 'LCR8MSVKJI12BOU', label: "Gwendolyn's Chamber", x: -408, y: -163, exitDelaySec: 0 },
});
export const STAGES = Object.freeze(Object.keys(INSTANCES));

/** Area 42 survives as an instantiated copy (LHF8DDDBTPF3P4U -> geometry GHF8DDDBTPF3P4U). */
export const DESERT_STREET = 'GHF8DDDBTPF3P4U';
const DESERT_BOUNDS = { l: -2250, t: -1000 };
const dx = (x) => x - DESERT_BOUNDS.l;
const dy = (y) => y - DESERT_BOUNDS.t;
/** By the trailer (the recordings); on the plat 887..2249 slope. */
export const CACTUS = Object.freeze({ x: 1600, y: -102 });
/** npc_squid doDesert case 15: apiMoveToXY(275, this.y - 35, 200). */
export const SQUID_GLIDE = Object.freeze({ x: 275, rise: 35, speed: 200 });
/** Every npc in the chain sets apiSetHitBox(400, 400). */
export const HIT_HALF = 200;
/** gwendolyn_chamber_exit: teleportToLocationDelayed('LTJ10M515812V0C', 102, -534). */
export const CHAMBER_EXIT = Object.freeze({ tsid: 'GTJ10M515812V0C', label: 'Corridor Five', x: 102 + 2250, y: -534 + 1500 });

/** items/catalog_buffs.js its_so_hot / its_so_hot2, and npc_squid's two cooling canvases. */
export const HEAT = Object.freeze({
  its_so_hot: { name: "It's So Hot!", tickMs: 5000, mood: 3, color: '#cc0000', steps: [[0.5, 0.5], [0.5, 0.25], [0, 0.5], [0, 3.75]] },
  its_so_hot2: { name: "It's CRAZY Hot!", tickMs: 2000, mood: 3, color: '#cc0000', steps: [[0.5, 0.5], [0.5, 0.25], [0, 0.5], [0, 0.75]] },
});
export const COOLING_DOWN = Object.freeze({ color: '#9e67d1', steps: [[0.5, 1.0], [0.5, 0.5], [0, 1.0]], tip: 'Ahh ...', tipMs: 2500 });
export const ITS_COOL = Object.freeze({ color: '#4781f1', steps: [[0.5, 0.5], [0.5, 0.25], [0, 0.5], [0, 1.25]], loop: true });
export const STUCK_TEXT = 'Are you stuck? Do you want to leave this place?';

/** items/npc_cactus.js onPlayerCollision + onConversation. */
export const CACTUS_LINES = Object.freeze([
  ['Ack! Pfft! Get it OFF ME it’s BURNY.', 'What?'],
  ['TAKE the AIR away. Suck it out. Suck it out & blow it into the North … the northwest. Mybialded. Mebber. … ACK!', 'Um…'],
  ['SUCK IT AWAY AND TAKE IT AWAY. Put it in the bubbles and take it to someone who needs to know what burning is. I know too well already.', 'Listen, I …'],
  ['Tii boiled down the sky and poured it into the caves, and the caves spat it out into the air, and the air has come here to punish me. It’s BURNY. Make it STOP.', 'Oh … kay'],
]);

/** items/npc_squid.js doDesert conversation beats, by state. */
export const DESERT_LINES = Object.freeze({
  0: ['That cactus is CrAzY! Hee hee!', 'Yes.'],
  1: ['It is damn hot out though …', 'It is.'],
  5: ['Don’t worry. This is how vision quests always start.', ':('],
  17: ['It might be scary for you here.', 'It is.'],
  18: ["It's cool, though.", "Doesn't seem like it."],
  19: ["<i>Seriously. It's cool. It's cool. Everything's cool.</i>", '...'],
  23: ['I’m telling you, everything will be cool. It will all BE cool, if you just learn to step into your own head and shut all of this out.', "I'll try."],
  24: ['It’s all cool in there. Are you ready to meet your mind?', 'Just get me out of here.'],
});
export const FOLLOW_ME = 'Follow me...';

/** locations/location.js innermind_vog_interrupt (nuxp_vog_brain). */
export const VOG_LINES = Object.freeze([
  'TRAVELLER: EXAMINE THE PATH. WALK THE PATH WITH HEART. THE ONLY WORTHWHILE CHALLENGE IS TO TRAVERSE THE FULL LENGTH.',
  'BE AWARE, THIS IS YOUR OWN MIND. DO NOT LITTER.  PLEASE LEAVE IT AS YOU WOULD WISH TO FIND IT. YOUR NEAREST EXIT MAY BE ABOVE YOU.',
  'THE ONES WHO CAME BEFORE YOU DID NOT HAVE WHAT YOU HAVE. THEY DID NOT KNOW WHAT YOU KNOW.',
  'KNOWLEDGE IS YOUR RAFT. YOUR PATH IS YOUR OWN. DO NOT GO BACK. DO NOT PASS GO. BE IN YOUR MIND ALWAYS. EVEN WHEN YOU ARE WITHOUT IT.',
]);
/** npc_squid doOuterMind case 1. */
export const OUTER_LINE = Object.freeze(['Hee hee! Neat! C’mere!', 'OK']);

/** Sheet grids (cols, rows, frames) of the recovered OGA art. */
export const SHEETS = Object.freeze({
  squid: { idle: [4, 12, 48], talk: [15, 6, 87], bamfin: [3, 3, 9], bamfout: [3, 3, 8] }, // 235 x 251 cells
  cactus: { idle: [6, 8, 44], talk: [6, 13, 74] }, // 157 x 126
  gwendolyn: { idle: [8, 10, 76], talk: [8, 10, 74] }, // 116 x 191
});
const SWOON_FRAMES = 14; // npc_butterfly fly-rooked, 70 x 65

/* ------------------------------------------------------------------ */
/* Quest chain                                                          */
/* ------------------------------------------------------------------ */

/** The stage a quest's onAccepted sends you to (QA demos start mid-chain). */
export function stageForQuest(questId) {
  if (questId === PART2) return 'outer_mind';
  if (questId === PART3 || questId === PART3_REPEAT) return 'inner_mind';
  return 'desert';
}

/** npc_squid doQuests: part3repeat once part 3 has been done before (npc_widget's repeatingTower). */
export function thirdPartFor(questState) {
  return (questState?.completed || []).includes(PART3) ? PART3_REPEAT : PART3;
}

/** Part 3 (or its repeat) turned in: the chain is safe to leave. */
export function chainFinished(questState) {
  const done = questState?.completed || [];
  return !questState?.active?.[PART3] && !questState?.active?.[PART3_REPEAT] && (done.includes(PART3) || done.includes(PART3_REPEAT))
    && !questState?.active?.[PART2] && !questState?.active?.[TASK];
}

/** A later part is open outside the rooms: location.js would fail the chain on entry. */
export function chainBroken(questState) {
  const active = questState?.active || {};
  return Boolean(active[PART2] || active[PART3] || active[PART3_REPEAT]);
}

/**
 * location.js onPlayerEnter outside the tower instances before part 3 is
 * done: failQuest part3repeat, part3, part2 (and its done copy), tower_quest
 * (and its done copy). The chain restarts at tower_quest (failed, so the
 * Magic Rock offers a retry). Returns true when anything changed.
 */
export function resetChain(questState) {
  if (!questState) return false;
  const offers = ensureQuestOfferState(questState);
  questState.active ||= {};
  let changed = false;
  for (const id of [PART3_REPEAT, PART3, PART2]) {
    if (questState.active[id]) {
      delete questState.active[id];
      delete offers.managed[id];
      changed = true;
    }
  }
  const before = (questState.completed || []).length;
  questState.completed = (questState.completed || []).filter((id) => id !== PART2 && id !== TASK);
  if (questState.completed.length !== before) changed = true;
  if (!questState.active[TASK] && changed) acceptOffer(questState, TASK, {});
  return changed;
}

/* ------------------------------------------------------------------ */
/* Layouts (pure: tests check reach against the avatar's jump)          */
/* ------------------------------------------------------------------ */

/**
 * The Outer Mind: a head in space. From the checkered floor a pink tube
 * winds right, back left and up to the mouth, where Zzybzfrx waits; a short
 * knot at each turn is the hop between tubes (every hop ~90 px), and the
 * tiers are far enough apart to walk under. Falling drops you back to the
 * floor. The source spawn (-911,-410) sits ~480 px under the squid's spot
 * (-543,-950); this climb is a little taller.
 */
export function outerLayout(kit) {
  const W = 2800;
  const H = 1320;
  const FLOOR = H - 80;
  const platforms = [
    kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'om_floor' }),
    kit.plat(900, FLOOR, 1800, FLOOR - 40, 'tube', { id: 'om_t1' }),
    kit.plat(1700, 1110, 1840, 1110, 'knot', { id: 'om_k1' }),
    kit.plat(1780, 1020, 2600, 1000, 'tube', { id: 'om_t2' }),
    kit.plat(2460, 910, 2620, 910, 'knot', { id: 'om_k2' }),
    kit.plat(1460, 800, 2560, 822, 'tube', { id: 'om_t3' }),
    kit.plat(1380, 710, 1540, 710, 'knot', { id: 'om_k3' }),
    kit.plat(300, 620, 1460, 620, 'tube', { id: 'om_mouth' }),
  ];
  return {
    W,
    H,
    FLOOR,
    platforms,
    path: ['om_t1', 'om_k1', 'om_t2', 'om_k2', 'om_t3', 'om_k3', 'om_mouth'],
    spawn: { x: 300, y: FLOOR },
    checker: { x1: 60, x2: 980 },
    vogX: 1060,
    /** make_squid_appear: walking along the mouth. */
    appear: { x1: 300, x2: 1150, yMax: 650 },
    squid: { x: 700, y: 620 },
    /** end_squiddy_convo: next to the squid. */
    endBox: { x1: 480, x2: 900, yMax: 650 },
    head: { x: 40, y: 330, w: W - 80, h: H - 290, r: 340 },
    eyes: [
      { x: 1080, y: 450, r: 88 },
      { x: 1900, y: 560, r: 84 },
      { x: 2420, y: 700, r: 66 },
      { x: 520, y: 900, r: 64 },
      { x: 1250, y: 960, r: 54 },
    ],
  };
}

/**
 * The Inner Mind: a white void. Three shards stand across the floor, each a
 * wall too tall to jump, climbed by glass stairs to a glass shelf on its face;
 * glass ledges above carry quoins, the last one a Gurly Drink by the EXIT
 * arrow (crystine_across). Its five Snaps (research/wayback/raw/snaps/
 * gwendolyn_inner_mind/, reference only) set the look: glossy shards with
 * their reflections, faded ones behind, a magenta and a separate orange jelly
 * "beehive", glass domes of treats, glass shelves and purple lightning
 * cracks, all arbito1.swf decos (tools/room-art set gwendolyn_inner_mind).
 */
export function innerLayout(kit) {
  const W = 4400;
  const H = 1100;
  const FLOOR = H - 80;
  // `art` is each wall's shard (S PIF3L2MLDT53HEF: the orange jelly with glass
  // stairs at its side; PIFI2ITVSR53NBP: a glass shelf across a jelly's face).
  const crystals = [
    { id: 'beehive', x1: 1000, x2: 1250, top: 800, color: 'orange', shape: 'hive', art: 'object_4b' },
    { id: 'indigo', x1: 2000, x2: 2300, top: 760, color: 'indigo', shape: 'block', art: 'object_7' },
    { id: 'jade', x1: 2900, x2: 3150, top: 780, color: 'green', shape: 'block', art: 'object_8' },
  ];
  const glass = (id, x1, x2, y) => kit.plat(x1, y, x2, y, 'glass', { id });
  const platforms = [
    kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'im_floor' }),
    glass('im_s1', 860, 940, 935),
    glass('im_s2', 920, 1000, 850),
    glass('im_beehive_top', 1000, 1250, 800),
    glass('im_g1', 1790, 1900, 932),
    glass('im_g2', 1880, 2000, 845),
    glass('im_indigo_top', 2000, 2300, 760),
    glass('im_high', 2110, 2270, 668),
    glass('im_s3', 2730, 2820, 935),
    glass('im_s4', 2800, 2900, 855),
    glass('im_jade_top', 2900, 3150, 780),
    glass('im_d1', 3480, 3600, 935),
    glass('im_d2', 3590, 3770, 852),
  ];
  const barriers = crystals.map((c) => ({ id: `im_wall_${c.id}`, x: c.x1, y: c.top, h: FLOOR - c.top, pc_perm: -1 }));
  const q = (type, x, y) => ({ type, x, y });
  const quoins = [
    q('mood', 420, FLOOR - 40), q('energy', 640, FLOOR - 40), q('mood', 900, 890), q('xp', 1120, 760),
    q('energy', 1500, FLOOR - 40), q('mood', 1840, 890), q('energy', 2150, 720), q('xp', 2190, 628),
    q('mood', 2240, 628), q('currants', 2560, FLOOR - 40), q('energy', 2850, 815), q('mood', 3020, 740),
    q('xp', 3330, FLOOR - 40), q('energy', 3540, 895), q('currants', 3880, FLOOR - 40),
  ];
  // Decor (no collision). x is the art's centre; layers scroll at their factor.
  const s = (art, x, scale = 1, extra = {}) => ({ art, x, scale, ...extra });
  return {
    W,
    H,
    FLOOR,
    platforms,
    barriers,
    crystals,
    spawn: { x: 180, y: FLOOR },
    quoins,
    drink: { x: 3700, y: 852 },
    exit: { x: 4150, y: FLOOR, w: 140, h: 220 },
    /** Purple lightning cracks in the floor: x centre, width scale. */
    cracks: [{ x: 470, w: 1 }, { x: 1560, w: 1.4 }, { x: 2470, w: 1.2 }, { x: 3330, w: 1.5 }, { x: 3960, w: 1.2 }],
    domes: [{ x: 1420, art: 'object_3b' }, { x: 2600, art: 'object_3c' }, { x: 3240, art: 'object_3' }],
    // S PHVGULDS9I820D3 28118 / PIF3L2MLDT53HEF: the magenta jelly stands on its own, apart from the orange one.
    jellies: [s('object_4', 745, 0.8), s('object_4b', 1125, 1, { wall: 'beehive' })],
    /** The dark blue shard behind the last ledges, before the EXIT. */
    front: [s('object_6', 3635, 1.15), s('object_9', 4380, 0.8, { flip: true })],
    /** Faded shards far behind (factor 0.35) and nearer ones (0.65): S 28118, 28120, PHFVB7UGK2D283T. */
    far: { factor: 0.35, base: 760, alpha: 0.4, shards: [s('object_1', 120, 0.6), s('object_8', 430, 0.55), s('object_5', 700, 0.6), s('object_7', 980, 0.55), s('object_2', 1260, 0.6), s('object_9', 1560, 0.5), s('object_6', 1850, 0.55), s('object_1', 2120, 0.5, { flip: true })] },
    mid: { factor: 0.65, base: 880, alpha: 0.82, shards: [s('object_9', 180, 0.75), s('object_2', 600, 0.8), s('object_7', 1000, 0.75, { flip: true }), s('object_5', 1420, 0.85), s('object_1', 1800, 0.8), s('object_8', 2250, 0.7, { flip: true }), s('object_2', 2650, 0.7, { flip: true }), s('object_6', 3000, 0.7)] },
  };
}

/** Gwendolyn's Chamber: dark, still, the ghost a few steps from where you arrive. */
export function chamberLayout(kit) {
  const W = 1700;
  const H = 820;
  const FLOOR = H - 80;
  return {
    W,
    H,
    FLOOR,
    platforms: [kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'gc_floor' })],
    spawn: { x: 300, y: FLOOR },
    gwen: { x: 820, y: FLOOR - 6 },
    exit: { x: 110, y: FLOOR },
    trees: [
      { x: 120, h: 470, s: 1.0 }, { x: 470, h: 360, s: 0.75 }, { x: 640, h: 520, s: 1.1 }, { x: 1060, h: 430, s: 0.9 },
      { x: 1300, h: 540, s: 1.15 }, { x: 1560, h: 380, s: 0.8 },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Screen overlays (canvas flashes, VOG text, tips)                     */
/* ------------------------------------------------------------------ */

let flashEl = null;
let loopFlash = null;
let tipEl = null;
let tipTimer = 0;
let vogEl = null;

function hudHost() {
  return document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
}

/** vp_canvas: a full-screen colour that steps through [alpha, secs] pairs. */
function canvasFlash(ctx, { color, steps, loop = false }) {
  ctx.setData('gwenFlash', `${color}${loop ? ':loop' : ''}`);
  if (typeof document === 'undefined') return;
  // Over the game view only (the pack and dialogue stay untinted).
  const host = hudHost();
  const cv = host.querySelector('canvas') || document.querySelector('canvas');
  const box = cv?.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const el = document.createElement('div');
  const rect = box ? `left:${box.left - hostBox.left}px;top:${box.top - hostBox.top}px;width:${box.width}px;height:${box.height}px` : 'inset:0';
  el.style.cssText = `position:absolute;${rect};z-index:20;pointer-events:none;background:${color};opacity:0`;
  host.appendChild(el);
  const total = steps.reduce((s, [, secs]) => s + secs, 0);
  let at = 0;
  const frames = [{ opacity: 0, offset: 0 }];
  for (const [alpha, secs] of steps) {
    at += secs;
    frames.push({ opacity: alpha, offset: Math.min(1, at / total) });
  }
  const anim = el.animate?.(frames, { duration: total * 1000, iterations: loop ? Infinity : 1 });
  if (loop) {
    stopLoopFlash();
    loopFlash = el;
  } else {
    flashEl = el;
    if (anim) anim.onfinish = () => el.remove();
    else setTimeout(() => el.remove(), total * 1000);
  }
}

function stopLoopFlash() {
  loopFlash?.remove();
  loopFlash = null;
}

/** vp_overlay nuxp_vog_smaller: a short line under the room card. */
function tip(ctx, text, ms = 1500) {
  ctx.setData('gwenTip', text);
  if (typeof document === 'undefined') return;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.style.cssText = 'position:absolute;left:50%;top:31%;transform:translateX(-50%);z-index:78;pointer-events:none;font:900 clamp(1.1rem,2.6vw,1.6rem) Nunito,"Trebuchet MS",sans-serif;color:#fff;text-shadow:0 2px 0 #3a2420,0 0 12px rgba(0,0,0,.45);transition:opacity .3s;white-space:nowrap';
    hudHost().appendChild(tipEl);
  }
  tipEl.textContent = text;
  tipEl.hidden = false;
  tipEl.style.opacity = '1';
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    if (tipEl) tipEl.style.opacity = '0';
  }, ms);
}

/** The locking innermind_vog_interrupt: four pages, click to advance (no spacebar). */
function vog(ctx, pages) {
  ctx.data.vogOpen = true;
  ctx.activity(pages.join(' '));
  if (typeof document === 'undefined') {
    ctx.data.vogOpen = false;
    return Promise.resolve();
  }
  if (!vogEl) {
    vogEl = document.createElement('div');
    vogEl.setAttribute('role', 'dialog');
    vogEl.style.cssText = 'position:absolute;inset:0;z-index:86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;cursor:pointer;text-align:center;padding:0 16px;background:radial-gradient(ellipse at center,rgba(60,10,50,.45),rgba(60,10,50,.12) 70%)';
    hudHost().appendChild(vogEl);
  }
  let page = 0;
  return new Promise((resolve) => {
    const render = () => {
      vogEl.innerHTML = `<p style="margin:0;max-width:560px;font:900 clamp(1.25rem,3.6vw,2.15rem)/1.15 Nunito,'Trebuchet MS',sans-serif;color:#fff;letter-spacing:.01em;text-shadow:0 3px 0 #5a1d4a,0 0 18px rgba(80,0,60,.55)"></p>
        <span style="font:800 .8rem Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000">&#9656; Click to continue (${page + 1}/${pages.length})</span>`;
      vogEl.querySelector('p').textContent = pages[page];
      ctx.setData('gwenVog', `${page + 1}/${pages.length}`);
    };
    const next = () => {
      page += 1;
      if (page < pages.length) {
        render();
        return;
      }
      vogEl.style.display = 'none';
      vogEl.removeEventListener('click', next);
      ctx.data.vogNext = null;
      ctx.data.vogOpen = false;
      ctx.setData('gwenVog', 'done');
      resolve();
    };
    render();
    vogEl.style.display = 'flex';
    ctx.data.vogNext = next;
    setTimeout(() => vogEl?.addEventListener('click', next), 300);
  });
}

function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.hidden = true;
}

function clearScreen() {
  stopLoopFlash();
  flashEl?.remove();
  flashEl = null;
  clearTimeout(tipTimer);
  if (tipEl) tipEl.hidden = true;
  if (vogEl) vogEl.style.display = 'none';
}

/* ------------------------------------------------------------------ */
/* Actors (squid, cactus, ghost) from the recovered sheets              */
/* ------------------------------------------------------------------ */

function makeActor(ctx, prefix, grid, anchor, speed) {
  const { PIXI, kit } = ctx;
  const sheets = {};
  for (const [name, [cols, rows, count]] of Object.entries(grid)) {
    sheets[name] = kit.sheetFrames(PIXI, `${ART}${prefix}_${name}.webp`, cols, rows, count);
  }
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(anchor[0], anchor[1]);
  spr.animationSpeed = speed;
  const c = new PIXI.Container();
  c.addChild(spr);
  return { c, spr, sheets, state: '' };
}

function playActor(actor, state, { loop = true, then = null } = {}) {
  if (!actor) return;
  const sheet = actor.sheets[state];
  actor.state = state;
  const apply = () => {
    if (actor.spr.destroyed || actor.state !== state || !sheet.frames.length) return;
    actor.spr.textures = sheet.frames;
    actor.spr.loop = loop;
    actor.spr.onComplete = loop ? null : () => then?.();
    actor.spr.gotoAndPlay(0);
  };
  if (sheet.frames.length) apply();
  else onLoaded(sheet.base, () => setTimeout(apply, 0));
}

const SQUID_ANCHOR = [151 / 235, 184 / 251]; // body bottom-centre in the 235 x 251 cell
const SQUID_HOVER = 28;

function addSquid(ctx, variant, x, y) {
  const squid = makeActor(ctx, `squid_${variant}`, SHEETS.squid, SQUID_ANCHOR, 0.5);
  squid.c.x = x;
  squid.c.y = y;
  squid.c.visible = false;
  ctx.add(squid.c, 45);
  squid.target = ctx.register({ classId: 'npc_squid', label: 'Zzybzfrx', subtitle: 'Squirt. Squirt', sprite: squid.c });
  ctx.data.squid = squid;
  return squid;
}

/** setAndBroadcastState('bamfIn'): a pink poof, then the squid. */
function bamfIn(ctx) {
  const squid = ctx.data.squid;
  if (!squid) return;
  squid.c.visible = true;
  squid.shown = true;
  playActor(squid, 'bamfin', { loop: false, then: () => playActor(squid, 'idle') });
  ctx.sound('TELEPORTER_VISIBLE_APPEAR', { volume: 0.25 });
}

/** setAndBroadcastState('bamfOut'): the squid goes up in a poof. */
function bamfOut(ctx) {
  const squid = ctx.data.squid;
  if (!squid) return;
  squid.shown = false;
  playActor(squid, 'bamfout', { loop: false, then: () => { if (!squid.shown) squid.c.visible = false; } });
}

function squidTalk(ctx, on) {
  const squid = ctx.data.squid;
  if (!squid?.shown) return;
  playActor(squid, on ? 'talk' : 'idle');
}

/** The walking surface at x nearest to `nearY` (the held street's platforms). */
function groundAt(ctx, x, nearY) {
  let best = null;
  for (const p of ctx.engine.platforms || []) {
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (x < lo || x > hi) continue;
    const y = hi === lo ? p.y1 : (p.x1 <= p.x2 ? p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1) : p.y2 + ((x - p.x2) / (p.x1 - p.x2)) * (p.y1 - p.y2));
    if (best == null || Math.abs(y - nearY) < Math.abs(best - nearY)) best = y;
  }
  return best ?? nearY;
}

function squidAt(ctx, x, feetY) {
  const squid = ctx.data.squid;
  if (!squid) return;
  squid.c.x = x;
  squid.c.y = feetY - SQUID_HOVER;
}

/** A blue swoonerfly falls from the sky at the player's side (npc_swoonerfly fall + land). */
function swoonerfly(ctx, offX, offY) {
  const { PIXI, kit } = ctx;
  const p = ctx.player;
  if (!p) return;
  const fall = kit.sheetFrames(PIXI, `${ART}swoonerfly_fall.png`, SWOON_FRAMES, 1, SWOON_FRAMES);
  const spr = new PIXI.AnimatedSprite(fall.frames.length ? fall.frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.animationSpeed = 0.5;
  if (!fall.frames.length) onLoaded(fall.base, () => setTimeout(() => { if (!spr.destroyed) { spr.textures = fall.frames; spr.play(); } }, 0));
  else spr.play();
  const destY = groundAt(ctx, p.x + offX, p.y) + offY * 0.4;
  spr.x = p.x + offX;
  spr.y = destY - 520;
  ctx.add(spr, 46);
  (ctx.data.swoons ||= []).push({ spr, destY, landed: false, stars: null });
  ctx.data.swoonCount = (ctx.data.swoonCount || 0) + 1;
}

function stepSwoons(ctx, dtMs, now) {
  for (const s of ctx.data.swoons || []) {
    if (s.spr.destroyed) continue;
    if (!s.landed) {
      // apiMoveToXY(x, y_destination, 400, 'land'): 400 px a second.
      s.spr.y = Math.min(s.destY, s.spr.y + (400 * dtMs) / 1000);
      if (s.spr.y >= s.destY) {
        s.landed = true;
        s.spr.stop();
        s.spr.texture = textureFromUrl(`${ART}swoonerfly_rest.png`);
        // npc_swoonerfly.js 45-62 land(): itemstack_overlay rooked, delta_y
        // 20 from its top, 3000 ms (Tiny Speck's rooked.fla: little rooks,
        // a skull and a cloud circling, G273).
        const spr = s.spr;
        const at = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: 20 });
        s.stars = playSheetOverlay(ctx.PIXI, 'rooked', { layer: ctx.add(new ctx.PIXI.Container(), 47), at: () => at, durationMs: 3000 });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Heat (its_so_hot / its_so_hot2)                                      */
/* ------------------------------------------------------------------ */

function setHeat(ctx, id) {
  ctx.data.heat = id || null;
  ctx.data.heatNextAt = id ? Date.now() + HEAT[id].tickMs : 0;
  heatBuff(ctx, id);
}

/**
 * The heat is the source buff the player sees (buffs_apply('its_so_hot') /
 * 'its_so_hot2', buffs_remove on cooling or leaving); stepHeat keeps its tick.
 */
function heatBuff(ctx, id) {
  const engine = ctx.engine;
  if (!engine?.applyBuff) return;
  for (const other of Object.keys(HEAT)) {
    if (other !== id && engine.hasBuff?.(other)) engine.removeBuff(other);
  }
  if (id && !engine.hasBuff?.(id)) engine.applyBuff(id);
}

/** on_tick: the red flash, metabolics_lose_mood(3), "So hot! -N mood!", never below 3. */
export function heatTick(pc, buffId) {
  const def = HEAT[buffId];
  // catalog_buffs.js 1114, 1132: metabolics_lose_mood(3), then metabolics_add_mood(3, true)
  // at zero; both through the doors (G300), so the dead lose nothing.
  const actual = loseMood(pc, def.mood);
  if ((Number(pc.mood) || 0) === 0) gainMetabolic(pc, 'mood', 3, { quiet: true });
  return actual;
}

function stepHeat(ctx, now) {
  const id = ctx.data.heat;
  if (!id || now < ctx.data.heatNextAt) return;
  ctx.data.heatNextAt = now + HEAT[id].tickMs;
  if (ctx.dialogOpen()) return; // a locking conversation pauses the sun
  canvasFlash(ctx, { color: HEAT[id].color, steps: HEAT[id].steps });
  const actual = heatTick(ctx.engine.pc, id);
  if (actual) tip(ctx, `So hot! -${actual} mood!`, 1500);
  ctx.data.moodLost = (ctx.data.moodLost || 0) + actual;
  ctx.engine.updateHud();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const live = (ctx, epoch) => Boolean(ctx.run && ctx.run.status !== 'left' && ctx.data.epoch === epoch);

function awardOpen() {
  return typeof document !== 'undefined' && Boolean(document.querySelector('#award-screen.is-visible:not([hidden])'));
}

function free(ctx) {
  return !ctx.dialogOpen() && !ctx.engine.acting() && !awardOpen() && !ctx.data.vogOpen && !ctx.data.moment;
}

function resetStuck(ctx) {
  const sec = INSTANCES[ctx.stage]?.exitDelaySec || 0;
  ctx.data.stuckAt = sec ? Date.now() + sec * 1000 : 0;
}

/** One npc line in the quest dialogue card. */
function line(ctx, speaker, [text, button]) {
  hideTip();
  return ctx.converse({ title: speaker, kicker: INSTANCES[ctx.stage]?.label || '', beats: [{ text, response: button }] });
}

function questStatus(ctx, id) {
  if (ctx.quest(id).active()) return 'active';
  return (ctx.engine.questState?.completed || []).includes(id) ? 'done' : 'none';
}

/** The chain part in progress (the HUD names it). */
function currentPart(ctx) {
  return [PART3_REPEAT, PART3, PART2, TASK].find((id) => ctx.quest(id).active()) || null;
}

const TITLES = Object.freeze({
  [TASK]: "Gwendolyn's Task",
  [PART2]: "Gwendolyn's Task II",
  [PART3]: "Gwendolyn's Task III",
  [PART3_REPEAT]: "Gwendolyn's Task III",
});

/** Hover in the meditation halo with the Focusing Orb, while the scene cools (step into your own head). */
async function stepInside(ctx, ms = 2600) {
  const { PIXI } = ctx;
  const p = ctx.player;
  if (!p) return;
  ctx.data.moment = true;
  const root = ctx.add(new PIXI.Container(), 60);
  const halo = new PIXI.Graphics();
  root.addChild(halo);
  const base = sourceFromUrl(ORB_TOOL_SHEET.url);
  const frames = [];
  for (let i = 0; i < ORB_TOOL_SHEET.frames; i++) {
    const col = i % ORB_TOOL_SHEET.cols;
    const row = Math.floor(i / ORB_TOOL_SHEET.cols);
    frames.push(frameTexture(base, new PIXI.Rectangle(col * ORB_TOOL_SHEET.frameW, row * ORB_TOOL_SHEET.frameH, ORB_TOOL_SHEET.frameW, ORB_TOOL_SHEET.frameH)));
  }
  const orb = new PIXI.AnimatedSprite(frames);
  orb.anchor.set(0.5);
  orb.width = 52;
  orb.height = 52;
  orb.animationSpeed = 0.42;
  orb.play();
  root.addChild(orb);
  const start = Date.now();
  ctx.data.momentDraw = (now) => {
    const t = now - start;
    const breath = 0.5 - 0.5 * Math.cos((t / 4000) * Math.PI * 2);
    const h = 96;
    const chest = p.y - h * 0.52;
    halo.clear();
    for (const [color, alpha, k] of [[0xd9c8ff, 0.09, 1], [0xc3dcff, 0.1, 0.78], [0xf2ecff, 0.12, 0.55]]) {
      halo.ellipse(p.x, chest, (h * 0.62 + breath * 10) * k, (h * 0.72 + breath * 12) * k).fill({ color: color, alpha: alpha * (0.8 + breath * 0.5) });
    }
    p.pivot.y = Math.min(1, t / 700) * (4 + breath * 6);
    orb.position.set(p.x + 28, p.y - h * 0.34 + ORB_TOOL_SHEET.deltaY + Math.sin(t / 900) * 3);
  };
  await ctx.wait(ms);
  ctx.data.momentDraw = null;
  if (p) p.pivot.y = 0;
  ctx.data.moment = false;
}

function startMusic(ctx, url) {
  stopMusic(ctx);
  const token = (ctx.data.musicToken = (ctx.data.musicToken || 0) + 1);
  Promise.resolve(ctx.engine.playCue?.(url, { volume: 0.45 })).then((stop) => {
    if (ctx.data.musicToken !== token) stop?.();
    else ctx.data.stopMusic = stop;
  }).catch(() => {});
}

function stopMusic(ctx) {
  ctx.data.musicToken = (ctx.data.musicToken || 0) + 1;
  ctx.data.stopMusic?.();
  ctx.data.stopMusic = null;
}

/* ------------------------------------------------------------------ */
/* Area 42                                                              */
/* ------------------------------------------------------------------ */

function enterDesert(ctx) {
  setHeat(ctx, 'its_so_hot'); // location.js onPlayerEnter: buffs_apply('its_so_hot')
  const cactus = makeActor(ctx, 'cactus', SHEETS.cactus, [0.5, 125 / 126], 0.4);
  cactus.c.x = dx(CACTUS.x);
  cactus.c.y = dy(CACTUS.y) + 2;
  ctx.add(cactus.c, 40);
  playActor(cactus, 'idle');
  cactus.target = ctx.register({ classId: 'npc_cactus', label: 'Cactus', subtitle: 'Mind the needles...', sprite: cactus.c });
  ctx.data.cactus = cactus;
  addSquid(ctx, 'blue', 0, 0);
  ctx.data.desertState = -1; // no squid yet
  ctx.data.swoons = [];
}

/** npc_cactus onPlayerCollision -> onConversation -> doCrazyShit. */
async function cactusRant(ctx, epoch) {
  const d = ctx.data;
  d.cactusTalked = true;
  resetStuck(ctx);
  setHeat(ctx, null);
  playActor(d.cactus, 'talk');
  setTimeout(() => { if (d.cactus && !d.cactus.spr.destroyed) playActor(d.cactus, 'idle'); }, 2000);
  for (const beat of CACTUS_LINES) {
    if (!live(ctx, epoch)) return;
    await line(ctx, 'Cactus', beat);
  }
  if (!live(ctx, epoch)) return;
  setHeat(ctx, 'its_so_hot');
  await ctx.wait(2000);
  if (!live(ctx, epoch)) return;
  const p = ctx.player;
  squidAt(ctx, p.x - 150, p.y);
  bamfIn(ctx);
  d.desertState = 0;
  ctx.activity('Something has appeared beside you.');
}

async function pollNear(ctx, epoch, range = 150) {
  while (live(ctx, epoch)) {
    if (Math.abs(ctx.player.x - ctx.data.squid.c.x) < range) return true;
    await ctx.wait(100);
  }
  return false;
}

async function glideSquid(ctx, epoch, x, y, speed) {
  const s = ctx.data.squid.c;
  while (live(ctx, epoch)) {
    const ddx = x - s.x;
    const ddy = y - s.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 4) break;
    const step = Math.min(dist, speed / 10);
    s.x += (ddx / dist) * step;
    s.y += (ddy / dist) * step;
    await ctx.wait(100);
  }
}

/** items/npc_squid.js doDesert, state by state with the source timers. */
async function desertScript(ctx, epoch) {
  const d = ctx.data;
  const p = () => ctx.player;
  const ok = () => live(ctx, epoch);
  const talk = async (state) => {
    d.desertState = state;
    squidTalk(ctx, true);
    await line(ctx, 'Zzybzfrx', DESERT_LINES[state]);
    squidTalk(ctx, false);
  };
  resetStuck(ctx);
  setHeat(ctx, null); // case 0
  await talk(0);
  if (!ok()) return;
  await talk(1);
  if (!ok()) return;
  // case 2
  d.desertState = 2;
  setHeat(ctx, 'its_so_hot');
  bamfOut(ctx);
  squidAt(ctx, p().x - 80, p().y);
  swoonerfly(ctx, 85, 30);
  await ctx.wait(3000);
  // case 4: wait for the squid to sit left of you, then the second sun.
  d.desertState = 4;
  while (ok()) {
    if (d.squid.c.x < p().x - 50) {
      setHeat(ctx, null);
      bamfIn(ctx);
      setHeat(ctx, 'its_so_hot2');
      break;
    }
    squidAt(ctx, p().x - 80, p().y);
    await ctx.wait(500);
  }
  await ctx.wait(500);
  if (!ok()) return;
  setHeat(ctx, null);
  await talk(5);
  if (!ok()) return;
  // case 6, 7
  d.desertState = 6;
  setHeat(ctx, 'its_so_hot2');
  bamfOut(ctx);
  await ctx.wait(1000);
  if (!ok()) return;
  d.desertState = 8;
  swoonerfly(ctx, -200, -20);
  await ctx.wait(2000);
  if (!ok()) return;
  d.desertState = 9;
  squidAt(ctx, p().x - 160, p().y);
  swoonerfly(ctx, 180, 10);
  await ctx.wait(3000);
  if (!ok()) return;
  d.desertState = 10;
  bamfIn(ctx);
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 11;
  ctx.say(d.squid.target, FOLLOW_ME, 1500);
  await ctx.wait(1000);
  if (!ok()) return;
  d.desertState = 12;
  swoonerfly(ctx, -290, 10);
  if (!(await pollNear(ctx, epoch))) return;
  d.desertState = 13;
  squidAt(ctx, p().x - 300, p().y);
  bamfOut(ctx);
  await ctx.wait(1000);
  if (!ok()) return;
  d.desertState = 14;
  bamfIn(ctx);
  await ctx.wait(1000);
  if (!ok()) return;
  d.desertState = 15;
  swoonerfly(ctx, 100, 10);
  ctx.say(d.squid.target, FOLLOW_ME, 4000);
  // The source glides 35 px up from where it hovers; here it keeps its hover over the higher ground at 275.
  const glideX = dx(SQUID_GLIDE.x);
  await glideSquid(ctx, epoch, glideX, groundAt(ctx, glideX, d.squid.c.y) - SQUID_HOVER - 8, SQUID_GLIDE.speed);
  d.desertState = 16;
  if (!(await pollNear(ctx, epoch))) return;
  setHeat(ctx, null);
  await talk(17);
  if (!ok()) return;
  await talk(18);
  if (!ok()) return;
  await talk(19);
  if (!ok()) return;
  // case 20: cooling_down
  d.desertState = 20;
  bamfOut(ctx);
  canvasFlash(ctx, COOLING_DOWN);
  tip(ctx, COOLING_DOWN.tip, COOLING_DOWN.tipMs);
  await ctx.wait(2000);
  if (!ok()) return;
  d.desertState = 21;
  squidAt(ctx, p().x + 100, p().y);
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 22;
  canvasFlash(ctx, ITS_COOL);
  d.cool = true;
  bamfIn(ctx);
  await ctx.wait(500);
  if (!ok()) return;
  await talk(23);
  if (!ok()) return;
  await talk(24);
  if (!ok()) return;
  d.desertState = 25;
  bamfOut(ctx);
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 26;
  squidAt(ctx, p().x - 100, p().y);
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 27;
  bamfIn(ctx);
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 28;
  await ctx.wait(500);
  if (!ok()) return;
  d.desertState = 29;
  await desertQuests(ctx, epoch);
}

/** npc_squid doQuests in Area 42: tower_quest turns in here, part 2 is offered. */
async function desertQuests(ctx, epoch) {
  const d = ctx.data;
  if (d.offering) return;
  d.offering = true;
  try {
    if (ctx.quest(TASK).active()) {
      await ctx.quest(TASK).turnIn();
      d.heat = null; // tower_quest onComplete_custom: buffs_remove('its_so_hot2')
    }
    if (!live(ctx, epoch)) return;
    if (!ctx.quest(PART2).active() && questStatus(ctx, PART2) !== 'done') {
      squidTalk(ctx, true);
      const yes = await ctx.offerQuest(PART2, { kicker: 'Zzybzfrx' });
      squidTalk(ctx, false);
      if (!yes || !live(ctx, epoch)) {
        d.declinedAt = Date.now();
        return;
      }
    }
    if (ctx.quest(PART2).active()) {
      // tower_quest_part2 onAccepted: overlay_dismiss('its_cool'), then The Outer Mind.
      stopLoopFlash();
      d.cool = false;
      await stepInside(ctx);
      if (live(ctx, epoch)) ctx.gotoStage('outer_mind');
    }
  } finally {
    d.offering = false;
  }
}

function tickDesert(ctx, dtMs, now) {
  const d = ctx.data;
  const p = ctx.player;
  stepHeat(ctx, now);
  stepSwoons(ctx, dtMs, now);
  if (!p || !free(ctx)) return;
  const near = (x, y) => Math.abs(p.x - x) < HIT_HALF && Math.abs(p.y - y) < HIT_HALF;
  if (!d.cactusTalked && near(d.cactus.c.x, d.cactus.c.y)) {
    cactusRant(ctx, d.epoch);
    return;
  }
  if (d.desertState === 0 && d.squid.shown && near(d.squid.c.x, d.squid.c.y) && !d.scriptRunning) {
    d.scriptRunning = true;
    desertScript(ctx, d.epoch).finally(() => { d.scriptRunning = false; });
    return;
  }
  // desertState 29 (offer declined): bumping into the squid offers again.
  if (d.desertState === 29 && !d.offering && d.squid.shown && near(d.squid.c.x, d.squid.c.y) && now - (d.declinedAt || 0) > 4000) {
    desertQuests(ctx, d.epoch);
  }
}

/* ------------------------------------------------------------------ */
/* The Outer Mind                                                       */
/* ------------------------------------------------------------------ */

const PINK = { deep: 0xd94a92, mid: 0xf27ab8, light: 0xffb3da, shine: 0xffe1f0 };

/** A pink brain tube whose top runs along (x1,y1)-(x2,y2); `sag` bows decorative nerves. */
function drawTube(PIXI, g, x1, y1, x2, y2, width = 36, sag = 0) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag;
  const layers = [[width, PINK.deep, 1], [width - 10, PINK.mid, 1], [width * 0.32, PINK.light, 0.9]];
  for (const [w, color, alpha] of layers) {
    g.setStrokeStyle({ width: w, color, alpha: alpha ?? 1, cap: 'round', join: 'round' });
    const lift = w === width ? 0 : w === width - 10 ? -1 : -width * 0.22;
    g.moveTo(x1, y1 + width / 2 - 2 + lift);
    g.quadraticCurveTo(cx, cy + width / 2 - 2 + lift, x2, y2 + width / 2 - 2 + lift);
    g.stroke();
  }
}

function drawEye(PIXI, eye) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.ellipse(6, eye.r * 0.15, eye.r * 1.02, eye.r * 0.98).fill({ color: 0x2a1440, alpha: 0.25 });
  g.circle(0, 0, eye.r).fill(0xbfe9ff);
  g.circle(-eye.r * 0.12, -eye.r * 0.12, eye.r * 0.86).fill(0xffffff);
  g.circle(0, 0, eye.r).stroke({ width: 3, color: 0x7fb6d8, alpha: 0.8 });
  c.addChild(g);
  const iris = new PIXI.Graphics();
  iris.circle(0, 0, eye.r * 0.36).fill(0x7b3fc2);
  iris.circle(0, 0, eye.r * 0.17).fill(0x2a0f45);
  iris.circle(-eye.r * 0.1, -eye.r * 0.12, eye.r * 0.07).fill({ color: 0xffffff, alpha: 0.85 });
  c.addChild(iris);
  c.x = eye.x;
  c.y = eye.y;
  c.iris = iris;
  c.r = eye.r;
  return c;
}

function buildOuter(ctx) {
  const { PIXI, kit } = ctx;
  const L = outerLayout(kit);
  const root = kit.sceneRoot(PIXI, L.W, L.H);
  // Space, with stars.
  const space = root.layer(0, 0);
  space.addChild(kit.gradient(PIXI, [[0, '#1d0b3a'], [0.6, '#3a1660'], [1, '#2b0f4d']], 960, 640));
  const stars = new PIXI.Graphics();
  for (let i = 0; i < 90; i++) {
    stars.setFillStyle({ color: 0xffffff, alpha: 0.35 + kit.hash01(`s${i}`) * 0.6 });
    stars.circle(kit.hash01(`x${i}`) * 960, kit.hash01(`y${i}`) * 640, 0.8 + kit.hash01(`r${i}`) * 1.6).fill();
  }
  space.addChild(stars);
  const world = root.layer(1, 2);
  // The head: grey rock rim around a sunburst brain.
  const head = L.head;
  const rim = new PIXI.Graphics();
  rim.roundRect(head.x - 34, head.y - 34, head.w + 68, head.h + 68, head.r + 30).fill(0x8c8f99);
  rim.roundRect(head.x - 18, head.y - 18, head.w + 36, head.h + 36, head.r + 14).fill(0xb9bcc6);
  rim.roundRect(head.x - 6, head.y - 6, head.w + 12, head.h + 12, head.r + 4).fill({ color: 0x6f7280, alpha: 0.6 });
  world.addChild(rim);
  const burst = new PIXI.Container();
  const fill = new PIXI.Graphics();
  fill.rect(head.x, head.y, head.w, head.h).fill(0xff9a2e);
  const cx = L.W * 0.45;
  const cy = 700;
  const R = 2600;
  const N = 140;
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * Math.PI * 2;
    const a2 = ((i + 0.5) / N) * Math.PI * 2;
    fill.moveTo(cx, cy);
    fill.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    fill.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R);
    fill.closePath();
    fill.fill(i % 2 ? 0xff5fa8 : 0xff7a3d);
  }
  fill.circle(cx, cy, 80).fill({ color: 0xffc15a, alpha: 0.5 });
  burst.addChild(fill);
  const mask = new PIXI.Graphics();
  mask.roundRect(head.x, head.y, head.w, head.h, head.r).fill(0xffffff);
  burst.addChild(mask);
  burst.mask = mask;
  world.addChild(burst);
  // Nerve tubes from the eyes (decor), then the eyes.
  const nerves = new PIXI.Graphics();
  for (const [i, eye] of L.eyes.entries()) {
    const tx = eye.x + (i % 2 ? -260 : 240);
    const ty = eye.y + 160 + (i % 3) * 40;
    drawTube(PIXI, nerves, eye.x, eye.y + eye.r * 0.6, tx, ty, 22, 30);
  }
  world.addChild(nerves);
  ctx.data.eyes = L.eyes.map((eye) => world.addChild(drawEye(PIXI, eye)));
  // The checkered floor on a rock slab, and the rock base.
  const floor = new PIXI.Graphics();
  floor.rect(0, L.FLOOR, L.W, 120).fill(0x9a9ca6);
  floor.rect(0, L.FLOOR + 26, L.W, 120).fill(0x7c7f8a);
  const T = 40;
  for (let x = L.checker.x1, i = 0; x < L.checker.x2; x += T, i++) {
    for (let r = 0; r < 2; r++) {
      floor.rect(x, L.FLOOR + r * 13, T, 13).fill((i + r) % 2 ? 0x2fd3e6 : 0xffffff);
    }
  }
  floor.moveTo(0, L.FLOOR).lineTo(L.W, L.FLOOR).stroke({ width: 2, color: 0x5f6270, alpha: 0.8 });
  world.addChild(floor);
  // The walkable tubes.
  const tubes = new PIXI.Graphics();
  for (const p of L.platforms.filter((q) => q.style === 'tube' || q.style === 'knot')) drawTube(PIXI, tubes, p.x1, p.y1, p.x2, p.y2, p.style === 'knot' ? 30 : 38);
  world.addChild(tubes);
  return {
    label: INSTANCES.outer_mind.label,
    width: L.W,
    height: L.H,
    background: root,
    platforms: L.platforms,
    spawn: L.spawn,
  };
}

function enterOuter(ctx) {
  const L = outerLayout(ctx.kit);
  ctx.data.outer = L;
  addSquid(ctx, 'purple', L.squid.x, L.squid.y - SQUID_HOVER); // onPlayerEnter: apiSetXY(-543, -950), bamfOut
  ctx.data.mindState = -1;
  startMusic(ctx, MEDITATION_MUSIC.MEDITATIVE_ARTS_01);
}

/** npc_squid makeAppear -> doOuterMind 0..2. */
async function makeAppear(ctx, epoch) {
  const d = ctx.data;
  d.appeared = true;
  d.mindState = 0;
  bamfIn(ctx);
  await ctx.wait(500);
  if (!live(ctx, epoch)) return;
  d.mindState = 1;
  squidTalk(ctx, true);
  await line(ctx, 'Zzybzfrx', OUTER_LINE);
  squidTalk(ctx, false);
  d.mindState = 3;
  if (d.finalPending) finalConvo(ctx, epoch);
}

/** npc_squid finalConvo -> doOuterMind 3..5 -> doQuests. */
async function finalConvo(ctx, epoch) {
  const d = ctx.data;
  if (d.mindState !== 3) {
    if (d.mindState >= 0) d.finalPending = true;
    return;
  }
  d.finalPending = false;
  d.mindState = 4;
  bamfOut(ctx);
  squidAt(ctx, ctx.player.x - 70, ctx.player.y);
  await ctx.wait(500);
  if (!live(ctx, epoch)) return;
  bamfIn(ctx);
  await ctx.wait(500);
  if (!live(ctx, epoch)) return;
  d.mindState = 6;
  await outerQuests(ctx, epoch);
}

/** npc_squid doQuests in The Outer Mind: part 2 turns in, part 3 (or the repeat) is offered. */
async function outerQuests(ctx, epoch) {
  const d = ctx.data;
  if (d.offering) return;
  d.offering = true;
  try {
    if (ctx.quest(PART2).active()) {
      squidTalk(ctx, true);
      await ctx.quest(PART2).turnIn();
      squidTalk(ctx, false);
    }
    if (!live(ctx, epoch)) return;
    const third = thirdPartFor(ctx.engine.questState);
    if (!ctx.quest(PART3).active() && !ctx.quest(PART3_REPEAT).active()) {
      squidTalk(ctx, true);
      const yes = await ctx.offerQuest(third, { kicker: 'Zzybzfrx' });
      squidTalk(ctx, false);
      if (!yes || !live(ctx, epoch)) {
        d.declinedAt = Date.now();
        return;
      }
    }
    await stepInside(ctx, 2200);
    if (live(ctx, epoch)) ctx.gotoStage('inner_mind');
  } finally {
    d.offering = false;
  }
}

function tickOuter(ctx, dtMs, now) {
  const d = ctx.data;
  const L = d.outer;
  const p = ctx.player;
  if (!p || !L) return;
  // The eyes follow you.
  for (const eye of d.eyes || []) {
    if (eye.destroyed) continue;
    const ang = Math.atan2(p.y - 60 - eye.y, p.x - eye.x);
    eye.iris.x = Math.cos(ang) * eye.r * 0.42;
    eye.iris.y = Math.sin(ang) * eye.r * 0.42;
  }
  if (!free(ctx)) return;
  if (!d.vogShown && p.x >= L.vogX) {
    // innermind_vog_interrupt (once: pc['!innermind_vog_interrupt_collided']).
    d.vogShown = true;
    vog(ctx, VOG_LINES);
    return;
  }
  const onMouth = (box) => p.x >= box.x1 && p.x <= box.x2 && p.y <= box.yMax;
  if (!d.appeared && onMouth(L.appear)) {
    makeAppear(ctx, d.epoch);
    return;
  }
  if (d.appeared && !d.ended && onMouth(L.endBox)) {
    d.ended = true; // end_squiddy_convo (once)
    finalConvo(ctx, d.epoch);
    return;
  }
  // mindState 6 (offer declined): bumping into the squid offers again.
  if (d.mindState === 6 && !d.offering && d.squid?.shown && Math.abs(p.x - d.squid.c.x) < HIT_HALF && Math.abs(p.y - d.squid.c.y) < HIT_HALF && now - (d.declinedAt || 0) > 4000) {
    outerQuests(ctx, d.epoch);
  }
}

/* ------------------------------------------------------------------ */
/* The Inner Mind                                                       */
/* ------------------------------------------------------------------ */

/** Where each arbito1.swf shard meets its own reflection: a fraction of the art's height, measured off the renders. */
export const INNER_BASE = Object.freeze({
  object_1: 0.684, object_2: 0.698, object_3: 0.57, object_3b: 0.57, object_3c: 0.57, object_4: 0.721, object_4b: 0.721,
  object_5: 0.769, object_6: 0.771, object_7: 0.72, object_8: 0.785, object_9: 0.751, object_10: 0.06, object_10b: 0.06, platform_2b: 0.12,
});
const INNER_ART = `${ART}inner_mind/`;

/** An arbito1.swf piece standing at (x, baseY): its base on the line, its reflection below it. */
function innerArt(PIXI, name, x, baseY, { scale = 1, sy = scale, alpha = 1, flip = false } = {}) {
  const [file] = GWENDOLYN_INNER_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${INNER_ART}${file}`));
  spr.anchor.set(0.5, INNER_BASE[name] ?? 1);
  spr.scale.set(flip ? -scale : scale, sy);
  spr.x = x;
  spr.y = baseY;
  spr.alpha = alpha;
  spr.eventMode = 'none';
  return spr;
}

/** A glass shelf (platform_2b) stretched along a glass platform. */
function glassShelf(PIXI, x1, x2, y) {
  const [file, w, h] = GWENDOLYN_INNER_FILES.platform_2b;
  const spr = new PIXI.Sprite(textureFromUrl(`${INNER_ART}${file}`));
  spr.anchor.set(0.5, INNER_BASE.platform_2b);
  spr.scale.set((x2 - x1 + 18) / w, 30 / h);
  spr.x = (x1 + x2) / 2;
  spr.y = y;
  spr.eventMode = 'none';
  return spr;
}

function drawExitArrow(PIXI, kit, x, y) {
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.moveTo(-70, -14).lineTo(10, -14).lineTo(10, -34).lineTo(64, 0).lineTo(10, 34).lineTo(10, 14).lineTo(-70, 14).closePath().fill(0xc9b2ff);
  g.moveTo(10, -34).lineTo(64, 0).lineTo(10, 0).closePath().fill({ color: 0xff8bc8, alpha: 0.85 });
  g.moveTo(10, 34).lineTo(64, 0).lineTo(10, 0).closePath().fill({ color: 0x7fe0f2, alpha: 0.85 });
  c.addChild(g);
  c.addChild(kit.label(PIXI, 'EXIT', -26, 0, { size: 18, fill: 0xffffff, stroke: { color: 0x7a5fc0, width: 4 },  weight: '900' }));
  c.x = x;
  c.y = y;
  return c;
}

function buildInner(ctx) {
  const { PIXI, kit } = ctx;
  const L = innerLayout(kit);
  const root = kit.sceneRoot(PIXI, L.W, L.H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#ffffff'], [0.7, '#fbfaff'], [1, '#f1f0f8']], 960, 640));
  // Faded shards far behind, nearer ones in between.
  for (const band of [L.far, L.mid]) {
    const layer = root.layer(band.factor, band === L.far ? 1 : 2);
    for (const sh of band.shards) layer.addChild(innerArt(PIXI, sh.art, sh.x, band.base, { scale: sh.scale, alpha: band.alpha, flip: sh.flip }));
  }
  const world = root.layer(1, 3);
  // A glossy white floor with soft reflections.
  const floor = new PIXI.Graphics();
  floor.rect(0, L.FLOOR, L.W, 120).fill(0xffffff);
  floor.rect(0, L.FLOOR, L.W, 3).fill({ color: 0xe9e5f6, alpha: 0.8 });
  world.addChild(floor);
  // Purple lightning cracks across the floor: the fissure's far wall (object_10) with the floor's
  // near lip (object_10b) over it, so a jagged purple sliver shows, as in the Snaps.
  L.cracks.forEach((c, i) => {
    world.addChild(innerArt(PIXI, 'object_10', c.x, L.FLOOR, { scale: c.w, sy: 1, flip: i % 2 === 1 }));
    world.addChild(innerArt(PIXI, 'object_10b', c.x, L.FLOOR + 16, { scale: c.w * 1.04, sy: 1, flip: i % 2 === 1 }));
  });
  // The two jellies (the orange one is the first wall), the other walls' shards, the decor shards.
  for (const j of L.jellies) world.addChild(innerArt(PIXI, j.art, j.x, L.FLOOR, { scale: j.scale }));
  for (const c of L.crystals.filter((w) => w.art !== 'object_4b')) world.addChild(innerArt(PIXI, c.art, (c.x1 + c.x2) / 2, L.FLOOR));
  for (const f of L.front) world.addChild(innerArt(PIXI, f.art, f.x, L.FLOOR, { scale: f.scale, flip: f.flip }));
  for (const dome of L.domes) world.addChild(innerArt(PIXI, dome.art, dome.x, L.FLOOR + 4));
  // Glass stairs, shelves and ledges.
  for (const p of L.platforms.filter((q) => q.style === 'glass')) world.addChild(glassShelf(PIXI, p.x1, p.x2, p.y1));
  world.addChild(drawExitArrow(PIXI, kit, L.exit.x, L.FLOOR - 120));
  return {
    label: INSTANCES.inner_mind.label,
    width: L.W,
    height: L.H,
    background: root,
    platforms: L.platforms,
    barriers: L.barriers,
    spawn: L.spawn,
  };
}

function enterInner(ctx) {
  const { PIXI, kit } = ctx;
  const L = innerLayout(kit);
  ctx.data.inner = L;
  ctx.data.quoins = L.quoins.map((q, i) => {
    const spr = ctx.add(ctx.quoinSprite(q.type, q.x, q.y, 0.62), 30);
    return { ...q, id: `im${i}`, spr, taken: false };
  });
  const drink = new PIXI.Container();
  drink.addChild(kit.icon(PIXI, 'gurly_drink', 0, 0, { scale: 0.85 }));
  drink.x = L.drink.x;
  drink.y = L.drink.y;
  ctx.add(drink, 32);
  ctx.data.drink = ctx.register({ classId: 'gurly_drink', label: 'Gurly Drink', subtitle: 'Put it in your pack', sprite: drink });
  ctx.data.drinkTaken = false;
  startMusic(ctx, MEDITATION_MUSIC.MEDITATIVE_ARTS_02);
}

function takeDrink(ctx) {
  if (ctx.data.drinkTaken) return;
  ctx.data.drinkTaken = true;
  const t = ctx.data.drink;
  ctx.give('gurly_drink', 1);
  ctx.floatText(t.sprite.x, t.sprite.y - 40, '+1 Gurly Drink', '#ffffff');
  ctx.sound('ITEM_PICKUP', { volume: 0.5 });
  t.sprite.visible = false;
  ctx.unregister(t);
}

function tickInner(ctx, dtMs, now) {
  const d = ctx.data;
  const L = d.inner;
  const p = ctx.player;
  if (!p || !L) return;
  const t = now / 1000;
  for (const q of d.quoins || []) {
    if (q.taken || !q.spr || q.spr.destroyed) continue;
    q.spr.y = q.y + Math.sin(t * 3 + q.x / 90) * 5;
    if (Math.abs(p.x - q.x) < 30 && p.y - 80 < q.y + 16 && p.y + 6 > q.y - 16) {
      q.taken = true;
      q.spr.visible = false;
      d.quoinsTaken = (d.quoinsTaken || 0) + 1;
      ctx.collectQuoin(q.type, q.x, q.y);
    }
  }
  if (!d.drinkTaken && Math.abs(p.x - L.drink.x) < 34 && Math.abs(p.y - L.drink.y) < 24) takeDrink(ctx);
  if (!free(ctx) || d.across) return;
  if (p.x >= L.exit.x - L.exit.w / 2 && p.y > L.FLOOR - L.exit.h) {
    // crystine_across: on to Gwendolyn's Chamber.
    d.across = true;
    ctx.gotoStage('chamber');
  }
}

/* ------------------------------------------------------------------ */
/* Gwendolyn's Chamber                                                  */
/* ------------------------------------------------------------------ */

function drawGroveTree(PIXI, x, floor, h, s, shade) {
  const g = new PIXI.Graphics();
  const trunk = shade.trunk;
  g.moveTo(x, floor).bezierCurveTo(x - 8 * s, floor - h * 0.4, x + 10 * s, floor - h * 0.7, x, floor - h);
  const branches = [[-1, 0.45, 0.7], [1, 0.55, 0.6], [-1, 0.72, 0.5], [1, 0.82, 0.45]];
  g.stroke({ width: 14 * s, color: trunk, cap: 'round' });
  const ends = [];
  for (const [dir, at, len] of branches) {
    const by = floor - h * at;
    const ex = x + dir * h * 0.32 * len;
    const ey = by - h * 0.18 * len;
    g.moveTo(x, by).quadraticCurveTo(x + dir * h * 0.12, by - 10, ex, ey);
    ends.push([ex, ey]);
  }
  ends.push([x, floor - h]);
  g.stroke({ width: 6 * s, color: trunk, cap: 'round' });
  for (const [i, [ex, ey]] of ends.entries()) {
    const r = (i === ends.length - 1 ? 34 : 24) * s;
    g.circle(ex, ey - r * 0.6, r).fill(shade.leaf);
    g.circle(ex, ey - r * 0.6, r * 0.62).stroke({ width: 3 * s, color: shade.edge, alpha: 0.9 });
  }
  return g;
}

function buildChamber(ctx) {
  const { PIXI, kit } = ctx;
  const L = chamberLayout(kit);
  const root = kit.sceneRoot(PIXI, L.W, L.H);
  const back = root.layer(0, 0);
  back.addChild(kit.gradient(PIXI, [[0, '#030504'], [0.7, '#0a0e0c'], [1, '#111613']], 960, 640));
  const far = root.layer(0.5, 1);
  for (let i = 0; i < 7; i++) far.addChild(drawGroveTree(PIXI, 80 + i * 210, 700, 300 + (i % 3) * 60, 0.7, { trunk: 0x1b201e, leaf: 0x171c1a, edge: 0x252b28 }));
  const world = root.layer(1, 2);
  for (const t of L.trees) world.addChild(drawGroveTree(PIXI, t.x, L.FLOOR, t.h, t.s, { trunk: 0x3a413e, leaf: 0x2b312f, edge: 0x59625e }));
  const ground = new PIXI.Graphics();
  ground.rect(0, L.FLOOR, L.W, 120).fill(0x070908);
  for (let x = 30; x < L.W; x += 46) {
    const k = kit.hash01(`g${x}`);
    ground.ellipse(x + k * 20, L.FLOOR + 2, 16 + k * 10, 5).fill(0x1f2623);
  }
  world.addChild(ground);
  // A soft light where you came in (gwendolyn_chamber_exit).
  const exitGlow = new PIXI.Graphics();
  for (let i = 5; i >= 1; i--) exitGlow.ellipse(L.exit.x, L.FLOOR - 70, 26 + i * 12, 70 + i * 10).fill({ color: 0xcfe9e4, alpha: 0.05 * (6 - i) });
  world.addChild(exitGlow);
  return {
    label: INSTANCES.chamber.label,
    width: L.W,
    height: L.H,
    background: root,
    platforms: L.platforms,
    spawn: L.spawn,
  };
}

function enterChamber(ctx) {
  const { PIXI } = ctx;
  const L = chamberLayout(ctx.kit);
  ctx.data.chamber = L;
  const glow = new PIXI.Graphics();
  for (let i = 6; i >= 1; i--) glow.circle(0, -90, 40 + i * 22).fill({ color: 0xa9f0ff, alpha: 0.035 * (7 - i) });
  glow.x = L.gwen.x;
  glow.y = L.gwen.y;
  ctx.add(glow, 38);
  ctx.data.gwenGlow = glow;
  const gwen = makeActor(ctx, 'gwendolyn', SHEETS.gwendolyn, [56 / 116, 171 / 191], 0.4);
  gwen.c.x = L.gwen.x;
  gwen.c.y = L.gwen.y;
  ctx.add(gwen.c, 40);
  playActor(gwen, 'idle');
  gwen.target = ctx.register({ classId: 'npc_gwendolyn', label: 'Ghost of Gwendolyn', subtitle: 'Speak. With words', sprite: gwen.c });
  ctx.data.gwen = gwen;
  if (chainFinished(ctx.engine.questState)) ctx.solve();
}

/** npc_gwendolyn onPlayerCollision -> offerQuests: part 3 (or the repeat) turns in here. */
async function gwendolynTalk(ctx, epoch) {
  const d = ctx.data;
  if (d.talking) return;
  d.talking = true;
  playActor(d.gwen, 'talk');
  try {
    for (const id of [PART3, PART3_REPEAT]) {
      if (!ctx.quest(id).active()) continue;
      await ctx.quest(id).turnIn();
      if (!live(ctx, epoch)) return;
      d.gwenDone = true;
      ctx.solve();
      ctx.activity('Gwendolyn fades back into the dark. The way out is behind you.');
    }
  } finally {
    d.talking = false;
    d.talkCooldownAt = Date.now() + 3000;
    // resumeIdling after 3000 ms.
    setTimeout(() => { if (d.gwen && !d.gwen.spr.destroyed) playActor(d.gwen, 'idle'); }, 3000);
  }
}

function leaveChamber(ctx) {
  if (ctx.data.exiting) return;
  ctx.data.exiting = true;
  // teleportToLocationDelayed('LTJ10M515812V0C', 102, -534): Corridor Five.
  if (ctx.run) ctx.run.returnTo = { tsid: CHAMBER_EXIT.tsid, x: CHAMBER_EXIT.x, y: CHAMBER_EXIT.y };
  ctx.leave({ transition: ctx.fx() });
}

function tickChamber(ctx, dtMs, now) {
  const d = ctx.data;
  const L = d.chamber;
  const p = ctx.player;
  if (!p || !L) return;
  if (d.gwenGlow && !d.gwenGlow.destroyed) d.gwenGlow.alpha = 0.8 + Math.sin(now / 900) * 0.2;
  if (d.gwen && !d.gwen.c.destroyed) d.gwen.c.y = L.gwen.y + Math.sin(now / 1100) * 4;
  if (!free(ctx)) return;
  const ready = ctx.quest(PART3).active() || ctx.quest(PART3_REPEAT).active();
  if (ready && !d.talking && Math.abs(p.x - L.gwen.x) < HIT_HALF && now > (d.talkCooldownAt || 0)) {
    gwendolynTalk(ctx, d.epoch);
    return;
  }
  if (ctx.run?.status === 'solved' && p.x <= L.exit.x + 30) leaveChamber(ctx);
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

const THEMES = { desert: 'warm', outer_mind: 'lab', inner_mind: 'memory', chamber: 'dark' };
let themeStage = 'desert';

export const room = {
  id: ROOM_ID,
  title: "Gwendolyn's Task",
  kicker: 'A vision quest',
  icon: `${ART}gwendolyn_icon.png`,
  hubName: 'A vision quest',
  durationMs: 0, // exit_delay is the "Are you stuck?" prompt, not a clock
  doneLabel: 'Go back',
  leaveText: 'Leave the vision quest? Gwendolyn’s Task will start over from Area 42.',
  travelText: 'There is no way out of your own head from here. Use Leave to go back.',
  get theme() {
    return THEMES[themeStage] || 'memory';
  },

  firstStage: (questId) => stageForQuest(questId),

  stageLabel(stage) {
    if (STAGES.includes(stage)) themeStage = stage;
    return INSTANCES[stage]?.label || INSTANCES.desert.label;
  },

  hudTitle(ctx) {
    return TITLES[currentPart(ctx)] || TITLES[ctx.questId] || TITLES[TASK];
  },

  street(ctx, stage) {
    if (stage !== 'desert') return null;
    return { tsid: DESERT_STREET, x: dx(INSTANCES.desert.x), y: dy(INSTANCES.desert.y) };
  },

  build(ctx, stage) {
    if (stage === 'outer_mind') return buildOuter(ctx);
    // The Inner Mind's white void keeps its own light (no Dametime tint, G99).
    if (stage === 'inner_mind') return { ...buildInner(ctx), ownLight: true };
    return buildChamber(ctx);
  },

  enter(ctx, stage) {
    themeStage = stage;
    stopMusic(ctx);
    clearScreen();
    const d = ctx.data;
    const keep = { epoch: (d.epoch || 0) + 1, stopMusic: null, musicToken: d.musicToken };
    for (const key of Object.keys(d)) if (!key.startsWith('_')) delete d[key];
    Object.assign(d, keep);
    resetStuck(ctx);
    if (stage === 'desert') enterDesert(ctx);
    else if (stage === 'outer_mind') enterOuter(ctx);
    else if (stage === 'inner_mind') enterInner(ctx);
    else enterChamber(ctx);
    ctx.data.momentDraw = null;
  },

  tick(ctx, dtMs, now) {
    const d = ctx.data;
    d.momentDraw?.(now);
    const stage = ctx.stage;
    if (stage === 'desert') tickDesert(ctx, dtMs, now);
    else if (stage === 'outer_mind') tickOuter(ctx, dtMs, now);
    else if (stage === 'inner_mind') tickInner(ctx, dtMs, now);
    else if (stage === 'chamber') tickChamber(ctx, dtMs, now);
    // instances_show_exit_prompt every 2 minutes (not in the chamber).
    if (d.stuckAt && now >= d.stuckAt && free(ctx) && !d.offering && !d.scriptRunning) {
      d.stuckAt = 0;
      // G304: a prompts_add with icon_buttons (inc_instances.js 322-344): the prompt stack.
      ctx.prompt({
        text: STUCK_TEXT,
        iconButtons: true,
        choices: [{ label: 'Yes, please', value: 'yes' }, { label: 'No thanks', value: 'no' }],
      }).then((choice) => {
        if (choice === 'yes') ctx.leave();
        else if (choice === 'no') resetStuck(ctx); // instances_exit_via_prompt 'no': ask again in 2 * 60
      });
    }
  },

  verbs(ctx, target) {
    const d = ctx.data;
    if (target === d.squid?.target) {
      const can = d.squid.shown && !d.offering && ((ctx.stage === 'desert' && d.desertState === 29) || (ctx.stage === 'outer_mind' && d.mindState === 6));
      return [{ id: 'talk_to', label: 'Talk to', enabled: can, tooltip: 'Squirt. Squirt' }];
    }
    if (target === d.cactus?.target) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !d.cactusTalked, tooltip: 'Mind the needles...' }];
    }
    if (target === d.gwen?.target) {
      const can = !d.talking && (ctx.quest(PART3).active() || ctx.quest(PART3_REPEAT).active());
      return [{ id: 'talk_to', label: 'Talk to', enabled: can, tooltip: 'Speak. With words' }];
    }
    if (target === d.drink) return [{ id: 'pick_up', label: 'Pick up', enabled: !d.drinkTaken, tooltip: 'Put it in your pack' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    const d = ctx.data;
    if (target === d.squid?.target && verbId === 'talk_to') {
      if (ctx.stage === 'desert') desertQuests(ctx, d.epoch);
      else outerQuests(ctx, d.epoch);
      return true;
    }
    if (target === d.cactus?.target && verbId === 'talk_to') {
      if (!d.cactusTalked) cactusRant(ctx, d.epoch);
      return true;
    }
    if (target === d.gwen?.target && verbId === 'talk_to') {
      gwendolynTalk(ctx, d.epoch);
      return true;
    }
    if (target === d.drink && verbId === 'pick_up') {
      takeDrink(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const d = ctx.data;
    const stage = ctx.stage;
    const heat = d.heat ? [[HEAT[d.heat].name, `-${HEAT[d.heat].mood} mood`]] : [];
    if (stage === 'desert') {
      let text = 'It is scorching out here. Look around Area 42.';
      if (d.desertState >= 0 && d.desertState < 2) text = 'Something has appeared beside you.';
      else if (d.desertState >= 2 && d.desertState < 17) text = 'Follow Zzybzfrx.';
      else if (d.desertState >= 17) text = 'Listen to Zzybzfrx.';
      return { text, stats: heat };
    }
    if (stage === 'outer_mind') {
      const text = d.appeared ? 'Go to Zzybzfrx.' : 'Walk the path. Your nearest exit may be above you.';
      return { text, stats: [] };
    }
    if (stage === 'inner_mind') {
      return { text: 'Cross the Inner Mind to the exit.', stats: [['quoins', `${d.quoinsTaken || 0}/${d.inner?.quoins.length || 0}`]] };
    }
    if (ctx.run?.status === 'solved') return { text: 'Go back the way you came in.', stats: [] };
    return { text: 'Speak with Gwendolyn.', stats: [] };
  },

  physics(ctx) {
    // The VOG overlay locks you in place, as does the step inside.
    return ctx.data.vogOpen || ctx.data.moment ? { speed: 0, jump: 0 } : null;
  },

  onLeave(ctx, outcome) {
    stopMusic(ctx);
    clearScreen();
    heatBuff(ctx, null);
    if (ctx.player) ctx.player.pivot.y = 0;
    if (outcome === 'complete' || chainFinished(ctx.engine.questState)) return { leaveFlag: false, noTurnIn: true };
    // location.js onPlayerEnter: leaving before part 3 is done fails the whole chain.
    resetChain(ctx.engine.questState);
    ctx.quest(TASK).fail();
    ctx.activity("You left the vision quest. Gwendolyn's Task starts over; the Magic Rock can take you back.");
    return { keepQuest: true, leaveFlag: false, noTurnIn: true };
  },

  clear(ctx) {
    stopMusic(ctx);
    clearScreen();
    heatBuff(ctx, null);
    if (ctx.player) ctx.player.pivot.y = 0;
  },

  publish(ctx) {
    const d = ctx.data;
    ctx.setData('gwenStage', ctx.stage || '');
    ctx.setData('gwenDesertState', String(d.desertState ?? ''));
    ctx.setData('gwenMindState', String(d.mindState ?? ''));
    ctx.setData('gwenHeat', d.heat || '');
    ctx.setData('gwenCool', d.cool ? '1' : '0');
    ctx.setData('gwenMoodLost', String(d.moodLost || 0));
    ctx.setData('gwenSquid', d.squid ? `${d.squid.shown ? 'shown' : 'hidden'}:${Math.round(d.squid.c.x)},${Math.round(d.squid.c.y)}` : '');
    ctx.setData('gwenSwoons', String(d.swoonCount || 0));
    ctx.setData('gwenVogShown', d.vogShown ? '1' : '0');
    ctx.setData('gwenQuoins', String(d.quoinsTaken || 0));
    ctx.setData('gwenDrink', d.drinkTaken ? '1' : '0');
    ctx.setData('gwenQuests', CHAIN.map((id) => `${id}:${questStatus(ctx, id)}`).join(','));
    ctx.setData('gwenPlayer', ctx.player ? `${Math.round(ctx.player.x)},${Math.round(ctx.player.y)}` : '');
  },

  async autoplay(ctx, mode) {
    const drive = async (until, ms = 90_000) => {
      const end = Date.now() + ms;
      while (Date.now() < end && ctx.run && ctx.run.status !== 'left') {
        if (until()) return true;
        if (ctx.data.vogNext) ctx.data.vogNext();
        else if (ctx.dialogOpen()) ctx.advanceDialog();
        else ctx.advanceAward();
        await ctx.wait(250);
      }
      return until();
    };
    await ctx.wait(800);
    if (ctx.stage === 'desert') {
      // Walk up to the cactus, then keep beside the squid through its script.
      ctx.place(dx(CACTUS.x) - 150, dy(CACTUS.y) - 10);
      await drive(() => ctx.data.desertState >= 0);
      ctx.place(ctx.data.squid.c.x + 60, dy(CACTUS.y) - 10);
      await drive(() => {
        const s = ctx.data.squid;
        if (s && (ctx.data.desertState === 12 || ctx.data.desertState === 16) && Math.abs(ctx.player.x - s.c.x) > 120) {
          ctx.place(s.c.x + 60, ctx.player.y - 10);
        }
        return ctx.stage !== 'desert';
      }, 120_000);
      if (mode === 'desert') return 'desert';
    }
    if (ctx.stage === 'outer_mind') {
      const L = ctx.data.outer;
      ctx.place(L.vogX + 20, L.FLOOR - 8);
      await drive(() => ctx.data.vogShown && !ctx.data.vogOpen);
      ctx.place(700, L.appear.yMax - 40);
      await drive(() => ctx.data.mindState === 3);
      ctx.place(L.squid.x + 60, L.appear.yMax - 40);
      await drive(() => ctx.stage !== 'outer_mind');
      if (mode === 'outer') return 'outer';
    }
    if (ctx.stage === 'inner_mind') {
      const L = ctx.data.inner;
      for (const q of L.quoins) {
        ctx.place(q.x, q.y + 20);
        await ctx.wait(220);
      }
      ctx.place(L.drink.x, L.drink.y - 6);
      await drive(() => ctx.data.drinkTaken, 4000);
      ctx.place(L.exit.x, L.FLOOR - 8);
      await drive(() => ctx.stage !== 'inner_mind');
      if (mode === 'inner') return 'inner';
    }
    if (ctx.stage === 'chamber') {
      const L = ctx.data.chamber;
      ctx.place(L.gwen.x - 140, L.FLOOR - 8);
      await drive(() => ctx.run?.status === 'solved');
      if (mode === 'chamber') return 'chamber';
      ctx.place(L.exit.x + 10, L.FLOOR - 8);
      await drive(() => !ctx.run || ctx.run.status === 'left', 8000);
    }
    return 'complete';
  },

  world: {
    /** location.js onPlayerEnter: a later part open on an ordinary street fails the chain. */
    onStreetEnter(wctx) {
      const qs = wctx.engine.questState;
      if (!chainBroken(qs)) return;
      resetChain(qs);
      wctx.quest(TASK).fail();
      wctx.activity("You left the vision quest. Gwendolyn's Task starts over; the Magic Rock can take you back.");
      wctx.save();
    },
  },
};

