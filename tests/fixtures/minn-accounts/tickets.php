<?php
/**
 * Runs the site repo's ticket rules (groddle-afternoon-site src/TicketStore.php,
 * TicketMigration.php, BugReports.php, PlayerMail.php) against the engine's
 * classes and prints them as JSON (tests/g483-tickets.test.js). Pure: no
 * database is opened.
 *
 *   php tests/fixtures/minn-accounts/tickets.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
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

use Groddle\Minn\BugReports;
use Groddle\Minn\PlayerMail;
use Groddle\Minn\TicketMigration;
use Groddle\Minn\TicketStore;

$row = static fn (string $author, ?string $playerRead, ?string $adminRead): array => [
    'last_author_role' => $author, 'last_message_at' => '2026-10-30 12:00:00', 'player_read_at' => $playerRead, 'admin_read_at' => $adminRead,
];

// A post as BugReports wrote them before tickets (its content() and meta).
$old = "<!-- wp:paragraph -->\n<p>The pig &amp; the &lt;b&gt;butterfly&lt;/b&gt; froze.<br>\nThen the street went dark.</p>\n<!-- /wp:paragraph -->\n\n"
    . "<!-- wp:paragraph -->\n<p>Second paragraph.</p>\n<!-- /wp:paragraph -->\n\n"
    . "<!-- wp:heading {\"level\":3} -->\n<h3 class=\"wp-block-heading\">Details</h3>\n<!-- /wp:heading -->\n\n"
    . "<!-- wp:preformatted -->\n<pre class=\"wp-block-preformatted\">Player: Zz Ada\nStreet: GA5101HF7F429V5\nStreet name: Hechey Track\nx: 120\ny: -30\nBuild: g465-1\nPage: /play/online/\nBrowser: Test/1.0\nScreen: 1280x800\nError 1: TypeError: boom &lt;here&gt;\nError 2: second</pre>\n<!-- /wp:preformatted -->";
[$oldMessage, $oldContext] = TicketMigration::fromPost($old, 'Zz Ada: The pig', []);
[$bareMessage, $bareContext] = TicketMigration::fromPost('<p>Only words</p>', 'Zz: Only words', ['groddle_street' => 'LIF12PMQ5121D68', 'groddle_errors' => '["From meta"]', 'groddle_agent' => 'Meta/2']);
[$titleMessage] = TicketMigration::fromPost('', 'Zz: Title only', []);

[$subject, $html, $headers] = PlayerMail::ticketReply('https://groddle.example/', '', 'Zz <b>Ada</b>', 'The <i>pig</i> froze', "Thanks!\n<script>alert(1)</script> & fixed.", 'https://groddle.example/play/online/#report=7');

echo json_encode([
    'subject' => [
        'short' => TicketStore::subject("  Pigs float\nmore words"),
        'long' => TicketStore::subject(str_repeat('a', 80)),
        'longLen' => mb_strlen(TicketStore::subject(str_repeat('é', 80))),
        'spaces' => TicketStore::subject("a \t  b"),
    ],
    'statusAfter' => [TicketStore::statusAfter('player'), TicketStore::statusAfter('admin')],
    'unread' => [
        'adminWroteNeverRead' => TicketStore::unreadFor($row('admin', null, null), 'player'),
        'adminWroteReadBefore' => TicketStore::unreadFor($row('admin', '2026-10-30 11:00:00', null), 'player'),
        'adminWroteReadAfter' => TicketStore::unreadFor($row('admin', '2026-10-30 12:00:00', null), 'player'),
        'playerWroteForPlayer' => TicketStore::unreadFor($row('player', null, null), 'player'),
        'playerWroteForAdmin' => TicketStore::unreadFor($row('player', '2026-10-30 12:00:00', null), 'admin'),
        'playerWroteAdminRead' => TicketStore::unreadFor($row('player', null, '2026-10-30 12:00:01'), 'admin'),
    ],
    'clean' => [
        'control' => BugReports::clean("a\x07b\r\nc", 2000, true),
        'badUtf8' => BugReports::clean("ok \xC3\x28 there", 2000, true),
        'cut' => mb_strlen(BugReports::clean(str_repeat('x', 2100), TicketStore::MAX_MESSAGE, true)),
    ],
    'migration' => [
        'message' => $oldMessage, 'context' => $oldContext,
        'bareMessage' => $bareMessage, 'bareContext' => $bareContext,
        'titleMessage' => $titleMessage,
    ],
    'mail' => ['subject' => $subject, 'html' => $html, 'headers' => $headers],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
