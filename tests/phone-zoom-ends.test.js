// Land1's note (2026-11-13): on a phone held sideways the Zoom slider's left end still said "Whole
// street", but sideways level 0 is a 408 px tall view (js/location-view.js landscapePhoneStage), not the
// whole street. Upright keeps "Whole street"; sideways says "Farthest", and the slider follows a turn.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LANDSCAPE_PHONE_ZOOM_ENDS, PHONE_ZOOM_ENDS, createWorldZoom, phoneSideways, phoneZoomEnds, phoneZoomLabel, phoneZoomValueText } from '../public/js/world-zoom.js?v=38816228';
import { zoomSlider } from '../public/js/ui/topbar.js?v=1ccfa0b4';

function fakeDoc(win) {
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, dataset: {}, listeners: {}, textContent: '', className: '', id: '',
      set innerHTML(html) {
        this._html = html;
        this.children = [...String(html).matchAll(/<span>([^<]*)<\/span>/g)].map((m) => ({ textContent: m[1] }));
      },
      get innerHTML() { return this._html || ''; },
      get firstElementChild() { return this.children[0] || null; },
      append(...kids) { this.children.push(...kids); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    };
    return node;
  };
  return { activeElement: null, createElement: make, defaultView: win };
}

function fakeWin(w, h) {
  const on = {};
  return {
    innerWidth: w,
    innerHeight: h,
    addEventListener(t, fn) { (on[t] ||= []).push(fn); },
    turn(nw, nh) { this.innerWidth = nw; this.innerHeight = nh; for (const fn of on.resize || []) fn(); },
  };
}

describe('the phone Zoom slider sideways', () => {
  it('names its ends by the way the phone is held', () => {
    assert.deepEqual([...PHONE_ZOOM_ENDS], ['Whole street', 'Closest']);
    assert.deepEqual([...LANDSCAPE_PHONE_ZOOM_ENDS], ['Farthest', 'Closest']);
    assert.equal(phoneZoomEnds(), PHONE_ZOOM_ENDS);
    assert.equal(phoneZoomEnds({ landscape: true }), LANDSCAPE_PHONE_ZOOM_ENDS);
    assert.equal(phoneZoomLabel(0), 'Whole street');
    assert.equal(phoneZoomLabel(0, { landscape: true }), 'Farthest');
    assert.equal(phoneZoomLabel(1, { landscape: true }), 'Closest');
    assert.equal(phoneZoomLabel(0.4, { landscape: true }), '40%');
    assert.equal(phoneZoomValueText(0, { landscape: true }), 'Farthest');
    assert.equal(phoneZoomValueText(0.5, { landscape: true }), '50% of the way from the farthest to the closest');
    assert.equal(phoneZoomValueText(0.5), '50% of the way from the whole street to the closest');
  });

  it('decides sideways as the stage does (upright only when taller than wide)', () => {
    assert.equal(phoneSideways(402, 660), false);
    assert.equal(phoneSideways(874, 402), true);
    assert.equal(phoneSideways(500, 500), true);
    assert.equal(phoneSideways(0, 0), false);
  });

  it('the slider says Farthest sideways and Whole street upright, and follows a turn', () => {
    const level = createWorldZoom({ win: null, storage: null, fallback: 0 });
    const zoom = { ...level, phone: true, get: () => level.get(), set: (z) => level.set(z), onChange: (f) => level.onChange(f), fixed: () => false, onFixedChange() {} };
    const win = fakeWin(874, 402);
    const { row, input } = zoomSlider(fakeDoc(win), zoom, { id: 'menu-zoom', where: 'menu' });
    const ends = row.children.find((n) => n.className === 'hud-zoom-ends');
    const out = row.children.find((n) => n.tagName === 'OUTPUT');
    assert.equal(ends.children[0].textContent, 'Farthest');
    assert.equal(ends.children[1].textContent, 'Closest');
    assert.equal(out.textContent, 'Farthest');
    assert.equal(input.getAttribute('aria-valuetext'), 'Farthest');
    win.turn(402, 660);
    assert.equal(ends.children[0].textContent, 'Whole street');
    assert.equal(out.textContent, 'Whole street');
    win.turn(874, 402);
    assert.equal(ends.children[0].textContent, 'Farthest');
  });

  it('a computer slider keeps Wide and Original', () => {
    const zoom = createWorldZoom({ win: null, storage: null });
    const { row } = zoomSlider(fakeDoc(fakeWin(1280, 800)), zoom, { id: 'menu-zoom', where: 'menu' });
    const ends = row.children.find((n) => n.className === 'hud-zoom-ends');
    assert.deepEqual(ends.children.map((n) => n.textContent), ['Wide', 'Original']);
  });
});
