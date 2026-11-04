/**
 * The Community boards (Austin 2026-11-04: "threaded longer form conversations ... a true community
 * for the game"), the site's /chat/ (groddle-afternoon-site src/Community.php, CommunityPages.php,
 * CommunityText.php, AdminCommunity.php, community/community.js; the console's Community tab), and
 * what the game does with their notices (js/community-notices.js, features/community-mp-feature.js).
 * Glitch had forums with the same six boards (glitchthegame.com/forum/, Wayback forum root).
 *
 * The site's pure rules run here through php -r: links follow the chat's rule (js/chat-links.js,
 * compared case by case), the limits, the words. The routes are checked from their source (who may
 * call them); the live flow (two throwaway players posting, quoting, reacting, reporting, blocking,
 * the console removing and stopping) was run on groddle.localhost by hand.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { reactionsFile, reactionsJson } from '../tools/build-reactions.mjs';
import { linkSegments } from '../public/js/chat-links.js?v=b717fac7';
import { NAMES_SHOWN, REACTIONS } from '../public/js/chat-reactions.js?v=d65d555b';
import { NOTICE_MAX, communityNoticeHtml, communityNoticesFrom, normalCommunityNotice } from '../public/js/community-notices.js?v=f676c372';
import { communityMpFeature, createCommunitySession } from '../public/js/features/community-mp-feature.js?v=ff546ed0';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipPhp = skipWithoutSite || (!hasPhp && 'no php');

function php(body) {
  const code = `foreach (['WordFilter', 'BugReports', 'AdminConsole', 'CommunityText'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\CommunityText as T; echo json_encode(${body}, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}
const phpString = (s) => `base64_decode('${Buffer.from(s).toString('base64')}')`;

describe('the game logs the boards\' notices in Activity (js/community-notices.js)', () => {
  const good = { id: 4, kind: 'reply', count: 1, from: 'Ada', text: 'Ada replied to your thread “Hats” on the Community boards.', url: '/chat/general/7-hats/#post-12' };

  it('keeps a notice the site sent, and only a link to a post on the boards', () => {
    assert.deepEqual(normalCommunityNotice(good), { id: 4, text: good.text, url: good.url });
    assert.equal(normalCommunityNotice({ ...good, url: 'https://evil.example/' }), null);
    assert.equal(normalCommunityNotice({ ...good, url: 'javascript:alert(1)' }), null);
    assert.equal(normalCommunityNotice({ ...good, url: '/chat/general/7-hats/?page=2#post-12' }).url, '/chat/general/7-hats/?page=2#post-12');
    assert.equal(normalCommunityNotice({ ...good, id: 0 }), null);
    assert.equal(normalCommunityNotice({ ...good, text: '  ' }), null);
    assert.equal(communityNoticesFrom({ notices: Array.from({ length: 9 }, (_, i) => ({ ...good, id: i + 1 })) }).length, NOTICE_MAX);
    assert.deepEqual(communityNoticesFrom(null), []);
  });

  it('the line is escaped, with a link that opens the post in a new tab', () => {
    const html = communityNoticeHtml({ id: 1, text: 'Bo <b>quoted</b> you in “<i>x</i>”', url: '/chat/ideas/3-x/#post-9' });
    assert.match(html, /^Bo &lt;b&gt;quoted&lt;\/b&gt; you in “&lt;i&gt;x&lt;\/i&gt;” <a class="chat-link" data-chat-link="home" href="\/chat\/ideas\/3-x\/#post-9" target="_blank" rel="noopener">Read it<\/a>$/);
  });

  it('a session logs each notice once, waits before its first ask, and solo asks nothing', async () => {
    let t = 1000;
    let asked = 0;
    const lines = [];
    const engine = { notify: { log: (text, o) => lines.push([text, o.html]) }, setData() {} };
    const account = { async communityNotices() { asked += 1; return { notices: [good, good] }; } };
    const s = createCommunitySession(engine, account, { now: () => t });
    s.tick(t);
    assert.equal(asked, 0, 'not at once');
    t += 20000;
    s.tick(t);
    await new Promise((r) => setImmediate(r));
    assert.equal(asked, 1);
    assert.equal(lines.length, 1, 'the same id twice logs once');
    s.tick(t + 1000);
    assert.equal(asked, 1, 'not again before the poll');
    const solo = { mode: 'solo', started: true };
    communityMpFeature.onTick(16, 0, solo);
    assert.equal(globalThis.groddleCommunity, undefined);
  });

  it('the feature sits before street-objects in features/index.js, and the account asks the right route', () => {
    const index = read('public/js/features/index.js');
    assert.ok(index.indexOf('community-mp-feature.js') > 0 && index.indexOf('community-mp-feature.js') < index.indexOf('street-objects-feature.js'));
    assert.match(read('public/js/minn-account.js'), /async communityNotices\(\) \{\s*return buddyCall\('Checking the Community boards', 'community\/notices\/game', \{ method: 'POST' \}\);/);
  });
});

describe('the boards\' words and links (groddle-afternoon-site src/CommunityText.php)', { skip: skipPhp }, () => {
  it('links follow the chat\'s rule, case for case with js/chat-links.js', () => {
    const cases = [
      'see https://groddleafternoon.com/contribute/ now',
      'www.example.com/x?y=1. and (https://a.org/b)',
      'groddleafternoon.com/chat/ and groddleafternoon.com.evil.net',
      'javascript:alert(1) data:text/html,x https://user:pw@evil.com https://groddleafternoon.com@evil.com',
      'xhttps://a.com nothttps://b.com http://plain.org/path_(x)',
      'https://example.com/~me#frag, https://a.com/[x]] https://b.com/"q"',
      `https://long.com/${'a'.repeat(420)}`,
      'no links at all, just words: www. and https://',
      'émoji 🎉 https://ünicode.com https://xn--nicode-2ya.com/',
      'https://a.com:8080/x https://b.com:443/y',
    ];
    for (const text of cases) {
      const js = linkSegments(text).map((s) => (s.href ? [s.text, s.host, s.home] : [s.text]));
      const p = php(`array_map(fn ($s) => isset($s['href']) ? [$s['text'], $s['host'], $s['home']] : [$s['text']], T::linkSegments(${phpString(text)}))`);
      assert.deepEqual(p, js, text);
    }
  });

  it('a post is drawn escaped, with paragraphs, line breaks and safe links', () => {
    const html = php(`T::bodyHtml(${phpString('Hi <script>x</script>\nline two\n\n\nsee https://example.com/a and groddleafternoon.com/chat/')})`);
    assert.equal(html, '<p>Hi &lt;script&gt;x&lt;/script&gt;<br />line two</p><p>see <a class="chat-link" data-chat-link="away" data-host="example.com" href="https://example.com/a" target="_blank" rel="noopener noreferrer nofollow ugc" title="Opens example.com">https://example.com/a</a> and <a class="chat-link" data-chat-link="home" href="https://groddleafternoon.com/chat/" rel="ugc">groddleafternoon.com/chat/</a></p>');
    assert.doesNotMatch(php(`T::bodyHtml(${phpString('<a href="javascript:x">y</a> " onmouseover="z')})`), /<a href|" onmouseover/);
    assert.match(php(`T::bodyHtml(${phpString('https://groddle.localhost/x')}, T::homeHosts('groddle.localhost'))`), /data-chat-link="home"/);
    assert.match(php(`T::bodyHtml(${phpString('https://groddle.localhost/x')}, T::homeHosts('groddleafternoon.com'))`), /data-chat-link="away"/);
  });

  it('titles and posts are cleaned and word-filtered when written; the limits refuse what is too much', () => {
    assert.equal(php(`T::title(${phpString('  Lost\n my  hat\u0007 you fuck  ')})`), 'Lost my hat you #!@$');
    assert.equal(php(`T::body(${phpString('  hi  \r\n\r\n\r\n\r\n\r\nthere\t!  ')})`), 'hi\n\n\nthere    !');
    assert.equal(php(`T::bodyRefusal('   ')`), 'groddle_community_body');
    assert.equal(php(`T::bodyRefusal(str_repeat('é', 4001))`), 'groddle_community_long');
    assert.equal(php(`T::bodyRefusal(str_repeat('é', 4000))`), null);
    assert.equal(php(`T::titleRefusal('Hi')`), 'groddle_community_title');
    assert.equal(php(`T::slug(${phpString('The Wizard’s & Friends: a really long title that goes on and on beyond sixty')})`), 'the-wizards-and-friends-a-really-long-title-that-goes-on-and');
    assert.equal(php(`T::threadPath('general', 7, '!!!')`), '/chat/general/7/');
    assert.equal(php(`T::threadPath('ideas', 12, 'Bigger packs?')`), '/chat/ideas/12-bigger-packs/');
    // Posts a minute, an hour, a day; tighter for a character under a day old; threads on top.
    assert.equal(php('T::limitRefusal(false, [60 => 4, 3600 => 39, 86400 => 199], [3600 => 3, 86400 => 11])'), null);
    assert.equal(php('T::limitRefusal(false, [60 => 5], null)'), 'groddle_community_slow');
    assert.equal(php('T::limitRefusal(false, [86400 => 200], null)'), 'groddle_community_slow');
    assert.equal(php('T::limitRefusal(true, [60 => 2], null)'), 'groddle_community_new_slow');
    assert.equal(php('T::limitRefusal(true, [3600 => 12], null)'), 'groddle_community_new_slow');
    assert.equal(php('T::limitRefusal(false, [], [3600 => 4])'), 'groddle_community_threads_slow');
    assert.equal(php('T::limitRefusal(true, [], [3600 => 1])'), 'groddle_community_threads_slow');
    assert.deepEqual(php('T::windows()'), [60, 3600, 86400]);
    assert.deepEqual(php('[T::editable(1000, 1900), T::editable(1000, 1901)]'), [true, false], '15 minutes to edit');
  });

  it('the boards are Glitch\'s six, in its order; the words are plain', () => {
    assert.deepEqual(php('array_map(fn ($b) => $b[0], T::BOARDS)'), { announcements: 'Announcements & Events', general: 'General', ideas: 'Ideas', marketplace: 'Marketplace', bugs: 'Bugs', 'off-topic': 'Off Topic' });
    const words = JSON.stringify(php('[T::BOARDS, T::SAID]'));
    assert.doesNotMatch(words, /[—–]/);
    assert.doesNotMatch(words, /Glitch/);
    for (const f of ['src/CommunityPages.php', 'community/community.js', 'src/AdminCommunity.php']) assert.doesNotMatch(readFileSync(sitePath(f), 'utf8').replace(/^\s*(\*|\/\/|\/\*).*$/gm, ''), /—/, f);
  });

  it('the reactions are the chat\'s set, from one place (tools/build-reactions.mjs writes data/reactions.json)', () => {
    assert.equal(readFileSync(reactionsFile(), 'utf8'), reactionsJson(), 'run node tools/build-reactions.mjs');
    const set = php('array_map(fn ($r) => [$r[0], $r[1], $r[2]], T::reactions())');
    assert.deepEqual(Object.keys(set), REACTIONS.map((r) => r.key));
    for (const r of REACTIONS) assert.deepEqual(set[r.key], [r.glyph, r.label, r.art ? `/${r.art}` : '']);
    const names = Array.from({ length: NAMES_SHOWN + 2 }, (_, i) => `P${i}`);
    assert.equal(php(`T::reactionLabel('like', ${JSON.stringify(names).replace(/"/g, "'")})`), `Thumbs up: ${names.slice(0, NAMES_SHOWN).join(', ')} and 2 others`);
    assert.deepEqual(php("[T::isReaction('hi'), T::isReaction('nope'), T::isReaction(1)]"), [true, false, false]);
  });
});

describe('the routes (src/Community.php, CommunityPages.php, AdminCommunity.php)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('reads are open, writes need a signed-in player, the console needs manage_options', () => {
    const c = src('src/Community.php');
    for (const [m, path] of [['Get', 'community/boards'], ['Get', 'community/boards/{board:[a-z-]+}'], ['Get', 'community/threads/{id:\\d+}'], ['Get', 'community/threads/{id:\\d+}/updates']]) {
      assert.ok(c.includes(`#[Route(Method::${m}, '/groddle/v1/${path}', policy: new Policy(Access::Public))]`), path);
    }
    for (const [m, path] of [['Post', 'community/boards/{board:[a-z-]+}/threads'], ['Post', 'community/threads/{id:\\d+}/posts'], ['Put', 'community/posts/{id:\\d+}'], ['Delete', 'community/posts/{id:\\d+}'], ['Post', 'community/posts/{id:\\d+}/reactions'], ['Post', 'community/posts/{id:\\d+}/report'], ['Get', 'community/notices'], ['Post', 'community/notices/read'], ['Post', 'community/notices/game']]) {
      assert.ok(c.includes(`#[Route(Method::${m}, '/groddle/v1/${path}', policy: new Policy(Access::SignedIn))]`), path);
    }
    const a = src('src/AdminCommunity.php');
    assert.equal((a.match(/#\[Route\(/g) || []).length, 6);
    assert.equal((a.match(/policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/g) || []).length, 6);
    assert.match(a, /private const ADMIN = 'manage_options';/);
    // Administrators are never stopped; the caller never stops themselves.
    assert.match(a, /groddle_admin_ban_admin/);
    assert.match(a, /groddle_admin_self/);
    // A post's JSON names the character, never a login or an email.
    assert.doesNotMatch(c.slice(c.indexOf('public static function postOut')), /user_login|user_email|->email/);
    const ext = src('src/Extension.php');
    assert.match(ext, /routes\(new CommunityPages\(\$minn\)\)/);
    assert.match(ext, /new Community\(\$minn\), new AdminCommunity\(\$minn\)/);
  });

  it('posting checks the account, the stop, the limits, the lock; a block hides a post from the one who blocks', () => {
    const c = src('src/Community.php');
    assert.match(c, /AdminConsole::banned\(\$db, \$viewer\['id'\]\) !== null/);
    assert.match(c, /\$this->stopped\(\$viewer\['id'\]\) !== null/);
    assert.match(c, /CommunityText::limitRefusal\(\$new, \$counts/);
    assert.match(c, /'groddle_community_locked', 409/);
    assert.match(c, /\$r\['blocked'\] = isset\(\$blocks\[\$author\]\);/);
    assert.match(c, /SELECT 1 FROM \{\$ignores\} WHERE user_id = \? AND ignored_id = \?/, 'no notice from a player you block');
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /'blocked' => 'A post from a player you blocked'/);
    assert.match(pages, /<details class="cpost-blocked">/);
    // The forms without JavaScript check the page's nonce.
    assert.match(pages, /Nonce::verify\(\$nonce, \$reader->userId, \$reader->sessionToken\)/);
  });

  it('the tables are declared, additive, and the reports go to the tickets', () => {
    const tables = JSON.parse(src('minn.json')).tables;
    for (const t of ['boards', 'threads', 'posts', 'reactions', 'reports', 'edits', 'bans', 'notices']) assert.ok(Array.isArray(tables[`groddle_community_${t}`]), t);
    assert.match(src('src/Community.php'), /\$store->open\(\$viewer\['id'\], \$message, BugReports::context\(\['page' => "community-post:\{\$id\}"\]\), \$now\)/);
  });

  it('the header carries the unread count on the Community link (SiteNav)', () => {
    const nav = src('src/SiteNav.php');
    assert.match(nav, /public const COMMUNITY = '\/chat\/';/);
    assert.match(nav, /'<span class="site-nav-badge"><span class="visually-hidden">, <\/span>' \. \(\$n > 9 \? '9\+' : \$n\) \. '<span class="visually-hidden"> new<\/span><\/span>'/);
  });

  it('the console has a Community tab', () => {
    const page = src('src/AdminConsolePage.php');
    assert.match(page, /data-console-tab="community">Community/);
    const js = src('console/console.js');
    for (const k of ['comm_remove', 'comm_restore', 'comm_pin', 'comm_lock', 'comm_stop', 'comm_unstop']) assert.ok(js.includes(`case '${k}'`), k);
    assert.match(js, /admin\/community_posts\?show=/);
  });
});
