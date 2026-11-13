/**
 * Breezy, EZ Cookin' (quests/ezcooking_1.js) on its practice street, rebuilt from players'
 * full-street snaps (js/practice-streets.js, register row G682).
 *
 * Source
 * - ezcooking_1.js: offered when EZ Cooking I is learnt (inc_skills.js 1491-1504 quests_offer
 *   (..., true)); onStarted teleportToLocationDelayed(newxp_locations.ezcooking_1, 123, -958);
 *   one requirement, the flag finish_ezcooking "Do it all!"; rewards 150 iMG, 50 currants,
 *   25 energy, 15 Pot favor; onComplete_custom offers ezcooking_make_level1_recipes.
 * - locations/skillquest_ezc_v2.js: reset() puts the food on the counters (location_targets
 *   food_1_1 .. food_3_3 with special_items); the flamingo pops in at 370,-93, says
 *   "Ah, EZ Cooking. Let's get started!" (button "Aiight") and flies off to 3304,-110. The
 *   Knife & Board waits on its table (items_added knife_and_board clears area0). The hint signs
 *   the boxes showed (knifesign, top1-3) were the lost street's decos: their words are lost.
 * - The "Do it all!" flag was the exit's box (as box_7 on the archived Light Green Thumb street).
 * The tutorial's own EZ Cooking pick (magic_rock.js 662-665: quests_give_finished, then the
 * same street) walks this street from features/newxp-feature.js, not from this room.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&questdemo=ezcooking_1 (&questautoplay=1).
 * Canvas data: ezcFlamingo, ezcTaken (ids picked up), ezcKnife.
 */

import {
  EZ_COOKIN_FLOOR_Y,
  EZ_COOKIN_TSID,
  EZ_FINISH_BOX,
  EZ_FLAMINGO_AWAY,
  EZ_FOOD,
  EZ_KNIFE_AND_BOARD,
  PRACTICE_FLAMINGO,
  PRACTICE_START,
  practiceScreen,
} from '../practice-streets.js?v=963451c6';
import { addFlamingo, addPickup, clearDialogs, pickupVerbs, takePickup, taken, tickExit, tickFlamingo } from './practice-kit.js?v=7d3b312a';

export const QUEST = 'ezcooking_1';
export const FLAG = 'finish_ezcooking';
/** skillquest_ezc_v2.js flamingo_1_talk3. */
export const HELLO = Object.freeze([Object.freeze({ text: 'Ah, EZ Cooking. Let\'s get started!', reply: 'Aiight', head: 'tall' })]);

const finishBox = () => {
  const p = practiceScreen(EZ_COOKIN_TSID, EZ_FINISH_BOX.x, EZ_FINISH_BOX.y);
  return { ...EZ_FINISH_BOX, x: p.x, y: p.y };
};

export const room = {
  id: 'ez_cookin',
  title: "Breezy, EZ Cookin'",
  kicker: 'Skill Quests',
  icon: 'assets/sprites/icons/knife_and_board.webp',
  theme: 'memory',
  hubName: 'Skill Quests',
  // teleportToLocationDelayed: no instance clock and no exit delay.
  durationMs: 0,
  leaveText: 'Leave the practice street? You can come back with Try again.',
  travelText: 'Finish practising first: the EXIT is at the right.',

  street() {
    const p = practiceScreen(EZ_COOKIN_TSID, PRACTICE_START.x, PRACTICE_START.y);
    return { tsid: EZ_COOKIN_TSID, x: p.x, y: p.y };
  },

  enter(ctx) {
    ctx.data.pickups = {};
    addFlamingo(ctx, EZ_COOKIN_TSID, PRACTICE_FLAMINGO);
    addPickup(ctx, EZ_COOKIN_TSID, { ...EZ_KNIFE_AND_BOARD, label: 'Knife & Board' }, { scale: 0.62 });
    for (const food of EZ_FOOD) addPickup(ctx, EZ_COOKIN_TSID, food, { scale: 0.5 });
  },

  verbs(ctx, target) {
    if (target.practicePickup) return pickupVerbs(ctx, target);
    if (target === ctx.data.flamingoTarget) return [{ id: 'talk_to', label: 'Talk to', enabled: false, tooltip: 'It is about to say something' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.practicePickup && verbId === 'pick_up') return takePickup(ctx, target.practicePickup);
    return false;
  },

  tick(ctx) {
    tickFlamingo(ctx, HELLO, EZ_COOKIN_TSID, EZ_FLAMINGO_AWAY);
    tickExit(ctx, finishBox(), FLAG);
  },

  objective(ctx) {
    const food = EZ_FOOD.filter((f) => taken(ctx, f.id)).length;
    let text = 'Pick up the Knife & Board from the table.';
    if (taken(ctx, EZ_KNIFE_AND_BOARD.id)) text = food < EZ_FOOD.length ? 'Take the food from the three counters.' : 'Head right to the EXIT.';
    return { text, stats: [['food', `${food}/${EZ_FOOD.length}`]] };
  },

  publish(ctx) {
    ctx.setData('ezcFlamingo', ctx.data.flamingoStep || '');
    ctx.setData('ezcTaken', Object.values(ctx.data.pickups || {}).filter((p) => p.taken).map((p) => p.row.id).join(','));
    ctx.setData('ezcKnife', taken(ctx, EZ_KNIFE_AND_BOARD.id) ? '1' : '0');
  },

  async autoplay(ctx, mode) {
    for (let i = 0; i < 60 && ctx.data.flamingoStep !== 'talk'; i++) await ctx.wait(150);
    await clearDialogs(ctx);
    if (mode === 'hello') return 'hello';
    takePickup(ctx, EZ_KNIFE_AND_BOARD.id);
    for (const food of EZ_FOOD) takePickup(ctx, food.id);
    if (mode === 'food') return 'food';
    const at = practiceScreen(EZ_COOKIN_TSID, EZ_FINISH_BOX.x, EZ_COOKIN_FLOOR_Y - 20);
    ctx.place(at.x, at.y);
    for (let i = 0; i < 40; i++) {
      ctx.advanceAward();
      await ctx.wait(300);
    }
    return 'complete';
  },
};
