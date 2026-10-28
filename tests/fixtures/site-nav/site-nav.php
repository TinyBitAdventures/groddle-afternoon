<?php
/**
 * Draws the header from wp_navigation block markup with the site repo's
 * src/SiteNav.php against the engine's classes and prints, per menu file,
 * the parsed links and the header on each page path as JSON, so
 * tests/site-nav-menu.test.js can hold tools/site-nav/apply.mjs to the same
 * bytes.
 *
 *   php tests/fixtures/site-nav/site-nav.php <engine public/minn> <groddle-afternoon-site> <menu.html> <path>...
 */

declare(strict_types=1);

[, $engine, $extension, $menu] = $argv;
$paths = array_slice($argv, 4);
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require_once $extension . '/src/SiteNav.php';

use Groddle\Minn\SiteNav;

$links = SiteNav::parse((string) file_get_contents($menu));
$nav = [];
foreach ($paths as $path) {
    $nav[$path] = SiteNav::nav($links, $path);
}
echo json_encode(['links' => $links, 'nav' => $nav], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
