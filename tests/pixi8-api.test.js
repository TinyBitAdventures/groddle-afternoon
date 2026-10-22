/**
 * The game runs on Pixi 8 (vendored, no CDN). Pixi 7 calls either throw,
 * warn once and misbehave, or silently draw nothing in v8, so none may come
 * back in game code. See js/textures.js (URL textures), js/pixi-fixes.js and
 * tools/pixi8/ (the codemods that converted v7 code).
 * Run: node --test tests/pixi8-api.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function sources(dir = pub, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'vendor' || name === 'assets') continue;
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|html)$/.test(name)) out.push(p);
  }
  return out;
}

const V7 = [
  [/\.(beginFill|endFill|lineStyle|beginTextureFill)\(/, 'Graphics fill/line state: use rect()/circle()/... then fill()/stroke()'],
  [/\.draw(Rect|RoundedRect|Circle|Ellipse|Polygon|Star)\(/, 'Graphics draw*: use rect/roundRect/circle/ellipse/poly/star'],
  [/\bBaseTexture\b|\.baseTexture\b/, 'BaseTexture: use TextureSource (texture.source, sourceFromUrl)'],
  [/PIXI\.utils\./, 'PIXI.utils is gone (string2hex -> new PIXI.Color(x).toNumber())'],
  [/BLEND_MODES|SCALE_MODES|MIPMAP_MODES|LINE_CAP|LINE_JOIN/, 'v7 enums: use strings (\'add\', \'linear\', \'round\')'],
  [/new (?:[\w.]+\.)?PIXI\.Text\((?!\s*\{|\s*$)/, 'Text: new PIXI.Text({ text, style })'],
  [/\bstrokeThickness\b|\bdropShadow(Color|Alpha|Blur|Angle|Distance)\b|fillGradientStops/, 'v7 text style keys: stroke { color, width }, dropShadow { ... }, FillGradient'],
  [/PIXI\.Assets\b|\bcacheAsBitmap\b/, 'Assets/cacheAsBitmap: use js/textures.js / cacheAsTexture()'],
  [/\bapp\.view\b/, 'app.view: use app.canvas'],
  [/(?:Texture|Sprite)\.from\(\s*['"`]/, 'Texture.from(url) never loads in v8: use textureFromUrl(url)'],
  [/\.once\(\s*['"]loaded['"]|\.valid\b/, 'texture loaded state: use isLoaded/onLoaded from js/textures.js'],
  [/new (?:[\w.]+\.)?PIXI\.Application\(\s*\{/, 'Application: new PIXI.Application() then await app.init({...})'],
];

describe('Pixi 8 API only', () => {
  it('play/index.html and race-lab.html load the vendored Pixi 8 build', () => {
    for (const page of ['play/index.html', 'race-lab.html']) {
      const html = readFileSync(join(pub, page), 'utf8');
      assert.match(html, /<script src="vendor\/pixi\/pixi-8\.22\.0\.min\.js"><\/script>/, page);
      assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|pixi\.js@7/, page);
    }
    assert.ok(existsSync(join(pub, 'vendor/pixi/pixi-8.22.0.min.js')));
    assert.ok(existsSync(join(pub, 'vendor/pixi/LICENSE')));
  });

  for (const [re, why] of V7) {
    it(`no ${why.split(':')[0]}`, () => {
      const hits = [];
      for (const file of sources()) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (/^\s*(\*|\/\/)/.test(line)) return; // comments
          if (re.test(line)) hits.push(`${relative(pub, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
      assert.deepEqual(hits, [], `${why}\n${hits.join('\n')}`);
    });
  }
});
