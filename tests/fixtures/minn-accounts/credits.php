<?php
/**
 * Runs the site repo's report credit rules (groddle-afternoon-site
 * src/ReportCredits.php: input, refs, rank; src/ContributeCredits.php: entry,
 * draw) against the engine's classes and prints them as JSON
 * (tests/report-credits.test.js). Pure: no database is opened.
 *
 *   php tests/fixtures/minn-accounts/credits.php <engine public/minn> <groddle-afternoon-site> <totals.json>
 */

declare(strict_types=1);

[, $engine, $extension, $totalsFile] = $argv;
define('ABSPATH', sys_get_temp_dir() . '/');
define('MINN_ENGINE_DIR', $engine);
require $engine . '/src/Minn/Autoloader.php';
Minn\Autoloader::register();
spl_autoload_register(static function (string $class) use ($extension): void {
    $prefix = 'Groddle\\Minn\\';
    if (str_starts_with($class, $prefix) && is_file($file = $extension . '/src/' . substr($class, strlen($prefix)) . '.php')) {
        require $file;
    }
});

use Groddle\Minn\ContributeCredits;
use Groddle\Minn\ReportCredits;

$input = static function (array $body): array {
    try {
        return ReportCredits::input($body);
    } catch (Minn\RestError $e) {
        return ['code' => $e->errorCode, 'status' => $e->status, 'message' => $e->getMessage()];
    }
};

$totals = json_decode((string) file_get_contents($totalsFile), true);

$full = [
    ContributeCredits::entry(['id' => 502, 'points' => 179, 'reports' => 53], 'Friendly', 12, 'friendly', '2026-11-03 10:00:00'),
    ContributeCredits::entry(['id' => 500, 'points' => 34, 'reports' => 8], 'mr <b>granberry</b>', 9, 'mr-granberry', null),
    ContributeCredits::entry(['id' => 517, 'points' => 1, 'reports' => 1], 'calais', 3, 'calais', '2026-11-03 10:00:00'),
    ContributeCredits::entry(['id' => 600, 'points' => 1, 'reports' => 1], '', 7, null, null),
];

echo json_encode([
    'kinds' => ReportCredits::KINDS,
    'cap' => ReportCredits::CAP,
    'excluded' => ReportCredits::EXCLUDED,
    'board' => ReportCredits::BOARD,
    'inputs' => [
        'kind' => $input(['kind' => 'bug_fixed', 'reason' => '  Fixed   the pick. ', 'refs' => ['game abc1234', ' game v0.8.0 ', 'game abc1234', '']]),
        'kindPoints' => $input(['kind' => 'bug_fixed', 'points' => 5, 'reason' => 'Two fixes', 'refs' => 'game a1, game a2']),
        'pointsOnly' => $input(['points' => 2, 'reason' => 'Shipped', 'by' => 'agent']),
        'none' => $input(['kind' => 'none', 'reason' => 'How Glitch worked']),
        'noneWithPoints' => $input(['kind' => 'none', 'points' => 2, 'reason' => 'x']),
        'kindZero' => $input(['kind' => 'bug_fixed', 'points' => 0, 'reason' => 'x']),
        'overCap' => $input(['kind' => 'safety_fix', 'points' => 9, 'reason' => 'x']),
        'stringPoints' => $input(['kind' => 'bug_fixed', 'points' => '3', 'reason' => 'x']),
        'badKind' => $input(['kind' => 'great', 'reason' => 'x']),
        'nothing' => $input(['reason' => 'x']),
        'oddPoints' => $input(['points' => 4, 'reason' => 'x']),
        'noReason' => $input(['kind' => 'bug_fixed', 'reason' => '   ']),
        'badBy' => $input(['kind' => 'bug_fixed', 'reason' => 'x', 'by' => 'robot']),
        'longRef' => $input(['kind' => 'bug_fixed', 'reason' => 'x', 'refs' => [str_repeat('a', 65)]]),
        'manyRefs' => $input(['kind' => 'bug_fixed', 'reason' => 'x', 'refs' => array_map(static fn (int $i): string => "game r{$i}", range(1, 13))]),
        'refObject' => $input(['kind' => 'bug_fixed', 'reason' => 'x', 'refs' => ['a' => 'b']]),
        'longReason' => $input(['kind' => 'bug_fixed', 'reason' => str_repeat('word ', 80)]),
    ],
    'out' => ReportCredits::out(['ticket_id' => '12', 'points' => '4', 'kind' => 'bug_fixed', 'reason' => 'Two bugs', 'refs' => '["game 3cfc9a44d","game v0.8.0"]', 'scored_by' => 'agent', 'scored_at' => '2026-11-03 21:00:00']),
    'rank' => ReportCredits::rank($totals),
    'rank3' => ReportCredits::rank($totals, 3),
    'entries' => [
        'public' => ContributeCredits::entry(['id' => 7, 'points' => 3, 'reports' => 1], 'Ada', 5, 'ada', '2026-11-01 00:00:00'),
        'level4' => ContributeCredits::entry(['id' => 8, 'points' => 3, 'reports' => 1], 'Bo', 4, 'bo', '2026-11-01 00:00:00'),
        'noSlug' => ContributeCredits::entry(['id' => 9, 'points' => 3, 'reports' => 1], 'Cy', 30, null, '2026-11-01 00:00:00'),
        'nameless' => ContributeCredits::entry(['id' => 10, 'points' => 3, 'reports' => 1], '', 30, 'x', null),
    ],
    'drawEmpty' => ContributeCredits::draw([], 'Points <a href="/x/">come</a> from <script>reports</script>.'),
    'drawEmptyWords' => ContributeCredits::draw([], '', 'Be the first.'),
    'drawFull' => ContributeCredits::draw($full, 'How points work.'),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
