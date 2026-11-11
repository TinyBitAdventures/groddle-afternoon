/**
 * Oppidan Avenue's four teleporters (js/seam-teleporters.js, register G620, report #164).
 * Run: node --test tests/seam-teleporters.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPPIDAN_AVENUE_TSID, OPPIDAN_TELEPORTERS, SEAM_TELEPORTERS, seamTeleportersOn } from '../public/js/seam-teleporters.js?v=09d11340';
import { inTeleporter } from '../public/js/hidden-floors.js?v=732a2610';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${OPPIDAN_AVENUE_TSID}.json`), 'utf8'));
const xml = join(spike, '../streets/mnt/stos/location_data', `L${OPPIDAN_AVENUE_TSID.slice(1)}.xml`);
// Street space from screen space.
const sx = (x) => x + street.bounds.l;
const sy = (y) => y + street.bounds.t;
const byId = Object.fromEntries(SEAM_TELEPORTERS.map((t) => [t.id, t]));
/** The walkable floor under a street x (the highest line there), or null. */
const floorAt = (x) => {
  const ys = street.platforms
    .filter((p) => p.pc_perm === -1 && Math.min(p.x1, p.x2) <= x && Math.max(p.x1, p.x2) >= x)
    .map((p) => p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / ((p.x2 - p.x1) || 1));
  return ys.length ? Math.min(...ys) : null;
};
/** The regions the walls cut the street into, by street x. */
const region = (x) => (x < -2275 ? 'left cave' : x < -2199 ? 'A' : x < -1523 ? 'left gap' : x < -1463 ? 'B' : x < 1455 ? 'city' : x < 1520 ? 'C' : x < 2247 ? 'right gap' : x < 2322 ? 'D' : 'right cave');

describe("Oppidan Avenue's teleporters", () => {
  it('the source has four teleporters, two doors, no signposts, and the walls that make four alcoves', { skip: !existsSync(xml) && 'locations dump not beside this worktree' }, () => {
    const items = readFileSync(xml, 'utf8');
    const ids = [...new Set((items.match(/tsid="\w+" label="Collision-triggered Teleporter"/g) || []).map((m) => m.match(/tsid="(\w+)"/)[1]))].sort();
    assert.deepEqual(ids, [...OPPIDAN_TELEPORTERS].sort());
  });

  it('the street file still has the alcoves: one wall you pass one way, one you cannot pass', () => {
    assert.deepEqual(street.signposts, []);
    assert.equal(street.doors.length, 2);
    const wall = (x) => street.barriers.find((w) => w.x === x);
    for (const [open, shut, perm] of [[-2275, -2199, 1], [-1463, -1523, -1], [1455, 1520, 1], [2322, 2247, -1]]) {
      assert.equal(wall(open).pc_perm, perm, `wall ${open}`);
      assert.equal(wall(shut).pc_perm, null, `wall ${shut}`);
    }
    // The gaps beside the city have no floor at all: nobody walks there.
    assert.equal(floorAt(-1900), null);
    assert.equal(floorAt(1900), null);
  });

  it('each alcove holds one box, standing on its floor and inside its walls', () => {
    assert.equal(SEAM_TELEPORTERS.length, 4);
    assert.deepEqual(seamTeleportersOn(`L${OPPIDAN_AVENUE_TSID.slice(1)}`), [...SEAM_TELEPORTERS]);
    assert.deepEqual(seamTeleportersOn('GLI107JLRU11EM2'), []);
    const want = { oppidan_left_cave: 'A', oppidan_city_left: 'B', oppidan_city_right: 'C', oppidan_right_cave: 'D' };
    for (const t of SEAM_TELEPORTERS) {
      assert.equal(t.same, true);
      const left = sx(t.box.x - t.box.w / 2);
      const right = sx(t.box.x + t.box.w / 2);
      assert.equal(region(left + 1), want[t.id], `${t.id} left edge`);
      assert.equal(region(right - 1), want[t.id], `${t.id} right edge`);
      const floor = floorAt(sx(t.box.x));
      assert.ok(floor !== null && sy(t.box.y) >= floor && sy(t.box.y - t.box.h) < floor - 100, `${t.id} stands on its floor`);
      // Anyone standing anywhere on the alcove's floor is in the box.
      const [a, b] = { A: [-2275, -2199], B: [-1523, -1463], C: [1455, 1520], D: [2247, 2322] }[want[t.id]];
      const mid = (a + b) / 2;
      assert.ok(inTeleporter(t, mid - street.bounds.l, floorAt(mid) - street.bounds.t), `${t.id} catches the middle of its alcove`);
    }
  });

  it('a cave beam lands at that end of the city, a city edge in that side\'s cave, as the footage shows', () => {
    const lands = { oppidan_left_cave: 'city', oppidan_right_cave: 'city', oppidan_city_left: 'left cave', oppidan_city_right: 'right cave' };
    for (const t of SEAM_TELEPORTERS) {
      const x = sx(t.arrive.x);
      assert.equal(region(x), lands[t.id], t.id);
      const floor = floorAt(x);
      assert.ok(floor !== null && Math.abs(sy(t.arrive.y) - floor) <= 2, `${t.id} lands on the floor (${sy(t.arrive.y)} vs ${floor})`);
      for (const other of SEAM_TELEPORTERS) assert.equal(inTeleporter(other, t.arrive.x, t.arrive.y), false, `${t.id} does not land in ${other.id}`);
    }
    // The left beam puts you at the city's left end, the right beam at its right end.
    assert.ok(sx(byId.oppidan_left_cave.arrive.x) < -1000 && sx(byId.oppidan_right_cave.arrive.x) > 1000);
    // A city edge puts you between that cave's beam and its door.
    assert.ok(sx(byId.oppidan_city_left.arrive.x) < -2275 && sx(byId.oppidan_city_right.arrive.x) > 2322);
  });

  it('the hidden floors feature runs them with the other teleporters', () => {
    const feature = readFileSync(join(spike, 'public/js/features/hidden-floors-feature.js'), 'utf8');
    assert.match(feature, /\.\.\.cavePitTeleportersOn\(street\.tsid\), \.\.\.seamTeleportersOn\(street\.tsid\)\];/);
  });
});
