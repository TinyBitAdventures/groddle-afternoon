/**
 * G1157: on a computer the camera never shows below a street's or room's bottom (or its ground line,
 * G1146, where that is higher), the feet still kept over the pack row. At 1280x800 Original the canvas
 * ran the 132 px pack reserve past the bottom: Distant End (700 px tall) showed a third of the screen
 * black under its silhouette ground, and An Autumn Day showed the page's blue under its floor. Glitch's
 * camera stopped at the location's bottom (CameraMan.as 451-453) and held its viewport to the
 * location's height (TSMainView.as 1257).
 * Run: node --test tests/g1157-computer-scene-bottom.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, PHONE_GROUND_MIN_CLEARANCE, groundFitScale, phoneGroundWorldHeight, reachableFloorY, sceneBottomLine, stageFor } from '../public/js/location-view.js?v=c308420d';
import { MIN_GROUND_CLEARANCE, cameraTargetY, cameraWorldHeightForGround, yCamOffsetAnchor } from '../public/js/movement.js?v=f4be1a05';
import { STREET_GROUND_LINES } from '../public/js/street-ground-lines.js?v=4daa1c3b';
import { MAIN as AUTUMN } from '../public/js/quest-rooms/an-autumn-day.js?v=a107a46e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const street = (tsid) => JSON.parse(readFileSync(join(root, `public/assets/streets/${tsid}.json`), 'utf8'));
const DISTANT_END = 'GHVECS766MC3LHP';
const HECHEY = 'GLI2V0UN7RD1T2J';
const WINDOWS = [[1280, 800], [1920, 1080], [1440, 900], [2560, 1440]];
const ZOOMS = [0, 1];
/** The Modern pack row's band over the canvas's bottom (CSS px). */
const PACK_CSS = 64;

/** A scene as game.js sees it: its layer, width, height, deepest floor and y_cam_offset. */
function streetScene(tsid) {
  const s = street(tsid);
  const H = s.bounds.b - s.bounds.t;
  const floor = Math.max(...s.platforms.map((p) => Math.max(p.y1, p.y2) - s.bounds.t));
  const offset = Number(s.physics?.setting?.y_cam_offset);
  return { layer: { sourceWorldH: H, worldH: H, street: { tsid } }, width: s.bounds.r - s.bounds.l, height: H, floor, offset: Number.isFinite(offset) ? offset : 150 };
}
const autumnScene = () => ({ layer: { worldH: AUTUMN.H }, width: AUTUMN.W, height: AUTUMN.H, floor: AUTUMN.FLOOR, offset: 150 });

/** Where the canvas's bottom lands (world px) with the feet on the deepest floor (game.js frame), with or without G1157. */
function frame(scene, { width, height, zoom, fix = true, packCss = PACK_CSS }) {
  const bottom = fix ? sceneBottomLine(scene.layer) : NaN;
  const groundFit = fix ? { bottom, floorY: scene.floor, coverCss: packCss, clearance: MIN_GROUND_CLEARANCE } : undefined;
  const stage = stageFor({ width, height, zoom, packReserve: MIN_PACK_HEIGHT, sceneWidth: scene.width, sceneHeight: scene.height, groundFit });
  const anchor = yCamOffsetAnchor(scene.offset, stage.viewH);
  let world = cameraWorldHeightForGround(scene.height, scene.floor, stage.viewH, anchor);
  if (fix) world = phoneGroundWorldHeight({ worldHeight: world, groundLine: bottom, floorY: scene.floor, packReserve: MIN_PACK_HEIGHT, packCoverCss: packCss, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE });
  const camY = cameraTargetY(scene.floor, world, stage.viewH, anchor);
  const canvasBottom = camY + stage.viewH + MIN_PACK_HEIGHT;
  const packTop = canvasBottom - (packCss > 0 ? packCss / stage.scale : 0);
  return { stage, camY, canvasBottom, feetOverPack: packTop - scene.floor, line: bottom };
}

describe('G1157: the line a computer camera stops at', () => {
  it('a street\'s bottom, or its ground line where that is higher; a room\'s own height', () => {
    // Distant End's art covers 11 px under its bottom: the bottom wins.
    assert.equal(STREET_GROUND_LINES[DISTANT_END], 711);
    assert.equal(sceneBottomLine(streetScene(DISTANT_END).layer), 700);
    assert.equal(sceneBottomLine({ sourceWorldH: 1000, worldH: 1040, street: { tsid: 'X' } }, { X: 980 }), 980);
    assert.equal(sceneBottomLine({ sourceWorldH: 1000, worldH: 1040, street: { tsid: 'NONE' } }), 1000, 'the street, not the camera padding under its floor');
    assert.equal(sceneBottomLine(autumnScene().layer), AUTUMN.H);
    assert.equal(sceneBottomLine({ worldH: 1320, groundLine: 1250 }), 1250, 'a room naming its own line');
    assert.ok(Number.isNaN(sceneBottomLine(null)));
  });

  it('reachableFloorY: the fallback ground counts only where no floor runs the whole width over it', () => {
    // An Autumn Day: its floor line spans the room; the fallback ground (80 px over the bottom) is under it.
    const floor = { x1: 0, y1: AUTUMN.FLOOR, x2: AUTUMN.W, y2: AUTUMN.FLOOR, pc_perm: -1 };
    assert.equal(reachableFloorY([floor, { x1: 100, y1: 900, x2: 300, y2: 900 }], AUTUMN.H - 80, AUTUMN.W), AUTUMN.FLOOR);
    // A gap in the floor: the fallback ground is a floor you can fall to.
    assert.equal(reachableFloorY([{ ...floor, x2: AUTUMN.W - 200 }], AUTUMN.H - 80, AUTUMN.W), AUTUMN.H - 80);
    // A ceiling (pc_perm 1) does not hold you; no lines at all: the ground.
    assert.equal(reachableFloorY([{ ...floor, pc_perm: 1 }], AUTUMN.H - 80, AUTUMN.W), AUTUMN.H - 80);
    assert.equal(reachableFloorY([], 620, 1500), 620);
    // A line under the ground still counts as the deepest.
    assert.equal(reachableFloorY([{ x1: 0, y1: 700, x2: 1500, y2: 700 }], 620, 1500), 700);
  });

  it('groundFitScale: the canvas fits the line, or the feet\'s room over the pack row', () => {
    assert.equal(groundFitScale({ height: 800, bottom: 700 }), 800 / 700);
    assert.equal(groundFitScale({ height: 800, bottom: NaN }), 0);
    // A floor 30 px over the line: the feet keep those 30 px over a 64 px pack row.
    assert.equal(groundFitScale({ height: 800, bottom: 700, floorY: 670, coverCss: 64 }), Math.min(800 / 700, (800 - 64) / 700));
    assert.equal(groundFitScale({ height: 800, bottom: 700, floorY: 690, coverCss: 0 }), 800 / 702, 'never under the least room');
  });
});

describe('G1157: the canvas never runs past the scene\'s bottom', () => {
  for (const [name, scene] of [['Distant End', streetScene(DISTANT_END)], ['An Autumn Day', autumnScene()], ['Hechey Track', streetScene(HECHEY)]]) {
    it(`${name}: at every window and zoom, the feet over the pack row`, () => {
      for (const [width, height] of WINDOWS) {
        for (const zoom of ZOOMS) {
          const at = `${name} ${width}x${height} zoom ${zoom}`;
          const after = frame(scene, { width, height, zoom });
          const room = Math.min(MIN_GROUND_CLEARANCE, Math.max(PHONE_GROUND_MIN_CLEARANCE, after.line - scene.floor));
          assert.ok(after.canvasBottom <= Math.max(after.line, scene.floor + room + PACK_CSS / after.stage.scale) + 1, `${at}: canvas ends ${after.canvasBottom.toFixed(1)}, line ${after.line}`);
          assert.ok(after.feetOverPack >= Math.min(room, MIN_GROUND_CLEARANCE) - 1, `${at}: feet ${after.feetOverPack.toFixed(1)} over the pack row`);
          assert.ok(after.camY >= 0, `${at}: never above the top (${after.camY})`);
        }
      }
    });
  }

  it('before: Distant End and An Autumn Day showed 100 px or more under their bottom at 1280x800 Original', () => {
    for (const scene of [streetScene(DISTANT_END), autumnScene()]) {
      const before = frame(scene, { width: 1280, height: 800, zoom: 1, fix: false });
      // An Autumn Day is now 280 px deep under its floor (G1159), so only Distant End still shows the old band unfixed.
      if (scene.layer?.street?.tsid === DISTANT_END || scene.height === 700) assert.ok(before.canvasBottom - scene.height >= 100, `before ${before.canvasBottom} vs ${scene.height}`);
      const after = frame(scene, { width: 1280, height: 800, zoom: 1 });
      assert.ok(after.canvasBottom - scene.height <= PACK_CSS / after.stage.scale, `after ${after.canvasBottom} vs ${scene.height}`);
    }
  });

  it('a short, wide street magnifies to its bottom (1920x1080 Wide); a tall one keeps its stage', () => {
    // Distant End is 1000 px wide, so its width already magnifies it; a 700 px street 4000 wide does not.
    const short = { layer: { sourceWorldH: 700, worldH: 710, street: { tsid: 'NONE' } }, width: 4000, height: 700, floor: 670, offset: 150 };
    const before = frame(short, { width: 1920, height: 1080, zoom: 0, fix: false });
    const after = frame(short, { width: 1920, height: 1080, zoom: 0 });
    assert.equal(before.stage.viewH, 700, 'the old rule held the view to the street, the canvas past it');
    assert.ok(after.stage.scale > before.stage.scale);
    assert.ok(after.stage.viewH + MIN_PACK_HEIGHT <= Math.max(700, short.floor + 30 + PACK_CSS / after.stage.scale) + 1);
    assert.ok(after.canvasBottom <= Math.max(700, short.floor + 30 + PACK_CSS / after.stage.scale) + 1);
    const hechey = streetScene(HECHEY);
    for (const [width, height] of WINDOWS) {
      for (const zoom of ZOOMS) {
        assert.deepEqual(frame(hechey, { width, height, zoom }).stage, frame(hechey, { width, height, zoom, fix: false }).stage, `${width}x${height} zoom ${zoom}`);
      }
    }
  });
});

describe('G1157: game.js', () => {
  it('computers only, not a home street\'s house fit; the stage and every camera clamp', () => {
    assert.match(game, /function computerGroundBottom\(\) \{\n  if \(TOUCH_PHONE \|\| PINNED_VIEW_H > 0 \|\| !bgLayer \|\| bgLayer\.fitViewH > 0\) return NaN;\n  \/\/ 1 px short[^\n]*\n  return sceneBottomLine\(bgLayer\) - 1;/);
    assert.match(game, /groundFit: computerGroundFit\(\),/);
    const fn = game.slice(game.indexOf('function activeCameraWorldHeight('), game.indexOf('function clampWorldOverlayX('));
    assert.match(fn, /const line = phoneLine > 0 \? phoneLine : computerGroundBottom\(\);/);
    assert.match(fn, /const floor = phoneLine > 0 \? deepest : deepestReachableFloorY\(\);/);
    assert.match(game, /return \{ bottom, floorY: deepestReachableFloorY\(\), coverCss: cameraPackCoverCss/);
    assert.match(game, /function deepestReachableFloorY\(\) \{\n  return reachableFloorY\(streetPlatforms, GROUND_Y, WORLD_W\);/);
    // The pack row is measured on computers too.
    const cover = game.slice(game.indexOf('function syncCameraPackCover('), game.indexOf('function activeCameraWorldHeight('));
    assert.doesNotMatch(cover, /if \(!TOUCH_PHONE\) return;/);
  });
});
