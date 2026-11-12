/**
 * Phones draw at render resolution 1 (Austin 2026-11-12, the first step of a lighter phone game).
 * In WebKit at an iPhone's DPR 3 the first street took 2.27 GB, past where iOS closes a tab; at 1
 * it took 1.0 GB: every texture scales with the resolution and the 3x character sheets stay out.
 * Checked here:
 * - the #phone-gate names the device (window.GRODDLE_DEVICE) from the same signals that send a
 *   phone to the companion, and still names it when the stored choice lets the phone play;
 * - resolutionCap (js/render-density.js): phone 1, everything else the top, `?density=` overrides;
 * - game.js passes the cap to every renderResolution call and picks sprite and bake files by it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  MAX_RENDER_RESOLUTION,
  PHONE_RENDER_RESOLUTION,
  renderResolution,
  resolutionCap,
} from '../public/js/render-density.js?v=20f9f1ee';

const pub = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const gateOf = (html) => html.match(/<script id="phone-gate">([\s\S]*?)<\/script>/)?.[1];

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

/** Runs the gate with a made-up device; answers the device it named and whether it redirected. */
function deviceOf(script, { ua, touch = 0, fine = true, coarse = false, screen = [1440, 900], stored = null } = {}) {
  const calls = [];
  const window = {
    navigator: { userAgent: ua, maxTouchPoints: touch },
    matchMedia: (q) => ({ matches: q === '(any-pointer: fine)' ? fine : q === '(any-pointer: coarse)' ? coarse : false }),
    screen: { width: screen[0], height: screen[1] },
    location: { pathname: '/play/', hash: '', replace: (u) => calls.push(u) },
    stop: () => {},
    localStorage: { getItem: (k) => (k === 'groddle-play-device' ? stored : null) },
  };
  vm.runInNewContext(script, { window, document: { baseURI: 'https://groddle.localhost/' }, URL });
  return { device: window.GRODDLE_DEVICE, redirected: calls.length > 0 };
}

describe('the phone gate names the device', () => {
  const script = gateOf(read('play/index.html'));

  it('is on both game pages', () => {
    assert.ok(script);
    assert.equal(gateOf(read('play/online/index.html')), script);
  });

  it('a phone that took Load the full game anyway still counts as a phone', () => {
    const iphone = { ua: UA.iphone, touch: 5, fine: false, coarse: true, screen: [393, 852] };
    assert.deepEqual(deviceOf(script, iphone), { device: 'phone', redirected: true });
    assert.deepEqual(deviceOf(script, { ...iphone, stored: 'full' }), { device: 'phone', redirected: false });
    assert.equal(deviceOf(script, { ua: UA.android, touch: 5, fine: false, coarse: true, screen: [412, 915], stored: 'full' }).device, 'phone');
    assert.equal(deviceOf(script, { ua: UA.linux, touch: 5, fine: false, coarse: true, screen: [412, 915], stored: 'full' }).device, 'phone', 'request desktop site on a phone');
  });

  it('tablets and computers are not phones, a touch tablet with a mouse neither', () => {
    assert.equal(deviceOf(script, { ua: UA.mac, touch: 5, fine: false, coarse: true, screen: [820, 1180], stored: 'full' }).device, 'tablet', 'iPadOS says Mac');
    assert.equal(deviceOf(script, { ua: UA.mac, touch: 5, fine: true, coarse: true, screen: [1024, 1366] }).device, 'tablet', 'iPad with a Magic Keyboard');
    assert.equal(deviceOf(script, { ua: UA.androidTablet, touch: 10, fine: false, coarse: true, screen: [800, 1280] }).device, 'tablet');
    assert.equal(deviceOf(script, { ua: UA.mac }).device, 'computer');
    assert.equal(deviceOf(script, { ua: UA.mac, screen: [1280, 400] }).device, 'computer', 'a short desktop window with no touch');
    assert.equal(deviceOf(script, { ua: UA.windows, touch: 10, fine: true, coarse: true, screen: [1920, 1080] }).device, 'computer');
  });
});

describe('resolutionCap', () => {
  it('holds a phone at 1 and leaves everything else at the top', () => {
    assert.equal(PHONE_RENDER_RESOLUTION, 1);
    assert.equal(resolutionCap({ device: 'phone' }), 1);
    for (const device of ['tablet', 'computer', undefined, null, '']) assert.equal(resolutionCap({ device }), MAX_RENDER_RESOLUTION);
    assert.equal(resolutionCap(), MAX_RENDER_RESOLUTION);
  });

  it('?density= overrides for QA: a number caps there, auto or junk keeps the device cap', () => {
    assert.equal(resolutionCap({ device: 'phone', density: '4' }), 4);
    assert.equal(resolutionCap({ device: 'phone', density: '2.5' }), 2.5);
    assert.equal(resolutionCap({ device: 'computer', density: '1' }), 1);
    assert.equal(resolutionCap({ device: 'computer', density: '9' }), MAX_RENDER_RESOLUTION);
    assert.equal(resolutionCap({ device: 'computer', density: '0.5' }), 1);
    assert.equal(resolutionCap({ device: 'phone', density: 'auto' }), 1);
    assert.equal(resolutionCap({ device: 'phone', density: 'AUTO' }), 1);
    assert.equal(resolutionCap({ device: 'phone', density: 'lots' }), 1);
    assert.equal(resolutionCap({ device: 'computer', density: '' }), MAX_RENDER_RESOLUTION);
  });

  it('an iPhone in landscape draws at 1; a Retina laptop is unchanged', () => {
    assert.equal(renderResolution(874, 960, 3, resolutionCap({ device: 'phone' })), 1);
    assert.equal(renderResolution(874, 960, 3), 2.75);
    assert.equal(renderResolution(1574, 960, 2, resolutionCap({ device: 'computer' })), renderResolution(1574, 960, 2));
  });
});

describe('game.js', () => {
  const game = read('game.js');

  it('builds the cap from the gate and ?density=', () => {
    assert.match(game, /const RENDER_CAP = resolutionCap\(\{ device: window\.GRODDLE_DEVICE, density: new URLSearchParams\(location\.search\)\.get\('density'\) \}\);/);
  });

  it('passes it to every renderResolution call', () => {
    const calls = [...game.matchAll(/renderResolution\(([^;]*?)\)[,;]/g)].map((m) => m[1]);
    assert.ok(calls.length >= 3, `found ${calls.length} calls`);
    for (const args of calls) assert.match(args, /, RENDER_CAP$/, `renderResolution(${args})`);
  });

  it('picks the 3x sprite sheets and avatar bakes by the capped density', () => {
    assert.match(game, /installHiresSprites\(textureUrls, \{ dpr: artDpr\(\),/);
    assert.match(game, /function vectorBakeScale\(\) \{\n  const dpr = artDpr\(\);/);
    assert.match(game, /function artDpr\(\) \{\n  return Math\.min\(window\.devicePixelRatio \|\| 1, RENDER_CAP\);/);
  });
});
