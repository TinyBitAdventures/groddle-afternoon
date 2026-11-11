/**
 * Level 3 West's pit (register G527; live chat 2026-11-04, Austin 2026-11-05). Tiny Speck's own
 * geometry leaves no plain way off the pit floor; its one Collision-triggered Teleporter
 * (ILI22RQ8B7A1AEQ) lost its position and target, so js/cave-pit.js stands in for it, by our own
 * design. The reach check runs at a new player's jump (69 px), who is the one with no other way.
 *
 * Piene Question, from the same sweep, is not this kind of pit: its basin has two ladders whose
 * feet stand 82 px over the floor, and Up on the floor jumps and takes them (checked in a real
 * browser 2026-11-06). Its item list holds no teleporter, so it gets no stand-in.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachStreet, streetBuff } from '../public/js/builder/reach-graph.js?v=22368fd6';
import { CAVE_PIT_TELEPORTERS, LEVEL_3_WEST_TELEPORTER, LEVEL_3_WEST_TSID, cavePitTeleportersOn } from '../public/js/cave-pit.js?v=81e62950';
import { inTeleporter } from '../public/js/hidden-floors.js?v=9a7afdf3';
import { hiddenFloorsFeature } from '../public/js/features/hidden-floors-feature.js?v=ce4f75f0';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${LEVEL_3_WEST_TSID}.json`), 'utf8'));
const xmlDir = join(spike, '../streets/mnt/stos/location_data');
const NEW_PLAYER = { ...streetBuff(street).buff, jump: 0.7105 };
const POST = { signpost_1: 'The Drop', signpost_2: 'Level 2 West' };

/** Shipped arrivals: the arms from The Drop and Level 2 West. */
function arrivals() {
  const out = [];
  for (const tsid of ['GHH1011JSO11ORS', 'GHH12E1QP611OPA']) {
    const s = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));
    for (const post of s.signposts) for (const c of post.connects || []) if (c.tsid?.slice(1) === LEVEL_3_WEST_TSID.slice(1)) out.push({ ...c.arrive, from: tsid });
  }
  return out;
}

const reachesBox = (r, row) => r.surfaces.some((s) => s.reached && [[s.x1, s.y1], [s.x2, s.y2], [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]].some(([x, y]) => inTeleporter(row, x, y)));
const from = (p) => reachStreet(street, [{ ...p, from: `${p.x},${p.y}` }], { buff: NEW_PLAYER });

describe('Level 3 West: the pit and its way out', () => {
  it('the source has one teleporter, no ladders, no doors, and the geometry is what shipped', { skip: !existsSync(xmlDir) && 'locations dump not beside this worktree' }, () => {
    const items = readFileSync(join(xmlDir, `L${LEVEL_3_WEST_TSID.slice(1)}.xml`), 'utf8');
    assert.equal(new Set(items.match(/tsid="\w+" label="Collision-triggered Teleporter"/g)).size, 1);
    assert.ok(items.includes(`tsid="${LEVEL_3_WEST_TELEPORTER}" label="Collision-triggered Teleporter"`));
    const geo = readFileSync(join(xmlDir, `${LEVEL_3_WEST_TSID}.xml`), 'utf8');
    assert.match(geo, /<object id="ladders">\s*<\/object>/);
    assert.match(geo, /<object id="doors">\s*<\/object>/);
    assert.equal(street.ladders, undefined);
    assert.equal(street.doors, undefined);
  });

  it('without the boxes the floor and its ledges are a trap at a new player\'s jump and a plain one (the report)', () => {
    const lines = ['_pl1278705608815', 'pl1271537898408', '_pl1271533147724', '_pl1271533157246', 'plat_1335378574757'];
    for (const buff of [NEW_PLAYER, streetBuff(street).buff]) {
      const r = reachStreet(street, arrivals(), { buff });
      assert.deepEqual(r.traps.map((t) => t.line).sort(), [...lines].sort());
    }
  });

  it('from anywhere in the pit a new player reaches a box at each end of the floor by walking', () => {
    const [left, right] = CAVE_PIT_TELEPORTERS;
    for (const at of [{ x: 2250, y: 966 }, { x: 2320, y: 837 }, { x: 1800, y: 805 }, { x: 3800, y: 841 }]) {
      const r = from(at);
      assert.ok(r.arrivals[0].stands, `${at.x},${at.y} stands`);
      assert.ok(reachesBox(r, left), `${at.x},${at.y} to the left box`);
      assert.ok(reachesBox(r, right), `${at.x},${at.y} to the right box`);
    }
  });

  it('every landing stands on its signpost island, with its signpost in reach', () => {
    const expect = { level3west_pit_left: 'signpost_1', level3west_pit_right: 'signpost_2' };
    for (const row of CAVE_PIT_TELEPORTERS) {
      const r = from(row.arrive);
      assert.ok(r.arrivals[0].stands, `${row.id} lands on a floor`);
      assert.ok(r.targets.find((t) => t.id === expect[row.id])?.reached, `${row.id} reaches ${POST[expect[row.id]]}`);
    }
  });

  it('with them a new player can reach both exits from either arrival (the islands alone don\'t cross left to right)', () => {
    const [drop, level2] = [arrivals().find((a) => a.from === 'GHH12E1QP611OPA'), arrivals().find((a) => a.from === 'GHH1011JSO11ORS')];
    assert.equal(from(drop).targets.find((t) => t.id === 'signpost_2').reached, false, 'west to east needs the pit');
    for (const a of [drop, level2]) {
      const seen = new Set();
      const exits = new Set();
      const todo = [a];
      while (todo.length) {
        const r = from(todo.pop());
        for (const t of r.targets) if (t.reached) exits.add(t.id);
        for (const row of CAVE_PIT_TELEPORTERS) {
          if (seen.has(row.id) || !reachesBox(r, row)) continue;
          seen.add(row.id);
          todo.push(row.arrive);
        }
      }
      assert.deepEqual([...exits].sort(), Object.keys(POST));
    }
  });

  it('no landing or arrival stands in a box, and the boxes sit inside the avatar\'s reach of the street ends', () => {
    for (const row of CAVE_PIT_TELEPORTERS) {
      for (const other of CAVE_PIT_TELEPORTERS) assert.equal(inTeleporter(other, row.arrive.x, row.arrive.y), false);
      for (const a of arrivals()) assert.equal(inTeleporter(row, a.x, a.y), false);
    }
    const [left, right] = CAVE_PIT_TELEPORTERS;
    assert.ok(inTeleporter(left, 40, 971), 'the left edge margin');
    assert.ok(inTeleporter(right, 4460, 960), 'the right edge margin');
  });

  it('the feature runs them with the other teleporters, on the street itself, either TSID prefix', () => {
    assert.equal(cavePitTeleportersOn(LEVEL_3_WEST_TSID).length, 2);
    assert.equal(cavePitTeleportersOn(`L${LEVEL_3_WEST_TSID.slice(1)}`).length, 2);
    assert.equal(cavePitTeleportersOn('GHH1011JSO11ORS').length, 0);
    for (const row of CAVE_PIT_TELEPORTERS) assert.equal(row.same, true);
    const data = {};
    const engine = { setData: (k, v) => { data[k] = v; }, player: { x: 1, y: 1 }, param: () => null, transientInstance: () => false, homeContext: () => ({}) };
    hiddenFloorsFeature.onStreetEnter({ tsid: LEVEL_3_WEST_TSID, bounds: street.bounds, platforms: [] }, engine);
    assert.deepEqual(hiddenFloorsFeature._state().boxes, ['level3west_pit_left', 'level3west_pit_right']);
    hiddenFloorsFeature.onStreetClear();
  });

  it('every row says why, and that it is our own design', () => {
    for (const row of CAVE_PIT_TELEPORTERS) assert.match(row.why, /our own stand-in/i);
    assert.match(readFileSync(join(spike, 'public/js/cave-pit.js'), 'utf8'), /OUR OWN DESIGN/);
  });
});

describe('Piene Question: not the same kind of pit', () => {
  const tsid = 'GHVL2NDFT732BK3';
  const piene = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));

  it('has no teleporter in the source', { skip: !existsSync(xmlDir) && 'locations dump not beside this worktree' }, () => {
    assert.doesNotMatch(readFileSync(join(xmlDir, `L${tsid.slice(1)}.xml`), 'utf8'), /Collision-triggered Teleporter/);
  });

  it('has its two ladders with feet 82 px over the basin floor, under a new player\'s jump plus the grab', () => {
    const { l, t } = piene.bounds;
    const bottom = (id) => { const d = piene.ladders.find((x) => x.id === id); return { x: d.x - l, foot: d.y - t }; };
    const floorAt = (x) => {
      const p = piene.platforms.map((q) => ({ x1: q.x1 - l, y1: q.y1 - t, x2: q.x2 - l, y2: q.y2 - t })).filter((q) => q.x1 <= x && q.x2 >= x).sort((a, b) => b.y1 - a.y1)[0];
      return p.y1 + (p.y2 - p.y1) * (x - p.x1) / (p.x2 - p.x1);
    };
    for (const id of ['ladder_1306775277214', 'ladder_1306775277222']) {
      const { x, foot } = bottom(id);
      const gap = floorAt(x) - foot;
      assert.ok(gap > 80 && gap < 83, `${id}: ${gap}`);
      assert.ok(gap < 64 + 69, 'a new player\'s jump lifts the feet into the 64 px grab (street-model findClimbWallNear)');
    }
  });
});
