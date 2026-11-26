/**
 * Root R54 (#701, #702, live v0.73.0): one throw inside Pixi's render breaks every later frame. The
 * house's target is a PIXI.Graphics hit box; the reach glow and the hover rim gave the rim's copies
 * its non-texture, Pixi threw inside app.render with the rim's filter pushed, and the world blinked
 * out on every street until a reload (fixed in e421b6cae61, spriteHasRimArt in js/enter-chooser.js;
 * tests/rim-art-701.test.js checks the guard and its callers in the source). Nothing drew every kind
 * of target in a real browser, so the rim path had never run on a Graphics box before players hit it.
 *
 * Here, in Chrome at the report's size (1453x805), on the home street, the house with its back yard
 * and garden (Cultivate left), a vendor street (West Spice: a Spice Trant, Helga, animals) and a
 * street with signposts and a garden (Hechey Track, the default start), the avatar is set down beside
 * every interactable and every signpost (the reach glow, the signpost glow) and the mouse points at
 * each (the hover rim). It fails on any render or frame stage throw (groddleQA.frameStageThrows)
 * or any page error.
 * Run: node --test tests/rim-walk-r54.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const BASE_QUERY = 'autostart=1&fresh=1&resetgame=1&questoffer=off';
const STREETS = [
  { name: 'the home street (the house door is a Graphics hit box)', query: 'homedemo=home', tsid: 'RH_HOME_EXT', hover: 'home_door' },
  { name: 'the house, its back yard and garden', query: 'homedemo=interior&homeyarddemo=cultivate', tsid: 'RH_HOME_INT', escape: true },
  { name: 'a vendor street (West Spice)', query: 'streetdemo=GM413RQ6LRG9N', tsid: 'GM413RQ6LRG9N' },
  { name: 'signposts and a garden (Hechey Track, the default start)', query: '', tsid: 'GLI2V0UN7RD1T2J', signposts: true },
];

describe('R54: walking to and pointing at every target draws without a render throw (Chrome)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  let page = null;
  const errors = [];
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'R54 rim walk test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
    page = await chrome.browser.newPage({ viewport: { width: 1453, height: 805 } });
    page.on('pageerror', (e) => errors.push(String(e?.stack || e?.message || e).split('\n').slice(0, 3).join(' ')));
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  /** The throws so far, named (the page's own count, every frame stage the render included). */
  const throwsNow = () => page.evaluate(() => window.groddleQA.frameStageThrows());
  const clean = async (where) => {
    const thrown = await throwsNow();
    assert.deepEqual(thrown, {}, `a frame stage threw ${where}: ${JSON.stringify(thrown)}`);
    assert.deepEqual(errors, [], `a page error ${where}`);
  };

  for (const street of STREETS) {
    it(`${street.name}: every interactable${street.signposts ? ' and signpost' : ''}, in reach and under the mouse`, { timeout: 45_000 }, async (t) => {
      const base = `http://127.0.0.1:${server.address().port}`;
      errors.length = 0; // each street a fresh page load
      await page.goto(`${base}/play/?${BASE_QUERY}${street.query ? `&${street.query}` : ''}`, { waitUntil: 'load' });
      await page.waitForFunction((tsid) => window.groddleQA?.snapshot && window.groddleQA.placeAvatar
        && !document.body.classList.contains('is-booting') && window.groddleQA.snapshot().street?.tsid === tsid, street.tsid, { timeout: 30_000 });
      await page.waitForTimeout(1500);
      if (street.escape) {
        await page.keyboard.press('Escape'); // leave Cultivate
        await page.waitForTimeout(300);
      }
      await clean('as the street loaded');

      const snap = await page.evaluate(() => window.groddleQA.snapshot());
      const stops = snap.interactables.map((o, i) => ({ i, what: `${o.classId}#${i}`, x: o.x, y: o.y }));
      if (street.signposts) {
        assert.ok(snap.signposts.length > 0, 'the street has signposts');
        snap.signposts.forEach((s, i) => stops.push({ i: -1, what: `signpost#${i}`, x: s.x, y: s.y, post: true }));
      }
      assert.ok(stops.length > 0, 'something to walk to');

      const hovered = new Set();
      const glowed = new Set();
      for (const stop of stops) {
        // Beside it, a little above its feet: the avatar lands on its floor (the reach glow, the signpost glow).
        await page.evaluate(({ x, y }) => window.groddleQA.placeAvatar(x - 45, y - 6), stop);
        await page.waitForTimeout(260);
        // Then the mouse on it where the camera has it now (the hover rim).
        const at = await page.evaluate(({ i, post }) => {
          const s = window.groddleQA.snapshot();
          if (post) return null;
          return s.interactables[i]?.page || null;
        }, stop);
        if (at && at.x > 0 && at.y > 0 && at.x < 1453 && at.y < 805) {
          await page.mouse.move(at.x, at.y);
          await page.waitForTimeout(180);
        }
        const seen = await page.evaluate(() => {
          const c = document.querySelector('#game-root canvas');
          return { hover: c?.dataset.hoverTarget || '', glow: c?.dataset.reachGlow || '' };
        });
        if (seen.hover) hovered.add(seen.hover);
        for (const id of seen.glow.split(',').filter(Boolean)) glowed.add(id);
        await clean(`beside ${stop.what} on ${street.tsid}`);
      }
      // A moment on: a throw that breaks the frames after it shows by now.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await clean(`after the walk on ${street.tsid}`);
      t.diagnostic(`${street.tsid}: ${stops.length} stops; hovered ${[...hovered].join(',')}; glowed ${[...glowed].join(',')}`);
      assert.ok(hovered.size > 0, `the mouse found a target on ${street.tsid} (the hover rim's path ran)`);
      if (street.hover) assert.ok(hovered.has(street.hover), `the mouse found ${street.hover} on ${street.tsid}: ${[...hovered]}`);
      assert.ok(glowed.size > 0, `something glowed in reach on ${street.tsid}`);
    });
  }
});
