/**
 * Smuggle the Smuggler (public/js/quest-rooms/penalty.js): source constants
 * from quests/smuggle_the_smuggler_part1-3.js, the reconstructed cell's
 * reach and visible band, the shipped art, and the three-part step machine.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import * as kit from '../public/js/quest-rooms/kit.js?v=bfdf3e5e';
import { stageFor } from '../public/js/location-view.js?v=76a9ff86';
import { cameraTargetY, cameraWorldHeightForGround } from '../public/js/movement.js?v=f4be1a05';
import { Display, FakeEl, fakePixi } from './fake-scene.js';
import {
  BARS_X,
  DIG_COUNTER,
  EXIT_PROMPT,
  EXIT_PROMPT_MS,
  FLOOR,
  FREE_TEXT,
  GRASS_TOP,
  H,
  NEED_TOOL,
  PACE,
  PART_1,
  PART_2,
  PART_3,
  PATCH_X,
  PATCH_Z,
  ROOF_TOP,
  SPAWN,
  TOOLS,
  TRUNK_X,
  VENDOR_Z,
  W,
  cellPlatforms,
  cellStep,
  hasWorkingTool,
  room,
} from '../public/js/quest-rooms/penalty.js?v=313ef9e3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS');
const read = (rel) => (existsSync(join(GSJS, rel)) ? readFileSync(join(GSJS, rel), 'utf8') : null);
const BAND = 160;

describe('Smuggle the Smuggler source', () => {
  it('keeps the quests, tools, prompt and rewards', () => {
    assert.equal(room.id, 'penalty');
    assert.equal(room.durationMs, 0);
    assert.equal(EXIT_PROMPT_MS, 120_000);
    // The runtime's shared prompt asks it, and again 2 * 60 after each No thanks.
    assert.equal(room.exitPromptMs, EXIT_PROMPT_MS);
    assert.equal(typeof room.stuckPromptReady, 'function');
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
    for (const f of ['patch-dark-dirty.webp', 'patch-dark-dug.webp']) assert.ok(existsSync(join(root, 'public/assets/sprites/soil', f)));
  });

  it("draws the Snap's grassy ledge under the floor and the trunk behind the bars, not a drawn fill", () => {
    const src = readFileSync(join(root, 'public/js/quest-rooms/penalty.js'), 'utf8');
    assert.match(src, /kit\.deco\(PIXI, 'penaltybox_base_grass'/);
    assert.match(src, /kit\.deco\(PIXI, 'penaltybox_trunk', TRUNK_X/);
    assert.doesNotMatch(src, /g\.rect\(-200, FLOOR \+ 30,/, 'the earth under the floor starts below the ledge');
    assert.ok(TRUNK_X > 1210 && TRUNK_X < W, 'right of the knock it off! sign, inside the cell');
    assert.ok(GRASS_TOP > 30 && GRASS_TOP < 100, 'the grass shows under the mud floor edge');
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

/**
 * #613 (G1142, an upright Android phone, 384 x 644): the phone shows the cell's full height and
 * more, and the sky gradient filled the top 30% over the roof; the floor band was drawn over the
 * doorway's, the signs' and the trunk's feet; the Smuggler stood behind the dug patch (z 0 under
 * its 12) as he went down; and a drawn black ellipse sat under Glitch's dug patch art.
 */
describe('The Cell on an upright phone (#613)', () => {
  const saved = {};
  let scene;
  let world;
  before(async () => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    scene = room.build({ PIXI: fakePixi, kit, data: {}, param: () => null, engine: {}, state: {} });
    world = scene.background.children.find((c) => c.factor === 1);
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  it('rock covers every view from its top down to the roof: phones and windows', () => {
    const roofH = 572 * 0.62;
    const lip = 70;
    // The roof (top-anchored at ROOF_TOP) and the copies stacked over it (bottom-anchored).
    const roofs = world.children.filter((c) => c.x === W / 2 && Math.abs(c.scale.y) === 0.62 && (c.anchor.y === 1 ? c.y <= ROOF_TOP + lip : c.y === ROOF_TOP));
    const spans = roofs.map((c) => (c.anchor.y === 1 ? [c.y - roofH, c.y - lip] : [c.y, c.y + roofH - lip])).sort((a, b) => a[0] - b[0]);
    assert.ok(spans.length >= 2, `${spans.length} roof pieces`);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] <= spans[i - 1][1], `roof pieces ${i - 1} and ${i} meet (${spans[i - 1]} / ${spans[i]})`);
    const views = [
      { width: 384, height: 644, phone: true },
      { width: 402, height: 812, phone: true },
      { width: 430, height: 932, phone: true },
      { width: 1280, height: 740, phone: false },
      { width: 1920, height: 1020, phone: false },
    ];
    for (const v of views) {
      const { viewH } = stageFor({ width: v.width, height: v.height, sceneWidth: W, sceneHeight: H, phone: v.phone });
      const worldH = cameraWorldHeightForGround(H, FLOOR, viewH);
      const camY = cameraTargetY(FLOOR, worldH, viewH);
      assert.ok(spans[0][0] <= camY, `${v.width}x${v.height}: the view's top ${camY} is rock (rock from ${spans[0][0]})`);
    }
  });

  it('draws the floor before what stands on it: doorway, signs and trunk', () => {
    const at = (x, y) => world.children.findIndex((c) => c.x === x && c.y === y);
    const floorEdge = at(W / 2, FLOOR - 10);
    assert.ok(floorEdge > 0, 'the mud floor strip');
    for (const [name, x, y] of [['doorway', 60, FLOOR + 12], ['you are here', 430, FLOOR + 4], ['knock it off', 1210, FLOOR + 4], ['trunk', TRUNK_X, FLOOR + 8]]) {
      const i = at(x, y);
      assert.ok(i > floorEdge, `${name} (${i}) after the floor (${floorEdge})`);
    }
  });

  it('the Smuggler stands in front of the patch; the dug patch is the art alone', () => {
    const added = [];
    const PIXI = new Proxy({ AnimatedSprite: Display }, { get: (t, k) => (k in t ? t[k] : fakePixi[k]) });
    const ctx = {
      PIXI,
      kit,
      // The Smuggler's idle sheet as if loaded (the fake page loads no pictures).
      data: { vendorSheets: { idle: { frames: [{}], base: null } } },
      engine: { questState: { completed: [PART_2] } },
      add: (o, z) => { o.zIndex = z; added.push(o); return o; },
      register: (t) => ({ ...t }),
      quest: () => ({ active: () => false }),
    };
    room.enter(ctx);
    assert.equal(ctx.data.plot.stage, 'dug');
    assert.equal(ctx.data.patchView.zIndex, PATCH_Z);
    assert.equal(ctx.data.vendor.zIndex, VENDOR_Z);
    assert.ok(VENDOR_Z > PATCH_Z && VENDOR_Z < 50, 'in front of the hole, behind the player (50)');
    // The hit area and the patch_dark dug art: no drawn tunnel.
    assert.equal(ctx.data.patchView.children.length, 2);
  });
});
