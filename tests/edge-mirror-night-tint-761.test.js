/**
 * #761: at night the edge mirror past a street's right end was tinted twice. renderEdgeStrip
 * (street-render.js) rendered the layer into the strip's texture with the layer's sky-clock tint
 * on it (Pixi 8 containers pass their tint to their children), then the mirror's view took the same
 * tint (setSkyLook tints every `edgeOf` view): the far layers' reflections came out about tint^2,
 * darker boxes at the far right of Nila Nila, one per layer. The bake is now untinted and the view
 * alone carries the tint, following the clock with its layer.
 * Player's screen: desktop 1446x719 at 1.3. Serves this checkout's public/ (tools/qa/serve.mjs).
 * Run: node --test tests/edge-mirror-night-tint-761.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }
const NILA_NILA = 'GHFL2SL1R0J2655';
// Rows (device px at 1.3) through the far hills and the bg_1 band, where the mirror seams sit
// past x 1700 at this screen size (left of that, Nila Nila's own art has a rock edge at 1632).
const BANDS = [[180, 240], [260, 330]];

async function rightEndSeams(browser, BASE, time) {
  const ctx = await browser.newContext({ viewport: { width: 1446, height: 719 }, deviceScaleFactor: 1.3 });
  try {
    const tab = await ctx.newPage();
    await tab.goto(`${BASE}/play/?autostart=1&fresh=1&resetgame=1&questoffer=off&hstip=0&prompt=off&timedemo=${time}&streetdemo=${NILA_NILA}&streetx=99999`);
    await tab.waitForFunction(() => {
      const s = window.groddleQA?.edgeMirrors?.();
      return s && s.builds >= 1 && document.getElementById('overlay')?.classList.contains('hidden');
    }, null, { timeout: 40_000 });
    await tab.waitForTimeout(2500);
    // Only the canvas: hide the drawer, toasts and HUD over it.
    await tab.evaluate(() => {
      const c = document.querySelector('canvas');
      for (const el of document.body.querySelectorAll('*')) {
        if (el === c || el.contains(c)) continue;
        if (el.parentElement && (el.parentElement === document.body || el.parentElement.contains(c))) el.style.visibility = 'hidden';
      }
    });
    await tab.waitForTimeout(300);
    const png = (await tab.screenshot()).toString('base64');
    return await tab.evaluate(async ({ png, bands }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const cv = new OffscreenCanvas(img.width, img.height);
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data, width } = g.getImageData(0, 0, img.width, img.height);
      const lum = (x, y) => { const i = (y * width + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
      const out = [];
      for (const [y0, y1] of bands) {
        const col = (x) => { let s = 0; for (let y = y0; y < y1; y++) s += lum(x, y); return s / (y1 - y0); };
        let best = { x: -1, d: 0 };
        for (let x = 1700; x < width - 14; x++) {
          const d = col(x - 2) - col(x + 2);
          if (Math.abs(d) > Math.abs(best.d)) best = { x, d };
        }
        if (Math.abs(best.d) < 8) { out.push({ band: [y0, y1], seam: null, ratio: 1 }); continue; }
        let l = 0, r = 0;
        for (let k = 0; k < 8; k++) { l += col(best.x - 3 - k); r += col(best.x + 3 + k); }
        out.push({ band: [y0, y1], seam: best.x, ratio: Math.round((r / l) * 100) / 100 });
      }
      return out;
    }, { png, bands: BANDS });
  } finally {
    await ctx.close();
  }
}

describe('#761: the edge mirror carries the sky-clock tint once', { skip: !chromium && 'no playwright' }, () => {
  it('a reflection at Nila Nila\'s right end is as light as the art it mirrors, at night and by day', { timeout: 700_000 }, async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    const server = await startServer({ root: join(root, 'public') });
    const base = `http://127.0.0.1:${server.address().port}`;
    let seen;
    try {
      const chrome = await openBrowser({ label: '#761 edge mirror tint', waitMs: 600_000 });
      try {
        seen = { night: await rightEndSeams(chrome.browser, base, 'night'), day: await rightEndSeams(chrome.browser, base, 'day') };
      } finally {
        await chrome.close();
      }
    } finally {
      await server.stop();
    }
    for (const [time, bands] of Object.entries(seen)) {
      for (const b of bands) {
        assert.ok(b.ratio > 0.88 && b.ratio < 1.14, `${time}, rows ${b.band}: mirror/street brightness ${b.ratio} at x ${b.seam} (${JSON.stringify(seen)})`);
      }
    }
  });
});
