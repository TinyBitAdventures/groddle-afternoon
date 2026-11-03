<?php
/**
 * Reads the site repo's src/MovedPages.php routes against the engine's
 * classes and prints, for each path (with an optional ?query), the route's
 * answer as JSON: the Location of its 301, null when no route matches, or
 * "miss" when the route declines. tests/items-moved.test.js checks them.
 *
 *   php tests/fixtures/moved-pages/moved-pages.php <engine public/minn> <groddle-afternoon-site> <path>...
 */

declare(strict_types=1);

[, $engine, $extension] = $argv;
$paths = array_slice($argv, 3);
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
require_once $extension . '/src/MovedPages.php';

use Groddle\Minn\MovedPages;
use Minn\Http\Route;
use Minn\Http\RouteMiss;

$routes = [];
foreach ((new ReflectionClass(MovedPages::class))->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
    foreach ($method->getAttributes(Route::class) as $attribute) {
        $route = $attribute->newInstance();
        $routes[] = [$route, $method->getName()];
    }
}
$out = [];
foreach ($paths as $raw) {
    [$path, $q] = array_pad(explode('?', $raw, 2), 2, '');
    parse_str($q, $query);
    $out[$raw] = null;
    foreach ($routes as [$route, $name]) {
        if (!preg_match($route->regex(), $path, $m)) {
            continue;
        }
        $from = explode('/', ltrim($route->pattern, '/'))[0];
        $from = preg_replace('/\{.*$/', '', $from);
        try {
            $out[$raw] = ['method' => $route->method->value, 'name' => $name, 'location' => MovedPages::target($from, (string) ($m['rest'] ?? ''), $query)];
        } catch (RouteMiss) {
            $out[$raw] = 'miss';
        }
        break;
    }
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
