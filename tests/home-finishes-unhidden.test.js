import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_TEXTURE_CONFIGS } from '../public/js/homes-catalog.js?v=0367f90f';
import { WALLPAPER_MAPS, WALLPAPER_PIECES } from '../public/js/home-wallpaper-art.js?v=129c514f';
import { ceilingSprite, roomPieces, swatchPiece } from '../public/js/home-wallpaper.js?v=5d3594e4';
import { createHomeDecorState, listTextures, setHomeTexture, textureCategory } from '../public/js/home-decor.js?v=0fd93a2f';
import { filterSwatches, swatchFilters } from '../public/js/ui/home-builder.js?v=f67c1361';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');

// inc_data_homes.js: is_visible false on each; names and cost_credits as Tiny Speck left them.
const UNHIDDEN = {
  walls: { blue_tiles: ['Blue Tiles', 25], darkstar_black: ['Dark Starry Sky Wallpaper', 40], club_light: ['Pastel Glow Wallpaper', 25] },
  floors: { darkstar_black_floor: ['Dark Starry Sky Floor', 25], rook_forestfloor: ['Rook Forest Floor', 0], sky_dark_floor: ['Starry Sky Floor', 25] },
  ceilings: { darkstar_black_ceiling: ['Dark Starry Sky Ceiling', 25], rook_forest: ['Rook Forest Ceiling', 0] },
};
const KIND = { walls: 'wall', floors: 'floor', ceilings: 'ceiling' };

describe('G400: the hidden home finishes whose art survives are in Decorate', () => {
  it('lists each with its GSJS name and price', () => {
    for (const [kind, rows] of Object.entries(UNHIDDEN)) {
      for (const [key, [name, credits]] of Object.entries(rows)) {
        const row = HOME_TEXTURE_CONFIGS[kind][key];
        assert.ok(row, `${kind} ${key}`);
        assert.equal(row.name, name);
        assert.equal(row.costCredits, credits, key);
        assert.ok(listTextures(KIND[kind]).some((r) => r.key === key), `${key} in the swatch tray`);
      }
    }
  });

  it('leaves the test asset out', () => {
    assert.equal(HOME_TEXTURE_CONFIGS.ceilings.test_greenhouse_ceiling, undefined);
    assert.equal(WALLPAPER_MAPS.ceilings.test_greenhouse_ceiling, undefined);
  });

  it('draws each from its recovered pieces and swatch', () => {
    for (const [kind, rows] of Object.entries(UNHIDDEN)) {
      for (const key of Object.keys(rows)) {
        const map = WALLPAPER_MAPS[kind][key];
        assert.ok(map, `${kind} ${key}`);
        for (const value of Object.values(map)) {
          const piece = value.split(',')[0];
          assert.ok(WALLPAPER_PIECES[piece], `${key}: ${piece}`);
          assert.ok(existsSync(join(root, 'public/assets/homes/wallpaper', `${piece}@2x.webp`)), piece);
        }
        assert.ok(swatchPiece(KIND[kind], key), `${key} swatch`);
      }
    }
    assert.equal(WALLPAPER_MAPS.walls.darkstar_black.wall_right, 'darkstar_black_wall_left,FLIP');
    assert.equal(WALLPAPER_MAPS.floors.rook_forestfloor.main_4, 'rook_forest_floor_4');
  });

  it('builds the Dark Starry Sky Ceiling without its lost left piece (homes_get_ceiling_sprite never draws it)', () => {
    const map = WALLPAPER_MAPS.ceilings.darkstar_black_ceiling;
    assert.equal(map.left, undefined);
    assert.equal(WALLPAPER_PIECES.darkstar_black_ceiling_left, undefined);
    assert.deepEqual([0, 1, 2, 3].map((i) => ceilingSprite(i, map)), ['darkstar_black_ceiling', 'darkstar_black_ceiling_2', 'darkstar_black_ceiling', 'darkstar_black_ceiling_2']);
    const room = roomPieces({ walls: Array(5).fill('darkstar_black'), floor: 'darkstar_black_floor', ceiling: 'darkstar_black_ceiling' });
    const ceil = room.pieces.filter((p) => p.target === 'ceiling').map((p) => p.piece);
    assert.ok(ceil.length >= 5);
    assert.ok(ceil.every((p) => WALLPAPER_PIECES[p]), ceil.join());
  });

  it('applies like any other swatch', () => {
    const state = createHomeDecorState();
    assert.equal(setHomeTexture(state, 'wall', 'blue_tiles').ok, true);
    assert.equal(setHomeTexture(state, 'floor', 'rook_forestfloor').ok, true);
    assert.equal(setHomeTexture(state, 'ceiling', 'darkstar_black_ceiling').ok, true);
    assert.equal(setHomeTexture(state, 'ceiling', 'test_greenhouse_ceiling').ok, false);
  });

  it('shows the uncategorised Rook Forest pair under Other, as SwatchBagUI did', () => {
    assert.equal(HOME_TEXTURE_CONFIGS.floors.rook_forestfloor.category, null);
    assert.equal(textureCategory(HOME_TEXTURE_CONFIGS.floors.rook_forestfloor), 'Other');
    const floors = listTextures('floor');
    assert.ok(swatchFilters(floors).some((f) => f.id === 'Other'));
    assert.deepEqual(filterSwatches(floors, 'Other').map((r) => r.key), ['rook_forestfloor']);
    const homes = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(homes, /const heading = filter === 'all' \? textureCategory\(row\) : '';/);
  });

  it('matches the source: these are the hidden configs, bar the test ceiling', { skip: !existsSync(join(gsjs, 'inc_data_homes.js')) }, async () => {
    const { homeConfigs, UNHIDDEN_FINISHES } = await import('../tools/home-wallpaper/configs.mjs');
    const cfg = homeConfigs();
    for (const kind of ['walls', 'floors', 'ceilings']) {
      const hidden = Object.keys(cfg[kind]).filter((k) => cfg[kind][k].is_visible !== true && k !== 'test_greenhouse_ceiling').sort();
      assert.deepEqual(Object.keys(UNHIDDEN_FINISHES[kind]).sort(), hidden, kind);
      assert.deepEqual(Object.keys(UNHIDDEN[kind]).sort(), hidden, kind);
      for (const key of hidden) {
        assert.equal(cfg[kind][key].shown, true);
        assert.equal(HOME_TEXTURE_CONFIGS[kind][key].costCredits, Number(cfg[kind][key].cost_credits), key);
      }
    }
    assert.equal(cfg.ceilings.test_greenhouse_ceiling.shown, false);
  });
});
