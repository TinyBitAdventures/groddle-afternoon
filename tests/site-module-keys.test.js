/**
 * G966 (root R19, after G540 #95, G555, G559): the site's scripts import modules with a key a deploy
 * changes. The game stamps ?v=<hash> on every import (tools/module-keys); the site's community/ and
 * console/ scripts had two imports of game files by a bare path (/js/chat-links.js,
 * /js/ui/context-menu.js) and a hand-written key on console/charts.js (?v=charts-1), so a browser
 * could keep an old copy for a year. The site now writes those imports bare and the two pages that
 * load its modules carry an import map (groddle-afternoon-site src/Extension.php importMap) sending
 * each to its content-keyed address (AssetKeys, the key on its stylesheets).
 * This test fails on any site import that is neither in that map nor carries its importer's key.
 * Run: node --test tests/site-module-keys.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GAME_DIR, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const php = HAS_PHP ? PHP : null;
const skip = skipWithoutSite || (!php && 'no php');
const THEME_URL = '/wp-content/themes/groddle/';
const pub = join(GAME_DIR, 'public');
const key = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 8);

/** Extension::importMap() run with php -r (the Minn types its file names stubbed), the built game at `dir`. */
function importMap(dir) {
  const code = `namespace Minn\\Extension { interface Extension {} class Seams {} }
namespace Minn\\Blocks { class Block {} }
namespace {
  require ${JSON.stringify(sitePath('src/AssetKeys.php'))};
  require ${JSON.stringify(sitePath('src/Extension.php'))};
  $p = new ReflectionProperty(Groddle\\Minn\\Extension::class, 'staticDir');
  $p->setValue(null, ${JSON.stringify(dir)});
  echo Groddle\\Minn\\Extension::importMap();
}`;
  const out = execFileSync(php, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8' });
  const m = out.match(/^<script type="importmap">(.*)<\/script>\n$/s);
  assert.ok(m, `an import map tag: ${out}`);
  return JSON.parse(m[1]).imports;
}

/** Drop comments, keeping line numbers. */
const code = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const IMPORT_RE = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\bimport\(\s*(['"`])([^'"`]+)\1\s*\)/g,
];

/** Each import specifier in a script: { spec, line }. */
function importsOf(text) {
  const src = code(text);
  const out = [];
  for (const re of IMPORT_RE) {
    for (const m of src.matchAll(re)) out.push({ spec: m[2], line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * Why an import is unkeyed, or '' when it is keyed. `url` is the importing script's address.
 * A template that ends with an interpolated key (`${new URL(import.meta.url).search}`, `?v=${v}`)
 * carries its importer's key; a plain address must be in the import map; a hand-written ?v= fails.
 */
function unkeyed(spec, url, imports) {
  if (spec.includes('${')) return /\$\{[^}]+\}$/.test(spec) ? '' : 'a template without a key at its end';
  if (/[?&]v=/.test(spec)) return 'a hand-written key';
  const abs = new URL(spec, `https://site.test${url}`).pathname;
  return abs in imports ? '' : `not in Extension::MODULE_IMPORTS (${abs})`;
}

function siteScripts() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules' || name === 'vendor') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) out.push(full);
    }
  };
  walk(SITE_DIR);
  return out;
}

describe('G966: the site\'s module imports carry content keys', { skip }, () => {
  it('every import in the site\'s scripts is keyed', () => {
    const imports = importMap(pub);
    const offenders = [];
    let seen = 0;
    for (const file of siteScripts()) {
      const rel = relative(SITE_DIR, file).split('\\').join('/');
      for (const { spec, line } of importsOf(readFileSync(file, 'utf8'))) {
        seen += 1;
        const why = unkeyed(spec, THEME_URL + rel, imports);
        if (why) offenders.push(`${rel}:${line} ${spec}: ${why}`);
      }
    }
    assert.ok(seen >= 15, `the scan found the site's imports (${seen})`);
    assert.deepEqual(offenders, []);
  });

  it('the map keys each module by its content: game files from the built game, theme files from the site', () => {
    const imports = importMap(pub);
    assert.equal(imports['/js/chat-links.js'], `/js/chat-links.js?v=${key(readFileSync(join(pub, 'js/chat-links.js')))}`);
    assert.equal(imports['/js/ui/context-menu.js'], `/js/ui/context-menu.js?v=${key(readFileSync(join(pub, 'js/ui/context-menu.js')))}`);
    const charts = `${THEME_URL}console/charts.js`;
    assert.equal(imports[charts], `${charts}?v=${key(readFileSync(sitePath('console/charts.js')))}`);
  });

  it('the scan catches the old imports', () => {
    const imports = importMap(pub);
    const old = [
      ["import { fmt } from './charts.js?v=charts-1';", `${THEME_URL}console/ledger.js`],
      ["import('/js/some-new-module.js').then(() => {});", `${THEME_URL}community/chat-app.js`],
    ];
    for (const [text, url] of old) {
      const [{ spec }] = importsOf(text);
      assert.notEqual(unkeyed(spec, url, imports), '', text);
    }
    assert.equal(unkeyed('./chat-pure.js${new URL(import.meta.url).search}', `${THEME_URL}community/chat-app.js`, imports), '');
  });

  it('is wired: /chat/ and the console print the map before their first module script', () => {
    for (const f of ['src/CommunityPages.php', 'src/AdminConsolePage.php']) {
      const src = readFileSync(sitePath(f), 'utf8');
      const map = src.indexOf('. Extension::importMap()');
      const firstModule = src.indexOf('type=\\"module\\"');
      assert.ok(map > 0 && firstModule > map, `${f}: Extension::importMap() before the first module script`);
    }
  });
});
