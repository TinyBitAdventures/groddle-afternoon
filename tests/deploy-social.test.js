/**
 * Link previews: every page carries an Open Graph and Twitter card with the share card
 * public/brand/share.jpg. The static game pages get them at deploy (tools/deploy/social.mjs from
 * kinsta.sh); the pages Minn renders get the same tags from the site (groddle-afternoon-site src/SocialTags.php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { ORIGIN, SHARE_IMAGE, pagePath, socialTags, withSocial } from '../tools/deploy/social.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));

describe('link previews on the static game pages', () => {
  it('a page gets its own title, description and URL, and the share card', () => {
    const page = '<!doctype html><html><head><title>Glitch Remakes Compared</title>\n<meta name="description" content="Tiny Speck&#039;s Glitch, side by side" /></head><body></body></html>';
    const out = withSocial(page, '/compare/');
    assert.ok(out.includes('<meta property="og:title" content="Glitch Remakes Compared" />'));
    assert.ok(out.includes('<meta property="og:description" content="Tiny Speck\'s Glitch, side by side" />'));
    assert.ok(out.includes(`<meta property="og:url" content="${ORIGIN}/compare/" />`));
    assert.ok(out.includes(`<meta property="og:image" content="${ORIGIN}/brand/share.jpg" />`));
    assert.ok(out.includes('<meta name="twitter:card" content="summary_large_image" />'));
    assert.ok(out.indexOf('og:image') < out.indexOf('</head>'));
    assert.equal(withSocial(out, '/compare/'), null, 'idempotent');
    assert.equal(withSocial('<p>no head</p>', '/'), null);
    assert.equal(withSocial('<html><head></head></html>', '/'), null, 'no title, no card');
    assert.match(socialTags({ title: 'A "quoted" <title>', description: '', path: '/' }), /content="A &quot;quoted&quot; &lt;title&gt;"/);
  });

  it('a file\'s path is its URL, index.html its folder', () => {
    assert.equal(pagePath('index.html'), '/');
    assert.equal(pagePath('play/online/index.html'), '/play/online/');
    assert.equal(pagePath('items/apple/index.html'), '/items/apple/');
    assert.equal(pagePath('avatar-lab.html'), '/avatar-lab.html');
  });

  it('the share card is a 1200x630 JPEG', () => {
    const jpg = read('public/brand/share.jpg');
    assert.equal(jpg.readUInt16BE(0), 0xffd8);
    let at = 2;
    let size = null;
    while (at < jpg.length && !size) {
      const marker = jpg.readUInt16BE(at);
      const len = jpg.readUInt16BE(at + 2);
      if (marker >= 0xffc0 && marker <= 0xffc2) size = { h: jpg.readUInt16BE(at + 5), w: jpg.readUInt16BE(at + 7) };
      at += 2 + len;
    }
    assert.deepEqual(size, { w: SHARE_IMAGE.width, h: SHARE_IMAGE.height });
    assert.ok(jpg.length < 300_000, `${jpg.length} bytes`);
  });

  it('kinsta.sh runs it on the built game before the upload', () => {
    const deploy = String(read('tools/deploy/kinsta.sh'));
    const at = deploy.indexOf('tools/deploy/social.mjs" "$GAME"');
    assert.ok(at > 0);
    assert.ok(at < deploy.indexOf('"$GAME/" "$HOST:web/game.next/"'), 'before the game rsync');
  });
});

describe('link previews on the pages Minn renders (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  it('the same card, the same tags', () => {
    const src = readFileSync(sitePath('src/SocialTags.php'), 'utf8');
    assert.ok(src.includes(`public const IMAGE = '${SHARE_IMAGE.path}';`));
    assert.ok(src.includes(`public const IMAGE_ALT = '${SHARE_IMAGE.alt}';`));
    assert.match(src, /IMAGE_WIDTH = 1200;[\s\S]*IMAGE_HEIGHT = 630;/);
    for (const name of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) {
      assert.ok(src.includes(`'${name}'`), name);
      assert.ok(String(readFileSync(new URL('../tools/deploy/social.mjs', import.meta.url))).includes(`'${name}'`), name);
    }
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /filterDocument\(static fn \(string \$html\): string => SocialTags::insert\(\$html, \$home, \$path\)\)/);
    assert.match(readFileSync(sitePath('src/PlayerPages.php'), 'utf8'), /\$html = SocialTags::insert\(\$html, /);
  });
});
