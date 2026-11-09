// The home graphics are stored at least as finely as a Retina screen draws them (the in-world
// sharpness audit of 2026-11-02, batch 2, approved by Austin: magnification = world scale x 2.52 /
// stored density, flagged over 1.2). Every Tower article and scaffolding stage, depleted
// cultivation proto and Note Pole part is a 1x file with a 3x twin rendered from Tiny Speck's
// vector SWF (tools/tower-art, tools/proto-art, tools/note-pole-art: they replaced 2x art drawn at
// 1.26); the Door in its four states and the three placed Magic Animal Sticks have 3x twins from
// the stills pipeline (tools/vector-sprites/stills.json); the Workbench, drawn at 1.25, has a 5x
// render (dense-stills.json, js/sprite-dense.js); the Tower name-sign scaffolding overlay keeps its
// frames as SVG (tools/overlays, vector).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from '../tools/vector-sprites/aligned-art.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

async function stageScale() {
  const { stageFor } = await import('../public/js/location-view.js?v=f1f922b4');
  // Original zoom on a 2560 x 1440 monitor (the game area under the top bar), CSS px per world px.
  return stageFor({ width: 2560, height: 1360, sceneWidth: 4000, sceneHeight: 1000, zoom: 1 }).scale;
}

/** Every sharpened home graphic: { name, paths (1x URLs from public/), scale (largest world scale it is drawn at) }. */
async function homeArt() {
  const { TOWER_ART, TOWER_ART_DIR, TOWER_STYLES, TOWER_VARIANT_ART, PROTO_ART, composeTower } = await import('../public/js/home-tower.js?v=087df38f');
  const { PROTO_DEPLETED_ART } = await import('../public/js/home-proto-art.js?v=9309e9f3');
  const { NOTE_POLE_PARTS } = await import('../public/js/note-pole-art.js?v=fbda2f8a');
  const { moduleConsts } = await import('./sheet-sources.js');
  const { FURNITURE_CATALOG } = await import('../public/js/homes-catalog.js?v=10ac34b6');
  const rows = [];
  // The Tower: every article of every style, at the largest container x style scale
  // composeTower gives any of them (a 9-floor Tower facing either way).
  const articles = [];
  let towerScale = 0;
  for (const id of Object.keys(TOWER_STYLES)) {
    for (const list of Object.values(TOWER_VARIANT_ART[id])) for (const row of list) if (row) articles.push(`${TOWER_ART_DIR}${row[0]}`);
    for (const facing of [true, false]) {
      for (const op of composeTower(id, 7, null, facing)) towerScale = Math.max(towerScale, Math.abs(op.scaleX), Math.abs(op.scaleY));
    }
    assert.ok(TOWER_ART[id], id);
  }
  rows.push({ name: 'Tower articles', paths: articles, scale: towerScale });
  // home-tower-feature protoSprite draws the scaffolding stage at 1.
  rows.push({ name: 'Tower scaffolding', paths: [1, 2, 3].map((n) => `${TOWER_ART_DIR}${PROTO_ART[n]}`), scale: 1 });
  // homes-feature spawnProtos / drawVisitorYard and home-street-mp size them to their 1x w x h.
  rows.push({ name: 'depleted protos', paths: Object.values(PROTO_DEPLETED_ART).map(([f]) => `assets/sprites/cultivation/proto/${f}`), scale: 1 });
  // home-street-mp-feature poleSprite: every part at its 1x w x h in an unscaled box.
  rows.push({ name: 'Note Pole parts', paths: Object.values(NOTE_POLE_PARTS).map(([f]) => `assets/sprites/note-pole/${f}`), scale: 1 });
  // homes-feature spawnDoorTargets: the Door's art at its catalog w x h.
  const door = FURNITURE_CATALOG.furniture_door;
  rows.push({ name: 'Door', paths: [door.art.path, ...Object.values(door.doorArt)], scale: 1 });
  const husbandry = moduleConsts('js/features/animal-husbandry-feature.js');
  const art = husbandry.get('ART');
  rows.push({ name: 'Magic Animal Sticks', paths: ['magic_pig_stick', 'magic_chicken_stick', 'magic_butterfly_stick'].map((k) => art[k]), scale: husbandry.get('STICK_SCALE') });
  const tower = moduleConsts('js/features/home-tower-feature.js');
  rows.push({ name: 'Workbench', paths: [tower.get('BENCH_ART')], scale: tower.get('BENCH_SCALE') });
  return rows;
}

test('every sharpened home graphic is found, with the counts the audit measured', async () => {
  const by = Object.fromEntries((await homeArt()).map((r) => [r.name, r]));
  assert.equal(by['Tower articles'].paths.length, 165);
  assert.equal(by['Tower scaffolding'].paths.length, 3);
  assert.equal(by['depleted protos'].paths.length, 16);
  assert.equal(by['Note Pole parts'].paths.length, 48);
  assert.equal(by.Door.paths.length, 5);
  assert.equal(by['Magic Animal Sticks'].paths.length, 3);
  assert.equal(by['Magic Animal Sticks'].scale, 0.5);
  assert.equal(by.Workbench.scale, 1.25);
  // base floor_ground: the chassis' 0.8148 x its container's 1.266.
  assert.ok(by['Tower articles'].scale > 1 && by['Tower articles'].scale < 1.1, `${by['Tower articles'].scale}`);
});

test('each 3x twin exists and is exactly three times its 1x file; the 1x files stay as the fallback', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=620b68fd');
  const { DENSE_SPRITES } = await import('../public/js/sprite-dense.js?v=2a0ce07a');
  const bad = [];
  for (const row of await homeArt()) {
    for (const path of row.paths) {
      if (!existsSync(join(pub, path))) { bad.push(`${path}: no 1x file`); continue; }
      const one = imageSize(join(pub, path));
      const dense = DENSE_SPRITES.get(path);
      const twin = HIRES_SPRITES.get(path) || dense?.parts[0]?.[0];
      const d = HIRES_SPRITES.has(path) ? 3 : dense?.density;
      if (!twin || !existsSync(join(pub, twin))) { bad.push(`${path}: no sharp twin`); continue; }
      assert.match(twin, new RegExp(`@${d}x\\.webp$`), twin);
      const hi = imageSize(join(pub, twin));
      if (hi.w !== one.w * d || hi.h !== one.h * d) bad.push(`${twin}: ${hi.w}x${hi.h}, not ${d}x ${one.w}x${one.h}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('each sharpened home graphic stores at least as many pixels as its largest draw scale', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=620b68fd');
  const { DENSE_SPRITES } = await import('../public/js/sprite-dense.js?v=2a0ce07a');
  const stage = await stageScale();
  assert.ok(stage > 2 && stage < 3, `stage ${stage}`);
  const soft = [];
  for (const row of await homeArt()) {
    const draw = row.scale * stage;
    for (const path of row.paths) {
      const density = HIRES_SPRITES.has(path) ? 3 : DENSE_SPRITES.get(path)?.density ?? 1;
      if (density < draw) soft.push(`${row.name} ${path}: stored ${density}x, drawn ${draw.toFixed(2)}x`);
    }
  }
  assert.deepEqual(soft, []);
});

test('the Tower draws its articles and scaffolding at their 1x size, the Workbench at 1.25 from its dense render', () => {
  const src = readFileSync(join(pub, 'js/features/home-tower-feature.js'), 'utf8');
  // The 2x art was drawn at 0.5; the 1x files (and their 3x twins, resolution 3) at the chassis scale.
  assert.match(src, /spr\.scale\.set\(op\.scaleX, op\.scaleY\);/);
  assert.doesNotMatch(src, /op\.scaleX \* 0\.5/);
  assert.match(src, /function protoSprite[\s\S]*?spr\.anchor\.set\(0\.5, PROTO_ART\.footY\);\n  return spr;/);
  assert.match(src, /new PIXI\.Sprite\(benchTexture\(engine\)\)[\s\S]*?bench\.scale\.set\(BENCH_SCALE\)/);
});

test('the Tower name-sign scaffolding overlay keeps its frames as SVG for dense screens', () => {
  const m = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays-more.json'), 'utf8'));
  const row = m.tower_sign_scaffolding_overlay;
  assert.ok(row?.vector?.file, 'vector frames');
  assert.ok(existsSync(join(pub, 'assets/sprites/overlays', row.vector.file)));
});
