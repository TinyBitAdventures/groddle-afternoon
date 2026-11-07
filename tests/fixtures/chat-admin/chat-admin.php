<?php
/**
 * Runs the site repo's chat moderation rules (groddle-afternoon-site src/ChatHistory.php
 * clearDeletedText and clearWhenDue, register G568; src/Player.php isAdmin and the routes' policies,
 * register G567) against a throwaway MariaDB database with a fake clock, and prints what happened as
 * JSON (tests/chat-admin.test.js). The database is made here (test_groddle_chat_<hex>, the chat tables
 * from the site's minn.json, plus options and usermeta) and dropped at the end; nothing else is touched.
 *
 *   php tests/fixtures/chat-admin/chat-admin.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
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

use Groddle\Minn\AdminConsole;
use Groddle\Minn\ChatHistory;
use Groddle\Minn\Player;
use Minn\Auth\Capabilities;
use Minn\Content\Site;
use Minn\Db;
use Minn\Http\Access;
use Minn\Http\Route;

const PREFIX = 'wp_';
const DAY = 86_400_000;
const ADMIN = 7;
const PLAYER = 9;
const WRITER = 11;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_chat_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach (['groddle_chat_lines', 'groddle_admin_actions'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $out['deletedKey'] = in_array('KEY deleted_ms (deleted_ms)', $manifest['tables']['groddle_chat_lines'], true);
    $db = new Db($conn, PREFIX);
    $site = new Site($db);

    // —— Who is an administrator (G567): an administrator, a subscriber, nobody ——
    foreach ([ADMIN => 'administrator', PLAYER => 'subscriber'] as $id => $role) {
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
    }
    $out['isAdmin'] = [ADMIN => Player::isAdmin($db, ADMIN), PLAYER => Player::isAdmin($db, PLAYER), 0 => Player::isAdmin($db, 0)];

    // The routes' own policies, read from their attributes, judged as the engine's gate judges them
    // (Engine::frontGate: every capability the policy names, through the same Capabilities).
    $policyOf = static function (string $class, string $method): array {
        $route = (new ReflectionMethod($class, $method))->getAttributes(Route::class)[0]->newInstance();
        return ['method' => $route->method->name, 'pattern' => $route->pattern, 'access' => $route->policy?->access->name, 'caps' => $route->policy?->capabilities() ?? [], 'public' => $route->policy?->isPublic() ?? true, 'refuse' => $route->policy?->refuse];
    };
    $caps = Capabilities::fromDb($db);
    $gate = static function (array $policy, int $id) use ($caps): string {
        if ($policy['public']) {
            return 'open';
        }
        if ($id === 0) {
            return 'signed out (401)';
        }
        foreach ($policy['caps'] as $cap) {
            if (!$caps->can($id, $cap)) {
                return "{$policy['refuse']} (403)";
            }
        }
        return 'allowed';
    };
    $del = $policyOf(ChatHistory::class, 'deleteLine');
    $out['deletePolicy'] = $del;
    $out['deleteGate'] = [ADMIN => $gate($del, ADMIN), PLAYER => $gate($del, PLAYER), 0 => $gate($del, 0)];
    $out['mePolicy'] = $policyOf(Player::class, 'me');

    // —— The 30-day clearing (G568), on a fake clock ——
    $now = 1_794_096_000_000; // 2026-11-07 00:00 UTC, in ms
    $t = $db->table(ChatHistory::LINES);
    $line = static function (int $lid, string $room, string $text, int $parent = 0, int $deletedMs = 0, int $by = 0) use ($db, $t, $now): void {
        $db->execute("INSERT INTO {$t} (lid, room, author_id, name, text, at_ms, parent_lid, deleted_ms, deleted_by, reactions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [$lid, $room, WRITER, 'Zz Writer', $text, $now - 45 * DAY + $lid, $parent, $deletedMs, $by, '[{"e":"like","by":[9]}]']);
    };
    $line(101, 'global', 'a stray line', 0, $now - 31 * DAY, ADMIN);   // deleted 31 days ago
    $line(102, 'global', 'a reply under it', 101);                      // hidden with it
    $line(103, 'global', 'another reply', 101);
    $line(201, 'newbie', 'a newer stray line', 0, $now - 29 * DAY, ADMIN); // deleted 29 days ago (Live Help's newbie room)
    $line(202, 'newbie', 'its reply', 201);
    $line(301, 'trade', 'a line nobody deleted');
    $line(302, 'trade', 'a reply deleted on its own', 301, $now - 40 * DAY, ADMIN);
    $line(303, 'trade', 'a reply nobody deleted', 301);
    $line(401, 'global', 'an ordinary line');
    $line(501, 'group:12', 'a group line');
    $line(502, 'group:12', 'a reply in a group', 501);
    $a = $db->table(AdminConsole::ACTIONS);
    AdminConsole::recordAction($db, ADMIN, WRITER, 'chat_delete', ['where' => 'Global Chat', 'lid' => 101, 'reply' => false, 'text' => 'a stray line'], 'live', intdiv($now - 31 * DAY, 1000));
    AdminConsole::recordAction($db, ADMIN, WRITER, 'chat_delete', ['where' => 'Live Help', 'lid' => 201, 'reply' => false, 'text' => 'a newer stray line'], 'live', intdiv($now - 29 * DAY, 1000));
    AdminConsole::recordAction($db, ADMIN, WRITER, 'message', ['text' => 'an administrator\'s message stays'], 'live', intdiv($now - 60 * DAY, 1000));

    $rows = static fn (): array => array_map(static fn (array $r): array => [
        'lid' => (int) $r['lid'], 'room' => (string) $r['room'], 'author' => (int) $r['author_id'], 'name' => (string) $r['name'], 'text' => (string) $r['text'], 'at' => (int) $r['at_ms'],
        'parent' => (int) $r['parent_lid'], 'deleted' => (int) $r['deleted_ms'], 'by' => (int) $r['deleted_by'], 'reactions' => (string) $r['reactions'],
    ], $db->rows("SELECT * FROM {$t} ORDER BY lid"));
    $actions = static fn (): array => array_map(static fn (array $r): array => ['kind' => (string) $r['kind'], 'admin' => (int) $r['admin_user_id'], 'player' => (int) $r['player_user_id'], 'at' => (string) $r['at'], 'detail' => json_decode((string) $r['detail'], true)], $db->rows("SELECT * FROM {$a} ORDER BY id"));

    $out['before'] = $rows();
    $out['first'] = ChatHistory::clearDeletedText($db, $now);
    $out['afterFirst'] = $rows();
    $out['actionsFirst'] = $actions();
    $out['again'] = ChatHistory::clearDeletedText($db, $now);
    $out['twoDaysLater'] = ChatHistory::clearDeletedText($db, $now + 2 * DAY);
    $out['afterTwoDays'] = $rows();
    $out['actionsTwoDays'] = $actions();
    $out['early'] = ChatHistory::clearDeletedText($db, 5 * DAY);

    // —— At most once an hour (the option), from the routes that call it ——
    $line(601, 'help', 'deleted for the hourly check', 0, $now - 40 * DAY, ADMIN);
    $out['due'] = [
        'first' => ChatHistory::clearWhenDue($site, $db, $now),
        'next' => (int) ($db->storedOption(ChatHistory::CLEAR_OPTION) ?? 0),
    ];
    $line(602, 'help', 'deleted while it was not due', 0, $now - 40 * DAY, ADMIN);
    $out['due']['tenMinutes'] = ChatHistory::clearWhenDue($site, $db, $now + 600_000);
    $out['due']['text602Waiting'] = (string) $db->value("SELECT text FROM {$t} WHERE lid = 602");
    $out['due']['anHourLater'] = ChatHistory::clearWhenDue($site, $db, $now + 3_601_000);
    $out['due']['text602'] = (string) $db->value("SELECT text FROM {$t} WHERE lid = 602");
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
