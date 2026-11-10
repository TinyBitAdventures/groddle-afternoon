/**
 * A potion's own bottle, pouring: pure rules and the sheets (js/potion-bottle-fx.js plays them;
 * tests/potion-bottles.test.js).
 *
 * Source: glitch-GameServerJS items/potion_*.js (CC0); every potion has the same two blocks,
 * e.g. potion_amorous_philtre.js:
 *   pour with a target (323-381): an itemstack_overlay on the target for 2500 ms, item_class the
 *   potion, delta_y 20, locking; the target left of you: state '-tool_animation' (mirrored),
 *   delta_x 10; else 'tool_animation', delta_x -10. The avatar walks to 100 px short of it.
 *   pour with none (382-397) and quaff (471-488): a pc_overlay on you for 2500 ms, state
 *   tool_animation, delta_y -135, width and height 60.
 *   Everyone else sees a 40 x 40 bubble over you (399-411, 490-502: apiSendAnnouncementX, you
 *   left out), and POTION_GENERIC plays (413, 504). The effect lands at 2500 ms (415, 506).
 *
 * The art: each potion's SWF has a 75 frame tool_animation scene (root timeline 3-77), 2.5 s at
 * the client's 30 frames a second: one pour for one overlay. Tiny Speck's OGA sheets of it
 * (`<class>__x1_tool_animation`, CC0) are 11 x 7 cells, measured: 880 px wide sheets have 80 px
 * cells (heights 103 to 130), 913 px ones 83 px, the garden potions' 990 px ones 90 x 105. Cells
 * 1 to 72 are drawn; frame 1 and frames 74 and 75 are empty in the recording (the bottle is not
 * out yet, and has gone). 19 potions have one: the eleven the Cauldron's quaffs and pours use,
 * the five Master Gardener potions, Tree Poison and its Antidote, and the Rook Balm. (Until
 * 2026-11-10 the game rocked the pack icon, and the Rook Balm's sheet was cut as 10 x 7 cells of
 * 88 px and never drawn.) Draught of Wisdom, Rocky Regeneration Solution and Alphabet Sauce have
 * the scene in their SWFs but no OGA sheet; they keep the rocking icon.
 */

import { PACKED_SHEETS } from './packed-sheets-data.js?v=3b5055a3';

/** The overlay's 2500 ms (and the effect's timer). */
export const POTION_POUR_MS = 2500;

/** pc_overlay on the one who quaffs, or pours with no target. */
export const POTION_SELF_OVERLAY = Object.freeze({ deltaY: -135, wh: 60 });

/** itemstack_overlay on a pour's target: delta_x is away from the avatar's side. */
export const POTION_TARGET_OVERLAY = Object.freeze({ deltaX: 10, deltaY: 20 });

/** potion_favor.swf is potion_draught_of_giant_amicability.swf, byte for byte; the OGA dump has the second name. */
export const POTION_BOTTLE_ALIAS = Object.freeze({ potion_favor: 'potion_draught_of_giant_amicability' });

/** The packed tool_animation sheet of a potion, or null when it has none. */
export function potionBottleSheet(classTsid) {
  const id = String(classTsid || '');
  return PACKED_SHEETS.potions?.[POTION_BOTTLE_ALIAS[id] || id] || null;
}

/** Every potion class with a sheet, the aliases included. */
export function potionBottleClasses() {
  return [...Object.keys(PACKED_SHEETS.potions || {}), ...Object.keys(POTION_BOTTLE_ALIAS)].sort();
}

/**
 * The pour's side (323-354): a target left of the avatar gets the mirrored state 10 px to its
 * right; else the state as drawn, 10 px to its left.
 */
export function potionPourSide(targetX, playerX) {
  if (Number(targetX) < Number(playerX)) return { flipped: true, deltaX: POTION_TARGET_OVERLAY.deltaX };
  return { flipped: false, deltaX: -POTION_TARGET_OVERLAY.deltaX };
}
