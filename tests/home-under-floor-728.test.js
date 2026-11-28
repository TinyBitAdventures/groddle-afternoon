/**
 * Report #728 (desktop 1536x702, online, in their own house): a Play Cube lay under the house's
 * floor, in the soil band. A click on it said "Could not get close enough :(", and in Decoration
 * Mode the furniture tray covered it, so it could be neither used nor moved.
 *
 * The house and its back yard are one scene: the yard's ground is 60 px under the house's floor
 * (BACK_YARD_GROUND_Y, the house frame's bottom). A stack set down in the yard keeps that height,
 * and in the house game.js restingStackY kept every stack where it was saved (furniture tops are
 * not lines). Once the house stood over the spot (the yard was un-expanded, or online the shared
 * stacks, which do not move with the house, G1190) the stack lay under the floor: the floor line
 * was between the avatar and it (reach.js behindFloor), and Decoration Mode scrolls down only to
 * the floor's front edge over the tray.
 *
 * In the original nothing lay under a room's floor: a stack set down fell to the plat under it
 * (HandOfDecorator.as calculateTargetPlatformLineForRegStackFromPt) and the floor is the lowest
 * plat. Now a stack under every line at its x comes up onto the lowest line over it
 * (walk-surface.js underFloorRestY): drawn there (restingStackY, the owner's and the shared ones),
 * saved there (homes-feature settleRoomStacks), and picked there in Decoration Mode (roomStacks).
 *
 * Run: node --test tests/home-under-floor-728.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STACK_SINK_PX, underFloorRestY } from '../public/js/walk-surface.js?v=76def2f6';
import { BACK_YARD_GROUND_Y, housePlatforms, settleStacksOntoFloor } from '../public/js/features/homes-feature.js?v=86da0fc9';
import { createHomeDecorState, INTERIOR, interiorWidth } from '../public/js/home-decor.js?v=3a84d959';
import { roomPieces } from '../public/js/home-wallpaper.js?v=5d3594e4';
import { avatarHitBox, behindFloor } from '../public/js/reach.js?v=456da8a8';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public', 'game.js'), 'utf8');

/** The house as the player's: a back yard 900 px wide, then the room (homes-feature interiorBackground). */
const X0 = 900;
const decor = createHomeDecorState({});
const room = roomPieces(decor, { floorY: INTERIOR.floorY, leftOpen: true });
const lines = housePlatforms(room, X0, X0 + interiorWidth(decor));

/** game.js restingStackY's rule in the house: where a stack saved at (x, y) is drawn. */
const drawnY = (x, y) => underFloorRestY(lines, x, y) ?? y;

/** A Play Cube's box with its foot at (x, y) (its world art is about 32 x 32). */
const cubeBox = (x, y) => ({ left: x - 16, right: x + 16, top: y - 32, bottom: y });

describe('#728: a stack under the house floor', () => {
  it('the yard is 60 px under the floor, and the floor is the only line in the room', () => {
    assert.equal(BACK_YARD_GROUND_Y, INTERIOR.floorY + 60);
    assert.deepEqual(lines.map((p) => p.id), ['home-yard', 'home-yard-ramp', 'home-floor']);
  });

  it('the player\'s Play Cube: drawn on the floor, and in reach of the avatar standing beside it', () => {
    const x = X0 + 300;
    const y = BACK_YARD_GROUND_Y;
    assert.equal(drawnY(x, y), INTERIOR.floorY, 'up onto the floor, not in the soil band');
    const feet = INTERIOR.floorY;
    const body = { x: x - 40, y: feet - 61 };
    const hitBox = avatarHitBox(x - 200, feet);
    assert.equal(behindFloor(lines, body, cubeBox(x, y), null, { feetY: feet, hitBox }), true, 'where it was saved the floor is between them');
    assert.equal(behindFloor(lines, body, cubeBox(x, drawnY(x, y)), null, { feetY: feet, hitBox }), false, 'where it is drawn now: "Could not get close enough" no more');
  });

  it('everything a line holds stays where it was set', () => {
    assert.equal(underFloorRestY(lines, X0 - 300, BACK_YARD_GROUND_Y), null, 'on the yard\'s ground');
    assert.equal(underFloorRestY(lines, X0 + 300, INTERIOR.floorY), null, 'on the floor');
    assert.equal(underFloorRestY(lines, X0 + 300, INTERIOR.floorY + STACK_SINK_PX), null, 'a few px into it');
    assert.equal(underFloorRestY(lines, X0 + 300, INTERIOR.floorY - 180), null, 'on a shelf or a table over the floor');
    assert.equal(underFloorRestY(lines, X0 + 20, 655), null, 'on the ramp');
    assert.equal(Math.round(underFloorRestY(lines, X0 + 20, BACK_YARD_GROUND_Y)), 648, 'under the ramp: up onto it');
    assert.equal(underFloorRestY(lines, X0 + interiorWidth(decor) + 50, 700), null, 'past every line: no line to come up to');
    assert.equal(underFloorRestY(lines, Number.NaN, 700), null);
  });

  it('the save\'s own stacks under the floor come up and stay up (settleRoomStacks, R57 settleStacksOntoFloor); stacks on a piece are the piece\'s', () => {
    const rows = [
      { id: 'world-item-1', classTsid: 'play_cube', count: 1, x: X0 + 300, y: BACK_YARD_GROUND_Y },
      { id: 'world-item-2', classTsid: 'cherry', count: 4, x: X0 - 300, y: BACK_YARD_GROUND_Y },
      { id: 'world-item-3', classTsid: 'apple', count: 1, x: X0 + 400, y: 560, on: 7 },
      { id: 'world-item-4', classTsid: 'grain', count: 2, x: X0 + 500, y: INTERIOR.floorY },
    ];
    assert.equal(settleStacksOntoFloor(rows, lines), 1);
    assert.deepEqual(rows.map((r) => r.y), [INTERIOR.floorY, BACK_YARD_GROUND_Y, 560, INTERIOR.floorY]);
    assert.equal(settleStacksOntoFloor(rows, lines), 0, 'once');
  });

  it('the game draws the house\'s stacks (the owner\'s, the shared ones, a visitor\'s view) through that rule', () => {
    // R57 (tests/r728-floor-moves.test.js): a room's stacks settle onto the floor, up or down.
    const at = game.indexOf('function restingStackY(');
    const fn = game.slice(at, game.indexOf('\nfunction ', at + 10));
    assert.match(fn, /restingStackYAt\(streetPlatforms, x, y, \{ place: homeStackPlace\(\), on: stack\?\.on \?\? null \}\)/);
    const homes = readFileSync(join(root, 'public', 'js', 'features', 'homes-feature.js'), 'utf8');
    // #772: the room's furniture lines join the floor; they hold no items (item_perm 0), so stacks settle as before.
    assert.match(homes, /root\.platformsScreen = housePlatforms\(room, x0, width, decor\);/);
    assert.match(homes, /settleStacks\(decor, rows, roomX0\(\)\) \+ settleStacksOntoFloor\(rows, scene\.background\?\.platformsScreen, decor, roomX0\(\)\)/);
    assert.match(homes, /restingStackYAt\(lines, Number\(row\.x\), Number\(row\.y\), \{ place: 'room' \}\)/, 'Decoration Mode picks a shared stack where it is drawn');
  });
});
