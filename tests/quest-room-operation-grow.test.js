/**
 * Operation: Grow (quests/where_the_blue_grew.js): public/js/quest-rooms/operation-grow.js.
 * Source constants, the lights-out row (Mab's hint is the unique shortest
 * answer) and the two-tier layout from the Snaps (G109).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as mod from '../public/js/quest-rooms/operation-grow.js?v=g458-1';

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

describe('Operation: Grow geometry (G109: two tiers from the Snaps)', () => {
  const F = mod.GROW_FACTS;

  it('lays the field over a root tunnel, joined by a ladder', () => {
    const plats = mod.growPlatforms();
    const field = plats.find((p) => p.id === 'og_floor');
    const tunnel = plats.find((p) => p.id === 'og_tunnel');
    assert.ok(field && field.x1 === 0 && field.x2 === F.W && field.y1 === F.FLOOR);
    assert.ok(tunnel && tunnel.x1 === mod.TUNNEL_X1 && tunnel.x2 === mod.TUNNEL_X2 && tunnel.y1 === F.TUNNEL);
    // The slab between them, then a tunnel tall enough to walk in, and the floor over the room's bottom.
    assert.ok(F.FLOOR < F.CEILING && F.CEILING < F.TUNNEL && F.TUNNEL <= F.H - 80);
    assert.ok(F.TUNNEL - F.CEILING >= 200, 'tunnel headroom');
    // Too far apart to jump: the ladder is the way down and back up.
    assert.ok(F.TUNNEL - F.FLOOR > F.JUMP_RISE * 2);
    const [wall] = mod.growWalls();
    assert.equal(wall.x, mod.LADDER.x);
    assert.ok(wall.yTop < F.FLOOR && F.FLOOR - wall.yTop <= 48, 'ladder top just over the field');
    assert.equal(wall.yBot, F.TUNNEL);
    assert.ok(wall.x > mod.TUNNEL_X1 + 30 && wall.x < mod.SPAWN.x, 'ladder inside the tunnel, left of the start');
    // The tunnel's end walls block only the tunnel tier.
    const walls = mod.growBarriers();
    assert.deepEqual(walls.map((w) => w.x), [mod.TUNNEL_X1, mod.TUNNEL_X2]);
    for (const w of walls) assert.ok(w.y === F.CEILING && w.y + w.h === F.TUNNEL && w.y > F.FLOOR);
  });

  it('puts the patches on the field, Mab\'s sign by the big hut and the way out in the tunnel', () => {
    assert.equal(mod.SPAWN.y, F.FLOOR);
    for (let i = 0; i < mod.PATCHES; i++) {
      const x = mod.patchX(i);
      assert.ok(x > mod.SPAWN.x && x < mod.HUT_X - 200, `patch ${i} at ${x}`);
    }
    assert.deepEqual([...mod.PATCH_XS], Array.from({ length: mod.PATCHES }, (_, i) => mod.patchX(i)));
    assert.ok(mod.HINT.y === F.FLOOR && mod.HINT.x > mod.HUT_X && mod.HINT.x < F.W - 60);
    // The door at the tunnel's right end (the Snaps' EXIT), out of reach from the field.
    assert.equal(mod.EXIT.y, F.TUNNEL);
    assert.ok(mod.EXIT.x < mod.TUNNEL_X2 && mod.TUNNEL_X2 - mod.EXIT.x < 100);
    assert.ok(mod.EXIT.y - F.FLOOR > 150, 'the exit cannot be used from the field');
    // A patch cannot be tended from the tunnel under it (tendPatch's 140 px reach).
    assert.ok(F.TUNNEL - F.FLOOR > 140);
  });

  it('ships its art: the Snaps\' Firebog stalks, huts, pots, roots, earth, door and ladder', async () => {
    const { OPERATION_GROW_FILES } = await import('../public/js/operation-grow-art.js');
    const scene = await import('../public/js/operation-grow-scene.js?v=g458-1');
    const plan = JSON.parse(readFileSync(join(root, 'tools/room-art/operation_grow.json'), 'utf8'));
    assert.deepEqual(Object.keys(plan.pieces).sort(), Object.keys(OPERATION_GROW_FILES).sort());
    const expect = {
      plants1: 'plants1', plants1_blue: 'plants1', bottletree_silhouette_blue: 'background_bottletree_silhouette',
      hut_dusk: 'bottletree_burb_wndw_1', hut_crown_dusk: 'treetop_noflowers_3', hut_far_blue: 'background_bottletree_hut',
      tuft_white: 'grass_transparent_4', pot_teal: 'pod2', roots_back_grey: 'legs_back_set2',
      roots_back3_grey: 'legs_back_set3', roots_front_grey: 'legs_front_set3', earth_strata: 'underground_background',
      exit_door_dusk: 'door_asset_bottletree_interior_side', ladder_dusk: 'firebog_ladder', basket_sticks_grey: 'decor_plants5',
    };
    // Recoloured Tiny Speck decos (firebog.swf), not new art.
    for (const [name, deco] of Object.entries(expect)) {
      assert.equal(plan.pieces[name]?.swf, `bundle:firebog.swf#${deco}`, name);
      if (name !== 'plants1') assert.ok(plan.pieces[name].ramp.length >= 2, `${name} ramp`);
    }
    assert.equal(plan.pieces.magic_mushroom_light_blue.swf, 'bundle:lighting1.swf#magic_mushroom_light_blue');
    for (const [file] of Object.values(OPERATION_GROW_FILES)) {
      assert.ok(existsSync(join(root, 'public', scene.GROW_ART_DIR, file)), file);
    }
    // 15 orbs, all inside the stalk's 78 x 232 world box.
    assert.equal(scene.STALK_ORBS.length, 15);
    const [, w, h] = OPERATION_GROW_FILES.plants1;
    for (const [dx, dy] of scene.STALK_ORBS) assert.ok(Math.abs(dx) <= w / 2 && dy < 0 && -dy <= h, `${dx},${dy}`);
    // The ladder art spans the climb.
    assert.ok(OPERATION_GROW_FILES.ladder_dusk[2] >= 0.9 * (mod.LADDER.bottom - mod.LADDER.top));
    for (const f of [
      'assets/decos/groddle/gravel_1.webp', 'assets/decos/groddle/backhill3_blue.webp',
      'assets/decos/groddle/ground_spots_dark_1.webp', 'assets/decos/groddle/firebog_sign_blank_plank.webp',
      'assets/decos/groddle/jar1.webp', 'assets/decos/groddle/light_shafts_blue.webp',
      mod.room.icon,
    ]) assert.ok(existsSync(join(root, 'public', f)), f);
  });

  it('paints the Snaps\' EXIT beside the door, citing them', () => {
    const src = readFileSync(join(root, 'public/js/operation-grow-scene.js'), 'utf8');
    assert.match(src, /label\(PIXI, 'EXIT'/);
    assert.match(src, /PHFEBGS0MAD2KGT_202464/);
    assert.match(src, /PUVJ77PGD9F21JM_110491/);
  });
});
