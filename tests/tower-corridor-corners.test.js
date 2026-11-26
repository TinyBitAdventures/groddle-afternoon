/**
 * Report #296: a player got out of the Jethimadh Tower's upper corridors, by a Spinach jump at one
 * end of a corridor. Each corridor's end is a wall whose top meets the ceiling line's end. A wall
 * holds the avatar 1 px off its face, and headCeiling skipped a line within 2 px of its end unless
 * another ceiling line joined it there, so a jump pressed into the end went up past the ceiling and
 * out over the wall (Corridor Six, both ends, in the game). The client's 15 px head circle met the
 * line at that corner (AvatarPhysicsHandler). Now an end on a wall's top closes the corner.
 *
 * Run: node --test tests/tower-corridor-corners.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NORMAL_BUFF, avatarGround, stepAvatar } from '../public/js/avatar-step.js?v=8415ee96';
import { avatarHeadReach, barriersScreen, headCeiling, platformsScreen } from '../public/js/street-model.js?v=a9a05f9d';

const here = dirname(fileURLToPath(import.meta.url));
const street = (tsid) => JSON.parse(readFileSync(join(here, `../public/assets/streets/${tsid}.json`), 'utf8'));
const CORRIDORS = { GTJ10K7P3812R8F: 'Corridor Four', GTJ10M515812V0C: 'Corridor Five', GTJ110817812KO4: 'Corridor Six' };
// Spinach's High Jumper (buffs.js): x1.7 speed, gravity x0.35; the launch held to vy_max 670 px/s.
const SPINACH = { ...NORMAL_BUFF, speed: 1.7, jump: 4.5, gravity: 0.35 };
const LAUNCH = -670 / 60;

/** The corners where a ceiling line (pc_perm 1 or null) ends on the top of a wall. */
function corners(st) {
  const plats = platformsScreen(st);
  const walls = barriersScreen(st);
  const out = [];
  for (const w of walls) {
    for (const p of plats) {
      if (!(p.pcPerm === 1 || p.pcPerm === null)) continue;
      for (const [ex, ey, ox] of [[p.x1, p.y1, p.x2], [p.x2, p.y2, p.x1]]) {
        if (Math.abs(ex - w.x) <= 1 && Math.abs(ey - w.yTop) <= 2) out.push({ wall: w, line: p, side: Math.sign(ox - ex) });
      }
    }
  }
  return { plats, walls, out };
}

describe('report 296: a Spinach jump into a corridor\'s end stays in the corridor', () => {
  for (const [tsid, label] of Object.entries(CORRIDORS)) {
    it(`${label}: every ceiling that meets an end wall stops the head there`, () => {
      const st = street(tsid);
      const { plats, walls, out } = corners(st);
      assert.ok(out.length >= 2, `${label}: both ends`);
      const head = avatarHeadReach(1);
      for (const { wall, line, side } of out) {
        // Pressed against the wall's inner face (blockBarrierCrossing leaves it 1 px off).
        const x = wall.x + side;
        const ceil = line.y1 + ((x - line.x1) / (line.x2 - line.x1)) * (line.y2 - line.y1);
        const before = ceil + head.reach + 20;
        const clamped = headCeiling(plats, x, before, x, ceil + head.reach - 15, head, 2, walls);
        assert.ok(clamped != null, `${label} ${wall.id}: the head stops under ${line.id}`);
        assert.ok(Math.abs(clamped - (ceil + head.reach)) < 2);
        // The rule before: no walls given, the corner leaked.
        assert.equal(headCeiling(plats, x, before, x, ceil + head.reach - 15, head, 2), null, `${label} ${wall.id}: leaked before`);
      }
    });

    it(`${label}: a Spinach jump held into each end wall comes back down inside`, () => {
      const st = street(tsid);
      const { plats, walls, out } = corners(st);
      const worldW = st.bounds.r - st.bounds.l;
      const worldH = st.bounds.b - st.bounds.t;
      const ground = (x, y, vy) => avatarGround(plats, x, y, vy, { street: st });
      // The corridor's own ends: the wall each end ceiling runs into, nearest the street's edge.
      const ends = out.filter(({ wall, side }) => walls.every((w) => (side > 0 ? w.x >= wall.x : w.x <= wall.x) || w === wall));
      assert.equal(ends.length, 2, `${label}: a left end and a right end`);
      for (const { wall, line, side } of ends) {
        const ceil = Math.min(line.y1, line.y2);
        // Dropped from just under the ceiling onto the floor below that corner.
        const body = { x: wall.x + side * 6, y: wall.yTop + avatarHeadReach(1).reach + 5, vx: 0, vy: 0, onGround: false };
        for (let i = 0; i < 120 && !body.onGround; i += 1) stepAvatar(body, { buff: SPINACH, platforms: plats, barriers: walls, worldW, worldH, ground });
        assert.ok(body.onGround, `${label} ${wall.id}: stands under the corner`);
        body.vy = LAUNCH;
        body.onGround = false;
        let top = Infinity;
        for (let i = 0; i < 400; i += 1) {
          body.vx = -side * 4.4 * SPINACH.speed;
          stepAvatar(body, { buff: SPINACH, platforms: plats, barriers: walls, worldW, worldH, ground });
          top = Math.min(top, body.y);
          assert.ok(side > 0 ? body.x > wall.x : body.x < wall.x, `${label} ${wall.id}: x ${body.x.toFixed(1)} past the wall at ${wall.x}`);
        }
        assert.ok(top - avatarHeadReach(1).reach >= ceil - 3, `${label} ${wall.id}: the head stayed under the ceiling (${top} vs ${ceil})`);
      }
    });
  }
});
