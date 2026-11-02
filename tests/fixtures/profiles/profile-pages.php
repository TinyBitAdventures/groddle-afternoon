<?php
/**
 * Runs the pure parts of the site repo's src/PlayerPages.php (the skills a
 * profile shows), src/Profiles.php (a save's id lists) and src/SiteNav.php
 * (which header link a page marks) against the engine's classes and prints
 * the outcomes as JSON (tests/profiles.test.js, tests/site-nav-menu.test.js).
 *
 *   php tests/fixtures/profiles/profile-pages.php <engine public/minn> <groddle-afternoon-site> <game public/>
 */

declare(strict_types=1);

[, $engine, $extension, $game] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
foreach (['WordFilter', 'SaveShape', 'Characters', 'MultiplayerSave', 'Profiles', 'Buddies', 'StaticRoot', 'SiteNav', 'PlayerPages'] as $class) {
    require_once $extension . "/src/{$class}.php";
}

use Groddle\Minn\PlayerPages;
use Groddle\Minn\Profiles;
use Groddle\Minn\SiteNav;

$catalog = json_decode((string) file_get_contents($game . '/assets/content/skills.json'), true);
$ids = array_keys($catalog);
foreach (range(1, 5) as $rank) {
    $ids[] = "betterlearning_{$rank}";
}
$ids[] = 'not_a_skill_1';
$skills = [];
foreach (PlayerPages::skillRows($ids, $catalog, $game) as [$id, $title, $art]) {
    $skills[$id] = [$title, $art];
}

$header = [['Items', '/items/', ''], ['Players', '/players/', ''], ['Project', '/project/', ''], ['Play', '/play/online/', 'site-nav-play']];
$current = [];
foreach (['/project/', '/restoration/', '/restoration/history/', '/compare/', '/changelog/', '/changelog/a-note/', '/code/', '/codex/', '/players/zz/skills/', '/items/', '/', '/play/online/', '/musicblocks/'] as $path) {
    $current[$path] = SiteNav::current($header, $path);
}
$both = [...$header, ['Notes', '/changelog/', '']];

// The buddy button on a player's page (PlayerPages::buddyControl), as each reader sees it.
$state = static fn (array $over): array => $over + ['viewer' => 7, 'id' => 9, 'name' => 'Zz <b>Ada</b>', 'base' => '/players/zz-ada/', 'tab' => '', 'holds' => false, 'blocked' => false, 'nonce' => 'abcdef0123', 'said' => ''];
$buddy = [];
foreach ([
    'add' => [],
    'remove' => ['holds' => true],
    'signed out' => ['viewer' => 0],
    'own page' => ['viewer' => 9],
    'blocked' => ['blocked' => true],
    'no nonce' => ['nonce' => ''],
    'added' => ['holds' => true, 'said' => 'added'],
    'removed' => ['said' => 'removed'],
    'limit' => ['said' => 'limit'],
    'unknown said' => ['said' => '<script>'],
    'on skills' => ['tab' => 'skills'],
] as $case => $over) {
    $buddy[$case] = PlayerPages::buddyControl($state($over));
}

echo json_encode([
    'skills' => $skills,
    'ids' => Profiles::ids(['alchemy_1', 'mining_1', 'alchemy_1', 'Bad-Id', 5, null, 'refining_1']),
    'ids not a list' => Profiles::ids('alchemy_1'),
    'current' => $current,
    'direct link wins' => SiteNav::current($both, '/changelog/'),
    'nav on /code/' => SiteNav::nav($header, '/code/'),
    'buddy' => $buddy,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
