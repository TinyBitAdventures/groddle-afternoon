/**
 * The Map's world view (G471): the world map (glitch-overlays/world_map.fla, HubMapDialog.as),
 * switched from the Map's head. tools/map-views/build.mjs writes js/map-views-data.js and the world map's art from the sources.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_MAP } from '../public/js/map-views-data.js?v=8e7d7094';
import { PUBLIC_HUBS } from '../public/js/map-graph.js?v=c161229d';
import {
  MAP_VIEW_TITLES,
  mapViewSubtitle,
  renderWorldMapSvg,
  worldRegionList,
} from '../public/js/map-views.js?v=0ccb4e50';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const INDEX = JSON.parse(read('public/assets/maps/index.json'));

describe('map views builder', () => {
  it('its outputs are up to date with the FLA and GSJS (--check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/map-views/build.mjs'), '--check'], { stdio: 'pipe' });
  });
});

describe('world map (world_map.fla)', () => {
  const ids = Object.keys(WORLD_MAP.regions);

  it('holds the FLA\'s 47 region clips, every one a public region, each inside the 760 x 460 frame', () => {
    assert.equal(ids.length, 47);
    for (const id of ids) {
      assert.ok(PUBLIC_HUBS.has(id), `region_${id} is a public hub`);
      const r = WORLD_MAP.regions[id];
      for (const [x, y] of r.quad) assert.ok(x >= 0 && x <= 760 && y >= 0 && y <= 460, `region_${id} ${x},${y}`);
      assert.ok(existsSync(join(root, 'public', r.card.href)), r.card.href);
    }
    // Groddle Isle as the FLA places it (DOMDocument FlashAICB: region_56 at 443.6, 269.5).
    assert.deepEqual(WORLD_MAP.regions['56'].centre, [479.67, 295.7]);
  });

  it('the charts are the FLA\'s two 760 x 460 JPEGs and the frames one vector file', () => {
    for (const rel of [WORLD_MAP.locked, WORLD_MAP.unlocked]) {
      const buf = readFileSync(join(root, 'public', rel));
      assert.equal(buf.readUInt16BE(0), 0xffd8, `${rel} is a JPEG`);
    }
    const frames = read(`public/${WORLD_MAP.frames}`);
    assert.match(frames, /^<svg [^>]*viewBox="0 0 760 460"/);
    assert.equal((frames.match(/<use /g) || []).length, 47 + 119, 'one frame a region (outlines) and the 119 locked tiles');
    assert.ok(frames.length < 80_000, `${frames.length} bytes`);
  });

  it('the quiet line says how to use it, and the title is the client\'s', () => {
    assert.match(mapViewSubtitle('world', { regions: worldRegionList(INDEX, PUBLIC_HUBS), touch: true }), /^47 regions · tap a region to see it, tap again to open its map/);
    assert.match(mapViewSubtitle('world', { regions: worldRegionList(INDEX, PUBLIC_HUBS) }), /^47 regions · click a region to open its map · red star = you$/);
    assert.deepEqual(MAP_VIEW_TITLES, { world: 'World Map' });
  });

  it('every region is open (a public region with streets), named from the map index', () => {
    const regions = worldRegionList(INDEX, PUBLIC_HUBS);
    assert.equal(regions.length, 47);
    assert.equal(regions.filter((r) => r.open).length, 47);
    assert.equal(regions.find((r) => r.hubId === '58').name, 'Groddle Meadow');
    assert.equal(worldRegionList(INDEX, new Set()).filter((r) => r.open).length, 0);
  });

  it('draws the locked chart, the painted one through a mask round the open regions, the frames, and you', () => {
    const regions = worldRegionList(INDEX, PUBLIC_HUBS);
    const svg = renderWorldMapSvg(regions, { youHubId: '56' });
    assert.match(svg, /^<svg viewBox="0 0 760 460"/);
    assert.match(svg, /class="world-chart world-chart-locked" href="assets\/maps\/art\/world\/world_map_locked.jpg"/);
    assert.match(svg, /class="world-chart world-chart-open" href="assets\/maps\/art\/world\/world_map_unlocked.jpg"[^>]*mask="url\(#world-reveal\)"/);
    const mask = svg.match(/<mask id="world-reveal"[\s\S]*?<\/mask>/)[0];
    assert.equal((mask.match(/<polygon /g) || []).length, 47);
    assert.equal((svg.match(/class="world-region is-open/g) || []).length, 47);
    assert.match(svg, /<g class="world-region is-open is-you" data-hub="56" data-label="Groddle Forest" tabindex="0" role="button"/);
    assert.match(svg, /<polygon class="map-you world-you" points="479.7,281.7 /);
    // A region the world map does not draw (The Seams, under the ground) has no star (showYouOnWorld).
    assert.doesNotMatch(renderWorldMapSvg(regions, { youHubId: '66' }), /world-you/);
  });
});

describe('the Map window offers the world view (HubMapDialog.as)', () => {
  const html = read('public/play/index.html');
  const game = read('public/game.js');

  it('its head holds the view buttons, in both pages', () => {
    for (const page of [html, read('public/play/online/index.html')]) {
      for (const v of ['hub', 'world']) assert.match(page, new RegExp(`class="map-view-btn" data-map-view="${v}"`));
    }
  });

  it('openMap takes a view, a redraw keeps the one on show, and closing goes back to the region', () => {
    assert.match(game, /async function openMap\(hubId, \{ find = '', focus = '', view: pickedView = '' \} = \{\}\)/);
    assert.match(game, /const mapView = pickedView \|\| \(!hubId && !find && isMapOpen\(\) \? mapPanelView : 'hub'\);/);
    assert.match(game, /function closeMap\(\) \{[\s\S]*?mapPanelView = 'hub';/);
    // A region opens its map.
    assert.match(game, /bindWorldMap\(canvas, \{ touch, onOpen: \(id\) => openMap\(id\) \}\)/);
  });

  it('Classic draws them as the 2012 window\'s small grey buttons, in its own lane block', () => {
    const classic = read('public/css/classic.css');
    const block = classic.slice(classic.indexOf('/* === maps (lane) === */'), classic.indexOf('/* === end maps === */'));
    assert.ok(block.length > 100);
    assert.ok(classic.indexOf('/* === end maps === */') < classic.indexOf('/* == TICKETS =='));
    assert.match(block, /\.map-head \.map-views \{ order: -1;/);
  });
});
