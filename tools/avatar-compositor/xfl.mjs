/**
 * Containers the public Avatar.swf (May 2011) lacks, recovered from Tiny
 * Speck's later authoring file glitch-avatars/base_avatar/Avatar2011.fla
 * (CS5.5 XFL, avatarContainer last saved Sept 2012, CC0).
 *
 * An XFL .fla is a zip of XML: LIBRARY/~containers/avatarContainer.xml is
 * the avatar timeline as layers of keyframes with classic motion tweens.
 * This reads the zip and the XML (no ActionScript, no Flash), evaluates the
 * tweens the way the Flash compiler bakes them, and checks the result
 * against the compiled Avatar.swf: every container the two share must land
 * on the SWF's matrix at every sheet frame before any new container is
 * trusted (validateAgainstSwf).
 *
 * Tween rules (checked against Avatar.swf, keyframes exact, in-betweens
 * within a quarter pixel):
 *  - a keyframe's matrix is decomposed into scaleX/scaleY/skewX/skewY and
 *    the transformation point's position; each interpolates linearly, the
 *    angles the short way round;
 *  - XFL acceleration a (-100..100): a > 0 eases in (t' = a t^2 + (1-a) t),
 *    a < 0 eases out; a CustomEase (cubic Bezier points) replaces it.
 *
 * The FLA is untrusted data: this only inflates and tokenises it.
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { displayListAt } from './swf.mjs';

// ---------------------------------------------------------------------------
// zip (central directory entries found by signature; Avatar2011.fla's
// end-of-central-directory record is 54 bytes off)
// ---------------------------------------------------------------------------

export function readZip(file) {
  const buf = readFileSync(file);
  const entries = new Map();
  for (let p = buf.length - 22; p >= 0; p--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) continue;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (nameLen + extraLen + commentLen > 4096 || local >= buf.length) continue;
    entries.set(name, { method, csize, local });
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error(`zip: bad local header for ${name}`);
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const data = buf.subarray(start, start + e.csize);
    if (e.method === 0) return Buffer.from(data);
    if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 64 * 2 ** 20 });
    throw new Error(`zip: method ${e.method} for ${name}`);
  };
  return { names: [...entries.keys()], read };
}

// ---------------------------------------------------------------------------
// XML (XFL is attribute-only, machine-written)
// ---------------------------------------------------------------------------

const ENTITIES = { quot: '"', lt: '<', gt: '>', apos: "'", amp: '&' };

/**
 * Attributes may be single-quoted (a DOMTimeline's `guides='<guidelines>..'`
 * in poisoned.fla / rooked.fla, G273). A CDATA section's text is kept on the
 * open node as `text` (frame scripts: <Actionscript><script><![CDATA[stop();]]>).
 */
export function parseXml(src) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) {
      const open = stack[stack.length - 1];
      open.text = (open.text || '') + m[5];
      continue;
    }
    if (!m[2]) continue;
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = (a[2] ?? a[3]).replace(/&(quot|lt|gt|apos|amp);/g, (_, e) => ENTITIES[e]);
    const node = { tag: m[2], attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children[0];
}
const kids = (n, tag) => (n ? n.children.filter((c) => c.tag === tag) : []);
const kid = (n, tag) => (n ? n.children.find((c) => c.tag === tag) : undefined);
const at = (n, ...tags) => tags.reduce((x, t) => kid(x, t), n);
const num = (v, d = 0) => (v === undefined || v === '' ? d : Number(v));

// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------

/**
 * A DOMSymbolItem's timeline: { name, layers: [{ name, type, parent,
 * frames: [{ index, duration, tween, accel, custom, els }] }], frameCount }.
 * Layers are top (drawn last) first, as in the XFL.
 */
export function readSymbol(xml) {
  const doc = parseXml(xml);
  const tl = at(doc, 'timeline', 'DOMTimeline');
  const layers = kids(kid(tl, 'layers'), 'DOMLayer').map((L, i) => ({
    i,
    name: L.attrs.name,
    type: L.attrs.layerType || 'normal',
    parent: L.attrs.parentLayerIndex !== undefined ? Number(L.attrs.parentLayerIndex) : null,
    frames: kids(kid(L, 'frames'), 'DOMFrame').map((F) => {
      const els = kids(kid(F, 'elements'), 'DOMSymbolInstance').map((E) => {
        const M = at(E, 'matrix', 'Matrix');
        const P = at(E, 'transformationPoint', 'Point');
        const C = at(E, 'color', 'Color');
        return {
          lib: E.attrs.libraryItemName,
          name: E.attrs.name,
          m: M ? [num(M.attrs.a, 1), num(M.attrs.b), num(M.attrs.c), num(M.attrs.d, 1), num(M.attrs.tx), num(M.attrs.ty)] : [1, 0, 0, 1, 0, 0],
          tp: P ? [num(P.attrs.x), num(P.attrs.y)] : [0, 0],
          alpha: C ? num(C.attrs.alphaMultiplier, 1) : 1,
        };
      });
      const ce = at(F, 'tweens', 'CustomEase');
      return {
        index: num(F.attrs.index),
        duration: num(F.attrs.duration, 1),
        tween: F.attrs.tweenType || null,
        accel: num(F.attrs.acceleration),
        custom: F.attrs.hasCustomEase === 'true' && ce ? kids(ce, 'Point').map((p) => [num(p.attrs.x), num(p.attrs.y)]) : null,
        els,
      };
    }),
  }));
  const frameCount = Math.max(0, ...layers.flatMap((l) => l.frames.map((f) => f.index + f.duration)));
  return { name: doc.attrs.name, layers, frameCount };
}

const bez = (p0, p1, p2, p3, s) => {
  const u = 1 - s;
  return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3;
};

/** CustomEase points (p0 c c p1 c c p2 ...) evaluated at x = t. */
export function customEase(pts, t) {
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    if (t > d[0] && i + 6 < pts.length) continue;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (bez(a[0], b[0], c[0], d[0], mid) < t) lo = mid; else hi = mid;
    }
    return bez(a[1], b[1], c[1], d[1], (lo + hi) / 2);
  }
  return t;
}

/** Eased tween progress for a keyframe at linear progress t. */
export function easeAt(frame, t) {
  if (frame.custom) return customEase(frame.custom, t);
  const e = frame.accel / 100;
  if (!e) return t;
  if (e > 0) return e * t * t + (1 - e) * t;
  const inv = 1 - t;
  return -e * (1 - inv * inv) + (1 + e) * t;
}

const wrapAngle = (d) => {
  let v = d;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v < -Math.PI) v += 2 * Math.PI;
  return v;
};
const decompose = (m) => ({ sx: Math.hypot(m[0], m[1]), sy: Math.hypot(m[2], m[3]), ry: Math.atan2(m[1], m[0]), rx: Math.atan2(-m[2], m[3]) });
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** Classic tween between two keyframe elements at eased progress t. */
export function tweenElement(e0, e1, t) {
  const d0 = decompose(e0.m);
  const d1 = decompose(e1.m);
  const sx = d0.sx + (d1.sx - d0.sx) * t;
  const sy = d0.sy + (d1.sy - d0.sy) * t;
  const ry = d0.ry + wrapAngle(d1.ry - d0.ry) * t;
  const rx = d0.rx + wrapAngle(d1.rx - d0.rx) * t;
  const m = [sx * Math.cos(ry), sx * Math.sin(ry), -sy * Math.sin(rx), sy * Math.cos(rx), 0, 0];
  const p0 = apply(e0.m, e0.tp);
  const p1 = apply(e1.m, e1.tp);
  const tp = [e0.tp[0] + (e1.tp[0] - e0.tp[0]) * t, e0.tp[1] + (e1.tp[1] - e0.tp[1]) * t];
  const p = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
  m[4] = p[0] - (m[0] * tp[0] + m[2] * tp[1]);
  m[5] = p[1] - (m[1] * tp[0] + m[3] * tp[1]);
  return { m, alpha: e0.alpha + (e1.alpha - e0.alpha) * t };
}

/** Twips, as the compiler stores a placement's translation. */
const twips = (v) => Math.round(v * 20) / 20;

/** Instances on a layer at 1-based frame n: [{ name, lib, m, alpha }]. */
export function layerAt(layer, n) {
  const i = n - 1;
  const k = layer.frames.findIndex((f) => i >= f.index && i < f.index + f.duration);
  if (k < 0) return [];
  const fr = layer.frames[k];
  const next = layer.frames[k + 1];
  if (i === fr.index || fr.tween !== 'motion' || !next || fr.els.length !== 1 || !next.els.length) {
    return fr.els.map((e) => ({ name: e.name, lib: e.lib, m: e.m, alpha: e.alpha }));
  }
  const e0 = fr.els[0];
  const e1 = next.els.find((e) => e.lib === e0.lib) || next.els[0];
  const { m, alpha } = tweenElement(e0, e1, easeAt(fr, (i - fr.index) / fr.duration));
  m[4] = twips(m[4]);
  m[5] = twips(m[5]);
  return [{ name: e0.name, lib: e0.lib, m, alpha }];
}

/** Normal layers in draw order (bottom first), with the instance names they hold. */
export function drawOrder(symbol) {
  return symbol.layers
    .filter((l) => l.type === 'normal')
    .map((l) => ({ layer: l, names: [...new Set(l.frames.flatMap((f) => f.els.map((e) => e.name)).filter(Boolean))] }))
    .reverse();
}

/** avatarContainer from an XFL .fla. */
export function readAvatarFla(file, symbolPath = 'LIBRARY/~containers/avatarContainer.xml') {
  const zip = readZip(file);
  const xml = zip.read(symbolPath);
  if (!xml) throw new Error(`${file}: no ${symbolPath} (not an XFL avatar FLA?)`);
  return readSymbol(xml.toString('utf8'));
}

// ---------------------------------------------------------------------------
// merge into the compiled SWF timeline
// ---------------------------------------------------------------------------

/**
 * Compare every container the FLA and the SWF root share at the given
 * frames. Returns { compared, maxPx, maxM, alphaMismatches, worst }: maxPx
 * is the largest translation error (px), maxM the largest linear-part error.
 */
export function validateAgainstSwf(symbol, swfRoot, frames) {
  let maxPx = 0;
  let maxM = 0;
  let compared = 0;
  let alphaMismatches = 0;
  let worst = null;
  const layers = symbol.layers.filter((l) => l.type === 'normal');
  for (const n of frames) {
    const byName = new Map([...displayListAt(swfRoot, n).values()].filter((p) => p.name).map((p) => [p.name, p]));
    for (const L of layers) {
      for (const e of layerAt(L, n)) {
        const p = byName.get(e.name);
        if (!p) continue;
        compared += 1;
        const px = Math.max(Math.abs(p.matrix[4] - e.m[4]), Math.abs(p.matrix[5] - e.m[5]));
        const dm = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(p.matrix[j] - e.m[j])));
        if (px > maxPx) { maxPx = px; worst = { frame: n, name: e.name }; }
        maxM = Math.max(maxM, dm);
        const a = p.cxform ? p.cxform.m[3] : 1;
        if ((a > 0) !== (e.alpha > 0)) alphaMismatches += 1;
      }
    }
  }
  return { compared, maxPx, maxM, alphaMismatches, worst };
}

/**
 * Add `names` (containers the SWF lacks) to a copy of the SWF root
 * timeline: each becomes a placement of an empty sprite at a depth between
 * its FLA layer neighbours that the SWF has, with the FLA's per-frame
 * matrix and alpha. buildRig then flattens it like any other container.
 * Returns { timeline, emptyId, depths: { name: depth } }.
 */
export function mergeContainers(swf, rootId, symbol, names) {
  const root = swf.sprites.get(rootId);
  const want = new Set(names);
  // SWF depth of each top-level instance name.
  const swfDepth = new Map();
  for (const fr of root.frames) for (const op of fr) if (op.op === 'place' && op.name && !swfDepth.has(op.name)) swfDepth.set(op.name, op.depth);
  const order = drawOrder(symbol);
  const shared = order.map(({ names: ns }) => ns.map((x) => swfDepth.get(x)).find((x) => x !== undefined));
  // A new layer goes just above every shared layer the FLA draws under it
  // (the 2012 file reorders a few layers inside a limb; the SWF's own
  // order is kept for those), and must still be under every shared layer
  // the FLA draws over it.
  // Layers with no shared layer over them (the FLA's topItems) go over
  // everything, including SWF-only containers such as the ring.
  const depths = {};
  const layers = new Map();
  const top = Math.max(...swfDepth.values());
  let below = 0;
  let step = 0;
  order.forEach(({ layer, names: ns }, k) => {
    if (shared[k] !== undefined) {
      if (shared[k] > below) { below = shared[k]; step = 0; }
      return;
    }
    for (const name of ns) {
      if (!want.has(name)) continue;
      const over = shared.slice(k + 1).filter((d) => d !== undefined);
      if (!over.length && below < top) { below = top; step = 0; }
      step += 1;
      const depth = below + step / 100;
      if (over.length && Math.min(...over) < depth) throw new Error(`${name}: no depth fits between its FLA neighbours`);
      depths[name] = depth;
      layers.set(name, layer);
    }
  });
  const missing = names.filter((x) => !(x in depths));
  if (missing.length) throw new Error(`not in the FLA: ${missing.join(', ')}`);
  const emptyId = Math.max(...swf.kinds.keys(), ...swf.sprites.keys()) + 1;
  swf.sprites.set(emptyId, { frames: [[]], labels: [], frameCount: 1 });
  swf.kinds.set(emptyId, 'sprite');
  const frames = root.frames.map((ops, f) => {
    const out = ops.slice();
    for (const [name, layer] of layers) {
      const here = layerAt(layer, f + 1).find((e) => e.name === name);
      const depth = depths[name];
      if (!here) { out.push({ op: 'remove', depth }); continue; }
      out.push({
        op: 'place', depth, id: emptyId, name, move: false,
        matrix: here.m,
        cxform: { m: [1, 1, 1, here.alpha], o: [0, 0, 0, 0] },
      });
    }
    return out;
  });
  const timeline = { ...root, frames };
  return { timeline, emptyId, depths };
}
