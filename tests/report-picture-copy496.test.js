// #496 (a phone): the report picture with the game's UI did not match the screen: its words wrapped in
// another font, and a scrolled list (Skills) showed at its top. The copy now carries the loaded fonts
// inline, waits for them, is drawn again in every engine, and keeps each scrolled box where it was.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  unicodeRangeKey, loadedFontFaces, fontFaceCss, fontsSettled, redrawCount, MIN_REDRAWS,
  markScrolls, restoreScrolls,
} from '../public/js/features/bug-report-feature.js?v=191cfb5e';

const root = join(import.meta.dirname, '..');
const src = readFileSync(join(root, 'public/js/features/bug-report-feature.js'), 'utf8');

const faceRule = (family, style, range, url) => ({
  type: 5,
  style: { getPropertyValue: (k) => ({ 'font-family': family, 'font-style': style, 'unicode-range': range })[k] || '' },
  cssText: `@font-face { font-family: ${family}; font-style: ${style}; src: url("${url}") format("woff2"); unicode-range: ${range}; }`,
});

function fontDoc(loaded) {
  return {
    baseURI: 'http://x.test/play/',
    fonts: loaded,
    styleSheets: [
      { href: 'http://x.test/style.css', cssRules: [
        faceRule('Nunito', 'normal', 'U+0000-00FF, U+0131', 'assets/fonts/nunito/roman-latin.woff2'),
        faceRule('Nunito', 'normal', 'U+0100-02BA', 'assets/fonts/nunito/roman-ext.woff2'),
        { cssRules: [faceRule('Nunito', 'italic', 'U+0000-00FF, U+0131', 'assets/fonts/nunito/italic-latin.woff2')] },
        { type: 1, selectorText: 'body', style: { getPropertyValue: () => '' }, cssText: 'body {}' },
      ] },
      { href: 'http://other.test/x.css', get cssRules() { throw new Error('SecurityError'); } },
    ],
  };
}

describe('#496 the copy carries the page fonts', () => {
  it('reads a unicode-range the same however it is written', () => {
    assert.equal(unicodeRangeKey('U+0000-00FF, U+0131'), unicodeRangeKey('U+0-FF, U+131'));
    assert.equal(unicodeRangeKey('U+4??'), '1024-1279');
    assert.equal(unicodeRangeKey(''), '0-1114111');
  });

  it('lists only the faces the page has loaded, files resolved against their stylesheet', () => {
    const doc = fontDoc([
      { family: '"Nunito"', style: 'normal', unicodeRange: 'U+0-FF, U+131', status: 'loaded' },
      { family: 'Nunito', style: 'normal', unicodeRange: 'U+100-2BA', status: 'unloaded' },
      { family: 'Nunito', style: 'italic', unicodeRange: 'U+0-FF, U+131', status: 'loaded' },
    ]);
    const faces = loadedFontFaces(doc);
    assert.deepEqual(faces.map((f) => f.urls[0][1]), [
      'http://x.test/assets/fonts/nunito/roman-latin.woff2',
      'http://x.test/assets/fonts/nunito/italic-latin.woff2',
    ]);
  });

  it('is empty when nothing is loaded, so the library embeds as before', async () => {
    const doc = fontDoc([{ family: 'Nunito', style: 'normal', unicodeRange: 'U+0-FF', status: 'loading' }]);
    assert.deepEqual(loadedFontFaces(doc), []);
    assert.equal(await fontFaceCss(doc, async () => 'data:x'), '');
  });

  it('inlines each loaded file as a data URL, and gives up whole when one cannot be read', async () => {
    const doc = fontDoc([{ family: 'Nunito', style: 'normal', unicodeRange: 'U+0-FF, U+131', status: 'loaded' }]);
    const css = await fontFaceCss(doc, async (url) => `data:font/woff2;base64,${Buffer.from(url).toString('base64')}`);
    assert.match(css, /@font-face/);
    assert.match(css, /url\("data:font\/woff2;base64,/);
    assert.doesNotMatch(css, /assets\/fonts/);
    assert.equal(await fontFaceCss(doc, async () => { throw new Error('offline'); }), '');
  });

  it('waits for document.fonts.ready, never longer than its limit', async () => {
    assert.equal(await fontsSettled({ fonts: { ready: Promise.resolve() } }, 500), true);
    const t0 = Date.now();
    assert.equal(await fontsSettled({ fonts: { ready: new Promise(() => {}) } }, 30), false);
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(await fontsSettled({}, 30), false);
  });

  it('draws the copy again in every engine, WebKit still capped', () => {
    assert.equal(redrawCount(0), MIN_REDRAWS);
    assert.ok(MIN_REDRAWS >= 1);
    assert.equal(redrawCount(99), 4);
  });

  it('capturePictureWithUi uses them: fonts first, carried as font.cssText, redraws, scrolls', () => {
    const body = src.slice(src.indexOf('export async function capturePictureWithUi'));
    assert.match(body, /await fontsSettled\(doc\)/);
    assert.match(body, /font: \{ cssText: fontCss \}/);
    assert.match(body, /redrawCount\(context\.drawImageCount\)/);
    assert.match(body, /markScrolls\(root\)/);
    assert.match(body, /restoreScrolls\(clone\)/);
    assert.match(body, /unmark\?\.\(\)/);
  });
});

// —— A tiny DOM: enough for marks, children and sticky parts ——
class El {
  constructor(opts = {}) {
    Object.assign(this, { children: [], attrs: {}, style: { position: opts.position || '', transform: opts.transform || '' }, scrollTop: 0, scrollLeft: 0, pos: opts.position || 'static', rect: opts.rect || { left: 0, top: 0 }, home: opts.home || null });
  }
  add(...kids) { this.children.push(...kids); return this; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  matches(sel) { return sel === '[data-shot-scroll]' && 'data-shot-scroll' in this.attrs; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(sel) {
    const list = this.all();
    if (sel === '*') return list;
    const name = sel.slice(1, -1);
    return list.filter((n) => name in n.attrs);
  }
  getBoundingClientRect() { return this.style.position === 'relative' && this.home ? this.home : this.rect; }
}
const win = { getComputedStyle: (n) => ({ position: n.pos }) };

describe('#496 the copy keeps scrolled boxes where the player scrolled them', () => {
  it('marks a scrolled box and its stuck parts, and takes the marks off again', () => {
    const tools = new El({ position: 'sticky', rect: { left: 0, top: 100 }, home: { left: 0, top: -500 } });
    const row = new El();
    const list = new El().add(tools, row);
    list.scrollTop = 600;
    const still = new El();
    const page = new El().add(list, still);
    const unmark = markScrolls(page, win);
    assert.equal(list.getAttribute('data-shot-scroll'), '0,600');
    assert.equal(tools.getAttribute('data-shot-sticky'), '0,600');
    assert.equal(tools.style.position, 'sticky', 'the sticky part is put back');
    assert.equal(still.getAttribute('data-shot-scroll'), null);
    unmark();
    assert.equal(list.getAttribute('data-shot-scroll'), null);
    assert.equal(tools.getAttribute('data-shot-sticky'), null);
  });

  it('moves the copy\'s children up by the scroll, keeping their own transform, and holds sticky parts', () => {
    const tools = new El({ transform: 'none' });
    tools.setAttribute('data-shot-sticky', '0,600');
    const row = new El({ transform: 'matrix(1, 0, 0, 1, 5, 0)' });
    const list = new El().add(tools, row);
    list.setAttribute('data-shot-scroll', '0,600');
    const clone = new El().add(list);
    assert.equal(restoreScrolls(clone), 1);
    assert.equal(row.style.transform, 'translate(0px, -600px) matrix(1, 0, 0, 1, 5, 0)');
    assert.equal(tools.style.transform, 'translate(0px, -600px)');
    assert.equal(tools.style.position, 'relative');
    assert.equal(tools.style.top, '600px');
  });
});
