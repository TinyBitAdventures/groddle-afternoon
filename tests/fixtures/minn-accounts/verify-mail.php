<?php
/**
 * Runs the site repo's src/PlayerMail.php and src/Signups.php
 * (groddle-afternoon-site) against the engine's classes and prints the
 * sign-up email's parts and the held sign-up's pure rules as JSON
 * (tests/g336-verify-mp.test.js).
 *
 *   php tests/fixtures/minn-accounts/verify-mail.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/PlayerMail.php';
require $extension . '/src/Signups.php';

use Groddle\Minn\PlayerMail;
use Groddle\Minn\Signups;

$token = str_repeat('0a', 24);
$link = 'https://groddle.example/play/online/#verify=' . $token;
[$subject, $html, $headers] = PlayerMail::verify('https://groddle.example/', '', $link, 'Zz <b>Bold</b> & Co');

$now = 1_800_000_000;
$at = static fn (int $t): string => gmdate('Y-m-d H:i:s', $t);
$row = static fn (array $over = []): array => $over + ['used_at' => null, 'expires_at' => $at($now + 3600), 'sends' => 1, 'sent_at' => $at($now - 120)];
$made = Signups::token();
echo json_encode([
    'subject' => $subject,
    'html' => $html,
    'headers' => $headers,
    'token' => ['length' => strlen($made), 'looks' => Signups::looksLikeToken($made), 'hash' => Signups::hashOf($made) === hash('sha256', $made), 'notHex' => Signups::looksLikeToken('zz' . substr($made, 2)), 'short' => Signups::looksLikeToken(substr($made, 1))],
    'pending' => [
        'waiting' => Signups::pending($row(), $now),
        'expired' => Signups::pending($row(['expires_at' => $at($now - 1)]), $now),
        'used' => Signups::pending($row(['used_at' => $at($now - 10)]), $now),
    ],
    'send' => [
        'none' => Signups::sendRefusal(null, $now),
        'ok' => Signups::sendRefusal($row(), $now),
        'soon' => Signups::sendRefusal($row(['sent_at' => $at($now - 30)]), $now),
        'spent' => Signups::sendRefusal($row(['sends' => Signups::MAX_SENDS]), $now),
        'used' => Signups::sendRefusal($row(['used_at' => $at($now - 10), 'sends' => 99]), $now),
    ],
    'limits' => ['lifetime' => Signups::LIFETIME, 'maxSends' => Signups::MAX_SENDS, 'gap' => Signups::RESEND_GAP, 'perAddressHour' => Signups::PER_ADDRESS_HOUR],
], JSON_UNESCAPED_SLASHES);
