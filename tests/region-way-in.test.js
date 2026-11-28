/**
 * The way into a region whose map shows unbuilt roads (check 2026-11-25, root R11, a sibling of G801).
 * A player could not find a way into Xalanga for "To Xalanga, And Beyond": the quest names Xalanga
 * with a location link, Xalanga's map shows 38 of its 40 streets under construction, and the two
 * open ones are reached from Yellow Yawning in Moshi Moshi Oshilatis, which nothing pointed at.
 * Glitch opened the Map on a location link (TSLinkedTextField.as 141-162); here the link opens the
 * region on its way in from where you are, and the Map card names it with Show the way.
 * Run: node --test tests/region-way-in.test.js
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_TEXT, regionWayIn, subwayRides } from '../public/js/map-routes.js?v=52140ba2';
import { streetGraph } from '../public/js/street-graph.js?v=d767f3a2';
import { SUBWAY_STREETS, closedStreets, normalizeStreetJobState } from '../public/js/street-jobs.js?v=76471e42';
import { locationLinkTarget, renderQuestText } from '../public/js/quest-text.js?v=92213536';
import { mapRoutesFeature } from '../public/js/features/map-routes-feature.js?v=c7a6b235';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { applyStreetIndex } from '../public/js/street-loader.js?v=10376267';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const INDEX = json('public/assets/streets/index.json');
const GRAPH = json('public/assets/content/signpost-graph.json');
const CATALOG = json('public/assets/content/street-jobs.json');
const QUESTS = json('public/assets/content/quests.json');
const quests = QUESTS.quests || QUESTS;

const byLabel = (name, hub) => Object.keys(INDEX.streets).find((t) => INDEX.streets[t].label === name && (!hub || String(INDEX.streets[t].hubId) === hub));
const hubOf = (t) => String(INDEX.streets[String(t).replace(/^L/, 'G')]?.hubId || '');
const streetsOf = (hubId) => Object.keys(INDEX.streets).filter((t) => hubOf(t) === hubId);
const freshClosed = () => closedStreets(normalizeStreetJobState({ initialized: true }), CATALOG, {});
const RIDES = subwayRides(SUBWAY_STREETS);
const XALANGA = '95';
const HAZY_GATE_3 = byLabel('Hazy Gate 3', XALANGA);
const YELLOW_YAWNING = byLabel('Yellow Yawning');

describe('regionWayIn (js/map-routes.js)', () => {
  /* A - B - C, C - D, D - E: regions Home (A, B), Far (C, D, E); D is still being built. */
  const TOY = { GA: ['GB'], GB: ['GA', 'GC'], GC: ['GB', 'GD'], GD: ['GC', 'GE'], GE: ['GD'] };
  const HUB = { GA: '1', GB: '1', GC: '2', GD: '2', GE: '2' };
  const toyHub = (t) => HUB[t] || '';
  const far = ['GC', 'GD', 'GE'];

  it('names the region\'s nearest open street and the street before it, in another region', () => {
    const g = streetGraph(TOY, { closed: ['GD'] });
    const way = regionWayIn(g, { from: 'GA', hubId: '2', streets: far, hubOf: toyHub });
    assert.equal(way.entry, 'GC');
    assert.equal(way.before, 'GB');
    assert.deepEqual(way.path, ['GA', 'GB', 'GC']);
  });

  it('nothing when you are in the region, or when none of its streets is being built', () => {
    assert.equal(regionWayIn(streetGraph(TOY, { closed: ['GD'] }), { from: 'GC', hubId: '2', streets: far, hubOf: toyHub }), null);
    assert.equal(regionWayIn(streetGraph(TOY), { from: 'GA', hubId: '2', streets: far, hubOf: toyHub }), null);
  });

  it('no open road in: noRoad, so the Map offers the roads to build (G801)', () => {
    const g = streetGraph(TOY, { closed: ['GC'] });
    assert.deepEqual(regionWayIn(g, { from: 'GA', hubId: '2', streets: far, hubOf: toyHub }), { noRoad: true });
  });
});

describe('Xalanga over the real world (fresh save)', () => {
  const graph = streetGraph(GRAPH, { closed: freshClosed });

  it('the map shows unbuilt roads: only Hazy Gate 3 and Languid Line S are open', () => {
    const shut = new Set(freshClosed().map((t) => t.replace(/^L/, 'G')));
    const open = streetsOf(XALANGA).filter((t) => !shut.has(t)).map((t) => INDEX.streets[t].label).sort();
    assert.deepEqual(open, ['Hazy Gate 3', 'Languid Line S']);
  });

  it('from the starter street the way in is Hazy Gate 3, from Yellow Yawning', () => {
    const way = regionWayIn(graph, { from: INDEX.default, hubId: XALANGA, streets: streetsOf(XALANGA), hubOf, rides: RIDES });
    assert.ok(way?.entry, 'a way in');
    assert.equal(way.entry, HAZY_GATE_3);
    assert.equal(way.before, YELLOW_YAWNING);
    assert.notEqual(hubOf(way.before), XALANGA);
  });

  it('every region a quest links to that is partly built gets the same treatment', () => {
    const hubs = new Set();
    for (const q of Object.values(quests)) {
      for (const m of JSON.stringify(q).matchAll(/event:location\|(\d+)/g)) hubs.add(m[1]);
    }
    assert.ok(hubs.has(XALANGA));
    const shut = new Set(freshClosed().map((t) => t.replace(/^L/, 'G')));
    const got = { way: [], none: [] };
    for (const hub of hubs) {
      const streets = streetsOf(hub);
      const partly = streets.some((t) => shut.has(t));
      const way = regionWayIn(graph, { from: INDEX.default, hubId: hub, streets, hubOf, rides: RIDES });
      if (hubOf(INDEX.default) === hub || !partly) {
        assert.equal(way, null, `hub ${hub}: you are there, or every way in shows`);
        continue;
      }
      if (way?.entry) {
        assert.equal(hubOf(way.entry), hub, `hub ${hub}: the way in is one of its streets`);
        assert.ok(!shut.has(way.entry), `hub ${hub}: the way in is open`);
        assert.ok(way.before && hubOf(way.before) !== hub, `hub ${hub}: reached from another region`);
        got.way.push(hub);
      } else if (way?.noRoad) got.none.push(hub);
    }
    assert.ok(got.way.length >= 8, `regions with a way in named: ${got.way.join(', ')}`);
    assert.ok(got.none.length >= 3, `regions with only roads to build: ${got.none.join(', ')}`);
  });
});

describe('the quest link opens the way in', () => {
  it('a location link is read as Glitch read it (TSLinkedTextField.as 141-162)', () => {
    assert.deepEqual(locationLinkTarget('location|95'), { hubId: '95', tsid: '' });
    assert.deepEqual(locationLinkTarget('location|40#LA5RPAFK9OE28GN'), { hubId: '40', tsid: 'GA5RPAFK9OE28GN' });
    assert.deepEqual(locationLinkTarget('location|map'), { map: true });
    assert.deepEqual(locationLinkTarget({ kind: 'location', id: '95' }), { hubId: '95', tsid: '' });
    assert.equal(locationLinkTarget('item|fox_brush'), null);
    assert.equal(locationLinkTarget({ kind: 'item', id: 'fox_brush' }), null);
  });

  it('the Xalanga quest\'s place link can be pressed; an item name stays text', () => {
    const made = [];
    const doc = {
      createElement: (tag) => {
        const n = { tagName: tag.toUpperCase(), children: [], attrs: {}, className: '', appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, set textContent(v) { this.children = []; } };
        made.push(n);
        return n;
      },
      createTextNode: (text) => ({ nodeType: 3, text }),
    };
    const el = doc.createElement('div');
    el.ownerDocument = doc;
    renderQuestText(el, `${quests.teleportation_teleport_to_region.desc} <a href="event:item|fox_brush">Fox Brush</a>`);
    const links = made.filter((n) => n.className === 'q-link');
    const place = links.find((n) => n.attrs['data-quest-link'] === 'location|95');
    assert.ok(place, 'the Xalanga link');
    assert.equal(place.attrs.role, 'link');
    assert.equal(place.attrs.tabindex, '0');
    const item = links.find((n) => n.attrs['data-quest-link'] === 'item|fox_brush');
    assert.equal(item.attrs.role, undefined);
  });

  describe('the Map (features/map-routes-feature.js)', () => {
    const closed = freshClosed();
    const fakeEngine = (streetTsid) => {
      const data = {};
      let host = null;
      const engine = {
        started: true,
        pc: { level: 5 },
        inv: {},
        unlockedAchievements: [],
        streetTsid,
        street: { tsid: streetTsid, hubId: hubOf(streetTsid), signposts: [] },
        player: { x: 0, y: 0 },
        data,
        setData: (k, v) => { data[k] = v; },
        homeContext: () => ({ inHome: false }),
        transientInstance: () => false,
        save() {},
        query: (hook, ...args) => (hook === 'closedRoads' ? closed : host.query(hook, ...args)),
      };
      host = createFeatureHost([mapRoutesFeature]);
      return engine;
    };
    before(() => applyStreetIndex(INDEX));
    beforeEach(() => {
      mapRoutesFeature._reset();
      mapRoutesFeature._setGraph(GRAPH);
    });

    it('wayIn from the starter street: Hazy Gate 3, from Yellow Yawning', () => {
      const engine = fakeEngine(INDEX.default);
      const way = engine.query('mapRoute', 'wayIn', { hubId: XALANGA }, engine);
      assert.equal(way?.entry, HAZY_GATE_3);
      assert.equal(way?.before, YELLOW_YAWNING);
    });

    it('without papers, a region only the subway gets into still names the subway (R24)', () => {
      const engine = fakeEngine(INDEX.default);
      const heights = engine.query('mapRoute', 'wayIn', { hubId: '64' }, engine);
      assert.equal(hubOf(heights?.entry), '64', 'Groddle Heights has a way in');
      assert.equal(INDEX.streets[heights.before]?.label, 'Groddle Forest Junction');
    });

    it('wayIn is nothing in Xalanga itself', () => {
      const engine = fakeEngine(HAZY_GATE_3);
      assert.equal(engine.query('mapRoute', 'wayIn', { hubId: XALANGA }, engine), null);
    });

    it('the card names the way in and offers Show the way; a region no open road reaches offers Roads to build', () => {
      const src = read('public/js/features/map-routes-feature.js');
      assert.match(src, /const wayText = way\?\.entry \? wayInLine\(engine, way\) :/);
      assert.match(src, /if \(wayText && !r && !quest\) lines\.splice\(0, lines\.length, wayText\);/);
      assert.match(src, /button\('Show the way', \(\) => \{\n\s+const res = setRoute\(engine, \{ to, source: 'player' \}\)/);
      assert.match(src, /button\('Roads to build', \(\) => engine\.query\?\.\('projectsPanel', 'ahead', engine, `h:\$\{hub\}`\)\)/);
      assert.equal(ROUTE_TEXT.wayIn, 'The way in: ');
      assert.match(read('public/js/features/street-jobs-feature.js'), /pj\.aheadTo = to\.startsWith\('h:'\) \? to :/);
    });
  });

  it('game.js: pressing a place link opens the Map on the region, on its way in', () => {
    const game = read('public/game.js');
    assert.match(game, /const way = target\.tsid \? null : features\.query\('mapRoute', 'wayIn', \{ hubId: target\.hubId \}, engine\);\n\s+const find = target\.tsid \|\| way\?\.entry \|\| '';/);
    assert.match(game, /openMap\(target\.hubId, find \? \{ find \} : \{\}\);/);
    assert.match(game, /document\.addEventListener\('click', \(e\) => \{\n\s+const el = questLinkAt\(e\);\n\s+if \(!el \|\| !openLocationLink\(el\.getAttribute\('data-quest-link'\)\)\) return;/);
    assert.match(game, /closest\?\.\('\[data-quest-link\^="location"\]'\)/);
  });
});
