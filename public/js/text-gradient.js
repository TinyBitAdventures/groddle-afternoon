/**
 * Pixi 7 text gradients (`fill: [colours]`, optional fillGradientStops) as a
 * Pixi 8 FillGradient: vertical, spanning the text's own bounds, stops even
 * unless given.
 * @param {number[]} colors
 * @param {number[]} [stops]
 */
export function verticalTextGradient(colors, stops) {
  const gradient = new globalThis.PIXI.FillGradient({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local' });
  colors.forEach((color, i) => gradient.addColorStop(stops ? stops[i] : i / Math.max(1, colors.length - 1), color));
  return gradient;
}
