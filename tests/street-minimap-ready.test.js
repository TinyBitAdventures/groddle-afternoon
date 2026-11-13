/**
 * READY (Austin 2026-11-13, desktop Modern arriving at Groddle Forest Junction: "the minimap looks bad
 * while loading. Any suggestions? Maybe hide it till it's ready to show?"). The street map waits unseen
 * on a new street, holding its place, until its first good snapshot, then fades in
 * (js/ui/street-minimap.js setReady; features/street-minimap-feature.js). The 2012 client snapped the
 * street once the location was built, behind its loading view (LocationViewBuilder.locationBuilt ->
 * TSFrontController.resnapMiniMap), and again as each late deco landed (DecoRenderer
 * addAndSyncDecoAsset), batched to once a second.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStreetMinimap } from '../public/js/ui/street-minimap.js?fresh=street-minimap-ready';
import { ART_CAP_MS, ART_SETTLE_MS, pendingArtSources, viewIsFor } from '../public/js/features/street-minimap-feature.js?fresh=street-minimap-ready';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');
const viewSrc = read('public/js/ui/street-minimap.js');
const featSrc = read('public/js/features/street-minimap-feature.js');

/* A small stand-in DOM: enough of an element for createStreetMinimap (every querySelector answers with its own element). */
function fakeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    hidden: false,
    inert: false,
    dataset: {},
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    attrs: {},
    children: [],
    parentElement: null,
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      contains(c) { return this.set.has(c); },
      toggle(c, on) { if (on ?? !this.set.has(c)) this.set.add(c); else this.set.delete(c); },
    },
    sel: new Map(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { delete this.attrs[k]; if (k === 'src') this.src = ''; },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    dispatch(t, e = {}) { for (const fn of listeners[t] || []) fn({ target: el, ...e }); },
    append(...kids) { for (const k of kids) { k.parentElement = el; el.children.push(k); } },
    prepend(...kids) { el.append(...kids); },
    replaceChildren() { el.children = []; },
    remove() {},
    contains: () => false,
    closest: () => null,
    focus() {},
    querySelector(s) { if (!el.sel.has(s)) el.sel.set(s, fakeEl()); return el.sel.get(s); },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 192, bottom: 100, width: 192, height: 100 }),
    clientWidth: 192,
    offsetWidth: 0,
    set innerHTML(v) { el._html = v; },
    get innerHTML() { return el._html || ''; },
  };
  if (tag === 'canvas') {
    el.width = 300;
    el.height = 150;
    el.draws = [];
    el.getContext = () => ({
      createLinearGradient: () => ({ addColorStop() {} }),
      clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      drawImage: (img) => el.draws.push(img),
    });
    el.toDataURL = (type = 'image/png') => `data:${type === 'image/webp' ? 'image/webp' : type};base64,AAAA`;
  }
  return el;
}

function fakeDoc() {
  return { createElement: (tag) => fakeEl(tag), documentElement: { clientWidth: 1280 }, activeElement: null };
}

const street = (tsid = 'LA', over = {}) => ({ tsid, bounds: { l: -2000, r: 2000, t: -1000, b: 0 }, signposts: [], gradient: { top: 'ccddee', bottom: 'eeffff' }, ...over });

function makeView(extra = {}) {
  const host = fakeEl();
  const log = { layout: [], ready: [] };
  const view = createStreetMinimap(fakeDoc(), host, {
    onLayout: (h) => log.layout.push(h),
    onReady: (on) => log.ready.push(on),
    raf: (fn) => fn(0),
    ...extra,
  });
  return { view, host, log };
}

describe('READY: the card waits unseen for its picture, then fades in', () => {
  it('a new street waits (data-ready false, inert) while it holds its place for the route card', () => {
    const { view, log } = makeView();
    view.setStreet(street());
    view.setState('shown');
    assert.equal(view.ready, false);
    assert.equal(view.root.dataset.ready, 'false');
    assert.equal(view.root.inert, true, 'no click or Tab reaches an unseen card');
    assert.equal(view.root.hidden, false, 'laid out, so it keeps its space');
    assert.ok(log.layout.at(-1) > 0, 'its height still goes to onLayout (--minimap-h): nothing under it jumps');
    assert.equal(view.root.dataset.picture, 'lines');
  });

  it('its first snapshot shows it with a fade; a failed one shows the lines instead of nothing', () => {
    const { view, log } = makeView();
    view.setStreet(street());
    view.setState('shown');
    assert.equal(view.setPicture(fakeEl('canvas')), true);
    assert.equal(view.ready, true);
    assert.equal(view.root.dataset.ready, 'true');
    assert.equal(view.root.dataset.fade, 'true');
    assert.equal(view.root.inert, false);
    assert.deepEqual(log.ready, [true]);

    const b = makeView();
    b.view.setStreet(street());
    b.view.setState('shown');
    b.view.reveal();
    assert.equal(b.view.ready, true);
    assert.equal(b.view.root.dataset.picture, 'lines');
  });

  it('the next street hides it again at once; the same street drawn again (a new width, a rebuild) stays shown', () => {
    const { view, log } = makeView();
    view.setStreet(street('LA'));
    view.setState('shown');
    view.setPicture(fakeEl('canvas'));
    view.setStreet(street('LA'), { keepPicture: true });
    assert.equal(view.ready, true, 'kept picture');
    assert.deepEqual(log.ready, [true], 'never hidden in between, so no second fade');
    view.setStreet(street('LB'));
    assert.equal(view.ready, false);
    assert.equal(view.root.inert, true);
    view.reveal();
    view.setStreet(street('LB'), { keepPicture: true });
    assert.equal(view.ready, true, 'a lines card shown after a failed snap stays shown when redrawn');
  });

  it('the CSS hides the waiting card (visibility keeps its box) and fades it in, not under reduced motion', () => {
    assert.match(css, /\.street-minimap\[data-ready="false"\] \{ visibility: hidden; opacity: 0; \}/);
    assert.match(css, /\.street-minimap\[data-ready="true"\]\[data-fade="true"\] \{ transition: opacity var\(--motion-med\) var\(--ease-out\); \}/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\}\s*\.street-minimap\[data-ready="true"\]\[data-fade="true"\] \{ transition: none; \}/);
    assert.match(css, /--motion-med: 180ms;/, 'about 0.2 s');
  });

  it('the feature keeps the old hooks and adds streetMapReady; a failed snapshot reveals the lines', () => {
    assert.match(featSrc, /setData\?\.\('streetMapReady', on \? '1' : '0'\)/);
    assert.match(featSrc, /if \(canvas\) view\.setPicture\(canvas\);\s+\/\/ READY[^\n]*\n\s+else if \(!view\.ready\) view\.reveal\(\);/);
    assert.match(viewSrc, /root\.dataset\.picture = kept \? 'snapshot' : 'lines';/, 'streetMapPicture keeps lines|snapshot');
  });
});

describe('ART: the snapshot waits for the street\'s art, with a cap', () => {
  const src = (state = {}) => ({ destroyed: false, ...state });
  const node = (texSource, children = []) => ({ texture: texSource ? { source: texSource } : null, children, destroyed: false });

  it('finds every image still loading under the view, once each, skipping loaded, failed and destroyed ones', () => {
    const slow = src({ id: 'slow' });
    const done = src({ id: 'done', ok: true });
    const bad = src({ id: 'bad', bad: true });
    const gone = src({ id: 'gone', destroyed: true });
    const canvas = src({ id: 'canvas', ok: true });
    const tree = node(null, [node(slow), node(done), node(null, [node(slow), node(bad), node(gone), { ...node(src()), destroyed: true }]), node(canvas)]);
    const got = pendingArtSources([tree, null], { loaded: (s) => Boolean(s.ok), failed: (s) => Boolean(s.bad) });
    assert.deepEqual(got.map((s) => s.id), ['slow']);
    assert.deepEqual(pendingArtSources([], { loaded: () => true, failed: () => false }), []);
  });

  it('only snaps the view of this street: the old street view stays up while the new one loads', () => {
    const here = { tsid: 'LA' };
    assert.equal(viewIsFor(null, here), false);
    assert.equal(viewIsFor({ destroyed: true, parallaxLayers: [], street: here }, here), false);
    assert.equal(viewIsFor({ parallaxLayers: [], street: { tsid: 'LB' } }, here), false, 'the street before');
    assert.equal(viewIsFor({ parallaxLayers: [], street: here }, here), true);
    assert.equal(viewIsFor({ parallaxLayers: [], street: { tsid: 'LA' } }, here), true, 'the same street');
    assert.equal(viewIsFor({ children: [] }, here), true, 'a scene a feature builds (live) is its own');
  });

  it('the cap: about 3 s after the map shows, then a re-snap when the rest lands; the bakes get a beat first', () => {
    assert.equal(ART_CAP_MS, 3000);
    assert.ok(ART_SETTLE_MS >= 60 && ART_SETTLE_MS <= 250);
    assert.doesNotMatch(featSrc, /SNAP_AT_MS = \[900, 4000\]/, 'no fixed 0.9 s snapshot');
    assert.match(featSrc, /if \(state === 'shown'\) startArtCap\(engine\);/, 'the cap runs from when the map shows');
    assert.match(featSrc, /a\.capped = true;[\s\S]{0,120}if \(view && !view\.ready\) snap\(engine\);/, 'the best snapshot at the cap');
    assert.match(featSrc, /a\.loaded = true;[\s\S]{0,400}if \(art === a\) snap\(engine\);/, 'and again once the art is in');
    assert.match(featSrc, /onLoaded\(src, done\);\s+onFailed\(src, done\);/, 'a failed image never holds the map back');
    assert.match(featSrc, /if \(!viewIsFor\(engine\.streetView, street\)\) return;/, 'snap never draws another street');
  });

  it('the phone sheet waits for the art the same way, not a fixed 60 ms snap', () => {
    const open = featSrc.slice(featSrc.indexOf('function phoneOpen('), featSrc.indexOf('function phoneClose('));
    assert.doesNotMatch(open, /view\.expand\(true\);\s+\/\/ One snapshot[^\n]*\n\s+scheduleSnaps\(engine, \[60\]\);/);
    assert.match(featSrc, /function phoneClose\([^)]*\) \{\s+if \(!phone\) return;\s+clearSnaps\(\);\s+stopArt\(\);/);
  });
});
