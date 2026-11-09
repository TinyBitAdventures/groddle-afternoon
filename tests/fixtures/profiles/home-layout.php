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
// The built game's public/, to read its real js/sprite-hires.js (optional).
$game = $argv[3] ?? null;
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
$png('assets/ui/signpost/signpost_post.webp', 43, 246);
// A sheet whose 3x ships split into two parts (js/sprite-hires.js SPLIT_SPRITES): 4 x 2 cells of
// 50 x 80 on the 1x sheet; each part holds 4 cells in 2 columns (100 x 160 in 1x units, 300 x 480 px).
$png('assets/sprites/mail-npc/fake_left.png', 200, 160);
$png('assets/sprites/mail-npc/fake_left.p1@3x.webp', 300, 480);
$png('assets/sprites/mail-npc/fake_left.p2@3x.webp', 300, 480);
@mkdir("{$root}/js", 0777, true);
file_put_contents("{$root}/js/sprite-hires.js", "export const HIRES_SPRITES = new Map([\n]);\n\nexport const SPLIT_SPRITES = new Map([\n"
    . '  ["assets/sprites/mail-npc/fake_left.png", { fw: 50, fh: 80, cols: 4, parts: [["assets/sprites/mail-npc/fake_left.p1@3x.webp", 0, 4, 2], ["assets/sprites/mail-npc/fake_left.p2@3x.webp", 4, 4, 2]] }],' . "\n"
    . '  ["../../etc/passwd", { fw: 50, fh: 80, cols: 4, parts: [["../x.webp", 0, 4, 2]] }],' . "\n"
    . "]);\n");
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
    'art' => ['assets/decos/groddle/bush_1.webp', 'assets/sprites/rocks/rock_sheet.png', 'assets/ui/signpost/signpost_post.webp'],
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

// Version 2: the whole street, in layers with their parallax factors.
$street = [
    'v' => 2, 'w' => 960, 'h' => 476, 'sw' => 2670, 'cx' => 600,
    'art' => ['assets/decos/groddle/bush_1.webp', 'assets/sprites/rocks/rock_sheet.png', 'assets/ui/signpost/signpost_post.webp'],
    'layers' => [
        ['f' => 0, 'draw' => [['sky' => ['#a6effa', '#eafcfb'], 'x' => 0, 'y' => 0, 'w' => 960, 'h' => 600]]],
        ['f' => 0.5, 'draw' => [
            ['a' => 0, 'x' => 100, 'y' => 200, 'w' => 120, 'h' => 80],
            ['a' => 0, 'x' => 1700, 'y' => 200, 'w' => 120, 'h' => 80, 's' => 0],
        ]],
        ['f' => 1, 'draw' => [
            ['col' => '#5c3b25', 'x' => 0, 'y' => 400, 'w' => 2670, 'h' => 76],
            ['a' => 1, 'x' => 2300, 'y' => 330, 'w' => 100, 'h' => 50, 'c' => [100, 0, 100, 100], 's' => 0],
            ['a' => 2, 'x' => 700, 'y' => 150, 'w' => 34, 'h' => 197, 's' => 1],
            ['txt' => 'way_out', 'x' => 670, 'y' => 170, 'w' => 60, 'h' => 14, 's' => 1],
            ['avatar' => 1, 'x' => 900, 'y' => 250, 'w' => 98, 'h' => 141, 's' => 2],
        ]],
    ],
    'spots' => [
        ['k' => 'cultivation', 'i' => 'rock_metal_1', 'b' => [2300, 330, 100, 50]],
        ['k' => 'signpost', 'b' => [670, 150, 70, 197]],
        ['k' => 'avatar', 'b' => [900, 250, 98, 141]],
        ['k' => 'door', 'b' => [100, 250, 92, 150]],
    ],
];
$withStreet = static function (callable $edit) use ($street): array {
    $copy = $street;
    $edit($copy);
    return $copy;
};
$keptStreet = HomeLayout::accept($street, $root);
$out['street'] = 'ok';
$out['streetKept'] = $keptStreet;
$out['streetHtml'] = HomeLayout::render($keptStreet, ['owner' => 'Zz Pan', 'root' => $root, 'avatar' => '/players/7/avatar?v=1']);
$streetCases = [
    'v2Draw' => $withStreet(fn (&$l) => $l['draw'] = []),
    'v2NoLayers' => $withStreet(function (&$l) { unset($l['layers']); }),
    'v2WideStreet' => $withStreet(fn (&$l) => $l['sw'] = 9000),
    'v2NarrowStreet' => $withStreet(fn (&$l) => $l['sw'] = 900),
    'v2CamPastEnd' => $withStreet(fn (&$l) => $l['cx'] = 1800),
    'v2CamNegative' => $withStreet(fn (&$l) => $l['cx'] = -1),
    'v2Factor' => $withStreet(fn (&$l) => $l['layers'][1]['f'] = 1.5),
    'v2FactorText' => $withStreet(fn (&$l) => $l['layers'][1]['f'] = 'calc(1)'),
    'v2LayerKey' => $withStreet(fn (&$l) => $l['layers'][1]['style'] = 'color:red'),
    'v2LayerList' => $withStreet(fn (&$l) => $l['layers'][1] = [0.5, []]),
    'v2TooManyLayers' => $withStreet(fn (&$l) => $l['layers'] = array_fill(0, 25, $l['layers'][1])),
    'v2TooManyDraw' => $withStreet(fn (&$l) => $l['layers'] = array_fill(0, 3, ['f' => 1, 'draw' => array_fill(0, 600, $l['layers'][1]['draw'][0])])),
    'v2PastStreet' => $withStreet(fn (&$l) => $l['layers'][2]['draw'][1]['x'] = 2670 + 4000 - 960 + 1),
    'v2SpotPastStreet' => $withStreet(fn (&$l) => $l['spots'][0]['b'][0] = 9000),
    'v2ScriptInArt' => $withStreet(fn (&$l) => $l['art'][0] = 'assets/decos/groddle/<script>.webp'),
    'v2TwoAvatars' => $withStreet(fn (&$l) => $l['layers'][1]['draw'][] = $l['layers'][2]['draw'][4]),
    'v1WithLayers' => $withStreet(fn (&$l) => $l['v'] = 1),
    'v3' => $withStreet(fn (&$l) => $l['v'] = 3),
    'v2TooBig' => $withStreet(fn (&$l) => $l['pad'] = str_repeat('x', 170000)),
];
foreach ($streetCases as $name => $layout) {
    $out[$name] = $try($layout);
}
// A street as wide as a home gets (6720 px) holds 1600 draw entries under 160 KB.
$wide = $withStreet(function (&$l): void {
    $l['sw'] = 6720;
    $l['layers'][2]['draw'] = [];
    for ($i = 0; $i < 1590; $i++) {
        $l['layers'][2]['draw'][] = ['a' => $i % 3 === 1 ? 0 : 2, 'x' => ($i * 4) % 6700, 'y' => 300, 'w' => 34, 'h' => 120, 'f' => 1, 'o' => 0.5];
    }
    $l['layers'][1]['draw'] = [];
    // The field and soil run the whole street.
    $l['layers'][2]['draw'][] = ['col' => '#544232', 'x' => 0, 'y' => 357, 'w' => 6720, 'h' => 74];
});
$out['wideBytes'] = strlen(json_encode($wide));

// Split 3x sheets: the frame drawn from its part on high-density screens, the 1x sheet below.
$split = [
    'v' => 1, 'w' => 960, 'h' => 476,
    'art' => ['assets/sprites/mail-npc/fake_left.png'],
    'draw' => [
        ['a' => 0, 'x' => 100, 'y' => 100, 'w' => 50, 'h' => 80, 'c' => [150, 80, 50, 80], 's' => 0],
        ['a' => 0, 'x' => 300, 'y' => 100, 'w' => 60, 'h' => 80, 'c' => [40, 0, 60, 80]],
    ],
    'spots' => [['k' => 'mailbox', 'b' => [100, 100, 50, 80]]],
];
$out['splitSheets'] = HomeLayout::splitSheets($root);
$out['splitFrame'] = HomeLayout::hiresFrame($root, 'assets/sprites/mail-npc/fake_left.png', [150, 80, 50, 80]);
$out['splitSpans'] = HomeLayout::hiresFrame($root, 'assets/sprites/mail-npc/fake_left.png', [40, 0, 60, 80]);
$out['splitNot'] = HomeLayout::hiresFrame($root, 'assets/sprites/rocks/rock_sheet.png', [0, 0, 100, 100]);
$out['splitHtml'] = HomeLayout::render(HomeLayout::accept($split, $root), ['owner' => 'Zz', 'root' => $root, 'avatar' => null]);
// The Mail Dispatcher only its owner sees in the game: a page leaves its art and its name out (HomeLayout::OWNER_ONLY).
$owned = $split;
$owned['spots'] = [['k' => 'dispatcher', 'b' => [100, 100, 50, 80]]];
$out['dispatcherHtml'] = HomeLayout::render(HomeLayout::accept($owned, $root), ['owner' => 'Zz', 'root' => $root, 'avatar' => null]);
if ($game !== null) {
    $out['realSplits'] = HomeLayout::splitSheets($game);
}
$out['wide'] = $try($wide);

echo json_encode($out, JSON_UNESCAPED_SLASHES), "\n";

// Clean up the made-up root.
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $f) {
    $f->isDir() && !$f->isLink() ? rmdir($f->getPathname()) : unlink($f->getPathname());
}
rmdir($root);
