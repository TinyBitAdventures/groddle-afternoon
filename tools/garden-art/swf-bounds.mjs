/**
 * Where each exported symbol of a SWF sits around its registration point.
 *
 * FFDec's sprite PNG export crops every symbol to its bounds, so the PNG alone
 * loses the symbol's origin. The garden client (glitch-client
 * view/ui/garden/GardenView.as, GardenPlotView.as) adds the bed, the plot base
 * and the plant at the same (0, 0), so the origin is what lines them up. This
 * reads frame 1 of every exported DefineSprite and returns its bounds in pixels
 * relative to that origin: shape bounds (DefineShape* ShapeBounds, strokes
 * included) carried through each PlaceObject matrix, nested sprites included.
 * FFDec's export is ceil(w x zoom) by ceil(h x zoom) with its top-left at
 * (x, y) x zoom, which is how build.mjs places it.
 *
 * Usage: node tools/garden-art/swf-bounds.mjs <file.swf>   (prints JSON)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

class Bits {
  constructor(buf, at) { this.b = buf; this.p = at * 8; }
  u(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = v * 2 + ((this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1);
      this.p++;
    }
    return v;
  }
  s(n) {
    if (!n) return 0;
    const v = this.u(n);
    return v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }
  get end() { return Math.ceil(this.p / 8); }
}

function readRect(buf, at) {
  const r = new Bits(buf, at);
  const n = r.u(5);
  const x0 = r.s(n), x1 = r.s(n), y0 = r.s(n), y1 = r.s(n);
  return { x0, x1, y0, y1, end: r.end };
}

function readMatrix(buf, at) {
  const r = new Bits(buf, at);
  let a = 1, d = 1, b = 0, c = 0;
  if (r.u(1)) { const n = r.u(5); a = r.s(n) / 65536; d = r.s(n) / 65536; }
  if (r.u(1)) { const n = r.u(5); b = r.s(n) / 65536; c = r.s(n) / 65536; }
  const n = r.u(5);
  return { a, b, c, d, tx: r.s(n), ty: r.s(n) };
}

function* tags(body, start, end) {
  let p = start;
  while (p < end) {
    const h = body.readUInt16LE(p); p += 2;
    const code = h >> 6;
    let len = h & 0x3f;
    if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
    yield { code, p, len };
    if (code === 0) return;
    p += len;
  }
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const times = (m, n) => ({
  a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
  tx: m.a * n.tx + m.c * n.ty + m.tx, ty: m.b * n.tx + m.d * n.ty + m.ty,
});

/** { name: { id, x, y, w, h } } in pixels, for every SymbolClass-exported sprite. */
export function symbolBounds(file) {
  const raw = readFileSync(file);
  const sig = raw.toString('ascii', 0, 3);
  if (sig !== 'FWS' && sig !== 'CWS') throw new Error(`${file}: not an uncompressed or zlib SWF (${sig})`);
  const body = sig === 'CWS' ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
  const start = readRect(body, 0).end + 4;
  const shapes = new Map();
  const sprites = new Map();
  const names = new Map();
  for (const t of tags(body, start, body.length)) {
    if (t.code === 2 || t.code === 22 || t.code === 32 || t.code === 83) {
      shapes.set(body.readUInt16LE(t.p), readRect(body, t.p + 2));
    } else if (t.code === 39) {
      const list = new Map();
      for (const s of tags(body, t.p + 4, t.p + t.len)) {
        if (s.code === 1) break; // frame 1 only
        if (s.code === 26 || s.code === 70) {
          let q = s.p;
          const f = body[q++];
          const f2 = s.code === 70 ? body[q++] : 0;
          const depth = body.readUInt16LE(q); q += 2;
          if (s.code === 70 && (f2 & 8)) { while (body[q]) q++; q++; } // class name
          let ch = null;
          if (f & 2) { ch = body.readUInt16LE(q); q += 2; }
          const m = f & 4 ? readMatrix(body, q) : null;
          const prev = list.get(depth) || {};
          list.set(depth, { ch: ch ?? prev.ch, m: m ?? prev.m ?? IDENTITY });
        } else if (s.code === 28) {
          list.delete(body.readUInt16LE(s.p));
        }
      }
      sprites.set(body.readUInt16LE(t.p), [...list.values()]);
    } else if (t.code === 76) {
      let q = t.p;
      const n = body.readUInt16LE(q); q += 2;
      for (let i = 0; i < n; i++) {
        const id = body.readUInt16LE(q); q += 2;
        let e = q;
        while (body[e]) e++;
        names.set(id, body.toString('utf8', q, e));
        q = e + 1;
      }
    }
  }
  const box = (id, m) => {
    const pts = [];
    if (shapes.has(id)) {
      const r = shapes.get(id);
      for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
        pts.push([m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty]);
      }
    } else if (sprites.has(id)) {
      for (const child of sprites.get(id)) {
        if (child.ch == null) continue;
        const b = box(child.ch, times(m, child.m));
        if (b) pts.push([b.x0, b.y0], [b.x1, b.y1]);
      }
    }
    if (!pts.length) return null;
    return {
      x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
    };
  };
  const out = {};
  for (const [id, name] of names) {
    if (!sprites.has(id)) continue;
    const b = box(id, IDENTITY);
    if (!b) continue;
    const r = (v) => Math.round(v * 1000) / 1000;
    out[name] = { id, x: r(b.x0 / 20), y: r(b.y0 / 20), w: r((b.x1 - b.x0) / 20), h: r((b.y1 - b.y0) / 20) };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(symbolBounds(process.argv[2]), null, 1));
}
