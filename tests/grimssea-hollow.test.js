/**
 * Grimssea Hollow (GDODG1KQLOS2GNO, Groddle Forest), the Enchanted Forest behind the mini door on
 * Grimssea Bottom, against Cleops's full-street snap
 * (research/eleven-snaps/Groddle Forest/cleops/Grimssea Hollow_cleops.png, reference only: nothing
 * from it ships). The snap is 900 x 1800 and not street-sized: the avatar stands 100 px tall in it
 * and 125 px on Cleops's 1:1 snap of Grimssea Bottom, so 1 snap px = 1.25 world px about the
 * trunk's centre (the scale js/enchanted-forests.js builds the hollow at). The measurements below
 * are taken off the snap independently of HOLLOW_LAYOUTS, in snap px: a shelf's walk line through
 * the feet of the Wood Trees standing on it, each shelf's lips, the pegs of each ladder and the door.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry } from '../public/js/street-model.js?v=b6cb6a4e';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=90fca5cc';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import { ENCHANTED_FORESTS, hollowTreeSpots } from '../public/js/enchanted-forests.js?v=da978edc';
import { treeScreenSpots } from '../public/js/features/enchanted-forest-feature.js?v=701d5246';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (tsid) => JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const TSID = 'GDODG1KQLOS2GNO';
const PARENT = 'GCR195Q63RK143M';
const street = read(TSID);
const parent = read(PARENT);
const forest = ENCHANTED_FORESTS.find((f) => f.tsid === TSID);
const manifest = new Set(JSON.parse(readFileSync(join(spike, 'public/assets/decos/manifest.json'), 'utf8')));

/** Snap px to world px. */
const SCALE = 1.25;
const SNAP = { w: 900, h: 1800 };
const wx = (px) => (px - SNAP.w / 2) * SCALE;
const wy = (py) => (py - SNAP.h) * SCALE;
/** How far a measured walk line may sit from the built one (world px: 6 snap px). */
const TOL = 7.5;

/** Measured on the snap: shelves top to bottom, their lips and the feet of the trees on them. */
const SHELVES = [
  { id: 'top_left', lips: [[62, 287], [585, 302]], trees: [[128, 281], [272, 266], [393, 278], [498, 295]] },
  { id: 'top_right', lips: [[525, 192], [835, 204]], trees: [[640, 172], [770, 196]] },
  { id: 'upper_right', lips: [[593, 412], [830, 405]], trees: [[728, 402]] },
  { id: 'upper_middle', lips: [[195, 612], [648, 585]], trees: [[342, 603]] },
  { id: 'middle_right', lips: [[500, 778], [840, 754]], trees: [[632, 762], [760, 758]] },
  { id: 'middle_left', lips: [[60, 860], [480, 868]], trees: [[360, 860]] },
  { id: 'grave_right', lips: [[575, 1068], [838, 1062]], trees: [[760, 1068]] },
  { id: 'lower_left', lips: [[55, 1080], [475, 1128]], trees: [[128, 1075], [252, 1100], [375, 1117]] },
  { id: 'bottom', lips: [[345, 1500], [845, 1540]], trees: [[632, 1520], [770, 1532]] },
];
/** Measured pegs: x of the ladder, its top and bottom peg (bottom 'floor': down to the floor). */
const PEGS = [
  { id: 'floor_left', x: 303, top: 1460, bottom: 'floor' },
  { id: 'centre', x: 522, top: 850, bottom: 1420 },
  { id: 'top', x: 545, top: 380, bottom: 560 },
  { id: 'left', x: 152, top: 591, bottom: 787 },
];
/** The arched door's centre, and the avatar's feet on the floor. */
const DOOR_X = 666;
const FLOOR_Y = 1752;

const walkable = street.platforms.filter((p) => p.pc_perm !== 1);
const lineY = (p, x) => (x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2) ? null : p.y1 + ((x - p.x1) / (p.x2 - p.x1 || 1)) * (p.y2 - p.y1));
/** Every walk line under x, nearest to y first. */
const linesAt = (x, y) => walkable
  .map((p) => ({ p, y: lineY(p, x) }))
  .filter((h) => h.y != null)
  .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
const shelfAt = (x, y) => linesAt(x, y).find((h) => Math.abs(h.y - y) <= TOL) || null;

describe('Grimssea Hollow against Cleops\'s snap', () => {
  it('keeps its tsid, name, region and size (the snap at 1.25 world px per px)', () => {
    assertStreetGeometry(street);
    assert.equal(street.tsid, TSID);
    assert.equal(street.label, 'Grimssea Hollow');
    assert.equal(street.hubName, 'Groddle Forest');
    assert.equal(street.bounds.r - street.bounds.l, SNAP.w * SCALE);
    assert.equal(street.bounds.b - street.bounds.t, SNAP.h * SCALE);
    assert.match(street.why.layout, /Cleops/);
  });

  it('lays every shelf where the snap has it: lips and walk lines within 6 snap px', () => {
    for (const s of SHELVES) {
      const ids = new Set();
      for (const [i, [x, y]] of s.lips.entries()) {
        // Just inside the lip, the fungus edge.
        const inside = x + (i === 0 ? 8 : -8);
        const hit = shelfAt(wx(inside), wy(y));
        assert.ok(hit, `${s.id}: no walk line at its lip ${x},${y} (snap px)`);
        ids.add(hit.p.id);
      }
      for (const [x, y] of s.trees) {
        const hit = shelfAt(wx(x), wy(y));
        assert.ok(hit, `${s.id}: no walk line under the tree's feet at ${x},${y} (snap px)`);
        assert.ok(hit.p.id.includes(`_${s.id}`), `${s.id}: the tree at ${x} stands on ${hit.p.id}`);
      }
      for (const id of ids) assert.ok(id.includes(`_${s.id}`), `${s.id}: its lip is on ${id}`);
    }
  });

  it('runs a walk line past a drawn lip only under a ladder\'s top or foot', () => {
    const ladderXs = street.ladders.map((l) => l.x);
    for (const s of SHELVES) {
      const lines = walkable.filter((p) => p.id.endsWith(`_${s.id}`) || p.id.includes(`_${s.id}_`));
      const lo = Math.min(...lines.map((p) => Math.min(p.x1, p.x2)));
      const hi = Math.max(...lines.map((p) => Math.max(p.x1, p.x2)));
      const [left, right] = [wx(s.lips[0][0]), wx(s.lips[1][0])];
      for (const [end, lip] of [[lo, left], [hi, right]]) {
        if (Math.abs(end - lip) <= TOL) continue;
        // A longer reach ends just past a ladder and no further than 70 snap px.
        assert.ok(Math.abs(end - lip) <= 70 * SCALE, `${s.id}: reaches ${Math.round(end - lip)} px past its lip`);
        assert.ok(ladderXs.some((x) => Math.abs(x - end) <= 25), `${s.id}: reaches past its lip to ${end} with no ladder there`);
      }
    }
  });

  it('stands the 17 Wood Trees on the measured feet, in the saved order', () => {
    const want = SHELVES.flatMap((s) => s.trees);
    const spots = hollowTreeSpots(forest);
    assert.equal(spots.length, 17);
    assert.equal(forest.woodTrees, 17);
    spots.forEach((t, i) => {
      assert.ok(Math.abs(t.x - wx(want[i][0])) <= TOL, `tree ${i}: x ${t.x} vs ${wx(want[i][0])}`);
      assert.ok(Math.abs(t.y - wy(want[i][1])) <= TOL, `tree ${i}: y ${t.y} vs ${wy(want[i][1])}`);
    });
  });

  it('puts every ladder on the measured pegs, a floor at its foot and a shelf at its top', () => {
    assert.equal(street.ladders.length, PEGS.length);
    const floor = walkable.find((p) => p.id.endsWith('_floor'));
    for (const m of PEGS) {
      const l = street.ladders.find((x) => x.id === `ladder_ench_grimssea_${m.id}`);
      assert.ok(l, m.id);
      const top = l.y - l.h;
      assert.ok(Math.abs(l.x - wx(m.x)) <= TOL, `${m.id}: x ${l.x} vs ${wx(m.x)}`);
      // Its top is the shelf beside the top peg (within 50 snap px of it); the top climb alone runs
      // on past the top left shelf to the top right one, out of the remake's 105 px jump.
      if (m.id === 'top') assert.ok(top < wy(m.top) && Math.abs(top - wy(192)) <= TOL, `top: ${top}`);
      else assert.ok(Math.abs(top - wy(m.top)) <= 50 * SCALE, `${m.id}: top ${top} vs the top peg ${wy(m.top)}`);
      const pegFoot = m.bottom === 'floor' ? floor.y1 : wy(m.bottom);
      assert.ok(l.y >= pegFoot - TOL, `${m.id}: foot ${l.y} over the bottom peg ${pegFoot}`);
      // Foot on a walk line, top on a walk line.
      assert.ok(linesAt(l.x, l.y).some((h) => Math.abs(h.y - l.y) <= 2), `${m.id}: nothing to stand on at its foot ${l.x},${l.y}`);
      const deck = linesAt(l.x, top).find((h) => Math.abs(h.y - top) <= 2);
      assert.ok(deck && !deck.p.id.endsWith('_floor'), `${m.id}: no shelf at its top ${l.x},${top}`);
    }
    // The middle climb stops at the middle left shelf: the snap has no pegs over it.
    const centre = street.ladders.find((l) => l.id.endsWith('_centre'));
    assert.ok(centre.y - centre.h >= wy(850) - 30 * SCALE, 'the centre ladder runs on above its pegs');
  });

  it('has its floor at the avatar\'s feet and the arched door where the snap has it', () => {
    const floor = walkable.find((p) => p.id.endsWith('_floor'));
    assert.ok(Math.abs(floor.y1 - wy(FLOOR_Y)) <= 10, `floor ${floor.y1} vs ${wy(FLOOR_Y)}`);
    assert.equal(street.doors.length, 1, 'one way out: the door (the snap shows no exit at the top)');
    assert.deepEqual(street.signposts, []);
    const door = street.doors[0];
    assert.equal(door.sprite, 'door_asset_woodtreedoor_01a_et1');
    assert.ok(Math.abs(door.x + street.bounds.l - wx(DOOR_X)) <= TOL, `door x ${door.x + street.bounds.l}`);
    assert.equal(door.y + street.bounds.t, floor.y1);
  });

  it('connects both ways with Grimssea Bottom, each arrival standing on a floor', () => {
    const out = street.doors[0];
    assert.equal(out.connect.street, PARENT);
    assert.equal(out.connect.tsid, `L${PARENT.slice(1)}`);
    const mini = parent.doors.find((d) => d.id === forest.door);
    assert.equal(mini.connect.street, TSID);
    assert.equal(mini.connect.tsid, forest.sourceTsid);
    assert.ok(arrivalInTarget(street, mini.connect.x, mini.connect.y)?.snapped, 'the mini door lands on the hollow floor');
    assert.ok(arrivalInTarget(parent, out.connect.x, out.connect.y)?.snapped, 'the way out lands on Grimssea Bottom');
    assert.equal(out.connect.arrive.x, mini.x);
  });

  it('reaches every shelf, tree and ladder from the mini door on the remake jump, with no traps', () => {
    const mini = parent.doors.find((d) => d.id === forest.door);
    const spots = treeScreenSpots(street, forest);
    const probe = { ...street, doors: [...street.doors, ...spots.map((p, i) => ({ id: `tree_${i}`, x: p.x, y: p.y, w: 40, h: 120 }))] };
    const r = reachStreet(probe, [{ x: mini.connect.arrive.x, y: mini.connect.arrive.y - 4, from: 'mini door' }]);
    assert.ok(r.arrivals.every((a) => a.stands));
    for (const t of r.targets) assert.equal(t.reached, true, t.id);
    assert.deepEqual(r.unreached, []);
    assert.deepEqual(r.traps, []);
    assert.deepEqual(r.deckless, []);
  });

  it('draws only Tiny Speck art the game ships, a fungus piece on every shelf', () => {
    const decos = street.layers.flatMap((l) => l.decos);
    for (const d of decos) assert.ok(manifest.has(d.sprite), `${d.sprite} not shipped`);
    const shelves = street.layers.find((l) => l.id === 'T_ench_shelves').decos;
    for (const s of SHELVES) {
      const [l, r] = [wx(s.lips[0][0]) - street.bounds.l, wx(s.lips[1][0]) - street.bounds.l];
      const y = wy((s.lips[0][1] + s.lips[1][1]) / 2) - street.bounds.t;
      assert.ok(shelves.some((d) => d.x >= l && d.x <= r && Math.abs(d.y - y) < 160), `${s.id}: no fungus drawn`);
    }
    assert.ok(decos.filter((d) => d.sprite === 'trunk_ladder_1').length >= PEGS.length);
    assert.ok(decos.some((d) => d.sprite === 'tree_floor_stump_01a_et1'));
  });
});
