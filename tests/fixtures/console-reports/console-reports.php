<?php
/**
 * The console's Reports search and the testers boards without the team (Austin 2026-11-24;
 * groddle-afternoon-site src/TicketStore.php listAll, src/AdminTickets.php index, src/Team.php,
 * src/ReportCredits.php, src/AdminReportCredits.php, src/ContributeCredits.php) on a throwaway
 * MariaDB database, printed as JSON (tests/console-reports-search.test.js); #744's player pages
 * (src/Tickets.php index, TicketStore::listFor) on the same reports (tests/g744-reports-older.test.js). The database
 * (test_groddle_console_<hex>: users, usermeta, options and every table of the site's minn.json) is
 * made here and dropped at the end; nothing else is touched.
 *
 *   php tests/fixtures/console-reports/console-reports.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-console-none/');
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

use Groddle\Minn\AdminReportCredits;
use Groddle\Minn\AdminTickets;
use Groddle\Minn\Characters;
use Groddle\Minn\ContributeCredits;
use Groddle\Minn\Logins;
use Groddle\Minn\ReportCredits;
use Groddle\Minn\Team;
use Groddle\Minn\Tickets;
use Groddle\Minn\TicketStore;
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

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_console_' . bin2hex(random_bytes(4));
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
    // Only what GET admin/tickets's legacy count reads (TicketMigration::pending): no old report posts.
    $conn->query('CREATE TABLE ' . PREFIX . "posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_type varchar(20) NOT NULL DEFAULT 'post', post_status varchar(20) NOT NULL DEFAULT 'publish', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    // == The people: an administrator (Aeghor), an extra character of the administrator's login (a
    // subscriber's role, as every extra character has), three players (one with no character name)
    // and the review account (EXCLUDED, a player's role) ==
    $person = static function (int $id, string $login, string $display, string $character, string $role) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, $login, '$P$none', "p{$id}@groddle.test", $at($now - 86400), $display]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
        if ($character !== '') {
            $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400)]);
        }
    };
    $person(900, 'staff-login', 'Staff', 'Aeghor', 'administrator');
    $person(905, 'player-905', 'player-905', 'Ednore', 'subscriber');
    $db->execute('INSERT INTO ' . $db->table(Logins::TABLE) . ' (user_id, login_id, created_at) VALUES (?, ?, ?)', [905, 900, $at($now - 3600)]);
    $person(910, 'player-910', 'player-910', 'Ada', 'subscriber');
    $person(911, 'player-911', 'player-911', 'Bea', 'subscriber');
    $person(912, 'player-912', 'Cyd Display', '', 'subscriber');
    $person(54, 'player-54', 'player-54', 'Review Glitch', 'subscriber');

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $query = [], array $body = []): Request => new Request($method, $path, $query, [], [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };
    $store = new TicketStore($db);
    // No digits in any report's words but "50%", so a number search finds only its report.
    $ada = $store->open(910, 'The pig floats over the fence.', [], $now - 7200);
    $store->add($ada, 900, TicketStore::ADMIN, 'Thanks, looking at it.', $now - 7000);
    $store->add($ada, 910, TicketStore::PLAYER, 'It happens on Hechey Track too, about 50% of the time, near the big tree by the shrine.', $now - 6900);
    $hat = $store->open(910, 'My hat is gone.', [], $now - 6000);
    $store->setStatus($hat, TicketStore::CLOSED, $now - 5900, TicketStore::ADMIN);
    $milk = $store->open(911, 'The milk_spill sign is wrong.', [], $now - 5000);
    $cyd = $store->open(912, 'A quoin is stuck in the wall.', [], $now - 4000);
    $aeghor = $store->open(900, 'Testing my own report as staff.', [], $now - 3000);
    $store->setStatus($aeghor, TicketStore::CLOSED, $now - 2900, TicketStore::ADMIN);
    $aeghorWaiting = $store->open(900, 'Another staff report, not scored.', [], $now - 2800);
    $store->setStatus($aeghorWaiting, TicketStore::CLOSED, $now - 2700, TicketStore::ADMIN);
    $ednore = $store->open(905, 'Ednore found a gap in the floor.', [], $now - 2500);
    $store->setStatus($ednore, TicketStore::CLOSED, $now - 2400, TicketStore::ADMIN);
    $review = $store->open(54, 'Review account checking a door.', [], $now - 2000);
    $store->setStatus($review, TicketStore::CLOSED, $now - 1900, TicketStore::ADMIN);
    $reviewWaiting = $store->open(54, 'Review account, not scored.', [], $now - 1800);
    $store->setStatus($reviewWaiting, TicketStore::CLOSED, $now - 1700, TicketStore::ADMIN);
    // A crowd of one search's matches, past one page.
    $bulk = [];
    for ($i = 0; $i < TicketStore::LIST_MAX + 5; $i++) {
        $bulk[] = $store->open(911, 'Bulk crumb report.', [], $now - 1000 + $i);
    }
    $out['ids'] = ['ada' => $ada, 'hat' => $hat, 'milk' => $milk, 'cyd' => $cyd, 'aeghor' => $aeghor, 'aeghorWaiting' => $aeghorWaiting, 'ednore' => $ednore, 'review' => $review, 'reviewWaiting' => $reviewWaiting];

    // == The search: GET admin/tickets?q= ==
    $list = static function (array $query) use ($request, $seams, $answer): array {
        $r = $request(Method::Get, '/groddle/v1/admin/tickets', $query);
        $a = $answer(static fn (): Response => (new AdminTickets($seams(900, $r)))->index($r));
        if (($a['status'] ?? 0) !== 200) {
            return $a;
        }
        $b = $a['body'];
        return ['ids' => array_map(static fn (array $t): int => $t['id'], $b['tickets']), 'total' => $b['total'], 'more' => $b['more'], 'q' => $b['q'], 'counts' => $b['counts'],
            'matches' => array_column(array_filter($b['tickets'], static fn (array $t): bool => isset($t['match'])), 'match', 'id'),
            'players' => array_column(array_map(static fn (array $t): array => ['id' => $t['id'], 'p' => $t['player']], $b['tickets']), 'p', 'id')];
    };
    $out['search'] = [
        'none' => $list(['status' => 'all']),
        'subject' => $list(['status' => 'all', 'q' => 'pig']),
        'message' => $list(['status' => 'all', 'q' => 'hechey track']),
        'caseless' => $list(['status' => 'all', 'q' => 'HAT']),
        'player' => $list(['status' => 'all', 'q' => 'Bea']),
        'display' => $list(['status' => 'all', 'q' => 'cyd disp']),
        'hashId' => $list(['status' => 'all', 'q' => '#' . $hat]),
        'bareId' => $list(['status' => 'all', 'q' => (string) $hat]),
        'percent' => $list(['status' => 'all', 'q' => '50%']),
        'percentOnly' => $list(['status' => 'all', 'q' => '%']),
        'underscore' => $list(['status' => 'all', 'q' => '_']),
        'quote' => $list(['status' => 'all', 'q' => "o'brien\\"]),
        'statusMiss' => $list(['status' => 'closed', 'q' => 'pig']),
        'statusHit' => $list(['status' => 'closed', 'q' => 'hat']),
        'spaces' => $list(['status' => 'all', 'q' => "  pig\n\tfloats  "]),
        'long' => $list(['status' => 'all', 'q' => str_repeat('x', 150)]),
        'notText' => $list(['status' => 'all', 'q' => '']),
        'page1' => $list(['status' => 'all', 'q' => 'crumb']),
        'page2' => $list(['status' => 'all', 'q' => 'crumb', 'offset' => (string) TicketStore::LIST_MAX]),
        'teamRows' => $list(['status' => 'all', 'q' => 'staff']),
        'ednoreRow' => $list(['status' => 'all', 'q' => 'Ednore']),
    ];
    $out['excerpt'] = [
        'middle' => TicketStore::excerpt(str_repeat('word ', 30) . 'the needle sits here ' . str_repeat('tail ', 40), 'needle'),
        'start' => TicketStore::excerpt('Needle first, then more words.', 'needle'),
        'absent' => TicketStore::excerpt('Nothing to find here.', 'zzz'),
    ];
    $out['like'] = TicketStore::likeOf("50%_a\\b");
    $out['searchId'] = [TicketStore::searchId('#12'), TicketStore::searchId('12'), TicketStore::searchId('12a'), TicketStore::searchId('#0'), TicketStore::searchId('')];

    // == The team, by capability ==
    $out['team'] = Team::of($db, [910, 905, 900, 912, 54, 0, -3, 900]);

    // == Scores: everyone's reports can be scored, the team's too ==
    $credit = static function (int $ticket, array $body) use ($request, $seams, $answer): array {
        $r = $request(Method::Put, "/groddle/v1/admin/tickets/{$ticket}/credit", [], $body);
        return $answer(static fn (): Response => (new AdminReportCredits($seams(900, $r)))->save($r, (string) $ticket));
    };
    $out['scored'] = [
        'ada' => $credit($hat, ['kind' => 'bug_fixed', 'reason' => 'Fixed the hat.'])['status'],
        'bea' => $credit($milk, ['kind' => 'partial_or_clue', 'reason' => 'A clue.'])['status'],
        'aeghor' => $credit($aeghor, ['kind' => 'safety_fix', 'reason' => 'Staff test that found a real bug.'])['status'],
        'ednore' => $credit($ednore, ['kind' => 'bug_fixed', 'reason' => 'Floor gap.'])['status'],
        'review' => $credit($review, ['kind' => 'bug_fixed', 'reason' => 'Door.'])['status'],
    ];
    $credits = new ReportCredits($db);
    $out['kept'] = (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(ReportCredits::TABLE));
    $totals = $credits->totals();
    usort($totals, static fn (array $a, array $b): int => $a['id'] <=> $b['id']);
    $out['totals'] = $totals;
    $out['rank'] = array_map(static fn (array $t): int => $t['id'], ReportCredits::rank($totals));
    $out['contribute'] = array_map(static fn (array $e): int => $e['id'], ContributeCredits::board($db));
    $r = $request(Method::Get, '/groddle/v1/admin/credits');
    $console = $answer(static fn (): Response => (new AdminReportCredits($seams(900, $r)))->index($r));
    $out['console'] = [
        'status' => $console['status'],
        'board' => array_map(static fn (array $b): int => $b['player']['id'], $console['body']['board']),
        'unscored' => array_map(static fn (array $u): array => ['id' => $u['id'], 'player' => $u['player']['id'], 'admin' => $u['player']['admin']], $console['body']['unscored']),
        'credits' => array_map(static fn (array $c): array => ['ticket' => $c['ticket'], 'admin' => $c['player']['admin']], $console['body']['credits']),
    ];

    // == #744: a player's own list in pages (GET tickets?offset=), Bea's 206 in the order of one long
    // list: two of the older ones made unread (an administrator's reply) and one closed, so the order
    // is more than the newest first ==
    $store->add($bulk[3], 900, TicketStore::ADMIN, 'Seen this one.', $now - 500);
    $store->add($bulk[40], 900, TicketStore::ADMIN, 'And this.', $now - 400);
    $store->setStatus($bulk[7], TicketStore::CLOSED, $now - 300, TicketStore::ADMIN);
    $mine = static function (int $as, array $query) use ($request, $seams, $answer): array {
        $r = $request(Method::Get, '/groddle/v1/tickets', $query);
        $a = $answer(static fn (): Response => (new Tickets($seams($as, $r)))->index($r));
        if (($a['status'] ?? 0) !== 200) {
            return $a;
        }
        $b = $a['body'];
        return ['ids' => array_map(static fn (array $t): int => $t['id'], $b['tickets']), 'more' => $b['more'] ?? null, 'unread' => $b['unread']];
    };
    $out['player'] = [
        'first' => $mine(911, []),
        'zero' => $mine(911, ['offset' => '0']),
        'second' => $mine(911, ['offset' => (string) TicketStore::LIST_MAX]),
        'past' => $mine(911, ['offset' => '400']),
        'ada' => $mine(910, []),
        'bad' => array_map(static fn (string $o): array => $mine(911, ['offset' => $o]), ['-1' => '-1', 'abc' => 'abc', '1.5' => '1.5', '1e3' => '1e3', 'long' => '9999999999', 'blank' => '']),
        // The order of one long list: the store's own ORDER BY with no limit.
        'order' => array_map('intval', array_column($db->rows('SELECT id FROM ' . $db->table(TicketStore::TABLE) . " WHERE player_user_id = ? ORDER BY (last_author_role = 'admin' AND (player_read_at IS NULL OR player_read_at < last_message_at)) DESC, FIELD(status, 'answered', 'open', 'working', 'closed'), updated_at DESC, id DESC", [911]), 'id')),
        'unreadIds' => [$bulk[3], $bulk[40]],
        'closedId' => $bulk[7],
    ];
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
