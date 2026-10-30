// Where the game's CSS lives, and its declarations, for the design tokens (tools/tokens/convert.mjs)
// and their lint (tests/design-tokens.test.js).
//
// Sources: public/style.css, the stylesheets in public/css/ (public/css/classic.css, the Classic
// interface), and every CSS template literal in public/*.js and public/js/**
// (the stylesheets modules inject with a <style> element), plus the online page's style block
// in tools/play-online/build.mjs. A literal counts as CSS when it holds a `selector { prop: value }`
// rule once `${...}` is masked. Inline style strings (style="...", cssText) are not covered.
//
// declarations(text) walks a CSS text with comments, strings, url(...) and `${...}` masked, and
// returns each declaration's property, value, value span and selector, so an edit at those offsets
// lands in the original text.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const TOKENS_START = '/* == tokens:start';
export const TOKENS_END = '/* == tokens:end == */';

function walkFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const q = path.join(dir, f);
    const s = fs.statSync(q);
    if (s.isDirectory()) {
      if (!/^(node_modules|assets|vendor|online)$/.test(f)) walkFiles(q, out);
    } else if (/\.m?js$/.test(f)) out.push(q);
  }
  return out;
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

// Same-length mask: comments, quoted strings and url(...) bodies become spaces (newlines kept).
export function maskCss(text) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  out = out.replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/g, (m) => 'url(' + blank(m.slice(4, -1)) + ')');
  out = out.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + blank(m.slice(1, -1)) + m[0]);
  return out;
}

export function declarations(text, masked = maskCss(text)) {
  const out = [];
  const re = /(^|[{;])(\s*)(--[\w-]+|-?[a-zA-Z][a-zA-Z-]*)(\s*):([^;{}]*)(?=;|\}|$)/g;
  for (const m of masked.matchAll(re)) {
    const propStart = m.index + m[1].length + m[2].length;
    const valueStart = propStart + m[3].length + m[4].length + 1;
    const valueEnd = valueStart + m[5].length;
    // The rule's selector: text from the previous block boundary up to the opening brace.
    const before = masked.slice(0, propStart);
    const open = before.lastIndexOf('{');
    const close = before.lastIndexOf('}');
    let selector = '';
    if (open > close) {
      const prev = Math.max(masked.lastIndexOf('}', open - 1), masked.lastIndexOf('{', open - 1), masked.lastIndexOf(';', open - 1));
      selector = masked.slice(prev + 1, open).trim().replace(/\s+/g, ' ');
    }
    out.push({
      prop: m[3].toLowerCase(),
      value: text.slice(valueStart, valueEnd),
      maskedValue: masked.slice(valueStart, valueEnd),
      start: valueStart,
      end: valueEnd,
      selector,
    });
  }
  return out;
}

const looksLikeCss = (masked) => /[^{}]\{\s*(--[\w-]+|-?[a-z][a-z-]*)\s*:[^{}]*\}/.test(masked);

function walkAst(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walkAst(c, fn);
    else if (v && typeof v.type === 'string') walkAst(v, fn);
  }
}

// CSS regions of one JS source: [{ start, end, masked }] where masked is the region's text with
// `${...}` blanked (same length), so offsets map straight back to the file.
export function jsCssRegions(src) {
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  } catch {
    return [];
  }
  const regions = [];
  walkAst(ast, (n) => {
    if (n.type === 'TemplateLiteral') {
      const start = n.start + 1;
      const end = n.end - 1;
      let masked = src.slice(start, end);
      for (const e of n.expressions) {
        // `${` before and `}` after the expression
        const a = e.start - 2 - start;
        const b = e.end + 1 - start;
        masked = masked.slice(0, a) + blank(src.slice(e.start - 2, e.end + 1)).replace(/ /g, '_') + masked.slice(b);
      }
      if (looksLikeCss(masked)) regions.push({ start, end, masked });
    } else if (n.type === 'Literal' && typeof n.value === 'string' && n.raw.length > 12) {
      const start = n.start + 1;
      const end = n.end - 1;
      const masked = src.slice(start, end);
      if (looksLikeCss(masked)) regions.push({ start, end, masked });
    }
  });
  return regions;
}

// Every CSS source of the game: [{ file (repo-relative), text (whole file), regions: [{ start, end, masked }] }].
// For style.css the token block is left out of the regions.
export function cssSources(root) {
  const out = [];
  const stylePath = 'public/style.css';
  const style = fs.readFileSync(path.join(root, stylePath), 'utf8');
  const a = style.indexOf(TOKENS_START);
  const b = style.indexOf(TOKENS_END);
  const regions = [];
  if (a >= 0 && b > a) {
    regions.push({ start: 0, end: a });
    regions.push({ start: b + TOKENS_END.length, end: style.length });
  } else regions.push({ start: 0, end: style.length });
  out.push({ file: stylePath, text: style, regions: regions.map((r) => ({ ...r, masked: maskCss(style.slice(r.start, r.end)) })) });
  const cssDir = path.join(root, 'public/css');
  if (fs.existsSync(cssDir)) {
    for (const f of fs.readdirSync(cssDir).filter((x) => x.endsWith('.css')).sort()) {
      const file = `public/css/${f}`;
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      out.push({ file, text, regions: [{ start: 0, end: text.length, masked: maskCss(text) }] });
    }
  }
  const js = [
    ...fs.readdirSync(path.join(root, 'public')).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(root, 'public', f)),
    ...walkFiles(path.join(root, 'public/js')),
    path.join(root, 'tools/play-online/build.mjs'),
  ];
  for (const f of js) {
    const text = fs.readFileSync(f, 'utf8');
    const rs = jsCssRegions(text).map((r) => ({ ...r, masked: maskCss(r.masked) }));
    if (rs.length) out.push({ file: path.relative(root, f), text, regions: rs });
  }
  return out;
}

// Declarations of every source, with file-absolute offsets.
export function allDeclarations(root) {
  const rows = [];
  for (const src of cssSources(root)) {
    for (const r of src.regions) {
      const text = src.text.slice(r.start, r.end);
      for (const d of declarations(text, r.masked)) rows.push({ ...d, file: src.file, start: d.start + r.start, end: d.end + r.start });
    }
  }
  return rows;
}

// The token block of style.css as a Map name -> raw value.
export function readTokens(root) {
  const style = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  const a = style.indexOf(TOKENS_START);
  const b = style.indexOf(TOKENS_END);
  const map = new Map();
  if (a < 0 || b < a) return map;
  const block = style.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}
