/**
 * #743 (a phone and a computer, Decoration Mode then the Furniture Store):
 * - the Expand / Un-expand bar sat over the open Furniture Store and took its taps: the phone layout counted
 *   only `side-panel` sheets, so the vendor and Make sheets kept their computer place under the bar, and the
 *   bar and the store shared z-index 35 (the bar, added later, won). Now the phone layout docks the vendor
 *   and Make as it docks Quests, under the bar's row and above the tray, and an open sheet is over the builder;
 * - the Decoration Mode tray stepped right by the whole width of an open left sheet even when the sheet ended
 *   far above it (a computer lost about 280 px of tiles): it takes the pack row's reach rule
 *   (js/ui/pack-row.js packRowClearance, the one copy) and keeps its width;
 * - Austin's ruling: the Furniture Store button is a toggle, pressed while the store is open, and a tap closes it;
 * - Austin's ruling: prices read the number then Glitch's ₡ (StoreDialog.as 390) in the shops, the vendors,
 *   the Furniture Store, Make and the auctions (js/price.js priceText); the top bar keeps its coin.
 * Run: node --test tests/decorate-store-743.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAP, boxesOverlap, phoneRegions } from '../public/js/ui/phone-layout.js?v=d65ffc01';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');
const game = read('public/game.js');

describe('#743 the phone layout docks the Furniture Store and Make, clear of the banner and the tray', () => {
  // Decoration Mode at 402x812 in the Home Screen app: the banner's row under the caption, the tray at the foot (no pack row).
  const at = { width: 402, height: 812, safe: { t: 86, b: 34 }, packShown: false, homes: { w: 232, h: 54 } };
  const tray = { left: 8, top: 632, right: 394, bottom: 804 };

  it('upright, a half sheet starts under the banner\'s row and ends above the tray', () => {
    const r = phoneRegions({ ...at, sheet: 'half', tray });
    assert.ok(r.sheet.bottom <= tray.top - GAP, `sheet ends at ${r.sheet.bottom}, the tray starts at ${tray.top}`);
    assert.ok(r.sheet.top >= r.homes.bottom + GAP, `sheet starts at ${r.sheet.top}, the banner's row ends at ${r.homes.bottom}`);
    assert.equal(boxesOverlap(r.sheet, r.homes), false);
    // Without the builder the sheet keeps its old place (down to the floor).
    const plain = phoneRegions({ ...at, sheet: 'half' });
    assert.equal(plain.sheet.bottom, 812 - 34 - GAP);
  });

  it('sideways the column keeps its height (the tray steps aside instead: the pack row\'s reach rule)', () => {
    const side = { width: 812, height: 402, safe: { l: 62, r: 62 }, packShown: false, homes: { w: 232, h: 54 } };
    const a = phoneRegions({ ...side, sheet: 'half' });
    const b = phoneRegions({ ...side, sheet: 'half', tray: { left: 70, top: 260, right: 742, bottom: 394 } });
    assert.deepEqual(b.sheet, a.sheet);
  });

  it('game.js counts Make and the vendor as sheets, style.css docks them, and an open sheet is over the builder', () => {
    assert.match(game, /const PHONE_SHEET_PANELS = Object\.freeze\(\['make-panel', 'vendor-panel'\]\);/);
    assert.match(game, /sheet\.classList\.contains\('side-panel'\) \|\| PHONE_SHEET_PANELS\.includes\(id\)/);
    assert.match(css, /\[data-phone-sheet="half"\] #game-root :is\(\.side-panel, #make-panel, #vendor-panel, #local-chat-dock\.is-open\):not\(\[hidden\]\),/);
    assert.match(css, /#game-root \.homes-bar\.hb-builder \{ position: absolute; inset: 0; z-index: calc\(var\(--z-panel\) - 1\);/);
    assert.match(read('public/js/ui/phone-layout.js'), /tray: \(\(\) => \{\n\s+const el = doc\.querySelector\('#game-root \.hb-builder:not\(\[hidden\]\) \.hb-tray:not\(\[hidden\]\)'\);/);
  });
});


let playwright = null;
// R52: the WebKit build on a non-Ubuntu Linux needs its environment before Playwright loads.
try { await import('../tools/qa/playwright-env.mjs'); playwright = await import('playwright'); } catch { /* no Playwright */ }

const SAFE_T = 86; // an iPhone 16 Pro's 62 px inset plus the Home Screen app's 24 px fade clearance
const SAFE_B = 34;

/** Playwright has no env() inset: the clearance is forced on :root (a sheet: the game rewrites html's style). */
const forceFrame = ([t, b]) => {
  try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ }
  const add = () => {
    const st = document.createElement('style');
    st.textContent = `:root { --safe-t: ${t}px !important; --safe-b: ${b}px !important; }`;
    (document.head || document.documentElement).append(st);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
};

/** The boxes that matter, and what a tap at the store's Buy and Sell tabs and its close lands on. */
const measure = () => {
  const r = (q) => {
    const e = document.querySelector(q);
    if (!e || e.hidden || !e.getClientRects().length) return null;
    const b = e.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width };
  };
  const vendor = r('#vendor-panel');
  const hits = [...document.querySelectorAll('#vendor-panel .vendor-tab, #vendor-panel .ui-sheet-head button')].filter((e) => e.getClientRects().length).map((e) => {
    const b = e.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { what: e.textContent.trim() || e.getAttribute('aria-label') || e.className, mine: Boolean(top && (top === e || e.contains(top))) };
  });
  const store = document.querySelector('[data-home-store]');
  const sb = store?.getBoundingClientRect();
  const storeTop = sb ? document.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2) : null;
  return {
    vendor,
    banner: r('#game-root .hb-builder:not([hidden]) .hb-banner'),
    tray: r('#game-root .hb-tray'),
    store: sb ? { pressed: store.getAttribute('aria-pressed'), reachable: Boolean(storeTop && (storeTop === store || store.contains(storeTop))) } : null,
    hits,
    price: document.querySelector('#vendor-panel .tile-price')?.textContent.trim() || '',
  };
};

const overlap = (a, b) => Boolean(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);

async function decorateThenStore(browser, ctxOpts, base, { phone }) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(forceFrame, phone ? [SAFE_T, SAFE_B] : [0, 0]);
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(`${base}/play/?autostart=1&fresh=1&resetgame=1&questoffer=off&hstip=0&homedemo=decorate`);
  await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 60_000 });
  await tab.waitForSelector('[data-home-store]', { timeout: 30_000 });
  await tab.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
  await tab.waitForTimeout(1200);
  const before = await tab.evaluate(measure);
  await tab.evaluate(() => document.querySelector('[data-home-store]').click());
  await tab.waitForSelector('#vendor-panel:not([hidden])', { timeout: 10_000 });
  await tab.waitForTimeout(1200);
  const open = await tab.evaluate(measure);
  // The toggle: a second tap on the (pressed) button closes the store.
  await tab.evaluate(() => document.querySelector('[data-home-store]').click());
  await tab.waitForTimeout(800);
  const closed = await tab.evaluate(measure);
  await ctx.close();
  return { before, open, closed, errors };
}

function problems({ before, open, closed }, { phone }) {
  const bad = [];
  if (!open.vendor) return ['the Furniture Store did not open'];
  if (overlap(open.banner, open.vendor)) bad.push(`the Expand / Un-expand bar (${Math.round(open.banner.top)} to ${Math.round(open.banner.bottom)}) lies over the store (${Math.round(open.vendor.top)} to ${Math.round(open.vendor.bottom)})`);
  for (const h of open.hits) if (!h.mine) bad.push(`a tap on the store's "${h.what}" lands on something else`);
  if (before.tray && open.tray && open.tray.width < before.tray.width - 1) bad.push(`the tray lost ${Math.round(before.tray.width - open.tray.width)} px of width beside a store that ends above it`);
  if (phone && overlap(open.tray, open.vendor)) bad.push('the store covers the tray');
  if (!open.store?.reachable) bad.push('the Furniture Store button is covered while the store is open');
  if (open.store?.pressed !== 'true') bad.push(`the Furniture Store button is not pressed while the store is open (aria-pressed ${open.store?.pressed})`);
  if (closed.vendor) bad.push('a second tap on the Furniture Store button left the store open');
  else if (closed.store?.pressed !== 'false') bad.push(`the Furniture Store button stays pressed after the store closed (aria-pressed ${closed.store?.pressed})`);
  if (!/^\d[\d,]* ₡$/.test(open.price)) bad.push(`a price reads "${open.price}", not the number then ₡`);
  return bad;
}

const LOCK_WAIT_MS = 30 * 60_000;
let server = null;
const RUNS = [
  ['webkit', 'an upright iPhone in WebKit, 402x812', { phone: true }],
  ['chromium', 'a computer in Chrome, 1352x802', { phone: false }],
];
for (const [engine, label, opts] of RUNS) {
  describe(`#743 Decoration Mode then the Furniture Store: ${label}`, { skip: !playwright && 'no playwright' }, () => {
    let br = null;
    before(async () => {
      const { openBrowser } = await import('../tools/qa/browser.mjs');
      if (!server) {
        const { startServer } = await import('../tools/qa/serve.mjs');
        server = await startServer({ root: join(root, 'public') });
      }
      try {
        br = await openBrowser({ label: `#743 test (${engine})`, waitMs: LOCK_WAIT_MS, ...(engine === 'webkit' ? { engine } : {}) });
      } catch (e) { console.error(`no ${engine}: ${e.message}`); br = null; }
    }, { timeout: LOCK_WAIT_MS + 60_000 });
    after(async () => {
      await br?.close();
      if (engine === 'chromium') await server?.stop();
    });
    it('the bar keeps off the store, the tray keeps its width, the button toggles the store, the price reads N ₡', { timeout: 150_000 }, async (t) => {
      if (!br) { t.skip(`no ${engine}`); return; }
      const ctxOpts = opts.phone
        ? { ...playwright.devices['iPhone 15 Pro'], viewport: { width: 402, height: 812 } }
        : { viewport: { width: 1352, height: 802 } };
      const base = `http://127.0.0.1:${server.port ?? server.address().port}`;
      const run = await decorateThenStore(br.browser, ctxOpts, base, opts);
      console.log(engine, JSON.stringify({ before: run.before.tray, open: { vendor: run.open.vendor, banner: run.open.banner, tray: run.open.tray, store: run.open.store, price: run.open.price } }));
      assert.deepEqual(problems(run, opts), []);
      assert.deepEqual(run.errors, []);
    });
  });
}
