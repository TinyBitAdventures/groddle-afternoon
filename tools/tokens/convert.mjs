#!/usr/bin/env node
// Design tokens: rewrite raw CSS values in the game's stylesheets as the tokens in style.css's token block.
//
//   node tools/tokens/convert.mjs            dry run: what would change, and anything with no token
//   node tools/tokens/convert.mjs --write    rewrite style.css and the modules' CSS
//   node tools/tokens/convert.mjs --write --add
//                                            also add palette entries (--c-*) for colours with no token
//                                            within tolerance, between the palette:start/end markers
//   --tol=N        colour tolerance, OKLab distance x 100 (default 3; about 2 is just noticeable)
//   --space-tol=N  spacing tolerance in px (default 0.5: off-scale spacing stays raw, since moving it
//                  moves layouts)
//   --report=FILE  write the full mapping (every change) as JSON
//
// The Classic interface (public/css/classic.css, every rule under :root[data-ui="classic"]) has its own
// palette, --c-classic-*, written by hand between the classic:start / classic:end markers of the token
// block with the source of each value. Its colours map only onto that palette, the rest of the game's
// never do, and with --add a new Classic colour becomes a --c-classic-<family>-<L> entry before
// classic:end (the hand-written lines and their comments stay as they are).
//
// It only touches raw literals, so it is safe to re-run after other work lands: tokens already in
// place stay, new raw values are mapped to the nearest token (role first: a `color` prefers --text-*,
// a background --surface-*, a border --border-*), and with --add new colours become palette entries.
// Sources and the allowlist: tools/tokens/css-sources.mjs, tools/tokens/allowlist.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssSources, declarations, TOKENS_START, TOKENS_END } from './css-sources.mjs';
import { colourLiterals, parseColour, deltaE, hex, paletteName, family, oklch, COLOUR_PROP } from './colour.mjs';
import { allowed } from './allowlist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(n + '=')); return a ? a.slice(n.length + 1) : d; };
const WRITE = flag('--write');
const ADD = flag('--add');
const TOL = Number(opt('--tol', 3));
const SPACE_TOL = Number(opt('--space-tol', 0.5));
const REPORT = opt('--report', '');
const STYLE = 'public/style.css';
const PALETTE_START = '/* palette:start */';
const PALETTE_END = '/* palette:end */';
const CLASSIC_START = '/* classic:start */';
const CLASSIC_END = '/* classic:end */';
const CLASSIC_CSS = 'public/css/classic.css';
const CLASSIC = '--c-classic-';
const isClassicToken = (name) => name.startsWith(CLASSIC);

// ---- token block --------------------------------------------------------------------------------

function tokenBlock(style) {
  const a = style.indexOf(TOKENS_START);
  const b = style.indexOf(TOKENS_END);
  if (a < 0 || b < a) throw new Error(`style.css has no token block (${TOKENS_START} ... ${TOKENS_END})`);
  return { a, b, text: style.slice(a, b) };
}

function parseTokens(blockText) {
  const map = new Map();
  for (const m of blockText.replace(/\/\*[\s\S]*?\*\//g, (s) => ' '.repeat(s.length)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function resolveColour(value, tokens, depth = 0) {
  if (depth > 8) return null;
  const v = value.trim();
  let m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) return tokens.has(m[1]) ? resolveColour(tokens.get(m[1]), tokens, depth + 1) : null;
  m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*transparent\)$/.exec(v);
  if (m) {
    const c = tokens.has(m[1]) && resolveColour(tokens.get(m[1]), tokens, depth + 1);
    return c ? [c[0], c[1], c[2], c[3] * (Number(m[2]) / 100)] : null;
  }
  return parseColour(v);
}

const roleOfToken = (name) => {
  if (name.startsWith('--c-')) return 'palette';
  if (/^--(text|ink)\b/.test(name)) return 'text';
  if (/^--(surface|card|overlay)\b/.test(name)) return 'surface';
  if (/^--border\b/.test(name)) return 'border';
  if (/^--shadow\b/.test(name)) return 'shadow';
  return 'any';
};

const roleOfProp = (prop) => {
  if (/^(color|-webkit-text-fill-color|caret-color|text-decoration-color|-webkit-text-stroke-color|fill|stroke)$/.test(prop)) return 'text';
  if (/^background/.test(prop)) return 'surface';
  if (/^(border|outline|column-rule)/.test(prop)) return 'border';
  if (/shadow$/.test(prop) || prop === 'filter') return 'shadow';
  return 'any';
};

// ---- scales -------------------------------------------------------------------------------------

const px = (n, unit) => (unit === 'rem' ? n * 16 : n);
function lengthTokens(tokens, prefix) {
  const out = [];
  for (const [name, v] of tokens) {
    if (!name.startsWith(prefix)) continue;
    const m = /^(-?[\d.]+)(px|rem)$/.exec(v);
    if (m) out.push({ name, px: px(Number(m[1]), m[2]) });
  }
  return out;
}
function nearest(list, value, weights = {}) {
  let best = null;
  for (const t of list) {
    const d = Math.abs(t.px - value);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && (weights[t.name] || 0) > (weights[best.name] || 0))) best = { ...t, d };
  }
  return best;
}

// ---- main ---------------------------------------------------------------------------------------

const stylePath = path.join(ROOT, STYLE);
let styleText = fs.readFileSync(stylePath, 'utf8');
const block = tokenBlock(styleText);
const tokens = parseTokens(block.text);

const fsSteps = lengthTokens(tokens, '--fs-');
const radiusSteps = lengthTokens(tokens, '--radius-').filter((t) => t.px < 900);
const spaceSteps = lengthTokens(tokens, '--sp-');
const lhSteps = [...tokens].filter(([n, v]) => n.startsWith('--lh-') && /^[\d.]+$/.test(v)).map(([name, v]) => ({ name, px: Number(v) }));
const zLayers = [...tokens].filter(([n, v]) => n.startsWith('--z-') && /^-?\d+$/.test(v)).map(([name, v]) => ({ name, v: Number(v) })).sort((a, b) => a.v - b.v);
const fonts = [...tokens].filter(([n]) => n.startsWith('--font-')).map(([name, v]) => ({ name, v, first: v.split(',')[0].replace(/["']/g, '').trim().toLowerCase() }));
const elevations = [...tokens].filter(([n]) => /^--shadow-\d$/.test(n)).map(([name, v]) => ({ name, layer: parseShadowLayer(v) })).filter((e) => e.layer);

let colourTokens = [];
function refreshColourTokens() {
  colourTokens = [];
  for (const [name, v] of tokens) {
    if (/^--(fs|lh|sp|radius|z|font)-/.test(name) || /^--shadow-\d$/.test(name)) continue;
    const c = resolveColour(v, tokens);
    if (c) colourTokens.push({ name, rgba: c, role: roleOfToken(name) });
  }
}
refreshColourTokens();

const stats = { colour: 0, fontSize: 0, lineHeight: 0, fontFamily: 0, radius: 0, space: 0, z: 0, shadow: 0 };
const jumps = [];
const misses = [];
const changes = [];

function bestColour(rgba, role, { paletteOnly = false, classic = false } = {}) {
  const alpha = rgba[3];
  let best = null;
  for (const t of colourTokens) {
    if (paletteOnly && t.role !== 'palette') continue;
    // Classic's palette is Classic's alone, both ways.
    if (isClassicToken(t.name) !== classic) continue;
    const sameAlpha = Math.abs(t.rgba[3] - alpha) <= 0.015;
    if (!sameAlpha && t.rgba[3] < 1) continue;
    const d = deltaE(rgba, t.rgba);
    if (d > TOL) continue;
    // Prefer: a semantic token for this role, then exact alpha, then nearest.
    const rank = (t.role === role ? 0 : t.role === 'any' ? 1 : t.role === 'palette' ? 2 : 9) * 1000 + (sameAlpha ? 0 : 100) + d;
    if (t.role !== 'palette' && t.role !== 'any' && t.role !== role) continue;
    // Accents, stats and status colours only take near-exact matches, so a redesign of one
    // does not recolour art that merely sits close to it.
    if (t.role === 'any' && d > 1) continue;
    if (!best || rank < best.rank) best = { ...t, d, rank, sameAlpha };
  }
  if (!best) return null;
  if (best.sameAlpha) return { text: `var(${best.name})`, token: best.name, d: best.d };
  const pct = +(alpha * 100).toFixed(1);
  return { text: `color-mix(in srgb, var(${best.name}) ${pct}%, transparent)`, token: best.name, d: best.d };
}

function parseShadowLayer(s) {
  const t = s.trim();
  if (/var\(/.test(t)) return null;
  const inset = /\binset\b/.test(t);
  const cm = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b[a-z]+$)/.exec(t.replace(/\binset\b/, '').trim());
  const colour = cm ? parseColour(cm[0]) : null;
  const nums = t.replace(/\binset\b/, '').replace(cm ? cm[0] : '', '').trim().split(/\s+/).filter(Boolean);
  if (!colour || nums.length < 2 || nums.length > 4 || nums.some((n) => !/^-?[\d.]+(px)?$/.test(n))) return null;
  const [x, y, blur = 0, spread = 0] = nums.map((n) => parseFloat(n));
  return { inset, x, y, blur, spread, colour };
}
function splitTop(value) {
  const out = [];
  let depth = 0, last = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push([last, i]); last = i + 1; }
  }
  out.push([last, value.length]);
  return out;
}
function elevationFor(layer) {
  if (!layer || layer.inset || layer.x !== 0 || layer.blur <= 0 || layer.colour[3] >= 1 || oklch(layer.colour)[0] > 0.4) return null;
  for (const e of elevations) {
    const L = e.layer;
    if (L.spread !== layer.spread) continue;
    if (Math.abs(L.y - layer.y) > Math.max(1, 0.25 * L.y)) continue;
    if (Math.abs(L.blur - layer.blur) > Math.max(2, 0.25 * L.blur)) continue;
    if (Math.abs(L.colour[3] - layer.colour[3]) > 0.06) continue;
    return e;
  }
  return null;
}

function zFor(n) {
  let layer = null;
  for (const l of zLayers) if (l.v <= n) layer = l;
  if (!layer) return null;
  const off = n - layer.v;
  return off === 0 ? `var(${layer.name})` : `calc(var(${layer.name}) + ${off})`;
}

function fontFamilyToken(v) {
  const first = v.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  if (!first || first === 'inherit' || /var\(/.test(v)) return null;
  const f = fonts.find((t) => t.first === first);
  return f ? `var(${f.name})` : null;
}

// Transform one declaration; returns [{ start, end, text, kind, from }] relative to the value.
function transform(d, file) {
  const edits = [];
  const mv = d.maskedValue.replace(/!\s*important/g, (x) => ' '.repeat(x.length));
  const lit = (i, len, text, kind) => {
    const from = d.value.slice(i, i + len);
    if (allowed(file, d.selector, from)) return;
    edits.push({ start: i, end: i + len, text, kind, from });
  };
  const prop = d.prop;

  // z-index
  if (prop === 'z-index') {
    const m = /^(\s*)(-?\d+)(\s*)$/.exec(mv);
    if (m && Number(m[2]) !== 0) {
      const z = zFor(Number(m[2]));
      if (z) lit(m[1].length, m[2].length, z, 'z');
      else misses.push({ file, selector: d.selector, prop, value: d.value });
    }
    return edits;
  }

  // font-size, font shorthand
  const sizeEdit = (i, text, unitPx) => {
    const step = nearest(fsSteps, unitPx);
    if (!step) return;
    if (step.d > 1) jumps.push({ file, selector: d.selector, from: text, to: step.name, px: +unitPx.toFixed(2), d: +step.d.toFixed(2) });
    lit(i, text.length, `var(${step.name})`, 'fontSize');
  };
  const sizeAt = (offset, s) => {
    const m = /^(\s*)([\d.]+)(px|rem)(\s*)$/.exec(s);
    if (m) sizeEdit(offset + m[1].length, m[2] + m[3], px(Number(m[2]), m[3]));
  };
  const clampAt = (offset, s) => {
    // clamp(min, preferred, max): min and max only; the preferred term scales with the viewport.
    const m = /^clamp\(/.exec(s);
    if (!m) return false;
    const inner = s.slice(6, s.lastIndexOf(')'));
    const parts = splitTop(inner);
    if (parts.length !== 3) return true;
    for (const k of [0, 2]) sizeAt(offset + 6 + parts[k][0], inner.slice(parts[k][0], parts[k][1]));
    return true;
  };
  if (prop === 'font-size') {
    const t = mv.trim();
    const off = mv.indexOf(t);
    if (!clampAt(off, t)) sizeAt(0, mv);
    return edits;
  }
  if (prop === 'font') {
    if (/^\s*(inherit|initial|unset)\s*$/.test(mv)) return edits;
    // [style] [variant] [weight] size[/line-height] family
    const re = /(^|\s)((?:clamp\((?:[^()]|\([^()]*\))*\))|var\([^()]*(?:\([^()]*\))?[^()]*\)|[\d.]+(?:px|rem|em|%))(?:\/([\d.]+(?:px|rem|em|%)?|var\([^()]*\)))?(?=\s|$)/;
    const m = re.exec(mv);
    if (!m) return edits;
    const sizeStart = m.index + m[1].length;
    if (!clampAt(sizeStart, m[2])) sizeAt(sizeStart, m[2]);
    if (m[3] && /^[\d.]+$/.test(m[3])) {
      const lhStart = sizeStart + m[2].length + 1;
      const step = nearest(lhSteps, Number(m[3]));
      if (step && step.d <= 0.051) lit(lhStart, m[3].length, `var(${step.name})`, 'lineHeight');
    }
    const famStart = m.index + m[0].length;
    const fam = d.value.slice(famStart).trim();
    const tok = fontFamilyToken(fam);
    if (tok) lit(famStart + d.value.slice(famStart).indexOf(fam), fam.length, tok, 'fontFamily');
    return edits;
  }
  if (prop === 'line-height') {
    const m = /^(\s*)([\d.]+)(\s*)$/.exec(mv);
    if (m) {
      const step = nearest(lhSteps, Number(m[2]));
      if (step && step.d <= 0.051) lit(m[1].length, m[2].length, `var(${step.name})`, 'lineHeight');
    }
    return edits;
  }
  if (prop === 'font-family') {
    const t = d.value.trim();
    const tok = fontFamilyToken(t);
    if (tok) lit(d.value.indexOf(t), t.length, tok, 'fontFamily');
    return edits;
  }

  // radius
  if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) {
    for (const m of mv.matchAll(/(?<![\w.(-])([\d.]+)(px|rem|%)(?![\w])/g)) {
      const n = Number(m[1]);
      if (m[2] === '%') { if (n === 50 && !mv.includes('/')) lit(m.index, m[0].length, 'var(--radius-round)', 'radius'); continue; }
      const v = px(n, m[2]);
      if (v >= 99) { lit(m.index, m[0].length, 'var(--radius-pill)', 'radius'); continue; }
      if (v === 0) continue;
      const step = nearest(radiusSteps, v, RADIUS_WEIGHTS);
      if (step && step.d <= 2) lit(m.index, m[0].length, `var(${step.name})`, 'radius');
    }
    return edits;
  }

  // spacing
  if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/.test(prop)) {
    for (const m of mv.matchAll(/(?<![\w.(-])([\d.]+)(px|rem)(?![\w])/g)) {
      if (/calc\(|clamp\(|min\(|max\(/.test(mv)) break;
      const v = px(Number(m[1]), m[2]);
      if (v < 1.5) continue;
      const step = nearest(spaceSteps, v);
      if (step && step.d <= SPACE_TOL) lit(m.index, m[0].length, `var(${step.name})`, 'space');
    }
    return edits;
  }

  // shadows: whole layers to elevation tokens, then colours
  const shadowLayers = new Set();
  if (prop === 'box-shadow' && elevations.length) {
    for (const [a, b] of splitTop(mv)) {
      const raw = d.value.slice(a, b);
      const e = elevationFor(parseShadowLayer(raw));
      if (e) {
        const t = raw.trim();
        const s = a + raw.indexOf(t);
        if (!allowed(file, d.selector, t)) {
          edits.push({ start: s, end: s + t.length, text: `var(${e.name})`, kind: 'shadow', from: t });
          shadowLayers.add(s);
        }
      }
    }
  }

  // colours
  if (COLOUR_PROP.test(prop) && !/mask/.test(prop)) {
    const role = roleOfProp(prop);
    for (const c of colourLiterals(mv, true)) {
      if (edits.some((e) => c.index >= e.start && c.index < e.end)) continue;
      const from = d.value.slice(c.index, c.index + c.length);
      if (allowed(file, d.selector, from)) continue;
      const best = bestColour(c.rgba, role, { classic: file === CLASSIC_CSS });
      if (best) edits.push({ start: c.index, end: c.index + c.length, text: best.text, kind: 'colour', from, d: best.d, role });
      else misses.push({ file, selector: d.selector, prop, value: from, rgba: c.rgba, role });
    }
  }
  return edits;
}

let RADIUS_WEIGHTS = {};

function collect() {
  const out = [];
  for (const src of cssSources(ROOT)) {
    for (const r of src.regions) {
      const text = src.text.slice(r.start, r.end);
      for (const d of declarations(text, r.masked)) out.push({ ...d, file: src.file, abs: r.start });
    }
  }
  return out;
}

let decls = collect();

// Radius ties go to the step already used most.
for (const d of decls) {
  if (!/radius$/.test(d.prop)) continue;
  for (const m of d.maskedValue.matchAll(/([\d.]+)px/g)) {
    const s = radiusSteps.find((t) => t.px === Number(m[1]));
    if (s) RADIUS_WEIGHTS[s.name] = (RADIUS_WEIGHTS[s.name] || 0) + 1;
  }
}

// ---- palette generation (--add) -----------------------------------------------------------------

function paletteEntries(text) {
  const a = text.indexOf(PALETTE_START);
  const b = text.indexOf(PALETTE_END);
  if (a < 0 || b < a) throw new Error('token block has no palette:start / palette:end markers');
  return { a: a + PALETTE_START.length, b };
}

if (ADD) {
  // Seeds: raw colours written in the token block itself (semantic picks) become palette entries first.
  const counts = new Map();
  const classicCounts = new Map();
  const bump = (rgb, n = 1, into = counts) => { const k = rgb.map((v) => Math.round(v)).join(','); into.set(k, (into.get(k) || 0) + n); };
  const seeds = [];
  for (const [name, v] of tokens) {
    if (name.startsWith('--c-') || /^--(fs|lh|sp|radius|z|font)-/.test(name) || /^--shadow-\d$/.test(name)) continue;
    const c = parseColour(v);
    if (c) seeds.push(c.slice(0, 3).map((x) => Math.round(x)));
  }
  for (const d of decls) {
    if (!COLOUR_PROP.test(d.prop) || /mask/.test(d.prop)) continue;
    for (const c of colourLiterals(d.maskedValue, true)) {
      if (allowed(d.file, d.selector, d.value.slice(c.index, c.index + c.length))) continue;
      bump(c.rgba.slice(0, 3), 1, d.file === CLASSIC_CSS ? classicCounts : counts);
    }
  }
  const palette = colourTokens.filter((t) => t.role === 'palette' && !isClassicToken(t.name));
  const classicPalette = colourTokens.filter((t) => isClassicToken(t.name));
  const taken = new Set(tokens.keys());
  const added = [];
  const consider = (rgb, seed = false, classic = false) => {
    const list = classic ? classicPalette : palette;
    if (list.some((t) => deltaE(t.rgba, rgb) <= (seed ? 0.01 : TOL))) return;
    let name = paletteName(rgb, taken);
    if (classic) {
      const base = CLASSIC + name.slice(4);
      name = base;
      for (const sfx of 'bcdefghijklmnopqrstuvwxyz') { if (!taken.has(name)) break; name = base + sfx; }
    }
    taken.add(name);
    const entry = { name, rgba: [...rgb, 1], role: 'palette', classic };
    list.push(entry);
    added.push(entry);
  };
  for (const s of seeds) consider(s, true);
  for (const [k] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) consider(k.split(',').map(Number));
  for (const [k] of [...classicCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) consider(k.split(',').map(Number), false, true);
  if (added.length) {
    for (const e of added) tokens.set(e.name, hex(e.rgba));
    // Semantic tokens written as raw colours now point at their palette entry.
    for (const [name, v] of tokens) {
      if (name.startsWith('--c-') || /^--(fs|lh|sp|radius|z|font)-/.test(name)) continue;
      const c = parseColour(v);
      if (!c || c[3] !== 1) continue;
      const p = palette.find((t) => deltaE(t.rgba, c) < 0.01);
      if (p) tokens.set(name, `var(${p.name})`);
    }
    refreshColourTokens();
    console.log(`palette: ${added.length} new entries`);
  }
}

// ---- rewrite ------------------------------------------------------------------------------------

const byFile = new Map();
for (const d of decls) {
  const edits = transform(d, d.file);
  if (!edits.length) continue;
  const list = byFile.get(d.file) || [];
  for (const e of edits) {
    list.push({ start: d.abs + d.start + e.start, end: d.abs + d.start + e.end, text: e.text });
    stats[e.kind] = (stats[e.kind] || 0) + 1;
    changes.push({ file: d.file, selector: d.selector, prop: d.prop, kind: e.kind, from: e.from, to: e.text, d: e.d });
  }
  byFile.set(d.file, list);
}

function renderBlock(blockText) {
  // Rewrite each token's value in place (semantic links), then the palette region.
  let text = blockText.replace(/(--[\w-]+)(\s*:\s*)([^;]+);/g, (all, name, sep, v) => {
    if (!tokens.has(name) || name.startsWith('--c-')) return all;
    return `${name}${sep}${tokens.get(name)};`;
  });
  // New Classic entries go before classic:end; the hand-written ones stay as written.
  const ca = text.indexOf(CLASSIC_START);
  const cb = text.indexOf(CLASSIC_END);
  const fresh = [...tokens].filter(([n]) => isClassicToken(n) && (ca < 0 || !new RegExp(`${n}\\s*:`).test(text.slice(ca, cb))));
  if (fresh.length) {
    if (ca < 0 || cb < ca) throw new Error(`token block has no ${CLASSIC_START} / ${CLASSIC_END} markers`);
    const lines = fresh.map(([n, v]) => `  ${n}: ${v};\n`).join('');
    const at = text.lastIndexOf('\n', cb) + 1;
    text = text.slice(0, at) + lines + text.slice(at);
  }
  const { a, b } = paletteEntries(text);
  const entries = [...tokens].filter(([n]) => n.startsWith('--c-') && !isClassicToken(n)).map(([name, v]) => ({ name, v, c: parseColour(v) }));
  const order = ['white', 'grey', 'black', 'cream', 'sand', 'umber', 'brown', 'orange', 'gold', 'yellow', 'lime', 'sage', 'green', 'teal', 'sky', 'blue', 'slate', 'navy', 'violet', 'plum', 'mauve', 'pink', 'red'];
  const fam = (e) => (e.name === '--c-white' ? 'white' : e.name === '--c-black' ? 'black' : family(e.c));
  entries.sort((x, y) => order.indexOf(fam(x)) - order.indexOf(fam(y)) || oklch(y.c)[0] - oklch(x.c)[0] || x.name.localeCompare(y.name));
  const indent = '  ';
  let body = '\n';
  let last = '';
  for (const e of entries) {
    const f = fam(e);
    if (f !== last) { body += `${indent}/* ${f} */\n`; last = f; }
    body += `${indent}${e.name}: ${e.v};\n`;
  }
  return text.slice(0, a) + body + indent + text.slice(b);
}

if (WRITE) {
  for (const [file, list] of byFile) {
    const p = path.join(ROOT, file);
    let text = fs.readFileSync(p, 'utf8');
    list.sort((x, y) => y.start - x.start);
    for (const e of list) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    if (file === STYLE) styleText = text;
    else fs.writeFileSync(p, text);
  }
  const blk = tokenBlock(styleText);
  styleText = styleText.slice(0, blk.a) + renderBlock(blk.text) + styleText.slice(blk.b);
  fs.writeFileSync(stylePath, styleText);
}

console.log('changes', JSON.stringify(stats));
console.log('files', byFile.size);
if (jumps.length) {
  console.log(`font-size jumps over 1px: ${jumps.length}`);
  for (const j of jumps) console.log(`  ${j.file} ${j.selector.slice(0, 60)}: ${j.from} (${j.px}px) -> ${j.to} (${j.d}px)`);
}
if (misses.length) {
  console.log(`no token (${misses.length}):`);
  for (const m of misses.slice(0, 40)) console.log(`  ${m.file} ${m.selector.slice(0, 50)} ${m.prop}: ${m.value}`);
}
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ stats, jumps, misses, changes }, null, 1));
