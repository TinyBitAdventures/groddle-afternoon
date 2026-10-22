// Render reimagined item icons (tools/item-art/*.svg) to the pack icon
// folder. Only for items with no surviving CC0 art. (3x pack icons are the
// generated js/icon-hires.js list, so these ship at 1x.)
//   node tools/item-art/render.mjs batterfly_bar
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const icons = join(here, '../../public/assets/sprites/icons');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const id of process.argv.slice(2)) {
  const svg = await readFile(join(here, `${id}.svg`), 'utf8');
  const [, , , w, h] = /viewBox="(\S+) (\S+) (\S+) (\S+)"/.exec(svg).map(Number);
  for (const [scale, suffix] of [[1, '']]) {
    await page.setViewportSize({ width: w * scale, height: h * scale });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${w * scale}px;height:${h * scale}px}</style>${svg}`);
    await page.locator('svg').screenshot({ path: join(icons, `${id}${suffix}.png`), omitBackground: true });
  }
  console.log(id);
}
await browser.close();
