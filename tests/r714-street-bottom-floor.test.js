/**
 * Report #714 (Hetuhila, GUVSBGGQCHC386B, a swimming street): an invisible floor across open water
 * stopped the avatar at y 1362, the end of the street's deepest line (plat_1351115412419), with
 * quoins below it. avatar-step.js avatarGround stood the feet on the deepest line wherever no line
 * spans x. The client bounded the avatar's y only at location.b (AvatarPhysicsHandler.as
 * setAndBoundPositionOnSelf 470-480): with no line under the feet, the street's bottom is the floor.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NORMAL_BUFF, avatarGround, stepAvatar } from '../public/js/avatar-step.js?v=8415ee96';
import { platformsScreen, streetHeight, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import { streetWorld } from '../public/js/builder/reach-graph.js?v=687006d3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const loadStreet = (tsid) => JSON.parse(readFileSync(join(root, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const HETUHILA = 'GUVSBGGQCHC386B';

describe('report #714: the street\'s bottom is the floor where no line is under the feet', () => {
  const street = loadStreet(HETUHILA);
  const plats = platformsScreen(street);
  const H = streetHeight(street);

  it('Hetuhila: no line spans x 583 and its deepest line ends at y 1362, far over the bottom', () => {
    assert.equal(plats.filter((p) => p.x1 - 8 <= 583 && p.x2 + 8 >= 583).length, 0);
    assert.equal(Math.max(...plats.flatMap((p) => [p.y1, p.y2])), 1362);
    assert.equal(H, 2400);
  });

  it('a swimmer (the game\'s own ground resolve, game.js resolveGround) sinks past y 1362 to the street\'s bottom', () => {
    const body = { x: 583, y: 1200, vx: 0, vy: 0, onGround: false };
    const opts = {
      buff: { ...NORMAL_BUFF, jetpack: true },
      platforms: plats,
      worldW: streetWidth(street),
      worldH: H,
      ground: (x, y, vy) => avatarGround(plats, x, y, vy, { street, fallback: 0 }),
    };
    for (let f = 0; f < 900; f += 1) stepAvatar(body, opts);
    assert.deepEqual([body.y, body.onGround], [H, true]);
  });

  it('the bottom-most quoins (players\' 2012 snaps under y 1362) are in the water the avatar now reaches', () => {
    const q = JSON.parse(readFileSync(join(root, 'public/assets/content/quoin-spots.json'), 'utf8'));
    const spots = (q.spots || q.streets || q)[HETUHILA];
    const below = spots.filter(([, y]) => y > 1362 + 30);
    assert.ok(below.length >= 14, `${below.length} quoins below the old floor`);
    for (const [x, y] of below) {
      const floor = avatarGround(plats, x, y, 0, { street, fallback: 0 });
      assert.ok(floor >= y, `quoin at ${x},${y} sits over the floor (${floor})`);
    }
  });

  it('a line under the feet still holds them, and a scene with bounds uses its own bottom', () => {
    const under = plats.find((p) => p.y1 === 1362 || p.y2 === 1362);
    const x = under.y2 === 1362 ? under.x2 - 2 : under.x1 + 2;
    assert.equal(Math.round(avatarGround(plats, x, 1362, 0, { street, fallback: 0 })), 1362);
    const room = { bounds: { l: 0, r: 1000, t: 0, b: 700 } };
    const floor = [{ x1: 0, y1: 600, x2: 400, y2: 600 }];
    assert.equal(avatarGround(floor, 200, 600, 0, { street: room }), 600);
    assert.equal(avatarGround(floor, 700, 600, 0, { street: room }), 700);
  });

  it('a street\'s end or a seam Glitch\'s foot circle walked over is no hole (Room 23\'s left end, 40 px in)', () => {
    // ColliderAvatar.as radius 15; setAndBoundPositionOnSelf keeps the feet 32 px from the ends.
    const room23 = loadStreet('GCR8MORFJI12IR4');
    const lines = platformsScreen(room23);
    for (const x of [24, 28, 31]) assert.equal(avatarGround(lines, x, 1765, 0, { street: room23 }), 1765, `x ${x}`);
    // Past the foot circle, a line's end is a drop to the bottom (Hetuhila's deepest line ends at x 1718).
    const ex = plats.find((p) => p.id === 'plat_1351115412419').x2;
    assert.equal(Math.round(avatarGround(plats, ex + 14, 1362, 0, { street })), 1362);
    assert.equal(avatarGround(plats, ex + 17, 1362, 0, { street }), H);
  });

  it('the level builder\'s validator walks the same floor (reach-graph streetWorld)', () => {
    const world = streetWorld(street);
    assert.equal(world.ground(583, 1300, 1), H);
  });
});
