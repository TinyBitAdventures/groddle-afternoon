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

/** SupportPages' pure limits run by PHP (no database): php -r with the site's classes. */
function phpRun(code) {
  const pre = ['ReportPicture', 'ReportFile', 'SupportPages'].map((c) => `require ${JSON.stringify(sitePath(`src/${c}.php`))};`).join(' ');
  return JSON.parse(execFileSync(PHP, ['-d', 'display_errors=stderr', '-r', `${pre} use Groddle\\Minn\\SupportPages as S; echo json_encode(${code});`], { encoding: 'utf8' }));
}
function phpLimits() {
  const l = phpRun('S::limits()');
  return { ...l, ...phpRun(`['fileWords' => S::sizeWords(${l.file}), 'textWords' => S::sizeWords(${l.text})]`) };
}

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
    assert.match(r.tooBig.said, /^Those files were too big to send together\. Send fewer at a time\./);
  });

  it('a POST PHP dropped for being over post_max_size (CONTENT_LENGTH, no fields) says so on the same page, never the nonce', () => {
    const words = 'Those files were too big to send together. Send fewer at a time. Your words weren\'t kept.';
    for (const k of ['reply', 'new']) {
      assert.equal(r.postDropped[k].status, 413, k);
      assert.equal(r.postDropped[k].said, words, k);
      assert.equal(r.postDropped[k].page, true, `${k}: the same form again`);
    }
    // An empty post under the limit is not a dropped one: the nonce's own refusal.
    assert.equal(r.postDropped.under.status, 403);
    assert.equal(r.postDropped.under.said, 'This page was open a long time. Try again.');
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
      assert.match(html, /community\.css\?v=community-22/);
      assert.match(html, /\/site\/theme\.js/, 'the theme script sets light or dark before paint');
    }
  });

  it('both forms carry the drop zone, hidden until its script shows it, with the plain file field still in the form', () => {
    for (const [name, html] of [['reply', pane(r.reportPage)], ['new report', pane(r.newReport.form.html)]]) {
      const form = html.slice(html.indexOf('<form class="cform csupport-form"'), html.indexOf('</form>', html.indexOf('<form class="cform csupport-form"')));
      assert.ok(form.length > 200, `${name}: the form`);
      assert.match(form, /<div class="csupport-drop" data-drop="" hidden><button class="csupport-drop-zone" type="button" data-drop-zone="">/, `${name}: the zone, hidden without JavaScript`);
      assert.match(form, /<span class="csupport-drop-mouse">Drop pictures or a text file here, or <span class="csupport-drop-choose">choose files<\/span><\/span>/, `${name}: its words`);
      assert.match(form, /<span class="csupport-drop-touch">Tap to add pictures or a text file<\/span>/, `${name}: a phone's words`);
      assert.match(form, /<ul class="csupport-chosen" data-chosen="" aria-label="Files to send" hidden><\/ul>/);
      assert.match(form, /<p class="csaid csupport-drop-said" role="status" aria-live="polite" data-drop-said=""><\/p>/);
      assert.match(form, /<label class="csupport-attach"><span>Add pictures or a text file<\/span><input type="file" name="files\[\]" multiple accept="\.jpg,\.jpeg,\.png,\.webp,\.txt,\.log,[^"]*" \/><\/label>/, `${name}: the plain field as before`);
      assert.ok(form.indexOf('data-drop=""') < form.indexOf('name="files[]"'), `${name}: the zone above the field`);
      // The server's real limits for the script (this PHP: upload_max_filesize 2M, post_max_size 8M, as on live), and the plain line names them.
      const lim = phpLimits();
      assert.match(form, new RegExp(`data-file-max="${lim.file}" data-text-max="${lim.text}" data-post-max="${lim.post}">`), `${name}: the limits on the form`);
      const line = html.match(/<p class="chint" data-drop-hint="([^"]*)">([^<]*)<\/p>/);
      assert.ok(line, `${name}: the limits line`);
      assert.equal(line[2], `Up to 4 pictures (JPEG, PNG or WebP, up to ${lim.fileWords} each) and 2 text files (.txt or .log, up to ${lim.textWords}) a message. Only you and the team can see them.`);
      assert.equal(line[1], `Up to 4 pictures and 2 text files (.txt or .log, up to ${lim.textWords}) a message. Big pictures are made smaller before they go. Only you and the team can see them.`);
    }
    assert.match(pane(r.newReport.form.html), /data-support-new=""/);
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
    // A website report's picture is the player's own, not the game at that moment.
    assert.equal(consoleMod.PICTURE_HINT.web, 'The picture they added on the website. Click it to see it full size.');
    assert.match(src('console/console.js'), /const fromWeb = r\.context\?\.from === 'website';\s*\$\('\.console-picture-hint'\)\.textContent = fromWeb \? PICTURE_HINT\.web : PICTURE_HINT\.game;/);
    assert.match(src('src/AdminConsolePage.php'), /ASSET_KEY = 'skin-15'/);
  });

  it('the server\'s real limits: php.ini sizes read, the per-file limit the smaller of ours and upload_max_filesize, the request post_max_size', { skip: !HAS_PHP && 'no php' }, () => {
    assert.deepEqual(phpRun('array_map([S::class, "iniBytes"], ["8M", "2M", "512K", "1G", "-1", "0", "", "1048576", " 16m "])'),
      [8388608, 2097152, 524288, 1073741824, 0, 0, 0, 1048576, 16777216]);
    assert.deepEqual(phpRun('S::limits("2M", "8M")'), { file: 2097152, text: 262144, post: 8388608 }, 'Kinsta: 2 MB a file, 8 MB a request');
    assert.deepEqual(phpRun('S::limits("64M", "128M")'), { file: 10485760, text: 262144, post: 134217728 }, 'ours when the server allows more');
    assert.deepEqual(phpRun('S::limits("128K", "-1")'), { file: 131072, text: 131072, post: 0 }, 'a text file too; no request limit');
    assert.deepEqual(phpRun('S::limits("-1", "8M")'), { file: 10485760, text: 262144, post: 8388608 });
    assert.deepEqual(phpRun('[S::droppedPost([], [], 9000000, 8388608), S::droppedPost([], [], 1000, 8388608), S::droppedPost(["message" => "x"], [], 9000000, 8388608), S::droppedPost([], [], 0, 8388608), S::droppedPost([], [], 5, 0)]'),
      [true, false, false, false, true]);
    assert.deepEqual(phpRun('[S::sizeWords(2097152), S::sizeWords(10485760), S::sizeWords(262144), S::sizeWords(1572864), S::sizeWords(131072)]'), ['2 MB', '10 MB', '256 KB', '1.5 MB', '128 KB']);
    const php = src('src/SupportPages.php');
    assert.match(php, /\$length = \(int\) \(\$request->header\('content-length'\) \?\? \(\$_SERVER\['CONTENT_LENGTH'\] \?\? '0'\)\);/, 'the CGI length, which Request::header misses');
    assert.match(php, /'That picture is larger than ' \. self::sizeWords\(\$limits\['file'\]\)/, 'the server names its real per-file limit');
  });

  it('the drop zone\'s script is loaded with the page\'s key for both forms, and its styles are tokens', () => {
    const js = src('community/community.js');
    assert.match(js, /document\.querySelector\('form\[data-support-reply\], form\[data-support-new\]'\)/);
    assert.match(js, /import\(`\.\/support-files\.js\$\{v\}`\)/, 'with community.js\'s own ?v=');
    assert.match(js, /m\.wireSupportFiles\(supportForm, \{ area: supportForm\.closest\('\.cx-conv'\) \|\| supportForm \}\)/, 'a drop on the pane counts');
    assert.match(js, /stops\.push\(\(\) => \{ gone = true; stopFiles\?\.\(\); \}\)/, 'stopped when the view goes (object addresses freed)');
    const css = src('community/community.css');
    assert.match(css, /\.csupport-drop-zone \{[^}]*border: 2px dashed var\(--cx-strong\)/);
    assert.match(css, /\.csupport-drop\[data-over\] \.csupport-drop-zone \{[^}]*border-color: var\(--accent\)/, 'lit while files are dragged over');
    assert.match(css, /@media \(hover: hover\) \{ \.csupport-drop-zone:hover \{[^}]*border-color: var\(--accent\)/, 'a hover look where there is a mouse (never stuck after a tap)');
    assert.match(css, /@media \(hover: none\) and \(pointer: coarse\) \{\s*\.csupport-drop-mouse \{ display: none; \}/, 'a phone reads Tap to add');
    assert.match(src('src/CommunityPages.php'), /ASSET_KEY = 'community-22'/);
  });

  it('the rail has a Support entry for signed-in players', () => {
    const pages = src('src/CommunityPages.php');
    assert.match(pages, /\$rail \.= SupportPages::railSection\(\(new TicketStore\(\$this->minn->db\)\)->unreadCount\(\(int\) \$viewer\['id'\]\), \$active === SupportPages::ACTIVE\);/);
    assert.match(src('src/SupportPages.php'), /\$main = '<section class="cx-conv csupport csupport-out"/);
  });
});

describe('Support: the drop zone\'s checks, as the server\'s (community/support-files.js)', { skip: skipWithoutSite }, async () => {
  const f = HAS_SITE ? await import(pathToFileURL(sitePath('community/support-files.js')).href) : {};
  const file = (name, size = 1000, lastModified = 1, type = '') => ({ name, size, lastModified, type });
  const KB = 1024;

  it('the limits are the server\'s own (ReportPicture, ReportFile, SupportPages)', () => {
    const num = (cls, k) => Number((src(`src/${cls}.php`).match(new RegExp(`const ${k} = ([\\d_]+);`)) || [])[1]?.replaceAll('_', ''));
    assert.equal(f.LIMITS.pictures, num('ReportPicture', 'MAX_PER_MESSAGE'));
    assert.equal(f.LIMITS.pictureBytes, num('ReportPicture', 'UPLOAD_MAX_BYTES'));
    assert.equal(f.LIMITS.texts, num('ReportFile', 'MAX_PER_MESSAGE'));
    assert.equal(f.LIMITS.textBytes, num('ReportFile', 'MAX_BYTES'));
    assert.match(src('src/SupportPages.php'), new RegExp(`PICTURE_EXTENSIONS = \\['${f.PICTURE_EXTENSIONS.join("', '")}'\\]`));
    assert.match(src('src/ReportFile.php'), new RegExp(`EXTENSIONS = \\['${f.TEXT_EXTENSIONS.join("', '")}'\\]`));
    assert.match(src('src/ReportPicture.php'), /'That picture is larger than 10 MB\.'/, 'the limit the words name');
  });

  it('a PNG is added; a renamed .html is refused by its name, as the server does', () => {
    const png = file('shot.PNG', 200 * KB);
    let r = f.addFiles([], [png]);
    assert.deepEqual(r.files, [png]);
    assert.deepEqual(r.refused, []);
    assert.equal(f.kindOf('shot.PNG'), 'picture');
    assert.equal(f.kindOf('a.webp'), 'picture');
    assert.equal(f.kindOf('game.LOG'), 'text');
    for (const name of ['page.html', 'shot.png.html', 'notes.txt.html', 'drawing.svg', 'clip.gif', 'noending']) {
      r = f.addFiles([png], [file(name)]);
      assert.deepEqual(r.files, [png], `${name} refused`);
      assert.equal(r.refused[0].why, `${name} was not added: only pictures (JPEG, PNG or WebP) and text files (.txt or .log) can be added.`);
    }
  });

  it('counts: a third text file and a fifth picture are refused, the rest kept in order', () => {
    const texts = [file('a.txt'), file('b.log')];
    let r = f.addFiles(texts, [file('c.txt'), file('d.png')]);
    assert.deepEqual(r.files.map((x) => x.name), ['a.txt', 'b.log', 'd.png'], 'appended after the ones chosen');
    assert.equal(r.refused.length, 1);
    assert.equal(r.refused[0].why, 'c.txt was not added: a message carries at most 2 text files.');
    const four = [1, 2, 3, 4].map((n) => file(`p${n}.jpg`, 50 * KB, n));
    r = f.addFiles([], [...four, file('p5.webp', 50 * KB, 5), file('notes.txt')]);
    assert.deepEqual(r.files.map((x) => x.name), ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'notes.txt'], 'a text file still fits beside four pictures');
    assert.equal(r.refused[0].why, 'p5.webp was not added: a message carries at most 4 pictures.');
    // Removing one makes room again.
    r = f.addFiles(f.removeFile(r.files, 1), [file('p5.webp', 50 * KB, 5)]);
    assert.deepEqual(r.files.map((x) => x.name), ['p1.jpg', 'p3.jpg', 'p4.jpg', 'notes.txt', 'p5.webp']);
  });

  it('sizes: a 300 KB .txt and an 11 MB picture are refused; 256 KB and 10 MB exactly pass; an empty file is refused', () => {
    let r = f.addFiles([], [file('console.txt', 300 * KB)]);
    assert.deepEqual(r.files, []);
    assert.equal(r.refused[0].why, 'console.txt was not added: a text file can be up to 256 KB. Send the part around the problem.');
    r = f.addFiles([], [file('big.jpg', 11 * 1024 * KB)]);
    assert.equal(r.refused[0].why, 'big.jpg was not added: a picture can be up to 10 MB.');
    r = f.addFiles([], [file('edge.txt', 256 * KB), file('edge.png', 10 * 1024 * KB)]);
    assert.equal(r.files.length, 2);
    r = f.addFiles([], [file('empty.log', 0)]);
    assert.equal(r.refused[0].why, 'empty.log was not added: it is empty.');
  });

  it('duplicates: the same file twice is added once, in one drop or across two', () => {
    const a = file('a.png', 5000, 42);
    let r = f.addFiles([], [a, { ...a }]);
    assert.equal(r.files.length, 1);
    assert.equal(r.refused[0].why, 'a.png is already added.');
    r = f.addFiles(r.files, [{ ...a }, file('a.png', 5001, 42)]);
    assert.deepEqual(r.files.map((x) => x.size), [5000, 5001], 'same name, other bytes: a different file');
    assert.ok(f.sameFile(a, { ...a }));
    assert.ok(!f.sameFile(a, { ...a, lastModified: 43 }));
  });

  it('names: a pasted screenshot is named for what it is; a picture with no ending gets one from its type', () => {
    assert.equal(f.uploadName('image.png', 'image/png', { pasted: 1 }), 'pasted-picture-1.png');
    assert.equal(f.uploadName('', 'image/jpeg', { pasted: 2 }), 'pasted-picture-2.jpg');
    assert.equal(f.uploadName('Screenshot', 'image/webp'), 'Screenshot.webp');
    assert.equal(f.uploadName('log', 'text/plain'), 'log.txt');
    assert.equal(f.uploadName('page.html', 'text/html'), 'page.html', 'never renamed into something allowed');
    assert.equal(f.uploadName('evil.html', 'image/png'), 'evil.html', 'an ending it has is kept, to be refused by it');
    assert.equal(f.uploadName('clip', 'image/gif', { pasted: 3 }), 'clip');
  });

  it('shrinking: a 4000x3000 photo is drawn again at 1600x1200; a small PNG screenshot goes as it is', () => {
    assert.equal(f.MAX_SIDE, 1600);
    assert.equal(f.QUALITY, 0.85);
    assert.deepEqual(f.shrinkPlan({ width: 4000, height: 3000, bytes: 4 * 1024 * KB }), { width: 1600, height: 1200, redraw: true });
    assert.deepEqual(f.shrinkPlan({ width: 3000, height: 4000, bytes: 3 * 1024 * KB }), { width: 1200, height: 1600, redraw: true }, 'upright (the EXIF turn applied first)');
    assert.deepEqual(f.shrinkPlan({ width: 300, height: 200, bytes: 20 * KB }), { width: 300, height: 200, redraw: false });
    assert.deepEqual(f.shrinkPlan({ width: 1440, height: 900, bytes: 900 * KB }), { width: 1440, height: 900, redraw: true }, 'a big PNG screenshot within 1600 px: drawn again as JPEG at its size');
    assert.deepEqual(f.shrinkPlan({ width: 1600, height: 1000, bytes: 300 * KB }), { width: 1600, height: 1000, redraw: false });
    assert.deepEqual(f.shrinkPlan({ width: 8000, height: 200, bytes: 2 * 1024 * KB }), { width: 2560, height: 64, redraw: true }, 'never under the server\'s 64 pixels a side');
    assert.equal(f.jpegName('IMG_0412.HEIC.png'), 'IMG_0412.HEIC.jpg');
    assert.equal(f.jpegName('shot.png'), 'shot.jpg');
    // The same photo dropped twice is one, though the first went up smaller and renamed.
    const photo = file('IMG_1.jpeg', 4 * 1024 * KB, 9);
    const small = { name: 'IMG_1.jpg', size: 380 * KB, lastModified: 9, origin: photo };
    assert.equal(f.addFiles([small], [photo]).refused[0].why, 'IMG_1.jpeg is already added.');
    assert.equal(f.addFiles([], [{ ...file('tiny.png', 300), tooSmall: true }]).refused[0].why, 'tiny.png was not added: a picture is at least 64 pixels on each side.');
    assert.equal(f.addFiles([], [{ ...file('x.jpg', 0), unread: true }]).refused[0].why, 'x.jpg was not added: that picture could not be read.');
  });

  it('the server\'s real limits from the form, and the whole message within an 8 MB request', () => {
    const live = f.limitsFrom({ fileMax: '2097152', textMax: '262144', postMax: '8388608' });
    assert.deepEqual([live.pictureBytes, live.textBytes, live.postBytes, live.pictures, live.texts], [2097152, 262144, 8388608, 4, 2]);
    const none = f.limitsFrom({});
    assert.deepEqual([none.pictureBytes, none.textBytes, none.postBytes], [10485760, 262144, 0], 'its own limits without the data');
    assert.equal(f.limitsFrom({ fileMax: 'lots', postMax: '-1' }).pictureBytes, 10485760);
    // Per file: a 3 MB picture that could not be made smaller is over the server's 2 MB.
    assert.equal(f.addFiles([], [file('raw.png', 3 * 1024 * KB)], live).refused[0].why, 'raw.png was not added: a picture can be up to 2 MB.');
    // The whole request: four 1.95 MB pictures fit 8 MB less room for the words; a text file on top does not.
    const four = [1, 2, 3, 4].map((n) => file(`p${n}.jpg`, 1.95 * 1024 * KB, n));
    let r = f.addFiles([], four, live);
    assert.equal(r.files.length, 4);
    r = f.addFiles(r.files, [file('console.log', 250 * KB)], live);
    assert.equal(r.refused[0].why, 'console.log was not added: together the files would be too big to send. Send fewer at a time.');
    r = f.addFiles(f.removeFile(r.files, 0), [file('console.log', 250 * KB)], live);
    assert.deepEqual(r.files.map((x) => x.name), ['p2.jpg', 'p3.jpg', 'p4.jpg', 'console.log'], 'room again after a Remove');
    // Shrunk photos are a few hundred KB: four of them and two logs are far inside.
    r = f.addFiles([], [...[1, 2, 3, 4].map((n) => file(`s${n}.jpg`, 420 * KB, n)), file('a.log', 256 * KB), file('b.txt', 256 * KB)], live);
    assert.equal(r.files.length, 6);
    assert.equal(f.addFiles([], [file('big.jpg', 9 * 1024 * KB)], none).refused.length, 0, 'no request limit known: only the per-file one');
  });

  it('the lines a player reads: sizes as the server writes them, what was added and what was not, no em dashes', () => {
    assert.equal(f.sizeText(10), '1 KB');
    assert.equal(f.sizeText(2048), '2 KB');
    assert.equal(f.sizeText(300 * KB), '300 KB');
    assert.equal(f.sizeText(1024 * KB), '1 MB');
    assert.equal(f.sizeText(2.5 * 1024 * KB), '2.5 MB');
    assert.deepEqual(f.addedLine(f.addFiles([], [file('a.png'), file('b.png', 2)])), { text: '2 files added.', bad: false });
    assert.deepEqual(f.addedLine(f.addFiles([], [file('a.png'), file('x.html')])),
      { text: '1 file added. x.html was not added: only pictures (JPEG, PNG or WebP) and text files (.txt or .log) can be added.', bad: true });
    assert.deepEqual(f.addedLine({ added: [], refused: [] }), { text: '', bad: false });
    assert.doesNotMatch(src('community/support-files.js'), /\u2014/);
    assert.doesNotMatch(src('src/SupportPages.php'), /\u2014/);
  });
});
