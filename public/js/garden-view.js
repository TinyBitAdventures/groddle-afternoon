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

/** GardenView.as constants at item scale 1. */
export const BASE_PADD_RIGHT = 85;
export const PLOT_PADD_LEFT = 7;
export const PLOT_PADD_RIGHT = 5;
export const PLOT_PADD_TOP = -3;
/** GardenPlotView base_width / base_height: the `dry` base, kept as int (80.9 x 23). */
export const PLOT_W = Math.trunc(GARDEN_ART.dry.w0);
export const PLOT_H = Math.trunc(GARDEN_ART.dry.h0);

/** A piece's frame: [url, x, y, w, h, ox, oy] (1x px; ox, oy its top-left from the origin). */
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

/** GardenView.as build: the bed pieces for a style, at the garden's origin. */
export function bedPieces(style, cols, rows) {
  const chunks = String(style || 'none').split('_');
  const name = chunks[0];
  const styleCols = chunks.length > 1 ? Number(chunks[1]) || 1 : 1;
  const whole = `${name}_${rows}_${cols}`;
  if (GARDEN_ART[whole]) return [{ name: whole, x: 0, y: 0 }];
  const tile = `${name}_${rows}_${styleCols}`;
  if (!GARDEN_ART[tile]) return [];
  const out = [];
  for (let i = 0; i < cols / styleCols; i++) out.push({ name: tile, x: i * BASE_PADD_RIGHT * styleCols, y: 0 });
  return out;
}

/** Where plot "c-r" sits (its base's origin) in garden space. */
export function plotOrigin(key, cols, rows) {
  const [c, r] = String(key).split('-').map(Number);
  const row = rows - r;
  const col = c - 1;
  return {
    x: PLOT_PADD_LEFT + (PLOT_W / 2 + PLOT_PADD_RIGHT) * row + BASE_PADD_RIGHT * col,
    y: (PLOT_H + PLOT_PADD_TOP) * (rows - 1 - row),
  };
}

/**
 * The whole garden: bed pieces, each plot's origin, and the box the bed and the
 * plot bases cover (plants left out, so a garden does not move as it grows).
 */
export function gardenLayout({ cols = 4, rows = 2, style = 'none' } = {}) {
  const beds = bedPieces(style, cols, rows);
  const plots = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) plots.push({ key: `${c}-${r}`, c, r, ...plotOrigin(`${c}-${r}`, cols, rows) });
  }
  const base = GARDEN_ART.dry;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  for (const b of beds) {
    const f = GARDEN_ART[b.name];
    add(b.x + f.x0, b.y + f.y0, b.x + f.x0 + f.w0, b.y + f.y0 + f.h0);
  }
  for (const p of plots) add(p.x + base.x0, p.y + base.y0, p.x + base.x0 + base.w0, p.y + base.y0 + base.h0);
  return { style, cols, rows, beds, plots, box: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } };
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
