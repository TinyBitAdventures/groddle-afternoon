/**
 * Level 3 West's pit (register G527, Austin 2026-11-05). Pure data; the hidden-floors feature
 * runs the boxes with the other Collision-triggered Teleporters.
 *
 * What survives in source:
 * - The street (GLI107JLRU11EM2, Ilmenskie Caverns) is Tiny Speck's own geometry: islands over one
 *   floor line the whole street long (_pl1278705608815, y 972 to 960) and three low ledges on it,
 *   no ladders, no doors. The nearest island over any of them is 195 px up (the left ledge's
 *   y 787 to the island at y 592), past a plain jump (142.5 px) and far past a new player's (69 px).
 * - It holds one Collision-triggered Teleporter, ILI22RQ8B7A1AEQ (LLI107JLRU11EM2.xml 1281;
 *   items/teleporter.js 55-77: pc.teleportToLocation, no check, no sound). Its instance props
 *   (target, hit box) were never archived, so nothing says where it stood or where it went.
 * - The floor was meant to be visited: Eleven Secret Locations' spot 11spots_ilmenskie_caverns_01
 *   stands on the middle ledge (config_prod.js 1190; the street's boxes).
 *
 * OUR OWN DESIGN, not the original's: two boxes where the source has one, at the ends of the
 * floor (as Mada Tamaha's, js/hell.js), and their landings: each end puts you on that end's
 * signpost island, beside the arm. Two, so whichever way you walk from where you fell you come to
 * one. A new player can't cross the street left to right on the islands alone, so this is also
 * their way across. They are invisible, as the Teleporter was (no deco, no sound).
 */

export const LEVEL_3_WEST_TSID = 'GLI107JLRU11EM2';
export const LEVEL_3_WEST_TELEPORTER = 'ILI22RQ8B7A1AEQ';

export const CAVE_PIT_TELEPORTERS = Object.freeze([
  Object.freeze({
    id: 'level3west_pit_left',
    objref: LEVEL_3_WEST_TELEPORTER,
    from: LEVEL_3_WEST_TSID,
    to: LEVEL_3_WEST_TSID,
    same: true,
    label: 'Level 3 West',
    // Screen x 0..90 over the floor line's left end (y 972), up to y 860.
    box: Object.freeze({ x: 45, y: 980, w: 90, h: 120 }),
    // On the first island (_pl1271036952111), right of signpost_1 (The Drop, x 83) and The Drop's arrival (101).
    arrive: Object.freeze({ x: 140, y: 410 }),
    why: 'Our own stand-in for the lost teleporter: the left end of the pit floor to the The Drop signpost island.',
  }),
  Object.freeze({
    id: 'level3west_pit_right',
    objref: LEVEL_3_WEST_TELEPORTER,
    from: LEVEL_3_WEST_TSID,
    to: LEVEL_3_WEST_TSID,
    same: true,
    label: 'Level 3 West',
    // Screen x 4410..4500 over the floor line's right end (y 960), up to y 850.
    box: Object.freeze({ x: 4455, y: 970, w: 90, h: 120 }),
    // On the last island (_pl1271409531088), left of signpost_2 (Level 2 West, x 4343) and Level 2 West's arrival (4382).
    arrive: Object.freeze({ x: 4300, y: 603 }),
    why: 'Our own stand-in for the lost teleporter: the right end of the pit floor to the Level 2 West signpost island.',
  }),
]);

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** Level 3 West's stand-in teleporters on a street (either TSID prefix). */
export function cavePitTeleportersOn(tsid) {
  return CAVE_PIT_TELEPORTERS.filter((t) => sameTsid(tsid, t.from));
}
