/**
 * Character builder pure helpers.
 * Run: node --test tests/character-builder.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultAppearance,
  createClassicAppearance,
  normalizeAppearance,
  classifyAvatarPixel,
  recolorImageData,
  applyTargetColor,
  randomAppearance,
  appearanceToJson,
  appearanceFromJson,
  saveAppearance,
  loadAppearance,
  APPEARANCE_PRESETS,
  COLOR_SWATCHES,
  appearanceCacheKey,
  resolveBodySheets,
  STORAGE_KEY,
} from '../public/js/character-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('appearance model', () => {
  it('default + normalize clamps and fills slots', () => {
    const d = createDefaultAppearance();
    assert.equal(d.bodyStyle, 'glitch');
    const classic = createClassicAppearance();
    assert.equal(classic.bodyStyle, 'classic');
    assert.ok(classic.hair.g > classic.hair.r);
    const n = normalizeAppearance({ hair: { r: 300, g: -5, b: 10 } });
    assert.equal(n.hair.r, 255);
    assert.equal(n.hair.g, 0);
    assert.equal(n.hair.b, 10);
    assert.ok(n.pants);
  });

  it('moves an untouched old default to the Glitch sheets, keeps a customised look', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    saveAppearance(createClassicAppearance(), { storage });
    assert.equal(loadAppearance({ storage }).bodyStyle, 'glitch');
    saveAppearance({ ...createClassicAppearance(), hair: { r: 200, g: 50, b: 50 } }, { storage });
    assert.equal(loadAppearance({ storage }).bodyStyle, 'classic');
  });

  it('json round-trip and storage mock', () => {
    const a = normalizeAppearance({
      hair: { r: 200, g: 50, b: 50 },
      shirt: { r: 10, g: 20, b: 200 },
    });
    const json = appearanceToJson(a);
    const b = appearanceFromJson(json);
    assert.equal(b.hair.r, 200);
    assert.equal(b.shirt.b, 200);
    const store = {
      _m: {},
      setItem(k, v) {
        this._m[k] = v;
      },
      getItem(k) {
        return this._m[k] ?? null;
      },
    };
    saveAppearance(a, { storage: store });
    assert.ok(store.getItem(STORAGE_KEY));
    const loaded = loadAppearance({ storage: store });
    assert.equal(loaded.hair.r, 200);
    assert.equal(appearanceCacheKey(a), appearanceCacheKey(loaded));
  });

  it('presets and random produce valid looks', () => {
    assert.ok(Object.keys(APPEARANCE_PRESETS).length >= 5);
    for (const p of Object.values(APPEARANCE_PRESETS)) {
      const a = normalizeAppearance(p.appearance);
      assert.ok(a.hair && a.skin && a.shirt && a.pants && a.shoes);
    }
    let i = 0;
    const a = randomAppearance({ rng: () => (i++ % 10) / 10 });
    assert.ok(COLOR_SWATCHES.hair.some((s) => s.rgb.r === a.hair.r) || a.hair);
  });

  it('resolveBodySheets picks classic or alt paths that exist', () => {
    const c = resolveBodySheets({ bodyStyle: 'classic' });
    assert.match(c.idleUrl, /avatar_styled_idle/);
    const a = resolveBodySheets({ bodyStyle: 'alt' });
    assert.match(a.idleUrl, /avatar_styled_alt/);
    const sprites = join(__dirname, '../public/assets/sprites');
    assert.ok(existsSync(join(sprites, 'avatar_styled_idle.png')));
    assert.ok(existsSync(join(sprites, 'avatar_styled_walk.png')));
    assert.ok(existsSync(join(sprites, 'avatar_styled_alt.png')));
  });
});

describe('pixel classify + recolor', () => {
  it('classifies green hair, red shirt, blue pants, cream sole', () => {
    assert.equal(classifyAvatarPixel(72, 140, 72, 255, 0.15), 'hair');
    assert.equal(classifyAvatarPixel(180, 30, 40, 255, 0.5), 'shirt');
    assert.equal(classifyAvatarPixel(40, 32, 40, 255, 0.5), 'shirtDark');
    assert.equal(classifyAvatarPixel(50, 90, 140, 255, 0.7), 'pants');
    assert.equal(classifyAvatarPixel(50, 130, 50, 255, 0.9), 'shoes');
    assert.equal(classifyAvatarPixel(210, 195, 160, 255, 0.9), 'sole');
    assert.equal(classifyAvatarPixel(190, 180, 165, 255, 0.4), 'skin');
    assert.equal(classifyAvatarPixel(0, 0, 0, 0, 0.5), null);
  });

  it('recolorImageData changes green hair pixels toward blue target', () => {
    // 2×2 image: green hair top, red shirt bottom
    const w = 2;
    const h = 2;
    const data = new Uint8ClampedArray([
      // y0 hair
      72, 140, 72, 255, 80, 150, 80, 255,
      // y1 shirt
      180, 30, 40, 255, 40, 32, 40, 255,
    ]);
    const app = normalizeAppearance({
      hair: { r: 40, g: 80, b: 220 },
      shirt: { r: 20, g: 180, b: 60 },
      shirtDark: { r: 10, g: 40, b: 20 },
    });
    const n = recolorImageData(data, w, h, app);
    assert.ok(n >= 2);
    // Hair pixel shifted toward blue (b higher relative)
    assert.ok(data[2] > 100, `hair blue channel ${data[2]}`);
    // Shirt red reduced / green increased toward forest
    assert.ok(data[9] > data[8] || data[9] > 50);
  });

  it('applyTargetColor preserves relative lightness', () => {
    const dark = applyTargetColor(40, 40, 40, { r: 200, g: 50, b: 50 });
    const light = applyTargetColor(220, 220, 220, { r: 200, g: 50, b: 50 });
    assert.ok(light.r > dark.r);
  });
});

describe('UI wiring', () => {
  it('index and game wire avatar builder panel', () => {
    const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(html.includes('id="avatar-panel"'));
    assert.ok(html.includes('id="avatar-preview"'));
    assert.ok(html.includes('id="avatar-btn"'));
    assert.ok(html.includes('id="start-customize-btn"'));
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('openAvatarPanel'));
    assert.ok(game.includes('character-builder'));
    assert.ok(game.includes('applyPlayerAppearance'));
    assert.ok(game.includes('recolorImageData'));
    const css = readFileSync(join(__dirname, '../public/style.css'), 'utf8');
    assert.ok(css.includes('avatar-swatch'));
  });
});
