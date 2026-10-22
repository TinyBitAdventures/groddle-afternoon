// Pixel-compare two perf-harness screenshot sets.
//
// Usage: node tools/perf/pixel-diff.mjs <labelA> <labelB> [--shots=shots/perf]
//          [--threshold=24] [--json=out.json]
// Compares every <labelA>-<route>.png with <labelB>-<route>.png (same
// suffix), counts pixels whose largest channel difference is above the
// threshold, and writes <labelB>-<route>.diff.png: the A image dimmed, with
// differing pixels in magenta. Decoding runs in headless Chromium (no PNG
// dependency).
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const [A, B] = argv.filter((a) => !a.startsWith('--'));
const DIR = String(flags.shots || 'shots/perf');
const THRESHOLD = Number(flags.threshold || 24);
if (!A || !B) {
  console.error('usage: pixel-diff.mjs <labelA> <labelB>');
  process.exit(2);
}

const files = readdirSync(DIR).filter((f) => f.startsWith(`${A}-`) && f.endsWith('.png') && !f.endsWith('.diff.png'));
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];
for (const fa of files) {
  const suffix = fa.slice(A.length + 1);
  const fb = `${B}-${suffix}`;
  let bufB;
  try {
    bufB = readFileSync(join(DIR, fb));
  } catch (_) {
    continue;
  }
  const a = `data:image/png;base64,${readFileSync(join(DIR, fa)).toString('base64')}`;
  const b = `data:image/png;base64,${bufB.toString('base64')}`;
  const r = await page.evaluate(async ({ a, b, threshold }) => {
    const load = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.min(ia.width, ib.width);
    const h = Math.min(ia.height, ib.height);
    const read = (img) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h);
    };
    const da = read(ia);
    const db = read(ib);
    const out = new ImageData(w, h);
    let diff = 0;
    let max = 0;
    let sum = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const d = Math.max(Math.abs(da.data[o] - db.data[o]), Math.abs(da.data[o + 1] - db.data[o + 1]), Math.abs(da.data[o + 2] - db.data[o + 2]));
      sum += d;
      if (d > max) max = d;
      if (d > threshold) {
        diff++;
        out.data[o] = 255;
        out.data[o + 1] = 0;
        out.data[o + 2] = 255;
        const x = i % w;
        const y = (i / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        out.data[o] = da.data[o] * 0.35;
        out.data[o + 1] = da.data[o + 1] * 0.35;
        out.data[o + 2] = da.data[o + 2] * 0.35;
      }
      out.data[o + 3] = 255;
    }
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(out, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {
      w, h, diff, pct: +((diff / (w * h)) * 100).toFixed(3), max, meanDelta: +(sum / (w * h)).toFixed(3),
      box: maxX < 0 ? null : [minX, minY, maxX, maxY],
      png: btoa(bin),
      sizeMismatch: ia.width !== ib.width || ia.height !== ib.height,
    };
  }, { a, b, threshold: THRESHOLD });
  const out = join(DIR, `${B}-${suffix.replace(/\.png$/, '')}.diff.png`);
  writeFileSync(out, Buffer.from(r.png, 'base64'));
  delete r.png;
  results.push({ shot: suffix, ...r, diffImage: out });
  console.log(`${suffix}: ${r.pct}% pixels > ${THRESHOLD} (max ${r.max}, mean ${r.meanDelta})${r.box ? ` box ${r.box.join(',')}` : ''}${r.sizeMismatch ? ' SIZE MISMATCH' : ''}`);
}
await browser.close();
if (flags.json) writeFileSync(String(flags.json), JSON.stringify({ a: A, b: B, threshold: THRESHOLD, results }, null, 2));
