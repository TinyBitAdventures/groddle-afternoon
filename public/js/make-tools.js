/**
 * The Make window's first screen: the making tools as buttons, grouped by kind (report #175).
 *
 * The Make window is the remake's own (Glitch made things from each tool's own menu), so the
 * groups are ours. They follow what the tools make, close to the source's skill categories
 * (inc_data_skills.js: Cooking, Gathering, Alchemy, Industrial), with food and drinks apart and
 * the fibre tools on their own. Tool names stay Tiny Speck's (TOOL_CATALOG labels).
 *
 * Pure: no DOM, no game state. game.js draws the screen from these.
 */

/** Group order and the tools in each, in the order they are used (a chain reads left to right). */
export const MAKE_TOOL_GROUPS = Object.freeze([
  Object.freeze({ id: 'food', label: 'Food', tools: Object.freeze(['knife_and_board', 'frying_pan', 'saucepan', 'mike_tyson_grill', 'awesome_pot']) }),
  Object.freeze({ id: 'drinks', label: 'Drinks', tools: Object.freeze(['blender', 'cocktail_shaker']) }),
  Object.freeze({ id: 'changing', label: 'Changing and seasoning', tools: Object.freeze(['fruit_changing_machine', 'spice_mill', 'gassifier', 'bubble_tuner', 'egg_seasoner', 'bean_seasoner']) }),
  Object.freeze({ id: 'mining', label: 'Mining and metal', tools: Object.freeze(['smelter', 'ore_grinder', 'grand_ol_grinder', 'metalmaker']) }),
  Object.freeze({ id: 'alchemy', label: 'Alchemy', tools: Object.freeze(['alchemical_tongs', 'test_tube', 'beaker', 'tincturing_kit', 'cauldron', 'crystallizer']) }),
  Object.freeze({ id: 'building', label: 'Building and engineering', tools: Object.freeze(['woodworker', 'blockmaker', 'fuelmaker', 'construction_tool', 'tinkertool']) }),
  Object.freeze({ id: 'fiber', label: 'Fiber arts', tools: Object.freeze(['spindle', 'splendid_spindle', 'loomer']) }),
]);

/** A tool no group names (a tool added later) still shows, after the named groups. */
export const OTHER_TOOL_GROUP = Object.freeze({ id: 'other', label: 'Other tools' });

/** The tools the player has none of come last, together, still in the groups' order (as the tabs did: owned first). */
export const NEEDED_TOOL_GROUP = Object.freeze({ id: 'needed', label: "Tools you don't have yet" });

/** @param {string} toolId @returns {string} the id of the tool's group */
export function makeToolGroupId(toolId) {
  return MAKE_TOOL_GROUPS.find((g) => g.tools.includes(toolId))?.id || OTHER_TOOL_GROUP.id;
}

/**
 * The tools sorted into their groups: first each kind's tools the player can use, then one last
 * group of the tools they have none of (in the same kind order, so like tools stay side by side).
 * @template {{ classTsid: string }} T
 * @param {T[]} tools  the making tools (listMakingTools)
 * @param {(toolId: string) => boolean} [usable]  the player has it (or stands at it)
 * @returns {{ id: string, label: string, tools: (T & { owned: boolean, group: string })[] }[]} groups with a tool, in order
 */
export function groupMakingTools(tools, usable = () => true) {
  const rows = (tools || []).map((t) => ({ ...t, owned: Boolean(usable(t.classTsid)), group: makeToolGroupId(t.classTsid) }));
  const kinds = [...MAKE_TOOL_GROUPS, { ...OTHER_TOOL_GROUP, tools: rows.filter((t) => t.group === OTHER_TOOL_GROUP.id).map((t) => t.classTsid) }];
  const out = [];
  const needed = [];
  for (const kind of kinds) {
    const mine = kind.tools.map((id) => rows.find((t) => t.classTsid === id)).filter(Boolean);
    const owned = mine.filter((t) => t.owned);
    if (owned.length) out.push({ id: kind.id, label: kind.label, tools: owned });
    needed.push(...mine.filter((t) => !t.owned));
  }
  if (needed.length) out.push({ id: NEEDED_TOOL_GROUP.id, label: NEEDED_TOOL_GROUP.label, tools: needed });
  return out;
}

/**
 * The machine a Make goes to: the one the window was opened on (a home or machine-room machine,
 * { tool, startJob, toolState }), only for a recipe of its own tool. Glitch made with the item
 * whose menu was used and refused any other recipe (players/inc_making.js making_make_known
 * 280-291: "recipe not supported by item"). Here Back leads from a machine to every tool, so a
 * Blender recipe picked there is made with the pack's Blender (null), not handed to a Fuelmaker:
 * that job ran on a hold with no Blender, made nothing it counted, and the quest never heard of it.
 * @param {{ tool?: string }|null} station
 * @param {{ tool?: string }|null} recipe
 * @returns {object|null}
 */
export function stationForRecipe(station, recipe) {
  if (!station || typeof station.tool !== 'string' || !recipe?.tool) return null;
  return recipe.tool === station.tool ? station : null;
}

/**
 * #247: a hand tool's job blocks a machine (players/inc_making.js making_is_making 1736-1756: a
 * machine's own job never counts, so the reverse order always works). The machine's Use is greyed
 * with making_check_allowed's reason (86-87); a Make that still gets through is refused with
 * making_make_known's (325-327, make_fail_rsp's words, no full stop).
 */
export const MAKING_BUSY = Object.freeze({
  verb: 'You are making something else.',
  make: 'You are already making something',
});

/**
 * Which screen Make opens on (Austin 2026-11-10): a machine in the world or a tool's pack card opens
 * that tool; the N key and the Make button open the tool used last this session while the player
 * can still use it, and the tools screen otherwise (the first open, or the tool is gone).
 * @param {{ stationTool?: string|null, askedTool?: string|null, lastTool?: string|null, known?: (id: string) => boolean, usable?: (id: string) => boolean }} how
 * @returns {string|null} the tool to open on, or null for the tools screen
 */
export function makeOpeningTool({ stationTool = null, askedTool = null, lastTool = null, known = () => true, usable = () => true } = {}) {
  if (stationTool) return stationTool;
  if (askedTool && known(askedTool)) return askedTool;
  if (lastTool && known(lastTool) && usable(lastTool)) return lastTool;
  return null;
}

/**
 * How many recipes each tool has, and how many of them can be made now.
 * @param {{ tool: string }[]} recipes  the recipes the player knows
 * @param {(recipe: object) => boolean} [canMake]
 * @returns {Record<string, { total: number, ready: number }>} by recipe tool
 */
export function makeToolCounts(recipes, canMake = () => false) {
  /** @type {Record<string, { total: number, ready: number }>} */
  const out = {};
  for (const r of recipes || []) {
    const row = (out[r.tool] ||= { total: 0, ready: 0 });
    row.total += 1;
    if (canMake(r)) row.ready += 1;
  }
  return out;
}

/** The small line under a tool's name: "3 of 26 ready" when something can be made now, else "26 recipes". */
export function makeToolCountLine(counts) {
  const total = Math.max(0, Math.floor(counts?.total || 0));
  const ready = Math.max(0, Math.floor(counts?.ready || 0));
  return ready > 0 ? `${ready} of ${total} ready` : `${total} ${total === 1 ? 'recipe' : 'recipes'}`;
}

/** The same for a screen reader, in whole words. */
export function makeToolSpokenLine(label, counts, owned) {
  const total = Math.max(0, Math.floor(counts?.total || 0));
  const ready = Math.max(0, Math.floor(counts?.ready || 0));
  const all = `${total} ${total === 1 ? 'recipe' : 'recipes'}`;
  if (!owned) return `${label}. ${all}. You need ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}.`;
  return `${label}. ${all}, ${ready} you can make now.`;
}

/**
 * Arrow keys over a grid of buttons that wraps (the tools, the recipes): Left and Right step through
 * them in order; Up and Down go to the nearest button in the row above or below, across group
 * headings. Returns the index to focus, or the same index at an edge.
 * @param {{ left: number, top: number, width: number, height: number }[]} rects  each button's box, in order
 * @param {number} index  the focused one
 * @param {string} key  ArrowLeft | ArrowRight | ArrowUp | ArrowDown | Home | End
 */
export function gridStep(rects, index, key) {
  const n = rects?.length || 0;
  if (!n || index < 0 || index >= n) return index;
  if (key === 'ArrowRight') return Math.min(n - 1, index + 1);
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return index;
  const here = rects[index];
  const cx = here.left + here.width / 2;
  const cy = here.top + here.height / 2;
  const down = key === 'ArrowDown';
  // A row is every box whose middle is past this box's edge; the nearest such row, then the nearest box in it.
  let rowY = null;
  for (const r of rects) {
    const y = r.top + r.height / 2;
    if (down ? y <= here.top + here.height : y >= here.top) continue;
    if (rowY === null || (down ? y < rowY : y > rowY)) rowY = y;
  }
  if (rowY === null) return index;
  let best = index;
  let bestDx = Infinity;
  rects.forEach((r, i) => {
    const y = r.top + r.height / 2;
    if (Math.abs(y - rowY) > Math.max(4, r.height / 2) || (down ? y <= cy : y >= cy)) return;
    const dx = Math.abs(r.left + r.width / 2 - cx);
    if (dx < bestDx) { bestDx = dx; best = i; }
  });
  return best;
}
