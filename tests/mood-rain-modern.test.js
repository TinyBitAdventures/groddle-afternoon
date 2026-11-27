/**
 * The low-mood raincloud in Modern (Austin, 2026-11-27): Glitch's only rain was the raincloud over the
 * player's face while mood is under 20% (glitch-client PlayerFaceUI.as 127-132 adds avatar_rain at
 * (-20, -10) on the 73 px face; 289-290 shows it while the state is the low one, 232-252: under 20%).
 * Classic drew it over its face (css/classic.css); Modern drew nothing. Modern's mood ring now carries
 * the same art and frames, scaled from the 73 px face to the ring, with the same threshold (the ring's
 * data-gauge, js/vitals.js moodGauge, is Classic's moodState). No street rain: Glitch had none.
 * Classic's rain never showed either: the strip's builder (tools/classic-art/build.mjs cleanSvg) prefixed
 * each frame's ids but not the fills' url(#gradient0), so every streak named a gradient that wasn't there.
 * Run: node --test tests/mood-rain-modern.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moodGauge } from '../public/js/vitals.js?v=5efac5f3';
import { cleanSvg } from '../tools/classic-art/build.mjs';
import { moodState } from '../public/js/classic/classic-topbar.js?v=5e854eb7';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const classicCss = readFileSync(join(root, 'public/css/classic.css'), 'utf8');

describe('the low-mood raincloud: Modern as Classic', () => {
  it('one threshold: the ring\'s gauge and the Classic face go low together, under 20%', () => {
    for (let pct = 0; pct <= 100; pct++) {
      assert.equal(moodGauge(pct, 100) === 'low', moodState(pct / 100) === 'low', `${pct}%`);
    }
    assert.equal(moodGauge(19, 100), 'low');
    assert.equal(moodGauge(20, 100), 'meh');
  });

  it('the rain\'s streaks draw: every url(#id) in the strip names one of its ids (the builder prefixed ids, not the fills)', () => {
    const svg = readFileSync(join(root, 'public/assets/classic/avatar_rain.svg'), 'utf8');
    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.equal(refs.length, 10, 'one gradient per frame');
    assert.deepEqual(refs.filter((r) => !ids.has(r)), []);
    const one = cleanSvg('<svg width="2" height="2"><path fill="url(#g)"/><defs><linearGradient id="g"/></defs></svg>', { prefix: 'f1-' }).svg;
    assert.match(one, /fill="url\(#f1-g\)"/);
  });

  it('Modern\'s low mood ring draws avatar_rain over the face, its frames and its place as Classic\'s', () => {
    const rule = css.match(/\[data-ui="modern"\] \.top-bar \.ring\[data-stat="mood"\]\[data-gauge="low"\]::after \{([^}]*)\}/);
    assert.ok(rule, 'a Modern low-mood ::after rule');
    assert.match(rule[1], /avatar_rain\.svg/);
    assert.match(rule[1], /steps\(10\)/);
    const classic = classicCss.match(/\.meta-pill\.mood\[data-classic-mood="low"\]::before \{([^}]*)\}/)[1];
    for (const n of ['-20', '-10', '113.9', '96.65', '1139']) {
      assert.match(classic, new RegExp(`calc\\(${n.replace('.', '\\.')} \\*`), `Classic ${n}`);
      assert.match(rule[1], new RegExp(`calc\\(${n.replace('.', '\\.')} \\*`), `Modern ${n}`);
    }
    assert.match(classic, /0\.42s steps\(10\)/);
    assert.match(rule[1], /0\.42s steps\(10\)/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('the low-mood raincloud in Chrome (1536x702)', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'mood-rain-modern test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  for (const ui of ['modern', 'classic']) {
    it(`${ui}: rain over the face at 19% mood, none at 20%`, { timeout: 90_000 }, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await chrome.browser.newContext({ viewport: { width: 1536, height: 702 } });
      const tab = await ctx.newPage();
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&ui=${ui}`);
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && window.groddleQA?.hudStats, null, { timeout: 40_000 });
      const rain = (mood) => tab.evaluate(async (m) => {
        const max = window.groddleQA.hudStats({}).moodMax;
        window.groddleQA.hudStats({ mood: Math.floor((m / 100) * max) });
        await new Promise((d) => setTimeout(d, 600));
        const ring = document.querySelector('.top-bar .meta-pill.mood');
        const pseudo = document.documentElement.dataset.ui === 'classic' ? '::before' : '::after';
        const st = getComputedStyle(ring, pseudo);
        const box = ring.getBoundingClientRect();
        return { ui: document.documentElement.dataset.ui, img: pseudo === '::after' ? st.maskImage || st.webkitMaskImage : st.backgroundImage, anim: st.animationName, w: parseFloat(st.width), ring: box.width, top: box.top };
      }, mood);
      const low = await rain(19);
      const ok = await rain(20);
      await ctx.close();
      assert.equal(low.ui, ui);
      assert.match(low.img, /avatar_rain\.svg/, `${ui} 19%: ${JSON.stringify(low)}`);
      assert.notEqual(low.anim, 'none');
      // The cloud is 113.9 / 73 of the face: wider than the face it rains on.
      assert.ok(Math.abs(low.w / low.ring - 113.9 / 73) < 0.08, `${ui}: cloud ${low.w} over a ${low.ring} px face`);
      assert.doesNotMatch(ok.img, /avatar_rain/, `${ui} 20%: ${JSON.stringify(ok)}`);
    });
  }
});
