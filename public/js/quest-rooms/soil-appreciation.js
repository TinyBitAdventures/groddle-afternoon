/**
 * Talking 'bout Soil Appreciation (quests/soilappreciation_1.js) on its practice street,
 * rebuilt from players' full-street snaps (js/practice-streets.js, register row G682).
 *
 * Source
 * - soilappreciation_1.js: offered when Soil Appreciation I is learnt (inc_skills.js 1491-1504);
 *   onStarted teleportToLocationDelayed(newxp_locations.soilappreciation_1, 123, -958); one
 *   requirement, the flag finish_soilappreciation "Do it all!"; rewards 150 iMG, 50 currants,
 *   25 energy, 15 Mab favor; onComplete_custom offers soilappreciation_dig_earth. The offer
 *   names the tools: "it's high time you got cozy with a Hoe. And a Shovel."
 * - locations/skillquest_sa.js: the flamingo at 370,-93 says "Soil Appreciation. It's pretty
 *   simple stuff." ("Elementary?") and "Grittier. Let's get dirty!" ("OK"), then flies off to
 *   2797,-110. Taking the Hoe and the Shovel off the street (items_added, countItemClass 0)
 *   lights the way (the 'light' event, 1.5 s later); verbAvailable keeps Dig on the Patch
 *   disabled ("You must tend this Patch first") until verb_tend on it. The Dirt Pile is dug
 *   with the Shovel (items/dirt_pile.js: Lumps of Earth; the skill package dig_dirt_pile at
 *   soil_appreciation_1 pays 2, js/resource-nodes.js).
 * - The "Do it all!" flag was the exit's box, as on the archived practice streets.
 * Lost: the 'light' and sign events' decos (no location XML), so nothing lights up here; the
 * tools' spots (ours, near the start).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&questdemo=soilappreciation_1
 * (&questautoplay=1, or =tools to stop with the tools taken). Canvas data: soilFlamingo,
 * soilTaken, soilPatch (weedy|tended|dug), soilDug (the Dirt Pile).
 */

import {
  PRACTICE_FLAMINGO,
  PRACTICE_START,
  SOIL_DIRT_PILE,
  SOIL_FINISH_BOX,
  SOIL_FLAMINGO_AWAY,
  SOIL_FLOOR_Y,
  SOIL_PATCH,
  SOIL_TOOLS,
  SOIL_TSID,
  practiceScreen,
} from '../practice-streets.js?v=963451c6';
import { textureFromUrl } from '../textures.js?v=814d7926';
import { addFlamingo, addPickup, clearDialogs, pickupVerbs, takePickup, taken, tickExit, tickFlamingo } from './practice-kit.js?v=7d3b312a';

export const QUEST = 'soilappreciation_1';
export const FLAG = 'finish_soilappreciation';
/** skillquest_sa.js flamingo_1_talk2 and flamingo_1_talk4. */
export const HELLO = Object.freeze([
  Object.freeze({ text: 'Soil Appreciation. It\'s pretty simple stuff.', reply: 'Elementary?', head: 'tall' }),
  Object.freeze({ text: 'Grittier. Let\'s get dirty!', reply: 'OK', head: 'short' }),
]);
/** skillquest_sa.js verbAvailable. */
export const TEND_FIRST = 'You must tend this Patch first';
/** dig_dirt_pile soil_appreciation_1 bonus_amount (js/resource-nodes.js RESOURCE_SKILL_PACKAGES). */
export const DIRT_PILE_EARTH = 2;

const finishBox = () => {
  const p = practiceScreen(SOIL_TSID, SOIL_FINISH_BOX.x, SOIL_FINISH_BOX.y);
  return { ...SOIL_FINISH_BOX, x: p.x, y: p.y };
};

/** What the Patch offers: Tend with a Hoe, then Dig with a Shovel (skillquest_sa.js verbAvailable). */
export function patchVerbs(state, has) {
  if (state === 'dug') return [];
  const tend = state === 'weedy'
    ? { id: 'tend', label: 'Tend', enabled: has('hoe'), tooltip: has('hoe') ? 'Clear the weeds with your Hoe' : 'You need a Hoe' }
    : null;
  const dig = { id: 'dig', label: 'Dig', enabled: state === 'tended' && has('shovel'), tooltip: state !== 'tended' ? TEND_FIRST : has('shovel') ? 'Dig it with your Shovel' : 'You need a Shovel' };
  return tend ? [tend, dig] : [dig];
}

/** The Patch's own stage art (js/features/patches-feature.js: patch-dirty, -clean, -dug). */
export const patchArt = (state) => `assets/sprites/soil/patch-${state === 'tended' ? 'clean' : state === 'dug' ? 'dug' : 'dirty'}.webp`;

function setPatchArt(ctx) {
  const spr = ctx.data.patchSpr;
  if (!spr || spr.destroyed) return;
  spr.texture = textureFromUrl(patchArt(ctx.data.patch));
}

function tend(ctx) {
  if (ctx.data.patch !== 'weedy' || !ctx.count('hoe')) return false;
  ctx.data.patch = 'tended';
  setPatchArt(ctx);
  ctx.sound('HOE', { volume: 0.6 });
  ctx.activity('You tended the Patch. Now it can be dug.');
  return true;
}

function digPatch(ctx) {
  if (ctx.data.patch !== 'tended' || !ctx.count('shovel')) return false;
  ctx.data.patch = 'dug';
  setPatchArt(ctx);
  ctx.sound('SHOVEL', { volume: 0.6 });
  ctx.activity('You dug the Patch.');
  return true;
}

function digPile(ctx) {
  if (ctx.data.dug || !ctx.count('shovel')) return false;
  ctx.data.dug = true;
  ctx.give('earth', DIRT_PILE_EARTH);
  ctx.sound('SHOVEL', { volume: 0.6 });
  ctx.activity(`You dug the Dirt Pile and got ${DIRT_PILE_EARTH} Lumps of Earth.`);
  const spr = ctx.data.pileSpr;
  if (spr && !spr.destroyed) spr.visible = false;
  if (ctx.data.pileTarget) ctx.unregister(ctx.data.pileTarget);
  ctx.data.pileTarget = null;
  return true;
}

export const room = {
  id: 'soil_appreciation',
  title: "Talking 'bout Soil Appreciation",
  kicker: 'Skill Quests',
  icon: 'assets/sprites/icons/shovel.webp',
  theme: 'memory',
  hubName: 'Skill Quests',
  // teleportToLocationDelayed: no instance clock and no exit delay.
  durationMs: 0,
  leaveText: 'Leave the practice street? You can come back with Try again.',
  travelText: 'Finish practising first: the EXIT is at the right.',

  street() {
    const p = practiceScreen(SOIL_TSID, PRACTICE_START.x, PRACTICE_START.y);
    return { tsid: SOIL_TSID, x: p.x, y: p.y };
  },

  enter(ctx) {
    ctx.data.pickups = {};
    ctx.data.patch = 'weedy';
    ctx.data.dug = false;
    addFlamingo(ctx, SOIL_TSID, PRACTICE_FLAMINGO);
    for (const tool of SOIL_TOOLS) addPickup(ctx, SOIL_TSID, tool, { scale: 0.62 });
    const pp = practiceScreen(SOIL_TSID, SOIL_PATCH.x, SOIL_PATCH.y);
    const patch = new ctx.PIXI.Sprite(textureFromUrl(patchArt('weedy')));
    patch.anchor.set(0.5, 0.8);
    patch.scale.set(1.2);
    patch.x = pp.x;
    patch.y = pp.y;
    ctx.data.patchSpr = ctx.add(patch, 22);
    ctx.data.patchTarget = ctx.register({ classId: 'patch', label: 'Patch', subtitle: 'Weedy', sprite: ctx.data.patchSpr });
    const dp = practiceScreen(SOIL_TSID, SOIL_DIRT_PILE.x, SOIL_DIRT_PILE.y);
    ctx.data.pileSpr = ctx.add(ctx.kit.icon(ctx.PIXI, 'dirt_pile', dp.x, dp.y + 6, { scale: 1.1 }), 22);
    ctx.data.pileTarget = ctx.register({ classId: 'dirt_pile', label: 'Dirt Pile', subtitle: 'Dig it with a Shovel', sprite: ctx.data.pileSpr });
  },

  verbs(ctx, target) {
    if (target.practicePickup) return pickupVerbs(ctx, target);
    const has = (cls) => ctx.count(cls) > 0;
    if (target === ctx.data.patchTarget) return patchVerbs(ctx.data.patch, has);
    if (target === ctx.data.pileTarget) return [{ id: 'dig', label: 'Dig', enabled: has('shovel'), tooltip: has('shovel') ? 'Dig it with your Shovel' : 'You need a Shovel' }];
    if (target === ctx.data.flamingoTarget) return [{ id: 'talk_to', label: 'Talk to', enabled: false, tooltip: 'It is about to say something' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.practicePickup && verbId === 'pick_up') return takePickup(ctx, target.practicePickup);
    if (target === ctx.data.patchTarget && verbId === 'tend') return tend(ctx);
    if (target === ctx.data.patchTarget && verbId === 'dig') return digPatch(ctx);
    if (target === ctx.data.pileTarget && verbId === 'dig') return digPile(ctx);
    return false;
  },

  tick(ctx) {
    tickFlamingo(ctx, HELLO, SOIL_TSID, SOIL_FLAMINGO_AWAY);
    tickExit(ctx, finishBox(), FLAG);
  },

  objective(ctx) {
    const tools = SOIL_TOOLS.filter((t) => taken(ctx, t.id)).length;
    let text = 'Pick up the Hoe and the Shovel.';
    if (tools === SOIL_TOOLS.length) {
      if (ctx.data.patch === 'weedy') text = 'Tend the Patch on the mound with your Hoe.';
      else if (ctx.data.patch === 'tended') text = 'Now dig the Patch with your Shovel.';
      else if (!ctx.data.dug) text = 'Dig the Dirt Pile too.';
      else text = 'Head right to the EXIT.';
    }
    return { text, stats: [['tools', `${tools}/${SOIL_TOOLS.length}`]] };
  },

  publish(ctx) {
    ctx.setData('soilFlamingo', ctx.data.flamingoStep || '');
    ctx.setData('soilTaken', Object.values(ctx.data.pickups || {}).filter((p) => p.taken).map((p) => p.row.id).join(','));
    ctx.setData('soilPatch', ctx.data.patch || '');
    ctx.setData('soilDug', ctx.data.dug ? '1' : '0');
  },

  async autoplay(ctx, mode) {
    for (let i = 0; i < 60 && ctx.data.flamingoStep !== 'talk'; i++) await ctx.wait(150);
    await clearDialogs(ctx);
    if (mode === 'hello') return 'hello';
    for (const tool of SOIL_TOOLS) takePickup(ctx, tool.id);
    if (mode === 'tools') return 'tools';
    tend(ctx);
    digPatch(ctx);
    digPile(ctx);
    if (mode === 'dug') return 'dug';
    const at = practiceScreen(SOIL_TSID, SOIL_FINISH_BOX.x, SOIL_FLOOR_Y - 20);
    ctx.place(at.x, at.y);
    for (let i = 0; i < 40; i++) {
      ctx.advanceAward();
      await ctx.wait(300);
    }
    return 'complete';
  },
};
