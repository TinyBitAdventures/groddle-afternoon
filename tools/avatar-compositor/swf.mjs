/**
 * Minimal SWF reader for the avatar compositor: the display-list side of a
 * SWF (sprites, placements, names, masks, colour transforms, frame labels,
 * exported class names, shape and bitmap ids). Shape outlines come from
 * FFDec's SVG export (shapes.mjs); everything else is read here so a
 * timeline can be evaluated at any frame without a Flash player.
 *
 * SWF files are untrusted data: this only reads bytes and never runs
 * ActionScript.
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/** Uncompressed SWF bytes (FWS or CWS). */
export function inflateSwf(buf) {
  const sig = buf.toString('ascii', 0, 3);
  if (sig === 'FWS') return Buffer.from(buf);
  if (sig === 'CWS') return Buffer.concat([buf.subarray(0, 8), zlib.inflateSync(buf.subarray(8))]);
  throw new Error(`unsupported SWF signature ${sig}`);
}

class Bits {
  constructor(buf, pos) { this.buf = buf; this.pos = pos; this.bit = 0; }
  align() { if (this.bit) { this.bit = 0; this.pos += 1; } }
  ub(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const b = (this.buf[this.pos] >> (7 - this.bit)) & 1;
      v = v * 2 + b;
      this.bit += 1;
      if (this.bit === 8) { this.bit = 0; this.pos += 1; }
    }
    return v;
  }
  sb(n) {
    if (!n) return 0;
    const v = this.ub(n);
    return v >= 2 ** (n - 1) ? v - 2 ** n : v;
  }
  fb(n) { return this.sb(n) / 65536; }
}

function readRect(buf, pos) {
  const b = new Bits(buf, pos);
  const n = b.ub(5);
  const r = { xmin: b.sb(n) / 20, xmax: b.sb(n) / 20, ymin: b.sb(n) / 20, ymax: b.sb(n) / 20 };
  b.align();
  return { rect: r, end: b.pos };
}

/** MATRIX -> [a, b, c, d, tx, ty] in pixels. */
function readMatrix(b) {
  let a = 1, d = 1, bb = 0, c = 0;
  if (b.ub(1)) { const n = b.ub(5); a = b.fb(n); d = b.fb(n); }
  if (b.ub(1)) { const n = b.ub(5); bb = b.fb(n); c = b.fb(n); }
  const n = b.ub(5);
  const tx = b.sb(n) / 20;
  const ty = b.sb(n) / 20;
  b.align();
  return [a, bb, c, d, tx, ty];
}

/** CXFORMWITHALPHA -> { m: [r,g,b,a] multipliers (1 = 256), o: [r,g,b,a] offsets }. */
function readCxform(b, withAlpha = true) {
  const hasAdd = b.ub(1);
  const hasMult = b.ub(1);
  const n = b.ub(4);
  const m = [1, 1, 1, 1];
  const o = [0, 0, 0, 0];
  const k = withAlpha ? 4 : 3;
  if (hasMult) for (let i = 0; i < k; i++) m[i] = b.sb(n) / 256;
  if (hasAdd) for (let i = 0; i < k; i++) o[i] = b.sb(n);
  b.align();
  return { m, o };
}

/** PlaceObject3 BlendMode byte -> flash.display.BlendMode name (0 and 1 are normal). */
export const BLEND_MODES = Object.freeze(['normal', 'normal', 'layer', 'multiply', 'screen', 'lighten', 'darken', 'difference', 'add', 'subtract', 'invert', 'alpha', 'erase', 'overlay', 'hardlight']);

const FILTER_KINDS = ['dropShadow', 'blur', 'glow', 'bevel', 'gradientGlow', 'convolution', 'colorMatrix', 'gradientBevel'];

/** FILTERLIST: { kinds: [filter names], end } (sizes from the SWF 19 spec). */
function readFilterList(buf, pos) {
  const n = buf[pos];
  let q = pos + 1;
  const kinds = [];
  for (let i = 0; i < n; i++) {
    const id = buf[q];
    q += 1;
    kinds.push(FILTER_KINDS[id] || `filter${id}`);
    if (id === 0) q += 23;
    else if (id === 1) q += 9;
    else if (id === 2) q += 15;
    else if (id === 3) q += 27;
    else if (id === 4 || id === 7) q += 1 + buf[q] * 5 + 19;
    else if (id === 5) q += 2 + 8 + 4 * buf[q] * buf[q + 1] + 5;
    else if (id === 6) q += 80;
    else throw new Error(`unknown filter id ${id}`);
  }
  return { kinds, end: q };
}

function cstring(buf, pos) {
  let end = pos;
  while (buf[end] !== 0) end += 1;
  return { s: buf.toString('utf8', pos, end), end: end + 1 };
}

/**
 * Walk tags in [start, end). Returns frames: each a list of display-list
 * ops ({ op: 'place'|'remove', ... }) plus labels.
 */
function readTimeline(buf, start, end, swf) {
  const frames = [[]];
  const labels = [];
  let p = start;
  while (p < end) {
    const head = buf.readUInt16LE(p);
    const code = head >> 6;
    let len = head & 0x3f;
    let body = p + 2;
    if (len === 0x3f) { len = buf.readUInt32LE(p + 2); body = p + 6; }
    const next = body + len;
    const ops = frames[frames.length - 1];
    switch (code) {
      case 0: p = end; continue;
      case 1: frames.push([]); break;
      case 43: labels.push({ name: cstring(buf, body).s, frame: frames.length }); break;
      case 4: {
        // PlaceObject (rare): id, depth, matrix, optional cxform.
        const id = buf.readUInt16LE(body);
        const depth = buf.readUInt16LE(body + 2);
        const b = new Bits(buf, body + 4);
        const matrix = readMatrix(b);
        const place = { op: 'place', depth, id, matrix, move: false };
        if (b.pos < next) place.cxform = readCxform(b, false);
        ops.push(place);
        break;
      }
      case 26: case 70: {
        const f1 = buf[body];
        let q = body + 1;
        let f2 = 0;
        if (code === 70) { f2 = buf[q]; q += 1; }
        const place = { op: 'place', move: Boolean(f1 & 0x01) };
        place.depth = buf.readUInt16LE(q); q += 2;
        if (code === 70 && (f2 & 0x08 || (f2 & 0x10 && f1 & 0x02))) { const s = cstring(buf, q); place.className = s.s; q = s.end; }
        if (f1 & 0x02) { place.id = buf.readUInt16LE(q); q += 2; }
        const b = new Bits(buf, q);
        if (f1 & 0x04) place.matrix = readMatrix(b);
        if (f1 & 0x08) place.cxform = readCxform(b, true);
        q = b.pos;
        if (f1 & 0x10) { place.ratio = buf.readUInt16LE(q); q += 2; }
        if (f1 & 0x20) { const s = cstring(buf, q); place.name = s.s; q = s.end; }
        if (f1 & 0x40) { place.clipDepth = buf.readUInt16LE(q); q += 2; }
        if (code === 70) {
          // Filters (kinds only; the avatar art uses none) come before the blend mode.
          if (f2 & 0x01) { const fl = readFilterList(buf, q); place.filters = fl.kinds; q = fl.end; }
          if (f2 & 0x02) {
            // Kept when 'normal' too: a move may reset an earlier blend mode.
            place.blendMode = BLEND_MODES[buf[q]] || `unknown${buf[q]}`;
            q += 1;
          }
        }
        ops.push(place);
        break;
      }
      case 5: ops.push({ op: 'remove', depth: buf.readUInt16LE(body + 2) }); break;
      case 28: ops.push({ op: 'remove', depth: buf.readUInt16LE(body) }); break;
      case 39: {
        const id = buf.readUInt16LE(body);
        const t = readTimeline(buf, body + 4, next, swf);
        swf.sprites.set(id, t);
        swf.kinds.set(id, 'sprite');
        break;
      }
      case 2: case 22: case 32: case 83: {
        const id = buf.readUInt16LE(body);
        swf.kinds.set(id, 'shape');
        swf.shapeBounds.set(id, readRect(buf, body + 2).rect);
        break;
      }
      case 6: case 21: case 35: case 36: case 20: case 90:
        swf.kinds.set(buf.readUInt16LE(body), 'bitmap');
        break;
      case 76: {
        const n = buf.readUInt16LE(body);
        let q = body + 2;
        for (let i = 0; i < n; i++) {
          const id = buf.readUInt16LE(q);
          const s = cstring(buf, q + 2);
          swf.classes.set(s.s, id);
          q = s.end;
        }
        break;
      }
      case 46: case 84: {
        // DefineMorphShape(2): id, StartBounds, EndBounds (outlines come from
        // FFDec's SVG export, shapes.mjs exportMorphShapes).
        const id = buf.readUInt16LE(body);
        swf.kinds.set(id, 'morph');
        const start = readRect(buf, body + 2);
        swf.morphBounds.set(id, [start.rect, readRect(buf, start.end).rect]);
        break;
      }
      default: break;
    }
    p = next;
  }
  // A trailing empty frame after the last ShowFrame is not a frame.
  if (frames.length > 1 && frames[frames.length - 1].length === 0) frames.pop();
  return { frames, labels, frameCount: frames.length };
}

/**
 * Parse a SWF: { classes: Map<className, id>, sprites: Map<id, timeline>,
 * kinds: Map<id, 'shape'|'sprite'|'bitmap'|'morph'>, shapeBounds,
 * morphBounds: Map<id, [startRect, endRect]>, root }.
 */
export function readSwf(file) {
  const buf = inflateSwf(readFileSync(file));
  const { end: rectEnd, rect } = readRect(buf, 8);
  const swf = { classes: new Map(), sprites: new Map(), kinds: new Map(), shapeBounds: new Map(), morphBounds: new Map(), stage: rect, frameRate: buf[rectEnd + 1] + buf[rectEnd] / 256 };
  swf.root = readTimeline(buf, rectEnd + 4, buf.length, swf);
  return swf;
}

/**
 * Display list of a timeline at 1-based frame n: Map<depth, placement>,
 * following PlaceObject move/replace rules (unspecified fields persist).
 */
export function displayListAt(timeline, n) {
  const list = new Map();
  const last = Math.min(n, timeline.frameCount);
  for (let f = 0; f < last; f++) {
    for (const op of timeline.frames[f]) {
      if (op.op === 'remove') { list.delete(op.depth); continue; }
      const prev = list.get(op.depth);
      if (op.move && prev) {
        const next = { ...prev };
        if (op.id !== undefined && op.id !== prev.id) { next.id = op.id; next.since = f + 1; }
        for (const k of ['matrix', 'cxform', 'ratio', 'name', 'clipDepth', 'blendMode']) if (op[k] !== undefined) next[k] = op[k];
        list.set(op.depth, next);
      } else if (op.id !== undefined) {
        list.set(op.depth, { depth: op.depth, id: op.id, matrix: op.matrix || [1, 0, 0, 1, 0, 0], cxform: op.cxform, name: op.name, clipDepth: op.clipDepth, ratio: op.ratio, blendMode: op.blendMode, since: f + 1 });
      }
    }
  }
  return list;
}
