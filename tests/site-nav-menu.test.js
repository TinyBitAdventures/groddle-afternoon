import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK, SECTIONS, applyToHtml, currentChild, currentIndex, parseMenu, renderItem, renderLinks } from '../tools/site-nav/apply.mjs';
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
      { label: 'Wiki', href: '/wiki/', className: '', children: [{ label: 'Music', href: '/wiki/topic/music/', className: '' }] },
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
  const fixtures = join(root, 'tests/fixtures/site-nav');
  const HEADER = readFileSync(join(fixtures, 'header-menu.html'), 'utf8');
  const SUBMENUS = readFileSync(join(fixtures, 'submenus.html'), 'utf8');

  it('reads a submenu with the links inside it, one level deep (the Header menu, Austin 2026-10-28)', () => {
    const links = parseMenu(HEADER);
    assert.deepEqual(links.map((l) => l.label), ['Items', 'Players', 'Project', 'Play']);
    assert.deepEqual(links[2], {
      label: 'Project', href: '/project/', className: '',
      children: ['Restoration /restoration/', 'Compare /compare/', 'Notes /changelog/', 'Code /code/']
        .map((row) => row.split(' ')).map(([label, href]) => ({ label, href, className: '' })),
    });
    assert.equal(links[3].className, 'site-nav-play');
    assert.ok(!('children' in links[0]), 'a plain link has no children');
    assert.deepEqual(links[2].children.map((c) => c.href), SECTIONS['/project/'], 'the menu holds the pages Project gathers');
    const odd = parseMenu(SUBMENUS);
    assert.equal(odd[1].label, "Tom's & Jerry's");
    assert.deepEqual(odd[1].children.map((c) => `${c.label} ${c.className}`.trim()), ['Cartoons cartoons', 'Deeper', 'Deepest', 'Away'],
      'deeper submenus join the list; a block that is not a submenu (the group) and a link without a url are skipped');
    assert.ok(!('children' in odd[2]), 'an empty submenu is a plain link');
  });

  it('draws a submenu as its link, a toggle and a hidden panel, on one line', () => {
    const [, , project] = parseMenu(HEADER);
    const line = renderItem(project, 2, false, '/players/');
    assert.equal(line, '<div class="site-nav-sub"><a href="/project/">Project</a>'
      + '<button class="site-nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-sub-2" aria-label="More in Project"></button>'
      + '<div class="site-nav-panel" id="site-nav-sub-2" hidden><a href="/restoration/">Restoration</a><a href="/compare/">Compare</a><a href="/changelog/">Notes</a><a href="/code/">Code</a></div></div>');
    assert.ok(!line.includes('\n'));
    assert.equal(renderItem({ label: 'Items', href: '/items/', className: '' }, 0, true, '/items/'), '<a href="/items/" aria-current="page">Items</a>');
  });

  it('marks a submenu on its links\' pages, and its link to the page inside the panel', () => {
    const links = parseMenu(HEADER);
    for (const [path, child] of [['/project/', -1], ['/restoration/', 0], ['/restoration/history/', 0], ['/compare/', 1], ['/changelog/a-note/', 2], ['/code/', 3]]) {
      assert.equal(currentIndex(links, path), 2, path);
      assert.equal(currentChild(links[2].children, path), child, path);
      const html = renderLinks(links, path);
      assert.equal((html.match(/aria-current="page"/g) || []).length, child < 0 ? 1 : 2, path);
      assert.match(html, /<a href="\/project\/" aria-current="page">Project<\/a>/, path);
      if (child >= 0) assert.ok(html.includes(`<a href="${links[2].children[child].href}" aria-current="page">`), path);
    }
    assert.equal(currentIndex(links, '/players/zz/'), 1);
    assert.doesNotMatch(renderLinks(links, '/players/zz/'), /site-nav-panel[^\n]*aria-current/, 'no child marked off its section');
    assert.equal(currentIndex(links, '/codex/'), -1);
    // Without SECTIONS: the submenu's own links make the section, a link straight to the page still wins.
    const odd = parseMenu(SUBMENUS);
    assert.equal(currentIndex(odd, '/deepest/'), 1);
    assert.equal(currentChild(odd[1].children, '/tj/cartoons/one/'), 0);
    assert.equal(currentChild(odd[1].children, '/tj/'), -1, 'the submenu\'s own page marks no child');
    assert.equal(currentIndex([...odd, { label: 'Deep', href: '/deepest/', className: '' }], '/deepest/'), 4);
    assert.equal(currentIndex(odd, '/play/online/'), -1);
  });

  it('a built page keeps its submenu markup through a second rewrite (one line per item)', () => {
    const html = readFileSync(join(root, 'public/compare/index.html'), 'utf8');
    const links = parseMenu(HEADER);
    const once = applyToHtml(html, '/compare/', links);
    assert.equal(applyToHtml(once, '/compare/', links), once);
    assert.equal(applyToHtml(applyToHtml(html, '/compare/', FALLBACK), '/compare/', links), once);
    assert.equal(applyToHtml(once, '/compare/', FALLBACK), applyToHtml(html, '/compare/', FALLBACK), 'and back to plain links');
    assert.match(once, /<div class="site-nav-links">\n {8}<a href="\/items\/">Items<\/a>\n {8}<a href="\/players\/">Players<\/a>\n {8}<div class="site-nav-sub">[^\n]*<\/div><\/div>\n {8}<a class="site-nav-play" href="\/play\/online\/">Play<\/a>\n {6}<\/div>\n {6}<button class="site-nav-theme"/);
  });

  it('draws the same markup as the theme (php: SiteNav::parse and nav)', { skip: (skipWithoutSite || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')) }, () => {
    const paths = ['/', '/items/', '/players/', '/project/', '/restoration/history/', '/compare/', '/changelog/a-note/', '/code/', '/codex/', '/tj/', '/tj/cartoons/x/', '/deepest/', '/empty/', '/play/online/'];
    for (const file of ['header-menu.html', 'submenus.html']) {
      let out;
      try {
        out = JSON.parse(execFileSync('php', [join(fixtures, 'site-nav.php'), engine, sitePath(''), join(fixtures, file), ...paths], { encoding: 'utf8' }));
      } catch (err) {
        if (err.code === 'ENOENT') return; // no php here
        throw err;
      }
      const links = parseMenu(readFileSync(join(fixtures, file), 'utf8'));
      const asRows = (list) => list.map(({ label, href, className, children }) => (children ? [label, href, className, asRows(children)] : [label, href, className]));
      assert.deepEqual(out.links, asRows(links), file);
      for (const path of paths) {
        const php = out.nav[path].match(/<div class="site-nav-links">\n([\s\S]*?)\n\s*<\/div>/)[1].split('\n').map((l) => l.trim());
        assert.deepEqual(php, renderLinks(links, path, '').split('\n'), `${file} ${path}`);
      }
    }
  });
});
