/**
 * The High Jumper's memory-place (G74): js/quest-rooms/top-of-tree.js takes its look from a
 * player's Snap (pure white, a straight bark trunk on a flared base) and its name from GSJS.
 * Gameplay (branches, Spinach, crown) is held by tests/quest-instance.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as mod from '../public/js/quest-rooms/top-of-tree.js?v=a9458e4e';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = path.join(root, '..', 'glitch-GameServerJS');

test("the place carries its own name from the maps data", () => {
  assert.equal(mod.PLACE_NAME, 'The Gold Hatted, Bouncing, High Jumping Memory Place');
  const maps = path.join(gsjs, 'inc_data_maps_prod.js');
  if (fs.existsSync(maps)) {
    assert.ok(fs.readFileSync(maps, 'utf8').includes(`"LLI19Q27KMF175V"\t: "${mod.PLACE_NAME}"`));
    assert.match(fs.readFileSync(path.join(gsjs, 'quests/high_jump.js'), 'utf8'), /LLI19Q27KMF175V/);
  }
});

test('the trunk is the CC0 bark deco on a white memory with no floor band', () => {
  const src = fs.readFileSync(path.join(root, 'public/js/quest-rooms/top-of-tree.js'), 'utf8');
  assert.ok(fs.existsSync(path.join(root, 'public/assets/decos/groddle/tree_stack_trunk.webp')));
  assert.match(src, /'tree_stack_trunk'/);
  assert.doesNotMatch(src, /tree_base_root_1|cloud_fluffy_1/);
  assert.ok(mod.TRUNK_W >= 80 && mod.TRUNK_W <= 100, 'about 0.7 of an avatar wide');
});

test('the climb has no clock: the 2*60 exit delay is "Are you stuck?", and time quoins are study acceleration', () => {
  // high_jump.js 74: instances_create_delayed ... exit_delay: 2*60 (players/inc_instances.js 317-357).
  if (fs.existsSync(path.join(gsjs, 'quests/high_jump.js'))) {
    assert.match(fs.readFileSync(path.join(gsjs, 'quests/high_jump.js'), 'utf8'), /instance_id: 'top_of_tree', x: -315, y: -53, exit_delay: 2\*60\}/);
    // items/quoin.js 202: a time quoin starts skill acceleration; it never touched the instance.
    assert.match(fs.readFileSync(path.join(gsjs, 'items/quoin.js'), 'utf8'), /if \(this\.instanceProps\.type == 'time'\) pc\.skills_start_acceleration\(amount\);/);
  }
  assert.equal(mod.room.durationMs, 0);
  assert.equal(mod.room.exitPromptMs, 120_000);
  assert.equal(mod.EXIT_PROMPT_MS, 120_000);
  assert.equal(mod.CLIMB_MS, undefined);
  const src = fs.readFileSync(path.join(root, 'public/js/quest-rooms/top-of-tree.js'), 'utf8');
  assert.doesNotMatch(src, /ctx\.extend\(|\+20 seconds/);
  // items/quoin.js 159, 236: not counted toward the day's limit, but it still stops there (the quoin stays).
  assert.match(src, /if \(!ctx\.collectQuoin\(q\.type, q\.x, q\.y, \{ uncounted: true \}\)\?\.ok\) continue;/);
});

test('G1148: on an upright phone the tree is in view and the camera stops 53 px under the ground', async () => {
  const { MIN_PACK_HEIGHT, phoneGroundWorldHeight, sceneGroundLine, stageFor } = await import('../public/js/location-view.js?v=76a9ff86');
  const { cameraTargetY, cameraWorldHeightForGround } = await import('../public/js/movement.js?v=f4be1a05');
  // quests/high_jump.js 74: the player is set down at y -53, a floor 53 px over the location's bottom.
  if (fs.existsSync(path.join(gsjs, 'quests/high_jump.js'))) {
    assert.match(fs.readFileSync(path.join(gsjs, 'quests/high_jump.js'), 'utf8'), /instance_id: 'top_of_tree', x: -315, y: -53,/);
  }
  assert.equal(mod.GROUND_BELOW, 53);
  const src = fs.readFileSync(path.join(root, 'public/js/quest-rooms/top-of-tree.js'), 'utf8');
  assert.match(src, /root\.groundLine = GROUND \+ GROUND_BELOW;/);
  assert.match(src, /spawn: \{ x: SPAWN_X, y: GROUND \}/);
  const line = sceneGroundLine({ groundLine: mod.GROUND + mod.GROUND_BELOW, street: null });
  assert.equal(line, mod.GROUND + 53);
  // Upright 384 x 644, the pack row hidden: the canvas ends at the line (it ran 290 px under the feet).
  const stage = stageFor({ width: 384, height: 644, sceneWidth: mod.TREE_W, sceneHeight: mod.TREE_H, phone: true, groundLine: line });
  const world = phoneGroundWorldHeight({ worldHeight: cameraWorldHeightForGround(mod.TREE_H, mod.GROUND, stage.viewH), groundLine: line, floorY: mod.GROUND, scale: stage.scale });
  const camY = cameraTargetY(mod.GROUND, world, stage.viewH, 0.75);
  assert.equal(camY + stage.viewH + MIN_PACK_HEIGHT, line);
  // The player arrives at the trunk's foot, right of its roots, off the ground Spinach: the trunk is in the view.
  assert.ok(mod.SPAWN_X - mod.TRUNK_X >= 120 && mod.SPAWN_X - mod.TRUNK_X <= 250);
  assert.ok(Math.abs(mod.SPAWN_X - mod.spinachSpots()[0].x) >= 40);
  const camX = Math.min(mod.TREE_W - stage.viewW, Math.max(0, mod.SPAWN_X - stage.viewW / 2));
  assert.ok(mod.TRUNK_X - mod.TRUNK_W / 2 > camX && mod.TRUNK_X + mod.TRUNK_W / 2 < camX + stage.viewW, `trunk in ${camX}..${camX + stage.viewW}`);
  const before = Math.min(mod.TREE_W - stage.viewW, Math.max(0, 420 - stage.viewW / 2));
  assert.ok(mod.TRUNK_X > before + stage.viewW * 0.9, 'from x 420 the trunk stood at the screen\'s right edge');
});
