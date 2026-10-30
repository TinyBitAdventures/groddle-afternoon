/**
 * Traces Tiny Speck's new-day mountain silhouette (new_day_mountains.png, 857x52, CC0)
 * into an SVG outline, so the New Day screen draws it sharp at any width.
 * node tools/newday/trace.mjs [--check]
 */
import { decodePng } from './decode.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../../public/assets/ui/newday/', import.meta.url));
const src = `${dir}new_day_mountains.png`;
const out = `${dir}new_day_mountains.svg`;
const check = process.argv.includes('--check');
const { w, h, px } = decodePng(src);
const A = (x, y) => px[(y * w + x) * 4 + 3];
const tops = [];
for (let x = 0; x < w; x++) {
  let y = 0;
  while (y < h && A(x, y) === 0) y++;
  // Sub-pixel edge: the first partly covered row adds its uncovered share.
  const top = y >= h ? h : y + (1 - A(x, y) / 255);
  tops.push(top);
}
// Drop points that sit on a straight line with their neighbours (keeps the outline, shrinks the file).
const pts = tops.map((t, x) => [x + 0.5, t]);
const keep = [pts[0]];
for (let i = 1; i < pts.length - 1; i++) {
  const [a, b, c] = [keep[keep.length - 1], pts[i], pts[i + 1]];
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(cross) > 0.08) keep.push(b);
}
keep.push(pts[pts.length - 1]);
const f = (n) => +n.toFixed(2);
const d = `M0 ${h}L0 ${f(tops[0])}` + keep.map(([x, y]) => `L${f(x)} ${f(y)}`).join('') + `L${w} ${f(tops[w - 1])}L${w} ${h}Z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c414a"/><stop offset="1" stop-color="#4a414c"/></linearGradient></defs><path fill="url(#g)" d="${d}"/></svg>\n`;
if (check) {
  if (readFileSync(out, 'utf8') !== svg) {
    console.error('new_day_mountains.svg is stale: run node tools/newday/trace.mjs');
    process.exit(1);
  }
  console.log('new_day_mountains.svg is current');
} else {
  writeFileSync(out, svg);
  console.log(`wrote new_day_mountains.svg (${keep.length} points, ${svg.length} bytes)`);
}
