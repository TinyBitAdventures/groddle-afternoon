#!/usr/bin/env node
/**
 * The browser check for alternate characters, the game's side (Austin's rulings of 2026-11-12),
 * against stubbed site routes: the static server serves the game and Playwright's page.route
 * answers the groddle/v1 routes by the site's contract (characters, characters/{id}/play, the
 * save, the realtime ticket), so it needs no Groddle site and touches no database.
 *
 *   node tools/qa/alt-characters-check.mjs [--port=8847] [--shots=<folder>]
 *
 * Checks: the start card with 1, 2 and 3 characters (Play as <name>, Level N, the signed-in one
 * first; Start a fresh character, or the plain reason it cannot); the fresh character's name
 * errors (the sign-up's own rule, then the site's 422, 409 and 429); a fresh character made and
 * played; switching to another character (the play call, then every write naming it); the
 * save's 409 character_changed (the playing-elsewhere card, no more writes); the realtime close
 * 4012 (the words, no reconnect); the Account panel's Switch character and Menu > Switch
 * character back to the card; Retire on an extra character (never the first or the one signed
 * in), its in-card confirmation, Cancel, a refusal in the site's words, retired then restored;
 * Your characters on the save cloud (js/character-switcher.js) in the tutorial and past it: the
 * cloud always on screen (alone where the pack row sits while the tutorial hides the row), clear of
 * the top bar, the tutorial pill, the sound button and a phone's stick and Jump, its tooltip on
 * hover, the popover above it with the save state on top, by mouse and keyboard, Switch (save
 * first, then play, then in as the other), Start a fresh character (the card's form open) and
 * Manage characters (the card); on a 402 px phone the cloud is a 44 px target and the popover fits.
 * Shots in Modern and Classic, and a phone. One Chrome at a time (tools/qa/browser.mjs openBrowser takes the lock).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve.mjs';
import { openBrowser } from './browser.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const PORT = Number(arg('port', 8847));
const SHOTS = arg('shots', '');
/** --only=cards,fresh,switch,write,realtime,retire,cloud,phone runs those parts alone; --ui=modern|classic one skin. */
const ONLY = new Set(arg('only', 'cards,fresh,switch,write,realtime,retire,cloud,phone').split(','));
const UIS = arg('ui', 'modern,classic').split(',');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const ADA = { id: 54, name: 'Ada', level: 12, lastPlayedAt: 1_762_900_000, retired: false, first: true };
const BO = { id: 77, name: 'Bo', level: 3, lastPlayedAt: 1_762_800_000, retired: false, first: false };
const CY = { id: 80, name: 'Cy', level: 1, lastPlayedAt: null, retired: false, first: false };
const NEW = { id: 91, name: 'Dot', level: 1, lastPlayedAt: null, retired: false, first: false };

/** A save past the tutorial (as tools/qa/online-smoke.mjs seeds one): the street, not the clouds. */
const PAST_TUTORIAL = {
  kind: 'groddle-multiplayer',
  format: 1,
  entries: {
    playerState: JSON.stringify({ savedAt: 5, inventory: {}, player: { currants: 0, level: 2, xp: 150 }, systems: { quests: { active: {}, completed: [], story: {} }, features: { newxp: { status: 'done', stage: 'done' } } } }),
    location: JSON.stringify({ tsid: 'LIF12PMQ5121D68' }),
  },
};

const CLOUD = '#save-pill .save-pill-btn';
/** The cloud's box, whether it shows (and takes a tap at its middle), and every HUD part it overlaps (the top bar, the tutorial pill, the sound button, the stick and Jump). */
const cloudClear = (page) => page.evaluate((sel0) => {
  const cloud = document.querySelector(sel0);
  const box = cloud?.getBoundingClientRect();
  if (!box || !box.width || getComputedStyle(cloud).visibility === 'hidden') return { shown: false, hits: [] };
  const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  const hits = [];
  for (const sel of ['.top-bar', '#sound-btn', '[data-nx-label]', '.quest-tracker', '#social-rail', '.social-drawer', '.touch-stick', '.touch-jump']) {
    for (const n of document.querySelectorAll(sel)) {
      const r = n.getBoundingClientRect();
      if (!r.width || !n.getClientRects().length || getComputedStyle(n).visibility === 'hidden') continue;
      if (r.left < box.right && box.left < r.right && r.top < box.bottom && box.top < r.bottom) hits.push(sel);
    }
  }
  return { shown: true, tappable: Boolean(top && cloud.contains(top)), hits, box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } };
}, CLOUD);
/** The popover's box against the cloud's and the window. */
const popPlace = (page) => page.evaluate((sel0) => {
  const p = document.querySelector('[data-character-switcher-pop]').getBoundingClientRect();
  const c = document.querySelector(sel0).getBoundingClientRect();
  const w = document.documentElement.clientWidth;
  return { above: p.bottom <= c.top + 1, inside: p.left >= 0 && p.right <= w && p.top >= 0, w: Math.round(p.width), left: Math.round(p.left), right: Math.round(p.right), view: w };
}, CLOUD);

let failures = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures += 1;
};

/**
 * A stubbed Groddle site for one browser context. state: who is signed in, the login's
 * characters, and how the next writes answer. Every groddle/v1 request is logged with its
 * X-Groddle-Character header.
 */
async function stubSite(ctx, state) {
  const log = [];
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'X-WP-Nonce': 'abcdef0123' }, body: JSON.stringify(body) });
  const who = () => state.characters.find((c) => c.id === state.current);
  await ctx.route('**/wp-admin/admin-ajax.php?action=heartbeat', (r) => json(r, 200, { success: false }));
  await ctx.route('**/wp-admin/admin-ajax.php?action=rest-nonce', (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'abcdef0123' }));
  await ctx.route('**/wp-json/groddle/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^.*\/wp-json\/groddle\/v1\//, '');
    const method = req.method();
    const header = req.headers()['x-groddle-character'] || '';
    log.push({ method, path, header });
    if (header && Number(header) !== state.current && method !== 'GET') return json(route, 409, { code: 'character_changed', message: 'You are playing another character now.' });
    if (path === 'me') return json(route, 200, { signedIn: true, player: { id: state.current, name: who().name }, account: { email: 'qa@example.com' }, backups: null, suspended: false });
    if (path === 'characters' && method === 'GET') {
      return json(route, 200, { login: 54, current: state.current, limit: 3, canCreate: state.canCreate, nextCreateAt: state.canCreate ? null : 1_763_000_000, characters: state.characters });
    }
    if (path === 'characters' && method === 'POST') {
      const name = JSON.parse(req.postData() || '{}').name;
      const next = state.createAnswers.shift();
      if (next) return json(route, next.status, next.body);
      state.characters.push({ ...NEW, name });
      return json(route, 201, { character: { ...NEW, name } });
    }
    const play = /^characters\/(\d+)\/play$/.exec(path);
    if (play && method === 'POST') {
      const id = Number(play[1]);
      if (!state.characters.some((c) => c.id === id && !c.retired)) return json(route, 403, { code: 'groddle_not_yours', message: 'Not one of your characters.' });
      state.current = id;
      return json(route, 200, { ok: true, nonce: '0123456789' });
    }
    const retire = /^characters\/(\d+)\/(retire|restore)$/.exec(path);
    if (retire && method === 'POST') {
      const next = retire[2] === 'retire' ? state.retireAnswers?.shift() : null;
      if (next) return json(route, next.status, next.body);
      const c = state.characters.find((x) => x.id === Number(retire[1]));
      if (!c) return json(route, 404, { code: 'groddle_character_missing', message: "That character isn't one of yours." });
      c.retired = retire[2] === 'retire';
      return json(route, 200, { character: c });
    }
    if (path.startsWith('save') && method === 'GET') return json(route, 200, state.seeded ? { version: 1, updatedAt: '2026-11-12T09:00:00Z', data: PAST_TUTORIAL } : { version: 0, updatedAt: null, data: null });
    if (path === 'save' && method === 'PUT') {
      state.puts += 1;
      if (state.saveRefuse) return json(route, 409, { code: 'character_changed', message: 'You are playing another character now.' });
      return json(route, 200, { version: state.puts, updatedAt: '2026-11-12T10:00:00Z' });
    }
    if (path === 'realtime' && method === 'POST') {
      if (state.realtime) return json(route, 200, { ticket: 'qa-ticket', expiresIn: 60, path: '/realtime' });
      return json(route, 503, { code: 'groddle_realtime_off', message: 'Off.' });
    }
    return json(route, 200, {});
  });
  return log;
}

/** A WebSocket stand-in: hello on auth, then the server's close 4012 after closeAfterMs. Counts sockets. */
function fakeSocketScript(closeAfterMs) {
  return `(() => {
    window.__qaSockets = 0;
    class QaSocket extends EventTarget {
      constructor(url) { super(); this.url = url; this.readyState = 0; window.__qaSockets += 1; setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 50); }
      send(data) {
        const m = JSON.parse(data);
        if (m.t === 'auth') {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ t: 'hello', you: { id: 54, name: 'Ada' } }) }), 50);
          setTimeout(() => { this.readyState = 3; this.onclose?.({ code: 4012, reason: 'Playing as another character' }); }, ${closeAfterMs});
        }
        if (m.t === 'join') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ t: 'street', street: m.street, players: [] }) }), 20);
      }
      close() { this.readyState = 3; }
    }
    QaSocket.OPEN = 1;
    window.WebSocket = QaSocket;
  })();`;
}

/** An iPhone 16 Pro sized phone (402 x 874) that opens the game on every load (the phone gate's QA switch, groddle-play-device "qa-game"). */
const PHONE = {
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

async function newContext(browser, { ui = 'modern', socket = null, phone = false } = {}) {
  const ctx = await browser.newContext(phone ? PHONE : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((u) => { try { localStorage.setItem('groddle.ui', u); localStorage.setItem('groddle-play-device', 'qa-game'); } catch {} }, ui);
  if (socket) await ctx.addInitScript(socket);
  return ctx;
}

const BASE = `http://127.0.0.1:${PORT}`;
const CARD = `${BASE}/play/online/`;
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};
const rows = (page) => page.$$eval('[data-online-characters] button.online-character', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
/** The ids with a visible Retire link on the card. */
const retireLinks = (page) => page.$$eval('[data-online-retire-open]', (bs) => bs.filter((b) => !b.hidden).map((b) => Number(b.dataset.onlineRetireOpen)));

/** Waits until the game is past the gate and its start card (Start exploring, past the tutorial's card). */
async function intoGame(page) {
  await page.waitForFunction(() => document.getElementById('online-gate')?.hidden === true, null, { timeout: 30000 });
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => {
      const started = document.getElementById('overlay')?.classList.contains('hidden');
      // Start exploring itself (a new save hides it behind the tutorial's Start): the street, not the clouds,
      // so the realtime client has a shared street to join.
      const b = document.getElementById('start-btn');
      if (b && !started && !document.body.classList.contains('is-booting') && (b.getClientRects().length || document.getElementById('newxp-start'))) { b.click(); return 'start'; }
      return started && document.querySelector('#game-root canvas') && !document.body.classList.contains('is-booting') ? 'in' : 'wait';
    });
    if (st === 'in') return true;
    await page.waitForTimeout(500);
  }
  return false;
}

const server = await startServer({ root: join(ROOT, 'public'), port: PORT });
const { browser, close } = await openBrowser({ label: 'alt-characters check' });
try {
  for (const ui of UIS) {
    // The card with 1, 2 and 3 characters.
    for (const [n, list, can] of ONLY.has('cards') ? [[1, [ADA], true], [2, [ADA, BO], false], [3, [ADA, BO, CY], false]] : []) {
      const ctx = await newContext(browser, { ui });
      const state = { current: 54, characters: list.map((c) => ({ ...c })), canCreate: can, createAnswers: [], puts: 0 };
      await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.waitForSelector('[data-online-characters] button');
      const r = await rows(page);
      ok((await retireLinks(page)).join() === list.filter((c) => !c.first).map((c) => c.id).join(), `${ui} ${n}: Retire on the extra characters only (${await retireLinks(page)})`);
      ok(r[0] === 'Play as Ada Level 12' && r.length === n, `${ui} ${n}: rows ${JSON.stringify(r)}`);
      const fresh = await page.$('[data-online-new-character]');
      const note = await page.$eval('[data-online-fresh-note]', (e) => e.textContent).catch(() => '');
      if (n === 1) ok(Boolean(fresh), `${ui} ${n}: Start a fresh character offered`);
      if (n === 2) ok(note === 'You can make another character tomorrow.', `${ui} ${n}: ${note}`);
      if (n === 3) ok(note === 'You have 3 characters.', `${ui} ${n}: ${note}`);
      const tail = await page.$$eval('#online-gate .card > a, #online-gate .card > button', (els) => els.map((e) => e.textContent.trim()));
      ok(tail.includes('Play solo') && tail.includes('Not Ada? Sign out'), `${ui} ${n}: Play solo, Not Ada? Sign out`);
      await shot(page, `card-${n}-${ui}`);
      await ctx.close();
    }

    // Start a fresh character: the errors, then made and played.
    if (ONLY.has('fresh')) {
      const ctx = await newContext(browser, { ui });
      const state = {
        current: 54, characters: [{ ...ADA }], canCreate: true, puts: 0,
        createAnswers: [
          { status: 422, body: { code: 'groddle_invalid', message: 'Someone already has that name. Try another.', fields: { name: 'Someone already has that name. Try another.' } } },
          { status: 429, body: { code: 'characters_daily', message: 'One a day.' } },
          { status: 409, body: { code: 'characters_limit', message: 'Limit.' } },
        ],
      };
      const log = await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.click('[data-online-new-character]');
      const err = () => page.$eval('[data-online-fresh-error]', (e) => e.textContent);
      await page.fill('#online-fresh-name', 'x');
      await page.click('[data-online-fresh-form] button[type="submit"]');
      ok((await err()).startsWith('Names are 3 to 19 letters'), `${ui} fresh: the sign-up's name rule (${await err()})`);
      ok(!log.some((l) => l.method === 'POST' && l.path === 'characters'), `${ui} fresh: nothing sent for a bad name`);
      await page.fill('#online-fresh-name', 'Ada');
      await page.click('[data-online-fresh-form] button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[data-online-fresh-error]').textContent.length > 0);
      ok((await err()) === 'Someone already has that name. Try another.', `${ui} fresh: the site's 422 (${await err()})`);
      await shot(page, `fresh-error-${ui}`);
      await page.fill('#online-fresh-name', 'Dot');
      await page.click('[data-online-fresh-form] button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[data-online-fresh-error]').textContent.includes('tomorrow'));
      ok((await err()) === 'You can make another character tomorrow.', `${ui} fresh: 429`);
      await page.click('[data-online-fresh-form] button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[data-online-fresh-error]').textContent.includes('characters.'));
      ok((await err()) === 'You have 3 characters.', `${ui} fresh: 409`);
      await page.click('[data-online-fresh-form] button[type="submit"]');
      ok(await intoGame(page), `${ui} fresh: made, played and in the game`);
      ok(state.current === 91, `${ui} fresh: the site signed in as the new character`);
      const playAt = log.findIndex((l) => l.path === 'characters/91/play');
      ok(playAt > 0 && log[playAt].header === '54', `${ui} fresh: play called naming the one signed in`);
      const after = log.slice(playAt + 1).filter((l) => l.header);
      ok(after.length > 0 && after.every((l) => l.header === '91'), `${ui} fresh: every call after names 91 (${[...new Set(after.map((l) => l.header))]})`);
      await ctx.close();
    }

    // Switch to another character from the card, then the save's 409 character_changed.
    if (ONLY.has('switch')) {
      const ctx = await newContext(browser, { ui });
      const state = { current: 54, characters: [{ ...ADA }, { ...BO }], canCreate: false, createAnswers: [], puts: 0, saveRefuse: false };
      const log = await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.click('[data-online-character="77"]');
      ok(await intoGame(page), `${ui} switch: in the game as Bo`);
      ok(state.current === 77, `${ui} switch: the site signed in as Bo`);
      await page.waitForFunction(() => document.documentElement.dataset.saveState === 'saved' || document.documentElement.dataset.saveState === 'pending', null, { timeout: 20000 }).catch(() => {});
      const puts = () => log.filter((l) => l.method === 'PUT' && l.path === 'save');
      // A save write as Bo, once the game writes one.
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(800);
      ok(puts().length > 0 && puts().every((l) => l.header === '77'), `${ui} switch: save writes name Bo (${puts().map((l) => l.header)})`);
      // Another tab switches back to Ada, and another call of this page (mail, an auction) heard the site's 409 first.
      state.current = 54;
      state.saveRefuse = true;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('groddle:character-changed', { detail: { qa: true } })));
      await page.waitForSelector('[data-save-alert][data-state="elsewhere"]:not([hidden])', { timeout: 10000 });
      const alert = await page.$eval('[data-save-alert]', (e) => e.innerText.replace(/\s+/g, ' ').trim());
      ok(alert.startsWith('Playing in another window') && alert.includes('Choose a character'), `${ui} 409: ${alert}`);
      const before = puts().length;
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(800);
      ok(puts().length === before, `${ui} 409: no more writes (${before} then ${puts().length})`);
      await shot(page, `elsewhere-${ui}`);
      await page.click('[data-save-choose]');
      await page.waitForSelector('[data-online-characters] button', { timeout: 20000 });
      ok((await rows(page))[0] === 'Play as Ada Level 12', `${ui} 409: Choose a character shows the card, Ada first`);
      await ctx.close();
    }

    // The site's own 409 on a save write (no event from elsewhere).
    if (ONLY.has('write')) {
      const ctx = await newContext(browser, { ui });
      const state = { current: 54, characters: [{ ...ADA }], canCreate: false, createAnswers: [], puts: 0, saveRefuse: true };
      const log = await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.click('[data-online-continue]');
      ok(await intoGame(page), `${ui} 409 write: in the game`);
      await page.waitForFunction(() => document.documentElement.dataset.saveState === 'elsewhere', null, { timeout: 30000 }).catch(() => {});
      const st = await page.evaluate(() => document.documentElement.dataset.saveState);
      const puts = log.filter((l) => l.method === 'PUT' && l.path === 'save');
      ok(st === 'elsewhere' && puts.length === 1, `${ui} 409 write: stopped after one refused write (${st}, ${puts.length})`);
      await ctx.close();
    }

    // Realtime close 4012, and Menu > Switch character.
    if (ONLY.has('realtime')) {
      const ctx = await newContext(browser, { ui, socket: fakeSocketScript(2500) });
      const state = { current: 54, characters: [{ ...ADA }, { ...BO }], canCreate: false, createAnswers: [], puts: 0, realtime: true };
      const log = await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.click('[data-online-continue]');
      ok(await intoGame(page), `${ui} 4012: in the game`);
      await page.waitForFunction(() => document.querySelector('#game-root canvas')?.dataset.realtimeState === 'other-character', null, { timeout: 30000 }).catch(() => {});
      ok((await page.evaluate(() => document.querySelector('#game-root canvas')?.dataset.realtimeState)) === 'other-character', `${ui} 4012: state other-character`);
      const pill = await page.$eval('.mp-state', (e) => e.textContent).catch(() => '');
      ok(pill === 'Playing as another character', `${ui} 4012: pill "${pill}"`);
      const said = await page.evaluate(() => document.body.innerText.includes("You're playing as another character in another window."));
      ok(said, `${ui} 4012: the note`);
      await shot(page, `realtime-4012-${ui}`);
      await page.waitForTimeout(6000);
      const sockets = await page.evaluate(() => window.__qaSockets);
      const tickets = log.filter((l) => l.path === 'realtime').length;
      ok(sockets === 1 && tickets === 1, `${ui} 4012: no reconnect (${sockets} socket, ${tickets} ticket)`);
      ok(log.filter((l) => l.path === 'realtime').every((l) => l.header === '54'), `${ui} 4012: the ticket names the character`);
      // The Account panel: Switch character beside Sign out (the tutorial hides the HUD, so its Menu is opened by script).
      await page.evaluate(() => document.getElementById('account-btn')?.click());
      const panel = await page.waitForSelector('[data-account-switch-character]', { state: 'visible', timeout: 10000 }).then(() => true, () => false);
      const actions = await page.$$eval('#account-panel .account-actions button', (bs) => bs.map((b) => b.textContent)).catch(() => []);
      ok(panel && actions.join('|') === 'Switch character|Sign out', `${ui} account panel: ${actions.join(', ')}`);
      await shot(page, `account-panel-${ui}`);
      await page.keyboard.press('Escape');
      // Menu > Switch character.
      const sw = await page.$('#switch-character-btn');
      ok(Boolean(sw), `${ui} menu: Switch character is there`);
      if (sw) {
        await page.evaluate(() => document.getElementById('switch-character-btn').click());
        await page.waitForSelector('[data-online-characters] button', { timeout: 20000 });
        ok((await rows(page)).length === 2, `${ui} menu: back to the card with both characters`);
      }
      await ctx.close();
    }

    // Retire: the extras only, a plain confirmation in the card, Cancel, a refusal, then retired and restored.
    if (ONLY.has('retire')) {
      const ctx = await newContext(browser, { ui });
      const state = {
        current: 77, characters: [{ ...ADA }, { ...BO }, { ...CY }], canCreate: false, createAnswers: [], puts: 0,
        retireAnswers: [{ status: 409, body: { code: 'groddle_character_current', message: 'Switch to another character before retiring this one.' } }],
      };
      const log = await stubSite(ctx, state);
      const page = await ctx.newPage();
      await page.goto(CARD);
      await page.waitForSelector('[data-online-characters] button');
      ok((await retireLinks(page)).join() === '80', `${ui} retire: signed in as Bo, only Cy has Retire (${await retireLinks(page)})`);
      await shot(page, `retire-card-${ui}`);
      await page.click('[data-online-retire-open="80"]');
      const ask = await page.$eval('[data-online-retire-confirm="80"]', (e) => (e.hidden ? '' : e.querySelector('.online-retire-ask').textContent));
      ok(ask === "Retire Cy? They'll be hidden from this list. You can bring them back from Retired characters, and their name stays theirs for 30 days.", `${ui} retire: the question (${ask})`);
      const focused = await page.evaluate(() => document.activeElement?.textContent);
      ok(focused === 'Cancel', `${ui} retire: focus on Cancel (${focused})`);
      await shot(page, `retire-confirm-${ui}`);
      await page.click('[data-online-retire-confirm="80"] .online-retire-no');
      const shut = await page.$eval('[data-online-retire-confirm="80"]', (e) => e.hidden);
      ok(shut && !log.some((l) => l.path.endsWith('/retire')), `${ui} retire: Cancel closes it and sends nothing`);
      // The site refuses (as it would for the one signed in): said in its words, in the confirmation.
      await page.click('[data-online-retire-open="80"]');
      await page.click('[data-online-retire="80"]');
      await page.waitForFunction(() => document.querySelector('[data-online-retire-confirm="80"] [data-online-retire-note]')?.dataset.tone === 'bad');
      const said = await page.$eval('[data-online-retire-confirm="80"] [data-online-retire-note]', (e) => e.textContent);
      ok(said === 'Switch to another character before retiring this one.', `${ui} retire: refusal "${said}"`);
      ok(!(await page.$eval('[data-online-retire="80"]', (b) => b.disabled)), `${ui} retire: buttons back after the refusal`);
      await shot(page, `retire-refused-${ui}`);
      // Now it goes through: the card again, Cy under Retired characters.
      await page.click('[data-online-retire="80"]');
      await page.waitForSelector('[data-online-restore="80"]', { state: 'attached', timeout: 20000 });
      const after = await rows(page);
      ok(after.join('|') === 'Play as Bo Level 3|Play as Ada Level 12', `${ui} retire: Cy gone from the list (${after.join(', ')})`);
      const call = log.filter((l) => l.path === 'characters/80/retire');
      ok(call.length === 2 && call.every((l) => l.method === 'POST' && l.header === '77'), `${ui} retire: POST characters/80/retire naming Bo`);
      await page.click('[data-online-retired] summary');
      await shot(page, `retire-done-${ui}`);
      await page.click('[data-online-restore="80"]');
      await page.waitForSelector('[data-online-character="80"]', { timeout: 20000 });
      ok((await rows(page)).length === 3 && !(await page.$('[data-online-retired]')), `${ui} retire: Restore Cy brings Cy back`);
      await ctx.close();
    }

    // Your characters on the save cloud: in the tutorial (the pack row and the Menu hidden) and past it, then
    // Switch, Start a fresh character, Manage.
    if (ONLY.has('cloud')) {
      for (const seeded of [false, true]) {
        const where = seeded ? 'street' : 'tutorial';
        const ctx = await newContext(browser, { ui });
        const state = { current: 54, characters: [{ ...ADA }, { ...BO }], canCreate: true, createAnswers: [], puts: 0, seeded };
        const log = await stubSite(ctx, state);
        const page = await ctx.newPage();
        await page.goto(CARD);
        await page.click('[data-online-continue]');
        ok(await intoGame(page), `${ui} cloud ${where}: in the game`);
        await page.waitForTimeout(1500);
        const clear = await cloudClear(page);
        ok(clear.shown && clear.tappable && clear.hits.length === 0, `${ui} cloud ${where}: shown, takes a click, clear of the HUD (${JSON.stringify(clear)})`);
        ok(!(await page.$('[data-character-chip]')), `${ui} cloud ${where}: no corner chip`);
        await page.hover(CLOUD);
        await page.waitForTimeout(250);
        const tip = await page.$eval('#save-pill', (e) => [getComputedStyle(e, '::after').content, getComputedStyle(e, '::after').opacity]);
        ok(tip[0] === '"Playing as Ada · Saved"' && tip[1] === '1', `${ui} cloud ${where}: the tooltip on hover (${tip})`);
        await shot(page, `cloud-${where}-${ui}`);
        await page.click(CLOUD);
        await page.waitForSelector('[data-character-switcher-switch]');
        const top = await page.$eval('[data-character-switcher-pop] > :first-child', (e) => [e.hasAttribute('data-character-switcher-save'), e.textContent, e.dataset.state]);
        ok(top[0] && top[1] === 'Saved' && top[2] === 'saved', `${ui} cloud ${where}: the save state on top (${top})`);
        const popRows = await page.$$eval('[data-character-switcher-row]', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
        ok(popRows.join('|') === 'Ada Level 12 Playing|Bo Level 3 Switch', `${ui} cloud ${where}: rows ${popRows.join(', ')}`);
        const extras = await page.$$eval('[data-character-switcher-fresh], [data-character-switcher-manage]', (bs) => bs.map((b) => b.textContent));
        ok(extras.join('|') === 'Start a fresh character|Manage characters', `${ui} cloud ${where}: ${extras.join(', ')}`);
        const placed = await popPlace(page);
        ok(placed.above && placed.inside, `${ui} cloud ${where}: the popover above the cloud, inside the window (${JSON.stringify(placed)})`);
        const tipGone = await page.$eval('#save-pill', (e) => getComputedStyle(e, '::after').display);
        ok(tipGone === 'none', `${ui} cloud ${where}: no tooltip over the open popover (${tipGone})`);
        const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
        ok(focus === 'Switch to Bo', `${ui} cloud ${where}: focus on Switch (${focus})`);
        await shot(page, `cloud-pop-${where}-${ui}`);
        await page.keyboard.press('Escape');
        const closed = await page.evaluate((sel0) => [document.querySelector('[data-character-switcher-pop]').hidden, document.activeElement === document.querySelector(sel0), document.querySelector(sel0).getAttribute('aria-expanded')], CLOUD);
        ok(closed[0] && closed[1] && closed[2] === 'false', `${ui} cloud ${where}: Escape closes it, focus back on the cloud (${closed})`);
        if (seeded) {
          // Keyboard: Enter on the cloud, then Manage characters.
          await page.keyboard.press('Enter');
          await page.waitForSelector('[data-character-switcher-manage]');
          await page.focus('[data-character-switcher-manage]');
          await page.keyboard.press('Enter');
          await page.waitForSelector('[data-online-characters] button.online-character', { timeout: 20000 });
          ok((await rows(page)).length === 2, `${ui} cloud manage: the start card`);
          await ctx.close();
          continue;
        }
        // Switch to Bo: saved first, then the play call naming Ada, then in as Bo.
        const before = log.length;
        await page.click(CLOUD);
        await page.click('[data-character-switcher-switch="77"]');
        await page.waitForFunction((sel0) => document.getElementById('online-gate')?.hidden === false || document.querySelector(sel0)?.getAttribute('aria-label')?.includes('Bo'), CLOUD, { timeout: 30000 }).catch(() => {});
        ok(await intoGame(page), `${ui} cloud switch: in the game again`);
        const after = log.slice(before);
        // Saved first: any write as Ada goes in before the play call, none after it.
        const playAt = after.findIndex((l) => l.path === 'characters/77/play');
        const lateAda = after.slice(playAt + 1).filter((l) => l.method === 'PUT' && l.header === '54').length;
        ok(playAt >= 0 && after[playAt].header === '54' && lateAda === 0, `${ui} cloud switch: play naming Ada, no write as Ada after it (${playAt}, ${lateAda})`);
        const now = await page.$eval(CLOUD, (b) => b.getAttribute('aria-label'));
        ok(state.current === 77 && now === 'Playing as Bo · Saved. Your characters', `${ui} cloud switch: playing as Bo (${now})`);
        // Start a fresh character: the card with its form open.
        await page.click(CLOUD);
        await page.click('[data-character-switcher-fresh]');
        await page.waitForSelector('[data-online-fresh-form]:not([hidden])', { timeout: 20000 });
        const fresh = await page.evaluate(() => [document.activeElement?.id, location.hash]);
        ok(fresh[0] === 'online-fresh-name' && fresh[1] === '', `${ui} cloud fresh: the card's form, the name box focused (${fresh})`);
        await shot(page, `cloud-fresh-${ui}`);
        await ctx.close();
      }
    }

    // A 402 px phone: the cloud a 44 px target clear of the stick and Jump (the tutorial and the street), a tap opens a
    // popover that fits.
    if (ONLY.has('phone')) {
      for (const seeded of [false, true]) {
        const where = seeded ? 'street' : 'tutorial';
        const ctx = await newContext(browser, { ui, phone: true });
        const state = { current: 54, characters: [{ ...ADA }, { ...BO }], canCreate: false, createAnswers: [], puts: 0, seeded };
        await stubSite(ctx, state);
        const page = await ctx.newPage();
        await page.goto(CARD);
        await page.tap('[data-online-continue]');
        ok(await intoGame(page), `${ui} phone ${where}: in the game`);
        await page.waitForTimeout(1500);
        const clear = await cloudClear(page);
        ok(clear.shown && clear.tappable && clear.hits.length === 0 && clear.box.w >= 44 && clear.box.h >= 44, `${ui} phone ${where}: a 44 px cloud, clear of the HUD (${JSON.stringify(clear)})`);
        await page.tap(CLOUD);
        await page.waitForSelector('[data-character-switcher-switch]');
        const placed = await popPlace(page);
        ok(placed.above && placed.inside, `${ui} phone ${where}: the popover fits above the cloud (${JSON.stringify(placed)})`);
        const note = await page.$eval('[data-character-switcher-fresh-note]', (e) => e.textContent).catch(() => '');
        ok(note === 'You can make another character tomorrow.', `${ui} phone ${where}: ${note}`);
        await shot(page, `phone-pop-${where}-${ui}`);
        await page.tap('#game-root canvas', { position: { x: 200, y: 200 } }).catch(() => {});
        ok(await page.$eval('[data-character-switcher-pop]', (e) => e.hidden), `${ui} phone ${where}: a tap elsewhere closes it`);
        await ctx.close();
      }
    }
  }
} finally {
  await close();
  await server.close?.();
}
console.log(failures ? `${failures} failed` : 'all ok');
process.exit(failures ? 1 : 0);
