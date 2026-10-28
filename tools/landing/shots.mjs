/**
 * The home page's screenshots (public/landing/hero.webp and the eight
 * card-*.webp), captured from the live game one at a time.
 *
 *   node tools/landing/shots.mjs                    every shot
 *   node tools/landing/shots.mjs hero rook          just these
 *   node tools/landing/shots.mjs --out=/tmp/x       write somewhere else (to compare first)
 *   LANDING_BASE=http://127.0.0.1:8787/play/ node tools/landing/shots.mjs
 *                                                   shoot a static server of public/
 *                                                   (node tools/serve-static.mjs public 8787)
 *
 * frame 'root' keeps the whole game (top bar, street, pack); 'world' crops to
 * the street view above the pack, as tools/restoration/capture.mjs does. Each
 * shot is taken at a device scale that gives at least its output size, then
 * encoded by cwebp at about its byte budget. The quest tracker, chat dock,
 * activity feed and toasts are hidden so the scene reads cleanly; the Qurazy
 * banner is off and award screens close themselves.
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Q = '?autostart=1&fresh=1&resetgame=1&questoffer=off&questfx=0&qurazy=off&awardautoclose=1';
const HECHEY = 'GLI2V0UN7RD1T2J';
const GRODDLE_LADDER = 'GM4115NJ46G8M';
// The cards keep the 408 px street view (1280 x 860 window, viewh=408): 1280 x 544 scaled to 1200 x 511.
// Cards also hide the street nameplate, as the 2026-10-22 originals did.
const CARD = { frame: 'world', viewport: [1280, 860], scale: 2, size: [1200, 511], viewh: 408, hide: '#street-nameplate' };

export const SHOTS = Object.freeze({
  // Hechey Track: the Glitch under the fruit tree, the Sparkly Rock and two quoins to the left,
  // a chicken, the Groceries Vendor and a piggy to the right. The first Bigger Bag is open,
  // so the pack shows its items above the bags and the Red Toolbox.
  hero: {
    route: `${Q}&streetdemo=${HECHEY}&streetx=2575`,
    frame: 'root', viewport: [1304, 866], viewh: 408, scale: 1.3, size: [1600, 977], bytes: 122000, wait: 10000,
    steps: [{ click: '#pack-items > .pack-bag' }, { wait: 1200 }],
  },
  // The herb garden on Hechey Track, the fruit tree and a piggy to the right.
  grow: { ...CARD, route: `${Q}&streetdemo=${HECHEY}&streetx=3490`, bytes: 39000, wait: 10000 },
  // The metal rock by the fruit tree, Scribe's Weald's signpost to the right.
  mine: { ...CARD, route: `${Q}&rockdemo=metal`, bytes: 39000, wait: 10000 },
  // Winter Walk's snowy cliffs and icicles, the quest's timer card over them.
  quests: { ...CARD, route: `${Q}&questdemo=winter`, bytes: 64000, wait: 14000 },
  // The Rook swoops low over the climbing tree on Hechey Track.
  rook: { ...CARD, route: `${Q}&rookdemo=attack&rookfx=swoop`, bytes: 34000, wait: 11000 },
  // Grab 'Em Good, mid-race: the scores, the lead timer and Leave race.
  races: { ...CARD, route: `${Q}&racedemo=grab_em_good&raceassist=1&raceautoplay=1`, bytes: 48500, wait: 15000 },
  // The house, papered and furnished by the decorate demo (picture, reading lamp, table and chairs),
  // Decorate closed with Escape so the Decorate / Cultivate / Change Style buttons show.
  home: { ...CARD, route: `${Q}&homedemo=decorate`, bytes: 34000, wait: 12000, steps: [{ key: 'Escape' }, { wait: 1200 }] },
  // Groddle Ladder in Ix: a starry yellow sky over strange trees.
  explore: { ...CARD, route: `${Q}&streetdemo=${GRODDLE_LADDER}`, bytes: 30000, wait: 11000 },
  // The imagination shop: three upgrade cards to choose from.
  skills: { ...CARD, route: `${Q}&imgdemo=1&imglevel=12`, bytes: 47500, wait: 10000 },
});

// #crab-talk: a crab that wanders up asks for music in a dialog over the street.
const HIDE = '#play-context, #local-chat-dock, #activity-feed, #toast, .qi-hint, #crab-talk { visibility: hidden !important; }';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice(6) : join(root, 'public', 'landing');
const keys = args.filter((a) => !a.startsWith('--'));
const base = String(process.env.LANDING_BASE || 'https://groddle.localhost/play/').replace(/\/?$/, '/');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--ignore-certificate-errors', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  let done = 0;
  try {
    for (const key of keys.length ? keys : Object.keys(SHOTS)) {
      const spec = SHOTS[key];
      if (!spec) { console.log(`${key}: no such shot`); continue; }
      const [w, h] = spec.viewport;
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: spec.scale, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        const route = spec.viewh ? `${spec.route}&viewh=${spec.viewh}` : spec.route;
        await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 120000 });
        await page.addStyleTag({ content: spec.hide ? `${HIDE} ${spec.hide} { visibility: hidden !important; }` : HIDE });
        await page.waitForTimeout(spec.wait || 9000);
        for (const step of spec.steps || []) {
          if (step.click) await page.click(step.click, { timeout: 10000 }).catch((e) => errors.push(`click ${step.click}: ${e.message.split('\n')[0]}`));
          if (step.key) await page.keyboard.press(step.key);
          if (step.eval) await page.evaluate(step.eval).catch(() => {});
          if (step.wait) await page.waitForTimeout(step.wait);
        }
        const full = await page.evaluate((frame) => {
          const r = (frame === 'root' ? document.getElementById('game-root') : document.querySelector('canvas')).getBoundingClientRect();
          if (frame === 'root') {
            // The whole game: the top bar (outside #game-root) down to the pack's bottom edge.
            const top = document.querySelector('.top-bar')?.getBoundingClientRect() || r;
            return { x: r.left, y: top.top, width: r.width, height: r.bottom - top.top };
          }
          // The street view is the canvas above the 132 px pack allowance.
          const view = Number(document.querySelector('canvas')?.dataset.locationViewportHeight) || 408;
          return { x: r.left, y: r.top, width: r.width, height: r.height * (view / (view + 132)) };
        }, spec.frame);
        // Trim to the output's aspect: equal amounts off the sides, or off the bottom.
        const aspect = spec.size[0] / spec.size[1];
        const box = { ...full };
        if (full.width / full.height > aspect) {
          box.width = full.height * aspect;
          box.x = full.x + (full.width - box.width) / 2;
        } else box.height = full.width / aspect;
        const png = join(tmpdir(), `landing-${process.pid}-${key}.png`);
        const target = join(outDir, `${key === 'hero' ? 'hero' : `card-${key}`}.webp`);
        await page.screenshot({ path: png, clip: box });
        execFileSync('cwebp', ['-quiet', '-m', '6', '-pass', '6', '-size', String(spec.bytes), '-resize', String(spec.size[0]), String(spec.size[1]), png, '-o', target]);
        rmSync(png, { force: true });
        done += 1;
        console.log(`${key} -> ${target.replace(`${root}/`, '')}${errors.length ? ` (${errors.slice(0, 2).join(' | ')})` : ''}`);
      } catch (err) {
        console.log(`${key} FAILED: ${err.message.split('\n')[0]}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`${done} captured`);
}
