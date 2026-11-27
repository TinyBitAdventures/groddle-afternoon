/**
 * #385 (Jark, follow-up): at every subway station you stood at the bottom of the steps; the walking
 * line was one flat floor. In Glitch the platform line ran up the stairs to the entrance (Jark's own
 * rebuild for Eleven draws it as a slope from the floor up to the entrance), and the surface doors'
 * arrival points into the stations (connect x, y) sit up the stairs. All 12 stations share one layout
 * (js/subway.js stationStreet), so all 12 climb.
 * Run: node --test tests/subway-stairs-385.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATIONS, STATION_BOUNDS, STATION_FLOOR, STATION_STAIRS_LINE, SUBWAY_ART, stationArrival, stationFloorY, stationScreen } from '../public/js/subway.js?v=ea6921ff';
import { NORMAL_BUFF, avatarGround, stepAvatar, steerX } from '../public/js/avatar-step.js?v=8415ee96';
import { barriersScreen, platformsScreen, stuckWay } from '../public/js/street-model.js?v=a9a05f9d';
import { defaultArrival } from '../public/js/street-arrival.js?v=b97af039';
import { subwayFeature } from '../public/js/features/subway-feature.js?v=624d7621';

const PUB = join(import.meta.dirname, '..', 'public');
const readJson = (rel) => JSON.parse(readFileSync(join(PUB, rel), 'utf8'));

/** Walk `dir` for `frames` frames; the world spot reached and the frames off the ground. */
function walk(street, body, dir, frames, dt = 1) {
  const plats = platformsScreen(street);
  const ctx = { dt, buff: NORMAL_BUFF, platforms: plats, barriers: barriersScreen(street), worldW: street.bounds.r - street.bounds.l, worldH: street.bounds.b - street.bounds.t, ground: (x, y, vy) => avatarGround(plats, x, y, vy ?? 0, { street }) };
  let air = 0;
  for (let i = 0; i < frames; i++) {
    body.vx = steerX(body.vx, dir, body.onGround, NORMAL_BUFF);
    stepAvatar(body, ctx);
    if (!body.onGround) air += 1;
  }
  return { x: body.x + street.bounds.l, y: body.y + street.bounds.t, air };
}

describe('#385 the station\'s walking line climbs the stairs to the entrance', () => {
  it('runs from the floor at the stairs\' foot up over the stairs art to the left end', () => {
    const [, w, h] = SUBWAY_ART.door_asset_stairs;
    const { x1, y1, x2, y2 } = STATION_STAIRS_LINE;
    assert.equal(y2, STATION_FLOOR, 'meets the floor');
    assert.ok(x1 <= STATION_BOUNDS.l + 4, 'reaches the left end');
    assert.ok(x2 > STATION_BOUNDS.l + w, 'its foot is past the stairs art');
    assert.ok(STATION_FLOOR - y1 > 80 && STATION_FLOOR - y1 < h, `${STATION_FLOOR - y1} px up, within the stairs art`);
    assert.equal(stationFloorY(0), STATION_FLOOR, 'the step-off spot stays on the floor');
    assert.equal(stationFloorY(x2 - 1) < STATION_FLOOR, true);
  });

  for (const station of STATIONS) {
    it(`${station.name}: walking left goes up the steps, and back down`, () => {
      const street = readJson(`assets/streets/${station.streetTsid}.json`);
      assert.deepEqual(street.platforms.map((p) => p.id), ['plat_subway_stairs', 'plat_subway_platform']);
      const at = stationScreen(0);
      const body = { x: at.x, y: at.y, vx: 0, vy: 0, onGround: true };
      for (const dt of [1, 2]) {
        const up = walk(street, body, -1, 400 / dt, dt);
        assert.equal(up.air, 0, 'never in the air on the way up');
        assert.ok(up.x < STATION_BOUNDS.l + 40, `reached the left end (${up.x})`);
        assert.ok(STATION_FLOOR - up.y > 80, `climbed ${STATION_FLOOR - up.y} px`);
        assert.ok(Math.abs(up.y - stationFloorY(up.x)) < 1, 'on the stairs line');
        // The steps (the stairs door) are still there to click at the top.
        const door = street.doors.find((d) => d.id === 'door_subway_stairs');
        const sx = up.x - street.bounds.l;
        assert.ok(Math.abs(sx - door.x) <= door.w / 2, 'standing over the steps');
        const down = walk(street, body, 1, 200 / dt, dt);
        assert.equal(down.y, STATION_FLOOR, 'back on the floor');
        assert.ok(down.x > 0);
      }
    });
  }

  it('arriving from the surface lands on the walking line at the source\'s arrival x', () => {
    for (const station of STATIONS) {
      const surface = readJson(`assets/streets/${station.surfaceStreetTsid}.json`);
      const copy = structuredClone(surface);
      subwayFeature.prepareStreet(copy);
      const door = copy.doors.find((d) => d.connect?.tsid === station.tsid);
      const src = surface.doors.find((d) => d.connect?.tsid === station.tsid).connect;
      const arrive = door.connect.arrive;
      const wx = arrive.x + STATION_BOUNDS.l;
      assert.equal(wx, src.x, `${station.name}: the source connect x`);
      assert.equal(arrive.y + STATION_BOUNDS.t, stationFloorY(wx), `${station.name}: on the line`);
      // The source's arrival y sits on or over the line (dropped onto it, Somewhat Sump's from 54 px), never under it.
      const over = stationFloorY(src.x) - src.y;
      assert.ok(over >= 0 && over <= 60, `${station.name}: source y ${src.y} is ${over} px over the line`);
    }
    assert.ok(stationArrival(-760).y + STATION_BOUNDS.t < STATION_FLOOR, 'a far-left arrival is up the steps, not under them');
  });

  it('an arrival with no spot of its own, and /stuck, stand on the line, not under the steps', () => {
    const table = readJson('assets/content/street-arrivals.json');
    for (const station of STATIONS) {
      const street = readJson(`assets/streets/${station.streetTsid}.json`);
      // G913: the station's incoming arrival is the surface door's (a Map trip, a QA trip).
      const entry = defaultArrival(street, table, { worldW: street.bounds.r - street.bounds.l });
      assert.equal(entry.from, 'incoming', station.name);
      assert.equal(entry.y + street.bounds.t, stationFloorY(entry.x + street.bounds.l), `${station.name}: on the line`);
      // /stuck's nearest way out is the steps: you stand on the line over their foot.
      const way = stuckWay(street, 0);
      assert.equal(way.y + street.bounds.t, stationFloorY(way.x + street.bounds.l), `${station.name}: /stuck on the line`);
      assert.ok(way.y + street.bounds.t < STATION_FLOOR - 40, 'up the steps');
    }
  });
});
