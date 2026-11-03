<?php
/**
 * Runs the site repo's box and cabinet ledger (groddle-afternoon-site
 * src/LedgerBoxes.php, with Ledger, LedgerMath and the save it reads) against
 * a throwaway MariaDB database and prints what happened as JSON
 * (tests/home-storage-ledger.test.js). The database is made here
 * (test_groddle_boxes_<hex>, from the site's minn.json declarations) and
 * dropped at the end; nothing else is touched.
 *
 *   php tests/fixtures/home-storage/ledger-boxes.php <engine public/minn> <groddle-afternoon-site> run <host> <user> <pass>
 *   php ... child <host> <user> <pass> <db> <op> <buyer> <barrier file>   one buyer of the race
 */

declare(strict_types=1);

[, $engine, $extension, $mode] = $argv;
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
use Groddle\Minn\LedgerBoxes;
use Groddle\Minn\LedgerMath;
use Groddle\Minn\LedgerStarter;
use Minn\Db;

const PREFIX = 'wp_';
const OWNER = 7;
const BUYER = 9;
const RICH = 10;
const KEYHOLDER = 11;
const BLOCKED = 12;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

function ledgerOf(Db $db): Ledger
{
    return new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
}

function op(string $prefix): string
{
    return $prefix . '-' . bin2hex(random_bytes(8));
}

if ($mode === 'child') {
    [, , , , $host, $user, $pass, $name, $op, $buyer, $barrier] = $argv;
    $db = new Db(connect($host, $user, $pass, $name), PREFIX);
    $until = microtime(true) + 10;
    while (!is_file($barrier) && microtime(true) < $until) {
        usleep(500);
    }
    try {
        $out = Ledger::atomically($db, fn () => LedgerBoxes::buy($db, ledgerOf($db), $op, (int) $buyer, OWNER, 6, 1, 5, time()));
    } catch (Throwable $e) {
        $out = ['status' => 'error', 'error' => get_class($e) . ': ' . $e->getMessage()];
    }
    echo json_encode($out);
    exit(0);
}

[, , , , $host, $user, $pass] = $argv;
$name = 'test_groddle_boxes_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach (['groddle_ledger', 'groddle_ledger_items', 'groddle_trades', 'groddle_ledger_log', 'groddle_mp_saves', 'groddle_ignores', 'groddle_house_keys', 'groddle_furniture_sales', 'groddle_home_boxes', 'groddle_home_box_ops', 'groddle_ledger_credited', 'groddle_ledger_outcomes'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $db = new Db($conn, PREFIX);
    $now = time();

    // —— The houses ——
    $saveOf = static function (array $state): string {
        return (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]);
    };
    $house = static fn (array $placed, int $currants = 0, array $inv = []): array => [
        'inventory' => (object) $inv,
        'player' => ['currants' => $currants],
        'systems' => ['home' => ['owned' => true], 'features' => ['homes' => ['decor' => ['placed' => $placed, 'storage' => (object) []]]]],
    ];
    $ownerPlaced = [
        ['id' => 4, 'classTsid' => 'bag_furniture_sdb', 'x' => 600, 'y' => 500, 'display' => ['classTsid' => 'apple', 'count' => 10]],
        ['id' => 5, 'classTsid' => 'bag_furniture_cabinet', 'x' => 300, 'y' => 620, 'contents' => [['classTsid' => 'apple', 'count' => 3], null, null]],
        ['id' => 6, 'classTsid' => 'bag_furniture_sdb', 'x' => 700, 'y' => 500, 'display' => ['classTsid' => 'plum', 'count' => 1]],
        ['id' => 8, 'classTsid' => 'furniture_chair', 'x' => 200, 'y' => 620],
    ];
    $saves = [OWNER => $house($ownerPlaced, 0, ['pick' => 1]), BUYER => $house([], 100), RICH => $house([], 1000), KEYHOLDER => $house([], 0, ['cherry' => 5, 'pick' => 1]), BLOCKED => $house([], 500)];
    foreach ($saves as $id => $state) {
        $db->execute('INSERT INTO ' . $db->table('groddle_mp_saves') . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, $saveOf($state), gmdate('Y-m-d H:i:s')]);
    }
    $db->execute('INSERT INTO ' . $db->table('groddle_house_keys') . ' (owner_id, holder_id, granted_at) VALUES (?, ?, ?)', [OWNER, KEYHOLDER, gmdate('Y-m-d H:i:s')]);
    $db->execute('INSERT INTO ' . $db->table('groddle_ignores') . ' (user_id, ignored_id, added_at) VALUES (?, ?, ?)', [OWNER, BLOCKED, gmdate('Y-m-d H:i:s')]);
    // A key the owner gave before blocking them: the block still keeps them out of the cabinet.
    $db->execute('INSERT INTO ' . $db->table('groddle_house_keys') . ' (owner_id, holder_id, granted_at) VALUES (?, ?, ?)', [OWNER, BLOCKED, gmdate('Y-m-d H:i:s')]);
    $ledger = ledgerOf($db);
    $peek = static function () use ($ledger): array {
        $o = [];
        foreach ([OWNER, BUYER, RICH, KEYHOLDER, BLOCKED] as $id) {
            $p = $ledger->peek($id);
            $o[$id] = $p === null ? null : ['currants' => $p['currants'], 'items' => (array) $p['items']];
        }
        return $o;
    };
    $count = static fn (string $t): int => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table($t));
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    // Seed every ledger from its save (a character from before the ledger is seeded once).
    $run(function () use ($ledger, $now): void {
        foreach ([OWNER, BUYER, RICH, KEYHOLDER, BLOCKED] as $id) {
            $ledger->lock($id, $now);
        }
    });
    $out['seeded'] = $peek();

    // —— The owner prices the box (set_selling_price) ——
    $refusal = static function (callable $fn): ?string {
        try {
            $fn();
            return null;
        } catch (Minn\RestError $e) {
            return $e->errorCode;
        }
    };
    $out['price'] = [
        'chair' => $refusal(fn () => $run(fn () => LedgerBoxes::setPrice($db, OWNER, 8, 12, $now))),
        'missing' => $refusal(fn () => $run(fn () => LedgerBoxes::setPrice($db, OWNER, 99, 12, $now))),
        'set' => $refusal(fn () => $run(fn () => LedgerBoxes::setPrice($db, OWNER, 4, 12, $now))),
        'plum' => $refusal(fn () => $run(fn () => LedgerBoxes::setPrice($db, OWNER, 6, 5, $now))),
    ];
    $out['shown'] = LedgerBoxes::shown($db, OWNER, Groddle\Minn\Neighbours::state($db, OWNER));

    // —— Buying ——
    $first = op('sdb');
    $out['buy'] = $run(fn () => LedgerBoxes::buy($db, $ledger, $first, BUYER, OWNER, 4, 5, 12, $now));
    $out['afterBuy'] = $peek();
    $tradesBefore = $count('groddle_trades');
    $out['again'] = $run(fn () => LedgerBoxes::buy($db, $ledger, $first, BUYER, OWNER, 4, 5, 12, $now));
    $out['againTrades'] = $count('groddle_trades') - $tradesBefore;
    $out['afterAgain'] = $peek();
    $out['someoneElsesOp'] = $run(fn () => LedgerBoxes::buy($db, $ledger, $first, RICH, OWNER, 4, 1, 12, $now));
    $out['overdraw'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), BUYER, OWNER, 4, 5, 12, $now));
    $out['underpay'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), BUYER, OWNER, 4, 1, 1, $now));
    $out['overpay'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), BUYER, OWNER, 4, 1, 13, $now));
    $out['zero'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), BUYER, OWNER, 4, 0, 12, $now));
    $out['blocked'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), BLOCKED, OWNER, 4, 1, 12, $now));
    $out['own'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), OWNER, OWNER, 4, 1, 12, $now));
    $out['afterRefusals'] = $peek();
    $out['moreThanStock'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), RICH, OWNER, 4, 50, 12, $now));
    $out['soldOut'] = $run(fn () => LedgerBoxes::buy($db, $ledger, op('sdb'), RICH, OWNER, 4, 1, 12, $now));
    $out['afterSoldOut'] = $peek();
    $out['mine'] = LedgerBoxes::mine($db, OWNER);

    // Atomic: a purchase whose transaction fails part way leaves nothing behind.
    $before = [$peek(), $count('groddle_trades'), $count('groddle_home_box_ops')];
    try {
        $db->transaction(function () use ($db, $ledger, $now): void {
            LedgerBoxes::buy($db, $ledger, op('sdb'), RICH, OWNER, 6, 1, 5, $now);
            throw new RuntimeException('the request died here');
        });
    } catch (RuntimeException) {
    }
    $out['rolledBack'] = [$peek(), $count('groddle_trades'), $count('groddle_home_box_ops')] === $before;

    // —— The race for the last plum: two buyers at once, in two processes ——
    $barrier = sys_get_temp_dir() . '/' . $name . '.go';
    $kids = [];
    foreach ([BUYER, RICH] as $who) {
        $cmd = [PHP_BINARY, __FILE__, $engine, $extension, 'child', $host, $user, $pass, $name, op('sdb'), (string) $who, $barrier];
        $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $kids[] = [$p, $pipes];
    }
    usleep(150000);
    touch($barrier);
    $race = [];
    foreach ($kids as [$p, $pipes]) {
        $race[] = json_decode((string) stream_get_contents($pipes[1]), true) ?? ['status' => 'error', 'error' => stream_get_contents($pipes[2])];
        proc_close($p);
    }
    @unlink($barrier);
    $out['race'] = $race;
    $out['afterRace'] = $peek();

    // —— The owner, offline all along, loads: each purchase comes out of that very box ——
    $stored = json_decode((string) $db->value('SELECT data FROM ' . $db->table('groddle_mp_saves') . ' WHERE user_id = ?', [OWNER]), true)['entries'];
    $caught = $run(fn () => $ledger->catchUp(OWNER, $stored, $now));
    $state = json_decode($caught['entries']['playerState'], true);
    $boxes = [];
    foreach ($state['systems']['features']['homes']['decor']['placed'] as $row) {
        $boxes[$row['id']] = $row['display'] ?? null;
    }
    $out['caughtUp'] = ['changed' => $caught['changed'], 'boxes' => $boxes, 'applied' => $state['systems']['features']['trade']['applied'] ?? []];
    $db->execute('UPDATE ' . $db->table('groddle_mp_saves') . ' SET data = ? WHERE user_id = ?', [$saveOf($state), OWNER]);
    $write = $run(fn () => $ledger->write(OWNER, $caught['entries'], $now));
    $out['ownerWrite'] = ['clamped' => $write['clamped'], 'pendingAfter' => LedgerBoxes::pending($db, OWNER)];
    $out['holdings'] = LedgerMath::holdings($caught['entries'], Economy::shared());

    // —— Collecting (collect_currants), once per collection ——
    $c1 = op('sdbc');
    $out['collect'] = $run(fn () => LedgerBoxes::collect($db, $ledger, OWNER, 4, $c1, $now));
    $out['collectAgain'] = $run(fn () => LedgerBoxes::collect($db, $ledger, OWNER, 4, $c1, $now));
    $out['collectNothing'] = $run(fn () => LedgerBoxes::collect($db, $ledger, OWNER, 4, op('sdbc'), $now));
    $out['collectNotYours'] = $run(fn () => LedgerBoxes::collect($db, $ledger, BUYER, 4, $c1, $now));
    $out['afterCollect'] = $peek();

    // —— A key-holder at the cabinet ——
    $pack = LedgerStarter::table();
    $eco = Economy::shared();
    $cab = static fn (string $op, int $actor, string $kind, ?int $slot, string $class, int $n) => $run(fn () => LedgerBoxes::cabinetMove($db, $ledger, $eco, $pack, $op, $actor, OWNER, 5, $kind, $slot, $class, $n, $now));
    $take = op('cab');
    $out['cabinet'] = [
        'noKey' => $cab(op('cab'), BUYER, 'take', 0, 'apple', 1),
        'blocked' => $cab(op('cab'), BLOCKED, 'take', 0, 'apple', 1),
        'take' => $cab($take, KEYHOLDER, 'take', 0, 'apple', 2),
        'takeAgain' => $cab($take, KEYHOLDER, 'take', 0, 'apple', 2),
        'takeTooMany' => $cab(op('cab'), KEYHOLDER, 'take', 0, 'apple', 5),
        'tool' => $cab(op('cab'), KEYHOLDER, 'put', 1, 'pick', 1),
        'put' => $cab(op('cab'), KEYHOLDER, 'put', 2, 'cherry', 4),
        'putMore' => $cab(op('cab'), KEYHOLDER, 'put', 2, 'cherry', 4),
        'notCabinet' => $run(fn () => LedgerBoxes::cabinetMove($db, $ledger, $eco, $pack, op('cab'), KEYHOLDER, OWNER, 4, 'put', null, 'cherry', 1, $now)),
    ];
    $out['afterCabinet'] = $peek();
    $stored = json_decode((string) $db->value('SELECT data FROM ' . $db->table('groddle_mp_saves') . ' WHERE user_id = ?', [OWNER]), true)['entries'];
    $caught = $run(fn () => $ledger->catchUp(OWNER, $stored, $now));
    $state = json_decode($caught['entries']['playerState'], true);
    foreach ($state['systems']['features']['homes']['decor']['placed'] as $row) {
        if ($row['id'] === 5) {
            $out['cabinetCaughtUp'] = $row['contents'];
        }
    }
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
