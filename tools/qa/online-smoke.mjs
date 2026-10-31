#!/usr/bin/env node
/**
 * The two-player smoke check for /play/online/: two throwaway players meet on one street.
 *
 *   node tools/qa/online-smoke.mjs --local                 https://groddle.localhost
 *   node tools/qa/online-smoke.mjs --live                  prints what it would make, exits 2
 *   node tools/qa/online-smoke.mjs --live --yes            https://groddleafternoon.com
 *   node tools/qa/online-smoke.mjs --local --sweep         only remove leftovers of earlier runs
 *     --out=<dir>       summary.json and the shots (default <tmp>/groddle-online-smoke/<mode>-<stamp>)
 *     --settle=<s>      wait before each cleanup pass, for the realtime server's last credits (default 20)
 *     --timeout=<s>     stop the checks after this long and clean up (default 900)
 *     --load=<s>        how long each player may take to reach the street (default 180)
 *     --headed          show the browser
 *     --game=<dir>      (local) serve the game's files from this folder (a checkout's public/, say
 *                       with a published zone in it) instead of the synced build: every request for
 *                       a path whose first part is in <dir> is answered from <dir>; the site's own
 *                       paths (wp-*, minn, /console/) still go to the site
 *
 * Checks: 1 both players get in (signed in, online, both on the street); 2 Local chat both
 * ways; 3 a party invite from the player menu, the Party tab on both, /p goes to the party,
 * then leaving ends it; 4 the pack's save cloud tooltip reads "Playing as <name> · Saved";
 * 5 a Reports round trip (local only): the player files a report, a throwaway administrator
 * replies from /console/, the reply mail is recorded, the player sees the badge and the reply
 * and closes the report; 6 a fresh player starts at the Original zoom (- steps to 90%, 0
 * resets); 7 no page errors; 8 (with --game and a published zone in it) published zones stay
 * out of multiplayer: the served index lists zone streets, the game's street index on the online
 * page has none, and no arm on a shipped street leads into one (docs/level-builder/spec.md 15, Q6).
 *
 * Players: local signs up through POST groddle/v1/players (the site's instant sign-up option
 * covers zz-*@groddle.localhost). Live has no instant sign-up and no mail to read, so it holds
 * two sign-ups by SQL (the sha256 of a known token, a Minn password hash made on the server)
 * and opens /play/online/#verify=<token>, as the dev-glitch-game skill's "Live QA without
 * mail". Live never files a report (the console reply would mail a fake address) and skips
 * chat and the party when someone else is on the street.
 *
 * Cleanup always runs, after a failure, a timeout or Ctrl-C too: two passes (the second
 * catches the realtime server's late credits) through smoke-cleanup.mjs, scoped to this run's
 * addresses and to ids above the starting MAX(ID). Users 1 and 54 are never touched. The run
 * passes only when every check passes and the cleanup reads zero. The browser lock
 * (browser-lock.mjs) is held only while Chrome is open. Live SQL goes over the SSH address in
 * ~/.config/groddle/deploy.env (GRODDLE_KINSTA_SSH, GRODDLE_KINSTA_PORT).
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { openBrowser } from './browser.mjs';
import { emailHash, runCleanup, throwawayPattern } from './smoke-cleanup.mjs';

// —— options ——
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const MODE = flag('live') ? 'live' : flag('local') ? 'local' : null;
if (!MODE || (flag('live') && flag('local'))) {
  console.error('usage: node tools/qa/online-smoke.mjs --local | --live [--yes] [--sweep] [--out=<dir>] [--settle=<s>] [--timeout=<s>] [--headed]');
  process.exit(2);
}
const LIVE = MODE === 'live';
const SITE = LIVE ? 'https://groddleafternoon.com' : (process.env.GRODDLE_LOCAL_SITE || 'https://groddle.localhost');
const LOCAL_WP = process.env.GRODDLE_LOCAL_WP || join(homedir(), 'Cove', 'Sites', 'groddle.localhost', 'public');
const DEPLOY_ENV = join(homedir(), '.config', 'groddle', 'deploy.env');
const STAMP = String(Date.now() % 1000000).padStart(6, '0');
const PAT = throwawayPattern(MODE, STAMP);
const SETTLE_MS = Number(value('settle', 20)) * 1000;
const TIMEOUT_MS = Number(value('timeout', 900)) * 1000;
const LOAD_MS = Number(value('load', 180)) * 1000;
const GAME = value('game', '') ? resolve(value('game', '')) : null;
if (GAME && (LIVE || !existsSync(join(GAME, 'play', 'online', 'index.html')))) {
  console.error(LIVE ? '--game is for --local only' : `--game=${GAME}: no play/online/index.html there (name a game checkout's public/ folder)`);
  process.exit(2);
}
const ZONES = GAME && existsSync(join(GAME, 'assets', 'zones')) ? readdirSync(join(GAME, 'assets', 'zones')).filter((f) => f.endsWith('.json')) : [];
const CHECK_IDS = ['1-both-in', '2-local-chat', '3-party', '4-save-cloud', '5-reports', '6-zoom-original', '7-no-page-errors', ...(ZONES.length ? ['8-zones-solo-only'] : [])];
const OUT = resolve(value('out', join(tmpdir(), 'groddle-online-smoke', `${MODE}-${STAMP}`)));
const W = 1440;
const H = 900;
const START_STREET = 'LIF12PMQ5121D68';

const who = (key) => ({ key, email: PAT.email(key), name: `Zz Smoke ${key === 'admin' ? 'M' : key.toUpperCase()}${STAMP}`, password: `zz-smoke-${randomBytes(9).toString('hex')}` });

// —— the database: local wp db query, or the live one over SSH (SQL on stdin, so $ survives) ——
function readDeployEnv() {
  const env = Object.fromEntries(readFileSync(DEPLOY_ENV, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^export\s+/, ''), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }));
  if (!env.GRODDLE_KINSTA_SSH || !env.GRODDLE_KINSTA_PORT) throw new Error(`${DEPLOY_ENV} needs GRODDLE_KINSTA_SSH and GRODDLE_KINSTA_PORT`);
  return env;
}
let q;
let remote;
if (LIVE) {
  const env = readDeployEnv();
  const ssh = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-p', env.GRODDLE_KINSTA_PORT, env.GRODDLE_KINSTA_SSH];
  remote = (cmd, input) => execFileSync('ssh', [...ssh, cmd], { input, encoding: 'utf8', timeout: 120000 }).trim();
  q = (sql) => remote('cd ~/public && wp db query --skip-column-names', sql);
} else {
  q = (sql) => execFileSync('wp', ['db', 'query', '--skip-column-names'], { cwd: LOCAL_WP, input: sql, encoding: 'utf8', timeout: 120000 }).trim();
}

// —— --sweep: only remove what earlier runs left ——
if (flag('sweep')) {
  if (LIVE && !flag('yes')) { console.error('--live --sweep deletes zz-smoke-*@example.com users on production; add --yes'); process.exit(2); }
  const any = throwawayPattern(MODE, null);
  const r = runCleanup(q, { like: any.like, re: any.re, minId: 1 });
  console.log(JSON.stringify({ mode: MODE, sweep: true, removed: r.ids, emails: r.emails, skipped: r.skipped, left: r.left }, null, 2));
  process.exit(r.left.total === 0 ? 0 : 1);
}

// —— --live without --yes: say what it will do ——
const PLAN = {
  mode: MODE,
  site: SITE,
  stamp: STAMP,
  creates: LIVE
    ? [
      `2 held sign-ups in wp_groddle_signups (${PAT.email('a')}, ${PAT.email('b')}), verified through /play/online/#verify=<token>`,
      `2 players: "${who('a').name}" and "${who('b').name}" (subscribers), their saves (seeded past the tutorial on ${START_STREET}), realtime sessions, a short Local chat and a party between them if nobody else is on that street`,
      'no report, no mail, no admin login',
    ]
    : [
      `3 players by instant sign-up: ${PAT.email('a')}, ${PAT.email('b')} and ${PAT.email('admin')} (made an administrator for the /console/ reply)`,
      'their saves, a report ticket with a reply and its mail (Mailpit)',
    ],
  removes: `everything keyed to ${PAT.like} with ids above the current MAX(ID); never users 1 or 54`,
  out: OUT,
};
if (LIVE && !flag('yes')) {
  console.log(JSON.stringify(PLAN, null, 2));
  console.log('\nThis writes to PRODUCTION. Run again with --live --yes to go ahead.');
  process.exit(2);
}

mkdirSync(join(OUT, 'shots'), { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { mode: MODE, site: SITE, stamp: STAMP, startedAt: new Date().toISOString(), pass: false, checks: {}, players: [], notes: [], errors: {}, cleanup: [], out: OUT };
const note = (...a) => { const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); R.notes.push(s); };
const check = (id, pass, data = {}) => { R.checks[id] = { pass: Boolean(pass), ...data }; console.log('CHECK', id, pass ? 'PASS' : 'FAIL', JSON.stringify(data).slice(0, 600)); };
const skip = (id, why) => { R.checks[id] = { pass: true, skipped: why }; console.log('CHECK', id, 'SKIP', why); };
const shot = async (page, name, opts = {}) => { const f = join(OUT, 'shots', `${name}.png`); await page.screenshot({ path: f, ...opts }); return f; };

// —— stopping: Ctrl-C, SIGTERM and the timeout all end the checks, then clean up ——
let aborted = null;
let session = null;
const abort = (why) => {
  if (aborted) { console.log('stopping now'); process.exit(130); }
  aborted = why;
  console.log(`stopping (${why}); cleaning up first`);
  session?.close();
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => abort(sig));
const timer = setTimeout(() => abort(`timeout after ${TIMEOUT_MS / 1000} s`), TIMEOUT_MS);
const alive = () => { if (aborted) throw new Error(`stopped: ${aborted}`); };

const MIN_ID = Number(q('SELECT COALESCE(MAX(ID), 0) FROM wp_users'));
if (!Number.isInteger(MIN_ID) || MIN_ID < 54) throw new Error(`unexpected MAX(ID) ${MIN_ID}`);
R.minId = MIN_ID;
const players = [];
const madeIds = [];

function guardId(id, what) {
  if (!Number.isInteger(id) || id <= MIN_ID || id === 1 || id === 54) throw new Error(`${what}: unexpected id ${id}`);
  madeIds.push(id);
  return id;
}

function watch(pl) {
  pl.p.on('pageerror', (e) => { pl.errors.push(e.message.slice(0, 400)); console.log(pl.key, 'pageerror', e.message.slice(0, 300)); });
  pl.p.on('console', (m) => { if (m.type() === 'error') pl.consoleErrors.push(m.text().slice(0, 300)); });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.atlas': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const SITE_OWNS = /^(wp-|minn$|index\.php$|console$|wp-json$)/;

/** --game: answer the game's paths from a local folder, the rest from the site. */
async function routeGame(ctx) {
  const top = new Set(readdirSync(GAME).filter((n) => !SITE_OWNS.test(n)));
  await ctx.route((url) => url.origin === SITE && top.has(decodeURIComponent(url.pathname.split('/')[1] || '')), async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    let file = resolve(join(GAME, path));
    if (!file.startsWith(GAME)) return route.fulfill({ status: 403, body: '' });
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
  });
}

async function newContext() {
  const ctx = await session.browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: !LIVE });
  try { await ctx.grantPermissions(['local-network-access'], { origin: SITE }); } catch {}
  if (GAME) await routeGame(ctx);
  return ctx;
}

async function nonceOf(ctx) {
  return (await (await ctx.request.get(`${SITE}/wp-admin/admin-ajax.php?action=rest-nonce`)).text()).trim();
}

async function seedSave(pl) {
  const nonce = await nonceOf(pl.ctx);
  const systems = { quests: { active: {}, completed: [], story: {} }, features: { newxp: { status: 'done', stage: 'done' } } };
  const playerState = { savedAt: 5, inventory: {}, player: { currants: 0, level: 2, xp: 150 }, systems };
  const save = { kind: 'groddle-multiplayer', format: 1, entries: { playerState: JSON.stringify(playerState), location: JSON.stringify({ tsid: START_STREET }) } };
  for (let i = 0; i < 4; i++) {
    const cur = await (await pl.ctx.request.get(`${SITE}/wp-json/groddle/v1/save`, { headers: { 'X-WP-Nonce': nonce } })).json().catch(() => ({}));
    const r = await pl.ctx.request.put(`${SITE}/wp-json/groddle/v1/save`, { headers: { 'X-WP-Nonce': nonce }, data: { version: cur.version || 0, data: save } });
    if (r.status() === 200) return;
    note('seed', pl.key, r.status(), (await r.text()).slice(0, 200));
    await wait(1500);
  }
  throw new Error(`seeding ${pl.key}'s save failed`);
}

/** Local: sign up through the site's own route (instant for zz-*@groddle.localhost). */
async function signUpLocal(key) {
  const w = who(key);
  const ctx = await newContext();
  const r = await ctx.request.post(`${SITE}/wp-json/groddle/v1/players`, { data: { email: w.email, password: w.password, name: w.name }, timeout: 120000 });
  const body = await r.text();
  if (r.status() !== 201) throw new Error(`sign-up ${key}: ${r.status()} ${body.slice(0, 300)}`);
  const id = guardId(Number(JSON.parse(body).player?.id), `sign-up ${key}`);
  note('made', key, id, w.email);
  return { ...w, ctx, id, errors: [], consoleErrors: [], p: null, pill: null };
}

/** Live: a held sign-up (no mail), verified in the page, which makes the player and signs in. */
function holdSignUpsLive(list) {
  const rows = list.map((w) => {
    const hash = remote('cd ~/public && php', `<?php\n$b = 'minn/src/Minn/Auth/';\nrequire $b . 'PortableHash.php';\nrequire $b . 'Password.php';\necho \\Minn\\Auth\\Password::hash('${w.password}');\n`);
    if (!/^\$wp\$2y\$/.test(hash)) throw new Error('the server made an unexpected password hash');
    w.token = randomBytes(24).toString('hex');
    const tokenHash = createHash('sha256').update(w.token).digest('hex');
    return `INSERT INTO wp_groddle_signups (token_hash,email,email_key,pass_hash,name,name_key,sends,sent_at,created_at,expires_at,used_at,user_id,ip) VALUES ('${tokenHash}','${w.email}','${w.email}','${hash}','${w.name}','${w.name.toLowerCase()}',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 1 HOUR,NULL,0,'127.0.0.1');`;
  });
  q(rows.join('\n'));
}

async function verifyLive(w) {
  const ctx = await newContext();
  const pl = { ...w, ctx, id: null, errors: [], consoleErrors: [], p: await ctx.newPage(), pill: null };
  watch(pl);
  await pl.p.goto(`${SITE}/play/online/#verify=${pl.token}`, { waitUntil: 'load', timeout: 90000 });
  await pl.p.waitForSelector('#save-pill', { timeout: 60000 });
  pl.pill = (await pl.p.textContent('#save-pill .save-pill-who').catch(() => null))?.trim() || null;
  await shot(pl.p, `${pl.key}-0-verified`);
  pl.id = guardId(Number(q(`SELECT ID FROM wp_users WHERE user_email = '${pl.email}'`)), `verify ${pl.key}`);
  note('verified', pl.key, pl.id, pl.email);
  // Close the page so its first save can't race the seed.
  await pl.p.close();
  pl.p = null;
  return pl;
}

async function openGame(pl) {
  pl.p = await pl.ctx.newPage();
  watch(pl);
  await pl.p.goto(`${SITE}/play/online/`, { waitUntil: 'load', timeout: 90000 });
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < LOAD_MS; i++) {
    alive();
    const st = await pl.p.evaluate(() => {
      if (document.querySelector('#game-root canvas')?.dataset.realtimeState === 'online' && window.groddleQA?.snapshot && document.getElementById('bug-btn')) return 'online';
      const c = document.querySelector('[data-online-continue]');
      if (c && c.getClientRects().length && !c.dataset.qaClicked) { c.dataset.qaClicked = '1'; c.click(); return 'continue'; }
      const b = document.getElementById('start-btn');
      if (b && !b.hidden && b.getClientRects().length) { b.click(); return 'start'; }
      return `wait:${document.querySelector('#game-root canvas')?.dataset.realtimeState || '-'}`;
    });
    if (st === 'online') break;
    if (i % 20 === 0) console.log(pl.key, 'entering', st);
    await wait(500);
  }
  await pl.p.waitForFunction(() => window.groddleQA?.snapshot && document.querySelector('#game-root canvas')?.dataset.realtimeState === 'online', null, { timeout: 15000, polling: 500 }).catch(() => {
    throw new Error(`${pl.key} did not reach the street online within ${Math.round(LOAD_MS / 1000) + 15} s (--load)`);
  });
  note(pl.key, 'on the street after', Math.round((Date.now() - t0) / 1000), 's');
  await wait(2500);
  await dismiss(pl);
}

async function dismiss(pl) {
  for (let i = 0; i < 16; i++) {
    const did = await pl.p.evaluate(() => {
      for (const s of ['#quest-dialogue-cancel', '#quest-dialogue-close', '#quest-dialogue-next', '[data-award-close]', '[data-award-next]', '[data-nd-ok]', '#start-btn']) {
        const el = document.querySelector(s);
        if (el && !el.hidden && el.getClientRects().length) { el.click(); return s; }
      }
      return null;
    });
    if (!did) break;
    await wait(600);
  }
}

const canvasData = (pl) => pl.p.evaluate(() => ({ ...(document.querySelector('#game-root canvas')?.dataset || {}) }));
const blur = (pl) => pl.p.evaluate(() => document.activeElement?.blur?.());
async function escape(pl, n = 2) { for (let i = 0; i < n; i++) { await pl.p.keyboard.press('Escape'); await wait(250); } }
const drawer = (pl) => pl.p.evaluate(() => {
  const d = document.getElementById('local-chat-dock');
  const c = document.querySelector('#game-root canvas')?.dataset || {};
  const badge = (sel) => document.querySelector(sel)?.querySelector('.social-badge')?.textContent || null;
  return { open: d?.dataset.socialOpen, tab: c.socialTab, tabs: c.socialTabs, here: c.realtimeHere, party: c.partyState, railLocalBadge: badge('[data-social-rail-tab="local"]') };
});
async function say(pl, text) {
  await blur(pl);
  await pl.p.keyboard.press('/');
  await wait(300);
  await pl.p.keyboard.type(text);
  await pl.p.keyboard.press('Enter');
  await wait(800);
  await blur(pl);
}
const lines = (pl, id) => pl.p.evaluate((id) => window.groddleSocial?.lines(id) || null, id);
const remotePoint = (pl, otherId) => pl.p.evaluate((id) => {
  const t = window.groddleParty?.targets?.get(id);
  if (!t || t.box.destroyed) return null;
  const g = t.box.getGlobalPosition();
  const c = document.querySelector('#game-root canvas');
  const r = c.getBoundingClientRect();
  const res = Number(c.dataset.renderResolution) || 1;
  const sx = r.width / (c.width / res);
  const sy = r.height / (c.height / res);
  return { x: r.left + g.x * sx, y: r.top + g.y * sy, sx, sy };
}, otherId);
const verbMenu = (pl) => pl.p.evaluate(() => {
  const menu = document.getElementById('verb-menu');
  if (!menu || menu.hidden || !menu.getClientRects().length) return null;
  return { rows: [...menu.querySelectorAll('.vm-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()) };
});
async function openPlayerMenu(pl, other) {
  for (const dy of [70, 40, 110, 140, 10]) {
    const pt = await remotePoint(pl, other.id);
    if (!pt) { await wait(500); continue; }
    await pl.p.mouse.click(pt.x, pt.y - dy * pt.sy);
    await wait(500);
    const m = await verbMenu(pl);
    if (m && m.rows.some((r) => /Invite to Party|Friends|Block/i.test(r))) return m;
    if (m) { await pl.p.keyboard.press('Escape'); await wait(300); }
  }
  return null;
}
const pickVerb = (pl, re) => pl.p.evaluate((src) => {
  const row = [...document.querySelectorAll('#verb-menu .vm-row')].find((r) => new RegExp(src, 'i').test(r.innerText));
  if (!row) return false;
  row.click();
  return row.innerText.replace(/\s+/g, ' ').trim();
}, re.source);
const clickChoice = (pl, re) => pl.p.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button')].find((x) => x.getClientRects().length && (rx.test(x.getAttribute('aria-label') || '') || rx.test(x.textContent.trim())));
  if (!b) return null;
  b.click();
  return b.getAttribute('aria-label') || b.textContent.trim();
}, re.source);

// —— the checks ——
async function checks() {
  session = await openBrowser({ online: true, headless: !flag('headed'), label: `online-smoke --${MODE} ${STAMP}`, handleSignals: false, isAborted: () => aborted });
  alive();
  let A;
  let B;
  if (LIVE) {
    const list = [who('a'), who('b')];
    holdSignUpsLive(list);
    A = await verifyLive(list[0]);
    B = await verifyLive(list[1]);
  } else {
    A = await signUpLocal('a');
    B = await signUpLocal('b');
  }
  players.push(A, B);
  await seedSave(A);
  await seedSave(B);
  await openGame(A);
  await openGame(B);

  // 1. Both get in.
  for (let i = 0; i < 40; i++) {
    if (Number((await canvasData(A)).realtimeHere) >= 2 && Number((await canvasData(B)).realtimeHere) >= 2) break;
    await wait(500);
  }
  const cA = await canvasData(A);
  const cB = await canvasData(B);
  const here = [cA.realtimeHere, cB.realtimeHere];
  const pills = await Promise.all([A, B].map((pl) => pl.p.textContent('#save-pill .save-pill-who').catch(() => null).then((t) => t?.trim() || null)));
  const inShots = [await shot(A.p, 'a-1-in'), await shot(B.p, 'b-1-in')];
  check('1-both-in', cA.realtimeState === 'online' && cB.realtimeState === 'online' && Number(here[0]) >= 2 && Number(here[1]) >= 2 && pills[0] === `Playing as ${A.name}` && pills[1] === `Playing as ${B.name}`, { ids: [A.id, B.id], realtime: [cA.realtimeState, cB.realtimeState], here, pills, shots: inShots });
  const alone = here[0] === '2' && here[1] === '2';
  if (!alone) note('someone else is on the street', here);

  // 8. Published zones stay out of multiplayer (only with --game and a zone in the served copy).
  if (ZONES.length) {
    const z = await A.p.evaluate(async (zoneFiles) => {
      const served = await (await fetch('/assets/streets/index.json', { cache: 'no-store' })).json();
      const zoneRows = Object.entries(served.streets).filter(([, r]) => r.zone).map(([t]) => t);
      // The page's own street-loader module (the URL it loaded, so the same instance).
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/js\/street-loader\.js(\?|$)/.test(n));
      if (!url) return { zoneRows, error: 'street-loader.js not loaded' };
      const loader = await import(url);
      await loader.ensureStreetIndex();
      const gameRows = Object.keys(loader.STREET_INDEX.streets).filter((t) => /^[GL]Z/.test(t));
      // The shipped streets the zones' ways in are on, as the online page loads them.
      const shipped = new Set();
      for (const f of zoneFiles) for (const e of (await (await fetch(`/assets/zones/${f}`, { cache: 'no-store' })).json()).edits || []) shipped.add(e.tsid);
      const inFile = [];
      const armsShown = [];
      for (const tsid of shipped) {
        const key = served.streets[tsid] ? tsid : `${tsid[0] === 'L' ? 'G' : 'L'}${tsid.slice(1)}`;
        const raw = await (await fetch(`/${served.streets[key].file}`, { cache: 'no-store' })).text();
        if (/"tsid":"[GL]Z[A-Z0-9]{13}"/.test(raw)) inFile.push(key);
        const data = await loader.loadStreetData(key);
        for (const p of data.signposts || []) for (const c of p.connects || []) if (/^[GL]Z/.test(c.tsid)) armsShown.push(`${key}/${p.id}>${c.tsid}`);
      }
      return { zoneRows, gameRows, waysInInFiles: inFile, armsShown, mode: window.GRODDLE_MODE || null };
    }, ZONES);
    check('8-zones-solo-only', z.zoneRows?.length > 0 && z.gameRows?.length === 0 && z.waysInInFiles?.length > 0 && z.armsShown?.length === 0 && z.mode === 'multiplayer', z);
  }

  // 6. A fresh player starts at the Original zoom (checked first, before any key press).
  const zoomInfo = (pl) => pl.p.evaluate(() => {
    let stored = 'unreadable';
    try { stored = localStorage.getItem('groddle.zoom'); } catch {}
    const s = document.getElementById('sound-zoom');
    const out = s?.parentElement?.querySelector('output')?.textContent || null;
    return { stored, world: document.querySelector('#game-root canvas')?.dataset.worldZoom, slider: s ? { value: s.value, label: out } : null };
  });
  const z0 = { A: await zoomInfo(A), B: await zoomInfo(B) };
  await blur(A);
  await A.p.click('#sound-btn');
  await wait(600);
  const zPop = await zoomInfo(A);
  const zShot = await shot(A.p, 'a-6-zoom-original');
  await escape(A, 1);
  if (await A.p.evaluate(() => !document.getElementById('sound-pop')?.hidden)) await A.p.click('#sound-btn');
  await wait(300);
  await blur(A);
  await A.p.keyboard.press('-');
  await wait(900);
  const zMinus = await zoomInfo(A);
  await A.p.keyboard.press('0');
  await wait(800);
  const zReset = await zoomInfo(A);
  check('6-zoom-original', z0.A.stored === null && z0.B.stored === null && z0.A.world === '1' && z0.B.world === '1' && zPop.slider?.value === '100' && zPop.slider?.label === 'Original' && Math.abs(Number(zMinus.world) - 0.9) < 0.011 && zReset.world === '1', { fresh: z0, slider: zPop.slider, afterMinus: zMinus.world, afterZero: zReset.world, shots: [zShot] });

  // B steps aside so the avatars don't overlap.
  await blur(B);
  await B.p.keyboard.down('ArrowRight'); await wait(900); await B.p.keyboard.up('ArrowRight');
  await wait(1200);

  // 2. Local chat both ways.
  if (!alone && LIVE) {
    skip('2-local-chat', 'someone else is on the street');
    skip('3-party', 'someone else is on the street');
  } else {
    alive();
    if ((await drawer(B)).open === 'open') { await B.p.click('[data-social-collapse]').catch(() => {}); await wait(500); }
    if ((await drawer(A)).open !== 'open') { await A.p.evaluate(() => window.groddleSocial?.open?.()); await wait(400); }
    await say(A, `Hello from A ${STAMP}`);
    await wait(1200);
    const bRail = await drawer(B);
    await B.p.click('[data-social-rail-tab="local"]').catch(() => {});
    await wait(700);
    const bLocal = await lines(B, 'local');
    const bShot = await shot(B.p, 'b-2-local');
    await say(B, `Hi A, B here ${STAMP}`);
    await wait(1200);
    const aLocal = await lines(A, 'local');
    const aShot = await shot(A.p, 'a-2-local');
    const heard = (ls, re) => Boolean(ls?.some((l) => re.test(l.text)));
    check('2-local-chat', heard(bLocal, /Hello from A/) && heard(aLocal, /B here/), { bRail: { open: bRail.open, badge: bRail.railLocalBadge }, bLocal: bLocal?.slice(-2), aLocal: aLocal?.slice(-2), shots: [bShot, aShot] });

    // 3. Party: invite from the player menu, the Party tab, /p, leave.
    alive();
    await dismiss(A);
    const menu = await openPlayerMenu(A, B);
    const menuShot = await shot(A.p, 'a-3-player-menu');
    let invited = menu ? await pickVerb(A, /Invite to Party/) : false;
    if (!invited) { await escape(A); await say(A, `/invite ${B.name}`); invited = '/invite'; }
    await wait(1500);
    let ok = null;
    for (let i = 0; i < 12 && !ok; i++) { ok = await clickChoice(B, /^OK$/); if (!ok) await wait(500); }
    await wait(2200);
    const pa = await drawer(A);
    const pb = await drawer(B);
    const partyShots = [menuShot, await shot(A.p, 'a-3-party-tab'), await shot(B.p, 'b-3-party-tab')];
    await A.p.evaluate(() => window.groddleSocial?.select?.('local'));
    await wait(300);
    await say(A, `/p party line from A ${STAMP}`);
    await wait(1500);
    const bParty = await lines(B, 'party');
    const bLocal2 = await lines(B, 'local');
    await dismiss(A);
    await A.p.evaluate(() => window.groddleSocial?.select?.('party'));
    await wait(400);
    const leaveBtn = await A.p.evaluate(() => { const b = [...document.querySelectorAll('#local-chat-dock button')].find((x) => x.getClientRects().length && x.textContent.trim() === 'Leave'); if (b) { b.click(); return true; } return false; });
    if (!leaveBtn) await say(A, '/leaveparty');
    await wait(900);
    let yes = null;
    for (let i = 0; i < 8 && !yes; i++) { yes = await clickChoice(A, /I'd like to leave the party/); if (!yes) await wait(500); }
    await wait(2500);
    const pa3 = await drawer(A);
    const pb3 = await drawer(B);
    partyShots.push(await shot(A.p, 'a-3-party-left'), await shot(B.p, 'b-3-party-left'));
    const has = (tabs) => Boolean(tabs?.split(',').includes('party'));
    const routed = Boolean(bParty?.some((l) => /party line from A/.test(l.text))) && !bLocal2?.some((l) => /party line from A/.test(l.text));
    check('3-party', has(pa.tabs) && has(pb.tabs) && routed && !has(pa3.tabs) && !has(pb3.tabs) && pa3.party === 'none' && pb3.party === 'none', { invitedVia: invited, menuRows: menu?.rows, accepted: ok, tabs: [pa.tabs, pb.tabs], routedToParty: routed, leaveBtn, leaveConfirm: yes, after: [pa3.tabs, pb3.tabs, pa3.party, pb3.party], shots: partyShots });
  }

  // 4. The save cloud's tooltip.
  alive();
  await dismiss(A);
  await escape(A, 1);
  for (let i = 0; i < 20; i++) { if ((await A.p.evaluate(() => document.getElementById('save-pill')?.dataset.state)) === 'saved') break; await wait(500); }
  const cloud = await A.p.evaluate(() => { const p = document.getElementById('save-pill'); return p ? { state: p.dataset.state, tip: p.dataset.tip || null, inPack: Boolean(document.getElementById('pack-row')?.contains(p)) } : null; });
  await A.p.mouse.move(10, 10);
  await wait(300);
  await A.p.hover('#save-pill');
  await wait(900);
  const tip = await A.p.evaluate(() => {
    const read = (id) => { const t = document.getElementById(id); return t && !t.hidden ? t.innerText.replace(/\s+/g, ' ').trim() : null; };
    const pill = document.getElementById('save-pill');
    const after = pill ? getComputedStyle(pill, '::after') : null;
    const css = after && pill.matches(':hover') && Number(after.opacity) > 0.9 ? after.content.replace(/^"|"$/g, '') : null;
    return css || read('hud-tip') || read('pack-tip');
  });
  const cloudShot = await shot(A.p, 'a-4-save-cloud-tooltip');
  check('4-save-cloud', tip === `Playing as ${A.name} · Saved` && cloud?.inPack, { cloud, tooltip: tip, shots: [cloudShot] });
  await A.p.mouse.move(700, 300);

  // 5. Reports round trip (local only).
  if (LIVE) {
    skip('5-reports', 'local only (a console reply would mail a fake address)');
  } else {
    alive();
    const M = await signUpLocal('admin');
    players.push(M);
    // A throwaway administrator, so the reply never comes from user 1. Its own capabilities row only.
    q(`UPDATE wp_usermeta SET meta_value = 'a:1:{s:13:"administrator";b:1;}' WHERE user_id = ${M.id} AND meta_key = 'wp_capabilities' AND ${M.id} > ${MIN_ID}`);
    M.p = await M.ctx.newPage();
    watch(M);
    await M.p.goto(`${SITE}/console/#reports`, { waitUntil: 'load', timeout: 60000 });
    await M.p.waitForSelector('[data-console-server][data-state]', { timeout: 30000 });

    await dismiss(A);
    await A.p.click('#bug-btn');
    await A.p.waitForSelector('#bug-report-panel:not([hidden]) [data-reports-new]', { timeout: 15000 });
    await wait(600);
    await A.p.click('[data-reports-new]');
    await A.p.waitForSelector('#bug-report-text', { state: 'visible' });
    await A.p.fill('#bug-report-text', `Smoke check ${STAMP}: the signpost label overlaps the pack row when I zoom out.`);
    await A.p.click('[data-bug-report-send]');
    // The sent line is REPORT_TEXT.sent in js/reports.js ("Thanks! Your message was sent." since the
    // form welcomed feedback too); match its start so a reworded thanks does not fail the check.
    await A.p.waitForFunction(() => /^Thanks!/.test(document.querySelector('#game-root canvas')?.dataset.bugReportLast || ''), null, { timeout: 15000 });
    const reportShots = [await shot(A.p, 'a-5-report-sent')];
    const ticketId = Number(q(`SELECT COALESCE(MAX(id), 0) FROM wp_groddle_tickets WHERE player_user_id = ${A.id}`));
    await A.p.keyboard.press('Escape');
    await wait(400);

    await M.p.goto(`${SITE}/console/#reports`, { waitUntil: 'load' });
    await M.p.waitForSelector(`[data-console-tickets] [data-ticket="${ticketId}"]`, { timeout: 20000 });
    await M.p.click(`[data-console-tickets] [data-ticket="${ticketId}"]`);
    await M.p.waitForFunction((id) => document.querySelector('[data-console-thread-meta]')?.textContent.startsWith(`#${id} `), ticketId, { timeout: 15000 });
    await M.p.fill('#console-reply-text', `Thanks ${A.name}! We can see it. A fix is on the way.`);
    await M.p.click('[data-console-reply] button[type="submit"]');
    await M.p.waitForFunction(() => document.querySelectorAll('[data-console-messages] li').length === 2, null, { timeout: 15000 });
    await wait(600);
    const adminNote = await M.p.textContent('[data-console-note]').catch(() => null);
    reportShots.push(await shot(M.p, 'admin-5-console-reply'));
    await wait(2000);
    const mailRows = q(`SELECT CONCAT_WS(' ', kind, mailed) FROM wp_groddle_mail_sends WHERE email_hash = '${emailHash(A.email)}'`).split('\n').filter(Boolean);

    await A.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    try { await A.p.waitForFunction(() => document.getElementById('bug-btn')?.dataset.unread === '1', null, { timeout: 70000, polling: 500 }); } catch { note('the report badge never showed'); }
    const badge = await A.p.evaluate(() => document.getElementById('bug-btn')?.dataset.unread || null);
    reportShots.push(await shot(A.p, 'a-5-report-badge'));
    await dismiss(A);
    await A.p.click('#bug-btn');
    await A.p.waitForSelector(`#bug-report-panel [data-ticket="${ticketId}"]`, { timeout: 15000 });
    await A.p.click(`#bug-report-panel [data-ticket="${ticketId}"] button`);
    await A.p.waitForFunction(() => document.querySelectorAll('#bug-report-panel [data-reports-messages] li').length >= 2, null, { timeout: 15000 });
    await wait(600);
    const thread = await A.p.evaluate(() => [...document.querySelectorAll('#bug-report-panel [data-reports-messages] li')].map((li) => `${li.dataset.author}: ${(li.querySelector('.reports-msg-body')?.textContent || li.textContent).replace(/\s+/g, ' ').trim().slice(0, 60)}`));
    reportShots.push(await shot(A.p, 'a-5-report-thread'));
    await A.p.click('[data-reports-close-ticket]');
    await A.p.waitForFunction(() => document.querySelector('[data-reports-thread-status]')?.dataset.status === 'closed', null, { timeout: 15000 });
    const status = q(`SELECT status FROM wp_groddle_tickets WHERE id = ${ticketId}`);
    reportShots.push(await shot(A.p, 'a-5-report-closed'));
    await A.p.keyboard.press('Escape');
    check('5-reports', ticketId > 0 && /has an email about it/.test(adminNote || '') && mailRows.some((r) => /^reply 1/.test(r)) && badge === '1' && thread.length === 2 && /^player:/.test(thread[0]) && /^admin: Thanks/.test(thread[1]) && status === 'closed', { ticketId, adminNote, mailRows, badge, thread, status, shots: reportShots });
  }
}

let failed = null;
try {
  await checks();
} catch (e) {
  failed = e;
  R.errors.fatal = (e.stack || String(e)).slice(0, 1500);
  console.log('FAILED', R.errors.fatal);
  for (const pl of players) if (pl.p && !pl.p.isClosed()) await pl.p.screenshot({ path: join(OUT, 'shots', `${pl.key}-fail.png`) }).catch(() => {});
} finally {
  clearTimeout(timer);
  // 7. No page errors.
  const pageErrors = Object.fromEntries(players.map((pl) => [pl.key, pl.errors]));
  if (!failed || players.length >= 2) check('7-no-page-errors', players.every((pl) => pl.errors.length === 0), { pageErrors });
  for (const pl of players) R.errors[pl.key] = { pageErrors: pl.errors.slice(0, 20), consoleErrors: pl.consoleErrors.slice(0, 20) };
  R.players = players.map((pl) => ({ key: pl.key, id: pl.id, email: pl.email, name: pl.name }));
  await session?.close();
  // Cleanup: two passes, each after the realtime server has had time to send its last credits.
  for (let pass = 1; pass <= 2; pass++) {
    console.log(`cleanup pass ${pass} in ${SETTLE_MS / 1000} s`);
    await wait(SETTLE_MS);
    try {
      const r = runCleanup(q, { like: PAT.like, re: PAT.re, minId: MIN_ID, knownIds: madeIds });
      R.cleanup.push({ pass, ids: r.ids, skipped: r.skipped, left: r.left });
      console.log(`cleanup pass ${pass}: cleared ids ${JSON.stringify(r.ids)}, left ${JSON.stringify(r.left)}`);
    } catch (e) {
      R.cleanup.push({ pass, error: e.message.slice(0, 500) });
      console.log(`cleanup pass ${pass} failed: ${e.message}`);
    }
  }
  const last = R.cleanup[R.cleanup.length - 1];
  R.cleanupZero = Boolean(last && !last.error && last.left.total === 0);
  for (const id of CHECK_IDS) if (!R.checks[id]) R.checks[id] = { pass: false, notRun: true };
  const ids = CHECK_IDS;
  R.pass = !failed && !aborted && ids.every((id) => R.checks[id].pass) && R.cleanupZero;
  R.summary = Object.fromEntries(ids.map((id) => [id, R.checks[id].notRun ? 'not run' : R.checks[id].skipped ? 'skip' : R.checks[id].pass ? 'pass' : 'fail']));
  R.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(R, null, 2)}\n`);
  console.log(JSON.stringify({ pass: R.pass, mode: MODE, checks: R.summary, cleanupZero: R.cleanupZero, left: last?.left ?? null, summary: join(OUT, 'summary.json') }, null, 2));
  process.exit(R.pass ? 0 : 1);
}
