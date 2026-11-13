<?php
// Replays the server's testdata/wood-care.json through HomeYard::judge and plotNow.
// php wood-care-replay.php <site dir> <fixture>
declare(strict_types=1);
[$_, $site, $fixture] = $argv;
require "$site/src/HomePool.php";
require "$site/src/HomeYard.php";
use Groddle\Minn\HomeYard as Y;
$cases = json_decode(file_get_contents($fixture), true);
$base = 1800000000000;
$fail = 0;
foreach ($cases as $c) {
    $owner = json_decode(json_encode([
        'systems' => ['home' => ['owned' => true], 'features' => ['homes' => ['cult' => ['items' => [['id' => 2, 'protoClass' => 'proto_patch', 'endClass' => 'patch', 'rx' => 900]]]]]],
        'world' => ['streets' => ['RH_HOME_EXT' => ['features' => ['patches' => ['plots' => [
            'patch:0' => ['stage' => 'tree', 'tree' => ['classId' => 'wood_tree', 'resetAt' => 0, 'grownAt' => 0, 'state' => ['maturity' => $c['maturity']]]],
        ]]]]]],
    ]));
    $waiting = [];
    $clocks = [];
    $n = 0;
    foreach ($c['steps'] as $i => $st) {
        if ($st['expect'] === 'failed') {
            continue; // the visitor's game rolled a failure: no act reaches the site
        }
        $now = $base + $st['at'];
        $key = $st['verb'] . ':patch:0';
        $before = Y::plotNow(Y::storedPlot($owner, 'patch:0'), 'patch:0', $waiting, $now, Y::rules())->tree->state->maturity;
        $j = Y::judge(Y::rules(), $owner, $waiting, [], [], 'tree', 'patch:0', $st['verb'], $now, $clocks[$st['who']] ?? []);
        if (isset($j['why'])) {
            $got = 'not_wanted';
            $want = $st['verb'] === 'pet' ? Y::TEXT_WOOD_PETTED : Y::TEXT_WOOD_WATERED;
            if ($j['text'] !== $want) { echo "BAD TEXT {$c['name']} $i {$j['text']}\n"; $fail++; }
        } else {
            $waiting[] = ['id' => sprintf('yd-%016x', ++$n), 'kind' => 'tree', 'target' => 'patch:0', 'verb' => $st['verb'], 'took' => 0, 'what' => null, 'at_ms' => $now];
            $clocks[$st['who']][$key] = $now;
            $after = Y::plotNow(Y::storedPlot($owner, 'patch:0'), 'patch:0', $waiting, $now, Y::rules())->tree->state->maturity;
            $got = $after > $before ? 'grew' : 'ok';
        }
        if ($got !== $st['expect']) { echo "FAIL {$c['name']} step $i: $got != {$st['expect']}\n"; $fail++; }
    }
    $last = $base + end($c['steps'])['at'];
    $s = Y::plotNow(Y::storedPlot($owner, 'patch:0'), 'patch:0', $waiting, $last, Y::rules())->tree->state;
    $end = ['maturity' => $s->maturity, 'pets' => $s->carePets, 'waters' => $s->careWaters, 'petted' => $s->petted, 'watered' => $s->watered];
    if ($end !== $c['end']) { echo "FAIL END {$c['name']}: " . json_encode($end) . ' != ' . json_encode($c['end']) . "\n"; $fail++; }
}
echo $fail === 0 ? 'ok ' . count($cases) . " cases\n" : "$fail failures\n";
exit($fail ? 1 : 0);
