/**
 * Check the Butler rig against the recovered OGA sheets, and render QA sheets.
 *
 *   node tools/avatar-compositor/butler-score.mjs              score the three looks -> butler-score.json
 *   node tools/avatar-compositor/butler-score.mjs --sheet=out.png [--scale=3] [--clip=idle0] [--frame=0] [--frames=0,8,16]
 *        [--looks=v10,v11,v22] [--random=9] [--seed=7] [--bg=#f3ecd9]   (the OGA looks, then seeded random butlers)
 *   node tools/avatar-compositor/butler-score.mjs --time      ms per 3x frame paint
 *
 * Scoring: for each OGA look (js/butler.js BUTLER_LOOKS: the whole-butler
 * sheets in the OGA archive, ~/Documents/glitch-audit/opengameart/extracted_butler,
 * served as /oga-butler/<look>/<clip>.png; the game ships only Look 1's idle0
 * and walk4 as its loading fallback), finds where the doll origin sits in the
 * cells (best idle0 silhouette overlap), then the silhouette IoU of every
 * frame of every shipped clip at that spot, and the game anchor in doll
 * units (js/butler-rig.js BUTLER_FEET).
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUTLER_LOOKS } from '../../public/js/butler.js?v=814ee05f';
import { BUTLER_OPTIONS } from './butler.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PUBLIC = join(ROOT, 'public');
const OGA_BUTLER = join(homedir(), 'Documents/glitch-audit/opengameart/extracted_butler/glitch-assets/butler');

/** The OGA archive sheet of a look's clip (file names list the parts alphabetically, then _x1_<clip>_png_<stamp>). */
function ogaButlerFile(lookId, clip) {
  const look = BUTLER_LOOKS.find((l) => l.id === lookId);
  if (!look || !existsSync(OGA_BUTLER)) return null;
  const head = `bag_butler_${Object.keys(look.parts).sort().map((k) => `${k}_${look.parts[k]}`).join('_')}_x1_${clip}_png_`;
  const hit = readdirSync(OGA_BUTLER).find((f) => f.startsWith(head) && f.endsWith('.png'));
  return hit ? join(OGA_BUTLER, hit) : null;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

function serve() {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const oga = url.match(/^\/oga-butler\/(\w+)\/(\w+)\.png$/);
      const file = oga ? ogaButlerFile(oga[1], oga[2]) : url.startsWith('/tools/') ? join(ROOT, url) : join(PUBLIC, url);
      if (!file || (!oga && !file.startsWith(ROOT)) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}

async function withPage(fn) {
  const { chromium } = await import('playwright');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/avatar-compositor/butler-harness.html`);
    await page.waitForFunction(() => window.harnessReady === true);
    const out = await fn(page);
    if (errors.length) console.log('page errors:', errors.slice(0, 5));
    return out;
  } finally {
    await browser.close();
    server.close();
  }
}

/** Seeded random part choices (mulberry32). */
export function randomParts(n, seed = 7) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => Object.fromEntries(Object.entries(BUTLER_OPTIONS).map(([k, list]) => [k, list[Math.floor(rand() * list.length)]])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
  if (opt('sheet')) {
    const looks = opt('looks', 'v10,v11,v22').split(',').filter(Boolean);
    const combos = [...BUTLER_LOOKS.filter((l) => looks.includes(l.id)).map((l) => l.parts), ...randomParts(Number(opt('random', 9)), Number(opt('seed', 7)))];
    const frames = opt('frames') ? opt('frames').split(',').map(Number) : null;
    const url = await withPage((page) => page.evaluate(({ combos: c, o }) => window.renderSheet(c, o), {
      combos,
      o: { scale: Number(opt('scale', 3)), clip: opt('clip', 'idle0'), frame: Number(opt('frame', 0)), frames, bg: opt('bg', null) },
    }));
    writeFileSync(resolve(opt('sheet')), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${opt('sheet')}: ${combos.length} butlers`);
  } else if (args.includes('--time')) {
    const ms = await withPage((page) => page.evaluate((p) => window.timeClip(p, 'idle1', 3), BUTLER_LOOKS[0].parts));
    console.log(`idle1 at 3x: ${ms.toFixed(2)} ms per frame`);
  } else {
    const out = await withPage(async (page) => {
      const rows = [];
      for (const l of BUTLER_LOOKS) rows.push(await page.evaluate((id) => window.scoreLook(id), l.id));
      return rows;
    });
    for (const r of out) {
      const clips = Object.entries(r.clips).map(([k, v]) => `${k} ${v.mean}${v.frames !== v.rigFrames ? `(${v.frames}/${v.rigFrames})` : ''}`).join(', ');
      console.log(`${r.look}: origin ${r.origin.x},${r.origin.y} feet ${r.feet.x},${r.feet.y} idle0 ${r.idle0}\n  ${clips}`);
    }
    writeFileSync(join(HERE, 'butler-score.json'), `${JSON.stringify(out, null, 1)}\n`);
  }
}
