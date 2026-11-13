import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK, SECTIONS, applyToHtml, currentChild, currentIndex, panelLinks, parseMenu, renderItem, renderLinks } from '../tools/site-nav/apply.mjs';
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
      '        <a href="/encyclopedia/items/">Items</a>',
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
  // The Header menu with the Encyclopedia's three groups and footer row (Austin 2026-11-05).
  const GROUPED = readFileSync(join(fixtures, 'grouped.html'), 'utf8');

  it('reads a submenu with the links inside it (the Header menu, Austin 2026-10-28)', () => {
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
    assert.deepEqual(odd[1].children.map((c) => `${c.label} ${c.className}`.trim()), ['Cartoons cartoons', 'Deeper', 'Away'],
      'a block that is not a submenu (the group) and a link without a url are skipped');
    assert.deepEqual(odd[1].children[1], { label: 'Deeper', href: '/tj/deeper/', className: '', children: [{ label: 'Deepest', href: '/deepest/', className: '' }] },
      'a submenu inside a submenu carries its links');
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
    assert.equal(currentChild(odd[1].children, '/tj/cartoons/one/'), 0, 'counted as drawn: a third level keeps the menu\'s order');
    assert.equal(currentChild(odd[1].children, '/tj/deeper/'), 1, 'a submenu with a url is a link');
    assert.equal(currentChild(odd[1].children, '/deepest/'), 2, 'and its links follow it');
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

  it('reads the Encyclopedia submenu as three groups and a footer row (Austin 2026-11-05)', () => {
    const links = parseMenu(GROUPED);
    assert.deepEqual(links.map((l) => l.label), ['Encyclopedia', 'Players', 'Community', 'Project', 'Play']);
    const enc = links[0];
    assert.deepEqual(enc.children.map((c) => (c.children ? `${c.label}: ${c.children.map((l) => l.label).join(', ')}` : c.label)), [
      'Things: Items, Tools and recipes, Imagination upgrades, Buffs',
      'World: Places, Streets, Stores, People, Animals and creatures, Giants, Music and sounds',
      'Doing: Quests, Skills, Achievements, Feats and projects',
      'Search the Encyclopedia',
      'All sections',
    ]);
    assert.ok(enc.children.slice(0, 3).every((g) => g.href === ''), 'the headings are plain text');
    const keys = ['items', 'recipes', 'imagination', 'buffs', 'places', 'streets', 'stores', 'people', 'animals', 'giants', 'sounds', 'quests', 'skills', 'achievements', 'feats'];
    assert.deepEqual(panelLinks(enc.children).map((l) => l.href), [...keys.map((k) => `/encyclopedia/${k}/`), '/encyclopedia/#q', '/encyclopedia/']);
    // Every section the encyclopedia home lists is in the menu, so a new one is not forgotten.
    const home = readFileSync(join(root, 'public/encyclopedia/index.html'), 'utf8');
    const cards = [...home.matchAll(/<a class="ency-card" href="([a-z-]+)\/">/g)].map((m) => m[1]);
    assert.deepEqual([...cards].sort(), [...keys].sort());
    assert.match(home, /<input id="q" type="search"/, 'the footer search link lands on the home page\'s search box');
  });

  it('draws a grouped panel: labelled groups side by side, then the footer row, on one line', () => {
    const [enc] = parseMenu(GROUPED);
    const line = renderItem(enc, 0, false, '/players/');
    assert.ok(!line.includes('\n'));
    const g = (n, head, rows) => `<div class="site-nav-group" role="group" aria-labelledby="site-nav-sub-0-h${n}"><span class="site-nav-head" id="site-nav-sub-0-h${n}">${head}</span>`
      + rows.map(([label, key]) => `<a href="/encyclopedia/${key}/">${label}</a>`).join('') + '</div>';
    assert.equal(line, '<div class="site-nav-sub"><a href="/encyclopedia/">Encyclopedia</a>'
      + '<button class="site-nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-sub-0" aria-label="More in Encyclopedia"></button>'
      + '<div class="site-nav-panel site-nav-panel-groups" id="site-nav-sub-0" hidden><div class="site-nav-groups">'
      + g(0, 'Things', [['Items', 'items'], ['Tools and recipes', 'recipes'], ['Imagination upgrades', 'imagination'], ['Buffs', 'buffs']])
      + g(1, 'World', [['Places', 'places'], ['Streets', 'streets'], ['Stores', 'stores'], ['People', 'people'], ['Animals and creatures', 'animals'], ['Giants', 'giants'], ['Music and sounds', 'sounds']])
      + g(2, 'Doing', [['Quests', 'quests'], ['Skills', 'skills'], ['Achievements', 'achievements'], ['Feats and projects', 'feats']])
      + '</div><div class="site-nav-panel-foot"><a href="/encyclopedia/#q">Search the Encyclopedia</a><a href="/encyclopedia/">All sections</a></div></div></div>');
    // Beside a heading, a submenu with a url is a group too, its heading a link; a group's class rides on the group.
    const linked = renderItem({ label: 'A', href: '/a/', className: '', children: [
      { label: 'H', href: '', className: '', children: [{ label: 'I', href: '/i/', className: '' }] },
      { label: 'B', href: '/b/', className: 'x', children: [{ label: 'C', href: '/c/', className: '' }] },
    ] }, 3, false, '/');
    assert.match(linked, /<div class="site-nav-group x" role="group" aria-labelledby="site-nav-sub-3-h1"><span class="site-nav-head" id="site-nav-sub-3-h1"><a href="\/b\/">B<\/a><\/span><a href="\/c\/">C<\/a><\/div><\/div><\/div><\/div>$/, 'no footer row without loose links');
    assert.deepEqual(panelLinks([{ label: 'H', href: '', className: '', children: [{ label: 'I', href: '/i/', className: '' }] }, { label: 'B', href: '/b/', className: 'x', children: [{ label: 'C', href: '/c/', className: '' }] }]).map((l) => l.href), ['/i/', '/b/', '/c/']);
  });

  it('keeps a plain submenu exactly as it was beside a grouped one', () => {
    const plain = parseMenu(HEADER)[2];
    const project = parseMenu(GROUPED)[3];
    assert.ok(project.children.every((c) => !c.children), 'Project holds plain links only');
    assert.equal(renderItem(project, 3, false, '/players/'), '<div class="site-nav-sub"><a href="/project/">Project</a>'
      + '<button class="site-nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-sub-3" aria-label="More in Project"></button>'
      + '<div class="site-nav-panel" id="site-nav-sub-3" hidden>' + project.children.map((c) => `<a href="${c.href}">${c.label}</a>`).join('') + '</div></div>');
    assert.ok(!renderLinks(parseMenu(HEADER), '/compare/').includes('site-nav-group'), 'no groups in a menu without nested submenus');
    assert.equal(renderItem(plain, 2, true, '/compare/'), renderItem(plain, 2, true, '/compare/').replace('site-nav-panel-groups', ''));
  });

  it('marks the section being read inside a group, the longest path winning', () => {
    const links = parseMenu(GROUPED);
    for (const [path, label] of [
      ['/encyclopedia/streets/groddle-meadow/', 'Streets'], ['/encyclopedia/feats/', 'Feats and projects'], ['/encyclopedia/items/apple/', 'Items'],
      ['/encyclopedia/sounds/x/', 'Music and sounds'], ['/encyclopedia/', 'All sections'],
    ]) {
      assert.equal(currentIndex(links, path), 0, path);
      const html = renderLinks(links, path);
      assert.match(html, /<a href="\/encyclopedia\/" aria-current="page">Encyclopedia<\/a>/, path);
      const marked = [...html.matchAll(/<a href="[^"]*" aria-current="page">([^<]+)<\/a>/g)].map((m) => m[1]);
      assert.deepEqual(marked, ['Encyclopedia', label], path);
    }
    assert.equal(currentChild(links[0].children, '/encyclopedia/'), 16, 'the footer counts after the groups');
    assert.equal(currentIndex(links, '/restoration/'), 3, 'Project still gathers its pages');
    assert.equal(currentIndex(links, '/players/'), 1);
    assert.doesNotMatch(renderLinks(links, '/players/x/'), /site-nav-panel-groups[^\n]*aria-current/, 'nothing in the panel marked off its section');
  });

  it('a built page takes the grouped menu and goes back to plain links', () => {
    const html = readFileSync(join(root, 'public/compare/index.html'), 'utf8');
    const links = parseMenu(GROUPED);
    const once = applyToHtml(html, '/encyclopedia/', links);
    assert.equal(applyToHtml(once, '/encyclopedia/', links), once);
    assert.equal(applyToHtml(once, '/compare/', FALLBACK), applyToHtml(html, '/compare/', FALLBACK));
    assert.match(once, /<div class="site-nav-links">\n {8}<div class="site-nav-sub">[^\n]*site-nav-panel-groups[^\n]*<\/div><\/div><\/div>\n {8}<a href="\/players\/">Players<\/a>/);
  });

  // The Header menu with Known gaps under Restoration (Austin 2026-11-12), as tools/site-nav/add-gaps-link.mjs leaves it.
  const NESTED = readFileSync(join(fixtures, 'nested.html'), 'utf8');

  it('reads a submenu with a url inside Project as a third level (Austin 2026-11-12)', () => {
    const links = parseMenu(NESTED);
    const project = links[3];
    assert.equal(project.label, 'Project');
    assert.deepEqual(project.children.map((c) => (c.children ? `${c.label} ${c.href}: ${c.children.map((l) => `${l.label} ${l.href}`).join(', ')}` : `${c.label} ${c.href}`)), [
      'Restoration /restoration/: History /restoration/history/, Known gaps /restoration/gaps/',
      'Compare /compare/', 'Notes /changelog/', 'Code /code/', 'Contribute /contribute/',
    ]);
    assert.deepEqual(panelLinks(project.children).map((l) => l.label), ['Restoration', 'History', 'Known gaps', 'Compare', 'Notes', 'Code', 'Contribute'], 'in the menu\'s order');
    assert.ok(panelLinks(project.children).every((l) => !l.children), 'the panel\'s links are plain links');
    assert.deepEqual(links[0], parseMenu(GROUPED)[0], 'the Encyclopedia is untouched');
  });

  it('draws a third level as a nested list in the panel\'s one column, on one line', () => {
    const project = parseMenu(NESTED)[3];
    const line = renderItem(project, 3, false, '/players/');
    assert.ok(!line.includes('\n'));
    assert.equal(line, '<div class="site-nav-sub"><a href="/project/">Project</a>'
      + '<button class="site-nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-sub-3" aria-label="More in Project"></button>'
      + '<div class="site-nav-panel site-nav-panel-nest" id="site-nav-sub-3" hidden><ul class="site-nav-list">'
      + '<li><a href="/restoration/">Restoration</a><ul class="site-nav-nest"><li><a href="/restoration/history/">History</a></li><li><a href="/restoration/gaps/">Known gaps</a></li></ul></li>'
      + '<li><a href="/compare/">Compare</a></li><li><a href="/changelog/">Notes</a></li><li><a href="/code/">Code</a></li><li><a href="/contribute/">Contribute</a></li>'
      + '</ul></div></div>');
    assert.doesNotMatch(line, /site-nav-group|site-nav-head|site-nav-panel-foot/, 'no columns, no footer row');
    const enc = renderItem(parseMenu(NESTED)[0], 0, false, '/players/');
    assert.match(enc, /site-nav-panel site-nav-panel-groups/, 'the Encyclopedia keeps its columns');
    assert.doesNotMatch(enc, /site-nav-nest/);
  });

  it('marks the page being read at any level of the third-level panel', () => {
    const links = parseMenu(NESTED);
    for (const [path, label] of [
      ['/restoration/', 'Restoration'], ['/restoration/history/', 'History'], ['/restoration/gaps/', 'Known gaps'],
      ['/compare/', 'Compare'], ['/changelog/a-note/', 'Notes'], ['/contribute/', 'Contribute'], ['/project/', null],
    ]) {
      assert.equal(currentIndex(links, path), 3, path);
      const marked = [...renderLinks(links, path).matchAll(/<a href="[^"]*" aria-current="page">([^<]+)<\/a>/g)].map((m) => m[1]);
      assert.deepEqual(marked, label ? ['Project', label] : ['Project'], path);
    }
    assert.equal(currentChild(links[3].children, '/restoration/gaps/'), 2);
    assert.doesNotMatch(renderLinks(links, '/players/x/'), /site-nav-panel-nest[^\n]*aria-current/, 'nothing in the panel marked off its section');
  });

  it('a built page takes the third-level menu and goes back to plain links', () => {
    const html = readFileSync(join(root, 'public/compare/index.html'), 'utf8');
    const links = parseMenu(NESTED);
    const once = applyToHtml(html, '/restoration/gaps/', links);
    assert.equal(applyToHtml(once, '/restoration/gaps/', links), once);
    assert.equal(applyToHtml(once, '/compare/', FALLBACK), applyToHtml(html, '/compare/', FALLBACK));
    assert.match(once, /\n {8}<div class="site-nav-sub"><a href="\/project\/" aria-current="page">Project<\/a>[^\n]*<a href="\/restoration\/gaps\/" aria-current="page">Known gaps<\/a>[^\n]*<\/ul><\/div><\/div>\n {8}<a class="site-nav-play"/);
  });

  it('styles the third level: one column, indented along a hairline guide, on a phone too and in the chat app', () => {
    const css = readFileSync(join(root, 'public/site/site-nav.css'), 'utf8');
    assert.match(css, /\.site-nav-list, \.site-nav-nest \{ margin: 0; padding: 0; list-style: none; \}/);
    assert.match(css, /\.site-nav-nest \{ margin: 2px 0 2px 14px; padding-left: 6px; border-left: 1px solid var\(--border\); \}/);
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    assert.match(phone, /\.site-nav-panel-nest \{ display: block; \}/, 'not the plain panel\'s two columns');
    assert.ok(css.indexOf('.site-nav-panel-nest { display: block; }') > css.indexOf('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'), 'after the two-column rule it overrides');
    if (!skipWithoutSite) {
      const chat = readFileSync(sitePath('community/community.css'), 'utf8');
      assert.match(chat, /\.site-nav-app\[data-menu\] \.site-nav-panel-nest, \.site-nav-app\[data-menu\] \.site-nav-panel-nest\[hidden\] \{ display: block; \}/, 'the chat app\'s phone menu keeps it one column');
    }
  });

  it('draws the same markup as the theme, and the chat app\'s layout of it (php: SiteNav::parse and nav)', { skip: (skipWithoutSite || (!existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')) }, () => {
    const paths = ['/', '/items/', '/players/', '/project/', '/restoration/', '/restoration/history/', '/restoration/gaps/', '/contribute/', '/compare/', '/changelog/a-note/', '/code/', '/codex/', '/tj/', '/tj/cartoons/x/', '/tj/deeper/', '/deepest/', '/empty/', '/play/online/',
      '/encyclopedia/', '/encyclopedia/streets/groddle-meadow/', '/encyclopedia/feats/', '/encyclopedia/items/apple/'];
    for (const file of ['header-menu.html', 'submenus.html', 'grouped.html', 'nested.html']) {
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
        // The chat app's header (/chat/, Austin 2026-11-04): the same links from the same menu, laid out its own way.
        for (const [kind, html] of [['app', out.app[path]], ['appOut', out.appOut[path]]]) {
          assert.match(html, /^<nav class="site-nav site-nav-app" aria-label="Site">\n {2}<div class="site-nav-row">\n/, `${kind} ${path}: its own class, no centred wrap`);
          const app = html.match(/<div class="site-nav-links" id="site-nav-links">\n([\s\S]*?)\n\s*<\/div>/)[1].split('\n').map((l) => l.trim());
          assert.deepEqual(app, php, `${kind} ${file} ${path}: the menu's links, no hard-coded ones`);
          assert.ok(html.indexOf('<button class="site-nav-menu"') < html.indexOf('<div class="site-nav-links"'), 'the phone menu button opens the links after it');
          assert.match(html, /<button class="site-nav-menu" type="button" aria-expanded="false" aria-controls="site-nav-links" aria-label="Menu" hidden><\/button>/);
          assert.match(html, /<button class="site-nav-theme" type="button" aria-label="Colour theme"><\/button>\n {2}<\/div>\n<\/nav>$/, 'the theme button closes the row, after the links');
          assert.ok(html.indexOf('site-nav-theme') > html.indexOf('site-nav-links'));
        }
        assert.match(out.app[path], /<div class="site-nav-bell" data-notif><button class="site-nav-bell-btn" [^>]*aria-controls="site-nav-notif" data-notif-open>.*<span data-notif-count>3<\/span>/, 'a signed-in reader\'s bell and its count');
        assert.ok(!out.appOut[path].includes('site-nav-bell'), 'no bell signed out');
      }
    }
  });
});
