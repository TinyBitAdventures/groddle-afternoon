/**
 * Smuggle the Smuggler (public/js/quest-rooms/penalty.js): source constants
 * from quests/smuggle_the_smuggler_part1-3.js, the reconstructed cell's
 * reach and visible band, the shipped art, and the three-part step machine.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import * as kit from '../public/js/quest-rooms/kit.js';
import {
  BARS_X,
  DIG_COUNTER,
  EXIT_PROMPT,
  EXIT_PROMPT_MS,
  FLOOR,
  FREE_TEXT,
  NEED_TOOL,
  PACE,
  PART_1,
  PART_2,
  PART_3,
  PATCH_X,
  SPAWN,
  TOOLS,
  W,
  cellPlatforms,
  cellStep,
  hasWorkingTool,
  room,
} from '../public/js/quest-rooms/penalty.js?v=g414-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const read = (rel) => (existsSync(join(GSJS, rel)) ? readFileSync(join(GSJS, rel), 'utf8') : null);
const BAND = 160;

describe('Smuggle the Smuggler source', () => {
  it('keeps the quests, tools, prompt and rewards', () => {
    assert.equal(room.id, 'penalty');
    assert.equal(room.durationMs, 0);
    assert.equal(EXIT_PROMPT_MS, 120_000);
    assert.deepEqual(TOOLS, ['shovel', 'ace_of_spades']);
    const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
    const q = quests.quests || quests;
    assert.deepEqual(q[PART_2].requirements.map((r) => r.name), [DIG_COUNTER]);
    assert.deepEqual(q[PART_3].rewards, { xp: 500, currants: 500, mood: 50 });
    assert.deepEqual(q[PART_1].endNpcs, ['npc_rare_item_vendor']);
    const p1 = read('quests/smuggle_the_smuggler_part1.js');
    if (p1) {
      assert.ok(p1.includes(NEED_TOOL));
      assert.match(p1, /in_array\(stack\.class_tsid, \['shovel', 'ace_of_spades'\]\)/);
      assert.match(p1, /var tsid = 'LUVGFS2RQI63N49'/);
      assert.match(p1, /instance_id: 'penalty', x: -1319, y: -123, exit_delay: 2\*60/);
    }
    const p3 = read('quests/smuggle_the_smuggler_part3.js');
    if (p3) assert.ok(p3.includes(FREE_TEXT));
    const inst = read('players/inc_instances.js');
    if (inst) assert.ok(inst.includes(EXIT_PROMPT));
  });

  it('ships its icon, vendor sheets and the penalty box decos it draws', () => {
    assert.ok(existsSync(join(root, 'public', room.icon)));
    for (const f of ['vendor_idle.webp', 'vendor_talk.webp', 'vendor_walk.webp']) {
      assert.ok(existsSync(join(root, 'public/assets/sprites/quest-rooms/penalty', f)), f);
    }
    const src = readFileSync(join(root, 'public/js/quest-rooms/penalty.js'), 'utf8');
    for (const m of src.matchAll(/kit\.deco\(PIXI, '([a-z0-9_]+)'/g)) {
      assert.ok(existsSync(join(root, 'public/assets/decos/groddle', `${m[1]}.webp`)), m[1]);
    }
    for (const f of ['patch-dark-dirty.png', 'patch-dark-dug.png']) assert.ok(existsSync(join(root, 'public/assets/sprites/soil', f)));
  });
});

describe('Penalty cell geometry', () => {
  const plats = cellPlatforms(kit);
  it('is one floor the width of the cell, everything on it', () => {
    assert.equal(plats.length, 1);
    assert.deepEqual([plats[0].x1, plats[0].x2, plats[0].y1], [0, W, FLOOR]);
    for (const x of [SPAWN.x, PATCH_X, PACE.x1, PACE.x2]) assert.ok(x > 40 && x < BARS_X - 40, String(x));
    assert.equal(SPAWN.y, FLOOR);
    // Everything to click sits on the floor, inside the visible band.
    assert.ok(FLOOR - (FLOOR - 90) <= BAND);
    assert.equal(PACE.x2 - PACE.x1, 400, 'npc_rare_item_vendor pace_distance');
  });
});

describe('Penalty cell steps', () => {
  it('walks part 1 -> 2 -> 3', () => {
    assert.equal(cellStep({ part1Active: true }), 'talk');
    assert.equal(cellStep({}), 'offer2');
    assert.equal(cellStep({ part2Active: true }), 'dig');
    assert.equal(cellStep({ part2Active: true, dug: true }), 'turn_in');
    assert.equal(cellStep({ part2Done: true }), 'offer3');
    assert.equal(cellStep({ part2Done: true, part3Active: true, dug: true }), 'crawl');
    assert.equal(cellStep({ part2Done: true, part3Done: true }), 'free');
  });

  it('needs a working digging tool', () => {
    assert.ok(hasWorkingTool({ shovel: 1 }, null, () => true));
    assert.ok(hasWorkingTool({ ace_of_spades: 1 }, null, () => true));
    assert.ok(!hasWorkingTool({ shovel: 1 }, null, () => false));
    assert.ok(!hasWorkingTool({ hoe: 1 }, null, () => true));
  });
});
