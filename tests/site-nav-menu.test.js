import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK, SECTIONS, applyToHtml, currentIndex, parseMenu, renderLinks } from '../tools/site-nav/apply.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

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

  it('marks Project on the pages it gathers; a link straight to a page still wins (G338)', () => {
    const header = [
      { label: 'Items', href: '/items/', className: '' },
      { label: 'Players', href: '/players/', className: '' },
      { label: 'Project', href: '/project/', className: '' },
      { label: 'Play', href: '/play/online/', className: 'site-nav-play' },
    ];
    for (const path of ['/project/', '/restoration/', '/restoration/history/', '/compare/', '/changelog/', '/changelog/some-note/', '/code/']) {
      assert.equal(currentIndex(header, path), 2, path);
    }
    assert.equal(currentIndex(header, '/players/bo-peep/skills/'), 1);
    assert.equal(currentIndex(header, '/items/'), 0);
    assert.equal(currentIndex(header, '/codex/'), -1, 'a section is a whole path segment');
    assert.equal(currentIndex(header, '/musicblocks/'), -1);
    assert.equal(currentIndex(header, '/play/online/'), -1);
    const both = [...header, { label: 'Notes', href: '/changelog/', className: '' }];
    assert.equal(currentIndex(both, '/changelog/'), 4, 'the direct link beats the section that gathers it');
    assert.equal(currentIndex(both, '/code/'), 2);
    assert.match(renderLinks(header, '/compare/'), /<a href="\/project\/" aria-current="page">Project<\/a>/);
  });

  it('gathers the same pages as the theme (SiteNav::SECTIONS)', { skip: skipWithoutSite }, () => {
    const php = readFileSync(sitePath('src/SiteNav.php'), 'utf8');
    const body = php.match(/public const SECTIONS = \[\n([\s\S]*?)\n\s*\];/)[1];
    const rows = Object.fromEntries([...body.matchAll(/'([^']+)' => \[([^\]]*)\]/g)].map(([, href, list]) => [href, [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])]));
    assert.deepEqual(rows, SECTIONS);
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('the theme marks the same link (php: SiteNav::current and nav)', { skip: (skipWithoutSite || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')) }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/profile-pages.php'), engine, sitePath(''), join(root, 'public')], { encoding: 'utf8' }));
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    const header = [['Items', '/items/', ''], ['Players', '/players/', ''], ['Project', '/project/', ''], ['Play', '/play/online/', 'site-nav-play']]
      .map(([label, href, className]) => ({ label, href, className }));
    for (const [path, index] of Object.entries(out.current)) {
      assert.equal(index ?? -1, currentIndex(header, path), path);
    }
    assert.equal(out['direct link wins'], 4);
    assert.match(out['nav on /code/'], /<a href="\/project\/" aria-current="page">Project<\/a>/);
  });

  it('rewrites only the links of a built page', () => {
    const html = readFileSync(join(root, 'public/compare/index.html'), 'utf8');
    const out = applyToHtml(html, '/compare/', FALLBACK);
    const links = out.match(/<div class="site-nav-links">\n([\s\S]*?)\n\s*<\/div>/)[1];
    assert.equal(links, [
      '        <a href="/restoration/">Restoration</a>',
      '        <a href="/compare/" aria-current="page">Compare</a>',
      '        <a href="/items/">Items</a>',
      '        <a href="/changelog/">Notes</a>',
      '        <a class="site-nav-play" href="/play/">Play</a>',
    ].join('\n'));
    const strip = (s) => s.replace(/<div class="site-nav-links">[\s\S]*?<\/div>/, '');
    assert.equal(strip(out), strip(html));
    assert.equal(applyToHtml('<p>no header</p>', '/x/', FALLBACK), '<p>no header</p>');
  });

  it('falls back to the links the theme ships with (the site repo\'s src/SiteNav.php)', { skip: skipWithoutSite }, () => {
    const php = readFileSync(sitePath('src/SiteNav.php'), 'utf8');
    const rows = [...php.matchAll(/\['([^']+)', '([^']+)', '([^']*)'\]/g)].map(([, label, href, className]) => ({ label, href, className }));
    assert.deepEqual(rows, FALLBACK);
  });

  it('falls back to the links the built pages ship with', () => {
    const built = readFileSync(join(root, 'public/index.html'), 'utf8').match(/<div class="site-nav-links">([\s\S]*?)<\/div>/)[1];
    const shipped = [...built.matchAll(/<a(?: class="([^"]+)")? href="([^"]+)">([^<]+)<\/a>/g)].map(([, className = '', href, label]) => ({ label, href: '/' + href, className }));
    assert.deepEqual(shipped, FALLBACK);
  });
});
