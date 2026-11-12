#!/usr/bin/env node
/**
 * Street memory walk (ticket 21: Safari reloaded the page "because it was using significant memory"
 * in Naraka or just after). Walks a list of streets through the real street trip (?memqa=1,
 * game.js groddleQA.travel), stays on each a while, and records after each one:
 *   - the GPU textures Pixi holds (renderStats: count and MB),
 *   - the decoded images js/textures.js holds (count and megapixels, 4 bytes each),
 *   - the JS heap (performance.memory, precise with --enable-precise-memory-info),
 *   - the renderer and GPU processes' resident memory (ps).
 *
 *   node tools/qa/street-memory.mjs [--base=http://127.0.0.1:8799/play/] [--dwell=25] [--out=file.json]
 *     [--route=hell|normal|<tsid,tsid,...>] [--width=1440 --height=810] [--dpr=2] [--engine=webkit]
 *     [--phone] [--query=density=4]
 *
 * --engine=webkit runs Playwright's WebKit (Safari's engine) and reads the physical footprint
 * (footprint(1), what Safari's memory reload weighs) of its WebContent and GPU processes; it has
 * no performance.memory.
 *
 * --phone dresses the context as an iPhone (its user agent, touch) that took the companion's
 * Load the full game anyway, so the phone gate classes it a phone (js/render-density.js caps
 * the render resolution). --query appends to the page's query (density=4 lifts that cap).
 *
 * The default route starts on Hechey Track, walks three Groddle streets, the six Naraka streets
 * from Hell One, then three Groddle streets again. Takes the one-browser lock.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { openBrowser } from './browser.mjs';
import { acquireLock } from './browser-lock.mjs';
import { webkit } from 'playwright';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const at = a.indexOf('=');
  return at < 0 ? [a.slice(2), true] : [a.slice(2, at), a.slice(at + 1)];
}));
const BASE = String(flags.base || 'http://127.0.0.1:8799/play/').replace(/\/?$/, '/');
const DWELL = Number(flags.dwell || 25) * 1000;
const NORMAL_A = ['GLI2V0UN7RD1T2J', 'GLI32J0SVTD114U', 'GLI2VDR4JRD1AEG', 'GIF12PMQ5121D68'];
const HELL = ['GA5PPFP86NF2FOS', 'GA524M0OMOE2OGT', 'GA5S44RM9OE2416', 'GA5RPAFK9OE28GN', 'GA5REO5I9OE2KLS', 'GA5Q57C99OE2GNU', 'GA5PV4T79OE2AOA'];
const NORMAL_B = ['GUV2LJJO5UC30B2', 'GM4115NJ46G8M', 'GLI2V0UN7RD1T2J', 'GLI32J0SVTD114U'];
const routes = {
  hell: [...NORMAL_A, ...HELL, ...NORMAL_B],
  normal: [...NORMAL_A, ...NORMAL_B, ...NORMAL_A],
};
const route = routes[flags.route || 'hell'] || String(flags.route).split(',');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
const EXTRA_QUERY = flags.query ? `&${flags.query}` : '';

/** Resident memory (MB) of this Chrome's renderer and GPU processes. */
function processMemory() {
  try {
    const rows = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).split('\n');
    const procs = rows.map((r) => r.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
      .map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
    // Every process under this node process.
    const mine = new Set([process.pid]);
    for (let grew = true; grew;) {
      grew = false;
      for (const p of procs) if (!mine.has(p.pid) && mine.has(p.ppid)) { mine.add(p.pid); grew = true; }
    }
    const sum = (re) => Math.round(procs.filter((p) => mine.has(p.pid) && re.test(p.cmd)).reduce((a, p) => a + p.rss, 0) / 1024);
    return { rendererMB: sum(/--type=renderer/), gpuMB: sum(/--type=gpu-process/) };
  } catch {
    return { rendererMB: null, gpuMB: null };
  }
}

/** Physical footprint (MB) of Playwright WebKit's WebContent and GPU processes (footprint(1)). */
function webkitFootprint() {
  try {
    const rows = execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n');
    const pick = (re) => rows.map((r) => r.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && /ms-playwright\/webkit/.test(m[2]) && re.test(m[2])).map((m) => m[1]);
    const foot = (pids) => {
      let mb = 0;
      for (const pid of pids) {
        const out = execFileSync('footprint', ['-f', 'bytes', '-p', pid], { encoding: 'utf8' });
        const m = out.match(/Footprint:\s*([\d,]+)\s*B/i) || out.match(/phys_footprint:\s*([\d,]+)/i);
        if (m) mb += Number(m[1].replace(/,/g, '')) / 1048576;
      }
      return Math.round(mb);
    };
    return { rendererMB: foot(pick(/WebContent/)), gpuMB: foot(pick(/GPU/)) };
  } catch {
    return { rendererMB: null, gpuMB: null };
  }
}

const isWebkit = flags.engine === 'webkit';
let browser;
let close;
if (isWebkit) {
  const lock = await acquireLock({ label: 'street-memory webkit' });
  browser = await webkit.launch({ headless: true });
  close = async () => { await browser.close().catch(() => {}); lock.release(); };
} else {
  ({ browser, close } = await openBrowser({ label: 'street-memory', extra: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] }));
}
const rows = [];
try {
  const ctx = await browser.newContext({
    viewport: { width: Number(flags.width || 1440), height: Number(flags.height || 810) },
    deviceScaleFactor: Number(flags.dpr || 2),
    ...(flags.phone ? { userAgent: IPHONE_UA, hasTouch: true, isMobile: true } : {}),
  });
  if (flags.phone) await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'full'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?autostart=1&questoffer=off&fresh=1&resetgame=1&memqa=1&streetdemo=${route[0]}${EXTRA_QUERY}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.groddleQA?.travel && !document.body.classList.contains('is-booting'), null, { timeout: 60000 });
  console.log(JSON.stringify(await page.evaluate(() => ({ device: window.GRODDLE_DEVICE ?? null, touch: navigator.maxTouchPoints, screen: [screen.width, screen.height] }))));
  const sample = async (tsid, step) => {
    const m = await page.evaluate(() => {
      try { globalThis.gc?.(); } catch {}
      const r = window.groddleQA.renderStats();
      const s = window.groddleQA.snapshot();
      return { street: s?.street?.label || '', resolution: r.resolution, gpuTextures: r.gpuTextures, gpuTextureMB: r.gpuTextureMB, images: r.images, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, extra: window.groddleQA.memoryStats?.() || null };
    });
    const row = { step, tsid, ...m, decodedMB: +((m.images?.mpx || 0) * 4).toFixed(1), ...(isWebkit ? webkitFootprint() : processMemory()) };
    rows.push(row);
    console.log(JSON.stringify(row));
  };
  for (let i = 0; i < route.length; i += 1) {
    if (i > 0) await page.evaluate((t) => window.groddleQA.travel(t), route[i]);
    await page.waitForTimeout(DWELL);
    await sample(route[i], i);
  }
} finally {
  if (flags.out) writeFileSync(String(flags.out), JSON.stringify(rows, null, 1));
  await close();
}
