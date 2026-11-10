/**
 * The tool you see at work on a Barnacle, an Ice Nubbin, a Dirt Pile or Peat: pure rules and the
 * sheets (features/resource-nodes-feature.js plays them; tests/node-tools.test.js).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 *   items/mortar_barnacle.js 347 and items/ice_knob.js 375: runSkillPackage('scraping' /
 *   'ice_scraping', this, { tool_item: scraper, source_delta_y: 80, source_delta_x: 40, ... }).
 *   items/dirt_pile.js 220 ('dig_dirt_pile') and items/peat_1.js, peat_2.js, peat_3.js 367
 *   ('peat_harvest'): { tool_item: shovel, ... } with no deltas.
 *   players/inc_skill_packages.js 207-275: with a tool_item on a thing on the ground, an
 *   itemstack_overlay on that thing for the package's duration, item_class the tool. The thing
 *   left of you: state '-tool_animation' (mirrored), delta_x = source_delta_x (10 when not given);
 *   else 'tool_animation' and the delta the other way. delta_y = source_delta_y (20 when not
 *   given), measured down from the top of the thing's art. The word bar rides the same overlay.
 *   Everyone else sees the tool in a 40 x 40 bubble over you (291-311).
 * The client loops a tool_animation at 30 frames a second (SSCollection.as 123).
 *
 * The art: Tiny Speck's OGA `<tool>__x1_tool_animation` sheets (CC0), measured:
 *   scraper 924 x 390, 11 x 5 cells of 84 x 78, 51 frames (scraper.swf scene 3-53);
 *   super_scraper 871 x 280, 13 x 4 of 67 x 70, 51 (super_scraper.swf 2-52);
 *   ace_of_spades 882 x 316, 14 x 4 of 63 x 79, 53 (ace_of_spades.swf 4-56);
 *   shovel 910 x 328, 14 x 4 of 65 x 82, 53 (shovel.swf 4-56): the sheet the Patches already use.
 * Until 2026-11-10 these verbs showed only the word bar.
 */

import { PACKED_SHEETS } from './packed-sheets-data.js?v=9ccb684a';

/** The Shovel's sheet as shipped for Patches (features/patches-feature.js), in a packed sheet's shape. */
const SHOVEL_SHEET = Object.freeze({
  path: 'assets/sprites/soil/shovel-tool.webp',
  fw: 65,
  fh: 82,
  cols: 14,
  frames: 53,
  plays: 53,
  cell: Object.freeze([65, 82]),
  at: Object.freeze([0, 0]),
  fps: 30,
  loop: true,
  // The Patches cut their own frames from this same file: js/item-overlay.js never unloads it.
  keep: true,
});

/** The tools that have a tool_animation here. */
export const NODE_TOOLS = Object.freeze(['scraper', 'super_scraper', 'shovel', 'ace_of_spades']);

/** A tool's tool_animation sheet (a packed sheet row), or null. */
export function nodeToolSheet(tool) {
  if (tool === 'shovel') return SHOVEL_SHEET;
  return NODE_TOOLS.includes(tool) ? PACKED_SHEETS.tools?.[tool] || null : null;
}

/** runSkillPackage's source_delta_x and source_delta_y per node class; `default` is 10 and 20. */
export const NODE_TOOL_DELTAS = Object.freeze({
  mortar_barnacle: Object.freeze({ dx: 40, dy: 80 }),
  ice_knob: Object.freeze({ dx: 40, dy: 80 }),
  default: Object.freeze({ dx: 10, dy: 20 }),
});

/**
 * Where the tool's overlay stands (inc_skill_packages.js 225-237): a node left of you is worked
 * from its right with the mirrored state, else from its left. Returns { flipped, deltaX, deltaY }.
 */
export function nodeToolOverlay(classTsid, nodeX, playerX) {
  const d = NODE_TOOL_DELTAS[classTsid] || NODE_TOOL_DELTAS.default;
  if (Number(nodeX) < Number(playerX)) return { flipped: true, deltaX: d.dx, deltaY: d.dy };
  return { flipped: false, deltaX: -d.dx, deltaY: d.dy };
}
