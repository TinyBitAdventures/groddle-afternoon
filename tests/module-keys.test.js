/**
 * Content keys on the game's modules, scripts and style sheets (tools/module-keys/build.mjs, 2026-10-30).
 * Hand-written `?v=` keys collided at every rebase, went stale (a browser keeps the old module), and two
 * importers with two keys loaded two copies of one module. The builder writes every key from content:
 * a module's key hashes its own text and its imports' keys, so a change re-keys exactly its importer chain.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { keyOf, moduleUrl, plan, resolveKeyConflicts } from '../tools/module-keys/build.mjs';
import { BUILT_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js?v=9ebeb502';
import { ONLINE_BOOT_SRC } from '../tools/play-online/build.mjs';
import { HOOK_SRC } from '../tools/data-versions/build.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

describe('module keys in the tree', () => {
  const current = plan(root);

  it('are current: node tools/module-keys/build.mjs --check (never edit a ?v= by hand)', () => {
    assert.deepEqual(current.problems, []);
    assert.deepEqual(current.stale.map((s) => s.file), [], 'run node tools/module-keys/build.mjs');
  });

  it('load every module under one URL: no module is named with two keys anywhere in public/', () => {
    const urls = new Map();
    const files = execFileSync('git', ['ls-files', 'public'], { cwd: root, encoding: 'utf8' }).split('\n')
      .filter((f) => /\.(?:m?js|html)$/.test(f) && !f.startsWith('public/vendor/'));
    let refs = 0;
    for (const f of files) {
      const text = read(f);
      const base = /\.html$/.test(f) ? /<base href="([^"]+)"/.exec(text)?.[1] || '' : '';
      const dir = join(root, dirname(f), base);
      for (const m of text.matchAll(/([\w./-]+\.(?:m?js|css))\?v=([\w-]+)/g)) {
        const file = join(/^\.{0,2}\//.test(m[1]) || /\.html$/.test(f) ? dir : join(root, 'public'), m[1]);
        if (!existsSync(file)) continue;
        refs += 1;
        if (!urls.has(file)) urls.set(file, new Set());
        urls.get(file).add(m[2]);
      }
    }
    assert.ok(refs > 1500, `${refs} keyed references`);
    const twice = [...urls].filter(([, keys]) => keys.size > 1).map(([f, keys]) => `${f.slice(root.length + 1)}: ${[...keys].join(', ')}`);
    assert.deepEqual(twice, []);
  });

  it('every key is 8 hex: no hand-written tag, round16= or per-lane style sheet parameter is left', () => {
    const game = read('public/game.js');
    assert.match(game, /from '\.\/js\/features\/index\.js\?v=[0-9a-f]{8}';/);
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      const html = read(page);
      assert.match(html, /href="style\.css\?v=[0-9a-f]{8}"/, page);
      assert.match(html, /"game\.js\?v=[0-9a-f]{8}"/, page);
      assert.doesNotMatch(html, /round16=|&amp;backdrop=/, page);
    }
    assert.equal(ONLINE_BOOT_SRC, moduleUrl('js/online-boot.js', root));
    assert.equal(HOOK_SRC, moduleUrl('js/data-urls.js', root));
  });

  it('every built quest room has a written-out loader (a computed import() cannot be keyed)', () => {
    const src = read('public/js/features/quest-instances-feature.js');
    for (const id of BUILT_ROOMS) {
      const file = roomModulePath(id).slice(2);
      assert.match(src, new RegExp(`\\n  ${id}: \\(\\) => import\\('\\.\\./quest-rooms/${file.replace(/\./g, '\\.')}\\?v=${current.keys.get(`js/quest-rooms/${file}`)}'\\),\\n`), id);
    }
    assert.equal((src.match(/^  [a-z0-9_]+: \(\) => import\('\.\.\/quest-rooms\//gm) || []).length, BUILT_ROOMS.length);
  });
});

describe('module keys builder', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'module-keys-'));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const put = (rel, text) => {
    mkdirSync(dirname(join(tmp, rel)), { recursive: true });
    writeFileSync(join(tmp, rel), text);
  };
  const apply = () => {
    const { stale, problems } = plan(tmp);
    for (const s of stale) writeFileSync(join(tmp, s.file), s.text);
    return { files: stale.map((s) => s.file).sort(), problems };
  };
  const git = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8' });
  git('init', '-q');
  // game.js -> a.js -> leaf.js; game.js -> b.js -> other.js; c.js <-> d.js (a cycle) -> leaf.js
  put('public/game.js', "import { a } from './js/a.js?v=g1-1';\nimport { b } from './js/b.js';\nimport('./js/c.js?v=old');\nexport const g = a + b;\n");
  put('public/js/a.js', "import { leaf } from './leaf.js?v=hand-2';\nexport const a = leaf;\n");
  put('public/js/b.js', "/** @param {import('./leaf.js').X} x */\nimport { other } from './other.js';\nexport const b = other;\n");
  put('public/js/c.js', "import { d } from './d.js';\nimport { leaf } from './leaf.js';\nexport const c = () => d;\n");
  put('public/js/d.js', "import { c } from './c.js';\nexport const d = () => c;\n");
  put('public/js/leaf.js', 'export const leaf = 1;\n');
  put('public/js/other.js', 'export const other = 2;\n');
  put('public/style.css', 'body { color: red; }\n');
  put('public/play/index.html', '<base href="../" />\n<link rel="stylesheet" href="style.css?v=feed-1&amp;pmenu=1&amp;backdrop=g432-1" />\n<script src="js/data-versions.js?v=00000000"></script>\n<script type="module">import { a } from \'./js/a.js\';</script>\n<script type="module" src="game.js?v=x&amp;round16=g487-1"></script>\n');
  put('tests/a.test.js', "import { a } from '../public/js/a.js';\nimport { b } from '../public/js/b.js?v=1';\n");

  const first = apply();
  const snapshot = () => Object.fromEntries(['public/game.js', 'public/js/a.js', 'public/js/b.js', 'public/js/c.js', 'public/js/d.js', 'public/play/index.html', 'tests/a.test.js'].map((f) => [f, readFileSync(join(tmp, f), 'utf8')]));
  const before = snapshot();

  it('writes ?v=<8 hex> on every relative import, the page tags and test imports', () => {
    assert.deepEqual(first.problems, []);
    assert.match(before['public/game.js'], /^import \{ a \} from '\.\/js\/a\.js\?v=[0-9a-f]{8}';\nimport \{ b \} from '\.\/js\/b\.js\?v=[0-9a-f]{8}';\nimport\('\.\/js\/c\.js\?v=[0-9a-f]{8}'\);/);
    assert.match(before['public/js/b.js'], /import\('\.\/leaf\.js'\)\.X/, 'a JSDoc import() type in a comment is left alone');
    assert.match(before['public/play/index.html'], /href="style\.css\?v=[0-9a-f]{8}" \/>/);
    assert.match(before['public/play/index.html'], /src="game\.js\?v=[0-9a-f]{8}"/);
    assert.match(before['public/play/index.html'], /js\/data-versions\.js\?v=00000000/, 'data-versions.js is keyed by its own builder');
    assert.match(before['public/play/index.html'], /import \{ a \} from '\.\/js\/a\.js\?v=[0-9a-f]{8}';/, 'inline module scripts too');
    const aKey = /a\.js\?v=([0-9a-f]{8})/.exec(before['public/game.js'])[1];
    assert.ok(before['tests/a.test.js'].includes(`a.js?v=${aKey}'`), 'a test imports the browser\'s URL (one module instance)');
    assert.equal(aKey, keyOf('js/a.js', tmp));
  });

  it('is idempotent: a second run changes nothing', () => {
    assert.deepEqual(apply().files, []);
    assert.deepEqual(snapshot(), before);
  });

  it('re-keys exactly the importer chain of a changed leaf (and the whole cycle it sits under)', () => {
    put('public/js/leaf.js', 'export const leaf = 3;\n');
    const changed = apply().files;
    assert.deepEqual(changed, ['public/game.js', 'public/js/a.js', 'public/js/c.js', 'public/js/d.js', 'public/play/index.html', 'tests/a.test.js']);
    const now = snapshot();
    assert.equal(now['public/js/b.js'], before['public/js/b.js'], 'b.js does not import leaf.js');
    assert.deepEqual(apply().files, []);
  });

  it('refuses a computed import() of a local module', () => {
    put('public/js/rooms.js', 'export const load = (id) => import(`./${id}.js?v=rooms-1`);\n');
    put('public/js/b.js', "import { other } from './other.js';\nimport { load } from './rooms.js';\nexport const b = other;\n");
    const { problems } = plan(tmp);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /public\/js\/rooms\.js: import\(`\.\/\$\{id\}\.js\?v=rooms-1`\) is computed/);
  });
});

describe('module keys --resolve (rebases)', () => {
  it('settles a conflict whose sides differ only in keys, and leaves a real one', () => {
    const text = [
      "import { a } from './a.js?v=11111111';",
      '<<<<<<< HEAD',
      "import { b } from './b.js?v=22222222';",
      "import { c } from './c.js?v=33333333';",
      '=======',
      "import { b } from './b.js?v=44444444';",
      "import { c } from './c.js?v=55555555';",
      '>>>>>>> lane',
      'const x = 1;',
      '<<<<<<< HEAD',
      'const y = 2;',
      '=======',
      'const y = 3;',
      '>>>>>>> lane',
      '',
    ].join('\n');
    const r = resolveKeyConflicts(text);
    assert.equal(r.settled, 1);
    assert.equal(r.left, 1);
    assert.ok(r.text.includes("import { b } from './b.js?v=22222222';\nimport { c } from './c.js?v=33333333';\nconst x = 1;\n<<<<<<< HEAD\n"));
    assert.equal(resolveKeyConflicts("<<<<<<< a\nx?v=12345678\n||||||| base\nx?v=00000000\n=======\nx?v=87654321\n>>>>>>> b\n").text, 'x?v=12345678\n', 'diff3 style too');
  });
});
