/**
 * XFL (.fla, CS5.5) timelines to SVG frames, for Tiny Speck's CC0 overlay
 * sources in glitch-overlays/ that only survive as authoring files
 * (fireworks_1/2/3.fla, play_glitch.fla). Pure Node: no Flash, no
 * ActionScript; the FLA is untrusted data that is only inflated and parsed.
 *
 * What it reads (all the overlay files use):
 *  - DOMShape edges (twips; "!" move, "|" "/" line, "[" "]" quadratic,
 *    "S<n>" selection marks skipped, "#hex.frac" two's-complement numbers) with
 *    fillStyle0 / fillStyle1 assembled into closed loops per fill;
 *    SolidColor, LinearGradient and RadialGradient fills (Flash gradient
 *    square -819.2..819.2 px under the fill matrix, pad spread).
 *  - DOMGroup members (the group's own matrix is informational; members
 *    carry their placement in the group's parent space), DOMShape matrices.
 *  - DOMSymbolInstance: matrix, transformation point, colour multipliers
 *    and offsets (baked into the fill colours, the way Flash applies a
 *    colour transform per primitive), GlowFilter, graphic symbols with
 *    firstFrame and loop / play once / single frame, movie clips playing
 *    from the frame their span starts.
 *  - Classic motion tweens (matrix through tools/avatar-compositor/xfl.mjs
 *    tweenElement + easeAt, colour transform linear), guide layers skipped,
 *    mask layers as SVG masks over the layers that name them as parent.
 *
 *   loadFla(file) -> { doc: { width, height, frameRate, bg }, symbols, main }
 *   frameCount(fla) -> main timeline length
 *   frameSvg(fla, n, { scale, box }) -> SVG text for 0-based frame n
 */
import { readZip, parseXml, easeAt, tweenElement } from '../avatar-compositor/xfl.mjs';

const kids = (n, tag) => (n ? n.children.filter((c) => c.tag === tag) : []);
const kid = (n, tag) => (n ? n.children.find((c) => c.tag === tag) : undefined);
const at = (n, ...tags) => tags.reduce((x, t) => kid(x, t), n);
const num = (v, d = 0) => (v === undefined || v === '' ? d : Number(v));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** Outline points: 1/100 px in the shape's own space is plenty and halves the text. */
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- parsing

function readMatrix(node) {
  const M = at(node, 'matrix', 'Matrix');
  return M ? [num(M.attrs.a, 1), num(M.attrs.b), num(M.attrs.c), num(M.attrs.d, 1), num(M.attrs.tx), num(M.attrs.ty)] : [1, 0, 0, 1, 0, 0];
}

/** Colour transform [rm, gm, bm, am, ro, go, bo, ao] (offsets 0..255). */
function readColor(node) {
  const C = at(node, 'color', 'Color');
  if (!C) return null;
  const a = C.attrs;
  const ct = [num(a.redMultiplier, 1), num(a.greenMultiplier, 1), num(a.blueMultiplier, 1), num(a.alphaMultiplier, 1), num(a.redOffset), num(a.greenOffset), num(a.blueOffset), num(a.alphaOffset)];
  if (a.tintMultiplier !== undefined) {
    const t = num(a.tintMultiplier);
    const [r, g, b] = hexRgb(a.tintColor || '#000000');
    return [1 - t, 1 - t, 1 - t, ct[3], r * t, g * t, b * t, ct[7]];
  }
  if (a.brightness !== undefined) {
    const v = num(a.brightness);
    return v < 0 ? [1 + v, 1 + v, 1 + v, ct[3], 0, 0, 0, ct[7]] : [1 - v, 1 - v, 1 - v, ct[3], 255 * v, 255 * v, 255 * v, ct[7]];
  }
  return ct;
}

const hexRgb = (h) => {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

function readFill(F) {
  const solid = kid(F, 'SolidColor');
  if (solid) return { t: 's', c: [...hexRgb(solid.attrs.color || '#000000'), num(solid.attrs.alpha, 1)] };
  const lin = kid(F, 'LinearGradient');
  const rad = kid(F, 'RadialGradient');
  const g = lin || rad;
  if (g) {
    return {
      t: lin ? 'l' : 'r',
      m: readMatrix(g),
      fx: num(g.attrs.focalPointRatio),
      st: kids(g, 'GradientEntry').map((e) => [num(e.attrs.ratio), ...hexRgb(e.attrs.color || '#000000'), num(e.attrs.alpha, 1)]),
    };
  }
  return null;
}

/** "#hex.frac" (24-bit two's complement, fraction /256) or decimal, in twips. */
function edgeNum(s) {
  if (s[0] === '#') {
    const [h, f = '0'] = s.slice(1).split('.');
    // Leading zeros are dropped; negatives are 24-bit two's complement
    // written in full ("#FFFFDC" is -36, "#5F5" is 1525).
    let v = parseInt(h, 16);
    const bits = h.length > 6 ? 32 : 24;
    if (h.length >= 6 && v >= 2 ** (bits - 1)) v -= 2 ** bits;
    return v + parseInt(f, 16) / 256;
  }
  return Number(s);
}

/** An edges string as segments [x0, y0, x1, y1] or [x0, y0, cx, cy, x1, y1] in px. */
export function parseEdges(str) {
  const segs = [];
  const tok = String(str).match(/[!|/[\]]|S\d+|#-?[0-9A-Fa-f]+(?:\.[0-9A-Fa-f]+)?|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  let px = 0;
  let py = 0;
  const next = () => {
    while (i < tok.length && tok[i][0] === 'S') i++;
    return edgeNum(tok[i++]) / 20;
  };
  while (i < tok.length) {
    const t = tok[i++];
    if (t[0] === 'S') continue;
    if (t === '!') { px = next(); py = next(); }
    else if (t === '|' || t === '/') { const x = next(); const y = next(); segs.push([px, py, x, y]); px = x; py = y; }
    else if (t === '[' || t === ']') { const cx = next(); const cy = next(); const x = next(); const y = next(); segs.push([px, py, cx, cy, x, y]); px = x; py = y; }
  }
  return segs;
}

const reverseSeg = (s) => (s.length === 4 ? [s[2], s[3], s[0], s[1]] : [s[4], s[5], s[2], s[3], s[0], s[1]]);
const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/** Closed loops per fill index: Map<fillIndex, path d>. */
export function shapePaths(edgeNodes) {
  const byFill = new Map();
  for (const E of edgeNodes) {
    if (!E.attrs.edges) continue;
    const f0 = num(E.attrs.fillStyle0);
    const f1 = num(E.attrs.fillStyle1);
    if (!f0 && !f1) continue;
    for (const s of parseEdges(E.attrs.edges)) {
      if (f0) (byFill.get(f0) || byFill.set(f0, []).get(f0)).push(s);
      if (f1) (byFill.get(f1) || byFill.set(f1, []).get(f1)).push(reverseSeg(s));
    }
  }
  const out = new Map();
  for (const [fill, segs] of byFill) {
    const starts = new Map();
    segs.forEach((s, j) => {
      const k = key(s[0], s[1]);
      (starts.get(k) || starts.set(k, []).get(k)).push(j);
    });
    const used = new Uint8Array(segs.length);
    let d = '';
    for (let j0 = 0; j0 < segs.length; j0++) {
      if (used[j0]) continue;
      let j = j0;
      const first = segs[j];
      d += `M${r2(first[0])} ${r2(first[1])}`;
      const startKey = key(first[0], first[1]);
      for (;;) {
        used[j] = 1;
        const s = segs[j];
        d += s.length === 4 ? `L${r2(s[2])} ${r2(s[3])}` : `Q${r2(s[2])} ${r2(s[3])} ${r2(s[4])} ${r2(s[5])}`;
        const endKey = key(s[s.length - 2], s[s.length - 1]);
        if (endKey === startKey) break;
        const nextJ = (starts.get(endKey) || []).find((k) => !used[k]);
        if (nextJ === undefined) break;
        j = nextJ;
      }
      d += 'Z';
    }
    out.set(fill, d);
  }
  return out;
}

function readElements(F) {
  const els = kid(F, 'elements') || kid(F, 'members');
  if (!els) return [];
  return els.children.map(readElement).filter(Boolean);
}

function readElement(E) {
  if (E.tag === 'DOMShape') {
    const fills = new Map(kids(kid(E, 'fills'), 'FillStyle').map((F) => [num(F.attrs.index), readFill(F)]));
    return { k: 'shape', m: readMatrix(E), fills, paths: shapePaths(kids(kid(E, 'edges'), 'Edge')) };
  }
  if (E.tag === 'DOMGroup') return { k: 'group', members: readElements(E) };
  if (E.tag === 'DOMSymbolInstance') {
    const P = at(E, 'transformationPoint', 'Point');
    const glow = kids(kid(E, 'filters'), 'GlowFilter').map((g) => ({
      bx: num(g.attrs.blurX, 5), by: num(g.attrs.blurY, 5), c: hexRgb(g.attrs.color || '#FF0000'),
      a: num(g.attrs.alpha, 1), s: num(g.attrs.strength, 1), inner: g.attrs.inner === 'true', knockout: g.attrs.knockout === 'true',
    }));
    return {
      k: 'inst',
      lib: E.attrs.libraryItemName,
      type: E.attrs.symbolType || 'movie clip',
      loop: E.attrs.loop || 'loop',
      first: num(E.attrs.firstFrame),
      m: readMatrix(E),
      tp: P ? [num(P.attrs.x), num(P.attrs.y)] : [0, 0],
      ct: readColor(E),
      glow,
    };
  }
  return null;
}

function readTimeline(tl) {
  const layers = kids(kid(tl, 'layers'), 'DOMLayer').map((L, i) => ({
    i,
    name: L.attrs.name,
    type: L.attrs.layerType || 'normal',
    parent: L.attrs.parentLayerIndex !== undefined ? Number(L.attrs.parentLayerIndex) : null,
    visible: L.attrs.visible !== 'false',
    frames: kids(kid(L, 'frames'), 'DOMFrame').map((F) => {
      const ce = at(F, 'tweens', 'CustomEase');
      return {
        index: num(F.attrs.index),
        duration: num(F.attrs.duration, 1),
        tween: F.attrs.tweenType || null,
        accel: num(F.attrs.acceleration),
        custom: F.attrs.hasCustomEase === 'true' && ce ? kids(ce, 'Point').map((p) => [num(p.attrs.x), num(p.attrs.y)]) : null,
        els: readElements(F),
      };
    }),
  }));
  const frameCount = Math.max(1, ...layers.flatMap((l) => l.frames.map((f) => f.index + f.duration)));
  return { name: tl.attrs.name, layers, frameCount };
}

export function loadFla(file) {
  const zip = readZip(file);
  const docNode = parseXml(zip.read('DOMDocument.xml').toString('utf8'));
  const symbols = new Map();
  for (const inc of kids(kid(docNode, 'symbols'), 'Include')) {
    const buf = zip.read(`LIBRARY/${inc.attrs.href}`);
    if (!buf) continue;
    const sym = parseXml(buf.toString('utf8'));
    symbols.set(sym.attrs.name, readTimeline(at(sym, 'timeline', 'DOMTimeline')));
  }
  const main = readTimeline(at(docNode, 'timelines', 'DOMTimeline'));
  const a = docNode.attrs;
  return {
    doc: { width: num(a.width, 550), height: num(a.height, 400), frameRate: num(a.frameRate, 24), bg: a.backgroundColor || '#FFFFFF' },
    symbols,
    main,
  };
}

/**
 * How many frames the overlay plays: the main timeline, or, when that is a
 * single frame holding movie clips (play_glitch: one frame, the 744-frame
 * "all" clip), the longest of those clips.
 */
export function frameCount(fla) {
  if (fla.main.frameCount > 1) return fla.main.frameCount;
  let n = 1;
  for (const L of fla.main.layers) {
    for (const f of L.frames) {
      for (const e of f.els) if (e.k === 'inst' && e.type === 'movie clip') n = Math.max(n, fla.symbols.get(e.lib)?.frameCount || 1);
    }
  }
  return n;
}

// ---------------------------------------------------------------- frames

const mul = (p, q) => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
/** Colour transform composition: parent applied after child. */
const ctMul = (p, c) => {
  if (!c) return p;
  if (!p) return c;
  return [p[0] * c[0], p[1] * c[1], p[2] * c[2], p[3] * c[3], p[0] * c[4] + p[4], p[1] * c[5] + p[5], p[2] * c[6] + p[6], p[3] * c[7] + p[7]];
};
const ctLerp = (a, b, t) => {
  if (!a && !b) return null;
  const A = a || [1, 1, 1, 1, 0, 0, 0, 0];
  const B = b || [1, 1, 1, 1, 0, 0, 0, 0];
  return A.map((v, i) => v + (B[i] - v) * t);
};
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
function colour(c, ct) {
  let [r, g, b, a] = c;
  if (ct) {
    r = r * ct[0] + ct[4];
    g = g * ct[1] + ct[5];
    b = b * ct[2] + ct[6];
    a = a * ct[3] + ct[7] / 255;
  }
  return { rgb: `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`, a: Math.max(0, Math.min(1, a)) };
}
const mtx = (m) => `matrix(${m.map(r4).join(' ')})`;

/** Elements on a layer at local frame i (0-based), tweened, with their span start. */
function layerElements(layer, i, ticks, len) {
  const k = layer.frames.findIndex((f) => i >= f.index && i < f.index + f.duration);
  if (k < 0) return [];
  const fr = layer.frames[k];
  // Span start for movie clips: the first of the consecutive keyframes holding the same symbol.
  const spanStart = (lib) => {
    let s = fr.index;
    for (let j = k - 1; j >= 0; j--) {
      const f = layer.frames[j];
      if (f.index + f.duration !== s || !f.els.some((e) => e.k === 'inst' && e.lib === lib)) break;
      s = f.index;
    }
    return s;
  };
  // A clip whose span runs from frame 0 to the end never restarts when its parent loops.
  const spanEnd = (lib) => {
    let e = fr.index + fr.duration;
    for (let j = k + 1; j < layer.frames.length; j++) {
      const f = layer.frames[j];
      if (f.index !== e || !f.els.some((x) => x.k === 'inst' && x.lib === lib)) break;
      e = f.index + f.duration;
    }
    return e;
  };
  const clipTicks = (lib) => {
    const s0 = spanStart(lib);
    return s0 === 0 && spanEnd(lib) >= len ? ticks : i - s0;
  };
  const next = layer.frames[k + 1];
  const tweening = i !== fr.index && fr.tween === 'motion' && next && fr.els.length === 1 && fr.els[0].k === 'inst' && next.els.length;
  if (!tweening) return fr.els.map((e) => ({ e, offset: i - fr.index, span: e.k === 'inst' ? clipTicks(e.lib) : 0 }));
  const e0 = fr.els[0];
  const e1 = next.els.find((e) => e.k === 'inst' && e.lib === e0.lib) || next.els[0];
  const t = easeAt(fr, (i - fr.index) / fr.duration);
  const { m } = tweenElement({ m: e0.m, tp: e0.tp, alpha: 1 }, { m: e1.m || e0.m, tp: e1.tp || e0.tp, alpha: 1 }, t);
  return [{ e: { ...e0, m, ct: ctLerp(e0.ct, e1.ct, t) }, offset: i - fr.index, span: clipTicks(e0.lib) }];
}

function childFrame(inst, offset, span, len) {
  if (inst.type === 'movie clip') return span % len;
  if (inst.loop === 'single frame') return Math.min(inst.first, len - 1);
  if (inst.loop === 'play once') return Math.min(inst.first + offset, len - 1);
  return (inst.first + offset) % len;
}

class Builder {
  constructor(fla) {
    this.fla = fla;
    this.defs = [];
    this.grads = new Map();
    this.n = 0;
  }

  id(p) {
    this.n += 1;
    return `${p}${this.n}`;
  }

  fillAttr(fill, m, ct, white) {
    if (white) return 'fill="#fff"';
    if (fill.t === 's') {
      const c = colour(fill.c, ct);
      return c.a >= 1 ? `fill="${c.rgb}"` : `fill="${c.rgb}" fill-opacity="${r4(c.a)}"`;
    }
    const stops = fill.st.map(([o, r, g, b, a]) => {
      const c = colour([r, g, b, a], ct);
      return `<stop offset="${r4(o)}" stop-color="${c.rgb}"${c.a < 1 ? ` stop-opacity="${r4(c.a)}"` : ''}/>`;
    }).join('');
    const gm = mtx(mul(m, fill.m));
    const body = fill.t === 'l'
      ? `linearGradient gradientUnits="userSpaceOnUse" x1="-819.2" y1="0" x2="819.2" y2="0" gradientTransform="${gm}">${stops}</linearGradient>`
      : `radialGradient gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" fx="${r4(fill.fx * 819.2)}" fy="0" gradientTransform="${gm}">${stops}</radialGradient>`;
    // Instances of one symbol share their gradients (they live in the shape's own space).
    let id = this.grads.get(body);
    if (!id) {
      id = this.id('g');
      this.grads.set(body, id);
      this.defs.push(`<${body.replace(/^(\w+)/, `$1 id="${id}"`)}`);
    }
    return `fill="url(#${id})"`;
  }

  element(item, m, ct, white) {
    const { e, offset, span } = item;
    if (e.k === 'shape') {
      const sm = mul(m, e.m);
      let out = '';
      for (const [idx, d] of e.paths) {
        const fill = e.fills.get(idx);
        if (!fill) continue;
        // The gradient matrix lives in the shape's own space, as the edges do.
        out += `<path fill-rule="evenodd" transform="${mtx(sm)}" d="${d}" ${this.fillAttr(fill, [1, 0, 0, 1, 0, 0], ct, white)}/>`;
      }
      return out;
    }
    if (e.k === 'group') return e.members.map((x) => this.element({ e: x, offset, span }, m, ct, white)).join('');
    if (e.k === 'inst') {
      const sym = this.fla.symbols.get(e.lib);
      if (!sym) return '';
      const cct = ctMul(ct, e.ct);
      if (!white && cct && cct[3] <= 0 && cct[7] <= 0) return '';
      const cf = childFrame(e, offset, span, sym.frameCount);
      const inner = this.timeline(sym, cf, e.type === 'movie clip' ? span : cf, mul(m, e.m), cct, white);
      if (!e.glow.length || white || !inner) return inner;
      const fid = this.id('f');
      const g = e.glow[0];
      const sd = Math.max(0.5, (g.bx + g.by) / 2 / 2.5);
      this.defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${r4(sd)}" result="b"/><feComponentTransfer in="b" result="b2"><feFuncA type="linear" slope="${r4(g.s * g.a)}"/></feComponentTransfer><feFlood flood-color="rgb(${g.c.join(',')})" result="c"/><feComposite in="c" in2="b2" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
      return `<g filter="url(#${fid})">${inner}</g>`;
    }
    return '';
  }

  layer(layer, i, ticks, len, m, ct, white) {
    return layerElements(layer, i, ticks, len).map((it) => this.element(it, m, ct, white)).join('');
  }

  timeline(tl, i, ticks, m, ct, white) {
    // Layers are listed top first; draw bottom first.
    let out = '';
    const L = tl.layers;
    for (let j = L.length - 1; j >= 0; j--) {
      const layer = L[j];
      if (layer.type === 'guide' || layer.type === 'folder' || layer.type === 'mask') continue;
      const parent = layer.parent != null ? L[layer.parent] : null;
      if (parent && parent.type === 'guide') continue;
      const body = this.layer(layer, i, ticks, tl.frameCount, m, ct, white);
      if (!body) continue;
      if (parent && parent.type === 'mask') {
        const mid = this.id('m');
        this.defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">${this.layer(parent, i, ticks, tl.frameCount, m, null, true)}</mask>`);
        out += `<g mask="url(#${mid})">${body}</g>`;
      } else out += body;
    }
    return out;
  }
}

/**
 * SVG for main-timeline frame n (0-based). box = [x, y, w, h] in stage px
 * (default the stage); scale multiplies the output size.
 */
export function frameSvg(fla, n, { scale = 1, box = null } = {}) {
  const [bx, by, bw, bh] = box || [0, 0, fla.doc.width, fla.doc.height];
  const b = new Builder(fla);
  const body = b.timeline(fla.main, n % fla.main.frameCount, n, [1, 0, 0, 1, 0, 0], null, false);
  const W = Math.ceil(bw * scale);
  const H = Math.ceil(bh * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${r4(bx)} ${r4(by)} ${r4(bw)} ${r4(bh)}"><defs>${b.defs.join('')}</defs>${body}</svg>`;
}
