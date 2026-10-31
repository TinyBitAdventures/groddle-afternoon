/**
 * The home page's screenshots (public/landing/hero.webp and the eight
 * card-*.webp), each with a full-size copy for the home page's photo viewer
 * (public/landing/full/<name>.webp, 1920 wide, loaded only when a photo is
 * opened), captured from the game one at a time under the one-browser lock
 * (tools/qa/browser.mjs openBrowser, $GRODDLE_BROWSER_LOCK).
 *
 *   node tools/landing/shots.mjs                    every shot
 *   node tools/landing/shots.mjs hero rook          just these
 *   node tools/landing/shots.mjs --out=/tmp/x       write somewhere else (to compare first)
 *   LANDING_BASE=http://127.0.0.1:8787/play/ node tools/landing/shots.mjs
 *                                                   shoot a static server of a checkout's public/
 *                                                   (node tools/qa/serve.mjs public 0 prints the port)
 *
 * Shoot the checkout that is about to ship (its own served public/), not the
 * live site, so the shots show what the next release has.
 *
 * frame 'root' keeps the whole game as a player sees it in a window of the
 * viewport's size (the hero: 16:9, the top bar's pills, the street, the pack
 * floating over it); 'world' is the old 960 x 408 street view (viewh=408, the
 * pinned layout), cropped to the street above the pack's 132 px allowance, as
 * tools/restoration/capture.mjs does; any other frame is a selector, the shot
 * clipped to that element (the region map's own canvas). Each shot is taken at a device scale that gives at least its full-size
 * width, then encoded by cwebp twice: the page's copy at `size` and about
 * `bytes`, and the viewer's copy at `full` and quality FULL_Q. The quest
 * tracker, chat dock and Social drawer, notices, activity feed and toasts are
 * hidden so the scene reads cleanly; the Qurazy banner is off and award
 * screens close themselves. A card also hides the HUD that floats over the
 * street (the top bar's pills, the street map, the nameplate) unless it says
 * otherwise. `storage` seeds localStorage before the game loads (the zoom
 * level, the Social drawer folded to its rail).
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Q = '?autostart=1&fresh=1&resetgame=1&questoffer=off&questfx=0&qurazy=off&awardautoclose=1';
const HECHEY = 'GLI2V0UN7RD1T2J';
const GRODDLE_LADDER = 'GM4115NJ46G8M';

/** The viewer's copy: 1920 wide, the shot's own aspect. */
export const FULL_W = 1920;
/** cwebp quality for the viewer's copy: sharp at full size, about 60 to 250 KB a shot. */
const FULL_Q = 84;
// The cards keep the 408 px street view (1280 x 860 window, viewh=408): 1280 x 544 scaled to 1200 x 511.
// Cards hide the HUD floating over the street, as the 2026-10-22 originals did.
const CARD_HIDE = '#street-nameplate, .top-bar, #street-minimap, #street-minimap-show';
const CARD = { frame: 'world', viewport: [1280, 860], scale: 2, size: [1200, 511], full: [FULL_W, 818], viewh: 408, hide: CARD_HIDE };

export const SHOTS = Object.freeze({
  // Hechey Track in the whole 16:9 game, the Zoom slider halfway (groddle.zoom 0.5, so the Grand
  // Mile signpost fits): the Glitch under the fruit tree, the Sparkly Rock to the left, the herb
  // garden and a chicken to the right; the top bar's three pills, the street map top right and the
  // pack below. bagdemo=hero carries a few gathered things loose and the tools on their row;
  // daylight, and no Enter hint.
  hero: {
    route: `${Q}&bagdemo=hero&prompt=off&timedemo=day&streetdemo=${HECHEY}&streetx=2575`,
    frame: 'root', viewport: [1600, 900], scale: 1.2, size: [1600, 900], full: [FULL_W, 1080],
    bytes: 100000, wait: 10000, storage: { 'groddle.zoom': '0.5' },
  },
  // The herb garden on Hechey Track, the fruit tree and a piggy to the right.
  grow: { ...CARD, route: `${Q}&prompt=off&timedemo=day&streetdemo=${HECHEY}&streetx=3490`, bytes: 39000, wait: 10000 },
  // The metal rock by the fruit tree, Scribe's Weald's signpost to the right.
  mine: { ...CARD, route: `${Q}&prompt=off&timedemo=day&rockdemo=metal`, bytes: 39000, wait: 10000 },
  // Winter Walk's snowy cliffs and icicles, the quest's timer card over them.
  quests: { ...CARD, route: `${Q}&questdemo=winter`, bytes: 64000, wait: 14000 },
  // The Rook swoops low over the climbing tree on Hechey Track, its health badge top right.
  // 18 s: past the red ROOK ATTACK! flash, its wings spread on the swoop.
  rook: { ...CARD, route: `${Q}&prompt=off&timedemo=day&rookdemo=attack&rookfx=swoop`, bytes: 34000, wait: 18000 },
  // Grab 'Em Good, mid-race: the scores, the lead timer and Leave race. 26 s: past READY? 3 2 1 GO!, and
  // the last quoin's "+10 mood" clear of the Glitch's face.
  races: { ...CARD, route: `${Q}&racedemo=grab_em_good&raceassist=1&raceautoplay=1`, bytes: 48500, wait: 26000 },
  // Decoration Mode in the house the decorate demo papered and furnished: the whole game in a
  // window of the card's own shape, the room full-screen under the "You are in Decoration Mode"
  // banner, the tray of furniture tiles with its tabs and filters where the pack was.
  home: {
    ...CARD, frame: 'root', viewport: [1280, 545], viewh: 0, hide: '#street-nameplate, .top-bar',
    route: `${Q}&homedemo=decorate`, bytes: 40000, wait: 12000,
  },
  // The Groddle Forest region map (G opens it on Hechey Track): every street, the red star where
  // you are, the GO buttons to the next regions, and the vendor, shrine and subway icons. The card
  // is the map itself, its middle band.
  explore: {
    ...CARD, frame: '#map-canvas', align: 'center', viewport: [1600, 900], scale: 2.5, viewh: 0,
    route: `${Q}&prompt=off&timedemo=day&streetdemo=${HECHEY}`, bytes: 52000, wait: 10000,
    steps: [{ key: 'g' }, { wait: 2500 }],
  },
  // The imagination shop: three upgrade cards to choose from. Its footer is hidden: the panel is
  // taller than the street view, and a cut-off button would show.
  skills: { ...CARD, route: `${Q}&imgdemo=1&imglevel=12`, bytes: 47500, wait: 10000, hide: `${CARD_HIDE}, .img-foot` },
});

/** Every shot starts with the Social drawer folded to its rail (it opens by default at 1440 px wide and up). */
const STORAGE = { 'groddle-social-drawer': 'rail' };

// #crab-talk: a crab that wanders up asks for music in a dialog over the street.
const HIDE = '#play-context, #local-chat-dock, #notify-notices, #activity-log, .qi-hint, #crab-talk';

/** Where a shot's two files go, relative to the output folder, and their sizes. */
export function shotFiles(key) {
  const spec = SHOTS[key];
  const name = key === 'hero' ? 'hero' : `card-${key}`;
  return {
    page: { path: `${name}.webp`, size: spec.size },
    full: { path: `full/${name}.webp`, size: spec.full },
  };
}

/**
 * The box to clip from `full` (the frame's rect) to reach the output's aspect: equal amounts off
 * the sides, or off the bottom (`align: 'center'`: equal amounts off the top and the bottom).
 */
export function clipToAspect(full, size, align = 'top') {
  const aspect = size[0] / size[1];
  const box = { ...full };
  if (full.width / full.height > aspect) {
    box.width = full.height * aspect;
    box.x = full.x + (full.width - box.width) / 2;
  } else {
    box.height = full.width / aspect;
    if (align === 'center') box.y = full.y + (full.height - box.height) / 2;
  }
  return box;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { openBrowser } = await import('../qa/browser.mjs');
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='));
  const outDir = outArg ? outArg.slice(6) : join(root, 'public', 'landing');
  const keys = args.filter((a) => !a.startsWith('--'));
  const base = String(process.env.LANDING_BASE || 'https://groddle.localhost/play/').replace(/\/?$/, '/');
  mkdirSync(join(outDir, 'full'), { recursive: true });
  const { browser, close } = await openBrowser({ label: 'landing shots', extra: ['--ignore-certificate-errors', '--ignore-gpu-blocklist'] });
  let done = 0;
  try {
    for (const key of keys.length ? keys : Object.keys(SHOTS)) {
      const spec = SHOTS[key];
      if (!spec) { console.log(`${key}: no such shot`); continue; }
      const [w, h] = spec.viewport;
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: spec.scale, ignoreHTTPSErrors: true });
      await context.addInitScript((pairs) => {
        try { for (const [k, v] of Object.entries(pairs)) localStorage.setItem(k, v); } catch { /* a private window */ }
      }, { ...STORAGE, ...(spec.storage || {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        const route = spec.viewh ? `${spec.route}&viewh=${spec.viewh}` : spec.route;
        await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 120000 });
        await page.addStyleTag({ content: `${[HIDE, spec.hide].filter(Boolean).join(', ')} { visibility: hidden !important; }` });
        await page.waitForTimeout(spec.wait || 9000);
        for (const step of spec.steps || []) {
          if (step.click) await page.click(step.click, { timeout: 10000 }).catch((e) => errors.push(`click ${step.click}: ${e.message.split('\n')[0]}`));
          if (step.key) await page.keyboard.press(step.key);
          if (step.eval) await page.evaluate(step.eval).catch(() => {});
          if (step.wait) await page.waitForTimeout(step.wait);
        }
        const full = await page.evaluate((frame) => {
          const el = frame === 'root' ? document.getElementById('game-root') : frame === 'world' ? document.querySelector('canvas') : document.querySelector(frame);
          if (!el) throw new Error(`no ${frame} on the page`);
          const r = el.getBoundingClientRect();
          if (frame !== 'world') return { x: r.left, y: r.top, width: r.width, height: r.height };
          // The street view is the canvas above the 132 px pack allowance.
          const view = Number(document.querySelector('canvas')?.dataset.locationViewportHeight) || 408;
          return { x: r.left, y: r.top, width: r.width, height: r.height * (view / (view + 132)) };
        }, spec.frame);
        const box = clipToAspect(full, spec.size, spec.align);
        const png = join(tmpdir(), `landing-${process.pid}-${key}.png`);
        const files = shotFiles(key);
        await page.screenshot({ path: png, clip: box });
        // The page's copy aims at a byte budget; the viewer's copy at a fixed quality (FULL_Q).
        const encode = (size, budget, rel) => {
          const target = join(outDir, rel);
          execFileSync('cwebp', ['-quiet', '-m', '6', '-pass', '6', ...budget, '-resize', String(size[0]), String(size[1]), png, '-o', target]);
          return `${rel} ${Math.round(statSync(target).size / 1024)} KB`;
        };
        const made = [
          encode(files.page.size, ['-size', String(spec.bytes)], files.page.path),
          encode(files.full.size, ['-q', String(FULL_Q)], files.full.path),
        ];
        rmSync(png, { force: true });
        done += 1;
        console.log(`${key} -> ${made.join(', ')}${errors.length ? ` (${errors.slice(0, 2).join(' | ')})` : ''}`);
      } catch (err) {
        console.log(`${key} FAILED: ${err.message.split('\n')[0]}`);
      }
      await context.close();
    }
  } finally {
    await close();
  }
  console.log(`${done} captured`);
}
