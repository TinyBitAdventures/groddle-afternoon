/**
 * Collision-triggered Teleporters on the streets outside G620's sweep (register G681; the reference
 * review 2026-11-10, E). Pure data; the hidden-floors feature runs WIRED_TELEPORTERS with the other
 * teleporters (items/teleporter.js onPlayerCollision 55-77: pc.teleportToLocation to the item's
 * target_tsid / target_x / target_y, no check, no sound).
 *
 * The location files (streets/mnt/stos/location_data/L*.xml) list a Collision-triggered Teleporter
 * on 35 streets. Every one's instanceProps (its hit box and target) were never archived, so a
 * teleporter can only be wired where something else in the source says where it stood and where it
 * went. TELEPORTER_CENSUS says, street by street, what each is today:
 * - 'wired': run by a module that rebuilt it (hidden floors, Naraka's pit, the wintry portal,
 *   Level 3 West's pit, Oppidan Avenue, the Hell Hole, the quest rooms, the gut tubes).
 * - 'here': wired in this file (WIRED_TELEPORTERS).
 * - 'inert': target lost and nothing traps a player there (the builder's reach graph from every
 *   arrival, js/builder/reach-graph.js, finds no floor that cannot get to an exit at a plain jump,
 *   and the walls make no one-way pocket), so it stays out, as the review asked.
 * - 'stand-in': a signpost the source left beside it carries the same link (ladder tops and
 *   buried posts, js/ladder-top-signposts.js, street-model.js isBuriedSignpost).
 */

/**
 * Yellow Yawning (GA9UIKNQ7LD3SN0, Shim Shiri's yellow tube; instance_me): Shim Shiri's yellow
 * Light Beam lands you at world (2269, -345) near its right end (tp_yellow,
 * LA9BT2I0ILD340S.xml 44-50). The tube narrows to a 157 px passage running out to the street's
 * right edge, and its Shim Shiri signpost (signpost_2, world 2917, -234) stands 214 px under that
 * passage's floor (y -448), where no one can reach it: the builder reaches the left post (Hazy
 * Gate 3) and not this one. The street's file holds two Collision-triggered Teleporters
 * (LA9UIKNQ7LD3SN0.xml 71-72: IA9UJ1QQ7LD31OI, IA9UJ2QQ7LD31PH). So the tube's end was a
 * teleporter back to Shim Shiri, standing in front of the buried post that carries its link, and the
 * post's own arrival is where it put you: by Shim Shiri's Yellow Yawning post (world -2092, -887).
 * Which objref it was, and what the other did, is not on record. Not a trap without it (the left
 * post walks out): a way back that was missing.
 */
export const YELLOW_YAWNING_TSID = 'GA9UIKNQ7LD3SN0';
export const SHIM_SHIRI_TSID = 'GA9BT2I0ILD340S';

/**
 * The Vortex of Random's back doors (reports #707, #708; register G620, G681; Austin 2026-11-26:
 * wire all four legs). One editor placed the three street teleporters on 2012-11-29, 21:47 to
 * 22:11 UTC (Ain't That Dry first got a signpost and a door, both deleted, then the teleporter:
 * LA9RMUNU05F3EI8.xml 23-36), the day before the Vortex of Random (hub 143) opened. Each beam is
 * drawn where its Teleporter_Base deco stands (middleground), on a raised pad or ledge top.
 * - Ain't That Dry to Chiti Tiga (certain): YouTube u93BSqMeF9E at about 3119-3143 s, a player
 *   walks left into the beam at the street's left end, the card reads "Leaving Vortex of Random /
 *   Welcome to Folivoria / Entering Chiti Tiga", then stands on the ledge beside Chiti Tiga's beam.
 * - Chiti Tiga to Ain't That Dry (high): the Glitchen wiki's Folivoria page, "There is a teleporter
 *   in Chiti Tiga to Ain't That Dry in Vortex of Random" (research/community/raw/glitchen/
 *   wikitext-main.json, key Folivoria, revision 2019-05-23; the page asks for it to be confirmed).
 * - Harrisa Hara to Snowed In (medium-high): player snap 265988 (2012-12-09), taken in Snowed In,
 *   captioned "Entered Vortex of Random via the teleporter (not door) in Harrisa Hara."
 *   (research/wayback/raw/snaps-2026-11-22/c6-2012/index.tsv line 157). Snowed In is the room off
 *   Abbasid River (js/rebuilt-rooms.js), whose picture has a beam at its left.
 * Ours: the Snowed In to Harrisa Hara leg (the pair's way back, inferred: Snowed In's beam is drawn
 * and goes nowhere else on record), and the exact x/y of every box and landing: each box covers
 * its pad's floor under the beam, each landing stands on a floor line beside the partner beam and
 * clear of its box, and the builder's reach graph walks from each landing to the street's exits.
 */
export const AINT_THAT_DRY_TSID = 'GA9RMUNU05F3EI8';
export const CHITI_TIGA_TSID = 'GDOF2V2INVQ2M9D';
export const HARRISA_HARA_TSID = 'GA957DNLVGN2F0S';
/** Snowed In (js/rebuilt-rooms.js SNOWED_IN_TSID; kept literal so this file stays pure data). */
export const SNOWED_IN_TSID = 'GA9RLGSQ05F3Q69';

// Screen space (street x + 3000, y + 1000), bottom-centre: the passage floor (plat_1351189425427,
// y -448..-444) from x 2860 to the street's end, up to its ceiling (plat_1351202243944, y -605).
export const WIRED_TELEPORTERS = Object.freeze([
  Object.freeze({
    id: 'yellow_yawning_to_shim_shiri',
    objref: null,
    from: YELLOW_YAWNING_TSID,
    to: SHIM_SHIRI_TSID,
    label: 'Shim Shiri',
    box: Object.freeze({ x: 5930, y: 566, w: 140, h: 170 }),
    // Yellow Yawning signpost_2's connect arrive (Shim Shiri screen space).
    arrive: Object.freeze({ x: 908, y: 113 }),
    why: 'The tube\'s right end, in front of its buried Shim Shiri post (world 2917, -234), to where that post\'s link puts you.',
  }),
  // Screen space: the 6000-wide streets are world + (3000, 1000), Snowed In world + (1555, 642).
  // Ain't That Dry's pad: world x -2925..-2858 at y -202, ramps down to -166 / -171 either side.
  Object.freeze({
    id: 'aint_that_dry_to_chiti_tiga',
    objref: null,
    from: AINT_THAT_DRY_TSID,
    to: CHITI_TIGA_TSID,
    label: 'Chiti Tiga',
    box: Object.freeze({ x: 108, y: 832, w: 120, h: 200 }),
    // Chiti Tiga world (2680, -325): the ledge step right of its beam (plat_1332276372016).
    arrive: Object.freeze({ x: 5680, y: 675 }),
    why: 'The beam on the pad at the left end (world -2892) to the ledge beside Chiti Tiga\'s beam (footage u93BSqMeF9E 3119-3143 s).',
  }),
  // Chiti Tiga's ledge top: world x 2527..2596 at y -368, sloping down to -338 / -333 either side.
  Object.freeze({
    id: 'chiti_tiga_to_aint_that_dry',
    objref: null,
    from: CHITI_TIGA_TSID,
    to: AINT_THAT_DRY_TSID,
    label: "Ain't That Dry",
    box: Object.freeze({ x: 5560, y: 660, w: 120, h: 200 }),
    // Ain't That Dry world (-2760, -168): the floor right of its pad (plat_1307647515500).
    arrive: Object.freeze({ x: 240, y: 832 }),
    why: 'The beam on the ledge top (world 2560) to the floor right of Ain\'t That Dry\'s beam (the Glitchen wiki\'s Folivoria page).',
  }),
  // Harrisa Hara's ledge top: world x 2704..2774 at y -567, steps down to -530 / -548 either side.
  Object.freeze({
    id: 'harrisa_hara_to_snowed_in',
    objref: null,
    from: HARRISA_HARA_TSID,
    to: SNOWED_IN_TSID,
    label: 'Snowed In',
    box: Object.freeze({ x: 5739, y: 455, w: 100, h: 200 }),
    // Snowed In world (-860, -115): the hall floor right of its beam (world -972).
    arrive: Object.freeze({ x: 695, y: 527 }),
    why: 'The beam on the ledge top (world 2739) into Snowed In beside its beam (snap 265988, 2012-12-09).',
  }),
  // Snowed In's beam: world x -972 on the hall floor (y -115).
  Object.freeze({
    id: 'snowed_in_to_harrisa_hara',
    objref: null,
    from: SNOWED_IN_TSID,
    to: HARRISA_HARA_TSID,
    label: 'Harrisa Hara',
    box: Object.freeze({ x: 583, y: 532, w: 120, h: 200 }),
    // Harrisa Hara world (2648, -517): the step left of its beam (plat_1328228121849).
    arrive: Object.freeze({ x: 5648, y: 483 }),
    why: 'Ours: the way back the pair implies, from Snowed In\'s beam to the step beside Harrisa Hara\'s beam.',
  }),
]);

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** This file's teleporters on a street (either TSID prefix). */
export function collisionTeleportersOn(tsid) {
  return WIRED_TELEPORTERS.filter((t) => sameTsid(tsid, t.from));
}

const row = (tsid, label, count, state, note) => Object.freeze({ tsid, label, count, state, note });

/** Every street whose location file lists a Collision-triggered Teleporter (G681, 2026-11-13). */
export const TELEPORTER_CENSUS = Object.freeze([
  // Wired elsewhere.
  row('GA524M0OMOE2OGT', 'Mada Tamaha', 4, 'wired', 'js/hell.js NARAKA_TELEPORTERS: the pit floor\'s two ends (1qsoo4vYM74 2:44); the other two not on record'),
  row('GA5PPFP86NF2FOS', 'Hell One', 1, 'wired', 'js/hell.js hellHole: the floor gap under signpost_hell to Mahatam Audarika'),
  row('GA9KL9UE1D82RFO', 'Odena Odes', 1, 'wired', 'js/hidden-floors.js: the ceiling pocket to the forgotten floor'),
  row('GDOOSA8V29J24I3', 'The forgotten floor', 1, 'wired', 'js/hidden-floors.js: past the EXIT back to Odena Odes'),
  row('GIF102FDNU11314', 'Ilmenskie', 1, 'wired', 'js/hidden-floors.js: the top right ledge to the missing floor'),
  row('GIF16GDJ89724E3', 'Goorsh Gam', 1, 'wired', 'js/hidden-floors.js: the top left treetop to the lost floor'),
  row('GLI107JLRU11EM2', 'Level 3 West', 1, 'wired', 'js/cave-pit.js: our own stand-in, each end of the pit back up (G527)'),
  row('GLI23D3LDHD1FQA', 'Northwest Passage', 1, 'wired', 'js/wintry-portal.js: the snowy oval to Wintry Place'),
  row('GDOHDJ84BST2UI2', 'Oppidan Avenue', 4, 'wired', 'js/seam-teleporters.js (G620): the four alcoves'),
  row('GHVP7QOKT403F5Q', 'Purplysa', 17, 'wired', 'puzzle-triggers.json: the 17 crystal clusters, respawn hazards'),
  row('GDOSHD9J6NT2HUJ', 'Umbra', 4, 'wired', 'js/penumbra.js: the way in and out of Penumbra'),
  row('GIFPV9EMLT72DP4', 'unnnn', 2, 'wired', 'js/tower-mid-rooms.js STOOT_TELEPORTER_ID: out of the crawlspace'),
  row('GNVV9IM8PL4301V', "A Summer's Day", 1, 'wired', 'js/summers-day.js and puzzle-triggers.json: the quest room\'s exit'),
  row('GHFRK14DDU53RQQ', "A L'il Animal Kinship", 1, 'wired', 'js/skillquest-ak.js: the EXIT, the newxp finish box'),
  row('GUVCT29PSU53G9V', 'Lift Your Light Green Thumb', 1, 'wired', 'js/newxp.js finishBox: the skill quest room\'s exit'),
  row('GDOBUP8IR8E2IPH', 'Toxic Moon', 2, 'wired', 'js/party-spaces.js: a party space, entered and left by the party teleporter'),
  row('GHF8DDDBTPF3P4U', 'Area 42', 1, 'wired', 'js/quest-rooms/gwendolyn.js: a quest room the rebuild runs as a scene'),
  row('GHFIV4V8J6J2I7U', 'Axis Denyde', 1, 'wired', 'js/ilmenskie-quest.js: the rescue room, left by teleporting out'),
  row('GTJ10M515812V0C', 'Corridor Five', 1, 'wired', 'js/gwendolyn-room-23.js: Room 23 and back; every floor reaches a door'),
  // Signposts standing in.
  row('GM4115NJ46G8M', 'Groddle Ladder', 2, 'stand-in', 'js/ladder-top-signposts.js: the spine ladder\'s top post to The Great Hole to Ix; the other not on record, no trap'),
  row('GLI2VDR4JRD1AEG', 'The Great Hole to Ix', 1, 'stand-in', 'the hole between its one-way walls (x -2752, -2595) leads down by the buried Groddle Ladder post (isBuriedSignpost)'),
  row('GUV174V0QUB3JT4', 'Ambu Jal', 1, 'stand-in', 'the buried Indri Slope post (y 75, isBuriedSignpost); a swim street, no trap'),
  // Wired here.
  row(YELLOW_YAWNING_TSID, 'Yellow Yawning', 2, 'here', 'WIRED_TELEPORTERS: the right end to Shim Shiri by its buried post; the second not on record, no trap'),
  row(HARRISA_HARA_TSID, 'Harrisa Hara', 1, 'here', 'WIRED_TELEPORTERS: the ledge top beam into Snowed In (snap 265988, 2012-12-09); back from Snowed In is ours'),
  row(AINT_THAT_DRY_TSID, "Ain't That Dry", 1, 'here', 'WIRED_TELEPORTERS: the left end beam to Chiti Tiga (footage u93BSqMeF9E 3119-3143 s)'),
  row(CHITI_TIGA_TSID, 'Chiti Tiga', 1, 'here', 'WIRED_TELEPORTERS: the ledge top beam to Ain\'t That Dry (the Glitchen wiki\'s Folivoria page)'),
  // Inert: target lost, nothing traps.
  row('GA54AT4AK613NBL', 'Facta Verba', 1, 'inert', 'no walls, every arrival reaches all three posts; target lost'),
  row('GA5S44RM9OE2416', 'Valuka Himsa', 1, 'inert', 'no walls, both posts reached; the one floor no one reaches is a 96 px rock island over the middle (plat_1330395190073), likely where it went, but from where is lost'),
  row('GCR144H8APK1OJS', 'Buckward Vale', 1, 'inert', 'its two walls hang from the ceiling over the floor (x 1045, 1136, y -996..-813), both posts reached; target lost'),
  row('GIF10RP1DBU11NU', 'Koulato Cluster', 1, 'inert', 'the post reached from its arrival; with the firefly jar script and its three lost boxes, target lost'),
  row('GLI104NPBDC1DC2', 'Market St', 1, 'inert', 'Old Groddle Forest: every connect hidden, nothing arrives'),
  row('GM113VSD6922MRJ', 'Tharon Spelunk', 1, 'inert', 'its walls are open (pc_perm 0) or low, all three posts reached; target lost'),
  row('GM410TMR0S2S1', 'Ruta Asuncion', 1, 'inert', 'all four exits reached (two posts, two doors to itself); target lost'),
  row('GM4109NI2R640', 'Guillermo Gamera Way', 1, 'inert', 'the race street (js/races.js); all exits reached; target lost'),
  row('GTJ11TPQUMO197U', 'Mucid Memes', 1, 'inert', 'no walls, both posts reached; target lost'),
]);
