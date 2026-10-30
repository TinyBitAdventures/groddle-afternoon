<?php
/**
 * Runs the site repo's src/HomePicture.php (groddle-afternoon-site, the
 * profile's home street: WebP, JPEG or PNG) against the engine's classes
 * with good pictures GD makes and bad ones made by hand, and prints one
 * outcome per case as JSON (tests/profiles.test.js).
 *
 *   php tests/fixtures/profiles/home-picture.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
foreach (['ProfilePng', 'SnapImage', 'HomePicture'] as $class) {
    require_once $extension . "/src/{$class}.php";
}

use Groddle\Minn\HomePicture;

$gd = function_exists('imagecreatetruecolor') && function_exists('imagewebp') && function_exists('imagejpeg') && !empty(gd_info()['WebP Support']);
if (!$gd) {
    echo json_encode(['gd' => 'no']), "\n";
    exit(0);
}

$try = static function (Closure $run): string {
    try {
        $out = $run();
        return is_string($out) ? 'ok:' . $out : 'ok';
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};

/** A street-like picture (sky, ground, stripes) w x h, as GD writes it in $format. */
$make = static function (int $w, int $h, string $format, int $quality = 85): string {
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, (int) imagecolorallocate($im, 0x8e, 0xc8, 0xe8));
    imagefilledrectangle($im, 0, (int) ($h * 0.7), $w, $h, (int) imagecolorallocate($im, 0x5a, 0x3a, 0x22));
    for ($x = 0; $x < $w; $x += 37) {
        imagefilledrectangle($im, $x, (int) ($h * 0.3), $x + 9, (int) ($h * 0.7), (int) imagecolorallocate($im, ($x * 7) % 255, 0x90, 0x40));
    }
    ob_start();
    match ($format) {
        'webp' => imagewebp($im, null, $quality),
        'jpeg' => imagejpeg($im, null, $quality),
        'png' => imagepng($im, null, 6),
    };
    return (string) ob_get_clean();
};
$chunk = static fn (string $type, string $data): string => $type . pack('V', strlen($data)) . $data . (strlen($data) % 2 ? "\0" : '');
$riff = static fn (string $body): string => 'RIFF' . pack('V', 4 + strlen($body)) . 'WEBP' . $body;
/** The VP8 / VP8L chunk inside a simple WebP GD wrote. */
$imageChunk = static function (string $webp): string {
    $at = 12;
    while ($at + 8 <= strlen($webp)) {
        $type = substr($webp, $at, 4);
        $size = unpack('V', substr($webp, $at + 4, 4))[1];
        if ($type === 'VP8 ' || $type === 'VP8L') {
            return substr($webp, $at, 8 + $size + ($size & 1));
        }
        $at += 8 + $size + ($size & 1);
    }
    throw new RuntimeException('no image chunk');
};
/** A VP8X chunk: flags and the canvas size. */
$vp8x = static function (int $flags, int $w, int $h) use ($chunk): string {
    $le24 = static fn (int $n): string => chr($n & 0xff) . chr(($n >> 8) & 0xff) . chr(($n >> 16) & 0xff);
    return $chunk('VP8X', chr($flags) . "\0\0\0" . $le24($w - 1) . $le24($h - 1));
};
$b64 = static fn (string $bytes): string => base64_encode($bytes);
/** What accept kept: type, size, bytes, the phone copy's size, and the kept file read back. */
$kept = static function (array $r): string {
    [$format, $w, $h] = HomePicture::read($r['bytes']);
    $small = $r['small'] === null ? 'none' : (static function (string $s, int $sw, int $sh): string {
        [$f, $w, $h] = HomePicture::read($s);
        return "{$sw}x{$sh}:{$f}:{$w}x{$h}";
    })($r['small'], $r['smallWidth'], $r['smallHeight']);
    return "{$r['type']}:{$r['width']}x{$r['height']}:{$format}:{$w}x{$h}:small={$small}";
};

$webp = $make(1920, 1002, 'webp');
$jpeg = $make(1920, 1002, 'jpeg');
$png = $make(1920, 1002, 'png');
$vp8 = $imageChunk($webp);
$exif = $riff($vp8x(0x08, 1920, 1002) . $vp8 . $chunk('EXIF', 'Exif' . "\0\0" . 'GroddleSecretCamera'));
$wrongCanvas = $riff($vp8x(0x00, 1000, 500) . $vp8);
$animated = $riff($vp8x(0x02, 1920, 1002) . $vp8);
$anim = $riff($vp8x(0x00, 1920, 1002) . $chunk('ANIM', str_repeat("\0", 6)) . $vp8);
$unknown = $riff($vp8x(0x00, 1920, 1002) . $vp8 . $chunk('ZZZZ', 'hello'));
$twoImages = $riff($vp8 . $vp8);
$appended = $webp . '<?php echo 1; ?>';
$riffLies = substr_replace($webp, pack('V', strlen($webp)), 4, 4);
$wave = 'RIFF' . pack('V', 200) . 'WAVE' . str_repeat("\0", 200);

$out = [
    'gd' => 'yes',
    'gd writes webp' => HomePicture::gdWritesWebp() ? 'yes' : 'no',
    'sizes' => strlen($webp) . ',' . strlen($jpeg) . ',' . strlen($png),
    'webp 1920' => $try(static fn () => $kept(HomePicture::accept($b64($webp)))),
    'webp data url' => $try(static fn () => $kept(HomePicture::accept('data:image/webp;base64,' . $b64($webp)))),
    'jpeg 1920' => $try(static fn () => $kept(HomePicture::accept($b64($jpeg)))),
    'png 1920' => $try(static fn () => $kept(HomePicture::accept($b64($png)))),
    'png 960 (the old game)' => $try(static fn () => $kept(HomePicture::accept($b64($make(960, 501, 'png'))))),
    'jpeg said to be png' => $try(static fn () => $kept(HomePicture::accept('data:image/png;base64,' . $b64($jpeg)))),
    'webp lossless (VP8L)' => $try(static fn () => $kept(HomePicture::accept($b64($make(1280, 668, 'webp', defined('IMG_WEBP_LOSSLESS') ? IMG_WEBP_LOSSLESS : 101))))),
    'webp 1920x1080' => $try(static fn () => $kept(HomePicture::accept($b64($make(1920, 1080, 'webp'))))),
    'exif is dropped' => $try(static function () use ($exif, $b64): string {
        $r = HomePicture::accept($b64($exif));
        return str_contains($r['bytes'], 'GroddleSecretCamera') || str_contains($r['bytes'], 'EXIF') ? 'kept' : 'dropped';
    }),
    // Wrong magic.
    'gif' => $try(static fn () => HomePicture::accept($b64('GIF89a' . str_repeat("\0", 300)))),
    'gif data url' => $try(static fn () => HomePicture::accept('data:image/gif;base64,' . $b64($webp))),
    'svg data url' => $try(static fn () => HomePicture::accept('data:image/svg+xml;base64,' . $b64('<svg/>'))),
    'html' => $try(static fn () => HomePicture::accept($b64('<html><script>alert(1)</script></html>' . str_repeat(' ', 40)))),
    'riff wave' => $try(static fn () => HomePicture::accept($b64($wave))),
    'not a string' => $try(static fn () => HomePicture::accept(['x'])),
    'not base64' => $try(static fn () => HomePicture::accept('***')),
    // Too big.
    'too many bytes' => $try(static fn () => HomePicture::accept($b64($webp . str_repeat("\0", HomePicture::MAX_BYTES)))),
    // Wrong dimensions, read from the headers.
    'too wide' => $try(static fn () => HomePicture::accept($b64($make(2000, 900, 'webp')))),
    'too tall' => $try(static fn () => HomePicture::accept($b64($make(1920, 1200, 'jpeg')))),
    'too small' => $try(static fn () => HomePicture::accept($b64($make(200, 60, 'png')))),
    'vp8x canvas is not the image' => $try(static fn () => HomePicture::accept($b64($wrongCanvas))),
    // Crafted WebP structure.
    'animated flag' => $try(static fn () => HomePicture::accept($b64($animated))),
    'anim chunk' => $try(static fn () => HomePicture::accept($b64($anim))),
    'unknown chunk' => $try(static fn () => HomePicture::accept($b64($unknown))),
    'two images' => $try(static fn () => HomePicture::accept($b64($twoImages))),
    'bytes after the riff' => $try(static fn () => HomePicture::accept($b64($appended))),
    'riff size lies' => $try(static fn () => HomePicture::accept($b64($riffLies))),
    'webp cut short' => $try(static fn () => HomePicture::accept($b64(substr($webp, 0, (int) (strlen($webp) / 2))))),
    'vp8 not a key frame' => $try(static fn () => HomePicture::accept($b64(substr_replace($webp, chr(ord($webp[20]) | 1), 20, 1)))),
    // Crafted JPEG and PNG.
    'jpeg cut short' => $try(static fn () => HomePicture::accept($b64(substr($jpeg, 0, -40)))),
    'bytes after the jpeg' => $try(static fn () => HomePicture::accept($b64($jpeg . '<?php echo 1; ?>'))),
    'bytes after the png' => $try(static fn () => HomePicture::accept($b64($png . '<?php echo 1; ?>'))),
];
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
