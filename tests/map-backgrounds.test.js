/**
 * Region map backgrounds (G471, round 5): each region's 150 x 91 thumbnail from Tiny Speck's CC0
 * world-map file (glitch-overlays/world_map.fla), upscaled and softened into a painting behind the
 * street lines (tools/map-backgrounds/build.mjs). The real 760 x 460 paintings are lost; the
 * Tribute Blog's region maps (reference only) were the look to match.
 *
 * G522: a region in tools/provenance/repainted-maps.json carries a painting repainted for the
 * remake from its thumbnail instead (Groddle Meadow first, Austin 2026-11-05); the builder keeps it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThumbs, regionThumbs, repaints } from '../tools/map-backgrounds/build.mjs';
import { HUB_MAP_BACKGROUNDS } from '../public/js/hub-map-backgrounds.js?v=2b2d6468';
import { buildHubMapView, isPlaceholderMap, PLACEHOLDER_MAP_COLOURS, PUBLIC_HUBS, renderHubMapSvg } from '../public/js/map-graph.js?v=b404f57b';
import { hubMapArtNote } from '../public/js/panel-copy.js?v=3243b9b2';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';
import { MAP_ART_NOTE } from '../tools/encyclopedia/streets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const MANIFEST = JSON.parse(read('public/assets/maps/art/bg/backgrounds.json'));
const INDEX = JSON.parse(read('public/assets/maps/index.json'));
const hub = (id) => JSON.parse(read(`public/assets/maps/hubs/hub-${id}.json`));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;
const REPAINTS = JSON.parse(read('tools/provenance/repainted-maps.json'));
const POLICY = JSON.parse(read('tools/builder/licence-policy.json'));

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
        // A repaint has real detail: it may weigh more, still well under a street's art.
        const cap = bg.repainted ? 256 * 1024 : 120 * 1024;
        assert.ok(buf.length < cap, `${rel} stays light (${buf.length} bytes)`);
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

  it('a repainted region keeps its painting, at the right sizes, with its provenance (G522)', () => {
    assert.equal(REPAINTS.format, 'groddle-repainted-maps/1');
    const ids = Object.keys(REPAINTS.regions);
    assert.deepEqual(Object.keys(repaints()), ids);
    assert.ok(ids.includes('58'), 'Groddle Meadow is repainted');
    const regions = regionThumbs();
    const sha = (buf) => createHash('sha256').update(buf).digest('hex');
    const needs = POLICY.licences['ai-generated'].requires.filter((k) => !['sha256', 'intake'].includes(k));
    for (const id of ids) {
      const r = REPAINTS.regions[id];
      const name = `${id} ${r.hubName}`;
      assert.equal(regions[id]?.hubName, r.hubName, `${name} is a region with a thumbnail`);
      // The game, the build manifest and the provenance name the same two files.
      assert.equal(HUB_MAP_BACKGROUNDS[id].repainted, true, name);
      assert.equal(MANIFEST.regions[id].repainted, 'tools/provenance/repainted-maps.json', name);
      for (const [d, size] of [['x1', [760, 460]], ['x2', [1520, 920]]]) {
        assert.equal(r[d].file, HUB_MAP_BACKGROUNDS[id][d], `${name} ${d}`);
        assert.deepEqual([r[d].w, r[d].h], size, `${name} ${d}`);
        const buf = readFileSync(join(root, 'public', r[d].file));
        assert.deepEqual(webpSize(buf), size, r[d].file);
        assert.equal(buf.length, r[d].bytes, r[d].file);
        assert.equal(sha(buf), r[d].sha256, `${r[d].file} is the file its provenance names`);
        assert.equal(MANIFEST.regions[id][`${d}Sha256`], r[d].sha256, `${r[d].file} in backgrounds.json`);
      }
      // CC0 1.0 with its provenance: who and what made it, the full prompt, the inputs, who chose it.
      assert.equal(r.licence, 'ai-generated', name);
      assert.ok(POLICY.licences[r.licence], name);
      for (const k of [...needs, 'model', 'made', 'prompt', 'inputs', 'chosen']) assert.ok(r[k], `${name}: ${k}`);
      assert.match(r.made, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(r.prompt.length > 500, `${name}: the full prompt`);
      assert.ok(r.chosen.by && /^\d{4}-\d{2}-\d{2}$/.test(r.chosen.on), `${name}: who chose it and when`);
      assert.ok(r.inputs.length >= 1 && r.inputs.length <= POLICY.inputs.max, name);
      for (const i of r.inputs) {
        assert.ok(i.file && i.what && i.source, `${name}: input ${i.n}`);
        assert.match(i.sha256, /^[0-9a-f]{64}$/, `${name}: input ${i.n}`);
      }
      // Its own thumbnail is the first input, byte for byte.
      assert.equal(r.inputs[0].sha256, MANIFEST.regions[id].sha256, `${name}: input 1 is its thumbnail`);
      assert.match(r.source.toning, /^magick /, `${name}: the toning step`);
      // Player captures and footage are named as reference only, never as inputs.
      for (const i of r.inputs) assert.doesNotMatch(`${i.what} ${i.source}`, /wiki|footage|youtube|video|capture/i, `${name}: input ${i.n}`);
      for (const ref of r.references || []) assert.match(ref, /reference only/, name);
    }
    assert.match(read('public/assets/maps/SOURCE.txt'), /Repainted region maps \(G522/);
    // The map says so in its QA note, the restoration report and the encyclopedia in words.
    assert.equal(hubMapArtNote(buildHubMapView(hub(58), '', STREETS)), 'repainted painting');
    const blurb = CHECKLIST.find((c) => c.id === 'map').blurb;
    assert.match(blurb, /map paintings are lost, so each region’s map shows their small thumbnail of it, enlarged/);
    for (const id of ids) assert.ok(blurb.includes(`${REPAINTS.regions[id].hubName}’s`), `the report names ${REPAINTS.regions[id].hubName}`);
    assert.match(MAP_ART_NOTE.repainted, /repainted for the remake/);
    assert.match(MAP_ART_NOTE.thumbnail, /thumbnail of it, enlarged/);
    for (const note of [blurb, ...Object.values(MAP_ART_NOTE)]) assert.doesNotMatch(note, /—|Glitch/, 'player words: no em-dash, no trademark');
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
    assert.equal(hubMapArtNote(view), 'repainted painting');
    // A region still on its blown-up thumbnail, while any is left (G522).
    const soft = Object.keys(HUB_MAP_BACKGROUNDS).map((id) => buildHubMapView(hub(id), '', STREETS)).find((v) => v.bgSoft && !v.bgRepainted);
    if (soft) assert.equal(hubMapArtNote(soft), 'thumbnail painting');
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
    for (const id of ['77']) {
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

  it('G569: hubs whose source map was the lost placeholder draw its grey until we paint them', () => {
    assert.deepEqual({ ...PLACEHOLDER_MAP_COLOURS }, { top: '#8a9297', bottom: '#606669' });
    const ids = Object.keys(INDEX.hubs).filter((id) => isPlaceholderMap(hub(id).bg));
    assert.equal(ids.length, 40, 'the 40 hubs that shared map_fake_island_45490.jpg');
    for (const id of ids) {
      const data = hub(id);
      // The grey is the one the hub data records for that map.
      assert.equal(data.top_color, PLACEHOLDER_MAP_COLOURS.top, id);
      assert.equal(data.btm_color, PLACEHOLDER_MAP_COLOURS.bottom, id);
      const view = buildHubMapView(data, '', STREETS);
      const painted = Boolean(view.bgLocal || view.bgSoft);
      assert.equal(view.bgPlaceholder, !painted, `${id} ${data.hubName}`);
      if (painted) continue;
      const svg = renderHubMapSvg(view);
      assert.match(svg, /<rect class="map-terrain map-terrain-placeholder" [^>]*fill="url\(#hubPlaceholder\)"/, id);
      assert.match(svg, /<stop offset="0%" stop-color="#8a9297"\/><stop offset="100%" stop-color="#606669"\/>/, id);
      assert.doesNotMatch(svg, /map-hill|map-thumb|map-bg/, `${id}: no made-up hills or corner thumbnail`);
      assert.equal(hubMapArtNote(view), 'placeholder grey');
    }
    for (const name of ['Underground Puzzles', 'Abbasid', 'Old Groddle Forest', 'Party Locations', 'Homes', 'NewXP']) {
      assert.ok(ids.some((id) => hub(id).hubName === name), name);
    }
    // A painting of ours wins over the grey: a recovered one, or a region painting.
    const withArt = buildHubMapView({ ...hub(26), bgLocal: 'assets/maps/art/abbasid_bg.jpg' }, '', STREETS);
    assert.equal(withArt.bgPlaceholder, false);
    assert.doesNotMatch(renderHubMapSvg(withArt), /hubPlaceholder/);
    assert.equal(buildHubMapView(hub(97), '', STREETS).bgPlaceholder, false, 'a painted region');
    // A real map that was lost (Jethimadh Tower: Base) is not the placeholder.
    assert.equal(isPlaceholderMap(hub(77).bg), false);
    assert.equal(buildHubMapView(hub(77), '', STREETS).bgPlaceholder, false);
  });
});
