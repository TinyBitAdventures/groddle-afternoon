import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { servedByMinn } from './minn-served.js';

const pub = join(import.meta.dirname, '..', 'public');
const PAGES = [
  { file: 'index.html', prefix: '', current: 'home' },
  { file: 'restoration/index.html', prefix: '../', current: 'restoration' },
  { file: 'compare/index.html', prefix: '../', current: 'compare' },
];

const navOf = (html) => html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)?.[0] || '';
// The same header once the page's own path prefix and current-page marker are taken out.
const normal = (nav, prefix) => nav
  .replace(/ aria-current="page"/g, '')
  .replaceAll(`href="${prefix || './'}"`, 'href="HOME"')
  .replaceAll(`href="${prefix || './'}#`, 'href="HOME#')
  .replaceAll(`="${prefix}`, '="');

describe('shared site header', () => {
  const navs = PAGES.map((p) => ({ ...p, html: readFileSync(join(pub, p.file), 'utf8') }))
    .map((p) => ({ ...p, nav: navOf(p.html) }));

  it('appears on the home page, the restoration report and the compare page', () => {
    for (const p of navs) {
      assert.ok(p.nav, p.file);
      assert.match(p.html, new RegExp(`<link rel="stylesheet" href="${p.prefix}site/site-nav\\.css" />`), p.file);
      assert.ok(p.html.indexOf('<nav class="site-nav"') < p.html.indexOf('<header') || !p.html.includes('<header class="masthead"'), p.file);
    }
  });

  it('is the same markup on every page', () => {
    const [first, ...rest] = navs.map((p) => normal(p.nav, p.prefix));
    for (const [i, other] of rest.entries()) assert.equal(other, first, navs[i + 1].file);
  });

  it('marks the current page and links resolve', () => {
    for (const p of navs) {
      assert.equal((p.nav.match(/aria-current="page"/g) || []).length, 1, p.file);
      const current = p.current === 'home' ? /class="wordmark"[^>]*aria-current/ : new RegExp(`href="\\.\\./${p.current}/" aria-current="page"`);
      assert.match(p.nav, current, p.file);
      for (const [, ref] of p.nav.matchAll(/(?:href|src)="([^"#?]*)/g)) {
        if (!ref || servedByMinn(ref)) continue;
        const target = resolve(pub, p.file, '..', ref);
        assert.ok(existsSync(ref.endsWith('/') ? join(target, 'index.html') : target), `${p.file}: ${ref}`);
      }
    }
  });
});

describe('site colour theme', () => {
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) walk(path);
      else if (name.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        if (html.includes('<nav class="site-nav"')) pages.push({ file: relative(pub, path), html });
      }
    }
  };
  walk(pub);

  it('every page with the site header loads site/theme.js in its head and has the theme button', () => {
    assert.ok(pages.length > 1000, `only ${pages.length} pages carry the header`);
    for (const { file, html } of pages) {
      const head = html.slice(0, html.indexOf('</head>'));
      const prefix = '../'.repeat(file.split('/').length - 1);
      assert.ok(head.includes(`<script src="${prefix}site/theme.js"></script>`), `${file}: no theme script in <head>`);
      // Outside site-nav-links, which tools/site-nav/apply.mjs rewrites from the Minn menu.
      assert.match(html, /<\/div>\n\s*<button class="site-nav-theme" type="button" aria-label="Colour theme"><\/button>\n\s*<\/div>\n\s*<\/nav>/, file);
    }
  });

  it('the Minn theme draws the same button and loads the script', { skip: skipWithoutSite }, () => {
    assert.ok(readFileSync(sitePath('src', 'SiteNav.php'), 'utf8').includes('<button class="site-nav-theme" type="button" aria-label="Colour theme"></button>'));
    assert.ok(readFileSync(sitePath('src', 'Extension.php'), 'utf8').includes('<script src="/site/theme.js"></script>'));
  });

  it('keeps one site-wide choice (light, dark, system) and reads the old compare-page setting', () => {
    const js = readFileSync(join(pub, 'site', 'theme.js'), 'utf8');
    assert.match(js, /const KEY = 'groddle-theme';/);
    assert.match(js, /const OLD_KEY = 'groddle-compare-theme';/);
    assert.match(js, /const MODES = \['light', 'dark', 'system'\];/);
    assert.match(js, /addEventListener\('contextmenu'/);
    assert.ok(!readFileSync(join(pub, 'compare', 'compare.js'), 'utf8').includes('groddle-compare-theme'), 'compare.js keeps no theme of its own');
  });

  it('opens the header submenus: hover with a mouse, the toggle, Escape back to the toggle, outside click and Tab out close', () => {
    const js = readFileSync(join(pub, 'site', 'theme.js'), 'utf8');
    const subs = js.slice(js.indexOf("// The header's submenus."));
    assert.ok(subs.length > 1000, 'the submenu block follows the theme block');
    assert.match(subs, /document\.querySelectorAll\('\.site-nav-sub'\)/);
    assert.match(subs, /document\.getElementById\(toggle\.getAttribute\('aria-controls'\)\)/);
    assert.match(subs, /addEventListener\('pointerenter', \(e\) => \{\n\s*if \(e\.pointerType !== 'mouse'/, 'hover opens for a mouse only');
    assert.match(subs, /toggle\.addEventListener\('click'/);
    assert.match(subs, /sub\.panel\.hidden = false;\n\s*sub\.toggle\.setAttribute\('aria-expanded', 'true'\);/);
    assert.match(subs, /sub\.panel\.hidden = true;\n\s*sub\.toggle\.setAttribute\('aria-expanded', 'false'\);\n\s*if \(focusToggle\) sub\.toggle\.focus\(\);/);
    assert.match(subs, /e\.key === 'Escape' && !panel\.hidden[\s\S]*?close\(sub, true\)/, 'Escape returns focus to the toggle');
    assert.match(subs, /addEventListener\('focusout'/, 'Tab out closes');
    assert.match(subs, /document\.addEventListener\('pointerdown', \(e\) => \{\n\s*for \(const sub of subs\) if \(!sub\.panel\.hidden && !sub\.el\.contains\(e\.target\)\) close/, 'a click outside closes');
    assert.match(subs, /setProperty\('--site-nav-panel-left'/, 'wide, the panel sits under its link');
  });

  it('hangs the submenu panel from the header row, so the links\' sideways scroll never clips it', () => {
    const css = readFileSync(join(pub, 'site', 'site-nav.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(css, /\.site-nav-row \{ position: relative; \}/);
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/\.site-nav-(links|sub)\b(?![-\w])/.test(selector.split(',').map((x) => x.trim().split(/\s+/).at(-1)).join(' '))) {
        assert.doesNotMatch(body, /position:/, `${selector.trim()} must stay unpositioned`);
      }
    }
    assert.match(css, /\.site-nav-panel \{\n\s*position: absolute; z-index: 30;[^}]*left: var\(--site-nav-panel-left, 0\)/);
    assert.match(css, /\.site-nav-panel\[hidden\] \{ display: none; \}/);
    assert.match(css, /:root\[data-theme-mode\] \.site-nav-toggle \{/, 'the toggle shows only once theme.js runs');
    assert.match(css, /@media \(max-width: 640px\) \{\n\s*\.site-nav-panel \{\n\s*top: calc\(100% \+ 1px\); left: 0; right: 0;/, 'narrow, it spans the row');
    assert.match(css, /prefers-reduced-motion[^\n]*\.site-nav-toggle::before/);
  });

  it('every stylesheet the header pages lean on has a forced dark theme', () => {
    for (const css of ['restoration/restoration.css', 'changelog/changelog.css', 'landing/landing.css', 'compare/compare.css']) {
      const text = readFileSync(join(pub, css), 'utf8');
      assert.ok(text.includes(':root[data-theme="dark"]') && text.includes(':root:not([data-theme="light"])'), css);
    }
  });
});
