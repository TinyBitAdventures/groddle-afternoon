<?php
/**
 * Runs the site repo's shared Giant Icon route (groddle-afternoon-site src/HomeIcons.php, #697)
 * against a throwaway MariaDB database and prints what happened as JSON
 * (tests/giant-icons-shared.test.js). An owner's save holds two Icons placed at home (the game's
 * giant-icons slice: home:street and home:house); visitors and the owner ruminate, tithe and are
 * bestowed upon through the route; two processes ask for an Icon's last action at the same moment;
 * the owner's GET reads the kept state and lets a picked-up Icon's row go. The database
 * (test_groddle_icons_<hex>) is made here and dropped at the end. The players are made-up fixtures.
 *
 *   php -d extension=mysqli tests/fixtures/home-icons/shared-icons.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
// A contender (run by the main script): <...> race <database> <player> <start at, microtime>.
$race = ($argv[6] ?? '') === 'race' ? ['db' => $argv[7], 'who' => (int) $argv[8], 'at' => (float) $argv[9]] : null;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
define('GRODDLE_REALTIME_SECRET', str_repeat('k', 48));
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
spl_autoload_register(static function (string $class) use ($extension): void {
    $prefix = 'Groddle\\Minn\\';
    if (str_starts_with($class, $prefix) && is_file($file = $extension . '/src/' . substr($class, strlen($prefix)) . '.php')) {
        require $file;
    }
});
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

use Groddle\Minn\HomeIcons;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\Neighbours;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\RestError;

const PREFIX = 'wp_';
const OWNER = 7;
const BO = 9;
const CY = 11;
const DEE = 12; // blocked by the owner

/** POST groddle/v1/homes/{owner}/icons as a player, on a Db. */
function iconAct(Db $db, int $as, array $body): array
{
    $site = new Site($db);
    $caps = Capabilities::fromDb($db);
    $path = '/groddle/v1/homes/' . OWNER . '/icons';
    $r = new Request(Method::Post, $path, [], [], [], (string) json_encode($body), true, 'groddle.test');
    try {
        $res = (new HomeIcons(new Seams($db, $site, $r, Reader::forUser($as, $caps, '', 'token-' . $as))))->act($r, (string) OWNER);
        return ['http' => $res->status] + json_decode($res->body, true);
    } catch (RestError $e) {
        return ['http' => $e->status, 'code' => $e->errorCode];
    }
}

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

if ($race !== null) {
    $db = new Db(connect($host, $user, $pass, $race['db']), PREFIX);
    while (microtime(true) < $race['at']) {
        usleep(1000);
    }
    echo json_encode(iconAct($db, $race['who'], ['icon' => 'icon3', 'place' => 'street', 'act' => 'ruminate']));
    exit(0);
}

$name = 'test_groddle_icons_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach ($manifest['tables'] as $t => $cols) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $cols) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $conn->query('CREATE TABLE ' . PREFIX . "users (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_login varchar(60) NOT NULL DEFAULT '', user_pass varchar(255) NOT NULL DEFAULT '', user_nicename varchar(50) NOT NULL DEFAULT '', user_email varchar(100) NOT NULL DEFAULT '', user_url varchar(100) NOT NULL DEFAULT '', user_registered datetime NOT NULL, user_activation_key varchar(255) NOT NULL DEFAULT '', user_status int(11) NOT NULL DEFAULT 0, display_name varchar(250) NOT NULL DEFAULT '', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $site->setOption('home', 'https://groddle.test');
    $now = time();

    $saveRow = static function (int $id, array $placed) use ($db, $now): void {
        $state = ['player' => ['level' => 12], 'systems' => ['home' => ['owned' => true], 'features' => ['giant-icons' => ['version' => 2, 'placed' => (object) $placed]]]];
        $data = json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]);
        $t = $db->table(MultiplayerSave::TABLE);
        $db->execute("INSERT INTO {$t} (user_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), version = version + 1", [$id, $data, gmdate('Y-m-d H:i:s', $now)]);
    };
    $ownerPlaced = [
        'home:street' => [['id' => 'icon3', 'giant' => 'alph', 'x' => 470, 'y' => 600, 'actions' => 11, 'tither' => null]],
        'home:house' => [['id' => 'icon4', 'giant' => 'mab', 'x' => 300, 'y' => 500, 'actions' => 20]],
    ];
    $saveRow(OWNER, $ownerPlaced);
    foreach ([BO, CY, DEE] as $id) {
        $saveRow($id, []);
    }
    $db->execute('INSERT INTO ' . $db->table(\Groddle\Minn\Buddies::IGNORES) . ' (user_id, ignored_id, added_at) VALUES (?, ?, ?)', [OWNER, DEE, gmdate('Y-m-d H:i:s', $now)]);

    $caps = Capabilities::fromDb($db);
    $act = static fn (int $as, array $body): array => iconAct($db, $as, $body);
    $mine = static function () use ($db, $site, $caps): array {
        $r = new Request(Method::Get, '/groddle/v1/homes/icons', [], [], [], '', true, 'groddle.test');
        return json_decode((new HomeIcons(new Seams($db, $site, $r, Reader::forUser(OWNER, $caps, '', 'token-' . OWNER))))->mine($r)->body, true);
    };
    $street = ['icon' => 'icon3', 'place' => 'street'];

    // —— A visitor's ruminate spends one of the Icon's actions (use 360-376) ——
    $out['boRuminate'] = $act(BO, $street + ['act' => 'ruminate']);
    // —— Cy tithes at 10 actions: +5, the last tither (icon_tithe 309-317) ——
    $out['cyTithe'] = $act(CY, $street + ['act' => 'tithe']);
    $out['boTitheTooMany'] = $act(BO, $street + ['act' => 'tithe']);
    // —— Bo's bestowment is not doubled: Cy is the tither ——
    $out['boBestow'] = $act(BO, $street + ['act' => 'bestow']);
    // —— Cy's revere is the doubled one and clears the tither (87-94) ——
    $out['cyRevere'] = $act(CY, $street + ['act' => 'revere']);
    $out['cyBestowAfter'] = $act(CY, $street + ['act' => 'bestow']);
    // —— The owner's own use comes through here too ——
    $out['ownerReflect'] = $act(OWNER, $street + ['act' => 'reflect']);
    // —— What a visit shows: the save's rows with the kept state laid over them ——
    $out['visitRows'] = HomeIcons::overlay($db, OWNER, Neighbours::iconRows(Neighbours::state($db, OWNER)));

    // —— Who may: a blocked player, the house without a key, then with one; a wrong place, a gone Icon ——
    $out['deeBlocked'] = $act(DEE, $street + ['act' => 'ruminate']);
    $out['boHouseNoKey'] = $act(BO, ['icon' => 'icon4', 'place' => 'house', 'act' => 'ruminate']);
    $db->execute('INSERT INTO ' . $db->table(Neighbours::KEYS) . ' (owner_id, holder_id, granted_at) VALUES (?, ?, ?)', [OWNER, BO, gmdate('Y-m-d H:i:s', $now)]);
    $out['boHouseKey'] = $act(BO, ['icon' => 'icon4', 'place' => 'house', 'act' => 'ruminate']);
    $out['wrongPlace'] = $act(BO, ['icon' => 'icon3', 'place' => 'house', 'act' => 'ruminate']);
    $out['bad'] = $act(BO, ['icon' => 'icon3', 'place' => 'street', 'act' => 'pickup']);

    // —— The last action, asked for by two players at the same moment: one gets it ——
    $t = $db->table(HomeIcons::TABLE);
    $db->execute("UPDATE {$t} SET actions = 1, tither = NULL WHERE owner_id = ? AND icon = 'icon3'", [OWNER]);
    // Two more PHP processes, each with its own connection, start their POST at the same moment.
    $at = microtime(true) + 1.5;
    $procs = [];
    foreach ([BO, CY] as $who) {
        $cmd = [PHP_BINARY, '-d', 'display_errors=stderr', '-d', 'extension=mysqli', __FILE__, $engine, $extension, $host, $user, $pass, 'race', $name, (string) $who, sprintf('%.6F', $at)];
        $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $procs[] = [$p, $pipes];
    }
    $out['race'] = [];
    foreach ($procs as [$p, $pipes]) {
        $text = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        proc_close($p);
        $out['race'][] = json_decode((string) $text, true) ?? ['http' => 0, 'err' => substr($text . $err, 0, 400)];
    }
    $out['afterRace'] = $db->row("SELECT actions, tither FROM {$t} WHERE owner_id = ? AND icon = 'icon3'", [OWNER]);
    $out['emptyUse'] = $act(BO, $street + ['act' => 'revere']);

    // —— The owner's game reads what is kept; a picked-up Icon's row goes ——
    $out['mine'] = $mine();
    unset($ownerPlaced['home:house']);
    $saveRow(OWNER, $ownerPlaced);
    $out['minePickedUp'] = $mine();
    $out['rowsLeft'] = (int) $db->value("SELECT COUNT(*) FROM {$t} WHERE owner_id = ?", [OWNER]);
    $out['gone'] = $act(BO, ['icon' => 'icon4', 'place' => 'house', 'act' => 'ruminate']);
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out);
