// SHARP MARKS (Austin 2026-11-24, iPhone sideways, the phone street map sheet: "The mobile signs on
// the map are blurry"). The map's signposts and the rows' icons were Tiny Speck's 10 x 15
// teensy_signpost (and the 24 x 23 map_icon_subway) blown up about ten times on a 3x screen. They now
// draw vector traces of those bitmaps (tools/classic-art/hd-art.mjs) wherever they are scaled up,
// and Classic keeps the bitmap at 1x with the trace from 2x.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createStreetMinimap, markArt } from '../public/js/ui/street-minimap.js?fresh=street-minimap-hd';
import { CLASSIC_ART, classicArtHd, classicArtUrl } from '../public/js/classic/classic-art.js?v=87cb1722';
import { HD_ART, SIGNPOST_SAMPLES, hdSvg, signpostSampleProblems } from '../tools/classic-art/hd-art.mjs';
import { ASSETS, artSize, check } from '../tools/classic-art/build.mjs';
import { decodePng } from '../tools/builder/art-image.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const feature = read('public/js/features/street-minimap-feature.js');
const art = { artUrl: classicArtUrl, artHd: classicArtHd };

/* A small stand-in DOM, as tests/street-minimap-ready.test.js's. */
function fakeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(), hidden: false, inert: false, dataset: {}, attrs: {}, children: [], parentElement: null,
    style: { setProperty() {} },
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle() {} },
    sel: new Map(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {},
    append(...kids) { for (const k of kids) { k.parentElement = el; el.children.push(k); } },
    prepend(...kids) { el.append(...kids); },
    replaceChildren() { el.children = []; },
    remove() {}, contains: () => false, closest: () => null, focus() {},
    querySelector(s) { if (!el.sel.has(s)) el.sel.set(s, fakeEl()); return el.sel.get(s); },
    querySelectorAll: () => [],
    decode: () => Promise.resolve(),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 192, bottom: 100, width: 192, height: 100 }),
    clientWidth: 192, offsetWidth: 0,
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html || ''; },
  };
  if (tag === 'canvas') {
    el.width = 300;
    el.height = 150;
    el.getContext = () => ({ createLinearGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {} });
  }
  return el;
}

const street = {
  tsid: 'LA', bounds: { l: -2000, r: 2000, t: -1000, b: 0 }, gradient: { top: 'ccddee', bottom: 'eeffff' },
  signposts: [{ id: 's1', x: -1900, y: -10, connects: [{ label: 'Kebra Glories' }] }],
  doors: [{ id: 'd1', x: 1800, y: -10, subwayStation: 'Somewhere Subway Station' }],
};

function marksOf(opts) {
  const view = createStreetMinimap({ createElement: (t) => fakeEl(t), documentElement: { clientWidth: 1280 }, activeElement: null }, fakeEl(), { raf: (fn) => fn(0), ...opts });
  view.setStreet(street);
  const signs = view.root.querySelector('.smm-signs').children;
  return { view, signs, html: (kind) => signs.find((b) => b.dataset.kind === kind)?.innerHTML || '' };
}

describe('SHARP MARKS: the street map\'s signposts and subway icons stay sharp when scaled up', () => {
  it('the traces ship beside the bitmaps, in the same box, and the classic-art check passes', () => {
    for (const [name, of] of [['teensy_signpost_hd', 'teensy_signpost'], ['map_icon_subway_hd', 'map_icon_subway']]) {
      const a = CLASSIC_ART[name];
      assert.ok(a, `${name} is in the classic art module`);
      assert.equal(a.kind, 'hd');
      assert.equal(a.of, of);
      assert.equal(classicArtHd(of), a.url);
      const buf = readFileSync(join(root, 'public', a.url));
      assert.deepEqual(artSize(buf, name), [CLASSIC_ART[of].w, CLASSIC_ART[of].h], 'the trace keeps the bitmap\'s box, so marks keep their size');
      assert.equal(buf.toString('utf8'), hdSvg(name), 'the file is the builder\'s output');
      assert.doesNotMatch(buf.toString('utf8'), /<image\b|<filter\b/, 'a vector, not an embedded bitmap');
    }
    assert.equal(classicArtHd('map_expand_arrow'), null);
    assert.deepEqual(check(), [], 'node tools/classic-art/build.mjs --check');
  });

  it('the signpost trace uses the bitmap\'s own colours (glitch-client teensy_signpost.png)', (t) => {
    const src = join(ASSETS, 'graphics/teensy_signpost.png');
    if (!existsSync(src)) return t.skip('glitch-client is not beside the game');
    const img = decodePng(readFileSync(src));
    assert.equal(img.w, HD_ART.teensy_signpost_hd.w);
    assert.equal(img.h, HD_ART.teensy_signpost_hd.h);
    assert.ok(SIGNPOST_SAMPLES.length >= 5);
    assert.deepEqual(signpostSampleProblems(img), []);
  });

  it('markArt: the trace when crisp, else the bitmap at 1x and the trace from 2x', () => {
    assert.equal(markArt('teensy_signpost', { ...art, crisp: true }), '<img alt="" src="assets/classic/teensy_signpost_hd.svg" />');
    assert.equal(markArt('teensy_signpost', { ...art, crisp: false }), '<img alt="" src="assets/classic/teensy_signpost.webp" srcset="assets/classic/teensy_signpost.webp 1x, assets/classic/teensy_signpost_hd.svg 2x" />');
    assert.equal(markArt('map_icon_subway', { ...art, crisp: true }), '<img alt="" src="assets/classic/map_icon_subway_hd.svg" />');
    assert.equal(markArt('map_expand_arrow', { ...art, crisp: true }), '<img alt="" src="assets/classic/map_expand_arrow.webp" />', 'a piece with no trace stays as it was');
  });

  it('the map draws the traces when crisp (Modern, the phone sheet) and the srcset in Classic, and follows a skin change', () => {
    let classic = false;
    const { view, html } = marksOf({ ...art, crisp: () => !classic });
    assert.match(html('sign'), /src="assets\/classic\/teensy_signpost_hd\.svg"/);
    assert.match(html('station'), /src="assets\/classic\/map_icon_subway_hd\.svg"/);
    classic = true;
    view.refreshArt();
    assert.match(html('sign'), /src="assets\/classic\/teensy_signpost\.webp" srcset="assets\/classic\/teensy_signpost\.webp 1x, assets\/classic\/teensy_signpost_hd\.svg 2x"/);
    assert.match(html('station'), /srcset="assets\/classic\/map_icon_subway\.webp 1x, assets\/classic\/map_icon_subway_hd\.svg 2x"/);
  });

  it('the phone sheet\'s map and rows and the Modern card use the traces; Classic only from 2x', () => {
    const open = feature.slice(feature.indexOf('function phoneOpen(engine)'), feature.indexOf('function phoneClose('));
    assert.match(open, /markArt\(row\.kind === 'door' \? doorArtName\(row\.look\) : row\.kind === 'station' \? 'map_icon_subway' : 'teensy_signpost', withDoorArt\(\{ artUrl: classicArtUrl, artHd: classicArtHd, crisp: true \}\)\)/, 'the rows\' icons');
    assert.match(open, /createStreetMinimap\(doc, mapBox, \{\s+artUrl: classicArtUrl,\s+artHd: classicArtHd,\s+crisp: \(\) => true,/, 'the sheet\'s map');
    const init = feature.slice(feature.indexOf('view = createStreetMinimap(document, host, {'));
    assert.match(init, /artHd: classicArtHd,\s+crisp: \(\) => document\.documentElement\.dataset\.ui !== 'classic',/, 'the corner card');
    assert.match(init, /onUiModeChange\(\(\) => setTimeout\(\(\) => \{\s+view\?\.refreshArt\(\);/);
    assert.doesNotMatch(feature, /src="\$\{classicArtUrl\('teensy_signpost'\)\}"|classicArtUrl\(row\.kind === 'station' \? 'map_icon_subway' : 'teensy_signpost'\)/, 'no bare 1x bitmap left in the rows');
  });
});
