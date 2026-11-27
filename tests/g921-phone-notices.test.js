/**
 * G921: on a phone held sideways the notices ("Your pack has 16 slots now", "A new afternoon
 * begins") stood over Act; upright, G919's quest step line covered the street pill's clock.
 * The stack keeps clear of the stick, Act and Jump (js/notify-view.js clearOfControls,
 * noticesBetweenControls), its cards are smaller on a short screen (style.css G921 block), and the
 * step line drops under the pill (js/ui/quest-pin-button.js pinLineDrop).
 * Geometry below is the 812 x 402 iPhone sideways and the 402 x 812 upright, measured in WebKit.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BESIDE_MIN_W, clearOfControls, noticesBetweenControls } from '../public/js/notify-view.js?v=ebba6fd4';
import { PIN_LINE_GAP, pinLineDrop } from '../public/js/ui/quest-pin-button.js?v=2931d81d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const box = (left, top, right, bottom) => ({ left, top, right, bottom });

// 812 x 402 sideways: the stick zone, Act and Jump as the game lays them out.
const STICK = box(16, 178, 148, 310);
const ACT = box(606, 214, 666, 274);
const JUMP = box(676, 242, 752, 318);
const CONTROLS = [STICK, ACT, JUMP];

describe('clearOfControls', () => {
  it('the column beside the avatar that ran down over Act is not clear; one above them is', () => {
    assert.equal(clearOfControls(box(413, 137, 666, 267), CONTROLS), false);
    assert.equal(clearOfControls(box(413, 60, 666, 180), CONTROLS), true);
  });
  it('no controls (a computer, an upright phone): always clear', () => {
    assert.equal(clearOfControls(box(0, 0, 800, 800), []), true);
  });
});

describe('noticesBetweenControls: the centred stack narrows to the band between the controls', () => {
  it('a centred stack reaching over Act narrows to clear it, as near the middle as fits', () => {
    const rect = box(186, 137, 626, 210);
    const band = noticesBetweenControls({ rect, controls: CONTROLS, rootW: 812 });
    assert.ok(band && !band.wait);
    assert.ok(band.left >= STICK.right + 8, `left ${band.left}`);
    assert.ok(band.left + band.width <= ACT.left - 8, `right ${band.left + band.width}`);
    assert.equal(band.width, 440);
    assert.ok(clearOfControls(box(band.left, rect.top, band.left + band.width, rect.top + band.height), CONTROLS));
  });
  it('clear already: null (it stays where it was)', () => {
    assert.equal(noticesBetweenControls({ rect: box(186, 60, 626, 150), controls: CONTROLS, rootW: 812 }), null);
  });
  it('a narrower band is taller (the cards rewrap); with no band of BESIDE_MIN_W it waits', () => {
    const tight = [box(0, 100, 300, 400), box(320, 100, 812, 400)];
    assert.deepEqual(noticesBetweenControls({ rect: box(186, 120, 626, 200), controls: tight, rootW: 812 }), { wait: true });
    const band = noticesBetweenControls({ rect: box(186, 120, 626, 200), controls: [box(0, 150, 150, 400), box(560, 150, 812, 400)], rootW: 812 });
    assert.ok(band.width >= BESIDE_MIN_W && band.width < 440);
    assert.ok(band.height > 80);
  });
});

describe('notify-view.js: the layout keeps the stack off the controls', () => {
  const view = read('public/js/notify-view.js');
  it('measures the stick, Act and Jump on a short screen', () => {
    assert.match(view, /controls: rr\.height < SHORT_SCREEN_H \? \['\.touch-stick', '\.touch-act', '\.touch-jump'\]/);
  });
  it('a column beside the avatar must clear them, and the centred stack narrows or waits', () => {
    assert.match(view, /if \(!sidePlace\.wait && clearOfControls\(/);
    assert.match(view, /const fit = noticesBetweenControls\(\{ rect: shown,/);
    assert.match(view, /if \(fit\?\.wait\) place = \{ dy: 0, wait: true \};/);
  });
  it('the quest step line is one of its obstacles while it is out', () => {
    assert.match(view, /'#quest-pins-btn\[data-line="on"\] \.qpb-line'/);
  });
});

describe('the step line clears the street pill (pinLineDrop)', () => {
  // Upright 402 x 812: the quest button in the bar, the pill under the bar (measured before the fix:
  // the line at 215..317 x 54..75 over the pill's clock, the pill 93..309 x 52..96).
  const BTN = box(273, 4, 309, 48);
  const PLATE = box(93, 52, 309, 96);
  it('upright it drops to start under the pill', () => {
    const drop = pinLineDrop(BTN, PLATE, 102, 21);
    assert.equal(BTN.bottom + PIN_LINE_GAP + drop, PLATE.bottom + PIN_LINE_GAP);
  });
  it('sideways the pill stands in the row, above the line: no drop', () => {
    assert.equal(pinLineDrop(box(661, 4, 711, 48), box(298, 4, 515, 48), 102, 21), 0);
  });
  it('no pill: no drop', () => {
    assert.equal(pinLineDrop(BTN, null, 102, 21), 0);
  });
  it('the stylesheet places it by the drop; short screens get smaller notice cards', () => {
    const css = read('public/style.css');
    assert.match(css, /top: calc\(100% \+ 6px \+ var\(--qpb-line-drop, 0px\)\)/);
    assert.match(css, /@media \(orientation: landscape\) and \(max-height: 519px\) \{\s*:root\.touch-phone \.notify-card \{ padding: var\(--sp-2\) var\(--sp-4\); font-size: var\(--fs-sm\); line-height: var\(--lh-tight\); \}/);
  });
});
