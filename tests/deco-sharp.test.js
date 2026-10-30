/**
 * Sharp street decos (tools/deco-pipeline/sharp.py): decos some street draws far larger than their
 * 2x/3x WebPs ship an SVG (rasterised at the screen's need) or a WebP sized to the largest
 * placement, and js/street-render.js picks them per density on the layers drawn sharp.
 * Run: node --test tests/deco-sharp.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHARP_DECOS } from '../public/js/deco-sharp-list.js?v=g435-1';
import { HIRES_DECOS } from '../public/js/deco-hires-list.js?v=g457-2';
import { FAR_SHARP_BUDGET_BYTES, SHARP_SLACK, SVG_MAX_PIXELS, SVG_MAX_SIDE, admitSharp, isSharpDeco, sharpDeco } from '../public/js/deco-hires.js?v=g457-2';
import { resolutionOfUrl } from '../public/js/textures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decoDir = join(root, 'public/assets/decos/groddle');
const sharpPlan = JSON.parse(readFileSync(join(root, 'tools/deco-pipeline/plan-sharp.json'), 'utf8'));
const rows = new Map(sharpPlan.decos.map((r) => [r.name, r]));
const street = (tsid) => JSON.parse(readFileSync(join(root, `public/assets/streets/${tsid}.json`), 'utf8'));
const python = '/opt/homebrew/bin/python3.11';
const url = (name) => `assets/decos/groddle/${name}.png`;

function webpSize(file) {
  const b = readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe('sharp deco files', () => {
  it('lists exactly the plan rows and ships each one', () => {
    assert.ok(SHARP_DECOS.size > 500, `${SHARP_DECOS.size} sharp decos`);
    assert.deepEqual([...SHARP_DECOS.keys()].sort(), [...rows.keys()].sort());
    for (const [name, [kind, s, w, h, res, sf, sb]] of SHARP_DECOS) {
      const r = rows.get(name);
      assert.equal(kind, r.kind, name);
      assert.equal(s, r.s, name);
      assert.equal(sf, r.sf || 0, name);
      assert.equal(sb, r.sb || 0, name);
      assert.ok(s > 0 || sf > 0 || sb > 0, `${name} is needed somewhere`);
      assert.deepEqual([w, h], r.size2, name);
      if (kind === 'svg') {
        const svg = readFileSync(join(decoDir, `${name}.svg`), 'utf8');
        assert.match(svg, /^<svg viewBox="0 0 [\d.]+ [\d.]+" preserveAspectRatio="none" /, name);
        assert.doesNotMatch(svg, /<script|<image|<foreignObject|javascript:|href="(?!#)/i, name);
      } else {
        const file = join(decoDir, `${name}@${res}x.webp`);
        assert.ok(existsSync(file), file);
        const [fw, fh] = webpSize(file);
        assert.ok(Math.abs(fw / res - w) <= 0.5 && Math.abs(fh / res - h) <= 0.5, `${name} ${fw}x${fh} at ${res}`);
        assert.equal(resolutionOfUrl(file), res);
        assert.ok(Math.max(fw, fh) <= 4096, name);
      }
    }
  });

  it('never takes over a hand-made SVG or a 3x file name', () => {
    for (const name of ['moon_asset_smile', 'moon_asset_plain']) {
      assert.ok(existsSync(join(decoDir, `${name}.svg`)), name);
      assert.notEqual(SHARP_DECOS.get(name)?.[0], 'svg', name);
    }
    for (const [name, [kind, , , , res]] of SHARP_DECOS) {
      if (kind === 'webp') assert.ok(res !== 1.5 && res > (HIRES_DECOS.has(name) ? 1.5 : 1), `${name} at ${res}`);
    }
  });

  it('the reported chimney on Guillermo Gamera Way is a sharp SVG', () => {
    const r = rows.get('chimney_yellow_front_01');
    assert.equal(r.kind, 'svg');
    assert.equal(r.worst.tsid, 'GM4109NI2R640');
    assert.equal(r.worst.layer, 'foreground');
    // 268 x 887 view px over a 114 x 382 logical deco: 2.35 view px per logical px across.
    assert.equal(r.s, +Math.max(268 / 114, 887 / 382).toFixed(4));
  });

  it('sharp.py --check: files, list and placements are current', { skip: !existsSync(python) && 'needs python3.11' }, () => {
    const out = execFileSync(python, ['-I', join(root, 'tools/deco-pipeline/sharp.py'), '--check'], { encoding: 'utf8', timeout: 600000 });
    assert.match(out, / 0 problems\n$/);
  });
});

describe('sharpDeco picks the copy for the density', () => {
  it('SVG at the need, rounded up a quarter octave, logical size unchanged', () => {
    const [, s, w, h] = SHARP_DECOS.get('chimney_yellow_front_01');
    for (const R of [1, 1.6, 2, 3.3, 4]) {
      const pick = sharpDeco(url('chimney_yellow_front_01'), R);
      assert.equal(pick.kind, 'svg');
      const r = Number(new URL(pick.url, 'http://x/').searchParams.get('r'));
      const need = (R * s) / SHARP_SLACK;
      assert.ok(r >= need - 1e-3 && r < need * 2 ** 0.25 + 1e-3, `R ${R}: r ${r} for need ${need}`);
      assert.equal(pick.width, Math.round(w * r));
      assert.equal(pick.height, Math.round(h * r));
      assert.ok(Math.abs(pick.width / pick.resolution - w) < 1e-9);
      // Texels per view px on the worst placement, within the slack.
      assert.ok((pick.width / w) / s >= R / SHARP_SLACK - 1e-6, `R ${R}`);
    }
    // 4 backing px per view px (the cap): 4 x 2.35 / (4/3) = 7.05, up to 2^3.
    assert.match(sharpDeco(url('chimney_yellow_front_01'), 4).url, /^assets\/decos\/groddle\/chimney_yellow_front_01\.svg\?r=8$/);
  });

  it('caps SVG rasters at 4096 px on a side and 8 Mpx', () => {
    assert.equal(SVG_MAX_SIDE, 4096);
    for (const [name, [kind, , w, h]] of SHARP_DECOS) {
      if (kind !== 'svg') continue;
      for (const maxSide of [2048, 4096, 8192]) {
        const pick = sharpDeco(url(name), 4, { maxSide });
        if (!pick) continue;
        assert.ok(Math.max(pick.width, pick.height) <= Math.min(maxSide, SVG_MAX_SIDE) + 1, `${name} ${pick.width}x${pick.height}`);
        assert.ok(pick.width * pick.height <= SVG_MAX_PIXELS * 1.01, name);
        assert.ok(pick.width / w > (HIRES_DECOS.has(name) ? 1.5 : 1), name);
      }
    }
  });

  it('sized WebP only where the 2x/3x file is not enough', () => {
    const [name, [, s, , , res]] = [...SHARP_DECOS].find(([, v]) => v[0] === 'webp' && v[1] > 0);
    assert.equal(sharpDeco(url(name), 4).url, `assets/decos/groddle/${name}@${res}x.webp`);
    // Low enough density that the 2x file covers the worst placement: the normal route.
    const low = (SHARP_SLACK * 0.99) / s;
    if (low >= 1) assert.equal(sharpDeco(url(name), low), null);
    const plain = JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')).find((n) => !SHARP_DECOS.has(n));
    assert.equal(sharpDeco(url(plain), 4), null);
    assert.equal(isSharpDeco(url(plain)), false);
    assert.equal(isSharpDeco(url(name)), true);
    assert.equal(sharpDeco('assets/sprites/icons/apple.png', 4), null);
  });
});

describe('far and blurred layers', () => {
  it('far: the 2x file is the base and sf the scale; blurred: the bake density times sb', () => {
    const [name, [kind, s, w, , , sf, sb]] = [...SHARP_DECOS].find(([, v]) => v[1] === 0 && v[5] > 0 && v[0] === 'svg');
    assert.equal(sharpDeco(url(name), 4), null, 'no near need');
    const pick = sharpDeco(url(name), 4, { far: true });
    assert.equal(pick.kind, kind);
    assert.equal(pick.base, 1);
    assert.ok(Math.abs(pick.need - (4 * sf) / SHARP_SLACK) < 1e-9);
    assert.ok(pick.width / w >= Math.min(pick.need, SVG_MAX_SIDE / w) - 1e-6 || pick.width * pick.height >= SVG_MAX_PIXELS * 0.99);
    // At a density where the 2x file covers the far placement, the far layer keeps it.
    assert.equal(sharpDeco(url(name), (SHARP_SLACK * 0.99) / sf, { far: true }), null);
    void s; void sb;
    const [bname, [, , , , , , bsb]] = [...SHARP_DECOS].find(([, v]) => v[6] > 0);
    const bp = sharpDeco(url(bname), 4, { far: true, blurDensity: 2 });
    assert.ok(Math.abs(bp.need - 2 * bsb) < 1e-9);
    assert.equal(sharpDeco(url(bname), 4, { far: true, blurDensity: 0.99 / bsb }), null);
  });

  it('admitSharp takes the most magnified first, once per URL, within the budget', () => {
    const p = (url, need, bytes) => ({ url, need, base: 1, bytes, w: 10, h: 10 });
    const got = admitSharp([p('a', 2, 1000), p('b', 8, 3000), p('b', 8, 3000), p('c', 4, 2500)], 4000);
    // b (8x) costs 2600, then c (4x) 2100 would pass 4000, then a (2x) 600 fits.
    assert.deepEqual([...got].sort(), ['a', 'b']);
    assert.equal(admitSharp([p('a', 2, 1000)], 0).size, 0);
    assert.equal(FAR_SHARP_BUDGET_BYTES, 96 * 1024 * 1024);
  });
});

/** Pixi pieces buildStreetView touches; images "load" on the next tick. */
function fakePixi() {
  class Container {
    constructor() {
      Object.assign(this, { children: [], parent: null, destroyed: false, listeners: {}, x: 0, y: 0, visible: true });
      this.anchor = { x: 0, y: 0, set: (x, y = x) => Object.assign(this.anchor, { x, y }) };
      this.scale = { x: 1, y: 1, set: (x, y = x) => Object.assign(this.scale, { x, y }) };
    }
    addChild(...kids) {
      for (const kid of kids) {
        kid.parent = this;
        this.children.push(kid);
      }
      return kids[0];
    }
    once(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    destroy() {
      this.destroyed = true;
      for (const fn of this.listeners.destroyed || []) fn();
    }
  }
  class Graphics extends Container {}
  for (const verb of ['rect', 'fill', 'ellipse', 'roundRect', 'moveTo', 'lineTo', 'stroke', 'circle']) Graphics.prototype[verb] = function chain() { return this; };
  class Sprite extends Container {
    constructor(texture) {
      super();
      this.texture = texture;
    }
  }
  class ImageSource {
    constructor(o) {
      Object.assign(this, o, { width: 1, height: 1, handlers: {} });
    }
    on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
    once(name, fn) { return this.on(name, fn); }
    off() { return this; }
    emit(name, ...args) { for (const fn of this.handlers[name] || []) fn(...args); }
    resize(w, h) { Object.assign(this, { width: w, height: h }); return true; }
    update() {}
  }
  class Texture {
    constructor(o) { Object.assign(this, o); }
  }
  return { Container, Graphics, Sprite, ImageSource, Texture, ColorMatrixFilter: class {}, Rectangle: class {} };
}

describe('street-render draws sharp copies on the sharp layers', () => {
  it('Guillermo Gamera Way: the front chimney takes its SVG and follows the resolution', async () => {
    globalThis.PIXI = fakePixi();
    globalThis.Image = class {
      set src(v) {
        this._src = v;
        this.naturalWidth = 100;
        this.naturalHeight = 100;
        setTimeout(() => this.onload?.(), 0);
      }
    };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    const { buildStreetView } = await import('../public/js/street-render.js?v=g457-2');
    const handlers = {};
    const renderer = {
      resolution: 1,
      gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 8192 },
      generateTexture: () => null,
      on: (name, fn) => { (handlers[name] ||= []).push(fn); },
      off: (name, fn) => { handlers[name] = (handlers[name] || []).filter((f) => f !== fn); },
    };
    const manifest = new Set(JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')));
    const s = { ...street('GM4109NI2R640'), gradient: null, signposts: [] };
    // The fake has no colour filters: drop the layers' filters so nothing bakes.
    s.layers = s.layers.map((l) => ({ ...l, filters: null }));
    const view = buildStreetView(s, globalThis.PIXI, { available: manifest, renderer });
    const chimney = () => view.frontView.children.flatMap((lc) => lc.children).find((c) => /chimney_yellow_front_01/.test(c.texture?.label || ''));
    // 1 x 2.35 / (4/3) = 1.76, up to 2.
    assert.match(chimney().texture.label, /chimney_yellow_front_01\.svg\?r=2$/);
    // Layers behind the middleground load the 2x files, or a sharp copy where the deco has a far need.
    const far = view.children.filter((c) => c.label && c.label !== 'middleground' && !c.inFront && c.children).flatMap((lc) => lc.children);
    assert.ok(far.length > 50);
    for (const spr of far) {
      const label = spr.texture?.label || '';
      if (/\/[^/@]+\.webp$/.test(label) || !label) continue;
      const name = label.replace(/^.*\/([^/@?]+?)(?:@[\d.]+x\.webp|\.svg\?r=.*)$/, '$1');
      assert.ok(SHARP_DECOS.get(name)?.[5] > 0, `${label}: far copy without a far need`);
    }
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual([chimney().width, chimney().height], [268, 887]);
    assert.ok(view.sharpStats().svg >= 1);
    // Retina: the renderer goes to 3.3; after the debounce the chimney is drawn again at the need.
    renderer.resolution = 3.3;
    for (const fn of handlers.resize) fn();
    await new Promise((r) => setTimeout(r, 320));
    // 3.3 x 2.35 / (4/3) = 5.82, up to 2^2.75.
    assert.match(chimney().texture.label, /chimney_yellow_front_01\.svg\?r=6\.727$/);
    assert.deepEqual([chimney().width, chimney().height], [268, 887]);
    // And back.
    renderer.resolution = 1;
    for (const fn of handlers.resize) fn();
    await new Promise((r) => setTimeout(r, 320));
    assert.match(chimney().texture.label, /chimney_yellow_front_01\.svg\?r=2$/);
    view.destroy();
    assert.equal(handlers.resize.length, 0);
  });

  it('far layers: sharp copies within the street budget, the rest on their 2x files', async () => {
    const { buildStreetView } = await import('../public/js/street-render.js?v=g457-2');
    const manifest = new Set(JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8')));
    const renderer = { resolution: 3.9, gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 8192 }, generateTexture: () => null, on() {}, off() {} };
    for (const tsid of ['GA95U14319524O9', 'GHFC3I4EKMI20JD', 'GA9117J18492SRS']) {
      const s = { ...street(tsid), gradient: null, signposts: [] };
      s.layers = s.layers.map((l) => ({ ...l, filters: null }));
      const view = buildStreetView(s, globalThis.PIXI, { available: manifest, renderer });
      const midZ = s.layers.find((l) => l.id === 'middleground')?.z ?? 0;
      const farLabels = new Set(s.layers.filter((l) => (l.z ?? 0) < midZ).map((l) => l.id));
      const far = view.children.filter((c) => farLabels.has(c.label)).flatMap((lc) => lc.children || []);
      const picks = [];
      for (const l of s.layers.filter((l) => farLabels.has(l.id) && l.hidden !== true)) {
        for (const d of l.decos || []) picks.push(sharpDeco(url(manifest.has(d.sprite) ? d.sprite : d.sprite), 3.9, { far: true, bigTextures: true }));
      }
      const admitted = admitSharp(picks);
      const sharpUrls = new Set(far.map((c) => c.texture?.label).filter((l) => /\.svg\?r=|@(?!1\.5x)[\d.]+x\.webp$/.test(l || '')));
      for (const u of sharpUrls) assert.ok(admitted.has(u), `${tsid}: ${u} not admitted`);
      let cost = 0;
      for (const u of admitted) {
        const p = picks.find((x) => x?.url === u);
        cost += p.bytes - Math.round(p.w) * Math.round(p.h) * 4;
      }
      assert.ok(cost <= FAR_SHARP_BUDGET_BYTES, `${tsid}: ${cost}`);
      if (tsid === 'GA95U14319524O9') {
        const tree = far.find((c) => /background_bottletree_1(\.svg\?r=|@)/.test(c.texture?.label || ''));
        assert.ok(tree, 'Chakra Phool Herb Gardens: the far bottletree takes its sharp copy');
      }
      assert.ok(view.sharpStats().farAdmitted === admitted.size);
      view.destroy();
    }
  });
});
