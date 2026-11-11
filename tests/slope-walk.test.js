/**
 * Walking down a slope stays on it (Baby Steppes, 2026-10-28: "walking down the hill
 * looks choppy"). The loop below is game.js physics() for a walking avatar: gravity
 * 0.42 px/frame², the street ground resolve (snap 16), the floor snap, the 2 px
 * airborne rule, and since this fix the slope stick (js/slope-walk.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SLOPE_STICK, holdCloseToFloor, stickToSlope } from '../public/js/slope-walk.js?v=9af1e505';
import { isStandable, platformYAt, platformsScreen, resolveGround } from '../public/js/street-model.js?v=b6cb6a4e';
import { NORMAL_BUFF, avatarGround, stepAvatar } from '../public/js/avatar-step.js?v=43b1182e';
import { convertLocationXml } from '../public/js/location-xml.js?v=a4db2433';
import { avatarAnimState } from '../public/js/avatar-anims.js?v=fb921bf4';
import { landingY } from '../public/js/walk-surface.js?v=106bfdc5';

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

  it('game.js uses both in the physics loop (js/avatar-step.js stepAvatar) and the animation pick', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const step = readFileSync(join(root, 'public/js/avatar-step.js'), 'utf8');
    assert.match(game, /import \{ holdCloseToFloor \} from '\.\/js\/slope-walk\.js\?v=[0-9a-f]{8}';/);
    assert.match(step, /import \{ stickToSlope \} from '\.\/slope-walk\.js\?v=[0-9a-f]{8}';/);
    assert.match(game, /stepAvatar\(player, \{/);
    assert.match(step, /const wasGrounded = body\.onGround === true;[\s\S]{0,400}avatarFall\(body, buff, dt\);/);
    assert.match(step, /body\.vy \+= GRAVITY \* \(buff\.gravity \?\? 1\) \* dt;/);
    assert.match(step, /stickToSlope\(\{ wasGrounded, vy: body\.vy, dx: body\.x - prevX, feetY: body\.y, groundY: floor \}\)/);
    assert.match(game, /holdCloseToFloor\(avatarAnimState\(/);
  });
});

/**
 * Ticket 98 (Guillermo Gamera Way, world x 709, y -136): "some invisible ledge. I got here by
 * jumping". The street's lines are Tiny Speck's own, and none is there; the ledge was the floor
 * resolve's seam fallback, which read a near line at its middle height, not at x. Over the low
 * half of a sloped flight that middle is in the air, and a fall stopped on it (146 of 1,475
 * streets, every sloped line steep enough). The fallback now reads the line at x.
 */
describe('a fall lands on a sloped line, never at its middle height (ticket 98)', () => {
  const streetsDir = join(root, 'public/assets/streets');
  const xmlRoot = join(root, '../streets/mnt/stos/location_data');
  const gamera = JSON.parse(readFileSync(join(streetsDir, 'GM4109NI2R640.json'), 'utf8'));
  const toWorld = (s, y) => Math.round(y + s.bounds.t);

  /** Drop the avatar from `above` px over the highest line at world x; the world y it lands at. */
  function dropAt(s, wx, above = 120) {
    const plats = platformsScreen(s);
    const x = wx - s.bounds.l;
    const top = Math.min(...plats.filter(isStandable).map((p) => platformYAt(p, x, 0)).filter((y) => y != null));
    const body = { x, y: top - above, vx: 0, vy: 0, onGround: false };
    const ctx = { dt: 1, buff: NORMAL_BUFF, platforms: plats, barriers: [], worldW: s.bounds.r - s.bounds.l, ground: (gx, gy, vy) => avatarGround(plats, gx, gy, vy ?? 0, { street: s }) };
    for (let i = 0; i < 240 && !body.onGround; i++) stepAvatar(body, ctx);
    assert.ok(body.onGround, `landed at x ${wx}`);
    return toWorld(s, body.y);
  }

  it('the street\'s lines are the source\'s: no line at the reported spot', { skip: !existsSync(join(xmlRoot, 'GM4109NI2R640.xml')) }, () => {
    const source = convertLocationXml(readFileSync(join(xmlRoot, 'GM4109NI2R640.xml'), 'utf8'));
    const key = (p) => `${p.id} ${p.x1},${p.y1} ${p.x2},${p.y2} ${p.pc_perm}`;
    assert.deepEqual(gamera.platforms.map(key).sort(), source.platforms.map(key).sort());
    const at709 = gamera.platforms.map((p) => platformYAt(p, 709, 0)).filter((y) => y != null).map(Math.round);
    assert.deepEqual(at709, [-62], 'only the first flight of stairs (648,-31 to 1067,-241) is under x 709');
  });

  it('the reported spot and the second flight: the fall lands on the stairs', () => {
    // First flight pl1255147224796: its middle height is -136, the reported y.
    assert.equal(dropAt(gamera, 709), -62);
    for (let wx = 650; wx <= 860; wx += 10) assert.equal(dropAt(gamera, wx), Math.round(-31 + ((wx - 648) / 419) * -210), `first flight x ${wx}`);
    // Second flight pl1255147304537 (1351,-241 to 1599,-427): the "similar spot on the stairs", middle -334.
    for (let wx = 1355; wx <= 1470; wx += 5) assert.equal(dropAt(gamera, wx), Math.round(-241 + ((wx - 1351) / 248) * -186), `second flight x ${wx}`);
  });

  it('every street: a floor away from the feet is a line\'s height at x, not a height in the air', () => {
    let checked = 0;
    const bad = [];
    for (const f of readdirSync(streetsDir)) {
      if (!f.endsWith('.json')) continue;
      const s = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
      if (!s?.bounds || !Array.isArray(s.platforms) || !s.platforms.length) continue;
      const plats = platformsScreen(s);
      const stand = plats.filter(isStandable);
      for (const p of stand) {
        const rise = Math.abs(p.y2 - p.y1);
        if (rise < 60) continue; // too flat for a middle height to leave the line's snap
        for (let i = 1; i < 8; i++) {
          const x = p.x1 + ((p.x2 - p.x1) * i) / 8;
          const lineY = platformYAt(p, x, 0);
          for (const above of [45, 60, 75]) {
            const feet = lineY - above;
            const floor = avatarGround(plats, x, feet, 2, { street: s });
            checked++;
            if (floor <= feet) continue; // at or over the feet: a snap up onto a line, not a ledge in the air
            const onLine = stand.some((q) => {
              const lo = Math.min(q.x1, q.x2);
              const hi = Math.max(q.x1, q.x2);
              if (x < lo - 8 || x > hi + 8) return false;
              // At x (resolveGround reads 4 px past a line's end along it) or at the nearer end.
              const along = platformYAt(q, x);
              return Math.abs(platformYAt(q, Math.min(hi, Math.max(lo, x)), 0) - floor) < 1 || (along != null && Math.abs(along - floor) < 1);
            });
            // Or the street's bottom: no line near at all, or a hole over a buried signpost.
            const bottom = Math.max(...plats.map((q) => Math.max(q.y1, q.y2)));
            const hole = (s.bounds.b ?? 0) - s.bounds.t;
            if (!onLine && floor !== bottom && floor !== hole && bad.length < 5) bad.push(`${s.tsid} ${p.id} x ${Math.round(x + s.bounds.l)} floor ${toWorld(s, floor)}`);
          }
        }
      }
    }
    assert.ok(checked > 10000, `checked ${checked}`);
    assert.deepEqual(bad, []);
  });
});
