// The console's own addresses (Austin 2026-11-25: "/console/#boards is changed to /console/boards"). Each tab is
// /console/<tab>/, one report /console/reports/<id>/, one player's chat /console/chat/<player>/, a search
// /console/reports/?q=<words>; Players is /console/ and Builder /console/drafts/ (the level builder's page owns
// /console/builder/). The site (groddle-afternoon-site, skipped without it) serves them all as the one page
// (src/AdminConsolePage.php TABS) and console/console.js reads and writes them; the old #hash links still open their
// tab and become its address.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');

describe('the console\'s addresses (console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};
  const src = (p) => readFileSync(sitePath(p), 'utf8');

  it('writes one address for each tab, report, chat and search', () => {
    assert.equal(mod.consolePath({ tab: 'players' }), '/console/');
    assert.equal(mod.consolePath({}), '/console/');
    for (const tab of ['reports', 'chat', 'credits', 'boards', 'community', 'moderation', 'server', 'analytics', 'ledger']) assert.equal(mod.consolePath({ tab }), `/console/${tab}/`);
    assert.equal(mod.consolePath({ tab: 'builder' }), '/console/drafts/', 'the builder page owns /console/builder/');
    assert.equal(mod.consolePath({ tab: 'reports', id: 39 }), '/console/reports/39/');
    assert.equal(mod.consolePath({ tab: 'chat', id: 7 }), '/console/chat/7/');
    assert.equal(mod.consolePath({ tab: 'boards', id: 7 }), '/console/boards/', 'only reports and chat take a number');
    assert.equal(mod.consolePath({ tab: 'reports', q: '  the pig  ' }), '/console/reports/?q=the%20pig');
    assert.equal(mod.consolePath({ tab: 'reports', id: 39, q: 'pig' }), '/console/reports/39/', 'one report wins over the search');
    assert.equal(mod.consolePath({ tab: 'nope' }), '/console/');
    assert.equal(mod.reportLink(39, 'https://groddleafternoon.com'), 'https://groddleafternoon.com/console/reports/39/');
  });

  it('reads each address back, and nothing it does not know', () => {
    const r = (path, search = '', hash = '') => mod.consoleRoute(path, search, hash);
    assert.deepEqual(r('/console/'), { tab: 'players', id: 0, q: '' });
    assert.deepEqual(r('/console/boards/'), { tab: 'boards', id: 0, q: '' });
    assert.deepEqual(r('/console/drafts/'), { tab: 'builder', id: 0, q: '' });
    assert.deepEqual(r('/console/reports/39/'), { tab: 'reports', id: 39, q: '' });
    assert.deepEqual(r('/console/chat/7/'), { tab: 'chat', id: 7, q: '' });
    assert.deepEqual(r('/console/reports/', '?q=a+b'), { tab: 'reports', id: 0, q: 'a b' });
    assert.deepEqual(r('/console/reports/', '?q=%E0%A4%A'), { tab: 'reports', id: 0, q: '' }, 'a broken search is none');
    for (const bad of ['/console/builder/', '/console/boards/7/', '/console/nope/', '/console/reports/0/', '/elsewhere/', '']) assert.equal(r(bad).tab, 'players', bad);
    // Every tab's address reads back as itself.
    for (const tab of Object.keys(mod.TAB_PATHS)) assert.deepEqual(r(mod.consolePath({ tab })), { tab, id: 0, q: '' }, tab);
  });

  it('opens the old #hash links, ahead of the path', () => {
    const r = (hash) => mod.consoleRoute('/console/', '', hash);
    assert.deepEqual(r('#boards'), { tab: 'boards', id: 0, q: '' });
    assert.deepEqual(r('#builder'), { tab: 'builder', id: 0, q: '' });
    assert.deepEqual(r('#moderation'), { tab: 'moderation', id: 0, q: '' });
    assert.deepEqual(r('#report=39'), { tab: 'reports', id: 39, q: '' });
    assert.deepEqual(r('#chat=7'), { tab: 'chat', id: 7, q: '' });
    assert.deepEqual(r('#chat'), { tab: 'chat', id: 0, q: '' });
    assert.deepEqual(r('#reports?q=the%20pig'), { tab: 'reports', id: 0, q: 'the pig' });
    assert.equal(mod.legacyRoute('#players'), null);
    assert.equal(mod.legacyRoute(''), null);
    assert.deepEqual(mod.consoleRoute('/console/boards/', '', '#nothing'), { tab: 'boards', id: 0, q: '' }, 'an unknown hash leaves the path');
  });

  it('the page reads the address on load and on Back, writes it from showTab, and turns an old link into its address', () => {
    const js = src('console/console.js');
    assert.match(js, /addEventListener\('popstate', fromAddress\);/);
    assert.match(js, /addEventListener\('hashchange', fromAddress\);/);
    assert.match(js, /    fromAddress\(\);\n/);
    assert.match(js, /if \(location\.hash \|\| url !== location\.pathname \+ location\.search\) history\.replaceState\(null, '', url\);/);
    assert.match(js, /go\(id === 'reports' \? \{ tab: id, id: tickets\.open \|\| 0, q: tickets\.q \} : \{ tab: id \}\);/);
    assert.match(js, /async function openTicket\(id, focus = true\) \{\n    go\(\{ tab: 'reports', id \}\);/);
    assert.doesNotMatch(js, /history\.replaceState\(null, '', '#/, 'no tab writes a hash any more');
    for (const f of ['moderation', 'server', 'ledger', 'analytics']) assert.doesNotMatch(src(`console/${f}.js`), /location\.hash/, `${f}.js leaves the address to console.js`);
    assert.match(readFileSync(join(root, 'public/js/builder/editor.js'), 'utf8'), /href: '\/console\/drafts\/', class: 'builder-back'/);
  });

  it('the site serves every address as the page, a bare one with its slash, and signs in back to it', () => {
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /public const TABS = 'reports\|chat\|credits\|boards\|community\|moderation\|server\|analytics\|ledger\|drafts';/);
    const tabs = page.match(/TABS = '([^']+)'/)[1].split('|').sort();
    assert.deepEqual(tabs, Object.values(mod.TAB_PATHS).sort(), 'the site and the page name the same tabs');
    assert.match(page, /#\[Route\(Method::Get, self::PATH \. '\{tab:' \. self::TABS \. '\}\/', policy: new Policy\(Access::Public\)\)\]\n    public function tab\(Request \$request\): Response\n    \{\n        return \$this->page\(\$request\);/);
    assert.match(page, /#\[Route\(Method::Get, self::PATH \. '\{tab:reports\|chat\}\/\{id:\\d\+\}\/', policy: new Policy\(Access::Public\)\)\]\n    public function item\(Request \$request\): Response\n    \{\n        return \$this->page\(\$request\);/);
    assert.match(page, /#\[Route\(Method::Get, self::PATH \. '\{tab:' \. self::TABS \. '\}', policy: new Policy\(Access::Public\)\)\]\n    public function bareTab/);
    assert.match(page, /\$back = self::isConsolePath\(\$request->path\) \? \$request->path \. \$request->queryStringWithout\(\) : self::PATH;/);
    assert.match(page, /ASSET_KEY = 'skin-16'/);
    assert.match(page, /SERVER_ASSET_KEY = 'server-5'/);
    assert.match(page, /ANALYTICS_ASSET_KEY = 'analytics-4'/);
    assert.match(page, /LEDGER_ASSET_KEY = 'ledger-3'/);
  });
});
