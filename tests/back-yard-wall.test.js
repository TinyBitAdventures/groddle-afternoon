/**
 * G1225 (report #647): a Piggy from the back yard walked into the house and ate food off its floor.
 * In Glitch the house (with its back yard on the left) was one location, and inc_homes.js 1424-1431
 * put a wall at the house's left end + 8 on its ground floor, "wall to stop animals getting into
 * house": item_perm -1, solid to an animal coming from the yard and open from the house side
 * (glitch-client Wall.as 35-41), pc_perm 0 for players. npc_piggy.js onFoodPathing / onTwiceDaily
 * path to food in the location, so the wall is what kept a yard Piggy off the house's floor.
 *
 * Here: a back-yard animal's walk keeps to the yard's side (js/yard-wander.js yardWindow `wall`), and
 * a Piggy in the yard is never sent to, nor eats, food beyond it (animal-mood-feature behindWall);
 * homes-feature homeAnimalWall says where the wall is, only in the house's ground floor with a yard.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YARD_EDGE, YARD_RANGE, YARD_WALL_DX, YARD_WALL_GAP, wallBetween, yardWanderAt, yardWindow } from '../public/js/yard-wander.js?v=8f5a82ef';
import { GAME_DIR } from '../tools/repos.mjs';

const WALL = 750 + YARD_WALL_DX; // a 750 px back yard: the house starts at x 750

describe('the wall between the back yard and the house', () => {
  it('a yard animal\'s walk stops short of the wall, wherever its spot or stick is', () => {
    for (const homeX of [700, 740, 600, 300]) {
      for (const id of ['a1', 'a2', 'a3', 'a9']) {
        const w = yardWindow({ id, classId: 'npc_piggy', homeX, worldW: 2000, wall: WALL });
        assert.ok(w.right <= WALL - YARD_WALL_GAP, `${id}@${homeX}: ${w.right}`);
        assert.ok(w.left >= YARD_EDGE && w.right > w.left, `${id}@${homeX}`);
      }
    }
    const stick = yardWindow({ id: 'a1', classId: 'npc_piggy', homeX: 100, stick: { x: 600, distance: 250 }, worldW: 2000, wall: WALL });
    assert.ok(stick.right <= WALL - YARD_WALL_GAP, 'a Pig Stick near the house does not take them in');
  });

  it('its walk never crosses it, at any time', () => {
    for (let t = 0; t < 600000; t += 997) {
      const at = yardWanderAt({ id: 'p7', classId: 'npc_piggy', homeX: 720, worldW: 2000, wall: WALL }, t);
      assert.ok(at.x < WALL, `t ${t}: ${at.x}`);
    }
  });

  it('one released in the house keeps its own walk (the wall is open from the house side); no wall, nothing changes', () => {
    const inside = yardWindow({ id: 'a1', classId: 'npc_piggy', homeX: 1100, worldW: 2000, wall: WALL });
    assert.deepEqual(inside, yardWindow({ id: 'a1', classId: 'npc_piggy', homeX: 1100, worldW: 2000 }));
    assert.equal(inside.right - inside.left, 2 * YARD_RANGE);
    assert.deepEqual(yardWindow({ id: 'a1', classId: 'npc_piggy', homeX: 700, worldW: 2000, wall: null }), yardWindow({ id: 'a1', classId: 'npc_piggy', homeX: 700, worldW: 2000 }));
  });

  it('food on the house\'s floor is behind the wall for a Piggy in the yard, not for one in the house', () => {
    assert.equal(wallBetween(500, 900, WALL), true, 'yard Piggy, house food');
    assert.equal(wallBetween(500, WALL - 5, WALL), true, 'food at the wall\'s foot is on the house side');
    assert.equal(wallBetween(500, 600, WALL), false, 'yard food');
    assert.equal(wallBetween(900, 500, WALL), false, 'from the house it may walk out');
    assert.equal(wallBetween(500, 900, null), false, 'no wall (the home street, a Tower floor)');
  });

  it('the house says where the wall is, the yard\'s walks and the Piggies\' food search heed it', () => {
    const read = (f) => readFileSync(join(GAME_DIR, f), 'utf8');
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /homeAnimalWall\(engine\) \{\n\s+if \(!engine \|\| engine\.streetTsid !== HOME_INTERIOR_TSID \|\| !inHouse\(\)\) return null;\n\s+const x0 = roomX0\(\);\n\s+return x0 > 0 \? x0 \+ YARD_WALL_DX : null;/);
    assert.match(read('public/js/features/animal-husbandry-feature.js'), /wall: engine\.query\?\.\('homeAnimalWall', engine\) \?\? null,/);
    const mood = read('public/js/features/animal-mood-feature.js');
    assert.match(mood, /function startSeek\(engine, r, food\) \{\n\s+if \(!food \|\| !reachable\(r\.target\.sprite, food\.x, food\.y, engine\)\) return false;/, 'every walk to food');
    assert.match(mood, /\.filter\(\(row\) => reachable\(spr, row\.x, row\.y, engine\)\)/, 'the twice-daily search');
    assert.match(mood, /<= EAT_RADIUS && !behindWall\(engine, spr, x\);/, 'eating on arrival');
  });
});
