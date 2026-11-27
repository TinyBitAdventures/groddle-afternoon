/**
 * The Ur subway (register row G115): the line table generated from
 * config_prod.js transit_instances.subway_1, the gate's rules and copy
 * (items/subway_gate.js), the ride (locations/inc_transit.js) with its solo
 * timings, the ride badges, the rebuilt stations and train, and the surface
 * entrances (js/subway.js, js/features/subway-feature.js,
 * tools/build-subway.mjs, tools/build-subway-art.py).
 */
import { describe, it } from 'node:test';
import { python311 } from './python311.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=a9a05f9d';
import { readMapLabels, readTransitInstances, GSJS } from '../tools/subway-source.mjs';
import {
  CAR_FLOOR,
  CAR_FLOOR_BAND,
  CAR_FLOOR_RUN,
  CAR_SEAT,
  CAR_VIEW_BELOW,
  CAR_TILE_FLOOR,
  CAR_TILE_SEAT,
  CAR_TILE_TOP,
  CAR_TSID,
  FARE,
  RIDE_COUNTER,
  STATIONS,
  STATION_BOUNDS,
  STATION_FLOOR,
  STATION_SPOTS,
  STATION_BUTTON,
  STATION_X,
  STATION_Y_CAM_OFFSET,
  SUBWAY_ART,
  SUBWAY_ART_BASE,
  SUBWAY_BADGES,
  SUBWAY_LINE,
  TEXT,
  announce,
  badgesReached,
  boardingSpot,
  canDisembark,
  carArt,
  carBenches,
  carFrontDecos,
  carStreet,
  createRide,
  disembarkSpot,
  findStation,
  gateRefusal,
  nextStation,
  papersHint,
  payFare,
  rideTiming,
  signPiece,
  stationArt,
  stationByTsid,
  stationStreet,
  stepRide,
  ticketOffer,
} from '../public/js/subway.js?v=ea6921ff';
import { choiceCardKey, dialogMayTakeFocus, subwayFeature } from '../public/js/features/subway-feature.js?v=624d7621';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const readJson = (p) => JSON.parse(readFileSync(join(pub, p), 'utf8'));
const index = readJson('assets/streets/index.json').streets;
const source = readTransitInstances().subway_1;

describe('Subway line table (config_prod.js transit_instances.subway_1)', () => {
  it('matches the source: fare, lines, template, capacities and timeouts', () => {
    for (const key of ['fare', 'forwards_name', 'backwards_name', 'template_tsid', 'x', 'y', 'min_capacity', 'max_capacity',
      'initial_departure_timeout', 'departure_timeout', 'arrival_timeout', 'map_background_url']) {
      assert.deepEqual(SUBWAY_LINE[key], source[key], key);
    }
    assert.equal(FARE, 50);
    assert.equal(SUBWAY_LINE.forwards_name, 'Red Line');
    assert.equal(SUBWAY_LINE.backwards_name, 'Blue Line');
    assert.equal(SUBWAY_LINE.template_tsid, 'LTJ101M7R9O1HTT');
  });

  it('lists every source station with its own fields, in Red Line order', () => {
    assert.equal(STATIONS.length, Object.keys(source.stations).length);
    assert.equal(STATIONS.length, 12);
    for (const s of STATIONS) {
      const src = source.stations[s.id];
      for (const key of ['name', 'tsid', 'previous_stop', 'next_stop', 'connects_to', 'x', 'y']) assert.equal(s[key], src[key], `${s.id} ${key}`);
      assert.deepEqual([...s.map_pos], src.map_pos);
    }
    for (let i = 0; i < STATIONS.length; i += 1) assert.equal(STATIONS[i].next_stop, STATIONS[(i + 1) % STATIONS.length].id);
    assert.equal(STATIONS[0].name, 'Groddle Forest Junction');
  });

  it('takes names and hubs from inc_data_maps_prod.js', () => {
    const labels = readMapLabels(STATIONS.map((s) => s.tsid));
    for (const s of STATIONS) assert.deepEqual({ label: s.label, hubId: s.hubId }, labels[s.tsid]);
    assert.equal(stationByTsid('LCRC6VC9MAO1Q7F').label, 'GFJ Subway Station');
    assert.equal(SUBWAY_LINE.car.label, 'Subway Train');
  });

  it('runs both ways round the loop: next stops on the Red Line, previous on the Blue', () => {
    assert.equal(nextStation(1, 'forwards').name, 'Tallish Crest');
    assert.equal(nextStation(1, 'backwards').name, 'Somewhat Sump');
    assert.equal(nextStation(2, 'forwards').name, 'Groddle Forest Junction');
    assert.equal(nextStation(5, 'backwards').name, 'Jutuan Central');
    for (const s of STATIONS) {
      assert.equal(nextStation(nextStation(s.id, 'forwards').id, 'backwards').id, s.id);
    }
    let id = 3;
    for (let i = 0; i < 12; i += 1) id = nextStation(id, 'forwards').id;
    assert.equal(id, 3, 'twelve hops come round again');
  });

  it('is generated and current (tools/build-subway.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-subway.mjs'), '--check'], { stdio: 'pipe' });
  });
});

describe('A Red Button (items/subway_gate.js)', () => {
  const gate = readFileSync(join(GSJS, 'items/subway_gate.js'), 'utf8');

  it('refuses without You Have Papers!, then on journeys of dubious purpose', () => {
    assert.deepEqual(gateRefusal({ hasPapers: false, dubious: true }), { code: 'papers', text: TEXT.refusePapers });
    assert.deepEqual(gateRefusal({ hasPapers: true, dubious: true }), { code: 'dubious', text: TEXT.refuseDubious });
    assert.equal(gateRefusal({ hasPapers: true }), null);
    assert.ok(gate.includes(TEXT.refusePapers));
    assert.ok(gate.includes(TEXT.refuseDubious));
    assert.ok(gate.includes(TEXT.cantAfford));
    assert.ok(gate.includes("pc.achievements_has('you_have_papers')"));
    assert.ok(gate.includes("pc.buffs_has('dont_get_caught')"));
  });

  it('points the papers refusal at the Bureaucratic Hall in source words', () => {
    assert.equal(papersHint({ hasCardBadge: true, hasPapersItem: true }), TEXT.papersIncomplete);
    assert.equal(papersHint({ hasCardBadge: true }), TEXT.papersAtHall);
    assert.equal(papersHint({ hasCardItem: true }), TEXT.cardNotActive);
    assert.equal(papersHint({}), null);
    for (const t of [TEXT.papersIncomplete, TEXT.cardNotActive]) {
      const plain = t.replace(/Card-Carrying Qualification|Your Papers|Gregarious Grange/g, '');
      const src = gate.replace(/<a [^>]*>([^<]*)<\/a>/g, '$1').replace(/Card-Carrying Qualification|Your Papers|Gregarious Grange/g, '');
      assert.ok(src.includes(plain), t);
    }
  });

  it('sells tickets on both lines with their next stops', () => {
    const offer = ticketOffer(3);
    assert.equal(offer.title, 'Train tickets 50C.');
    assert.equal(offer.text, 'Which line would you like to ride?');
    assert.deepEqual(offer.lines.map((l) => [l.name, l.next]), [['Red Line', 'Eastern Approach'], ['Blue Line', 'Thiruvan Thrive']]);
    // #387: each button names where its line goes next, the price as before.
    assert.deepEqual(offer.choices.map((c) => c.label), ['Red Line, next stop Eastern Approach (50C)', 'Blue Line, next stop Thiruvan Thrive (50C)', 'No thanks']);
    assert.ok(gate.includes('<b>Train tickets 50C.</b> Which line would you like to ride?'));
  });

  it('takes the 50 currant fare, or nothing when it cannot be afforded', () => {
    const pc = { currants: 120 };
    assert.equal(payFare(pc), true);
    assert.equal(pc.currants, 70);
    assert.equal(payFare(pc), true);
    assert.equal(payFare(pc), false);
    assert.equal(pc.currants, 20);
  });
});

describe('The ride (locations/inc_transit.js)', () => {
  const transit = readFileSync(join(GSJS, 'locations/inc_transit.js'), 'utf8');

  it('announces in source words', () => {
    assert.ok(transit.includes("will depart for <span class=\"nuxp_bold\">'+next_station.name+'</span> in a few seconds."));
    assert.equal(announce.doorsClose('X').text.replace('{name}', 'X'), 'This train will depart for X in a few seconds.');
    assert.ok(transit.includes("' is departing.'"));
    assert.equal(announce.nextStop('X').text.replace('{name}', 'X'), 'The next stop is X, arriving in 10 seconds.');
    assert.ok(transit.includes(", arriving in 10 seconds.'"));
    assert.equal(announce.arrived('X').text.replace('{name}', 'X'), 'The train has arrived at X.');
    assert.equal(announce.getOff('X'), 'This stop is X. Get off train?');
    assert.ok(transit.includes("txt\t\t: 'This stop is '+next_station.name+'. Get off '+cfg.vehicle+'?'"));
    assert.equal(announce.boarding(10), 'This train will be departing in 10 seconds.');
  });

  it('leaves 10 s after boarding (solo), takes 20 s a hop, calls at 10 s out, brakes 3 s out, dwells 10 s', () => {
    const t = rideTiming();
    assert.deepEqual({ ...t }, { board: 10000, doors: 3000, travel: 20000, preArrival: 10000, brakes: 3000, dwell: 10000, prompt: 10000 });
    const ride = createRide({ stop: 2, direction: 'forwards', now: 0, timing: t });
    assert.deepEqual(stepRide(ride, 6999).map((e) => e.type), []);
    assert.deepEqual(stepRide(ride, 7000).map((e) => e.type), ['doors']);
    assert.equal(canDisembark(ride), false);
    assert.deepEqual(stepRide(ride, 10000).map((e) => e.type), ['depart']);
    assert.deepEqual(stepRide(ride, 20000).map((e) => e.type), ['call']);
    assert.deepEqual(stepRide(ride, 27000).map((e) => e.type), ['brakes']);
    const arrive = stepRide(ride, 30000);
    assert.equal(arrive[0].type, 'arrive');
    assert.equal(arrive[0].station.name, 'Groddle Forest Junction');
    assert.equal(canDisembark(ride), true);
    // Staying on: the doors close 7 s after arrival and it runs on to the next stop.
    assert.deepEqual(stepRide(ride, 37000).map((e) => e.type), ['doors']);
    assert.deepEqual(stepRide(ride, 40000).map((e) => e.type), ['depart']);
    const next = stepRide(ride, 60000);
    assert.deepEqual(next.map((e) => e.type), ['call', 'brakes', 'arrive']);
    assert.equal(next[2].station.name, 'Tallish Crest');
    assert.equal(ride.stops, 2);
  });

  it('#387: from every station both lines call at all 12 stops in order, none twice', () => {
    assert.equal(STATIONS.length, 12);
    const timing = rideTiming(0.25);
    const runs = {};
    for (const start of STATIONS) {
      for (const direction of ['forwards', 'backwards']) {
        const ride = createRide({ stop: start.id, direction, now: 0, timing });
        const calls = [];
        for (let t = 0; calls.length < 12 && t < 1e7; t += 250) {
          for (const e of stepRide(ride, t)) if (e.type === 'arrive') calls.push(e.station.id);
        }
        assert.equal(calls.length, 12);
        assert.equal(new Set(calls.slice(0, 11)).size, 11, `${start.name} ${direction}: no repeats before coming round`);
        assert.equal(calls[11], start.id, 'the twelfth stop is home again');
        let id = start.id;
        calls.forEach((c) => {
          id = nextStation(id, direction).id;
          assert.equal(c, id, 'each call is the line\'s next stop');
        });
        runs[`${start.id}:${direction}`] = calls;
      }
    }
    // The Blue Line is the Red Line run backwards.
    for (const start of STATIONS) {
      const red = [start.id, ...runs[`${start.id}:forwards`].slice(0, 11)];
      const blue = [start.id, ...runs[`${start.id}:backwards`].slice(0, 11)];
      assert.deepEqual(blue.slice(1), red.slice(1).reverse());
    }
  });

  it('runs the Blue Line backwards', () => {
    const ride = createRide({ stop: 2, direction: 'backwards', now: 0, timing: rideTiming(0.25) });
    const events = stepRide(ride, 100000);
    assert.equal(events.find((e) => e.type === 'arrive').station.name, 'Onto Parada');
  });

  it('boards where the source does and steps off at the station x 0, y -136', () => {
    const spot = boardingSpot(() => 0);
    assert.equal(spot.y, CAR_FLOOR - carStreet().bounds.t);
    assert.equal(boardingSpot(() => 0.9999).x - boardingSpot(() => 0).x, 700);
    const off = disembarkSpot(stationByTsid('LCR177QO65T1EON'));
    const street = stationStreet(stationByTsid('LCR177QO65T1EON'));
    assert.equal(off.x, 0 - street.bounds.l);
    assert.equal(off.y, -136 - street.bounds.t);
    assert.equal(STATION_FLOOR, -136);
  });
});

describe('Ride badges (achievements subwayfarer, ground_hogger, commuter_mug, chute_jockey)', () => {
  const catalog = readJson('assets/content/achievements.json');

  it('count transit subways_entered at the source thresholds, with art', () => {
    assert.equal(RIDE_COUNTER, 'transit:subways_entered');
    for (const { id, rides } of SUBWAY_BADGES) {
      const cond = catalog[id].conditions[0];
      assert.equal(`${cond.group}:${cond.name}`, RIDE_COUNTER, id);
      assert.equal(cond.num, rides, id);
      const src = readFileSync(join(GSJS, `achievements/${id}.js`), 'utf8');
      assert.ok(src.includes(`value\t: "${rides}"`), id);
      assert.ok(existsSync(join(pub, `assets/badges/${id}.webp`)), id);
    }
    assert.deepEqual(badgesReached(22), []);
    assert.deepEqual(badgesReached(23), ['subwayfarer']);
    assert.deepEqual(badgesReached(103), ['subwayfarer', 'ground_hogger']);
    assert.deepEqual(badgesReached(251), ['subwayfarer', 'ground_hogger', 'commuter_mug']);
    assert.deepEqual(badgesReached(503), ['subwayfarer', 'ground_hogger', 'commuter_mug', 'chute_jockey']);
  });

  it('counts once per boarding in the source', () => {
    const transit = readFileSync(join(GSJS, 'locations/inc_transit.js'), 'utf8');
    assert.ok(transit.includes("pc.achievements_increment('transit', cfg.type+'s_entered');"));
  });
});

describe('G838 (#385): the station as the 2012 snaps show it', () => {
  const feature = readFileSync(join(pub, 'js/features/subway-feature.js'), 'utf8');
  it('is a 1500 px street centred on x 0, the stairs flush left, the map post at the step-off spot', () => {
    assert.deepEqual([STATION_BOUNDS.l, STATION_BOUNDS.r], [-750, 750]);
    assert.equal(STATION_X.stairs - 132 / 2, STATION_BOUNDS.l);
    assert.equal(STATION_SPOTS['Groddle Forest Junction'].map[0], SUBWAY_LINE.stations[0].x);
  });
  it('hangs each station\'s sign over the crack\'s right end, high on the wall', () => {
    assert.equal(Object.keys(STATION_SPOTS).length, STATIONS.length);
    for (const station of STATIONS) {
      assert.ok(STATION_SPOTS[station.name], station.name);
      const sign = stationArt(station).find((row) => row.piece.startsWith('sub_sign_'));
      // GFJ snap: board 216-389 x 190-251 px, so world x -534 to -361, about 330 px over the floor.
      assert.equal(sign.w, 174, station.name);
      assert.ok(sign.x > STATION_X.crack && sign.x < STATION_X.column, station.name);
      assert.ok(STATION_FLOOR - sign.y > 290, `${station.name}: ${STATION_FLOOR - sign.y} px over the floor`);
    }
    const gfj = stationArt(STATIONS[0]).find((row) => row.piece === 'sub_sign_groddle_forest_junction');
    assert.deepEqual([gfj.x, gfj.y - gfj.h / 2], [-447, -498]);
    assert.ok(!stationArt(STATIONS[0]).some((row) => row.piece === 'wallpipe_1'), 'no dripping pipe in any snap');
  });
  it('puts A Red Button on the green gate box under its grille, not on the stone block', () => {
    // #509: 27 x 47 at x 433, as the 2012 snaps show it in all 12 stations (it was 26 x 45 at 437).
    assert.match(feature, /addSprite\(engine, STATION_BUTTON, b\)/);
    assert.deepEqual([STATION_BUTTON.piece, STATION_BUTTON.x, STATION_BUTTON.y, STATION_BUTTON.w, STATION_BUTTON.h], ['subway_gate', STATION_X.button, STATION_FLOOR - 37, 27, 47]);
    assert.equal(STATION_X.button, 433);
    const gate = stationArt(STATIONS[0]).find((row) => row.piece === 'subway_gate_static');
    // The box is the left 55% of subway_gate_static; the stone block the right.
    assert.ok(STATION_X.button < gate.x - gate.w * 0.1 && STATION_X.button > gate.x - gate.w / 2);
    // #509: no route halo round a button mounted at the box's edge; the GPS still walks to it.
    assert.match(feature, /subway: 'gate',\s*\/\/ #509[^\n]*\n\s*glowNone: true,/);
    const routes = readFileSync(new URL('../public/js/features/map-routes-feature.js', import.meta.url), 'utf8');
    assert.match(routes, /if \(target\.glowNone\) \{\s*highlight = \{ kind, view: sprite, glow: null,/);
  });
  it('frames the platform as the client did, the feet low in the view', () => {
    assert.equal(STATION_Y_CAM_OFFSET, 216);
    assert.equal(stationStreet(STATIONS[0]).physics.setting.y_cam_offset, 216);
  });
});

describe('Stations, the train and the surface entrances', () => {
  it('stands the column in front of the avatar: its foot is nearer than the walking line', () => {
    const column = stationArt(STATIONS[0]).find((row) => row.piece === 'column_1');
    const avatarZ = Number(/body\.zIndex = (\d+);/.exec(readFileSync(join(pub, 'game.js'), 'utf8'))?.[1]);
    assert.ok(avatarZ > 0 && column.z > avatarZ, `drawn over the avatar (zIndex ${avatarZ})`);
    assert.ok(column.y > STATION_FLOOR, 'foot below the floor line');
  });
  it('stands riders on the car floor, not at seat height (VVyjuuRxDUw t018, t030)', () => {
    // subway_interior_1 rows, world px below its top: seat front edge ~548, yellow
    // line ~604-608, dark floor strip ~612-672, then the bottom stripe and black.
    assert.equal(CAR_TILE_TOP, CAR_FLOOR - CAR_TILE_FLOOR);
    assert.ok(CAR_TILE_FLOOR > 612 && CAR_TILE_FLOOR < 672, 'the floor line sits in the dark floor strip, below the yellow line');
    const wall = carArt().filter((row) => row.piece === 'subway_interior_1' && !row.frame);
    assert.equal(wall.length, 3);
    for (const row of wall) assert.equal(row.y - row.h, CAR_TILE_TOP, 'the wall tile hangs from CAR_TILE_TOP');
    // The seats are a ledge well above the floor (in the footage riders stand on the floor in
    // front of the benches, or hop up onto a seat).
    assert.equal(CAR_SEAT, CAR_TILE_TOP + CAR_TILE_SEAT);
    assert.ok(CAR_FLOOR - CAR_SEAT >= 80, `seats ${CAR_FLOOR - CAR_SEAT} px above the floor`);
    const street = carStreet();
    const floor = street.platforms.find((p) => p.id === 'plat_subway_car');
    assert.equal(floor.y1, CAR_FLOOR);
    for (const bench of carBenches()) {
      assert.equal(bench.y1, CAR_SEAT, bench.id);
      assert.equal(bench.pc_perm, -1, `${bench.id} is one-way`);
    }
    // Boarding lands on the floor line itself.
    for (const r of [0, 0.3, 0.6, 0.9999]) assert.equal(boardingSpot(() => r).y, CAR_FLOOR - street.bounds.t);
    // Poles reach just below the riders' feet, in a front layer with no size of its own, so
    // it moves with the street (a parallax layer is pinned to the bottom of a view taller
    // than the car, street-render.js parallaxLayerOffset).
    for (const pole of carFrontDecos()) {
      const foot = pole.y + street.bounds.t;
      assert.ok(foot > CAR_FLOOR && foot - CAR_FLOOR <= 20, `${pole.id} foot ${foot - CAR_FLOOR} px below the floor`);
    }
    const front = street.layers.find((l) => l.id === 'T_subway_car_front');
    assert.ok(front.z > 0 && front.w === 0 && front.h === 0, 'in front, not a parallax canvas');
  });

  it('frames the car as the footage does: a thin strip of floor under the feet, no gap below', async () => {
    const { cameraTargetY, cameraWorldHeightForGround, cameraBottomSlack } = await import('../public/js/movement.js?v=f4be1a05');
    const street = carStreet();
    const feet = CAR_FLOOR - street.bounds.t;
    // street-render.js worldH: the street's height plus the camera's ground clearance.
    const worldH = street.bounds.b - street.bounds.t + cameraBottomSlack(600);
    for (const view of [408, 430, 493, 548, 588, 600]) {
      const h = cameraWorldHeightForGround(worldH, feet, view);
      const camY = cameraTargetY(feet, h, view);
      assert.equal(camY + view - feet, CAR_VIEW_BELOW, `view ${view}: the view ends ${CAR_VIEW_BELOW} px under the feet`);
      assert.ok(camY >= 0 && camY <= CAR_TILE_TOP + 300 - street.bounds.t, `view ${view}: the ads stay in view`);
    }
    // Under that edge the tile's floor strip carries on (behind the pack, and a view taller
    // than the car), then its bottom edge rows: no empty band under the carriage.
    const [b0, b1] = CAR_FLOOR_BAND;
    const run = carArt().filter((row) => row.frame && row.frame[1] === b0);
    const edge = carArt().filter((row) => row.frame && row.frame[1] === b1);
    assert.equal(run.length, 3);
    assert.equal(edge.length, 3);
    for (const row of run) {
      assert.equal(row.y - row.h, CAR_TILE_TOP + b1, 'starts where the tile\'s floor strip ends');
      assert.equal(row.h, CAR_FLOOR_RUN);
      assert.deepEqual(row.frame, [0, b0, 1200, b1 - b0]);
    }
    assert.ok(CAR_TILE_TOP + b1 + CAR_FLOOR_RUN - CAR_FLOOR >= CAR_VIEW_BELOW + 132 + 200, 'floor under the pack and a tall view');
    assert.ok(b0 > CAR_TILE_FLOOR - 40 && b1 > CAR_TILE_FLOOR, 'the strip the riders stand on');
  });
  it('writes every station and the train as an indexed street with art that exists', () => {
    for (const s of STATIONS) {
      const street = readJson(`assets/streets/${s.streetTsid}.json`);
      assertStreetGeometry(street);
      assert.equal(street.label, s.label);
      assert.equal(index[s.streetTsid].file, `assets/streets/${s.streetTsid}.json`);
      assert.ok(SUBWAY_ART[signPiece(s)], `${s.name} has its own sign`);
      for (const row of stationArt(s)) assert.ok(SUBWAY_ART[row.piece], row.piece);
    }
    const car = readJson(`assets/streets/${CAR_TSID}.json`);
    assertStreetGeometry(car);
    assert.equal(car.label, 'Subway Train');
    assert.ok(index[CAR_TSID]);
    for (const row of carArt()) assert.ok(SUBWAY_ART[row.piece], row.piece);
    for (const [name, [file]] of Object.entries(SUBWAY_ART)) assert.ok(existsSync(join(pub, 'assets/sprites/subway', file)), name);
  });

  it('connects every station to its surface street, both ways', () => {
    const missing = [];
    for (const s of STATIONS) {
      const surfaceTsid = `G${s.connects_to.slice(1)}`;
      if (!index[surfaceTsid]) {
        missing.push(s.name);
        continue;
      }
      assert.equal(s.surfaceStreetTsid, surfaceTsid);
      const surface = readJson(`assets/streets/${surfaceTsid}.json`);
      const door = surface.doors.find((d) => d.connect?.tsid === s.tsid);
      assert.ok(door, `${surface.label} has a door to ${s.label}`);
      // The feature links it when the street loads.
      const copy = structuredClone(surface);
      subwayFeature.prepareStreet(copy);
      const linked = copy.doors.find((d) => d.connect?.tsid === s.tsid);
      assert.equal(linked.connect.street, s.streetTsid);
      assert.ok(linked.connect.arrive.x > 0 && linked.connect.arrive.y > 0);
      // The station's stairs come back up in front of that door.
      const station = readJson(`assets/streets/${s.streetTsid}.json`);
      const stairs = station.doors.find((d) => d.id === 'door_subway_stairs');
      assert.equal(stairs.connect.street, surfaceTsid);
      assert.deepEqual(stairs.connect.arrive, { x: door.x, y: door.y });
    }
    assert.deepEqual(missing, [], 'every connects_to street is imported');
  });

  it('keeps animals and trees out, and a reload in the train resumes on a platform', () => {
    const station = STATIONS[0];
    assert.equal(subwayFeature.ecologyOverride({ tsid: station.streetTsid }).empty, true);
    assert.equal(subwayFeature.ecologyOverride({ tsid: CAR_TSID }).empty, true);
    assert.equal(subwayFeature.ecologyOverride({ tsid: 'GLI32G3NUTD100I' }), null);
    subwayFeature.restore({ rides: 4, stop: 8, direction: 'backwards', inCar: true });
    const back = subwayFeature.reloadLocation({ tsid: CAR_TSID, x: 1, y: 1 });
    assert.equal(back.tsid, stationByTsid('LHV1U3M48M22D54').streetTsid);
    assert.equal(subwayFeature.reloadLocation({ tsid: 'GLI32G3NUTD100I' }), null);
    assert.equal(subwayFeature.save().rides, 4);
  });

  it('finds stations for QA routes by id, name, slug or tsid', () => {
    assert.equal(findStation('somewhat_sump').id, 2);
    assert.equal(findStation('Gregarious Grange').id, 3);
    assert.equal(findStation('LTJ102S2J102N7O').name, 'Jutuan Central');
    assert.equal(findStation('GCRC6VC9MAO1Q7F').id, 1);
    assert.equal(findStation('7').name, 'Torpan Cleft');
    assert.equal(findStation('nowhere'), null);
  });

  it('art is current (tools/build-subway-art.py --check)', { skip: !existsSync(python311) && 'python3.11 missing' }, () => {
    execFileSync('python3.11', ['-I', join(spike, 'tools/build-subway-art.py'), '--check'], { stdio: 'pipe' });
  });
});

describe('#387: subway cards and the keyboard', () => {
  // A small stand-in for the page: elements with matches/closest/contains and visibility.
  const fakeEl = ({ tag = 'div', id = '', cls = '', hidden = false, shown = true, parent = null, editable = false } = {}) => {
    const el = { tag, id, cls, hidden, shown, parent, editable };
    el.matches = (sel) => sel.split(',').map((x) => x.trim()).some((x) => (id && x === `#${id}`)
      || (cls && x === `.${cls}`) || x === tag || (editable && x === '[contenteditable="true"]'));
    el.closest = (sel) => { for (let n = el; n; n = n.parent) if (n.matches(sel)) return n; return null; };
    el.contains = (o) => { for (let n = o; n; n = n.parent) if (n === el) return true; return false; };
    el.getClientRects = () => (el.shown ? [{}] : []);
    return el;
  };
  // querySelectorAll: the elements that match the selector, as the page would.
  const fakeDoc = (els, active) => ({ activeElement: active, querySelectorAll: (sel) => els.filter((e) => e.matches(sel)) });
  const card = () => fakeEl({ cls: 'glitch-modal' });
  const body = () => fakeEl({ tag: 'body' });

  it('never takes the keyboard from a focused text field', () => {
    const c = card();
    assert.equal(dialogMayTakeFocus(fakeDoc([c], fakeEl({ tag: 'textarea' })), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([c], fakeEl({ tag: 'input' })), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([c], fakeEl({ editable: true })), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([c], body()), c), true);
  });

  it('never takes it while the report window, the start card or a screen is up', () => {
    const c = card();
    const report = fakeEl({ id: 'bug-report-panel' });
    assert.equal(dialogMayTakeFocus(fakeDoc([report, c], body()), c), false);
    report.hidden = true;
    assert.equal(dialogMayTakeFocus(fakeDoc([report, c], body()), c), true, 'a hidden report window does not count');
    assert.equal(dialogMayTakeFocus(fakeDoc([fakeEl({ id: 'overlay' }), c], body()), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([fakeEl({ cls: 'new-day-screen' }), c], body()), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([fakeEl({ cls: 'award-screen', shown: false }), c], body()), c), true);
    // An older window goes under the new card (js/window-stack.js), but focus inside it stays there.
    const older = fakeEl({ cls: 'side-panel' });
    assert.equal(dialogMayTakeFocus(fakeDoc([older, c], body()), c), true);
    assert.equal(dialogMayTakeFocus(fakeDoc([older, c], fakeEl({ tag: 'button', parent: older })), c), false);
    assert.equal(dialogMayTakeFocus(fakeDoc([c], fakeEl({ tag: 'button', parent: c })), c), true);
  });

  it('the stop prompt never focuses yes; no answer keeps you riding', () => {
    const src = readFileSync(join(pub, 'js/features/subway-feature.js'), 'utf8');
    const prompt = src.slice(src.indexOf('function getOffPrompt'), src.indexOf('const CAR_LABEL_KICKER'));
    assert.match(prompt, /focus: false/);
    assert.doesNotMatch(prompt, /onTimeout/);
    assert.match(src, /if \(opts\.focus !== false && dialogMayTakeFocus\(document, el\)\) actions\.querySelector\('button'\)\?\.focus/);
  });
});

describe('#518 (R8): the gate\'s cards keep the keys, as the client\'s ChoicesDialog did', () => {
  const key = (k, mods = {}) => ({ key: k, ...mods });
  it('the arrows move round the choices, both ways, round the ends (_focusNextChoice, _focusPrevChoice)', () => {
    assert.deepEqual(choiceCardKey(key('ArrowRight'), { count: 3, at: 0 }), { move: 1 });
    assert.deepEqual(choiceCardKey(key('ArrowDown'), { count: 3, at: 2 }), { move: 0 });
    assert.deepEqual(choiceCardKey(key('ArrowLeft'), { count: 3, at: 0 }), { move: 2 });
    assert.deepEqual(choiceCardKey(key('ArrowUp'), { count: 3, at: 1 }), { move: 0 });
    assert.deepEqual(choiceCardKey(key('ArrowRight'), { count: 3, at: -1 }), { move: 0 }, 'focus off the card: back to the first');
    assert.deepEqual(choiceCardKey(key('ArrowLeft'), { count: 3, at: -1 }), { move: 2 });
    assert.deepEqual(choiceCardKey(key('ArrowRight'), { count: 1, at: 0 }), { move: 0 }, 'one OK: stays on it, the avatar still does not walk');
  });
  it('Enter and Space press the focused choice; with focus elsewhere Enter only comes back to the card', () => {
    assert.deepEqual(choiceCardKey(key('Enter'), { count: 3, at: 1 }), { native: true });
    assert.deepEqual(choiceCardKey(key(' '), { count: 3, at: 1 }), { native: true });
    assert.deepEqual(choiceCardKey(key('Enter'), { count: 3, at: -1 }), { move: 0 }, 'never buys a ticket unseen');
    assert.deepEqual(choiceCardKey(key(' '), { count: 3, at: -1 }), { hold: true }, 'no jump under the card');
  });
  it('Escape closes it with no choice (_escKeyHandler: no cancel_value); W A S D do not walk under it', () => {
    assert.deepEqual(choiceCardKey(key('Escape'), { count: 3, at: 0 }), { close: true });
    for (const k of ['w', 'a', 's', 'D']) assert.deepEqual(choiceCardKey(key(k), { count: 3, at: 0 }), { hold: true }, k);
  });
  it('other keys and chords go on as usual (R for a report, Ctrl+R, the zoom keys)', () => {
    for (const k of ['r', 'm', '1', 'Tab', '+']) assert.equal(choiceCardKey(key(k), { count: 3, at: 0 }), null, k);
    assert.equal(choiceCardKey(key('ArrowLeft', { altKey: true }), { count: 3, at: 0 }), null);
    assert.equal(choiceCardKey(key('r', { ctrlKey: true }), { count: 3, at: 0 }), null);
  });
  it('a gate card is modal and holds the keys while open; the get-off prompt mid-ride is not (#387)', () => {
    const src = readFileSync(join(pub, 'js/features/subway-feature.js'), 'utf8');
    const open = src.slice(src.indexOf('function openDialog('), src.indexOf('/** inc_transit.js transit_make_announcement'));
    assert.match(open, /const modal = opts\.focus !== false;/);
    assert.match(open, /el\.setAttribute\('aria-modal', modal \? 'true' : 'false'\);/);
    assert.match(open, /if \(modal\) dialog\.release = holdKeys\(engine, el, /);
    assert.match(src.slice(src.indexOf('function closeDialog('), src.indexOf('function closeDialog(') + 200), /dialog\.release\?\.\(\);/, 'closing lets the keys go');
    const hold = src.slice(src.indexOf('function holdKeys('), src.indexOf('function openDialog('));
    assert.match(hold, /window\.addEventListener\('keydown', onKey, true\)/, 'ahead of the game\'s keys');
    assert.match(hold, /dialogMayTakeFocus\(document, el\)/, 'not over a text field or another window');
    assert.match(hold, /e\.stopImmediatePropagation\(\)/);
  });
});

describe('#482: the station and the car are their streets\' own art', () => {
  it('a station\'s street (what its street map snapshots) holds the station, not only its floor', () => {
    for (const station of STATIONS) {
      const street = readJson(`assets/streets/${station.streetTsid}.json`);
      const decos = street.layers.flatMap((layer) => layer.decos.map((d) => ({ ...d, layer: layer.id })));
      const pieces = new Set(decos.map((d) => d.sprite));
      for (const piece of ['subway_platform_1', 'wall_1', 'train_1', 'subway_gate_static', 'ticket_post_back', 'column_1', signPiece(station)]) {
        assert.ok(pieces.has(piece), `${station.name}: ${piece}`);
      }
      assert.ok(decos.length > 4, `${station.name}: more than its floor`);
      // The column's foot stands in front of the avatar: a front (T_) layer, in screen space.
      const column = decos.find((d) => d.sprite === 'column_1');
      assert.match(column.layer, /^T_/);
      // Every art row is a deco naming its subway1.swf file outright.
      for (const d of decos.filter((x) => x.sprite !== 'subway_platform_1')) assert.equal(d.src, `${SUBWAY_ART_BASE}${SUBWAY_ART[d.sprite][0]}`, d.id);
      // The floor draws under the art.
      const floorZ = Math.max(...decos.filter((d) => d.sprite === 'subway_platform_1').map((d) => d.z));
      assert.ok(decos.filter((d) => d.layer === 'middleground' && d.src).every((d) => d.z > floorZ));
    }
  });

  it('the car\'s wall, ads and panes are its street\'s too', () => {
    const car = readJson(`assets/streets/${CAR_TSID}.json`);
    const pieces = car.layers.find((l) => l.id === 'middleground').decos.map((d) => d.sprite);
    assert.ok(pieces.includes('subway_interior_1') && pieces.includes('subway_window_static') && pieces.some((p) => p.startsWith('subway_ad_')));
  });

  it('the feature draws only what takes a click, and the renderer draws a deco by its own file', () => {
    const feature = readFileSync(join(pub, 'js/features/subway-feature.js'), 'utf8');
    assert.doesNotMatch(feature, /stationArt\(|carArt\(/);
    const render = readFileSync(join(pub, 'js/street-render.js'), 'utf8');
    assert.match(render, /const url = own \? deco\.src :/);
    assert.match(render, /if \(own && deco\.frame\) tex = frameTexture/);
  });
});
