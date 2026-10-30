/**
 * Walking down a slope stays on it (Baby Steppes, 2026-10-28: "walking down the hill
 * looks choppy"). The loop below is game.js physics() for a walking avatar: gravity
 * 0.42 px/frame², the street ground resolve (snap 16), the floor snap, the 2 px
 * airborne rule, and since this fix the slope stick (js/slope-walk.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SLOPE_STICK, holdCloseToFloor, stickToSlope } from '../public/js/slope-walk.js?v=9af1e505';
import { platformsScreen, resolveGround } from '../public/js/street-model.js?v=606bae73';
import { avatarAnimState } from '../public/js/avatar-anims.js?v=fb921bf4';
import { landingY } from '../public/js/walk-surface.js?v=c4aff42f';

const root = join(import.meta.dirname, '..');
const babySteppes = JSON.parse(readFileSync(join(root, 'public/assets/streets/GM416LNIKVLM1.json'), 'utf8'));
const platforms = platformsScreen(babySteppes);
// The hill under the Guillermo Gamera Way / Ruta Asuncion signpost (0.36 down to the left).
const hill = platforms.find((p) => p.id === '_pl1275604030139');

const groundAt = (plats, x, y, vy) => resolveGround(plats, x, y, vy, 16)?.y ?? Infinity;

/**
 * Walk `frames` frames at vx px/frame from (x, y) on the floor, like game.js
 * physics(). `stick: false` is the loop before the fix. Returns per-frame rows.
 */
function walk(plats, { x, y, vx, frames, dt = 1, stick = true, jumpAt = -1 }) {
  const p = { x, y, vy: 0, onGround: true };
  const rows = [];
  for (let f = 0; f < frames; f++) {
    if (f === jumpAt && p.onGround) { p.vy = -9.6; p.onGround = false; }
    const wasGrounded = p.onGround;
    p.vy += 0.42 * dt;
    const prevX = p.x;
    p.x += vx * dt;
    p.y += p.vy * dt;
    const ground = groundAt(plats, p.x, p.y, p.vy);
    if (p.y >= ground && p.vy >= 0) { p.y = ground; p.vy = 0; p.onGround = true; }
    else if (stick && stickToSlope({ wasGrounded, vy: p.vy, dx: p.x - prevX, feetY: p.y, groundY: ground })) {
      p.y = ground; p.vy = 0; p.onGround = true;
    } else if (p.y < ground - 2) p.onGround = false;
    // Height of the feet over the floor under them.
    rows.push({ ...p, gap: (landingY(plats, p.x, p.y) ?? Infinity) - p.y });
  }
  return rows;
}

/** The top floor at x (one floor per x on these lines). */
const floorAt = (plats, x) => landingY(plats, x, -1e9);

const steps = (rows) => rows.slice(1).map((r, i) => r.y - rows[i].y);

describe('walking down a slope (js/slope-walk.js)', () => {
  it('Baby Steppes: the hill is the 0.36 slope under the signpost', () => {
    assert.ok(hill, 'hill platform');
    const slope = (hill.y1 - hill.y2) / (hill.x2 - hill.x1);
    assert.ok(Math.abs(Math.abs(slope) - 0.36) < 0.01, `slope ${slope}`);
  });

  it('before the fix the avatar hopped down the hill: off the floor 4 frames in 7', () => {
    const rows = walk(platforms, { x: 5900, y: hill.y1 + (5900 - hill.x1) * (hill.y2 - hill.y1) / (hill.x2 - hill.x1), vx: -4.4, frames: 70, stick: false });
    const air = rows.filter((r) => !r.onGround).length;
    assert.ok(air >= 35, `airborne ${air}`);
    assert.ok(Math.max(...rows.map((r) => r.gap)) > 2, 'floats over 2 px');
  });

  it('stays on the floor every frame with an even descent, at 60 fps and on slow frames', () => {
    for (const dt of [1, 2.5]) {
      const startX = 5900;
      const startY = hill.y1 + (startX - hill.x1) * (hill.y2 - hill.y1) / (hill.x2 - hill.x1);
      const rows = walk(platforms, { x: startX, y: startY, vx: -4.4, frames: Math.round(60 / dt), dt });
      assert.ok(rows.every((r) => r.onGround), `dt ${dt}: grounded every frame`);
      assert.ok(rows.every((r) => Math.abs(r.gap) < 1e-6), `dt ${dt}: feet on the line`);
      const dy = steps(rows.filter((r) => r.x > hill.x1 + 8));
      const expected = 4.4 * dt * 0.3596;
      for (const d of dy) assert.ok(Math.abs(d - expected) < 0.02, `dt ${dt}: step ${d} vs ${expected}`);
    }
  });

  it('walks the whole hill down to the flat without leaving the floor', () => {
    const startY = floorAt(platforms, 5950);
    const rows = walk(platforms, { x: 5950, y: startY, vx: -4.4, frames: 400 });
    assert.ok(rows.at(-1).x < 4500);
    assert.equal(rows.filter((r) => !r.onGround).length, 0);
  });

  it('uphill and flat walking are unchanged', () => {
    for (const [x, vx] of [[4700, 4.4], [300, 4.4]]) {
      const y = floorAt(platforms, x);
      const a = walk(platforms, { x, y, vx, frames: 90, stick: false });
      const b = walk(platforms, { x, y, vx, frames: 90 });
      assert.deepEqual(b.map((r) => r.y), a.map((r) => r.y));
      assert.ok(b.every((r) => r.onGround));
    }
  });

  it('a jump from the slope still leaves it and lands', () => {
    const y = floorAt(platforms, 5900);
    const rows = walk(platforms, { x: 5900, y, vx: -4.4, frames: 80, jumpAt: 5 });
    const peak = Math.max(...rows.map((r) => r.gap));
    assert.ok(rows[10].onGround === false && rows[10].vy < 0, 'rising');
    assert.ok(peak > 90, `jump height ${peak}`);
    assert.equal(rows.at(-1).onGround, true, 'landed');
  });

  it('walking off a ledge still falls', () => {
    const ledge = [{ x1: 0, y1: 500, x2: 400, y2: 500 }, { x1: 0, y1: 700, x2: 1200, y2: 700 }];
    const rows = walk(ledge, { x: 380, y: 500, vx: 4.4, frames: 60 });
    const off = rows.findIndex((r) => r.x > 404);
    assert.equal(rows[off + 2].onGround, false, 'leaves the ledge');
    assert.ok(rows[off + 3].y > 500 && rows[off + 3].y < 520, 'falls, not snapped to the floor below');
    assert.equal(rows.at(-1).y, 700);
  });

  it('only a slope up to SLOPE_STICK is held; a cliff steeper than that still steps down in falls', () => {
    assert.equal(SLOPE_STICK, 1);
    const steep = [{ x1: 0, y1: 1000, x2: 200, y2: 600 }];
    const rows = walk(steep, { x: 190, y: 620, vx: -4.4, frames: 30 });
    assert.ok(rows.some((r) => !r.onGround));
  });

  it('stickToSlope: never while rising, never from the air, never past the step', () => {
    const base = { wasGrounded: true, vy: 0.42, dx: -4.4, feetY: 100, groundY: 101.2 };
    assert.equal(stickToSlope(base), true);
    assert.equal(stickToSlope({ ...base, wasGrounded: false }), false);
    assert.equal(stickToSlope({ ...base, vy: -9.6 }), false);
    assert.equal(stickToSlope({ ...base, groundY: 100 + 4.4 + 2.01 }), false);
    assert.equal(stickToSlope({ ...base, groundY: 99 }), false, 'a floor above is the snap, not the stick');
    assert.equal(stickToSlope({ ...base, groundY: Infinity }), false);
  });
});

describe('holdCloseToFloor (AvatarAnimationState close_limit)', () => {
  it('a short drop keeps the walk instead of flashing land', () => {
    const s = { airborne: true, vy: 150, distFromFloor: 3 };
    assert.equal(avatarAnimState(s, 'walk2x'), 'land');
    assert.equal(holdCloseToFloor(avatarAnimState(s, 'walk2x'), 'walk2x', s), 'walk2x');
  });

  it('a real fall or rise still changes state', () => {
    assert.equal(holdCloseToFloor('fall', 'walk2x', { airborne: true, vy: 150, distFromFloor: 200 }), 'fall');
    assert.equal(holdCloseToFloor('land', 'walk2x', { airborne: true, vy: 600, distFromFloor: 150 }), 'land');
    assert.equal(holdCloseToFloor('lift', 'walk2x', { airborne: true, vy: -400, distFromFloor: 2 }), 'lift');
    assert.equal(holdCloseToFloor('walk2x', 'land', { airborne: false, vy: 0, distFromFloor: 0 }), 'walk2x');
    assert.equal(holdCloseToFloor('fall', 'walk2x', { airborne: true, vy: 150, distFromFloor: null }), 'fall');
  });

  it('game.js uses both in the physics loop and the animation pick', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /import \{ holdCloseToFloor, stickToSlope \} from '\.\/js\/slope-walk\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /const wasGrounded = player\.onGround === true;[\s\S]{0,400}player\.vy \+= 0\.42 \* movementBuff\.gravity \* dt;/);
    assert.match(game, /stickToSlope\(\{ wasGrounded, vy: player\.vy, dx: player\.x - prevX, feetY: player\.y, groundY: ground \}\)/);
    assert.match(game, /holdCloseToFloor\(avatarAnimState\(/);
  });
});
