/**
 * World Swoonerflies (register G121): the npc_swoonerfly objrefs on archived
 * streets (street-ecology.json `swoonerflies`, written by
 * build-street-ecology.mjs), drawn by features/swoonerflies-feature.js. Pure:
 * no Pixi, no DOM.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0), items/npc_swoonerfly.js:
 * - :66-69 onCreate: initInstanceProps, then setAndBroadcastState('fly-rooked').
 *   Nothing else sets a state: land() (:45-62) only sends the 'rooked'
 *   itemstack_overlay.
 * - :37-43 fall() moves to y_destination over 400 ms, then land(). The only
 *   caller in GSJS is npc_squid.js:311-317 createSwoonerfly, which makes a new
 *   one in the quest instance (Gwendolyn's room, js/quest-rooms/gwendolyn.js
 *   swoonerfly()). So a street's Swoonerfly never falls: it stays where it was
 *   put, in 'fly-rooked', for good.
 * - :35 verbs {}; itemDef :104 not_selectable true (no menu, no tooltip),
 *   :100 obey_physics false; tags no_trade.
 * - :86 getAssetInfo position {x:-24, y:-46, w:50, h:47}: the art stands on
 *   its point (bottom centre).
 *
 * The objrefs keep only the tsid and label (no x, y or y_destination), so the
 * spot on the street is lost: the shared street planner picks one, as it does
 * for the vendors. The art is the sheet Gwendolyn's room plays while one falls:
 * OGA npc_butterfly fly-rooked, 14 cells of 70 x 65 (CC0; the swoonerfly's
 * own SWF is a recoloured butterfly).
 */

export const SWOONERFLY_CLASS = 'npc_swoonerfly';
/** items/npc_swoonerfly.js:1 label, as the location objrefs write it. */
export const SWOONERFLY_LABEL = 'Swoonerfly';
/** onCreate setAndBroadcastState. */
export const SWOONERFLY_STATE = 'fly-rooked';
export const SWOONERFLY_PLACEMENT_KEY = 'swoonerflies';

/** The fly-rooked loop (js/quest-rooms/gwendolyn.js SWOON_FRAMES, animationSpeed 0.5 = 30 fps). */
export const SWOONERFLY_SHEET = Object.freeze({
  path: 'assets/sprites/quest-rooms/gwendolyn/swoonerfly_fall.png',
  fw: 70,
  fh: 65,
  cols: 14,
  frames: 14,
  fps: 30,
});

/** How many Swoonerflies a street's archived objrefs hold (G/L alias aware). */
export function swoonerfliesFor(catalog, tsid) {
  const map = catalog?.swoonerflies || {};
  const id = String(tsid || '');
  const aliases = [id];
  if (id.startsWith('G')) aliases.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) aliases.push(`G${id.slice(1)}`);
  for (const alias of aliases) {
    const n = Math.floor(Number(map[alias]?.[SWOONERFLY_CLASS]) || 0);
    if (n > 0) return n;
  }
  return 0;
}

/** Planner group for the shared street placement (features placementGroups hook). */
export function swoonerflyPlacementGroups(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n ? [{ key: SWOONERFLY_PLACEMENT_KEY, count: n, clearance: 80 }] : [];
}
