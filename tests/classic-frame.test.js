/**
 * The Classic frame at runtime (public/js/classic/classic-frame.js, css/classic.css): the CSS grid
 * uses the same scale rule as classic-layout.js, the drawer is the chat column in both skins, and
 * the view and pack band come from the real canvas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewFromCanvas } from '../public/js/classic/classic-frame.js?v=g476-1';
import { railFor, chromeWidth } from '../public/js/classic/classic-layout.js?v=g476-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('Classic frame: CSS and JS agree', () => {
  const css = read('public/css/classic.css');

  it('the CSS scale is classic-layout.js classicScale', () => {
    // ZOOM: past Wide, u comes from --cu-zoom (js/classic/classic-zoom.js, classicZoomScale).
    assert.match(css, /--cu: var\(--cu-zoom, max\(1px, min\(100vw \/ \(960 \+ var\(--cu-c\)\), 100vh \/ 580, max\(100vw \/ \(1680 \+ var\(--cu-c\)\), 100vh \/ 892\)\)\)\);/);
    assert.match(css, /--cu-c: 353;/);
    assert.equal(chromeWidth(), 353);
    assert.equal(chromeWidth({ rail: true }), 88);
    assert.match(css, /@media \(max-width: 1312\.98px\) \{\n\s+:root\[data-ui="classic"\] \{ --cu-c: 88; \}/);
    assert.equal(railFor(1312.98), true);
    assert.equal(railFor(1313), false);
  });

  it('Original window size: u = 1 and the world capped at 1000 x 732, centred', () => {
    assert.match(css, /:root\[data-ui="classic"\]\[data-ui-size="original"\] \{\n\s+--cu: 1px;/);
    assert.match(css, /grid-template-columns: minmax\(20px, 1fr\) minmax\(0, 1000px\) var\(--cf-right-w\) minmax\(20px, 1fr\);\n\s+grid-template-rows: 40px minmax\(0, 732px\);/);
  });

  it('the drawer is the column in both skins, so the interface switches at runtime', () => {
    const game = read('public/game.js');
    assert.match(game, /const MODERN_UI = true;/);
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /present: \(next\) => setOpen\(next\),/);
    assert.match(drawer, /restore: \(\) => setOpen\(choice \?\? defaultOpen\(width\(\)\)\),/);
    assert.match(drawer, /r\.left >= rr\.right - 1\) return \{ left: 0, right: 0 \}/, 'no inset beside the world');
  });
});

describe('Classic frame: the view from the canvas', () => {
  it('the canvas is the view plus the 132 px pack reserve', () => {
    const v = viewFromCanvas({ left: 20, top: 40, width: 1000, height: 732 }, 600, 1353);
    assert.deepEqual(v, { x: 20, y: 40, w: 1000, h: 600, right: 333, band: 132 });
    const big = viewFromCanvas({ left: 24, top: 48, width: 1493, height: 1032 * 1 }, 720, 1920);
    assert.ok(Math.abs(big.band - (1032 * 132) / 852) < 1e-9);
    assert.equal(viewFromCanvas({ left: 0, top: 0, width: 960, height: 732 }, undefined, 960).h, 600, 'no data yet: the 600 view');
  });
});
