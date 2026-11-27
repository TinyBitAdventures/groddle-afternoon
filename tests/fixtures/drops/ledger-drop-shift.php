<?php
/**
 * Runs the site repo's shift of the shared floor stacks (groddle-afternoon-site src/LedgerDrop.php
 * shiftStacks, G1327) against a throwaway MariaDB database and prints what happened as JSON
 * (tests/house-shift-g1327.test.js): the owner's un-expand moves every stack on the ground at x >= from
 * on their floors by -150, once per op, all or none; nobody else's floors and no other owner.
 *
 *   php tests/fixtures/drops/ledger-drop-shift.php <engine public/minn> <groddle-afternoon-site> run <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $mode, $host, $user, $pass] = $argv;
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

use Groddle\Minn\Economy;
use Groddle\Minn\Ledger;
use Groddle\Minn\LedgerDrop;
use Minn\Db;

const PREFIX = 'wp_';
const OWNER = 7;
const OTHER = 9;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_shift_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach (['groddle_ledger', 'groddle_ledger_items', 'groddle_trades', 'groddle_ledger_log', 'groddle_drops', 'groddle_ledger_credited'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $db = new Db($conn, PREFIX);
    $now = time();
    $ledger = new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    $stamp = gmdate('Y-m-d H:i:s', $now);
    // id => [street, x, status, dropper]
    $rows = [
        'drop-00000000000000a1' => ['HOUSE-7', 1900, 'ground', OWNER],   // by the old right wall
        'drop-00000000000000b2' => ['HOUSE-7', 1000, 'ground', OTHER],   // mid-room
        'drop-00000000000000c3' => ['HOUSE-7-1', 1800, 'ground', OWNER], // upstairs, by the wall
        'drop-00000000000000d4' => ['TOWER-7-2', 1900, 'ground', OWNER], // a Tower floor: not the house
        'drop-00000000000000e5' => ['HOUSE-9', 1900, 'ground', OTHER],   // someone else's house
        'drop-00000000000000f6' => ['HOUSE-7', 1900, 'taken', OTHER],    // picked up already
        'drop-0000000000000017' => ['HOUSE-7', 1750, 'ground', OTHER],   // exactly at the edge (x >= from)
    ];
    foreach ($rows as $id => [$street, $x, $status, $by]) {
        $db->execute('INSERT INTO ' . $db->table(LedgerDrop::TABLE) . " (id, dropper_id, street, x, y, class_tsid, count, status, created_at) VALUES (?, ?, ?, ?, 620, 'cherry', 1, ?, ?)", [$id, $by, $street, $x, $status, $stamp]);
    }
    $xs = static function () use ($db): array {
        $o = [];
        foreach ($db->rows('SELECT id, x FROM ' . $db->table(LedgerDrop::TABLE) . ' ORDER BY id') as $r) {
            $o[(string) $r['id']] = (int) $r['x'];
        }
        return $o;
    };
    $house = ['HOUSE-7', 'HOUSE-7-1', 'HOUSE-7-2'];
    $op1 = 'shift-' . bin2hex(random_bytes(8));
    $call = LedgerDrop::shiftCall(['op' => $op1, 'id' => OWNER, 'streets' => $house, 'from' => 1750, 'dx' => -150]);
    $out['call'] = $call;
    $out['bad'] = [
        'dx' => LedgerDrop::shiftCall(['op' => $op1, 'id' => OWNER, 'streets' => $house, 'from' => 1750, 'dx' => -300]),
        'op' => LedgerDrop::shiftCall(['op' => 'move-0000000000000001', 'id' => OWNER, 'streets' => $house, 'from' => 1750, 'dx' => -150]),
        'street' => LedgerDrop::shiftCall(['op' => $op1, 'id' => OWNER, 'streets' => ['LA5101HF7F429V'], 'from' => 1750, 'dx' => -150]),
        'twice' => LedgerDrop::shiftCall(['op' => $op1, 'id' => OWNER, 'streets' => ['HOUSE-7', 'HOUSE-7'], 'from' => 1750, 'dx' => -150]),
        'from' => LedgerDrop::shiftCall(['op' => $op1, 'id' => OWNER, 'streets' => $house, 'from' => -1, 'dx' => -150]),
    ];
    $out['before'] = $xs();
    // Another player names the owner's floors: refused, nothing moves.
    $out['other'] = $run(fn () => LedgerDrop::shiftStacks($db, $ledger, ['op' => 'shift-' . bin2hex(random_bytes(8)), 'id' => OTHER, 'streets' => $house, 'from' => 1750, 'dx' => -150], $now));
    $out['afterOther'] = $xs();
    // A transaction that fails after the shift (the connection lost before commit) leaves nothing moved and nothing recorded.
    try {
        $run(function () use ($db, $ledger, $call, $now): void {
            LedgerDrop::shiftStacks($db, $ledger, $call, $now);
            throw new RuntimeException('lost before commit');
        });
    } catch (RuntimeException) {
    }
    $out['afterFailed'] = $xs();
    $out['first'] = $run(fn () => LedgerDrop::shiftStacks($db, $ledger, $call, $now));
    $out['afterFirst'] = $xs();
    // Asked again (an answer lost on the way back): nothing moves twice, the same answer.
    $out['retry'] = $run(fn () => LedgerDrop::shiftStacks($db, $ledger, $call, $now));
    $out['afterRetry'] = $xs();
    $out['logged'] = (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(Ledger::LOG) . " WHERE kind = 'shift'");
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
