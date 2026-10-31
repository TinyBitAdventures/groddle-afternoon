/**
 * The hub map's street icons (Austin 2026-10-31: "The old map used to show which street had
 * which group"): the vendor, shrine and subway station icons the 2012 client drew beside each
 * street line (glitch-client MapHub.as drawStreet), their data on the hub map files
 * (tools/build-map-icons.mjs), their placement and render (js/map-graph.js), and their tips on
 * hover and keyboard focus in both skins (js/ui/map-icon-tips.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconFields, VENDOR_OVERRIDES } from '../tools/build-map-icons.mjs';
import {
  boxQuad,
  buildHubMapView,
  labelQuad,
  layoutStreetIcons,
  layoutStreetLabels,
  mapIconTip,
  MAP_ICON_ART,
  quadsOverlap,
  renderHubMapSvg,
  SUBWAY_ICON_NUDGE,
  youBox,
} from '../public/js/map-graph.js?v=fa3b2989';
import { mapIconStep, mapIconTipPlace } from '../public/js/ui/map-icon-tips.js?v=6b3eb3f9';
import { selectVendorProfile } from '../public/js/vendor.js?v=563afb9b';
import { CLASSIC_ART } from '../public/js/classic/classic-art.js?v=5745e669';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '..', 'glitch-GameServerJS');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hubDir = join(root, 'public/assets/maps/hubs');
const HUBS = readdirSync(hubDir).filter((f) => /^hub-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(hubDir, f), 'utf8')));
const hub = (id) => HUBS.find((h) => String(h.hubId) === String(id));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;

describe('map icon data (tools/build-map-icons.mjs)', () => {
  it('the hub files are current (node tools/build-map-icons.mjs --check)', { skip: !existsSync(join(GSJS, 'inc_data_mapextras_prod.js')) && 'no glitch-GameServerJS beside the game' }, () => {
    execFileSync(process.execPath, [join(root, 'tools/build-map-icons.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('every hub with the data has its icons: 883 vendors, 861 shrines, 12 subway stations', () => {
    const n = { store: 0, shrine: 0, has_subway: 0 };
    for (const h of HUBS) for (const s of h.streets || []) for (const k of Object.keys(n)) if (s[k]) n[k] += 1;
    assert.deepEqual(n, { store: 883, shrine: 861, has_subway: 12 });
    const withIcons = HUBS.filter((h) => (h.streets || []).some((s) => s.store || s.shrine || s.has_subway));
    assert.ok(withIcons.length >= 39, `${withIcons.length} hubs`);
    // The legacy Groddle Forest copy matches its hub file.
    assert.deepEqual(JSON.parse(read('public/assets/maps/hub-56-groddle-forest.json')), hub(56));
  });

  it('the fields are the client\'s (Street.as store, shrine, has_subway) on the right streets', () => {
    const find = (h, name) => hub(h).streets.find((s) => s.name === name);
    assert.deepEqual(
      (({ store, shrine, has_subway: sub }) => ({ store, shrine, sub }))(find(56, 'Groddle Forest Junction')),
      { store: 'Hardware', shrine: 'friendly', sub: true },
    );
    assert.equal(find(56, 'Hechey Track').store, 'Groceries', 'the remake vendor there sells Groceries');
    assert.equal(find(56, 'Hechey Track').shrine, 'mab');
    assert.equal(find(93, 'Thiruvan Thrive').has_subway, true);
    // The two shrines map_shrines leaves out but the remake builds (location XML "Shrine to Zille").
    assert.equal(find(28, 'Chad Gallows').shrine, 'zille');
    assert.equal(find(78, 'Ajaya Bliss').shrine, 'zille');
  });

  it('what the remake has decides: its shrine Giant, a vendor only where a street spirit stands', () => {
    const subway = new Set(['LSUB']);
    const ecology = {
      GAAA: { counts: { street_spirit: 1 }, giantId: 'cosma' },
      GBBB: { counts: { garden: 4 }, giantId: 'ti' },
    };
    const stores = { LAAA: 'Hardware', LBBB: 'Gardening Goods', LCCC: 'Toys' };
    assert.deepEqual(iconFields('LAAA', { stores, ecology, subway }), { store: 'Hardware', shrine: 'cosma' });
    assert.deepEqual(iconFields('LBBB', { stores, ecology, subway }), { shrine: 'ti' }, 'no street spirit, no vendor icon');
    assert.deepEqual(iconFields('LCCC', { stores, ecology, subway }), {}, 'no ecology row: the remake builds nothing there');
    assert.deepEqual(iconFields('LSUB', { stores, ecology, subway }), { has_subway: true });
  });

  it('the vendor overrides agree with js/vendor.js', () => {
    for (const [tsid, store] of Object.entries(VENDOR_OVERRIDES)) {
      assert.equal(selectVendorProfile(`G${tsid.slice(1)}`).label, `${store} Vendor`);
    }
  });

  it('the art is Tiny Speck\'s, listed in tools/classic-art/manifest.json', () => {
    const manifest = JSON.parse(read('tools/classic-art/manifest.json'));
    for (const name of ['map_icon_shop', 'map_icon_shrine', 'map_icon_subway']) {
      const row = manifest.copy.find((e) => e.name === name);
      assert.ok(row, name);
      assert.equal(row.src, `graphics/${name}.png`);
      assert.ok(existsSync(join(root, 'public', CLASSIC_ART[name].url)));
    }
    assert.equal(MAP_ICON_ART.store, CLASSIC_ART.map_icon_shop);
    assert.deepEqual([MAP_ICON_ART.store.w, MAP_ICON_ART.store.h], [14, 14]);
    assert.deepEqual([MAP_ICON_ART.subway.w, MAP_ICON_ART.subway.h], [24, 23]);
  });
});

describe('map icon placement and render (js/map-graph.js)', () => {
  it('tips read as the client\'s', () => {
    assert.equal(mapIconTip('store', 'Hardware'), 'Hardware Vendor');
    assert.equal(mapIconTip('store', 'animal Goods'), 'Animal Goods Vendor');
    assert.equal(mapIconTip('shrine', 'cosma'), 'Shrine to Cosma');
    assert.equal(mapIconTip('shrine', 'ti'), 'Shrine to Tii', 'Street.as: ti -> tii');
    assert.equal(mapIconTip('subway'), 'Subway Station');
  });

  it('sit where MapHub.as put them, turned with the street', () => {
    const street = { tsid: 'LX', name: 'X', x1: 100, y1: 100, x2: 200, y2: 100, mx: 150, my: 100, store: 'Toys', shrine: 'mab', hasSubway: true };
    const by = (icons) => Object.fromEntries(icons.map((i) => [i.kind, i]));
    const { store, shrine, subway } = by(layoutStreetIcons([street]));
    assert.deepEqual([store.lx, store.ly, store.rot], [2, 10, 0], 'vendor: right of the midpoint, below the line');
    assert.deepEqual([shrine.lx, shrine.ly], [-16, 10], 'shrine: left of it');
    assert.deepEqual([subway.lx, subway.ly], [-12, -30], 'subway: above, centred');
    assert.ok(![store, shrine, subway].some((i) => i.moved));
    assert.deepEqual(store.box, { x0: 152, y0: 110, x1: 166, y1: 124 });
    assert.ok(quadsOverlap(store.quad, boxQuad({ x0: 160, y0: 115, x1: 170, y1: 130 })));
    assert.ok(!quadsOverlap(store.quad, shrine.quad));
    const steep = by(layoutStreetIcons([{ ...street, x2: 100, y2: 200, mx: 100, my: 150 }]));
    assert.equal(Math.round(steep.store.rot), 90);
    assert.ok(steep.store.box.x1 < 100, 'below the line is to the left of a line going down');
    const nudged = layoutStreetIcons([{ ...street, tsid: 'LLI3272LOTD1B1F', store: '', shrine: '' }]);
    assert.equal(nudged[0].lx, -12 + SUBWAY_ICON_NUDGE.LLI3272LOTD1B1F);
    // A label in the way: the icon slides along its street, the label stays.
    const label = { name: 'Y', x: 165, y: 125, rot: 0, w: 30, h: 13, cls: 'map-label loaded' };
    const slid = by(layoutStreetIcons([street], { labels: [label] })).store;
    assert.ok(slid.moved);
    assert.equal(slid.ly, 10);
    assert.ok(!quadsOverlap(slid.quad, labelQuad(label.x, label.y, label.w, label.h, 0)));
  });

  it('never cover the you-are-here star, a label, a GO button or each other, on any hub', () => {
    let views = 0;
    let moved = 0;
    let total = 0;
    const clashes = [];
    for (const h of HUBS) {
      const here = (h.streets || []).filter((x) => x.store || x.shrine || x.has_subway).slice(0, 3);
      for (const at of ['', ...here.map((s) => `G${s.tsid.slice(1)}`)]) {
        const view = buildHubMapView(h, at, STREETS);
        const labels = layoutStreetLabels(view.streets, 760, 460);
        const icons = layoutStreetIcons(view.streets, { labels, hubs: view.hubs });
        views += 1;
        if (!at) { total += icons.length; moved += icons.filter((i) => i.moved).length; }
        const you = view.streets.find((x) => x.current);
        const star = you && boxQuad(youBox(you.mx, you.my));
        icons.forEach((ic, i) => {
          const where = `${h.hubName}${at ? ` at ${at}` : ''}: ${ic.streetName}'s ${ic.kind}`;
          if (star && quadsOverlap(ic.quad, star)) clashes.push(`${where} / star`);
          for (const l of labels) if (quadsOverlap(ic.quad, labelQuad(l.x, l.y, l.w, l.h, l.rot))) clashes.push(`${where} / ${l.name}`);
          for (const g of view.hubs) if (quadsOverlap(ic.quad, boxQuad({ x0: g.x - 22, y0: g.y - 22, x1: g.x + 22, y1: g.y + 22 }))) clashes.push(`${where} / GO`);
          for (const other of icons.slice(i + 1)) if (quadsOverlap(ic.quad, other.quad)) clashes.push(`${where} / ${other.streetName}`);
        });
      }
    }
    assert.ok(views > 150, `${views} views`);
    // One crowded corner of Ix (Onto Parada's shrine by Boan Stravenue's label, seen from Boan Stravenue) is the only one left.
    assert.ok(clashes.length <= 1, clashes.join('\n'));
    assert.ok(moved < total * 0.25, `${moved} of ${total} moved`);
  });

  it('the labels stay where they were (the icons find room around them)', () => {
    for (const [id, at] of [[56, 'GLI2V0UN7RD1T2J'], [93, 'GIFI9G70SV72H3C']]) {
      const view = buildHubMapView(hub(id), at, STREETS);
      const labels = layoutStreetLabels(view.streets, 760, 460);
      assert.equal(labels.length, view.streets.length, 'every street keeps its label');
      const svg = renderHubMapSvg(view);
      for (const l of labels) assert.ok(svg.includes(`x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}"`), l.name);
    }
  });

  it('render with their art, tips and one tab stop', () => {
    const view = buildHubMapView(hub(56), 'GLI2V0UN7RD1T2J', STREETS);
    const svg = renderHubMapSvg(view);
    const icons = svg.match(/<g class="map-icon map-icon-[a-z]+"[^>]*>/g) || [];
    assert.equal(icons.length, layoutStreetIcons(view.streets, { labels: layoutStreetLabels(view.streets), hubs: view.hubs }).length);
    assert.ok(icons.length > 20);
    assert.equal(icons.filter((g) => /tabindex="0"/.test(g)).length, 1);
    assert.match(svg, /role="group" aria-label="Groddle Forest street map"/);
    assert.match(svg, /data-tip="Groceries Vendor"[^>]*data-kind="store"/);
    assert.match(svg, /aria-label="Shrine to Mab, Hechey Track"/);
    assert.match(svg, /data-tip="Subway Station"/);
    assert.match(svg, new RegExp(`href="${CLASSIC_ART.map_icon_subway.url}"`));
    assert.match(svg, /<filter id="mapIconGlow"/);
    // The icons draw over the streets and labels, under the star.
    assert.ok(svg.indexOf('class="map-icons"') > svg.lastIndexOf('class="map-label'));
    assert.ok(svg.indexOf('class="map-icons"') < svg.indexOf('class="map-you"'));
    // A hub with no data draws none and stays one image.
    const bare = renderHubMapSvg(buildHubMapView({ hubId: '1', hubName: 'Bare', streets: [{ tsid: 'LQ', name: 'Q', x1: 0, y1: 0, x2: 10, y2: 0 }] }, '', STREETS));
    assert.doesNotMatch(bare, /map-icon/);
    assert.match(bare, /role="img"/);
  });
});

describe('map icon tips (js/ui/map-icon-tips.js)', () => {
  it('arrow keys, Home and End move between the icons', () => {
    assert.equal(mapIconStep('ArrowRight', 0, 3), 1);
    assert.equal(mapIconStep('ArrowDown', 2, 3), 0);
    assert.equal(mapIconStep('ArrowLeft', 0, 3), 2);
    assert.equal(mapIconStep('Home', 2, 3), 0);
    assert.equal(mapIconStep('End', 0, 3), 2);
    assert.equal(mapIconStep('Enter', 0, 3), -1);
    assert.equal(mapIconStep('ArrowRight', 0, 0), -1);
  });

  it('the tip sits above the icon inside the map, or under it at the top', () => {
    const canvas = { left: 100, top: 100, width: 600, height: 400 };
    const tip = { width: 120, height: 24 };
    assert.deepEqual(mapIconTipPlace({ left: 400, top: 300, width: 14, height: 14 }, canvas, tip), { left: 247, top: 170, below: false });
    assert.deepEqual(mapIconTipPlace({ left: 400, top: 110, width: 14, height: 14 }, canvas, tip), { left: 247, top: 30, below: true });
    assert.equal(mapIconTipPlace({ left: 102, top: 300, width: 14, height: 14 }, canvas, tip).left, 4);
    assert.equal(mapIconTipPlace({ left: 690, top: 300, width: 14, height: 14 }, canvas, tip).left, 476);
  });

  it('the Map wires them after each render, styled in both skins', () => {
    const game = read('public/game.js');
    assert.match(game, /canvas\.innerHTML = renderHubMapSvg\(view\);\n[^\n]*\n\s*bindMapIconTips\(canvas\);/);
    assert.match(read('public/style.css'), /\.map-icon-tip \{[\s\S]*?background: var\(--surface-card\)/);
    assert.match(read('public/style.css'), /\.map-icon:focus-visible \.map-icon-ring \{ stroke: var\(--focus\)/);
    assert.match(read('public/css/classic.css'), /#map-panel \.map-icon-tip \{[\s\S]*?background: var\(--c-classic-tip\)/);
    const tips = read('public/js/ui/map-icon-tips.js');
    for (const ev of ['pointerenter', 'pointerleave', 'focus', 'blur', 'keydown']) assert.match(tips, new RegExp(`'${ev}'`));
    assert.doesNotMatch(tips, /—/, 'no em dashes');
  });
});
