// FLASH (Austin's iPhone, upright): opening or closing a bag flashed the street black for about a
// frame. The bag refits the street's band, the renderer resizes, and WebKit paints a WebGL canvas
// black for the frame its backing store changes size, even with a redraw straight after. On
// Safari's engine the resize now goes under a copy of the street (js/stage-resize.js) that lifts
// two frames later; Chrome keeps its one-step resize. tools/qa/resize-flash.mjs is the browser
// reproduction (WebKit, 402x812: black shots before, none after).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { COVER_FRAMES, appleWebKit, createStageResize, splitStageResize } from '../public/js/stage-resize.js?v=70c3cb79';
import { blackShare, decodePng, sharedRect } from '../tools/qa/resize-flash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE = `${CHROME_MAC} Edg/131.0.0.0`;
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';

/** A page's frames by hand: frame(cb) queues, step() runs one frame's callbacks. */
function frames() {
  let queue = [];
  return {
    frame: (cb) => queue.push(cb),
    step() {
      const run = queue;
      queue = [];
      for (const cb of run) cb();
    },
    get waiting() {
      return queue.length;
    },
  };
}

/** A sizer with a log of what reached the renderer and the copy, in order. */
function rig({ split = true, showOk = true } = {}) {
  const log = [];
  const f = frames();
  const cover = {
    show: () => (log.push('show'), showOk),
    hide: () => log.push('hide'),
  };
  const sizer = createStageResize({
    resize: (w, h, res) => log.push(`resize ${w}x${h}@${res}`),
    render: () => log.push('render'),
    cover,
    split,
    frame: f.frame,
    initial: { w: 773, h: 1000, res: 1 },
  });
  return { log, f, sizer };
}

test("Safari's engine is Safari and every iPhone browser, not Chrome, Edge or Firefox", () => {
  assert.equal(appleWebKit(SAFARI_IPHONE), true);
  assert.equal(appleWebKit(CHROME_IOS), true);
  assert.equal(appleWebKit(SAFARI_MAC), true);
  assert.equal(appleWebKit(CHROME_MAC), false);
  assert.equal(appleWebKit(EDGE), false);
  assert.equal(appleWebKit(CHROME_ANDROID), false);
  assert.equal(appleWebKit(FIREFOX), false);
  assert.equal(appleWebKit(''), false);
  assert.equal(splitStageResize({ ua: SAFARI_IPHONE }), true);
  assert.equal(splitStageResize({ ua: CHROME_MAC }), false);
  assert.equal(splitStageResize({ ua: SAFARI_IPHONE, param: '0' }), false);
  assert.equal(splitStageResize({ ua: CHROME_MAC, param: '1' }), true);
});

test('on WebKit the street is copied over the canvas before the backing store changes, then drawn beneath', () => {
  const { log, f, sizer } = rig();
  assert.equal(sizer.request(779, 1000, 1), 'covered');
  // The copy is taken from a fresh draw, before the resize; the new size draws at once beneath it.
  assert.deepEqual(log, ['render', 'show', 'resize 779x1000@1', 'render']);
  assert.equal(sizer.covered, true);
  assert.deepEqual(sizer.target(), { w: 779, h: 1000, res: 1 });
  // The frame the backing store changes (WebKit paints the canvas black): the copy stays.
  f.step();
  assert.equal(sizer.covered, true);
  assert.equal(log.includes('hide'), false);
  // The next frame drew at the new size: the copy lifts.
  for (let i = 1; i < COVER_FRAMES; i++) f.step();
  assert.equal(log.at(-1), 'hide');
  assert.equal(sizer.covered, false);
  assert.equal(f.waiting, 0);
});

test('a resize while the copy is up resizes beneath it and keeps it up two frames past the last one', () => {
  const { log, f, sizer } = rig();
  sizer.request(779, 1000, 1);
  f.step();
  log.length = 0;
  assert.equal(sizer.request(775, 1000, 1), 'covered');
  // No second copy (the canvas is mid-swap): the copy follows the canvas's box, the renderer resizes.
  assert.deepEqual(log, ['show', 'resize 775x1000@1', 'render']);
  f.step();
  assert.equal(sizer.covered, true);
  f.step();
  assert.equal(sizer.covered, false);
  assert.equal(log.filter((l) => l === 'hide').length, 1);
  assert.equal(f.waiting, 0);
});

test('the same size again does nothing, so a resize event that changes nothing draws nothing', () => {
  const { log, f, sizer } = rig();
  assert.equal(sizer.request(773, 1000, 1), 'same');
  assert.deepEqual(log, []);
  assert.equal(f.waiting, 0);
});

test('elsewhere (Chrome) the resize stays one step: no copy, no extra draw, no frame of lag', () => {
  const { log, f, sizer } = rig({ split: false });
  assert.equal(sizer.request(779, 1000, 1), 'now');
  assert.deepEqual(log, ['resize 779x1000@1']);
  assert.equal(f.waiting, 0);
  assert.equal(sizer.split, false);
});

test('a copy that fails still resizes, at once', () => {
  const { log, f, sizer } = rig({ showOk: false });
  assert.equal(sizer.request(779, 1000, 1), 'now');
  assert.deepEqual(log, ['render', 'show', 'resize 779x1000@1', 'render']);
  assert.equal(sizer.covered, false);
  assert.equal(f.waiting, 0);
});

test('game.js sends every renderer resize through the sizer, made on Safari\'s engine with the copy', () => {
  const game = readFileSync(join(root, 'public/game.js'), 'utf8');
  // The one direct resize left is inside the sizer's own callback (and the fallback before the app).
  const direct = [...game.matchAll(/app\.renderer\.resize\(/g)].length;
  assert.equal(direct, 2, 'app.renderer.resize outside sizeRenderer and the sizer');
  assert.match(game, /function sizeRenderer\(resolution\) \{\n  if \(stageSizer\) stageSizer\.request\(VIEW_W, VIEW_H, resolution\);/);
  assert.match(game, /function resizeRendererToView\(cssWidth\) \{[^}]*const resolution = stageResolution\(cssWidth\);\s+sizeRenderer\(resolution\);/);
  assert.match(game, /stageSizer = createStageResize\(\{[\s\S]{0,400}cover: createCanvasCover\(app\.canvas\),\s*split: splitStageResize\(\{ ua: navigator\.userAgent/);
});

test('the frame sampler reads a screenshot and counts a black street', () => {
  // A 4x2 RGB PNG: the left half black, the right half sky, with filters 1 and 2 on its rows.
  const row0 = [1, 0, 0, 0, 0, 0, 0, 142, 200, 232, 0, 0, 0];
  const row1 = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const png = pngOf(4, 2, deflateSync(Buffer.from([...row0, ...row1])));
  const img = decodePng(png);
  assert.deepEqual([img.width, img.height, img.channels], [4, 2, 3]);
  assert.deepEqual([...img.data.subarray(6, 9)], [142, 200, 232]);
  assert.deepEqual([...img.data.subarray(18, 21)], [142, 200, 232]);
  // Every second pixel is read: columns 0 and 2 of rows 0, so half black.
  assert.equal(blackShare(img, { x: 0, y: 0, w: 4, h: 2 }), 0.5);
  assert.deepEqual(sharedRect({ x: 0, y: 82, w: 402, h: 520 }, { x: 0, y: 82, w: 402, h: 516 }), { x: 6, y: 88, w: 390, h: 504 });
});

function pngOf(w, h, idat) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
