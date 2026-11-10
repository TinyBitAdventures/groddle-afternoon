/**
 * What a player looks like while working on a street project with a tool (Austin 2026-11-01: the
 * project's "meditate with a Focusing Orb" showed a still orb icon hidden behind the avatar, and the
 * "+1 meditated" float sat under the Enter hint).
 *
 * The source (items/include/jobs.js startJobWork 293-309): for the whole run of units it announces a
 * pc_overlay on the player, delta_y -110, width and height 40, `bubble: true`, the tool item in its
 * `tool_animation` state (the client loops it at 30 fps, SSCollection.as:123, TSEngineConstants.as:6),
 * and plays the tool's sound key (tool class upper-cased) 999 times; cancelJobWork 434-437 takes the
 * overlay down. Nothing else: the avatar keeps its own stance (there is no avatar animation in the
 * job work path), so the remake draws the same bubble in front of the street, not a pose.
 *
 * The tool_animation sheets the remake has recovered are reused here: the Make panel's
 * (js/make-tool-sheets.js), the Focusing Orb's (js/meditation.js ORB_TOOL_SHEET) and the field
 * tools game.js swings (hatchet, Class Axe, Watering Can, Irrigator 9000, Pick, Fancy Pick). A tool
 * whose animation is not recovered (Shovel, Hoe, Scraper, Quill and their upgrades) shows its icon
 * in the same bubble.
 */

import { MAKE_TOOL_SHEETS } from './make-tool-sheets.js?v=6f758e09';
import { ORB_TOOL_SHEET } from './meditation.js?v=f0c00590';
import { SOUND_ALIASES, SOUND_FILES } from './sound-keys.js?v=df36f0cf';

/** items/include/jobs.js startJobWork 293-305. */
export const JOB_WORK_OVERLAY = Object.freeze({ deltaY: -110, width: 40, height: 40, bubble: true });

/** The client's animation rate (TSEngineConstants.as:6). */
const FPS = 30;

/** Field tools' tool_animation sheets, as game.js loads them (TEXTURE_DEFS, PICK_TOOL_SHEETS, IRRIGATOR_TOOL_SHEET). */
const FIELD_TOOL_SHEETS = Object.freeze({
  // OGA hatchet__x1_tool_animation: 38 cells of 110x64 (game.js hatchetTool).
  hatchet: Object.freeze({ url: 'assets/sprites/tools/hatchet-tool.webp', fw: 110, fh: 64, cols: 8, frames: 38 }),
  // OGA class_axe__x1_tool_animation: 38 cells of 111x65 (game.js classAxeTool).
  class_axe: Object.freeze({ url: 'assets/sprites/tools/class-axe-tool.webp', fw: 111, fh: 65, cols: 8, frames: 38 }),
  // OGA watering_can__x1_tool_animation: 30 cells of 91x78 (game.js wateringCanTool).
  watering_can: Object.freeze({ url: 'assets/sprites/tools/watering-can-tool.webp', fw: 91, fh: 78, cols: 10, frames: 30 }),
  // OGA irrigator_9000__x1_tool_animation: 30 cells of 95x76 (game.js IRRIGATOR_TOOL_SHEET).
  irrigator_9000: Object.freeze({ url: 'assets/sprites/making/irrigator_9000-tool.webp', fw: 95, fh: 76, cols: 10, frames: 30 }),
  // pick.swf / fancy_pick.swf tool_animation, root frames 1-33 (game.js PICK_TOOL_DEF).
  pick: Object.freeze({ url: 'assets/sprites/tools/pick-tool@3x.webp', fw: 115, fh: 63, cols: 11, frames: 33 }),
  fancy_pick: Object.freeze({ url: 'assets/sprites/tools/fancy-pick-tool@3x.webp', fw: 115, fh: 63, cols: 11, frames: 33 }),
  focusing_orb: Object.freeze({ url: ORB_TOOL_SHEET.url, fw: ORB_TOOL_SHEET.frameW, fh: ORB_TOOL_SHEET.frameH, cols: ORB_TOOL_SHEET.cols, frames: ORB_TOOL_SHEET.frames }),
});

/** A tool's tool_animation sheet { url, fw, fh, cols, frames, fps }, or null when none is recovered. */
export function jobWorkToolSheet(classTsid) {
  const id = String(classTsid || '');
  const field = FIELD_TOOL_SHEETS[id];
  if (field) return { ...field, fps: FPS };
  const make = MAKE_TOOL_SHEETS[id];
  if (make) return { url: make.url, fw: make.fw, fh: make.fh, cols: make.cols, frames: make.frames, fps: make.fps || FPS };
  return null;
}

/** The scale that fits a sheet's cell in the overlay's 40x40 box. */
export function jobWorkToolScale(sheet, box = JOB_WORK_OVERLAY) {
  if (!sheet?.fw || !sheet?.fh) return 1;
  return Math.min(box.width / sheet.fw, box.height / sheet.fh);
}

/** pc.announce_sound(tool_class_id.toUpperCase(), 999): the tool's own key, when the catalog has it. */
export function jobWorkSoundKey(classTsid) {
  const key = String(classTsid || '').toUpperCase();
  return key && (SOUND_FILES[key] || SOUND_ALIASES[key]) ? key : '';
}

/**
 * Where a work unit's "+1 <verb>" float starts: beside the bubble on the side away from the project
 * board, whose Enter hint sits above the board (game.js: the hint is drawn over the nearest thing).
 */
export function jobWorkFloatPoint(player, boardX = null) {
  const x = Number(player?.x) || 0;
  const y = Number(player?.y) || 0;
  const side = Number.isFinite(boardX) && boardX > x ? -1 : 1;
  return { x: x + side * 62, y: y + JOB_WORK_OVERLAY.deltaY };
}
