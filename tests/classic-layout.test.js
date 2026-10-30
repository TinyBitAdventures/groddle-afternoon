/**
 * The Classic interface's screen frame (public/js/classic/classic-layout.js,
 * classic-spec layout.md §4): one scale u for the chrome and the world, the
 * real stage rule (stageFor) in the world cell, the rail on narrow windows,
 * "Original window size", and the frame-1 anchors.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classicLayout,
  classicScale,
  classicAllowed,
  classicCssVars,
  railFor,
  rightColumnWidth,
  chromeWidth,
  FRAME,
  CLASSIC_MIN_W,
  CLASSIC_MIN_H,
} from '../public/js/classic/classic-layout.js';
import { stageFor } from '../public/js/location-view.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe('Classic layout: the original frame', () => {
  it('right column 313 closed, 430 open, the rail 48; chrome 353 with both gutters', () => {
    assert.equal(rightColumnWidth(), 313);
    assert.equal(rightColumnWidth({ contactsOpen: true }), 430);
    assert.equal(rightColumnWidth({ rail: true }), 48);
    assert.equal(chromeWidth(), 353);
    assert.equal(FRAME.header, 40);
  });

  it('desktop only: Modern under 960 x 540', () => {
    assert.equal(CLASSIC_MIN_W, 960);
    assert.equal(CLASSIC_MIN_H, 540);
    assert.equal(classicAllowed(960, 540), true);
    assert.equal(classicAllowed(959, 800), false);
    assert.equal(classicAllowed(1280, 539), false);
    assert.equal(classicAllowed(undefined, 800), false);
  });
});

describe('Classic layout: filling the window (layout.md §4 table)', () => {
  // [W, H, u, rail, cellW, cellH, viewW, viewH, scale]
  const rows = [
    [1024, 640, 1, true, 936, 600, 960, 483, 0.975],
    [1280, 800, 1, true, 1192, 760, 1192, 628, 1],
    [1440, 900, 1.009, false, 1084, 860, 1074, 720, 1.009],
    [1920, 1080, 1.211, false, 1493, 1032, 1233, 720, 1.211],
    [2560, 1440, 1.614, false, 1990, 1375, 1233, 720, 1.614],
  ];
  for (const [W, H, u, rail, cw, ch, vw, vh, scale] of rows) {
    it(`${W} x ${H}`, () => {
      const L = classicLayout({ width: W, height: H });
      near(L.u, u, 0.001);
      assert.equal(L.rail, rail);
      near(L.cell.w, cw, 0.6);
      near(L.cell.h, ch, 0.6);
      assert.equal(L.stage.viewW, vw);
      assert.equal(L.stage.viewH, vh);
      near(L.stage.scale, scale, 0.001);
      // The frame fills the window exactly: no page scroll.
      near(L.gutterL + L.cell.w + L.rightW + L.gutterR, W, 1e-6);
      near(L.header + L.cell.h, H, 1e-6);
    });
  }

  it('the world magnifies exactly with the chrome: stageFor on the cell returns scale u', () => {
    for (let W = 960; W <= 3840; W += 37) {
      for (let H = 540; H <= 2160; H += 41) {
        const L = classicLayout({ width: W, height: H });
        const s = stageFor({ width: L.cell.w, height: L.cell.h });
        assert.equal(s.scale, L.stage.scale);
        if (L.u > 1) near(s.scale, L.u, 1e-9);
        else assert.ok(s.scale <= 1 + 1e-9, `${W}x${H}: chrome at 1, world at ${s.scale}`);
        assert.ok(L.u >= 1, 'the chrome never draws under 1:1');
        assert.ok(L.gutterR >= FRAME.gutter * L.u - 1e-6, `${W}x${H}: right gutter`);
      }
    }
  });

  it('the rail below 1313 wide (the full column would push the world under 960)', () => {
    assert.equal(railFor(1312), true);
    assert.equal(railFor(1313), false);
    assert.equal(railFor(1429, { contactsOpen: true }), true);
    const L = classicLayout({ width: 1280, height: 800 });
    assert.equal(L.rightW, 48);
    assert.equal(L.strip, null);
    assert.equal(L.chat, null);
    assert.ok(L.railPane, 'the column opens over the world');
    near(L.railPane.x + L.railPane.w, L.column.x, 1e-6);
    assert.equal(L.railPane.w, 264);
    const wide = classicLayout({ width: 1440, height: 900 });
    assert.equal(wide.railPane, null);
    near(wide.strip.w, 48 * wide.u, 1e-9);
    near(wide.chat.w, 264 * wide.u, 1e-9);
  });

  it('closed form: the scale is the same whatever the scene asks of the world', () => {
    assert.equal(classicScale(1920, 1080), classicLayout({ width: 1920, height: 1080, sceneWidth: 1200, sceneHeight: 500 }).u);
  });
});

describe('Classic layout: Original window size', () => {
  it('a 1000 x 600 world at 1:1, the block centred, at 1920 x 1080', () => {
    const L = classicLayout({ width: 1920, height: 1080, size: 'original' });
    assert.equal(L.size, 'original');
    assert.equal(L.u, 1);
    assert.equal(L.cell.w, 1000);
    assert.equal(L.cell.h, 732);
    assert.equal(L.stage.viewW, 1000);
    assert.equal(L.stage.viewH, 600);
    assert.equal(L.stage.scale, 1);
    // TSMainView.as: gutter = max(20, round((stageW - (rightCol + vpW)) / 2)).
    assert.equal(L.gutterL, Math.round((1920 - 1313) / 2));
    near(L.gutterL + L.cell.w + L.rightW + L.gutterR, 1920, 1e-6);
  });

  it('a smaller window gets the filling world under the cap', () => {
    const L = classicLayout({ width: 1280, height: 700, size: 'original' });
    assert.equal(L.rail, true);
    assert.equal(L.cell.w, 1000);
    assert.equal(L.cell.h, 660);
    assert.equal(L.gutterL, Math.round((1280 - 1048) / 2));
  });

  it('original never magnifies', () => {
    for (const [W, H] of [[2560, 1440], [3840, 2160]]) {
      const L = classicLayout({ width: W, height: H, size: 'original' });
      assert.equal(L.u, 1);
      assert.equal(L.stage.scale, 1);
      assert.equal(L.stage.viewW, 1000);
      assert.equal(L.stage.viewH, 600);
    }
  });
});

describe('Classic layout: anchors (layout.md §2, frame 1)', () => {
  it('at the full 1000 x 600 view they land on the original page coordinates', () => {
    const L = classicLayout({ width: 1353, height: 778, size: 'original' });
    assert.equal(L.gutterL, 20);
    assert.equal(L.view.x, 20);
    assert.equal(L.view.y, 40);
    assert.equal(L.view.w, 1000);
    assert.equal(L.view.h, 600);
    const a = L.anchors;
    const at = (r, x, y) => { near(r.x, x, 1e-6); near(r.y, y, 1e-6); };
    at(a.ear, 0, 0);
    at(a.face, 13, 16);
    at(a.imgButton, 113, 4);
    at(a.cloud, 84, 26);
    at(a.bolt, 19, 90);
    at(a.arc, 27, 42);
    at(a.energyText, 116, 43);
    near(a.location.x + a.location.w, 1020, 1e-6);
    near(a.prompts.x, 690, 1e-6);
    near(a.prompts.y, 610, 1e-6); // grows up from 610
    near(a.growl.x, 30, 1e-6);
    near(a.growl.y, 625, 1e-6);
    near(a.growl.w, 980, 1e-6);
    at(a.currants, 0, 568);
    at(a.packTabs, 24, 623);
    at(a.packSearch, 3, 615);
    at(a.packRow, 25, 650);
    near(a.contactTab.x, 1008, 1e-6);
    near(a.contactTab.y, 310, 1e-6);
    at(L.column, 1020, 40);
    at(L.chat, 1068, 40);
    at(a.panes, 1080, 52);
    near(a.headerCluster.x, 1200, 1e-6);
    near(L.column.h, 722, 1e-6); // the column runs down beside the pack to 762
  });

  it('they scale with u and follow the view edges', () => {
    const L = classicLayout({ width: 1920, height: 1080 });
    near(L.anchors.face.w, 73 * L.u, 1e-9);
    near(L.anchors.packRow.y, L.view.y + L.view.h + 10 * L.u, 1e-9);
    near(L.anchors.prompts.x + L.anchors.prompts.w, L.view.x + L.view.w - 30 * L.u, 1e-9);
    near(L.band.y, L.view.y + L.view.h, 1e-9);
    near(L.band.h, 132 * L.stage.scale, 1e-9);
  });

  it('CSS variables for #wrap', () => {
    const v = classicCssVars(classicLayout({ width: 1920, height: 1080 }));
    assert.equal(v['--classic-u'], '1.2108');
    assert.match(v['--classic-header'], /^48\.43px$/);
    for (const [k, val] of Object.entries(v)) if (k !== '--classic-u') assert.match(val, /^\d+(\.\d+)?px$/, k);
  });
});

describe('Classic layout: purity', () => {
  it('no DOM, and it uses the real stage rule', () => {
    const src = readFileSync(join(root, 'public/js/classic/classic-layout.js'), 'utf8');
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /\b(document|window|getComputedStyle|innerWidth)\b/);
    assert.match(src, /import \{ stageFor[^}]*\} from '\.\.\/location-view\.js\?v=/);
  });
});
