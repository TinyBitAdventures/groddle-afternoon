/**
 * The Give pop-up's breakdown (Austin 2026-11-24: "as an admin I want to know which items can only be
 * given out by admins as they aren't yet implemented in game"). tools/build-item-sources.mjs writes
 * groddle-afternoon-site data/item-sources.json from the game's own data (the Item Catalog's ways,
 * the remake's supply tables, the coverage inventory, the economy table's gate); the site's
 * admin/catalog route joins it onto the give catalog (src/AdminConsole.php catalog, itemSource) and
 * the console groups it by category (console/console.js itemGroups, the Browse view). The --check
 * here keeps the file from going stale. Glitch carried no rarity scale (only a "rare" tag on a few
 * numbered limited editions), so price shows as price.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { GSJS, INVENTORY_DB } from '../tools/catalog/build.mjs';
import { KINDS, OBTAINABLE, WHY, sourceRow, supplyKind } from '../tools/build-item-sources.mjs';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const skipBuild = skipWithoutSite
  || (!existsSync(INVENTORY_DB) && `needs the coverage inventory at ${INVENTORY_DB}`)
  || (!existsSync(join(GSJS, 'items')) && `needs glitch-GameServerJS at ${GSJS}`);
const sources = () => JSON.parse(readFileSync(sitePath('data/item-sources.json'), 'utf8'));

describe('where each give class comes from (tools/build-item-sources.mjs)', () => {
  const food = { category: 'Food', status: 'source', get: ['sold', 'made'], price: 5 };

  it('takes the catalog\'s category and ways; never finished or left out is admin only, with why', () => {
    assert.deepEqual(OBTAINABLE, ['source', 'multiplayer']);
    assert.deepEqual(sourceRow({ catalog: food }), { cat: 'Food', src: ['sold', 'made'], ok: 1, price: 5 });
    assert.deepEqual(sourceRow({ catalog: { category: 'Tools', status: 'multiplayer', get: [], price: 1000 } }), { cat: 'Tools', src: ['multiplayer'], ok: 1, price: 1000 });
    assert.deepEqual(sourceRow({ catalog: { category: 'Toys and games', status: 'unbuilt_original', get: [], price: 1009 } }), { cat: 'Toys and games', src: [], ok: 0, price: 1009, why: WHY.unbuilt_original });
  });

  it('a class the catalog leaves out: the inventory, its category from GSJS', () => {
    const gsjs = { tags: ['toys'], parents: ['npc_cubimal_fox', 'npc_cubimal_base'], takeable: true, baseCost: 0 };
    assert.deepEqual(sourceRow({ inventory: { status: 'source', evidence: 'obtainable: addItem (dynamic) at js/cubimals.js:190' }, gsjs }), { cat: 'Toys and games', src: ['other'], ok: 1 });
    assert.deepEqual(sourceRow({ inventory: { status: 'source', evidence: 'obtainable: vendor:hardware' }, gsjs }).src, ['sold']);
    assert.deepEqual(sourceRow({ inventory: { status: 'excluded', evidence: 'catalog_tags/tags: deleted' }, gsjs: { tags: ['machineparts_products'], parents: [], baseCost: 2500 } }), { cat: 'Machines', src: [], ok: 0, price: 2500, why: WHY.excluded });
  });

  it('the remake\'s supply tables win over a stale judgement; the economy\'s credit gate wins over all', () => {
    const tube = sourceRow({ inventory: { status: 'excluded', evidence: 'test/admin id' }, gsjs: { tags: [], parents: ['test_tube', 'tool_base'], baseCost: 100 }, supply: 'vendor:alchemical' });
    assert.deepEqual(tube, { cat: 'Tools', src: ['sold'], ok: 1, price: 100 });
    assert.deepEqual(sourceRow({ catalog: food, supply: 'trant' }).src, ['sold', 'made'], 'the catalog\'s ways stay the account');
    assert.deepEqual(sourceRow({ catalog: food, gate: 'credit' }), { cat: 'Food', src: [], ok: 0, price: 5, why: WHY.credit });
    // The remake's own classes (not Glitch's): obtainable unless nothing names them.
    assert.deepEqual(sourceRow({ trade: { food: true } }), { cat: 'Food', src: ['other'], ok: 1 });
    assert.deepEqual(sourceRow({ gate: 'credit' }), { cat: 'Other', src: [], ok: 0, why: WHY.credit });
    assert.equal(supplyKind('vendor:produce'), 'sold');
    assert.equal(supplyKind('recipe:frying_pan'), 'made');
    assert.equal(supplyKind('garden:seed_corn'), 'made');
    assert.equal(supplyKind('season:zilloween_carve'), 'made');
    assert.equal(supplyKind('trant'), 'harvest');
    assert.equal(supplyKind('ore_grinder'), 'harvest');
    assert.equal(supplyKind('season:glitchmas_cracker'), 'other');
    assert.equal(supplyKind('starter'), 'other');
  });

  it('marks Glitch\'s rare tag, the only rarity Glitch had', () => {
    assert.equal(sourceRow({ inventory: { status: 'source', evidence: 'obtainable: vendor:rare_item_vendor' }, gsjs: { tags: ['rare'], parents: ['antique_spigot', 'rare_item'], baseCost: 251000 } }).rare, 1);
    assert.equal(sourceRow({ catalog: food }).rare, undefined);
  });

  it('the file is current, for every class the give catalog carries', { skip: skipBuild }, () => {
    const r = spawnSync(process.execPath, [join(root, 'tools/build-item-sources.mjs'), '--check'], { encoding: 'utf8', env: { ...process.env, GRODDLE_SITE_DIR: SITE_DIR }, timeout: 120000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const file = sources();
    const economy = JSON.parse(readFileSync(sitePath('data/economy.json'), 'utf8')).items;
    assert.deepEqual(Object.keys(file.items), Object.keys(economy));
    assert.deepEqual(file.kinds, KINDS);
    assert.doesNotMatch(file._doc, /—/);
    for (const [c, row] of Object.entries(economy)) if (row.g === 'credit') assert.equal(file.items[c].ok, 0, `${c}: the economy table says nothing grants it`);
    for (const [c, row] of Object.entries(file.items)) {
      assert.equal(row.ok === 1, row.src.length > 0, `${c}: a source exactly when it can be got`);
      assert.equal(row.ok === 0, typeof row.why === 'string', `${c}: why exactly when it cannot`);
    }
  });

  // Checked by hand in the game's code, 2026-11-24 (both ways).
  it('spot checks: what a player can get, and what only an administrator can give', { skip: skipBuild }, () => {
    const items = sources().items;
    const can = {
      test_tube: ['sold'], // the Alchemical Goods Vendor (js/store-catalog.js); the inventory had excluded it as a test id
      npc_garden_gnome: ['sold'], // the Hardware Vendor (js/store-catalog.js)
      grilled_cheese: ['made'], // recipes.json
      furniture_bookcase: ['made'], // recipe 263 turned back on (G1248, #669); tagged deleted, judged by tools/inventory/overrides.json
      musicblock_d_blue_01: ['harvest'], // drop tables (js/musicblocks.js, drop-tables-data.js)
      npc_cubimal_fox: ['other'], // a Cubimal box's roll (js/cubimals.js)
      emblem_alph: ['other'], // Alph's shrine as the favor fills (js/features/giant-icons-feature.js)
      rooster_plume: ['other'], // the Toy Vendor on Pot Luck Day (js/pot-luck.js, js/seasons.js)
    };
    for (const [c, src] of Object.entries(can)) {
      assert.equal(items[c].ok, 1, c);
      for (const k of src) assert.ok(items[c].src.includes(k), `${c}: ${k}`);
    }
    const adminOnly = {
      doll_nietzsche: WHY.unbuilt_original, // the Rube never offers it (rube-catalog art false, js/rube.js makeRubeOffer)
      doll_ayn_rand: WHY.excluded, // a staff handout; the Rube never offers it either
      seed_strawberry: WHY.unbuilt_original, // in no seed catalog (js/garden.js SEED_CATALOG)
      fuelmaker_engine: WHY.excluded, // tagged deleted; no recipe, store or drop
      million_currant_trophy: WHY.excluded, // sold out in Glitch; nothing in the remake gives it
      artifact_butterlfy_hair_clip_piece1: WHY.excluded, // Tiny Speck's misspelt duplicate; the real piece drops
    };
    for (const [c, why] of Object.entries(adminOnly)) assert.deepEqual([items[c].ok, items[c].src, items[c].why], [0, [], why], c);
    assert.equal(items.artifact_butterfly_hair_clip_piece1.ok, 1, 'the real piece');
    assert.equal(items.antique_spigot.rare, 1);
  });
});

describe('the Give pop-up\'s Browse view (console/console.js)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};
  const items = [
    { c: 'apple', name: 'Apple', cat: 'Food', src: ['sold'], ok: true, price: 5 },
    { c: 'cherry', name: 'Cherry', cat: 'Food', src: ['harvest'], ok: true, price: 1 },
    { c: 'doll_nietzsche', name: 'Friedrich Nietzsche Doll', cat: 'Toys and games', src: [], ok: false, price: 1009, why: 'Never finished in Glitch' },
    { c: 'party_pack', name: 'Party Pack', cat: 'Toys and games', src: [], ok: false, why: 'Left out of the remake' },
    { c: 'odd', name: 'Odd', src: ['other'], ok: true },
    { c: 'plain', name: 'Plain' },
  ];

  it('groups by category with counts, Other last, and lists only the admin-only ones by category', () => {
    const all = mod.itemGroups(items);
    assert.deepEqual(all.map((g) => [g.cat, g.total, g.adminOnly]), [['Food', 2, 0], ['Toys and games', 2, 2], ['Other', 2, 0]]);
    assert.deepEqual(all[0].items.map((i) => i.c), ['apple', 'cherry']);
    const admin = mod.itemGroups(items, { show: 'admin' });
    assert.deepEqual(admin.map((g) => [g.cat, g.items.map((i) => i.c)]), [['Toys and games', ['doll_nietzsche', 'party_pack']]]);
    assert.deepEqual(mod.itemGroups(items, { band: '1000-' }).map((g) => g.cat), ['Toys and games']);
    assert.deepEqual(mod.itemGroups(items, { band: 'none' }).flatMap((g) => g.items.map((i) => i.c)), ['party_pack', 'odd', 'plain']);
    assert.equal(mod.groupWords(all[1]), '2 items, 2 admin only');
    assert.equal(mod.groupWords({ total: 1, adminOnly: 0 }), '1 item');
    assert.equal(mod.browseWords(all), '6 items in 3 categories.');
    assert.equal(mod.browseWords(admin, 'admin'), '2 items no player can get in the game yet, in 1 category. Only an administrator can give them.');
    assert.equal(mod.browseWords([], 'admin'), 'Every item here can be got in the game.');
  });

  it('says where each comes from, or Admin only (not in the game yet) and why; price, never rarity', () => {
    assert.equal(mod.ADMIN_ONLY, 'Admin only (not in the game yet)');
    assert.equal(mod.itemWhere(items[0]), 'Sold by a vendor');
    assert.equal(mod.itemWhere({ ok: true, src: ['made', 'harvest'] }), 'Made, Harvested');
    assert.equal(mod.itemWhere(items[2]), 'Admin only (not in the game yet). Never finished in Glitch.');
    assert.equal(mod.itemWhere({ ok: false }), 'Admin only (not in the game yet)');
    assert.equal(mod.itemWhere(items[5]), '', 'a class the site knows nothing about');
    assert.equal(mod.adminOnly(items[5]), false);
    assert.deepEqual(['0-9', '10-99', '100-999', '1000-', 'none'].map((b) => mod.priceBand({ '0-9': 5, '10-99': 10, '100-999': 999, '1000-': 1000, none: 0 }[b])), ['0-9', '10-99', '100-999', '1000-', 'none']);
    for (const [, label] of mod.PRICE_BANDS) assert.doesNotMatch(label, /rar/i);
    const js = readFileSync(sitePath('console/console.js'), 'utf8');
    assert.match(js, /const browse = giveBrowser\(add\);/);
    assert.match(js, /text: 'Browse by category'/);
    assert.match(js, /el\('option', \{ value: 'admin', text: 'Admin only, by category', title: `\$\{ADMIN_ONLY\}, by category` \}\)/);
    assert.match(js, /adminOnly\(it\) \? el\('span', \{ class: 'console-tag console-tag-bad', text: 'Admin only', title: itemWhere\(it, state\.itemKinds\) \}\) : null/, 'the search marks them too');
  });

  it('the site joins the file onto the give catalog, administrators only', { skip: !HAS_PHP && 'no php' }, () => {
    const php = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    assert.match(php, /\$sourcesFile = dirname\(__DIR__\) \. '\/data\/item-sources\.json';/);
    assert.match(php, /\+ self::itemSource\(\$sources\['items'\]\[\$c\] \?\? null\)/);
    assert.match(php, /#\[Route\(Method::Get, '\/groddle\/v1\/admin\/catalog', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
    if (!existsSync(join(engine, 'src/Minn/Autoloader.php'))) return;
    const code = `define('ABSPATH', sys_get_temp_dir() . '/'); define('MINN_ENGINE_DIR', $argv[1]); require $argv[1] . '/src/Minn/Autoloader.php'; Minn\\Autoloader::register(); $site = $argv[2]; spl_autoload_register(function ($c) use ($site) { $p = 'Groddle\\\\Minn\\\\'; if (str_starts_with($c, $p)) require $site . '/src/' . substr($c, strlen($p)) . '.php'; }); echo json_encode([Groddle\\Minn\\AdminConsole::itemSource(['cat' => 'Food', 'src' => ['sold', 3], 'ok' => 1, 'price' => 5, 'rare' => 1]), Groddle\\Minn\\AdminConsole::itemSource(['cat' => 7, 'ok' => 0, 'price' => 0, 'why' => 'Never finished in Glitch']), Groddle\\Minn\\AdminConsole::itemSource(null)]);`;
    const r = spawnSync(PHP, ['-r', code, engine, SITE_DIR], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [
      { cat: 'Food', src: ['sold'], ok: true, price: 5, rare: true },
      { cat: 'Other', src: [], ok: false, why: 'Never finished in Glitch' },
      [],
    ]);
  });
});
