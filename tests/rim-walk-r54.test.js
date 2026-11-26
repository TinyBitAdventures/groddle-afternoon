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
 * #712 (desktop 1453x805): the rim never showed on rocks and Street Spirits. Their targets are
 * Containers (a rock's root around its art, a spirit around its body and name) and only a Sprite took
 * a rim. Glitch glowed every interaction sprite in reach (MiddleGroundRenderer.as
 * _findInteractionSprites 1092-1131). On Flogan Shames a rock and the Street Spirit now glow in reach
 * and under the mouse, and on every street each thing the mouse finds draws a rim (canvas data
 * hoverRims) unless it is one of the few with no art at all (noArt: the home street's house door, a
 * Graphics box the house art paints over; a new garden's bare bed). #669 (2026-11-26): a mouse-over
 * rims only a thing in reach (canvas data hoverRimShown), so only those count.
 * Run: node --test tests/rim-walk-r54.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../tools/builder/art-image.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

const BASE_QUERY = 'autostart=1&fresh=1&resetgame=1&questoffer=off';
const STREETS = [
  { name: 'the home street (the house door is a Graphics hit box)', query: 'homedemo=home', tsid: 'RH_HOME_EXT', hover: 'home_door', noArt: ['home_door'] },
  { name: 'the house, its back yard and garden', query: 'homedemo=interior&homeyarddemo=cultivate', tsid: 'RH_HOME_INT', escape: true, noArt: ['garden_new'], rims: [/^home_storage$/] },
  { name: 'a vendor street (West Spice)', query: 'streetdemo=GM413RQ6LRG9N', tsid: 'GM413RQ6LRG9N' },
  { name: 'signposts and a garden (Hechey Track, the default start)', query: '', tsid: 'GLI2V0UN7RD1T2J', signposts: true, noArt: ['garden_new'] },
  // #712: rocks and a Street Spirit (Containers) glow in reach and under the mouse.
  { name: 'rocks and a Street Spirit (Flogan Shames, #712)', query: 'streetdemo=GHV1F2U5M212P9C', tsid: 'GHV1F2U5M212P9C', rims: [/^rock_/, /^street_spirit_/], look: true },
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
      const rimmed = new Set(); // hovered and drew at least one rim
      const bare = new Set(); // hovered and drew none
      const readGlow = () => page.evaluate(() => document.querySelector('#game-root canvas')?.dataset.reachGlow || '');
      for (const stop of stops) {
        // Beside it, a little above its feet: the avatar lands on its floor (the reach glow, the signpost glow).
        await page.mouse.move(5, 5); // nothing under the mouse: the thing beside the avatar glows in reach
        await page.evaluate(({ x, y }) => window.groddleQA.placeAvatar(x - 45, y - 6), stop);
        await page.waitForTimeout(260);
        for (const id of (await readGlow()).split(',').filter(Boolean)) glowed.add(id);
        // Then the mouse on it where the camera has it now (the hover rim).
        const at = await page.evaluate(({ i, post }) => {
          const s = window.groddleQA.snapshot();
          if (post) return null;
          return s.interactables[i]?.page || null;
        }, stop);
        if (at && at.x > 0 && at.y > 0 && at.x < 1453 && at.y < 805) {
          await page.mouse.move(at.x, at.y);
          await page.waitForTimeout(180);
          // The camera may still be easing after the avatar's move: aim again where it is now.
          const again = await page.evaluate(({ i }) => window.groddleQA.snapshot().interactables[i]?.page || null, stop);
          if (again && Math.hypot(again.x - at.x, again.y - at.y) > 4 && again.x > 0 && again.y > 0 && again.x < 1453 && again.y < 805) {
            await page.mouse.move(5, 5);
            await page.mouse.move(again.x, again.y);
            await page.waitForTimeout(180);
          }
        }
        const seen = await page.evaluate(() => {
          const c = document.querySelector('#game-root canvas');
          return { hover: c?.dataset.hoverTarget || '', rims: Number(c?.dataset.hoverRims || 0), shown: c?.dataset.hoverRimShown === '1', glow: c?.dataset.reachGlow || '' };
        });
        if (seen.hover) hovered.add(seen.hover);
        // #669 (2026-11-26): a mouse-over rims a thing only in reach (hoverRimShown).
        if (seen.hover && seen.shown) (seen.rims > 0 ? rimmed : bare).add(seen.hover);
        for (const id of seen.glow.split(',').filter(Boolean)) glowed.add(id);
        await clean(`beside ${stop.what} on ${street.tsid}`);
      }
      // A moment on: a throw that breaks the frames after it shows by now.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await clean(`after the walk on ${street.tsid}`);
      t.diagnostic(`${street.tsid}: ${stops.length} stops; hovered ${[...hovered].join(',')}; rimmed ${[...rimmed].join(',')}; no rim ${[...bare].join(',')}; glowed ${[...glowed].join(',')}`);
      assert.ok(hovered.size > 0, `the mouse found a target on ${street.tsid} (the hover rim's path ran)`);
      if (street.hover) assert.ok(hovered.has(street.hover), `the mouse found ${street.hover} on ${street.tsid}: ${[...hovered]}`);
      assert.ok(glowed.size > 0, `something glowed in reach on ${street.tsid}`);
      // #712: whatever the mouse finds draws a rim, but the few things with no art to trace.
      const noArt = new Set(street.noArt || []);
      const unrimmed = [...bare].filter((id) => !noArt.has(id) && !rimmed.has(id));
      assert.deepEqual(unrimmed, [], `under the mouse with no rim on ${street.tsid}`);
      for (const want of street.rims || []) {
        assert.ok([...glowed].some((id) => want.test(id)), `a ${want} glowed in reach on ${street.tsid}: ${[...glowed]}`);
        // Beside the first one, the camera settled: the rim shows in reach, then under the mouse.
        const i = snap.interactables.findIndex((o) => want.test(o.classId));
        const what = snap.interactables[i].classId;
        await page.mouse.move(5, 5);
        await page.evaluate(({ x, y }) => window.groddleQA.placeAvatar(x - 110, y - 6), snap.interactables[i]);
        await page.waitForTimeout(1300);
        const at = await page.evaluate((i) => window.groddleQA.snapshot().interactables[i].page, i);
        if (street.look) {
          // The pale cyan (0xa8e4ff over the art's edge) on the far side of the thing from the
          // avatar: a filter on a rim kept out of its holder's bounds drew nothing.
          const png = decodePng(await page.screenshot({ clip: { x: Math.round(at.x), y: Math.max(0, Math.round(at.y) - 190), width: 150, height: 230 } }));
          let cyan = 0;
          for (let o = 0; o < png.px.length; o += 4) {
            const [r, g, b] = [png.px[o], png.px[o + 1], png.px[o + 2]];
            if (b >= 120 && b - r >= 20 && g - r >= 12) cyan++;
          }
          t.diagnostic(`${what}: ${cyan} rim pixels in reach`);
          assert.ok(cyan > 150, `the rim shows on ${what} in reach (${cyan} rim-coloured pixels)`);
        }
        await page.mouse.move(at.x, at.y - 20);
        await page.waitForTimeout(250);
        const hover = await page.evaluate(() => { const c = document.querySelector('#game-root canvas'); return { id: c?.dataset.hoverTarget || '', rims: Number(c?.dataset.hoverRims || 0) }; });
        assert.equal(hover.id, what, `the mouse is on ${what}`);
        assert.ok(hover.rims > 0, `${what} drew a rim under the mouse`);
        await clean(`at ${what} on ${street.tsid}`);
      }
    });
  }
});
