<?php
/**
 * Runs minn/groddle/src/SaveShape.php against the engine's classes and
 * prints one outcome per case as JSON (tests/minn-account.test.js).
 *
 *   php tests/fixtures/minn-accounts/save-shape.php <engine public/minn> <minn/groddle>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/SaveShape.php';

use Groddle\Minn\SaveShape;

$try = static function (Closure $run): string {
    try {
        $out = $run();
        return is_string($out) ? 'ok:' . $out : 'ok';
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};
$save = static fn (string $kind, array $entries, int $format = 1): array => ['kind' => $kind, 'format' => $format, 'entries' => $entries];
$solo = SaveShape::SOLO;
$mp = SaveShape::MULTIPLAYER;

echo json_encode([
    'solo' => $try(static fn () => SaveShape::check($save($solo, ['playerState' => '{}', 'location' => 'x']), $solo) && null),
    'multiplayer' => $try(static fn () => SaveShape::check($save($mp, ['appearance' => '{}']), $mp) && null),
    'emptyMultiplayer' => $try(static fn () => SaveShape::encode(SaveShape::check($save($mp, []), $mp))),
    'soloAsMultiplayer' => $try(static fn () => SaveShape::check($save($solo, ['playerState' => '{}']), $mp)),
    'multiplayerAsSolo' => $try(static fn () => SaveShape::check($save($mp, ['playerState' => '{}']), $solo)),
    'unknownEntry' => $try(static fn () => SaveShape::check($save($mp, ['groddle_player_state_v1' => '{}']), $mp)),
    'nonString' => $try(static fn () => SaveShape::check($save($mp, ['playerState' => ['a' => 1]]), $mp)),
    'listEntries' => $try(static fn () => SaveShape::check($save($mp, ['{}']), $mp)),
    'soloWithoutPlayer' => $try(static fn () => SaveShape::check($save($solo, ['location' => 'x']), $solo)),
    'format2' => $try(static fn () => SaveShape::check($save($mp, [], 2), $mp)),
    'tooLarge' => $try(static fn () => SaveShape::encode(SaveShape::check($save($mp, ['playerState' => str_repeat('x', SaveShape::MAX_BYTES)]), $mp))),
    'time' => SaveShape::time('2026-10-25 18:00:00'),
], JSON_UNESCAPED_SLASHES);
