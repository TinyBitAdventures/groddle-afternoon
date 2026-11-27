/**
 * SAFE FRAME (Austin's iPhone 2026-11-26, the game on the Home Screen, upright, v0.74.0: "There are some
 * dialogs or screens that still enter the hazy part of the iPhone"): the skill learned card, the street
 * minimap sheet, the welcome card online, the Magic Rock's talk, the character builder and the phone page
 * put their words and buttons in the status bar's fade. The HUD already kept below --safe-t (the inset plus
 * the Liquid Glass fade, style.css LANDSCAPE-HUD); now everything does (style.css SAFE FRAME).
 * - lint: no raw env(safe-area-inset-top) outside the token definitions (it misses the fade), and every top
 *   offset measured under the top bar (var(--hud-h)) adds --safe-t;
 * - the surfaces Austin saw, and their kin, read --safe-t;
 * - WebKit as an iPhone 15 Pro (393x852, the Home Screen app) and Chrome at 390x844, with the clearance
 *   forced (Playwright has no env() inset: --safe-t 83 px = 59 px inset + 24 px fade, --safe-b 34 px): the
 *   skill learned card, the minimap sheet, the character builder, the Magic Rock's talk, the welcome card
 *   online, a centred window and the phone page keep every visible word and button inside the frame.
 * #742: the Hi sign leaderboard and the Calendar wrote their tops in a feature's CSS string (top: 3.2rem, 3rem),
 * which the lint never read; now every fixed window's top, in a stylesheet or a CSS string, adds --safe-t, and
 * both are checked in the browsers (with Gifts, Trade and the storage windows fixed by the same lint).
 * Run: node --test tests/safe-frame.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/style.css');

/** Every stylesheet, script and page the game and the phone page ship (not the art). */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(css|js|mjs|html)$/.test(name)) out.push(relative(root, p));
    }
  };
  for (const d of ['js', 'css', 'play']) walk(join(pub, d));
  return [...out, 'public/style.css', 'public/game.js'];
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

/** Each top, padding, padding-top or inset declaration and its value (CSS, or a feature's CSS string). */
function declarations(src) {
  const out = [];
  for (const m of src.matchAll(/(?<![\w(-])(top|padding|padding-top|inset)\s*:\s*/g)) {
    let d = 0;
    let end = m.index + m[0].length;
    for (; end < src.length; end += 1) {
      const c = src[end];
      if (c === '(') d += 1;
      else if (c === ')') { d -= 1; if (d < 0) break; } else if (d === 0 && /[;}`'"\n]/.test(c)) break;
    }
    out.push({ prop: m[1], value: src.slice(m.index + m[0].length, end) });
  }
  return out;
}

/**
 * Raw env(safe-area-inset-top) is allowed only where a --safe-t token is defined from it. Add an entry here
 * (with the reason) only for a surface that must sit at the bare inset; none does today.
 */
const RAW_TOP_ALLOWED = [];

describe('SAFE FRAME: the lint', () => {
  const files = sources();

  it('no surface reads the raw top inset; it reads --safe-t (the inset plus the status bar\'s fade)', () => {
    const bad = [];
    for (const f of files) {
      const lines = stripComments(read(f)).split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('env(safe-area-inset-top')) return;
        if (/--safe-t:\s*(env|calc\(env)/.test(line)) return; // the token itself (style.css LANDSCAPE-HUD, phone.css)
        if (RAW_TOP_ALLOWED.some(([file, re]) => file === f && re.test(line))) return;
        bad.push(`${f}: ${line.trim().slice(0, 140)}`);
      });
    }
    assert.deepEqual(bad, []);
  });

  it('every top offset under the top bar (var(--hud-h)) adds --safe-t', () => {
    const bad = [];
    for (const f of files) {
      for (const { prop, value } of declarations(stripComments(read(f)))) {
        if (value.includes('var(--hud-h') && !value.includes('--safe-t')) bad.push(`${f}: ${prop}: ${value.slice(0, 120)}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  // #742: the Hi sign leaderboard (3.2rem) and the Calendar (3rem, 2.6rem on a narrow phone) wrote their tops
  // in a feature's CSS string, from the window's edge, and sat under an upright iPhone's clock and camera.
  it('every fixed window\'s top from the screen\'s edge, in a stylesheet or a feature\'s CSS string, adds --safe-t', () => {
    const bad = [];
    for (const f of files) {
      const src = stripComments(read(f));
      // Each rule (or style string) and its selector; a selector made fixed anywhere in the file keeps the check in its @media rules.
      const blocks = [...src.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].split(/[`'"]/).pop().trim(), body: m[2] }));
      const fixed = new Set();
      for (const b of blocks) if (/position\s*:\s*fixed/.test(b.body)) for (const s of b.sel.split(',')) fixed.add(s.trim());
      for (const b of blocks) {
        if (!/position\s*:\s*fixed/.test(b.body) && !b.sel.split(',').some((s) => fixed.has(s.trim()))) continue;
        for (const m of b.body.matchAll(/(?<![\w-])top\s*:\s*([^;}`'"\n]+)/g)) {
          const v = m[1].trim();
          // A length down from the top (not 0, a centring percentage or a negative tuck) clears the status bar.
          if (/\d(px|rem|em|vh|dvh|svh|lvh)\b/.test(v) && !v.startsWith('-') && !v.includes('--safe-t')) bad.push(`${f}: ${b.sel.slice(-60)} { top: ${v} }`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  it('the surfaces Austin saw, and their kin, keep below --safe-t', () => {
    const rule = (src, sel) => {
      const at = src.indexOf(`${sel} {`);
      assert.ok(at >= 0, sel);
      return src.slice(at, src.indexOf('}', at));
    };
    // The skill learned card and the Magic Rock's talk: 30 px under the header (FamiliarDialog.as _place), the header under the fade.
    assert.match(rule(css, '.familiar-dialog'), /top: calc\(30px \+ var\(--safe-t\)\);/);
    assert.match(css, /\.familiar-dialog \{ top: calc\(12px \+ var\(--safe-t\)\);/);
    assert.match(rule(css, '.quest-dialogue[data-look="conversation"] .quest-dialogue-card'), /top: calc\(30px \+ var\(--safe-t\)\);/);
    // The minimap sheet, a centred window (the character builder), the welcome card online, the phone page's bar.
    assert.match(rule(css, '.smm-sheet'), /padding: max\(var\(--space-3\), var\(--safe-t\)\)/);
    assert.match(rule(css, '.glitch-modal'), /padding-top: var\(--safe-t\);/);
    assert.match(read('public/play/online/index.html'), /#overlay:not\(\.hidden\) \{ z-index: var\(--z-screen\); padding: calc\(var\(--sp-4\) \+ var\(--safe-t\)\)/);
    const phone = read('public/play/phone/phone.css');
    assert.match(rule(phone, '.pc-top'), /padding: calc\(8px \+ var\(--safe-t\)\)/);
    assert.match(phone, /:root\.ios-home-app \{ --safe-t: calc\(env\(safe-area-inset-top, 0px\) \+ min\(var\(--ios-fog-clear\)/);
    assert.match(read('public/js/phone/companion.js'), /if \(globalThis\.navigator\?\.standalone === true\) doc\?\.documentElement\.classList\.add\('ios-home-app'\);/);
    // Shades that centre a card: their top padding takes the fade too.
    for (const sel of ['.quest-dialogue', '.rook-museum-exhibit', '.hog-haul-screen', '.mail-panel']) assert.match(rule(css, `\n${sel}`), /padding: calc\([^;]*\+ var\(--safe-t\)\)/, sel);
    for (const f of ['public/js/features/auctions-feature.js', 'public/js/features/snaps-feature.js']) assert.match(read(f), /padding-top: calc\(7dvh \+ var\(--safe-t, 0px\)\);/, f);
    // The new-day screen stays as Austin likes it: its sky runs under the status bar, its words centred.
    assert.doesNotMatch(rule(css, '\n.new-day-screen'), /safe-t|padding/);
  });
});

let playwright = null;
// R52: the WebKit build on a non-Ubuntu Linux needs its environment before Playwright loads.
try { await import('../tools/qa/playwright-env.mjs'); playwright = await import('playwright'); } catch { /* no Playwright */ }

const SAFE_T = 83; // an iPhone 15 Pro's 59 px inset plus the Home Screen app's 24 px fade clearance
const SAFE_B = 34;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Playwright has no env() inset: the clearance is forced on :root (the game rewrites html's style attribute, so a sheet). */
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

/**
 * Every visible word and control in `sel` (clipped by its scrollers, on top where it stands) that is in the
 * status bar's band or the home bar's band. Empty when the surface keeps inside the frame.
 */
const outsideFrame = ([sel, t, b]) => {
  const rootEl = document.querySelector(sel);
  if (!rootEl) return [`no ${sel}`];
  const vh = innerHeight;
  const vw = innerWidth;
  const bad = [];
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT);
  for (let el = rootEl; el; el = walker.nextNode()) {
    const ctl = el.matches('button, a[href], input, select, textarea, [role="button"], [role="tab"]');
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if ((!ctl && !words) || !el.getClientRects().length) continue;
    let shown = true;
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { shown = false; break; }
    }
    if (!shown) continue;
    const r = el.getBoundingClientRect();
    let top = r.top; let bottom = r.bottom; let left = r.left; let right = r.right;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); left = Math.max(left, ar.left); right = Math.min(right, ar.right);
    }
    top = Math.max(top, 0); bottom = Math.min(bottom, vh); left = Math.max(left, 0); right = Math.min(right, vw);
    if (bottom - top < 1 || right - left < 1) continue;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    if (top < t - 0.5 || bottom > vh - b + 0.5) bad.push(`${sel} "${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30)}" ${Math.round(top)} to ${Math.round(bottom)} (frame ${t} to ${vh - b})`);
  }
  return bad;
};

async function booted(tab) {
  await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden') && document.documentElement.classList.contains('phone-layout'), null, { timeout: 60_000 });
}

/** The game on a phone, upright: the skill learned card, the minimap sheet and the character builder. */
async function gameSurfaces(browser, ctxOpts, base) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(forceFrame, [SAFE_T, SAFE_B]);
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  const bad = [];
  await tab.goto(`${base}/play/?autostart=1&fresh=1&resetgame=1&questoffer=off&hstip=0&familiardemo=skill`);
  await booted(tab);
  await tab.waitForSelector('.familiar-dialog:not([hidden])', { timeout: 30_000 });
  await tab.waitForTimeout(700); // the card grows (0.3 s)
  bad.push(...await tab.evaluate(outsideFrame, ['.familiar-dialog', SAFE_T, SAFE_B]));
  await tab.evaluate(() => document.querySelector('.familiar-dialog .fam-close')?.click());
  await tab.waitForTimeout(600);
  await tab.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Got it' && b.offsetParent) b.click(); });
  await tab.evaluate(() => document.querySelector('.smm-phone-btn').click());
  await tab.waitForSelector('.smm-sheet', { timeout: 10_000 });
  await tab.waitForTimeout(400);
  bad.push(...await tab.evaluate(outsideFrame, ['.smm-sheet', SAFE_T, SAFE_B]));
  await tab.evaluate(() => document.querySelector('.smm-sheet-x').click());
  await tab.waitForTimeout(400);
  await tab.evaluate(() => document.getElementById('avatar-btn').click());
  await tab.waitForSelector('#avatar-panel:not([hidden])', { timeout: 10_000 });
  await tab.waitForTimeout(600);
  bad.push(...await tab.evaluate(outsideFrame, ['#avatar-panel', SAFE_T, SAFE_B]));
  // #742: the Calendar (the clock's window solo, the hi sign board's Calendar button online).
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(400);
  await tab.evaluate(() => window.dispatchEvent(new Event('groddle:calendar')));
  await tab.waitForSelector('.ur-calendar:not([hidden])', { timeout: 10_000 });
  await tab.waitForTimeout(400);
  bad.push(...await tab.evaluate(outsideFrame, ['.ur-calendar', SAFE_T, SAFE_B]));
  await ctx.close();
  return { bad, errors };
}

/** Surfaces drawn from the game's own CSS: the Magic Rock's talk, the welcome card online (a returning player's, tall), a centred window. */
async function cssSurfaces(browser, ctxOpts) {
  const online = read('public/play/online/index.html');
  const onlineCss = online.slice(online.indexOf('<style>') + 7, online.indexOf('</style>'));
  const rows = Array.from({ length: 30 }, (_, i) => `<p>Today ${i}</p>`).join('');
  const ctx = await browser.newContext(ctxOpts);
  const tab = await ctx.newPage();
  const bad = [];
  const frame = `:root { --safe-t: ${SAFE_T}px !important; --safe-b: ${SAFE_B}px !important; } html, body { margin: 0; height: 100%; } #game-root { position: fixed; inset: 0; border-radius: 0; }`;
  await tab.setContent(`<!doctype html><html data-ui="modern" class="touch-phone phone-layout"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style><style>${onlineCss}</style><style>${frame}</style></head><body><div id="game-root">
    <div id="overlay" class="overlay"><div class="card start-card"><div class="start-main"><h2 id="start-card-title">Welcome to a scrap of Ur</h2><button type="button">Start exploring</button>${rows}</div></div></div>
  </div></body></html>`);
  bad.push(...await tab.evaluate(outsideFrame, ['#overlay', SAFE_T, SAFE_B]));
  await tab.setContent(`<!doctype html><html data-ui="modern" class="touch-phone phone-layout"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style><style>${frame}</style></head><body><div id="game-root">
    <div class="quest-dialogue" data-look="conversation"><div class="quest-dialogue-card"><p class="fam-head"><span>Magic Rock</span></p><button type="button" class="fam-close">Close</button><p class="quest-dialogue-copy">I have a ticket for you.</p></div></div>
  </div></body></html>`);
  bad.push(...await tab.evaluate(outsideFrame, ['.quest-dialogue', SAFE_T, SAFE_B]));
  await tab.setContent(`<!doctype html><html data-ui="modern" class="touch-phone phone-layout"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style><style>${frame}</style></head><body><div id="game-root">
    <div class="glitch-modal"><div class="glitch-modal-card"><div class="glitch-modal-head"><h2>A window</h2><button type="button">Close</button></div>${rows}</div></div>
  </div></body></html>`);
  bad.push(...await tab.evaluate(outsideFrame, ['.glitch-modal', SAFE_T, SAFE_B]));
  // #742: the Hi sign leaderboard (the clock's window online), drawn from its own CSS string.
  const hi = read('public/js/features/hi-signs-feature.js');
  const at = hi.indexOf('const BOARD_STYLE = `') + 'const BOARD_STYLE = `'.length;
  const boardCss = hi.slice(at, hi.indexOf('`;', at));
  await tab.setContent(`<!doctype html><html data-ui="modern" class="touch-phone phone-layout"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style><style>${boardCss}</style><style>${frame}</style></head><body><div id="game-root"></div>
    <section class="hi-board"><button type="button" class="hi-close">Close</button><button type="button" class="hi-calendar">Calendar</button><h2>Hi sign leaderboard</h2><p class="hi-you">You don't have a daily hi sign yet!</p><ol>${Array.from({ length: 60 }, (_, i) => `<li>Sign ${i} <b>${i}</b></li>`).join('')}</ol></section>
  </body></html>`);
  bad.push(...await tab.evaluate(outsideFrame, ['.hi-board', SAFE_T, SAFE_B]));
  await ctx.close();
  return bad;
}

/** The phone page (/play/phone/): its bar's words under the fade. */
async function phonePage(browser, ctxOpts, base) {
  const ctx = await browser.newContext(ctxOpts);
  const tab = await ctx.newPage();
  // Its own tokens (phone.css): forced the same way.
  await ctx.addInitScript(([t, b]) => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = `:root { --safe-t: ${t}px !important; --safe-b: ${b}px !important; }`;
      document.head.append(st);
    });
  }, [SAFE_T, SAFE_B]);
  await tab.goto(`${base}/play/phone/`);
  await tab.waitForSelector('.pc-top .pc-brand');
  await tab.waitForTimeout(300);
  const bad = await tab.evaluate(outsideFrame, ['.pc-top', SAFE_T, 0]);
  await ctx.close();
  return bad;
}

const LOCK_WAIT_MS = 30 * 60_000;
let server = null;

for (const engine of ['webkit', 'chromium']) {
  describe(`SAFE FRAME: an upright phone's dialogs, sheets and cards (${engine === 'webkit' ? 'WebKit, iPhone 15 Pro' : 'Chrome, 390x844'})`, { skip: !playwright && 'no playwright' }, () => {
    let br = null;
    before(async () => {
      const { openBrowser } = await import('../tools/qa/browser.mjs');
      if (!server) {
        const { startServer } = await import('../tools/qa/serve.mjs');
        server = await startServer({ root: pub });
      }
      try {
        br = await openBrowser({ label: `safe-frame test (${engine})`, waitMs: LOCK_WAIT_MS, ...(engine === 'webkit' ? { engine } : {}) });
      } catch (e) { console.error(`no ${engine}: ${e.message}`); br = null; }
    }, { timeout: LOCK_WAIT_MS + 60_000 });
    after(async () => {
      await br?.close();
      if (engine === 'chromium') await server?.stop();
    });

    it('every word and button keeps below --safe-t and above --safe-b', { timeout: 150_000 }, async (t) => {
      if (!br) { t.skip(`no ${engine}`); return; }
      const opts = engine === 'webkit'
        ? { ...playwright.devices['iPhone 15 Pro'], viewport: { width: 393, height: 852 } }
        : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA };
      const base = `http://127.0.0.1:${server.port ?? server.address().port}`;
      const game = await gameSurfaces(br.browser, opts, base);
      const drawn = await cssSurfaces(br.browser, opts);
      const page = await phonePage(br.browser, opts, base);
      assert.deepEqual([...game.bad, ...drawn, ...page], []);
      assert.deepEqual(game.errors, []);
    });
  });
}
