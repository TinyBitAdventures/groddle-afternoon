/**
 * Capture the restoration page's screenshots from the live game
 * (https://groddle.localhost), one at a time, into
 * public/restoration/shots/<key>.webp. Routes live in shots.mjs.
 *
 *   node tools/restoration/capture.mjs                 every missing shot
 *   node tools/restoration/capture.mjs --all           re-capture everything
 *   node tools/restoration/capture.mjs rooks room:juju_camp
 *
 * The HUD rail, chat dock and activity feed are hidden so the street reads
 * cleanly. 'world' shots crop to the street view above the pack; 'panel'
 * shots keep the whole game area. Then run node tools/build-restoration.mjs.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './shots.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'public', 'restoration', 'shots');
const BASE = 'https://groddle.localhost/';
const HIDE = `
  #play-context, #local-chat-dock, #activity-feed, #toast, .qi-hint { visibility: hidden !important; }
`;

const args = process.argv.slice(2);
const all = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--'));
const keys = (only.length ? only : Object.keys(SHOTS)).filter((k) => SHOTS[k]);
const fileFor = (key) => join(outDir, `${key.replace(/^room:/, 'room-')}.webp`);

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let done = 0;
for (const key of keys) {
  const target = fileFor(key);
  if (!all && !only.length && existsSync(target)) continue;
  const spec = SHOTS[key];
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${BASE}${spec.route}`, { waitUntil: 'load', timeout: 120000 });
    await page.addStyleTag({ content: HIDE });
    await page.waitForTimeout(spec.wait || 9000);
    for (const step of spec.steps || []) {
      if (step.click) await page.click(step.click, { timeout: 10000 }).catch(() => {});
      if (step.key) await page.keyboard.press(step.key);
      if (step.eval) await page.evaluate(step.eval).catch(() => {});
      if (step.wait) await page.waitForTimeout(step.wait);
    }
    const box = await page.evaluate((frame) => {
      const host = frame === 'panel' ? document.getElementById('game-root') : document.querySelector('canvas');
      const r = host.getBoundingClientRect();
      // The street view is the canvas above the 132 px pack allowance (408 of 540).
      const h = frame === 'panel' ? r.height : r.height * (408 / 540);
      return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(h) };
    }, spec.frame || 'world');
    const png = join(tmpdir(), `resto-${process.pid}-${key.replace(/[^a-z0-9]/gi, '_')}.png`);
    await page.screenshot({ path: png, clip: box });
    execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '960', '0', png, '-o', target]);
    rmSync(png, { force: true });
    done += 1;
    console.log(`${key} -> ${target.replace(`${root}/`, '')}${errors.length ? ` (page errors: ${errors.slice(0, 2).join(' | ')})` : ''}`);
  } catch (err) {
    console.log(`${key} FAILED: ${err.message.split('\n')[0]}`);
  }
  await context.close();
}
await browser.close();
console.log(`${done} captured`);
