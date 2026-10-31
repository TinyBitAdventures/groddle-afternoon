/**
 * LEVEL BUILDER P4 (spec 8.4, 12, 13): builder keys and signed calls. The CLI's signer
 * (tools/builder/sign.mjs) and the site's (groddle-afternoon-site src/BuilderKeys.php,
 * src/BuilderWorker.php) are held to the same bytes with shared vectors, as ServiceCall's tests do
 * for the realtime server; the site's verify is run on an in-memory Db (tests/fixtures/builder/
 * keys-harness.php) for the window, the nonce memory, scopes, expiry, revocation and the rate limits;
 * the worker refuses unsigned, stale and replayed calls; and no key reaches a route outside the
 * builder's (admin/give among them).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { SITE_DIR, GAME_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { message, signKey, keySecret, workerSecret, signWorker, verifyWorker, canonicalQuery, parseKey, parseEnv, rfc3986 } from '../tools/builder/sign.mjs';
import { SCOPES, RATES, RENDER } from '../tools/builder/limits.mjs';
import { createWorker } from '../tools/builder/worker.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const MASTER = 'a'.repeat(16) + '0123456789abcdef0123456789abcdef';
const KEY_ID = '0f1e2d3c4b5a6978';
const CREATED = '2026-10-31 09:15:00';
const NONCE = '1234567890abcdef';
const AT = 1793438100;
const VECTORS = [
  { method: 'POST', route: '/groddle/v1/admin/builder/drafts/mossy-hollow/ops', query: '', body: '{"ops":[{"op":"zone.set","set":{"title":"Mossy Hollow"}}],"note":"cli"}' },
  { method: 'GET', route: '/groddle/v1/admin/builder/drafts/mossy-hollow/render.png', query: 'street=lane&scale=0.25&overlay=geometry,reach,findings,grid&view=full', body: '' },
  { method: 'get', route: '/groddle/v1/admin/builder/decos', query: { q: "bush (tall) it's!", limit: '3', layer: 'middleground', rest_route: '/x' }, body: '' },
  { method: 'DELETE', route: '/groddle/v1/admin/builder/drafts/a-b-c', query: 'b=2&a=1&a=0', body: '' },
];

describe('builder keys: the CLI and the site sign the same bytes', () => {
  it('canonical query: sorted pairs, RFC 3986 parts, rest_route left out', () => {
    assert.equal(canonicalQuery('b=2&a=1&a=0'), 'a=0&a=1&b=2');
    assert.equal(canonicalQuery({ q: "bush (tall) it's!", rest_route: '/x' }), 'q=bush%20%28tall%29%20it%27s%21');
    assert.equal(canonicalQuery(''), '');
    assert.equal(rfc3986('a,b'), 'a%2Cb');
  });

  it('a key header is <key id>.<seconds>.<nonce>.<base64url HMAC> over the documented message', () => {
    const secret = keySecret(MASTER, KEY_ID, CREATED);
    assert.match(secret, /^[0-9a-f]{64}$/);
    assert.equal(secret, createHmac('sha256', MASTER).update(`groddle-builder-key/1\n${KEY_ID}\n${CREATED}`).digest('hex'));
    const v = VECTORS[0];
    const h = signKey({ keyId: KEY_ID, secret, method: v.method, route: v.route, query: v.query, body: v.body, at: AT, nonce: NONCE });
    assert.match(h, /^[0-9a-f]{16}\.\d+\.[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
    assert.equal(message('post', v.route, '', AT, NONCE, v.body).split('\n').slice(0, 6).join('|'), `groddle-builder/1|POST|${v.route}||${AT}|${NONCE}`);
  });

  it('the site signs every vector to the same header (php)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
    const secret = keySecret(MASTER, KEY_ID, CREATED);
    const php = `require ${JSON.stringify(SITE_DIR)} . '/src/BuilderKeys.php'; require ${JSON.stringify(SITE_DIR)} . '/src/BuilderWorker.php';
      use Groddle\\Minn\\{BuilderKeys, BuilderWorker};
      $in = json_decode(stream_get_contents(STDIN), true); $out = ['secret' => BuilderKeys::secretFor($in['master'], $in['key'], $in['created']), 'worker' => BuilderWorker::secret($in['master']), 'headers' => [], 'workerHeaders' => []];
      foreach ($in['vectors'] as $v) { $q = []; if (is_string($v['query'])) { parse_str($v['query'], $q); } else { $q = $v['query']; }
        $out['headers'][] = BuilderKeys::sign($in['key'], $out['secret'], $v['method'], $v['route'], $v['pairs'] ?? $q, $in['at'], $in['nonce'], $v['body']);
        $out['workerHeaders'][] = BuilderWorker::sign($v['method'], $v['route'], $in['at'], $in['nonce'], $v['body'], $out['worker']); }
      echo json_encode($out);`;
    // PHP's parse_str keeps one value a name; a repeated name is sent as pairs (a=0&a=1 comes in as the list the router builds).
    const vectors = VECTORS.map((v) => (v.query === 'b=2&a=1&a=0' ? { ...v, query: 'b=2&a=1', pairs: { b: '2', a: '1' } } : v));
    const out = JSON.parse(execFileSync('php', ['-r', php], { input: JSON.stringify({ master: MASTER, key: KEY_ID, created: CREATED, at: AT, nonce: NONCE, vectors }) }).toString());
    assert.equal(out.secret, secret);
    assert.equal(out.worker, workerSecret(MASTER));
    vectors.forEach((v, i) => {
      assert.equal(out.headers[i], signKey({ keyId: KEY_ID, secret, method: v.method, route: v.route, query: v.query, body: v.body, at: AT, nonce: NONCE }), `key vector ${i}`);
      assert.equal(out.workerHeaders[i], signWorker({ secret: workerSecret(MASTER), method: v.method, route: v.route, body: v.body, at: AT, nonce: NONCE }), `worker vector ${i}`);
    });
  });

  it('a key line and builder.env parse', () => {
    assert.deepEqual(parseKey(`${KEY_ID}.${'c'.repeat(64)}`), { keyId: KEY_ID, secret: 'c'.repeat(64) });
    assert.equal(parseKey('nope'), null);
    assert.deepEqual(parseEnv('# x\nGRODDLE_BUILDER_URL=https://groddle.localhost\nexport GRODDLE_BUILDER_KEY="k.v"\n'), { GRODDLE_BUILDER_URL: 'https://groddle.localhost', GRODDLE_BUILDER_KEY: 'k.v' });
  });
});

describe('the site refuses a stale, replayed, forged or out-of-scope key (BuilderKeys::verify)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  const secret = keySecret(MASTER, KEY_ID, CREATED);
  const route = '/groddle/v1/admin/builder/drafts/mossy-hollow/ops';
  const body = '{"ops":[]}';
  const key = { key_id: KEY_ID, label: 'test', scopes: 'drafts:read drafts:write validate', created_by: 1, created_at: CREATED, expires_at: '2026-11-30 09:15:00', revoked_at: null };
  const sign = (o = {}) => signKey({ keyId: KEY_ID, secret, method: 'POST', route, body, at: AT, ...o });
  const run = (calls, extra = {}) => JSON.parse(execFileSync('php', [join(GAME_DIR, 'tests/fixtures/builder/keys-harness.php')], { input: JSON.stringify({ site: SITE_DIR, master: MASTER, now: AT, key: { ...key, ...extra }, calls }) }).toString());
  const call = (header, o = {}) => ({ header, method: 'POST', route, body, scope: 'drafts:write', kind: 'write', ...o });

  it('takes a good call once; the same nonce again is a replay', () => {
    const h = sign({ nonce: NONCE });
    const [a, b] = run([call(h), call(h)]);
    assert.deepEqual(a, { ok: true, key: KEY_ID });
    assert.deepEqual(b, { ok: false, status: 401, code: 'builder_key_refused', reason: 'replay' });
  });

  it('refuses a call signed more than 60 s from the site clock, either side', () => {
    const r = run([call(sign({ at: AT - 61, nonce: 'aaaaaaaaaaaaaaa1' })), call(sign({ at: AT + 61, nonce: 'aaaaaaaaaaaaaaa2' })), call(sign({ at: AT - 60, nonce: 'aaaaaaaaaaaaaaa3' }))]);
    assert.deepEqual(r.map((x) => x.reason ?? 'ok'), ['stale', 'stale', 'ok']);
  });

  it('refuses a changed body, route, method or query, and a wrong secret', () => {
    const h = sign({ nonce: 'bbbbbbbbbbbbbbb1' });
    const r = run([
      call(h, { body: '{"ops":[1]}' }),
      call(h, { route: '/groddle/v1/admin/builder/drafts/other/ops' }),
      call(h, { method: 'PUT' }),
      call(h, { query: { x: '1' } }),
      call(signKey({ keyId: KEY_ID, secret: 'f'.repeat(64), method: 'POST', route, body, at: AT, nonce: 'bbbbbbbbbbbbbbb2' })),
      call('nonsense'),
    ]);
    assert.deepEqual(r.map((x) => x.reason), ['signature', 'signature', 'signature', 'signature', 'signature', 'shape']);
  });

  it('a scope the key lacks is 403 builder_key_scope; revoked and expired keys are refused', () => {
    const [scope] = run([call(sign({ method: 'POST', nonce: 'ccccccccccccccc1' }), { scope: 'render', kind: 'render' })]);
    assert.equal(scope.status, 403);
    assert.equal(scope.code, 'builder_key_scope');
    assert.equal(run([call(sign({ nonce: 'ccccccccccccccc2' }))], { revoked_at: '2026-10-31 09:00:00' })[0].reason, 'revoked');
    assert.equal(run([call(sign({ nonce: 'ccccccccccccccc3' }))], { expires_at: '2026-10-31 09:00:00' })[0].reason, 'expired');
    assert.equal(run([call(sign({ nonce: 'ccccccccccccccc4' }))], { key_id: 'ffffffffffffffff' })[0].reason, 'unknown');
  });

  it('rate limits per key: the 61st validate in a minute is 429, reads are not limited', () => {
    const calls = [];
    for (let i = 0; i < 61; i += 1) calls.push(call(sign({ nonce: (1000 + i).toString(16).padStart(16, '0') }), { scope: 'validate', kind: 'validate' }));
    for (let i = 0; i < 70; i += 1) calls.push(call(sign({ nonce: (5000 + i).toString(16).padStart(16, '0') }), { scope: 'drafts:read', kind: 'read' }));
    const r = run(calls);
    assert.equal(r.slice(0, 60).filter((x) => x.ok).length, 60);
    assert.equal(r[60].status, 429);
    assert.equal(r[60].code, 'builder_rate_limited');
    assert.equal(r.slice(61).filter((x) => x.ok).length, 70);
  });
});

describe('the builder worker takes only the site\'s signed calls', () => {
  const secret = workerSecret(MASTER);
  const handlers = { guide: () => ({ ok: 1 }), validate: () => ({}), render: () => ({}), decos: () => ({}), style: () => ({}) };
  const start = () => new Promise((resolve) => {
    const server = createWorker({ secret, handlers });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  const post = (port, header, body = '{}') => fetch(`http://127.0.0.1:${port}/guide`, { method: 'POST', headers: header ? { 'X-Groddle-Worker': header } : {}, body }).then(async (r) => ({ status: r.status, json: await r.json() }));

  it('answers a signed call once, and refuses unsigned, stale, forged and replayed ones', async () => {
    const server = await start();
    const { port } = server.address();
    try {
      const good = signWorker({ secret, method: 'POST', route: '/guide', body: '{}' });
      assert.equal((await post(port, good)).status, 200);
      assert.equal((await post(port, good)).json.data.reason, 'replay');
      assert.equal((await post(port, null)).json.data.reason, 'shape');
      assert.equal((await post(port, signWorker({ secret, method: 'POST', route: '/guide', body: '{}', at: Math.floor(Date.now() / 1000) - 120 }))).json.data.reason, 'stale');
      assert.equal((await post(port, signWorker({ secret: 'x'.repeat(64), method: 'POST', route: '/guide', body: '{}' }))).json.data.reason, 'signature');
      assert.equal((await post(port, signWorker({ secret, method: 'POST', route: '/guide', body: '{}' }), '{"a":1}')).json.data.reason, 'signature');
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
    } finally {
      server.close();
    }
  });

  it('verifyWorker keeps the 60 s window', () => {
    const now = 2_000_000_000;
    const h = signWorker({ secret, method: 'POST', route: '/render', body: 'x', at: now - 60 });
    assert.equal(verifyWorker(h, { secret, method: 'POST', route: '/render', body: 'x', now }).ok, true);
    assert.equal(verifyWorker(h, { secret, method: 'POST', route: '/render', body: 'x', now: now + 1 }).reason, 'stale');
  });
});

describe('keys stay inside the builder (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath(f), 'utf8');
  const files = ['AdminBuilder.php', 'AdminBuilderAssets.php', 'AdminBuilderKeys.php', 'AdminBuilderAgent.php'];

  it('only BuilderAuth reads the key header, and only builder routes call BuilderAuth', () => {
    for (const f of readdirSync(join(SITE_DIR, 'src')).filter((x) => x.endsWith('.php'))) {
      const s = src(`src/${f}`);
      if (f !== 'BuilderAuth.php' && f !== 'BuilderKeys.php') assert.ok(!/BuilderKeys::HEADER|x-groddle-builder/i.test(s), `${f} reads the key header`);
      if (/new BuilderAuth\(/.test(s)) assert.ok(files.includes(f), `${f} uses the builder gate`);
    }
    // admin/give and every other console route keep the session policy; a key there is a signed-out caller.
    const console = src('src/AdminConsole.php');
    assert.match(console, /admin\/give/);
    assert.ok(!/BuilderAuth|BuilderKeys/.test(console));
    assert.match(console, /Policy\(Access::Cap, self::ADMIN\)/);
  });

  it('every builder route is gated first: its scope, or the session only for keys, the play bundle and purge', () => {
    for (const f of files) {
      const s = src(`src/${f}`);
      const routes = [...s.matchAll(/#\[Route\(Method::(\w+), self::BASE \. '([^']+)', policy: new Policy\(([^)]*)\)\)\]\s*public function (\w+)\(/g)];
      assert.ok(routes.length >= 3, f);
      for (const [, , path, policy, fn] of routes) {
        assert.equal(policy, 'Access::Public', `${f} ${path}`);
        const body = s.slice(s.indexOf(`public function ${fn}(`));
        const head = body.slice(0, body.indexOf('{') + 140);
        assert.match(head, /\$this->gate\(\$request/, `${f} ${fn} gates first`);
      }
    }
    assert.match(src('src/AdminBuilderKeys.php'), /return \(new BuilderAuth\(\$this->minn\)\)->gate\(\$request, null\);/);
    assert.match(src('src/AdminBuilder.php'), /public function play\(Request \$request, string \$id\): Response\s*\{\s*\$this->gate\(\$request, null\);/);
    const auth = src('src/BuilderAuth.php');
    assert.match(auth, /builder_key_scope/);
    assert.match(auth, /can\(\$user->id, 'manage_options'\)/);
    assert.ok(auth.indexOf('AdminBuilder::enabled') < auth.indexOf('header(BuilderKeys::HEADER)'), 'the option first');
  });

  it('the scopes, rates and render limits match the tools', () => {
    const keys = src('src/BuilderKeys.php');
    assert.match(keys, new RegExp(`SCOPES = \\[${SCOPES.map((s) => `'${s}'`).join(', ')}\\]`));
    assert.match(keys, new RegExp(`RATES = \\['write' => ${RATES.write}, 'render' => ${RATES.render}, 'validate' => ${RATES.validate}\\]`));
    assert.match(keys, /WINDOW = 60;/);
    assert.match(keys, /NONCE_KEEP = 120;/);
    assert.match(keys, /DEFAULT_DAYS = 30;/);
    assert.match(src('src/AdminBuilderAgent.php'), new RegExp(`OVERLAYS = \\[${RENDER.overlays.map((s) => `'${s}'`).join(', ')}\\]`));
    const manifest = JSON.parse(src('minn.json'));
    assert.deepEqual(manifest.tables.groddle_builder_keys.map((l) => l.split(' ')[0]).slice(0, 8), ['key_id', 'label', 'scopes', 'created_by', 'created_at', 'expires_at', 'last_used_at', 'revoked_at']);
    assert.ok(manifest.tables.groddle_builder_nonces.includes('PRIMARY KEY  (key_id,nonce)'));
    for (const call of ['validate', 'render', 'decos', 'style', 'guide']) assert.ok(manifest.needs.http.includes(`http://127.0.0.1:8794/${call}`), call);
    assert.ok(!manifest.tables.groddle_builder_keys.some((l) => /secret/.test(l)), 'the database never holds a secret');
  });
});
