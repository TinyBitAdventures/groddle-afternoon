#!/usr/bin/env node
/**
 * LEVEL BUILDER (spec 9.2, phase P5): the colour of every library deco, tools/builder/deco-palette.json,
 * which tools/builder/style-profile.mjs weights by placements into each layer role's palette band.
 *
 * The repo has no Node image decoder, so the 2x WebPs are decoded in Playwright's Chrome
 * (createImageBitmap, straight alpha, no colour conversion, then an OffscreenCanvas) and measured
 * with js/builder/colour-stats.js colourStats, the same function intake's PHP port is held to.
 * One row a line: name, bytes (the 2x file's size, so --check sees changed art), l, s, hue[12], cover.
 *
 *   node tools/builder/deco-palette.mjs           measure (takes the browser lock, about a minute)
 *   node tools/builder/deco-palette.mjs --check   exit 1 when a library deco has no row or its file
 *                                                 changed size (no browser; tests/builder-style.test.js)
 *
 * GRODDLE_BROWSER_LOCK names the lock folder (tools/qa/browser-lock.mjs); PORT the static server's
 * port (default: any free one).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colourStats, hsl, HUE_BINS } from '../../public/js/builder/colour-stats.js?v=30f71984';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(ROOT, 'tools/builder/deco-palette.json');
const DECOS = join(ROOT, 'public/assets/decos/groddle');

export function libraryNames(root = ROOT) {
  return [...JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8'))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function paletteText(rows) {
  return `{"format":"groddle-deco-palette/1","count":${rows.length},"decos":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

/** Problems with the stored palette against the library as it is now (no browser). */
export function paletteDrift(root = ROOT) {
  if (!existsSync(OUT)) return ['tools/builder/deco-palette.json is missing'];
  const rows = new Map(JSON.parse(readFileSync(OUT, 'utf8')).decos.map((r) => [r.name, r]));
  const out = [];
  for (const name of libraryNames(root)) {
    const r = rows.get(name);
    const file = join(root, 'public/assets/decos/groddle', `${name}.webp`);
    const bytes = existsSync(file) ? statSync(file).size : 0;
    if (!r) out.push(`${name}: no row`);
    else if (r.bytes !== bytes) out.push(`${name}: the file is ${bytes} bytes, measured at ${r.bytes}`);
    rows.delete(name);
  }
  for (const name of rows.keys()) out.push(`${name}: not in the library`);
  return out;
}

async function measure() {
  const { openBrowser } = await import('../qa/browser.mjs');
  const { startServer } = await import('../qa/serve.mjs');
  const names = libraryNames();
  const server = await startServer({ root: join(ROOT, 'public'), port: Number(process.env.PORT) || 0 });
  const { browser, close } = await openBrowser({ label: 'deco-palette' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/assets/decos/manifest.json`);
    // The page gets the measuring code as text: the very functions this module imports.
    await page.evaluate(`globalThis.HUE_BINS = ${HUE_BINS}; globalThis.hsl = ${hsl.toString()}; globalThis.colourStats = ${colourStats.toString().replace(/^function colourStats/, 'function')};`);
    const rows = [];
    const batch = 24;
    for (let i = 0; i < names.length; i += batch) {
      const part = names.slice(i, i + batch);
      const got = await page.evaluate(async (list) => {
        const r3 = (n) => Math.round(n * 1000) / 1000;
        globalThis.r3 = r3;
        return Promise.all(list.map(async (name) => {
          try {
            const res = await fetch(`/assets/decos/groddle/${name}.webp`);
            if (!res.ok) return { name, error: res.status };
            const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            const c = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
            ctx.drawImage(bitmap, 0, 0);
            const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
            return { name, w: bitmap.width, h: bitmap.height, ...globalThis.colourStats(data, bitmap.width, bitmap.height) };
          } catch (e) {
            return { name, error: String(e?.message || e) };
          }
        }));
      }, part);
      for (const g of got) {
        if (g.error) throw new Error(`${g.name}: ${g.error}`);
        const bytes = statSync(join(DECOS, `${g.name}.webp`)).size;
        rows.push({ name: g.name, bytes, w: g.w, h: g.h, l: g.l, s: g.s, hue: g.hue, cover: g.cover });
      }
      if ((i / batch) % 25 === 0) process.stdout.write(`${rows.length}/${names.length}\n`);
    }
    return rows;
  } finally {
    await close();
    await server.stop();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const drift = paletteDrift();
    if (drift.length) {
      console.error(`deco-palette.json is stale (${drift.length}): ${drift.slice(0, 5).join('; ')}\nrun node tools/builder/deco-palette.mjs`);
      process.exit(1);
    }
    console.log('deco-palette.json is current');
  } else {
    const rows = await measure();
    writeFileSync(OUT, paletteText(rows));
    console.log(`wrote ${OUT} (${rows.length} decos)`);
  }
}
