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
 *  - Strokes (G273): an edge's strokeStyle drawn over the shape's fills
 *    (SWF DefineShape order) as open runs, SolidStroke weight (scaleMode
 *    normal scales with the matrix, none / horizontal / vertical do not),
 *    caps (round, none, square) and joints (round, miter, bevel), solid or
 *    gradient colour.
 *  - Bitmaps (G273): DOMBitmapInstance of a DOMBitmapItem, its pixels from
 *    the item's bin/*.dat (lossless: 0x0503 header, zlib in u16-length
 *    chunks of premultiplied ARGB; or a plain JPEG), drawn once into <defs>
 *    as a PNG / JPEG data URL and placed with <use> (decodeDat).
 *  - DOMGroup members (the group's own matrix is informational; members
 *    carry their placement in the group's parent space), DOMShape matrices.
 *  - DOMSymbolInstance: matrix, transformation point, colour multipliers
 *    and offsets (baked into the fill colours, the way Flash applies a
 *    colour transform per primitive), GlowFilter, graphic symbols with
 *    firstFrame and loop / play once / single frame, movie clips playing
 *    from the frame their span starts.
 *  - Frame labels and frame scripts (G273): a movie clip's playhead runs its
 *    own stop(), play(), gotoAndPlay(label | n) and gotoAndStop(label | n)
 *    (AS3: a goto shows the target frame on that tick, stop() holds the frame
 *    it is on), the main timeline's too; `start` puts a clip's playhead on a
 *    label first (an overlay's state: the client's mc.start(annc.state),
 *    AbstractAnnouncementOverlay.as 462-468).
 *  - Classic motion tweens (matrix through tools/avatar-compositor/xfl.mjs
 *    decomposition rules, eased per property when useSingleEaseCurve is false:
 *    position, rotation, scale and color curves; motionTweenRotate auto /
 *    none / clockwise / counter-clockwise with motionTweenRotateTimes),
 *    motion guides (G273: a layer whose parent is a guide layer moves its
 *    transformation point along the guide's stroke; round a closed guide,
 *    against the stored edge order, as rook_flock.swf does), guide layers
 *    themselves skipped (with any bitmap traced from), mask layers as SVG masks
 *    over the layers that name them as parent.
 *
 *   loadFla(file) -> { doc: { width, height, frameRate, bg }, symbols, main, bitmaps }
 *   frameCount(fla) -> main timeline length
 *   frameSvg(fla, n, { scale, box, start }) -> SVG text for 0-based frame n
 *   stateFrames(fla, symbol, label) -> { frames, loop } a state plays
 */
import zlib from 'node:zlib';
import { readZip, parseXml, customEase } from '../avatar-compositor/xfl.mjs';

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

/**
 * Open runs per stroke style (G273): Map<strokeIndex, path d>. An edge's
 * segments are joined while each starts where the last ended.
 */
export function strokePaths(edgeNodes) {
  const out = new Map();
  const last = new Map();
  for (const E of edgeNodes) {
    const st = num(E.attrs.strokeStyle);
    if (!st || !E.attrs.edges) continue;
    let d = out.get(st) || '';
    let end = last.get(st) || null;
    for (const s of parseEdges(E.attrs.edges)) {
      const k = key(s[0], s[1]);
      if (k !== end) d += `M${r2(s[0])} ${r2(s[1])}`;
      d += s.length === 4 ? `L${r2(s[2])} ${r2(s[3])}` : `Q${r2(s[2])} ${r2(s[3])} ${r2(s[4])} ${r2(s[5])}`;
      end = key(s[s.length - 2], s[s.length - 1]);
    }
    out.set(st, d);
    last.set(st, end);
  }
  return out;
}

/** A StrokeStyle: { w, fill, caps, joints, miter, scale } (XFL defaults: weight 1, round caps and joints, scaleMode normal). */
function readStroke(S) {
  const st = S.children.find((c) => /Stroke$/.test(c.tag));
  if (!st) return null;
  const fill = readFill(kid(st, 'fill'));
  if (!fill) return null;
  return {
    w: num(st.attrs.weight, 1),
    fill,
    caps: { none: 'butt', square: 'square' }[st.attrs.caps] || 'round',
    joints: { miter: 'miter', bevel: 'bevel' }[st.attrs.joints] || 'round',
    miter: num(st.attrs.miterLimit, 3),
    scale: st.attrs.scaleMode || 'normal',
  };
}

/** A guide layer's stroke segments (parent space: shape matrices applied), each kept once. */
function guideSegments(els, m = [1, 0, 0, 1, 0, 0], seen = new Set(), segs = []) {
  for (const e of els) {
    if (e.k === 'group') guideSegments(e.members, m, seen, segs);
    if (e.k !== 'shape' || !e.strokes.size) continue;
    const sm = mul(m, e.m);
    for (const d of e.strokes.values()) {
      const n = d.match(/[MLQ]|-?\d*\.?\d+(?:e-?\d+)?/g);
      let p = [0, 0];
      for (let i = 0; i < n.length;) {
        const c = n[i++];
        const take = c === 'M' || c === 'L' ? 2 : 4;
        const v = n.slice(i, i + take).map(Number);
        i += take;
        if (c === 'M') {
          p = v;
          continue;
        }
        const seg = [p, ...(c === 'L' ? [v] : [[v[0], v[1]], [v[2], v[3]]])].map((q) => apply(sm, q));
        p = c === 'L' ? v : [v[2], v[3]];
        const k = (q) => q.map((x) => x.map((y) => Math.round(y * 100)).join(',')).join(';');
        if (seen.has(k(seg)) || seen.has(k([...seg].reverse()))) continue;
        seen.add(k(seg));
        segs.push(seg);
      }
    }
  }
  return segs;
}

/**
 * A guide's segments chained into one polyline (quadratics sampled): from the
 * first segment stored, at each joint on along the unused segment that turns
 * least. A figure eight is run straight through its crossing, as Flash does
 * (rook_flock.swf's Fly3 against its FLA, G273).
 */
function guidePoints(els) {
  const segs = guideSegments(els);
  if (!segs.length) return [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const used = new Uint8Array(segs.length);
  const chain = [segs[0]];
  used[0] = 1;
  for (;;) {
    const last = chain[chain.length - 1];
    const end = last[last.length - 1];
    const heading = dir(last[last.length - 2], end);
    let best = -1;
    let bestSeg = null;
    let bestTurn = Infinity;
    segs.forEach((sg, j) => {
      if (used[j]) return;
      const cand = near(sg[0], end) ? sg : near(sg[sg.length - 1], end) ? [...sg].reverse() : null;
      if (!cand) return;
      const turn = Math.abs(wrapAngle(dir(cand[0], cand[1]) - heading));
      if (turn < bestTurn) {
        bestTurn = turn;
        best = j;
        bestSeg = cand;
      }
    });
    if (best < 0) break;
    used[best] = 1;
    chain.push(bestSeg);
  }
  const pts = [chain[0][0]];
  for (const sg of chain) {
    if (sg.length === 2) {
      pts.push(sg[1]);
      continue;
    }
    const [[x0, y0], [cx, cy], [x1, y1]] = sg;
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
  }
  return pts;
}

/** A guide path: { pts, cum (arc length at each point), len, closed }. */
function guidePath(pts) {
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { pts, cum, len, closed: Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5 };
}

/** Arc length of the point on the path nearest p. */
function nearestS(g, p) {
  let best = Infinity;
  let s = 0;
  for (let i = 1; i < g.pts.length; i++) {
    const [ax, ay] = g.pts[i - 1];
    const [bx, by] = g.pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)) : 0;
    const d = Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1]);
    if (d < best) {
      best = d;
      s = g.cum[i - 1] + (g.cum[i] - g.cum[i - 1]) * t;
    }
  }
  return s;
}

function pointAtS(g, s0) {
  let s = s0;
  if (g.closed) s = ((s % g.len) + g.len) % g.len;
  else s = Math.max(0, Math.min(g.len, s));
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < s) i++;
  const seg = g.cum[i] - g.cum[i - 1];
  const t = seg ? (s - g.cum[i - 1]) / seg : 0;
  const [ax, ay] = g.pts[i - 1];
  const [bx, by] = g.pts[i];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

// ---------------------------------------------------------------- bitmaps

/** PNG bytes of an RGBA buffer (no filters; zlib does the work). */
function pngBytes(w, h, rgba) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A JPEG's pixel size from its first SOF marker. */
function jpegSize(buf) {
  for (let p = 2; p + 9 < buf.length;) {
    if (buf[p] !== 0xff) return null;
    const mk = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return [buf.readUInt16BE(p + 7), buf.readUInt16BE(p + 5)];
    p += 2 + len;
  }
  return null;
}

/**
 * A DOMBitmapItem's bin/*.dat as { url, w, h } (a data URL and its pixel
 * size; one pixel is one stage px). Lossless: u16 0x0503, u16 row bytes, u16
 * width, u16 height, four u32 frame bounds (twips), u8 has-alpha, u8
 * compressed, then u16-length chunks (0 ends) of one zlib stream of
 * premultiplied ARGB. Anything starting FF D8 is a JPEG as it is.
 */
export function decodeDat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const [w, h] = jpegSize(buf) || [0, 0];
    return { url: `data:image/jpeg;base64,${buf.toString('base64')}`, w, h };
  }
  if (buf.readUInt16LE(0) !== 0x0503) return null;
  const w = buf.readUInt16LE(4);
  const h = buf.readUInt16LE(6);
  const alpha = buf[24] !== 0;
  const compressed = buf[25] !== 0;
  let p = 26;
  let body;
  if (compressed) {
    const parts = [];
    while (p + 2 <= buf.length) {
      const n = buf.readUInt16LE(p);
      p += 2;
      if (!n) break;
      parts.push(buf.subarray(p, p + n));
      p += n;
    }
    body = zlib.inflateSync(Buffer.concat(parts), { maxOutputLength: 64 * 2 ** 20 });
  } else body = buf.subarray(p);
  if (body.length < w * h * 4) return null;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = alpha ? body[i * 4] : 255;
    const un = (v) => (a && a < 255 ? Math.min(255, Math.round((v * 255) / a)) : v);
    rgba[i * 4] = un(body[i * 4 + 1]);
    rgba[i * 4 + 1] = un(body[i * 4 + 2]);
    rgba[i * 4 + 2] = un(body[i * 4 + 3]);
    rgba[i * 4 + 3] = a;
  }
  return { url: `data:image/png;base64,${pngBytes(w, h, rgba).toString('base64')}`, w, h };
}

function readElements(F) {
  const els = kid(F, 'elements') || kid(F, 'members');
  if (!els) return [];
  return els.children.map(readElement).filter(Boolean);
}

function readElement(E) {
  if (E.tag === 'DOMShape') {
    const fills = new Map(kids(kid(E, 'fills'), 'FillStyle').map((F) => [num(F.attrs.index), readFill(F)]));
    const strokeStyles = new Map(kids(kid(E, 'strokes'), 'StrokeStyle').map((S) => [num(S.attrs.index), readStroke(S)]));
    const edges = kids(kid(E, 'edges'), 'Edge');
    return { k: 'shape', m: readMatrix(E), fills, paths: shapePaths(edges), strokeStyles, strokes: strokeStyles.size ? strokePaths(edges) : new Map() };
  }
  if (E.tag === 'DOMGroup') return { k: 'group', members: readElements(E) };
  if (E.tag === 'DOMBitmapInstance') return { k: 'bmp', lib: E.attrs.libraryItemName, m: readMatrix(E) };
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
      // hasCustomEase: one curve for every property, or (useSingleEaseCurve
      // "false") one per target (position, rotation, scale, color, filters),
      // a property without its curve tweening linearly.
      const curves = F.attrs.hasCustomEase === 'true'
        ? new Map(kids(kid(F, 'tweens'), 'CustomEase').map((ce) => [ce.attrs.target || 'all', kids(ce, 'Point').map((p) => [num(p.attrs.x), num(p.attrs.y)])]))
        : null;
      const script = at(F, 'Actionscript', 'script')?.text || '';
      return {
        index: num(F.attrs.index),
        duration: num(F.attrs.duration, 1),
        tween: F.attrs.tweenType || null,
        accel: num(F.attrs.acceleration),
        curves,
        single: F.attrs.useSingleEaseCurve !== 'false',
        rotate: F.attrs.motionTweenRotate || 'auto',
        turns: num(F.attrs.motionTweenRotateTimes),
        label: F.attrs.name && F.attrs.labelType !== 'comment' && F.attrs.labelType !== 'anchor' ? F.attrs.name : null,
        acts: parseScript(script),
        els: readElements(F),
      };
    }),
  }));
  const frameCount = Math.max(1, ...layers.flatMap((l) => l.frames.map((f) => f.index + f.duration)));
  // Labels and frame scripts by frame index (any layer).
  const labels = new Map();
  const scripts = new Map();
  for (const l of layers) {
    for (const f of l.frames) {
      if (f.label && !labels.has(f.label)) labels.set(f.label, f.index);
      if (f.acts.length) scripts.set(f.index, [...(scripts.get(f.index) || []), ...f.acts]);
    }
  }
  return { name: tl.attrs.name, layers, frameCount, labels, scripts };
}

/**
 * The timeline calls a frame script makes on its own clip: stop(), play(),
 * gotoAndPlay / gotoAndStop with a label or a 1-based frame (bare or this.).
 * Calls on other objects (parent.stop(), mc.gotoAndPlay(..)) and include
 * lines are left alone.
 */
export function parseScript(src) {
  const acts = [];
  const code = String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const m of code.matchAll(/(^|[^\w.]|\bthis\.)(stop|play|gotoAndPlay|gotoAndStop|nextFrame|prevFrame)\s*\(\s*(?:(["'])(.*?)\3|(\d+))?\s*\)/g)) {
    acts.push({ op: m[2], label: m[4] ?? null, frame: m[5] != null ? Number(m[5]) - 1 : null });
  }
  return acts;
}

/**
 * Read an FLA. `scene` picks one of the document's scenes (a DOMTimeline
 * under <timelines> by name, G304: level_up_rays.fla keeps six, and the
 * client's Rays.as plays 'combinedSlow'); the first one by default.
 */
export function loadFla(file, { scene = null } = {}) {
  const zip = readZip(file);
  const docNode = parseXml(zip.read('DOMDocument.xml').toString('utf8'));
  const symbols = new Map();
  for (const inc of kids(kid(docNode, 'symbols'), 'Include')) {
    const buf = zip.read(`LIBRARY/${inc.attrs.href}`);
    if (!buf) continue;
    const sym = parseXml(buf.toString('utf8'));
    symbols.set(sym.attrs.name, readTimeline(at(sym, 'timeline', 'DOMTimeline')));
  }
  const scenes = kids(kid(docNode, 'timelines'), 'DOMTimeline');
  const mainNode = scene == null ? scenes[0] : scenes.find((t) => t.attrs.name === scene);
  if (!mainNode) throw new Error(`${file}: no scene ${scene}`);
  const main = readTimeline(mainNode);
  const a = docNode.attrs;
  // Bitmaps, decoded when first drawn.
  // (rook_flock's one bitmap is a photo traced from in a guide layer: guide
  // layers are never drawn, so it never reaches an overlay.)
  const bitmaps = new Map();
  for (const B of kids(kid(docNode, 'media'), 'DOMBitmapItem')) {
    const item = B.attrs;
    let px;
    bitmaps.set(item.name, {
      get px() {
        if (px === undefined) px = decodeDat(zip.read(`bin/${item.bitmapDataHRef}`) || zip.read(`LIBRARY/${item.href}`));
        return px;
      },
    });
  }
  return {
    doc: { width: num(a.width, 550), height: num(a.height, 400), frameRate: num(a.frameRate, 24), bg: a.backgroundColor || '#FFFFFF' },
    symbols,
    main,
    bitmaps,
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

const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const TAU = Math.PI * 2;
const wrapAngle = (d) => {
  let v = d;
  while (v > Math.PI) v -= TAU;
  while (v < -Math.PI) v += TAU;
  return v;
};
const decompose = (m) => ({ sx: Math.hypot(m[0], m[1]), sy: Math.hypot(m[2], m[3]), ry: Math.atan2(m[1], m[0]), rx: Math.atan2(-m[2], m[3]) });

/**
 * Eased progress of one property ('position', 'rotation', 'scale', 'color')
 * at linear progress t: the frame's custom curve for it (or its single
 * curve), linear when it has curves but none for this property, else the
 * acceleration ease (tools/avatar-compositor/xfl.mjs easeAt).
 */
export function easeProp(fr, t, prop) {
  if (fr.curves && fr.curves.size) {
    const pts = fr.curves.get(prop) || fr.curves.get('all') || (fr.single ? [...fr.curves.values()][0] : null);
    return pts ? customEase(pts, t) : t;
  }
  const e = fr.accel / 100;
  if (!e) return t;
  if (e > 0) return e * t * t + (1 - e) * t;
  const inv = 1 - t;
  return -e * (1 - inv * inv) + (1 + e) * t;
}

/**
 * Rotation change over a tween: 'auto' the short way, 'none' none (the
 * angle holds until the next keyframe), 'clockwise' / 'counter-clockwise'
 * that way round plus `turns` whole turns (y down: clockwise is +).
 */
export function rotationDelta(a0, a1, rotate = 'auto', turns = 0) {
  if (rotate === 'none') return 0;
  if (rotate === 'clockwise' || rotate === 'counter-clockwise') {
    let d = (((rotate === 'clockwise' ? a1 - a0 : a0 - a1) % TAU) + TAU) % TAU;
    if (TAU - d < 1e-6) d = 0;
    d += TAU * Math.max(0, turns);
    return rotate === 'clockwise' ? d : -d;
  }
  return wrapAngle(a1 - a0);
}

/**
 * A classic tween's instance at linear progress raw (0..1): scale, rotation
 * and skew decomposed and eased per property, the transformation point
 * moving straight (eased by position) or, under a motion guide, along the
 * guide path from the point nearest the first keyframe's to the point
 * nearest the next's.
 */
export function tweenInst(fr, e0, e1, raw, guide = null) {
  const tP = easeProp(fr, raw, 'position');
  const tS = easeProp(fr, raw, 'scale');
  const tR = easeProp(fr, raw, 'rotation');
  const tC = easeProp(fr, raw, 'color');
  const m1 = e1.m || e0.m;
  const tp1 = e1.tp || e0.tp;
  const d0 = decompose(e0.m);
  const d1 = decompose(m1);
  const sx = d0.sx + (d1.sx - d0.sx) * tS;
  const sy = d0.sy + (d1.sy - d0.sy) * tS;
  const dry = rotationDelta(d0.ry, d1.ry, fr.rotate, fr.turns);
  const drx = fr.rotate === 'none' ? 0 : dry + wrapAngle(d1.rx - d1.ry - (d0.rx - d0.ry));
  const ry = d0.ry + dry * tR;
  const rx = d0.rx + drx * tR;
  const m = [sx * Math.cos(ry), sx * Math.sin(ry), -sy * Math.sin(rx), sy * Math.cos(rx), 0, 0];
  const p0 = apply(e0.m, e0.tp);
  const p1 = apply(m1, tp1);
  const tp = [e0.tp[0] + (tp1[0] - e0.tp[0]) * tP, e0.tp[1] + (tp1[1] - e0.tp[1]) * tP];
  let p = [p0[0] + (p1[0] - p0[0]) * tP, p0[1] + (p1[1] - p0[1]) * tP];
  if (guide) {
    const s0 = nearestS(guide, p0);
    let ds = nearestS(guide, p1) - s0;
    // Round a closed guide Flash runs against the order the XFL stores its
    // edges (rook_flock.swf's Fly1 against its FLA: both legs of the loop,
    // G273); poisoned.fla's skulls orbit the same way.
    if (guide.closed && ds > 1e-6) ds -= guide.len;
    p = pointAtS(guide, s0 + ds * tP);
  }
  m[4] = p[0] - (m[0] * tp[0] + m[2] * tp[1]);
  m[5] = p[1] - (m[1] * tp[0] + m[3] * tp[1]);
  return { ...e0, m, ct: ctLerp(e0.ct, e1.ct, tC) };
}

/** A guide layer's path at frame i (cached on its keyframe). */
function guideAt(layer, i) {
  const fr = layer.frames.find((f) => i >= f.index && i < f.index + f.duration);
  if (!fr) return null;
  if (fr.guide === undefined) fr.guide = guidePath(guidePoints(fr.els));
  return fr.guide;
}

/** Elements on a layer at local frame i (0-based), tweened, with their span start. */
function layerElements(layer, i, ticks, len, guideLayer = null) {
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
  const guide = guideLayer ? guideAt(guideLayer, i) : null;
  return [{ e: tweenInst(fr, e0, e1, (i - fr.index) / fr.duration, guide), offset: i - fr.index, span: clipTicks(e0.lib) }];
}

// ---------------------------------------------------------------- playheads

const heads = new WeakMap();

function runScript(tl, h, depth = 0) {
  const acts = tl.scripts.get(h.f);
  if (!acts) return;
  for (const a of acts) {
    if (a.op === 'stop') h.playing = false;
    else if (a.op === 'play') h.playing = true;
    else if (a.op === 'nextFrame' || a.op === 'prevFrame') {
      h.playing = false;
      h.f = Math.max(0, Math.min(tl.frameCount - 1, h.f + (a.op === 'nextFrame' ? 1 : -1)));
      return;
    } else {
      const to = a.label != null ? tl.labels.get(a.label) : a.frame;
      if (to == null || to < 0 || to >= tl.frameCount) continue;
      h.playing = a.op === 'gotoAndPlay';
      if (to !== h.f && depth < 8) {
        h.f = to;
        runScript(tl, h, depth + 1);
      }
      return;
    }
  }
}

/**
 * A movie clip's (or the main timeline's) frame `ticks` ticks after it was
 * placed with its playhead on `start`: it advances a frame a tick, wraps at
 * the end, and obeys its frame scripts (G273). Without scripts it is
 * (start + ticks) % frameCount, as before.
 */
export function playhead(tl, ticks, start = 0) {
  return playState(tl, ticks, start).f;
}

function playState(tl, ticks, start = 0) {
  const n = Math.max(0, Math.floor(ticks));
  if (!tl.scripts?.size) return { f: (start + n) % tl.frameCount, playing: true };
  let byStart = heads.get(tl);
  if (!byStart) heads.set(tl, (byStart = new Map()));
  let h = byStart.get(start);
  if (!h) {
    h = { f: start, playing: true, seq: [], play: [] };
    runScript(tl, h);
    h.seq.push(h.f);
    h.play.push(h.playing);
    byStart.set(start, h);
  }
  while (h.seq.length <= n) {
    if (h.playing) {
      h.f = h.f + 1 >= tl.frameCount ? 0 : h.f + 1;
      runScript(tl, h);
    }
    h.seq.push(h.f);
    h.play.push(h.playing);
  }
  return { f: h.seq[n], playing: h.play[n] };
}

/**
 * How a state plays (G273): the clip `symbol` (or 'main') started on
 * `label`, ticked until its playhead stops (frames up to and including the
 * held one, loop false) or comes back to where it started, playing (one
 * period, loop true). { frames, loop, from } (from: the label's frame).
 */
export function stateFrames(fla, symbol, label) {
  const tl = symbol === 'main' ? fla.main : fla.symbols.get(symbol);
  if (!tl) throw new Error(`no symbol ${symbol}`);
  const from = tl.labels.get(label);
  if (from === undefined) throw new Error(`${symbol}: no label ${label}`);
  const first = playState(tl, 0, from);
  for (let t = 1; t <= tl.frameCount * 4; t++) {
    const s = playState(tl, t, from);
    if (!s.playing && playState(tl, t + 1, from).f === s.f) return { frames: t + 1, loop: false, from };
    if (s.playing && s.f === first.f) return { frames: t, loop: true, from };
  }
  return { frames: tl.frameCount, loop: true, from };
}

function childFrame(inst, offset, span, sym, start = 0) {
  const len = sym.frameCount;
  if (inst.type === 'movie clip') return playhead(sym, span, start);
  if (inst.loop === 'single frame') return Math.min(inst.first, len - 1);
  if (inst.loop === 'play once') return Math.min(inst.first + offset, len - 1);
  return (inst.first + offset) % len;
}

class Builder {
  constructor(fla, { start = null, scale = 1 } = {}) {
    this.fla = fla;
    this.defs = [];
    this.grads = new Map();
    this.bmps = new Map();
    this.n = 0;
    this.scale = scale;
    // A clip's playhead start, by symbol name: { name: label } (a state).
    this.starts = new Map();
    for (const [name, label] of Object.entries(start || {})) {
      const tl = name === 'main' ? fla.main : fla.symbols.get(name);
      const f = tl?.labels.get(label);
      if (f === undefined) throw new Error(`start: no ${name} label ${label}`);
      this.starts.set(name, f);
    }
  }

  id(p) {
    this.n += 1;
    return `${p}${this.n}`;
  }

  fillAttr(fill, m, ct, white, attr = 'fill') {
    if (white) return `${attr}="#fff"`;
    if (fill.t === 's') {
      const c = colour(fill.c, ct);
      return c.a >= 1 ? `${attr}="${c.rgb}"` : `${attr}="${c.rgb}" ${attr}-opacity="${r4(c.a)}"`;
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
    return `${attr}="url(#${id})"`;
  }

  /** Stroke attributes (G273): colour, width (scaleMode normal scales with the matrix; otherwise the width is in output px), caps, joints. */
  strokeAttr(st, ct, white) {
    const fixed = st.scale !== 'normal';
    const w = Math.max(fixed ? 1 / this.scale : 0.05, st.w) * (fixed ? this.scale : 1);
    return `${this.fillAttr(st.fill, [1, 0, 0, 1, 0, 0], ct, white, 'stroke')} stroke-width="${r4(w)}" stroke-linecap="${st.caps}" stroke-linejoin="${st.joints}"${st.joints === 'miter' ? ` stroke-miterlimit="${r4(st.miter)}"` : ''}${fixed ? ' vector-effect="non-scaling-stroke"' : ''}`;
  }

  /** A bitmap instance (G273): the pixels once in <defs>, placed by <use>; a colour transform as an feColorMatrix. */
  bitmap(e, m, ct, white) {
    const b = this.fla.bitmaps?.get(e.lib)?.px;
    if (!b) return '';
    const bm = mtx(mul(m, e.m));
    if (white) return `<rect transform="${bm}" width="${b.w}" height="${b.h}" fill="#fff"/>`;
    let id = this.bmps.get(e.lib);
    if (!id) {
      id = this.id('b');
      this.bmps.set(e.lib, id);
      this.defs.push(`<image id="${id}" width="${b.w}" height="${b.h}" preserveAspectRatio="none" href="${b.url}"/>`);
    }
    if (!ct) return `<use href="#${id}" transform="${bm}"/>`;
    const fid = this.id('f');
    const [rm, gm, bmul, am, ro, go, bo, ao] = ct;
    this.defs.push(`<filter id="${fid}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${[rm, 0, 0, 0, ro / 255, 0, gm, 0, 0, go / 255, 0, 0, bmul, 0, bo / 255, 0, 0, 0, am, ao / 255].map(r4).join(' ')}"/></filter>`);
    return `<use href="#${id}" transform="${bm}" filter="url(#${fid})"/>`;
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
      // Strokes go over the fills (SWF DefineShape: fills, then lines).
      for (const [idx, d] of e.strokes || []) {
        const st = e.strokeStyles.get(idx);
        if (!st || !d) continue;
        out += `<path fill="none" transform="${mtx(sm)}" d="${d}" ${this.strokeAttr(st, ct, white)}/>`;
      }
      return out;
    }
    if (e.k === 'bmp') return this.bitmap(e, m, ct, white);
    if (e.k === 'group') return e.members.map((x) => this.element({ e: x, offset, span }, m, ct, white)).join('');
    if (e.k === 'inst') {
      const sym = this.fla.symbols.get(e.lib);
      if (!sym) return '';
      const cct = ctMul(ct, e.ct);
      if (!white && cct && cct[3] <= 0 && cct[7] <= 0) return '';
      const cf = childFrame(e, offset, span, sym, this.starts.get(e.lib) || 0);
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

  layer(layer, i, ticks, len, m, ct, white, guide = null) {
    return layerElements(layer, i, ticks, len, guide).map((it) => this.element(it, m, ct, white)).join('');
  }

  timeline(tl, i, ticks, m, ct, white) {
    // Layers are listed top first; draw bottom first.
    let out = '';
    const L = tl.layers;
    for (let j = L.length - 1; j >= 0; j--) {
      const layer = L[j];
      if (layer.type === 'guide' || layer.type === 'folder' || layer.type === 'mask') continue;
      const parent = layer.parent != null ? L[layer.parent] : null;
      // A layer under a guide layer is guided: its tweens follow the guide's stroke (G273).
      const guide = parent && parent.type === 'guide' ? parent : null;
      const body = this.layer(layer, i, ticks, tl.frameCount, m, ct, white, guide);
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
 * SVG for main-timeline tick n (0-based: the main timeline's playhead, frame
 * scripts obeyed). box = [x, y, w, h] in stage px (default the stage); scale
 * multiplies the output size; start = { symbol: label } puts those clips'
 * playheads on a label (an overlay state, G273).
 */
export function frameSvg(fla, n, { scale = 1, box = null, start = null } = {}) {
  const [bx, by, bw, bh] = box || [0, 0, fla.doc.width, fla.doc.height];
  const b = new Builder(fla, { start, scale });
  const body = b.timeline(fla.main, playhead(fla.main, n, b.starts.get('main') || 0), n, [1, 0, 0, 1, 0, 0], null, false);
  const W = Math.ceil(bw * scale);
  const H = Math.ceil(bh * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${r4(bx)} ${r4(by)} ${r4(bw)} ${r4(bh)}"><defs>${b.defs.join('')}</defs>${body}</svg>`;
}
