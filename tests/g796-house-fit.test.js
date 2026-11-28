// G796 follow-up (Austin 2026-11-22, "Raise it on home streets"): the whole house shows while you
// walk on a home street. The framing is a pure function of the house's height (its art bounds),
// the window (view height) and the zoom: js/home-house.js houseFitViewH asks for a view, and
// js/location-view.js stageFor zooms out until the view holds it. Streets without a house keep
// their stage exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOUSE_HEADROOM, HOUSE_STYLE_IDS, houseFitViewH, houseLot } from '../public/js/home-house.js?v=3c88c47c';
import { homeStreetLayout } from '../public/js/home-cultivation.js?v=61295953';
import { LANDSCAPE_PHONE_FIT_MIN_SHARE, MIN_PACK_HEIGHT, stageFor } from '../public/js/location-view.js?v=c308420d';
import { MIN_GROUND_CLEARANCE, cameraTargetY, cameraWorldHeightForGround, yCamOffsetAnchor } from '../public/js/movement.js?v=f4be1a05';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// features/homes-feature.js STREET_GROUND_Y and STREET_WORLD_H (that module needs a browser).
const GROUND_Y = 870;
const WORLD_H = GROUND_Y + 102;
const STREET_W = homeStreetLayout({}).width;

const WINDOWS = [
  [1400, 820],
  [1280, 800],
  [1024, 768],
  [1920, 1080],
  [2560, 1440],
  [1366, 700],
];
const ZOOMS = [0, 0.5, 1];

const fitOf = (id) => houseFitViewH(id, null, false, { groundY: GROUND_Y, worldH: WORLD_H });

/** Where the walking camera rests (game.js frame: streetCameraAnchor, activeCameraWorldHeight, cameraTargetY). */
function frame(id, stageArgs) {
  const stage = stageFor({ packReserve: MIN_PACK_HEIGHT, sceneWidth: STREET_W, sceneHeight: WORLD_H, ...stageArgs, fitViewH: fitOf(id) });
  const anchor = yCamOffsetAnchor(150, stage.viewH);
  const camY = cameraTargetY(GROUND_Y, cameraWorldHeightForGround(WORLD_H, GROUND_Y, stage.viewH, anchor), stage.viewH, anchor);
  const top = GROUND_Y + houseLot(id).bounds.t - camY;
  const feet = GROUND_Y - camY;
  return { stage, camY, top, feet };
}

test('houseFitViewH: the soil under the walk line, the house over its foot (its art) and the headroom', () => {
  const firebog = houseLot('firebog').bounds;
  assert.ok(-firebog.t > 730, 'the Firebog House stands about 735 px tall with its bells');
  assert.equal(fitOf('firebog'), Math.ceil(WORLD_H - GROUND_Y - firebog.t + HOUSE_HEADROOM));
  assert.ok(fitOf('firebog') > fitOf('whimsy') && fitOf('whimsy') > fitOf('cottage'), 'a taller house asks for more view');
  assert.equal(houseFitViewH('cottage', null, false, { groundY: GROUND_Y, worldH: WORLD_H, headroom: 0 }), fitOf('cottage') - HOUSE_HEADROOM);
});

test('every house shows whole over the walk line at every zoom and computer window, the feet and ground still in view', () => {
  for (const id of HOUSE_STYLE_IDS) {
    for (const [width, height] of WINDOWS) {
      for (const zoom of ZOOMS) {
        const { stage, top, feet } = frame(id, { width, height, zoom });
        const at = `${id} at ${width}x${height}, zoom ${zoom} (view ${stage.viewW}x${stage.viewH})`;
        assert.ok(top >= HOUSE_HEADROOM - 1, `${at}: the house top sits ${top.toFixed(1)} px under the view's top`);
        assert.ok(feet <= stage.viewH - MIN_GROUND_CLEARANCE, `${at}: the feet stay over the pack`);
        assert.ok(stage.viewH <= WORLD_H, `${at}: never more than the street's own height`);
      }
    }
  }
});

test('the Firebog House and the House of Whimsy at 1400x820 Original: zoomed out just enough', () => {
  for (const id of ['firebog', 'whimsy']) {
    const plain = stageFor({ width: 1400, height: 820, packReserve: MIN_PACK_HEIGHT, sceneWidth: STREET_W, sceneHeight: WORLD_H, zoom: 1 });
    const { stage, top } = frame(id, { width: 1400, height: 820, zoom: 1 });
    assert.ok(stage.scale < plain.scale, `${id}: drawn wider than the street without a house`);
    assert.equal(stage.viewH, fitOf(id), `${id}: the view is the house's fit, no more`);
    assert.ok(top >= HOUSE_HEADROOM - 1 && top <= HOUSE_HEADROOM + 2, `${id}: its top just under the headroom (${top.toFixed(1)})`);
  }
});

test('only zooms out: a view already big enough keeps its stage, and a street with no house is untouched', () => {
  const args = { width: 1920, height: 1080, packReserve: MIN_PACK_HEIGHT, sceneWidth: STREET_W, sceneHeight: WORLD_H, zoom: 0 };
  // Wide at 1920x1080 is a 720 px view (VIEW_CEIL_H): the Groddle Cottage fits already.
  assert.deepEqual(stageFor({ ...args, fitViewH: fitOf('cottage') }), stageFor(args));
  for (const [width, height] of WINDOWS) {
    for (const zoom of ZOOMS) {
      const street = { width, height, packReserve: MIN_PACK_HEIGHT, sceneWidth: 3000, sceneHeight: 1200, zoom };
      assert.deepEqual(stageFor({ ...street, fitViewH: undefined }), stageFor(street), `${width}x${height} zoom ${zoom}`);
      assert.deepEqual(stageFor({ ...street, fitViewH: NaN }), stageFor(street));
    }
  }
  // Never past the scene's own height.
  const huge = stageFor({ ...args, width: 1400, height: 820, zoom: 1, fitViewH: 5000 });
  assert.ok(huge.viewH <= WORLD_H);
});

test('phones keep the avatar and the ground: sideways zooms out toward the house, capped; upright already shows the street', () => {
  for (const [width, height] of [[844, 390], [874, 402], [667, 375]]) {
    const { stage, feet } = frame('firebog', { width, height, phone: true, zoom: 1 });
    assert.ok(stage.landscape, 'a sideways phone');
    assert.ok(feet > 0 && feet <= stage.viewH - MIN_GROUND_CLEARANCE, `${width}x${height}: the feet in view over the pack`);
    // Austin 2026-11-22 "cap it": the fit zooms out to LANDSCAPE_PHONE_FIT_MIN_SHARE of the usual scale, no further.
    const usual = stageFor({ width, height, phone: true, zoom: 1, packReserve: MIN_PACK_HEIGHT, sceneWidth: STREET_W, sceneHeight: WORLD_H });
    assert.ok(stage.scale >= usual.scale * LANDSCAPE_PHONE_FIT_MIN_SHARE - 1e-9, `${width}x${height}: ${stage.scale} not under the cap`);
    assert.ok(stage.scale < usual.scale, `${width}x${height}: still zooms out some`);
  }
  // A computer keeps the full fit: the whole house shows.
  const { top } = frame('firebog', { width: 1400, height: 820, zoom: 1 });
  assert.ok(top >= 0, 'the house top in view on a computer');
  for (const [width, height] of [[390, 844], [393, 659], [430, 932]]) {
    const args = { width, height, phone: true, packReserve: MIN_PACK_HEIGHT, sceneWidth: STREET_W, sceneHeight: WORLD_H };
    assert.deepEqual(stageFor({ ...args, fitViewH: fitOf('firebog') }), stageFor(args), `${width}x${height}: the upright rule as it was`);
    const { stage, top, feet } = frame('firebog', { width, height, phone: true });
    assert.ok(top >= 0 && feet <= stage.viewH - MIN_GROUND_CLEARANCE, `${width}x${height}: house and feet in view`);
  }
});

test('wiring: the home street layer carries the fit, game.js passes it to the stage, nothing else sets one', () => {
  const homes = read('public/js/features/homes-feature.js');
  assert.match(homes, /root\.fitViewH = houseFitViewH\(h\.chassis, h\.config, h\.facingRight, \{ groundY: STREET_GROUND_Y, worldH: STREET_WORLD_H \}\)/);
  assert.match(read('public/game.js'), /fitViewH: bgLayer\?\.fitViewH,/);
  const setters = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(rel);
      else if (ent.name.endsWith('.js') && /\.fitViewH\s*=[^=]/.test(read(rel))) setters.push(rel);
    }
  };
  walk('public/js');
  assert.deepEqual(setters, [path.join('public/js', 'features', 'homes-feature.js')]);
});
