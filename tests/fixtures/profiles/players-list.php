<?php
/**
 * Runs the site repo's Players page (G1298: groddle-afternoon-site src/PlayerPages.php index(),
 * visit(), src/PlayerList.php) against a throwaway MariaDB database and prints what it drew as
 * JSON (tests/g1298-players-page.test.js): the order of the cards for each sort, the filters
 * alone and together, the neighbourhood view, "Visit a neighbour", and that a player who appears
 * offline is never online and never shows a last-played time. The database
 * (test_groddle_players_<hex>) is made here and dropped at the end. The players are made-up
 * fixtures.
 *
 *   php tests/fixtures/profiles/players-list.php <engine public/minn> <groddle-afternoon-site> <game public/> <host> <user> <pass> [preview dir]
 *
 * With a preview dir, the cards and the neighbourhood pages are also written there as HTML (with
 * stand-in home pictures), to look at in a browser with the site's stylesheets.
 */

declare(strict_types=1);

[, $engine, $extension, $game, $host, $user, $pass] = $argv;
$preview = $argv[7] ?? '';
$webroot = sys_get_temp_dir() . '/groddle-players-test-' . bin2hex(random_bytes(4));
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
use Groddle\Minn\Buddies;
use Groddle\Minn\Characters;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\PlayerList;
use Groddle\Minn\PlayerPages;
use Groddle\Minn\PlayTime;
use Groddle\Minn\PresenceSetting;
use Groddle\Minn\Profiles;
use Groddle\Minn\Snaps;
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
// id => [name, level, joined days ago, played (seconds ago, null never), appear offline, home [w, h, small] or null, tower, public snaps, private snaps, banned]
const PEOPLE = [
    930 => ['Zz Ada', 9, 10, 3600, false, [1440, 752, true], true, 2, 1, false],
    931 => ['Zz Bea', 12, 30, 3 * 86400, false, [720, 376, false], false, 0, 1, false],
    932 => ['Zz Cy', 5, 2, null, false, null, false, 1, 0, false],
    933 => ['Zz Dee', 7, 60, 3600, true, [1440, 752, true], true, 0, 0, false],   // appears offline, connected
    934 => ['Zz Eve', 3, 1, 60, false, [1440, 752, true], true, 1, 0, false],     // below level 5: never listed
    935 => ['Zz Fin', 8, 4, 60, false, [1440, 752, true], true, 1, 0, true],      // suspended: never listed
    936 => ['Zz Gus', 6, 5, 20 * 86400, false, null, false, 0, 0, false],
];
const ONLINE = [930, 933, 934, 935];

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

$name = 'test_groddle_players_' . bin2hex(random_bytes(4));
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

    foreach (PEOPLE as $id => [$character, $level, $joined, $played, $off, $home, $tower, $public, $private, $banned]) {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', "p{$id}@groddle.test", $at($now - 86400 * 90), "player-{$id}"]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize(['subscriber' => true])]);
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - $joined * 86400)]);
        $state = ['player' => ['level' => $level]];
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]), $at($now)]);
        if ($played !== null) {
            $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PlayTime::LAST, (string) ($now - $played)]);
        }
        if ($off) {
            $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PresenceSetting::META, '1']);
        }
        $db->execute('INSERT INTO ' . $db->table(Profiles::TABLE) . ' (user_id, updated_at) VALUES (?, ?)', [$id, $at($now)]);
        if ($home !== null) {
            [$w, $h, $small] = $home;
            $db->execute('UPDATE ' . $db->table(Profiles::TABLE) . " SET home = 'x', home_at = ?, home_type = 'image/jpeg', home_w = ?, home_h = ?, home_small = ? WHERE user_id = ?", [$at($now - 600), $w, $h, $small ? 'y' : null, $id]);
        }
        if ($tower) {
            $db->execute('UPDATE ' . $db->table(Profiles::TABLE) . " SET tower = 'x', tower_at = ?, tower_type = 'image/jpeg', tower_w = 720, tower_h = 909 WHERE user_id = ?", [$at($now - 600), $id]);
        }
        foreach ([[$public, 1], [$private, 0]] as [$n, $isPublic]) {
            for ($i = 0; $i < $n; $i++) {
                $db->execute('INSERT INTO ' . $db->table(Snaps::TABLE) . ' (user_id, file, created_at, public) VALUES (?, ?, ?, ?)', [$id, bin2hex(random_bytes(12)) . '.jpg', $at($now - 3600), $isPublic]);
            }
        }
        if ($banned) {
            $db->execute('INSERT INTO ' . $db->table(AdminConsole::BANS) . ' (user_id, reason, admin_user_id, created_at) VALUES (?, ?, 1, ?)', [$id, 'fixture', $at($now)]);
        }
    }
    // Gus ignores Ada: to Gus, Ada has no public Snaps (Snaps::publicOf).
    $db->execute('INSERT INTO ' . $db->table(Buddies::IGNORES) . ' (user_id, ignored_id, added_at) VALUES (?, ?, ?)', [936, 930, $at($now)]);
    // The realtime server's connected players as the site keeps them (Dee appears offline, but an older server sent her id anyway).
    $setOnline = static fn (int $checked) => $site->setOption(PlayerList::ONLINE_OPTION, (string) json_encode(['checked' => $checked, 'ids' => ONLINE]), 'off');
    $setOnline($now);

    $caps = Capabilities::fromDb($db);
    $request = static fn (string $path, array $query = []): Request => new Request(Method::Get, $path, $query, [], [], '', true, 'groddle.test');
    $seams = static fn (int $as, Request $r): Seams => new Seams($db, $site, $r, Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'headers' => $r->headers, 'html' => $r->body];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode, 'html' => ''];
        } catch (RouteMiss) {
            return ['status' => 404, 'html' => ''];
        }
    };
    $index = static function (array $query, int $as = 0) use ($request, $seams, $answer): array {
        $r = $request('/players/', $query);
        $s = $seams($as, $r);
        return $answer(static fn (): Response => (new PlayerPages($s, StaticRoot::fromSite($s)))->index($r));
    };
    $slug = static fn (string $href): string => (string) preg_replace('#^/players/([^/]+)/.*$#', '$1', $href);
    /** The cards in order: slug, the sort's fact, the Snaps chip's count, the green dot. */
    $cards = static function (string $html) use ($slug): array {
        preg_match_all('#<li><a class="player-tile" href="([^"]+)">(.*?)</a></li>#s', $html, $m, PREG_SET_ORDER);
        return array_map(static fn (array $x): array => [
            'who' => $slug($x[1]),
            'fact' => preg_match('#<span class="player-tile-fact">(.*?)</span>#', $x[2], $f) ? trim(strip_tags($f[1])) : null,
            'snaps' => preg_match('#<span class="player-snaps"[^>]*>.*?</svg>(\d+)#s', $x[2], $c) ? (int) $c[1] : 0,
            'online' => str_contains($x[2], 'class="player-online"'),
        ], $m);
    };
    $lots = static function (string $html) use ($slug): array {
        preg_match_all('#<li class="hood-lot[^"]*"><a href="([^"]+)">(.*?)</a></li>#s', $html, $m, PREG_SET_ORDER);
        return array_map(static fn (array $x): array => [
            'who' => $slug($x[1]),
            'href' => $x[1],
            'img' => preg_match('#<img class="hood-house" src="([^"]+)"#', $x[2], $i) ? preg_replace('/\d{6,}/', 'T', html_entity_decode($i[1])) : null,
            'lazy' => str_contains($x[2], 'loading="lazy"'),
            'empty' => str_contains($x[2], 'hood-empty'),
            'name' => preg_match('#<span class="hood-name">(.*?)<#', $x[2], $n) ? html_entity_decode($n[1], ENT_QUOTES) : null,
            'online' => str_contains($x[2], 'class="player-online"'),
        ], $m);
    };
    $who = static fn (array $list): array => array_column($list, 'who');

    // == Each sort ==
    foreach (array_keys(PlayerList::SORTS) as $sort) {
        $page = $index($sort === 'newest' ? [] : ['sort' => $sort]);
        $out['sorts'][$sort] = $cards($page['html']);
        $out['status'][$sort] = $page['status'];
    }
    $plain = $index([])['html'];
    $out['count'] = preg_match('#<p class="players-count">(.*?)</p>#', $plain, $m) ? $m[1] : null;
    $out['visit button'] = preg_match('#<a class="players-visit" href="([^"]+)"#', $plain, $m) ? $m[1] : null;
    $out['form'] = [
        'get' => str_contains($plain, '<form class="players-filters" method="get" action="/players/"'),
        'boxes' => preg_match_all('#<input type="checkbox" name="(snaps|tower|street|online)" value="1"#', $plain),
        'show' => str_contains($plain, '<button type="submit" class="players-apply">Show</button>'),
    ];
    $out['script'] = preg_match('#<script src="(/wp-content/themes/groddle/players/players\.js\?v=[0-9a-f]{8})" defer></script>#', $plain, $m) ? 'keyed' : null;
    $out['leaks'] = preg_match('/@groddle\.test|player-9\d\d|user_email|groddle_play|appear_offline/', $plain) === 1;

    // == Filters, alone and together, with a sort ==
    $filters = [
        'snaps' => ['snaps' => '1'],
        'tower' => ['tower' => '1'],
        'street' => ['street' => '1'],
        'online' => ['online' => '1'],
        'snaps+tower' => ['snaps' => '1', 'tower' => '1'],
        'street+tower age' => ['street' => '1', 'tower' => '1', 'sort' => 'age'],
        'street level' => ['street' => '1', 'sort' => 'level'],
        'tower+online' => ['tower' => '1', 'online' => '1'],
        'snaps+street+tower+online' => ['snaps' => '1', 'street' => '1', 'tower' => '1', 'online' => '1'],
        'not 1' => ['snaps' => 'yes'],
    ];
    foreach ($filters as $k => $q) {
        $out['filters'][$k] = $who($cards($index($q)['html']));
    }
    $filtered = $index(['snaps' => '1', 'sort' => 'level'])['html'];
    $out['filtered count'] = preg_match('#<p class="players-count">(.*?)</p>#', $filtered, $m) ? $m[1] : null;
    preg_match_all('#<nav class="players-sort"[^>]*>(.*?)</nav>#s', $filtered, $m);
    preg_match_all('#<a href="([^"]+)" data-players-nav="">([^<]+)</a>#', $m[1][0] ?? '', $tabs, PREG_SET_ORDER);
    $out['tabs keep filters'] = array_map(static fn (array $x): array => [html_entity_decode($x[1]), $x[2]], $tabs);
    $out['checked'] = preg_match_all('#name="(snaps|tower|street|online)" value="1" checked#', $filtered, $m) ? $m[1] : [];
    $out['hidden sort'] = str_contains($filtered, '<input type="hidden" name="sort" value="level" />');
    // Nobody matches (to Gus, the only one with a Tower and public Snaps has none): the way back keeps the sort and view.
    $none = $index(['tower' => '1', 'snaps' => '1', 'sort' => 'name', 'view' => 'street'], 936)['html'];
    $out['none'] = preg_match('#No characters match\. <a href="([^"]+)"#', $none, $m) ? html_entity_decode($m[1]) : null;

    // == A reader Ada blocked: no Snaps of hers ==
    $out['blocked'] = ['snaps' => $who($cards($index(['snaps' => '1'], 936)['html'])), 'chip' => array_column($cards($index(['sort' => 'name'], 936)['html']), 'snaps', 'who')];

    // == Online: a list older than ONLINE_KEEP shows nobody ==
    $setOnline($now - PlayerList::ONLINE_KEEP - 5);
    $site->setOption(PlayerList::ONLINE_TRIED, (string) $now, 'off'); // asked just now (no server here): the old list stays
    $out['stale online'] = ['dots' => array_sum(array_column($cards($index(['sort' => 'name'])['html']), 'online')), 'filter' => $who($cards($index(['online' => '1'])['html']))];
    $setOnline($now);

    // == The neighbourhood: the same players, in the same order ==
    foreach (['newest' => [], 'played' => ['sort' => 'played'], 'street+level' => ['street' => '1', 'sort' => 'level'], 'snaps' => ['snaps' => '1']] as $k => $q) {
        $hood = $index($q + ['view' => 'street'])['html'];
        $out['hood'][$k] = ['lots' => $lots($hood), 'cards' => $who($cards($index($q)['html'])), 'region' => str_contains($hood, '<div class="hood" role="region" aria-label="Neighbourhood" tabindex="0">')];
    }
    $hood = $index(['view' => 'street', 'sort' => 'level'])['html'];
    preg_match_all('#<nav class="players-sort"[^>]*>(.*?)</nav>#s', $hood, $m);
    preg_match_all('#<a href="([^"]+)" data-players-nav="">([^<]+)</a>#', $m[1][0] ?? '', $tabs, PREG_SET_ORDER);
    $out['hood tabs'] = array_map(static fn (array $x): string => html_entity_decode($x[1]), $tabs);
    preg_match('#<nav class="players-view"[^>]*>(.*?)</nav>#s', $hood, $m);
    $out['hood view nav'] = trim(strip_tags($m[1] ?? ''));
    $out['hood cards link'] = preg_match('#<a href="([^"]+)" data-players-nav="">Cards</a>#', $hood, $m) ? html_entity_decode($m[1]) : null;

    // == Visit a neighbour: only players with a home street page; never the reader's own ==
    $visit = static function (int $as) use ($request, $seams, $answer): array {
        $r = $request('/players/', ['visit' => '1']);
        $s = $seams($as, $r);
        $a = $answer(static fn (): Response => (new PlayerPages($s, StaticRoot::fromSite($s)))->index($r));
        return [$a['status'], $a['headers']['Location'] ?? null, $a['headers']['Cache-Control'] ?? null];
    };
    $seen = [];
    for ($i = 0; $i < 60; $i++) {
        [$status, $to, $cache] = $visit(0);
        $seen[$to] = ($seen[$to] ?? 0) + 1;
        $out['visit status'] = [$status, $cache];
    }
    ksort($seen);
    $out['visit'] = array_keys($seen);
    $own = [];
    for ($i = 0; $i < 40; $i++) {
        $own[$visit(930)[1]] = true;
    }
    ksort($own);
    $out['visit as ada'] = array_keys($own);

    // == Pure helpers ==
    $out['ago'] = array_map(static fn (int $s): string => PlayerList::ago($now - $s, $now), [60, 86399, 86400, 3 * 86400, 13 * 86400, 20 * 86400, 59 * 86400, 61 * 86400, 400 * 86400, 800 * 86400]);
    $out['snapshot'] = PlayerList::onlineSnapshot(['players' => [['id' => 7, 'name' => 'a'], ['id' => 3, 'off' => true], ['id' => 7], ['id' => 'x'], ['id' => 5, 'off' => false]], 'http' => 200], 100);
    $out['snapshot bad'] = [PlayerList::onlineSnapshot(null, 1), PlayerList::onlineSnapshot(['status' => 'x'], 1), PlayerList::onlineSnapshot(['players' => [], 'http' => 500], 1)];
    $out['options'] = PlayerList::options(['sort' => 'nope', 'view' => '<x>', 'snaps' => '1', 'tower' => 'on', 'page' => '-3']);

    if ($preview !== '') {
        @mkdir($preview, 0755, true);
        foreach (['cards' => ['sort' => 'played'], 'hood' => ['view' => 'street']] as $file => $q) {
            file_put_contents("{$preview}/{$file}.html", $index($q)['html']);
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
