/**
 * Community (/chat/, its boards and Support) follows the device's dark mode when the theme is System,
 * like every other page (Austin's pick 2026-11-28). site/theme.js leaves data-theme off <html> for
 * System and sets it only for an explicit Light or Dark choice (data-theme-mode is the choice), so a
 * stylesheet's dark look needs two rules: `:root[data-theme="dark"] X` for Dark, and the same values
 * under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) X }` for System on a
 * dark device (restoration.css's tokens and style.css do this). community/community.css drew its
 * Warm paper palette's dark twin only for the first, so System on a dark device stayed light; the
 * console's server.css (on the same palette) did the same with its chart colours.
 *
 * - Every `:root[data-theme="dark"]` rule in the site repo's stylesheets has a System twin with the
 *   same declarations, and no twin forces dark when the choice is Light.
 * - Community's pages and the console load site/theme.js in the head (Extension::head), before
 *   community.css, so the choice is on <html> before anything paints.
 * - community.css and server.css changed, so their cache keys moved.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/community-system-dark.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SITE_DIR } from '../tools/repos.mjs';

const HAS_SITE = existsSync(join(SITE_DIR, 'community/community.css'));
const site = (f) => readFileSync(join(SITE_DIR, f), 'utf8');

/** The site repo's own stylesheets (not its dependencies). */
function sheets(dir = SITE_DIR) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sheets(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** A stylesheet's rules, flat: { media, selector, body } (comments dropped, whitespace squeezed). */
function rules(css, media = '') {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).replace(/\s+/g, ' ').trim();
    let depth = 1;
    let j = open + 1;
    for (; j < text.length && depth; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
    }
    const inner = text.slice(open + 1, j - 1);
    if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@layer')) {
      out.push(...rules(inner, `${media} ${prelude}`.trim()));
    } else if (!prelude.startsWith('@')) {
      const body = inner.split(';').map((d) => d.replace(/\s+/g, ' ').trim()).filter(Boolean).sort().join('; ');
      for (const selector of prelude.split(/,(?![^(]*\))/).map((s) => s.trim())) out.push({ media, selector, body });
    }
    i = j;
  }
  return out;
}

const DARK = ':root[data-theme="dark"]';
const SYSTEM = ':root:not([data-theme="light"])';
const DEVICE_DARK = /prefers-color-scheme: ?dark/;

describe('Community follows the device\'s dark mode under System (site repo stylesheets)', { skip: !HAS_SITE && 'no site repo' }, () => {
  it('community.css: the Warm paper palette\'s dark twin is drawn for System on a dark device, not only for Dark', () => {
    const all = rules(site('community/community.css'));
    for (const part of ['.community-page', '.console-page', '.cx']) {
      const dark = all.find((r) => r.selector === `${DARK} ${part}` && !r.media);
      assert.ok(dark, `${part}: the Dark choice's palette`);
      assert.match(dark.body, /--bg: #1d1813/);
      const system = all.find((r) => r.selector === `${SYSTEM} ${part}` && DEVICE_DARK.test(r.media));
      assert.ok(system, `${part}: the same palette under @media (prefers-color-scheme: dark) for System`);
      assert.equal(system.body, dark.body, `${part}: the same values as Dark's`);
    }
  });

  it('every `:root[data-theme="dark"]` rule in the site has its System twin, with the same declarations', () => {
    const missing = [];
    for (const file of sheets()) {
      const all = rules(readFileSync(file, 'utf8'));
      for (const r of all.filter((x) => x.selector.startsWith(DARK))) {
        const twin = all.find((x) => x.selector === SYSTEM + r.selector.slice(DARK.length) && DEVICE_DARK.test(x.media) && x.media.includes(r.media));
        if (!twin || twin.body !== r.body) missing.push(`${relative(SITE_DIR, file)}: ${r.selector}${twin ? ' (values differ)' : ''}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('an explicit Light stays light on a dark device: no device-dark rule reaches a page with data-theme="light"', () => {
    const leaks = [];
    for (const file of sheets()) {
      for (const r of rules(readFileSync(file, 'utf8')).filter((x) => DEVICE_DARK.test(x.media))) {
        if (!r.selector.startsWith(SYSTEM) && !r.selector.startsWith(DARK)) leaks.push(`${relative(SITE_DIR, file)}: ${r.selector}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it('Community\'s pages and the console set the choice before their stylesheets paint, and their keys moved', () => {
    const head = site('src/Extension.php');
    assert.match(head, /'<script src="' \. self::keyed\('\/site\/theme\.js'\) \. '"><\/script>'/, 'Extension::head loads theme.js');
    const community = site('src/CommunityPages.php');
    assert.ok(community.indexOf('Extension::head()') < community.indexOf('community.css?v='), 'theme.js before community.css');
    assert.match(community, /ASSET_KEY = 'community-25'/);
    assert.match(site('src/AdminConsolePage.php'), /SERVER_ASSET_KEY = 'server-5'/);
  });
});
