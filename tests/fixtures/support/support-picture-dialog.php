<?php
/**
 * A Support report's picture pop-up (groddle-afternoon-site src/SupportPages.php reportPage and
 * pictureDialog, TicketPictures.php) on a throwaway MariaDB database, printed as JSON for
 * tests/support-picture-dialog.test.js: Ada's report sent from the website with one picture (the
 * report's own), her reply with two more, the team's reply with words only, and the page she sees;
 * then the picture routes for her own picture and for Bea's (still the site's 404 for Ada). Makes and
 * drops test_groddle_support_<hex> only (the bootstrap is tests/fixtures/support/support-pages.php's).
 *
 *   php tests/fixtures/support/support-picture-dialog.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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
    $show = static function (int $as, int $id) use ($page, $request): array {
        $r = $request(Method::Get, "/chat/support/{$id}/");
        return $page($as, $r, static fn (Seams $s) => (new SupportPages($s))->report($r, (string) $id));
    };
    $tmp = static function (string $bytes) use (&$tmpFiles): string {
        $f = tempnam(sys_get_temp_dir(), 'gsup');
        file_put_contents($f, $bytes);
        $tmpFiles[] = $f;
        return $f;
    };
    $upload = static function (array $list) use ($tmp): array {
        $f = ['name' => [], 'type' => [], 'tmp_name' => [], 'error' => [], 'size' => []];
        foreach ($list as [$n, $bytes]) {
            $f['name'][] = $n;
            $f['type'][] = 'application/octet-stream';
            $f['tmp_name'][] = $tmp($bytes);
            $f['error'][] = UPLOAD_ERR_OK;
            $f['size'][] = strlen($bytes);
        }
        return ['files' => $f];
    };
    $post = static function (int $as, string $path, Closure $call, array $form, array $files = []) use ($page, $request, $nonce): array {
        $r = $request(Method::Post, $path, [], $form + ['_wpnonce' => $nonce($as)], $files);
        return $page($as, $r, static fn (Seams $s) => $call(new SupportPages($s), $r));
    };
    $pic = static function (int $as, string $path) use ($page, $request): array {
        $r = $request(Method::Get, $path);
        $parts = array_map('strval', array_slice(explode('/', trim($path, '/')), 1));
        return $page($as, $r, static fn (Seams $s) => count($parts) === 1
            ? (new TicketPictures($s))->picture($r, $parts[0])
            : (new TicketPictures($s))->messagePictureN($r, $parts[0], $parts[1], $parts[2] ?? '1'));
    };

    // == Ada's report from the website: one picture with it, two with her reply, words from the team ==
    $made = $post(ADA, '/chat/support/new/', static fn (SupportPages $p, Request $r) => $p->create($r), ['subject' => 'Bridge gap', 'message' => 'I fall through the bridge.'], $upload([['bridge.png', picture(500, 300, 'png')]]));
    $id = preg_match('#/chat/support/(\d+)/#', (string) ($made['location'] ?? ''), $m) ? (int) $m[1] : 0;
    $replied = $post(ADA, "/chat/support/{$id}/reply/", static fn (SupportPages $p, Request $r) => $p->reply($r, (string) $id), ['message' => 'Two more.'], $upload([['left.png', picture(400, 240, 'png')], ['right.png', picture(240, 400, 'png')]]));
    $store = new TicketStore($db);
    $store->add($id, ADMIN, TicketStore::ADMIN, 'Thanks, we see it.', $now - 60);
    $shown = $show(ADA, $id);
    $out['made'] = ['status' => $made['status'], 'error' => $made['error'] ?? null, 'replied' => $replied['status'], 'id' => $id];
    $out['page'] = ['status' => $shown['status'], 'body' => $shown['body'] ?? '', 'error' => $shown['error'] ?? null];

    // == The pictures themselves: Ada's to Ada; Bea's never to Ada (the site's 404, as before) ==
    $bea = $post(BEA, '/chat/support/new/', static fn (SupportPages $p, Request $r) => $p->create($r), ['subject' => 'Door', 'message' => 'My door sticks.'], $upload([['door.png', picture(300, 200, 'png')]]));
    $beaId = preg_match('#/chat/support/(\d+)/#', (string) ($bea['location'] ?? ''), $m) ? (int) $m[1] : 0;
    $urls = preg_match_all('#<a class="csupport-pic" href="(/report-pictures/[0-9/]+)"#', $out['page']['body'], $m) ? $m[1] : [];
    $out['routes'] = [
        'adaOwn' => array_map(static fn (string $u): int => $pic(ADA, $u)['status'], $urls),
        'adaBea' => $pic(ADA, '/report-pictures/' . $beaId)['status'],
        'beaBea' => $pic(BEA, '/report-pictures/' . $beaId)['status'],
        'beaAda' => $urls === [] ? null : $pic(BEA, $urls[0])['status'],
        'outAda' => $urls === [] ? null : $pic(0, $urls[0])['status'],
    ];
    $out['bea'] = ['status' => $bea['status'], 'id' => $beaId, 'pageForAda' => $show(ADA, $beaId)['status']];
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
