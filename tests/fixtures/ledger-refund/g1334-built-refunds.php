<?php
/**
 * G1334: what comes back from something the player built or set down stands in the ledger, as
 * much as they spent on it and never more (Austin 2026-11-27: "refund only what the player spent").
 *
 * Each scenario is one character and a few save writes through Ledger::write on a throwaway
 * MariaDB database (test_groddle_1334_<hex>, dropped at the end). For each write it records what
 * was clamped, the budget after and the ledger's items. Prints JSON.
 *
 *   php g1334-built-refunds.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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
use Groddle\Minn\MultiplayerSave;
use Minn\Content\Site;
use Minn\Db;

const PREFIX = 'wp_';

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

/**
 * A save: $inv the pack; $o the rest: walls (the house's wall segments, every floor), upper (floors
 * above the ground), gnomes / icons / poles (how many set down), work (supply's machine work).
 */
function state(array $inv, array $o = []): array
{
    $walls = $o['walls'] ?? 7;
    $floor = static fn (): array => ['wallSegments' => $walls, 'placed' => [], 'storage' => (object) []];
    $features = ['homes' => [
        'decor' => $floor(),
        'floors' => ['upper' => array_map(static fn () => $floor(), range(1, $o['upper'] ?? 0) ?: []), 'links' => []],
    ]];
    if (($o['upper'] ?? 0) === 0) {
        $features['homes']['floors']['upper'] = [];
    }
    if (!empty($o['gnomes'])) {
        $features['garden-gnome'] = ['placed' => array_map(static fn ($i) => ['id' => 'g' . $i, 'x' => 100 * $i, 'phrases' => []], range(1, $o['gnomes']))];
    }
    if (!empty($o['icons'])) {
        $features['giant-icons'] = ['placed' => ['RH_HOME_EXT' => array_map(static fn ($i) => ['id' => 'icon' . $i, 'giant' => 'alph', 'x' => 100 * $i], range(1, $o['icons']))]];
    }
    if (!empty($o['poles'])) {
        $note = !empty($o['note']) ? ['title' => 'Hi', 'body' => 'Hello', 'by' => ['id' => 0, 'name' => ''], 'at' => 1] : null;
        $features['home-street-mp'] = ['poles' => array_map(static fn ($i) => ['id' => 'p' . $i, 'x' => 100 * $i, 'note' => $note], range(1, $o['poles']))];
    }
    if (!empty($o['work'])) {
        $features['supply'] = ['version' => 2, 'still' => (object) [], 'work' => $o['work']];
    }
    return [
        'version' => 7, 'inventory' => (object) $inv, 'player' => ['currants' => 0, 'xp' => 5000, 'level' => 5],
        'systems' => ['quests' => ['completed' => []], 'achievements' => ['unlocked' => []], 'features' => $features],
    ];
}

function saveOf(array $s): string
{
    return (string) json_encode(['kind' => 'groddle-multiplayer', 'format' => 1, 'entries' => ['playerState' => json_encode($s)]]);
}

$name = 'test_groddle_1334_' . bin2hex(random_bytes(4));
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
    (new Site($db))->setOption('home', 'https://groddle.test');
    $now = intdiv(time(), 86400) * 86400 + 15 * 3600;
    $stamp = gmdate('Y-m-d H:i:s', $now);
    $ledger = new Ledger($db, Economy::shared(), Ledger::RATE, Ledger::CAPACITY);
    $budget = static fn (int $u): float => round((float) $db->value('SELECT budget FROM ' . $db->table(Ledger::TABLE) . ' WHERE user_id = ?', [$u]), 1);

    $ws = 'wall_segment';
    $urth = 'grade_aa_earth_block';
    $parts = ['machine_stand' => 1, 'fuelmaker_case' => 1, 'fuelmaker_core' => 1, 'blockmaker_engine' => 1];
    $fuel = ['condition' => ['fuelmaker' => [['remaining' => 50]]]];
    $glitch = ['wood_post' => 2, 'board' => 6, 'barnacle_talc' => 8, 'beam' => 1, 'girder' => 1];
    // name => [stored save before the ledger (null: a new character), online seconds first, writes].
    $scenarios = [
        // A new character expands a two-floor house (2 Wall Segments and an Urth Block) and un-expands it.
        'house' => [null, 0, [
            state([$ws => 2, $urth => 1], ['walls' => 7, 'upper' => 1]),
            state([], ['walls' => 8, 'upper' => 1]),
            state([$ws => 2, $urth => 1], ['walls' => 7, 'upper' => 1]),
        ]],
        // A long-time player's house, expanded once before this (8 segments, one floor), un-expands.
        'legacy' => [state([], ['walls' => 8]), 0, [
            state([], ['walls' => 8]),
            state([$ws => 1], ['walls' => 7]),
        ]],
        // A house never expanded (7) un-expanded to 6, the save showing a Wall Segment back anyway.
        'never' => [null, 0, [
            state([], ['walls' => 7]),
            state([$ws => 1], ['walls' => 6]),
        ]],
        // Expand / un-expand three times with one Wall Segment, then the old game's Glitch refund.
        'loop' => [null, 0, [
            state([$ws => 1], ['walls' => 7]),
            state([], ['walls' => 8]), state([$ws => 1], ['walls' => 7]),
            state([], ['walls' => 8]), state([$ws => 1], ['walls' => 7]),
            state([], ['walls' => 8]), state([$ws => 1], ['walls' => 7]),
            state([], ['walls' => 8]), state($glitch, ['walls' => 7]),
        ]],
        // Assemble a Fuelmaker (the parts go in one write, the machine comes in the next) and take it apart.
        'machine' => [null, 6000, [
            state($parts),
            state([], ['work' => ['kind' => 'assemble', 'machine' => 'fuelmaker', 'ms' => 6000, 'readyAt' => 1]]),
            state(['fuelmaker' => 1]) + ['tools' => $fuel],
            state([], ['work' => ['kind' => 'disassemble', 'machine' => 'fuelmaker', 'ms' => 6000, 'readyAt' => 1]]),
            state($parts),
        ]],
        // A Fuelmaker the save names with no parts spent for it, taken apart.
        'forged' => [null, 0, [
            state(['fuelmaker' => 1]),
            state($parts),
        ]],
        // A Garden Gnome, an Icon and a Note Pole set down and picked up again.
        'gnome' => [null, 0, [
            state(['npc_garden_gnome' => 1]),
            state([], ['gnomes' => 1]),
            state(['npc_garden_gnome' => 1]),
        ]],
        'icon' => [null, 0, [
            state(['icon_alph' => 1]),
            state([], ['icons' => 1]),
            state(['icon_alph' => 1]),
        ]],
        'pole' => [null, 0, [
            state(['note_pole' => 1]),
            state([], ['poles' => 1]),
            state(['note_pole' => 1]),
        ]],
        // A note posted on the pole comes back with it.
        'poleNote' => [null, 0, [
            state(['note_pole' => 1, 'note' => 1]),
            state([], ['poles' => 1, 'note' => true]),
            state(['note_pole' => 1, 'note' => 1]),
        ]],
    ];
    $id = 100;
    foreach ($scenarios as $key => [$stored, $online, $writes]) {
        $u = ++$id;
        $db->execute('INSERT INTO ' . $db->table('users') . " (ID, user_login, user_registered, display_name) VALUES (?, ?, '2026-01-01 00:00:00', ?)", [$u, $key, $key]);
        if ($stored !== null) {
            $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . ' (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)', [$u, saveOf($stored), $stamp]);
        }
        $rows = [];
        foreach ($writes as $i => $s) {
            if ($i === 0 && $online > 0) {
                Ledger::atomically($db, fn () => $ledger->lock($u, $now));
                Ledger::atomically($db, fn () => $ledger->addOnline($u, $online, $now));
            }
            $w = Ledger::atomically($db, fn () => $ledger->write($u, ['playerState' => (string) json_encode($s)], $now + $i));
            $rows[] = ['clamped' => $w['clamped'], 'text' => $w['text'], 'budget' => $budget($u), 'items' => (object) $ledger->peek($u)['items']];
        }
        $out[$key] = ['seeded' => (string) $db->value('SELECT seeded FROM ' . $db->table(Ledger::TABLE) . ' WHERE user_id = ?', [$u]), 'writes' => $rows];
    }
    // The site's copy of the game's wallExpandItems, for every floor count and width.
    if (method_exists(\Groddle\Minn\LedgerMath::class, 'wallCost')) {
        foreach ([1, 2, 3] as $f) {
            foreach (range(4, 18) as $inner) {
                $out['wallCost']["{$f}:{$inner}"] = \Groddle\Minn\LedgerMath::wallCost($f, $inner);
            }
        }
    }
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = $root->query("SHOW DATABASES LIKE '{$name}'")->num_rows === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
