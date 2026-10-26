#!/usr/bin/env node
/**
 * Loading-card strips rendered from each street's own CC0 layers (G316).
 *
 * The card's 840 x 160 street picture used to be Tiny Speck's loading_image
 * from the c2.glitch.bz CDN (Wayback), which is in no CC0 release. This draws
 * the same kind of picture with the game's own street renderer
 * (public/js/street-render.js over the CC0 glitch-locations decos): the whole
 * street, every parallax layer scaled to the street's width and stood on its
 * bottom, the bottom band of it at 840 px wide (tools/loading-strips/render.html).
 * Only the streets that had a CDN strip get one (streets.json); every other
 * street's card has no picture, as before.
 *
 * Writes public/assets/loading-strips/<street>.jpg and
 * public/assets/content/loading-images.json (card key -> { local, tsid }).
 *
 *   node tools/loading-strips/build.mjs [--only <tsid,...>] [--port 8797]
 *   node tools/loading-strips/build.mjs --check   (map and files agree; no browser)
 *
 * Takes the browser lock (BROWSER_LOCK, a mkdir lock) for the headless run.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
export const STRIP_DIR = 'assets/loading-strips';
const MAP = join(PUBLIC, 'assets/content/loading-images.json');
const STREETS = JSON.parse(readFileSync(join(HERE, 'streets.json'), 'utf8')).keys;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

/** card key -> { local, tsid } for every key in streets.json. */
export function stripMap() {
  const out = {};
  for (const key of Object.keys(STREETS).sort()) {
    const street = STREETS[key];
    out[key] = { local: `${STRIP_DIR}/${street}.jpg`, tsid: street };
  }
  return out;
}

function check() {
  const map = JSON.parse(readFileSync(MAP, 'utf8'));
  const want = stripMap();
  const problems = [];
  if (JSON.stringify(map) !== JSON.stringify(want)) problems.push('loading-images.json is not the strip map (run build.mjs)');
  for (const row of Object.values(want)) if (!existsSync(join(PUBLIC, row.local))) problems.push(`missing ${row.local}`);
  const shipped = new Set(Object.values(want).map((r) => r.local.split('/').pop()));
  for (const f of readdirSync(join(PUBLIC, STRIP_DIR))) if (!shipped.has(f)) problems.push(`stray ${STRIP_DIR}/${f}`);
  for (const p of problems) console.log(`  ${p}`);
  console.log(`${Object.keys(want).length} card keys, ${shipped.size} strips; ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
}

async function build() {
  const { chromium } = await import('playwright');
  const lock = process.env.BROWSER_LOCK;
  if (!lock) throw new Error('set BROWSER_LOCK to the browser lock dir (mkdir lock)');
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      console.log('browser lock held; waiting 30 s');
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  const port = Number(arg('--port', '8797'));
  const server = spawn(process.execPath, [join(ROOT, 'tools/serve-static.mjs'), ROOT, String(port)], { stdio: 'ignore' });
  let browser = null;
  try {
    await new Promise((r) => setTimeout(r, 500));
    browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 900, height: 300 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/tools/loading-strips/render.html`);
    await page.waitForFunction(() => window.stripReady === true, null, { timeout: 60000 });
    const index = JSON.parse(readFileSync(join(PUBLIC, 'assets/streets/index.json'), 'utf8')).streets;
    const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
    const streets = [...new Set(Object.values(STREETS))].sort().filter((t) => !only || only.has(t));
    mkdirSync(join(PUBLIC, STRIP_DIR), { recursive: true });
    for (const tsid of streets) {
      const r = await page.evaluate((file) => window.renderStrip(file), index[tsid].file);
      const data = Buffer.from(r.url.split(',')[1], 'base64');
      writeFileSync(join(PUBLIC, STRIP_DIR, `${tsid}.jpg`), data);
      console.log(`${tsid} ${index[tsid].label}: ${r.W}x${r.H}, ${r.drawn} decos${r.missing ? `, ${r.missing} textures never loaded` : ''}, ${data.length} bytes`);
    }
    await context.close();
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
    rmdirSync(lock);
  }
  writeFileSync(MAP, `${JSON.stringify(stripMap())}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else await build();
}
