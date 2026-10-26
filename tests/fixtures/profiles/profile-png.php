<?php
/**
 * Runs the site repo's src/ProfilePng.php and the pure parts of
 * src/Profiles.php (groddle-afternoon-site, register G338) against the
 * engine's classes and prints one outcome per case as JSON
 * (tests/profiles.test.js).
 *
 *   php tests/fixtures/profiles/profile-png.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
foreach (['SaveShape', 'Characters', 'MultiplayerSave', 'ProfilePng', 'Profiles'] as $class) {
    require_once $extension . "/src/{$class}.php";
}

use Groddle\Minn\ProfilePng;
use Groddle\Minn\Profiles;

$try = static function (Closure $run): string {
    try {
        $out = $run();
        return is_string($out) ? 'ok:' . $out : 'ok';
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};

/** A PNG of w x h made by hand (one IDAT of zlib'd rows, RGBA): no GD needed. */
$png = static function (int $w, int $h, string $extra = ''): string {
    $chunk = static fn (string $type, string $data): string => pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    $raw = str_repeat("\0" . str_repeat("\x40\x80\x20\xff", $w), $h);
    return "\x89PNG\r\n\x1a\n" . $chunk('IHDR', pack('NNCCCCC', $w, $h, 8, 6, 0, 0, 0)) . $chunk('IDAT', (string) gzcompress($raw)) . $extra . $chunk('IEND', '');
};
$b64 = static fn (string $bytes): string => base64_encode($bytes);
$size = static function (array $r): string {
    [$w, $h] = ProfilePng::read($r['bytes']);
    return "{$r['width']}x{$r['height']}:{$w}x{$h}:" . (str_starts_with($r['bytes'], "\x89PNG") ? 'png' : 'other');
};
$good = $png(344, 496);
$withText = $png(344, 496, pack('N', 6) . 'tEXthello!' . pack('N', crc32('tEXthello!')));
$badCrc = substr_replace($good, "\0\0\0\0", 8 + 8 + 13, 4);

$out = [
    'avatar' => $try(static fn () => $size(ProfilePng::accept('avatar', $b64($good)))),
    'avatar data url' => $try(static fn () => $size(ProfilePng::accept('avatar', 'data:image/png;base64,' . $b64($good)))),
    'tile' => $try(static fn () => $size(ProfilePng::accept('tile', $b64($png(200, 288))))),
    'home' => $try(static fn () => $size(ProfilePng::accept('home', $b64($png(960, 408))))),
    'unknown kind' => $try(static fn () => ProfilePng::accept('banner', $b64($good))),
    'not a string' => $try(static fn () => ProfilePng::accept('avatar', ['x'])),
    'not base64' => $try(static fn () => ProfilePng::accept('avatar', '***')),
    'jpeg data url' => $try(static fn () => ProfilePng::accept('avatar', 'data:image/jpeg;base64,' . $b64($good))),
    'jpeg bytes' => $try(static fn () => ProfilePng::accept('avatar', $b64("\xff\xd8\xff\xe0" . str_repeat('x', 200)))),
    'html' => $try(static fn () => ProfilePng::accept('avatar', $b64('<html><script>alert(1)</script></html>' . str_repeat(' ', 40)))),
    'too wide' => $try(static fn () => ProfilePng::accept('avatar', $b64($png(400, 496)))),
    'too small' => $try(static fn () => ProfilePng::accept('avatar', $b64($png(20, 20)))),
    'home too tall' => $try(static fn () => ProfilePng::accept('home', $b64($png(960, 900)))),
    'bad crc' => $try(static fn () => ProfilePng::accept('avatar', $b64($badCrc))),
    'cut short' => $try(static fn () => ProfilePng::accept('avatar', $b64(substr($good, 0, -6)))),
    'bytes after IEND' => $try(static fn () => ProfilePng::accept('avatar', $b64($good . '<?php echo 1;'))),
    'a text chunk is dropped by the re-encode' => $try(static fn () => str_contains(ProfilePng::accept('avatar', $b64($withText))['bytes'], 'tEXt') ? 'kept' : 'dropped'),
    'too many bytes' => $try(static fn () => ProfilePng::accept('tile', $b64($good . str_repeat("\0", 200 * 1024)))),
    'gd' => function_exists('imagecreatefromstring') ? 'yes' : 'no',
    'about trims and keeps lines' => $try(static fn () => Profiles::about("  Hello\r\nthere\x07\n\n\n\nfriend  ")),
    'about 500' => $try(static fn () => (string) mb_strlen(Profiles::about(str_repeat('é', 500)))),
    'about 501' => $try(static fn () => Profiles::about(str_repeat('a', 501))),
    'about not text' => $try(static fn () => Profiles::about(['a'])),
    'about bad utf8' => $try(static fn () => Profiles::about("\xff\xfe")),
    'slug' => implode(',', array_map(Profiles::slug(...), ['Zz Prof A 12', 'bo-peep', 'Bo_ Peep', '-x-', 'Review Glitch'])),
    'image url' => Profiles::imageUrl(57, 'tile', '2026-10-26 18:00:00'),
];
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
