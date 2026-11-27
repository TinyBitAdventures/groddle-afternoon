<?php
/**
 * Support on the website (groddle-afternoon-site src/SupportPages.php, Tickets.php, TicketStore.php,
 * TicketFiles.php, ReportPicture.php acceptUpload, ReportFile.php, AdminTickets.php) run against a
 * throwaway MariaDB database and printed as JSON (tests/support-pages.test.js). The database
 * (test_groddle_support_<hex>: users, usermeta, options, posts and every table of the site's
 * minn.json) is made here and dropped at the end, with the temp files the uploads use.
 *
 *   php tests/fixtures/support/support-pages.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-support-none/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
spl_autoload_register(static function (string $class) use ($extension): void {
    $prefix = 'Groddle\\Minn\\';
    if (str_starts_with($class, $prefix) && is_file($file = $extension . '/src/' . substr($class, strlen($prefix)) . '.php')) {
        require $file;
    }
});
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

use Groddle\Minn\AdminTickets;
use Groddle\Minn\Characters;
use Groddle\Minn\ReportFile;
use Groddle\Minn\ReportPicture;
use Groddle\Minn\SupportPages;
use Groddle\Minn\TicketFiles;
use Groddle\Minn\TicketPictures;
use Groddle\Minn\Tickets;
use Groddle\Minn\TicketStore;
use Minn\Auth\Capabilities;
use Minn\Auth\Nonce;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\Http\Response;
use Minn\Http\RouteMiss;
use Minn\RestError;

const PREFIX = 'wp_';
const ADMIN = 900;
const ADA = 910;
const BEA = 911;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

/** A GD picture of $w x $h as $type bytes (a gradient, so the JPEG has something to hold). */
function picture(int $w, int $h, string $type, bool $alpha = false): string
{
    $im = imagecreatetruecolor($w, $h);
    if ($alpha) {
        imagesavealpha($im, true);
        imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
        imagefilledellipse($im, intdiv($w, 2), intdiv($h, 2), intdiv($w, 2), intdiv($h, 2), imagecolorallocatealpha($im, 200, 40, 40, 0));
    } else {
        for ($x = 0; $x < $w; $x += 8) {
            imagefilledrectangle($im, $x, 0, $x + 7, $h, imagecolorallocate($im, ($x * 3) % 256, 120, (($x * 7) % 256)));
        }
    }
    ob_start();
    match ($type) {
        'png' => imagepng($im),
        'webp' => imagewebp($im, null, 80),
        default => imagejpeg($im, null, 90),
    };
    return (string) ob_get_clean();
}

/** A JPEG with an EXIF APP1 segment saying orientation $o (and a GPS-looking comment that must not be kept). */
function jpegWithOrientation(string $jpeg, int $o): string
{
    // TIFF, little endian: header, IFD0 at 8 with one entry (0x0112 SHORT 1 = $o), next IFD 0.
    $tiff = 'II' . pack('v', 42) . pack('V', 8) . pack('v', 1) . pack('vvVvv', 0x0112, 3, 1, $o, 0) . pack('V', 0) . 'GPS 51.5N 0.1W';
    $app1 = "Exif\0\0" . $tiff;
    return "\xFF\xD8" . "\xFF\xE1" . pack('n', strlen($app1) + 2) . $app1 . substr($jpeg, 2);
}

$name = 'test_groddle_support_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
$tmpFiles = [];
try {
    $conn = connect($host, $user, $pass, $name);
    $conn->query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach ($manifest['tables'] as $t => $cols) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $cols) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "users (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_login varchar(60) NOT NULL DEFAULT '', user_pass varchar(255) NOT NULL DEFAULT '', user_nicename varchar(50) NOT NULL DEFAULT '', user_email varchar(100) NOT NULL DEFAULT '', user_url varchar(100) NOT NULL DEFAULT '', user_registered datetime NOT NULL, user_activation_key varchar(255) NOT NULL DEFAULT '', user_status int(11) NOT NULL DEFAULT 0, display_name varchar(250) NOT NULL DEFAULT '', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    // The pages' header reads the site's menu pages; the console's list counts old report posts.
    $conn->query('CREATE TABLE ' . PREFIX . "posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_author bigint(20) unsigned NOT NULL DEFAULT 0, post_date datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_date_gmt datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_content longtext NOT NULL DEFAULT '', post_title text NOT NULL DEFAULT '', post_excerpt text NOT NULL DEFAULT '', post_status varchar(20) NOT NULL DEFAULT 'publish', comment_status varchar(20) NOT NULL DEFAULT 'open', ping_status varchar(20) NOT NULL DEFAULT 'open', post_password varchar(255) NOT NULL DEFAULT '', post_name varchar(200) NOT NULL DEFAULT '', to_ping text NOT NULL DEFAULT '', pinged text NOT NULL DEFAULT '', post_modified datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_modified_gmt datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_content_filtered longtext NOT NULL DEFAULT '', post_parent bigint(20) unsigned NOT NULL DEFAULT 0, guid varchar(255) NOT NULL DEFAULT '', menu_order int(11) NOT NULL DEFAULT 0, post_type varchar(20) NOT NULL DEFAULT 'post', post_mime_type varchar(100) NOT NULL DEFAULT '', comment_count bigint(20) NOT NULL DEFAULT 0, PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'postmeta (meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY post_id (post_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $site->setOption('home', 'https://groddle.test');
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);
    $person = static function (int $id, string $character, string $role) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "login-{$id}", '$P$none', "p{$id}@groddle.test", $at($now - 86400), "login-{$id}"]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400)]);
    };
    $person(ADMIN, 'Staffer', 'administrator');
    $person(ADA, 'Ada', 'subscriber');
    $person(BEA, 'Bea', 'subscriber');

    $caps = Capabilities::fromDb($db);
    $token = static fn (int $as): string => $as > 0 ? 'token-' . $as : '';
    $nonce = static fn (int $as): string => Nonce::create($as, $token($as));
    $request = static fn (Method $method, string $path, array $query = [], array $form = [], array $files = [], array $headers = []): Request => new Request($method, $path, $query, $headers, [], '', true, 'groddle.test', $form, $files);
    $seams = static fn (int $as, Request $r): Seams => new Seams($db, $site, $r, Reader::forUser($as, $caps, '', $token($as)));
    // A page route's answer: status, body, Location; 'miss' for the site's 404 (RouteMiss).
    $page = static function (int $as, Request $r, Closure $call) use ($seams): array {
        try {
            /** @var Response $res */
            $res = $call($seams($as, $r));
            return ['status' => $res->status, 'body' => $res->body, 'location' => $res->headers['Location'] ?? null, 'headers' => $res->headers];
        } catch (RouteMiss) {
            return ['status' => 404, 'miss' => true];
        } catch (Throwable $e) {
            return ['status' => 0, 'error' => get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine()];
        }
    };
    $api = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };
    $list = static fn (int $as, array $query = []) => $page($as, $request(Method::Get, '/chat/support/', $query), static fn (Seams $s) => (new SupportPages($s))->index($request(Method::Get, '/chat/support/', $query)));
    $show = static function (int $as, int $id, array $query = []) use ($page, $request): array {
        $r = $request(Method::Get, "/chat/support/{$id}/", $query);
        return $page($as, $r, static fn (Seams $s) => (new SupportPages($s))->report($r, (string) $id));
    };
    $tmp = static function (string $bytes) use (&$tmpFiles): string {
        $f = tempnam(sys_get_temp_dir(), 'gsup');
        file_put_contents($f, $bytes);
        $tmpFiles[] = $f;
        return $f;
    };
    /** $_FILES' files[] for a list of [name, bytes]. */
    $upload = static function (array $list) use ($tmp): array {
        $f = ['name' => [], 'type' => [], 'tmp_name' => [], 'error' => [], 'size' => []];
        foreach ($list as [$n, $bytes]) {
            $f['name'][] = $n;
            $f['type'][] = 'application/octet-stream';
            $f['tmp_name'][] = $tmp($bytes);
            $f['error'][] = UPLOAD_ERR_OK;
            $f['size'][] = strlen($bytes);
        }
        return $list === [] ? [] : ['files' => $f];
    };
    $post = static function (int $as, string $path, Closure $call, array $form, array $files = [], bool $withNonce = true) use ($page, $request, $nonce): array {
        $r = $request(Method::Post, $path, [], $form + ($withNonce ? ['_wpnonce' => $nonce($as)] : []), $files);
        return $page($as, $r, static fn (Seams $s) => $call(new SupportPages($s), $r));
    };
    $reply = static fn (int $as, int $id, string $message, array $files = [], bool $withNonce = true) => $post($as, "/chat/support/{$id}/reply/", static fn (SupportPages $p, Request $r) => $p->reply($r, (string) $id), ['message' => $message], $files, $withNonce);
    $close = static fn (int $as, int $id) => $post($as, "/chat/support/{$id}/close/", static fn (SupportPages $p, Request $r) => $p->close($r, (string) $id), []);
    $reopen = static fn (int $as, int $id) => $post($as, "/chat/support/{$id}/reopen/", static fn (SupportPages $p, Request $r) => $p->reopen($r, (string) $id), []);
    $row = static fn (int $id): array => (array) $db->row('SELECT status, closed_by, last_author_role, player_read_at, last_message_at FROM ' . $db->table(TicketStore::TABLE) . ' WHERE id = ?', [$id]);
    $gameThread = static function (int $as, int $id) use ($api, $request, $seams): array {
        $r = $request(Method::Get, "/groddle/v1/tickets/{$id}");
        return $api(static fn () => (new Tickets($seams($as, $r)))->show($r, (string) $id));
    };
    $consoleThread = static function (int $id) use ($api, $request, $seams): array {
        $r = $request(Method::Get, "/groddle/v1/admin/tickets/{$id}");
        return $api(static fn () => (new AdminTickets($seams(ADMIN, $r)))->show($r, (string) $id));
    };
    $ids = static fn (string $html): array => array_map('intval', preg_match_all('/data-ticket="(\d+)"/', $html, $m) ? $m[1] : []);

    // == Signed out: a short line and the sign-in links, nothing of anyone's reports ==
    $store = new TicketStore($db);
    $beaReport = $store->open(BEA, "Bea's door sticks.", ['street' => 'LA5101HF7F429V5', 'streetName' => 'Hechey Track', 'build' => 'v0.78.0'], $now - 5000);
    $out['signedOut'] = $list(0);
    $out['signedOutReport'] = $show(0, $beaReport);

    // == Ada's reports: open, answered (unread), working, closed, and a crowd for paging ==
    $open = $store->open(ADA, "The pig floats.\nIt floats over the fence.", ['streetName' => 'Groddle Meadow', 'build' => 'v0.78.0', 'agent' => 'Firefox 140', 'screen' => '390x844', 'errors' => ['TypeError: x is undefined']], $now - 4000);
    $answered = $store->open(ADA, 'My hat vanished.', [], $now - 3900);
    $store->add($answered, ADMIN, TicketStore::ADMIN, 'Found it, a fix is coming.', $now - 3000);
    $working = $store->open(ADA, 'Quoins stuck.', [], $now - 3800);
    $store->setStatus($working, TicketStore::WORKING, $now - 3700);
    $closed = $store->open(ADA, 'Old one.', [], $now - 3600);
    $store->setStatus($closed, TicketStore::CLOSED, $now - 3500, TicketStore::ADMIN);
    for ($i = 0; $i < 22; $i++) {
        $store->open(ADA, "Crowd report {$i}.", [], $now - 20000 + $i);
    }
    $all = $list(ADA);
    $out['list'] = [
        'status' => $all['status'],
        'ids' => $ids($all['body'] ?? ''),
        'html' => $all['body'] ?? ($all['error'] ?? ''),
        'cache' => $all['headers']['Cache-Control'] ?? null,
    ];
    $out['list2'] = ['ids' => $ids($list(ADA, ['page' => '2'])['body'] ?? '')];
    $out['filters'] = [];
    foreach (['open', 'answered', 'working', 'closed', 'nonsense'] as $s) {
        $r = $list(ADA, ['status' => $s]);
        $out['filters'][$s] = ['ids' => $ids($r['body'] ?? ''), 'current' => preg_match('/<a class="cx-chip csupport-filter" href="[^"]*"( aria-current="page")?>' . preg_quote(SupportPages::FILTERS[SupportPages::status($s)], '/') . ' <span class="csupport-n">(\d+)<\/span>/', $r['body'] ?? '', $m) ? ['current' => $m[1] !== '', 'n' => (int) $m[2]] : null];
    }
    $out['context'] = ['game' => SupportPages::contextHtml(TicketStore::contextOf((array) $store->find($open))), 'none' => SupportPages::contextHtml([]), 'web' => SupportPages::contextHtml(['from' => 'website', 'agent' => 'Safari <iPhone>'])];
    $out['ids'] = ['bea' => $beaReport, 'open' => $open, 'answered' => $answered, 'working' => $working, 'closed' => $closed];
    $out['beaList'] = $ids($list(BEA)['body'] ?? '');

    // == Owner only: another player's report, its picture and its file are the site's 404 ==
    $pngBytes = picture(320, 200, 'png', true);
    $beaFiles = $upload([['bea.png', $pngBytes], ['bea.log', "line one\nline two\n"]]);
    $beaReply = $reply(BEA, $beaReport, 'Here is a picture and my log.', $beaFiles);
    $beaMsg = (int) $db->value('SELECT MAX(id) FROM ' . $db->table(TicketStore::MESSAGES) . ' WHERE ticket_id = ?', [$beaReport]);
    $pic = static function (int $as, int $t, int $m, int $n) use ($page, $request): array {
        $r = $request(Method::Get, "/report-pictures/{$t}/{$m}/{$n}");
        return $page($as, $r, static fn (Seams $s) => (new TicketPictures($s))->messagePictureN($r, (string) $t, (string) $m, (string) $n));
    };
    $file = static function (int $as, int $t, int $m, int $n) use ($page, $request): array {
        $r = $request(Method::Get, "/report-files/{$t}/{$m}/{$n}");
        return $page($as, $r, static fn (Seams $s) => (new TicketFiles($s))->file($r, (string) $t, (string) $m, (string) $n));
    };
    $out['owner'] = [
        'beaReply' => ['status' => $beaReply['status'], 'location' => $beaReply['location'] ?? null, 'error' => $beaReply['error'] ?? null],
        'adaSeesBea' => $show(ADA, $beaReport)['status'],
        'adaRepliesBea' => $reply(ADA, $beaReport, 'Not mine.')['status'],
        'adaClosesBea' => $close(ADA, $beaReport)['status'],
        'adaReopensBea' => $reopen(ADA, $beaReport)['status'],
        'adaPicture' => $pic(ADA, $beaReport, $beaMsg, 1)['status'],
        'adaFile' => $file(ADA, $beaReport, $beaMsg, 1)['status'],
        'outPicture' => $pic(0, $beaReport, $beaMsg, 1)['status'],
        'outFile' => $file(0, $beaReport, $beaMsg, 1)['status'],
        'beaPicture' => ($p = $pic(BEA, $beaReport, $beaMsg, 1))['status'],
        'beaPictureType' => $p['headers']['Content-Type'] ?? null,
        'beaPictureJpeg' => str_starts_with($p['body'] ?? '', "\xFF\xD8\xFF"),
        'beaFile' => ($f = $file(BEA, $beaReport, $beaMsg, 1))['status'],
        'beaFileHeaders' => $f['headers'] ?? null,
        'beaFileBody' => $f['body'] ?? null,
        'adminFile' => $file(ADMIN, $beaReport, $beaMsg, 1)['status'],
        'adminPicture' => $pic(ADMIN, $beaReport, $beaMsg, 1)['status'],
        'missingFile' => $file(BEA, $beaReport, $beaMsg, 2)['status'],
        'beaStill' => $row($beaReport)['status'],
        'adaGameRoute' => $gameThread(ADA, $beaReport)['status'],
        'unknown' => $show(ADA, 999999)['status'],
    ];

    // == The reply round trip: a web reply is in the game's thread and the console's, and the other way round ==
    $listBefore = $list(ADA)['body'] ?? '';
    $out['unreadBefore'] = preg_match('/data-ticket="' . $answered . '"[^>]*>.*?<\/a>/s', $listBefore, $m) ? str_contains($m[0], 'data-unread') : null;
    $out['railBadge'] = preg_match('/id="cx-sec-support".*?<span class="cx-badge"[^>]*>(\d+)<\/span>/s', $listBefore, $m) ? (int) $m[1] : null;
    $view = $show(ADA, $answered);
    $out['thread'] = ['status' => $view['status'], 'html' => $view['body'] ?? ($view['error'] ?? '')];
    $out['unreadAfter'] = preg_match('/data-ticket="' . $answered . '"[^>]*>.*?<\/a>/s', $list(ADA)['body'] ?? '', $m) ? str_contains($m[0], 'data-unread') : null;
    $webReply = $reply(ADA, $answered, "Thanks! Still floating\nafter the fix?");
    $out['webReply'] = ['status' => $webReply['status'], 'location' => $webReply['location'] ?? null, 'error' => $webReply['error'] ?? null, 'row' => $row($answered)];
    $game = $gameThread(ADA, $answered);
    $console = $consoleThread($answered);
    $out['gameSees'] = array_map(static fn (array $m): array => ['author' => $m['author'], 'body' => $m['body']], $game['body']['messages'] ?? []);
    $out['consoleSees'] = array_map(static fn (array $m): array => ['author' => $m['author'], 'body' => $m['body'], 'files' => $m['files'] ?? null], $console['body']['messages'] ?? []);
    // An administrator's note from the console (no email), then a game reply: both on the web page.
    $r = $request(Method::Post, "/groddle/v1/admin/tickets/{$answered}/reply", [], [], [], []);
    $r = new Request(Method::Post, "/groddle/v1/admin/tickets/{$answered}/reply", [], [], [], json_encode(['message' => 'Console note for you.', 'email' => false]), true, 'groddle.test');
    $out['consoleReply'] = $api(static fn () => (new AdminTickets($seams(ADMIN, $r)))->reply($r, (string) $answered))['status'];
    $r = new Request(Method::Post, "/groddle/v1/tickets/{$answered}/messages", [], [], [], json_encode(['message' => 'Sent from the game.']), true, 'groddle.test');
    $out['gameReply'] = $api(static fn () => (new Tickets($seams(ADA, $r)))->reply($r, (string) $answered))['status'];
    $web = $show(ADA, $answered)['body'] ?? '';
    $out['webSees'] = ['console' => str_contains($web, 'Console note for you.'), 'game' => str_contains($web, 'Sent from the game.'), 'mine' => str_contains($web, 'Still floating<br />after the fix?'), 'latest' => str_contains($web, 'id="latest"')];

    // == Close and reopen, with who closed it ==
    $c = $close(ADA, $open);
    $afterClose = $row($open);
    $closedPage = $show(ADA, $open)['body'] ?? '';
    $o = $reopen(ADA, $open);
    $out['closeReopen'] = [
        'close' => ['status' => $c['status'], 'location' => $c['location'] ?? null, 'row' => $afterClose],
        'closedPage' => ['closedByYou' => str_contains($closedPage, 'Closed by you'), 'reopenForm' => str_contains($closedPage, "/chat/support/{$open}/reopen/"), 'closeForm' => str_contains($closedPage, "/chat/support/{$open}/close/")],
        'reopen' => ['status' => $o['status'], 'location' => $o['location'] ?? null, 'row' => $row($open)],
        'consoleClosedBy' => null,
    ];
    $close(ADA, $open);
    $out['closeReopen']['consoleClosedBy'] = $consoleThread($open)['body']['ticket']['closedBy'] ?? null;
    // A reply to a closed report opens it again (the game's rule).
    $reply(ADA, $open, 'Back again.');
    $out['closeReopen']['replyOpens'] = $row($open);
    // Reopening one the team is working on leaves it as it is.
    $reopen(ADA, $working);
    $out['closeReopen']['workingStays'] = $row($working)['status'];

    // == Reactions on a report's messages: chips on the page, added through the game's own route ==
    // The page names the route's parts (the report and each message) and carries the REST nonce and the set.
    $adminName = static fn (string $display) => $db->execute('UPDATE ' . $db->table('users') . ' SET display_name = ? WHERE ID = ?', [$display, ADMIN]);
    $adminName('Morgan Lee');
    $reactRoute = static function (int $as, int $t, int $m, mixed $e, bool $on = true, bool $admin = false) use ($api, $seams): array {
        $path = $admin ? "/groddle/v1/admin/tickets/{$t}/messages/{$m}/reactions" : "/groddle/v1/tickets/{$t}/messages/{$m}/reactions";
        $r = new Request(Method::Post, $path, [], [], [], json_encode(['e' => $e, 'on' => $on]), true, 'groddle.test');
        return $api(static fn () => $admin ? (new AdminTickets($seams($as, $r)))->react($r, (string) $t, (string) $m) : (new Tickets($seams($as, $r)))->react($r, (string) $t, (string) $m));
    };
    $reactRows = static fn (int $t): array => array_map(static fn (array $r): array => ['message' => (int) $r['message_id'], 'user' => (int) $r['user_id'], 'role' => $r['role'], 'e' => $r['reaction']], $db->rows('SELECT message_id, user_id, role, reaction FROM ' . $db->table(\Groddle\Minn\TicketReactions::TABLE) . ' WHERE ticket_id = ? ORDER BY created_at, message_id, reaction', [$t]));
    /** Each message li of a page: its id, author, chips [key, n, pressed, tip] and whether it has React. */
    $msgView = static function (string $html): array {
        $out = [];
        preg_match_all('/<li class="cpost csupport-msg"[^>]*data-author="(\w+)" data-message="(\d+)">(.*?)<\/li>(?=\s*(?:<li class="cpost|<\/ol>))/s', $html, $all, PREG_SET_ORDER);
        foreach ($all as [, $author, $id, $inner]) {
            preg_match_all('/<button type="button" class="cchip" data-react="(\w+)" aria-pressed="(true|false)" title="([^"]*)" aria-label="\3">(.*?)<span>(\d+)<\/span><\/button>/s', $inner, $chips, PREG_SET_ORDER);
            $out[] = [
                'id' => (int) $id,
                'author' => $author,
                'chips' => array_map(static fn (array $c): array => [$c[1], (int) $c[5], $c[2] === 'true', html_entity_decode($c[3], ENT_QUOTES), str_contains($c[4], 'cchip-art cchip-hi')], $chips),
                'box' => preg_match('/<div class="cpost-reactions" data-reactions="' . $id . '"( data-empty="")?>/', $inner, $b) ? ($b[1] ?? '') === '' ? 'chips' : 'empty' : null,
                'react' => preg_match('/<div class="cpost-actions csupport-react" data-react-row="" hidden><button type="button" class="cact" data-react-open aria-haspopup="true" aria-expanded="false" aria-label="([^"]*)">React<\/button><\/div>/', $inner, $rb) ? html_entity_decode($rb[1], ENT_QUOTES) : null,
            ];
        }
        return $out;
    };
    $before = $show(ADA, $answered)['body'] ?? '';
    $pageTicket = preg_match('/data-support-report="(\d+)"/', $before, $m) ? (int) $m[1] : 0;
    $pageNonce = preg_match('/<main [^>]*data-nonce="([0-9a-f]{10})"/', $before, $m) ? $m[1] : '';
    $views = $msgView($before);
    $adminMsg = 0;
    $adaMsg = 0;
    foreach ($views as $v) {
        if ($v['author'] === 'admin' && $adminMsg === 0) {
            $adminMsg = $v['id'];
        }
        if ($v['author'] === 'player' && $adaMsg === 0) {
            $adaMsg = $v['id'];
        }
    }
    $rx = ['before' => $views, 'pageTicket' => $pageTicket === $answered, 'nonceOk' => $pageNonce !== '' && Nonce::verify($pageNonce, ADA, $token(ADA)), 'set' => str_contains($before, ' data-reactions="[{&quot;key&quot;:&quot;like&quot;')];
    // What the page's script sends (community/support-reactions.js: the game's js/reports.js api.react): Thumbs up on the team's reply.
    $rx['web'] = $reactRoute(ADA, $pageTicket, $adminMsg, 'like');
    $rx['webHi'] = $reactRoute(ADA, $pageTicket, $adaMsg, 'hi');
    $rx['rowsAfterWeb'] = $reactRows($answered);
    // The team from the console: Thumbs up beside hers, Thank you on her message.
    $rx['console'] = [$reactRoute(ADMIN, $answered, $adminMsg, 'like', true, true)['status'], $reactRoute(ADMIN, $answered, $adaMsg, 'thanks', true, true)['status']];
    $rx['rows'] = $reactRows($answered);
    $pick = static fn (array $thread, int $msg): array => array_values(array_filter($thread['body']['messages'] ?? [], static fn (array $x): bool => (int) $x['id'] === $msg))[0]['reactions'] ?? [];
    $rx['game'] = ['admin' => $pick($gameThread(ADA, $answered), $adminMsg), 'ada' => $pick($gameThread(ADA, $answered), $adaMsg)];
    $rx['consoleSees'] = ['admin' => $pick($consoleThread($answered), $adminMsg), 'ada' => $pick($consoleThread($answered), $adaMsg)];
    $after = $show(ADA, $answered)['body'] ?? '';
    $rx['after'] = $msgView($after);
    $rx['afterPane'] = substr($after, (int) strpos($after, 'data-cx-pane'));
    // A chip pressed again takes hers off (on: false), and only hers.
    $rx['off'] = $reactRoute(ADA, $answered, $adminMsg, 'like', false)['status'];
    $rx['afterOff'] = array_values(array_filter($msgView($show(ADA, $answered)['body'] ?? ''), static fn (array $v): bool => $v['id'] === $adminMsg))[0]['chips'] ?? null;
    $reactRoute(ADA, $answered, $adminMsg, 'like');
    // Refused: another player's report (missing, as the game's route says), a message of another report, a key outside the set.
    $beaFirst = (int) $db->value('SELECT MIN(id) FROM ' . $db->table(TicketStore::MESSAGES) . ' WHERE ticket_id = ?', [$beaReport]);
    $rx['refused'] = [
        'beaReport' => $reactRoute(ADA, $beaReport, $beaFirst, 'like'),
        'otherMessage' => $reactRoute(ADA, $answered, $beaFirst, 'like'),
        'unknownKey' => $reactRoute(ADA, $answered, $adminMsg, 'someday'),
        'signedOut' => $reactRoute(0, $answered, $adminMsg, 'like'),
    ];
    $rx['rowsEnd'] = $reactRows($answered);
    $rx['beaRows'] = $reactRows($beaReport);
    // React is only on the report's owner's page: another player and the team get the site's 404 here, a visitor the sign-in.
    $rx['pages'] = ['bea' => $show(BEA, $answered)['status'], 'admin' => $show(ADMIN, $answered)['status'], 'out' => str_contains($show(0, $answered)['body'] ?? '', 'data-react-open') ? 'react' : 'none', 'beaOwn' => count(array_filter($msgView($show(BEA, $beaReport)['body'] ?? ''), static fn (array $v): bool => $v['react'] !== null))];
    $adminName('login-' . ADMIN);
    $rx['pure'] = [
        'names' => array_map([SupportPages::class, 'reactionNames'], [[['you' => true]], [['you' => false]], [['you' => true], ['you' => false]], [['you' => false], ['you' => false]], [['you' => false], ['you' => true], ['you' => false]], []]),
    ];
    $out['reactions'] = $rx;

    // == Uploads ==
    $last = static fn (int $t): array => (array) $db->row('SELECT id FROM ' . $db->table(TicketStore::MESSAGES) . ' WHERE ticket_id = ? ORDER BY id DESC LIMIT 1', [$t]);
    $picRows = static fn (int $msg): array => array_map(static fn (array $r): array => ['w' => (int) $r['width'], 'h' => (int) $r['height'], 'jpeg' => str_starts_with((string) $r['picture'], "\xFF\xD8\xFF"), 'bytes' => (int) $r['bytes'], 'exif' => str_contains((string) $r['picture'], 'Exif') || str_contains((string) $r['picture'], 'GPS 51.5N')], $db->rows('SELECT width, height, picture, bytes FROM ' . $db->table(TicketStore::MESSAGE_PICTURES) . ' WHERE message_id = ? ORDER BY position', [$msg]));
    $fileRows = static fn (int $msg): array => array_map(static fn (array $r): array => ['name' => $r['name'], 'bytes' => (int) $r['bytes'], 'body' => $r['body']], $db->rows('SELECT name, bytes, body FROM ' . $db->table(TicketStore::FILES) . ' WHERE message_id = ? ORDER BY position', [$msg]));
    $count = static fn (int $t): int => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(TicketStore::MESSAGES) . ' WHERE ticket_id = ?', [$t]);
    $target = $working;
    $try = static function (string $label, array $files, string $words = 'With files.') use ($reply, $target, $count, $last, $picRows, $fileRows, $upload): array {
        $before = $count($target);
        $r = $reply(ADA, $target, $words, $upload($files));
        $kept = $count($target) > $before;
        $msg = $kept ? (int) $last($target)['id'] : 0;
        preg_match('/<p class="csaid"[^>]*>([^<]*)<\/p>/', $r['body'] ?? '', $said);
        return ['status' => $r['status'], 'kept' => $kept, 'pictures' => $msg ? $picRows($msg) : [], 'files' => $msg ? $fileRows($msg) : [], 'said' => html_entity_decode($said[1] ?? '', ENT_QUOTES), 'wordsKept' => str_contains($r['body'] ?? '', '>' . htmlspecialchars($words) . '</textarea>'), 'error' => $r['error'] ?? null];
    };
    $html = '<!DOCTYPE html><html><body><script>alert(1)</script></body></html>';
    $out['uploads'] = [
        'png' => $try('png', [['shot.png', picture(400, 300, 'png', true)]]),
        'bigPng' => $try('bigPng', [['big.PNG', picture(2000, 1500, 'png')]]),
        'webp' => $try('webp', [['phone.webp', picture(300, 300, 'webp')]]),
        'exif' => $try('exif', [['side.jpg', jpegWithOrientation(picture(200, 100, 'jpeg'), 6)]]),
        'log' => $try('log', [['game console (1).log', "\xEF\xBB\xBF[12:00] \e[31merror\e[0m: pig floats\r\nline 2\n"]]),
        'disguisedPng' => $try('disguisedPng', [['totally.png', $html]], 'Disguised picture.'),
        'pngAsTxt' => $try('pngAsTxt', [['notes.txt', picture(100, 100, 'png')]], 'Picture named txt.'),
        'bigTxt' => $try('bigTxt', [['huge.txt', str_repeat("a long log line\n", 20480)]], 'Huge log.'),
        'html' => $try('html', [['page.html', $html]], 'An html file.'),
        'svg' => $try('svg', [['art.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>']], 'An svg.'),
        'tooManyPictures' => $try('tooMany', array_fill(0, 5, ['p.png', picture(80, 80, 'png')]), 'Five pictures.'),
        'tooManyFiles' => $try('tooManyFiles', array_fill(0, 3, ['a.txt', 'words']), 'Three files.'),
        'tiny' => $try('tiny', [['tiny.png', picture(20, 20, 'png')]], 'Tiny picture.'),
        'mixedBad' => $try('mixedBad', [['ok.png', picture(100, 100, 'png')], ['bad.exe', 'MZ']], 'One good one bad.'),
    ];
    $out['pure'] = [
        'safeName' => [ReportFile::safeName('../../etc/passwd.log'), ReportFile::safeName('rapport été "x".TXT'), ReportFile::safeName('.log'), ReportFile::safeName(str_repeat('n', 200) . '.txt')],
        'kind' => [ReportPicture::uploadKind("\x89PNG\r\n\x1A\n...."), ReportPicture::uploadKind("RIFF\0\0\0\0WEBPVP8 "), ReportPicture::uploadKind('GIF89a'), ReportPicture::uploadKind("\xFF\xD8\xFF\xE0")],
        'orientation' => [ReportPicture::orientation(jpegWithOrientation(picture(80, 80, 'jpeg'), 6)), ReportPicture::orientation(picture(80, 80, 'jpeg')), ReportPicture::orientation("\xFF\xD8\xFF\xE1\x00\x08Exif")],
        'uploadList' => SupportPages::uploadList(['files' => ['name' => ['a.png', ''], 'tmp_name' => ['/x', ''], 'size' => [3, 0], 'error' => [0, UPLOAD_ERR_NO_FILE]]]),
    ];
    // The console's thread lists the log as a file, served as an attachment.
    $consoleFiles = array_values(array_filter(array_map(static fn (array $m): array => $m['files'] ?? [], $consoleThread($target)['body']['messages'] ?? [])));
    $out['consoleFiles'] = $consoleFiles;
    $out['gameFiles'] = array_values(array_filter(array_map(static fn (array $m): array => $m['files'] ?? [], $gameThread(ADA, $target)['body']['messages'] ?? [])));
    $out['reportPage'] = $show(ADA, $target)['body'] ?? '';

    // == A bad nonce or none: nothing kept, the words still there ==
    $before = $count($answered);
    $bad = $reply(ADA, $answered, 'No nonce here.', [], false);
    $out['nonce'] = ['status' => $bad['status'], 'kept' => $count($answered) > $before, 'said' => preg_match('/data-tone="bad">([^<]*)</', $bad['body'] ?? '', $m) ? $m[1] : null, 'wordsKept' => str_contains($bad['body'] ?? '', 'No nonce here.</textarea>')];
    $big = $page(ADA, $request(Method::Post, "/chat/support/{$answered}/reply/", [], [], [], ['content-length' => '90000000']), static fn (Seams $s) => (new SupportPages($s))->reply($request(Method::Post, "/chat/support/{$answered}/reply/", [], [], [], ['content-length' => '90000000']), (string) $answered));
    $out['tooBig'] = ['status' => $big['status'], 'said' => preg_match('/data-tone="bad">([^<]*)</', $big['body'] ?? '', $m) ? $m[1] : null];
    // As a real server has it: the length is CONTENT_LENGTH (a CGI variable), not an HTTP_ header, and PHP dropped every field.
    $cgi = static function (string $length, string $path, \Closure $call) use ($page, $request): array {
        $_SERVER['CONTENT_LENGTH'] = $length;
        try {
            return $page(ADA, $request(Method::Post, $path), static fn (Seams $s) => $call(new SupportPages($s), $request(Method::Post, $path)));
        } finally {
            unset($_SERVER['CONTENT_LENGTH']);
        }
    };
    $said = static fn (array $r): ?string => preg_match('/data-tone="bad">([^<]*)</', $r['body'] ?? '', $m) ? html_entity_decode($m[1], ENT_QUOTES) : null;
    $dropped = $cgi('9000000', "/chat/support/{$answered}/reply/", static fn (SupportPages $p, Request $r) => $p->reply($r, (string) $answered));
    $droppedNew = $cgi('9000000', '/chat/support/new/', static fn (SupportPages $p, Request $r) => $p->create($r));
    $underLimit = $cgi('1000', "/chat/support/{$answered}/reply/", static fn (SupportPages $p, Request $r) => $p->reply($r, (string) $answered));
    $out['postDropped'] = [
        'reply' => ['status' => $dropped['status'], 'said' => $said($dropped), 'page' => str_contains($dropped['body'] ?? '', 'data-support-reply="' . $answered . '"')],
        'new' => ['status' => $droppedNew['status'], 'said' => $said($droppedNew), 'page' => str_contains($droppedNew['body'] ?? '', 'data-support-new=""')],
        'under' => ['status' => $underLimit['status'], 'said' => $said($underLimit)],
    ];

    // == The reply limit: the game's REPLY_PER_WINDOW, the same on the web ==
    $limited = [];
    for ($i = 0; $i < Tickets::REPLY_PER_WINDOW + 2; $i++) {
        $limited[] = $reply(BEA, $beaReport, "Quick reply {$i}.")['status'];
    }
    $out['limit'] = $limited;

    // == A new report from the website: in the console like any other, marked as sent from the website ==
    $newPage = $page(ADA, $request(Method::Get, '/chat/support/new/'), static fn (Seams $s) => (new SupportPages($s))->newReport($request(Method::Get, '/chat/support/new/')));
    $made = $post(ADA, '/chat/support/new/', static fn (SupportPages $p, Request $r) => $p->create($r), ['subject' => 'Bridge gap', 'message' => "I fall through the bridge.\nEvery time."], $upload([['bridge.png', picture(500, 300, 'png')], ['console.txt', 'Uncaught Error at bridge']]));
    $madeId = preg_match('#/chat/support/(\d+)/#', (string) ($made['location'] ?? ''), $m) ? (int) $m[1] : 0;
    $consoleNew = $madeId ? $consoleThread($madeId) : [];
    $out['newReport'] = [
        'form' => ['status' => $newPage['status'], 'multipart' => str_contains($newPage['body'] ?? '', 'enctype="multipart/form-data"'), 'error' => $newPage['error'] ?? null, 'html' => $newPage['body'] ?? ''],
        'status' => $made['status'], 'location' => $made['location'] ?? null, 'error' => $made['error'] ?? null,
        'subject' => $consoleNew['body']['ticket']['subject'] ?? null,
        'from' => $consoleNew['body']['context']['from'] ?? null,
        'page' => $consoleNew['body']['context']['page'] ?? null,
        'picture' => $consoleNew['body']['picture'] ?? null,
        'firstFiles' => $consoleNew['body']['messages'][0]['files'] ?? null,
        'body' => $consoleNew['body']['messages'][0]['body'] ?? null,
        'inGameList' => in_array($madeId, array_map(static fn (array $t): int => $t['id'], $api(static fn () => (new Tickets($seams(ADA, $request(Method::Get, '/groddle/v1/tickets'))))->index($request(Method::Get, '/groddle/v1/tickets')))['body']['tickets'] ?? []), true),
        'empty' => ($e = $post(ADA, '/chat/support/new/', static fn (SupportPages $p, Request $r) => $p->create($r), ['subject' => 'Only a subject', 'message' => '  ']))['status'],
        'emptyKept' => str_contains($e['body'] ?? '', 'value="Only a subject"'),
        'signedOut' => ($so = $page(0, $request(Method::Get, '/chat/support/new/'), static fn (Seams $s) => (new SupportPages($s))->newReport($request(Method::Get, '/chat/support/new/'))))['status'],
        'signedOutLinks' => str_contains($so['body'] ?? '', 'href="/play/online/"'),
    ];
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
    foreach ($tmpFiles as $f) {
        @unlink($f);
    }
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
