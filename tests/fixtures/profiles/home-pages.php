<?php
/**
 * Runs the site repo's public home pages (G1283: groddle-afternoon-site src/PlayerPages.php
 * place(), visitLinks(), the tower-image picture; src/Profiles.php tower(); src/HomePicture.php
 * 'tower') against a throwaway MariaDB database and prints what happened as JSON
 * (tests/g1283-home-pages.test.js): who sees the home street's and the Tower's pages, signed in
 * or out; the profile's buttons only when a picture is there; a Tower's cutaway upload within
 * its limits. The database (test_groddle_homes_<hex>) is made here and dropped at the end. The
 * players are made-up fixtures.
 *
 *   php tests/fixtures/profiles/home-pages.php <engine public/minn> <groddle-afternoon-site> <game public/> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $game, $host, $user, $pass] = $argv;
$webroot = sys_get_temp_dir() . '/groddle-homes-test-' . bin2hex(random_bytes(4));
mkdir($webroot . '/wp-content/uploads', 0755, true);
define('ABSPATH', $webroot . '/');
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

use Groddle\Minn\AdminConsole;
use Groddle\Minn\Characters;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\PlayerPages;
use Groddle\Minn\Profiles;
use Groddle\Minn\StaticRoot;
use Minn\Auth\Capabilities;
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
const ADA = 920;   // level 7: home street picture (a cottage) and a Tower
const BEA = 921;   // level 7: home street picture, no Tower
const CY = 922;    // level 3: both pictures, so only Cy sees the pages
const DEE = 923;   // level 7: both pictures, suspended
const EVE = 924;   // level 7: no pictures yet

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

function rmtree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($dir);
}

/** A JPEG of $w x $h made by GD (stripes, so it is not one colour). */
function jpeg(int $w, int $h): string
{
    $img = imagecreatetruecolor($w, $h);
    for ($y = 0; $y < $h; $y += 30) {
        imagefilledrectangle($img, 0, $y, $w - 1, $y + 29, (int) imagecolorallocate($img, ($y * 5) % 256, 90, 160));
    }
    ob_start();
    imagejpeg($img, null, 80);
    return (string) ob_get_clean();
}

$name = 'test_groddle_homes_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name, 'gd' => function_exists('imagecreatetruecolor')];
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
    $conn->query('CREATE TABLE ' . PREFIX . "posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_author bigint(20) unsigned NOT NULL DEFAULT 0, post_date datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_content longtext NOT NULL, post_title text NOT NULL, post_status varchar(20) NOT NULL DEFAULT 'publish', post_type varchar(20) NOT NULL DEFAULT 'post', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $site->setOption('home', 'https://groddle.test');
    $site->setOption('groddle_static_root', rtrim($game, '/'));
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    $person = static function (int $id, string $character, int $level) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', "p{$id}@groddle.test", $at($now - 86400), "player-{$id}"]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize(['subscriber' => true])]);
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400 + $id)]);
        $state = ['player' => ['level' => $level]];
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]), $at($now)]);
    };
    $person(ADA, 'Zz Ada', 7);
    $person(BEA, 'Zz Bea', 7);
    $person(CY, 'Zz Cy', 3);
    $person(DEE, 'Zz Dee', 7);
    $person(EVE, 'Zz Eve', 7);
    $db->execute('INSERT INTO ' . $db->table(AdminConsole::BANS) . ' (user_id, reason, admin_user_id, created_at) VALUES (?, ?, 1, ?)', [DEE, 'fixture', $at($now)]);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $body = [], array $query = []): Request => new Request($method, $path, $query, [], [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            $body = json_decode($r->body, true);
            return ['status' => $r->status, 'body' => is_array($body) ? $body : null, 'headers' => $r->headers, 'html' => is_array($body) ? '' : $r->body];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        } catch (RouteMiss) {
            return ['status' => 404, 'code' => 'route_miss'];
        }
    };
    $pages = static fn (int $as, Request $r): PlayerPages => new PlayerPages($seams($as, $r), StaticRoot::fromSite($seams($as, $r)));
    $profiles = static fn (int $as, Request $r): Profiles => new Profiles($seams($as, $r));
    $page = static function (int $as, string $slug, string $place, array $query = []) use ($request, $pages, $answer): array {
        $path = "/players/{$slug}/{$place}/";
        $r = $request(Method::Get, $path, [], $query);
        return $answer(static fn (): Response => $pages($as, $r)->place($r, $slug, $place));
    };
    $profilePage = static function (int $as, string $slug) use ($request, $pages, $answer): array {
        $r = $request(Method::Get, "/players/{$slug}/");
        return $answer(static fn (): Response => $pages($as, $r)->profile($r, $slug));
    };

    // == Pictures, as the game sends them: through Profiles' own routes (HomePicture checks every byte) ==
    $send = static function (int $as, string $route, array $body) use ($request, $profiles, $answer): array {
        $r = $request(Method::Put, "/groddle/v1/profile/{$route}", $body);
        return $answer(static fn (): Response => $profiles($as, $r)->{$route === 'tower' ? 'tower' : 'home'}($r));
    };
    $wait = static function () use ($db): void {
        // The site refuses a second picture within UPLOAD_GAP: the fixture moves the last one back.
        $db->execute('UPDATE ' . $db->table(Profiles::TABLE) . ' SET home_at = DATE_SUB(home_at, INTERVAL 1 HOUR) WHERE home_at IS NOT NULL');
        $db->execute('UPDATE ' . $db->table(Profiles::TABLE) . ' SET tower_at = DATE_SUB(tower_at, INTERVAL 1 HOUR) WHERE tower_at IS NOT NULL');
    };
    if ($out['gd']) {
        $home = base64_encode(jpeg(1440, 752));
        $tall = base64_encode(jpeg(720, 2693));
        foreach ([ADA, BEA, CY, DEE] as $id) {
            $out['upload']['home'][$id] = $send($id, 'home', ['key' => 'h2-meadow-x', 'home' => $home])['status'];
        }
        $wait();
        $first = $send(ADA, 'tower', ['key' => 't1-base-9-0-x', 'tower' => $tall, 'name' => "Zz <b>Spire</b>\u{0007}"]);
        $out['upload']['tower'] = ['status' => $first['status'], 'answer' => $first['body']['tower'] ?? null, 'code' => $first['code'] ?? null];
        $out['upload']['tower row'] = $db->row('SELECT tower_w, tower_h, tower_name, tower_key, tower_type FROM ' . $db->table(Profiles::TABLE) . ' WHERE user_id = ?', [ADA]);
        foreach ([CY, DEE] as $id) {
            $out['upload']['tower others'][$id] = $send($id, 'tower', ['key' => 't1-base-2-0-x', 'tower' => base64_encode(jpeg(720, 909)), 'name' => ''])['status'];
        }
        $wait();
        $out['upload']['too tall'] = $send(ADA, 'tower', ['key' => 't1-x', 'tower' => base64_encode(jpeg(720, 3700))])['code'] ?? null;
        $out['upload']['name too long'] = $send(ADA, 'tower', ['key' => 't1-x', 'tower' => $tall, 'name' => str_repeat('a', 41)])['code'] ?? null;
        $out['upload']['signed out'] = (static function () use ($send): string {
            try {
                return (string) ($send(0, 'tower', ['key' => 't1-x', 'tower' => 'QUJD'])['code'] ?? 'answered');
            } catch (Throwable $e) {
                return 'refused';
            }
        })();
        // The answer every profile call gives carries tower (null before one is sent): the game's sign that the site takes one.
        $r = $request(Method::Get, '/groddle/v1/profile');
        $out['answer bea'] = array_key_exists('tower', $answer(static fn (): Response => $profiles(BEA, $r)->read($r))['body'] ?? []) ? 'tower:null' : 'missing';
    }
    // A layout naming the house (HomeLayout's house spot), as the game sends with the picture.
    $db->execute('UPDATE ' . $db->table(Profiles::TABLE) . ' SET home_layout = ? WHERE user_id = ?', [json_encode(['v' => 1, 'w' => 1680, 'h' => 720, 'spots' => [['k' => 'house', 's' => 'cottage', 'b' => [0, 0, 10, 10]]]]), ADA]);

    // == The pages, signed out (0), signed in as another player (EVE) and as the owner ==
    $summary = static function (array $a): array {
        $html = $a['html'] ?? '';
        return [
            'status' => $a['status'],
            'h1' => preg_match('#<h1>(.*?)</h1>#s', $html, $m) ? $m[1] : null,
            'owned' => preg_match('#Owned by <a href="([^"]+)"><strong>(.*?)</strong></a>#', $html, $m) ? [$m[1], $m[2]] : null,
            'house' => preg_match('#House: <strong>(.*?)</strong>#', $html, $m) ? $m[1] : null,
            'img' => preg_match('#<img src="(/players/\d+/(?:home|tower-image)\?v=\d+)"#', $html, $m) ? preg_replace('/\d{6,}/', 'T', $m[1]) : null,
            'zoom' => preg_match('#class="place-zoom" href="([^"]+)">([^<]+)<#', $html, $m) ? [html_entity_decode($m[1]), $m[2]] : null,
            'framed' => str_contains($html, 'place-tower-framed'),
            'back' => str_contains($html, "s profile</a>"),
            'private' => str_contains($html, 'class="profile-private"'),
            'noindex' => str_contains($html, 'name="robots" content="noindex"'),
            'ogImage' => preg_match('#property="og:image" content="([^"]+)"#', $html, $m) ? preg_replace('/\d{6,}/', 'T', $m[1]) : null,
            'leaks' => preg_match('/@groddle\.test|player-9\d\d|user_email/', $html) === 1,
            'interior' => preg_match('/home_interior|house-inside|interior/i', $html) === 1,
            'cache' => $a['headers']['Cache-Control'] ?? null,
        ];
    };
    $out['street'] = [
        'ada signed out' => $summary($page(0, 'zz-ada', 'home-street')),
        'ada other' => $summary($page(EVE, 'zz-ada', 'home-street')),
        'bea signed out' => $summary($page(0, 'zz-bea', 'home-street')),
        'eve signed out' => $summary($page(0, 'zz-eve', 'home-street')),
        'cy signed out' => $summary($page(0, 'zz-cy', 'home-street')),
        'cy other' => $summary($page(EVE, 'zz-cy', 'home-street')),
        'cy owner' => $summary($page(CY, 'zz-cy', 'home-street')),
        'dee signed out' => $summary($page(0, 'zz-dee', 'home-street')),
        'nobody' => $summary($page(0, 'zz-nobody', 'home-street')),
    ];
    $out['tower'] = [
        'ada signed out' => $summary($page(0, 'zz-ada', 'tower')),
        'ada zoomed' => $summary($page(0, 'zz-ada', 'tower', ['zoom' => '1'])),
        'ada other' => $summary($page(EVE, 'zz-ada', 'tower')),
        'bea signed out' => $summary($page(0, 'zz-bea', 'tower')),
        'eve signed out' => $summary($page(0, 'zz-eve', 'tower')),
        'cy signed out' => $summary($page(0, 'zz-cy', 'tower')),
        'cy owner' => $summary($page(CY, 'zz-cy', 'tower')),
        'dee signed out' => $summary($page(0, 'zz-dee', 'tower')),
    ];
    // A short Tower (two floors) needs no Zoom.
    $out['tower']['cy owner short'] = $out['tower']['cy owner']['zoom'] === null && !$out['tower']['cy owner']['framed'];

    // == The profile's buttons: each only when its picture is there ==
    $buttons = static function (array $a): array {
        $html = $a['html'] ?? '';
        preg_match_all('#<a class="button-tiny" href="([^"]+)">([^<]+)</a>#', $html, $m, PREG_SET_ORDER);
        return ['status' => $a['status'], 'links' => array_map(static fn (array $x): array => [$x[1], html_entity_decode($x[2], ENT_QUOTES)], $m)];
    };
    $out['profile'] = [
        'ada' => $buttons($profilePage(0, 'zz-ada')),
        'bea' => $buttons($profilePage(0, 'zz-bea')),
        'eve' => $buttons($profilePage(0, 'zz-eve')),
    ];

    // == The pictures: public for a listed player, signed out too; a lower one's are its owner's ==
    $image = static function (int $as, int $id, string $kind) use ($request, $pages, $answer): array {
        $r = $request(Method::Get, "/players/{$id}/{$kind}");
        $a = $answer(static fn (): Response => $pages($as, $r)->image($r, (string) $id, $kind));
        return [$a['status'], $a['headers']['Content-Type'] ?? null];
    };
    $out['image'] = [
        'ada tower signed out' => $image(0, ADA, 'tower-image'),
        'bea tower' => $image(0, BEA, 'tower-image'),
        'cy tower signed out' => $image(0, CY, 'tower-image'),
        'cy tower owner' => $image(CY, CY, 'tower-image'),
        'dee tower' => $image(0, DEE, 'tower-image'),
    ];

    // == Paths without the slash go on to the page ==
    $r = $request(Method::Get, '/players/zz-ada/tower');
    $bare = $answer(static fn (): Response => $pages(0, $r)->barePlace($r, 'zz-ada', 'tower'));
    $out['bare'] = [$bare['status'], $bare['headers']['Location'] ?? null];
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
    rmtree($webroot);
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
