/**
 * G1328 (#726): a browser zoomed far out (about 50%) makes the HUD tiny while the world fills the
 * window. One notice, once per browser, names the zoom and the key that resets it. The reading is
 * outerWidth / innerWidth on a desktop browser, with the height agreeing; anything unclear (a phone,
 * pinch zoom, the Home Screen app, an iframe, an installed app window, a zoom in, a small change)
 * shows nothing. Ours (tools/inventions/inventions.json zoomed-out-browser-hint).
 * Run: node --test tests/zoom-hint-726.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZOOM_HINT_CACHE, ZOOM_HINT_KEY, ZOOM_HINT_MS, markZoomHintSeen, readZoomOut, touchDevice, watchZoomHint, zoomHintDue, zoomHintSeen, zoomHintText, zoomPercent, zoomResetKey } from '../public/js/zoom-hint.js?v=75b745c7';
import { NOTICE_MAX_MS } from '../public/js/notify.js?v=c9d79ec5';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LINUX_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

/**
 * A window at a page zoom: outerWidth/Height in screen points (zoom does not change them),
 * innerWidth/Height in CSS pixels ((window minus chrome) / zoom), as Chrome and Safari report.
 */
function fakeWin({
  zoom = 1, ow = 1512, oh = 945, chromeW = 0, chromeH = 88, ua = MAC_CHROME, platform = 'MacIntel', touch = 0,
  fine = true, hover = true, display = 'browser', top = null, scale = 1, search = '', uaData = null, standalone = undefined,
  inner = null,
} = {}) {
  const win = {
    outerWidth: ow,
    outerHeight: oh,
    innerWidth: inner ? inner.w : Math.round((ow - chromeW) / zoom),
    innerHeight: inner ? inner.h : Math.round((oh - chromeH) / zoom),
    devicePixelRatio: 2 * zoom,
    navigator: { userAgent: ua, platform, maxTouchPoints: touch, ...(uaData ? { userAgentData: uaData } : {}), ...(standalone !== undefined ? { standalone } : {}) },
    visualViewport: { scale },
    location: { search },
    matchMedia: (q) => ({
      matches: q === '(pointer: fine)' ? fine : q === '(hover: hover)' ? hover : q === `(display-mode: ${display})`,
    }),
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
  };
  win.self = win;
  win.top = top === 'other' ? {} : win;
  return win;
}

function memory({ broken = false, start = null } = {}) {
  let v = start;
  return {
    get: () => { if (broken) throw new Error('blocked'); return v; },
    set: (x) => { if (broken) throw new Error('blocked'); v = String(x); },
    value: () => v,
  };
}

describe('G1328 (#726): reading a zoomed-out page', () => {
  it('reads 50% on a Mac in Chrome and in Safari, as in the report', () => {
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5 }))?.percent, 50);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, ua: MAC_SAFARI }))?.percent, 50);
  });

  it('reads the browser\'s own steps below 80%, with Windows\' window borders', () => {
    for (const [zoom, want] of [[0.25, 25], [0.33, 33], [0.5, 50], [0.67, 67], [0.75, 75]]) {
      const win = fakeWin({ zoom, ow: 1936, oh: 1056, chromeW: 16, chromeH: 130, ua: WIN_CHROME, platform: 'Win32' });
      assert.equal(readZoomOut(win)?.percent, want, `${zoom}`);
    }
  });

  it('is the same reading on a high-DPI screen (devicePixelRatio plays no part)', () => {
    const win = fakeWin({ zoom: 0.5 });
    win.devicePixelRatio = 3;
    assert.equal(readZoomOut(win)?.percent, 50);
  });

  it('shows nothing at 100%, for small changes (80% to 99%) or zoomed in', () => {
    for (const zoom of [1, 0.9, 0.8, 1.1, 1.25, 1.5, 2, 5]) assert.equal(readZoomOut(fakeWin({ zoom })), null, `${zoom}`);
    // Chrome's 80% with Windows' borders reads a hair over 0.8: still nothing.
    assert.equal(readZoomOut(fakeWin({ zoom: 0.8, ow: 1936, chromeW: 16, ua: WIN_CHROME, platform: 'Win32' })), null);
  });

  it('shows nothing on a phone or tablet (outerWidth means nothing there)', () => {
    // A phone whose layout viewport is wider than its screen reads like a zoom out: not one.
    const phoneLike = { ow: 393, oh: 852, inner: { w: 980, h: 1800 } };
    assert.equal(readZoomOut(fakeWin({ ...phoneLike, ua: IPHONE, platform: 'iPhone', touch: 5, fine: false, hover: false })), null);
    assert.equal(readZoomOut(fakeWin({ ...phoneLike, ua: ANDROID, platform: 'Linux armv8l', touch: 5, fine: false, hover: false })), null);
    // Even when a phone browser claims a fine pointer, its user agent rules it out.
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, ua: ANDROID, platform: 'Linux armv8l', touch: 5 })), null);
    // An iPad asks for the desktop site (a Mac's user agent) but has touch.
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, ua: MAC_SAFARI, touch: 5 })), null);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, ua: LINUX_CHROME, platform: 'Linux x86_64', uaData: { mobile: true, platform: 'Android' } })), null);
    // A touch-first screen (coarse pointer, no hover) on a desktop user agent.
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, fine: false, hover: false })), null);
    assert.equal(touchDevice({ userAgent: WIN_CHROME, platform: 'Win32', maxTouchPoints: 10 }), false, 'a touch laptop is a desktop');
  });

  it('shows nothing in the Home Screen app or an installed app window', () => {
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, display: 'standalone' })), null);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, display: 'fullscreen' })), null);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, display: 'minimal-ui' })), null);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, standalone: true })), null);
  });

  it('shows nothing inside an iframe, or when the parent cannot be read', () => {
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, top: 'other' })), null);
    const win = fakeWin({ zoom: 0.5 });
    Object.defineProperty(win, 'top', { get() { throw new Error('cross-origin'); } });
    assert.equal(readZoomOut(win), null);
  });

  it('shows nothing while pinch-zoomed (visualViewport.scale is not 1)', () => {
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, scale: 1.6 })), null);
  });

  it('shows nothing when the height does not agree (heavy window chrome, a bottom-docked devtools panel)', () => {
    // 75% with 400 points of devtools under the page: innerHeight stays under outerHeight.
    assert.equal(readZoomOut(fakeWin({ zoom: 0.75, chromeH: 400 })), null);
  });

  it('a side-docked devtools panel only reads as zoomed in, never out', () => {
    // 100% zoom, the page 900 points wide in a 1512-point window.
    assert.equal(readZoomOut(fakeWin({ inner: { w: 900, h: 857 } })), null);
  });

  it('shows nothing for a broken or emulated window (zero, missing, tiny or impossible sizes)', () => {
    assert.equal(readZoomOut(fakeWin({ ow: 0, zoom: 0.5 })), null);
    assert.equal(readZoomOut(fakeWin({ inner: { w: 0, h: 0 } })), null);
    const w = fakeWin({ zoom: 0.5 });
    delete w.outerWidth;
    assert.equal(readZoomOut(w), null);
    assert.equal(readZoomOut(fakeWin({ zoom: 0.5, ow: 400, oh: 300 })), null, 'a popup');
    assert.equal(readZoomOut(fakeWin({ zoom: 0.1 })), null, 'below any browser zoom');
    // Emulated viewports (Playwright, devtools' device mode on a desktop) report outer = inner.
    assert.equal(readZoomOut(fakeWin({ inner: { w: 1512, h: 945 } })), null);
    assert.equal(readZoomOut(null), null);
    assert.equal(readZoomOut({}), null);
  });

  it('rounds a reading onto the browser\'s step', () => {
    assert.equal(zoomPercent(0.504), 50);
    assert.equal(zoomPercent(0.668), 67);
    assert.equal(zoomPercent(0.4), 40);
  });
});

describe('G1328 (#726): the words', () => {
  it('says the real percent, and Cmd on a Mac, Ctrl elsewhere', () => {
    assert.equal(zoomHintText(50, { userAgent: MAC_CHROME, platform: 'MacIntel' }), 'Your browser is zoomed out to 50%. Press Cmd+0 to reset it.');
    assert.equal(zoomHintText(67, { userAgent: WIN_CHROME, platform: 'Win32' }), 'Your browser is zoomed out to 67%. Press Ctrl+0 to reset it.');
    assert.equal(zoomResetKey({ userAgent: LINUX_CHROME, platform: 'Linux x86_64' }), 'Ctrl+0');
    assert.equal(zoomResetKey({ userAgentData: { platform: 'macOS' }, platform: '' }), 'Cmd+0');
    assert.equal(zoomResetKey({ userAgent: MAC_SAFARI }), 'Cmd+0');
  });

  it('has no em dash and fits a notice', () => {
    const text = zoomHintText(50, { platform: 'MacIntel' });
    assert.doesNotMatch(text, /—/);
    assert.ok(text.length < 80);
    assert.ok(ZOOM_HINT_MS <= NOTICE_MAX_MS);
  });
});

describe('G1328 (#726): once per browser', () => {
  it('is due once, then never again in that browser', () => {
    const store = memory();
    const win = fakeWin({ zoom: 0.5 });
    const shown = [];
    watchZoomHint({ win, store, notice: (t) => shown.push(t) });
    assert.deepEqual(shown, ['Your browser is zoomed out to 50%. Press Cmd+0 to reset it.']);
    assert.equal(store.value(), '1');
    assert.equal(zoomHintSeen(store), true);
    assert.equal((win.listeners.resize || []).length, 0, 'it stops listening once shown');
    // A new page load in the same browser.
    watchZoomHint({ win: fakeWin({ zoom: 0.5 }), store, notice: (t) => shown.push(t) });
    assert.equal(zoomHintDue({ win: fakeWin({ zoom: 0.5 }), store }), null);
    assert.equal(shown.length, 1);
  });

  it('waits for the game to start, then shows after a resize (a zoom change fires one)', async () => {
    const store = memory();
    const win = fakeWin({ zoom: 1 });
    const shown = [];
    let started = false;
    watchZoomHint({ win, store, notice: (t) => shown.push(t), ready: () => started, settleMs: 5 });
    assert.equal(shown.length, 0);
    // The player zooms out to 50% mid-game: innerWidth doubles, outerWidth stays.
    started = true;
    Object.assign(win, fakeWin({ zoom: 0.5 }), { listeners: win.listeners });
    win.self = win;
    win.top = win;
    win.listeners.resize.forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(shown.length, 1);
    assert.equal(store.value(), '1');
  });

  it('never shows when zoomed in, however often the window resizes', async () => {
    const store = memory();
    const win = fakeWin({ zoom: 1.5 });
    const shown = [];
    watchZoomHint({ win, store, notice: (t) => shown.push(t), settleMs: 1 });
    for (let i = 0; i < 3; i++) win.listeners.resize.forEach((fn) => fn());
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(shown.length, 0);
    assert.equal(store.value(), null);
  });

  it('a blocked store (a private window) still shows it, once this visit, and does not throw', () => {
    const store = memory({ broken: true });
    const shown = [];
    const win = fakeWin({ zoom: 0.5 });
    assert.doesNotThrow(() => markZoomHintSeen(store));
    assert.equal(zoomHintSeen(store), false);
    const w = watchZoomHint({ win, store, notice: (t) => shown.push(t) });
    w.check();
    assert.equal(shown.length, 1);
  });

  it('?zoomhint=0 never shows it', () => {
    assert.equal(zoomHintDue({ win: fakeWin({ zoom: 0.5, search: '?autostart=1&zoomhint=0' }), store: memory() }), null);
  });

  it('keeps the choice in the game\'s ui cache', () => {
    assert.equal(ZOOM_HINT_KEY, `groddle.ui.cache.${ZOOM_HINT_CACHE}`);
  });
});

describe('G1328 (#726): wiring', () => {
  const game = read('public/game.js');
  it('the game raises it through the one notifier (toast), after it starts, both interfaces, solo and online', () => {
    assert.match(game, /watchZoomHint\(\{[\s\S]{0,300}ready: \(\) => state\.started,[\s\S]{0,80}notice: \(text\) => toast\(text, ZOOM_HINT_MS\)/);
    assert.match(game, /readUiCache\(ZOOM_HINT_CACHE\)/);
  });

  it('is in the Inventions list as ours', () => {
    const entry = JSON.parse(read('tools/inventions/inventions.json')).entries.find((e) => e.id === 'zoomed-out-browser-hint');
    assert.ok(entry, 'zoomed-out-browser-hint entry');
    assert.equal(entry.kind, 'UI');
    assert.equal(entry.status, 'kept');
    assert.match(entry.ruling, /#726/);
    assert.deepEqual(entry.rows, ['G1328']);
  });
});
