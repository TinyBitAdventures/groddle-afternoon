/**
 * Shape outlines for the avatar compositor: FFDec exports every DefineShape
 * of a SWF as SVG (paths already in the shape's own coordinates); this turns
 * those files into compact JSON the browser compositor fills with Canvas2D
 * (solid, linear/radial gradient and bitmap fills, hairline strokes).
 *
 *   exportShapes(swf, dir) -> Map<shapeId, shape>, bitmaps: Map<bitmapId, pngBuffer>
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
