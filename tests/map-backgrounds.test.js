/**
 * Region map backgrounds (G471, round 5): each region's 150 x 91 thumbnail from Tiny Speck's CC0
 * world-map file (glitch-overlays/world_map.fla), upscaled and softened into a painting behind the
 * street lines (tools/map-backgrounds/build.mjs). The real 760 x 460 paintings are lost; the
 * Tribute Blog's region maps (reference only) were the look to match.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThumbs, regionThumbs } from '../tools/map-backgrounds/build.mjs';
import { HUB_MAP_BACKGROUNDS } from '../public/js/hub-map-backgrounds.js?v=5889d7fa';
import { buildHubMapView, PUBLIC_HUBS, renderHubMapSvg } from '../public/js/map-graph.js?v=99c13d35';
import { hubMapArtNote } from '../public/js/panel-copy.js?v=9fc1b2da';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const MANIFEST = JSON.parse(read('public/assets/maps/art/bg/backgrounds.json'));
const INDEX = JSON.parse(read('public/assets/maps/index.json'));
const hub = (id) => JSON.parse(read(`public/assets/maps/hubs/hub-${id}.json`));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;

/** WebP size from the VP8/VP8L/VP8X header. */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error(`webp chunk ${chunk}`);
}

describe('region map backgrounds (tools/map-backgrounds/build.mjs)', () => {
  it('--check: the manifest, the module and every file are current', () => {
    execFileSync(process.execPath, ['tools/map-backgrounds/build.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  });

  it('every public region with a thumbnail has a background, at 1x and 2x', () => {
    const regions = regionThumbs();
    assert.ok(Object.keys(regions).length >= 45, `${Object.keys(regions).length} regions`);
    for (const [id, { hubName }] of Object.entries(regions)) {
      const bg = HUB_MAP_BACKGROUNDS[id];
      assert.ok(bg, `${id} ${hubName} has a background`);
      for (const [rel, size] of [[bg.x1, [760, 460]], [bg.x2, [1520, 920]]]) {
        const p = join(root, 'public', rel);
        assert.ok(existsSync(p), rel);
        const buf = readFileSync(p);
        assert.deepEqual(webpSize(buf), size, rel);
        assert.ok(buf.length < 120 * 1024, `${rel} stays light (${buf.length} bytes)`);
      }
    }
    // Only regions: the test, tower and POL hubs that share a region's thumb keep the plain map.
    for (const id of Object.keys(HUB_MAP_BACKGROUNDS)) assert.ok(PUBLIC_HUBS.has(id), `${id} is a region`);
    for (const id of ['28', '77', '96', '70', '26']) assert.equal(HUB_MAP_BACKGROUNDS[id], undefined, id);
    for (const [id, name] of [['56', 'groddleforest'], ['58', 'groddlemeadow'], ['97', 'muufo'], ['101', 'aranna'], ['27', 'ix']]) {
      assert.match(HUB_MAP_BACKGROUNDS[id]?.x1 || '', new RegExp(`/${name}\\.webp$`), INDEX.hubs[id].hubName);
    }
  });

  it('provenance: each comes from its thumbnail in the CC0 world-map FLA, byte for byte', () => {
    const { thumbs, flaSha256 } = readThumbs();
    assert.equal(MANIFEST.source.fla, 'glitch-overlays/world_map.fla');
    assert.equal(MANIFEST.source.sha256, flaSha256);
    assert.match(MANIFEST.license, /CC0/);
    for (const [id, r] of Object.entries(MANIFEST.regions)) {
      const t = thumbs.get(r.symbol.replace(/^.*\//, ''));
      assert.ok(t, `${id} ${r.symbol}`);
      assert.equal(r.sha256, t.sha256);
      assert.equal(r.thumbMatches, true, `${r.thumb} is the FLA's ${r.symbol}`);
      assert.equal(INDEX.hubs[id].thumbLocal, r.thumb);
      assert.match(r.sourceFile, /sm_[a-z]+\.jpg$/);
    }
  });

  it('the map draws it under the streets, labels, GO buttons and star', () => {
    const view = buildHubMapView(hub(97), 'GA5101HF7F429V5', STREETS);
    assert.equal(view.bgSoft, HUB_MAP_BACKGROUNDS['97'].x1, 'the 1x file in Node (no devicePixelRatio)');
    const svg = renderHubMapSvg(view);
    const at = svg.indexOf('class="map-bg map-bg-soft"');
    assert.ok(at > 0);
    // MAPSIZE (ticket 76): with the Retina file beside it, for a 1x screen once the Map draws larger.
    assert.match(svg, /<image class="map-bg map-bg-soft" href="assets\/maps\/art\/bg\/muufo\.webp" data-hi="assets\/maps\/art\/bg\/muufo@2x\.webp" x="0" y="0" width="760" height="460" preserveAspectRatio="none"\/>/);
    for (const cls of ['class="map-seg', 'class="map-label', 'class="map-hub-go"', 'class="map-icons"']) {
      assert.ok(svg.indexOf(cls) > at, `${cls} draws on top`);
    }
    assert.doesNotMatch(svg, /map-terrain|map-hill|map-thumb/, 'no drawn terrain or corner thumb under it');
    // The pale unvisited street style would fade into a painting (no wash is drawn): every street
    // of a painted region is playable. A new map-only street there needs a contrast pass first.
    for (const id of Object.keys(HUB_MAP_BACKGROUNDS)) {
      const dim = buildHubMapView(hub(id), '', STREETS).streets.filter((s) => !s.loaded && !s.hidden);
      assert.deepEqual(dim.map((s) => s.name), [], `${id} ${INDEX.hubs[id].hubName}`);
    }
    assert.equal(hubMapArtNote(view), 'thumbnail painting');
  });

  it('Retina screens get the 2x file', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
    globalThis.devicePixelRatio = 2;
    try {
      const view = buildHubMapView(hub(101), '', STREETS);
      assert.equal(view.bgSoft, 'assets/maps/art/bg/aranna@2x.webp');
      assert.match(renderHubMapSvg(view), /href="assets\/maps\/art\/bg\/aranna@2x\.webp"/);
    } finally {
      if (had) Object.defineProperty(globalThis, 'devicePixelRatio', had);
      else delete globalThis.devicePixelRatio;
    }
  });

  it('the image URL gets its content key like the rest of the art', () => {
    const had = globalThis.groddleDataUrl;
    globalThis.groddleDataUrl = (u) => `${u}?v=abcd1234`;
    try {
      assert.match(renderHubMapSvg(buildHubMapView(hub(58), '', STREETS)), /href="assets\/maps\/art\/bg\/groddlemeadow\.webp\?v=abcd1234"/);
    } finally {
      if (had) globalThis.groddleDataUrl = had;
      else delete globalThis.groddleDataUrl;
    }
  });

  it('regions without one keep the drawn terrain', () => {
    for (const id of ['28', '77']) {
      const view = buildHubMapView(hub(id), '', STREETS);
      assert.equal(view.bgSoft, '');
      const svg = renderHubMapSvg(view);
      assert.match(svg, /class="map-terrain"/);
      assert.doesNotMatch(svg, /map-bg/);
      assert.equal(hubMapArtNote(view), 'geometry only');
    }
    // A builder zone (its own hub id) and a hub with no data.
    const bare = renderHubMapSvg(buildHubMapView({ hubId: 'zone-x', hubName: 'Bare', streets: [] }, '', STREETS));
    assert.match(bare, /class="map-terrain"/);
    // A recovered full painting would win over the thumbnail.
    const painted = buildHubMapView({ ...hub(97), bgLocal: 'assets/maps/art/muufo_bg.jpg' }, '', STREETS);
    assert.equal(painted.bgSoft, '');
    assert.match(renderHubMapSvg(painted), /<image class="map-bg" href="assets\/maps\/art\/muufo_bg\.jpg"/);
  });
});
