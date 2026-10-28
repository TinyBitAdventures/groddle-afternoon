<?php
/**
 * Runs the site repo's src/GoogleIdToken.php and the pure parts of
 * src/GoogleSignIn.php (groddle-afternoon-site) against the engine's
 * classes, with RSA keys made here and Google's key list answered by the
 * engine's Http fake, and prints each case's outcome as JSON
 * (tests/g398-google.test.js). No network.
 *
 *   php tests/fixtures/minn-accounts/google-token.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
foreach (['GoogleIdToken', 'GoogleSignIn', 'PlayerAccount'] as $class) {
    require $extension . "/src/{$class}.php";
}

use Groddle\Minn\GoogleIdToken;
use Groddle\Minn\GoogleSignIn;
use Minn\Http\Fake;

const CLIENT = '1234567890-qa.apps.googleusercontent.com';
$now = 1_800_000_000;

$keyPair = static fn (int $bits = 2048): OpenSSLAsymmetricKey => openssl_pkey_new(['private_key_bits' => $bits, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
$jwk = static function (OpenSSLAsymmetricKey $key, string $kid): array {
    $rsa = openssl_pkey_get_details($key)['rsa'];
    return ['kty' => 'RSA', 'kid' => $kid, 'alg' => 'RS256', 'use' => 'sig', 'n' => GoogleIdToken::encode($rsa['n']), 'e' => GoogleIdToken::encode($rsa['e'])];
};
$sign = static function (array $claims, OpenSSLAsymmetricKey $key, string $kid, string $alg = 'RS256'): string {
    $head = GoogleIdToken::encode(json_encode(['alg' => $alg, 'kid' => $kid, 'typ' => 'JWT']));
    $body = GoogleIdToken::encode(json_encode($claims));
    openssl_sign("{$head}.{$body}", $sig, $key, OPENSSL_ALGO_SHA256);
    return "{$head}.{$body}." . GoogleIdToken::encode($sig);
};
$claims = static fn (array $over = []): array => array_filter($over + [
    'iss' => 'https://accounts.google.com',
    'aud' => CLIENT,
    'azp' => CLIENT,
    'sub' => '110248495921238986420',
    'email' => 'zz-google@example.com',
    'email_verified' => true,
    'given_name' => 'Tess',
    'iat' => $now - 10,
    'exp' => $now + 3590,
], static fn ($v): bool => $v !== null);

$k1 = $keyPair();
$k2 = $keyPair();
$weak = $keyPair(1024);

// Google's list, which a test changes between cases; every fetch is counted by the fake.
$published = [$jwk($k1, 'k1')];
$fake = new Fake(['www.googleapis.com/oauth2/v3/certs' => static function () use (&$published) {
    return Fake::reply(['keys' => $published], 200, ['Cache-Control' => 'public, max-age=21600, must-revalidate, no-transform']);
}]);
$http = $fake->http(['https://challenges.cloudflare.com/turnstile/v0/siteverify', 'https://www.googleapis.com/oauth2/v3/certs']);
$cache = null;
$saved = [];
$checker = new GoogleIdToken($http, static function () use (&$cache) { return $cache; }, static function (array $copy) use (&$cache, &$saved): void { $cache = $copy; $saved[] = $copy; });
$fetches = static fn (): int => count($fake->sent('www.googleapis.com/oauth2/v3/certs'));
$run = static function (string $jwt, ?int $at = null) use ($checker, $now) {
    $out = $checker->verify($jwt, CLIENT, $at ?? $now);
    return is_array($out) ? 'ok' : $out;
};

$cases = [];
$good = $sign($claims(), $k1, 'k1');
$cases['good'] = [$run($good), $fetches()];
$verified = $checker->verify($good, CLIENT, $now);
$cases['claims'] = is_array($verified) ? [$verified['sub'], $verified['email']] : $verified;
$cases['cached'] = [$run($good), $fetches(), $saved[0]['expires'] - $saved[0]['fetched'], $saved[0]['fetched']];
$cases['shortIssuer'] = $run($sign($claims(['iss' => 'accounts.google.com']), $k1, 'k1'));
$cases['badSignature'] = $run($sign($claims(), $k2, 'k1'));
[$h, $b, $s] = explode('.', $good);
$cases['tampered'] = $run($h . '.' . GoogleIdToken::encode(json_encode($claims(['email' => 'someone-else@example.com']))) . '.' . $s);
$cases['wrongAudience'] = $run($sign($claims(['aud' => 'someone-else.apps.googleusercontent.com']), $k1, 'k1'));
$cases['audienceList'] = $run($sign($claims(['aud' => [CLIENT]]), $k1, 'k1'));
$cases['wrongIssuer'] = $run($sign($claims(['iss' => 'https://evil.example.com']), $k1, 'k1'));
$cases['expired'] = $run($sign($claims(['exp' => $now - 61]), $k1, 'k1'));
$cases['withinSkew'] = $run($sign($claims(['exp' => $now - 30]), $k1, 'k1'));
$cases['future'] = $run($sign($claims(['iat' => $now + 600]), $k1, 'k1'));
$cases['emailUnverified'] = $run($sign($claims(['email_verified' => false]), $k1, 'k1'));
$cases['emailVerifiedText'] = $run($sign($claims(['email_verified' => 'true']), $k1, 'k1'));
$cases['emailVerifiedMissing'] = $run($sign(array_diff_key($claims(), ['email_verified' => 1]), $k1, 'k1'));
$cases['noEmail'] = $run($sign(array_diff_key($claims(), ['email' => 1]), $k1, 'k1'));
$cases['algNone'] = $run(GoogleIdToken::encode(json_encode(['alg' => 'none', 'kid' => 'k1'])) . '.' . GoogleIdToken::encode(json_encode($claims())) . '.AAAA');
$cases['algHs256'] = $run($sign($claims(), $k1, 'k1', 'HS256'));
$cases['malformed'] = array_map($run, ['', 'abc', 'a.b', 'a.b.c.d', '!!.??.**', str_repeat('a', 9000)]);
$cases['noClient'] = is_array($checker->verify($good, '', $now)) ? 'ok' : $checker->verify($good, '', $now);

// Google rotates: a token names k2, which the copy (fetched now) doesn't have. Within the minute, no new fetch.
$published = [$jwk($k1, 'k1'), $jwk($k2, 'k2')];
$rotated = $sign($claims(), $k2, 'k2');
$before = $fetches();
$cases['unknownKidSoon'] = [$run($rotated, $now + 30), $fetches() - $before];
// A minute on, the unknown kid fetches again and passes.
$cases['unknownKidRefetch'] = [$run($rotated, $now + 120), $fetches() - $before];
$cases['bothKeysAfter'] = [$run($good, $now + 130), $run($rotated, $now + 130), $fetches() - $before];
// A kid Google never published: one fetch at most a minute, then refused.
$cases['neverPublished'] = [$run($sign($claims(), $k2, 'k9'), $now + 300), $run($sign($claims(), $k2, 'k9'), $now + 310), $fetches() - $before];
// The copy goes stale (max-age) and Google is down: the key the copy has still checks a signature.
$downFake = new Fake([]);
$stale = ['keys' => [$jwk($k1, 'k1')], 'fetched' => $now - 90000, 'expires' => $now - 3600];
$offline = new GoogleIdToken($downFake->http(), static fn () => $stale, static function (): void {});
$out = $offline->verify($good, CLIENT, $now);
$cases['staleGoogleDown'] = [is_array($out) ? 'ok' : $out, count($downFake->sent())];
// Fixed keys (the local QA option) never ask Google.
$fixedFake = new Fake([]);
$fixed = new GoogleIdToken($fixedFake->http(), static fn () => null, static function (): void {}, [$jwk($k1, 'k1')]);
$out = $fixed->verify($good, CLIENT, $now);
$cases['fixedKeys'] = [is_array($out) ? 'ok' : $out, count($fixedFake->sent())];

$keyCases = [
    'good' => GoogleIdToken::publicKey($jwk($k1, 'k1')) !== null,
    'weak' => GoogleIdToken::publicKey($jwk($weak, 'w')) !== null,
    'notRsa' => GoogleIdToken::publicKey(['kty' => 'EC'] + $jwk($k1, 'k1')) !== null,
    'encryption' => GoogleIdToken::publicKey(['use' => 'enc'] + $jwk($k1, 'k1')) !== null,
    'otherAlg' => GoogleIdToken::publicKey(['alg' => 'RS512'] + $jwk($k1, 'k1')) !== null,
];

$player = static fn (int $id, bool $isPlayer = true, string $sub = ''): array => ['id' => $id, 'player' => $isPlayer, 'sub' => $sub];
$plans = [
    'linked' => GoogleSignIn::plan($player(7, true, 'S'), null, 'S'),
    'linkedStaff' => GoogleSignIn::plan($player(1, false, 'S'), null, 'S'),
    'linkedWins' => GoogleSignIn::plan($player(7, true, 'S'), $player(8), 'S'),
    'email' => GoogleSignIn::plan(null, $player(8), 'S'),
    'emailStaff' => GoogleSignIn::plan(null, $player(1, false), 'S'),
    'emailOtherGoogle' => GoogleSignIn::plan(null, $player(8, true, 'T'), 'S'),
    'new' => GoogleSignIn::plan(null, null, 'S'),
];

echo json_encode([
    'cases' => $cases,
    'keys' => $keyCases,
    'maxAge' => [GoogleIdToken::maxAge('public, max-age=21600, must-revalidate'), GoogleIdToken::maxAge(''), GoogleIdToken::maxAge('max-age=5'), GoogleIdToken::maxAge('max-age=99999999'), GoogleIdToken::maxAge('no-cache')],
    'plans' => $plans,
    'subscriber' => [
        GoogleSignIn::onlySubscriber('a:1:{s:10:"subscriber";b:1;}'),
        GoogleSignIn::onlySubscriber('a:1:{s:13:"administrator";b:1;}'),
        GoogleSignIn::onlySubscriber('a:2:{s:10:"subscriber";b:1;s:6:"editor";b:1;}'),
        GoogleSignIn::onlySubscriber(null),
        GoogleSignIn::onlySubscriber('O:8:"stdClass":0:{}'),
    ],
    'suggested' => [GoogleSignIn::suggestedName('Tess'), GoogleSignIn::suggestedName(' Mary  Ann '), GoogleSignIn::suggestedName('Zoë'), GoogleSignIn::suggestedName('A'), GoogleSignIn::suggestedName('<b>x</b>')],
], JSON_UNESCAPED_SLASHES);
