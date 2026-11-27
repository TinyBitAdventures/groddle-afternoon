/**
 * The site page viewer over the game's windows (Austin, 2026-11-27). In a Home Screen app our site's
 * pages and the Encyclopedia open in a sheet over the game (js/ui/encyclopedia-sheet.js, #401, #741).
 * The sheet is a modal dialog, so js/window-stack.js stacked it as one of the game's windows: a quest
 * offer (or an award screen) that popped up while a page was open went one above it (z 1201 over the
 * sheet's 1200) and drew over the page.
 *
 * Glitch kept every site page in its own browser window over the game (TSFrontController.as 4353-4400),
 * so nothing the game opened could land on it. The viewer is now a top window (as the start card and
 * the report window): what opens while it is up goes in under it and shows when the page closes. Its
 * own layer is --z-viewer, over the home and mail panels (z-top + 100).
 * Run: node --test tests/site-viewer-over-windows.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_VIEWER_SELECTOR, WINDOW_SELECTOR, isTopWindow, stackZ } from '../public/js/window-stack.js?v=d8e13764';
import { resolveTokens } from './css-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the viewer is a top window', () => {
  const matching = (selector) => ({ matches: (s) => s === selector || s === WINDOW_SELECTOR });

  it('the sheet is a top window; a quest offer opened after it stacks under it', () => {
    assert.equal(PAGE_VIEWER_SELECTOR, '#ency-sheet');
    assert.equal(isTopWindow(matching('#ency-sheet')), true);
    assert.equal(isTopWindow(matching('.quest-dialogue')), false);
    const viewer = Number(resolveTokens('var(--z-viewer)'));
    // The page opened first (oldest), then a quest offer (510) and an award screen (96).
    const [page, offer, award] = stackZ([{ base: viewer, top: true }, { base: 510 }, { base: 96, screen: true }]);
    assert.ok(page > offer && page > award, `page ${page}, offer ${offer}, award ${award}`);
    // The report window opened over the page still goes over it (both top: in the order they opened).
    const [p2, report] = stackZ([{ base: viewer, top: true }, { base: 512, top: true }]);
    assert.ok(report > p2);
  });

  it('its layer is a token over every game layer, home and mail included', () => {
    const z = (name) => Number(resolveTokens(`var(${name})`));
    assert.ok(z('--z-viewer') > z('--z-top') + 100, 'over the home and mail panels');
    assert.ok(z('--z-viewer') < z('--z-dev'));
    const sheet = readFileSync(join(root, 'public/js/ui/encyclopedia-sheet.js'), 'utf8');
    assert.match(sheet, /#ency-sheet\.ency-sheet \{ position: fixed; inset: 0; z-index: var\(--z-viewer\);/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('a quest offer while a page is open, in Chrome (1536x702, ?homescreen=1)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'site-viewer-over-windows test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('the offer goes in under the page and is on top once the page closes', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 1536, height: 702 } });
    const tab = await ctx.newPage();
    // questoffer=now: the first offer 1.5 s in; seasonnotice=off: no festival award screen in its way.
    await tab.goto(`${base}/play/?autostart=1&questoffer=now&seasonnotice=off&hstip=0&homescreen=1`);
    await tab.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 40_000 });
    // A link to our site (catchSiteLinks) opens the viewer.
    await tab.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/encyclopedia/';
      document.body.append(a);
      a.click();
      a.remove();
    });
    await tab.waitForFunction(() => document.getElementById('ency-sheet')?.hidden === false, null, { timeout: 5000 });
    await tab.waitForFunction(() => document.getElementById('quest-dialogue')?.hidden === false, null, { timeout: 40_000 });
    await tab.waitForTimeout(500);
    const hitAt = () => tab.evaluate(() => {
      const card = document.querySelector('#quest-dialogue .quest-dialogue-card').getBoundingClientRect();
      const hit = document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2);
      return { sheet: Boolean(hit?.closest('#ency-sheet')), offer: Boolean(hit?.closest('#quest-dialogue')), z: [getComputedStyle(document.getElementById('ency-sheet')).zIndex, getComputedStyle(document.getElementById('quest-dialogue')).zIndex] };
    });
    const during = await hitAt();
    await tab.click('#ency-sheet .ency-sheet-close');
    await tab.waitForTimeout(300);
    const afterClose = await hitAt();
    await ctx.close();
    assert.equal(during.sheet, true, `the page is on top while it is open: ${JSON.stringify(during)}`);
    assert.equal(afterClose.offer, true, `the offer waits under it: ${JSON.stringify(afterClose)}`);
  });
});
