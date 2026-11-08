/**
 * Two player reports from 2026-11-08 (v0.23.0, Modern, a ~2000 px window):
 * - G582: the camera keeps a street's end left of the Social drawer (its folded rail or the open
 *   drawer), as the original client reserved its right column in its location viewport; the ground
 *   skirt runs on past the end for the strip the camera then shows.
 * - G583: trees and Chickens stand on their feet, not on their frames' empty rows under them
 *   (Guillermo Gamera Way's Bubble Tree on the upper ledge and a Chicken on the arch landing).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cameraTargetX, cameraLocationViewWidth, cameraOverlayCenterX } from '../public/js/movement.js?fresh=railcam';
import { TRANT_FRAME_FOOT, trantFootAnchorY } from '../public/js/trants.js?fresh=railcam';
import { ANIMAL_ANCHOR_Y, animalAnchorY } from '../public/js/animals.js?fresh=railcam';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** A WebP's pixel size from its header (VP8X, VP8L or VP8). */
function webpSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

describe('G582: the camera reserves the Social drawer over the world', () => {
  const game = read('public/game.js');

  it('measures the drawer (rail or open, 0 hidden) and keeps the old rail as a fallback', () => {
    const fn = game.slice(game.indexOf('function syncCameraSafeArea()'), game.indexOf('function cameraTargetForPlayer('));
    assert.match(fn, /socialDrawer\?\.inset\(\)\?\.right/);
    assert.match(fn, /getElementById\('play-context'\)/);
    assert.match(fn, /overlapCss > 0\s*\?/);
    // Re-measured the frame the drawer opens, folds or hides (it writes --inset-r as it does).
    assert.match(game, /function followDrawerInset\(\)[\s\S]*?getPropertyValue\('--inset-r'\) !== drawerInsetSeen\) syncCameraSafeArea\(\)/);
    assert.match(game, /socialDrawer\?\.frame\(\);\n  followDrawerInset\(\);/);
  });

  it('Classic reserves nothing: its chat column sits beside the world', () => {
    const drawer = read('public/js/ui/social-drawer.js');
    // insetNow: only a drawer over the right half of the root counts, not Classic's column.
    assert.match(drawer, /r\.left < rr\.left \+ rr\.width \/ 2 \|\| r\.left >= rr\.right - 1\) return \{ left: 0, right: 0 \}/);
    assert.match(read('public/css/classic.css'), /--inset-r: 0px !important/);
  });

  it('at a street end the whole street shows left of the reserve, and overlays stay in it', () => {
    const view = 1031;
    const world = 6000;
    for (const inset of [0, 37, 170]) {
      const cam = cameraTargetX(world - 20, 0, world, view, 4.4, inset);
      // The street's last pixel is inside the free width, not under the drawer.
      assert.ok(cam + cameraLocationViewWidth(view, inset) >= world - 0.5, `inset ${inset}`);
      assert.ok(cameraOverlayCenterX(view, 200, view, inset, 10) + 100 <= view - inset);
    }
  });

  it('the ground skirt runs on past the right end, mirrored about it', () => {
    const render = read('public/js/street-render.js');
    assert.match(render, /function buildGroundSkirt\([^)]*rightPad = 0\)/);
    assert.match(render, /spr\.scale\.x = -1;\n\s*spr\.x = W \+ pad;/);
    for (const part of ['base.rect(0, sourceH, fullW', 'fade.width = fullW', 'shade.width = fullW', 'deep.rect(0, sourceH + fadeDepth, fullW']) {
      assert.ok(render.includes(part), part);
    }
    assert.match(render, /Number\(opts\.skirtRight\)/);
    assert.match(game, /skirtRight: SKIRT_RIGHT_PAD/);
    // Wide enough for the largest reserve the camera takes (0.42 of the view) at the Original zoom.
    const pad = Number(game.match(/const SKIRT_RIGHT_PAD = (\d+)/)[1]);
    assert.ok(pad >= 0.42 * 1000 * 2, `pad ${pad}`);
  });
});

describe('G583: trees and Chickens stand on their feet', () => {
  it('every measured trant frame matches the shipped file and lifts its foot onto the line', () => {
    for (const [classId, row] of Object.entries(TRANT_FRAME_FOOT)) {
      for (const [stage, pad] of Object.entries(row.pad)) {
        const { h } = webpSize(join(root, `public/assets/sprites/trants/frames/${classId}_m${stage}.webp`));
        assert.equal(h, row.h, `${classId} m${stage} height`);
        assert.ok(pad > 0 && pad < row.h / 4, `${classId} m${stage} pad ${pad}`);
        const y = trantFootAnchorY(classId, Number(stage));
        assert.ok(Math.abs((1 - y) * row.h - pad) < 1e-9);
      }
    }
    assert.equal(trantFootAnchorY('wood_tree', 6), 1);
    assert.equal(trantFootAnchorY('trant_bubble', 2), 1);
    // The reported tree: the Bubble Tree's full-grown frames stand 7 and 11 px lower than before.
    assert.equal(TRANT_FRAME_FOOT.trant_bubble.pad[7], 11);
  });

  it('street, demo and Patch trees take the foot anchor whenever their texture changes', () => {
    const game = read('public/game.js');
    assert.match(game, /trantFootOf\.set\(tex, trantFootAnchorY\(classTsid, m\)\)/);
    assert.match(game, /spr\.anchor\.set\(0\.5, treeAnchorY\(tex\)\)/);
    assert.equal((game.match(/sprite\.anchor\.y = treeAnchorY\(/g) || []).length, 3);
    assert.match(read('public/js/features/patches-feature.js'), /trantFootAnchorY\(plot\.tree\.classId, trantFrameStage\(/);
  });

  it('a Chicken stands on its feet in the street, the yard, the tutorial and husbandry', () => {
    assert.equal(animalAnchorY('npc_chicken'), 97 / 110);
    assert.equal(animalAnchorY('npc_piggy'), 1);
    assert.ok(Object.isFrozen(ANIMAL_ANCHOR_Y));
    const game = read('public/game.js');
    assert.match(game, /function spawnChickens[\s\S]*?spr\.anchor\.y = animalAnchorY\('npc_chicken'\)/);
    for (const f of ['yard-verbs-mp-feature.js', 'animal-husbandry-feature.js', 'newxp-feature.js']) {
      assert.match(read(`public/js/features/${f}`), /anchor\.set\(animalAnchorX\([^)]*\), [^;]*animalAnchorY\(/, f);
    }
  });
});
