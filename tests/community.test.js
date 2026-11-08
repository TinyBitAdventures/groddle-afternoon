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
import { pathToFileURL } from 'node:url';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { reactionsFile, reactionsJson } from '../tools/build-reactions.mjs';
import { linkSegments } from '../public/js/chat-links.js?v=b717fac7';
import { NAMES_SHOWN, REACTIONS } from '../public/js/chat-reactions.js?v=d65d555b';
import { NOTICE_MAX, communityNoticeHtml, communityNoticesFrom, normalCommunityNotice } from '../public/js/community-notices.js?v=f676c372';
import { EARLIER_MAX, WEB_TAG, chatLine, historyKey, mergeEarlier, oldestLid, shownName } from '../public/js/groups.js?v=07640c71';
import { mergeEarlierIms, oldestAt } from '../public/js/player-im.js?v=23463a96';
import { communityMpFeature, createCommunitySession } from '../public/js/features/community-mp-feature.js?v=7ad7355e';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipPhp = skipWithoutSite || (!hasPhp && 'no php');

function php(body) {
  const code = `foreach (['WordFilter', 'BugReports', 'AdminConsole', 'CommunityText', 'Community', 'ChatHistory', 'Notifications', 'CommunityPages'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\CommunityText as T; use Groddle\\Minn\\ChatHistory; use Groddle\\Minn\\Notifications as N; use Groddle\\Minn\\CommunityPages as P; echo json_encode(${body}, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);`;
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

describe('the game\'s chat kept for good, on the website and in the drawer (ChatHistory, groups.js, player-im.js)', () => {
  it('a line said on the website shows (web) after the name in the game', () => {
    const l = chatLine({ id: 7, name: 'Ada', text: 'hi', at: 5, lid: 9, web: true });
    assert.equal(l.web, true);
    assert.equal(shownName(l), `Ada ${WEB_TAG}`);
    assert.equal(shownName(chatLine({ id: 7, name: 'Ada', text: 'hi', lid: 9 })), 'Ada');
    assert.equal(chatLine({ id: 7, name: 'Ada', text: 'hi', web: 'yes' }).web, false);
    const feature = read('public/js/features/groups-feature.js');
    assert.match(feature, /name: shownName\(line\)/, 'the drawer');
    assert.match(feature, /el\('b', \{\}, `\$\{shownName\(line\)\}: `\)/, 'the old chat box');
  });

  it('earlier channel lines come from the site, before the oldest one, each once, blocks left out', () => {
    assert.deepEqual(['global', 'help', 'trade', 'group:12', 'street', 'party'].map(historyKey), ['global', 'help', 'trade', 'group-12', '', '']);
    const have = [{ id: 7, name: 'Ada', text: 'c', at: 3, lid: 30 }, { id: 9, name: 'Bo', text: 'd', at: 4, lid: 40 }];
    assert.equal(oldestLid(have), 30);
    const site = [{ lid: 30, id: 7, name: 'Ada', text: 'c', at: 3 }, { lid: 20, id: 11, name: 'Cy', text: 'b', at: 2 }, { lid: 10, id: 7, name: 'Ada', text: 'a', at: 1 }];
    assert.deepEqual(mergeEarlier(have, site).map((l) => l.lid), [10, 20, 30, 40]);
    assert.deepEqual(mergeEarlier(have, site, { hidden: (id) => id === 11 }).map((l) => l.lid), [10, 30, 40]);
    const many = Array.from({ length: 300 }, (_, i) => ({ lid: i + 1, id: 7, name: 'Ada', text: 'x', at: i }));
    assert.equal(mergeEarlier([], many).length, EARLIER_MAX);
    const feature = read('public/js/features/groups-feature.js');
    assert.match(feature, /account\.chatEarlier\(historyKey\(channel\), oldestLid\(chat\.lines\)/);
    assert.match(feature, /pushLine\(chat\.lines, line, chat\.earlier \? EARLIER_MAX : undefined\)/, 'new lines do not push the earlier ones out at once');
  });

  it('earlier IM lines come from the site for the conversation, by id and time', () => {
    const have = [{ id: 1, from: 7, text: 'new', at: 500 }];
    assert.equal(oldestAt(have), 500);
    const site = [{ id: 1, from: 7, text: 'new', at: 500 }, { id: 3, from: 9, text: 'old conv', at: 200 }, { id: 1, from: 7, text: 'older conv', at: 100 }];
    assert.deepEqual(mergeEarlierIms(have, site).map((l) => l.text), ['older conv', 'old conv', 'new']);
    assert.match(read('public/js/minn-account.js'), /`chat\/ims\/\$\{Math\.floor\(Number\(withId\)\) \|\| 0\}\?before_at=/);
  });
});

describe('who may read the kept chat (src/ChatHistory.php)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');

  it('signed-in players only; the server\'s batches signed; visitors and crawlers get nothing', () => {
    const c = src('src/ChatHistory.php');
    const routes = [...c.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]/g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(routes.map((r) => r[1]), [
      '/groddle/v1/chat/ingest', '/groddle/v1/chat/channels', '/groddle/v1/chat/channels/{key:global|help|trade|group-[1-9][0-9]{0,18}}', '/groddle/v1/chat/channels/{key:global|help|trade}',
      // The website's chat app (Austin 2026-11-04): your IM conversations, an IM written there, threads on channel and IM lines.
      '/groddle/v1/chat/ims', '/groddle/v1/chat/ims/{with:[1-9][0-9]{0,18}}', '/groddle/v1/chat/ims/{with:[1-9][0-9]{0,18}}',
      '/groddle/v1/chat/channels/{key:global|help|trade|group-[1-9][0-9]{0,18}}/threads/{lid:[1-9][0-9]{0,18}}', '/groddle/v1/chat/channels/{key:global|help|trade}/threads/{lid:[1-9][0-9]{0,18}}',
      '/groddle/v1/chat/ims/{with:[1-9][0-9]{0,18}}/threads/{line:[1-9][0-9]{0,18}}',
    ]);
    for (const [, path, access] of routes) assert.equal(access, path.endsWith('/ingest') ? 'Public' : 'SignedIn', path);
    assert.match(c, /ServiceCall::verify\(\$request->header\(ServiceCall::HEADER\), 'POST', '\/groddle\/v1\/chat\/ingest', \$request->body, \$secret, time\(\)\)/);
    assert.match(c, /->withHeader\('Cache-Control', 'private, no-store'\)->withHeader\('X-Robots-Tag', 'noindex'\)/);
    // The page draws the channels only for a signed-in reader; a visitor gets the sign-in line alone.
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /\$channels = \$viewer\['id'\] > 0\s*\? \$this->channelsPanel\(\$viewer, /);
    assert.match(pages, /'channelsSignedOut' => 'Sign in to see what players are saying in the game\.'/);
    assert.doesNotMatch(src('src/SocialTags.php'), /ChatHistory|chat_lines/);
    // Presence and the chat app's people and setting: signed-in players only (Austin 2026-11-04).
    for (const f of ['src/PresenceSetting.php', 'src/ChatPeople.php']) {
      const r = [...src(f).matchAll(/policy: new Policy\(Access::(\w+)\)/g)].map((m) => m[1]);
      assert.ok(r.length > 0 && r.every((x) => x === 'SignedIn'), f);
    }
    // The app's live parts (IMs, buddies, Who's around, the thread panel) are drawn for a signed-in reader only.
    const shell = pages.slice(pages.indexOf('private function shell('));
    assert.match(shell, /if \(\$signed\) \{[\s\S]*data-cx-ims[\s\S]*\}/);
    assert.match(shell, /\$side = '';\s*if \(\$signed\) \{[\s\S]*data-cx-people/);
  });

  it('IMs: only the two players read a conversation; no other code reads the table', () => {
    const c = src('src/ChatHistory.php');
    assert.match(c, /\[\$a, \$b\] = \$me < \$other \? \[\$me, \$other\] : \[\$other, \$me\];/, 'the pair is the reader and the other: nobody else\'s');
    assert.match(c, /WHERE i\.a_id = \? AND i\.b_id = \?/);
    const dir = sitePath('src');
    for (const f of execFileSync('ls', [dir]).toString().trim().split('\n')) {
      if (f === 'ChatHistory.php') continue;
      const text = readFileSync(join(dir, f), 'utf8');
      assert.doesNotMatch(text, /groddle_im_lines|ChatHistory::IMS/, `${f} reads IMs`);
    }
    assert.doesNotMatch(src('console/console.js'), /chat\/ims|im_lines/);
  });

  it('kept reactions read as the chat\'s, blocks and gone accounts left out', { skip: skipPhp }, () => {
    assert.equal(php(`ChatHistory::reactionsJson([['e' => 'like', 'by' => [7, 9, 7, 'x', -1]], ['e' => 'nope', 'by' => [7]], ['e' => 'hi', 'by' => []]])`), '[{"e":"like","by":[7,9]}]');
    assert.equal(php(`ChatHistory::reactionsJson('x')`), null);
    assert.equal(php(`ChatHistory::reactionsJson([])`), '[]');
    const out = php(`ChatHistory::reactionsOut('[{"e":"heart","by":[9]},{"e":"like","by":[7,9,11]}]', [7 => 'Ada', 9 => 'Bo'], [9 => true])`);
    assert.deepEqual(out, [{ e: 'like', by: [{ id: 7, name: 'Ada' }] }], 'the set\'s order; Bo blocked; 11 gone');
    const line = php(`ChatHistory::lineOut(['lid' => 5, 'author_id' => 7, 'name' => 'Old name', 'text' => 'hi', 'at_ms' => 9, 'web' => 1, 'reactions' => null], [7 => 'Ada'], [])`);
    assert.deepEqual(line, { lid: 5, id: 7, name: 'Ada', text: 'hi', at: 9, web: true, r: [] });
  });

  it('the tables are declared; the server repo\'s chatstore.go is the sender', () => {
    const tables = JSON.parse(src('minn.json')).tables;
    assert.ok(tables.groddle_chat_lines.includes('PRIMARY KEY  (lid)'));
    assert.ok(tables.groddle_im_lines.includes('UNIQUE KEY pair_line (a_id,b_id,line_id,at_ms)'));
  });
});

describe('the chat app\'s header, its bell and its right-click menus (/chat/, Austin 2026-11-04)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');
  const pure = () => import(pathToFileURL(sitePath('community/chat-pure.js')).href);

  it('/chat/ draws the chat app\'s layout of the header from the menu, with the bell for a signed-in reader', () => {
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /SiteNav::nav\(SiteNav::links\(\$this->minn, 0\), \$path, \$badges, \['bell' => \$signed \? \(\$badges\[SiteNav::COMMUNITY\] \?\? 0\) : null\]\)/);
    assert.match(src('src/SiteNav.php'), /\$n = \(new Notifications\(\$minn\)\)->unread\(\$reader\);/, 'the Community link counts what the bell counts');
    // Only /chat/ takes the app layout: the other pages keep the centred header.
    for (const f of ['src/PlayerPages.php', 'src/AdminConsolePage.php', 'src/AdminBuilderPage.php']) assert.doesNotMatch(src(f), /'bell' =>/, f);
  });

  it('the notifications are signed-in only, the caller\'s own, and IMs are read through ChatHistory alone', () => {
    const n = src('src/Notifications.php');
    const routes = [...n.matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]/g)].map((m) => m.slice(1));
    assert.deepEqual(routes, [['Get', '/groddle/v1/notifications', 'SignedIn'], ['Post', '/groddle/v1/notifications/read', 'SignedIn']]);
    assert.match(n, /\$user = \$this->minn->user\(\);/);
    assert.doesNotMatch(n, /request->json\(\)\['(?:user|id|player)'\]/, 'never a user from the request');
    assert.match(n, /\$chat->imNotices\(\$me, \$sinceMs, 20, \$seen, \$marks\['all'\]\)/);
    assert.match(src('src/ChatHistory.php'), /public function imNotices\(int \$me, int \$sinceMs, int \$limit = 20, array \$seen = \[\], int \$seenAll = 0\): array/);
    assert.match(src('src/Extension.php'), /new ChatPeople\(\$minn\), new Notifications\(\$minn\)/);
  });

  it('notifications: newest first, unread by their source and both marks; Mark all read clears the keys', { skip: skipPhp }, () => {
    const items = [
      { key: 'bud:7', at: 100 }, { key: 'im:9', at: 300 }, { key: 'n:4', at: 300, unread: false }, { key: 'th:global:5', at: 200 }, { key: 'tk:2', at: 50, unread: true },
    ];
    const merged = php(`N::merge(json_decode('${JSON.stringify(items)}', true), ['all' => 150, 'k' => ['th:global:5' => 250]], 30)`);
    assert.deepEqual(merged.map((i) => [i.key, i.unread]), [['im:9', true], ['n:4', false], ['th:global:5', false], ['bud:7', false], ['tk:2', false]],
      'newest first, ties by key; read by its own row, by its key mark, by Mark all read');
    assert.equal(php(`N::count(N::merge(json_decode('${JSON.stringify(items)}', true), ['all' => 0, 'k' => []], 30))`), 4);
    assert.equal(php(`count(N::merge(json_decode('${JSON.stringify(items)}', true), ['all' => 0, 'k' => []], 2))`), 2);
    assert.deepEqual(php(`N::marks('{"all":10,"k":{"im:9":20,"im:8":5,"x":30,"n:1":"no"}}')`), { all: 10, k: { 'im:9': 20 } }, 'kept keys newer than all, known shapes only');
    assert.deepEqual(php("N::marks('nope')"), { all: 0, k: [] });
    const marked = php("N::marked(['all' => 1, 'k' => ['im:1' => 5, 'im:2' => 6, 'im:3' => 7]], 'im:1', 9, 2)");
    assert.deepEqual(marked, { all: 1, k: { 'im:1': 9, 'im:3': 7 } }, 'the newest kept');
    assert.deepEqual(php("N::marked(['all' => 1, 'k' => ['im:1' => 5]], null, 9, 2)"), { all: 9, k: [] });
    for (const k of ['n:1', 'th:global:12', 'th:trade:3', 'im:9', 'bud:7', 'tk:2']) assert.equal(php(`preg_match(N::KEY, '${k}')`), 1, k);
    for (const k of ['th:group-1:2', 'im:x', 'n:', 'all']) assert.equal(php(`preg_match(N::KEY, '${k}')`), 0, k);
  });

  it('the sample notifications show only on a .localhost site, asked with ?notifdemo=1', { skip: skipPhp }, async () => {
    const ask = (home, host, flag) => php(`P::notifDemo('${home}', '${host}', ${flag === null ? 'null' : `'${flag}'`})`);
    assert.equal(ask('https://groddle.localhost', 'groddle.localhost', '1'), true);
    assert.equal(ask('https://groddle.localhost', 'groddle.localhost:8443', '1'), true);
    assert.equal(ask('https://groddleafternoon.com', 'groddleafternoon.com', '1'), false, 'never live');
    assert.equal(ask('https://groddleafternoon.com', 'groddle.localhost', '1'), false, 'the site\'s own home decides too');
    assert.equal(ask('https://groddle.localhost', 'evil-localhost.com', '1'), false);
    assert.equal(ask('https://groddle.localhost', 'groddle.localhost', '0'), false);
    assert.equal(ask('https://groddle.localhost', 'groddle.localhost', null), false);
    const { demoAllowed, demoNotifications, unreadCount } = await pure();
    assert.equal(demoAllowed('groddle.localhost', true), true);
    assert.equal(demoAllowed('groddleafternoon.com', true), false);
    assert.equal(demoAllowed('groddle.localhost', false), false);
    const demo = demoNotifications(1_800_000_000_000);
    assert.deepEqual([...new Set(demo.map((i) => i.kind))].sort(), ['buddy', 'im', 'quote', 'reply', 'thread', 'ticket']);
    assert.ok(demo.every((i) => i.sample === true), 'each marked as a sample');
    assert.ok(demo.every((i) => !i.from || (i.from.id !== 1 && i.from.id !== 54)), 'never names user 1 or 54');
    assert.ok(unreadCount(demo) > 0 && unreadCount(demo) < demo.length, 'some read, some not');
    const js = src('community/notifications.js');
    assert.match(js, /const demo = demoAllowed\(location\.hostname, document\.body\.hasAttribute\('data-notif-demo'\)\);/);
    assert.match(js, /async function read\(key = null\) \{\n\s*items = markRead\(items, key\);\n[^\n]*\n\s*draw\(\);\n\s*if \(demo\) return true;/, 'samples are read in the page only');
  });

  it('the panel orders and reads them as the site does, and the bell and the Community link show one count', async () => {
    const { sortNotifications, markRead, unreadCount, countLabel } = await pure();
    const list = sortNotifications([{ key: 'b', at: 1, unread: true }, { key: 'a', at: 2, unread: true }, { key: 'c', at: 2, unread: false }]);
    assert.deepEqual(list.map((i) => i.key), ['a', 'c', 'b']);
    assert.equal(unreadCount(markRead(list, 'a')), 1);
    assert.equal(unreadCount(markRead(list)), 0);
    assert.deepEqual([0, 3, 9, 12].map(countLabel), ['', '3', '9', '9+']);
    const js = src('community/notifications.js');
    assert.match(js, /document\.querySelectorAll\('\.site-nav-links a\[href="\/chat\/"\]'\)/, 'the Community link follows the bell');
    // Live where the socket says something (chat-app.js), else a poll; what you are looking at is read.
    const app = src('community/chat-app.js');
    assert.match(app, /if \(m\.t === 'thread_said' \|\| m\.t === 'board_post' \|\| m\.t === 'buddy_added' \|\| \(m\.t === 'im' && Number\(m\.line\?\.from\) !== ME\)\) notif\?\.soon\(\);/);
    assert.match(js, /const POLL_MS = 60 \* 1000;/);
    // The socket's IM or reply under your line shows at once and stands until the site has kept it (its batches come every 3 s).
    assert.match(js, /function hint\(next\) \{/);
    assert.match(js, /if \(got && Number\(got\.at\) >= Number\(h\.at\)\) hinted\.delete\(key\);/);
    assert.match(app, /notif\?\.hint\(\{ key: c\.key, kind: 'im',/);
    assert.match(app, /notif\?\.hint\(\{ key: `th:\$\{m\.channel\}:\$\{Number\(m\.parent\)\}`, kind: 'thread',/);
    assert.match(js, /const looking = new Set\(document\.hidden \? \[\] : app\.looking\(\)\);/);
    assert.match(src('community/community.js'), /import\(`\.\/notifications\.js\$\{v\}`\)[\s\S]*?import\(`\.\/chat-app\.js\$\{v\}`\)/, 'the bell starts first and is handed to the app');
  });

  it('/chat/ is the whole window: no site footer, its credit row at the foot of the rail, nothing but the app\'s parts scroll', { skip: skipPhp }, () => {
    const pages = src('src/CommunityPages.php');
    const page = pages.slice(pages.indexOf('private function page('));
    assert.doesNotMatch(page, /footer\.html|class="foot"/, 'no site footer on a community page');
    assert.match(page, /content=\\"width=device-width, initial-scale=1, viewport-fit=cover\\"/, 'the safe area is the app\'s to keep');
    // The footer's first line, as the rail's last row (signed in and out, a phone's list screen).
    const foot = php('P::RAIL_FOOT');
    assert.match(foot, /^<p class="cx-rail-foot">/);
    const footer = src('parts/footer.html');
    for (const href of ['https://tinybitadventures.com', '/credits/', '/privacy-policy/']) {
      assert.ok(foot.includes(`href="${href}"`), href);
      assert.ok(footer.includes(`href="${href}"`), `the site footer still has ${href}`);
    }
    assert.match(foot, />fan remake<\/a> of Tiny Speck’s Glitch · <a href="\/credits\/">Credits<\/a> · <a href="\/privacy-policy\/">Privacy<\/a><\/p>$/);
    assert.match(pages, /'<div class="cx-rail"><nav class="cx-rail-list" aria-label="Community">' \. \$rail \. '<\/nav>' \. self::RAIL_FOOT \. '<\/div>'/, 'drawn for every reader');
    assert.match(pages, /\$this->shell\(\$community, \$viewer, \$viewer\['id'\] > 0 \? 'chan' : 'boards', \$channels, 'list', \[\], is_string\(\$asked\) \? \$asked : ''\)/, 'a phone opens /chat/ on the rail (the channel asked for marked)');
    // The page never scrolls; the app fills what the header leaves; its parts scroll inside themselves.
    const css = src('community/community.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
    assert.match(rule('html:has(> body.community-page)'), /overflow: hidden;/);
    const body = rule('body.community-page');
    assert.match(body, /display: flex; flex-direction: column; height: 100vh; height: 100dvh;/);
    assert.match(body, /overflow: hidden;/);
    const cx = rule('.cx');
    assert.match(cx, /flex: 1 1 auto;/);
    assert.match(cx, /min-height: 0;/);
    assert.doesNotMatch(cx, /min-height: [1-9]/, 'no floor that could push the page past the window');
    assert.match(rule('.cx-rail-list'), /overflow-y: auto;/);
    assert.match(rule('.cx-rail-foot'), /flex: none;/);
    assert.match(rule('.cx-log'), /overflow-y: auto;/);
    assert.match(rule('.cx-compose'), /flex: none;.*env\(safe-area-inset-bottom\)/);
    assert.match(rule('.cx-around .cx-people'), /overflow-y: auto;/);
    // Closed, Who's around leaves the grid (wide, it went under the rail and grew the page); narrow, its panel sits inside the app.
    assert.match(css, /\n\.cx\[data-cx-around="off"\] \.cx-around \{ display: none; \}/);
    assert.match(css, /\.cx-side \{ position: absolute; z-index: 25; grid-column: auto; grid-row: auto; top: 0; right: 0; bottom: 0;/);
    assert.doesNotMatch(css, /position: fixed; z-index: 25;/);
    // The header: compact, the app's palette and surface, one hairline, the page being read as a soft pill.
    assert.match(css, /\.community-page \{ --site-nav-h: 48px;/);
    assert.match(css, /\.community-page \.site-nav\.site-nav-app \{[^}]*background: var\(--surface\);[^}]*backdrop-filter: none;[^}]*border-bottom: 1px solid var\(--border\);/);
    assert.match(css, /\.site-nav-app \.site-nav-links a\[aria-current="page"\] \{ color: var\(--fg\); background: var\(--cx-soft\); \}/);
    assert.match(css, /\n\.community-page, \.cx \{\n  --bg:/, 'the header wears the app\'s tokens');
  });

  it('right-click menus use the game\'s component, with its keys and long press, and leave the browser\'s menu on fields, selections and links', async () => {
    const menus = src('community/chat-menus.js');
    assert.match(menus, /^import \{ bindContextTrigger, createContextMenu \} from '\/js\/ui\/context-menu\.js';$/m);
    const game = read('public/js/ui/context-menu.js');
    assert.match(game, /export function createContextMenu\(/, 'the game still offers it at that path');
    assert.match(game, /export function bindContextTrigger\(/);
    assert.match(menus, /longPress: true,/);
    assert.match(menus, /target\.closest\('input, textarea, select, \[contenteditable=""\], \[contenteditable="true"\]'\)/);
    assert.match(menus, /target\.closest\('\.cchan-text a, \.cpost-body a, \.cquote p a'\)/);
    assert.match(menus, /return selectedOver\(target\);/);
    assert.match(menus, /press\.had = selectedOver\(e\.target\);/, 'Safari\'s own word selection on a right-click is not the reader\'s');
    assert.match(src('community/chat-app.js'), /import\(`\.\/chat-menus\.js\$\{new URL\(import\.meta\.url\)\.search\}`\)\.then\(\(m\) => m\.startMenus\(menuApi\(\)\)\)/);
    const { playerRows, lineRows, postRows, railRows } = await pure();
    const ids = (rows) => rows.map((r) => r.id);
    assert.deepEqual(playerRows({ me: 7, id: 7 }), [], 'your own name has no menu');
    assert.deepEqual(ids(playerRows({ me: 7, id: 9, profile: '/players/bo/' })), ['profile', 'im', 'buddy', 'block', 'report']);
    assert.deepEqual(ids(playerRows({ me: 7, id: 9, buddy: true })), ['profile', 'im', 'unbuddy', 'block', 'report']);
    const blocked = playerRows({ me: 7, id: 9, blocked: true });
    assert.deepEqual(ids(blocked), ['profile', 'im', 'buddy', 'unblock', 'report']);
    assert.ok(blocked.find((r) => r.id === 'im').disabled && blocked.find((r) => r.id === 'buddy').disabled);
    assert.ok(playerRows({ me: 7, id: 9 })[0].disabled, 'no public page: View profile says why');
    assert.deepEqual(ids(lineRows({})), ['thread', 'react', 'copy', 'link', 'report']);
    assert.deepEqual(ids(lineRows({ thread: false, mine: true })), ['react', 'copy', 'link'], 'a reply has no thread; your own line no Report');
    assert.deepEqual(ids(postRows({ quote: true, react: true, report: true })), ['quote', 'react', 'copy', 'link', 'report']);
    assert.deepEqual(ids(railRows({ kind: 'chan', unread: 2 })), ['open', 'read', 'mute']);
    assert.deepEqual(ids(railRows({ kind: 'im', muted: true })), ['open', 'read', 'unmute']);
    assert.deepEqual(ids(railRows({ kind: 'board' })), ['open', 'read'], 'a board: no Mute');
    assert.ok(railRows({ kind: 'chan', unread: 0 })[1].disabled, 'nothing new: Mark as read says so');
  });

  it('a line\'s link opens /chat/ at it, a reply\'s its thread; muted rows are kept on this browser', async () => {
    const { lineLink, lineHash, readMuted } = await pure();
    assert.equal(lineLink('https://groddle.localhost', 'chan:global', 123), 'https://groddle.localhost/chat/?c=global#l123');
    assert.equal(lineLink('https://groddle.localhost/', 'im:9', 4), 'https://groddle.localhost/chat/?im=9#l4');
    assert.deepEqual(lineHash('#l123'), { line: 123 });
    assert.deepEqual(lineHash('#t55'), { thread: 55 });
    assert.deepEqual(lineHash('#post-3'), {});
    assert.deepEqual([...readMuted('["chan:help","im:9","nope","chan:group-1"]')], ['chan:help', 'im:9']);
    assert.deepEqual([...readMuted('{')], []);
    const app = src('community/chat-app.js');
    assert.match(app, /wanted = \{ key, \.\.\.lineHash\(location\.hash\) \};/);
    assert.match(src('community/chat-menus.js'), /lineLink\(location\.origin, of\.conv, of\.parent\)\.replace\(\/#l\(\\d\+\)\$\/, '#t\$1'\)/);
  });

  it('"N replies" under a line is a button of its own with room before the next line (the drawer, both skins, and /chat/)', () => {
    const block = (css, sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    const modern = block(read('public/style.css'), '\n.thread-open');
    assert.match(modern, /margin-bottom: var\(--sp-4\);/);
    assert.match(modern, /border: 1px solid var\(--border\);/);
    assert.match(read('public/style.css'), /\.thread-open::before \{[^}]*mask:/, 'its thread icon');
    assert.match(block(read('public/css/classic.css'), ':root[data-ui="classic"] .thread-open'), /margin-bottom: calc\(6 \* var\(--cu\)\);/);
    const web = block(src('community/community.css'), '.cx-replies');
    assert.match(web, /margin: 5px 0 6px;/);
    assert.match(web, /border: 1px solid var\(--cx-strong\); border-radius: 999px;/);
    assert.match(src('community/chat-app.js'), /a\.innerHTML = ICON\.thread;/);
  });
});
