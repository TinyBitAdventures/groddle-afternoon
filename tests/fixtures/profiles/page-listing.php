<?php
/**
 * Runs the site repo's groddle/v1/players/<id>/page (G1326: groddle-afternoon-site
 * src/PlayerPageListing.php listing(), PlayerPages::shown()) against a throwaway MariaDB database and prints what
 * happened as JSON (tests/profile-page-verb.test.js): for each made-up character and reader, what
 * the route answers and what the profile page itself answers, so the two are seen to follow one
 * rule. The database (test_groddle_listing_<hex>) is made here and dropped at the end.
 *
 *   php tests/fixtures/profiles/page-listing.php <engine public/minn> <groddle-afternoon-site> <game public/> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $game, $host, $user, $pass] = $argv;
$webroot = sys_get_temp_dir() . '/groddle-listing-test-' . bin2hex(random_bytes(4));
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
use Groddle\Minn\Logins;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\PlayerPageListing;
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
const ADA = 930;   // level 7
const ADA2 = 931;  // level 6, named so its path is the second owner's: zz-ada.931
const CY = 932;    // level 3: only Cy sees the page
const DEE = 933;   // level 7, suspended
const RET = 934;   // level 7, retired
const EVE = 935;   // level 5 exactly
const NOBODY = 999;

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

$name = 'test_groddle_listing_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
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
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character) . $id, $at($now - 86400 + $id)]);
        $state = ['player' => ['level' => $level]];
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]), $at($now)]);
    };
    $person(ADA, 'Zz Ada', 7);
    $person(ADA2, 'Zz-Ada', 6);
    $person(CY, 'Zz Cy', 3);
    $person(DEE, 'Zz Dee', 7);
    $person(RET, 'Zz Ret', 7);
    $person(EVE, 'Zz Eve', 5);
    $db->execute('INSERT INTO ' . $db->table(AdminConsole::BANS) . ' (user_id, reason, admin_user_id, created_at) VALUES (?, ?, 1, ?)', [DEE, 'fixture', $at($now)]);
    $db->execute('INSERT INTO ' . $db->table(Logins::TABLE) . ' (user_id, login_id, created_at, retired_at) VALUES (?, ?, ?, ?)', [RET, RET, $at($now - 86400), $at($now - 3600)]);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path): Request => new Request($method, $path, [], [], [], '', true, 'groddle.test');
    $seams = static fn (int $as, Request $r): Seams => new Seams($db, $site, $r, Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            $body = json_decode($r->body, true);
            return ['status' => $r->status, 'body' => is_array($body) ? $body : null, 'cache' => $r->headers['Cache-Control'] ?? null, 'type' => $r->headers['Content-Type'] ?? null];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        } catch (RouteMiss) {
            return ['status' => 404, 'code' => 'route_miss'];
        }
    };
    $pages = static fn (int $as, Request $r): PlayerPages => new PlayerPages($seams($as, $r), StaticRoot::fromSite($seams($as, $r)));
    $listing = static function (int $as, int $id) use ($request, $seams, $answer): array {
        $r = $request(Method::Get, "/groddle/v1/players/{$id}/page");
        return $answer(static fn (): Response => (new PlayerPageListing($seams($as, $r)))->listing($r, (string) $id));
    };
    $profile = static function (int $as, string $slug) use ($request, $pages, $answer): int {
        $r = $request(Method::Get, "/players/{$slug}/");
        return $answer(static fn (): Response => $pages($as, $r)->profile($r, $slug))['status'];
    };

    // The route's shape: attribute, method and path, public and read-only.
    $method = new ReflectionMethod(PlayerPageListing::class, 'listing');
    $route = $method->getAttributes(Minn\Http\Route::class)[0]->newInstance();
    $out['route'] = [$route->method->name, $route->pattern, $route->policy?->access->name];

    // [character id, the path the game asks the page by (profiles.js profilePagePath)]
    $cases = [
        'ada' => [ADA, 'zz-ada.930'],
        'ada2' => [ADA2, 'zz-ada.931'],
        'cy' => [CY, 'zz-cy.932'],
        'dee' => [DEE, 'zz-dee.933'],
        'ret' => [RET, 'zz-ret.934'],
        'eve' => [EVE, 'zz-eve.935'],
        'nobody' => [NOBODY, 'zz-nobody.999'],
    ];
    foreach (['signed out' => 0, 'eve' => EVE, 'cy' => CY, 'dee' => DEE] as $reader => $as) {
        foreach ($cases as $k => [$id, $slug]) {
            $a = $listing($as, $id);
            // The id path answers 301 on to the page's own address; the page there answers 200 or 404.
            $canonical = Profiles::slugs($db)[$id] ?? null;
            $out['cases'][$reader][$k] = [
                'status' => $a['status'], 'body' => $a['body'], 'cache' => $a['cache'], 'type' => $a['type'],
                'path' => $slug,
                'by id' => $profile($as, $slug),
                'canonical' => $canonical,
                'page' => $canonical === null ? 404 : $profile($as, $canonical),
            ];
        }
    }
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
    rmtree($webroot);
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
