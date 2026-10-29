/**
 * The restoration report's section menu (2026-10-29): the page is about 14,600 px on a desktop and
 * 29,700 on a phone, so the theme draws a compact bar at the top that stays in view as it scrolls,
 * one link per band (groddle-afternoon-site src/ReportMenu.php, over the rendered page content, so
 * nothing is written to Minn page 73 and it works without JavaScript). The report's sections also
 * key the art they draw with the game's content keys (src/DataKeys.php).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import { restorationContent } from '../tools/restoration/to-minn.mjs';
import { committedMap } from '../tools/data-versions/build.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = (() => {
  try {
    execFileSync('php', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const skip = skipWithoutSite || (!hasPhp && 'no php on PATH');

/** Runs `code` with src/<cls>.php loaded and $in set to `input`, returning what it echoes. */
function php(cls, code, input) {
  const dir = mkdtempSync(join(tmpdir(), 'groddle-menu-'));
  try {
    const file = join(dir, 'in.json');
    writeFileSync(file, JSON.stringify(input));
    return execFileSync('php', ['-r', `require ${JSON.stringify(join(SITE_DIR, `src/${cls}.php`))}; $in = json_decode(file_get_contents(${JSON.stringify(file)}), true); ${code}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const menu = (html) => php('ReportMenu', 'echo Groddle\\Minn\\ReportMenu::insert($in);', html);

describe('restoration section menu (ReportMenu.php)', () => {
  it('puts one link per band, in order, at the top of the report, with the masthead\'s own words', { skip }, () => {
    const content = restorationContent();
    const out = menu(content);
    const nav = /<nav class="report-menu" aria-label="On this page">([\s\S]*?)<\/nav>/.exec(out);
    assert.ok(nav, 'the menu is drawn');
    assert.ok(out.indexOf(nav[0]) < out.indexOf('class="wp-block-group masthead"'), 'before the masthead, so it sticks for the whole page');
    const links = [...nav[1].matchAll(/<li( class="report-menu-out")?><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[2], m[3], Boolean(m[1])]);
    assert.deepEqual(links, [
      ['#street', 'Walk a street', false],
      ['#systems', 'Every system', false],
      ['#numbers', 'By the numbers', false],
      ['#rooms', 'Quest rooms', false],
      ['#designers', 'Designers’ levels', false],
      ['#seasons', 'Seasons', false],
      ['#recent', 'Recently restored', false],
      ['#honest', 'What can’t come back', false],
      ['/compare/', 'Other remakes compared', true],
    ]);
    // Every anchor lands on a band of the page.
    for (const [href] of links.filter(([h]) => h.startsWith('#'))) assert.match(out, new RegExp(`<section class="wp-block-group band[^"]*" id="${href.slice(1)}">`), href);
    // The masthead's jump paragraph moved into the menu: its words are not shown twice.
    assert.equal(out.split('Other remakes compared').length - 1, 1);
    assert.doesNotMatch(out, /<p class="jump"/);
    assert.doesNotMatch(nav[0], /—/, 'no em dashes');
    // Everything else on the page is as it was.
    assert.equal(out.replace(nav[0] + '\n', ''), content.replace(/<p class="jump">[\s\S]*?<\/p>/, ''));
  });

  it('gives a band added in Minn Admin a link from its heading, and leaves pages without bands alone', { skip }, () => {
    const extra = restorationContent().replace('<!-- wp:group {"tagName":"section","anchor":"honest"', '<section class="wp-block-group band band-alt" id="credits-box"><div class="wrap"><h2 class="wp-block-heading">Thanks &amp; credits</h2></div></section>\n<!-- wp:group {"tagName":"section","anchor":"honest"');
    const nav = /<nav class="report-menu"[\s\S]*?<\/nav>/.exec(menu(extra))[0];
    assert.match(nav, /<li><a href="#recent">Recently restored<\/a><\/li><li><a href="#credits-box">Thanks &amp; credits<\/a><\/li><li><a href="#honest">/);
    const plain = '<header class="wp-block-group masthead"><h1>Hi</h1></header><section class="wp-block-group band" id="a"><h2>A</h2></section><section class="band" id="b"></section>';
    assert.equal(menu(plain), plain, 'fewer than three bands: no menu');
    const noHead = '<section class="band" id="a"></section><section class="band" id="b"></section><section class="band" id="c"></section>';
    assert.equal(menu(noHead), noHead, 'no masthead: no menu');
    const hostile = restorationContent().replace('<a href="/compare/">', '<a href="javascript:alert(1)">');
    assert.doesNotMatch(menu(hostile), /javascript:/, 'only anchors, site paths and web addresses');
  });

  it('is drawn by the theme over the report\'s rendered content, sticky, in the page\'s tokens', { skip: skipWithoutSite }, () => {
    const ext = readFileSync(join(SITE_DIR, 'src/Extension.php'), 'utf8');
    assert.match(ext, /\$minn->filterContent\(static fn \(string \$html\): string => Restoration::drawn\(\) \? ReportMenu::insert\(\$html\) : \$html\)/);
    assert.match(readFileSync(join(SITE_DIR, 'src/Restoration.php'), 'utf8'), /public static function drawn\(\): bool/);
    const css = readFileSync(join(SITE_DIR, 'style.css'), 'utf8');
    const rules = css.slice(css.indexOf("/* The restoration report's section menu"), css.indexOf('/* The Musicblocks page'));
    assert.match(rules, /\.report-menu \{\s*position: sticky; top: 0;/);
    assert.match(rules, /html:has\(\.report-menu\) \{ scroll-padding-top:/, 'anchors land below the bar');
    assert.match(rules, /\.report-menu-links \{[^}]*overflow-x: auto;/, 'one row that scrolls sideways on phones');
    assert.doesNotMatch(rules.replace(/(?:-webkit-)?mask-image:[^;]*;/g, ''), /#[0-9a-f]{3,6}\b|rgba?\(/i, 'colours come from the page tokens, so dark mode follows (the fade mask is only alpha)');
    // The block list is unchanged: the menu is chrome, not a block in the page.
    assert.ok(!JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8')).blocks.some((b) => /menu/.test(b)));
  });
});

describe('the report sections key the art they draw (DataKeys.php)', () => {
  it('puts the game\'s content key on each /assets/ src, srcset and style url(), from js/data-versions.js', { skip }, () => {
    const map = committedMap(root);
    const html = '<img class="d-pine" src="/assets/decos/groddle/tree_coniferous_fg_1.webp" alt="" style="left:196px" /><img src="/assets/a.png?v=arch" srcset="/assets/a@3x.png 3x" alt="" /><span style="background:url(\'/assets/b.png\')"></span><a href="/play/">Play</a><img src="https://cdn.example/x.png" />';
    const out = php('DataKeys', `echo Groddle\\Minn\\DataKeys::html($in, Groddle\\Minn\\DataKeys::map(${JSON.stringify(join(root, 'public'))}));`, html);
    const e = map.epoch;
    const key = (p) => map.files[p] || e;
    assert.equal(out, `<img class="d-pine" src="/assets/decos/groddle/tree_coniferous_fg_1.webp?v=${key('assets/decos/groddle/tree_coniferous_fg_1.webp')}" alt="" style="left:196px" /><img src="/assets/a.png?v=${e}" srcset="/assets/a@3x.png?v=${e} 3x" alt="" /><span style="background:url('/assets/b.png?v=${e}')"></span><a href="/play/">Play</a><img src="https://cdn.example/x.png" />`);
    const none = php('DataKeys', 'echo Groddle\\Minn\\DataKeys::html($in, Groddle\\Minn\\DataKeys::map("/nonexistent"));', html);
    assert.equal(none, html, 'without the map nothing changes');
    assert.match(readFileSync(join(SITE_DIR, 'src/Restoration.php'), 'utf8'), /DataKeys::html\(\$draw\(\$a, \$d\), DataKeys::map\(\$root->dir\)\)/);
  });
});
