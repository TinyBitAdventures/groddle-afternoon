/**
 * Oppidan Avenue's teleporters (register G620, live report #164). Pure data; the hidden-floors
 * feature runs the boxes with the other Collision-triggered Teleporters.
 *
 * What survives in source:
 * - The street (GDOHDJ84BST2UI2, The Seams) has no signposts and a door at each end. Walls cut it
 *   into a cave by each door and a city street between them, with a sealed gap either side of the
 *   city. Four alcoves are each one wall you can pass one way and one you cannot pass at all:
 *   [-2275, -2199] entered walking right from the left cave, [2247, 2322] entered walking left
 *   from the right cave, and [-1523, -1463] and [1455, 1520] entered from the city walking out.
 *   Whoever steps into one cannot step back.
 * - It holds four Collision-triggered Teleporters (LDOHDJ84BST2UI2.xml: IDOHDSB4BST27QI,
 *   IDOHE5B4BST27RJ, IDOHE7B4BST27RI, IDOHE8B4BST27RJ; items/teleporter.js 55-77:
 *   pc.teleportToLocation, no check, no sound), one for each alcove. Their instance props (hit
 *   box, target) were never archived. The two cave alcoves hold the Teleporter_Base and
 *   Teleporter_Beam decos.
 * - Footage (reference only, YouTube QTq-0yyx_JU, "Oppidan Avenue"): the player comes in by the
 *   left door, walks right into the beam and stands at the city's left edge (0:28); walks the
 *   city, steps into its dark right edge and stands in the right cave between the beam and the
 *   door (2:11).
 *
 * So: each cave's beam puts you at that end of the city, and each end of the city puts you in
 * that side's cave, beside the door. The two the footage shows are as it shows them; the other
 * two are their mirror images. Where exactly you land is OUR OWN reading of the footage (a few
 * steps clear of the alcove, on the floor line). The boxes are invisible, as the Teleporter was.
 * Without them an alcove was a cell (the report: stuck behind the beam).
 */

export const OPPIDAN_AVENUE_TSID = 'GDOHDJ84BST2UI2';
export const OPPIDAN_TELEPORTERS = Object.freeze(['IDOHDSB4BST27QI', 'IDOHE5B4BST27RJ', 'IDOHE7B4BST27RI', 'IDOHE8B4BST27RJ']);

// Screen space (street x + 3000, y + 1000). A box stands on its alcove's floor, bottom-centre.
const row = (id, box, arrive, why) => Object.freeze({
  id,
  from: OPPIDAN_AVENUE_TSID,
  to: OPPIDAN_AVENUE_TSID,
  same: true,
  label: 'Oppidan Avenue',
  box: Object.freeze(box),
  arrive: Object.freeze(arrive),
  why,
});

export const SEAM_TELEPORTERS = Object.freeze([
  // Alcove -2275..-2199, floor y -174; the city's left end is x -1463, floor y -217.
  row('oppidan_left_cave', { x: 763, y: 834, w: 50, h: 130 }, { x: 1620, y: 783 }, 'The left cave\'s beam to the left end of the city (footage 0:28).'),
  // Alcove -1523..-1463, floor y -217; the left cave's floor is y -149 at x -2600, between door and beam.
  row('oppidan_city_left', { x: 1507, y: 791, w: 40, h: 130 }, { x: 400, y: 851 }, 'The city\'s left edge to the left cave, by its door (the mirror of the footage\'s right edge).'),
  // Alcove 1455..1520, floor y -217; the right cave's floor is y -167 at x 2600, between beam and door.
  row('oppidan_city_right', { x: 4487, y: 791, w: 40, h: 130 }, { x: 5600, y: 833 }, 'The city\'s right edge to the right cave, by its door (footage 2:11).'),
  // Alcove 2247..2322, floor y -211; the city's right end is x 1455.
  row('oppidan_right_cave', { x: 5284, y: 797, w: 50, h: 130 }, { x: 4380, y: 783 }, 'The right cave\'s beam to the right end of the city (the mirror of the footage\'s left beam).'),
]);

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** Oppidan Avenue's teleporters on a street (either TSID prefix). */
export function seamTeleportersOn(tsid) {
  return SEAM_TELEPORTERS.filter((t) => sameTsid(tsid, t.from));
}
