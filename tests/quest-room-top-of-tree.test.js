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

import * as mod from '../public/js/quest-rooms/top-of-tree.js';

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
