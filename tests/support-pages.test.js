/**
 * Support on the website (Austin 2026-11-27: "power users would like to be able to manage their bug reports
 * outside of the game ... bolted into the community section as a new support channel but with more
 * abilities like photo/file uploads and filter by status"): /chat/support/ lists a signed-in player's own
 * reports by status with counts and pages, /chat/support/<id>/ shows one with its pictures, files and
 * context, a reply box with uploads, Close and Reopen, and /chat/support/new/ sends a new one marked as
 * from the website. Every write goes through the game's own Tickets rules (ours: Glitch had no web
 * support pages; its bug reports were a form only).
 *
 * The PHP group runs the site's classes on a throwaway MariaDB database
 * (tests/fixtures/support/support-pages.php; makes and drops test_groddle_support_<hex> only).
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/support-pages.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const src = (p) => readFileSync(sitePath(p), 'utf8');

function mysql() {
  const env = process.env.GRODDLE_TEST_MYSQL;
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => (text.match(new RegExp(`define\\(\\s*'${k}'\\s*,\\s*'([^']*)'`)) || [])[1];
  return def('DB_HOST') && def('DB_USER') ? { host: def('DB_HOST'), user: def('DB_USER'), pass: def('DB_PASSWORD') || '' } : null;
}

const db = mysql();
const phpArgs = HAS_PHP && spawnSync(PHP, ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const gd = HAS_PHP && spawnSync(PHP, [...phpArgs, '-r', 'exit(function_exists("imagecreatefromwebp") ? 0 : 1);']).status === 0;
const reachable = db && HAS_PHP && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite || (!HAS_PHP && 'no php') || (!gd && 'no gd with WebP') || (!db && 'no database') || (!reachable && 'database not reachable') || (!existsSync(join(ENGINE, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)');

/** The main pane of a page (the app's conversation), where the player's words and ours are. */
const pane = (html) => String(html || '').slice(String(html || '').indexOf('data-cx-pane'), String(html || '').lastIndexOf('</main>'));

describe('Support on the website: a player manages their own reports (php, throwaway database)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(root, 'tests/fixtures/support/support-pages.php'), ENGINE, SITE_DIR, db.host, db.user, db.pass], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 }).toString());
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true, 'throwaway database dropped');
  });

  it('signed out: a short line and the sign-in links, nothing of anyone\'s reports', () => {
    for (const page of [r.signedOut, r.signedOutReport]) {
      assert.equal(page.status, 200);
      const main = pane(page.body);
      assert.match(main, /Sign in to see your bug reports and our replies\./);
      assert.match(main, /href="\/play\/online\/"/);
      assert.doesNotMatch(main, /door sticks/, 'another player\'s report never shows');
      assert.doesNotMatch(main, /data-ticket=/);
      assert.match(page.body, /<meta name="robots" content="noindex" \/>/);
    }
    assert.equal(r.newReport.signedOut, 200);
    assert.equal(r.newReport.signedOutLinks, true);
  });

  it('the list holds only your own reports, the newest activity first, a page at a time', () => {
    const { ids } = r;
    assert.equal(r.list.status, 200);
    assert.equal(r.list.ids.length, 20, 'PER_PAGE a page');
    assert.ok(!r.list.ids.includes(ids.bea), 'never another player\'s');
    assert.deepEqual(r.list.ids.slice(0, 4), [ids.answered, ids.closed, ids.working, ids.open], 'newest activity first');
    assert.equal(r.list2.ids.length, 6, '26 reports: 20 then 6');
    assert.equal(new Set([...r.list.ids, ...r.list2.ids]).size, 26);
    assert.deepEqual(r.beaList, [ids.bea]);
    assert.equal(r.list.cache, 'private, no-store');
  });

  it('status filters as the game names them, each with its count, and the one shown marked', () => {
    const { filters, ids } = r;
    assert.deepEqual(filters.answered, { ids: [ids.answered], current: { current: true, n: 1 } });
    assert.deepEqual(filters.working, { ids: [ids.working], current: { current: true, n: 1 } });
    assert.deepEqual(filters.closed, { ids: [ids.closed], current: { current: true, n: 1 } });
    assert.equal(filters.open.current.n, 23);
    assert.equal(filters.open.ids.length, 20);
    assert.ok(filters.open.ids.every((id) => ![ids.answered, ids.working, ids.closed].includes(id)));
    assert.equal(filters.nonsense.current.n, 26, 'an unknown status is All');
    const html = r.list.html;
    for (const [label, n] of [['All', 26], ['Open', 23], ['Answered', 1], ['Working on it', 1], ['Closed', 1]]) {
      assert.match(html, new RegExp(`>${label} <span class="csupport-n">${n}</span></a>`));
    }
  });

  it('a New reply mark until you open the report; the rail\'s Support entry counts them', () => {
    assert.equal(r.unreadBefore, true);
    assert.equal(r.railBadge, 1);
    assert.equal(r.thread.status, 200);
    assert.equal(r.unreadAfter, false, 'opening it reads it, as the game\'s Reports list does');
  });

  it('another player\'s report, its pictures and its files are the site\'s 404, never 403', () => {
    const o = r.owner;
    assert.equal(o.beaReply.status, 303, JSON.stringify(o.beaReply));
    for (const k of ['adaSeesBea', 'adaRepliesBea', 'adaClosesBea', 'adaReopensBea', 'adaPicture', 'adaFile', 'outPicture', 'outFile', 'missingFile', 'adaGameRoute', 'unknown']) {
      assert.equal(o[k], 404, k);
    }
    assert.equal(o.beaStill, 'open', 'Ada\'s close of Bea\'s report changed nothing');
    assert.equal(o.beaPicture, 200);
    assert.equal(o.beaPictureType, 'image/jpeg');
    assert.equal(o.beaPictureJpeg, true);
    assert.equal(o.adminPicture, 200);
    assert.equal(o.adminFile, 200);
  });

  it('a text file is served to its player as plain text, a download, never sniffed', () => {
    const h = r.owner.beaFileHeaders;
    assert.equal(r.owner.beaFile, 200);
    assert.equal(h['Content-Type'], 'text/plain; charset=utf-8');
    assert.equal(h['Content-Disposition'], 'attachment; filename="bea.log"');
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.match(h['Content-Security-Policy'], /sandbox/);
    assert.equal(h['Cache-Control'], 'private, no-store');
    assert.equal(r.owner.beaFileBody, 'line one\nline two\n');
  });

  it('a reply on the web is in the game\'s thread and the console\'s, and theirs are on the web page', () => {
    assert.equal(r.webReply.status, 303);
    assert.match(r.webReply.location, /^\/chat\/support\/\d+\/\?said=replied#latest$/);
    assert.equal(r.webReply.row.status, 'open', 'answered becomes open when the player writes (TicketStore::statusAfter)');
    assert.equal(r.webReply.row.last_author_role, 'player');
    const mine = { author: 'player', body: 'Thanks! Still floating\nafter the fix?' };
    assert.deepEqual(r.gameSees.at(-1), mine);
    assert.deepEqual({ author: r.consoleSees.at(-1).author, body: r.consoleSees.at(-1).body }, mine);
    assert.deepEqual(r.consoleSees.at(-1).files, []);
    assert.equal(r.consoleReply, 200);
    assert.equal(r.gameReply, 200);
    assert.deepEqual(r.webSees, { console: true, game: true, mine: true, latest: true });
  });

  it('close and reopen: closedBy player, cleared on reopen; a reply opens it too; working stays working', () => {
    const c = r.closeReopen;
    assert.equal(c.close.status, 303);
    assert.equal(c.close.row.status, 'closed');
    assert.equal(c.close.row.closed_by, 'player');
    assert.deepEqual(c.closedPage, { closedByYou: true, reopenForm: true, closeForm: false });
    assert.equal(c.reopen.row.status, 'open');
    assert.equal(c.reopen.row.closed_by, null);
    assert.equal(c.consoleClosedBy, 'player', 'the console sees who closed it');
    assert.equal(c.replyOpens.status, 'open');
    assert.equal(c.replyOpens.closed_by, null);
    assert.equal(c.workingStays, 'working');
  });

  it('pictures: PNG, WebP and JPEG drawn again as JPEG within the report limits, upright, no EXIF', () => {
    const u = r.uploads;
    assert.deepEqual(u.png.pictures.map((p) => [p.w, p.h, p.jpeg, p.exif]), [[400, 300, true, false]]);
    assert.deepEqual(u.bigPng.pictures.map((p) => [p.w, p.h, p.jpeg]), [[1280, 960, true]], 'made to fit 1280 x 1280');
    assert.ok(u.bigPng.pictures[0].bytes <= 307200, 'within ReportPicture::MAX_BYTES');
    assert.deepEqual(u.webp.pictures.map((p) => [p.w, p.h, p.jpeg]), [[300, 300, true]]);
    assert.deepEqual(u.exif.pictures.map((p) => [p.w, p.h, p.exif]), [[100, 200, false]], 'orientation 6 turned upright, the EXIF (and its GPS words) gone');
    assert.deepEqual(r.pure.orientation, [6, 1, 1]);
    assert.deepEqual(r.pure.kind, ['png', 'webp', null, 'jpeg']);
  });

  it('text files: .txt and .log as text (byte order mark dropped, a safe name), shown in the console and the game\'s thread', () => {
    const log = r.uploads.log;
    assert.equal(log.status, 303);
    assert.deepEqual(log.files.map((f) => f.name), ['game console -1.log']);
    assert.equal(log.files[0].body.startsWith('[12:00]'), true);
    assert.equal(r.consoleFiles.flat().length, 1);
    assert.match(r.consoleFiles[0][0].url, /^\/report-files\/\d+\/\d+\/1$/);
    assert.deepEqual(r.gameFiles, r.consoleFiles);
    assert.match(pane(r.reportPage), /<a class="csupport-file" href="\/report-files\/\d+\/\d+\/1" download="game console -1\.log">game console -1\.log<\/a>/);
    assert.deepEqual(r.pure.safeName.slice(0, 3), ['passwd.log', 'rapport -t- -x.txt', 'file.log']);
    assert.ok(r.pure.safeName[3].length <= 80);
  });

  it('refused: a disguised picture, a picture named .txt, a 300 KB .txt, .html, .svg, too many, too small; nothing kept, the words kept', () => {
    const u = r.uploads;
    const refused = { disguisedPng: 415, pngAsTxt: 415, bigTxt: 413, html: 415, svg: 415, tooManyPictures: 400, tooManyFiles: 400, tiny: 400, mixedBad: 415 };
    for (const [k, status] of Object.entries(refused)) {
      assert.equal(u[k].status, status, `${k}: ${JSON.stringify(u[k])}`);
      assert.equal(u[k].kept, false, `${k} kept nothing`);
      assert.equal(u[k].wordsKept, true, `${k} keeps the words in the box`);
      assert.match(u[k].said, /Add your files again before you send\.$/, k);
    }
    assert.match(u.html.said, /^Only pictures \(JPEG, PNG or WebP\) and text files \(\.txt or \.log\) can be added\./);
    assert.match(u.bigTxt.said, /larger than 256 KB/);
    assert.match(u.pngAsTxt.said, /not plain text/);
  });

  it('the forms need the page\'s nonce; a post too large for the server says so', () => {
    assert.equal(r.nonce.status, 403);
    assert.equal(r.nonce.kept, false);
    assert.equal(r.nonce.said, 'This page was open a long time. Try again.');
    assert.equal(r.nonce.wordsKept, true);
    assert.equal(r.tooBig.status, 413);
    assert.match(r.tooBig.said, /too large to send at once/);
  });

  it('the game\'s reply limit holds on the web (Tickets::REPLY_PER_WINDOW)', () => {
    // One reply with pictures went first, so nine more pass and the rest wait.
    assert.deepEqual(r.limit, [...Array(9).fill(303), 429, 429, 429]);
  });

  it('a new report from the website: subject and words, pictures and a file, marked as from the website, in the console and the game', () => {
    const n = r.newReport;
    assert.equal(n.form.status, 200, n.form.error);
    assert.equal(n.form.multipart, true);
    assert.equal(n.status, 303, n.error);
    assert.match(n.location, /^\/chat\/support\/\d+\/\?said=sent$/);
    assert.equal(n.subject, 'Bridge gap');
    assert.equal(n.body, 'Bridge gap\n\nI fall through the bridge.\nEvery time.');
    assert.equal(n.from, 'website');
    assert.equal(n.page, '/chat/support/new/');
    assert.deepEqual([n.picture?.width, n.picture?.height], [500, 300], 'the first picture is the report\'s own');
    assert.equal(n.firstFiles.length, 1);
    assert.equal(n.firstFiles[0].name, 'console.txt');
    assert.equal(n.inGameList, true);
    assert.equal(n.empty, 400);
    assert.equal(n.emptyKept, true);
  });

  it('the pages: the conversation with thumbnails that open full size, context plainly, no em dashes', () => {
    const t = pane(r.thread.html);
    assert.match(t, /<span class="cpost-name">Administrator<\/span>/);
    assert.match(t, /<span class="cpost-name">You<\/span>/);
    assert.doesNotMatch(t, /Staffer/, 'the team is a role, never a name');
    const rp = pane(r.reportPage);
    assert.match(rp, /<a class="csupport-pic" href="(\/report-pictures\/\d+\/\d+\/1)" target="_blank" rel="noopener"[^>]*><img src="\1" width="1280" height="960"/);
    assert.match(rp, /enctype="multipart\/form-data"/);
    assert.match(rp, /<input type="file" name="files\[\]" multiple accept="\.jpg,\.jpeg,\.png,\.webp,\.txt,\.log,/);
    assert.match(rp, /<input type="hidden" name="_wpnonce" value="[0-9a-f]{10}" \/>/);
    for (const html of [r.list.html, r.thread.html, r.reportPage, r.signedOut.body]) {
      assert.doesNotMatch(pane(html), /\u2014/, 'no em dashes');
      assert.match(html, /community\.css\?v=community-18/);
      assert.match(html, /\/site\/theme\.js/, 'the theme script sets light or dark before paint');
    }
  });

  it('what the game sent shows plainly: street, build, browser, screen, page errors; the website\'s says so', () => {
    const g = r.context.game;
    for (const [k, v] of [['Street', 'Groddle Meadow'], ['Build', 'v0.78.0'], ['Browser', 'Firefox 140'], ['Screen', '390x844'], ['Page errors', '1']]) {
      assert.ok(g.includes(`<dt>${k}</dt><dd>${v}</dd>`), `${k} in ${g}`);
    }
    assert.match(g, /<summary>What the game sent with it<\/summary>/);
    assert.doesNotMatch(g, /TypeError/, 'the error text stays for the team');
    assert.equal(r.context.none, '');
    assert.match(r.context.web, /<dt>Sent from<\/dt><dd>The website<\/dd>/);
    assert.match(r.context.web, /Safari &lt;iPhone&gt;/, 'escaped');
  });
});

describe('Support: the site code (groddle-afternoon-site)', { skip: skipWithoutSite }, async () => {
  const consoleMod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('registered before the boards, so /chat/support/<id>/ is never a board thread; the boards leave it alone', () => {
    const ext = src('src/Extension.php');
    assert.ok(ext.indexOf('new SupportPages($minn)') > 0 && ext.indexOf('new SupportPages($minn)') < ext.indexOf('new CommunityPages($minn)'));
    assert.match(ext, /\$minn->routes\(new TicketFiles\(\$minn\)\);/);
    const pages = src('src/CommunityPages.php');
    assert.equal((pages.match(/if \(\$board === SupportPages::SLUG\) \{\s*throw new RouteMiss\(\);/g) || []).length, 3);
    assert.ok(!src('src/CommunityText.php').match(/'support' =>/), 'support is never a board slug');
  });

  it('every write goes through the game\'s Tickets rules', () => {
    const php = src('src/SupportPages.php');
    assert.match(php, /->openFor\(\$me, \$message, \$context, \$pictures, \$files\)/);
    assert.match(php, /->replyFor\(\$me, \(int\) \$id, \$form\['message'\] \?\? null, \$pictures, \$files\)/);
    assert.match(php, /\$tickets->closeFor\(\$me, \$id\) : \$tickets->reopenFor\(\$me, \$id\)/);
    const t = src('src/Tickets.php');
    assert.match(t, /public function openFor\(UserRecord \$me/);
    assert.match(t, /\$this->openFor\(\$me, \$body\['message'\] \?\? null, \$context, static fn \(\): array => ReportPicture::fromBody\(\$body\)\)/);
    assert.match(t, /\$row = \$this->mine\(\$me, \(int\) \$id\);\s*\$body = \$request->json\(\);\s*\$this->replyFor\(\$me, \(int\) \$row\['id'\], \$body\['message'\] \?\? null, static fn \(\): array => ReportPicture::fromBody\(\$body\)\)/);
  });

  it('the new table is added to minn.json, and nothing else changed shape', () => {
    const manifest = JSON.parse(src('minn.json'));
    const cols = manifest.tables.groddle_ticket_files;
    assert.ok(Array.isArray(cols));
    assert.ok(cols.includes('body mediumtext NOT NULL'));
    assert.ok(cols.includes('UNIQUE KEY message_position (message_id,position)'));
  });

  it('the Support styles use only the page\'s colour tokens, each defined for light and dark', () => {
    const css = src('community/community.css');
    const block = css.slice(css.indexOf('/* Support (/chat/support/'));
    assert.ok(block.length > 200);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, 'no colour written out');
    const light = css.slice(css.indexOf('.community-page, .console-page, .cx {'), css.indexOf(':root[data-theme="dark"] .community-page'));
    const dark = css.slice(css.indexOf(':root[data-theme="dark"] .community-page'), css.indexOf('/* A full-window app'));
    const colourProps = /(?:^|[;{\s])(?:color|background|background-color|border(?:-color)?)\s*:[^;}]*/g;
    const used = new Set();
    for (const decl of block.match(colourProps) || []) for (const m of decl.matchAll(/var\(--([a-z0-9-]+)\)/g)) used.add(m[1]);
    assert.ok(used.size >= 5);
    for (const token of used) {
      assert.match(light, new RegExp(`--${token}:`), `--${token} in the light palette`);
      assert.match(dark, new RegExp(`--${token}:`), `--${token} in the dark palette`);
    }
  });

  it('the console lists a message\'s text files and where a report was sent from', () => {
    assert.deepEqual(consoleMod.messageFiles({ files: [{ url: '/report-files/4/38/1', name: 'a.log', bytes: 2048 }, { url: 'https://elsewhere.test/x', name: 'evil' }, { url: '/report-files/4/38/9x' }] }),
      [{ url: '/report-files/4/38/1', name: 'a.log', bytes: 2048 }]);
    assert.deepEqual(consoleMod.messageFiles({}), []);
    assert.equal(consoleMod.fileSize(2048), '2 KB');
    assert.equal(consoleMod.fileSize(10), '1 KB');
    assert.deepEqual(consoleMod.contextRows({ from: 'website', agent: 'Firefox' }), [['Sent from', 'website'], ['Browser', 'Firefox']]);
    assert.match(src('console/console.js'), /replyFiles\(m\),/);
    assert.match(src('src/AdminConsolePage.php'), /ASSET_KEY = 'skin-13'/);
  });

  it('the rail has a Support entry for signed-in players', () => {
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /\$rail \.= SupportPages::railSection\(\(new TicketStore\(\$this->minn->db\)\)->unreadCount\(\(int\) \$viewer\['id'\]\), \$active === SupportPages::ACTIVE\);/);
    assert.match(src('src/SupportPages.php'), /\$main = '<section class="cx-conv csupport csupport-out"/);
  });
});
