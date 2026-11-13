/**
 * The Map's other views (G471): GO buttons in the colour of the region they lead to (MapHubButton.as;
 * GSJS location.js get_map 2996), the world map (glitch-overlays/world_map.fla, HubMapDialog.as) and
 * the subway map (config_prod.js transit_instances map_pos, MapTransit.as), switched from the Map's
 * head. tools/map-views/build.mjs writes js/map-views-data.js and the world map's art from the sources.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_COLOURS, WORLD_MAP } from '../public/js/map-views-data.js?v=8e7d7094';
import { buildHubMapView, goColour, GO_FALLBACK_COLOUR, PUBLIC_HUBS, renderHubMapSvg } from '../public/js/map-graph.js?v=fb63e6de';
import { hubColours } from '../tools/map-views/build.mjs';
import { STATIONS } from '../public/js/subway.js?v=44d1a09f';
import {
  MAP_VIEW_TITLES,
  SUBWAY_PAPER,
  cubicAt,
  mapViewSubtitle,
  nearestStation,
  renderSubwayMapSvg,
  renderWorldMapSvg,
  subwayPaper,
  subwayPoints,
  subwaySegments,
  worldRegionList,
} from '../public/js/map-views.js?v=da2f063e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hub = (id) => JSON.parse(read(`public/assets/maps/hubs/hub-${id}.json`));
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
    assert.equal(MAP_VIEW_TITLES.world, 'World Map');
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

describe('subway map (map_pos, MapTransit.as)', () => {
  it('the line runs through the 12 stations at their map_pos, closed, in Red Line order', () => {
    const pts = subwayPoints();
    assert.equal(pts.length, 12);
    assert.deepEqual(pts[0], [475, 270], 'Groddle Forest Junction');
    const segs = subwaySegments(pts);
    assert.equal(segs.length, 12);
    for (let i = 0; i < segs.length; i++) {
      assert.deepEqual(segs[i][0], pts[i]);
      assert.deepEqual(segs[i][3], pts[(i + 1) % 12]);
    }
    const mid = cubicAt(segs[0], 0.5);
    assert.ok(mid.x < 475 && mid.x > 409 && mid.y < 270 && mid.y > 205, 'GFJ to Tallish Crest bows between them');
  });

  it('marks the station you are at, else your region\'s, else the nearest region\'s on the world map', () => {
    assert.deepEqual(nearestStation({ tsid: 'GLI32G3NUTD100I', hubId: '58' }), { station: STATIONS.find((s) => s.id === 3), how: 'here' });
    assert.equal(nearestStation({ tsid: 'GNOPE', hubId: '64' }).station.name, 'Tallish Crest');
    assert.equal(nearestStation({ tsid: 'GNOPE', hubId: '64' }).how, 'region');
    // Lida (105) has no station: the station whose region's centre lies nearest Lida's on the world map.
    const lida = nearestStation({ tsid: '', hubId: '105' });
    assert.equal(lida.how, 'near');
    const c = WORLD_MAP.regions['105'].centre;
    const d = (s) => Math.hypot(WORLD_MAP.regions[s.surfaceHubId].centre[0] - c[0], WORLD_MAP.regions[s.surfaceHubId].centre[1] - c[1]);
    assert.equal(lida.station, STATIONS.reduce((a, b) => (d(b) < d(a) ? b : a)));
    assert.equal(nearestStation({ tsid: '', hubId: '40' }), null, 'Naraka is on no world map');
  });

  it('draws 12 stops, the marker on yours, the two line buttons, arrows the way the line runs', () => {
    const here = nearestStation({ tsid: 'GLI3272LOTD1B1F', hubId: '56' });
    const red = renderSubwayMapSvg({ direction: 'forwards', here });
    assert.match(red, /^<svg viewBox="0 0 760 460"/);
    assert.equal((red.match(/<g class="subway-stop[ "]/g) || []).length, 12);
    assert.match(red, /<g class="subway-stop is-here" data-station="1" data-tsid="GLI3272LOTD1B1F" data-hub="56"/);
    assert.match(red, /class="map-you subway-you" href="assets\/sprites\/subway\/subway_map_current_station_red@2x.webp" x="460" y="255.5"/);
    assert.match(red, /<g class="subway-line-btn is-on" data-dir="forwards" tabindex="0" role="button" aria-pressed="true"/);
    assert.equal((red.match(/class="subway-arrow"/g) || []).length, 12);
    const blue = renderSubwayMapSvg({ direction: 'backwards', here });
    assert.match(blue, /subway_map_current_station_blue/);
    const ang = (svg) => Number(svg.match(/class="subway-arrow" d="[^"]*" transform="translate\([^)]*\) rotate\(([-\d.]+)\)/)[1]);
    assert.equal(Math.round(Math.abs(ang(blue) - ang(red))), 180);
    assert.doesNotMatch(renderSubwayMapSvg({ here: null }), /subway-you/);
  });

  it('draws the recreated paper over the sage and under the track, 760 x 460, never in the way of a click', () => {
    const svg = renderSubwayMapSvg({ here: null, paper: { href: SUBWAY_PAPER.x1, hi: SUBWAY_PAPER.x2, wait: false } });
    const img = svg.match(/<image class="subway-paper-art map-bg-soft"[^>]*\/>/)?.[0];
    assert.ok(img, 'the paper is drawn');
    assert.match(img, /href="assets\/maps\/art\/subway\/subway-map-paper\.webp" data-hi="assets\/maps\/art\/subway\/subway-map-paper@2x\.webp" x="0" y="0" width="760" height="460" preserveAspectRatio="none" pointer-events="none"/);
    // The sage rect stays under it (its colour while it loads), the track and every name over it.
    assert.ok(svg.indexOf('class="subway-paper"') < svg.indexOf(img));
    assert.ok(svg.indexOf(img) < svg.indexOf('class="subway-track"'));
    // Not ready: it starts hidden and fades in (js/map-bg-preload.js watchMapBg); a Retina file has no twin to swap in.
    const waiting = renderSubwayMapSvg({ paper: { href: SUBWAY_PAPER.x2, hi: SUBWAY_PAPER.x2, wait: true } });
    assert.match(waiting, /<image class="subway-paper-art map-bg-soft is-waiting" href="assets\/maps\/art\/subway\/subway-map-paper@2x\.webp" x="0"/);
    // The paper is keyed like the game's other art (js/data-urls.js does not see an SVG href in a string).
    const had = globalThis.groddleDataUrl;
    globalThis.groddleDataUrl = (u) => `${u}?v=k3`;
    try {
      assert.match(renderSubwayMapSvg({ paper: subwayPaper({ dpr: 1 }) }), /href="assets\/maps\/art\/subway\/subway-map-paper\.webp\?v=k3" data-hi="[^"]*@2x\.webp\?v=k3"/);
    } finally {
      if (had) globalThis.groddleDataUrl = had;
      else delete globalThis.groddleDataUrl;
    }
    // Its default: the Retina file on a Retina screen, as js/map-graph.js picks a region's painting.
    assert.deepEqual(subwayPaper({ dpr: 1 }), { href: SUBWAY_PAPER.x1, hi: SUBWAY_PAPER.x2, wait: false });
    assert.equal(subwayPaper({ dpr: 2 }).href, SUBWAY_PAPER.x2);
    assert.doesNotMatch(renderSubwayMapSvg({ paper: null }), /subway-paper-art/);
  });

  it('the paper is the file its provenance names: sizes, bytes, sha256, CC0 1.0 with its maker, prompt and inputs', () => {
    const prov = JSON.parse(read('tools/provenance/subway-map-paper.json'));
    const policy = JSON.parse(read('tools/builder/licence-policy.json'));
    assert.equal(prov.format, 'groddle-subway-map-paper/1');
    assert.equal(prov.replaces.name, 'subway_map_bg_59215.jpg');
    assert.match(read('public/js/subway-line.js'), /map_background_url: "http:\/\/c1\.glitch\.bz\/img\/maps\/subway_map_bg_59215\.jpg"/);
    const sha = (buf) => createHash('sha256').update(buf).digest('hex');
    const webpSize = (buf) => {
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
      if (chunk === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
      const b = buf.readUInt32LE(21);
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
    };
    for (const [d, size] of [['x1', [760, 460]], ['x2', [1520, 920]]]) {
      const r = prov[d];
      assert.equal(r.file, SUBWAY_PAPER[d], `${d}: the game draws the file the provenance names`);
      assert.deepEqual([r.w, r.h], size);
      const buf = readFileSync(join(root, 'public', r.file));
      assert.deepEqual(webpSize(buf), size, r.file);
      assert.equal(buf.length, r.bytes, r.file);
      assert.equal(sha(buf), r.sha256, `${r.file} is the file its provenance names`);
      assert.ok(buf.length < 120 * 1024, `${r.file} stays light`);
    }
    assert.deepEqual([SUBWAY_PAPER.w, SUBWAY_PAPER.h], [760, 460]);
    assert.equal(prov.licence, 'ai-generated');
    for (const k of policy.licences[prov.licence].requires.filter((k) => k !== 'sha256')) assert.ok(prov[k], k);
    for (const k of ['model', 'made', 'madeBy', 'inputs', 'source']) assert.ok(prov[k], k);
    assert.match(prov.tool, /GPT Image 2\.6 Sunburst in T3 Chat canvas/);
    assert.match(prov.madeBy, /Grok Bot, for Austin Ginder, who directed it/);
    assert.equal(prov.made, '2026-11-13');
    assert.ok(prov.prompt.length > 1500 && /^Recreate the paper background of the Subway System map/.test(prov.prompt), 'the prompt in full');
    assert.equal(prov.inputs.length, 5);
    for (const i of prov.inputs) {
      assert.ok(i.file && i.what && i.source, `input ${i.n}`);
      assert.match(i.sha256, /^[0-9a-f]{64}$/, `input ${i.n}`);
    }
    // 1 and 2 are our own layout drawings; 3 to 5 Tiny Speck's CC0 art, by source file.
    for (const i of prov.inputs.slice(0, 2)) assert.match(i.source, /^our own layout drawing/);
    for (const i of prov.inputs.slice(2)) assert.match(i.source, /^Tiny Speck, CC0: /);
    assert.match(prov.inputs[3].source, /world_map\.fla/);
    // The 2012 picture of the window is named as reference only, never as an input.
    for (const ref of prov.references) assert.match(ref, /reference only/);
    assert.match(prov.source.warp, /warp\.mjs/);
    assert.match(read('public/assets/maps/SOURCE.txt'), /Subway map paper \(G471, 2026-11-13\)/);
  });

  it('the quiet line says where you are and how to use it', () => {
    const here = nearestStation({ tsid: 'GNOPE', hubId: '64' });
    assert.match(mapViewSubtitle('subway', { here }), /^12 stations · Red Line · Nearest station: Tallish Crest \(Groddle Heights\) · click a station/);
    assert.match(mapViewSubtitle('world', { regions: worldRegionList(INDEX, PUBLIC_HUBS), touch: true }), /^47 regions · tap a region to see it, tap again to open its map/);
    assert.deepEqual(MAP_VIEW_TITLES, { world: 'World Map', subway: 'Subway System' });
  });
});

describe('the Map window offers the three views (HubMapDialog.as)', () => {
  const html = read('public/play/index.html');
  const game = read('public/game.js');

  it('its head holds the view buttons, in both pages', () => {
    for (const page of [html, read('public/play/online/index.html')]) {
      for (const v of ['hub', 'world', 'subway']) assert.match(page, new RegExp(`class="map-view-btn" data-map-view="${v}"`));
    }
  });

  it('openMap takes a view, a redraw keeps the one on show, and closing goes back to the region', () => {
    assert.match(game, /async function openMap\(hubId, \{ find = '', focus = '', view: pickedView = '' \} = \{\}\)/);
    assert.match(game, /const mapView = pickedView \|\| \(!hubId && !find && isMapOpen\(\) \? mapPanelView : 'hub'\);/);
    assert.match(game, /function closeMap\(\) \{[\s\S]*?mapPanelView = 'hub';/);
    // A station opens the street menu of its street above ground, a region opens its map.
    assert.match(game, /onStop: \(e, st\) => \{[\s\S]*?openMapStreetMenu\(canvas, e, street/);
    assert.match(game, /bindWorldMap\(canvas, \{ touch, onOpen: \(id\) => openMap\(id\), onPreview: /);
  });

  it('Classic draws them as the 2012 window\'s small grey buttons, in its own lane block', () => {
    const classic = read('public/css/classic.css');
    const block = classic.slice(classic.indexOf('/* === maps (lane) === */'), classic.indexOf('/* === end maps === */'));
    assert.ok(block.length > 100);
    assert.ok(classic.indexOf('/* === end maps === */') < classic.indexOf('/* == TICKETS =='));
    assert.match(block, /\.map-head \.map-views \{ order: -1;/);
  });
});

describe('GO buttons in the colour of the region they lead to (G471)', () => {
  it('HUB_COLOURS is GSJS maps_get_maps() colour per hub, with the "#" put back', () => {
    assert.deepEqual(HUB_COLOURS, hubColours());
    assert.equal(HUB_COLOURS['56'], '#5f721d', 'Groddle Forest');
    assert.equal(HUB_COLOURS['58'], '#1d3a80', 'Groddle Meadow');
    assert.equal(HUB_COLOURS['110'], '#a77e00', 'Massadoe ("a77e00" in the data)');
  });

  it('goColour: the exit\'s own colour, else the target hub\'s, else the client\'s #cc0000', () => {
    assert.equal(goColour({ hub_id: '58' }), '#1d3a80');
    assert.equal(goColour({ hubId: '114' }), '#954f18');
    assert.equal(goColour({ hub_id: '58', color: '00ff00' }), '#00ff00');
    assert.equal(goColour({ hub_id: 'nope' }), GO_FALLBACK_COLOUR);
  });

  it('every GO button on a public region map has its target\'s colour from the data', () => {
    let n = 0;
    for (const id of PUBLIC_HUBS) {
      let data;
      try { data = hub(id); } catch { continue; }
      for (const h of buildHubMapView(data, '', {}).hubs) {
        assert.equal(h.color, HUB_COLOURS[h.hubId], `${data.hubName} -> ${h.hubName}`);
        n++;
      }
    }
    assert.ok(n > 150, `${n} GO buttons`);
  });

  it('the drawn GO carries its colour, and the ring and its words take it (style.css)', () => {
    const view = buildHubMapView(hub('56'), '', {});
    const svg = renderHubMapSvg(view);
    assert.match(svg, /<g class="map-hub-go" data-hub="58" data-label="To: Groddle Meadow" style="--go-c: #1d3a80">/);
    assert.match(svg, /<g class="map-hub-go" data-hub="63" data-label="To: Shimla Mirch" style="--go-c: #545454">/);
    const style = read('public/style.css');
    assert.match(style, /\n\.map-go-ring \{\n  fill: var\(--go-c, var\(--c-green-58\)\);/);
    assert.match(style, /\n\.map-go-sub \{[^}]*fill: color-mix\(in srgb, var\(--go-c/);
  });
});
