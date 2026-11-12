/**
 * A store opens only from its vendor (Austin 2026-11-02, Modern, /play/online/: the Menu's
 * Vendor row and V opened the street's store anywhere, vendor or not).
 *
 * The original: a street spirit's buy_sell verb opened the store (street_spirit.js 247-275 ->
 * players/inc_stores.js openStoreInterface 50-92); a buy or sell had to name a vendor stack in
 * your location (main.js doStoreBuy 4730-4754 -> getTargetStack 4627-4629, pc.location.apiLockStack);
 * the client's StoreDialog closed when you moved to another street (Dialog.as close_on_move 58,
 * onInvalidate 367-373) and had no store key (TSMainView.as: V only in a god build's Q+V, 1916-1921).
 * VENDORKEY (Austin, later on 2026-11-02, ticket 42): V is back, but only for a vendor in reach (300 px,
 * main.js doVerb's default reach): it runs that vendor's own Browse goods, else "There is no vendor in range."
 * Run: node --test tests/vendor-needs-npc.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hotkeySections } from '../public/js/client-hotkeys.js?v=31d1891d';
import { MENU_ROWS, menuRowFor } from '../public/js/ui/topbar.js?v=d3aad119';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '../public', p), 'utf8');
const game = read('game.js');

describe('a store opens only from its vendor', () => {
  it('the Menu has no Vendor row, in solo and online', () => {
    for (const page of ['play/index.html', 'play/online/index.html']) {
      const html = read(page);
      assert.doesNotMatch(html, /id="vendor-btn"/, page);
      const list = html.slice(html.indexOf('<div id="more-list"'), html.indexOf('<div id="sound-pop"'));
      assert.ok(list.includes('id="feat-btn"'), `${page}: the World group is still there`);
      assert.doesNotMatch(list, />Vendor</, page);
      // The start card offers V for a vendor in reach (Austin 2026-11-03), never a store anywhere.
      assert.match(html, /<kbd>V<\/kbd><\/span><span>Vendor nearby<\/span>/, page);
      // The store itself stays, for the vendors' verbs.
      assert.match(html, /<div id="vendor-panel" /, page);
      // Its header shows no key cap either (the Modern sheets show their key beside the title).
      const head = html.slice(html.indexOf('<div id="vendor-panel" '), html.indexOf('<div class="ui-sheet-body vendor-body">'));
      assert.ok(head.includes('id="vendor-title"'), page);
      assert.doesNotMatch(head, /ui-sheet-key/, page);
    }
    assert.equal(MENU_ROWS['vendor-btn'], undefined);
    assert.equal(Object.values(MENU_ROWS).some((row) => row.key === 'V'), false, 'no Menu row shows V');
    assert.equal(menuRowFor('feat-btn').group, 'world');
  });

  it('the key list names V for a vendor in reach, and nothing else took V', () => {
    for (const opts of [{}, { keyring: true, hub: true }]) {
      const rows = hotkeySections(opts).flatMap((s) => s.rows);
      const v = rows.filter((r) => r[1].some((combo) => combo.length === 1 && combo[0] === 'V'));
      assert.deepEqual(v.map((r) => [r[0], r[2]]), [['Vendor', '(A vendor in reach)']]);
    }
  });

  it('V runs a vendor in reach\'s own verb, or says none is in range; it never opens a store by itself', () => {
    assert.doesNotMatch(game, /e\.key === 'v' \|\| e\.key === 'V'/);
    assert.match(game, /if \(isPlainKey\(e, 'v'\)\) vendorKey\(\);/);
    assert.match(game, /if \(isPlainKey\(e, 'v'\) && isVendorOpen\(\)\) closeVendor\(\);/);
    const fn = game.slice(game.indexOf('function vendorKey()'), game.indexOf('function nearestInteractable('));
    assert.match(game, /const VENDOR_KEY_REACH = 300;/);
    assert.match(fn, /withinReach\(t, VENDOR_KEY_REACH\)/);
    assert.match(fn, /requestVerb\(target, verb\);/);
    assert.match(fn, /toast\('There is no vendor in range\.', 2400\);/);
    assert.doesNotMatch(fn, /openVendor/);
    assert.doesNotMatch(game, /getElementById\('vendor-btn'\)/);
  });

  it('opens from the vendor\'s Browse goods verb, never from a bare click on its sprite', () => {
    // The verb: content.js returns openVendor, runVerb's result opens the store.
    assert.match(read('content.js'), /classId\.startsWith\('street_spirit_'\) && verbId === 'browse'\) \{[\s\S]{0,160}openVendor: true/);
    assert.match(game, /if \(result\.openVendor\) openVendor\(\);/);
    // The sprite is a target like any other: the canvas click opens its verb menu (requestVerb walks over).
    const spawn = game.slice(game.indexOf('function spawnVendorNpc('), game.indexOf('function WORLD_LABEL_STYLE('));
    assert.ok(spawn.length > 100);
    assert.doesNotMatch(spawn, /openVendor/);
    assert.doesNotMatch(spawn, /\.on\('pointer/);
    // Every other openVendor is the verb, the feature shops (engine.openShop) or the panel itself.
    const callers = [...game.matchAll(/^.*\bopenVendor\(\).*$/gm)].map((m) => m[0].trim()).filter((line) => !line.startsWith('function '));
    assert.deepEqual(callers, [
      'if (result.openVendor) openVendor();',
      'openVendor();',
    ]);
    const shop = game.slice(game.indexOf('  openShop(profile = null) {'), game.indexOf('  shopOpen: () => isVendorOpen(),'));
    assert.match(shop, /activeVendor = profile;\s*openVendor\(\);/);
  });

  it('closes when you leave the street, before the next street\'s vendor is chosen', () => {
    const enter = game.slice(game.indexOf('async function enterStreet('), game.indexOf('activeVendor = selectVendorProfile('));
    assert.match(enter, /if \(isVendorOpen\(\)\) closeVendor\(\);\s*$/);
    const travel = game.slice(game.indexOf('async function travelTo('), game.indexOf('async function travelTo(') + 4000);
    assert.match(travel, /closeVendor\(\);/);
  });
});
