<?php
/**
 * Runs the site repo's group edit route (groddle-afternoon-site src/Groups.php edit, #698,
 * group.js:494-499 admin_edit) against a throwaway MariaDB database and prints what happened as
 * JSON (tests/group-edit.test.js): the administrator changes the description; a member, a player
 * outside the group and one who cannot see a private group are refused; too long is refused; bad
 * words become a grawlix; a name sent is not read; the administrator worked out after the first
 * one leaves may edit. The database (test_groddle_groupedit_<hex>) is made here and dropped at
 * the end. The players are made-up fixtures.
 *
 *   php tests/fixtures/groups/group-edit.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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
const ADA = 920;   // makes the group: its administrator
const BEA = 921;   // a member, joined next
const CY = 922;    // not in it
const DI = 923;    // joins last

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_groupedit_' . bin2hex(random_bytes(4));
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

    // == Two made-up groups: a public one Ada made (Bea and Di in it), a private one Bea made ==
    $groups = $db->table(Groups::TABLE);
    $members = $db->table(Groups::MEMBERS);
    $group = static function (string $gname, string $mode, int $by, array $join) use ($db, $groups, $members, $at, $now): int {
        $db->execute("INSERT INTO {$groups} (name, name_key, description, mode, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", [$gname, strtolower($gname), 'The first words.', $mode, $by, $at($now - 5000)]);
        $id = $db->insertId();
        $db->execute("INSERT INTO {$members} (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)", [$id, $by, $at($now - 5000)]);
        foreach ($join as $i => $who) {
            $db->execute("INSERT INTO {$members} (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", [$id, $who, $at($now - 4000 + $i * 100)]);
        }
        return $id;
    };
    $pub = $group('Sunday Club', 'public', ADA, [BEA, DI]);
    $priv = $group('Quiet Ones', 'private', BEA, [DI]);
    $row = static fn (int $id): ?array => $db->row("SELECT name, description, mode FROM {$groups} WHERE id = ?", [$id]);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $body = []): Request => new Request($method, $path, [], [], [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode, 'message' => $e->getMessage(), 'data' => $e->extra];
        }
    };
    $edit = static function (int $as, int $gid, array $body) use ($db, $site, $caps, $request, $answer): array {
        $r = $request(Method::Put, "/groddle/v1/groups/{$gid}", $body);
        $g = new Groups(new Seams($db, $site, $r, Reader::forUser($as, $caps, '', 'token-' . $as)));
        return $answer(static fn (): Response => $g->edit($r, (string) $gid));
    };
    $show = static function (int $as, int $gid) use ($db, $site, $caps, $request, $answer): array {
        $r = $request(Method::Get, "/groddle/v1/groups/{$gid}");
        $g = new Groups(new Seams($db, $site, $r, Reader::forUser($as, $caps, '', 'token-' . $as)));
        return $answer(static fn (): Response => $g->show($r, (string) $gid));
    };

    // == The route: PUT groddle/v1/groups/{id}, signed in ==
    $attr = (new ReflectionMethod(Groups::class, 'edit'))->getAttributes(Route::class)[0] ?? null;
    $args = $attr?->getArguments() ?? [];
    $out['route'] = ['method' => ($args[0] ?? null)?->value, 'path' => $args[1] ?? null, 'access' => isset($args['policy']) ? $args['policy']->access->name : null];

    // == The administrator changes the description; the answer is show()'s ==
    $text = 'Come work on quests that you need multiple people around for!';
    $ok = $edit(ADA, $pub, ['description' => $text]);
    $out['admin'] = ['status' => $ok['status'], 'body' => $ok['body'] ?? null, 'row' => $row($pub), 'show' => $show(BEA, $pub)['body'] ?? null];

    // == Anyone else is refused, and nothing changes ==
    $out['member'] = $edit(BEA, $pub, ['description' => 'Bea was here']);
    $out['outsider'] = $edit(CY, $pub, ['description' => 'Cy was here']);
    $out['privateOutsider'] = $edit(CY, $priv, ['description' => 'Cy was here']);
    $out['privateMember'] = $edit(DI, $priv, ['description' => 'Di was here']);
    $out['missing'] = $edit(ADA, 999999, ['description' => 'Nowhere']);
    $out['afterRefusals'] = ['pub' => $row($pub), 'priv' => $row($priv)];

    // == The description check: 300 characters, bad words a grawlix, an empty one allowed ==
    $out['tooLong'] = $edit(ADA, $pub, ['description' => str_repeat('a', Groups::DESCRIPTION_MAX + 1)]);
    $out['tooLongRow'] = $row($pub);
    $out['atMax'] = $edit(ADA, $pub, ['description' => str_repeat('b', Groups::DESCRIPTION_MAX)])['status'];
    $out['atMaxLength'] = mb_strlen((string) $row($pub)['description']);
    $out['grawlix'] = ($edit(ADA, $pub, ['description' => "Quests and   shit\nall night"])['body']['description'] ?? null);
    $out['empty'] = [$edit(ADA, $pub, ['description' => ''])['status'], $row($pub)['description']];

    // == A name is not read (renaming waits on a ruling); a body with nothing to change is refused ==
    $named = $edit(ADA, $pub, ['name' => 'Renamed Club', 'description' => $text]);
    $out['nameIgnored'] = ['status' => $named['status'], 'name' => $named['body']['name'] ?? null, 'row' => $row($pub)];
    $out['onlyName'] = $edit(ADA, $pub, ['name' => 'Renamed Club']);
    $out['nothing'] = $edit(ADA, $pub, []);

    // == The administrator leaves: the member who joined first takes over (group.js:826-884) and may edit ==
    $db->execute("DELETE FROM {$members} WHERE group_id = ? AND user_id = ?", [$pub, ADA]);
    $out['succession'] = [
        'bea' => $edit(BEA, $pub, ['description' => 'Bea runs it now'])['status'],
        'di' => $edit(DI, $pub, ['description' => 'Di tries'])['status'],
        'ada' => $edit(ADA, $pub, ['description' => 'Ada tries'])['status'],
        'row' => $row($pub)['description'],
    ];
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
