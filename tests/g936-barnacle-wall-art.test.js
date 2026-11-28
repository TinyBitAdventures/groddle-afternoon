/**
 * G936 (Austin 2026-11-17, Konka Brink): G916's rule-placed Mortar Barnacles checked against the
 * art. A spot counts only where the barnacle sits on the wall deco's drawn art (its alpha, through
 * the deco's flip and rotation) with no ground art of a nearer layer, or later in the wall's own
 * layer, drawn over it; on a round wall's outer part a barnacle faces outward and sits a few px in.
 * Run: node --test tests/g936-barnacle-wall-art.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecologyForStreet, measuredNodeSpots, populationForStreet, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=e5263244';
import { resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=0dd43fb0';
import { BARNACLE_GAP_CLOSE, BARNACLE_VARIANT_FACES, GROUND_COVER_DECO, ROUND_WALL_DECO, barnacleWallSpots, decoCovers } from '../public/js/barnacle-walls.js?v=75e568c3';
import { BARNACLE_WALL_SPOTS } from '../public/js/barnacle-wall-spots-data.js?v=8ba1ff7d';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
setStreetEcologyCatalog(read('public/assets/content/street-ecology.json'));
const masks = read('tools/barnacle-wall-masks.json').masks;
const KONKA = 'GIF1GTHPO9V14NG';

/** One drawn cell: the whole deco box is art. */
const SOLID = Object.freeze({ w: 1, h: 1, d: 'gA==' });

/** A flat street 1200 x 600 (world x -600..600, y -600..0; street px = world + 600), its floor at street y 500, and the given middleground decos. */
function flatStreet(decos) {
  return {
    bounds: { l: -600, r: 600, t: -600, b: 0 },
    platforms: [{ id: 'floor', x1: -600, y1: -100, x2: 600, y2: -100, pc_perm: -1, item_perm: -1 }],
    layers: [{ id: 'middleground', name: 'middleground', z: 0, w: 1200, h: 600, decos }],
  };
}

describe('G936: barnacles sit on the wall art, never under ground art', () => {
  it('Konka Brink: the sprout keeps three, the outer two moved in, the right one mirrored', () => {
    const rows = BARNACLE_WALL_SPOTS[KONKA];
    const sprout = rows.filter(([x, y]) => x > 780 && x < 1050 && y > 650 && y < 760);
    assert.equal(sprout.length, 3, JSON.stringify(sprout));
    const [left, middle, right] = sprout;
    // Before: 816, 912, 1008, each drawn as the art faces (its mouth to the left).
    assert.ok(left[0] > 816 && left[0] <= 850 && left[4] !== 1, `left ${left}: moved in, still facing left (outward)`);
    // The trunk's drawn sides at their height run about 820-995: each sits on it.
    for (const [x] of sprout) assert.ok(x - 8 >= 819 && x + 8 <= 995, `on the trunk: ${x}`);
    assert.ok(Math.abs(middle[0] - 912) <= 16 && middle[4] !== 1, `middle ${middle}: about where it was, as drawn`);
    assert.ok(right[0] < 1008 && right[0] >= 966 && right[4] === 1, `right ${right}: moved in and mirrored to face right (outward)`);
  });

  it('Konka Brink: none on the log turned 80 degrees (3920, 4048 lay on the dirt), none in the air beside the pipe', () => {
    const rows = BARNACLE_WALL_SPOTS[KONKA];
    assert.ok(!rows.some(([x]) => x > 3800 && x < 4150), JSON.stringify(rows));
    assert.ok(rows.every((r) => r[3] >= 1 && r[3] <= 3), 'every one on a wall, none on the floor');
    // The pipe (ground_rootpipe2 at street 3070, 217 wide): its drawn body runs about 3007-3127.
    for (const [x] of rows.filter(([x]) => x > 2950 && x < 3200)) assert.ok(x >= 3010 && x <= 3124, `on the pipe: ${x}`);
    // The root pipe is a round barrel (Austin 2026-11-17): its right-hand barnacle faces outward, the others as drawn.
    const pipe = rows.filter(([x]) => x > 2950 && x < 3200);
    assert.equal(pipe.at(-1)[4], 1, `right on the pipe ${pipe.at(-1)}: mirrored`);
    assert.ok(pipe.slice(0, -1).every((r) => r[4] !== 1), JSON.stringify(pipe));
  });

  it('the mirror reaches the game: measuredNodeSpots and the spawn plan carry it for that barnacle only', () => {
    const spots = measuredNodeSpots(KONKA).mortar_barnacle;
    const mirrored = BARNACLE_WALL_SPOTS[KONKA].map((r, i) => (r[4] === 1 ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(spots.map((s, i) => (s.mirror ? i : -1)).filter((i) => i >= 0), mirrored);
    const plan = resourceSpawnPlan(populationForStreet(KONKA, ecologyForStreet(KONKA)), () => []).filter((r) => r.classTsid === 'mortar_barnacle');
    const right = plan.find((r) => r.x > 960 && r.x < 1008);
    assert.equal(right.mirror, true);
    assert.ok(plan.filter((r) => r !== right && r.x < 960).every((r) => !r.mirror));
    // A snapped street's rows have no fifth field: never mirrored.
    assert.ok(!Object.values(measuredNodeSpots('GIFDIDJT0GU1CR8')?.mortar_barnacle || []).some((s) => s.mirror));
  });

  it('a wall covered by ground art drawn later in its layer takes no spot there; drawn before it, the wall still counts', () => {
    const wall = { sprite: 'legs_moss_1', x: 0, y: -100, w: 300, h: 300, z: 5 };
    const front = (z) => ({ sprite: 'front_ground_1', x: -75, y: -100, w: 150, h: 200, z });
    const m = { legs_moss_1: SOLID, front_ground_1: SOLID };
    // The front ground covers street x 450-600 (world -150-0); the wall's middle runs 510-690.
    const covered = barnacleWallSpots(flatStreet([wall, front(9)]), 2, { masks: m });
    assert.ok(covered.length >= 1);
    assert.ok(covered.every((s) => s.tier !== 1 || s.x - 8 >= 600), `none over the front ground: ${JSON.stringify(covered)}`);
    const behind = barnacleWallSpots(flatStreet([front(1), wall]), 2, { masks: m });
    assert.ok(behind.some((s) => s.tier === 1 && s.x < 600), `ground drawn first is under the wall: ${JSON.stringify(behind)}`);
    // A nearer layer's ground art covers it too (a layer's decos sit in street px).
    const street = flatStreet([wall]);
    street.layers.push({ id: 'middleplus', name: 'middleplus', z: 1, w: 1200, h: 600, decos: [{ ...front(0), x: 525, y: 500 }] });
    assert.ok(barnacleWallSpots(street, 2, { masks: m }).every((s) => s.tier !== 1 || s.x - 8 >= 600));
    assert.ok(GROUND_COVER_DECO.test('ground_generic_3') && GROUND_COVER_DECO.test('grass_solid') && !GROUND_COVER_DECO.test('ground_rootpipe2'));
  });

  it('a spot needs the wall drawn under it: no art (null) takes none, and the closer gap comes before the floor', () => {
    const wall = { sprite: 'legs_moss_1', x: 0, y: -100, w: 400, h: 300, z: 5 };
    assert.ok(barnacleWallSpots(flatStreet([wall]), 2, { masks: { legs_moss_1: null } }).every((s) => s.tier === 4));
    // Its middle (street 480-720) holds three at BARNACLE_GAP; the fourth closes up.
    const close = barnacleWallSpots(flatStreet([wall]), 4, { masks: { legs_moss_1: SOLID } });
    assert.equal(close.length, 4);
    assert.ok(close.every((s) => s.tier === 1), JSON.stringify(close));
    for (const a of close) for (const b of close) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= BARNACLE_GAP_CLOSE);
  });

  it('decoCovers follows the deco as drawn: flipped and turned about its bottom centre', () => {
    // A tall thin solid deco turned 90 degrees lies along the floor to the right of its anchor.
    const log = { sprite: 'x', w: 20, h: 200, r: 90 };
    assert.equal(decoCovers(log, 0, 0, SOLID, 0, -100), false);
    assert.equal(decoCovers(log, 0, 0, SOLID, 100, 0), true);
    // Left half drawn (cells 10 = 0x80 0x00...: a 2 x 1 mask with the left cell set); flipped, the right half.
    const half = { w: 2, h: 1, d: 'gA==' };
    assert.equal(decoCovers({ w: 100, h: 100 }, 0, 0, half, -25, -50), true);
    assert.equal(decoCovers({ w: 100, h: 100 }, 0, 0, half, 25, -50), false);
    assert.equal(decoCovers({ w: 100, h: 100, flip: true }, 0, 0, half, 25, -50), true);
    assert.equal(decoCovers({ w: 100, h: 100 }, 0, 0, undefined, 25, -50), true, 'no mask: the box');
  });

  it('every mask the builder streets read is measured, and round walls are the sprouts and bottle tree bodies', () => {
    assert.ok(Object.keys(masks).length > 100);
    for (const [name, m] of Object.entries(masks)) {
      if (m === null) continue;
      assert.ok(m.w >= 1 && m.w <= 64 && m.h >= 1 && m.h <= 64, name);
      assert.equal(Buffer.from(m.d, 'base64').length, Math.ceil((m.w * m.h) / 8), name);
    }
    assert.ok(ROUND_WALL_DECO.test('background_sprout') && ROUND_WALL_DECO.test('bottletree_body4') && !ROUND_WALL_DECO.test('legs_moss_2'));
  });
});

describe('G936 follow-up: each variant faces its own way (Austin 2026-11-17, Konka Brink second sprout)', () => {
  it('outer barnacles on a round wall face outward whatever their variant', () => {
    assert.deepEqual(BARNACLE_VARIANT_FACES, { 1: 'left', 2: 'right', 3: 'left', 4: 'right', 5: 'left', 6: 'right' });
    const rows = BARNACLE_WALL_SPOTS[KONKA];
    const sprout2 = rows.filter(([x, y]) => x > 1380 && x < 1600 && y > 650 && y < 760);
    assert.equal(sprout2.length, 3, JSON.stringify(sprout2));
    const facing = ([, , v, , m]) => (m === 1 ? (BARNACLE_VARIANT_FACES[v] === 'left' ? 'right' : 'left') : BARNACLE_VARIANT_FACES[v]);
    assert.equal(facing(sprout2[0]), 'left', `left ${sprout2[0]} faces out`);
    assert.equal(facing(sprout2.at(-1)), 'right', `right ${sprout2.at(-1)} faces out`);
  });
});
