/**
 * #729 (G1331, sibling G1288; Austin's ruling 2026-11-27, "Glitch's count hover, for boxes and for stacks"):
 * Storage Display Boxes lost their count badge in v0.71.0 (as Glitch) and the reply said the count shows
 * on hover, but hovering a box showed only "Enter | Storage Display Box": the count was only in the
 * click menu's subtitle. Glitch's hover tip named it (Itemstack.as getLocationTip 509-521, 583-585):
 * "12 Cherries (in a Storage Display Box)", from any distance, "Cherries selling for 5₡ (12 remaining)"
 * on a selling box; and a put-down stack's tip was its count and plural, "12 Cherries" (576-581), where
 * ours said "Cherry". The hover (the Enter hint chip, Modern and Classic, a phone's chip too) now says so.
 * Run: node --test tests/sdb-hover-count-729.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chooser from '../public/js/enter-chooser.js?v=297c6d15';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const storage = read('public/js/features/home-storage-feature.js');

describe('#729 the hover words (enter-chooser.js)', () => {
  it('a display box names its count and the box, singular for 1, the item\'s own plural otherwise', () => {
    const { sdbHoverLabel } = chooser;
    assert.equal(typeof sdbHoverLabel, 'function', 'enter-chooser.js has sdbHoverLabel');
    const box = { name: 'Storage Display Box', label: 'Cherry', plural: 'Cherries' };
    assert.equal(sdbHoverLabel({ ...box, count: 12 }), '12 Cherries (in a Storage Display Box)');
    assert.equal(sdbHoverLabel({ ...box, count: 1 }), '1 Cherry (in a Storage Display Box)');
    assert.equal(sdbHoverLabel({ ...box, count: 12, selling: true, price: '5₡' }), 'Cherries selling for 5₡ (12 remaining)');
    assert.equal(sdbHoverLabel({ ...box, count: 0 }), 'Storage Display Box', 'an empty box is its name');
    assert.equal(sdbHoverLabel({ name: 'Storage Display Box' }), 'Storage Display Box');
  });

  it('a stack of more than one is its count and plural, one is its name', () => {
    const { stackHoverLabel, hoverText } = chooser;
    assert.equal(stackHoverLabel({ count: 12, label: 'Cherry', plural: 'Cherries' }), '12 Cherries');
    assert.equal(stackHoverLabel({ count: 1, label: 'Cherry', plural: 'Cherries' }), 'Cherry');
    assert.equal(hoverText({ label: 'Cherry', hoverLabel: '12 Cherries' }), '12 Cherries');
    assert.equal(hoverText({ label: 'Box', hoverLabel: () => '3 Plums (in a Box)' }), '3 Plums (in a Box)', 'read now, so a live count');
    assert.equal(hoverText({ label: 'Tree' }), 'Tree');
    assert.equal(hoverText({ classId: 'x' }), 'x');
  });

  it('game.js: the hint chip says the hover words, and a put-down stack gives its count', () => {
    assert.match(game, /let label = hoverText\(near\);/);
    assert.match(game, /hoverLabel: named \? '' : stackHoverLabel\(\{ count: stack\.count, label: item\.label \|\| stack\.classTsid, plural: item\.namePlural \}\),/);
  });

  it('home-storage-feature.js: a display box\'s hover reads its count when drawn, the shared one online', () => {
    assert.match(storage, /const hoverLabel = isSdbClass\(row\.classTsid\) \? \(\) => boxHover\(engine, row, owner, name\) : '';/);
    const body = storage.slice(storage.indexOf('function boxHover('), storage.indexOf('function sceneKey('));
    assert.match(body, /const shown = boxShown\(engine, row, owner\);/, 'the ledger stock for a selling box (boxShown)');
    assert.match(body, /const count = shown\?\.selling \? shown\.stock : row\.display\?\.count \|\| 0;/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('#729 in Chrome (1687x966, Decoration Mode off): the hover over a box of 12 cherries and a stack of 12 says 12', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'sdb-hover-count-729 test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  for (const ui of ['modern', 'classic']) {
    it(`${ui}: "Enter | 12 Cherries (in a Storage Display Box)", then "12 Cherries" over a stack`, { timeout: 90_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await chrome.browser.newContext({ viewport: { width: 1687, height: 966 } });
      const tab = await ctx.newPage();
      const seen = {};
      try {
        await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&fresh=1&resetgame=1&homedemo=decorate&ui=${ui}`);
        await tab.waitForFunction(() => globalThis.groddleHomePieces?.list?.().some((r) => r.classTsid === 'bag_furniture_sdb'), null, { timeout: 40_000 });
        await tab.evaluate(() => globalThis.groddleHomePieces.place('bag_furniture_sdb', 425));
        await tab.waitForTimeout(500);
        const id = await tab.evaluate(() => globalThis.groddleHomePieces.list().filter((r) => r.classTsid === 'bag_furniture_sdb').at(-1).id);
        await tab.keyboard.press('Escape');
        await tab.waitForTimeout(600);
        if (await tab.evaluate(() => globalThis.groddleHomePieces.mode())) {
          await tab.getByRole('button', { name: /^(Done|Decorate)$/ }).first().click().catch(() => {});
          await tab.waitForTimeout(600);
        }
        assert.equal(await tab.evaluate(() => globalThis.groddleHomePieces.mode()), null, 'Decoration Mode is off, as in the report');
        await tab.evaluate(([i]) => globalThis.groddleHomePieces.show(i, 'cherry', 12), [id]);
        await tab.waitForTimeout(900);
        const hoverAt = async (label) => {
          const art = (await tab.evaluate((l) => globalThis.groddleQA.drawnArt(l), label)).filter((a) => a.url.includes('cherry')).at(-1);
          assert.ok(art, `${label} is drawn as a cherry`);
          const cx = art.bounds.x + art.bounds.width / 2;
          const cy = art.bounds.y + art.bounds.height / 2;
          await tab.mouse.move(cx - 300, cy + 200);
          await tab.waitForTimeout(200);
          await tab.mouse.move(cx, cy, { steps: 8 });
          await tab.waitForTimeout(700);
          return tab.evaluate(() => ({ target: document.querySelector('canvas')?.dataset.hoverTarget, hint: document.querySelector('canvas')?.dataset.enterHint }));
        };
        seen.box = await hoverAt('sdb-icon');
        assert.equal(seen.box.target, 'home_storage', 'the mouse is over the box');
        assert.match(seen.box.hint, /^(Enter)?\|12 Cherries \(in a Storage Display Box\)$/, `Glitch: "12 Cherries (in a Storage Display Box)"; it showed "${seen.box.hint}"`);
        // A plain stack of 12 set down from the pack.
        await tab.mouse.move(5, 5);
        await tab.evaluate(() => globalThis.groddlePack.grant('cherry', 12));
        await tab.evaluate(async () => {
          const wait = () => new Promise((d) => setTimeout(d, 200));
          const find = () => document.querySelector('.pack-slot[data-tsid="cherry"]');
          if (!find()) for (const b of document.querySelectorAll('.pack-slot[data-pack-bag]')) { b.click(); await wait(); if (find()) break; b.click(); await wait(); }
          find()?.click();
          await wait();
          document.querySelector('#pack-popover [data-pack-drop]')?.click();
          await wait();
        });
        const num = tab.locator('[data-pack-drop-num]');
        if (await num.count()) {
          await num.fill('12');
          await tab.click('[data-pack-drop-confirm]');
        }
        await tab.waitForTimeout(900);
        seen.stack = await hoverAt('world-item-stack');
        assert.equal(seen.stack.target, 'dropped_item', 'the mouse is over the stack');
        assert.match(seen.stack.hint, /^(Enter)?\|12 Cherries$/, `Glitch: "12 Cherries"; it showed "${seen.stack.hint}"`);
      } finally {
        if (process.env.SDB729_SHOTS) await tab.screenshot({ path: join(process.env.SDB729_SHOTS, `hover-${ui}.png`) }).catch(() => {});
        console.log(ui, JSON.stringify(seen));
        await ctx.close();
      }
    });
  }
});
