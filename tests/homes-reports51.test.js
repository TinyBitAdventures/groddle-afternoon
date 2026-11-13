// Player reports 51-57 (2026-11-03, build 69a9345e): the house's side-wall seams, the style
// picker over its piece, the swatch categories read sideways, price tags left behind, the
// signpost editor's dead buttons, and a stay at home that outlived a visit to a friend's.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { END_SEAM, roomPieces } from '../public/js/home-wallpaper.js?v=f1969400';
import { WALLPAPER_MAPS } from '../public/js/home-wallpaper-art.js?v=9f8473e6';
import { DOCK_GAP, DOCK_W, dockedPickerSpot } from '../public/js/furniture-upgrade-picker.js?v=3a637ec8';
import { filterSwatches, swatchFilters } from '../public/js/ui/home-builder.js?v=8100230a';
import { listTextures } from '../public/js/home-decor.js?v=06be9c65';
import { salePlacementKey } from '../public/js/home-street-mp.js?v=1a19b084';
import { beginHomeVisit, createHomeState, imagineHome } from '../public/js/homes.js?v=631ab6b8';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const homes = read('public/js/features/homes-feature.js');
const street = read('public/js/features/home-street-mp-feature.js');
const css = read('public/style.css');
const gsjs = join(root, '../glitch-GameServerJS');
const client = join(root, '../glitch-client/com/tinyspeck/engine');

describe('51b: no sky between the back wall and the side walls', () => {
  const state = { walls: Array(7).fill('grey_unfinished'), floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling' };

  it('each end piece reaches under the back wall; its outer edge stays put', () => {
    const r = roomPieces(state);
    const ends = r.pieces.filter((p) => p.layer === 'wall' && p.h === 458 && !p.outside);
    assert.equal(ends.length, 2);
    const [left, right] = ends.sort((a, b) => a.x - b.x);
    assert.deepEqual([left.x, left.w], [0, 150 + END_SEAM]);
    assert.deepEqual([right.x + right.w, right.w], [r.width, 150 + END_SEAM]);
    assert.ok(END_SEAM >= 1);
  });

  it('the open end into the back yard too; the stamping targets keep the source\'s 150 px', () => {
    const r = roomPieces(state, { leftOpen: true });
    const open = r.pieces.find((p) => p.layer === 'wall' && p.h === 393);
    assert.deepEqual([open.x, open.w], [0, 150 + END_SEAM]);
    assert.ok(r.walls.every((w) => w.w === 150));
  });

  it('a Tower floor\'s right end the same', () => {
    const r = roomPieces({ layout: 'tower', walls: [], wall: 'grey_unfinished', floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling' });
    const end = r.pieces.find((p) => p.layer === 'wall' && p.h === 458);
    assert.equal(end.w, 150 + END_SEAM);
  });
});

describe('51a/c: what the original sold and stored at home (source facts the reply relies on)', () => {
  it('furniture is sold by furniture_base; other things only through a Storage Display Box', { skip: !existsSync(gsjs) }, () => {
    const lamp = readFileSync(join(gsjs, 'items/furniture_tablelamp.js'), 'utf8');
    assert.match(lamp, /verbs\.set_sale_price = \{ \/\/ defined by furniture_base/);
    const sdb = readFileSync(join(gsjs, 'items/bag_furniture_sdb.js'), 'utf8');
    assert.match(sdb, /verbs\.set_selling_price = \{/);
    assert.match(sdb, /stack\.is_bag \|\| stack\.is_trophy \|\| stack\.has_parent\('furniture_base'\)/);
  });

  it('the cabinets were storage: width x height slots, opened by the owner or a key holder', { skip: !existsSync(gsjs) }, () => {
    for (const [cls, w, h] of [['bag_furniture_cabinet', 4, 8], ['bag_furniture_smallcabinet', 4, 4], ['bag_furniture_wallcabinet', 3, 3]]) {
      const src = readFileSync(join(gsjs, `items/${cls}.js`), 'utf8');
      assert.match(src, new RegExp(`"width"\\t: "${w}"`), cls);
      assert.match(src, new RegExp(`"height"\\t: "${h}"`), cls);
      assert.match(src, /type: "cabinet_start"/, cls);
      assert.match(src, /acl_keys_player_has_key\(pc\)/, cls);
    }
  });
});

describe('52: the style picker stands beside its piece, not over it', () => {
  const area = { left: 0, right: 1440, top: 100, bottom: 520 };

  it('to the right of the piece, the source\'s gap and width, centred in the free height', () => {
    const spot = dockedPickerSpot({ piece: { left: 400, right: 520, top: 230, bottom: 390 }, area, w: DOCK_W, h: 300 });
    assert.equal(spot.side, 'right');
    assert.equal(spot.x, 520 + DOCK_GAP);
    assert.equal(spot.y, Math.round(100 + (420 - 300) / 2));
    assert.ok(spot.x >= 520, 'it never covers the piece');
    assert.deepEqual([DOCK_W, DOCK_GAP], [572 - 250 - 10 - 20, 50]);
  });

  it('to the left when the right has no room (a piece by the far wall)', () => {
    const spot = dockedPickerSpot({ piece: { left: 1180, right: 1300, top: 230, bottom: 390 }, area, w: DOCK_W, h: 300 });
    assert.equal(spot.side, 'left');
    assert.equal(spot.x + DOCK_W, 1180 - DOCK_GAP);
  });

  it('a column taller than the free space is held inside it', () => {
    const spot = dockedPickerSpot({ piece: { left: 400, right: 520, top: 230, bottom: 390 }, area, w: DOCK_W, h: 2000 });
    assert.equal(spot.y, 108);
    assert.equal(spot.h, 420 - 16);
  });

  it('the homes feature anchors it, frames the piece with the camera, and Escape cancels it', () => {
    assert.match(homes, /anchor: \(\) => pieceClientRect\(engine, item\.id\)/);
    assert.match(homes, /if \(ok\) frameUpgradePiece\(engine, item\.id\);/);
    assert.match(homes, /if \(upgradePickerOpen\(\)\) placeUpgradePicker\(\);/);
    assert.match(homes, /if \(upgradePickerOpen\(\)\) \{\s*closeUpgradePicker\(true\);/);
  });

  it('the original placed it so (FurnUpgradeDialog.as in-place mode)', { skip: !existsSync(client) }, () => {
    const src = readFileSync(join(client, 'port/FurnUpgradeDialog.as'), 'utf8');
    // _jigger 643-646: _w = 572, less PREVIEW_WH 250, PREVIEW_PADD 10 and _base_padd 20 in place.
    assert.match(src, /_w = 572[\s\S]{0,40}if \(_loc_mode\) \{\s*_w = _w - PREVIEW_WH - PREVIEW_PADD - _base_padd;/);
    assert.match(src, /dest_x \+= Math\.max\(\(dm\.upgrade_itemstack\.client::physWidth\/2\) \+ 50/);
  });
});

describe('53: swatch categories read across, as filter buttons', () => {
  it('All, then each category by name (SwatchBagUI / BagFilterUI)', () => {
    const rows = listTextures('ceiling');
    const f = swatchFilters(rows);
    assert.deepEqual(f.map((x) => x.id), ['all', 'Concrete', 'Novelty', 'Stucco', 'Wood']);
    assert.equal(f[0].count, rows.length);
    assert.ok(filterSwatches(rows, 'Novelty').every((r) => r.category === 'Novelty'));
    assert.ok(filterSwatches(rows, 'Novelty').some((r) => r.key === 'spaceship_ceiling'));
    assert.equal(filterSwatches(rows, 'all').length, rows.length);
    assert.deepEqual(swatchFilters([{ category: 'Plain' }]), [], 'one category needs no row');
    assert.equal(swatchFilters([{ category: 'Plain' }, {}])[2].id, 'Plain');
  });

  it('the swatch tabs pass the filters to the tray; no label is turned on its side', () => {
    assert.match(homes, /filters,\s*filter,\s*filtersLabel: `Show \$\{kind\} swatches`/);
    const rule = css.match(/#game-root \.hb-strip \.hb-group \{[^}]*\}/)[0];
    assert.doesNotMatch(rule, /writing-mode|rotate/);
  });

  it('the ceilings are the SWF renders the source named (the Spaceship Ceiling is its riveted panel)', () => {
    const plan = JSON.parse(read('tools/home-wallpaper/plan.json'));
    assert.equal(WALLPAPER_MAPS.ceilings.spaceship_ceiling.main, 'spaceship_ceililng');
    for (const [key, map] of Object.entries(WALLPAPER_MAPS.ceilings)) {
      const piece = String(map.main).split(',')[0];
      assert.ok(plan.pieces[piece]?.swf_sha, `${key}: ${piece} rendered from its SWF`);
      assert.equal(plan.pieces[piece].bundle, 'home_wallpaper', key);
    }
  });
});

describe('55: a price tag goes where its piece goes', () => {
  it('the placement key changes when a piece moves or is restyled, and only then', () => {
    const placed = [{ id: 3, x: 400, y: 620 }, { id: 4, x: 700, y: 620, upgradeId: '' }];
    const k = salePlacementKey(placed, 1280);
    assert.equal(salePlacementKey(placed.map((p) => ({ ...p })), 1280), k);
    assert.notEqual(salePlacementKey([{ ...placed[0], x: 520 }, placed[1]], 1280), k);
    assert.notEqual(salePlacementKey([placed[0], { ...placed[1], upgradeId: '2' }], 1280), k);
    assert.notEqual(salePlacementKey(placed, 1300), k, 'the room shifted (Expand)');
  });

  it('the feature redraws the tags from the key on its tick', () => {
    assert.match(street, /salePlacementKey\(st\.houseDecor\.placed, ownGeometry\(\)\.house\.roomX\) !== salesKey\) drawOwnSales\(\)/);
    assert.match(street, /salesKey = salePlacementKey\(decor\.placed, geo\.house\.roomX\);/);
  });
});

describe('56: the signpost editor comes back with live buttons', () => {
  it('the arms are drawn after busy is cleared', () => {
    const body = street.slice(street.indexOf('async function signpostChange'), street.indexOf('function addNeighbor'));
    assert.ok(body.indexOf('busy = false;') < body.lastIndexOf('openSignpost();'), 'openSignpost runs once the change is done');
    assert.doesNotMatch(body.slice(body.indexOf('try {'), body.indexOf('} catch')), /openSignpost\(\)/);
  });
});

describe('57: a visit to a friend\'s home from yours ends your stay at home', () => {
  it('a stay left set refuses the next trip home (why the World menu said you were home)', () => {
    const home = createHomeState();
    imagineHome(home, 'meadow', 1);
    assert.equal(beginHomeVisit(home, { tsid: 'LA1', label: 'A' }).ok, true);
    assert.equal(beginHomeVisit(home, { tsid: 'LA2', label: 'B' }).reason, 'already_home');
  });

  it('a scene that leads back to the world clears it; one that leads home keeps it', () => {
    assert.match(game, /if \(homeState\.inHome && scene\.returnTo\?\.tsid && scene\.returnTo\.tsid !== HOME_STREET_TSID && scene\.returnTo\.tsid !== HOME_INTERIOR_TSID\) homeState\.inHome = false;/);
  });

  it('any trip to a world street clears it, from a scene too', () => {
    const enter = game.slice(game.indexOf('  async enter(tsid, opts = {}) {'), game.indexOf('// G213: every energy/mood gain'));
    assert.match(enter, /if \(homeState\.inHome\) homeState\.inHome = false;\s*const resolved = resolveIndexTsid/);
    assert.doesNotMatch(enter, /if \(homeIsInstanced\(\)\) homeState\.inHome = false;/);
  });

  it('Teleport home from a scene remembers the street the scene leads back to', () => {
    assert.match(game, /const source = homeTripSource\(\);/);
    assert.match(game, /function homeTripSource\(\) \{\s*const back = engine\.inScene\(\) \? engine\.sceneReturnTo : null;/);
  });
});
