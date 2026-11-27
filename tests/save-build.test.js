/**
 * G737: each save names the build that wrote it, and a page of a different, older build never
 * writes over a save a newer build stored: the site refuses the write (409 groddle_save_outdated),
 * the multiplayer page stops and asks for a reload, and solo does the same against this browser's
 * save. The same build (two tabs) and a newer one (the first save after a release) always write.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRefuses, pageBuild, saveStampOf } from '../public/js/save-build.js?v=588eae75';
import { createPlayerSave, inspectPlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=2d0e827e';
import { createMultiplayerSaveStore } from '../public/js/save-store.js?v=1ccb1d6b';
import { stamp } from '../tools/deploy/build-id.mjs';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const OLD = { id: 'aaaaaaaaaaaa', at: 1763000000 };
const NEW = { id: 'bbbbbbbbbbbb', at: 1763100000 };
const SAME_TIME_OTHER = { id: 'cccccccccccc', at: 1763100000 };

/** [stored, incoming, refused] */
const CASES = [
  [null, OLD, false],
  [{ id: 'aaaaaaaaaaaa', at: 0 }, null, false],
  [OLD, OLD, false],
  [NEW, NEW, false],
  [OLD, NEW, false],
  [NEW, SAME_TIME_OTHER, false],
  [NEW, OLD, true],
  [NEW, null, true],
  [NEW, { id: 'bbbbbbbbbbbb', at: 0 }, false],
  [NEW, { id: 'dddddddddddd', at: 0 }, true],
];

describe('the build rule', () => {
  it('refuses only a different build older than the stored one', () => {
    for (const [stored, incoming, refused] of CASES) assert.equal(buildRefuses(stored, incoming), refused, JSON.stringify([stored, incoming]));
  });

  it('a page reads its build from the deploy stamp, and an unstamped page names none', () => {
    const html = stamp('<html><head>\n<meta charset="utf-8" />\n</head></html>', 'bbbbbbbbbbbb', 1763100000);
    assert.match(html, /<meta name="groddle-build" content="bbbbbbbbbbbb" data-at="1763100000" \/>/);
    const attrs = Object.fromEntries([...html.matchAll(/(content|data-at)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const doc = { querySelector: () => ({ getAttribute: (k) => attrs[k] ?? null }) };
    assert.deepEqual(pageBuild(doc), NEW);
    assert.equal(pageBuild({ querySelector: () => null }), null);
  });

  it('a solo save carries its build right after the version, and keeps it when read and written again', () => {
    const raw = serializePlayerSave(createPlayerSave({ inventory: { apple: 1 }, build: NEW }));
    assert.match(raw, /^\{"version":\d+,"build":\{"id":"bbbbbbbbbbbb","at":1763100000\},"inventory"/);
    assert.deepEqual(saveStampOf(raw), NEW);
    const again = serializePlayerSave(inspectPlayerSave(raw).save);
    assert.deepEqual(saveStampOf(again), NEW);
    assert.equal(saveStampOf(serializePlayerSave(createPlayerSave({ inventory: {} }))), null, 'an unstamped page writes none');
  });

  it('game.js holds solo saves when this browser\'s save names a newer build, at boot and when another tab writes', () => {
    const game = readFileSync(join(import.meta.dirname, '..', 'public', 'game.js'), 'utf8');
    assert.match(game, /buildRefuses\(saveStampOf\(raw\), PAGE_BUILD\)\)\) holdSaves\('newer'\)/);
    assert.match(game, /addEventListener\('storage'[\s\S]{0,200}buildRefuses\(saveStampOf\(e\.newValue\), PAGE_BUILD\)\) holdSaves\('newer'\)/);
    assert.match(game, /savedAt: Date\.now\(\),\n\s*build: PAGE_BUILD,/);
  });
});

function answer(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

function store({ boot = {}, build = NEW, answers = [] } = {}) {
  const calls = [];
  const states = [];
  const queue = [...answers];
  const scope = {
    document: { documentElement: { dataset: {} } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent(e) { if (e.type === 'groddle:save-state') states.push(e.detail.state); return true; },
  };
  const s = createMultiplayerSaveStore({
    boot: { saveUrl: '/save', version: 2, entries: { playerState: '{}' }, player: { id: 3 }, writer: 'abcdef0123456789', ...boot },
    build,
    scope,
    fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return queue.shift() ?? answer(200, { version: 3 }); },
    timers: { setTimeout: () => 0, clearTimeout: () => {} },
  });
  return { s, calls, states };
}

describe('the multiplayer page and the build', () => {
  it('names its build in every write', async () => {
    const { s, calls } = store({ boot: { build: NEW } });
    s.set('location', 'x');
    await s.flush();
    assert.deepEqual(calls[0].data.build, NEW);
    assert.equal(s.state, 'saved');
  });

  it('a save loaded from a newer build than the page stops it before any write', async () => {
    const { s, calls, states } = store({ boot: { build: NEW }, build: OLD });
    assert.equal(s.state, 'outdated');
    s.set('location', 'x');
    await s.flush();
    await s.takeover();
    await s.retry();
    assert.equal(calls.length, 0);
    assert.deepEqual(states, ['outdated']);
  });

  it('the site refusing an older build stops saving for good and asks for a reload', async () => {
    const { s, calls } = store({ build: OLD, answers: [answer(409, { code: 'groddle_save_outdated', data: { version: 9 } })] });
    s.set('location', 'x');
    assert.equal(await s.flush(), 'outdated');
    s.set('location', 'y');
    await s.flush();
    await s.takeover();
    await s.retry();
    assert.equal(calls.length, 1);
  });

  it('online-boot hands the stored build to the page and says how to carry on', async () => {
    const { bootDataFrom, saveAlertFor } = await import('../public/js/online-boot.js?v=a0f37b71');
    const data = bootDataFrom({
      account: { urls: { api: '/wp-json/groddle/v1/', nonce: '/n' }, nonce: 'n' },
      session: { player: { id: 3 } },
      save: { version: 4, data: { kind: 'groddle-multiplayer', format: 1, build: NEW, entries: {} } },
    });
    assert.deepEqual(data.build, NEW);
    const said = saveAlertFor('outdated', {});
    assert.match(said.body, /newer version/);
    assert.deepEqual(said.buttons.map(([c]) => c), ['load']);
  });
});

describe('the site keeps the build and refuses an older one (SaveShape.php)', () => {
  const hasPhp = HAS_PHP;
  it('agrees with the game on every case, and keeps the build through check, encode and with', { skip: skipWithoutSite || (!hasPhp && 'needs php') }, () => {
    // Minn's Json and RestError as the site uses them (compact JSON, unescaped slashes).
    const code = `namespace Minn {
        class RestError extends \\Exception { public function __construct(string $code, string $message, int $status = 500, mixed $data = null) { parent::__construct($message); } }
        final class Json {
          public static function encode(mixed $v): string { return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); }
          public static function decode(string $s, mixed $or = null): mixed { $v = json_decode($s, true); return $v === null ? $or : $v; }
        }
      }
      namespace {
      require ${JSON.stringify(SITE_DIR)} . '/src/SaveShape.php';
      use Groddle\\Minn\\SaveShape;
      $cases = json_decode(stream_get_contents(STDIN), true);
      $out = ['older' => []];
      foreach ($cases as [$stored, $incoming]) { $out['older'][] = SaveShape::olderBuild($stored === null ? null : SaveShape::build($stored), $incoming === null ? null : SaveShape::build($incoming)); }
      $save = SaveShape::check(['kind' => 'groddle-multiplayer', 'format' => 1, 'build' => ['id' => 'bbbbbbbbbbbb', 'at' => 1763100000], 'entries' => ['playerState' => '{}']], SaveShape::MULTIPLAYER);
      $json = SaveShape::encode(['entries' => ['playerState' => '{"x":1}']] + $save);
      $out['stored'] = SaveShape::buildOf($json);
      $out['with'] = SaveShape::buildOf(SaveShape::encode(SaveShape::with(SaveShape::decode($json), ['playerState' => '{}'])));
      $out['none'] = SaveShape::buildOf(SaveShape::encode(SaveShape::check(['kind' => 'groddle-multiplayer', 'format' => 1, 'build' => ['id' => 'NOT HEX'], 'entries' => []], SaveShape::MULTIPLAYER)));
      echo json_encode($out);
      }`;
    const res = spawnSync(PHP, ['-r', code], { input: JSON.stringify(CASES.map(([a, b]) => [a, b])), encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    const php = JSON.parse(res.stdout);
    CASES.forEach(([stored, incoming, refused], i) => assert.equal(php.older[i], refused, JSON.stringify([stored, incoming])));
    assert.deepEqual(php.stored, NEW, 'stored with the save');
    assert.deepEqual(php.with, NEW, 'kept when the site changes the save itself');
    assert.equal(php.none, null, 'a build that is not one is left off');
  });

  it('the save route checks the build before anything else is decided, and says outdated', { skip: skipWithoutSite }, () => {
    const src = readFileSync(join(SITE_DIR, 'src', 'MultiplayerSave.php'), 'utf8');
    const check = src.indexOf("SaveShape::olderBuild(SaveShape::buildOf((string) $row['data']), $save['build'] ?? null)");
    assert.ok(check > 0 && check < src.indexOf('$did = self::decide('), 'refused before the write rule, takeover included');
    assert.match(src, /'outdated' => new RestError\('groddle_save_outdated', [^)]*, 409, \$data\)/);
    for (const f of ['GardenPayout', 'AdminTeleport', 'PatchPayout', 'MultiplayerSave']) {
      assert.doesNotMatch(readFileSync(join(SITE_DIR, 'src', `${f}.php`), 'utf8'), /SaveShape::encode\(\['kind' => \$save->kind/, `${f} keeps the build`);
    }
  });
});
