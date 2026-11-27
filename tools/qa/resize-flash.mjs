#!/usr/bin/env node
/**
 * RESIZE FLASH: does the street flash black for a frame when its canvas resizes?
 *
 *   node tools/qa/resize-flash.mjs [--engine=webkit] [--port=8965] [--root=public] [--rounds=2]
 *
 * On an iPhone held upright (402x812) an open or closed bag refits the street's band, so the canvas
 * changes its on-screen (CSS) size and its pixel (backing store) size. WebKit painted the canvas
 * black for about a frame whenever both changed in the same frame, even with a redraw straight
 * after (Chrome never did). This opens and closes the first bag `--rounds` times in WebKit's
 * iPhone 15 Pro context, takes screenshots as fast as it can for 900 ms after each click, and
 * counts the shots whose street (the part of the canvas both sizes share) is mostly black.
 * `--engine=chromium` runs the same in Chrome with a phone's viewport.
 * `--scenario=rotate` turns the phone instead (812x402 and back), `--scenario=desktop` grows and
 * shrinks a computer's window (with `--engine=chromium`: Chrome must keep its one-step resize,
 * `laggedFrames` 0). `--keepall` with `--keep` saves every shot.
 * `--query=resizesplit=0` adds to the page's URL (that one turns the fix in js/stage-resize.js off).
 *
 * It holds the browser lock (tools/qa/browser-lock.mjs) for one run, about 30 to 45 s, prints a
 * JSON summary and exits 1 when any shot is black, or (WebKit) when any backing store change of
 * the canvas happened without the street's copy over it (`uncovered`: screenshots can miss a
 * frame, this cannot). `--keep=<dir>` saves the black shots there.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what a browser screenshot is) to
 * { width, height, channels, data } (pure). Throws on anything else.
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      if (depth !== 8 || body[12] !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`PNG kind not read: depth ${depth} colour ${colour}`);
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[row + x - channels] : 0;
      const b = y > 0 ? data[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? data[row - stride + x - channels] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[row + x] = v & 255;
    }
  }
  return { width, height, channels, data };
}

/** The share of pixels in `rect` ({ x, y, w, h } in the image's px) darker than `under` (pure). */
export function blackShare(img, rect, under = 20) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  let dark = 0;
  let all = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * img.channels;
      all++;
      if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) < under) dark++;
    }
  }
  return all ? dark / all : 0;
}

/** The part two canvas rects share ({ x, y, w, h }), inset a little from its edges (pure). */
export function sharedRect(a, b, inset = 6) {
  const x = Math.max(a.x, b.x) + inset;
  const y = Math.max(a.y, b.y) + inset;
  const w = Math.min(a.x + a.w, b.x + b.w) - inset - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - inset - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
  const engine = args.engine || 'webkit';
  const port = Number(args.port) || 8965;
  const root = resolve(args.root || join(HERE, '../../public'));
  const rounds = Number(args.rounds) || 2;
  // bag: open and close the first bag upright (the report); rotate: turn the phone and back;
  // desktop: a computer's window (1280x800) made bigger and smaller.
  const scenario = args.scenario || 'bag';
  const sizes = scenario === 'rotate' ? [{ width: 812, height: 402 }, { width: 402, height: 812 }] : [{ width: 1600, height: 960 }, { width: 1280, height: 800 }];
  // Loaded here, so tests can read the pure helpers above without Playwright.
  const { openBrowser } = await import('./browser.mjs');
  const { startServer } = await import('./serve.mjs');
  const { devices } = await import('playwright');
  const server = await startServer({ root, port });
  const session = await openBrowser({ label: 'resize-flash', waitMs: 20 * 60_000, engine });
  const summary = { engine, scenario, rounds, shots: 0, black: 0, worst: 0, events: [] };
  try {
    const phone = engine === 'webkit'
      ? { ...devices['iPhone 15 Pro'], viewport: { width: 402, height: 812 } }
      : { viewport: { width: 402, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: devices['iPhone 15 Pro'].userAgent };
    const ctx = await session.browser.newContext(scenario === 'desktop' ? { viewport: { width: 1280, height: 800 } } : phone);
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('groddle-play-device', 'qa-game');
      } catch {
        /* no storage */
      }
      // Each backing store change of the game's canvas once the bags are clicked, and whether the
      // street's copy (js/stage-resize.js) was over it then.
      window.__flashResizes = [];
      for (const prop of ['width', 'height']) {
        const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
        Object.defineProperty(HTMLCanvasElement.prototype, prop, {
          configurable: true,
          get: d.get,
          set(v) {
            if (window.__flashWatch && this.getAttribute('role') === 'application') {
              const cover = this.parentElement?.querySelector('.stage-resize-cover');
              window.__flashResizes.push({ prop, from: d.get.call(this), to: v, covered: Boolean(cover && cover.style.visibility === 'visible') });
            }
            d.set.call(this, v);
          },
        });
      }
    });
    const tab = await ctx.newPage();
    await tab.goto(`http://127.0.0.1:${port}/play/?autostart=1&questoffer=off&hstip=0&seasonnotice=off${args.query ? `&${args.query}` : ''}`);
    await tab.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 60_000 });
    if (scenario === 'bag') await tab.waitForFunction(() => document.querySelectorAll('#pack-bags .pack-bag').length > 0, null, { timeout: 20_000 });
    await tab.waitForTimeout(2500);
    const canvasRect = () => tab.evaluate(() => {
      const r = document.querySelector('#game-root canvas[role="application"]').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const clickBag = () => tab.evaluate(() => setTimeout(() => document.querySelector('#pack-bags .pack-bag')?.click(), 30));
    const shoot = async (label) => {
      const shots = [];
      const until = Date.now() + 900;
      const times = [];
      while (Date.now() < until) {
        const t = Date.now();
        shots.push(await tab.screenshot({ type: 'png', scale: 'css' }));
        times.push([t, Date.now()]);
      }
      return { label, shots, times };
    };
    {
      await tab.evaluate(() => {
        window.__flashFrames = [];
        const c = document.querySelector('#game-root canvas[role="application"]');
        let prev = '';
        const step = () => {
          const r = c.getBoundingClientRect();
          // Each frame's sizes, and whether the street's copy is over the canvas.
          const k = `${c.width}x${c.height} css ${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
          const cover = c.parentElement?.querySelector('.stage-resize-cover');
          const up = Boolean(cover && cover.style.visibility === 'visible');
          const cr = up ? cover.getBoundingClientRect() : null;
          const kk = `${k} at ${r.x.toFixed(0)},${r.y.toFixed(0)}${up ? ` (copy up at ${cr.x.toFixed(0)},${cr.y.toFixed(0)} ${cr.width.toFixed(0)}x${cr.height.toFixed(0)})` : ''}`;
          if (kk !== prev) window.__flashFrames.push([Math.round(performance.timeOrigin + performance.now()), kk, c.width, c.height, r.width, r.height]);
          prev = kk;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }
    const closed = await canvasRect();
    await tab.evaluate(() => { window.__flashWatch = true; });
    const takes = [];
    const step = async (i) => {
      if (scenario === 'bag') await clickBag();
      else await tab.setViewportSize(sizes[i]);
    };
    const names = scenario === 'bag' ? ['open', 'close'] : scenario === 'rotate' ? ['turn', 'turn back'] : ['grow', 'shrink'];
    for (let k = 0; k < rounds; k++) {
      await step(0);
      takes.push(await shoot(`${names[0]} ${k + 1}`));
      await tab.waitForTimeout(600);
      if (k === 0) summary.rects = { closed, open: await canvasRect() };
      await step(1);
      takes.push(await shoot(`${names[1]} ${k + 1}`));
      await tab.waitForTimeout(600);
    }
    const resizes = await tab.evaluate(() => window.__flashResizes);
    summary.resizes = resizes.length;
    summary.uncovered = resizes.filter((r) => !r.covered).length;
    const frames = await tab.evaluate(() => window.__flashFrames);
    // A frame whose canvas changed on-screen size while its backing store kept the last frame's:
    // a frame of lag (on WebKit the copy covers it; in Chrome there should be none).
    summary.laggedFrames = frames.filter((f, i) => i > 0 && (f[4] !== frames[i - 1][4] || f[5] !== frames[i - 1][5]) && f[2] === frames[i - 1][2] && f[3] === frames[i - 1][3]).length;
    if (args.trace) summary.frames = frames.map((f) => f.slice(0, 2));
    await ctx.close();
    // The part of the canvas both sizes share (rotate: the box both turned screens share).
    const area = sharedRect(summary.rects.closed, summary.rects.open);
    summary.area = area;
    if (scenario === 'bag' && summary.rects.open.h === summary.rects.closed.h) summary.note = 'the canvas did not resize: no bag dock on this layout?';
    for (const { label, shots, times } of takes) {
      const shares = shots.map((png) => blackShare(decodePng(png), area));
      const black = shares.filter((s) => s > 0.5).length;
      summary.shots += shots.length;
      summary.black += black;
      summary.worst = Math.max(summary.worst, ...shares);
      summary.events.push({ label, shots: shots.length, black, worst: +Math.max(...shares).toFixed(2), ...(args.trace ? { shares: shares.map((s, i) => [times[i][0] % 100000, times[i][1] % 100000, +s.toFixed(2)]) } : {}) });
      if (args.keep && (black || args.keepall)) {
        mkdirSync(args.keep, { recursive: true });
        shots.forEach((png, i) => {
          if (shares[i] > 0.5 || args.keepall) writeFileSync(join(args.keep, `${label.replace(' ', '-')}-${i}.png`), png);
        });
      }
    }
    summary.worst = +summary.worst.toFixed(2);
    if (summary.frames) summary.frames = summary.frames.map(([t, k]) => [t % 100000, k]);
  } finally {
    await session.close();
    await server.stop();
  }
  console.log(JSON.stringify(summary));
  // On WebKit every backing store change must happen under the copy; in Chrome there is no copy.
  process.exitCode = summary.black > 0 || summary.note || (engine === 'webkit' && summary.uncovered > 0) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
