/**
 * Ticket 51 (G404): how the game wires cabinets and the Storage Display Box
 * (features/home-storage-feature.js, js/ui/storage-windows.js) into the house,
 * the pack, the furniture sales and multiplayer. The rules have their own
 * tests (home-storage.test.js), the site's ledger too (home-storage-ledger.test.js).
 *
 * Run: node --test tests/home-storage-feature.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saleVerbs } from '../public/js/home-street-mp.js?v=0b9774df';
import { homeStorageFeature } from '../public/js/features/home-storage-feature.js?v=27903243';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const feature = read('public/js/features/home-storage-feature.js');
const windows = read('public/js/ui/storage-windows.js');
const index = read('public/js/features/index.js');
const street = read('public/js/features/home-street-mp-feature.js');
const homes = read('public/js/features/homes-feature.js');

describe('the storage feature is registered and gated', () => {
  it('is registered once, before street-objects', () => {
    const at = index.indexOf('home-storage-feature.js');
    assert.ok(at > 0 && index.indexOf('home-storage-feature.js', at + 1) < 0);
    assert.ok(at < index.indexOf('street-objects-feature.js'));
    assert.equal(homeStorageFeature.id, 'home-storage');
  });

  it('talks to the site and the realtime server only in multiplayer', () => {
    assert.match(feature, /const mp = \(engine\) => engine\?\.mode === 'multiplayer' && Boolean\(engine\.query\?\.\('realtimeClient'\)\);/);
    for (const fn of ['loadOwn', 'sdbCollect']) {
      const body = feature.slice(feature.indexOf(`function ${fn}(`), feature.indexOf(`function ${fn}(`) + 300);
      assert.match(body, /mp\(engine\)/, fn);
    }
    assert.match(feature, /homeStorageVisit\(info, engine\) \{\s+if \(engine\?\.mode !== 'multiplayer'/);
    // A slice only in multiplayer, and only with something the server has not answered.
    assert.deepEqual(homeStorageFeature.save(), undefined);
    homeStorageFeature.restore({ pending: [{ t: 'sdb_buy', op: 'sdb-0123456789abcdef', at: 1 }] }, { mode: 'solo' });
    assert.equal(homeStorageFeature.save(), undefined, 'solo keeps no pending ops');
    homeStorageFeature.restore({ pending: [{ t: 'sdb_buy', op: 'sdb-0123456789abcdef', at: 1 }, { t: 'evil', op: 'x' }] }, { mode: 'multiplayer' });
    assert.deepEqual(homeStorageFeature.save().pending.map((p) => p.op), ['sdb-0123456789abcdef']);
    homeStorageFeature.restore(null, { mode: 'multiplayer' });
  });
});

describe('every purchase and move is the server\'s and the site\'s, applied once', () => {
  it('sends the price the store showed and its own op, and applies the answer through ledgerReceipt', () => {
    assert.match(feature, /const frame = \{ owner: visit\.owner, uid, op: newOpId\('sdb'\), count: n, price \};/);
    assert.match(feature, /client\.send\('sdb_buy', frame\)/);
    const bought = feature.slice(feature.indexOf('function bought('), feature.indexOf('function setVisitCount('));
    assert.match(bought, /engine\.query\?\.\('ledgerReceipt', op, engine\) !== false && cls && n/);
    assert.ok(bought.indexOf('ledgerReceipt') < bought.indexOf('addItem(engine.inv, cls, n)'), 'nothing arrives before the receipt');
    assert.match(bought, /for \(const \[at, badge\] of BIG_SPENDERS\) if \(total >= at\)/);
    assert.match(feature, /\[\[1009, 'big_spender'\], \[2003, 'el_big_spenderino'\], \[5003, 'moneybags_magoo'\]\]/);
  });

  it('the owner applies their side of each op once, and saves at once', () => {
    const apply = feature.slice(feature.indexOf('function applyOwnerOps('), feature.indexOf('// ~~ Cabinets'));
    assert.match(apply, /\^\(sdb\|cab\)-\[0-9a-f\]\{16\}-o\$/);
    assert.match(apply, /if \(engine\.query\?\.\('ledgerReceipt', op, engine\) !== true\) continue;/);
    assert.match(apply, /flush\(engine\);/);
  });

  it('asks again on a new connection what the server never answered (the site settles each op once)', () => {
    assert.match(feature, /client\.on\('hello', \(\) => \{[\s\S]{0,200}client\.send\(t, frame\);/);
  });

  it('a key-holder\'s cabinet moves go through cabinet_move; the owner\'s are their own save\'s', () => {
    assert.match(feature, /if \(win\.owner\) return keyHolderMove\(engine, 'put', cls, n, slot\);/);
    // #108: a key-holder's take of a stored bag with things in it is refused before it is sent.
    assert.match(feature, /if \(win\.owner\) \{\n(?:.*\n){1,6}?\s+return keyHolderMove\(engine, 'take', s\.classTsid, k, slot\);/);
    assert.match(feature, /client\.send\('cabinet_move', frame\)/);
  });
});

describe('it joins the house and the furniture sales without a second hit box', () => {
  it('cabinets and boxes get the furniture sale verbs on their own target', () => {
    assert.match(street, /const storage = isStorageClass\(row\.classTsid\);/);
    assert.match(street, /const target = box \? addTarget\(/);
    assert.match(street, /extraVerbs\(target\) \{\s+if \(!session \|\| target\?\.classId !== 'home_storage'\) return null;/);
    assert.match(street, /runVerbOverride\(target, verbId\) \{\s+if \(!session \|\| target\?\.classId !== 'home_storage' \|\| !String\(verbId\)\.startsWith\('furn_'\)\) return null;/);
    assert.match(street, /engine\.query\?\.\('homeStorageVisit', info, engine\);/);
  });

  it('a box or a cabinet with things in it can\'t go up for sale (canSell)', () => {
    const [set] = saleVerbs({ owner: true, full: true });
    assert.equal(set.enabled, false);
    assert.equal(set.reason, 'This item must be emptied before it can be sold.');
    assert.equal(saleVerbs({ owner: true }).at(0).enabled, true);
  });

  it('a box with currants on it stays put, and a visited box\'s count can be kept up to date', () => {
    assert.match(homes, /engine\.query\?\.\('storagePickupIncome', id, engine\)/);
    assert.match(homes, /badge\.label = 'sdb-count';/);
    assert.match(homes, /refreshFurniture\(engine\) \{\s+if \(scene\?\.furnitureLayer\) renderFurniture\(engine\);/);
  });

  it('no targets while Decoration or Cultivation Mode is on (the builder keeps its own Display)', () => {
    assert.match(feature, /const editing = w === 'own' && ownState\(\)\.mode;/);
    assert.match(feature, /const selectable = !editing && \(owner \|\| isSdbClass\(row\.classTsid\) \|\| visit\?\.key\);/);
  });
});

describe('the windows (CabinetDialog.as, StoreBuyUI.as) in both skins', () => {
  it('draws the grid with rows_display rows shown, Done, Move Here, and leaves the pack uncovered', () => {
    assert.match(windows, /wrap\.style\.maxHeight = `\$\{rowsDisplay \* 52 \+ \(rowsDisplay - 1\) \* 18 \+ 24\}px`;/);
    assert.match(windows, /'Done'/);
    assert.match(windows, /'Move Here'/);
    assert.match(windows, /\.hst-win \{ position: fixed; z-index: calc\(var\(--z-panel\) - 1\);/);
    assert.match(windows, /max-height: calc\(100vh - 230px\)/);
    // findDropTarget: an empty slot, or the same class under its stackmax.
    assert.match(windows, /return s\.classTsid === cls && s\.count < \(opts\.stackmax\?\.\(cls\) \?\? Infinity\);/);
  });

  it('dresses the Classic skin in the original dialog\'s blocker colour (0x213036, the token nearest it)', () => {
    assert.match(windows, /:root\[data-ui="classic"\] \.hst-win \{ background: var\(--c-navy-30\);/);
    assert.match(read('public/style.css'), /--c-navy-30: #24303a;/);
  });

  it('says what the original said, with no em-dashes', () => {
    for (const s of [feature, windows]) {
      const strings = [...s.matchAll(/'([^'\n]{3,})'|`([^`\n]{3,})`/g)].map((m) => m[1] || m[2]).filter((x) => /[a-z] [a-z]/i.test(x));
      for (const x of strings) assert.doesNotMatch(x, /—/, x);
    }
  });
});
