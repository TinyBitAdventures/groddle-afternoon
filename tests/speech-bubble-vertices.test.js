/**
 * G897 (#427, #433): speech bubbles and their reward slugs build with no
 * NaN vertex. A path that repeats a point (a lineTo ending on the tangent
 * point an arcTo starts from) gave Pixi 8's stroke builder a zero-length
 * segment and NaN vertices; a phone GPU drew those as thin lines from the
 * bubble's corners to the middle of the screen. The vendored Pixi build is
 * run in a vm and each shape's geometry is built as the renderer builds it.
 * Run: node --test tests/speech-bubble-vertices.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { outlinePoints, OUTLINE_EPSILON } from '../public/js/outline-points.js?v=c9edb089';
import { placeSpeechTail, speechBubbleOutline, SPEECH_BUBBLE_RADIUS } from '../public/js/speech-placement.js?v=0371ea0c';
import { SLUG_LAYOUT, SLUG_STYLES, drawSlugIcon, slugBox, slugPillPath } from '../public/js/speech-slugs.js?v=d5cc8b6f';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(read('public/vendor/pixi/pixi-8.23.0.min.js'), g);
  return g.PIXI;
}
const PIXI = loadPixi();

/** Vertices Pixi builds for `gr` that are not finite numbers. */
function strayVertices(gr) {
  const out = { geometryData: { vertices: [], indices: [], uvs: [] }, batches: [] };
  PIXI.buildContextBatches(gr.context, out);
  assert.ok(out.geometryData.vertices.length > 0, 'something was built');
  return out.geometryData.vertices.filter((v) => !Number.isFinite(v)).length;
}

/** As game.js drawSpeechBubble draws it. */
function bubble(width, height, tail, up) {
  const g = new PIXI.Graphics();
  g.poly(outlinePoints(speechBubbleOutline({ width, height, tip: tail.tip, base: tail.base, up })), true);
  return g.fill({ color: 0xfffdf5, alpha: 1 }).stroke({ width: 2, color: 0x594c40, alpha: 0.34 });
}

describe('G897: no stray vertex in a speech bubble', () => {
  it('the harness catches it: the old path steps (lineTo onto each arc) built NaN vertices', () => {
    const g = new PIXI.Graphics();
    for (const [op, ...a] of speechBubbleOutline({ width: 150, height: 55, tip: 75, base: 75 })) g[op](...a);
    g.fill({ color: 0xfffdf5 }).stroke({ width: 2, color: 0x594c40, alpha: 0.34 });
    assert.ok(strayVertices(g) > 0);
  });

  it('every bubble width, height, tail place and side builds finite vertices', () => {
    const widths = [40, 41.5, 87.25, 150, 211.37, 262];
    const heights = [21, 38, 55.5, 72, 140];
    for (const width of widths) {
      for (const height of heights) {
        for (const speakerOff of [-1000, -40, -7.5, 0, 13.25, 40, 1000]) {
          const tail = placeSpeechTail({ bubbleX: 0, width, speakerX: speakerOff });
          for (const up of [false, true]) {
            assert.equal(strayVertices(bubble(width, height, tail, up)), 0, `${width}x${height} tail ${tail.tip},${tail.base} ${up ? 'up' : 'down'}`);
          }
        }
      }
    }
  });

  it('reward slug pills and their icons build finite vertices', () => {
    const L = SLUG_LAYOUT;
    for (const type of Object.keys(SLUG_STYLES)) {
      for (const [sign, num] of [[7, 7], [7, 21], [7, 40], [0, 0]]) {
        const box = slugBox(type, sign, num);
        const g = slugPillPath(new PIXI.Graphics(), box.width, box.height, L.cornerRadius, box.rightRadius)
          .fill({ color: 0xffffff }).stroke({ width: L.borderWidth, color: L.borderColor });
        assert.equal(strayVertices(g), 0, `${type} pill ${box.width}x${box.height}`);
      }
      for (const neg of [false, true]) assert.equal(strayVertices(drawSlugIcon(new PIXI.Graphics(), type, neg)), 0, `${type} icon`);
    }
    // A pill as wide as it is tall: the two arcs meet.
    const round = slugPillPath(new PIXI.Graphics(), 21, 21, 12, 12).fill({ color: 0xffffff }).stroke({ width: 2, color: 0xffffff });
    assert.equal(strayVertices(round), 0);
  });

  it('outlinePoints repeats no point, the last not on the first', () => {
    const pts = outlinePoints(speechBubbleOutline({ width: 150, height: 55, tip: 75, base: 75 }));
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      assert.ok(Math.hypot(pts[i * 2] - pts[j * 2], pts[i * 2 + 1] - pts[j * 2 + 1]) >= OUTLINE_EPSILON, `point ${i}`);
    }
    // The corners still round off at the bubble's radius: no point outside the body and tail.
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 === 1);
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.max(...xs), 150);
    assert.equal(Math.min(...ys), 0);
    assert.equal(Math.max(...ys), 66);
    assert.ok(!pts.some((v, i) => i % 2 === 0 && v > 0 && v < SPEECH_BUBBLE_RADIUS && ys[i / 2] === 0), 'top-left corner is rounded');
  });

  it('game.js draws the bubble from outlinePoints, not step by step', () => {
    const src = read('public/game.js');
    const fn = src.slice(src.indexOf('function drawSpeechBubble('), src.indexOf('function speakingNow('));
    assert.match(fn, /g\.poly\(outlinePoints\(speechBubbleOutline\(/);
    assert.doesNotMatch(fn, /g\[op\]/);
  });
});
