<?php
/**
 * Runs the site repo's ticket rules (groddle-afternoon-site src/TicketStore.php,
 * TicketMigration.php, BugReports.php, PlayerMail.php, ReportPicture.php; ticket 49's Working on it
 * and Edit until read) against the engine's
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
use Groddle\Minn\ReportPicture;
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

// A report's picture: JPEGs made here with GD, and what is refused (the code and status).
$jpeg = static function (int $w, int $h, int $q = 80): string {
    $im = imagecreatetruecolor($w, $h);
    for ($x = 0; $x < $w; $x += 8) {
        imagefilledrectangle($im, $x, 0, $x + 7, $h - 1, (int) imagecolorallocate($im, ($x * 7) % 256, ($x * 3) % 256, 120));
    }
    ob_start();
    imagejpeg($im, null, $q);
    return (string) ob_get_clean();
};
$refusal = static function (mixed $value): array {
    try {
        ReportPicture::accept($value);
        return ['ok' => true];
    } catch (Minn\RestError $e) {
        return ['code' => $e->errorCode, 'status' => $e->status];
    }
};
$good = $jpeg(640, 360);
// An APP1 (EXIF-like) segment after SOI: GD's new JPEG keeps none of it.
$tagged = "\xFF\xD8" . "\xFF\xE1" . pack('n', 2 + 16) . 'Exif' . "\0\0" . 'SECRETGPS!' . substr($good, 2);
$kept = ReportPicture::accept('data:image/jpeg;base64,' . base64_encode($tagged));
ob_start();
imagepng(imagecreatetruecolor(320, 200));
$png = (string) ob_get_clean();
$noise = static function (int $w, int $h): string {
    $im = imagecreatetruecolor($w, $h);
    mt_srand(7);
    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            imagesetpixel($im, $x, $y, mt_rand(0, 0xFFFFFF));
        }
    }
    ob_start();
    imagejpeg($im, null, 100);
    return (string) ob_get_clean();
};

// Ticket 49: Edit until read. A ticket of player 7 and its first message, as the database rows read.
$ticket = ['id' => 5, 'player_user_id' => 7, 'admin_read_at' => null];
$first = ['id' => 11, 'ticket_id' => 5, 'author_user_id' => 7, 'author_role' => 'player', 'body' => 'Pigs float', 'created_at' => '2026-11-02 10:00:00', 'edited_at' => null];
$read = static fn (?string $at): array => ['admin_read_at' => $at] + $ticket;
$long = static function (int $n): array {
    try {
        return ['ok' => mb_strlen(BugReports::message(str_repeat('z', $n), BugReports::MAX_MESSAGE, 'groddle_ticket_long'))];
    } catch (Minn\RestError $e) {
        return ['code' => $e->errorCode, 'status' => $e->status];
    }
};

echo json_encode([
    'working' => [
        'statuses' => TicketStore::STATUSES,
        'fitsColumn' => strlen(TicketStore::WORKING) <= 8,
        'playerWritesInWorking' => TicketStore::statusAfter('player', 'working'),
        'adminWritesInWorking' => TicketStore::statusAfter('admin', 'working'),
        'playerWritesInClosed' => TicketStore::statusAfter('player', 'closed'),
        'adminWritesInOpen' => TicketStore::statusAfter('admin', 'open'),
        'set' => TicketStore::workingStatus(true, 'player'),
        'clearPlayerLast' => TicketStore::workingStatus(false, 'player'),
        'clearAdminLast' => TicketStore::workingStatus(false, 'admin'),
    ],
    'edit' => [
        'neverRead' => TicketStore::editable($ticket, $first, 7),
        'readBeforeIt' => TicketStore::editable($read('2026-11-02 09:59:59'), $first, 7),
        'readAfter' => TicketStore::editable($read('2026-11-02 10:00:01'), $first, 7),
        'readSameSecond' => TicketStore::editable($read('2026-11-02 10:00:00'), $first, 7),
        'editedThenRead' => TicketStore::editable($read('2026-11-02 10:06:00'), ['edited_at' => '2026-11-02 10:05:00'] + $first, 7),
        'otherPlayer' => TicketStore::editable($ticket, $first, 8),
        'notTheirTicket' => TicketStore::editable(['player_user_id' => 8] + $ticket, ['author_user_id' => 8] + $first, 7),
        'adminMessage' => TicketStore::editable($ticket, ['author_role' => 'admin', 'author_user_id' => 1] + $first, 7),
        'otherTicketsMessage' => TicketStore::editable($ticket, ['ticket_id' => 6] + $first, 7),
        'noMessage' => TicketStore::editable($ticket, null, 7),
        'signedOut' => TicketStore::editable($ticket, $first, 0),
        'fits' => $long(BugReports::MAX_MESSAGE),
        'tooLong' => $long(BugReports::MAX_MESSAGE + 1),
        'cleaned' => BugReports::message("  New\x07 words\r\nhere  ", BugReports::MAX_MESSAGE, 'groddle_ticket_long'),
        'subject' => TicketStore::subject("New first line\nmore"),
        'out' => TicketStore::messagesOut([['edited_at' => '2026-11-02 10:05:00'] + $first, ['edited_at' => null] + $first]),
        // Revisions (Austin 2026-11-02): an administrator's thread carries every earlier text, oldest first.
        'adminOut' => TicketStore::messagesOut([['edited_at' => '2026-11-02 10:07:00', 'body' => 'Pigs float high'] + $first], [11 => [
            ['message_id' => 11, 'body' => 'Pigs float', 'written_at' => '2026-11-02 10:00:00', 'replaced_at' => '2026-11-02 10:05:00'],
            ['message_id' => 11, 'body' => 'Pigs float up', 'written_at' => '2026-11-02 10:05:00', 'replaced_at' => '2026-11-02 10:07:00'],
        ]]),
        'adminOutNone' => TicketStore::messagesOut([$first], []),
    ],
    'picture' => [
        'kept' => ['width' => $kept['width'], 'height' => $kept['height'], 'soi' => str_starts_with($kept['bytes'], "\xFF\xD8\xFF"), 'fits' => strlen($kept['bytes']) <= ReportPicture::MAX_BYTES, 'tagDropped' => !str_contains($kept['bytes'], 'SECRETGPS')],
        'pngNamedJpeg' => $refusal('data:image/jpeg;base64,' . base64_encode($png)),
        'bytesDecide' => $refusal('data:image/png;base64,' . base64_encode($good)),
        'tooWide' => $refusal(base64_encode($jpeg(1400, 200))),
        'tooSmall' => $refusal(base64_encode($jpeg(40, 40))),
        'tooLarge' => $refusal(base64_encode($noise(1000, 700))),
        'tooLong' => $refusal(str_repeat('A', 500000)),
        'garbage' => $refusal('not base64 at all!'),
        'cut' => $refusal(base64_encode(substr($good, 0, 400))),
        'notString' => $refusal(['a']),
        'limits' => ['maxBytes' => ReportPicture::MAX_BYTES, 'maxW' => ReportPicture::MAX_W, 'maxH' => ReportPicture::MAX_H],
    ],
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
        'cut' => mb_strlen(BugReports::clean(str_repeat('x', 4100), TicketStore::MAX_MESSAGE, true)),
    ],
    'message' => (static function (): array {
        try {
            BugReports::message(str_repeat('x', TicketStore::MAX_MESSAGE + 1), TicketStore::MAX_MESSAGE, 'groddle_ticket_long');
            $refused = null;
        } catch (\Minn\RestError $e) {
            $refused = [$e->errorCode, $e->status, $e->getMessage()];
        }
        return [
            'fits' => mb_strlen(BugReports::message(str_repeat('x', TicketStore::MAX_MESSAGE), TicketStore::MAX_MESSAGE, 'c')),
            'admin' => mb_strlen(BugReports::message(str_repeat('y', 9000), TicketStore::MAX_ADMIN_MESSAGE, 'c')),
            'refused' => $refused ? [$refused[0], $refused[1]] : null,
            'words' => $refused !== null && str_contains($refused[2], '4,001 characters') && !preg_match('/[\x{2014}\x{2013}]/u', $refused[2]),
        ];
    })(),
    'migration' => [
        'message' => $oldMessage, 'context' => $oldContext,
        'bareMessage' => $bareMessage, 'bareContext' => $bareContext,
        'titleMessage' => $titleMessage,
    ],
    'mail' => ['subject' => $subject, 'html' => $html, 'headers' => $headers],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
