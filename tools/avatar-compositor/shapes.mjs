/**
 * Shape outlines for the avatar compositor: FFDec exports every DefineShape
 * of a SWF as SVG (paths already in the shape's own coordinates); this turns
 * those files into compact JSON the browser compositor fills with Canvas2D
 * (solid, linear/radial gradient and bitmap fills, hairline strokes).
 *
 *   exportShapes(swf, dir) -> Map<shapeId, shape>, bitmaps: Map<bitmapId, pngBuffer>
 *   exportMorphShapes(swf, dir) -> Map<morphId, paths>; morphShapeAt(paths, ratio, bounds) -> shape
 *     (DefineMorphShape: FFDec's SVG animates each path start;end, interpolated
 *     at the PlaceObject ratio like the Flash player does)
 *
 * shape = { b: [xmin, ymin, xmax, ymax], p: [path...] }
 * path  = { d, f?: fill, s?: stroke, r?: 'evenodd' }
 * fill  = [r, g, b, a] | { t: 'l'|'r', m: [a,b,c,d,e,f], st: [[off, r, g, b, a]...], fx?, sp? }
 *       | { t: 'b', id: bitmapId, m: [a,b,c,d,e,f], w, h }
 * stroke = { c: [r, g, b, a], w, cap, join }
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { FFDEC, JAVA } from '../vector-sprites/swf-labels.mjs';

const num = (s) => Number(s);
const round = (v, k = 1000) => Math.round(v * k) / k;

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function hexColor(hex, opacity = 1) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), round(Number(opacity))];
}

function matrixOf(s) {
  const m = /matrix\(([^)]*)\)/.exec(s || '');
  return m ? m[1].split(',').map(num) : [1, 0, 0, 1, 0, 0];
}

/** A twip count as the shortest pixel number ("-.15", "3", "1.05"). */
function fmt(tw) {
  let s = String(Math.round(tw * 5) / 100);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = `-${s.slice(2)}`;
  return s;
}

/** Join path numbers with the fewest separators SVG path syntax allows. */
function joinNums(nums) {
  let out = '';
  for (const n of nums) {
    const tail = out.split(/[^\d.]/).pop();
    const needsSpace = out && /[\d.]$/.test(out) && !(n[0] === '-' || (n[0] === '.' && tail.includes('.')));
    if (needsSpace) out += ' ';
    out += n;
  }
  return out;
}

/**
 * Compact an absolute FFDec path (M/L/Q, coordinates on the 1/20 px twip
 * grid) into relative commands: the same outline in about half the text.
 */
export function compactD(d) {
  const tokens = d.match(/[MLQCZmlqcz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let out = '';
  let first = true;
  let last = '';
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i]; i += 1; if (cmd === 'Z' || cmd === 'z') { out += 'z'; last = 'z'; } continue; }
    const n = cmd === 'Q' ? 4 : 2;
    if (cmd !== 'M' && cmd !== 'L' && cmd !== 'Q') return d;
    const v = tokens.slice(i, i + n).map((t) => Math.round(Number(t) * 20));
    i += n;
    if (v.length < n) break;
    let letter;
    let nums;
    if (cmd === 'M' && first) {
      letter = 'M';
      nums = [fmt(v[0]), fmt(v[1])];
      x = v[0]; y = v[1];
      first = false;
    } else {
      letter = cmd.toLowerCase();
      nums = [];
      for (let k = 0; k < n; k += 2) nums.push(fmt(v[k] - x), fmt(v[k + 1] - y));
      x = v[n - 2]; y = v[n - 1];
    }
    if (letter !== last) { out += letter + joinNums(nums); last = letter; }
    else out = joinNums([out, ...nums]);
    // After an "m", later pairs are implicit line-tos: keep the letter explicit.
    if (letter === 'm' || letter === 'M') last = '';
  }
  return out;
}

/** Parse one FFDec shape SVG. bitmaps collects bitmap PNGs by id. */
export function parseShapeSvg(svg, bitmaps) {
  const defs = new Map();
  for (const m of svg.matchAll(/<(linearGradient|radialGradient)([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a = attrs(m[2]);
    const st = [...m[3].matchAll(/<stop([^>]*)\/?>/g)].map((s) => {
      const sa = attrs(s[1]);
      return [round(num(sa.offset)), ...hexColor(sa['stop-color'], sa['stop-opacity'] ?? 1)];
    });
    const g = { t: m[1] === 'linearGradient' ? 'l' : 'r', m: matrixOf(a.gradientTransform), st };
    if (a.fx && Number(a.fx)) g.fx = num(a.fx);
    if (a.spreadMethod && a.spreadMethod !== 'pad') g.sp = a.spreadMethod;
    if (a['color-interpolation'] === 'linearRGB') g.lin = 1;
    defs.set(a.id, g);
  }
  for (const m of svg.matchAll(/<pattern([^>]*)>([\s\S]*?)<\/pattern>/g)) {
    const a = attrs(m[1]);
    const img = /<image([^>]*)\/?>/.exec(m[2]);
    const ia = img ? attrs(img[1]) : {};
    defs.set(a.id, { t: 'b', m: matrixOf(a.patternTransform), w: num(a.width), h: num(a.height), href: ia['xlink:href'] || '' });
  }
  const paths = [];
  for (const m of svg.matchAll(/<path([^>]*)\/>/g)) {
    const a = attrs(m[1]);
    const p = { d: compactD(a.d || '') };
    const fillRef = /url\(#([^)]+)\)/.exec(a.fill || a.style || '');
    if (fillRef) {
      const def = defs.get(fillRef[1]);
      if (def?.t === 'b') {
        const id = Number(a['ffdec:fill-bitmapId'] || 0);
        if (!bitmaps.has(id)) {
          const b64 = /base64,(.*)$/.exec(def.href);
          if (b64) bitmaps.set(id, Buffer.from(b64[1], 'base64'));
        }
        p.f = { t: 'b', id, m: def.m, w: def.w, h: def.h };
      } else if (def) {
        p.f = def;
      }
    } else if (a.fill && a.fill !== 'none') {
      p.f = hexColor(a.fill, a['fill-opacity'] ?? 1);
    }
    if (a.stroke && a.stroke !== 'none') {
      const w = Number(a['ffdec:original-stroke-width'] ?? a['stroke-width'] ?? 1);
      p.s = { c: hexColor(a.stroke, a['stroke-opacity'] ?? 1), w, cap: a['stroke-linecap'] || 'round', join: a['stroke-linejoin'] || 'round' };
    }
    if (a['fill-rule'] === 'evenodd') p.r = 'evenodd';
    if (p.f || p.s) paths.push(p);
  }
  return paths;
}

/**
 * FFDec-export all shapes of a SWF (cached in workDir) and parse them.
 * bounds: Map<id, rect> from swf.mjs, kept with each shape for culling.
 */
export function exportShapes(swfFile, workDir, bounds) {
  const dir = join(workDir, 'shapes');
  const done = join(workDir, '.shapes-done');
  if (!existsSync(done)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync(JAVA, ['-jar', FFDEC, '-format', 'shape:svg', '-export', 'shape', dir, swfFile], { stdio: 'ignore' });
    writeFileSync(done, '');
  }
  const shapes = new Map();
  const bitmaps = new Map();
  for (const name of readdirSync(dir)) {
    const m = /^(\d+)\.svg$/.exec(name);
    if (!m) continue;
    const id = Number(m[1]);
    const r = bounds?.get(id);
    shapes.set(id, { b: r ? [r.xmin, r.ymin, r.xmax, r.ymax] : null, p: parseShapeSvg(readFileSync(join(dir, name), 'utf8'), bitmaps) });
  }
  return { shapes, bitmaps };
}

// ---------------------------------------------------------------------------
// Morph shapes (DefineMorphShape): shape tweens, often used as mask layers
// ---------------------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => [0, 1, 2].map((i) => Math.round(lerp(a[i], b[i], t))).concat(round(lerp(a[3], b[3], t)));

/** animate values "start;end" for one attribute of an element's body. */
function animated(body, attr) {
  const m = new RegExp(`<animate[^>]*attributeName="${attr}"[^>]*values="([^"]*)"`).exec(body);
  return m ? m[1].split(';') : null;
}

/** [start, end] of an attribute: its animate values, else the static value twice. */
function pair(attrsOf, body, attr, fallback) {
  const v = animated(body, attr);
  if (v && v.length >= 2) return [v[0], v[v.length - 1]];
  const s = attrsOf[attr] ?? fallback;
  return [s, s];
}

/** 2D matrix product p * c ([a, b, c, d, e, f]). */
function mat(p, c) {
  return [p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1], p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3], p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5]];
}

/**
 * A gradient's transform at t from FFDec's animateTransform list (a
 * replacing scale, then additive translate, rotate, scale, skewX in order).
 */
function gradientMatrixAt(steps, t) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const st of steps) {
    const v = st.from.map((f, i) => lerp(f, st.to[i] ?? f, t));
    let k;
    if (st.type === 'translate') k = [1, 0, 0, 1, v[0], v[1] ?? 0];
    else if (st.type === 'scale') k = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (st.type === 'rotate') { const r = (v[0] * Math.PI) / 180; k = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; }
    else if (st.type === 'skewX') k = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0];
    else if (st.type === 'skewY') k = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0];
    else throw new Error(`morph gradient: unsupported ${st.type}`);
    m = st.additive === 'replace' ? k : mat(m, k);
  }
  return m.map((x) => round(x, 1e5));
}

/** Parse one FFDec morph shape SVG into start/end paths and fills. */
export function parseMorphSvg(svg) {
  const defs = new Map();
  for (const m of svg.matchAll(/<(linearGradient|radialGradient)([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a = attrs(m[2]);
    const steps = [...m[3].matchAll(/<animateTransform([^>]*)\/?>/g)].map((s) => {
      const sa = attrs(s[1]);
      return { type: sa.type, additive: sa.additive || 'replace', from: sa.from.split(/[\s,]+/).map(num), to: sa.to.split(/[\s,]+/).map(num) };
    });
    const stops = [...m[3].matchAll(/<stop([^>]*?)(?:\/>|>([\s\S]*?)<\/stop>)/g)].map((s) => {
      const sa = attrs(s[1]);
      const body = s[2] || '';
      return { off: pair(sa, body, 'offset', '0').map(num), color: pair(sa, body, 'stop-color', '#000000'), op: pair(sa, body, 'stop-opacity', '1').map(num) };
    });
    const g = { t: m[1] === 'linearGradient' ? 'l' : 'r', steps, static: matrixOf(a.gradientTransform), stops };
    if (a.fx && Number(a.fx)) g.fx = num(a.fx);
    if (a.spreadMethod && a.spreadMethod !== 'pad') g.sp = a.spreadMethod;
    if (a['color-interpolation'] === 'linearRGB') g.lin = 1;
    defs.set(a.id, g);
  }
  if (/<pattern/.test(svg)) throw new Error('morph shapes with bitmap fills are not supported');
  const paths = [];
  for (const m of svg.matchAll(/<path([^>]*?)(?:\/>|>([\s\S]*?)<\/path>)/g)) {
    const a = attrs(m[1]);
    const body = m[2] || '';
    const [d0, d1] = pair(a, body, 'd', '');
    const t0 = d0.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const t1 = d1.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    if (t0.length !== t1.length || t0.some((tk, i) => /[A-Za-z]/.test(tk) !== /[A-Za-z]/.test(t1[i]) || (/[A-Za-z]/.test(tk) && tk !== t1[i]))) {
      throw new Error('morph path start and end differ in structure');
    }
    const p = { t0, t1 };
    const fillRef = /url\(#([^)]+)\)/.exec(a.fill || '');
    if (fillRef) {
      p.grad = defs.get(fillRef[1]);
      if (!p.grad) throw new Error(`morph fill ${fillRef[1]} not found`);
    } else if (a.fill && a.fill !== 'none') {
      p.fill = pair(a, body, 'fill').map((c, i) => hexColor(c, pair(a, body, 'fill-opacity', '1')[i]));
    }
    if (a.stroke && a.stroke !== 'none') {
      const op = Number(a['stroke-opacity'] ?? 1);
      const w = pair(a, body, 'stroke-width', '1').map(num);
      if (op > 0) p.stroke = { c: pair(a, body, 'stroke').map((c) => hexColor(c, op)), w, cap: a['stroke-linecap'] || 'round', join: a['stroke-linejoin'] || 'round' };
    }
    if (a['fill-rule'] === 'evenodd') p.r = 'evenodd';
    if (p.fill || p.grad || p.stroke) paths.push(p);
  }
  return paths;
}

/**
 * A morph shape at a PlaceObject ratio (0-65535) as a plain shape (the
 * exportShapes format). bounds: [startRect, endRect] from swf.mjs.
 */
export function morphShapeAt(paths, ratio, bounds) {
  const t = Math.max(0, Math.min(1, ratio / 65535));
  const out = [];
  for (const mp of paths) {
    const d = mp.t0.map((tk, i) => (/[A-Za-z]/.test(tk) ? tk : String(lerp(Number(tk), Number(mp.t1[i]), t)))).join(' ');
    const p = { d: compactD(d) };
    if (mp.fill) p.f = lerpColor(mp.fill[0], mp.fill[1], t);
    else if (mp.grad) {
      const g = mp.grad;
      p.f = {
        t: g.t,
        m: g.steps.length ? gradientMatrixAt(g.steps, t) : g.static,
        st: g.stops.map((s) => {
          const c = lerpColor(hexColor(s.color[0], s.op[0]), hexColor(s.color[1], s.op[1]), t);
          return [round(lerp(s.off[0], s.off[1], t)), ...c];
        }),
      };
      if (g.fx) p.f.fx = g.fx;
      if (g.sp) p.f.sp = g.sp;
      if (g.lin) p.f.lin = 1;
    }
    if (mp.stroke) p.s = { c: lerpColor(mp.stroke.c[0], mp.stroke.c[1], t), w: round(lerp(mp.stroke.w[0], mp.stroke.w[1], t)), cap: mp.stroke.cap, join: mp.stroke.join };
    if (mp.r) p.r = mp.r;
    out.push(p);
  }
  let b = null;
  if (bounds) {
    const [s, e] = bounds;
    b = [lerp(s.xmin, e.xmin, t), lerp(s.ymin, e.ymin, t), lerp(s.xmax, e.xmax, t), lerp(s.ymax, e.ymax, t)].map((v) => round(v, 100));
  }
  return { b, p: out };
}

/** FFDec-export every DefineMorphShape of a SWF (cached in workDir): Map<id, paths>. */
export function exportMorphShapes(swfFile, workDir) {
  const dir = join(workDir, 'morphs');
  const done = join(workDir, '.morphs-done');
  if (!existsSync(done)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync(JAVA, ['-jar', FFDEC, '-format', 'morphshape:svg', '-export', 'morphshape', dir, swfFile], { stdio: 'ignore' });
    writeFileSync(done, '');
  }
  const morphs = new Map();
  for (const name of readdirSync(dir)) {
    const m = /^(\d+)\.svg$/.exec(name);
    if (m) morphs.set(Number(m[1]), parseMorphSvg(readFileSync(join(dir, name), 'utf8')));
  }
  return morphs;
}
