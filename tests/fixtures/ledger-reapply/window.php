<?php
/**
 * G1320 (report #670's reopen): a copy of the save kept over the stored one (MultiplayerSave takeover)
 * gets the trades applied since it was last saved put back into it (groddle-afternoon-site
 * src/Ledger.php reapply). The window looked back at most a day, so a copy older than that lost what
 * the other window or the site applied since: a Still put back, a gift. This runs the takeover's
 * ledger steps (Ledger::takeoverSince, reapply, write, as MultiplayerSave::write runs them) against a
 * throwaway MariaDB database and prints what happened as JSON (tests/ledger-reapply-window-g1320.test.js):
 *
 *   - 600 plays; 601 trades with them.
 *   - 31 h ago: 601 gave 600 a Cherry (trade t-g1320-old), which 600's copy A applied and saved; A saved
 *     again 30 h ago, its applied list run past that trade by then (it lists nothing).
 *   - 25 h ago: 600 gave 601 an Apple for an Emotional Bear (trade t-g1320-bear), applied by copy B,
 *     which saved then and again an hour ago.
 *   - Now copy A is kept over copy B: since = 30 h ago. The Bear comes into it, the Apple leaves, the
 *     Cherry stays one (never twice), and the write checks clean.
 *   - The same copy with no time named (an old page: since 0) looks back a day, as before.
 *
 * The database is made here (test_groddle_reapply_<hex>, from the site's minn.json declarations) and
 * dropped at the end.
 *
 *   php tests/fixtures/ledger-reapply/window.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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

use Groddle\Minn\Economy;
use Groddle\Minn\Ledger;
use Groddle\Minn\LedgerMath;
use Minn\Db;

const PREFIX = 'wp_';
const ME = 600;
const THEM = 601;

$name = 'test_groddle_reapply_' . bin2hex(random_bytes(4));
$root = new mysqli($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = new mysqli($host, $user, $pass, $name);
    $conn->set_charset('utf8mb4');
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach ($manifest['tables'] as $t => $lines) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $lines) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $out['keys'] = array_values(array_unique(array_column($conn->query('SHOW INDEX FROM ' . PREFIX . 'groddle_trades')->fetch_all(MYSQLI_ASSOC), 'Key_name')));
    $db = new Db($conn, PREFIX);
    $economy = Economy::shared();
    $ledger = new Ledger($db, $economy, Ledger::RATE, Ledger::CAPACITY);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    $now = time();
    $h = static fn (int $hours): int => $now - 3600 * $hours;
    $sql = static fn (int $at): string => gmdate('Y-m-d H:i:s', $at);
    $saves = $db->table('groddle_mp_saves');
    $saveJson = static fn (array $e): string => (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => $e]);
    $entries = static fn (array $pack, array $applied = []): array => ['playerState' => (string) json_encode([
        'inventory' => $pack, 'player' => ['currants' => 100], 'savedAt' => 0,
        'systems' => ['features' => ['trade' => ['applied' => $applied]]],
    ])];
    $pack = static fn (array $e): array => array_filter(json_decode($e['playerState'], true)['inventory'], static fn ($n) => $n > 0);
    $ledgerItems = static fn (int $u): array => (array) ($ledger->peek($u)['items'] ?? []);
    $store = static function (int $u, array $e, int $at) use ($db, $saves, $saveJson, $sql): void {
        $db->execute("INSERT INTO {$saves} (user_id, data, version, updated_at, writer, seq) VALUES (?, ?, 1, ?, 'pageBBBB2222', 1) ON DUPLICATE KEY UPDATE data = VALUES(data), version = version + 1, updated_at = VALUES(updated_at)", [$u, $saveJson($e), $sql($at)]);
    };

    // —— 40 h ago: both characters, their ledgers seeded from their saves ——
    $store(ME, $entries(['apple' => 2]), $h(40));
    $store(THEM, $entries(['cherry' => 3, 'emotional_bear' => 1]), $h(40));
    foreach ([ME, THEM] as $u) {
        $run(fn () => $ledger->lock($u, $h(40)));
        $run(fn () => $ledger->write($u, json_decode((string) $db->value("SELECT data FROM {$saves} WHERE user_id = ?", [$u]), true)['entries'], $h(40)));
    }

    // —— 31 h ago: a Cherry from 601, applied by 600's copy A (saved 30 h ago, its list since run past it) ——
    $out['old'] = $run(fn () => $ledger->settle('t-g1320-old', [THEM, ME], [['items' => [['c' => 'cherry', 'n' => 1]], 'currants' => 0], ['items' => [], 'currants' => 0]], $h(31)))['status'];
    $listed = $entries(['apple' => 2, 'cherry' => 1], ['t-g1320-old']);
    $run(fn () => $ledger->write(ME, $listed, $h(31)));
    $store(ME, $listed, $h(31));
    // 30 h ago copy A saved again, its applied list run past the Cherry's trade (APPLIED_KEEP).
    $copyA = $entries(['apple' => 2, 'cherry' => 1]);
    $run(fn () => $ledger->write(ME, $copyA, $h(30)));
    $store(ME, $copyA, $h(30));
    $sinceA = $h(30);

    // —— 25 h ago: copy B (another device) trades an Apple for an Emotional Bear and saves; again an hour ago ——
    $out['bear'] = $run(fn () => $ledger->settle('t-g1320-bear', [ME, THEM], [['items' => [['c' => 'apple', 'n' => 1]], 'currants' => 0], ['items' => [['c' => 'emotional_bear', 'n' => 1]], 'currants' => 0]], $h(25)))['status'];
    $copyB = $entries(['apple' => 1, 'cherry' => 1, 'emotional_bear' => 1], ['t-g1320-old', 't-g1320-bear']);
    $out['writeB'] = $run(fn () => $ledger->write(ME, $copyB, $h(25)))['clamped'];
    $store(ME, $copyB, $h(25));
    $store(ME, $copyB, $h(1));
    $out['ledgerBefore'] = $ledgerItems(ME);

    // —— Now: copy A is kept over copy B (MultiplayerSave::write takeover) ——
    $storedAt = (string) $db->value("SELECT updated_at FROM {$saves} WHERE user_id = ?", [ME]);
    $takeover = static function (array $copy, int $since) use ($run, $ledger, $storedAt, $now): array {
        return $run(function () use ($ledger, $copy, $since, $storedAt, $now): array {
            $e = $ledger->reapply(ME, $copy, Ledger::takeoverSince($since, $storedAt), $now);
            $checked = $ledger->write(ME, $e, $now);
            return ['entries' => $checked['entries'], 'clamped' => $checked['clamped']];
        });
    };
    $kept = $takeover($copyA, $sinceA);
    $out['kept'] = [
        'pack' => $pack($kept['entries']),
        'applied' => LedgerMath::applied($kept['entries']),
        'clamped' => $kept['clamped'],
        'ledger' => $ledgerItems(ME),
    ];

    // —— The same copy, no time named: a day back, as before (the Bear's trade is older) ——
    $out['noSince'] = ['pack' => $pack($run(fn () => $ledger->reapply(ME, $copyA, Ledger::takeoverSince(0, null), $now)))];
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
