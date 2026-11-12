<?php
/**
 * Runs the site repo's alternate characters (groddle-afternoon-site src/Logins.php, CharacterRoutes.php,
 * and what reads them: AdminConsole bans and rename, Moderation, Characters, PlayerPages, Analytics,
 * ModReports, Community, MultiplayerSave) against a throwaway MariaDB database with a fixed clock, and
 * prints what happened as JSON (tests/alt-characters.test.js). The database is made here
 * (test_groddle_alts_<hex>: users, usermeta, options and the site's own tables from its minn.json) and
 * dropped at the end; nothing else is touched. The routes that sign someone in (play to a character of
 * the login, a new character) need the engine's whole runtime and are checked on a local site instead;
 * every refusal before that point runs here.
 *
 *   php tests/fixtures/alt-characters/alt-characters.php <engine public/minn> <groddle-afternoon-site> <host> <user> <pass>
 */

declare(strict_types=1);

[, $engine, $extension, $host, $user, $pass] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/groddle-alts-none/');
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
use Groddle\Minn\Analytics;
use Groddle\Minn\CharacterRoutes;
use Groddle\Minn\Characters;
use Groddle\Minn\Community;
use Groddle\Minn\Logins;
use Groddle\Minn\ModReports;
use Groddle\Minn\Moderation;
use Groddle\Minn\MultiplayerSave;
use Groddle\Minn\PlayerPages;
use Groddle\Minn\Profiles;
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
const DAY = 86400;

function connect(string $host, string $user, string $pass, ?string $db = null): mysqli
{
    $m = new mysqli($host, $user, $pass, $db ?? '');
    $m->set_charset('utf8mb4');
    return $m;
}

$name = 'test_groddle_alts_' . bin2hex(random_bytes(4));
$root = connect($host, $user, $pass);
$root->query("CREATE DATABASE `{$name}`");
$out = ['db' => $name];
try {
    $conn = connect($host, $user, $pass, $name);
    $manifest = json_decode((string) file_get_contents($extension . '/minn.json'), true);
    $out['tables'] = ['logins' => $manifest['tables'][Logins::TABLE] ?? null, 'renames' => $manifest['tables'][AdminConsole::RENAMES] ?? null];
    foreach ([Logins::TABLE, AdminConsole::RENAMES, 'groddle_players', 'groddle_bans', 'groddle_mp_saves', 'groddle_signups', 'groddle_mod_restrictions', 'groddle_mod_reports', 'groddle_community_bans', 'groddle_ignores', 'groddle_admin_actions'] as $t) {
        $conn->query('CREATE TABLE ' . PREFIX . $t . ' (' . implode(', ', $manifest['tables'][$t]) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    }
    $conn->query('CREATE TABLE ' . PREFIX . "users (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_login varchar(60) NOT NULL DEFAULT '', user_pass varchar(255) NOT NULL DEFAULT '', user_nicename varchar(50) NOT NULL DEFAULT '', user_email varchar(100) NOT NULL DEFAULT '', user_url varchar(100) NOT NULL DEFAULT '', user_registered datetime NOT NULL, user_activation_key varchar(255) NOT NULL DEFAULT '', user_status int(11) NOT NULL DEFAULT 0, display_name varchar(250) NOT NULL DEFAULT '', PRIMARY KEY (ID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . "options (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY (option_id), UNIQUE KEY option_name (option_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query('CREATE TABLE ' . PREFIX . 'usermeta (umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, user_id bigint(20) unsigned NOT NULL DEFAULT 0, meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (umeta_id), KEY user_id (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db = new Db($conn, PREFIX);
    $site = new Site($db);
    $now = time();
    $at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);

    // == The people: an administrator with an extra character, and three logins ==
    $person = static function (int $id, string $name, string $email, string $role, int $made) use ($db, $at): void {
        $db->execute('INSERT INTO ' . $db->table('users') . ' (ID, user_login, user_pass, user_email, user_registered, display_name) VALUES (?, ?, ?, ?, ?, ?)', [$id, "player-{$id}", '$P$none', $email, $at($made), $name]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . ' (user_id, meta_key, meta_value) VALUES (?, ?, ?)', [$id, PREFIX . 'capabilities', serialize([$role => true])]);
        $db->execute('INSERT INTO ' . $db->table('usermeta') . " (user_id, meta_key, meta_value) VALUES (?, 'nickname', ?)", [$id, $name]);
        if ($name !== '') {
            $db->execute('INSERT INTO ' . $db->table(Characters::TABLE) . ' (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)', [$id, $name, strtolower($name), $at($made)]);
        }
    };
    $logins = new Logins($db);
    $alt = static fn (int $id, int $login, int $made) => $logins->link($id, $login, $made);
    $person(1, 'Zz Admin', 'zz-admin@groddle.test', 'administrator', $now - 400 * DAY);
    $person(2, 'Zz Admin Alt', Logins::email(), 'subscriber', $now - 10 * DAY);
    $alt(2, 1, $now - 10 * DAY);
    $person(10, 'Ada', 'ada@example.com', 'subscriber', $now - 90 * DAY);
    $person(11, 'Bea', Logins::email(), 'subscriber', $now - 3 * DAY);
    $alt(11, 10, $now - 3 * DAY);
    $person(12, 'Cyd', Logins::email(), 'subscriber', $now - 60 * DAY);
    $alt(12, 10, $now - 60 * DAY);
    $logins->retire(12, $now - 31 * DAY);
    $person(20, 'Dot', 'dot@example.com', 'subscriber', $now - 20 * DAY);
    $person(21, 'Eve', Logins::email(), 'subscriber', $now - 3600);
    $alt(21, 20, $now - 3600);
    $person(30, 'Fay', 'zz-fay@groddle.test', 'subscriber', $now - 5 * DAY);
    $person(31, 'Gus', Logins::email(), 'subscriber', $now - 2 * DAY);
    $alt(31, 30, $now - 2 * DAY);
    $person(40, 'Hal', 'hal@example.com', 'subscriber', $now - 5 * DAY);
    $person(50, 'Ivy', 'ivy@example.com', 'subscriber', $now - 5 * DAY);
    $person(51, 'Jo', Logins::email(), 'subscriber', $now - 2 * DAY);
    $alt(51, 50, $now - 2 * DAY);

    $caps = Capabilities::fromDb($db);
    $request = static fn (Method $method, string $path, array $headers = [], array $body = []): Request => new Request($method, $path, [], $headers, [], $body === [] ? '' : json_encode($body), true, 'groddle.test');
    $seams = static fn (int $as, ?Request $r = null): Seams => new Seams($db, $site, $r ?? $request(Method::Get, '/'), Reader::forUser($as, $caps, '', 'token-' . $as));
    $answer = static function (Closure $call): array {
        try {
            $r = $call();
            return ['status' => $r->status, 'body' => json_decode($r->body, true)];
        } catch (RestError $e) {
            return ['status' => $e->status, 'code' => $e->errorCode];
        }
    };

    // == Who is whose ==
    $out['loginOf'] = [10 => $logins->loginOf(10), 11 => $logins->loginOf(11), 12 => $logins->loginOf(12), 21 => $logins->loginOf(21), 40 => $logins->loginOf(40)];
    $out['siblings'] = [10 => $logins->siblings(10), 11 => $logins->siblings(11), 21 => $logins->siblings(21), 40 => $logins->siblings(40)];
    $out['distinct'] = $logins->distinct([10, 11, 12, 20, 21]);

    // == Playing as another character: only a non-retired character of your own login ==
    $out['playRefusal'] = [
        'ownExtra' => $logins->playRefusal(10, 11),
        'backToFirst' => $logins->playRefusal(11, 10),
        'otherLogin' => $logins->playRefusal(10, 21),
        'otherLoginsFirst' => $logins->playRefusal(11, 20),
        'stranger' => $logins->playRefusal(10, 40),
        'nobody' => $logins->playRefusal(10, 999),
        'retired' => $logins->playRefusal(10, 12),
        'signedOut' => $logins->playRefusal(0, 10),
    ];
    $routes = static fn (int $as, ?Request $r = null): CharacterRoutes => new CharacterRoutes($seams($as, $r));
    $out['playRoute'] = [
        'otherLogin' => $answer(static fn (): Response => $routes(10)->play($request(Method::Post, '/'), '21')),
        'stranger' => $answer(static fn (): Response => $routes(10)->play($request(Method::Post, '/'), '40')),
        'retired' => $answer(static fn (): Response => $routes(10)->play($request(Method::Post, '/'), '12')),
    ];
    $out['list'] = $answer(static fn (): Response => $routes(11)->list($request(Method::Get, '/')));

    // == New characters: the limit and one a day ==
    $out['create'] = [
        'login10' => $logins->createRefusal(10, $now),
        'login20' => $logins->createRefusal(20, $now),
        'login20Tomorrow' => $logins->createRefusal(20, $now + DAY),
        'next20' => $logins->nextCreateAt(20, $now) === $now - 3600 + Logins::CREATE_GAP,
    ];
    $person(13, 'Kit', Logins::email(), 'subscriber', $now - 2 * DAY);
    $alt(13, 10, $now - 2 * DAY);
    $out['create']['login10Full'] = $logins->createRefusal(10, $now);
    $out['createRoute'] = [
        'full' => $answer(static fn (): Response => $routes(10)->create($request(Method::Post, '/', [], ['name' => 'Lou']))),
        'daily' => $answer(static fn (): Response => $routes(20)->create($request(Method::Post, '/', [], ['name' => 'Lou']))),
        'badName' => $answer(static fn (): Response => $routes(40)->create($request(Method::Post, '/', [], ['name' => 'x']))),
        'takenName' => $answer(static fn (): Response => $routes(40)->create($request(Method::Post, '/', [], ['name' => 'bea']))),
    ];
    // A retired character keeps its place until its name hold ends (Austin 2026-11-12).
    $logins->retire(13, $now);
    $out['create']['login10AfterRetire'] = $logins->createRefusal(10, $now);
    $out['counted'] = ['now' => $logins->counted(10, $now), 'afterHold' => $logins->counted(10, $now + Logins::NAME_HOLD)];
    $out['restoreWhileHeld'] = $answer(static fn (): Response => $routes(10)->restore($request(Method::Post, '/'), '12'));
    $out['retireRoute'] = [
        'first' => $answer(static fn (): Response => $routes(11)->retire($request(Method::Post, '/'), '10')),
        'current' => $answer(static fn (): Response => $routes(11)->retire($request(Method::Post, '/'), '11')),
        'otherLogin' => $answer(static fn (): Response => $routes(10)->retire($request(Method::Post, '/'), '21')),
    ];

    // == X-Groddle-Character ==
    $guard = static function (array $headers, int $userId) use ($request): string {
        try {
            Logins::guard($request(Method::Put, '/', $headers), $userId);
            return 'ok';
        } catch (RestError $e) {
            return "{$e->errorCode} {$e->status}";
        }
    };
    $out['guard'] = [
        'absent' => $guard([], 11),
        'same' => $guard(['x-groddle-character' => '11'], 11),
        'other' => $guard(['x-groddle-character' => '10'], 11),
        'blank' => $guard(['x-groddle-character' => ''], 11),
    ];
    $db->execute('INSERT INTO ' . $db->table(MultiplayerSave::TABLE) . " (user_id, data, version, updated_at, writer, seq) VALUES (11, '{}', 4, ?, '', 0)", [$at($now)]);
    $put = $request(Method::Put, '/', ['x-groddle-character' => '10'], ['version' => 4, 'data' => ['kind' => 'groddle-mp', 'format' => 1, 'entries' => []]]);
    $out['saveRoute'] = $answer(static fn (): Response => (new MultiplayerSave($seams(11, $put)))->write($put));
    $out['saveKept'] = (int) $db->value('SELECT version FROM ' . $db->table(MultiplayerSave::TABLE) . ' WHERE user_id = 11');

    // == Bans are the login's ==
    $console = static fn (Request $r): AdminConsole => new AdminConsole($seams(1, $r));
    $ban = $request(Method::Post, '/', [], ['player' => 21, 'reason' => 'spam']);
    $out['banAlt'] = $answer(static fn (): Response => $console($ban)->ban($ban));
    $out['banRows'] = array_map(static fn (array $r): int => (int) $r['user_id'], $db->rows('SELECT user_id FROM ' . $db->table(AdminConsole::BANS)));
    $out['banned'] = [20 => AdminConsole::banned($db, 20) !== null, 21 => AdminConsole::banned($db, 21) !== null, 10 => AdminConsole::banned($db, 10) !== null];
    $out['playBanned'] = $logins->playRefusal(20, 21);
    // A row from before, on an extra character, still covers the login; the server's list names the login.
    $db->execute('INSERT INTO ' . $db->table(AdminConsole::BANS) . " (user_id, reason, admin_user_id, created_at) VALUES (11, 'old', 1, ?)", [$at($now - DAY)]);
    $out['legacy'] = ['first' => AdminConsole::banned($db, 10) !== null, 'retired' => AdminConsole::banned($db, 12) !== null, 'list' => AdminConsole::bannedLogins($db)];
    $out['unbanLogin'] = AdminConsole::unbanLogin($db, 10);
    $out['afterUnban'] = AdminConsole::banned($db, 11) !== null;
    $unban = $request(Method::Post, '/', [], ['player' => 21]);
    $out['unbanAlt'] = $answer(static fn (): Response => $console($unban)->unban($unban));
    $out['bansLeft'] = (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(AdminConsole::BANS));
    $own = $request(Method::Post, '/', [], ['player' => 2, 'reason' => 'x']);
    $out['banOwnAlt'] = $answer(static fn (): Response => $console($own)->ban($own));
    $out['banLoginOfAlt'] = AdminConsole::banLogin($db, 51, 'test', 1);
    $out['banLoginRow'] = (int) $db->value('SELECT user_id FROM ' . $db->table(AdminConsole::BANS) . " WHERE reason = 'test'");
    AdminConsole::unbanLogin($db, 50);

    // == A silence on one character holds for the login; community stops too ==
    $db->execute('INSERT INTO ' . $db->table(Moderation::RESTRICTIONS) . " (user_id, kind, scope, reason, created_at, expires_at) VALUES (11, 'silence', 'chat', 'x', ?, ?)", [$at($now), $at($now + DAY)]);
    $out['silence'] = ['10' => Moderation::silenced($db, 10), '12' => Moderation::silenced($db, 12), '20' => Moderation::silenced($db, 20)];
    $out['claim10'] = Moderation::claim($db, 10) !== null;
    $db->execute('INSERT INTO ' . $db->table(Community::BANS) . ' (user_id, until, reason, admin_user_id, created_at) VALUES (21, NULL, ?, 1, ?)', ['x', $at($now)]);
    $community = new Community($seams(20));
    $out['communityStopped'] = ['20' => $community->stopped(20), '10' => $community->stopped(10)];
    $out['loginOut'] = Moderation::loginOut($db, 11);

    // == Blocks count logins ==
    $block = static fn (int $by, int $who) => $db->execute('INSERT INTO ' . $db->table('groddle_ignores') . ' (user_id, ignored_id, added_at) VALUES (?, ?, ?)', [$by, $who, $at($now)]);
    foreach ([10, 11, 12] as $by) {
        $block($by, 40);
    }
    ModReports::afterBlock($db, 40);
    $out['flagOneLogin'] = (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(ModReports::TABLE) . ' WHERE reported_id = 40');
    $block(20, 40);
    $block(30, 40);
    ModReports::afterBlock($db, 40);
    $out['flagThreeLogins'] = (int) $db->value('SELECT COUNT(*) FROM ' . $db->table(ModReports::TABLE) . ' WHERE reported_id = 40');

    // == Names: a retired character's name is free after the hold ==
    $chars = new Characters($db);
    $out['taken'] = ['cydHeldOver' => $chars->taken('Cyd'), 'kitJustRetired' => $chars->taken('Kit'), 'bea' => $chars->taken('BEA')];
    $out['claimCyd'] = $chars->claim(40, 'Cyd') ? 'no' : 'kept'; // 40 already has a name: INSERT IGNORE keeps theirs
    $person(60, '', 'new@example.com', 'subscriber', $now);
    $out['claimCydNew'] = $chars->claim(60, 'Cyd');
    $out['cydHolds'] = $chars->holdsOwnName(12);
    $out['slugs'] = Profiles::slugs($db);

    // == An administrator's rename, and the old address ==
    $rename = static fn (int $id, string $to) => $answer(static fn (): Response => $console($request(Method::Post, '/', [], ['name' => $to]))->rename($request(Method::Post, '/', [], ['name' => $to]), (string) $id));
    $out['rename'] = $rename(10, 'Ada Two');
    $out['renameTaken'] = $rename(10, 'Dot');
    $out['renameBad'] = $rename(10, '!');
    $out['renamed'] = [
        'name' => (string) $db->value('SELECT name FROM ' . $db->table(Characters::TABLE) . ' WHERE user_id = 10'),
        'display' => (string) $db->value('SELECT display_name FROM ' . $db->table('users') . ' WHERE ID = 10'),
        'nickname' => (string) $db->value('SELECT meta_value FROM ' . $db->table('usermeta') . " WHERE user_id = 10 AND meta_key = 'nickname'"),
        'oldFree' => !$chars->taken('Ada'),
        'row' => $db->row('SELECT user_id, old_name, old_slug, new_name, admin_user_id FROM ' . $db->table(AdminConsole::RENAMES)),
        'log' => (string) $db->value('SELECT kind FROM ' . $db->table(AdminConsole::ACTIONS) . " WHERE kind = 'rename'"),
    ];
    $slugs = Profiles::slugs($db);
    $out['redirect'] = ['old' => PlayerPages::renamed($db, 'ada', $slugs), 'unknown' => PlayerPages::renamed($db, 'nobody', $slugs)];

    // == Restoring after the hold: a free place, and a new name when the old one was taken ==
    $db->execute('UPDATE ' . $db->table(Logins::TABLE) . ' SET retired_at = ? WHERE user_id = 13', [$at($now - 31 * DAY)]);
    $out['create']['login10AfterHold'] = $logins->createRefusal(10, $now);
    $restore = static fn (array $body) => $answer(static fn (): Response => $routes(10)->restore($request(Method::Post, '/', [], $body), '12'));
    $out['restore'] = ['noName' => $restore([]), 'takenName' => $restore(['name' => 'Cyd']), 'newName' => $restore(['name' => 'Cyd Again'])];
    $out['restored'] = ['retired' => $logins->retiredAt(12), 'name' => (string) $db->value('SELECT name FROM ' . $db->table(Characters::TABLE) . ' WHERE user_id = 12'), 'counted' => $logins->counted(10, $now), 'full' => $logins->createRefusal(10, $now)['code'] ?? null];

    // == Analytics: a character is a QA account by its login's email ==
    $out['analyticsPlayers'] = array_keys(Analytics::players($db, [10, 11, 30, 31, 20]));
    $out['loginSignups'] = count(Analytics::signupDays($db, true));
    $out['characterSignups'] = count(Analytics::signupDays($db));
} catch (Throwable $e) {
    $out['error'] = get_class($e) . ': ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine();
} finally {
    $root->query("DROP DATABASE IF EXISTS `{$name}`");
    $out['dropped'] = (int) $root->query("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '{$name}'")->fetch_row()[0] === 0;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
