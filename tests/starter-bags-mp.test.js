/**
 * Starter bags for multiplayer characters made before bags (G152, Austin
 * 2026-10-27). The site decides (groddle-afternoon-site src/LedgerStarter.php,
 * run here through php -r; skipped without the site or php): once per
 * character, only for characters made before the bags commit, the solo
 * migration's kit (js/pack-slots.js packIntoBags) computed from the ledger's
 * own holdings. The page applies the grant once (features/bags-feature.js
 * applyStarter, through the trade slice's ledgerReceipt) and lays the stacks
 * into the new bags. Solo is untouched (tests/pack-slots.test.js).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ITEM_CATALOG, isToolItem } from '../public/js/inventory.js?v=catalog-unified-7';
import { BAG_DEFS, PACK_CAPACITY, STARTER_FLOOR, arrangeIntoBags, isBagClass, layoutPack, packIntoBags, starterKit } from '../public/js/pack-slots.js?v=g152-2';
import { STACKMAX, TOOL_CLASSES } from '../public/js/pack-slots-data.js?v=g152-1';
import { applyStarter, bagsFeature, starterMint, starterText } from '../public/js/features/bags-feature.js?v=g359-1';
import { sitePackSlotsJson, OUT } from '../tools/build-site-pack-slots.mjs';
import { HAS_SITE, SITE_DIR } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const TRADE = JSON.parse(readFileSync(join(root, 'public/assets/content/trade-items.json'), 'utf8')).items;
const TRADEABLE = Object.keys(TRADE);
const OPTS = { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG) };

/** Runs LedgerStarter's pure rules in PHP: one call per case, all in one process. */
function php(cases) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'LedgerStarter'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerStarter};
    $in = json_decode(stream_get_contents(STDIN), true);
    $e = Economy::shared();
    $t = LedgerStarter::table();
    $out = [];
    foreach ($in as $c) {
      $out[] = match ($c['op']) {
        'kit' => LedgerStarter::kit($c['inv'], $t),
        'starterKit' => LedgerStarter::starterKit($c['inv'], $t),
        'counted' => (object) LedgerStarter::counted($c['inv'], $c['ledger'], $e),
        'decide' => LedgerStarter::decide($c['row'], $c['madeAt'], $c['inv'], $c['ledger'], $e, $t),
        'inventoryOf' => LedgerStarter::inventoryOf($c['stored']),
        'text' => LedgerStarter::text($c['items']),
        'const' => ['floor' => LedgerStarter::FLOOR, 'cutoff' => LedgerStarter::CUTOFF, 'prefix' => LedgerStarter::PREFIX, 'new' => LedgerStarter::TEXT_NEW, 'nosave' => LedgerStarter::TEXT_NOSAVE],
      };
    }
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify(cases), maxBuffer: 64 * 1024 * 1024 })));
}

let seed = 20261027;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const TOOLS = TRADEABLE.filter((c) => isToolItem(c) || STACKMAX.get(c) === 1 && /pick|hoe|can|hatchet|shovel|tongs|grinder|smelter|blender|pan/.test(c));

/** A random pack of tradeable classes (some tools, sometimes a bag already). */
function randomInv() {
  const inv = {};
  const n = Math.floor(rnd() * 70);
  for (let i = 0; i < n; i++) {
    const c = rnd() < 0.2 ? pick(TOOLS) : pick(TRADEABLE);
    inv[c] = (inv[c] || 0) + 1 + Math.floor(rnd() * (rnd() < 0.3 ? 400 : 6));
  }
  if (rnd() < 0.15) inv.bag_generic = 1 + Math.floor(rnd() * 2);
  return inv;
}

describe('the site keeps the pack facts the game uses', { skip: skipSite }, () => {
  it('data/pack-slots.json is current (node tools/build-site-pack-slots.mjs)', () => {
    assert.equal(readFileSync(OUT, 'utf8'), sitePackSlotsJson());
  });

  it('the cutoff is the bags commit (game e3162838), in UTC', () => {
    const [k] = php([{ op: 'const' }]);
    assert.equal(k.cutoff, '2026-10-27 12:14:43');
    const git = spawnSync('git', ['-C', root, 'show', '-s', '--format=%cI', 'e3162838']);
    if (git.status === 0) assert.equal(new Date(String(git.stdout).trim()).toISOString().replace('T', ' ').slice(0, 19), k.cutoff);
    assert.equal(k.prefix, 'starter-bags-');
    for (const text of [k.new, k.nosave]) assert.doesNotMatch(text, /—/);
  });
});

describe('the site gives the solo migration\'s kit (packIntoBags)', { skip: skipSite }, () => {
  it('agrees with js/pack-slots.js on 400 random packs', () => {
    const invs = Array.from({ length: 400 }, randomInv);
    const out = php(invs.map((inv) => ({ op: 'kit', inv })));
    let minted = 0;
    invs.forEach((inv, i) => {
      const want = packIntoBags(inv, OPTS).mint;
      assert.deepEqual(out[i].mint, want, JSON.stringify(inv));
      if (want.length) minted++;
      // What the site counts as overflow is what the game's layout leaves in the magic rock.
      assert.equal(out[i].overflow, layoutPack(inv, null, OPTS).rockStacks, JSON.stringify(inv));
    });
    assert.ok(minted > 50, `only ${minted} packs overflowed`);
  });

  it('agrees with js/pack-slots.js starterKit (the solo kit, then at least 2 Bigger Bags) on 400 random packs', () => {
    const invs = Array.from({ length: 400 }, randomInv);
    const out = php(invs.map((inv) => ({ op: 'starterKit', inv })));
    invs.forEach((inv, i) => {
      const want = starterKit(inv, OPTS);
      assert.deepEqual(out[i].mint, want.mint, JSON.stringify(inv));
      assert.equal(out[i].solo, want.solo);
      assert.ok(want.mint.filter((c) => c === 'bag_bigger').length >= STARTER_FLOOR);
      assert.ok(want.mint.length <= PACK_CAPACITY - 1);
    });
    assert.equal(php([{ op: 'const' }])[0].floor, STARTER_FLOOR);
  });

  it('the solo rule: nothing while the pack holds everything; a Red Toolbox only at 4 tool stacks; Bigger Bags until it fits; at most 15', () => {
    const singles = (n, from = TRADEABLE.filter((c) => !isToolItem(c) && !isBagClass(c) && STACKMAX.get(c) >= 1)) => Object.fromEntries(from.slice(0, n).map((c) => [c, 1]));
    const tools = TRADEABLE.filter((c) => (isToolItem(c) || TOOLS.includes(c)) && !isBagClass(c));
    const [fits, thirty, toolish, huge] = php([
      { op: 'kit', inv: singles(16) },
      { op: 'kit', inv: singles(30) },
      { op: 'kit', inv: { ...singles(20), ...Object.fromEntries(tools.slice(0, 5).map((c) => [c, 1])) } },
      { op: 'kit', inv: singles(400) },
    ]);
    assert.deepEqual(fits.mint, []);
    assert.deepEqual(thirty.mint, ['bag_bigger', 'bag_bigger']);
    assert.equal(toolish.mint[0], 'bag_toolbox_red');
    assert.equal(huge.mint.length, PACK_CAPACITY - 1);
  });

  it('the starter kit tops the solo kit up to 2 Bigger Bags, within the 15-bag cap', () => {
    const others = TRADEABLE.filter((c) => !isToolItem(c) && !TOOL_CLASSES.has(c) && !isBagClass(c));
    const tools = TRADEABLE.filter((c) => TOOL_CLASSES.has(c) && !isBagClass(c));
    const one = (list, n) => Object.fromEntries(list.slice(0, n).map((c) => [c, 1]));
    const [fits, thirty, toolbox, huge] = php([
      { op: 'starterKit', inv: one(others, 10) },
      { op: 'starterKit', inv: one(others, 30) },
      { op: 'starterKit', inv: { ...one(tools, 4), ...one(others, 13) } },
      { op: 'starterKit', inv: one(others, 400) },
    ]);
    assert.deepEqual([fits.mint, fits.solo], [['bag_bigger', 'bag_bigger'], 0], 'a pack that fits: the welcome gift alone');
    assert.deepEqual([thirty.mint, thirty.solo], [['bag_bigger', 'bag_bigger'], 2], 'the solo kit already has 2');
    assert.deepEqual([toolbox.mint, toolbox.solo], [['bag_toolbox_red', 'bag_bigger', 'bag_bigger'], 2], 'a toolbox and one Bigger Bag, topped up to two');
    assert.equal(huge.mint.length, PACK_CAPACITY - 1);
  });

  it('counts only what the ledger holds: a count the page wrote never raises the kit', () => {
    const [c] = php([{ op: 'counted', inv: { apple: 50, cherry: 3, greeter_twig: 9, zz_not_a_class: 4 }, ledger: { apple: 20, cherry: 9 } }]);
    assert.deepEqual(c, { apple: 20, cherry: 3 }, 'capped at the ledger; untradeable classes (no value, no ledger row) left out');
  });

  it('reads the stored save\'s pack', () => {
    const stored = JSON.stringify({ kind: 'groddle-save', entries: { playerState: JSON.stringify({ inventory: { apple: 3, cherry: 0, pick: 1 } }) } });
    const [inv, none] = php([{ op: 'inventoryOf', stored }, { op: 'inventoryOf', stored: '' }]);
    assert.deepEqual(inv, { apple: 3, pick: 1 });
    assert.equal(none, null);
  });
});

describe('the site decides once per character, for characters made before bags', { skip: skipSite }, () => {
  const inv = Object.fromEntries(TRADEABLE.filter((c) => !isToolItem(c) && !isBagClass(c)).slice(0, 30).map((c) => [c, 1]));
  const ledger = { ...inv };
  const before = '2026-10-26 18:33:05';

  it('grants the kit to a character made before the cutoff, and at least 2 Bigger Bags to one whose pack already fits', () => {
    const small = Object.fromEntries(Object.keys(inv).slice(0, 8).map((c) => [c, 1]));
    const [d, fits, empty] = php([
      { op: 'decide', row: null, madeAt: before, inv, ledger },
      { op: 'decide', row: null, madeAt: before, inv: small, ledger },
      { op: 'decide', row: null, madeAt: before, inv: {}, ledger: {} },
    ]);
    assert.equal(d.status, 'granted');
    assert.deepEqual(d.items, { bag_bigger: 2 });
    assert.equal(d.again, undefined);
    assert.deepEqual([fits.status, fits.items, fits.kit.solo], ['granted', { bag_bigger: 2 }, 0]);
    assert.deepEqual([empty.status, empty.items], ['granted', { bag_bigger: 2 }], 'never none for a character made before bags');
  });

  it('refuses a character made at or after the cutoff, or with no save', () => {
    const out = php([
      { op: 'decide', row: null, madeAt: '2026-10-27 12:14:43', inv, ledger },
      { op: 'decide', row: null, madeAt: '2026-10-28 09:00:00', inv, ledger },
      { op: 'decide', row: null, madeAt: null, inv, ledger },
      { op: 'decide', row: null, madeAt: before, inv: null, ledger },
    ]);
    assert.deepEqual(out.map((d) => d.status + ':' + d.why), ['refused:new', 'refused:new', 'refused:new', 'refused:nosave']);
  });

  it('answers as recorded when asked again: the same bags, never more', () => {
    const settled = { trade_id: 'starter-bags-7', status: 'settled', b_gave: JSON.stringify({ items: [{ c: 'bag_bigger', n: 2 }], currants: 0 }) };
    const [again, voided, grown] = php([
      { op: 'decide', row: settled, madeAt: before, inv, ledger },
      { op: 'decide', row: { trade_id: 'starter-bags-7', status: 'void', b_gave: '{}' }, madeAt: before, inv, ledger },
      // A pack that grew since a "nothing" answer still gets nothing.
      { op: 'decide', row: { trade_id: 'starter-bags-7', status: 'void', b_gave: '{}' }, madeAt: before, inv: { ...inv, ...Object.fromEntries(TRADEABLE.slice(200, 260).map((c) => [c, 1])) }, ledger },
    ]);
    assert.deepEqual(again, { status: 'granted', again: true, trade: 'starter-bags-7', items: { bag_bigger: 2 } });
    assert.deepEqual(voided, { status: 'none', again: true });
    assert.deepEqual(grown, { status: 'none', again: true });
  });

  it('says what was given and why, in plain words', () => {
    const [t] = php([{ op: 'text', items: { bag_toolbox_red: 1, bag_bigger: 3 } }]);
    assert.equal(t, 'Your pack has 16 slots now. As a character from before bags, you get starter bags: a Red Toolbox and 3 Bigger Bags.');
  });
});

describe('the page applies starter bags once and packs into them', () => {
  const singles = (n) => Object.fromEntries(TRADEABLE.filter((c) => !isToolItem(c) && !TOOL_CLASSES.has(c) && !isBagClass(c)).slice(0, n).map((c) => [c, 1]));
  const engineFor = (inv) => {
    const applied = new Set();
    const said = [];
    const data = {};
    return {
      mode: 'multiplayer', inv, started: true, said, data, applied,
      setData(k, v) { data[k] = v; }, pushActivity(t) { said.push(t); }, toast() {}, param: () => null, save() {},
      query(name, id) { if (name !== 'ledgerReceipt') return null; if (applied.has(id)) return false; applied.add(id); return true; },
    };
  };
  const answer = { status: 'granted', trade: 'starter-bags-7', got: { items: [{ c: 'bag_bigger', n: 2 }], currants: 0 } };

  it('a grant lands once: the bags come in, everything fits, a second answer adds nothing', () => {
    const e = engineFor(singles(30));
    bagsFeature.restore({ v: 1, migrated: true }, e);
    assert.equal(bagsFeature.packLayout(e).rockStacks, 14);
    assert.equal(applyStarter(e, answer), true);
    assert.equal(e.inv.bag_bigger, 2);
    const layout = bagsFeature.packLayout(e);
    assert.equal(layout.rockStacks, 0);
    assert.equal(bagsFeature.save().starter, 'granted');
    assert.equal(applyStarter(e, answer), true, 'asked again (a reload): settled, nothing added');
    assert.equal(e.inv.bag_bigger, 2);
    assert.match(e.said.at(-1), /^Your pack has 16 slots now\. As a character from before bags, you get starter bags: 2 Bigger Bags\. Everything you carry is packed into them\.$/);
    assert.doesNotMatch(e.said.join(' '), /—/);
  });

  it('bags a load already applied (Ledger::catchUp) are laid out, not added again', () => {
    const e = engineFor({ ...singles(30), bag_bigger: 2 });
    e.applied.add('starter-bags-7');
    bagsFeature.restore({ v: 1, migrated: true }, e);
    bagsFeature.packLayout(e);
    assert.ok(!e.said.some((t) => /magic rock is holding .*Bigger Bag/.test(t)), 'no rock line for the bags while the answer is on its way');
    assert.equal(applyStarter(e, answer), true);
    assert.equal(e.inv.bag_bigger, 2);
    assert.equal(bagsFeature.packLayout(e).rockStacks, 0);
    assert.equal(e.data.packStarter, 'granted:bag_bigger,bag_bigger:loaded');
  });

  it('refuses an answer that is not a starter grant', () => {
    const e = engineFor(singles(20));
    bagsFeature.restore({ v: 1, migrated: true }, e);
    assert.equal(applyStarter(e, { ...answer, trade: 'party-0123456789abcdef' }), false);
    assert.equal(applyStarter(e, { ...answer, got: { items: [{ c: 'apple', n: 5 }] } }), false);
    assert.equal(e.inv.bag_bigger, undefined);
  });

  it('a toolbox is laid out first and takes the tools', () => {
    assert.deepEqual(starterMint({ items: [{ c: 'bag_bigger', n: 2 }, { c: 'bag_toolbox_red', n: 1 }] }), ['bag_toolbox_red', 'bag_bigger', 'bag_bigger']);
    const inv = { pick: 1, hoe: 1, watering_can: 1, hatchet: 1, ...singles(20), bag_toolbox_red: 1, bag_bigger: 1 };
    const prefs = arrangeIntoBags(inv, ['bag_toolbox_red', 'bag_bigger'], OPTS);
    assert.deepEqual(prefs.place.b1.sort(), ['hatchet', 'hoe', 'pick', 'watering_can']);
    assert.equal(prefs.place.b2.length, BAG_DEFS.bag_bigger.capacity);
    assert.equal(layoutPack(inv, prefs, OPTS).rockStacks, 0);
  });

  it('a pack that already fit gets the welcome gift, said alone', () => {
    const e = engineFor(singles(10));
    bagsFeature.restore({ v: 1, migrated: true }, e);
    bagsFeature.packLayout(e);
    assert.equal(applyStarter(e, answer), true);
    assert.equal(e.inv.bag_bigger, 2);
    assert.equal(bagsFeature.packLayout(e).rockStacks, 0);
    assert.equal(e.said.at(-1), 'Your pack has 16 slots now. As a character from before bags, you get starter bags: 2 Bigger Bags.');
  });

  it('the notice says when the rock still holds something', () => {
    assert.match(starterText(['bag_toolbox_red', 'bag_bigger'], 2), /a Red Toolbox and a Bigger Bag\. Your magic rock holds what still does not fit\.$/);
  });

  it('remembers a settled answer, and only a settled one', () => {
    const e = engineFor(singles(4));
    for (const starter of ['granted', 'none', 'new', 'nosave']) {
      bagsFeature.restore({ v: 1, migrated: true, starter }, e);
      assert.equal(bagsFeature.save().starter, starter);
    }
    bagsFeature.restore({ v: 1, migrated: true, starter: 'bogus' }, e);
    assert.equal(bagsFeature.save().starter, undefined);
  });
});
