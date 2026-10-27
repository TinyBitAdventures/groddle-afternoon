<?php
/**
 * Runs the site repo's src/SnapImage.php and Snaps' input checks
 * (groddle-afternoon-site) against the engine's classes and prints one
 * outcome per case as JSON (tests/g332-snaps-mp.test.js). Pictures are made
 * here with GD; hostile ones by hand.
 *
 *   php tests/fixtures/snaps/snap-image.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/ProfilePng.php';
require $extension . '/src/SnapImage.php';
require $extension . '/src/Snaps.php';

use Groddle\Minn\SnapImage;
use Groddle\Minn\Snaps;

$try = static function (Closure $run): string {
    try {
        return 'ok:' . $run();
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};
$picture = static function (string $type, int $w, int $h): string {
    $im = imagecreatetruecolor($w, $h);
    imagefilledrectangle($im, 0, 0, $w, $h, imagecolorallocate($im, 120, 190, 230));
    imagefilledellipse($im, intdiv($w, 2), intdiv($h, 2), intdiv($w, 3), intdiv($h, 3), imagecolorallocate($im, 240, 160, 60));
    ob_start();
    $type === 'png' ? imagepng($im) : ($type === 'gif' ? imagegif($im) : imagejpeg($im, null, 80));
    return (string) ob_get_clean();
};
$accept = static function (string $bytes, string $prefix = '') use ($try): string {
    return $try(static function () use ($bytes, $prefix): string {
        $out = SnapImage::accept($prefix . base64_encode($bytes));
        $size = getimagesizefromstring($out['bytes']);
        $clean = !str_contains($out['bytes'], '<?php') && !str_contains($out['bytes'], 'Exif');
        return "{$out['width']}x{$out['height']}:" . ($size['mime'] ?? '?') . ':' . ($clean ? 'clean' : 'dirty');
    });
};

$jpeg = $picture('jpeg', 960, 540);
$png = $picture('png', 960, 540);
// A JPEG with a comment segment carrying PHP right after SOI (a polyglot): kept only as GD's new pixels.
$poly = "\xFF\xD8" . "\xFF\xFE" . pack('n', 2 + 30) . str_pad('<?php system($_GET[1]); ?>', 30) . substr($jpeg, 2);
// A PNG header that claims 30000x30000: refused before anything decodes it.
$ihdr = pack('NNCCCCC', 30000, 30000, 8, 2, 0, 0, 0);
$bigPng = "\x89PNG\r\n\x1a\n" . pack('N', 13) . 'IHDR' . $ihdr . pack('N', crc32('IHDR' . $ihdr)) . pack('N', 0) . 'IDAT' . pack('N', crc32('IDAT')) . pack('N', 0) . 'IEND' . pack('N', crc32('IEND'));
// The same for a JPEG frame header (SOF0 32000x32000).
$bigJpeg = "\xFF\xD8" . "\xFF\xC0" . pack('n', 17) . pack('CnnC', 8, 32000, 32000, 3) . str_repeat("\x01\x11\x00", 3) . "\xFF\xDA" . pack('n', 12) . str_repeat("\x00", 10) . str_repeat("\x55", 200) . "\xFF\xD9";

echo json_encode([
    'jpeg' => $accept($jpeg),
    'png' => $accept($png),
    'pngAsJpegDataUrl' => $accept($png, 'data:image/jpeg;base64,'),
    'jpegAsPngDataUrl' => $accept($jpeg, 'data:image/png;base64,'),
    'polyglot' => $accept($poly),
    'gif' => $accept($picture('gif', 960, 540)),
    'html' => $accept('<html><script>alert(1)</script>' . str_repeat(' ', 200) . '</html>'),
    'phpInJpegClothes' => $accept("\xFF\xD8\xFF" . str_repeat('<?php ?>', 40) . "\xFF\xD9"),
    'truncatedJpeg' => $accept(substr($jpeg, 0, intdiv(strlen($jpeg), 2))),
    'trailingJunk' => $accept($jpeg . '<?php echo 1; ?>'),
    'tooSmall' => $accept($picture('jpeg', 200, 100)),
    'tooWide' => $accept($picture('jpeg', 2400, 600)),
    'bigPngHeader' => $accept($bigPng),
    'bigJpegHeader' => $accept($bigJpeg),
    'tooManyBytes' => $try(static fn () => (string) count(SnapImage::accept(base64_encode(str_repeat("\xFF", SnapImage::MAX_BYTES + 10))))),
    'notBase64' => $try(static fn () => (string) count(SnapImage::accept('%%%not base64%%%'))),
    'empty' => $try(static fn () => (string) count(SnapImage::accept(''))),
    'notString' => $try(static fn () => (string) count(SnapImage::accept(['x']))),
    'caption' => $try(static fn () => Snaps::caption("  Over the\n moon\t:)\u{0007} ")),
    'captionLong' => $try(static fn () => Snaps::caption(str_repeat('a', Snaps::CAPTION_MAX + 1))),
    'captionNotText' => $try(static fn () => Snaps::caption(12)),
    'street' => $try(static fn () => Snaps::street('LLI32G3NUTD100I')),
    'streetPrivate' => $try(static fn () => Snaps::street('HOME_57')),
    'streetEmpty' => $try(static fn () => Snaps::street('')),
    'streetPath' => $try(static fn () => Snaps::street('../../wp-config')),
    'url' => Snaps::url('0123456789abcdef01234567.jpg'),
], JSON_UNESCAPED_SLASHES) . "\n";
