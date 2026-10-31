<?php
// tests/builder-keys.test.js: runs the site's BuilderKeys::verify against an in-memory stand-in for
// Minn's Db (only the statements BuilderKeys sends), so the replay, window, scope, expiry and rate
// rules are checked without a database. Reads {site, now, key, calls: [{header, method, route, query, body, scope, kind, now?}]}
// on stdin; prints each call's outcome.
declare(strict_types=1);

namespace Minn {
    final class RestError extends \RuntimeException
    {
        public function __construct(public readonly string $errorCode, string $message, public readonly int $status, public readonly array $extra = [])
        {
            parent::__construct($message);
        }
    }

    final class Db
    {
        public array $keys = [];
        public array $nonces = [];
        public function table(string $n): string { return $n; }
        public function row(string $sql, array $p = []): ?array
        {
            if (str_contains($sql, 'FROM groddle_builder_keys WHERE key_id')) {
                return $this->keys[$p[0]] ?? null;
            }
            throw new \LogicException("row: {$sql}");
        }
        public function value(string $sql, array $p = []): int|string|null
        {
            if (preg_match('/^SELECT (COUNT\(\*\)|MIN\(at\)) FROM groddle_builder_nonces WHERE key_id = \? AND kind = \? AND at >= \?$/', $sql, $m)) {
                $hits = array_filter($this->nonces, fn ($n) => $n['key_id'] === $p[0] && $n['kind'] === $p[1] && $n['at'] >= $p[2]);
                return $m[1] === 'COUNT(*)' ? count($hits) : (min(array_column($hits, 'at') ?: [null]));
            }
            throw new \LogicException("value: {$sql}");
        }
        public function execute(string $sql, array $p = []): int
        {
            if (str_starts_with($sql, 'DELETE FROM groddle_builder_nonces WHERE at < ?')) {
                $before = count($this->nonces);
                $this->nonces = array_filter($this->nonces, fn ($n) => $n['at'] >= $p[0]);
                return $before - count($this->nonces);
            }
            if (str_starts_with($sql, 'INSERT IGNORE INTO groddle_builder_nonces')) {
                $k = $p[0] . '/' . $p[1];
                if (isset($this->nonces[$k])) {
                    return 0;
                }
                $this->nonces[$k] = ['key_id' => $p[0], 'nonce' => $p[1], 'kind' => $p[2], 'at' => $p[3]];
                return 1;
            }
            if (str_starts_with($sql, 'UPDATE groddle_builder_keys SET last_used_at')) {
                return 1;
            }
            throw new \LogicException("execute: {$sql}");
        }
    }
}

namespace {
    $in = json_decode(stream_get_contents(STDIN), true);
    require $in['site'] . '/src/BuilderKeys.php';
    $db = new Minn\Db();
    $db->keys[$in['key']['key_id']] = $in['key'];
    $keys = new Groddle\Minn\BuilderKeys($db);
    $out = [];
    foreach ($in['calls'] as $c) {
        try {
            $k = $keys->verify($in['master'], $c['header'], $c['method'], $c['route'], $c['query'] ?? [], $c['body'] ?? '', $c['scope'], $c['kind'] ?? 'read', $c['now'] ?? $in['now']);
            $out[] = ['ok' => true, 'key' => $k['id']];
        } catch (Minn\RestError $e) {
            $out[] = ['ok' => false, 'status' => $e->status, 'code' => $e->errorCode, 'reason' => $e->extra['reason'] ?? null];
        }
    }
    echo json_encode($out);
}
