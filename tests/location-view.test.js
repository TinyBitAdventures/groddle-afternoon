import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MIN_VP_H,
  MAX_VP_H,
  MIN_PACK_HEIGHT,
  VIEW_FLOOR_H,
  DEFAULT_VP_H,
  canvasHeightFor,
  HELD_VIEW_H,
  locationViewHeightFor,
  sceneViewCap,
} from '../public/js/location-view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.resolve(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');

test('VIEWHEIGHT = grow: the source numbers', () => {
  // LayoutModel.as 10, 13; TSEngineConstants.as 18.
  assert.equal(MIN_VP_H, 400);
  assert.equal(MAX_VP_H, 600);
  assert.equal(MIN_PACK_HEIGHT, 132);
  // The remake's floor is its old fixed view (a 540 px canvas), inside 400-600.
  assert.equal(VIEW_FLOOR_H, 408);
  assert.equal(DEFAULT_VP_H, 408);
  assert.equal(canvasHeightFor(VIEW_FLOOR_H), 540);
  assert.equal(canvasHeightFor(600), 732);
  const layout = path.join(client, 'model', 'LayoutModel.as');
  if (fs.existsSync(layout)) {
    const lines = fs.readFileSync(layout, 'utf8').split('\n');
    assert.match(lines[9], /min_vp_h:int = 400;/);
    assert.match(lines[12], /max_vp_h:int = 600;/);
  }
});

test('the Flash client at 1:1 (TSMainView.resizeToStage): stage less 40 + 132 + 6, up to 600', () => {
  for (const stage of [480, 578, 600, 700, 778, 900, 1200]) {
    const view = locationViewHeightFor({ availableHeight: stage - 40 - 6, displayWidth: 960 });
    const source = Math.min(600, Math.max(400, stage - 40 - 132 - 6));
    // Same as the source except under 408, where the remake keeps its old view.
    assert.equal(view, Math.max(VIEW_FLOOR_H, source), `stage ${stage}`);
  }
});

test('grows with the window height in the remake page (1280 wide, top bar 68 px)', () => {
  // The 960 px view is drawn 1254 CSS px wide; the page keeps 13 px under the game.
  const at = (windowH) => locationViewHeightFor({ availableHeight: windowH - 68 - 13, displayWidth: 1254 });
  assert.equal(at(700), 408, 'small windows keep the view they had');
  assert.equal(at(900), 494);
  assert.equal(at(1200), 600, 'tall windows stop at max_vp_h');
  // Monotonic between the ends.
  let last = 0;
  for (let h = 500; h <= 1400; h += 25) {
    const v = at(h);
    assert.ok(v >= last && v >= 408 && v <= 600, `${h}: ${v}`);
    last = v;
  }
  // The canvas then fits the window wherever the view is not at an end.
  const v = at(900);
  assert.ok(canvasHeightFor(v) * (1254 / 960) <= 900 - 68 - 13 + 1);
});

test('a scene shorter than the view holds it, never under the floor', () => {
  assert.equal(locationViewHeightFor({ forced: 600, sceneHeight: 590 }), 590);
  assert.equal(locationViewHeightFor({ forced: 600, sceneHeight: 1000 }), 600);
  assert.equal(locationViewHeightFor({ forced: 600, sceneHeight: 300 }), 408);
  assert.equal(locationViewHeightFor({ forced: 450, sceneHeight: 590 }), 450);
  assert.equal(locationViewHeightFor({ forced: 600, sceneHeight: NaN }), 600);
});

test('viewh pins the window share for QA and still clamps', () => {
  assert.equal(locationViewHeightFor({ forced: '408', availableHeight: 2000, displayWidth: 960 }), 408);
  assert.equal(locationViewHeightFor({ forced: 900 }), 600);
  assert.equal(locationViewHeightFor({ forced: 100 }), 408);
  assert.equal(locationViewHeightFor({ forced: null, availableHeight: 2000, displayWidth: 960 }), 600);
  assert.equal(locationViewHeightFor({}), DEFAULT_VP_H, 'unmeasured: the smallest view');
  assert.equal(locationViewHeightFor({ availableHeight: 0, displayWidth: 1254 }), 408);
});

test('sceneViewCap: the declared height and the smallest layer (TSMainView 1247-1257)', () => {
  assert.ok(Number.isNaN(sceneViewCap(null)));
  assert.equal(sceneViewCap({ worldH: 660 }), 660);
  assert.equal(sceneViewCap({ worldH: 1100, sourceWorldH: 1000 }), 1000);
  assert.equal(sceneViewCap({ worldH: 1100, sourceWorldH: 1000, street: { layers: [{ h: 1000 }, { h: 590 }, { w: 3 }] } }), 590);
  const street = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/streets/GA55S7P5RJ42VTG.json'), 'utf8'));
  assert.ok(sceneViewCap({ sourceWorldH: 1000, street }) >= 600, 'Dust Path 1E grows to the full 600');
  // Symphonious Maximus' peaks were drawn for the 408 px view.
  const sym = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/streets/GUVR3SGQ6EF3400.json'), 'utf8'));
  assert.equal(locationViewHeightFor({ forced: 600, sceneHeight: sceneViewCap({ sourceWorldH: 2200, street: sym }) }), 408);
});

test('game.js sizes the canvas from the rule, live', () => {
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(game, /from '\.\/js\/location-view\.js\?v=/);
  assert.match(game, /let LOCATION_VIEW_H = DEFAULT_VP_H;/);
  assert.match(game, /function syncLocationViewHeight\(\)/);
  assert.match(game, /sceneHeight: sceneViewCap\(bgLayer\)/);
  assert.match(game, /if \(bgLayer !== viewSceneLayer\) syncLocationViewHeight\(\);/);
  assert.match(game, /yCamOffsetAnchor\(Number\.isFinite\(offset\) \? offset : 150, LOCATION_VIEW_H\)/);
  // Authored scenes keep the 540 px canvas they were drawn for.
  assert.match(game, /const AUTHORED_VIEW_H = 540;/);
  // The restoration shots pin the 408 px view they were framed for.
  const capture = fs.readFileSync(path.join(root, 'tools/restoration/capture.mjs'), 'utf8');
  assert.match(capture, /viewh=408/);
  assert.match(capture, /dataset\.locationViewportHeight/);
});
