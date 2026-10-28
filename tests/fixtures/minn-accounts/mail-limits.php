<?php
/**
 * Runs the site repo's src/MailLimits.php and src/Turnstile.php
 * (groddle-afternoon-site) against the engine's classes (Turnstile's
 * siteverify through the engine's Http fake) and prints their pure rules as
 * JSON (tests/g398-mail-limits.test.js). Cloudflare's published test secret
 * is used; nothing real.
 *
 *   php tests/fixtures/minn-accounts/mail-limits.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/MailLimits.php';
require $extension . '/src/Turnstile.php';

use Groddle\Minn\MailLimits;
use Groddle\Minn\Turnstile;
use Minn\Http\Fake;

$addresses = [];
foreach (['203.0.113.7', '2001:db8:abcd:12:1:2:3:4', '2001:DB8:ABCD:12:ffff::9', '2001:db8:abcd:13::1', '::ffff:198.51.100.2', '::1', '', 'not an address'] as $ip) {
    $addresses[$ip] = MailLimits::addressKey($ip);
}

$zero = ['sameAddressMinute' => 0, 'emailMinute' => 0, 'emailDay' => 0, 'addressHour' => 0];
$decide = static fn (array $over): string => MailLimits::resetDecision($over + $zero);

$secret = '1x0000000000000000000000000000000AA';
$grant = ['https://challenges.cloudflare.com/turnstile/v0/siteverify'];
$check = static function (mixed $answer, string $token, string $address = '203.0.113.7', bool $on = true) use ($secret, $grant): array {
    $fake = new Fake($answer === null ? [] : ['challenges.cloudflare.com/turnstile/v0/siteverify' => $answer]);
    $turnstile = $on ? new Turnstile('1x00000000000000000000AA', $secret) : new Turnstile('', '');
    $result = $turnstile->passes($fake->http($grant), $token, $address);
    $sent = $fake->sent();
    parse_str($sent[0]->body ?? '', $form);
    return [
        'result' => $result,
        'requests' => count($sent),
        'method' => $sent[0]->method ?? null,
        'form' => array_keys($form),
        'secretSent' => ($form['secret'] ?? null) === $secret,
        'response' => $form['response'] ?? null,
        'remoteip' => $form['remoteip'] ?? null,
    ];
};

echo json_encode([
    'addresses' => $addresses,
    'email' => [MailLimits::emailHash(' Zz@Example.COM ') === hash('sha256', 'zz@example.com'), strlen(MailLimits::emailHash('a@b.c'))],
    'decision' => [
        'fresh' => $decide([]),
        'sameBrowser' => $decide(['sameAddressMinute' => 1, 'emailMinute' => 1]),
        'otherBrowserMinute' => $decide(['emailMinute' => 1]),
        'dayFour' => $decide(['emailDay' => 4]),
        'dayFive' => $decide(['emailDay' => 5]),
        'addressNine' => $decide(['addressHour' => 9]),
        'addressTen' => $decide(['addressHour' => 10]),
    ],
    'cap' => [MailLimits::capFrom(null), MailLimits::capFrom('50'), MailLimits::capFrom(' 1200 '), MailLimits::capFrom('0'), MailLimits::capFrom('-5'), MailLimits::capFrom('lots')],
    'limits' => ['gap' => MailLimits::RESET_GAP, 'day' => MailLimits::RESET_PER_DAY, 'addressHour' => MailLimits::RESET_PER_ADDRESS_HOUR, 'hourCap' => MailLimits::HOUR_CAP, 'keep' => MailLimits::KEEP, 'option' => MailLimits::CAP_OPTION],
    'words' => ['busy' => MailLimits::BUSY, 'wait' => MailLimits::RESET_WAIT, 'failed' => Turnstile::FAILED],
    'turnstile' => [
        'off' => $check(['success' => true], '', on: false),
        'offKey' => (new Turnstile('1x00000000000000000000AA', ''))->siteKey(),
        'onKey' => (new Turnstile('1x00000000000000000000AA', $secret))->siteKey(),
        'pass' => $check(['success' => true, 'hostname' => 'groddle.localhost'], 'XXXX.DUMMY.TOKEN.XXXX'),
        'fail' => $check(['success' => false, 'error-codes' => ['invalid-input-response']], 'XXXX.DUMMY.TOKEN.XXXX'),
        'truthy' => $check(['success' => 'true'], 'XXXX.DUMMY.TOKEN.XXXX'),
        'empty' => $check(['success' => true], '   '),
        'long' => $check(['success' => true], str_repeat('a', 2049)),
        'down' => $check(500, 'XXXX.DUMMY.TOKEN.XXXX'),
        'unreachable' => $check(null, 'XXXX.DUMMY.TOKEN.XXXX'),
        'noAddress' => $check(['success' => true], 'tok', ''),
    ],
], JSON_UNESCAPED_SLASHES);
