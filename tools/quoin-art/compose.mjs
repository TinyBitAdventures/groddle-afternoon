/**
 * Compose quoin sheet frames from the hand-traced SVGs (svg/*.svg) and the
 * measured per-frame motion (frames.json) as one SVG document.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const FW = 40;
export const FH = 45;
export const COLS = 24;
export const TYPES = ['xp', 'mood', 'energy', 'currants', 'mystery', 'favor', 'time', 'qurazy'];

const fmt = (v) => String(+(+v).toFixed(4));

/** Inner markup of an SVG file with every id prefixed (ids, url(#..), href="#.."). */
export function svgInner(text, prefix) {
  const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return body
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`)
    .trim();
}

export function readSvg(name) {
  return readFileSync(join(HERE, 'svg', `${name}.svg`), 'utf8');
}

/** Set fill (and stroke, when it has one) on the element with the given (unprefixed) id. */
export function setFill(text, id, colour) {
  const tag = new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`);
  const m = tag.exec(text);
  if (!m || !/\sfill="/.test(m[0])) throw new Error(`no fill on #${id}`);
  const el = m[0].replace(/\sfill="[^"]*"/, ` fill="${colour}"`).replace(/\sstroke="[^"]*"/, ` stroke="${colour}"`);
  return text.slice(0, m.index) + el + text.slice(m.index + m[0].length);
}

/** Set stop-color on the <stop> with the given id. */
export function setStop(text, id, colour) {
  const re = new RegExp(`(<stop\\b[^>]*\\bid="${id}"[^>]*?)\\sstop-color="[^"]*"`);
  if (!re.test(text)) throw new Error(`no stop #${id}`);
  return text.replace(re, `$1 stop-color="${colour}"`);
}

/** The propeller markup for one type (defs), with its hub/stem palette. */
export function propellerDefs(type, palette) {
  let text = readSvg('propeller');
  text = setStop(text, 'hub-top', palette.hubTop);
  text = setStop(text, 'hub-bottom', palette.hubBottom);
  text = setStop(text, 'stem-dark', palette.stemDark);
  text = setStop(text, 'stem-light', palette.stemLight);
  return svgInner(text, `p-${type}-`);
}

/** Propeller instance: hub at (x, y), spin a (-1..1, sign = which blade leads). */
export function propellerUse(type, x, y, a) {
  const s = a < 0 ? -1 : 1;
  const t = `translate(${fmt(x)} ${fmt(y)})`;
  return `<use href="#p-${type}-stem" transform="${t} scale(${s} 1)"/>`
    + `<use href="#p-${type}-rotor" transform="${t} scale(${fmt(a)} 1)"/>`
    + `<use href="#p-${type}-hub" transform="${t} scale(${s} 1)"/>`;
}

/** One frame's markup in cell coordinates (0..40, 0..45). */
export function frameMarkup(type, f, data, { propeller = true, body = true } = {}) {
  const d = data.types[type];
  let out = '';
  if (propeller && d.propeller) {
    const p = d.propeller;
    out += propellerUse(type, p.x, p.y + p.dy[f], p.spin[f]);
  }
  if (body) {
    if (d.body.dy) out += `<use href="#b-${type}-body" transform="translate(0 ${d.body.dy[f]})"/>`;
    else {
      // Qurazy: its own copy per frame (spot colours change) under a measured matrix.
      let text = readSvg(type);
      for (const [id, colours] of Object.entries(d.spots || {})) text = setFill(text, id, colours[f]);
      out += `<g transform="matrix(${d.body.matrix[f].map(fmt).join(' ')})">${svgInner(text, `b-${type}-${f}-`)}</g>`;
    }
  }
  return out;
}

export function bodyDefs(type, data) {
  if (!data.types[type].body.dy) return '';
  return `<g id="b-${type}-body">${svgInner(readSvg(type), `b-${type}-`)}</g>`;
}

/**
 * The whole sheet (or a subset of cells) as an SVG document in 1x units;
 * render it at any pixel size. cells: [{ type, f, col, row, opts }].
 */
export function sheetSvg(data, cells, { cols = COLS, rows = TYPES.length } = {}) {
  const used = [...new Set(cells.map((c) => c.type))];
  const defs = used.map((t) => (data.types[t].propeller ? propellerDefs(t, data.types[t].propeller.palette) : '') + bodyDefs(t, data)).join('\n');
  const body = cells.map((c) => `<g transform="translate(${c.col * FW} ${c.row * FH})" clip-path="url(#cell)">${frameMarkup(c.type, c.f, data, c.opts)}</g>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cols * FW}" height="${rows * FH}" viewBox="0 0 ${cols * FW} ${rows * FH}">
<defs><clipPath id="cell"><rect width="${FW}" height="${FH}"/></clipPath>
${defs}
</defs>
${body}
</svg>
`;
}

/** Every cell of the full 24 x 8 sheet. */
export function allCells() {
  const cells = [];
  TYPES.forEach((type, row) => {
    for (let f = 0; f < COLS; f++) cells.push({ type, f, col: f, row });
  });
  return cells;
}
