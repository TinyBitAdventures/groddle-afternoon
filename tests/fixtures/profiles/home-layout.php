<?php
/**
 * Runs the site repo's src/HomeLayout.php (groddle-afternoon-site: the
 * profile's home street as a layout) against the engine's classes: a good
 * manifest in a made-up static root, then one bad thing at a time, and the
 * diorama it draws. Prints one outcome per case as JSON (tests/home-layout.test.js).
 *
 *   php tests/fixtures/profiles/home-layout.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
foreach (['WordFilter', 'HomeLayout'] as $class) {
    require_once $extension . "/src/{$class}.php";
}

use Groddle\Minn\HomeLayout;

if (!function_exists('imagecreatetruecolor') || !function_exists('imagepng')) {
    echo json_encode(['gd' => 'no']), "\n";
    exit(0);
}

// A static root: two decos, a sheet with a 3x twin, new art, a link out of the root, the encyclopedia.
$root = sys_get_temp_dir() . '/groddle-home-layout-' . getmypid();
$png = static function (string $file, int $w, int $h) use ($root): void {
    @mkdir(dirname("{$root}/{$file}"), 0777, true);
    $im = imagecreatetruecolor($w, $h);
    imagepng($im, "{$root}/{$file}");
};
$png('assets/decos/groddle/bush_1.webp', 120, 80);
$png('assets/decos/groddle/bush_1@1.5x.webp', 180, 120);
$png('assets/decos/groddle/gz_new_thing.webp', 50, 50);
$png('assets/sprites/rocks/rock_sheet.png', 400, 100);
$png('assets/sprites/rocks/rock_sheet@3x.webp', 1200, 300);
$png('assets/sprites/made/fire-dragon/dragon.png', 50, 50);
$png('assets/ui/signpost/signpost_post.png', 43, 246);
$png('assets/content/secret.png', 10, 10);
@mkdir("{$root}/encyclopedia/items/rock_metal_1", 0777, true);
file_put_contents("{$root}/encyclopedia/items/rock_metal_1/index.html", '<!doctype html>');
file_put_contents("{$root}/encyclopedia/items/data.json", json_encode(['items' => [
    ['id' => 'rock_metal_1', 'name' => 'Metal Rock'],
    ['id' => 'proto_herb_garden_small', 'name' => 'S. Herb Garden'],
    ['id' => 'furniture_tower_chassis', 'name' => 'Tower'],
]]));
@symlink('/etc/hosts', "{$root}/assets/sprites/rocks/escape.png");

$good = [
    'v' => 1, 'w' => 960, 'h' => 476,
    'art' => ['assets/decos/groddle/bush_1.webp', 'assets/sprites/rocks/rock_sheet.png', 'assets/ui/signpost/signpost_post.png'],
    'draw' => [
        ['sky' => ['#a6effa', '#eafcfb'], 'x' => 0, 'y' => 0, 'w' => 960, 'h' => 600],
        ['col' => '#5c3b25', 'x' => 0, 'y' => 400, 'w' => 960, 'h' => 76, 'o' => 0.5],
        ['a' => 0, 'x' => -40, 'y' => 300, 'w' => 120, 'h' => 80, 'f' => 1, 't' => '#c0d0e0'],
        ['a' => 1, 'x' => 300, 'y' => 330, 'w' => 100.4, 'h' => 50, 'c' => [100, 0, 100, 100], 's' => 0],
        ['a' => 2, 'x' => 500, 'y' => 150, 'w' => 34, 'h' => 197, 's' => 2],
        ['txt' => 'way_out', 'x' => 470, 'y' => 170, 'w' => 60, 'h' => 14, 'r' => 5.5, 's' => 2],
        ['avatar' => 1, 'x' => 600, 'y' => 250, 'w' => 98, 'h' => 141, 'f' => 1, 's' => 3],
    ],
    'spots' => [
        ['k' => 'cultivation', 'i' => 'rock_metal_1', 'b' => [300, 330, 100, 50]],
        ['k' => 'tower', 'i' => 'furniture_tower_chassis', 'n' => 4, 'name' => 'Fuckington Spire', 'b' => [700, 20, 200, 380]],
        ['k' => 'signpost', 'b' => [470, 150, 70, 197]],
        ['k' => 'avatar', 'f' => 1, 'b' => [600, 250, 98, 141]],
        ['k' => 'item', 'i' => 'not_an_item', 'b' => [10, 10, 20, 20]],
        ['k' => 'cultivation', 'i' => 'proto_herb_garden_small', 'b' => [100, 380, 200, 10]],
        ['k' => 'door', 'b' => [800, 250, 92, 150]],
        ['k' => 'house', 's' => 'firebog', 'b' => [650, 100, 300, 300]],
    ],
];

$try = static function (mixed $layout) use ($root): string {
    try {
        HomeLayout::accept($layout, $root);
        return 'ok';
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};
$with = static function (callable $edit) use ($good): array {
    $copy = $good;
    $edit($copy);
    return $copy;
};

$out = [];
$kept = HomeLayout::accept($good, $root);
$out['good'] = 'ok';
$out['kept'] = $kept;
$out['labels'] = array_map(static fn (array $s): string => HomeLayout::label($s, HomeLayout::itemNames($root), 'Zz <b>Owner</b>'), $kept['spots']);
$out['html'] = HomeLayout::render($kept, ['owner' => 'Zz <b>Owner</b>', 'root' => $root, 'avatar' => '/players/7/avatar?v=1']);
$out['htmlNoAvatar'] = HomeLayout::render($kept, ['owner' => 'Zz', 'root' => $root, 'avatar' => null]);

$cases = [
    'notObject' => [1, 2, 3],
    'string' => 'hello',
    'version2' => $with(fn (&$l) => $l['v'] = 2),
    'extraTopKey' => $with(fn (&$l) => $l['script'] = '<script>'),
    'tooWide' => $with(fn (&$l) => $l['w'] = 99999),
    'hugeNumber' => $with(fn (&$l) => $l['draw'][2]['x'] = 1e300),
    'nanString' => $with(fn (&$l) => $l['draw'][2]['x'] = 'NaN'),
    'urlArt' => $with(fn (&$l) => $l['art'][0] = 'https://evil.example/x.png'),
    'protocolRelative' => $with(fn (&$l) => $l['art'][0] = '//evil.example/assets/x.png'),
    'dotDot' => $with(fn (&$l) => $l['art'][0] = 'assets/decos/../../../etc/passwd.png'),
    'javascript' => $with(fn (&$l) => $l['art'][0] = 'javascript:alert(1)'),
    'quoteInPath' => $with(fn (&$l) => $l['art'][0] = 'assets/decos/groddle/a"onerror="x.png'),
    'missingFile' => $with(fn (&$l) => $l['art'][0] = 'assets/decos/groddle/nope.webp'),
    'outsideRoots' => $with(fn (&$l) => $l['art'][0] = 'assets/content/secret.png'),
    'newArt' => $with(fn (&$l) => $l['art'][0] = 'assets/decos/groddle/gz_new_thing.webp'),
    'madeArt' => $with(fn (&$l) => $l['art'][0] = 'assets/sprites/made/fire-dragon/dragon.png'),
    'twinNamed' => $with(fn (&$l) => $l['art'][0] = 'assets/decos/groddle/bush_1@1.5x.webp'),
    'symlinkOut' => $with(fn (&$l) => $l['art'][0] = 'assets/sprites/rocks/escape.png'),
    'artTwice' => $with(fn (&$l) => $l['art'][2] = $l['art'][0]),
    'artIndexOut' => $with(fn (&$l) => $l['draw'][2]['a'] = 9),
    'cropOutside' => $with(fn (&$l) => $l['draw'][3]['c'] = [350, 0, 100, 100]),
    'tooManyDraw' => $with(fn (&$l) => $l['draw'] = array_fill(0, 401, $l['draw'][2])),
    'tooManySpots' => $with(fn (&$l) => $l['spots'] = array_fill(0, 81, $l['spots'][2])),
    'tooManyArt' => $with(fn (&$l) => $l['art'] = array_fill(0, 161, 'assets/decos/groddle/bush_1.webp')),
    'unknownKind' => $with(fn (&$l) => $l['spots'][2]['k'] = 'portal'),
    'unknownDraw' => $with(fn (&$l) => $l['draw'][] = ['html' => '<script>alert(1)</script>', 'x' => 0, 'y' => 0, 'w' => 1, 'h' => 1]),
    'scriptInText' => $with(fn (&$l) => $l['draw'][5]['txt'] = '<script>alert(1)</script>'),
    'scriptInColour' => $with(fn (&$l) => $l['draw'][1]['col'] = 'red;background:url(javascript:alert(1))'),
    'scriptInLabel' => $with(fn (&$l) => $l['spots'][2]['label'] = '<script>alert(1)</script>'),
    'scriptInItem' => $with(fn (&$l) => $l['spots'][0]['i'] = '<script>'),
    'nameOnDoor' => $with(fn (&$l) => $l['spots'][6]['name'] = 'Hello'),
    'longName' => $with(fn (&$l) => $l['spots'][1]['name'] = str_repeat('x', 41)),
    'badStyle' => $with(fn (&$l) => $l['spots'][7]['s'] = 'evil'),
    'twoAvatars' => $with(fn (&$l) => $l['draw'][] = $l['draw'][6]),
    'spotIndexOut' => $with(fn (&$l) => $l['draw'][3]['s'] = 50),
    'boxShort' => $with(fn (&$l) => $l['spots'][0]['b'] = [1, 2, 3]),
    'tooBig' => $with(fn (&$l) => $l['pad'] = str_repeat('x', 50000)),
];
foreach ($cases as $name => $layout) {
    $out[$name] = $try($layout);
}
// A Tower's name with a script tag is kept as text and escaped when drawn.
$named = HomeLayout::accept($with(fn (&$l) => $l['spots'][1]['name'] = '<img src=x onerror=alert(1)>'), $root);
$out['scriptName'] = HomeLayout::render($named, ['owner' => 'Zz', 'root' => $root, 'avatar' => null]);

echo json_encode($out, JSON_UNESCAPED_SLASHES), "\n";

// Clean up the made-up root.
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $f) {
    $f->isDir() && !$f->isLink() ? rmdir($f->getPathname()) : unlink($f->getPathname());
}
rmdir($root);
