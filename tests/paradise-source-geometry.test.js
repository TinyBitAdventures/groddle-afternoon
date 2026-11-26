// G1119 / R44 (#599): a recovered Paradise course keeps its source street's lines and walls.
// Radial Heights starts you penned on its start cloud (plat_1339609697362) in the middle, not in
// the air over the innermost stars; Starlit Night's cloud floor is its 17 source lines.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PARADISE_COURSES,
  RADIAL_HEIGHTS_START_PEN,
  paradiseFlightCollide,
  paradiseGeometryBarriers,
  paradiseGeometryLines,
  paradiseLowestFloor,
  paradisePickupTouches,
  paradiseSourceGeometry,
  paradiseSourcePoints,
  paradiseSpawnFeet,
  radialStartPenOpens,
} from '../public/js/paradise-flight.js?v=2ca6d035';
import { RADIAL_FLITTERBUG_EVENTS, applyGeometryEffects, createRadialSession, radialFire } from '../public/js/radial-heights.js?v=90fcc768';
import { platformYAt } from '../public/js/street-model.js?v=a9a05f9d';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const street = (tsid) => JSON.parse(readFileSync(join(ROOT, `assets/streets/${tsid}.json`), 'utf8'));
const game = () => readFileSync(join(ROOT, 'game.js'), 'utf8');
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

const radial = PARADISE_COURSES.radial_heights;
const starlit = PARADISE_COURSES.starlit_night;

/** One idle or steered flight frame as game.js runs it (handleParadiseFlightInput + paradiseFlightPhysics). */
function flyFrame(body, course, geometry, { lift = false, vx = null } = {}) {
  const lines = paradiseGeometryLines(geometry);
  const barriers = paradiseGeometryBarriers(geometry);
  if (vx != null) body.vx = vx;
  body.vy = lift ? Math.max(-5.4, body.vy - 0.46) : Math.min(3.1, body.vy + 0.16);
  body.vy *= 0.985;
  const prevX = body.x;
  const prevY = body.y;
  const bottom = Math.max(course.height - 45, Math.min(course.height - 2, paradiseLowestFloor(lines)));
  body.x = Math.min(course.width - 34, Math.max(34, body.x + body.vx));
  body.y = Math.min(bottom, Math.max(72, body.y + body.vy));
  paradiseFlightCollide(body, prevX, prevY, { lines, barriers, scale: 1 });
  return body;
}

describe('Radial Heights start cloud (#599, G1119)', () => {
  const data = street(radial.sourceStreetTsid);

  it('the course has the source start cloud as a floor, its pen shut on arrival', () => {
    const geometry = paradiseSourceGeometry(radial, data);
    const lines = paradiseGeometryLines(geometry);
    const cloud = lines.find((p) => p.id === RADIAL_HEIGHTS_START_PEN.floorId);
    assert.ok(cloud, 'start cloud line present');
    assert.deepEqual([cloud.x1, cloud.y1, cloud.x2, cloud.y2, cloud.pcPerm], [835, 1083, 1193, 1083, -1]);
    assert.equal(lines.find((p) => p.id === 'plat_1339609697364').pcPerm, 1, 'roof solid from below');
    assert.equal(paradiseGeometryBarriers(geometry).length, 2, 'both pen walls');
    // The exit cloud under the signpost is a floor too.
    assert.ok(lines.some((p) => p.id === 'plat_1339609697363' && p.y1 === 1644));
  });

  it('you arrive standing on the start cloud and touch no star', () => {
    const geometry = paradiseSourceGeometry(radial, data);
    const feet = paradiseSpawnFeet(radial, paradiseGeometryLines(geometry));
    assert.deepEqual(feet, { x: 1000, y: 1083 });
    const points = paradiseSourcePoints(radial, data);
    assert.equal(points.length, radial.pickupCount);
    const body = { x: feet.x, y: feet.y, vx: 0, vy: 0 };
    for (let frame = 0; frame < 240; frame += 1) {
      flyFrame(body, radial, geometry);
      for (const point of points) {
        // Stars bob 8 px each way (game.js updateParadiseFlight).
        for (const dy of [-8, 0, 8]) {
          assert.equal(paradisePickupTouches(radial, { ...point, y: point.y + dy }, body), false, `touched ${point.x},${point.y} at frame ${frame}`);
        }
      }
    }
    assert.equal(body.y, 1083, 'still on the cloud after four idle seconds');
    assert.equal(body.onGround, true);
  });

  it('the pen keeps you in until you fly up into the flitterbug, then opens', () => {
    const geometry = paradiseSourceGeometry(radial, data);
    const body = { x: 1000, y: 1083, vx: 0, vy: 0 };
    for (let frame = 0; frame < 120; frame += 1) flyFrame(body, radial, geometry, { vx: 5.8 });
    assert.ok(body.x < 1193, `right wall holds (${body.x})`);
    for (let frame = 0; frame < 120; frame += 1) flyFrame(body, radial, geometry, { vx: -5.8 });
    assert.ok(body.x > 835, `left wall holds (${body.x})`);
    body.x = 1000;
    body.vx = 0;
    let opened = false;
    for (let frame = 0; frame < 120 && !opened; frame += 1) {
      flyFrame(body, radial, geometry, { lift: true });
      opened = radialStartPenOpens(body, 1);
    }
    assert.ok(opened, 'flying up reaches the flitterbug');
    // hide_start_clouds, run by the flitterbug's box on the shared event runtime.
    applyGeometryEffects(geometry, radialFire(createRadialSession(data.events), RADIAL_FLITTERBUG_EVENTS, 0));
    for (let frame = 0; frame < 120; frame += 1) flyFrame(body, radial, geometry, { lift: true });
    assert.ok(body.y < 847, `out over the roof (${body.y})`);
    // And back down through the soft cloud.
    for (let frame = 0; frame < 300; frame += 1) flyFrame(body, radial, geometry);
    assert.ok(body.y > 1083, 'the open start cloud no longer holds you');
  });

  it('game.js builds the course from the source and spawns on it', () => {
    const src = game();
    assert.match(fnBody(src, 'loadParadiseSource'), /paradiseSourceGeometry\(course, data\)/);
    const setup = fnBody(src, 'setupParadiseCourse');
    assert.match(setup, /streetPlatforms = paradiseGeometryLines\(geometry\)/);
    assert.match(setup, /paradiseSpawnFeet\(course, streetPlatforms\)/);
    assert.doesNotMatch(setup, /streetPlatforms = \[\]/);
    assert.match(fnBody(src, 'paradiseFlightPhysics'), /paradiseFlightCollide\(player, prevX, prevY/);
  });
});

describe('Starlit Night cloud floor (G1119 sibling)', () => {
  const data = street(starlit.sourceStreetTsid);
  const geometry = paradiseSourceGeometry(starlit, data);
  const lines = paradiseGeometryLines(geometry);

  it('has its 17 source lines, every one a floor', () => {
    assert.equal(lines.length, 17);
    assert.ok(lines.every((p) => p.pcPerm === -1));
  });

  it('arrives on the start ledge under "Spacebar to Fly"', () => {
    const feet = paradiseSpawnFeet(starlit, lines);
    assert.equal(feet.x, 110);
    assert.ok(feet.y > 700 && feet.y < 750, `ledge at ${feet.y}`);
  });

  it('the floor is reachable everywhere and never falls through', () => {
    for (let x = 40; x <= 1460; x += 35) {
      const body = { x, y: 400, vx: 0, vy: 0 };
      for (let frame = 0; frame < 400; frame += 1) flyFrame(body, starlit, geometry);
      const floor = Math.min(...lines.map((p) => platformYAt(p, x, 0)).filter((y) => y != null && y >= 400));
      assert.ok(Math.abs(body.y - floor) < 0.01, `x ${x}: feet ${body.y}, floor ${floor}`);
      assert.ok(body.y < starlit.height, `x ${x} stays in the course`);
      assert.equal(body.onGround, true);
    }
  });
});
