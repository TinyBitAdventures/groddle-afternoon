// Fake Pixi 7 and Pixi 8 Graphics that record what would be painted, in a
// normalised form: [{ shape, paint: 'fill'|'stroke', style }] in paint order.
// Path segments are kept symbolic (no tessellation) so both versions compare.

const r = (n) => Math.round(n * 1000) / 1000;
const color = (c) => (typeof c === 'number' ? c : c === undefined ? undefined : String(c));

export class G7 {
  constructor() {
    this.data = []; // { shape, fill, line }
    this.fillS = null;
    this.lineS = null;
    this.path = null; // { segs:[], closed }
  }
  _finish() {
    if (this.path && this.path.segs.length > 1) this.data.push({ shape: { type: 'path', segs: this.path.segs, closed: this.path.closed }, fill: this.fillS, line: this.lineS });
    this.path = null;
  }
  _startPoly() {
    if (this.path) {
      const last = this.path.segs[this.path.segs.length - 1];
      if (this.path.segs.length > 1) {
        this._finish();
        this.path = { segs: [['M', last.at[0], last.at[1]]], closed: false };
        this.path.segs[0].at = last.at;
      } else this.path = { segs: [], closed: false };
    } else this.path = { segs: [], closed: false };
  }
  lineStyle(w = null, c = 0, a, align = 0.5) {
    let o = typeof w === 'number' ? { width: w, color: c, alpha: a } : { ...(w || {}) };
    o = { width: 0, color: 0, ...o };
    if (o.alpha === undefined) o.alpha = 1;
    if (this.path) this._startPoly();
    this.lineS = o.width > 0 && o.alpha > 0 ? { width: o.width, color: color(o.color), alpha: o.alpha, cap: o.cap || 'butt', join: o.join || 'miter' } : null;
    return this;
  }
  beginFill(c = 0, a) {
    if (a === undefined) a = 1;
    if (this.path) this._startPoly();
    this.fillS = a > 0 ? { color: color(c), alpha: a } : null;
    return this;
  }
  endFill() {
    this._finish();
    this.fillS = null;
    return this;
  }
  _shape(shape) {
    this.data.push({ shape, fill: this.fillS, line: this.lineS });
    return this;
  }
  drawRect(x, y, w, h) { return this._shape({ type: 'rect', a: [x, y, w, h].map(r) }); }
  drawRoundedRect(x, y, w, h, rad) { return this._shape({ type: 'rrect', a: [x, y, w, h, rad].map(r) }); }
  drawCircle(x, y, rad) { return this._shape({ type: 'circle', a: [x, y, rad].map(r) }); }
  drawEllipse(x, y, w, h) { return this._shape({ type: 'ellipse', a: [x, y, w, h].map(r) }); }
  drawPolygon(...p) { const pts = Array.isArray(p[0]) ? p[0] : p; return this._shape({ type: 'poly', a: pts.flat().map(r) }); }
  moveTo(x, y) {
    this._startPoly();
    this.path.segs = [Object.assign(['M', r(x), r(y)], { at: [r(x), r(y)] })];
    return this;
  }
  _seg(seg, at) {
    if (!this.path) this.moveTo(0, 0);
    this.path.segs.push(Object.assign(seg, { at }));
    return this;
  }
  lineTo(x, y) { return this._seg(['L', r(x), r(y)], [r(x), r(y)]); }
  quadraticCurveTo(a, b, x, y) { return this._seg(['Q', r(a), r(b), r(x), r(y)], [r(x), r(y)]); }
  bezierCurveTo(a, b, c, d, x, y) { return this._seg(['C', r(a), r(b), r(c), r(d), r(x), r(y)], [r(x), r(y)]); }
  arc(cx, cy, rad, s, e, ccw = false) {
    const at = [r(cx + Math.cos(e) * rad), r(cy + Math.sin(e) * rad)];
    if (!this.path) { this.path = { segs: [], closed: false }; }
    return this._seg(['A', r(cx), r(cy), r(rad), r(s), r(e), !!ccw], at);
  }
  closePath() {
    if (this.path) {
      this.path.closed = true;
      this._finish();
    }
    return this;
  }
  clear() {
    this.data = [];
    this.fillS = null;
    this.lineS = null;
    this.path = null;
    return this;
  }
  /** Normalised paint list (render finishes the open path). */
  paints() {
    this._finish();
    const out = [];
    for (const d of this.data) {
      if (d.fill) out.push({ shape: norm(d.shape), paint: 'fill', style: d.fill });
      if (d.line) out.push({ shape: norm(d.shape), paint: 'stroke', style: d.line });
    }
    return out;
  }
}

const norm = (shape) => {
  if (shape.type !== 'path') return JSON.stringify(shape);
  // Drop the leading moveTo point marker objects; keep segments.
  return JSON.stringify({ type: 'path', segs: shape.segs.map((s) => [...s]), closed: !!shape.closed });
};

export class G8 {
  constructor() {
    this.instr = [];
    this.fillS = { color: 0xffffff, alpha: 1 };
    this.strokeS = { width: 1, color: 0xffffff, alpha: 1, cap: 'butt', join: 'miter' };
    this.shapes = [];
    this.cur = null; // open polygon {segs, closed}
    this.tick = 0;
    this.last = null;
  }
  _endPoly() {
    if (this.cur && this.cur.segs.length > 1) this.shapes.push({ type: 'path', segs: this.cur.segs, closed: this.cur.closed });
    this.cur = null;
  }
  _shape(s) {
    this.tick++;
    this._endPoly();
    this.shapes.push(s);
    return this;
  }
  rect(x, y, w, h) { return this._shape({ type: 'rect', a: [x, y, w, h].map(r) }); }
  roundRect(x, y, w, h, rad) { return this._shape({ type: 'rrect', a: [x, y, w, h, rad].map(r) }); }
  circle(x, y, rad) { return this._shape({ type: 'circle', a: [x, y, rad].map(r) }); }
  ellipse(x, y, w, h) { return this._shape({ type: 'ellipse', a: [x, y, w, h].map(r) }); }
  poly(pts) { return this._shape({ type: 'poly', a: pts.flat().map(r) }); }
  moveTo(x, y) {
    this.tick++;
    this._endPoly();
    this.cur = { segs: [['M', r(x), r(y)]], closed: false };
    this.lastPt = [r(x), r(y)];
    return this;
  }
  _seg(seg, at) {
    this.tick++;
    if (!this.cur) this.cur = { segs: [['M', ...(this.lastPt || [0, 0])]], closed: false };
    this.cur.segs.push(seg);
    this.lastPt = at;
    return this;
  }
  lineTo(x, y) { return this._seg(['L', r(x), r(y)], [r(x), r(y)]); }
  quadraticCurveTo(a, b, x, y) { return this._seg(['Q', r(a), r(b), r(x), r(y)], [r(x), r(y)]); }
  bezierCurveTo(a, b, c, d, x, y) { return this._seg(['C', r(a), r(b), r(c), r(d), r(x), r(y)], [r(x), r(y)]); }
  arc(cx, cy, rad, s, e, ccw = false) {
    const at = [r(cx + Math.cos(e) * rad), r(cy + Math.sin(e) * rad)];
    this.tick++;
    if (!this.cur) this.cur = { segs: [], closed: false };
    this.cur.segs.push(['A', r(cx), r(cy), r(rad), r(s), r(e), !!ccw]);
    this.lastPt = at;
    return this;
  }
  closePath() {
    this.tick++;
    if (this.cur) {
      this.cur.closed = true;
      this._endPoly();
    }
    return this;
  }
  _path() {
    this._endPoly();
    const p = this.shapes;
    return p;
  }
  _paint(kind, style) {
    let path;
    if (this.tick === 0 && this.last && this.last.kind !== kind) path = this.last.path;
    else path = this._path();
    if (style !== undefined && style !== null) {
      if (kind === 'fill') this.fillS = toFill(style, { color: 0xffffff, alpha: 1 });
      else this.strokeS = toFill(style, { width: 1, color: 0xffffff, alpha: 1, cap: 'butt', join: 'miter' });
    }
    const st = kind === 'fill' ? this.fillS : this.strokeS;
    const ins = { kind, style: { ...st }, path };
    this.instr.push(ins);
    this.last = ins;
    this.shapes = [];
    this.cur = null; // v8 starts the next path at the last point
    this.tick = 0;
    return this;
  }
  fill(style) { return this._paint('fill', style); }
  stroke(style) { return this._paint('stroke', style); }
  setFillStyle(style) { this.fillS = toFill(style, { color: 0xffffff, alpha: 1 }); return this; }
  setStrokeStyle(style) { this.strokeS = toFill(style, { width: 1, color: 0xffffff, alpha: 1, cap: 'butt', join: 'miter' }); return this; }
  beginPath() { this.shapes = []; this.cur = null; return this; }
  clear() { this.instr = []; this.shapes = []; this.cur = null; this.tick = 0; this.last = null; return this; }
  paints() {
    const out = [];
    for (const i of this.instr) {
      for (const s of i.path) {
        const style = i.kind === 'fill' ? { color: i.style.color, alpha: i.style.alpha } : { width: i.style.width, color: i.style.color, alpha: i.style.alpha, cap: i.style.cap, join: i.style.join };
        out.push({ shape: norm(s), paint: i.kind, style });
      }
    }
    return out;
  }
}

function toFill(style, def) {
  if (typeof style === 'number' || typeof style === 'string') return { ...def, color: color(style) };
  const o = { ...def, ...style };
  if (Number.isNaN(o.alpha) || o.alpha === undefined) o.alpha = NaN;
  o.color = color(o.color);
  return o;
}

/** Compare two paint lists; runs of identical (paint, style) compare as multisets. */
export function samePaints(a, b) {
  const runs = (list) => {
    const out = [];
    for (const p of list) {
      const key = `${p.paint}|${JSON.stringify(p.style)}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.shapes.push(p.shape);
      else out.push({ key, shapes: [p.shape] });
    }
    return out.map((x) => ({ key: x.key, shapes: x.shapes.sort() }));
  };
  const ra = runs(a);
  const rb = runs(b);
  return JSON.stringify(ra) === JSON.stringify(rb);
}

export function makePIXI(GraphicsClass) {
  return {
    Graphics: GraphicsClass,
    Container: class { addChild() {} },
    Sprite: class {},
    LINE_CAP: { ROUND: 'round', BUTT: 'butt', SQUARE: 'square' },
    LINE_JOIN: { ROUND: 'round', MITER: 'miter', BEVEL: 'bevel' },
  };
}
