<?php
/**
 * Runs reactions on report messages (Austin 2026-11-18; groddle-afternoon-site src/TicketReactions.php,
 * Tickets.php, AdminTickets.php) against a throwaway MariaDB database and prints what happened as
 * JSON (tests/ticket-reactions.test.js). The database (test_groddle_reactions_<hex>: users, usermeta,
 * options and every table of the site's minn.json) is made here and dropped at the end; nothing
 * else is touched.
 *
 *   php tests/fixtures/ticket-reactions/ticket-reactions.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-reactions-none/');
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
use Groddle\Minn\AdminTickets;
use Groddle\Minn\Characters;
use Groddle\Minn\CommunityText;
use Groddle\Minn\MailLimits;
use Groddle\Minn\TicketReactions;
use Groddle\Minn\Tickets;
use Groddle\Minn\TicketStore;
use Minn\Auth\Capabilities;
use Minn\Content\Reader;
use Minn\Content\Site;
use Minn\Db;
use Minn\Extension\Seams;
use Minn\Http\Method;
use Minn\Http\Request;
use Minn\Http\Response;
use Minn\RestError;

const PREFIX = 'wp_';

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_reactions_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $conn->query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    foreach ($manifest['tables'] as $t => $cols) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $cols) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "users (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_login varchar(60) NOT NULL DEFAULT '', user_pass varchar(255) NOT NULL DEFAULT '', user_nicename varchar(50) NOT NULL DEFAULT '', user_email varchar(100) NOT NULL DEFAULT '', user_url varchar(100) NOT NULL DEFAULT '', user_registered datetime NOT NULL, user_activation_key varchar(255) NOT NULL DEFAULT '', user_status int(11) NOT NULL DEFAULT 0, display_name varchar(250) NOT NULL DEFAULT '', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    // == The people: two of the team (one with a display name of their own, one whose is their username), two players ==
    $person = static function (int $id, string $login, string $display, string $character, string $role) use ($db, $at, $now): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, $login, '$P$none', "p{$id}@groddle.test", $at($now - 86400), $display]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
        if ($character !== '') {
            $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $character, strtolower($character), $at($now - 86400)]);
        }
    };
    $person(900, 'staff-login', 'Zz Staffer', 'Zz Staff Character', 'administrator');
    $person(901, 'helper', 'helper', '', 'administrator');
    $person(910, 'player-910', 'player-910', 'Ada', 'subscriber');
    $person(911, 'player-911', 'player-911', 'Bea', 'subscriber');

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $body = []): Request => new Request($method, $path, [], [], [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', $as > 0 ? 'token-' . $as : ''));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };
    $store = new TicketStore($db);
    // Ada's report, an administrator's answer, Ada's reply; Bea's own report.
    $ada = $store->open(910, 'The pig floats over the fence.', [], $now - 3600);
    $store->add($ada, 900, TicketStore::ADMIN, 'Thanks, looking at it.', $now - 1800);
    $store->add($ada, 910, TicketStore::PLAYER, 'It happens on Hechey Track too.', $now - 900);
    $bea = $store->open(911, 'My hat is gone.', [], $now - 3000);
    $msgs = array_map(static fn (array $m): int => (int) $m['id'], $store->messages($ada));
    $beaMsg = (int) $store->messages($bea)[0]['id'];
    $store->markRead($ada, TicketStore::PLAYER, $now - 800);
    $store->markRead($ada, TicketStore::ADMIN, $now - 1800);

    $mine = static function (int $as, int $ticket, int $message, mixed $e, bool $on = true) use ($request, $seams, $answer): array {
        $r = $request(Method::Post, "/groddle/v1/tickets/{$ticket}/messages/{$message}/reactions", ['e' => $e, 'on' => $on]);
        return $answer(static fn (): Response => (new Tickets($seams($as, $r)))->react($r, (string) $ticket, (string) $message));
    };
    $admin = static function (int $as, int $ticket, int $message, mixed $e, bool $on = true) use ($request, $seams, $answer): array {
        $r = $request(Method::Post, "/groddle/v1/admin/tickets/{$ticket}/messages/{$message}/reactions", ['e' => $e, 'on' => $on]);
        return $answer(static fn (): Response => (new AdminTickets($seams($as, $r)))->react($r, (string) $ticket, (string) $message));
    };
    $ticketRow = static fn (int $id): array => $db->row('SELECT status, updated_at, last_message_at, last_author_role, player_read_at, admin_read_at, closed_by, closed_at FROM ' . $db->table(TicketStore::TABLE) . ' WHERE id = ?', [$id]);
    $counts = static fn (): array => [
        'messages' => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(TicketStore::MESSAGES)),
        'actions' => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(AdminConsole::ACTIONS)),
        'mailSends' => (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(MailLimits::TABLE)),
    ];
    $before = ['ada' => $ticketRow($ada), 'bea' => $ticketRow($bea), 'counts' => $counts(), 'adaUnread' => $store->unreadCount(910), 'listed' => TicketStore::summary((array) $store->find($ada), TicketStore::ADMIN)];

    // == The player: their own report only ==
    $out['player'] = [
        'like' => $mine(910, $ada, $msgs[1], 'like'),
        'again' => $mine(910, $ada, $msgs[1], 'like'),
        'hi' => $mine(910, $ada, $msgs[0], 'hi'),
        'otherReport' => $mine(910, $bea, $beaMsg, 'like'),
        'notTheirs' => $mine(911, $ada, $msgs[0], 'heart'),
        'messageOfAnother' => $mine(910, $ada, $beaMsg, 'like'),
        'badKey' => $mine(910, $ada, $msgs[0], 'thumbsup'),
        'notString' => $mine(910, $ada, $msgs[0], ['like']),
        'signedOut' => $mine(0, $ada, $msgs[0], 'like'),
    ];
    // == The administrators: any message ==
    $out['admin'] = [
        'heart' => $admin(900, $ada, $msgs[1], 'heart'),
        'likeToo' => $admin(900, $ada, $msgs[1], 'like'),
        'helper' => $admin(901, $ada, $msgs[1], 'like'),
        'beas' => $admin(900, $bea, $beaMsg, 'thanks'),
        'missingTicket' => $admin(900, 99999, $msgs[0], 'like'),
        'messageOfAnother' => $admin(900, $ada, $beaMsg, 'like'),
    ];
    $out['off'] = $mine(910, $ada, $msgs[0], 'hi', false);
    $out['offAgain'] = $mine(910, $ada, $msgs[0], 'hi', false);

    // Nothing else moved: no message, no activity line, no mail, the reports' rows as they were.
    $out['after'] = ['ada' => $ticketRow($ada), 'bea' => $ticketRow($bea), 'counts' => $counts(), 'adaUnread' => $store->unreadCount(910), 'listed' => TicketStore::summary((array) $store->find($ada), TicketStore::ADMIN)];
    $out['before'] = $before;
    $out['rows'] = $db->rows('SELECT message_id, ticket_id, user_id, role, reaction FROM ' . $db->table(TicketReactions::TABLE) . ' ORDER BY ticket_id, message_id, user_id, reaction');

    // == The threads carry them: the player's and the console's ==
    $out['playerThread'] = $answer(static fn (): Response => (new Tickets($seams(910)))->show($request(Method::Get, "/groddle/v1/tickets/{$ada}"), (string) $ada));
    $out['adminThread'] = $answer(static fn (): Response => (new AdminTickets($seams(900)))->show($request(Method::Get, "/groddle/v1/admin/tickets/{$ada}"), (string) $ada));
    $out['messageIds'] = $msgs;
    $out['adminName'] = [
        'own' => TicketReactions::adminName('Austin', 'anchorhost'),
        'login' => TicketReactions::adminName('anchorhost', 'anchorhost'),
        'loginCase' => TicketReactions::adminName('AnchorHost ', 'anchorhost'),
        'empty' => TicketReactions::adminName('  ', 'x'),
        'email' => TicketReactions::adminName('a@b.c', 'x'),
    ];
    $out['unknownKeyKeptOut'] = TicketReactions::out([['message_id' => 1, 'user_id' => 910, 'role' => 'player', 'reaction' => 'someday'], ['message_id' => 1, 'user_id' => 910, 'role' => 'player', 'reaction' => 'tada']], ['910:player' => 'Ada'], 910);

    // == Each of the chat's reactions on and off a message (sixteen since 2026-11-27): Bea on her own report ==
    $every = ['keys' => array_keys(CommunityText::reactions()), 'on' => [], 'off' => []];
    foreach ($every['keys'] as $k) {
        $every['on'][] = $mine(911, $bea, $beaMsg, $k);
    }
    $every['kept'] = array_map(static fn (array $r): string => (string) $r['reaction'], $db->rows('SELECT reaction FROM ' . $db->table(TicketReactions::TABLE) . ' WHERE message_id = ? AND user_id = 911 ORDER BY reaction', [$beaMsg]));
    foreach ($every['keys'] as $k) {
        $every['off'][] = $mine(911, $bea, $beaMsg, $k, false);
    }
    $out['everyReaction'] = $every;
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
