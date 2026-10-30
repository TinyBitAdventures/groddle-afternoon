/**
 * Character builder pure helpers.
 * Run: node --test tests/character-builder.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultAppearance,
  normalizeAppearance,
  appearanceToJson,
  appearanceFromJson,
  saveAppearance,
  loadAppearance,
  migrateAppearance,
  APPEARANCE_PRESETS,
  APPEARANCE_VERSION,
  BODY_STYLES,
  PRESET_GROUPS,
  RETIRED_BODY_STYLES,
  appearanceCacheKey,
  STORAGE_KEY,
} from '../public/js/character-builder.js?v=96976c4c';
import { expandCatalog, lookKey, resolveLook } from '../public/js/avatar-looks.js?v=64fab53e';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The retired bitmap presets as saved before (style + colours).
const OLD = {
  glitch: { bodyStyle: 'glitch', hair: { r: 205, g: 205, b: 232 }, skin: { r: 190, g: 190, b: 196 }, shirt: { r: 214, g: 240, b: 40 }, shirtDark: { r: 150, g: 170, b: 30 }, pants: { r: 100, g: 40, b: 110 }, shoes: { r: 120, g: 210, b: 40 }, sole: { r: 170, g: 60, b: 200 } },
  classic: { bodyStyle: 'classic', hair: { r: 72, g: 140, b: 72 }, skin: { r: 190, g: 180, b: 165 }, shirt: { r: 180, g: 30, b: 40 }, shirtDark: { r: 40, g: 32, b: 40 }, pants: { r: 50, g: 90, b: 140 }, shoes: { r: 50, g: 130, b: 50 }, sole: { r: 210, g: 195, b: 160 } },
  blueberry: { bodyStyle: 'classic', hair: { r: 70, g: 100, b: 200 }, skin: { r: 200, g: 185, b: 175 }, shirt: { r: 40, g: 90, b: 180 }, shirtDark: { r: 25, g: 40, b: 90 }, pants: { r: 40, g: 50, b: 80 }, shoes: { r: 40, g: 70, b: 140 }, sole: { r: 200, g: 200, b: 210 } },
  alt_base: { bodyStyle: 'alt', hair: { r: 150, g: 80, b: 160 }, skin: { r: 170, g: 120, b: 180 }, shirt: { r: 50, g: 90, b: 140 }, shirtDark: { r: 30, g: 50, b: 80 }, pants: { r: 60, g: 140, b: 90 }, shoes: { r: 200, g: 100, b: 60 }, sole: { r: 220, g: 180, b: 140 } },
};

describe('appearance model', () => {
  it('default + normalize clamps and fills slots; every look is vector', () => {
    const d = createDefaultAppearance();
    assert.equal(d.bodyStyle, 'vector');
    assert.deepEqual(Object.keys(BODY_STYLES), ['vector']);
    const n = normalizeAppearance({ hair: { r: 300, g: -5, b: 10 } });
    assert.equal(n.hair.r, 255);
    assert.equal(n.hair.g, 0);
    assert.equal(n.hair.b, 10);
    assert.ok(n.pants);
    for (const style of RETIRED_BODY_STYLES) assert.equal(normalizeAppearance({ bodyStyle: style }).bodyStyle, 'vector', style);
    assert.equal(d.v ?? normalizeAppearance(d).v, APPEARANCE_VERSION);
  });

  it('moves saves on the retired bitmap bodies to the nearest vector look', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const vec = (id) => normalizeAppearance(APPEARANCE_PRESETS[id].appearance).vector;
    // v1 (no `v`) and v2 saves alike.
    for (const v of [undefined, 2]) {
      const save = (a) => store.set(STORAGE_KEY, JSON.stringify(v ? { ...a, v } : a));
      // Untouched defaults: the vector default.
      save(OLD.classic);
      assert.deepEqual(loadAppearance({ storage }).vector, createDefaultAppearance().vector);
      save(OLD.glitch);
      assert.deepEqual(loadAppearance({ storage }).vector, createDefaultAppearance().vector);
      // The old colour themes: their vector rebuilds; the purple Alt body: Midnight.
      save(OLD.blueberry);
      assert.deepEqual(loadAppearance({ storage }).vector, vec('blueberry'));
      save(OLD.alt_base);
      const alt = loadAppearance({ storage });
      assert.equal(alt.bodyStyle, 'vector');
      assert.deepEqual(alt.vector, vec('midnight'));
      // A recoloured classic or alt look keeps its colours on the vector outfit.
      for (const style of ['classic', 'alt', 'glitch']) {
        save({ ...OLD.classic, bodyStyle: style, shirt: { r: 200, g: 20, b: 30 }, skin: { r: 120, g: 90, b: 60 } });
        const moved = loadAppearance({ storage });
        assert.equal(moved.bodyStyle, 'vector', style);
        assert.equal(moved.vector.tint.shirt, 'c8141e', style);
        assert.equal(moved.vector.skinTint, '785a3c', style);
        assert.equal(moved.v, APPEARANCE_VERSION);
      }
    }
    // Vector saves load as they are.
    saveAppearance(APPEARANCE_PRESETS.costume_rook.appearance, { storage });
    assert.deepEqual(loadAppearance({ storage }).vector, vec('costume_rook'));
    assert.equal(appearanceFromJson(JSON.stringify(OLD.alt_base)).bodyStyle, 'vector');
    assert.equal(migrateAppearance(null).bodyStyle, 'vector');
  });

  it('json round-trip and storage mock', () => {
    const a = normalizeAppearance({
      hair: { r: 200, g: 50, b: 50 },
      shirt: { r: 10, g: 20, b: 200 },
      vector: APPEARANCE_PRESETS.costume_mab.appearance.vector,
    });
    const json = appearanceToJson(a);
    const b = appearanceFromJson(json);
    assert.equal(b.hair.r, 200);
    assert.equal(b.shirt.b, 200);
    assert.deepEqual(b.vector, a.vector);
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

  it('every preset is a vector look in a known group', () => {
    assert.ok(Object.keys(APPEARANCE_PRESETS).length >= 5);
    const groups = new Set(PRESET_GROUPS.map((g) => g.id));
    for (const p of Object.values(APPEARANCE_PRESETS)) {
      assert.equal(p.appearance.bodyStyle, 'vector', p.id);
      assert.ok(groups.has(p.group || 'looks'), p.id);
    }
    for (const id of ['glitch', 'classic', 'alt_base']) assert.equal(APPEARANCE_PRESETS[id], undefined, id);
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
    assert.ok(!game.includes('recolorImageData'));
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

  it('dresses a dozen matching costumes from the GSJS wardrobe, nothing recoloured', () => {
    const costumes = Object.values(APPEARANCE_PRESETS).filter((p) => p.group === 'costumes');
    assert.ok(costumes.length >= 12, `${costumes.length} costumes`);
    assert.ok(PRESET_GROUPS.some((g) => g.id === 'costumes'));
    // Sets named after films, brands or characters stay out.
    const banned = /catwoman|godzilla|tron|ultraman|skywalker|boardwalk|japnese_school_girl/i;
    for (const p of costumes) {
      const v = p.appearance.vector;
      assert.equal(p.appearance.bodyStyle, 'vector', p.id);
      assert.ok(v.outfit.hat && v.outfit.hat !== 'none', `${p.id} wears its costume headpiece`);
      for (const [type, name] of Object.entries(v.outfit)) {
        if (name === 'none') continue;
        assert.doesNotMatch(name, banned, p.id);
        const it = catalog.types[type]?.find((i) => i.name === name);
        assert.ok(it, `${p.id} ${type}/${name} is in the catalog`);
        assert.ok(!it.reimagined && !it.swfOnly, `${p.id} ${type}/${name} is a GSJS article`);
        assert.ok((v.variant[type] ?? 0) < Math.max(1, (it.variants || []).length), `${p.id} ${type} colourway`);
      }
      for (const type of ['eyes', 'mouth', 'nose', 'ears', 'shirt', 'pants', 'coat']) assert.ok(v.outfit[type], `${p.id} fills ${type}`);
      assert.deepEqual(v.tint, {}, p.id);
      assert.ok(!v.skinTint && !v.hairTint, p.id);
      assert.ok(catalog.palettes.skin.some((c) => c.id === v.skinColor), `${p.id} skin`);
      assert.ok(catalog.palettes.hair.some((c) => c.id === v.hairColor), `${p.id} hair`);
    }
    // The giants and the Rook wear their own masks over their own robes.
    const giants = { costume_rook: ['rook_mask', 'rook_outfit_top'], costume_mab: ['mab_mask', 'mab'], costume_cosma: ['cosma_hat', 'cosma_coat'], costume_alph: ['alph_mask', 'alph_lem'], costume_lem: ['Lem_mask', 'alph_lem'], costume_grendaline: ['grendaline_mask', 'Grendaline_tii_outfit'] };
    for (const [id, [hat, coat]] of Object.entries(giants)) {
      assert.equal(APPEARANCE_PRESETS[id].appearance.vector.outfit.hat, hat, id);
      assert.equal(APPEARANCE_PRESETS[id].appearance.vector.outfit.coat, coat, id);
    }
  });

  it('gives every vector preset its own look', () => {
    const keys = new Map();
    for (const p of Object.values(APPEARANCE_PRESETS)) {
      if (p.appearance.bodyStyle !== 'vector') continue;
      const key = lookKey(resolveLook(p.appearance.vector, catalog));
      assert.ok(!keys.has(key), `${p.id} looks like ${keys.get(key)}`);
      keys.set(key, p.id);
    }
    assert.equal(keys.size, 28);
  });
});
