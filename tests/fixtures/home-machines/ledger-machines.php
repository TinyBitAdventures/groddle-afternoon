<?php
/**
 * Runs the site repo's home machines route (groddle-afternoon-site src/HomeMachines.php, with the
 * Ledger it spends and credits through) against a throwaway MariaDB database and prints what
 * happened as JSON (tests/home-machines-ledger.test.js). G1249 (#669): a machine on an upper floor
 * of the house ("house:1", the realtime server's HOUSE_<owner>_1) is set down, run, collected,
 * refuelled and picked up through the ledger as on the ground floor, which keeps its own machine.
 * The acts are posted as the realtime server posts them (signed, ServiceCall). The database
 * (test_groddle_machines_<hex>) is made here and dropped at the end. The players are made-up fixtures.
 *
 *   php tests/fixtures/home-machines/ledger-machines.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
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

use Groddle\Minn\Economy;
use Groddle\Minn\HomeMachines;
use Groddle\Minn\Ledger;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\ServiceCall;
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
const VISITOR = 9;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

function op(): string
{
    return 'hm-' . bin2hex(random_bytes(8));
}

$name = 'test_groddle_machines_' . bin2hex(random_bytes(4));
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

    // —— The owner's two-floor house; a visitor ——
    $state = static fn (array $inv, array $skills, bool $home, int $upper): array => [
        'inventory' => (object) $inv,
        'player' => ['currants' => 0],
        'systems' => [
            'home' => ['owned' => $home],
            'skills' => ['learned' => $skills],
            'features' => ['homes' => ['decor' => ['wallSegments' => 7, 'placed' => [], 'storage' => (object) []], 'floors' => ['upper' => array_fill(0, $upper, ['placed' => []]), 'links' => []]]],
        ],
    ];
    $saves = [
        OWNER => $state(['plank' => 20, 'fuel_cell' => 2], ['woodworking_1', 'engineering_1'], true, 1),
        VISITOR => $state(['plank' => 8], ['woodworking_1'], true, 0),
    ];
    foreach ($saves as $id => $s) {
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)',
            [$id, json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($s)]]), gmdate('Y-m-d H:i:s', $now)]);
    }
    $ledger = new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
    Ledger::atomically($db, function () use ($ledger, $now): void {
        foreach ([OWNER, VISITOR] as $id) {
            $ledger->lock($id, $now);
        }
    });
    $peek = static function () use ($ledger): array {
        $o = [];
        foreach ([OWNER, VISITOR] as $id) {
            $p = $ledger->peek($id);
            $o[$id] = $p === null ? null : (array) $p['items'];
        }
        return $o;
    };
    $out['seeded'] = $peek();

    $caps = Capabilities::fromDb($db);
    $seams = static fn (int $as, Request $r): Seams => new Seams($db, $site, $r, Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    // As the realtime server posts it (home_machines.go homeMachine): signed with the shared secret.
    $act = static function (array $body) use ($seams): array {
        $json = (string) json_encode($body);
        $sig = ServiceCall::sign('POST', HomeMachines::ROUTE, time(), bin2hex(random_bytes(8)), $json, GRODDLE_REALTIME_SECRET);
        $r = new Request(Method::Post, HomeMachines::ROUTE, [], [ServiceCall::HEADER => $sig], [], $json, true, 'groddle.test');
        try {
            $res = (new HomeMachines($seams(0, $r)))->act($r);
            return ['http' => $res->status] + json_decode($res->body, true);
        } catch (RestError $e) {
            return ['http' => $e->status, 'code' => $e->errorCode];
        }
    };
    $t = $db->table(HomeMachines::TABLE);
    $rowOf = static fn (string $id): ?array => $db->row("SELECT place, rx, fuel, status, job FROM {$t} WHERE id = ?", [$id]);

    // —— Set down on the second floor ("house:1"), and on the ground floor at the same x ——
    $up = op();
    $out['placeUp'] = $act(['op' => $up, 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'place', 'class' => 'woodworker', 'rx' => 400, 'fuel' => 50]);
    $ground = op();
    $out['placeGround'] = $act(['op' => $ground, 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'place', 'class' => 'woodworker', 'rx' => 400, 'fuel' => 50]);
    $out['placeThird'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:2', 'verb' => 'place', 'class' => 'woodworker', 'rx' => 400, 'fuel' => 50]);
    $out['placeNear'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'place', 'class' => 'fuelmaker', 'rx' => 450]);
    $out['badPlace'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:3', 'verb' => 'place', 'class' => 'woodworker', 'rx' => 400]);

    // —— Run it: 2 Boards from 8 Planks, through the ledger ——
    $use = op();
    $out['use'] = $act(['op' => $use, 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'use', 'id' => $up, 'key' => 'board', 'qty' => 2]);
    $out['afterUse'] = $peek();
    $out['useAgain'] = $act(['op' => $use, 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'use', 'id' => $up, 'key' => 'board', 'qty' => 2]);
    $out['afterUseAgain'] = $peek();
    // Standing on the ground floor is not standing by it (the verbs' ok_states "in_location").
    $out['fromBelow'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'collect', 'id' => $up]);
    // The job's time is up.
    $job = json_decode((string) $rowOf($up)['job'], true);
    $job['ready'] = (int) (microtime(true) * 1000) - 1000;
    $db->execute("UPDATE {$t} SET job = ? WHERE id = ?", [json_encode($job), $up]);
    $out['collect'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'collect', 'id' => $up]);
    $out['afterCollect'] = $peek();
    $out['refuel'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'refuel', 'id' => $up]);
    $out['afterRefuel'] = $peek();
    $out['rowUp'] = $rowOf($up);

    // —— What a visitor's game is sent: each machine with its place ——
    $get = new Request(Method::Get, '/groddle/v1/homes/' . OWNER . '/machines', [], [], [], '', true, 'groddle.test');
    // The owner's game (G1018: a house's machines go only to whoever may enter it; an uninvited visitor gets none).
    $seen = json_decode((new HomeMachines($seams(OWNER, $get)))->view_($get, (string) OWNER)->body, true);
    $out['seen'] = array_map(static fn (array $m): array => [$m['id'] === $up ? 'up' : 'ground', $m['place'], $m['rx']], $seen['machines']);
    $uninvited = json_decode((new HomeMachines($seams(VISITOR, $get)))->view_($get, (string) OWNER)->body, true);
    $out['uninvited'] = array_map(static fn (array $m): string => (string) $m['place'], $uninvited['machines'] ?? []);

    // —— Picked up from the second floor; the ground floor's stays where it is ——
    $out['take'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house:1', 'verb' => 'take', 'id' => $up]);
    $out['rowUpAfter'] = $rowOf($up);
    $out['rowGround'] = $rowOf($ground);

    // —— G1303 (#669): the 200 px from where the player stands (the realtime server's "from") ——
    $out['fromNear'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'place', 'class' => 'fuelmaker', 'rx' => 600, 'from' => ['rx' => 520, 'dy' => 0]]);
    $out['noFrom'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'place', 'class' => 'fuelmaker', 'rx' => 290]);
    $out['badFrom'] = $act(['op' => op(), 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'place', 'class' => 'fuelmaker', 'rx' => 290, 'from' => ['rx' => '610', 'dy' => 0]]);
    $near = op();
    $out['fromFar'] = $act(['op' => $near, 'owner' => OWNER, 'actor' => OWNER, 'place' => 'house', 'verb' => 'place', 'class' => 'fuelmaker', 'rx' => 290, 'from' => ['rx' => 610, 'dy' => 0]]);
    $out['rowNear'] = $rowOf($near);
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out);
