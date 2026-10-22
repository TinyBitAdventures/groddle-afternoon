// Rasterise FFDec SVG frame exports with Chromium.
// node svg2png.mjs <ffdec out dir: <name>.swf/1.svg> <png out dir>
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
for (const d of readdirSync(root)) {
  const f = join(root, d, '1.svg');
  if (!existsSync(f)) continue;
  const tag = readFileSync(f, 'utf8').match(/<svg[^>]*>/)[0];
  const w = Math.max(1, Math.ceil(Number(tag.match(/width="([\d.]+)/)[1])));
  const h = Math.max(1, Math.ceil(Number(tag.match(/height="([\d.]+)/)[1])));
  await page.setViewportSize({ width: Math.min(w, 8000), height: Math.min(h, 8000) });
  await page.goto(pathToFileURL(f).href);
  await page.screenshot({ path: join(outDir, d.replace(/\.swf$/, '.png')), omitBackground: true,
    clip: { x: 0, y: 0, width: Math.min(w, 8000), height: Math.min(h, 8000) } });
}
await browser.close();
