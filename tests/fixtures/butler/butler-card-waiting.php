<?php
/**
 * Report #754: a visitor buys 5 Get Out of Hell Free Cards today. The ledger
 * credits 3 (LedgerMath CARD_DAILY) and lets 2 wait in the pack outside it (WAIT_DAY). Leaving all
 * 5 with a friend's Butler goes through ButlerParcels::take, which checks the ledger only and
 * answered "short" ("You don't have that any more."), where every other act (drop, gift, trade,
 * mail, auction, ButlerGifts, machines, spends) asks Ledger::waitingFor first (#691); now it asks too.
 * Throwaway MariaDB database test_groddle_754_<hex>, dropped at the end. Prints JSON.
 *
 *   php tests/fixtures/butler/butler-card-waiting.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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

use Groddle\Minn\ButlerParcels;
use Groddle\Minn\Economy;
use Groddle\Minn\Ledger;
use Groddle\Minn\MultiplayerSave;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;

const PREFIX = 'wp_';
const VISITOR = 7;
const OWNER = 9;
const CARD = 'upgrade_card_instant_resurrection';
const KEEP = 'keepable_instant_resurrection';

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_754_' . bin2hex(random_bytes(4));
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
    // 15:00 UTC, mid-day.
    $now = intdiv(time(), 86400) * 86400 + 15 * 3600;
    $stamp = gmdate('Y-m-d H:i:s', $now);
    foreach ([VISITOR => 'Visitor', OWNER => 'Owner'] as $id => $who) {
        $db->execute('INSERT INTO ' . $db->table('users') . " (ID, user_login, user_registered, display_name) VALUES (?, ?, '2026-01-01 00:00:00', ?)", [$id, strtolower($who), $who]);
    }
    $state = static fn (array $inv, array $features): array => [
        'version' => 7, 'inventory' => (object) $inv, 'player' => ['currants' => 0, 'xp' => 5000, 'level' => 5],
        'systems' => ['quests' => ['completed' => []], 'achievements' => ['unlocked' => []], 'features' => (object) $features],
    ];
    $saveOf = static fn (array $s): string => (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($s)]]);
    // Stored saves: the visitor with no cards yet; the owner with an unboxed, empty Butler.
    $saves = [VISITOR => $state(['meat' => 5], []), OWNER => $state([], ['butler' => ['owned' => true, 'packages' => [], 'messages' => []]])];
    foreach ($saves as $id => $s) {
        $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$id, $saveOf($s), $stamp]);
    }
    $ledger = new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    foreach ([['base', 'base', 1], ['base905', 'base905', 1], ['level', 'level', 5], ['mark', 'base', 1], ['mark', 'base905', 1]] as [$kind, $ref, $n]) {
        $db->execute('INSERT INTO ' . $db->table(Ledger::CREDITED) . ' (user_id, kind, ref, n, at) VALUES (?, ?, ?, ?, ?)', [VISITOR, $kind, $ref, $n, $stamp]);
    }
    $run(function () use ($ledger, $now): void {
        $ledger->lock(VISITOR, $now);
        $ledger->lock(OWNER, $now);
    });

    // Five card purchases today (js/imagination.js grantUpgrade counts them; the pack holds 5).
    $bought = $state(['meat' => 5, CARD => 5], ['imagination' => ['counts' => [KEEP => 5]]]);
    $bought['player']['imaginationUpgrades'] = [KEEP];
    $write = $run(fn () => $ledger->write(VISITOR, ['playerState' => (string) json_encode($bought)], $now));
    $out['clamped'] = $write['clamped'] ?? null;
    $out['ledgerCards'] = (int) (((array) ($ledger->peek(VISITOR)['items'] ?? []))[CARD] ?? 0);
    $out['waitday'] = (int) ($db->value('SELECT n FROM ' . $db->table(Ledger::CREDITED) . ' WHERE user_id = ? AND kind = ? AND ref = ?', [VISITOR, 'waitday', gmdate('Y-m-d', $now) . ':' . CARD]) ?? 0);

    // The Butler: ButlerParcels::take (what POST groddle/v1/ledger/butler runs after the signature check).
    $caps = Capabilities::fromDb($db);
    $r = new Request(Method::Post, ButlerParcels::ROUTE, [], [], [], '', true, 'groddle.test');
    $parcels = new ButlerParcels(new Seams($db, $site, $r, Reader::forUser(0, $caps, '', '')));
    $take = new ReflectionMethod(ButlerParcels::class, 'take');
    $leave = static fn (int $n) => $run(fn () => $take->invoke($parcels, 'butler-' . bin2hex(random_bytes(8)), VISITOR, OWNER, ['items' => [CARD => $n], 'currants' => 0], '', $now));
    // The check the other acts ask first (#691).
    $out['waitingFor5'] = $run(fn () => $ledger->waitingFor(VISITOR, ['items' => [CARD => 5], 'currants' => 0], 'give', $now));
    $out['leave5'] = $leave(5);
    $out['leave4'] = $leave(4);
    $out['leave1'] = $leave(1);
    $out['ledgerCardsAfter'] = (int) (((array) ($ledger->peek(VISITOR)['items'] ?? []))[CARD] ?? 0);
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
