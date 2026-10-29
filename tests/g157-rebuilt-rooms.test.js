/**
 * Snowed In, Ethereal Endeavour, Martleby Hare and Growing Stuff, rebuilt
 * from players' pictures (js/rebuilt-rooms.js, tools/build-rebuilt-rooms.mjs,
 * features/rebuilt-rooms-feature.js). Register rows G157, G158, G159.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js';
import { arrivalInTarget } from '../public/js/location-navigation.js';
import { populationForStreet } from '../public/js/street-ecology.js';
import { checkDoorEntry, doorAt, doorDestination } from '../public/js/doors.js';
import { eventCounters, SEAM_STREETS } from '../public/js/quest-offers.js?v=g403-1';
import {
  ABBASID_JAIL_DOOR,
  ABBASID_JAIL_TSID,
  ABBASID_RIVER_DOOR,
  ABBASID_RIVER_TSID,
  DOONBOGGLE_DOOR,
  DOONBOGGLE_TSID,
  ETHEREAL_ARRIVE,
  ETHEREAL_EXIT_DOOR,
  ETHEREAL_OVAL,
  ETHEREAL_QUOINS,
  ETHEREAL_TEMPLATE_TSID,
  ETHEREAL_TSID,
  FOOTLANDS_TSID,
  GROWING_STUFF_ARRIVE,
  GROWING_STUFF_BEDS,
  GROWING_STUFF_EXIT_DOOR,
  GROWING_STUFF_FLOOR_Y,
  GROWING_STUFF_LAMPS,
  GROWING_STUFF_SNAP_VIEW,
  GROWING_STUFF_TSID,
  MARTLEBY_ARRIVE,
  MARTLEBY_DOOR,
  MARTLEBY_EXIT_DOOR,
  MARTLEBY_TIERS,
  MARTLEBY_TSID,
  REBUILT_ROOMS,
  ROOKTHILLS_DOOR,
  ROOKTHILLS_TSID,
  SNOWED_IN_ARRIVE,
  SNOWED_IN_BAYS,
  SNOWED_IN_EXIT_DOOR,
  SNOWED_IN_FLOOR_Y,
  SNOWED_IN_LIFT,
  SNOWED_IN_TSID,
  isRebuiltRoomTsid,
  rebuiltRoomEcology,
} from '../public/js/rebuilt-rooms.js';
import { rebuiltRoomsFeature } from '../public/js/features/rebuilt-rooms-feature.js';
import { FEATURES } from '../public/js/features/index.js?v=registry-266';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS');
const locations = join(spike, '../streets/mnt/stos/location_data');
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));

const si = street(SNOWED_IN_TSID);
const ee = street(ETHEREAL_TSID);
const mh = street(MARTLEBY_TSID);
const gs = street(GROWING_STUFF_TSID);
const rooms = { [SNOWED_IN_TSID]: si, [ETHEREAL_TSID]: ee, [MARTLEBY_TSID]: mh, [GROWING_STUFF_TSID]: gs };

/** A platform under world x within 2 px of world y. */
const floorAt = (s, x, y) => s.platforms.some((p) => {
  const py = platformYAt(p, x, 0);
  return py != null && Math.abs(py - y) <= 2;
});
/** Screen-space door arrival lands on a platform of the target street. */
const landsOnFloor = (target, arrive) => floorAt(target, arrive.x + target.bounds.l, arrive.y + target.bounds.t);
const door = (s, id) => (s.doors || []).find((d) => d.id === id);

describe('rebuilt rooms: street JSON', () => {
  it('are written, indexed and current (tools/build-rebuilt-rooms.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    for (const room of REBUILT_ROOMS) {
      const s = rooms[room.tsid];
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.reconstructed, true);
      assert.equal(s.label, room.label);
      const row = index.streets[room.tsid];
      assert.deepEqual([row.label, row.reconstructed, row.file, row.platforms], [room.label, true, `assets/streets/${room.tsid}.json`, s.platforms.length]);
      assert.equal(s.stats.decoCount, s.layers.reduce((n, l) => n + l.decos.length, 0));
    }
    assert.deepEqual([index.streets[SNOWED_IN_TSID].hubName, index.streets[ETHEREAL_TSID].hubName, index.streets[MARTLEBY_TSID].hubName, index.streets[GROWING_STUFF_TSID].hubName], ['Vortex of Random', 'Gentle Island', 'Groddle Heights', 'Vortex of Random']);
    assert.equal(REBUILT_ROOMS.length, 4);
  });

  it('draw only CC0 decos already shipped (layers, doors)', () => {
    for (const s of Object.values(rooms)) {
      for (const layer of s.layers) {
        for (const d of layer.decos) {
          assert.ok(existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${s.label}: ${d.sprite}`);
          assert.ok(manifest.has(d.sprite), `${s.label}: ${d.sprite} in the deco manifest`);
        }
      }
      for (const d of s.doors) assert.ok(manifest.has(d.sprite) && existsSync(join(pub, 'assets/decos/groddle', `${d.sprite}.webp`)), `${s.label} door ${d.sprite}`);
    }
  });

  it('the GSJS map lists name all four; only Martleby Hare is a Seam Street', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8');
    assert.match(maps, /"LA9RLGSQ05F3Q69"\t: "Snowed In"/);
    assert.match(maps, /"LA9EKMN138D3QK2"\t: "Ethereal Endeavour"/);
    assert.match(maps, /"LCR14T7ECHM18G8"\t: "Martleby Hare"/);
    assert.match(maps, /"LA9S2N3F15F3JD3"\t: "Growing Stuff"/);
    const loc = readFileSync(join(gsjs, 'locations/location.js'), 'utf8');
    const line = loc.split('\n').find((l) => l.includes("getQuestStatus('explore_the_seams')"));
    const listed = [...line.matchAll(/'(L[A-Z0-9]{14})'/g)].map((m) => `G${m[1].slice(1)}`);
    assert.deepEqual([...listed].sort(), [...SEAM_STREETS].sort());
    assert.ok(listed.includes(MARTLEBY_TSID) && !listed.includes(SNOWED_IN_TSID) && !listed.includes(ETHEREAL_TSID) && !listed.includes(GROWING_STUFF_TSID));
  });
});

describe('rebuilt rooms: doors in and out', () => {
  const cases = [
    { room: si, from: ABBASID_RIVER_TSID, id: ABBASID_RIVER_DOOR, key: 0, arrive: SNOWED_IN_ARRIVE, exit: SNOWED_IN_EXIT_DOOR, back: ABBASID_RIVER_TSID },
    { room: ee, from: DOONBOGGLE_TSID, id: DOONBOGGLE_DOOR, key: 1, arrive: ETHEREAL_ARRIVE, exit: ETHEREAL_EXIT_DOOR, back: DOONBOGGLE_TSID },
    { room: mh, from: ROOKTHILLS_TSID, id: ROOKTHILLS_DOOR, key: 2, arrive: MARTLEBY_ARRIVE, exit: MARTLEBY_EXIT_DOOR, back: FOOTLANDS_TSID },
    { room: gs, from: ABBASID_JAIL_TSID, id: ABBASID_JAIL_DOOR, key: 0, arrive: GROWING_STUFF_ARRIVE, exit: GROWING_STUFF_EXIT_DOOR, back: ABBASID_JAIL_TSID },
  ];

  for (const c of cases) {
    it(`${c.room.label}: the source door leads in at its own connect point, ${c.key ? `locked with Door Key ${c.key}` : 'unlocked'}`, () => {
      const entry = street(c.from);
      const d = door(entry, c.id);
      assert.equal(d.connect.street, c.room.tsid);
      assert.equal(d.connect.tsid, `L${c.room.tsid.slice(1)}`);
      assert.deepEqual([d.connect.x, d.connect.y], [c.arrive.x, c.arrive.y]);
      assert.deepEqual([Boolean(d.is_locked), d.key_id || 0], [c.key > 0, c.key]);
      const at = arrivalInTarget(c.room, c.arrive.x, c.arrive.y);
      assert.ok(at.snapped, 'a floor under the arrival');
      assert.deepEqual(d.connect.arrive, { x: at.x, y: at.y });
      assert.ok(landsOnFloor(c.room, d.connect.arrive));
      const dest = doorDestination(d);
      assert.equal(dest.street, c.room.tsid);
      // The door's own checks: a key door turns you away without its key.
      const none = checkDoorEntry(d, { level: 1, hasKey: () => false, destination: dest });
      const held = checkDoorEntry(d, { level: 1, hasKey: () => true, destination: dest });
      if (c.key) {
        assert.equal(none.ok, false);
        assert.equal(held.ok, true);
      } else {
        assert.equal(none.ok, true);
      }
    });

    it(`${c.room.label}: its way out lands on a floor in ${c.back}`, () => {
      const out = door(c.room, c.exit);
      assert.ok(out, 'an exit door');
      assert.deepEqual([out.is_locked, out.hidden, out.key_id], [false, false, 0]);
      assert.equal(out.connect.street, c.back);
      const target = street(c.back);
      assert.ok(out.connect.arrive && landsOnFloor(target, out.connect.arrive), 'snapped to a floor');
      // A player standing on the floor in front of it is at the door (doors.js doorAt).
      const feet = arrivalInTarget(c.room, out.x + c.room.bounds.l, out.y + c.room.bounds.t);
      assert.ok(feet.snapped, `${out.id} over a floor`);
      assert.equal(doorAt(c.room.doors, feet.x, feet.y)?.id, out.id);
      assert.equal(checkDoorEntry(out, { destination: doorDestination(out) }).ok, true);
    });
  }

  it('the source XML holds the four doors', { skip: !existsSync(locations) && 'street dump not beside this worktree' }, () => {
    const abbasid = readFileSync(join(locations, `${ABBASID_RIVER_TSID}.xml`), 'utf8');
    assert.match(abbasid, /<objref id="target" tsid="LA9RLGSQ05F3Q69" label="Snowed In"\/>/);
    assert.match(abbasid.slice(abbasid.indexOf('<object id="sources">')).slice(0, 300), /LA9RLGSQ05F3Q69/, "Abbasid River's sources list Snowed In");
    const trail = readFileSync(join(locations, `${DOONBOGGLE_TSID}.xml`), 'utf8');
    assert.match(trail, /<objref id="target" tsid="LA9EKMN138D3QK2" label="Ethereal Endeavour"\/>/);
    const rook = readFileSync(join(locations, `${ROOKTHILLS_TSID}.xml`), 'utf8');
    assert.match(rook, /<objref id="target" tsid="LCR14T7ECHM18G8" label="Martleby Hare"\/>/);
    const foot = readFileSync(join(locations, `${FOOTLANDS_TSID}.xml`), 'utf8');
    assert.match(foot.slice(foot.indexOf('<object id="sources">')).slice(0, 300), /LCR14T7ECHM18G8/, "Footlands Heath's sources list Martleby Hare");
    const jail = readFileSync(join(locations, `${ABBASID_JAIL_TSID}.xml`), 'utf8');
    assert.match(jail, /<objref id="target" tsid="LA9S2N3F15F3JD3" label="Growing Stuff"\/>/);
    assert.match(jail.slice(jail.indexOf('<object id="sources">')).slice(0, 300), /LA9S2N3F15F3JD3/, "Abbasid Jail's sources list Growing Stuff");
    // Its door names the apartment interior art.
    const at = jail.indexOf(`<object id="${ABBASID_JAIL_DOOR}">`);
    assert.match(jail.slice(at, at + 1600), /bldg_int_apt/);
  });

  it("Growing Stuff's door was made four minutes before Snowed In's (the same hall)", () => {
    const made = (id) => Number(id.replace('door_', ''));
    const gap = made(ABBASID_RIVER_DOOR) - made(ABBASID_JAIL_DOOR);
    assert.ok(gap > 0 && gap < 5 * 60 * 1000, `${gap} ms`);
    assert.ok(Math.abs(GROWING_STUFF_ARRIVE.x - SNOWED_IN_ARRIVE.x) < 30 && Math.abs(GROWING_STUFF_ARRIVE.y - SNOWED_IN_ARRIVE.y) < 10, 'both land just right of the lift');
  });
});

describe('rebuilt rooms: layouts after the pictures', () => {
  it('Snowed In is the 3110 x 642 hall: eight doors, four windows, the lift, the teleporter, the camp', () => {
    assert.deepEqual(si.bounds, { l: -1555, r: 1555, t: -642, b: 0 });
    assert.equal(SNOWED_IN_BAYS.filter((b) => b.kind === 'door').length, 8);
    assert.equal(SNOWED_IN_BAYS.filter((b) => b.kind === 'window').length, 4);
    const all = si.layers.flatMap((l) => l.decos);
    const count = (re) => all.filter((d) => re.test(d.sprite)).length;
    assert.equal(count(/^door_asset_abandoned_apt_1$/), 8);
    assert.equal(count(/^apartment_hall_wall_piece_window$/), 4);
    assert.equal(count(/^apartment_hall_elevator$/), 1);
    assert.equal(count(/^Teleporter_(Base|Beam)$/), 2);
    assert.ok(count(/^snow_(skirt|rubble)_/) >= 8, 'the drifts');
    for (const s of ['hanging_clothes_line', 'juju_grandma_campfire_01a_al1', 'deco_chair_wooden_ghtest', 'deco_stool_wooden_ghtest']) assert.equal(count(new RegExp(`^${s}$`)), 1, s);
    assert.ok(floorAt(si, -1500, SNOWED_IN_FLOOR_Y) && floorAt(si, 1500, SNOWED_IN_FLOOR_Y), 'one floor end to end');
    const lift = door(si, SNOWED_IN_EXIT_DOOR);
    assert.equal(lift.sprite, 'door_asset_elevator_door');
    assert.ok(Math.abs(lift.x + si.bounds.l - SNOWED_IN_ARRIVE.x) < 150, 'Abbasid River lands beside the lift');
  });

  it('Ethereal Endeavour is the newxp brain end, mirrored: membrane, oval and EXIT at the left', () => {
    const template = street(ETHEREAL_TEMPLATE_TSID);
    assert.equal(template.swf_file, 'newxp.swf');
    const mid = ee.layers.find((l) => l.id === 'middleground');
    const wall = mid.decos.find((d) => d.sprite === 'Cellular_wall_back_wide');
    assert.ok(wall && wall.flip === true && wall.x < 0, 'the membrane, flipped, on the left half');
    const sign = mid.decos.find((d) => d.sprite === 'sign_exit_starter_01a');
    assert.ok(sign && Math.abs(sign.x - ETHEREAL_OVAL.x) < 120, 'EXIT by the oval');
    const out = door(ee, ETHEREAL_EXIT_DOOR);
    assert.ok(Math.abs(out.x + ee.bounds.l - ETHEREAL_OVAL.x) < 40, 'the way out is the oval');
    // Only brain art came across, and every layer keeps the template's parallax rule.
    for (const layer of ee.layers) for (const d of layer.decos) assert.match(d.sprite, /^(cell|Cellular|neuron|Brain|glowing_orb|newStart_background|sign_exit)/);
    assert.ok(ee.layers.length >= 4, 'the template layers');
    // The floor runs from the left bound to the right one.
    assert.ok(floorAt(ee, ee.bounds.l + 2, ETHEREAL_OVAL.floor), 'floor under the membrane');
    const xs = ee.platforms.flatMap((p) => [p.x1, p.x2]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [ee.bounds.l, ee.bounds.r]);
  });

  it('Martleby Hare: each ledge ends over the next, down to the stone-arched door, with no ladders', () => {
    assert.deepEqual(mh.bounds, { l: -750, r: 750, t: -2000, b: 0 });
    assert.equal(mh.ladders.length, 0);
    const first = MARTLEBY_TIERS[0];
    assert.ok(first.segs.some(([a, b]) => MARTLEBY_ARRIVE.x > a && MARTLEBY_ARRIVE.x < b) && first.y === MARTLEBY_ARRIVE.y);
    for (let i = 0; i + 1 < MARTLEBY_TIERS.length; i += 1) {
      const [a, b] = MARTLEBY_TIERS[i].segs[0];
      const next = MARTLEBY_TIERS[i + 1];
      // The open end (not at the street edge) drops onto the next ledge.
      const ends = [a > mh.bounds.l ? a - 20 : null, b < mh.bounds.r ? b + 20 : null].filter((x) => x != null);
      assert.ok(ends.length, `${MARTLEBY_TIERS[i].id} has an open end`);
      assert.ok(ends.every((x) => floorAt(mh, x, next.y)), `${MARTLEBY_TIERS[i].id} drops onto ${next.id}`);
    }
    const out = door(mh, MARTLEBY_EXIT_DOOR);
    assert.equal(out.sprite, 'heights_door_static');
    assert.equal(out.y + mh.bounds.t, MARTLEBY_TIERS[MARTLEBY_DOOR.tier].y);
    assert.ok(out.x + mh.bounds.l > 0, 'right of centre, as in the snap');
    // Footlands Heath's balcony: the door lands in front of its stone-arched door deco.
    const foot = street(FOOTLANDS_TSID);
    const balconyDoor = foot.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'heights_door_static');
    assert.ok(Math.abs(out.connect.arrive.x + foot.bounds.l - balconyDoor.x) < 60);
  });
});

describe('Growing Stuff: Snowed In\'s hall after Hedge\'s Snap', () => {
  const all = gs.layers.flatMap((l) => l.decos);
  const count = (re) => all.filter((d) => re.test(d.sprite)).length;
  const front = gs.layers.find((l) => l.id !== 'middleground');
  /** A front-layer deco's world x. */
  const fx = (d) => d.x + gs.bounds.l;

  it('keeps the hall: bounds, twelve bays, the lift as the way out, one floor end to end', () => {
    assert.deepEqual(gs.bounds, si.bounds);
    assert.equal(count(/^door_asset_abandoned_apt_1$/), 8);
    assert.equal(count(/^apartment_hall_wall_piece_window$/), 4);
    assert.equal(count(/^apartment_hall_elevator$/), 1);
    const lift = door(gs, GROWING_STUFF_EXIT_DOOR);
    assert.equal(lift.sprite, 'door_asset_elevator_door');
    assert.equal(lift.x + gs.bounds.l, SNOWED_IN_LIFT.door.x);
    assert.ok(Math.abs(lift.x + gs.bounds.l - GROWING_STUFF_ARRIVE.x) < 150, 'Abbasid Jail lands beside the lift');
    assert.ok(floorAt(gs, gs.bounds.l + 5, GROWING_STUFF_FLOOR_Y) && floorAt(gs, gs.bounds.r - 5, GROWING_STUFF_FLOOR_Y));
    assert.equal(GROWING_STUFF_FLOOR_Y, GROWING_STUFF_ARRIVE.y, 'the connect point is on the floor line');
    // No snow, no camp, no teleporter: those were Snowed In's.
    assert.equal(count(/^(snow_|whitesnow_|Teleporter_|juju_grandma|hanging_clothes)/), 0);
  });

  it('the Snap\'s view: boarded door, door, slit window, door, boarded door; lamps at the pilasters', () => {
    const inView = SNOWED_IN_BAYS.map((b, i) => ({ ...b, i })).filter((b) => b.x > GROWING_STUFF_SNAP_VIEW.l && b.a < GROWING_STUFF_SNAP_VIEW.r + 150);
    assert.deepEqual(inView.map((b) => b.kind), ['door', 'door', 'window', 'door', 'door']);
    const planks = (i) => all.filter((d) => d.id?.startsWith(`door_plank_${i + 1}_`)).length;
    assert.deepEqual(inView.filter((b) => b.kind === 'door').map((b) => planks(b.i)), [1, 0, 0, 2]);
    // The window is boarded but for a slit: three planks above, one below.
    const win = inView.find((b) => b.kind === 'window');
    const boards = all.filter((d) => d.id?.startsWith(`window_plank_${win.i + 1}_`)).map((d) => d.y).sort((a, b) => a - b);
    assert.equal(boards.length, 4);
    assert.ok(boards[3] - boards[2] > boards[1] - boards[0], 'a slit between the third and fourth planks');
    // Lamps hang at pilasters (bay edges), two of them in the Snap's view.
    const edges = new Set(SNOWED_IN_BAYS.flatMap((b) => [b.a, b.b]));
    for (const x of GROWING_STUFF_LAMPS) assert.ok([...edges].some((e) => Math.abs(e - x) <= 8), `lamp at ${x}`);
    assert.equal(GROWING_STUFF_LAMPS.filter((x) => x > GROWING_STUFF_SNAP_VIEW.l && x < GROWING_STUFF_SNAP_VIEW.r).length, 2);
    assert.equal(count(/^hanging_lightbulb$/), GROWING_STUFF_LAMPS.length);
    // Table and stool between the window and the next door, a vent pipe at the view's left edge.
    const at = (id) => all.find((d) => d.id === id);
    assert.ok(at('stool').x < at('table').x && at('stool').x > win.a && at('table').x < 1151);
    assert.ok(Math.abs(at('vent_pipe_1').x - GROWING_STUFF_SNAP_VIEW.l) < 60);
  });

  it('three raised beds in the Snap (ferns, fenced blue-purple mushrooms, a red cap), mirrored', () => {
    assert.deepEqual(GROWING_STUFF_BEDS.filter((b) => b.x > 0).map((b) => b.kind), ['ferns', 'fenced', 'mushrooms']);
    for (const b of GROWING_STUFF_BEDS) assert.ok(GROWING_STUFF_BEDS.some((m) => m.kind === b.kind && m.x === -b.x), `${b.kind} at ${b.x} mirrored`);
    const beds = front.decos.filter((d) => d.sprite === 'abbasid_planter_box_1x3');
    assert.equal(beds.length, 6);
    const near = (bed, re) => front.decos.filter((d) => re.test(d.sprite) && Math.abs(fx(d) - bed.x) < 200).length;
    for (const bed of GROWING_STUFF_BEDS) {
      if (bed.kind === 'ferns') assert.ok(near(bed, /^(plant_fern_|zutto_plant_)/) >= 6, `ferns at ${bed.x}`);
      if (bed.kind === 'fenced') {
        assert.ok(near(bed, /^purple_mushroom_/) >= 5, `mushrooms at ${bed.x}`);
        assert.equal(near(bed, /^post_wood_1$/), 4, 'a post at each corner');
      }
      if (bed.kind === 'mushrooms') {
        assert.ok(near(bed, /^mushroom_amanita_1$/) >= 1, `red cap at ${bed.x}`);
        assert.ok(near(bed, /^bling_wildmushrooms_2$/) >= 4, `mauve mushrooms at ${bed.x}`);
      }
    }
    // The beds stand in front of the walk line (a front layer), inside the hall.
    for (const d of beds) assert.ok(d.y + gs.bounds.t > GROWING_STUFF_FLOOR_Y && fx(d) - d.w / 2 > gs.bounds.l && fx(d) + d.w / 2 < gs.bounds.r);
  });
});

describe('rebuilt rooms: population and the Seams', () => {
  it('no fallback piggies, vendors or shrines; Ethereal Endeavour keeps its quoins', () => {
    assert.ok(FEATURES.some((f) => f.id === rebuiltRoomsFeature.id), 'registered');
    assert.equal(rebuiltRoomsFeature.ecologyOverride({ tsid: ABBASID_RIVER_TSID }), null);
    for (const room of REBUILT_ROOMS) {
      for (const tsid of [room.tsid, room.sourceTsid]) assert.ok(rebuiltRoomEcology(tsid), tsid);
      const pop = populationForStreet(room.tsid, rebuiltRoomsFeature.ecologyOverride(rooms[room.tsid]));
      assert.deepEqual([pop.piggies, pop.chickens, pop.butterflies, pop.treeClasses.length, pop.rockClasses.length, pop.vendor, pop.shrine], [0, 0, 0, 0, 0, false, false], room.label);
    }
    assert.equal(populationForStreet(ETHEREAL_TSID, rebuiltRoomEcology(ETHEREAL_TSID)).quoins, ETHEREAL_QUOINS);
    assert.equal(populationForStreet(SNOWED_IN_TSID, rebuiltRoomEcology(SNOWED_IN_TSID)).quoins, 0);
    assert.equal(populationForStreet(GROWING_STUFF_TSID, rebuiltRoomEcology(GROWING_STUFF_TSID)).quoins, 0);
    for (const room of REBUILT_ROOMS) assert.equal(isRebuiltRoomTsid(room.tsid) && isRebuiltRoomTsid(room.sourceTsid), true);
    assert.equal(isRebuiltRoomTsid(ABBASID_JAIL_TSID), false);
  });

  it('an arrival counts visit_seam_street only on a Seam Street (Martleby Hare among them)', () => {
    // G461: every entry by street id (quest-offers-feature onStreetEnter), each seam once per run.
    const counted = (tsid) => eventCounters(`street_entered_tsid:${tsid}`).some((c) => c.counter === 'visit_seam_street');
    assert.equal(counted(MARTLEBY_TSID), true);
    assert.equal(counted('GCR1516SFHM122V'), true);
    assert.equal(counted(SNOWED_IN_TSID), false);
    assert.equal(counted(ETHEREAL_TSID), false);
    assert.equal(counted(GROWING_STUFF_TSID), false);
    assert.equal(counted(ROOKTHILLS_TSID), false);
    for (const tsid of SEAM_STREETS) assert.ok(index.streets[tsid], `${tsid} imported`);
  });

  it('player copy has no em-dashes', () => {
    for (const s of Object.values(rooms)) {
      assert.doesNotMatch(s.label, /—/);
      for (const d of s.doors) assert.doesNotMatch(d.connect.label, /—/);
    }
  });
});
