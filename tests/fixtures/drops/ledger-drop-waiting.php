<?php
/**
 * Report #691: emblems past today's limit (LedgerMath EMBLEM_DAILY 4, EMBLEM_WAIT 4) stand in the
 * pack outside the ledger until the next 00:00 UTC, and a drop, trade or gift of one is refused as
 * waiting, with words that say so, instead of "You don't have enough of that item". Runs the site
 * repo's Ledger, LedgerMath and LedgerDrop against a throwaway MariaDB database
 * (test_groddle_wait_<hex>, from the site's minn.json declarations, dropped at the end) and prints
 * what happened as JSON (tests/r691-emblem-wait.test.js).
 *
 *   php tests/fixtures/drops/ledger-drop-waiting.php <engine public/minn> <groddle-afternoon-site> run <host> <user> <pass>
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
const PLAYER = 7;
const OTHER = 9;
const STREET = 'HOUSE-7';
const GIANTS = ['grendaline', 'mab', 'friendly', 'lem', 'pot', 'cosma', 'spriggan', 'zille'];

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_wait_' . bin2hex(random_bytes(4));
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
    $ledger = new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    // 21:00 UTC: three hours before the day's count starts again.
    $now = intdiv(time(), 86400) * 86400 + 21 * 3600;
    $out['now'] = $now;
    $state = static fn (array $inv, int $emblems): array => [
        'version' => 7, 'inventory' => $inv, 'player' => ['currants' => 0, 'xp' => 5000, 'level' => 5],
        'systems' => ['quests' => ['completed' => []], 'achievements' => ['unlocked' => []], 'shrines' => ['emblems' => array_fill_keys(GIANTS, $emblems), 'favor' => [], 'donations' => 0], 'features' => []],
    ];
    $saveOf = static fn (array $s): string => (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($s)]]);
    // The stored save before the day's claims: four of each Giant's emblems already credited and spent, a stack of meat.
    foreach ([PLAYER => $state(['meat' => 5], 4), OTHER => $state(['apple' => 1], 0)] as $id => $s) {
        $db->execute('INSERT INTO ' . $db->table('groddle_mp_saves') . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, $saveOf($s), gmdate('Y-m-d H:i:s', $now)]);
    }
    $marks = [['base', 'base', 1], ['base905', 'base905', 1], ['level', 'level', 5], ['mark', 'base', 1], ['mark', 'base905', 1]];
    foreach (GIANTS as $g) {
        $marks[] = ['mark', "emblem:{$g}", 4];
    }
    foreach ([PLAYER, OTHER] as $id) {
        foreach ($marks as [$kind, $ref, $n]) {
            $db->execute('INSERT INTO ' . $db->table(Ledger::CREDITED) . ' (user_id, kind, ref, n, at) VALUES (?, ?, ?, ?, ?)', [$id, $kind, $ref, $n, gmdate('Y-m-d H:i:s', $now)]);
        }
    }
    $run(function () use ($ledger, $now): void {
        $ledger->lock(PLAYER, $now);
        $ledger->lock(OTHER, $now);
    });

    // The day's eight claims, one of each Giant's emblem, reach the site in one save write.
    $inv = ['meat' => 5];
    foreach (GIANTS as $g) {
        $inv["emblem_{$g}"] = 1;
    }
    $write = $run(fn () => $ledger->write(PLAYER, ['playerState' => (string) json_encode($state($inv, 5))], $now));
    $out['clamped'] = $write['clamped'];
    $items = (array) ($ledger->peek(PLAYER)['items'] ?? []);
    $out['credited'] = [];
    $out['waits'] = [];
    foreach (GIANTS as $g) {
        if ((int) ($items["emblem_{$g}"] ?? 0) > 0) {
            $out['credited'][] = $g;
        } else {
            $out['waits'][] = $g;
        }
    }
    $out['waitRows'] = [];
    foreach ($db->rows('SELECT ref, n FROM ' . $db->table(Ledger::CREDITED) . ' WHERE user_id = ? AND kind = ? ORDER BY ref', [PLAYER, 'waitday']) as $r) {
        $out['waitRows'][(string) $r['ref']] = (int) $r['n'];
    }

    $op = static fn (): string => 'drop-' . bin2hex(random_bytes(8));
    $drop = static fn (string $op, string $c, int $n) => $run(fn () => LedgerDrop::settle($db, $ledger, ['op' => $op, 'id' => PLAYER, 'street' => STREET, 'x' => 100, 'y' => -20, 'c' => $c, 'n' => $n, 'r' => null], $now));
    // A credited emblem and the meat drop as before; a waiting emblem is refused as waiting, and asked again answers the same.
    $out['dropCredited'] = $drop($op(), 'emblem_' . ($out['credited'][0] ?? 'grendaline'), 1);
    $out['dropMeat'] = $drop($op(), 'meat', 5);
    $waitOp = $op();
    $out['dropWaiting'] = $drop($waitOp, 'emblem_' . ($out['waits'][0] ?? 'zille'), 1);
    $out['dropWaitingAgain'] = $drop($waitOp, 'emblem_' . ($out['waits'][0] ?? 'zille'), 1);
    // More than the pack holds is a plain short.
    $out['dropTwo'] = $drop($op(), 'emblem_' . ($out['waits'][1] ?? 'spriggan'), 2);
    $out['dropMore'] = $drop($op(), 'meat', 6);
    $out['afterDrops'] = (array) ($ledger->peek(PLAYER)['items'] ?? []);
    // A trade (and a gift, which settles as one: the realtime server's goods, a list of stacks) of a waiting emblem says so too.
    $out['trade'] = $run(fn () => $ledger->settle('trade-' . bin2hex(random_bytes(8)), [PLAYER, OTHER], [['items' => [['c' => 'emblem_' . ($out['waits'][1] ?? 'spriggan'), 'n' => 1]], 'currants' => 0], ['items' => [], 'currants' => 0]], $now));
    $out['gift'] = $run(fn () => $ledger->settle('gift-' . bin2hex(random_bytes(8)), [PLAYER, OTHER], [['items' => [['c' => 'emblem_' . ($out['waits'][1] ?? 'spriggan'), 'n' => 1]], 'currants' => 0], ['items' => [], 'currants' => 0]], $now, 'give'));
    // After midnight UTC the wait has lapsed (the day's first write credits it): no waiting answer from an old row.
    $out['nextDay'] = $run(fn () => $ledger->waitingFor(PLAYER, ['items' => ['emblem_' . ($out['waits'][0] ?? 'zille') => 1], 'currants' => 0], 'drop', $now + 3 * 3600 + 60));
    // And the day's first write credits what waited, so it drops.
    $inv2 = $inv;
    unset($inv2['meat'], $inv2['emblem_' . ($out['credited'][0] ?? 'grendaline')]);
    $tomorrow = $now + 3 * 3600 + 60;
    $run(fn () => $ledger->write(PLAYER, ['playerState' => (string) json_encode($state($inv2, 5))], $tomorrow));
    $out['dropTomorrow'] = $run(fn () => LedgerDrop::settle($db, $ledger, ['op' => $op(), 'id' => PLAYER, 'street' => STREET, 'x' => 100, 'y' => -20, 'c' => 'emblem_' . ($out['waits'][0] ?? 'zille'), 'n' => 1, 'r' => null], $tomorrow));
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
