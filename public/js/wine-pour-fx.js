/**
 * What a Wine of the Dead pour looks like (register row G182): the walk, the
 * bottle's tool_animation on the target, and the drop tip when the bottle is
 * dragged onto an item. Pure: no Pixi, no DOM. The rules are js/wine-pour.js;
 * features/homes-feature.js plays these.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - items/wine_of_the_dead.js:213-262 modal_callback, before either outcome:
 *   the avatar walks to 100 px short of the target, facing it (:233
 *   pc.moveAvatar), and the bottle's own tool_animation plays on the target
 *   for 3 s (:235-247 itemstack_overlay item_class wine_of_the_dead, delta_x
 *   -10 / +10, delta_y 20; state '-tool_animation', flipped, when the target
 *   is left of you: glitch-client Announcement.as 282-284). The pc_overlay
 *   bubble above the avatar (:249-261) goes to everyone else in the location
 *   (apiSendAnnouncementX, pc excluded), so a solo player never sees it.
 * - A worn-out target sends no activity line (include/cultivation.js 52-82
 *   makeDepleted, replaceWithDepleted).
 * - items/patch.js:44-74, trant_*.js and proto_*.js remove: a drop target for
 *   the bottle, drop_tip "Pour {$stack_name} on {$item_name}"; the drop hands
 *   it to verbs.pour with that item as the target (no 200 px reach).
 */

/**
 * The tool_animation the pour plays on its target: OGA
 * wine_of_the_dead__x1_tool_animation (990 x 534, CC0), 15 x 6 cells of 66 x 89,
 * 90 frames at 30 fps (the 3000 ms overlay, one pour).
 */
export const WOTD_TOOL = Object.freeze({
  durationMs: 3000,
  deltaY: 20,
  sheet: Object.freeze({ path: 'assets/sprites/hell/wine_of_the_dead-tool.webp', fw: 66, fh: 89, cols: 15, frames: 90, fps: 30 }),
});

/** patch.js:56 drop_tip. */
export function pourDropTip(stackName, itemName) {
  return `Pour ${stackName} on ${itemName}`;
}

/**
 * modal_callback 218-233: where the avatar walks and how the overlay sits.
 * Target left of you: stand 100 px to its right facing left, the flipped
 * '-tool_animation' 10 px right of it; else 100 px to its left facing right,
 * 'tool_animation' 10 px left of it.
 */
export function pourApproach(targetX, playerX) {
  const tx = Number(targetX) || 0;
  if (tx < Number(playerX)) return { endpoint: tx + 100, face: 'left', state: '-tool_animation', flipped: true, deltaX: 10 };
  return { endpoint: tx - 100, face: 'right', state: 'tool_animation', flipped: false, deltaX: -10 };
}
