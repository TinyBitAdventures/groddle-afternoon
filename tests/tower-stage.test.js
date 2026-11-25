/**
 * #523 (R12): Glitch stood an item on the bottom centre of its SWF's whole stage, at the item's
 * x,y, which is where the player stood (LocationItemstackView.as 853-854, ItemSSManager.as 512-513).
 * The Tower chassis, its name sign, the scaffolding and the Note Pole read their stage from the FLAs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROTO_ART,
  TOWER_ART,
  TOWER_SIGN_POINTS,
  TOWER_STAGE,
  composeTower,
  towerOrigin,
  towerSignFoot,
} from '../public/js/home-tower.js?v=a7fc0cce';
import { NOTE_POLE_STAGE } from '../public/js/home-street-mp.js?v=2b921da4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(root, '../glitch-client');
const ITEMS = join(root, '../glitch-items');
const GS = join(root, '../glitch-GameServerJS');
const src = (p) => readFileSync(join(root, p), 'utf8');

const STYLES = {
  base: 'furniture/furniture_base/furniture_tower_chassis/furniture_tower_chassis',
  tree: 'furniture/furniture_tower_chassis/furniture_tower_chassis_tree_tower',
  quarry: 'furniture/furniture_tower_chassis/furniture_tower_chassis_rock_tower',
  mushroom: 'furniture/furniture_tower_chassis/furniture_tower_chassis_mushroom_tower',
  spaceship: 'furniture/furniture_tower_chassis/furniture_tower_chassis_spaceship_tower',
  adobe: 'furniture/furniture_tower_chassis/furniture_tower_chassis_basic_tower',
};

/** DOMDocument.xml of an FLA, as tests/tower-sign.test.js reads it (unzip, then libarchive on Linux). */
function domDocument(fla) {
  let xml;
  try {
    xml = execFileSync('unzip', ['-p', fla, 'DOMDocument.xml'], { encoding: 'utf8', maxBuffer: 2 ** 28, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { xml = e.stdout; }
  if (!xml) xml = execFileSync('bsdtar', ['-xOf', fla, 'DOMDocument.xml'], { encoding: 'utf8', maxBuffer: 2 ** 28, stdio: ['ignore', 'pipe', 'ignore'] });
  return xml;
}
/** The stage as the client measured it: the SWF header (the FLA's stage) rounded, mc_w / mc_h. */
function stageOf(xml) {
  const doc = /<DOMDocument [^>]*>/.exec(xml)[0];
  const w = Number(/ width="([-\d.]+)"/.exec(doc)?.[1] ?? 550);
  const h = Number(/ height="([-\d.]+)"/.exec(doc)?.[1] ?? 400);
  return { w: Math.round(w), h: Math.round(h) };
}
function matrix(xml, name) {
  const m = new RegExp(`<DOMSymbolInstance[^>]*name="${name}"[^>]*>\\s*<matrix>\\s*<Matrix([^/]*)/>`).exec(xml);
  if (!m) return null;
  return { x: Number(/tx="([-\d.]+)"/.exec(m[1])?.[1] ?? 0), y: Number(/ty="([-\d.]+)"/.exec(m[1])?.[1] ?? 0) };
}
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.01, `${label}: ${a} vs ${b}`);

describe('Tower art on Glitch registration (#523)', () => {
  it('the client stands an item on its stage bottom centre', { skip: !existsSync(CLIENT) }, () => {
    const view = readFileSync(join(CLIENT, 'com/tinyspeck/engine/view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(view, /view_do\.x = -Math\.round\(\(ss\.ss_options\.movieWidth\*_itemstack\.scale\)\/2\);\s*view_do\.y = -ss\.ss_options\.movieHeight\*_itemstack\.scale;/);
    const ss = readFileSync(join(CLIENT, 'com/tinyspeck/engine/spritesheet/ItemSSManager.as'), 'utf8');
    assert.match(ss, /swf_data\.mc_w = Math\.round\(r\.dimensions\.width\);\s*swf_data\.mc_h = Math\.round\(r\.dimensions\.height\);/);
    assert.match(ss, /new SSGenOptions\(\s*SSGenOptions\.TYPE_MULTIPLE_BITMAPS,\s*swf_data\.mc_w,\s*swf_data\.mc_h/);
  });

  it('every chassis stage and maincontainer_mc is the FLA\'s', { skip: !existsSync(ITEMS) }, () => {
    assert.deepEqual(Object.keys(TOWER_STAGE).sort(), Object.keys(TOWER_ART).sort());
    for (const [style, base] of Object.entries(STYLES)) {
      const xml = domDocument(join(ITEMS, `${base}.fla`));
      const stage = stageOf(xml);
      const main = matrix(xml, 'maincontainer_mc');
      assert.equal(TOWER_STAGE[style].w, stage.w, `${style} mc_w`);
      assert.equal(TOWER_STAGE[style].h, stage.h, `${style} mc_h`);
      near(TOWER_STAGE[style].main[0], main.x, `${style} main x`);
      near(TOWER_STAGE[style].main[1], main.y, `${style} main y`);
      // The art origin from the foot: maincontainer_mc less the stage's corner at -round(mc_w/2), -mc_h.
      const o = towerOrigin(style);
      near(o.x, main.x - Math.round(stage.w / 2), `${style} origin x`);
      near(o.y, main.y - stage.h, `${style} origin y`);
      // Its sign: tryAndGetSignCoordsFromMC into int deltas, or the mushroom's 8, -120.
      const pt = matrix(xml, 'sign_pt');
      const sign = towerSignFoot(style);
      if (pt) {
        const int = (v) => Math.trunc(Math.round(v * 100) / 100); // var delta_x:int
        assert.equal(sign.x, int(-(stage.w / 2) + pt.x), `${style} sign x`);
        assert.equal(sign.y, int(-stage.h + pt.y), `${style} sign y`);
      } else {
        assert.deepEqual([sign.x, sign.y], [8, -120], style);
      }
    }
  });

  it('the origins measured for #523', () => {
    const want = { adobe: [7.05, -43.9], base: [-11.05, -45.05], tree: [-3.1, -46.05], quarry: [13.2, -69.1], mushroom: [32.85, -12.95], spaceship: [17.8, -20.6] };
    for (const [style, [x, y]] of Object.entries(want)) {
      assert.deepEqual(towerOrigin(style), { x, y }, style);
      assert.deepEqual(towerOrigin(style, false), { x: -x, y }, `${style} flipped`);
    }
  });

  it('composeTower draws every article from that origin, both ways', () => {
    for (const style of Object.keys(TOWER_ART)) {
      for (const facing of [true, false]) {
        const o = towerOrigin(style, facing);
        const [sx, sy] = TOWER_ART[style].scale;
        const mx = facing ? sx : -sx;
        const ground = composeTower(style, 0, null, facing).find((op) => op.part === 'floor_ground');
        const [cx, cy] = TOWER_ART[style].containers.floor_ground;
        near(ground.x, o.x + mx * cx, `${style} ${facing} x`);
        near(ground.y, o.y + sy * cy, `${style} ${facing} y`);
      }
      // the sign keeps its maincontainer_mc point (tests/tower-sign.test.js), moved by the same origin
      const sign = towerSignFoot(style);
      assert.ok(Math.abs(sign.x - (towerOrigin(style).x + TOWER_SIGN_POINTS[style].dx)) <= 1.5, style);
      assert.ok(Math.abs(sign.y - (towerOrigin(style).y + TOWER_SIGN_POINTS[style].dy)) <= 1, style);
      assert.equal(towerSignFoot(style, false).x, -sign.x);
    }
  });

  it('the scaffolding stands on its whole stage', { skip: !existsSync(ITEMS) }, () => {
    const xml = domDocument(join(ITEMS, 'misc/proto/proto_furniture_tower_chassis/proto_furniture_tower_chassis.fla'));
    const stage = stageOf(xml);
    assert.deepEqual([PROTO_ART.w, PROTO_ART.h], [stage.w, stage.h]);
    assert.equal(PROTO_ART.footY, 1);
  });

  it('the Note Pole stands on its whole stage', { skip: !existsSync(ITEMS) }, () => {
    const xml = domDocument(join(ITEMS, 'misc/note_pole/note_pole.fla'));
    const stage = stageOf(xml);
    const main = matrix(xml, 'mainContainer_mc');
    assert.equal(NOTE_POLE_STAGE.w, stage.w);
    assert.equal(NOTE_POLE_STAGE.h, stage.h);
    near(NOTE_POLE_STAGE.main[0], main.x, 'main x');
    near(NOTE_POLE_STAGE.main[1], main.y, 'main y');
  });

  it('the street puts the foot on the walk line and the exit on the foot', () => {
    const feature = src('public/js/features/home-tower-feature.js');
    assert.doesNotMatch(feature, /groundY \+ 6/);
    assert.equal(feature.match(/box\.y = groundY;/g)?.length, 2, 'own Tower and a visited one');
    assert.match(feature, /arrivalX = Number\.isFinite\(x\) \? x : null;/);
    const visit = src('public/js/features/neighbours-mp-feature.js');
    assert.match(visit, /Number\.isFinite\(visit\.towerX\)\) x = visit\.towerX;/);
    const pole = src('public/js/features/home-street-mp-feature.js');
    assert.match(pole, /box\.y = y;\n\s*box\.zIndex = 17;/);
  });

  it('Glitch leaves a Tower onto the chassis x,y', { skip: !existsSync(GS) }, () => {
    const homes = readFileSync(join(GS, 'locations/inc_homes.js'), 'utf8');
    assert.match(homes, /tower\.tower_set_exit\(this, x, y\);/);
  });
});
