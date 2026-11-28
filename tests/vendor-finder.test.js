/**
 * G774 (report #351, Austin 2026-11-15: the vendor finder): the currants in the top bar open a
 * small panel of the vendors near you by what they sell, each row setting the nearest one as your
 * destination, as the favor panel's Giants find their Shrine (#258). Glitch's currants opened
 * nothing (YouDisplayManager.as 131-132); where vendors stand is Glitch's (map_stores, the
 * archived Street Spirits and vendor NPCs).
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VENDOR_FINDER_TEXT, vendorFinderRows, vendorKinds, vendorRowWhere } from '../public/js/vendor-finder.js?v=7fbfc51d';
import { vendorFinderFeature } from '../public/js/features/vendor-finder-feature.js?v=72feaac6';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=36fd044b';
import { findRoute } from '../public/js/map-routes.js?v=e9f5e3da';
import { streetGraph } from '../public/js/street-graph.js?v=16013e6e';
import { applyStreetIndex } from '../public/js/street-loader.js?v=23555e53';
import { selectVendorProfile } from '../public/js/vendor.js?v=7a07f478';

const PUB = new URL('../public/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, PUB), 'utf8');
const ecology = JSON.parse(read('assets/content/street-ecology.json'));
const index = JSON.parse(read('assets/streets/index.json'));
applyStreetIndex(index);

describe('G774: where each kind of vendor stands (js/vendor-finder.js vendorKinds)', () => {
  const kinds = vendorKinds(ecology, index);
  const byKey = Object.fromEntries(kinds.map((k) => [k.key, k]));

  it('every Street Spirit kind and every vendor NPC is listed, by its catalog_stores.js name', () => {
    for (const key of ['produce', 'hardware', 'gardening', 'kitchen', 'groceries', 'alchemical', 'animal', 'mining', 'toys']) {
      assert.ok(byKey[key]?.streets.length > 10, `${key} stands on many streets`);
    }
    assert.equal(byKey.hardware.label, 'Hardware Vendor');
    // The vendor NPCs (street-ecology.json vendors): Uncle Friendly, Helga, the Meal Vendor, the Sno Cone machine, the Tool Vendor, the scarecrow.
    assert.deepEqual(byKey.emporium.streets, ['GM4118MEHFDMM']);
    assert.deepEqual(byKey.liquor.streets, ['GM413RQ6LRG9N']);
    assert.ok(byKey.meals.streets.includes('GLI101QQRA211SM'));
    assert.ok(byKey.sno_cone.streets.includes('GM11E7ODKHO1QJE'));
    assert.deepEqual(byKey.tools.streets, ['GIF12PMQ5121D68', 'GLI1D2QFT571VQT']);
    assert.ok(byKey.gardening_tools.streets.length >= 5);
  });

  it('a street counts for a Street Spirit kind only when its spirit stands there (map_stores alone is not enough)', () => {
    const spiritless = Object.entries(index.streets).find(([t, v]) => v.store === 'hardware' && !(ecology.streets[t]?.counts?.street_spirit > 0));
    if (spiritless) assert.ok(!byKey.hardware.streets.includes(spiritless[0]));
    for (const t of byKey.hardware.streets.slice(0, 20)) assert.ok(ecology.streets[t]?.counts?.street_spirit > 0);
  });

  it('the starter street\'s Groceries Vendor is found, and each street\'s kind is the shop its vendor opens (vendor.js selectVendorProfile)', () => {
    assert.ok(byKey.groceries.streets.includes('GLI2V0UN7RD1T2J'));
    assert.ok(!byKey.produce.streets.includes('GLI2V0UN7RD1T2J'));
    for (const k of kinds) {
      if (['emporium', 'liquor', 'meals', 'sno_cone', 'tools'].includes(k.key)) continue;
      for (const t of k.streets) {
        if (ecology.vendors?.[t]) continue;
        assert.equal(selectVendorProfile(t, '', { store: index.streets[t]?.store }).key, k.key, t);
      }
    }
  });
});

describe('G774: the panel\'s rows (vendorFinderRows)', () => {
  const kinds = [
    { key: 'a', label: 'A Vendor', streets: ['G1', 'G2'] },
    { key: 'b', label: 'B Vendor', streets: ['G3'] },
    { key: 'c', label: 'C Vendor', streets: ['G4'] },
  ];
  const hops = { G2: 3, G3: 1 };
  const find = (streets) => {
    const t = streets.find((s) => hops[s] != null);
    return t ? { destination: t, hops: hops[t] } : null;
  };

  it('one on this street first, then nearest first, then the ones with no way yet', () => {
    const rows = vendorFinderRows(kinds, { here: 'L1', find });
    assert.deepEqual(rows.map((r) => [r.key, r.hops, r.here]), [['a', 0, true], ['b', 1, false], ['c', null, false]]);
    const away = vendorFinderRows(kinds, { here: 'G9', find });
    assert.deepEqual(away.map((r) => r.key), ['b', 'a', 'c']);
  });

  it('says Here, or the street and how far', () => {
    const label = (t) => `Street ${t}`;
    const [here, near, none] = vendorFinderRows(kinds, { here: 'G1', find });
    assert.equal(vendorRowWhere(here, label), 'Here');
    assert.equal(vendorRowWhere(near, label), 'Street G3 · 1 street');
    assert.equal(vendorRowWhere({ here: false, hops: 4, destination: 'G2' }, label), 'Street G2 · 4 streets');
    assert.equal(vendorRowWhere(none, label), 'No road there yet');
    // While the roads load (or at home) the Map can't tell yet: nothing is said.
    const [, , loading] = vendorFinderRows(kinds, { here: 'G1', find: (st) => (st.includes('G4') ? { unknown: true } : find(st)) });
    assert.equal(loading.unknown, true);
    assert.equal(vendorRowWhere(loading, label), '');
  });

  it('its words have no em dashes', () => {
    const kind = kinds[0];
    for (const line of [VENDOR_FINDER_TEXT.title, VENDOR_FINDER_TEXT.chipSub, VENDOR_FINDER_TEXT.rowTip('X'), VENDOR_FINDER_TEXT.found(kind, 'Somewhere'), VENDOR_FINDER_TEXT.hereLine(kind), VENDOR_FINDER_TEXT.none(kind), VENDOR_FINDER_TEXT.set(kind)]) {
      assert.doesNotMatch(line, /—/);
    }
    assert.equal(VENDOR_FINDER_TEXT.found({ label: "Helga's Liquor Store", streets: ['G1'] }, 'X'), "Helga's Liquor Store is in X. It is set as your destination.");
    assert.equal(VENDOR_FINDER_TEXT.found(kind, 'X'), 'The nearest A Vendor is in X. It is set as your destination.');
  });
});

describe('G774: the feature (features/vendor-finder-feature.js)', () => {
  afterEach(() => vendorFinderFeature._reset());

  function engine(over = {}) {
    const toasts = [];
    const log = [];
    const data = {};
    const asked = [];
    return {
      toasts, log, data, asked,
      streetTsid: 'GLI2V0UN7RD1T2J',
      toast: (t) => toasts.push(t),
      pushActivity: (t) => log.push(t),
      setData: (k, v) => { data[k] = v; },
      query: (name, action, opts) => {
        asked.push([name, action, opts]);
        if (action === 'find') return { destination: opts.to[0], hops: 2 };
        if (action === 'set') return { ok: true, route: { destination: opts.to[0] } };
        return null;
      },
      ...over,
    };
  }

  it('rows come from the street catalog, with where and a tip', () => {
    setStreetEcologyCatalog(ecology);
    const e = engine();
    const rows = vendorFinderFeature.vendorFinderRows(e);
    assert.ok(rows.length >= 14);
    assert.equal(rows[0].key, 'groceries', 'the starter street has its Groceries Vendor');
    assert.equal(rows[0].where, 'Here');
    assert.ok(rows.slice(1).every((r) => / · 2 streets$/.test(r.where)));
    assert.equal(rows[1].tip, VENDOR_FINDER_TEXT.rowTip(rows[1].label));
  });

  it('a row sets the nearest street with that vendor as your destination, the way the shrine finder does', () => {
    setStreetEcologyCatalog(ecology);
    const e = engine();
    const res = vendorFinderFeature.vendorFinderFind('liquor', e);
    assert.equal(res.ok, true);
    const set = e.asked.find(([, a]) => a === 'set');
    assert.deepEqual(set[2], { to: ['GM413RQ6LRG9N'], source: 'player' });
    assert.match(e.toasts[0], /^Helga's Liquor Store is in .+\. It is set as your destination\.$/);
    assert.equal(e.log[0], e.toasts[0]);
    assert.equal(e.data.vendorFinder, 'liquor@GM413RQ6LRG9N');
  });

  it('on a street with one it says so and sets nothing', () => {
    setStreetEcologyCatalog(ecology);
    const e = engine();
    const res = vendorFinderFeature.vendorFinderFind('groceries', e);
    assert.equal(res.here, true);
    assert.equal(e.asked.length, 0);
    assert.equal(e.toasts[0], 'The nearest Groceries Vendor is right here in your location!');
  });

  it('the Map\'s refusal (at home, no way there) is said as it is', () => {
    setStreetEcologyCatalog(ecology);
    const e = engine({ query: () => ({ ok: false, error: 'Leave your home first.' }) });
    vendorFinderFeature.vendorFinderFind('toys', e);
    assert.equal(e.toasts[0], 'Leave your home first.');
    assert.equal(e.data.vendorFinder, 'toys:Leave your home first.');
  });
});

describe('G774: the route skips a street under construction when an open one has the vendor (G780)', () => {
  it('findRoute: of several destinations an open one wins', () => {
    const graph = { A: ['B', 'C'], B: ['A', 'D'], C: ['A'], D: ['B'] };
    assert.deepEqual(findRoute(graph, 'A', ['C', 'D']), ['A', 'C']);
    assert.deepEqual(findRoute(streetGraph(graph, { closed: ['C'] }), 'A', ['C', 'D']), ['A', 'B', 'D']);
  });
});

describe('G774: wiring', () => {
  const game = read('game.js');
  const topbar = read('js/ui/topbar.js');
  const routes = read('js/features/map-routes-feature.js');
  const index = read('js/features/index.js');
  const style = read('style.css');
  const classic = read('css/classic.css');
  it('game.js hands the top bar the finder', () => {
    assert.match(game, /currants: \{ rows: \(\) => features\.query\('vendorFinderRows', engine\) \|\| \[\], find: \(key\) => features\.query\('vendorFinderFind', key, engine\) \}/);
    assert.match(index, /FEATURES\.push\(vendorFinderFeature\)/);
  });
  it('the currants become the panel\'s button, Enter and Space too', () => {
    assert.match(topbar, /function installCurrants\(doc, finder\)/);
    assert.match(topbar, /currantsPanel = installCurrants\(doc, opts\.currants\)/);
    assert.match(topbar, /chip\.setAttribute\('aria-controls', 'vendor-finder-pop'\)/);
  });
  it('the Map answers a find without setting a route', () => {
    assert.match(routes, /if \(action === 'find'\) return findNearest\(engine, opts \|\| \{\}\);/);
  });
  it('the bar lifts over the sheets while it is open, and Classic has its own look', () => {
    assert.match(style, /#favor-pop:not\(\[hidden\]\), #vendor-finder-pop:not\(\[hidden\]\)\)/);
    assert.match(classic, /:root\[data-ui="classic"\] \.top-bar #vendor-finder-pop \{/);
  });
});
