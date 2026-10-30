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
  LOCATION_VIEW_W,
  VIEW_MAX_W,
  VIEW_CEIL_H,
  VIEW_HOLD_H,
  canvasHeightFor,
  HELD_VIEW_H,
  locationViewHeightFor,
  sceneViewCap,
  sceneViewWidthCap,
  stageFor,
} from '../public/js/location-view.js?v=g476-1';

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
  assert.match(game, /let VIEW_W = LOCATION_VIEW_W;/);
  assert.match(game, /function syncLocationViewHeight\(\{ keepFraming = false \} = \{\}\)/);
  assert.match(game, /sceneWidth: sceneViewWidthCap\(bgLayer, WORLD_W\)/);
  assert.match(game, /sceneHeight = sceneViewCap\(bgLayer\)/);
  assert.match(game, /if \(bgLayer !== viewSceneLayer\) syncLocationViewHeight\(\);/);
  assert.match(game, /yCamOffsetAnchor\(Number\.isFinite\(offset\) \? offset : 150, LOCATION_VIEW_H\)/);
  // The renderer follows both axes, and its density follows the scale.
  assert.match(game, /app\.renderer\.resize\(VIEW_W, VIEW_H, resolution\)/);
  // Authored scenes keep the 540 px canvas they were drawn for.
  assert.match(game, /const AUTHORED_VIEW_H = 540;/);
  // The restoration shots pin the 408 px view they were framed for.
  const capture = fs.readFileSync(path.join(root, 'tools/restoration/capture.mjs'), 'utf8');
  assert.match(capture, /viewh=408/);
  assert.match(capture, /dataset\.locationViewportHeight/);
});

// g458 (Austin's UI audit 1): the stage fits the window in both axes and shows more world.
const TOP_BAR = 59;
const DESKTOP = [[1024, 640], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]];
const fit = (w, h, scene = {}) => stageFor({ width: w, height: h - TOP_BAR, ...scene });

test('stageFor: about 1:1 on laptops, more world on bigger windows, magnified past 1680 x 720', () => {
  assert.equal(LOCATION_VIEW_W, 960);
  assert.equal(VIEW_MAX_W, 1680);
  assert.equal(VIEW_CEIL_H, 720);
  const street = { sceneWidth: 6000, sceneHeight: 1000 };
  const at = Object.fromEntries(DESKTOP.map(([w, h]) => [`${w}x${h}`, fit(w, h, street)]));
  for (const key of ['1024x640', '1280x800', '1440x900']) assert.equal(at[key].scale, 1, `${key} draws 1:1`);
  assert.deepEqual([at['1024x640'].viewW, at['1024x640'].viewH], [1024, 449]);
  // At least the original's 1000 x 600 at 1280 x 800 (LayoutModel max_vp_w/h).
  assert.ok(at['1280x800'].viewW >= 1000 && at['1280x800'].viewH >= 600, JSON.stringify(at['1280x800']));
  assert.deepEqual([at['1440x900'].viewW, at['1440x900'].viewH], [1440, 709]);
  // Past the caps it magnifies, a little, instead of drawing the art tiny.
  for (const key of ['1920x1080', '2560x1440']) {
    assert.equal(at[key].viewH, VIEW_CEIL_H, key);
    assert.ok(at[key].viewW <= VIEW_MAX_W && at[key].viewW > 1500, `${key}: ${at[key].viewW}`);
    assert.ok(at[key].scale > 1 && at[key].scale < 1.7, `${key}: ${at[key].scale}`);
  }
  // A bigger window never shows less world.
  let last = 0;
  for (const [w, h] of DESKTOP) {
    const s = at[`${w}x${h}`];
    const area = s.viewW * s.viewH;
    // (16:9 at 2560 is a hair narrower than at 1920: the top bar is a smaller share.)
    assert.ok(area >= last * 0.97, `${w}x${h}`);
    last = area;
  }
  // The old rule showed 960 x 408 at 1.97x at 1920 x 1080.
  assert.ok(at['1920x1080'].viewW * at['1920x1080'].viewH > 2.9 * 960 * 408);
});

test('stageFor: the canvas fills the game area exactly, so the page never scrolls', () => {
  for (let w = 1024; w <= 2560; w += 37) {
    for (let h = 640; h <= Math.min(1440, w); h += 41) {
      for (const scene of [{}, { sceneWidth: 6000, sceneHeight: 1000 }, { sceneWidth: 960, sceneHeight: 540 }, { sceneWidth: 1200, sceneHeight: 300 }]) {
        const room = h - TOP_BAR;
        const s = stageFor({ width: w, height: room, ...scene });
        const label = `${w}x${h} ${JSON.stringify(scene)}`;
        assert.equal(s.cssWidth, w, label);
        assert.equal(s.cssHeight, room, label);
        // The world drawn is the CSS box at the scale (to a pixel either way).
        assert.ok(Math.abs(s.viewW * s.scale - w) <= s.scale, label);
        assert.ok(Math.abs(s.canvasH * s.scale - room) <= s.scale + 0.01, label);
        // Never under the smallest view every room was tuned for.
        assert.ok(s.viewW >= LOCATION_VIEW_W && s.viewH >= VIEW_FLOOR_H, label);
      }
    }
  }
});

test('stageFor: a scene smaller than the view magnifies to fill it, never under the floors', () => {
  // A 960 px home interior at 1920 x 1080: the old framing, filling the window.
  const home = fit(1920, 1080, { sceneWidth: 960, sceneHeight: 700 });
  assert.equal(home.viewH, VIEW_FLOOR_H);
  assert.ok(home.viewW >= 960 && home.viewW < 1040, JSON.stringify(home));
  // A 600 px tall room: the view holds to it.
  const short = fit(1440, 900, { sceneWidth: 4000, sceneHeight: 600 });
  assert.equal(short.viewH, 600);
  assert.ok(short.scale > 1);
  // Layers narrower than the street hold the width too (sceneViewWidthCap).
  assert.equal(sceneViewWidthCap({ worldW: 3000, street: { layers: [{ w: 3000 }, { w: 1200 }] } }), 1200);
  assert.equal(sceneViewWidthCap(null, 2400), 2400);
  assert.ok(Number.isNaN(sceneViewWidthCap(null)));
  assert.equal(fit(1920, 1080, { sceneWidth: 1200, sceneHeight: 1000 }).viewW, 1200);
});

test('stageFor: small and portrait windows shrink; viewh keeps the old 960 px page', () => {
  const small = stageFor({ width: 800, height: 500 });
  assert.ok(small.scale < 1);
  assert.ok(small.viewW >= 960 && small.viewH >= 408);
  // A phone: the width floor wins, and the canvas sits on the pack with a band above.
  const phone = stageFor({ width: 390, height: 700 });
  assert.equal(phone.viewW, 960);
  assert.ok(phone.cssHeight < 700 && phone.viewH === VIEW_HOLD_H);
  // viewh (QA, restoration and landing shots): a 960 px view scaled to the page width.
  const pinned = stageFor({ width: 1254, height: 1, pinnedHeight: 408 });
  assert.equal(pinned.pinned, true);
  assert.deepEqual([pinned.viewW, pinned.viewH, pinned.canvasH], [960, 408, 540]);
  assert.ok(Math.abs(pinned.scale - 1254 / 960) < 1e-9);
  // Unmeasured (boot, tests): the smallest view.
  assert.deepEqual([stageFor({}).viewW, stageFor({}).viewH], [960, 408]);
});

test('style.css: the game fills the window with no page frame, except under viewh', () => {
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const block = css.slice(css.indexOf('/* ===== STAGE (g458'));
  assert.ok(block.length > 100, 'the STAGE block');
  assert.match(block, /html:not\(\.stage-pinned\) #wrap \{[^}]*height: 100dvh;[^}]*overflow: hidden;/);
  assert.match(block, /html:not\(\.stage-pinned\) #wrap > #game-root \{[^}]*flex: 1 1 0;[^}]*min-height: 0;[^}]*border: 0;/);
  assert.match(block, /#game-root > canvas\[role="application"\] \{[^}]*height: var\(--stage-h, 100%\) !important;/);
  // clip, not just hidden: a focus or a scroll into view (award rays hang past the edge) cannot scroll the game.
  assert.match(block, /html:not\(\.stage-pinned\) #wrap \{[^}]*overflow: clip;/);
  assert.match(block, /html:not\(\.stage-pinned\) #wrap > #game-root \{[^}]*overflow: clip;/);
  const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(game, /document\.documentElement\.classList\.add\('stage-pinned'\)/);
});
