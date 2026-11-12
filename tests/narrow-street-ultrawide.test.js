/**
 * Report #209 (Grimssea Hollow, GDODG1KQLOS2GNO, a street 1125 wide on a 3440 x 1323 screen):
 * the ladder and shelf art drew about 150 px right of the ladders and platforms. With the view
 * wider than the street, game.js centres the street (camX = -spare/2) and draws the middleground
 * at 0, but parallaxLayerOffset put every layer at the view's right edge (percX 1: camX + vpW - w),
 * so a street-sized layer (Grimssea's bark, pegs and shelves, 1125 x 2250) landed spare/2 to the
 * right. Now each layer is centred on the street there (parallaxRestX), the bottom of each sits on
 * the street's bottom on a street shorter than the view (parallaxRestY), edgeMirrorWidths follows,
 * and the sliding case is the same arithmetic as before.
 * Run: node --test tests/narrow-street-ultrawide.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EDGE_MIRROR_MARGIN,
  edgeMirrorWidths,
  parallaxLayerOffset,
  parallaxRestX,
  parallaxRestY,
} from '../public/js/street-render.js?v=47697d4c';

const here = dirname(fileURLToPath(import.meta.url));
const grimssea = JSON.parse(readFileSync(join(here, '../public/assets/streets/GDODG1KQLOS2GNO.json'), 'utf8'));

// Grimssea Hollow: l -563, r 562, t -2250, b 0. The player's view: about 1430 x 408 world px.
const W = grimssea.bounds.r - grimssea.bounds.l;
const H = grimssea.bounds.b - grimssea.bounds.t;
const VP_W = 1430;
const VP_H = 408;
// game.js cameraTargetForPlayer: a scene narrower than the view sits centred.
const CAM_X = -Math.round((VP_W - W) / 2);

/** The rule before report #209, for the sliding case it must still match exactly. */
const before = (layer, camX, camY, vpW, vpH, streetW, streetH) => {
  const maxX = streetW - vpW;
  const maxY = streetH - vpH;
  const percX = maxX > 0 ? camX / maxX : 1;
  const percY = maxY > 0 ? camY / maxY : 1;
  return { x: camX + percX * (vpW - layer.w), y: camY + percY * (vpH - layer.h) };
};

describe('report #209: a street narrower than the view (Grimssea Hollow on an ultrawide)', () => {
  it('draws each street-sized layer on the middleground, not spare/2 to its right', () => {
    assert.equal(W, 1125);
    assert.ok(VP_W > W);
    const layers = grimssea.layers.filter((l) => l.id !== 'middleground');
    assert.deepEqual(layers.map((l) => l.id), ['T_ench_bark', 'T_ench_pegs', 'T_ench_shelves']);
    for (const layer of layers) {
      assert.equal(layer.w, W);
      for (const camY of [0, 900, H - VP_H]) {
        const at = parallaxLayerOffset(layer, CAM_X, camY, VP_W, VP_H, W, H);
        // The middleground is drawn at world 0: same screen x (153 px in from the view's left).
        assert.equal(at.x, 0, `${layer.id} camY ${camY}`);
        assert.equal(at.x - CAM_X, 0 - CAM_X);
        assert.ok(Math.abs(at.y) < 1e-9, `${layer.id} camY ${camY}: y ${at.y}`);
        assert.notEqual(at.x, before(layer, CAM_X, camY, VP_W, VP_H, W, H).x, 'the old rule put it at +spare/2');
      }
    }
    assert.equal(before(layers[0], CAM_X, 0, VP_W, VP_H, W, H).x, 152, 'the reported offset');
  });

  it('centres a narrower or wider layer on the street, wherever the camera is', () => {
    for (const lw of [300, 900, 1125, 1400, 1800]) {
      for (const camX of [CAM_X, -100, 0]) {
        const at = parallaxLayerOffset({ w: lw, h: H }, camX, 0, VP_W, VP_H, W, H);
        assert.equal(at.x, parallaxRestX(lw, W));
        assert.equal(at.x + lw / 2, W / 2, `layer ${lw}: centre on the street's centre`);
      }
    }
  });

  it('a street shorter than the view: a street-sized layer stays at 0, others sit on its bottom', () => {
    const shortH = 380;
    for (const camY of [0, 6, 12]) {
      assert.equal(parallaxLayerOffset({ w: 3000, h: shortH }, 500, camY, 1000, VP_H, 3000, shortH).y, 0, `camY ${camY}`);
      const back = parallaxLayerOffset({ w: 3000, h: 360 }, 500, camY, 1000, VP_H, 3000, shortH);
      assert.equal(back.y + 360, shortH);
      assert.equal(back.y, parallaxRestY(360, shortH));
    }
  });
});

describe('report #209: the sliding case is unchanged', () => {
  it('matches the old rule exactly on a street wider and taller than the view', () => {
    const cases = [[6000, 1000, 1000, 408], [3000, 960, 1000, 408], [1800, 1430, 2250, 408], [1126, 1125, 409, 408]];
    for (const [sw, vpW, sh, vpH] of cases) {
      for (const lw of [500, vpW, sw * 0.8, sw, sw + 500]) {
        for (const lh of [300, sh * 0.96, sh, sh + 200]) {
          for (const f of [0, 0.25, 0.5, 1, 1.1]) {
            const camX = (sw - vpW) * f + 0.25;
            const camY = (sh - vpH) * f + 0.125;
            const layer = { w: lw, h: lh };
            assert.deepEqual(
              parallaxLayerOffset(layer, camX, camY, vpW, vpH, sw, sh),
              before(layer, camX, camY, vpW, vpH, sw, sh),
              `${sw}x${sh} view ${vpW}x${vpH} layer ${lw}x${lh} f ${f}`
            );
          }
        }
      }
    }
    // A pinned sample: Groddle Forest Junction's 6500 foreground with the camera mid-street.
    assert.deepEqual(parallaxLayerOffset({ w: 6500, h: 900 }, 2500, 296, 1000, 408, 6000, 1000), { x: -250, y: 50 });
  });
});

describe('report #209: edgeMirrorWidths agrees with the parallax', () => {
  it('a street-sized layer on a narrow street mirrors exactly what the middleground does', () => {
    const ground = edgeMirrorWidths({ parallax: false, streetW: W, vpW: VP_W, maxInset: VP_W * 0.42 });
    // (1430 - 1125) / 2 = 152.5 px past each end, plus the margin.
    assert.deepEqual(ground, { left: Math.ceil(152.5 + EDGE_MIRROR_MARGIN), right: Math.ceil(152.5 + EDGE_MIRROR_MARGIN) });
    for (const layer of grimssea.layers.filter((l) => l.id !== 'middleground')) {
      assert.deepEqual(edgeMirrorWidths({ layerW: layer.w, streetW: W, vpW: VP_W, maxInset: VP_W * 0.42 }), ground, layer.id);
    }
  });

  it('covers the gap the parallax leaves on each side for any layer width', () => {
    const cam = -(VP_W - W) / 2;
    for (const lw of [600, 1000, 1125, 1300]) {
      const at = parallaxLayerOffset({ w: lw, h: H }, cam, 0, VP_W, VP_H, W, H);
      const lx = at.x - cam;
      const { left, right } = edgeMirrorWidths({ layerW: lw, streetW: W, vpW: VP_W });
      assert.equal(left, Math.min(Math.ceil(lx + EDGE_MIRROR_MARGIN), lw), `layer ${lw} left`);
      assert.equal(right, Math.min(Math.ceil(VP_W - (lx + lw) + EDGE_MIRROR_MARGIN), lw), `layer ${lw} right`);
    }
  });
});
