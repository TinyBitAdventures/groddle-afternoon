#!/usr/bin/env node
/**
 * LEVEL BUILDER: a scripted play-test of a draft (spec 6.8, 7.4; P7). For each street it opens the
 * draft's play-test in Chrome, sets the avatar down at an arrival, and walks to each signpost and
 * door the way the validator says a keyboard player can (js/builder/reach-graph.js reachRoutes),
 * with real key presses, then reports which it reached.
 *
 *   node tools/builder/playtest.mjs --draft mossy-hollow [--street lane] [--json]
 *        [--url https://groddle.localhost] [--game <checkout>/public] [--shots <dir>]
 *
 * - The play-test route (GET drafts/<id>/play) takes an administrator's session, never a builder
 *   key, so the script signs in with a one-time link minted on this machine (admin-session.mjs,
 *   `minn login`). Run it on the machine that serves the site.
 * - `--game <dir>` answers the game's own files from a checkout's public/ (to test game changes
 *   before they are synced); the site's routes stay the site's.
 * - Quest offers never open in a draft play-test (they are never part of a zone), and this page
 *   adds `questoffer=off` as well, so nothing takes the keyboard mid-jump.
 * - It takes the shared browser lock (tools/qa/browser.mjs; GRODDLE_BROWSER_LOCK names the slot).
 *
 * The QA hooks it uses (game.js window.groddleQA, all read-only but placeAvatar):
 *   groddleQA.snapshot()        street, player {x, y, vx, vy, onGround, climbing}, signposts, busy
 *   groddleQA.idleState()       the avatar's x, y, vx, vy, onGround, climbing, cheaply, every frame
 *   groddleQA.placeAvatar(x, y) set the avatar down at a screen-space spot (street top-left origin)
 *   groddleQA.streetDeco(id)    a placed deco as drawn
 * Keys go in as KeyboardEvents on window (the game reads e.key: ArrowLeft/Right, Space, ArrowUp).
 *
 * Exit status: 0 every exit reached; 1 one or more missed; 2 could not run.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { reachRoutes } from '../../public/js/builder/reach-graph.js?v=0eb97168';
import { zoneArrivals } from '../../public/js/builder/validate.js?v=faa3883f';

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.jpg': 'image/jpeg', '.atlas': 'text/plain', '.xml': 'text/xml' };
const SITE_ONLY = /^\/(wp-json|wp-admin|wp-login\.php|console|minn-admin|wp-content|minn|builder-art)(\/|$)/;

/**
 * In the page: a keyboard player, frame by frame (requestAnimationFrame), so a jump leaves where
 * it is meant to within a frame. window.__keyboard.{ place, settle, walkTo, jump, climb }.
 */
export function installKeyboard() {
  if (window.__keyboard) return;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const st = () => window.groddleQA.idleState();
  const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const SIDE = { '-1': 'ArrowLeft', 1: 'ArrowRight' };
  const release = () => { for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ']) key('keyup', k); };
  async function settle(frames = 120) {
    let still = 0;
    let prev = st();
    for (let i = 0; i < frames; i += 1) {
      await frame();
      const s = st();
      still = s.onGround && Math.abs(s.x - prev.x) < 0.05 && Math.abs(s.y - prev.y) < 0.05 ? still + 1 : 0;
      if (still >= 3) return s;
      prev = s;
    }
    return st();
  }
  async function place(x, y) {
    release();
    window.groddleQA.placeAvatar(x, y - 2);
    return settle();
  }
  /** Waits for a landing after leaving the floor; returns where, the takeoff and the air frames. */
  async function landing(maxFrames = 360) {
    let air = 0;
    let takeoff = null;
    let last = st();
    for (let i = 0; i < maxFrames; i += 1) {
      await frame();
      const s = st();
      if (!s.onGround) {
        if (!air) takeoff = { x: last.x, y: last.y, vx: last.vx };
        air += 1;
      } else if (air >= 2 || (air && s.climbing)) return { x: s.x, y: s.y, takeoff, air };
      last = s;
    }
    return { x: st().x, y: st().y, takeoff, air, lost: true };
  }
  /** Walks to x (holding the key, letting go early enough to stop near it). */
  async function walkTo(x, tol = 4) {
    for (let tries = 0; tries < 4; tries += 1) {
      const s = st();
      if (Math.abs(s.x - x) <= tol) break;
      const dir = x > s.x ? 1 : -1;
      key('keydown', SIDE[dir]);
      for (let i = 0; i < 600; i += 1) {
        await frame();
        const t = st();
        // Coasting from a walk stops in about its speed times 4 px.
        if (dir * (x - t.x) <= Math.max(tol, Math.abs(t.vx) * 4) || !t.onGround) break;
      }
      key('keyup', SIDE[dir]);
      await settle(60);
    }
    return st();
  }
  /**
   * A jump as the validator models it. Standing (`run` false): from where the avatar stands, the
   * side key (if any) and Space together. Running: from `runFrom`, hold the side and press Space
   * on the frame the avatar would pass `x`. Air (`airJumpAt`): run off the ledge's end and press
   * Space that many frames into the fall. Holds the side until it lands.
   */
  async function jump({ x, dir = 0, run = false, runFrom = null, airJumpAt = null }) {
    const side = SIDE[dir];
    if (airJumpAt != null || run) {
      if (runFrom != null) await walkTo(runFrom, 3);
      key('keydown', side);
      let air = -1;
      for (let i = 0; i < 600; i += 1) {
        await frame();
        const s = st();
        if (airJumpAt == null && dir * (s.x + s.vx - x) >= 0) { key('keydown', ' '); break; }
        if (airJumpAt != null) {
          if (!s.onGround) air += 1;
          // The press lands on the next frame: send it one frame ahead.
          if (air >= airJumpAt - 1 && air >= 0) { key('keydown', ' '); break; }
        }
      }
    } else {
      if (side) key('keydown', side);
      key('keydown', ' ');
    }
    await frame();
    key('keyup', ' ');
    const out = await landing();
    release();
    await settle(30);
    return out;
  }
  /** Up a ladder at x to its deck (or Down off it). */
  async function climb(x, upKey = 'ArrowUp') {
    await walkTo(x, 6);
    key('keydown', upKey);
    let was = false;
    for (let i = 0; i < 900; i += 1) {
      await frame();
      const s = st();
      if (s.climbing) was = true;
      if (was && !s.climbing && s.onGround) break;
    }
    key('keyup', upKey);
    return settle(60);
  }
  window.__keyboard = { place, settle, walkTo, jump, climb, state: st };
}

/** Plays one reachRoutes step in the page. */
export async function playStep(page, step) {
  return page.evaluate(async (s) => {
    const k = window.__keyboard;
    if (s.kind === 'walk') return k.walkTo(s.x, 6);
    if (s.kind === 'jump') {
      if (s.run) return k.jump({ x: s.x, dir: s.dir, run: true, runFrom: s.x - s.dir * 60 });
      await k.walkTo(s.x, 3);
      return k.jump({ x: s.x, dir: s.dir });
    }
    if (s.kind === 'fall') return k.walkTo(s.x + (s.dir || 1) * 30, 4);
    if (s.kind === 'air') return k.jump({ x: s.x, dir: s.dir, airJumpAt: s.airJumpAt, runFrom: s.x - s.dir * 60 });
    if (s.kind === 'mount') return k.climb(s.x);
    if (s.kind === 'deck') return k.state();
    return { skipped: s.kind };
  }, step);
}

/** Opens a draft's play-test in a signed-in page (game files from `game` when given). */
export async function openPlaytest({ browser, url, cookie, draft, street, game = null }) {
  const host = new URL(url).hostname;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await ctx.addCookies(cookie.split('; ').map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: host, path: '/', secure: url.startsWith('https') }; }));
  if (game) {
    await ctx.route(`${url}/**`, async (route) => {
      let p = decodeURIComponent(new URL(route.request().url()).pathname);
      if (SITE_ONLY.test(p)) return route.continue();
      if (p.endsWith('/')) p += 'index.html';
      const file = join(game, p);
      if (!file.startsWith(game) || !existsSync(file) || !statSync(file).isFile()) return route.continue();
      return route.fulfill({ status: 200, path: file, headers: { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
    });
  }
  await ctx.addInitScript(installKeyboard);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${url}/play/?practice=1&autostart=1&questoffer=off&draft=${encodeURIComponent(draft)}&street=${encodeURIComponent(street)}`);
  await page.waitForFunction(() => window.groddleQA?.snapshot?.()?.street?.tsid, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  return { ctx, page, errors };
}

/** Whether the avatar stands where the validator counts an exit as reached. */
export function atExit(a, r) {
  if (!a || !a.onGround) return false;
  return Math.abs(a.x - r.x) <= (r.kind === 'door' ? 100 : 120) && a.y <= r.y + 60 && a.y >= r.y - 200;
}

/** Runs the play-test of one street; returns [{ id, reached, steps, at, why }]. */
export async function playStreet(page, zone, key, { shots = null } = {}) {
  const row = zone.streets.find((s) => s.key === key);
  const street = row.street;
  const arrival = (zoneArrivals(zone).get(key) || [])[0] || null;
  const floor = (street.platforms || []).filter((p) => p.pc_perm === -1 || p.pc_perm == null || p.pc_perm === undefined);
  const start = arrival || { x: (street.signposts?.[0]?.x ?? 0) - street.bounds.l, y: (floor[0]?.y1 ?? -60) - street.bounds.t, from: 'post' };
  const { routes } = reachRoutes(street, start);
  const out = [];
  for (const r of routes) {
    if (!r.steps) {
      out.push({ id: r.id, reached: false, why: 'the validator finds no way there' });
      continue;
    }
    await page.evaluate(([x, y]) => window.__keyboard.place(x, y), [start.x, start.y]);
    let a = null;
    let n = 0;
    for (const step of r.steps) {
      a = await playStep(page, step);
      n += 1;
      if (a?.skipped) break;
    }
    a = await page.evaluate(() => window.__keyboard.state());
    const reached = atExit(a, r);
    if (shots) await page.screenshot({ path: join(shots, `${key}-${r.id}.png`) });
    out.push({ id: r.id, reached, steps: r.steps.length, played: n, at: { x: Math.round(a.x), y: Math.round(a.y) }, ...(reached ? {} : { why: `stopped at ${Math.round(a.x)}, ${Math.round(a.y)}` }) });
  }
  return out;
}

async function main(argv) {
  const arg = (name, dflt = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
  const draft = arg('draft');
  if (!draft) {
    process.stderr.write('playtest --draft <id> [--street k] [--json] [--url U] [--game <dir>/public] [--shots <dir>]\n');
    return 2;
  }
  const url = (arg('url') || process.env.GRODDLE_BUILDER_URL || 'https://groddle.localhost').replace(/\/+$/, '');
  const game = arg('game') ? resolve(arg('game')) : null;
  const shots = arg('shots') ? resolve(arg('shots')) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  const { adminSession } = await import('./admin-session.mjs');
  const { openBrowser } = await import('../qa/browser.mjs');
  const admin = await adminSession({ webroot: process.env.GRODDLE_WEBROOT || join(homedir(), 'Cove/Sites/groddle.localhost/public'), url });
  const got = await admin.call('GET', `admin/builder/drafts/${encodeURIComponent(draft)}`);
  if (got.status !== 200) {
    process.stderr.write(`No draft ${draft} (${got.status}).\n`);
    return 2;
  }
  const zone = got.data;
  const keys = arg('street') ? [arg('street')] : zone.streets.map((s) => s.key);
  const { browser, close } = await openBrowser({ label: `playtest ${draft}`, waitMs: 600000 });
  const report = {};
  try {
    for (const key of keys) {
      const { ctx, page, errors } = await openPlaytest({ browser, url, cookie: admin.cookie(), draft, street: key, game });
      report[key] = { exits: await playStreet(page, zone, key, { shots }), errors };
      await ctx.close();
    }
  } finally {
    await close();
  }
  const missed = Object.values(report).flatMap((r) => r.exits).filter((e) => !e.reached);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(report)}\n`);
  else {
    for (const [key, r] of Object.entries(report)) {
      for (const e of r.exits) process.stdout.write(`${e.reached ? 'reached' : 'MISSED '} ${key}/${e.id}${e.why ? `  ${e.why}` : ''}\n`);
      if (r.errors.length) process.stdout.write(`  page errors on ${key}: ${r.errors.slice(0, 3).join(' | ')}\n`);
    }
  }
  return missed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stderr.write(`${e.stack || e}\n`); process.exit(2); });
}
