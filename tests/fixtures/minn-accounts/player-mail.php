<?php
/**
 * Runs the site repo's src/PlayerMail.php (groddle-afternoon-site) against the
 * engine's classes and prints the reset email's parts as JSON
 * (tests/minn-account.test.js).
 *
 *   php tests/fixtures/minn-accounts/player-mail.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/PlayerMail.php';

use Groddle\Minn\PlayerMail;

$link = 'https://groddle.example/play/online/#reset=AbC123&login=player-0123abcdef';
[$subject, $html, $headers] = PlayerMail::reset('https://groddle.example/', '', $link, 'Zz <b>Bold</b> & Co');
[, , $named] = PlayerMail::reset('https://groddle.example', 'hello@groddle.example', $link, 'Zz');
[, , $bad] = PlayerMail::reset('https://groddle.example', 'not an address', $link, 'Zz');
echo json_encode(['subject' => $subject, 'html' => $html, 'headers' => $headers, 'named' => $named, 'bad' => $bad], JSON_UNESCAPED_SLASHES);
