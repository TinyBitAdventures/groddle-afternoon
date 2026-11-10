/**
 * A potion's own bottle, pouring (js/potion-bottles.js, js/potion-bottle-fx.js, js/item-overlay.js;
 * lane refsart): the 19 potions with a tool_animation play it where the original's overlay stood.
 * The rules are read against Tiny Speck's potion files when they are beside the repo, the grids
 * against the shipped files and the builder's measurements.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POTION_BOTTLE_ALIAS,
  POTION_POUR_MS,
  POTION_SELF_OVERLAY,
  POTION_TARGET_OVERLAY,
  potionBottleClasses,
  potionBottleSheet,
  potionPourSide,
} from '../public/js/potion-bottles.js?v=5b0bdabe';
import { PACKED_SHEETS } from '../public/js/packed-sheets-data.js?v=32023e3a';
import { packedCell, packedDurationMs, packedFrameAt } from '../public/js/packed-sheets.js?v=cb13ee62';
import { KEEP_SHEETS, itemOverlayPlacement, pcOverlayPoint } from '../public/js/item-overlay.js?v=99215179';
import { POTIONS } from '../public/js/potions.js?v=4f4c996d';
import { GARDEN_POTIONS } from '../public/js/master-garden.js?v=2953386a';
import { TREE_ANTIDOTE, TREE_POISON } from '../public/js/tree-poison.js?v=5ceea244';
import { imageSize } from '../tools/image-size.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS', 'items');

// The 19 potions with a tool_animation sheet in Tiny Speck's OGA dump, and each sheet's size (measured).
const SHEETS = {
  potion_amorous_philtre: [880, 735],
  potion_ancestral_spirits: [913, 700],
  potion_animal_youth: [880, 742],
  potion_avatar_large: [880, 735],
  potion_avatar_small: [880, 735],
  potion_charades: [913, 714],
  potion_draught_of_giant_amicability: [880, 742],
  potion_elixir_of_avarice: [880, 742],
  potion_garden_clear: [990, 735],
  potion_garden_fertilize: [990, 735],
  potion_garden_harvest: [990, 735],
  potion_garden_plant: [990, 735],
  potion_garden_water: [990, 735],
  potion_keycutter_tonic: [880, 910],
  potion_rainbow_juice: [913, 903],
  potion_rook_balm: [880, 742],
  potion_trantsformation_fluid: [913, 700],
  potion_tree_poison: [880, 721],
  potion_tree_poison_antidote: [880, 721],
};

describe('the source says where the bottle goes', { skip: existsSync(join(GSJS, 'potion_amorous_philtre.js')) ? false : 'clone tinyspeck/glitch-GameServerJS beside the repo' }, () => {
  it('every one of the 19: a pour on its target (delta_y 20, mirrored and 10 px over when the target is left), else over you (-135, 60 x 60), 2500 ms', () => {
    for (const cls of Object.keys(SHEETS)) {
      const src = readFileSync(join(GSJS, `${cls}.js`), 'utf8');
      assert.match(src, /if \(target\.x < pc\.x\)\{\s+var state = '-tool_animation';\s+var delta_x = 10;[\s\S]{0,120}?\}\s+else\{\s+var state = 'tool_animation';\s+var delta_x = -10;/, cls);
      assert.match(src, /type: 'itemstack_overlay',\s+itemstack_tsid: target\.tsid,\s+duration: 2500,\s+item_class: this\.class_tsid,\s+state: state,\s+locking: true,\s+delta_x: delta_x,\s+delta_y: 20,/, cls);
      assert.match(src, /type: 'pc_overlay',\s+item_class: this\.class_tsid,\s+duration: 2500,\s+state: 'tool_animation',\s+pc_tsid: pc\.tsid,\s+locking: (true|false),\s+dismissible: false,\s+delta_x: 0,\s+delta_y: -135,\s+width: 60,\s+height: 60,/, cls);
      assert.match(src, /this\.apiSetTimerX\("on(Pour|Quaff)Complete", 2500, pc, msg\);/, cls);
    }
    assert.equal(POTION_POUR_MS, 2500);
    assert.deepEqual({ ...POTION_SELF_OVERLAY }, { deltaY: -135, wh: 60 });
    assert.deepEqual({ ...POTION_TARGET_OVERLAY }, { deltaX: 10, deltaY: 20 });
  });

  it('potion_favor is the Draught of Giant Amicability under its older class name', () => {
    assert.match(readFileSync(join(GSJS, 'potion_favor.js'), 'utf8'), /var label = "Draught of Giant Amicability";/);
    assert.deepEqual({ ...POTION_BOTTLE_ALIAS }, { potion_favor: 'potion_draught_of_giant_amicability' });
    assert.equal(potionBottleSheet('potion_favor'), PACKED_SHEETS.potions.potion_draught_of_giant_amicability);
  });
});

describe('the pour', () => {
  it('stands on the side away from you, mirrored when its target is to your left', () => {
    assert.deepEqual(potionPourSide(300, 500), { flipped: true, deltaX: 10 });
    assert.deepEqual(potionPourSide(700, 500), { flipped: false, deltaX: -10 });
    assert.deepEqual(potionPourSide(500, 500), { flipped: false, deltaX: -10 });
  });

  it('a quaff is fitted to 60 px by its longer side and stands 135 px over your feet; a pour on a target is 1:1', () => {
    // ItemIconView.as 311-349: scaled so the longer side is the size, centred across, standing on the point.
    const quaff = itemOverlayPlacement([80, 105], 500, 400 - 135, 60);
    assert.equal(quaff.scale, 60 / 105);
    assert.equal(quaff.height, 60);
    assert.ok(Math.abs(quaff.width - 80 * (60 / 105)) < 1e-9);
    assert.equal(quaff.top, 400 - 135 - 60);
    assert.ok(Math.abs(quaff.left + quaff.width / 2 - 500) < 1e-9);
    const wide = itemOverlayPlacement([120, 60], 0, 0, 60);
    assert.equal(wide.scale, 0.5);
    assert.deepEqual([wide.left, wide.top, wide.width, wide.height], [-30, -30, 60, 30]);
    const pour = itemOverlayPlacement([90, 105], 300, 220, 0);
    assert.deepEqual([pour.scale, pour.left, pour.top, pour.width, pour.height], [1, 255, 115, 90, 105]);
    assert.deepEqual(pcOverlayPoint({ x: 500, y: 400 }, { dy: -135 }), { x: 500, y: 265 });
  });

  it('is one pour for the overlay: 75 frames at 30 a second, the first and the last two empty', () => {
    const def = potionBottleSheet('potion_garden_water');
    assert.equal(Math.round(packedDurationMs(def)), POTION_POUR_MS);
    assert.equal(packedCell(def, 0), -1, 'frame 1: the bottle is not out yet');
    assert.equal(packedCell(def, 1), 0);
    assert.equal(packedCell(def, 72), 71);
    assert.equal(packedCell(def, 73), -1);
    assert.equal(packedCell(def, 74), -1);
    assert.equal(packedFrameAt(def, 0), 0);
    assert.equal(packedFrameAt(def, 1250), 37);
    assert.equal(packedFrameAt(def, 2499), 74);
    assert.equal(packedFrameAt(def, 2500), 0, 'tool_animation loops (SSCollection.as 123)');
  });
});

describe('the sheets', () => {
  it('are the 19 potions, each 11 x 7 cells with 72 drawn, as measured', () => {
    assert.deepEqual(Object.keys(PACKED_SHEETS.potions).sort(), Object.keys(SHEETS).sort());
    const results = JSON.parse(readFileSync(join(root, 'tools/packed-sheets/results.json'), 'utf8')).sheets;
    for (const [cls, [w, h]] of Object.entries(SHEETS)) {
      const def = PACKED_SHEETS.potions[cls];
      const row = results.find((r) => r.set === 'potions' && r.name === cls);
      assert.deepEqual(row.oga.size, [w, h], cls);
      assert.deepEqual([row.oga.cols, row.oga.rows], [11, 7], cls);
      assert.deepEqual([...def.cell], [w / 11, h / 7], cls);
      assert.equal(def.plays, 75, cls);
      assert.equal(def.frames, 72, `${cls}: every drawn frame is its own picture`);
      assert.deepEqual(def.seq.filter((c) => c < 0).length, 3, cls);
      assert.deepEqual([def.seq[0], def.seq[73], def.seq[74]], [-1, -1, -1], cls);
      assert.deepEqual(def.seq.slice(1, 73), Array.from({ length: 72 }, (_, i) => i), cls);
      assert.equal(def.loop, true, cls);
      assert.equal(def.fps, 30, cls);
      // The SWF scene: root frames 3-77; packed cell i is frame 4 + i.
      assert.deepEqual(row.frameList, Array.from({ length: 72 }, (_, i) => 4 + i), cls);
    }
  });

  it('each file is its packed grid, with a 3x twin three times its size that waits for its first draw', () => {
    const hires = read('js/sprite-hires.js');
    const first = hires.slice(hires.indexOf('FIRST_DRAW_SPRITES'));
    for (const [cls, def] of Object.entries(PACKED_SHEETS.potions)) {
      const file = join(root, 'public', def.path);
      assert.ok(existsSync(file), def.path);
      const { w, h } = imageSize(file);
      assert.equal(w, def.cols * def.fw, def.path);
      assert.equal(h, Math.ceil(def.frames / def.cols) * def.fh, def.path);
      assert.ok(def.at[0] + def.fw <= def.cell[0] && def.at[1] + def.fh <= def.cell[1], `${cls}: the box is inside the cell`);
      const twin = def.path.replace('.webp', '@3x.webp');
      const big = imageSize(join(root, 'public', twin));
      assert.deepEqual([big.w, big.h], [w * 3, h * 3], twin);
      assert.ok(hires.includes(`"${def.path}", "${twin}"`), `${def.path} in js/sprite-hires.js`);
      assert.ok(first.includes(`"${def.path}"`), `${def.path} waits for its first draw`);
    }
  });

  it('the vector manifest and the packed sheets are current', () => {
    const out = execFileSync('node', [join(root, 'tools/vector-sprites/build.mjs'), '--manifest', join(root, 'tools/vector-sprites/potions.json'), '--check'], { encoding: 'utf8' });
    assert.match(out, /potions\.json: ok/);
  });

  it("the Rook Balm's miscut sheet is gone", () => {
    assert.equal(existsSync(join(root, 'public/assets/sprites/rooks/rook-balm-tool.webp')), false);
    assert.doesNotMatch(read('js/features/rook-attack-feature.js'), /rook-balm-tool/);
  });
});

describe('where the game plays it', () => {
  it('every potion the game lets you use has its bottle, but the three with no sheet', () => {
    const have = new Set(potionBottleClasses());
    const without = Object.keys(POTIONS).filter((cls) => !have.has(cls)).sort();
    assert.deepEqual(without, ['potion_alphabet_sauce', 'potion_rocky_regeneration_solution', 'potion_xp']);
    for (const cls of [...Object.keys(GARDEN_POTIONS), TREE_POISON, TREE_ANTIDOTE, 'potion_rook_balm']) assert.ok(potionBottleSheet(cls), cls);
    assert.equal(potionBottleSheet('apple'), null);
  });

  it('the Cauldron potions, the garden potions, Tree Poison and the Rook Balm all go through one player', () => {
    const potions = read('js/features/potions-feature.js');
    assert.match(potions, /const pour = playPotionBottle\(engine, classTsid, target\);\s+if \(pour\) return \{ pour, follow\(\) \{\} \};/);
    // The pour that ran its 2.5 s fades out by itself; a cut one (a street change) stops at once.
    assert.match(potions, /if \(!played\) pending\?\.fx\?\.pour\?\.stop\(\);/);
    assert.match(potions, /stopFx\(\{ played: true \}\);/);
    assert.match(read('js/features/master-garden-feature.js'), /const pour = playPotionBottle\(engine, potionClass, target\);/);
    assert.match(read('js/features/tree-death-feature.js'), /const pour = playPotionBottle\(engine, potionClass, target\);/);
    const rook = read('js/features/rook-attack-feature.js');
    assert.match(rook, /if \(verb\?\.id === 'rook_apply_balm'\) \{\s+balmPour\?\.stop\(\);\s+balmPour = playPotionBottle\(engine, BALM_CLASS, target, \{ durationMs: ROOK_SOURCE\.balmPourMs \}\);/);
    assert.match(rook, /if \(verbId === 'rook_apply_balm'\) \{\s+balmPour\?\.stop\(\);/);
  });

  it('the player: on the target at the top of its art plus 20, else over the avatar; held sheets are few', () => {
    const fx = read('js/potion-bottle-fx.js');
    assert.match(fx, /return itemstackOverlayPoint\(last\.x, last\.y, \{ dx: side\.deltaX, dy: POTION_TARGET_OVERLAY\.deltaY \}\);/);
    assert.match(fx, /wh: POTION_SELF_OVERLAY\.wh,[\s\S]{0,200}?at: \(\) => pcOverlayPoint\(engine\.player, \{ dy: POTION_SELF_OVERLAY\.deltaY \}\),/);
    assert.equal(KEEP_SHEETS, 2);
    const overlay = read('js/item-overlay.js');
    assert.match(overlay, /while \(count > KEEP_SHEETS && idle\.length\) \{\s+evict\(idle\.shift\(\)\);/);
    assert.match(overlay, /const ours = \[\.\.\.held\.values\(\)\]\.filter\(\(e\) => !e\.keep\);/, 'a sheet another module draws from is never unloaded');
    assert.match(overlay, /const release = trackOverlay\(\(\) => handle\.cancel\(\)\);/, 'a street change cancels it with the other overlays');
  });
});
