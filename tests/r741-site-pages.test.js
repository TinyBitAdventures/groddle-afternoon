/**
 * #741 (iPhone Home Screen app, 402x812): Support the game and "N players online. See who" opened a
 * new tab, which in a Home Screen app replaces the game with no way back; only the Encyclopedia opened
 * in the in-game sheet with "Back to the game" (#401). Austin's ruling (2026-11-27): there, every link
 * to our own site opens in that viewer. One rule (js/site-pages.js): catchSiteLinks takes every link,
 * openSitePage every page the code opens. Glitch kept the game open behind every site page
 * (TSFrontController.as 4353-4400, each in its own named window).
 *
 * The bypass guard: game code that opens a window or leaves the page itself (window.open,
 * location.href =) fails here unless it is openSitePage or a reviewed exception below; a link
 * anywhere in the game's page is caught by the one catch (the browser sweep clicks every one).
 * Run: node --test tests/r741-site-pages.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_PAGE_TEXT, openSitePage, plainLinkClick, setSitePageViewer, siteLinkTip, sitePageHref, sitePageTip, sitePageWhere } from '../public/js/site-pages.js?v=9b3049cf';
import { createEncyclopedia, encyclopediaTip } from '../public/js/encyclopedia-links.js?v=1dde87cc';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=401d994d';
import { JOB_ASK_TEXT } from '../public/js/street-job-asks.js?v=32adbe89';
import { PROFILE_PAGE_COPY, profilePageVerb } from '../public/js/profiles.js?v=1daccbb9';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('#741 the one rule (js/site-pages.js)', () => {
  const at = { base: 'https://groddleafternoon.com/', pageHref: 'https://groddleafternoon.com/play/online/' };

  it("sitePageHref: this site's pages go to the viewer; play pages, other sites and non-web addresses do not", () => {
    assert.equal(sitePageHref('contribute/', at), 'https://groddleafternoon.com/contribute/', 'Support the game (relative to the play pages\' <base>)');
    assert.equal(sitePageHref('/chat/', at), 'https://groddleafternoon.com/chat/', 'See who');
    assert.equal(sitePageHref('/chat/bugs/', at), 'https://groddleafternoon.com/chat/bugs/', 'solo Bugs');
    assert.equal(sitePageHref('/privacy-policy/', at), 'https://groddleafternoon.com/privacy-policy/');
    assert.equal(sitePageHref('https://www.groddleafternoon.com/chat/general/12/', at), 'https://groddleafternoon.com/chat/general/12/', 'the live site\'s other host is this site, at the page\'s origin');
    assert.equal(sitePageHref('https://groddleafternoon.com/chat/', { base: 'http://127.0.0.1:8966/' }), '', 'a dev copy is not the live site');
    assert.equal(sitePageHref('play/online/', at), '', 'a play page is the game itself');
    assert.equal(sitePageHref('https://groddleafternoon.com/play/', at), '');
    assert.equal(sitePageHref('https://github.com/sponsors/x', at), '', 'another site (payments) leaves the app, the game under it');
    assert.equal(sitePageHref('mailto:a@b.c', at), '');
    assert.equal(sitePageHref('blob:https://groddleafternoon.com/1-2', at), 'blob:https://groddleafternoon.com/1-2', 'a picture the game made');
    assert.equal(sitePageHref('blob:https://example.org/1-2', at), '');
  });

  it('openSitePage: the viewer when one is set, else window.open as before', () => {
    const opened = [];
    const win = { document: { baseURI: at.base }, location: { href: at.pageHref }, open: (...a) => { opened.push(a); return { tab: true }; } };
    assert.deepEqual(openSitePage('/players/7-ann/', { win }), { tab: true });
    assert.deepEqual(opened.at(-1), ['/players/7-ann/', '_blank', 'noopener'], 'no viewer (a browser tab): a new tab');
    assert.equal(openSitePage('', { name: 'encyclopedia', features: '', win }).tab, true);
    assert.deepEqual(opened.at(-1), ['', 'encyclopedia', ''], "the Encyclopedia's own window, as today");
    const shown = [];
    setSitePageViewer((url, opts) => { shown.push([url, opts.title]); return { sheet: true }; });
    try {
      assert.deepEqual(openSitePage('/players/7-ann/', { win }), { sheet: true });
      assert.deepEqual(openSitePage('', { win }), { sheet: true }, 'empty: the viewer, the page to come');
      openSitePage('https://example.org/', { win });
      assert.deepEqual(opened.at(-1), ['https://example.org/', '_blank', 'noopener'], 'another site still opens outside');
      assert.deepEqual(shown, [['https://groddleafternoon.com/players/7-ann/', ''], ['', '']]);
    } finally {
      setSitePageViewer(null);
    }
    assert.equal(plainLinkClick({ button: 0 }), true);
    assert.equal(plainLinkClick({ button: 0, metaKey: true }), false, 'a modified click keeps its own tab');
  });

  it('the words say what really happens: over the game in the Home Screen app, a new tab in a browser tab', () => {
    const win = { document: { baseURI: at.base }, location: { href: at.pageHref } };
    assert.equal(siteLinkTip('Support the game', 'https://groddleafternoon.com/contribute/', win), 'Support the game, opens in a new tab', 'no viewer');
    setSitePageViewer(() => null);
    try {
      assert.equal(siteLinkTip('Support the game', 'https://groddleafternoon.com/contribute/', win), 'Support the game, opens over the game');
      assert.equal(siteLinkTip('Donate', 'https://github.com/sponsors/x', win), 'Donate, opens in a new tab', 'another site still opens outside');
    } finally {
      setSitePageViewer(null);
    }
    // The pages' own markup is a browser tab's (the game rewrites it once the viewer is set).
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      assert.match(read(page), new RegExp(`id="support-btn"[^>]*title="Support the game, ${SITE_PAGE_TEXT.tab}"`), page);
    }
    assert.match(read('public/game.js'), /support\.title = siteLinkTip\('Support the game', support\.href\)/);
    const lb = read('public/js/ui/picture-lightbox.js');
    assert.match(lb, /opensOverGame\(src, win\) \? T\.overGame : T\.newTab/);
    assert.match(lb, /overGame: 'Open over the game'/);
  });

  it('the Encyclopedia, its links, the hotkey sheet, a job ask\'s Where to get it and the profile row say where they open too', async () => {
    const encyNote = () => hotkeySections().flatMap((sec) => sec.rows || []).find((r) => r[0] === 'Encyclopedia')?.[2];
    const ency = createEncyclopedia({ fetchJson: async () => ({ entries: [{ s: 'skills', id: 'x', n: 'X', h: 'encyclopedia/skills/x/' }] }), resolve: (h) => `https://groddleafternoon.com/${h}` });
    await ency.load();
    const encyLinkTitle = () => /title="([^"]*)"/.exec(ency.linkMarkup({ section: 'skills', id: 'x' }))?.[1];
    const words = () => ({
      tip: encyclopediaTip(),
      link: encyLinkTitle(),
      hotkey: encyNote(),
      ask: JOB_ASK_TEXT.getItTip(sitePageWhere('encyclopedia/items/cherry/')),
      profile: profilePageVerb('Ann', 'public').tooltip,
    });
    const saved = globalThis.window;
    globalThis.window = { document: { baseURI: 'https://groddleafternoon.com/' }, location: { href: 'https://groddleafternoon.com/play/' } };
    try {
      assert.deepEqual(words(), {
        tip: 'Opens in a new tab',
        link: 'Opens in a new tab',
        hotkey: '(Opens in a new tab, on what you are looking at)',
        ask: 'Opens its Encyclopedia page in a new tab',
        profile: 'View more information about this person: their page on the Groddle site, in a new tab.',
      }, 'a browser tab');
      setSitePageViewer(() => null);
      assert.deepEqual(words(), {
        tip: 'Opens over the game',
        link: 'Opens over the game',
        hotkey: '(Opens over the game, on what you are looking at)',
        ask: 'Opens its Encyclopedia page over the game',
        profile: 'View more information about this person: their page on the Groddle site, over the game.',
      }, 'the Home Screen app');
      assert.equal(sitePageTip('https://example.org/'), 'Opens in a new tab', 'another site');
      assert.equal(PROFILE_PAGE_COPY.tooltip(), 'View more information about this person: their page on the Groddle site, in a new tab.');
    } finally {
      setSitePageViewer(null);
      globalThis.window = saved;
    }
    assert.match(read('public/js/encyclopedia-links.js'), /a\.title = encyclopediaTip\(href\);/);
    assert.match(read('public/js/encyclopedia-links.js'), /title="\$\{attr\(encyclopediaTip\(href\)\)\}"/);
    assert.match(read('public/game.js'), /ency\.title = siteLinkTip\('Encyclopedia \(I\)', 'encyclopedia\/'\)/);
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      assert.match(read(page), new RegExp(`id="encyclopedia-btn"[^>]*title="Encyclopedia \\(I\\), ${SITE_PAGE_TEXT.tab}"`), page);
    }
  });

  it('game.js sets the viewer and the catch only in a Home Screen app', () => {
    const game = read('public/game.js');
    assert.match(game, /const sitePageSheet = isHomeScreenApp\(window\) \? createEncyclopediaSheet\(/);
    assert.match(game, /if \(sitePageSheet\) \{\n\s*setSitePageViewer\(\(url, opts\) => sitePageSheet\.open\(url, opts\)\);\n\s*catchSiteLinks\(window\);\n/);
    assert.match(read('public/js/encyclopedia-links.js'), /openWindow = \(url, name\) => openSitePage\(url, \{ name, features: '' \}\)/);
  });
});

/** In-game code: the game and every module it can load (not the level builder's or the phone page's own). */
function gameFiles() {
  const out = ['public/game.js'];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (!['vendor', 'builder', 'phone'].includes(f)) walk(p);
      } else if (f.endsWith('.js')) out.push(relative(ROOT, p));
    }
  };
  walk(join(PUB, 'js'));
  return out;
}

/**
 * The reviewed places game code opens a window or moves its own page. Each says why it is not a page
 * of this site the game should keep: a new one fails until it goes through openSitePage or is added here.
 */
const ALLOWED = [
  ['public/js/site-pages.js', /win\?\.open\?\.\(url, name/, 'the opener itself'],
  ['public/js/ui/encyclopedia-sheet.js', /else if \(plan === 'out'\) win\?\.open\?\.\(href, '_blank', 'noopener'\)/, 'a link in the viewer to another site (sheetLinkPlan out)'],
  ['public/js/character-switcher.js', /win\.location\.href = to\.href/, 'another character: a play page'],
  ['public/js/classic/classic-panes.js', /win\.location\.assign\('play\/online\/'\)/, 'the online game'],
  ['public/js/features/account-backup-feature.js', /location\.href = (?:multiplayerEntryUrl\(document\.baseURI\)|account\.urls\.online)/, 'the online game'],
];

describe('#741 nothing in the game bypasses the one rule', () => {
  const OPEN = /\b(?:window|globalThis|win|self|top|parent)\??\.open\??\.?\(/;
  const LEAVE = /\b(?:location\.(?:assign|replace)\(|location\.href\s*=(?!=)|(?:window|globalThis|win|self|top|document)\.location\s*=(?!=))/;

  it('no window.open or leaving the page outside openSitePage and the reviewed exceptions', () => {
    const bad = [];
    for (const f of gameFiles()) {
      const lines = read(f).split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/^\s*\*/.test(line) || /^\s*\/\*\*/.test(line)) return;
        if (!OPEN.test(code) && !LEAVE.test(code)) return;
        // The viewer's own frame (contentWindow.location.replace) is the viewer.
        if (/contentWindow\??\.location|frame\.contentWindow|w\.location\.href = url/.test(code) && /encyclopedia-(?:sheet|links)\.js$/.test(f)) return;
        if (ALLOWED.some(([file, re]) => file === f && re && re.test(code))) return;
        bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, [], 'open the page with openSitePage (js/site-pages.js), or add a reviewed exception');
  });

  it('no game words say "new tab" except through js/site-pages.js (and the lightbox\'s pair, chosen by opensOverGame)', () => {
    const bad = [];
    for (const f of gameFiles()) {
      if (f === 'public/js/site-pages.js') continue;
      read(f).split('\n').forEach((line, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
        const code = line.replace(/\/\/.*$/, '');
        if (!/new tab/i.test(code)) return;
        if (f === 'public/js/ui/picture-lightbox.js' && /newTab: 'Open in a new tab'/.test(code)) return;
        bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(bad, [], 'say where a page opens with sitePageWhere, sitePageTip or siteLinkTip (js/site-pages.js)');
  });

  it('only the picture lightbox opts a link out of the catch (it opens the picture over the game)', () => {
    const users = gameFiles().filter((f) => /data-opens-here|OPENS_HERE_ATTR/.test(read(f)));
    assert.deepEqual(users.sort(), ['public/js/site-pages.js', 'public/js/ui/picture-lightbox.js']);
  });
});

/** The lightbox's address as the game imports it (with its module key). */
const LIGHTBOX_URL = `/js/ui/${/picture-lightbox\.js\?v=[0-9a-f]{8}/.exec(read('public/js/ui/reports-sheet.js'))[0]}`;

let wk = null;
try { await import('../tools/qa/playwright-env.mjs'); wk = await import('playwright'); } catch { /* no Playwright */ }

describe('#741 an iPhone Home Screen app, 402x812 (WebKit)', { skip: !wk && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  let br = null;
  let server = null;
  let base = '';
  before(async () => {
    const { startServer } = await import('../tools/qa/serve.mjs');
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    server = await startServer({ root: PUB, port: 0 });
    base = `http://127.0.0.1:${server.port ?? server.address().port}`;
    br = await openBrowser({ engine: 'webkit', label: 'r741 site pages test', waitMs: LOCK_WAIT_MS });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  after(async () => { await br?.close(); await server?.stop?.(); });

  const ctxOpts = () => ({ ...wk.devices['iPhone 15 Pro'], viewport: { width: 402, height: 812 } });
  async function game(query) {
    const ctx = await br.browser.newContext(ctxOpts());
    // The play page's device choice made (the QA device), as the #741 trace does.
    await ctx.addInitScript(() => { try { localStorage.setItem('groddle-play-device', 'qa-game'); } catch { /* none */ } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(String(e?.message || e)));
    tab.errors = errors;
    await tab.goto(`${base}/play/?autostart=1&fresh=1&resetgame=1&questoffer=off&hstip=0${query}`);
    try {
      await tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 45_000 });
    } catch (err) {
      await ctx.close();
      throw new Error(`the game did not start: ${err.message}; page errors: ${JSON.stringify(errors)}`);
    }
    const popups = [];
    ctx.on('page', (p) => popups.push(p.url()));
    return { ctx, tab, popups };
  }
  /** Clicks the link `sel` (built first by `make`, as the game builds it) and says where it went. */
  const press = (tab, sel) => tab.evaluate(async (s) => {
    const a = document.querySelector(s);
    if (!a) return { missing: s };
    a.click();
    await new Promise((r) => setTimeout(r, 300));
    const sheet = document.getElementById('ency-sheet');
    const open = Boolean(sheet && !sheet.hidden);
    let at = '';
    try { at = sheet?.querySelector('iframe')?.contentWindow?.location.href || ''; } catch { at = '?'; }
    const title = sheet?.querySelector('.ency-sheet-close')?.textContent || '';
    sheet?.querySelector('[data-ency-sheet-close]')?.click();
    return { open, at, close: title, href: a.href };
  }, sel);

  it('Support the game, See who, a notice, a chat link home, the privacy policy and a picture tab open in the viewer, with Back to the game; and the sweep: every link to the site in the game page does', { timeout: 180_000 }, async () => {
    const { ctx, tab, popups } = await game('&homescreen=1');
    // The links as the game draws them (each module's own markup, loaded in the page).
    await tab.evaluate(async () => {
      const root = document.getElementById('game-root');
      const { communityNoticeHtml } = await import('/js/community-notices.js');
      const { appendLinkedText } = await import('/js/chat-links.js');
      const note = document.createElement('p');
      note.innerHTML = communityNoticeHtml({ id: 1, text: 'A new post', url: '/chat/general/12-a-post/' });
      note.querySelector('a').id = 't-notice';
      const line = document.createElement('p');
      appendLinkedText(line, `see ${location.origin}/changelog/ now`, { homeHosts: [location.hostname] });
      line.querySelector('a').id = 't-chat';
      const mk = (id, attrs) => Object.assign(document.createElement('a'), { id, ...attrs });
      // social-drawer.js 1193 (See who), account-forms.js 474 (privacy), picture-lightbox.js 157 (its tab).
      const who = mk('t-who', { className: 'chat-link', href: '/chat/', target: '_blank', rel: 'noopener', textContent: 'See who' });
      who.dataset.chatLink = 'home';
      const privacy = mk('t-privacy', { href: '/privacy-policy/', target: '_blank', rel: 'noopener', textContent: 'Privacy' });
      const pic = mk('t-pic', { className: 'picture-lightbox-tab', href: '/assets/ui/bug_icon.webp', target: '_blank', rel: 'noopener', textContent: 'Open in a new tab' });
      root.append(note, line, who, privacy, pic);
    });
    const words = await tab.evaluate(async (lightbox) => {
      // The lightbox as the game loads it (its own key, so it shares the game's js/site-pages.js and its viewer).
      const { openLightbox } = await import(lightbox);
      const box = openLightbox({ src: '/assets/ui/bug_icon.webp', host: document.body });
      const tabWords = document.querySelector('[data-picture-lightbox-tab]')?.textContent || '';
      box?.close?.({ focus: false });
      return { support: document.getElementById('support-btn').title, ency: document.getElementById('encyclopedia-btn').title, tab: tabWords };
    }, LIGHTBOX_URL);
    assert.deepEqual(words, { support: 'Support the game, opens over the game', ency: 'Encyclopedia (I), opens over the game', tab: 'Open over the game' }, 'the words say it opens over the game');
    const results = {};
    for (const [k, sel] of [['encyclopedia', '#encyclopedia-btn'], ['support', '#support-btn'], ['seeWho', '#t-who'], ['notice', '#t-notice'], ['chat', '#t-chat'], ['privacy', '#t-privacy'], ['picture', '#t-pic']]) results[k] = await press(tab, sel);
    const r = await tab.evaluate(async () => {
      const { sitePageHref } = await import('/js/site-pages.js');
      const links = [...document.querySelectorAll('a[href]')].filter((a) => !a.closest('#ency-sheet') && !a.hasAttribute('download') && !a.closest('[data-opens-here]') && !a.getAttribute('href').startsWith('#') && sitePageHref(a.href, { base: document.baseURI, pageHref: location.href }));
      const out = [];
      for (const a of links) {
        a.click();
        await new Promise((res) => setTimeout(res, 120));
        const sheet = document.getElementById('ency-sheet');
        out.push({ href: a.getAttribute('href'), id: a.id, open: Boolean(sheet && !sheet.hidden) });
        sheet?.querySelector('[data-ency-sheet-close]')?.click();
      }
      return { left: location.pathname, out };
    });
    await ctx.close();
    for (const [k, r] of Object.entries(results)) {
      assert.equal(r.missing, undefined, `${k}: ${r.missing} is there`);
      assert.equal(r.open, true, `${k} opens in the viewer (${JSON.stringify(r)})`);
      assert.equal(r.close, 'Back to the game', k);
      if (k !== 'encyclopedia') assert.equal(r.at, r.href, `${k}: the viewer shows its page`);
    }
    assert.match(results.support.at, /\/contribute\/$/);
    assert.deepEqual(popups, [], 'no new window: the game stays');
    assert.ok(r.out.some((l) => l.id === 'support-btn'), 'the sweep reaches the Menu');
    assert.ok(r.out.length >= 3, `links swept: ${r.out.length}`);
    assert.deepEqual(r.out.filter((l) => !l.open), [], 'every one opens in the viewer');
    assert.equal(r.left, '/play/', 'the game page never left');
  });

  it('outside a Home Screen app Support the game keeps its new tab (no viewer)', { timeout: 120_000 }, async () => {
    const { ctx, tab, popups } = await game('');
    const words = await tab.evaluate(async (lightbox) => {
      const { openLightbox } = await import(lightbox);
      const box = openLightbox({ src: '/assets/ui/bug_icon.webp', host: document.body });
      const tabWords = document.querySelector('[data-picture-lightbox-tab]')?.textContent || '';
      box?.close?.({ focus: false });
      return { support: document.getElementById('support-btn').title, ency: document.getElementById('encyclopedia-btn').title, tab: tabWords };
    }, LIGHTBOX_URL);
    assert.deepEqual(words, { support: 'Support the game, opens in a new tab', ency: 'Encyclopedia (I), opens in a new tab', tab: 'Open in a new tab' }, 'a browser tab keeps its words');
    const r = await press(tab, '#support-btn');
    await tab.waitForTimeout(500);
    await ctx.close();
    assert.equal(r.open, false);
    assert.equal(popups.length, 1, 'a new tab, as before');
  });
});
