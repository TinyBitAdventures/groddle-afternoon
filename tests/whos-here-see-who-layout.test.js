/**
 * "See who" cut off at the foot of Who's here (a review screenshot, desktop and upright phone): the
 * Social drawer's Local head is capped (70% of the drawer while the list is open) and scrolled as one
 * box, so on a street with a few players the last line, "N other players online. See who", sat half
 * under the head's edge, or out of sight below it.
 *
 * Now the rows scroll on their own (style.css, #local-chat-dock .social-who-rows) and "People here"
 * and the online line stay in full. Glitch had no such list (its tip named the street's people,
 * RightSideManager.as localTooltip 1212-1255); the online line is ours (#415 follow-up).
 *
 * The browser check draws the online drawer in the real page: the solo page's dock is swapped for a
 * fresh copy of play/index.html's and an online drawer (js/ui/social-drawer.js) is mounted on it with
 * a fake realtime client, as tests/r415-whos-here.test.js does in a fake DOM.
 * Run: node --test tests/whos-here-see-who-layout.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

describe('Who\'s here: the rows scroll, the online line stays', () => {
  it('style.css lets the rows scroll inside the capped head', () => {
    assert.match(css, /#local-chat-dock \.social-who-list \.social-who-rows \{[^}]*overflow-y: auto;/);
    assert.match(css, /#local-chat-dock \.social-view-head:has\(\.social-who-list:not\(\[hidden\]\)\) \{ display: flex; flex-direction: column; \}/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SIZES = [
  ['desktop 1536x702', { viewport: { width: 1536, height: 702 } }],
  ['desktop 1280x600', { viewport: { width: 1280, height: 600 } }],
  ['phone 402x812', { viewport: { width: 402, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: IPHONE }],
];

describe('"See who" in full, in Chrome', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'whos-here-see-who-layout test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  for (const [name, opts] of SIZES) {
    it(`${name}: with 2 to 9 people here the online line is inside the head, and the last row scrolls into view`, { timeout: 120_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await chrome.browser.newContext(opts);
      // The game on a phone (tools/qa phone contexts set it), not the phone companion page.
      await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
      await tab.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 40_000 });
      const rows = await tab.evaluate(async () => {
        const wait = (ms) => new Promise((d) => setTimeout(d, ms));
        const game = await (await fetch('/game.js')).text();
        const { mountSocialDrawer } = await import('/' + game.match(/'\.\/(js\/ui\/social-drawer\.js\?v=[0-9a-f]+)'/)[1]);
        const { createNotifier } = await import('/' + game.match(/'\.\/(js\/notify\.js\?v=[0-9a-f]+)'/)[1]);
        const html = await (await fetch('/play/index.html')).text();
        const dock = document.importNode(new DOMParser().parseFromString(html, 'text/html').getElementById('local-chat-dock'), true);
        document.getElementById('local-chat-dock').replaceWith(dock);
        const people = (n) => ({ state: 'online', me: { id: 1, name: 'Ada' }, here: n, players: Array.from({ length: n - 1 }, (_, i) => ({ id: 10 + i, name: `Player ${i + 1}` })) });
        window.groddleRealtime = { client: people(2) };
        let drawer = null;
        drawer = mountSocialDrawer({ root: document.getElementById('game-root'), dock, notifier: createNotifier({ onChange: () => drawer?.update() }), mode: 'online', contextMenu: () => ({ isOpenFor: () => false, close: () => {} }) });
        const emotes = document.createElement('div');
        emotes.className = 'mp-emotes';
        for (const w of ['Happy', 'Surprised', 'Angry', 'Hi']) {
          const b = document.createElement('button');
          b.textContent = w;
          emotes.append(b);
        }
        drawer.channel('local', { header: emotes });
        drawer.setOnline(1);
        drawer.open();
        drawer.select('local');
        for (let i = 0; i < 3; i++) drawer.localLine('Player 1', `Hello ${i}`);
        const out = [];
        for (let n = 2; n <= 9; n++) {
          window.groddleRealtime.client = people(n);
          const btn = dock.querySelector('[data-social-who]');
          if (btn.getAttribute('aria-expanded') === 'true') btn.click();
          await wait(100);
          btn.click();
          await wait(300);
          const head = dock.querySelector('[data-social-view-head]').getBoundingClientRect();
          const link = dock.querySelector('[data-social-who-chat]').getBoundingClientRect();
          const last = [...dock.querySelectorAll('[data-social-who-rows] > li')].pop();
          last.scrollIntoView({ block: 'nearest' });
          const scrolled = dock.querySelector('[data-social-who-rows]').scrollTop;
          // A redraw (any notice redraws the drawer) keeps the rows where they were scrolled to.
          drawer.update();
          drawer.refresh();
          await wait(100);
          const kept = dock.querySelector('[data-social-who-rows]').scrollTop;
          const l = [...dock.querySelectorAll('[data-social-who-rows] > li')].pop().getBoundingClientRect();
          const box = dock.querySelector('[data-social-view-head]').getBoundingClientRect();
          const ul = dock.querySelector('[data-social-who-rows]').getBoundingClientRect();
          const inside = (r, b) => r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
          out.push({ n, link: [link.top, link.bottom], head: [head.top, head.bottom], last: [l.top, l.bottom], rows: [ul.top, ul.bottom], box: [box.top, box.bottom], scrolled, kept, lastRowShown: inside(l, box) && inside(l, ul) });
        }
        return out;
      });
      await ctx.close();
      for (const r of rows) {
        assert.ok(r.link[0] >= r.head[0] - 0.5 && r.link[1] <= r.head[1] + 0.5 && r.link[1] > r.link[0], `${name}, ${r.n} here: "See who" at ${r.link.map(Math.round)} in a head at ${r.head.map(Math.round)}`);
        assert.equal(r.kept, r.scrolled, `${name}, ${r.n} here: a redraw keeps the rows' scroll`);
        assert.ok(r.lastRowShown, `${name}, ${r.n} here: the last row can be scrolled to (${JSON.stringify(r)})`);
      }
    });
  }
});
