/**
 * Player report 95 (Friendly, 2026-11-06, the Contribute page): "the formatting needs
 * adjustment, it displays exactly like this: Friendly79 reports that led to a change255 points
 * ... the sprite images under 'help with costs' are way too large". The page's markup was right
 * (site ContributeCredits.php); its .cc-* and .ct-* rules came in the theme's style.css on 11-03,
 * and the site linked its stylesheets with no version (src/Extension.php head), so a browser
 * kept the style.css from before. Every stylesheet and the theme script the site's head links now
 * carry ?v= and their content key (src/AssetKeys.php, the key AdminBuilderPage::key puts on the
 * level builder's files): a deploy that changes a file changes its address.
 * Run: node --test tests/site-stylesheet-keys.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const php = spawnSync('php', ['-v']).status === 0 ? 'php' : null;
const skip = skipWithoutSite || (!php && 'no php');
const key = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

/**
 * Extension::head() run with php -r: the two Minn types its file names are stubbed (the engine
 * is not needed to draw the head), the built game's folder is `dir`.
 */
function head(dir) {
  const code = `namespace Minn\\Extension { interface Extension {} class Seams {} }
namespace Minn\\Blocks { class Block {} }
namespace {
  require ${JSON.stringify(sitePath('src/AssetKeys.php'))};
  require ${JSON.stringify(sitePath('src/Extension.php'))};
  $p = new ReflectionProperty(Groddle\\Minn\\Extension::class, 'staticDir');
  $p->setValue(null, ${JSON.stringify(dir)});
  echo Groddle\\Minn\\Extension::head();
}`;
  return execFileSync(php, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8' });
}

describe('the site\'s stylesheets carry content keys (report 95)', { skip }, () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'groddle-site-keys-'));
    for (const [rel, text] of [['restoration/restoration.css', 'a{}'], ['site/site-nav.css', '.site-nav{}'], ['site/theme.js', 'void 0;']]) {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('every stylesheet and the theme script in the head is keyed by its content', () => {
    const out = head(dir);
    const style = key(readFileSync(sitePath('style.css')));
    assert.ok(out.includes(`<link rel="stylesheet" href="/restoration/restoration.css?v=${key('a{}')}" />`));
    assert.ok(out.includes(`<link rel="stylesheet" href="/site/site-nav.css?v=${key('.site-nav{}')}" />`));
    assert.ok(out.includes(`<link rel="stylesheet" href="/wp-content/themes/groddle/style.css?v=${style}" />`), 'the theme\'s own style.css, from the site repo');
    assert.ok(out.includes(`<script src="/site/theme.js?v=${key('void 0;')}"></script>`));
    // A file this build lacks keeps its plain address (nothing to key).
    assert.ok(out.includes('<link rel="stylesheet" href="/changelog/changelog.css" />'));
    // The theme's own rules for the Contribute page's boards are in that file.
    assert.match(readFileSync(sitePath('style.css'), 'utf8'), /^\.cc-row \{/m);
  });

  it('a changed file gets a new address', () => {
    const before = head(dir);
    writeFileSync(join(dir, 'site/site-nav.css'), '.site-nav{color:red}');
    const out = head(dir);
    assert.notEqual(before, out);
    assert.ok(out.includes(`/site/site-nav.css?v=${key('.site-nav{color:red}')}`));
  });

  it('AssetKeys keys only files under the folder it is given, and keeps a query', () => {
    const code = `require ${JSON.stringify(sitePath('src/AssetKeys.php'))};
use Groddle\\Minn\\AssetKeys as K;
echo K::url('/site/theme.js?x=1', ${JSON.stringify(dir)}, 'site/theme.js'), ' ';
echo K::url('/a.css', ${JSON.stringify(dir)}, '../etc/passwd'), ' ';
echo K::url('/a.css', '', 'a.css'), ' ';
echo K::key(${JSON.stringify(dir)}, 'nope.css') === '' ? 'none' : 'some';`;
    const out = execFileSync(php, ['-r', code], { encoding: 'utf8' });
    assert.equal(out, `/site/theme.js?x=1&v=${key('void 0;')} /a.css /a.css none`);
  });

  it('is wired: register() names the built game\'s folder, head() keys every link', () => {
    const src = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(src, /\$root = StaticRoot::fromSite\(\$minn\);\n\s*self::\$staticDir = \$root->dir;/);
    assert.match(src, /'<link rel="stylesheet" href="' \. self::keyed\(\$href\) \. '" \/>'/);
    assert.match(src, /'<script src="' \. self::keyed\('\/site\/theme\.js'\) \. '"><\/script>'/);
    assert.match(readFileSync(sitePath('src/AssetKeys.php'), 'utf8'), /substr\(\(string\) hash_file\('sha256', \$path\), 0, 8\)/, 'the level builder\'s key (AdminBuilderPage::key)');
    assert.match(readFileSync(sitePath('src/AdminBuilderPage.php'), 'utf8'), /substr\(\(string\) hash_file\('sha256', \$path\), 0, 8\)/);
  });
});
