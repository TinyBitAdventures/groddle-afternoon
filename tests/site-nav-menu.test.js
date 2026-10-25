import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FALLBACK, applyToHtml, currentIndex, parseMenu, renderLinks } from '../tools/site-nav/apply.mjs';

const root = join(import.meta.dirname, '..');
const MENU = `<!-- wp:navigation-link {"label":"Restoration","url":"/restoration/","kind":"custom","isTopLevelLink":true} /-->

<!-- wp:navigation-submenu {"label":"Wiki","url":"/wiki/","kind":"custom"} -->
<!-- wp:navigation-link {"label":"Music","url":"/wiki/topic/music/","kind":"custom"} /-->
<!-- /wp:navigation-submenu -->

<!-- wp:navigation-link {"label":"Tom \\u0026amp; Jerry","url":"/tj/","kind":"custom"} /-->

<!-- wp:navigation-link {"label":"Play","url":"/play/","kind":"custom","className":"site-nav-play"} /-->`;

describe('the header menu in the built pages (tools/site-nav/apply.mjs)', () => {
  it('reads the top-level links of a wp_navigation post, with their class', () => {
    assert.deepEqual(parseMenu(MENU), [
      { label: 'Restoration', href: '/restoration/', className: '' },
      { label: 'Wiki', href: '/wiki/', className: '' },
      { label: 'Tom & Jerry', href: '/tj/', className: '' },
      { label: 'Play', href: '/play/', className: 'site-nav-play' },
    ]);
    assert.deepEqual(parseMenu(''), FALLBACK);
    assert.deepEqual(parseMenu('<!-- wp:page-list /-->'), FALLBACK);
  });

  it('marks the longest section that holds the page, never home or Play', () => {
    const links = parseMenu(MENU);
    assert.equal(currentIndex(links, '/wiki/street-music/'), 1);
    assert.equal(currentIndex(links, '/restoration/'), 0);
    assert.equal(currentIndex(links, '/play/'), -1);
    assert.equal(currentIndex(links, '/'), -1);
    assert.match(renderLinks(links, '/tj/'), /<a href="\/tj\/" aria-current="page">Tom &amp; Jerry<\/a>/);
  });

  it('rewrites only the links of a built page', () => {
    const html = readFileSync(join(root, 'public/compare/index.html'), 'utf8');
    const out = applyToHtml(html, '/compare/', FALLBACK);
    const links = out.match(/<div class="site-nav-links">\n([\s\S]*?)\n\s*<\/div>/)[1];
    assert.equal(links, [
      '        <a href="/restoration/">Restoration</a>',
      '        <a href="/compare/" aria-current="page">Compare</a>',
      '        <a href="/wiki/">Wiki</a>',
      '        <a href="/changelog/">Notes</a>',
      '        <a class="site-nav-play" href="/play/">Play</a>',
    ].join('\n'));
    const strip = (s) => s.replace(/<div class="site-nav-links">[\s\S]*?<\/div>/, '');
    assert.equal(strip(out), strip(html));
    assert.equal(applyToHtml('<p>no header</p>', '/x/', FALLBACK), '<p>no header</p>');
  });

  it('falls back to the links the built pages and the theme ship with', () => {
    const php = readFileSync(join(root, 'minn/groddle/src/SiteNav.php'), 'utf8');
    const rows = [...php.matchAll(/\['([^']+)', '([^']+)', '([^']*)'\]/g)].map(([, label, href, className]) => ({ label, href, className }));
    assert.deepEqual(rows, FALLBACK);
    const built = readFileSync(join(root, 'public/index.html'), 'utf8').match(/<div class="site-nav-links">([\s\S]*?)<\/div>/)[1];
    const shipped = [...built.matchAll(/<a(?: class="([^"]+)")? href="([^"]+)">([^<]+)<\/a>/g)].map(([, className = '', href, label]) => ({ label, href: '/' + href, className }));
    assert.deepEqual(shipped, FALLBACK);
  });
});
