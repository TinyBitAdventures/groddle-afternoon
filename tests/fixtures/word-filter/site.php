<?php
/**
 * Runs the site repo's word filter (src/WordFilter.php, the remake's own
 * addition) over the shared vectors and through the places the site keeps
 * player text, printing one JSON object (tests/word-filter.test.js).
 *
 *   php tests/fixtures/word-filter/site.php <engine public/minn> <groddle-afternoon-site> <vectors.json>
 */

declare(strict_types=1);

[, $engine, $extension, $vectorsFile] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
spl_autoload_register(static function (string $class) use ($extension): void {
    if (str_starts_with($class, 'Groddle\\Minn\\')) {
        $file = $extension . '/src/' . substr($class, strlen('Groddle\\Minn\\')) . '.php';
        if (is_file($file)) {
            require_once $file;
        }
    }
});

use Groddle\Minn\ButlerParcels;
use Groddle\Minn\GoogleSignIn;
use Groddle\Minn\HomeStreet;
use Groddle\Minn\LedgerGift;
use Groddle\Minn\Neighbours;
use Groddle\Minn\Profiles;
use Groddle\Minn\Snaps;
use Groddle\Minn\WordFilter;

$vectors = json_decode((string) file_get_contents($vectorsFile), true)['vectors'];
$wrong = [];
foreach ($vectors as $v) {
    $out = WordFilter::text($v['in']);
    if ($out !== $v['out'] || WordFilter::text($out) !== $out || WordFilter::has($v['in']) !== ($v['in'] !== $v['out'])) {
        $wrong[] = [$v['in'], $out, $v['out']];
    }
}

$tower = Neighbours::homesSlice((object) ['systems' => (object) ['features' => (object) [
    'homes' => (object) [],
    'home-tower' => (object) ['built' => true, 'floors' => 2, 'name' => 'Shit Tower', 'floorLabels' => (object) ['1' => 'fuck floor', '2' => 'Attic']],
]]]);

echo json_encode([
    'vectors' => count($vectors),
    'wrong' => $wrong,
    'about' => Profiles::about("Hi!\nI hate this shit."),
    'letter' => LedgerGift::text('Dear bastard, hello', 300, true),
    'butler' => ButlerParcels::cleanText('for you, <b>bitch</b>'),
    'caption' => Snaps::caption('look at this fuckin rock'),
    'pole' => HomeStreet::text('a shitty note', 150),
    'butlerName' => Neighbours::butlerView((object) ['systems' => (object) ['features' => (object) ['butler' => (object) ['owned' => true, 'name' => 'Sir Fuckface']]]])['name'] ?? null,
    'tower' => $tower,
    'google' => [GoogleSignIn::suggestedName('Dickhead'), GoogleSignIn::suggestedName('Ada')],
    'refused' => WordFilter::NAME_REFUSED,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
