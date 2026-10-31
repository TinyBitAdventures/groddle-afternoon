/**
 * The Classic interface's chrome art (tools/classic-art, classic-spec assets.md):
 * only Tiny Speck's CC0 art ships under public/assets/classic/, never the
 * trademark or the logo, and public/js/classic/classic-art.js matches the files.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, readManifest, trademarkProblems, cleanSvg, stripSvg, artSize, sha1, LOGO_SHA1, ASSETS, OUT_DIR } from '../tools/classic-art/build.mjs';
import { CLASSIC_ART, classicArtUrl } from '../public/js/classic/classic-art.js?v=5745e669';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(OUT_DIR);

describe('Classic art: what ships', () => {
  it('the files, the module and the sources agree (node tools/classic-art/build.mjs --check)', () => {
    assert.deepEqual(check(), []);
  });

  it('no file is named for the trademark or carries it, and none is the logo', () => {
    assert.ok(files.length > 50, `${files.length} files`);
    for (const f of files) {
      assert.doesNotMatch(f, /glitch/i, f);
      const buf = readFileSync(join(OUT_DIR, f));
      assert.doesNotMatch(buf.toString('latin1'), /glitch/i, `${f}: content`);
      assert.ok(!LOGO_SHA1.includes(sha1(buf)), `${f}: the logo's bytes`);
    }
    // The module and the reused files too.
    assert.doesNotMatch(readFileSync(join(root, 'public/js/classic/classic-art.js'), 'utf8'), /glitch/i);
    for (const a of Object.values(CLASSIC_ART)) assert.doesNotMatch(a.url, /glitch/i);
  });

  it('the logo is refused under any name, and so is the word', () => {
    const logo = join(ASSETS, 'graphics/logo_glitch.png');
    if (existsSync(logo)) {
      assert.equal(sha1(readFileSync(logo)), LOGO_SHA1[0]);
      assert.ok(trademarkProblems('innocent_name', readFileSync(logo)).some((p) => /logo's bytes/.test(p)));
    }
    assert.ok(trademarkProblems('logo_glitch', Buffer.from('x')).length > 0);
    assert.ok(trademarkProblems('cloud', Buffer.from('<svg><text>Glitch</text></svg>')).length > 0);
    assert.deepEqual(trademarkProblems('cloud', Buffer.from('<svg/>')), []);
  });

  it('the manifest never names the logo or the 2011 art the 2012 look left out', () => {
    const m = readManifest();
    const srcs = [...m.copy, ...m.reuse].map((e) => e.src).concat(m.svg.map((e) => e.swf));
    for (const gone of ['logo_glitch', 'glitch_logo', 'pack_slot_empty', 'pack_slot_full', 'mood_emoticons', 'hotkeys.png', 'mini_map_you', 'daily_calendar_icon']) {
      assert.ok(!srcs.some((s) => s.includes(gone)), gone);
    }
  });

  it('every SVG is plain: no FFDec namespace, no images, filters or blends, a viewBox', () => {
    for (const f of files.filter((x) => x.endsWith('.svg'))) {
      const s = readFileSync(join(OUT_DIR, f), 'utf8');
      assert.doesNotMatch(s, /ffdec|<image\b|<filter\b|mix-blend-mode/, f);
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="0 0 [\d.]+ [\d.]+">/, f);
    }
  });

  it('the module lists every piece with its size', () => {
    assert.equal(CLASSIC_ART.currants_icon.w, 36);
    assert.equal(CLASSIC_ART.currants_icon.h, 36);
    assert.equal(CLASSIC_ART.imagination_button.url, 'assets/imagination/ui/imagination_button.png', 'reused, not copied');
    assert.equal(CLASSIC_ART.avatar_rain.frames, 10);
    assert.equal(CLASSIC_ART.player_face_rays.frames, 89);
    assert.equal(classicArtUrl('spinner'), 'assets/classic/spinner.svg');
    assert.throws(() => classicArtUrl('nope'));
    for (const a of Object.values(CLASSIC_ART)) assert.ok(existsSync(join(root, 'public', a.url)), a.url);
  });
});

describe('Classic art: the SVG cleaner', () => {
  const stage = '<?xml version="1.0"?>\n<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" ffdec:objectType="frame" height="10.0px" width="20.5px" xmlns="http://www.w3.org/2000/svg">\n  <g transform="matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)">\n    <rect fill="#674a4c" height="10.0px" width="20.5px"/>\n    <use ffdec:characterId="1" xlink:href="#shape0"/>\n  </g>\n  <defs><g id="shape0"><path d="M0 0"/></g></defs>\n</svg>\n';

  it('drops the stage background and FFDec\'s attributes, adds a viewBox', () => {
    const { svg, w, h } = cleanSvg(stage, { stage: true });
    assert.deepEqual([w, h], [20.5, 10]);
    assert.doesNotMatch(svg, /<rect|ffdec|<\?xml/);
    assert.match(svg, /viewBox="0 0 20\.5 10"/);
  });

  it('strips frames side by side with their own ids', () => {
    const { svg, w, h, frame } = stripSvg([stage, stage, stage]);
    assert.deepEqual([w, h, frame], [61.5, 10, [20.5, 10]]);
    assert.match(svg, /id="f3-shape0"/);
    assert.match(svg, /xlink:href="#f2-shape0"/);
    assert.match(svg, /translate\(41 0\)/);
    assert.deepEqual(artSize(Buffer.from(svg)), [61.5, 10]);
  });
});
