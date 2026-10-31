/**
 * How a garden is put together from Tiny Speck's garden art (garden_new.swf,
 * CC0 glitch-items; the pieces and their origins are js/garden-art.js, made by
 * tools/garden-art/build.mjs).
 *
 * The original client (glitch-client, com/tinyspeck/engine):
 * - view/ui/garden/GardenView.as build (78-159): the bed is the asset
 *   `<style>_<rows>_<cols>`, or else `<style>_<rows>_<n>` repeated every
 *   BASE_PADD_RIGHT x n px, where the garden's style is `<style>_<n>`; a style
 *   with no asset ("none") has no bed. Plots go on top, back row first, each at
 *   x = PLOT_PADD_LEFT + (plot_width / 2 + PLOT_PADD_RIGHT) x row + BASE_PADD_RIGHT x col,
 *   y = (plot_height + PLOT_PADD_TOP) x (rows - 1 - row), row 0 at the front.
 * - view/ui/garden/GardenPlotView.as buildPlot (40-95): the `wet` or `dry` base,
 *   then by mature_level the seeds, the seedling (wet, dry or fertilized), the
 *   grown `garden_<crop>`, the harvested patch (wet or dry) or `depleted`, each
 *   tried first with the garden type in front (`herb_seedling_wet`), all at the
 *   plot's own (0, 0).
 * - items/garden_new.js onCultivated: home gardens use polcrop_<rows> or
 *   polherb_<rows>. A street garden's style was set by hand per instance and the
 *   instances are not in the CC0 data: street crop gardens use strip_1 here and
 *   street herb gardens shimla_1 (the log-edged beds named after the Shimla Mirch
 *   herb gardens).
 *
 * Remake plot keys are "c-r", c from 1 at the left, r from 1 at the back
 * (js/garden.js createGarden), so the client's row is rows - r.
 */
import { GARDEN_ART } from './garden-art.js?v=c947ccf4';

/**
 * The size gardens are drawn at: items/garden_new.js adjusted_scale 0.7, and
 * glitch-client data/item/Item.as `scale` gives garden_new (and only it) its
 * adjusted_scale. GardenView.as and GardenPlotView.as scale the bed, the plot
 * pieces and every offset by it, so a bed stays inside its proto's
 * placement width (crop medium: 457 x 0.7 = 320 of 356).
 */
export const GARDEN_SCALE = 0.7;

/** GardenView.as constants at item scale 1. */
export const BASE_PADD_RIGHT = 85;
export const PLOT_PADD_LEFT = 7;
export const PLOT_PADD_RIGHT = 5;
export const PLOT_PADD_TOP = -3;

/**
 * GardenView.build at an item scale: each offset `int` (AS3 truncates), and the
 * plot's base_width / base_height, the `dry` base scaled, kept as int.
 */
export function gardenMetrics(scale = GARDEN_SCALE) {
  return {
    scale,
    baseRight: Math.trunc(BASE_PADD_RIGHT * scale),
    plotLeft: Math.trunc(PLOT_PADD_LEFT * scale),
    plotRight: Math.trunc(PLOT_PADD_RIGHT * scale),
    plotTop: Math.trunc(PLOT_PADD_TOP * scale),
    plotW: Math.trunc(GARDEN_ART.dry.w0 * scale),
    plotH: Math.trunc(GARDEN_ART.dry.h0 * scale),
  };
}

/** A plot's base as drawn (56 x 16 at 0.7). */
export const PLOT_W = gardenMetrics().plotW;
export const PLOT_H = gardenMetrics().plotH;

/** A piece's frame: { url, x, y, w, h (its cell), ox, oy (top-left from the origin), x0, y0, w0, h0 }. */
export function gardenFrame(name) {
  return GARDEN_ART[name] || null;
}

/** The bed style for a garden (items/garden_new.js styles). */
export function gardenStyle({ gardenType = 'default', rows = 2, home = false, style = '' } = {}) {
  if (style) return String(style);
  const herb = gardenType === 'herb';
  if (home) return `${herb ? 'polherb' : 'polcrop'}_${rows}`;
  return herb ? 'shimla_1' : 'strip_1';
}

/** GardenView.as build: the bed pieces for a style, at the garden's origin (x in scaled px). */
export function bedPieces(style, cols, rows, scale = GARDEN_SCALE) {
  const chunks = String(style || 'none').split('_');
  const name = chunks[0];
  const styleCols = chunks.length > 1 ? Number(chunks[1]) || 1 : 1;
  const whole = `${name}_${rows}_${cols}`;
  if (GARDEN_ART[whole]) return [{ name: whole, x: 0, y: 0 }];
  const tile = `${name}_${rows}_${styleCols}`;
  if (!GARDEN_ART[tile]) return [];
  const step = gardenMetrics(scale).baseRight * styleCols;
  const out = [];
  for (let i = 0; i < cols / styleCols; i++) out.push({ name: tile, x: i * step, y: 0 });
  return out;
}

/** Where plot "c-r" sits (its base's origin) in garden space, scaled px. */
export function plotOrigin(key, cols, rows, scale = GARDEN_SCALE) {
  const m = gardenMetrics(scale);
  const [c, r] = String(key).split('-').map(Number);
  const row = rows - r;
  const col = c - 1;
  return {
    x: m.plotLeft + (m.plotW / 2 + m.plotRight) * row + m.baseRight * col,
    y: (m.plotH + m.plotTop) * (rows - 1 - row),
  };
}

/**
 * The whole garden: bed pieces, each plot's origin, and the box the bed and the
 * plot bases cover (plants left out, so a garden does not move as it grows), all
 * in scaled px; each piece is drawn at `scale` about its origin.
 */
export function gardenLayout({ cols = 4, rows = 2, style = 'none', scale = GARDEN_SCALE } = {}) {
  const beds = bedPieces(style, cols, rows, scale);
  const plots = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) plots.push({ key: `${c}-${r}`, c, r, ...plotOrigin(`${c}-${r}`, cols, rows, scale) });
  }
  const base = GARDEN_ART.dry;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (f, x, y) => {
    x0 = Math.min(x0, x + f.x0 * scale); y0 = Math.min(y0, y + f.y0 * scale);
    x1 = Math.max(x1, x + (f.x0 + f.w0) * scale); y1 = Math.max(y1, y + (f.y0 + f.h0) * scale);
  };
  for (const b of beds) add(GARDEN_ART[b.name], b.x, b.y);
  for (const p of plots) add(base, p.x, p.y);
  return { style, cols, rows, ...gardenMetrics(scale), beds, plots, box: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } };
}

/**
 * Half the drawn width of a garden (bed and plot bases), rounded up: what a home
 * cultivation keeps clear around its x (js/home-cultivation.js footprint).
 */
export function gardenHalfWidth({ gardenType = 'default', cols = 4, rows = 2, home = false, style = '', scale = GARDEN_SCALE } = {}) {
  return Math.ceil(gardenLayout({ cols, rows, style: gardenStyle({ gardenType, rows, home, style }), scale }).box.w / 2);
}

/** GardenPlotView mature_level for a remake plot (include/garden.js getPlotStatus). */
export function matureLevel(plot, { depleted = false } = {}) {
  switch (plot?.state) {
    case 'seeds': return 1;
    case 'shoots': return 2;
    case 'crop': return 3;
    case 'dirty': return 4;
    default: return depleted ? 5 : 0;
  }
}

/**
 * GardenPlotView buildPlot: the base and the growing piece (or null) for a plot.
 * @param {object} plot js/garden.js plot
 * @param {{ gardenType?: string, cropId?: string, depleted?: boolean }} [opts]
 */
export function plotPieces(plot, { gardenType = 'default', cropId = '', depleted = false } = {}) {
  const wet = Boolean(plot?.wet);
  const type = gardenType === 'herb' ? 'herb' : 'default';
  const pick = (name) => (GARDEN_ART[`${type}_${name}`] ? `${type}_${name}` : GARDEN_ART[name] ? name : null);
  let grow = null;
  switch (matureLevel(plot, { depleted })) {
    case 1: grow = pick('seeds'); break;
    case 2: grow = pick(plot.fertilized ? 'seedling_fertilized' : wet ? 'seedling_wet' : 'seedling_dry'); break;
    case 3: grow = GARDEN_ART[`garden_${cropId}`] ? `garden_${cropId}` : null; break;
    case 4: grow = pick(wet ? 'harvested_wet' : 'harvested_dry'); break;
    case 5: grow = pick('depleted'); break;
    default: break;
  }
  return { base: wet ? 'wet' : 'dry', grow };
}
