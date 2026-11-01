/**
 * G115 online: shared subway trains between real players. The pure client side
 * (js/subway-mp.js), the server's line and timings (tools/build-realtime-subway.mjs,
 * data/subway.json in the server repo), the server's source rules (subway.go;
 * skipped without the server repo), the multiplayer branch of subway-feature,
 * and that solo never touches any of it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { BOARD_ANSWER_MS, SUBWAY_MP_TEXT, applyTrain, riderChanges, trainOf } from '../public/js/subway-mp.js?v=ffd57d82';
import { SUBWAY_LINE, STATIONS, createRide, rideTiming, stepRide } from '../public/js/subway.js?v=646ae6af';
import { subwayData } from '../tools/build-realtime-subway.mjs';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const gsjs = join(root, '..', 'glitch-GameServerJS');

const msg = (over = {}) => ({ t: 'subway_train', train: '00000000000000A1', street: 'TRAIN_00000000000000A1', line: 'forwards', stop: 3, phase: 'boarding', initial: true, need: 2, depart_in: 9000, arrive_in: 0, riders: [{ id: 7, name: 'Ada' }], ...over });

describe('the shared train on the client', () => {
  it('reads the server\'s train and refuses anything else', () => {
    const t = trainOf(msg());
    assert.equal(t.street, 'TRAIN_00000000000000A1');
    assert.equal(t.need, 2);
    assert.equal(t.departIn, 9000);
    assert.deepEqual(t.riders, [{ id: 7, name: 'Ada' }]);
    assert.equal(trainOf({ ...msg(), street: 'GA5I10NJDL52TKD' }), null, 'a train is on its own TRAIN_ street');
    assert.equal(trainOf(null), null);
  });

  it('runs the ride on the server\'s clock: the departure while standing, the arrival while moving', () => {
    const timing = rideTiming(1);
    const ride = createRide({ stop: 3, direction: 'forwards', now: 0, timing });
    applyTrain(ride, trainOf(msg({ depart_in: 40000 })), 1000);
    assert.equal(ride.departAt, 41000);
    assert.equal(ride.doorsAt, 38000);
    assert.equal(ride.street, 'TRAIN_00000000000000A1');
    // Three riders: the doors close and it goes in 3 s.
    applyTrain(ride, trainOf(msg({ need: 0, depart_in: 3000 })), 5000);
    assert.equal(ride.departAt, 8000);
    const evs = stepRide(ride, 8000).map((e) => e.type);
    assert.deepEqual(evs, ['doors', 'depart']);
    assert.equal(ride.arriveAt, 8000 + timing.travel);
    applyTrain(ride, trainOf(msg({ phase: 'moving', initial: false, need: 0, arrive_in: 15000 })), 10000);
    assert.equal(ride.arriveAt, 25000, 'the arrival follows the server');
    const arrive = stepRide(ride, 25000).map((e) => e.type);
    assert.deepEqual(arrive, ['call', 'brakes', 'arrive']);
    assert.equal(ride.stop, STATIONS.find((s) => s.id === 3).next_stop);
  });

  it('a ride still standing when the server says it left departs at once', () => {
    const ride = createRide({ stop: 3, now: 0, timing: rideTiming(1) });
    applyTrain(ride, trainOf(msg({ phase: 'moving', arrive_in: 18000 })), 2000);
    const evs = stepRide(ride, 2000).map((e) => e.type);
    assert.deepEqual(evs, ['doors', 'depart']);
    assert.equal(ride.arriveAt, 20000);
  });

  it('says who got on and off, and the source\'s waiting line', () => {
    assert.deepEqual(riderChanges([{ id: 7, name: 'Ada' }], [{ id: 7, name: 'Ada' }, { id: 8, name: 'Bo' }], 7), { on: ['Bo'], off: [] });
    assert.deepEqual(riderChanges([{ id: 7, name: 'Ada' }, { id: 8, name: 'Bo' }], [{ id: 7, name: 'Ada' }], 7), { on: [], off: ['Bo'] });
    assert.equal(SUBWAY_MP_TEXT.waiting(2, 58), 'This train will be departing when 2 more players board, or in 58 seconds.');
    assert.equal(SUBWAY_MP_TEXT.waiting(1, 1), 'This train will be departing when 1 more player boards, or in 1 second.');
    assert.ok(BOARD_ANSWER_MS > 0 && BOARD_ANSWER_MS <= 5000);
    for (const t of Object.values(SUBWAY_MP_TEXT)) assert.doesNotMatch(typeof t === 'function' ? t('X', 2) : t, /—|Glitch/);
  });
});

describe('the source', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
  const transit = existsSync(gsjs) ? readFileSync(join(gsjs, 'locations/inc_transit.js'), 'utf8') : '';
  it('shared trains: one instance per line and station with room, waiting for 3 riders or 60 s', () => {
    assert.match(transit, /player_count > 0 && player_count < config\.transit_instances\[instance_id\]\.max_capacity/);
    assert.match(transit, /this\.instance\.count_members\(\) >= cfg\.min_capacity/);
    assert.match(transit, /'more player boards', 'more players board'/);
    assert.match(transit, /Trains with no players go out of service/);
    assert.equal(SUBWAY_LINE.min_capacity, 3);
    assert.equal(SUBWAY_LINE.max_capacity, 10);
    assert.equal(SUBWAY_LINE.initial_departure_timeout, 60);
  });
});

describe('the server\'s line', () => {
  it('is current (node tools/build-realtime-subway.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-subway.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current/);
  });

  it('carries every station, its platform street and both neighbours, and the timings', () => {
    const d = subwayData();
    assert.equal(d.stations.length, 12);
    for (const s of d.stations) {
      const src = STATIONS.find((x) => x.id === s.id);
      assert.equal(s.street, src.streetTsid);
      assert.equal(s.next, src.next_stop);
      assert.equal(s.prev, src.previous_stop);
    }
    assert.deepEqual([d.min_capacity, d.max_capacity, d.initial_departure_timeout, d.departure_timeout, d.lonely, d.doors, d.travel], [3, 10, 60, 10, 10, 3, 20]);
  });

  it('subway.go keeps the source rules and the remake\'s departures', { skip: !HAS_SERVER && 'no server checkout' }, () => {
    const go = readFileSync(serverPath('subway.go'), 'utf8');
    for (const cite of ['transit_enter_instance 147-177', 'transit_schedule_departure 214-259', 'transit_depart 266-312', 'transit_arrive 345-400']) assert.ok(go.includes(cite), cite);
    assert.match(go, /"TRAIN_" \+ id/);
    assert.match(go, /r\.GateJoin\(m\.gate\)/);
  });
});

describe('the multiplayer branch of subway-feature', () => {
  const src = read('public/js/features/subway-feature.js');
  it('asks the server for a seat and shares the train\'s street', () => {
    assert.match(src, /client\.send\('subway_board', \{ station: station\.id, line: direction \}\)/);
    assert.match(src, /realtimeStreet\(engine\) \{\n\s*return ride\?\.street && inCar\(engine\) \? ride\.street : null;/);
    assert.match(src, /engine\?\.mode === 'multiplayer' && Boolean\(engine\.query\?\.\('realtimeClient'\)\)/);
  });
  it('solo never asks: with no realtime client the ticket enters the car at once', () => {
    const buy = src.slice(src.indexOf('function buyTicket('), src.indexOf('function enterCar('));
    assert.match(buy, /const client = mpClient\(engine\);\n\s*if \(client && client\.state === 'online'/);
    assert.match(buy, /enterCar\(engine\);\n\s*return true;\n\}/);
  });
});
