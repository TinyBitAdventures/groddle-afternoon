/**
 * Write the rooms rebuilt from players' pictures (public/js/rebuilt-rooms.js;
 * register rows G157 Snowed In and Growing Stuff, G158 Martleby Hare, G159
 * Ethereal Endeavour) as street JSON, list them in assets/streets/index.json, and
 * point the doors that lead in at them: Abbasid River's door_1353965313720,
 * Abbasid Jail's door_1353965060768, Doonboggle Trail's locked
 * door_1343415170600 (Door Key 1) and Rookthills Lay's locked door_1 (Door Key 2).
 * Also Winter Walk and Winter Haven (public/js/winter-walk-streets.js), the
 * two streets the timed Winter Walk route runs on (no doors lead in).
 * Also Louise Pasture Villa (public/js/louise-pasture-villa.js, G371): its
 * EXIT door out to Louise Pasture, and the apartment house, door and sign
 * that lead in, added to Louise Pasture.
 * Also the Interrogation room (public/js/interrogation-room.js, G352): no door
 * leads in or out (the console's teleport brings an administrator in, and the
 * room's own door, run by its feature, takes them back).
 * Also the two skill-quest practice streets (public/js/practice-streets.js, G682),
 * Breezy, EZ Cookin' and Talking 'bout Soil Appreciation: no doors lead in (the
 * quests' starts and the tutorial's EZ Cooking pick move you there).
 * Each door's own connect x/y is kept and snapped to the rebuilt floor. Safe to
 * re-run; run it again after a street re-import or a build-street-navigation.mjs
 * pass.
 *
 *   node tools/build-rebuilt-rooms.mjs          write
 *   node tools/build-rebuilt-rooms.mjs --check  exit 1 if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=90fca5cc';
import {
  ABBASID_JAIL_DOOR,
  ABBASID_JAIL_TSID,
  ABBASID_RIVER_DOOR,
  ABBASID_RIVER_TSID,
  DOONBOGGLE_DOOR,
  DOONBOGGLE_TSID,
  ETHEREAL_ARRIVE,
  ETHEREAL_TEMPLATE_TSID,
  ETHEREAL_TSID,
  FOOTLANDS_BALCONY,
  FOOTLANDS_TSID,
  GROWING_STUFF_ARRIVE,
  GROWING_STUFF_TSID,
  MARTLEBY_ARRIVE,
  MARTLEBY_TSID,
  ROOKTHILLS_DOOR,
  ROOKTHILLS_TSID,
  SNOWED_IN_ARRIVE,
  SNOWED_IN_TSID,
  etherealIndexEntry,
  etherealStreet,
  growingStuffIndexEntry,
  growingStuffStreet,
  martlebyIndexEntry,
  martlebyStreet,
  snowedInIndexEntry,
  snowedInStreet,
} from '../public/js/rebuilt-rooms.js?v=8c2eaf24';
import {
  WINTER_HAVEN_TSID,
  WINTER_WALK_TSID,
  winterHavenIndexEntry,
  winterHavenStreet,
  winterWalkIndexEntry,
  winterWalkStreet,
} from '../public/js/winter-walk-streets.js?v=d1c7d113';
import {
  HOUSE_GROUND_ART,
  LOUISE_PASTURE_DOOR,
  LOUISE_PASTURE_ENTRY,
  LOUISE_PASTURE_HOUSE,
  LOUISE_PASTURE_SIGN_ID,
  LOUISE_PASTURE_TSID,
  LOUISE_VILLA_ARRIVE,
  LOUISE_VILLA_EXIT_DOOR,
  LOUISE_VILLA_TEMPLATE_TSID,
  LOUISE_VILLA_TSID,
  louisePastureEntry,
  louisePastureHouseSpan,
  louiseVillaIndexEntry,
  louiseVillaStreet,
} from '../public/js/louise-pasture-villa.js?v=01066f39';
import {
  INTERROGATION_ARRIVE,
  INTERROGATION_TSID,
  interrogationIndexEntry,
  interrogationStreet,
} from '../public/js/interrogation-room.js?v=c6a73859';
import {
  EZ_COOKIN_TSID,
  PRACTICE_FLAMINGO,
  PRACTICE_START,
  SOIL_TSID,
  ezCookinIndexEntry,
  ezCookinStreet,
  soilIndexEntry,
  soilStreet,
} from '../public/js/practice-streets.js?v=557238c1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streetsDir = join(root, 'public/assets/streets');
const check = process.argv.includes('--check');
const stale = [];

const read = (file) => JSON.parse(readFileSync(join(streetsDir, file), 'utf8'));

function put(file, text) {
  let before = '';
  try {
    before = readFileSync(join(streetsDir, file), 'utf8');
  } catch {
    /* new file */
  }
  if (before === text) return;
  stale.push(file);
  if (!check) writeFileSync(join(streetsDir, file), text);
}

/** The way back lands in front of the entry door (door x/y are the entry street's screen space). */
function inFrontOf(street, doorId) {
  const door = (street.doors || []).find((d) => d.id === doorId);
  if (!door) throw new Error(`${street.label} has no ${doorId}`);
  const xy = { x: door.x + street.bounds.l, y: door.y + street.bounds.t };
  const at = arrivalInTarget(street, xy.x, xy.y);
  if (!at?.snapped) throw new Error(`no floor in front of ${street.label}'s ${doorId}`);
  return { door, xy, arrive: { x: at.x, y: at.y } };
}

/** Point the entry door at the rebuilt room: its own connect x/y, snapped to the room's floor. */
function wireDoor(entry, door, room, expected) {
  if (door.connect?.tsid?.slice(1) !== room.tsid.slice(1)) throw new Error(`${entry.label}'s ${door.id} no longer leads to ${room.label}`);
  if (door.connect.x !== expected.x || door.connect.y !== expected.y) throw new Error(`${entry.label}'s ${door.id} connect moved: ${door.connect.x},${door.connect.y}`);
  const at = arrivalInTarget(room, door.connect.x, door.connect.y);
  if (!at?.snapped) throw new Error(`no floor at ${door.connect.x},${door.connect.y} in ${room.label}`);
  door.connect.street = room.tsid;
  door.connect.arrive = { x: at.x, y: at.y };
}

const indexPath = join(streetsDir, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
let indexChanged = false;
function indexRow(tsid, row) {
  if (JSON.stringify(index.streets[tsid]) === JSON.stringify(row)) return;
  index.streets[tsid] = row;
  indexChanged = true;
}

// Snowed In, behind Abbasid River's door.
{
  const abbasid = read(`${ABBASID_RIVER_TSID}.json`);
  const { door, xy, arrive } = inFrontOf(abbasid, ABBASID_RIVER_DOOR);
  const room = snowedInStreet({ abbasidArrive: arrive, abbasidXY: xy });
  wireDoor(abbasid, door, room, SNOWED_IN_ARRIVE);
  put(`${SNOWED_IN_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${ABBASID_RIVER_TSID}.json`, `${JSON.stringify(abbasid)}\n`);
  indexRow(SNOWED_IN_TSID, snowedInIndexEntry(room));
}

// Ethereal Endeavour, behind Doonboggle Trail's locked door.
{
  const trail = read(`${DOONBOGGLE_TSID}.json`);
  const { door, xy, arrive } = inFrontOf(trail, DOONBOGGLE_DOOR);
  if (!door.is_locked || door.key_id !== 1) throw new Error("Doonboggle Trail's door is no longer locked with Door Key 1");
  const room = etherealStreet(read(`${ETHEREAL_TEMPLATE_TSID}.json`), { doonboggleArrive: arrive, doonboggleXY: xy });
  wireDoor(trail, door, room, ETHEREAL_ARRIVE);
  put(`${ETHEREAL_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${DOONBOGGLE_TSID}.json`, `${JSON.stringify(trail)}\n`);
  indexRow(ETHEREAL_TSID, etherealIndexEntry(room));
}

// Martleby Hare, behind Rookthills Lay's locked door; its door lands on Footlands Heath's balcony.
{
  const rook = read(`${ROOKTHILLS_TSID}.json`);
  const door = (rook.doors || []).find((d) => d.id === ROOKTHILLS_DOOR);
  if (!door) throw new Error(`Rookthills Lay has no ${ROOKTHILLS_DOOR}`);
  if (!door.is_locked || door.key_id !== 2) throw new Error("Rookthills Lay's door is no longer locked with Door Key 2");
  const footlands = read(`${FOOTLANDS_TSID}.json`);
  const balcony = arrivalInTarget(footlands, FOOTLANDS_BALCONY.x, FOOTLANDS_BALCONY.y);
  if (!balcony?.snapped) throw new Error("no floor on Footlands Heath's balcony");
  const room = martlebyStreet({ footlandsArrive: { x: balcony.x, y: balcony.y } });
  wireDoor(rook, door, room, MARTLEBY_ARRIVE);
  put(`${MARTLEBY_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${ROOKTHILLS_TSID}.json`, `${JSON.stringify(rook)}\n`);
  indexRow(MARTLEBY_TSID, martlebyIndexEntry(room));
}

// Growing Stuff, behind Abbasid Jail's door: Snowed In's hall, out by the lift.
{
  const jail = read(`${ABBASID_JAIL_TSID}.json`);
  const { door, xy, arrive } = inFrontOf(jail, ABBASID_JAIL_DOOR);
  if (door.is_locked || door.key_id) throw new Error("Abbasid Jail's door is no longer an open door");
  const room = growingStuffStreet({ jailArrive: arrive, jailXY: xy });
  wireDoor(jail, door, room, GROWING_STUFF_ARRIVE);
  put(`${GROWING_STUFF_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${ABBASID_JAIL_TSID}.json`, `${JSON.stringify(jail)}\n`);
  indexRow(GROWING_STUFF_TSID, growingStuffIndexEntry(room));
}

// Winter Walk and Winter Haven: the quest's two instance streets, entered only by the route (js/winter-walk.js).
{
  const walk = winterWalkStreet();
  put(`${WINTER_WALK_TSID}.json`, `${JSON.stringify(walk)}\n`);
  indexRow(WINTER_WALK_TSID, winterWalkIndexEntry(walk));
  const haven = winterHavenStreet();
  put(`${WINTER_HAVEN_TSID}.json`, `${JSON.stringify(haven)}\n`);
  indexRow(WINTER_HAVEN_TSID, winterHavenIndexEntry(haven));
}

// Louise Pasture Villa: out by its EXIT door to Louise Pasture, in by the door and sign added there.
{
  const pasture = read(`${LOUISE_PASTURE_TSID}.json`);
  const E = LOUISE_PASTURE_ENTRY;
  const foot = arrivalInTarget(pasture, E.x, -130);
  if (!foot?.snapped) throw new Error("no floor on Louise Pasture's flat stretch");
  const ground = foot.y + pasture.bounds.t;
  const template = read(`${LOUISE_VILLA_TEMPLATE_TSID}.json`);
  const draft = louiseVillaStreet(template);
  const villaArrive = arrivalInTarget(draft, LOUISE_VILLA_ARRIVE.x, LOUISE_VILLA_ARRIVE.y);
  if (!villaArrive?.snapped) throw new Error('no floor at the villa arrival');
  const mg = pasture.layers.find((l) => l.name === 'middleground');
  const ours = new Set([LOUISE_PASTURE_SIGN_ID, LOUISE_PASTURE_HOUSE.base.id, LOUISE_PASTURE_HOUSE.extension.id]);
  const theirs = mg.decos.filter((d) => !ours.has(d.id));
  const z = 1 + Math.max(...theirs.map((d) => d.z));
  // The house stands in front of the ground strips under it and behind everything else there
  // (flowers, bushes), as on the five tower streets.
  const span = louisePastureHouseSpan();
  const under = theirs.filter((d) => d.x + d.w / 2 > span.l && d.x - d.w / 2 < span.r);
  const houseZ = 1 + Math.max(...under.filter((d) => HOUSE_GROUND_ART.test(d.sprite)).map((d) => d.z));
  const inFront = under.filter((d) => !HOUSE_GROUND_ART.test(d.sprite) && d.z <= houseZ + 1);
  if (inFront.length) throw new Error(`Louise Pasture: ${inFront.map((d) => d.sprite).join(', ')} would draw behind the villa's house`);
  const signFoot = arrivalInTarget(pasture, E.x + E.sign.dx, -130);
  if (!signFoot?.snapped) throw new Error("no floor under the villa's sign");
  const { door, house, sign } = louisePastureEntry(pasture, ground, {
    villaArrive: { x: villaArrive.x, y: villaArrive.y },
    z,
    houseZ,
    signGround: signFoot.y + pasture.bounds.t,
  });
  pasture.doors = [...(pasture.doors || []).filter((d) => d.id !== LOUISE_PASTURE_DOOR), door];
  mg.decos = [...theirs, ...house, sign];
  pasture.stats.doorCount = pasture.doors.length;
  pasture.stats.decoCount = pasture.layers.reduce((n, l) => n + l.decos.length, 0);
  const room = louiseVillaStreet(template, { pastureXY: { x: E.x, y: ground }, pastureArrive: { x: foot.x, y: foot.y } });
  if (!room.doors.some((d) => d.id === LOUISE_VILLA_EXIT_DOOR)) throw new Error('the villa lost its EXIT door');
  if (room.tsid !== LOUISE_VILLA_TSID) throw new Error('villa tsid');
  put(`${LOUISE_VILLA_TSID}.json`, `${JSON.stringify(room)}\n`);
  put(`${LOUISE_PASTURE_TSID}.json`, `${JSON.stringify(pasture)}\n`);
  indexRow(LOUISE_VILLA_TSID, louiseVillaIndexEntry(room));
}

// The Interrogation room: a closed room, its arrival on the floor in the booth.
{
  const room = interrogationStreet();
  const at = arrivalInTarget(room, INTERROGATION_ARRIVE.x, INTERROGATION_ARRIVE.y - 4);
  if (!at?.snapped) throw new Error('no floor under the Interrogation room arrival');
  put(`${INTERROGATION_TSID}.json`, `${JSON.stringify(room)}\n`);
  indexRow(INTERROGATION_TSID, interrogationIndexEntry(room));
}

// The practice streets: closed streets, the start (123, -958) falling onto the lane.
for (const [tsid, build, row] of [[EZ_COOKIN_TSID, ezCookinStreet, ezCookinIndexEntry], [SOIL_TSID, soilStreet, soilIndexEntry]]) {
  const street = build();
  // The start falls onto the lane at the flamingo's spot (skillquest_*.js initial_flamingo).
  const at = arrivalInTarget(street, PRACTICE_START.x, PRACTICE_FLAMINGO.y - 4);
  if (!at?.snapped) throw new Error(`no floor under ${street.label}'s start`);
  put(`${tsid}.json`, `${JSON.stringify(street)}\n`);
  indexRow(tsid, row(street));
}

if (indexChanged) put('index.json', `${JSON.stringify(index, null, 2)}\n`);

console.log(`${check ? 'stale' : 'wrote'}: ${stale.length ? stale.join(', ') : 'nothing'}`);
if (check && stale.length) process.exit(1);
