<?php
/**
 * G1284: the site's src/SnapImage.php limits for a whole-home Snap (taller and larger, asked for
 * with `whole: true`) against an ordinary Snap's, printed as JSON (tests/g1284-whole-house-snap.test.js).
 *
 *   php tests/fixtures/snaps/whole-snap.php <engine public/minn> <groddle-afternoon-site>
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require $extension . '/src/ProfilePng.php';
require $extension . '/src/SnapImage.php';

use Groddle\Minn\SnapImage;

$try = static function (Closure $run): string {
    try {
        return 'ok:' . $run();
    } catch (Minn\RestError $e) {
        return $e->errorCode . ':' . $e->status;
    }
};
$jpeg = static function (int $w, int $h): string {
    $im = imagecreatetruecolor($w, $h);
    imagefilledrectangle($im, 0, 0, $w, $h, imagecolorallocate($im, 120, 190, 230));
    for ($y = 0; $y < $h; $y += 486) {
        imagefilledrectangle($im, 0, $y, $w, $y + 28, imagecolorallocate($im, 90, 70, 50));
    }
    ob_start();
    imagejpeg($im, null, 80);
    return (string) ob_get_clean();
};
$accept = static function (string $bytes, bool $whole) use ($try): string {
    return $try(static function () use ($bytes, $whole): string {
        $out = SnapImage::accept(base64_encode($bytes), $whole);
        return "{$out['width']}x{$out['height']}:" . (strlen($out['bytes']) <= ($whole ? SnapImage::WHOLE_MAX_BYTES : SnapImage::MAX_BYTES) ? 'fits' : 'over') . ':' . ($out['small'] !== null ? 'small' : 'nosmall');
    });
};

$tower = $jpeg(963, 3600);
echo json_encode([
    'limits' => [SnapImage::MAX_W, SnapImage::MAX_H, SnapImage::MAX_BYTES, SnapImage::WHOLE_MAX_H, SnapImage::WHOLE_MAX_BYTES],
    'towerWhole' => $accept($tower, true),
    'towerPlain' => $accept($tower, false),
    'tooTallWhole' => $accept($jpeg(900, 3601), true),
    'tooWideWhole' => $accept($jpeg(1921, 1000), true),
    'viewPlain' => $accept($jpeg(1920, 1200), false),
    'bytesOverWhole' => $try(static fn () => (string) count(SnapImage::accept(base64_encode(str_repeat("\xFF", SnapImage::WHOLE_MAX_BYTES + 10)), true))),
    'bytesOverPlain' => $try(static fn () => (string) count(SnapImage::accept(base64_encode(str_repeat("\xFF", SnapImage::MAX_BYTES + 10)), false))),
], JSON_UNESCAPED_SLASHES) . "\n";
