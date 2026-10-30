/**
 * Undersides (platform pc_perm 1) are ceilings, never floors, and a wall
 * rising from an underside's end never pins an avatar pressed under it.
 *
 * Purplysa (GHVP7QOKT403F5Q, Underground Puzzles, pc_scale 0.41): Austin's
 * avatar floated (gravity pad) under the slab plat_1337125697373 (x 708..961,
 * y -341) and stuck at its bottom-left corner: the wall check used an 80 px
 * body against a 0.41-scale avatar, so wall_1337125697372 (x 708, y -407..-341)
 * overlapped a head that was really 16 px under the slab. Elsewhere a jump
 * into an underside landed the avatar on it (every line was a one-way floor).
 *
 * Source rules (PlatformLine.as / GSJS geo_modify_plat_pc_perms): platform
 * pc_perm -1 solid from the top only, 1 solid from the bottom only (a rising
 * head stops under it, a falling avatar drops through), 0 soft both ways,
 * null hard both ways.
 *
 * Run: node --test tests/underside-corners.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  platformsScreen,
  barriersScreen,
  blockBarrierCrossing,
  resolveGround,
  groundBeneath,
  headCeiling,
  avatarHeadReach,
  isStandable,
  platformYAt,
  worldToScreen,
} from '../public/js/street-model.js?v=606bae73';

const __dirname = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(__dirname, '../public/assets/streets');
const readStreet = (tsid) => JSON.parse(readFileSync(join(streetsDir, `${tsid}.json`), 'utf8'));

const BODY_H = 80; // game.js AVATAR_BODY_H (walls); ceilings use avatarHeadReach
/** Feet under a ceiling while reversed gravity pins the head there (puzzles-feature avatarHeight: 0.85 x the ~137 px avatar). */
const pinHeight = (scale) => 0.85 * 137 * scale;

/**
 * game.js physics() for one frame of the walking branch, in its order:
 * gravity, move, head against undersides, walls, ground. The ground fallback
 * (lowest standable line near x) stands in for game.js resolveGround's.
 */
function step(geo, pl, { left = false, right = false, gravity = 1 } = {}) {
  const { plats, bars, bodyH, head: headReach } = geo;
  if (left) pl.vx = -2.8;
  else if (right) pl.vx = 2.8;
  else pl.vx = 0;
  pl.vy += 0.42 * gravity;
  const prevX = pl.x;
  const prevY = pl.y;
  pl.x += pl.vx;
  pl.y += pl.vy;
  const head = headCeiling(plats, prevX, prevY, pl.x, pl.y, headReach);
  if (head != null) {
    pl.y = head;
    if (pl.vy < 0) pl.vy = 0;
  }
  const walled = blockBarrierCrossing(bars, prevX, pl.x, pl.y, bodyH);
  if (walled !== pl.x) {
    pl.x = walled;
    pl.vx = 0;
  }
  const hit = resolveGround(plats, pl.x, pl.y, pl.vy, 16);
  let ground = hit?.y;
  if (ground == null) {
    ground = Math.max(...plats.filter((p) => isStandable(p) && platformYAt(p, pl.x, 8) != null).map((p) => (p.y1 + p.y2) / 2));
    if (!(pl.y >= ground - 80)) ground = Infinity;
  }
  if (pl.y >= ground && pl.vy >= 0) {
    pl.y = ground;
    pl.vy = 0;
    pl.onGround = true;
    pl.on = hit?.platform?.id ?? 'fallback';
  } else if (pl.y < ground - 2) pl.onGround = false;
  return pl;
}

const purplysa = readStreet('GHVP7QOKT403F5Q');
const scale = purplysa.physics.setting.pc_scale;
const geo = { plats: platformsScreen(purplysa), bars: barriersScreen(purplysa), bodyH: BODY_H * scale, head: avatarHeadReach(scale) };
const P = (wx, wy) => worldToScreen(purplysa, wx, wy);
const byId = (id) => geo.plats.find((p) => p.id === id);
const slab = byId('plat_1337125697373'); // underside x 708..961, y -341
const smallSlab = byId('plat_1337125697389'); // underside x 804..963, y -116
const floor = P(0, -26).y; // plat_1337125697384, x 698..1070

describe('platform pc_perm carried into collision', () => {
  it('reads the source perms', () => {
    assert.equal(scale, 0.41);
    assert.equal(slab.pcPerm, 1);
    assert.equal(byId('plat_1337125697371').pcPerm, -1, 'the slab top is a floor');
    assert.equal(isStandable(slab), false);
    assert.equal(isStandable(byId('plat_1337125697371')), true);
    assert.equal(isStandable({ x1: 0, y1: 0, x2: 10, y2: 0 }), true, 'hand-built scene lines (no pcPerm) stay floors');
    assert.equal(isStandable({ x1: 0, y1: 0, x2: 10, y2: 0, pcPerm: null }), true);
  });
});

describe('an underside is never ground', () => {
  it('feet just under an underside do not snap up onto it', () => {
    for (const vy of [0, 0.4, 3]) {
      const hit = resolveGround(geo.plats, P(880, 0).x, smallSlab.y1 + 4, vy, 16);
      assert.ok(!hit || hit.platform.pcPerm !== 1, `vy ${vy}: landed on ${hit?.platform.id}`);
    }
  });

  it('a falling avatar drops through an underside to the floor below', () => {
    const hit = resolveGround(geo.plats, P(880, 0).x, smallSlab.y1 + 2, 6, 16);
    assert.equal(hit, null);
    const pl = { x: P(880, 0).x, y: smallSlab.y1 - 2, vx: 0, vy: 0, onGround: false };
    for (let i = 0; i < 90; i++) step(geo, pl);
    assert.equal(pl.y, floor);
  });

  it('NPC ground skips undersides too', () => {
    const g = groundBeneath(geo.plats, P(880, 0).x, smallSlab.y1 - 1, 6);
    assert.notEqual(g.platform.pcPerm, 1);
  });
});

describe('a rising head stops under an underside', () => {
  it('a jump under the small slab bumps its underside and falls back to the floor', () => {
    const pl = { x: P(880, 0).x, y: floor, vx: 0, vy: -9.6, onGround: false };
    let top = Infinity;
    for (let i = 0; i < 120; i++) {
      step(geo, pl);
      top = Math.min(top, pl.y);
    }
    assert.ok(Math.abs(top - (smallSlab.y1 + geo.head.reach)) < 0.5, `head stopped at the underside (feet ${top})`);
    assert.equal(pl.y, floor);
    assert.equal(pl.onGround, true);
  });

  it('a jump-through floor (pc_perm -1) still lets the head pass', () => {
    const ledge = { id: 'ledge', x1: 0, y1: 500, x2: 200, y2: 500, pcPerm: -1 };
    assert.equal(headCeiling([ledge], 100, 560, 100, 550, 80), null);
    const under = { ...ledge, pcPerm: 1 };
    assert.equal(headCeiling([under], 100, 590, 100, 570, 80), 580);
  });

  it('brushing an underside end does not catch the avatar beside it', () => {
    const under = { id: 'u', x1: 100, y1: 500, x2: 300, y2: 500, pcPerm: 1 };
    assert.equal(headCeiling([under], 99, 590, 101, 570, 80), null);
    assert.equal(headCeiling([under], 104, 590, 106, 570, 80), 580);
  });
});

describe("Purplysa's slab corner (Austin's playtest)", () => {
  const wall = geo.bars.find((w) => w.id === 'wall_1337125697372'); // x 708, y -407..-341

  it('the 708 wall rises from the underside end', () => {
    assert.equal(wall.x, slab.x1);
    assert.equal(wall.yBot, slab.y1);
  });

  it('an avatar pinned under either slab walks left past its bottom-left corner', () => {
    // wall_1337125697386 (x 804, y -161..-116) closes the small slab under plat_1337125697389.
    const smallWall = geo.bars.find((w) => w.id === 'wall_1337125697386');
    for (const [under, w] of [[slab, wall], [smallSlab, smallWall]]) {
      assert.equal(w.yBot, under.y1);
      for (const feet of [under.y1 + geo.bodyH, under.y1 + pinHeight(scale)]) {
        const x = w.x + 3;
        assert.equal(blockBarrierCrossing(geo.bars, x, x - 5, feet, geo.bodyH), x - 5, `${w.id} feet ${feet}`);
        assert.equal(blockBarrierCrossing(geo.bars, x, x - 5, feet, BODY_H), w.x + 1, `${w.id}: the 80 px body pinned it`);
      }
    }
  });

  it('the unscaled 80 px body was what pinned it', () => {
    const x = wall.x + 3;
    assert.equal(blockBarrierCrossing(geo.bars, x, x - 5, slab.y1 + pinHeight(scale), BODY_H), wall.x + 1);
  });

  it('floating up under the slab (reversed gravity) and holding left leaves the corner', () => {
    const pl = { x: wall.x + 40, y: floor, vx: 0, vy: 0, onGround: true };
    // Up to the underside, the head stops there.
    for (let i = 0; i < 200; i++) step(geo, pl, { gravity: -0.1 });
    assert.ok(Math.abs(pl.y - (slab.y1 + geo.head.reach)) < 0.5, `pressed under the slab (feet ${pl.y})`);
    for (let i = 0; i < 60; i++) step(geo, pl, { left: true, gravity: -0.1 });
    assert.ok(pl.x < wall.x - 20, `walked out past the corner (x ${pl.x})`);
    assert.ok(pl.y < slab.y1, 'and floats on up beside the slab');
  });
});

describe('every street: undersides and their corners', () => {
  const streets = [];
  for (const f of readdirSync(streetsDir)) {
    if (!f.endsWith('.json')) continue;
    let st;
    try {
      st = JSON.parse(readFileSync(join(streetsDir, f), 'utf8'));
    } catch {
      continue;
    }
    if (st?.platforms?.length && st.bounds) streets.push(st);
  }

  it('no underside is ever resolved as ground', () => {
    let lines = 0;
    const bad = [];
    for (const st of streets) {
      const plats = platformsScreen(st);
      for (const p of plats) {
        if (p.pcPerm !== 1) continue;
        lines += 1;
        const x = (p.x1 + p.x2) / 2;
        const y = platformYAt(p, x);
        for (const [dy, vy] of [[0, 0], [-1, 0], [4, 0], [10, 0], [2, 5]]) {
          const hit = resolveGround(plats, x, y + dy, vy, 16);
          if (hit?.platform.pcPerm === 1) bad.push(`${st.tsid} ${p.id} dy ${dy}`);
        }
      }
    }
    assert.ok(lines > 2000, `undersides checked: ${lines}`);
    assert.deepEqual(bad.slice(0, 10), []);
  });

  it('a wall rising from an underside end never pins an avatar pressed under it', () => {
    let corners = 0;
    const bad = [];
    for (const st of streets) {
      const s = st.physics?.setting?.pc_scale > 0 ? st.physics.setting.pc_scale : 1;
      const bodyH = BODY_H * s;
      const plats = platformsScreen(st);
      const bars = barriersScreen(st);
      for (const p of plats) {
        if (p.pcPerm !== 1) continue;
        for (const [ex, ey, out] of [[p.x1, p.y1, -1], [p.x2, p.y2, 1]]) {
          for (const w of bars) {
            if (Math.abs(w.x - ex) > 3 || !(w.yTop < ey - 4) || Math.abs(w.yBot - ey) > 12) continue;
            corners += 1;
            const x = w.x - out * 3;
            const feet = ey + Math.max(pinHeight(s), bodyH + Math.max(0, w.yBot - ey));
            if (blockBarrierCrossing(bars, x, x + out * 6, feet, bodyH) !== x + out * 6) {
              bad.push(`${st.label} (${st.tsid}) ${p.id} / ${w.id}`);
            }
          }
        }
      }
    }
    assert.ok(corners > 700, `corners checked: ${corners}`);
    assert.deepEqual(bad.slice(0, 10), []);
  });
});

describe('game.js runs these rules', () => {
  const src = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
  it('scales the body, bumps heads on undersides and skips them as ground', () => {
    assert.match(src, /blockBarrierCrossing\(barriersScreen\(currentStreet\), prevX, player\.x, player\.y, bodyH\)/);
    assert.match(src, /headCeiling\(streetPlatforms, prevX, prevY, player\.x, player\.y, head\)/);
    assert.match(src, /features\.query\('avatarBodyScale', engine\)/);
    assert.match(src, /const head = avatarHeadReach\(bodyScale\)/);
    assert.match(src, /if \(!isStandable\(p\)\) continue;/);
  });
});
