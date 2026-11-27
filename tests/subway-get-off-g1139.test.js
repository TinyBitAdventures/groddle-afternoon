/**
 * G1139 (#614): stuck in a still Subway car. Get off cleared the ride before the station loaded
 * (subway-feature.js disembark: ride = null, then await engine.enter); the fetch failed ("Failed to
 * fetch") and she stood in the car with no ride: nothing ran the train, no stop asked again, the
 * dead-end EXIT stayed hidden (deadEndRun answered 'subway' with no ride) and /stuck put her back
 * in the car. Glitch's server kept the ride and moved you itself (players/player.js
 * transit_disembark_callback 2707, teleportToLocationDelayed). Now the ride stays until the
 * station is up, a failed trip (R46: engine.enter false) leaves you riding with the stop asking
 * again, and a car with no ride has the EXIT and /stuck to the last stop's platform.
 * Run: node --test tests/subway-get-off-g1139.test.js
 */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterResult, tripWithRetry } from '../public/js/street-trip.js?v=04c3258c';
import { CAR_TSID, FARE, STATIONS, createRide, disembarkSpot, nextStation, rideTiming, stationById } from '../public/js/subway.js?v=ea6921ff';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=850b6c70';
import { FakeEl, page } from './social-fake-dom.js';

// The subway's cards build with appendChild (social-fake-dom has append).
FakeEl.prototype.appendChild ||= function appendChild(k) {
  this.append(k);
  return k;
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let doc = null;
let savedDocument;
let savedWindow;

/** A fake engine whose enter is the real contract over a street load that fails or works. */
function subwayEngine({ fail = () => true } = {}) {
  const data = {};
  const said = [];
  const entered = [];
  const engine = {
    started: true,
    mode: 'solo',
    streetTsid: CAR_TSID,
    pc: { currants: 100 },
    inv: [],
    data,
    said,
    entered,
    errors: [],
    setData: (k, v) => { data[k] = v; },
    save() {},
    updateHud() {},
    playSound() {},
    playSoundLoop: () => ({ stop() {} }),
    pushActivity: (l) => said.push(l),
    toast: (l) => said.push(l),
    param: () => null,
    query: () => null,
    async enter(tsid, opts = {}) {
      const label = stationByStreet(tsid)?.name || tsid;
      return enterResult(
        () => tripWithRetry({
          label,
          load: async () => {
            entered.push(tsid);
            if (fail(tsid)) throw new TypeError('Failed to fetch');
            // Arrived (the station's own onStreetEnter, which ends the ride, draws with Pixi: not run here).
            engine.streetTsid = tsid;
            return { tsid };
          },
          say: (l) => said.push(l),
          warn: (err) => engine.errors.push(err),
        }),
        { say: (l) => said.push(l), warn: (err) => engine.errors.push(err), label },
      );
    },
  };
  return engine;
}

const stationByStreet = (tsid) => STATIONS.find((s) => s.streetTsid === tsid) || null;

/** A ride standing at the stop after `from`, its doors open (the "Get off train?" moment). */
function standingRide(from = STATIONS[0].id) {
  const ride = createRide({ stop: from, direction: 'forwards', now: Date.now() - 60000, timing: rideTiming() });
  const here = nextStation(from, 'forwards');
  Object.assign(ride, { stop: here.id, phase: 'stopped', stops: 1, doorsClosed: false, departAt: Date.now() + 20000, doorsAt: Date.now() + 17000 });
  return { ride, here };
}

describe('G1139: Get off when the station fails to load', () => {
  beforeEach(() => {
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    doc = page().doc;
    globalThis.document = doc;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
  });
  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
    subwayFeature._test.setRide(null, { pendingBoard: null });
  });

  it('a failed fetch keeps the ride, asks again and never strands you', async () => {
    const engine = subwayEngine();
    const { ride, here } = standingRide();
    subwayFeature._test.setRide(ride, { state: { stop: here.id, inCar: true } });
    assert.equal(subwayFeature.deadEndRun(engine), 'subway', 'riding: the ride owns the way off');
    const ok = await subwayFeature._test.disembark(engine);
    assert.equal(ok, false);
    assert.deepEqual(engine.entered, [here.streetTsid, here.streetTsid], 'tried twice');
    assert.equal(engine.streetTsid, CAR_TSID, 'still in the car');
    const s = subwayFeature._state();
    assert.ok(s.ride, 'the ride is still there');
    assert.equal(s.ride.stop, here.id);
    assert.equal(s.state.inCar, true);
    assert.equal(s.gettingOff, null);
    assert.equal(s.dialog, 'get-off', 'the stop asks again while the doors are open');
    assert.equal(engine.data.subwayLast, `off-failed:${here.id}`);
    assert.deepEqual(engine.said, [`Couldn't reach ${here.name}. Try again.`]);
    assert.equal(subwayFeature.deadEndRun(engine), 'subway');
    assert.equal(subwayFeature.questRoomHere(engine), null, 'not stranded: the ride goes on');
  });

  it('the second try gets you off', async () => {
    let calls = 0;
    const engine = subwayEngine({ fail: () => ++calls === 1 });
    const { ride, here } = standingRide();
    subwayFeature._test.setRide(ride, { state: { stop: here.id, inCar: true } });
    assert.equal(await subwayFeature._test.disembark(engine), true);
    assert.equal(engine.errors.length, 1, 'one failed try');
    assert.equal(engine.streetTsid, here.streetTsid);
    assert.equal(subwayFeature._state().gettingOff, null);
    assert.equal(engine.data.subwayLast, `off:${here.id}`);
    assert.deepEqual(engine.said, []);
  });

  it('a car with no ride shows the EXIT and /stuck, both to the last stop\'s platform', async () => {
    const engine = subwayEngine({ fail: () => false });
    const last = stationById(STATIONS[3].id);
    subwayFeature._test.setRide(null, { state: { stop: last.id, inCar: true }, pendingBoard: null });
    assert.equal(subwayFeature.deadEndRun(engine), null, 'no ride: the dead-end EXIT shows');
    const spot = disembarkSpot(last);
    assert.deepEqual(subwayFeature.deadEndWayOut(engine), { tsid: last.streetTsid, x: spot.x, y: spot.y });
    const room = subwayFeature.questRoomHere(engine);
    assert.ok(room?.stuckLine, '/stuck takes you off');
    assert.equal(await subwayFeature.questRoomLeave(engine, {}), true);
    assert.equal(engine.streetTsid, last.streetTsid);
    assert.equal(subwayFeature.questRoomHere(engine), null);
    assert.equal(subwayFeature.deadEndWayOut(engine), null);
  });

  it('a boarding whose car never loads gives the fare back', async () => {
    const engine = subwayEngine();
    engine.streetTsid = STATIONS[0].streetTsid;
    engine.pc.currants = 100 - FARE;
    subwayFeature._test.setRide(null, { pendingBoard: { stop: STATIONS[0].id, direction: 'forwards' } });
    assert.equal(await subwayFeature._test.enterCar(engine), false);
    assert.equal(engine.pc.currants, 100);
    assert.equal(engine.data.subwayLast, 'board-failed');
    assert.equal(subwayFeature._state().ride, null);
  });

  it('the source: the dead-end hook, the stranded way out, the EXIT using its answer', () => {
    const src = read('public/js/features/subway-feature.js');
    const off = src.slice(src.indexOf('async function disembark(engine) {'), src.indexOf('/** G1139: in the car with no ride'));
    assert.doesNotMatch(off, /ride = null/, 'Get off never ends the ride itself (the station does)');
    assert.match(src, /if \(ride && inCar\(engine\) && !gettingOff\) \{/);
    const de = read('public/js/features/dead-ends-feature.js');
    assert.match(de, /engine\?\.query\?\.\('deadEndWayOut', engine\) \|\| engine\?\.query\?\.\('safeWayOut'/);
    assert.match(de, /ok = \(await engine\.enter\(to\.tsid, \{/);
  });
});

