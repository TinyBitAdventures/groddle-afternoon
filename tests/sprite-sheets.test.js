/**
 * js/sprite-sheets.js (G281): grid cells, and the loader's texture cache keyed by
 * file and cell rect, so two clips cutting one file from different start cells
 * (`first`) never share frames. Against a small Pixi stand-in (as tests/textures.test.js).
 * Run: node --test tests/sprite-sheets.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn) { (this.handlers.get(ev) || this.handlers.set(ev, []).get(ev)).push(fn); return this; }
  once(ev, fn) { return this.on(ev, fn); }
  emit(ev, ...a) { for (const fn of this.handlers.get(ev) || []) fn(...a); return this; }
}
class ImageSource extends Emitter {
  constructor({ resource, label, resolution = 1 }) {
    super();
    Object.assign(this, { resource, label, resolution, width: 1, height: 1 });
  }
  resize(w, h) { Object.assign(this, { width: w, height: h }); return true; }
  update() {}
}
class Texture extends Emitter {
  constructor({ source, frame, label }) { super(); Object.assign(this, { source, frame, label }); }
}
class Rectangle {
  constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
}
class FakeImage {
  set src(url) {
    this._src = url;
    setTimeout(() => {
      this.naturalWidth = 400;
      this.naturalHeight = 200;
      this.onload?.();
    }, 1);
  }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

let S;
const saved = {};
before(async () => {
  for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
  globalThis.PIXI = { ImageSource, Texture, Rectangle };
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
  S = await import('../public/js/sprite-sheets.js?v=0e86cc0f');
});
after(() => {
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

const rectOf = (t) => [t.frame.x, t.frame.y, t.frame.width, t.frame.height];

describe('js/sprite-sheets.js', () => {
  it('cellRect counts from `first` along the rows', () => {
    const def = { path: 'p.png', fw: 40, fh: 50, cols: 4, frames: 3, first: 3 };
    assert.deepEqual(S.cellRect(def, 0), { x: 120, y: 0, w: 40, h: 50 });
    assert.deepEqual(S.cellRect(def, 1), { x: 0, y: 50, w: 40, h: 50 });
    assert.deepEqual(S.cellRect({ ...def, first: undefined }, 1), { x: 40, y: 0, w: 40, h: 50 });
  });

  it('two clips cutting one file from different start cells get their own frames', async () => {
    const loader = S.createSheetLoader(globalThis.PIXI);
    const idle = { path: 'assets/sheet-g281.png', fw: 40, fh: 50, cols: 4, frames: 3 };
    const talk = { ...idle, first: 4 };
    await loader.loadAll([idle, talk]);
    const a = loader.frames(idle);
    const b = loader.frames(talk);
    assert.deepEqual(a.map(rectOf), [[0, 0, 40, 50], [40, 0, 40, 50], [80, 0, 40, 50]]);
    assert.deepEqual(b.map(rectOf), [[0, 50, 40, 50], [40, 50, 40, 50], [80, 50, 40, 50]]);
    assert.ok(a.every((t) => !b.includes(t)));
  });

  it('still shares a cell two clips both cut (one texture per file and rect)', async () => {
    const loader = S.createSheetLoader(globalThis.PIXI);
    const whole = { path: 'assets/sheet-g281b.png', fw: 40, fh: 50, cols: 4, frames: 6 };
    const tail = { ...whole, frames: 2, first: 4 };
    await loader.loadAll([whole, tail]);
    const all = loader.frames(whole);
    const end = loader.frames(tail);
    assert.equal(end[0], all[4]);
    assert.equal(end[1], all[5]);
    assert.equal(loader.frames(whole)[0], all[0], 'cached across calls');
  });

  it('the key is the file and the rect', () => {
    assert.equal(S.textureKey('a.png', { x: 40, y: 50, w: 40, h: 50 }), 'a.png#40,50,40,50');
  });
});
