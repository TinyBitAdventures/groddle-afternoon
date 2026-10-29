/**
 * Content keys on data and art URLs (2026-10-28). Ruta Asuncion's ladder stayed without art after
 * db23e995 changed seven street JSON files: street-loader.js fetched assets/streets/<tsid>.json with no
 * version and the browser (and Kinsta's CDN, max-age=31536000 on JSON) kept the old copy until a hard
 * refresh. tools/data-versions/build.mjs writes public/js/data-versions.js (a key for each file changed
 * since the epoch commit), and public/js/data-urls.js puts the key on every same-origin data or art
 * fetch and every <img>.src set from script.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import vm from 'node:vm';
import {
  BUILT,
  EXT,
  MAP_PATH,
  buildDataVersions,
  currentEpoch,
  mapPages,
  parseFiles,
  shortHash,
  stalePages,
} from '../tools/data-versions/build.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const HOOK = read('public/js/data-urls.js');

/** A browser-ish global with the map and the hook installed; fetches, <img> attributes and HTML are recorded. */
function browser(mapSource, { scriptSrc = 'https://groddle.test/js/data-versions.js?v=x', baseURI = 'https://groddle.test/' } = {}) {
  const fetched = [];
  class FakeElement {
    constructor() { this.attrs = {}; this.html = ''; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    insertAdjacentHTML(where, html) { this.html += html; }
  }
  Object.defineProperty(FakeElement.prototype, 'innerHTML', {
    configurable: true,
    enumerable: true,
    get() { return this.html; },
    set(v) { this.html = String(v); },
  });
  class FakeImage extends FakeElement {}
  for (const name of ['src', 'srcset']) {
    Object.defineProperty(FakeImage.prototype, name, {
      configurable: true,
      enumerable: true,
      get() { return this.attrs[name] ?? ''; },
      set(v) { this.attrs[name] = String(v); },
    });
  }
  const g = {
    URL,
    Request,
    Element: FakeElement,
    HTMLImageElement: FakeImage,
    document: { baseURI, currentScript: { src: scriptSrc } },
    fetch(input, init) {
      fetched.push({ url: input instanceof Request ? input.url : String(input), method: (init && init.method) || (input instanceof Request ? input.method : 'GET') });
      return Promise.resolve({ ok: true });
    },
  };
  g.globalThis = g;
  const ctx = vm.createContext(g);
  vm.runInContext(mapSource, ctx);
  g.document.currentScript = null;
  vm.runInContext(HOOK, ctx);
  return {
    g,
    fetched,
    FakeElement,
    FakeImage,
    url: (p) => g.groddleDataUrl(p),
    fetch: (p, init) => { g.fetch(p, init); return fetched.at(-1); },
    img: (src) => { const i = new FakeImage(); i.src = src; return i.src; },
  };
}

const mapSource = (files, epoch = 'e0e0e0e0') => [
  '(function (g) {',
  '  var s = g.document && g.document.currentScript;',
  `  g.GRODDLE_DATA_VERSIONS = { root: s && s.src ? new URL('../', s.src).href : '', epoch: '${epoch}', files: ${JSON.stringify(files)} };`,
  '})(globalThis);',
].join('\n');

describe('data-versions map (tools/data-versions/build.mjs)', () => {
  const epoch = currentEpoch(root);
  let hasEpoch = Boolean(epoch);
  if (hasEpoch) {
    try { git(root, 'cat-file', '-e', `${epoch}^{commit}`); } catch { hasEpoch = false; }
  }

  it('public/js/data-versions.js and every page that loads it are current (--check)', { skip: !hasEpoch && 'the epoch commit is not in this clone' }, () => {
    const map = buildDataVersions({ root });
    const current = read(MAP_PATH);
    if (current !== map.source) {
      const old = parseFiles(current);
      const names = [...new Set([...Object.keys(old), ...Object.keys(map.files)])].filter((n) => old[n] !== map.files[n]);
      assert.fail(`${MAP_PATH} is stale (${names.slice(0, 10).join(', ')}): run node tools/data-versions/build.mjs`);
    }
    assert.deepEqual(stalePages(root, map.key).map((p) => p.file), [], 'run node tools/data-versions/build.mjs');
  });

  it('the map leaves out the files built at deploy, and keys only versioned extensions', () => {
    const files = parseFiles(read(MAP_PATH));
    for (const b of BUILT) assert.equal(files[b], undefined, b);
    for (const f of Object.keys(files)) assert.match(f, EXT, f);
  });

  it('the deploy runs it with --built after the restoration and Code builds', () => {
    const deploy = read('tools/deploy/kinsta.sh');
    const at = deploy.indexOf('tools/data-versions/build.mjs --built');
    assert.ok(at > 0, 'kinsta.sh builds the data keys');
    assert.ok(at > deploy.indexOf('tools/build-restoration.mjs'), 'after the restoration build');
    assert.ok(at > deploy.indexOf('tools/codebase/build-data.mjs'), 'after the Code page data');
    assert.ok(at < deploy.indexOf('echo "2/6'), 'before anything is copied');
  });
});

describe('every page that runs scripts loads the map and the hook first', () => {
  const pages = git(root, 'ls-files', 'public').split('\n').filter((f) => f.endsWith('.html'));
  const scriptTag = /<script\b([^>]*)>/g;
  const srcOf = (attrs) => /\bsrc="([^"]+)"/.exec(attrs)?.[1] || '';
  const needsHook = (html) => [...html.matchAll(scriptTag)].some((m) => {
    const src = srcOf(m[1]);
    return /type="module"/.test(m[1]) || (src && !/(^|\/)site\/theme\.js$/.test(src.split('?')[0]));
  });

  it('site/theme.js (the one script the other pages load) fetches nothing', () => {
    assert.doesNotMatch(read('public/site/theme.js'), /\bfetch\s*\(|\.src\s*=|new Image\b/);
  });

  it('js/data-versions.js then js/data-urls.js come before every script with a src and every module', () => {
    const problems = [];
    let checked = 0;
    for (const page of pages) {
      const html = read(page);
      if (!needsHook(html)) continue;
      checked += 1;
      const base = /<base href="([^"]+)"/.exec(html)?.[1] || './';
      const scripts = [...html.matchAll(scriptTag)].filter((m) => srcOf(m[1]) || /type="module"/.test(m[1]));
      const resolve = (src) => normalize(join(dirname(page), base, src.split('?')[0]));
      const [first, second] = scripts.map((m) => srcOf(m[1]));
      if (!first || resolve(first) !== normalize('public/js/data-versions.js')) problems.push(`${page}: first script is ${first || '(none)'}, not js/data-versions.js`);
      else if (!/\?v=[0-9a-f]{8}$/.test(first)) problems.push(`${page}: js/data-versions.js has no generated key`);
      if (!second || resolve(second) !== normalize('public/js/data-urls.js')) problems.push(`${page}: second script is ${second || '(none)'}, not js/data-urls.js`);
      else if (!/\?v=[^"]+$/.test(second)) problems.push(`${page}: js/data-urls.js has no key`);
    }
    assert.deepEqual(problems, []);
    assert.ok(checked >= 9, `pages checked: ${checked}`);
    assert.ok(mapPages(root).length >= checked, 'the builder finds every page that loads the map');
  });

  it('nothing in the game loads data where the hook cannot see it', () => {
    const files = git(root, 'ls-files', 'public').split('\n').filter((f) => /\.(m?js|html)$/.test(f) && !f.startsWith('public/vendor/') && !/^public\/(items|changelog)\/[^/]+\//.test(f));
    const BYPASS = /\bXMLHttpRequest\b|\bnew\s+(?:Shared)?Worker\s*\(|\bimportScripts\s*\(|navigator\.serviceWorker|\bnew\s+EventSource\s*\(/;
    const hits = files.filter((f) => BYPASS.test(read(f))).map((f) => `${f}: ${BYPASS.exec(read(f))[0]}`);
    assert.deepEqual(hits, [], 'a worker, XHR or service worker fetches around js/data-urls.js: key its URLs with groddleDataUrl()');
  });
});

describe('js/data-urls.js', () => {
  const b = browser(mapSource({ 'assets/streets/GA1.json': '1a2b3c4d', 'assets/sprites/x.webp': '99887766' }));

  it('puts a changed file\'s key, and the epoch key on the rest, on fetches', () => {
    assert.equal(b.fetch('assets/streets/GA1.json').url, 'assets/streets/GA1.json?v=1a2b3c4d');
    assert.equal(b.fetch('assets/streets/GB2.json').url, 'assets/streets/GB2.json?v=e0e0e0e0');
    assert.equal(b.fetch('assets/streets/index.json').url, 'assets/streets/index.json?v=e0e0e0e0');
  });

  it('replaces an old hand-made v= key and keeps the other parameters and the hash', () => {
    assert.equal(b.url('assets/content/recipes.json?v=fruit-machine-2&catalog=recipes-full-3'), 'assets/content/recipes.json?v=e0e0e0e0&catalog=recipes-full-3');
    assert.equal(b.url('assets/sprites/x.webp?play=5#a'), 'assets/sprites/x.webp?v=99887766&play=5#a');
  });

  it('resolves against the page base and the game root', () => {
    const page = browser(mapSource({ 'restoration/data.json': 'abcdef01' }), { baseURI: 'https://groddle.test/restoration/' });
    assert.equal(page.url('data.json'), 'data.json?v=abcdef01');
    assert.equal(page.url('../assets/streets/GA1.json'), '../assets/streets/GA1.json?v=e0e0e0e0');
    assert.equal(page.url(new URL('https://groddle.test/restoration/data.json')), 'https://groddle.test/restoration/data.json?v=abcdef01');
    const sub = browser(mapSource({}), { scriptSrc: 'https://host.test/groddle/js/data-versions.js?v=x', baseURI: 'https://host.test/groddle/play/' });
    assert.equal(sub.url('/groddle/assets/a.png'), '/groddle/assets/a.png?v=e0e0e0e0');
    assert.equal(sub.url('/elsewhere/a.png'), '/elsewhere/a.png', 'outside the game root');
  });

  it('leaves modules, pages, API calls, other sites, data: and blob: URLs and writes alone', () => {
    for (const u of ['js/street-loader.js?v=g1', 'play/', 'wp-json/groddle/v1/me', '/wp-admin/admin-ajax.php?action=rest-nonce', 'https://cdn.example/a.json', 'data:image/png;base64,AAAA', 'blob:https://groddle.test/1', 'style.css']) {
      assert.equal(b.url(u), u, u);
    }
    assert.equal(b.fetch('assets/streets/GA1.json', { method: 'POST' }).url, 'assets/streets/GA1.json', 'only GET and HEAD');
    assert.equal(b.fetch('assets/streets/GA1.json', { method: 'HEAD' }).url, 'assets/streets/GA1.json?v=1a2b3c4d');
  });

  it('keys a Request and an <img> src or srcset set from script', () => {
    assert.equal(b.fetch(new Request('https://groddle.test/assets/streets/GA1.json')).url, 'https://groddle.test/assets/streets/GA1.json?v=1a2b3c4d');
    assert.equal(b.img('assets/sprites/x.webp'), 'assets/sprites/x.webp?v=99887766');
    assert.equal(b.img('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    const img = new b.FakeImage();
    img.srcset = 'assets/sprites/x.webp 1x, assets/sprites/icons/a@3x.png?v=99887766 3x';
    assert.equal(img.srcset, 'assets/sprites/x.webp?v=99887766 1x, assets/sprites/icons/a@3x.png?v=e0e0e0e0 3x', 'a 3x srcset made from its 1x src gets its own key');
    img.setAttribute('src', 'assets/sprites/x.webp');
    assert.equal(img.getAttribute('src'), 'assets/sprites/x.webp?v=99887766');
    const div = new b.FakeElement();
    div.setAttribute('src', 'assets/sprites/x.webp');
    assert.equal(div.getAttribute('src'), 'assets/sprites/x.webp', 'only <img> attributes');
  });

  it('keys <img> tags in HTML given to innerHTML and insertAdjacentHTML, and nothing else in it', () => {
    const div = new b.FakeElement();
    div.innerHTML = `<p data-src="assets/sprites/x.webp">assets/sprites/x.webp</p><img alt="" src="assets/sprites/x.webp"><IMG class="i" srcset='assets/sprites/x.webp 1x' src='assets/streets/GA1.json?v=old&amp;k=1'>`;
    assert.equal(div.innerHTML, `<p data-src="assets/sprites/x.webp">assets/sprites/x.webp</p><img alt="" src="assets/sprites/x.webp?v=99887766"><IMG class="i" srcset='assets/sprites/x.webp?v=99887766 1x' src='assets/streets/GA1.json?v=1a2b3c4d&amp;k=1'>`);
    div.innerHTML = '<b>no images</b>';
    assert.equal(div.innerHTML, '<b>no images</b>');
    div.insertAdjacentHTML('beforeend', '<img src="assets/sprites/x.webp">');
    assert.equal(div.innerHTML, '<b>no images</b><img src="assets/sprites/x.webp?v=99887766">');
  });

  it('does nothing without a map (Node, tests, a page without js/data-versions.js)', () => {
    const g = { URL, document: { baseURI: 'https://groddle.test/play/' }, fetch: (u) => u };
    g.globalThis = g;
    vm.runInContext(HOOK, vm.createContext(g));
    assert.equal(g.groddleDataUrl('assets/streets/GA1.json'), 'assets/streets/GA1.json');
    assert.equal(g.fetch('assets/streets/GA1.json'), 'assets/streets/GA1.json');
  });

  it('the hook and the builder version the same extensions', () => {
    const hookExt = /var EXT = (\/.*\/i);/.exec(HOOK)[1];
    assert.equal(hookExt, String(EXT));
  });
});

describe('a changed file changes its URL (a scratch repository)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'groddle-data-versions-'));
  const put = (rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  const urlOf = (map, path) => browser(map.source, { baseURI: 'https://groddle.test/' }).url(path);
  after(() => rmSync(dir, { recursive: true, force: true }));
  {
    git(dir, 'init', '-q');
    put('public/assets/streets/GA1.json', '{"ladders":[{"tiling":"old"}]}');
    put('public/assets/streets/GB2.json', '{"ladders":[]}');
    put('public/assets/decos/tree.webp', 'webp-1');
    put('public/restoration/data.json', '{"n":1}');
    put('public/js/thing.js', 'export {};');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'epoch');
    const epoch = git(dir, 'rev-parse', 'HEAD').trim();
    const before = buildDataVersions({ root: dir, epoch });
    const firstUrl = urlOf(before, 'assets/streets/GA1.json');

    it('at the epoch every file has the epoch key', () => {
      assert.deepEqual(before.files, {});
      assert.equal(firstUrl, `assets/streets/GA1.json?v=${epoch.slice(0, 8)}`);
    });

    it('a rewritten street, a re-rendered image and a new file get their own keys; the rest keep theirs', () => {
      put('public/assets/streets/GA1.json', '{"ladders":[{"tiling":"new"}]}');
      put('public/assets/decos/tree.webp', 'webp-2');
      put('public/assets/decos/new.webp', 'webp-new');
      put('public/js/thing.js', 'export const x = 1;');
      put('public/restoration/data.json', '{"n":2}');
      const after = buildDataVersions({ root: dir, epoch });
      assert.deepEqual(Object.keys(after.files), ['assets/decos/new.webp', 'assets/decos/tree.webp', 'assets/streets/GA1.json']);
      assert.equal(after.files['assets/streets/GA1.json'], shortHash(Buffer.from('{"ladders":[{"tiling":"new"}]}')));
      assert.notEqual(urlOf(after, 'assets/streets/GA1.json'), firstUrl);
      assert.equal(urlOf(after, 'assets/streets/GB2.json'), `assets/streets/GB2.json?v=${epoch.slice(0, 8)}`);
      assert.notEqual(after.source, before.source);
      assert.notEqual(after.key, before.key, 'the pages load the new map under a new key');
      assert.equal(urlOf(after, 'restoration/data.json'), `restoration/data.json?v=${epoch.slice(0, 8)}`, 'built at deploy: not in the committed map');
      const deploy = buildDataVersions({ root: dir, epoch, built: true });
      assert.equal(deploy.files['restoration/data.json'], shortHash(Buffer.from('{"n":2}')), '--built keys it');
    });

    it('a second change gets a second key, and going back gives the old URL back', () => {
      put('public/assets/streets/GA1.json', '{"ladders":[{"tiling":"newer"}]}');
      const again = buildDataVersions({ root: dir, epoch });
      assert.equal(again.files['assets/streets/GA1.json'], shortHash(Buffer.from('{"ladders":[{"tiling":"newer"}]}')));
      put('public/assets/streets/GA1.json', '{"ladders":[{"tiling":"old"}]}');
      assert.equal(urlOf(buildDataVersions({ root: dir, epoch }), 'assets/streets/GA1.json'), firstUrl);
    });

    it('the map rows read back, and an epoch the clone lacks is named', () => {
      const map = buildDataVersions({ root: dir, epoch });
      assert.deepEqual(parseFiles(map.source), map.files);
      assert.throws(() => buildDataVersions({ root: dir, epoch: '0123456789abcdef0123456789abcdef01234567' }), /not in this clone/);
    });

    it('the pages that load the map get its key', () => {
      put('public/play/index.html', '<base href="../" />\n<script src="js/data-versions.js?v=00000000"></script>\n');
      const map = buildDataVersions({ root: dir, epoch });
      const stale = stalePages(dir, map.key);
      assert.deepEqual(stale.map((p) => p.file), ['public/play/index.html']);
      assert.match(stale[0].text, new RegExp(`data-versions\\.js\\?v=${map.key}`));
    });
  }
});
