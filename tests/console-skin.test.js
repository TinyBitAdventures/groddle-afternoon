/**
 * The administrators' Console link and the console in the chat app's look (Austin 2026-11-09: "can we add
 * the /console/ link or maybe icon for administrators? Also I think the /console/ page would look better if
 * it was skinned the same way the /community/ page is with its expanded header and re-colored chrome").
 *
 * - The link: site/theme.js adds it beside the theme button only after GET /console/me says the reader is an
 *   administrator, and asks only in a browser that has been one (a hint in localStorage, or the Minn bar, which
 *   Minn draws only for a signed-in editor). No page's HTML carries it, bar the console's own (served only to an
 *   administrator, uncached), so a built or cached page can never show it to a visitor.
 * - The console: SiteNav::nav with the app layout (the bell, the Console link as the page being read), the
 *   chat app's palette and header from community/community.css, a rail of the tabs and a pane, with every id,
 *   data hook, tab and #hash route kept.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const site = (p) => readFileSync(sitePath(p), 'utf8');
const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const noCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A small element: enough of the DOM for theme.js's Console link part. */
function element(tag) {
  const el = {
    tagName: tag.toUpperCase(), className: '', href: '', title: '', textContent: '', attrs: {}, children: [], before: null,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    append(...kids) { this.children.push(...kids); },
  };
  return el;
}

/**
 * Runs public/site/theme.js against a page: `nav` is one header (its theme button and, on the console, its own
 * link), `stored` the localStorage, `answer` what /console/me says (an object, or 'throw').
 */
async function runTheme({ stored = {}, answer = { admin: false }, minnBar = false, drawn = false, path = '/' } = {}) {
  const store = new Map(Object.entries(stored));
  const inserted = [];
  const theme = element('button');
  theme.before = (node) => inserted.push(node);
  const nav = {
    querySelector(sel) {
      if (sel === '.site-nav-theme') return theme;
      if (sel === '.site-nav-console') return drawn || inserted.length ? {} : null;
      return null;
    },
  };
  const calls = [];
  const noop = () => {};
  const document = {
    readyState: 'complete',
    documentElement: { setAttribute: noop, removeAttribute: noop },
    body: { append: noop },
    querySelectorAll: (sel) => (sel === '.site-nav' ? [nav] : []),
    querySelector: (sel) => (sel === '.site-nav .site-nav-console' && drawn ? {} : null),
    getElementById: (id) => (id === 'minn-bar' && minnBar ? {} : null),
    createElement: element,
    addEventListener: noop,
  };
  const context = {
    document,
    location: { pathname: path },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop,
    innerWidth: 1280,
    setTimeout, clearTimeout,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      if (answer === 'throw') throw new Error('offline');
      return { ok: true, json: async () => answer };
    },
  };
  context.window = context;
  vm.runInNewContext(read('public/site/theme.js'), context);
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
  return { calls, inserted, store };
}

describe('the Console link (site/theme.js)', () => {
  it('a visitor\'s browser never asks and never gets it', async () => {
    const { calls, inserted, store } = await runTheme();
    assert.equal(calls.length, 0, 'no hint and no Minn bar: no request at all');
    assert.equal(inserted.length, 0);
    assert.equal(store.has('groddle-console'), false);
  });

  it('an administrator\'s browser asks /console/me, uncached, and only a yes adds the link before the theme button', async () => {
    const { calls, inserted, store } = await runTheme({ stored: { 'groddle-console': '1' }, answer: { admin: true } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/console/me');
    assert.equal(calls[0].opts.cache, 'no-store');
    assert.equal(calls[0].opts.credentials, 'same-origin');
    assert.equal(inserted.length, 1);
    const [a] = inserted;
    assert.equal(a.className, 'site-nav-console');
    assert.equal(a.href, '/console/');
    assert.equal(a.title, 'Console', 'the tooltip');
    assert.equal(a.children[0].className, 'site-nav-console-word');
    assert.equal(a.children[0].textContent, 'Console', 'its name for a screen reader');
    assert.equal(a.attrs['aria-current'], undefined, 'not the page being read on /');
    assert.equal(store.get('groddle-console'), '1');
  });

  it('a no (signed out, or no longer an administrator) adds nothing and clears the hint', async () => {
    const { calls, inserted, store } = await runTheme({ stored: { 'groddle-console': '1' }, answer: { admin: false } });
    assert.equal(calls.length, 1);
    assert.equal(inserted.length, 0);
    assert.equal(store.has('groddle-console'), false, 'the next page asks nothing');
    const odd = await runTheme({ stored: { 'groddle-console': '1' }, answer: { admin: 'yes' } });
    assert.equal(odd.inserted.length, 0, 'only a true admin');
  });

  it('the Minn bar (a signed-in editor) is reason to ask; an error asks again next time', async () => {
    const bar = await runTheme({ minnBar: true, answer: { admin: true } });
    assert.equal(bar.calls.length, 1);
    assert.equal(bar.inserted.length, 1);
    assert.equal(bar.store.get('groddle-console'), '1');
    const down = await runTheme({ stored: { 'groddle-console': '1' }, answer: 'throw' });
    assert.equal(down.inserted.length, 0);
    assert.equal(down.store.get('groddle-console'), '1');
  });

  it('on the console its own link stands: no request, and the hint is set for the other pages', async () => {
    const { calls, inserted, store } = await runTheme({ drawn: true, path: '/console/' });
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
    assert.equal(store.get('groddle-console'), '1');
  });

  it('no built page carries the link in its HTML', () => {
    const pages = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) pages.push(p);
      }
    };
    walk(join(root, 'public'));
    assert.ok(pages.length > 20);
    for (const p of pages) assert.ok(!readFileSync(p, 'utf8').includes('site-nav-console'), p);
    assert.doesNotMatch(read('tools/site-nav/apply.mjs'), /site-nav-console/, 'the sync never writes it either');
  });

  it('is styled in site-nav.css: the theme button\'s round shape, its word hidden, a pill on the console', () => {
    const css = noCss(read('public/site/site-nav.css'));
    assert.match(css, /\.site-nav-console \{[^}]*height: 36px;[^}]*border-radius: 999px;/);
    assert.match(css, /\.site-nav-console-word \{ position: absolute; width: 1px; height: 1px; overflow: hidden;/);
    assert.match(css, /\.site-nav-console\[aria-current="page"\] \{[^}]*background: var\(--cx-soft, color-mix\(in srgb, var\(--accent\) 18%, transparent\)\);/);
    assert.match(css, /\.site-nav-console\[aria-current="page"\] \.site-nav-console-word \{ position: static;/);
  });
});

describe('the site draws it only on the console (groddle-afternoon-site src/SiteNav.php, AdminConsolePage.php)', { skip: skipWithoutSite }, () => {
  it('SiteNav::nav draws it only when asked, as the page being read, between the bell and the theme button', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    const fixtures = join(root, 'tests/fixtures/site-nav');
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(fixtures, 'site-nav.php'), engine, sitePath(''), join(fixtures, 'header-menu.html'), '/', '/console/'], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    for (const kind of ['nav', 'app', 'appOut']) for (const path of ['/', '/console/']) assert.ok(!out[kind][path].includes('site-nav-console'), `${kind} ${path}`);
    const html = out.console['/console/'];
    assert.match(html, /^<nav class="site-nav site-nav-app"/);
    assert.equal((html.match(/site-nav-console"/g) || []).length, 1);
    assert.ok(html.includes('<a class="site-nav-console" href="/console/" title="Console" aria-current="page"><span class="site-nav-console-word">Console</span></a>'));
    assert.ok(html.indexOf('site-nav-bell') < html.indexOf('site-nav-console') && html.indexOf('site-nav-console') < html.indexOf('site-nav-theme'));
  });

  it('GET /console/me answers for the reader: manage_options, never cached, a JSON yes or no', () => {
    const page = site('src/AdminConsolePage.php');
    assert.match(page, /#\[Route\(Method::Get, self::PATH \. 'me', policy: new Policy\(Access::Public\)\)\]\n\s*public function me\(Request \$request\): Response/);
    const me = page.slice(page.indexOf('public function me('), page.indexOf('private function isAdmin('));
    assert.match(me, /Response::json\(\['admin' => \$this->isAdmin\(\)\]\)/);
    assert.match(me, /'Cache-Control', 'no-store, private, max-age=0'/);
    assert.match(me, /'Vary', 'Cookie'/);
    assert.match(page, /return \$user !== null && Capabilities::fromDb\(\$this->minn->db\)->can\(\$user->id, 'manage_options'\);/);
    assert.match(site('src/SiteNav.php'), /public const CONSOLE = '\/console\/';/);
    assert.match(page, /public const PATH = '\/console\/';/);
  });

  it('the console wears the chat app\'s header and stylesheet, then its own', () => {
    const page = site('src/AdminConsolePage.php');
    assert.match(page, /SiteNav::nav\(SiteNav::links\(\$this->minn, 0\), \$path, \$badges, \['bell' => \$badges\[SiteNav::COMMUNITY\] \?\? 0, 'console' => true\]\)/);
    const community = page.indexOf('CommunityPages::ASSETS . "community.css?v=" . CommunityPages::ASSET_KEY');
    assert.ok(community > 0 && community < page.indexOf('console.css?v={$v}'), 'community.css first, console.css over it');
    assert.match(page, /data-community-v="' \. Html::attr\(CommunityPages::ASSET_KEY\) \. '"/, 'console.js loads the bell\'s panel at the same key');
    assert.match(page, /<body class=\\"notes console-page\\">/);
  });

  it('keeps every tab, panel, id and hook: the tabs are the rail\'s rows, the panels scroll in the pane', () => {
    const page = site('src/AdminConsolePage.php');
    const rail = page.slice(page.indexOf('<nav class="console-rail"'), page.indexOf('</nav>', page.indexOf('<nav class="console-rail"')));
    assert.match(rail, /<div class="console-tabs" role="tablist" aria-labelledby="console-rail-title" aria-orientation="vertical" data-console-tabs>/);
    for (const id of ['players', 'reports', 'chat', 'credits', 'boards', 'community']) {
      assert.match(rail, new RegExp(`<button type="button" role="tab" id="console-tab-${id}" aria-controls="console-${id}" aria-selected="(true|false)"[^>]* data-console-tab="${id}">`), id);
      assert.match(page, new RegExp(`id="console-${id}" role="tabpanel" aria-labelledby="console-tab-${id}" data-console-tabpanel="${id}"`), id);
    }
    assert.match(page, /data-console-tab=\\"builder\\"/);
    assert.match(page, /id="console-builder" role="tabpanel" aria-labelledby="console-tab-builder" data-console-tabpanel="builder"/);
    const pane = page.slice(page.indexOf('<div class="console-pane">'));
    assert.match(pane, /^<div class="console-pane">\n  <header class="console-head">[\s\S]*?<h1>Console<\/h1>[\s\S]*?<p class="console-server" data-console-server role="status" aria-live="polite">Connecting<\/p>\n  <\/header>\n  <div class="console-body">\n  <p class="console-note" data-console-note/);
    assert.ok(pane.indexOf('<div class="console-body">') < pane.indexOf('data-console-tabpanel="players"'));
    assert.match(page, /\. "\\n  <\/div>\\n <\/div>\\n<\/main>\\n<\/body>\\n<\/html>\\n";/, 'the body and the pane close after every panel, the builder\'s too');
    for (const hook of ['data-console-count', 'data-console-online', 'data-console-rooks', 'data-console-broadcast', 'data-console-log', 'data-console-search', 'data-console-bans', 'data-console-tickets', 'data-console-thread', 'data-console-chat-form', 'data-console-credits', 'data-console-boards', 'data-console-community']) assert.ok(page.includes(hook), hook);
  });

  it('console.js: either arrow pair moves along the rail, a menu closes with the pane\'s scroll, and the header is wired as /chat/\'s', () => {
    const js = site('console/console.js');
    assert.match(js, /const to = \{ ArrowDown: at \+ 1, ArrowUp: at - 1, ArrowRight: at \+ 1, ArrowLeft: at - 1, Home: 0, End: tabs\.length - 1 \}\[e\.key\];/);
    assert.match(js, /root\.querySelector\('\.console-body'\)\?\.addEventListener\('scroll', \(\) => closeMenu\(false\), \{ passive: true \}\);/);
    assert.match(js, /export function wireAppHeader\(api = createApi\(\)\)/);
    assert.match(js, /appNav\.dataset\.menu = on \? 'open' : 'closed';/, 'the phone menu (community.css data-menu)');
    assert.match(js, /import\(`\/wp-content\/themes\/groddle\/community\/notifications\.js\?v=\$\{encodeURIComponent\(v\)\}`\)\s*\.then\(\(m\) => m\.startNotifications\(\{ call \}\)\)/);
    // notifications.js speaks community.js's call: an answer object, never a throw.
    assert.match(js, /return \{ ok: true, status: 200, data: await api\.call\(path, opts\) \};/);
    assert.match(js, /const start = \(\) => \{ boot\(\); wireAppHeader\(\); \};/);
  });

  it('the stylesheets: the chat app\'s tokens and header surface name the console; console.css is its frame and surfaces', () => {
    const community = noCss(site('community/community.css'));
    assert.match(community, /\n\.community-page, \.console-page, \.cx \{\n  --bg:/);
    assert.match(community, /\n:root\[data-theme="dark"\] \.community-page, :root\[data-theme="dark"\] \.console-page, :root\[data-theme="dark"\] \.cx \{/);
    assert.match(community, /\n\.console-page \.site-nav\.site-nav-app, \.community-page \.site-nav\.site-nav-app \{[^}]*background: var\(--surface\);/);
    const css = noCss(site('console/console.css'));
    const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
    assert.match(rule('html:has(> body.console-page)'), /overflow: hidden;/);
    assert.match(rule('body.console-page'), /display: flex; flex-direction: column; height: 100vh; height: 100dvh;/);
    assert.match(rule('.console'), /grid-template-columns: var\(--cx-rail-w\) minmax\(0, 1fr\);/);
    assert.match(rule('.console'), /min-height: 0;/);
    assert.match(rule('.console-tabs'), /overflow-y: auto;/);
    assert.match(rule('.console-body'), /overflow-y: auto;/);
    assert.match(rule('.console .console-tabs [role="tab"][aria-selected="true"]'), /background: var\(--cx-soft\); box-shadow: inset 3px 0 0 var\(--accent\);/, 'the chat rail\'s selected row');
    assert.match(css, /\.console-panel-head, \.console-panel > h2:first-child \{[^}]*background: var\(--cx-parchment\);/);
    assert.match(css, /\.console button \{[^}]*border-radius: 999px;/);
    assert.match(css, /\.console \.console-primary \{ background: var\(--play-bg\); color: var\(--play-fg\);/);
    assert.match(css, /@media \(max-width: 720px\) \{[^@]*body\.console-page \{ display: block; height: auto; overflow: visible; \}/, 'a phone scrolls the page');
    // Every tab of today has its own icon; one added later gets the dots.
    for (const id of ['players', 'reports', 'chat', 'credits', 'boards', 'community', 'builder']) assert.match(css, new RegExp(`\\.console-tabs \\[data-console-tab="${id}"\\] \\{ --tab-hue: var\\(--cx-hue-\\d\\); --tab-glyph:`), id);
    assert.match(css, /background: var\(--tab-glyph, url\(/);
  });
});
