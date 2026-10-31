/**
 * LEVEL BUILDER (spec 8.5): renders a street to PNG with the game's own renderer, in Chrome. The
 * builder worker and the CLI both use it. Chrome opens through tools/qa/browser.mjs under the one
 * browser lock (GRODDLE_BROWSER_LOCK) and closes after `idleMs` (60 s) without a render, so other
 * lanes get the browser back. The page is public/builder-render/ on an origin of its own that no
 * server answers: every request is fulfilled from this checkout's public/ (and new art from the
 * bytes handed in); anything else is refused, so the page opens nothing but itself.
 *
 *   const r = createRenderer();
 *   const { png, width, height } = await r.render(renderInput(zone, 'lane', ctx, params), art);
 *   await r.close();
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { GAME_DIR } from '../repos.mjs';
import { openBrowser } from '../qa/browser.mjs';
import { validateZone, placementRequests } from '../../public/js/builder/validate.js?v=955b2e0f';
import { planStreetPlacements, populationForStreet } from '../../public/js/street-ecology.js?v=7e30da8f';
import { platformsScreen, streetWidth, worldToScreen } from '../../public/js/street-model.js?v=23b926e5';
import { plannedSpots } from '../../public/js/builder/editor-zone.js?v=3ca537c9';

/** Fatal rules that still render (the street loads; see renderInput). */
export const RENDERS_ANYWAY = new Set(['AST-001']);
export const ORIGIN = 'http://builder-render.localhost';
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/** PURE: the planner's spots for a street's population (screen space), as the editor's overlay and the game place them. */
export function populationSpots(row) {
  const s = row?.street;
  if (!s || !row.population) return [];
  return plannedSpots({ street: s, population: row.population, platformsScreen, worldToScreen, populationForStreet, planStreetPlacements, placementRequests, worldW: streetWidth(s) });
}

/**
 * What the render page needs for one street of a zone: the street, the validator's reach map and
 * findings for it, the population's spots, and the counts for X-Builder-Findings. Throws a
 * { code: 'builder_invalid', status: 422 } error when a fatal finding blocks the render (7.2), all
 * but missing art (AST-001): the game draws a missing sprite as its placeholder and loads the street,
 * and seeing the placeholder is what the agent needs.
 */
export function renderInput(zone, key, ctx, params = {}) {
  const row = (zone.streets || []).find((s) => s.key === key);
  if (!row?.street) throw Object.assign(new Error(`This zone has no street "${key}".`), { code: 'builder_not_found', status: 404 });
  const report = validateZone(zone, ctx);
  const mine = report.findings.filter((f) => f.street === key || f.street === null);
  const fatal = mine.filter((f) => f.severity === 'fatal' && !f.waived && !RENDERS_ANYWAY.has(f.rule));
  if (fatal.length) throw Object.assign(new Error(`A fatal finding blocks the render: ${fatal[0].rule} ${fatal[0].message}`), { code: 'builder_invalid', status: 422, data: { findings: fatal } });
  const counts = { fatal: 0, error: 0, warn: 0, info: 0 };
  for (const f of mine) if (!f.waived) counts[f.severity] += 1;
  return {
    street: row.street,
    assets: zone.assets || {},
    params,
    reach: report.reach?.[key] || null,
    findings: mine.filter((f) => f.street === key),
    populations: (params.overlay || []).includes('populations') ? populationSpots(row) : [],
    counts,
  };
}

/** A renderer that keeps one Chrome page open between renders and closes it after `idleMs`. */
export function createRenderer({ publicDir = join(GAME_DIR, 'public'), idleMs = 60_000, label = 'builder render', lockWaitMs, viewport = { width: 1280, height: 800 } } = {}) {
  let session = null;
  let idle = null;
  let queue = Promise.resolve();
  let art = new Map();

  async function open() {
    const opened = await openBrowser({ label, ...(lockWaitMs ? { waitMs: lockWaitMs } : {}) });
    try {
      const context = await opened.browser.newContext({ viewport, deviceScaleFactor: 1 });
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        const path = decodeURIComponent(url.pathname);
        const m = /^\/builder-art\/([0-9a-f]{64})$/.exec(path);
        if (m) {
          const bytes = art.get(m[1]);
          return bytes ? route.fulfill({ status: 200, body: bytes, headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' } }) : route.fulfill({ status: 404, body: '' });
        }
        const file = normalize(join(publicDir, path.endsWith('/') ? `${path}index.html` : path));
        if (!file.startsWith(publicDir) || !existsSync(file) || !statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ status: 200, body: readFileSync(file), headers: { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${ORIGIN}/builder-render/`);
      await page.waitForFunction(() => window.groddleRenderReady, null, { timeout: 30_000 });
      await page.evaluate(() => window.groddleRenderReady);
      return { ...opened, context, page, errors };
    } catch (e) {
      await opened.close();
      throw e;
    }
  }

  async function shut() {
    clearTimeout(idle);
    idle = null;
    const s = session;
    session = null;
    if (s) await s.then((x) => x.close(), () => {});
  }

  function render(input, files = {}) {
    const job = queue.then(async () => {
      clearTimeout(idle);
      art = new Map(Object.entries(files || {}).map(([sha, b64]) => [sha, Buffer.from(String(b64), 'base64')]));
      session ??= open();
      let s;
      try {
        s = await session;
      } catch (e) {
        session = null;
        throw e;
      }
      const { counts, ...pageInput } = input;
      const out = await s.page.evaluate((x) => window.groddleRender(x), pageInput);
      return { ...out, png: Buffer.from(out.png, 'base64'), counts, errors: s.errors.splice(0) };
    });
    queue = job.catch(() => {}).then(() => {
      clearTimeout(idle);
      idle = setTimeout(() => { shut().catch(() => {}); }, idleMs);
      idle.unref?.();
    });
    return job;
  }

  /**
   * How two PNGs differ, measured in the same page: the share of pixels where a channel differs by
   * more than `threshold` levels (the P1 match measure). { width, height, sameSize, differing, ratio }
   */
  function diff(a, b, { threshold = 32 } = {}) {
    const job = queue.then(async () => {
      clearTimeout(idle);
      session ??= open();
      const s = await session;
      return s.page.evaluate(async ({ a, b, threshold }) => {
        const load = async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height);
        };
        const [x, y] = await Promise.all([load(a), load(b)]);
        if (x.width !== y.width || x.height !== y.height) return { width: x.width, height: x.height, sameSize: false, differing: x.width * x.height, ratio: 1 };
        let n = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          if (Math.abs(x.data[i] - y.data[i]) > threshold || Math.abs(x.data[i + 1] - y.data[i + 1]) > threshold || Math.abs(x.data[i + 2] - y.data[i + 2]) > threshold || Math.abs(x.data[i + 3] - y.data[i + 3]) > threshold) n += 1;
        }
        return { width: x.width, height: x.height, sameSize: true, differing: n, ratio: n / (x.width * x.height) };
      }, { a: Buffer.from(a).toString('base64'), b: Buffer.from(b).toString('base64'), threshold });
    });
    queue = job.catch(() => {}).then(() => {
      clearTimeout(idle);
      idle = setTimeout(() => { shut().catch(() => {}); }, idleMs);
      idle.unref?.();
    });
    return job;
  }

  return { render, diff, close: shut, get open() { return Boolean(session); } };
}
