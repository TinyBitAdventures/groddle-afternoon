<?php
/**
 * Runs the site repo's shared street stacks (groddle-afternoon-site
 * src/LedgerDrop.php, with Ledger, LedgerMath and the save it reads) against
 * a throwaway MariaDB database and prints what happened as JSON
 * (tests/g560-shared-pickup.test.js): a drop, parts of it picked up (each its
 * own op, <drop>-t<from>), a retried ask, stale counts, two pickers racing in
 * two processes, the rest taken whole, a stack from before parts, and the
 * picker's load. The database is made here (test_groddle_drops_<hex>, from
 * the site's minn.json declarations) and dropped at the end.
 *
 *   php tests/fixtures/drops/ledger-drop-take.php <engine public/minn> <groddle-afternoon-site> run <host> <user> <pass>
 *   php ... child <host> <user> <pass> <db> <drop op> <taker> <n|all> <from> <barrier file>   one picker of a race
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
use Groddle\Minn\LedgerDrop;
use Minn\Db;

const PREFIX = 'wp_';
const DROPPER = 7;
const ADA = 9;
const BO = 11;
const STREET = 'LA5101HF7F429V';

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

function dropOp(): string
{
    return 'drop-' . bin2hex(random_bytes(8));
}

if ($mode === 'child') {
    [, , , , $host, $user, $pass, $name, $op, $taker, $n, $from, $barrier] = $argv;
    $db = new Db(connect($host, $user, $pass, $name), PREFIX);
    $until = microtime(true) + 10;
    while (!is_file($barrier) && microtime(true) < $until) {
        usleep(500);
    }
    try {
        $out = Ledger::atomically($db, fn () => LedgerDrop::give($db, ledgerOf($db), $op, (int) $taker, 'pickup', time(), $n === 'all' ? null : (int) $n, $n === 'all' ? null : (int) $from));
    } catch (Throwable $e) {
        $out = ['status' => 'error', 'error' => get_class($e) . ': ' . $e->getMessage()];
    }
    echo json_encode(['taker' => (int) $taker] + $out);
    exit(0);
}

[, , , , $host, $user, $pass] = $argv;
$name = 'test_groddle_drops_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach (['groddle_ledger', 'groddle_ledger_items', 'groddle_trades', 'groddle_ledger_log', 'groddle_mp_saves', 'groddle_drops', 'groddle_ledger_credited', 'groddle_ledger_outcomes'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $db = new Db($conn, PREFIX);
    $now = time();
    $saveOf = static fn (array $state): string => (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($state)]]);
    $saves = [DROPPER => ['cherry' => 20], ADA => ['apple' => 1], BO => ['apple' => 1]];
    foreach ($saves as $id => $inv) {
        $db->execute('INSERT INTO ' . $db->table('groddle_mp_saves') . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, $saveOf(['inventory' => $inv, 'player' => ['currants' => 0]]), gmdate('Y-m-d H:i:s')]);
    }
    $ledger = ledgerOf($db);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    $run(function () use ($ledger, $now): void {
        foreach ([DROPPER, ADA, BO] as $id) {
            $ledger->lock($id, $now);
        }
    });
    $cherries = static function () use ($ledger): array {
        $o = [];
        foreach ([DROPPER, ADA, BO] as $id) {
            $items = (array) ($ledger->peek($id)['items'] ?? []);
            $o[$id] = (int) ($items['cherry'] ?? 0) + (int) ($items['pick'] ?? 0) * 1000;
        }
        return $o;
    };
    $row = static fn (string $op): array => $db->row('SELECT count, status, taker_id, why FROM ' . $db->table(LedgerDrop::TABLE) . ' WHERE id = ?', [$op]);
    $trades = static fn (): int => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(Ledger::TRADES));
    $give = static fn (string $op, int $who, ?int $n = null, ?int $from = null, string $why = 'pickup') => $run(fn () => LedgerDrop::give($db, $ledger, $op, $who, $why, $now, $n, $from));

    // —— The drop: 10 cherries on the street ——
    $op = dropOp();
    $out['op'] = $op;
    $out['drop'] = $run(fn () => LedgerDrop::settle($db, $ledger, ['op' => $op, 'id' => DROPPER, 'street' => STREET, 'x' => 100, 'y' => -20, 'c' => 'cherry', 'n' => 10, 'r' => null], $now));
    $out['afterDrop'] = $cherries();

    // —— Ada picks up 4 of the 10 ——
    $out['part'] = $give($op, ADA, 4, 10);
    $out['afterPart'] = ['ledger' => $cherries(), 'row' => $row($op)];
    // The realtime server asks again (its retry, or a lost answer): as recorded, nothing more moves.
    $before = $trades();
    $out['retry'] = $give($op, ADA, 4, 10);
    $out['afterRetry'] = ['ledger' => $cherries(), 'row' => $row($op), 'newTrades' => $trades() - $before];
    // Bo asks for a part of the count that was there: stale, with the count there is.
    $out['staleSame'] = $give($op, BO, 2, 10);
    $out['staleOther'] = $give($op, BO, 2, 8);
    $out['afterStale'] = ['ledger' => $cherries(), 'row' => $row($op), 'newTrades' => $trades() - $before];

    // —— A race: Ada and Bo each ask 4 of the 6, in two processes ——
    $race = static function (array $asks) use ($engine, $extension, $host, $user, $pass, $name, $op): array {
        $barrier = sys_get_temp_dir() . '/' . $name . '-' . bin2hex(random_bytes(3)) . '.go';
        $kids = [];
        foreach ($asks as [$who, $n, $from]) {
            $cmd = [PHP_BINARY, __FILE__, $engine, $extension, 'child', $host, $user, $pass, $name, $op, (string) $who, (string) $n, (string) $from, $barrier];
            $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            $kids[] = [$p, $pipes];
        }
        usleep(150000);
        touch($barrier);
        $res = [];
        foreach ($kids as [$p, $pipes]) {
            $res[] = json_decode((string) stream_get_contents($pipes[1]), true) ?? ['status' => 'error', 'error' => stream_get_contents($pipes[2])];
            proc_close($p);
        }
        @unlink($barrier);
        return $res;
    };
    $out['race'] = $race([[ADA, 4, 6], [BO, 4, 6]]);
    $out['afterRace'] = ['ledger' => $cherries(), 'row' => $row($op)];
    // A part and the whole at once, on the 2 left.
    $out['race2'] = $race([[ADA, 1, 2], [BO, 'all', 0]]);
    $out['afterRace2'] = ['ledger' => $cherries(), 'row' => $row($op)];
    $out['late'] = $give($op, ADA, 1, 2);

    // —— What each picker's save has not applied, and Ada's load ——
    $out['unappliedAda'] = LedgerDrop::unapplied($db, ADA, $now);
    $out['unappliedBo'] = LedgerDrop::unapplied($db, BO, $now);
    $stored = json_decode((string) $db->value('SELECT data FROM ' . $db->table('groddle_mp_saves') . ' WHERE user_id = ?', [ADA]), true)['entries'];
    $caught = $run(fn () => $ledger->catchUp(ADA, $stored, $now));
    $state = json_decode($caught['entries']['playerState'], true);
    $out['caughtUp'] = ['changed' => $caught['changed'], 'cherry' => $state['inventory']['cherry'] ?? 0, 'applied' => $state['systems']['features']['trade']['applied'] ?? []];
    $write = $run(fn () => $ledger->write(ADA, $caught['entries'], $now));
    $out['adaWrite'] = $write['clamped'];

    // —— A stack from before parts (a row already on the ground): a part, then the rest whole, then home ——
    $old = dropOp();
    $db->execute('INSERT INTO ' . $db->table(LedgerDrop::TABLE) . " (id, dropper_id, street, x, y, class_tsid, count, points, tag, status, created_at) VALUES (?, ?, ?, 0, 0, 'pick', 3, 40, NULL, 'ground', ?)", [$old, DROPPER, STREET, gmdate('Y-m-d H:i:s', $now - 86400)]);
    $out['oldPart'] = $give($old, BO, 1, 3);
    $out['oldReturnPart'] = $run(fn () => LedgerDrop::give($db, $ledger, $old, DROPPER, 'return', $now));
    $out['oldRow'] = $row($old);
    $out['oldUnappliedBo'] = array_values(array_filter(LedgerDrop::unapplied($db, BO, $now), static fn (array $e): bool => str_starts_with($e['op'], $old)));
    $out['oldUnappliedDropper'] = array_values(array_filter(LedgerDrop::unapplied($db, DROPPER, $now), static fn (array $e): bool => str_starts_with($e['op'], $old)));
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
