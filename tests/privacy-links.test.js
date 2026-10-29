/**
 * The privacy policy (the site's page /privacy-policy/, published 2026-10-29) is one click from every
 * place a player gives us something: the footers beside Credits, the start card and the New player
 * form. /privacy and /privacy/ redirect to it (groddle-afternoon-site src/PrivacyLinks.php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('privacy links', () => {
  it('every Credits link has a Privacy link beside it, at the same depth', () => {
    for (const page of ['public/index.html', 'public/play/index.html', 'public/play/online/index.html', 'public/changelog/index.html', 'public/restoration/index.html']) {
      const html = read(page);
      const m = html.match(/<a href="((?:\.\.\/)*)credits\/">Credits<\/a> · <a href="((?:\.\.\/)*)privacy-policy\/">Privacy<\/a>/);
      assert.ok(m, page);
      assert.equal(m[1], m[2], page);
    }
    for (const tool of ['tools/catalog/build.mjs', 'tools/changelog/build.mjs']) {
      assert.match(read(tool), /credits\/">Credits<\/a> · <a href="\$\{p\}privacy-policy\/">Privacy<\/a>/, tool);
    }
    assert.match(read('public/compare/index.html'), /<a href="\.\.\/privacy-policy\/">Privacy<\/a>/);
  });

  it('the New player form links the policy in a new tab', () => {
    const src = read('public/js/account-forms.js');
    assert.match(src, /el\('a', \{ href: '\/privacy-policy\/', target: '_blank', rel: 'noopener' \}, FORM_COPY\.signup\.privacy\)/);
    assert.match(src, /slots\.signup, suSubmit, privacy\);/);
  });
});

describe('/privacy redirects (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('both spellings answer 301 to /privacy-policy/', () => {
    const src = readFileSync(sitePath('src/PrivacyLinks.php'), 'utf8');
    assert.match(src, /public const PATH = '\/privacy-policy\/';/);
    assert.match(src, /'\/privacy', policy: new Policy\(Access::Public\)/);
    assert.match(src, /'\/privacy\/', policy: new Policy\(Access::Public\)/);
    assert.equal((src.match(/Response::redirect\(self::PATH, 301\)/g) || []).length, 2);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /\$minn->routes\(new PrivacyLinks\(\$minn\)\);/);
    assert.match(readFileSync(sitePath('parts/footer.html'), 'utf8'), /<a href="\/privacy-policy\/">Privacy<\/a>/);
  });
});
