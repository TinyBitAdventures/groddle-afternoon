/**
 * The Community boards' Announcements (Austin 2026-11-13: "lock down /chat/announcements/ that only
 * staff can post new threads on it. Everyone can respond but new posts should be staff only ... this
 * should hit everyone's notification when viewing /chat/"), the site side (groddle-afternoon-site
 * src/Community.php, CommunityText.php, CommunityPages.php, Notifications.php).
 *
 * The rules run on a throwaway MariaDB database (tests/fixtures/community-announce/community-announce.php);
 * skipped without the site repo, PHP, the engine or MariaDB.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const src = (f) => readFileSync(sitePath(f), 'utf8');
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = spawnSync('php', ['-v']).status === 0;
function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('Announcements on a throwaway database', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync('php', [join(import.meta.dirname, 'fixtures/community-announce/community-announce.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_announce_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('only the team starts a topic on Announcements; a player gets a plain refusal and still replies', () => {
    assert.deepEqual(r.start.player, { status: 403, code: 'groddle_community_staff_only' });
    assert.deepEqual(r.start.noCharacter, { status: 403, code: 'groddle_community_staff_only' });
    assert.deepEqual(r.start.signedOut, { status: 401, code: 'groddle_community_signed_out' });
    assert.equal(r.start.playerGeneral.status, 201, 'other boards stay open to players');
    assert.equal(r.start.staff.status, 201);
    assert.equal(r.start.staff.body.thread.board, 'announcements');
    assert.equal(r.reply.player.status, 201, 'everyone can reply');
    assert.deepEqual(r.refusal, { player: 'groddle_community_staff_only', playerGeneral: null, staff: null, signedOut: 'groddle_community_signed_out' });
    assert.equal(r.said, 'Only the team starts topics here. Open one to reply.');
  });

  it('the board page says it is the team\'s news and has no Start a topic for players; the team keeps it', () => {
    const start = 'href="/chat/announcements/new/">Start a topic';
    const note = 'News from the team: only the team starts topics here. Everyone can reply.';
    for (const k of ['playerBoard', 'signedOutBoard', 'staffBoard', 'playerGeneral', 'playerNew']) assert.doesNotMatch(r.pages[k], /^ERROR/, `${k}: ${r.pages[k].slice(0, 200)}`);
    assert.ok(r.pages.playerBoard.includes(note) && !r.pages.playerBoard.includes(start));
    assert.ok(r.pages.signedOutBoard.includes(note) && r.pages.signedOutBoard.includes('data-community-signin'), 'a visitor can still sign in to reply');
    assert.ok(r.pages.staffBoard.includes(start) && !r.pages.staffBoard.includes(note));
    assert.ok(r.pages.playerGeneral.includes('href="/chat/general/new/">Start a topic'));
    assert.ok(r.pages.playerNew.includes(r.said) && !r.pages.playerNew.includes('data-community-new='), 'the form page refuses without a form');
  });

  it('the board is renamed Announcements, General takes player events, and the live rows follow once (same slug)', () => {
    const rows = Object.fromEntries(r.seed.rows.map((b) => [b.slug, b]));
    assert.equal(r.seed.staleBefore, true);
    assert.deepEqual([rows.announcements.name, rows.announcements.about], ['Announcements', 'News and updates from the team. Everyone can reply.']);
    assert.match(rows.general.about, /player events: parties, meetups, contests/);
    assert.equal(Number(rows.ideas.position), 9, 'a board keeps its place');
    assert.equal(rows.announcements.created_at, '2026-11-04 12:00:00', 'and its created_at');
    assert.equal(r.seed.rows.length, 6, 'nothing added or taken away');
    assert.equal(r.seed.staleAfter, false);
    assert.equal(r.seed.again, true, 'a second read changes nothing');
    assert.equal(r.seed.emptyStale, true, 'an empty table is seeded');
    assert.deepEqual(r.seed.shown[0], ['announcements', 'Announcements', 'News and updates from the team. Everyone can reply.'], 'the first read already shows the new words');
    assert.ok(r.start.staff.body.url.startsWith('/chat/announcements/'), 'the slug and its links stay');
  });

  it('the team\'s new topic gives every character but its writer one unread announce notice (none to a login with no character)', () => {
    const news = r.start.staff.body.thread.id;
    for (const who of ['ada', 'bea', 'cyd']) assert.deepEqual(r.notices[who].filter((n) => n.kind === 'announce'), [{ kind: 'announce', thread: news, from: 900, read: false, game: false }], who);
    assert.deepEqual(r.notices.staff.map((n) => n.kind), ['reply'], 'the writer gets none; a reply to the announcement notifies its writer as before');
    assert.deepEqual(r.notices.noCharacter, []);
    assert.equal(r.notices.ada.filter((n) => n.kind === 'reply').length, 1, 'Ada\'s own topic\'s reply notice is untouched');
    assert.equal(r.notices.bea.filter((n) => n.kind === 'reply').length, 0, 'Bea replied to the announcement: she is not notified of her own reply');
  });

  it('it shows in the /chat/ panel and its badge, never in the game\'s Activity', () => {
    const ann = r.panel.cyd.find((i) => i.kind === 'announce');
    assert.deepEqual(ann, { kind: 'announce', text: 'New announcement: “Groddle news”', unread: true, url: ann.url });
    assert.match(ann.url, /^\/chat\/announcements\/\d+-groddle-news\/#post-\d+$/);
    assert.equal(r.badge.cyd, 1);
    assert.equal(r.badge.ada, 2, 'Ada: the announcement and the reply to her topic');
    assert.deepEqual(r.game.cyd, [], 'the game\'s list leaves announcements out');
    assert.deepEqual(r.game.ada.map((n) => n[0]), ['reply'], 'and keeps the rest');
    assert.deepEqual(r.list, [['announce', 'New announcement: “Groddle news” on the Community boards.']]);
    assert.equal(r.noticeText, 'New announcement: “Groddle news” on the Community boards.');
  });

  it('unread until the topic is opened or Mark all read; once a character; never to a character made later', () => {
    assert.equal(r.afterRead.ada.find((n) => n.kind === 'announce').read, true, 'opening the topic reads it');
    assert.ok(r.afterRead.bea.every((n) => n.read), 'Mark all read reads it');
    assert.equal(r.afterRead.cyd.find((n) => n.kind === 'announce').read, false);
    assert.equal(r.afterRead.adaBadge, 1);
    assert.equal(r.afterRead.cydBadge, 1);
    assert.equal(r.again, 0, 'running it again writes nothing');
    assert.deepEqual(r.later, [], 'a character made after the announcement never gets it');
    assert.equal(r.second.total, 4, 'the next announcement reaches every character, Eve too');
    assert.deepEqual(r.second.eve.map((n) => n.kind), ['announce']);
  });

  it('one INSERT ... SELECT, a kind that fits its column, and the game keeps game_at as it was', () => {
    const c = src('src/Community.php');
    assert.match(c, /public const ANNOUNCE = 'announce';/);
    assert.ok('announce'.length <= Number(JSON.parse(src('minn.json')).tables.groddle_community_notices.find((l) => l.startsWith('kind ')).match(/varchar\((\d+)\)/)[1]));
    assert.match(c, /INSERT INTO \{\$n\} \(user_id, kind, thread_id, post_id, from_id, count, created_at\) SELECT c\.user_id/);
    assert.match(c, /AND x\.kind <> '" \. self::ANNOUNCE \. "'/);
    assert.match(src('community/notifications.js'), /announce: svg\(/);
    assert.match(src('community/community.css'), /\.notif-icon\[data-kind="announce"\]/);
  });

  it('the rule is the administrators\' (manage_options), by board, never by user id', () => {
    const c = src('src/Community.php');
    assert.match(src('src/CommunityText.php'), /public const STAFF_BOARDS = \['announcements'\];/);
    assert.match(c, /if \(\$viewer\['id'\] > 0 && CommunityText::staffOnly\(\$board\) && !\$viewer\['admin'\]\) \{\s*return 'groddle_community_staff_only';/);
    assert.match(c, /\$this->mayPost\(\$viewer, true, \$board\);/);
    assert.match(c, /private const ADMIN = 'manage_options';/);
  });
});
