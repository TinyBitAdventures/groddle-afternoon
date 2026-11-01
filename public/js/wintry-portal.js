/**
 * Northwest Passage's wintry portal: the secret way into Wintry Place (Austin
 * 2026-11-01, live v0.11.0: "jumping into here I believe is supposed to take
 * you to a winter quest. Nothing happens."). Pure data; the hidden-floors
 * feature runs the box with the other Collision-triggered Teleporters.
 *
 * What survives in source:
 * - The street holds one Collision-triggered Teleporter, ILI1AHDS6SH1BDV
 *   (LLI23D3LDHD1FQA.xml 4907; items/teleporter.js onPlayerCollision ->
 *   pc.teleportToLocation(target_tsid, target_x, target_y), no quest, level,
 *   item or time check, no sound). Its instance props (target, hit box) were
 *   never archived.
 * - Where it goes: Wintry Place. GSJS quests/meditativearts_maintain_energy_in_wintry_place.js 2
 *   ("The secret entrances to Wintry Place are in Northwest Passage and in
 *   Newcot Close"), quests/brain_freezer.js 2-3 and
 *   items/npc_sno_cone_vending_machine.js 578 ("accessed through Northwest
 *   Passage"); the encyclopedia's Wintry Place page connects it to Northwest
 *   Passage and Newcot Close. Wintry Place's own signpost_2 leads back here and
 *   lands at (-2280, -691), on the walkway beside the portal.
 * - Where it sits: the portal_wintry deco (-2400, -791, 208 x 270) and the cage
 *   Tiny Speck built round it in the same pass (ids 1288127872349-921522):
 *   wall_1288127872349 and wall_1288127892296 at x -2447 and -2358 (y -1061 to
 *   -859) over the soft line _pl1288127904595 at y -859.
 *
 * Inferred, not in source: the box is the cage, met by the avatar's body (the
 * head circle top, AVATAR_BODY_H 111 px over the feet). Standing on the walkway
 * (y -700) leaves the head under the cage; any jump under the portal (a plain
 * jump lifts the feet about 105 px) puts the head into it. The landing in
 * Wintry Place mirrors Newcot Close's door, which lands 179 px past that
 * street's signpost toward its end (door connect 1905, -800; signpost_1 1726):
 * 179 px left of signpost_2 (-1650) on the snow floor. Not a Winter Walk
 * entrance: Winter Walk is offered by the shrines (quests/winter_walk.js
 * end_npcs; items/street_spirit.js 228-239).
 */

export const NORTHWEST_PASSAGE_TSID = 'GLI23D3LDHD1FQA';
export const WINTRY_PLACE_TSID = 'GM11E7ODKHO1QJE';
export const WINTRY_PORTAL_OBJREF = 'ILI1AHDS6SH1BDV';

/** The cage round the portal, world space (Northwest Passage bounds l -3000, t -1000). */
export const WINTRY_CAGE = Object.freeze({ x1: -2447, x2: -2358, top: -1061, floor: -859 });
/** Feet to head-circle top (hidden-floors.js AVATAR_BODY_H). */
const BODY_H = 111;
/** The avatar's hit box half width (AbstractAvatarView.as 141: hit_box_width 66). */
const HALF_W = 33;

const NWP = Object.freeze({ l: -3000, t: -1000 });
const WP = Object.freeze({ l: -2000, t: -1000 });

export const WINTRY_PORTAL_TELEPORTERS = Object.freeze([
  Object.freeze({
    id: 'northwest_to_wintry',
    objref: WINTRY_PORTAL_OBJREF,
    from: NORTHWEST_PASSAGE_TSID,
    to: WINTRY_PLACE_TSID,
    label: 'Wintry Place',
    // Feet in screen space: the cage's width plus the body's half width each side;
    // from where the head enters the cage floor (feet y -748) up past its top.
    box: Object.freeze({
      x: (WINTRY_CAGE.x1 + WINTRY_CAGE.x2) / 2 - NWP.l,
      y: WINTRY_CAGE.floor + BODY_H - NWP.t,
      w: WINTRY_CAGE.x2 - WINTRY_CAGE.x1 + 2 * HALF_W,
      h: WINTRY_CAGE.floor + BODY_H - (WINTRY_CAGE.top - 40),
    }),
    // World (-1829, -132): the snow floor (pl1254810288442) left of the signpost back.
    arrive: Object.freeze({ x: -1829 - WP.l, y: -132 - WP.t }),
    why: 'Northwest Passage\'s one teleporter (LLI23D3LDHD1FQA.xml 4907), the secret entrance to Wintry Place (meditativearts_maintain_energy_in_wintry_place.js 2), in the cage round portal_wintry. Box and landing inferred.',
  }),
]);

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** The wintry portal's teleporter on a street (either TSID prefix). */
export function wintryPortalTeleportersOn(tsid) {
  return WINTRY_PORTAL_TELEPORTERS.filter((t) => sameTsid(tsid, t.from));
}
