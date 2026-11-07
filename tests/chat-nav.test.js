/**
 * Moving around /chat/ without a reload (Austin 2026-11-05: "Can we make the /chat/ use pushState.
 * Currently bouncing around /chat/ to /chat/?c=global and etc, the page performs a full reload."):
 * the site repo's community/chat-nav.js with chat-app.js, community.js and notifications.js.
 *
 * Always: the pure rules (chat-pure.js chatRoute, convPath, plainClick, sameView) and the sources
 * (no move inside /chat/ sets location.href; every view still drawn by the server).
 *
 * Opt-in, on the real site (it makes two throwaway players and their rows, and deletes them all,
 * the chat tables included, register G524):
 *
 *   GRODDLE_LIVE=1 node --test tests/chat-nav.test.js
 *
 * drives Chrome (the one-browser lock) through every move a signed-in player and a visitor make:
 * a marker set on window at load must survive each click (a reload loses it), the page must not
 * fire another load, the live socket must be the same one, and Back and Forward must bring back
 * the view, the rail mark, the title and a conversation's place.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const src = (f) => readFileSync(sitePath(f), 'utf8');
const pure = () => import(pathToFileURL(sitePath('community/chat-pure.js')).href);
const O = 'https://groddle.localhost';

describe('the addresses inside /chat/ (community/chat-pure.js)', { skip: skipWithoutSite }, () => {
  it('each view of the app is an address; anything else is the browser\'s', async () => {
    const { chatRoute } = await pure();
    const r = (h) => {
      const x = chatRoute(h, O);
      return x && { ...x, path: undefined, hash: undefined };
    };
    assert.deepEqual(r('/chat/'), { view: 'home', path: undefined, hash: undefined });
    assert.equal(chatRoute('/chat/?c=global', O).key, 'chan:global');
    assert.equal(chatRoute('/chat/?c=help', O).view, 'chan');
    assert.deepEqual([chatRoute('/chat/?im=9#t3', O).key, chatRoute('/chat/?im=9#t3', O).path, chatRoute('/chat/?im=9#t3', O).hash], ['im:9', '/chat/?im=9', '#t3']);
    assert.equal(chatRoute('/chat/?im=0', O).view, 'home', 'no player 0: the app\'s first view');
    assert.deepEqual(r('/chat/general/'), { view: 'board', board: 'general', page: 1, path: undefined, hash: undefined });
    assert.equal(chatRoute('/chat/general/?page=3', O).page, 3);
    assert.equal(chatRoute('/chat/ideas/new/', O).view, 'new');
    assert.deepEqual([chatRoute('/chat/general/6-greetings/#post-2', O).view, chatRoute('/chat/general/6-greetings/#post-2', O).thread], ['thread', 6]);
    assert.equal(chatRoute('/chat/general/6/', O).thread, 6);
    // Not the app's: the form's post address, other pages, other sites, the address without its slash (a redirect).
    for (const h of ['/chat/general/6-greetings/reply/', '/players/bo/', '/play/online/', 'https://evil.example/chat/', '/chat/general', '/chat', 'javascript:alert(1)']) assert.equal(chatRoute(h, O), null, h);
  });

  it('a conversation\'s address; a plain click is taken over, a new tab, a window or a download never', async () => {
    const { convPath, plainClick, sameView, chatRoute } = await pure();
    assert.equal(convPath('chan:global'), '/chat/?c=global');
    assert.equal(convPath('im:42'), '/chat/?im=42');
    const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    assert.equal(plainClick(click, {}), true);
    for (const k of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey', 'defaultPrevented']) assert.equal(plainClick({ ...click, [k]: true }, {}), false, k);
    assert.equal(plainClick({ ...click, button: 1 }, {}), false, 'the middle button');
    assert.equal(plainClick(click, { target: '_blank' }), false);
    assert.equal(plainClick(click, { target: '_self' }), true);
    assert.equal(plainClick(click, { download: true }), false);
    assert.equal(sameView(chatRoute('/chat/general/6-x/', O), chatRoute('/chat/general/6-x/#post-3', O)), true, 'a place on the same page');
    assert.equal(sameView(chatRoute('/chat/general/', O), chatRoute('/chat/general/?page=2', O)), false);
  });
});

describe('the sources: no move inside /chat/ reloads (site repo community/)', { skip: skipWithoutSite }, () => {
  it('the app draws a conversation in place and the address follows through chat-nav.js', () => {
    const app = src('community/chat-app.js');
    assert.doesNotMatch(app, /location\.href\s*=/, 'chat-app.js never loads a page');
    assert.doesNotMatch(app, /onIndex/, 'conversations open from any view, a board\'s page too');
    assert.match(app, /if \(nav\) nav\.go\(convPath\(key\), \{ focus: focus \? 'input' : 'heading' \}\);/);
    assert.match(app, /nav\.app\.show = showRoute;\n\s*nav\.app\.leave = leaveConv;/);
    assert.match(app, /if \(noteIt && nav && open === key\) nav\.note\(`\$\{convPath\(key\)\}#t\$\{parentId\}`\);/, 'a thread has its address');
    assert.match(app, /if \(note && thread && nav\) nav\.note\(convPath\(thread\.key\)\);/, 'closing it too');
    assert.doesNotMatch(app, /addEventListener\('popstate'/, 'Back and Forward are chat-nav.js\'s');
    const nav = src('community/chat-nav.js');
    assert.match(nav, /history\.pushState\(\{ cx: 1 \}, '', url\)/);
    assert.match(nav, /window\.addEventListener\('popstate'/);
    assert.match(nav, /fetch\(to\.path, \{ credentials: 'same-origin', headers: \{ Accept: 'text\/html' \} \}\)/, 'a board\'s page is the server\'s own page, no new route');
    assert.match(nav, /plainClick\(e, \{ target: a\.getAttribute\('target'\), download: a\.hasAttribute\('download'\) \}\)/);
    assert.match(nav, /role', 'status'\);/, 'the move is said');
    assert.match(nav, /h\.focus\(\{ preventScroll: true \}\);/, 'and the heading takes the focus');
  });

  it('the boards\' forms, the bell and the menus move through it too; the server still draws every address', () => {
    const community = src('community/community.js');
    assert.doesNotMatch(community, /location\.href\s*=/);
    assert.match(community, /go\(r\.data\.url, \{ replace: true \}\);/, 'a new topic replaces its form');
    assert.match(community, /import\(`\.\/chat-nav\.js\$\{v\}`\)/);
    assert.match(community, /hooks: \{ leave: \(\) => unwire\(\), enter: \(root\) => \{ wireSignIn\(root\); wirePage\(\); \} \}/, 'a view\'s poll stops when it goes');
    assert.match(src('community/chat-nav.js'), /await import\(`\.\/chat-pure\.js\$\{new URL\(import\.meta\.url\)\.search\}`\)/, 'with its own asset key');
    const bell = src('community/notifications.js');
    assert.match(bell, /if \(nav\) \{\n\s*closePanel\(\);\n\s*nav\.go\(item\.url\);/);
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /public const ASSET_KEY = 'community-8';/);
    // A bare path keeps a browser's copy for a year: returning players got a new chat-app.js beside an old chat-pure.js, and /chat/ stuck on Connecting.
    for (const file of ['chat-app.js', 'chat-menus.js', 'chat-nav.js', 'notifications.js', 'community.js']) {
      assert.doesNotMatch(src(`community/${file}`), /(?:^|\n)import [^\n]*from '\.\//, `${file}: a static import of a sibling carries no key`);
    }
    for (const file of ['chat-app.js', 'chat-menus.js', 'chat-nav.js', 'notifications.js']) {
      assert.match(src(`community/${file}`), /await import\(`\.\/chat-pure\.js\$\{new URL\(import\.meta\.url\)\.search\}`\)/, `${file} asks for chat-pure.js with its own key`);
    }
    assert.match(pages, /\$first = isset\(\$open\[\$asked\]\) \? \$asked : array_key_first\(\$open\);/, '/chat/?c=help draws Live Help without JavaScript');
    for (const r of ["'/chat/'", "'/chat/{board:[a-z-]+}/'", "'/chat/{board:[a-z-]+}/new/'", "'/chat/{board:[a-z-]+}/{thread:\\d+(?:-[a-z0-9-]+)?}/'"]) assert.ok(pages.includes(`#[Route(Method::Get, ${r}, policy: new Policy(Access::Public))]`), r);
  });
});

// —— On the real site ——

const LIVE = process.env.GRODDLE_LIVE === '1';
const ROOT = process.env.GRODDLE_ROOT || join(homedir(), 'Cove/Sites/groddle.localhost/public');
const SITE = (process.env.GRODDLE_URL || O).replace(/\/$/, '');
const wp = (...args) => execFileSync('wp', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sql = (q) => wp('db', 'query', '--skip-column-names', q);

describe('moving around /chat/ on groddle.localhost never reloads', { skip: !LIVE && 'set GRODDLE_LIVE=1 to drive groddle.localhost' }, () => {
  let dir = '';
  const made = [];
  let A; let B; let topic = ''; let mine = null;
  const BASE_LID = 9_100_000_000_000 + (process.pid % 100000) * 1000;
  const PARENT = BASE_LID + 30;

  function curl(who, method, path, body) {
    const { jar, nonce } = who;
    const args = ['-sk', '-b', jar, '-c', jar, '-X', method, '-o', join(dir, 'body'), '-w', '%{http_code}'];
    if (body !== undefined) {
      writeFileSync(join(dir, 'req.json'), JSON.stringify(body));
      args.push('-H', 'Content-Type: application/json', '--data-binary', `@${join(dir, 'req.json')}`);
    }
    if (nonce) args.push('-H', `X-WP-Nonce: ${nonce}`);
    args.push(`${SITE}${path}`);
    const status = Number(execFileSync('curl', args, { encoding: 'utf8' }));
    const text = readFileSync(join(dir, 'body'), 'utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* a page */ }
    return { status, json, text };
  }

  function player(tag) {
    const jar = join(dir, `${tag}.jar`);
    writeFileSync(jar, '');
    const email = `zz-chatnav-${tag}-${process.pid}@groddle.localhost`;
    const pass = `zz-chatnav-${tag}-${process.pid}-pw`;
    const name = `Zz Nav ${tag.toUpperCase()} ${process.pid % 10000}`;
    const p = { id: 0, email, pass, name, jar, nonce: '' };
    let r = curl(p, 'POST', '/wp-json/groddle/v1/players', { email, password: pass, name });
    if (r.status === 202) throw new Error('sign-ups are held for email here; this test needs the local site\'s direct sign-up');
    assert.equal(r.status, 201, r.text);
    made.push(r.json.player.id);
    p.id = r.json.player.id;
    p.nonce = curl(p, 'GET', '/wp-admin/admin-ajax.php?action=rest-nonce').text.trim();
    return p;
  }

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'groddle-chatnav-'));
    A = player('a');
    B = player('b');
    // B's lines in Global Chat (enough to scroll), one with a reply in its thread; an IM from B to A; A and B buddies.
    const now = Date.now() - 60 * 60 * 1000;
    const rows = [];
    for (let i = 0; i < 40; i += 1) rows.push(`(${BASE_LID + i}, 'global', ${B.id}, '${B.name}', 'Line ${i} for the chat-nav test', ${now + i * 1000}, 0, 0, 0)`);
    rows.push(`(${BASE_LID + 40}, 'global', ${B.id}, '${B.name}', 'A reply in the thread', ${now + 41000}, 0, 0, ${PARENT})`);
    sql(`INSERT INTO wp_groddle_chat_lines (lid, room, author_id, name, text, at_ms, web, changed_ms, parent_lid) VALUES ${rows.join(', ')}`);
    const [lo, hi] = [Math.min(A.id, B.id), Math.max(A.id, B.id)];
    sql(`INSERT INTO wp_groddle_im_lines (a_id, b_id, line_id, from_id, text, at_ms, parent_id) VALUES (${lo}, ${hi}, 1, ${B.id}, 'Hello from B', ${Date.now() - 1000}, 0)`);
    assert.equal(curl(A, 'POST', '/wp-json/groddle/v1/buddies?keepNew=1', { id: B.id }).status, 201);
    // A's topic with B's reply (a notification for A that points at a post), long enough to scroll.
    const long = (w) => Array.from({ length: 20 }, (_, i) => `${w} paragraph ${i + 1}, written for the chat-nav test so the topic is taller than the window.`).join('\n\n');
    const made2 = curl(A, 'POST', '/wp-json/groddle/v1/community/boards/off-topic/threads', { title: 'Chat nav test topic', body: long('Opening') });
    assert.equal(made2.status, 201, made2.text);
    const replied = curl(B, 'POST', `/wp-json/groddle/v1/community/threads/${made2.json.thread.id}/posts`, { body: long('Reply') });
    assert.equal(replied.status, 201, replied.text);
    mine = { path: made2.json.thread.url, post: replied.json.post.id };
    topic = sql("SELECT CONCAT('/chat/', board, '/', id, '-') FROM wp_groddle_community_threads WHERE status = 'open' AND board = 'general' ORDER BY id LIMIT 1");
  });

  after(() => {
    const cols = sql("SELECT CONCAT(table_name, ' ', column_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name LIKE 'wp\\_groddle\\_%' AND column_name REGEXP '(user_id|author_id|^a_id|^b_id|from_id|to_id|owner_id|holder_id|visitor_id|dropper_id|taker_id|buyer_id|seller_id|buddy_id|ignored_id)$'").split('\n').filter(Boolean);
    const ids = made.filter((id) => id > 1 && id !== 54);
    if (ids.length) {
      sql(cols.map((l) => { const [t, c] = l.split(' '); return `DELETE FROM ${t} WHERE ${c} IN (${ids.join(',')});`; }).join(' '));
      for (const id of ids) wp('user', 'delete', String(id), '--yes');
      let left = 0;
      for (const l of cols) { const [t, c] = l.split(' '); left += Number(sql(`SELECT COUNT(*) FROM ${t} WHERE ${c} IN (${ids.join(',')})`)); }
      left += Number(sql(`SELECT COUNT(*) FROM wp_users WHERE ID IN (${ids.join(',')})`));
      assert.equal(left, 0, 'every row of the throwaways is gone');
    }
    sql("DELETE FROM wp_groddle_signups WHERE email LIKE 'zz-chatnav-%'");
    rmSync(dir, { recursive: true, force: true });
  });

  it('the server draws /chat/?c=help as Live Help without JavaScript', () => {
    const page = curl(A, 'GET', '/chat/?c=help').text;
    assert.match(page, /<a class="cx-row" href="\/chat\/\?c=help" data-cx-open="chan:help" aria-current="true">/);
    assert.match(page, /<h2 class="cx-head-name" id="cx-conv-title" data-cx-head-name>Live Help<\/h2>/);
  });

  it('a signed-in player and a visitor move everywhere in place; Back and Forward bring each view back', { timeout: 240000 }, async (t) => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { browser, close } = await openBrowser({ label: 'chat-nav test' });
    const shots = process.env.GRODDLE_CHAT_NAV_SHOTS || '';
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
      // Count the sockets the page opens: a move must not open another.
      await ctx.addInitScript(() => {
        const Real = window.WebSocket;
        window.__sockets = 0;
        window.WebSocket = class extends Real { constructor(...a) { super(...a); window.__sockets += 1; } };
      });
      const r = await ctx.request.post(`${SITE}/wp-json/groddle/v1/session`, { data: { email: A.email, password: A.pass, remember: true } });
      assert.equal(r.status(), 200);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let loads = 0;
      page.on('load', () => { loads += 1; });
      await page.goto(`${SITE}/chat/`);
      await page.waitForFunction(() => window.groddleChat && window.groddleNav && document.querySelector('[data-cx-conv="chan:global"] .cchan-line'));
      await page.evaluate(() => { window.__navMark = 'kept'; });
      const startLoads = loads;
      const live = await page.waitForFunction(() => window.groddleChat.live, null, { timeout: 8000 }).then(() => true, () => false);
      const socketsAtStart = await page.evaluate(() => window.__sockets);
      t.diagnostic(live ? 'the live socket connected' : 'the live socket did not connect here: the same-socket check is skipped');

      /** After a move: the same document (the marker), no new load, the address, and what the view must show. */
      async function moved(what, path, check) {
        await page.waitForFunction((p) => location.pathname + location.search + location.hash === p, path, { timeout: 8000 }).catch(() => {});
        await page.waitForFunction(() => !document.querySelector('main[data-cx-moving]'));
        assert.equal(await page.evaluate(() => location.pathname + location.search + location.hash), path, `${what}: the address`);
        assert.equal(await page.evaluate(() => window.__navMark), 'kept', `${what}: the page did not reload`);
        assert.equal(loads, startLoads, `${what}: no new load`);
        if (check) await page.waitForFunction(check, null, { timeout: 8000 }).catch(() => assert.fail(`${what}: ${check}`));
      }
      const heading = (words) => `document.querySelector('#cx-conv-title')?.textContent === ${JSON.stringify(words)} && document.activeElement?.id === 'cx-conv-title'`;
      const railMark = (key) => `document.querySelector('.cx-rail [aria-current]')?.dataset.cxOpen === ${JSON.stringify(key)}`;

      // Channels, an IM, buddies.
      await page.click('.cx-rail [data-cx-open="chan:help"]');
      await moved('Live Help', '/chat/?c=help', `${heading('Live Help')} && ${railMark('chan:help')} && document.title.startsWith('Live Help')`);
      await page.click('.cx-rail [data-cx-open="chan:global"]');
      await moved('Global Chat', '/chat/?c=global', `${railMark('chan:global')} && document.querySelectorAll('[data-cx-conv="chan:global"] .cchan-line').length >= 40`);
      // A place in Global, up from the newest line.
      const place = await page.evaluate(() => { const log = document.querySelector('[data-cx-conv="chan:global"] [data-cx-log]'); log.scrollTop = Math.max(60, log.scrollHeight - log.clientHeight - 300); return log.scrollTop; });
      await page.waitForSelector(`.cx-rail [data-cx-open="im:${B.id}"]`);
      await page.click(`.cx-rail [data-cx-open="im:${B.id}"]`);
      await moved('the IM', `/chat/?im=${B.id}`, `${railMark('im:' + B.id)} && document.querySelector('[data-cx-conv="im:${B.id}"] .cchan-line')`);
      await page.click('.cx-rail [data-cx-open="chan:global"]');
      await moved('back to Global', '/chat/?c=global', `Math.abs(document.querySelector('[data-cx-conv="chan:global"] [data-cx-log]').scrollTop - ${place}) < 4`);
      // A line's thread, open and closed, each an address.
      await page.click(`[data-cx-conv="chan:global"] [data-cx-replies="${PARENT}"]`);
      await moved('the thread', `/chat/?c=global#t${PARENT}`, `!document.querySelector('[data-cx-thread]').hidden && document.querySelectorAll('[data-cx-thread-lines] .cchan-line').length === 1`);
      await page.click('[data-cx-thread] .cx-x');
      await moved('the thread closed', '/chat/?c=global', 'document.querySelector("[data-cx-thread]").hidden');
      await page.goBack();
      await moved('Back: the thread again', `/chat/?c=global#t${PARENT}`, '!document.querySelector("[data-cx-thread]").hidden');
      await page.goBack();
      await moved('Back: closed', '/chat/?c=global', 'document.querySelector("[data-cx-thread]").hidden');
      await page.goBack();
      await moved('Back: the IM', `/chat/?im=${B.id}`, `document.querySelector('[data-cx-conv="im:${B.id}"]') && ${railMark('im:' + B.id)}`);
      await page.goForward();
      await moved('Forward: Global, where it was', '/chat/?c=global', `${railMark('chan:global')} && Math.abs(document.querySelector('[data-cx-conv="chan:global"] [data-cx-log]').scrollTop - ${place}) < 4`);
      // Who's around opens and closes in place; a buddy's IM button opens the IM with its box focused.
      await page.click('[data-cx-conv] [data-cx-around-open]');
      await moved('Who\'s around', '/chat/?c=global');
      await page.click('[data-cx-conv] [data-cx-around-open]');
      await page.click(`[data-cx-buddy="${B.id}"] button`);
      await moved('a buddy\'s IM', `/chat/?im=${B.id}`, 'document.activeElement?.id === "cchan-text"');

      // The boards: a board, a topic, Back and Forward across a board and a conversation.
      await page.click('.cx-rail a[href="/chat/general/"]');
      await moved('the General board', '/chat/general/', `${heading('General')} && document.querySelector('.cx-rail a[href="/chat/general/"]').getAttribute('aria-current') === 'page' && !document.querySelector('.cx-rail [data-cx-open][aria-current]') && document.title.startsWith('General')`);
      const topicPath = await page.$eval('.cthread-row', (a) => new URL(a.href).pathname);
      await page.click('.cthread-row');
      assert.ok(topicPath.startsWith(topic), `the topic ${topicPath}`);
      await moved('a topic', topicPath, 'document.querySelector("[data-community-posts] .cpost") && document.querySelector("main").dataset.thread > 0');
      if (shots) await page.screenshot({ path: join(shots, 'after-player-topic.png') });
      await page.goBack();
      await moved('Back: the board', '/chat/general/', 'document.querySelector(".cthread-row") && !document.querySelector("main").dataset.thread');
      await page.goBack();
      await moved('Back: the IM, from a board', `/chat/?im=${B.id}`, `document.querySelector('[data-cx-conv="im:${B.id}"]')`);
      await page.goForward();
      await moved('Forward: the board', '/chat/general/', 'document.querySelector(".cthread-row")');
      await page.goForward();
      await moved('Forward: the topic', topicPath, 'document.querySelector("[data-community-posts]")');
      // From a topic: a channel, then a board's new-topic form, then an IM from the rail.
      await page.click('.cx-rail [data-cx-open="chan:global"]');
      await moved('Global from a topic', '/chat/?c=global', `${railMark('chan:global')} && !document.querySelector('[data-community-posts]')`);
      await page.click('.cx-rail a[href="/chat/ideas/"]');
      await moved('the Ideas board', '/chat/ideas/', heading('Ideas'));
      await page.click('a[href="/chat/ideas/new/"]');
      await moved('Start a topic', '/chat/ideas/new/', 'document.querySelector("form[data-community-new]")');
      await page.click(`.cx-rail [data-cx-open="im:${B.id}"]`);
      await moved('the IM from the form', `/chat/?im=${B.id}`);
      // The header's Community link and the phone's "Chats" link go to /chat/ in place.
      await page.click('.site-nav-links a[href="/chat/"]');
      await moved('the Community link', '/chat/', railMark('chan:global'));

      // The bell: B's IM opens in place.
      await page.click('.cx-rail [data-cx-open="chan:help"]');
      await moved('Live Help again', '/chat/?c=help');
      await page.click('[data-notif-open]');
      await page.waitForSelector(`[data-notif-key="im:${B.id}"] .notif-row`);
      await page.click(`[data-notif-key="im:${B.id}"] .notif-row`);
      await moved('the bell\'s IM', `/chat/?im=${B.id}`, `document.querySelector('[data-cx-conv="im:${B.id}"]')`);

      // The bell: a reply in A's topic opens the topic in place at that post.
      await page.click('[data-notif-open]');
      await page.waitForSelector('[data-notif-key][data-kind="reply"] .notif-row');
      await page.click('[data-notif-key][data-kind="reply"] .notif-row');
      await moved('the bell\'s reply', `${mine.path}#post-${mine.post}`, `(() => { const p = document.getElementById('post-${mine.post}'); const log = document.querySelector('.cx-log'); const at = p?.getBoundingClientRect().top; const box = log.getBoundingClientRect(); return p && log.scrollTop > 0 && at >= box.top - 2 && at < box.bottom - 40; })()`);
      // A page keeps its place for Back.
      const topicPlace = await page.evaluate(() => { const log = document.querySelector('.cx-log'); log.scrollTop = Math.round((log.scrollHeight - log.clientHeight) / 3); return log.scrollTop; });
      assert.ok(topicPlace > 0, 'the topic scrolls');
      await page.waitForTimeout(500);
      await page.click(`.cx-rail [data-cx-open="im:${B.id}"]`);
      await moved('the IM from the topic', `/chat/?im=${B.id}`);
      await page.goBack();
      await moved('Back: the topic where it was', `${mine.path}#post-${mine.post}`, `Math.abs(document.querySelector('.cx-log').scrollTop - ${topicPlace}) < 4`);
      await page.goForward();
      await moved('Forward: the IM', `/chat/?im=${B.id}`);

      // Cmd-click and the middle button still open a new tab; this one stays.
      for (const how of [{ modifiers: ['Meta'] }, { button: 'middle' }]) {
        const tab = ctx.waitForEvent('page', { timeout: 8000 });
        await page.click('.cx-rail a[href="/chat/bugs/"]', how);
        const opened = await tab;
        await opened.waitForLoadState();
        assert.equal(new URL(opened.url()).pathname, '/chat/bugs/', `${JSON.stringify(how)} opens the board in a new tab`);
        await opened.close();
        await moved(`${JSON.stringify(how)} leaves this tab`, `/chat/?im=${B.id}`);
      }
      if (live) assert.equal(await page.evaluate(() => window.__sockets), socketsAtStart, 'the live socket stayed the same one');
      assert.equal(await page.evaluate(() => window.groddleChat.live), live, 'and stayed connected');
      if (shots) await page.screenshot({ path: join(shots, 'after-player-im.png') });

      // A reload of a moved-to address draws it (the server): a topic, a channel.
      await page.goto(`${SITE}${topicPath}`);
      await page.waitForSelector('[data-community-posts] .cpost');
      await page.goto(`${SITE}/chat/?c=help`);
      await page.waitForFunction(() => window.groddleChat?.open === 'chan:help');
      assert.deepEqual(errors, [], 'no script errors');

      // A phone: the list is one screen, a conversation or a page another; "Chats" goes back, in place.
      const phone = await ctx.newPage();
      await phone.setViewportSize({ width: 390, height: 844 });
      let ploads = 0;
      phone.on('load', () => { ploads += 1; });
      phone.on('pageerror', (e) => errors.push(e.message));
      await phone.goto(`${SITE}/chat/`);
      await phone.waitForFunction(() => window.groddleChat && window.groddleNav);
      await phone.evaluate(() => { window.__navMark = 'kept'; });
      const p0 = ploads;
      const pmoved = async (what, path, view) => {
        await phone.waitForFunction((x) => location.pathname + location.search === x, path, { timeout: 8000 }).catch(() => {});
        await phone.waitForFunction(() => !document.querySelector('main[data-cx-moving]'));
        assert.equal(await phone.evaluate(() => location.pathname + location.search), path, `phone, ${what}: the address`);
        assert.equal(await phone.evaluate(() => window.__navMark), 'kept', `phone, ${what}: no reload`);
        assert.equal(ploads, p0, `phone, ${what}: no new load`);
        assert.equal(await phone.evaluate(() => document.querySelector('main').dataset.cxView), view, `phone, ${what}: the ${view} screen`);
      };
      assert.equal(await phone.evaluate(() => document.querySelector('main').dataset.cxView), 'list');
      await phone.click('.cx-rail [data-cx-open="chan:global"]');
      await pmoved('Global', '/chat/?c=global', 'main');
      await phone.click('[data-cx-conv] .cx-back');
      await pmoved('Chats', '/chat/', 'list');
      await phone.goBack();
      await pmoved('Back: Global', '/chat/?c=global', 'main');
      await phone.goBack();
      await pmoved('Back: the list', '/chat/', 'list');
      await phone.click('.cx-rail a[href="/chat/general/"]');
      await pmoved('a board', '/chat/general/', 'main');
      await phone.click('.cthread-row');
      await pmoved('a topic', topicPath, 'main');
      await phone.click('.cx-topic .cx-back');
      await pmoved('the topic\'s back: its board', '/chat/general/', 'main');
      await phone.click('.cx-board .cx-back');
      await pmoved('the board\'s back: the list', '/chat/', 'list');
      if (shots) await phone.screenshot({ path: join(shots, 'after-phone-list.png') });
      assert.deepEqual(errors, [], 'no script errors on a phone');
      await ctx.close();

      // A visitor reads the boards in place.
      const vctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
      const v = await vctx.newPage();
      let vloads = 0;
      v.on('load', () => { vloads += 1; });
      v.on('pageerror', (e) => errors.push(e.message));
      await v.goto(`${SITE}/chat/`);
      await v.waitForFunction(() => window.groddleNav);
      await v.evaluate(() => { window.__navMark = 'kept'; });
      const v0 = vloads;
      const vmoved = async (what, path, check) => {
        await v.waitForFunction((p) => location.pathname + location.search === p, path, { timeout: 8000 }).catch(() => {});
        await v.waitForFunction(() => !document.querySelector('main[data-cx-moving]'));
        assert.equal(await v.evaluate(() => location.pathname + location.search), path, `visitor, ${what}: the address`);
        assert.equal(await v.evaluate(() => window.__navMark), 'kept', `visitor, ${what}: no reload`);
        assert.equal(vloads, v0, `visitor, ${what}: no new load`);
        if (check) await v.waitForFunction(check, null, { timeout: 8000 }).catch(() => assert.fail(`visitor, ${what}: ${check}`));
      };
      await v.click('.cx-pane a[href="/chat/general/"]');
      await vmoved('a board from the list', '/chat/general/', 'document.querySelector("#cx-conv-title").textContent === "General"');
      await v.click('.cthread-row');
      await vmoved('a topic', topicPath, 'document.querySelector("[data-community-posts] .cpost")');
      if (shots) await v.screenshot({ path: join(shots, 'after-visitor-topic.png') });
      await v.click('.cx-rail a[href="/chat/ideas/"]');
      await vmoved('another board', '/chat/ideas/', 'document.querySelector("#cx-conv-title").textContent === "Ideas"');
      await v.goBack();
      await vmoved('Back: the topic', topicPath, 'document.querySelector("[data-community-posts]")');
      await v.goBack();
      await vmoved('Back: the board', '/chat/general/', 'document.querySelector(".cthread-row")');
      await v.goBack();
      await vmoved('Back: the boards', '/chat/', 'document.querySelector(".cx-boards")');
      assert.deepEqual(errors, [], 'no script errors for a visitor');
      await vctx.close();
    } finally {
      await close();
    }
  });
});
