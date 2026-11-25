<?php
/**
 * G1301 (#696): a group that owns a group hall says so in Menu > Groups. Runs the site repo's
 * groups routes (groddle-afternoon-site src/Groups.php mine, search, show) against a throwaway
 * MariaDB database with made-up LedgerHall rows (groddle_group_halls) and prints each card's
 * `hall` as JSON (tests/g1301-group-hall-owned.test.js): a built hall is the group's, a claim
 * still under way, one that ran out and one lost are not; a private group's hall shows only to
 * its members and invitees, as the group does. The database (test_groddle_grouphall_<hex>) is
 * made here and dropped at the end. The players and groups are made-up fixtures.
 *
 *   php tests/fixtures/groups/group-halls.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
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
use Groddle\Minn\Groups;
use Groddle\Minn\LedgerHall;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\Http\Response;
use Minn\Http\Route;
use Minn\RestError;

const PREFIX = 'wp_';
const ADA = 930;   // in every group below
const BEA = 931;   // makes the private one
const CY = 932;    // in none: finds the public ones, invited to the private one
const DI = 933;    // unused

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_grouphall_' . bin2hex(random_bytes(4));
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
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $site->setOption('home', 'https://groddle.test');
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    foreach ([ADA => 'Zz Ada', BEA => 'Zz Bea', CY => 'Zz Cy', DI => 'Zz Di'] as $id => $character) {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', "p{$id}@groddle.test", $at($now - 86400), "player-{$id}"]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize(['subscriber' => true])]);
        $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400)]);
    }

    // == Made-up groups: Ada is in all four; Bea made the private one; Cy is invited to it ==
    $groups = $db->table(Groups::TABLE);
    $members = $db->table(Groups::MEMBERS);
    $group = static function (string $gname, string $mode, int $by, array $join) use ($db, $groups, $members, $at, $now): int {
        $db->execute("INSERT INTO {$groups} (name, name_key, description, mode, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", [$gname, strtolower($gname), 'Words.', $mode, $by, $at($now - 5000)]);
        $id = $db->insertId();
        $db->execute("INSERT INTO {$members} (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)", [$id, $by, $at($now - 5000)]);
        foreach ($join as $i => $who) {
            $db->execute("INSERT INTO {$members} (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", [$id, $who, $at($now - 4000 + $i * 100)]);
        }
        return $id;
    };
    $builders = $group('Zz Builders', 'public', ADA, []);
    $quiet = $group('Zz Quiet Ones', 'private', BEA, [ADA]);
    $hopeful = $group('Zz Hopefuls', 'public', ADA, []);
    $late = $group('Zz Late Ones', 'public', ADA, []);
    $db->execute('INSERT INTO ' . $db->table(Groups::INVITES) . ' (group_id, user_id, invited_by, invited_at) VALUES (?, ?, ?, ?)', [$quiet, CY, BEA, $at($now - 100)]);

    // == Their halls (LedgerHall rows): built, built, claimed (under way), expired and lost ==
    $hall = static function (string $claim, string $job, int $gid, string $status) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table(LedgerHall::TABLE) . ' (claim_id, job_id, group_id, claimer_id, currants, status, claimed_at, built_at) VALUES (?, ?, ?, ?, 200, ?, ?, ?)', [$claim, $job, $gid, ADA, $status, $at($now - 3000), $status === 'built' ? $at($now - 1000) : null]);
    };
    $hall('job-g-1', '692', $builders, 'built');
    $hall('job-g-2', '694', $quiet, 'built');
    $hall('job-g-3', '689', $hopeful, 'claimed');
    $hall('job-g-4', '690', $late, 'expired');
    $hall('job-g-5', '691', $builders, 'lost');

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $query = []): Request => new Request($method, $path, $query, [], [], '', true, 'groddle.test');
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode, 'message' => $e->getMessage()];
        }
    };
    $as = static function (int $who, Request $r) use ($db, $site, $caps): Groups {
        return new Groups(new Seams($db, $site, $r, Reader::forUser($who, $caps, '', 'token-' . $who)));
    };
    $halls = static fn (array $cards): array => array_combine(array_map(static fn (array $c): string => $c['name'], $cards), array_map(static fn (array $c): mixed => array_key_exists('hall', $c) ? $c['hall'] : 'missing', $cards));

    // == Menu > Groups: Ada's groups, each with its hall ==
    $r = $request(Method::Get, '/groddle/v1/groups');
    $mine = $answer(static fn (): Response => $as(ADA, $r)->mine($r));
    $out['mine'] = ['status' => $mine['status'], 'halls' => $halls($mine['body']['groups'] ?? []), 'error' => $mine['message'] ?? null];

    // == Cy's invitation to the private group carries its hall; Find Groups shows the public ones' ==
    $mineCy = $answer(static fn (): Response => $as(CY, $r)->mine($r));
    $out['invites'] = $halls($mineCy['body']['invites'] ?? []);
    $rs = $request(Method::Get, '/groddle/v1/groups/search', ['q' => 'zz']);
    $found = $answer(static fn (): Response => $as(CY, $rs)->search($rs));
    $out['search'] = $halls($found['body']['groups'] ?? []);

    // == One group's details (show): its hall, to anyone who may see the group ==
    $show = static function (int $who, int $gid) use ($request, $answer, $as): array {
        $r = $request(Method::Get, "/groddle/v1/groups/{$gid}");
        $a = $answer(static fn (): Response => $as($who, $r)->show($r, (string) $gid));
        return ['status' => $a['status'], 'hall' => $a['body']['hall'] ?? null];
    };
    $out['show'] = [
        'builders by Cy' => $show(CY, $builders),
        'quiet by Ada' => $show(ADA, $quiet),
        'quiet by Cy (invited)' => $show(CY, $quiet),
        'quiet by Di (outside)' => $show(DI, $quiet),
        'hopeful by Cy' => $show(CY, $hopeful),
    ];
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
