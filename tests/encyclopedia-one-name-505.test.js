/**
 * Report #505: "Many items have 2 or more nearly identical entries ... only the second one includes
 * the new entries for where it can be found." One thing, one page; things that only share a name
 * get a plain qualifier; and the page that gets a thing's facts (where it is found, how to get it)
 * is the one the index, the search and the game's links open.
 *
 * Glitch gave one page to one thing: a variant named its page with proxy_item, the classes it kept
 * off the encyclopedia (has_infopage false) shared their name with the one class that had the page,
 * and where none had one the game code still says which class a copy is (its parent class, the
 * class a home-cultivation proto places). tools/encyclopedia/data.mjs foldsOf, sameThingOf,
 * disambiguate, itemQualifier and entryQualifier; tools/catalog/build.mjs mergeWays.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_DB, mergeWays } from '../tools/catalog/build.mjs';
import { disambiguate, entryQualifier, foldsOf, itemQualifier, loadEncyclopedia, sameThingOf } from '../tools/encyclopedia/data.mjs';
import { pathOf } from '../tools/encyclopedia/parts.mjs';
import { buildEncyclopediaIndex, encyclopediaPage } from '../public/js/encyclopedia-links.js?v=1dde87cc';

const pub = join(import.meta.dirname, '..', 'public');
const skip = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const d = skip ? null : await loadEncyclopedia();
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SEARCH = json('encyclopedia/search.json');
const pageFacts = (o) => ({ infopage: false, proxy: null, parents: [], becomes: [], desc: false, ...o });

describe('#505: one name, one page in every section', () => {
  it('no two pages of a section share a display name without a qualifier (search.json, every section)', () => {
    const seen = new Map();
    const clashes = [];
    for (const e of SEARCH.entries) {
      const k = `${e.s}|${fold(e.n)}`;
      if (seen.has(k)) clashes.push(`${e.s}: "${e.n}" is ${seen.get(k)} and ${e.id}`);
      else seen.set(k, e.id);
    }
    assert.deepEqual(clashes, []);
  });

  it('the item catalog index lists one card per name, as the search does', () => {
    const names = json('encyclopedia/items/data.json').items.map((i) => fold(i.name));
    assert.equal(new Set(names).size, names.length, 'two catalog cards share a name');
  });

  it('every folded class opens a page the index lists, and its old address forwards there', () => {
    const listed = new Set(SEARCH.entries.map((e) => e.h));
    for (const [key, h] of Object.entries(SEARCH.folded)) {
      assert.ok(listed.has(h), `${key} -> ${h} is not a listed page`);
      assert.ok(!SEARCH.entries.some((e) => `${e.s}:${e.id}` === key), `${key} is folded and still listed`);
      const [sec, id] = key.split(':');
      assert.match(read(`encyclopedia/${sec}/${id}/index.html`), new RegExp(`http-equiv="refresh" content="0; url=\\.\\./(?:\\.\\./[a-z]+/)?${h.split('/').at(-2)}/"`), key);
    }
  });

  it('a store a Street Spirit keeps is one Stores page, not a People page of the same name too', () => {
    const people = new Set(SEARCH.entries.filter((e) => e.s === 'people').map((e) => fold(e.n)));
    for (const st of SEARCH.entries.filter((e) => e.s === 'stores' && e.g === 'Kept by Street Spirits')) assert.ok(!people.has(fold(st.n)), `${st.n} is in People and Stores`);
    assert.equal(SEARCH.folded['people:vendor-alchemical'], 'encyclopedia/stores/alchemical/');
    assert.match(read('encyclopedia/people/vendor-alchemical/index.html'), /http-equiv="refresh" content="0; url=\.\.\/\.\.\/stores\/alchemical\/"/);
    assert.match(text(read('encyclopedia/stores/alchemical/index.html')), /Who keeps it Street Spirit , keeps it/);
  });

  it('the game\'s "In the Encyclopedia" links open the page a copy shares', () => {
    const index = buildEncyclopediaIndex(SEARCH);
    assert.equal(encyclopediaPage(index, { id: 'street_spirit_firebog' }), 'encyclopedia/people/street_spirit/');
    assert.equal(encyclopediaPage(index, { id: 'npc_widget' }), 'encyclopedia/people/npc_quest_giver_widget/');
    assert.equal(encyclopediaPage(index, { id: 'npc_quest_widget' }), 'encyclopedia/people/npc_quest_giver_widget/');
    assert.equal(encyclopediaPage(index, { id: 'proto_jellisac_mound' }), 'encyclopedia/items/jellisac_mound/');
    assert.equal(encyclopediaPage(index, { id: 'conch_decoy' }), 'encyclopedia/items/conch/');
    assert.equal(encyclopediaPage(index, { id: 'teleporter_ground' }), 'encyclopedia/items/teleporter_visible/');
    assert.equal(encyclopediaPage(index, { id: 'artifact_wooden_apple_piece2' }), 'encyclopedia/items/artifact_wooden_apple_piece2/');
  });
});

describe('#505: fold what is one thing (Glitch gave none of them a page)', () => {
  it('folds a class into its parent class, the class its proto places, or the one of its name with a description', () => {
    const items = new Map(Object.entries({
      street_spirit: { name: 'Street Spirit' }, street_spirit_firebog: { name: 'Street Spirit' }, street_spirit_ix: { name: 'Street Spirit' },
      jellisac_mound: { name: 'Jellisac Mound' }, proto_jellisac_mound: { name: 'Jellisac Mound' },
      conch: { name: 'Conch' }, conch_decoy: { name: 'Conch' },
      swf_1: { name: 'SWF' }, swf_2: { name: 'SWF' },
    }));
    const page = new Map([
      ['street_spirit', pageFacts({ parents: ['street_spirit', 'npc_walkable', 'npc'] })],
      ['street_spirit_firebog', pageFacts({ parents: ['street_spirit_firebog', 'street_spirit', 'npc_walkable', 'npc'] })],
      ['street_spirit_ix', pageFacts({ parents: ['street_spirit_ix', 'street_spirit', 'npc_walkable', 'npc'] })],
      ['jellisac_mound', pageFacts({ parents: ['jellisac_mound'] })],
      ['proto_jellisac_mound', pageFacts({ parents: ['proto_jellisac_mound', 'proto'], becomes: ['jellisac_mound'] })],
      ['conch', pageFacts({ parents: ['conch', 'takeable'], desc: true })],
      ['conch_decoy', pageFacts({ parents: ['conch_decoy'] })],
      ['swf_1', pageFacts({ desc: true })],
      ['swf_2', pageFacts({ desc: true })],
    ]);
    const folds = foldsOf(items, page);
    assert.deepEqual(Object.fromEntries(folds), {
      street_spirit_firebog: 'street_spirit', street_spirit_ix: 'street_spirit', proto_jellisac_mound: 'jellisac_mound', conch_decoy: 'conch',
    });
    // Three SWFs, each with words of its own, are three things.
    assert.equal(sameThingOf('swf_1', ['swf_1', 'swf_2'], page), null);
  });

  it('folds the groups the review found, in the built data', { skip }, () => {
    for (const v of ['street_spirit_firebog', 'street_spirit_groddle', 'street_spirit_ix', 'street_spirit_zutto']) assert.equal(d.folds.get(v), 'street_spirit', v);
    assert.equal(d.folds.get('proto_jellisac_mound'), 'jellisac_mound');
    assert.equal(d.folds.get('proto_firefly_hive'), 'firefly_hive');
    assert.equal(d.folds.get('proto_barnacle_pod'), 'barnacle_pod');
    assert.equal(d.folds.get('proto_furniture_tower_chassis'), 'furniture_tower_chassis');
    assert.equal(d.folds.get('conch_decoy'), 'conch');
    assert.equal(d.folds.get('teleporter_ground'), 'teleporter_visible');
    assert.equal(d.personFolds.get('npc_widget'), 'npc_quest_giver_widget');
    assert.equal(d.personFolds.get('npc_quest_widget'), 'npc_quest_giver_widget');
    // The Door of the new player tour stays its own page, named so.
    assert.ok(!d.folds.has('newxp_door'));
  });
});

describe('#505: name what only shares a name', () => {
  it('numbers an artifact\'s pieces and the SWFs, and gives the class Glitch paged the plain name', () => {
    const page = new Map([['furniture_door', pageFacts({ infopage: true })], ['newxp_door', pageFacts()]]);
    const pieces = [1, 2, 3, 4].map((n) => ({ id: `artifact_wooden_apple_piece${n}`, name: 'Piece of Wooden Apple' }));
    const doors = [{ id: 'furniture_door', name: 'Door' }, { id: 'newxp_door', name: 'Door' }];
    const out = disambiguate([...pieces, ...doors], (m, g) => itemQualifier(m, g, page));
    assert.equal(out.get('artifact_wooden_apple_piece2'), 'Piece of Wooden Apple (2 of 4)');
    assert.equal(out.get('newxp_door'), 'Door (new player tour)');
    assert.ok(!out.has('furniture_door'));
  });

  it('quests: reminisce copies, repeats and later parts in Glitch\'s own words', () => {
    const q = (id, name) => ({ section: 'quests', id, key: `quests:${id}`, name });
    const list = [
      q('mental_block', 'Mental Block'), q('mental_block_rem', 'Mental Block'),
      q('an_autumn_day', 'An Autumn Day'), q('an_autumn_day_part2', 'An Autumn Day'),
      q('tower_quest_part3', "Gwendolyn's Task III"), q('tower_quest_part3repeat', "Gwendolyn's Task III"),
      q('vendor_ping_pong_part1', 'Meet the Merchants'), q('vendor_ping_pong_part2', 'Meet the Merchants'),
      q('buy_bag', 'Enlarge Yer Slots'), q('buy_two_bags', 'Enlarge Yer Slots'),
    ];
    const out = disambiguate(list, (m, g) => entryQualifier(m, g, new Map()), (m) => m.key);
    assert.deepEqual(Object.fromEntries(out), {
      'quests:mental_block_rem': 'Mental Block (reminisce)',
      'quests:an_autumn_day_part2': 'An Autumn Day, part 2',
      'quests:tower_quest_part3repeat': "Gwendolyn's Task III (repeat)",
      'quests:vendor_ping_pong_part1': 'Meet the Merchants, part 1',
      'quests:vendor_ping_pong_part2': 'Meet the Merchants, part 2',
      'quests:buy_two_bags': 'Enlarge Yer Slots (two bags)',
    });
  });

  it('streets of one name: by region where the regions differ, else by the street a signpost leads to', { skip }, () => {
    const byName = (n) => [...d.entries.values()].filter((e) => e.section === 'streets' && e.name.startsWith(n)).map((e) => e.name).sort();
    assert.deepEqual(byName('Groddle Forest Junction'), ['Groddle Forest Junction (Groddle Forest)', 'Groddle Forest Junction (Old Groddle Forest)']);
    const bortola = byName('Bortola Start');
    assert.equal(bortola.length, 4);
    for (const n of bortola) assert.match(n, /^Bortola Start \(by [A-Z]/);
    assert.match(read('encyclopedia/streets/index.html'), /Bortola Start \(by Hauki Seeks\)/);
  });
});

describe('#505: the facts land on the page a player opens', () => {
  it('every item with streets lists them on its own page, which the index and search open; a folded class has none of its own', { skip }, () => {
    const listed = new Set(json('encyclopedia/items/data.json').items.map((i) => i.id));
    for (const it of d.items.values()) {
      if (!d.streetsWith(it.id).length || d.stubs.has(`item:${it.id}`)) continue;
      assert.ok(listed.has(it.id), `${it.id} has streets but no catalog card`);
      assert.ok(SEARCH.entries.some((e) => e.s === 'items' && e.id === it.id && e.h === pathOf(`item:${it.id}`)), `${it.id} has streets but no search row`);
      assert.match(read(`${pathOf(`item:${it.id}`)}index.html`), /ency-with-region/, `${it.id}: its page does not list its streets`);
    }
    for (const v of d.folds.keys()) assert.equal(d.streetsWith(v).length, 0, `${v} is folded but streets still count it`);
  });

  it('a folded variant\'s way to get it is on its thing\'s page (a rock\'s proto: Cultivate)', () => {
    assert.deepEqual(mergeWays([{ kind: 'other', text: 'Mined.' }], [{ kind: 'other', text: 'Found out in the world.' }, { kind: 'other', text: 'Placed in your home yard with Cultivate.' }]),
      [{ kind: 'other', text: 'Mined.' }, { kind: 'other', text: 'Placed in your home yard with Cultivate.' }]);
    assert.match(text(read('encyclopedia/items/rock_metal_1/index.html')), /How to get it.*Placed in your home yard with Cultivate/);
    assert.match(text(read('encyclopedia/items/jellisac_mound/index.html')), /How to get it.*Placed in your home yard with Cultivate/);
  });

  it('the Street Spirit: one item page with every region\'s talk, linked to its People page, which shows each region\'s look', () => {
    const item = text(read('encyclopedia/items/street_spirit/index.html'));
    assert.match(item, /The Firebog Street Spirit: browse goods/);
    assert.match(item, /The Uralia Street Spirit: the Uralia spirit rises/);
    assert.match(item, /People Street Spirit , who they are and where to meet them/);
    assert.match(item, /Where it is found .*Groddle Forest \d+/);
    const person = text(read('encyclopedia/people/street_spirit/index.html'));
    assert.match(person, /How it looks in other regions Street Spirit \(Firebog\) Street Spirit \(Groddle\) Street Spirit \(Ix\) Street Spirit \(Uralia\)/);
    assert.doesNotMatch(person, /Other shrines to this Giant/);
  });
});
