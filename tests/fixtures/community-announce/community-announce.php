<?php
/**
 * Runs the Community boards' Announcements rules (groddle-afternoon-site src/Community.php,
 * CommunityText.php, CommunityPages.php, Notifications.php) against a throwaway MariaDB database
 * and prints what happened as JSON (tests/community-announce.test.js). The database
 * (test_groddle_announce_<hex>: users, usermeta, options and every table of the site's minn.json)
 * is made here and dropped at the end; nothing else is touched.
 *
 *   php tests/fixtures/community-announce/community-announce.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-announce-none/');
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
use Groddle\Minn\Community;
use Groddle\Minn\CommunityPages;
use Groddle\Minn\CommunityText;
use Groddle\Minn\Notifications;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\Http\Response;
use Minn\RestError;

const PREFIX = 'wp_';
const DAY = 86400;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_announce_' . bin2hex(random_bytes(4));
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
    // The pages' header reads the site's menu pages.
    $conn->query('CREATE TABLE ' . PREFIX . "posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_author bigint(20) unsigned NOT NULL DEFAULT 0, post_date datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_date_gmt datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_content longtext NOT NULL DEFAULT '', post_title text NOT NULL DEFAULT '', post_excerpt text NOT NULL DEFAULT '', post_status varchar(20) NOT NULL DEFAULT 'publish', comment_status varchar(20) NOT NULL DEFAULT 'open', ping_status varchar(20) NOT NULL DEFAULT 'open', post_password varchar(255) NOT NULL DEFAULT '', post_name varchar(200) NOT NULL DEFAULT '', to_ping text NOT NULL DEFAULT '', pinged text NOT NULL DEFAULT '', post_modified datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_modified_gmt datetime NOT NULL DEFAULT '2000-01-01 00:00:00', post_content_filtered longtext NOT NULL DEFAULT '', post_parent bigint(20) unsigned NOT NULL DEFAULT 0, guid varchar(255) NOT NULL DEFAULT '', menu_order int(11) NOT NULL DEFAULT 0, post_type varchar(20) NOT NULL DEFAULT 'post', post_mime_type varchar(100) NOT NULL DEFAULT '', comment_count bigint(20) NOT NULL DEFAULT 0, PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'postmeta (meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY post_id (post_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    // == The people: one of the team, three players, and a login with no character yet ==
    $person = static function (int $id, string $name, string $role, int $made) use ($db, $at): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', "p{$id}@groddle.test", $at($made), $name === '' ? "player-{$id}" : $name]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
        if ($name !== '') {
            $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $name, strtolower($name), $at($made)]);
        }
    };
    $person(900, 'Zz Staff', 'administrator', $now - 400 * DAY);
    $person(910, 'Ada', 'subscriber', $now - 90 * DAY);
    $person(911, 'Bea', 'subscriber', $now - 30 * DAY);
    $person(912, 'Cyd', 'subscriber', $now - 20 * DAY);
    $person(913, '', 'subscriber', $now - 5 * DAY);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $body = []): Request => new Request($method, $path, [], [], [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $community = static fn (int $as, ?Request $r = null): Community => new Community($seams($as, $r));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };
    $start = static function (int $as, string $board, string $title) use ($request, $community, $answer): array {
        $r = $request(Method::Post, "/groddle/v1/community/boards/{$board}/threads", ['title' => $title, 'body' => "Words for {$title}."]);
        return $answer(static fn (): Response => $community($as, $r)->createRoute($r, $board));
    };
    $reply = static function (int $as, int $thread, string $body) use ($request, $community, $answer): array {
        $r = $request(Method::Post, "/groddle/v1/community/threads/{$thread}/posts", ['body' => $body]);
        return $answer(static fn (): Response => $community($as, $r)->replyRoute($r, (string) $thread));
    };
    $page = static function (int $as, string $what, string $board) use ($seams, $request): string {
        try {
            $r = $request(Method::Get, "/chat/{$board}/" . ($what === 'new' ? 'new/' : ''));
            $p = new CommunityPages($seams($as, $r));
            return ($what === 'new' ? $p->newThread($r, $board) : $p->board($r, $board))->body;
        } catch (Throwable $e) {
            return 'ERROR ' . get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine();
        }
    };
    $notices = static fn (int $user): array => array_map(static fn (array $r): array => ['kind' => (string) $r['kind'], 'thread' => (int) $r['thread_id'], 'from' => (int) $r['from_id'], 'read' => $r['read_at'] !== null, 'game' => $r['game_at'] !== null], $db->rows('SELECT * FROM ' . $db->table(Community::NOTICES) . ' WHERE user_id = ? ORDER BY id', [$user]));

    // == 2. The boards' rows as the live site has them (seeded before the rename): brought to the new words, once ==
    $old = [
        'announcements' => ['Announcements & Events', 'Parties, group meetups, contests and anything else players are organising in the game.'],
        'general' => ['General', 'Playing the game: questions, tips, and talk about the latest changes.'],
    ];
    $i = 0;
    foreach (CommunityText::BOARDS as $slug => [$n, $a]) {
        [$n, $a] = $old[$slug] ?? [$n, $a];
        $db->execute('INSERT INTO ' . $db->table(Community::BOARDS_T) . ' (slug, name, about, position, created_at) VALUES (?, ?, ?, ?, ?)', [$slug, $n, $a, $slug === 'ideas' ? 9 : $i, '2026-11-04 12:00:00']);
        $i++;
    }
    $boardRows = static fn (): array => $db->rows('SELECT slug, name, about, position, created_at FROM ' . $db->table(Community::BOARDS_T) . ' ORDER BY slug');
    $out['seed'] = ['staleBefore' => Community::boardsStale($boardRows())];
    $first = $community(0)->boards();
    $out['seed']['rows'] = $boardRows();
    $out['seed']['staleAfter'] = Community::boardsStale($boardRows());
    $community(0)->boards();
    $out['seed']['again'] = $boardRows() === $out['seed']['rows'];
    $out['seed']['shown'] = array_map(static fn (array $b): array => [$b['slug'], $b['name'], $b['about']], $first);
    $out['seed']['emptyStale'] = Community::boardsStale([]);

    // == 1. Who starts a topic on Announcements: the team only; everyone replies ==
    $out['start'] = [
        'player' => $start(910, 'announcements', 'Party at the pond'),
        'signedOut' => $start(0, 'announcements', 'Hello there'),
        'noCharacter' => $start(913, 'announcements', 'Hello there'),
        'playerGeneral' => $start(910, 'general', 'Party at the pond'),
        'staff' => $start(900, 'announcements', 'Groddle news'),
    ];
    $news = (int) ($out['start']['staff']['body']['thread']['id'] ?? 0);
    $out['reply'] = ['player' => $reply(911, $news, 'Thanks for the news!')];
    $out['refusal'] = [
        'player' => $community(910)->startRefusal($community(910)->viewer(), 'announcements'),
        'playerGeneral' => $community(910)->startRefusal($community(910)->viewer(), 'general'),
        'staff' => $community(900)->startRefusal($community(900)->viewer(), 'announcements'),
        'signedOut' => $community(0)->startRefusal($community(0)->viewer(), 'announcements'),
    ];
    $out['pages'] = [
        'playerBoard' => $page(910, 'board', 'announcements'),
        'signedOutBoard' => $page(0, 'board', 'announcements'),
        'staffBoard' => $page(900, 'board', 'announcements'),
        'playerGeneral' => $page(910, 'board', 'general'),
        'playerNew' => $page(910, 'new', 'announcements'),
    ];
    $out['said'] = CommunityText::said('groddle_community_staff_only');
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
