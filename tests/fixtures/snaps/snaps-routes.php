<?php
/**
 * Runs the site repo's Snaps routes (groddle-afternoon-site src/Snaps.php, the Snaps pages and
 * pictures in src/PlayerPages.php; G1240) against a throwaway MariaDB database and prints what
 * happened as JSON (tests/g1240-snaps-full.test.js): a new Snap is private; its owner makes it
 * public and private again; the profile lists only public ones; a private Snap's picture, page
 * and download answer nobody but its owner; the Camera's random Snap is public only; blocks hold;
 * files saved before G1240 get new names. The database (test_groddle_snaps_<hex>) and a folder
 * of pictures under the system temp folder are made here and removed at the end. The players
 * are made-up fixtures.
 *
 *   php tests/fixtures/snaps/snaps-routes.php <engine public/minn> <groddle-afternoon-site> <game public/> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $game, $host, $user, $pass] = $argv;
$webroot = sys_get_temp_dir() . '/groddle-snaps-test-' . bin2hex(random_bytes(4));
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

use Groddle\Minn\Characters;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\PlayerPages;
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
const ADA = 910;   // the owner
const BEA = 911;   // another player
const CY = 912;    // blocks Ada
const STREET = 'LLI32G3NUTD100I';

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

$name = 'test_groddle_snaps_' . bin2hex(random_bytes(4));
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

    // == Three made-up players at level 7, Ada with the Snapshottery card; Cy blocks Ada ==
    $person = static function (int $id, string $character) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', "p{$id}@groddle.test", $at($now - 86400), "player-{$id}"]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize(['subscriber' => true])]);
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400)]);
        $state = ['player' => ['level' => 7, 'imaginationUpgrades' => ['snapshotting']]];
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]), $at($now)]);
    };
    $person(ADA, 'Zz Ada');
    $person(BEA, 'Zz Bea');
    $person(CY, 'Zz Cy');
    $db->execute('INSERT INTO ' . $db->table(Groddle\Minn\Buddies::IGNORES) . ' (user_id, ignored_id, added_at) VALUES (?, ?, ?)', [CY, ADA, $at($now)]);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $body = [], array $headers = []): Request => new Request($method, $path, [], $headers, [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            $body = json_decode($r->body, true);
            return ['status' => $r->status, 'body' => is_array($body) ? $body : null, 'headers' => $r->headers, 'bytes' => is_array($body) ? 0 : strlen($r->body), 'html' => is_array($body) ? '' : $r->body];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        } catch (RouteMiss) {
            return ['status' => 404, 'code' => 'route_miss'];
        }
    };
    $snaps = static fn (int $as, ?Request $r = null): Snaps => new Snaps($seams($as, $r));
    $pages = static fn (int $as, Request $r): PlayerPages => new PlayerPages($seams($as, $r), StaticRoot::fromSite($seams($as, $r)));
    $table = $db->table(Snaps::TABLE);
    $row = static fn (int $id): ?array => $db->row("SELECT id, user_id, file, public, meteor FROM {$table} WHERE id = ?", [$id]);
    $dir = Snaps::dir();

    // == Saving: full size (1920x1200, the site's largest) is accepted, and private ==
    if ($out['gd']) {
        $img = imagecreatetruecolor(1920, 1200);
        for ($y = 0; $y < 1200; $y += 40) {
            imagefilledrectangle($img, 0, $y, 1919, $y + 39, (int) imagecolorallocate($img, ($y * 7) % 256, 120, 200));
        }
        ob_start();
        imagejpeg($img, null, 85);
        $jpeg = (string) ob_get_clean();
        $r = $request(Method::Post, '/groddle/v1/snaps', ['image' => base64_encode($jpeg), 'caption' => 'A made-up view', 'street' => STREET, 'x' => 100, 'y' => -80, 'meteor' => true]);
        $saved = $answer(static fn (): Response => $snaps(ADA, $r)->save($r));
        $savedId = (int) ($saved['body']['snap']['id'] ?? 0);
        $file = $savedId ? (string) $row($savedId)['file'] : '';
        $out['save'] = [
            'status' => $saved['status'],
            'code' => $saved['code'] ?? null,
            'snap' => $saved['body']['snap'] ?? null,
            'row' => $savedId ? $row($savedId) : null,
            'fileName32' => preg_match('/^[0-9a-f]{32}\.jpg$/', $file) === 1,
            'fileOnDisk' => $file !== '' && is_file("{$dir}/{$file}"),
            'smallOnDisk' => $file !== '' && is_file("{$dir}/" . Snaps::smallName($file)),
            'smallWidth' => $file !== '' && is_file("{$dir}/" . Snaps::smallName($file)) ? getimagesize("{$dir}/" . Snaps::smallName($file))[0] : 0,
            'indexHtml' => is_file("{$dir}/index.html"),
            'jsonHasFileName' => $file !== '' && str_contains((string) json_encode($saved['body']), substr($file, 0, 24)),
        ];
    }

    // == More of Ada's Snaps, one public; Bea's public one; a pre-G1240 file ==
    @mkdir($dir, 0755, true);
    $insert = static function (int $owner, string $file, int $public, string $caption, int $ago) use ($db, $table, $at, $now, $dir): int {
        file_put_contents("{$dir}/{$file}", "\xFF\xD8\xFF" . str_repeat('x', 200) . "\xFF\xD9");
        $db->execute("INSERT INTO {$table} (user_id, file, street, x, y, caption, width, height, bytes, created_at, public) VALUES (?, ?, ?, 10, 20, ?, 960, 540, 205, ?, ?)", [$owner, $file, STREET, $caption, $at($now - $ago), $public]);
        return $db->insertId();
    };
    $hex = static fn (int $n): string => bin2hex(random_bytes($n));
    $adaPrivate = $insert(ADA, $hex(16) . '.jpg', 0, 'Ada private', 3000);
    $adaPublic = $insert(ADA, $hex(16) . '.jpg', 1, 'Ada public', 2000);
    $beaPublic = $insert(BEA, $hex(16) . '.jpg', 1, 'Bea public', 1000);
    $oldFile = $hex(12) . '.jpg';
    $adaOld = $insert(ADA, $oldFile, 0, 'Ada old', 5000);
    $out['ids'] = ['adaPrivate' => $adaPrivate, 'adaPublic' => $adaPublic, 'beaPublic' => $beaPublic, 'adaOld' => $adaOld];

    // == The album: every picture through the site's route, never a file's address; old files sealed ==
    $album = $answer(static fn (): Response => $snaps(ADA)->mine($request(Method::Get, '/groddle/v1/snaps')));
    $byId = [];
    foreach ($album['body']['snaps'] ?? [] as $s) {
        $byId[$s['id']] = $s;
    }
    $sealedFile = (string) $row($adaOld)['file'];
    $out['album'] = [
        'status' => $album['status'],
        'profile' => $album['body']['profile'] ?? null,
        'private' => $byId[$adaPrivate] ?? null,
        'public' => $byId[$adaPublic] ?? null,
        'mentionsUploads' => str_contains((string) json_encode($album['body']), 'wp-content'),
        'oldRenamed' => $sealedFile !== $oldFile && preg_match('/^[0-9a-f]{32}\.jpg$/', $sealedFile) === 1,
        'oldGone' => !is_file("{$dir}/{$oldFile}"),
        'newThere' => is_file("{$dir}/{$sealedFile}"),
        'sealedOption' => $site->option(Snaps::SEALED_OPTION),
    ];

    // == Public or private: the owner only ==
    $toggle = static function (int $as, int $id, mixed $on) use ($request, $snaps, $answer): array {
        $r = $request(Method::Post, "/groddle/v1/snaps/{$id}/public", ['public' => $on]);
        return $answer(static fn (): Response => $snaps($as, $r)->share($r, (string) $id));
    };
    $notOwner = $toggle(BEA, $adaPrivate, true);
    $badBody = $toggle(ADA, $adaPrivate, 'yes');
    $out['toggle'] = [
        'notOwner' => [$notOwner['status'], $notOwner['code'] ?? null, (int) $row($adaPrivate)['public']],
        'badBody' => [$badBody['status'], $badBody['code'] ?? null],
    ];
    $on = $toggle(ADA, $adaPrivate, true);
    $out['toggle']['on'] = ['status' => $on['status'], 'snap' => $on['body']['snap'] ?? null, 'row' => (int) $row($adaPrivate)['public']];
    $off = $toggle(ADA, $adaPrivate, false);
    $out['toggle']['off'] = ['status' => $off['status'], 'snap' => $off['body']['snap'] ?? null, 'row' => (int) $row($adaPrivate)['public']];

    // == Pictures, pages and downloads ==
    $picture = static function (int $as, int $owner, int $id, string $kind, array $headers = []) use ($request, $pages, $answer): array {
        $r = $request(Method::Get, "/players/{$owner}/snaps/{$id}/{$kind}", [], $headers);
        $a = $answer(static fn (): Response => $pages($as, $r)->snapPicture($r, (string) $owner, (string) $id, $kind));
        return ['status' => $a['status'], 'cache' => $a['headers']['Cache-Control'] ?? null, 'type' => $a['headers']['Content-Type'] ?? null, 'disposition' => $a['headers']['Content-Disposition'] ?? null, 'etag' => $a['headers']['ETag'] ?? null, 'bytes' => $a['bytes'] ?? 0];
    };
    $page = static function (int $as, string $slug, int $id) use ($request, $pages, $answer): array {
        $r = $request(Method::Get, "/players/{$slug}/snaps/{$id}/");
        $a = $answer(static fn (): Response => $pages($as, $r)->snapPage($r, $slug, (string) $id));
        return ['status' => $a['status'], 'html' => $a['html'] ?? ''];
    };
    $out['picture'] = [
        'privateOwner' => $picture(ADA, ADA, $adaPrivate, 'picture'),
        'privateOther' => $picture(BEA, ADA, $adaPrivate, 'picture'),
        'privateSignedOut' => $picture(0, ADA, $adaPrivate, 'picture'),
        'privateSmallOther' => $picture(BEA, ADA, $adaPrivate, 'small'),
        'publicOther' => $picture(BEA, ADA, $adaPublic, 'picture'),
        'publicSignedOut' => $picture(0, ADA, $adaPublic, 'small'),
        'publicBlocked' => $picture(CY, ADA, $adaPublic, 'picture'),
        'wrongOwner' => $picture(BEA, BEA, $adaPublic, 'picture'),
        'missing' => $picture(ADA, ADA, 999999, 'picture'),
    ];
    $etag = $out['picture']['publicOther']['etag'];
    $out['picture']['publicRevalidated'] = $picture(BEA, ADA, $adaPublic, 'picture', ['if-none-match' => (string) $etag]);
    $out['download'] = [
        'privateOwner' => $picture(ADA, ADA, $adaPrivate, 'download'),
        'privateOther' => $picture(BEA, ADA, $adaPrivate, 'download'),
        'privateSignedOut' => $picture(0, ADA, $adaPrivate, 'download'),
        'publicOther' => $picture(BEA, ADA, $adaPublic, 'download'),
    ];
    $pub = $page(BEA, 'zz-ada', $adaPublic);
    $priv = $page(BEA, 'zz-ada', $adaPrivate);
    $own = $page(ADA, 'zz-ada', $adaPrivate);
    $blocked = $page(CY, 'zz-ada', $adaPublic);
    $out['page'] = [
        'public' => ['status' => $pub['status'], 'caption' => str_contains($pub['html'], 'Ada public'), 'picture' => str_contains($pub['html'], "/players/" . ADA . "/snaps/{$adaPublic}/picture"), 'download' => str_contains($pub['html'], "/players/" . ADA . "/snaps/{$adaPublic}/download"), 'ogImage' => str_contains($pub['html'], 'property="og:image" content="https://groddle.test/players/' . ADA . "/snaps/{$adaPublic}/picture"), 'uploads' => str_contains($pub['html'], 'groddle-snaps')],
        'privateOther' => $priv['status'],
        'privateOwner' => ['status' => $own['status'], 'note' => str_contains($own['html'], 'Only you can see this snap'), 'noindex' => str_contains($own['html'], 'noindex')],
        'blocked' => $blocked['status'],
        'wrongOwner' => $page(BEA, 'zz-bea', $adaPublic)['status'],
    ];
    // The public page as another player sees it, whole (tests/snap-modal.test.js reads its picture link and dialog).
    $out['pageHtml'] = $pub['html'];
    $out['pageIds'] = ['owner' => ADA, 'snap' => $adaPublic];

    // == The profile lists only public Snaps, newest first ==
    $profile = static function (int $as, string $slug, string $tab = '') use ($request, $pages, $answer): string {
        $path = "/players/{$slug}/" . ($tab === '' ? '' : "{$tab}/");
        $r = $request(Method::Get, $path);
        $a = $answer(static fn (): Response => $tab === '' ? $pages($as, $r)->profile($r, $slug) : $pages($as, $r)->subpage($r, $slug, $tab));
        return $a['status'] === 200 ? $a['html'] : 'status ' . $a['status'] . ' ' . ($a['code'] ?? '');
    };
    $list = static fn (int $reader): array => array_map(static fn (array $r): int => (int) $r['id'], Snaps::publicOf($db, ADA, $reader));
    $bea = $profile(BEA, 'zz-ada');
    $tab = $profile(BEA, 'zz-ada', 'snaps');
    $mine = $profile(ADA, 'zz-ada');
    $out['profile'] = [
        'list' => $list(BEA),
        'listSignedOut' => $list(0),
        'listBlocked' => $list(CY),
        'overviewPublic' => str_contains($bea, "/players/zz-ada/snaps/{$adaPublic}/"),
        'overviewPrivate' => str_contains($bea, "/players/zz-ada/snaps/{$adaPrivate}/") || str_contains($bea, 'Ada private'),
        'tabPublic' => str_contains($tab, "/players/zz-ada/snaps/{$adaPublic}/"),
        'tabPrivate' => str_contains($tab, 'Ada private'),
        'tabLink' => str_contains($bea, 'href="/players/zz-ada/snaps/"'),
        'ownerNote' => str_contains($mine, 'Only snaps you make public show here'),
        'otherNote' => str_contains($bea, 'Only snaps you make public show here'),
        'error' => str_starts_with($bea, 'status ') ? $bea : null,
    ];

    // == Making it public then private again: off the profile and its pictures at once ==
    $toggle(ADA, $adaPrivate, true);
    $shownWhilePublic = [$list(BEA), $picture(BEA, ADA, $adaPrivate, 'picture')['status']];
    $toggle(ADA, $adaPrivate, false);
    $out['private again'] = ['whilePublic' => $shownWhilePublic, 'after' => [$list(BEA), $picture(BEA, ADA, $adaPrivate, 'picture')['status'], $page(BEA, 'zz-ada', $adaPrivate)['status']]];

    // == The Camera's random Snap: other players' public ones only ==
    $random = static function (int $as) use ($request, $snaps, $answer): ?int {
        $r = $request(Method::Get, '/groddle/v1/snaps/random');
        $a = $answer(static fn (): Response => $snaps($as, $r)->random($r));
        return isset($a['body']['snap']['id']) ? (int) $a['body']['snap']['id'] : null;
    };
    $seen = ['bea' => [], 'ada' => [], 'cy' => []];
    for ($i = 0; $i < 12; $i++) {
        $seen['bea'][] = $random(BEA);
        $seen['ada'][] = $random(ADA);
        $seen['cy'][] = $random(CY);
    }
    $out['random'] = array_map(static fn (array $ids): array => array_values(array_unique($ids, SORT_REGULAR)), $seen);
    $r = $request(Method::Get, '/groddle/v1/snaps/random');
    $one = $answer(static fn (): Response => $snaps(BEA, $r)->random($r));
    $out['randomShape'] = ['url' => $one['body']['snap']['url'] ?? null, 'public' => $one['body']['snap']['public'] ?? null, 'page' => $one['body']['snap']['page'] ?? null];

    // == A shooting star (the game's js/meteor-shower.js; ours): the tag on its page, none on another ==
    $db->execute("UPDATE {$table} SET meteor = 1 WHERE id = ?", [$adaPublic]);
    $starred = $page(BEA, 'zz-ada', $adaPublic);
    $plain = $page(ADA, 'zz-ada', $adaPrivate);
    $starAlbum = $answer(static fn (): Response => $snaps(ADA)->mine($request(Method::Get, '/groddle/v1/snaps')));
    $flags = [];
    foreach ($starAlbum['body']['snaps'] ?? [] as $s) {
        $flags[$s['id']] = $s['meteor'] ?? null;
    }
    $out['meteor'] = [
        'tagged' => ['status' => $starred['status'], 'tag' => str_contains($starred['html'], 'snap-tag-meteor') && str_contains($starred['html'], '>Shooting star<')],
        'plain' => ['status' => $plain['status'], 'tag' => str_contains($plain['html'], 'snap-tag-meteor')],
        'album' => ['public' => $flags[$adaPublic] ?? null, 'private' => $flags[$adaPrivate] ?? null],
    ];

    // == Deleting takes the small copy too ==
    if (!empty($out['save']['snap']['id'])) {
        $sid = (int) $out['save']['snap']['id'];
        $file = (string) $row($sid)['file'];
        $snaps(ADA)->remove($request(Method::Delete, "/groddle/v1/snaps/{$sid}"), (string) $sid);
        $out['delete'] = ['file' => is_file("{$dir}/{$file}"), 'small' => is_file("{$dir}/" . Snaps::smallName($file)), 'row' => $row($sid)];
    }
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
    rmtree($webroot);
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
