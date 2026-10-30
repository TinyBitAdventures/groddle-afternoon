/**
 * The Ur subway (register row G115): the line table generated from
 * config_prod.js transit_instances.subway_1, the gate's rules and copy
 * (items/subway_gate.js), the ride (locations/inc_transit.js) with its solo
 * timings, the ride badges, the rebuilt stations and train, and the surface
 * entrances (js/subway.js, js/features/subway-feature.js,
 * tools/build-subway.mjs, tools/build-subway-art.py).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=g442-6';
import { readMapLabels, readTransitInstances, GSJS } from '../tools/subway-source.mjs';
import {
  CAR_FLOOR,
  CAR_TSID,
  FARE,
  RIDE_COUNTER,
  STATIONS,
  STATION_FLOOR,
  SUBWAY_ART,
  SUBWAY_BADGES,
  SUBWAY_LINE,
  TEXT,
  announce,
  badgesReached,
  boardingSpot,
  canDisembark,
  carArt,
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
} from '../public/js/subway.js?v=g454-1';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=g473-1';

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
    assert.deepEqual(offer.choices.map((c) => c.label), ['Red Line (50C)', 'Blue Line (50C)', 'No thanks']);
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
      assert.ok(existsSync(join(pub, `assets/badges/${id}.png`)), id);
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

describe('Stations, the train and the surface entrances', () => {
  it('stands the column in front of the avatar: its foot is nearer than the walking line', () => {
    const column = stationArt(STATIONS[0]).find((row) => row.piece === 'column_1');
    const avatarZ = Number(/body\.zIndex = (\d+);/.exec(readFileSync(join(pub, 'game.js'), 'utf8'))?.[1]);
    assert.ok(avatarZ > 0 && column.z > avatarZ, `drawn over the avatar (zIndex ${avatarZ})`);
    assert.ok(column.y > STATION_FLOOR, 'foot below the floor line');
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

  it('art is current (tools/build-subway-art.py --check)', { skip: !existsSync('/opt/homebrew/bin/python3.11') && 'python3.11 missing' }, () => {
    execFileSync('python3.11', ['-I', join(spike, 'tools/build-subway-art.py'), '--check'], { stdio: 'pipe' });
  });
});
