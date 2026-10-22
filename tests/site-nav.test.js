import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
        if (!ref) continue;
        const target = resolve(pub, p.file, '..', ref);
        assert.ok(existsSync(ref.endsWith('/') ? join(target, 'index.html') : target), `${p.file}: ${ref}`);
      }
    }
  });
});
