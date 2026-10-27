/**
 * Source-backed Cubimal Series 1/2 box, collection, and freedom loop.
 * Run: node --test tests/cubimals.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUBIMAL_FREE_RESPONSES,
  CUBIMAL_SERIES,
  cubimalCollectionProgress,
  cubimalInfo,
  cubimalPackageInfo,
  ensureCubimalItems,
  openCubimalPackage,
  selectCubimal,
  setCubimalFree,
} from '../public/js/cubimals.js';
import {
  ITEM_CATALOG,
  addItem,
  countItem,
  createInventory,
  listPackItemSlots,
} from '../public/js/inventory.js?v=catalog-unified-7';
import {
  applyAchievementProgress,
  createAchievementState,
  getAchievementProgress,
} from '../public/js/achievements.js?v=g366-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');

function pngSize(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

before(async () => {
  ensureCubimalItems();
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

describe('official Cubimal package tables', () => {
  it('preserves all 23 Series 1 and 20 Series 2 cumulative cutoffs', () => {
    assert.equal(CUBIMAL_SERIES[1].length, 23);
    assert.equal(CUBIMAL_SERIES[2].length, 20);
    assert.deepEqual(
      CUBIMAL_SERIES[1].map(({ slug, cutoff }) => [slug, cutoff]),
      [
        ['chick', 17], ['piggy', 34], ['butterfly', 50], ['crab', 58],
        ['batterfly', 66], ['frog', 74], ['firefly', 82], ['bureaucrat', 84],
        ['cactus', 86], ['snoconevendor', 88], ['squid', 90], ['juju', 92],
        ['smuggler', 93.25], ['deimaginator', 94.5], ['greeterbot', 95.75],
        ['dustbunny', 97], ['gwendolyn', 97.5], ['unclefriendly', 98],
        ['helga', 98.5], ['magicrock', 99], ['yeti', 99.5], ['rube', 99.75],
        ['rook', 100],
      ]
    );
    assert.deepEqual(
      CUBIMAL_SERIES[2].map(({ slug, cutoff }) => [slug, cutoff]),
      [
        ['fox', 14.5], ['sloth', 29], ['emobear', 37], ['foxranger', 45],
        ['groddlestreetspirit', 54], ['uraliastreetspirit', 61],
        ['firebogstreetspirit', 69], ['gnome', 77], ['butler', 81],
        ['craftybot', 85], ['phantom', 89], ['ilmenskiejones', 93],
        ['trisor', 94], ['toolvendor', 95], ['mealvendor', 96],
        ['gardeningtoolsvendor', 97], ['maintenancebot', 98],
        ['senorfunpickle', 99], ['hellbartender', 99.5], ['scionofpurple', 100],
      ]
    );
  });

  it('selects exact boundary prizes deterministically', () => {
    assert.equal(selectCubimal('cubimal_package', 0).classTsid, 'npc_cubimal_chick');
    assert.equal(selectCubimal('cubimal_package', 0.17).classTsid, 'npc_cubimal_chick');
    assert.equal(selectCubimal('cubimal_package', 0.170001).classTsid, 'npc_cubimal_piggy');
    assert.equal(selectCubimal('cubimal_package', 0.999).classTsid, 'npc_cubimal_rook');
    assert.equal(selectCubimal('cubimal_package', 1).classTsid, 'npc_cubimal_rook');
    assert.equal(selectCubimal('cubimal_package_2', 0.995).classTsid, 'npc_cubimal_hellbartender');
    assert.equal(selectCubimal('cubimal_package_2', 1).classTsid, 'npc_cubimal_scionofpurple');
    assert.equal(selectCubimal('not_a_box', 0), null);
  });

  it('registers source package and collectible metadata', () => {
    assert.equal(cubimalPackageInfo('cubimal_package').series, 1);
    assert.equal(cubimalPackageInfo('cubimal_package_2').series, 2);
    assert.equal(ITEM_CATALOG.cubimal_package.baseCost, 5_000);
    assert.equal(ITEM_CATALOG.cubimal_package.stackMax, 1);
    assert.equal(ITEM_CATALOG.npc_cubimal_chick.stackMax, 1);
    assert.equal(ITEM_CATALOG.npc_cubimal_chick.sellable, false);
    assert.equal(ITEM_CATALOG.npc_cubimal_chick.donatable, false);
    const chickSlot = listPackItemSlots(
      createInventory({ npc_cubimal_chick: 1 })
    ).find((slot) => slot.classTsid === 'npc_cubimal_chick');
    assert.equal(chickSlot.icon, 'assets/sprites/icons/npc_cubimal_chick.png');
  });
});

describe('Cubimal pack lifecycle', () => {
  it('atomically replaces one box with exactly one deterministic figure', () => {
    const inv = createInventory({ cubimal_package: 1 });
    const result = openCubimalPackage(inv, 'cubimal_package', 0);
    assert.equal(result.ok, true);
    assert.equal(result.prize.classTsid, 'npc_cubimal_chick');
    assert.equal(countItem(inv, 'cubimal_package'), 0);
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 1);
    assert.deepEqual(result.collection, {
      series: 1,
      owned: 1,
      total: 23,
      ids: ['npc_cubimal_chick'],
    });
  });

  it('does not mutate a missing box and supports the Series 2 rare endpoint', () => {
    const missing = createInventory();
    assert.equal(openCubimalPackage(missing, 'cubimal_package', 0).reason, 'missing');
    assert.equal(countItem(missing, 'npc_cubimal_chick'), 0);

    const inv = createInventory({ cubimal_package_2: 1 });
    const result = openCubimalPackage(inv, 'cubimal_package_2', 1);
    assert.equal(result.prize.classTsid, 'npc_cubimal_scionofpurple');
    assert.equal(result.collection.owned, 1);
    assert.equal(result.collection.total, 20);
  });

  it('counts unique collection entries even when duplicate figures are held', () => {
    const inv = createInventory({ npc_cubimal_chick: 2, npc_cubimal_piggy: 1 });
    assert.deepEqual(cubimalCollectionProgress(inv, 1), {
      series: 1,
      owned: 2,
      total: 23,
      ids: ['npc_cubimal_chick', 'npc_cubimal_piggy'],
    });
  });

  it('sets common figures free for exact iMG and preserves rare figures', () => {
    const inv = createInventory({ npc_cubimal_chick: 1, npc_cubimal_rook: 1 });
    const pc = { imagination: 100, xp: 200 };
    const freed = setCubimalFree(inv, pc, 'npc_cubimal_chick', 0);
    assert.equal(freed.ok, true);
    assert.equal(freed.reward, 400);
    assert.equal(freed.response, CUBIMAL_FREE_RESPONSES[0]);
    assert.equal(countItem(inv, 'npc_cubimal_chick'), 0);
    assert.deepEqual(pc, { imagination: 500, xp: 600 });

    const rare = setCubimalFree(inv, pc, 'npc_cubimal_rook', 0);
    assert.equal(rare.reason, 'rare');
    assert.equal(countItem(inv, 'npc_cubimal_rook'), 1);
    assert.equal(cubimalInfo('npc_cubimal_rook').setFreeImg, 0);
  });
});

describe('Cubimal achievements and clean art', () => {
  it('routes acquisition and freedom to the original badge counters', () => {
    const state = createAchievementState();
    applyAchievementProgress(state, 'in_inventory:npc_cubimal_chick', 1);
    const collection = getAchievementProgress(state, 'collection_cubimals');
    assert.equal(
      collection.conditions.find((row) => row.name === 'npc_cubimal_chick').current,
      1
    );

    applyAchievementProgress(state, 'cubimals_freed:npc_cubimal_chick', 1);
    const friend = getAchievementProgress(state, 'friend_of_cubimals');
    const releaser = getAchievementProgress(state, 'first_series_releaser');
    assert.equal(friend.conditions[0].current, 1);
    assert.equal(
      releaser.conditions.find((row) => row.name === 'npc_cubimal_chick').current,
      1
    );
  });

  it('ships one crisp transparent PNG for every official figure', () => {
    const iconDir = join(publicRoot, 'assets/sprites/icons');
    const files = readdirSync(iconDir)
      .filter((file) => /^npc_cubimal_[^@]+\.png$/.test(file))
      .sort();
    assert.equal(files.length, 43);
    for (const rows of Object.values(CUBIMAL_SERIES)) {
      for (const row of rows) {
        const file = join(iconDir, `${row.classTsid}.png`);
        assert.equal(existsSync(file), true, row.classTsid);
        const { width, height } = pngSize(file);
        assert.ok(width > 0 && width <= 50, `${row.classTsid} width ${width}`);
        assert.ok(height > 0 && height <= 50, `${row.classTsid} height ${height}`);
      }
    }
  });

  it('wires package use, freedom, deterministic QA, and the cache marker', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /function openPackedCubimalBox\(/);
    assert.match(game, /function setPackedCubimalFree\(/);
    assert.match(game, /stat === 'xp' \? 'iMG' : stat/);
    const cubimalHandlers = game.slice(
      game.indexOf('function openPackedCubimalBox('),
      game.indexOf('function playPackMusicblock(')
    );
    assert.match(cubimalHandlers, /new URLSearchParams\(location\.search\)/);
    assert.doesNotMatch(cubimalHandlers, /\bbootParams\b/);
    assert.match(game, /in_inventory:\$\{result\.prize\.classTsid\}/);
    assert.match(game, /cubimals_freed:\$\{classTsid\}/);
    assert.match(game, /dataset\.cubimalPrize/);
    assert.match(game, /cubimaldemo/);
    assert.match(game, /cubimalautoplay/);
    assert.match(html, /cubimals=1/);
  });
});
