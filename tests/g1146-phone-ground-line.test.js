/**
 * G1146 (report #617, Austin's pick 2026-11-22): on a phone the camera stops at the street's lowest
 * full-width ground art (tools/ground-line/build.mjs -> js/street-ground-lines.js), not past the
 * street's bottom, where Briarset Croft showed the bare fill between its last dirt pieces.
 * Run: node --test tests/g1146-phone-ground-line.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, PHONE_GROUND_MIN_CLEARANCE, VIEW_FLOOR_H, phoneCameraAnchor, phoneFeetWorldHeight, phoneGroundWorldHeight, sceneGroundLine, stageFor } from '../public/js/location-view.js?v=76a9ff86';
import { MIN_GROUND_CLEARANCE, cameraTargetY, cameraWorldHeightForGround } from '../public/js/movement.js?v=f4be1a05';
import { STREET_GROUND_LINES } from '../public/js/street-ground-lines.js?v=31e7f393';
import { CELL, GAP_SHARE, groundLineFromCover, measureStreet, rowCover, stampDeco } from '../tools/ground-line/build.mjs?v=1bfd0f53';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const BRIARSET = 'GCR11DNA3EL10TD';
const GRIMSSEA = 'GCR195Q63RK143M';
const street = (tsid) => JSON.parse(readFileSync(join(root, `public/assets/streets/${tsid}.json`), 'utf8'));
const UPRIGHT = { width: 384, height: 644 };
const SIDEWAYS = { width: 640, height: 360 };
const PACK_CSS = 64;

/** Where the canvas's bottom lands (world px) with the feet on the deepest floor, before and after. */
function canvasBottom({ size, tsid, line, packCss = PACK_CSS }) {
  const s = street(tsid);
  const H = s.bounds.b - s.bounds.t;
  const floor = Math.max(...s.platforms.filter((p) => p.pc_perm !== 1).map((p) => Math.max(p.y1, p.y2) - s.bounds.t));
  const stage = stageFor({ ...size, packReserve: MIN_PACK_HEIGHT, sceneWidth: s.bounds.r - s.bounds.l, sceneHeight: H, phone: true, groundLine: line });
  let world = cameraWorldHeightForGround(H, floor, stage.viewH, 0.75);
  world = phoneGroundWorldHeight({ worldHeight: world, groundLine: line, floorY: floor, packReserve: MIN_PACK_HEIGHT, packCoverCss: packCss, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE });
  const camY = cameraTargetY(floor, world, stage.viewH, 0.75);
  return { bottom: camY + stage.viewH + MIN_PACK_HEIGHT, stage, floor, feetOverPack: (camY + stage.viewH + MIN_PACK_HEIGHT - packCss / stage.scale) - floor };
}

describe('G1146: the ground line data', () => {
  it('Briarset Croft and Grimssea Bottom have one just under their bottom', () => {
    for (const tsid of [BRIARSET, GRIMSSEA]) {
      const line = STREET_GROUND_LINES[tsid];
      assert.ok(line > 1000 && line < 1030, `${tsid} ${line}`);
      assert.equal(sceneGroundLine({ street: { tsid } }), line);
    }
    assert.ok(Number.isNaN(sceneGroundLine({ street: { tsid: 'NO_SUCH_STREET' } })));
    assert.ok(Number.isNaN(sceneGroundLine(null)));
    assert.ok(Object.keys(STREET_GROUND_LINES).length > 1000);
  });

  it('the builder: art parked wholly under the bottom does not count, and the line is the end of the whole rows', () => {
    const grid = { cell: CELL, top: 900, cols: 50, rows: 150 };
    grid.data = new Uint8Array(grid.cols * grid.rows);
    // A dirt strip across the whole width down to 1010, one piece reaching 1040 on the left.
    stampDeco(grid, { w: 100, h: 110 }, 50, 1010);
    stampDeco(grid, { w: 40, h: 60 }, 20, 1040);
    const cover = rowCover(grid);
    assert.equal(groundLineFromCover(cover, { top: 900, cell: CELL, floorY: 980 }), 1010);
    assert.ok(GAP_SHARE < 0.05);
    // A see-through art: only the solid half (alpha's left column) counts.
    const g2 = { cell: CELL, top: 900, cols: 50, rows: 150, data: new Uint8Array(50 * 150) };
    stampDeco(g2, { w: 100, h: 110 }, 50, 1010, { w: 2, h: 1, data: Uint8Array.from([1, 0]) });
    const c2 = rowCover(g2);
    assert.ok(Math.abs(c2[40] - 0.5) < 0.05, `cover ${c2[40]}`);
    assert.equal(groundLineFromCover(c2, { top: 900, cell: CELL, floorY: 980 }), null);
  });

  it('the builder measures Briarset Croft as the module says (needs dwebp)', (t) => {
    try { execFileSync('dwebp', ['-version'], { stdio: 'ignore' }); } catch { t.skip('no dwebp'); return; }
    const available = new Set(JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')));
    const m = measureStreet(street(BRIARSET), available);
    assert.equal(m.line, STREET_GROUND_LINES[BRIARSET]);
  });
});

describe('G1146: the phone camera stops at the ground line', () => {
  const line = STREET_GROUND_LINES[BRIARSET];

  it('upright: the scene fits down to the line, magnified a little; computers are unchanged', () => {
    const before = stageFor({ ...UPRIGHT, sceneWidth: 6000, sceneHeight: 1000, phone: true });
    const after = stageFor({ ...UPRIGHT, sceneWidth: 6000, sceneHeight: 1000, phone: true, groundLine: line });
    assert.equal(before.viewH + MIN_PACK_HEIGHT, 1132);
    assert.equal(after.viewH + MIN_PACK_HEIGHT, line);
    const zoom = after.scale / before.scale;
    assert.ok(zoom > 1.05 && zoom < 1.2, `magnified ${zoom}`);
    const desk = stageFor({ width: 1440, height: 810, sceneWidth: 6000, sceneHeight: 1000 });
    assert.deepEqual(stageFor({ width: 1440, height: 810, sceneWidth: 6000, sceneHeight: 1000, groundLine: line }), desk);
    // A line shallower than the floors keep: the view's floor holds.
    const short = stageFor({ ...UPRIGHT, sceneWidth: 3000, sceneHeight: 700, phone: true, groundLine: 300 });
    assert.equal(short.viewH, VIEW_FLOOR_H);
  });

  it('the pack row hidden: the canvas ends at the line (it ran 130 px or more past it)', () => {
    for (const size of [UPRIGHT, SIDEWAYS]) {
      const before = canvasBottom({ size, tsid: BRIARSET, line: NaN, packCss: NaN });
      const after = canvasBottom({ size, tsid: BRIARSET, line, packCss: NaN });
      assert.ok(before.bottom - line >= 130, `before ${before.bottom}`);
      assert.ok(Math.abs(after.bottom - line) <= 1, `after ${after.bottom} vs ${line}`);
    }
  });

  it('the pack row shown: the feet keep their room over it, the strip under the line shrinks', () => {
    for (const size of [UPRIGHT, SIDEWAYS]) {
      const before = canvasBottom({ size, tsid: BRIARSET, line: NaN });
      const after = canvasBottom({ size, tsid: BRIARSET, line });
      assert.ok(after.bottom < before.bottom, `${after.bottom} < ${before.bottom}`);
      assert.ok(after.feetOverPack >= PHONE_GROUND_MIN_CLEARANCE - 1e-6, `feet ${after.feetOverPack} over the pack`);
      // Over the pack row, all the art there is under the feet: the line or the least room.
      assert.ok(after.feetOverPack <= Math.max(line - after.floor, PHONE_GROUND_MIN_CLEARANCE) + 1e-6);
    }
  });

  it('never lower than the usual camera, never above it with no line', () => {
    assert.equal(phoneGroundWorldHeight({ worldHeight: 1040, groundLine: NaN, floorY: 977 }), 1040);
    assert.equal(phoneGroundWorldHeight({ worldHeight: 1040, groundLine: 1400, floorY: 977 }), 1040);
    // Art ending above the floor: the feet still get the least room.
    const w = phoneGroundWorldHeight({ worldHeight: 1040, groundLine: 960, floorY: 977, packCoverCss: 0, scale: 1 });
    assert.equal(w + MIN_PACK_HEIGHT, 977 + PHONE_GROUND_MIN_CLEARANCE);
  });

  it('game.js: phones only, the stage and every camera clamp (activeCameraWorldHeight)', () => {
    assert.match(game, /function phoneGroundLine\(\) \{\n  if \(!TOUCH_PHONE \|\| !modernUi\(\) \|\| PINNED_VIEW_H > 0\) return NaN;/);
    assert.match(game, /groundLine: phoneGroundLine\(\),/);
    const fn = game.slice(game.indexOf('function activeCameraWorldHeight('), game.indexOf('function clampWorldOverlayX('));
    assert.match(fn, /const floor = phoneLine > 0 \? deepest : deepestReachableFloorY\(\);/);
    assert.match(fn, /phoneGroundWorldHeight\(\{ worldHeight: world, groundLine: line, floorY: floor/);
  });
});

describe('G1229 (#654): the feet stand over the phone\'s controls, not only the pack row', () => {
  const KALA = 'GIFGR4QG5IV1QPI';
  // Upright the stick's top stands about 136 CSS px over the pack row's (style.css TOUCH): 200 px over the canvas's bottom.
  const CONTROLS_CSS = 200;
  for (const size of [{ width: 390, height: 844 }, { width: 384, height: 748 }, { width: 375, height: 667 }]) {
    it(`Kala Close at ${size.width}x${size.height}: the street-bottom clamp left the feet under the controls; now they stand over them`, () => {
      const s = street(KALA);
      const line = STREET_GROUND_LINES[KALA];
      const H = s.bounds.b - s.bounds.t;
      const floor = Math.max(...s.platforms.filter((p) => p.pc_perm !== 1).map((p) => Math.max(p.y1, p.y2) - s.bounds.t));
      const stage = stageFor({ ...size, packReserve: MIN_PACK_HEIGHT, sceneWidth: s.bounds.r - s.bounds.l, sceneHeight: H, phone: true, groundLine: line });
      const ground = phoneGroundWorldHeight({ worldHeight: cameraWorldHeightForGround(H, floor, stage.viewH, 0.75), groundLine: line, floorY: floor, packReserve: MIN_PACK_HEIGHT, packCoverCss: PACK_CSS, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE });
      const feetOverControls = (world, anchor) => {
        const camY = cameraTargetY(floor, world, stage.viewH, anchor);
        return (camY + stage.viewH + MIN_PACK_HEIGHT - CONTROLS_CSS / stage.scale) - floor;
      };
      const anchor0 = phoneCameraAnchor({ viewH: stage.viewH, packCoverCss: PACK_CSS, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE });
      assert.ok(feetOverControls(ground, anchor0) < 0, 'before: under the controls');
      const world = phoneFeetWorldHeight({ worldHeight: ground, floorY: floor, packReserve: MIN_PACK_HEIGHT, floorCoverCss: CONTROLS_CSS, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE });
      const anchor = phoneCameraAnchor({ viewH: stage.viewH, packCoverCss: PACK_CSS, scale: stage.scale, clearance: MIN_GROUND_CLEARANCE, floorCoverCss: CONTROLS_CSS });
      assert.ok(world > ground, 'past the street-bottom clamp: the feet win where both cannot hold');
      assert.ok(feetOverControls(world, anchor) >= MIN_GROUND_CLEARANCE - 1, `the feet ${feetOverControls(world, anchor).toFixed(1)} world px over the controls`);
    });
  }
  it('never higher than the usual camera, and no floor cover changes nothing', () => {
    assert.equal(phoneFeetWorldHeight({ worldHeight: 2000, floorY: 900, floorCoverCss: 200, scale: 1 }), 2000);
    assert.equal(phoneFeetWorldHeight({ worldHeight: 1000, floorY: 990, floorCoverCss: NaN, scale: 1 }), 1000);
    assert.equal(phoneCameraAnchor({ viewH: 600, packCoverCss: 64, scale: 1 }), phoneCameraAnchor({ viewH: 600, packCoverCss: 64, scale: 1, floorCoverCss: NaN }));
  });
  it('game.js: the region model\'s floor (phone-layout streetFloor) is the camera\'s safe area', () => {
    assert.match(game, /phoneLayout\?\.streetFloor\?\.\(\)/);
    assert.match(game, /phoneFeetWorldHeight\(\{ worldHeight: ground, floorY: deepest/);
    assert.match(game, /floorCoverCss: cameraFloorCoverCss \}\);/);
  });
});
