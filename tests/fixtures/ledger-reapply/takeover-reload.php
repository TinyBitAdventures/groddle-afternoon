<?php
/**
 * G1329 (report #670): "keep this window's game" (MultiplayerSave takeover) applies to the stored save
 * the settled trades the kept copy missed (Ledger::reapply), but the page went on holding its own copy
 * without them, so its next ordinary write stored that copy and the Still a site tool had put back on
 * the owner's floor (HouseFloors::returnKept) was gone again, silently. This drives the routes
 * (MultiplayerSave read and write, as the game page calls them) against a throwaway MariaDB database
 * and prints what happened as JSON (tests/save-takeover-reload-g1329.test.js):
 *
 *   - 700: a Still in the back yard moved to the shared floor as v0.63.0 moved it; a page loads the
 *     moved copy and saves; the return puts the Still back (writer ''); the page's next write is
 *     refused (conflict); the player keeps this window's game (takeover); then the page's next
 *     ordinary write of its own copy, and a page that reloads as the answer asks.
 *   - 701: a takeover with nothing to apply: the answer asks no reload.
 *
 * The database is made here (test_groddle_keep_<hex>) and dropped at the end.
 *
 *   php tests/fixtures/ledger-reapply/takeover-reload.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-keep-none/');
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
use Groddle\Minn\HouseFloors;
use Groddle\Minn\Ledger;
use Groddle\Minn\LedgerDrop;
use Groddle\Minn\LedgerMath;
use Groddle\Minn\MultiplayerSave;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\RestError;

const PREFIX = 'wp_';

$name = 'test_groddle_keep_' . bin2hex(random_bytes(4));
$root = new mysqli($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = new mysqli($host, $user, $pass, $name);
    $conn->set_charset('utf8mb4');
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach (['groddle_ledger', 'groddle_ledger_items', 'groddle_trades', 'groddle_ledger_log', 'groddle_mp_saves', 'groddle_drops', 'groddle_ledger_credited', 'groddle_ledger_outcomes', 'groddle_house_floors', 'groddle_bans', 'groddle_character_logins'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $caps = Capabilities::fromDb($db);
    $economy = Economy::shared();
    $ledger = new Ledger($db, $economy, Ledger::RATE, Ledger::CAPACITY);
    $run = static fn (callable $fn) => Ledger::atomically($db, $fn);
    $now = time();
    $saves = $db->table(MultiplayerSave::TABLE);
    $saveJson = static fn (array $e): string => (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => $e]);
    $stored = static fn (int $u): array => json_decode((string) $db->value("SELECT data FROM {$saves} WHERE user_id = ?", [$u]), true)['entries'];
    $stills = static fn (array $e): int => count(array_filter(json_decode($e['droppedItems'], true)['streets']['RH_HOME_INT'] ?? [], static fn (array $r): bool => $r['classTsid'] === 'still'));
    $ledgerStill = static fn (int $u): int => (int) (((array) ($ledger->peek($u)['items'] ?? []))['still'] ?? 0);

    // —— The routes, as the game page calls them ——
    $seams = static fn (int $as, Request $r): Seams => new Seams($db, $site, $r, Reader::forUser($as, $caps, '', 'token-' . $as));
    $call = static function (int $as, Method $method, array $query = [], ?array $body = null) use ($seams): array {
        $r = new Request($method, '/groddle/v1/save', $query, [], [], $body === null ? '' : (string) json_encode($body), true, 'groddle.test');
        $route = new MultiplayerSave($seams($as, $r));
        try {
            $res = $method === Method::Get ? $route->read($r) : $route->write($r);
            return ['status' => $res->status, 'body' => json_decode($res->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };
    /** A game page: boots (claims the save), then writes its own copy back, as js/save-store.js does. */
    $page = static function (int $u, string $writer) use ($call): object {
        $boot = $call($u, Method::Get, ['writer' => $writer]);
        return (object) ['u' => $u, 'writer' => $writer, 'seq' => 0, 'version' => $boot['body']['version'], 'confirmedAt' => $boot['body']['updatedAt'], 'entries' => (array) $boot['body']['data']['entries']];
    };
    $write = static function (object $p, array $extra = []) use ($call): array {
        $p->seq += 1;
        $a = $call($p->u, Method::Put, [], ['version' => $p->version, 'writer' => $p->writer, 'seq' => $p->seq] + $extra + ['data' => ['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => $p->entries]]);
        if ($a['status'] === 200) {
            $p->version = $a['body']['version'];
            $p->confirmedAt = $a['body']['updatedAt'];
        }
        return $a;
    };
    $moveOn = static function (object $p, int $x): void {
        $p->entries['location'] = (string) json_encode(['tsid' => 'LA5101HF7F429V', 'x' => $x, 'y' => -80]);
    };

    // —— 700 and 701: a house with a Still in the back yard and apples on the floor ——
    $hopper = ['hopper' => 13, 'hooch' => 39, 'workingSince' => 0, 'ready' => true];
    $then = ($now - 86400 * 9) * 1000;
    $origin = [];
    foreach ([700, 701] as $u) {
        $rows = [
            ['id' => 'world-item-45', 'streetTsid' => 'RH_HOME_INT', 'classTsid' => 'still', 'count' => 1, 'x' => 418, 'y' => 680, 'droppedAt' => $then, 'points' => [0], 'tags' => [$hopper]],
            ['id' => 'world-item-46', 'streetTsid' => 'RH_HOME_INT', 'classTsid' => 'apple', 'count' => 3, 'x' => 1800, 'y' => 620, 'droppedAt' => $then],
        ];
        $state = ['inventory' => ['apple' => 2], 'player' => ['currants' => 0], 'systems' => ['home' => ['owned' => true], 'features' => ['homes' => ['houseX' => 1650]]]];
        $origin[$u] = ['playerState' => (string) json_encode($state), 'droppedItems' => (string) json_encode(['version' => 1, 'nextId' => 47, 'streets' => ['RH_HOME_INT' => $rows]])];
        $db->execute("INSERT INTO {$saves} (user_id, data, version, updated_at, writer, seq) VALUES (?, ?, 1, ?, '', 0)", [$u, $saveJson($origin[$u]), gmdate('Y-m-d H:i:s', $now - 86400 * 2)]);
        $run(fn () => $ledger->lock($u, $now - 86400 * 2));
        $run(fn () => $ledger->write($u, $origin[$u], $now - 86400 * 2));
    }

    // —— The move as v0.63.0 made it, a day ago: the Still went to the shared floor too ——
    $table = json_decode((string) file_get_contents($extension . '/data/economy.json'), true);
    foreach ($table['items'] as $c => $row) {
        unset($table['items'][$c]['own']);
    }
    $old = new Economy($table);
    foreach ([700, 701] as $u) {
        $run(function () use ($db, $ledger, $u, $origin, $old, $now, $saves, $saveJson): void {
            $plan = HouseFloors::plan($origin[$u], $u, $old);
            $moved = [];
            foreach ($plan['moves'] as $m) {
                if (LedgerDrop::fromFloor($db, $ledger, $m, $u, $now - 86400)) {
                    $moved[] = $m;
                }
            }
            $db->execute('INSERT INTO ' . $db->table(HouseFloors::TABLE) . ' (user_id, moved_at, backup, moved, reverted_at) VALUES (?, ?, ?, ?, NULL)', [
                $u, gmdate('Y-m-d H:i:s', $now - 86400), $origin[$u]['droppedItems'], (string) json_encode(['moves' => $moved, 'kept' => $plan['kept'], 'short' => 0], JSON_UNESCAPED_SLASHES),
            ]);
            $e = $origin[$u];
            $e['droppedItems'] = HouseFloors::without($e['droppedItems'], array_map(static fn (array $m): array => [$m['place'], $m['row']], $moved));
            $db->execute("UPDATE {$saves} SET data = ?, version = 2, updated_at = ?, writer = '' WHERE user_id = ?", [$saveJson($e), gmdate('Y-m-d H:i:s', $now - 86400), $u]);
        });
    }

    // —— 700: a window loads the moved copy and plays; then the return puts the Still back ——
    $p = $page(700, 'pageAAAA1111');
    $moveOn($p, 100);
    $out['firstWrite'] = $write($p)['status'];
    $out['loaded'] = ['stills' => $stills($p->entries), 'ledger' => $ledgerStill(700)];
    $out['returned'] = HouseFloors::returnKept($db, $ledger, 700, time(), true)['back'];
    $out['stored'] = ['stills' => $stills($stored(700)), 'ledger' => $ledgerStill(700), 'writer' => (string) $db->value("SELECT writer FROM {$saves} WHERE user_id = 700")];

    // The window's next write: refused, the player is asked; they keep this window's game.
    $moveOn($p, 120);
    $out['conflict'] = $write($p)['code'] ?? 'written';
    $took = $write($p, ['takeover' => true, 'since' => $p->confirmedAt]);
    $out['takeover'] = ['status' => $took['status'], 'answer' => array_keys($took['body'] ?? []), 'took' => $took['body']['took'] ?? null, 'reload' => $took['body']['reload'] ?? null];
    $out['afterTakeover'] = ['stills' => $stills($stored(700)), 'ledger' => $ledgerStill(700), 'page' => $stills($p->entries)];

    // What the page's own copy does to the stored save when it writes again (main: it always did).
    $stale = clone $p;
    $snapshot = [(string) $db->value("SELECT data FROM {$saves} WHERE user_id = 700"), (int) $db->value("SELECT version FROM {$saves} WHERE user_id = 700")];
    $ledgerRows = $db->rows('SELECT * FROM ' . $db->table('groddle_ledger_items') . ' WHERE user_id = 700');
    $moveOn($stale, 140);
    $w = $write($stale);
    $out['staleWrite'] = ['status' => $w['status'], 'corrected' => $w['body']['ledger'] ?? null, 'stills' => $stills($stored(700)), 'ledger' => $ledgerStill(700)];
    // Put the stored save and the ledger back as the takeover left them, then follow the answer as the game does.
    $db->execute("UPDATE {$saves} SET data = ?, version = ?, writer = ?, seq = ? WHERE user_id = 700", [$snapshot[0], $snapshot[1], $p->writer, $p->seq]);
    $db->execute('DELETE FROM ' . $db->table('groddle_ledger_items') . ' WHERE user_id = 700');
    foreach ($ledgerRows as $r) {
        $db->execute('INSERT INTO ' . $db->table('groddle_ledger_items') . ' (' . implode(', ', array_keys($r)) . ') VALUES (' . implode(', ', array_fill(0, count($r), '?')) . ')', array_values($r));
    }
    $out['restored'] = ['stills' => $stills($stored(700)), 'ledger' => $ledgerStill(700)];

    // —— The page follows the answer: a reload when the site says so, else it writes its own copy on ——
    $next = ($took['body']['reload'] ?? false) === true ? $page(700, 'pageBBBB2222') : $p;
    $moveOn($next, 160);
    $w = $write($next);
    $moveOn($next, 180);
    $w2 = $write($next);
    $out['followed'] = ['reloaded' => $next !== $p, 'status' => [$w['status'], $w2['status']], 'page' => $stills($next->entries), 'stills' => $stills($stored(700)), 'ledger' => $ledgerStill(700)];

    // —— 701: a conflict with nothing missed (an administrator's teleport): the takeover asks no reload ——
    $q = $page(701, 'pageCCCC3333');
    $moveOn($q, 100);
    $write($q);
    $db->execute("UPDATE {$saves} SET version = version + 1, writer = '', seq = 0 WHERE user_id = 701");
    $moveOn($q, 120);
    $c = $write($q)['code'] ?? 'written';
    $t = $write($q, ['takeover' => true, 'since' => $q->confirmedAt]);
    $out['plain'] = ['conflict' => $c, 'status' => $t['status'], 'took' => $t['body']['took'] ?? null, 'reload' => $t['body']['reload'] ?? null];
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
