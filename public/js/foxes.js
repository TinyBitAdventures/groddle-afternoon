/**
 * Fox Brushing Preserves: pure rules for wild Foxes, Fox Bait, the Fox Brush,
 * and the Fox Ranger. No Pixi, no DOM; js/features/foxes-feature.js binds it
 * to the world.
 *
 * Sources (glitch-GameServerJS, CC0):
 * - items/npc_fox.js: brush verb, endBrushing yields/counters/Fleet Foxer,
 *   startMoving/onPathing (bait, stop marker, ranger targeting), leave rules
 * - items/fox_bait.js + locations/location.js dropFoxBaits +
 *   locations/inc_npcs.js spawn_fox: ignite gate, three falling baits, spawn
 * - items/fox_brush.js: tool_base capacity 100, base cost 200
 * - items/npc_fox_ranger.js: talk/tips/shop verbs, every conversation line,
 *   license sale, collision greeting, and the entrance gate
 * - items/catalog_skill_packages.js `fox_brushing`; catalog_stores.js store 22
 * - achievements/*foxbrusher*.js, fleet_foxer.js, fox_tourist.js
 */

import { addItem, countItem, ensureItem } from './inventory.js?v=catalog-unified-3';
import { canUseTool, useToolCondition } from './tools.js';
import { foxBrushingCard, scaledToolWear } from './imagination-effects.js';
import { grantMoodXp } from './mood-xp.js';

export const FOX_ID = 'npc_fox';
export const FOX_RANGER_ID = 'npc_fox_ranger';
export const FOX_BRUSH_ID = 'fox_brush';
export const FOX_BAIT_ID = 'fox_bait';
export const FIBER_ID = 'fiber';
export const FOX_STOP_MARKER_ID = 'fox_stop_marker';
export const FOX_LICENSE_ACHIEVEMENT = 'fox_brushing_license';
export const FLEET_FOXER_ACHIEVEMENT = 'fleet_foxer';
export const FOX_TOURIST_ACHIEVEMENT = 'fox_tourist';
export const FOX_BRUSHING_SKILL = 'foxbrushing_1';

/** catalog_skill_packages.js `fox_brushing` (no duration: brushing is instant). */
export const FOX_BRUSHING_PACKAGE = Object.freeze({
  no_skill: Object.freeze({ rank: -1, successRate: 100, energyCost: 5, toolWear: 2, xpBonus: 2 }),
  foxbrushing_1: Object.freeze({ rank: 0, successRate: 100, energyCost: 5, toolWear: 1, xpBonus: 4 }),
});

/** npc_fox.js endBrushing: randInt(16, 24), +10/+12 with Fox Brushing. */
export const FOX_FIBER_RANGE = Object.freeze({ base: [16, 24], skillBonus: [10, 12] });

/** Store 22 in catalog_stores.js (buy_multiplier 0: the Ranger never buys back). */
export const FOX_RANGER_STORE = Object.freeze({
  storeId: 22,
  name: 'Fox Ranger',
  buyMultiplier: 0,
  items: Object.freeze([
    Object.freeze({ classTsid: FOX_BRUSH_ID, cost: 200 }),
    Object.freeze({ classTsid: FOX_BAIT_ID, cost: 30 }),
  ]),
});

/** npc_fox_ranger.js onConversation `buy-license*`, `give-brush`, `give-bait`. */
export const FOX_LICENSE = Object.freeze({ cost: 500, brush: 1, bait: 5 });

export const FOX_ITEM_DEFS = Object.freeze({
  [FOX_BRUSH_ID]: Object.freeze({
    label: 'Fox Brush',
    namePlural: 'Fox Brushes',
    desc: 'One finely crafted Brush for the grooming of fantastic foxes and removing fine Fibers from their bushy tails.',
    isTool: true,
    baseCost: 200,
    stackMax: 1,
  }),
  [FOX_BAIT_ID]: Object.freeze({
    label: 'Fox Bait',
    namePlural: 'Fox Baits',
    desc: "A nugget of fox-pleasing goodness, filled with every fox's favourite flavours. Proof positive that you catch more foxes with Fox Bait than you do with vinegar (just in case anyone suggested the alternative, which on reflection seems unlikely).",
    baseCost: 30,
    stackMax: 100,
  }),
  [FIBER_ID]: Object.freeze({
    label: 'Fiber',
    namePlural: 'Fibers',
    desc: 'A patch of downy hair brushed from the tail of a fox, perfect for spinning into thread or stuffing into furniture for padding.  Also might be perfect for gluing to your face as a moustache, but due to its origin (the underside of a fox tail), no one does.',
    baseCost: 1,
    stackMax: 999,
  }),
});

/** Movement and timer constants straight from the server scripts. */
export const FOX_TIMING = Object.freeze({
  runSpeed: 500, // onCreate: npc_walk_speed = 500 (the `|| 1` branch is always taken)
  edgeInset: 100, // startMoving: geo.l + 100 / geo.r - 100
  targetMinGap: 100, // bait/marker search ignores items within 100 px
  rangerMinGap: 20,
  arriveRadius: 100, // onPathing: bait/marker "here" within 100 px
  markerPauseMs: 1000, // 'pause' then startMoving after 1 s
  eatMs: 500, // eatStart -> eat at 500 ms
  eatEndMs: 1000, // eat -> eatEnd at 1000 ms
  eatResumeMs: 2500, // startMoving at 2500 ms
  brushCooldownMs: 2000, // time() - pc['!last_fox_brush'] < 2
  brushDisableMs: 2000, // fox_brush.disable() re-enables after 2 s
  maxBrushes: 21,
  maxBrushers: 3,
  fleetWindowS: 10,
  fleetCount: 3,
  spawnDelayMs: 4000, // fox_bait ignite: apiSetTimer('spawn_fox', 4000)
  baitDropDelayMs: 2000, // apiSetTimerX('dropFoxBaits', 2000)
  baitLandMs: 1000, // s.apiSetTimer('land', 1000)
  baitExpireMs: 5 * 60 * 1000, // s.apiSetTimer('expire', 5*60*1000)
  respawnAfterLeaveMs: 10000, // container.apiSetTimer('spawn_fox', 10000)
  baitDropCount: 3,
  baitDropSpacing: 300,
  baitDropSpread: 400, // randInt(pc.x, pc.x - 400)
  baitDropHeight: 1000, // created at pc.y - 1000 and left to fall
  igniteRangerDistance: 600,
  baitCrowdRadius: 400,
  baitCrowdMax: 4, // baits.length > 4 blocks a fifth
  exitBeyondSpawner: 500, // leaving: spawner.x -/+ 500
  rangerHitBoxW: 250, // apiSetHitBox(250, 1000)
  rangerHitBoxH: 1000,
  rangerPushBack: 100, // moveAvatar(ranger.x +/- 100)
  overCapacity: 8,
});

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Split a GSJS `<split butt_txt="...">` conversation into stepped beats. */
export function splitConversation(text, finalResponse = 'OK') {
  const parts = String(text).split(/<split\s+butt_txt="([^"]*)"\s*\/?>/);
  const beats = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = strip(parts[i]);
    if (!body) continue;
    beats.push({ text: body, response: parts[i + 1] != null ? parts[i + 1] : finalResponse });
  }
  return beats;
}

const TIPS_BODY =
  'Don’t waste your bait: have a look to see if there are already foxes around before you ignite any bait.<split butt_txt="Makes sense">To ensure success, drag the Brush out of your inventory and then release it when the brush is over a fox.<split butt_txt="Right">Foxes move very fast, but stop to eat bait and occasionally to peek out from breaks in the foliage so keep an eye out.<split butt_txt="Yep">That’s it. Get in there and get yourself some fiber!';

/** Every Fox Ranger line, verbatim from npc_fox_ranger.js. `{name}` is the player. */
export const FOX_RANGER_TEXT = Object.freeze({
  description:
    'Guardian of the Fox Reserves, it is up to each individual Fox Ranger to ensure that only proper Fox Bait is used to lure foxes, and not, say, cheese, which makes them cough. They are also in charge of making sure people use the right brush, and don’t steal the foxes.',
  talkTooltip: 'He looks friendly, enough',
  tipsTooltip: 'Need help?',
  shopTooltip: 'Buy things',
  firstVisit: 'Hello {name}. This is a Fox Brushing Preserve and I am the local Ranger. Would you like me to explain how things work?',
  returnNoIntro: 'Welcome back, {name}. Are you ready to learn about Fox Brushing now?',
  returnNoLicense: 'Welcome back, {name}. Are you ready to buy a license?',
  explainAgain: 'Could you explain how it works again?',
  overCapacity: 'Welcome back, {name}. I’m sorry but the preserve is currently over capacity. You’ll have to wait for someone to leave before you can enter.',
  noBrush: 'Welcome back, {name}. I see that you don’t have a brush. That doesn’t seem right.',
  noBait: 'Welcome back, {name}. Looks like you’re out of bait. If you need some, I’m your ranger.',
  greetings: Object.freeze([
    'Welcome back, {name}. Good day for brushing!',
    'Hello there {name}: may your bait always be stinky and your brush quick.',
    'Ah, {name}. Be sure to be very, very quiet … there are foxes about!',
  ]),
  talkIntroOffer: 'Ah — would you like to hear my introduction to Fox Brushing Preserves?',
  talkLicenseOffer: 'Ah — you’d like to hear about the licenses?',
  cancel: 'OK well then, if you change your mind, any of us rangers can tell you about Fox Brushing Preserves.',
  intro:
    'Very well. These preserves were created 1,083 generations ago to prevent the over-brushing of foxes. Only those licensed to brush may enter.<split butt_txt="Uh huh">Foxes may only be brushed with regulation <a href="event:item|fox_brush">Fox Brushes</a> and they will almost certainly never appear unless some <a href="event:item|fox_bait">Bait</a> is provided for them to enjoy.<split butt_txt="Of course">Once the bait is ignited, the fox’s entrance will be swift: be quick with your brush and you’ll be rewarded with plenty of <a href="event:item|fiber">Fiber</a>.<split butt_txt="Sounds easy">Very well. Are you interested in obtaining a license?',
  noBuy: 'OK well then, if you change your mind, just let me know.',
  tooPoor: 'Sorry, but licenses cost <b>500 currants</b>. Come back when you’ve saved up enough.',
  licenseOffer: 'The price is 500 currants — but the license is good for a lifetime. And if you buy one today, I will include a Brush and a five-pack of Bait for free.',
  noBuyLicense: 'OK well then, if you change your mind, my offer stands.',
  giveBrush: "Ok, and here's your brush.",
  giveBait: "Ok, and here's your bait.",
  enter: `OK! Now you have everything you need and you can enter the preserve. But first, a few tips …<split butt_txt="OK">When you go out into the preserve, have a look if there are any foxes around before you ignite any bait. No sense wasting bait.<split butt_txt="Makes sense">To ensure success, drag the Brush out of your inventory and then release it when the brush is over a fox.<split butt_txt="Right">Foxes move very fast, but stop to eat bait and occasionally to peek out from breaks in the foliage so keep an eye out.<split butt_txt="Yep">That’s it. Get in there and get yourself some fiber!`,
  tips: TIPS_BODY,
  overCapacityThanks: 'Thanks for understanding. You can wait here or try another preserve.',
  gateNoLicense: 'I’m sorry, but no-one may enter without a license.',
  gateOverCapacity: 'For everyone’s safety, I am not permitted to let you in until someone else leaves.',
  gateNoBrush: 'There’s really no point going in there without a brush.',
  confused: "Shucks, I'm afraid I don't follow...",
});

/** npc_fox.js responses + activity text, fox_bait.js / fox_brush.js gates. */
export const FOX_TEXT = Object.freeze({
  brushed: Object.freeze(['Oof! You got me!', 'I was quick, you were quicker!']),
  noLicense: 'Uh-oh, brushing without a license? The ranger would like a word with you.',
  tooFast: "You're brushing too fast! Slow it down.",
  brushWorn: "This Fox Brush doesn't have enough uses left. You'll have to repair it or use a different brush.",
  tooTired: "You're too tired to do that.",
  cantReach: "Whoops! You can't reach the fox when it's down there!",
  noBrush: 'You need a Fox Brush to brush a Fox.',
  appears: 'A fox appears!',
  leavesNoBait: 'No more bait remains, so the Fox leaves...',
  leaves: 'The fox leaves...',
  igniteTooltip: 'Attract a Fox',
  igniteNotPreserve: 'Bait can only be ignited in Preserves',
  igniteTooClose: 'Bait can only be ignited once a safe distance past the Ranger',
  igniteCrowded: 'There is already too much bait around here. It will confuse the foxes.',
  noLittering: 'No littering in the Preserve',
  brushTip: 'Grab the Brush from your pack and release it on a Fox to brush its Fibers!',
  brushSkillTip: "You can use this, but it's much better to learn Fox Brushing first.",
  brushPermitTip: 'Brushing foxes requires a Fox-Brushing Permit. See a Fox Ranger about getting one.',
});

export function fillName(text, name = 'Glitch') {
  return String(text).replace(/\{name\}/g, name || 'Glitch');
}

/** Register Fox Brush, Fox Bait, and Fiber in the shared pack catalog. */
export function ensureFoxItems() {
  for (const [classTsid, def] of Object.entries(FOX_ITEM_DEFS)) ensureItem(classTsid, { ...def });
}

/** The rank row a player brushes with. */
export function foxBrushingPackage(learned = []) {
  return (learned || []).includes(FOX_BRUSHING_SKILL)
    ? FOX_BRUSHING_PACKAGE.foxbrushing_1
    : FOX_BRUSHING_PACKAGE.no_skill;
}

/** npc_fox.js:341-343: +10/+12 with Fox Brushing, then +8/+12 with Bristling Bonus. */
export function foxFiberRange(learned = [], upgrades = []) {
  let [lo, hi] = FOX_FIBER_RANGE.base;
  if ((learned || []).includes(FOX_BRUSHING_SKILL)) {
    lo += FOX_FIBER_RANGE.skillBonus[0];
    hi += FOX_FIBER_RANGE.skillBonus[1];
  }
  const card = foxBrushingCard(upgrades);
  return [lo + card.rangeAdd[0], hi + card.rangeAdd[1]];
}

/** GSJS randInt(min, max): inclusive on both ends, tolerant of min > max. */
export function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Fresh per-fox state (onCreate). */
export function createFox({ id = 'fox', x = 0, y = 0, dir = 'left' } = {}) {
  return {
    id,
    x,
    y,
    dir, // go_dir; npc_walkable starts every NPC heading left
    state: 'run',
    destX: x,
    destKind: 'edge',
    timerMs: 0,
    brushCount: 0,
    brushTimes: [],
    leaving: false,
    gone: false,
  };
}

const inDirection = (dir, itemX, destX, ourX, gap) =>
  dir === 'left'
    ? itemX >= destX && itemX <= ourX - gap
    : itemX <= destX && itemX >= ourX + gap;

function closest(list, x) {
  let best = null;
  for (const item of list) {
    if (best == null || Math.abs(item.x - x) < Math.abs(best.x - x)) best = item;
  }
  return best;
}

/**
 * npc_fox.js startMoving: where the fox runs next.
 * @param {ReturnType<typeof createFox>} fox
 * @param {{ geo: { l: number, r: number }, baits?: { id: string, x: number }[], markers?: number[],
 *   rangerX?: number|null, spawnerX?: number|null }} world  baits are placed baits only
 * @returns {{ destX: number, kind: 'edge'|'bait'|'marker'|'ranger'|'exit'|'leave', baitId?: string }}
 */
export function foxDestination(fox, world) {
  const geo = world.geo;
  const baits = world.baits || [];
  if (fox.leaving) {
    const sx = Number.isFinite(world.spawnerX) ? world.spawnerX : fox.x;
    const destX = sx < fox.x ? sx - FOX_TIMING.exitBeyondSpawner : sx + FOX_TIMING.exitBeyondSpawner;
    return { destX, kind: 'exit' };
  }
  const left = geo.l + FOX_TIMING.edgeInset;
  const right = geo.r - FOX_TIMING.edgeInset;
  let dir = fox.dir;
  let destX;
  if (dir === 'left' && left !== fox.x) destX = left;
  else {
    destX = right;
    if (dir === 'left') dir = 'right';
  }
  let kind = 'edge';
  let baitId;
  const bait = closest(
    baits.filter((b) => inDirection(dir, b.x, destX, fox.x, FOX_TIMING.targetMinGap)),
    fox.x
  );
  if (bait) {
    destX = bait.x;
    kind = 'bait';
    baitId = bait.id;
  } else if (!baits.length) {
    return { destX: fox.x, kind: 'leave' };
  }
  const markers = (world.markers || []).map((x) => ({ x }));
  const marker = closest(
    markers.filter((m) => inDirection(dir, m.x, destX, fox.x, FOX_TIMING.targetMinGap)),
    fox.x
  );
  if (marker) {
    destX = marker.x;
    kind = 'marker';
    baitId = undefined;
  }
  if (Number.isFinite(world.rangerX) && inDirection(dir, world.rangerX, destX, fox.x, FOX_TIMING.rangerMinGap)) {
    destX = world.rangerX;
    kind = 'ranger';
    baitId = undefined;
  }
  return { destX, kind, ...(baitId ? { baitId } : {}) };
}

/**
 * npc_fox.js onPathing status 3/4: what happens when the fox reaches destX.
 * @returns {{ action: 'despawn'|'eat'|'pause'|'turn', baitId?: string, more?: boolean }}
 */
export function foxArrival(fox, world) {
  if (fox.leaving) return { action: 'despawn' };
  const baits = world.baits || [];
  const bait = closest(baits, fox.x);
  if (bait && Math.abs(fox.x - bait.x) <= FOX_TIMING.arriveRadius) {
    return { action: 'eat', baitId: bait.id, more: baits.length > 1 };
  }
  const marker = closest((world.markers || []).map((x) => ({ x })), fox.x);
  if (marker && Math.abs(fox.x - marker.x) <= FOX_TIMING.arriveRadius) return { action: 'pause' };
  return { action: 'turn' };
}

export const turnAround = (dir) => (dir === 'left' ? 'right' : 'left');

/**
 * Advance one fox by dtMs. Pure apart from mutating `fox`; world side effects
 * come back as events for the feature to apply.
 * @param {ReturnType<typeof createFox>} fox
 * @param {number} dtMs
 * @param {{ geo: {l:number,r:number}, baits?: {id:string,x:number}[], markers?: number[], rangerX?: number|null,
 *   spawnerX?: number|null, surfaceY?: (x:number, y:number) => number|null }} world
 * @param {() => number} [rng]
 * @returns {{ type: string, baitId?: string, reason?: string }[]}
 */
export function stepFox(fox, dtMs, world, rng = Math.random) {
  const events = [];
  if (fox.gone) return events;
  const dt = Math.max(0, Number(dtMs) || 0);
  const begin = () => {
    const next = foxDestination(fox, world);
    if (next.kind === 'leave') {
      fox.leaving = true;
      events.push({ type: 'leave', reason: FOX_TEXT.leavesNoBait });
      const exit = foxDestination(fox, world);
      fox.destX = exit.destX;
      fox.destKind = exit.kind;
    } else {
      fox.destX = next.destX;
      fox.destKind = next.kind;
      if (next.destX < fox.x) fox.dir = 'left';
      else if (next.destX > fox.x) fox.dir = 'right';
    }
    fox.state = 'run';
    fox.timerMs = 0;
  };

  if (fox.state !== 'run') {
    fox.timerMs += dt;
    if (fox.state === 'eatStart' && fox.timerMs >= FOX_TIMING.eatMs) fox.state = 'eat';
    if (fox.state === 'eat' && fox.timerMs >= FOX_TIMING.eatEndMs) fox.state = 'eatEnd';
    const resumeAt = fox.state === 'pause'
      ? FOX_TIMING.markerPauseMs
      : fox.state === 'brushed'
        ? 600
        : fox.state === 'idle'
          ? 0
          : FOX_TIMING.eatResumeMs;
    if (fox.timerMs >= resumeAt) begin();
    return events;
  }

  const step = (FOX_TIMING.runSpeed * dt) / 1000;
  const gap = fox.destX - fox.x;
  const move = Math.sign(gap) * Math.min(Math.abs(gap), step);
  const nextX = fox.x + move;
  if (typeof world.surfaceY === 'function' && move !== 0) {
    const y = world.surfaceY(nextX, fox.y);
    if (y == null && !fox.leaving) {
      // apiFindPath failure -> onStuck: turn around and try again.
      fox.dir = turnAround(fox.dir);
      begin();
      return events;
    }
    if (y != null) fox.y = y;
  }
  fox.x = nextX;
  if (Math.abs(fox.destX - fox.x) > 0.5) return events;

  fox.x = fox.destX;
  const arrival = foxArrival(fox, world);
  if (arrival.action === 'despawn') {
    fox.gone = true;
    events.push({ type: 'despawn' });
    return events;
  }
  if (arrival.action === 'eat') {
    events.push({ type: 'eat', baitId: arrival.baitId });
    if (arrival.more) {
      fox.state = 'eatStart';
      if (rng() < 0.5) fox.dir = turnAround(fox.dir);
      fox.timerMs = 0;
    } else {
      fox.leaving = true;
      events.push({ type: 'leave', reason: FOX_TEXT.leavesNoBait });
      fox.state = 'eat';
      fox.timerMs = FOX_TIMING.eatMs;
    }
    return events;
  }
  if (arrival.action === 'pause') {
    if (rng() < 0.5) fox.dir = turnAround(fox.dir);
    fox.state = 'pause';
    fox.timerMs = 0;
    return events;
  }
  // Must be the edge (or the Ranger)! Quick, turn around!
  fox.dir = turnAround(fox.dir);
  begin();
  return events;
}

/** Fox state names that count as "on the move" for Cunning like a Foxbrusher. */
export const FOX_MOVING_STATES = Object.freeze(new Set(['run', 'walk']));

/**
 * locations/inc_npcs.js spawn_fox: one fox per three active players, rounded
 * up by the comparison (a solo player always gets exactly one).
 */
export function canSpawnFox(foxCount, activePlayers = 1) {
  return foxCount < activePlayers / 3;
}

/**
 * fox_bait.js `ignite` conditions.
 * @param {{ inPreserve: boolean, rangerX?: number|null, facing?: 'left'|'right', playerX: number,
 *   placedBaitXs?: number[] }} ctx
 */
export function baitIgniteGate(ctx) {
  if (!ctx.inPreserve || !Number.isFinite(ctx.rangerX)) {
    return { ok: false, reason: FOX_TEXT.igniteNotPreserve };
  }
  const d = FOX_TIMING.igniteRangerDistance;
  if (ctx.facing === 'left' && ctx.playerX < ctx.rangerX + d) return { ok: false, reason: FOX_TEXT.igniteTooClose };
  if (ctx.facing !== 'left' && ctx.playerX > ctx.rangerX - d) return { ok: false, reason: FOX_TEXT.igniteTooClose };
  const close = (ctx.placedBaitXs || []).filter((x) => Math.abs(x - ctx.playerX) <= FOX_TIMING.baitCrowdRadius);
  if (close.length > FOX_TIMING.baitCrowdMax) return { ok: false, reason: FOX_TEXT.igniteCrowded };
  return { ok: true };
}

/** location.js dropFoxBaits: three baits 300 px apart starting up to 400 px left of the player. */
export function baitDropPlan(playerX, rng = Math.random) {
  let x = randInt(playerX, playerX - FOX_TIMING.baitDropSpread, rng);
  const out = [];
  for (let i = 0; i < FOX_TIMING.baitDropCount; i += 1) {
    out.push({ x, variant: 1 + Math.min(2, Math.floor(rng() * 3)) });
    x += FOX_TIMING.baitDropSpacing;
  }
  return out;
}

/**
 * Brush one fox (npc_fox.js verbs.brush + runSkillPackage + endBrushing).
 * Mutates pc, inv, toolState, fox, and returns a result describing everything
 * the world should show. Failures spend nothing.
 * @param {{ pc: object, inv: object, toolState: object, learned?: string[], licensed: boolean,
 *   nowMs: number, lastBrushMs?: number|null, fox: ReturnType<typeof createFox>, hubId?: string|number,
 *   baitsRemaining?: number, rng?: () => number }} ctx
 */
export function brushFox(ctx) {
  const { pc, inv, toolState, fox } = ctx;
  const rng = ctx.rng || Math.random;
  const fail = (reason, msg, extra = {}) => ({ ok: false, reason, msg, fibers: 0, energy: 0, xp: 0, wear: 0, counters: [], ...extra });
  if (countItem(inv, FOX_BRUSH_ID) < 1) return fail('no_brush', FOX_TEXT.noBrush);
  if (!ctx.licensed) return fail('no_license', FOX_TEXT.noLicense);
  if (Number.isFinite(ctx.lastBrushMs) && ctx.nowMs - ctx.lastBrushMs < FOX_TIMING.brushCooldownMs) {
    return fail('too_fast', FOX_TEXT.tooFast, { miss: true });
  }
  if (!fox || fox.gone) return fail('gone', FOX_TEXT.cantReach);
  const pkg = foxBrushingPackage(ctx.learned);
  const upgrades = ctx.upgrades || pc?.imaginationUpgrades || [];
  // npc_fox.js:221-223: Bristling Bonus wears the brush 1.5x (fractions carry).
  const wearMultiplier = foxBrushingCard(upgrades).toolWearMultiplier;
  const toolCheck = canUseTool(toolState, FOX_BRUSH_ID, Math.ceil(pkg.toolWear * wearMultiplier));
  if (!toolCheck.ok) return fail('brush_worn', FOX_TEXT.brushWorn, { miss: true });
  if ((pc.energy || 0) <= pkg.energyCost) return fail('tired', FOX_TEXT.tooTired);

  const wasMoving = FOX_MOVING_STATES.has(fox.state);
  const wearPoints = scaledToolWear(toolState, FOX_BRUSH_ID, pkg.toolWear, wearMultiplier);
  const wear = wearPoints > 0 ? useToolCondition(toolState, FOX_BRUSH_ID, wearPoints) : { wear: 0 };
  pc.energy = Math.max(0, (pc.energy || 0) - pkg.energyCost);
  // inc_skill_packages.js 532 (fox_brushing): xp_bonus takes the mood bonus.
  const xp = grantMoodXp(pc, pkg.xpBonus);
  const [lo, hi] = foxFiberRange(ctx.learned, upgrades);
  const fibers = randInt(lo, hi, rng);
  addItem(inv, FIBER_ID, fibers);

  const counters = [{ counter: 'fox:fibers_brushed', amount: fibers }];
  if (ctx.hubId != null && ctx.hubId !== '') counters.push({ counter: `fox_hubs:brushed_in_${ctx.hubId}`, amount: 1 });
  if (wasMoving) counters.push({ counter: 'fox:brushed_while_moving', amount: 1 });

  // Fleet Foxer: three brushes of the same fox inside ten seconds.
  const nowS = ctx.nowMs / 1000;
  fox.brushTimes.push(nowS);
  let fleet = false;
  if (fox.brushTimes.length >= FOX_TIMING.fleetCount) {
    const recent = fox.brushTimes.slice(-FOX_TIMING.fleetCount);
    if (recent[recent.length - 1] - recent[0] <= FOX_TIMING.fleetWindowS) {
      fleet = true;
      fox.brushTimes = [];
    }
  }

  fox.brushCount += 1;
  const leave = fox.brushCount >= FOX_TIMING.maxBrushes || (ctx.baitsRemaining ?? 1) < 1;
  if (leave) fox.leaving = true;
  return {
    ok: true,
    reason: 'brushed',
    fibers,
    energy: -pkg.energyCost,
    xp,
    wear: wear.wear ?? wearPoints,
    broke: wear.broke === true,
    brokeMsg: wear.msg || '',
    wasMoving,
    fleet,
    leave,
    leaveMsg: leave ? FOX_TEXT.leaves : '',
    response: FOX_TEXT.brushed[Math.floor(rng() * FOX_TEXT.brushed.length) % FOX_TEXT.brushed.length],
    counters,
  };
}

/**
 * npc_fox_ranger.js onPlayerCollision: which greeting a player gets when
 * they reach the Ranger from the entrance side.
 * @returns {{ kind: 'offer'|'bubble'|'none', key: string, choices?: string[] }}
 */
export function rangerGreeting(p) {
  if (p.conversated) return { kind: 'none', key: 'conversated' };
  if (!p.visited) {
    if (p.greeted) return { kind: 'none', key: 'greeted' };
    return { kind: 'offer', key: 'firstVisit', yes: 'ok', no: 'cancel' };
  }
  if (!p.intro) {
    if (p.greeted) return { kind: 'none', key: 'greeted' };
    return { kind: 'offer', key: 'returnNoIntro', yes: 'ok', no: 'cancel' };
  }
  if (!p.licensed) {
    if (p.greeted) return { kind: 'none', key: 'greeted' };
    return { kind: 'offer', key: 'returnNoLicense', yes: 'buy-license', no: 'no-buy' };
  }
  if (!p.hasBrush) return { kind: 'offer', key: 'noBrush', yes: 'buy' };
  if (!p.hasBait) return { kind: 'bubble', key: 'noBait' };
  if (p.greeted) return { kind: 'none', key: 'greeted' };
  return { kind: 'bubble', key: 'greetings' };
}

/** onPlayerLeavingCollisionArea: why the Ranger turns a player back, or ''. */
export function rangerGateReason({ licensed, hasBrush, overCapacity = false }) {
  if (!licensed) return FOX_RANGER_TEXT.gateNoLicense;
  if (overCapacity) return FOX_RANGER_TEXT.gateOverCapacity;
  if (!hasBrush) return FOX_RANGER_TEXT.gateNoBrush;
  return '';
}

/** Which side of the Ranger is "inside" the preserve. A left-facing Ranger guards an entrance on his left. */
export function insideSign(facing) {
  return facing === 'left' ? 1 : -1;
}

/**
 * Lay out a preserve from its one entrance signpost: the Ranger stands just
 * inside the entrance facing it, the fox spawner sits on the lower platform
 * a little further in, and the archived Fox Stop Markers spread across the
 * rest of the street. The archive keeps marker counts but not their item
 * coordinates, so the spread is an even, deterministic reconstruction.
 * @param {{ worldW: number, entranceX: number, markerCount: number, seed?: number }} p
 */
export function preserveLayout({ worldW, entranceX, markerCount, seed = 0 }) {
  const facing = entranceX < worldW / 2 ? 'left' : 'right';
  const inside = insideSign(facing);
  const rangerX = clamp(entranceX + inside * 360, 160, worldW - 160);
  const spawnerX = clamp(rangerX + inside * 260, 120, worldW - 120);
  const farEdge = inside > 0 ? worldW - FOX_TIMING.edgeInset - 60 : FOX_TIMING.edgeInset + 60;
  const start = rangerX + inside * 700;
  const n = Math.max(0, Math.floor(markerCount));
  const markers = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const jitter = ((((seed + 1) * 2654435761 + i * 40503) >>> 0) % 161) - 80;
    markers.push(Math.round(start + (farEdge - start) * t + jitter));
  }
  markers.sort((a, b) => a - b);
  return { facing, rangerX, spawnerX, markers };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Normalize the feature save slice. */
export function normalizeFoxSlice(slice = {}) {
  const hubs = Array.isArray(slice?.hubsBrushed)
    ? [...new Set(slice.hubsBrushed.map((h) => String(h)).filter((h) => /^\d{1,4}$/.test(h)))]
    : [];
  return {
    visited: slice?.visited === true,
    intro: slice?.intro === true,
    hubsBrushed: hubs.sort(),
    totalFibers: Math.max(0, Math.floor(Number(slice?.totalFibers) || 0)),
    totalBrushes: Math.max(0, Math.floor(Number(slice?.totalBrushes) || 0)),
  };
}

/** Fox Tourist: brushed a fox in preserves in each of the 10 regions (group_count of fox_hubs). */
export function noteFoxHub(slice, hubId) {
  const id = String(hubId ?? '');
  if (!/^\d{1,4}$/.test(id)) return { added: false, count: slice.hubsBrushed.length, tourist: false };
  const added = !slice.hubsBrushed.includes(id);
  if (added) slice.hubsBrushed = [...slice.hubsBrushed, id].sort();
  return { added, count: slice.hubsBrushed.length, tourist: slice.hubsBrushed.length >= 10 };
}

/** Fox Ranger shop rows for the shared vendor panel. */
export function foxRangerStoreProfile() {
  return {
    key: 'fox_ranger',
    id: FOX_RANGER_ID,
    storeId: FOX_RANGER_STORE.storeId,
    label: 'Fox Ranger',
    badge: 'F',
    color: 0x8a7a4a,
    desc: 'Regulation Fox Brushes and Fox Bait, and absolutely no cheese. (catalog_stores.js store 22)',
    // buy_multiplier 0: the Ranger buys nothing back (inc_stores.js storeSell).
    buyMultiplier: FOX_RANGER_STORE.buyMultiplier,
    offers: FOX_RANGER_STORE.items.map((row) => ({
      classTsid: row.classTsid,
      label: FOX_ITEM_DEFS[row.classTsid].label,
      buyPrice: row.cost,
      sellPrice: 0,
    })),
  };
}
