/**
 * The encyclopedia's Streets and Stores sections and the item pages' "Where to find it"
 * (tools/encyclopedia/streets.mjs, stores.mjs, where-to-find.mjs; Austin 2026-11-05):
 * a page for every street of the remake that belongs to a region, linked from that
 * region's page; each page's vendor, shrine, roads, closures and reachability as the game
 * itself works them out; one page per store with its stock, prices and streets; item pages
 * naming the stores that sell them and what gives them, with street counts that agree with
 * the other pages, each source once with how you get it; and the size of the whole section kept in check.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { loadEncyclopedia } from '../tools/encyclopedia/data.mjs';
import { pathOf } from '../tools/encyclopedia/parts.mjs';
import { waysFromStart } from '../tools/encyclopedia/streets.mjs';
import { GSJS_GIVER_HOW, sourcesOf } from '../tools/encyclopedia/where-to-find.mjs';
import { VENDOR_PROFILES, selectVendorProfile } from '../public/js/vendor.js?v=afdebbe1';
import { ecologyForStreet, populationForStreet } from '../public/js/street-ecology.js?v=08076876';
import { closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js?v=02a81cb3';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const skip = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const d = skip ? null : await loadEncyclopedia();
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const pageOf = (key) => read(`${pathOf(key)}index.html`);
const json = (rel) => JSON.parse(read(rel));
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const streets = () => [...d.entries.values()].filter((e) => e.section === 'streets');
const bySlug = (id) => d.entries.get(`streets:${id}`);

describe('encyclopedia streets', () => {
  it('has a page for every street of the remake but those that belong to no region, and says why those are left out', { skip }, () => {
    const index = json('assets/streets/index.json').streets;
    const kept = streets();
    assert.equal(kept.length + d.streetsLeftOut.length, Object.keys(index).length);
    assert.ok(kept.length > 1400, `${kept.length} street pages`);
    for (const x of d.streetsLeftOut) assert.ok(['no-region', 'no-hub', 'excluded'].includes(x.why), `${x.name}: ${x.why}`);
    // Only the old May 2010 new-player streets and the instanced quest and party places are left out.
    for (const x of d.streetsLeftOut.filter((y) => y.why === 'no-region')) assert.match(x.region, /New Start|Puzzles|Tower Quest|Simple Level Quests/, x.name);
    const dirs = readdirSync(join(pub, 'encyclopedia/streets'), { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    assert.deepEqual(dirs, kept.map((e) => e.id).sort());
    assert.match(read('encyclopedia/streets/index.html'), new RegExp(`${d.streetsLeftOut.length} more of the remake’s streets have no page`));
  });

  it('links every street of a region page to its own page, and lists the streets its map does not draw', { skip }, () => {
    let linked = 0;
    for (const place of [...d.entries.values()].filter((e) => e.section === 'places')) {
      const html = pageOf(place.key);
      for (const st of place.streets) {
        const k = d.streetKeyOf(st.tsid);
        if (!st.inRemake) continue;
        assert.ok(k, `${place.name}: ${st.name} has a page`);
        assert.ok(html.includes(`<a href="../../../${pathOf(k)}">`), `${place.name} links ${st.name}`);
        linked += 1;
      }
      for (const e of streets().filter((x) => x.street.place === place.key && !x.street.onMap)) assert.ok(html.includes(`href="../../../${pathOf(e.key)}"`), `${place.name} lists ${e.name}`);
      // And back: each street page names its region.
      for (const e of streets().filter((x) => x.street.place === place.key)) assert.ok(pageOf(e.key).includes(`/${pathOf(place.key)}`), `${e.name} links ${place.name}`);
    }
    assert.ok(linked > 1300, `${linked} links`);
  });

  it('puts the vendor and shrine there that the game does', { skip }, () => {
    const index = json('assets/streets/index.json');
    const eco = json('assets/content/street-ecology.json');
    let vendors = 0;
    for (const e of streets()) {
      const g = e.street.tsid;
      const pop = populationForStreet(g, ecologyForStreet(g, eco), { starter: g === index.default });
      const want = pop.vendor ? selectVendorProfile(g, '', { rocks: pop.rockClasses.length, store: index.streets[g].store }).key : null;
      assert.equal(e.street.store, want, e.name);
      assert.equal(e.street.giant, pop.giantId || null, e.name);
      if (want) {
        vendors += 1;
        assert.ok(pageOf(e.key).includes(`href="../../../encyclopedia/stores/${want}/"`), `${e.name} links its store`);
      }
    }
    assert.ok(vendors > 800, `${vendors} streets with a vendor`);
    // Giant ti is called Tii.
    const tii = streets().find((e) => e.street.giant === 'ti');
    assert.match(pageOf(tii.key), /Shrine to Tii</);
    const hechey = text(pageOf('streets:hechey-track'));
    assert.match(hechey, /Vendor Groceries Vendor/);
    assert.match(hechey, /Every new player starts here\./);
  });

  it('marks every street a new world keeps closed, names its board, and counts the projects on the way', { skip }, () => {
    const index = json('assets/streets/index.json');
    const jobs = json('assets/content/street-jobs.json');
    const state = normalizeStreetJobState({});
    initializeStreetJobs(state, [index.default]);
    const shut = new Set(closedStreets(state, jobs, { exemptFrom: [index.default] }));
    let closed = 0;
    for (const e of streets()) {
      const html = pageOf(e.key);
      const says = html.includes('this street is still to be built');
      assert.equal(says, shut.has(e.street.tsid), e.name);
      if (says) closed += 1;
    }
    assert.ok(closed > 600, `${closed} closed`);
    assert.match(text(pageOf('streets:empty-via-5')), /still to be built: its road stays closed until players finish its street project, offered on Plains Rte C \./);
    // Open from the start: the streets a new player can walk to, about 234 of them (Austin 2026-11-02).
    const open = streets().filter((e) => e.street.reach?.projects === 0).length;
    assert.ok(open > 200 && open < 300, `${open} open from the start`);
    // The 0-1 search: a closed street costs one and is entered only from its board.
    const way = waysFromStart({ graph: { A: ['B', 'C'], B: ['D'], C: ['D'] }, free: {}, shut: new Set(['B', 'C']), boards: { B: ['A'], C: ['X'] }, start: 'A' });
    assert.deepEqual(way.get('D'), { projects: 1, first: { street: 'B', board: 'A' } });
    assert.equal(way.has('C'), false);
  });

  it('shows the roads: signposts, doors with their keys and one-way drops; every door\'s key has a source now', { skip }, () => {
    const drop = text(pageOf('streets:the-other-drop'));
    assert.match(drop, /Coming in from Arjun Plunge , you cannot climb back to the signpost to Eastern Approach : that way only goes down\./);
    const bliss = text(pageOf('streets:ajaya-bliss'));
    assert.doesNotMatch(bliss, /nothing in the game gives one/, 'Dust Traps drop Key 9');
    assert.match(text(pageOf('streets:subarna-spells')), /Doors Ajaya Bliss key 9 /);
    assert.match(text(pageOf('streets:subarna-spells')), /A door with a key number needs that Door Key\./);
    for (const e of streets().slice(0, 300)) {
      const html = pageOf(e.key);
      for (const t of e.street.signposts) {
        const k = d.streetKeyOf(t);
        if (k) assert.ok(html.includes(`href="../../../${pathOf(k)}"`), `${e.name} -> ${d.entries.get(k).name}`);
      }
    }
  });

  it('links a street’s own music, its quests and its region’s Completist', { skip }, () => {
    const withMusic = streets().find((e) => e.street.music && e.street.music !== 'NO_MUSIC' && d.entries.has(`sounds:${e.street.music.toLowerCase()}`));
    assert.ok(pageOf(withMusic.key).includes(`/${pathOf(`sounds:${withMusic.street.music.toLowerCase()}`)}"`), withMusic.name);
    assert.ok(bySlug('ajaya-bliss').street.quests.includes('quests:sparkly_of_interest_3'));
    assert.ok(pageOf('streets:ajaya-bliss').includes('/encyclopedia/quests/sparkly_of_interest_3/'));
    assert.ok(pageOf('streets:hechey-track').includes('/encyclopedia/achievements/groddle_forest_completist/'));
  });

  it('shows Tiny Speck’s loading picture when the build has it, and the region map with the street drawn on it', { skip }, () => {
    const hechey = pageOf('streets:hechey-track');
    assert.match(hechey, /src="\.\.\/\.\.\/\.\.\/assets\/loading-strips\/GLI2V0UN7RD1T2J\.jpg/);
    assert.match(hechey, /<svg viewBox="0 0 760 460" aria-hidden="true">.*<line class="st-here" /);
    assert.ok(streets().filter((e) => e.street.strip).length >= 80);
  });

  it('stays light: no page styles of its own, one shared stylesheet, and a size budget', { skip }, () => {
    let total = 0;
    for (const e of streets()) {
      const html = pageOf(e.key);
      total += Buffer.byteLength(html);
      assert.ok(!/<style|style="/.test(html), `${e.name}: inline styles`);
      assert.ok(html.includes('<link rel="stylesheet" href="../../../encyclopedia/streets.css" />'), e.name);
    }
    const avg = total / streets().length;
    assert.ok(avg < 11000, `average street page ${Math.round(avg)} bytes`);
    assert.ok(total < 16e6, `street pages ${total} bytes`);
    assert.ok(statSync(join(pub, 'encyclopedia/streets/index.html')).size < 200e3);
  });
});

describe('encyclopedia stores', () => {
  it('has one page per store, with every offer at its price and every street that has one', { skip }, () => {
    const stores = [...d.entries.values()].filter((e) => e.section === 'stores');
    assert.deepEqual(stores.map((e) => e.id).sort(), Object.keys(VENDOR_PROFILES).sort());
    for (const e of stores) {
      const html = pageOf(e.key);
      for (const o of VENDOR_PROFILES[e.id].offers) {
        const re = new RegExp(`encyclopedia/items/${o.classTsid}/"[^]*?<span>${o.buyPrice.toLocaleString('en-US')} currants</span>`);
        if (d.items.has(o.classTsid)) assert.match(html, re, `${e.id}: ${o.classTsid}`);
      }
      const want = streets().filter((s) => s.street.store === e.id || s.street.npcStores.some((v) => v.store === e.id));
      assert.equal(e.shop.streets.length, want.length, e.id);
      for (const s of want) assert.ok(html.includes(`href="../../../${pathOf(s.key)}"`), `${e.id}: ${s.name}`);
      if (want.length) assert.match(text(html), new RegExp(`On ${want.length.toLocaleString('en-US')} streets? in \\d+ regions?\\.`), e.id);
    }
    // A store a vendor of its own keeps carries Tiny Speck's words for the vendor.
    assert.match(pageOf('stores:meals'), /Monsieur de Nomdenoms/);
  });
});

describe('item pages: Where to find it', () => {
  it('names the stores that sell an item, with the price and the streets that have one', { skip }, () => {
    const html = read('encyclopedia/items/garlic/index.html');
    const n = d.storeStreets('produce');
    assert.ok(n > 100);
    assert.match(html, /<h3>Where to find it<\/h3>/);
    assert.match(text(html), new RegExp(`Produce Vendor , 4 currants , on ${n} streets`));
    assert.ok(html.includes('href="../../../encyclopedia/stores/produce/"'));
  });

  it('names what gives a resource, linked, with the streets that have one', { skip }, () => {
    const cherry = read('encyclopedia/items/cherry/index.html');
    assert.ok(cherry.includes('href="../../../encyclopedia/items/trant_fruit/"'));
    assert.match(text(cherry), new RegExp(`Fruit Tree , harvest it, on ${d.streetsHaving('trant_fruit')} streets`));
    const meat = read('encyclopedia/items/meat/index.html');
    assert.match(text(meat), new RegExp(`Where to find it .*Piggy , nibble it, on ${d.streetsHaving('npc_piggy')} streets`));
    const paper = text(read('encyclopedia/items/paper/index.html'));
    assert.match(paper, /Dust Trap , sometimes when you walk into it, on \d+ streets/);
    assert.match(paper, /Paper Tree , harvest it, on \d+ streets/);
  });

  it('names every source once: one block, no source twice on any item page (Austin 2026-11-05)', { skip }, () => {
    // Before the fold, 8 item pages named the same animal under Where to find it and again
    // under "Creatures and people that give it" (Piggy on Meat, Chicken on Grain).
    const dir = join(pub, 'encyclopedia/items');
    let pages = 0;
    let blocks = 0;
    for (const id of readdirSync(dir)) {
      const f = join(dir, id, 'index.html');
      if (!existsSync(f)) continue;
      pages += 1;
      const ency = /<section class="band ency-band cat-ency"[\s\S]*?<\/section>/.exec(readFileSync(f, 'utf8'))?.[0];
      if (!ency) continue;
      assert.ok(!ency.includes('Creatures and people that give it'), `${id}: the old list is folded into Where to find it`);
      assert.ok((ency.match(/<h3>Where to find it<\/h3>/g) || []).length <= 1, `${id}: one Where to find it`);
      if (ency.includes('<h3>Where to find it</h3>')) blocks += 1;
      // Every cross-link block of the section (where to find it, quests, places, achievements, sounds): each page once.
      const hrefs = [...ency.matchAll(/href="([^"#]+)/g)].map((m) => m[1]);
      const twice = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
      assert.deepEqual(twice, [], `${id} links the same page twice in In the encyclopedia`);
    }
    assert.ok(pages > 900, `${pages} item pages`);
    assert.ok(blocks > 200, `${blocks} pages with Where to find it`);
  });

  it('folds in the creatures and people that give or sell it, with how you get it', { skip }, () => {
    const where = (id) => text(read(`encyclopedia/items/${id}/index.html`)).split('Where to find it')[1]?.split(/ (Quests|Where it is found|Achievements|Sounds|Verbs) /)[0] || '';
    // A person with a store of their own and no Stores page: the price and their streets.
    assert.match(where('fox_bait'), new RegExp(`Fox Ranger , 30 currants , on ${d.streetsHaving('npc_fox_ranger')} streets`));
    // Tiny Speck's own creatures and people, with the verb or conversation that gives it.
    assert.match(where('grain'), /Chicken , squeeze it, on \d+ streets.*Heli Kitty , squeeze it/);
    assert.match(where('crabato_juice'), /Crab , hug it/);
    assert.match(where('gem_diamond'), /Dust Trap , sometimes when you walk into it.*Smuggler , talk to them/);
    // A remake giver Tiny Speck's file also names keeps the remake's words, once.
    assert.match(where('boot'), /^ What gives it, how you get it, and how many streets have one\. Salmon , sometimes when you pocket it, on \d+ streets$/);
    // Not sources: the Batterfly's Milk verb gives nothing, the bartender only hands your own ticket back.
    assert.doesNotMatch(where('milk_butterfly'), /Batterfly/);
    assert.equal(where('drink_ticket'), '');
    // Every creature or person whose file gives an item has its way in our words, never a bare "gives it".
    for (const [key, backs] of d.back) {
      if (!key.startsWith('item:')) continue;
      for (const b of backs) {
        if (b.rel !== 'gives' || !/^(animals|people):/.test(b.from) || !d.entries.has(b.from)) continue;
        const cls = d.entries.get(b.from).id;
        // The remake's rules say how, or they sell it (the Fox Ranger).
        if ((d.givers.get(key.slice(5)) || []).some((g) => g.cls === cls) || sourcesOf(key.slice(5), d).some((x) => x.key === b.from && x.kind === 'seller')) continue;
        assert.ok(`${cls}>${key.slice(5)}` in GSJS_GIVER_HOW, `${b.from} gives ${key}: add how to GSJS_HOW`);
      }
    }
    for (const id of d.items.keys()) {
      const keys = sourcesOf(id, d).map((s) => s.key);
      assert.equal(new Set(keys).size, keys.length, id);
    }
  });

  it('is a part of its own, registered on the item page in one line', () => {
    const src = readFileSync(join(spike, 'tools/catalog/build.mjs'), 'utf8');
    assert.equal((src.match(/whereToFind\(/g) || []).length, 1);
  });
});
