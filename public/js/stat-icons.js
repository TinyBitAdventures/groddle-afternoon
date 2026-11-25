/**
 * #562: one icon and one colour per stat, read by every place that shows one:
 * the top bar's rings and counts (js/ui/topbar.js), the reward slugs under a
 * speech bubble (game.js speechSlugRow, js/speech-slugs.js), the amounts that
 * float up from the avatar, and the reward card (js/ui/moment-card.js). A
 * player saw an orange bolt for energy in the bar and a red battery in the
 * bubble; with one definition they cannot drift apart again.
 *
 * The icons are ours (Austin 2026-11-25, #699, G1308: he kept them over going
 * back to Tiny Speck's slug art): flat vectors in our palette, one shape per
 * stat, sharp at any pixel ratio. Each nods to the Tiny Speck original it
 * stands in for, which the classic skin still shows:
 * - energy: a bolt, as the client set beside the energy gauge
 *   (PlayerInfoUI.as 160-162, energy_bolt.png); slug_energy_*.png is a battery;
 * - mood: a face, as on the mood gauge (mood_emoticons.png) and slug_mood_*.png,
 *   smiling, flat or frowning;
 * - level and xp: a star on the stat's disc (slug_xp_*.png reads "xp");
 * - imagination (iMG): a pentagon with an "i", after img_icon.png, the "i" the
 *   client set beside an iMG amount (CultPickerUI.as 80-86). The cloud
 *   (imagination_button.png) stays the Imagination menu's button;
 * - currants: a coin with the colon sign's C and two strokes, after
 *   currants_icon.png, slug_currants_*.png and the cards' icon_currant vector,
 *   all a brown coin with a pale C crossed by two diagonal lines;
 * - favor: a star, after slug_favor_*.png.
 * The originals beside these sit in the website's compare section
 * (tools/made-art/compare.json).
 *
 * Each icon is a list of shapes in a 16 x 16 box, drawn as SVG for the page
 * (statIconSvg, statIconUrl) and with Pixi for the canvas (drawStatIcon). The
 * classic skin keeps the client's own slug art (js/speech-slugs.js drawSlugIcon).
 */

/** The stats' colours; style.css keeps the same values as --energy, --mood, --xp, --imagination, --currants. */
export const STAT_COLORS = Object.freeze({
  energy: '#e8862a',
  mood: '#4fa23a',
  xp: '#3e86d6',
  imagination: '#7e57c2',
  currants: '#b8860b',
  favor: '#8c2f55',
});

/** The CSS custom property each stat's colour is published as (applyStatColors). */
export const STAT_CSS_VARS = Object.freeze({
  energy: '--energy',
  mood: '--mood',
  xp: '--xp',
  imagination: '--imagination',
  currants: '--currants',
});

export const STAT_LABELS = Object.freeze({
  energy: 'Energy', mood: 'Mood', xp: 'XP', imagination: 'iMG', currants: 'Currants', favor: 'Favor',
});

/** Mood faces: the gauge's low and very low (js/vitals.js levels) frown; a mood loss frowns too. */
export const MOOD_FACES = Object.freeze(['ok', 'low', 'critical']);

const hexNum = (hex) => parseInt(String(hex).replace('#', ''), 16);
const numHex = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

/** Mix two colours (0 = a, 1 = b). */
export function mixColor(a, b, t) {
  const x = hexNum(a);
  const y = hexNum(b);
  const ch = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return numHex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}

/** WCAG relative-luminance contrast of two colours. */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    const n = hexNum(hex);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A stat's paints: `color` its icon and ring, `tint` a gain chip's fill, `ink` the chip's number
 * (4.5:1 on the tint), `float` an amount floating over the street. A loss of energy or mood keeps
 * the client's red chip (Slug.as 58-61, energy_neg_bg_color / mood_neg_bg_color).
 */
export const STAT_LOSS = Object.freeze({ tint: '#efc6c1', ink: '#962f25' });

function paints(color) {
  return Object.freeze({
    color,
    tint: mixColor(color, '#ffffff', 0.72),
    ink: mixColor(color, '#000000', 0.5),
    float: mixColor(color, '#ffffff', 0.35),
  });
}

export const STAT_PAINTS = Object.freeze(Object.fromEntries(Object.entries(STAT_COLORS).map(([k, c]) => [k, paints(c)])));

/** The paints for one stat's chip: its own, or the loss red for energy and mood going down. */
export function statChipPaints(type, amount = 1) {
  const p = STAT_PAINTS[type] || STAT_PAINTS.imagination;
  if (Number(amount) < 0 && (type === 'energy' || type === 'mood')) return { ...p, tint: STAT_LOSS.tint, ink: STAT_LOSS.ink };
  return p;
}

// The rings' white glyphs were drawn on a 12 px grid inside a 16 px disc (3 px in, 10/12 scale).
const g = (v) => Math.round((3 + (v * 10) / 12) * 100) / 100;
const gp = (pts) => pts.map(g);

const WHITE = '#ffffff';
const disc = (color) => ['circle', 8, 8, 8, { fill: color }];
const eyes = [['circle', g(4), g(4.8), 0.8, { fill: WHITE }], ['circle', g(8), g(4.8), 0.8, { fill: WHITE }]];
const MOUTHS = {
  ok: ['bezier', gp([3.6, 7.4, 4.9, 8.8, 7.1, 8.8, 8.4, 7.4]), { stroke: WHITE, width: 1.05 }],
  low: ['line', gp([3.8, 8, 8.2, 8]), { stroke: WHITE, width: 1.05 }],
  critical: ['bezier', gp([3.6, 8.6, 4.9, 7.2, 7.1, 7.2, 8.4, 8.6]), { stroke: WHITE, width: 1.05 }],
};
// The ring badges' bolt and star (index.html until #562), as points.
const BOLT = gp([7, 0.5, 2, 7, 5.2, 7, 4.6, 11.5, 10, 4.8, 6.6, 4.8]);
const STAR = gp([6, 0.8, 7.6, 4.1, 11.2, 4.6, 8.6, 7.1, 9.2, 10.7, 6, 9, 2.8, 10.7, 3.4, 7.1, 0.8, 4.6, 4.4, 4.1]);

/** The currant coin's two strokes (the colon sign's), as [x0, y0, x1, y1]: parallel, bottom left to top right. */
export const CURRANT_STROKES = Object.freeze([
  Object.freeze([6.4, 13, 8.4, 2.7]),
  Object.freeze([8.8, 12.8, 10.7, 3]),
]);

function starPoints(cx, cy, outer, inner, points = 5) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(Math.round((cx + Math.cos(a) * r) * 100) / 100, Math.round((cy + Math.sin(a) * r) * 100) / 100);
  }
  return out;
}

/**
 * One stat's icon as shapes in a 16 x 16 box: ['circle', cx, cy, r, paint], ['poly', points, paint],
 * ['rect', x, y, w, h, radius, paint], ['line', [x0, y0, x1, y1], paint], ['bezier', [x0, y0, c1x,
 * c1y, c2x, c2y, x1, y1], paint], ['arc', cx, cy, r, from, to, paint]. A paint is { fill } or
 * { stroke, width }. `variant` is the mood face ('ok', 'low', 'critical'); a mood loss frowns.
 */
export function statIconShapes(type, { variant = '', negative = false } = {}) {
  const c = STAT_COLORS[type];
  if (type === 'energy') return [disc(c), ['poly', BOLT, { fill: WHITE }]];
  if (type === 'mood') {
    const face = MOOD_FACES.includes(variant) ? variant : negative ? 'critical' : 'ok';
    return [disc(c), ...eyes, MOUTHS[face]];
  }
  if (type === 'xp') return [disc(c), ['poly', STAR, { fill: WHITE }]];
  if (type === 'imagination') {
    // A rounded pentagon with a pale "i" (after img_icon.png).
    const pent = [8, 1.4, 14.6, 6, 12.4, 14, 3.6, 14, 1.4, 6];
    return [
      ['poly', pent, { fill: c }],
      ['poly', pent, { stroke: c, width: 1.6 }],
      ['circle', 8, 4.9, 1.35, { fill: WHITE }],
      ['rect', 6.9, 7.1, 2.2, 5.3, 0.6, { fill: WHITE }],
    ];
  }
  if (type === 'currants') {
    // A coin with the colon sign (₵): a cream C crossed by two parallel strokes that run past it
    // top and bottom, the right one into the C's mouth, as Tiny Speck's coins drew it. Placed so
    // the strokes stay apart at 18 px (the top bar).
    const cream = '#f6eedc';
    return [
      ['circle', 8, 8, 8, { fill: mixColor(c, '#000000', 0.45) }],
      ['circle', 8, 7.8, 7.2, { fill: mixColor(c, '#000000', 0.25) }],
      ['circle', 8, 7.8, 5.8, { fill: c }],
      ['arc', 7.5, 7.9, 3.4, Math.PI * 0.3, Math.PI * 1.7, { stroke: cream, width: 1.9 }],
      ['line', CURRANT_STROKES[0], { stroke: cream, width: 1.2 }],
      ['line', CURRANT_STROKES[1], { stroke: cream, width: 1.2 }],
    ];
  }
  if (type === 'favor') {
    // A star (after slug_favor_*.png).
    const pts = starPoints(8, 8.6, 7.4, 3.2);
    return [['poly', pts, { fill: c }], ['poly', pts, { stroke: c, width: 1, join: 'round' }]];
  }
  return [];
}

const n = (v) => String(Math.round(v * 100) / 100);

function arcEnds(cx, cy, r, from, to) {
  return [cx + Math.cos(from) * r, cy + Math.sin(from) * r, cx + Math.cos(to) * r, cy + Math.sin(to) * r];
}

function svgPaint(p) {
  if (p.fill) return `fill="${p.fill}"`;
  return `fill="none" stroke="${p.stroke}" stroke-width="${n(p.width)}" stroke-linecap="round" stroke-linejoin="round"`;
}

/** One shape as an SVG element. The disc behind a ring glyph carries class "stat-icon-bg" (style.css recolours it when low). */
function svgShape(shape, bgClass) {
  const [op] = shape;
  const paint = shape[shape.length - 1];
  const cls = bgClass ? ' class="stat-icon-bg"' : '';
  if (op === 'circle') return `<circle${cls} cx="${n(shape[1])}" cy="${n(shape[2])}" r="${n(shape[3])}" ${svgPaint(paint)}/>`;
  if (op === 'poly') return `<polygon${cls} points="${shape[1].map(n).join(' ')}" ${svgPaint(paint)}/>`;
  if (op === 'rect') return `<rect x="${n(shape[1])}" y="${n(shape[2])}" width="${n(shape[3])}" height="${n(shape[4])}" rx="${n(shape[5])}" ${svgPaint(paint)}/>`;
  if (op === 'line') {
    const [x0, y0, x1, y1] = shape[1];
    return `<path d="M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}" ${svgPaint(paint)}/>`;
  }
  if (op === 'bezier') {
    const p = shape[1].map(n);
    return `<path d="M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}" ${svgPaint(paint)}/>`;
  }
  if (op === 'arc') {
    const [, cx, cy, r, from, to] = shape;
    const [x0, y0, x1, y1] = arcEnds(cx, cy, r, from, to);
    const large = to - from > Math.PI ? 1 : 0;
    return `<path d="M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${large} 1 ${n(x1)} ${n(y1)}" ${svgPaint(paint)}/>`;
  }
  return '';
}

/** The shapes of a stat icon as SVG elements, without the <svg> around them. */
export function statIconInner(type, opts = {}) {
  const shapes = statIconShapes(type, opts);
  return shapes.map((s, i) => svgShape(s, i === 0 && (type === 'energy' || type === 'mood' || type === 'xp'))).join('');
}

/** A stat icon as a whole <svg> (16 x 16 box, drawn at `size` px). */
export function statIconSvg(type, { size = 16, title = '', ...opts } = {}) {
  const label = title ? `<title>${title}</title>` : '';
  const aria = title ? 'role="img"' : 'aria-hidden="true"';
  return `<svg class="stat-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" ${aria} data-stat-svg="${type}">${label}${statIconInner(type, opts)}</svg>`;
}

/** A stat icon as an image address (the reward card's <img>). */
export function statIconUrl(type, opts = {}) {
  return `data:image/svg+xml,${encodeURIComponent(statIconSvg(type, opts))}`;
}

const pixiColor = (hex) => hexNum(hex);

/**
 * Draws one stat icon into a Pixi Graphics at (0, 0), 16 x 16. Every path is one list of
 * points with none repeated (G897: a repeated point gave Pixi's stroke NaN vertices).
 */
export function drawStatIcon(gr, type, opts = {}) {
  for (const shape of statIconShapes(type, opts)) {
    const [op] = shape;
    const paint = shape[shape.length - 1];
    if (op === 'circle') gr.circle(shape[1], shape[2], shape[3]);
    else if (op === 'poly') gr.poly(shape[1], true);
    else if (op === 'rect') gr.roundRect(shape[1], shape[2], shape[3], shape[4], shape[5]);
    else if (op === 'line') gr.moveTo(shape[1][0], shape[1][1]).lineTo(shape[1][2], shape[1][3]);
    else if (op === 'bezier') {
      const p = shape[1];
      gr.moveTo(p[0], p[1]).bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    } else if (op === 'arc') {
      // As a polyline: Pixi's arc() joins on from the pen's last point.
      const [, cx, cy, r, from, to] = shape;
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) gr.moveTo(x, y); else gr.lineTo(x, y);
      }
    }
    if (paint.fill) gr.fill({ color: pixiColor(paint.fill) });
    else gr.stroke({ width: paint.width, color: pixiColor(paint.stroke), cap: 'round', join: 'round' });
  }
  return gr;
}

/**
 * Publishes the stat colours to the page (on <html>, as --energy and the rest, plus --<stat>-tint
 * and --<stat>-ink), so the stylesheet's rings and chips paint from this module.
 */
export function applyStatColors(doc) {
  const root = doc?.documentElement;
  if (!root?.style?.setProperty) return;
  for (const [type, name] of Object.entries(STAT_CSS_VARS)) {
    const p = STAT_PAINTS[type];
    root.style.setProperty(name, p.color);
    root.style.setProperty(`${name}-tint`, p.tint);
    root.style.setProperty(`${name}-ink`, p.ink);
  }
}

/** Fills every [data-stat-icon] element under `doc` with its stat's icon (the top bar's badges and counts). */
export function paintStatIcons(doc) {
  const els = doc?.querySelectorAll?.('[data-stat-icon]') || [];
  for (const el of els) {
    const type = el.dataset.statIcon;
    if (!STAT_COLORS[type]) continue;
    const variant = el.dataset.statVariant || '';
    if (el.dataset.statPainted === `${type}:${variant}`) continue;
    el.innerHTML = statIconSvg(type, { variant });
    el.dataset.statPainted = `${type}:${variant}`;
  }
}
