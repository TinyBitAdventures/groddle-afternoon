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
  createGlitchSheetsAppearance,
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
import { expandCatalog, lookKey, resolveLook } from '../public/js/avatar-looks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('appearance model', () => {
  it('default + normalize clamps and fills slots', () => {
    const d = createDefaultAppearance();
    assert.equal(d.bodyStyle, 'vector');
    assert.equal(createGlitchSheetsAppearance().bodyStyle, 'glitch');
    const classic = createClassicAppearance();
    assert.equal(classic.bodyStyle, 'classic');
    assert.ok(classic.hair.g > classic.hair.r);
    const n = normalizeAppearance({ hair: { r: 300, g: -5, b: 10 } });
    assert.equal(n.hair.r, 255);
    assert.equal(n.hair.g, 0);
    assert.equal(n.hair.b, 10);
    assert.ok(n.pants);
  });

  it('moves an untouched old default to the vector Glitch, keeps a customised look', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    // v1 saves had no `v`.
    const v1 = (a) => { const { v, vector, ...rest } = normalizeAppearance(a); return JSON.stringify(rest); };
    store.set(STORAGE_KEY, v1(createClassicAppearance()));
    assert.equal(loadAppearance({ storage }).bodyStyle, 'vector');
    store.set(STORAGE_KEY, v1(createGlitchSheetsAppearance()));
    assert.equal(loadAppearance({ storage }).bodyStyle, 'vector');
    store.set(STORAGE_KEY, v1({ ...createClassicAppearance(), hair: { r: 200, g: 50, b: 50 } }));
    assert.equal(loadAppearance({ storage }).bodyStyle, 'classic');
    // A recoloured recovered-sheets look keeps its colours on the vector outfit.
    store.set(STORAGE_KEY, v1({ ...createGlitchSheetsAppearance(), shirt: { r: 200, g: 20, b: 30 }, skin: { r: 120, g: 90, b: 60 } }));
    const moved = loadAppearance({ storage });
    assert.equal(moved.bodyStyle, 'vector');
    assert.equal(moved.vector.tint.shirt, 'c8141e');
    assert.equal(moved.vector.skinTint, '785a3c');
    // v2 saves load as they are, including a chosen recovered-sheets look.
    saveAppearance(createGlitchSheetsAppearance(), { storage });
    assert.equal(loadAppearance({ storage }).bodyStyle, 'glitch');
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
    const html = readFileSync(join(__dirname, '../public/play/index.html'), 'utf8');
    assert.ok(html.includes('id="avatar-panel"'));
    assert.ok(html.includes('id="avatar-preview"'));
    assert.ok(html.includes('id="avatar-btn"'));
    assert.ok(html.includes('id="start-customize-btn"'));
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('openAvatarPanel'));
    assert.ok(game.includes('character-builder'));
    assert.ok(game.includes('applyPlayerAppearance'));
    assert.ok(game.includes('recolorImageData'));
    assert.ok(game.includes('renderVectorControls'));
    assert.ok(game.includes('bakeLook'));
    const css = readFileSync(join(__dirname, '../public/style.css'), 'utf8');
    assert.ok(css.includes('avatar-swatch'));
  });

  it('long wardrobe lists get a search box and Show all', () => {
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    for (const s of ['addChipFinder', 'VECTOR_CHIP_PAGE', 'vectorChipState', 'avatar-search', 'avatar-more-chip']) assert.ok(game.includes(s), s);
    const css = readFileSync(join(__dirname, '../public/style.css'), 'utf8');
    assert.ok(css.includes('.avatar-search') && css.includes('.avatar-style-chip[hidden]'));
  });
});

describe('vector presets', () => {
  const catalog = expandCatalog(JSON.parse(readFileSync(join(__dirname, '../public/assets/avatar/catalog.json'), 'utf8')));
  const hue = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const d = mx - Math.min(r, g, b);
    if (!d) return { h: 0, l: mx };
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return { h: h < 0 ? h + 360 : h, l: (mx + Math.min(r, g, b)) / 2 };
  };
  // Each colour theme the classic portrait used to recolour: its hair hue range (degrees).
  const THEMES = { blueberry: [190, 250], autumn: [10, 40], midnight: [220, 300], candy: [300, 350], forest: [80, 160] };

  it('rebuilds the five colour themes as vector looks in real GSJS articles, colourways and palettes', () => {
    for (const [id, [h0, h1]] of Object.entries(THEMES)) {
      const app = APPEARANCE_PRESETS[id].appearance;
      assert.equal(app.bodyStyle, 'vector', id);
      const v = app.vector;
      for (const [type, name] of Object.entries(v.outfit)) {
        if (name === 'none') continue;
        const it = catalog.types[type]?.find((i) => i.name === name);
        assert.ok(it, `${id} ${type}/${name} is in the catalog`);
        assert.ok(!it.reimagined && !it.swfOnly, `${id} ${type}/${name} is a GSJS article`);
        if (v.variant[type] !== undefined) assert.ok(v.variant[type] < (it.variants || []).length, `${id} ${type} colourway`);
      }
      // No recolouring: colourways and palette ids only.
      assert.deepEqual(v.tint, {}, id);
      assert.ok(!v.skinTint && !v.hairTint, id);
      assert.ok(catalog.palettes.skin.some((p) => p.id === v.skinColor), `${id} skin ${v.skinColor}`);
      const hair = catalog.palettes.hair.find((p) => p.id === v.hairColor);
      assert.ok(hair, `${id} hair ${v.hairColor}`);
      const { h, l } = hue(hair.color);
      assert.ok(h >= h0 && h <= h1, `${id} hair hue ${Math.round(h)}`);
      if (id === 'midnight') assert.ok(l < 0.25, 'midnight hair is dark');
    }
  });

  it('gives every vector preset its own look, and keeps the bitmap presets', () => {
    const keys = new Map();
    for (const p of Object.values(APPEARANCE_PRESETS)) {
      if (p.appearance.bodyStyle !== 'vector') continue;
      const key = lookKey(resolveLook(p.appearance.vector, catalog));
      assert.ok(!keys.has(key), `${p.id} looks like ${keys.get(key)}`);
      keys.set(key, p.id);
    }
    assert.equal(keys.size, 15);
    assert.equal(APPEARANCE_PRESETS.glitch.appearance.bodyStyle, 'glitch');
    assert.equal(APPEARANCE_PRESETS.classic.appearance.bodyStyle, 'classic');
    assert.equal(APPEARANCE_PRESETS.alt_base.appearance.bodyStyle, 'alt');
  });
});
