/**
 * #495 (G999, Join the Club on an upright Android phone, 384 x 644): the clubhouse's background
 * hills and pines sat at the wrong heights. Every rebuilt room placed its parallax layers for a
 * 408 px view (feet at 0.75 of it: an-autumn-day.js camY0 = floor - 306, rainbow-run-scene.js
 * CAM_GROUND, the camera ranges clubhouse.js names), and kit.sceneRoot moved them with the view's
 * top. An upright phone's view is the room's own height (up to 1000 px, js/location-view.js
 * phoneStage) and a big window's up to 720, so on the floor the camera sat hundreds of px higher
 * than the room was drawn for and the layers stood that much over the floor (the clubhouse's hills
 * 260 px over its field). Same class as G954 (home streets, 6913e343a3f) and R22 (#483: street
 * layers past the street's bottom, street-render.js parallaxLayerOffset). Layers now follow the
 * view's bottom edge (kit.js roomLayerOffset).
 *
 * This builds every room with hand-placed parallax layers (kit.sceneRoot, factor between 0 and 1)
 * on a fake Pixi, stands the player on each of its floors in each view (two upright phones and
 * two computer windows) with the game's camera (movement.js cameraTargetY), and checks each layer:
 * on the room's floor it stands no higher than the 408 px view drew it there, and on any floor it
 * sits where some 408 px camera on the room puts it.
 * Run: node --test tests/g999-room-parallax-views.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import * as kit from '../public/js/quest-rooms/kit.js?v=f2c0da0c';
import { stageFor } from '../public/js/location-view.js?v=f0a5f17d';
import { cameraTargetY, cameraWorldHeightForGround } from '../public/js/movement.js?v=f4be1a05';
import { FakeEl, fakePixi } from './fake-scene.js';

/** The rooms (js/quest-rooms/<file>.js) and stages whose scenes have parallax layers. */
const ROOMS = [
  ['clubhouse', ['clubhouse', 'pintura']],
  ['esquibeth', ['waterfall_01', 'waterfall_02', 'waterfall_03']],
  ['gwendolyn', ['desert', 'outer_mind', 'inner_mind']],
  ['juju-camp', [undefined]],
  ['penalty', [undefined]],
  ['picto-pattern', [undefined]],
  ['back-alley', ['alley']],
  ['an-autumn-day', ['main']],
  ['rainbow-run', [undefined]],
];

/** Screens: #495's Android upright, an iPhone upright, a 1280 x 800 window's game area, a 1920 x 1080 one's. */
const VIEWS = [
  { name: '384x644 phone', width: 384, height: 644, phone: true },
  { name: '402x812 phone', width: 402, height: 812, phone: true },
  { name: '1280x740 window', width: 1280, height: 740, phone: false },
  { name: '1920x1020 window', width: 1920, height: 1020, phone: false },
];
const REF = kit.ROOM_LAYER_VIEW_H;

function build(file, stage, room) {
  const ctx = { PIXI: fakePixi, kit, data: {}, param: () => null, stage, questId: null, engine: {}, state: {} };
  return room.build(ctx, stage);
}

/** The y of each walkable floor (a platform's top, level lines only), deepest last. */
function floorsOf(scene) {
  const ys = (scene.platforms || []).map((p) => Math.max(p.y1, p.y2)).filter(Number.isFinite);
  return [...new Set(ys)].sort((a, b) => a - b);
}

/** The camera with the player standing at y in a view `viewH` tall, as game.js frames a room. */
function cameraFor(scene, y, viewH) {
  const floors = floorsOf(scene);
  const worldH = cameraWorldHeightForGround(scene.height, floors.at(-1), viewH);
  return { camY: cameraTargetY(y, worldH, viewH), maxY: Math.max(0, worldH - viewH) };
}

describe('room parallax layers stand on the floor in every view (G999, #495)', () => {
  const saved = {};
  const built = [];
  before(async () => {
    saved.document = globalThis.document;
    saved.PIXI = globalThis.PIXI;
    globalThis.PIXI = fakePixi;
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    for (const [file, stages] of ROOMS) {
      const { room } = await import(`../public/js/quest-rooms/${file}.js`);
      for (const stage of stages) built.push({ key: `${file}${stage ? `/${stage}` : ''}`, scene: build(file, stage, room) });
    }
  });
  after(() => {
    globalThis.document = saved.document;
    globalThis.PIXI = saved.PIXI;
  });

  it('roomLayerOffset: the view bottom drives a layer; the sky stays on the screen; no view, the plain rule', () => {
    assert.deepEqual(kit.roomLayerOffset(0, 300, 500, 1000), { x: 300, y: 500 });
    assert.deepEqual(kit.roomLayerOffset(0.5, 300, 500, REF), { x: 150, y: 250 });
    assert.deepEqual(kit.roomLayerOffset(0.5, 300, 500, REF + 200), { x: 150, y: 350 });
    assert.deepEqual(kit.roomLayerOffset(0.5, 300, 500), { x: 150, y: 250 });
  });

  it('every room: 25 parallax layers or more in 9 room files', () => {
    const layers = built.flatMap(({ scene }) => scene.background.children.filter((c) => c.factor > 0 && c.factor < 1));
    assert.ok(layers.length >= 25, `${layers.length} layers`);
  });

  it('each layer, each floor, each view: no higher than the room drew it on its floor, never off the drawn range', () => {
    const bad = [];
    let checked = 0;
    for (const { key, scene } of built) {
      const root = scene.background;
      const layers = root.children.filter((c) => c.factor > 0 && c.factor < 1);
      const floors = floorsOf(scene);
      const floor = floors.at(-1);
      // The cameras a 408 px view takes on this room's floors: the layers' drawn range.
      const ref = floors.map((y) => cameraFor(scene, y, REF).camY);
      const refMin = Math.min(...ref);
      const refFloor = cameraFor(scene, floor, REF).camY;
      const refMax = cameraFor(scene, floor, REF).maxY;
      for (const v of VIEWS) {
        const { viewW, viewH } = stageFor({ width: v.width, height: v.height, sceneWidth: scene.width, sceneHeight: scene.height, phone: v.phone });
        for (const y of floors) {
          const { camY } = cameraFor(scene, y, viewH);
          root.updateParallax(0, camY, viewW, viewH, viewH + 132);
          for (const layer of layers) {
            checked += 1;
            // The camera a 408 px view would have for this layer offset.
            const as = layer.y / (1 - layer.factor);
            const at = `${key} f ${layer.factor} ${v.name} (view ${viewH}) on y ${y}`;
            if (as < refMin - 1 || as > refMax + 1) bad.push(`${at}: as a ${REF} px camera at ${as.toFixed(0)}, drawn for ${refMin.toFixed(0)} to ${refMax.toFixed(0)}`);
            if (y === floor && as < refFloor - 1) bad.push(`${at}: ${((refFloor - as) * (1 - layer.factor)).toFixed(0)} px higher than drawn for the floor`);
          }
        }
      }
    }
    assert.ok(checked > 400, `${checked} checks`);
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} wrong`);
  });

  it("a layer that is the sky keeps to the view's top (the Purple Journey's gradient at 0.05)", async () => {
    const { buildVoyageScene } = await import('../public/js/purple-journey-scene.js?v=afe084c7');
    const built = buildVoyageScene(fakePixi);
    const root = built.background || built;
    const sky = root.children.find((c) => c.factor === 0.05);
    assert.ok(sky, 'the voyage sky layer');
    for (const camY of [0, 150, 300]) {
      root.updateParallax(0, camY, 675, 1000, 1132);
      assert.equal(sky.y, camY * 0.95, `camera ${camY}: its top stays at or above the view's`);
    }
  });

  it('the clubhouse on the floor: its far hills and mid pines stand with their feet behind the field', async () => {
    const club = await import('../public/js/quest-rooms/clubhouse.js?v=3929ff3c');
    const { scene } = built.find((b) => b.key === 'clubhouse/clubhouse');
    const root = scene.background;
    const fieldTop = club.FLOOR - 130; // buildClub's dusk field
    for (const v of VIEWS) {
      const { viewW, viewH } = stageFor({ width: v.width, height: v.height, sceneWidth: scene.width, sceneHeight: scene.height, phone: v.phone });
      const { camY } = cameraFor(scene, club.FLOOR, viewH);
      root.updateParallax(0, camY, viewW, viewH, viewH + 132);
      for (const layer of root.children.filter((c) => c.factor > 0 && c.factor < 1)) {
        for (const piece of layer.children) {
          const foot = piece.y + layer.y;
          assert.ok(foot >= fieldTop, `${v.name}: f ${layer.factor} piece at ${piece.x} stands at ${foot.toFixed(0)}, over the field's top ${fieldTop}`);
        }
      }
    }
  });
});
