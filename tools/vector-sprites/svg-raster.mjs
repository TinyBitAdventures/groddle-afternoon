#!/usr/bin/env node
/**
 * Rasterise FFDec SVG exports in Chromium (Playwright), for SWFs whose art
 * uses multiply / overlay / hard-light blend modes. FFDec's PNG renderer
 * blends those against transparent black (dark halos on bubbles and beans);
 * its SVG export keeps them as CSS mix-blend-mode, which Chromium composites
 * the way Flash did (over a transparent backdrop the source shows as is).
 *
 * rasteriseSvgs([{ svg, png }]) writes each SVG at its own width/height.
 * Usage: node tools/vector-sprites/svg-raster.mjs <in.svg> <out.png> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function rasteriseSvgs(jobs) {
  if (!jobs.length) return;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    for (const { svg, png } of jobs) {
      const text = readFileSync(svg, 'utf8');
      const dataUrl = await page.evaluate(async (src) => {
        const url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/png');
        } finally {
          URL.revokeObjectURL(url);
        }
      }, text);
      writeFileSync(png, Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const jobs = [];
  for (let i = 0; i + 1 < a.length; i += 2) jobs.push({ svg: a[i], png: a[i + 1] });
  await rasteriseSvgs(jobs);
}
