// The low-resolution audit of 2026-11-12: the house on a home street (1.8-2.2 device px per
// texel), Firebog's ground fronts (kept as old PNGs, no 3x file) and Grimssea Hollow's bark knot
// were the blurriest street art left with a CC0 source.
// - Houses: sharp.py measures them (house_placements) and homes-feature draws the house through
//   its landscape artist; two house PNGs frame the art a few px off the SWF's stage, so their
//   copies are the SWF render registered onto the PNG's frame (ALIGN_TO_PNG).
// - Firebog's front_ground_1/_set_1/_set_2 and tree_knot_01b_et1 ship the SWF render (build.py
//   SWF_WINS): the old PNGs were other art or other framings of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const sharpPlan = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/plan-sharp.json'), 'utf8'));
const rows = new Map(sharpPlan.decos.map((r) => [r.name, r]));
const decoPlan = readFileSync(join(root, 'tools/deco-pipeline/plan.json'), 'utf8');
const planRow = (name) => JSON.parse(decoPlan.split('\n').find((l) => l.startsWith(`{"name":"${name}"`)).replace(/,$/, ''));
const HOUSES = ['door_asset_house_large_01', 'door_asset_house_medium_03', 'door_asset_house_large_05'];

test('each home-street house has a sharp copy sized for its scale on a 4x backing store', async () => {
  const { SHARP_DECOS } = await import('../public/js/deco-sharp-list.js?v=a2424923');
  for (const name of HOUSES) {
    const r = rows.get(name);
    assert.ok(r, name);
    assert.equal(r.kind, 'webp', name);
    assert.ok(r.sh >= 0.48, `${name} sh ${r.sh}`);
    // target 3 texels per view px at the largest house scale.
    assert.ok(r.res >= r.sh * 3 - 1e-9, `${name} res ${r.res}`);
    assert.ok(existsSync(join(pub, `assets/decos/groddle/${name}@${r.res}x.webp`)), name);
    assert.ok(SHARP_DECOS.has(name), name);
  }
});

test('the two re-framed house copies line up with their 2x files', () => {
  for (const name of ['door_asset_house_medium_03', 'door_asset_house_large_05']) {
    const r = rows.get(name);
    assert.match(r.why, /^aligned: /, name);
    assert.equal(r.fit.length, 4);
    // build.py same_art: within 8 colour and 12 alpha after registration.
    assert.ok(r.aligned_diff[0] <= 8 && r.aligned_diff[1] <= 12, `${name} ${r.aligned_diff}`);
    assert.equal(planRow(name).mode, 'png', `${name}'s 2x file stays the old PNG`);
  }
});

test('the house picks its copy at R 4 and keeps the 2x file on a phone', async () => {
  const { landscapeArt } = await import('../public/js/features/homes-feature.js?v=35daf16c');
  const house = { s: 'door_asset_house_medium_03', w: 764, h: 586, scale: 0.58 };
  assert.equal(landscapeArt(house, 4).url, `assets/decos/groddle/door_asset_house_medium_03@${rows.get('door_asset_house_medium_03').res}x.webp`);
  assert.equal(landscapeArt(house, 1).url, 'assets/decos/groddle/door_asset_house_medium_03.png');
  const src = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
  assert.match(src, /const house = land\.artist\.sprite\(PIXI, \{ s: h\.path, w: h\.w, h: h\.h, scale: h\.scale \}, layout\.houseX, STREET_GROUND_Y \+ 14\);/);
  const nb = readFileSync(join(pub, 'js/features/neighbour-scene.js'), 'utf8');
  assert.match(nb, /const sharp = sharpRoomDeco\(`\$\{DECO\}\$\{h\.path\}\.png`, h\.scale\);/);
});

test("Firebog's ground fronts and Grimssea's knot ship the SWF render with a 3x file", () => {
  for (const name of ['front_ground_1', 'front_ground_set_1', 'front_ground_set_2', 'tree_knot_01b_et1']) {
    const r = planRow(name);
    assert.equal(r.mode, 'swf', name);
    assert.match(r.reason, /^corrected: /, name);
    assert.ok(existsSync(join(pub, `assets/decos/groddle/${name}.webp`)), name);
  }
  for (const name of ['front_ground_1', 'front_ground_set_1', 'front_ground_set_2']) {
    assert.equal(planRow(name).hires, true, name);
    assert.ok(existsSync(join(pub, `assets/decos/groddle/${name}@1.5x.webp`)), name);
  }
  // The knot is a far bark deco: a sharp SVG for Grimssea Hollow's T_ench_bark.
  assert.equal(rows.get('tree_knot_01b_et1').kind, 'svg');
  assert.ok(rows.get('tree_knot_01b_et1').sf > 0);
});
