// Draw SVGs at given sizes the way the game does (js/textures.js: Image -> canvas drawImage at
// width x height) and save PNGs, for tools/deco-pipeline/sharp.py's SVG check.
// node tools/deco-pipeline/svg-raster.mjs <jobs.json: [{svg, png, width, height}]>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>svg raster</title>');
  for (const job of jobs) {
    const svg = readFileSync(job.svg, 'utf8');
    const png = await page.evaluate(async ({ svg, width, height }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    }, { svg, width: job.width, height: job.height }).catch(() => null);
    if (png) writeFileSync(job.png, Buffer.from(png.split(',')[1], 'base64'));
  }
} finally {
  await browser.close();
}
