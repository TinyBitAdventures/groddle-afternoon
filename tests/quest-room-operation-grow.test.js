/**
 * Operation: Grow (quests/where_the_blue_grew.js): public/js/quest-rooms/operation-grow.js.
 * Source constants, the lights-out row (Mab's hint is the unique shortest
 * answer) and the geometry against the avatar's ~110 px jump.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as mod from '../public/js/quest-rooms/operation-grow.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');

describe('Operation: Grow source facts', () => {
  it('keeps the 5-minute instance and the leave flag', () => {
    assert.equal(mod.room.id, 'operation_grow');
    assert.equal(mod.EXIT_MS, 5 * 60 * 1000);
    assert.equal(mod.room.durationMs, mod.EXIT_MS);
    assert.deepEqual(mod.room.onLeave(), { leaveFlag: 'leave' });
    const file = join(GS, 'quests/where_the_blue_grew.js');
    if (existsSync(file)) {
      const src = readFileSync(file, 'utf8');
      assert.match(src, /questInstanceLocation\(pc, 'operation_grow', -957, -138, 5\*60/);
      assert.match(src, /"name"\t\t: "solved_puzzle"/);
      assert.match(src, /this\.set_flag\(pc, 'leave'\)/);
    }
  });
});

describe('Operation: Grow puzzle', () => {
  it('tends a patch and its two neighbours', () => {
    assert.deepEqual(mod.tend(mod.startState(), 0), [true, true, false, false, false, false, false]);
    assert.deepEqual(mod.tend(mod.startState(), 3), [false, false, true, true, true, false, false]);
    assert.deepEqual(mod.tend(mod.tend(mod.startState(), 5), 5), mod.startState());
  });

  it("starts all gloom and Mab's three patches are the one shortest answer", () => {
    const s0 = mod.startState();
    assert.equal(mod.solved(s0), false);
    assert.equal(mod.bloomFraction(s0), 0);
    assert.deepEqual(mod.fewestTends(s0), [...mod.HINT_PATCHES]);
    let s = s0;
    for (const i of mod.HINT_PATCHES) s = mod.tend(s, i);
    assert.ok(mod.solved(s));
    // Order does not matter.
    s = s0;
    for (const i of [...mod.HINT_PATCHES].reverse()) s = mod.tend(s, i);
    assert.ok(mod.solved(s));
    // Exactly one press set of the 128 solves it.
    let answers = 0;
    for (let m = 0; m < 128; m++) {
      let t = s0;
      for (let i = 0; i < 7; i++) if (m & (1 << i)) t = mod.tend(t, i);
      if (mod.solved(t)) answers += 1;
    }
    assert.equal(answers, 1);
    assert.match(mod.HINT_TEXT, /first.*middle.*last/);
  });
});

describe('Operation: Grow geometry', () => {
  const F = mod.GROW_FACTS;

  it("puts Mab's note on banks one jump apart and the patches on the floor", () => {
    const plats = mod.growPlatforms();
    const [b1, b2] = mod.BANKS;
    assert.ok(F.FLOOR - b1.y <= F.JUMP_RISE);
    assert.ok(b1.y - b2.y <= F.JUMP_RISE);
    assert.ok(b1.x1 - b2.x2 <= F.JUMP_GAP);
    assert.ok(mod.HINT.x >= b2.x1 && mod.HINT.x <= b2.x2 && mod.HINT.y === b2.y);
    for (let i = 0; i < mod.PATCHES; i++) {
      const x = mod.patchX(i);
      assert.ok(x > mod.BANKS[0].x2 && x < mod.EXIT.x - 100, `patch ${i} at ${x}`);
    }
    assert.ok(plats.some((p) => p.id === 'og_floor' && p.x1 === 0 && p.x2 === F.W));
    assert.ok(mod.SPAWN.x > mod.BANKS[0].x2 && mod.SPAWN.x < mod.patchX(0));
  });

  it('ships its art: the Snap\'s Firebog stalks, baobabs, boulders and orb glow', async () => {
    const { OPERATION_GROW_FILES } = await import('../public/js/operation-grow-art.js');
    const scene = await import('../public/js/operation-grow-scene.js');
    const plan = JSON.parse(readFileSync(join(root, 'tools/room-art/operation_grow.json'), 'utf8'));
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(OPERATION_GROW_FILES).sort());
    for (const name of ['plants1', 'plants1_blue', 'magic_mushroom_light_blue', 'bottletree_silhouette_blue', 'bg2_tree1_dusk']) {
      assert.ok(OPERATION_GROW_FILES[name], name);
    }
    // The blue stalk is plants1 recoloured, not new art.
    assert.equal(plan.pieces.plants1_blue.swf, 'bundle:firebog.swf#plants1');
    assert.ok(plan.pieces.plants1_blue.ramp.length >= 3);
    for (const [file] of Object.values(OPERATION_GROW_FILES)) {
      assert.ok(existsSync(join(root, 'public', scene.GROW_ART_DIR, file)), file);
    }
    // 15 orbs, all inside the stalk's 78 x 232 world box.
    assert.equal(scene.STALK_ORBS.length, 15);
    const [, w, h] = OPERATION_GROW_FILES.plants1;
    for (const [dx, dy] of scene.STALK_ORBS) assert.ok(Math.abs(dx) <= w / 2 && dy < 0 && -dy <= h, `${dx},${dy}`);
    for (const f of [
      'assets/decos/groddle/gravel_1.webp', 'assets/decos/groddle/backhill3_blue.webp',
      'assets/decos/groddle/ground_spots_dark_1.webp', 'assets/decos/groddle/firebog_sign_blank_plank.webp',
      mod.room.icon,
    ]) assert.ok(existsSync(join(root, 'public', f)), f);
  });
});
