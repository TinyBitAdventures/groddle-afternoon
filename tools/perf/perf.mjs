// Renderer performance harness: boot time, frame times, heap, GPU texture
// bytes, draw calls and network bytes on a few heavy routes, at DPR 1 and 2.
//
// Usage (serve public/ first, e.g. `cd public && python3 -I -m http.server 8831`):
//   node tools/perf/perf.mjs --base=http://127.0.0.1:8831/ --label=v7
//     [--routes=hechey,marrakesh,room,rook,builder] [--dpr=1,2]
//     [--out=tools/perf/results] [--shots=shots/perf] [--capped] [--headed]
//     [--extra=renderer=webgpu --webgpu] (append query params; enable WebGPU)
//
// Headless Chromium on the Metal GPU (ANGLE). Frame pacing is uncapped
// (--disable-gpu-vsync --disable-frame-rate-limit) unless --capped, so the
// frame interval measures what a frame costs, not the display's 60 Hz.
// Everything is measured from outside the game, so the same harness reads
// Pixi 7 and Pixi 8 builds:
// - frame time: requestAnimationFrame is wrapped; `interval` is the gap
//   between frames, `cpu` the time spent inside the frame's callbacks.
// - draw calls: WebGL draw* calls per frame (WebGPU: draw/drawIndexed).
// - GPU texture bytes: every texImage2D/texStorage2D level-0 upload minus
//   deleteTexture, at 4 bytes per pixel (WebGPU: createTexture/destroy).
// - renderer textures: the renderer's own managed texture list, when the
//   Application is reachable (captured through Application#render).
// - network: CDP encodedDataLength over the whole route.
// Math.random is seeded so street ecology lands the same way on every run.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const BASE = String(flags.base || 'http://127.0.0.1:8831/').replace(/\/?$/, '/');
const LABEL = String(flags.label || 'run');
const OUT = String(flags.out || 'tools/perf/results');
const SHOTS = flags.shots === undefined ? 'shots/perf' : String(flags.shots);
const DPRS = String(flags.dpr || '1,2').split(',').map(Number);
const VIEWPORT = { width: Number(flags.width || 1280), height: Number(flags.height || 860) };
const NOISE = /GL Driver Message|AudioContext was not allowed|WebGL: INVALID|GPU stall|swiftshader|Automatic fallback to software WebGL/i;

const COMMON = 'autostart=1&fresh=1&resetgame=1&questoffer=off&timedemo=day';

/** A walk: hold right, hop, hold left, hop (about 9 s). */
async function walk(page) {
  const k = page.keyboard;
  await k.down('d');
  await page.waitForTimeout(1500);
  await k.press('Space');
  await page.waitForTimeout(1500);
  await k.press('Space');
  await page.waitForTimeout(1000);
  await k.up('d');
  await k.down('a');
  await page.waitForTimeout(1500);
  await k.press('Space');
  await page.waitForTimeout(1500);
  await k.up('a');
  await k.down('d');
  await page.waitForTimeout(1500);
  await k.up('d');
}

export const ROUTES = {
  hechey: {
    label: 'Hechey Track (fresh start)',
    query: `?${COMMON}`,
    settle: 2500,
    run: walk,
  },
  marrakesh: {
    label: 'Marrakesh Meadow (GLIERMJ93DE1H25)',
    query: `?${COMMON}&streetdemo=GLIERMJ93DE1H25`,
    settle: 2500,
    run: walk,
  },
  room: {
    label: 'Mental Block quest room',
    query: `?${COMMON}&questdemo=mental_block`,
    settle: 4500,
    run: walk,
  },
  rook: {
    label: 'Rook attack on Hechey Track',
    query: `?${COMMON}&rookdemo=attack&rookautoplay=1`,
    settle: 2500,
    run: async (page) => {
      await page.waitForTimeout(9000);
    },
  },
  // Other Glitches on screen (the vector NPC looks, js/npc-glitches.js).
  companions: {
    label: 'Hechey Track with the three local companions',
    query: `?${COMMON}&companions=1`,
    settle: 3500,
    run: walk,
  },
  party: {
    label: 'Toxic Moon party space with three dancing guests',
    query: `?${COMMON}&partydemo=moon`,
    settle: 4500,
    run: walk,
  },
  crowns: {
    label: 'Game of Crowns arena with the rivals running',
    query: `?${COMMON}&racedemo=it_game`,
    settle: 4500,
    run: walk,
  },
  builder: {
    label: 'Character builder, six heavy random looks',
    query: `?${COMMON}`,
    settle: 2500,
    run: async (page) => {
      await page.evaluate(() => document.getElementById('avatar-btn')?.click());
      await page.waitForTimeout(800);
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => document.getElementById('avatar-random')?.click());
        await page.waitForTimeout(1300);
      }
    },
  },
};

function initScript() {
  // Seeded Math.random (mulberry32) so street ecology is identical per run.
  let seed = 0x9e3779b9;
  Math.random = function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const perf = {
    recording: false,
    frames: [],
    draws: 0,
    texBytes: 0,
    texCount: 0,
    texPeak: 0,
    bootMs: null,
    api: null,
    app: null,
  };
  window.__perf = perf;
  // Frames: every rAF tick's callbacks run inside one task; time them.
  const raf = window.requestAnimationFrame.bind(window);
  let tick = null;
  let lastTs = null;
  const flush = () => {
    if (!tick) return;
    if (perf.recording) perf.frames.push(tick);
    tick = null;
  };
  window.requestAnimationFrame = (cb) => raf((ts) => {
    if (!tick || tick.ts !== ts) {
      flush();
      tick = { ts, interval: lastTs === null ? 0 : ts - lastTs, cpu: 0, draws: 0 };
      lastTs = ts;
      perf.draws = 0;
      if (perf.bootMs === null && document.body && !document.body.classList.contains('is-booting') && window.groddleQA && document.querySelector('canvas')) {
        perf.bootMs = performance.now();
      }
    }
    const t0 = performance.now();
    try {
      cb(ts);
    } finally {
      tick.cpu += performance.now() - t0;
      tick.draws = perf.draws;
    }
  });
  // WebGL: draws per frame and texture bytes.
  const sizes = new WeakMap();
  const setBytes = (tex, bytes) => {
    if (!tex) return;
    const prev = sizes.get(tex);
    if (prev === undefined) perf.texCount++;
    perf.texBytes += bytes - (prev || 0);
    perf.texPeak = Math.max(perf.texPeak, perf.texBytes);
    sizes.set(tex, bytes);
  };
  const dims = (src) => [src?.width || src?.videoWidth || src?.naturalWidth || 0, src?.height || src?.videoHeight || src?.naturalHeight || 0];
  for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    const p = Ctx.prototype;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const fn = p[name];
      if (!fn) continue;
      p[name] = function (...a) {
        perf.draws++;
        perf.api = perf.api || (Ctx === window.WebGL2RenderingContext ? 'webgl2' : 'webgl');
        return fn.apply(this, a);
      };
    }
    const state = (gl) => gl.__perfTex || (gl.__perfTex = { unit: 0, bound: [] });
    const bound = (gl, target) => {
      const s = state(gl);
      const t = target >= 0x8515 && target <= 0x851a ? 0x8513 : target; // cube faces
      return (s.bound[s.unit] || {})[t];
    };
    const active = p.activeTexture;
    p.activeTexture = function (unit) {
      state(this).unit = unit - 0x84c0;
      return active.call(this, unit);
    };
    const bind = p.bindTexture;
    p.bindTexture = function (target, tex) {
      const s = state(this);
      (s.bound[s.unit] || (s.bound[s.unit] = {}))[target] = tex;
      return bind.call(this, target, tex);
    };
    const image = p.texImage2D;
    p.texImage2D = function (target, level, ...rest) {
      if (level === 0) {
        let w = 0;
        let h = 0;
        if (rest.length >= 6) [w, h] = [rest[1], rest[2]];
        else [w, h] = dims(rest[3]);
        setBytes(bound(this, target), w * h * 4);
      }
      return image.call(this, target, level, ...rest);
    };
    const storage = p.texStorage2D;
    if (storage) {
      p.texStorage2D = function (target, levels, internal, w, h) {
        setBytes(bound(this, target), w * h * 4 * (levels > 1 ? 4 / 3 : 1));
        return storage.call(this, target, levels, internal, w, h);
      };
    }
    const del = p.deleteTexture;
    p.deleteTexture = function (tex) {
      const prev = sizes.get(tex);
      if (prev !== undefined) {
        perf.texBytes -= prev;
        perf.texCount--;
        sizes.delete(tex);
      }
      return del.call(this, tex);
    };
  }
  // WebGPU (Pixi 8 can pick it): draws and texture bytes.
  if (window.GPUDevice) {
    const create = GPUDevice.prototype.createTexture;
    GPUDevice.prototype.createTexture = function (desc) {
      const tex = create.call(this, desc);
      const s = desc?.size || {};
      const w = s.width ?? s[0] ?? 0;
      const h = s.height ?? s[1] ?? 1;
      setBytes(tex, w * h * 4);
      perf.api = 'webgpu';
      return tex;
    };
    const destroy = GPUTexture.prototype.destroy;
    GPUTexture.prototype.destroy = function () {
      const prev = sizes.get(this);
      if (prev !== undefined) {
        perf.texBytes -= prev;
        perf.texCount--;
        sizes.delete(this);
      }
      return destroy.call(this);
    };
    for (const name of ['draw', 'drawIndexed']) {
      const fn = GPURenderPassEncoder.prototype[name];
      GPURenderPassEncoder.prototype[name] = function (...a) {
        perf.draws++;
        return fn.apply(this, a);
      };
    }
  }
  // Capture the Pixi Application (v7 and v8 both render through it).
  let pixi;
  const hook = (P) => {
    const proto = P?.Application?.prototype;
    if (!proto || proto.__perfHooked) return;
    const render = proto.render;
    proto.render = function (...a) {
      perf.app = this;
      return render.apply(this, a);
    };
    proto.__perfHooked = true;
  };
  try {
    Object.defineProperty(window, 'PIXI', {
      configurable: true,
      get: () => pixi,
      set: (v) => {
        pixi = v;
        try { hook(v); } catch (_) { /* frozen namespace */ }
      },
    });
  } catch (_) { /* already defined */ }
}

/** Renderer-side numbers, in the page. */
function rendererStats() {
  const perf = window.__perf;
  const r = perf.app?.renderer;
  const out = { pixi: window.PIXI?.VERSION || null, rendererType: null, rendererTextures: null, rendererTextureMB: null, resolution: r?.resolution ?? null };
  if (!r) return out;
  out.rendererType = r.name || (r.type === 1 ? 'webgl' : r.type === 2 ? 'webgpu' : r.type ?? null);
  if (r.context?.webGLVersion) out.rendererType = `webgl${r.context.webGLVersion}`;
  const managed = r.texture?.managedTextures;
  if (Array.isArray(managed)) {
    let bytes = 0;
    let n = 0;
    // Other Glitches' sheets (vector NPC looks, or the old raster crowd) and the player's.
    let npcBytes = 0;
    let playerBytes = 0;
    for (const t of managed) {
      if (!t) continue;
      const w = t.pixelWidth ?? t.realWidth ?? 0;
      const h = t.pixelHeight ?? t.realHeight ?? 0;
      bytes += w * h * 4;
      n++;
      const label = String(t.label || '');
      if (/avatar\/(npc|crowd)\//.test(label)) npcBytes += w * h * 4;
      else if (/avatar\/(vector|glitch-62d8)\//.test(label)) playerBytes += w * h * 4;
    }
    out.rendererTextures = n;
    out.rendererTextureMB = +(bytes / 1048576).toFixed(1);
    out.npcTextureMB = +(npcBytes / 1048576).toFixed(1);
    out.playerTextureMB = +(playerBytes / 1048576).toFixed(1);
  }
  return out;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  return +sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(2);
}

function summarize(frames) {
  const iv = frames.map((f) => f.interval).filter((v) => v > 0).sort((a, b) => a - b);
  const cpu = frames.map((f) => f.cpu).sort((a, b) => a - b);
  const draws = frames.map((f) => f.draws).sort((a, b) => a - b);
  const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
  return {
    frames: frames.length,
    fps: iv.length ? +(1000 / mean(iv)).toFixed(1) : null,
    interval: { p50: pct(iv, 50), p95: pct(iv, 95), p99: pct(iv, 99), max: iv.length ? +iv[iv.length - 1].toFixed(2) : null },
    cpu: { p50: pct(cpu, 50), p95: pct(cpu, 95), p99: pct(cpu, 99), mean: mean(cpu) },
    draws: { p50: pct(draws, 50), p95: pct(draws, 95), max: draws.length ? draws[draws.length - 1] : null },
  };
}

async function runRoute(browser, name, dpr) {
  const route = ROUTES[name];
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr, ignoreHTTPSErrors: true });
  await context.addInitScript(initScript);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Network.enable');
  let netBytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    netBytes += e.encodedDataLength || 0;
    requests++;
  });
  const issues = [];
  page.on('console', (m) => {
    const text = m.text();
    if (NOISE.test(text)) return;
    if (m.type() === 'error' || m.type() === 'warning') issues.push(`${m.type()}: ${text.slice(0, 300)}`);
  });
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message} @ ${String(e.stack || '').split('\n').slice(1, 3).join(' | ')}`));
  page.on('response', (r) => {
    if (r.status() >= 400) issues.push(`http ${r.status()}: ${r.url().replace(BASE, '')}`);
  });
  const t0 = Date.now();
  await page.goto(`${BASE}${route.query}${flags.extra ? `&${flags.extra}` : ''}`, { waitUntil: 'load', timeout: 60000 });
  const booted = await page.waitForFunction(() => window.__perf?.bootMs !== null, null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
  const bootMs = await page.evaluate(() => Math.round(window.__perf.bootMs ?? -1));
  await page.waitForTimeout(route.settle);
  let shot = null;
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    shot = join(SHOTS, `${LABEL}-${name}-dpr${dpr}.png`);
    await page.screenshot({ path: shot });
  }
  const before = await page.evaluate(() => ({ tex: window.__perf.texBytes, n: window.__perf.texCount }));
  await page.evaluate(() => {
    window.__perf.frames = [];
    window.__perf.recording = true;
  });
  await route.run(page);
  await page.evaluate(() => {
    window.__perf.recording = false;
  });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${LABEL}-${name}-dpr${dpr}-end.png`) });
  const frames = await page.evaluate(() => window.__perf.frames);
  const tex = await page.evaluate(() => ({ bytes: window.__perf.texBytes, peak: window.__perf.texPeak, n: window.__perf.texCount, api: window.__perf.api }));
  const rstats = await page.evaluate(rendererStats).catch(() => ({}));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const data = await page.evaluate(() => ({ street: window.groddleQA?.snapshot?.()?.street?.label || null, res: document.querySelector('canvas')?.dataset?.renderResolution || null }));
  await context.close();
  return {
    route: name,
    label: route.label,
    dpr,
    booted,
    bootMs,
    wallMs: Date.now() - t0,
    street: data.street,
    renderResolution: data.res,
    ...summarize(frames),
    heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1),
    gpuTextureMB: +(tex.bytes / 1048576).toFixed(1),
    gpuTexturePeakMB: +(tex.peak / 1048576).toFixed(1),
    gpuTextureMBBeforeWalk: +(before.tex / 1048576).toFixed(1),
    gpuTextures: tex.n,
    api: tex.api,
    ...rstats,
    networkMB: +(netBytes / 1048576).toFixed(2),
    requests,
    issues: [...new Set(issues)].slice(0, 20),
    shot,
  };
}

function table(results) {
  const rows = [
    '| Route | DPR | Boot ms | fps | Interval p50/p95/p99 ms | CPU p50/p95/p99 ms | Draws p50 | Heap MB | GPU tex MB (peak) | Net MB | Issues |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    rows.push(`| ${r.route} | ${r.dpr} | ${r.bootMs} | ${r.fps} | ${r.interval.p50}/${r.interval.p95}/${r.interval.p99} | ${r.cpu.p50}/${r.cpu.p95}/${r.cpu.p99} | ${r.draws.p50} | ${r.heapMB} | ${r.gpuTextureMB} (${r.gpuTexturePeakMB}) | ${r.networkMB} | ${r.issues.length} |`);
  }
  return rows.join('\n');
}

async function main() {
  const names = String(flags.routes || Object.keys(ROUTES).join(',')).split(',');
  const args = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  if (!flags.capped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  if (flags.webgpu) args.push('--enable-unsafe-webgpu');
  const browser = await chromium.launch({ headless: !flags.headed, args });
  const results = [];
  for (const name of names) {
    if (!ROUTES[name]) {
      console.error(`unknown route ${name}`);
      continue;
    }
    for (const dpr of DPRS) {
      const r = await runRoute(browser, name, dpr);
      results.push(r);
      console.log(`${name} dpr${dpr}: boot ${r.bootMs} ms, ${r.fps} fps, cpu p95 ${r.cpu.p95} ms, draws ${r.draws.p50}, heap ${r.heapMB} MB, tex ${r.gpuTextureMB} MB (npc ${r.npcTextureMB}, player ${r.playerTextureMB}), net ${r.networkMB} MB, ${r.api}/${r.rendererType} pixi ${r.pixi}${r.issues.length ? `, ${r.issues.length} issues` : ''}`);
      for (const i of r.issues.slice(0, 5)) console.log(`   ! ${i}`);
    }
  }
  await browser.close();
  mkdirSync(OUT, { recursive: true });
  const stamp = { label: LABEL, base: BASE, viewport: VIEWPORT, capped: !!flags.capped, date: new Date().toISOString() };
  writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ ...stamp, results }, null, 2));
  writeFileSync(join(OUT, `${LABEL}.md`), `# ${LABEL}\n\n${stamp.date}, viewport ${VIEWPORT.width}x${VIEWPORT.height}, ${flags.capped ? 'vsync capped' : 'uncapped frame rate'}\n\n${table(results)}\n`);
  console.log(`wrote ${join(OUT, `${LABEL}.json`)} and .md`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
