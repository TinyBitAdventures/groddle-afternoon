/**
 * G1234 (#646): the Buddies list opens at its top, keeps its place as people come and go, and can
 * be sorted A to Z. Its default order is Glitch's: Online buddies over Offline buddies, each
 * section by label, case-insensitively (ContactList.as sections; BaseContacts.as 154
 * SortTools.vectorSortOn(contact_sort, ['label'], [Array.CASEINSENSITIVE])).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDDY_SORTS, BUDDY_SORT_KEY, loadBuddySort, normalizeBuddySort, saveBuddySort, sortBuddies } from '../public/js/buddies.js?v=81cadb4b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const client = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'ui', 'chat', 'BaseContacts.as');

const buddies = [
  { id: 1, name: 'zed' },
  { id: 2, name: 'Amy' },
  { id: 3, name: 'bob' },
  { id: 4, name: 'Carl' },
];
const names = (rows) => rows.map((b) => b.name);

describe('buddy list order (#646)', () => {
  it('by default Glitch\'s: online first, then offline, each A to Z whatever the case', () => {
    const online = new Map([[1, {}], [4, {}]]);
    assert.deepEqual(names(sortBuddies(buddies, online)), ['Carl', 'zed', 'Amy', 'bob']);
    assert.deepEqual(names(sortBuddies(buddies, new Set())), ['Amy', 'bob', 'Carl', 'zed']);
  });

  it('A to Z: by name alone, so nobody moves when someone comes online', () => {
    const before = names(sortBuddies(buddies, new Set(), 'az'));
    const after = names(sortBuddies(buddies, new Set([1, 4]), 'az'));
    assert.deepEqual(before, ['Amy', 'bob', 'Carl', 'zed']);
    assert.deepEqual(after, before);
  });

  it('the choice is kept in this browser; anything else, or a blocked storage, is Glitch\'s order', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.equal(loadBuddySort(storage), 'online');
    saveBuddySort('az', storage);
    assert.equal(store.get(BUDDY_SORT_KEY), 'az');
    assert.equal(loadBuddySort(storage), 'az');
    assert.equal(loadBuddySort({ getItem() { throw new Error('blocked'); } }), 'online');
    assert.equal(normalizeBuddySort('nope'), 'online');
    assert.deepEqual([...BUDDY_SORTS], ['online', 'az']);
  });

  it('matches glitch-client: sections sorted by label, case-insensitively', { skip: !existsSync(client) && 'needs glitch-client' }, () => {
    assert.match(readFileSync(client, 'utf8'), /vectorSortOn\(contact_sort, \['label'\], \[Array\.CASEINSENSITIVE\]\)/);
  });

  it('the panel and the drawer both use it, and the drawer offers the two orders', () => {
    const feature = read('public/js/features/buddies-feature.js');
    assert.equal((feature.match(/sortBuddies\(list\.buddies, online, sortMode\)/g) || []).length, 2);
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /for \(const mode of BUDDY_SORTS\)/);
  });
});

describe('the Buddies tab keeps its place (#646)', () => {
  it('it opens at the top and a redraw puts it back where it was; chat logs still follow their newest line', () => {
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /const keepTop = log\.scrollTop;\n[^\n]*\n    reconcileChildren\(log, nodes\);/);
    assert.match(drawer, /if \(t\.kind === 'buddies' && !th\) log\.scrollTop = log\.dataset\.jump \? 0 : keepTop;\n    else if \(atEnd \|\| log\.dataset\.jump\) log\.scrollTop = log\.scrollHeight;/);
  });

  it('the manage panel keeps its place across a redraw', () => {
    const feature = read('public/js/features/buddies-feature.js');
    assert.match(feature, /const keepScroll = panel\.scrollTop;\n    renderPanel\(\);\n    panel\.scrollTop = keepScroll;/);
  });
});
